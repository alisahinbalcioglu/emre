import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bekleyenDegisimCumlesi,
  degisimOnayMetni,
  kartEylemi,
  mevcutPaketMi,
  type DegisimOzeti,
} from './paket-degisimi';

/**
 * PAKET DEĞİŞİMİ — ÖN YÜZ KAPISI (23.09.2026, yönetici paneli turu A1)
 *
 * Karar SUNUCUDA (`backend/.../paket-degisimi.ts`); burada ölçülen: (1) ön yüz
 * o kararı DOĞRU okuyor mu, (2) sayfa bu modüle GERÇEKTEN bağlı mı, (3) iki
 * taraf aynı biçimi mi konuşuyor.
 *
 * ⚠ vitest `@/` takma adını çözmez: kaynak dosyalar düz metin olarak okunur.
 */
const kok = join(__dirname, '..', '..');
// CRLF → LF: depo dosyaları Windows satır sonuyla kayıtlı; çok satırlı
// beklenti `\n` ile yazıldı ve satır sonu farkı yanlış KIRMIZI üretmesin.
const oku = (p: string) => readFileSync(join(kok, p), 'utf8').replace(/\r\n/g, '\n');
/** Yorumları atar: kapı YORUMU değil KODU ölçsün. */
const kodu = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const DEGISTIR_HEMEN: DegisimOzeti = { yol: 'degistir', zamanlama: 'hemen', beklenenTarih: '2026-10-20T10:00:00.000Z' };

describe('M · mevcut paket — sunucu söylüyorsa sunucu', () => {
  it('⭐ AYNI_PAKET → mevcut', () => {
    expect(mevcutPaketMi({ kod: 'pro-mek', degisim: { yol: 'yok', kod: 'AYNI_PAKET', mesaj: '' } }, 'pro-mek')).toBe(true);
  });

  it('⭐⭐ SÜRESİ BİTMİŞ aboneliğin eski paketi KİLİTLİ DEĞİL (sunucu "satin-al" diyor)', () => {
    // Eski kural `p.kod === erisim.paketKodu` idi ve SONA_ERDI'de de doludur:
    // müşteri eski paketini yeniden satın alamıyordu.
    expect(mevcutPaketMi({ kod: 'pro-mek', degisim: { yol: 'satin-al' } }, 'pro-mek')).toBe(false);
  });

  it('eski sunucu (`degisim` yok) → eski kural (geriye dönük uyum)', () => {
    expect(mevcutPaketMi({ kod: 'pro-mek' }, 'pro-mek')).toBe(true);
    expect(mevcutPaketMi({ kod: 'pro-mek' }, null)).toBe(false);
  });
});

describe('K · kart eylemi', () => {
  const sahip = { mevcutMu: false, sahipMi: true };

  it('mevcut paket her rolde eylemsiz', () => {
    expect(kartEylemi({ kod: 'a', degisim: DEGISTIR_HEMEN }, { mevcutMu: true, sahipMi: true }).tur).toBe('mevcut');
    expect(kartEylemi({ kod: 'a', degisim: DEGISTIR_HEMEN }, { mevcutMu: true, sahipMi: false }).tur).toBe('mevcut');
  });

  it('⭐ sahip olmayan için düğme YOK (sunucu FirmaRolGuard ile reddeder)', () => {
    expect(kartEylemi({ kod: 'a', degisim: DEGISTIR_HEMEN }, { mevcutMu: false, sahipMi: false }).tur).toBe('sahip-degil');
  });

  it('satın al: `degisim` yoksa ya da sunucu "satin-al" diyorsa', () => {
    expect(kartEylemi({ kod: 'a' }, sahip).tur).toBe('satin-al');
    expect(kartEylemi({ kod: 'a', degisim: { yol: 'satin-al' } }, sahip).tur).toBe('satin-al');
  });

  it('⭐ geç: zamanlama ve tarih SUNUCUDAN aynen taşınır', () => {
    expect(kartEylemi({ kod: 'a', degisim: DEGISTIR_HEMEN }, sahip)).toEqual({
      tur: 'degistir',
      zamanlama: 'hemen',
      beklenenTarih: '2026-10-20T10:00:00.000Z',
    });
  });

  it('⭐ geçilemez: sunucunun gerekçesi taşınır (kapalı düğme "neden?" sorusunu cevapsız bırakmaz)', () => {
    const e = kartEylemi({ kod: 'a', degisim: { yol: 'yok', kod: 'DEGISIM_BEKLIYOR', mesaj: 'Bu dönem için bir paket değişikliği zaten yapıldı.' } }, sahip);
    expect(e).toEqual({ tur: 'kapali', mesaj: 'Bu dönem için bir paket değişikliği zaten yapıldı.' });
  });

  it('AYNI_PAKET "geçilemez" değil, mevcut sayılır', () => {
    expect(kartEylemi({ kod: 'a', degisim: { yol: 'yok', kod: 'AYNI_PAKET', mesaj: 'x' } }, sahip).tur).toBe('mevcut');
  });
});

