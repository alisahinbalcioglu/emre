// ────────────────────────────────────────────
// Admin fiyat listesi ICE AKTARIM SADAKATI yardimcilari (Duzeltme Talebi)
// Saf fonksiyonlar — DB'siz test edilir (test/admin-import-test.ts).
// ────────────────────────────────────────────

/** Z2 — dosya duzeyinde verilen "tek nokta + 3 hane" yorumu karari. */
export type DotMeaning = 'thousands' | 'decimal';

/** Y4 — TR sayi bicimi ayristirma.
 *  Kurallar:
 *   - number tipi → dogrudan.
 *   - ₺/$/€/TL/USD/EUR/bosluk temizlenir (para birimi ayri tespit edilir, Z4).
 *   - Hem nokta hem virgul → nokta binlik, virgul ondalik (1.234,56).
 *   - Yalniz virgul → ondalik (540,50).
 *   - Yalniz nokta:
 *       birden fazla nokta → binlik (1.234.567)
 *       tek nokta + sonrasi tam 3 hane → BELIRSIZ (540.000: 540000 mu 540 mi?)
 *         → dotMeaning verilmisse o yorumla cozulur (Z2 tek-soru karari),
 *           verilmemisse sessiz varsayim YOK, cagiran isaretler (Y4).
 *       tek nokta + sonrasi ≠3 hane → ondalik (540.5, 540.25)
 *   - Duz tam sayi → dogrudan. */
export function parseTrNumber(
  raw: unknown,
  dotMeaning?: DotMeaning | null,
): { value: number | null; ambiguous: boolean } {
  if (typeof raw === 'number') {
    return isFinite(raw) ? { value: raw, ambiguous: false } : { value: null, ambiguous: false };
  }
  const s = String(raw ?? '')
    .replace(/[₺$€]|tl\b|try\b|usd\b|eur\b/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!s) return { value: null, ambiguous: false };
  if (!/^[-+]?[\d.,]+$/.test(s)) return { value: null, ambiguous: false };

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // Son ayirici ondaliktir; digeri binlik. TR tipik: 1.234,56
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    const dec = lastComma > lastDot ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    const v = parseFloat(s.split(thou).join('').replace(dec, '.'));
    return { value: isNaN(v) ? null : v, ambiguous: false };
  }
  if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 2) {
      // 1,234,567 → virgul binlik (EN bicimi)
      const v = parseFloat(parts.join(''));
      return { value: isNaN(v) ? null : v, ambiguous: false };
    }
    const v = parseFloat(s.replace(',', '.'));
    return { value: isNaN(v) ? null : v, ambiguous: false };
  }
  if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) {
      const v = parseFloat(parts.join(''));
      return { value: isNaN(v) ? null : v, ambiguous: false };
    }
    if (parts[1]?.length === 3 && parts[0].length >= 1) {
      // 540.000 — TR binlik mi, ondalik mi?
      // Z2: dosya duzeyinde karar verilmisse onunla cozulur; yoksa BELIRSIZ
      // (sessiz varsayim yasak, Y4).
      if (dotMeaning === 'thousands') {
        const v = parseFloat(parts.join(''));
        return { value: isNaN(v) ? null : v, ambiguous: false };
      }
      if (dotMeaning === 'decimal') {
        const v = parseFloat(s);
        return { value: isNaN(v) ? null : v, ambiguous: false };
      }
      return { value: null, ambiguous: true };
    }
    const v = parseFloat(s);
    return { value: isNaN(v) ? null : v, ambiguous: false };
  }
  const v = parseFloat(s);
  return { value: isNaN(v) ? null : v, ambiguous: false };
}

/** Z4 — para birimi tespiti (hucre/kolon/baslik metninden). Cevrim YAPILMAZ,
 *  yalniz etiketlenir. */
export function detectCurrency(val: unknown): 'TRY' | 'USD' | 'EUR' | null {
  const s = String(val ?? '');
  if (/USD|\$|DOLAR/i.test(s)) return 'USD';
  if (/EUR|€|AVRO/i.test(s)) return 'EUR';
  if (/TRY|TL|₺/i.test(s)) return 'TRY';
  return null;
}

/** Z1 — KOLON DUZEYINDE bicim cikarimi: fiyat kolonundaki TUM ham degerler
 *  birlikte analiz edilir. Ayni dosyadaki tum degerler ayni bicim kuraliyla
 *  yazilmistir; bir kez karar verilir, satir satir soru sorulmaz.
 *
 *  Kanit toplama (yalniz string degerler — number hucreler bicimden bagimsiz):
 *   - "1.234,56" / "540,50" / "1.234.567"  → nokta = BINLIK kaniti
 *   - "1,234.56" / "540.5" / "540.25"      → nokta = ONDALIK kaniti
 *   - "540.000" (tek nokta + tam 3 hane)   → belirsiz aday (kanit degil)
 *
 *  Sonuc:
 *   - Tek yonde kanit varsa → dotMeaning kesin, soru SORULMAZ (F5).
 *   - Kanit yok/celiskili + belirsiz aday varsa → dosya basina TEK soru (Z2). */
