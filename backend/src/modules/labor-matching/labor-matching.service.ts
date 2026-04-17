import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateTags } from '../matching/tag-generator';
import type { MatchResult } from '../matching/types';
import {
  splitExcelTags,
  scoreCandidates,
  narrowTopCandidates,
  buildCandidateList,
  BASE_SUBTYPE_KEYS,
} from '../matching/shared-tag-matcher';

/**
 * Labor matching — marka tarafindaki MatchingService ile shared-tag-matcher uzerinden ortak.
 * Farklar:
 * - LaborPrice -> LaborItem (ayri prisma model)
 * - UserLibrary yok (LaborFirm user-owned, unitPrice + discountRate dogrudan LaborPrice'da)
 * - Firma filter (kullanici sahipligi assertion'i ile)
 */
type LaborPriceItem = {
  unitPrice: number;
  discountRate: number;
  unit: string;
  laborItem: {
    id: string;
    name: string;
    tags: string[];
    normalizedName: string | null;
    discipline: string;
    category: string | null;
  };
};

@Injectable()
export class LaborMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async bulkMatch(
    userId: string,
    firmaId: string,
    laborNames: string[],
  ): Promise<Record<string, MatchResult>> {
    // Sahiplik kontrolu — bu firma kullanicinin mi?
    const firma = await this.prisma.laborFirm.findUnique({ where: { id: firmaId } });
    if (!firma) return {};
    if (firma.userId !== userId) {
      throw new ForbiddenException('Bu firmaya erisim yetkiniz yok');
    }

    // 1. Firmanin tum fiyatlarini cek (iskonto dahil)
    const allPrices = await this.prisma.laborPrice.findMany({
      where: { firmaId },
      include: {
        laborItem: {
          select: { id: true, name: true, tags: true, normalizedName: true, discipline: true, category: true },
        },
      },
    });

    if (allPrices.length === 0) {
      console.log(`[LaborMatching] Firma ${firmaId} icin fiyat listesi bos.`);
      return {};
    }

    console.log(`[LaborMatching] ${laborNames.length} kalem, ${allPrices.length} fiyat`);

    const results: Record<string, MatchResult> = {};
    let matchCount = 0;

    for (const excelName of laborNames) {
      if (!excelName.trim()) continue;
      const result = this.matchSingle(excelName, allPrices);
      results[excelName] = result;
      if (result.confidence !== 'none') matchCount++;
    }

    console.log(`[LaborMatching] Sonuc: ${matchCount}/${laborNames.length} eslesti`);
    return results;
  }

  private matchSingle(
    excelName: string,
    allPrices: LaborPriceItem[],
  ): MatchResult {
    const excelTags = generateTags(excelName);

    if (excelTags.tags.length === 0) {
      return { netPrice: 0, listPrice: 0, discount: 0, confidence: 'none', reason: 'Etiket cikarilmadi' };
    }

    // Iscilik icin materialType/cap zorunlu DEGIL — "kazan kurulumu" gibi isler cap'siz olabilir.
    // Shared helper: tag'leri parcala, adaylari skorla
    const split = splitExcelTags(excelTags.tags);
    const allCandidates = scoreCandidates(
      allPrices,
      (p) => p.laborItem.tags,
      split,
    );

    if (allCandidates.length === 0) {
      console.log(`[LaborMatching] "${excelName}" → ESLESMEDI. mustTags=[${split.mustMatchTags.join(',')}]`);
      return {
        netPrice: 0, listPrice: 0, discount: 0, confidence: 'none',
        reason: `Iscilik eslesmedi. Etiketler: [${excelTags.tags.join(', ')}]`,
      };
    }

    allCandidates.sort((a, b) => b.totalScore - a.totalScore);
    const topScore = allCandidates[0].totalScore;
    let topCandidates = allCandidates.filter((c) => c.totalScore === topScore);

    // Shared helper: subtype elemesi + otomatik-Disli
    const { narrowed } = narrowTopCandidates(
      topCandidates,
      excelTags.tags,
      (p) => p.laborItem.tags,
      BASE_SUBTYPE_KEYS,
    );
    topCandidates = narrowed;

    // Fiyat hesaplama: LaborPrice'daki iskonto dogrudan kullanilir
    const calcPrice = (priceItem: LaborPriceItem) => {
      const listPrice = priceItem.unitPrice;
      const discount = priceItem.discountRate || 0;
      const netPrice = listPrice * (1 - discount / 100);
      return { netPrice, listPrice, discount };
    };

    if (topCandidates.length === 1) {
      const winner = topCandidates[0];
      const { netPrice, listPrice, discount } = calcPrice(winner.priceItem);
      console.log(`[LaborMatching] "${excelName}" → "${winner.priceItem.laborItem.name}" list=${listPrice} disc=${discount}% net=${netPrice.toFixed(2)}`);
      return {
        netPrice, listPrice, discount,
        confidence: 'high',
        matchedName: winner.priceItem.laborItem.name,
        reason: `Eslesti: [${split.mustMatchTags.join(', ')}${split.refineTags.length > 0 ? ', ' + split.refineTags.join(', ') : ''}]`,
      };
    }

    // Birden fazla aday — multi-candidate
    const candidates = buildCandidateList(topCandidates, {
      calcPrice,
      getName: (p) => p.laborItem.name,
      getTags: (p) => p.laborItem.tags,
      useSurfaceLevelLabels: false,
    });

    return {
      netPrice: 0, listPrice: 0, discount: 0,
      confidence: 'multi',
      reason: `${candidates.length} aday bulundu`,
      candidates,
    };
  }

  // Backfill — kullanicinin firmalarindaki LaborItem'lara tag at
  async backfillTags(): Promise<{ updated: number; total: number }> {
    const items = await this.prisma.laborItem.findMany();
    let updated = 0;
    for (const it of items) {
      const tagged = generateTags(it.name);
      await this.prisma.laborItem.update({
        where: { id: it.id },
        data: { tags: tagged.tags, normalizedName: tagged.normalizedName },
      });
      updated++;
    }
    console.log(`[LaborMatching] Backfill: ${updated}/${items.length}`);
    return { updated, total: items.length };
  }
}
