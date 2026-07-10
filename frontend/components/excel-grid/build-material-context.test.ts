// PRD v1.1 §4 — baslik tabanli baglam mirasi testleri (PRD §2 gercek ornek yapisi)
import { describe, it, expect } from 'vitest';
import {
  buildMaterialContextFromArray,
  buildMaterialContextDetailedFromArray,
  hasSizeExpression,
  isSelfSufficientRow,
} from './build-material-context';
import type { ExcelRowData, ColumnRoles } from './types';

const roles: ColumnRoles = {
  noField: 'no',
  nameField: 'name',
  brandField: 'brand',
  quantityField: 'qty',
  unitField: 'unit',
};

function row(partial: Partial<ExcelRowData> & { name: string }): ExcelRowData {
  return { _rowIdx: 0, _isDataRow: true, _isHeaderRow: false, no: '', brand: '', qty: '', unit: '', ...partial } as ExcelRowData;
}

// PRD §2'deki gercek Excel yapisi
const ROWS: ExcelRowData[] = [
  row({ name: 'PH ETİKETLİ SİYAH CAM KAPAKLI YANGIN DOLABI', brand: 'EKİNCİOĞLU', unit: 'adet', qty: '9' }),          // 0 data
  row({ name: 'SPRİNK HATTI BORULARI', _isDataRow: false, no: '2' }),                                                  // 1 BASLIK
  row({ name: 'DN 25', brand: 'ÇAYIROVA', unit: 'metre', qty: '600' }),                                               // 2 data (yetim)
  row({ name: 'DN 32', brand: 'ÇAYIROVA', unit: 'metre', qty: '130' }),                                               // 3 data (yetim)
  row({ name: 'FİTTİNGS ORANI', brand: 'TRAKYA', qty: '0.5' }),                                                       // 4 oran (data)
  row({ name: 'KÜRESEL VANALAR', _isDataRow: false }),                                                                 // 5 BASLIK (no'suz!)
  row({ name: 'DN 20', brand: 'DUYAR', unit: 'adet', qty: '15' }),                                                    // 6 data (yetim)
];

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

describe('buildMaterialContextFromArray (C1/C2/C3)', () => {
  it('C1: yetim satir en yakin basligi miras alir', () => {
    expect(buildMaterialContextFromArray(ROWS, 2, roles)).toBe('SPRİNK HATTI BORULARI DN 25');
    expect(buildMaterialContextFromArray(ROWS, 3, roles)).toBe('SPRİNK HATTI BORULARI DN 32');
  });

  it("C2: yeni baslik baglami SIFIRLAR (T4 — sprink tasinmaz), no'suz baslik da yakalanir (H1/H2)", () => {
    const r = buildMaterialContextDetailedFromArray(ROWS, 6, roles);
    expect(r.name).toBe('KÜRESEL VANALAR DN 20');
    expect(r.header).toBe('KÜRESEL VANALAR');
  });

  it('C3: kendi kendine yeterli satira baslik EKLENMEZ', () => {
    const r = buildMaterialContextDetailedFromArray(ROWS, 0, roles);
    expect(r.name).toBe('PH ETİKETLİ SİYAH CAM KAPAKLI YANGIN DOLABI');
    expect(r.header).toBeNull();
  });

  it('C4: ustunde baslik olmayan yetim satir yalniz kendi metniyle doner', () => {
    const orphanRows = [row({ name: 'DN 25', brand: 'X', qty: '10' })];
    const r = buildMaterialContextDetailedFromArray(orphanRows, 0, roles);
    expect(r.name).toBe('DN 25');
    expect(r.header).toBeNull();
  });

  it('H4: olcu iceren ara satir baslik sayilmaz, yuruyus ustteki gercek basliga devam eder', () => {
    const rowsWithNoise: ExcelRowData[] = [
      row({ name: 'SPRİNK HATTI BORULARI', _isDataRow: false, no: '2' }),      // 0 gercek baslik
      row({ name: 'İTFAİYE BAĞLANTI AĞZI - 4"x2 1/2"', _isDataRow: false }),   // 1 olculu ara satir (baslik DEGIL)
      row({ name: 'DN 25', brand: 'ÇAYIROVA', qty: '600' }),                   // 2 yetim
    ];
    const r = buildMaterialContextDetailedFromArray(rowsWithNoise, 2, roles);
    expect(r.name).toBe('SPRİNK HATTI BORULARI DN 25');
    expect(r.header).toBe('SPRİNK HATTI BORULARI');
  });

  it('cap sanity: baslikta FARKLI cap varsa eklenmez (felaket onleme)', () => {
    const rowsMismatch: ExcelRowData[] = [
      row({ name: 'ANA HAT DN50 KOLONU', _isDataRow: false, no: '1' }),
      row({ name: 'DN 25', brand: 'X', qty: '5' }),
    ];
    // DN50'li satir H4 geregi zaten baslik sayilmaz → header null
    const r = buildMaterialContextDetailedFromArray(rowsMismatch, 1, roles);
    expect(r.name).toBe('DN 25');
  });
});
