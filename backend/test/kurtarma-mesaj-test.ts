/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  KM — CAP-YOK ERKEN DONUSU: KURTARMA ATLANMASI + MESAJ YALANI
 *  (`npm run test:kurtarma-mesaj`)
 *
 *  26.08 turu. VS turunda (25.08) BILINCLI ERTELENEN uc bulgu olculdu ve ucu
 *  de ONAYLANDI. Ucunun de tek bir kod noktasi var: query-engine'de `cap-yok`
 *  ERKEN DONUSU (rows cap filtresinden sonra bosaldiginda).
 *
 *   E2 — SESSIZ KAYIP: dosyadaki 12 'none' donusunun 12'si de V4.7 varyant
 *        kurtarmasindan ONCE doner. Kurtarma havuzlarina (`yuzeyGenis`,
 *        `varyantKurtarma`) cap suzgeci `cap-yok` donusunun ALTINDAKI iki
 *        satirda uygulanir — yani kurtarma, tam olarak ele almak icin
 *        yazildigi vakaya hic ulasamiyor: kullanici kaynak satirda "kirmizi
 *        boyali"yi secip surukluyor, hedef satirda "siyah" yazili → siyah
 *        2½" yok → "bu markada yok". OYSA kirmizi boyali 2½" kutuphanede
 *        DURUYOR. (V4.7'nin 30.07 gerekcesiyle BIREBIR ayni vaka; kurtarma
 *        2"de calisip 2½"de calismiyordu — kanit KM-1 vs KM-2.)
 *
 *   E4 — MESAJ YALANI (kapsam): yuzey filtresi hicbir zaman 'none' DONMEZ,
 *        yalniz havuzu daraltir. Sonuc kodunu HER ZAMAN sonraki (cap) filtre
 *        yazar → sebep kodu "eleyen kriter"i degil "SON kriter"i adlandirir.
 *        Ekran: `Bu markada 2" yok` — oysa markada 2" VARDIR (siyah);
 *        tasinmayan sey "galvaniz 2""dir.
 *
 *   E6 — MESAJ YALANI (siralama): 'en yakin' listesi OLCULEMEZ sayilardan
 *        uretiliyordu — `hedef` satirin kendi ekseninde (inc/DN/mm), aday ise
 *        `parseFloat(capRaw)` ile HAM metinden. Iki sonuc: (a) mm-etiketli
 *        kutuphane + inc satir → liste TAM TERS siralanir (izolasyonun tam
 *        hali: 2'' icin en yakin 42 mm iken 22 mm basa gelir), (b) kesirli
 *        inc `3/4"` → parseFloat 3 doner (3/4 inc "3" sayilir).
 *
 *  DB GEREKMEZ: uretim indeksleyicisi + saf motor + uretim mesaj ureticisi.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, urunVariantTags } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { toMatchResult } from '../src/ozellik/fiyat/matching/index/outcome-mapper';
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
    },
  };
}

/** Surukleme = kaynak satirin tag'leriyle hedef satiri sorgulamak. */
const surukle = (q: string, pool: IndexedRow[], tags: string[], birim = 'mt'): QueryOutcome =>
  runQuery(parseLine(q, birim), pool, { variantTags: tags });
const fiyat = (o: QueryOutcome): number | null =>
  o.kind === 'auto-variant' ? o.row.urun.price : o.kind === 'single' ? o.row.urun.price : null;
/** Uretim mesaj ureticisinin BIREBIR ciktisi (kullanicinin gordugu metin). */
const mesaj = (o: QueryOutcome, q: string, birim = 'mt'): string =>
  toMatchResult(o, parseLine(q, birim), (v) => v).reason ?? '';
const kod = (o: QueryOutcome): string => (o.kind === 'none' ? `none/${(o as any).reason}` : o.kind);
const caplar = (o: QueryOutcome): string[] | undefined => (o as any).mevcutCaplar;

