/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YONETICI GIRISI — E-POSTA KODU (23.09.2026, Emre karari) · SAF MANTIK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre: "bu yontemle giris yapamiyorum ve cok zor geldi. admin giris icin
 *  mail adresine dogrulama maili gelsin her seferinde bu sekilde giris
 *  yapalim."
 *
 *  ⚠ BU DOSYA PRISMA VE NEST BILMEZ. Gerekce bu depoda olculmus: kurallar
 *  servise gomuldugunde yalniz uctan uca koşarak sinanabiliyor, yani
 *  pratikte hic sinanmiyor. Buradaki her karar (sure doldu mu, kod tutuyor
 *  mu, yeniden gonderilebilir mi) saf fonksiyondur ve dogrudan olculur.
 *
 *  ── NEDEN OZET, DUZ KOD DEGIL ──────────────────────────────────────────
 *  Kod veritabaninda DUZ durmaz. Parola alanlariyla ayni disiplin: veritabani
 *  yedegini ya da bir SQL ciktisini goren kisi GECERLI bir giris kodu
 *  okuyamamali. `scrypt` + kisi basina tuz (userId) kullanilir.
 *
 *  ── KARSILASTIRMA SABIT ZAMANLI ────────────────────────────────────────
 *  `timingSafeEqual`: ozetleri `===` ile karsilastirmak, dogru baslangici
 *  olan kodun daha gec basarisiz olmasi demektir (zamanlama sizintisi).
 *  Alti haneli bir kodda bu teorik gorunse de kural tek yerde tutulur.
 */
import { randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { MEYDAN_OKUMA_OMRU_SN } from './meydan-okuma';

/** Kod uzunlugu — alti hane, kullanicinin ezberleyip yazabilecegi kadar. */
export const EPOSTA_KODU_HANE = 6;

/**
 * Gecerlilik = MEYDAN OKUMANIN OMRU (300 sn).
 *
 * ⚠⚠ ONCE 10 DAKIKA YAZILMISTI VE BU YANLISTI. Kodu tasiyan sey meydan
 * okuma token'idir (`meydan-okuma.ts`, 300 sn); kod ondan UZUN yasarsa
 * fazladan gecen sure KULLANILAMAZ — kullanici gecerli bir kod girer ve
 * 401 alip GIRIS EKRANINA ATILIR. Iki sure ayri yazildigi surece "kodum
 * gecerli ama giremiyorum" durumu kacinilmazdir.
 *
 * Bu yuzden sabit TUREITILIR, kopyalanmaz: `meydan-okuma.ts` degerini
 * degistiren kisi burayi guncellemeyi unutamaz.
 *
 * ⚠ E-postada teslimat gecikmesi var (kuyruk, spam suzgeci) ve 5 dakika
 * dardir. Cozum sureyi UZATMAK DEGIL: sure dolarsa kullanici parolayla
 * yeniden girer ve YENI kod gelir — bu bir kilitlenme degil, bir adim.
 */
export const EPOSTA_KODU_GECERLILIK_SN = MEYDAN_OKUMA_OMRU_SN;

/**
 * Yeniden gonderme kisiti 60 saniye.
 *
 * ⚠ KISIT GONDERIME BAKAR, KODA DEGIL. Kullanici arka arkaya "yeniden
 * gonder"e basarsa hem posta saglayicisi (Brevo) hem kisinin kutusu
 * gereksiz yuklenir. Kod uretimi ile gonderim ayni anda olur ama ayri
 * damgalarda tutulur: kod suresi dolmus olabilir, gonderim kisiti hala
 * suruyor olabilir.
 */
export const EPOSTA_KODU_YENIDEN_GONDERIM_SN = 60;

/**
 * Alti haneli kod uretir. `randomInt` KRIPTOGRAFIK: `Math.random()`
 * tahmin edilebilir ve bir giris kodunda kullanilamaz.
 *
 * ⚠ BASTAKI SIFIRLAR KORUNUR: `padStart` olmadan 42 gibi iki haneli bir
 * deger uretilir, kullanici "kod eksik geldi" der ve dogrulama da tutmaz.
 */
export function epostaKoduUret(): string {
  return String(randomInt(0, 10 ** EPOSTA_KODU_HANE)).padStart(EPOSTA_KODU_HANE, '0');
}

/** Kodu kisiye bagli tuzla ozetler. Ayni kod baska kullanicida BASKA ozet. */
export function epostaKoduOzetle(kod: string, userId: string): string {
  return scryptSync(kod, `mfa-eposta:${userId}`, 32).toString('base64url');
}

/**
 * Kod dogru mu? Sabit zamanli karsilastirma.
 *
 * ⚠ `saklanan` bos/bozuk ise FALSE doner, FIRLATMAZ: cagiran taraf "kod
 * yanlis" ile "sistem bozuk" arasinda ayrim yapmak zorunda kalmasin diye —
 * ikisi de kullaniciya ayni cumleyi gosterir ve ikisi de hata sayacini
 * artirmali.
 */
export function epostaKoduTutuyorMu(
  kod: string,
  userId: string,
  saklanan: string | null | undefined,
): boolean {
  if (!saklanan) return false;
  let beklenen: Buffer;
  let gelen: Buffer;
  try {
    beklenen = Buffer.from(saklanan, 'base64url');
    gelen = Buffer.from(epostaKoduOzetle(kod, userId), 'base64url');
  } catch {
    return false;
  }
  if (beklenen.length !== gelen.length || beklenen.length === 0) return false;
  return timingSafeEqual(beklenen, gelen);
}

/**
 * Kodun suresi doldu mu?
 *
 * ⚠ `uretildi` YOKSA "doldu" SAYILIR (true). Ters yon tehlikeli olurdu:
 * damgasi olmayan bir satir, suresi hic dolmayan bir kod demek olurdu.
 */
export function epostaKoduSuresiDoldu(
  uretildi: Date | null | undefined,
  simdi: Date,
  gecerlilikSn = EPOSTA_KODU_GECERLILIK_SN,
): boolean {
  if (!uretildi) return true;
  const gecen = (simdi.getTime() - uretildi.getTime()) / 1000;
  // Gelecege damgalanmis satir (saat kaymasi) da GECERSIZ sayilir.
  if (gecen < 0) return true;
  return gecen > gecerlilikSn;
}

/**
 * Yeniden gonderilebilir mi? Kalan saniyeyi de doner ki ekran
 * "23 saniye sonra tekrar deneyin" yazabilsin.
 */
export function yenidenGonderilebilirMi(
  sonGonderim: Date | null | undefined,
  simdi: Date,
  kisitSn = EPOSTA_KODU_YENIDEN_GONDERIM_SN,
): { olur: boolean; kalanSn: number } {
  if (!sonGonderim) return { olur: true, kalanSn: 0 };
  const gecen = (simdi.getTime() - sonGonderim.getTime()) / 1000;
  if (gecen < 0) return { olur: true, kalanSn: 0 }; // saat kaymasi: engelleme
  if (gecen >= kisitSn) return { olur: true, kalanSn: 0 };
  return { olur: false, kalanSn: Math.ceil(kisitSn - gecen) };
}
