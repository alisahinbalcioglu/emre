// ════════════════════════════════════════════════════════════════════
// SORGU MOTORU (v2) — Ad kilitli SERT FILTRE ZINCIRI
//
// Bu motorda SKOR YOKTUR. Aday "uretilmez", havuz FILTRELENIR.
// K6 ("metin benzerligi yuksek ama Adi farkli urun aday olamaz") bir kural
// degil, bu tasarimin dogal sonucudur: benzerlik kavrami motorda YOK.
//
// UC SONUC (PRD Bolum 7 — dorduncu yol yasak):
//   kalan 1  → single      : fiyat yazilir
//   kalan ≥2 → ask         : ayrisan kolon fiyatli sorulur
//   kalan 0  → none        : "bu markada yok" + alternatif markalar
//
// SAF: DB yok, I/O yok. Test DB'siz kosar.
// ════════════════════════════════════════════════════════════════════

import { sizeEquivalents, SizeClass } from '../conversion';
import { altKumeMi, tokenEsit } from './product-index';
import { EQUIPMENT_TYPE_TAGS } from '../shared-tag-matcher';
import { buildFamilyVocab, distinctSayisi } from './vocab';
import { classifyTokens } from './line-parser';
import type { IndexedRow, LineQuery, QueryOutcome, QueryOpts, AskColumn } from './types';

/**
 * Satirin olcu sinifi. YENI ve daha iyi kaynak: aile havuzunun kendisi.
 * v1 bunu MARKADAN tahmin ediyordu ("ÇAYIROVA → çelik"). Artik urunler
 * kendi sinifini soyluyor; havuzda tek sinif varsa satirin sinifi odur.
 * Bu, I4'u ("marka yalniz dogrular") mekanik olarak saglar.
 */
export function resolveLineClass(rows: IndexedRow[], hint?: SizeClass | null): SizeClass {
  const siniflar = new Set(rows.map((r) => r.urun.sizeClass).filter((s) => s !== 'unknown'));
  if (siniflar.size === 1) return Array.from(siniflar)[0] as SizeClass;
  if (hint) return hint;
  return 'unknown'; // → union + ambiguous → asla otomatik yazma (P4 korumasi)
}

/** Ayrisan ILK kolon sorulur. "Cins tekrar sorulmaz" veriden duser (K3). */
export function ayrisanKolon(rows: IndexedRow[]): AskColumn {
  if (distinctSayisi(rows, (r) => r.urun.adBucket) > 1) return 'ad'; // K5
  if (distinctSayisi(rows, (r) => r.urun.cinsNorm ?? '') > 1) return 'cins';
  if (distinctSayisi(rows, (r) => r.urun.baglantiNorm ?? '') > 1) return 'baglanti'; // K3
  if (distinctSayisi(rows, (r) => r.urun.boyTag ?? '') > 1) return 'boy';
  return 'urun'; // kolonlar ayni, kayit farkli → K7 vakasi (ayni kod, iki fiyat)
}

/**
 * Alt-kume testi: teklifin token'lari urununkinin icinde mi?
 * ONEK TOLERANSLI — Turkce eki burada gecilir ('galvaniz' ⊂ 'galvanizli'),
 * kok alma YOK (bkz. product-index.tokenEsit: -lı eki ile govde-sonu -l
 * sozluksuz ayirt edilemez).
 */
const altKume = altKumeMi;

