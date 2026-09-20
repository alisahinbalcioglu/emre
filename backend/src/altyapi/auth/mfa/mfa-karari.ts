/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — IKI ADIMLI GIRIS KARARI (SAF, §4.6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Bu dosyada DB, ag ve Nest YOKTUR: yalnizca "bu kullanici su yoldan
 *  girerken ne olmali" sorusunun cevabi. Gerekcesi olculmus bir hata
 *  sinifidir: karar servise gomulurse ayni kural giris, davet kabulu ve
 *  kurumsal giriste UC KEZ yazilir ve biri gunun birinde ayrisir.
 *
 *  ── EMRE'NIN KARARLARI (R1/E-4) — KODUN UYMAK ZORUNDA OLDUGU CUMLELER ──
 *  · Platform yoneticisinde (role === 'admin') iki adimli giris ZORUNLU.
 *  · Firma sahibi "firmamda herkese zorunlu" diyebilir; bu zorunluluk
 *    YALNIZ PAROLAYLA girenlere uygulanir.
 *  · Kisi KENDI ISTEGIYLE acmissa (`mfaKaynagi === 'kisisel'`) kurumsal
 *    giriste de kod sorulur. Zorunlulukla kurmus birine sirket hesabiyla
 *    girerken kod SORULMAZ — o dogrulamayi sirketin saglayicisi yapti.
 */

/** Zorunlulugun NEDENI — kullaniciya gosterilen metin buradan secilir. */
export type MfaZorunlulukNedeni = 'yonetici' | 'firma';

/** `mfaKaynagi` sozlugu (DB'de metin; tek dogru liste burasi). */
export type MfaKaynagi = 'kisisel' | 'zorunlu-firma' | 'zorunlu-yonetici';

/** Kararin okudugu en dar kullanici sekli. */
export type MfaKullanicisi = {
  role?: string | null;
  mfaAcikAt?: Date | null;
  mfaKaynagi?: string | null;
};

/** Kararin okudugu en dar firma sekli. */
export type MfaFirmasi = {
  mfaZorunlu?: boolean | null;
} | null | undefined;

/** Giris yolu: parolayla mi, sirket hesabiyla mi gelindi. */
export type GirisYolu = 'parola' | 'kurumsal';

/** `girisKarariSaf`in uc cevabindan biri. */
export type GirisKarariTipi = 'oturum' | 'mfa' | 'mfa-kurulum';

/**
 * ZORUNLU MU — tek yuklem (§4.6).
 *
 * ⚠ `firma` okunamadiysa (`null`/`undefined`) firma dali FALSE sayilir:
 * fail-open degil, "bilgi yok" demektir ve yonetici dali zaten ayri durur.
 * Firma zorunlulugunu bilmeden kimseyi kurulum sihirbazina dusurmeyiz.
 */
export function mfaZorunluMu(
  user: MfaKullanicisi,
  firma: MfaFirmasi,
): { zorunlu: boolean; neden: MfaZorunlulukNedeni | null } {
  if (user.role === 'admin') return { zorunlu: true, neden: 'yonetici' };
  if (firma?.mfaZorunlu === true) return { zorunlu: true, neden: 'firma' };
  return { zorunlu: false, neden: null };
}

/**
 * GIRIS KARARI (SAF) — token mi, kod mu, kurulum mu (§4.6).
 *
 * `parola` yolu:
 *   · MFA acik            → `mfa`          (6 haneli kod istenir)
 *   · MFA kapali + zorunlu→ `mfa-kurulum`  (kurulum sihirbazi)
 *   · digeri              → `oturum`
 *
 * `kurumsal` yolu (R1/E-4):
 *   · MFA acik VE kaynak 'kisisel' → `mfa`
 *   · BASKA HER DURUM              → `oturum`
 *   Zorunlulukla kurmus kisi sirket hesabiyla girerken kod GORMEZ; firma
 *   zorunlulugu da kurumsal girise kurulum DAYATMAZ (sirketin kendi kimlik
 *   saglayicisi zaten dogruladi). Yonetici kurumsal girisi kullanamaz (§5.7),
 *   bu yuzden burada yonetici dali YOKTUR.
 */
export function girisKarariSaf(g: {
  user: MfaKullanicisi;
  firma: MfaFirmasi;
  yol: GirisYolu;
}): { tip: GirisKarariTipi; neden: MfaZorunlulukNedeni | null } {
  const acik = !!g.user.mfaAcikAt;
  if (g.yol === 'kurumsal') {
    if (acik && g.user.mfaKaynagi === 'kisisel') return { tip: 'mfa', neden: null };
    return { tip: 'oturum', neden: null };
  }
  if (acik) return { tip: 'mfa', neden: null };
  const { zorunlu, neden } = mfaZorunluMu(g.user, g.firma);
  if (zorunlu) return { tip: 'mfa-kurulum', neden };
  return { tip: 'oturum', neden: null };
}

/**
 * IKI ADIMLI GIRISI KAPATAN YAZIM — UC CAGIRANIN ORTAK VERISI.
 *
 * Kullanicinin kendi kapatmasi, yoneticinin sifirlamasi ve sunucu betigi
 * AYNI alanlari temizler. Ucu de kendi nesnesini yazsaydi biri gunun
 * birinde `mfaKaynagi`yi ya da damgayi unuturdu (bu depoda olculmus hata
 * sinifi: "ikizi unutma").
 *
 * ⚠ `passwordChangedAt` SART (§4.7): iki adimli giris kalkarken elde kalan
 * token'lar olmelidir; yoksa "sifirladim" denen hesapta eski oturum
 * calismaya devam ederdi.
 *
 * ⚠ Saf: Nest ve Prisma BILMEZ — bu yuzden `admin.service.ts` ve betik
 * `mfa.servisi.ts`i (ve onun butun bagimliliklarini) import etmek zorunda
 * kalmaz.
 */
export function mfaTemizlemeVerisi(simdi: Date) {
  return {
    mfaSirriSifreli: null,
    mfaAcikAt: null,
    mfaKaynagi: null,
    mfaSonAdim: null,
    mfaBekleyenSirSifreli: null,
    mfaBekleyenAt: null,
    mfaHataSayaci: 0,
    mfaKilitliAt: null,
    passwordChangedAt: simdi,
  };
}

/**
 * KAPATILABILIR MI (§4.4 `mfa/kapat`).
 *
 * ⚠ Firma zorunlulugu KALKINCA `zorunlu-firma` kaynakli kisi MFA'yi KORUR
 * ama artik kendisi kapatabilir — bu yuzden karar `mfaKaynagi`ya degil
 * firmanin O ANKI anahtarina bakar.
 */
export function kapatilabilirMi(
  user: MfaKullanicisi,
  firma: MfaFirmasi,
): { kapatilabilir: boolean; neden: MfaZorunlulukNedeni | null; mesaj: string | null } {
  if (user.role === 'admin') {
    return {
      kapatilabilir: false,
      neden: 'yonetici',
      mesaj:
        'Yönetici hesaplarında iki adımlı giriş zorunludur; kapatılamaz.',
    };
  }
  if (firma?.mfaZorunlu === true) {
    return {
      kapatilabilir: false,
      neden: 'firma',
      mesaj:
        'Firmanızda iki adımlı giriş zorunlu kılınmış; kapatmak için firma ' +
        'sahibinizle görüşün.',
    };
  }
  return { kapatilabilir: true, neden: null, mesaj: null };
}
