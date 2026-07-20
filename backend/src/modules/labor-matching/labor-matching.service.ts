import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { generateTags } from '../matching/tag-generator';
import type { MatchResult } from '../matching/types';

/**
 * PRD Iscilik L9 — TEK MOTOR: v1 skorlayici (shared-tag-matcher zinciri)
 * SILINDI. Bu servis yalniz SAHIPLIK dogrular ve MatchingService'in
 * 'iscilik' katalog yoluna (bulkMatchLabor) DELEGE eder. Eslestirme,
 * sonuclandirma (1/≥2/0), varyant, hafiza ve alternatif mantigi tek koddan
 * calisir — malzeme motoruna gelen her iyilestirme isciligi bedavaya alir.
 */
@Injectable()
export class LaborMatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
  ) {}

  private async assertOwnership(firmaId: string, userId: string) {
    const firma = await this.prisma.laborFirm.findUnique({ where: { id: firmaId } });
    if (!firma) return null;
    if (firma.userId !== userId) {
      throw new ForbiddenException('Bu firmaya erisim yetkiniz yok');
    }
    return firma;
  }

  async bulkMatch(
    userId: string,
    firmaId: string,
    laborNames: string[],
    variantTags?: string[],
    units?: Record<string, string>,
  ): Promise<Record<string, MatchResult>> {
    const firma = await this.assertOwnership(firmaId, userId);
    if (!firma) return {};
    return this.matching.bulkMatchLabor(userId, firmaId, laborNames, variantTags, units);
  }

  /** Secici popup'tan kalem secildi — hafiza `iscilik|<firmaId>` kapsaminda
   *  yazilir (malzeme imzalariyla ASLA cakismaz). */
  async remember(userId: string, firmaId: string, laborName: string, secilenAd: string) {
    const firma = await this.assertOwnership(firmaId, userId);
    if (!firma) return { ok: false, reason: 'firma bulunamadi' };
    return this.matching.remember(userId, `iscilik|${firmaId}`, laborName, secilenAd);
  }

  /** L2 kalicilik: kullanicinin firmalarindaki kalemleri v2 indeksleyiciyle
   *  yeniden indeksler (bayat/legacy kalemler istek aninda da calisir —
   *  bu cagri kalici hale getirir). */
  async reindex(userId: string) {
    return this.matching.reindexLabor(userId);
  }

  // ── LEGACY (v1 doku): eski tags/normalizedName backfill'i — admin araci,
  // v2 gecisinde zararsiz; kaldirilmasi ayri temizlik isi.
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
    console.log(`[LaborMatching] Backfill (legacy v1): ${updated}/${items.length}`);
    return { updated, total: items.length };
  }
}