export function runQuery(line: LineQuery, pool: IndexedRow[], opts?: QueryOpts): QueryOutcome {
  // ── 0. URUN DEGIL ────────────────────────────────────────────────
  if (line.notProduct) return { kind: 'none', reason: 'urun-degil' };

  // ── 0b. SOZLUK KELIMELERI AYIKLANIR (S3) ─────────────────────────
  // Alias'in kendi kelimeleri ('sprink','hatti','temiz','su') sozluk
  // tarafindan ZATEN tuketildi — kisit da degiller, "bulunamadı" da.
  const tokens = opts?.ignoreTokens?.length
    ? line.tokens.filter((t) => !opts.ignoreTokens!.some((ig) => tokenEsit(ig, t)))
    : line.tokens;

  // ── 1. AD — SERT KILIT ───────────────────────────────────────────
  // Seviye1: aile. Vana/hortum bir kompansator satirina HICBIR skorla
  // aday olamaz — cunku skor yok, filtre var.
  // 'belirsiz' urunler (aile cozulemedi) havuza HIC girmez (PRD 2A).
  let rows = pool.filter((r) => !r.urun.belirsiz);

  // ── 1a. SEVIYE1: AILE (cozulduyse) ───────────────────────────────
  // S3: satir kendi ailesini cozemediyse SOZLUK cozer (hidrant→boru).
  // E8 guard CAGIRANDA: satir ailesi COZULDUYSE hintFamily zaten gelmez.
  const familySlug = line.familySlug ?? opts?.hintFamily ?? null;
  if (familySlug) {
    rows = rows.filter((r) => r.urun.adSlug === familySlug);
    if (rows.length === 0) return { kind: 'none', reason: 'ad-yok', detail: familySlug };
  }

  // ── 1a2. SOZLUK SINIFI — SERT (T1: sozluk cinsi YAZILI sayilir) ──
  // "TEMİZ SU" (→PPR) altinda celik urun ADAY OLAMAZ (R3). Karsit sinif
  // elenir; 'unknown' gecer (urun sinifini soylemiyorsa suclanmaz).
  if (opts?.hintClass) {
    const karsit = opts.hintClass === 'plastic' ? 'steel' : 'plastic';
    rows = rows.filter((r) => r.urun.sizeClass !== karsit);
    if (rows.length === 0) {
      return { kind: 'none', reason: 'kriter-yok', detail: opts.hintLabel ?? opts.hintClass };
    }
  }

  // ── 1b. SEVIYE2: AD TOKEN'LARI — AILE COZULMESE DE UYGULANIR ─────
  // ⚠ Bunu once yanlis yaptim: tum token filtrelemesi `if (familySlug)`
  // blogunun ICINDEYDI. Aile cozulemeyen satirda ("OTOMATİK HAVA ATMA
  // PÜRJÖRÜ DN 20" → aile=null, sozlukte yok) HICBIR ad kisiti uygulanmiyor,
  // geriye yalniz cap kaliyordu → DN20'li HER urun aday oluyordu (canli
  // vakada 359 aday: sprinkler hortumu, dogalgaz hortumu, kondenstop...).
  // Bu, tam da sokmeye calistigimiz hastaligin ta kendisiydi.
  //
  // Dagarcik: aile cozulduyse aile havuzundan, cozulmediyse TUM havuzdan.
  const vocab = buildFamilyVocab(rows);
  const yol = classifyTokens(tokens, vocab);
  // Aileyi COZEN kelimeler "taninmayan" sayilmaz — onlar ailenin adidir
  // (es anlamli olabilir: "flow switch" ↔ "Akış anahtarı"). Yalniz FILTRE
  // DISI kalirlar; kullaniciya eksikmis gibi RAPORLANMAZLAR.
  const bilinmeyen = yol.bilinmeyen.filter((t) => !line.aileKelimeleri.includes(t));

  if (yol.ad.length) {
    // ── TAM AD ESLESMESI ONCELIKLIDIR (PRD §4: "bucket kilitlenir — YALNIZ bu ad")
    // Canli vaka: "Dilatasyon kompansatörü DN25" → 16 aday geldi; hepsi dogru
    // aileden ama UC ayri ad: "Dilatasyon kompansatörü" (4) + "Omega U-Flex
    // dilatasyon kompansatörü" (6) + "Omega V-Flex dilatasyon kompansatörü" (6).
    // Salt alt-kume mantigi ({dilatasyon} ⊆ {omega,vflex,dilatasyon}) Omega'lari
    // da aliyordu. Oysa kullanici ADIN TAMAMINI yazmis ve kutuphanede o ad
    // BIREBIR var → bucket odur; K1 "yalniz Dilatasyon kompansatörü kayitlari"
    // diyor. Boylece soru da doguru yere kayar: alt-ad degil, BAGLANTI (K3).
    //
    // Tam eslesme = token kumeleri ESIT (alt-kume + ayni sayida).
    const tam = rows.filter(
      (r) => r.urun.adTokens.length === yol.ad.length && altKume(yol.ad, r.urun.adTokens),
    );
    if (tam.length > 0) {
      rows = tam;
    } else {
      // Tam ad yok → alt-kume: teklif UST ad yazmis olabilir ("kompansatör"),
      // ya da urun adi daha uzundur ("Omega V-Flex dilatasyon kompansatörü").
      const daralt = rows.filter((r) => altKume(yol.ad, r.urun.adTokens));
      if (daralt.length > 0) rows = daralt;
      else return { kind: 'none', reason: 'ad-yok', detail: yol.ad.join(' ') };
    }
  }

  // ── KARAR #3'UN SINIRI ───────────────────────────────────────────
  // "Taninmayan token kisit degildir" kurali, AILE KILIDI ZATEN TUTUYORKEN
  // dogrudur: kompansator ailesi icinde "dilatsyon" yazim hatasi → alt-ad
  // sorusu, vana/hortum yine sizamaz. Kullanici secer, es anlamli ogrenilir.
  //
  // Ama aile HIC cozulmemisken ayni kurali uygulamak "her seyi goster"
  // demektir. Ayrim sudur:
  //   • hic ad kelimesi YOK ("DN 20")        → bir sey sorulmadi → SOR (R11)
  //   • kelime VAR ama hicbiri taninmiyor    → var olmayan bir sey soruldu → YOK
  if (!familySlug && yol.ad.length === 0 && bilinmeyen.length > 0) {
    return { kind: 'none', reason: 'ad-yok', detail: bilinmeyen.join(' ') };
  }

  // ── 3/4/5. YAZILI CINS + BAGLANTI — SERT (K4) ────────────────────
  if (yol.cins.length) {
    const d = rows.filter((r) => altKume(yol.cins, r.urun.cinsTokens));
    if (d.length > 0) rows = d; else return { kind: 'none', reason: 'kriter-yok', detail: yol.cins.join(' ') };
  }
  if (yol.baglanti.length) {
    const d = rows.filter((r) => altKume(yol.baglanti, r.urun.baglantiTokens));
    if (d.length > 0) rows = d; else return { kind: 'none', reason: 'kriter-yok', detail: yol.baglanti.join(' ') };
  }
  if (rows.length === 0) return { kind: 'none', reason: 'ad-yok' };

  // ── 2. CAP — SERT ────────────────────────────────────────────────
  // Esdegerlik INDEKSTE on-hesapli (capTags): teklifteki 2" ile kutuphanedeki
  // DN50 burada bulusur, sorgu aninda cevrim TABLOSU aranmaz.
  let donusum: string | null = null;
  if (line.capInfo) {
    const cls = resolveLineClass(rows, opts?.sizeClassHint);
    const equiv = sizeEquivalents(cls, line.capInfo);
    donusum = equiv.rozet;
    if (equiv.tags.length) {
      const d = rows.filter((r) => r.urun.capTags.some((t) => equiv.tags.includes(t)));
      // Capsiz ekipman (E1/H3): urunun capi yoksa cap filtresi ELEMEZ —
      // "kompansator 40cm hortum" gibi satirlarda cap satira degil urune ait
      // olmayabilir. Capi OLAN urunler arasinda ise filtre serttir.
      const capsiz = rows.filter((r) => r.urun.capTags.length === 0);
      rows = d.length > 0 || capsiz.length === 0 ? d : capsiz;
      if (rows.length === 0) return { kind: 'none', reason: 'cap-yok', detail: line.capInfo.display, donusum };
    }
  }

  // ── 5. YAZILI BOY — SERT ─────────────────────────────────────────
  if (line.boyTag) {
    const d = rows.filter((r) => r.urun.boyTag === line.boyTag);
    if (d.length > 0) rows = d;
  }

  // ── 5b. TABAN YUZEY BEKLENTISI (S3/R1) — sozluk "siyah" der ──────
  // CAKISAN tabani (siyah↔galvaniz) tasiyan aday elenir; taban tasimayan
  // (kirmizi boyali = kaplama) VARYANT olarak KALIR — Duzeltme Talebi dersi:
  // "siyah'a daralt" yanlisti. SATIR KAZANIR: satir acikca 'galvaniz'
  // yazdiysa cins filtresi zaten galvanize indirdi; burada eleme havuzu
  // BOSALTACAKSA dokunulmaz (yazili kelime sozlugu ezer, T3).
  if (opts?.hintBases?.length && rows.length > 1) {
    const TABANLAR = ['siyah', 'galvaniz'];
    const kept = rows.filter((r) => {
      const rowBases = TABANLAR.filter((b) =>
        r.urun.cinsTokens.some((t) => tokenEsit(b, t)) || r.urun.adTokens.some((t) => tokenEsit(b, t)));
      return rowBases.length === 0 || rowBases.some((b) => opts.hintBases!.includes(b));
    });
    if (kept.length > 0 && kept.length < rows.length) rows = kept;
  }

  // ── 6. V4 GRUP VARYANTI — kullanicinin KENDI secimi ──────────────
  // R16 dersi: kullanici sinyali marka/skor sinyalinden ONCE uygulanir.
  // (v2'de zaten marka tie-break YOK — marka artik stok kapsami.)
  if (opts?.variantTags?.length) {
    const v = opts.variantTags;
    const eslesen = rows.filter((r) => v.every((t) => urunVariantTags(r).includes(t)));
    if (eslesen.length === 1) return { kind: 'auto-variant', row: eslesen[0], donusum };
    if (eslesen.length === 0) {
      return { kind: 'ask', askColumn: ayrisanKolon(rows), rows, bilinmeyen, donusum, variantMissing: true };
    }
    rows = eslesen;
  }

  // ── E2 BIRIM CELISKISI (I9): metre birimli satir EKIPMAN ailesine ──
  // indiyse otomatik yazim KAPANIR — tek aday bile ONAY listesine gider.
  // ("sprinkler hattı" ≠ "sprinkler": metre birimli satir boru istiyordur.)
  const unitConflict =
    line.unitSignal === 'pipe' && familySlug && EQUIPMENT_TYPE_TAGS.has(familySlug)
      ? `Birim (${line.unit}) ekipman ailesiyle çelişiyor`
      : null;

  // ── SONUC: UC YOL, DORDUNCU YOK ──────────────────────────────────
  if (rows.length === 1) {
    if (unitConflict) {
      return { kind: 'ask', askColumn: ayrisanKolon(rows), rows, bilinmeyen, donusum, uyariNot: unitConflict };
    }
    return { kind: 'single', row: rows[0], donusum };
  }
  return { kind: 'ask', askColumn: ayrisanKolon(rows), rows, bilinmeyen, donusum, uyariNot: unitConflict ?? undefined };
}

/**
 * Urunun varyant kimligi (FE icin OPAK — round-trip eder).
 * CAP DAHIL DEGIL: varyant grup ici farkli caplara YAYILIR; capi dahil
 * edersek yayilim kirilir (v1'de de isVariantTag len-'i disliyordu, ayni ders).
 */
export function urunVariantTags(r: IndexedRow): string[] {
  const out: string[] = [`ad:${r.urun.adBucket}`];
  if (r.urun.cinsNorm) out.push(`cins:${r.urun.cinsNorm}`);
  if (r.urun.baglantiNorm) out.push(`bag:${r.urun.baglantiNorm}`);
  return out;
}
