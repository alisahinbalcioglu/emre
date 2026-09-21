/**
 * A2 — TÜRKÇE GİRDİ HER YOLDA AYNI SINIF (para doğruluğu turu 14.09 + tur 3 A2)
 *
 * NEDEN: aynı metin, girildiği YOLA göre farklı sayı üretiyordu (A0'da ölçüldü):
 *   · G2  miktar hücresine elle "12,5" → satır toplamı 12 ile (1.440; doğrusu 1.500)
 *   · K5  iskonto hücresine elle "%30" → 0; "tüm listeye uygula" ve yapıştırma 30
 *   · K5 ikizi: kâr hücresine elle "%30" → 0
 * TUR 3 A2 (tur3/a2/RAPOR.md, ölçüldü): "1.250" ÜÇ sınıftaydı — elle yazma/kayıt
 * 1,25; teklif yapıştırma 1250; admin içe aktarma BELİRSİZ. Hayalet
 * "35x240mm Üç bölmeli döşeme kanalı" elle yazma, kütüphane blok yapıştırma ve
 * içe aktarmada 35; iskonto yapıştırmada "abc" var olan iskontoyu 0 ile eziyordu.
 * Önceki sürümün "KAPSAM DIŞI: 1.250" notu bu turda KALKTI: kural tek
 * (`sayi-alani.ts` `insanSayiOku`), belirsiz yazım HİÇBİR insan yolunda yazılmaz.
 *
 * ÖLÇÜT: her yolun ÜRETİMDE kullandığı fonksiyon aynı girdiyle çağrılır ve
 * SINIFLAR birbirine eşit olmalı. AG Grid olayına bağlı yollar (valueParser,
 * cellValueChanged dalları, ExcelGrid içindeki yapıştırmalar, form sayfaları)
 * jsdom olmadan koşulamadığı için dalın çağırdığı fonksiyon ayrıca KAYNAKTA
 * ölçülür — fonksiyon doğru ama dal onu çağırmıyorsa kapı kırmızı yanar
 * (mekanizma var, bağlantı yok dersi). Backend yolları (içe aktarma, admin,
 * işçilik, AI) `backend/test/hesap-dogrulugu-test.ts` H12 paritesinde koşar.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  formSayisiOku, hucreGirdisiCoz, insanSayiOku, sayiAlani, sayiOku, yuzdeOku, type SayiAlanTuru,
} from './sayi-alani';
import { etkinMiktar } from './pricing';
import { iskontoHucresiOku, parseDiscountInput, parseDiscountPaste } from '../tablo/excel-grid/discount-utils';
import { insanSayi, planYapistir, type PasteKolon } from '../tablo/excel-grid/yapistir';

type Sinif = string; // 'sayi:<n>' | 'belirsiz' | 'sayi-degil' | 'bos'

/** Kuralın kendi sınıfı (referans). */
const kural = (g: unknown, alan: SayiAlanTuru): Sinif => {
  const r = insanSayiOku(g, alan);
  return r.tur === 'sayi' ? `sayi:${r.deger}` : r.tur;
};
/** Grid valueParser yolu (elle yazma): reddedilirse uyarı metninden sınıf. */
const parserYolu = (g: string, alan: SayiAlanTuru): Sinif => {
  const s = hucreGirdisiCoz(g, '__ESKI__', alan);
  if (s.uyari) return s.uyari.includes('belirsiz') ? 'belirsiz' : 'sayi-degil';
  if (s.deger === '' ) return 'bos';
  const n = typeof s.deger === 'number' ? s.deger : sayiOku(s.deger);
  return `sayi:${n}`;
};
/** Teklif gridi pano yapıştırma planı (tek hücre). */
const yapistirmaYolu = (g: string, alan: SayiAlanTuru): Sinif => {
  const kolon: PasteKolon = { field: 'f', editable: true, sayisal: true, alan };
  const p = planYapistir(g, [kolon], 'f', [{ isDataRow: true }]);
  if (p.hucreler.length === 1) return `sayi:${p.hucreler[0].deger}`;
  if (p.ozet.atlananBelirsiz === 1) return 'belirsiz';
  if (p.ozet.atlananSayiDegil === 1) return 'sayi-degil';
  return 'bos';
};
/** Form kutusu (kütüphane / admin / işçilik sayfaları). */
const formYolu = (g: string, alan: SayiAlanTuru): Sinif => {
  const f = formSayisiOku(g, alan);
  if (f.uyari) return f.uyari.includes('belirsiz') ? 'belirsiz' : 'sayi-degil';
  return f.deger === null ? 'bos' : `sayi:${f.deger}`;
};

