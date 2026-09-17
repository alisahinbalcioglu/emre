import { SetMetadata } from '@nestjs/common';

/**
 * FAZ 7 F1b — KISI SINIRI DISINDA KALAN UCLAR (§3.12 madde 3).
 *
 * Paketi asan hesap her istekte 403 `KOLTUK_ASILDI` alir. Bu dekatorun
 * tasidigi uclar O KAPIYA TAKILMAZ.
 *
 * ⚠ IZIN LISTESI KISA ve GEREKCELI — genisletmek gelir acigi acar:
 *   · `GET /auth/me`                  → durdurma ekrani kendi verisini alir
 *   · `GET /auth/hesabim/verilerim`   → KVKK hakki odeme durumuna
 *   · `POST /auth/hesabimi-kapat`     →   BAGLANAMAZ (auth.controller.ts:129-136)
 *   · `POST /auth/change-password`    → hesabini guvene alabilmeli
 *   · `POST /auth/resend-verification`→ dogrulama e-postasi
 * F2b oturumlu `/auth/mfa/*` uclarini, F3b `DELETE /auth/sso/baglanti`u
 * kendi satiriyla ekler. BASKA HICBIR UC.
 */
export const KOLTUK_DISI_IZINLI = 'koltukDisiIzinli';

export const KoltukDisiIzinli = () => SetMetadata(KOLTUK_DISI_IZINLI, true);
