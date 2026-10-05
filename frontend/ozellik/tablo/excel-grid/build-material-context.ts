// Baslik-baglam yardimcilari (H4/C3) — ExcelGrid.tsx buildMaterialContext
// bunlari import eder. NOT (denetim 22.07, kullanici karari): plain-array
// reimplementasyon (buildMaterialContextFromArray/DetailedFromArray/
// findHeaderAbove + extractCapFromText) SILINDI — tek tuketicisi olan
// "Tum Sayfalari Fiyatlandir" {false&&} blogu 8139c56'da kaldirilmisti;
// ayni mantigin canli kopyasi ExcelGrid.tsx icinde yasar.


/**
 * B2 IKIZI (04.10): tipografik tirnaklari ASCII kesmeye cevirir.
 *
 * Arka uc `normalizer.normalizeText` bunu ZATEN yapiyor; buradaki iki olcut
 * ise HAM metne bakiyordu ve yalnizca ASCII kaliplari taniyordu. Sonuc: ofis
 * otomatik duzeltmesinin urettigi "1''" (U+2019 x2) satiri burada "olcusu
 * yok" sayilip yanlis bir baslikla zenginlestirilebiliyordu — iki taraf AYNI
 * metni FARKLI okuyordu.
 *
 * Kacisla yazilir ki editor/otomatik duzeltme karakteri sessizce degistiremesin
 * (arka uctaki kusur tam olarak oyle dogmustu: sinifin icindekiler tipografik
 * SANILAN iki ASCII kesme isaretiydi).
 * Kapi: build-material-context.test.ts "B2 IKIZ" blogu.
 */
