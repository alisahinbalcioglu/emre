/**
 * PK3 — FIXTURE ANONIMLESTIRME  (`npm run fixture:anonim [-- --yaz]`)
 *
 * Kullanicinin karari: gercek musteri dosyalarini `git add -f` ile KOYMUYORUZ;
 * anonimlestirip koyuyoruz. Cok kiracili bir SaaS'ta musteri kimliginin git
 * gecmisine KALICI girmesi kabul edilemez.
 *
 * ⚠ YONTEM — NEDEN ExcelJS ILE YENIDEN YAZMIYORUZ:
 * ExcelJS ile oku→yaz turu dosyayi BYTE BAZINDA yeniden uretir; paylasilan
 * formuller, stiller, merge'ler ve "Onarildi" uyarisi sinifinda bozulmalar
 * bu projede DEFALARCA yasandi (KH11 export 500, EX5 "Onarildi"). PK3 ise
 * "sayfa yapisi, baslik metinleri, kolon duzeni, birimler ve TUM sayilar
 * birebir korunur" diyor. Bu yuzden dosya bir ZIP olarak acilir ve YALNIZCA
 * metin havuzu (`xl/sharedStrings.xml`) icindeki KIMLIK dizeleri degistirilir.
 * Diger her byte oldugu gibi kalir: sayilar sharedStrings'te DEGILDIR
 * (sayilar sheet XML'inde `<v>` olarak durur) → sayilara DOKUNULMAZ.
 *
 * KURAL: anonimlestirme YALNIZ kimlik alanlarina dokunur. PANOVA'nin "BİRİM"
 * basligi altinda miktar tutmasi gibi BOZUKLUKLAR testin ta kendisidir —
 * onlar korunur, "duzeltilmez".
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * ⚠ IKI FIXTURE DIZINI VAR — 01.08.2026'da fark edildi.
 * `test-fixtures/e2e` (12 dosya) `.gitignore` ile disaridaydi; ama
 * `backend/test/fixtures` (7 dosya) `**\/fixtures\/**` istisnasina uydugu
 * icin AYLARDIR GIT'TE IZLENIYOR. Yani "kimlik repoya girmesin" hedefi o
 * dizinde ZATEN CIGNENMISTI: `docProps` icinde "Ali IŞIK", "Halil Akman",
 * "akilliphone Berkant" gibi GERCEK KISI ADLARI commit'lenmis durumda.
 * Anonimlestirme her iki dizini de kapsar.
 */
export const KOKLER = [
  path.resolve(__dirname, '../../test-fixtures/e2e'),
  path.resolve(__dirname, 'fixtures'),
];
/** Geriye donuk ad — e2e dizini. */
export const KOK = KOKLER[0];

/** Gercek ad → takma ad. Uzunluk/bicim onemli degil; sharedStrings uzunluk
 *  bilgisi tasimaz (XML metin dugumu). Buyuk/kucuk harf varyantlari da
 *  eslenir cunku dosyalarda hem "ŞAHİNKUL" hem "Şahinkul" geciyor. */
