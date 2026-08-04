/**
 * Shared tag kumeleri + nitelik (attr) yardimcilari.
 * Kullanicilar: outcome-mapper (buildAttrUyari), query-engine
 * (EQUIPMENT_TYPE_TAGS), matching.service (KIND_TAGS imza),
 * utils/etiket-display (etiket kumeleri + attrLabel).
 * NOT (denetim 22.07): v1 skorlayici kumesi (splitExcelTags/scoreCandidates/
 * narrowTopCandidates/buildCandidateList + yalniz onlarin kullandigi sabitler)
 * ec3a510 (Faz 2b sokum) + 29feb4f (labor v1 sokum) sonrasi cagrisiz kalmisti
 * — SILINDI (referans 0 + coverage 0 + git kaniti).
 */

import { AD_YENI_SLUGS } from './ad-resolver';

// ═══════════════════════════════════════════
// TAG KUMELERI
// ═══════════════════════════════════════════

export const SURFACE_TAGS = new Set<string>([
  'galvaniz', 'siyah', 'kirmizi', 'boyali',
]);

export const KIND_TAGS = new Set<string>([
  'celik', 'pirinc', 'dokum', 'paslanmaz', 'bronz', 'aluminyum',
  'bakir', 'ppr', 'pvc', 'pe', 'hdpe',
]);

export const CONNECTION_TAGS = new Set<string>([
  'disli', 'kaynakli', 'flans', 'pres', 'duz-uclu', 'yivli',
]);

/** Baz subtype kumesi — material tarafi ek EN/DIN kodlari ekler. */
export const BASE_SUBTYPE_KEYS = new Set<string>([
  'basincli', 'kazan', 'sessiz', 'drenaj', 'pe-kapli',
  'folyo', 'kaucuk', 'camyunu', 'tasyunu', 'sprink',
  'yangin-dayanim', 'gofrajli', 'aluminyum-sac',
  'izleme-anahtarli',
  // NOT: wafer/lug/orgulu SUBTYPE DEGIL — kelebek govdesinin/hortumun NORMAL
  // cins varyantidir (attr). Subtype yapmak alt-tip elemesini bozuyordu:
  // duz "KELEBEK VANA" satirinda tum adaylar subtype'li sayilip izleme-
  // anahtarlilar elenemiyordu (R19b).
]);

export const MATERIAL_SUBTYPE_KEYS = new Set<string>([
  ...BASE_SUBTYPE_KEYS,
  'en10217', 'iso3183', 'din30670', 'en10255', 'din2605',
]);

export const TAG_LABELS: Record<string, string> = {
  galvaniz: 'Galvanizli', siyah: 'Siyah', kirmizi: 'Kırmızı Boyalı', boyali: 'Boyalı',
  celik: 'Çelik', pirinc: 'Pirinç', dokum: 'Döküm', paslanmaz: 'Paslanmaz',
  bronz: 'Bronz', pvc: 'PVC', ppr: 'PPR', pe: 'PE', hdpe: 'HDPE',
  bakir: 'Bakır', aluminyum: 'Alüminyum',
  disli: 'Dişli Manşonlu', kaynakli: 'Kaynaklı', flans: 'Flanşlı',
  pres: 'Press', 'duz-uclu': 'Düz Uçlu', yivli: 'Yivli',
  'izleme-anahtarli': 'İzleme Anahtarlı',
  wafer: 'Wafer', lug: 'Lug Tip', orgulu: 'Örgülü',
};

/** Malzeme TIPI tag degerleri (extractMaterialType ciktilari) — must'ta kalir:
 *  tip uyusmazligi sessiz-yanlis eslesme uretir (boru yerine vana).
 *  E1 (Boru Disi Kalemler PRD): ekipman aileleri de tip=must ile KILITLENIR —
 *  sprinkler satirina Fan-Coil hortumu hicbir skorla aday olamaz. */
export const MATERIAL_TYPE_TAGS = new Set<string>([
  'boru', 'vana', 'fitting', 'flans', 'izolasyon', 'pompa', 'radyator',
  'kombi', 'vitrifiye', 'armatur', 'kablo', 'pano', 'sigorta', 'kazan',
  'dogalgaz-boru', 'montaj',
  'sprinkler', 'hortum', 'akis-anahtari', 'akis-olcer',
  // AD SOZLUGU (Excel seed): 44 yeni aile — yangin-dolabi, chiller, fan,
  // damper, kompansator, kondenstop, manometre... (ad-cins-sozlugu.ts)
  ...AD_YENI_SLUGS,
]);

/** E1: ekipman aileleri — cap zorunlulugu gevser (H3: uzunlukla eslesir),
 *  DN cevrimi celik tablosuyla yapilir (H4: DN 65 → 2 1/2").
 *  Sozluk aileleri de ekipman semantigindedir (kW/m³h/BTU olculu cihazlar
 *  capsiz eslesir; DN'li olanlarda cap yazilirsa sizeAnyOf yine filtreler). */
