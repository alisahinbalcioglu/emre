// PRD v1.1 §4 — H4/C3 yardimci testleri. NOT (denetim 22.07): FromArray
// reimplementasyon testleri fonksiyonlarla birlikte silindi (canli kopya
// ExcelGrid.tsx icinde, e2e ile dogrulanir).
import { describe, it, expect } from 'vitest';
import { extractCapFromText, hasSizeExpression, isSelfSufficientRow } from './build-material-context';

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

// ── CAP OKUYUCU SOL SINIRI (P2 bulgusu 05.10; arka uc ikizi P2 FAZ C B17) ──
// Tam sayi inc kalibi `(\d+)"` sol sinir tasimiyordu ve ortusme denetimi
// eslesmenin degil DEGERIN uzunluguna bakiyordu: tirnakli her kesirde kesrin
// paydasi tam sayi inc sanilip "en sondaki cap" seciliyordu — 3/4" dn100,
// 1/2" dn50, 1 1/4" dn100. Bu cap baslik baglaminin sanity check'ini
// (parent/current cap karsilastirmasi) yanlis karara goturuyordu.
describe('extractCapFromText — kesrin paydasi tam sayi inc DEGILDIR', () => {
  it.each([
    ['3/4"', 'dn20'],
    ['1/2"', 'dn15'],
    ['1 1/4"', 'dn32'],
    ['2 1/2"', 'dn65'],
    ['Küresel Vana 3/4"', 'dn20'],
    ['¾"', 'dn20'],
    ['1¼"', 'dn32'],
    ['TE 1" x 3/4"', 'dn20'],
  ])('%s → %s', (metin, cap) => {
    expect(extractCapFromText(metin)).toBe(cap);
  });
  it('KONTROL: tam sayi inc, DN ve tirnaksiz kesir eskisi gibi', () => {
    expect(extractCapFromText('Boru 2"')).toBe('dn50');
    expect(extractCapFromText('Vana 1"')).toBe('dn25');
    expect(extractCapFromText('DN 25 vana')).toBe('dn25');
    expect(extractCapFromText('Dirsek 3/4')).toBe('dn20');
    expect(extractCapFromText('3/4" x 1"')).toBe('dn25');
    expect(extractCapFromText('olcusuz satir')).toBeNull();
    // cok haneli payda: 5/16"nin 6"si (dn150) okunmaz — tabloda 5/16 yok, cap YOK
    expect(extractCapFromText('Civata 5/16"')).toBeNull();
  });
});
