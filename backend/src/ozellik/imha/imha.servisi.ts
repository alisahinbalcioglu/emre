import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../altyapi/db/prisma.service';
import {
  FIRMA_BOSALTILACAK_ALANLAR,
  FIRMA_IMHA_ADI,
  KULLANICI_ANONIM_ALANLARI,
  SILINECEKLER,
  SilmeKurali,
  imhaEpostasi,
} from './imha-listesi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VERI IMHASI SERVISI (plan 5.8 · §5.2 · §5.3 · §5.4 · §5.6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  GERI ALINAMAZ SILME. Bu dosyadaki her satir "gece 3'te cagri alir miyim"
 *  sorusuna gore yazildi. Uc kirmizi cizgi:
 *
 *  1) YALNIZ `imhaTarihi`. `deletedAt` bu dosyada HIC OKUNMAZ. `deletedAt`
 *     "hesap kapali" demektir; K1'e gore kapali hesap 30 gun YASAR ve geri
 *     donebilir. `deletedAt`e bakan bir imha, kapatmanin ERTESI GUNU
 *     musterinin butun verisini silerdi. (Kabul olcutu 2 — mutasyonla sinanir.)
 *
 *  2) FIRMA BASINA TEK TRANSACTION (§5.6). Yarim imha, yarisi silinmis bir
 *     firma birakir: teklifler gitmis, kutuphane durur, musteri "sildiniz mi
 *     silmediniz mi" diye sorar ve cevabi kimse bilemez. Denetim kaydi da
 *     AYNI transaction'in icinde yazilir — kayit varsa silme kesin olmustur.
 *
 *  3) KAPSAM SUZGECSIZ `deleteMany` YASAK. Her silme bir kimlige baglidir
 *     (`imha-listesi.ts` · `eksen`). Kapsam degeri bos/undefined gelirse
 *     `kapsamDegeri` FIRLATIR — cunku Prisma'da `where: { firmaId: undefined }`
 *     suzgeci SESSIZCE DUSURUR ve TABLONUN TAMAMINI siler. Bu, bu dosyanin
 *     yapabilecegi en buyuk hasardir; sessiz olmasina izin verilmez.
 *
 *  ⚠ `user.delete()` / `firma.delete()` CAGIRILMAZ (bkz. imha-listesi.ts
 *    TUZAK 2). Iki satir da KALIR, alanlari bosalir. Sonuc olarak CASCADE
 *    hic tetiklenmez ve butun cocuk tablolar ELLE silinir.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Denetim kaydi tipleri (`YoneticiOlayi.tip`). */
export const IMHA_FIRMA_TIPI = 'imha.firma';
export const IMHA_UYE_TIPI = 'imha.uye';

/**
 * `YoneticiOlayi.yoneticiId`/`yoneticiEpsta` ZORUNLU (null kabul etmiyor) ama
 * bu isi bir yonetici degil GECELIK IS yapiyor. `FirmaOlayi.aktorId` icin
 * sema "null = sistem" diyor; `YoneticiOlayi`nde null yok, bu yuzden sabit
 * bir aktor kimligi kullanilir. `.invalid` gercek bir adresle karisamaz.
 */
export const IMHA_AKTORU = 'sistem-imha';
export const IMHA_AKTOR_EPOSTASI = 'sistem-imha@metapricex.invalid';

/** `in` suzgecinde tek seferde tasinacak kimlik sayisi (PG parametre siniri). */
const PARCA = 1000;

/**
 * Kimlik kumesi TOPLARKEN de SILERKEN de AYNI suzgec kullanilsin diye kural
 * listesinden okur. Ikiz yazilsaydi biri miras satirlari alir, digeri almaz
 * ve sayilarla gercek birbirini tutmazdi (bu depoda olculmus hata sinifi).
 */
function KURAL(model: string): SilmeKurali {
  const k = SILINECEKLER.find((x) => x.model === model && x.eksen === 'firma');
  if (!k) throw new Error(`IMHA: "${model}" icin firma ekseninde kural yok.`);
  return k;
}

