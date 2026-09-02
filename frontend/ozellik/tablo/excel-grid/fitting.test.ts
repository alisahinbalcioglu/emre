/**
 * FITTING KAPSAM YARDIMCILARI KAPISI (02.09.2026)
 *  K1. Ctrl+tik: yoksa ekler, varsa cikarir; girdi dizisi DEGISMEZ.
 *  K2. Kapsama alinabilirlik: yalniz veri satiri; ozet/grup/spare/baska
 *      fitting/kendisi ALINMAZ (pricing ile ayni kural).
 *  K3. Satir silinince yalniz onu tasiyan fitting'lerin kapsami daralir.
 *  K4. "35%" / "%35" → "35"; isaretsiz deger dokunulmaz (null).
 *  K5. Rozet: 0 → "Σ satır seç", n → "Σ n satır".
 */
import { describe, it, expect } from 'vitest';
import {
  kapsamDegistir, fittingKapsaminaAlinabilirMi, silinenSatiriKapsamlardanDus,
  oranMetniniNormalize, fittingRozetMetni, fittingBirimiMi, fittingSatiriMi,
  kilitliEditable, yapistirmaHedefiMi, fittingHucreleri,
  fittingOncekiAl, fittingOncekiFiyatVarMi,
} from './fitting';
import { planYapistir } from './yapistir';

const ROLLER = {
  quantityField: '_miktar', unitField: '_birim',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
};

describe('K1 — kapsamDegistir', () => {
  it('yoksa ekler, varsa cikarir', () => {
    expect(kapsamDegistir([11, 12], 13)).toEqual([11, 12, 13]);
    expect(kapsamDegistir([11, 12, 13], 12)).toEqual([11, 13]);
  });
  it('girdi dizisini DEGISTIRMEZ', () => {
    const k = [11, 12];
    const y = kapsamDegistir(k, 13);
    expect(k).toEqual([11, 12]);
    expect(y).not.toBe(k);
  });
});

describe('K2 — fittingKapsaminaAlinabilirMi', () => {
  const fitIdx = 22;
  it('siradan veri satiri alinir', () => {
    expect(fittingKapsaminaAlinabilirMi({ _rowIdx: 11, _isDataRow: true }, fitIdx)).toBe(true);
  });
  it.each([
    ['baslik', { _rowIdx: 1, _isDataRow: false, _isHeaderRow: true }],
    ['grup bandi', { _rowIdx: 2, _isDataRow: false, _isGroupRow: true }],
    ['ozet', { _rowIdx: 3, _isDataRow: true, _ozet: true }],
    ['spare', { _rowIdx: 4, _isDataRow: true, _isSpareRow: true }],
    ['baska fitting', { _rowIdx: 5, _isDataRow: true, _fitting: { kapsam: [] } }],
    ['kendisi', { _rowIdx: fitIdx, _isDataRow: true }],
    ['kimliksiz', { _isDataRow: true }],
  ])('%s ALINMAZ', (_ad, satir) => {
    expect(fittingKapsaminaAlinabilirMi(satir as any, fitIdx)).toBe(false);
  });
  it('null/undefined alinmaz', () => {
    expect(fittingKapsaminaAlinabilirMi(null, fitIdx)).toBe(false);
    expect(fittingKapsaminaAlinabilirMi(undefined, fitIdx)).toBe(false);
  });
});

describe('K3 — silinenSatiriKapsamlardanDus', () => {
  const satirlar = [
    { _rowIdx: 11, _isDataRow: true },
    { _rowIdx: 12, _isDataRow: true },
    { _rowIdx: 22, _isDataRow: true, _fitting: { kapsam: [11, 12] } },
    { _rowIdx: 23, _isDataRow: true, _fitting: { kapsam: [12] } },
    { _rowIdx: 24, _isDataRow: true, _fitting: { kapsam: [11] } },
  ];
  it('12 silinince yalniz 22 ve 23 daralir, 24 dokunulmaz', () => {
    const s = silinenSatiriKapsamlardanDus(satirlar, 12);
    expect(s).toEqual([{ rowIdx: 22, kapsam: [11] }, { rowIdx: 23, kapsam: [] }]);
    // girdi degismedi
    expect(satirlar[2]._fitting!.kapsam).toEqual([11, 12]);
  });
  it('kimsenin kapsaminda olmayan satir → bos liste', () => {
    expect(silinenSatiriKapsamlardanDus(satirlar, 999)).toEqual([]);
  });
});

