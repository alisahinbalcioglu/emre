import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  icerikDurdurulsunMu,
  vitrinKartiGosterilsinMi,
  vitrindeGezilebilirMi,
  vitrinMi,
  type ErisimKarari,
} from './erisim-durumu';
import { DENEME_EPOSTA_DOGRULA_METNI, DENEME_KULLANILDI_METNI } from './paket-bicim';
import {
  vitrinBolumBasligi,
  vitrinBolumu,
  vitrinDenemeSatiri,
  vitrinIslemMetni,
} from './vitrin-metinleri';
import { VitrinBolumKarti } from './VitrinBolumKarti';

/**
 * VİTRİN — PAKETSİZ YENİ HESAP (23.09.2026 — Emre kararı)
 *
 * "ana sayfa her şey açılsın, kullanıcının önüne gelsin; kullanıcı paket
 * seçsin (kart bilgisini girip), ödeme 30 günün sonunda çekilsin."
 * Kararlar: "yalnızca gezsin" · havuzda "fiyatlar paketle açılsın".
 *
 * A · KARAR   — hangi yol gezilir, hangisinde kart; vitrin DUVAR görmez;
 *               vitrin olmayan kapalı hesap (süresi biten abone) duvarda KALIR.
 * B · METİN   — deneme satırı RAKAMI sürümden, hakkı kişiden okur; hakkı
 *               olmayana "ücretsiz" DENMEZ.
 * C · ÇIKTI   — bölüm kartı gerçekten çizilir, çıkmaz sokak bırakmaz.
 * D · BAĞLANTI — karar ve metin GERÇEKTEN ekrana bağlı mı (yorumsuz kaynak):
 *               kabuk, şerit, Ana Sayfa kutuları, havuz aktarımı, ekip daveti.
 *               ⚠ Bu depoda altı kez "mekanizma var, bağlantı yok" çıktı;
 *               D bloğu onun bekçisi. Sunucu tarafı: `backend/test/vitrin-test.ts`.
 */

const temel: ErisimKarari = {
  erisimVar: false,
  saltOkunur: false,
  durum: 'SONA_ERDI',
  uyari: null,
  kalanGun: null,
  paketKodu: '',
  kullaniciHakki: 0,
  dwgAktif: false,
};
const vitrin: ErisimKarari = { ...temel, vitrin: true };
const suresiBitmis: ErisimKarari = { ...temel }; // abonelik satırı var, süresi bitmiş → vitrin DEĞİL

const GEZILEBILIR = [
  '/dashboard',
  '/quotes',
  '/library',
  '/firma/ekip',
  '/materials',
  '/materials/mechanical',
  '/materials/9b2c-marka',
  '/abonelik',
  '/abonelik/donus',
  '/profile',
  '/koltuk-durduruldu',
];
const KARTLI = [
  '/quotes/new',
  '/quotes/abc-123',
  '/library/mechanical-brands',
  '/library/brand/9b2c',
  '/labor',
  '/labor-firms',
  '/labor-firms/f1',
  '/quote-formats',
  '/dwg-workspace',
  '/firma/ekip/kurumsal-giris',
  '/yarin-eklenecek-bir-sayfa',
];