export const KIMLIK_HARITASI: Record<string, string> = {
  'ŞAHİNKUL': 'FIRMA-A',
  'ŞAHINKUL': 'FIRMA-A',
  'LİNTU MÜHENDİSLİK': 'FIRMA-B MÜHENDİSLİK',
  'LİNTU': 'FIRMA-B',
  'LINTU': 'FIRMA-B',
  'YILDIZ ENTEGRE': 'FIRMA-C ENTEGRE',
  'PANOVA': 'FIRMA-D',
  'Bahçeçicler': 'FIRMA-E',
  'BAHÇEÇİCLER': 'FIRMA-E',
  'Aksa Enerji': 'FIRMA-F Enerji',
  'AKSA ENERJİ': 'FIRMA-F ENERJİ',
  'Aksa': 'FIRMA-F',
  'AKSA': 'FIRMA-F',
  'Skychem': 'FIRMA-G',
  'SKYCHEM': 'FIRMA-G',
  'skychem': 'FIRMA-G',   // backend/test/fixtures/skychem.xlsm dosya adi
  'aksa': 'FIRMA-F',      // backend/test/fixtures/aksa-algilama-iscilik.xlsm
  'Yorel': 'FIRMA-H',
  'YOREL': 'FIRMA-H',
  'yorel': 'FIRMA-H',
  // ⚠ TAKMA AD RAKAM ICEREMEZ (01.08.2026'da OLCULDU, teoriden degil):
  // ilk surumde saha takma adlari SAHA-1..SAHA-5 idi. YILDIZ dosyasinin
  // baslik satiri "…KARTEPE TEİSİSİ…" iken RAKAMSIZDI; "SAHA-3" olunca
  // `miktarNormalize` metnin icinden "-3"u cekti ve o satirin `_toplam`
  // alani "" yerine **-3** oldu, `_isDataRow` false→true dondu. Yani
  // anonimlestirme fixture'in OLCTUGU DAVRANISI degistirmisti.
  // Kural: anahtarda rakam yoksa takma adda da olmayacak (test:pk3 P11).
  'Demirtaş': 'SAHA-BIR',
  'DEMİRTAŞ': 'SAHA-BIR',
  'Göynük': 'SAHA-IKI',
  'GÖYNÜK': 'SAHA-IKI',
  'Kartepe': 'SAHA-UC',
  'KARTEPE': 'SAHA-UC',
  'Beykoz': 'SAHA-DORT',
  'BEYKOZ': 'SAHA-DORT',
  'Akçadağ': 'SAHA-BES',
  'AKÇADAĞ': 'SAHA-BES',
  // 01.08.2026 — icerik taramasinda haritanin GORMEDIGI kimlikler bulundu.
  // Bunlar dosya ADINDA degil, YALNIZ hucre metninde duruyordu; harita
  // dosya adlarina bakilarak yazildigi icin kacmislardi.
  'HABAŞ': 'FIRMA-I',                                     // Bursa dosyasi, is sahibi
  // 01.08 · ikinci tur: KD12(c) olcumu sirasinda goruldu. Ilk tarama
  // "sirket eki" (A.Ş./LTD/ŞTİ) veya iletisim izi ariyordu; bu ad ikisini de
  // tasimiyor. Ikinci tarama SEKTOR SOZCUGU (HAVACILIK/ENERJI/INSAAT…)
  // uzerinden yapildi ve 19 fixture'da kacan TEK ad buydu.
  'BEARO': 'FIRMA-J',
  'Bearo': 'FIRMA-J',
  // ⚠ ADRES ZENGIN METIN RUN'LARINA BOLUNMUS. Tek parca anahtar
  // ("…No:43/12 Maltepe") ham XML'de HIC eslesmiyordu: arada `</t></r>…<r><t>`
  // etiketleri ve bir `\r\n` run'i var. Anahtarlar run sinirlarina gore
  // parcalandi. Bu sinifi bir daha kacirmamak icin main() sonunda
  // ETIKETSIZ KALINTI TARAMASI var (asagida).
  'Zümrütevler Mah. Aşuroglu Sk. No:43/12': 'ÖRNEK Mah. ÖRNEK Sk. No:0/0',
  'Maltepe': 'İLÇE-ÖRNEK',
  'emre@lintumuhendislik.com.tr': 'iletisim@firma-b.example',
  'www.lintumuhendislik.com.tr': 'www.firma-b.example',
  '+90 505 885 15 64': '+90 000 000 00 00',               // sahsi cep telefonu
  // Ayni telefon, AYRISTIRICININ gordugu bicimde. `miktarNormalize` ayiraclari
  // atip sayiya cevirdigi icin hucre `905058851564` olarak da duruyor; kimlik
  // iki temsilde birden var, ikisi de eslenmeli (yoksa dogrulama kirmizi kalir).
  '905058851564': '900000000000',
};

