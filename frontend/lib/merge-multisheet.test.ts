import { describe, it, expect } from 'vitest';
import { mergeMultiSheet } from './merge-multisheet';
import type { MultiSheetData, ExcelRowData } from '@/components/excel-grid/types';

const ROLES = { noField: 'No', nameField: 'Ad', quantityField: 'Miktar', materialUnitPriceField: 'Birim Fiyat' };

function row(no: string, ad: string, miktar: string, extra: Partial<ExcelRowData> = {}): ExcelRowData {
  return {
    _rowIdx: 0, _isDataRow: true, _isHeaderRow: false,
    No: no, Ad: ad, Miktar: miktar, 'Birim Fiyat': '',
    ...extra,
  };
}

function sheet(name: string, rows: ExcelRowData[], index = 0): MultiSheetData {
  return {
    sheets: [{
      name, index, isEmpty: false,
      columnDefs: [
        { field: 'No', headerName: 'No' },
        { field: 'Ad', headerName: 'Ad' },
        { field: 'Miktar', headerName: 'Miktar' },
        { field: 'Birim Fiyat', headerName: 'Birim Fiyat' },
      ],
      rowData: rows.map((r, i) => ({ ...r, _rowIdx: i })),
      columnRoles: ROLES,
      headerEndRow: 0,
    }],
    brands: [],
  };
}

describe('mergeMultiSheet — Excel yeniden yukleme veri korumasi', () => {
  it('prev yoksa incoming aynen gelir', () => {
    const inc = sheet('S1', [row('1', 'DN80 VANA', '5')]);
    const { merged, stats } = mergeMultiSheet(null, {}, inc);
    expect(merged.sheets).toHaveLength(1);
    expect(stats.newRows).toBe(1);
  });

  it('eslesen pozda kar/marka/fiyat KORUNUR, miktar dosyadan GUNCELLENIR', () => {
    const prev = sheet('S1', [
      row('1', 'DN80 VANA', '5', { _malzKar: 15, _marka: 'brand-x', _matNetPrice: 100, 'Birim Fiyat': '115.00' }),
    ]);
    const inc = sheet('S1', [row('1', 'DN80 VANA', '12')]); // miktar degisti, fiyat bos
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    const r = merged.sheets[0].rowData.find((x) => x.No === '1')!;
    expect(r.Miktar).toBe('12');                 // dosyadan guncel
    expect(r._malzKar).toBe(15);                 // kullanici emegi korundu
    expect(r._marka).toBe('brand-x');
    expect(r['Birim Fiyat']).toBe('115.00');     // bos dosya degeri EZMEDI
    expect(stats.matchedRows).toBe(1);
  });

  it('yeni pozlar eklenir, yalniz eskide olan satir sona korunur', () => {
    const prev = sheet('S1', [
      row('1', 'DN80 VANA', '5', { _malzKar: 10 }),
      row('99', 'MANUEL SATIR', '3', { _marka: 'b1' }),
    ]);
    const inc = sheet('S1', [
      row('1', 'DN80 VANA', '5'),
      row('2', 'DN50 VANA', '7'),
    ]);
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    const rows = merged.sheets[0].rowData;
    expect(rows.map((r) => r.No)).toEqual(['1', '2', '99']); // manuel satir SONDA, kaybolmadi
    expect(stats.newRows).toBe(1);
    expect(stats.preservedRows).toBe(1);
    expect(rows[2]._marka).toBe('b1');
  });

  it('kullanicinin ozel sutunu (context menu) columnDefs + degerlerde korunur', () => {
    const prev = sheet('S1', [row('1', 'DN80 VANA', '5', { Nakliye: '250' })]);
    prev.sheets[0].columnDefs.push({ field: 'Nakliye', headerName: 'Nakliye', editable: true });
    const inc = sheet('S1', [row('1', 'DN80 VANA', '8')]);
    const { merged } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(merged.sheets[0].columnDefs.some((c) => c.field === 'Nakliye')).toBe(true);
    expect(merged.sheets[0].rowData[0].Nakliye).toBe('250');
  });

  it('multi-sheet: yeni sheet eklenir, eski sheet aynen durur', () => {
    const prev = sheet('Mekanik', [row('1', 'BORU', '5', { _malzKar: 20 })]);
    const inc: MultiSheetData = {
      sheets: [
        sheet('Mekanik', [row('1', 'BORU', '9')]).sheets[0],
        { ...sheet('Elektrik', [row('1', 'KABLO', '100')]).sheets[0], index: 1 },
      ],
      brands: [],
    };
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(merged.sheets.map((s) => s.name)).toEqual(['Mekanik', 'Elektrik']);
    expect(stats.newSheets).toBe(1);
    expect(merged.sheets[0].rowData[0]._malzKar).toBe(20);
    expect(merged.sheets[0].rowData[0].Miktar).toBe('9');
  });

  it('yalniz eskide olan sheet korunur (dosyada yok diye silinmez)', () => {
    const prev: MultiSheetData = {
      sheets: [
        sheet('Mekanik', [row('1', 'BORU', '5')]).sheets[0],
        { ...sheet('Ekstra', [row('1', 'OZEL', '2', { _malzKar: 5 })]).sheets[0], index: 1 },
      ],
      brands: [],
    };
    const inc = sheet('Mekanik', [row('1', 'BORU', '5')]);
    const prevLive = { 0: prev.sheets[0].rowData, 1: prev.sheets[1].rowData };
    const { merged } = mergeMultiSheet(prev, prevLive, inc);
    expect(merged.sheets.map((s) => s.name)).toEqual(['Mekanik', 'Ekstra']);
    expect(merged.sheets[1].rowData[0]._malzKar).toBe(5);
  });
});
