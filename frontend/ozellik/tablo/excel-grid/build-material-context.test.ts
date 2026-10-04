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

describe('B2 IKIZ — tipografik tirnakli olcu (arka ucun normalizer kurali)', () => {
  // Arka uc `normalizer.normalizeText` tipografik tirnaklari ASCII'ye cevirir
  // (B2, 04.10). Bu dosyadaki iki olcut ise ham metne bakiyor ve YALNIZ ASCII
  // kaliplari taniyordu (`/'{2}/`, `["']`). Sonuc: Word/Excel'in otomatik
  // duzelttigi "1''" satiri "olcusu yok" sayilip yanlis bir baslikla
  // zenginlestirilebiliyordu — iki taraf AYNI metni farkli okuyordu.
  const SAG = '’'; const SOL = '‘'; const PRIME = '′';

  it('hasSizeExpression tipografik tirnakli inci GORUR (ASCII ikizi gibi)', () => {
    for (const q of [SAG, SOL, PRIME]) {
      expect(hasSizeExpression(`BORU 1${q}${q}`), `q=${JSON.stringify(q)}`).toBe(true);
    }
    expect(hasSizeExpression("BORU 1''")).toBe(true);   // ASCII ikizi — degismez
  });

  // NOT (olculdu, test YAZILMADI): `isSelfSufficientRow` tirnak bicimine
  // yapisal olarak DUYARSIZ — zincirin son adimi harf disindaki her karakteri
  // atiyor, ustelik ASCII '' ile tipografik '' AYNI UZUNLUKTA. Normalizasyon
  // oraya eklendi, 11 girdide olculdu, fark cikmadi (atil) ve geri alindi.
  // Buraya assert yazmak ANLAMSIZ olurdu: hicbir kod degisikligi onu
  // dusuremez (son suzgeci kaldiran mutant bile yasiyor — olculdu). Kapi
  // kiligindaki bos assert tutulmadi; yerine bu kayit birakildi.

  it('KARSI: tirnak olcu disi baglamda satiri bozmaz', () => {
    // Turkce ek kesmesi olcu DEGILDIR; tip kelimesi tasiyan satir yine yeterli
    expect(isSelfSufficientRow(`Ayvaz${SAG}in celik borusu`)).toBe(true);
  });
});
