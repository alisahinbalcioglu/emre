/**
 * INDEKSLI + AD-KILITLI MOTOR — KABUL TESTI (K1-K7)
 *   npx ts-node test/index-engine-test.ts   (npm run test:index)
 *
 * PRD "Aday Havuzunu Malzeme Adı'na Kilitle" kabul kriterleri.
 * Fixture'lar URETIM indeksleyicisini cagirir (buildProductIndex) — sahte
 * tag yok, gercek yazma yolu test edilir. DB gerekmez.
 *
 * Vakalar kullanicinin GERCEK dosyalarindan (Ayvaz S5-161 TAM, ARMAŞ).
 */

import { buildProductIndex, type ProductColumns } from '../src/modules/matching/index/product-index';
import { parseLine } from '../src/modules/matching/index/line-parser';
import { runQuery } from '../src/modules/matching/index/query-engine';
import { toMatchResult } from '../src/modules/matching/index/outcome-mapper';
import type { IndexedRow } from '../src/modules/matching/index/types';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** 11 kolonlu urun satiri → kutuphane satiri (uretim indeksleyicisiyle) */
function prod(c: ProductColumns & { discount?: number }): IndexedRow {
  const idx = buildProductIndex(c);
  return {
    id: `lib-${idx.rowKey}`,
    listPrice: c.price,
    customPrice: null,
    discountRate: c.discount ?? 0,
    currency: (c.paraBirimi as string) ?? 'TRY',
    urun: {
      ...idx,
      ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: typeof c.boy === 'number' ? c.boy : null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null,
      price: c.price,
    },
  };
}

const noFx = (v: number) => v; // TRY → TRY
const m = (q: string, pool: IndexedRow[], opts?: any) =>
  toMatchResult(runQuery(parseLine(q, opts?.unit), pool, opts), parseLine(q, opts?.unit), noFx);

// ── GERCEK AYVAZ VERISI (Ayvaz S5-161 TAM, kompansator ailesi) ──────
const KOMP = {
  kategori: 'Dilatasyon Omega V-Flex', cins: 'V-Flex - X,Y,Z ±40 mm hareket',
  birim: 'adet', paraBirimi: 'TL', sheetName: 'Ayvaz S5-161 TAM',
};
const HAVUZ_KOMPANSATOR: IndexedRow[] = [
  prod({ ...KOMP, ad: 'Omega V-Flex dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN25', price: 18015, urunKodu: '702090303035' }),
  prod({ ...KOMP, ad: 'Omega V-Flex dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN65', price: 27415, urunKodu: '702090303070' }),
  prod({ ...KOMP, ad: 'Eksenel metal körüklü kompansatör', baglanti: 'flanşlı', cap: 'DN25', price: 9500, urunKodu: 'EMK-25' }),
  prod({ ...KOMP, ad: 'Dıştan basınçlı kompansatör', baglanti: 'flanşlı', cap: 'DN25', price: 12000, urunKodu: 'DBK-25' }),
  // ── AYNI AILEDE OLMAYAN urunler: K1/K6'nin hedefi ──
  prod({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'pirinç', baglanti: 'dişli', cap: 'DN25', price: 850, urunKodu: 'KV-25', sheetName: 'Ayvaz S5-161 TAM' }),
  prod({ kategori: 'Esnek Metal Hortum', ad: 'Örgülü flexible hortum', cins: 'paslanmaz', baglanti: 'dişli', cap: 'DN25', price: 640, urunKodu: 'H-25', sheetName: 'Ayvaz S5-161 TAM' }),
];

/** UserLibrary satiri (indeksli) — Prisma'nin include:{product} ciktisi sekli */
function libRow(c: ProductColumns & { discount?: number; custom?: number }) {
  const idx = buildProductIndex(c);
  return {
    id: `lib-${idx.rowKey}`,
    materialId: null, material: null, materialName: idx.displayName,
    listPrice: c.price, customPrice: c.custom ?? null,
    discountRate: c.discount ?? 0, currency: (c.paraBirimi as string) ?? 'TRY',
    productIndexId: `pi-${idx.rowKey}`,
    product: {
      ...idx, id: `pi-${idx.rowKey}`,
      ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: typeof c.boy === 'number' ? c.boy : null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null, price: c.price,
    },
  };
}

