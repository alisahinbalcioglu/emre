/**
 * A2 — TÜRKÇE GİRDİ HER YOLDA AYNI SAYI (para doğruluğu turu, 14.09.2026)
 *
 * NEDEN: aynı metin, girildiği YOLA göre farklı sayı üretiyordu (A0'da
 * ölçüldü, 13 gerçek dosya + dalların birebir kopyası):
 *   · G2  miktar hücresine elle "12,5" → satır toplamı 12 ile (1.440; doğrusu
 *         1.500), kâr maliyeti / kayıt / Excel 12,5 ile — satır kendi içinde çelişik
 *   · K5  iskonto hücresine elle "%30" → 0 (net = liste); "tüm listeye uygula"
 *         ve yapıştırma aynı metni 30 okuyordu; grup kutusu `type=number`
 *         olduğu için "%" hiç yazılamıyordu
 *   · K5 ikizi: kâr hücresine elle "%30" → 0 (fiyat maliyete iner)
 *   · sürükle-doldur iskontosu ham `parseFloat("%30")` = NaN → 0
 *
 * ÖLÇÜT: her yolun ÜRETİMDE kullandığı fonksiyon aynı girdiyle çağrılır ve
 * sonuçlar birbirine eşit olmalı. Elle yazma yolları (AG Grid valueParser /
 * cellValueChanged dalı) jsdom olmadan koşulamadığı için, dalın çağırdığı
 * fonksiyon adı ayrıca KAYNAKTA ölçülür — fonksiyon doğru ama dal onu
 * çağırmıyorsa kapı kırmızı yanar (mekanizma var, bağlantı yok dersi).
 *
 * KAPSAM DIŞI (bilinçli): "1.250" — elle yazma tek noktayı ondalık (1,25),
 * yapıştırma TR binlik (1.250) okur. Bu iki sınıf mevcut kararlarla ayrılmış
 * (sayi-ayristirma PK6, yapistir.test.ts köprüsü); birleştirilmesi yeni bir
 * ürün kararı ister, raporda açık karar olarak duruyor.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { karYuzdesiOku, sayiAlani, yuzdeOku } from './sayi-alani';
import { etkinMiktar } from './pricing';
import { iskontoHucresiOku, parseDiscountInput, parseDiscountPaste } from '../tablo/excel-grid/discount-utils';
import { insanSayi } from '../tablo/excel-grid/yapistir';

const YUZDE_GIRDILERI: Array<[string, number]> = [
  ['%30', 30], ['30', 30], ['30%', 30], [' 30 ', 30], [' %15 ', 15], ['% 15', 15], ['%12,5', 12.5], ['12,5', 12.5], ['12.5', 12.5],
];
const MIKTAR_GIRDILERI: Array<[string, number]> = [['12,5', 12.5], ['12.5', 12.5], ['30', 30], [' 30 ', 30]];

describe('A2 iskonto %: elle · grup · tüm liste · yapıştırma · sürükle-doldur AYNI sayı', () => {
  for (const [girdi, beklenen] of YUZDE_GIRDILERI) {
    it(`"${girdi}" → ${beklenen} her yolda`, () => {
      const yollar = {
        elle: iskontoHucresiOku(girdi),                  // ExcelGrid _draftDiscount valueParser
        grup: parseDiscountInput(girdi),                 // promptGroupDiscount (metin kutusu)
        tumListe: parseDiscountInput(girdi),             // "tüm listeye uygula" kutusu
        yapistirma: parseDiscountPaste(`${girdi}\n`)[0], // S3 blok yapıştırma
        surukleDoldur: iskontoHucresiOku(girdi),         // fill-handle `_draftDiscount` dalı
      };
      for (const [yol, deger] of Object.entries(yollar)) expect(deger, yol).toBe(beklenen);
    });
  }

  it('sınırlar her yolda aynı: -5 → 0, 150 → 100, "abc" → 0', () => {
    for (const [girdi, beklenen] of [['-5', 0], ['150', 100], ['abc', 0], ['', 0]] as const) {
      expect(iskontoHucresiOku(girdi), girdi).toBe(beklenen);
      expect(parseDiscountInput(girdi), girdi).toBe(beklenen);
    }
  });
});

describe('A2 kâr %: elle · yapıştırma · sürükle-doldur AYNI sayı', () => {
  for (const [girdi, beklenen] of YUZDE_GIRDILERI) {
    it(`"${girdi}" → ${beklenen} her yolda`, () => {
      const elle = karYuzdesiOku(girdi);                              // kâr kolonu valueParser
      const yapistirma = sayiAlani(String(insanSayi(girdi)));         // pano → String(insanSayi) → okuyucular sayiAlani
      const surukleDoldur = sayiAlani(elle);                          // fill-handle kaynağın SAKLI değerini sayiAlani ile okur
      expect(elle, 'elle').toBe(beklenen);
      expect(yapistirma, 'yapıştırma').toBe(beklenen);
      expect(surukleDoldur, 'sürükle-doldur').toBe(beklenen);
    });
  }

  it('negatif ve okunamayan kâr 0 (üst sınır YOK: %150 meşru)', () => {
    expect(karYuzdesiOku('-10')).toBe(0);
    expect(karYuzdesiOku('abc')).toBe(0);
    expect(karYuzdesiOku('%150')).toBe(150);
    expect(yuzdeOku('')).toBeNull();
  });
});

describe('A2 miktar: elle yazma · yapıştırma AYNI sayı (satır toplamı = kâr maliyeti = kayıt)', () => {
  for (const [girdi, beklenen] of MIKTAR_GIRDILERI) {
    it(`"${girdi}" → ${beklenen}`, () => {
      const elle = etkinMiktar({ q: girdi }, 'q');                          // miktar dalı (G2) artık etkinMiktar
      const yapistirma = etkinMiktar({ q: String(insanSayi(girdi)) }, 'q'); // pano → String(insanSayi) → aynı dal
      const kayit = sayiAlani(etkinMiktar({ q: girdi }, 'q'));              // teklif-kalem quantity
      expect(elle, 'elle').toBe(beklenen);
      expect(yapistirma, 'yapıştırma').toBe(beklenen);
      expect(kayit, 'kayıt').toBe(beklenen);
    });
  }
});

describe('A2 bağlantı: üretim dalları ortak kuralı ÇAĞIRIYOR (kaynak ölçümü)', () => {
  const KOK = path.resolve(__dirname, '../..');
  const kodOnly = (m: string) => m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const grid = kodOnly(fs.readFileSync(path.join(KOK, 'ozellik/tablo/excel-grid/ExcelGrid.tsx'), 'utf8'));

  it('G2: miktar dalı etkinMiktar kullanır — ham parseFloat(e.newValue) YOK', () => {
    const dal = grid.match(/if \(e\.colDef\.field === quantityField && !row\._fitting\) \{[\s\S]{0,400}/)?.[0] ?? '';
    expect(dal, 'miktar dalı bulunamadı — kapı kapsam kaybetti').not.toBe('');
    expect(dal).toMatch(/const qty = etkinMiktar\(row, quantityField, unitField\)/);
    expect(grid).not.toMatch(/const qty = parseFloat\(String\(e\.newValue/);
  });

  it('K5: iskonto hücresi valueParser ortak kuralı çağırır', () => {
    expect(grid).toMatch(/valueParser: \(p: any\) => iskontoHucresiOku\(p\.newValue\)/);
  });

  it('K5 ikizi: kâr kolonları valueParser ortak kuralı çağırır', () => {
    expect(grid).toMatch(/base\.valueParser = \(p: any\) => karYuzdesiOku\(p\.newValue\)/);
  });

  it('sürükle-doldur iskontosu ortak kuralı çağırır (ham parseFloat YOK)', () => {
    expect(grid).toMatch(/result\.field === '_draftDiscount'[\s\S]{0,300}?iskontoHucresiOku\(result\.value\)/);
    expect(grid).not.toMatch(/clampDiscount\(parseFloat\(String\(result\.value/);
  });

  it('grup iskonto kutusu "%" yazmaya izin verir (type=number DEĞİL)', () => {
    const kutu = grid.match(/grubuna iskonto`[\s\S]{0,300}?input: \{[^}]*\}/)?.[0] ?? '';
    expect(kutu, 'grup kutusu bulunamadı').not.toBe('');
    expect(kutu).not.toMatch(/tip: 'number'/);
  });
});
