/**
 * COKLU PARA BIRIMI F6c (karar K2) — "Tumu X" gorunumu saf kurallari.
 *
 * Ana olcut K2'nin SOZU: ayni kurla "Tumu ₺" GENEL TOPLAM = teklif listesinin
 * toplami (QuoteItem TL karsiliklari, `kalemUret`) — kurusu kurusuna. Ikinci
 * olcut: yalniz-₺ sayfada ozet `sayfaToplamlari` ile BIREBIR (cevrim kimlik).
 */
import { describe, it, expect } from 'vitest';
import { tumuTutari, tumuHucresi, tumuOzeti, gorunumSecenekleri, tumuGorunumu, gorunumSecimi, anahtarDurumu, type TumuGorunum } from './tumu-gorunum';
import { fittingBirimli } from './taraf-para-birimi';
import { sayfaToplamlari, kurusTamsayi } from './pricing';
import { kalemUret } from '../teklif/teklif-kalem';

const R = {
  nameField: 'ad', quantityField: 'q',
  materialUnitPriceField: 'mb', materialTotalField: 'mt',
  laborUnitPriceField: 'lb', laborTotalField: 'lt', grandTotalField: 'g',
};
let idx = 0;
const satir = (p: Record<string, any>) => ({ _rowIdx: ++idx, _isDataRow: true, _malzKar: 0, _iscKar: 0, ad: 'x', q: '2', ...p });

// Canli kur: 1 USD = 41 TL, 1 EUR = 45 TL. Donuk kur satirda (40 / 39,5).
const KUR = { USD: 41, EUR: 45 };
const TUMU = (hedef: 'TRY' | 'USD' | 'EUR'): TumuGorunum => ({ hedef, tlKuru: KUR });
const donuk = (kur: number, currency = 'USD') => ({ currency, kur, tarih: '01.10.2026' });

describe('tumuTutari — tek tutar', () => {
  it('★ tarafin kendi birimi hedefse CEVRILMEZ ($10,55 Tumu USD\'de $10,55)', () => {
    expect(tumuTutari(10.55, 'USD', donuk(40), TUMU('USD'))).toBe(10.55);
  });
  it('★★ $ → ₺ once DONUK kur (40), canli (41) degil', () => {
    expect(tumuTutari(10.5, 'USD', donuk(40), TUMU('TRY'))).toBe(420);
  });
  it('★ donuk kur yoksa canli kur', () => {
    expect(tumuTutari(10.5, 'USD', null, TUMU('TRY'))).toBe(430.5);
  });
  it('★ ₺ → $ canli kurla, kurus: 100 / 41 = 2,44', () => {
    expect(tumuTutari(100, 'TRY', null, TUMU('USD'))).toBe(2.44);
  });
  it('★ € → $ capraz: once TL (donuk 39,5), sonra canli $ kuru', () => {
    // 10 € × 39,5 = 395 TL; 395 / 41 = 9,634… → 9,63
    expect(tumuTutari(10, 'EUR', donuk(39.5, 'EUR'), TUMU('USD'))).toBe(9.63);
  });
  it('★★ kur yoksa null — uydurma kur yok', () => {
    expect(tumuTutari(10.5, 'USD', null, { hedef: 'TRY', tlKuru: {} })).toBeNull();
    expect(tumuTutari(100, 'TRY', null, { hedef: 'USD', tlKuru: {} })).toBeNull();
  });
  it('sifir sifir kalir (kur gerekmez)', () => {
    expect(tumuTutari(0, 'USD', null, { hedef: 'TRY', tlKuru: {} })).toBe(0);
  });
});

