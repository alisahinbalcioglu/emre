/**
 * admin-stats — Istatistikler sayfasinin servis katmani.
 *
 * TUM VERI GERCEK: GET /admin/stats artik zaman-serisi/aggregation dondurur —
 * KPI'lar + aylik trendler + 30 gunluk teklif serisi + disiplin dagilimi
 * (kutuphanede kullanilan markalarin disiplini) + Top-5 aktarilan marka.
 * Dummy/sahte veri YOK. API hatasinda sifir-degerli guvenli sekil doner
 * (sayfa cokmez, "veri alinamadi" rozeti gosterilir).
 */

import api from '@/lib/api';

export interface KpiMetric {
  value: number;
  /** Onceki aya gore % degisim. null = hesaplanamiyor (rozet gizlenir). */
  trendPct: number | null;
}

export interface AdminStats {
  totalUsers: KpiMetric;
  totalQuotes: KpiMetric;
  totalBrands: KpiMetric;
  /** Bu ay teklif olusturan kullanici / toplam kullanici (%) */
  activeUserRate: KpiMetric;
  /** Son 30 gun: gunluk yeni teklif sayisi */
  quoteTrend: Array<{ date: string; teklif: number }>;
  /** Disiplin dagilimi — kutuphanede kullanilan markalarin disiplinine gore */
  disciplineSplit: Array<{ name: string; value: number }>;
  /** Kutuphaneye en cok aktarilan Top 5 marka */
  topBrands: Array<{ name: string; aktarim: number }>;
  /** Veri API'den basariyla geldi mi? */
  live: boolean;
}

interface StatsApiResponse {
  userCount: number;
  brandCount: number;
  materialCount: number;
  quoteCount: number;
  priceListCount: number;
  trends?: {
    users: number | null;
    quotes: number | null;
    brands: number | null;
    activeUsers: number | null;
  };
  activeUserRate?: number;
  quoteTrend?: Array<{ date: string; count: number }>;
  disciplineSplit?: Array<{ name: string; value: number }>;
  topBrands?: Array<{ name: string; count: number }>;
}

const EMPTY: AdminStats = {
  totalUsers: { value: 0, trendPct: null },
  totalQuotes: { value: 0, trendPct: null },
  totalBrands: { value: 0, trendPct: null },
  activeUserRate: { value: 0, trendPct: null },
  quoteTrend: [],
  disciplineSplit: [],
  topBrands: [],
  live: false,
};

export async function fetchAdminStats(): Promise<AdminStats> {
  try {
    const { data } = await api.get<StatsApiResponse>('/admin/stats');
    return {
      totalUsers: { value: data.userCount ?? 0, trendPct: data.trends?.users ?? null },
      totalQuotes: { value: data.quoteCount ?? 0, trendPct: data.trends?.quotes ?? null },
      totalBrands: { value: data.brandCount ?? 0, trendPct: data.trends?.brands ?? null },
      activeUserRate: { value: data.activeUserRate ?? 0, trendPct: data.trends?.activeUsers ?? null },
      quoteTrend: (data.quoteTrend ?? []).map((r) => ({ date: r.date, teklif: r.count })),
      disciplineSplit: data.disciplineSplit ?? [],
      topBrands: (data.topBrands ?? []).map((r) => ({ name: r.name, aktarim: r.count })),
      live: true,
    };
  } catch {
    return EMPTY;
  }
}
