import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEVIYE_AD, seviyeAdi } from './paket-bicim';

/**
 * Faz 7 · F1a — Y13 (R1/E-5): müşteriye görünen paket adı.
 *
 * Emre'nin kararı (15.09): en ucuz paketin müşteriye görünen adı **Basic**.
 * Teknik enum `core` DEĞİŞMEZ (SQL'ler, API yanıtları, localStorage) —
 * değişen yalnızca EKRANA ve RET MESAJINA giden ad. Müşteri "CORE" diye bir
 * şey satın almadı.
 *
 * ⚠ Bu dosya KAYNAK KAPISIDIR: ekran metnini üreten yerlerin tek sözlüğü
 * kullandığını ölçer. İkinci bir sözlük açılırsa biri güncellenir, öteki
 * bayat kalır ve müşteri iki farklı ad görür.
 */

const KOK = join(__dirname, '../..');
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

const sidebar = oku('ortak/kabuk/components/layout/Sidebar.tsx');
const profil = oku('app/(protected)/profile/page.tsx');
const yoneticiKullanicilar = oku('app/admin/users/page.tsx');

describe('görünen paket adı — tek sözlük', () => {
  it('FIXTURE: üç ekran dosyası da okundu', () => {
    for (const [ad, icerik] of [['Sidebar', sidebar], ['profil', profil], ['yönetici', yoneticiKullanicilar]] as const) {
      expect(icerik.length, ad).toBeGreaterThan(500);
    }
  });

  it('SEVIYE_AD: core→Basic, pro→Pro, suite→Suite', () => {
    expect(SEVIYE_AD.core).toBe('Basic');
    expect(SEVIYE_AD.pro).toBe('Pro');
    expect(SEVIYE_AD.suite).toBe('Suite');
  });

  it('tanınmayan kod AYNEN gösterilir (sessizce "Basic" demez)', () => {
    expect(seviyeAdi('platin')).toBe('platin');
  });

  it('⭐ kenar çubuğu rozeti ham kodu basmıyor, sözlükten okuyor', () => {
    // ⚠ 2.15: çağrı `seviyeAdi(tier)` DEĞİL `paketRozeti(tier)`. Seviye
    // `null` olabildiği için (abonelik yürümüyor) ad, boş hâli karşılayan
    // kapıdan okunur; o kapı adı yine SEVIYE_AD'den alır — ikinci sözlük
    // YOK (devretme kanıtı: `paket-rozeti.test.ts`).
    expect(sidebar).toContain('paketRozeti(tier)');
    // Eski hâl: `{tier}` + `uppercase` → müşteriye "CORE".
    expect(sidebar).not.toContain('>{tier}<');
    // ⚠ 2.15 yedeğinin (`?? 'core'`) kapısı BURADA DEĞİL: ölçüm yorumları
    // süzmeyi gerektiriyor ve iki yerde kapı açmak ikiz kural olurdu.
    // Tek yer: `paket-rozeti.test.ts` → "BAĞLANTI" bloğu.
  });

  it('⭐ profil kartında "Core" etiketi YOK', () => {
    expect(profil).not.toContain("label: 'Core'");
    expect(profil).toContain("core: { label: 'Basic'");
  });

  it('⭐ yönetici kullanıcılar ekranı aynı sözlüğü kullanıyor', () => {
    expect(yoneticiKullanicilar).toContain("from '@/ozellik/odeme/paket-bicim'");
    expect(yoneticiKullanicilar).toContain('seviyeAdi(u.tier)');
  });
});

describe('⭐ yönetici paneli paket dağıtmıyor (2.12)', () => {
  it('paket satır içi Select KALDIRILDI (salt-okunur rozet)', () => {
    expect(yoneticiKullanicilar).not.toContain("alanDegistir(u, 'tier'");
    expect(yoneticiKullanicilar).not.toContain("'role' | 'status' | 'tier'");
  });

  it('FIXTURE: rol ve durum Select`leri YERİNDE (kapı kör değil)', () => {
    expect(yoneticiKullanicilar).toContain("alanDegistir(u, 'role'");
    expect(yoneticiKullanicilar).toContain("alanDegistir(u, 'status'");
  });

  it('ayrışma ipucu artık "yüksek olan kullanılır" DEMİYOR', () => {
    expect(yoneticiKullanicilar).not.toContain('YÜKSEK olan kullanılır');
  });
});
