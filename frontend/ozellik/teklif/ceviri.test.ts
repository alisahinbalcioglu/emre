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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ceviriAnahtari,
  ceviriUygula,
  duzeltmeyiSatirlaraUygula,
  ceviriGeriAl,
  cevrilmisSatirVarMi,
  ingilizceGorunum,
  kayittaKaynakDuruyorMu,
  satirKaynagi,
  turkceGorunum,
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

// ── C) BAYAT ISARET (Faz 6.11, 15.09) ─────────────────────────────────────

describe('_ceviriSonucu — isaret yalniz hucre hala ceviriyi tasiyorsa gecerli', () => {
  it('ceviriUygula yazdigi degeri _ceviriSonucu olarak saklar', () => {
    const rows = [satir('PVC BORU')];
    ceviriUygula([{ index: 0, rowData: rows, columnRoles: ROLLER }], { 'PVC BORU': 'PVC PIPE' });
    expect(rows[0]._ceviriSonucu).toBe('PVC PIPE');
  });

  it('bayat isaret (hucre ceviriden sonra elle degisti): satirKaynagi HUCREYI verir', () => {
    expect(satirKaynagi({ 'Malzeme Cinsi': 'KELEBEK VANA', _ceviriKaynak: 'KÜRESEL VANA', _ceviriSonucu: 'BALL VALVE' }, 'Malzeme Cinsi')).toBe('KELEBEK VANA');
  });

  it('ceviriGeriAl bayat hucreyi kaynaga EZMEZ, iki isareti de siler', () => {
    const rows = [satir('KELEBEK VANA', { _ceviriKaynak: 'KÜRESEL VANA', _ceviriSonucu: 'BALL VALVE' })];
    expect(ceviriGeriAl([{ index: 0, rowData: rows, columnRoles: ROLLER }])).toBe(1);
    expect(rows[0]['Malzeme Cinsi']).toBe('KELEBEK VANA');
    expect(rows[0]._ceviriKaynak).toBeUndefined();
    expect(rows[0]._ceviriSonucu).toBeUndefined();
  });

  it('kayittaKaynakDuruyorMu: gecerli isaretli satir false', () => {
    expect(kayittaKaynakDuruyorMu({ ad: 'PVC PIPE', _ceviriKaynak: 'PVC BORU', _ceviriSonucu: 'PVC PIPE' }, 'ad')).toBe(false);
  });

  it('kayittaKaynakDuruyorMu: bayat isaretli satir true', () => {
    expect(kayittaKaynakDuruyorMu({ ad: 'KELEBEK VANA', _ceviriKaynak: 'KÜRESEL VANA', _ceviriSonucu: 'BALL VALVE' }, 'ad')).toBe(true);
  });

  it('kayittaKaynakDuruyorMu: isaretsiz satir true', () => {
    expect(kayittaKaynakDuruyorMu({ ad: 'PVC BORU' }, 'ad')).toBe(true);
  });
});

// ── D) GORUNUM — detay ekrani kaydi DEGISTIRMEZ (Faz 6.11) ────────────────

describe('ingilizceGorunum / turkceGorunum', () => {
  const kayit = (): CeviriSayfasi[] => [{
    index: 0,
    columnRoles: ROLLER,
    rowData: [
      satir('PVC BORU'),
      satir('STEEL PIPE', { _ceviriKaynak: 'ÇELİK BORU', _ceviriSonucu: 'STEEL PIPE' }),
      satir('KELEBEK VANA', { _ceviriKaynak: 'KÜRESEL VANA', _ceviriSonucu: 'BALL VALVE' }),
      satir('BAKIR BORU'),
    ],
  }];
  const HARITA = { 'PVC BORU': 'PVC PIPE', 'ÇELİK BORU': 'STEEL PIPING', 'KÜRESEL VANA': 'BALL VALVE' };

  it('kayit nesnelerini DEGISTIRMEZ (derin karsilastirma)', () => {
    const s = kayit();
    const once = JSON.stringify(s);
    ingilizceGorunum(s, HARITA);
    expect(JSON.stringify(s)).toBe(once);
  });

  it('yalniz kayitta kaynak duran satira yazar: Ingilizce kayitli ve bayat satir degismez, yazilan 1', () => {
    const r = ingilizceGorunum(kayit(), HARITA);
    const ad = r.sayfalar[0].rowData!.map((x) => x['Malzeme Cinsi']);
    expect(ad).toEqual(['PVC PIPE', 'STEEL PIPE', 'KELEBEK VANA', 'BAKIR BORU']);
    expect(r.yazilan).toBe(1);
  });

  it('degisen satir kopyasi isaretleri tasir (Revize Et Ingilizceyi isaretiyle tasir)', () => {
    const r = ingilizceGorunum(kayit(), HARITA);
    expect(r.sayfalar[0].rowData![0]._ceviriKaynak).toBe('PVC BORU');
    expect(r.sayfalar[0].rowData![0]._ceviriSonucu).toBe('PVC PIPE');
  });

  it('turkceGorunum: gecerli isaretli satirda Turkce kaynak', () => {
    expect(turkceGorunum(kayit())[0].rowData![1]['Malzeme Cinsi']).toBe('ÇELİK BORU');
  });

  it('turkceGorunum: bayat isaretli satirda hucre korunur', () => {
    expect(turkceGorunum(kayit())[0].rowData![2]['Malzeme Cinsi']).toBe('KELEBEK VANA');
  });

  it('turkceGorunum: isaretler kopyadan atilir, kayit degismez', () => {
    const s = kayit();
    const once = JSON.stringify(s);
    const r = turkceGorunum(s);
    expect(r[0].rowData![1]._ceviriKaynak).toBeUndefined();
    expect(r[0].rowData![1]._ceviriSonucu).toBeUndefined();
    expect(JSON.stringify(s)).toBe(once);
  });

  // S10 — EKRAN = DOSYA: sunucu `disaAktarimPlani` AYNI fikstürü koşar
  // (backend/test/ceviri-gorunum-cikti-test.ts S10). İki yüz farklı satırı
  // değiştirirse ekranda İngilizce görünen dosyada Türkçe iner ya da tersi.
  it('S10 ikiz fikstur: beklenen degisen satirlar ve yazilan sayisi sunucu planiyla ayni', () => {
    const fx = JSON.parse(readFileSync(join(__dirname, '../../../test-fixtures/ceviri-gorunum-ikizi.json'), 'utf8'));
    const r = ingilizceGorunum(fx.sayfalar as CeviriSayfasi[], fx.onbellek);
    const degisen: Array<[number, number, string]> = [];
    r.sayfalar.forEach((sayfa, si) => sayfa.rowData!.forEach((row, ri) => {
      if (row !== fx.sayfalar[si].rowData[ri]) degisen.push([si, ri, row[sayfa.columnRoles!.nameField!]]);
    }));
    expect(degisen).toEqual(fx.beklenen.degisecek);
    expect(r.yazilan).toBe(fx.beklenen.degisecek.length);
  });
});

