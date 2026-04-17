/**
 * Sheet adi ve ornek satir metinlerinden disiplin tahmini.
 * Deterministik (AI YOK), Turkce keyword listesi ile.
 */

const MECHANICAL_KEYWORDS = [
  'sihhi', 'sıhhi', 'havalandirma', 'havalandırma', 'yangin', 'yangın',
  'isitma', 'ısıtma', 'sogutma', 'soğutma', 'tesisat', 'mekanik',
  'klima', 'pompa', 'kazan', 'dogalgaz', 'doğalgaz', 'sprinkler',
  'boru', 'vana', 'fitting', 'radyator', 'radyatör', 'kombi',
  'hidrofor', 'genleşme', 'genlesme', 'pis su', 'temiz su',
  'cihazlar', 'mahaller', 'klimatizasyon', 'ventilasyon',
];

const ELECTRICAL_KEYWORDS = [
  'elektrik', 'aydinlatma', 'aydınlatma', 'zayif', 'zayıf',
  'kuvvetli', 'pano', 'kablo', 'priz', 'topraklama',
  'jenerator', 'jeneratör', 'ups', 'tesisat elektrik',
  'haberleşme', 'haberlesme', 'guvenlik', 'güvenlik',
  'kamera', 'cctv', 'yangin algilama', 'yangın algılama',
  'data', 'network', 'switch', 'router',
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/i̇/g, 'i');
}

export function detectSheetDiscipline(
  sheetName: string,
  sampleRowText: string,
): 'mechanical' | 'electrical' | null {
  const text = normalize((sheetName || '') + ' ' + (sampleRowText || ''));

  let mScore = 0;
  let eScore = 0;

  // Sheet adi 3x agirlikli
  const normalizedName = normalize(sheetName || '');
  for (const kw of MECHANICAL_KEYWORDS) {
    if (normalizedName.includes(normalize(kw))) mScore += 3;
  }
  for (const kw of ELECTRICAL_KEYWORDS) {
    if (normalizedName.includes(normalize(kw))) eScore += 3;
  }

  // Icerik (1x)
  for (const kw of MECHANICAL_KEYWORDS) {
    if (text.includes(normalize(kw))) mScore += 1;
  }
  for (const kw of ELECTRICAL_KEYWORDS) {
    if (text.includes(normalize(kw))) eScore += 1;
  }

  if (mScore === 0 && eScore === 0) return null;
  return mScore >= eScore ? 'mechanical' : 'electrical';
}
