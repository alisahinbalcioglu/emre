/**
 * TEKLIF CEVIRISI — EKRANDA UYGULAMA VE GERI ALMA (13.08 · 14.09).
 *
 * ⚠ DOKUNULMAZ/TOPLAMA VAKALARI TASINDI (Faz 6.2, 14.09): "DN 20" gibi olcu
 * metinlerinin ceviriye girmemesi ve benzersizlestirme artik SUNUCUDA karar
 * verilir — vakalarin tamami (23 dokunulmaz + cevrilir adlar + sayfa atlama)
 * `backend/test/ceviri-kota-uygulama-test.ts` K blogunda. Burada yalniz
 * istemcinin hala yaptigi is kilitli: haritayi yalniz AD kolonuna yazmak,
 * orijinali saklamak, geri almak.
 *
 * ⚠ BIR ASSERT TEK KRITERE (proje kurali): her kriter kendi it() blogunda.
 */
import { describe, it, expect } from 'vitest';
import {
  ceviriAnahtari,
  ceviriUygula,
  ceviriGeriAl,
  cevrilmisSatirVarMi,
  satirKaynagi,
  type CeviriSayfasi,
} from './ceviri';
import type { ColumnRoles, ExcelRowData } from '../tablo/excel-grid/types';

const ROLLER: ColumnRoles = {
  nameField: 'Malzeme Cinsi',
  diameterField: 'Çapı',
  quantityField: 'Miktar',
  unitField: 'Birim',
  materialUnitPriceField: 'Birim Fiyat',
  materialTotalField: 'Tutar',
};

function satir(ad: string, patch: Partial<ExcelRowData> = {}): ExcelRowData {
  return {
    _rowIdx: 1, _isDataRow: true, _isHeaderRow: false,
    'Malzeme Cinsi': ad, 'Çapı': '', 'Miktar': '1', 'Birim': 'adet',
    ...patch,
  };
}

// ── A) ANAHTAR NORMALIZASYONU ──────────────────────────────────────────────

describe('ceviriAnahtari — onbellek anahtari tek yoldan uretilir', () => {
  it('bastaki/sondaki bosluk anahtari degistirmez', () => {
    expect(ceviriAnahtari('  PVC BORU  ')).toBe('PVC BORU');
  });

  it('ic bosluklar teklenir — "PVC  BORU" ile "PVC BORU" AYNI anahtardir', () => {
    expect(ceviriAnahtari('PVC  BORU')).toBe(ceviriAnahtari('PVC BORU'));
  });
});

// ── B) UYGULAMA VE GERI ALMA ───────────────────────────────────────────────

