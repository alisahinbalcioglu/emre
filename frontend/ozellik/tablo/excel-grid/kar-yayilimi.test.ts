/**
 * P2-1a — KAR% SURUKLE-DOLDUR MUHURLU FORMULU KULLANIR.
 *
 * KUSUR (ExcelGrid.tsx:1866-1869 / 1881-1884, satir ici hali):
 *   const finalPrice = netPrice * (1 + karVal / 100);          // yuvarlama YOK
 *   setDataValue(birimAlan, finalPrice.toFixed(2));            // 2 hane
 *   setDataValue(toplamAlan, (finalPrice * qty).toFixed(2));   // ham carpim
 * Ayni hucrelere diger TUM yollar `hesaplaSatirToplam(...).toFixed(1)` yazar
 * (ExcelGrid.tsx:2409-2410, 2449; fill-down.ts:224-225).
 *
 * Sonuc: kullanici kar%'i sururse ayni sutunda farkli para olusur.
 * Bu, 03.08'de kapanan "cift kar" (KL P1-b) ile AYNI SINIF hata.
 *
 * ⚠ BIR ASSERT TEK KRITERE.
 */
import { describe, it, expect } from 'vitest';
import { karYayilimi } from './fill-down';
import { hesaplaSatisBirimFiyat, hesaplaSatirToplam } from '../../fiyat/pricing';

describe('karYayilimi — kar% surukle-doldur', () => {
  it('birim fiyat YUKARI 1 haneye yuvarlanir (ham carpim degil)', () => {
    // 3019,2 × 1,10 = 3321,12 → muhurlu kural: 3321,2 (yukari, 1 hane)
    // Bozuk hali "3321.12" yazardi.
    expect(karYayilimi(3019.2, 10, 3)?.birim).toBe('3321.2');
  });

  it('satir toplami muhurlu formulden gelir (hesaplaSatirToplam)', () => {
    // Bozuk hali 3321.12 × 3 = "9963.36" yazardi; dogrusu 3321,2 × 3 = 9963,6
    expect(karYayilimi(3019.2, 10, 3)?.toplam).toBe('9963.6');
  });

  it('cikti HER ZAMAN tek ondalik hane tasir', () => {
    // Ikinci ondalik hane sizarsa (toFixed(2)) bu assert kirmizi yanar.
    const r = karYayilimi(1234.567, 7, 2);
    expect(r?.birim).toMatch(/^\d+\.\d$/);
  });

  it('toplam da tek ondalik hane tasir', () => {
    const r = karYayilimi(1234.567, 7, 2);
    expect(r?.toplam).toMatch(/^\d+\.\d$/);
  });

  it('kar 0 iken satis = net (yukari 1 hane)', () => {
    expect(karYayilimi(100, 0, 1)?.birim).toBe('100.0');
  });

  it('net fiyat yoksa hucreye dokunulmaz (null)', () => {
    // Mevcut davranis korunur: ExcelGrid `if (netPrice > 0)` ile giriyordu.
    expect(karYayilimi(0, 10, 5)).toBeNull();
  });

  it('urunun kendi formulleriyle birebir ayni sonucu verir', () => {
    // GENELLIK: tek bir ornege degil, formulun kendisine baglanir.
    for (const [net, kar, mik] of [[3019.2, 10, 3], [847.35, 23, 7], [12.4, 5, 1.5]] as const) {
      const satis = hesaplaSatisBirimFiyat(net, kar);
      expect(karYayilimi(net, kar, mik)).toEqual({
        birim: satis.toFixed(1),
        toplam: hesaplaSatirToplam(satis, mik).toFixed(1),
      });
    }
  });
});

// ── F6b KARDES (06.10): karisik kipte dovizli taraf 2 hane (karar 4) ─────────
// Izgaranin kar surukle-doldurmasi tarafin hanesini VERIR; verilmezse ₺ kurali
// (1 hane) — tl kipi ve ₺ taraf bayt bayt ayni.
describe('karYayilimi — taraf hanesi (coklu para birimi)', () => {
  it('2 hane: $12,31 × 1,10 = 13,541 → 13,55 (₺ kurali 13,6 yazardi)', () => {
    expect(karYayilimi(12.31, 10, 268, 2)?.birim).toBe('13.55');
  });

  it('2 hane toplam: 13,55 × 268 = 3631,40', () => {
    expect(karYayilimi(12.31, 10, 268, 2)?.toplam).toBe('3631.40');
  });

  it('hane verilmezse ₺ kurali aynen (1 hane)', () => {
    expect(karYayilimi(12.31, 10, 268)).toEqual({ birim: '13.6', toplam: '3644.8' });
  });
});