describe('K4 — oranMetniniNormalize', () => {
  it.each([
    ['35%', '35'], ['%35', '35'], ['% 35', '35'], ['12,5%', '12,5'],
  ])('%s → %s', (girdi, beklenen) => {
    expect(oranMetniniNormalize(girdi)).toBe(beklenen);
  });
  it('isaretsiz deger dokunulmaz (null)', () => {
    expect(oranMetniniNormalize('35')).toBeNull();
    expect(oranMetniniNormalize(35)).toBeNull();
    expect(oranMetniniNormalize('')).toBeNull();
  });
});

describe('K5 — rozet ve tanima', () => {
  it('rozet metni', () => {
    expect(fittingRozetMetni(0)).toBe('Σ satır seç');
    expect(fittingRozetMetni(6)).toBe('Σ 6 satır');
  });
  it('birim % (bosluklu da) fitting birimidir; "mt" degildir', () => {
    expect(fittingBirimiMi('%')).toBe(true);
    expect(fittingBirimiMi(' % ')).toBe(true);
    expect(fittingBirimiMi('mt')).toBe(false);
    expect(fittingBirimiMi(undefined)).toBe(false);
  });
  it('fittingSatiriMi: yalniz bag kurulmus satir', () => {
    expect(fittingSatiriMi({ _fitting: { kapsam: [] } })).toBe(true);
    expect(fittingSatiriMi({ _birim: '%' })).toBe(false);
    expect(fittingSatiriMi({ _fitting: {} })).toBe(false);
    expect(fittingSatiriMi(null)).toBe(false);
  });
});

describe('K6 — kilitliEditable: fitting satirinda hucre acilmaz, digerlerinde alttaki kural', () => {
  const fit = { data: { _isDataRow: true, _fitting: { kapsam: [1] } } };
  const boru = { data: { _isDataRow: true } };
  it('duz true → boru acik, fitting kapali', () => {
    const e = kilitliEditable(true);
    expect(e(boru)).toBe(true);
    expect(e(fit)).toBe(false);
    expect(e.fittingTemel).toBe(true);
  });
  it('duz false / undefined → herkese kapali, isaret yok', () => {
    expect(kilitliEditable(false)(boru)).toBe(false);
    expect(kilitliEditable(undefined)(boru)).toBe(false);
    expect(kilitliEditable(false).fittingTemel).toBe(false);
  });
  it('alttaki kural fonksiyonsa ona devreder (fitting yine kapali)', () => {
    const e = kilitliEditable((p: any) => p.data?._isDataRow === true);
    expect(e(boru)).toBe(true);
    expect(e({ data: { _isDataRow: false } })).toBe(false);
    expect(e(fit)).toBe(false);
    expect(e.fittingTemel).toBe(false);
  });
});

describe('K7 — yapistirma koprusu: kilit altindaki duz-editable kolon HEDEF kalir (28.08 yolu)', () => {
  it('yapistirmaHedefiMi kurali', () => {
    expect(yapistirmaHedefiMi(true)).toBe(true);
    expect(yapistirmaHedefiMi(kilitliEditable(true))).toBe(true);
    expect(yapistirmaHedefiMi(kilitliEditable(false))).toBe(false);
    expect(yapistirmaHedefiMi(() => true)).toBe(false); // isaretsiz fonksiyon: guvenli taraf
    expect(yapistirmaHedefiMi(false)).toBe(false);
    expect(yapistirmaHedefiMi(undefined)).toBe(false);
  });
  it('planYapistir: kilitli birim fiyat kolonu hedef, toplam kolonu (hesaplanan) hedef degil', () => {
    // Grid'in kolon tanimlarini ExcelGrid ile AYNI kuraldan kur (fonksiyon editable + kopru)
    const hesaplanan = new Set(['_matToplam']);
    const defs = [
      { field: '_ad', editable: true },
      { field: '_matBirim', editable: kilitliEditable(true) },
      { field: '_matToplam', editable: kilitliEditable(true) },
    ];
    const kolonlar = defs.map((d) => ({
      field: d.field,
      editable: yapistirmaHedefiMi(d.editable) && !hesaplanan.has(d.field),
      sayisal: d.field !== '_ad',
    }));
    // FIXTURE KANITI: kopru olmasaydi birim fiyat hedef olmazdi
    expect(kolonlar.find((k) => k.field === '_matBirim')!.editable).toBe(true);
    expect(kolonlar.find((k) => k.field === '_matToplam')!.editable).toBe(false);
    const plan = planYapistir('53,30', kolonlar as any, '_matBirim', [{ isDataRow: true }]);
    expect(plan.ozet.yazilacak).toBe(1);
    expect(plan.hucreler).toHaveLength(1);
    expect(plan.hucreler[0].field).toBe('_matBirim');
    // Kopru olmasaydi (isaretsiz fonksiyon) ayni yapistirma HEDEFSIZ kalirdi
    const kopruSuz = kolonlar.map((k) => (k.field === '_matBirim' ? { ...k, editable: false } : k));
    expect(planYapistir('53,30', kopruSuz as any, '_matBirim', [{ isDataRow: true }]).ozet.yazilacak).toBe(0);
  });
});