describe('tumuHucresi — veri satiri hucreleri', () => {
  const KARMA = satir({ mb: '10.50', mt: '21.00', _matPB: 'USD', _matKurBilgi: donuk(40), lb: '40.0', lt: '80.0' });
  it('★★ birim ve toplam: $ taraf donuk kurla ₺', () => {
    expect(tumuHucresi(KARMA, 'mb', R, TUMU('TRY'))).toBe(420);
    expect(tumuHucresi(KARMA, 'mt', R, TUMU('TRY'))).toBe(840);
  });
  it('★★ karma satirin genel toplami PARCALARDAN: $21 → ₺840 + ₺80 = ₺920', () => {
    expect(tumuHucresi(KARMA, 'g', R, TUMU('TRY'))).toBe(920);
  });
  it('★ Tumu USD: $ taraf aynen, ₺ taraf canli kurla (80 / 41 = 1,95)', () => {
    expect(tumuHucresi(KARMA, 'mt', R, TUMU('USD'))).toBe(21);
    expect(tumuHucresi(KARMA, 'lt', R, TUMU('USD'))).toBe(1.95);
    expect(tumuHucresi(KARMA, 'g', R, TUMU('USD'))).toBe(22.95);
  });
  it('★ fitting satiri birim basina parcalarindan (canli kur), birim fiyat hucresi bos', () => {
    const fit = satir({ _fitting: { kapsam: [] }, _fittingBirimli: { mat: [{ pb: 'TRY', toplam: 20 }, { pb: 'USD', toplam: 2.1 }], lab: [] } });
    expect(tumuHucresi(fit, 'mt', R, TUMU('TRY'))).toBe(106.1); // 20 + 2,10 × 41
    expect(tumuHucresi(fit, 'mb', R, TUMU('TRY'))).toBeNull();
  });
  it('para hucresi olmayan alan null', () => {
    expect(tumuHucresi(KARMA, 'ad', R, TUMU('TRY'))).toBeNull();
  });
});

describe('tumuOzeti — K2 sozu ve kimlik', () => {
  // Farkli donuk kurlu iki $ satiri, donuk kursuz elle $ (canli), € satiri,
  // ₺ satiri, karma satir ve karisik kapsamli fitting.
  const satirlar = () => {
    const a = satir({ q: '3', mb: '10.55', mt: '31.65', _matPB: 'USD', _matKurBilgi: donuk(40) });
    const b = satir({ q: '7', mb: '9.25', mt: '64.75', _matPB: 'USD', _matKurBilgi: donuk(38.2) });
    const c = satir({ q: '1', mb: '12.31', mt: '12.31', _matPB: 'USD' });
    const d = satir({ q: '4', lb: '7.51', lt: '30.04', _labPB: 'EUR', _labKurBilgi: donuk(39.5, 'EUR') });
    const e = satir({ q: '2', mb: '100.0', mt: '200.0', lb: '50.0', lt: '100.0' });
    const f = satir({ q: '5', _malzKar: 10, _matNetPrice: 10, mb: '11.00', mt: '55.00', _matPB: 'USD', _matKurBilgi: donuk(40), lb: '40.0', lt: '200.0' });
    const fit: Record<string, any> = satir({ q: '10', _fitting: { kapsam: [a._rowIdx, e._rowIdx] } });
    const hepsi = [a, b, c, d, e, f, fit];
    fit._fittingBirimli = fittingBirimli(fit, hepsi, R); // izgaranin yazdigi
    return hepsi;
  };

  it('★★★ "Tumu ₺" GENEL TOPLAM = liste toplami (kalemUret TL karsiliklari), kurusu kurusuna', () => {
    const s = satirlar();
    const liste = s.reduce((t, r) => {
      const k = kalemUret(r, R as any, { tlKuru: KUR });
      return t + kurusTamsayi(k?.materialTotalPrice ?? 0) + kurusTamsayi(k?.laborTotalPrice ?? 0);
    }, 0) / 100;
    const oz = tumuOzeti(s, R, TUMU('TRY'));
    expect(oz.genelToplam).toBe(liste);
    expect(oz.cevrilemeyen).toBe(0);
  });

  it('★★ yalniz-₺ sayfa: ozet sayfaToplamlari ile BIREBIR (cevrim kimlik)', () => {
    const tl = [
      satir({ q: '3', mb: '100.0', mt: '300.0', lb: '50.0', lt: '150.0' }),
      satir({ q: '2', _malzKar: 20, _matNetPrice: 80, mb: '96.0', mt: '192.0' }),
      satir({}),
    ];
    const { cevrilemeyen, ...oz } = tumuOzeti(tl, R, TUMU('TRY'));
    expect(oz).toEqual(sayfaToplamlari(tl, R));
    expect(cevrilemeyen).toBe(0);
  });

  it('★★ KAR ayni kurla cevrilir: net $10 %10 → satis $55, maliyet $50 → KAR ₺200 (donuk 40)', () => {
    const r = satir({ q: '5', _malzKar: 10, _matNetPrice: 10, mb: '11.00', mt: '55.00', _matPB: 'USD', _matKurBilgi: donuk(40) });
    expect(tumuOzeti([r], R, TUMU('TRY'))).toMatchObject({ matToplam: 2200, matMaliyet: 2000, matKar: 200 });
  });

  it('★ Tumu USD: $ satirlar aynen toplanir, ₺ satir canli kurla', () => {
    const r1 = satir({ q: '1', mb: '10.55', mt: '10.55', _matPB: 'USD', _matKurBilgi: donuk(40) });
    const r2 = satir({ q: '1', mb: '82.0', mt: '82.0' });
    expect(tumuOzeti([r1, r2], R, TUMU('USD')).matToplam).toBe(12.55); // 10,55 + 82/41
  });

  it('★ fiyatsiz satir sayilir (KAR ipucu)', () => {
    expect(tumuOzeti([satir({})], R, TUMU('TRY'))).toMatchObject({ matFiyatsiz: 1, labFiyatsiz: 1 });
  });

  it('★ kur yoksa cevrilemeyen sayilir, toplama girmez', () => {
    const r = satir({ q: '1', mb: '10.0', mt: '10.0', _matPB: 'USD' });
    expect(tumuOzeti([r], R, { hedef: 'TRY', tlKuru: {} })).toMatchObject({ matToplam: 0, cevrilemeyen: 1 });
  });

  it('Icmal ozet satiri sayilmaz (cift sayim yasagi)', () => {
    const r = satir({ q: '1', mb: '10.0', mt: '10.0', _ozet: true });
    expect(tumuOzeti([r], R, TUMU('TRY')).matToplam).toBe(0);
  });
});

