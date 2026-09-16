import { describe, expect, it } from 'vitest';
import { SEVIYE_AD, SEVIYE_ETIKET, donemEki, kotaCumlesi, kotaMetni, sayiYaz, seviyeAdi, tutarYaz } from './paket-bicim';

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
