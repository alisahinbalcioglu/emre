import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEVIYE_AD, SEVIYE_ETIKET, donemEki, kotaCumlesi, kotaMetni, paketListesiGorunumu, sayiYaz, seviyeAdi, tutarYaz } from './paket-bicim';

// Faz 6.1 (13.09): kota başlığı. Satır BAŞLIK, dosya PARANTEZ — ölçümle
// desteklenen karar (dosya boyu 4–1.766 satır; "ayda 30 çeviri" yanıltır).

const AYLIK = { periyot: 'MONTHLY', periyotAdedi: 1 };

describe('sayiYaz — TR binlik ayracı, ICU\'dan bağımsız', () => {
  it.each([
    [30, '30'],
    [3000, '3.000'],
    [4500, '4.500'],
    [9000, '9.000'],
    [1234567, '1.234.567'],
  ])('%d → %s', (n, beklenen) => {
    expect(sayiYaz(n)).toBe(beklenen);
  });
});

describe('tutarYaz — ortak binlik yardımcısına geçince davranış aynı', () => {
  it.each([
    ['1299.00', 'TRY', '₺1.299,00'],
    ['2449.5', 'TRY', '₺2.449,50'],
    ['22.00', 'USD', '$22,00'],
    ['1234567.89', 'EUR', '€1.234.567,89'],
  ])('%s %s → %s', (tutar, birim, beklenen) => {
    expect(tutarYaz(tutar, birim)).toBe(beklenen);
  });
});

describe('donemEki — kota metniyle aynı dönemi söyler', () => {
  it('aylık·1 → "/ ay"', () => {
    expect(donemEki({ periyot: 'MONTHLY', periyotAdedi: 1 })).toBe('/ ay');
  });
  it('yıllık·1 → "/ yıl"', () => {
    expect(donemEki({ periyot: 'YEARLY', periyotAdedi: 1 })).toBe('/ yıl');
  });
  it('aylık·3 "/ ay" DEĞİL → "/ dönem"', () => {
    expect(donemEki({ periyot: 'MONTHLY', periyotAdedi: 3 })).toBe('/ dönem');
  });
});

describe('kotaCumlesi — iş emrindeki üç başlık birebir', () => {
  it('Core', () => {
    expect(kotaCumlesi({ satir: 3000, dosya: 30 }, AYLIK)).toBe('Ayda 3.000 satır çeviri (en fazla 30 dosya)');
  });
  it('Pro', () => {
    expect(kotaCumlesi({ satir: 4500, dosya: 60 }, AYLIK)).toBe('Ayda 4.500 satır çeviri (en fazla 60 dosya)');
  });
  it('Pro MEP', () => {
    expect(kotaCumlesi({ satir: 9000, dosya: 120 }, AYLIK)).toBe('Ayda 9.000 satır çeviri (en fazla 120 dosya)');
  });
});

/**
 * Faz 6.1 kapanış (15.09): kart başlığı "Basic — Mekanik", rozet "Core —
 * malzeme" diyordu. Başlık veritabanındaki paket adıdır; rozet ona uyar.
 * Fikstür CANLI yanıttan kopyalandı (`GET https://metapricex.com/api/fiyatlar`,
 * 15.09 13:49 UTC) — elle uydurulmuş ad, ölçütü dairesel yapardı.
 */
const CANLI_PAKETLER_15_09 = [
  { ad: 'Basic — Mekanik', seviye: 'core' },
  { ad: 'Pro — Mekanik', seviye: 'pro' },
  { ad: 'Basic — Elektrik', seviye: 'core' },
  { ad: 'Pro — Elektrik', seviye: 'pro' },
  { ad: 'Pro — Mekanik + Elektrik', seviye: 'pro' },
];

describe('SEVIYE_ETIKET — rozet adı kart başlığıyla aynı dili konuşur', () => {
  it('iki seviyenin ekran adı birebir (Türkçe karakterli)', () => {
    expect(SEVIYE_ETIKET).toEqual({
      core: 'Basic — malzeme',
      pro: 'Pro — malzeme + işçilik + DWG',
    });
  });

  it.each(CANLI_PAKETLER_15_09)('"$ad" kartında rozetin paket adı başlıkla aynı', ({ ad, seviye }) => {
    const baslikAdi = ad.split(' — ')[0];
    const rozetAdi = SEVIYE_ETIKET[seviye]?.split(' — ')[0];
    expect(rozetAdi).toBe(baslikAdi);
  });

  it('fikstür iki seviyeyi de içeriyor (boş küme yeşil vermesin)', () => {
    expect(new Set(CANLI_PAKETLER_15_09.map((p) => p.seviye))).toEqual(new Set(['core', 'pro']));
  });
});