describe('ceviriUygula / ceviriGeriAl', () => {
  it('ceviri ad hucresine yazilir', () => {
    const rows = [satir('PVC BORU')];
    const s: CeviriSayfasi = { index: 0, rowData: rows, columnRoles: ROLLER };
    expect(ceviriUygula([s], { 'PVC BORU': 'PVC PIPE' })).toBe(1);
    expect(rows[0]['Malzeme Cinsi']).toBe('PVC PIPE');
  });

  it('ORIJINAL METIN saklanir — geri donus mumkun kalir', () => {
    const rows = [satir('PVC BORU')];
    const s: CeviriSayfasi = { index: 0, rowData: rows, columnRoles: ROLLER };
    ceviriUygula([s], { 'PVC BORU': 'PVC PIPE' });
    expect(rows[0]._ceviriKaynak).toBe('PVC BORU');
  });

  it('IKINCI ceviri orijinali EZMEZ — ilk kaynak korunur', () => {
    const rows = [satir('PVC BORU')];
    const s: CeviriSayfasi = { index: 0, rowData: rows, columnRoles: ROLLER };
    ceviriUygula([s], { 'PVC BORU': 'PVC PIPE' });
    ceviriUygula([s], { 'PVC PIPE': 'PLASTIC PIPE' });
    // Orijinal hala Turkce olmali — yoksa geri alma "PVC PIPE" dondururdu
    expect(rows[0]._ceviriKaynak).toBe('PVC BORU');
  });

  it('geri alma orijinali yerine koyar ve isareti temizler', () => {
    const rows = [satir('PVC BORU')];
    const s: CeviriSayfasi = { index: 0, rowData: rows, columnRoles: ROLLER };
    ceviriUygula([s], { 'PVC BORU': 'PVC PIPE' });
    expect(ceviriGeriAl([s])).toBe(1);
    expect(rows[0]['Malzeme Cinsi']).toBe('PVC BORU');
    expect(rows[0]._ceviriKaynak).toBeUndefined();
  });

  it('haritada olmayan metne DOKUNULMAZ', () => {
    const rows = [satir('BILINMEYEN AD')];
    const s: CeviriSayfasi = { index: 0, rowData: rows, columnRoles: ROLLER };
    expect(ceviriUygula([s], { 'PVC BORU': 'PVC PIPE' })).toBe(0);
    expect(rows[0]['Malzeme Cinsi']).toBe('BILINMEYEN AD');
  });

  it('CAP KOLONU ceviriden ETKILENMEZ — yalniz ad kolonu yazilir', () => {
    const rows = [satir('PVC BORU', { 'Çapı': 'Ø110' })];
    const s: CeviriSayfasi = { index: 0, rowData: rows, columnRoles: ROLLER };
    ceviriUygula([s], { 'PVC BORU': 'PVC PIPE', 'Ø110': 'DIAMETER 110' });
    expect(rows[0]['Çapı']).toBe('Ø110');
  });

  it('MIKTAR ve BIRIM ceviriden etkilenmez', () => {
    const rows = [satir('PVC BORU', { 'Miktar': '313', 'Birim': 'metre' })];
    const s: CeviriSayfasi = { index: 0, rowData: rows, columnRoles: ROLLER };
    ceviriUygula([s], { 'PVC BORU': 'PVC PIPE', '313': 'X', 'metre': 'meter' });
    expect(rows[0]['Miktar']).toBe('313');
    expect(rows[0]['Birim']).toBe('metre');
  });

  it('Ingilizce kayitli satir Turkce ASLINDAN eslenir (sunucu haritayi asil metinle kurar)', () => {
    const rows = [satir('PVC PIPE', { _ceviriKaynak: 'PVC BORU' })];
    const s: CeviriSayfasi = { index: 0, rowData: rows, columnRoles: ROLLER };
    expect(ceviriUygula([s], { 'PVC BORU': 'PVC PIPING' })).toBe(1);
    expect(rows[0]['Malzeme Cinsi']).toBe('PVC PIPING');
    expect(rows[0]._ceviriKaynak).toBe('PVC BORU');
  });

  it('bos _ceviriKaynak ada duser — orijinal olarak ad saklanir', () => {
    const rows = [satir('PVC BORU', { _ceviriKaynak: '  ' })];
    const s: CeviriSayfasi = { index: 0, rowData: rows, columnRoles: ROLLER };
    expect(ceviriUygula([s], { 'PVC BORU': 'PVC PIPE' })).toBe(1);
    expect(rows[0]._ceviriKaynak).toBe('PVC BORU');
  });

  it('kaynagi baska metin olan satir, adi haritada olsa da YAZILMAZ (sayilmayan satir cevrilmez)', () => {
    const rows = [satir('PVC BORU', { _ceviriKaynak: '25' })];
    const s: CeviriSayfasi = { index: 0, rowData: rows, columnRoles: ROLLER };
    expect(ceviriUygula([s], { 'PVC BORU': 'PVC PIPE' })).toBe(0);
    expect(rows[0]['Malzeme Cinsi']).toBe('PVC BORU');
  });

  it('cevrilmisSatirVarMi: gecerli isaret varsa true, bos isaret ya da isaretsizse false', () => {
    expect(cevrilmisSatirVarMi([{ rowData: [satir('PVC PIPE', { _ceviriKaynak: 'PVC BORU' })] }])).toBe(true);
    expect(cevrilmisSatirVarMi([{ rowData: [satir('PVC BORU', { _ceviriKaynak: ' ' })] }])).toBe(false);
    expect(cevrilmisSatirVarMi([{ rowData: [satir('PVC BORU')] }])).toBe(false);
    expect(cevrilmisSatirVarMi(undefined)).toBe(false);
  });

  it('satirKaynagi: dolu kaynak once, bos ya da dizge olmayan kaynak ada duser', () => {
    expect(satirKaynagi({ ad: 'PVC PIPE', _ceviriKaynak: 'PVC BORU' }, 'ad')).toBe('PVC BORU');
    expect(satirKaynagi({ ad: 'PVC BORU', _ceviriKaynak: '' }, 'ad')).toBe('PVC BORU');
    expect(satirKaynagi({ ad: 'PVC BORU', _ceviriKaynak: 7 }, 'ad')).toBe('PVC BORU');
  });

  it('live kaydi varsa sheet.rowData DEGIL live satirlari yazilir', () => {
    const bayat = [satir('PVC BORU')];
    const canli = [satir('PVC BORU')];
    const s: CeviriSayfasi = { index: 0, rowData: bayat, columnRoles: ROLLER };
    ceviriUygula([s], { 'PVC BORU': 'PVC PIPE' }, { 0: canli });
    expect(canli[0]['Malzeme Cinsi']).toBe('PVC PIPE');
    expect(bayat[0]['Malzeme Cinsi']).toBe('PVC BORU');
  });
});
