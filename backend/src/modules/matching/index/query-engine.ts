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

/** Alt-kume testi: teklifin token'lari urununkinin icinde mi? */
const altKume = (istenen: string[], varolan: string[]) => istenen.every((t) => varolan.includes(t));

export function runQuery(line: LineQuery, pool: IndexedRow[], opts?: QueryOpts): QueryOutcome {
  // ── 0. URUN DEGIL ────────────────────────────────────────────────
  if (line.notProduct) return { kind: 'none', reason: 'urun-degil' };

  // ── 1. AD — SERT KILIT ───────────────────────────────────────────
  // Seviye1: aile. Vana/hortum bir kompansator satirina HICBIR skorla
  // aday olamaz — cunku skor yok, filtre var.
  // 'belirsiz' urunler (aile cozulemedi) havuza HIC girmez (PRD 2A).
  let rows = pool.filter((r) => !r.urun.belirsiz);

  // ── 1a. SEVIYE1: AILE (cozulduyse) ───────────────────────────────
  if (line.familySlug) {
    rows = rows.filter((r) => r.urun.adSlug === line.familySlug);
    if (rows.length === 0) return { kind: 'none', reason: 'ad-yok', detail: line.familySlug };
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
  const yol = classifyTokens(line.tokens, vocab);
  const bilinmeyen = yol.bilinmeyen;

  if (yol.ad.length) {
    const daralt = rows.filter((r) => altKume(yol.ad, r.urun.adTokens));
    if (daralt.length > 0) rows = daralt;
    else return { kind: 'none', reason: 'ad-yok', detail: yol.ad.join(' ') };
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
  if (!line.familySlug && yol.ad.length === 0 && bilinmeyen.length > 0) {
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

  // ── SONUC: UC YOL, DORDUNCU YOK ──────────────────────────────────
  if (rows.length === 1) return { kind: 'single', row: rows[0], donusum };
  return { kind: 'ask', askColumn: ayrisanKolon(rows), rows, bilinmeyen, donusum };
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
