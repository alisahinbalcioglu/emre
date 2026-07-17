// ════════════════════════════════════════════════════════════════════
// SONUC CEVIRICI (v2) — motorun TEK CIKIS NOKTASI
//
// QueryOutcome (ic tip) → MatchResult (DEGISMEZ dis sozlesme).
//
// ALTIN KURAL ARTIK YAPISAL: fiyat yalnizca 'single' / 'auto-variant'
// dalindan cikabilir. v1'de bu kural kod boyunca dagilmis kontrollerle
// korunuyordu (ve V4 yolu kapiyi atliyordu). Burada tek kapi var:
// digger tum dallar netPrice: 0 doner — baska turlusu YAZILAMAZ.
//
// Sozlesme kaynagi: test/contract-test.ts (74 assert). Bu dosya oradaki
// her alani doldurmak ZORUNDA.
// ════════════════════════════════════════════════════════════════════

import { hesaplaNetFiyat } from '../pricing';
import { extractAttrTags } from '../normalizer';
import { buildAttrUyari } from '../shared-tag-matcher';
import { urunVariantTags } from './query-engine';
import type { MatchResult, MatchCandidate } from '../types';
import type { IndexedRow, QueryOutcome, AskColumn, LineQuery } from './types';

/**
 * Kullaniciya gorunen urun adi: indeksteki displayName + (varsa) BOY.
 * Boy, displayName'e INDEKSTE eklenmedi (INDEX_VERSION artisi + reindex
 * gerektirirdi) — sunum tek cikis noktasinda zenginlestirilir.
 * Canli vaka (17.07): 4 "Yerüstü yangın hidrantı" adayi yalniz BOYLA
 * (1300/1700/2150/2450) ayrisiyordu ama kartlarda OZDES gorunuyordu —
 * kullanici fiyat farkinin neden oldugunu goremiyordu. Boy isme girince
 * hafiza on-secimi de boy'a ozgu calisir (ozdes isimlerde hep ILK aday
 * isaretleniyordu — gizli belirsizlik kapandi).
 */
export function gorunenAd(r: IndexedRow): string {
  return r.urun.boyMm ? `${r.urun.displayName} · ${r.urun.boyMm} mm` : r.urun.displayName;
}

/** Kullanicinin kendi fiyati: ozel fiyat > liste × (1 - iskonto) */
function netFiyat(r: IndexedRow, toTry: (v: number, cur: string) => number): { net: number; list: number; isk: number } {
  const list = toTry(r.listPrice ?? r.urun.price, r.currency);
  const isk = r.discountRate ?? 0;
  if (r.customPrice != null && r.customPrice > 0) {
    const c = toTry(r.customPrice, r.currency);
    return { net: c, list, isk };
  }
  return { net: hesaplaNetFiyat(list, isk), list, isk };
}

/**
 * `label` = SORULAN kolonun o adaydaki degeri.
 * FE (ExcelGrid.tsx:487-492) adaylari label'a gore grupluyor; ayni label'da
 * >1 kayit kalirsa stage2 (2. kademe soru) aciliyor. Yani kademeli soru
 * arayuzu HIC DEGISMEDEN yeni motorla calisir.
 */
function etiket(r: IndexedRow, kolon: AskColumn): string {
  switch (kolon) {
    case 'ad': return r.urun.ad || r.urun.adBucket;
    case 'cins': return r.urun.cins || '—';
    case 'baglanti': return r.urun.baglanti || '—';
    case 'boy': return r.urun.boyMm ? `${r.urun.boyMm} mm` : '—';
    case 'urun':
    default:
      // K7 vakasi: kolonlar ayni, kayit farkli (ayni kod iki fiyat) →
      // kullaniciyi kaynagiyla ayirt ettir.
      return r.urun.kategori || r.urun.sheetName || r.urun.urunKodu || r.urun.ad;
  }
}

function adayla(r: IndexedRow, kolon: AskColumn, toTry: (v: number, cur: string) => number, lineAttr: string[]): MatchCandidate {
  const { net, list, isk } = netFiyat(r, toTry);
  return {
    materialName: gorunenAd(r),
    netPrice: net,
    listPrice: list,
    discount: isk,
    // Geriye uyum: FE (ExcelGrid.tsx:358) tags'ten baslik→alias onerisi
    // uretiyor — ciplak cins token'lari korunur, yoksa o ozellik susar.
    tags: [
      r.urun.adSlug,
      ...r.urun.adTokens,
      ...r.urun.cinsTokens,
      ...r.urun.baglantiTokens,
      ...r.urun.capTags,
    ],
    popular: false,
    label: etiket(r, kolon),
    // v1 anlami: "asama 1 (cins/yuzey) mi, asama 2 (baglanti) mi?"
    surfaceLevel: kolon === 'ad' || kolon === 'cins',
    variantTags: urunVariantTags(r),
    // E3: satirin yapilandirilmis nitelikleri (sicaklik/K/montaj/uzunluk/
    // govde) adayinkiyle karsilastirilir — FARKLI deger tasiyan aday
    // isaretlenir ("68°C istendi — bu ürün 141°C"). Karar #3 geregi bu
    // nitelikler ELEMEZ (soru zaten aciliyor); uyari secimi bilinclendirir.
    uyari: lineAttr.length
      ? buildAttrUyari(lineAttr, extractAttrTags(`${r.urun.ad} ${r.urun.cins ?? ''}`)) ?? undefined
      : undefined,
  };
}

