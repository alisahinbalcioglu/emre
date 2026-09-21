/**
 * PAKET SEVIYESI — TEK KAYNAK (Faz 7 · 2.12, 17.09.2026).
 *
 * ⚠ OLCULEN KUSUR (Faz 2, 07.09): yetki iki yerden okunuyordu — `User.tier`
 * ve firmanin `Abonelik`i — ve `TierGuard` YUKSEK olani aliyordu. `User.tier`i
 * hicbir odeme yolu YAZMIYOR (olculdu: `ozellik/odeme` altinda sifir
 * `user.update({ data: { tier } })`); tek yazan yer yonetici panelinin elle
 * degistirdigi uctu. Yani seviye, satin almayla degil elle dagitilan bir
 * alandan geliyordu ve iptal/dusurme hicbir zaman ERISIMI DARALTMIYORDU.
 *
 * Artik yetki YALNIZ abonelikten gelir. `User.tier` kolonu SILINMEZ (KVKK disa
 * aktarimi saklanan degeri aynen verir, `hesap.servisi.ts`) ama YETKI KAYNAGI
 * olmaktan cikar.
 *
 * ── 2.13 (22.09.2026): SEVIYE ARTIK ERISIM KARARINDAN SUZULUR ───────────
 * ESKI HAL ve NEDEN CURUDU: burada "seviye ile saglik ayri eksenlerdir,
 * sagligi `ErisimGuard` olcer" yaziyordu. O savunma ancak `@RequireTier`
 * tasiyan HER ucun ayni zamanda `@GerekliYetenek` tasimasi kosuluyla
 * gecerliydi ve bu kosulu HICBIR KAPI korumuyordu: yarin paket kapisi
 * konan, yetenek dekoratoru unutulan bir uc, aboneligi SONA ERMIS firmaya
 * acik olurdu — cunku `TierGuard`in okudugu seviye hala 'pro' donerdi.
 * (Olculdu 22.09: bugun 200 ucun 3'u `@RequireTier` tasiyor ve ucu de
 * `@GerekliYetenek` tasiyor, yani BUGUN somut acik yok; kapatilan sey
 * KAPININ KENDISININ fail-open olmasiydi.)
 *
 * ⚠ OLCUT HAM `durum` DEGIL, ERISIM KARARIDIR (`abonelik-erisim.ts`).
 * `durum = 'AKTIF'` diye daraltmak iptal eden musteriyi odedigi donemin
 * ortasinda keserdi; `IPTAL` dali odenmis donem bitene kadar erisim verir.
 * Ayni cekirdegi `ErisimServisi.karar` ve `capabilities.helper.ts` de okur —
 * ikiz kural YOK.
 */

import { abonelikErisimi } from './abonelik-erisim';

/**
 * Seviye siralamasi: Core < Pro < Suite.
 *
 * ⚠ `suite` BUGUN Prisma `PackageLevel` enum'unda YOK (olculdu, 17.09:
 * `schema.prisma` `enum PackageLevel { core pro }`). Burada yine de tanimli:
 * harita `Record<string, number>` oldugu icin enum'a bagli degil ve Blok 2
 * `suite`i actiginda bu dosyaya donmek gerekmesin. Bilinmeyen deger 0'dir —
 * yani hicbir kapiyi acmaz (fail-closed).
 */
export const SEVIYE_SIRASI: Record<string, number> = { core: 1, pro: 2, suite: 3 };

/** Seviye kodunun sira degeri. Bilinmeyen ya da yok → 0 (hicbir kapi acilmaz). */
export function seviyeSirasi(seviye: string | null | undefined): number {
  if (!seviye) return 0;
  return SEVIYE_SIRASI[seviye] ?? 0;
}

/**
 * MUSTERIYE GORUNEN AD (Emre karari, 15.09 · R1/E-5).
 *
 * Teknik enum `core` DEGISMEZ (SQL'ler, `SEVIYE_SIRASI`, API yanitlari,
 * localStorage). Degisen yalnizca EKRANA/METNE giden ad: musteri "CORE"
 * diye bir sey satin almadi, "Basic" satin aldi. On yuzdeki ikizi
 * `frontend/ozellik/odeme/paket-bicim.ts` `SEVIYE_AD`.
 */
