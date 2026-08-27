/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  EK — ERKEN 'none' DONUSLERINDE VARYANT KURTARMASI  (`npm run test:erken-kurtarma`)
 *
 *  26.08/27.08 turu. E2 (26.08) kurtarmayi yalniz `cap-yok` donusune baglamisti.
 *  Geriye UC erken donus kaldi — hepsi "satirda YAZILI nitelik havuzu bosaltti"
 *  sinifindan:
 *    · cins ekseni      (`kriter-yok`, yazili cins + ad-gevsetme de bos)
 *    · yuzey celiskisi  (`yuzey-celiskisi`, AND ve OR havuzlari bos)
 *    · baglanti ekseni  (`kriter-yok`, yazili baglanti + ad-gevsetme de bos)
 *  Uc noktada da kurtarma havuzu (`varyantKurtarma`, cins/yuzey/baglanti
 *  suzgeclerinden ONCE alinir) DOLUYDU ama hic sorulmuyordu: kullanicinin ACIK
 *  surukleme secimi hedef capta kutuphanede DURURKEN motor "yok" diyordu.
 *
 *  ⚠ BU NOKTALARDA CAP SUZGECI HENUZ KOSMADI — bu yuzden `erkenKurtar` KENDI
 *  cap suzgecini kendi kurar. Suzgecsiz cagri OLCULMUS PARA HATASI uretir:
 *  hedef DN100 iken havuzdaki DN50'nin fiyati yazilir. Asagidaki her A/B
 *  ciftinin B'si tam olarak o kapiyi olcer.
 *
 *  KAPILAR: (a) capsiz satirda calismaz · (b) sinif `rows`tan cozulur ·
 *  (c) `ambiguous` (celik+plastik BIRLESIMI) → hic kurtarma.
 *  Cevrimsiz olcu icin AYRI kapi YOK — gereksiz oldugu olculdu (`capAutoYasak`
 *  zaten kesiyor; kapi koymak kalemi ekrandan GIZLERDI, S4 ile celisir).
 *
 *  BU PAKET AYRICA IKI KUSURU DAHA KILITLER:
 *   · SINIF UYUMU (EK-18): cap tag ad uzayi asiri yuklu — `dn25` celikte
 *     DN25 (1"), plastikte 25 mm (3/4"). Capraz-sinif kiyasi K1'DEN ONCE DE
 *     vardi ve celik DN25'in 999 TL'sini bir 3/4" satirina OTOMATIK yaziyordu.
 *   · K5 (EK-19..21): aile uyusmazligi teshisinin kor sorgusu suruklemede
 *     'auto-variant' donunce teshis SESSIZCE susuyordu — tagli yol susuyor,
 *     tagsiz yol soruyordu.
 *
 *  DB GEREKMEZ: uretim indeksleyicisi + saf motor.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, urunVariantTags, aileUyusmazligiTeshisi } from '../src/ozellik/eslestirme/matching/index/query-engine';
import type { IndexedRow, QueryOutcome } from '../src/ozellik/eslestirme/matching/index/types';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay?: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
}

function prod(c: ProductColumns): IndexedRow {
  const idx = buildProductIndex(c);
  return {
    id: `lib-${idx.rowKey}`,
    listPrice: c.price, customPrice: null, discountRate: 0,
    currency: (c.paraBirimi as string) ?? 'TRY',
    urun: {
      ...idx,
      ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: typeof c.boy === 'number' ? c.boy : null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null,
      price: c.price,
      birim: (c as any).birim ?? null,   // ISCILIK L6 suzgeci bunu okur
    },
  };
}

const surukle = (q: string, pool: IndexedRow[], tags: string[], birim = 'adet'): QueryOutcome =>
  runQuery(parseLine(q, birim), pool, { variantTags: tags });
const fiyat = (o: QueryOutcome): number | null =>
  o.kind === 'auto-variant' ? o.row.urun.price : o.kind === 'single' ? o.row.urun.price : null;
