'use client';

/**
 * Admin → İstatistikler — KPI kartlari + kullanim trendi + dagilim grafikleri.
 *
 * Grafik kutuphanesi: Recharts (Tailwind ile uyumlu, client-side).
 * Veri: lib/admin-stats servis katmani — KPI ana sayilari GERCEK
 * (GET /admin/stats), trend/chart serileri simdilik dummy (deterministik).
 */

import { useEffect, useState } from 'react';
import {
  BarChart3, Users, FileText, Package, Activity,
  TrendingUp, TrendingDown, Loader2, RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchAdminStats, type AdminStats, type KpiMetric } from '@/lib/admin-stats';

const PIE_COLORS = ['#3b82f6', '#f59e0b'];

function KpiCard({
  title, icon: Icon, metric, suffix = '',
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  metric: KpiMetric;
  suffix?: string;
}) {
  const up = metric.trendPct >= 0;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <Icon className="h-4 w-4 text-blue-600" />
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
          {metric.value.toLocaleString('tr-TR')}{suffix}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? '+' : ''}{metric.trendPct}%
          </span>
          <span className="text-[10px] text-slate-400">önceki aya göre{metric.isDummyTrend ? ' · örnek' : ''}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminStatsPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchAdminStats().then(setStats).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            İstatistikler
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Platform kullanım özeti
            {!stats.live && <Badge variant="warning" className="ml-2">örnek veri</Badge>}
            {stats.live && <Badge variant="success" className="ml-2">KPI canlı · grafikler örnek</Badge>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Yenile
        </Button>
      </div>

      {/* ── KPI kartlari ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard title="Toplam Kullanıcı" icon={Users} metric={stats.totalUsers} />
        <KpiCard title="Toplam Teklif" icon={FileText} metric={stats.totalQuotes} />
        <KpiCard title="Toplam Marka" icon={Package} metric={stats.totalBrands} />
        <KpiCard title="Bu Ay Aktif Kullanıcı" icon={Activity} metric={stats.activeUserRate} suffix="%" />
      </div>

      {/* ── Kullanim trendi (30 gun) ── */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">Son 30 Gün — Yeni Teklifler</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.quoteTrend} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="teklif" stroke="#3b82f6" strokeWidth={2} dot={false} name="Teklif" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Disiplin dagilimi (pie) ── */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Disiplin Dağılımı (Mekanik / Elektrik)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.disciplineSplit}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  label={(p) => `${p.name} %${p.value}`}
                  labelLine={false}
                >
                  {stats.disciplineSplit.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Top 5 marka aktarimi (yatay bar) ── */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Kütüphaneye En Çok Aktarılan Markalar (Top 5)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.topBrands} layout="vertical" margin={{ top: 6, right: 24, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={72} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="aktarim" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={18} name="Aktarım" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
