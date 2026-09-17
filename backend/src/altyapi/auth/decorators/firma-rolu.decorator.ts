import { SetMetadata } from '@nestjs/common';
import type { FirmaRol } from '../../../ozellik/firma/uyelik-kurallari';

/**
 * FAZ 7 F1b — FIRMA ROLU KAPISI (§3.2).
 *
 * ⚠ UC EKSEN KARISTIRILMAZ:
 *   `role`     → PLATFORM rolu (admin/user) — `@Roles`
 *   `tier`     → paket seviyesi (abonelikten) — `@RequireTier`
 *   `firmaRol` → FIRMA ICI rol (sahip/uye) — BURASI
 * Ucu de ayri sorulardir; birini digerinin yerine kullanmak yetkiyi sessizce
 * genisletir.
 */
export const FIRMA_ROL_KEY = 'firmaRol';

export const FirmaRolu = (...roller: FirmaRol[]) =>
  SetMetadata(FIRMA_ROL_KEY, roller);