const kod = (o: QueryOutcome): string => (o.kind === 'none' ? `none/${(o as any).reason}` : o.kind);

// ═════════════════════════════════════════════════════════════════════
//  A) CINS EKSENI — yazili cins havuzu bosaltiyor
// ═════════════════════════════════════════════════════════════════════
console.log('── EK-1..3) cins ekseni (kriter-yok) ──');
{
  const AD = 'Kelebek Vana';
  const DOKME_100 = prod({ ad: AD, cins: 'döküm', cap: 'DN100', price: 300, urunKodu: 'D-100' });
  const TABAN = [
    prod({ ad: AD, cins: 'paslanmaz', cap: 'DN50', price: 111, urunKodu: 'P-50' }),
    prod({ ad: AD, cins: 'döküm', cap: 'DN50', price: 100, urunKodu: 'D-50' }),
  ];
  const TAG = urunVariantTags(TABAN[1]); // kullanici KAYNAK satirda 'dokum'u secti

  // A: hedef capta secilen cins VAR → kurtarilir.
  // Satirda 'PASLANMAZ' YAZILI oldugu icin dokum urunler eleniyor ve havuz
  // bosaliyor; kurtarma havuzu (cins suzgecinden ONCE) o urunu hala tasiyor.
  const oA = surukle('PASLANMAZ DÖKÜM KELEBEK VANA DN 100', [...TABAN, DOKME_100], TAG);
  check('EK-1 hedef capta secilen cins VAR → kurtarilir (dokum DN100 @300)',
    oA.kind === 'auto-variant' && fiyat(oA) === 300, `${kod(oA)}@${fiyat(oA)}`);

  // B (PARA): AYNI sorgu, DN100 havuzdan CIKARILMIS. Cap suzgeci olmasaydi
  // kurtarma DN50'yi tek aday bulup 100 TL'yi DN100 satirina yazardi.
  const oB = surukle('PASLANMAZ DÖKÜM KELEBEK VANA DN 100', TABAN, TAG);
  check('EK-2 PARA: hedef capta YOKSA DN50 fiyati (100) DN100 satirina YAZILMAZ',
    fiyat(oB) !== 100, `${kod(oB)}@${fiyat(oB)}`);
  // FIXTURE KANITI: sebep kodu 'kriter-yok' olmali — degilse test cins
  // ekseni yerine baska bir yolu olcuyor demektir (EK-6 dersinin ikizi).
  check('EK-3 FIXTURE KANITI: kurtarmasiz hal GERCEKTEN cins ekseni (kriter-yok)',
    oB.kind === 'none' && (oB as any).reason === 'kriter-yok', kod(oB));
}

