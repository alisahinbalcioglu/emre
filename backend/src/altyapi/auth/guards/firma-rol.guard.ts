import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FIRMA_ROL_KEY } from '../decorators/firma-rolu.decorator';
import { kimlikCoz } from '../kimlik';

/**
 * FAZ 7 F1b — FIRMA ROLU GUARD (§3.2).
 *
 * ⚠ METOT + SINIF BIRLIKTE OKUNUR (`getAllAndOverride`), metot ezer.
 * Yalniz `getHandler()` okumak SINIF DUZEYI dekoratoru SESSIZCE ATLAR —
 * `tier.guard.ts:19-21` yorumu bu kusuru olculmus bir vaka olarak anlatiyor.
 * `roles.guard.ts:10-13` ve `erisim.guard.ts` ile ayni bicim. Mutant #16.
 *
 * ⚠ IKINCI KATMAN SERVISTE (R1-Y3): sahip gerektiren her `UyelikServisi`
 * metodu, firma kilidinin ICINDE, caginin rolunu DB'den yeniden okur. Bu
 * guard token'daki (bir istek eski olabilen) degeri okur; kilit ici okuma
 * es zamanli rol dusurmeye de dayaniklidir. Tek dekoratoru unutmak ya da
 * silmek (mutant #29-32) tek basina yetki acmamali.
 */
@Injectable()
export class FirmaRolGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const gerekenler = this.reflector.getAllAndOverride<string[]>(
      FIRMA_ROL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!gerekenler) return true;

    const { user } = context.switchToHttp().getRequest();
    // Firmasiz hesap burada gurultulu duser (kimlik.ts:25-33) — Prisma'da
    // `firmaId: undefined` kosulu SESSIZCE dusurur ve capraz-tenant sizinti
    // uretir; bu yuzden kimligi cozmek kapinin bir parcasidir.
    kimlikCoz(user);
    if (gerekenler.includes(user?.firmaRol)) return true;
    throw new ForbiddenException({
      kod: 'FIRMA_SAHIBI_GEREKLI',
      mesaj: 'Bu işlemi yalnız firma sahibi yapabilir.',
    });
  }
}
