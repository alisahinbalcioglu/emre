import { describe, it, expect } from 'vitest';
import { normalizeToMeters, searchRadiusForUnit, UNIT_SCALE_TO_METER } from './unit-detection';

describe('UNIT_SCALE_TO_METER (tek gercek kaynak)', () => {
  it('sabit carpanlar', () => {
    expect(UNIT_SCALE_TO_METER.m).toBe(1);
    expect(UNIT_SCALE_TO_METER.cm).toBe(100);
    expect(UNIT_SCALE_TO_METER.mm).toBe(1000);
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
  it('tanimsiz birim -> fallback ham deger', () => {
    expect(normalizeToMeters(42, 'inch')).toBe(42);
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
  it('tanimsiz -> 2000 (mm fallback)', () => {
    expect(searchRadiusForUnit('inch')).toBe(2000);
  });
});
