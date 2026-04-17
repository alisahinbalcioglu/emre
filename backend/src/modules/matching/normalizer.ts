// ────────────────────────────────────────────
// Turkce Metin Normalizasyonu + Cap Donusumu
// AI gerektirmez — tamamen deterministik
// ────────────────────────────────────────────

/** Turkce karakterleri Latin'e cevir */
export function normalizeTurkish(s: string): string {
  return s
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ğĞ]/g, 'g')
    .replace(/i\u0307/g, 'i')
    .toLowerCase();
}

/** Unicode kesir karakterlerini ASCII'ye cevir */
export function normalizeUnicodeFractions(s: string): string {
  return s
    // Once bilesik kesirleri cevir (sira onemli!)
    .replace(/2½/g, '2 1/2')
    .replace(/1½/g, '1 1/2')
    .replace(/1¼/g, '1 1/4')
    // Sonra tek kesirleri cevir
    .replace(/½/g, '1/2')
    .replace(/¼/g, '1/4')
    .replace(/¾/g, '3/4')
    // Bitisik yazilmis kesirleri ayir: 11/2 → 1 1/2, 11/4 → 1 1/4, 21/2 → 2 1/2
    .replace(/(\d)(1\/2|1\/4|3\/4)/g, '$1 $2')
    .replace(/⅛/g, '1/8')
    .replace(/⅜/g, '3/8')
    .replace(/⅝/g, '5/8')
    .replace(/⅞/g, '7/8');
}

/** Tam normalizasyon: Turkce + unicode + bosluk temizleme */
export function normalizeText(s: string): string {
  let result = normalizeUnicodeFractions(s);
  result = normalizeTurkish(result);
  result = result
    .replace(/[""\u201C\u201D\u2033]/g, '"')  // fancy quotes → standard
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return result;
}

// ────────────────────────────────────────────
// Cap / Olcu Donusum Tablolari
// ────────────────────────────────────────────

/** DN kodu → tum varyasyonlar */
export const DIAMETER_MAP: Record<string, string[]> = {
  'dn15':  ['1/2', '1/2"', '15mm', '21.3mm', '21,3mm'],
  'dn20':  ['3/4', '3/4"', '20mm', '26.9mm', '26,9mm'],
  'dn25':  ['1"', '25mm', '33.7mm', '33,7mm'],
  'dn32':  ['1 1/4', '1 1/4"', '32mm', '42.4mm', '42,4mm'],
  'dn40':  ['1 1/2', '1 1/2"', '40mm', '48.3mm', '48,3mm'],
  'dn50':  ['2"', '50mm', '60.3mm', '60,3mm'],
  'dn65':  ['2 1/2', '2 1/2"', '65mm', '76.1mm', '76,1mm'],
  'dn80':  ['3"', '80mm', '88.9mm', '88,9mm'],
  'dn100': ['4"', '100mm', '114.3mm', '114,3mm'],
  'dn125': ['5"', '125mm', '139.7mm', '139,7mm'],
  'dn150': ['6"', '150mm', '165.1mm', '165,1mm'],
  'dn200': ['8"', '200mm', '219.1mm', '219,1mm'],
};