// Sınır değerleri (kelepçe) alanın işi, sınıf DEĞİL: karşılaştırma kelepçesiz girdilerle.
const ORTAK_GIRDILER = [
  '35x240mm Üç bölmeli döşeme kanalı', 'Ø100 PVC boru', 'DN50', '24 kW', '2x1,5 mm²', 'abc',
  '1.250', '10.075', '25430.000', '1.25', '1.234,5', '6.500,00', '12,5', '12.5', '0', '30', '1,234,567', '1 250',
  '$1.500', '€12',
];
const ALAN_GIRDILERI: Record<SayiAlanTuru, string[]> = {
  fiyat: [...ORTAK_GIRDILER, '₺1.250,00', '2.500,00 TL', '₺1.250', '%30'],
  miktar: [...ORTAK_GIRDILER, '12 m', '3 adet', '12,5 mt.', '1.250 m', '550 kVA'],
  kar: [...ORTAK_GIRDILER, '%30', '30%', '% 15', '%12,5', '%12.125', '₺30'],
  iskonto: [...ORTAK_GIRDILER, '%30', '30%', ' %15 ', '%12,5', '%12.125', '₺30'],
};

describe('A2 ★ HER İNSAN YOLU AYNI SINIF (elle · yapıştırma · form · grup kutusu)', () => {
  for (const alan of ['fiyat', 'miktar', 'kar'] as SayiAlanTuru[]) {
    for (const g of ALAN_GIRDILERI[alan]) {
      it(`SY-SINIF ${alan} "${g}" → ${kural(g, alan)}`, () => {
        const beklenen = kural(g, alan);
        expect(parserYolu(g, alan), 'elle (valueParser)').toBe(beklenen);
        expect(yapistirmaYolu(g, alan), 'pano yapıştırma').toBe(beklenen);
        expect(formYolu(g, alan), 'form kutusu').toBe(beklenen);
      });
    }
  }
  // İskonto yollarının hepsi 0-100 kelepçesi uygular — sınıf kelepçeli değerle karşılaştırılır.
  const kelepce = (s: Sinif): Sinif => (s.startsWith('sayi:') ? `sayi:${Math.min(100, Math.max(0, Number(s.slice(5))))}` : s);
  for (const g of ALAN_GIRDILERI.iskonto) {
    it(`SY-SINIF iskonto "${g}" → ${kelepce(kural(g, 'iskonto'))}`, () => {
      const beklenen = kelepce(kural(g, 'iskonto'));
      expect(parserYolu(g, 'iskonto'), 'elle (valueParser)').toBe(beklenen);
      expect(kelepce(formYolu(g, 'iskonto')), 'form kutusu').toBe(beklenen);
      // grup / tüm liste kutusu: null = UYGULANMAZ (sınıfı kural verir)
      const grup = parseDiscountInput(g);
      expect(grup === null ? kural(g, 'iskonto') : `sayi:${grup}`, 'grup/tüm liste kutusu').toBe(beklenen);
      // S3 yapıştırma satırı: aynı sınıf; sayı değilse değer YAZILMAZ (null)
      const [satir] = parseDiscountPaste(`${g}\n`);
      expect(satir.deger === null ? satir.girdi.tur : `sayi:${satir.deger}`, 'S3 yapıştırma').toBe(beklenen);
    });
  }
});

