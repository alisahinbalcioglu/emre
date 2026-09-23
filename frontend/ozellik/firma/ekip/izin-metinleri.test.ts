/**
 * 23.09.2026 — EKİP & İZİNLER: ön yüz (saf yardımcılar + BAĞLANTI).
 *
 * Kapı sunucudadır (`backend/test/ekip-izinleri-test.ts`). Burada ölçülen:
 *  · saf sözlük/yardımcılar doğru ve girdiyi DEĞİŞTİRMİYOR,
 *  · kabuk, menü, pano, teklif ve havuz ekranları izni GERÇEKTEN okuyor
 *    ("mekanizma var, bağlantı yok" bu depoda en sık ölçülen kusur).
 * Bileşenlerin ÇIKTISI `ekip-bilesenleri.test.ts`te gerçekten çizilerek
 * ölçülür; burada bağlantı KAYNAKTAN, yorumlar atılarak ölçülür (sayfa `@/`
 * içe aktardığı için vitest'te çizilemez).
 *
 * 23.09 İKİNCİ TASARIM: izin sütunlu tablo → etiketli üye listesi + davet
 * PENCERESİ + sağdan açılan izin PANELİ; emoji → lucide; açılış seçimi
 * Excel + DWG. Öncülleri çürüyen assert'ler aynı KURALI yeni yerinde ölçer.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  IZIN_SIRASI,
  IZIN_TANIMLARI,
  VARSAYILAN_DAVET_IZINLERI,
  izinDegistir,
  izinlerAyniMi,
  izinSirala,
  izinTanimi,
  uyeIzniReddiMi,
  yoneticiyeYazBaglantisi,
  type UyeIzni,
} from './izin-metinleri';
import { uyeIzniDurdurulsunMu, yolunIzni } from './uye-izni-kapisi';
import { koltukKarti } from './koltuk-metinleri';

const KOK = path.join(__dirname, '../../..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');
/** Yorumları at: kapı YORUMDA değil KODDA eşleşsin. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Ekip & İzinler ekran dosyaları (tasarımın görsel kuralları hepsine uygulanır). */
const EKIP_DOSYALARI = [
  'app/(protected)/firma/ekip/page.tsx',
  'ozellik/firma/ekip/UyeListesi.tsx',
  'ozellik/firma/ekip/DavetPenceresi.tsx',
  'ozellik/firma/ekip/UyeIzinPaneli.tsx',
  'ozellik/firma/ekip/IzinSecici.tsx',
  'ozellik/firma/ekip/CikarmaBolumu.tsx',
  'ozellik/firma/ekip/ekip-parcalari.tsx',
  'ozellik/firma/ekip/UyeIzniKapisi.tsx',
  'ozellik/firma/ekip/KilitliOzellikKarti.tsx',
  'ozellik/firma/ekip/izin-metinleri.ts',
];
// `u` bayraklı düzenli ifade LİTERALİ yazılmadı: tsconfig hedefi ES5 (TS1501).
const EMOJI = new RegExp('\\p{Extended_Pictographic}', 'u');

