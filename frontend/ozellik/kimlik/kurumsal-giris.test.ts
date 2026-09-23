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
// Hesabım sekme kararı (import'suz saf dosya) — F2i için.
import { hesapSekmeleri } from './hesabim/hesabim';

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
    expect(metinler).toContain('hesabın bu şirket hesabına bağlanmadı');
  });

  it('F2i ⭐ `baglandi` Hesabim GUVENLIK sekmesine doner (Sirket hesabi karti orada)', () => {
    // 23.09.2026: Hesabim sekmelere bolundu. `/profile`a donen kisi varsayilan
    // Profil sekmesine duser ve baglantinin kuruldugunu GOREMEZDI.
    expect(kaynak).toContain("router.push('/profile?sekme=guvenlik&kurumsal=baglandi')");
    // Sekme HER IKI rolde var (yoksa `sekmeCoz` Profil'e dusururdu) ve kart orada.
    expect(hesapSekmeleri(true)).toContain('guvenlik');
    expect(hesapSekmeleri(false)).toContain('guvenlik');
    expect(kodu(oku('ozellik/kimlik/hesabim/GuvenlikSekmesi.tsx'))).toContain('<SirketHesabiKarti');
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
  // 23.09.2026: sayfa Ekip sayfasinin ikinci tasarimiyla yeniden yazildi
  // (uc adim, anahtarlar, bildirimler). Olculen KURALLAR ayni; oncullerin
  // cumledeki bicimi degisti (`disabled` → `pasif`, "siz" → "sen").
  const kaynak = kodu(oku('app/(protected)/firma/ekip/kurumsal-giris/page.tsx'));

  it('F6a ⭐ istemci anahtari ONCEDEN DOLDURULMAZ (sunucu zaten dondurmuyor)', () => {
    // Form alani yalniz `istemciSirri` durumundan beslenir; `s.istemciSirri`
    // diye bir okuma OLMAMALI (yanit boyle bir alan tasimiyor).
    expect(kaynak).not.toMatch(/saglayici\.istemciSirri[^S]/);
    expect(kaynak).toMatch(/placeholder=\{s\?\.sirVar \?/);
    expect(kaynak).toMatch(/value=\{istemciSirri\}/);
  });

  it('F6a2 ⭐ tarayici anahtar alanina KAYITLI PAROLAYI yazamaz (23.09 canli ekranda goruldu)', () => {
    // Duz `type="password"` sayfayi giris formu sandiriyor ve istemci kimligine
    // e-postayi, anahtara MetaPriceX parolasini dolduruyordu.
    const anahtar = kaynak.slice(kaynak.indexOf('id="istemci-anahtari"'), kaynak.indexOf('value={istemciSirri}'));
    expect(anahtar).toContain('type="password"');
    expect(anahtar).toContain('autoComplete="new-password"');
    expect(anahtar).toContain('{...YONETICI_YOK}');
    const kimlik = kaynak.slice(kaynak.indexOf('id="istemci-kimligi"'), kaynak.indexOf('value={clientId}'));
    expect(kimlik).toContain('autoComplete="off"');
    expect(kimlik).toContain('{...YONETICI_YOK}');
    expect(kaynak).toContain("const YONETICI_YOK = { 'data-1p-ignore': true, 'data-lpignore': 'true'");
    // Sinama parolasi KENDI formunda ve gercek parola alanidir.
    expect(kaynak).toMatch(/<form onSubmit=\{sina\}>/);
    expect(kaynak).toContain('autoComplete="current-password"');
  });

  it('F6b sinama PAROLA ister (R1-O3)', () => {
    expect(kaynak).toMatch(/amac: 'sinama', parola: sinamaParolasi/);
    expect(kaynak).toMatch(/disabled=\{islemde \|\| sinamaParolasi === ''\}/);
  });

  it('F6c ⭐ yoneticinin hesabi bagli degilse "parolayla girisi kapat" PASIF + gerekce', () => {
    expect(kaynak).toMatch(/pasif=\{islemde \|\| !etkin \|\| \(!s\.zorunlu && !bagliMi\)\}/);
    expect(kaynak).toContain('aksi hâlde sen de giriş yapamazsın');
    // 23.09: Hesabim sekmeli — "Sirket hesabi" karti GUVENLIK sekmesinde; uyari oraya BAGLANIR.
    expect(kaynak).toContain('href={HESABIM_GUVENLIK_ADRESI}');
    const metinler = oku('ozellik/firma/kurumsal-giris/kurumsal-giris-metinleri.ts');
    expect(metinler).toContain("export const HESABIM_GUVENLIK_ADRESI = '/profile?sekme=guvenlik';");
    expect(metinler).toContain('Hesabım → Güvenlik → Şirket hesabı');
  });

  it('F6c2 ⭐ acma TEK anahtarda; alt anahtarlar yalniz ACIK ayarda (eski sayfa kendiliginden acardi)', () => {
    // Ana anahtar sunucunun DOGRULANMADI kuraliyla ayni kosulda pasif.
    expect(kaynak).toMatch(/pasif=\{islemde \|\| \(!etkin && !acilabilir\)\}/);
    expect(kaynak).toContain('const acilabilir = acilabilirMi(s);');
    // Katilim anahtari acik olmayan ayarda cagri URETMEZ.
    expect(kaynak).toMatch(/etiket="Yeni çalışanlar kendiliğinden katılsın"\s*pasif=\{islemde \|\| !etkin\}/);
  });

  it('F6c3 ⭐ kapatma ve zorunlu kilma ONCE SORULUR (kapatma parolasiz uyelere e-posta gonderir)', () => {
    const kapat = kaynak.slice(kaynak.indexOf('async function girisiDegistir'), kaynak.indexOf('async function zorunluDegistir'));
    expect(kapat.indexOf('await confirm(')).toBeGreaterThan(-1);
    expect(kapat.indexOf('await confirm(')).toBeLessThan(kapat.indexOf("api.post('/firma/kurumsal-giris/kapat')"));
    expect(kapat).toContain('if (!onay) return;');
    const zorunlu = kaynak.slice(kaynak.indexOf('async function zorunluDegistir'), kaynak.indexOf('function sil()'));
    expect(zorunlu).toMatch(/if \(yeni\) \{\s*const onay = await confirm\(/);
  });

  it('F6d silme "SİL" yazdirir', () => {
    expect(kaynak).toMatch(/disabled=\{islemde \|\| silOnayi !== 'SİL'\}/);
    expect(kaynak).toContain("{ data: { onay: silOnayi } }");
  });

  it('F6e uye bu adrese gelirse acik metin gorur (403 dali)', () => {
    expect(kaynak).toContain('Bu sayfayı yalnız firma yöneticisi görebilir');
    expect(kaynak).toMatch(/e\?\.response\?\.status === 403\) setYetkisiz\(true\)/);
  });

  it('F6f Entra kurulum yardimi `xms_edov` ADIMINI icerir (yoksa sinama coker)', async () => {
    // ⚠ 23.09 MUTASYONLA ONARILDI: bu kapi eskiden dosyanin HAM metnini
    // okuyordu; `xms_edov` dosya basindaki YORUMDA da gectigi icin adim
    // silinse bile yesil kaliyordu (K16 yasadi). Artik ekranda cizilen DIZI.
    const m = await import('../firma/kurumsal-giris/kurumsal-giris-metinleri');
    const entra = m.ENTRA_ADIMLARI.join('\n');
    expect(entra).toContain('"email" ve "xms_edov" isteğe bağlı taleplerini EKLE');
    expect(entra).toContain('Yönetici onayı ver');
    expect(m.GOOGLE_ADIMLARI.join('\n')).toContain('"Dahili" seç');
  });

  it('F6g sonuc bildirim ile; eski koyu tema siniflari KALMADI', () => {
    expect(kaynak).toContain("import { toast } from '@/ortak/hooks/use-toast';");
    expect(kaynak).not.toMatch(/\balert\(|window\.confirm\(/);
    for (const d of [
      'app/(protected)/firma/ekip/kurumsal-giris/page.tsx',
      'ozellik/firma/kurumsal-giris/kurumsal-giris-parcalari.tsx',
    ]) {
      const k = kodu(oku(d));
      expect(k, d).not.toMatch(/text-slate-(?:100|200|300)\b/);
      expect(k, d).not.toMatch(/bg-slate-9(?:00|50)(?![/\d])/);
      expect(k, d).not.toMatch(/-950\//);
    }
  });
});

describe('F8 — ayar sayfasi saf kararlari (kurulum ilerlemesi)', () => {
  it('F8a uc adim: kaydet → sina → ac; sunucu durumundan', async () => {
    const m = await import('../firma/kurumsal-giris/kurumsal-giris-metinleri');
    expect(m.kurulumIlerlemesi(null).map((a) => a.tamam)).toEqual([false, false, false]);
    expect(m.kurulumIlerlemesi({ durum: 'TASLAK', dogrulanmisAlanAdlari: [] }).map((a) => a.tamam)).toEqual([true, false, false]);
    expect(m.kurulumIlerlemesi({ durum: 'DOGRULANDI', dogrulanmisAlanAdlari: [{}] }).map((a) => a.tamam)).toEqual([true, true, false]);
    expect(m.kurulumIlerlemesi({ durum: 'ETKIN', dogrulanmisAlanAdlari: [{}] }).map((a) => a.tamam)).toEqual([true, true, true]);
    // Kapatilan ayar yeniden ACILABILIR (alan adlari durur), ama "Ac" adimi tamam degildir.
    expect(m.kurulumIlerlemesi({ durum: 'KAPALI', dogrulanmisAlanAdlari: [{}] }).map((a) => a.tamam)).toEqual([true, true, false]);
  });

  it('F8b ⭐ acilabilirMi sunucunun DOGRULANMADI kuraliyla ayni: TASLAK ya da dogrulanmis alan adi YOK → hayir', async () => {
    const m = await import('../firma/kurumsal-giris/kurumsal-giris-metinleri');
    expect(m.acilabilirMi(null)).toBe(false);
    expect(m.acilabilirMi({ durum: 'TASLAK', dogrulanmisAlanAdlari: [{}] })).toBe(false);
    expect(m.acilabilirMi({ durum: 'DOGRULANDI', dogrulanmisAlanAdlari: [] })).toBe(false);
    expect(m.acilabilirMi({ durum: 'KAPALI', dogrulanmisAlanAdlari: [{}] })).toBe(true);
  });

  it('F8c anahtar suresi 14 gunden az kaldiysa uyari; alan adlari virgulle ayrilir', async () => {
    const m = await import('../firma/kurumsal-giris/kurumsal-giris-metinleri');
    const simdi = Date.parse('2026-09-23T00:00:00Z');
    expect(m.sirBitisYakinMi('2026-10-01T00:00:00Z', simdi)).toBe(true);
    expect(m.sirBitisYakinMi('2026-12-01T00:00:00Z', simdi)).toBe(false);
    expect(m.sirBitisYakinMi(null, simdi)).toBe(false);
    expect(m.alanAdlariniAyir(' firma.com.tr, ,firma.com ')).toEqual(['firma.com.tr', 'firma.com']);
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
