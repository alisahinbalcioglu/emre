import { describe, it, expect } from 'vitest';
import { clampDiscount, iskontoHucresiOku, parseDiscountInput, parseDiscountPaste } from './discount-utils';

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
  // A2 (tur 3, kural geregi degisti): eskiden 0 donuyordu ve "tum listeye
  // uygula" kutusundaki metin BUTUN listeyi 0'a cekiyordu. Artik null = UYGULANMAZ.
  it('gecersiz giris null (uygulanmaz) — "abc", olcu metni, belirsiz "12.125"', () => {
    expect(parseDiscountInput('abc')).toBeNull();
    expect(parseDiscountInput('35x240mm')).toBeNull();
    expect(parseDiscountInput('12.125')).toBeNull();
    expect(parseDiscountInput('')).toBeNull();
  });
});

describe('iskontoHucresiOku (surukle-doldur kaynagi — SAKLI deger, makine kurali)', () => {
  it('saklanan sayi/metin okunur, 3 ondalik belirsiz SAYILMAZ', () => {
    expect(iskontoHucresiOku(12.125)).toBe(12.125);
    expect(iskontoHucresiOku('12,5')).toBe(12.5);
    expect(iskontoHucresiOku('%30')).toBe(30);
    expect(iskontoHucresiOku(150)).toBe(100);
    expect(iskontoHucresiOku('abc')).toBe(0);
  });
});

describe('parseDiscountPaste (S3 — Excel kolonu yapistirma)', () => {
  const degerler = (t: string) => parseDiscountPaste(t).map((s) => s.deger);
  it('cok satirli kolonu diziye cevirir, bos satirlari atlar', () => {
    // Excel kopyasi sona bos satir ekler
    expect(degerler('50\n30\n\n20\n')).toEqual([50, 30, 20]);
  });
  it('CRLF ve tab ayracli kopyada ILK kolonu alir', () => {
    expect(degerler('50\tACOP\r\n25\tVana\r\n')).toEqual([50, 25]);
  });
  it('TR virgul + % isareti + clamp', () => {
    expect(degerler('%30\n45,5\n150\n-2')).toEqual([30, 45.5, 100, 0]);
  });
  it('bos metin → bos dizi', () => {
    expect(parseDiscountPaste('')).toEqual([]);
  });
  // A2 (tur 3, olculdu): "35x240mm / 3 adet / abc" → 35, 3, 0 yaziliyordu; "abc"
  // VAR OLAN iskontoyu 0 ile eziyordu. Satir POZISYON tuketir ama degeri null.
  it('★ sayi olmayan / belirsiz satir YAZILMAZ ama hizayi korur (satir sayisi degismez)', () => {
    const s = parseDiscountPaste('35x240mm\n3 adet\nabc\n12.125\n%20');
    expect(s.map((x) => x.deger)).toEqual([null, null, null, null, 20]);
    expect(s.map((x) => x.girdi.tur)).toEqual(['sayi-degil', 'sayi-degil', 'sayi-degil', 'belirsiz', 'sayi']);
    expect(s.map((x) => x.ham)).toEqual(['35x240mm', '3 adet', 'abc', '12.125', '%20']);
  });
});