describe('izin sözlüğü (saf)', () => {
  it('dört izin, sunucunun kanonik sırasıyla; her tanımın metni dolu', () => {
    expect(IZIN_SIRASI).toEqual(['excel', 'dwg', 'firmaTeklifleri', 'kutuphane']);
    for (const t of IZIN_TANIMLARI) {
      expect(t.baslik && t.aciklama && t.etiket && t.erisimYokBasligi && t.erisimYokAciklamasi, t.anahtar).toBeTruthy();
    }
  });

  it('metinler TASARIMDAN: başlık ve üye satırı etiketi', () => {
    expect(IZIN_TANIMLARI.map((t) => t.baslik)).toEqual([
      'Excel keşif', 'DWG proje', 'Son teklifler ve tutarları', 'Kütüphanem',
    ]);
    expect(IZIN_TANIMLARI.map((t) => t.etiket)).toEqual([
      'Excel keşif', 'DWG proje', 'Teklif tutarları', 'Kütüphanem',
    ]);
  });

  it('"Fiyat bilgisi" rozeti YALNIZ fiyat gösteren iki izinde', () => {
    expect(IZIN_TANIMLARI.filter((t) => t.fiyatBilgisi).map((t) => t.anahtar)).toEqual(['firmaTeklifleri', 'kutuphane']);
  });

  it('⭐ davet penceresinin açılış seçimi TASARIMDAKİ gibi: Excel + DWG (fiyat bilgisi taşıyanlar KAPALI)', () => {
    expect([...VARSAYILAN_DAVET_IZINLERI]).toEqual(['excel', 'dwg']);
    for (const i of VARSAYILAN_DAVET_IZINLERI) expect(izinTanimi(i)?.fiyatBilgisi, i).toBe(false);
  });

  it('"Son teklifler" açıklaması Emre kararıyla uyumlu (liste kaybolmaz, FİRMANIN teklifleri)', () => {
    const t = izinTanimi('firmaTeklifleri');
    expect(t?.aciklama).toContain('Firmanın');
    // Kapalı bölüm metni kişiye kendi tekliflerini görebildiğini söyler.
    expect(t?.erisimYokAciklamasi).toContain('Kendi hazırladığın teklifleri');
  });

  it('kapalı bölüm başlığı tasarımdaki yazımla', () => {
    expect(izinTanimi('kutuphane')?.erisimYokBasligi).toBe('Kütüphanem’e erişimin yok');
    expect(izinTanimi('kutuphane')?.erisimYokAciklamasi).toBe(
      'Bu bölüm firmanın kayıtlı marka ve birim fiyatlarını içerir. Firma yöneticin bu bölümü senin için kapalı tuttu.',
    );
  });

  it('izinSirala: kanonik sıra, tekrar ve bilinmeyen atılır', () => {
    expect(izinSirala(['kutuphane', 'excel', 'excel', 'yonetici'])).toEqual(['excel', 'kutuphane']);
    expect(izinSirala(null)).toEqual([]);
  });

  it('izinDegistir: YENİ dizi döner, girdi DEĞİŞMEZ', () => {
    const girdi: UyeIzni[] = ['kutuphane'];
    const kopya = [...girdi];
    expect(izinDegistir(girdi, 'excel', true)).toEqual(['excel', 'kutuphane']);
    expect(izinDegistir(girdi, 'kutuphane', false)).toEqual([]);
    expect(girdi).toEqual(kopya);
  });

  it('izinlerAyniMi sırayı önemsemez', () => {
    expect(izinlerAyniMi(['dwg', 'excel'], ['excel', 'dwg'])).toBe(true);
    expect(izinlerAyniMi(['dwg'], ['excel', 'dwg'])).toBe(false);
  });

  it('uyeIzniReddiMi yalnız 403 UYE_IZNI_YOK (ödeme reddi DEĞİL)', () => {
    expect(uyeIzniReddiMi({ response: { status: 403, data: { kod: 'UYE_IZNI_YOK' } } })).toBe(true);
    expect(uyeIzniReddiMi({ response: { status: 403, data: { kod: 'ABONELIK_KISITLI' } } })).toBe(false);
    expect(uyeIzniReddiMi(new Error('x'))).toBe(false);
  });

  it('⭐ "E-posta gönder" bağlantısı tasarımdaki mailto ile BAYT BAYT aynı', () => {
    expect(yoneticiyeYazBaglantisi('emre.basarann1@gmail.com', 'kutuphane')).toBe(
      'mailto:emre.basarann1@gmail.com?subject=K%C3%BCt%C3%BCphanem%20eri%C5%9Fimi',
    );
    expect(yoneticiyeYazBaglantisi('a@b.co')).toBe('mailto:a@b.co');
  });
});

describe('görsel kural: emoji YOK, ikonlar lucide', () => {
  it('Ekip & İzinler dosyalarında emoji geçmiyor (yorumlar dahil değil)', () => {
    for (const d of EKIP_DOSYALARI) expect(EMOJI.test(kodu(oku(d))), d).toBe(false);
  });
  it('dört izin simgesi lucide (tasarımdaki ikonlar)', () => {
    const k = kodu(oku('ozellik/firma/ekip/izin-simgeleri.ts'));
    expect(k).toContain("from 'lucide-react'");
    for (const s of ['excel: FileSpreadsheet', 'dwg: Ruler', 'firmaTeklifleri: Banknote', 'kutuphane: BookOpen']) {
      expect(k, s).toContain(s);
    }
  });
});

