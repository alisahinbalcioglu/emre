/**
 * admin-stats — Istatistikler sayfasinin servis katmani.
 *
 * GERCEK VERI: GET /admin/stats (userCount, quoteCount, brandCount,
 * materialCount, priceListCount) — KPI kartlarinin ana degerleri buradan.
 *
 * DUMMY VERI: trend %'leri, 30 gunluk teklif serisi, disiplin dagilimi ve
 * Top-5 marka aktarimi — backend'de henuz zaman-serisi/aggregation ucu yok.
 * Deterministik uretilir (her render'da zipla yok). Backend ucu eklendiginde
 * SADECE bu dosya guncellenir; sayfa komponenti degismez.
 */

import api from '@/lib/api';

export interface KpiMetric {
  value: number;
  /** Onceki aya gore % degisim (dummy — backend zaman serisi ekleyince gercek) */
  trendPct: number;
  isDummyTrend: boolean;
}

export interface AdminStats {
  totalUsers: KpiMetric;
  totalQuotes: KpiMetric;
  totalBrands: KpiMetric;
  /** Bu ayki aktif kullanici orani (%) — dummy */
  activeUserRate: KpiMetric;
  /** Son 30 gun: gunluk yeni teklif sayisi */
  quoteTrend: Array<{ date: string; teklif: number }>;
  /** Disiplin dagilimi (pie) */
  disciplineSplit: Array<{ name: string; value: number }>;
  /** Kutuphaneye en cok aktarilan Top 5 marka (yatay bar) */
  topBrands: Array<{ name: string; aktarim: number }>;
  /** KPI degerleri gercek API'den mi geldi? */
  live: boolean;
}

/** Deterministik pseudo-random — dummy seriler her yuklemede AYNI gorunsun. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function dummyQuoteTrend(): AdminStats['quoteTrend'] {
  const rnd = seeded(42);
  const out: AdminStats['quoteTrend'] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // Hafif yukari trend + gunluk dalgalanma
    const base = 2 + (29 - i) * 0.15;
    out.push({
      date: d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
      teklif: Math.max(0, Math.round(base + rnd() * 4 - 1)),
    });
  }
  return out;
}

const DUMMY_DISCIPLINE = [
  { name: 'Mekanik', value: 68 },
  { name: 'Elektrik', value: 32 },
];

const DUMMY_TOP_BRANDS = [
  { name: 'ECA', aktarim: 14 },
  { name: 'Vaillant', aktarim: 11 },
  { name: 'Viega', aktarim: 8 },
  { name: 'Schneider', aktarim: 6 },
  { name: 'Göldağ', aktarim: 4 },
];

function dummyKpi(value: number, trendPct: number): KpiMetric {
  return { value, trendPct, isDummyTrend: true };
}

const FULL_DUMMY: AdminStats = {
  totalUsers: dummyKpi(2, 100),
  totalQuotes: dummyKpi(12, 33),
  totalBrands: dummyKpi(5, 25),
  activeUserRate: dummyKpi(74, 8),
  quoteTrend: dummyQuoteTrend(),
  disciplineSplit: DUMMY_DISCIPLINE,
  topBrands: DUMMY_TOP_BRANDS,
  live: false,
};

export async function fetchAdminStats(): Promise<AdminStats> {
  try {
    const { data } = await api.get<{
      userCount: number;
      brandCount: number;
      materialCount: number;
      quoteCount: number;
      priceListCount: number;
    }>('/admin/stats');

    return {
      ...FULL_DUMMY,
      // KPI ana degerleri GERCEK — trend %'leri dummy (backend serisi yok)
      totalUsers: dummyKpi(data.userCount, 100),
      totalQuotes: dummyKpi(data.quoteCount, 33),
      totalBrands: dummyKpi(data.brandCount, 25),
      quoteTrend: dummyQuoteTrend(),
      live: true,
    };
  } catch {
    // API erisilemedi (network/CORS/dev) → tam dummy; sayfa yine calisir
    return FULL_DUMMY;
  }
}
