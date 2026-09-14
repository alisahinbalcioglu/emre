/**
 * A2 — BELİRSİZ SAYI SÜZGECİ: KURALIN KENDİSİ (tur 3, 14.09.2026, Emre onaylı)
 *
 * İŞ EMRİ: hayalet sayı `sayiOku('35x240mm Üç bölmeli döşeme kanalı') = 35` →
 * hiçbir yere fiyat yazılmaz. `1.250` (virgül yok, tek nokta, noktadan sonra tam
 * 3 hane) belirsizdir: yazılmaz, kullanıcı uyarılır, her yolda AYNI sınıf.
 *
 * Bu dosya KURALI kilitler (19 girdi × iki sınır, gerçek Bursa metinleri, K1-K4
 * varsayılanları). Yolların bu kuralı ÇAĞIRDIĞI `sayi-yollari.test.ts`te ölçülür.
 *
 * ⚠ İKİ SINIR KARIŞTIRILAMAZ: makine okuyucusu (`sayiOku`) insan kuralını
 * UYGULAMAZ — "323308.125" Bursa Mekanik'in Excel SAYI hücresidir; insan
 * kuralı ona konursa genel toplam 4.049.180,31 TL düşer (ölçüldü, tur3/a2).
 *
 * Test adları `SK-<parça>` önekiyle başlar: mutasyon koşucusu mutantın BEKLENEN
 * kontrolle öldüğünü bu öneklerden doğrular.
 */
import { describe, expect, it } from 'vitest';
import {
  formSayisiOku, hucreGirdisiCoz, insanSayiOku, K1_UZUN_TAM_KISIM_BELIRSIZ, kayitliSayiUyarisi,
  makineMetni, MIKTAR_BIRIMLERI, sayiOku, sayiUyarisi, type SayiAlanTuru, type SayiGirdisi,
} from './sayi-alani';

const kisa = (r: SayiGirdisi): string | number =>
  r.tur === 'sayi' ? r.deger : r.tur === 'belirsiz' ? 'BELIRSIZ' : r.tur === 'bos' ? 'BOS' : `DEGIL:${r.sebep}`;

// RAPOR §3 matrisinin 19 girdisi — beklenen: [insan (fiyat alanı), makine].
const MATRIS: Array<[unknown, string | number, number | null]> = [
  ['35x240mm Üç bölmeli döşeme kanalı', 'DEGIL:olcu-metin', null],
  ['Ø100 PVC boru', 'DEGIL:olcu-metin', null],
  ['DN50', 'DEGIL:olcu-metin', null],
  ['24 kW', 'DEGIL:olcu-metin', null],
  ['3 adet', 'DEGIL:olcu-metin', null],
  ['1.250', 'BELIRSIZ', 1.25],
  ['10.075', 'BELIRSIZ', 10.075],
  ['1.25', 1.25, 1.25],
  ['1.234,5', 1234.5, 1234.5],
  ['6.500,00', 6500, 6500],
  ['₺1.250,00', 1250, 1250],
  ['12,5', 12.5, 12.5],
  ['12.5', 12.5, 12.5],
  ['-5', -5, -5],
  ['', 'BOS', null],
  ['0', 0, 0],
  ['abc', 'DEGIL:olcu-metin', null],
  [1.25, 1.25, 1.25],
  [1250, 1250, 1250],
];

describe('SK-MATRIS: 19 girdi × insan / makine sınırı', () => {
  for (const [girdi, insan, makine] of MATRIS) {
    it(`SK-MATRIS ${JSON.stringify(girdi)} → insan ${insan} · makine ${makine}`, () => {
      expect(kisa(insanSayiOku(girdi, 'fiyat'))).toBe(insan);
      expect(sayiOku(girdi)).toBe(makine);
    });
  }
});

