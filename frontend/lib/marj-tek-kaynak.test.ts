/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ADIM 6 KAPISI — MARJ TEK KAYNAK (Kar Analizi onkosul turu, 06.08)
 *
 *  KORUNAN KURAL (Z3 muhru + kullanici modeli): satis = kanonik
 *  `hesaplaSatisBirimFiyat` (yukarıYuvarla, 1 hane), satir toplami = kanonik
 *  `hesaplaSatirToplam`. Marj carpimi pricing.ts DISINDA ELLE YAZILMAZ.
 *
 *  NEDEN — ADIM 1 olcumu: marj 14 kod noktasinda carpiliyordu; 5'i kanonigi
 *  ATLAYIP ham `net*(1+kar/100)` + toFixed(2) yaziyordu (quotes/new legacy
 *  tablo yolu). Ayni girdi iki yolda FARKLI sayi uretiyordu:
 *      net=105.86, kar=%10 → kanonik 116.5 · ham 116.45 (416 satirda binler)
 *  Kar satiri bu sayilarin FARKI olacagi icin iki yolun ayni sayiyi uretmesi
 *  on kosuldur — "yanlis toplamin altina yazilan kar, kar yazmamaktan kotudur".
 *
 *  IKI BLOK:
 *   A) KAYNAK TARAMASI — kapsam dosyalarinda pricing.ts disinda ham marj
 *      carpimi deseni YASAK. Kirmizi-once: mevcut kodda 5 eslesme bekleniyor.
 *   B) SAYISAL — kanonik ciftin urettigi deger + ham carpimin SAPTIGI kanit.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { hesaplaSatisBirimFiyat, hesaplaSatirToplam } from '../ozellik/fiyat/pricing';

describe('ADIM 6 — marj tek kaynak', () => {
  it('A) kapsam dosyalarinda HAM marj carpimi yok (pricing.ts disi yasak)', () => {
    // Kapsam: teklif ekrani + grid + fill-down (ADIM 1'in taradigi dosyalar).
    const kok = path.resolve(__dirname, '..');
    const dosyalar = [
      'app/(protected)/quotes/new/page.tsx',
      'ozellik/tablo/excel-grid/ExcelGrid.tsx',
      'ozellik/tablo/excel-grid/fill-down.ts',
    ];
    // Ham desen: `* (1 + <bir sey> / 100)` — kanonik fonksiyonun icinde durur,
    // baska yerde gorulmesi marjin elle carpildigi anlamina gelir.
    // (Tersine bolme `/(1 + kar/100)` YASAK DEGIL: ekran hucresi satis tasir,
    // elle girilen satistan maliyeti geri turetmek modelin kendisi —
    // ExcelGrid:2533/2546 bilincli davranis.)
    const hamDesen = /\*\s*\(1\s*\+\s*[^)]*\/\s*100\)/g;
    const bulgular: string[] = [];
    for (const d of dosyalar) {
      const icerik = fs.readFileSync(path.join(kok, d), 'utf8');
      const satirlar = icerik.split('\n');
      satirlar.forEach((s, i) => {
        const t = s.trim();
        // Yorum satiri KOD degildir — fill-down.ts:100 gecmis ham carpimi
        // ANLATIYOR (ders notu), uygulamıyor. Kapi zayiflamiyor: kod satiri
        // olan her eslesme yine yakalanir.
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        if (hamDesen.test(t)) bulgular.push(`${d}:${i + 1}  ${t.slice(0, 80)}`);
        hamDesen.lastIndex = 0;
      });
    }
    expect(bulgular, `HAM marj carpimi bulundu (kanonik hesaplaSatisBirimFiyat kullanilmali):\n${bulgular.join('\n')}`).toEqual([]);
  });

  it('B1) kanonik cift: net=105.86 kar=%10 → satis 116.5 (1 hane YUKARI)', () => {
    expect(hesaplaSatisBirimFiyat(105.86, 10)).toBe(116.5);
  });

  it('B2) ham carpimin sapmasi belgelenir: 105.86*1.1=116.446 ≠ kanonik 116.5', () => {
    // Bu test ham carpimi DOGRULAMAZ — sapmanin gercek oldugunu kayda gecirir.
    const ham = 105.86 * (1 + 10 / 100);
    expect(ham).toBeCloseTo(116.446, 3);
    expect(hesaplaSatisBirimFiyat(105.86, 10)).not.toBeCloseTo(ham, 2);
  });

  it('B3) kar %0 → satis = maliyet (kullanici modeli: "%0 maliyettir")', () => {
    // yukarıYuvarla 1 haneye yuvarlar: tam 1 hanelik maliyet AYNEN doner.
    expect(hesaplaSatisBirimFiyat(105.9, 0)).toBe(105.9);
    expect(hesaplaSatirToplam(105.9, 3)).toBe(317.7);
  });

  it('B4) toplam da kanonikten gecer: satis 116.5 × 3 = 349.5', () => {
    expect(hesaplaSatirToplam(hesaplaSatisBirimFiyat(105.86, 10), 3)).toBe(349.5);
  });
});
