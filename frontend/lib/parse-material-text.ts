/**
 * parse-material-text — "Ø110 PVC BORU" gibi birlesik malzeme metnini
 * { cap, cins } olarak ayirir.
 *
 * Teklif grid'inin "Akilli Sutunlar" ozelligi: DWG bucket/kalem metni tek
 * string gelir; tabloda "Çapı" ve "Malzeme Cinsi" ayri sutunlarda gosterilir.
 * Eslesme/kayit tarafinda iki sutun tekrar birlestirilir (cap + cins) —
 * kaynak metin kaybolmaz.
 *
 * Desteklenen cap bicimleri (ILK eslesen alinir, metnin herhangi bir yerinde):
 *   Ø110  Ø 32.5  Ø110mm      (capraz sembol)
 *   DN50  dn 150               (nominal cap)
 *   1 1/4"  2½"  ½"  3/4"  2" (inc — ASCII ve unicode kesirler)
 *   200x100                    (dikdortgen kanal)
 *   110mm                      (milimetre)
 */

export interface ParsedMaterialText {
  /** Cap ifadesi — bulunamazsa bos string. Orijinal yazim korunur (trim'li). */
  cap: string;
  /** Cap cikarildiktan sonra kalan metin. Cap yoksa metnin tamami. */
  cins: string;
}

// SIRA ONEMLI: daha spesifik desenler once (bilesik kesir > tek kesir > tam sayi inc).
// Hepsi 'd' flag'siz, exec ile index aliriz.
const CAP_PATTERNS: RegExp[] = [
  /[ØøΦφ⌀]\s?\d+(?:[.,]\d+)?(?:\s?mm)?/i,          // Ø110, ø 32,5, Ø110mm
  /\bDN\s?\d+\b/i,                                    // DN50, dn 150
  /\d+\s+\d+\/\d+\s?(?:["″”]|inch|inç)?/i,           // 1 1/4", 2 1/2
  /\d+[¼½¾⅜⅝⅞]\s?(?:["″”]|inch|inç)?/i,             // 1¼", 2½
  /(?<![\d/])[¼½¾⅜⅝⅞]\s?(?:["″”]|inch|inç)?/i,      // ½", ¾
  /(?<![\d/])\d+\/\d+\s?(?:["″”]|inch|inç)?(?![\d/])/i, // 3/4", 1/2
  /\d+(?:[.,]\d+)?\s?["″”]/,                          // 2", 4″
  /\b\d+\s?[xX×]\s?\d+(?:\s?mm)?\b/,                  // 200x100 (kanal)
  /\b\d+(?:[.,]\d+)?\s?mm\b/i,                        // 110mm, 50 mm
];

/**
 * Birlesik malzeme metnini cap + cins olarak ayirir.
 * Cap tespit edilemezse: { cap: '', cins: <metin> }.
 */
export function parseMaterialText(raw: string): ParsedMaterialText {
  const text = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return { cap: '', cins: '' };

  for (const pattern of CAP_PATTERNS) {
    const m = pattern.exec(text);
    if (!m) continue;
    const cap = m[0].trim();
    // Cap ifadesini cikar, kalan metni topla
    const cins = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length))
      .replace(/\s+/g, ' ')
      .trim();
    return { cap, cins };
  }

  return { cap: '', cins: text };
}

/**
 * Cap + cins'i eslestirme/kayit icin tek metne birlestirir.
 * Orijinal DWG bucket bicimiyle uyumlu: cap once ("Ø110 PVC BORU").
 * Ikisi de bossa bos string.
 */
export function joinMaterialText(cap: string | undefined, cins: string | undefined): string {
  return [String(cap ?? '').trim(), String(cins ?? '').trim()].filter(Boolean).join(' ');
}