describe('A · vitrin kararı', () => {
  it('vitrinMi: yalnız bayrak + KAPALI erişim', () => {
    expect(vitrinMi(vitrin)).toBe(true);
    expect(vitrinMi(suresiBitmis)).toBe(false);
    expect(vitrinMi(null)).toBe(false);
    expect(vitrinMi(undefined)).toBe(false);
    // ⚠ savunma: bayrak açık bir kararda gelirse ödemiş müşterinin
    //   düğmeleri pencereye dönmesin.
    expect(vitrinMi({ ...vitrin, erisimVar: true })).toBe(false);
    expect(vitrinMi({ ...temel, vitrin: false })).toBe(false);
  });

  it.each(GEZILEBILIR)('gezilir: %s (içerik açılır, kart YOK)', (yol) => {
    expect(vitrindeGezilebilirMi(yol)).toBe(true);
    expect(vitrinKartiGosterilsinMi(vitrin, yol)).toBe(false);
  });

  it.each(KARTLI)('kart: %s (sayfa mount olmaz)', (yol) => {
    expect(vitrindeGezilebilirMi(yol)).toBe(false);
    expect(vitrinKartiGosterilsinMi(vitrin, yol)).toBe(true);
  });

  it('⭐ yol ÖN-EKİ dizge içeriği değil: "/quotesx" ve "/libraryx" gezilmez', () => {
    expect(vitrindeGezilebilirMi('/quotesx')).toBe(false);
    expect(vitrindeGezilebilirMi('/libraryx')).toBe(false);
    expect(vitrindeGezilebilirMi('/materialsx')).toBe(false);
  });

  it('⭐⭐ vitrin DUVAR görmez — hiçbir yolda', () => {
    for (const yol of [...GEZILEBILIR, ...KARTLI]) {
      expect(icerikDurdurulsunMu(vitrin, yol), yol).toBe(false);
    }
  });

  it('⭐ süresi biten abone vitrin DEĞİL: duvar AYNEN, kart YOK (Emre: "bu işin dışında")', () => {
    expect(icerikDurdurulsunMu(suresiBitmis, '/dashboard')).toBe(true);
    expect(icerikDurdurulsunMu(suresiBitmis, '/abonelik')).toBe(false);
    for (const yol of KARTLI) expect(vitrinKartiGosterilsinMi(suresiBitmis, yol), yol).toBe(false);
  });

  it('kapatılmış hesap kuralı değişmedi (üçüncü argüman)', () => {
    expect(icerikDurdurulsunMu(suresiBitmis, '/quotes', true)).toBe(false);
    expect(icerikDurdurulsunMu(suresiBitmis, '/materials', true)).toBe(true);
  });

  it('karar yüklenmediyse (null) kart da duvar da yok', () => {
    expect(vitrinKartiGosterilsinMi(null, '/labor')).toBe(false);
    expect(icerikDurdurulsunMu(null, '/labor')).toBe(false);
  });
});

const paket = (surum: Record<string, unknown> | null) => ({ surum: surum as any });

describe('B · deneme satırı ve metinler', () => {
  it('hak var, tek gün sayısı → "30 gün ücretsiz, ilk ödeme 30. günün sonunda" (RAKAM SÜRÜMDEN)', () => {
    const p = [paket({ denemeGunu: 30, denemeHakki: true, denemeGerekcesi: 'var' }), paket({ denemeGunu: 30, denemeHakki: true, denemeGerekcesi: 'var' })];
    expect(vitrinDenemeSatiri(p)).toEqual({ ton: 'olumlu', metin: '30 gün ücretsiz, ilk ödeme 30. günün sonunda' });
    expect(vitrinDenemeSatiri([paket({ denemeGunu: 14, denemeHakki: true, denemeGerekcesi: 'var' })])?.metin)
      .toBe('14 gün ücretsiz, ilk ödeme 14. günün sonunda');
  });

  it('⭐ hak KULLANILMIŞ → "ücretsiz" DENMEZ', () => {
    const s = vitrinDenemeSatiri([paket({ denemeGunu: 30, denemeHakki: false, denemeGerekcesi: 'kullanildi' })]);
    expect(s).toEqual({ ton: 'bilgi', metin: DENEME_KULLANILDI_METNI });
  });

  it('⭐ tek pakette bile hak yoksa vaat YOK (fail-closed)', () => {
    const s = vitrinDenemeSatiri([
      paket({ denemeGunu: 30, denemeHakki: true, denemeGerekcesi: 'var' }),
      paket({ denemeGunu: 30, denemeHakki: false, denemeGerekcesi: 'kullanildi' }),
    ]);
    expect(s?.ton).toBe('bilgi');
    expect(s?.metin).not.toMatch(/ücretsiz,/);
  });

  it('e-posta doğrulanmamış → koşulu söyler, rakamı korur', () => {
    const s = vitrinDenemeSatiri([paket({ denemeGunu: 30, denemeHakki: false, denemeGerekcesi: 'eposta-dogrulanmadi' })]);
    expect(s).toEqual({ ton: 'uyari', metin: '30 gün ücretsiz deneme için önce e-posta adresinizi doğrulayın.' });
  });

  it('gün sayıları FARKLIYSA rakam yazılmaz', () => {
    const olumlu = vitrinDenemeSatiri([
      paket({ denemeGunu: 30, denemeHakki: true, denemeGerekcesi: 'var' }),
      paket({ denemeGunu: 14, denemeHakki: true, denemeGerekcesi: 'var' }),
    ]);
    expect(olumlu?.ton).toBe('olumlu');
    expect(olumlu?.metin).not.toMatch(/\d/);
    const uyari = vitrinDenemeSatiri([
      paket({ denemeGunu: 30, denemeHakki: false, denemeGerekcesi: 'eposta-dogrulanmadi' }),
      paket({ denemeGunu: 14, denemeHakki: false, denemeGerekcesi: 'eposta-dogrulanmadi' }),
    ]);
    expect(uyari).toEqual({ ton: 'uyari', metin: DENEME_EPOSTA_DOGRULA_METNI });
  });

  it('denemeli paket yoksa / yanıt bozuksa satır YOK (rakam uydurulmaz)', () => {
    expect(vitrinDenemeSatiri([paket({ denemeGunu: 0, denemeHakki: false, denemeGerekcesi: null })])).toBeNull();
    expect(vitrinDenemeSatiri([])).toBeNull();
    expect(vitrinDenemeSatiri(null)).toBeNull();
    expect(vitrinDenemeSatiri(undefined)).toBeNull();
    expect(vitrinDenemeSatiri({} as any)).toBeNull();
    expect(vitrinDenemeSatiri([paket(null)])).toBeNull();
  });

  it('işlem metinleri: DWG "Pro paket" der (Basic DWG vermez)', () => {
    expect(vitrinIslemMetni('dwg')).toMatch(/Pro paket/);
    expect(vitrinIslemMetni('excel')).toMatch(/paket seçin/);
    expect(vitrinIslemMetni(null)).toBe(vitrinIslemMetni('genel'));
  });

  it('bölüm kartı metinleri: bilinen bölümler + bilinmeyen için genel metin', () => {
    expect(vitrinBolumBasligi('/library/mechanical-brands')).toBe('Kütüphanem paket seçince açılır');
    expect(vitrinBolumBasligi('/labor-firms')).toBe('İşçilik paket seçince açılır');
    expect(vitrinBolumBasligi('/quotes/new')).toBe('Yeni teklif paket seçince açılır');
    expect(vitrinBolumBasligi('/quotes/abc')).toBe('Teklif ekranı paket seçince açılır');
    expect(vitrinBolumBasligi('/yarin-eklenecek-bir-sayfa')).toBe('Bu bölüm paket seçince açılır');
    expect(vitrinBolumu('/yarin-eklenecek-bir-sayfa').aciklama.length).toBeGreaterThan(10);
  });
});