describe('A2 ★ HAYALET HİÇBİR YOLDA FİYAT/MİKTAR YAZMAZ', () => {
  const HAYALET = ['35x240mm Üç bölmeli döşeme kanalı', '550 kVA Stand-By Jeneratör', '2x1,5 mm²', '24 kW', '3x100A e kadar ATS Pano'];
  for (const g of HAYALET) {
    it(`SY-HAYALET "${g}"`, () => {
      expect(hucreGirdisiCoz(g, '100', 'fiyat').deger, 'elle fiyat: eski değer kalır').toBe('100');
      expect(hucreGirdisiCoz(g, '12', 'miktar').deger, 'elle miktar: eski değer kalır').toBe('12');
      expect(hucreGirdisiCoz(g, 20, 'kar').deger, 'elle kâr: eski değer kalır').toBe(20);
      expect(planYapistir(g, [{ field: 'f', editable: true, sayisal: true, alan: 'fiyat' }], 'f', [{ isDataRow: true }]).hucreler).toEqual([]);
      expect(parseDiscountPaste(g)[0].deger, 'iskonto yapıştırma').toBeNull();
      expect(formSayisiOku(g, 'fiyat').deger, 'form').toBeNull();
      // MAKİNE okuyucuları (eski kayıtta duran hayalet): ekran/kayıt/kâr/toplam 0
      expect(sayiOku(g), 'sayiOku (ekran biçimi, Net Fiyat, kâr maliyeti)').toBeNull();
      expect(sayiAlani(g), 'sayiAlani (kayıt)').toBe(0);
      expect(etkinMiktar({ q: g }, 'q'), 'etkinMiktar (satır toplamı)').toBe(0);
    });
  }
});

describe('A2 iskonto %: elle · grup · tüm liste · yapıştırma · sürükle-doldur AYNI sayı', () => {
  const YUZDE_GIRDILERI: Array<[string, number]> = [
    ['%30', 30], ['30', 30], ['30%', 30], [' 30 ', 30], [' %15 ', 15], ['% 15', 15], ['%12,5', 12.5], ['12,5', 12.5], ['12.5', 12.5],
  ];
  for (const [girdi, beklenen] of YUZDE_GIRDILERI) {
    it(`"${girdi}" → ${beklenen} her yolda`, () => {
      const elle = hucreGirdisiCoz(girdi, 0, 'iskonto').deger as number; // _draftDiscount valueParser
      const yollar = {
        elle,
        grup: parseDiscountInput(girdi),                   // promptGroupDiscount (metin kutusu)
        tumListe: parseDiscountInput(girdi),               // "tüm listeye uygula" kutusu
        yapistirma: parseDiscountPaste(`${girdi}\n`)[0].deger, // S3 blok yapıştırma
        surukleDoldur: iskontoHucresiOku(elle),            // fill-handle kaynağın SAKLI değerini okur
      };
      for (const [yol, deger] of Object.entries(yollar)) expect(deger, yol).toBe(beklenen);
    });
  }

  it('sınırlar her yolda aynı: -5 → 0, 150 → 100; "abc" HİÇBİR yolda uygulanmaz (K3)', () => {
    for (const [girdi, beklenen] of [['-5', 0], ['150', 100]] as const) {
      expect(hucreGirdisiCoz(girdi, 7, 'iskonto').deger, girdi).toBe(beklenen);
      expect(parseDiscountInput(girdi), girdi).toBe(beklenen);
    }
    expect(hucreGirdisiCoz('abc', 7, 'iskonto').deger, 'elle: eski değer').toBe(7);
    expect(parseDiscountInput('abc'), 'grup/tüm liste: uygulanmaz').toBeNull();
    expect(parseDiscountPaste('abc')[0].deger, 'yapıştırma: ezmez').toBeNull();
    expect(hucreGirdisiCoz('', 7, 'iskonto').deger, 'boş hücre → 0 (K3, bugünkü gibi)').toBe(0);
  });

  it('sürükle-doldur SAKLI değeri makine kuralıyla okur (12.125 belirsiz SAYILMAZ)', () => {
    expect(iskontoHucresiOku(12.125)).toBe(12.125);
    expect(iskontoHucresiOku('12.125')).toBe(12.125);
    expect(iskontoHucresiOku('%30')).toBe(30);
  });
});