export const SEVIYE_GORUNEN_AD: Record<string, string> = {
  core: 'Basic',
  pro: 'Pro',
  suite: 'Suite',
};

/** Kodun musteriye gosterilen adi. Taninmayan kod AYNEN doner — sessizce
 *  "Basic" demez (yanlis ad, yanlis paket satin aldirir). */
export function seviyeGorunenAd(seviye: string | null | undefined): string {
  if (!seviye) return '';
  return SEVIYE_GORUNEN_AD[seviye] ?? seviye;
}

/** `firmaPaketDurumu`nun ihtiyac duydugu en dar Prisma yuzeyi. Testler
 *  gercek `PrismaService` kurmadan sahte bir nesne verebilsin diye yapisal. */
export type SeviyePrisma = {
  abonelik: {
    findUnique: (args: unknown) => Promise<unknown>;
  };
};

export interface PaketDurumu {
  /**
   * KAPILARIN OKUYACAGI SEVIYE. Erisim yoksa `null` — yani hicbir kapi
   * acilmaz (fail-closed). Tek hesaplandigi yer burasi.
   */
  etkinSeviye: string | null;
  /**
   * SATIN ALINAN seviye, erisimden BAGIMSIZ. YALNIZ MESAJ/GOSTERIM icindir:
   * "Pro paketiniz sona erdi" diyebilmek icin paketin Pro oldugunu bilmek
   * gerekir. ⚠ KAPI KARARINDA KULLANMAYIN.
   */
  paketSeviyesi: string | null;
  /** `abonelik-erisim.ts` cekirdeginin karari. */
  erisimVar: boolean;
}

/**
 * Firmanin paket seviyesi + abonelik sagligi. Abonelik ya da firma yoksa
 * hepsi bos/kapali.
 *
 * ⚠ `firmaId` YOKSA SORGU ATILMAZ. `where: { firmaId: undefined }` Prisma'da
 * kosulu SESSIZCE DUSURUR ve ILK aboneligi dondururdu — firmasiz bir hesap
 * baskasinin paketiyle kapidan gecerdi. Ayni gerekce `kimlik.ts` ve
 * `capabilities.helper.ts`te de yazili.
 */
export async function firmaPaketDurumu(
  prisma: SeviyePrisma,
  firmaId: string | null | undefined,
  simdi: Date = new Date(),
): Promise<PaketDurumu> {
  if (!firmaId) return { etkinSeviye: null, paketSeviyesi: null, erisimVar: false };

  const ab = (await prisma.abonelik.findUnique({
    where: { firmaId },
    select: {
      // ⚠ 2.13: `durum` + `erisimSonu` ARTIK CEKILIYOR. Cekilmedigi surece
      // seviye, iptal/sona erme bilgisinden habersiz donuyordu.
      durum: true,
      erisimSonu: true,
      paketSurumu: { select: { paket: { select: { seviye: true } } } },
    },
  })) as {
    durum?: string | null;
    erisimSonu?: Date | null;
    paketSurumu?: { paket?: { seviye?: string | null } | null } | null;
  } | null;

  const paketSeviyesi = ab?.paketSurumu?.paket?.seviye ?? null;

  // ⚠ `erisimSonu` eksikse BURADA karar verilmez — cekirdege verilir ve o
  // "suresi dolmus" sayar (fail-closed). Ikinci bir kural yazmamak icin.
  const { erisimVar } = abonelikErisimi(
    ab?.durum ? { durum: ab.durum, erisimSonu: ab.erisimSonu ?? null } : null,
    simdi,
  );

  return { etkinSeviye: erisimVar ? paketSeviyesi : null, paketSeviyesi, erisimVar };
}

/**
 * Firmanin ETKIN paket seviyesi — aboneligi yurumeyen firmada `null`.
 *
 * Cagiranlar korunsun diye duran ince sarmal. Varsayilan olarak ETKIN
 * degeri doner: bir kapi yanlislikla bunu cagirsa bile FAIL-CLOSED olur.
 * Mesaj uretmek icin ham seviye gerekiyorsa {@link firmaPaketDurumu}.
 */
export async function firmaPaketSeviyesi(
  prisma: SeviyePrisma,
  firmaId: string | null | undefined,
  simdi: Date = new Date(),
): Promise<string | null> {
  return (await firmaPaketDurumu(prisma, firmaId, simdi)).etkinSeviye;
}