describe('gorunumSecenekleri / tumuGorunumu', () => {
  it('★ dovizli teklif: Karisik + uc birim; degilse bugunku uc birim', () => {
    expect(gorunumSecenekleri(true)).toEqual(['karisik', 'TRY', 'USD', 'EUR']);
    expect(gorunumSecenekleri(false)).toEqual(['TRY', 'USD', 'EUR']);
  });
  it('★★ Tumu yalniz karisik kip + dovizli + tek birim secili + kur varken', () => {
    expect(tumuGorunumu(true, true, false, 'USD', true, KUR)).toEqual({ hedef: 'USD', tlKuru: KUR });
    expect(tumuGorunumu(true, true, true, 'USD', true, KUR)).toBeNull();   // Karisik secili
    expect(tumuGorunumu(true, false, false, 'USD', true, KUR)).toBeNull(); // yalniz-₺: bugunku cevrim
    expect(tumuGorunumu(false, true, false, 'USD', true, KUR)).toBeNull(); // tl kipi
    expect(tumuGorunumu(true, true, false, 'USD', false, KUR)).toBeNull(); // kur yok
  });
});

describe('gorunumSecimi / anahtarDurumu — iki sayfanin ortak anahtari', () => {
  it('★★ dovizli teklifte birim tiklamasi Tumu X secer; Karisik geri alir', () => {
    expect(gorunumSecimi('USD', true, true)).toEqual({ karisikSecili: false, birim: 'USD' });
    expect(gorunumSecimi('karisik', true, false)).toEqual({ karisikSecili: true, birim: null });
  });
  it('★★ yalniz-₺ teklifte birim tiklamasi Karisik tercihini DEGISTIRMEZ (sonra gelen $ Karisik acilir)', () => {
    expect(gorunumSecimi('USD', false, true)).toEqual({ karisikSecili: true, birim: 'USD' });
  });
  it('★ secili: dovizli + Karisik → yalniz Karisik; dovizli + Tumu → secilen birim; yalniz-₺ → birim', () => {
    expect(anahtarDurumu('karisik', true, true, 'USD', true).secili).toBe(true);
    expect(anahtarDurumu('USD', true, true, 'USD', true).secili).toBe(false);
    expect(anahtarDurumu('USD', true, false, 'USD', true).secili).toBe(true);
    expect(anahtarDurumu('USD', false, true, 'USD', true).secili).toBe(true);
  });
  it('★★ kur yokken dovizli teklifte TL de KAPALI ($ tarafin TL\'si kur ister); yalniz-₺\'de TL acik', () => {
    expect(anahtarDurumu('TRY', true, true, 'TRY', false).kapali).toBe(true);
    expect(anahtarDurumu('TRY', false, true, 'TRY', false).kapali).toBe(false);
    expect(anahtarDurumu('USD', false, true, 'TRY', false).kapali).toBe(true);
    expect(anahtarDurumu('karisik', true, true, 'TRY', false).kapali).toBe(false);
  });
});
