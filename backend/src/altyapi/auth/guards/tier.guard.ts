import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../db/prisma.service';

export const TIER_KEY = 'requiredTier';
export const RequireTier = (...tiers: string[]) => SetMetadata(TIER_KEY, tiers);

// Tier yetki haritası — Core < Pro < Suite
const TIER_LEVELS: Record<string, number> = { core: 1, pro: 2, suite: 3 };

@Injectable()
export class TierGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // RolesGuard ile AYNI okuma (roles.guard.ts:10-13): metot + SINIF, metot ezer.
    // Yalniz getHandler() okunursa @RequireTier'i SINIF duzeyine koyan
    // controller'larda metadata bulunamaz ve guard asagida sessizce true doner.
    const requiredTiers = this.reflector.getAllAndOverride<string[]>(TIER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredTiers || requiredTiers.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.user?.id;
    if (!userId) throw new ForbiddenException('Kullanıcı bulunamadı');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true, firmaId: true },
    });
    if (!user) throw new ForbiddenException('Kullanıcı bulunamadı');

    // ── IKI KAYNAK, YUKSEK OLAN KAZANIR (07.09.2026) ─────────────────────
    // OLCULEN KUSUR: bu guard yalnizca `User.tier` okuyordu, ama HICBIR odeme
    // yolu o alani YAZMIYOR (olculdu: backend/src/ozellik/odeme altinda tier'e
    // tek yazma yok). Satin alma `Abonelik` acar, `User.tier` `core` kalir.
    // Bu arada ON YUZ iscilik ekranini `capabilities` ile aciyor ve o
    // Abonelik'ten turuyor (capabilities.helper.ts:103-113).
    //
    // Sonuc: pro paket alan bir firma ekrani ACIK gorur, her /labor istegi
    // 403 doner. Bugun patlamadi cunku 28.08 gocu mevcut firmalara tier
    // backfill'i yapti (olculdu: 4 kullanicinin 3'unde iki kaynak ortusuyor,
    // biri fazla-yetkili). ILK GERCEK SATIN ALMADA patlar.
    //
    // Cozum YUKSEK OLANI almak: kesinlikle IZIN GENISLETIR, hicbir kullanicinin
    // mevcut erisimini DARALTMAZ. Dar yon (yalniz Abonelik'e bakmak) `suite`
    // tier'li mevcut hesaplari kirardi — `PackageLevel` enum'unda `suite` YOK.
    let paketSeviyesi: string | null = null;
    if (user.firmaId) {
      const ab = await this.prisma.abonelik.findUnique({
        where: { firmaId: user.firmaId },
        select: { paketSurumu: { select: { paket: { select: { seviye: true } } } } },
      });
      paketSeviyesi = ab?.paketSurumu?.paket?.seviye ?? null;
    }

    const tierSeviye = TIER_LEVELS[user.tier] ?? 0;
    const abonelikSeviye = paketSeviyesi ? (TIER_LEVELS[paketSeviyesi] ?? 0) : 0;
    const userLevel = Math.max(tierSeviye, abonelikSeviye);
    const minRequired = Math.min(...requiredTiers.map((t) => TIER_LEVELS[t] ?? 999));

    if (userLevel < minRequired) {
      const tierName = requiredTiers[0]?.toUpperCase() ?? 'PRO';
      // Mesajda ETKIN paketi soyle — kullanici `User.tier`i bilmez, satin
      // aldigi paketi bilir. Iki kaynak ayrisiyorsa yuksek olani gosteririz.
      const etkin = abonelikSeviye > tierSeviye ? paketSeviyesi! : user.tier;
      throw new ForbiddenException(`Bu özellik ${tierName} paketi gerektirir. Mevcut paketiniz: ${etkin.toUpperCase()}`);
    }

    return true;
  }
}
