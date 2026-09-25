/**
 * Cizim birimi tablosu (birimler.ts) — pencere, baslik dugmesi ve bildirim
 * ayni tablodan okur. Yanlis birim adi = yanlis metraj kanisi.
 */
import { describe, expect, it } from 'vitest';
import { BIRIMLER, birimBul, birimKisa, guvenAciklamasi, guvenilirMi } from './birimler';

describe('birim tablosu', () => {
  it('alti birim, metre carpaniyla', () => {
    expect(BIRIMLER.map((b) => [b.kisa, b.scale])).toEqual([
      ['mm', 0.001], ['cm', 0.01], ['dm', 0.1], ['m', 1], ['inç', 0.0254], ['fit', 0.3048],
    ]);
  });

  it('karsilik metni carpanla tutarli (dm = 10 cm)', () => {
    expect(birimBul(0.1)?.karsilik).toBe('10 cm');
  });
});

describe('birimBul — goreli tolerans', () => {
  it('kayan nokta gurultusu ayni birimdir (0.1 × 1,0000001)', () => {
    expect(birimBul(0.1 * 1.0000001)?.kisa).toBe('dm');
  });

  it('hesaplanmis carpan eslesir (1/1000 = mm)', () => {
    expect(birimBul(1 / 1000)?.kisa).toBe('mm');
  });

  it('tabloda olmayan carpan null (yanlis birime yuvarlanmaz)', () => {
    expect(birimBul(0.5)).toBeNull();
  });

  it('yakin ama farkli carpan eslesmez (0.0254 ≠ 0.025)', () => {
    expect(birimBul(0.025)).toBeNull();
  });
});

describe('birimKisa', () => {
  it('tablodaki birim kisa adiyla', () => {
    expect(birimKisa(0.3048)).toBe('fit');
  });

  it('tabloda yoksa carpanin kendisi — uydurma birim adi yok', () => {
    expect(birimKisa(0.5)).toBe('×0.5');
  });
});

describe('tespit guveni', () => {
  it('kesin ve yuksek guvenilir (yesil)', () => {
    expect([guvenilirMi('kesin'), guvenilirMi('yuksek')]).toEqual([true, true]);
  });

  it('orta, dusuk, yok ve bilinmeyen guvenilir DEGIL (turuncu, dogrulama ister)', () => {
    expect(['orta', 'dusuk', 'yok', null, undefined].map(guvenilirMi)).toEqual([false, false, false, false, false]);
  });

  it('zayif tespitin aciklamasi kullaniciyi dogrulamaya cagirir', () => {
    expect(['orta', 'dusuk', 'yok'].every((g) => guvenAciklamasi(g).includes('doğrulayın'))).toBe(true);
  });

  it('guvenilir tespitin aciklamasi dogrulama istemez', () => {
    expect(['kesin', 'yuksek'].some((g) => guvenAciklamasi(g).includes('doğrulayın'))).toBe(false);
  });
});
