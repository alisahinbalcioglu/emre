import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

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
    const requiredTiers = this.reflector.get<string[]>(TIER_KEY, context.getHandler());
    if (!requiredTiers || requiredTiers.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.user?.id;
    if (!userId) throw new ForbiddenException('Kullanıcı bulunamadı');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { tier: true } });
    if (!user) throw new ForbiddenException('Kullanıcı bulunamadı');

    const userLevel = TIER_LEVELS[user.tier] ?? 0;
    const minRequired = Math.min(...requiredTiers.map((t) => TIER_LEVELS[t] ?? 999));

    if (userLevel < minRequired) {
      const tierName = requiredTiers[0]?.toUpperCase() ?? 'PRO';
      throw new ForbiddenException(`Bu özellik ${tierName} paketi gerektirir. Mevcut paketiniz: ${user.tier.toUpperCase()}`);
    }

    return true;
  }
}