// Bursa SAHA-BIR Elektrik `_matBirim` sütunundaki GERÇEK hücre metinleri
// (tur3/a2/hayalet-uctan.out.md) — bugün 39 hücrede ₺550,00 / ₺35,00 / ₺2,00.
const BURSA_HAYALET = [
  '550 kVA Stand-By Jeneratör (Min. 8 saat kapas',
  '20 kVA - 380/380V UPS, 10 dk. süreli, bakımsı',
  '3x100A e kadar ATS Pano Dahil',
  '16A e kadar Monofaze Sıva Üstü Kutulu IP54 Pa',
  '25A e kadar Monofaze Sıva Üstü Kutulu IP65, S',
  '2x1,5 mm²',
  '2x1,5 mm² ',
  '3x2,5 mm² RENK-STANDART',
  '1x4 mm²',
  '35x240mm Üç bölmeli döşeme kanalı',
  '500x500x500mm Beton Rögar',
  ': +90 000 000 00 00',
];

describe('SK-HARF: ölçü/harf içeren metin HİÇBİR alanda sayı değil', () => {
  for (const metin of BURSA_HAYALET) {
    it(`SK-HARF "${metin}"`, () => {
      for (const alan of ['miktar', 'fiyat', 'kar', 'iskonto'] as SayiAlanTuru[]) {
        expect(insanSayiOku(metin, alan).tur, alan).toBe('sayi-degil');
      }
      expect(sayiOku(metin), 'makine').toBeNull();
    });
  }
  it('SK-HARF makine: onaltılık / üstel / sonsuz yazım sayı değil', () => {
    for (const g of ['0x10', '1e3', 'Infinity', '12 5', '1 250']) expect(sayiOku(g), g).toBeNull();
  });
  it('SK-HARF insan: iç boşluk birleştirilmez (telefon, "1 250")', () => {
    expect(insanSayiOku('1 250', 'fiyat').tur).toBe('sayi-degil');
    expect(insanSayiOku('0505 885 15 64', 'miktar').tur).toBe('sayi-degil');
  });
});

describe('SK-UCHANE: tek nokta + tam 3 hane BELİRSİZ (yalnız insan sınırı)', () => {
  it('SK-UCHANE belirsiz: "1.250", "10.075", "₺1.250", "-1.250"', () => {
    const r = insanSayiOku('1.250', 'fiyat');
    expect(r).toEqual({ tur: 'belirsiz', ham: '1.250', binlik: 1250, ondalik: 1.25 });
    expect(insanSayiOku('10.075', 'miktar')).toMatchObject({ tur: 'belirsiz', binlik: 10075, ondalik: 10.075 });
    expect(insanSayiOku('₺1.250', 'fiyat').tur).toBe('belirsiz');
    expect(insanSayiOku('-1.250', 'fiyat').tur).toBe('belirsiz');
    expect(insanSayiOku('%12.125', 'kar').tur).toBe('belirsiz');
  });
  it('SK-UCHANE tek anlamlı: 1-2 ya da 4+ ondalık, ".250" ondalık', () => {
    expect(kisa(insanSayiOku('12.5', 'fiyat'))).toBe(12.5);
    expect(kisa(insanSayiOku('12.25', 'fiyat'))).toBe(12.25);
    expect(kisa(insanSayiOku('12.2500', 'fiyat'))).toBe(12.25);
    expect(kisa(insanSayiOku('.250', 'fiyat'))).toBe(0.25);
  });
  it('SK-K1 varsayılan: "25430.000" (tam kısmı 4+ hane) BELİRSİZ', () => {
    expect(K1_UZUN_TAM_KISIM_BELIRSIZ).toBe(true);
    expect(insanSayiOku('25430.000', 'fiyat').tur).toBe('belirsiz');
  });
  it('SK-MAKINE: aynı desen makine okuyucusunda ONDALIK (Bursa Mekanik "323308.125")', () => {
    expect(sayiOku('323308.125')).toBe(323308.125);
    expect(sayiOku('10.075')).toBe(10.075);
    expect(sayiOku('1.015')).toBe(1.015);
    expect(sayiOku('25430.000')).toBe(25430);
  });
});

