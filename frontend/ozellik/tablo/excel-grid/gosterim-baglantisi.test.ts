/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  IZGARA GÖSTERİM BAĞLANTISI — G2 · t.4 · t.5 · t.8 · t.14 (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NEDEN KAYNAK KAPISI: "mekanizma var, bağlantı yok" bu depoda TEKRAR EDEN bir
 * hata sınıfı (tek oturumda 6 kez ölçüldü). Saf kurallar `ozellik/fiyat/
 * gosterim-dili.test.ts`te kilitli; burası o kuralların ÇAĞRILDIĞINI ölçer.
 * AG Grid olayına ve React ağacına bağlı yollar jsdom olmadan koşulamıyor
 * (depoda jsdom/testing-library YOK — ölçüldü), bu yüzden bağlantı KAYNAKTA
 * sınanır: fonksiyon doğru ama dal onu çağırmıyorsa kapı kırmızı yanar.
 *
 * ⚠ Her `toMatch` deseni kodda BENZERSİZ olmalı (yorumda eşleşen desen mutasyon
 * sınamasını yalancı yeşil yapar) — desenler bu yüzden noktalama ve değişken
 * adlarıyla birlikte yazıldı.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const KOK = path.join(__dirname, '..', '..', '..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');

const grid = oku('ozellik/tablo/excel-grid/ExcelGrid.tsx');
const detay = oku('app/(protected)/quotes/[id]/page.tsx');
const yeni = oku('app/(protected)/quotes/new/page.tsx');
const kirinti = oku('ortak/kabuk/components/layout/Breadcrumb.tsx');

// ════════════════════════════════════════════════════════════════════════════
// t.4 — PARA SÜTUNU TABAN GENİŞLİĞİ IZGARAYA BAĞLI MI
// ════════════════════════════════════════════════════════════════════════════
describe('t.4 · para sütunu taban genişliği', () => {
  it('ExcelGrid genişlik kuralını IMPORT eder', () => {
    expect(grid).toMatch(/import \{ sutunGenisligi \} from '@\/ozellik\/fiyat\/para-sutun-genisligi';/);
  });

  it('HER kolonun genişliği tek kuraldan geçer — istenen + para tabanı + BAŞLIK tabanı', () => {
    expect(grid).toMatch(
      /width: sutunGenisligi\(columnWidths\?\.\[c\.field\] \?\? c\.width, c\.headerName, paraAlanlari\.has\(c\.field\)\),/,
    );
    // Eski hâlde başlık HİÇ hesaba girmiyordu; o ifadenin kalmadığını da ölç.
    expect(grid).not.toMatch(/width: columnWidths\?\.\[c\.field\] \?\? c\.width \?\? 120,/);
  });

  it('para alan kümesi ALTI para rolünü de kapsar (birim + toplam + genel)', () => {
    const blok = grid.match(/const paraAlanlari = new Set\([\s\S]{0,400}?\);/)?.[0] ?? '';
    expect(blok, 'paraAlanlari bulunamadı').not.toBe('');
    for (const rol of ['materialUnitPriceField', 'materialTotalField', 'laborUnitPriceField',
      'laborTotalField', 'grandUnitPriceField', 'grandTotalField']) {
      expect(blok, rol).toContain(rol);
    }
  });

  it('detay sayfası KAYITLI genişliği hâlâ uyguluyor (taban onu EZMEZ, yükseltir)', () => {
    expect(detay).toMatch(/const kayitliGenislikler: Record<string, number> = activeSheet\.columnConfig\?\.widths \?\? \{\};/);
    expect(detay).toMatch(/const temel = g \? \{ \.\.\.c, width: g \} : c;/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// t.5 — MİKTAR: EKRAN ≠ PANO
// ════════════════════════════════════════════════════════════════════════════
describe('t.5 · miktar gösterimi ve pano ayrımı', () => {
  it('miktar biçimlendiricisi GÖRÜNEN metni üretir (ayraçlı)', () => {
    expect(grid).toMatch(
      /base\.valueFormatter = \(p: any\) => \(p\.node\?\.rowPinned \? String\(p\.value \?\? ''\) : miktarGosterimMetni\(p\.value\)\);/,
    );
  });

  it('pano okuyucusu miktar kolonunda biçimlendiriciyi ATLAR', () => {
    expect(grid).toMatch(
      /if \(field && field === quantityFieldRef\.current\) \{\s*return hucreGosterimMetni\(api\.getCellValue\(\{ rowNode: n, colKey: field \}\) \?\? ''\);\s*\}/,
    );
    // Diğer kolonlar AG Grid'in kendi biçimlendiricisinden okunmaya devam eder.
    expect(grid).toMatch(/return api\.getCellValue\(\{ rowNode: n, colKey: field, useFormatter: true \}\) \?\? '';/);
  });

  it('quantityFieldRef gerçekten miktar rolünden besleniyor', () => {
    expect(grid).toMatch(/quantityFieldRef\.current = data\?\.columnRoles\?\.quantityField;/);
  });

  it('GİRDİ yolları dokunulmadı: valueParser hâlâ insan kuralından geçiyor', () => {
    expect(grid).toMatch(/if \(sayiKolonTuru\) base\.valueParser = sayiHucreParser\(sayiKolonTuru, bekleyenSayiUyarisiRef\);/);
  });

  it('para biçimlendiricisi TEK TR sayı dilinden geçiyor', () => {
    const pricing = oku('ozellik/fiyat/pricing.ts');
    expect(pricing).toMatch(/return trSayi\(vTRY \* conversionRate, hane, hane\);/);
    expect(pricing).not.toMatch(/\(vTRY \* conversionRate\)\.toLocaleString/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// t.8 — KIRINTI YOLUNDA HAM UUID YOK
// ════════════════════════════════════════════════════════════════════════════
describe('t.8 · teklif numarası / UUID', () => {
  it('kırıntı, adres parçası için defterdeki etiketi ÖNCE okur', () => {
    expect(kirinti).toMatch(/import \{ useKirintiEtiketleri \} from '\.\/kirinti-etiketi';/);
    expect(kirinti).toMatch(/const etiketler = useKirintiEtiketleri\(\);/);
    expect(kirinti).toMatch(/let label = etiketler\[seg\] \?\? LABEL_MAP\[seg\] \?\? decodeURIComponent\(seg\);/);
  });

  it('detay sayfası etiketi yazar: numara, YOKSA başlık', () => {
    expect(detay).toMatch(/useKirintiEtiketi\(id, quote \? \(quote\.quoteNo\?\.trim\(\) \|\| quote\.title\) : null\);/);
  });

  it('geriye dönük numara VERİLMEZ — sayfa numara üretmez', () => {
    // `MP-` deseni yalnız backend'de doğar (quotes.service exportXlsx).
    expect(detay).not.toMatch(/MP-\$\{/);
    expect(detay).not.toMatch(/'MP-/);
  });

  it('adres çubuğundaki kimlik DEĞİŞMEZ (bu bir gösterim işi)', () => {
    // Kırıntı hâlâ yolu parçalardan kurar; etiket yalnız METNİ değiştirir.
    expect(kirinti).toMatch(/const href = '\/' \+ segments\.slice\(0, i \+ 1\)\.join\('\/'\);/);
  });

  it('başlıkta numara rozeti var ve yoksa yer tutucu basılmıyor', () => {
    expect(detay).toMatch(/\{quote\.quoteNo \? \(/);
    expect(detay).toMatch(/\) : null\}/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// t.14 — IZGARA GİRDİSİNİN KİMLİĞİ
// ════════════════════════════════════════════════════════════════════════════
describe('t.14 · columnDefs memo bağımlılıkları', () => {
  it('memo bağımlılığı `data` NESNESİ değil, okuduğu iki alan', () => {
    expect(grid).toMatch(
      /\}, \[data\?\.columnDefs, data\?\.columnRoles, brands, onBrandChange, laborFirms, sheetDiscipline, laborEnabled, onFirmaChange, mode, libraryPriceField, currencySymbol, conversionRate,/,
    );
  });

  it('memo gövdesi GERÇEKTEN yalnız bu iki alanı okuyor (bağımlılık eksiği yok)', () => {
    // `params.data` (satır verisi) ayrı bir şeydir; ölçüt `data.` ile BAŞLAYAN
    // erişimlerdir. Yeni bir alan okunursa bağımlılığa eklenmeli — bu assert
    // onu yakalar.
    const bas = grid.indexOf('const columnDefs = useMemo<ColDef<ExcelRowData>[]>');
    // ⚠ Dilim memo GÖVDESİNDE biter: bağımlılık dizisi dâhil edilseydi
    // ölçüt DAİRESEL olurdu (aranan adları dizinin kendisi sağlardı).
    const son = grid.indexOf('return cols;', bas);
    expect(bas, 'columnDefs memo bulunamadı').toBeGreaterThan(0);
    const govde = grid.slice(bas, son);
    // Onunde NOKTA ya da harf olan `data.` satir verisidir (`p.data.`,
    // `params.data.`); prop olan `data` yalin durur.
    // ⚠ Set yayılımı (`[...set]`) bu tsconfig hedefinde derlenmiyor (TS2802,
    // downlevelIteration kapalı) — ExcelGrid.tsx'teki aynı not.
    const alanlar = new Set((govde.match(/(?<![.\w])data\.[A-Za-z_]+/g) ?? []).map((m) => m.slice(5)));
    expect(Array.from(alanlar).sort()).toEqual(['columnDefs', 'columnRoles']);
  });

  it('detay sayfası ızgara girdisini render gövdesinde KURMUYOR', () => {
    expect(detay).toMatch(/const gridData: ExcelGridData \| null = useMemo\(\(\) => \{/);
    expect(detay).toMatch(/\}, \[activeSheet, allBrands\]\);/);
    expect(detay).toMatch(/const sheets = useMemo\(/);
  });

  it('salt-okunur marka geri çağırımı MODÜL düzeyinde (satır içi ok fonksiyonu yok)', () => {
    expect(detay).toMatch(/^const SALT_OKUNUR_MARKA = async \(\): Promise<null> => null;$/m);
    expect(detay).toMatch(/onBrandChange=\{SALT_OKUNUR_MARKA\}/);
    expect(detay).not.toMatch(/onBrandChange=\{async \(\) => null\}/);
  });

  it('ceviriKalemi memoize edilmiş (ad kolonu her render zorla yeniden çizilmiyor)', () => {
    expect(detay).toMatch(/const ceviriKalemi = useMemo\(\(\) => \(/);
    expect(detay).toMatch(/\), \[ceviriDili, duzeltmeGorunumu, activeSheet\]\);/);
    // Tüketici taraf: etkinin bağımlılığı hâlâ ceviriKalemi (bağlantı duruyor)
    expect(grid).toMatch(/\}, \[ceviriKalemi, data\.columnRoles\.nameField\]\);/);
  });
});

/**
 * t.14 SAYIM — React'ın `useMemo` kuralı (bağımlılıkların `Object.is`
 * karşılaştırması) uygulanarak, teklif detayının AÇILIŞ RENDER DİZİSİ üzerinde
 * columnDefs gövdesinin kaç kez kurulduğu sayılır.
 *
 * ⚠ BU BİR TARAYICI ÖLÇÜMÜ DEĞİLDİR. Gerçek sayım denendi ve YAPILAMADI:
 * `next dev` bu kumda 127.0.0.1'e `listen`/`connect` edemiyor (ENOBUFS) —
 * raporun "Ölçemediklerim" başlığında duruyor. Burada ölçülen şey, kuralın
 * kendisi: bağımlılık kimliği her render değişiyorsa memo her render kurulur.
 */
describe('t.14 · kurulum sayısı (useMemo kuralı uygulanarak)', () => {
  /** React'ın bağımlılık karşılaştırması. */
  function memoSayaci(bagimliliklar: unknown[][]): number {
    let onceki: unknown[] | null = null;
    let kurulum = 0;
    for (const d of bagimliliklar) {
      if (onceki === null || onceki.length !== d.length || d.some((v, i) => !Object.is(v, onceki![i]))) {
        kurulum++;
      }
      onceki = d;
    }
    return kurulum;
  }

  // Teklifin kayıtlı sayfası — açılış boyunca DEĞİŞMEZ (aynı nesne, state'ten).
  const activeSheet = { columnDefs: [{ field: '_matBirim' }], columnRoles: { quantityField: '_miktar' } };
  const allBrands: unknown[] = [];
  /** ExcelGrid'e giden `gridData` — ESKİ biçim: render gövdesinde kurulur. */
  const eskiGridData = () => ({
    columnDefs: activeSheet.columnDefs.map((c) => ({ ...c })), // .map her render YENİ dizi
    columnRoles: activeSheet.columnRoles,
    brands: allBrands,
  });
  /** YENİ biçim: useMemo — girdiler değişmedikçe AYNI nesne. */
  const yeniGridDataSabit = eskiGridData();

  // Açılış render dizisi: 8 render (ilk çizim + yükleme sırasında gelen
  // state güncellemeleri: quote · currency · activeSheetIndex · brands ·
  // laborFirms · kapak+durum · çeviri görünümü).
  const RENDER = 8;

  it('ESKİ biçim: her render yeni kimlik → memo HER render kurulur', () => {
    const eskiOnBrandChange = () => async () => null; // satır içi ok fonksiyonu
    const diziler = Array.from({ length: RENDER }, () => {
      const g = eskiGridData();
      return [g, allBrands, eskiOnBrandChange()];
    });
    expect(memoSayaci(diziler)).toBe(RENDER);
  });

  it('YENİ biçim: kimlikler sabit → memo BİR kez kurulur', () => {
    const SALT_OKUNUR_MARKA = async () => null; // modül düzeyi sabit
    const diziler = Array.from({ length: RENDER }, () => [
      yeniGridDataSabit.columnDefs, yeniGridDataSabit.columnRoles, allBrands, SALT_OKUNUR_MARKA,
    ]);
    expect(memoSayaci(diziler)).toBe(1);
  });

  it('DARALTMA TEK BAŞINA YETMEZDİ — gridData memoize edilmeseydi 8 kalırdı', () => {
    // Çürütücü: `data.columnDefs` de her render YENİ dizi olurdu (`.map`),
    // yani yalnız bağımlılığı daraltmak kusuru KAPATMAZDI. İki değişiklik de
    // gerekli; bu assert onlardan birini kaldıran bir mutasyonu yakalar.
    const SALT_OKUNUR_MARKA = async () => null;
    const diziler = Array.from({ length: RENDER }, () => {
      const g = eskiGridData();
      return [g.columnDefs, g.columnRoles, allBrands, SALT_OKUNUR_MARKA];
    });
    expect(memoSayaci(diziler)).toBe(RENDER);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// t.4/2.4 — DÜŞMÜŞ TÜRKÇE
// ════════════════════════════════════════════════════════════════════════════
describe('2.4 · ızgaraya yazılan Türkçe', () => {
  it('DWG metrajı grid satırına "Belirtilmemiş" yazar (ASCII s DEĞİL)', () => {
    expect(yeni).toMatch(/const malzemeCap = seg\.diameter \|\| 'Belirtilmemiş';/);
    expect(yeni).toMatch(/add\(hatSistem, 'Belirtilmemiş', 'm', layer\.length \|\| 0\);/);
    expect(yeni).not.toMatch(/'Belirtilmemis'/);
  });

  it('teklif ekranlarındaki kullanıcı metinlerinde karaktersiz yazım kalmadı', () => {
    const KARAKTERSIZ = [
      'Eslestirme', 'eslesmedi', 'Eslesmedi', 'Eslesti', 'basarisiz', 'yuklenemedi',
      'alinamadi', 'Iscilik', 'yukleyin', 'secin', 'Duzenle', 'onaylandi', 'tamamlandi',
      'gorunmuyor', 'bulunamadi', 'olustu', 'goruntulecek', 'fiyati 0',
    ];
    const desen = new RegExp(`['\`"][^'\`"\\n]*(?<![\\\\p{L}])(?:${KARAKTERSIZ.join('|')})(?![\\\\p{L}])`, 'u');
    for (const [ad, kaynak] of [['quotes/new', yeni], ['quotes/[id]', detay]] as const) {
      const satirlar = kaynak.split('\n')
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => {
          const t = l.trim();
          // Yorum ve `console.*` gunlugu ekrana gitmez — kod sayilir.
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
          if (/console\.(log|warn|error|info|debug)\(/.test(l)) return false;
          return desen.test(l);
        });
      expect(satirlar.map(([n, l]) => `${ad}:${n} ${l.trim().slice(0, 90)}`)).toEqual([]);
    }
  });
});