// ═════════════════════════════════════════════════════════════════════
//  B) YUZEY CELISKISI — AND ve OR havuzlari bos
// ═════════════════════════════════════════════════════════════════════
console.log('── EK-4..6) yuzey celiskisi ──');
{
  const AD = 'Spiral Kaynaklı Boru';
  const KIRMIZI_65 = prod({ ad: AD, cins: 'kırmızı boyalı', cap: 'DN65', price: 267, urunKodu: 'K-65' });
  // ⚠ FIXTURE SARTI (ilk surumde ATLANDI, mutasyon degil ILK KOSUM yakaladi):
  // 'galvaniz'/'siyah' AILE DAGARCIGINDA yoksa `classifyTokens` onlari 'cins'
  // degil 'bilinmeyen' sayar, yuzey dali HIC KOSMAZ ve test yuzey-celiskisini
  // degil cap-yok yolunu olcer. Dagarcik AILE havuzundan kurulur; bu yuzden
  // AYNI ailede (boru) FARKLI ADLI galvaniz/siyah kalemler eklenir — ad
  // daraltmasi onlari `rows`tan cikarir, ama dagarciga girmis olurlar.
  const TABAN = [
    prod({ ad: AD, cins: 'kırmızı boyalı', cap: 'DN50', price: 200, urunKodu: 'K-50' }),
    prod({ ad: 'Dikişli Çelik Boru', cins: 'galvaniz', cap: 'DN50', price: 150, urunKodu: 'G-50' }),
    prod({ ad: 'Dikişli Çelik Boru', cins: 'siyah', cap: 'DN50', price: 140, urunKodu: 'S-50' }),
  ];
  const TAG = urunVariantTags(TABAN[0]);

  // Satirda BIRLIKTE bulunamayan yuzeyler yazili (galvaniz + siyah): ad
  // daraltmasindan sonra rows yalniz SPIRAL urunler (kirmizi) → AND bos,
  // OR da bos → 'yuzey-celiskisi'.
  const oA = surukle('SPİRAL KAYNAKLI BORU GALVANİZ SİYAH DN 65', [...TABAN, KIRMIZI_65], TAG, 'mt');
  check('EK-4 yuzey celiskisinde de kurtarilir (kirmizi DN65 @267)',
    oA.kind === 'auto-variant' && fiyat(oA) === 267, `${kod(oA)}@${fiyat(oA)}`);

  const oB = surukle('SPİRAL KAYNAKLI BORU GALVANİZ SİYAH DN 65', TABAN, TAG, 'mt');
  // ON KOSUL ASSERT'I: fixture GERCEKTEN yuzey-celiskisi yolunu tetikliyor mu?
  // Bu assert olmadan EK-4/EK-5 baska bir yoldan (cap-yok) yesil kalabilir ve
  // test ne olctugunu SOYLEMEZ — ilk kosumda tam olarak bu yasandi.
  check('EK-6 FIXTURE KANITI: kurtarmasiz hal GERCEKTEN yuzey-celiskisi yolu',
    oB.kind === 'none' && (oB as any).reason === 'yuzey-celiskisi', kod(oB));
  check('EK-6b PARA: hedef capta YOKSA DN50 fiyati (200) YAZILMAZ',
    fiyat(oB) !== 200, `${kod(oB)}@${fiyat(oB)}`);
}

// ═════════════════════════════════════════════════════════════════════
//  C) BAGLANTI EKSENI — yazili baglanti havuzu bosaltiyor
// ═════════════════════════════════════════════════════════════════════
console.log('── EK-7..9) baglanti ekseni (kriter-yok) ──');
{
  const AD = 'Kelebek Vana';
  const FLANSLI_100 = prod({ ad: AD, cins: 'döküm', baglanti: 'flanşlı', cap: 'DN100', price: 300, urunKodu: 'F-100' });
  // ⚠ AYNI FIXTURE SARTI (EK-6) + BIR KATMAN DAHA:
  // (1) 'kaynakli' AILE dagarciginda yoksa 'bilinmeyen' sayilir, baglanti dali
  //     HIC kosmaz ve test cap-yok yolunu olcer.
  // (2) Ama dagarcigi besleyen kalem NORMAL bir aile uyesiyse bu kez AD-GEVSETME
  //     onu bulur (`aileHavuzu.filter(!aileZayif && bagUyar)`) ve yine cap-yok'a
  //     duser. Iki kosumda da olculdu.
  // Cozum: dagarcigi AILESI ZAYIF bir kalem beslesin — adi aile cozmuyor, yalniz
  // KATEGORI basligindan turemis (`aileZayif: true`) → ad-gevsetme onu ELER.
  const TABAN = [
    prod({ ad: AD, cins: 'döküm', baglanti: 'flanşlı', cap: 'DN50', price: 100, urunKodu: 'F-50' }),
    prod({ ad: 'Zzqq Parça', kategori: 'Vanalar', cins: 'pirinç', baglanti: 'kaynaklı', cap: 'DN50', price: 90, urunKodu: 'ZQ-50' }),
  ];
  const TAG = urunVariantTags(TABAN[0]);

  const oA = surukle('KELEBEK VANA KAYNAKLI DN 100', [...TABAN, FLANSLI_100], TAG);
  check('EK-7 baglanti ekseninde de kurtarilir (flansli DN100 @300)',
    oA.kind === 'auto-variant' && fiyat(oA) === 300, `${kod(oA)}@${fiyat(oA)}`);

  const oB = surukle('KELEBEK VANA KAYNAKLI DN 100', TABAN, TAG);
  check('EK-8 PARA: hedef capta YOKSA DN50 fiyati (100) YAZILMAZ',
    fiyat(oB) !== 100, `${kod(oB)}@${fiyat(oB)}`);
  check('EK-9 FIXTURE KANITI: kurtarmasiz hal GERCEKTEN baglanti ekseni (kriter-yok)',
    oB.kind === 'none' && (oB as any).reason === 'kriter-yok', kod(oB));
}

