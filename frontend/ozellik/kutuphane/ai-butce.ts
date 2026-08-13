/**
 * AI AYLIK BUTCE — OKUMA VE DURUM HESABI (13.08).
 *
 * ── NEDEN "KALAN BAKIYE" DEGIL "BUTCE" ─────────────────────────────────────
 * Kullanici "kalan bakiye" istedi. Saglayici API'leri (Anthropic/Google/
 * OpenRouter) normal mesaj ucundan HESAP BAKIYESI DONDURMEZ — bakiye ancak
 * org-seviyesi Admin API + AYRI bir admin anahtariyla okunabilir ve o anahtar
 * bu sistemde yok. Bakiyeyi "tahmin etmek" [[feedback-olcum-uydurma-yasak]]
 * ihlali olurdu: panel gercek gibi duran uydurma bir sayi gosterirdi.
 *
 * Bu yuzden olculebilen sey gosterilir: bu ay GERCEKTEN harcanan (AiUsageLog'
 * daki API olcumu) ve adminin kendi girdigi aylik butceye orani. Butce
 * girilmemisse yuzde HIC gosterilmez — 0'a bolup "%0 kullanildi" yazmak
 * "butce yok" ile "butce bos" durumunu ayni gosterirdi.
 *
 * ── NEDEN AYRI VE SAF MODUL ────────────────────────────────────────────────
 * Butce bir AYAR METNIDIR (`systemSettings` string tutar) ve metinden sayiya
 * gecis bu projede daha once para hatasi uretmis bir yerdir
 * ([[feedback-sarmalsiz-veya-sifir-deseni]]). `Number('')` ve `Number('  ')`
 * SIFIR doner — yani "butce girilmemis" durumu sarmalsiz bir okumada "butce
 * sifir" gibi gorunur ve sonraki bolme sonsuz/NaN uretir. Kriterler testle
 * muhurlu.
 */

/** Butce ayarinin `systemSettings` anahtari. */
export const AI_BUTCE_ANAHTARI = 'AI_MONTHLY_BUDGET_USD';

/**
 * Ayar metnini aylik butceye cevirir. Gecerli butce = SONLU ve POZITIF sayi.
 *
 * `null` = butce tanimli degil (yuzde/kalan HESAPLANMAZ, gosterilmez).
 *
 * ⚠ `Number(ham) || null` YAZILAMAZ: dogru ama bu ailenin hatasi tam da
 * sarmalsiz `||` — ayrica NaN/Infinity/negatif vakalari acikca elenmeli.
 * "50,5" kabul edilir: ayar alanina Turkce ondalik yazmak dogal.
 */
export function butceOku(ham: unknown): number | null {
  // Tip kapisi: `String(['50'])` → "50" olurdu, yani bozuk bir API cevabindaki
  // dizi butceye DONUSURDU. Metin/sayi disi her sey butce degildir.
  if (typeof ham !== 'string' && typeof ham !== 'number') return null;
  const sayi = Number(String(ham).trim().replace(',', '.'));
  // ⚠ `sayi <= 0` BOS AYARI DA ELER: `Number('')` ve `Number('  ')` SIFIR
  // doner — yani "butce girilmemis" burada yakalanir. Bu kontrol `< 0`a
  // gevsetilirse bos ayar "sifir butce" olur ve sonraki bolme sonsuz uretir.
  if (!Number.isFinite(sayi) || sayi <= 0) return null;
  return sayi;
}

export interface ButceDurumu {
  /** Adminin girdigi aylik butce (USD). */
  butce: number;
  /** Bu ay olculen gercek harcama (USD). */
  harcanan: number;
  /** Butceden geriye kalan. Asimda NEGATIF doner — gercek gizlenmez. */
  kalan: number;
  /** Harcamanin butceye orani (%). Asimda 100'u GECER. */
  yuzde: number;
  /** Ilerleme cubugu genisligi (%) — 0..100 kirpilmis GORSEL deger. */
  cubukYuzde: number;
  asildi: boolean;
}

/**
 * Butce durumu. Butce tanimli degilse `null` — cagiran taraf "butce girin"
 * gosterir.
 *
 * ⚠ `yuzde` KIRPILMAZ, `cubukYuzde` kirpilir: cubuk gorseldir, sayi olcudur.
 * Ikisini tek degere indirmek asimi (%180) ekranda "%100" olarak gosterirdi.
 */
export function butceDurumu(harcanan: unknown, butce: number | null): ButceDurumu | null {
  if (butce === null) return null;
  // ⚠ `Number.isFinite` SART: `NaN > 0` zaten false'tur ama `Infinity > 0`
  // DOGRU'dur — sonsuz harcama sonsuz yuzde uretir ve panel "%Infinity" yazar.
  const gercek = typeof harcanan === 'number' && Number.isFinite(harcanan) && harcanan > 0
    ? harcanan
    : 0;
  const yuzde = Math.round((gercek / butce) * 1000) / 10; // 1 ondalik
  return {
    butce,
    harcanan: gercek,
    kalan: Math.round((butce - gercek) * 10000) / 10000,
    yuzde,
    // Yalniz UST sinir kirpilir: `gercek` ve `butce` pozitif oldugu icin yuzde
    // negatif OLAMAZ; alt kirpma olculemeyen (dolayisiyla yanlis guven veren)
    // bir satir olurdu.
    cubukYuzde: Math.min(100, yuzde),
    // `>` DEGIL `>=` yazilirsa butceyi TAM doldurmak "asildi" sayilirdi.
    asildi: gercek > butce,
  };
}