/** Uzun anahtar once — "LİNTU MÜHENDİSLİK" once, sonra "LİNTU". TEK SIRA
 *  kaynagi: hem degistirme hem dosya adi hem de fixture:dogrula bunu kullanir. */
export const KIMLIK_SIRASI = Object.keys(KIMLIK_HARITASI).sort((a, b) => b.length - a.length);

/**
 * ⚠ SOZCUK SINIRI ZORUNLU — 01.08.2026'da olculen GERCEK hasar:
 * Ciplak "Aksa" anahtari, YILDIZ dosyasindaki UC malzeme aciklamasinin
 * ICINE dusuyordu: "Su Motorlu Gong ve Aksamı", "Aksesuar : Her Türlü
 * Aksamlarıyla". Sinirsiz degistirme bunlari "…ve FIRMA-Fmı" yapardi —
 * yani kimlik degil, URUN METNI bozulurdu. O dosyada Aksa kimligi HIC YOK.
 *
 * `\b` KULLANILAMAZ: `\w` = [A-Za-z0-9_], yani "Ş" ve "ı" sozcuk disi
 * sayilir ve sinir yanlis yere duser (Turkce `İ` tuzaginin akrabasi).
 * Bunun yerine Unicode harf/rakam sinifi ile acik lookaround kurulur.
 */
