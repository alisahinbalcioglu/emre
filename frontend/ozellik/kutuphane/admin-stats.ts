/**
 * admin-stats — Istatistikler sayfasinin servis katmani.
 *
 * TUM VERI GERCEK: GET /admin/stats artik zaman-serisi/aggregation dondurur —
 * KPI'lar + aylik trendler + 30 gunluk teklif serisi + disiplin dagilimi
 * (kutuphanede kullanilan markalarin disiplini) + Top-5 aktarilan marka.
 * Dummy/sahte veri YOK. API hatasinda sifir-degerli guvenli sekil doner
 * (sayfa cokmez, "veri alinamadi" rozeti gosterilir).
 */

import api from '@/ortak/lib/api';

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

/* ═════════════ AI KULLANIMI (13.08) ═════════════
 *
 * `GET /admin/ai-stats` 12.08'den beri VARDI ama frontend'de TEK tuketicisi
 * yoktu — yani olculen veri hicbir ekrana ulasmiyordu. Ayni turda olcum
 * borusu gercege baglandi (o gune kadar token'lar cagri yerlerinde ELLE
 * yazilmis sabitlerdi, [[feedback-olcum-uydurma-yasak]]); bu blok o veriyi
 * panele tasir.
 */

/** Bir AI ozelliginin (pdf/excel/quote/translate) bu ayki kullanimi. */
export interface AiOzellikKullanimi {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Prompt onbellegi isabet orani (%): okunan / (okunan + tam fiyatli girdi). */
  cacheHitRate: number;
  estimatedCost: number;
}

export interface AiKullanimi {
  /** Olcum penceresi — ayin 1'inden simdiye. */
  period: { from: string; to: string };
  pdf: AiOzellikKullanimi;
  excel: AiOzellikKullanimi;
  quote: AiOzellikKullanimi;
  translate: AiOzellikKullanimi;
  total: AiOzellikKullanimi;
  /** Veri API'den basariyla geldi mi? false ise sifirlar GERCEK DEGIL. */
  live: boolean;
}

const BOS_OZELLIK: AiOzellikKullanimi = {
  totalCalls: 0, successCalls: 0, failedCalls: 0, totalTokens: 0,
  cacheReadTokens: 0, cacheWriteTokens: 0, cacheHitRate: 0, estimatedCost: 0,
};

const BOS_AI: AiKullanimi = {
  period: { from: '', to: '' },
  pdf: BOS_OZELLIK, excel: BOS_OZELLIK, quote: BOS_OZELLIK,
  translate: BOS_OZELLIK, total: BOS_OZELLIK,
  live: false,
};

/** Eksik alan gelirse sifir yazilir — panel cokmez, ama `live` ile ayirt edilir. */
function ozellikOku(ham: any): AiOzellikKullanimi {
  if (!ham || typeof ham !== 'object') return BOS_OZELLIK;
  const sayi = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    totalCalls: sayi(ham.totalCalls),
    successCalls: sayi(ham.successCalls),
    failedCalls: sayi(ham.failedCalls),
    totalTokens: sayi(ham.totalTokens),
    cacheReadTokens: sayi(ham.cacheReadTokens),
    cacheWriteTokens: sayi(ham.cacheWriteTokens),
    cacheHitRate: sayi(ham.cacheHitRate),
    estimatedCost: sayi(ham.estimatedCost),
  };
}

export async function fetchAiKullanimi(): Promise<AiKullanimi> {
  try {
    const { data } = await api.get<any>('/admin/ai-stats');
    return {
      period: { from: data?.period?.from ?? '', to: data?.period?.to ?? '' },
      pdf: ozellikOku(data?.pdf),
      excel: ozellikOku(data?.excel),
      quote: ozellikOku(data?.quote),
      translate: ozellikOku(data?.translate),
      total: ozellikOku(data?.total),
      live: true,
    };
  } catch {
    return BOS_AI;
  }
}

/** Sistem ayarlari (butce dahil). Hata durumunda BOS obje — panel cokmez. */
export async function fetchSistemAyarlari(): Promise<Record<string, string>> {
  try {
    const { data } = await api.get<Record<string, string>>('/admin/settings');
    return data ?? {};
  } catch {
    return {};
  }
}

export interface AiSaglik {
  status: 'active' | 'no_key' | 'no_credit' | 'error';
  message: string;
}

/**
 * Saglayiciya GERCEK bir istek atar (backend `checkAiHealth`).
 *
 * ⚠ Bu, anahtarin "kayitli olup olmadigini" degil GECERLI olup olmadigini
 * olcer. 13.08'de anahtar KAYITLIYDI ama Anthropic 401 donduruyordu; ceviri
 * her cagrida sessizce bos donuyordu. Kayitli olmak calisiyor demek degildir.
 */
export async function aiSaglikKontrol(provider = 'claude'): Promise<AiSaglik> {
  try {
    const { data } = await api.post<AiSaglik>('/admin/ai-health-check', { provider });
    return { status: data?.status ?? 'error', message: data?.message ?? '' };
  } catch (e: any) {
    return { status: 'error', message: e?.response?.data?.message || e?.message || 'Kontrol edilemedi' };
  }
}

/** Kismi ayar guncellemesi — `upsert` oldugu icin GONDERILMEYEN anahtara
 *  dokunulmaz (API anahtarlari guvende kalir). */
export async function kaydetSistemAyari(anahtar: string, deger: string): Promise<boolean> {
  try {
    await api.patch('/admin/settings', { [anahtar]: deger });
    return true;
  } catch {
    return false;
  }
}