/**
 * 15.09 (Emre kararı): müşteriye görünen en ucuz paket adı "Basic"; `core` yalnız
 * iç seviye kodu (backend `enum Tier { core pro suite }`). Kenar çubuğu kodu
 * basıyordu → "CORE". Kenar çubuğunun bu işlevi GERÇEKTEN kullandığı
 * `turkce-metin.test.ts` "Paket adı" bloğunda (bağlantı).
 */
describe('seviyeAdi — ekrana seviye KODU değil paket ADI gider', () => {
  it('core → Basic, pro → Pro, suite → Suite', () => {
    expect(seviyeAdi('core')).toBe('Basic');
    expect(seviyeAdi('pro')).toBe('Pro');
    expect(seviyeAdi('suite')).toBe('Suite');
  });

  it('hiçbir ekran adı "Core" değil; tanınmayan kod AYNEN döner (sessizce "Basic" demez)', () => {
    expect(Object.values(SEVIYE_AD).filter((ad) => /core/i.test(ad))).toEqual([]);
    expect(seviyeAdi('kurumsal')).toBe('kurumsal');
  });

  it('kart rozeti aynı adı taşır — tek kaynak', () => {
    const kodlar = Object.keys(SEVIYE_ETIKET);
    expect(kodlar).toEqual(['core', 'pro']);
    for (const kod of kodlar) expect(SEVIYE_ETIKET[kod].split(' — ')[0]).toBe(seviyeAdi(kod));
  });
});

describe('kotaMetni — hangi tavan başlıkta', () => {
  it('başlık SATIR tavanını, ikincil DOSYA tavanını taşır', () => {
    const m = kotaMetni({ satir: 3000, dosya: 30 }, AYLIK);
    expect(m.baslik).toContain('3.000 satır');
    expect(m.baslik).not.toContain('dosya');
    expect(m.ikincil).toBe('en fazla 30 dosya');
  });

  it('aylık OLMAYAN sürümde "Ayda" yazılmaz (kota abonelik dönemine bağlı)', () => {
    expect(kotaMetni({ satir: 3000, dosya: 30 }, { periyot: 'YEARLY', periyotAdedi: 1 }).baslik).toBe(
      'Abonelik dönemi başına 3.000 satır çeviri',
    );
    expect(kotaMetni({ satir: 3000, dosya: 30 }, { periyot: 'MONTHLY', periyotAdedi: 3 }).baslik).not.toMatch(/^Ayda/);
  });
});

// 25.09.2026 — yükleme hatası "satışta paket yok" DEĞİLDİR (gerekçe: `paketListesiGorunumu`).
describe('paketListesiGorunumu — boş liste cümlesi yalnız BAŞARILI ve boş yanıtta', () => {
  it('⭐⭐ istek düştü, liste boş → "hata" (kırmızı kutu tek başına kalır)', () => {
    expect(paketListesiGorunumu({ yukleniyor: false, yuklemeHatasi: true, paketSayisi: 0 })).toBe('hata');
  });

  it('⭐ istek başarılı, `[]` döndü → "bos"', () => {
    expect(paketListesiGorunumu({ yukleniyor: false, yuklemeHatasi: false, paketSayisi: 0 })).toBe('bos');
  });

  it('yükleme sürerken öteki girdilere bakılmaz', () => {
    for (const yuklemeHatasi of [false, true]) {
      for (const paketSayisi of [0, 3]) {
        expect(paketListesiGorunumu({ yukleniyor: true, yuklemeHatasi, paketSayisi })).toBe('yukleniyor');
      }
    }
  });

  it('paket varsa kartlar', () => {
    expect(paketListesiGorunumu({ yukleniyor: false, yuklemeHatasi: false, paketSayisi: 5 })).toBe('kartlar');
  });

  it('kartlar varken YENİLEME düşerse önceki kartlar kalır (eski davranış; kırmızı kutu yenilemeyi ister)', () => {
    expect(paketListesiGorunumu({ yukleniyor: false, yuklemeHatasi: true, paketSayisi: 5 })).toBe('kartlar');
  });
});

