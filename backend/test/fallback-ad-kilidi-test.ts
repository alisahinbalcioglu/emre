/**
 * IS 2-A — FALLBACK AD-KILIDI  (`npx ts-node test/is2a-fallback-ad-kilidi-test.ts`)
 *
 * ── OLCULEN URUN DAVRANISI ───────────────────────────────────────────────
 * Kullanici ÇAYIROVA kutuphanesinde `2" Siyah Boru` yaziyor. Kutuphanede
 * `Su ve Yangın Tesisat Borusu 2" DN50 ... - Siyah Düz Uçlu` GERCEKTEN VAR
 * (₺198,38) ama motor "Bu markada 2\" yok" diyor. Yani var olan urun
 * bulunamiyor — kullaniciya YANLIS BILGI veriliyor (I7 sessiz-bos yasagi).
 *
 * ── KOK (dosya:satir ile) ────────────────────────────────────────────────
 * Bu markanin 116 kutuphane satirinin TAMAMI productIndexId=NULL (bagsiz).
 * Motor istek aninda matching.service.ts:161 `manuelUrunIndeksle` fallback'ini
 * kullanir. Oradaki soyma dongusu (matching.service.ts:256-265):
 *     while (parcalar.length > 1) { son kelime CINS_K'daysa pop;
 *                                   BAGLANTI_K'daysa pop; else break; }
 * YALNIZ ADIN SONUNDAN soyar. Iki adlandirma ailesi var:
 *   A) "... - Siyah Düz Uçlu"                 → kuyruk soyulur  → cins/baglanti DOLU
 *   B) "... Siyah Düz Uçlu ... Et 2.5mm"      → son kelime 'et' → dongu ILK ADIMDA
 *                                               kirilir → cinsTokens=[] baglantiTokens=[]
 * B ailesinde 'siyah'/'duz'/'uclu' AD token'i olur → vocab.ad'e girer →
 * line-parser.ts:184 AD>CINS onceligiyle SORGUDAKI kelime de AD KISITI sayilir →
 * havuz B ailesine kilitlenir. B ailesinde DN50 YOKTUR → cap-yok.
 *
 * ── HAVUZ ────────────────────────────────────────────────────────────────
 * Satir adlari ve fiyatlar CANLI DB'den (brand 3ba57a23…, 116 satir) birebir
 * alinmistir; kisaltilmis ama uydurulmamis bir alt kumedir. Satirlar BAGSIZ
 * kurulur (productIndexId yok) — yani `manuelUrunIndeksle` yolundan gecerler.
 *
 * ── KRITERLER (her biri AYRI assert — bir assert tek kritere) ────────────
 *   G0 — havuz gercekten yol-3'ten (manuelUrunIndeksle) geciyor mu?  [OLCUT]
 *   G1 — havuz BOS DEGIL: dn50 tasiyan satir sayisi > 0              [OLCUT]
 *   G2 — KONTROL: kisitsiz `2" Boru` bugun eslesiyor mu?             [OLCUT]
 *   R1 — `2" Siyah Boru`    → sonuc 'none' OLMAMALI   (yuzey kelimesi)
 *   R2 — `2" Düz Uçlu Boru` → sonuc 'none' OLMAMALI   (IKINCI AILE: yuzey
 *        DEGIL, baglanti tanimlayicisi — fix yuzeye ozel olamaz)
 *
 * G0/G1/G2 YESIL + R1/R2 KIRMIZI beklenir. G0/G1/G2'den biri kirmiziysa
 * OLCUT bozuktur, urun degil — once olcut onarilir (kural 6).
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';

let passed = 0;
const failures: string[] = [];
const check = (ad: string, kosul: boolean, detay?: string) => {
  if (kosul) { passed++; console.log(`  ✅ ${ad}${detay ? ` — ${detay}` : ''}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  ❌ FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
};

/** BAGSIZ kutuphane satiri: productIndexId/product YOK → hazirlaPool yol-3. */
const bagsiz = (name: string, listPrice: number) => ({
  id: `lib-${name}`,
  material: null,
  materialName: name,
  productIndexId: null,
  product: null,
  listPrice,
  customPrice: null,
  discountRate: 0,
  currency: 'TRY',
  cap: null,
  unit: 'Metre',
});

