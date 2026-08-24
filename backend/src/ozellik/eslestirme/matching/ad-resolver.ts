// ────────────────────────────────────────────
// AD COZUCU (3 Etiket Modeli — Excel sozluk seed'i uzerinde)
// Regex TYPE_PATTERNS tip cozemediginde ('diger') devreye girer:
// normalize contains + EN UZUN desen kazanir (TerminologyAlias S2 ile ayni).
// AD_SOZLUGU'ndaki YENI aile slug'lari MATERIAL_TYPE_TAGS'e katilir —
// boylece AD kilidi (must) sozluk aileleri icin de calisir.
// ────────────────────────────────────────────

import { AD_SOZLUGU, AD_ZENGINLESTIRME, AdSozlukGirdisi } from './ad-cins-sozlugu';
import { normalizeText } from './normalizer';

const ALL: AdSozlukGirdisi[] = [...AD_SOZLUGU, ...AD_ZENGINLESTIRME];

// Desen → slug, uzunluk sirali (en uzun once — "klima santrali" > "klima")
const PATTERNS: { p: string; slug: string }[] = ALL
  .flatMap((e) => e.patterns.filter((p) => p.length >= 3).map((p) => ({ p, slug: e.slug })))
  .sort((a, b) => b.p.length - a.p.length);

/** Yanlis-pozitif korumalari: desen → metinde gecmemesi gereken kelime. */
const NEGATIVE_GUARDS: Record<string, RegExp> = {
  // "kanalizasyon" hava kanali DEGILDIR (pis su regex/alias'i sahibi)
  kanal: /kanalizasyon/,
};

/** Yeni aile slug'lari (regex disinda sozlukten gelenler) — tip=must kilidi. */
export const AD_YENI_SLUGS: ReadonlySet<string> = new Set(AD_SOZLUGU.map((e) => e.slug));

/** DN'li sozluk aileleri — celik DN↔inc cevrimi uygulanir (metalTypeClass).
 *  ⚠ ALL'dan kurulur (24.08 olcum): AD_ZENGINLESTIRME'nin dnli:true bayragi
 *  (akis-anahtari, hortum, izolasyon, pompa) yalniz-AD_SOZLUGU kurulumunda
 *  OLU kaliyordu → resolveProductSizeClass 'unknown' donuyor, cap cevrimi
 *  celik+plastik BIRLESIMINE dusup yapay cift aday uretiyordu (ODE R-Flex:
 *  1/2'' hem dn15 hem dn20 esdegeri sayildi, tek urun yerine 2 aday cikti). */
export const AD_DNLI_SLUGS: ReadonlySet<string> = new Set(
  ALL.filter((e) => e.dnli).map((e) => e.slug),
);

/** slug → gosterim adi (3-Etiket onizleme AD kolonu). */
export const AD_DISPLAY: ReadonlyMap<string, string> = new Map(
  AD_SOZLUGU.map((e) => [e.slug, e.ad]),
);

export function resolveAd(text: string): string | null {
  return resolveAdDetayli(text)?.slug ?? null;
}

/**
 * resolveAd'in ESLESEN DESENI ve YERINI de bildiren hali.
 *
 * NEDEN GEREKLI: sozluk desenleri uzunluk sirali (longest-wins) ve cok
 * kelimeli olabilir; regex tarafi ise gevsek ve sirasiz. Iki taraf ayni
 * metinde carpistiginda "kim daha ozgul" sorusunu ancak eslesmenin YERI
 * cevaplar. Bkz. `extractMaterialTypeDetayli`.
 *
 * `resolveAd` bunun uzerine kuruldu — tek tarama, tek dogruluk kaynagi.
 */
export function resolveAdDetayli(
  text: string,
): { slug: string; desen: string; index: number } | null {
  const norm = normalizeText(text);
  for (const { p, slug } of PATTERNS) {
    const index = norm.indexOf(p);
    if (index < 0) continue;
    const guard = NEGATIVE_GUARDS[slug];
    if (guard && guard.test(norm)) continue;
    return { slug, desen: p, index };
  }
  return null;
}

/**
 * KAPSAMA USTUNLUGU — `[a, b)` araligini KAPSAYAN en uzun COK KELIMELI sozluk
 * desenini dondurur (yoksa null).
 *
 * NEDEN VAR — 06.08 olcumu (`test/sozluk-golgeleme-olcum.ts`):
 * `basIsimAilesi` metni sondan-parcalara bolup EN KISA cozulen parcada durur.
 * Bu, daha UZUN sozluk ifadesine hic sira gelmemesine yol aciyordu; 295 sozluk
 * deseninin 9'u OLU KODDU:
 *   "prefabrik boru yalitimi" → 'boru'  (izolasyon olmaliydi)
 *   "yangin hortumu dolabi"   → 'hortum'(yangin-dolabi olmaliydi)
 *   "y suzgec"                → 'suzgec'(pislik-tutucu olmaliydi — kodun KENDI
 *                                        yorumu bunun calistigini soyluyordu)
 *
 * KURAL: bir cozucu metnin bir parcasina kilitlendiginde, o parcayi ICINE ALAN
 * daha uzun bir sozluk ifadesi varsa SOZLUK kazanir. Sezgi: uzman o kelimeyi
 * ZATEN sahiplenmis — "vana ceketi" icindeki "vana" bir vana degildir.
 *
 * ⚠ KAPSAMIYORSA HICBIR SEY DEGISMEZ. Kural "sozluk her zaman kazanir" DEGIL:
 *   "yangin dolabi vanasi" → 'vana' ifadenin DISINDA → vana kalir (dogru).
 * Degisim yuzeyi bu yuzden KANITLANABILIR BICIMDE dardir.
 *
 * COK KELIME SARTI bilincli: tek kelimelik desenin gevsek regex'i yenmesi AYRI
 * bir sorudur ve OLCULMEDI (olculdugunde iki varyant ayni sonucu verdi —
 * `test/aile-oncelik-simulasyon.ts` K2c vs K2h). Dar olani secildi.
 */
const KAPSAYICI_DESENLER = PATTERNS.filter((x) => x.p.includes(' '));

export function sozlukKapsayan(
  normMetin: string,
  a: number,
  b: number,
): { slug: string; desen: string } | null {
  const uzunluk = b - a;
  for (const { p, slug } of KAPSAYICI_DESENLER) {
    // PATTERNS uzunluk sirali (en uzun once): bu noktadan sonrasi araligi
    // kapsayamayacak kadar kisa — tara.
    if (p.length < uzunluk) break;
    let from = 0;
    for (;;) {
      const idx = normMetin.indexOf(p, from);
      if (idx < 0) break;
      if (idx <= a && idx + p.length >= b) {
        const guard = NEGATIVE_GUARDS[slug];
        if (guard && guard.test(normMetin)) break;
        return { slug, desen: p };
      }
      from = idx + 1;
    }
  }
  return null;
}