describe('C · bölüm kartı çizilir', () => {
  it('⭐ başlık + açıklama + /abonelik + Ana Sayfa bağlantısı (çıkmaz sokak yok)', () => {
    const html = renderToStaticMarkup(createElement(VitrinBolumKarti, { yol: '/library/mechanical-brands' }));
    expect(html).toContain('Kütüphanem paket seçince açılır');
    expect(html).toContain(vitrinBolumu('/library/mechanical-brands').aciklama);
    expect(html).toContain('href="/abonelik"');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('Paketleri gör');
  });
});

// ── D · BAĞLANTI (yorumsuz kaynak) ──────────────────────────────────────────
const kok = join(__dirname, '..', '..');
const yorumsuz = (yol: string) =>
  ts
    .createPrinter({ removeComments: true })
    .printFile(ts.createSourceFile(yol, readFileSync(join(kok, yol), 'utf-8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));

describe('D · BAĞLANTI — karar ekrana gerçekten bağlı mı', () => {
  it('⭐ kabuk: VitrinSaglayici CapabilitiesProvider İÇİNDE ve şerit/kapıyı SARAR', () => {
    const k = yorumsuz('app/(protected)/layout.tsx');
    const yetenekAc = k.indexOf('<CapabilitiesProvider>');
    const vitrinAc = k.indexOf('<VitrinSaglayici>');
    const serit = k.indexOf('<AbonelikSeridi');
    const kapi = k.indexOf('<ErisimKapisi>');
    const vitrinKapa = k.indexOf('</VitrinSaglayici>');
    const yetenekKapa = k.indexOf('</CapabilitiesProvider>');
    expect(vitrinAc, 'sağlayıcı kabukta yok').toBeGreaterThan(-1);
    expect(yetenekAc < vitrinAc && vitrinAc < serit && serit < kapi && kapi < vitrinKapa && vitrinKapa < yetenekKapa, JSON.stringify({ yetenekAc, vitrinAc, serit, kapi, vitrinKapa, yetenekKapa })).toBe(true);
  });

  it('⭐ kabuk kapısı: vitrin kartı DUVAR kararından ve {children}dan ÖNCE, beklemeden SONRA', () => {
    const k = yorumsuz('ozellik/odeme/ErisimKapisi.tsx');
    const bekleme = k.indexOf('if (loading)');
    const kart = k.indexOf('vitrinKartiGosterilsinMi(erisim, yol)');
    const duvar = k.indexOf('icerikDurdurulsunMu(erisim, yol');
    const cocuk = k.indexOf('{children}');
    expect(kart, 'kapı vitrin kararını okumuyor').toBeGreaterThan(-1);
    expect(bekleme < kart && kart < duvar && kart < cocuk, JSON.stringify({ bekleme, kart, duvar, cocuk })).toBe(true);
    expect(k).toMatch(/if \(vitrinKartiGosterilsinMi\(erisim, yol\)\)\s*return <VitrinBolumKarti yol=\{yol\}\s*\/>;/);
  });

  it('⭐ şerit: vitrinde METİN yerine deneme satırı', () => {
    const k = yorumsuz('ozellik/odeme/AbonelikSeridi.tsx');
    expect(k).toContain('useVitrin()');
    expect(k).toMatch(/\{vitrin && deneme \? deneme\.metin : uyari\.metin\}/);
  });

  it('⭐ sağlayıcı: deneme isteği ve 403 dinleyicisi YALNIZ vitrinde', () => {
    const k = yorumsuz('ozellik/odeme/VitrinSaglayici.tsx');
    const istek = k.search(/['"]\/abonelik\/paketler['"]/);
    const istekOncesi = k.lastIndexOf('if (!vitrin)', istek);
    expect(istek).toBeGreaterThan(-1);
    expect(istekOncesi, 'paket isteği vitrin kapısının arkasında değil').toBeGreaterThan(-1);
    const dinle = k.search(/addEventListener\(['"]abonelik-kisitli['"]/);
    const dinleOncesi = k.lastIndexOf('if (!vitrin)', dinle);
    expect(dinle).toBeGreaterThan(-1);
    expect(dinleOncesi, '403 dinleyicisi vitrin kapısının arkasında değil').toBeGreaterThan(istek);
    expect(k).toContain('vitrinMi(erisim)');
  });

  // İNCELEME W1 (24.09): düğmelerin hepsi `pencereAc`a gidiyor; pencerenin
  // KENDİSİ bağlı değilse beş iş düğmesi birden sessizce ölür (tıklama hiçbir
  // şey yapmaz). Sağlayıcı `@/` içe aktardığı için vitest'te çizilemiyor —
  // bağlantı yorumsuz kaynakta ölçülür.
  it('⭐⭐ pencere GERÇEKTEN açılır: pencereAc durumu yazar, pencere o durumla çizilir', () => {
    const k = yorumsuz('ozellik/odeme/VitrinSaglayici.tsx');
    expect(k, 'pencereAc durumu yazmıyor').toMatch(/if \(vitrin\)\s*setIslem\(i \?\? ['"]genel['"]\)/);
    expect(k, 'pencere çizilmiyor').toMatch(/\{vitrin && <VitrinPenceresi islem=\{islem\}/);
    expect(k, 'pencerenin açıklığı duruma bağlı değil').toMatch(/open=\{islem !== null\}/);
    expect(k, 'sağlayıcı pencereAc\'ı dışa vermiyor').toMatch(/\(\{ vitrin, deneme, pencereAc \}\)/);
    expect(k, 'pencereden /abonelik yolu yok').toMatch(/href=["']\/abonelik["']/);
  });

  it('⭐ 403 yedek yolu: olay pencereyi açar (dinleyici boş değil)', () => {
    const k = yorumsuz('ozellik/odeme/VitrinSaglayici.tsx');
    expect(k).toMatch(/const dinle = \(\) => setIslem\(\(?mevcut\)? => mevcut \?\? ['"]genel['"]\)/);
    expect(k).toMatch(/addEventListener\(['"]abonelik-kisitli['"], dinle\)/);
    expect(k).toMatch(/removeEventListener\(['"]abonelik-kisitli['"], dinle\)/);
  });

  it('⭐ Ana Sayfa kutuları: vitrinde gerçek kutu YERİNE vitrin kutusu, dosya ALINMAZ', () => {
    const k = yorumsuz('ortak/kabuk/components/dashboard/QuickStart.tsx');
    expect(k).toMatch(/: vitrin \? \(\s*<VitrinYuklemeKutusu tur="excel" onAc=\{pencereAc\}\s*\/>/);
    expect(k).toMatch(/: vitrin \? \(\s*<VitrinYuklemeKutusu tur="dwg" onAc=\{pencereAc\}\s*\/>/);
    const bas = k.indexOf('function VitrinYuklemeKutusu');
    expect(bas).toBeGreaterThan(-1);
    const govde = k.slice(bas);
    // Dosya seçici YOK; bırakma tarayıcıya kaçmaz ve pencereyi açar.
    expect(govde).not.toMatch(/<input/);
    expect(govde).toMatch(/onDrop=\{\(e\) => \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*setUstunde\(false\);\s*ac\(\);\s*\}\}/);
    expect(govde).toMatch(/onDragOver=\{\(e\) => \{\s*e\.preventDefault\(\);/);
    expect(govde).toContain('onClick={ac}');
  });

  it.each([
    'app/(protected)/materials/mechanical/page.tsx',
    'app/(protected)/materials/electrical/page.tsx',
  ])('⭐ havuz aktarımı vitrinde İSTEK ATMADAN pencere açar: %s', (yol) => {
    const k = yorumsuz(yol);
    const istek = k.search(/api\.post\(['"]\/library\/import-price-list['"]/);
    expect(istek, 'aktarım isteği bulunamadı (ölçüt bozuk)').toBeGreaterThan(-1);
    // İNCELEME S2 (24.09): kapı DOSYADA değil, aktarımı yapan İŞLEYİCİNİN
    // GÖVDESİNDE aranır — kapı başka bir işleyiciye (ör. `handleAddBrand`)
    // taşınsa dosya genelindeki sıra ölçüsü yeşil kalırdı.
    const isleyici = k.lastIndexOf('onClick={async (e) => {', istek);
    expect(isleyici, 'aktarım işleyicisi bulunamadı').toBeGreaterThan(-1);
    const govde = k.slice(isleyici, istek);
    expect(govde, 'vitrin kapısı aktarım işleyicisinde değil').toMatch(/if \(vitrin\) \{\s*pencereAc\(['"]kutuphane['"]\);\s*return;\s*\}/);
    expect(k).toContain('useVitrin()');
  });

  it('⭐ marka sayfası: aktarım vitrinde onaydan ÖNCE pencere; boş fiyat ÇÖKERTMEZ', () => {
    const k = yorumsuz('app/(protected)/materials/[brandId]/page.tsx');
    const fn = k.indexOf('async function handleImportToLibrary');
    expect(fn, 'aktarım işleyicisi bulunamadı (ölçüt bozuk)').toBeGreaterThan(-1);
    const kapi = k.slice(fn).search(/if \(vitrin\) \{\s*pencereAc\(['"]kutuphane['"]\);\s*return;\s*\}/);
    const onay = k.slice(fn).indexOf('await confirm(');
    expect(kapi).toBeGreaterThan(-1);
    expect(onay).toBeGreaterThan(-1);
    expect(kapi < onay).toBe(true);
    // `fmtPrice(m.price)` yalnız fiyat DOLUYKEN çağrılır.
    const fiyatCagrisi = k.indexOf('fmtPrice(m.price)');
    const bosDal = k.lastIndexOf('m.price == null', fiyatCagrisi);
    expect(fiyatCagrisi).toBeGreaterThan(-1);
    expect(bosDal, 'boş fiyat dalı biçimlemeden önce değil').toBeGreaterThan(-1);
    expect(k).toMatch(/setFiyatGizli\(listRes\.fiyatGizli === true\)/);
    expect(k).toMatch(/setFiyatGizli\(res\.fiyatGizli === true\)/);
    // İNCELEME S2 (24.09): NEDEN de ekranda — tablo üstü not ve hücre kilidi
    // sunucunun `fiyatGizli` bayrağına bağlı (boş hücre "—" değil).
    expect(k).toMatch(/\{fiyatGizli && \(\s*<p[\s\S]{0,400}\{HAVUZ_FIYAT_NOTU\}/);
    const kilit = k.indexOf('{HAVUZ_FIYAT_KILIDI_METNI}');
    expect(kilit, 'hücre kilidi yok').toBeGreaterThan(-1);
    expect(k.lastIndexOf('fiyatGizli ? (', kilit), 'kilit bayrağa bağlı değil').toBeGreaterThan(bosDal);
  });

  it('⭐ ekip: vitrinde davet pencere açar, "Basic paketinde ekip yok" YAZILMAZ', () => {
    const k = yorumsuz('app/(protected)/firma/ekip/page.tsx');
    expect(k).toMatch(/onClick=\{\(\) => pencereAc\(['"]ekip['"]\)\}/);
    expect(k).toMatch(/\{!vitrin && !veri\.davet\.acik && davetKapaliMetni && \(/);
    // Gerçek düğme vitrin DIŞINDA aynen (sunucu kararıyla pasif).
    expect(k).toMatch(/\{sahipMi && !vitrin && \(/);
  });
});