/** Ters map: herhangi bir varyasyondan DN koduna */
const REVERSE_DIAMETER: Record<string, string> = {};
for (const [dn, variants] of Object.entries(DIAMETER_MAP)) {
  REVERSE_DIAMETER[dn] = dn;
  for (const v of variants) {
    const clean = v.replace(/"/g, '').replace(/,/g, '.').trim();
    REVERSE_DIAMETER[clean] = dn;
  }
}

/**
 * Metin icinden cap/DN bilgisi cikar.
 * "Su ve Yangin Tesisat Borusu 1/2" DN15" → "dn15"
 * "GALVANiZ CELiK ½"" → "dn15"
 */
export function extractDiameter(text: string): string | null {
  const normalized = normalizeText(text);

  // Once DN kodlarini ara — TUM dn'leri bul, en sonuncuyu al (gercek malzeme cap'i sonda olur)
  const dnMatches = Array.from(normalized.matchAll(/dn\s*(\d+)/gi));
  if (dnMatches.length > 0) {
    if (dnMatches.length > 1) {
      console.warn(`[extractDiameter] Multi-DN: ${dnMatches.map((m) => 'dn' + m[1]).join(',')} → using last: dn${dnMatches[dnMatches.length - 1][1]}`);
    }
    const last = dnMatches[dnMatches.length - 1];
    const dn = `dn${last[1]}`;
    if (DIAMETER_MAP[dn]) return dn;
  }

  // Inc olculeri TUM bul, en sondakini al
  // Tip: { value: 'dnXX', index: number }
  const allInch: { dn: string; index: number }[] = [];

  // Bilesik kesirler: 2 1/2, 1 1/4
  const compoundRe = /(\d+)\s+(\d+)\/(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = compoundRe.exec(normalized)) !== null) {
    const key = `${m[1]} ${m[2]}/${m[3]}`;
    if (REVERSE_DIAMETER[key]) allInch.push({ dn: REVERSE_DIAMETER[key], index: m.index });
  }

  // Tek kesirler: 1/2, 3/4 (compound icinde olmasin)
  const fracRe = /(?<!\d\s)(\d+)\/(\d+)/g;
  while ((m = fracRe.exec(normalized)) !== null) {
    const overlap = allInch.some((x) => x.index <= m!.index && x.index + 5 >= m!.index);
    if (overlap) continue;
    const key = `${m[1]}/${m[2]}`;
    if (REVERSE_DIAMETER[key]) allInch.push({ dn: REVERSE_DIAMETER[key], index: m.index });
  }

  // Tam sayilar: 1", 2", 3"
  const intRe = /(\d+)"/g;
  while ((m = intRe.exec(normalized)) !== null) {
    const overlap = allInch.some((x) => x.index <= m!.index && x.index + 5 >= m!.index);
    if (overlap) continue;
    const key = m[1];
    if (REVERSE_DIAMETER[key]) allInch.push({ dn: REVERSE_DIAMETER[key], index: m.index });
  }

  if (allInch.length > 0) {
    if (allInch.length > 1) {
      console.warn(`[extractDiameter] Multi-inch: ${allInch.map((x) => x.dn).join(',')} → using last`);
    }
    // En son (en yuksek index) olani al
    allInch.sort((a, b) => b.index - a.index);
    return allInch[0].dn;
  }

  // mm olcu ara: 21.3mm, 48.3mm
  const mmMatches = Array.from(normalized.matchAll(/(\d+[.,]\d+)\s*mm/g));
  if (mmMatches.length > 0) {
    const last = mmMatches[mmMatches.length - 1];
    const mm = last[1].replace(',', '.');
    const key = `${mm}mm`;
    if (REVERSE_DIAMETER[key]) return REVERSE_DIAMETER[key];
  }

  return null;
}

// ────────────────────────────────────────────
// Yuzey Islemi Tespiti
// ────────────────────────────────────────────

const SURFACE_PATTERNS: { pattern: RegExp; tag: string }[] = [
  { pattern: /galvaniz/i, tag: 'galvaniz' },
  { pattern: /dkp/i, tag: 'galvaniz' },
  { pattern: /sicak\s*daldirma/i, tag: 'galvaniz' },
  { pattern: /siyah/i, tag: 'siyah' },
  { pattern: /kaynakli/i, tag: 'siyah' },
  { pattern: /\berw\b/i, tag: 'siyah' },
  { pattern: /kirmizi/i, tag: 'kirmizi' },
  { pattern: /boyali/i, tag: 'boyali' },
];

export function extractSurface(text: string): string | null {
  const normalized = normalizeText(text);
  for (const { pattern, tag } of SURFACE_PATTERNS) {
    if (pattern.test(normalized)) return tag;
  }
  return null;
}

// ────────────────────────────────────────────
// Baglanti Tipi Tespiti
// ────────────────────────────────────────────

const CONNECTION_PATTERNS: { pattern: RegExp; tag: string }[] = [
  { pattern: /disli/i, tag: 'disli' },
  { pattern: /threaded/i, tag: 'disli' },
  { pattern: /vidali/i, tag: 'disli' },
  { pattern: /mansanlu|mansonlu|mansonu/i, tag: 'disli' },
  { pattern: /kaynakli|welded/i, tag: 'kaynakli' },
  { pattern: /flansh|flans|flanged/i, tag: 'flans' },
  { pattern: /press|pres/i, tag: 'pres' },
  { pattern: /duz\s*uclu/i, tag: 'duz-uclu' },
];

export function extractConnection(text: string): string | null {
  const normalized = normalizeText(text);
  for (const { pattern, tag } of CONNECTION_PATTERNS) {
    if (pattern.test(normalized)) return tag;
  }
  return null;
}

// ────────────────────────────────────────────
// Malzeme Tipi Tespiti
// ────────────────────────────────────────────

