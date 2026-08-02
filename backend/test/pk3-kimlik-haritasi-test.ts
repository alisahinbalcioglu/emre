/**
 * PK3 — KIMLIK HARITASI SOZLESMESI  (`npm run test:pk3`)
 *
 * NEDEN VAR: 01.08.2026'da anonimlestirme yazma moduna alinmadan ONCE icerik
 * taramasi yapildi ve harita IKI GERCEK KUSURLA yakalandi:
 *
 *   1. Ciplak "Aksa" anahtari, YILDIZ dosyasindaki UC malzeme aciklamasinin
 *      ICINE dusuyordu ("Aksamı", "Aksesuar", "Aksamlarıyla"). O dosyada
 *      Aksa kimligi HIC YOKTU; sinirsiz degistirme urun metnini bozacakti.
 *   2. Harita dosya ADLARINA bakilarak yazilmisti; yalniz HUCRE METNINDE
 *      duran kimlikler (HABAŞ, sahsi cep telefonu, e-posta, acik adres)
 *      haritada HIC YOKTU — anonim kosulsa bile git gecmisine girecekti.
 *
 * `fixture:dogrula` bu iki kusuru YAKALAYAMAZ: onun olcutu "haritayi
 * orijinale uygulayinca yeni dosya cikiyor mu" — yani haritayi DOGRU KABUL
 * EDER. Haritanin kendisini sinayan tek yer burasi.
 *
 * Fixture GEREKTIRMEZ (saf fonksiyon) → CI'da HER ZAMAN kosar.
 * "Fixture'lar repoda mi" sorusu AYRI paket: `npm run test:pk3-repo`.
 * Cikis kodu sozlesmesi: 0 = PASS · 2 = ON KOSUL YOK · diger = FAIL.
 */
import { KIMLIK_HARITASI, KIMLIK_SIRASI, kimlikleriDegistir, anonimAd, ustveriTemizle } from './fixture-anonim';

let pass = 0;
const fails: string[] = [];
const sina = (kod: string, ad: string, kosul: boolean, kanit: string) => {
  if (kosul) { pass++; console.log(`  ✅ ${kod} ${ad} — ${kanit}`); }
  else { fails.push(`${kod} ${ad} — ${kanit}`); console.log(`  ❌ ${kod} ${ad} — ${kanit}`); }
};
const cevir = (s: string) => kimlikleriDegistir(s).cikti;

console.log('── PK3: KIMLIK HARITASI SOZLESMESI ──\n');

// ══ AILE 1 · ANAHTAR, DAHA UZUN BIR SOZCUGUN BASI OLABILIR ═══════════════
// Iki AYRI ornek: tek ornek "o dosyaya ozel yama" olurdu (genel cozum kurali).
// Ikisi de YILDIZ ENTEGRE KARTEPE dosyasindan BIREBIR alinmis gercek metin.
{
  const a = '- Su Motorlu Gong ve Aksamı, Basınç Anahtarı,';
  sina('P1', 'ürün metni "Aksamı" bozulmaz', cevir(a) === a, `"${cevir(a)}"`);

  const b = 'Aksesuar : Her Türlü Aksamlarıyla (Trim) Birlikte';
  sina('P2', 'ürün metni "Aksesuar/Aksamlarıyla" bozulmaz', cevir(b) === b, `"${cevir(b)}"`);
}

// ══ AILE 2 · GERCEK KIMLIK, NOKTALAMAYLA CEVRILI OLSA DA DEGISIR ═════════
// Sinir kurali fazla siki olsaydi bu ikisi KACARDI — yani P1/P2'yi
// "hicbir seyi degistirme" diyerek de gecmek MUMKUN DEGIL.
{
  const a = 'KOCAELİ/KARTEPE';
  sina('P3', 'eğik çizgiyle çevrili kimlik değişir', cevir(a) === 'KOCAELİ/SAHA-UC', `"${cevir(a)}"`);

  const b = '2024-0001-Aksa_Göynük_YSS -R003 -LİNTU.xlsx';
  sina('P4', 'alt çizgiyle çevrili kimlik dosya adında değişir',
    anonimAd(b) === '2024-0001-FIRMA-F_SAHA-IKI_YSS -R003 -FIRMA-B.xlsx', `"${anonimAd(b)}"`);
}

