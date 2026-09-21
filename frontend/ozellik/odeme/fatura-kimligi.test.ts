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
  kimlikTuru,
  vergiDairesiGerekli,
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
    const g = govdeyeCevir(TAM) as unknown as Record<string, unknown>;
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

/* ═══════════════════════════════════════════════════════════════════════
   T47 (22.09.2026) — SAHIS mi TUZEL mi · KOSULLU VERGI DAIRESI
   ═══════════════════════════════════════════════════════════════════════

   ⚠ NEDEN DAVRANIS TESTI: sunucu tarafindaki ikiz paket
   (`backend/test/fatura-kimligi-kapisi-test.ts`) bu dosyanin KAYNAGINI
   okuyup desen ariyor. Mutasyon turunda M11 (`if (vd)` → `if (false)`)
   SAGKALDI: atama satiri yerinde duruyordu, sadece hic kosmuyordu. Kaynak
   kapisi kosulu olcmuyorsa yesildir ama kanit degildir — asil kanit burada,
   fonksiyonun KENDISI cagrilarak alinir.
   ═══════════════════════════════════════════════════════════════════════ */
describe('T47 · kimlikTuru (SAF)', () => {
  it('11 hane sahis (TCKN), 10 hane tuzel (VKN)', () => {
    expect(kimlikTuru('12345678901')).toBe('tckn');
    expect(kimlikTuru('1234567890')).toBe('vkn');
  });

  it('bicim atilir — "123 456 789 01" da TCKN', () => {
    expect(kimlikTuru('123 456 789 01')).toBe('tckn');
    expect(kimlikTuru('123-456-7890')).toBe('vkn');
  });

  it('diger uzunluklar ve bos deger bilinmiyor', () => {
    expect(kimlikTuru('123456789')).toBe('bilinmiyor');
    expect(kimlikTuru('123456789012')).toBe('bilinmiyor');
    expect(kimlikTuru('')).toBe('bilinmiyor');
    expect(kimlikTuru(null)).toBe('bilinmiyor');
  });

  it('⭐ sunucudaki ikizle AYNI esikler (11/10) — kaynak karsilastirmasi', () => {
    const sunucu = readFileSync(
      join(process.cwd(), '..', 'backend', 'src', 'ozellik', 'odeme', 'abonelik', 'satinalma.servisi.ts'),
      'utf-8',
    );
    expect(sunucu).toContain("if (haneler.length === 11) return 'tckn';");
    expect(sunucu).toContain("if (haneler.length === 10) return 'vkn';");
  });
});

describe('T47 · vergiDairesiGerekli (SAF)', () => {
  it('⭐ SAHIS (TCKN) icin SORULMAZ — surtunme eklemiyoruz', () => {
    expect(vergiDairesiGerekli({ kimlikNo: '12345678901' })).toBe(false);
  });

  it('⭐ LIMITED (VKN) icin SORULUR — VUK md. 230', () => {
    expect(vergiDairesiGerekli({ kimlikNo: '1234567890' })).toBe(true);
  });

  it('⭐ turu bilinmeyen numara da ISTER (gecerli SAHIS kimligi yok)', () => {
    expect(vergiDairesiGerekli({ kimlikNo: '12345' })).toBe(true);
  });

  it('kimlik no HIC girilmemisse FALSE (o hal zorunlu-alan kapisinin isi)', () => {
    expect(vergiDairesiGerekli({ kimlikNo: '' })).toBe(false);
    expect(vergiDairesiGerekli(undefined)).toBe(false);
  });
});

describe('T47 · eksikAlanlar kosullu vergi dairesi', () => {
  const LIMITED: FaturaKimligi = { ...TAM, kimlikNo: '1234567890' };

  it('⭐ LIMITED + vergi dairesi BOS → eksik listede "Vergi dairesi" var', () => {
    expect(eksikAlanlar(LIMITED)).toContain(ALAN_ETIKET.vergiDairesi);
    expect(gonderilebilir(LIMITED)).toBe(false);
  });

  it('⭐ LIMITED + vergi dairesi DOLU → gonderilebilir', () => {
    const dolu = { ...LIMITED, vergiDairesi: 'Kucukyali' };
    expect(eksikAlanlar(dolu)).toEqual([]);
    expect(gonderilebilir(dolu)).toBe(true);
  });

  it('⭐ SAHIS vergi dairesi OLMADAN gonderilebilir (yol kapanmiyor)', () => {
    expect(eksikAlanlar(TAM)).toEqual([]);
    expect(gonderilebilir(TAM)).toBe(true);
  });

  it('bosluk-only vergi dairesi EKSIK sayilir', () => {
    expect(eksikAlanlar({ ...LIMITED, vergiDairesi: '   ' })).toContain(
      ALAN_ETIKET.vergiDairesi,
    );
  });

  it('⭐ P7 sozlesmesi bozulmadi: `ZORUNLU_ALANLAR` hala 7 iyzico alani', () => {
    expect(ZORUNLU_ALANLAR).toHaveLength(7);
    expect(ZORUNLU_ALANLAR as readonly string[]).not.toContain('vergiDairesi');
  });
});

describe('T47 · govdeyeCevir vergi dairesini TASIR', () => {
  it('⭐⭐ dolu vergi dairesi govdede — yoksa sunucu HIC gormez', () => {
    const govde = govdeyeCevir({ ...TAM, kimlikNo: '1234567890', vergiDairesi: 'Kucukyali' });
    expect(govde.vergiDairesi).toBe('Kucukyali');
  });

  it('kirpilir', () => {
    const govde = govdeyeCevir({ ...TAM, kimlikNo: '1234567890', vergiDairesi: '  Kucukyali  ' });
    expect(govde.vergiDairesi).toBe('Kucukyali');
  });

  it('⭐ bos/bosluk-only GONDERILMEZ (`postaKodu` ile ayni kural) — bos dize ' +
    'sunucuda "verildi ama bos" gorunup kayitli dairesi ezerdi', () => {
    expect('vergiDairesi' in govdeyeCevir({ ...TAM, vergiDairesi: '' })).toBe(false);
    expect('vergiDairesi' in govdeyeCevir({ ...TAM, vergiDairesi: '   ' })).toBe(false);
  });

  it('⭐ SAHIS govdesinde alan HIC yok', () => {
    expect('vergiDairesi' in govdeyeCevir(TAM)).toBe(false);
  });
});
