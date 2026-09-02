import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALAN_ETIKET,
  ZORUNLU_ALANLAR,
  bosFaturaKimligi,
  eksikAlanlar,
  gonderilebilir,
  govdeyeCevir,
  type FaturaKimligi,
} from './fatura-kimligi';

/**
 * ADIM 2 — fatura kimligi (satin alma yolunun ON YUZ yarisi).
 *
 * ⚠ EN KRITIK BLOK "SAYFA GOVDESI": 02.09'da olculdu ki abonelik sayfasi
 * `/abonelik/basla` ucuna YALNIZ `paketSurumuId` gonderiyordu; sunucu ise
 * `p.musteri.ad` diye aciyordu → TypeError → 500 → ekranda "Odeme
 * baslatilamadi". HICBIR musteri odeme yapamiyordu ve hicbir test bunu
 * yakalamiyordu, cunku hicbiri CAGRININ GOVDESINI olcmuyordu.
 *
 * Ikizi sunucuda: `backend/test/satinalma-yolu-test.ts`.
 */

const TAM: FaturaKimligi = {
  ad: 'Ayse',
  soyad: 'Yilmaz',
  eposta: 'ayse@ornek.com',
  telefon: '+905301234567',
  kimlikNo: '11111111111',
  sehir: 'Istanbul',
  adres: 'Ornek Mah. 1. Sok. No 2',
};

describe('eksikAlanlar', () => {
  it('bos formda TUM zorunlu alanlari eksik sayar', () => {
    expect(eksikAlanlar(bosFaturaKimligi())).toHaveLength(ZORUNLU_ALANLAR.length);
  });

  it('tam formda eksik yoktur', () => {
    expect(eksikAlanlar(TAM)).toEqual([]);
    expect(gonderilebilir(TAM)).toBe(true);
  });

  it('govde hic yoksa da patlamaz, TUM alanlari eksik sayar', () => {
    expect(eksikAlanlar(null)).toHaveLength(ZORUNLU_ALANLAR.length);
    expect(eksikAlanlar(undefined)).toHaveLength(ZORUNLU_ALANLAR.length);
  });

  it('⭐ bosluk-only deger EKSIK sayilir (iyzico reddeder)', () => {
    expect(eksikAlanlar({ ...TAM, telefon: '   ' })).toEqual([ALAN_ETIKET.telefon]);
    expect(gonderilebilir({ ...TAM, sehir: '\t' })).toBe(false);
  });

  it('eksik alanin ETIKETINI doner (kullanici hangi kutuyu dolduracagini bilir)', () => {
    expect(eksikAlanlar({ ...TAM, kimlikNo: '' })).toEqual([ALAN_ETIKET.kimlikNo]);
  });

  it('postaKodu ZORUNLU DEGILDIR', () => {
    const { postaKodu, ...postaKodusuz } = { ...TAM, postaKodu: '' };
    expect(gonderilebilir(postaKodusuz)).toBe(true);
  });
});

describe('govdeyeCevir', () => {
  it('bastaki/sondaki bosluklari kirpar', () => {
    const g = govdeyeCevir({ ...TAM, ad: '  Ayse  ', sehir: ' Istanbul ' });
    expect(g.ad).toBe('Ayse');
    expect(g.sehir).toBe('Istanbul');
  });

  it('⭐ postaKodu bossa govdeye HIC konmaz (bos dize gonderilmez)', () => {
    const g = govdeyeCevir({ ...TAM, postaKodu: '   ' });
    expect('postaKodu' in g).toBe(false);
  });

  it('postaKodu doluysa kirpilarak konur', () => {
    const g = govdeyeCevir({ ...TAM, postaKodu: ' 34000 ' });
    expect(g.postaKodu).toBe('34000');
  });

  it('tum zorunlu alanlar govdede bulunur', () => {
    const g = govdeyeCevir(TAM) as Record<string, unknown>;
    for (const alan of ZORUNLU_ALANLAR) expect(g[alan]).toBeTruthy();
  });
});

describe('⭐ SAYFA GOVDESI — /abonelik/basla cagrisi', () => {
  const sayfa = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'abonelik', 'page.tsx'),
    'utf8',
  );

  it('OLCUT: sayfa okunabildi ve `/abonelik/basla` cagrisi iceriyor', () => {
    expect(sayfa.length).toBeGreaterThan(0);
    expect(sayfa).toContain('/abonelik/basla');
  });

  it('⭐ cagri govdesi `musteri` alanini TASIR (regresyonun bekcisi)', () => {
    // `api.post<...>('/abonelik/basla', { ... })` cagrisinin govde nesnesini
    // ayikla. Substring aramasi degil: govde BLOGUNU bulup icinde ariyoruz,
    // boylece dosyanin baska yerindeki "musteri" kelimesi yanlis yesil vermez.
    const i = sayfa.indexOf("'/abonelik/basla'");
    expect(i).toBeGreaterThan(-1);
    const acilis = sayfa.indexOf('{', i);
    expect(acilis).toBeGreaterThan(-1);

    let derinlik = 0;
    let kapanis = -1;
    for (let k = acilis; k < sayfa.length; k++) {
      if (sayfa[k] === '{') derinlik++;
      else if (sayfa[k] === '}') {
        derinlik--;
        if (derinlik === 0) {
          kapanis = k;
          break;
        }
      }
    }
    expect(kapanis).toBeGreaterThan(acilis);

    const govde = sayfa.slice(acilis, kapanis + 1);
    expect(govde).toContain('paketSurumuId');
    expect(govde).toContain('musteri');
  });

  it('⭐ govde `govdeyeCevir` ile uretilir (ham state gonderilmez)', () => {
    // Ham state gonderilirse kirpilmamis degerler ve bos `postaKodu`
    // iyzico'ya gider; bu, hatayi kullanicinin duzeltemeyecegi yere tasir.
    expect(sayfa).toContain('govdeyeCevir(fatura)');
  });
});