// ══ AILE 3 · TURKCE HARF SINIRI ══════════════════════════════════════════
// `\b` kullanilsaydi BU assert kirmizi olurdu: JS'te `\w` = [A-Za-z0-9_],
// yani "Ş" ve "İ" sozcuk disi sayilir, sinir "HABAŞ" ile "İ" ARASINA duser
// ve eslesme YANLISLIKLA olurdu. Turkce `İ` tuzaginin akrabasi.
{
  const a = 'HABAŞİ';
  sina('P5', 'Türkçe harfle devam eden anahtar eşleşmez (\\b yeterli değil)',
    cevir(a) === a, `"${cevir(a)}"`);

  const b = 'HABAŞ BURSA DEMİRTAŞ OSB FABRİKA BİNASI';
  sina('P6', 'gerçek HABAŞ kimliği değişir',
    cevir(b) === 'FIRMA-I BURSA SAHA-BIR OSB FABRİKA BİNASI', `"${cevir(b)}"`);
}

// ══ AILE 4 · ILETISIM/ADRES KIMLIKLERI HARITADA OLMALI ═══════════════════
// Tarama bulgusunun unutulmasini engeller. Biri haritadan dusurulurse
// (ornegin "artik gerek yok" diye) bu assert kirmiziya doner.
{
  // 'HASAN SEVİNDİK' 02.08'de eklendi: KARTEPE fixture'inin Icmal kunyesinde
  // (İLGİLİ: etiketi ayri hucrede) commit'li GERCEK kisi adi bulundu.
  const zorunlu = ['emre@lintumuhendislik.com.tr', 'www.lintumuhendislik.com.tr', '+90 505 885 15 64', 'HABAŞ', 'HASAN SEVİNDİK'];
  const eksik = zorunlu.filter((k) => !(k in KIMLIK_HARITASI));
  sina('P7', 'iletişim/adres kimlikleri haritada', eksik.length === 0,
    eksik.length ? `EKSİK: ${eksik.join(', ')}` : `${zorunlu.length} anahtar mevcut`);

  const tel = 'Tel : +90 505 885 15 64';
  sina('P8', 'şahsi telefon maskelenir', !/505 885 15 64/.test(cevir(tel)), `"${cevir(tel)}"`);
}

// ══ AILE 5 · IDEMPOTENS — CIKTI TEKRAR CEVRILINCE DEGISMEZ ═══════════════
// Zincirleme degistirme (bir takma adin icinde baska bir anahtarin kalmasi)
// dosyayi ikinci kosumda sessizce bozardi.
{
  const ornekler = [
    'ŞAHİNKUL FABRİKA MEKANİK TESİSAT',
    'LİNTU MÜHENDİSLİK-BEYKOZ OKUL PROJESİ AKÇADAĞ',
    'YILDIZ ENTEGRE KARTEPE YANGIN TESİSATI TEKLİFİ',
  ];
  const kirik = ornekler.filter((s) => cevir(cevir(s)) !== cevir(s));
  sina('P9', 'ikinci kez çevirmek hiçbir şeyi değiştirmez', kirik.length === 0,
    kirik.length ? `zincirleme: ${kirik[0]} → ${cevir(cevir(kirik[0]))}` : `${ornekler.length} örnek sabit`);

  const kalan = KIMLIK_SIRASI.filter((k) => Object.values(KIMLIK_HARITASI).some((v) => cevir(v) !== v && v.includes(k)));
  sina('P10', 'hiçbir takma ad başka bir anahtarı içermez', kalan.length === 0,
    kalan.length ? `çakışan anahtar: ${kalan.join(', ')}` : `${KIMLIK_SIRASI.length} anahtar temiz`);
}