function sinirliDesen(ad: string): RegExp {
  const kacis = ad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${kacis}(?![\\p{L}\\p{N}])`, 'gu');
}

/** Metinde kimlik degistirme. XML metin dugumu de dosya adi da AYNI kuraldan
 *  gecer — iki ayri kural olsaydi ad ile icerik birbirini tutmazdi. */
export function kimlikleriDegistir(xml: string): { cikti: string; sayac: Record<string, number> } {
  const sayac: Record<string, number> = {};
  let cikti = xml;
  for (const ad of KIMLIK_SIRASI) {
    const desen = sinirliDesen(ad);
    const n = (cikti.match(desen) ?? []).length;
    if (n) { sayac[ad] = n; cikti = cikti.replace(sinirliDesen(ad), KIMLIK_HARITASI[ad]); }
  }
  return { cikti, sayac };
}

/** Dosya ADI da kimlik tasir — ayni harita, ayni sira, ayni sozcuk siniri. */
export function anonimAd(ad: string): string {
  return kimlikleriDegistir(ad).cikti;
}

/**
 * ══ BELGE OZELLIKLERI (docProps) ══════════════════════════════════════════
 * 01.08.2026 OLCUMU — sharedStrings-only anonimlestirmenin BUYUK DELIGI:
 * 12 dosyanin HEPSINDE `docProps/core.xml` GERCEK KISI ADI tasiyor
 * (`dc:creator` = "Murat Bahar", "Ali IŞIK", "Halil Akman", "Kaan
 * Aktolgalılar", "emre başaran"…; `cp:lastModifiedBy` = "akilliphone
 * Berkant", "SERDAR"…) ve biri `docProps/app.xml <Company>` = "HABAS A.S.".
 * Hucre metnine hic bakmadan Excel'in kendi ustverisinden 11 kisinin adi
 * git gecmisine KALICI girecekti.
 *
 * Bunlar HARITAYLA cozulmez — adlar onceden bilinemez. Cozum ALAN BAZLI:
 * kimlik tasiyan ustveri alanlarinin ICERIGI TOPTAN silinir. Ayristirici
 * (SheetJS) bu alanlarin hicbirine bakmaz; D2 bunu kanitlar.
 */
const USTVERI_ALANLARI: Record<string, string> = {
  'dc:creator': 'ANONIM',
  'cp:lastModifiedBy': 'ANONIM',
  'dc:title': '',
  'dc:subject': '',
  'dc:description': '',
  'cp:keywords': '',
  'cp:category': '',
  'Company': 'FIRMA-ANONIM',
  'Manager': '',
};

export function ustveriTemizle(xml: string): { cikti: string; temizlenen: string[] } {
  const temizlenen: string[] = [];
  let cikti = xml;
  for (const [etiket, yeni] of Object.entries(USTVERI_ALANLARI)) {
    const kacis = etiket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Hem <t>icerik</t> hem de kendiliginden kapanan <t/> bicimi.
    cikti = cikti.replace(new RegExp(`<${kacis}(\\s[^>]*)?>([^<]*)</${kacis}>`, 'g'), (_m, oz, eski) => {
      // ⚠ ZATEN BOS ALANA DOKUNMA. Ilk surumde bos `<Company></Company>` de
      // "FIRMA-ANONIM" yapiliyordu ama `temizlenen` bos kaliyordu; sonuc:
      // fonksiyon dosyayi degistiriyor, cagiran "degismedi" saniyordu →
      // `fixture:dogrula` D1 sekiz dosyada "temizligin OTESINDE degismis"
      // diye kirmizi yandi. Karar ile eylem AYNI kosula baglanmali.
      if (String(eski).trim() === '' || String(eski) === yeni) return _m;
      temizlenen.push(`${etiket}="${eski}"`);
      return `<${etiket}${oz ?? ''}>${yeni}</${etiket}>`;
    });
  }
  return { cikti, temizlenen };
}

async function main() {
  const yaz = process.argv.includes('--yaz');
  const JSZip = require('jszip');

  const koklerVar = KOKLER.filter((k) => fs.existsSync(k));
  if (koklerVar.length === 0) { console.log('ON KOSUL YOK — fixture dizini yok'); process.exit(2); }
  const hedefler = koklerVar.flatMap((k) =>
    fs.readdirSync(k).filter((f) => /\.(xlsx|xlsm)$/i.test(f)).map((f) => ({ kok: k, ad: f })));
  console.log(`── PK3 FIXTURE ANONIMLESTIRME ${yaz ? '(YAZMA)' : '(KURU KOSUM — yazmaz)'} ──`);
  koklerVar.forEach((k) => console.log(`   kaynak: ${path.relative(path.resolve(__dirname, '../..'), k).replace(/\\/g, '/')}`));
  console.log(`   ${hedefler.length} dosya\n`);

  let toplamDegisiklik = 0;
  for (const { kok: KOK, ad: d } of hedefler) {
    const tam = path.join(KOK, d);
    const zip = await JSZip.loadAsync(fs.readFileSync(tam));
    // ── 1) HUCRE METNI (xl/sharedStrings.xml) ──
    const ss = zip.file('xl/sharedStrings.xml');
    let adet = 0;
    let sayac: Record<string, number> = {};
    if (!ss) {
      console.log(`  ⚠ ${d}: sharedStrings.xml yok (tum metin inline) — elle bakilmali`);
    } else {
      const xml: string = await ss.async('string');
      const r = kimlikleriDegistir(xml);
      sayac = r.sayac;
      adet = Object.values(sayac).reduce((a, b) => a + b, 0);
      if (adet > 0) zip.file('xl/sharedStrings.xml', r.cikti);
    }
    toplamDegisiklik += adet;

    // ── 2) BELGE USTVERISI (docProps) — kisi/sirket adlari ──
    const ustveriIzleri: string[] = [];
    for (const g of ['docProps/core.xml', 'docProps/app.xml']) {
      const dosya = zip.file(g);
      if (!dosya) continue;
      const { cikti: yeniXml, temizlenen } = ustveriTemizle(await dosya.async('string'));
      if (temizlenen.length) { ustveriIzleri.push(...temizlenen); zip.file(g, yeniXml); }
    }

    // ── 3) DOSYA ADI ──
    const yeniAd = anonimAd(d);
    const degisti = adet > 0 || ustveriIzleri.length > 0;

    console.log(`  ${degisti ? '✏' : '·'} ${d}`);
    if (adet) console.log(`      ${adet} kimlik gecisi: ${Object.entries(sayac).map(([k, v]) => `${k}×${v}`).join(', ')}`);
    if (ustveriIzleri.length) console.log(`      üstveri temizlendi: ${ustveriIzleri.join(', ')}`);
    if (yeniAd !== d) console.log(`      dosya adi → ${yeniAd}`);

    // ⚠ 01.08.2026 KUSUR: yazma `adet > 0` kosuluna baglanmisti. Kimligi
    // YALNIZ DOSYA ADINDA olan uc dosya (Aksa Enerji-Göynük, Aksa_Göynük_YSS,
    // Bahçeçicler) hic dokunulmadan eski adiyla kaldi — yani kimlik yine
    // repoya girecekti. Icerik, ustveri ve ad UC AYRI karardir:
    if (yaz && degisti) {
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      fs.writeFileSync(path.join(KOK, yeniAd), buf);
      if (yeniAd !== d) fs.unlinkSync(tam);
    } else if (yaz && yeniAd !== d) {
      // Icerik+ustveri temiz, ad kirli → dosyayi BOZMADAN tasi.
      fs.renameSync(tam, path.join(KOK, yeniAd));
    }
  }

  console.log(`\n  TOPLAM ${toplamDegisiklik} kimlik gecisi bulundu.`);

  // ══ KALINTI TARAMASI — RUN BOLUNMESI SESSIZ GECMESIN ═══════════════════
  // Degistirme HAM XML uzerinde calisir; Excel bir hucre metnini bicimlendirme
  // run'larina bolerse ("Zümrütevler…No:43/12" + "Maltepe- İstanbul") anahtar
  // ham XML'de HIC eslesmez ve kimlik SESSIZCE kalir. Burada her `<si>` blogu
  // ETIKETLERINDEN ARINDIRILIP yeniden taranir: gorunen metinde hala bir
  // anahtar varsa, yukaridaki degistirme onu kaciridi demektir.
  console.log('\n── KALINTI TARAMASI (etiketsiz gorunum) ──');
  let kalinti = 0;
  const taranacak = koklerVar.flatMap((k) =>
    fs.readdirSync(k).filter((f) => /\.(xlsx|xlsm)$/i.test(f)).map((f) => ({ kok: k, ad: f })));
  for (const { kok: KOK, ad: d } of taranacak) {
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(KOK, d)));
    const ss = zip.file('xl/sharedStrings.xml');
    if (!ss) continue;
    const xml: string = await ss.async('string');
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const gorunen = m[1].replace(/<[^>]+>/g, '');
      const { sayac } = kimlikleriDegistir(gorunen);
      const anahtarlar = Object.keys(sayac);
      if (anahtarlar.length) {
        kalinti++;
        console.log(`  ⚠ ${d}: [${anahtarlar.join(', ')}] → ${JSON.stringify(gorunen.slice(0, 100))}`);
      }
    }
    // Ustveri de taranir: temizleme yalniz BILINEN etiketleri bosaltir; yeni
    // bir alan (ornegin `cp:contentStatus`) ad tasirsa burada gorunur.
    for (const g of ['docProps/core.xml', 'docProps/app.xml']) {
      const dosya = zip.file(g);
      if (!dosya) continue;
      const s: string = await dosya.async('string');
      const { temizlenen } = ustveriTemizle(s);
      if (temizlenen.length) { kalinti++; console.log(`  ⚠ ${d}: ${g} hala dolu → ${temizlenen.join(', ')}`); }
    }
  }
  if (kalinti === 0) console.log('  ✅ kalinti yok — gorunen metinde ve ustveride hicbir kimlik kalmadi.');
  else console.log(`  ❌ ${kalinti} kalinti — run bolunmesi veya temizlenmemis ustveri.`);
  if (!yaz) {
    console.log('\n  Kuru kosum — hicbir dosya degismedi.');
    console.log('  Yazmak icin: npm run fixture:anonim -- --yaz');
    console.log('  SONRA ZORUNLU: npm run fixture:dogrula -- --orijinal <yedek-dizin>');
    console.log('  SONRA ZORUNLU: golden.spec.ts CASES + verify.mjs slug adlarini guncelle.');
  }
}

// Modul olarak import edildiginde (fixture-dogrula) main() KOSMAZ.
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
