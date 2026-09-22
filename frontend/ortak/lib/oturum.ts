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
  user: {
    id: string;
    email: string;
    role: string;
    tier?: string;
    koltukDurduruldu?: boolean;
    /** PLAN 5.8 §4 — hesap (ya da firma) kapali: geri donus ekranina gidilir. */
    hesapKapali?: boolean;
  };
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
 *
 * ⚠ PLAN 5.8 §4.4: KAPALI HESAP KOLTUKTAN ONCE gelir. Sunucudaki sira da
 * aynidir (`jwt-auth.guard.ts`: once `HESAP_KAPALI`, sonra `KOLTUK_ASILDI`);
 * iki taraf ters siralansaydi kullanici `/koltuk-durduruldu` ekranina dusup
 * "yoneticiniz paketi yukseltmeli" okur ve hesabinin KAPALI oldugunu hic
 * ogrenemezdi.
 */
export function girisSonrasiYol(data: OturumYaniti): string {
  // ── 22.09.2026 (Emre karari): AYRI GERI DONUS EKRANI KALDIRILDI ──────
  // Eskiden `/hesap-kapali` diye TEK amacli bir sayfa vardi. Emre'nin
  // gerekcesi: "ikinci bir arayuze hic gerek yok — 30 gun boyunca mail ve
  // sifre kayitli kalir, girmek isteyen giris yapar ve paket secer."
  // Kapali hesabin geri donmesinin TEK yolu zaten paket almak; onu ayri bir
  // ekrandan bir dugmeyle gostermek araya gereksiz bir adim koyuyordu.
  // Kapatma cumlesi ve imha tarihi kaybolmadi — `KapaliHesapSeridi`ne tasindi.
  if (data.user?.hesapKapali === true) return '/abonelik';
  return data.user?.koltukDurduruldu === true ? '/koltuk-durduruldu' : '/dashboard';
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — GIRIS DALI (SAF)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  `login`, `register` ve `davet-kabul` yanitlari artik UC BICIMDEN biri
 *  olabilir. Dal karari UC EKRANDA da ayni olmali; her sayfa kendi
 *  `if (data.mfaGerekli)`ini yazarsa biri gunun birinde ayrisir.
 *
 *  ⚠ BU FONKSIYON `oturumuYaz`DAN ONCE CAGRILIR. `oturumuYaz` gecersiz
 *  token'da FIRLATIR; MFA dalinda `token` ANAHTARI HIC YOKTUR ve dogrudan
 *  ona vermek kullaniciya "Sunucudan gecerli bir oturum anahtari gelmedi"
 *  gibi yaniltici bir hata gosterirdi.
 */
export type GirisDali =
  | { tip: 'oturum' }
  | { tip: 'kod'; meydanOkuma: string }
  | { tip: 'kurulum'; meydanOkuma: string; neden: 'yonetici' | 'firma' | null };

export function girisDaliCoz(data: unknown): GirisDali {
  const y = (data ?? {}) as Record<string, unknown>;
  const meydanOkuma = typeof y.meydanOkuma === 'string' ? y.meydanOkuma : '';
  if (y.mfaGerekli === true && meydanOkuma !== '') {
    return { tip: 'kod', meydanOkuma };
  }
  if (y.mfaKurulumGerekli === true && meydanOkuma !== '') {
    const neden = y.neden === 'yonetici' || y.neden === 'firma' ? y.neden : null;
    return { tip: 'kurulum', meydanOkuma, neden };
  }
  // ⚠ VARSAYILAN `oturum`: bayrak VAR ama meydan okuma YOKSA da buraya
  // duseriz ve `oturumuYaz` gurultuyle firlatir. Sessizce "kod ekrani"
  // gostermek, kullaniciyi asla ilerleyemeyecegi bir ekranda birakirdi.
  return { tip: 'oturum' };
}
