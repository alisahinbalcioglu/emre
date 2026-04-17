import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateTags } from './tag-generator';
import type { MatchResult } from './types';
import {
  splitExcelTags,
  scoreCandidates,
  narrowTopCandidates,
  buildCandidateList,
  POPULAR_MATERIALS,
  MATERIAL_SUBTYPE_KEYS,
} from './shared-tag-matcher';

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
    // 1. Markanin TUM malzemelerini + taglarini tek sorguda cek
    const allPrices = await this.prisma.materialPrice.findMany({
      where: { brandId },
      include: {
        material: {
          select: { id: true, name: true, tags: true, normalizedName: true, materialType: true },
        },
      },
    });

    if (allPrices.length === 0) {
      console.log(`[Matching] Brand ${brandId} icin fiyat listesi bos.`);
      return {};
    }

    // 2. Kullanici kutuphanesini cek (iskonto icin)
    const libItems = await this.prisma.userLibrary.findMany({
      where: { userId, brandId },
    });

    console.log(`[Matching] ${materialNames.length} malzeme, ${allPrices.length} fiyat listesi, ${libItems.length} kutuphane`);

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

    // 3 ZORUNLU etiket kontrolu (material-only: cap + materialType)
    const hasDiameter = excelTags.tags.some((t) => t.startsWith('dn') || t.startsWith('od-'));
    const hasType = excelTags.materialType !== 'diger';
    const hasMaterialKind = excelTags.tags.some((t) =>
      ['celik', 'ppr', 'pvc', 'pe', 'hdpe', 'bakir', 'aluminyum', 'pirinc', 'dokum', 'paslanmaz', 'bronz'].includes(t),
    );

    if (!hasDiameter || !hasType) {
      const missing: string[] = [];
      if (!hasDiameter) missing.push('cap');
      if (!hasType) missing.push('malzeme tipi');
      if (!hasMaterialKind) missing.push('malzeme cinsi');
      return {
        netPrice: 0, listPrice: 0, discount: 0, confidence: 'none',
        reason: `Eksik bilgi: [${missing.join(', ')}]. Etiketler: [${excelTags.tags.join(', ')}]`,
      };
    }

    // Shared helper: tag'leri parcala, adaylari skorla
    const split = splitExcelTags(excelTags.tags);
    const allCandidates = scoreCandidates(
      allPrices,
      (p) => p.material.tags,
      split,
    );

    if (allCandidates.length === 0) {
      console.log(`[Matching] "${excelName}" → ESLESMEDI. Zorunlu: [${split.mustMatchTags.join(',')}], refine: [${split.refineTags.join(',')}]`);
      return {
        netPrice: 0, listPrice: 0, discount: 0, confidence: 'none',
        reason: `Eslesmedi. Zorunlu: [${split.mustMatchTags.join(', ')}], iyilestirme: [${split.refineTags.join(', ')}]`,
      };
    }

    // En yuksek skor
    allCandidates.sort((a, b) => b.totalScore - a.totalScore);
    const topScore = allCandidates[0].totalScore;
    let topCandidates = allCandidates.filter((c) => c.totalScore === topScore);
    console.log(`[Matching] "${excelName}" → ${allCandidates.length} aday, topScore=${topScore}, topCount=${topCandidates.length}`);

    // Shared helper: subtype elemesi + otomatik-Disli
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

    if (topCandidates.length > 1) {
      console.log(`[Matching]   Top adaylar (popup gerekli):`);
      topCandidates.slice(0, 5).forEach((c) => {
        console.log(`     - "${c.priceItem.material.name}" = ${c.priceItem.price}`);
      });
    }

    // Fiyat hesaplama helper (library discount dahil)
    const calcPrice = (priceItem: MaterialPriceItem) => {
      const libItem = libItems.find(
        (l) => (l.materialName ?? '').toLowerCase().trim() === priceItem.material.name.toLowerCase().trim(),
      );
      const discount = libItem?.discountRate ?? 0;
      const listPrice = libItem?.listPrice ?? priceItem.price;
      const netPrice = listPrice * (1 - discount / 100);
      return { netPrice, listPrice, discount };
    };

    // TEK ADAY — direkt eslestir
    if (topCandidates.length === 1) {
      const winner = topCandidates[0];
      const { netPrice, listPrice, discount } = calcPrice(winner.priceItem);
      console.log(`[Matching] "${excelName}" → [${split.mustMatchTags.join(',')}] + [${split.refineTags.join(',')}]`);
      console.log(`[Matching]   → "${winner.priceItem.material.name}" = ${winner.priceItem.price} (net=${netPrice})`);
      console.log(`[Matching]   → dbTags=[${winner.priceItem.material.tags.join(',')}], mustScore=${winner.mustScore}, refineScore=${winner.refineScore}`);
      return {
        netPrice, listPrice, discount,
        confidence: 'high',
        matchedName: winner.priceItem.material.name,
        reason: `Eslesti: [${split.mustMatchTags.join(', ')}${split.refineTags.length > 0 ? ', ' + split.refineTags.join(', ') : ''}]`,
      };
    }

    // BIRDEN FAZLA ADAY — kullaniciya secenekleri sun
    const candidates = buildCandidateList(topCandidates, {
      calcPrice,
      getName: (p) => p.material.name,
      getTags: (p) => p.material.tags,
      useSurfaceLevelLabels: true,
    });

    return {
      netPrice: 0, listPrice: 0, discount: 0,
      confidence: 'multi',
      reason: `${candidates.length} aday bulundu. Malzeme cinsi belirtilmemis.`,
      candidates,
    };
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
