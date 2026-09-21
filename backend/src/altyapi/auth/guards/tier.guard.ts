import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../db/prisma.service';
import { firmaPaketDurumu, seviyeGorunenAd, seviyeSirasi } from '../seviye';

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
    // ── 2.13 (22.09.2026): SAĞLIK ARTIK BURADA DA SÜZÜLÜYOR ───────────────
    // ESKİ HAL: "`durum` ve `erisimSonu` burada BİLEREK süzülmez; sağlığı
    // `ErisimGuard` ölçer." O savunma yalnızca `@RequireTier` taşıyan HER ucun
    // aynı zamanda `@GerekliYetenek` taşıması hâlinde geçerliydi ve bunu
    // hiçbir kapı korumuyordu. Ölçüldü (22.09): bugün 3 `@RequireTier` ucunun
    // 3'ü de `@GerekliYetenek` taşıyor — yani BUGÜN somut açık yoktu; kapatılan
    // şey bu kapının kendisinin FAIL-OPEN olmasıydı. Yarın yetenek dekoratörü
    // unutulursa aboneliği sona ermiş firma buradan geçerdi.
    //
    // ⚠ ÖLÇÜT HAM `durum` DEĞİL, ERİŞİM KARARI (`abonelik-erisim.ts`):
    // ödenmiş dönemi süren `IPTAL` aboneliği seviyesini KORUR, kesilmez.
    const paket = await firmaPaketDurumu(this.prisma, user.firmaId);

    // Erişimi olmayan firmaya paket seviyesi VERİLMEZ (fail-closed).
    const userLevel = seviyeSirasi(paket.etkinSeviye);
    const minRequired = Math.min(...requiredTiers.map((t) => seviyeSirasi(t) || 999));

    if (userLevel < minRequired) {
      // ⚠ Musteriye gorunen ad (R1/E-5): mesajda buyuk harfli `CORE`/`PRO`
      // YOK — musteri "CORE" diye bir sey satin almadi, "Basic" satin aldi.
      const gereken = seviyeGorunenAd(requiredTiers[0]) || 'Pro';

      // ⚠ PAKETİ VAR AMA ERİŞİMİ YOKSA MESAJ SEVİYE DEĞİL SAĞLIK MESAJIDIR.
      // "Mevcut paketiniz yok" demek yanlış olurdu: müşteri Pro satın almıştı,
      // aboneliği sona erdi. Zengin metin (hangi durum, ne yapmalı) hâlâ
      // `ErisimGuard`ın işidir — burada YENİ BİR KURAL yok, `paket.erisimVar`
      // aynı saf çekirdekten geliyor; bu yalnızca doğru cümleyi seçiyor.
      if (paket.erisimVar === false && paket.paketSeviyesi) {
        throw new ForbiddenException(
          `${seviyeGorunenAd(paket.paketSeviyesi)} aboneliğiniz şu anda etkin değil. ` +
            'Devam etmek için aboneliğinizi yenileyin.',
        );
      }

      const mevcut = paket.etkinSeviye
        ? `Mevcut paketiniz: ${seviyeGorunenAd(paket.etkinSeviye)}`
        : 'Mevcut paketiniz yok';
      throw new ForbiddenException(`Bu özellik ${gereken} paketi gerektirir. ${mevcut}`);
    }

    return true;
  }
}