const SORU_METNI: Record<AskColumn, string> = {
  ad: 'Hangi ürün?',
  cins: 'Hangi cins?',
  baglanti: 'Hangi bağlantı şekli?',
  boy: 'Hangi boy?',
  urun: 'Hangi kayıt?',
};

export function toMatchResult(
  outcome: QueryOutcome,
  line: LineQuery,
  toTry: (v: number, cur: string) => number,
): MatchResult {
  const bos = { netPrice: 0, listPrice: 0, discount: 0 };

  switch (outcome.kind) {
    // ── TEK ESLESME: fiyatin yazilabildigi TEK yol ──────────────────
    case 'single': {
      const { net, list, isk } = netFiyat(outcome.row, toTry);
      return {
        netPrice: net, listPrice: list, discount: isk,
        confidence: 'high',
        matchedName: gorunenAd(outcome.row),
        // R18 asserti bu substring'i ariyor — contract-test.ts C2 de.
        reason: 'Tek eşleşme — AD + ÇAP (+ yazılı nitelikler) sonrası markada tek ürün kaldı.',
        donusum: outcome.donusum ?? undefined,
        matchedTags: outcome.row.urun.adTokens,
      };
    }

    // ── V4: kullanicinin KENDI grup secimi bu capa yayildi ──────────
    case 'auto-variant': {
      const { net, list, isk } = netFiyat(outcome.row, toTry);
      return {
        netPrice: net, listPrice: list, discount: isk,
        confidence: 'suggestion',
        autoVariant: true,
        matchedName: gorunenAd(outcome.row),
        reason: 'Grup varyantı uygulandı (önceki seçiminiz bu çapa taşındı).',
        donusum: outcome.donusum ?? undefined,
      };
    }

    // ── COK KAYIT: fiyatli secim listesi — SISTEM SECMEZ ────────────
    case 'ask': {
      // E3: satirin nitelik tag'leri ham metinden bir kez cikarilir
      // (parantez notlari DAHIL — "(68°C)" bir kisit degil ama uyari kaynagidir).
      const lineAttr = extractAttrTags(line.raw);
      const cands = outcome.rows.map((r) => adayla(r, outcome.askColumn, toTry, lineAttr));
      // En sik cins/ad "populer" isaretli (★) — SIRALAMA ipucu, secim DEGIL.
      const sayim = new Map<string, number>();
      for (const c of cands) sayim.set(c.label, (sayim.get(c.label) ?? 0) + 1);
      const enSik = Array.from(sayim.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
      for (const c of cands) if (c.label === enSik && sayim.get(enSik)! > 1) c.popular = true;

      let reason = `${outcome.rows.length} seçenek — ${SORU_METNI[outcome.askColumn]} (fiyat yalnız tek ürün kalınca otomatik yazılır).`;
      if (outcome.uyariNot) {
        // E2: birim celiskisi — tek aday olsa bile onay istenir, neden soylenir
        reason = `${outcome.uyariNot} — onaylayın. ${reason}`;
      } else if (outcome.variantMissing) {
        reason = 'Seçilen varyant bu çapta kütüphanede yok — elle seçin.';
      } else if (outcome.bilinmeyen?.length) {
        // KARAR #3: taninmayan kelimeyi SOYLE — kullanici neden tum ailenin
        // listelendigini anlasin, yazim hatasini gorebilsin.
        reason = `"${outcome.bilinmeyen.join(' ')}" bu markada bulunamadı — ${SORU_METNI[outcome.askColumn].toLowerCase()}`;
      }

      return {
        ...bos, // ALTIN KURAL: netPrice 0 — fiyat sorulmadan YAZILMAZ
        confidence: 'multi',
        candidates: cands,
        reason,
        donusum: outcome.donusum ?? undefined,
        variantMissing: outcome.variantMissing ?? undefined,
        // Faz 2b: dogrulanamayan yazili kelimeler — M3 multi'de de kosulsun
        dogrulanamadi: outcome.bilinmeyen?.length ? outcome.bilinmeyen : undefined,
      };
    }

    // ── SIFIR: "bu markada yok" (+ alternatifler cagirici tarafindan) ─
    case 'none':
    default: {
      if (outcome.reason === 'urun-degil') {
        return { ...bos, confidence: 'none', notProduct: true, reason: 'Ürün değil (oran/hizmet satırı) — fiyat beklenmez.' };
      }
      const nedenMetni: Record<string, string> = {
        'ad-yok': outcome.detail
          ? `Bu markada "${outcome.detail}" bulunamadı.`
          : 'Bu markada bu ürün ailesi yok.',
        'cap-yok': `Bu markada ${outcome.detail ?? 'bu çap'} yok.`,
        'kriter-yok': `Bu markada "${outcome.detail ?? 'istenen nitelik'}" taşıyan ürün yok.`,
        'etiket-yok': 'Satırdan ürün bilgisi çıkarılamadı.',
      };
      return {
        ...bos,
        confidence: 'none',
        reason: nedenMetni[outcome.reason] ?? 'Kütüphanede eşleşme yok.',
        donusum: outcome.donusum ?? undefined,
      };
    }
  }
}