// ═════════════════════════════════════════════════════════════════════
//  D) KAPILAR
// ═════════════════════════════════════════════════════════════════════
console.log('── EK-10..13) kapilar ──');
{
  // (c) AMBIGUOUS: havuz KARISIK sinif → resolveLineClass 'unknown' →
  // sizeEquivalents celik+plastik BIRLESIMI doner. 3/4" hem dn20 (celik) hem
  // dn25/od-25 (plastik 25 mm) uretir; havuzdaki CELIK DN25 urunu 'dn25'
  // uzerinden eslesir — oysa celik DN25 = 1", 3/4" DEGIL. Kapi olmadan
  // olculdu: 999 TL OTOMATIK yaziliyor.
  // ⚠ FIXTURE: 'paslanmaz' dagarcigi AILESI ZAYIF bir kalemden beslenir ki
  // (i) kelime 'cins' sayilsin, (ii) ad-gevsetme onu kurtarmasin. Ilk surumde
  // paslanmaz kalem NORMAL uyeydi → cins suzgeci onu buluyor, erken 'none'
  // HIC olusmuyor ve test erkenKurtar'a UGRAMADAN yesil kaliyordu (olculdu).
  const AD = 'Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'PPR', cap: '25 mm', price: 18, urunKodu: 'PPR-25' }),
    prod({ ad: AD, cins: 'çelik dikişli', cap: 'DN25', price: 999, urunKodu: 'CD-25' }),
    prod({ ad: 'Zzqq Parça', kategori: 'Borular', cins: 'paslanmaz', cap: 'DN50', price: 5, urunKodu: 'ZQ-50' }),
  ];
  const TAG = urunVariantTags(HAVUZ[1]); // kullanici 'celik dikisli'yi secti
  const o = surukle('PASLANMAZ BORU 3/4"', HAVUZ, TAG, 'mt');
  check('EK-10 on kosul: havuz KARISIK sinif (steel + plastic) → sinif "unknown"',
    new Set([HAVUZ[0].urun.sizeClass, HAVUZ[1].urun.sizeClass]).size > 1,
    `${HAVUZ[0].urun.sizeClass}/${HAVUZ[1].urun.sizeClass}`);
  // 3/4" → celik dn20, plastik od-25/dn25. BIRLESIM alinirsa CELIK DN25 urunu
  // 'dn25' uzerinden eslesir — oysa celik DN25 = 1", 3/4" DEGIL.
  check('EK-11 KAPI(c) PARA: sinif belirsizken kurtarma YOK — 999 TL YAZILMAZ',
    fiyat(o) !== 999, `${kod(o)}@${fiyat(o)}`);
  check('EK-11b FIXTURE KANITI: erken none GERCEKTEN olusuyor (kriter-yok)',
    o.kind === 'none' && (o as any).reason === 'kriter-yok', kod(o));
}
{
  // EK-14 TEK ADAY FRENI: kurtarma havuzunda hedef capta tag'e uyan IKI aday
  // varsa sessiz ikame YASAK (K7 vakasi: ayni kod, iki fiyat).
  const AD = 'Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'döküm', cap: 'DN100', price: 300, urunKodu: 'D-100a' }),
    prod({ ad: AD, cins: 'döküm', cap: 'DN100', price: 310, urunKodu: 'D-100b' }),
    prod({ ad: 'Zzqq Parça', kategori: 'Borular', cins: 'paslanmaz', cap: 'DN50', price: 5, urunKodu: 'ZQ-50' }),
  ];
  const TAG = urunVariantTags(HAVUZ[0]);
  const o = surukle('PASLANMAZ BORU DN 100', HAVUZ, TAG, 'mt');
  check('EK-14 FREN: iki aday varsa kurtarma YAPILMAZ (fiyat yazilmaz)',
    fiyat(o) === null, `${kod(o)}@${fiyat(o)}`);
}
{
  // EK-15 KAPI(d) PARA: satirin capi CEVRILEMIYORSA suzgec kurulamaz.
  // Kapi olmadan `capSuz` "capTags bos olan gecer" dalina duser — ama
  // CEVRILEMEZ capli urunun capTags'i ZATEN bostur, yani 5/8" urun 3/8"
  // satirina "dogrulanmis" gibi girer ve 700 TL yazilir.
  const AD = 'Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'çelik dikişli', cap: '5/8"', price: 700, urunKodu: 'CD-58' }),
    prod({ ad: 'Zzqq Parça', kategori: 'Borular', cins: 'paslanmaz', cap: 'DN50', price: 5, urunKodu: 'ZQ-50' }),
  ];
  const TAG = urunVariantTags(HAVUZ[0]);
  const o = surukle('PASLANMAZ BORU 3/8"', HAVUZ, TAG, 'mt');
  check('EK-15 on kosul: 5/8" urunun capTags i BOS (cevrilemez olcu)',
    HAVUZ[0].urun.capTags.length === 0, JSON.stringify(HAVUZ[0].urun.capTags));
  // PARA: cap dogrulanamadigi icin fiyat OTOMATIK yazilamaz — freni `capAutoYasak`
  // tutar (cevrimsiz olcu icin AYRI kapi YOK; olculdu, gereksizdi).
  check('EK-16 PARA: cevrilemez capta 5/8" fiyati (700) 3/8" satirina YAZILMAZ',
    fiyat(o) !== 700, `${kod(o)}@${fiyat(o)}`);
  // GORUNURLUK (S4 + CC cizgisi): kalem EKRANDAN KAYBOLMAZ, onay ister.
  check('EK-17 GORUNURLUK: kalem gizlenmez — onay kutusu acilir (ask)',
    o.kind === 'ask', kod(o));
}
{
  // EK-18 — SINIF UYUMU (27.08, PARA). Bu vaka `erkenKurtar`a HIC ugramaz:
  // yazili baglanti havuzu bosaltinca AD-GEVSETME devreye girip PPR kalemini
  // getiriyor, boylece erken 'none' hic olusmuyor ve akis MEVCUT `varyantKurtar`
  // yoluna gidiyor. Orada sinif 'plastic' cozuluyor (rows artik PPR) ve
  // 3/4" → 25 mm okunuyor; kurtarma havuzundaki CELIK DN25 urunu 'dn25'
  // uzerinden eslesip 999 TL'yi 3/4" satirina OTOMATIK yaziyordu.
  // OLCULDU: bu kusur K1'den ONCE de vardi — `capUyar`in kendisinde.
  // Cap tag ad uzayi sinifa gore asiri yuklu: 'dn25' celikte DN25 (1"),
  // plastikte 25 mm (3/4"). `sinifUyar` bu kiyasi kapatir.
  // ⚠ KAPSAM DURUSTLUGU: bu blok `sinifUyar`i olcer, `erkenKurtar`in (b)
  // kapisini DEGIL. (b) kapisi su an mutasyonla ORTULU DEGIL — dosya sonundaki
  // nota bakin.
  const AD = 'Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'PPR', cap: '25 mm', price: 18, urunKodu: 'PPR-25' }),
    prod({ ad: AD, cins: 'çelik dikişli', baglanti: 'flanşlı', cap: 'DN25', price: 999, urunKodu: 'CD-25' }),
    prod({ ad: AD, cins: 'çelik dikişli', baglanti: 'flanşlı', cap: 'DN20', price: 50, urunKodu: 'CD-20' }),
    prod({ ad: 'Zzqq Parça', kategori: 'Borular', cins: 'pirinç', baglanti: 'kaynaklı', cap: 'DN50', price: 5, urunKodu: 'ZQ-50' }),
  ];
  const TAG = urunVariantTags(HAVUZ[2]); // kullanici celik dikisli/flansli secti
  const o = surukle('ÇELİK BORU KAYNAKLI 3/4"', HAVUZ, TAG, 'mt');
  check('EK-18 GORUNURLUK: yanlis sinif elenince kalem gizlenmez, onay istenir',
    o.kind === 'ask', `${kod(o)}@${fiyat(o)}`);
  check('EK-18b PARA: celik DN25 (=1") urununun 999 TL si 3/4" satirina YAZILMAZ',
    fiyat(o) !== 999, `${kod(o)}@${fiyat(o)}`);
}
{
  // (a) CAPSIZ SATIR: erken kurtarma hic calismaz. Capsiz satirda cap suzgeci
  // kurulamaz, yani kurtarilan urunun DOGRU olcude oldugu KANITLANAMAZ.
  const AD = 'Kelebek Vana';
  const HAVUZ = [
    prod({ ad: AD, cins: 'paslanmaz', cap: 'DN50', price: 111, urunKodu: 'P-50' }),
    prod({ ad: AD, cins: 'döküm', cap: 'DN50', price: 100, urunKodu: 'D-50' }),
  ];
  const TAG = urunVariantTags(HAVUZ[1]);
  const o = surukle('PASLANMAZ DÖKÜM KELEBEK VANA', HAVUZ, TAG); // CAP YOK
  check('EK-12 KAPI(a): capsiz satirda erken kurtarma calismaz (fiyat yazilmaz)',
    fiyat(o) === null, `${kod(o)}@${fiyat(o)}`);
}
{
  // KAPI: kullanici SECMEDIYSE (variantTags yok) davranis BIREBIR eskisi gibi.
  const AD = 'Kelebek Vana';
  const HAVUZ = [
    prod({ ad: AD, cins: 'paslanmaz', cap: 'DN50', price: 111, urunKodu: 'P-50' }),
    prod({ ad: AD, cins: 'döküm', cap: 'DN100', price: 300, urunKodu: 'D-100' }),
  ];
  const o = runQuery(parseLine('PASLANMAZ DÖKÜM KELEBEK VANA DN 100', 'adet'), HAVUZ);
  check('EK-13 KAPI: variantTags YOKKEN kurtarma tetiklenmez (none AYNEN)',
    o.kind === 'none', kod(o));
}

