import { describe, it, expect } from 'vitest';
import { clampDiscount, parseDiscountInput, parseDiscountPaste } from './discount-utils';

describe('clampDiscount', () => {
  it('0-100 araligina sabitler', () => {
    expect(clampDiscount(-5)).toBe(0);
    expect(clampDiscount(150)).toBe(100);
    expect(clampDiscount(30.5)).toBe(30.5);
  });
  it('okunamayan deger 0', () => {
    expect(clampDiscount(NaN)).toBe(0);
  });
});

describe('parseDiscountInput', () => {
  it('% isareti ve TR virgulu kabul eder', () => {
    expect(parseDiscountInput('%30')).toBe(30);
    expect(parseDiscountInput('30,5')).toBe(30.5);
    expect(parseDiscountInput(' 45 ')).toBe(45);
  });
  it('gecersiz giris 0', () => {
    expect(parseDiscountInput('abc')).toBe(0);
  });
});

describe('parseDiscountPaste (S3 — Excel kolonu yapistirma)', () => {
  it('cok satirli kolonu diziye cevirir, bos satirlari atlar', () => {
    // Excel kopyasi sona bos satir ekler
    expect(parseDiscountPaste('50\n30\n\n20\n')).toEqual([50, 30, 20]);
  });
  it('CRLF ve tab ayracli kopyada ILK kolonu alir', () => {
    expect(parseDiscountPaste('50\tACOP\r\n25\tVana\r\n')).toEqual([50, 25]);
  });
  it('TR virgul + % isareti + clamp', () => {
    expect(parseDiscountPaste('%30\n45,5\n150\n-2')).toEqual([30, 45.5, 100, 0]);
  });
  it('bos metin → bos dizi', () => {
    expect(parseDiscountPaste('')).toEqual([]);
  });
});