function tirnakNormal(s: string): string {
  return s.replace(/[‘’ʼ′]/g, "'").replace(/[“”″]/g, '"');
}
/** H4: metin HERHANGI bir olcu ifadesi iceriyor mu? (DN, Ø, inc, mm, kesir, NNxN) */
export function hasSizeExpression(text: string): boolean {
  const t = tirnakNormal(text).toLowerCase().replace(/'{2}/g, '"').replace(/½/g, '1/2').replace(/¾/g, '3/4').replace(/¼/g, '1/4');
  return /dn[\s-]*\d|[øØ]\s*\d|\d\s*(mm|inch|inc|inç)\b|\d\s*["']|\d+\/\d+|\bd\d{2,3}\b|\d{2,3}\s*x\s*\d/.test(t);
}

/** Malzeme TIPI kelimesi (boru/vana/dolap...) — C3 kendi-kendine-yeterlilik sinyali */
const TYPE_WORD_RE = /boru|pipe|vana|valve|valf|dirsek|elbow|reduksiyon|redüksiyon|tee|\bte\b|manşon|manson|coupling|flanş|flans|flange|izolasyon|insulation|pompa|pump|radyat|kombi|klozet|lavabo|batarya|musluk|kablo|pano|sigorta|kazan|dolap|dolab|sayaç|sayac|kolektör|kolektor|hidrofor|eşanjör|esanjor|vantilatör|klima|fan\b|anahtar|priz|sprinkler\b|sprink\b/i;

/**
 * C1/C3: satir yetim mi? Yetim = yalniz cap/sinif/kod tasiyor ("DN 25", "Ø32",
 * "1 1/4\"", "PN25"). Tip kelimesi iceren veya olcu disinda anlamli uzunlukta
 * metni olan satir KENDI KENDINE YETERLIDIR — baslik eklenmez.
 */
export function isSelfSufficientRow(text: string): boolean {
  if (TYPE_WORD_RE.test(text)) return true;
  // Olcu/PN ifadelerini soy, kalan harf sayisina bak
  // ⚠ Burada tirnak normalizasyonu YOK, bilerek (04.10 olculdu): zincirin SON
  // adimi harf disindaki HER karakteri atiyor, dolayisiyla tirnagin bicimi
  // sonucu DEGISTIREMEZ. Eklendi, 11 girdide olculdu, farki cikmadi (atil) ve
  // geri alindi. `hasSizeExpression` ise ham metinde kalip ariyor — orada
  // normalizasyon YUK TASIR ve duruyor.
  const stripped = text
    .toLowerCase()
    .replace(/'{2}/g, '"')
    .replace(/dn[\s-]*\d+/g, ' ')
    .replace(/pn\s*\d+/g, ' ')
    .replace(/[øØ]\s*\d+/g, ' ')
    .replace(/\d+\s*(mm|inch|inc|inç)\b/g, ' ')
    .replace(/\d+\s+\d+\/\d+/g, ' ')
    .replace(/\d+\/\d+/g, ' ')
    .replace(/\d+\s*["']*/g, ' ')
    .replace(/[^a-zçğıöşü]/gi, '');
  return stripped.length >= 12;
}

// ══ CAP OKUYUCU — ARKA UC IKIZI, SATIR SATIR KOPYA (P2-ek kurali, 05.10) ══
// Kaynak: backend/src/ozellik/eslestirme/utils/build-material-context.ts
// (`INCH_TO_DN` … `extractCapFromText`). Ice aktarim YOK — on yuz arka ucu
// cagiramaz; iki kopya `test:cap-ikiz` ile kilitli (kaynak metni BIREBIR +
// 13 gercek kesif dosyasinin tum adlari + kenar durumlar AYNI sonuc).
// Kural degisirse ONCE arka ucta degisir, sonra buraya AYNEN kopyalanir.
const INCH_TO_DN: Record<string, string> = {
  '1/2': 'dn15', '3/4': 'dn20', '1': 'dn25', '1 1/4': 'dn32',
  '1 1/2': 'dn40', '2': 'dn50', '2 1/2': 'dn65', '3': 'dn80',
  '4': 'dn100', '5': 'dn125', '6': 'dn150', '8': 'dn200',
};

/**
 * BASLIK BAGLAMI CAP OKUYUCUSU — ON YUZ ↔ ARKA UC IKIZ KURALI (P2-ek, 05.10).
 *
 * Bu fonksiyon motorun cap yolu DEGILDIR (o conversion.extractSizeInfo); yalniz
 * baslik birlestirmenin cap korumasi icin "bu metnin ASIL olcusu ne?" sorusunu
 * cevaplar. On yuzdeki canli kopya (ExcelGrid.tsx) AYNI kurali tasimak zorunda —
 * ikiz kapisi iki fonksiyonu gercek kesif kulliyatinda birebir karsilastirir.
 * Ice aktarim YOK ki on yuze satir satir kopyalanabilsin.
 *
 * KURAL (sirayla; olculdu: 21 gercek dosya, 3.850 tekil ad, eski iki taraf 169
 * adda ayrisiyordu):
 *  1. Hazirlik: kucuk harf · tipografik tirnak → ASCII · '' → " · BITISIK
 *     unicode kesir onceki rakamla BILESIKTIR ("1¼" → "1 1/4"; eskiden arka uc
 *     "11/4" yapip hic okumuyordu) · kesirdeki bosluk birlesir ("1 / 2" → "1/2").
 *  2. Acik etiket ("Çap:" / "Çapı :") — ILK etiketin KENDI bolgesindeki (sonraki
 *     etikete dek) ILK olcu; okunamazsa siradaki etiket. Sartname metninde sonraki
 *     etiketler alt parcayi anlatir: "Baskın Vana … Çapı : DN100 … Elle Tahrik
 *     Ünitesi : Çapı : ½”" → dn100, "Giriş Çapı : DN100 / Çıkış Çapı : 2 x DN 65"
 *     → dn100 (P3 kulliyati, 3.142 ad: SON etiket 3 vanada dn15 okuyordu).
 *     ("Boru DN25 (1”) … ancak Çap: DN50" → dn50)
 *  3. Parantez ici IKINCILDIR — disarida olcu varsa yalniz disari okunur.
 *     ("DN150 Kollektör (2xDN100+…+1xDN15)" → dn150; eskiden arka uc dn15)
 *  4. DN incten once; hem DN'de hem incte ILK olcu — redüksiyon / branşman
 *     kelepçesi / inegal te / itfaiye ağzında ilk olcu ASIL hat capidir
 *     ("DN150 x DN50", "4''x3'' Redüksiyon"). Eskiden arka uc SON DN'i, on yuz
 *     ILK DN'i aliyordu; incte ikisi de SONU. "1xDN65" bitisik yazim gecerli.
 *  5. Inc isareti: " her zaman; tek kesme ya da ` YALNIZ arkasinda harf yokken —
 *     "Tehlike sınıfı 1'e uygun", "EN 671-1’e" Turkce ektir, olcu degil
 *     (eskiden arka uc dn25). Sol sinir: rakam, "/" ve NOKTALI ondalik ("1.8\"")
 *     icinden olcu okunmaz (eskiden "1/4\"" → 4", "1.8\"" → 8"). Virgul ondalik
 *     SAYILMAZ, liste ayiracidir: "TS EN 671-1,1\" hortum" → dn25 (olculdu: iki
 *     kulliyatta virgullu ondalik inc 0 ad). Bilinen sinir: "1,5\"" 5" okunur —
 *     eski iki tarafla ayni.
 */
const INC_ISARETI = String.raw`(?:"|['\x60](?![a-zçğıöşü]))`;
const BILESIK_RE = new RegExp(String.raw`(?<![\d/])(\d+)\s+(\d+)\/(\d+)(?:${INC_ISARETI})?`, 'g');
const KESIR_RE = new RegExp(String.raw`(?<![\d/])(\d+)\/(\d+)(?:${INC_ISARETI})?`, 'g');
const TAM_RE = new RegExp(String.raw`(?<![\d/])(?<!\d\.)(\d+)${INC_ISARETI}`, 'g');

function capHazirla(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BC\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/'{2}/g, '"')
    .replace(/(\d)\s*\u00BD/g, '$1 1/2').replace(/(\d)\s*\u00BC/g, '$1 1/4').replace(/(\d)\s*\u00BE/g, '$1 3/4')
    .replace(/\u00BD/g, '1/2').replace(/\u00BC/g, '1/4').replace(/\u00BE/g, '3/4')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2');
}

function ilkCap(n: string): string | null {
  const dn = n.match(/(?:(?<![a-z])|(?<=\dx))dn\s*(\d+)/);
  if (dn) return `dn${dn[1]}`;
  const bulunan: { deger: string; bas: number; son: number }[] = [];
  const cakisir = (i: number) => bulunan.some((x) => x.bas <= i && i < x.son);
  let m: RegExpExecArray | null;
  BILESIK_RE.lastIndex = 0;
  while ((m = BILESIK_RE.exec(n)) !== null) bulunan.push({ deger: `${m[1]} ${m[2]}/${m[3]}`, bas: m.index, son: m.index + m[0].length });
  KESIR_RE.lastIndex = 0;
  while ((m = KESIR_RE.exec(n)) !== null) if (!cakisir(m.index)) bulunan.push({ deger: `${m[1]}/${m[2]}`, bas: m.index, son: m.index + m[0].length });
  TAM_RE.lastIndex = 0;
  while ((m = TAM_RE.exec(n)) !== null) if (!cakisir(m.index)) bulunan.push({ deger: m[1], bas: m.index, son: m.index + m[0].length });
  if (bulunan.length === 0) return null;
  bulunan.sort((a, b) => a.bas - b.bas);
  return INCH_TO_DN[bulunan[0].deger] ?? null;
}

export function extractCapFromText(text: string): string | null {
  if (!text) return null;
  const n = capHazirla(text);
  const etiketler = Array.from(n.matchAll(/(?:^|[^a-zçğıöşü])[cç]ap[ıi]?\s*[:=]\s*/g));
  for (let i = 0; i < etiketler.length; i++) {
    const bas = (etiketler[i].index ?? 0) + etiketler[i][0].length;
    const son = i + 1 < etiketler.length ? (etiketler[i + 1].index ?? n.length) : n.length;
    const etiketli = ilkCap(n.slice(bas, son));
    if (etiketli) return etiketli;
  }
  return ilkCap(n.replace(/\([^)]*\)/g, ' ')) ?? ilkCap(n);
}
