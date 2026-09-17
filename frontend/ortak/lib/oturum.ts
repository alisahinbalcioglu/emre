/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F1b — OTURUM YAZIMI TEK YERDE (§6.1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ OLCULMUS KUSUR: `login/page.tsx:30` yanittaki `data.token`i DOGRULAMADAN
 *  yaziyordu. Faz 7'de giris yaniti dallanacak (MFA adiminda `token` ALANI
 *  YOKTUR) — o durumda `localStorage.setItem('token', undefined)` **"undefined"
 *  DIZGESINI** yazar ve kullanici her istekte `Bearer undefined` gonderip
 *  sonsuz 401 dongusune girer. Hata mesaji da anlamsizdir.
 *
 *  Bu yuzden: token ya UC NOKTALI JWT bicimindedir ve yazilir, ya da
 *  FIRLATILIR ve HICBIR SEY yazilmaz (yarim oturum kalmaz).
 *
 *  ⚠ `localStorage.setItem('token'` cagrisi `app/` ve `ozellik/` altinda
 *  YALNIZ BURADA gecer (vitest kaynak kapisi). `test/e2e-golden` HARIC —
 *  oradaki yazim Playwright on yuklemesidir, uygulama kodu degildir.
 */

/** Uc parca, her biri base64url alfabesinden en az bir karakter. */
const JWT_BICIMI = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type OturumYaniti = {
  token: string;
  user: { id: string; email: string; role: string; tier?: string; koltukDurduruldu?: boolean };
};

export function gecerliTokenMi(token: unknown): token is string {
  return typeof token === 'string' && JWT_BICIMI.test(token);
}

/**
 * Oturumu yazar. Gecersiz yanitta FIRLATIR ve hicbir anahtara dokunmaz.
 *
 * @throws {Error} token yoksa ya da JWT bicimde degilse
 */
export function oturumuYaz(data: unknown): OturumYaniti {
  const y = data as Partial<OturumYaniti> | null | undefined;
  if (!gecerliTokenMi(y?.token)) {
    throw new Error(
      'Sunucudan geçerli bir oturum anahtarı gelmedi. Lütfen tekrar giriş yapın.',
    );
  }
  localStorage.setItem('token', y!.token as string);
  localStorage.setItem('user', JSON.stringify(y!.user ?? null));
  return y as OturumYaniti;
}

/**
 * Giristen sonra gidilecek adres. Kisi siniri asildiysa kullanici panoya
 * DEGIL durdurma ekranina gider — panoya gitse her istegi 403 alirdi.
 */
export function girisSonrasiYol(data: OturumYaniti): string {
  return data.user?.koltukDurduruldu === true ? '/koltuk-durduruldu' : '/dashboard';
}
