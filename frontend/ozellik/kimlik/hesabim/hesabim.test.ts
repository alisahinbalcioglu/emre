/**
 * HESABIM (23.09.2026 tasarımı) — saf kararlar + EKRANA BAĞLANTI.
 *
 * ⚠ İKİ AYAK: (1) karar doğru mu, (2) ekran bu kararı gerçekten kullanıyor mu.
 * Bu depoda ölçülmüş hata sınıfı "mekanizma var, bağlantı yok": fonksiyon
 * doğru, çağıran yok. Bağlantı kapıları bu yüzden kodu (yorumsuz) okur.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SEKME_ADI,
  VARSAYILAN_SEKME,
  basHarfler,
  capadanSekme,
  firmaTuruCoz,
  gorunenAd,
  hesapSekmeleri,
  kimlikGovdesi,
  sekmeAdresi,
  sekmeCoz,
  silinecekKimlikUyarisi,
  type HesapSekmesi,
} from './hesabim';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  IZIN_SIRASI,
  IZIN_TANIMLARI,
  izinSatirlari,
  type IzinSatiri,
  type IzinTanimi,
} from '../../firma/ekip/izin-metinleri';
import { IZIN_ROZETI_ACIK, IZIN_ROZETI_KAPALI } from '../../firma/ekip/ekip-parcalari';
import { IzinDurumListesi } from './IzinDurumListesi';

const KOK = path.join(__dirname, '../../..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');
/** Yorumları at: kapı YORUMDA değil KODDA eşleşsin. */
const kodu = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SAYFA = 'app/(protected)/profile/page.tsx';
const H = 'ozellik/kimlik/hesabim';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · SEKMELER
// ─────────────────────────────────────────────────────────────────────────────
describe('sekmeler — kim neyi görür', () => {
  it('firma sahibi: tasarımdaki beş sekme, tasarımdaki sırayla', () => {
    expect(hesapSekmeleri(true)).toEqual(['profil', 'firma', 'abonelik', 'guvenlik', 'veriler']);
  });

  it('⭐ alt kullanıcı firma, abonelik ve faturayı GÖRMEZ', () => {
    const uye = hesapSekmeleri(false);
    expect(uye).not.toContain('firma');
    expect(uye).not.toContain('abonelik');
    expect(uye).toContain('erisim');
  });

  it('⭐⭐ KVKK: "Veriler" (indir + hesabımı kapat) İKİ ROLDE DE var', () => {
    // Tasarımdan BİLEREK sapma (gerekçe `hesabim.ts` → UYE_SEKMELERI):
    // indirme ve kapatma KİŞİNİN hakkıdır, firmanın değil.
    expect(hesapSekmeleri(true)).toContain('veriler');
    expect(hesapSekmeleri(false)).toContain('veriler');
  });

  it('alt kullanıcı: Profil · Ekip erişimim · Güvenlik · Veriler', () => {
    expect(hesapSekmeleri(false)).toEqual(['profil', 'erisim', 'guvenlik', 'veriler']);
  });

  it('varsayılan sekme Profil ve iki listenin de İLK sekmesi', () => {
    expect(VARSAYILAN_SEKME).toBe('profil');
    expect(hesapSekmeleri(true)[0]).toBe('profil');
    expect(hesapSekmeleri(false)[0]).toBe('profil');
  });

  it('her sekmenin Türkçe adı var (tasarımdaki yazım)', () => {
    expect(SEKME_ADI).toEqual({
      profil: 'Profil',
      firma: 'Firma',
      abonelik: 'Abonelik',
      guvenlik: 'Güvenlik',
      veriler: 'Veriler',
      erisim: 'Ekip erişimim',
    });
  });
});

