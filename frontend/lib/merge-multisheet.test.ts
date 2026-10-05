import { describe, it, expect } from 'vitest';
import { mergeMultiSheet } from '../ozellik/tablo/merge-multisheet';
import type { MultiSheetData, ExcelRowData } from '@/ozellik/tablo/excel-grid/types';

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

  // ── A2 (tur 3, olculdu — tur3/a2/hayalet-uctan.out.md YOL D) ──────────────
  // "Dosya Seç" ile yeniden yuklemede `parseFloat(metin) !== 0` NaN !== 0 oldugu
  // icin METIN fiyat "dolu" sayilip KORUNUYORDU: hayalet "35x240mm…" yeni
  // dosyanin gecerli fiyatini eziyordu.
  it('MG-A2 ★ metin fiyat "dolu" SAYILMAZ — yeni dosyanin degeri gelir; sayi fiyat korunur', () => {
    const prev = sheet('S1', [
      row('1', 'KANAL', '12', { 'Birim Fiyat': '35x240mm Üç bölmeli döşeme kanalı' }),
      row('2', 'VANA', '3', { 'Birim Fiyat': '1.234,5' }),
    ]);
    const inc = sheet('S1', [
      row('1', 'KANAL', '12', { 'Birim Fiyat': '420' }),
      row('2', 'VANA', '3', { 'Birim Fiyat': '999' }),
    ]);
    const { merged } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(merged.sheets[0].rowData[0]['Birim Fiyat'], 'hayalet metin korunmadi').toBe('420');
    expect(merged.sheets[0].rowData[1]['Birim Fiyat'], 'gecerli TR sayi korundu').toBe('1.234,5');
  });

  it('MG-A2 ice aktarma sayi isareti YENI dosyanindir; korunan fiyatin isareti duser', () => {
    const prev = sheet('S1', [row('1', 'KANAL', '12', {
      'Birim Fiyat': '420', _sayiUyari: { Miktar: { ham: '1.250', tur: 'belirsiz' } },
    })]);
    const inc = sheet('S1', [row('1', 'KANAL', '12', {
      'Birim Fiyat': '', _sayiUyari: { 'Birim Fiyat': { ham: '24 kW', tur: 'sayi-degil' } },
    })]);
    const { merged } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    const r = merged.sheets[0].rowData[0];
    expect(r['Birim Fiyat']).toBe('420');
    expect(r._sayiUyari, 'eski miktar isareti tasinmaz, korunan fiyatin isareti duser').toBeUndefined();
  });
  // ── D6 (koordinator karari 05.10; canli olcum: 12 teklifin 7'sinde tekrar, 458 risk
  // satiri %35, hepsinde No BOS) ─────────────────────────────────────────────
  // Anahtar yalniz "no|ad" idi ve her anahtarin YALNIZ ILK eski satiri tutuluyordu:
  // ayni ad farkli bolumlerde tekrar edince ikinci kopya kullanicinin fiyatini
  // kaybediyor, yeni bir bolum eklenince fiyat YANLIS satira gidiyor, eslesmeyen
  // eski tekrarlar sona da tasinmadan SESSIZCE dusuyordu.
  // KARAR: anahtara en yakin bolum basligi eklenir, tekrarlar sirayla eslenir,
  // eslesmeyen eski satir korunur.
  const baslik = (metin: string): ExcelRowData => ({ _rowIdx: 0, _isDataRow: false, _isHeaderRow: false, No: '', Ad: metin, Miktar: '' });
  const fiyatlar = (rows: ExcelRowData[]) => rows.filter((r) => r._isDataRow).map((r) => `${r.Ad}/${r.Miktar}=${r['Birim Fiyat']}`);

  it('D6-1 ★ ayni ad farkli bolumlerde: her kopya KENDI fiyatini korur', () => {
    const prev = sheet('S1', [
      baslik('KAT 1'), row('', 'KÜRESEL VANA 1"', '5', { 'Birim Fiyat': '100', _malzKar: 10 }),
      baslik('KAT 2'), row('', 'KÜRESEL VANA 1"', '3', { 'Birim Fiyat': '200', _malzKar: 20 }),
    ]);
    const inc = sheet('S1', [
      baslik('KAT 1'), row('', 'KÜRESEL VANA 1"', '6'),
      baslik('KAT 2'), row('', 'KÜRESEL VANA 1"', '4'),
    ]);
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    const rows = merged.sheets[0].rowData;
    expect(fiyatlar(rows)).toEqual(['KÜRESEL VANA 1"/6=100', 'KÜRESEL VANA 1"/4=200']);
    expect(rows.filter((r) => r._isDataRow).map((r) => r._malzKar)).toEqual([10, 20]);
    expect(stats).toMatchObject({ matchedRows: 2, newRows: 0, preservedRows: 0 });
  });

  it('D6-2 ★ revizyon ONE yeni bolum ekler: fiyat yanlis satira GITMEZ', () => {
    const prev = sheet('S1', [
      baslik('KAT 1'), row('', 'KÜRESEL VANA 1"', '5', { 'Birim Fiyat': '100' }),
      baslik('KAT 2'), row('', 'KÜRESEL VANA 1"', '3', { 'Birim Fiyat': '200' }),
    ]);
    const inc = sheet('S1', [
      baslik('BODRUM'), row('', 'KÜRESEL VANA 1"', '9'),
      baslik('KAT 1'), row('', 'KÜRESEL VANA 1"', '5'),
      baslik('KAT 2'), row('', 'KÜRESEL VANA 1"', '3'),
    ]);
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(fiyatlar(merged.sheets[0].rowData)).toEqual(['KÜRESEL VANA 1"/9=', 'KÜRESEL VANA 1"/5=100', 'KÜRESEL VANA 1"/3=200']);
    expect(stats).toMatchObject({ matchedRows: 2, newRows: 1, preservedRows: 0 });
  });

  it('D6-3 ★ ayni bolumde tekrarlar SIRAYLA eslenir, eslesmeyen eski kopya KORUNUR', () => {
    const prev = sheet('S1', [
      baslik('KAT 1'),
      row('', 'DİRSEK 1"', '1', { 'Birim Fiyat': '10' }),
      row('', 'DİRSEK 1"', '2', { 'Birim Fiyat': '20' }),
      row('', 'DİRSEK 1"', '3', { 'Birim Fiyat': '30', _marka: 'm3' }),
      row('', '', '', { _isSpareRow: true }), // ekranin bos yedek satiri korunmaz (anahtarsiz)
    ]);
    const inc = sheet('S1', [baslik('KAT 1'), row('', 'DİRSEK 1"', '1'), row('', 'DİRSEK 1"', '2')]);
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    const rows = merged.sheets[0].rowData;
    expect(fiyatlar(rows)).toEqual(['DİRSEK 1"/1=10', 'DİRSEK 1"/2=20', 'DİRSEK 1"/3=30']);
    expect(rows[rows.length - 1]._marka, 'ucuncu kopya sona tasindi, kaybolmadi').toBe('m3');
    expect(stats).toMatchObject({ matchedRows: 2, newRows: 0, preservedRows: 1 });
  });

  it('D6-4 bolum adi degisti, ad TEK: eski eslesme korunur (yedek kural)', () => {
    const prev = sheet('S1', [baslik('KAT 1'), row('', 'POMPA', '1', { 'Birim Fiyat': '5000' })]);
    const inc = sheet('S1', [baslik('1. KAT'), row('', 'POMPA', '1')]);
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(fiyatlar(merged.sheets[0].rowData)).toEqual(['POMPA/1=5000']);
    expect(stats).toMatchObject({ matchedRows: 1, newRows: 0, preservedRows: 0 });
  });

  it('D6-5 bolum adi degisti, ad TEKRARLI: tahmin YOK — yeni satir + eski satir korunur', () => {
    const prev = sheet('S1', [
      baslik('KAT 1'), row('', 'VANA', '1', { 'Birim Fiyat': '100' }),
      baslik('KAT 2'), row('', 'VANA', '2', { 'Birim Fiyat': '200' }),
    ]);
    const inc = sheet('S1', [
      baslik('ZEMİN'), row('', 'VANA', '1'),
      baslik('KAT 2'), row('', 'VANA', '2'),
    ]);
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(fiyatlar(merged.sheets[0].rowData)).toEqual(['VANA/1=', 'VANA/2=200', 'VANA/1=100']);
    expect(stats).toMatchObject({ matchedRows: 1, newRows: 1, preservedRows: 1 });
  });

  it('D6-6 kullanicinin grup bandi (_isGroupRow) bolum SAYILMAZ', () => {
    const grup: ExcelRowData = { _rowIdx: 0, _isDataRow: false, _isHeaderRow: false, _isGroupRow: true, _groupLabel: 'Hat A', No: '', Ad: '', Miktar: '' };
    const prev = sheet('S1', [baslik('KAT 1'), grup, row('', 'VANA', '1', { 'Birim Fiyat': '100' }), row('', 'VANA', '2', { 'Birim Fiyat': '200' })]);
    const inc = sheet('S1', [baslik('KAT 1'), row('', 'VANA', '1'), row('', 'VANA', '2')]);
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(fiyatlar(merged.sheets[0].rowData)).toEqual(['VANA/1=100', 'VANA/2=200']);
    expect(stats).toMatchObject({ matchedRows: 2, newRows: 0, preservedRows: 0 });
  });

  it('D6-7 bolum basligi buyuk/kucuk harf ve bosluk farki ayni bolumdur', () => {
    const prev = sheet('S1', [baslik('KAT 1  TESİSATI'), row('', 'VANA', '1', { 'Birim Fiyat': '100' }), baslik('Kat 2'), row('', 'VANA', '2', { 'Birim Fiyat': '200' })]);
    const inc = sheet('S1', [baslik('kat 1 tesisatı'), row('', 'VANA', '1'), baslik('KAT 2'), row('', 'VANA', '2')]);
    const { merged } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(fiyatlar(merged.sheets[0].rowData)).toEqual(['VANA/1=100', 'VANA/2=200']);
  });
  it('D6-8 bolum adi degisti, ad YENI dosyada TEKRARLI: tek eski satir tahminle verilmez', () => {
    const prev = sheet('S1', [baslik('KAT 1'), row('', 'VANA', '1', { 'Birim Fiyat': '100' })]);
    const inc = sheet('S1', [baslik('ZEMİN'), row('', 'VANA', '1'), baslik('KAT 9'), row('', 'VANA', '2')]);
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(fiyatlar(merged.sheets[0].rowData)).toEqual(['VANA/1=', 'VANA/2=', 'VANA/1=100']);
    expect(stats).toMatchObject({ matchedRows: 0, newRows: 2, preservedRows: 1 });
  });

  it('D6-9 bolum adi degisti, ad ESKI dosyada TEKRARLI: hangi kopya oldugu tahmin edilmez', () => {
    const prev = sheet('S1', [baslik('KAT 1'), row('', 'VANA', '1', { 'Birim Fiyat': '100' }), baslik('KAT 2'), row('', 'VANA', '2', { 'Birim Fiyat': '200' })]);
    const inc = sheet('S1', [baslik('ZEMİN'), row('', 'VANA', '2')]);
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(fiyatlar(merged.sheets[0].rowData)).toEqual(['VANA/2=', 'VANA/1=100', 'VANA/2=200']);
    expect(stats).toMatchObject({ matchedRows: 0, newRows: 1, preservedRows: 2 });
  });

  it('D6-10 kolon basligi revizyonda degisti: ilk bolumun tekrarlari yine sirayla eslenir', () => {
    const kolonBasligi = (ad: string): ExcelRowData => ({ _rowIdx: 0, _isDataRow: false, _isHeaderRow: true, No: 'No', Ad: ad, Miktar: 'Miktar' });
    const prev = sheet('S1', [kolonBasligi('Malzeme Adı'), row('', 'VANA', '1', { 'Birim Fiyat': '100' }), row('', 'VANA', '2', { 'Birim Fiyat': '200' })]);
    const inc = sheet('S1', [kolonBasligi('Malzemenin Adı'), row('', 'VANA', '1'), row('', 'VANA', '2')]);
    const { merged, stats } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(fiyatlar(merged.sheets[0].rowData)).toEqual(['VANA/1=100', 'VANA/2=200']);
    expect(stats).toMatchObject({ matchedRows: 2, newRows: 0, preservedRows: 0 });
  });
  it('D6-11 bolum basligi ILK sutunda (ad hucresi bos): yine bolum sayilir', () => {
    const solBaslik = (metin: string): ExcelRowData => ({ _rowIdx: 0, _isDataRow: false, _isHeaderRow: false, No: metin, Ad: '', Miktar: '' });
    const prev = sheet('S1', [
      solBaslik('A- KAT 1'), row('', 'KÜRESEL VANA 1"', '5', { 'Birim Fiyat': '100' }),
      solBaslik('B- KAT 2'), row('', 'KÜRESEL VANA 1"', '3', { 'Birim Fiyat': '200' }),
    ]);
    const inc = sheet('S1', [
      solBaslik('0- BODRUM'), row('', 'KÜRESEL VANA 1"', '9'),
      solBaslik('A- KAT 1'), row('', 'KÜRESEL VANA 1"', '5'),
      solBaslik('B- KAT 2'), row('', 'KÜRESEL VANA 1"', '3'),
    ]);
    const { merged } = mergeMultiSheet(prev, { 0: prev.sheets[0].rowData }, inc);
    expect(fiyatlar(merged.sheets[0].rowData)).toEqual(['KÜRESEL VANA 1"/9=', 'KÜRESEL VANA 1"/5=100', 'KÜRESEL VANA 1"/3=200']);
  });
});
