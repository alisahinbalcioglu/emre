import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
});

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Kimlik DOGRULAMA uclari: buradan gelen 401 "girdigin bilgiler yanlis" demektir,
 * "oturumun bitti" DEMEK DEGILDIR. Bu yuzden oturum silinmez ve yonlendirme yapilmaz;
 * hata cagirana reject edilir ki giris/kayit formu kendi hata mesajini gosterebilsin.
 * Kaynak: backend/src/altyapi/auth/auth.controller.ts:12 (register) ve :17 (login).
 * DIKKAT: /auth/me KORUMALI bir uctur — listede YOKTUR; oradan gelen 401 gercekten
 * oturum dusmesidir ve sessizlestirilmemelidir.
 */
/**
 * ⚠ FAZ 7 F2b: giris artik IKI ADIMLI olabilir ve ikinci adim GUARDSIZDIR.
 * O uclardan gelen 401 "meydan okumanin suresi doldu" demektir; kullanici
 * ZATEN giris ekranindadir ve sayfa kendisi 1. adima doner. Listede
 * OLMASAYDI yakalayici tam sayfa `/login` yonlendirmesi yapar, kullanici
 * hata mesajini GOREMEZDI (bu dosyanin en basindaki kusurun aynisi).
 *
 * ⚠ `/auth/mfa/kapat` ve diger OTURUMLU MFA uclari listede YOKTUR ve
 * olmamalidir: onlar yanlis kod/parolada 400 doner (401 degil), yani
 * yakalayici zaten dokunmaz; listeye eklenseydi o uclardaki GERCEK oturum
 * dusmesi sessizlesirdi.
 */
const KIMLIK_UCLARI = [
  '/auth/login',
  '/auth/register',
  '/auth/mfa/dogrula',
  '/auth/mfa/zorunlu-kurulum/baslat',
  '/auth/mfa/zorunlu-kurulum/onayla',
];

/**
 * err.config?.url hem '/auth/login' hem tam URL ('http://host/api/auth/login') olarak
 * gelebildigi icin duz esitlik kirilgan olur; sorgu/hash ve sondaki '/' ayiklanip
 * YOL SONU karsilastirilir. Sadece 'auth' aranmaz — o durumda '/auth/me' de yanlislikla
 * muaf tutulur ve gercek oturum dusmesi sessizlesirdi. Bas kismi '/' ile eslestigi icin
 * '/xauth/login' gibi baska bir uc de yanlislikla kapsanmaz.
 */
function kimlikUcuMu(url?: string): boolean {
  if (!url) return false;
  const yol = url.split(/[?#]/)[0].replace(/\/+$/, '');
  return KIMLIK_UCLARI.some((uc) => yol.endsWith(uc) || yol === uc.slice(1));
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !kimlikUcuMu(err.config?.url)
    ) {
      // IZ (kalici teshis, hata ayiklama artigi DEGIL — silmeyin):
      // oturum dusme olayinin ne konsolda ne de ekranda hicbir izi yoktu; cagiran her yer
      // sessiz catch yapiyor (CapabilitiesContext.tsx · RecentQuotes.tsx · dashboard/page.tsx ·
      // layout.tsx). Bu tek satir olmadan "oturumu hangi uc dusurdu" sorusu olculemiyor.
      console.warn('[api] 401 — oturum dusuruldu, /login e yonlendiriliyor. Uc:', err.config?.url);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }

    // ── ADIM 2: ABONELIK KISITI (403) ──────────────────────────────────
    // Sunucudaki ErisimGuard, kapali bir yetenek icin `kod:
    // 'ABONELIK_KISITLI'` tasiyan bir 403 doner. 401'den FARKLI ele alinir:
    // oturum GECERLIDIR, silinmemeli ve /login'e YONLENDIRILMEMELIDIR —
    // kullaniciyi cikisa atmak, odeme yapmasi gereken anda urunun disina
    // atmak olurdu.
    //
    // ⚠ YONLENDIRME YAPILMAZ, olay YAYINLANIR: cagiran yer kendi baglamina
    // uygun mesaji gosterebilsin (indirme butonu ≠ teklif kaydetme).
    // Kabuktaki serit zaten kalici uyariyi tasiyor; buradaki olay ANLIK
    // geri bildirim icindir.
    if (
      err.response?.status === 403 &&
      err.response?.data?.kod === 'ABONELIK_KISITLI' &&
      typeof window !== 'undefined'
    ) {
      console.warn('[api] 403 ABONELIK_KISITLI — uc:', err.config?.url, err.response?.data);
      window.dispatchEvent(
        new CustomEvent('abonelik-kisitli', { detail: err.response.data }),
      );
    }

    // ── FAZ 7 F1b (§6.10 · Emre karari E-3): KISI SINIRI ASILDI ────────
    // Sunucu 403 `KOLTUK_ASILDI` doner. 401 DEGIL ve oyle ele ALINMAZ:
    // oturum GECERLIDIR (kisi kimligini kanitladi), yalniz firmasinin paketi
    // ona yetmiyor. Oturumu silmek kullaniciyi giris ekranina atar, o da
    // tekrar girer ve ayni 403'u alir — sonsuz dongu; durdurma ekranini hic
    // goremezdi.
    //
    // ⚠ `ABONELIK_KISITLI` dalindan FARKLI: orada olay yayinlanir ve
    // kullanici sayfada kalir (odeme yapmasi gereken anda urunun disina
    // atilmaz). Burada kullanicinin yapabilecegi TEK sey durdurma ekranidir.
    if (
      err.response?.status === 403 &&
      err.response?.data?.kod === 'KOLTUK_ASILDI' &&
      typeof window !== 'undefined'
    ) {
      console.warn('[api] 403 KOLTUK_ASILDI — uc:', err.config?.url, err.response?.data);
      // ⚠ Zaten o sayfadaysak YONLENDIRME YOK: sayfanin kendi `/auth/me`
      // cagrisi izinli oldugu icin buraya dusmez, ama baska bir istek
      // dusserse sonsuz yeniden yukleme olurdu.
      if (window.location.pathname !== '/koltuk-durduruldu') {
        window.location.href = '/koltuk-durduruldu';
      }
    }

    return Promise.reject(err);
  },
);

export default api;
