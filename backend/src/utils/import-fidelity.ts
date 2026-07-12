// ────────────────────────────────────────────
// Admin fiyat listesi ICE AKTARIM SADAKATI yardimcilari (Duzeltme Talebi)
// Saf fonksiyonlar — DB'siz test edilir (test/admin-import-test.ts).
// ────────────────────────────────────────────

/** Y4 — TR sayi bicimi ayristirma.
 *  Kurallar:
 *   - number tipi → dogrudan.
 *   - ₺/TL/bosluk temizlenir.
 *   - Hem nokta hem virgul → nokta binlik, virgul ondalik (1.234,56).
 *   - Yalniz virgul → ondalik (540,50).
 *   - Yalniz nokta:
 *       birden fazla nokta → binlik (1.234.567)
 *       tek nokta + sonrasi tam 3 hane → BELIRSIZ (540.000: 540000 mu 540 mi?)
 *         → sessiz varsayim YOK, cagiran isaretler (Y4).
 *       tek nokta + sonrasi ≠3 hane → ondalik (540.5, 540.25)
 *   - Duz tam sayi → dogrudan. */
export function parseTrNumber(raw: unknown): { value: number | null; ambiguous: boolean } {
  if (typeof raw === 'number') {
    return isFinite(raw) ? { value: raw, ambiguous: false } : { value: null, ambiguous: false };
  }
  const s = String(raw ?? '')
    .replace(/[₺]|tl\b|try\b/gi, '')
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
      // 540.000 — TR binlik mi, ondalik mi? SESSIZ VARSAYIM YASAK (Y4)
      return { value: null, ambiguous: true };
    }
    const v = parseFloat(s);
    return { value: isNaN(v) ? null : v, ambiguous: false };
  }
  const v = parseFloat(s);
  return { value: isNaN(v) ? null : v, ambiguous: false };
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
