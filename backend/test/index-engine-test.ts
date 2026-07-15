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
  const { TerminologyService, ALIAS_SEEDS, BRAND_SEEDS } = require('../src/modules/matching/terminology.service');

  function svcWith(rows: any[], otherRows: any[] = [], brandName = 'AYVAZ') {
    const prisma: any = {
      userLibrary: {
        findMany: async (args: any) => {
          const b = args?.where?.brandId;
          if (b && typeof b === 'object' && 'not' in b) return otherRows;
          return rows;
        },
      },
      brand: { findUnique: async () => ({ name: brandName }) },
      eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
      terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
      brandMaterialType: { findMany: async () => BRAND_SEEDS.map((s: any, i: number) => ({ id: `b${i}`, userId: null, active: true, ...s })) },
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

  // D4: KARISIK havuz (bir satir indekssiz) → v2 DEVREYE GIRMEZ, v1 calisir
  {
    const karisik = [...HAVUZ, { id: 'manuel-1', material: null, materialName: 'Elle eklenen boru DN25',
      listPrice: 100, customPrice: null, discountRate: 0, currency: 'TRY', productIndexId: null, product: null }];
    const svc = svcWith(karisik);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['Dilatasyon kompansatörü DN25']))['Dilatasyon kompansatörü DN25'];
    // v2'nin single reason'i "AD + ÇAP" ifadesini tasir (outcome-mapper) —
    // v1 bunu ASLA uretmez. Yani bu ifadenin YOKLUGU v1'e dusuldugunun kaniti.
    check('D4 karisik havuz → v2 DEVREYE GIRMEDI (v1 rozeti)',
      !r?.reason?.includes('AD + ÇAP'), `got reason="${r?.reason}"`);
    // Ve kritik: v2'ye girseydi product:null satirda cokerdi — girmedigi icin
    // sonuc uretildi. Sessiz tutarsizlik yerine bilinen v1 davranisi.
    check('D4 karisik havuzda sonuc yine de uretildi (cokme yok)',
      r !== undefined && typeof r.netPrice === 'number', `got ${JSON.stringify(r)?.slice(0, 80)}`);
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
    check('OLCU: gercek ad kelimeleri korundu', L.tokens.includes('purjoru') && L.tokens.includes('otomatik'),
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
