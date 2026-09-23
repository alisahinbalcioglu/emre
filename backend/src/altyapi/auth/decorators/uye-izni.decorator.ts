import { SetMetadata } from '@nestjs/common';
import type { UyeIzni } from '../../../ozellik/firma/uye-izinleri';

/**
 * 23.09.2026 — UYE IZNI KAPISI (dorduncu eksen).
 *
 * ⚠ DORT EKSEN KARISTIRILMAZ:
 *   `role`      → PLATFORM rolu (admin/user)          — `@Roles`
 *   `tier`      → paket seviyesi (abonelikten)        — `@RequireTier`
 *   yetenek     → abonelik SAGLIGI (odeme guncel mi)  — `@GerekliYetenek`
 *   uye izni    → FIRMA ICI izin (sahip neyi acti)    — BURASI
 *
 * ⚠ KABLOLAMA: metadata'yi `ErisimGuard` okur. Dekorator tek basina hicbir
 * seyi kapatmaz — `ErisimGuard` gormeyen bir denetleyicide SUSTUR.
 * `ekip-izinleri-test.ts` her kullanimin yaninda o kapinin durdugunu olcer.
 *
 * Excel ve DWG icin bu dekorator GEREKMEZ: kapi `@GerekliYetenek(EXCEL_YUKLE
 * | DWG_YUKLE)` isaretinden izni kendisi turetir (`uye-izinleri.ts`
 * `YETENEK_IZNI`). Burasi yeteneği olmayan izinler icindir (Kutuphanem).
 */
export const UYE_IZNI_KEY = 'uyeIzni';

export const UyeIzniGerekli = (izin: UyeIzni) => SetMetadata(UYE_IZNI_KEY, izin);