describe('SK-VIRGUL: ayırıcı kuralları', () => {
  it('SK-VIRGUL virgül + nokta: son ayırıcı ondalık', () => {
    expect(kisa(insanSayiOku('1.234,5', 'fiyat'))).toBe(1234.5);
    expect(kisa(insanSayiOku('1,234.5', 'fiyat'))).toBe(1234.5);
    expect(kisa(insanSayiOku('386.200,00', 'fiyat'))).toBe(386200);
  });
  it('SK-VIRGUL birden çok virgül EN binlik, birden çok nokta binlik', () => {
    expect(kisa(insanSayiOku('1,234,567', 'fiyat'))).toBe(1234567);
    expect(kisa(insanSayiOku('1.234.567', 'fiyat'))).toBe(1234567);
  });
  it('SK-VIRGUL tek virgül ondalık (3 hane dahil — virgül belirsiz DEĞİL)', () => {
    expect(kisa(insanSayiOku('12,5', 'fiyat'))).toBe(12.5);
    expect(kisa(insanSayiOku('10,075', 'miktar'))).toBe(10.075);
  });
  it('SK-VIRGUL makine: "1,234,567" tahmin edilmez (sistem bu biçimi yazmaz)', () => {
    expect(sayiOku('1,234,567')).toBeNull();
    expect(sayiOku('1.234.567')).toBe(1234567);
    expect(sayiOku('1.234,5')).toBe(1234.5);
  });
});

describe('SK-SUS: alanın izinli süsü (fiyat ₺/TL · yüzde % · döviz reddi)', () => {
  it('SK-SUS fiyat: ₺ ve baştaki/sondaki TL/TRY atılır', () => {
    expect(kisa(insanSayiOku('₺1.250,00', 'fiyat'))).toBe(1250);
    expect(kisa(insanSayiOku('  2.500,00 TL ', 'fiyat'))).toBe(2500);
    expect(kisa(insanSayiOku('2.500,00TL', 'fiyat'))).toBe(2500);
    expect(kisa(insanSayiOku('TL 2.500,00', 'fiyat'))).toBe(2500);
    expect(kisa(insanSayiOku('₺ 1.234,56', 'fiyat'))).toBe(1234.56);
  });
  it('SK-SUS döviz: $ ve € her alanda SAYI DEĞİL (sebep doviz)', () => {
    for (const alan of ['miktar', 'fiyat', 'kar', 'iskonto'] as SayiAlanTuru[]) {
      expect(insanSayiOku('$1.500,00', alan)).toEqual({ tur: 'sayi-degil', ham: '$1.500,00', sebep: 'doviz' });
      expect(insanSayiOku('12 €', alan).tur).toBe('sayi-degil');
    }
  });
  it('SK-SUS yüzde: % başta/sonda/boşluklu yalnız kâr ve iskontoda', () => {
    for (const [g, n] of [['%30', 30], ['30%', 30], [' %15 ', 15], ['% 15', 15], ['%12,5', 12.5]] as const) {
      expect(kisa(insanSayiOku(g, 'kar')), g).toBe(n);
      expect(kisa(insanSayiOku(g, 'iskonto')), g).toBe(n);
    }
    expect(insanSayiOku('%30', 'fiyat').tur).toBe('sayi-degil');
    expect(insanSayiOku('₺30', 'kar').tur).toBe('sayi-degil');
  });
});

describe('SK-BIRIM: K2 — miktar alanında birim kelimesi', () => {
  it('SK-BIRIM listedeki birim sayıyı bozmaz ("12 m", "3 adet", "12,5 mt.", "5 TAKIM", "2 LITRE")', () => {
    for (const [g, n] of [['12 m', 12], ['3 adet', 3], ['12,5 mt.', 12.5], ['100m', 100], ['5 TAKIM', 5],
      ['2 LITRE', 2], ['4 m²', 4], ['7 ad.', 7], ['1.234,5 kg', 1234.5], ['3 grup', 3]] as const) {
      expect(kisa(insanSayiOku(g, 'miktar')), g).toBe(n);
    }
  });
  it('SK-BIRIM liste dışı ek ölçü metnidir: "24 kW", "550 kVA", "100 mm", "Ø100", "DN50"', () => {
    for (const g of ['24 kW', '550 kVA', '100 mm', 'Ø100', 'DN50', '3 x 2 m', 'm']) {
      expect(insanSayiOku(g, 'miktar').tur, g).toBe('sayi-degil');
    }
  });
  it('SK-BIRIM birimle gelen belirsiz sayı yine BELİRSİZ ("1.250 m")', () => {
    expect(insanSayiOku('1.250 m', 'miktar').tur).toBe('belirsiz');
  });
  it('SK-BIRIM fiyat/kâr/iskonto alanında birim KABUL EDİLMEZ', () => {
    for (const alan of ['fiyat', 'kar', 'iskonto'] as SayiAlanTuru[]) {
      expect(insanSayiOku('12 m', alan).tur, alan).toBe('sayi-degil');
    }
  });
  it('SK-BIRIM listenin kendisi (iş emri + ölçülen genişleme)', () => {
    for (const b of ['adet', 'ad', 'm', 'mt', 'mtr', 'metre', 'm2', 'm²', 'm3', 'm³', 'kg', 'gr', 'lt', 'set', 'takım',
      'tk', 'paket', 'pk', 'boy', 'çift', 'kutu', 'rulo', 'top', 'grup', 'l', 'litre', 'ton']) {
      expect(MIKTAR_BIRIMLERI, b).toContain(b);
    }
  });
});

