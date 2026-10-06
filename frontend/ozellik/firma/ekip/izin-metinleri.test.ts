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
 * PENCERESİ + sağdan açılan izin PANELİ; emoji → lucide. Öncülleri çürüyen
 * assert'ler aynı KURALI yeni yerinde ölçer.
 *
 * 06.10 İKİ YETKİ: `excel` + `kutuphane` + `firmaTeklifleri` → `fiyat`;
 * `dwg` aynı. Açılış seçimi BOŞ, en az bir yetki zorunlu. "İzin KAPALI"
 * fikstürleri `['dwg']` ya da `[]` — `['fiyat', ...]` kullanıcıyı yetkili
 * yapıp testi körleştirirdi.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EN_AZ_BIR_YETKI_METNI,
  IZIN_SIRASI,
  IZIN_TANIMLARI,
  VARSAYILAN_DAVET_IZINLERI,
  izinDegistir,
  izinlerAyniMi,
  izinSatirlari,
  izinSecimiGecerli,
  izinSirala,
  izinVarMi,
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
  it('⭐ iki yetki (06.10), sunucunun kanonik sırasıyla; her tanımın metni dolu', () => {
    expect(IZIN_SIRASI).toEqual(['fiyat', 'dwg']);
    expect(IZIN_TANIMLARI.length).toBe(2);
    for (const t of IZIN_TANIMLARI) {
      expect(t.baslik && t.aciklama && t.etiket && t.erisimYokBasligi && t.erisimYokAciklamasi, t.anahtar).toBeTruthy();
    }
  });

  it('başlık ve üye satırı etiketi', () => {
    expect(IZIN_TANIMLARI.map((t) => t.baslik)).toEqual([
      'Fiyatlandırma ve teklifler (Excel keşif)', 'DWG’den metraj',
    ]);
    expect(IZIN_TANIMLARI.map((t) => t.etiket)).toEqual(['Fiyatlandırma ve teklifler', 'DWG’den metraj']);
  });

  it('"Fiyat bilgisi" rozeti YALNIZ fiyat yetkisinde', () => {
    expect(IZIN_TANIMLARI.filter((t) => t.fiyatBilgisi).map((t) => t.anahtar)).toEqual(['fiyat']);
  });

  it('fiyat yetkisi eski üç iznin birleşimini anlatır: Excel keşif, eşleştirme, kütüphane, işçilik, formatlar, TÜM teklifler', () => {
    const a = izinTanimi('fiyat')?.aciklama ?? '';
    for (const p of ['Excel keşif', 'fiyat eşleştirir', 'firma kütüphanesini', 'işçilik firmalarını', 'teklif formatlarını', 'Firmanın tüm tekliflerini']) {
      expect(a, p).toContain(p);
    }
  });

  it('⭐ DWG açıklaması: yalnız DWG yetkili üye metrajı hazırlayıp KAYDEDER; fiyatlandırmayı fiyat yetkilisi yapar', () => {
    const a = izinTanimi('dwg')?.aciklama ?? '';
    expect(a).toContain('metrajı hazırlayıp kaydeder');
    expect(a).toContain('fiyatlandırmayı fiyat yetkisi olan biri yapar');
  });

  it('⭐ davet penceresinin açılış seçimi BOŞ (en az yetki) ve boş seçim GEÇERSİZ', () => {
    expect([...VARSAYILAN_DAVET_IZINLERI]).toEqual([]);
    expect(izinSecimiGecerli(VARSAYILAN_DAVET_IZINLERI)).toBe(false);
  });

  it('⭐ izinSecimiGecerli: en az bir BİLİNEN yetki; eski anahtar tek başına sayılmaz', () => {
    expect(izinSecimiGecerli([])).toBe(false);
    expect(izinSecimiGecerli(null)).toBe(false);
    expect(izinSecimiGecerli(undefined)).toBe(false);
    expect(izinSecimiGecerli(['dwg'])).toBe(true);
    expect(izinSecimiGecerli(['fiyat'])).toBe(true);
    expect(izinSecimiGecerli(['fiyat', 'dwg'])).toBe(true);
    // 06.10 öncesi anahtarlar: göçte düşen değerler seçim SAYILMAZ.
    expect(izinSecimiGecerli(['excel', 'kutuphane', 'firmaTeklifleri'])).toBe(false);
    expect(EN_AZ_BIR_YETKI_METNI).toBe('En az bir yetki seçin');
  });

  it('kapalı bölüm sayfası: fiyat yetkisinin kapısı üç yolu da (kütüphane, işçilik, formatlar) anar', () => {
    expect(izinTanimi('fiyat')?.erisimYokBasligi).toBe('Fiyat yetkin kapalı');
    expect(izinTanimi('fiyat')?.erisimYokAciklamasi).toBe(
      'Firma kütüphanesi, işçilik firmaları ve teklif formatları fiyat yetkisiyle açılır. Firma yöneticin bu bölümü senin için kapalı tuttu.',
    );
    expect(izinTanimi('dwg')?.erisimYokBasligi).toBe('DWG’den metraja erişimin yok');
  });

  it('⭐ DÜRÜSTLÜK: bu sürümde fiyatı kapalı üye KENDİ teklifinin tutarını görür — hiçbir metin "fiyat/tutar göremez" demez', () => {
    for (const t of IZIN_TANIMLARI) {
      for (const m of [t.aciklama, t.kapaliAciklamasi, t.erisimYokAciklamasi]) {
        if (m) expect(m, `${t.anahtar}: ${m}`).not.toMatch(/göremez|görmez|gizli|gizlenir/i);
      }
    }
    // Elle birim fiyat yazmak yetkiye bağlı DEĞİL: kapalı olan "fiyat EŞLEŞTİRME",
    // "fiyatlandırma" değil (kod incelemesi 06.10).
    const kapali = izinTanimi('fiyat')?.kapaliAciklamasi ?? '';
    expect(kapali).toContain('fiyat eşleştirme');
    expect(kapali).not.toMatch(/fiyatlandırma/i);
  });

  it('⭐ izinVarMi: SAHİP liste ne derse desin her yetkiye sahip; üye ve bilinmeyen rol listeye bakar', () => {
    // Geçiş penceresi: eski sunucu / bayat liste sahibe boş ya da eksik liste verebilir.
    for (const liste of [[], ['dwg'], null] as (UyeIzni[] | null)[]) {
      expect(izinVarMi(liste, 'sahip', 'fiyat'), JSON.stringify(liste)).toBe(true);
      expect(izinVarMi(liste, 'sahip', 'dwg'), JSON.stringify(liste)).toBe(true);
    }
    // Üye: yalnız listesindeki.
    expect(izinVarMi(['dwg'], 'uye', 'fiyat')).toBe(false);
    expect(izinVarMi(['dwg'], 'uye', 'dwg')).toBe(true);
    expect(izinVarMi([], 'uye', 'dwg')).toBe(false);
    // Rol bilinmiyor: sahip SAYILMAZ, liste karar verir.
    expect(izinVarMi(['dwg'], null, 'fiyat')).toBe(false);
    expect(izinVarMi([], null, 'dwg')).toBe(false);
    // Liste bilinmiyor (sunucu söylemedi): ekran boşaltılmaz.
    expect(izinVarMi(null, 'uye', 'fiyat')).toBe(true);
    expect(izinVarMi(null, null, 'fiyat')).toBe(true);
  });

  it('izinSirala: kanonik sıra, tekrar, bilinmeyen ve 06.10 öncesi anahtarlar atılır', () => {
    expect(izinSirala(['dwg', 'fiyat', 'fiyat', 'excel', 'kutuphane', 'firmaTeklifleri', 'yonetici'])).toEqual(['fiyat', 'dwg']);
    expect(izinSirala(['excel', 'kutuphane'])).toEqual([]);
    expect(izinSirala(null)).toEqual([]);
  });

  it('izinDegistir: YENİ dizi döner, girdi DEĞİŞMEZ', () => {
    const girdi: UyeIzni[] = ['dwg'];
    const kopya = [...girdi];
    expect(izinDegistir(girdi, 'fiyat', true)).toEqual(['fiyat', 'dwg']);
    expect(izinDegistir(girdi, 'dwg', false)).toEqual([]);
    expect(girdi).toEqual(kopya);
  });

  it('izinlerAyniMi sırayı önemsemez', () => {
    expect(izinlerAyniMi(['dwg', 'fiyat'], ['fiyat', 'dwg'])).toBe(true);
    expect(izinlerAyniMi(['dwg'], ['fiyat', 'dwg'])).toBe(false);
  });

  it('uyeIzniReddiMi yalnız 403 UYE_IZNI_YOK (ödeme reddi DEĞİL)', () => {
    expect(uyeIzniReddiMi({ response: { status: 403, data: { kod: 'UYE_IZNI_YOK' } } })).toBe(true);
    expect(uyeIzniReddiMi({ response: { status: 403, data: { kod: 'ABONELIK_KISITLI' } } })).toBe(false);
    expect(uyeIzniReddiMi(new Error('x'))).toBe(false);
  });

  it('⭐ "E-posta gönder" bağlantısı BAYT BAYT: konu KISA etiketten ("(Excel keşif)" konuya taşınmaz)', () => {
    expect(yoneticiyeYazBaglantisi('emre.basarann1@gmail.com', 'fiyat')).toBe(
      'mailto:emre.basarann1@gmail.com?subject=Fiyatland%C4%B1rma%20ve%20teklifler%20eri%C5%9Fimi',
    );
    expect(yoneticiyeYazBaglantisi('a@b.co', 'dwg')).toBe('mailto:a@b.co?subject=DWG%E2%80%99den%20metraj%20eri%C5%9Fimi');
    expect(yoneticiyeYazBaglantisi('a@b.co')).toBe('mailto:a@b.co');
  });
});

