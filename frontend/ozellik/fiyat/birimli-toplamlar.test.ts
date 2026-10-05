/**
 * COKLU PARA BIRIMI F3 (Emre karari 04.10) — sayfa toplamlari, KAR ve fitting
 * PARA BIRIMI BASINA.
 *
 * Karisik kipte taraf birimi (`_matPB`/`_labPB`) toplamlari ayirir: her birim
 * kendi "GENEL TOPLAM" ve "KAR" satirini alir. Fitting kapsami karisiksa her
 * birim icin AYRI tutar uretir, her biri kendi toplamina girer (karar 2).
 * Doviz 2 hane YUKARI (karar 4). Yalniz-TL sayfada sonuc `sayfaToplamlari`
 * ile BIREBIR ayni (tek ₺ kovasi).
 */
import { describe, it, expect } from 'vitest';
import { birimliToplamlar, fittingBirimli, cokluTutarMetni } from './taraf-para-birimi';
import { sayfaToplamlari } from './pricing';

const R = {
  nameField: 'ad', quantityField: 'q',
  materialUnitPriceField: 'mb', materialTotalField: 'mt',
  laborUnitPriceField: 'lb', laborTotalField: 'lt', grandTotalField: 'g',
};
let idx = 0;
const satir = (p: Record<string, any>) => ({ _rowIdx: ++idx, _isDataRow: true, _malzKar: 0, _iscKar: 0, ad: 'x', q: '2', ...p });

const TL = satir({ mb: '100.0', mt: '200.0', lb: '50.0', lt: '100.0' });
const KARMA = satir({ mb: '10.50', mt: '21.00', _matPB: 'USD', lb: '40.0', lt: '80.0' });
const BOS = satir({});

const kova = (k: ReturnType<typeof birimliToplamlar>, pb: string) => k.find((x) => x.pb === pb)?.ozet;

describe('birimliToplamlar — sayfa toplami para birimi basina', () => {
  it('★★ karisik sayfa: ₺ ve $ AYRI kova, dolar liraya EKLENMEZ', () => {
    const k = birimliToplamlar([TL, KARMA, BOS], R);
    expect(k.map((x) => x.pb)).toEqual(['TRY', 'USD']);
    expect(kova(k, 'TRY')).toMatchObject({ matToplam: 200, labToplam: 180, genelToplam: 380 });
    expect(kova(k, 'USD')).toMatchObject({ matToplam: 21, labToplam: 0, genelToplam: 21 });
  });

  it('★★ KONTROL: yalniz-TL sayfa tek ₺ kovasi ve sayfaToplamlari ile BIREBIR', () => {
    const satirlar = [TL, BOS];
    const k = birimliToplamlar(satirlar, R);
    expect(k.map((x) => x.pb)).toEqual(['TRY']);
    expect(k[0].ozet).toEqual(sayfaToplamlari(satirlar, R));
  });

  it('★ fiyatsiz satir HER kovanin uyarisina yazilir (hangi toplamin eksik oldugu bilinmez)', () => {
    const k = birimliToplamlar([TL, KARMA, BOS], R);
    for (const x of k) expect(x.ozet).toMatchObject({ matFiyatsiz: 1, labFiyatsiz: 1 });
  });

  it('★ yalniz dolar fiyatli sayfa: ₺ kovasi gosterilmez', () => {
    const k = birimliToplamlar([satir({ mb: '10.50', mt: '21.00', _matPB: 'USD' })], R);
    expect(k.map((x) => x.pb)).toEqual(['USD']);
  });

  it('hic fiyat yoksa tek ₺ kovasi (bugunku bos toplam satiri)', () => {
    expect(birimliToplamlar([BOS], R).map((x) => x.pb)).toEqual(['TRY']);
  });

  it('★★ KAR dovizde 2 hane: net $10, %5 → satis 10,50 × 3 = 31,50; maliyet 30,00; kar 1,50', () => {
    const r = satir({ q: '3', _malzKar: 5, _matNetPrice: 10, mb: '10.50', mt: '31.50', _matPB: 'USD' });
    expect(kova(birimliToplamlar([r], R), 'USD')).toMatchObject({ matToplam: 31.5, matMaliyet: 30, matKar: 1.5 });
  });

  it('★ dovizde MALIYET de 2 hane: net $3,333 → 3,34 × 3 = 10,02 (₺ kurali 10,20 derdi)', () => {
    // Tam sayili net hane farkini GOSTERMEZ — maliyet hanesini olcmek icin kuruslu net.
    const r = satir({ q: '3', _malzKar: 5, _matNetPrice: 3.333, mb: '3.50', mt: '10.50', _matPB: 'USD' });
    expect(kova(birimliToplamlar([r], R), 'USD')).toMatchObject({ matToplam: 10.5, matMaliyet: 10.02 });
  });
});

describe('fitting — karar 2: karisik kapsamda birim basina AYRI tutar', () => {
  const fit = () => satir({ q: '10', _fitting: { kapsam: [TL._rowIdx, KARMA._rowIdx] } });

  it('★★ malzeme: ₺ 200 × %10 = 20 · $ 21 × %10 = 2,10 (2 hane); iscilik ₺ 180 × %10 = 18', () => {
    const f = fit();
    const b = fittingBirimli(f, [TL, KARMA, f], R);
    expect(b.mat).toEqual([{ pb: 'TRY', toplam: 20 }, { pb: 'USD', toplam: 2.1 }]);
    expect(b.lab).toEqual([{ pb: 'TRY', toplam: 18 }]);
  });

  it('★★ fitting tutarlari KENDI kovasina girer (₺ 380 + 38 · $ 21 + 2,10)', () => {
    const f = fit();
    const k = birimliToplamlar([TL, KARMA, f], R);
    expect(kova(k, 'TRY')?.genelToplam).toBe(418);
    expect(kova(k, 'USD')?.genelToplam).toBe(23.1);
  });
});

describe('cokluTutarMetni — birden cok birimli hucre', () => {
  it('★ birimler sirayla, sifir yazilmaz, ayni birim birlesir', () => {
    expect(cokluTutarMetni([{ pb: 'TRY', tutar: 20 }, { pb: 'USD', tutar: 2.1 }])).toBe('₺20,00 + $2,10');
    expect(cokluTutarMetni([{ pb: 'USD', tutar: 0 }, { pb: 'TRY', tutar: 5 }])).toBe('₺5,00');
    expect(cokluTutarMetni([{ pb: 'USD', tutar: 1 }, { pb: 'USD', tutar: 2 }])).toBe('$3,00');
    expect(cokluTutarMetni([])).toBeNull();
  });
});
