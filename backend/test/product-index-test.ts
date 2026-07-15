/**
 * URUN INDEKSLEYICI — Birim Testi (Faz 1)
 *   npx ts-node test/product-index-test.ts   (npm run test:product-index)
 *
 * Vakalar kullanicinin GERCEK Ayvaz dosyasindan alindi (Ayvaz S5-161 TAM):
 *   Kategori | Malzeme Adi | Malzeme Cinsi | Baglanti Sekli | Cap | Boy |
 *   Birim | Birim Fiyat | Para Birimi | Urun Kodu | Not
 *
 * Bu dosya SAF indeksleyiciyi test eder — DB yok, motor yok.
 */

import {
  buildProductIndex, buildRowKey, tokenize, resolveFamily,
  resolveProductSizeClass, buildBoyTag, BELIRSIZ_SLUG, type ProductColumns,
} from '../src/modules/matching/index/product-index';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Gercek Ayvaz satiri (ekran goruntusundeki 540. satir) */
const AYVAZ_FLANSLI_DN65: ProductColumns = {
  kategori: 'Dilatasyon Omega V-Flex',
  ad: 'Omega V-Flex dilatasyon kompansatörü',
  cins: 'V-Flex - X,Y,Z ±40 mm hareket',
  baglanti: 'flanşlı',
  cap: 'DN65',
  boy: null,
  birim: 'adet',
  price: 27415,
  paraBirimi: 'TL',
  urunKodu: '702090303070',
  not: 'paslanmaz hortum + örgü · St 37.2 dirsek · 175 PSI (FM)',
  sheetName: 'Ayvaz S5-161 TAM',
};

/** Gercek Ayvaz satiri (556. satir — AYNI urun, FARKLI baglanti + inc cap) */
const AYVAZ_KAYNAK_1INCH: ProductColumns = {
  ...AYVAZ_FLANSLI_DN65,
  baglanti: 'kaynak boyunlu',
  cap: '1"',
  price: 13680,
  urunKodu: '702090301030',
};

