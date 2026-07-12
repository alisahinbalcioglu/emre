import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateTags } from './tag-generator';
import { hesaplaNetFiyat } from './pricing';
import { extractMaterialKind, extractMaterialType, extractSurfaces } from './normalizer';
import { extractSizeInfo, sizeEquivalents, isSizeTag } from './conversion';
import type { SizeClass, SizeInfo } from './conversion';
import { TerminologyService } from './terminology.service';
import type { AliasHint, BrandClassHint } from './terminology.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import type { MatchResult, BrandAlternative } from './types';
import {
  splitExcelTags,
  scoreCandidates,
  narrowTopCandidates,
  buildCandidateList,
  POPULAR_MATERIALS,
  MATERIAL_SUBTYPE_KEYS,
  KIND_TAGS,
  SURFACE_TAGS,
} from './shared-tag-matcher';

// ═══════════════════════════════════════════
// FAZ 3 — Islevsel baslik → malzeme cinsi/tipi ipucu sozlugu
// ═══════════════════════════════════════════
// Kesif Excel'lerinde malzeme kimligi cogu zaman SATIR'da degil, ust GRUP
// BASLIGI'nda ve genelde ISLEVSEL ("sprink hat", "pis su") — cins ("celik")
// degil. Bu sozluk baslik anahtar kelimesini cins/tip ipucuna cevirir.
//
// KRITIK: ipucu HARD FILTER DEGIL. `preferredKinds` yalniz esit-skorlu
// adaylar arasinda tie-break (o cinsi one cikar, digerlerini SILME). `impliedType`
// tip belirsizligini cozer. `stripTags` ise generateTags'in bu islevsel
// kelimeden urettigi tag'i (orn 'sprink') mustMatch havuzundan cikarir —
// yoksa kutuphanedeki "Celik Dikisli Boru" adayinda o tag olmadigindan
// eslesme 0'a duser.
interface HeaderHint {
  test: RegExp;
  stripTags: string[];
  preferredKinds: string[];
  impliedType?: string;
}

const HEADER_HINTS: HeaderHint[] = [
  // Yangin/sprinkler hatti → celik boru
  { test: /\bsprink|sprinkler|yangin\s*hat|yangin\s*tesisat/, stripTags: ['sprink'], preferredKinds: ['celik'], impliedType: 'boru' },
  // Pis su / atik su / kanalizasyon → PVC veya HDPE (cift cins → belirsiz kalabilir)
  { test: /\bpis\s*su|pissu|atik\s*su|atiksu|kanalizasyon|kanal\b|drenaj/, stripTags: [], preferredKinds: ['pvc', 'hdpe'], impliedType: 'boru' },
  // Kalorifer / isitma → celik boru
  { test: /kalorifer|isitma\s*hat|radyator\s*hat|petek\s*hat/, stripTags: [], preferredKinds: ['celik'], impliedType: 'boru' },
  // Dogalgaz → celik boru
  { test: /dogalgaz|gaz\s*hat/, stripTags: [], preferredKinds: ['celik'], impliedType: 'boru' },
  // NOT: "temiz su / kullanma suyu" BILEREK YOK — cins belirsiz (ppr/galvaniz/pex),
  // otomatik doldurmak yerine popup'a birakilir.
];

// MaterialPrice + Material tipleri (Prisma'dan ayrisan minimum shape)
type MaterialPriceItem = {
  price: number;
  material: {
    id: string;
    name: string;
    tags: string[];
    normalizedName: string | null;
    materialType: string | null;
  };
};

type LibItem = {
  materialName: string | null;
  listPrice: number | null;
  discountRate: number | null;
  customPrice: number | null;
};