describe('A2 kâr %: elle · yapıştırma · sürükle-doldur AYNI sayı', () => {
  const YUZDE_GIRDILERI: Array<[string, number]> = [
    ['%30', 30], ['30', 30], ['30%', 30], [' 30 ', 30], [' %15 ', 15], ['% 15', 15], ['%12,5', 12.5], ['12,5', 12.5], ['12.5', 12.5],
  ];
  for (const [girdi, beklenen] of YUZDE_GIRDILERI) {
    it(`"${girdi}" → ${beklenen} her yolda`, () => {
      const elle = hucreGirdisiCoz(girdi, 0, 'kar').deger;                         // kâr kolonu valueParser
      const yapistirma = sayiAlani(String(insanSayi(girdi, 'kar')));               // pano → makine metni → okuyucular sayiAlani
      const surukleDoldur = sayiAlani(elle);                                        // fill-handle kaynağın SAKLI değerini sayiAlani ile okur
      expect(elle, 'elle').toBe(beklenen);
      expect(yapistirma, 'yapıştırma').toBe(beklenen);
      expect(surukleDoldur, 'sürükle-doldur').toBe(beklenen);
    });
  }

  it('negatif kâr 0, %150 meşru, "abc" REDDEDİLİR (K3: var olan kâr ezilmez)', () => {
    expect(hucreGirdisiCoz('-10', 20, 'kar').deger).toBe(0);
    expect(hucreGirdisiCoz('%150', 20, 'kar').deger).toBe(150);
    expect(hucreGirdisiCoz('abc', 20, 'kar').deger).toBe(20);
    expect(yuzdeOku('')).toBeNull();
  });
});