describe('kullanıcı hakkı kartı (saf)', () => {
  it('⭐ tasarımın örneği: 3 aktif + 1 bekleyen / 5 → "4 / 5", çubuk %80', () => {
    expect(koltukKarti({ aktif: 3, bekleyen: 1, hak: 5 })).toEqual({
      deger: '4 / 5',
      aciklama: 'Planında sen dahil 5 kullanıcı var. Bekleyen davetler de hakkından düşer.',
      oran: 80,
    });
  });
  it('bekleyen davet de hakkı kullanır (sunucu kararıyla aynı sayım)', () => {
    expect(koltukKarti({ aktif: 2, bekleyen: 1, hak: 5 }).deger).toBe('3 / 5');
  });
  it('abonelik yoksa çubuk yok, taşma %100 ile sınırlı', () => {
    expect(koltukKarti({ aktif: 1, bekleyen: 0, hak: null })).toMatchObject({ deger: '1 / —', oran: null });
    expect(koltukKarti({ aktif: 1, bekleyen: 0, hak: 0 }).oran).toBeNull();
    expect(koltukKarti({ aktif: 4, bekleyen: 0, hak: 3 }).oran).toBe(100);
  });
});

describe('yol → izin (kabuk kapısı, saf)', () => {
  it('kütüphane, işçilik firmaları ve DWG çalışma alanı izne bağlı', () => {
    expect(yolunIzni('/library')).toBe('kutuphane');
    expect(yolunIzni('/library/brand/abc')).toBe('kutuphane');
    expect(yolunIzni('/labor-firms/1')).toBe('kutuphane');
    expect(yolunIzni('/dwg-workspace')).toBe('dwg');
  });
  it('havuz, teklifler, ekip ve benzer önekler izne BAĞLI DEĞİL', () => {
    for (const y of ['/materials', '/materials/x', '/quotes', '/quotes/new', '/firma/ekip', '/libraryx', '/quote-formats']) {
      expect(yolunIzni(y), y).toBeNull();
    }
  });
  it('durdurma yalnız izin YOKSA', () => {
    expect(uyeIzniDurdurulsunMu('/library', () => false)).toBe('kutuphane');
    expect(uyeIzniDurdurulsunMu('/library', () => true)).toBeNull();
    expect(uyeIzniDurdurulsunMu('/quotes', () => false)).toBeNull();
  });
});

