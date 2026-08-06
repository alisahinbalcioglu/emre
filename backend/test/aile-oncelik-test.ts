/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  AILE COZUM ONCELIGI — REGRESYON KAPISI
 *
 *  NE KORUR: `basIsimAilesi` sondan-parca merdiveninde EN KISA cozulen parcada
 *  duruyor. Bu, daha UZUN ve uzman eliyle yazilmis sozluk ifadesinin hic sira
 *  almamasina yol aciyordu — 295 sozluk deseninin 9'u OLU KODDU
 *  (`test/sozluk-golgeleme-olcum.ts` ile olculdu).
 *
 *  KURAL (K3 — "kapsama ustunlugu"): bir cozucu (regex ya da sozluk) metnin bir
 *  parcasina kilitlendiginde, TUM METINDE o parcayi KAPSAYAN daha uzun ve COK
 *  KELIMELI bir sozluk deseni varsa SOZLUK kazanir.
 *    ✓ "prefabrik boru yalitimi" → 'boru' ifadenin ICINDE  → izolasyon
 *    ✗ "yangin dolabi vanasi"    → 'vana' ifadenin DISINDA → vana (DEGISMEZ)
 *
 *  BU DOSYA IKI BLOKTUR VE IKISI DE ZORUNLUDUR:
 *    A) KURTARMA — beklenen deger SOZLUGUN KENDI `slug` beyanindan gelir,
 *       motordan DEGIL (dairesel olcut yasagi: [[feedback-dairesel-olcut-yasak]]).
 *    B) KORUMA   — degismemesi gereken vakalar; her birinin gerekcesi ALAN
 *       bilgisidir, "bugun boyle cikiyor" degil.
 *
 *  KOSUM: cd backend && npx ts-node test/aile-oncelik-test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { AD_SOZLUGU, AD_ZENGINLESTIRME } from '../src/ozellik/eslestirme/matching/ad-cins-sozlugu';
import { resolveFamily } from '../src/ozellik/eslestirme/matching/index/product-index';

let gecti = 0;
const hatalar: string[] = [];

