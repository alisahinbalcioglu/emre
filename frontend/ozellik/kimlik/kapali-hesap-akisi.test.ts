/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KAPALI HESAP AKIŞI — KAPI (22.09.2026, Emre kararı)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre'nin talimatı: "ikinci bir arayüze hiç gerek yok — 30 gün boyunca mail
 *  ve şifre kayıtlı kalır, girmek istediğinde sisteme giriş yapar ve istediği
 *  paketi seçer." `/hesap-kapali` sayfası SİLİNDİ.
 *
 *  ⚠ SİLMEK KOLAY, SİLERKEN BİR ŞEY DÜŞÜRMEMEK ZOR. O sayfa üç şey taşıyordu
 *  ve üçü de başka yere TAŞINDI, kaybolmadı. Bu kapının işi taşındıklarını
 *  ölçmek:
 *
 *   K1  Sayfa gerçekten YOK ve hiçbir yer ona yönlendirmiyor (ölü yol
 *       bırakmak, kullanıcıyı boş sayfada bırakır).
 *   K2  Kapatma cümlesi + İMHA TARİHİ şeritte. Bu bir söz ve hukuki
 *       metinlerde de yazılı; kullanıcı görmeden 30 günlük pencereyi bilemez.
 *   K3  VERİ İNDİRME şeritte. KVKK m.11 hakkı. ÖLÇÜLDÜ: kapalı hesap yalnız
 *       `/abonelik` yolunda kalabiliyor; `/profile` ve `/koltuk-durduruldu`
 *       ona kapalı. Düğme şeritten de kalkarsa hak "mekanizma var, bağlantı
 *       yok" hâline düşer — üstelik YASAL bir hakta.
 *   K4  Firması kapatılan ÜYE paket seçemez (K2 kuralı): kart yerine neden
 *       seçemediğini söyleyen bir kutu görür.
 *   K5  Kenar çubuğu kapalı hesapta çalışmayan bağlantı göstermez. Silinen
 *       sayfanın `(protected)` DIŞINDA olmasının gerekçesi buydu; gerekçe
 *       ortadan kalkmadı, yer değiştirdi.
 *   K6  Dışa aktarım daraltması: ürün içeriği çıktı, kişisel veri + teklifler
 *       KALDI.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// ⚠ GORELI import: vitest `@/…` cozmuyor (depoda olculmus tuzak).
import { girisSonrasiYol } from '../../ortak/lib/oturum';
import {
  kapaliDurumCoz,
  imhaTarihiAyricaYazilsinMi,
} from '../../ortak/kabuk/components/layout/kapali-durum';
import { icerikDurdurulsunMu } from '../../ozellik/odeme/erisim-durumu';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const SERIT = oku('ortak/kabuk/components/layout/KapaliHesapSeridi.tsx');
const API = oku('ortak/lib/api.ts');
const SIDEBAR = oku('ortak/kabuk/components/layout/Sidebar.tsx');
const LAYOUT = oku('app/(protected)/layout.tsx');
const ABONELIK = oku('app/(protected)/abonelik/page.tsx');
const CONTEXT = oku('ortak/contexts/CapabilitiesContext.tsx');
const HESAP_SRV = oku('../backend/src/altyapi/auth/hesap.servisi.ts');
// ── 22.09 akşamı, Emre'nin düzeltmesinden sonra eklenenler ──────────────
const ERISIM_DURUMU = oku('ozellik/odeme/erisim-durumu.ts');
const ERISIM_KAPISI = oku('ozellik/odeme/ErisimKapisi.tsx');
const ABONELIK_SERIDI = oku('ozellik/odeme/AbonelikSeridi.tsx');
const QUOTE_LISTE = oku('app/(protected)/quotes/page.tsx');
const QUOTE_DETAY = oku('app/(protected)/quotes/[id]/page.tsx');
const ERISIM_SRV = oku('../backend/src/ozellik/odeme/abonelik/erisim.servisi.ts');
const ERISIM_GUARD = oku('../backend/src/ozellik/odeme/abonelik/erisim.guard.ts');

const GECERLI = 'aaa.bbb.ccc';

describe('ÖLÇÜT — kaynaklar okundu', () => {
  it('yedi dosya da dolu', () => {
    for (const [ad, s] of [
      ['şerit', SERIT], ['api', API], ['sidebar', SIDEBAR],
      ['layout', LAYOUT], ['abonelik', ABONELIK], ['bağlam', CONTEXT],
      ['hesap servisi', HESAP_SRV],
    ] as const) {
      expect(s.length, ad).toBeGreaterThan(500);
    }
  });
});

