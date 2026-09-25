/**
 * Birim bayatligi (birim-bayatlik.ts): hangi layer yeni birimle yeniden
 * ayrilmali, hangisi yerelde olceklenebilir. Yanlis "bayat" = gereksiz motor
 * istegi ve onayin dusmesi; yanlis "guncel" = eski birimle metraj teklife gider.
 */
import { describe, expect, it } from 'vitest';
import { ayniOlcek, birimBayatMi, yerelOlceklenebilir } from './birim-bayatlik';

describe('ayniOlcek — goreli tolerans', () => {
  it('kayan nokta gurultusu ayni olcektir (0,1 × (1 + 1e-9))', () => {
    expect(ayniOlcek(0.1, 0.1 * (1 + 1e-9))).toBe(true);
  });

  it('hesaplanmis carpan ayni olcektir (1/1000 = 0,001)', () => {
    expect(ayniOlcek(1 / 1000, 0.001)).toBe(true);
  });

  it('gercekten farkli olcek farklidir (dm ≠ cm)', () => {
    expect(ayniOlcek(0.1, 0.01)).toBe(false);
  });

  it('gecersiz olcek hicbir seyle ayni degildir', () => {
    expect([ayniOlcek(0, 0), ayniOlcek(Number.NaN, 0.1), ayniOlcek(0.1, -0.1)]).toEqual([false, false, false]);
  });
});

describe('birimBayatMi', () => {
  it('baska birimle ayrilan layer bayattir', () => {
    expect(birimBayatMi({ scaleUsed: 0.1 }, 0.01)).toBe(true);
  });

  it('ayni birim (kayan nokta gurultusuyle) bayat DEGILDIR', () => {
    expect(birimBayatMi({ scaleUsed: 0.1 * (1 + 1e-9) }, 0.1)).toBe(false);
  });

  it('birimi bilinmeyen eski kayit bayat SAYILMAZ (yukleme ona kayit birimini yazar)', () => {
    expect(birimBayatMi({}, 0.01)).toBe(false);
  });
});

describe('yerelOlceklenebilir — yalniz "Bölmeden" layer', () => {
  it('bolmeden layer motora gitmeden olceklenir', () => {
    expect(yerelOlceklenebilir({ splitMode: 'none' })).toBe(true);
  });

  it('T noktalarinda bolunen layer motora gider (parca sinirlari birime bagli)', () => {
    expect(yerelOlceklenebilir({ splitMode: 't' })).toBe(false);
  });

  it('yontemi kayitsiz eski kayit T sayilir (varsayilan) — yerelde olceklenmez', () => {
    expect(yerelOlceklenebilir({})).toBe(false);
  });
});