const TYPE_PATTERNS: { pattern: RegExp; type: string }[] = [
  { pattern: /boru/i, type: 'boru' },
  { pattern: /\bpipe\b/i, type: 'boru' },
  { pattern: /vana/i, type: 'vana' },
  { pattern: /valve/i, type: 'vana' },
  { pattern: /valf/i, type: 'vana' },
  { pattern: /dirsek/i, type: 'fitting' },
  { pattern: /elbow/i, type: 'fitting' },
  { pattern: /reduksiyon/i, type: 'fitting' },
  { pattern: /reducer/i, type: 'fitting' },
  { pattern: /\bte\b/i, type: 'fitting' },
  { pattern: /tee/i, type: 'fitting' },
  { pattern: /manson/i, type: 'fitting' },
  { pattern: /coupling/i, type: 'fitting' },
  { pattern: /flans/i, type: 'flans' },
  { pattern: /flange/i, type: 'flans' },
  { pattern: /izolasyon/i, type: 'izolasyon' },
  { pattern: /insulation/i, type: 'izolasyon' },
  { pattern: /pompa/i, type: 'pompa' },
  { pattern: /pump/i, type: 'pompa' },
  { pattern: /radyator/i, type: 'radyator' },
  { pattern: /radiator/i, type: 'radyator' },
  { pattern: /montaj/i, type: 'montaj' },
  { pattern: /kombi/i, type: 'kombi' },
  { pattern: /klozet/i, type: 'vitrifiye' },
  { pattern: /lavabo/i, type: 'vitrifiye' },
  { pattern: /batarya/i, type: 'armatur' },
  { pattern: /musluk/i, type: 'armatur' },
  { pattern: /kablo/i, type: 'kablo' },
  { pattern: /pano/i, type: 'pano' },
  { pattern: /sigorta/i, type: 'sigorta' },
  { pattern: /kazan/i, type: 'kazan' },
  { pattern: /dogalgaz|dogal.?gaz/i, type: 'dogalgaz-boru' },
];

export function extractMaterialType(text: string): string {
  const normalized = normalizeText(text);
  for (const { pattern, type } of TYPE_PATTERNS) {
    if (pattern.test(normalized)) return type;
  }
  return 'diger';
}

// ────────────────────────────────────────────
// Malzeme Cinsi Tespiti
// ────────────────────────────────────────────

const MATERIAL_PATTERNS: { pattern: RegExp; tag: string }[] = [
  // Celik boru varyasyonlari: siyah boru, su ve yangin tesisat borusu, basincli boru = celik
  { pattern: /celik|steel|\bst\b/i, tag: 'celik' },
  { pattern: /su\s*ve\s*yangin\s*tesisat/i, tag: 'celik' },
  { pattern: /basincli\s*boru/i, tag: 'celik' },
  { pattern: /siyah.*boru|boru.*siyah/i, tag: 'celik' },
  { pattern: /\bppr\b|\bpprc\b|polipropilen/i, tag: 'ppr' },
  { pattern: /\bpe\b|polietilen/i, tag: 'pe' },
  { pattern: /\bpvc\b|polivinil/i, tag: 'pvc' },
  { pattern: /\bhdpe\b/i, tag: 'hdpe' },
  { pattern: /\bbakir\b|copper/i, tag: 'bakir' },
  { pattern: /\baluminyum\b|aluminum/i, tag: 'aluminyum' },
  { pattern: /pirinc|brass/i, tag: 'pirinc' },
  { pattern: /dokum|cast\s*iron/i, tag: 'dokum' },
  { pattern: /paslanmaz|stainless/i, tag: 'paslanmaz' },
  { pattern: /bronz|bronze/i, tag: 'bronz' },
  { pattern: /dogalgaz|dogal\s*gaz/i, tag: 'dogalgaz' },
  { pattern: /yangin/i, tag: 'yangin' },
  { pattern: /\bsu\b/i, tag: 'su' },
];

export function extractMaterialKind(text: string): string[] {
  const normalized = normalizeText(text);
  const kinds: string[] = [];
  for (const { pattern, tag } of MATERIAL_PATTERNS) {
    if (pattern.test(normalized)) kinds.push(tag);
  }
  return kinds;
}

// ────────────────────────────────────────────
// Et Kalinligi Tespiti
// ────────────────────────────────────────────

/**
 * "Et 2.6mm", "- 9 mm", "Et 3.2mm" gibi et kalinligi cikarir.
 * Dondurur: "et-2.6" veya "et-9" gibi etiket
 */
