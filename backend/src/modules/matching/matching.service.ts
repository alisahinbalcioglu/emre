import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateTags } from './tag-generator';
import { hesaplaNetFiyat } from './pricing';
import { extractMaterialKind } from './normalizer';
import { extractSizeInfo } from './conversion';
import { TerminologyService } from './terminology.service';
// TEK MOTOR (Faz 2b): indeksli + Ad-kilitli cekirdek (saf — test:index K1-K7)
import { parseLine } from './index/line-parser';
import { runQuery } from './index/query-engine';
import { toMatchResult } from './index/outcome-mapper';
import { INDEX_VERSION, tokenize, buildProductIndex, rebuildIndexFields } from './index/product-index';
import type { ProductColumns } from './index/product-index';
import type { IndexedRow, LineQuery, QueryOpts } from './index/types';
import type { AliasHint } from './terminology.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import type { MatchResult, BrandAlternative } from './types';
import { KIND_TAGS } from './shared-tag-matcher';

// NOT (Faz 2b sokum — 17.07): v1 skor motoru (matchSingle zinciri,
// HEADER_HINTS kod-ici sozlugu, marka→sinif cikarimi) kod tabanindan
// SILINDI. Islevsel baslik sozlugu artik TEK yerde yasar: TerminologyAlias
// (DB seed + S4 kullanici ogrenmesi) → matchV2 QueryOpts ipuclari.

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly terminology: TerminologyService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  // ── Z4: teklif-ani kur cevrimi ─────────────────────────────────────
  // Kutuphane fiyatlari ORIJINAL para biriminde saklanir (ice aktarimda
  // cevrim yok). Eslestirme aninda — yani teklif hazirlanirken — USD/EUR
  // fiyatlar o anki TCMB kuruyla TRY tabanina cevrilir; teklif ekraninin
  // gorunum birimi (TL/USD/EUR) bu tabani kendi secimine cevirir.
  // Kur, istek basina EN FAZLA 1 kez cekilir (yalniz doviz satiri varsa).
  private async buildTryConverter(
    rows: { currency?: string | null }[],
  ): Promise<(value: number, currency?: string | null) => number> {
    const needsFx = rows.some((r) => r.currency && r.currency !== 'TRY');
    if (!needsFx) return (v) => v;
    const rates = await this.exchangeRates.getRates();
    return (v, currency) => {
      if (currency === 'USD') return Math.round(v * rates.usdTry * 100) / 100;
      if (currency === 'EUR') return Math.round(v * rates.eurTry * 100) / 100;
      return v;
    };
  }

  // ═══════════════════════════════════════════
  // BULK MATCH — Teklif sirasinda (AI YOK)
  // ═══════════════════════════════════════════

  async bulkMatch(
    userId: string,
    brandId: string,
    materialNames: string[],
    // V4 (PRD v1.3): grup ici otomatik atama — secilen varyantin tag'leri.
    // Doluysa adaylar bu tag'lerin TAMAMINI tasimali; tek kalirsa otomatik
    // atanir (autoVariant), hic kalmazsa variantMissing + fiyatli liste (V4.5).
    variantTags?: string[],
    // E2 (Boru Disi Kalemler PRD): satirin BIRIM'i (metre→boru, adet→ekipman)
    // aile cozumunde sinyal olarak kullanilir; sinyaller celisirse otomatik
    // yazim yerine onay listesi. Opsiyonel — eski istemciler etkilenmez.
    units?: Record<string, string>,
  ): Promise<Record<string, MatchResult>> {
    // ── KUTUPHANEM IZOLASYONU (PRD) ──────────────────────────────────
    // Aday havuzu artik GLOBAL MaterialPrice DEGIL, kullanicinin KENDI
    // kutuphanesi (UserLibrary). Kullanici havuzdan "Kutuphaneme Aktar" ile
    // kopyalar, fiyat/iskontoyu ozgurce degistirir, manuel malzeme ekler —
    // teklif eslestirmesi YALNIZ bu kisisel veriyi okur. Global fallback YOK.
    const libRows = await this.prisma.userLibrary.findMany({
      where: { userId, brandId },
      include: {
        material: {
          select: { id: true, name: true, tags: true, normalizedName: true, materialType: true },
        },
        // FAZ 4: urun indeksi — doluysa v2 (Ad-kilitli) motor devreye girer
        product: true,
      },
    });

    if (libRows.length === 0) {
      console.log(`[Matching] Kutuphane bos: user=${userId}, brand=${brandId}`);
      const empty: Record<string, MatchResult> = {};
      const reason =
        'Kütüphanenizde bu markaya ait malzeme yok. Malzeme Havuzu\'ndan "Kütüphaneme Aktar" ile ekleyin.';
      for (const n of materialNames) {
        if (!n.trim()) continue;
        empty[n] = { netPrice: 0, listPrice: 0, discount: 0, confidence: 'none', reason };
      }
      return empty;
    }

    // Z4: dovizli satirlar teklif aninda TRY tabanina cevrilir.
    const toTry = await this.buildTryConverter(libRows as { currency?: string | null }[]);

    // ══ TEK MOTOR (Faz 2b SOKUM — 17.07): v1 skor motoru SILINDI ══════
    // PRD Bolum 7: fallback YASAK — uc sonuc vardir (yaz / fiyatli sec / yok).
    // Eski "TAMAMI indeksli olmali" sarti kalkti: motor degistirilmez, VERI
    // MOTORA GETIRILIR — indekssiz (manuel/legacy) satir istek aninda
    // indekslenir, bayat indeks istek aninda yeniden uretilir (hazirlaPool).
    const pool = this.hazirlaPool(libRows as any[]);
    console.log(`[Matching] v2 INDEKSLI MOTOR (Ad kilitli): ${pool.length} satir, brand=${brandId}`);
    return this.matchV2(userId, brandId, materialNames, pool, toTry, variantTags, units);
  }

  /**
   * UserLibrary satiri → IndexedRow (v2 havuzu). UC DURUM:
   *  1. Guncel indeks → oldugu gibi kullanilir.
   *  2. BAYAT indeks → istek aninda CANLI tokenizer'la yeniden uretilir
   *     (rebuildIndexFields) — 15.07 vakasindaki "sessiz yanlis cevap"
   *     yapisal olarak imkansizlasir; kalici cozum icin reindex onerilir.
   *  3. Indeks YOK (manuel/legacy satir) → istek aninda indekslenir.
   *     Manuel satir SERBEST METINDIR: cap kolonu yoksa metinden cikarilir
   *     (extractSizeInfo) — Karar #1'in "kolondan oku" kurali urun tablosu
   *     icindir; kaynagi zaten kolonsuz olan satirda satir-tarzi cikarim
   *     mesrudur (aksi halde capsiz kalir, Ç-kapisi hep onay isterdi).
   */
  private hazirlaPool(libRows: any[]): IndexedRow[] {
    let bayatSayisi = 0;
    let indekssizSayisi = 0;
    const pool: IndexedRow[] = libRows.map((li) => {
      let urun: IndexedRow['urun'];
      if (li.productIndexId && li.product) {
        if ((li.product.indexVersion ?? 1) !== INDEX_VERSION) {
          bayatSayisi++;
          const cols: ProductColumns = {
            kategori: li.product.kategori, ad: li.product.ad, cins: li.product.cins,
            baglanti: li.product.baglanti, cap: li.product.capRaw, boy: li.product.boyMm,
            birim: li.product.birim, price: li.product.price, paraBirimi: li.product.currency,
            urunKodu: li.product.urunKodu, not: li.product.not, sheetName: li.product.sheetName,
          };
          urun = { ...li.product, ...rebuildIndexFields(cols, { adSlug: li.product.adSlug, belirsiz: li.product.belirsiz }) };
        } else {
          urun = li.product;
        }
      } else {
        indekssizSayisi++;
        const name: string = li.material?.name ?? li.materialName ?? '';
        const price = li.listPrice ?? 0;
        const cap = li.cap ?? extractSizeInfo(name)?.display ?? null;
        // AD'den olcu ifadesi SOYULUR: adBucket/adTokens capa kilitlenmesin.
        // Yoksa "...Boru 1\"" ile "...Boru 1 1/4\"" farkli AD sayilir → V4
        // varyant kimligi (ad:bucket) caplar arasi YAYILAMAZ, tam-ad
        // eslesmesi de kacar. Cap zaten cap kolonuna tasindi (yukarida).
        const adTemiz = (li.cap ? name : name
          .replace(/\b(dn|pn|od)\s*-?\d+(?:[.,]\d+)?\b/gi, ' ')
          .replace(/\d+\s+\d+\/\d+\s*(?:"|''|inch|inc\b)?/gi, ' ')
          .replace(/\d+\/\d+\s*(?:"|''|inch|inc\b)?/gi, ' ')
          .replace(/\d+(?:[.,]\d+)?\s*(?:"|''|inch\b|inc\b|mm\b)/gi, ' ')
          .replace(/[øØ]\s*\d+/g, ' ')
          .replace(/\s[-·—]\s/g, ' ') // olcu soyulunca sarkan ayrac artigi
          .replace(/\s{2,}/g, ' ').trim()) || name;
        // MANUEL SATIRI KOLONLARA AYRISTIR: yuzey/cins kelimeleri CINS'e,
        // baglanti sifatlari BAGLANTI'ya tasinir. Yoksa "... Siyah Dişli
        // Manşonlu" gibi adlarda sondaki 'manşonlu' sondan-aile-cozumunu
        // fitting'e kaciriyordu (bas isim ortada kaliyor: 'Borusu').
        const CINS_K = new Set(['siyah', 'galvaniz', 'galvanizli', 'kirmizi', 'boyali', 'celik',
          'paslanmaz', 'pirinc', 'dokum', 'bronz', 'bakir', 'ppr', 'pprc', 'pvc', 'pe', 'pex',
          'hdpe', 'polietilen', 'plastik', 'wafer', 'lug']);
        const BAGLANTI_K = new Set(['disli', 'mansonlu', 'kaynakli', 'flansli', 'yivli',
          'vidali', 'gecmeli', 'rakorlu', 'presli', 'sokedli', 'kaplinli', 'duz', 'uclu']);
        // YALNIZ SONDAN ardisik cins/baglanti kelimeleri soyulur — Turkcede
        // bas isim SONDADIR; ortadan kelime cekmek adi bozar ("Su ve Yangın
        // Tesisat Borusu"nun ortasindan 'yangin' cekilemez). Sondaki sifat
        // kuyrugu ("... - Siyah Dişli Manşonlu") ise aile cozumunu kacirtan
        // gercek gurultudur → kolonlarina tasinir. HAM kelime korunur
        // (displayName Turkce karakteriyle cizilir).
        const parcalar = adTemiz.split(/\s+/).filter(Boolean);
        const cinsK: string[] = []; const bagK: string[] = []; const kuyruk: string[] = [];
        while (parcalar.length > 1) {
          const ham = parcalar[parcalar.length - 1];
          const w = tokenize(ham)[0] ?? '';
          if (!w) { kuyruk.unshift(parcalar.pop()!); continue; } // stopword ('Tip') soymayi KESMEZ
          if (CINS_K.has(w)) cinsK.unshift(parcalar.pop()!);
          else if (BAGLANTI_K.has(w)) bagK.unshift(parcalar.pop()!);
          else break;
        }
        // stopword kuyrugu en yakin kovaya iade ("Lug Tip" → cins 'Lug Tip')
        if (kuyruk.length && cinsK.length) cinsK.push(...kuyruk);
        else if (kuyruk.length && bagK.length) bagK.push(...kuyruk);
        else parcalar.push(...kuyruk);
        const adK = parcalar;
        const idx = buildProductIndex({
          kategori: li.kategori ?? null,
          ad: adK.join(' ') || adTemiz,
          cins: li.cins ?? (cinsK.length ? cinsK.join(' ') : null),
          baglanti: bagK.length ? bagK.join(' ') : null,
          cap,
          birim: li.unit ?? null,
          price,
        });
        urun = {
          ...idx,
          ad: name, cins: li.cins ?? null, baglanti: null,
          capRaw: cap, boyMm: null, kategori: li.kategori ?? null,
          urunKodu: null, sheetName: null, price,
        };
      }
      return {
        id: li.id,
        listPrice: li.listPrice ?? urun.price,
        customPrice: li.customPrice ?? null,
        discountRate: li.discountRate ?? 0,
        currency: li.currency ?? 'TRY',
        urun,
      };
    });
    if (bayatSayisi > 0) {
      console.warn(`[Matching] ⚠ BAYAT INDEKS: ${bayatSayisi} satir istek aninda yeniden uretildi (v${INDEX_VERSION}). ` +
        `KALICI COZUM: POST /admin/reindex-products (her istekte yeniden hesap = gereksiz yuk).`);
    }
    if (indekssizSayisi > 0) {
      console.log(`[Matching] ${indekssizSayisi} indekssiz satir istek aninda indekslendi (manuel/legacy)`);
    }
    return pool;
  }

  // ═══════════════════════════════════════════
  // TEK MOTOR: INDEKSLI + AD-KILITLI (v2) — baska motor YOKTUR (Faz 2b)
  // ═══════════════════════════════════════════

  /**
   * Skor YOK, aday URETILMEZ — havuz FILTRELENIR (Ad → Cap → yazili nitelik).
   * Cekirdek saf modullerde (index/*), DB'siz test edilir: test:index (K1-K7).
   * Bu metot yalniz sozluk/hafiza baglar ve M3 alternatiflerini ekler.
   */
  private async matchV2(
    userId: string,
    brandId: string,
    materialNames: string[],
    pool: IndexedRow[],
    toTry: (v: number, cur?: string | null) => number,
    variantTags?: string[],
    units?: Record<string, string>,
  ): Promise<Record<string, MatchResult>> {
    // ── S3: SOZLUK v2'DE DE OKUNUR (Faz 1 denetim bulgusu) ───────────
    // Satir etiketleme (PRD 1.1-B) sozluksuz eksikti: "temiz su→PPR" gibi
    // seed'ler ve S4 kullanici alias'lari YAZILIYOR ama v2 OKUMUYORDU.
    // Istek basina 1 kez yuklenir; hint'ler QueryOpts ile motora gecer.
    const aliases = await this.terminology.loadAliases(userId);

    const out: Record<string, MatchResult> = {};
    for (const name of materialNames) {
      if (!name?.trim()) continue;
      const line = parseLine(name, units?.[name]);

      let hint = this.terminology.resolveAlias(name, aliases);
      // E8: satirin KENDI ailesi cozulduyse sozluk BASKA aile dayatamaz
      // ("DOĞALGAZ VANASI KÜRESEL" — dogalgaz alias'i boru der, satir vana).
      if (hint?.impliedType && line.familySlug && hint.impliedType !== line.familySlug) hint = null;
      // E2: adet birimli satira boru sozlugu dayatilamaz (birim sinyali)
      if (hint?.impliedType === 'boru' && line.unitSignal === 'equipment' && line.familySlug !== 'boru') hint = null;
      // T3/T5: SATIR KAZANIR — satirda ACIK sinif/cins kelimesi yaziliysa
      // sozluk sinif/taban DAYATAMAZ ("TEMİZ SU başlığı altında DN50 GALVANİZ
      // ÇELİK BORU" satiri CELIKTIR; alias plastic filtresi onu ELIYORDU ve
      // PPR yaziliyordu — R4 ihlali). Sozluk yalniz SINIFSIZ satira
      // varsayilan verir; yazili kelime cins filtresi olarak zaten serttir.
      const YAZILI_SINIF = /(^|\s)(celik|paslanmaz|pirinc|dokum|bronz|bakir|galvaniz\w*|siyah|ppr\w*|pex|pvc|hdpe|polietilen|plastik)(\s|$)/;
      const yaziliSinif = YAZILI_SINIF.test(line.tokens.join(' '));

      const opts: QueryOpts = {
        variantTags,
        hintFamily: hint?.impliedType ?? null,
        sizeClassHint: yaziliSinif ? null : hint?.sizeClass ?? null,
        hintClass: !yaziliSinif && (hint?.sizeClass === 'plastic' || hint?.sizeClass === 'steel') ? hint.sizeClass : null,
        hintBases: yaziliSinif ? [] : (hint?.kinds ?? []).filter((k) => k === 'siyah' || k === 'galvaniz'),
        hintLabel: hint ? (hint.kinds.join('/') || hint.canonical) : undefined,
        // Alias'in kendi kelimeleri + stripTags kisit/bilinmeyen sayilmaz
        ignoreTokens: hint ? Array.from(new Set([...tokenize(hint.alias), ...hint.stripTags])) : undefined,
      };
      if (hint) {
        console.log(`[Matching] v2 sozluk: "${name}" → ${hint.alias} (${opts.hintClass ?? '-'}${opts.hintBases?.length ? `, taban=${opts.hintBases.join('/')}` : ''})`);
      }

      const outcome = runQuery(line, pool, opts);
      let r = toMatchResult(outcome, line, toTry);

      // OGRENME HAFIZASI + CINS TERCIHI — v1 ile AYNI kural (on-secili
      // getirir, OTOMATIK DOLDURMAZ). Motor-bagimsiz ortak yol.
      r = await this.hafizaOnSecim(userId, brandId, name, r, aliases);

      // M3: "bu markada yok" cevabi ALTERNATIFSIZ birakilmaz (PRD Bolum 3).
      // Faz 2b genislemesi: satirin yazili kelimesi bu markada DOGRULANAMADIYSA
      // ('PP KÜRESEL' → Cayirova'da kuresel yok) istenen sey baska markada
      // olabilir — multi cevapta da alternatif taranir (R5/R9).
      if (!r.notProduct && (line.familySlug || opts.hintFamily)
          && (r.confidence === 'none' || (r.dogrulanamadi?.length ?? 0) > 0)) {
        const alts = await this.findAlternativesV2(userId, brandId, line, opts);
        if (alts.length > 0) r = { ...r, alternatives: alts };
      }
      out[name] = r;
    }
    console.log(`[Matching] v2 Sonuc: ${Object.values(out).filter((r) => r.netPrice > 0).length}/${Object.keys(out).length} yazildi, ${Object.values(out).filter((r) => r.confidence === 'multi').length} soru`);
    return out;
  }

  /**
   * M3 (v2): satirin ailesi+capi DIGER markalarin indeksli kutuphanesinde var mi?
   * Ayni sert kurallar — yalniz GERCEKTEN o urunu sunan markalar onerilir.
   */
  private async findAlternativesV2(userId: string, brandId: string, line: LineQuery, opts?: QueryOpts): Promise<BrandAlternative[]> {
    const others = await this.prisma.userLibrary.findMany({
      where: { userId, brandId: { not: brandId } },
      include: {
        brand: { select: { id: true, name: true } },
        product: true,
        material: { select: { name: true } },
      } as any,
    });
    // Faz 2b: diger markalarin manuel/bayat satirlari da ayni yoldan gecer
    const pool = this.hazirlaPool(others as any[]);
    if (pool.length === 0) return [];

    const toTry = await this.buildTryConverter(others as { currency?: string | null }[]);
    const byBrand = new Map<string, BrandAlternative>();
    const kesinlik = new Map<string, 'single' | 'ask1'>();
    const markaOf = new Map<string, { id: string; name: string }>(
      (others as any[]).map((r) => [r.id, r.brand]),
    );

    // Marka basina AYRI sorgu: her markanin havuzu kendi icinde degerlendirilir
    // (dagarcik marka+aile kapsaminda uretilir — vocab.ts).
    const markaGruplari = new Map<string, IndexedRow[]>();
    for (const row of pool) {
      const m = markaOf.get(row.id);
      if (!m) continue;
      if (!markaGruplari.has(m.id)) markaGruplari.set(m.id, []);
      markaGruplari.get(m.id)!.push(row);
    }

    // S3: sozluk ipuclari alternatif taramaya da islenir (R3: temiz su icin
    // CELIK marka onerilemez) — yalniz varyant filtresi tasinmaz.
    const altOpts: QueryOpts | undefined = opts ? { ...opts, variantTags: undefined } : undefined;
    for (const [mid, rows] of markaGruplari) {
      const outcome = runQuery(line, rows, altOpts);
      // KESIN sonuc (single) VEYA tek-adayli onay listesi alternatif olur.
      // (Faz 2b: 'PP KÜRESEL' → KALDE'de tek PPR kuresel; 'pp' dogrulanamadi
      // notu tek adayi ask'a dusurur — oneri zaten fiyatli SECENEKTIR,
      // kesinlik iddiasi yok; kullanici marka+fiyati birlikte secer.)
      const tekAday = outcome.kind === 'single' ? outcome.row
        : outcome.kind === 'ask' && outcome.rows.length === 1 ? outcome.rows[0]
        : null;
      if (!tekAday) continue;
      const m = markaOf.get(tekAday.id)!;
      const list = toTry(tekAday.listPrice, tekAday.currency);
      const isk = tekAday.discountRate ?? 0;
      const net = tekAday.customPrice != null && tekAday.customPrice > 0
        ? toTry(tekAday.customPrice, tekAday.currency)
        : hesaplaNetFiyat(list, isk);
      byBrand.set(mid, {
        brandId: m.id, brandName: m.name,
        materialName: tekAday.urun.displayName,
        netPrice: net, listPrice: list, discount: isk,
      });
      kesinlik.set(mid, outcome.kind === 'single' ? 'single' : 'ask1');
    }
    // KESINLIK ONCELIGI: satiri TAM dogrulayan marka (single) varken,
    // "dogrulanamadi" notlu tek-adaylar onerilmez — 'PP KÜRESEL' icin
    // KALDE (PPR) dururken DUYAR (pirinc) listelenmez; gazda ayni (E9 ruhu).
    const singleVar = Array.from(kesinlik.values()).includes('single');
    return Array.from(byBrand.entries())
      .filter(([mid]) => !singleVar || kesinlik.get(mid) === 'single')
      .map(([, v]) => v);
  }

  // ═══════════════════════════════════════════
  // OGRENME HAFIZASI (PRD Adim 8) — imza + kaydet
  // ═══════════════════════════════════════════

  /**
   * OGRENME HAFIZASI + CINS TERCIHI — ON-SECILI getirir, OTOMATIK DOLDURMAZ.
   * (Faz 1 denetim bulgusu S3: matchV2 erken donusu bu bloklari atliyordu —
   * "önceki tercihiniz ✓" ozelligi indeksli markalarda OLUYDU.)
   */
  private async hafizaOnSecim(
    userId: string,
    brandId: string,
    excelName: string,
    result: MatchResult,
    aliases: AliasHint[],
  ): Promise<MatchResult> {
    // ── TAM IMZA (PRD Adim 8): ayni belirsizlik daha once cozulduyse ────
    // DUZELTME (A2/A5): hafiza OTOMATIK DOLDURMAZ — "ilk secim her zaman
    // kullanicinin". Gecmis secim listenin BASINA preferred olarak alinir.
    if (result.confidence === 'multi' && result.candidates?.length) {
      const imza = this.buildImza(excelName, brandId);
      // Savunmaci: tablo/client henuz yoksa (migration oncesi) akisi BOZMA.
      let mem: any = null;
      try {
        mem = await (this.prisma as any).eslesmeHafizasi?.findUnique({
          where: { userId_imza: { userId, imza } },
        });
      } catch { mem = null; }
      if (mem) {
        const idx = result.candidates.findIndex((c) => c.materialName === mem.secilenAd);
        if (idx >= 0) {
          console.log(`[Matching] HAFIZA ON-SECILI: "${excelName}" → "${mem.secilenAd}" (${mem.secimSayisi}×) basa alindi`);
          const cand = { ...result.candidates[idx], preferred: true };
          const rest = result.candidates.filter((_, i) => i !== idx);
          result = {
            ...result,
            candidates: [cand, ...rest],
            reason: `Geçmiş seçiminiz (${mem.secimSayisi}×) önde — onaylayın. ${result.reason ?? ''}`.trim(),
          };
        }
      }
    }

    // ── CINS TERCIHI (V5, PRD v1.3): olcu-bagimsiz cins on-secimi ──────
    if (result.confidence === 'multi' && result.candidates?.length) {
      let kmem: any = null;
      try {
        kmem = await (this.prisma as any).eslesmeHafizasi?.findUnique({
          where: { userId_imza: { userId, imza: this.buildKindImza(excelName, brandId, aliases) } },
        });
      } catch { kmem = null; }
      if (kmem) {
        const preferred = result.candidates.filter((c) => c.tags?.includes(kmem.secilenAd));
        if (preferred.length > 0 && preferred.length < result.candidates.length) {
          const rest = result.candidates.filter((c) => !c.tags?.includes(kmem.secilenAd));
          console.log(`[Matching] CINS TERCIHI ON-SECILI: "${excelName}" → ${kmem.secilenAd} (${preferred.length} aday one alindi)`);
          result = {
            ...result,
            candidates: [...preferred.map((c) => ({ ...c, preferred: true })), ...rest],
            reason: `${result.reason ?? ''} Geçmiş tercihiniz (${kmem.secilenAd}) önde.`.trim(),
          };
        }
      }
    }

    return result;
  }

  /** Belirsizligin parmak izi: marka + kanonik olcu + tip + cins(+ipucu).
   *  Ayni imza = ayni secim sorusu → hafizadan cevaplanabilir. */
  private buildImza(excelName: string, brandId: string): string {
    const tags = generateTags(excelName);
    const olcu = tags.tags.filter((t) => t.startsWith('dn') || t.startsWith('od-')).sort().join(',');
    // Faz 2b: HEADER_HINTS katkisi kalkti — imza yalniz satirin KENDI
    // etiketlerinden uretilir. (Baslik-ipuclu eski imzalar dogal olarak
    // devre disi kalir; secimler yeniden ogrenilir — on-secim kaybi gecici.)
    const kinds = tags.tags.filter((t) => KIND_TAGS.has(t)).sort().join(',');
    return `${brandId}|${olcu}|${tags.materialType}|${kinds}`;
  }

  /** Cins tercihinin imzasi (V5): olcu YOK — marka + malzeme tipi + AILE.
   *  "DN20 vana → pirinc" secimi DN32 vanada da gecerli olsun diye.
   *  N4 (Duzeltme): AILE bileseni eklendi — celik hattaki "galvanizli disli"
   *  tercihi PPR hattinda "onceki tercihiniz" olarak GORUNMEZ. Aile = satir
   *  ham cinsleri, yoksa sozluk cinsleri, yoksa 'genel'. (Eski imza formati
   *  farkli — eski kind-tercihleri dogal olarak devre disi kalir.) */
  private buildKindImza(excelName: string, brandId: string, aliases: AliasHint[]): string {
    const tags = generateTags(excelName);
    const raw = extractMaterialKind(excelName).filter((k) => KIND_TAGS.has(k));
    const hint = this.terminology.resolveAlias(excelName, aliases);
    const fam = raw.length > 0
      ? raw.sort().join(',')
      : ((hint?.kinds ?? []).filter((k) => KIND_TAGS.has(k)).sort().join(',') || 'genel');
    return `kind|${brandId}|${tags.materialType}|${fam}`;
  }

  /** Kullanici secici popup'tan urun secince cagrilir — senkron, secim aninda. */
  async remember(userId: string, brandId: string, materialName: string, secilenAd: string) {
    if (!userId || !brandId || !materialName?.trim() || !secilenAd?.trim()) {
      return { ok: false, reason: 'eksik parametre' };
    }
    const imza = this.buildImza(materialName, brandId);
    await (this.prisma as any).eslesmeHafizasi.upsert({
      where: { userId_imza: { userId, imza } },
      update: { secilenAd, secimSayisi: { increment: 1 } },
      create: { userId, imza, secilenAd },
    });
    console.log(`[Matching] HAFIZA YAZ: user=${userId} imza="${imza}" → "${secilenAd}"`);

    // ── CINS TERCIHI YAZ (V5): secilen urun TEK cins tasiyorsa kaydet ──
    // (orn "Kuresel Vana DN25 Pirinç" → pirinc). Olcu-bagimsiz: sonraki
    // farkli-capli ayni-tip belirsizliklerde bu cins one gecer.
    try {
      const chosenKinds = generateTags(secilenAd).tags.filter((t) => KIND_TAGS.has(t));
      if (chosenKinds.length === 1) {
        const aliases = await this.terminology.loadAliases(userId);
        const kindImza = this.buildKindImza(materialName, brandId, aliases);
        await (this.prisma as any).eslesmeHafizasi.upsert({
          where: { userId_imza: { userId, imza: kindImza } },
          update: { secilenAd: chosenKinds[0], secimSayisi: { increment: 1 } },
          create: { userId, imza: kindImza, secilenAd: chosenKinds[0] },
        });
        console.log(`[Matching] CINS TERCIHI YAZ: imza="${kindImza}" → ${chosenKinds[0]}`);
      }
    } catch { /* cins tercihi opsiyonel — ana hafiza yazildi */ }

    return { ok: true, imza };
  }

  // ═══════════════════════════════════════════
  // BACKFILL — Mevcut malzemelere tag at
  // ═══════════════════════════════════════════

  async backfillTags(): Promise<{ updated: number; total: number }> {
    const materials = await this.prisma.material.findMany();
    let updated = 0;

    for (const mat of materials) {
      const tagged = generateTags(mat.name);
      await this.prisma.material.update({
        where: { id: mat.id },
        data: {
          tags: tagged.tags,
          normalizedName: tagged.normalizedName,
          materialType: tagged.materialType,
        },
      });
      updated++;
    }

    console.log(`[Matching] Backfill tamamlandi: ${updated}/${materials.length} malzeme guncellendi`);
    return { updated, total: materials.length };
  }

  // ═══════════════════════════════════════════
  // TEST — Tek malzeme icin tag gor
  // ═══════════════════════════════════════════

  generateTagsForTest(materialName: string) {
    return generateTags(materialName);
  }
}
