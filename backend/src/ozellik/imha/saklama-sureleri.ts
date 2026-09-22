/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YASA TEMELLI SAKLAMA SURELERI (plan 5.8 · §5.5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Buradaki sayilar bir AYAR degil, musteriye VERILMIS SOZ. Gizlilik
 *  Politikasi "ucretsiz deneme kaydi ... 2 yil" diyor; o cumle ancak kod
 *  gercekten siliyorsa DOGRUDUR.
 *
 *  ⚠ BU DOSYA 21.09'DAKI BIR CELISKIYI KAPATIYOR. O gun metne saklama
 *    suresi icin yer tutucu birakilmisti (`[DENEME KAYDI SAKLAMA SÜRESİ]`)
 *    ve kod `DenemeKullanimi` satirini HIC silmiyordu — sema yorumu bile
 *    "bu satiri SILMEMELI" diyordu. Yer tutucuya "2 yil" yazip birakmak,
 *    musteriye sonsuza dek sakladigimiz bir kaydi "2 yil" diye anlatmak
 *    olurdu. Once davranis eklendi, sonra cumle yazildi.
 *
 *  ⚠ IKI AYRI IMHA EKSENI VAR, KARISTIRMA:
 *
 *    1) FIRMA/UYE EKSENI (`imha-listesi.ts`) — hesap kapandiktan 30 gun
 *       sonra O FIRMAYA ait satirlari siler. `DenemeKullanimi` bu eksende
 *       BILEREK `SILINMEZLER` icindedir: kapatip ayni adresle kaydolan
 *       kisi ikinci bir ucretsiz deneme almasin diye.
 *
 *    2) YAS EKSENI (bu dosya) — kaydin KENDI yasina bakar, hesabin acik ya
 *       da kapali olmasiyla ilgilenmez. 2 yil sonra satir gider; o noktada
 *       deneme hakkinin yeniden dogmasi KABUL EDILEN sonuctur (Emre karari,
 *       22.09.2026), cunku kisisel veriyi suresiz tutmanin alternatifi
 *       budur.
 *
 *    Iki eksen birbirini iptal etmez. `SILINMEZLER`den cikarmak 1. ekseni
 *    bozardi (kapatan herkes ertesi ay yeni deneme alirdi); yas eksenini
 *    eklememek metni yalan yapardi. Ikisi birlikte dogru.
 *
 *  ⚠ SAYIYI DEGISTIRIRSEN METIN DE DEGISMELI. `test:faz5` D12 kapisi bu
 *    sabiti okur ve on yuzdeki cumlede AYNI yili arar; biri degisip oteki
 *    kalirsa kirmizi olur. Kapi metnin dogrulugunu olcer, kodun degil.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Ucretsiz deneme kaydinin (`DenemeKullanimi`) azami saklama suresi — YIL.
 * ⚠ On yuzdeki cumlenin ("… — 2 yıl.") ikizi. D12 kapisi esitligi olcer.
 */
export const DENEME_KAYDI_SAKLAMA_YIL = 2;

/**
 * Ayni sure GUN olarak. 365 x yil — arti gun/eksi gun hassasiyeti aranmiyor:
 * bu bir hak dusurucu sure degil, azami saklama taahhudu. Artik yil yuzunden
 * bir kayit bir gun fazla durursa taahhut cignenmis olmaz.
 */
export const DENEME_KAYDI_SAKLAMA_GUN = DENEME_KAYDI_SAKLAMA_YIL * 365;

/** Bir gun, milisaniye. */
const GUN_MS = 24 * 60 * 60 * 1000;

/**
 * "Bu andan geriye N gun" esigini hesaplar. Bu tarihten ONCE olusmus
 * kayitlar silinecek adaylardir.
 *
 * ⚠ GECERSIZ TARIH KAPISI — BU DEPODA OLCULMUS HATA SINIFI. Prisma'da
 *   `where: { alan: undefined }` suzgeci SESSIZCE DUSURUR ve `deleteMany`
 *   TUM TABLOYU siler. Gecersiz bir `Date` de ayni yola cikabilir
 *   (`new Date(NaN)`). Burada erkenden ve GURULTULU patliyoruz: bir imha
 *   yolunun sessizce "hepsi" demesi, kabul edilebilir en kotu hatadir.
 */
export function yasEsigi(simdi: Date, gun: number): Date {
  if (!(simdi instanceof Date) || !Number.isFinite(simdi.getTime())) {
    throw new Error(`yasEsigi: gecersiz "simdi" degeri (${String(simdi)})`);
  }
  if (!Number.isFinite(gun) || gun <= 0) {
    throw new Error(`yasEsigi: gecersiz gun sayisi (${String(gun)})`);
  }
  return new Date(simdi.getTime() - gun * GUN_MS);
}
