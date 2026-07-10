import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateTags } from './tag-generator';
import { hesaplaNetFiyat } from './pricing';
import type { MatchResult } from './types';
import {
  splitExcelTags,
  scoreCandidates,
  narrowTopCandidates,
  buildCandidateList,
  POPULAR_MATERIALS,
  MATERIAL_SUBTYPE_KEYS,
  KIND_TAGS,
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

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════
  // BULK MATCH — Teklif sirasinda (AI YOK)
  // ═══════════════════════════════════════════

  async bulkMatch(
    userId: string,
    brandId: string,
    materialNames: string[],
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
    const allPrices: MaterialPriceItem[] = libRows.map((li) => {
      const name = li.material?.name ?? li.materialName ?? '';
      const basePrice = li.customPrice ?? li.listPrice ?? 0;
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
      listPrice: li.customPrice ?? li.listPrice,
      discountRate: li.discountRate,
      customPrice: li.customPrice,
    }));

    console.log(`[Matching] KUTUPHANE modu: ${materialNames.length} malzeme, ${libRows.length} kutuphane kaydi (brand=${brandId})`);

    // 3. Her Excel malzemesi icin tag-based eslestirme
    const results: Record<string, MatchResult> = {};
    let matchCount = 0;

    for (const excelName of materialNames) {
      if (!excelName.trim()) continue;
      const result = this.matchSingle(excelName, allPrices, libItems);
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
  ): MatchResult {
    const excelTags = generateTags(excelName);

    if (excelTags.tags.length === 0) {
      return { netPrice: 0, listPrice: 0, discount: 0, confidence: 'none', reason: 'Etiket cikarilmadi' };
    }

    // ── FAZ 1: TEK ZORUNLU KOSUL = CAP ─────────────────────────────
    // Eski kod cap+tip birlikte sarttti → cap-only satirlar ("DN 25")
    // aramaya bile girmeden reddediliyordu. Marka (where brandId) havuzu
    // zaten daralttigi icin cap tek basina guclu bir capa. Tip/cins olmasa
    // bile ARA; sonra aday sayisi + tip belirsizligine gore karar ver.
    const hasDiameter = excelTags.tags.some((t) => t.startsWith('dn') || t.startsWith('od-'));
    if (!hasDiameter) {
      // URUN DEGIL (spec ALTIN KURAL yardimcisi): "FITTINGS ORANI",
      // "MONTAJ ISCILIGI" gibi oran/hizmet satirlari malzeme degildir —
      // fiyat BEKLENMEZ. 'yok'tan ayri isaretlenir ki kullanici bunlari
      // "eksik eslesme" sanmasin. Muhafazakar liste: yalniz net hizmet
      // kelimeleri (boya DEGIL — POLISAN antipas gercek urun olabilir).
      const NOT_PRODUCT_RE = /\borani?\b|\biscilik\b|\bmontaj\b|\bnakliye\b|\bdevreye\s*alma\b|\bgenel\s*gider/;
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

    // ── FAZ 3: Islevsel baslik ipucu (sozlukten) ───────────────────
    const hint = this.deriveHeaderHint(excelName);
    // Islevsel kelimeden uretilen tag'i (orn 'sprink') mustMatch'ten cikar —
    // yoksa kutuphanede o tag'i tasimayan gercek aday elenirdi.
    const effectiveTags = hint
      ? excelTags.tags.filter((t) => !hint.stripTags.includes(t))
      : excelTags.tags;

    // Satirin KENDISI tam tanimli mi? (cap + bilinen tip + cins) → 'high'
    // Yalniz cap veya baslik-ipucu ile bulunmus → 'suggestion' (oneri)
    const excelTypeKnown = excelTags.materialType !== 'diger';
    const excelHasKind = excelTags.tags.some((t) => KIND_TAGS.has(t));
    const fullyQualified = excelTypeKnown && excelHasKind;

    // Shared helper: tag'leri parcala, adaylari skorla
    const split = splitExcelTags(effectiveTags);
    const allCandidates = scoreCandidates(
      allPrices,
      (p) => p.material.tags,
      split,
    );

    if (allCandidates.length === 0) {
      console.log(`[Matching] "${excelName}" → ESLESMEDI. Zorunlu: [${split.mustMatchTags.join(',')}], refine: [${split.refineTags.join(',')}]`);
      return {
        netPrice: 0, listPrice: 0, discount: 0, confidence: 'none',
        reason: `Kutuphanede eslesme yok. Zorunlu: [${split.mustMatchTags.join(', ')}]`,
      };
    }

    // En yuksek skor grubu
    allCandidates.sort((a, b) => b.totalScore - a.totalScore);
    const topScore = allCandidates[0].totalScore;
    let topCandidates = allCandidates.filter((c) => c.totalScore === topScore);
    console.log(`[Matching] "${excelName}" → ${allCandidates.length} aday, topScore=${topScore}, topCount=${topCandidates.length}, hint=${hint ? hint.preferredKinds.join('/') : 'yok'}`);

    // ── FAZ 3: cins ipucu tie-break (SILME DEGIL, one cikarma) ──────
    // Baslik ipucu varsa ve o cinse uyan aday(lar) varsa yalniz onlara in.
    // Uyan yoksa dokunma (yanlis eleme yapma).
    if (hint && hint.preferredKinds.length > 0) {
      const preferred = topCandidates.filter((c) =>
        c.priceItem.material.tags.some((t) => hint.preferredKinds.includes(t)),
      );
      if (preferred.length > 0 && preferred.length < topCandidates.length) {
        console.log(`[Matching]   Baslik ipucu (${hint.preferredKinds.join('/')}) ile ${topCandidates.length} → ${preferred.length}`);
        topCandidates = preferred;
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
      return this.buildMultiResult(topCandidates, libItems, 'Malzeme tipi belirsiz (boru/vana/fitting).');
    }

    // Shared helper: subtype elemesi + otomatik-Disli (ayni tip icinde guvenli)
    const { narrowed, autoPickedDisli } = narrowTopCandidates(
      topCandidates,
      excelTags.tags,
      (p) => p.material.tags,
      MATERIAL_SUBTYPE_KEYS,
    );
    if (narrowed.length < topCandidates.length && autoPickedDisli) {
      console.log(`[Matching]   Otomatik Disli secildi: "${narrowed[0].priceItem.material.name}"`);
    } else if (narrowed.length < topCandidates.length) {
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

    // TEK ADAY — kademe ile eslestir
    if (topCandidates.length === 1) {
      const winner = topCandidates[0];
      const { netPrice, listPrice, discount } = calcPrice(winner.priceItem);
      // 'high' yalniz satir KENDISI tam tanimliysa; cap-only / baslik-ipucu → 'suggestion'
      const confidence: MatchResult['confidence'] = fullyQualified ? 'high' : 'suggestion';
      const via = fullyQualified
        ? `[${split.mustMatchTags.join(', ')}]`
        : hint ? `cap + baslik ipucu (${hint.preferredKinds.join('/')})` : 'yalniz cap';
      console.log(`[Matching] "${excelName}" → ${confidence} → "${winner.priceItem.material.name}" = ${winner.priceItem.price} (net=${netPrice}) via ${via}`);
      return {
        netPrice, listPrice, discount,
        confidence,
        matchedName: winner.priceItem.material.name,
        reason: confidence === 'high'
          ? `Eslesti: ${via}`
          : `Oneri (${via}) — kontrol edin`,
      };
    }

    // BIRDEN FAZLA ADAY — kullaniciya secenekleri sun
    return this.buildMultiResult(topCandidates, libItems, 'Birden fazla aday — malzeme cinsi belirtilmemis.');
  }

  /** ScoredCandidate listesinden 'multi' MatchResult uretir (popup icin). */
  private buildMultiResult(
    topCandidates: ReturnType<typeof scoreCandidates<MaterialPriceItem>>,
    libItems: LibItem[],
    reason: string,
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
    return {
      netPrice: 0, listPrice: 0, discount: 0,
      confidence: 'multi',
      reason: `${candidates.length} aday bulundu. ${reason}`,
      candidates,
    };
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