/** §5.4 — baska firmanin satirina dokunacagi anlasilinca atilir. */
export class CaprazFirmaBagiHatasi extends Error {
  constructor(
    readonly firmaId: string,
    readonly bag: 'QuoteItem.laborFirmaId' | 'Quote.formatId',
    readonly sayi: number,
  ) {
    super(
      `IMHA DURDURULDU (${firmaId}): ${bag} uzerinden BASKA firmanin ${sayi} ` +
        `satirina dokunulacakti. Silme yapilmadi, transaction geri alindi.`,
    );
    this.name = 'CaprazFirmaBagiHatasi';
  }
}

export interface ImhaSonucu {
  readonly hedef: string;
  readonly tur: 'firma' | 'uye';
  /** Tablo adi → silinen satir sayisi. Yalniz SAYI, icerik YOK (§5.6). */
  readonly sayilar: Record<string, number>;
  /** Zaten imha edilmisse silme yapilmaz. */
  readonly atlandi?: 'zaten-imha-edildi';
}

/** Servisin ihtiyac duydugu EN DAR Prisma yuzeyi (testte sahte DB verilebilsin). */
export interface ImhaPrisma {
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

@Injectable()
export class ImhaServisi {
  private readonly logger = new Logger(ImhaServisi.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Test/is katmani kendi Prisma'sini verebilsin diye ayri giris. */
  private get db(): ImhaPrisma {
    return this.prisma as unknown as ImhaPrisma;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  §5.2 — FIRMA IMHASI
  // ═════════════════════════════════════════════════════════════════════════
  /**
   * Firmanin BUTUN icerigini siler, firma satirini ve kimligini birakir,
   * firmadaki butun kullanicilarin kisisel bilgilerini anonimlestirir.
   * TEK transaction; herhangi bir adim firlarsa HICBIR SEY silinmemis olur.
   */
  async firmaImhaEt(firmaId: string): Promise<ImhaSonucu> {
    return this.db.$transaction(async (tx: any) => {
      // Uyelik degistiren her islem ayni kilitte karar verir ve yazar
      // (`uyelik-kurallari.ts` · `firmaKilitliIslem`). Imha da uyelik
      // degistiriyor: es zamanli bir davet kabulu imhadan SONRA satir
      // yazabilirdi. Bicim `::text` ile — `void` donen `$queryRaw` Prisma'da
      // cozulemez (olculmus kural).
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`firma-uyelik:${firmaId}`}))::text AS kilit`;

      const onceki = await tx.yoneticiOlayi.findFirst({
        where: { tip: IMHA_FIRMA_TIPI, yeniDeger: firmaId },
        select: { id: true },
      });
      if (onceki) {
        return { hedef: firmaId, tur: 'firma' as const, sayilar: {}, atlandi: 'zaten-imha-edildi' as const };
      }

      // ── Kimlik kumeleri ───────────────────────────────────────────────────
      const kullaniciIdler: string[] = (
        await tx.user.findMany({ where: { firmaId }, select: { id: true } })
      ).map((u: any) => u.id);

      const teklifIdler: string[] = (
        await tx.quote.findMany({
          where: this.firmaKapsami(firmaId, kullaniciIdler, KURAL('Quote')),
          select: { id: true },
        })
      ).map((q: any) => q.id);

      const iscilikFirmaIdler: string[] = (
        await tx.laborFirm.findMany({
          where: this.firmaKapsami(firmaId, kullaniciIdler, KURAL('LaborFirm')),
          select: { id: true },
        })
      ).map((f: any) => f.id);

      const formatIdler: string[] = (
        await tx.quoteFormat.findMany({
          where: this.firmaKapsami(firmaId, kullaniciIdler, KURAL('QuoteFormat')),
          select: { id: true },
        })
      ).map((f: any) => f.id);

      const kutuphaneIdler: string[] = (
        await tx.userLibrary.findMany({
          where: this.firmaKapsami(firmaId, kullaniciIdler, KURAL('UserLibrary')),
          select: { id: true },
        })
      ).map((r: any) => r.id);

      const saglayiciIdler: string[] = (
        await tx.firmaKimlikSaglayici.findMany({ where: { firmaId }, select: { id: true } })
      ).map((s: any) => s.id);

      const iscilikListeIdler: string[] = iscilikFirmaIdler.length
        ? (
            await tx.laborPriceList.findMany({
              where: { firmaId: { in: iscilikFirmaIdler } },
              select: { id: true },
            })
          ).map((l: any) => l.id)
        : [];

      // ── §5.4 — BASKA FIRMANIN SATIRINA DOKUNUYOR MUYUZ? ──────────────────
      await this.caprazBagKapisi(tx, firmaId, teklifIdler, iscilikFirmaIdler, formatIdler);

      // ── Silme — `imha-listesi.ts` sirasiyla, yapraktan koke ──────────────
      const kimlikKumeleri: Record<string, string[] | string> = {
        firma: firmaId,
        kullanici: kullaniciIdler,
        iscilikFirmasi: iscilikFirmaIdler,
        iscilikFiyatListesi: iscilikListeIdler,
        kutuphaneSatiri: kutuphaneIdler,
        teklif: teklifIdler,
        kimlikSaglayici: saglayiciIdler,
      };

      const sayilar: Record<string, number> = {};
      for (const kural of SILINECEKLER) {
        sayilar[kural.model] = await this.kuraliUygula(
          tx,
          kural,
          kimlikKumeleri,
          kullaniciIdler,
        );
      }

      // ── §5.2 — kullanicilarin kisisel bilgileri ──────────────────────────
      sayilar['User:anonim'] = await this.kullanicilariAnonimlestir(tx, kullaniciIdler);

      // ── §5.2 — firma satiri KALIR, alanlari bosalir ──────────────────────
      const bosalt: Record<string, null> = {};
      for (const alan of FIRMA_BOSALTILACAK_ALANLAR) bosalt[alan] = null;
      await tx.firma.update({
        where: { id: firmaId },
        data: { ...bosalt, ad: FIRMA_IMHA_ADI },
      });
      sayilar['Firma:bosaltildi'] = 1;

      // ── §5.6 — denetim kaydi: SAYILAR, icerik DEGIL ──────────────────────
      await tx.yoneticiOlayi.create({
        data: {
          yoneticiId: IMHA_AKTORU,
          yoneticiEpsta: IMHA_AKTOR_EPOSTASI,
          tip: IMHA_FIRMA_TIPI,
          // Idempotans anahtari: bu satir varsa firma imha EDILMISTIR.
          yeniDeger: firmaId,
          veri: {
            kullaniciSayisi: kullaniciIdler.length,
            teklifSayisi: teklifIdler.length,
            kutuphaneSatiri: kutuphaneIdler.length,
            dwgDosyaSayisi: sayilar['DwgDosya'] ?? 0,
            sayilar,
          },
        },
      });

      return { hedef: firmaId, tur: 'firma' as const, sayilar };
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  §5.3 — UYE IMHASI (firma devam ediyor)
  // ═════════════════════════════════════════════════════════════════════════
  /**
   * YALNIZ kisisel bilgiler anonimlesir. Hesap SATIRI kalir ki tekliflerdeki
   * "Hazirlayan" bagi kirilmasin; teklifler firmada kalir (§5.3).
   */
  async uyeImhaEt(userId: string): Promise<ImhaSonucu> {
    return this.db.$transaction(async (tx: any) => {
      const onceki = await tx.yoneticiOlayi.findFirst({
        where: { tip: IMHA_UYE_TIPI, hedefKullaniciId: userId },
        select: { id: true },
      });
      if (onceki) {
        return { hedef: userId, tur: 'uye' as const, sayilar: {}, atlandi: 'zaten-imha-edildi' as const };
      }

      const sayilar: Record<string, number> = {};
      sayilar['User:anonim'] = await this.kullanicilariAnonimlestir(tx, [userId]);

      // Kisiye ait oturum/dogrulama/dis kimlik artiklari da kisisel veridir;
      // birakilirsa anonimlesmis hesap kurumsal girisle GERI ACILABILIRDI.
      for (const model of ['PasswordResetToken', 'EmailVerificationToken', 'MfaKurtarmaKodu', 'KullaniciDisKimlik']) {
        const kural = SILINECEKLER.find((k) => k.model === model)!;
        sayilar[model] = await this.parcaliSil(tx[kural.erisimci], kural.kolon, [userId]);
      }
      sayilar['SsoAkisi'] = await this.parcaliSil(tx.ssoAkisi, 'baslatanUserId', [userId]);

      await tx.yoneticiOlayi.create({
        data: {
          yoneticiId: IMHA_AKTORU,
          yoneticiEpsta: IMHA_AKTOR_EPOSTASI,
          hedefKullaniciId: userId,
          tip: IMHA_UYE_TIPI,
          yeniDeger: userId,
          veri: { sayilar },
        },
      });

      return { hedef: userId, tur: 'uye' as const, sayilar };
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Yardimcilar
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * §5.4 KAPISI. Bugun canlida bu iki bag SIFIR satir iceriyor ve API bu bagi
   * URETEMIYOR:
   *   · `quotes.service.ts` teklif kalemini yazarken yalniz KENDI firmasinin
   *     `LaborFirm`lerini kabul ediyor (`firmaOk` suzgeci),
   *   · teklif formati hem yazarken hem okurken `firmaId: k.firmaId` ile
   *     suzuluyor.
   * Yani bu kapi normal isleyiste HIC calismaz — ileride o suzgeclerden biri
   * kaldirilirsa calisir. O gun silmeye devam etmek, BASKA bir musterinin
   * teklifini sessizce degistirmek olurdu; brief bunu "kabul edilemez" diyor.
   * Bu yuzden kapi silmez, ATLAMAZ da: transaction'i firlatarak geri alir ve
   * kararı insana birakir.
   */
  private async caprazBagKapisi(
    tx: any,
    firmaId: string,
    teklifIdler: string[],
    iscilikFirmaIdler: string[],
    formatIdler: string[],
  ): Promise<void> {
    const bizimTeklif = new Set(teklifIdler);

    if (iscilikFirmaIdler.length) {
      const kalemler: any[] = await this.parcaliBul(tx.quoteItem, 'laborFirmaId', iscilikFirmaIdler, {
        quoteId: true,
      });
      const yabanci = new Set(
        kalemler.map((k) => k.quoteId).filter((q: string) => !bizimTeklif.has(q)),
      );
      if (yabanci.size > 0) {
        throw new CaprazFirmaBagiHatasi(firmaId, 'QuoteItem.laborFirmaId', yabanci.size);
      }
    }

    if (formatIdler.length) {
      const teklifler: any[] = await this.parcaliBul(tx.quote, 'formatId', formatIdler, { id: true });
      const yabanci = teklifler.map((q) => q.id).filter((id: string) => !bizimTeklif.has(id));
      if (yabanci.length > 0) {
        throw new CaprazFirmaBagiHatasi(firmaId, 'Quote.formatId', yabanci.length);
      }
    }
  }

  /**
   * Tek bir silme kuralini uygular. Bilinmeyen eksen SESSIZCE ATLANMAZ,
   * FIRLATIR — atlanan bir kural "imha edildi" denen veriyi birakirdi.
   */
  private async kuraliUygula(
    tx: any,
    kural: SilmeKurali,
    kimlikKumeleri: Record<string, string[] | string>,
    kullaniciIdler: string[],
  ): Promise<number> {
    const tablo = tx[kural.erisimci];
    if (!tablo) {
      throw new Error(`IMHA: "${kural.erisimci}" Prisma erisimcisi yok (model ${kural.model}).`);
    }

    if (kural.eksen === 'firma') {
      const firmaId = kimlikKumeleri['firma'] as string;
      this.kapsamDegeri(kural, firmaId);
      const { count } = await tablo.deleteMany({
        where: this.firmaKapsami(firmaId, kullaniciIdler, kural),
      });
      return count;
    }

    const kumeler: Record<string, string> = {
      kullanici: 'kullanici',
      iscilikFirmasi: 'iscilikFirmasi',
      iscilikFiyatListesi: 'iscilikFiyatListesi',
      kutuphaneSatiri: 'kutuphaneSatiri',
      teklif: 'teklif',
      kimlikSaglayici: 'kimlikSaglayici',
    };
    const anahtar = kumeler[kural.eksen];
    if (!anahtar) {
      throw new Error(`IMHA: bilinmeyen eksen "${kural.eksen}" (model ${kural.model}).`);
    }
    const kimlikler = kimlikKumeleri[anahtar] as string[];
    this.kapsamDegeri(kural, kimlikler);
    return this.parcaliSil(tablo, kural.kolon, kimlikler);
  }

  /**
   * FIRMA EKSENI SUZGECI. `firmaId` ile suzer; `mirasFirmasizDaAl` ise
   * `firmaId` bos kalmis MIRAS satirlarini da alir — ADIM 1 gecisi once
   * `firmaId`siz yaziyordu ve yalniz `firmaId` ile suzmek o satirlari
   * SESSIZCE birakirdi.
   *
   * ⚠ `firmaId: null` TEK BASINA KULLANILMAZ: oyle bir suzgec BASKA
   *   firmalarin miras satirlarini da silerdi. Ikinci kol her zaman
   *   `userId ∈ bu firmanin kullanicilari` ile kapali.
   */
  private firmaKapsami(
    firmaId: string,
    kullaniciIdler: string[],
    kural: Pick<SilmeKurali, 'kolon' | 'mirasFirmasizDaAl' | 'mirasKullaniciKolonu'>,
  ): any {
    const firmaKolonu = kural.kolon;
    const temel = { [firmaKolonu]: firmaId };
    if (!kural.mirasFirmasizDaAl || kullaniciIdler.length === 0) return temel;
    const kisiKolonu = kural.mirasKullaniciKolonu ?? 'userId';
    return {
      OR: [temel, { [firmaKolonu]: null, [kisiKolonu]: { in: kullaniciIdler } }],
    };
  }

  /**
   * EN BUYUK HASAR NOKTASI. Prisma'da `where: { firmaId: undefined }`
   * suzgeci SESSIZCE DUSURUR ve `deleteMany` TABLONUN TAMAMINI siler —
   * butun musterilerin verisi. Bos/undefined kapsam burada FIRLATIR.
   * Bos DIZI ise gecerlidir: `{ in: [] }` hicbir satir silmez.
   */
  private kapsamDegeri(kural: SilmeKurali, deger: string | string[] | null | undefined): void {
    if (deger === null || deger === undefined || deger === '') {
      throw new Error(
        `IMHA GUVENLIK KAPISI: ${kural.model} icin kapsam degeri bos — ` +
          `suzgecsiz deleteMany TUM TABLOYU silerdi.`,
      );
    }
  }

  /** `{ in: [...] }` ile parcali silme; bos dizi = 0 satir, sorgu atilmaz. */
  private async parcaliSil(tablo: any, kolon: string, kimlikler: string[]): Promise<number> {
    let toplam = 0;
    for (let i = 0; i < kimlikler.length; i += PARCA) {
      const { count } = await tablo.deleteMany({
        where: { [kolon]: { in: kimlikler.slice(i, i + PARCA) } },
      });
      toplam += count;
    }
    return toplam;
  }

  /** `{ in: [...] }` ile parcali okuma. */
  private async parcaliBul(
    tablo: any,
    kolon: string,
    kimlikler: string[],
    select: Record<string, true>,
  ): Promise<any[]> {
    const cikti: any[] = [];
    for (let i = 0; i < kimlikler.length; i += PARCA) {
      cikti.push(
        ...(await tablo.findMany({
          where: { [kolon]: { in: kimlikler.slice(i, i + PARCA) } },
          select,
        })),
      );
    }
    return cikti;
  }

  /**
   * §5.3 — kisisel alanlar. E-posta BENZERSIZ oldugu icin null degil,
   * kullanicinin KENDI kimliginden turetilen cakismayan bir degere cekilir
   * (`imha-<id>@metapricex.invalid`); iki hesap ayni degere dusemez.
   *
   * ⚠ `updateMany` KULLANILMAZ: her satira FARKLI bir e-posta yazilmasi
   *   gerekiyor, `updateMany` tek deger yazar ve `email @unique` ikinci
   *   satirda P2002 ile patlardi.
   */
  private async kullanicilariAnonimlestir(tx: any, kullaniciIdler: string[]): Promise<number> {
    const anonim: Record<string, null> = {};
    for (const alan of KULLANICI_ANONIM_ALANLARI) anonim[alan] = null;

    let n = 0;
    for (const id of kullaniciIdler) {
      await tx.user.update({
        where: { id },
        data: { ...anonim, email: imhaEpostasi(id) },
      });
      n++;
    }
    return n;
  }
}
