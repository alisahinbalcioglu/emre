// ────────────────────────────────────────────
// Iskonto % toplu islem yardimcilari (Iskonto Surukle-Doldur PRD S1-S6)
// SAF fonksiyonlar — vitest ile test edilir (discount-utils.test.ts).
// ────────────────────────────────────────────
import { insanSayiOku, yuzdeOku, type SayiGirdisi } from '../../fiyat/sayi-alani';

/** Iskonto degeri 0-100 araligina sabitlenir; okunamayan deger 0. */
export function clampDiscount(v: number): number {
  if (isNaN(v) || v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

/** Serbest metin iskonto girisi ("%30", "30,5", "30.5") → sayi — INSAN SINIRI
 *  (grup kutusu, "tum listeye uygula" kutusu). Yuzde kurali TEK kaynaktan
 *  (`insanSayiOku`, kar hucresiyle ayni).
 *
 *  ⚠ A2 (tur 3, olculdu): eski hali "abc"yi 0 okuyordu — "tum listeye uygula"
 *  kutusuna yanlislikla yazilan metin BUTUN listenin iskontosunu 0'a cekerdi;
 *  "1.250" 1,25 okunuyordu. Sayi degil / belirsiz / bos → `null`: cagiran
 *  UYGULAMAZ ve `sayiUyarisi` ile uyarir. */
export function parseDiscountInput(raw: string): number | null {
  const r = insanSayiOku(raw, 'iskonto');
  return r.tur === 'sayi' ? clampDiscount(r.deger) : null;
}

/**
 * Iskonto hucresinde SAKLI deger (surukle-doldur KAYNAGI) — MAKINE okuyucusu.
 *
 * ⚠ K5 (para dogrulugu turu, 14.09 — olculdu): hucre kendi
 * `parseFloat(... .replace(',', '.'))` kopyasini tasiyordu ve "%30" SESSIZCE 0
 * oluyordu. A2 (tur 3): kullanicinin YAZDIGI deger bu fonksiyona gelmez —
 * hucrenin valueParser'i (`hucreGirdisiCoz`, insan siniri) once sayiya cevirir;
 * burasi saklanmis sayiyi okur. Eski hali sayiyi metne cevirip insan kuralina
 * sokuyordu (saklanmis 12.125 → "12.125" → yanlis sinif).
 */
export function iskontoHucresiOku(v: unknown): number {
  return clampDiscount(yuzdeOku(v) ?? NaN);
}

/** S3 yapistirma satiri: ham metin + sinif + uygulanacak deger (`null` = YAZILMAZ). */
export interface IskontoYapistirmaSatiri {
  ham: string;
  girdi: SayiGirdisi;
  deger: number | null;
}

/** S3 — Excel'den yapistirilan cok satirli iskonto kolonu → satir listesi.
 *  Her satirin ILK kolonu alinir (tab ayracli kopyalarda), bos satirlar
 *  atlanir (Excel kopyasi sona bos satir ekler).
 *
 *  ⚠ A2 (tur 3, olculdu): eski hali sayi dizisi donduruyordu ve "abc" satiri 0
 *  yaziyordu — VAR OLAN iskontoyu uyarisiz eziyordu ("35x240mm / 3 adet / abc"
 *  → 35, 3, 0). Sayi olmayan satir `deger: null` doner: satir POZISYON TUKETIR
 *  (hiza korunur) ama hedefin iskontosuna dokunulmaz, cagiran sayar ve uyarir. */
export function parseDiscountPaste(text: string): IskontoYapistirmaSatiri[] {
  return String(text ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.split('\t')[0].trim())
    .filter((line) => line !== '')
    .map((ham) => {
      const girdi = insanSayiOku(ham, 'iskonto');
      return { ham, girdi, deger: girdi.tur === 'sayi' ? clampDiscount(girdi.deger) : null };
    });
}