export const EQUIPMENT_TYPE_TAGS = new Set<string>([
  'sprinkler', 'hortum', 'akis-anahtari', 'akis-olcer',
  ...AD_YENI_SLUGS,
]);

// ── E3: EKIPMAN NITELIK TAG'LERI (temp-68, k-80, pendent, len-500, aks-*) ──

export function isAttrTag(t: string): boolean {
  return /^temp-\d+$/.test(t) || /^k-\d+$/.test(t) || /^len-\d+$/.test(t)
    || t === 'pendent' || t === 'upright' || t === 'sidewall' || t.startsWith('aks-')
    // E8: vana yuvalari da etiket/varyant kimligidir (kuresel gaz vanasi
    // farkli capta ayni yuvalarla aranir)
    || t.startsWith('vt-') || t.startsWith('akiskan-')
    // AD-CINS Sozlugu cins degerleri: kelebek govde tipi + hortum orgusu
    || t === 'wafer' || t === 'lug' || t === 'orgulu';
}

/** Nitelik tag'inin kullaniciya gosterilecek hali. */
export function attrLabel(t: string): string {
  if (t.startsWith('temp-')) return `${t.slice(5)}°C`;
  if (t.startsWith('k-')) return `K=${t.slice(2)}`;
  if (t.startsWith('len-')) return `${t.slice(4)} mm`;
  if (t === 'pendent') return 'Pendent (asma tavan)';
  if (t === 'upright') return 'Upright (dik)';
  if (t === 'sidewall') return 'Sidewall (duvar)';
  if (t === 'aks-rozet') return 'Rozetli';
  if (t === 'vt-kuresel') return 'Küresel';
  if (t === 'vt-surgulu') return 'Sürgülü';
  if (t === 'vt-kelebek') return 'Kelebek';
  if (t === 'vt-globe') return 'Globe';
  if (t === 'vt-bicakli') return 'Bıçaklı Sürgülü';
  if (t === 'vt-cek') return 'Çek Valf';
  if (t === 'vt-basinc-dusurucu') return 'Basınç Düşürücü';
  if (t === 'vt-motorlu') return 'Motorlu';
  if (t === 'vt-pnomatik') return 'Pnömatik';
  if (t === 'vt-selenoid') return 'Selenoid';
  if (t === 'vt-samandira') return 'Şamandıralı';
  if (t === 'vt-balans') return 'Balans';
  if (t === 'vt-igne') return 'İğne';
  if (t === 'vt-emniyet') return 'Emniyet';
  if (t === 'vt-purjor') return 'Purjör';
  if (t === 'vt-vakum') return 'Vakum Kırıcı';
  if (t === 'vt-alarm-islak') return 'Islak Alarm';
  if (t === 'vt-alarm-kuru') return 'Kuru Alarm';
  if (t === 'vt-test-drenaj') return 'Test & Drenaj';
  if (t === 'vt-dolum') return 'Dolum';
  if (t === 'vt-hidrolik') return 'Hidrolik Kontrol';
  if (t === 'vt-radyator') return 'Radyatör Vanası';
  if (t === 'vt-pislik-tutucu') return 'Pislik Tutucu';
  if (t === 'wafer') return 'Wafer';
  if (t === 'lug') return 'Lug Tip';
  if (t === 'orgulu') return 'Örgülü';
  if (t === 'akiskan-gaz') return 'Doğalgaz';
  if (t === 'akiskan-sivi') return 'Sıvı';
  if (t === 'akiskan-buhar') return 'Buhar';
  return t;
}

/** E3: nitelik KATEGORISI — ayni kategoride farkli deger = fark uyarisi
 *  ("68°C istendi — bu ürün 141°C"). */
function attrCategory(t: string): string | null {
  if (/^temp-\d+$/.test(t)) return 'temp';
  if (/^k-\d+$/.test(t)) return 'k';
  if (/^len-\d+$/.test(t)) return 'len';
  if (t === 'pendent' || t === 'upright' || t === 'sidewall') return 'mount';
  if (t === 'wafer' || t === 'lug') return 'govde';
  return null;
}

/** Aday, istenen niteligi FARKLI degerle tasiyorsa uyari metni uretir. */
export function buildAttrUyari(excelTags: string[], candidateTags: string[]): string | null {
  const wanted = new Map<string, string>();
  for (const t of excelTags) {
    const cat = attrCategory(t);
    if (cat && !wanted.has(cat)) wanted.set(cat, t);
  }
  if (wanted.size === 0) return null;
  const notes: string[] = [];
  for (const t of candidateTags) {
    const cat = attrCategory(t);
    if (!cat) continue;
    const want = wanted.get(cat);
    if (want && want !== t) {
      notes.push(`${attrLabel(want)} istendi — bu ürün ${attrLabel(t)}`);
    }
  }
  return notes.length > 0 ? notes.join(' · ') : null;
}