// ── FAZ 6.9: FİRMA DÜZELTMESİNİ SATIRLARA UYGULAMA (Düzenle, canlı satırlar) ──
describe('duzeltmeyiSatirlaraUygula', () => {
  const ROLLER = { nameField: '_ad' } as any;
  const sayfa = (satirlar: any[]): CeviriSayfasi[] => [{ index: 0, isEmpty: false, columnRoles: ROLLER, rowData: satirlar }];

  it('yalnız anahtarı EŞLEŞEN satıra yazar; Türkçe kalmış satıra işaret koyar', () => {
    const satirlar = [{ _ad: 'KÜRESEL VANA' }, { _ad: 'PVC BORU' }];
    const r = duzeltmeyiSatirlaraUygula(sayfa(satirlar), 'KÜRESEL VANA', 'SPHERICAL VALVE');
    expect(r.yazilan).toBe(1);
    expect(satirlar[0]).toMatchObject({ _ad: 'SPHERICAL VALVE', _ceviriKaynak: 'KÜRESEL VANA', _ceviriSonucu: 'SPHERICAL VALVE' });
    expect(satirlar[1]).toEqual({ _ad: 'PVC BORU' });
  });

  it('zaten çevrilmiş satırda kaynak KORUNUR, hücre ve sonuç işareti yenilenir', () => {
    const satirlar = [{ _ad: 'BALL VALVE', _ceviriKaynak: 'KÜRESEL VANA', _ceviriSonucu: 'BALL VALVE' }];
    duzeltmeyiSatirlaraUygula(sayfa(satirlar), 'KÜRESEL VANA', 'SPHERICAL VALVE');
    expect(satirlar[0]).toEqual({ _ad: 'SPHERICAL VALVE', _ceviriKaynak: 'KÜRESEL VANA', _ceviriSonucu: 'SPHERICAL VALVE' });
  });

  it('deger null → Türkçe kaynağa döner ve iki işaret de silinir', () => {
    const satirlar = [{ _ad: 'BALL VALVE', _ceviriKaynak: 'KÜRESEL VANA', _ceviriSonucu: 'BALL VALVE' }];
    const r = duzeltmeyiSatirlaraUygula(sayfa(satirlar), 'KÜRESEL VANA', null);
    expect(r.yazilan).toBe(1);
    expect(satirlar[0]).toEqual({ _ad: 'KÜRESEL VANA' });
  });

  it('BAYAT işaretli satırda (hücre elle değişmiş) kullanıcının yazdığı EZİLMEZ', () => {
    const satirlar = [{ _ad: 'KIRMIZI VANA', _ceviriKaynak: 'KÜRESEL VANA', _ceviriSonucu: 'BALL VALVE' }];
    const r = duzeltmeyiSatirlaraUygula(sayfa(satirlar), 'KÜRESEL VANA', 'SPHERICAL VALVE');
    expect(r.yazilan).toBe(0);
    expect(satirlar[0]._ad).toBe('KIRMIZI VANA');
  });

  it('uygulamadan sonra satırın ÇEVİRİ KAYNAĞI hâlâ Türkçe asıldır (içerik özeti değişmez)', () => {
    const satirlar = [{ _ad: 'KÜRESEL VANA' }];
    duzeltmeyiSatirlaraUygula(sayfa(satirlar), 'KÜRESEL VANA', 'SPHERICAL VALVE');
    expect(ceviriAnahtari(satirKaynagi(satirlar[0] as any, '_ad'))).toBe('KÜRESEL VANA');
    expect(kayittaKaynakDuruyorMu(satirlar[0] as any, '_ad')).toBe(false);
  });

  it('canlı satırlar (live) verilirse onlara yazar; boş anahtar hiçbir şey yapmaz', () => {
    const canli = [{ _ad: 'KÜRESEL VANA' }];
    const r = duzeltmeyiSatirlaraUygula(sayfa([{ _ad: 'BAŞKA' }]), 'KÜRESEL VANA', 'SPHERICAL VALVE', { 0: canli as any });
    expect(r.yazilan).toBe(1);
    expect(canli[0]._ad).toBe('SPHERICAL VALVE');
    expect(duzeltmeyiSatirlaraUygula(sayfa([{ _ad: 'X' }]), '  ', 'Y').yazilan).toBe(0);
  });
});