describe('⭐ BAĞLANTI — ekranlar izni gerçekten okuyor (kaynak)', () => {
  it('sağlayıcı izinleri ve firma rolünü AYNI /auth/me yanıtından alır; bilgi yoksa ekranı boşaltmaz', () => {
    const k = kodu(oku('ortak/contexts/CapabilitiesContext.tsx'));
    expect(k).toContain('setIzinler(Array.isArray(data?.izinler) ? izinSirala(data.izinler) : null)');
    expect(k).toMatch(/izinVar = \(izin: UyeIzni\) => \(izinler === null \? true : izinler\.includes\(izin\)\)/);
    // Rol yalnız iki bilinen değerden biriyse; gerisi "bilinmiyor".
    expect(k).toContain("setFirmaRol(data?.firmaRol === 'sahip' || data?.firmaRol === 'uye' ? data.firmaRol : null)");
    // İkinci bir /auth/me isteği AÇILMADI.
    expect((k.match(/api\.get\('\/auth\/me'\)/g) ?? []).length).toBe(1);
  });

  it('kabuk: UyeIzniKapisi ErisimKapisi\'nin İÇİNDE (izin listesi yanıttan sonra okunur)', () => {
    const k = kodu(oku('app/(protected)/layout.tsx'));
    expect(k).toMatch(/<ErisimKapisi>\s*<UyeIzniKapisi>\{children\}<\/UyeIzniKapisi>\s*<\/ErisimKapisi>/);
  });

  it('kapalı bölüm sayfası: tasarımdaki başlık, yönetici adresi ve mailto', () => {
    const k = kodu(oku('ozellik/firma/ekip/UyeIzniKapisi.tsx'));
    expect(k).toContain('tanim?.erisimYokBasligi');
    expect(k).toContain('useFirmaYoneticisi(true)');
    expect(k).toContain('yoneticiyeYazBaglantisi(yonetici, izin)');
    // Adres bilinmiyorsa bağlantı çizilmez (boş mailto yok).
    expect(k).toMatch(/\{yonetici && \(\s*<a/);
  });

  it('⭐ menü: kapalı bölüm GİZLENMEZ, KİLİTLE durur; Ekip ve Abonelik yalnız ÜYEDE gizli', () => {
    const k = kodu(oku('ortak/kabuk/components/layout/Sidebar.tsx'));
    // Eski süzgeç (kapalı Kütüphanem menüden düşüyordu) KALMADI.
    expect(k).not.toContain("i.href !== '/library'");
    // Yol → izin eşlemesi TEK yerden; kilit o eşlemeden türetilir.
    expect(k).toContain("from '@/ozellik/firma/ekip/uye-izni-kapisi'");
    expect(k).toMatch(/const izin = yolunIzni\(href\);\s*return izin !== null && !izinVar\(izin\);/);
    expect(k).toMatch(/\{!collapsed && kilitli && \(\s*<Lock/);
    // Yalnız BİLİNEN üye: `null` sahip sayılmaz ama menü de boşaltılmaz.
    expect(k).toContain("const YALNIZ_YONETICIYE = ['/firma/ekip', '/abonelik'];");
    expect(k).toMatch(/firmaRol === 'uye'\s*\? hesabaGore\.filter\(\(i\) => typeof i === 'string' \|\| !YALNIZ_YONETICIYE\.includes\(i\.href\)\)\s*: hesabaGore/);
    expect(k).toContain("label: 'Ekip'");
    // Panodaki hızlı erişim kartı: Kütüphanem izni yoksa kart yine süzülür.
    const pano = kodu(oku('ortak/kabuk/components/dashboard/QuickAccess.tsx'));
    expect(pano).toContain("izinVar('kutuphane') ? ITEMS : ITEMS.filter((i) => i.href !== '/library')");
    expect(pano).toContain('ogeler.map(');
  });

  it('pano: Excel/DWG kutuları izne bağlı; izinsiz üyeye KİLİTLİ KART (paket önerilmez)', () => {
    const k = kodu(oku('ortak/kabuk/components/dashboard/QuickStart.tsx'));
    expect(k).toContain("!izinVar('excel')");
    expect(k).toContain("!izinVar('dwg')");
    // Kutu GERÇEKTEN kilitli: izin kapı girdisine bağlı (yalnız görünüm değil).
    expect(k).toMatch(/izinVar: hasAnyMaterial\(\) && !hesapKapali && !excelUyeKapali/);
    expect(k).toMatch(/dwgVar: hasAnyDwg\(\) && !hesapKapali && !dwgUyeKapali/);
    expect(k).toMatch(/excelUyeKapali \? \(\s*<KilitliOzellikKarti baslik="Excel Keşif" izin="excel"/);
    expect(k).toMatch(/dwgUyeKapali \? \(\s*<KilitliOzellikKarti baslik="DWG Proje" izin="dwg"/);
    // Yönetici adresi YALNIZ kilitli kart çizilecekse istenir.
    expect(k).toContain("useFirmaYoneticisi(firmaRol === 'uye' && (excelUyeKapali || dwgUyeKapali))");
    const kart = kodu(oku('ozellik/firma/ekip/KilitliOzellikKarti.tsx'));
    expect(kart).toContain('Yöneticin bu özelliği senin için kapattı.');
    expect(kart).not.toMatch(/abonelik|Paket seç|Pro pakete/);
  });

  it('⭐ ekip sayfası: davet izinleri GÖNDERİR, panel doğru uçlara gider', () => {
    const k = kodu(oku('app/(protected)/firma/ekip/page.tsx'));
    expect(k).toContain("api.post('/firma/davetler', { eposta, izinler })");
    expect(k).toContain('onGonder={davetGonder}');
    // Aktif üye → izin ucu; bekleyen davet → aynı adrese yeniden davet (tek API yolu).
    expect(k).toContain('api.patch(`/firma/uyeler/${u.id}/izinler`, { izinler })');
    expect(k).toContain("api.post('/firma/davetler', { eposta: d.eposta, izinler })");
    // Çıkarma onayı PANELİN HEDEFİNDEN (sunucu ONAY_UYUSMADI ile sınar).
    expect(k).toContain('{ data: { epostaOnayi: hedef.uye.eposta } }');
    expect(k).toContain('api.delete(`/firma/davetler/${hedef.davet.id}`)');
    // "Üye davet et" SUNUCU kararıyla pasif.
    expect(k).toMatch(/disabled=\{!veri\.davet\.acik \|\| islemde\}/);
    const pencere = kodu(oku('ozellik/firma/ekip/DavetPenceresi.tsx'));
    expect(pencere).toContain('useState<UyeIzni[]>([...VARSAYILAN_DAVET_IZINLERI])');
    expect(pencere).toContain('<IzinSecici secili={izinler} onDegis={setIzinler}');
    expect(pencere).toContain('onGonder(eposta.trim(), izinler)');
    expect(pencere).toContain('davetEpostaHatasi(eposta, ekip)');
    // Denetim GERÇEKTEN gönderimi durduruyor (yalnız metin göstermekle kalmıyor).
    expect(pencere).toContain('if (hata !== null || islemde) return;');
  });

  it('her işlemin sonucu BİLDİRİMLE; alert() YOK', () => {
    const k = kodu(oku('app/(protected)/firma/ekip/page.tsx'));
    expect(k).toContain("import { toast } from '@/ortak/hooks/use-toast';");
    expect(k).toContain('toast({ title: basariMetni })');
    expect(k).toContain("toast({ variant: 'destructive', title: 'İşlem tamamlanamadı', description: kimlikHataMetni(e) })");
    for (const d of EKIP_DOSYALARI) expect(kodu(oku(d)), d).not.toMatch(/\balert\(|window\.confirm\(/);
  });

  it('eski koyu tema sınıfları sayfadan KALKTI (açık zeminde başlık okunmuyordu)', () => {
    for (const d of EKIP_DOSYALARI) {
      const k = kodu(oku(d));
      expect(k, d).not.toMatch(/text-slate-100\b/);
      // Yasak olan koyu PANEL zemini (eski `bg-slate-900` / `bg-slate-950`
      // kutular). Ana düğme tasarımda `#0f172a` — keyfi değerle yazılır.
      expect(k, d).not.toMatch(/bg-slate-9(?:00|50)(?![/\d])/);
    }
  });

  it('yeni teklif: Kütüphanem izni yoksa kütüphane istekleri ATILMAZ, Excel yükleme kilitli', () => {
    const k = kodu(oku('app/(protected)/quotes/new/page.tsx'));
    expect(k).toMatch(/if \(!kutuphaneIzni\) return;\s*api\.get<Brand\[\]>\('\/library\/brands'\)/);
    expect(k).toContain('if (!hasAnyLabor || !kutuphaneIzni) return;');
    expect(k).toMatch(/\{!excelIzni \? \(\s*<p[^>]*>\s*<Lock/);
    expect(k).toContain('Yöneticin bu özelliği senin için kapattı.');
  });

  it('Malzeme Havuzu: "Kütüphaneme Aktar" üç ekranda da izne bağlı', () => {
    for (const d of [
      'app/(protected)/materials/mechanical/page.tsx',
      'app/(protected)/materials/electrical/page.tsx',
      'app/(protected)/materials/[brandId]/page.tsx',
    ]) {
      expect(kodu(oku(d)), d).toMatch(/\{izinVar\('kutuphane'\) && \(/);
    }
  });

  it('teklif listesi ve pano kartı kapsam notunu izinden alır', () => {
    expect(kodu(oku('app/(protected)/quotes/page.tsx'))).toContain("const yalnizKendi = !izinVar('firmaTeklifleri');");
    expect(kodu(oku('ozellik/teklif/dashboard/RecentQuotes.tsx'))).toContain("const yalnizKendi = !izinVar('firmaTeklifleri');");
  });

  it('kırıntı: sayfası olmayan "firma" parçası çizilmez, "ekip" Türkçe', () => {
    const k = kodu(oku('ortak/kabuk/components/layout/Breadcrumb.tsx'));
    expect(k).toContain("const SAYFASIZ_PARCA = new Set(['firma']);");
    expect(k).toContain("ekip: 'Ekip'");
  });
});
