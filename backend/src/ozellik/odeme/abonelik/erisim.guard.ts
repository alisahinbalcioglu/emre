import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';
import { ErisimKarari, ErisimServisi, Yetenek } from './erisim.servisi';

export const YETENEK_KEY = 'gerekenYetenek';

/**
 * Ucun hangi yetenegi gerektirdigini bildirir.
 * `@GerekliYetenek(Yetenek.CIKTI_INDIR)`
 */
export const GerekliYetenek = (...yetenekler: Yetenek[]) =>
  SetMetadata(YETENEK_KEY, yetenekler);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ERISIM KAPISI — "bu firma su an bunu yapabilir mi"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ErisimServisi kararini HTTP katmanina baglar. Karar mantigi BURADA
 *  DEGILDIR (servis tek dogru kaynaktir); bu sinif yalnizca kablolamadir.
 *
 *  ── NEDEN SUNUCUDA DA KAPATILIYOR ───────────────────────────────────────
 *  On yuzde butonu gizlemek KAPATMAK DEGILDIR: uclar dogrudan cagrilabilir
 *  ve kisitli moddaki bir firma `POST /api/quotes/:id/export`'a istek atarak
 *  ciktisini almaya devam edebilir. Kisitli modun tek anlamli yeri sunucudur.
 *
 *  ── TIER GUARD ILE ILISKI (ikisi AYNI SEY DEGIL) ────────────────────────
 *  `TierGuard` "bu paketi SATIN ALDIN MI" sorusunu sorar (yetenek/kapsam).
 *  Bu kapi "ODEMEN GUNCEL MI" sorusunu sorar (abonelik sagligi). Bir firma
 *  Pro paketi satin almis OLABILIR ama odemesi 30 gun gecikmisse ciktisini
 *  indirememelidir. Iki kapi DIK eksenlerdir; biri digerinin yerine gecmez.
 *
 *  ── SESSIZ GECIS YASAK ──────────────────────────────────────────────────
 *  Yetenek metadata'si TANIMSIZSA kapi `true` doner (uc korumasizdir) —
 *  bu, NestJS guard'larinin normal davranisidir ve bilincli birakilmistir:
 *  butun uclara kapi koymak istemiyoruz. Ama metadata VARSA ve firma yoksa
 *  GURULTUYLE durulur (kimlikCoz 403 firlatir), sessizce gecilmez.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class ErisimGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly erisim: ErisimServisi,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // RolesGuard/TierGuard ile AYNI okuma: metot + SINIF, metot ezer.
    // Yalniz getHandler() okunursa @GerekliYetenek'i SINIF duzeyine koyan
    // controller'larda metadata bulunamaz ve kapi sessizce true donerdi
    // (tier.guard.ts:20'de olculmus kusurun ta kendisi).
    const gerekenler = this.reflector.getAllAndOverride<Yetenek[]>(
      YETENEK_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!gerekenler || gerekenler.length === 0) return true;

    const istek = context.switchToHttp().getRequest();
    const { firmaId } = kimlikCoz(istek.user);

    const karar: ErisimKarari = await this.erisim.karar(firmaId);

    // Karari istege iliştir: controller tekrar sorgu atmadan okuyabilsin.
    istek.erisimKarari = karar;

    for (const y of gerekenler) {
      if (!this.erisim.yetenekKararla(karar, y)) {
        throw new ForbiddenException({
          mesaj: karar.uyari?.baslik ?? 'Erisiminiz kisitli',
          aciklama: karar.uyari?.metin,
          durum: karar.durum,
          saltOkunur: karar.saltOkunur,
          eylem: karar.uyari?.eylem,
          // On yuz bu koda bakarak abonelik seridini/modalini acar.
          kod: 'ABONELIK_KISITLI',
        });
      }
    }

    return true;
  }
}
