import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { generateTags } from '../matching/tag-generator';
import type { MatchResult } from '../matching/types';
import { Kimlik } from '../../../altyapi/auth/kimlik';

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

  /**
   * ⚠ ISIM CAKISMASI — DIKKAT: `iscilikFirmaId` ISCILIK FIRMASININ
   * (`LaborFirm`) id'sidir; KIRACI firma daima `k.firmaId`dir.
   *
   * ⚠ SAHIPLIK KISIDEN FIRMAYA GECTI (K1, 17.09.2026). Onceden
   * `firma.userId !== userId` karsilastiriliyordu: kutuphane 28.08'de firmaya
   * gectigi halde (`labor-firms.service.ts:38-42` ikizi coktan `firmaId`
   * bakiyordu) eslestirme yolu KISIYE bakmaya devam ediyordu. Sonuc: AYNI
   * firmanin ikinci uyesi, firmasinin isciik firmasinda eslestirme
   * yapamiyordu (403). Bu yuzden F1b (davet) F1a'dan once canliya cikarsa
   * ilk davet edilen uye burada duvara toslar.
   *
   * `null` donusu KORUNUR (mevcut sozlesme): firma bulunamazsa `bulkMatch`
   * bos nesne, `remember` `{ ok: false }` doner — 404 degil.
   */
  private async assertOwnership(iscilikFirmaId: string, k: Kimlik) {
    const firma = await this.prisma.laborFirm.findUnique({ where: { id: iscilikFirmaId } });
    if (!firma) return null;
    if (firma.firmaId !== k.firmaId) {
      throw new ForbiddenException('Bu firmaya erisim yetkiniz yok');
    }
    return firma;
  }

  async bulkMatch(
    // ⚠ `k.firmaId` KIRACI firma · `iscilikFirmaId` ISCILIK firmasi.
    k: Kimlik,
    iscilikFirmaId: string,
    laborNames: string[],
    variantTags?: string[],
    units?: Record<string, string>,
  ): Promise<Record<string, MatchResult>> {
    const firma = await this.assertOwnership(iscilikFirmaId, k);
    if (!firma) return {};
    return this.matching.bulkMatchLabor(k, iscilikFirmaId, laborNames, variantTags, units);
  }

  /** Secici popup'tan kalem secildi — hafiza `iscilik|<iscilikFirmaId>`
   *  kapsaminda yazilir (malzeme imzalariyla ASLA cakismaz).
   *
   *  ⚠ Hafiza KISIYE yazilmaya devam eder (`k.userId`): ogrenme kisiseldir,
   *  firmaya tasinmasi ayri bir istir (V2). Degisen yalniz SAHIPLIK kapisi. */
  async remember(k: Kimlik, iscilikFirmaId: string, laborName: string, secilenAd: string) {
    const firma = await this.assertOwnership(iscilikFirmaId, k);
    if (!firma) return { ok: false, reason: 'firma bulunamadi' };
    return this.matching.remember(k.userId, `iscilik|${iscilikFirmaId}`, laborName, secilenAd);
  }

  /** L2 kalicilik: kullanicinin firmalarindaki kalemleri v2 indeksleyiciyle
   *  yeniden indeksler (bayat/legacy kalemler istek aninda da calisir —
   *  bu cagri kalici hale getirir). */
  async reindex(k: Kimlik) {
    return this.matching.reindexLabor(k);
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