// ═════════════════════════════════════════════════════════════════════
//  E) K5 — AILE UYUSMAZLIGI TESHISI SURUKLEMEDE SUSMASIN
// ═════════════════════════════════════════════════════════════════════
console.log('── EK-19..21) K5: teshis tagli yolda da konusur ──');
{
  // Satirin ailesi ile URUNUN ailesi FARKLI ama kelime PAYLASIYOR
  // ("Kanal Askısı" ↔ "Boru Askısı"). Aile SERT KILIT oldugu icin ana sorgu
  // `none/ad-yok` doner ve `aileUyusmazligiTeshisi` devreye girer.
  //
  // KUSUR: teshisin kor sorgusu (aile kilidi KAPALI) kullanici surukleme
  // yaptiginda artik kurtarma yollarina girip 'auto-variant' donebiliyor;
  // teshisin geri kalani ise 'ask' varsayimi uzerine yazili ve
  // `kor.kind !== 'ask'` kapisi adayi SESSIZCE olduruyordu. Yani TAGLI yol
  // susuyor, TAGSIZ yol soruyordu — ayni girdi, iki farkli cevap.
  const HAVUZ = [
    prod({ ad: 'Boru Askısı', cins: 'somunlu', cap: 'DN100', price: 100, urunKodu: 'BA-100' }),
    prod({ ad: 'Boru Askısı', cins: 'somunlu', cap: 'DN150', price: 150, urunKodu: 'BA-150' }),
    prod({ ad: 'Boru Askısı', cins: 'kauçuklu', cap: 'DN150', price: 160, urunKodu: 'BA-150k' }),
  ];
  const TAG = urunVariantTags(HAVUZ[2]);
  const l = parseLine('Kanal Askısı DN 150', 'adet');
  const base = runQuery(l, HAVUZ, { variantTags: TAG });
  check('EK-19 FIXTURE KANITI: aile UYUSMUYOR → ana sorgu none/ad-yok',
    base.kind === 'none' && (base as any).reason === 'ad-yok', kod(base));
  const korHam = runQuery(l, HAVUZ, { variantTags: TAG, aileKilidiKapali: true });
  check('EK-20 FIXTURE KANITI: kor sorgu GERCEKTEN auto-variant doner (normalize edilecek dal)',
    korHam.kind === 'auto-variant', kod(korHam));
  const teshis = aileUyusmazligiTeshisi(l, HAVUZ, { variantTags: TAG }, base);
  check('EK-21 teshis SUSMAZ: kullaniciya soru acilir (ask)',
    teshis.kind === 'ask', kod(teshis));
  check('EK-21b PARA: aile kilidi kapali sorgunun sonucu OTOMATIK yazilmaz',
    fiyat(teshis) === null, `${kod(teshis)}@${fiyat(teshis)}`);
}