describe('SK-MAKMETIN: sistemin yazdığı metin iki kuralda da AYNI sayı', () => {
  it('SK-MAKMETIN yalnız 3 ondalıklı değer virgülle yazılır', () => {
    expect(makineMetni(10.075)).toBe('10,075');
    expect(makineMetni(323308.125)).toBe('323308,125');
    expect(makineMetni(-1.125)).toBe('-1,125');
    expect(makineMetni(1.25)).toBe('1.25');
    expect(makineMetni(1250)).toBe('1250');
    expect(makineMetni(12.3456)).toBe('12.3456');
  });
  it('SK-MAKMETIN gidiş-dönüş: 2.000 rastgele değer insan = makine = kendisi', () => {
    let tohum = 7;
    const rastgele = () => { tohum = (tohum * 16807) % 2147483647; return tohum / 2147483647; };
    for (let i = 0; i < 2000; i++) {
      const hane = Math.floor(rastgele() * 5);
      const n = Math.round((rastgele() * 10 ** Math.floor(rastgele() * 7)) * 10 ** hane) / 10 ** hane;
      const m = makineMetni(n);
      expect(sayiOku(m), m).toBe(n);
      expect(kisa(insanSayiOku(m, 'fiyat')), m).toBe(n);
    }
  });
});

describe('SK-HUCRE: hücre girdisi (valueParser çekirdeği) — K3 / K4', () => {
  it('SK-HUCRE geçerli değer makine metnine döner', () => {
    expect(hucreGirdisiCoz('1.234,5', '', 'fiyat')).toEqual({ deger: '1234.5', uyari: null });
    expect(hucreGirdisiCoz('10,075', '', 'miktar')).toEqual({ deger: '10,075', uyari: null });
    expect(hucreGirdisiCoz('12 m', '', 'miktar')).toEqual({ deger: '12', uyari: null });
    expect(hucreGirdisiCoz('₺200,00', '', 'fiyat')).toEqual({ deger: '200', uyari: null });
  });
  it('SK-HUCRE belirsiz / sayı değil → ESKİ değer + uyarı', () => {
    const b = hucreGirdisiCoz('1.250', '100', 'fiyat');
    expect(b.deger).toBe('100');
    expect(b.uyari).toContain('“1.250” belirsiz');
    const h = hucreGirdisiCoz('24 kW', '100', 'fiyat');
    expect(h.deger).toBe('100');
    expect(h.uyari).toContain('sayı değil');
  });
  it('SK-K4 değişmeyen metin (F2 + Enter) uyarı üretmez; "12.376" üretir', () => {
    expect(hucreGirdisiCoz('12.375', '12.375', 'miktar')).toEqual({ deger: '12.375', uyari: null });
    expect(hucreGirdisiCoz('12.375', 12.375, 'miktar')).toEqual({ deger: 12.375, uyari: null });
    expect(hucreGirdisiCoz('12.376', '12.375', 'miktar').uyari).toContain('belirsiz');
  });
  it('SK-K3 kâr/iskonto: boş → 0, "abc" REDDEDİLİR (var olan değer ezilmez)', () => {
    expect(hucreGirdisiCoz('', 20, 'kar')).toEqual({ deger: 0, uyari: null });
    expect(hucreGirdisiCoz('', 30, 'iskonto')).toEqual({ deger: 0, uyari: null });
    const k = hucreGirdisiCoz('abc', 20, 'kar');
    expect(k.deger).toBe(20);
    expect(k.uyari).toContain('sayı değil');
    expect(hucreGirdisiCoz('abc', 30, 'iskonto').deger).toBe(30);
  });
  it('SK-HUCRE sınırlar: kâr negatif 0 (üst sınır yok), iskonto 0-100', () => {
    expect(hucreGirdisiCoz('-10', 0, 'kar').deger).toBe(0);
    expect(hucreGirdisiCoz('%150', 0, 'kar').deger).toBe(150);
    expect(hucreGirdisiCoz('150', 0, 'iskonto').deger).toBe(100);
    expect(hucreGirdisiCoz('-5', 10, 'iskonto').deger).toBe(0);
  });
  it('SK-HUCRE miktar/fiyat boş → "" (Delete tuşu)', () => {
    expect(hucreGirdisiCoz('', '12', 'miktar')).toEqual({ deger: '', uyari: null });
    expect(hucreGirdisiCoz('', '12', 'fiyat')).toEqual({ deger: '', uyari: null });
  });
  it('SK-HUCRE fitting oranı: miktar "%35" metin olarak kalır, "%1.250" reddedilir', () => {
    expect(hucreGirdisiCoz('%35', '', 'miktar')).toEqual({ deger: '%35', uyari: null });
    expect(hucreGirdisiCoz('%1.250', '', 'miktar').uyari).toContain('belirsiz');
  });
});

