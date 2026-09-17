import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../db/prisma.service';
import { firmaPaketSeviyesi, seviyeGorunenAd, seviyeSirasi } from '../seviye';

export const TIER_KEY = 'requiredTier';
export const RequireTier = (...tiers: string[]) => SetMetadata(TIER_KEY, tiers);

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

    // ⚠ `tier` OKUNMAZ (2.12, 17.09.2026). Yalniz hangi firmada oldugu.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firmaId: true },
    });
    if (!user) throw new ForbiddenException('Kullanıcı bulunamadı');

    // ── SEVIYE YALNIZ ABONELIKTEN (2.12, 17.09.2026) ─────────────────────
    // ONCEKI HAL: `Math.max(User.tier, abonelik)` — "iki kaynak, yuksek olan
    // kazanir". O kural 07.09'da bilerek konmustu (pro satin alan firma
    // `User.tier: core` kaldigi icin 403 aliyordu) ama YANLIS YONE acikti:
    // `User.tier`i hicbir odeme yolu yazmiyor, yalniz yonetici paneli elle
    // degistiriyordu. Yani abonelik iptal edilse, dusurulse ya da hic
    // olmasa bile elle verilmis `tier` kapiyi acik tutuyordu — SEVIYE
    // SATIN ALMAYLA DEGIL ELLE DAGITILIYORDU. Simdi tek yetkili kaynak
    // abonelik (`seviye.ts`); `User.tier` kolonu duruyor ama YETKI
    // VERMIYOR ve yonetici ucu artik onu degistirmiyor (`PAKET_ABONELIKTEN`).
    //
    // ⚠ `durum` ve `erisimSonu` BURADA BİLEREK SÜZÜLMEZ (10.09.2026 gerekçesi
    // AYNEN GEÇERLİ, `Math.max` gitse de): SEVİYE ile SAĞLIK ayrı eksenlerdir.
    // "Hangi paket?" burada, "aboneliği yürüyor mu?" `ErisimGuard`ta ölçülür;
    // `capabilities.helper.ts` de bilerek süzgeçsizdir. İkisini burada
    // birleştirmek o iki tüketiciyle çelişir ve ödemesi gecikmiş bir firmaya
    // "Mevcut paketiniz yok" dedirtirdi (doğru mesaj ErisimGuard'ınkidir).
    const paketSeviyesi = await firmaPaketSeviyesi(this.prisma, user.firmaId);

    const userLevel = seviyeSirasi(paketSeviyesi);
    const minRequired = Math.min(...requiredTiers.map((t) => seviyeSirasi(t) || 999));

    if (userLevel < minRequired) {
      // ⚠ Musteriye gorunen ad (R1/E-5): mesajda buyuk harfli `CORE`/`PRO`
      // YOK — musteri "CORE" diye bir sey satin almadi, "Basic" satin aldi.
      const gereken = seviyeGorunenAd(requiredTiers[0]) || 'Pro';
      const mevcut = paketSeviyesi
        ? `Mevcut paketiniz: ${seviyeGorunenAd(paketSeviyesi)}`
        : 'Mevcut paketiniz yok';
      throw new ForbiddenException(`Bu özellik ${gereken} paketi gerektirir. ${mevcut}`);
    }

    return true;
  }
}
