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
import { kapaliDurumCoz } from '../../ortak/kabuk/components/layout/kapali-durum';

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

describe('K5 — kapalı hesapta kırık bağlantı gösterilmez', () => {
  it('kenar çubuğu bayrağa bakıyor', () => {
    expect(kodu(SIDEBAR)).toMatch(/user\?\.hesapKapali === true/);
  });

  it('yalnız /abonelik kalıyor', () => {
    expect(kodu(SIDEBAR)).toMatch(/i\.href === '\/abonelik'/);
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