// ── AILE A: kuyruk soyulabilen adlandirma ("... - Siyah Düz Uçlu") ────────
//    HEDEF SATIRLAR BURADA: 2" DN50.
const AILE_A = [
  bagsiz('Su ve Yangın Tesisat Borusu 1" DN25 Dış Cap 33.7mm Et 3.2mm - Siyah Dişli Manşonlu', 105.86),
  bagsiz('Su ve Yangın Tesisat Borusu 1" DN25 Dış Cap 33.7mm Et 3.2mm - Siyah Düz Uçlu', 96.04),
  bagsiz('Su ve Yangın Tesisat Borusu 1" DN25 Dış Cap 33.7mm Et 3.2mm - Kırmızı Boyalı', 101.42),
  bagsiz('Su ve Yangın Tesisat Borusu 2" DN50 Dış Cap 60.3mm Et 3.6mm - Galvanizli Dişli Manşonlu', 291.12),
  bagsiz('Su ve Yangın Tesisat Borusu 2" DN50 Dış Cap 60.3mm Et 3.6mm - Galvanizli Düz Uçlu', 271.42),
  bagsiz('Su ve Yangın Tesisat Borusu 2" DN50 Dış Cap 60.3mm Et 3.6mm - Siyah Dişli Manşonlu', 227.09),
  bagsiz('Su ve Yangın Tesisat Borusu 2" DN50 Dış Cap 60.3mm Et 3.6mm - Siyah Düz Uçlu', 198.38),
  bagsiz('Su ve Yangın Tesisat Borusu 2" DN50 Dış Cap 60.3mm Et 3.6mm - Kırmızı Boyalı', 209.25),
];

// ── AILE B: son kelime 'Et' → soyma dongusu ILK ADIMDA kirilir ────────────
//    'siyah'/'duz'/'uclu' AD token'i olur. Bu ailede 2"/DN50 YOKTUR.
const AILE_B = [
  bagsiz('Basınçlı Boru Siyah Düz Uçlu TS EN 10217-1 P235TR1 1/2" Dış Cap 21.3mm Et 2.0mm', 41.2),
  bagsiz('Basınçlı Boru Siyah Düz Uçlu TS EN 10217-1 P235TR1 3/4" Dış Cap 26.9mm Et 2.5mm', 64.73),
  bagsiz('Basınçlı Boru Siyah Düz Uçlu TS EN 10217-1 P235TR1 1" Dış Cap 33.7mm Et 2.5mm', 79.62),
  bagsiz('Basınçlı Boru Siyah Düz Uçlu TS EN 10217-1 P235TR1 1" Dış Cap 33.7mm Et 3.0mm', 88.76),
  bagsiz('Basınçlı Boru Siyah Düz Uçlu TS EN 10217-1 P235TR1 1 1/4" Dış Cap 42.4mm Et 3.0mm', 114.41),
  bagsiz('Basınçlı Boru Siyah Düz Uçlu TS EN 10217-1 P235TR1 1 1/2" Dış Cap 48.3mm Et 4.0mm', 165.98),
];

const HAVUZ = [...AILE_A, ...AILE_B];

function makeService(libRows: any[]): MatchingService {
  const prisma: any = {
    userLibrary: {
      findMany: async (a: any) =>
        (a?.where?.brandId && typeof a.where.brandId === 'object' && 'not' in a.where.brandId ? [] : libRows),
    },
    brand: { findUnique: async () => ({ name: 'ÇAYIROVA' }) },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => undefined },
    terminologyAlias: {
      findMany: async () => ALIAS_SEEDS.map((s, i) => ({ id: `a${i}`, userId: null, active: true, ...s })),
    },
  };
  const fakeFx = {
    getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }),
  } as any;
  return new MatchingService(prisma, new TerminologyService(prisma), fakeFx);
}

/** Konsolu yakala — G0 olcutu hangi KANALDAN konusuldugunu okur. */
async function konusmaYakala<T>(fn: () => Promise<T>): Promise<{ sonuc: T; hepsi: string }> {
  const yakalanan: string[] = [];
  const y = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...a: any[]) => { yakalanan.push(a.join(' ')); };
  console.warn = (...a: any[]) => { yakalanan.push(a.join(' ')); };
  console.error = (...a: any[]) => { yakalanan.push(a.join(' ')); };
  try {
    const sonuc = await fn();
    return { sonuc, hepsi: yakalanan.join('\n') };
  } finally { console.log = y.log; console.warn = y.warn; console.error = y.error; }
}