function bekle(metin: string, beklenen: string | null, gerekce: string) {
  const alinan = resolveFamily(metin);
  if (alinan === beklenen) {
    gecti++;
  } else {
    hatalar.push(`  ✗ "${metin}"\n      beklenen=${beklenen}  alinan=${alinan}\n      gerekce: ${gerekce}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// A) KURTARMA — sozlugun KENDI beyan ettigi aile geri gelmeli
//    Beklenen deger sozluk girdisinin `slug` alanindan OKUNUR.
// ═══════════════════════════════════════════════════════════════════════════
const SOZLUK = [...AD_SOZLUGU, ...AD_ZENGINLESTIRME];
const slugBul = (desen: string): string => {
  const g = SOZLUK.find((e) => e.patterns.includes(desen));
  if (!g) throw new Error(`ON KOSUL COKTU — sozlukte boyle bir desen yok: "${desen}". Desen silindiyse bu satir da silinmeli.`);
  return g.slug;
};

/** 06.08 olcumunde golgelendigi TESPIT EDILEN desenler (9 adet, 5 aile). */
const GOLGELENENLER = [
  'vana ceketi',                 // izolasyon   — regex /vana/ yutuyordu
  'tas yunu vana ceketi',        // izolasyon   — regex /vana/ yutuyordu
  'prefabrik boru yalitimi',     // izolasyon   — regex /boru/ yutuyordu
  'isi geri kazanimli santral',  // klima-santrali — regex /kazan/ "kazanimli" icinde tutuyordu
  'yangin hortumu dolabi',       // yangin-dolabi  — regex /hortum/ yutuyordu
  'esnek sprink baglantisi',     // hortum      — regex /sprink/ yutuyordu
  'y suzgec',                    // pislik-tutucu — sozluk 'suzgec' (yer suzgeci!) yutuyordu
  'y tipi suzgec',               // pislik-tutucu — ayni
  'isi sayaci',                  // kalorimetre — sozluk 'sayac' (su sayaci) yutuyordu
];

console.log('── A) KURTARMA (golgelenen sozluk desenleri) ──');
if (GOLGELENENLER.length === 0) throw new Error('BOS KUME — yalanci yesil. Liste dolu olmali.');
for (const desen of GOLGELENENLER) {
  bekle(desen, slugBul(desen), 'sozluk bu deseni kendi ailesine beyan ediyor; motor onu duymak zorunda');
}

// Gercek dunyada bu ifadeler CIPLAK gelmez — marka onu, olcu sonu olur.
// Kural gurultuye dayanmiyorsa is gormez.
console.log('── A2) KURTARMA — GERCEK DUNYA GURULTUSU ile ──');
const GURULTULU: [string, string][] = [
  ['ARMAFLEX Taş Yünü Vana Ceketi DN100', 'izolasyon'],
  ['Prefabrik Boru Yalıtımı 42x30 mm', 'izolasyon'],
  ['ISISAN Isı Geri Kazanımlı Santral 5000 m3/h', 'klima-santrali'],
  ['Yangın Hortumu Dolabı 20 m makaralı', 'yangin-dolabi'],
  ['Esnek Sprink Bağlantısı 1" x 700 mm', 'hortum'],
  ['DUYAR Y Tipi Süzgeç DN50 PN16', 'pislik-tutucu'],
  ['Ultrasonik Isı Sayacı DN20', 'kalorimetre'],
];
for (const [metin, beklenen] of GURULTULU) {
  bekle(metin, beklenen, 'gurultu (marka/olcu) eklenince de ayni aile cozulmeli');
}

// ═══════════════════════════════════════════════════════════════════════════
// B) KORUMA — bu vakalar DEGISMEMELI. Gerekce ALAN bilgisidir.
// ═══════════════════════════════════════════════════════════════════════════
console.log('── B) KORUMA (degismemesi gerekenler) ──');
const KORUMA: [string, string | null, string][] = [
  ['Yangın Dolabı Vanası', 'vana',
   'BAS ISIM "vanasi" sondadir ve "yangin dolabi" ifadesinin DISINDADIR — bu bir vanadir'],
  ['Vana İstasyonu Kabini', 'kabin',
   'S5 canli vaka: kabin bir vana degildir; bas isim "kabini"'],
  ['Dekoratif boru kompansatörü', 'kompansator',
   'Kurulus vakasi: icindeki "boru" nitelemedir, urun kompansatordur'],
  ['Sismik Askı', 'aski',
   'Gergi/tij ailesi — kelepce DEGIL. Yalin "aski"yi kelepceye baglama tuzagi'],
  ['Deprem Askısı', 'aski',
   'Ayni gerekce; 06.08 olcumunde bu iki satir kayma riski olarak isaretlendi'],
  ['Sprinkler borusu', 'boru',
   'Gercekten borudur — sondan cozum dogru sonucu veriyor'],
  ['Akış anahtarı', 'akis-anahtari',
   'E4 ailesi; "anahtari" tek basina cozulmez, iki kelime birlikte cozer'],
  ['Kanalizasyon Borusu', 'boru',
   'NEGATIVE_GUARD: kanalizasyon hava kanali DEGILDIR; urun borudur'],
  ['Hava Kanalı', 'kanal', 'Havalandirma kanali ailesi'],
  ['Sıcak Su Kazanı', 'kazan', 'Gercekten kazandir — /kazan/ dogru tutuyor'],
  ['Yangın Dolabı', 'yangin-dolabi', 'Yalin ifade; kapsayan daha uzun desen yok'],
  ['Esnek Sprinkler Bağlantı Hortumu', 'hortum', 'Sozlukteki en uzun desen zaten bu'],
  ['Kauçuk Köpüğü Boru İzolasyonu', 'izolasyon', 'Icindeki "boru" nitelemedir'],
  ['Kanal İzolasyonu', 'izolasyon', 'Icindeki "kanal" nitelemedir'],
  ['İzolasyon Ceketi', 'izolasyon', 'Sozluk deseni birebir'],
  ['Klima Santrali', 'klima-santrali', 'Sozluk deseni birebir'],
];
if (KORUMA.length === 0) throw new Error('BOS KUME — yalanci yesil.');
for (const [metin, beklenen, gerekce] of KORUMA) bekle(metin, beklenen, gerekce);

// ═══════════════════════════════════════════════════════════════════════════
// C) NORM KELEPCE — "BORU ASKISI" ⇒ BORU KELEPCESI
//
// KULLANICI SIKAYETI (06.08): NORM KELEPÇE markasi hicbir eslestirme yapmiyor.
// OLCULEN kok neden: teklif satiri `"Sprinkler Boru Askisi, DN150"` icindeki
// "Boru" kelimesi yuzunden 'boru' ailesine cozuluyor, NORM urunleri ise
// 'kelepce' ailesinde → AD KILIDI tutmuyor, `ad-yok`.
//
// KANIT (repo'nun KENDI uzman verisi, fikir degil): `ad-cins-sozlugu.ts`
// CINS_YUVALARI son satiri — `{ ad: 'Boru kelepçesi', yuva: 'Tip',
// degerler: [..., 'sprinkler askısı'] }`. Yani sprinkler askisi, boru
// kelepcesinin bir TIPI olarak zaten tanimli.
//
// ⚠ COK KELIMELI OLMAK ZORUNDA: yalin "aski" kelimesini kelepceye baglamak
// YANLIS olurdu — "Sismik Aski" ve "Deprem Askisi" gergi/tij ailesidir.
// Bu yuzden asagida hem KURTARMA hem KAYMA-YASAK vakalari var.
//
// ⚠ BILINEN SINIR (kasitli, olculdu): "Kanal Askisi" DOKUNULMADI → 'kanal'
// kalir. Kanal askisi profil/tij sistemidir, kelepce degildir; kelepce
// oldugunu gosteren hicbir verimiz yok. Kanit cikarsa ayri tur.
// ═══════════════════════════════════════════════════════════════════════════
console.log('── C) NORM KELEPÇE: aski ⇒ kelepce ──');
const KELEPCE_KURTARMA: [string, string][] = [
  ['Sprinkler Boru Askısı, DN150', 'kelepce'],  // kullanicinin GERCEK satiri
  ['Boru Askısı', 'kelepce'],
  ['Boru Askısı DN100', 'kelepce'],
  ['Galvaniz Boru Askısı 4"', 'kelepce'],
  ['Sprinkler Askısı', 'kelepce'],              // repo'nun kendi CINS_YUVALARI beyani
];
for (const [metin, beklenen] of KELEPCE_KURTARMA) {
  bekle(metin, beklenen, 'boru/sprinkler askisi = boru kelepcesi (CINS_YUVALARI beyani)');
}

console.log('── C2) KAYMA YASAK: gergi/tij ailesi kelepceye KAYMAYACAK ──');
const KELEPCE_KAYMA_YASAK: [string, string, string][] = [
  ['Sismik Askı', 'aski', 'Sismik aski gergi/tij sistemidir — kelepce DEGIL'],
  ['Deprem Askısı', 'aski', 'Deprem askisi gergi/tij — 06.08 olcumunde kayma riski olarak isaretlendi'],
  ['Boru Konsolu', 'aski', 'Konsol mesnettir, kelepce degil'],
  ['Askı Tiji M8', 'aski', 'Tij = gergi cubugu'],
  ['Askı Çubuğu M10', 'aski', 'Ayni gerekce'],
  ['Kanal Askısı', 'kanal', 'BILEREK dokunulmadi — kelepce oldugu KANITLANMADI'],
  ['Sert Yivli Boru Bağlantı Kelepçesi, DN150', 'kelepce', 'Zaten dogruydu, bozulmamali'],
  ['Branşman Kelepçesi, DN65 x DN25', 'kelepce', 'Zaten dogruydu (kalan sorunu CIFT OLCU, aile degil)'],
  ['Somunlu Kelepçe', 'kelepce', 'Norm 293 satir — yalin ad kaydi bozulmamali'],
];
if (KELEPCE_KURTARMA.length === 0 || KELEPCE_KAYMA_YASAK.length === 0) {
  throw new Error('BOS KUME — yalanci yesil.');
}
for (const [metin, beklenen, gerekce] of KELEPCE_KAYMA_YASAK) bekle(metin, beklenen, gerekce);

// ═══════════════════════════════════════════════════════════════════════════
console.log('');
console.log('════════════════════════════════════════════════════════════════');
const toplam = gecti + hatalar.length;
if (hatalar.length > 0) {
  console.log(` ✗ AILE ONCELIGI: ${gecti}/${toplam} gecti, ${hatalar.length} BASARISIZ`);
  console.log('');
  for (const h of hatalar) console.log(h);
  console.log('════════════════════════════════════════════════════════════════');
  process.exit(1);
}
console.log(` ✓ AILE ONCELIGI: ${gecti}/${toplam} kriter gecti`);
console.log('════════════════════════════════════════════════════════════════');
