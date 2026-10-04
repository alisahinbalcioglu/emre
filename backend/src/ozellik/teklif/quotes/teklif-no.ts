/**
 * TEKLIF NUMARASI — `MP-<yil>-<sira>` (T10: ILK disa aktarimda atanir, sonra SABIT).
 *
 * Kural tek yerde. Eskiden `quotes.service.exportXlsx` numarayi "firmadaki
 * numarali teklif SAYISI + 1" ile uretip dosya uretildikten SONRA yaziyordu:
 *  · ayni firmada iki kisi ayni anda ilk ciktiyi alirsa ikisi AYNI numarayi
 *    alirdi (sayim ikisinde de ayni);
 *  · 001/002/003 varken 001 silinince sayac 2'ye duser, yeni teklif VAR OLAN
 *    003'u alirdi — yaris olmadan da tekrar;
 *  · sayac yila gore suzulmuyordu: 2027'nin ilk teklifi MP-2027-004 olurdu.
 *
 * Simdi: firma basina danisma kilidi (`teklif-no:<firmaId>`) icinde teklif
 * YENIDEN okunur, o yilin onekli numaralarinin sayisal EN BUYUGU + 1 alinir ve
 * teklife yazilir. Kilit yalniz bu kisa islemde tutulur; dosya uretimi kilit
 * DISINDADIR. Son savunma semada: `@@unique([firmaId, quoteNo])`
 * (goc `20260930180000_teklif_no_tekilligi`).
 *
 * Bilinen sinir: yalniz EN SON numarali teklif silinirse numarasi bir kez daha
 * verilebilir (en buyuk + 1). Hic tekrar istenmezse firma basina sayac tablosu
 * gerekir.
 */
import { NotFoundException } from '@nestjs/common';

export const TEKLIF_NO_BICIMI = /^MP-(\d{4})-(\d{3,})$/;

/**
 * Saf: mevcut numaralardan o yilin siradaki numarasi. Bicim disi numara ve
 * baska yilin numarasi sayilmaz.
 */
export function sonrakiTeklifNo(
  mevcutlar: readonly (string | null | undefined)[],
  yil: number,
): string {
  let enBuyuk = 0;
  for (const no of mevcutlar) {
    const m = TEKLIF_NO_BICIMI.exec(no ?? '');
    if (!m || Number(m[1]) !== yil) continue;
    const sira = Number(m[2]);
    if (sira > enBuyuk) enBuyuk = sira;
  }
  return `MP-${yil}-${String(enBuyuk + 1).padStart(3, '0')}`;
}

/** `teklifNoAta`nin ihtiyac duydugu en dar Prisma yuzeyi. */
export type TeklifNoPrisma = {
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
};

/**
 * Teklife numara verir (zaten varsa onu dondurur). Cagiran teklifin firmaya
 * ait oldugunu ONCEDEN dogrulamis olmalidir (`quoteGetir` + `teklifKosulu`).
 */
export async function teklifNoAta(
  prisma: TeklifNoPrisma,
  firmaId: string,
  quoteId: string,
  yil: number,
): Promise<string> {
  return prisma.$transaction(async (tx: any) => {
    // Bicim `firmaKilitliIslem` (uyelik-kurallari.ts) ile BIREBIR: `::text`
    // sart (`void` donen $queryRaw Prisma'da cozulemez). Onek AYRI: uyelik
    // kilidiyle paylasilsaydi davet kabulu ile cikti birbirini beklerdi.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`teklif-no:${firmaId}`}))::text AS kilit`;
    // Ayni teklifin es zamanli ikinci ciktisi: numara biz kilidi beklerken
    // atanmis olabilir — kilitten SONRA yeniden okunur. ⚠ READ COMMITTED
    // varsayimi (Prisma/PostgreSQL varsayilani): her deyim yeni anlik goruntu
    // alir, kilidi birakan islemin yazimi gorunur. REPEATABLE READ'de goruntu
    // kilit deyiminde alinir, bu okuma onu GORMEZ ve tekil indeks P2002 verir.
    const teklif = await tx.quote.findFirst({
      where: { id: quoteId, firmaId },
      select: { quoteNo: true },
    });
    // Teklif bu arada silindi: anlamsiz P2025 (500) yerine 404.
    if (!teklif) throw new NotFoundException('Quote not found');
    if (teklif.quoteNo) return teklif.quoteNo as string;
    const onekli: { quoteNo: string | null }[] = await tx.quote.findMany({
      where: { firmaId, quoteNo: { startsWith: `MP-${yil}-` } },
      select: { quoteNo: true },
    });
    const quoteNo = sonrakiTeklifNo(onekli.map((q) => q.quoteNo), yil);
    await tx.quote.update({ where: { id: quoteId }, data: { quoteNo } });
    return quoteNo;
  });
}
