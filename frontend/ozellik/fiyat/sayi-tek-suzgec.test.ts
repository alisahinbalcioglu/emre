/**
 * SAYI TEK SÜZGEÇ — kaynak taraması kapısı (A2, tur 3 — 14.09.2026)
 *
 * `kar-tek-suzgec.test.ts` deseni. Kâr kapısı "kâr alanı süzgeçsiz okunmaz"
 * diyordu; bu kapı FİYAT/MİKTAR hücresine giden her yol için aynı cümleyi kurar.
 *
 * ── NEDEN (ölçüldü, tur3/a2/RAPOR.md) ────────────────────────────────────────
 * Hayalet sayı ve belirsiz "1.250" tek bir fonksiyonda değildi; ham `parseFloat`
 * / `Number` kopyaları ONLARCA yerdeydi ve her biri kendi sınıfını üretiyordu:
 *   parseFloat("35x240mm Üç bölmeli döşeme kanalı") = 35   (hayalet fiyat)
 *   parseFloat("1.234,5".replace(',', '.'))          = 1.234 (bin kat düşük)
 *   Number("12,5")                                   = NaN   (form reddediyor)
 * Tek kural (`sayi-alani.ts`: `sayiOku` makine · `insanSayiOku` insan) ancak
 * yeni bir ham kopya doğmadıkça tektir. Bu kapı o kopyanın doğduğu satırı yakalar.
 *
 * KURAL: kapsamdaki bir KOD satırı
 *  (R1) `parseFloat(` içeremez — sistem sayı alanı (`_matNetPrice`…) ya da aynı
 *       satırda saf-sayı ön kapısı (`/^-?[0-9.,]+$/.test`) yoksa;
 *  (R2) `Number(<fiyat/miktar/iskonto/kâr adı taşıyan ifade>)` içeremez.
 * Bilinen istisnalar AÇIK listededir (dosya + birebir parça + gerekçe); listede
 * olup kodda artık bulunmayan istisna da KIRMIZIDIR (liste bayatlamaz).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

type Kural = 'parseFloat' | 'number';

const FE = path.resolve(__dirname, '../..');
const BE = path.resolve(FE, '../backend/src/ozellik');
const TUM: Kural[] = ['parseFloat', 'number'];

/** Kapsam — yolları SABİT: dosya taşınırsa kapı "bulunamadı" ile kırmızı yanar. */
const KAPSAM: Array<{ kok: string; dosya: string; kurallar: Kural[] }> = [
  { kok: FE, dosya: 'ozellik/tablo/excel-grid/ExcelGrid.tsx', kurallar: TUM },
  { kok: FE, dosya: 'ozellik/tablo/excel-grid/fill-down.ts', kurallar: ['parseFloat'] },
  { kok: FE, dosya: 'ozellik/teklif/restore-rematch.ts', kurallar: ['parseFloat'] },
  { kok: FE, dosya: 'ozellik/tablo/merge-multisheet.ts', kurallar: TUM },
  { kok: FE, dosya: 'ozellik/fiyat/pricing.ts', kurallar: TUM },
  { kok: FE, dosya: 'ozellik/teklif/teklif-kalem.ts', kurallar: TUM },
  { kok: FE, dosya: 'ozellik/tablo/excel-grid/discount-utils.ts', kurallar: TUM },
  { kok: FE, dosya: 'ozellik/tablo/excel-grid/yapistir.ts', kurallar: TUM },
  { kok: FE, dosya: 'app/(protected)/library/brand/[brandId]/page.tsx', kurallar: TUM },
  { kok: FE, dosya: 'app/(protected)/labor-firms/[firmaId]/page.tsx', kurallar: TUM },
  { kok: FE, dosya: 'ozellik/kutuphane/library/ManualBrandModal.tsx', kurallar: TUM },
  { kok: FE, dosya: 'ozellik/kutuphane/library/InlineFirmEntry.tsx', kurallar: TUM },
  { kok: FE, dosya: 'app/(protected)/library/page.tsx', kurallar: TUM },
  { kok: FE, dosya: 'app/admin/brands/page.tsx', kurallar: TUM },
  { kok: FE, dosya: 'app/(protected)/labor/page.tsx', kurallar: TUM },
  { kok: FE, dosya: 'app/(protected)/library/electrical-brands/page.tsx', kurallar: TUM },
  { kok: FE, dosya: 'components/dwg-metraj/MetrajEditor.tsx', kurallar: TUM },
  { kok: FE, dosya: 'lib/metraj-excel.ts', kurallar: TUM },
  { kok: BE, dosya: 'giris/excel-grid/excel-grid.service.ts', kurallar: ['parseFloat'] },
  { kok: BE, dosya: 'giris/excel-grid/standart-sema.ts', kurallar: ['parseFloat'] },
  { kok: BE, dosya: 'kutuphane/labor-firms/labor-firms.service.ts', kurallar: ['parseFloat'] },
  { kok: BE, dosya: 'giris/ai/ai.service.ts', kurallar: ['parseFloat'] },
  { kok: BE, dosya: 'cikti/quote-formats/format-engine.ts', kurallar: ['parseFloat'] },
  { kok: BE, dosya: 'teklif/quotes/standart-cikti.ts', kurallar: ['parseFloat'] },
  { kok: BE, dosya: 'teklif/quotes/export-engine.ts', kurallar: ['parseFloat'] },
];