async function sessizEslestir(svc: MatchingService, sorgu: string) {
  const { sonuc } = await konusmaYakala(() => svc.bulkMatch('u1', 'brand-cayirova', [sorgu]));
  return (sonuc as any)[sorgu];
}

async function main() {
  console.log('── IS 2-A: FALLBACK AD-KILIDI (KIRMIZI KANIT) ──');
  const svc = makeService(HAVUZ);

  // ── G0 (OLCUT): havuz gercekten manuelUrunIndeksle yolundan mi geciyor? ──
  // Bagli havuz kurulmus olsaydi bambaska bir yolu olcuyor olurduk.
  // hazirlaPool indekssiz satirlari YUKSEK SESLE duyurur (PK9 sozlesmesi).
  {
    const { hepsi } = await konusmaYakala(() => svc.bulkMatch('u1', 'brand-cayirova', ['2" Boru']));
    check('G0 ÖLÇÜT — havuz yol-3 (manuelUrunIndeksle) üzerinden indeksleniyor',
      /INDEKSSIZ SATIR: 14\/14/.test(hepsi),
      `konuşma: ${JSON.stringify(hepsi.split('\n').filter((s) => /INDEKSSIZ|INDEKSLENMEMIS/.test(s)))}`);
  }

  // ── G1 (OLCUT / BOS KUME KAPISI): havuzda dn50 tasiyan satir VAR MI? ──
  // Sayim/filtre uzerinden assert edecegiz; girdinin bos OLMADIGI ayri
  // kanitlanmali. Olcum URETIM indeksleyicisinin ciktisindan yapilir.
  {
    const { sonuc: pool } = await konusmaYakala(async () => (svc as any).hazirlaPool(HAVUZ as any[]) as any[]);
    const dn50 = pool.filter((r) => r.urun.capTags.includes('dn50'));
    check('G1 ÖLÇÜT — havuz boş değil: dn50 taşıyan satır sayısı > 0',
      dn50.length > 0,
      `pool=${pool.length} dn50=${dn50.length} → ${JSON.stringify(dn50.map((r) => r.urun.ad.slice(0, 60)))}`);
  }

  // ── G2 (OLCUT / KONTROL): kisitsiz sorgu bugun eslesiyor mu? ──
  // Eslesmiyorsa hata cap/aile katmanindadir, ad-kilidinde degil → olcut bozuk.
  {
    const r = await sessizEslestir(svc, '2" Boru');
    check('G2 ÖLÇÜT — KONTROL: kısıtsız `2" Boru` bugün eşleşiyor',
      r?.confidence !== 'none',
      `confidence=${r?.confidence} aday=${(r?.candidates ?? []).length} reason="${r?.reason}"`);
  }

  // ── R1 (KIRMIZI BEKLENIR): yazili YUZEY kelimesi ──
  {
    const r = await sessizEslestir(svc, '2" Siyah Boru');
    check('R1 — `2" Siyah Boru` sonucu \'none\' OLMAMALI (₺198,38 kütüphanede VAR)',
      r?.confidence !== 'none',
      `confidence=${r?.confidence} net=${r?.netPrice} aday=${(r?.candidates ?? []).length} reason="${r?.reason}"`);
  }

  // ── R2 (KIRMIZI BEKLENIR): IKINCI AILE — yuzey DISI kelime ──
  // 'düz uçlu' bir BAGLANTI tanimlayicisidir, yuzey degil. Yalniz yuzeye
  // (siyah/galvaniz/kirmizi) dokunan bir duzeltme bu kriteri GECIREMEZ.
  {
    const r = await sessizEslestir(svc, '2" Düz Uçlu Boru');
    check('R2 — `2" Düz Uçlu Boru` sonucu \'none\' OLMAMALI (İKİNCİ AİLE: bağlantı kelimesi)',
      r?.confidence !== 'none',
      `confidence=${r?.confidence} net=${r?.netPrice} aday=${(r?.candidates ?? []).length} reason="${r?.reason}"`);
  }

  console.log(`\nSONUC: ${passed} PASS, ${failures.length} FAIL`);
  if (failures.length) { failures.forEach((f) => console.log('  • ' + f)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