describe('sekmeCoz — adresteki `?sekme=`', () => {
  const SAHIP = hesapSekmeleri(true);
  const UYE = hesapSekmeleri(false);

  it('görünen sekme aynen açılır', () => {
    for (const s of SAHIP) expect(sekmeCoz(s, SAHIP)).toBe(s);
    for (const s of UYE) expect(sekmeCoz(s, UYE)).toBe(s);
  });

  it('⭐ üyeye gönderilen `?sekme=abonelik` sahibin ekranını AÇMAZ', () => {
    expect(sekmeCoz('abonelik', UYE)).toBe('profil');
    expect(sekmeCoz('firma', UYE)).toBe('profil');
  });

  it('sahibe `?sekme=erisim` (üye ekranı) açılmaz', () => {
    expect(sekmeCoz('erisim', SAHIP)).toBe('profil');
  });

  it('tanınmayan / boş değer varsayılana düşer', () => {
    for (const ham of [null, undefined, '', 'Firma', 'guvenlık', '__proto__', 'constructor']) {
      expect(sekmeCoz(ham, SAHIP), String(ham)).toBe('profil');
    }
  });

  it('⭐ adres gidiş-dönüş: `sekmeAdresi` → `?sekme=` → aynı sekme', () => {
    for (const s of [...SAHIP, ...UYE]) {
      const adres = new URL(sekmeAdresi(s), 'https://x.test');
      expect(adres.pathname).toBe('/profile');
      const sekmeler = SAHIP.includes(s) ? SAHIP : UYE;
      expect(sekmeCoz(adres.searchParams.get('sekme'), sekmeler), s).toBe(s);
    }
  });

  it('varsayılan sekmenin adresi sorgusuz', () => {
    expect(sekmeAdresi('profil')).toBe('/profile');
    expect(sekmeAdresi('firma')).toBe('/profile?sekme=firma');
  });
});

