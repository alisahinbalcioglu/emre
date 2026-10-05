// ════════════════════════════════════════════════════════════════════
// TEKLIF SATIRI COZUCU (v2)
//
// Metin cikarimi YALNIZ burada yasar. Sebep: teklif satiri MUSTERININ
// Excel'inden gelir — serbest metindir, kolonlu degildir. Urun tarafinda
// (product-index.ts) tahmin YOKTUR; orada 11 kolon vardir.
//
// Bu modul SAFTIR: DB yok, I/O yok. conversion.ts / normalizer.ts /
// ad-resolver.ts primitiflerini YENIDEN YAZMAZ, cagirir.
// ════════════════════════════════════════════════════════════════════

import { normalizeText, extractMaterialType } from '../normalizer';
import { resolveAd } from '../ad-resolver';
import { extractSizeInfo, isSizeTag, SizeInfo } from '../conversion';
import { tokenize, buildBoyTag, resolveFamily, tokenEsit } from './product-index';
import type { LineQuery, FamilyVocab, RoutedTokens, IndexedRow } from './types';

/**
 * "FITTINGS ORANI", "İşçilik", "Nakliye" — fiyat BEKLENMEYEN satirlar.
 * v1'den birebir tasindi (matching.service.ts:346) — davranis degismemeli
 * (spec R12 bu deseni assert ediyor).
 *
 * S5 (gercek Aksa dosyasi olcumu): hizmet/is kalemleri eklendi — kazi,
 * dolgu, boyama, projelendirme, muhendislik, tasima. Bunlar TEKLIF satiri
 * tarafinda calisir, urun indeksine dokunmaz. 'imalat' SATIR SONUNA demirli:
 * "Çelik İmalatlar" hizmettir ama "özel imalat çelik kolektör" URUNDUR.
 */
const NOT_PRODUCT_RE = /\borani?\b|\biscilik\b|\bmontaj\b|\bnakliye\b|\bdevreye\s*alma\b|\bgenel\s*gider|fittings?\s*(orani|bedeli|oran)\b|boru\s*\+\s*fitting|\bsarf\b|\bkazi\b|\bdolgu\b|\bboyama\b|\bprojelendirme\b|\bmuhendislik\b|\btasima\b|\bimalat(lar)?i?\s*$/;

/**
 * Satirin ailesini cozer. Urun tarafiyla AYNI iki kaynak (regex → sozluk),
 * boylece iki taraf ayni kelime dagarcigini konusur.
 */
export function resolveLineFamily(text: string): string | null {
  // Urun tarafiyla AYNI kural (bas isim sonda) — iki taraf ayni aileyi
  // cozmezse eslesme imkansizdir. Tek kaynak: product-index.resolveFamily.
  return resolveFamily(text);
}

/**
 * Teklif satiri metni → LineQuery.
 *
 * @param unit  I9 birim sinyali ('adet' | 'm' | ...) — opsiyonel
 */