// ═════════════════════════════════════════════════════════════════════
//  F) ISCILIK BIRIM (L6) — KURTARMA BU SERT KURALI DELMEZ
// ═════════════════════════════════════════════════════════════════════
console.log('── EK-22..24) L6: kurtarma birim suzgecini atlamaz ──');
{
  // ⚠ BU BIR REGRESYONDU: E2 turu (26.08) kurtarmayi 'cap-yok' donusune
  // bagladi, ama o donus BIRIM suzgecinin (L6) USTUNDE. Kurtarma havuzuna
  // birim hic uygulanmadigi icin 'ad' birimli bir ISCILIK satirina 'mt'
  // birimli kalem OTOMATIK yazilabiliyordu.
  // L6 kurali (PRD Iscilik): "malzeme metre ise metre bazli iscilik kalemi;
  // adet ise adet bazli. Uymayan kalem ADAY OLAMAZ." Birim bir nitelik degil,
  // miktar × fiyat carpiminin SOZLESMESIDIR — ihlali dogrudan para hatasidir.
  const AD = 'Boru Kaynak İşçiliği';
  const HAVUZ = [
    prod({ ad: AD, cins: 'çelik', cap: 'DN50', birim: 'mt', price: 90, urunKodu: 'M-50' }),
    prod({ ad: AD, cins: 'çelik', cap: 'DN100', birim: 'mt', price: 120, urunKodu: 'M-100' }),
  ];
  const TAG = urunVariantTags(HAVUZ[0]);
  const l = parseLine('Boru Kaynak İşçiliği DN 100', 'ad');
  const o = runQuery(l, HAVUZ, { variantTags: TAG, birimSert: true });
  check('EK-22 on kosul: satir birimi "ad", kalemler "mt" — L6 celiskisi',
    l.unit === 'ad' && HAVUZ[0].urun.birim === 'mt', `${l.unit} vs ${HAVUZ[0].urun.birim}`);
  check('EK-23 PARA: birim uyusmazliginda kurtarma fiyat YAZAMAZ',
    fiyat(o) === null, `${kod(o)}@${fiyat(o)}`);
  check('EK-24 KONTROL: birim UYUYORSA kurtarma normal calisir',
    (() => {
      const o2 = runQuery(parseLine('Boru Kaynak İşçiliği DN 100', 'mt'), HAVUZ,
        { variantTags: TAG, birimSert: true });
      return o2.kind === 'auto-variant' && fiyat(o2) === 120;
    })(), '-');
}
{
  // EK-25 ASIL DELIK — KURTARMA HAVUZU BIRIM SUZGECINDEN GECMIYOR.
  //
  // ⚠ EK-22..24 ana akisi olcer ve orada motor ZATEN dogruydu (o bloktaki ilk
  // kirmizi benim FIXTURE hatamdi: `prod` yardimcisi `birim`i tasimiyordu, yani
  // kalemler "birimsiz" gorunuyor ve L6 suzgeci bilerek elemiyordu).
  // GERCEK delik burada: `rows` birim suzgecinden GECER, ama KURTARMA HAVUZU
  // gecmez. Kurtarma o havuzdan tek aday bulunca L6 delinir.
  //
  // Kurgu: satirda 'PASLANMAZ' yazili → cins suzgeci rows'u 'ad' birimli
  // dogru kaleme daraltir; kullanicinin surukleme secimi ise 'celik' (mt).
  // Varyant eslesmesi rows'ta bulunamaz → kurtarma havuzuna duser ve orada
  // 'mt' birimli kalemi TEK aday olarak bulur.
  const AD = 'Boru Kaynak İşçiliği';
  const CELIK_MT = prod({ ad: AD, cins: 'çelik', cap: 'DN100', birim: 'mt', price: 120, urunKodu: 'C-100' });
  const PASLANMAZ_AD = prod({ ad: AD, cins: 'paslanmaz', cap: 'DN100', birim: 'ad', price: 200, urunKodu: 'P-100' });
  const HAVUZ = [CELIK_MT, PASLANMAZ_AD];
  const TAG = urunVariantTags(CELIK_MT); // kullanici 'celik' (mt) secmis
  const o = runQuery(parseLine('PASLANMAZ Boru Kaynak İşçiliği DN 100', 'ad'), HAVUZ,
    { variantTags: TAG, birimSert: true });
  check('EK-25 PARA/L6: kurtarma havuzu da birim suzgecinden gecer — mt kalem (120) ad satirina YAZILMAZ',
    fiyat(o) !== 120, `${kod(o)}@${fiyat(o)}`);
}

