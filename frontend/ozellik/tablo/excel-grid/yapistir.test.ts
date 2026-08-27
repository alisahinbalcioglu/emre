/**
 * PANO YAPISTIRMA PLANLAYICISI — KILITLER (28.08.2026)
 *
 * Kaynak vaka: kullanici Excel'de "İşçilik Birim" kolonundan ₺200,00 /
 * ₺300,00 / ₺400,00 hucrelerini kopyalayip teklif gridinde İşç. Birim Fiyat
 * hucresine yapistirmak istiyor — yapistirma quote modunda HIC yoktu.
 *
 * Kritik para riski: Excel kopyasi hucrenin GORUNUMUdur ("₺386.200,00").
 * `replace(',','.')` sinifi ayristirma bunu 386.2 yapar — BIN KAT YANLIS
 * (PK6 dersi). Bu dosya hem plani hem sayi sinifini kilitler.
 */
import { describe, it, expect } from 'vitest';
import { insanSayi, panoMatrisi, planYapistir, type PasteKolon, type PasteSatir } from './yapistir';
// Esdegerlik koprusu: uretimdeki insanSayi, golden testin num()'iyla
// AYRISAMAZ (iki uygulama tek davranis — pricing FE/BE ikizi deseni).
import { num } from '../../../test/e2e-golden/sayi-ayristirma.mjs';

// ── Quote gridinin GORUNUR kolon dizilisi (standart-sema sirasi) ──
const KOLONLAR: PasteKolon[] = [
  { field: '_ad', editable: true, sayisal: false },
  { field: '_birim', editable: true, sayisal: false },
  { field: '_miktar', editable: true, sayisal: true },
  { field: '_malzKar', editable: true, sayisal: true },
  { field: '_marka', editable: false, sayisal: false },     // dropdown — hedef degil
  { field: '_matBirim', editable: true, sayisal: true },
  { field: '_matToplam', editable: false, sayisal: true },  // hesaplanan — hedef degil
  { field: '_iscKar', editable: true, sayisal: true },
  { field: '_firma', editable: false, sayisal: false },
  { field: '_labBirim', editable: true, sayisal: true },
  { field: '_labToplam', editable: false, sayisal: true },
];
const VERI = (n: number): PasteSatir[] => Array.from({ length: n }, () => ({ isDataRow: true }));

describe('insanSayi — INSAN YAZIMI para/sayi sinifi', () => {
  it('kullanicinin gercek kopyasi: TL simgeli, binlikli, virgullu', () => {
    expect(insanSayi('₺200,00')).toBe(200);
    expect(insanSayi('₺1.200,00')).toBe(1200);
    expect(insanSayi('₺386.200,00')).toBe(386200); // PK6: 386.2 DEGIL
    expect(insanSayi('386.200,00')).toBe(386200);
    expect(insanSayi('1.234,56')).toBeCloseTo(1234.56, 6);
  });
  it('duz yazimlar', () => {
    expect(insanSayi('200')).toBe(200);
    expect(insanSayi('12,5')).toBe(12.5);
    expect(insanSayi(350)).toBe(350);
    expect(insanSayi('%35')).toBe(35);
    expect(insanSayi('35%')).toBe(35);
  });
  it('sayi olmayan metin sayi UYDURMAZ (03-bursa dersi)', () => {
    expect(insanSayi('mt')).toBeNull();
    expect(insanSayi('ad')).toBeNull();
    expect(insanSayi('35x240mm Üç bölmeli döşeme kanalı')).toBeNull();
    expect(insanSayi('')).toBeNull();
    expect(insanSayi('  ')).toBeNull();
  });
  it('KOPRU ★ num() ile birebir ayni sonuc (tek davranis — ayrisirsa PK6 tekrar dogar)', () => {
    const ORNEKLER = ['₺200,00', '₺386.200,00', '1.234,56', '200', '12,5', '0', '3', '105.000,00', '1.500,00'];
    for (const s of ORNEKLER) {
      expect(insanSayi(s), `yazim: "${s}"`).toBe(num(s));
    }
  });
});

