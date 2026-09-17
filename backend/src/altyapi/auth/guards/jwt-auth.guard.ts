import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { KOLTUK_DISI_IZINLI } from '../decorators/koltuk-disi-izinli.decorator';

/**
 * ⚠ `AuthGuard('jwt')` DEPODA YALNIZ BURADA cagrilir (kaynak kapisi
 * `test:faz7-ekip` S14). Baska bir dosya dogrudan `AuthGuard('jwt')`
 * kullanirsa asagidaki koltuk kapisi O UCTA SESSIZCE ATLANIR.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
   * FAZ 7 F1b — KISI SINIRI KAPISI (§3.12, Emre karari E-3).
   *
   * `JwtStrategy.validate` her istekte "bu hesap paketin hakkini asiyor mu"
   * hesaplar; KARAR burada verilir (izin listesi `Reflector` ister).
   *
   * ⚠ 403, 401 DEGIL. Oturum GECERLIDIR — kisi kimligini kanitladi, yalniz
   * firmasinin paketi ona yetmiyor. 401 donmek `ortak/lib/api.ts:36-52`
   * yakalayicisinin oturumu SILMESINE ve kisinin sonsuz giris dongusune
   * girmesine yol acardi (durdurma ekranini hic goremezdi).
   *
   * ⚠ Metadata METOT + SINIF okunur; yalniz `getHandler()` okumak sinif
   * duzeyi izni sessizce dusururdu (mutant #40).
   *
   * ⚠ `super.handleRequest` imzasi @nestjs/passport 10.x
   * (`auth.guard.js:58`) — hata/kullanici yoksa ustteki davranis aynen kalir
   * (401 ve orijinal mesaj).
   */
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ): TUser {
    if (err || !user) {
      return super.handleRequest(err, user, info, context, status);
    }
    if (user.koltukDurduruldu === true) {
      const izinli = this.reflector.getAllAndOverride<boolean>(
        KOLTUK_DISI_IZINLI,
        [context.getHandler(), context.getClass()],
      );
      if (!izinli) {
        throw new ForbiddenException({
          kod: 'KOLTUK_ASILDI',
          mesaj:
            `Firmanızın paketi ${user.koltukHakki} kişilik; ` +
            'yöneticiniz paketi yükseltmeli ya da ekibi düzenlemeli.',
          hak: user.koltukHakki,
        });
      }
    }
    return user as TUser;
  }
}