/** matchSingle'a tasinan istek-kapsamli baglam (sozluk + marka sinifi). */
interface MatchContext {
  aliases: AliasHint[];
  brandClass: BrandClassHint | null;
}

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

    // UserLibrary satirlarini matcher'in bekledigi MaterialPriceItem sekline
    // cevir. Havuzdan aktarilanlar Material.tags'ini tasir; kullanicinin
    // MANUEL ekledigi satirlarda (materialId yok) tag'ler anlik uretilir.
    // Z4: dovizli satirlar teklif aninda TRY tabanina cevrilir.
    const toTry = await this.buildTryConverter(libRows as { currency?: string | null }[]);
    const allPrices: MaterialPriceItem[] = libRows.map((li) => {
      const name = li.material?.name ?? li.materialName ?? '';
      const basePrice = toTry(li.customPrice ?? li.listPrice ?? 0, (li as any).currency);
      if (li.material) {
        return { price: basePrice, material: li.material };
      }
      const gen = generateTags(name);
      return {
        price: basePrice,
        material: {
          id: li.id,
          name,
          tags: gen.tags,
          normalizedName: gen.normalizedName,
          materialType: gen.materialType,
        },
      };
    });

    // Iskonto/liste fiyati lookup'i icin ayni satirlar (calcPrice ad ile bulur)
    const libItems: LibItem[] = libRows.map((li) => ({
      materialName: li.material?.name ?? li.materialName,
      listPrice: (li.customPrice ?? li.listPrice) != null
        ? toTry((li.customPrice ?? li.listPrice)!, (li as any).currency)
        : null,
      discountRate: li.discountRate,
      customPrice: li.customPrice != null ? toTry(li.customPrice, (li as any).currency) : null,
    }));

    console.log(`[Matching] KUTUPHANE modu: ${materialNames.length} malzeme, ${libRows.length} kutuphane kaydi (brand=${brandId})`);

    // ── PRD v1.1: sozluk + marka→sinif baglami (istek basina 1 kez) ──
    // Marka adi → celik/PPR sinifi (D2/P1): DN↔inc mi, DN=mm mi buradan belli olur.
    let brandName: string | null = null;
    try {
      const brand = await this.prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } });
      brandName = brand?.name ?? null;
    } catch { brandName = null; }
    const ctx: MatchContext = {
      aliases: await this.terminology.loadAliases(userId),
      brandClass: await this.terminology.resolveBrandClass(brandName, userId),
    };
    if (ctx.brandClass) {
      console.log(`[Matching] Marka sinifi: "${brandName}" → ${ctx.brandClass.sizeClass} (${ctx.brandClass.kinds.join('/')})`);
    }

    // 3. Her Excel malzemesi icin tag-based eslestirme
    const results: Record<string, MatchResult> = {};
    let matchCount = 0;

    for (const excelName of materialNames) {
      if (!excelName.trim()) continue;
      let result = this.matchSingle(excelName, allPrices, libItems, ctx, variantTags);

      // ── OGRENME HAFIZASI (PRD Adim 8) ─────────────────────────────
      // Belirsiz kararindan ONCE oku: ayni imza icin kullanici daha once
      // secim yaptiysa seciciyi atla, o urunle 'suggestion' doldur.
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
          // DUZELTME (A2/A5): hafiza tam-imza artik OTOMATIK DOLDURMAZ —
          // "ilk secim her zaman kullanicinin". Gecmis secim listenin BASINA
          // preferred olarak alinir; kullanici tek tikla onaylar (V5 ile tutarli).
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

      // ── CINS TERCIHI (V5, PRD v1.3): ON-SECILI getir, OTOMATIK DOLDURMA ──
      // "İlk satırdaki seçim yine kullanıcıya aittir; dosyalar arası otomatik
      // atama yapılmaz" — tercih edilen adaylar listenin BASINA alinir ve
      // preferred=true isaretlenir; secim kullanicinin.
      if (result.confidence === 'multi' && result.candidates?.length) {
        let kmem: any = null;
        try {
          kmem = await (this.prisma as any).eslesmeHafizasi?.findUnique({
            where: { userId_imza: { userId, imza: this.buildKindImza(excelName, brandId, ctx.aliases) } },
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

      // ── M3 (Duzeltme: markada olmayan urun): sonuc YOK ve satirin urun
      // ailesi belliyse, kullanicinin kutuphanesindeki DIGER markalarda ara —
      // "Cayirova'da PP kuresel vana yok; su markalarda var" listesi.
      // ASLA otomatik yazilmaz (M1) — kullanici marka+fiyati birlikte secer.
      if (result.confidence === 'none' && !result.notProduct) {
        const alts = await this.findAlternatives(userId, brandId, excelName, ctx);
        if (alts.length > 0) {
          result = {
            ...result,
            alternatives: alts,
            reason: `Bu markada eşleşme yok — ürün şu markalarda var: ${alts.map((a) => a.brandName).join(', ')}`,
          };
        }
      }

      results[excelName] = result;
      if (result.confidence !== 'none') matchCount++;
    }

    console.log(`[Matching] Sonuc: ${matchCount}/${materialNames.length} eslesti`);
    return results;
  }

  // ═══════════════════════════════════════════
  // TEK MALZEME ESLESTIRME
  // 3 ZORUNLU etiket: malzeme tipi + malzeme cinsi + cap
  // 1 bile eksikse → eslestirme YAPMA
  // Birden fazla aday varsa → candidates listesi dondur
  // ═══════════════════════════════════════════

  private matchSingle(
    excelName: string,
    allPrices: MaterialPriceItem[],
    libItems: LibItem[],
    ctx: MatchContext,
    variantTags?: string[],
  ): MatchResult {
    const excelTags = generateTags(excelName);

    if (excelTags.tags.length === 0) {
      return { netPrice: 0, listPrice: 0, discount: 0, confidence: 'none', reason: 'Etiket cikarilmadi' };
    }

    // ── FAZ 1: TEK ZORUNLU KOSUL = CAP ─────────────────────────────
    // Kaynak-farkinda olcu (PRD §6-7): DN mi, inc mi, mm mi yazilmis?
    // Cevrim tablosu secimi buna baglidir (PPR'de DN=mm, celikte DN≠mm).
    let sizeInfo: SizeInfo | null = extractSizeInfo(excelName);
    if (!sizeInfo) {
      // Ciplak PE yolu ("63 PE100 SDR17"): generateTags od-63 uretmis olabilir —
      // conversion parser'i ciplak sayiyi BILEREK yakalamaz (yanlis pozitif).
      const legacy = excelTags.tags.find((t) => isSizeTag(t));
      if (legacy) {
        sizeInfo = legacy.startsWith('od-')
          ? { source: 'mm', value: parseInt(legacy.slice(3), 10), display: legacy }
          : { source: 'dn', value: parseInt(legacy.slice(2), 10), display: legacy.toUpperCase() };
      }
    }
    const hasDiameter = sizeInfo !== null;
    if (!hasDiameter) {
      // URUN DEGIL (spec ALTIN KURAL yardimcisi): "FITTINGS ORANI",
      // "MONTAJ ISCILIGI" gibi oran/hizmet satirlari malzeme degildir —
      // fiyat BEKLENMEZ. 'yok'tan ayri isaretlenir ki kullanici bunlari
      // "eksik eslesme" sanmasin. Muhafazakar liste: yalniz net hizmet
      // kelimeleri (boya DEGIL — POLISAN antipas gercek urun olabilir).
      // PRD Adim 7 genisletmesi: fitting orani/bedeli (TR+EN), paket satirlari
      // (boru+fittings+support+sarf), sarf malzeme. "SET" ve "boya" BILEREK
      // yok: "GAZ ALARM SETI" / POLISAN antipas gercek urun olabilir.
      const NOT_PRODUCT_RE = /\borani?\b|\biscilik\b|\bmontaj\b|\bnakliye\b|\bdevreye\s*alma\b|\bgenel\s*gider|fittings?\s*(orani|bedeli|oran)\b|boru\s*\+\s*fitting|\bsarf\b/;
      const normName = excelName
        .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
        .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c').replace(/[üÜ]/g, 'u')
        .replace(/[öÖ]/g, 'o').replace(/[ğĞ]/g, 'g').toLowerCase();
      if (NOT_PRODUCT_RE.test(normName)) {
        return {
          netPrice: 0, listPrice: 0, discount: 0, confidence: 'none',
          notProduct: true,
          reason: 'Ürün değil (oran/hizmet satırı) — fiyat beklenmiyor',
        };
      }
      return {
        netPrice: 0, listPrice: 0, discount: 0, confidence: 'none',
        reason: `Eksik bilgi: cap yok. Etiketler: [${excelTags.tags.join(', ')}]`,
      };
    }

    // ── FAZ 3 + PRD §5: baslik/terim sozlugu (DB) — kod fallback'li ──
    // DB sozlugu (seed + kullanici alias'lari) once; tablo henuz yoksa
    // koddaki HEADER_HINTS ayni isi gorur.
    const dictHint = this.terminology.resolveAlias(excelName, ctx.aliases);
    const legacyHint = dictHint ? null : this.deriveHeaderHint(excelName);
    const hint: { kinds: string[]; impliedType: string | null; sizeClass: SizeClass | null; stripTags: string[] } | null =
      dictHint
        ? { kinds: dictHint.kinds, impliedType: dictHint.impliedType, sizeClass: dictHint.sizeClass, stripTags: dictHint.stripTags }
        : legacyHint
          ? {
              kinds: legacyHint.preferredKinds,
              impliedType: legacyHint.impliedType ?? null,
              sizeClass: legacyHint.preferredKinds.some((k) => ['ppr', 'pe', 'pvc', 'hdpe'].includes(k)) ? 'plastic' : 'steel',
              stripTags: legacyHint.stripTags,
            }
          : null;

    // ── MALZEME SINIFI COZ (cevrim tablosu secimi) ───────────────────
    // T5 (Duzeltme Talebi): oncelik SATIR ACIK MALZEME > baslik/sozluk > marka.
    // "TEMIZ SU BORULARI" (varsayilan PPR) altindaki "DN50 GALVANIZ CELIK BORU"
    // satiri CELIK cevrimiyle cozulur — satir detayi basligi EZER (T3).
    // NOT: generateTags'in DEFAULT-CELIK'i satir ipucu SAYILMAZ (o bir
    // varsayim) — ham extractMaterialKind/extractSurfaces kullanilir.
    const rawKinds = extractMaterialKind(excelName);
    const rawSurfaces = extractSurfaces(excelName);
    const lineClass: SizeClass | null = rawKinds.some((k) => ['ppr', 'pe', 'pvc', 'hdpe'].includes(k))
      ? 'plastic'
      : rawKinds.some((k) => ['celik', 'paslanmaz', 'pirinc', 'dokum', 'bronz', 'bakir'].includes(k))
        ? 'steel'
        // Yuzey sinyali: galvaniz/siyah kaplama CELIK ailesidir ("DN32 GALVANIZ
        // KAPLAMA" — 'celik' kelimesi gecmese de plastik boru galvanizlenmez)
        : rawSurfaces.includes('galvaniz') || rawSurfaces.includes('siyah')
          ? 'steel'
          : null;
    // Metal tip aileleri (vana/fitting/flans...) DN'i celik anlaminda kullanir
    // — satirda plastik cins yoksa.
    const metalTypeClass: SizeClass | null =
      lineClass === null && ['vana', 'fitting', 'flans', 'pompa', 'radyator', 'kombi', 'kazan'].includes(excelTags.materialType)
        ? 'steel'
        : null;
    const sizeClass: SizeClass = lineClass ?? hint?.sizeClass ?? ctx.brandClass?.sizeClass ?? metalTypeClass ?? 'unknown';
    if (lineClass && hint?.sizeClass && lineClass !== hint.sizeClass) {
      console.log(`[Matching] "${excelName}": satir sinifi (${lineClass}) baslik varsayilanini (${hint.sizeClass}) EZDI (T3/T5)`);
    }

    // ── PRD §6-7: sinifa gore cap esdegerleri ────────────────────────
    const equiv = sizeEquivalents(sizeClass, sizeInfo!);
    // Cevrim hic tag uretemediyse (inc degeri tabloda yok) eski tekil tag'e dus
    const sizeAnyOf = equiv.tags.length > 0
      ? equiv.tags
      : excelTags.tags.filter((t) => isSizeTag(t));
    if (sizeAnyOf.length === 0) {
      return {
        netPrice: 0, listPrice: 0, discount: 0, confidence: 'none',
        reason: `Çevrim tablosunda yok: ${sizeInfo!.display} — kütüphanede elle arayın`,
      };
    }

    // Islevsel kelimeden uretilen tag'i (orn 'sprink') mustMatch'ten cikar —
    // yoksa kutuphanede o tag'i tasimayan gercek aday elenirdi.
    let effectiveTags = (hint
      ? excelTags.tags.filter((t) => !hint.stripTags.includes(t))
      : excelTags.tags
    ).filter((t) => !isSizeTag(t)); // cap artik sizeAnyOf kumesiyle aranir

    // T1/T2 (temiz su) + PIS SU bug'i: sinif PLASTIK cozulduyse ve satir ham
    // metninde 'celik' YOKSA, generateTags'in DEFAULT-CELIK varsayimi sorgudan
    // atilir — yoksa excelKinds=['celik'] cins filtresi PPR/PVC/HDPE adaylarini
    // SESSIZCE eliyordu ("TEMIZ SU BORULARI DN50" hic eslesemezdi).
    if (sizeClass === 'plastic' && !rawKinds.includes('celik')) {
      effectiveTags = effectiveTags.filter((t) => t !== 'celik');
    }

    // Satirin KENDISI tam tanimli mi? (cap + bilinen tip + cins) → 'high'
    // Yalniz cap veya baslik-ipucu ile bulunmus → 'suggestion' (oneri)
    const excelTypeKnown = excelTags.materialType !== 'diger';
    const excelHasKind = excelTags.tags.some((t) => KIND_TAGS.has(t));
    const fullyQualified = excelTypeKnown && excelHasKind;

    // Shared helper: tag'leri parcala, adaylari skorla.
    // 'material' modu (PRD Adim 4): sert filtre = OLCU + TIP; et kalinligi/
    // PN/standart/subtype elemez, bonus verir.
    const split = splitExcelTags(effectiveTags, 'material');
    split.sizeAnyOf = sizeAnyOf;

    // ── N1 AILE KILIDI (Duzeltme: PPR hattina celik aday) ────────────
    // Cozumlenen urun ailesinin cinsleri (oncelik T5: satir > sozluk) aday
    // havuzunu SERT sinirlar — MARKA bu kilidi degistiremez/genisletemez.
    // scoreCandidates'in excelKinds kurali tam istenen semantik: cins tag'i
    // TASIYAN aday uyusmali; cins tag'i olmayan duz-adli kayitlar gecer.
    // (Onceki "yumusak tie-break" yaklasimi deliniyordu: plastik 20mm ile
    // celik DN20 ayni dn20 tag'ini paylasir → Cayirova celik borulari
    // TEMIZ SU (PPR) hattina aday oluyordu.)
    // DIKKAT: once KIND_TAGS filtresi, sonra bosluk kontrolu — rawKinds 'su'
    // gibi cins-olmayan etiketler dondurebilir (temiz SU), hint'e dusus bozulurdu.
    const rawFamily = rawKinds.filter((k) => KIND_TAGS.has(k));
    const familyKinds = rawFamily.length > 0
      ? rawFamily
      : (hint?.kinds ?? []).filter((k) => KIND_TAGS.has(k));
    if (familyKinds.length > 0) {
      split.excelKinds = Array.from(new Set([...split.excelKinds, ...familyKinds]));
    }

    const allCandidates = scoreCandidates(
      allPrices,
      (p) => p.material.tags,
      split,
    );

    if (allCandidates.length === 0) {
      console.log(`[Matching] "${excelName}" → ESLESMEDI. Olcu: [${sizeAnyOf.join(',')}] (${sizeClass}), zorunlu: [${split.mustMatchTags.join(',')}], refine: [${split.refineTags.join(',')}]`);
      return {
        netPrice: 0, listPrice: 0, discount: 0, confidence: 'none',
        reason: `Kutuphanede eslesme yok. Olcu: [${sizeAnyOf.join(', ')}], zorunlu: [${split.mustMatchTags.join(', ')}]`,
        donusum: equiv.rozet ?? undefined,
      };
    }

    // En yuksek skor grubu
    allCandidates.sort((a, b) => b.totalScore - a.totalScore);
    const topScore = allCandidates[0].totalScore;
    let topCandidates = allCandidates.filter((c) => c.totalScore === topScore);
    console.log(`[Matching] "${excelName}" → ${allCandidates.length} aday, topScore=${topScore}, topCount=${topCandidates.length}, sinif=${sizeClass}, hint=${hint ? hint.kinds.join('/') : 'yok'}`);

    // ── FAZ 3 + PRD: cins ipucu tie-break (SILME DEGIL, one cikarma) ──
    // Oncelik: baslik/sozluk cinsi > marka cinsi. Uyan aday yoksa dokunma
    // (yanlis eleme yapma).
    const preferredKinds = hint?.kinds?.length ? hint.kinds : (ctx.brandClass?.kinds ?? []);
    if (preferredKinds.length > 0) {
      const preferred = topCandidates.filter((c) =>
        c.priceItem.material.tags.some((t) => preferredKinds.includes(t)),
      );
      if (preferred.length > 0 && preferred.length < topCandidates.length) {
        console.log(`[Matching]   Cins ipucu (${preferredKinds.join('/')}) ile ${topCandidates.length} → ${preferred.length}`);
        topCandidates = preferred;
      }
      // YUZEY tercihi (sozluk "SIYAH celik boru" der — sprink hatti siyah
      // borudur, galvaniz DEGIL): CAKISAN TABAN yuzeyi tasiyan adaylari ele.
      // Duzeltme Talebi dersi: "siyah'a daralt" yanlisti — Kirmizi Boyali boru
      // (siyah celigin boyalisi) listeden dusuyordu; varyant secenegi olarak
      // KALMALI. Taban yuzeyler (siyah/galvaniz) birbirini dislar; kirmizi/
      // boyali taban degil, kaplama — elenmez.
      const BASE_SURFACES = ['siyah', 'galvaniz'];
      const prefSurfaces = preferredKinds.filter((k) => SURFACE_TAGS.has(k));
      if (prefSurfaces.length > 0 && topCandidates.length > 1) {
        const kept = topCandidates.filter((c) => {
          const bases = c.priceItem.material.tags.filter((t) => BASE_SURFACES.includes(t));
          return bases.length === 0 || bases.some((b) => prefSurfaces.includes(b));
        });
        if (kept.length > 0 && kept.length < topCandidates.length) {
          console.log(`[Matching]   Cakisan taban yuzey elendi (${prefSurfaces.join('/')} tercih) ${topCandidates.length} → ${kept.length}`);
          topCandidates = kept;
        }
      }
    }

    // ── TIP BELIRSIZLIGI KORUMASI ───────────────────────────────────
    // Cap-only satirda adaylar birden cok MALZEME TIPINE (boru/vana/fitting)
    // yayiliyorsa ASLA otomatik secme — narrowTopCandidates cinsi ayni
    // sanip yanlis tek adaya cokertebilir. impliedType varsa once ona indir.
    const typeOf = (c: typeof topCandidates[number]) =>
      c.priceItem.material.materialType ?? 'diger';
    if (hint?.impliedType) {
      const typed = topCandidates.filter((c) => typeOf(c) === hint.impliedType);
      if (typed.length > 0 && typed.length < topCandidates.length) {
        topCandidates = typed;
      }
    }
    const distinctTypes = new Set(topCandidates.map(typeOf));
    if (distinctTypes.size > 1) {
      console.log(`[Matching]   Tip belirsiz (${Array.from(distinctTypes).join(',')}) → popup`);
      return this.buildMultiResult(topCandidates, libItems, 'Malzeme tipi belirsiz (boru/vana/fitting).', equiv.rozet);
    }

    // ── P4: SINIF BELIRSIZLIGI KORUMASI ─────────────────────────────
    // Sinif cozulemedi (celik mi PPR mi?) ve adaylar iki yorumun kesisiminde:
    // adaylar farkli CINS'lere yayiliyorsa asla otomatik secme — popup.
    // (Ayni DN 32: celik 1 1/4" / PPR 32mm — sessiz karar YASAK.)
    if (equiv.ambiguous) {
      const kindOf = (c: typeof topCandidates[number]) => {
        const plastic = c.priceItem.material.tags.some((t) => ['ppr', 'pe', 'pvc', 'hdpe'].includes(t));
        return plastic ? 'plastic' : 'steel';
      };
      const classes = new Set(topCandidates.map(kindOf));
      if (classes.size > 1) {
        console.log(`[Matching]   Sinif belirsiz (celik/PPR yorumlari) → popup`);
        return this.buildMultiResult(topCandidates, libItems, 'Malzeme sınıfı belirsiz: çelik (DN↔inç) ve PPR (DN=mm) yorumları farklı ürünlere gidiyor.', null);
      }
    }

    // ── V4 (PRD v1.3): GRUP VARYANT FILTRESI ────────────────────────
    // Grupta ilk secim yapildi, ayni varyant bu satirin capinda araniyor.
    // Tag'lerin TAMAMI eslesmeli (kutuphaneden dinamik turetilmis kimlik).
    if (variantTags && variantTags.length > 0) {
      const matching = topCandidates.filter((c) =>
        variantTags.every((t) => c.priceItem.material.tags.includes(t)),
      );
      if (matching.length === 1) {
        const winner = matching[0];
        const libItem = libItems.find(
          (l) => (l.materialName ?? '').toLowerCase().trim() === winner.priceItem.material.name.toLowerCase().trim(),
        );
        const discount = libItem?.discountRate ?? 0;
        const listPrice = libItem?.listPrice ?? winner.priceItem.price;
        const netPrice = hesaplaNetFiyat(listPrice, discount);
        console.log(`[Matching] "${excelName}" → V4 OTOMATIK VARYANT (${variantTags.join(',')}) → "${winner.priceItem.material.name}"`);
        return {
          netPrice, listPrice, discount,
          confidence: 'suggestion',
          autoVariant: true,
          matchedName: winner.priceItem.material.name,
          donusum: equiv.rozet ?? undefined,
          reason: `Grup varyantı uygulandı (${variantTags.join(', ')})`,
        };
      }
      if (matching.length === 0) {
        // V4.5: varyant bu capta yok — otomatik atama YAPMA, fiyatli listeyle
        // "secim bekliyor" birak, nedeni soyle.
        console.log(`[Matching] "${excelName}" → V4.5 varyant yok (${variantTags.join(',')}) → secim bekliyor`);
        const r = this.buildMultiResult(topCandidates, libItems, `Seçilen varyant (${variantTags.join(', ')}) bu çapta kütüphanede yok — elle seçin.`, equiv.rozet);
        return { ...r, variantMissing: true };
      }
      // >1: varyant tag'leri bu capta birden fazla urunu tutuyor — daraltilmis popup
      topCandidates = matching;
    }

    // Shared helper: subtype elemesi. autoPick=false (Duzeltme Talebi K1/K2):
    // varyant belirsizse — baglanti farki dahil — OTOMATIK SECIM YASAK,
    // coklu aday fiyatli popup'a gider. "Tahmini eslesme" kalibi bu yoldan
    // kalkti; excel metni varyanti soylediyse (disli vb.) refine skoru zaten
    // tek adaya indirir (A5), popup acilmaz.
    // HATA RAPORU F2: effectiveTags GECILIR (excelTags.tags DEGIL) — baslik
    // sozlugunun strip ettigi 'sprink' tag'i excelHasSubtype'i true yapip
    // subtype elemesini KAPATIYORDU → EN-standart/alt-tipli tum varyantlar
    // listede kaliyordu (20 aday). Strip sonrasi gercek subtype yoksa eleme
    // calisir, aday sayisi varyant sayisina iner.
    const { narrowed, autoPickedDisli } = narrowTopCandidates(
      topCandidates,
      effectiveTags,
      (p) => p.material.tags,
      MATERIAL_SUBTYPE_KEYS,
      false, // autoPick KAPALI — material tarafinda otomatik-Disli yok
    );
    if (narrowed.length < topCandidates.length) {
      console.log(`[Matching]   Subtype elendi: ${topCandidates.length} → ${narrowed.length}`);
    }
    topCandidates = narrowed;

    // Fiyat hesaplama helper (library discount dahil)
    const calcPrice = (priceItem: MaterialPriceItem) => {
      const libItem = libItems.find(
        (l) => (l.materialName ?? '').toLowerCase().trim() === priceItem.material.name.toLowerCase().trim(),
      );
      const discount = libItem?.discountRate ?? 0;
      const listPrice = libItem?.listPrice ?? priceItem.price;
      const netPrice = hesaplaNetFiyat(listPrice, discount); // spec: yukari yuvarla, 1 hane
      return { netPrice, listPrice, discount };
    };

    // TEK ADAY — DUZELTME: "ONERI" (sari auto-write) KADEMESI KALDIRILDI.
    // Sistem tek adayda bile yalniz CELISKISIZSE yazar (yesil/high).
    // Celiski = adayin TABAN yuzeyi (siyah|galvaniz) satir+sozluk beklentisinin
    // TERSI — orn sprink hatti (siyah beklenir) icin tek aday GALVANIZLI ise
    // fiyat YAZILMAZ, 1 secenekli fiyatli liste sunulur (kullanici onaylar).
    // Sinif-belirsiz (P4) ve cevrim-tablosunda-yok (D5) tek adaylar da ayni:
    // otomatik yazma yok, onayli liste. ("Tahmini eslesme — kontrol edin"
    // pasif balonu tum akislardan kalkti — A5/B3.)
    if (topCandidates.length === 1) {
      const winner = topCandidates[0];
      const winnerTags = winner.priceItem.material.tags;
      const expectedBases = new Set<string>(
        [...rawSurfaces, ...(hint?.kinds ?? [])].filter((s) => s === 'siyah' || s === 'galvaniz'),
      );
      const winnerBases = winnerTags.filter((t) => t === 'siyah' || t === 'galvaniz');
      const surfaceConflict =
        expectedBases.size > 0 && winnerBases.length > 0 && !winnerBases.some((b) => expectedBases.has(b));
      const capped = equiv.ambiguous || equiv.noConversion;

      if (surfaceConflict || capped) {
        const why = surfaceConflict
          ? `Tek aday (${winnerBases.join('/')}) başlık/satır beklentisiyle (${Array.from(expectedBases).join('/')}) çelişiyor — onaylayın.`
          : equiv.ambiguous
            ? 'Malzeme sınıfı (çelik/PPR) belirsiz — onaylayın.'
            : `Çevrim tablosunda yok (${sizeInfo!.display}) — onaylayın.`;
        console.log(`[Matching] "${excelName}" → tek aday ama ONAY GEREKLI (${surfaceConflict ? 'yuzey celiskisi' : 'kademe kapagi'}) → popup(1)`);
        return this.buildMultiResult(topCandidates, libItems, why, equiv.rozet);
      }

      const { netPrice, listPrice, discount } = calcPrice(winner.priceItem);
      console.log(`[Matching] "${excelName}" → high → "${winner.priceItem.material.name}" = ${winner.priceItem.price} (net=${netPrice})${equiv.rozet ? ` | ${equiv.rozet}` : ''}`);
      return {
        netPrice, listPrice, discount,
        confidence: 'high',
        matchedName: winner.priceItem.material.name,
        donusum: equiv.rozet ?? undefined,
        reason: `Eslesti (aile+boyut+sınıf doğrulandı)${equiv.rozet ? ` · ${equiv.rozet}` : ''}`,
      };
    }

    // BIRDEN FAZLA ADAY — kullaniciya secenekleri sun
    return this.buildMultiResult(topCandidates, libItems, 'Birden fazla aday — malzeme cinsi belirtilmemis.', equiv.rozet);
  }

  /** ScoredCandidate listesinden 'multi' MatchResult uretir (popup icin). */
  private buildMultiResult(
    topCandidates: ReturnType<typeof scoreCandidates<MaterialPriceItem>>,
    libItems: LibItem[],
    reason: string,
    rozet: string | null = null,
  ): MatchResult {
    const calcPrice = (priceItem: MaterialPriceItem) => {
      const libItem = libItems.find(
        (l) => (l.materialName ?? '').toLowerCase().trim() === priceItem.material.name.toLowerCase().trim(),
      );
      const discount = libItem?.discountRate ?? 0;
      const listPrice = libItem?.listPrice ?? priceItem.price;
      const netPrice = hesaplaNetFiyat(listPrice, discount); // spec: yukari yuvarla, 1 hane
      return { netPrice, listPrice, discount };
    };
    const candidates = buildCandidateList(topCandidates, {
      calcPrice,
      getName: (p) => p.material.name,
      getTags: (p) => p.material.tags,
      useSurfaceLevelLabels: true,
    });
    // V7: en fazla 8 aday goster — fazlasi sorgunun daralmadigina isaret (log)
    if (candidates.length > 8) {
      console.warn(`[Matching] V7: ${candidates.length} aday > 8 — sorgu yeterince daralmiyor`);
    }
    return {
      netPrice: 0, listPrice: 0, discount: 0,
      confidence: 'multi',
      reason: `${candidates.length} aday bulundu. ${reason}`,
      candidates,
      donusum: rozet ?? undefined,
    };
  }

  // ═══════════════════════════════════════════
  // M3 — ALTERNATIF MARKA ARAMASI
  // Secilen markada urun ailesi+boyut yoksa, kullanicinin kutuphanesindeki
  // DIGER markalarda ayni aile+boyutu ara. Marka basina en iyi 1 urun, en
  // fazla 6 marka. Yalniz urun ailesi BELLI satirlar icin (yalın "DN 20"
  // gibi tipsiz satirlarda gurultu uretmez).
  // ═══════════════════════════════════════════

  private async findAlternatives(
    userId: string,
    excludeBrandId: string,
    excelName: string,
    ctx: MatchContext,
  ): Promise<BrandAlternative[]> {
    try {
      const excelTags = generateTags(excelName);
      if (excelTags.materialType === 'diger') return []; // aile belirsiz — onerme
      // N1/N2: alternatif taramasi da AILE KILITLIDIR — sozluk/satir cinsleri
      // uygulanir (temiz su → yalniz PPR markalari onerilir, celik ASLA).
      const altHint = this.terminology.resolveAlias(excelName, ctx.aliases);
      const altRawKinds = extractMaterialKind(excelName);
      const altRawFamily = altRawKinds.filter((k) => KIND_TAGS.has(k));
      const altFamilyKinds = altRawFamily.length > 0
        ? altRawFamily
        : (altHint?.kinds ?? []).filter((k) => KIND_TAGS.has(k));

      let sizeInfo = extractSizeInfo(excelName);
      if (!sizeInfo) {
        const legacy = excelTags.tags.find((t) => isSizeTag(t));
        if (legacy) {
          sizeInfo = legacy.startsWith('od-')
            ? { source: 'mm', value: parseInt(legacy.slice(3), 10), display: legacy }
            : { source: 'dn', value: parseInt(legacy.slice(2), 10), display: legacy.toUpperCase() };
        }
      }
      if (!sizeInfo) return [];

      const rows = await this.prisma.userLibrary.findMany({
        where: { userId, brandId: { not: excludeBrandId } },
        include: {
          material: { select: { id: true, name: true, tags: true, normalizedName: true, materialType: true } },
          brand: { select: { id: true, name: true } },
        },
      });
      if (rows.length === 0) return [];

      // Sinif markaya gore degisir (Cayirova DN≠mm, Kalde DN=mm) — alternatif
      // taramasi 'unknown' union ile yapilir; her aday GERCEK kutuphane kaydi
      // oldugundan yanlis-fiyat riski yok, yalnizca oneri genisler.
      const equiv = sizeEquivalents('unknown', sizeInfo);
      // Plastik ailede DEFAULT-CELIK varsayimi sorguyu bozmasin (matchSingle
      // ile ayni kural) — yoksa PPR alternatifleri cins filtresinde elenirdi.
      let altTags = excelTags.tags.filter((t) => !isSizeTag(t));
      if (altHint?.sizeClass === 'plastic' && !altRawKinds.includes('celik')) {
        altTags = altTags.filter((t) => t !== 'celik');
      }
      const split = splitExcelTags(altTags, 'material');
      split.sizeAnyOf = equiv.tags;
      if (altFamilyKinds.length > 0) {
        split.excelKinds = Array.from(new Set([...split.excelKinds, ...altFamilyKinds]));
      }

      type AltItem = {
        brand: { id: string; name: string };
        name: string;
        tags: string[];
        listPrice: number;
        discount: number;
      };
      // Z4: alternatif fiyatlar da teklif aninda TRY tabanina cevrilir
      const altToTry = await this.buildTryConverter(rows as { currency?: string | null }[]);
      const items: AltItem[] = rows.map((li: any) => {
        const name = li.material?.name ?? li.materialName ?? '';
        const tags = li.material?.tags?.length ? li.material.tags : generateTags(name).tags;
        return {
          brand: li.brand,
          name,
          tags,
          listPrice: altToTry(li.customPrice ?? li.listPrice ?? 0, li.currency),
          discount: li.discountRate ?? 0,
        };
      }).filter((x: AltItem) => x.name && x.listPrice > 0);

      const scored = scoreCandidates(items, (x) => x.tags, split);
      scored.sort((a, b) => b.totalScore - a.totalScore);

      const out: BrandAlternative[] = [];
      const seenBrands = new Set<string>();
      for (const c of scored) {
        const it = c.priceItem as AltItem;
        if (seenBrands.has(it.brand.id)) continue; // marka basina en iyi 1
        seenBrands.add(it.brand.id);
        out.push({
          brandId: it.brand.id,
          brandName: it.brand.name,
          materialName: it.name,
          netPrice: hesaplaNetFiyat(it.listPrice, it.discount),
          listPrice: it.listPrice,
          discount: it.discount,
        });
        if (out.length >= 6) break;
      }
      if (out.length > 0) {
        console.log(`[Matching] M3 ALTERNATIF: "${excelName}" → ${out.map((a) => a.brandName).join(', ')}`);
      }
      return out;
    } catch {
      return []; // alternatif arama opsiyonel — ana akisi bozmaz
    }
  }

  // ═══════════════════════════════════════════
  // OGRENME HAFIZASI (PRD Adim 8) — imza + kaydet
  // ═══════════════════════════════════════════

  /** Belirsizligin parmak izi: marka + kanonik olcu + tip + cins(+ipucu).
   *  Ayni imza = ayni secim sorusu → hafizadan cevaplanabilir. */
  private buildImza(excelName: string, brandId: string): string {
    const tags = generateTags(excelName);
    const hint = this.deriveHeaderHint(excelName);
    const olcu = tags.tags.filter((t) => t.startsWith('dn') || t.startsWith('od-')).sort().join(',');
    const kinds = Array.from(new Set([
      ...tags.tags.filter((t) => KIND_TAGS.has(t)),
      ...(hint?.preferredKinds ?? []),
    ])).sort().join(',');
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

  /** Islevsel grup basligini (sprink/pis su...) cins+tip ipucuna cevirir. */
  private deriveHeaderHint(excelName: string): HeaderHint | null {
    const norm = excelName
      .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
      .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c')
      .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ğĞ]/g, 'g')
      .toLowerCase();
    return HEADER_HINTS.find((h) => h.test.test(norm)) ?? null;
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