describe('panoMatrisi — Excel TSV ayristirma', () => {
  it('CRLF + sondaki bos satir (Excel eklegi) atilir, icteki korunur', () => {
    expect(panoMatrisi('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(panoMatrisi('a\r\n\r\nb\r\n')).toEqual([['a'], [''], ['b']]);
  });
});

describe('planYapistir — kullanicinin senaryosu', () => {
  it('S1 ★ tek kolon fiyat blogu → İşç. Birim Fiyat hucrelerine, SAYI olarak', () => {
    const p = planYapistir('₺200,00\r\n₺300,00\r\n₺400,00\r\n', KOLONLAR, '_labBirim', VERI(5));
    expect(p.hucreler).toEqual([
      { satir: 0, field: '_labBirim', deger: 200 },
      { satir: 1, field: '_labBirim', deger: 300 },
      { satir: 2, field: '_labBirim', deger: 400 },
    ]);
    expect(p.ozet).toEqual({ yazilacak: 3, atlananBos: 0, atlananSayiDegil: 0, atlananKolon: 0, sigmayanSatir: 0 });
  });

  it('S2 bolum bandi pozisyon TUKETMEZ — N kopya satiri N VERI satirina gider', () => {
    const satirlar: PasteSatir[] = [
      { isDataRow: true }, { isDataRow: false }, { isDataRow: false }, { isDataRow: true }, { isDataRow: true },
    ];
    const p = planYapistir('100\n200\n300', KOLONLAR, '_labBirim', satirlar);
    expect(p.hucreler.map((h) => h.satir)).toEqual([0, 3, 4]);
  });

  it('S3 cok kolonlu blok: editable olmayan kolon HIZAYI korur, yazilmaz', () => {
    // Odak _malzKar: kopya 3 kolon → _malzKar(✓) _marka(atla) _matBirim(✓)
    const p = planYapistir('10\tPILSA\t₺150,00', KOLONLAR, '_malzKar', VERI(1));
    expect(p.hucreler).toEqual([
      { satir: 0, field: '_malzKar', deger: 10 },
      { satir: 0, field: '_matBirim', deger: 150 },
    ]);
    expect(p.ozet.atlananKolon).toBe(1); // _marka
  });

  it('S4 bos kopya hucresi hedefe DOKUNMAZ (0 yazip toplami sifirlamaz)', () => {
    const p = planYapistir('200\n\n400', KOLONLAR, '_labBirim', VERI(3));
    expect(p.hucreler.map((h) => h.satir)).toEqual([0, 2]);
    expect(p.ozet.atlananBos).toBe(1);
  });

  it('S5 sayisal kolona cozulemeyen metin YAZILMAZ (fiyat alanina "mt" copu)', () => {
    const p = planYapistir('mt\n200', KOLONLAR, '_labBirim', VERI(2));
    expect(p.hucreler).toEqual([{ satir: 1, field: '_labBirim', deger: 200 }]);
    expect(p.ozet.atlananSayiDegil).toBe(1);
  });

  it('S6 metin kolonuna metin OLDUGU GIBI gider (ad kolonu)', () => {
    const p = planYapistir('1/2" Siyah Boru', KOLONLAR, '_ad', VERI(1));
    expect(p.hucreler).toEqual([{ satir: 0, field: '_ad', deger: '1/2" Siyah Boru' }]);
  });

  it('S7 veri satirlari bitince tasan kopya SAYILIR (kullaniciya bildirilecek)', () => {
    const p = planYapistir('1\n2\n3\n4', KOLONLAR, '_labBirim', VERI(2));
    expect(p.hucreler.length).toBe(2);
    expect(p.ozet.sigmayanSatir).toBe(2);
  });

  it('S8 sinir: odak kolonu listede yoksa / metin bossa plan BOS', () => {
    expect(planYapistir('1', KOLONLAR, '_olmayanKolon', VERI(1)).hucreler).toEqual([]);
    expect(planYapistir('', KOLONLAR, '_labBirim', VERI(1)).hucreler).toEqual([]);
  });
});