describe('K1 — sayfa YOK, ölü yol da yok', () => {
  it('/hesap-kapali sayfası silinmiş', () => {
    expect(existsSync(join(process.cwd(), 'app/hesap-kapali/page.tsx'))).toBe(false);
  });

  it('giriş sonrası kapalı hesap /abonelik`e gider', () => {
    expect(
      girisSonrasiYol({ token: GECERLI, user: { id: 'u', email: 'e', role: 'user', hesapKapali: true } } as any),
    ).toBe('/abonelik');
  });

  it('403 yakalayıcısı da /abonelik`e yönlendiriyor', () => {
    const kod = kodu(API);
    expect(kod).toMatch(/window\.location\.href = '\/abonelik'/);
    expect(kod, 'ölü yola yönlendirme kalmış').not.toMatch(/['"`]\/hesap-kapali/);
  });

  it('kapalı hesabın kalabileceği yol listesinde ölü sayfa YOK', () => {
    const m = kodu(API).match(/KAPALI_HESABIN_KALABILECEGI_YOL\s*=\s*(\/\^[^;]+)/);
    expect(m, 'süzgeç bulunamadı').not.toBeNull();
    expect(m![1]).not.toContain('hesap-kapali');
    expect(m![1]).toContain('abonelik');
  });
});

describe('K2/K3 — kapatma bilgisi ve KVKK hakkı ŞERİTTE', () => {
  it('şerit kabuğa mount edilmiş (yazılıp unutulmuş bileşen değil)', () => {
    const kod = kodu(LAYOUT);
    expect(kod).toMatch(/import \{ KapaliHesapSeridi \}/);
    expect(kod).toMatch(/<KapaliHesapSeridi \/>/);
  });

  it('⭐ şerit ABONELİK şeridinden ÖNCE — en ağır durum en üstte', () => {
    const kod = kodu(LAYOUT);
    const kapali = kod.indexOf('<KapaliHesapSeridi />');
    const abonelik = kod.indexOf('<AbonelikSeridi />');
    expect(kapali).toBeGreaterThan(-1);
    expect(abonelik).toBeGreaterThan(-1);
    expect(kapali).toBeLessThan(abonelik);
  });

  it('imha tarihi çiziliyor', () => {
    expect(kodu(SERIT)).toMatch(/imhaTarihi/);
    expect(SERIT).toContain('tarihinde silinecek');
  });

  it('⭐ veri indirme şeritte ve TEK yardımcıdan (düz `<a href>` değil)', () => {
    const kod = kodu(SERIT);
    expect(kod).toMatch(/import \{ verileriIndir \}/);
    expect(kod).toMatch(/verileriIndir\(\)/);
    expect(kod, 'düz bağlantı Authorization taşımaz').not.toMatch(/href=["'`]\/api\//);
  });

  it('⭐⭐ şerit KENDİ `/auth/me` isteğini ATMAZ — veri bağlamdan gelir', () => {
    // ⚠ 22.09: ilk yazımda şeridin kendi `useEffect` + `api.get('/auth/me')`
    //   çağrısı vardı. `CapabilitiesProvider` ZATEN aynı ucu çağırıyor; yani
    //   her kabuk açılışında İKİ istek gidiyordu ve kapalı-hesap bilgisinin
    //   İKİ ayrı gerçek kaynağı oluşuyordu — biri günün birinde ötekinden
    //   sapardı. Sağlayıcının kendi başlığındaki kural: "/auth/me ön yüzün
    //   TEK besleme noktasıdır". Bu assert o kuralı ŞERİT için mühürler.
    const kod = kodu(SERIT);
    expect(kod, 'şerit ikinci bir istek atıyor').not.toMatch(/api\.get\(/);
    expect(kod).toMatch(/useCapabilities\(\)/);
    expect(kod, 'bağlamdaki `kapali` okunmuyor').toMatch(/kapali:\s*durum/);

    const ctx = kodu(CONTEXT);
    expect(ctx, 'bağlam kapalı durumu AYNI yanıttan çözmüyor')
      .toMatch(/setKapali\(kapaliDurumCoz\(data\)\)/);
    expect((ctx.match(/api\.get\('\/auth\/me'\)/g) ?? []).length,
      'sağlayıcı tek istek atmalı').toBe(1);
    // Yük gelmeden çizmeme kuralı (yanıp sönme) ŞERİTTE de olmalı.
    expect(kod).toMatch(/if \(loading \|\| !durum\) return null;/);
  });

  it('şerit yalnız kapalı hesapta çizilir (null → hiçbir şey)', () => {
    expect(kapaliDurumCoz(null)).toBeNull();
    expect(kapaliDurumCoz({})).toBeNull();
    expect(kapaliDurumCoz({ kapali: { kapali: false } })).toBeNull();
  });

  it('cümle SUNUCUDAN gelir, şeritte ikinci kez yazılmaz', () => {
    const d = kapaliDurumCoz({
      kapali: { kapali: true, tip: 'hesap', imhaTarihi: '2026-10-22T00:00:00.000Z' },
      erisim: { uyari: { baslik: 'SUNUCU BAŞLIĞI', metin: 'SUNUCU METNİ' } },
    });
    expect(d?.baslik).toBe('SUNUCU BAŞLIĞI');
    expect(d?.metin).toBe('SUNUCU METNİ');
    expect(d?.imhaTarihi).toBe('2026-10-22T00:00:00.000Z');
  });
});

describe('K4 — firması kapatılan ÜYE paket seçemez', () => {
  it('tip ayrımı yapılıyor', () => {
    expect(kapaliDurumCoz({ kapali: { kapali: true, tip: 'firma', imhaTarihi: null } })?.tip).toBe('firma');
    expect(kapaliDurumCoz({ kapali: { kapali: true, tip: 'hesap', imhaTarihi: null } })?.tip).toBe('hesap');
  });

  it('abonelik sayfası firma kapanışını AYNI /auth/me yanıtından okuyor', () => {
    const kod = kodu(ABONELIK);
    expect(kod).toMatch(/setFirmaKapandi\(/);
    expect(kod).toMatch(/kapali\?\.tip === 'firma'/);
    // İkinci bir istek atılmamalı: bilgi zaten elde.
    expect((kod.match(/api\.get\('\/auth\/me'\)/g) ?? []).length).toBe(1);
  });

  it('⭐ kartlar gizleniyor ve NEDENİ yazıyor', () => {
    const kod = kodu(ABONELIK);
    expect(kod).toMatch(/firmaKapandi \? \(/);
    expect(ABONELIK).toContain('Paket seçimi size kapalı');
    expect(ABONELIK).toContain('yalnızca sahibi');
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ÜÇ YERDE AYNI LİSTE — kapalı hesabın gidebileceği yollar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU SAYI BİR ÖNCEKİ TURUN HATASIDIR. Menü yalnız `/abonelik` bırakılmış,
 *  kişi kaydedilmiş tekliflerine ULAŞAMIYORDU; Emre canlı ekranda gördü:
 *  "kullanıcı neden sayfaya girip göremiyor — sadece KULLANAMAYACAK dedik."
 *
 *  Yol listesi ÜÇ ayrı dosyada yaşıyor ve üçü de aynı olmak zorunda:
 *   · `Sidebar.tsx`        → menüde ne görünür
 *   · `api.ts`             → 403 sonrası nereden ATILMAZ
 *   · `erisim-durumu.ts`   → içeriği "paket seçin" ekranı DEĞİŞTİRMEZ
 *  Biri eksik kalırsa kusur SESSİZDİR: menüde görünen sayfa ya 403 yer ya da
 *  açılır açılmaz `/abonelik`e fırlar. Bu blok üçünü karşılaştırır.
 */
const KAPALI_YOLLAR = ['dashboard', 'quotes', 'library', 'abonelik'];

describe('K5 — kapalı hesapta menü: ÇALIŞAN yollar kalır', () => {
  it('kenar çubuğu bayrağa bakıyor', () => {
    expect(kodu(SIDEBAR)).toMatch(/user\?\.hesapKapali === true/);
  });

  it('⭐⭐ teklifler ve kütüphane menüde KALIR (önceki tur bunları düşürmüştü)', () => {
    const kod = kodu(SIDEBAR);
    const m = kod.match(/KAPALI_HESAPTA_GORUNEN\s*=\s*\[([^\]]*)\]/);
    expect(m, 'liste bulunamadı').not.toBeNull();
    // ⚠ `/dashboard` 23.09'da EKLENDİ (Emre: "ana sayfa yok şuan bununun da
    //   olması gerekiyor"). Pano SAYI gösterir ve son teklifleri listeler —
    //   ikisi de kullanıcının zaten görebildiği veri; yükleme alanları ayrıca
    //   kapatıldı ("teklif hazırlama dwg … çalışmayacak").
    for (const yol of ['/dashboard', '/quotes', '/library', '/abonelik']) {
      expect(m![1], `${yol} menüden düşmüş`).toContain(`'${yol}'`);
    }
    // İşe yaramayanlar girmemeli: bunları açmak 403 üretirdi.
    for (const yol of ['/materials', '/firma/ekip']) {
      expect(m![1], `${yol} kapalı hesapta çalışmaz`).not.toContain(`'${yol}'`);
    }
  });

  it('⭐ pano ucu kapalı hesaba AÇIK, yükleme alanları KAPALI', () => {
    // Menüde Ana Sayfa varsa `GET /panel/ozet` de açık olmalı; yoksa sayfa
    // boş kalır ve menüdeki bağlantı kırık görünür.
    const panel = kodu(oku('../backend/src/ozellik/panel/panel.controller.ts'));
    expect(panel, 'pano özeti kapalı hesaba kapalı').toContain('@KapaliHesapIzinli()');

    // "teklif hazirlama dwg … calismayacak" — Excel ve DWG yükleme alanları
    // yetenek bayrağının YANINDA ayrıca kapatılır. Yan etkiye (yetenekler
    // zaten boş döner) bırakılsaydı, yan etki değişince sessizce açılırdı.
    const qs = kodu(oku('ortak/kabuk/components/dashboard/QuickStart.tsx'));
    expect(qs).toMatch(/const hesapKapali = kapali\?\.kapali === true;/);
    expect(qs, 'Excel yükleme kapalı hesapta açık kalmış')
      .toContain('hasAnyMaterial() && !hesapKapali');
    expect(qs, 'DWG yükleme kapalı hesapta açık kalmış')
      .toContain('hasAnyDwg() && !hesapKapali');
  });

  it('⭐⭐ ÜÇ dosyadaki yol listesi AYNI (biri unutulursa kusur sessiz)', () => {
    const suzgec = (s: string, ad: string) => {
      const m = kodu(s).match(new RegExp(ad + String.raw`\s*=\s*\n?\s*(/\^[^;]+)`));
      expect(m, `${ad} bulunamadı`).not.toBeNull();
      return m![1];
    };
    const apiYol = suzgec(API, 'KAPALI_HESABIN_KALABILECEGI_YOL');
    const okuYol = suzgec(ERISIM_DURUMU, 'KAPALI_HESABIN_OKUYABILECEGI_YOL');
    for (const y of KAPALI_YOLLAR) {
      expect(apiYol, `api.ts ${y} yolunu tanımıyor`).toContain(y);
    }
    // `erisim-durumu` listesinde `abonelik` YOKTUR ve olmamalı: o yol
    // `DURDURULMAYAN_YOL`da zaten duruyor (paketsiz herkes için).
    for (const y of ['quotes', 'library']) {
      expect(okuYol, `erisim-durumu ${y} yolunu tanımıyor`).toContain(y);
    }
    expect(okuYol, 'abonelik iki listede birden tutulmamalı').not.toContain('abonelik');
  });

  it('⭐ erişim kapısı kapalı hesabı AYRI ele alıyor (üçüncü argüman)', () => {
    expect(kodu(ERISIM_DURUMU)).toMatch(/hesapKapali = false/);
    expect(kodu(ERISIM_DURUMU)).toMatch(
      /if \(hesapKapali && KAPALI_HESABIN_OKUYABILECEGI_YOL\.test\(yol\)\) return false;/,
    );
    // Bileşen o argümanı GERÇEKTEN geçiyor mu (mekanizma var, bağlantı yok).
    expect(kodu(ERISIM_KAPISI)).toMatch(
      /icerikDurdurulsunMu\(erisim, yol, kapali\?\.kapali === true\)/,
    );
  });

  it('saf çözücü: kapalı hesapta okuma yolları durdurulmaz', () => {
    const kapaliKarar = { erisimVar: false } as any;
    expect(icerikDurdurulsunMu(kapaliKarar, '/quotes/abc', true)).toBe(false);
    expect(icerikDurdurulsunMu(kapaliKarar, '/library', true)).toBe(false);
    // Kapalı DEĞİLSE (yalnız paketsiz) aynı yol DURDURULUR — izin kapatmaya
    // özeldir, paketsiz herkese açılmaz.
    expect(icerikDurdurulsunMu(kapaliKarar, '/quotes/abc', false)).toBe(true);
    expect(icerikDurdurulsunMu(kapaliKarar, '/dashboard', true)).toBe(false);
    // Kapalı olsa bile izin listesi DIŞI durdurulur.
    // ⚠ Bu satır 23.09'da `/dashboard`ken `/materials`a çevrildi: pano izin
    //   listesine girdi ve assert kendi örneğini kaybetti. Örnek seçerken
    //   listenin DIŞINDA kaldığı kesin olan bir yol kullanılır.
    expect(icerikDurdurulsunMu(kapaliKarar, '/materials', true)).toBe(true);
    expect(icerikDurdurulsunMu(kapaliKarar, '/firma/ekip', true)).toBe(true);
  });

  it('ayraçlar da eleniyor (tek öğenin üstünde çizgi kalmasın)', () => {
    expect(kodu(SIDEBAR)).toMatch(/typeof i !== 'string'/);
  });

  it('bayrak saklanan kullanıcı tipinde tanımlı', () => {
    expect(kodu(LAYOUT)).toMatch(/hesapKapali\?: boolean/);
    expect(kodu(SIDEBAR)).toMatch(/hesapKapali\?: boolean/);
  });
});

describe('K6 — dışa aktarım daraltıldı, hak daralmadı', () => {
  const kod = kodu(HESAP_SRV);

  /**
   * ⚠ ANAHTAR KONUMUNA BAĞLI — düz `toContain` DEĞİL. Mutasyonla ölçüldü
   * (22.09): `teklifler,` → `teklifBasliklari: teklifler,` mutantı düz
   * aramayla HAYATTA KALIYORDU, çünkü yeni metin eskisini İÇİNDE taşıyor.
   * Yani ölçüt "şu anahtar dışa aktarılıyor" demiyordu, "şu harf dizisi
   * dosyanın bir yerinde geçiyor" diyordu. Müşterinin indirdiği JSON'un
   * anahtarı sessizce yeniden adlandırılabilirdi.
   */
  const anahtarSatiri = (ad: string) => new RegExp(`^\\s*${ad}[,:]`, 'm');

  it('⭐ ürün içeriği ÇIKTI', () => {
    for (const anahtar of [
      'kutuphane', 'kutuphaneListeleri', 'markaKutuphaneleri',
      'iscilikFirmalari', 'teklifFormatlari', 'ceviriDuzeltmeleri',
    ]) {
      expect(kod, `${anahtar} hâlâ dışa aktarılıyor`).not.toMatch(anahtarSatiri(anahtar));
    }
  });

  it('⭐⭐ TEKLİFLER ve kişisel veri KALDI', () => {
    for (const anahtar of [
      'teklifler', 'abonelikKayitlari', 'faturalar', 'sozlesmeOnaylari',
      'denemeKullanimKayitlari', 'aiKullanimKayitlari', 'firmaIslemKayitlari',
      'ceviriDuzeltmeOlaylari',
    ]) {
      expect(kod, `${anahtar} düşmüş`).toMatch(anahtarSatiri(anahtar));
    }
  });

  it('teklif satırları (sheets + items) hâlâ seçiliyor', () => {
    expect(kod).toMatch(/sheets: true/);
    expect(kod).toMatch(/items: true/);
  });

  it('daraltma müşteriye AÇIKÇA söyleniyor (sessiz eksik yok)', () => {
    // ⚠ BİTİŞİK ARAMA YAPILMAZ: not, kaynakta `'…sozlugu bu ' + 'dosyada YER
    //   ALMAZ…'` diye BÖLÜNMÜŞ bir dizge birleşimi. İlk yazımda bitişik
    //   aradım ve kapı kırmızı yandı — assert'in kendisi yanlıştı, kod değil.
    //   Ölçüt artık ÇİZİLEN cümleye bakıyor: birleşimleri çöz, sonra ara.
    const cumleler = kod.replace(/'\s*\+\s*'/g, '');
    expect(cumleler).toContain('dosyada YER ALMAZ');
    expect(cumleler).toContain('Malzeme kutuphaneniz');
    expect(cumleler).toContain('Hazirladiginiz TEKLIFLER satir satir bu dosyadadir');
  });

  it('açıklama hâlâ KVKK m.11 çerçevesinde', () => {
    // ⚠ YORUMDA DEĞİL, MÜŞTERİNİN OKUDUĞU CÜMLEDE. Mutasyonla ölçüldü
    //   (22.09): dosyanın tamamında `'KVKK m.11'` aramak, o ibare üç ayrı
    //   YORUM satırında da geçtiği için, çerçeveyi açıklama metninden
    //   silen mutantı yaşatıyordu. Ölçüt artık yorumsuz koda bakıyor ve
    //   baştaki tırnak dizgenin KENDİSİ olduğunu kanıtlıyor.
    expect(kod).toContain("'KVKK m.11 kapsaminda, hesabinizla iliskili");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  K7 — SALT-OKUNUR MOD (22.09.2026 akşamı, Emre'nin düzeltmesi)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  "kaydedilmiş tekliflerini görebilecek, indirebilecek, girebilecek ancak
 *  işlem yapamayacak." Kütüphane: "görünsün ama orada da işlem yapamasın."
 *
 *  ⚠ BU BLOĞUN EN AĞIR ASSERT'İ SONUNCUSUDUR: kapalı hesaba açılan hiçbir
 *  ucun YAZMADIĞINI ölçer. İzni denetleyici SINIFINA koymak tek satırda
 *  kapalı hesaba teklif SİLDİREBİLİRDİ — `@Delete(':id')`in ikinci kapısı
 *  (`@GerekliYetenek`) YOK, yani `ErisimGuard` onu sessizce geçiriyor.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('K7 — salt-okunur mod: görür, girer, indirir; işlem YAPAMAZ', () => {
  it('⭐ kapatmaya özel izin kümesi var ve yalnız OKUMA yetenekleri içeriyor', () => {
    const kod = kodu(ERISIM_SRV);
    const m = kod.match(/KAPALI_HESAPTA_ACIK[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(m, 'KAPALI_HESAPTA_ACIK kümesi yok').not.toBeNull();
    const icerik = m![1];
    for (const y of ['TEKLIF_GORUNTULE', 'KUTUPHANE_GORUNTULE', 'CIKTI_INDIR', 'ABONELIK_YONET']) {
      expect(icerik, `${y} eksik`).toContain(y);
    }
    // ⚠ "işlem yapamayacak" cümlesinin karşılığı: YAZAN yetenek GİRMEZ.
    for (const y of ['TEKLIF_OLUSTUR', 'TEKLIF_DUZENLE', 'KUTUPHANE_DUZENLE',
      'EXCEL_YUKLE', 'DWG_YUKLE', 'AI_ANALIZ']) {
      expect(icerik, `${y} YAZAN bir yetenek — kümede olamaz`).not.toContain(y);
    }
  });

  it('⭐ kümeyi KAPI gerçekten kullanıyor (mekanizma var, bağlantı yok değil)', () => {
    const kod = kodu(ERISIM_GUARD);
    expect(kod).toMatch(/hesapKapali === true/);
    expect(kod).toMatch(/if \(kapaliHesap && KAPALI_HESAPTA_ACIK\.has\(y\)\) continue;/);
  });

  it('⭐ okuma uçlarına izin verilmiş (görebilecek · girebilecek · indirebilecek)', () => {
    const quotes = kodu(oku('../backend/src/ozellik/teklif/quotes/quotes.controller.ts'));
    // liste · teklifi aç · çıktı indir — üçü de Emre'nin cümlesinde geçiyor.
    for (const rota of [
      "@Get()", "@Get(':id')", "@Get(':id/exports')",
      "@Get(':id/export-priced')", "@Get(':id/exports/:rev')", "@Post(':id/export')",
    ]) {
      const i = quotes.indexOf(rota);
      expect(i, `${rota} bulunamadı`).toBeGreaterThan(-1);
      // Rotanın hemen ardındaki 12 satırda izin olmalı.
      const pencere = quotes.slice(i, i + 520);
      expect(pencere, `${rota} kapalı hesaba açık DEĞİL`).toContain('@KapaliHesapIzinli()');
    }
  });

  it('⭐⭐ KAPALI HESABA AÇILAN HİÇBİR UÇ YAZMIYOR', () => {
    // İzinli satırların bağlı olduğu HTTP metodunu bulur. Tek bilinçli
    // istisna `POST /quotes/:id/export`: teklifi DEĞİŞTİRMEZ, yalnız
    // "kaçıncı kez çıktı alındı" sayacını artırır (gerekçe uçta yazılı).
    const ISTISNA = new Set([`quotes.controller.ts|@Post(':id/export')`]);
    const dosyalar = [
      'quotes/quotes.controller.ts',
      '../kutuphane/library/library.controller.ts',
      '../kutuphane/brands/brands.controller.ts',
      '../cikti/quote-formats/quote-formats.controller.ts',
    ];
    let toplam = 0;
    for (const d of dosyalar) {
      const ad = d.split('/').pop()!;
      const satirlar = kodu(oku(`../backend/src/ozellik/teklif/${d}`)).split(/\r?\n/);
      satirlar.forEach((s, i) => {
        if (!s.includes('@KapaliHesapIzinli()')) return;
        toplam++;
        let rota: string | null = null;
        for (let j = i - 1; j >= Math.max(0, i - 12) && !rota; j--) {
          const m = satirlar[j].match(/^\s*(@(?:Get|Post|Put|Patch|Delete)\([^)]*\))/);
          if (m) rota = m[1];
        }
        for (let j = i + 1; j < Math.min(satirlar.length, i + 12) && !rota; j++) {
          const m = satirlar[j].match(/^\s*(@(?:Get|Post|Put|Patch|Delete)\([^)]*\))/);
          if (m) rota = m[1];
        }
        expect(rota, `${ad}:${i + 1} — izin hangi uca ait, bulunamadı`).not.toBeNull();
        if (ISTISNA.has(`${ad}|${rota}`)) return;
        expect(rota!.startsWith('@Get('), `${ad} ${rota} — YAZAN uca izin verilmiş`).toBe(true);
      });
    }
    // ⚠ PAYDA: kümenin boş olması da bu testi yeşil yapardı.
    expect(toplam, 'hiç izin bulunamadı — ölçüt boş küme üzerinde koşmuş').toBe(16);
  });

  it('⭐ silme düğmesi kapalı hesapta ÇİZİLMİYOR (403 yedirilmiyor)', () => {
    const kod = kodu(QUOTE_LISTE);
    expect(kod).toMatch(/const saltOkunur = kapali\?\.kapali === true;/);
    expect(kod).toMatch(/\{!saltOkunur && \(/);
    // Silme HÂLÂ var (paketli müşteri için) — düğme kaldırılmadı, koşullandı.
    expect(kod).toMatch(/handleDelete\(quote\.id, quote\.title\)/);
  });

  it('⭐ teklif ekranı: kapak alanları salt-okunur, Revize Et gizli', () => {
    const kod = kodu(QUOTE_DETAY);
    expect(kod).toMatch(/const saltOkunur = kapaliDurum\?\.kapali === true;/);
    expect((kod.match(/readOnly=\{saltOkunur\}/g) ?? []).length,
      'dört kapak alanının hepsi salt-okunur olmalı').toBe(4);

    // ⚠ HANGİ DÜĞME OLDUĞU SORULUYOR, "bir yerde geçiyor mu" DEĞİL.
    //   Mutasyonla ölçüldü (22.09): `toMatch(/sheets.length > 0 && !saltOkunur/)`
    //   deseni İKİ düğmede birden bulunuyordu (Revize Et ve Çeviri); Revize
    //   Et'ten koruma kaldırılınca assert öteki eşleşmeyi görüp YEŞİL kaldı.
    //   Ölçüt artık düğmenin KENDİ `onClick`ine komşuluktan bakıyor.
    const korumali = (islev: string) => {
      const i = kod.indexOf(`onClick={${islev}}`);
      expect(i, `${islev} düğmesi bulunamadı`).toBeGreaterThan(-1);
      return kod.slice(Math.max(0, i - 260), i);
    };
    expect(korumali('revizeEt'), 'Revize Et kapalı hesapta gizlenmiyor')
      .toContain('!saltOkunur');
    expect(korumali('handleCeviri'), 'Çeviri kapalı hesapta gizlenmiyor')
      .toContain('!saltOkunur');

    // Tek `useCapabilities()` çağrısı: ikizlenme olmasın.
    expect((kod.match(/useCapabilities\(\)/g) ?? []).length).toBe(1);
  });

  it('⭐⭐ kütüphane sayfalarında YAZMA girişleri kapalı hesapta çizilmiyor', () => {
    // Emre: kütüphane "görünsün ama orada da işlem yapamasın".
    // ⚠ Gerçek kapı arka yüzde (`KUTUPHANE_DUZENLE` kapalı hesaba kapalı);
    //   burası kullanıcıya 403 yedirmemek için. Her giriş AYRI ölçülür:
    //   tek bir "!saltOkunur geçiyor mu" assert'i, dördünden üçü açık
    //   kalsa bile yeşil yanardı (aynı tuzağa Revize Et'te düşüldü).
    //
    // ⚠ PENCERE DAR TUTULUYOR (170). Mutasyonla ölçüldü: 320 karakterlik
    //   pencere, elektrik sayfasında BİR ÖNCEKİ düğmenin korumasına
    //   uzanıyordu ve "PDF Yükle"nin koruması kaldırıldığında assert yeşil
    //   kalıyordu — `revizeEt`teki tuzağın aynısı, komşu eşleşme.
    // ⚠ ÜSTÜNE SAYIM: her dosyada kaç koruma olduğu AYRICA sayılıyor.
    //   Yalnız komşuluk ölçseydi, bir korumanın silinip başka bir yere
    //   eklenmesi fark edilmezdi (payda kuralı).
    const sayfalar: Array<[string, string[], number]> = [
      ['library/mechanical-brands/page.tsx', ['setManualOpen(true)', 'setPdfOpen(true)'], 2],
      ['library/electrical-brands/page.tsx', ['setAddOpen(true)', 'setPdfOpen(true)'], 2],
      ['library/brand/[brandId]/page.tsx',
        ['handleSave', 'handleRemoveBrand', 'enterNewListMode', 'deleteActiveList'], 4],
    ];
    for (const [yol, girisler, adet] of sayfalar) {
      const kod = kodu(oku(`app/(protected)/${yol}`));
      expect(kod, `${yol}: salt-okunur bayrağı yok`)
        .toMatch(/const saltOkunur = kapaliDurum\?\.kapali === true;/);
      expect((kod.match(/!saltOkunur/g) ?? []).length, `${yol}: koruma sayısı tutmuyor`)
        .toBe(adet);
      for (const g of girisler) {
        const i = kod.indexOf(`onClick={${g}}`) >= 0
          ? kod.indexOf(`onClick={${g}}`)
          : kod.indexOf(g);
        expect(i, `${yol}: ${g} bulunamadı`).toBeGreaterThan(-1);
        expect(kod.slice(Math.max(0, i - 170), i), `${yol}: ${g} korumasız`)
          .toContain('!saltOkunur');
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  K8 — TEK ŞERİT, TEK TARİH (canlıda görülen iki kusur)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Emre'nin ekran görüntüsünde şerit "Hesabınız kapatıldı. Verileriniz
 *  22.10.2026 tarihinde silinecek. Verileriniz 22.10.2026 tarihinde
 *  silinecek. …" yazıyordu ve hemen altında AYNI cümleyi tekrarlayan ikinci
 *  bir kırmızı şerit vardı.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('K8 — şerit bir kez çizilir, tarih bir kez yazılır', () => {
  it('⭐⭐ sunucu başlığı tarihi ZATEN söylüyorsa şerit tekrar yazmaz', () => {
    const d = { baslik: 'Hesabınız kapatıldı. Verileriniz 22.10.2026 tarihinde silinecek.', metin: '' };
    expect(imhaTarihiAyricaYazilsinMi(d, '22.10.2026')).toBe(false);
  });

  it('⭐ ama sunucu SUSARSA tarih yine de gösterilir (K2 sözü düşmez)', () => {
    expect(imhaTarihiAyricaYazilsinMi({ baslik: 'Hesabınız kapatıldı.', metin: '' }, '22.10.2026')).toBe(true);
    // Metinde geçiyorsa da yeter.
    expect(imhaTarihiAyricaYazilsinMi({ baslik: 'X', metin: '… 22.10.2026 …' }, '22.10.2026')).toBe(false);
    // Tarih yoksa cümle de yok.
    expect(imhaTarihiAyricaYazilsinMi({ baslik: 'X', metin: 'Y' }, null)).toBe(false);
  });

  it('⭐⭐ abonelik şeridi kapalı hesapta SUSAR (iki kırmızı bant yok)', () => {
    const kod = kodu(ABONELIK_SERIDI);
    expect(kod).toMatch(/if \(kapali\?\.kapali === true\) return null;/);
    expect(kod).toMatch(/useCapabilities\(\)/);
  });

  it('⭐ susan şeridin EYLEM düğmesi kaybolmadı, şeride taşındı', () => {
    expect(kodu(SERIT)).toMatch(/durum\.eylem/);
    const d = kapaliDurumCoz({
      kapali: { kapali: true, tip: 'hesap', imhaTarihi: null },
      erisim: { uyari: { baslik: 'B', metin: 'M', eylem: { etiket: 'Paket seç', yol: '/abonelik' } } },
    });
    expect(d?.eylem).toEqual({ etiket: 'Paket seç', yol: '/abonelik' });
  });

  it('şerit ne yapabileceğini SÖYLÜYOR — HER İKİ dalda da', () => {
    // ⚠ İKİ DAL AYRI ÖLÇÜLÜR. İlk yazımda tek bir `toContain` vardı ve
    //   mutasyon deseni benzersiz değildi: cümle hem `firma` hem `hesap`
    //   dalında geçiyor, birini bozan mutant ötekinde eşleşip hayatta
    //   kalırdı. Firması kapatılan üye de ne yapabileceğini bilmeli.
    expect(SERIT, 'firma dalı ne yapabileceğini söylemiyor')
      .toContain('Kayıtlı teklifleri görüntüleyip indirebilirsiniz');
    expect(SERIT, 'hesap dalı ne yapabileceğini söylemiyor')
      .toContain('Kayıtlı tekliflerinizi görüntüleyip indirebilirsiniz');
    expect(SERIT).toContain('yeni teklif oluşturmak için bir paket seçin');
    expect(SERIT).toContain('Firmanızı yalnızca sahibi geri açabilir');
  });
});