async function dispatchTestleri() {
  const { MatchingService } = require('../src/modules/matching/matching.service');
  const { TerminologyService, ALIAS_SEEDS } = require('../src/modules/matching/terminology.service');

  function svcWith(rows: any[], otherRows: any[] = [], brandName = 'AYVAZ', hafiza: any = null) {
    const prisma: any = {
      userLibrary: {
        findMany: async (args: any) => {
          const b = args?.where?.brandId;
          if (b && typeof b === 'object' && 'not' in b) return otherRows;
          return rows;
        },
      },
      brand: { findUnique: async () => ({ name: brandName }) },
      eslesmeHafizasi: { findUnique: async () => hafiza, upsert: async () => {} },
      terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    };
    const fx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }) };
    return new MatchingService(prisma, new TerminologyService(prisma), fx);
  }

  const HAVUZ = [
    libRow({ ...KOMP, ad: 'Omega V-Flex dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN25', price: 18015, urunKodu: 'A1' }),
    libRow({ ...KOMP, ad: 'Eksenel metal körüklü kompansatör', baglanti: 'flanşlı', cap: 'DN25', price: 9500, urunKodu: 'A2' }),
    libRow({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'pirinç', baglanti: 'dişli', cap: 'DN25', price: 850, urunKodu: 'V1', sheetName: 'S' }),
  ];

  // D1: indeksli marka → v2 devreye girer ve Ad kilidi CALISIR
  {
    const svc = svcWith(HAVUZ);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['Dilatasyon kompansatörü DN25']))['Dilatasyon kompansatörü DN25'];
    check('D1 dispatch: indeksli marka → v2, tek eslesme yazildi',
      r?.confidence === 'high' && r?.netPrice === 18015, `got ${r?.confidence} net=${r?.netPrice}`);
    check('D1 v2 sonucu "Tek eşleşme" rozetini tasir (sozlesme)',
      !!r?.reason?.includes('Tek eşleşme'), `got "${r?.reason}"`);
  }

  // D2: iskonto/ozel fiyat KULLANICIYA ait — havuz fiyati degil
  {
    const svc = svcWith([
      libRow({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN25', price: 20000, discount: 25, urunKodu: 'B1' }),
    ]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['Dilatasyon kompansatörü DN25']))['Dilatasyon kompansatörü DN25'];
    check('D2 iskonto uygulandi (20000 - %25 = 15000)', r?.netPrice === 15000, `got ${r?.netPrice}`);
    check('D2 listPrice korunur', r?.listPrice === 20000 && r?.discount === 25, `got list=${r?.listPrice} isk=${r?.discount}`);
  }

  // D3: doviz — teklif aninda TRY tabanina cevrilir (Z4)
  {
    const svc = svcWith([
      libRow({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN25', price: 100, paraBirimi: 'USD', urunKodu: 'C1' }),
    ]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['Dilatasyon kompansatörü DN25']))['Dilatasyon kompansatörü DN25'];
    check('D3 USD 100 → TRY 4000 (kur 40, cevrim teklif aninda)', r?.netPrice === 4000, `got ${r?.netPrice}`);
  }

  // D4 (Faz 2b GUNCELLENDI): KARISIK havuz → v1 YOK ARTIK; manuel satir
  // ISTEK ANINDA indekslenir, v2 TEK motor olarak calisir (fallback yasagi).
  {
    const karisik = [...HAVUZ, { id: 'manuel-1', material: null, materialName: 'Elle eklenen boru DN25',
      listPrice: 100, customPrice: null, discountRate: 0, currency: 'TRY', productIndexId: null, product: null }];
    const svc = svcWith(karisik);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['Dilatasyon kompansatörü DN25']))['Dilatasyon kompansatörü DN25'];
    check('D4 karisik havuz → v2 CALISTI (tek motor, v1 sokuldu)',
      !!r?.reason?.includes('AD + ÇAP') && r?.netPrice === 18015, `got net=${r?.netPrice} reason="${r?.reason}"`);
    // Manuel satirin KENDISI de artik eslesebilir (istek-ani indeksleme)
    const r2 = (await svc.bulkMatch('u1', 'brand-1', ['Elle eklenen boru DN25']))['Elle eklenen boru DN25'];
    check('D4 manuel satir istek aninda indekslendi ve BULUNUR',
      (r2?.netPrice ?? 0) > 0 || (r2?.candidates?.length ?? 0) > 0, `got ${r2?.confidence} net=${r2?.netPrice} "${r2?.reason}"`);
  }

  // D4b (Faz 2b GUNCELLENDI): BAYAT INDEKS → v1'e dusme YOK; bayat satir
  // ISTEK ANINDA canli tokenizer'la yeniden uretilir → DOGRU cevap. 15.07
  // vakasi ("indekste 'vana' atilmisti → yok yalani") yapisal olarak olur.
  {
    const eski = HAVUZ.map((r) => ({
      ...r,
      product: {
        ...r.product,
        indexVersion: 1,                       // ← BAYAT
        adTokens: r.product.adTokens.filter((t: string) => t !== 'kompansator'), // eski kural: aile kelimesi atilmis
      },
    }));
    const svc = svcWith(eski);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['Dilatasyon kompansatörü DN25']))['Dilatasyon kompansatörü DN25'];
    check('D4b BAYAT indeks → istek aninda yeniden uretildi, v2 DOGRU cevap',
      !!r?.reason?.includes('AD + ÇAP') && r?.netPrice === 18015, `got net=${r?.netPrice} reason="${r?.reason}"`);
  }

  // D5: M3 — bu markada yok, DIGER indeksli markada var
  {
    const digerMarka = [
      { ...libRow({ kategori: 'Kompansatörler', ad: 'Dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN25', price: 16000, urunKodu: 'D1', sheetName: 'S' }),
        brand: { id: 'b-duyar', name: 'DUYAR' } },
    ];
    const svc = svcWith([HAVUZ[2]], digerMarka); // kendi markasinda YALNIZ vana var
    const r = (await svc.bulkMatch('u1', 'brand-1', ['Dilatasyon kompansatörü DN25']))['Dilatasyon kompansatörü DN25'];
    check('D5 markada yok → none + fiyat 0', r?.confidence === 'none' && r?.netPrice === 0,
      `got ${r?.confidence} net=${r?.netPrice}`);
    check('D5 M3: alternatif marka onerildi (DUYAR)',
      (r?.alternatives?.length ?? 0) === 1 && r?.alternatives?.[0]?.brandName === 'DUYAR',
      `got ${JSON.stringify(r?.alternatives)}`);
    check('D5 alternatif fiyatiyla geliyor', r?.alternatives?.[0]?.netPrice === 16000,
      `got ${r?.alternatives?.[0]?.netPrice}`);
  }

  // D6: bos kutuphane → v2'ye girmeden anlamli mesaj (sozlesme korunur)
  {
    const svc = svcWith([]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['Dilatasyon kompansatörü DN25']))['Dilatasyon kompansatörü DN25'];
    check('D6 bos kutuphane → none + aciklama', r?.confidence === 'none' && !!r?.reason,
      `got ${r?.confidence}`);
  }

  // ══ S3 — v2 SOZLUK/HAFIZA ENTEGRASYONU (Faz 1 denetim bulgusu) ═══
  // Spec 1.1-B: sozluk (temiz su→PPR, sprink hatti→siyah celik) satir
  // etiketlemenin PARCASIDIR; sozluk cinsi YAZILI sayilir (T1) → sert filtre.

  // S3-R3: TEMIZ SU + celik-only marka → celik aday YOK + PPR markasi onerisi
  {
    const celikBoru = libRow({ kategori: 'Borular', ad: 'Çelik boru', cins: 'Siyah, dikişli', cap: 'DN20', price: 500, urunKodu: 'CB20', sheetName: 'S' });
    const pprBoru = { ...libRow({ kategori: 'PPR', ad: 'PPR-C Boru', cins: 'PN20', cap: '20mm', price: 80, urunKodu: 'P20', sheetName: 'S' }),
      brand: { id: 'b-hakan', name: 'HAKAN PLASTIK' } };
    const borusanCelik = { ...libRow({ kategori: 'Borular', ad: 'Çelik boru', cins: 'Siyah, dikişli', cap: 'DN20', price: 480, urunKodu: 'BC20', sheetName: 'S' }),
      brand: { id: 'b-borusan', name: 'BORUSAN' } };
    const svc = svcWith([celikBoru], [pprBoru, borusanCelik], 'ÇAYIROVA');
    const r = (await svc.bulkMatch('u1', 'brand-1', ['TEMİZ SU BORULARI DN20']))['TEMİZ SU BORULARI DN20'];
    check('S3-R3 temiz su → celik aday YOK, fiyat yazilmadi',
      r?.confidence === 'none' && r?.netPrice === 0, `got ${r?.confidence} net=${r?.netPrice} "${r?.reason}"`);
    const altMarkalar = (r?.alternatives ?? []).map((a: any) => a.brandName);
    check('S3-R3 M3: PPR markasi onerildi (HAKAN PLASTIK)',
      altMarkalar.includes('HAKAN PLASTIK'), JSON.stringify(altMarkalar));
    check('S3-R3 M3: celik marka ONERILMEDI (sozluk alternatiflere de islenir)',
      !altMarkalar.includes('BORUSAN'), JSON.stringify(altMarkalar));
  }

  // S3-R1: SPRINK HATTI → siyah beklentisi SIRALAR, ELEMEZ (kullanici
  // karari 16.07: "galvaniz one cikmaz" = listede SONA duser; galvaniz/
  // siyah/kirmizi astarli UCUY DE fiyatiyla secenek olarak sunulur).
  {
    const B = { kategori: 'Borular', sheetName: 'S' };
    const svc = svcWith([
      // BILEREK galvaniz ILK sirada — siralama testi anlamli olsun
      libRow({ ...B, ad: 'Çelik boru', cins: 'Galvanizli, dikişli', cap: 'DN50', price: 1100, urunKodu: 'G50' }),
      libRow({ ...B, ad: 'Çelik boru', cins: 'Siyah, dikişli', cap: 'DN50', price: 900, urunKodu: 'S50' }),
      libRow({ ...B, ad: 'Çelik boru', cins: 'Kırmızı boyalı, dikişli', cap: 'DN50', price: 950, urunKodu: 'K50' }),
    ], [], 'ÇAYIROVA');
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN50']))['SPRİNK HATTI BORULARI DN50'];
    const adlar = (r?.candidates ?? []).map((c: any) => c.materialName);
    check('S3-R1 sprink hatti → fiyatli secim listesi (otomatik yazim yok)',
      r?.confidence === 'multi' && r?.netPrice === 0, `got ${r?.confidence} net=${r?.netPrice}`);
    check('S3-R1 UC SECENEK DE listede (galvaniz ELENMEZ — kullanici karari)',
      adlar.length === 3 && adlar.some((a: string) => /galvaniz/i.test(a)), JSON.stringify(adlar));
    check('S3-R1 SIRALAMA: siyah ONDE (sozluk beklentisi)',
      /siyah/i.test(adlar[0] ?? ''), JSON.stringify(adlar));
    check('S3-R1 SIRALAMA: galvaniz SONDA (cakisan taban one cikmaz)',
      /galvaniz/i.test(adlar[adlar.length - 1] ?? ''), JSON.stringify(adlar));

    // R1b: markada YALNIZ galvanizli var → tek aday bile OTOMATIK YAZILMAZ
    // (celiski onayi: sozluk siyah bekliyor) — v1 surfaceConflict kurali v2'de
    const svcTek = svcWith([
      libRow({ ...B, ad: 'Çelik boru', cins: 'Galvanizli, dikişli', cap: 'DN50', price: 1100, urunKodu: 'G50' }),
    ], [], 'ÇAYIROVA');
    const r2 = (await svcTek.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN50']))['SPRİNK HATTI BORULARI DN50'];
    check('S3-R1b tek aday GALVANIZLI + siyah beklentisi → onay listesi (yazilmaz)',
      r2?.confidence === 'multi' && r2?.netPrice === 0 && (r2?.candidates?.length ?? 0) === 1,
      `got ${r2?.confidence} net=${r2?.netPrice} cand=${r2?.candidates?.length}`);
    check('S3-R1b nedeni celiskiyi soyluyor',
      !!r2?.reason && /galvaniz|siyah|beklenti|çelişiyor/i.test(r2.reason), `got "${r2?.reason}"`);
  }

  // S3-E8: boru sozlugu (dogalgaz→celik boru) VANA satirina dayatilamaz
  {
    const V = { kategori: 'Vanalar', sheetName: 'S' };
    const svc = svcWith([
      libRow({ ...V, ad: 'Küresel vana', cins: 'doğalgaz, tam geçişli', cap: 'DN50', price: 2000, urunKodu: 'KV50' }),
      libRow({ ...V, ad: 'Sürgülü vana', cins: 'pik döküm', cap: 'DN50', price: 1800, urunKodu: 'SV50' }),
    ]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['DOĞALGAZ VANASI KÜRESEL DN50']))['DOĞALGAZ VANASI KÜRESEL DN50'];
    check('S3-E8 vana satiri vana ailesinde kaldi → kuresel tek eslesme',
      r?.confidence === 'high' && r?.netPrice === 2000, `got ${r?.confidence} net=${r?.netPrice} "${r?.reason}"`);
  }

  // S3-H: OGRENME HAFIZASI v2'de de ON-SECILI getirir (otomatik doldurmaz)
  {
    const C = { kategori: 'Çekvalfler', sheetName: 'S' };
    const yayli = libRow({ ...C, ad: 'Çekvalf', cins: 'yaylı', cap: 'DN40', price: 1000, urunKodu: 'Y1' });
    const disko = libRow({ ...C, ad: 'Çekvalf', cins: 'disko', cap: 'DN40', price: 1200, urunKodu: 'D1' });
    const secilen = yayli.product.displayName; // 'Çekvalf · yaylı · DN40'
    const svc = svcWith([yayli, disko], [], 'AYVAZ', { secilenAd: secilen, secimSayisi: 3 });
    const r = (await svc.bulkMatch('u1', 'brand-1', ['ÇEKVALF DN40']))['ÇEKVALF DN40'];
    check('S3-H cekvalf DN40 → sorulmadan YAZILMAZ (R16)',
      r?.confidence === 'multi' && r?.netPrice === 0, `got ${r?.confidence} net=${r?.netPrice}`);
    check('S3-H gecmis secim BASA alindi + preferred isaretli',
      r?.candidates?.[0]?.materialName === secilen && r?.candidates?.[0]?.preferred === true,
      `got first=${r?.candidates?.[0]?.materialName} pref=${r?.candidates?.[0]?.preferred}`);
    check('S3-H nedeni soyluyor (Geçmiş seçiminiz)',
      !!r?.reason?.includes('Geçmiş seçiminiz'), `got "${r?.reason}"`);
  }
}

