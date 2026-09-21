import api from '@/ortak/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — ŞİRKET HESABIYLA GİRİŞ: BAŞLATMA (§5.4 / §6.2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ ÇEREZ YOK — VE BU BİR TASARIM KARARI. Hukuki metinler "platform hiçbir
 *  yerde çerez yazmıyor veya okumuyor" diyor ve `faz5-kvkk-hukuki-test.ts`
 *  E3 bunu kapı olarak tutuyor. Tek bir bağ çerezi o beyanı yalanlar ve
 *  çerez politikasının yeniden yazılmasını (avukat) gerektirirdi.
 *
 *  Yerine SEKME SIRRI: tarayıcı 32 baytlık rastgele bir değer üretir,
 *  `sessionStorage`a yazar ve sunucuya yalnız SHA-256 ÖZETİNİ gönderir.
 *  Dönüşte (`/sso/tamam`) sır gövdede geri verilir; sunucu özeti karşılaştırır.
 *
 *  Neden yeter:
 *   · Giriş CSRF'i — saldırganın başlattığı akışın dönüş adresi kurbana
 *     tıklatılsa bile kurbanın sekmesinde SIR YOKTUR; `degis` reddeder.
 *   · Oltalamayla alan adı sahiplenme — "Bağlantıyı sına" akışı başka
 *     şirketin çalışanında açılırsa doğrulama YAZILMAZ.
 *   · Adres çubuğundan sızan `kod` tek başına işe yaramaz (sır + 60 sn +
 *     tek kullanım).
 *
 *  ⚠ `<form>` KULLANILMAZ, `window.location.assign` kullanılır: CSP
 *  `form-action 'self'` (Caddyfile) hiç devreye girmez.
 *  ⚠ IdP adresine E-POSTA YAZILMAZ (`login_hint` yok) — sunucu yalnız alan
 *  adı ipucu ekler.
 */

/** Sekme sırrının `sessionStorage` anahtarı — hukuki metinde de bu adla yazılı. */
export const SSO_BAG_ANAHTARI = 'mpx_sso_bag';

/** 32 bayt rastgele → base64url (43 karakter; DTO `Length(40,60)` ile uyumlu). */
export function sirUret(): string {
  const bayt = new Uint8Array(32);
  crypto.getRandomValues(bayt);
  let ikili = '';
  bayt.forEach((b) => {
    ikili += String.fromCharCode(b);
  });
  return btoa(ikili).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 → 64 haneli küçük harf hex (sunucu `Matches(/^[0-9a-f]{64}$/)` bekler). */
export async function ozetle(deger: string): Promise<string> {
  const ham = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deger));
  return Array.from(new Uint8Array(ham))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function sirriOku(): string | null {
  try {
    return sessionStorage.getItem(SSO_BAG_ANAHTARI);
  } catch {
    return null;
  }
}

export function sirriSil(): void {
  try {
    sessionStorage.removeItem(SSO_BAG_ANAHTARI);
  } catch {
    /* özel pencere / depolama kapalı — akış zaten reddedilir */
  }
}

export type KurumsalNiyet =
  | { tip: 'giris'; saglayiciId: string }
  | { tip: 'niyet'; amac: 'sinama' | 'bagla'; parola?: string };

/**
 * Sırrı üretir, `sessionStorage`a yazar, sunucudan yönlendirme adresini alır
 * ve AYNI SEKMEDE oraya gider.
 *
 * ⚠ Sır ÖNCE yazılır: istek başarılı olup yönlendirme başladıktan sonra
 * yazmaya çalışmak, sayfa değişimiyle yarışırdı.
 */
export async function kurumsalGirisiBaslat(niyet: KurumsalNiyet): Promise<void> {
  const sir = sirUret();
  sessionStorage.setItem(SSO_BAG_ANAHTARI, sir);
  const tarayiciBagi = await ozetle(sir);

  const { data } =
    niyet.tip === 'giris'
      ? await api.post('/auth/sso/baslat', { saglayiciId: niyet.saglayiciId, tarayiciBagi })
      : await api.post('/auth/sso/niyet', {
          amac: niyet.amac,
          tarayiciBagi,
          ...(niyet.parola ? { parola: niyet.parola } : {}),
        });

  if (typeof data?.yonlendirmeUrl !== 'string' || data.yonlendirmeUrl === '') {
    sirriSil();
    throw new Error('Şirket girişi başlatılamadı.');
  }
  window.location.assign(data.yonlendirmeUrl);
}

/** Giriş ekranının keşif çağrısı (§5.12) — bilinmeyen adres de 200 döner. */
export type KurumsalKesif = { saglayiciId: string; tip: 'entra' | 'google'; zorunlu: boolean } | null;

export async function kurumsalKesfet(email: string): Promise<KurumsalKesif> {
  const { data } = await api.post('/auth/sso/kesfet', { email });
  return (data?.kurumsal ?? null) as KurumsalKesif;
}

/** Sağlayıcı tipinin ekranda görünen adı. */
export const SAGLAYICI_ADI: Record<string, string> = {
  entra: 'Microsoft',
  google: 'Google',
};