// ══ AILE 6 · TAKMA AD, METNE YENI RAKAM SOKAMAZ ══════════════════════════
// 01.08.2026 OLCUMU: takma ad "SAHA-3" iken YILDIZ'in baslik satiri
// "…KARTEPE TEİSİSİ…" (rakamsiz) → "…SAHA-3 TEİSİSİ…" oldu; `miktarNormalize`
// metnin icinden "-3"u cekti, o satirin `_toplam`'i "" yerine -3 oldu ve
// `_isDataRow` false→true dondu. Anonimlestirme, fixture'in OLCTUGU
// DAVRANISI degistirmisti — PK3'un tam olarak yasakladigi sey.
{
  const rakam = /\d/;
  const ihlal = Object.entries(KIMLIK_HARITASI)
    .filter(([k, v]) => !rakam.test(k) && rakam.test(v))
    .map(([k, v]) => `${k} → ${v}`);
  sina('P11', 'rakamsız anahtarın takma adı da rakamsız', ihlal.length === 0,
    ihlal.length ? `RAKAM SOKUYOR: ${ihlal.join(', ')}` : `${Object.keys(KIMLIK_HARITASI).length} eşleme temiz`);

  // Somut regresyon: gercek YILDIZ baslik metni rakamsiz kalmali.
  const baslik = cevir('YILDIZ ENTEGRE KARTEPE TEİSİSİ YANGIN TESİSATI');
  sina('P12', 'YILDIZ başlık metni rakamsız kalır', !rakam.test(baslik), `"${baslik}"`);
}

// ══ AILE 7 · BELGE USTVERISI (docProps) ══════════════════════════════════
// 01.08.2026 OLCUMU: 12 fixture'in HEPSINDE `docProps/core.xml` gercek kisi
// adi tasiyordu (dc:creator = "Murat Bahar", "Ali IŞIK", "Halil Akman",
// "Kaan Aktolgalılar", "emre başaran"…; cp:lastModifiedBy = "akilliphone
// Berkant"…) ve birinde app.xml <Company> = "HABAS A.S.". sharedStrings'e
// bakan anonimlestirme bunlarin HICBIRINI gormuyordu — 11 kisinin adi git
// gecmisine girecekti. Bu adlar HARITAYLA cozulmez (onceden bilinemez);
// cozum alan bazli TOPTAN temizlik.
{
  const core = '<cp:coreProperties><dc:creator>Murat Bahar</dc:creator>'
    + '<cp:lastModifiedBy>akilliphone Berkant</cp:lastModifiedBy>'
    + '<dc:title>Keşif Özeti</dc:title></cp:coreProperties>';
  const { cikti, temizlenen } = ustveriTemizle(core);
  sina('P13', 'core.xml kişi adları silinir',
    !/Murat Bahar|Berkant|Keşif Özeti/.test(cikti) && temizlenen.length === 3, `"${cikti}"`);

  const app = '<Properties><Company>HABAS A.S.</Company><Application>Excel</Application></Properties>';
  const r2 = ustveriTemizle(app);
  sina('P14', 'app.xml şirket adı silinir, diğer alanlar korunur',
    !r2.cikti.includes('HABAS') && r2.cikti.includes('<Application>Excel</Application>'), `"${r2.cikti}"`);

  // Idempotens: temiz dosyayi tekrar temizlemek "degisiklik var" DEMEMELI,
  // yoksa kalinti taramasi her kosumda yalanci alarm verirdi.
  sina('P15', 'temizlenmiş üstveri ikinci kez "kirli" sayılmaz',
    ustveriTemizle(cikti).temizlenen.length === 0 && ustveriTemizle(r2.cikti).temizlenen.length === 0,
    'ikinci geçişte 0 iz');
}

// NOT: "fixture'lar git'te izleniyor mu" AYRI bir sozlesmedir ve AYRI bir
// pakettedir (`npm run test:pk3-repo`). Buraya konuldugunda git'siz bir
// dizinde `git ls-files` firlatiyor ve HARITA SOZLESMESINI de birlikte
// goturuyordu — olculdu: `git archive` ile cikarilmis CI taklidinde tum
// PK3 coktu. Iki ayri on kosul, iki ayri paket.

console.log(`\nSONUC: ${pass} PASS, ${fails.length} FAIL`);
if (fails.length) { fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