async function run() {
  // ══ K1: Ad kilidi — baska aile ASLA aday olamaz ═══════════════════
  {
    const r = m('Dilatasyon kompansatörü DN25', HAVUZ_KOMPANSATOR);
    const adlar = (r.candidates ?? []).map((c) => c.materialName);
    check('K1 tek Dilatasyon kaydina indi → fiyat yazildi',
      r.confidence === 'high' && r.netPrice === 18015, `got ${r.confidence} net=${r.netPrice} cand=${JSON.stringify(adlar)}`);
    check('K1 vana/hortum ADAY DEGIL', !adlar.some((a) => /vana|hortum/i.test(a)), JSON.stringify(adlar));
    check('K1 baska KOMPANSATOR de aday degil (alt-ad kilidi)',
      !adlar.some((a) => /Eksenel|Dıştan/i.test(a)), JSON.stringify(adlar));
    check('K1 dogru urun secildi', !!r.matchedName?.includes('Omega V-Flex'), `got "${r.matchedName}"`);
  }

  // ══ K6: metin benzerligi Ad kilidini GECEMEZ ══════════════════════
  {
    // "Küresel vana DN25" ile "Omega V-Flex dilatasyon kompansatörü" metinsel
    // olarak alakasiz ama v1'de ikisi de dn25 tasidigi icin aday oluyordu
    // ('diger' → tip filtresi sifir). v2'de aile kilidi var.
    const r = m('Kompansatör DN25', HAVUZ_KOMPANSATOR);
    const adlar = (r.candidates ?? []).map((c) => c.materialName);
    check('K6 hicbir skor Ad kilidini gecemez (vana/hortum yok)',
      !adlar.some((a) => /vana|hortum/i.test(a)), JSON.stringify(adlar));
  }

  // ══ K5: ust-aile adi → ilk soru ALT ADLAR, fiyatiyla ══════════════
  {
    const r = m('Kompansatör DN25', HAVUZ_KOMPANSATOR);
    check('K5 ust aile → soru (fiyat YAZILMAZ)', r.confidence === 'multi' && r.netPrice === 0,
      `got ${r.confidence} net=${r.netPrice}`);
    check('K5 3 alt-ad sunuldu', (r.candidates?.length ?? 0) === 3, `got ${r.candidates?.length}`);
    const labels = (r.candidates ?? []).map((c) => c.label);
    check('K5 secenekler ALT ADLAR (Omega/Eksenel/Dıştan)',
      labels.some((l) => /Omega/.test(l)) && labels.some((l) => /Eksenel/.test(l)) && labels.some((l) => /Dıştan/.test(l)),
      JSON.stringify(labels));
    check('K5 her secenek FIYATLI', (r.candidates ?? []).every((c) => c.netPrice > 0),
      JSON.stringify(r.candidates?.map((c) => c.netPrice)));
    check('K5 havuz kompansator ailesiyle SINIRLI (vana/hortum yok)',
      !labels.some((l) => /vana|hortum/i.test(l)), JSON.stringify(labels));
  }

  // ══ K2: Ad + Cap tek kayda iniyor → sorulmadan yazilir ════════════
  {
    const r = m('Dilatasyon kompansatörü DN65', HAVUZ_KOMPANSATOR);
    check('K2 tek eslesme → fiyat + "Tek eşleşme" rozeti',
      r.confidence === 'high' && r.netPrice === 27415 && !!r.reason?.includes('Tek eşleşme'),
      `got ${r.confidence} net=${r.netPrice} reason="${r.reason}"`);
  }

  // ══ K3: yalniz BAGLANTI ayrisiyor → yalniz o sorulur ══════════════
  {
    const havuz = [
      prod({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'döner flanşlı', cap: 'DN50', price: 22000, urunKodu: 'DLTKF-50-D' }),
      prod({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'sabit flanşlı', cap: 'DN50', price: 20500, urunKodu: 'DLTKF-50-S' }),
    ];
    const r = m('Dilatasyon kompansatörü DN50', havuz);
    check('K3 iki kayit → soru, fiyat yazilmadi', r.confidence === 'multi' && r.netPrice === 0);
    const labels = (r.candidates ?? []).map((c) => c.label).sort();
    check('K3 sorulan kolon BAGLANTI (cins DEGIL — cins ayni)',
      JSON.stringify(labels) === JSON.stringify(['döner flanşlı', 'sabit flanşlı']), JSON.stringify(labels));
    check('K3 secenekler fiyatiyla (döner 22000 / sabit 20500)',
      (r.candidates ?? []).some((c) => c.netPrice === 22000) && (r.candidates ?? []).some((c) => c.netPrice === 20500));

    // ── K4: teklifte baglanti YAZILI → sert filtre, soru YOK ──
    const r2 = m('Dilatasyon kompansatörü döner flanşlı DN50', havuz);
    check('K4 yazili baglanti = sert filtre → tek kayit, fiyat yazildi',
      r2.confidence === 'high' && r2.netPrice === 22000, `got ${r2.confidence} net=${r2.netPrice}`);
  }

  // ══ K7: ayni kod farkli sayfa → IKI kayit, biri digerini ezmez ════
  {
    const havuz = [
      prod({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN80', price: 30775, urunKodu: '702090303080', sheetName: 'Ayvaz S5-161 TAM' }),
      prod({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN80', price: 28900, urunKodu: '702090303080', sheetName: 'Ayvaz KAMPANYA' }),
    ];
    check('K7 ayni kod + farkli sayfa → 2 AYRI kayit (rowKey farkli)',
      havuz[0].urun.rowKey !== havuz[1].urun.rowKey);
    const r = m('Dilatasyon kompansatörü DN80', havuz);
    check('K7 ikisi de sunuldu (biri digerini EZMEDI)', (r.candidates?.length ?? 0) === 2,
      `got ${r.candidates?.length}`);
    check('K7 kolonlar ayni → kayit kaynagiyla ayirt edildi',
      (r.candidates ?? []).map((c) => c.label).sort().join('|') === 'Dilatasyon Omega V-Flex|Dilatasyon Omega V-Flex'
      || (r.candidates ?? []).every((c) => !!c.label), JSON.stringify(r.candidates?.map((c) => c.label)));
    check('K7 iki fiyat da korundu', (r.candidates ?? []).some((c) => c.netPrice === 30775)
      && (r.candidates ?? []).some((c) => c.netPrice === 28900));
  }

  // ══ FALLBACK YASAGI: dorduncu yol YOK ════════════════════════════
  {
    const sorgular = ['Dilatasyon kompansatörü DN25', 'Kompansatör DN25', 'Kompansatör DN99', 'FİTTİNGS ORANI', 'Küresel vana DN25'];
    const ihlal = sorgular.map((q) => ({ q, r: m(q, HAVUZ_KOMPANSATOR) }))
      .filter(({ r }) => (r.candidates?.length ?? 0) > 1 && r.netPrice > 0);
    check('FALLBACK YASAGI: hicbir sonucta coklu aday + fiyat yok',
      ihlal.length === 0, JSON.stringify(ihlal.map((i) => i.q)));

    const yok = m('Kompansatör DN99', HAVUZ_KOMPANSATOR);
    check('Sifir sonuc → none + fiyat 0 (uydurmaz)', yok.confidence === 'none' && yok.netPrice === 0,
      `got ${yok.confidence} net=${yok.netPrice}`);
    check('Sifir sonuc NEDENINI soyler', !!yok.reason && yok.reason.length > 5, `got "${yok.reason}"`);

    const oran = m('FİTTİNGS ORANI', HAVUZ_KOMPANSATOR);
    check('Urun degil satiri → notProduct', oran.notProduct === true && oran.netPrice === 0);
  }

  // ══ KARAR #3: taninmayan kelime → aile sorusu, SERT SIFIR DEGIL ═══
  {
    // "Dilatsyon" (yazim hatasi) — v2 bunu kisit olarak UYGULAMAZ, aile
    // sorusuna duser. Sert sifir verseydi alternatif arama da ayni hatali
    // kelimeyle arayacagi icin kullanici cikmaz sokakta kalirdi.
    const r = m('Dilatsyon kompansatörü DN25', HAVUZ_KOMPANSATOR);
    check('K#3 yazim hatasi → SIFIR DEGIL, aile sorusu',
      r.confidence === 'multi' && (r.candidates?.length ?? 0) === 3,
      `got ${r.confidence} cand=${r.candidates?.length}`);
    check('K#3 aile kilidi HALA duruyor (vana/hortum yok)',
      !(r.candidates ?? []).some((c) => /vana|hortum/i.test(c.materialName)),
      JSON.stringify(r.candidates?.map((c) => c.materialName)));
    check('K#3 kullaniciya taninmayan kelimeyi SOYLER',
      !!r.reason?.toLowerCase().includes('dilatsyon'), `got "${r.reason}"`);
    check('K#3 fiyat YAZILMADI (sessiz tahmin yok)', r.netPrice === 0);
  }

  // ══ CAP ON-HESABI: teklif inc, kutuphane DN → indekste bulusur ════
  {
    const r = m('Dilatasyon kompansatörü 2 1/2"', HAVUZ_KOMPANSATOR); // 2½" = DN65
    check('CAP: teklif 2 1/2" ↔ kutuphane DN65 (on-hesap kesisimi)',
      r.confidence === 'high' && r.netPrice === 27415, `got ${r.confidence} net=${r.netPrice}`);
    check('CAP: donusum rozeti uretildi', !!r.donusum, `got "${r.donusum}"`);
  }

  // ══ V4: grup varyanti round-trip (FE sozlesmesi) ═════════════════
  {
    const havuz = [
      prod({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'döner flanşlı', cap: 'DN25', price: 18015, urunKodu: 'A1' }),
      prod({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'sabit flanşlı', cap: 'DN25', price: 17000, urunKodu: 'A2' }),
      prod({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'döner flanşlı', cap: 'DN65', price: 27415, urunKodu: 'B1' }),
      prod({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'sabit flanşlı', cap: 'DN65', price: 25000, urunKodu: 'B2' }),
    ];
    const r1 = m('Dilatasyon kompansatörü DN25', havuz);
    const doner = r1.candidates?.find((c) => c.label === 'döner flanşlı');
    check('V4 adayda variantTags var', (doner?.variantTags?.length ?? 0) > 0, JSON.stringify(doner?.variantTags));

    const r2 = m('Dilatasyon kompansatörü DN65', havuz, { variantTags: doner?.variantTags });
    check('V4 round-trip: ayni varyant DN65e yayildi + rozet',
      r2.autoVariant === true && r2.netPrice === 27415, `got auto=${r2.autoVariant} net=${r2.netPrice}`);

    const r3 = m('Dilatasyon kompansatörü DN99', havuz, { variantTags: doner?.variantTags });
    check('V4.5 varyant o capta yok → otomatik atama YOK',
      r3.netPrice === 0, `got net=${r3.netPrice}`);
  }

  // ══ ARMAŞ gercek vakasi: aile KATEGORIDEN cozuluyor ══════════════
  {
    // Ad'da 'vana' kelimesi YOK, Kategoride var. Bu satirlar aksi halde
    // 'belirsiz' olur ve eslestirmeye HIC giremezdi.
    const armas = [
      prod({ kategori: 'İzlenebilir Kelebek Vana', ad: 'ARMAŞ İZLENEBİLİR KELEBEK', cins: '—', cap: '50 mm', price: 156, paraBirimi: 'USD', sheetName: 'ARMAŞ Fiyat Listesi' }),
      prod({ kategori: 'İzlenebilir Kelebek Vana', ad: 'ARMAŞ İZLENEBİLİR KELEBEK', cins: '—', cap: '65 mm', price: 165, paraBirimi: 'USD', sheetName: 'ARMAŞ Fiyat Listesi' }),
    ];
    check('ARMAŞ aile kategoriden cozuldu → belirsiz DEGIL',
      armas.every((a) => !a.urun.belirsiz && a.urun.adSlug === 'vana'),
      `got ${armas.map((a) => `${a.urun.adSlug}/${a.urun.belirsiz}`).join(',')}`);
    check('ARMAŞ ayni model kodu yok ama caplar AYRI kayit (rowKey)',
      armas[0].urun.rowKey !== armas[1].urun.rowKey);
  }

  // ══ CANLI VAKA (15.07): AILE COZULEMEYEN SATIR ═══════════════════
  // Kullanici teklif ekraninda yakaladi: "OTOMATİK HAVA ATMA PÜRJÖRÜ DN 20"
  // satirina 359 aday onerildi (sprinkler hortumu, dogalgaz hortumu,
  // kondenstop...). KOK: tum ad-token filtrelemesi `if (familySlug)` blogunun
  // icindeydi → aile cozulemeyince HICBIR ad kisiti uygulanmiyor, geriye
  // yalniz cap kaliyordu. Sokmeye calistigimiz hastaligin ta kendisi.
  {
    const havuz = [
      prod({ kategori: 'Esnek Metal Hortum', ad: 'Sprinkler bağlantı hortumu', cins: 'SP-FLEX', cap: 'DN20', price: 700, urunKodu: 'S1', sheetName: 'S' }),
      prod({ kategori: 'Doğalgaz', ad: 'Doğalgaz hortumu', cins: 'ocak-fırın', cap: 'DN20', price: 300, urunKodu: 'S2', sheetName: 'S' }),
      prod({ kategori: 'Kondenstop', ad: 'Termostatik kondenstop', cap: 'DN20', price: 1200, urunKodu: 'S3', sheetName: 'S' }),
      prod({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'pirinç', cap: 'DN20', price: 850, urunKodu: 'S4', sheetName: 'S' }),
    ];
    const r = m('OTOMATİK HAVA ATMA PÜRJÖRÜ DN 20', havuz);
    check('CANLI: aile cozulemeyen satir → 359 aday DEGIL, "markada yok"',
      r.confidence === 'none' && r.netPrice === 0,
      `got ${r.confidence} aday=${r.candidates?.length}`);
    check('CANLI: sprinkler/dogalgaz hortumu ADAY DEGIL',
      !(r.candidates ?? []).some((c) => /hortum|kondenstop|vana/i.test(c.materialName)),
      JSON.stringify(r.candidates?.map((c) => c.materialName)));
    check('CANLI: neden soylenir (taninmayan kelimeler)',
      !!r.reason && r.reason.length > 5, `got "${r.reason}"`);

    // R11 KORUNUR: hic ad kelimesi olmayan satir → SORU (yok DEGIL).
    // Ayrim: "bir sey sorulmadi" ≠ "var olmayan bir sey soruldu".
    const r2 = m('DN 20', havuz);
    check('R11 korundu: yalin "DN 20" → soru (4 aday), sifir DEGIL',
      r2.confidence === 'multi' && (r2.candidates?.length ?? 0) === 4,
      `got ${r2.confidence} aday=${r2.candidates?.length}`);

    // Aile cozulen satirda KARAR #3 hala gecerli: yazim hatasi sifir vermez
    const komp = m('Dilatsyon kompansatörü DN25', HAVUZ_KOMPANSATOR);
    check('KARAR #3 sinirlandi ama BOZULMADI (aile varsa yazim hatasi → soru)',
      komp.confidence === 'multi', `got ${komp.confidence}`);
  }

  // ══ CANLI VAKA (15.07): TAM AD ESLESMESI ONCELIKLI ═══════════════
  // Canli olcum: "Dilatasyon kompansatörü DN25" → 16 aday. Hepsi DOGRU
  // aileden (vana/hortum yok — K1 tutuyor) ama UC ayri ad karisiyordu:
  //   Dilatasyon kompansatörü (4) · Omega U-Flex … (6) · Omega V-Flex … (6)
  // Salt alt-kume mantigi ({dilatasyon} ⊆ {omega,vflex,dilatasyon}) hepsini
  // aliyordu. PRD §4: "bucket kilitlenir — YALNIZ bu ad".
  {
    const havuz = [
      // Kullanicinin YAZDIGI adin BIREBIR karsiligi (2 baglanti varyanti)
      prod({ kategori: 'Dilatasyon', ad: 'Dilatasyon kompansatörü', cins: 'yanal hareket ±50 mm (DLTKF-50)', baglanti: 'döner flanşlı', cap: 'DN25', price: 7235, urunKodu: 'D1', sheetName: 'S' }),
      prod({ kategori: 'Dilatasyon', ad: 'Dilatasyon kompansatörü', cins: 'yanal hareket ±50 mm (DLTKKB-50)', baglanti: 'kaynak boyunlu', cap: 'DN25', price: 6385, urunKodu: 'D2', sheetName: 'S' }),
      // Ayni ailede, adi DAHA UZUN olanlar → tam eslesme varken ELENMELI
      prod({ kategori: 'Dilatasyon', ad: 'Omega U-Flex dilatasyon kompansatörü', cins: 'U-Flex ±40 mm', baglanti: 'flanşlı', cap: 'DN25', price: 16325, urunKodu: 'U1', sheetName: 'S' }),
      prod({ kategori: 'Dilatasyon', ad: 'Omega V-Flex dilatasyon kompansatörü', cins: 'V-Flex ±40 mm', baglanti: 'flanşlı', cap: 'DN25', price: 17080, urunKodu: 'V1', sheetName: 'S' }),
    ];
    const r = m('Dilatasyon kompansatörü DN25', havuz);
    const adlar = (r.candidates ?? []).map((c) => c.materialName);
    check('TAM AD: yalniz BIREBIR ad kaldi (Omega\'lar elendi) — PRD §4',
      (r.candidates?.length ?? 0) === 2 && !adlar.some((a) => /Omega/.test(a)),
      `got ${r.candidates?.length} → ${JSON.stringify(adlar)}`);
    // Soru artik ALT-AD degil, urunun kendi niteligi. Hangi kolonun sorulacagi
    // (cins mi baglanti mi) VERIYE baglidir — gercek Ayvaz satirlarinda cins
    // de baglanti da ayrisir ("±50 (DLTKF-50)" = döner flanşlı). Kabul olcutu
    // kolonun ADI degil, sorunun TEK TIKTA cozulmesi: her etiket benzersiz olmali.
    const etiketler = (r.candidates ?? []).map((c) => c.label);
    check('TAM AD: soru alt-ad DEGIL, urun niteligi (Omega secenegi yok)',
      !etiketler.some((l) => /Omega|kompansat/i.test(l)), JSON.stringify(etiketler));
    check('TAM AD: soru TEK TIKTA cozulur (her etiket benzersiz)',
      new Set(etiketler).size === etiketler.length && etiketler.length === 2,
      JSON.stringify(etiketler));

    // UST ad yazilirsa tam eslesme YOK → alt-kume calisir → K5
    const r2 = m('Kompansatör DN25', havuz);
    check('TAM AD kurali K5\'i BOZMAZ: ust ad → 4 alt-ad sorulur',
      (r2.candidates?.length ?? 0) === 4, `got ${r2.candidates?.length}`);

    // Urun adi daha uzunsa ve tam eslesme yoksa alt-kume yine calisir
    const r3 = m('Omega V-Flex dilatasyon kompansatörü DN25', havuz);
    check('TAM AD: uzun ad birebir yazilirsa o secilir',
      r3.confidence === 'high' && r3.netPrice === 17080, `got ${r3.confidence} net=${r3.netPrice}`);
  }

  // ══ CANLI VAKA (15.07): ES ANLAMLI AD — "FLOW SWİTCH" ↔ "Akış anahtarı"
  // Kullanici: "FLOW SWİTCH için eşleşme vermiyor". Motor ASLINDA buluyordu
  // (2 aday) ama mesaji '"flow switch" bu markada bulunamadı' diyordu — YALAN:
  // sozluk 'flow switch'i taniyor ve aileyi ZATEN o kelimeler cozdu.
  // 'flow'/'switch' urunun TURKCE adinda gecmez; bu EKSIKLIK degil ES ANLAMLILIK.
  {
    const K = 'Yangın / Akış Anahtarı';
    const havuz = [
      prod({ kategori: K, ad: 'Akış anahtarı', cins: 'Ayvaz · paddle (palet) tip · 30-60 sn gecikme ayarlı', cap: '2 1/2" (73 mm)', price: 245, urunKodu: 'F1', sheetName: 'S' }),
      prod({ kategori: K, ad: 'Akış anahtarı', cins: 'System Sensor · paddle (palet) tip · 30-120 sn gecikme', cap: '2 1/2"', price: 275, urunKodu: 'F2', sheetName: 'S' }),
      prod({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'pirinç', cap: 'DN65', price: 850, urunKodu: 'V9', sheetName: 'S' }),
    ];
    const L = parseLine('FLOW SWİTCH DN 65');
    check('ES ANLAMLI: "flow switch" aileyi cozer (sozluk)', L.familySlug === 'akis-anahtari',
      `got ${L.familySlug}`);
    check('ES ANLAMLI: flow/switch AILE KELIMESI sayilir (eksik degil)',
      L.aileKelimeleri.includes('flow') && L.aileKelimeleri.includes('switch'),
      `got ${JSON.stringify(L.aileKelimeleri)}`);

    const r = m('FLOW SWİTCH DN 65', havuz);
    check('ES ANLAMLI: urunler BULUNUR (2 akis anahtari)', (r.candidates?.length ?? 0) === 2,
      `got ${r.candidates?.length}`);
    check('ES ANLAMLI: kuresel vana ADAY DEGIL (aile kilidi)',
      !(r.candidates ?? []).some((c) => /küresel/i.test(c.materialName)));
    check('ES ANLAMLI: mesaj "bulunamadı" YALANINI SOYLEMEZ',
      !r.reason?.includes('bulunamadı'), `got "${r.reason}"`);

    // KARAR #3 BOZULMADI: gercek yazim hatasi hala raporlanir
    const y = m('Dilatsyon kompansatörü DN25', HAVUZ_KOMPANSATOR);
    check('ES ANLAMLI kurali KARAR #3\'u BOZMAZ (dilatsyon hala raporlanir)',
      !!y.reason?.toLowerCase().includes('dilatsyon'), `got "${y.reason}"`);
  }

  // ══ OLCU TOKEN'LARI AD SANILMAZ ══════════════════════════════════
  {
    // CANLI: "DN25" BITISIK yazilinca tek token ('dn25') gelir ve ad kelimesi
    // saniliyordu → kullaniciya '"dn25" bu markada bulunamadı' deniyordu.
    const Lb = parseLine('Dilatasyon kompansatörü DN25');
    check('OLCU: bitisik "DN25" ad token\'i DEGIL',
      !Lb.tokens.some((t) => t.startsWith('dn')), JSON.stringify(Lb.tokens));
    check('OLCU: bitisik yazimda cap yine cozuldu', Lb.capInfo?.display === 'DN 25',
      `got ${Lb.capInfo?.display}`);

    const L = parseLine('OTOMATİK HAVA ATMA PÜRJÖRÜ DN 20');
    check('OLCU: "dn" ve "20" ad token\'i DEGIL (capInfo tuketti)',
      !L.tokens.includes('dn') && !L.tokens.includes('20'), JSON.stringify(L.tokens));
    check('OLCU: gercek ad kelimeleri korundu (oldugu gibi)', L.tokens.includes('purjoru') && L.tokens.includes('otomatik'),
      JSON.stringify(L.tokens));
    // HASSAS: capla ilgisiz sayi (sicaklik) KORUNMALI
    const L2 = parseLine('Sprinkler 68 derece 1/2"');
    check('OLCU: "68" (sicaklik) ayiklanmadi — yalniz capin KENDI degeri duser',
      L2.tokens.includes('68'), JSON.stringify(L2.tokens));
  }

  // ══ FLANS vs FLANSLI — teklif satiri COK KOLONLU metindir ════════
  // Urun tarafinda bu tuzak YOK (yalniz Ad kolonu okunur). Teklif satiri
  // ise ad+cins+baglanti kelimelerini BIR ARADA tasir; yalin /flans/
  // regex'i "döner flanşlı"yi gorup satirin AILESINI 'flans' saniyordu.
  {
    const havuz = [
      prod({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'döner flanşlı', cap: 'DN50', price: 22000, urunKodu: 'D' }),
      // Gercek FLANS urunu (Sardogan'da 339 satir var) — bozulmamali
      prod({ kategori: 'Flanşlar', ad: 'Düz Flanş', cins: 'ND 6 (PN 6)', cap: 'DN250', price: 1400, urunKodu: 'F250', sheetName: 'Sardoğan' }),
    ];
    const r = m('Dilatasyon kompansatörü döner flanşlı DN50', havuz);
    check('FLANS "flanşlı" AILE DEGIL (baglanti sifati) → kompansator bulundu',
      r.confidence === 'high' && r.netPrice === 22000, `got ${r.confidence} net=${r.netPrice} "${r.reason}"`);
    const r2 = m('Düz Flanş DN250', havuz);
    check('FLANS gercek flans URUNU hala bulunur (ayrim bozulmadi)',
      r2.confidence === 'high' && r2.netPrice === 1400, `got ${r2.confidence} net=${r2.netPrice}`);
  }

  // ══ U — BIRIM SINYALI (E2/I9): celiskide otomatik yazim KAPANIR ═══
  // "metre" birimli satir EKIPMAN ailesine tek adayla inse bile fiyat
  // sorulmadan yazilamaz — sinyaller celisiyor, onay listesi sunulur.
  {
    const havuz = [
      prod({ kategori: 'Sprinkler', ad: 'Sprinkler', cins: 'Pendent 68°C', cap: '1/2"', price: 120, urunKodu: 'SP1' }),
    ];
    const r = m('SPRINKLER 68°C 1/2"', havuz, { unit: 'metre' });
    check('U1 metre birimli EKIPMAN satiri → otomatik yazim YOK (onay listesi)',
      r.confidence === 'multi' && r.netPrice === 0, `got ${r.confidence} net=${r.netPrice} "${r.reason}"`);
    check('U1 nedeni birim celiskisini soyluyor',
      !!r.reason && /birim/i.test(r.reason), `got "${r.reason}"`);
    const r2 = m('SPRINKLER 68°C 1/2"', havuz, { unit: 'adet' });
    check('U2 adet birimli sprinkler → celiski yok, tek eslesme yazilir',
      r2.confidence === 'high' && r2.netPrice === 120, `got ${r2.confidence} net=${r2.netPrice}`);
  }

  // ══ B — BORU YUZEY GENISLETMESI (kullanici karari 16.07) ═════════
  // "siyah boru / celik boru kelimelerinde galvaniz ve kirmizi boyali
  // tercihlerini de sunsun" — YALNIZ boru ailesinde, YALNIZ popup aciliyorsa.
  // Yazili yuzey onde; tek kayda inen satir YINE otomatik yazilir (K2 bozulmaz).
  {
    const B = { kategori: 'Borular', sheetName: 'S' };
    const havuz = [
      prod({ ...B, ad: 'Çelik boru', cins: 'Siyah, dikişli, et 3,0 mm', cap: 'DN150', price: 900, urunKodu: 'S1' }),
      prod({ ...B, ad: 'Çelik boru', cins: 'Siyah, dikişli, et 3,6 mm', cap: 'DN150', price: 950, urunKodu: 'S2' }),
      prod({ ...B, ad: 'Çelik boru', cins: 'Galvanizli, dikişli', cap: 'DN150', price: 1100, urunKodu: 'G1' }),
      prod({ ...B, ad: 'Çelik boru', cins: 'Kırmızı boyalı, dikişli', cap: 'DN150', price: 980, urunKodu: 'K1' }),
    ];
    // B1: yazili 'siyah' + 2 siyah varyant → popup; galvaniz+kirmizi DE listede
    const r = m('6" DN150 Siyah Çelik Boru', havuz);
    const adlar = (r.candidates ?? []).map((c) => c.materialName);
    check('B1 siyah boru → popup acildi (2 siyah varyant)',
      r.confidence === 'multi' && r.netPrice === 0, `got ${r.confidence} net=${r.netPrice}`);
    check('B1 galvaniz + kirmizi TERCIH OLARAK listede (boru genislemesi)',
      adlar.some((a) => /galvaniz/i.test(a)) && adlar.some((a) => /kırmızı|kirmizi/i.test(a)),
      JSON.stringify(adlar));
    check('B1 SIRALAMA: yazili yuzey (siyah) ONDE',
      /siyah/i.test(adlar[0] ?? '') && /siyah/i.test(adlar[1] ?? ''), JSON.stringify(adlar));
    check('B1 SIRALAMA: cakisan taban (galvaniz) SONDA',
      /galvaniz/i.test(adlar[adlar.length - 1] ?? ''), JSON.stringify(adlar));

    // B2: yazili yuzey TEK kayda iniyor → OTOMATIK YAZILIR (K2 korunur)
    const havuzTek = [
      prod({ ...B, ad: 'Çelik boru', cins: 'Siyah, dikişli', cap: 'DN150', price: 900, urunKodu: 'S1' }),
      prod({ ...B, ad: 'Çelik boru', cins: 'Galvanizli, dikişli', cap: 'DN150', price: 1100, urunKodu: 'G1' }),
    ];
    const r2 = m('DN150 Siyah Çelik Boru', havuzTek);
    check('B2 yazili yuzey tek kayda indi → fiyat YAZILIR (genisleme K2\'yi bozmaz)',
      r2.confidence === 'high' && r2.netPrice === 900, `got ${r2.confidence} net=${r2.netPrice}`);

    // B3: BORU DISI ailede genisletme YOK — yazili nitelik sert kalir
    const vanaHavuz = [
      prod({ kategori: 'Vanalar', ad: 'Küresel vana', cins: 'pirinç', cap: 'DN50', price: 800, urunKodu: 'V1', sheetName: 'S' }),
      prod({ kategori: 'Vanalar', ad: 'Küresel vana', cins: 'pirinç, kilitli', cap: 'DN50', price: 850, urunKodu: 'V2', sheetName: 'S' }),
      prod({ kategori: 'Vanalar', ad: 'Küresel vana', cins: 'paslanmaz', cap: 'DN50', price: 1900, urunKodu: 'V3', sheetName: 'S' }),
    ];
    const r3 = m('Küresel vana pirinç DN50', vanaHavuz);
    const adlar3 = (r3.candidates ?? []).map((c) => c.materialName);
    check('B3 vana ailesinde yazili cins SERT — paslanmaz listeye SIZMAZ',
      r3.confidence === 'multi' && !adlar3.some((a) => /paslanmaz/i.test(a)),
      `got ${r3.confidence} ${JSON.stringify(adlar3)}`);
  }

  // ══ İ — AD-TOKEN DUSURME (canli vaka 16.07: izleme anahtarli) ════
  // "4\"-DN100 İzleme Anahtarlı Kelebek Vana" → kutupanede urun
  // "İzlenebilir kelebek vana" adiyla kayitli. 'izleme' kelimesi BASKA
  // urunden ("Vana izleme anahtarı") taninip AD kisiti sanildi; hicbir
  // urun izleme+kelebek+vana UCUNU birden tasimadigindan "bulunamadı"
  // deniyordu. Kural: havuzu BOSALTAN ad-token kisit YAPILMAZ, nota duser;
  // kalan token'lar daraltir → fiyatli soru → secim ogrenilir (Karar #3).
  {
    const V = { kategori: 'Vanalar', sheetName: 'S' };
    const havuz = [
      prod({ ...V, ad: 'İzlenebilir kelebek vana', cins: 'wafer', cap: 'DN100', price: 3000, urunKodu: 'IK100' }),
      prod({ ...V, ad: 'Kelebek vana', cins: 'wafer', cap: 'DN100', price: 2500, urunKodu: 'K100' }),
      prod({ ...V, ad: 'Küresel vana', cins: 'pirinç', cap: 'DN100', price: 2000, urunKodu: 'KV100' }),
      // 'izleme' kelimesini dagarciga sokan urun (hastaligi tetikleyen)
      prod({ ...V, ad: 'Vana izleme anahtarı', cins: 'OS&Y', cap: 'DN100', price: 900, urunKodu: 'VIA100' }),
    ];
    const r = m('4"-DN100 İzleme Anahtarlı Kelebek Vana', havuz);
    const adlar = (r.candidates ?? []).map((c) => c.materialName);
    check('İ1 izleme anahtarli kelebek → SORU acilir (none DEGIL)',
      r.confidence === 'multi' && r.netPrice === 0, `got ${r.confidence} net=${r.netPrice} "${r.reason}"`);
    check('İ1 "İzlenebilir kelebek vana" ADAYLARDA (kullanici secebilir)',
      // NOT: /i bayragi Turkce 'İ'yi yakalamaz — tr locale ile kucult
      adlar.some((a) => a.toLocaleLowerCase('tr').includes('izlenebilir')), JSON.stringify(adlar));
    check('İ1 kuresel vana SIZMADI (kelebek daraltmasi calisti)',
      !adlar.some((a) => /küresel|kuresel/i.test(a)), JSON.stringify(adlar));

    // K8 KORUMASI: hicbir ad-token uygulanamiyorsa yine NONE — "çekvalf"
    // yokken tum vana ailesi ASLA listelenmez (147-aday hastaligi donmez).
    const r2 = m('ÇEKVALF DN100', havuz);
    check('İ2 K8 koruması: cekvalf yok → none (aile listesi ACILMAZ)',
      r2.confidence === 'none', `got ${r2.confidence} cand=${r2.candidates?.length}`);
  }

  // ══ Ç — CAPSIZ URUN ISTISNASI KAPISI (canli vaka 16.07: yiv makinesi) ══
  // "SPRİNK HATTI BORULARI DN50" (AYVAZ) → "Yiv açma makinesi" 373.825 TL
  // OTOMATIK yazildi: makine kategori fallback'iyle 'boru' ailesine cozulmus,
  // capi parse edilemedigi icin capsiz-istisna cap filtresini delmis, tek
  // kalinca K2 yazmisti. Kural: satirda cap YAZILIYKEN capsiz urune inen
  // TEK aday otomatik yazilmaz — onay listesi (I6: tahmini yazim yasak).
  {
    const makine = prod({ kategori: 'Boru Hazırlama', ad: 'Yiv açma makinesi', cins: 'TWG-II · TUWEI', price: 373825.8, urunKodu: 'TWG2' });
    // Saf cekirdek (alias'siz): canli vakada 'sprink hatti' kelimelerini
    // sozluk tuketiyordu; burada es davranisi yalin 'BORU DN50' verir.
    const r = m('BORU DN50', [makine]);
    check('Ç1 satir capli + urun capsiz + tek aday → OTOMATIK YAZILMAZ',
      r.confidence === 'multi' && r.netPrice === 0, `got ${r.confidence} net=${r.netPrice} matched=${r.matchedName}`);
    check('Ç1 nedeni soyluyor (capsiz/onay)',
      !!r.reason && /çap|onaylayın/i.test(r.reason), `got "${r.reason}"`);
    // Koruma: TUM kelimeleri dogrulanan satirda tek eslesme YINE yazilir (K2)
    const boru = prod({ kategori: 'Borular', ad: 'Çelik boru', cins: 'siyah', cap: 'DN50', price: 900, urunKodu: 'B50' });
    const r2 = m('SİYAH ÇELİK BORU DN50', [boru]);
    check('Ç2 tumu dogrulanmis satir + tek eslesme → yazilir (K2 korunur)',
      r2.confidence === 'high' && r2.netPrice === 900, `got ${r2.confidence} net=${r2.netPrice}`);

    // Ç3 (H6/A2/E9 kapisi): DOGRULANAMAYAN yazili kelime varken tek aday
    // otomatik YAZILMAZ — onay listesi + kelime acikca soylenir.
    const r3 = m('SPRİNK HATTI BORULARI DN50', [boru]);
    check('Ç3 dogrulanamayan kelime (sprink/hatti) + tek aday → ONAY listesi',
      r3.confidence === 'multi' && r3.netPrice === 0, `got ${r3.confidence} net=${r3.netPrice}`);
    check('Ç3 nedeni kelimeyi soyluyor',
      !!r3.reason && /doğrulanamadı/.test(r3.reason), `got "${r3.reason}"`);
  }

  // ══ S — AD-GEVSETME: cins ISABETLIYSE yanlis ad daraltmasi geri alinir ══
  // Canli vaka: "6\"-DN150 Swing Çek Vana" → urun "Çekvalf BC-100 ·
  // çalpara (swing)". Satirdaki 'vana' AD kisiti kelebek/kuresel'e daraltti
  // (Çekvalf adinda 'vana' yok), 'swing' cinsi onlari eledi → "yok" deniyordu.
  // Kural: cins AILE havuzunda TASINIYORSA ad daraltmasi gevsetilir ve
  // sonuc HER ZAMAN SORUDUR (fiyat yazilmaz — ad birebir eslesmedi cunku).
  {
    const V = { sheetName: 'S' };
    const havuz = [
      prod({ ...V, kategori: 'Çekvalfler', ad: 'Çekvalf BC-100', cins: 'çalpara (swing) · bronz (CC491K)', cap: '6"', price: 5000, urunKodu: 'BC150' }),
      prod({ ...V, kategori: 'Vanalar', ad: 'Kelebek vana', cins: 'wafer', cap: '6"', price: 2500, urunKodu: 'KV150' }),
      prod({ ...V, kategori: 'Vanalar', ad: 'Küresel vana', cins: 'pirinç', cap: '6"', price: 2000, urunKodu: 'KR150' }),
    ];
    const r = m('6"-DN150 Swing Çek Vana', havuz);
    const adlar = (r.candidates ?? []).map((c) => c.materialName);
    check('S1 swing cek vana → SORU acilir (yok DEGIL, yazilmaz da)',
      r.confidence === 'multi' && r.netPrice === 0, `got ${r.confidence} net=${r.netPrice} "${r.reason}"`);
    check('S1 Çekvalf (calpara swing) ADAYLARDA',
      adlar.some((a) => a.toLocaleLowerCase('tr').includes('çekvalf') || a.toLocaleLowerCase('tr').includes('cekvalf')),
      JSON.stringify(adlar));
    // K6/K8 koruması: gevsetme CILGIN aday uretmez — cins isabetli olsa da
    // CAP tutmuyorsa sonuc yine YOK (cap serttir, gevsetilmez).
    const kucukCekvalf = prod({ ...V, kategori: 'Çekvalfler', ad: 'Çekvalf BC-100', cins: 'çalpara (swing) · bronz', cap: '2"', price: 900, urunKodu: 'BC50' });
    const r2 = m('6" Swing Kelebek Vana', [kucukCekvalf, havuz[1]]);
    check('S2 gevsetme cap SERTLIGINI asamaz → none',
      r2.confidence === 'none', `got ${r2.confidence} net=${r2.netPrice} "${r2.reason}"`);
  }

  // ══ S5: SATIR ETIKETLEME BOSLUKLARI (Aksa gercek dosya olcumu) ═══
  // Olcum araci: test/audit-real-excel.ts — aile cozumu %62'ydi; bosluklar
  // GENEL kurallarla kapatildi (ornege ozel desen YOK).
  {
    // Hizmet/is kalemleri fiyat BEKLENMEYEN satirdir (R12 ailesi).
    for (const q of ['Kazı Dolgu', 'Çelik İmalatlar', 'Boru Boyama İşleri',
      'PROJELENDİRME-MÜHENDİSLİK', 'Ürünlerin Sahaya Sevki, Yatay Düşey Taşıma']) {
      check(`S5 hizmet satiri → notProduct: "${q}"`, parseLine(q).notProduct === true);
    }
    // 'imalat' SATIR SONUNA demirli — urun adinin ortasindaki "özel imalat"
    // niteligi urunu YUTMAZ (yanlis susturma olmaz).
    const ozel = parseLine('Özel imalat çelik kolektör DN80');
    check('S5 "özel imalat ... kolektör" URUN kalir', ozel.notProduct !== true && ozel.familySlug === 'kolektor',
      `got notProduct=${ozel.notProduct} aile=${ozel.familySlug}`);

    // Yeni aileler / es anlamlilar
    const noz = parseLine('Orta Hızlı Su Püskürtme Nozulu, K:22');
    check('S5 nozul ailesi cozulur', noz.familySlug === 'nozul', `got ${noz.familySlug}`);
    const plug = parseLine('Blow-off plug');
    check('S5 "plug" → fitting (tapa es anlamlisi)', plug.familySlug === 'fitting', `got ${plug.familySlug}`);
    const kabin = parseLine('Vana İstasyonu Kabini');
    check('S5 kabin — vana YANLIS POZITIFI bitti', kabin.familySlug === 'kabin', `got ${kabin.familySlug}`);
    const kol = parseLine('1.Ünite Trafolar Kollektör Grubu');
    check('S5 cift-L "kollektör" → kolektor', kol.familySlug === 'kolektor', `got ${kol.familySlug}`);
  }

  // ══ E3: ADAY KARTI NITELIK-FARKI UYARISI (Faz 2b backlog'undan) ══
  // "68°C istendi — bu ürün 141°C": satirin yapilandirilmis nitelikleri
  // (temp/K/montaj/uzunluk/govde) adayla karsilastirilir. ELEMEZ (Karar #3),
  // yalniz soru kartinda isaretler. FE alani hazir (ExcelGrid c.uyari).
  {
    const S = { kategori: 'Sprinkler', birim: 'adet', paraBirimi: 'TL', sheetName: 'S' };
    const havuz = [
      prod({ ...S, ad: 'Sprinkler', cins: '141°C kırmızı · upright', cap: '1/2"', price: 90, urunKodu: 'S141' }),
      prod({ ...S, ad: 'Sprinkler', cins: '182°C yeşil · upright', cap: '1/2"', price: 95, urunKodu: 'S182' }),
    ];
    // Markada 68°C YOK → '68°c' taninmaz (Karar #3: kisit degil, soru) —
    // adaylar farkli sicaklik tasidigi icin UYARILI gelir.
    const r = m('Sprinkler 68°C 1/2"', havuz);
    check('E3 fiyat yazilmadi (soru acildi)', r.confidence === 'multi' && r.netPrice === 0,
      `got ${r.confidence} net=${r.netPrice}`);
    const uyarilar = (r.candidates ?? []).map((c) => c.uyari ?? '');
    check('E3 farkli sicaklik adayi UYARILI (68°C istendi — 141°C)',
      uyarilar.some((u) => u.includes('68°C istendi') && u.includes('141°C')), JSON.stringify(uyarilar));
    check('E3 TUM farkli-sicaklik adaylari isaretli (182°C dahil)',
      uyarilar.some((u) => u.includes('182°C')), JSON.stringify(uyarilar));

    // Ayni sicaklik markada VARSA soru acilmaz — dogrudan tek eslesme,
    // uyari kavrami dogmaz (nitelik zaten kisit olarak calisti).
    const havuz2 = [...havuz,
      prod({ ...S, ad: 'Sprinkler', cins: '68°C · upright', cap: '1/2"', price: 85, urunKodu: 'S68' })];
    const r2 = m('Sprinkler 68°C 1/2"', havuz2);
    check('E3 sicaklik markada varsa TEK eslesme (uyari gerekmez)',
      r2.confidence === 'high' && r2.netPrice === 85, `got ${r2.confidence} net=${r2.netPrice} "${r2.reason}"`);

    // K-faktoru — S5 nozul ailesiyle birlikte (Aksa gercek vakasi):
    // satir K:22 istiyor, markada yalniz K=33 var → soru + uyari.
    const N = { kategori: 'Su Sisi', birim: 'adet', paraBirimi: 'TL', sheetName: 'S' };
    const nozulHavuz = [
      prod({ ...N, ad: 'Su püskürtme nozulu', cins: 'K=33 orta hızlı', cap: '1/2"', price: 60, urunKodu: 'N33' }),
      prod({ ...N, ad: 'Su püskürtme nozulu', cins: 'K=56 yüksek hızlı', cap: '1/2"', price: 75, urunKodu: 'N56' }),
    ];
    const rn = m('Orta Hızlı Su Püskürtme Nozulu 1/2" K:22', nozulHavuz);
    check('E3+S5 nozul satiri soruya duser (K:22 markada yok)',
      rn.confidence === 'multi' && rn.netPrice === 0, `got ${rn.confidence} net=${rn.netPrice} "${rn.reason}"`);
    const nUyari = (rn.candidates ?? []).map((c) => c.uyari ?? '');
    check('E3 K-faktoru farki isaretli (K=22 istendi — K=33)',
      nUyari.some((u) => u.includes('K=22 istendi') && u.includes('K=33')), JSON.stringify(nUyari));

    // Nitelik tasimayan satir → uyari uretilmez (bos kalir, gurultu yok).
    const rd = m('Sprinkler 1/2"', havuz);
    check('E3 niteliksiz satirda uyari YOK',
      (rd.candidates ?? []).every((c) => !c.uyari), JSON.stringify((rd.candidates ?? []).map((c) => c.uyari)));
  }

  // ══ BOY GORUNURLUGU (canli vaka 17.07 — hidrant) ═════════════════
  // 4 "Yerüstü yangın hidrantı" adayi yalniz BOYLA ayrisiyordu; kartlarda
  // ozdes gorunuyor, fiyat farkinin nedeni anlasilamiyordu. gorunenAd
  // displayName'e boy'u ekler (indekste degil — reindex gerektirmez).
  {
    const H = { kategori: 'Yangın / Hidrant', cins: 'GG-25 pik döküm gövde · paslanmaz çelik hareket mili',
      baglanti: 'flanşlı (PN16)', birim: 'adet', paraBirimi: 'TL', sheetName: 'S' };
    const havuz = [
      prod({ ...H, ad: 'Yerüstü yangın hidrantı', cap: 'DN100', boy: 1300, price: 32700, urunKodu: 'H1300' }),
      prod({ ...H, ad: 'Yerüstü yangın hidrantı', cap: 'DN100', boy: 1700, price: 38580, urunKodu: 'H1700' }),
      prod({ ...H, ad: 'Yerüstü yangın hidrantı', cap: 'DN100', boy: 2150, price: 44440, urunKodu: 'H2150' }),
    ];
    const r = m('Yerüstü yangın hidrantı DN100', havuz);
    check('BOY: soru acildi, fiyat yazilmadi', r.confidence === 'multi' && r.netPrice === 0,
      `got ${r.confidence} net=${r.netPrice}`);
    const adlar = (r.candidates ?? []).map((c) => c.materialName);
    check('BOY: her aday adinda BOY gorunur (1300/1700/2150 mm)',
      adlar.some((a) => a.includes('1300 mm')) && adlar.some((a) => a.includes('1700 mm')) && adlar.some((a) => a.includes('2150 mm')),
      JSON.stringify(adlar));
    check('BOY: aday adlari birbirinden AYRISIR (ozdes kart kalmadi)',
      new Set(adlar).size === adlar.length, JSON.stringify(adlar));
    // Boy'suz urunun adi DEGISMEZ (gereksiz ek yok)
    const V = { kategori: 'Vanalar', birim: 'adet', paraBirimi: 'TL', sheetName: 'S' };
    const r2 = m('Küresel vana DN25', [
      prod({ ...V, ad: 'Küresel vana', cins: 'pirinç', cap: 'DN25', price: 850, urunKodu: 'KV25' })]);
    check('BOY: boysuz urunde ada " mm" EKLENMEZ',
      r2.confidence === 'high' && !!r2.matchedName && !r2.matchedName.includes(' mm'),
      `got "${r2.matchedName}"`);
  }

  // ══ DISPATCH: MatchingService UZERINDEN v2 yolu ══════════════════
  // Yukaridaki testler SAF cekirdegi kanitliyor. Bu blok GERCEK servisi
  // (marka bazli dispatch + matchV2 + havuz esleme + M3) kosturuyor —
  // yani cekirdegin dogru BAGLANDIGINI. Bugun ucu de "test yesil, gercek
  // kirik" deseninden cikan bug'lar tam bu bosluktan gecmisti.
  await dispatchTestleri();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`INDEKSLI MOTOR KABUL (K1-K7 + fallback yasagi): ${passed} PASS, ${failed} FAIL`);
  if (failures.length) { console.log('\nBASARISIZ:'); for (const f of failures) console.log(`  ✗ ${f}`); }
  process.exit(failed > 0 ? 1 : 0);
}

run();