export function inferPriceFormat(rawValues: unknown[]): {
  dotMeaning: DotMeaning | null;
  ambiguousCount: number;
  samples: string[];
} {
  let thousandsEvidence = 0;
  let decimalEvidence = 0;
  let ambiguousCount = 0;
  const samples: string[] = [];

  for (const raw of rawValues) {
    if (typeof raw !== 'string') continue;
    const s = raw
      .replace(/[₺$€]|tl\b|try\b|usd\b|eur\b/gi, '')
      .replace(/\s+/g, '')
      .trim();
    if (!s || !/^[-+]?[\d.,]+$/.test(s)) continue;

    const hasDot = s.includes('.');
    const hasComma = s.includes(',');

    if (hasDot && hasComma) {
      // Son ayirici ondalik: 1.234,56 → nokta binlik; 1,234.56 → nokta ondalik
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) thousandsEvidence++;
      else decimalEvidence++;
      continue;
    }
    if (hasComma) {
      // Yalniz virgul (540,50) → virgul ondalik → nokta binlik olmali (TR)
      if (s.split(',').length === 2) thousandsEvidence++;
      continue;
    }
    if (hasDot) {
      const parts = s.split('.');
      if (parts.length > 2) {
        // 1.234.567 → nokta binlik
        thousandsEvidence++;
      } else if (parts[1]?.length === 3 && parts[0].length >= 1) {
        // 540.000 → belirsiz aday
        ambiguousCount++;
        if (samples.length < 3 && !samples.includes(raw.trim())) samples.push(raw.trim());
      } else {
        // 540.5 / 540.25 → nokta ondalik
        decimalEvidence++;
      }
    }
  }

  let dotMeaning: DotMeaning | null = null;
  if (thousandsEvidence > 0 && decimalEvidence === 0) dotMeaning = 'thousands';
  else if (decimalEvidence > 0 && thousandsEvidence === 0) dotMeaning = 'decimal';
  // Celiskili kanit (ikisi de var) → guvenli taraf: karar verme, soru sor.

  return { dotMeaning, ambiguousCount, samples };
}

/** Z6 — mantik kontrolu: secilen bicim yorumuyla olusan fiyatlar makullluk
 *  testinden gecirilir. Ayni kategori icinde medyana gore ×1000 sapma ve
 *  sifir/negatif fiyat isaretlenir (onizlemede gosterilir, satir ATILMAZ). */
export function flagPriceOutliers(
  items: { price: number | null; kategori?: string | null }[],
): (string | null)[] {
  // Kategori bazli gruplar ("benzer urunler"); kategorisiz satirlar tek grup.
  const groups = new Map<string, number[]>();
  for (const it of items) {
    if (it.price == null || it.price <= 0) continue;
    const key = it.kategori ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it.price);
  }
  const medians = new Map<string, number>();
  for (const [key, vals] of groups) {
    if (vals.length < 3) continue; // 1-2 elemanli grupta medyan anlamsiz
    const sorted = [...vals].sort((a, b) => a - b);
    medians.set(key, sorted[Math.floor(sorted.length / 2)]);
  }

  return items.map((it) => {
    if (it.price == null) return null;
    if (it.price < 0) return 'negatif fiyat';
    if (it.price === 0) return 'sıfır fiyat';
    const med = medians.get(it.kategori ?? '');
    if (med && med > 0) {
      const ratio = it.price / med;
      // Binlik-ayraci hatasi ~×1000 civarinda salinir (medyan kiyasinda
      // 900-1100 arasi degerler tipik) → esik 900.
      if (ratio >= 900) return `kategori medyanının ×${Math.round(ratio)} katı`;
      if (ratio <= 1 / 900) return `kategori medyanının 1/${Math.round(1 / ratio)}'i`;
    }
    return null;
  });
}

/** Y1 — kategori basligi yuruyusu icin satir gorunumu (saf test edilebilir). */
export interface ImportRowView {
  isDataRow: boolean;
  name: string;
  priceRaw: unknown;
}

/** Bir satir KATEGORI BASLIGI mi? Veri satiri degil + isim dolu + fiyat bos.
 *  (Kesif tarafindaki H1/H2/H4 mantiginin import karsiligi.) */
export function isCategoryRow(r: ImportRowView): boolean {
  if (r.isDataRow) return false;
  const name = (r.name ?? '').trim();
  if (name.length < 2) return false;
  const price = String(r.priceRaw ?? '').trim();
  return price === '' || price === '0';
}

/** Baslik metni normalize edilmeden BIREBIR kategori olarak kullanilir (Y3). */
export function walkCategories(rows: ImportRowView[]): (string | null)[] {
  const out: (string | null)[] = [];
  let aktif: string | null = null;
  for (const r of rows) {
    if (isCategoryRow(r)) aktif = r.name.trim();
    out.push(r.isDataRow ? aktif : null);
  }
  return out;
}

/** Y2 — kolon rolu tespiti: header adindan cins/cap kolonlarini bul.
 *  Bilinen role oturmayan kolonlar EK ALAN olarak korunur (dusurulmez). */
export function detectExtraRoles(
  headers: { field: string; headerName: string }[],
): { cinsField?: string; capField?: string } {
  const norm = (s: string) => s
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c').replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o').replace(/[ğĞ]/g, 'g').toLowerCase().trim();
  let cinsField: string | undefined;
  let capField: string | undefined;
  for (const h of headers) {
    const t = norm(h.headerName ?? '');
    if (!cinsField && /(^|\s)(malzeme\s*)?cinsi?($|\s)/.test(t) && !/tanim|ad/.test(t)) cinsField = h.field;
    if (!capField && /(^|\s)cap(i|lar)?($|\s)|olcu/.test(t)) capField = h.field;
  }
  return { cinsField, capField };
}