/** Bilinen istisnalar — AÇIK liste. `parca` satırda BİREBİR geçer. */
const ISTISNALAR: Array<{ dosya: string; parca: string; gerekce: string }> = [
  // Tur 3 birlesiminde (A2 + A4a/A4b) ana oturum bolgelerindeki 7 ham okuyucu
  // `sayiOku`ya devredildi (recalcGrand birim + toplam, KAR bicimlendiricisi,
  // fill-down ve restore-rematch Genel Toplam tazelemesi) — istisnalari silindi.
  // ── Para/miktar DEĞİL ya da API sayısı
  // 22.09.2026 — `library/page.tsx` istisnası SİLİNDİ: sayfa artık veri
  // göstermiyor, üç karta yönlendiriyor. Çap sıralama anahtarı da dahil tüm
  // okuyucular ölü koddu (render bloğuna bağlı değildi) ve kaldırıldı.
  // ⚠ Sayfa KAPSAM listesinde KALIYOR: yeniden ham okuyucu eklenirse kapı yansın.
  { dosya: 'app/(protected)/library/electrical-brands/page.tsx', parca: 'unitPrice: Number(m.unitPrice ?? m.price ?? 0),', gerekce: 'API JSON sayısı — AI fiyatı backend `insanSayiOku`dan geçti' },
  { dosya: 'ozellik/fiyat/pricing.ts', parca: 'const k = Number(oncekiKar);', gerekce: 'maliyetiGeriTuret argümanı — çağıranlar `sayiAlani` ile okur' },
];

