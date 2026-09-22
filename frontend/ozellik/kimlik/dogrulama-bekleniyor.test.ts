/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KAYIT SONRASI DOĞRULAMA EKRANI — KAPI (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Ölçülen davranışlar ve HER BİRİNİN neden var olduğu:
 *
 *   D1  Ekran kayıt akışına GERÇEKTEN bağlı. Bu deponun tekrarlayan hata
 *       sınıfı "mekanizma var, bağlantı yok": bileşen yazılır, hiçbir yerden
 *       çağrılmaz ve kimse fark etmez.
 *   D2  Yönlendirme ERTELENİR, İPTAL EDİLMEZ. Oturum yine yazılır ve
 *       "Şimdilik atla" AYNI yola (`girisSonrasiYol`) gider — ikinci bir yol
 *       hesabı yazılsaydı iki yol günün birinde ayrışırdı.
 *   D3  ATLAMA YOLU KAPATILAMAZ. 22.09 vakası bunu zorunlu kıldı: tek bir
 *       teslimat kazası (posta spam'e düştü) müşteriyi kapıda bırakmamalı.
 *   D4  SPAM uyarısı ekranda var — vakanın tam karşılığı.
 *   D5  Adres ekranda basılıyor (yanlış yazılan adres ancak görülürse fark
 *       edilir).
 *   D6  Yeniden gönderme MEVCUT ucu kullanır; ikinci bir gönderme yolu
 *       açılmaz. 429 ayrı ele alınır — hız sınırı "gönderilemedi" değildir.
 *   D7  E-postanın KENDİ metni de spam'i anıyor (ikinci savunma).
 *
 *  ⚠ Bu dosya KAYNAK okur çünkü ölçülen şey bir BAĞLANTI (hangi bileşen
 *    nereden çağrılıyor, hangi uca gidiliyor) — render testi bunu göremez;
 *    bileşen tek başına mükemmel çalışırken kayıt akışına hiç bağlı
 *    olmayabilir. Metin/kutu varlığı da aynı dosyadan ölçülür.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const EKRAN = oku('ozellik/kimlik/DogrulamaBekleniyorEkrani.tsx');
const KAYIT = oku('app/register/page.tsx');
const SERIT = oku('ortak/kabuk/components/layout/EpostaDogrulamaSeridi.tsx');
const MAIL = oku('../backend/src/altyapi/auth/eposta-dogrulama.servisi.ts');

/** Yorumları soy — kapı kendi belgesini ölçmesin (bu depoda beş kez yaşandı). */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('ÖLÇÜT — dosyalar gerçekten okundu', () => {
  it('dört kaynak da dolu', () => {
    for (const [ad, s] of [
      ['ekran', EKRAN],
      ['kayıt', KAYIT],
      ['şerit', SERIT],
      ['mail', MAIL],
    ] as const) {
      expect(s.length, ad).toBeGreaterThan(500);
    }
  });
});

describe('D1 — ekran kayıt akışına BAĞLI', () => {
  it('kayıt sayfası bileşeni içe aktarıyor', () => {
    expect(kodu(KAYIT)).toMatch(
      /import\s*\{\s*DogrulamaBekleniyorEkrani\s*\}\s*from\s*'@\/ozellik\/kimlik\/DogrulamaBekleniyorEkrani'/,
    );
  });

  // ⚠⚠ BU ASSERT MUTASYONLA DÜZELTİLDİ (22.09). İlk hâli yalnız
  //   `/<DogrulamaBekleniyorEkrani/` arıyordu ve `{dogrulamaBekleniyor ? (`
  //   ifadesini `{false ? (` yapan mutant HAYATTA KALDI: bileşen kaynakta
  //   duruyor ama ÖLÜ bir dalda, hiç çizilmiyor. Yani kapı, yakalamayı
  //   iddia ettiği hata sınıfının ta kendisini kaçırıyordu.
  //   Ölçüt artık ÇİZİM KOŞULU: dalın kapısı DURUM DEĞİŞKENİ olmalı.
  it('çizim koşulu DURUM DEĞİŞKENİ (sabitle kapatılamaz)', () => {
    const kod = kodu(KAYIT);
    expect(kod).toMatch(/\{dogrulamaBekleniyor \? \(/);
    // Koşul ile bileşen AYNI dalda olmalı, araya başka bir dal girmemeli.
    const kosul = kod.indexOf('{dogrulamaBekleniyor ? (');
    const cizim = kod.indexOf('<DogrulamaBekleniyorEkrani');
    expect(kosul).toBeGreaterThan(-1);
    expect(cizim).toBeGreaterThan(kosul);

    // ⚠⚠ İKİNCİ MUTASYON TURU (22.09) — bu blok da ÖLÇÜMLE doğdu.
    //   Yalnız "koşul var + bileşen var + arası kısa" demek YETMEDİ: bileşeni
    //   araya sıkıştırılan `) : false ? (` ile BAŞKA bir ölü dala taşıyan
    //   mutant HAYATTA KALDI. Yani koşul duruyor, bileşen duruyor, ama
    //   bileşen o koşulun dalında DEĞİL.
    //   Ölçüt: koşul ile bileşen ARASINDA yeni bir dal açılmamalı.
    const ara = kod.slice(kosul + '{dogrulamaBekleniyor ? ('.length, cizim);
    expect(ara, 'koşul ile bileşen arasına yeni bir dal girmiş').not.toMatch(/\?\s*\(/);
    expect(ara, 'koşul ile bileşen arasına `:` dalı girmiş').not.toMatch(/\)\s*:/);
    expect(ara.trim().length, 'araya beklenmedik JSX girmiş').toBeLessThan(40);

    // Bileşen TEK yerde çizilmeli — ikinci bir kopya, hangisinin canlı
    // olduğunu belirsizleştirir.
    const adet = (kod.match(/<DogrulamaBekleniyorEkrani/g) ?? []).length;
    expect(adet).toBe(1);
  });

  it('durum kayıt başarısında GERÇEKTEN doluyor (koşul hep false kalmaz)', () => {
    expect(kodu(KAYIT)).toMatch(/setDogrulamaBekleniyor\(\{/);
  });

  it('kayıt BAŞARILI dalında devreye giriyor (hata dalında değil)', () => {
    const kod = kodu(KAYIT);
    const basari = kod.indexOf('oturumuYaz(data)');
    const hata = kod.indexOf('catch (err');
    expect(basari).toBeGreaterThan(-1);
    expect(hata).toBeGreaterThan(-1);
    const kur = kod.indexOf('setDogrulamaBekleniyor({');
    expect(kur).toBeGreaterThan(basari);
    expect(kur).toBeLessThan(hata);
  });
});

describe('D2/D3 — yönlendirme ERTELENİR, atlama yolu KAPATILAMAZ', () => {
  it('oturum yine yazılıyor (kayıt yarım bırakılmıyor)', () => {
    expect(kodu(KAYIT)).toMatch(/const oturum = oturumuYaz\(data\)/);
  });

  it('"devam" aynı TEK yolu kullanıyor — ikinci yol hesabı YOK', () => {
    const kod = kodu(KAYIT);
    expect(kod).toMatch(/devam:\s*\(\)\s*=>\s*router\.push\(girisSonrasiYol\(oturum\)\)/);
    // `girisSonrasiYol` tek kaynak olmalı: kayıt akışında başka bir hedef
    // üretilmemeli (ör. sabit '/dashboard').
    expect(kod).not.toMatch(/router\.push\(['"`]\/(dashboard|teklifler|abonelik)/);
  });

  it('ekran bir ATLAMA düğmesi sunuyor ve onDevam`a bağlı', () => {
    expect(EKRAN).toMatch(/onClick=\{onDevam\}/);
    expect(EKRAN).toMatch(/Şimdilik atla/);
  });

  it('ekran onDevam`ı ZORUNLU alıyor (opsiyonel yapılıp sessizce düşürülemez)', () => {
    expect(EKRAN).toMatch(/onDevam:\s*\(\)\s*=>\s*void/);
    expect(EKRAN).not.toMatch(/onDevam\?:/);
  });
});

describe('D4/D5 — spam uyarısı ve adres EKRANDA', () => {
  it('spam/gereksiz klasörü ADIYLA anılıyor', () => {
    expect(EKRAN).toMatch(/Spam\s*\/\s*Gereksiz/);
  });

  it('"Spam değil" işaretlemesi öğretiliyor', () => {
    expect(EKRAN).toContain('Spam değil');
  });

  it('kullanıcının adresi basılıyor (yazım hatası görünsün)', () => {
    expect(kodu(EKRAN)).toMatch(/\{eposta\}/);
    expect(kodu(KAYIT)).toMatch(/eposta:\s*email/);
  });
});

describe('D6 — yeniden gönderme TEK uçtan', () => {
  it('ekran mevcut ucu kullanıyor', () => {
    expect(kodu(EKRAN)).toMatch(/api\.post\('\/auth\/resend-verification'/);
  });

  it('şeritle AYNI uç — ikinci bir gönderme yolu açılmadı', () => {
    const uc = /\/auth\/resend-verification/;
    expect(kodu(SERIT)).toMatch(uc);
    expect(kodu(EKRAN)).toMatch(uc);
  });

  it('429 ayrı ele alınıyor (hız sınırı "gönderilemedi" değildir)', () => {
    expect(kodu(EKRAN)).toMatch(/status\s*===\s*429/);
  });
});

describe('D7 — e-postanın KENDİ metni de spam`i anıyor', () => {
  it('alt notta spam yönergesi var', () => {
    const kod = kodu(MAIL);
    expect(kod).toContain('Spam / Gereksiz');
    expect(kod).toContain('Spam değil');
  });

  it('bağlantının düz metin kopyası KORUNDU (kutu kaybolmadı)', () => {
    expect(kodu(MAIL)).toMatch(/adres çubuğuna kopyalayın/);
  });
});