export function parseLine(text: string, unit?: string | null): LineQuery {
  const raw = text ?? '';
  const norm = normalizeText(raw);

  // E2 birim sinyali (v1 matching.service ile AYNI desenler — davranis birebir):
  // metre/mtül/mt/m → boru beklentisi; adet/ad/takım/tk → ekipman beklentisi.
  const unitNorm = unit ? normalizeText(unit) : '';
  const unitSignal: LineQuery['unitSignal'] =
    unitNorm && /metre|mtul|^mt\.?$|^m\.?$/.test(unitNorm) ? 'pipe'
    : unitNorm && /adet|^ad\.?$|takim|^tk\.?$/.test(unitNorm) ? 'equipment'
    : null;

  // ── K6-B (27.08): PARANTEZ ICI NOT hizmet taramasindan MUAF ─────────
  // Olculdu — su MASUM urun satirlari NOT_PRODUCT sayilip komple elenmisti:
  //   "19 mm Kauçuk İzolasyon 1/2" (yapıştırıcı, bant vb. sarf malzemesi dahil)"
  //   "2" siyah boru (montaj dahil)" · "1" küresel vana (montaj aparatı dahil)"
  // Parantez, satiriN KENDISINI degil KAPSAMINI anlatir ("... dahil" notu);
  // icindeki 'sarf/montaj/nakliye' kelimeleri satiri hizmete cevirmez.
  // Tarama parantezleri SOYULMUS metinde yapilir — gercek hizmet satiri
  // ("İşçilik (mekanik)") kelimeyi parantez DISINDA tasidigi icin yine
  // yakalanir. Parantez icerigi token/cap cikarimina AYNEN girmeye devam
  // eder (yalniz bu tarama muaf).
  const hizmetTarama = normalizeText(raw.replace(/\([^)]*\)/g, ' '));
  if (NOT_PRODUCT_RE.test(hizmetTarama)) {
    return { raw, notProduct: true, familySlug: null, tokens: [], aileKelimeleri: [], capInfo: null, boyTag: null, unit: unit ?? null, unitSignal };
  }

  // PARANTEZ ICI = NOT/NITELIK (Faz 2b, canli H1/R6 vakasi): satir sonundaki
  // "(ROZET DAHİL)" notu sondan-cozumde 'rozet' desenine takilip aileyi
  // sprinkler-aksesuar'a KACIRIYORDU. Parantez blogu aile cozumune ve kisit
  // token'larina GIRMEZ (cap/boy cikarimi ham metinden calismaya devam eder —
  // "(73 mm) (DN65)" gibi capli notlar kaybolmaz).
  // FAZ B B8 (04.10 olculdu): tek harf "T" belirtec uretmiyordu (tokenize
  // <2 harfi atar) → "T 1\"" ailesiz onay listesi; "TE/TEE 1\"" otomatik.
  // Te = Tee = T (14.08 kullanici karari). ⚠ 't' TON da olabilir ("5 t
  // celik"): sayidan HEMEN sonra gelen t (kesir/inc isaretinden sonraki
  // haric) cevrilmez; "T tipi" ve "T-25" gibi kod parcalari da cevrilmez.
  // ⚠ YALNIZ satir BASKA bir urun ailesine cozulemiyorsa: Pimtas adlarinda T
  // TIP belirtecidir ("Tek Taraf İç Dişli T Çekvalf") — kosulsuz ceviri bu
  // 12 satira "te bulunamadi" notu ekliyordu (once/sonra karsilastirmasi).
  // T ancak satirin bas ismiyse te'dir: aile yalniz te ile cozuluyorsa.
  let parantezsiz = raw.replace(/\([^)]*\)/g, ' ');
  let familySlug = resolveLineFamily(parantezsiz);
  if (!familySlug) {
    const teMetni = parantezsiz
      .replace(/(?<![\p{L}\p{N}\-])(?<!(?:^|[^\d/.,"'])\d+(?:[.,]\d+)?\s*)[Tt](?![\p{L}\p{N}\-])(?!\s*[tT][iİıI][pP])/gu, 'te');
    const teAilesi = teMetni !== parantezsiz ? resolveLineFamily(teMetni) : null;
    if (teAilesi) { parantezsiz = teMetni; familySlug = teAilesi; }
  }

  // SAHA KISALTMALARI (18.07, Trakya "Glvz." vakasi): satir SERBEST metindir,
  // yaygin kisaltmalar ACILIR ki cins filtresi calisabilsin — "Glvz. Nipel"
  // satirinda galvaniz taninmayinca Siyah/Galvaniz ayrimi yapilamiyor,
  // kullanici yanlis cinse dusebiliyordu (24,5 vs 32 TL). Yalniz TARTISMASIZ
  // yaygin kisaltmalar (genel kural — ornege ozel degil); urun tarafina
  // UYGULANMAZ (kolonlar tam kelime yazar, Karar #1).
  const KISALTMALAR: Record<string, string> = {
    glvz: 'galvaniz',
    galv: 'galvaniz',
  };
  // P4 notu 2'nin IKINCI KOKU (04.10, olculdu): duz nesne aramasi prototipi
  // okur — "CONSTRUCTOR" yazan satirin belirteci Object.prototype.constructor
  // FONKSIYONUNA donusup TUM toplu istegi dusuruyordu. Yalniz KENDI anahtari.
  // FAZ B A5 (04.10 olculdu): `tokenize` tireli kelimeyi tek belirtec yapar
  // ("V-Flex" → vflex) — rakamlarda da: "1-1/4\"" → "11", "2-1/2\"" → "21".
  // Bu artik ad kelimesi sanilip dogru urunu ONAYA dusuruyordu. Kesirli olcu
  // ifadesi belirtec metninden AYIKLANIR (cap ham metinden okunur, kayip yok).
  // `tokenize` urun indeksinde de kullanildigi icin ORADA degistirilmedi.
  const belirtecMetni = parantezsiz
    .replace(/(?<!\d)\d{1,3}(?:\s+|-)\d{1,2}\/\d{1,2}/g, ' ')
    .replace(/(?<!\d)\d{1,2}\/\d{1,2}/g, ' ');
  const adaylar = Array.from(new Set(tokenize(belirtecMetni).map((t) =>
    (Object.prototype.hasOwnProperty.call(KISALTMALAR, t) ? KISALTMALAR[t] : t))));

  // Cap: kaynak-farkinda (DN mi, inc mi, mm mi yazilmis?) — cevrim tablosu
  // secimi buna bagli (PPR'de DN=mm, celikte DN≠mm). v1 ile ayni primitif.
  let capInfo: SizeInfo | null = extractSizeInfo(raw);
  if (!capInfo) {
    // Ciplak PE yolu ("63 PE100 SDR17"): conversion parser'i ciplak sayiyi
    // BILEREK yakalamaz (yanlis pozitif riski) — v1 bu yolu tag'lerden
    // kurtariyordu, aynisini yapiyoruz.
    const legacy = adaylar.find((t) => isSizeTag(t));
    if (legacy) {
      capInfo = legacy.startsWith('od-')
        ? { source: 'mm', value: parseInt(legacy.slice(3), 10), display: legacy }
        : { source: 'dn', value: parseInt(legacy.slice(2), 10), display: legacy.toUpperCase() };
    }
  }

  // ── FAZ C B16 (05.10 olculdu): AGIZ YAZIMI "110'LUK" ─────────────────
  // "110'LUK PİS SU BORUSU" capsiz kaliyor, 'luk' bilinmeyen kelime olup
  // 110 mm urunu bile ONAYA dusuruyordu. Yalniz SATIR tarafi (fiyat listeleri
  // "110 mm" yazar) ve dar: 16-630 arasi sayi — kucuk sayi belirsizdir
  // ("2'lik boru" = 2", "12'lik bakir" = 12 mm), okunmaz; ambalaj anlami
  // ("100'lük paket", "50'lik kutu") olcu DEGILDIR. Yazili olcu varsa o kazanir.
  let lukOlcusu = false;
  if (!capInfo) {
    const luk = norm.match(/(?<![\d.,/])(\d{2,3})\s*'?\s*l[iu]k\b(?!\s*(?:paket|kutu|koli|adet|torba|pk|pkt)\b)/);
    const v = luk ? parseInt(luk[1], 10) : 0;
    if (v >= 16 && v <= 630) {
      capInfo = { source: 'mm', value: v, display: `${v} mm` };
      lukOlcusu = true;
    }
  }

  // ── FAZ C D3 (05.10 olculdu): IZOLASYONDA BASTAKI mm KALINLIKTIR ─────────
  // "25 mm Kauçuk İzolasyon" → 25 mm CAP sanilip 25 mm kalinlikli 35 mm'lik
  // urune OTOMATIK yaziliyordu. KI vakasinin kurali ("19 mm Kauçuk İzolasyon
  // 1/2''" = 19 mm kalinlik + 1/2" boru) arkadan cap gelmeyince de gecerli:
  // izolasyon ailesi + metnin BASINDAKI tek mm olcusu + baska mm olcusu yok →
  // cap YOK. Sayi belirtecte kalir (urunun "25 mm kalınlık" cinsiyle eslesir)
  // ve asagidaki boy kurali onu okur — KI listesi kalinligi BOY sutununda
  // tasir; boy suzgeci yalniz eslesen varsa daraltir, yoksa zararsizdir.
  // Sondaki mm ("Kauçuk İzolasyon 25 mm") belirsiz, dokunulmaz.
  if (familySlug === 'izolasyon' && capInfo?.source === 'mm') {
    const bas = norm.match(/^(\d{1,2})\s*mm\b/);
    if (bas && capInfo.value === parseInt(bas[1], 10) && (norm.match(/\d\s*mm\b/g) ?? []).length === 1) {
      capInfo = null;
    }
  }

  // Boy: "50 cm" / "500 mm" — capla karismasin diye YALNIZ acik uzunluk
  const boyMatch = norm.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm)\b(?!\s*\))/);
  let boyTag: string | null = null;
  if (boyMatch && !capInfo) {
    const v = parseFloat(boyMatch[1].replace(',', '.'));
    boyTag = buildBoyTag(boyMatch[2] === 'cm' ? v * 10 : v);
  }

  // ── OLCU TOKEN'LARINI AYIKLA ─────────────────────────────────────
  // "DN 20" → tokenize ['dn','20'] uretir; ikisi de capInfo tarafindan ZATEN
  // tuketildi, ad kelimesi DEGILLER. Ayiklanmazsa "dn"/"20" ad kisiti sanilir.
  // HASSAS OL: yalin sayiyi kormeden atmak "Sprinkler 68°C 1/2\"" satirinda
  // sicakligi (68) yok ederdi. Bu yuzden yalniz capInfo'nun KENDI degerini
  // ve olcu on-eklerini duseriyoruz.
  // "DN 20" → ['dn','20'] · "DN25" → ['dn25'] (BITISIK, tek token!) — ikisi de
  // olcudur. Canli vakada 'dn25' ad kelimesi sanildi ve kullaniciya
  // '"dn25" bu markada bulunamadı' denildi — capi bulunamamis gibi, yanlis bilgi.
  const olcuOnEk = /^(dn|od|nd|pn|cap)$/;
  const olcuBitisik = /^(dn|od|nd|pn)\d+([.,]\d+)?$/;
  // REDUKSIYON CAP ARTIGI (18.07, "3"x1"" vakasi): tokenize "3\"x1\"" → '3'
  // (len<2 duser) + 'x1' → 'x1' bir OLCU NOTASYONU artigidir (reduksiyon
  // "x1"), ad kelimesi DEGIL. Bilinmeyen sayilip gereksiz onay uretmesin.
  // FAZ B A5 (04.10): bosluksuz DN reduksiyonu TEK belirtec olur ("DN65xDN15"
  // → 'dn65xdn15') — olcu artigi, ad kelimesi degil. ⚠ YALNIZ iki tarafi DN:
  // ilk surum '\d+x\d+'yi de yutuyordu ve once/sonra karsilastirmasi "Teflon
  // Bant 12x10" boyut belirtecini (12 mm x 10 m) dusurdugunu gosterdi.
  const capArtigi = /^x\d|^dn\d+xdn\d+$/;
  const tokens = adaylar.filter((t) => {
    if (olcuOnEk.test(t) || olcuBitisik.test(t) || capArtigi.test(t)) return false;
    // B16: "110'luk" → ['110','luk'] / "110luk" → ['110luk'] — ek olcuya aittir
    if (lukOlcusu && /^(?:\d{2,3})?l[iu]k$/.test(t)) return false;
    if (!capInfo) return true;
    // FAZ B A5: "2 inç BORU" — 'inc'/'inch' olcunun BIRIMIDIR, cap okunduysa
    // tuketilmistir (ad kelimesi degil). Olcusuz satirda kelime korunur.
    if (t === 'inc' || t === 'inch') return false;
    const n = parseFloat(t.replace(',', '.'));
    return !(Number.isFinite(n) && n === capInfo.value);
  });

  // ── AILEYI COZEN KELIMELER ───────────────────────────────────────
  // Bir token KALDIRILINCA aile cozumu bozuluyorsa, o token ailenin ADIDIR.
  // Urun tarafinda gecmemesi EKSIKLIK DEGILDIR — es anlamli olabilir:
  //   "FLOW SWİTCH DN 65" ↔ urun "Akış anahtarı"
  // Ikisi de akis-anahtari ailesine cozulur; 'flow'/'switch' urunun TURKCE
  // adinda gecmez ama ailenin INGILIZCE adidir. Kullaniciya "bulunamadı"
  // demek yalan olur (sozluk onlari zaten taniyor: ad-cins-sozlugu 'flow switch').
  const aileKelimeleri: string[] = [];
  if (familySlug) {
    for (const t of tokens) {
      const kalan = tokens.filter((x) => x !== t).join(' ');
      if (resolveLineFamily(kalan) !== familySlug) aileKelimeleri.push(t);
    }
  }

  return { raw, notProduct: false, familySlug, tokens, aileKelimeleri, capInfo, boyTag, unit: unit ?? null, unitSignal };
}

/**
 * Token yonlendirme — hangi token hangi kolonu kisitliyor?
 *
 * Dagarcik SABIT bir liste degil, o marka+ailenin INDEKSINDEN uretilir
 * (vocab.ts). Boylece "orgulu" bir CINS kelimesi olarak taninir ve Ad
 * kisiti sanilip sifir sonuc uretmez.
 *
 * Oncelik KAPALI kumeden GENIS kumeye: baglanti → cins → ad.
 */
/** Evrensel BAGLANTI tanimlayicilari — urun ADINDA gecseler bile (ornek:
 *  "Dişli mekanik te") aslinda BAGLANTI turudur. Ailenin baglanti dagarciginda
 *  da varlarsa AD yerine BAGLANTI'ya yonlenirler (18.07 canli — Trakya "Te").
 *  Baglanti-dagarcigi SARTI: "dişli kutusu" (aktuator) gibi 'disli'nin gercekten
 *  ad parcasi oldugu ailelerde reroute YAPILMAZ. */
const BAGLANTI_TANIMLAYICI = new Set([
  'disli', 'kaynakli', 'vidali', 'flansli', 'yivli', 'soketli', 'presli',
  'rakorlu', 'gecmeli', 'mansonlu', 'lehimli', 'kaplinli',
  // 04.08 (ÇAYIROVA "2\" Düz Uçlu Boru"): 'duz uclu' evrensel bir BAGLANTI
  // turudur (plain end) ve indeksleyicinin kendi BAGLANTI_K dagarciginda
  // (matching.service.ts:248-249) ZATEN vardi — yalniz BURADA eksikti.
  'duz', 'uclu',
]);

/** Evrensel CINS (yuzey/malzeme) tanimlayicilari — BAGLANTI_TANIMLAYICI'nin
 *  IKIZI. Ayni hastalik, ayni ilac: bu kelimeler urun ADINDA gecseler bile
 *  ("Basınçlı Boru Siyah Düz Uçlu ... Et 2.5mm" — kuyrugu 'Et' ile bittigi
 *  icin indeksleyicinin sondan-soyma dongusu kirilir, 'siyah' AD token'i
 *  kalir) aslinda CINS niteligidir. Ailenin cins dagarciginda da VARSA
 *  AD yerine CINS'e yonlenirler.
 *  CINS-dagarcigi SARTI zorunludur: 'celik' gercekten adin parcasi oldugu
 *  ailelerde ("Çelik konstruksiyon") reroute YAPILMAZ — BAGLANTI_TANIMLAYICI'
 *  daki "dişli kutusu" korumasinin birebir aynisi.
 *  Kaynak: indeksleyicinin CINS_K dagarcigi (matching.service.ts:245-247);
 *  iki taraf ayni kelimeleri ayni kolona yazmazsa havuz yanlis kilitlenir. */
const CINS_TANIMLAYICI = new Set([
  'siyah', 'galvaniz', 'galvanizli', 'kirmizi', 'boyali', 'celik',
  'paslanmaz', 'pirinc', 'dokum', 'bronz', 'bakir', 'ppr', 'pprc', 'pvc',
  'pe', 'pex', 'hdpe', 'polietilen', 'plastik', 'wafer', 'lug',
]);

/** B1 (04.10): CINS_TANIMLAYICI'nin GOVDE MALZEMESI alt kumesi.
 *
 *  Bu kelimeler urunun NE OLDUGUNU soyler ("PE Boru" = govdesi PE olan boru).
 *  Yuzey kelimeleri (siyah/galvaniz/paslanmaz…) ise urunun NASIL oldugunu
 *  soyler ve CINS kolonunda yasamalari dogaldir — 04.08'de konan yeniden-
 *  yonlendirme kurali onlar icindir ve DOKUNULMAZ.
 *
 *  OLCULEN KUSUR: govde kelimesi de yeniden yonlendirilince satirin 'pe'si
 *  CINSe gidiyor ve havuzda CINSINDE 'pe' gecen urun — yani PE KAPLI CELIK
 *  boru — kazaniyordu. Urun tarafi ayni kelimeyi ADa indeksliyor ("PE Boru"
 *  → adTokens ['pe','boru']), yani iki taraf AYNI KELIMEYI FARKLI KOLONA
 *  yaziyordu. Olculdu: "PE BORU Ø32" → single · "Çelik Boru | PE Kaplı
 *  Doğalgaz @400"; gercek PE boru (@60) hic teklif edilmiyordu.
 *
 *  Kural A1'in ikizi: KAPLAMA GOVDE DEGILDIR. Govde kelimesi CINSe yalnizca
 *  hemen ardindan "kapl…" geliyorsa yonlenir ("PE kaplı çelik boru").
 *  Kapi: test/kaplama-cins-test.ts (PE + PVC aileleri, yuzey kalkani). */
const GOVDE_MALZEMESI = new Set([
  'ppr', 'pprc', 'pvc', 'pe', 'pex', 'hdpe', 'polietilen', 'plastik',
]);

export function classifyTokens(tokens: string[], vocab: FamilyVocab): RoutedTokens {
  const out: RoutedTokens = { ad: [], cins: [], baglanti: [], bilinmeyen: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // B1: govde malzemesi YALNIZ kaplama olarak yazilmissa cins sayilir.
    const kaplama = /^kapl/.test(tokens[i + 1] ?? '');
    const cinsTanimlayici = CINS_TANIMLAYICI.has(t) && (!GOVDE_MALZEMESI.has(t) || kaplama);
    // ONCELIK: AD > BAGLANTI > CINS.
    //
    // AD once, cunku AD KILITTIR (PRD 2B-1); cins/baglanti onun icinde
    // daraltmadir. Bir token hem Ad'da hem Cins'te gecebilir: "Omega V-Flex
    // dilatasyon kompansatörü" ADinda 'vflex' var, "V-Flex ±40 mm" CINSinde de.
    //
    // ⚠ Once tersini yaptim ("en kapali kumeye ver") ve canli vakada kirildi:
    // 'vflex' Cins'e yonlendirilince Ad token kumesi {omega,dilatasyon}'a
    // dusuyor, TAM ad eslesmesi tutmuyor ve U-Flex ile V-Flex ayrilamiyordu.
    // ONEK TOLERANSLI arama: dagarcikta 'galvanizli' varken teklif 'galvaniz'
    // yazmis olabilir. Set.has() birebir arar ve kacirirdi.
    const varMi = (k: Set<string>) => { for (const v of k) if (tokenEsit(t, v)) return true; return false; };
    // BAGLANTI TANIMLAYICISI ISTISNASI (18.07): 'disli' hem "Dişli mekanik te"
    // ADinda hem "dişli çıkış" BAGLANTIsinda gecince, AD onceligi YALIN Te'yi
    // (baglanti bos, ad='te') eliyordu. Evrensel baglanti kelimesi + ailenin
    // baglanti dagarciginda VARSA → baglanti (yalin urunler korunur).
    if (BAGLANTI_TANIMLAYICI.has(t) && varMi(vocab.baglanti)) out.baglanti.push(t);
    // CINS TANIMLAYICISI ISTISNASI (04.08) — yukaridakinin IKIZI: 'siyah' hem
    // "Basınçlı Boru Siyah Düz Uçlu ..." ADinda hem "... - Siyah Düz Uçlu"
    // satirlarinin CINSinde gecince, AD onceligi havuzu ADINDA 'siyah' YAZAN
    // aileye kilitliyor; hedef cap o ailede olmayinca motor "bu markada 2\" yok"
    // diyordu — oysa urun kutuphanede VARDI (I7 sessiz-bos yasagi).
    // K4 BOZULMAZ: cins de SERT filtredir (query-engine.ts:300-308) — kelime
    // elenmez, yalnizca DOGRU kolona yonlenir.
    else if (cinsTanimlayici && varMi(vocab.cins)) out.cins.push(t);
    else if (varMi(vocab.ad)) out.ad.push(t);
    else if (varMi(vocab.baglanti)) out.baglanti.push(t);
    else if (varMi(vocab.cins)) out.cins.push(t);
    else out.bilinmeyen.push(t);
  }
  return out;
}
