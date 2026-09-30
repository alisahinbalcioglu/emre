/**
 * FITTING KESFI KAPISI (30.09.2026)
 *  I1. × kalicidir: kapatinca depoya 'kapali' yazilir, sonra "kapatildi" okunur.
 *  I2. Depo hata firlatirsa okuma "kapatilmadi", yazma sessiz (sayfa dusmez).
 *  I3. Teklifte bag kurulmus satir varsa ipucu gereksiz — birimi "%" olan
 *      ama bagsiz satir SAYILMAZ (ogrenmemis olabilir).
 *  I4. Komut: bos satir "Fitting bedeli" + "%" olur, bag burada KURULMAZ.
 *  I5. BAGLANTI: ipucunun anlattigi menu komutu gridde var, teklif
 *      sayfasi ipucunu cizer ve `kullanildi`yi canli satirlardan besler.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  FITTING_IPUCU_ANAHTARI, fittingIpucuKapatildiMi, fittingIpucunuKaliciKapat, teklifteFittingVarMi,
} from './fitting-ipucu';
import { fittingSatiriHazirla, FITTING_BIRIMI, FITTING_VARSAYILAN_AD } from '../tablo/excel-grid/fitting';

function bellekDepo() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}
const bozukDepo = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

describe('I1 — kalici kapatma', () => {
  it('kapatmadan once gorunur, kapatinca kalici', () => {
    const d = bellekDepo();
    expect(fittingIpucuKapatildiMi(d)).toBe(false);
    fittingIpucunuKaliciKapat(d);
    expect(d.m.get(FITTING_IPUCU_ANAHTARI)).toBe('kapali');
    expect(fittingIpucuKapatildiMi(d)).toBe(true);
  });
});

describe('I2 — depo erisilemez', () => {
  it('okuma false, yazma firlatmaz', () => {
    expect(fittingIpucuKapatildiMi(bozukDepo)).toBe(false);
    expect(() => fittingIpucunuKaliciKapat(bozukDepo)).not.toThrow();
    expect(fittingIpucuKapatildiMi(null)).toBe(false);
  });
});

describe('I3 — teklifte fitting var mi', () => {
  it('bagli satir herhangi bir sayfada → true', () => {
    expect(teklifteFittingVarMi({ 0: [{ a: 1 }], 1: [null, { _fitting: { kapsam: [] } }] })).toBe(true);
  });
  it('bagsiz "%" satiri, bos ve tanimsiz sayfalar → false', () => {
    expect(teklifteFittingVarMi({ 0: [{ _birim: '%' }], 1: undefined, 2: [] })).toBe(false);
    expect(teklifteFittingVarMi({})).toBe(false);
  });
});

describe('I4 — fittingSatiriHazirla', () => {
  it('ad + birim yazilir, bag kurulmaz, girdi degismez', () => {
    const bos = { _rowIdx: 7, _ad: '', _birim: '', _miktar: '' };
    const s = fittingSatiriHazirla(bos, { nameField: '_ad', unitField: '_birim' });
    expect(s).toEqual({ _rowIdx: 7, _ad: FITTING_VARSAYILAN_AD, _birim: FITTING_BIRIMI, _miktar: '' });
    expect((s as any)._fitting).toBeUndefined();
    expect(bos._ad).toBe('');
  });
  it('rol alani yoksa o hucreye dokunmaz', () => {
    expect(fittingSatiriHazirla({ _rowIdx: 1 }, {})).toEqual({ _rowIdx: 1 });
  });
});

describe('I5 — baglanti', () => {
  const grid = fs.readFileSync(path.join(__dirname, '../tablo/excel-grid/ExcelGrid.tsx'), 'utf8');
  const sayfa = fs.readFileSync(path.join(__dirname, '../../app/(protected)/quotes/new/page.tsx'), 'utf8');

  it('menu komutu fittingSatiriEkle cagirir ve yalniz teklif modunda', () => {
    const i = grid.indexOf('data-testid="fitting-menu-ekle"');
    expect(i).toBeGreaterThan(0);
    const blok = grid.slice(grid.lastIndexOf('{mode === \'quote\' && fittingDuzenlenebilir', i), i + 400);
    expect(blok).toContain("mode === 'quote' && fittingDuzenlenebilir");
    expect(blok).toContain('onClick={() => fittingSatiriEkle(');
  });
  it('komut satiri hazirlar ve kapsam modunu acar', () => {
    const i = grid.indexOf('const fittingSatiriEkle = useCallback');
    const govde = grid.slice(i, grid.indexOf('}, [', i));
    expect(govde).toContain('fittingSatiriHazirla(makeBlankRow()');
    expect(govde).toContain('fittingModunuAc(satir._rowIdx)');
    expect(govde).toContain('startEditingCell');
  });
  it('teklif sayfasi ipucunu canli satirlardan besler', () => {
    expect(sayfa).toContain('<FittingIpucu kullanildi={teklifteFittingVarMi(liveRowDataBySheet)} />');
  });
});
