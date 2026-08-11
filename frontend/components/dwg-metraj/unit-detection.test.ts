import { describe, it, expect, vi } from 'vitest';
import {
  normalizeToMeters,
  searchRadiusForUnit,
  unitLabelFromScale,
  UNIT_SCALE_TO_METER,
} from './unit-detection';

describe('UNIT_SCALE_TO_METER (tek gercek kaynak)', () => {
  it('sabit carpanlar', () => {
    expect(UNIT_SCALE_TO_METER.m).toBe(1);
    expect(UNIT_SCALE_TO_METER.cm).toBe(100);
    expect(UNIT_SCALE_TO_METER.mm).toBe(1000);
  });

  it('dm TABLODA OLMALI — eksikligi 100x metraj hatasi uretiyordu', () => {
    // Gercek proje: $INSUNITS "mm" diyordu, cizim DESIMETRE idi.
    // dm tabloda yokken normalizeToMeters ham degeri aynen donduruyordu.
    expect(UNIT_SCALE_TO_METER.dm).toBe(10);
    expect(normalizeToMeters(12867, 'dm')).toBeCloseTo(1286.7, 1);
  });

  it('emperyal birimler de tanimli', () => {
    expect(normalizeToMeters(39.37007874015748, 'inch')).toBeCloseTo(1);
    expect(normalizeToMeters(3.280839895013123, 'ft')).toBeCloseTo(1);
  });
});

describe('unitLabelFromScale (backend scale -> etiket)', () => {
  it('backendin dondurdugu metre-carpanini etikete cevirir', () => {
    expect(unitLabelFromScale(0.001)).toBe('mm');
    expect(unitLabelFromScale(0.01)).toBe('cm');
    expect(unitLabelFromScale(0.1)).toBe('dm');
    expect(unitLabelFromScale(1)).toBe('m');
    expect(unitLabelFromScale(0.0254)).toBe('inch');
  });
  it('standart olmayan carpan null doner (uydurma yok)', () => {
    expect(unitLabelFromScale(0.037)).toBeNull();
  });
});

describe('normalizeToMeters (rawLength / UNIT_SCALE_TO_METER)', () => {
  it('mm -> /1000', () => {
    expect(normalizeToMeters(1000, 'mm')).toBe(1);
    expect(normalizeToMeters(3810, 'mm')).toBeCloseTo(3.81);
  });
  it('cm -> /100', () => {
    expect(normalizeToMeters(100, 'cm')).toBe(1);
    expect(normalizeToMeters(381, 'cm')).toBeCloseTo(3.81);
  });
  it('m -> /1', () => {
    expect(normalizeToMeters(5, 'm')).toBe(5);
  });
  it('dm -> /10 (gercek projenin birimi)', () => {
    expect(normalizeToMeters(10, 'dm')).toBe(1);
    expect(normalizeToMeters(38.1, 'dm')).toBeCloseTo(3.81);
  });

  it('GERCEKTEN tanimsiz birim: ham deger doner AMA SESSIZ DEGIL', () => {
    // Sessiz fallback en tehlikeli hataydi: 'dm' tabloda yokken metraj 100x
    // yanlis cikiyor ve hicbir uyari verilmiyordu. Artik gurultulu.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(normalizeToMeters(42, 'fersah')).toBe(42);
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).toContain('fersah');
    spy.mockRestore();
  });
  it('10x senaryo: 381 raw, mm=0.381 vs cm=3.81 (kullanici dogru birimi secer)', () => {
    expect(normalizeToMeters(381, 'mm')).toBeCloseTo(0.381);
    expect(normalizeToMeters(381, 'cm')).toBeCloseTo(3.81);
  });
});

describe('searchRadiusForUnit (2.0 * UNIT_SCALE_TO_METER)', () => {
  it('mm -> 2000', () => {
    expect(searchRadiusForUnit('mm')).toBe(2000);
  });
  it('cm -> 200', () => {
    expect(searchRadiusForUnit('cm')).toBe(200);
  });
  it('m -> 2', () => {
    expect(searchRadiusForUnit('m')).toBe(2);
  });
  it('dm -> 20', () => {
    expect(searchRadiusForUnit('dm')).toBe(20);
  });
  it('inch artik TANIMLI -> 2 m = 78.74 inch (eskiden mm fallback veriyordu)', () => {
    expect(searchRadiusForUnit('inch')).toBeCloseTo(78.74, 2);
  });
  it('GERCEKTEN tanimsiz -> 2000 (mm fallback) ve konsola hata yazar', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(searchRadiusForUnit('fersah')).toBe(2000);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
