/**
 * Birim bayatligi (birim-bayatlik.ts): hangi layer yeni birimle yeniden
 * ayrilmali, hangisi yerelde olceklenebilir. Yanlis "bayat" = gereksiz motor
 * istegi ve onayin dusmesi; yanlis "guncel" = eski birimle metraj teklife gider.
 */
import { describe, expect, it } from 'vitest';
import {
  ayniOlcek,
  birimBayatMi,
  yarimKalanAyirma,
  yenidenAyirmaSirasi,
  yerelOlceklenebilir,
  type KesilenAyirma,
} from './birim-bayatlik';

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

// ── Birim AYIRMA SURERKEN degisti (25.09 canli hata + inceleme) ─────────────

describe('yarimKalanAyirma — Kaydet aninda suren is ilk ayirma mi', () => {
  it('henuz hesaplanmamis layer ayriliyorsa yeni birimle yeniden baslatilmak uzere doner', () => {
    expect(yarimKalanAyirma('X', { A: 1 }, 'none')).toEqual({ layer: 'X', splitMode: 'none' });
  });

  it('suren is YENIDEN ayirmaysa (layer hesapli) null — bayat listesiyle gelir', () => {
    expect(yarimKalanAyirma('A', { A: 1 }, 't')).toBeNull();
  });

  it('motor bossa null', () => {
    expect(yarimKalanAyirma(null, { A: 1 }, 't')).toBeNull();
  });
});

describe('yenidenAyirmaSirasi', () => {
  const X: KesilenAyirma = { layer: 'X', splitMode: 't' };

  it('yarida kalan ilk ayirma EN BASTA', () => {
    expect(yenidenAyirmaSirasi(['A', 'B'], null, X)).toEqual(['X', 'A', 'B']);
  });

  it('secili bayat layer digerlerinden once (ekrandaki sayilar once kesinlesir)', () => {
    expect(yenidenAyirmaSirasi(['A', 'B', 'C'], 'C', null)).toEqual(['C', 'A', 'B']);
  });

  it('kesilen, secili ve digerleri — bu sirayla', () => {
    expect(yenidenAyirmaSirasi(['A', 'B', 'C'], 'B', X)).toEqual(['X', 'B', 'A', 'C']);
  });

  it('secili layer bayat degilse listeye EKLENMEZ', () => {
    expect(yenidenAyirmaSirasi(['A'], 'Z', null)).toEqual(['A']);
  });

  it('kesilen bayat listesinde de varsa (sonucu Kaydet\'ten hemen once geldi) BIR kez', () => {
    expect(yenidenAyirmaSirasi(['A', 'X'], 'X', X)).toEqual(['X', 'A']);
  });

  it('bos liste + kesilen yok: bos (oturum acilmaz)', () => {
    expect(yenidenAyirmaSirasi([], 'A', null)).toEqual([]);
  });

  // INCELEME BULGUSU: X ilk kez ayrilirken dm → cm; oturum A'yi ayirirken cm → mm.
  // Ikinci Kaydet aninda suren is A (hesapli) → yarimKalanAyirma null; X ancak
  // listede A'dan ONCE ise ya bitmis (bayat) ya suruyor (yine yakalanir) olur.
  it('ikinci birim degisiminde yarida kalan ilk ayirma KAYBOLMAZ (X ilk sirada)', () => {
    const oturum1 = yenidenAyirmaSirasi(['A', 'B'], 'X', X);
    // Ikinci Kaydet oturum1'in ILK isi surerken gelir: suren is X'tir.
    const suren = oturum1[0];
    expect(yarimKalanAyirma(suren, { A: 1, B: 1 }, 't')).toEqual(X);
  });

  it('ESKI davranis (sona ekleme) X\'i ikinci degisimde dusuruyordu (kriteri ihlal eder)', () => {
    const eskiOturum1 = ['A', 'B', 'X'];
    const suren = eskiOturum1[0];
    const kesilen2 = yarimKalanAyirma(suren, { A: 1, B: 1 }, 't');
    const oturum2 = yenidenAyirmaSirasi(['A', 'B'], 'X', kesilen2);
    expect(oturum2.includes('X')).toBe(false);
  });
});