/**
 * BAĞLANTI — sayfa bu karara GERÇEKTEN bağlı (karar doğru, çağıran yoksa kusur
 * aynen yaşar). vitest `@/` takma adını çözmez: kaynak düz metin okunur ve
 * yorumlar atılır ki kapı yorumu değil KODU ölçsün.
 */
describe('abonelik sayfası — yükleme hatasında boş liste cümlesi çizilmez', () => {
  const kodu = (s: string) =>
    s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const sayfa = kodu(readFileSync(join(__dirname, '..', '..', 'app/(protected)/abonelik/page.tsx'), 'utf8'));
  const bas = sayfa.indexOf('const paketleriGetir = useCallback(async () => {');
  const getir = sayfa.slice(bas, sayfa.indexOf('}, []);', bas));
  const dene = getir.slice(0, getir.indexOf('} catch {'));
  const yakala = getir.slice(getir.indexOf('} catch {'), getir.indexOf('} finally {'));

  it('FIXTURE KANITI: yükleme fonksiyonu ve try/catch parçaları bulundu', () => {
    expect(bas).toBeGreaterThan(-1);
    expect(dene).toContain("api.get<Paket[]>('/abonelik/paketler')");
    expect(yakala.startsWith('} catch {')).toBe(true);
    expect(getir).toContain('} finally {');
  });

  it('⭐ görünüm karardan; karar bayrağı alıyor', () => {
    expect(sayfa).toMatch(
      /const paketGorunumu = paketListesiGorunumu\(\{\s*yukleniyor,\s*yuklemeHatasi: paketHatasi,\s*paketSayisi: paketler\.length,\s*\}\);/,
    );
  });

  it('⭐⭐ boş liste cümlesi YALNIZ "bos" dalında; "hata" dalı hiçbir şey çizmez', () => {
    expect(sayfa.split('Şu anda satışta paket bulunmuyor. Lütfen bizimle iletişime geçin.')).toHaveLength(2);
    expect(sayfa).toMatch(
      /\{paketGorunumu === 'yukleniyor' \? \([\s\S]{0,200}?\) : paketGorunumu === 'hata' \? \(\s*null\s*\) : paketGorunumu === 'bos' \? \(\s*<div[^>]*>\s*Şu anda satışta paket bulunmuyor\./,
    );
  });

  it('⭐ istek düşünce bayrak kalkar, hata metni AYNEN; başarıda bayrak iner', () => {
    expect(yakala).toContain('setPaketHatasi(true);');
    expect(yakala).toContain("setHata('Paketler yüklenemedi. Lütfen sayfayı yenileyin.');");
    expect(dene).toContain('setPaketHatasi(false);');
    // Başka yazan yok (ör. `finally`de indirilen bayrak kusuru geri getirir).
    expect(sayfa.split('setPaketHatasi(').length - 1).toBe(2);
    // Yenileme düşerse eski kartlar kalır: hata yolu listeyi SİLMEZ.
    expect(yakala).not.toContain('setPaketler(');
  });

  it('⭐ "hata" dalının dayandığı kırmızı kutu ana görünümde, paket alanının ÜSTÜNDE', () => {
    const bas = sayfa.indexOf('const paketGorunumu = paketListesiGorunumu(');
    const son = sayfa.indexOf("{paketGorunumu === 'yukleniyor' ? (");
    expect(bas).toBeGreaterThan(-1);
    expect(son).toBeGreaterThan(bas);
    expect(sayfa.slice(bas, son)).toMatch(/\{hata && \(\s*<div[^>]*>\s*\{hata\}\s*<\/div>\s*\)\}/);
  });

  it('⭐ dizi olmayan 200 boş liste sayılmaz — listeye yazılmadan hata yoluna düşer', () => {
    const koruma = dene.indexOf('if (!Array.isArray(data)) throw ');
    expect(koruma).toBeGreaterThan(-1);
    expect(koruma).toBeLessThan(dene.indexOf('setPaketler(data);'));
  });
});