describe('izinSatirlari — Hesabım › Ekip erişimim (saf)', () => {
  const FIYAT_KAPALI = 'Excel keşif, fiyat eşleştirme ve firma kütüphanesi kapalı; yalnız kendi hazırladığı teklifleri görür.';

  it('⭐ sunucu listeyi SÖYLEMEDİYSE satır YOK — "Açık"/"Kapalı" uydurulmaz', () => {
    expect(izinSatirlari(null)).toBeNull();
    expect(izinSatirlari(undefined)).toBeNull();
  });

  it('⭐ boş liste bilinen bir durumdur: iki satır, ikisi de KAPALI (null ile karışmaz)', () => {
    const s = izinSatirlari([]);
    expect(s?.length).toBe(2);
    expect(s?.map((x) => x.acik)).toEqual([false, false]);
  });

  it('satırlar kanonik sırayla; açık/kapalı ETKİN listeden (iki yön de)', () => {
    const yalnizDwg = izinSatirlari(['dwg']);
    expect(yalnizDwg?.map((x) => x.anahtar)).toEqual([...IZIN_SIRASI]);
    expect(yalnizDwg?.map((x) => x.acik)).toEqual([false, true]);
    expect(izinSatirlari(['fiyat'])?.map((x) => x.acik)).toEqual([true, false]);
  });

  it('metin SÖZLÜKTEN: açıkken `aciklama`, kapalıyken `kapaliAciklamasi ?? aciklama`', () => {
    const acik = izinSatirlari([...IZIN_SIRASI]) ?? [];
    const kapali = izinSatirlari([]) ?? [];
    expect(acik.length).toBe(IZIN_TANIMLARI.length);
    expect(kapali.length).toBe(IZIN_TANIMLARI.length);
    IZIN_TANIMLARI.forEach((t, i) => {
      expect(acik[i].baslik, t.anahtar).toBe(t.baslik);
      expect(kapali[i].baslik, t.anahtar).toBe(t.baslik);
      expect(acik[i].aciklama, t.anahtar).toBe(t.aciklama);
      expect(kapali[i].aciklama, t.anahtar).toBe(t.kapaliAciklamasi ?? t.aciklama);
    });
  });

  it('⭐ fiyat kapalı = elde kalan YALNIZ KENDİ teklifleri (Emre 23.09 kuralı korunur); açıkken firmanın tüm teklifleri', () => {
    const satir = (izinler: UyeIzni[]) => izinSatirlari(izinler)?.find((x) => x.anahtar === 'fiyat');
    expect(satir(['dwg'])?.aciklama).toBe(FIYAT_KAPALI);
    expect(satir(['fiyat'])?.aciklama).toContain('Firmanın tüm tekliflerini görür.');
  });

  it('kapalı metni YALNIZ fiyatta: DWG kapalıyken elde kalan ayrı bir şey yok', () => {
    expect(IZIN_TANIMLARI.filter((t) => t.kapaliAciklamasi).map((t) => t.anahtar)).toEqual(['fiyat']);
  });

  it('girdi DEĞİŞMEZ', () => {
    const girdi: UyeIzni[] = ['dwg'];
    izinSatirlari(girdi);
    expect(girdi).toEqual(['dwg']);
  });
});

