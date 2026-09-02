import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GRUP_UZUNLUKLARI,
  HANE_SAYISI,
  bicimle,
  e164,
  haneleriAl,
  tamMi,
  telefonHatasi,
} from './telefon-bicim';
import { govdeyeCevir, eksikAlanlar, type FaturaKimligi } from './fatura-kimligi';

/**
 * Telefon maskesi — `+90 (5xx) (xxx) (xx) (xx)` (02.09 kullanici karari).
 *
 * ⚠ EN KRITIK BLOK "BOS ALAN DOLU GORUNMESIN": maske daima `+90 ` ile
 * basladigi icin, durumda MASKELI METIN tutulsaydi bos bir telefon alani
 * dolu gorunur ve `eksikAlanlar` (bos-dize kontrolu) onu EKSIK SAYMAZDI —
 * zorunlu alan kapisi sessizce delinirdi. Durumda YALNIZ HANELER tutulur.
 */

describe('haneleriAl', () => {
  it('her yazim bicimi AYNI haneye iner', () => {
    for (const giris of [
      '0533 098 36 63',
      '+90 533 098 36 63',
      '905330983663',
      '5330983663',
      '(0533) 098-36-63',
      '0090 533 098 36 63',
    ]) {
      expect(haneleriAl(giris)).toBe('5330983663');
    }
  });

  it('bos/anlamsiz girdide bos doner', () => {
    expect(haneleriAl('')).toBe('');
    expect(haneleriAl('abc')).toBe('');
  });

  it('fazla haneyi KIRPAR (10 haneden uzun olamaz)', () => {
    expect(haneleriAl('05330983663999')).toHaveLength(HANE_SAYISI);
  });
});

describe('bicimle', () => {
  it('bos girdide sadece ulke kodu gosterir', () => {
    expect(bicimle('')).toBe('+90 ');
  });

  it('⭐ tam numarayi istenen bicimde yazar', () => {
    expect(bicimle('5330983663')).toBe('+90 (533) (098) (36) (63)');
  });

  it('yazarken KISMI gosterim uretir (grup tamamlaninca kapanir)', () => {
    expect(bicimle('5')).toBe('+90 (5');
    expect(bicimle('533')).toBe('+90 (533)');
    expect(bicimle('533098')).toBe('+90 (533) (098)');
    expect(bicimle('53309836')).toBe('+90 (533) (098) (36)');
  });

  it('yerel yazim girilse de ayni maskeye oturur', () => {
    expect(bicimle('05330983663')).toBe(bicimle('5330983663'));
  });

  it('OLCUT: grup uzunluklari toplami hane sayisina esit', () => {
    expect(GRUP_UZUNLUKLARI.reduce((a, b) => a + b, 0)).toBe(HANE_SAYISI);
  });
});

describe('e164 · tamMi · telefonHatasi', () => {
  it('tam numara E.164 doner', () => {
    expect(e164('0533 098 36 63')).toBe('+905330983663');
    expect(tamMi('0533 098 36 63')).toBe(true);
  });

  it('⭐ YARIM numara GONDERILMEZ (bos dize doner)', () => {
    expect(e164('533098')).toBe('');
    expect(tamMi('533098')).toBe(false);
  });

  it('bos alanda hata YOK — onu `eksikAlanlar` bildirir (cift uyari olmasin)', () => {
    expect(telefonHatasi('')).toBeNull();
  });

  it('yarim numarada hane sayisi hatasi verir', () => {
    expect(telefonHatasi('533098')).toContain('10 haneli');
  });

  it('5 ile baslamayan numarada uyarir', () => {
    expect(telefonHatasi('2120983663')).toContain('5 ile baslamali');
  });

  it('tam ve gecerli numarada hata YOK', () => {
    expect(telefonHatasi('5330983663')).toBeNull();
  });
});

describe('⭐ ZORUNLU ALAN KAPISI maske yuzunden DELINMEZ', () => {
  const TAM: FaturaKimligi = {
    ad: 'Ayse',
    soyad: 'Yilmaz',
    eposta: 'a@b.co',
    telefon: '5330983663',
    kimlikNo: '11111111111',
    sehir: 'Istanbul',
    adres: 'Test',
  };

  it('telefon BOSken alan EKSIK sayilir (durumda haneler tutuldugu icin)', () => {
    expect(eksikAlanlar({ ...TAM, telefon: '' })).toContain('Telefon');
  });

  it('⭐ maskeli metin durumda tutulsaydi kapi delinirdi — bunu gosterir', () => {
    // `bicimle('')` bos alanin EKRAN halidir: "+90 ". Bos-dize kontrolu
    // bunu DOLU sayar. Durumda bu metin tutulmadigi icin sorun yok.
    expect(bicimle('')).not.toBe('');
    expect(eksikAlanlar({ ...TAM, telefon: bicimle('') })).not.toContain('Telefon');
  });

  it('govdeyeCevir haneleri E.164e cevirir', () => {
    expect(govdeyeCevir(TAM).telefon).toBe('+905330983663');
  });
});

describe('⭐ SAYFA BAGLANTISI — maske gercekten kullaniliyor mu', () => {
  const sayfa = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'abonelik', 'page.tsx'),
    'utf8',
  );

  it('OLCUT: sayfa okunabildi', () => {
    expect(sayfa.length).toBeGreaterThan(0);
  });

  it('⭐ telefon alani MASKELI deger gosteriyor', () => {
    expect(sayfa).toContain('telefonBicimle(fatura.telefon)');
  });

  it('⭐ durumda HANELER tutuluyor (maskeli metin DEGIL)', () => {
    expect(sayfa).toContain('telefonHaneleri(e.target.value)');
  });

  it('gonderim oncesi telefon dogrulamasi var', () => {
    expect(sayfa).toContain('telefonHatasi(fatura.telefon)');
  });
});
