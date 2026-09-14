import type { Metadata, MetadataRoute } from 'next';

/**
 * ARAMA MOTORU ve PAYLAŞIM ÖNİZLEMESİ — tek kaynak (plan 6.5, 14.09.2026).
 *
 * `app/robots.ts`, `app/sitemap.ts`, kök düzenin ikonları/`metadataBase`'i ve
 * herkese açık iki satış sayfasının (anasayfa, `/fiyatlar`) Open Graph + X
 * kartı buradan üretilir. Kural `app/` dışında durur ki testten koşulabilsin:
 * vitest `@/` takma adını çözmüyor, `app/` dosyaları içe aktarılamıyor.
 *
 * ⚠ SİTE KÖKÜ ORTAM DEĞİŞKENİ DEĞİL: paylaşım önizlemesi ve site haritası
 * yalnız canlı alan adında anlamlı. `metadataBase` verilmezse Next.js görsel
 * adresini `http://localhost:3000` ile mutlaklaştırır — WhatsApp o adresi
 * çekemez, önizleme görselsiz çıkar.
 */
export const SITE_KOKU = 'https://metapricex.com';
const SITE_ADI = 'MetaPriceX';

/**
 * Herkese açık ve indekslenecek sayfalar — site haritasının TEK kaynağı.
 * Giriş gerektiren hiçbir yol buraya girmez. `robots.txt` de o yolları ADIYLA
 * ANMAZ: `Disallow: /admin` yazmak adresi ilan etmektir; koruma kimlik
 * doğrulamasındadır, `robots.txt` bir güvenlik aracı değildir.
 */
export const HERKESE_ACIK_SAYFALAR = [
  '/',
  '/fiyatlar',
  '/gizlilik',
  '/kullanim-kosullari',
  '/cerez-politikasi',
  '/mesafeli-satis',
] as const;

export function robotsKurallari(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_KOKU}/sitemap.xml`,
  };
}

/**
 * `lastmod` ELLE YAZILMAZ — çağıran derleme anını verir (`app/sitemap.ts`).
 * Hukuki sayfalar bugün TASLAK şeridiyle yayında; onay gelip şerit kalktığında
 * metin sürümü değişmeyebilir ama sayfa değişir. O değişiklik bir deploy'dur,
 * tarih kendiliğinden ilerler.
 */
export function siteHaritasi(derlemeAni: Date): MetadataRoute.Sitemap {
  return HERKESE_ACIK_SAYFALAR.map((yol) => ({ url: `${SITE_KOKU}${yol}`, lastModified: derlemeAni }));
}

type Ikon = { url: string; sizes: string; type?: string };

/**
 * Favicon takımı `public/` kökünde, başlıktaki marka simgesinden üretildi
 * (mavi yuvarlak kare, beyaz "M"). `favicon.ico` üç boyutu birlikte taşır;
 * `apple-touch-icon` saydamsız tam karedir (iOS köşeyi kendisi yuvarlar,
 * saydam köşe siyah görünür). Telefon ana ekranı `site.webmanifest`'i okur.
 */
export const SITE_IKONLARI: { icon: Ikon[]; apple: Ikon[] } = {
  icon: [
    { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
    { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
  ],
  apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
};
export const SITE_MANIFESTI = '/site.webmanifest';

/** Open Graph ve X kartının ortak 1,91:1 oranı. */
const GORSEL_GENISLIK = 1200;
const GORSEL_YUKSEKLIK = 630;

/**
 * Paylaşım görselleri `public/og/`'da. İçlerinde veritabanından gelen HİÇBİR
 * rakam yok (fiyat, kota, deneme günü, kullanıcı sayısı): platformlar
 * önizlemeyi haftalarca önbellekte tutar, rakam değişince görsel sessizce
 * yalan söylerdi. Ürün ekranı anasayfanın kendi ekran görüntülerinden.
 */
export const PAYLASIM_GORSELLERI = {
  anasayfa: {
    yol: '/og/anasayfa.jpg',
    alt: 'MetaPriceX teklif ekranı: metraj satırları marka fiyat listesinden fiyatlanmış; önde DWG projesinden hat boyu ölçümü (Pro paket)',
  },
  fiyatlar: {
    yol: '/og/fiyatlar.jpg',
    alt: 'MetaPriceX paket kartları: Core malzeme akışı, Pro işçilik ve DWG metrajı; sınırsız teklif, ücretsiz denemeyle başlar',
  },
} as const;

export type PaylasimGorseli = keyof typeof PAYLASIM_GORSELLERI;

/**
 * Sayfanın başlığını ve açıklamasını paylaşım kartına AYNEN taşır; adres ve
 * görsel sayfa başına ayrı. `openGraph` alt düzeyde BİRLEŞTİRİLMEZ, üst
 * düzeyinkini tümüyle ezer — o yüzden tür/dil/site adı her çağrıda yeniden
 * yazılır.
 */
export function sayfaMetaverisi(s: {
  baslik: string;
  aciklama: string;
  yol: string;
  gorsel: PaylasimGorseli;
}): Metadata {
  const g = PAYLASIM_GORSELLERI[s.gorsel];
  const gorseller = [
    { url: g.yol, width: GORSEL_GENISLIK, height: GORSEL_YUKSEKLIK, alt: g.alt, type: 'image/jpeg' },
  ];
  return {
    title: s.baslik,
    description: s.aciklama,
    openGraph: {
      type: 'website',
      locale: 'tr_TR',
      siteName: SITE_ADI,
      url: s.yol,
      title: s.baslik,
      description: s.aciklama,
      images: gorseller,
    },
    twitter: { card: 'summary_large_image', title: s.baslik, description: s.aciklama, images: gorseller },
  };
}
