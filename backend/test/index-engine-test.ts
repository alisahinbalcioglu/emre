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

function run() {
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

  console.log(`\n${'='.repeat(60)}`);
  console.log(`INDEKSLI MOTOR KABUL (K1-K7 + fallback yasagi): ${passed} PASS, ${failed} FAIL`);
  if (failures.length) { console.log('\nBASARISIZ:'); for (const f of failures) console.log(`  ✗ ${f}`); }
  process.exit(failed > 0 ? 1 : 0);
}

run();
