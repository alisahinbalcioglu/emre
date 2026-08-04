// Baslik-baglam yardimcilari (H4/C3) — ExcelGrid.tsx buildMaterialContext
// bunlari import eder. NOT (denetim 22.07, kullanici karari): plain-array
// reimplementasyon (buildMaterialContextFromArray/DetailedFromArray/
// findHeaderAbove + extractCapFromText) SILINDI — tek tuketicisi olan
// "Tum Sayfalari Fiyatlandir" {false&&} blogu 8139c56'da kaldirilmisti;
// ayni mantigin canli kopyasi ExcelGrid.tsx icinde yasar.

/** H4: metin HERHANGI bir olcu ifadesi iceriyor mu? (DN, Ø, inc, mm, kesir, NNxN) */
export function hasSizeExpression(text: string): boolean {
  const t = text.toLowerCase().replace(/'{2}/g, '"').replace(/½/g, '1/2').replace(/¾/g, '3/4').replace(/¼/g, '1/4');
  return /dn[\s-]*\d|[øØ]\s*\d|\d\s*(mm|inch|inc|inç)\b|\d\s*["']|\d+\/\d+|\bd\d{2,3}\b|\d{2,3}\s*x\s*\d/.test(t);
}

/** Malzeme TIPI kelimesi (boru/vana/dolap...) — C3 kendi-kendine-yeterlilik sinyali */
const TYPE_WORD_RE = /boru|pipe|vana|valve|valf|dirsek|elbow|reduksiyon|redüksiyon|tee|\bte\b|manşon|manson|coupling|flanş|flans|flange|izolasyon|insulation|pompa|pump|radyat|kombi|klozet|lavabo|batarya|musluk|kablo|pano|sigorta|kazan|dolap|dolab|sayaç|sayac|kolektör|kolektor|hidrofor|eşanjör|esanjor|vantilatör|klima|fan\b|anahtar|priz|sprinkler\b|sprink\b/i;

/**
 * C1/C3: satir yetim mi? Yetim = yalniz cap/sinif/kod tasiyor ("DN 25", "Ø32",
 * "1 1/4\"", "PN25"). Tip kelimesi iceren veya olcu disinda anlamli uzunlukta
 * metni olan satir KENDI KENDINE YETERLIDIR — baslik eklenmez.
 */
export function isSelfSufficientRow(text: string): boolean {
  if (TYPE_WORD_RE.test(text)) return true;
  // Olcu/PN ifadelerini soy, kalan harf sayisina bak
  const stripped = text
    .toLowerCase()
    .replace(/'{2}/g, '"')
    .replace(/dn[\s-]*\d+/g, ' ')
    .replace(/pn\s*\d+/g, ' ')
    .replace(/[øØ]\s*\d+/g, ' ')
    .replace(/\d+\s*(mm|inch|inc|inç)\b/g, ' ')
    .replace(/\d+\s+\d+\/\d+/g, ' ')
    .replace(/\d+\/\d+/g, ' ')
    .replace(/\d+\s*["']*/g, ' ')
    .replace(/[^a-zçğıöşü]/gi, '');
  return stripped.length >= 12;
}
