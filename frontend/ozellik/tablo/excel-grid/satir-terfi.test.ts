/**
 * VERI SATIRI TERFISI KAPISI (03.09 canli bulgu)
 *
 *  T1. Dosyadan gelen bos satira ad + miktar yazilinca satir TERFI EDER —
 *      yoksa `handleCellValueChanged` ilk satirdaki kapidan doner ve satirda
 *      HICBIR SEY kosmaz (fitting rozeti, kar, toplam).
 *  T2. Ad TEK BASINA yetmez (kapak satirlari: "FİRMA:", "ADRES:").
 *  T3. Birim varsa miktar aranmaz; miktar "0" ise kalem tanimlanmaz.
 *  T4. Yapisal satirlar (baslik/grup/ozet) ASLA terfi etmez.
 *  T5. Terfi tek yonludur: zaten veri olan satir icin `false` doner.
 */
import { describe, it, expect } from 'vitest';
import { kalemTanimliyorMu, veriSatirinaTerfiEtmeliMi } from './satir-terfi';

const ROLLER = { nameField: '_ad', quantityField: '_miktar', unitField: '_birim' };

describe('T1 — canli vaka: bos satira "fitting bedeli" + "%35"', () => {
  it('dosyadan gelen bos satir (ad yok) → veri satiri DEGIL', () => {
    const bos = { _rowIdx: 23, _isDataRow: false, _ad: '', _miktar: '', _birim: '' };
    expect(veriSatirinaTerfiEtmeliMi(bos, ROLLER)).toBe(false);
  });
  it('ad + miktar yazilinca TERFI eder', () => {
    // FIXTURE KANITI: baslangicta veri satiri DEGIL
    const r: any = { _rowIdx: 23, _isDataRow: false, _ad: '', _miktar: '', _birim: '' };
    expect(veriSatirinaTerfiEtmeliMi(r, ROLLER)).toBe(false);
    r._ad = 'fitting bedeli';
    r._miktar = '%35';
    expect(veriSatirinaTerfiEtmeliMi(r, ROLLER)).toBe(true);
  });
  it('ad + birim "%" ile de terfi eder (kullanici once birimi yazabilir)', () => {
    const r = { _rowIdx: 23, _isDataRow: false, _ad: 'fitting bedeli', _miktar: '', _birim: '%' };
    expect(veriSatirinaTerfiEtmeliMi(r, ROLLER)).toBe(true);
  });
});

describe('T2/T3 — olcut', () => {
  it('ad TEK BASINA yetmez (kapak satiri)', () => {
    for (const ad of ['FİRMA:', 'ADRES:', 'OFiSLER FAN-COİL MONTAJ İŞLERİ']) {
      expect(kalemTanimliyorMu({ _ad: ad, _miktar: '', _birim: '' }, ROLLER)).toBe(false);
    }
  });
  it('miktar "0" kalem tanimlamaz, birim varsa tanimlar', () => {
    expect(kalemTanimliyorMu({ _ad: 'X', _miktar: '0', _birim: '' }, ROLLER)).toBe(false);
    expect(kalemTanimliyorMu({ _ad: 'X', _miktar: '0', _birim: 'mt' }, ROLLER)).toBe(true);
    expect(kalemTanimliyorMu({ _ad: 'X', _miktar: '300', _birim: '' }, ROLLER)).toBe(true);
  });
  it('bosluk dolu hucre bos sayilir', () => {
    expect(kalemTanimliyorMu({ _ad: '   ', _miktar: '300', _birim: '' }, ROLLER)).toBe(false);
    expect(kalemTanimliyorMu({ _ad: 'X', _miktar: '  ', _birim: '  ' }, ROLLER)).toBe(false);
  });
  it('rol tanimsizsa o alan aranmaz', () => {
    expect(kalemTanimliyorMu({ _ad: 'X', _miktar: '300' }, { nameField: '_ad' })).toBe(false);
    expect(kalemTanimliyorMu({ _ad: 'X', _miktar: '300' }, { nameField: '_ad', quantityField: '_miktar' })).toBe(true);
  });
});

describe('T4/T5 — terfi etmeyecekler', () => {
  it.each([
    ['baslik', { _isHeaderRow: true }],
    ['grup bandi', { _isGroupRow: true }],
    ['ozet', { _ozet: true }],
  ])('%s ASLA terfi etmez', (_ad, ek) => {
    const r = { _isDataRow: false, _ad: 'fitting bedeli', _miktar: '35', _birim: '%', ...ek };
    expect(veriSatirinaTerfiEtmeliMi(r, ROLLER)).toBe(false);
  });
  it('zaten veri satiri → false (tek yonlu)', () => {
    const r = { _isDataRow: true, _ad: 'X', _miktar: '300', _birim: 'mt' };
    expect(veriSatirinaTerfiEtmeliMi(r, ROLLER)).toBe(false);
  });
  it('null/undefined guvenli', () => {
    expect(veriSatirinaTerfiEtmeliMi(null, ROLLER)).toBe(false);
    expect(kalemTanimliyorMu(undefined, ROLLER)).toBe(false);
  });
});
