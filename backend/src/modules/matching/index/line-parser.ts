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

  if (NOT_PRODUCT_RE.test(norm)) {
    return { raw, notProduct: true, familySlug: null, tokens: [], aileKelimeleri: [], capInfo: null, boyTag: null, unit: unit ?? null, unitSignal };
  }

  // PARANTEZ ICI = NOT/NITELIK (Faz 2b, canli H1/R6 vakasi): satir sonundaki
  // "(ROZET DAHİL)" notu sondan-cozumde 'rozet' desenine takilip aileyi
  // sprinkler-aksesuar'a KACIRIYORDU. Parantez blogu aile cozumune ve kisit
  // token'larina GIRMEZ (cap/boy cikarimi ham metinden calismaya devam eder —
  // "(73 mm) (DN65)" gibi capli notlar kaybolmaz).
  const parantezsiz = raw.replace(/\([^)]*\)/g, ' ');

  const familySlug = resolveLineFamily(parantezsiz);

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
  const adaylar = Array.from(new Set(tokenize(parantezsiz).map((t) => KISALTMALAR[t] ?? t)));

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
  const tokens = adaylar.filter((t) => {
    if (olcuOnEk.test(t) || olcuBitisik.test(t)) return false;
    if (!capInfo) return true;
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
export function classifyTokens(tokens: string[], vocab: FamilyVocab): RoutedTokens {
  const out: RoutedTokens = { ad: [], cins: [], baglanti: [], bilinmeyen: [] };
  for (const t of tokens) {
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
    if (varMi(vocab.ad)) out.ad.push(t);
    else if (varMi(vocab.baglanti)) out.baglanti.push(t);
    else if (varMi(vocab.cins)) out.cins.push(t);
    else out.bilinmeyen.push(t);
  }
  return out;
}