// ═════════════════════════════════════════════════════════════════════
//  A) E2 — CAP-YOK ERKEN DONUSU V4.7 KURTARMASINI ATLIYOR
// ═════════════════════════════════════════════════════════════════════
console.log('── KM-1..8) E2: surukleme kurtarmasi cap-yok yolunda da calisir ──');
{
  const AD = 'Dikişli Çelik Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'siyah', cap: '1"', price: 100, urunKodu: 'S-1' }),
    prod({ ad: AD, cins: 'siyah', cap: '2"', price: 200, urunKodu: 'S-2' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', cap: '1"', price: 120, urunKodu: 'K-1' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', cap: '2"', price: 220, urunKodu: 'K-2' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', cap: '2 1/2"', price: 300, urunKodu: 'K-25' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', cap: '4"', price: 500, urunKodu: 'K-4' }),
  ];
  // Kullanici KAYNAK satirda (1") popup'tan "kirmizi boyali"yi secti, asagi surukluyor.
  const TAG = urunVariantTags(HAVUZ[2]);

  // KM-1 KONTROL (bugun de yesil): 2"de kurtarma CALISIR — cunku siyah 2"
  // havuzda oldugu icin cap filtresi rows'u BOSALTMAZ, akis V4 blogana ulasir.
  // Bu assert, kusurun "kurtarma yok" degil "kurtarmaya ULASILAMIYOR"
  // oldugunu kanitlar; KM-2 ile birlikte okunmali.
  const o2 = surukle('Dikişli SİYAH Çelik Boru 2"', HAVUZ, TAG);
  check('KM-1 KONTROL: siyah 2" hedefinde kurtarma calisir (kirmizi 2" @220)',
    o2.kind === 'auto-variant' && fiyat(o2) === 220, `${kod(o2)}@${fiyat(o2)}`);

  // KM-2 ASIL KUSUR: siyah 2½" HAVUZDA YOK → cap filtresi rows'u bosaltir →
  // erken 'cap-yok' donusu → kurtarma HIC calismaz. Oysa kirmizi 2½" @300 var.
  const o25 = surukle('Dikişli SİYAH Çelik Boru 2 1/2"', HAVUZ, TAG);
  check('KM-2 siyah 2 1/2" hedefinde de kurtarma calisir (kirmizi 2 1/2" @300)',
    o25.kind === 'auto-variant' && fiyat(o25) === 300, `${kod(o25)}@${fiyat(o25)}`);

  // KM-3 PARA: kurtarilan aday HEDEF CAPTA olmali. Havuzdaki kirmizi 4" @500
  // kurtarma havuzunda DURUYOR; cap suzgeci uygulanmazsa 500 yazilir (VS probe
  // M3'te olculen para hatasi sinifi). Bu assert o suzgecin kapisidir.
  check('KM-3 PARA: kurtarilan urun HEDEF capta — 4" @500 ASLA yazilmaz',
    fiyat(o25) !== 500, `gelen ${fiyat(o25)}`);

  // KM-4 KARSI ORNEK: kirmizi 3" GERCEKTEN yok → hala 'cap-yok'.
  // (Bu havuzda kirmizi DORT capta var; asagidaki KM-3b tek-capli havuzla
  //  para kapisini AYRICA sinar — bu iki assert farkli mutasyonlari oldurur.)
  const o3 = surukle('Dikişli SİYAH Çelik Boru 3"', HAVUZ, TAG);
  check('KM-4 KARSI: hedef cap hicbir varyantta yoksa cap-yok AYNEN doner',
    o3.kind === 'none' && (o3 as any).reason === 'cap-yok', kod(o3));

  // KM-5 KAPI: kurtarma YALNIZ kullanicinin acik secimi (variantTags) varken
  // calisir. Tag yoksa davranis DEGISMEZ — sessiz ikame uretilmez.
  const oTagsiz = runQuery(parseLine('Dikişli SİYAH Çelik Boru 2 1/2"', 'mt'), HAVUZ);
  // ⚠ 27.08 GUNCELLEME (K4): bu assert once SONUC KODUNU dondururdu
  // (`none/cap-yok`). K4 turu ayni satirda artik yuzey-genisletilmis bir ASK
  // aciyor (kalem ekrandan kaybolmasin diye) — yani KOD degisti ama assert'in
  // NIYETI degismedi: "kullanici secmediyse SESSIZ IKAME uretilmez".
  // Assert o niyete, yani PARA eksenine cevrildi. ZAYIFLATMA DEGIL: "yeni kapi
  // ask yerine auto-variant donsun" mutasyonunu bu hali de oldurur.
  check('KM-5 KAPI: variantTags YOKKEN kurtarma tetiklenmez — fiyat YAZILMAZ',
    fiyat(oTagsiz) === null, `${kod(oTagsiz)}@${fiyat(oTagsiz)}`);
  check('KM-5b variantTags YOKKEN cikis yolu yuzey-genisletme kapisidir (K4)',
    oTagsiz.kind === 'ask' && ((oTagsiz as any).kapilar ?? []).includes('yuzey-genisletildi'),
    `${kod(oTagsiz)} ${JSON.stringify((oTagsiz as any).kapilar ?? [])}`);

  // KM-6 TEK ADAY FRENI: kurtarma havuzunda tag'e uyan IKI aday varsa
  // kurtarma yapilmaz (sessiz ikame yasagi).
  const IKIZ = [...HAVUZ, prod({ ad: AD, cins: 'kırmızı boyalı', cap: '2 1/2"', price: 310, urunKodu: 'K-25b' })];
  const oIkiz = surukle('Dikişli SİYAH Çelik Boru 2 1/2"', IKIZ, TAG);
  check('KM-6 FREN: kurtarmada TEK aday sarti — iki aday varsa fiyat yazilmaz',
    fiyat(oIkiz) === null, `${kod(oIkiz)}@${fiyat(oIkiz)}`);
}
{
  // KM-3b PARA KAPISI (asil olcum): kullanicinin sectigi varyant havuzda
  // YALNIZ BIR capta var ve o cap hedeften FARKLI. Kurtarma havuzuna CAP
  // suzgeci uygulanmazsa tam olarak TEK aday kalir → 1" fiyati (120) bir
  // 2 1/2" satirina yazilir. VS probe M3'te olculen para hatasi sinifinin
  // kurtarma yolundaki karsiligi budur; bu assert o suzgecin kapisidir.
  const AD = 'Dikişli Çelik Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'siyah', cap: '1"', price: 100, urunKodu: 'S-1' }),
    prod({ ad: AD, cins: 'siyah', cap: '2"', price: 200, urunKodu: 'S-2' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', cap: '1"', price: 120, urunKodu: 'K-1' }), // TEK kirmizi
  ];
  const TAG = urunVariantTags(HAVUZ[2]);
  const o = surukle('Dikişli SİYAH Çelik Boru 2 1/2"', HAVUZ, TAG);
  check('KM-3b PARA: secilen varyant baska capta tek basinaysa fiyati YAYILMAZ (120 yazilmaz)',
    fiyat(o) !== 120 && o.kind === 'none', `${kod(o)}@${fiyat(o)}`);
}
{
  // KM-7 CAPSIZ FRENI (VS'te muhurlenen capsizAutoYasak) — kurtarma yolunda.
  //
  // Bu vakanin kosulu OLCULEREK bulundu: satirin capi CEVRILEBILIYORSA cap
  // suzgeci capsiz adayi zaten kurtarma havuzundan DUSURUR (KM-3b o yolu
  // kilitler) ve fren hic calismaz. Fren ancak cap CEVRILEMEYINCE gorunur:
  // `5/8"` cevrim tablosunda YOK (noConversion) → cap blogu KOMPLE atlanir,
  // kurtarma havuzuna cap suzgeci HIC uygulanmaz, capsiz aday ayakta kalir.
  // (Ilk surumde bu assert `2 1/2"` ile yazilmisti ve YANLIS SEBEPLE yesildi;
  //  mutasyon olcumu yakaladi — fren silinince test kirilmiyordu.)
  const AD = 'Dikişli Çelik Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'siyah', cap: '1"', price: 100, urunKodu: 'S-1' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', price: 900, urunKodu: 'K-capsiz' }), // cap kolonu BOS
  ];
  const TAG = urunVariantTags(HAVUZ[1]);
  const o = surukle('Dikişli SİYAH Çelik Boru 5/8"', HAVUZ, TAG);
  check('KM-7 CAPSIZ FRENI: capsiz aday kurtarilsa bile fiyat OTOMATIK yazilmaz',
    fiyat(o) !== 900, `${kod(o)}@${fiyat(o)}`);
  check('KM-7b fren kullaniciya ACIK: capsiz-dusum onayi acilir (sessiz ret degil)',
    o.kind === 'ask' && (o as any).kapilar?.includes('capsiz-dusum'),
    `${kod(o)} kapilar=${JSON.stringify((o as any).kapilar)}`);
}
{
  // KM-8 IKINCI AILE KANITI (genel cozum kurali): kusur boruya ozgu DEGIL.
  // yuzeyGenis yalniz 'boru' ailesinde dolar; varyantKurtarma AILE-BAGIMSIZDIR.
  const AD = 'Kelebek Vana';
  const HAVUZ = [
    prod({ ad: AD, cins: 'wafer dişli', cap: 'DN50', price: 500, urunKodu: 'W-50' }),
    prod({ ad: AD, cins: 'lug flanşlı', cap: 'DN50', price: 600, urunKodu: 'L-50' }),
    prod({ ad: AD, cins: 'lug flanşlı', cap: 'DN65', price: 700, urunKodu: 'L-65' }),
  ];
  const TAG = urunVariantTags(HAVUZ[1]); // kullanici "lug flansli" secti
  const o = surukle('Wafer Dişli Kelebek Vana DN65', HAVUZ, TAG, 'adet');
  check('KM-8 IKINCI AILE (vana): kurtarma boru DISINDA da calisir (lug DN65 @700)',
    o.kind === 'auto-variant' && fiyat(o) === 700, `${kod(o)}@${fiyat(o)}`);
}

// ═════════════════════════════════════════════════════════════════════
//  B) E6 — 'EN YAKIN' SIRALAMASI KANONIK EKSENDE OLCULUR
// ═════════════════════════════════════════════════════════════════════
console.log("── KM-9..12) E6: 'en yakin' listesi olculebilir eksende ──");
{
  // Izolasyonun TAM hali: kutuphane mm-etiketli, teklif satiri inc.
  const AD = 'Elastomerik kauçuk köpüğü boru';
  const CINS = 'ODE R-Flex PRM/AFK · 19 mm kalınlık';
  const HAVUZ = ['22 mm', '28 mm', '35 mm', '42 mm'].map((cap, i) =>
    prod({ ad: AD, cins: CINS, baglanti: 'AFK kaplamalı', cap, price: 111 + i * 11 }));

  // 2'' = DN50. Adaylarin kanonik capi dn15/dn20/dn25/dn32 → en yakin dn32 = 42 mm.
  const o = runQuery(parseLine("19 mm Kauçuk İzolasyon 2''", 'mt'), HAVUZ);
  check('KM-9 on kosul: satir cap-yok donuyor ve mevcutCaplar dolu',
    o.kind === 'none' && (o as any).reason === 'cap-yok' && !!caplar(o)?.length,
    `${kod(o)} ${JSON.stringify(caplar(o))}`);
  check("KM-9b inc satir + mm kutuphane: en yakin '42 mm' (dn32), '22 mm' (dn15) DEGIL",
    caplar(o)?.[0] === '42 mm', `gelen ${JSON.stringify(caplar(o))}`);

  // KM-10: AYNI fiziksel cap, iki yazim → AYNI liste. (Olculdu: bugun birbirinin TERSI.)
  const oDn = runQuery(parseLine('19 mm Kauçuk İzolasyon DN 50', 'mt'), HAVUZ);
  check("KM-10 TUTARLILIK: 2'' ve 'DN 50' AYNI 'en yakin' listesini uretir",
    JSON.stringify(caplar(o)) === JSON.stringify(caplar(oDn)),
    `2''=${JSON.stringify(caplar(o))} DN50=${JSON.stringify(caplar(oDn))}`);

}
{
  // KM-11 SIRALAMA BILGI TASIR: genis havuzda YAKIN ve UZAK hedefler farkli
  // sira uretmeli. OLCULDU (fix oncesi): 2'' · 5'' · 6'' hedeflerinin UCU de
  // ["22 mm","42 mm","89 mm","114 mm"] veriyordu — 'en yakin' sifir bilgi.
  const AD = 'Elastomerik kauçuk köpüğü boru';
  const CINS = 'ODE R-Flex PRM/AFK · 19 mm kalınlık';
  const GENIS = ['22 mm', '42 mm', '89 mm', '114 mm'].map((cap, i) =>
    prod({ ad: AD, cins: CINS, baglanti: 'AFK kaplamalı', cap, price: 100 + i }));
  // 2''  = dn50  → 42mm(dn32,18) · 89mm(dn80,30) · 22mm(dn15,35) · 114mm(dn100,50)
  // 6''  = dn150 → 114mm(50) · 89mm(70) · 42mm(118) · 22mm(135)
  const o2 = runQuery(parseLine("19 mm Kauçuk İzolasyon 2''", 'mt'), GENIS);
  const o6 = runQuery(parseLine("19 mm Kauçuk İzolasyon 6''", 'mt'), GENIS);
  check("KM-11a genis havuz · 2'' (dn50) icin en yakin '42 mm' (dn32)",
    caplar(o2)?.[0] === '42 mm', `gelen ${JSON.stringify(caplar(o2))}`);
  check("KM-11b genis havuz · 6'' (dn150) icin en yakin '114 mm' (dn100)",
    caplar(o6)?.[0] === '114 mm', `gelen ${JSON.stringify(caplar(o6))}`);
}
{
  // KM-12 IKINCI AILE KANITI: kesirli inc `3/4"` → parseFloat 3 doner.
  // Hedef 1" (dn25): 3/4"=dn20 (5) · 2 1/2"=dn65 (40) · 3"=dn80 (55).
  // Ham sayi ekseninde ise: |3-1|=2 · |2-1|=1 · |3-1|=2 → 2 1/2" basa gelir.
  const AD = 'Dikişli Çelik Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'siyah', cap: '3/4"', price: 90 }),
    prod({ ad: AD, cins: 'siyah', cap: '2 1/2"', price: 300 }),
    prod({ ad: AD, cins: 'siyah', cap: '3"', price: 400 }),
  ];
  const o = runQuery(parseLine('Dikişli Siyah Çelik Boru 1"', 'mt'), HAVUZ);
  check('KM-12 kesirli inc: hedef 1" icin en yakin 3/4" (parseFloat 3 saymaz)',
    caplar(o)?.[0] === '3/4"', `gelen ${JSON.stringify(caplar(o))}`);
}