// ⚠ KAPSAM BORCU 2 (27.08): `erkenKurtar` icindeki L6 BIRIM suzgeci de
// mutasyonla ORTULU DEGIL. Ikizi (`varyantKurtar` icindeki) EK-25 ile
// kilitli ve GEREKLILIGI olculdu; `erkenKurtar` yolunda ayni delige giden
// bir fixture kurulamadi (denenen kurgu erken 'none' dalina hic sapmadi ve
// testi YANLIS SEBEPLE yesil birakti — o test SILINDI, cunku ne olctugunu
// soylemeyen test testsizlikten kotudur). Suzgec KODDA BIRAKILDI: yalnizca
// otomatik yazimi ENGELLEYEBILIR, asla uretemez — yani yanlis taraftaysa
// bedeli bir yorum, dogru taraftaysa kazanci bir para hatasidir.
//
// ⚠ KAPSAM BORCU (durustluk notu, 27.08): `erkenKurtar` icindeki (b) kapisi —
// sinifin GENIS havuzdan degil `rows`tan cozulmesi — su an MUTASYONLA ORTULU
// DEGIL. Uc erken cagri yerinin ikisinde `rows` ile `varyantKurtarma` OZDES
// oldugu icin fark olusmuyor; farklastigi vakayi kurmaya calisan fixture ise
// AD-GEVSETME yuzunden baska yola sapiyor (EK-18 tam olarak o sapmayi ve
// oradaki AYRI kusuru — sinif ad uzayi cakismasini — olcer).
// Kapi KODDA duruyor ve gerekcesi olculmus (genis havuz daha sik 'unknown'
// verir = daha tehlikeli), ama BU PAKET onu SINAMIYOR. Bilinen ve yazili bosluk.

console.log('');
console.log(`── SONUC: ${passed} PASS · ${failures.length} FAIL ──`);
if (failures.length) { failures.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
