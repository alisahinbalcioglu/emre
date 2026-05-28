import { describe, it, expect } from 'vitest';
import { normalizeToMeters, detectDrawingUnit } from './unit-detection';

describe('normalizeToMeters (PRD ADIM 2)', () => {
  it('mm -> /1000', () => {
    expect(normalizeToMeters(1000, 'mm')).toBe(1);
    expect(normalizeToMeters(29212, 'mm')).toBeCloseTo(29.212);
  });
  it('cm -> /100', () => {
    expect(normalizeToMeters(100, 'cm')).toBe(1);
    expect(normalizeToMeters(29212, 'cm')).toBeCloseTo(292.12);
  });
  it('m -> /1', () => {
    expect(normalizeToMeters(5, 'm')).toBe(5);
  });
  it('tanimsiz birim -> fallback (ham deger)', () => {
    expect(normalizeToMeters(42, 'inch')).toBe(42);
  });
});

describe('detectDrawingUnit (PRD ADIM 1 — medyan heuristic)', () => {
  it('medyan > 800 -> mm', () => {
    expect(detectDrawingUnit([900, 1000, 1100])).toBe('mm');
  });
  it('medyan 15-800 -> cm', () => {
    expect(detectDrawingUnit([100, 200, 300])).toBe('cm');
  });
  it('medyan <= 15 -> m', () => {
    expect(detectDrawingUnit([5, 10, 12])).toBe('m');
  });
  it('sinir: medyan = 800 -> cm (>800 degil)', () => {
    expect(detectDrawingUnit([800, 800, 800])).toBe('cm');
  });
  it('sinir: medyan = 15 -> m (>15 degil)', () => {
    expect(detectDrawingUnit([15, 15, 15])).toBe('m');
  });
  it('sinir: medyan = 801 -> mm', () => {
    expect(detectDrawingUnit([801, 801, 801])).toBe('mm');
  });
  it('cift sayida eleman -> ortalama medyan', () => {
    // [10, 20] medyan = 15 -> m
    expect(detectDrawingUnit([10, 20])).toBe('m');
    // [10, 22] medyan = 16 -> cm
    expect(detectDrawingUnit([10, 22])).toBe('cm');
  });
  it('bos dizi -> mm (guvenli default)', () => {
    expect(detectDrawingUnit([])).toBe('mm');
  });
  it('negatif/sifir filtrelenir', () => {
    expect(detectDrawingUnit([0, -5, 900, 1000, 1100])).toBe('mm');
  });

  // KANIT testleri: PRD heuristic gercek test-1.dwg'de YANLIS sonuc verir.
  // Bu testler kural-dogrulugu icin (PRD'ye uygun) ama metrajin neden bozuldugunu belgeler.
  it('KANIT: test-1.dwg PIS SU medyan ~19 -> cm (gercek mm!)', () => {
    // 335 segment medyani 19.1 -> PRD cm der, gercek mm. normalizeToMeters ile 10x sisme.
    expect(detectDrawingUnit([19.1])).toBe('cm');
  });
  it('KANIT: test-1.dwg tum cizim medyan ~3 -> m (gercek mm!)', () => {
    expect(detectDrawingUnit([3.2])).toBe('m');
  });
});
