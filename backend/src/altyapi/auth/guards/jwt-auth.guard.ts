import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { KOLTUK_DISI_IZINLI } from '../decorators/koltuk-disi-izinli.decorator';
import { KAPALI_HESAP_IZINLI } from '../decorators/kapali-hesap-izinli.decorator';

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
    // ── PLAN 5.8 §4.5: KAPALI HESAP KAPISI ───────────────────────────────
    //
    // ⚠ NEDEN BURADA, `ErisimGuard`DA DEGIL (olculdu 21.09): `ErisimGuard`
    // yalniz `@GerekliYetenek` TASIYAN uclarda karar verir ve metadata yoksa
    // `true` doner (erisim.guard.ts:63). Sayim: `library.controller.ts` 0,
    // `brands` 0, `materials` 0, `labor-firms` 0 dekorator; `quotes`ta
    // `GET /`, `GET /:id`, `DELETE /:id` kapisiz. Yani §4.5'in istedigi
    // "teklif, kutuphane, cikti, ceviri uclarinin HEPSI 403" o kapiyla
    // saglanamazdi — kapali hesap 30 gun boyunca butun kutuphaneyi ve
    // tekliflerini okumaya devam ederdi.
    //
    // ⚠ KOLTUK KAPISINDAN ONCE: kapali hesap AYNI ZAMANDA koltuk asimi
    // durumunda olabilir. Koltuk once kossaydi kisi `/koltuk-durduruldu`
    // ekranina duser, "yoneticiniz paketi yukseltmeli" okur ve hesabinin
    // kapali oldugunu HIC ogrenemezdi.
    //
    // ⚠ 403, 401 DEGIL — koltuk kapisiyla ayni gerekce: oturum GECERLIDIR
    // (kisi kimligini kanitladi). 401 donmek `ortak/lib/api.ts`
    // yakalayicisina token'i sildirir ve kisi geri donus ekranini hic
    // goremeden sonsuz giris dongusune girerdi.
    if (user.hesapKapali === true) {
      const kapaliIzinli = this.reflector.getAllAndOverride<boolean>(
        KAPALI_HESAP_IZINLI,
        [context.getHandler(), context.getClass()],
      );
      if (!kapaliIzinli) {
        throw new ForbiddenException({
          kod: 'HESAP_KAPALI',
          // Metin `kapali-hesap.ts`ten gelir: ekran ve 403 AYNI cumleyi tasir.
          mesaj: user.kapatmaMetni,
          tip: user.kapatmaTipi,
          imhaTarihi: user.imhaTarihi,
        });
      }
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