describe('D · onay metni — müşteri NE ZAMAN ve NE KADAR ödeyeceğini onaydan ÖNCE görür', () => {
  const temel = { yeniPaketAdi: 'Pro — Mekanik', yeniTutar: '1649.00', paraBirimi: 'TRY', beklenenTarih: '2026-10-20T10:00:00.000Z' };

  it('⭐ hemen: özellik şimdi, ücret tarihten, EK ÜCRET YOK', () => {
    const m = degisimOnayMetni({ ...temel, zamanlama: 'hemen' });
    expect(m).toContain('hemen açılır');
    expect(m).toContain('20.10.2026 tarihinden itibaren');
    expect(m).toContain('ek ücret alınmaz');
    expect(m).toContain('₺1.649,00 (KDV dahil)');
  });

  it('⭐ dönem sonu: geçiş tarihi + o tarihe kadar mevcut paket açık', () => {
    const m = degisimOnayMetni({ ...temel, zamanlama: 'donem-sonu' });
    expect(m).toContain('mevcut döneminizin sonunda (20.10.2026)');
    expect(m).toContain('mevcut paketinizin özellikleri açık kalır');
    expect(m).not.toContain('hemen');
  });

  it('bozuk tarih uydurulmaz', () => {
    expect(degisimOnayMetni({ ...temel, zamanlama: 'donem-sonu', beklenenTarih: 'x' })).toContain('(dönem sonunda)');
  });
});

describe('B · bekleyen değişim cümlesi', () => {
  it('yoksa satır çizilmez', () => {
    expect(bekleyenDegisimCumlesi(null)).toBeNull();
    expect(bekleyenDegisimCumlesi(undefined)).toBeNull();
    expect(bekleyenDegisimCumlesi({ tarih: 'bozuk', planliPaket: null })).toBeNull();
  });

  it('⭐ düşürme: hangi tarihte hangi pakete', () => {
    expect(bekleyenDegisimCumlesi({ tarih: '2026-10-20T10:00:00.000Z', planliPaket: { kod: 'basic-mek', ad: 'Basic — Mekanik' } }))
      .toContain('20.10.2026 tarihinde Basic — Mekanik paketine geçilecek');
  });

  it('yükseltme sonrası: yeni ücretin başladığı gün + bu dönem yeni değişiklik yok', () => {
    const m = bekleyenDegisimCumlesi({ tarih: '2026-10-20T10:00:00.000Z', planliPaket: null });
    expect(m).toContain('Yeni aylık ücretiniz 20.10.2026 tarihinden itibaren geçerli');
    expect(m).toContain('yeni bir paket değişikliği yapılamaz');
  });
});