export function extractWallThickness(text: string): string | null {
  const normalized = normalizeText(text);
  // "et X.Xmm" veya "et X mm"
  const etMatch = normalized.match(/et\s+(\d+[.,]?\d*)\s*mm/i);
  if (etMatch) {
    return `et-${etMatch[1].replace(',', '.')}`;
  }
  // "- 9 mm", "- 19 mm" (tire + sayi + mm)
  const dashMatch = normalized.match(/-\s*(\d+[.,]?\d*)\s*mm/);
  if (dashMatch) {
    return `et-${dashMatch[1].replace(',', '.')}`;
  }
  return null;
}

// ────────────────────────────────────────────
// Dis Cap Tespiti
// ────────────────────────────────────────────

/**
 * "Dis Cap 21.3mm", "Dış Çap 48.3mm" gibi dis cap cikarir.
 * Dondurur: "dc-21.3" gibi etiket
 */
export function extractOuterDiameter(text: string): string | null {
  const normalized = normalizeText(text);
  const match = normalized.match(/dis\s*cap\s*(\d+[.,]\d+)\s*mm/i);
  if (match) {
    return `dc-${match[1].replace(',', '.')}`;
  }
  return null;
}

// ────────────────────────────────────────────
// Ø (Cap Isareti) Parse
// ────────────────────────────────────────────

/**
 * "Ø50 mm", "Ø70 mm", "Ø100 mm" → DN koduna cevir
 */
export function extractODiameter(text: string): string | null {
  const match = text.match(/[Øø]\s*(\d+)\s*mm/i);
  if (!match) return null;
  const mm = parseInt(match[1], 10);
  // mm → DN eslestirme
  const mmToDn: Record<number, string> = {
    15: 'dn15', 20: 'dn20', 25: 'dn25', 32: 'dn32',
    40: 'dn40', 50: 'dn50', 65: 'dn65', 70: 'dn65',
    80: 'dn80', 100: 'dn100', 110: 'dn100',
    125: 'dn125', 150: 'dn150', 160: 'dn150',
    200: 'dn200', 250: 'dn250', 300: 'dn300',
  };
  return mmToDn[mm] ?? `od-${mm}`;
}

// ────────────────────────────────────────────
// Boru Standart Tespiti
// ────────────────────────────────────────────

const STANDARD_PATTERNS: { pattern: RegExp; tag: string }[] = [
  { pattern: /ts\s*en\s*10217/i, tag: 'en10217' },
  { pattern: /ts\s*en\s*iso\s*3183/i, tag: 'iso3183' },
  { pattern: /din\s*30670/i, tag: 'din30670' },
  { pattern: /ts\s*en\s*10255/i, tag: 'en10255' },
  { pattern: /din\s*2605/i, tag: 'din2605' },
  { pattern: /en\s*14366/i, tag: 'en14366' },
];

export function extractStandard(text: string): string | null {
  const normalized = normalizeText(text);
  for (const { pattern, tag } of STANDARD_PATTERNS) {
    if (pattern.test(normalized)) return tag;
  }
  return null;
}

// ────────────────────────────────────────────
// PVC / Izolasyon Alt Tipi
// ────────────────────────────────────────────

const SUBTYPE_PATTERNS: { pattern: RegExp; tag: string }[] = [
  { pattern: /sessiz/i, tag: 'sessiz' },
  { pattern: /atik\s*su/i, tag: 'atik-su' },
  { pattern: /basincli/i, tag: 'basincli' },
  { pattern: /pe\s*kapli/i, tag: 'pe-kapli' },
  { pattern: /folyo/i, tag: 'folyo' },
  { pattern: /kaucuk/i, tag: 'kaucuk' },
  { pattern: /camyunu|cam\s*yunu/i, tag: 'camyunu' },
  { pattern: /tasyu?nu|tas\s*yunu/i, tag: 'tasyunu' },
  { pattern: /sprink/i, tag: 'sprink' },
  { pattern: /yangin\s*dayanim/i, tag: 'yangin-dayanim' },
  { pattern: /drenaj/i, tag: 'drenaj' },
  { pattern: /sicak\s*ve\s*re-?sirkulasyon/i, tag: 'resirkulasyon' },
  { pattern: /gofrajli/i, tag: 'gofrajli' },
  { pattern: /aluminyum\s*sac/i, tag: 'aluminyum-sac' },
]

export function extractSubtype(text: string): string[] {
  const normalized = normalizeText(text);
  const subtypes: string[] = [];
  for (const { pattern, tag } of SUBTYPE_PATTERNS) {
    if (pattern.test(normalized)) subtypes.push(tag);
  }
  return subtypes;
}
