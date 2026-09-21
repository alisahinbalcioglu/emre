/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — KURUMSAL GİRİŞ (ÖN YÜZ)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ NE ÖLÇÜLÜR, NE ÖLÇÜLMEZ (dürüst sınır): bu depoda `@testing-library/react`
 *  KURULU DEĞİL — bileşenler RENDER EDİLEREK ölçülemez. Bu yüzden burada
 *  (a) `kurumsal-baslat.ts`in GERÇEK davranışı (sahte `crypto`/`sessionStorage`/
 *  `location` ile), (b) SAF kararlar ve (c) KAYNAK KAPILARI ölçülür.
 *  Ekranların görsel doğruluğu raporun "Ölçülemeyenler" bölümünde yazılıdır.
 *
 *  Kaynak kapıları zayıf değildir: ölçülen her satır, geçmişte ayrışan bir
 *  ikizin ya da unutulan bir dalın yerine geçer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { webcrypto } from 'node:crypto';

const KOK = path.join(__dirname, '../..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');
/** Yorumlari atar: kapi YORUMDA degil KODDA eslessin. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ═══════════════════════════════════════════════════════════════════════════
//  SAHTE TARAYICI — `kurumsal-baslat.ts` GERCEKTEN kosturulur
// ═══════════════════════════════════════════════════════════════════════════
const istekler: { url: string; govde: any }[] = [];
let atananAdres: string | null = null;
let formSayisi = 0;

vi.mock('@/ortak/lib/api', () => ({
  default: {
    post: async (url: string, govde: any) => {
      istekler.push({ url, govde });
      return { data: { yonlendirmeUrl: 'https://login.microsoftonline.com/x/authorize?state=abc' } };
    },
  },
}));

const depo = new Map<string, string>();

beforeEach(() => {
  istekler.length = 0;
  atananAdres = null;
  formSayisi = 0;
  depo.clear();
  // ⚠ Node 20+`da `globalThis.crypto` SALT OKUNUR bir getter: duz atama
  // `TypeError` atar. `defineProperty` ile yazilabilir hale getirilir.
  if (!(globalThis as any).crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      configurable: true,
      writable: true,
    });
  }
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => (depo.has(k) ? depo.get(k)! : null),
    setItem: (k: string, v: string) => void depo.set(k, v),
    removeItem: (k: string) => void depo.delete(k),
  };
  (globalThis as any).window = {
    location: {
      assign: (u: string) => {
        atananAdres = u;
      },
    },
  };
  (globalThis as any).document = {
    createElement: (etiket: string) => {
      if (etiket === 'form') formSayisi++;
      return {};
    },
  };
  (globalThis as any).btoa = (s: string) => Buffer.from(s, 'binary').toString('base64');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('F1 — kurumsal-baslat: sekme sirri sunucuya GITMEZ, yalniz OZETI gider', () => {
  it('F1a giris baslatma: sir sessionStorage e yazilir, govdede 64 hex OZET var', async () => {
    const { kurumsalGirisiBaslat, SSO_BAG_ANAHTARI, ozetle } = await import('./kurumsal-baslat');
    await kurumsalGirisiBaslat({ tip: 'giris', saglayiciId: 'IDP1' });

    const sir = depo.get(SSO_BAG_ANAHTARI);
    expect(typeof sir).toBe('string');
    expect((sir as string).length).toBeGreaterThanOrEqual(40);

    expect(istekler).toHaveLength(1);
    expect(istekler[0].url).toBe('/auth/sso/baslat');
    expect(istekler[0].govde.saglayiciId).toBe('IDP1');
    // ⭐ EN KRITIK: govde OZET tasir, SIRRIN KENDISINI DEGIL.
    expect(istekler[0].govde.tarayiciBagi).toMatch(/^[0-9a-f]{64}$/);
    expect(istekler[0].govde.tarayiciBagi).toBe(await ozetle(sir as string));
    expect(JSON.stringify(istekler[0].govde)).not.toContain(sir as string);
  });

  it('F1b AYNI SEKMEDE gidilir: `location.assign` cagrilir, `<form>` OLUSTURULMAZ', async () => {
    const { kurumsalGirisiBaslat } = await import('./kurumsal-baslat');
    await kurumsalGirisiBaslat({ tip: 'giris', saglayiciId: 'IDP1' });
    // ⚠ `<form>` kullanilsaydi CSP `form-action 'self'` devreye girerdi.
    expect(formSayisi).toBe(0);
    expect(atananAdres).toBe('https://login.microsoftonline.com/x/authorize?state=abc');
  });

  it('F1c niyet: `parola` GOVDEDE gider (R1-O3 yeniden kimlik dogrulamasi)', async () => {
    const { kurumsalGirisiBaslat } = await import('./kurumsal-baslat');
    await kurumsalGirisiBaslat({ tip: 'niyet', amac: 'bagla', parola: 'gizli-parola' });
    expect(istekler[0].url).toBe('/auth/sso/niyet');
    expect(istekler[0].govde.amac).toBe('bagla');
    expect(istekler[0].govde.parola).toBe('gizli-parola');
    expect(istekler[0].govde.tarayiciBagi).toMatch(/^[0-9a-f]{64}$/);
  });

  it('F1d parolasiz hesapta `parola` anahtari GONDERILMEZ (bos dizge de degil)', async () => {
    const { kurumsalGirisiBaslat } = await import('./kurumsal-baslat');
    await kurumsalGirisiBaslat({ tip: 'niyet', amac: 'bagla' });
    expect('parola' in istekler[0].govde).toBe(false);
  });

  it('F1e her cagrida YENI sir uretilir (sabit sir tekrar saldirisina acik olurdu)', async () => {
    const { kurumsalGirisiBaslat, SSO_BAG_ANAHTARI } = await import('./kurumsal-baslat');
    await kurumsalGirisiBaslat({ tip: 'giris', saglayiciId: 'IDP1' });
    const birinci = depo.get(SSO_BAG_ANAHTARI);
    await kurumsalGirisiBaslat({ tip: 'giris', saglayiciId: 'IDP1' });
    expect(depo.get(SSO_BAG_ANAHTARI)).not.toBe(birinci);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  F2 — KAYNAK KAPILARI
// ═══════════════════════════════════════════════════════════════════════════
describe('F2 — /sso/tamam kaynak kapilari', () => {
  const kaynak = kodu(oku('app/sso/tamam/page.tsx'));

  it('F2a `kod` adres cubugundan HEMEN silinir (`replaceState`)', () => {
    expect(kaynak).toMatch(/history\.replaceState\(null, '', '\/sso\/tamam'\)/);
  });

  it('F2b ⭐ `degis` BIR KEZ cagrilir (React cift etkisine karsi `useRef` bayragi)', () => {
    expect(kaynak).toMatch(/kosuldu\.current/);
    expect(kaynak).toMatch(/if \(kosuldu\.current\) return;\s*kosuldu\.current = true;/);
  });

  it('F2c govdede sekme SIRRI gider (`tarayiciSirri`), ozet DEGIL', () => {
    expect(kaynak).toMatch(/\/auth\/sso\/degis', \{ kod, tarayiciSirri: sir \}/);
    expect(kaynak).not.toMatch(/tarayiciBagi/);
  });

  it('F2d sir YOKSA istek ATILMAZ ve kullaniciya metin gosterilir', () => {
    expect(kaynak).toMatch(/if \(!kod \|\| !sir\)/);
    expect(kaynak).toContain('Giriş bu sekmede başlatılmadı');
  });

  it('F2e `oturum` dalinda `oturumuYaz` cagrilir ("undefined" token yazilmaz)', () => {
    expect(kaynak).toMatch(/tip === 'oturum'[\s\S]{0,200}oturumuYaz\(data\)/);
  });

  it('F2f katilim dalinda sir SILINMEZ (bilet `katil` cagrisinda gerekli)', () => {
    // `katilim-onayi` dalinda `sirriSil` cagrisi OLMAMALI.
    const dal = kaynak.slice(kaynak.indexOf("tip === 'katilim-onayi'"));
    const dalSonu = dal.slice(0, dal.indexOf('return;'));
    expect(dalSonu).not.toContain('sirriSil()');
  });

  it('F2g `sinandi` + `hesapBaglandi: false` bilgilendirme ile ayar sayfasina doner', () => {
    expect(kaynak).toMatch(/hesapBaglandi === false/);
    expect(kaynak).toMatch(/firma\/ekip\/kurumsal-giris\?sonuc=sinandi/);
    const metinler = kodu(oku('ozellik/firma/kurumsal-giris/kurumsal-giris-metinleri.ts'));
    expect(metinler).toContain('hesabınız bu şirket hesabına bağlanmadı');
  });

  it('F2h sayfa `noindex` ve `no-referrer` tasir', () => {
    expect(kaynak).toContain('name="robots" content="noindex"');
    expect(kaynak).toContain('name="referrer" content="no-referrer"');
  });

  it('F2i ⭐ katilim onayinda IKI AYRI kutu var (pazarlama izni sozlesmeye yedirilmez)', () => {
    expect(kaynak).toMatch(/checked=\{sozlesmeOnayi\}/);
    expect(kaynak).toMatch(/checked=\{ticariIletiOnayi\}/);
    expect(kaynak).toContain('Kullanım Koşulları');
  });
});

describe('F3 — giris ekrani kaynak kapilari', () => {
  const kaynak = kodu(oku('app/login/page.tsx'));

  it('F3a ⭐ kesif `zorunlu` ise PAROLA ALANI ve "Parolami unuttum" CIZILMEZ', () => {
    expect(kaynak).toMatch(/\{!kesif\?\.zorunlu && \(/);
    // Parola blogu ve gonder dugmesi ikisi de kosullu.
    expect((kaynak.match(/\{!kesif\?\.zorunlu && \(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('F3b `kurumsal_hata=<KOD>` sozlukten metne cevrilir ve parametre silinir', () => {
    expect(kaynak).toMatch(/searchParams\.get\('kurumsal_hata'\)/);
    expect(kaynak).toMatch(/kimlikHataMetni\(\{ response: \{ data: \{ kod \} \} \}/);
    expect(kaynak).toMatch(/history\.replaceState\(null, '', '\/login'\)/);
  });

  it('F3c ⭐ `KURUMSAL_GIRIS_ZORUNLU` dali VAR (parola dogruyken gelen 400)', () => {
    expect(kaynak).toContain("=== 'KURUMSAL_GIRIS_ZORUNLU'");
  });

  it('F3d kesif BASARISIZ olursa parola yolu KAPANMAZ (fail-open, bilerek)', () => {
    expect(kaynak).toMatch(/catch \{\s*[\s\S]{0,200}setKesif\(null\);/);
  });

  it('F3e sozlukte kurumsal kodlarin HEPSI var (her kod bir Turkce cumle)', () => {
    const sozluk = oku('ortak/lib/kimlik-hata-metinleri.ts');
    for (const kod of [
      'KURUMSAL_GIRIS_ZORUNLU', 'EPOSTA_UYUSMADI', 'SON_GIRIS_YOLU', 'BAGLANTI_YOK',
      'ALAN_ADI_YOK', 'YENIDEN_GIRIS_GEREKLI', 'PAROLA_HATALI', 'PAROLA_YOK',
      'MISAFIR_HESAP', 'KIRACI_UYUSMADI', 'ALAN_ADI_TANIMSIZ', 'EPOSTA_KANITSIZ',
      'EPOSTA_DOGRULANMAMIS', 'KIMLIK_BASKA_FIRMADA', 'KIMLIK_BASKA_HESAPTA',
      'YONETICI_KURUMSAL_GIRIS_YOK', 'KATILIM_KAPALI', 'SSO_KOD_GECERSIZ',
      'SSO_BILET_GECERSIZ', 'SINAMA_KANITSIZ', 'SINAMA_ALAN_ADI_UYUSMADI',
      'SINAMA_ALAN_ADI_BASKA_FIRMADA', 'DOGRULANMADI', 'ONCE_HESABINIZI_BAGLAYIN',
      'AKIS_GECERSIZ', 'SAGLAYICI_KULLANILAMAZ', 'ISTEMCI_SIRRI_GECERSIZ',
    ]) {
      expect(sozluk).toContain(`${kod}:`);
    }
  });
});

describe('F4 — profil sirket hesabi karti', () => {
  const kaynak = kodu(oku('ozellik/kimlik/SirketHesabiKarti.tsx'));

  it('F4a baglamada PAROLA kutusu var (R1-O3)', () => {
    expect(kaynak).toMatch(/type="password"/);
    expect(kaynak).toMatch(/amac: 'bagla'/);
  });

  it('F4b parolasiz hesapta parola yerine "son 10 dakika" aciklamasi cizilir', () => {
    expect(kaynak).toContain('son 10 dakika içinde şirket hesabınızla giriş yapmış');
  });

  it('F4c parolasiz hesapta "parolası yok" bilgisi gosterilir', () => {
    expect(kaynak).toContain('parolası yok');
  });

  it('F4d ⭐ `EPOSTA_UYUSMADI` ve `SON_GIRIS_YOLU` metinleri sozlukte Turkce', () => {
    const sozluk = oku('ortak/lib/kimlik-hata-metinleri.ts');
    expect(sozluk).toContain('e-posta adresiyle aynı olmalı');
    expect(sozluk).toContain('Önce "Parolamı unuttum" ile bir parola belirleyin');
  });

  it('F4e firmada saglayici YOK ve bagli DEGILSE kart HIC cizilmez', () => {
    expect(kaynak).toMatch(/if \(!kurumsal\.bagli && !saglayiciHazir\) return null;/);
  });
});

describe('F5 — SEO ve hukuki kapilar', () => {
  it('F5a ⭐ `/sso/tamam` HERKESE_ACIK_SAYFALAR da YOK (sitemap/robots disi)', () => {
    const seo = oku('ortak/seo/arama-paylasim.ts');
    expect(seo).not.toContain('/sso');
  });

  it('F5b ⭐ CEREZ BEYANI cumleleri DURUYOR (tasarim bilerek cerezsiz)', () => {
    const metinler = oku('ozellik/hukuki/metinler.ts');
    expect(metinler).toContain('MetaPriceX çerez (cookie) kullanmıyor');
    expect(metinler).toContain('Tarayıcı depolaması (localStorage, sessionStorage): var');
  });

  it('F5c depolama listesinde `mpx_sso_bag` maddesi VAR', () => {
    const metinler = oku('ozellik/hukuki/metinler.ts');
    expect(metinler).toContain('mpx_sso_bag');
    expect(metinler).toContain('dönüşün aynı sekmeden geldiğini doğrulamak');
  });

  it('F5d aydinlatmada kurumsal giris maddesi ve saklama suresi VAR', () => {
    const metinler = oku('ozellik/hukuki/metinler.ts');
    expect(metinler).toContain('Kurumsal giriş işlem kaydı: en fazla 24 saat');
    expect(metinler).toContain('parolanızı hiçbir zaman görmeyiz');
  });

  it('F5e ⭐ hukuki surum ON YUZ ile BACKEND de AYNI', () => {
    const fe = oku('ozellik/hukuki/metinler.ts').match(/HUKUKI_METIN_SURUMU = '([\d-]+)'/)?.[1];
    const be = fs
      .readFileSync(path.join(KOK, '../backend/src/altyapi/auth/hukuki-surum.ts'), 'utf8')
      .match(/HUKUKI_METIN_SURUMU = '([\d-]+)'/)?.[1];
    expect(fe).toBeTruthy();
    expect(be).toBe(fe);
  });
});

describe('F6 — ayar sayfasi kaynak kapilari', () => {
  const kaynak = kodu(oku('app/(protected)/firma/ekip/kurumsal-giris/page.tsx'));

  it('F6a ⭐ istemci anahtari ONCEDEN DOLDURULMAZ (sunucu zaten dondurmuyor)', () => {
    // Form alani yalniz `istemciSirri` durumundan beslenir; `s.istemciSirri`
    // diye bir okuma OLMAMALI (yanit boyle bir alan tasimiyor).
    expect(kaynak).not.toMatch(/saglayici\.istemciSirri[^S]/);
    expect(kaynak).toMatch(/placeholder=\{s\?\.sirVar \?/);
  });

  it('F6b sinama PAROLA ister (R1-O3)', () => {
    expect(kaynak).toMatch(/amac: 'sinama', parola: sinamaParolasi/);
  });

  it('F6c ⭐ sahibin hesabi bagli degilse "zorunlu" anahtari PASIF + gerekce', () => {
    expect(kaynak).toMatch(/disabled=\{s\.durum === 'TASLAK' \|\| \(!s\.zorunlu && !baglıMi\)\}/);
    expect(kaynak).toContain('aksi hâlde siz de giriş yapamazsınız');
  });

  it('F6d silme "SİL" yazdirir', () => {
    expect(kaynak).toMatch(/disabled=\{silOnayi !== 'SİL'\}/);
  });

  it('F6e uye bu adrese gelirse acik metin gorur (403 dali)', () => {
    expect(kaynak).toContain('Bu sayfayı yalnız firma sahibi görebilir');
  });

  it('F6f Entra kurulum yardimi `xms_edov` ADIMINI icerir (yoksa sinama coker)', () => {
    const metinler = oku('ozellik/firma/kurumsal-giris/kurumsal-giris-metinleri.ts');
    expect(metinler).toContain('xms_edov');
    expect(metinler).toContain('Yönetici onayı ver');
    expect(metinler).toContain('"Dahili" seçin');
  });
});

describe('F7 — davet ekrani sirket yolu', () => {
  const kaynak = kodu(oku('app/davet-kabul/page.tsx'));

  it('F7a `kurumsalGiris.var` ise "Şirket hesabımla katıl" dugmesi cizilir', () => {
    expect(kaynak).toMatch(/kurumsalGiris\?\.var/);
    expect(kaynak).toContain('Şirket hesabımla katıl');
  });

  it('F7b ⭐ `zorunlu` ise parola formu HIC cizilmez (sunucu da 400 doner)', () => {
    expect(kaynak).toMatch(/\{!bilgi\?\.kurumsalGiris\?\.zorunlu && \(/);
  });
});
