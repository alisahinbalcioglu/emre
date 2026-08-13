/**
 * TEKLIF CEVIRISI — DOKUNULMAZLAR VE TOPLAMA (13.08).
 *
 * ★ BU DOSYANIN ASIL ISI: motorun olcuyu bozmasini engellemek. "DN 20" bir
 * cumle degil, ESLESTIRME ANAHTARIDIR; cevrilirse hem fiyat eslesmesi hem
 * musteriye giden teklif birlikte bozulur. Ayni gun capin sorgudan dusmesinin
 * sessiz para hatasi urettigini olctuk (query-engine sert cap filtresi) —
 * capi ceviriye vermek ayni ailenin ikinci hatasi olurdu.
 *
 * ⚠ BIR ASSERT TEK KRITERE (proje kurali): her kriter kendi it() blogunda.
 * ⚠ BOS DIZI YALANCI YESIL: her toplu vakada payda acikca kilitlenir.
 */
import { describe, it, expect } from 'vitest';
import {
  dokunulmazMi,
  ceviriAnahtari,
  cevrilecekMetinler,
  ceviriUygula,
  ceviriGeriAl,
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

function sayfa(adlar: string[], roller: ColumnRoles = ROLLER): CeviriSayfasi {
  return { index: 0, isEmpty: false, rowData: adlar.map((a) => satir(a)), columnRoles: roller };
}

// ── A) DOKUNULMAZLAR — olcu/kod metinleri ceviriye GIRMEZ ───────────────────

describe('dokunulmazMi — olcu ve kod metinleri', () => {
  const DOKUNULMAZ = [
    'DN 20', 'DN20', 'dn 150',        // nominal cap
    'Ø110', 'Ø 110', 'φ50',            // Ø gosterimi (extractCapFromText bunu GOREMEZ)
    '6"', '1 1/4"', '3/4"', '2½"',     // inc gosterimi
    '25', '0.5', '1,5', '313',         // saf sayi
    '9MM', '110 mm',                   // sayi + birim
    'PN 20',                           // basinc sinifi — cap degil ama yine kod
    '2x9,36 m³/h',                     // teknik spec (fotograftaki hidrofor satiri)
    // ⚠ REDUKSIYON GOSTERIMI — Ø soyulmasinin GERCEKTEN yuk tasidigi vaka.
    // Ø tek basina Unicode'da HARFTIR; soyulmazsa "Ø110 x Ø90" iki harf sayilir
    // ve esigi gecip CEVIRIYE SIZAR. Tek Ø'lu ornekler bunu gosteremiyordu
    // (mutasyon M18 sag kalmisti) — kriter bu satirlarla muhurlendi.
    'Ø110 x Ø90', '3"x1"', 'DN80 x DN25',
    '', '   ',                         // bos hucre
  ];

  it('olcu/kod metinlerinin HEPSI dokunulmaz (23 vaka)', () => {
    // ⚠ payda kilidi — bos dizide .every() yalanci yesil verirdi
    expect(DOKUNULMAZ).toHaveLength(23);
    const sizanlar = DOKUNULMAZ.filter((m) => !dokunulmazMi(m));
    expect(sizanlar, 'ceviriye SIZAN olcu metinleri: ' + sizanlar.join(' | ')).toEqual([]);
  });

  it('"DN 20" ceviriye girmez — eslestirme anahtaridir', () => {
    expect(dokunulmazMi('DN 20')).toBe(true);
  });

  it('"Ø110" ceviriye girmez — Ø gosterimi de korunur', () => {
    expect(dokunulmazMi('Ø110')).toBe(true);
  });

  it('6 inc gosterimi ceviriye girmez', () => {
    expect(dokunulmazMi('6"')).toBe(true);
  });
});

// ── B) CEVRILECEKLER — insanin okudugu metin ───────────────────────────────

describe('dokunulmazMi — gercek metinler cevrilir', () => {
  const CEVRILIR = [
    'PVC BORU',
    'TEMİZ SU HİDROFORU',
    'SIHHI TESİSAT İŞLERİ',
    'FİTTİNGS ORANI',
    'Montaj bedeli',
    'Küresel vana',
    'Int yangın borusu',
  ];

  it('gercek malzeme/is adlarinin HEPSI cevrilir (7 vaka)', () => {
    expect(CEVRILIR).toHaveLength(7);
    const atlananlar = CEVRILIR.filter((m) => dokunulmazMi(m));
    expect(atlananlar, 'yanlislikla DOKUNULMAZ sayilanlar: ' + atlananlar.join(' | ')).toEqual([]);
  });

  it('olcu ICEREN ad yine de cevrilir — olcu metnin tamami degilse', () => {
    // "9MM ALUMİNYUM FOLYO KAUÇUK BORU İZOLASYONU": olcu cikinca anlamli ad kalir
    expect(dokunulmazMi('9MM ALUMİNYUM FOLYO KAUÇUK BORU İZOLASYONU')).toBe(false);
  });

  it('tek harflik kalinti kod sayilir, cumle sayilmaz', () => {
    expect(dokunulmazMi('2x9,36 m³/h')).toBe(true);
  });
});

// ── C) ANAHTAR NORMALIZASYONU ──────────────────────────────────────────────

describe('ceviriAnahtari — onbellek anahtari tek yoldan uretilir', () => {
  it('bastaki/sondaki bosluk anahtari degistirmez', () => {
    expect(ceviriAnahtari('  PVC BORU  ')).toBe('PVC BORU');
  });

  it('ic bosluklar teklenir — "PVC  BORU" ile "PVC BORU" AYNI anahtardir', () => {
    expect(ceviriAnahtari('PVC  BORU')).toBe(ceviriAnahtari('PVC BORU'));
  });
});

// ── D) TOPLAMA — benzersizlestirme (olcek meselesi) ────────────────────────

describe('cevrilecekMetinler — benzersizlestirme', () => {
  it('tekrar eden adlar TEK KEZ toplanir', () => {
    const s = sayfa(['PVC BORU', 'PVC BORU', 'PVC BORU']);
    expect(cevrilecekMetinler([s])).toEqual(['PVC BORU']);
  });

  it('15 satirlik tekrarli liste 2 benzersiz metne iner (olcek kaniti)', () => {
    const adlar: string[] = [];
    for (let i = 0; i < 5; i++) adlar.push('PVC BORU', 'DN 20', 'ÇELİK BORU');
    expect(adlar).toHaveLength(15);
    // 'DN 20' dokunulmaz → toplanmaz; geriye 2 benzersiz ad kalir
    expect(cevrilecekMetinler([sayfa(adlar)]).sort()).toEqual(['PVC BORU', 'ÇELİK BORU']);
  });

  it('dokunulmaz metinler HIC toplanmaz', () => {
    const s = sayfa(['DN 20', 'Ø110', '25', '6"']);
    expect(cevrilecekMetinler([s])).toEqual([]);
  });

  it('isEmpty sayfa atlanir', () => {
    const s = { ...sayfa(['PVC BORU']), isEmpty: true };
    expect(cevrilecekMetinler([s])).toEqual([]);
  });

  it('nameField rolu olmayan sayfa atlanir', () => {
    const { nameField: _ad, ...adsiz } = ROLLER;
    expect(cevrilecekMetinler([sayfa(['PVC BORU'], adsiz)])).toEqual([]);
  });

  it('live kaydi varsa sheet.rowData DEGIL live satirlari toplanir', () => {
    const bayat = sayfa(['BAYAT AD']);
    const canli = [satir('CANLI AD')];
    expect(cevrilecekMetinler([bayat], { 0: canli })).toEqual(['CANLI AD']);
  });
});

// ── E) UYGULAMA VE GERI ALMA ───────────────────────────────────────────────

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
});