describe('S · BAĞLANTI — sayfa bu kurallara GERÇEKTEN bağlı', () => {
  const sayfa = kodu(oku('app/(protected)/abonelik/page.tsx'));

  it('kart kararı modülden (sahiplik ölçütü AYNI ifade)', () => {
    expect(sayfa).toContain("from '@/ozellik/odeme/paket-degisimi'");
    expect(sayfa).toContain('const mevcutMu = mevcutPaketMi(p, mevcutPaketKodu);');
    expect(sayfa).toContain("kartEylemi(p, { mevcutMu, sahipMi: firmaRol === 'sahip' })");
  });

  it('⭐ "geç" düğmesi FATURA FORMUNA değil onay penceresine gider', () => {
    const i = sayfa.indexOf("if (eylem.tur === 'degistir') {");
    expect(i).toBeGreaterThan(-1);
    const dal = sayfa.slice(i, sayfa.indexOf('return;', i));
    expect(dal).toContain('setDegisimHedefi(p)');
    expect(dal).not.toContain('paketiSec(');
  });

  it('⭐ kapalı düğme BASILMAZ ve gerekçesi yazılır', () => {
    expect(sayfa).toContain("disabled={eylem.tur === 'mevcut' || eylem.tur === 'kapali'}");
    expect(sayfa).toMatch(/eylem\.tur === 'kapali' && \([\s\S]{0,160}\{eylem\.mesaj\}/);
  });

  it('⭐⭐ değişim isteği onayı TAŞIYOR; onaysız düğme basılmaz; ikinci kapı var', () => {
    expect(sayfa).toMatch(/api\.post<[^>]*>\('\/abonelik\/degistir', \{\s*paketSurumuId: degisimHedefi\.surum\.paketSurumuId,\s*sozlesmeOnayi: degisimOnayi,/);
    expect(sayfa).toContain('disabled={degisimGonderiliyor || !degisimOnayi}');
    expect(sayfa).toContain('sozlesmeOnayiHatasi(degisimOnayi)');
    // Önceden İŞARETSİZ: aynı sabit, ayrı durum.
    expect(sayfa).toContain('useState<boolean>(SOZLESME_ONAYI_BASLANGIC);\n  const [degisimGonderiliyor');
  });

  it('onay penceresi zamanlamayı SUNUCUDAN okuyor, küçültme uyarısı içinde', () => {
    expect(sayfa).toContain('zamanlama: degisimHedefi.degisim.zamanlama');
    expect(sayfa).toContain('beklenenTarih: degisimHedefi.degisim.beklenenTarih');
    expect(sayfa).toContain('kucultmeUyarisi(aktifKullanici, degisimHedefi.kullaniciHakki)');
  });

  it('başarıda yetenekler YENİLENİR (yükseltme özellikleri hemen açar)', () => {
    expect(sayfa).toContain('await Promise.all([paketleriGetir(), kimligiGetir(), yetenekleriYenile()]);');
  });

  it('⭐ sunucu metni yoksa (bağlantı koptu) "değişmedi" DENMEZ, ekran gerçek hâli yeniden okur', () => {
    // İnceleme bulgusu 1: yanıt yolda kaybolduysa değişim sunucuda olmuş
    // olabilir; kesin red metnini YALNIZ sunucu verir.
    const i = sayfa.indexOf('async function paketeGec()');
    expect(i).toBeGreaterThan(-1);
    const govde = sayfa.slice(i, sayfa.indexOf('\n  }\n', i));
    const yakala = govde.slice(govde.indexOf('} catch (e: any) {'));
    expect(yakala).toContain('İşlemin sonucu doğrulanamadı.');
    expect(yakala).not.toContain('değişmedi');
    expect(yakala).toContain('void Promise.all([paketleriGetir(), kimligiGetir(), yetenekleriYenile()])');
  });

  it('bekleyen değişim "şu anki paketiniz" satırında', () => {
    expect(sayfa).toContain('{bekleyenDegisimCumlesi(erisim?.paketGecisi)}');
  });

  it('Hesabım → Abonelik sekmesi de bekleyen değişimi gösteriyor (aynı kaynak, aynı cümle)', () => {
    const sekme = kodu(oku('ozellik/kimlik/hesabim/AbonelikSekmesi.tsx'));
    expect(sekme).toContain('const { refresh, erisim } = useCapabilities();');
    expect(sekme).toContain('{bekleyenDegisimCumlesi(erisim?.paketGecisi)}');
  });
});

describe('P · iki taraf AYNI biçimi konuşuyor (sunucu ↔ ön yüz)', () => {
  const servis = kodu(oku('../backend/src/ozellik/odeme/abonelik/paket-degisimi.servisi.ts'));
  const erisim = kodu(oku('../backend/src/ozellik/odeme/abonelik/erisim.servisi.ts'));
  const denetleyici = kodu(oku('../backend/src/ozellik/odeme/abonelik/abonelik.controller.ts'));

  it('kart özeti: üç yol ve alan adları', () => {
    expect(servis).toContain("| { yol: 'satin-al' }");
    expect(servis).toContain("| { yol: 'degistir'; zamanlama: DegisimZamanlamasi; beklenenTarih: string }");
    expect(servis).toContain("| { yol: 'yok'; kod: PaketDegisimRedKodu; mesaj: string };");
  });

  it('kart özeti `degisim` adıyla gönderiliyor', () => {
    expect(denetleyici).toMatch(/degisim: yollar\.get\(p\.surum\.paketSurumuId\)/);
  });

  it('bekleyen değişim: `paketGecisi` biçimi', () => {
    expect(erisim).toContain('paketGecisi?: { tarih: string; planliPaket: { kod: string; ad: string } | null } | null;');
  });

  it('değişim yanıtı `mesaj` taşıyor (sayfa onu gösterir)', () => {
    expect(servis).toMatch(/interface DegisimSonucu \{[\s\S]{0,300}mesaj: string;/);
  });
});