/** Her zaman JS SAYISI yazılan sistem alanları (hücre metni değil). */
const SISTEM_SAYI = /_(?:matNetPrice|labNetPrice|draftDiscount|libraryDiscountRate|laborDiscountRate)\b/;
/** Aynı satırda saf-sayı ön kapısı (içe aktarma rol tespiti, `sayisalOran`). */
const ON_KAPI = /\/\^-\?\[0-9\.,\]\+\$\/\.test\(/;
/** R2: `Number(...)` argümanında fiyat/miktar anlamı taşıyan ad. */
const SAYI_ADI = /[Pp]rice|[Ff]iyat|[Qq]ty|[Mm]iktar|[Dd]iscount|[Ii]skonto|[Rr]ate\b|[Kk]ar\b|Value\b|[Tt]utar|[Tt]oplam/;

function kodSatirlari(icerik: string): Array<{ no: number; metin: string }> {
  return icerik.split(/\r?\n/)
    .map((metin, i) => ({ no: i + 1, metin: metin.trim() }))
    // Yorum KOD DEĞİLDİR: bu dosyalar eski ham okumayı yorumda ANLATIYOR.
    .filter(({ metin }) => !(metin.startsWith('//') || metin.startsWith('*') || metin.startsWith('/*') || metin.startsWith('{/*')));
}

/** Bir kod satırı hangi kuralı ihlal ediyor? (tek yer — test ile ölçüt aynı) */
function ihlal(metin: string, kurallar: Kural[]): Kural | null {
  const kod = metin.replace(/\/\/.*$/, '');
  if (kurallar.includes('parseFloat') && /\bparseFloat\s*\(/.test(kod) && !SISTEM_SAYI.test(kod) && !ON_KAPI.test(kod)) return 'parseFloat';
  if (kurallar.includes('number')) {
    for (const m of Array.from(kod.matchAll(/\bNumber\s*\(([^)]*)\)/g))) {
      if (SAYI_ADI.test(m[1]) && !SISTEM_SAYI.test(m[1])) return 'number';
    }
  }
  return null;
}

describe('SAYI TEK SÜZGEÇ — kaynak taraması', () => {
  it('ST-A kapsam dosyaları GERÇEKTEN okunabiliyor (boş-küme kapısı)', () => {
    expect(KAPSAM.length).toBeGreaterThanOrEqual(25);
    for (const k of KAPSAM) {
      const y = path.join(k.kok, k.dosya);
      expect(fs.existsSync(y), `${k.dosya} bulunamadı — kapı kapsamını kaybetmiş olabilir`).toBe(true);
      expect(fs.readFileSync(y, 'utf8').length).toBeGreaterThan(300);
    }
  });

  it('ST-B fiyat/miktar okuyan her kod satırı ortak süzgeçten geçiyor (istisnalar hariç)', () => {
    const ihlaller: string[] = [];
    for (const k of KAPSAM) {
      const ist = ISTISNALAR.filter((i) => i.dosya === k.dosya);
      for (const { no, metin } of kodSatirlari(fs.readFileSync(path.join(k.kok, k.dosya), 'utf8'))) {
        const r = ihlal(metin, k.kurallar);
        if (r && !ist.some((i) => metin.includes(i.parca))) ihlaller.push(`${k.dosya}:${no} [${r}] ${metin.slice(0, 110)}`);
      }
    }
    expect(ihlaller, 'Ham sayı okuması — `sayiOku` (makine) / `insanSayiOku`·`hucreGirdisiCoz`·`formSayisiOku` (insan) kullanın:\n' + ihlaller.join('\n')).toEqual([]);
  });

  it('ST-C istisna listesi BAYAT değil: her istisna kodda hâlâ var ve gerçekten kuralı ihlal ediyor', () => {
    const bayat: string[] = [];
    for (const i of ISTISNALAR) {
      const k = KAPSAM.find((x) => x.dosya === i.dosya);
      if (!k) { bayat.push(`${i.dosya}: kapsamda değil`); continue; }
      const satir = kodSatirlari(fs.readFileSync(path.join(k.kok, k.dosya), 'utf8')).find((s) => s.metin.includes(i.parca));
      if (!satir) bayat.push(`${i.dosya}: "${i.parca}" kodda YOK — istisnayı listeden silin (${i.gerekce})`);
      else if (!ihlal(satir.metin, k.kurallar)) bayat.push(`${i.dosya}: "${i.parca}" artık kuralı ihlal etmiyor — istisnayı silin`);
    }
    expect(bayat, bayat.join('\n')).toEqual([]);
  });

  it('ST-D ÖLÇÜTÜN KENDİSİ: eae583e\'deki GERÇEK ham satırları yakalar (RAPOR §5.9)', () => {
    // Dairesel ölçüt yasağı: "ihlal yok" yeşili ancak desenin bu satırları
    // YAKALADIĞI kanıtlanırsa anlamlıdır. Hepsi taban commit'teki birebir satırlar.
    const YAKALANMALI: Array<[string, Kural[]]> = [
      ["const listPrice = parseFloat(String(row[priceField ?? ''] ?? '')) || 0;", TUM],                               // ExcelGrid.tsx:3529
      ["for (const f of floorFields) sum += parseFloat(String(row[f] ?? '').replace(',', '.')) || 0;", TUM],       // :3630
      ["? parseFloat(String(row[materialUnitPriceField] ?? '')) || 0", TUM],                                          // :3682
      [": maliyetiGeriTuret(parseFloat(String(row[materialUnitPriceField] ?? '')) || 0, oncekiKar);", TUM],        // :3724
      ["const enteredPrice = parseFloat(String(e.newValue ?? '').replace(',', '.')) || 0;", TUM],                   // :3808
      ["if (prevVal !== '' && parseFloat(prevVal.replace(',', '.')) !== 0) {", TUM],                                 // merge-multisheet.ts:95
      ["const v = parseFloat(String((node.data as Record<string, unknown>)[alan] ?? '').replace(',', '.'));", ['parseFloat']], // fill-down.ts:102
      ["const v = parseFloat(String(row[alan] ?? '').replace(',', '.'));", ['parseFloat']],                         // restore-rematch.ts:199
      [": parseFloat(String(unitPriceRaw ?? '').replace(',', '.'));", ['parseFloat']],                               // labor-firms.service.ts:674
      ['const price = parseFloat(priceStr);', ['parseFloat']],                                                        // ai.service.ts:858
      ['const n = parseFloat(s);', ['parseFloat']],                                                                   // standart-cikti.ts:77
      ["const qtyNum = roleFields.quantityField ? parseFloat(String(row[roleFields.quantityField] ?? '').replace(',', '.')) : NaN;", ['parseFloat']], // excel-grid.service.ts:535
      ['const discount = discountRate ? Number(discountRate) : undefined;', TUM],                                   // library/page.tsx:292
      ["const newVal = editingPriceValue.trim() === '' ? null : Number(editingPriceValue);", TUM],                  // library/page.tsx:508
      ["const price = parseFloat(matPrice.replace(',', '.'));", TUM],                                                 // admin/brands/page.tsx:402
      ['const payload = { ...form, unitPrice: parseFloat(form.unitPrice) };', TUM],                                  // labor/page.tsx:115
      ["totalLength: groupRows.reduce((sum, r) => sum + (parseFloat(r.qty) || 0), 0),", TUM],                        // MetrajEditor.tsx:90
    ];
    const kacan = YAKALANMALI.filter(([s, k]) => ihlal(s, k) === null).map(([s]) => s);
    expect(kacan, 'desen bu gerçek satırları KAÇIRIYOR:\n' + kacan.join('\n')).toEqual([]);
  });

  it('ST-E yanlış pozitif yok: sistem sayı alanı, ön kapı, yorum ve sayı-adı taşımayan Number serbest', () => {
    const SERBEST: Array<[string, Kural[]]> = [
      ["if ((parseFloat(String(d._matNetPrice ?? 0)) || 0) > 0) return;", TUM],
      ["if (/^-?[0-9.,]+$/.test(s) && !isNaN(parseFloat(s.replace(',', '.')))) sayi++;", ['parseFloat']],
      ["if (Number(d._draftDiscount ?? 0) === v && d._dirty) continue;", TUM],
      ['const c1 = kolonNo(m[3]); const r1 = Number(m[4]);', TUM],
      ['const listPrice = sayiOku(row[priceField ?? \'\']) ?? 0;', TUM],
    ];
    const yanlis = SERBEST.filter(([s, k]) => ihlal(s, k) !== null).map(([s]) => s);
    expect(yanlis, 'yanlış pozitif:\n' + yanlis.join('\n')).toEqual([]);
    expect(kodSatirlari('// parseFloat(x)\n * Number(price)\nconst a = 1;').map((s) => s.metin)).toEqual(['const a = 1;']);
  });
});
