// ────────────────────────────────────────────
// Iskonto % toplu islem yardimcilari (Iskonto Surukle-Doldur PRD S1-S6)
// SAF fonksiyonlar — vitest ile test edilir (discount-utils.test.ts).
// ────────────────────────────────────────────
import { yuzdeOku } from '../../fiyat/sayi-alani';

/** Iskonto degeri 0-100 araligina sabitlenir; okunamayan deger 0. */
export function clampDiscount(v: number): number {
  if (isNaN(v) || v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

/** Serbest metin iskonto girisi ("%30", "30,5", "30.5") → sayi.
 *  Yuzde okuma kurali TEK kaynaktan (`yuzdeOku`) — kar hucresiyle ayni. */
export function parseDiscountInput(raw: string): number {
  return clampDiscount(yuzdeOku(raw) ?? NaN);
}

/**
 * Iskonto HUCRESINE elle yazilan deger (ExcelGrid valueParser).
 *
 * ⚠ K5 (para dogrulugu turu, 14.09 — olculdu): hucre kendi
 * `parseFloat(... .replace(',', '.'))` kopyasini tasiyordu ve "%30" / " %15 " /
 * "%12,5" SESSIZCE 0 oluyordu (net = liste); ayni metin "tum listeye uygula"
 * kutusunda ve yapistirmada 30 okunuyordu. Tek yol: `parseDiscountInput`.
 */
export function iskontoHucresiOku(v: unknown): number {
  return parseDiscountInput(typeof v === 'number' ? String(v) : String(v ?? ''));
}

/** S3 — Excel'den yapistirilan cok satirli iskonto kolonu → deger dizisi.
 *  Her satirin ILK kolonu alinir (tab ayracli kopyalarda), bos satirlar
 *  atlanir (Excel kopyasi sona bos satir ekler). */
export function parseDiscountPaste(text: string): number[] {
  return String(text ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.split('\t')[0].trim())
    .filter((line) => line !== '')
    .map((line) => parseDiscountInput(line));
}
