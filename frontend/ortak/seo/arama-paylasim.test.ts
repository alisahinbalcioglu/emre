import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  HERKESE_ACIK_SAYFALAR,
  PAYLASIM_GORSELLERI,
  SITE_IKONLARI,
  SITE_KOKU,
  SITE_MANIFESTI,
  robotsKurallari,
  sayfaMetaverisi,
  siteHaritasi,
  type PaylasimGorseli,
} from './arama-paylasim';

/**
 * PLAN 6.5 KAPISI — robots, site haritası, paylaşım kartı, favicon takımı.
 *
 * İki katman ölçülür: KURAL (bu modülün çıktısı) ve BAĞLANTI (`app/` dosyaları
 * kuralı gerçekten çağırıyor mu, `public/` dosyaları beyan edilen boyutta mı).
 * `app/` dosyaları vitest'te içe aktarılamıyor (`@/` takma adı yok); bağlantı
 * TypeScript ayrıştırıcısıyla, yorumlar atılarak okunur.
 */
const kok = join(__dirname, '..', '..');
const kaynak = (yol: string) => readFileSync(join(kok, yol), 'utf-8');
const genelDosya = (url: string) => join(kok, 'public', url.replace(/^\//, ''));
const ayristir = (yol: string) =>
  ts.createSourceFile(yol, kaynak(yol), ts.ScriptTarget.Latest, true, yol.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const yorumsuz = (yol: string) => ts.createPrinter({ removeComments: true }).printFile(ayristir(yol));

// ── Görsel başlıklarından boyut okuma (bağımlılıksız) ─────────────────────
function pngBilgisi(b: Buffer) {
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { en: b.readUInt32BE(16), boy: b.readUInt32BE(20), renkTuru: b[25] };
}
function jpegBoyutu(b: Buffer) {
  expect(b[0] === 0xff && b[1] === 0xd8).toBe(true);
  let i = 2;
  while (i < b.length) {
    const isaret = b[i + 1];
    const uzunluk = b.readUInt16BE(i + 2);
    if (isaret >= 0xc0 && isaret <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(isaret)) {
      return { boy: b.readUInt16BE(i + 5), en: b.readUInt16BE(i + 7) };
    }
    i += 2 + uzunluk;
  }
  throw new Error('JPEG SOF işareti bulunamadı');
}
function icoBoyutlari(b: Buffer) {
  expect(b.readUInt16LE(2)).toBe(1); // tür: ikon
  return Array.from({ length: b.readUInt16LE(4) }, (_, i) => {
    const o = 6 + 16 * i;
    const gomulu = b.subarray(b.readUInt32LE(o + 12), b.readUInt32LE(o + 12) + b.readUInt32LE(o + 8));
    const png = pngBilgisi(gomulu); // gömülü PNG'nin KENDİ boyutu da dizinle aynı olmalı
    const en = b[o] || 256;
    expect(png.en).toBe(en);
    return `${en}x${b[o + 1] || 256}`;
  });
}

/** Giriş gerektiren ya da iç kullanım rotalarının adları — dosya sisteminden türetilir, elle yazılmaz. */
const KORUMALI_ADLAR = [
  ...readdirSync(join(kok, 'app', '(protected)')).filter((a) => statSync(join(kok, 'app', '(protected)', a)).isDirectory()),
  'admin',
  'dev',
];

describe('robots.txt — indeksleme açık, korumalı yol ADIYLA anılmıyor', () => {
  it('ölçütün kendisi: korumalı ad listesi boş değil (boş liste her şeyi yeşil yapardı)', () => {
    expect(KORUMALI_ADLAR).toEqual(expect.arrayContaining(['admin', 'dashboard', 'quotes', 'profile']));
  });

  it('herkese izin, Disallow yok, site haritası bildiriliyor', () => {
    const r = robotsKurallari();
    expect(r.rules).toEqual({ userAgent: '*', allow: '/' });
    expect(JSON.stringify(r)).not.toMatch(/disallow/i);
    expect(r.sitemap).toBe(`${SITE_KOKU}/sitemap.xml`);
  });

  it.each(KORUMALI_ADLAR)('"%s" robots çıktısında geçmiyor', (ad) => {
    expect(JSON.stringify(robotsKurallari())).not.toContain(ad);
  });

  it('app/robots.ts kuralı çağırıyor (bağlantı)', () => {
    expect(yorumsuz('app/robots.ts')).toMatch(/return robotsKurallari\(\)/);
  });
});

describe('sitemap.xml — yalnız herkese açık altı sayfa, lastmod derlemeden', () => {
  it('liste iş emrindeki altı sayfa, fazlası eksiği yok', () => {
    expect([...HERKESE_ACIK_SAYFALAR].sort()).toEqual(
      ['/', '/fiyatlar', '/gizlilik', '/kullanim-kosullari', '/cerez-politikasi', '/mesafeli-satis'].sort(),
    );
    expect(siteHaritasi(new Date()).map((g) => g.url)).toEqual(HERKESE_ACIK_SAYFALAR.map((y) => `${SITE_KOKU}${y}`));
  });

  it.each([...HERKESE_ACIK_SAYFALAR])('%s gerçek bir sayfa ve korumalı alanın dışında', (yol) => {
    const dosya = yol === '/' ? 'app/page.tsx' : `app${yol}/page.tsx`;
    expect(existsSync(join(kok, dosya))).toBe(true);
    for (const ad of KORUMALI_ADLAR) expect(yol.split('/')).not.toContain(ad);
  });

  it('lastmod verilen andan gelir, sabit değildir (iki ayrı an → iki ayrı tarih)', () => {
    const a = new Date('2026-09-14T10:00:00Z');
    const b = new Date('2026-12-01T08:30:00Z');
    expect(siteHaritasi(a).every((g) => g.lastModified === a)).toBe(true);
    expect(siteHaritasi(b).every((g) => g.lastModified === b)).toBe(true);
  });

  it('app/sitemap.ts derleme anını veriyor ve statik (bağlantı)', () => {
    const kod = yorumsuz('app/sitemap.ts');
    expect(kod).toMatch(/return siteHaritasi\(new Date\(\)\)/);
    expect(kod).toMatch(/export const dynamic = ['"]force-static['"]/);
    expect(kod).not.toMatch(/\d{4}-\d{2}-\d{2}/); // elle yazılmış tarih yok
  });
});

/** `export const metadata = sayfaMetaverisi({...})` çağrısının dizge argümanları. */
function metaCagrisi(yol: string): { baslik: string; aciklama: string; yol: string; gorsel: PaylasimGorseli } {
  let bulunan: Record<string, string> | null = null;
  const gez = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      n.name.getText() === 'metadata' &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.expression.getText() === 'sayfaMetaverisi'
    ) {
      const arg = n.initializer.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        bulunan = {};
        for (const p of arg.properties) {
          if (ts.isPropertyAssignment(p) && ts.isStringLiteralLike(p.initializer)) bulunan[p.name.getText()] = p.initializer.text;
        }
      }
    }
    n.forEachChild(gez);
  };
  gez(ayristir(yol));
  if (!bulunan) throw new Error(`${yol}: metadata sayfaMetaverisi ile üretilmiyor`);
  return bulunan as never;
}

describe('Paylaşım kartı (Open Graph + X) — sayfa başına ayrı', () => {
  const ANA = metaCagrisi('app/page.tsx');
  const FIYAT = metaCagrisi('app/fiyatlar/page.tsx');

  it('iki sayfa aynı metni, görseli ya da adresi paylaşmıyor', () => {
    expect(ANA.yol).toBe('/');
    expect(FIYAT.yol).toBe('/fiyatlar');
    expect(ANA.gorsel).not.toBe(FIYAT.gorsel);
    expect(ANA.baslik).not.toBe(FIYAT.baslik);
    expect(ANA.aciklama).not.toBe(FIYAT.aciklama);
  });

  it.each([
    ['anasayfa', ANA],
    ['fiyatlar', FIYAT],
  ])('%s: og ve twitter alanları eksiksiz ve sayfanın kendi değerleri', (_ad, s) => {
    const m = sayfaMetaverisi(s);
    const og = m.openGraph as Record<string, unknown>;
    expect(og).toMatchObject({ type: 'website', locale: 'tr_TR', url: s.yol, title: s.baslik, description: s.aciklama });
    expect(og.images).toEqual([
      expect.objectContaining({ url: PAYLASIM_GORSELLERI[s.gorsel].yol, width: 1200, height: 630 }),
    ]);
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', title: s.baslik, description: s.aciklama });
    expect((m.twitter as { images: { url: string }[] }).images[0].url).toBe(PAYLASIM_GORSELLERI[s.gorsel].yol);
    expect(m.title).toBe(s.baslik);
    expect(m.description).toBe(s.aciklama);
  });

  it.each(Object.entries(PAYLASIM_GORSELLERI))('%s görseli diskte, gerçekten 1200×630 ve bütçe içinde', (_ad, g) => {
    const b = readFileSync(genelDosya(g.yol));
    expect(jpegBoyutu(b)).toEqual({ en: 1200, boy: 630 });
    expect(b.length).toBeLessThan(200 * 1024); // "dosya boyutu makul" — bütçe kararı: 200 KB
  });

  it.each(Object.entries(PAYLASIM_GORSELLERI))('%s görselinin alt metni görseli anlatıyor, genel sözcük değil', (_ad, g) => {
    expect(g.alt.length).toBeGreaterThan(40);
    expect(g.alt).not.toMatch(/^(görsel|resim|ekran|image)$/i);
  });

  it('kök düzen metadataBase, ikonlar ve manifesti bağlıyor (bağlantı)', () => {
    const kod = yorumsuz('app/layout.tsx');
    expect(kod).toMatch(/metadataBase: new URL\(SITE_KOKU\)/);
    expect(kod).toMatch(/icons: SITE_IKONLARI/);
    expect(kod).toMatch(/manifest: SITE_MANIFESTI/);
    expect(SITE_KOKU).toBe('https://metapricex.com');
  });
});

describe('Favicon takımı — beyan edilen her boyut dosyada gerçek', () => {
  it.each([...SITE_IKONLARI.icon, ...SITE_IKONLARI.apple])('$url beyanı ($sizes) dosyayla tutuyor', (ikon) => {
    const b = readFileSync(genelDosya(ikon.url));
    const beyan = ikon.sizes.split(' ').sort();
    if (ikon.url.endsWith('.ico')) {
      expect(icoBoyutlari(b).sort()).toEqual(beyan);
    } else {
      const p = pngBilgisi(b);
      expect([`${p.en}x${p.boy}`]).toEqual(beyan);
    }
  });

  it('apple-touch-icon 180×180 ve saydamsız (iOS saydam köşeyi siyaha boyar)', () => {
    const p = pngBilgisi(readFileSync(genelDosya(SITE_IKONLARI.apple[0].url)));
    expect(`${p.en}x${p.boy}`).toBe('180x180');
    expect([0, 2]).toContain(p.renkTuru); // 0 gri, 2 RGB — alfa kanalı yok
  });

  it('site.webmanifest geçerli JSON; her ikon diskte ve boyutu beyanıyla aynı', () => {
    const m = JSON.parse(readFileSync(genelDosya(SITE_MANIFESTI), 'utf-8'));
    expect(m.name).toBe('MetaPriceX');
    expect(m.start_url).toBe('/');
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const i of m.icons as { src: string; sizes: string }[]) {
      const p = pngBilgisi(readFileSync(genelDosya(i.src)));
      expect(`${p.en}x${p.boy}`).toBe(i.sizes);
    }
  });
});