describe('capadanSekme — sekmelerden önce yazılmış bağlantılar', () => {
  it('⭐ `#hesabi-kapat` → Veriler (Ekip sayfasının üyeye verdiği bağlantı)', () => {
    expect(capadanSekme('#hesabi-kapat')).toBe('veriler');
    expect(capadanSekme('hesabi-kapat')).toBe('veriler');
  });

  it('tanınmayan çapa → null (nesne önekleri dahil)', () => {
    for (const c of ['', '#', '#firma', null, undefined, '#constructor', 'toString', '__proto__']) {
      expect(capadanSekme(c), String(c)).toBeNull();
    }
  });

  it('⭐ ÖLÇÜT: Ekip sayfası bu bağlantıyı HÂLÂ veriyor (çapa ölü değil)', () => {
    expect(kodu(oku('app/(protected)/firma/ekip/page.tsx'))).toContain('/profile#hesabi-kapat');
  });

  it('⭐ erişimi durdurulmuş hesabın "verilerim" bağlantısı Veriler sekmesini açar', () => {
    // KVKK hakkı ödeme durumuna bağlanamaz; bağlantı Profil'e düşseydi kişi
    // indirme düğmesini aramak zorunda kalırdı.
    const kapi = kodu(oku('ozellik/odeme/ErisimKapisi.tsx'));
    expect(kapi).toContain('href="/profile?sekme=veriler"');
    const adres = new URL('/profile?sekme=veriler', 'https://x.test');
    for (const sahip of [true, false]) {
      expect(sekmeCoz(adres.searchParams.get('sekme'), hesapSekmeleri(sahip))).toBe('veriler');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · KİMLİK SATIRI
// ─────────────────────────────────────────────────────────────────────────────
describe('kimlik satırı', () => {
  it('ad ve soyad girilmişse onlar yazılır', () => {
    expect(gorunenAd({ email: 'emre@x.com', ad: 'Emre', soyad: 'Başaran' })).toBe('Emre Başaran');
    expect(gorunenAd({ email: 'emre@x.com', ad: 'Emre', soyad: null })).toBe('Emre');
  });

  it('ad yoksa (ya da yalnız boşluksa) e-postanın @ öncesi', () => {
    expect(gorunenAd({ email: 'emre.basarann1@gmail.com' })).toBe('emre.basarann1');
    expect(gorunenAd({ email: 'a@b.com', ad: '   ', soyad: '' })).toBe('a');
  });

  it('⭐ baş harfler Türkçe büyütülür ("i" → "İ", "ı" → "I")', () => {
    expect(basHarfler({ email: 'x@y.com', ad: 'ilker', soyad: 'ışık' })).toBe('İI');
    expect(basHarfler({ email: 'irem@y.com' })).toBe('İ');
  });

  it('ad varsa iki harf, soyad yoksa bir harf, ad yoksa e-postanın ilki', () => {
    expect(basHarfler({ email: 'z@y.com', ad: 'Ayşe', soyad: 'Teknik' })).toBe('AT');
    expect(basHarfler({ email: 'z@y.com', ad: 'Ayşe' })).toBe('A');
    expect(basHarfler({ email: 'emre@y.com', ad: ' ', soyad: 'Kaya' })).toBe('E');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · FATURA KİMLİĞİ
// ─────────────────────────────────────────────────────────────────────────────
describe('firma türü — şirket / şahıs şirketi', () => {
  it('yalnız T.C. kimlik no doluysa şahıs şirketi', () => {
    expect(firmaTuruCoz({ vergiNo: null, tcKimlikNo: '12345678901' })).toBe('sahis');
    expect(firmaTuruCoz({ vergiNo: '  ', tcKimlikNo: '12345678901' })).toBe('sahis');
  });

  it('⭐ İKİSİ DE doluysa ŞİRKET — fatura adaptörü vergi numarasını önce okur', () => {
    expect(firmaTuruCoz({ vergiNo: '1234567890', tcKimlikNo: '12345678901' })).toBe('sirket');
    // Ölçüt: adaptör gerçekten `vergiNo ?? tcKimlikNo` okuyor.
    const adaptor = kodu(oku('../backend/src/ozellik/odeme/fatura/muhasebe.adaptor.ts'));
    expect(adaptor).toContain('m.vergiNo ?? m.tcKimlikNo');
  });

  it('hiçbiri yoksa şirket (tasarımın varsayılanı)', () => {
    expect(firmaTuruCoz({})).toBe('sirket');
    expect(firmaTuruCoz({ vergiNo: '1234567890' })).toBe('sirket');
  });

  it('⭐ kaydedilen gövde: seçilmeyen numara BOŞ gider (fatura ekranda seçileni kullansın)', () => {
    const deger = { vergiNo: '1234567890', tcKimlikNo: '12345678901' };
    expect(kimlikGovdesi('sirket', deger)).toEqual({ vergiNo: '1234567890', tcKimlikNo: '' });
    expect(kimlikGovdesi('sahis', deger)).toEqual({ vergiNo: '', tcKimlikNo: '12345678901' });
  });

  it('ÖLÇÜT: sunucu boş dizeyi TEMİZLER (gövdedeki "" gerçekten siler)', () => {
    const servis = kodu(oku('../backend/src/ozellik/firma/firma.servisi.ts'));
    expect(servis).toContain("veri[alan] = kirpik === '' ? null : kirpik;");
  });

  it('⭐ kayıtlı numara silinecekse ÖNCEDEN söylenir; silinmeyecekse susulur', () => {
    expect(silinecekKimlikUyarisi('sirket', { tcKimlikNo: '12345678901' })).toContain('T.C. kimlik no silinir');
    expect(silinecekKimlikUyarisi('sahis', { vergiNo: '1234567890' })).toContain('vergi no silinir');
    expect(silinecekKimlikUyarisi('sirket', { vergiNo: '1234567890' })).toBeNull();
    expect(silinecekKimlikUyarisi('sahis', { tcKimlikNo: '12345678901' })).toBeNull();
    expect(silinecekKimlikUyarisi('sirket', { tcKimlikNo: '   ' })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · BAĞLANTI — ekran bu kararları kullanıyor
// ─────────────────────────────────────────────────────────────────────────────
describe('⭐ BAĞLANTI — Hesabım sayfası', () => {
  const sayfa = kodu(oku(SAYFA));

  it('sekme listesi FAIL-CLOSED sahiplikten ve tek karardan', () => {
    expect(sayfa).toContain("const sahipMi = profile.firmaRol === 'sahip';");
    expect(sayfa).toContain('const sekmeler = hesapSekmeleri(sahipMi);');
    expect(sayfa).not.toMatch(/firmaRol \?\? 'sahip'/);
  });

  it('açık sekme ADRESTEN çözülür, çapa yalnız yedek', () => {
    expect(sayfa).toContain("sekmeCoz(arama.get('sekme') ?? capaSekmesi, sekmeler)");
    expect(sayfa).toContain('capadanSekme(window.location.hash)');
    expect(sayfa).toContain('router.replace(sekmeAdresi(sekme)');
  });

  it('⭐ her sekme YALNIZ kendi kartını taşır (bire bir eşleme)', () => {
    const esleme: Record<HesapSekmesi, string> = {
      profil: '<ProfilSekmesi',
      firma: '<FirmaSekmesi',
      abonelik: '<AbonelikSekmesi',
      guvenlik: '<GuvenlikSekmesi',
      veriler: '<VerilerSekmesi',
      erisim: '<EkipErisimiSekmesi',
    };
    for (const [sekme, bilesen] of Object.entries(esleme)) {
      expect(sayfa, sekme).toMatch(new RegExp(`\\b${sekme}: \\(\\) => \\(?\\s*${bilesen}\\b`));
      // Aynı bileşen ikinci bir yerde (koşulsuz) çizilmiyor.
      expect(sayfa.split(bilesen).length - 1, sekme).toBe(1);
    }
  });

  it('⭐ paneller YALNIZ kişinin sekme listesinden çizilir (sahibin kartı üyeye sızmaz)', () => {
    // Üyenin listesinde firma/abonelik yok → o kartlar üyede HİÇ mount edilmez.
    expect(sayfa).toMatch(/\{sekmeler\s*\.filter\(\(s\) => s === aktifSekme \|\| acilanlar\.has\(s\)\)\s*\.map\(\(s\) => \(/);
    expect(sayfa).toContain('{PANEL[s]()}');
    expect(sayfa.split('PANEL[').length - 1).toBe(1);
  });

  it('⭐ açılmış sekme SÖKÜLMEZ, gizlenir (kurtarma kodları, yazılmış form kaybolmasın)', () => {
    // Kod incelemesi ölçtü: yalnız etkin sekme çizildiğinde MFA kurulumu
    // ortasında sekme değişince kurtarma kodları bir daha gösterilmeden
    // kayboluyordu.
    expect(sayfa).toContain('setAcilanlar((onceki) => new Set(onceki).add(aktifSekme).add(sekme));');
    expect(sayfa).toContain('hidden={s !== aktifSekme}');
    // `hidden` özniteliği `.flex`e yenilir; gizleme sınıfla da yapılıyor.
    expect(sayfa).toContain("className={s === aktifSekme ? 'flex flex-col gap-5' : 'hidden'}");
  });

  it('⭐ iki adımlı giriş: kurulum onayı profili HEMEN tazeler, kodlar ekranı SIFIRLANMAZ', () => {
    // Kod incelemesi ölçtü: tazeleme "Tamam"a bırakılınca kişi kodlar
    // ekrandayken sayfayı yenilerse kart "Kapalı · Aç" diyor, "Aç"
    // `MFA_ZATEN_ACIK` veriyordu.
    const kart = kodu(oku('ozellik/kimlik/IkiAdimliGirisKarti.tsx'));
    const dilim = (bas: string, son: string) => {
      const i = kart.indexOf(bas);
      const j = kart.indexOf(son, i + 1);
      expect(i, bas).toBeGreaterThan(-1);
      expect(j, son).toBeGreaterThan(i);
      return kart.slice(i, j);
    };
    const onayla = dilim('const onayla = () =>', 'const kapat = () =>');
    expect(onayla).toContain("setAdim('kodlar');");
    expect(onayla).toContain('onYenile();');
    expect(dilim('const kodlariYenile = () =>', 'const sirketGirisindeDeSor')).toContain('onYenile();');
    // Tazelenen profil kartın adımını EZMEMELİ: adım yalnız ilk açılışta
    // `mfa.acik`tan türer. `mfa`yı izleyen bir eşitleme kodlar ekranını
    // (bir kez gösterilir) tazelemeyle birlikte silerdi.
    expect(kart).toContain("useState<Adim>(mfa.acik ? 'acik' : 'kapali')");
    expect(kart).not.toMatch(/useEffect\(/);
    // Sayfadaki tazeleme yükleme durumuna girmez (girseydi TÜM sekmeler sökülürdü).
    expect(sayfa).toContain(
      "api.get<HesapProfili>('/auth/me').then(({ data }) => setProfile(data)).catch(() => {});",
    );
  });

  it('WAI-ARIA sekme deseni: tablist/tab/tabpanel + seçili sekme Tab sırasında', () => {
    expect(sayfa).toContain('role="tablist"');
    expect(sayfa).toContain('role="tab"');
    expect(sayfa).toContain('role="tabpanel"');
    expect(sayfa).toContain('aria-selected={secili}');
    expect(sayfa).toContain('tabIndex={secili ? 0 : -1}');
  });

  it('kimlik satırı adı ve baş harfleri saf fonksiyondan basar', () => {
    expect(sayfa).toContain('{gorunenAd(profile)}');
    expect(sayfa).toContain('{basHarfler(profile)}');
    // Eski kapak (mavi gradyan) KALKTI.
    expect(sayfa).not.toContain('bg-gradient-to-r');
  });

  it('⭐ toplam teklif başlıktan: sayfalı listenin UZUNLUĞU sayılmıyor', () => {
    expect(sayfa).toContain("r.headers?.['x-toplam-kayit']");
    expect(sayfa).toContain("api.get<unknown>('/quotes', { params: { adet: 1 } })");
    expect(sayfa).not.toMatch(/quotesRes\.data\.length/);
    // Ölçüt: uç gerçekten sayfalı ve toplamı başlıkta veriyor.
    const ctrl = kodu(oku('../backend/src/ozellik/teklif/quotes/quotes.controller.ts'));
    expect(ctrl).toContain("yanit.setHeader('X-Toplam-Kayit', String(toplam));");
  });
});

describe('⭐ BAĞLANTI — Firma sekmesi', () => {
  const firma = kodu(oku(`${H}/FirmaSekmesi.tsx`));

  it('fatura kaydı kimlik gövdesini SAF fonksiyondan kurar', () => {
    expect(firma).toContain('...kimlikGovdesi(tur, { vergiNo, tcKimlikNo })');
    expect(firma).toContain('silinecekKimlikUyarisi(tur, f ?? {})');
    expect(firma).toContain('firmaTuruCoz(f ?? {})');
  });

  it('⭐ her kart YALNIZ kendi alanlarını gönderir', () => {
    expect(firma).toContain("api.patch('/firma', { ad: firmaAd.ad, telefon: firmaAd.telefon })");
    // Fatura kartının durumu (ve gönderdiği gövde) görünen adı ve telefonu TAŞIMAZ.
    const bas = firma.indexOf('const [fatura, setFatura] = useState({');
    const durum = firma.slice(bas, firma.indexOf('const [faturaKaydediliyor', bas));
    expect(durum, 'fatura durumu bulunamadı').toContain('unvan:');
    expect(durum).not.toMatch(/\bad:|telefon:/);
    expect(firma).toMatch(/await api\.patch\('\/firma', \{\s*\.\.\.digerleri,[\s\S]{0,200}\.\.\.kimlikGovdesi\(tur, \{ vergiNo, tcKimlikNo \}\),\s*\}\);/);
  });

  it('⭐ boş fatura e-postası `null` gider — boş dize DTO\'dan DÖNER', () => {
    // 23.09 ölçüldü (class-validator): `faturaEposta: ''` → 400 "Fatura e-posta
    // adresi gecerli degil."; `null` → geçerli. Fatura e-postası girilmemiş
    // firma kartı eskiden HİÇ kaydedilemiyordu.
    expect(firma).toContain('faturaEposta: faturaEposta.trim() || null,');
    const dto = kodu(oku('../backend/src/ozellik/firma/dto/firma-guncelle.dto.ts'));
    // Öncül: e-posta alanı hâlâ `@IsOptional` + `@IsEmail` (null atlanır, '' reddedilir).
    expect(dto).toMatch(/@IsOptional\(\)\s*@IsEmail\([^)]*\{ message: 'Fatura e-posta adresi gecerli degil\.' \}\)/);
    // Servis null'ı YAZAR (alan temizlenir), yalnız `undefined`ı atlar.
    const servis = kodu(oku('../backend/src/ozellik/firma/firma.servisi.ts'));
    expect(servis).toContain('if (deger === undefined) continue;');
  });

  it('⭐ logo önizlemesi OTURUMLU istekle (düz `<img src="/api…">` 401 alıyordu)', () => {
    expect(firma).toMatch(/\.get<Blob>\('\/firma\/logo', \{ responseType: 'blob' \}\)/);
    expect(firma).toContain('URL.revokeObjectURL(olusturulan)');
    expect(firma).not.toMatch(/src=\{`[^`]*\/firma\/logo/);
    // Ölçüt: sunucu kimliği YALNIZ Authorization başlığından okuyor.
    const strateji = kodu(oku('../backend/src/altyapi/auth/strategies/jwt.strategy.ts'));
    expect(strateji).toContain('ExtractJwt.fromAuthHeaderAsBearerToken()');
  });

  it('⭐ antet ölçümü: görünen ad antete GİRMİYOR, telefon ve logo giriyor', () => {
    const antet = kodu(oku('../backend/src/ozellik/cikti/utils/antet.ts'));
    const bas = antet.indexOf('export const ANTET_FIRMA_ALANLARI');
    const alanlar = antet.slice(bas, antet.indexOf('} as const', bas));
    expect(alanlar, 'antet alan listesi bulunamadı').toMatch(/\bunvan: true/);
    expect(alanlar).toMatch(/\btelefon: true/);
    expect(alanlar).toMatch(/\blogoBytes: true/);
    expect(alanlar).not.toMatch(/\bad: true/);
    // Kart açıklaması bu ölçümle aynı şeyi söylüyor.
    expect(firma).toContain('Görünen ad e-postalarda ve ekip davetlerinde; telefon ve logo teklif çıktısının antedinde kullanılır.');
  });

  it('WEBP antete basılmıyor ve ipucu bunu söylüyor', () => {
    expect(kodu(oku('../backend/src/ozellik/cikti/utils/antet.ts'))).toContain("mime === 'image/webp'");
    expect(firma).toContain('(WEBP teklif çıktısına basılmaz)');
  });
});

describe('⭐ BAĞLANTI — Veriler sekmesi metni ürünle çelişmiyor', () => {
  const veriler = kodu(oku(`${H}/VerilerSekmesi.tsx`));
  const disaAktarim = oku('../backend/src/altyapi/auth/hesap.servisi.ts');

  it('ÖLÇÜT: dışa aktarım kütüphaneyi BİLEREK dışarıda bırakıyor', () => {
    expect(disaAktarim).toContain("'Malzeme kutuphaneniz, kutuphane listeleriniz");
    expect(disaAktarim).toContain("'dosyada YER ALMAZ.");
  });

  it('⭐ ekran kütüphaneyi VAAT ETMİYOR, dışarıda olduğunu söylüyor', () => {
    expect(veriler).not.toMatch(/kütüphaneniz[^.]*dahildir/);
    expect(veriler).toContain('Malzeme kütüphaneniz ve fiyat listeleriniz kişisel veri olmadığı için dosyaya girmez.');
  });

  it('üyenin dosyasında ticari kayıt yok — ekran da öyle söylüyor', () => {
    expect(disaAktarim).toContain('firmanın ticari kayıtları (abonelik, ödeme, ');
    expect(veriler).toContain('Firmanın abonelik ve fatura kayıtları firma sahibinin dosyasındadır.');
  });
});

describe('⭐ BAĞLANTI — Ekip erişimim sekmesi: dört izin satırı', () => {
  const sekme = kodu(oku(`${H}/EkipErisimiSekmesi.tsx`));

  it('⭐ izinler SAĞLAYICIDAN (aynı `/auth/me` yanıtı) — ayrı istek yok', () => {
    expect(sekme).toContain("import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';");
    expect(sekme).toContain('const { izinler } = useCapabilities();');
    expect(sekme).not.toMatch(/['"`]\/auth\/me['"`]/);
  });

  it('⭐ TEK karar: `izinSatirlari` BİR kez, sağlayıcının listesi AYNEN verilerek', () => {
    expect(sekme).toContain("import { izinSatirlari } from '@/ozellik/firma/ekip/izin-metinleri';");
    // Sözlükten ikinci bir içe aktarma (ör. `IZIN_TANIMLARI`) yok: satırlar elle kurulamaz.
    expect(sekme.split("from '@/ozellik/firma/ekip/izin-metinleri'").length - 1).toBe(1);
    // `izinSatirlari(izinler ?? [])` ya da ikinci bir çağrı eski sunucuda
    // "dördü kapalı" diye YANLIŞ bir beyan çizerdi (kod incelemesi ölçtü).
    expect(sekme.split('izinSatirlari(').length - 1).toBe(1);
    expect(sekme).toContain('const satirlar = izinSatirlari(izinler);');
  });

  it('⭐ satırları sekme ÇİZMEZ: liste bileşeni BİR kez, aynı kararla', () => {
    expect(sekme).toContain("import { IzinDurumListesi } from './IzinDurumListesi';");
    // Takma adlı ikinci bir içe aktarma (`as L`) sayımı atlatamasın.
    expect(sekme.split("from './IzinDurumListesi'").length - 1).toBe(1);
    expect(sekme.split('<IzinDurumListesi').length - 1).toBe(1);
    expect(sekme).toContain('<IzinDurumListesi satirlar={satirlar} etiketId="erisim-aciklama" />');
    // Sekmedeki tek döngü yönetici kutusu: satır çizen ikinci bir `.map(` yok.
    expect(sekme.split('.map(').length - 1).toBe(1);
    expect(sekme).toContain('yonetici.yoneticiler.map(');
    expect(sekme).not.toMatch(/'Açık'|'Kapalı'/);
  });

  it('⭐ İKİNCİ SÖZLÜK YOK: izin metni, anahtarı ve simgesi sekmede elle yazılmamış', () => {
    for (const t of IZIN_TANIMLARI) {
      for (const m of [t.baslik, t.aciklama, t.kapaliAciklamasi]) {
        if (m) expect(sekme, `${t.anahtar}: ${m}`).not.toContain(m);
      }
    }
    // Elle kurulan (ya da yeniden yazılan) her sözlük izin adını anmak zorunda.
    expect(sekme).not.toMatch(/\b(excel|dwg|firmaTeklifleri|kutuphane)\b/i);
    expect(sekme).not.toMatch(/\b(FileSpreadsheet|Ruler|Banknote|BookOpen|IZIN_SIMGELERI)\b/);
  });

  it('⭐ giriş cümlesi AYNI karardan: liste varsa yeni, null ise ESKİ; liste onu adıyla anar', () => {
    expect(sekme).toMatch(
      /\{satirlar\s*\?\s*'Hangi bölümleri görebileceğinizi firma yöneticiniz belirler\.'\s*:\s*'Firma bilgilerini, aboneliği ve faturayı firma yöneticiniz yönetir\.'\s*\}/,
    );
    expect(sekme).toContain('<p id="erisim-aciklama"');
  });

  it('yönetici kuralı TEK yerden: kapalı bölüm sayfasıyla aynı `firmaYoneticileri`', () => {
    expect(sekme).toContain("import { firmaYoneticileri } from '@/ozellik/firma/ekip/kisi-metinleri';");
    expect(sekme).toContain('firmaYoneticileri(data?.uyeler)');
    expect(sekme).not.toContain("firmaRol === 'sahip'");
  });
});

describe('⭐ ÇİZİM — IzinDurumListesi gerçekten çizilir, GÖRÜNEN metni ölçülür', () => {
  const liste = kodu(oku(`${H}/IzinDurumListesi.tsx`));
  const ciz = (satirlar: readonly IzinSatiri[] | null) =>
    renderToStaticMarkup(createElement(IzinDurumListesi, { satirlar, etiketId: 'x-aciklama' }));
  /** Görünen metin: etiketler atılır, boşluk tekilleşir. */
  const metin = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  /** Satır başına bir parça (ilk parça `<ul …>` açılışıdır, atılır). */
  const satirlar = (html: string) => html.split('<li').slice(1).map((p) => `<li${p}`);
  /** Bir satırın BEKLENEN görünen metni: sözlükteki başlık + o durumdaki açıklama + rozet. */
  const beklenen = (t: IzinTanimi, acik: boolean) =>
    `${t.baslik} ${acik ? t.aciklama : (t.kapaliAciklamasi ?? t.aciklama)} ${acik ? 'Açık' : 'Kapalı'}`;
  const EMOJI = new RegExp('\\p{Extended_Pictographic}', 'u');

  it('⭐ null (sunucu söylemedi) → HİÇBİR ŞEY çizilmez', () => {
    expect(ciz(izinSatirlari(null))).toBe('');
  });

  it('⭐ her satırın görünen metni TAM OLARAK sözlük + rozet — fazladan tek sözcük yok', () => {
    const html = ciz(izinSatirlari(['excel', 'kutuphane']));
    const acik = [true, false, false, true];
    const li = satirlar(html);
    expect(li.length).toBe(IZIN_TANIMLARI.length);
    IZIN_TANIMLARI.forEach((t, i) => expect(metin(li[i]), t.anahtar).toBe(beklenen(t, acik[i])));
    // Listenin tamamı yalnız bu satırlardan oluşur (satır dışı başlık/not yok).
    expect(metin(html)).toBe(IZIN_TANIMLARI.map((t, i) => beklenen(t, acik[i])).join(' '));
    // Görünmeyen metin de yok: erişilebilir ad giriş cümlesinden gelir.
    expect(html).not.toMatch(/\s(aria-label|title)=/);
  });

  it('⭐ "Son teklifler" kapalıyken üye YALNIZ KENDİ tekliflerini gördüğünü okur (Emre 23.09)', () => {
    const m = metin(ciz(izinSatirlari([])));
    expect(m).toContain('Son teklifler ve tutarları Yalnız kendi hazırladığı teklifleri görebilir Kapalı');
    expect(m).not.toContain('Firmanın teklif listesini');
  });

  it('boş liste = dördü KAPALI; hepsi açık = dördü AÇIK', () => {
    const kapali = metin(ciz(izinSatirlari([])));
    const acik = metin(ciz(izinSatirlari([...IZIN_SIRASI])));
    expect(kapali.split('Kapalı').length - 1).toBe(4);
    expect(kapali).not.toContain('Açık');
    expect(acik.split('Açık').length - 1).toBe(4);
    expect(acik).not.toContain('Kapalı');
  });

  it('rozet: açık = yeşil + tik, kapalı = gri + kilit', () => {
    const li = satirlar(ciz(izinSatirlari(['excel'])));
    expect(li[0]).toContain(IZIN_ROZETI_ACIK);
    expect(li[0]).toContain('lucide-check');
    expect(li[0]).not.toContain('lucide-lock');
    expect(li[1]).toContain(IZIN_ROZETI_KAPALI);
    expect(li[1]).toContain('lucide-lock');
    expect(li[1]).not.toContain('lucide-check');
  });

  it('simgeler lucide, tasarımdaki sırayla; emoji yok', () => {
    const li = satirlar(ciz(izinSatirlari([])));
    ['lucide-file-spreadsheet', 'lucide-ruler', 'lucide-banknote', 'lucide-book-open'].forEach((s, i) => {
      expect(li[i], s).toContain(s);
    });
    expect(EMOJI.test(ciz(izinSatirlari([...IZIN_SIRASI])))).toBe(false);
  });

  it('liste erişilebilir adını kartın giriş cümlesinden alır', () => {
    expect(ciz(izinSatirlari([]))).toMatch(/^<ul[^>]*\saria-labelledby="x-aciklama"/);
  });

  it('⭐ İKİNCİ SÖZLÜK YOK (kaynak): liste metni yalnız satırdan okur, izin adı anmaz', () => {
    // Aynı metni elle yazan bir sözlük BUGÜN aynı çıktıyı verir; çizim testi
    // onu göremez, sözlük değişince geride kalır. Kaynak bunu ayrıca ölçer.
    expect(liste).toContain('{s.baslik}');
    expect(liste).toContain('{s.aciklama}');
    expect(liste).toContain('const Simge = IZIN_SIMGELERI[s.anahtar];');
    expect(liste).not.toMatch(/\b(excel|dwg|firmaTeklifleri|kutuphane)\b/i);
    for (const t of IZIN_TANIMLARI) {
      for (const m of [t.baslik, t.aciklama, t.kapaliAciklamasi]) {
        if (m) expect(liste, `${t.anahtar}: ${m}`).not.toContain(m);
      }
    }
    // Yalnız göreli import: vitest `@/` çözmüyor, yoksa bu çizim testi kurulamazdı.
    expect(liste).not.toContain("from '@/");
  });

  it('rozet renkleri TEK yerde: Ekip etiketi ve bu liste aynı sabitleri okur', () => {
    const parcalar = kodu(oku('ozellik/firma/ekip/ekip-parcalari.tsx'));
    expect(parcalar).toContain('acik ? IZIN_ROZETI_ACIK : IZIN_ROZETI_KAPALI');
    expect(liste).toContain('s.acik ? IZIN_ROZETI_ACIK : IZIN_ROZETI_KAPALI');
    // Renk KÜMESİ yalnız sabitin tanımında geçer (tek tek renkler başka rozetlerde
    // de kullanılıyor: `#f0fdf4` / `#166534` "Aktif" rozetinde); liste renk yazmaz.
    for (const kume of [IZIN_ROZETI_ACIK, IZIN_ROZETI_KAPALI]) {
      expect(parcalar.split(kume).length - 1, kume).toBe(1);
    }
    for (const renk of ['#bbf7d0', '#f0fdf4', '#166534', '#e5e7eb', '#f8fafc', '#64748b']) {
      expect(liste, renk).not.toContain(renk);
    }
  });
});