describe('görsel kural: emoji YOK, ikonlar lucide', () => {
  it('Ekip & İzinler dosyalarında emoji geçmiyor (yorumlar dahil değil)', () => {
    for (const d of EKIP_DOSYALARI) expect(EMOJI.test(kodu(oku(d))), d).toBe(false);
  });
  it('iki yetki simgesi lucide: fiyat → Banknote, dwg → Ruler', () => {
    const k = kodu(oku('ozellik/firma/ekip/izin-simgeleri.ts'));
    expect(k).toContain("from 'lucide-react'");
    for (const s of ['fiyat: Banknote', 'dwg: Ruler']) {
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
  it('⭐ firma kütüphanesi, işçilik firmaları ve teklif formatları FİYAT yetkisine; DWG çalışma alanı DWG\'ye bağlı', () => {
    expect(yolunIzni('/library')).toBe('fiyat');
    expect(yolunIzni('/library/brand/abc')).toBe('fiyat');
    expect(yolunIzni('/labor-firms/1')).toBe('fiyat');
    // 06.10: teklif formatları da fiyat yetkisine bağlandı (önceki sürümde izinsizdi).
    expect(yolunIzni('/quote-formats')).toBe('fiyat');
    expect(yolunIzni('/quote-formats/abc')).toBe('fiyat');
    expect(yolunIzni('/dwg-workspace')).toBe('dwg');
  });
  it('havuz, teklifler, ekip ve benzer önekler izne BAĞLI DEĞİL', () => {
    for (const y of ['/materials', '/materials/x', '/quotes', '/quotes/new', '/firma/ekip', '/libraryx', '/quote-formatsx', '/dwg-workspacex']) {
      expect(yolunIzni(y), y).toBeNull();
    }
  });
  it('durdurma yalnız İLGİLİ yetki YOKSA (DWG yetkili üye fiyat yollarında durur, DWG\'de durmaz)', () => {
    expect(uyeIzniDurdurulsunMu('/library', () => false)).toBe('fiyat');
    expect(uyeIzniDurdurulsunMu('/library', () => true)).toBeNull();
    expect(uyeIzniDurdurulsunMu('/quotes', () => false)).toBeNull();
    const yalnizDwg = (i: UyeIzni) => i === 'dwg';
    expect(uyeIzniDurdurulsunMu('/quote-formats', yalnizDwg)).toBe('fiyat');
    expect(uyeIzniDurdurulsunMu('/labor-firms', yalnizDwg)).toBe('fiyat');
    expect(uyeIzniDurdurulsunMu('/dwg-workspace', yalnizDwg)).toBeNull();
    const yalnizFiyat = (i: UyeIzni) => i === 'fiyat';
    expect(uyeIzniDurdurulsunMu('/dwg-workspace', yalnizFiyat)).toBe('dwg');
    expect(uyeIzniDurdurulsunMu('/library', yalnizFiyat)).toBeNull();
  });
});

describe('⭐ BAĞLANTI — ekranlar izni gerçekten okuyor (kaynak)', () => {
  it('sağlayıcı izinleri ve firma rolünü AYNI /auth/me yanıtından alır; bilgi yoksa ekranı boşaltmaz', () => {
    const k = kodu(oku('ortak/contexts/CapabilitiesContext.tsx'));
    expect(k).toContain('setIzinler(Array.isArray(data?.izinler) ? izinSirala(data.izinler) : null)');
    // 06.10: karar saf `izinVarMi`de; sağlayıcı ROLÜ de verir (sahip → hep true).
    expect(k).toContain("import { izinSirala, izinVarMi, type UyeIzni } from '@/ozellik/firma/ekip/izin-metinleri';");
    expect(k).toContain('const izinVar = (izin: UyeIzni) => izinVarMi(izinler, firmaRol, izin);');
    expect((k.match(/const izinVar = /g) ?? []).length).toBe(1);
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
    // Eski süzgeç (kapalı kütüphane menüden düşüyordu) KALMADI.
    expect(k).not.toContain("i.href !== '/library'");
    // Yol → izin eşlemesi TEK yerden; kilit o eşlemeden türetilir.
    expect(k).toContain("from '@/ozellik/firma/ekip/uye-izni-kapisi'");
    expect(k).toMatch(/const izin = yolunIzni\(href\);\s*return izin !== null && !izinVar\(izin\);/);
    expect(k).toMatch(/\{!collapsed && kilitli && \(\s*<Lock/);
    // Yalnız BİLİNEN üye: `null` sahip sayılmaz ama menü de boşaltılmaz.
    expect(k).toContain("const YALNIZ_YONETICIYE = ['/firma/ekip', '/abonelik'];");
    expect(k).toMatch(/firmaRol === 'uye'\s*\? hesabaGore\.filter\(\(i\) => typeof i === 'string' \|\| !YALNIZ_YONETICIYE\.includes\(i\.href\)\)\s*: hesabaGore/);
    expect(k).toContain("label: 'Ekip'");
    // Panodaki hızlı erişim kartı: fiyat yetkisi yoksa Firma kütüphanesi kartı süzülür.
    const pano = kodu(oku('ortak/kabuk/components/dashboard/QuickAccess.tsx'));
    expect(pano).toContain("izinVar('fiyat') ? ITEMS : ITEMS.filter((i) => i.href !== '/library')");
    expect(pano).toContain('ogeler.map(');
  });

  it('pano: Excel kutusu FİYAT, DWG kutusu DWG yetkisine bağlı; izinsiz üyeye KİLİTLİ KART (paket önerilmez)', () => {
    const k = kodu(oku('ortak/kabuk/components/dashboard/QuickStart.tsx'));
    expect(k).toContain("const excelUyeKapali = !yeteneklerYukleniyor && !izinVar('fiyat');");
    expect(k).toContain("const dwgUyeKapali = !yeteneklerYukleniyor && !izinVar('dwg');");
    // Kutu GERÇEKTEN kilitli: izin kapı girdisine bağlı (yalnız görünüm değil).
    expect(k).toMatch(/izinVar: hasAnyMaterial\(\) && !hesapKapali && !excelUyeKapali/);
    expect(k).toMatch(/dwgVar: hasAnyDwg\(\) && !hesapKapali && !dwgUyeKapali/);
    expect(k).toMatch(/excelUyeKapali \? \(\s*<KilitliOzellikKarti baslik="Excel Keşif" izin="fiyat"/);
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
    // 06.10: yetkisiz davet de durur. Düğme `aria-disabled` (odaklanabilir,
    // ipucunu anar) olduğu için ENGEL işleyicide: tık da Enter da AYNI
    // `onSubmit={gonder}`den geçer — düğmenin kendi `onClick`i YOK.
    expect(pencere).toContain('const izinSecildi = izinSecimiGecerli(izinler);');
    expect(pencere).toContain('if (hata !== null || !izinSecildi || islemde) return;');
    expect(pencere).toContain('<form onSubmit={gonder} noValidate>');
    expect(pencere).toMatch(/<button\s+type="submit"\s+disabled=\{islemde\}\s+aria-disabled=\{izinSecildi \? undefined : true\}\s+aria-describedby=\{izinSecildi \? undefined : 'davet-izin-ipucu'\}\s+className="[^"]*"\s*>/);
    expect(pencere).toContain('ipucuId="davet-izin-ipucu"');
    // Panel de aynı kural: değişiklik olsa bile boş seçim KAYDEDİLMEZ; istek
    // sürerken ve değişiklik yokken düğme GERÇEKTEN pasif kalır.
    const panel = kodu(oku('ozellik/firma/ekip/UyeIzinPaneli.tsx'));
    expect(panel).toContain('const izinSecildi = izinSecimiGecerli(secili);');
    expect(panel).toContain('if (!degisti || !izinSecildi || islemde) return;');
    expect(panel).toMatch(/onClick=\{\(\) => void kaydet\(\)\}\s+disabled=\{islemde \|\| !degisti\}\s+aria-disabled=\{izinSecildi \? undefined : true\}\s+aria-describedby=\{izinSecildi \? undefined : 'panel-izin-ipucu'\}/);
    expect(panel).toContain('ipucuId="panel-izin-ipucu"');
  });

  it('her işlemin sonucu BİLDİRİMLE; alert() YOK', () => {
    const k = kodu(oku('app/(protected)/firma/ekip/page.tsx'));
    expect(k).toContain("import { toast } from '@/ortak/hooks/use-toast';");
    expect(k).toContain('toast({ title: basariMetni })');
    expect(k).toContain("toast({ variant: 'destructive', title: 'İşlem tamamlanamadı', description: kimlikHataMetni(e) })");
    for (const d of EKIP_DOSYALARI) expect(kodu(oku(d)), d).not.toMatch(/\balert\(|window\.confirm\(/);
  });

  it('⭐ davet giden ÜÇ yolun bildirimi spam ipucunu taşır (27.09)', () => {
    // 26.09: davet postası Google Workspace'te Spam'e düştü; Gmail spam'deki
    // iletide bağlantıyı kapatır. Sahip bunu davet anında öğrenmeli. Bayrak
    // bir çağrıdan düşerse ipucu o yolda SESSİZCE kaybolur.
    const k = kodu(oku('app/(protected)/firma/ekip/page.tsx'));
    // Ipucu cagrisi bayraga BAGLI olmali (`if (false)` mutanti yakalanir).
    expect(k).toMatch(
      /if \(davetGitti\) \{\s*toast\(\{ title: basariMetni, description: DAVET_SPAM_IPUCU, duration: DAVET_BILDIRIM_SURESI_MS \}\);/,
    );
    expect(k).toMatch(/adresine davet gönderildi\.`,\s*true,\s*\)/);
    expect(k).toMatch(/yeni yetkilerle yeniden gönderildi\.`,\s*true,\s*\)/);
    expect(k).toMatch(/adresine yeniden gönderildi\.`,\s*true,\s*\)/);
    expect(k).toContain('Spam / Gereksiz klasörüne');
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

  it('⭐ yeni teklif: fiyat yetkisi yoksa kütüphane istekleri ATILMAZ, Excel yükleme kilitli, gri şerit nedeni söyler', () => {
    const k = kodu(oku('app/(protected)/quotes/new/page.tsx'));
    // İki bayrak da AYNI yetkiden (eski `kutuphane`/`excel` izinleri `fiyat`ta birleşti).
    expect(k).toContain("const kutuphaneIzni = izinVar('fiyat');");
    expect(k).toContain("const excelIzni = izinVar('fiyat');");
    expect(k).toMatch(/\{!kutuphaneIzni && \(\s*<div[^>]*>\s*Fiyat yetkin kapalı: bu teklifte marka ve işçilik fiyatı eşleştiremezsin\.\s*Metrajı hazırlayıp kaydedebilirsin; fiyatlandırmayı fiyat yetkisi olan biri yapar\.\s*<\/div>/);
    // Fiyatlandırmayı yalnız yönetici yapmaz: fiyat yetkili üye de yapar.
    expect(k).not.toContain('fiyatlandırmayı yöneticin yapar');
    expect(k).toMatch(/if \(!kutuphaneIzni\) return;\s*api\.get<Brand\[\]>\('\/library\/brands'\)/);
    expect(k).toContain('if (!hasAnyLabor || !kutuphaneIzni) return;');
    expect(k).toMatch(/\{!excelIzni \? \(\s*<p[^>]*>\s*<Lock/);
    expect(k).toContain('Yöneticin bu özelliği senin için kapattı.');
  });

  it('Malzeme Havuzu: "Firma kütüphanesine aktar" üç ekranda da FİYAT yetkisine bağlı', () => {
    for (const d of [
      'app/(protected)/materials/mechanical/page.tsx',
      'app/(protected)/materials/electrical/page.tsx',
      'app/(protected)/materials/[brandId]/page.tsx',
    ]) {
      const k = kodu(oku(d));
      expect(k, d).toMatch(/\{izinVar\('fiyat'\) && \(/);
      expect(k, d).toContain('Firma kütüphanesine aktar');
      expect(k, d).not.toContain('Kütüphaneme Aktar');
    }
  });

  it('teklif listesi ve pano kartı kapsam notunu FİYAT yetkisinden alır (yetkisiz üye yalnız kendi tekliflerini görür)', () => {
    expect(kodu(oku('app/(protected)/quotes/page.tsx'))).toContain("const yalnizKendi = !izinVar('fiyat');");
    expect(kodu(oku('ozellik/teklif/dashboard/RecentQuotes.tsx'))).toContain("const yalnizKendi = !izinVar('fiyat');");
  });

  it('kırıntı: sayfası olmayan "firma" parçası çizilmez, "ekip" Türkçe', () => {
    const k = kodu(oku('ortak/kabuk/components/layout/Breadcrumb.tsx'));
    expect(k).toContain("const SAYFASIZ_PARCA = new Set(['firma']);");
    expect(k).toContain("ekip: 'Ekip'");
  });
});
