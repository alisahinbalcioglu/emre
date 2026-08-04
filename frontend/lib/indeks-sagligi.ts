/**
 * I7 — INDEKS SAGLIGI ROZETLERI (karar fonksiyonu)
 *
 * NEDEN AYRI DOSYA: karar `quotes/new/page.tsx` icindeki JSX'e gomuluydu ve
 * jsdom kurulu olmadigi icin test edilemiyordu. Bu bir refactor DEGIL —
 * test edilebilirlik icin en kucuk ayirma: hangi rozet cizilir sorusunun
 * cevabi saf fonksiyona alindi, metinler ve esikler AYNEN korundu.
 *
 * Backend kaynagi: matching.service.ts `indexHealth()` → { bayat, indekssiz }.
 *   bayat     = ProductIndex'e BAGLI ama indexVersion eski olan satirlar
 *               (motor istek aninda yeniden uretiyor → yavas).
 *   indekssiz = productIndexId NULL olan satirlar; urun tablosuna HIC bagli
 *               degil, motor satir metninden cikarim yapiyor (manuel/legacy).
 *               Marka bastan asagi indekssizse sonuc urun tablosu
 *               kalitesinde DEGILDIR (CAYIROVA vakasi).
 */

export type IndeksSagligi = { bayat: number; indekssiz: number };

export type IndeksUyarisi = {
  /** Rozet kimligi — React key ve testler icin. */
  tur: 'bayat' | 'indekssiz';
  sayi: number;
  etiket: string;
  baslik: string;
};

/**
 * Ekranda hangi indeks uyarilarinin cizilecegini belirler.
 * Sayisi 0 olan hicbir uyari uretilmez (yalanci pozitif yasagi).
 */
export function indeksUyarilari(saglik: IndeksSagligi | null | undefined): IndeksUyarisi[] {
  if (!saglik) return [];
  const uyarilar: IndeksUyarisi[] = [];

  const bayat = saglik.bayat ?? 0;
  if (bayat > 0) {
    uyarilar.push({
      tur: 'bayat',
      sayi: bayat,
      etiket: `⚠ ${bayat} satır eski indeks`,
      baslik:
        `${bayat} kütüphane satırı eski indeks sürümünde — eşleştirme her istekte yeniden ` +
        `hesaplıyor (yavaş). Kalıcı çözüm: yönetici "yeniden indeksleme" çalıştırmalı.`,
    });
  }

  const indekssiz = saglik.indekssiz ?? 0;
  if (indekssiz > 0) {
    uyarilar.push({
      tur: 'indekssiz',
      sayi: indekssiz,
      etiket: `⛔ ${indekssiz} satır ürün indeksine bağlı değil`,
      baslik:
        `${indekssiz} kütüphane satırı ürün indeksine hiç bağlı değil — eşleştirme bu ` +
        `satırlarda satır metninden çıkarım yapıyor, sonuç ürün tablosu kalitesinde ` +
        `DEĞİLDİR. Kalıcı çözüm: fiyat listesini yeniden yükleyin veya yönetici ` +
        `"yeniden indeksleme" çalıştırsın.`,
    });
  }

  return uyarilar;
}