describe('K8 — fittingHucreleri: gecisin yazacagi hucreler saf ve olculur', () => {
  const borular = [
    { _rowIdx: 11, _isDataRow: true, _miktar: 300, _birim: 'mt', _matBirim: 350, _matToplam: 105000 },
    { _rowIdx: 12, _isDataRow: true, _miktar: 463, _birim: 'mt', _matBirim: 400, _matToplam: 185200 },
  ];
  it('yalniz fitting satiri icin, dort alan; iscilik yoksa bos string', () => {
    const fit = { _rowIdx: 22, _isDataRow: true, _miktar: 35, _birim: '%', _fitting: { kapsam: [11, 12] } };
    const h = fittingHucreleri([...borular, fit], ROLLER);
    expect(h.every((x) => x.rowIdx === 22)).toBe(true);
    expect(h).toEqual([
      { rowIdx: 22, alan: '_matBirim', deger: '2902.0' },   // 290.200 / 100
      { rowIdx: 22, alan: '_matToplam', deger: '101570.0' }, // 290.200 × %35
      { rowIdx: 22, alan: '_labBirim', deger: '' },
      { rowIdx: 22, alan: '_labToplam', deger: '' },
    ]);
  });
  it('kapsam bos → dort hucre bos; fitting olmayan sayfa → hic hucre yok', () => {
    const fit = { _rowIdx: 22, _isDataRow: true, _miktar: 35, _birim: '%', _fitting: { kapsam: [] } };
    expect(fittingHucreleri([...borular, fit], ROLLER).map((x) => x.deger)).toEqual(['', '', '', '']);
    expect(fittingHucreleri(borular, ROLLER)).toEqual([]);
  });
  it('rolde iscilik kolonu yoksa o alanlar uretilmez', () => {
    const fit = { _rowIdx: 22, _isDataRow: true, _miktar: 35, _birim: '%', _fitting: { kapsam: [11] } };
    const roller = { ...ROLLER, laborUnitPriceField: undefined, laborTotalField: undefined };
    expect(fittingHucreleri([...borular, fit], roller).map((x) => x.alan)).toEqual(['_matBirim', '_matToplam']);
  });
});

describe('K9 — eski degerler saklanir (C1: sessiz para silme yok)', () => {
  const fiyatli = { _rowIdx: 5, _isDataRow: true, _miktar: 35, _matBirim: '1000.0', _matToplam: '35000.0', _labBirim: '', _labToplam: '', _matNetPrice: 800, _malzKar: 25 };
  it('fittingOncekiAl dort para hucresini ve sistem alanlarini kopyalar', () => {
    const o = fittingOncekiAl(fiyatli, ROLLER);
    expect(o).toEqual({ _matBirim: '1000.0', _matToplam: '35000.0', _labBirim: '', _labToplam: '', _matNetPrice: 800, _malzKar: 25 });
    expect(fittingOncekiFiyatVarMi(o, ROLLER)).toBe(true);
  });
  it('bos satirda fiyat yok → uyari verilmez', () => {
    const o = fittingOncekiAl({ _rowIdx: 6, _isDataRow: true, _matBirim: '', _matToplam: '' }, ROLLER);
    expect(fittingOncekiFiyatVarMi(o, ROLLER)).toBe(false);
    expect(fittingOncekiFiyatVarMi(null, ROLLER)).toBe(false);
  });
});
