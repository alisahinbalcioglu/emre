// Baslik-baglam yardimcilari (H4/C3) — ExcelGrid.tsx buildMaterialContext
// bunlari import eder. NOT (denetim 22.07, kullanici karari): plain-array
// reimplementasyon (buildMaterialContextFromArray/DetailedFromArray/
// findHeaderAbove + extractCapFromText) SILINDI — tek tuketicisi olan
// "Tum Sayfalari Fiyatlandir" {false&&} blogu 8139c56'da kaldirilmisti;
// ayni mantigin canli kopyasi ExcelGrid.tsx icinde yasar.


/**
 * B2 IKIZI (04.10): tipografik tirnaklari ASCII kesmeye cevirir.
 *
 * Arka uc `normalizer.normalizeText` bunu ZATEN yapiyor; buradaki iki olcut
 * ise HAM metne bakiyordu ve yalnizca ASCII kaliplari taniyordu. Sonuc: ofis
 * otomatik duzeltmesinin urettigi "1''" (U+2019 x2) satiri burada "olcusu
 * yok" sayilip yanlis bir baslikla zenginlestirilebiliyordu — iki taraf AYNI
 * metni FARKLI okuyordu.
 *
 * Kacisla yazilir ki editor/otomatik duzeltme karakteri sessizce degistiremesin
 * (arka uctaki kusur tam olarak oyle dogmustu: sinifin icindekiler tipografik
 * SANILAN iki ASCII kesme isaretiydi).
 * Kapi: build-material-context.test.ts "B2 IKIZ" blogu.
 */
function tirnakNormal(s: string): string {
  return s.replace(/[‘’ʼ′]/g, "'").replace(/[“”″]/g, '"');
}
/** H4: metin HERHANGI bir olcu ifadesi iceriyor mu? (DN, Ø, inc, mm, kesir, NNxN) */
export function hasSizeExpression(text: string): boolean {
  const t = tirnakNormal(text).toLowerCase().replace(/'{2}/g, '"').replace(/½/g, '1/2').replace(/¾/g, '3/4').replace(/¼/g, '1/4');
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
  // ⚠ Burada tirnak normalizasyonu YOK, bilerek (04.10 olculdu): zincirin SON
  // adimi harf disindaki HER karakteri atiyor, dolayisiyla tirnagin bicimi
  // sonucu DEGISTIREMEZ. Eklendi, 11 girdide olculdu, farki cikmadi (atil) ve
  // geri alindi. `hasSizeExpression` ise ham metinde kalip ariyor — orada
  // normalizasyon YUK TASIR ve duruyor.
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

/**
 * Bir metinden cap (DN) kodu cikarir — baslik baglaminin cap sanity check'i
 * (ExcelGrid `buildMaterialContextDetailed`). IKIZ: arka uc
 * `eslestirme/utils/build-material-context.ts` `extractCapFromText`.
 */
export function extractCapFromText(text: string): string | null {
  if (!text) return null;
  // Unicode kesirleri ASCII'ye cevir
  let normalized = text
    .replace(/2½/g, '2 1/2').replace(/1½/g, '1 1/2').replace(/1¼/g, '1 1/4')
    .replace(/½/g, '1/2').replace(/¼/g, '1/4').replace(/¾/g, '3/4')
    .toLowerCase();

  const inchToDn: Record<string, string> = {
    '1/2': 'dn15', '3/4': 'dn20', '1': 'dn25',
    '1 1/4': 'dn32', '1 1/2': 'dn40', '2': 'dn50',
    '2 1/2': 'dn65', '3': 'dn80', '4': 'dn100',
    '5': 'dn125', '6': 'dn150', '8': 'dn200',
  };

  // DN kodu varsa direkt kullan
  const dnMatch = normalized.match(/dn\s*(\d+)/);
  if (dnMatch) return `dn${dnMatch[1]}`;

  // Tum inc olculeri bul, EN SON kullaniyani al (gercek malzeme cap'i sonda olur)
  const matches: { value: string; index: number }[] = [];
  // 2 1/2", 1 1/4" gibi bilesik kesirler
  const compoundRegex = /(\d+)\s+(\d+)\/(\d+)/g;
  let m;
  while ((m = compoundRegex.exec(normalized)) !== null) {
    matches.push({ value: `${m[1]} ${m[2]}/${m[3]}`, index: m.index });
  }
  // 1/2", 3/4" gibi tek kesirler (ama compound'un parcasi olmamali)
  const fractionRegex = /(?<!\d\s)(\d+)\/(\d+)/g;
  while ((m = fractionRegex.exec(normalized)) !== null) {
    // Compound'un icindeyse atla
    const overlap = matches.some(x => x.index <= m!.index && x.index + x.value.length >= m!.index + m![0].length);
    if (!overlap) matches.push({ value: `${m[1]}/${m[2]}`, index: m.index });
  }
  // 1", 2", 3" gibi tam sayilar. SOL SINIR (05.10): kesrin paydasi ("3/4"in 4"u)
  // ya da bilesik kesrin parcasi tam sayi inc DEGILDIR — eskiden "en sondaki cap"
  // o payda oluyordu: 3/4" dn100, 1/2" dn50, 1 1/4" dn100.
  const intRegex = /(?<![\d/])(\d+)"/g;
  while ((m = intRegex.exec(normalized)) !== null) {
    const overlap = matches.some(x => x.index <= m!.index && x.index + x.value.length >= m!.index + m![0].length);
    if (!overlap) matches.push({ value: m[1], index: m.index });
  }

  if (matches.length === 0) return null;
  // En son bulunan cap (en yuksek index) — gercek malzeme adi sonda olur
  matches.sort((a, b) => b.index - a.index);
  const lastCap = matches[0].value;
  return inchToDn[lastCap] ?? null;
}
