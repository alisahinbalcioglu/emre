/**
 * "VERİLERİMİ İNDİR" — MEKANİZMA + KAYNAK KAPISI (Plan 5.8 §4.5, 21.09.2026)
 *
 * ⚠ NEDEN VAR: bu düğme iki ekranda da KIRIKTI. Düz
 * `<a href="/api/auth/hesabim/verilerim">` (1) `Authorization: Bearer …`
 * başlığı taşımaz — token `localStorage`tadır, (2) `next.config.js`te `/api`
 * için rewrite YOKTUR — adres Next sunucusuna gider. Uçtaki KVKK muafiyeti
 * doğru kurulmuştu (`auth.controller.ts`: ödeme ve koltuk kapısı yok); kırık
 * olan ön yüzdü ve HİÇBİR TEST bunu ölçmüyordu — tersine
 * `ekip-ekranlari.test.ts` kırık deseni KİLİTLİYORDU.
 *
 * Bu paket iki şeyi ayrı ayrı ölçer:
 *   A · mekanizma — uç adresi, dosya adı, Blob türü, `revokeObjectURL`, hata
 *   B · kaynak kapısı — düz `href="/api/…"` deseni GERİ GELEMEZ
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  VERILERIM_UCU,
  verilerimDosyaAdi,
  verileriIndir,
  type IndirmeOrtami,
} from './verileri-indir';

/** Tarayıcı yüzeyinin tamamını kaydeden sahte ortam (jsdom YOK). */
function sahteOrtam(getir: () => Promise<unknown>) {
  const iz: string[] = [];
  const bag = {
    href: '',
    download: '',
    click: () => iz.push('click'),
  };
  const ortam: Partial<IndirmeOrtami> = {
    getir,
    olustur: (tur) => {
      iz.push(`olustur:${tur}`);
      return bag;
    },
    ekle: () => iz.push('ekle'),
    cikar: () => iz.push('cikar'),
    blobAdresi: (govde, tur) => {
      iz.push(`blob:${tur}:${govde.length}`);
      return 'blob://sahte';
    },
    adresiBirak: (url) => iz.push(`birak:${url}`),
  };
  return { ortam, iz, bag };
}

describe('A · mekanizma', () => {
  it('uç adresi TEK yerde ve doğru', () => {
    expect(VERILERIM_UCU).toBe('/auth/hesabim/verilerim');
  });

  it('dosya adı gün bazlı (yerel saat — toISOString UTC kayması yok)', () => {
    // ⚠ `toISOString().slice(0,10)` kullanılsaydı TSİ 03:00'te indirilen dosya
    // BİR ÖNCEKİ günün adını alırdı.
    expect(verilerimDosyaAdi(new Date(2026, 8, 21, 2, 30))).toBe(
      'metapricex-verilerim-2026-09-21.json',
    );
    expect(verilerimDosyaAdi(new Date(2026, 0, 5))).toBe('metapricex-verilerim-2026-01-05.json');
  });

  it('⭐ indirme: JSON Blob üretir, bağlantıya tıklar, adresi SERBEST BIRAKIR', async () => {
    const { ortam, iz, bag } = sahteOrtam(async () => ({ email: 'a@b.test', teklifler: [] }));
    const sonuc = await verileriIndir(ortam);
    expect(sonuc).toBe(true);
    expect(iz).toEqual([
      'blob:application/json:44',
      'olustur:a',
      'ekle',
      'click',
      'cikar',
      'birak:blob://sahte',
    ]);
    expect(bag.href).toBe('blob://sahte');
    expect(bag.download).toMatch(/^metapricex-verilerim-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('⭐ hata FIRLATMAZ, `false` döner (ekran mesajı gösterebilsin)', async () => {
    const { ortam, iz } = sahteOrtam(async () => {
      throw new Error('403');
    });
    await expect(verileriIndir(ortam)).resolves.toBe(false);
    expect(iz).toEqual([]); // yarım indirme artığı bırakmaz
  });
});

// ---------------------------------------------------------------------------
// B · KAYNAK KAPISI — düz bağlantı deseni geri gelemez
// ---------------------------------------------------------------------------
const KOK = path.join(__dirname, '../..');

function dosyalar(dizin: string, biriken: string[] = []): string[] {
  for (const ad of fs.readdirSync(dizin)) {
    if (ad === 'node_modules' || ad === '.next' || ad === 'e2e' || ad === 'e2e-golden') continue;
    const tam = path.join(dizin, ad);
    if (fs.statSync(tam).isDirectory()) dosyalar(tam, biriken);
    else if (/\.(ts|tsx)$/.test(ad) && !/\.test\.tsx?$/.test(ad)) biriken.push(tam);
  }
  return biriken;
}

describe('B · kaynak kapısı', () => {
  it('⭐ hiçbir ekranda `href="/api/…"` YOK (başlık taşımayan çağrı)', () => {
    const suclular: string[] = [];
    for (const kok of ['app', 'ozellik', 'ortak']) {
      for (const dosya of dosyalar(path.join(KOK, kok))) {
        const icerik = fs.readFileSync(dosya, 'utf-8');
        // Yorum satırları soyulur: gerekçe yazısı kapıyı kırmızıya düşürmesin.
        const kod = icerik.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        if (/href=["'`]\/api\//.test(kod)) suclular.push(path.relative(KOK, dosya));
      }
    }
    expect(suclular).toEqual([]);
  });

  it('⭐ KVKK indirme ucu YALNIZ iki yerde çağrılıyor (yardımcı + profil)', () => {
    const cagiranlar: string[] = [];
    for (const kok of ['app', 'ozellik', 'ortak']) {
      for (const dosya of dosyalar(path.join(KOK, kok))) {
        const icerik = fs.readFileSync(dosya, 'utf-8');
        const kod = icerik.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        if (kod.includes('hesabim/verilerim')) cagiranlar.push(path.relative(KOK, dosya).replace(/\\/g, '/'));
      }
    }
    // ⚠ İki ekran (koltuk durdurma · hesap kapalı) KENDİ isteğini YAZMAZ;
    // `verileri-indir.ts`i çağırır. Profil ekranı ayrı bir akış (oturum açık,
    // kendi indirme kartı) ve zaten `api.get` kullanıyor — doğru.
    expect(cagiranlar.sort()).toEqual([
      'app/(protected)/profile/page.tsx',
      'ozellik/kimlik/verileri-indir.ts',
    ]);
  });
});
