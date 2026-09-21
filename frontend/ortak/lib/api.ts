import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
});

/**
 * ── ZAMAN ASIMI (21.09, Gorunur kusurlar turu · G6 olcumu) ────────────────
 *
 * KUSUR: axios ornegi `timeout` TASIMIYORDU ve axios'un varsayilani 0'dir
 * (= SONSUZ BEKLE). Asilan bir istek hicbir zaman dusmuyor, `catch` blogu
 * HIC kosmuyor, `finally { setYukleniyor(false) }` HIC calismiyordu — yani
 * ekrandaki `animate-spin` sonsuza kadar donuyordu. Kullanicinin elinde
 * sayfayi yenilemekten baska bir yol kalmiyordu ve "uygulama kitlendi"
 * goruntusu veriyordu.
 *
 * ⚠ TEK BIR SAYI YETMEZ. Uclar iki aileye ayriliyor ve tek degerle birini
 * kesmeden digerini koruyamazsiniz:
 *   · SIRADAN (JSON okuma/yazma) — milisaniyeler surer. 30 sn bunlarin
 *     onlarca katidir: bu surede donmediyse istek ASILMISTIR.
 *   · AGIR (dosya yukleme · Excel ayiklama · AI cevirisi · cikti uretimi) —
 *     OLCULDU: Caddyfile:76 "Buyuk DWG parse'lari 30-90sn surebilir" diyor
 *     ve `read_timeout/write_timeout 600s` koyuyor. `/ai/translate`
 *     `max_tokens: 16000` ile bir LLM cagrisidir (ai.service.ts, ceviri.service.ts).
 *     Bunlara 30 sn koymak CALISAN ozellikleri kirardi.
 * Bu yuzden agir aileye 5 dk verilir — depoda zaten kullanilan deger
 * (`components/dwg-diameter-engine/useLayerCalc.ts:64` → 300000) ve Caddy'nin
 * 600 sn tavaninin altinda kalir.
 *
 * ⚠ CAGIRANIN KENDI DEGERI HER ZAMAN ONCELIKLIDIR. `config.timeout` yalniz
 * BOS ise doldurulur; `DwgUploader.tsx` (120000 · 15000) gibi kendi suresini
 * bilen cagrilar AYNEN korunur.
 *
 * ⚠ ZAMAN ASIMI OTURUM DUSMESI DEGILDIR. Asagidaki 401 yakalayicisi
 * `err.response?.status`a bakar; zaman asimi hatasinin `response`u YOKTUR,
 * yani kullanici cikisa ATILMAZ. Bu bir varsayim degil, kilitli:
 * `api-401-kapsami.test.ts` H blogu.
 */
export const VARSAYILAN_ZAMAN_ASIMI_MS = 30_000;
export const AGIR_ZAMAN_ASIMI_MS = 300_000;

/**
 * Agir uclar. Liste ELLE TUTULAN tek yer degildir: dosya yukleyen her istek
 * (FormData / multipart) yoluna bakilmaksizin agir sayilir — yeni bir yukleme
 * ekrani eklendiginde bu listeyi guncellemeyi unutmak 30 sn'lik bir kesintiye
 * yol acmasin diye.
 */
const AGIR_UCLAR = [
  '/ai/', // analiz · ceviri · duzeltme — LLM cagrilari (dakikalar surebilir)
  '/excel-grid/', // Excel ayiklama
  '/excel/',
  '/dwg', // DXF/DWG parse (Caddyfile: 30-90 sn olculdu)
  '/export', // cikti uretimi (`/quotes/:id/export`, `export-priced`)
  '/import',
  '/upload',
];

function agirIstekMi(config: { url?: string; data?: unknown; headers?: unknown }): boolean {
  // 1) Dosya yukleyen her istek agirdir (yol listesine bagli degil).
  const icerikTipi = String(
    (config.headers as Record<string, unknown> | undefined)?.['Content-Type'] ?? '',
  );
  if (icerikTipi.includes('multipart/form-data')) return true;
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) return true;

  // 2) Govdesiz ama sunucuda agir calisan uclar (ceviri, cikti indirme).
  const yol = String(config.url ?? '').split(/[?#]/)[0];
  return AGIR_UCLAR.some((agir) => yol.includes(agir));
}

/** Bir istegin uygulanacak zaman asimi (saf karar — test edilebilir). */
export function zamanAsimiSec(config: {
  url?: string;
  data?: unknown;
  headers?: unknown;
  timeout?: number;
}): number {
  // ⚠ `!config.timeout` bilincli: axios varsayilani 0'dir (sonsuz) ve
  // `undefined === 0` degildir. `=== undefined` yazilsaydi, cagiran acikca
  // `timeout: 0` (sonsuz bekle) dedi saniliyor olurdu — oysa 0 axios'un
  // DOLDURMADIGI durumun ta kendisi, yani bu kusurun kaynagi.
  if (config.timeout) return config.timeout;
  return agirIstekMi(config) ? AGIR_ZAMAN_ASIMI_MS : VARSAYILAN_ZAMAN_ASIMI_MS;
}

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.timeout = zamanAsimiSec(config);
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
/**
 * ⚠ FAZ 7 F3b: sirket girisinin ikinci adimi da GUARDSIZDIR. `/auth/sso/degis`
 * ve `/auth/sso/katil` 401 dondugunde anlam "60 saniyelik kod tukendi ya da
 * sekme sirri uymadi"dir — OTURUM DUSMESI DEGIL. Listede olmasaydi yakalayici
 * tam sayfa `/login` yonlendirmesi yapar, kullanici `/sso/tamam` sayfasindaki
 * "yeniden deneyin" metnini GOREMEZDI.
 *
 * ⚠ `/auth/sso/niyet` ve `DELETE /auth/sso/baglanti` listede YOKTUR ve
 * olmamalidir: onlar OTURUMLU uclardir ve yanlis parolada 400 doner; listeye
 * eklenseydi oradaki GERCEK oturum dusmesi sessizlesirdi.
 */
/**
 * ⚠ GORUNUR KUSURLAR TURU (21.09) — `/auth/change-password` ve
 * `/auth/hesabimi-kapat` LISTEDE YOKTUR ve EKLENMEYECEKTIR.
 *
 * Sikayet dogruydu: yanlis MEVCUT parola kullaniciyi oturumdan atiyordu.
 * Ama kusur BURADA degildi — sunucu oturumlu bir ucta yanlis parolayi 401
 * ile anlatiyordu (parola.servisi.ts · hesap.servisi.ts). Duzeltme orada
 * yapildi: artik 400 + `kod: 'PAROLA_HATALI'` doner (Faz 7 deseni).
 *
 * Bu iki ucu listeye EKLEMEK yanlis olurdu: ikisi de JwtAuthGuard
 * arkasindadir, yani oradan gelen 401 GERCEKTEN oturum dusmesidir ve
 * sessizlestirilemez. Kilit: `api-401-kapsami.test.ts` G blogu (G1/G2 400
 * cikis yaptirmaz · G3 401 HALA yaptirir).
 */
const KIMLIK_UCLARI = [
  '/auth/login',
  '/auth/register',
  '/auth/mfa/dogrula',
  '/auth/mfa/zorunlu-kurulum/baslat',
  '/auth/mfa/zorunlu-kurulum/onayla',
  '/auth/sso/degis',
  '/auth/sso/katil',
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
