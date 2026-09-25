import { describe, expect, it } from 'vitest';
import {
  GECMIS_SINIRI,
  bosGecmis,
  gecmiseEkle,
  geriAl,
  tepedekiAdim,
  yinele,
  yinelenecekAdim,
} from './gecmis';

const adim = (id: number, belge: string) => ({ id, etiket: `islem ${id}`, belge });

describe('gecmis — geri al / yinele yigini', () => {
  it('bos yigin: geri alinacak da yinelenecek de bir sey yok', () => {
    const g = bosGecmis<string>();
    expect(geriAl(g, 'simdi')).toBeNull();
    expect(yinele(g, 'simdi')).toBeNull();
    expect(tepedekiAdim(g)).toBeNull();
    expect(yinelenecekAdim(g)).toBeNull();
  });

  it('geri al: tepedeki adimin (ISLEMDEN ONCEKI) belgesi doner, simdiki yineleme listesine girer', () => {
    const g = gecmiseEkle(gecmiseEkle(bosGecmis<string>(), adim(1, 'A')), adim(2, 'B'));
    const r = geriAl(g, 'C');
    expect(r?.belge).toBe('B');
    expect(r?.adim.id).toBe(2);
    expect(r?.gecmis.geri.map((a) => a.id)).toEqual([1]);
    expect(r?.gecmis.ileri).toEqual([{ id: 2, etiket: 'islem 2', belge: 'C' }]);
  });

  it('yinele geri alinan belgeyi geri getirir; ard arda geri al + yinele kimligi korur', () => {
    const g0 = gecmiseEkle(bosGecmis<string>(), adim(1, 'A'));
    const geri = geriAl(g0, 'B');
    const ileri = yinele(geri!.gecmis, geri!.belge);
    expect(ileri?.belge).toBe('B');
    expect(ileri?.gecmis.geri).toEqual([{ id: 1, etiket: 'islem 1', belge: 'A' }]);
    expect(ileri?.gecmis.ileri).toEqual([]);
  });

  it('YENI islem yineleme listesini SILER (dallanan gecmis yok)', () => {
    const g0 = gecmiseEkle(bosGecmis<string>(), adim(1, 'A'));
    const geri = geriAl(g0, 'B')!;
    expect(geri.gecmis.ileri).toHaveLength(1);
    const g1 = gecmiseEkle(geri.gecmis, adim(2, 'A'));
    expect(g1.ileri).toEqual([]);
  });

  it(`sinir (${GECMIS_SINIRI}) asilinca EN ESKI adim duser`, () => {
    let g = bosGecmis<number>();
    for (let i = 1; i <= GECMIS_SINIRI + 5; i++) g = gecmiseEkle(g, { id: i, etiket: 'x', belge: i });
    expect(g.geri).toHaveLength(GECMIS_SINIRI);
    expect(g.geri[0].id).toBe(6);
    expect(tepedekiAdim(g)?.id).toBe(GECMIS_SINIRI + 5);
  });

  it('girdi yigini degismez (saf)', () => {
    const g = gecmiseEkle(bosGecmis<string>(), adim(1, 'A'));
    const kopya = JSON.stringify(g);
    geriAl(g, 'B');
    gecmiseEkle(g, adim(2, 'B'));
    expect(JSON.stringify(g)).toBe(kopya);
  });
});