function run() {
  // ══ P1: 11 KOLONUN HICBIRI DUSMEZ ═══════════════════════════════════
  // Bugunku hat Baglanti/Boy/Kategori/Not'u tamamen dusuruyor, Urun Kodu'nu
  // okuyup atiyor (admin.service.ts:482-491'de regex'leri YOK).
  {
    const f = buildProductIndex(AYVAZ_FLANSLI_DN65);
    check('P1 baglanti korundu (bugun DUSUYOR)', f.baglantiNorm === 'flansli', `got "${f.baglantiNorm}"`);
    check('P1 cap korundu', f.capNorm === 'DN 65', `got "${f.capNorm}"`);
    check('P1 displayName 4 kolonu birlestirir',
      f.displayName === 'Omega V-Flex dilatasyon kompansatörü · V-Flex - X,Y,Z ±40 mm hareket · flanşlı · DN65',
      `got "${f.displayName}"`);
  }

  // ══ P2: AILE COZUMU — Ad kolonundan, sozlukle (f59fe17) ═════════════
  {
    check('P2 "Omega V-Flex dilatasyon kompansatörü" → kompansator',
      resolveFamily('Omega V-Flex dilatasyon kompansatörü') === 'kompansator',
      `got ${resolveFamily('Omega V-Flex dilatasyon kompansatörü')}`);
    check('P2 "Dilatasyon kompansatörü" → kompansator',
      resolveFamily('Dilatasyon kompansatörü') === 'kompansator');
    check('P2 yalin "Kompansatör" → kompansator (ust aile, K5 girdisi)',
      resolveFamily('Kompansatör') === 'kompansator');
    check('P2 "Küresel Vana" → vana', resolveFamily('Küresel Vana') === 'vana',
      `got ${resolveFamily('Küresel Vana')}`);
    check('P2 "Sprinkler borusu" → boru', resolveFamily('Sprinkler borusu') === 'boru',
      `got ${resolveFamily('Sprinkler borusu')}`);
  }

  // ══ P3: AILE KELIMESI DUSER — Turkce ek tuzagi ══════════════════════
  // Urun "kompansatörü" (ekli), teklif "Kompansatör" (eksiz) yazar. Token
  // olarak "kompansatoru" ≠ "kompansator" — ESLESMEZ. Ikisi de aile kelimesi
  // oldugu icin ikisi de duser; geriye GERCEK ayirt ediciler kalir.
  {
    const f = buildProductIndex(AYVAZ_FLANSLI_DN65);
    check('P3 adTokens aile kelimesini TASIMAZ', !f.adTokens.some((t) => t.startsWith('kompansator')),
      `got ${JSON.stringify(f.adTokens)}`);
    check('P3 adTokens ayirt ediciyi TASIR (dilatasyon)', f.adTokens.includes('dilatasyon'),
      `got ${JSON.stringify(f.adTokens)}`);
    check('P3 adTokens marka/seri token\'ini TASIR (omega)', f.adTokens.includes('omega'),
      `got ${JSON.stringify(f.adTokens)}`);

    // K1'in cekirdegi: teklifin token'lari urununkinin ALT KUMESI mi?
    const teklif = tokenize('Dilatasyon kompansatörü').filter((t) => !t.startsWith('kompansator'));
    check('P3 K1: teklif {dilatasyon} ⊆ urun adTokens',
      teklif.every((t) => f.adTokens.includes(t)), `teklif=${JSON.stringify(teklif)} urun=${JSON.stringify(f.adTokens)}`);

    // Farkli alt-ad ELENMELI
    const metal = buildProductIndex({ ...AYVAZ_FLANSLI_DN65, ad: 'Eksenel metal körüklü kompansatör', urunKodu: 'X1' });
    check('P3 K1: "Dilatasyon" ⊄ "Eksenel metal körüklü" (alt-ad elenir)',
      !teklif.every((t) => metal.adTokens.includes(t)), `metal=${JSON.stringify(metal.adTokens)}`);
    check('P3 iki alt-ad AYNI ailede (havuz kompansatorle sinirli)',
      metal.adSlug === 'kompansator' && f.adSlug === 'kompansator');
    check('P3 iki alt-ad FARKLI bucket (K5 sorusunun secenekleri)',
      metal.adBucket !== f.adBucket, `${metal.adBucket} vs ${f.adBucket}`);
  }

  // ══ P4: CAP ON-HESAP — DN ve inc AYNI kanonik tabana iner ═══════════
  // PRD: "teklifteki 2\" ile kutuphanedeki DN50 INDEKS duzeyinde eslesir;
  // sorgu aninda cevrim aramaz."
  {
    const flansli = buildProductIndex(AYVAZ_FLANSLI_DN65);      // DN65
    const kaynak = buildProductIndex(AYVAZ_KAYNAK_1INCH);       // 1"
    check('P4 DN65 → capTags [dn65]', JSON.stringify(flansli.capTags) === '["dn65"]',
      `got ${JSON.stringify(flansli.capTags)}`);
    check('P4 1" → capTags [dn25] (inc→DN kanonik)', JSON.stringify(kaynak.capTags) === '["dn25"]',
      `got ${JSON.stringify(kaynak.capTags)}`);

    // Ayni urunun 2 1/2" hali DN65 ile AYNI tag'e inmeli
    const kaynak65 = buildProductIndex({ ...AYVAZ_KAYNAK_1INCH, cap: '2 1/2"', urunKodu: 'X2' });
    check('P4 2 1/2" ve DN65 AYNI capTag → indekste bulusurlar',
      JSON.stringify(kaynak65.capTags) === JSON.stringify(flansli.capTags),
      `${JSON.stringify(kaynak65.capTags)} vs ${JSON.stringify(flansli.capTags)}`);
    check('P4 sizeClass urunun KENDI kolonundan (celik dirsek notu yok, aile DN\'li)',
      flansli.sizeClass === 'steel', `got ${flansli.sizeClass}`);
  }

  // ══ P5: BAGLANTI token alt-kumesi — K3/K4 ═══════════════════════════
  {
    const doner = buildProductIndex({ ...AYVAZ_FLANSLI_DN65, baglanti: 'döner flanşlı', urunKodu: 'D1' });
    const sabit = buildProductIndex({ ...AYVAZ_FLANSLI_DN65, baglanti: 'sabit flanşlı', urunKodu: 'S1' });
    check('P5 "döner flanşlı" ham korunur (kanoniklestirilmez)', doner.baglantiNorm === 'doner flansli',
      `got "${doner.baglantiNorm}"`);
    check('P5 doner/sabit FARKLI baglantiNorm (K3 cevap secenekleri)',
      doner.baglantiNorm !== sabit.baglantiNorm);

    // K3: teklif yalniz "flanşlı" der → IKISI de hayatta → Baglanti sorulur
    const q1 = tokenize('flanşlı');
    check('K3 teklif {flansli} ⊆ doner VE sabit → ikisi de aday → soru',
      q1.every((t) => doner.baglantiTokens.includes(t)) && q1.every((t) => sabit.baglantiTokens.includes(t)),
      `q=${JSON.stringify(q1)} doner=${JSON.stringify(doner.baglantiTokens)} sabit=${JSON.stringify(sabit.baglantiTokens)}`);

    // K4: teklif "döner flanşlı" der → yalniz doner → sert filtre
    const q2 = tokenize('döner flanşlı');
    check('K4 teklif {doner,flansli} ⊆ doner ✓ / ⊄ sabit ✗ → sert filtre',
      q2.every((t) => doner.baglantiTokens.includes(t)) && !q2.every((t) => sabit.baglantiTokens.includes(t)),
      `q=${JSON.stringify(q2)}`);

    // extractConnection'in tanimadigi deger de kurtarilir
    const kaynak = buildProductIndex(AYVAZ_KAYNAK_1INCH);
    check('P5 "kaynak boyunlu" korundu (extractConnection null donuyor)',
      kaynak.baglantiNorm === 'kaynak boyunlu', `got "${kaynak.baglantiNorm}"`);
  }

  // ══ P6: rowKey / K7 — kimlik DEMET, kod yalniz BIR BILESEN ══════════
  {
    const s1 = buildProductIndex(AYVAZ_FLANSLI_DN65);
    const s2 = buildProductIndex({ ...AYVAZ_FLANSLI_DN65, sheetName: 'Ayvaz S5-161 KISA', price: 30000 });
    check('K7 ayni Urun Kodu + FARKLI sayfa → FARKLI rowKey (biri digerini ezmez)',
      s1.rowKey !== s2.rowKey, `${s1.rowKey} vs ${s2.rowKey}`);

    // ── GERCEK VAKA (Armaş 240-242): Urun Kodu bir SKU degil, MODEL kodu.
    // Uc farkli cap AYNI kodu ("EL") tasiyor. Kimligi koda baglarsak ucu de
    // tek kayda coker — 12 dosyada 5506 satir boyle yutuluyordu.
    const el50 = buildProductIndex({ kategori: 'Kontrol Vanaları (Model Serisi)', ad: 'El', cins: 'Pik Döküm (GG25)', baglanti: 'Flanşlı', cap: '50 mm', price: 374, urunKodu: 'EL', sheetName: 'ARMAŞ Fiyat Listesi' });
    const el65 = buildProductIndex({ kategori: 'Kontrol Vanaları (Model Serisi)', ad: 'El', cins: 'Pik Döküm (GG25)', baglanti: 'Flanşlı', cap: '65 mm', price: 389, urunKodu: 'EL', sheetName: 'ARMAŞ Fiyat Listesi' });
    check('K7 KRITIK: ayni MODEL kodu ("EL") + farkli cap → FARKLI rowKey',
      el50.rowKey !== el65.rowKey, `ikisi de ${el50.rowKey}`);
    check('K7 kod tekil anahtar DEGIL, demetin bir bileseni (PRD 2A)',
      el50.rowKey !== el65.rowKey && el50.adBucket === el65.adBucket);

    // Idempotent: ayni satir ikinci kez → AYNI rowKey → UPDATE → id korunur
    const tekrar = buildProductIndex({ ...AYVAZ_FLANSLI_DN65, price: 29999 });
    check('P6 ayni satir tekrar yuklenince AYNI rowKey (upsert → id korunur → iskonto yasar)',
      s1.rowKey === tekrar.rowKey, `${s1.rowKey} vs ${tekrar.rowKey}`);
    check('P6 rowKey fiyattan BAGIMSIZ (fiyat degisti, kimlik ayni)',
      s1.rowKey === tekrar.rowKey);

    // Kodsuz satir (tas yunu ceket gibi) → ad+cins+baglanti+cap+boy kimligi
    const kodsuz1 = buildProductIndex({ ...AYVAZ_FLANSLI_DN65, urunKodu: null });
    const kodsuz2 = buildProductIndex({ ...AYVAZ_FLANSLI_DN65, urunKodu: null, baglanti: 'kaynak boyunlu' });
    check('K7 kodsuz satirlar da indekse girer ve BAGLANTI ile ayrisir',
      kodsuz1.rowKey !== kodsuz2.rowKey, `${kodsuz1.rowKey} vs ${kodsuz2.rowKey}`);

    // ── Bugunku hattin YAPISAL EZME BUG'I burada kapaniyor:
    // Material.name = ad+cins+cap (baglanti YOK) → bu iki satir ayni ada
    // dusup upsert ile birbirini eziyordu (admin.service.ts:588-591 + :924).
    check('K7 KRITIK: ad+cins+cap AYNI, yalniz baglanti farkli → AYRI kayit',
      kodsuz1.rowKey !== kodsuz2.rowKey && kodsuz1.adBucket === kodsuz2.adBucket
      && kodsuz1.cinsNorm === kodsuz2.cinsNorm && kodsuz1.capNorm === kodsuz2.capNorm);
  }

  // ══ P6b: AILE — Ad cozmezse KATEGORI baglami (gercek vaka: Armaş) ═══
  {
    // Armaş 179: 'vana' kelimesi ADda YOK, KATEGORIde var. Ad'i tek kaynak
    // yapinca 12 dosyada %20 satir eslestirmeye giremiyordu (Armaş %20→%0).
    check('P6b Ad cozmuyor + Kategori "…Kelebek Vana" → vana',
      resolveFamily('ARMAŞ İZLENEBİLİR KELEBEK', 'İzlenebilir Kelebek Vana') === 'vana',
      `got ${resolveFamily('ARMAŞ İZLENEBİLİR KELEBEK', 'İzlenebilir Kelebek Vana')}`);
    check('P6b kategorisiz ayni ad → cozulemez (fallback GERCEKTEN gerekli)',
      resolveFamily('ARMAŞ İZLENEBİLİR KELEBEK') === null);
    check('P6b Ad cozuyorsa kategori KARISMAZ (ad otoritedir)',
      resolveFamily('Dilatasyon kompansatörü', 'Vanalar') === 'kompansator',
      `got ${resolveFamily('Dilatasyon kompansatörü', 'Vanalar')}`);
    const armas = buildProductIndex({ kategori: 'İzlenebilir Kelebek Vana', ad: 'ARMAŞ İZLENEBİLİR KELEBEK', cins: '—', cap: '50 mm', price: 156, sheetName: 'ARMAŞ Fiyat Listesi' });
    check('P6b kategori fallback\'li satir belirsiz DEGIL → eslestirmeye girer',
      armas.belirsiz === false && armas.adSlug === 'vana', `got ${armas.adSlug} belirsiz=${armas.belirsiz}`);
  }

  // ══ P6c: SOZLUK v1.1 — 12 gercek listede olculen aile bosluklari ════
  // Bu girdiler tahminle degil, 15487 gercek satir taranarak eklendi
  // (belirsiz %20 → %4). Her biri kac satir kurtardigi ile birlikte.
  {
    // Yalin aile ismi eksikligi (desenler yalniz cok-kelimeli ifadelerdi)
    check('P6c "Somunlu Kelepçe" → kelepce (Norm, 293 satir)',
      resolveFamily('Somunlu Kelepçe') === 'kelepce', `got ${resolveFamily('Somunlu Kelepçe')}`);
    check('P6c "Buhar sayacı (vorteks)" → sayac (Ayvaz, 29)',
      resolveFamily('Buhar sayacı (vorteks)') === 'sayac', `got ${resolveFamily('Buhar sayacı (vorteks)')}`);
    check('P6c yalin ad OZEL ifadeyi bozmaz: "kalorimetre sayacı" → kalorimetre',
      resolveFamily('kalorimetre sayacı') === 'kalorimetre', `got ${resolveFamily('kalorimetre sayacı')}`);
    // Yazim varyanti: sozluk 'seperator', gercek liste 'separatör'
    check('P6c "Buhar separatörü" → seperator (yazim varyanti, Ayvaz 36)',
      resolveFamily('Buhar separatörü') === 'seperator', `got ${resolveFamily('Buhar separatörü')}`);

    // Emniyet ventili = VANA (143 satir: Ayvaz 122 + Duyar 21)
    check('P6c "Emniyet ventili" → vana', resolveFamily('Emniyet ventili') === 'vana',
      `got ${resolveFamily('Emniyet ventili')}`);
    // ⚠ EN KRITIK KORUMA: /ventil/ yalin haliyle "ventilatör"u yakalar ve
    // FANI VANA SANIRDI. Kelime siniri (\b) bunu engelliyor. Bu iddia
    // duserse once nedenini anla — regex'ten \b silinmis demektir.
    check('P6c ⚠ "Aksiyel ventilatör" VANA DEGIL (fan) — \\b korumasi',
      resolveFamily('Aksiyel ventilatör') !== 'vana', `got ${resolveFamily('Aksiyel ventilatör')}`);
    check('P6c ⚠ "Çatı ventilatörü" VANA DEGIL', resolveFamily('Çatı ventilatörü') !== 'vana',
      `got ${resolveFamily('Çatı ventilatörü')}`);

    // Ek parca alt-adlari → fitting (~600 satir)
    check('P6c "Tapa" → fitting (Trakya, 164)', resolveFamily('Tapa') === 'fitting',
      `got ${resolveFamily('Tapa')}`);
    check('P6c "PVC-U Çift Çatal 87°" → fitting (Kalde/Wavin)',
      resolveFamily('PVC-U Çift Çatal 87°') === 'fitting', `got ${resolveFamily('PVC-U Çift Çatal 87°')}`);
    check('P6c "İstavroz" → fitting (Hakan)', resolveFamily('İstavroz') === 'fitting',
      `got ${resolveFamily('İstavroz')}`);
    check('P6c "ES Sifonu 87,5°" → fitting (Wavin, 89)',
      resolveFamily('ES Sifonu 87,5°') === 'fitting', `got ${resolveFamily('ES Sifonu 87,5°')}`);
    // sifon eklendi — vitrifiye ailesinden CALMAMALI
    check('P6c ⚠ "Asma klozet" hala vitrifiye (sifon eklemesi calmadi)',
      resolveFamily('Asma klozet') === 'vitrifiye', `got ${resolveFamily('Asma klozet')}`);

    // Yeni aileler
    check('P6c "Pislik tutucu" → pislik-tutucu (Ayvaz 60 + Duyar 44)',
      resolveFamily('Pislik tutucu') === 'pislik-tutucu', `got ${resolveFamily('Pislik tutucu')}`);
    check('P6c pislik-tutucu ile yer suzgeci AYRI aile',
      resolveFamily('Yer süzgeci') === 'suzgec' && resolveFamily('Pislik tutucu') === 'pislik-tutucu');
    check('P6c "Klingrit Conta" → conta (Sardogan 29)', resolveFamily('Klingrit Conta') === 'conta',
      `got ${resolveFamily('Klingrit Conta')}`);
    check('P6c "Saç Gömlekli Dübel" → dubel (Norm 38)', resolveFamily('Saç Gömlekli Dübel') === 'dubel',
      `got ${resolveFamily('Saç Gömlekli Dübel')}`);
    check('P6c "Kapasitif seviye elektrodu" → seviye-elektrodu (Ayvaz 28)',
      resolveFamily('Kapasitif seviye elektrodu') === 'seviye-elektrodu',
      `got ${resolveFamily('Kapasitif seviye elektrodu')}`);
    check('P6c "Dişli kutusu" → aktuator (Duyar 22)', resolveFamily('Dişli kutusu') === 'aktuator',
      `got ${resolveFamily('Dişli kutusu')}`);
  }

  // ══ P7: BELIRSIZ — aile cozulemedi → eslestirmeye giremez ═══════════
  // PRD 2A: "sessizce yanlis eslesmektense gorunur sekilde eksik kal"
  {
    const f = buildProductIndex({ ...AYVAZ_FLANSLI_DN65, ad: 'Zxqw Blorp 9000', kategori: null, urunKodu: 'Z1' });
    check('P7 aile cozulemedi → belirsiz=true', f.belirsiz === true, `got ${f.belirsiz}`);
    check('P7 belirsiz satir BELIRSIZ_SLUG tasir', f.adSlug === BELIRSIZ_SLUG, `got ${f.adSlug}`);
    check('P7 cozulen satir belirsiz DEGIL', buildProductIndex(AYVAZ_FLANSLI_DN65).belirsiz === false);
    const bosAd = buildProductIndex({ ...AYVAZ_FLANSLI_DN65, ad: '', kategori: null, urunKodu: 'B1' });
    check('P7 bos Ad → belirsiz', bosAd.belirsiz === true);
  }

  // ══ P8: yardimcilar ═════════════════════════════════════════════════
  {
    check('P8 buildBoyTag(500) → len-500', buildBoyTag(500) === 'len-500');
    check('P8 buildBoyTag("500") → len-500 (Excel metin verebilir)', buildBoyTag('500') === 'len-500');
    check('P8 buildBoyTag(null) → null', buildBoyTag(null) === null);
    check('P8 buildBoyTag(0) → null (gecersiz)', buildBoyTag(0) === null);
    check('P8 tokenize gurultuyu atar', !tokenize('Kompansatör adet komple').includes('adet'),
      `got ${JSON.stringify(tokenize('Kompansatör adet komple'))}`);
    check('P8 tokenize tek harfi atar (x,y,z gurultusu)',
      !tokenize('V-Flex - X,Y,Z ±40 mm hareket').some((t) => t.length < 2),
      `got ${JSON.stringify(tokenize('V-Flex - X,Y,Z ±40 mm hareket'))}`);
    check('P8 resolveProductSizeClass PPR → plastic',
      resolveProductSizeClass('PPR-C Boru', 'PN20') === 'plastic');
    check('P8 buildRowKey saf/deterministik (ayni girdi → ayni cikti)',
      buildProductIndex(AYVAZ_FLANSLI_DN65).rowKey === buildProductIndex(AYVAZ_FLANSLI_DN65).rowKey);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`URUN INDEKSLEYICI (P1-P8 + K1/K3/K4/K7): ${passed} PASS, ${failed} FAIL`);
  if (failures.length) {
    console.log(`\nBASARISIZ:`);
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

run();
