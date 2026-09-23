/**
 * FAZ 7 F1b — EKİP EKRANLARI (§6.5, §6.6, §6.9, §6.12)
 *
 * Bu depoda ön yüz bileşenleri için render altyapısı (jsdom/RTL) YOK; ekran
 * kuralları KAYNAK ÜZERİNDEN ölçülür. Ölçülen şey "bir metin var mı" değil,
 * KARARIN NEREDE VERİLDİĞİ: fail-open desenler, ön yüzde yeniden hesaplanan
 * sunucu kararları ve eksik koşullar.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { koltukSayaciMetni, kucultmeUyarisi } from './koltuk-metinleri';
// Hesabım sekme kararı (23.09) — import'suz saf dosya.
import { hesapSekmeleri } from '../../kimlik/hesabim/hesabim';

const KOK = path.join(__dirname, '../../..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');
/** Yorumları at: kapı YORUMDA değil KODDA eşleşsin. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('kucultmeUyarisi — kaç kişi duracak (saf)', () => {
  it('3 aktif, hak 1 → 2 kişi', () => {
    expect(kucultmeUyarisi(3, 1)).toContain('2 kişi');
  });
  it('1 aktif, hak 1 → uyarı YOK', () => {
    expect(kucultmeUyarisi(1, 1)).toBeNull();
  });
  it('3 aktif, hak 3 → uyarı YOK', () => {
    expect(kucultmeUyarisi(3, 3)).toBeNull();
  });
  it('2 aktif, hak 0 → 1 kişi (en eski sahip her zaman çalışır)', () => {
    expect(kucultmeUyarisi(2, 0)).toContain('1 kişi');
  });
  it('metin "verileri silinmez" güvencesini taşır', () => {
    expect(kucultmeUyarisi(5, 2)).toContain('verileri silinmez');
  });
});

describe('koltukSayaciMetni', () => {
  it('durdurulan yokken uyarı null', () => {
    const { sayac, uyari } = koltukSayaciMetni({ aktif: 2, bekleyen: 1, hak: 3, durdurulan: 0 });
    expect(sayac).toBe('2 / 3 kullanıcı · 1 bekleyen davet');
    expect(uyari).toBeNull();
  });
  it('durdurulan varsa uyarı cümlesi', () => {
    const { sayac, uyari } = koltukSayaciMetni({ aktif: 4, bekleyen: 0, hak: 3, durdurulan: 1 });
    expect(sayac).toBe('4 / 3 kullanıcı');
    expect(uyari).toContain('1 üye durduruldu');
  });
  it('abonelik yoksa hak "—"', () => {
    expect(koltukSayaciMetni({ aktif: 1, bekleyen: 0, hak: null, durdurulan: 0 }).sayac)
      .toBe('1 / — kullanıcı');
  });
});

describe('ekip sayfası — sahiplik kararı FAIL-CLOSED ve sunucudan', () => {
  const sayfa = kodu(oku('app/(protected)/firma/ekip/page.tsx'));

  it("`sahipMi` fail-closed (`?? 'sahip'` fail-open deseni YOK)", () => {
    expect(sayfa).toContain("firmaRol === 'sahip'");
    expect(sayfa).not.toContain("?? 'sahip'");
  });

  it('davet/çıkar/rol düğmeleri `sahipMi` koşuluna bağlı', () => {
    // Üç düğme de sahip bloğunun içinde: koşul silinirse üye de görür.
    expect(sayfa).toMatch(/sahipMi && \(/);
    expect((sayfa.match(/sahipMi/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('davet kapalı nedeni SUNUCUDAN gelir (ön yüz koltuk hesaplamaz)', () => {
    expect(sayfa).toContain('veri.davet.nedenKodu');
    expect(sayfa).not.toContain('koltukKarari');
  });

  it('`durduruldu` rozeti sunucunun hesapladığı değerden çizilir', () => {
    expect(sayfa).toContain('u.durduruldu');
    expect(sayfa).toContain('Durduruldu (paket sınırı)');
  });

  it('PAKET_EKIP_YOK metni Basic → Pro yönlendirmesi yapar', () => {
    const sozluk = oku('ortak/lib/kimlik-hata-metinleri.ts');
    expect(sozluk).toContain('PAKET_EKIP_YOK');
    expect(sozluk).toMatch(/Basic paketinde ekip yok/);
  });
});

describe('profil — fail-open düzeltmesi', () => {
  it("`(profile.firmaRol ?? 'sahip')` deseni KALDIRILDI", () => {
    const profil = kodu(oku('app/(protected)/profile/page.tsx'));
    expect(profil).not.toMatch(/firmaRol \?\? 'sahip'/);
    expect(profil).toContain("profile.firmaRol === 'sahip'");
  });

  it('üye gizli iki alanı BOŞ KUTU olarak görmez ("firma girmemiş" sanılmasın)', () => {
    // ⚠ 23.09.2026 (Hesabım tasarımı): eski önlem bir NOTTU — üye firma
    // formunu görüyor, T.C. kimlik no ve yetkili e-posta kutuları ona boş
    // geliyordu (`firma-maskele.ts`), not da "bunlar size gizli" diyordu.
    // Artık üye Firma sekmesini HİÇ görmez; boş kutu yok, not gereksiz.
    expect(hesapSekmeleri(false)).not.toContain('firma');
    const profil = kodu(oku('app/(protected)/profile/page.tsx'));
    expect(profil).toContain('const sekmeler = hesapSekmeleri(sahipMi);');
    expect(profil).toMatch(/\bfirma: \(\) => \(?\s*<FirmaSekmesi\b/);
  });
});

describe('kenar çubuğu', () => {
  it("NAV_ITEMS `/firma/ekip` içerir", () => {
    const sidebar = kodu(oku('ortak/kabuk/components/layout/Sidebar.tsx'));
    expect(sidebar).toMatch(/href: '\/firma\/ekip'/);
  });
});

describe('abonelik ekranı — üye satın alamaz + küçültme uyarısı', () => {
  const sayfa = kodu(oku('app/(protected)/abonelik/page.tsx'));

  it("düğme yalnız `firmaRol === 'sahip'` iken çizilir (fail-closed)", () => {
    expect(sayfa).toMatch(/firmaRol === 'sahip' \?/);
    expect(sayfa).toContain('Aboneliği firma sahibi yönetir.');
  });

  it('küçültme uyarısı ORTAK saf yardımcıdan gelir (ikiz hesap yok)', () => {
    expect(sayfa).toContain('kucultmeUyarisi(');
    expect(sayfa).toContain("from '@/ozellik/firma/ekip/koltuk-metinleri'");
  });
});

describe('"Firma sahibi dahil N kullanıcı" — İKİ ekranda da', () => {
  it('fiyat kartları', () => {
    expect(oku('ozellik/odeme/FiyatKartlari.tsx')).toContain('Firma sahibi dahil {p.kullaniciHakki} kullanıcı');
  });
  it('abonelik sayfası', () => {
    expect(oku('app/(protected)/abonelik/page.tsx')).toContain('Firma sahibi dahil {p.kullaniciHakki} kullanıcı');
  });
  it('eski belirsiz metin ("N kullanıcıya kadar") KALMADI (yorumlar hariç)', () => {
    expect(kodu(oku('ozellik/odeme/FiyatKartlari.tsx'))).not.toContain('kullanıcıya kadar');
    expect(kodu(oku('app/(protected)/abonelik/page.tsx'))).not.toContain('kullanıcıya kadar');
  });
});

describe('davet kabul sayfası', () => {
  const sayfa = kodu(oku('app/davet-kabul/page.tsx'));

  it('İKİ AYRI onay kutusu (ETK/İYS: pazarlama izni sözleşmeye yedirilemez)', () => {
    expect(sayfa).toContain('sozlesmeOnayi');
    expect(sayfa).toContain('ticariIletiOnayi');
    expect(sayfa).toMatch(/useState\(false\)[\s\S]{0,400}ticariIletiOnayi/);
  });

  it('token adres çubuğundan SİLİNİR (replaceState)', () => {
    expect(sayfa).toContain('replaceState');
    expect(sayfa).toContain("searchParams.delete('token')");
  });

  it('`noindex` var ve oturum TEK yardımcıdan yazılır', () => {
    expect(sayfa).toContain('content="noindex"');
    expect(sayfa).toContain('oturumuYaz(');
  });

  it('sayfa HERKESE_ACIK_SAYFALAR listesine EKLENMEDİ', () => {
    const seo = oku('ortak/seo/arama-paylasim.ts');
    expect(seo).not.toContain('davet-kabul');
  });
});

describe('durdurma ekranı — yalnız izinli uçlar', () => {
  const sayfa = kodu(oku('app/(protected)/koltuk-durduruldu/page.tsx'));

  it("Emre'nin cümlesi `hak` ile basılır", () => {
    expect(sayfa).toContain("koltuk?.hak");
    expect(sayfa).toContain('yöneticiniz paketi yükseltmeli ya da');
  });

  it('`durduruldu === false` → /dashboard', () => {
    expect(sayfa).toMatch(/durduruldu === false\) router\.push\('\/dashboard'\)/);
  });

  it('YALNIZ izinli uçlar çağrılır (/auth/me · verilerim · hesabı kapat)', () => {
    const cagrilar = (sayfa.match(/api\.(?:get|post|patch|delete)\('[^']+'/g) ?? [])
      .map((m) => m.replace(/^api\.\w+\('/, '').replace(/'$/, ''));
    expect(cagrilar).toEqual(['/auth/me']);
  });

  // ── 21.09.2026 · Plan 5.8 §4.5 — ÖLÇÜM: BU DÜĞME ÇALIŞMIYORDU ──────────
  // Bu blok eskiden `expect(sayfa).toContain('/api/auth/hesabim/verilerim')`
  // diyordu — yani KIRIK davranışı kilitliyordu. Düz `<a href="/api/…">` iki
  // bağımsız sebeple hiçbir zaman çalışmadı: (1) `next.config.js`te `/api`
  // için rewrite YOK, adres Next sunucusuna gider; (2) düz bağlantı
  // `Authorization: Bearer …` taşımaz, token `localStorage`tadır. Uçtaki KVKK
  // muafiyeti doğru kurulmuşken (`@KoltukDisiIzinli`, ödeme kapısı yok)
  // durdurulmuş kişi verisini yine de indiremiyordu.
  it('"Verilerimi indir" düz bağlantı DEĞİL — ortak yardımcıdan gider', () => {
    expect(sayfa).toContain("from '@/ozellik/kimlik/verileri-indir'");
    expect(sayfa).toContain('verileriIndir(');
    // Düz bağlantı deseni GERİ GELEMEZ.
    expect(sayfa).not.toMatch(/href=["']\/api\//);
  });

  it('"verileriniz silinmedi" güvencesi var', () => {
    expect(sayfa).toContain('Verileriniz silinmedi');
  });
});

describe('giriş/kayıt — oturum yazımı ve yönlendirme tek yerden', () => {
  for (const yol of ['app/login/page.tsx', 'app/register/page.tsx']) {
    it(`${yol} oturumuYaz + girisSonrasiYol kullanıyor`, () => {
      const s = kodu(oku(yol));
      expect(s).toContain('oturumuYaz(');
      expect(s).toContain('girisSonrasiYol(');
      expect(s).not.toContain("localStorage.setItem('token'");
    });
  }
});

describe('teklif listesi — "Hazırlayan: X (ayrıldı)"', () => {
  const sayfa = kodu(oku('app/(protected)/quotes/page.tsx'));
  it('yalnız BAŞKASININ teklifinde gösterilir', () => {
    expect(sayfa).toContain('quote.userId !== benimId');
  });
  it('"(ayrıldı)" notu var', () => {
    expect(sayfa).toContain('(ayrıldı)');
  });
});

describe('yönetici kullanıcılar ekranı — firma rolü ve silme uyarısı', () => {
  const sayfa = kodu(oku('app/admin/users/page.tsx'));
  it('firma rolü seçimi var (platform rolünden AYRI eksen)', () => {
    expect(sayfa).toContain("alanDegistir(u, 'firma-rol'");
  });
  it('silme onayında abonelik iptali uyarısı var (E-1)', () => {
    expect(sayfa).toContain('firmasının tek kullanıcısıysa');
  });
});