// ═════════════════════════════════════════════════════════════════════
//  C) E4 — MESAJ HANGI KRITERIN ELEDIGINI SOYLER
// ═════════════════════════════════════════════════════════════════════
console.log('── KM-13..16) E4: cap-yok mesaji kapsam yalani kurmaz ──');
{
  const AD = 'Çelik Boru';
  const HAVUZ = [
    // ⚠ 27.08 (K4): havuzda 2" HICBIR yuzeyde YOK. Onceki fixture'de siyah 2"
    // vardi ve K4 turundan sonra o satir artik 'yuzey-genisletildi' ask'i
    // aciyor — yani KM-14/15 E4'un cap-yok MESAJINI degil K4'un mesajini
    // olcmeye baslamisti (mutasyon yakaladi: yaziliYuzey tasinmasa da yesil
    // kaliyorlardi). "Urun baska yuzeyde VAR" vakasi artik YG paketinin isi;
    // burada E4'un kendi yolu korunuyor.
    prod({ ad: AD, cins: 'siyah', cap: '1"', price: 150, urunKodu: 'S-1' }),
    prod({ ad: AD, cins: 'galvaniz', cap: '1"', price: 200, urunKodu: 'G-1' }),
    prod({ ad: AD, cins: 'galvaniz', cap: '3/4"', price: 170, urunKodu: 'G-34' }),
    prod({ ad: AD, cins: 'galvaniz', cap: '4"', price: 600, urunKodu: 'G-4' }),
  ];
  const Q = '2" Galvaniz Çelik Boru';
  const o = runQuery(parseLine(Q, 'mt'), HAVUZ);
  const m = mesaj(o, Q);

  // ON KOSUL: 2" markada GERCEKTEN var (siyah) — yani "markada 2 yok" YALANDIR.
  const oSiyah = runQuery(parseLine('2" Siyah Çelik Boru', 'mt'), HAVUZ);
  check('KM-13 FIXTURE KANITI: 2" hicbir yuzeyde yok → K4 kapisi ATESLEMEZ, yol cap-yok',
    oSiyah.kind === 'none' && o.kind === 'none' && (o as any).reason === 'cap-yok',
    );

  check('KM-14 mesaj YAZILI YUZEYI anar (kullanici hangi kriterin eledigini gorur)',
    /galvaniz/i.test(m), `mesaj: ${m}`);
  check('KM-15 mesaj kapsam yalani kurmaz: ciplak "Bu markada 2\\" yok" DEMEZ',
    !/^Bu markada 2" yok/.test(m), `mesaj: ${m}`);
}
{
  // KM-16..17: YAZILI YUZEY YOKKEN mesajin kalan iki yalani.
  //  · KAPSAM: "Bu markada" deniyordu ama olculen kume markanin tamami degil,
  //    satirin AILE/AD suzgecinden gecmis ALT KUMESI ("bu üründe").
  //  · KOPRU : satir inc, kutuphane mm — kullanici '2"' ile '22 mm'yi
  //    baglayamiyordu; cevrim rozeti outcome'da URETILIYOR ama metne
  //    girmiyordu (FE de 'none' dalinda tasimiyor).
  // PANO 20a sozlesmesi (`· en yakın: A / B`) AYNEN korunur.
  const AD = 'Çelik Boru';
  const HAVUZ = ['1"', '3/4"', '4"'].map((cap, i) => prod({ ad: AD, cins: 'siyah', cap, price: 100 + i * 10 }));
  const Q = 'Çelik Boru 2"';
  const m = mesaj(runQuery(parseLine(Q, 'mt'), HAVUZ), Q);
  check('KM-16 KAPSAM: mesaj "bu üründe" der, "Bu markada" DEMEZ · en yakin listesi korunur',
    /^Bu üründe 2" yok · en yakın: /.test(m), `mesaj: ${m}`);
  check('KM-17 KOPRU: cevrim rozeti mesaja girer (2" → DN 50)',
    /çevrim: 2" → DN 50/.test(m), `mesaj: ${m}`);

  // KM-17b DAR KAPSAM: yuzey YAZILI ama havuzu DARALTMADIYSA (tum urunler
  // zaten o yuzeyde) mesajda ANILMAZ — yoksa kullanici yanlis yere bakar.
  const Q2 = '2" Siyah Çelik Boru';
  const m2 = mesaj(runQuery(parseLine(Q2, 'mt'), HAVUZ), Q2);
  check('KM-17b yuzey yazili ama DARALTMADIYSA mesajda anilmaz',
    !/siyah/i.test(m2), `mesaj: ${m2}`);
}

// ═════════════════════════════════════════════════════════════════════
//  D) E1 — KULLANICI SECIMI SOZLUGUN VARSAYIMINI SUSTURUR  (PARA)
// ═════════════════════════════════════════════════════════════════════
console.log('── KM-18..22) E1: sozluk hint\'i acik kullanici secimini EZEMEZ ──');
{
  // Canli desen: 'TEMIZ SU BORULARI' grup basligi surukleme hedeflerine
  // miras kaliyor; 'temiz su' alias'i sizeClassHint+hintClass='plastic'
  // uretiyor. Kaynak satirda sinif YAZILI oldugu icin (galvaniz celik) sozluk
  // SUSUYOR ve kullanici secimini yapabiliyor; hedef satirda YAZILI DEGIL,
  // sozluk KONUSUYOR ve secimi eziyor. Asimetri buradan dogar.
  const HAVUZ = [
    prod({ ad: 'Dikişli Çelik Boru', cins: 'galvaniz', cap: '1/2"', price: 100, urunKodu: 'C-12' }),
    prod({ ad: 'Dikişli Çelik Boru', cins: 'galvaniz', cap: '3/4"', price: 140, urunKodu: 'C-34' }),
    // NOT: PPR kaydi bilerek NOTR (ayirt edici cins/baglanti/boy YOK). Boylece
    // 'variantMissing' catisma testi (yalniz cins:/bag:/boy: eksenlerine bakar)
    // devreye GIRMEZ ve tek aday OTOMATIK yazilir — canli vakada olculen para
    // hatasinin tam kosulu budur. Cins verilirse test yanlis sebeple yesil
    // kalir (mutasyon olcumu bunu yakaladi).
    prod({ ad: 'PPR Boru', cap: '25', price: 18, urunKodu: 'P-25' }),
  ];
  const TAG = urunVariantTags(HAVUZ[0]); // kullanicinin ACIK secimi: galvaniz celik boru
  const Q = 'TEMİZ SU BORUSU 3/4"';
  const SOZLUK = { sizeClassHint: 'plastic' as const, hintClass: 'plastic' as const, hintLabel: 'ppr' };

  check('KM-18 on kosul: havuzdaki iki urun FARKLI sinif (steel/plastic) ve fiyat 140 ↔ 18',
    HAVUZ[1].urun.sizeClass === 'steel' && HAVUZ[2].urun.sizeClass === 'plastic',
    `${HAVUZ[1].urun.sizeClass}/${HAVUZ[2].urun.sizeClass}`);

  // Tabanı ölç: sözlük hiç konuşmazsa motor doğru ürünü buluyor mu?
  const oTemiz = runQuery(parseLine(Q, 'mt'), HAVUZ, { variantTags: TAG });
  check('KM-19 TABAN: sozluk hint\'i yokken kullanicinin sectigi urun gelir (celik 3/4" @140)',
    oTemiz.kind === 'auto-variant' && fiyat(oTemiz) === 140, `${kod(oTemiz)}@${fiyat(oTemiz)}`);

  // ASIL PARA KUSURU: ayni satir, ayni havuz, TEK degisken sozluk hint'i.
  const oSozluk = runQuery(parseLine(Q, 'mt'), HAVUZ, { variantTags: TAG, ...SOZLUK });
  check('KM-20 PARA: sozluk hint\'i kullanici secimini EZEMEZ — 18 TL\'lik PPR YAZILMAZ',
    fiyat(oSozluk) !== 18, `${kod(oSozluk)}@${fiyat(oSozluk)}`);
  check('KM-21 sonuc hint\'siz halle AYNI olur (kullanici secimi kazanir)',
    oSozluk.kind === oTemiz.kind && fiyat(oSozluk) === fiyat(oTemiz),
    `hintli=${kod(oSozluk)}@${fiyat(oSozluk)} hintsiz=${kod(oTemiz)}@${fiyat(oTemiz)}`);

  // KAPI: kullanici SECMEDIYSE sozluk AYNEN konusur (R3/T1 korunur —
  // "TEMİZ SU altinda celik aday olamaz" kurali surukleme DISINDA durur).
  const oSecimsiz = runQuery(parseLine(Q, 'mt'), HAVUZ, SOZLUK);
  check('KM-22 KAPI: variantTags YOKKEN sozluk sinifi AYNEN eler (R3/T1 bozulmadi)',
    !(oSecimsiz.kind === 'auto-variant' || oSecimsiz.kind === 'single')
    || (oSecimsiz.kind === 'single' && oSecimsiz.row.urun.sizeClass !== 'steel'),
    `${kod(oSecimsiz)}@${fiyat(oSecimsiz)}`);
}

console.log('');
console.log(`── SONUC: ${passed} PASS · ${failures.length} FAIL ──`);
if (failures.length) { failures.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
