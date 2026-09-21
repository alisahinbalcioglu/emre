/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ABONELIK ERISIMI — SAF CEKIRDEK, TEK KAYNAK (2.13, 22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  TEK SORU: "durum + erisimSonu + simdi verildiginde bu abonelik SU AN
 *  erisim veriyor mu, veriyorsa salt okunur mu?"
 *
 *  ── NEDEN AYRI (ve neden HICBIR SEY IMPORT ETMEYEN) BIR DOSYA ───────────
 *  Ayni yuklemi iki KATMAN okuyor:
 *    · odeme katmani  → `ozellik/odeme/abonelik/erisim.servisi.ts`
 *    · yetki katmani  → `altyapi/auth/seviye.ts`, `capabilities.helper.ts`
 *  Yuklem odeme katmaninda kalsaydi `altyapi/auth → ozellik/odeme` bagi
 *  dogardi; `erisim.servisi.ts` ZATEN `altyapi/auth/kapali-hesap`i import
 *  ediyor (erisim.servisi.ts:5-8), yani ters yon bir DONGU olurdu. Ayni
 *  gerekceyle yazilmis ikizi: `kapali-hesap.ts` (bkz. oradaki baslik).
 *
 *  ⚠ `@prisma/client` TIPI BILEREK IMPORT EDILMEDI — dosyanin import'suz
 *  kalmasi dongu korumasinin ta kendisi. `durum` DIZGE olarak alinir;
 *  degerler semadaki `enum AbonelikDurumu` ile birebir ayni ve sapma olursa
 *  `abonelik-erisim-test.ts` S1 kirmiziya doner (sema metnini okuyup bu
 *  listeyle karsilastirir).
 *
 *  ⚠ IKIZ KURAL YASAGI (bu deponun olculmus hata sinifi — `feedback_ikizi_
 *  unutma`): "aboneligi yuruyor mu" sorusuna cevap veren IKINCI bir yer
 *  YAZILMAZ. `ErisimServisi.karar`, `TierGuard` ve `/auth/me` yetenekleri
 *  BURADAN besleniyor; biri ayrisirsa musteri bir kapidan gecip digerinden
 *  403 alir.
 *
 *  ⚠ SAF: DB yok, `new Date()` varsayilani disinda saat yok, tarih disaridan
 *  verilebilir. Testte DB'siz olculur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * `AbonelikDurumu` enum'unun DIZGE karsiligi (sema: `schema.prisma`).
 * Sira semadakiyle ayni tutulur — S1 testi bu listeyi sema metniyle esler.
 */
export const ABONELIK_DURUMLARI = [
  'DENEME',
  'AKTIF',
  'ODEME_BEKLIYOR',
  'KISITLI',
  'ASKIDA',
  'IPTAL',
  'SONA_ERDI',
] as const;

export type AbonelikDurumKodu = (typeof ABONELIK_DURUMLARI)[number];

/** Kararin ihtiyac duydugu EN DAR abonelik yuzeyi. */
export interface AbonelikGorunumu {
  durum: AbonelikDurumKodu | string;
  /**
   * Erisimin bittigi AN. Semada NOT NULL — ama tip `null` da kabul eder:
   * eksik/bozuk tarih SESSIZCE "suresi dolmamis" sayilmasin, SURESI DOLMUS
   * sayilsin (fail-closed). Bkz. `suresiDolduMu`.
   */
  erisimSonu: Date | null | undefined;
}

export interface AbonelikErisimi {
  /** Urun kullanilabilir mi? `false` → yalniz odeme sayfasi. */
  erisimVar: boolean;
  /** Erisim var ama YAZMA kapali mi? (tolerans doldu) */
  saltOkunur: boolean;
}

/** Aboneligi olmayan firma: kapali. Fail-closed. */
const YOK: AbonelikErisimi = { erisimVar: false, saltOkunur: false };

/**
 * Erisim tarihi gecmis mi?
 *
 * ⚠ EKSIK/GECERSIZ TARIH "SURESI DOLMUS" SAYILIR. Tersi sessiz bir gelir
 * hatasi olurdu: `erisimSonu` bir sekilde bos gelen satir (bozuk goc, elle
 * duzeltme, eksik `select`) SURESIZ ERISIM kazanirdi. `NaN <= x` zaten
 * `false` dondugu icin bu kontrol ACIKCA yazilmali.
 */
function suresiDolduMu(erisimSonu: Date | null | undefined, simdi: Date): boolean {
  const an = erisimSonu?.getTime?.();
  if (typeof an !== 'number' || Number.isNaN(an)) return true;
  return an <= simdi.getTime();
}

/**
 * Aboneligin SU ANKI erisim durumu.
 *
 * ⚠ DALLAR `ErisimServisi.karar`IN DAVRANISINI BIREBIR TASIR. Bu fonksiyon
 * o metottan CIKARILDI (2.13); metin degil, KARAR tasindi. Iki taraf ayni
 * anda degismezse `abonelik-erisim-test.ts` E-dalı kirmiziya doner (her
 * durum icin servis karari ile bu fonksiyon KARSILASTIRILIR).
 *
 * ⚠ ODEME_BEKLIYOR ve KISITLI `erisimSonu`NA BAKMAZ — bilerek:
 *   · ODEME_BEKLIYOR = tolerans suresi. Tahsilat basarisiz olunca `erisimSonu`
 *     zaten gecmistedir; tarihe bakilsaydi tolerans HIC calismaz, musteri
 *     kartini guncelleyecek firsati bulamadan kapanirdi
 *     (`mutabakat.job.ts:156` ayni gerekceyi yaziyor).
 *   · KISITLI = tolerans DOLDU, salt-okunur kip. Tarihe bakilsaydi salt-okunur
 *     kip hic gorunmez, dogrudan kapanma olurdu.
 * Diger tum dallarda `erisimSonu` gecmisse erisim KAPANIR (semadaki "ikinci
 * emniyet kemeri": zamanlanmis is gec kosarsa bile bedava kullanim olmaz).
 *
 * ⚠ IPTAL KESILMEZ: iptal eden musteri ODEDIGI DONEMIN SONUNA kadar tam
 * erisimini korur. Olcut ham `durum` DEGIL, erisim kararidir — `durum`
 * uzerinden daraltmak (ornegin "yalniz AKTIF gecer") iptal eden musteriyi
 * parasini odedigi hizmetten ANINDA ederdi.
 */
export function abonelikErisimi(
  abonelik: AbonelikGorunumu | null | undefined,
  simdi: Date = new Date(),
): AbonelikErisimi {
  if (!abonelik) return YOK;

  const suresiDoldu = suresiDolduMu(abonelik.erisimSonu, simdi);

  switch (abonelik.durum) {
    case 'DENEME':
    case 'AKTIF':
    case 'IPTAL':
      return { erisimVar: !suresiDoldu, saltOkunur: false };

    case 'ODEME_BEKLIYOR':
      return { erisimVar: true, saltOkunur: false };

    case 'KISITLI':
      return { erisimVar: true, saltOkunur: true };

    case 'ASKIDA':
    case 'SONA_ERDI':
    default:
      // ⚠ `default` de KAPALI: semaya yarin eklenecek taninmayan bir durum
      // kapiyi acik bulmaz (fail-closed).
      return YOK;
  }
}