describe('A2 miktar: elle yazma · yapıştırma AYNI sayı (satır toplamı = kâr maliyeti = kayıt)', () => {
  const MIKTAR_GIRDILERI: Array<[string, number]> = [['12,5', 12.5], ['12.5', 12.5], ['30', 30], [' 30 ', 30], ['1.234,5', 1234.5], ['10,075', 10.075]];
  for (const [girdi, beklenen] of MIKTAR_GIRDILERI) {
    it(`"${girdi}" → ${beklenen}`, () => {
      const hucre = hucreGirdisiCoz(girdi, '', 'miktar').deger;                  // valueParser → hücreye makine metni
      const elle = etkinMiktar({ q: hucre }, 'q');                                  // miktar dalı (G2) etkinMiktar
      const pano = planYapistir(girdi, [{ field: 'q', editable: true, sayisal: true, alan: 'miktar' }], 'q', [{ isDataRow: true }]).hucreler[0].deger;
      const yapistirma = etkinMiktar({ q: pano }, 'q');
      const kayit = sayiAlani(etkinMiktar({ q: hucre }, 'q'));                      // teklif-kalem quantity
      expect(elle, 'elle').toBe(beklenen);
      expect(yapistirma, 'yapıştırma').toBe(beklenen);
      expect(kayit, 'kayıt').toBe(beklenen);
    });
  }
  it('makine metni kat toplamı "10.075" (eski kayıt) miktar 10,075 okunur — belirsiz DEĞİL', () => {
    expect(etkinMiktar({ q: '10.075' }, 'q')).toBe(10.075);
    expect(etkinMiktar({ q: '10,075' }, 'q')).toBe(10.075);
  });
  // Ayrıştırıcı yeni yazımı makine metnine çevirir; etkinMiktar'ın HAM TR metni
  // görmesi yalnız ESKİ kayıtta olur (A2 öncesi hücrede aynen duran "1.234,5").
  it('SY-MIKTAR eski kayıt: TR binlikli miktar "1.234,5" 1234,5 okunur (eski yerel parseFloat 1,234)', () => {
    expect(etkinMiktar({ q: '1.234,5' }, 'q')).toBe(1234.5);
    expect(etkinMiktar({ q: '₺1.234,5' }, 'q')).toBe(1234.5);
    expect(etkinMiktar({ q: '1.234.567' }, 'q')).toBe(1234567);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BAĞLANTI KAPILARI — üretim dalları ortak kuralı ÇAĞIRIYOR (kaynak ölçümü)
// ════════════════════════════════════════════════════════════════════════════
describe('A2 bağlantı: üretim dalları ortak kuralı ÇAĞIRIYOR (kaynak ölçümü)', () => {
  const KOK = path.resolve(__dirname, '../..');
  const BE = path.resolve(KOK, '../backend/src/ozellik');
  const kodOnly = (m: string) => m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const oku = (p: string) => kodOnly(fs.readFileSync(p, 'utf8'));
  const grid = oku(path.join(KOK, 'ozellik/tablo/excel-grid/ExcelGrid.tsx'));

  it('kapsam dosyaları GERÇEKTEN okunuyor (boş-küme kapısı)', () => {
    expect(grid.length).toBeGreaterThan(50000);
    expect(fs.existsSync(path.join(BE, 'giris/excel-grid/standart-sema.ts')), 'backend kökü bulunamadı').toBe(true);
  });

  it('G2: miktar dalı etkinMiktar kullanır — ham parseFloat(e.newValue) YOK', () => {
    const dal = grid.match(/if \(e\.colDef\.field === quantityField && !row\._fitting\) \{[\s\S]{0,400}/)?.[0] ?? '';
    expect(dal, 'miktar dalı bulunamadı — kapı kapsam kaybetti').not.toBe('');
    expect(dal).toMatch(/const qty = etkinMiktar\(row, quantityField, unitField\)/);
    expect(grid).not.toMatch(/const qty = parseFloat\(String\(e\.newValue/);
  });

  it('SY-BAG parser çekirdeği: sayiHucreParser → hucreGirdisiCoz(p.newValue, p.oldValue, alan)', () => {
    expect(grid).toMatch(/function sayiHucreParser\(alan: SayiAlanTuru, bekleyen[\s\S]{0,200}?hucreGirdisiCoz\(p\.newValue, p\.oldValue, alan\)/);
    expect(grid).toMatch(/onCellEditingStopped=\{sayiUyarisiniGoster\}/);
  });

  it('SY-BAG miktar + 4 fiyat rolü valueParser alır (elle yazma insan sınırı)', () => {
    const blok = grid.match(/const sayiKolonTuru: SayiAlanTuru \| null = [\s\S]{0,400}?base\.valueParser = sayiHucreParser\(sayiKolonTuru, bekleyenSayiUyarisiRef\)/)?.[0] ?? '';
    expect(blok, 'miktar/fiyat parser bloğu bulunamadı').not.toBe('');
    for (const rol of ['quantityField', 'materialUnitPriceField', 'laborUnitPriceField', 'materialTotalField', 'laborTotalField']) {
      expect(blok, rol).toContain(rol);
    }
  });

  it('SY-BAG K5: iskonto hücresi valueParser ortak kuralı çağırır', () => {
    expect(grid).toMatch(/valueParser: sayiHucreParser\('iskonto', bekleyenSayiUyarisiRef\)/);
  });

  it('SY-BAG K5 ikizi: kâr kolonları valueParser ortak kuralı çağırır', () => {
    expect(grid).toMatch(/base\.valueParser = sayiHucreParser\('kar', bekleyenSayiUyarisiRef\)/);
    expect(grid).not.toMatch(/karYuzdesiOku/);
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

  it('SY-BAG grup + tüm liste kutusu: okunamayan metin UYGULANMAZ (null dalı)', () => {
    const n = (grid.match(/const v = parseDiscountInput\((?:raw|bulkDiscountInput)\);[\s\S]{0,300}?if \(v === null\) \{/g) ?? []).length;
    expect(n, 'iki kutunun ikisi de null dalı taşımalı').toBe(2);
  });

  it('SY-BAG teklif yapıştırma: kolon alanı + makine metni yazımı', () => {
    expect(grid).toMatch(/\[\[quantityField, 'miktar'\], \[materialUnitPriceField, 'fiyat'\], \[laborUnitPriceField, 'fiyat'\],\s*\['_malzKar', 'kar'\], \['_iscKar', 'kar'\]\]/);
    expect(grid).toMatch(/sayisal: sayisalAlanlar\.has\(c\.getColId\(\)\),\s*alan: sayisalAlanlar\.get\(c\.getColId\(\)\)/);
    expect(grid).toMatch(/n\.setDataValue\(h\.field, typeof h\.deger === 'number' \? makineMetni\(h\.deger\) : String\(h\.deger\), 'edit'\)/);
    expect(grid).toMatch(/ek\.push\(\.\.\.sayiUyarilari\)/);
  });

  it('SY-BAG iskonto yapıştırma: sayı olmayan satır ezmez (deger === null → continue)', () => {
    expect(grid).toMatch(/if \(s\.deger === null\) \{[\s\S]{0,200}?continue;/);
  });

  it('SY-BAG kütüphane blok yapıştırma: sayısal rol kolonu insan kuralından geçer', () => {
    const blok = grid.match(/const sayiKolonu = new Map<string, SayiAlanTuru>\([\s\S]{0,1400}?rowNodes\[i\]\.data\[field\] = cols\[j\];/)?.[0] ?? '';
    expect(blok, 'blok yapıştırma bulunamadı').not.toBe('');
    expect(blok).toMatch(/\[r0\.quantityField, 'miktar'\], \[r0\.materialUnitPriceField, 'fiyat'\], \[r0\.laborUnitPriceField, 'fiyat'\]/);
    expect(blok).toMatch(/const alan = sayiKolonu\.get\(field\);\s*if \(alan\) \{\s*const g = insanSayiOku\(cols\[j\], alan\);/);
    expect(blok).toMatch(/if \(g\.tur === 'belirsiz' \|\| g\.tur === 'sayi-degil'\) \{[\s\S]{0,200}?continue;/);
    expect(blok).toMatch(/rowNodes\[i\]\.data\[field\] = g\.tur === 'sayi' \? makineMetni\(g\.deger\) : ''/);
  });

  it('SY-BAG kat hücresi: yazılan metin hucreGirdisiCoz, diğer katlar sayiOku', () => {
    expect(grid).toMatch(/const katGirdisi = hucreGirdisiCoz\(e\.newValue, e\.oldValue, 'miktar'\)/);
    expect(grid).toMatch(/for \(const f of floorFields\) sum \+= sayiOku\(row\[f\]\) \?\? 0;/);
  });

  it('SY-BAG elle birim fiyat dalları + Net Fiyat + kâr maliyeti makine okuyucusu', () => {
    expect((grid.match(/const enteredPrice = sayiOku\(e\.newValue\) \?\? 0;/g) ?? []).length, 'malzeme + işçilik').toBe(2);
    expect(grid).toMatch(/const listPrice = sayiOku\(row\[priceField \?\? ''\]\) \?\? 0;/);
    expect(grid).toMatch(/maliyetiGeriTuret\(sayiOku\(row\[materialUnitPriceField\]\) \?\? 0, oncekiKar\)/);
    expect(grid).toMatch(/maliyetiGeriTuret\(sayiOku\(row\[laborUnitPriceField\]\) \?\? 0, oncekiKarLab\)/);
  });

  it('SY-BAG E: kâr kopyası TR biçimli; miktar EKRANDA ayraçlı, PANODA gruplamasız', () => {
    // 21.09 (t.5): miktar hücresinin GÖRÜNEN metni artık binlik ayraçlı
    // (`miktarGosterimMetni`). E dersi (pano gidiş-dönüşü) KALDIRILMADI, YERİ
    // DEĞİŞTİ: kopyalama bu kolonda biçimlendiriciyi ATLAR ve gruplamasız
    // makine metnini okur — aksi hâlde "1.250" yapıştırmada BELİRSİZ olurdu.
    expect(grid).toMatch(/base\.valueFormatter = \(p: any\) => \(p\.node\?\.rowPinned \? String\(p\.value \?\? ''\) : miktarGosterimMetni\(p\.value\)\)/);
    expect(grid).toMatch(/base\.valueFormatter = \(p: any\) => hucreGosterimMetni\(p\.value\)/);
    // BAĞLANTI: pano okuyucusu miktar kolonunu tanır ve makine metnini alır.
    expect(grid).toMatch(/if \(field && field === quantityFieldRef\.current\) \{\s*return hucreGosterimMetni\(api\.getCellValue\(\{ rowNode: n, colKey: field \}\) \?\? ''\);/);
    expect(grid).toMatch(/quantityFieldRef\.current = data\?\.columnRoles\?\.quantityField;/);
  });

  it('SY-BAG içe aktarma işareti: fiyat, toplam ve miktar kolonları _sayiUyari okur', () => {
    expect((grid.match(/sayiUyari: d\?\._sayiUyari\?\.\[field\]/g) ?? []).length, 'malzeme + işçilik birim').toBe(2);
    expect(grid).toMatch(/isaretStili\(\{ dal: 'malzeme', sayiUyari: p\.data\._sayiUyari\[c\.field\], sayiAlani: 'miktar' \}\)/);
    expect(grid).toMatch(/row\._sayiUyari\?\.\[sayiIsaretAlani\] && sayiOku\(e\.newValue\) !== null/);
  });

  it('SY-BAG form kutuları insan kuralını çağırır (kütüphane · admin · işçilik · elektrik markası)', () => {
    const lib = oku(path.join(KOK, 'app/(protected)/library/page.tsx'));
    expect((lib.match(/formSayisiOku\(/g) ?? []).length, 'library/page.tsx').toBe(7);
    expect(lib).not.toMatch(/Number\((?:discountRate|customPrice|editForm\.|editingDiscountValue|editingPriceValue|bulkDiscountValue)/);
    expect(oku(path.join(KOK, 'app/admin/brands/page.tsx'))).toMatch(/const fiyatG = formSayisiOku\(matPrice, 'fiyat'\)/);
    expect(oku(path.join(KOK, 'app/(protected)/labor/page.tsx'))).toMatch(/const fiyatG = formSayisiOku\(form\.unitPrice, 'fiyat'\)/);
    expect(oku(path.join(KOK, 'app/(protected)/library/electrical-brands/page.tsx'))).toMatch(/const fiyatG = formSayisiOku\(customPrice, 'fiyat'\)/);
  });

  it('SY-BAG metraj miktar kutusu: blur + yeni satır insan kuralı', () => {
    const m = oku(path.join(KOK, 'components/dwg-metraj/MetrajEditor.tsx'));
    expect(m).toMatch(/const g = hucreGirdisiCoz\(r\.qty, eski, 'miktar'\)/);
    expect(m).toMatch(/onBlur=\{\(\) => handleQtyBlur\(row\.id\)\}/);
    expect(m).toMatch(/const qtyG = hucreGirdisiCoz\(newQty \|\| '1', '', 'miktar'\)/);
  });

  it('SY-BAG kayıt onayı ve içe aktarma özeti okunamayan hücreyi sayar', () => {
    const p = oku(path.join(KOK, 'app/(protected)/quotes/new/page.tsx'));
    expect(p).toMatch(/const okunamayanHucre = \(sheetsPayload \?\? \[\]\)\.reduce/);
    expect(p).toMatch(/fiyatsizOnayMetni\(fiyatsiz, okunamayanHucre\) : sayiOkunamadiOnayMetni\(okunamayanHucre\)/);
    expect((p.match(/sayiOkunamadiCumlesi\(okunamayanHucre\)/g) ?? []).length, 'dashboard + Dosya Seç yolu').toBe(2);
  });

  it('SY-BAG backend içe aktarma: hücre tipi taşınır + fiyat kopyası/miktar/özet insan kuralı', () => {
    const svc = oku(path.join(BE, 'giris/excel-grid/excel-grid.service.ts'));
    expect(svc).toMatch(/row\.push\(excelHucreMetni\(cell\)\)/);
    expect(svc).not.toMatch(/String\(cell\.v\)/);
    expect((svc.match(/miktarVarMi\(/g) ?? []).length, 'tanım + 4 çağrı').toBe(5);
    const sema = oku(path.join(BE, 'giris/excel-grid/standart-sema.ts'));
    expect(sema).toMatch(/const g = insanSayiOku\(eski\[kaynakAlan\], 'fiyat'\)/);
    expect(sema).toMatch(/const mikG = insanSayiOku\(hamMiktar, 'miktar'\)/);
    expect(sema).toMatch(/insanSayiOku\(eski\[ozetToplamKaynagi\], 'fiyat'\)/);
    expect(sema).toMatch(/yeni\._sayiUyari = sayiUyarilari/);
  });

  it('SY-BAG backend diğer insan yolları: admin eski içe aktarma · işçilik · AI · override', () => {
    expect(oku(path.join(BE, 'kutuphane/admin/admin.service.ts'))).toMatch(/const fiyatG = insanSayiOku\(priceRaw, 'fiyat'\)/);
    expect(oku(path.join(BE, 'kutuphane/labor-firms/labor-firms.service.ts'))).toMatch(/const fiyatG = insanSayiOku\(unitPriceRaw, 'fiyat'\)/);
    expect(oku(path.join(BE, 'giris/ai/ai.service.ts'))).toMatch(/const g = insanSayiOku\(m\.unitPrice as unknown, 'fiyat'\)/);
    expect(oku(path.join(BE, 'cikti/quote-formats/format-engine.ts'))).toMatch(/insanSayiOku\(String\(v\)\.trim\(\), 'fiyat'\)/);
    expect(oku(path.join(BE, 'teklif/quotes/standart-cikti.ts'))).toMatch(/const sayi = \(v: unknown\): number => makineSayiOku\(v\) \?\? 0;/);
  });
});
