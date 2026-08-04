// PRD v1.1 §4 — H4/C3 yardimci testleri. NOT (denetim 22.07): FromArray
// reimplementasyon testleri fonksiyonlarla birlikte silindi (canli kopya
// ExcelGrid.tsx icinde, e2e ile dogrulanir).
import { describe, it, expect } from 'vitest';
import { hasSizeExpression, isSelfSufficientRow } from './build-material-context';

describe('hasSizeExpression (H4)', () => {
  it('baslik metinlerinde olcu yok', () => {
    expect(hasSizeExpression('SPRİNK HATTI BORULARI')).toBe(false);
    expect(hasSizeExpression('KÜRESEL VANALAR')).toBe(false);
  });
  it('olculu ifadeleri yakalar', () => {
    expect(hasSizeExpression('DN 25')).toBe(true);
    expect(hasSizeExpression('Ø32')).toBe(true);
    expect(hasSizeExpression('1 1/4"')).toBe(true);
    expect(hasSizeExpression("2''")).toBe(true);
    expect(hasSizeExpression('32 mm')).toBe(true);
    expect(hasSizeExpression('İTFAİYE BAĞLANTI AĞZI 4"x2 1/2"')).toBe(true);
  });
});

describe('isSelfSufficientRow (C3)', () => {
  it('yalniz cap/sinif tasiyan satirlar YETIM', () => {
    expect(isSelfSufficientRow('DN 25')).toBe(false);
    expect(isSelfSufficientRow('Ø32')).toBe(false);
    expect(isSelfSufficientRow('1 1/4"')).toBe(false);
    expect(isSelfSufficientRow('PN25 DN20')).toBe(false);
    expect(isSelfSufficientRow('63 PE100 SDR17 PN10')).toBe(false);
  });
  it('tip kelimesi veya anlamli metin = kendi kendine yeterli', () => {
    expect(isSelfSufficientRow('SİYAH BORU 1"')).toBe(true);
    expect(isSelfSufficientRow('PH ETİKETLİ SİYAH CAM KAPAKLI YANGIN DOLABI')).toBe(true);
    expect(isSelfSufficientRow('DN 25 KÜRESEL VANA')).toBe(true);
  });
});