describe('SK-UYARI: tek uyarı metni', () => {
  it('SK-UYARI belirsiz iki okumayı ve iki yazımı söyler', () => {
    const m = sayiUyarisi(insanSayiOku('1.250', 'fiyat'), 'fiyat')!;
    expect(m).toContain('“1.250” belirsiz');
    expect(m).toContain('1250');
    expect(m).toContain('1.250,00');
    expect(m).toContain('1,25');
  });
  it('SK-UYARI sayı değil / döviz metni alan adıyla; sayı ve boş için null', () => {
    expect(sayiUyarisi(insanSayiOku('24 kW', 'miktar'), 'miktar')).toBe('“24 kW” sayı değil — Miktar hücresine yalnız sayı yazılır (birim ayrı sütunda).');
    expect(sayiUyarisi(insanSayiOku('$12', 'fiyat'), 'fiyat')).toContain('dövizli');
    expect(sayiUyarisi(insanSayiOku('12', 'fiyat'), 'fiyat')).toBeNull();
    expect(sayiUyarisi(insanSayiOku('', 'fiyat'), 'fiyat')).toBeNull();
  });
  it('SK-UYARI uzun metin kısaltılır (ipucu taşmaz)', () => {
    const m = sayiUyarisi(insanSayiOku('35x240mm Üç bölmeli döşeme kanalı ve aksesuarları (dönüş, ek)', 'fiyat'), 'fiyat')!;
    expect(m).toContain('…”');
  });
  it('SK-UYARI form kutusu: boş null, sayı değer, belirsiz uyarı', () => {
    expect(formSayisiOku('', 'iskonto')).toEqual({ deger: null, uyari: null });
    expect(formSayisiOku('%30', 'iskonto')).toEqual({ deger: 30, uyari: null });
    expect(formSayisiOku('1.250', 'fiyat').uyari).toContain('belirsiz');
  });
  it('SK-UYARI içe aktarma işareti (_sayiUyari) aynı cümleyi kurar', () => {
    expect(kayitliSayiUyarisi({ ham: '35x240mm Üç bölmeli döşeme kanalı', tur: 'sayi-degil' }, 'fiyat')).toContain('sayı değil');
    expect(kayitliSayiUyarisi({ ham: '1.250', tur: 'belirsiz' }, 'miktar')).toContain('belirsiz');
    expect(kayitliSayiUyarisi(undefined, 'fiyat')).toBeNull();
  });
});
