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
  Sparkles, AlertTriangle, Check,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from 'recharts';
import { Button } from '@/ortak/ui/button';
import { Badge } from '@/ortak/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/ortak/ui/card';
import {
  fetchAdminStats, fetchAiKullanimi, fetchSistemAyarlari, kaydetSistemAyari,
  type AdminStats, type KpiMetric, type AiKullanimi, type AiOzellikKullanimi,
} from '@/ozellik/kutuphane/admin-stats';
import { butceOku, butceDurumu, AI_BUTCE_ANAHTARI } from '@/ozellik/kutuphane/ai-butce';

const PIE_COLORS = ['#3b82f6', '#f59e0b'];

/** USD gosterimi — kucuk tutarlarda 4 ondalik (tek cagri sent'in altinda olabilir). */
function usd(v: number): string {
  const mutlak = Math.abs(v);
  return `${v < 0 ? '-' : ''}$${mutlak >= 1 ? mutlak.toFixed(2) : mutlak.toFixed(4)}`;
}

/** Yalniz OZELLIK anahtarlari — `period`/`live`/`total` bu listeye giremez. */
type AiOzellikAnahtari = 'pdf' | 'excel' | 'quote' | 'translate';

const AI_OZELLIK_ADLARI: Array<{ anahtar: AiOzellikAnahtari; ad: string }> = [
  { anahtar: 'pdf', ad: 'PDF malzeme ayıklama' },
  { anahtar: 'excel', ad: 'Excel eşleştirme' },
  { anahtar: 'quote', ad: 'Teklif analizi' },
  { anahtar: 'translate', ad: 'Çeviri' },
];

function ChartEmpty({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-slate-400">
      {text}
    </div>
  );
}

function KpiCard({
  title, icon: Icon, metric, suffix = '',
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  metric: KpiMetric;
  suffix?: string;
}) {
  const up = (metric.trendPct ?? 0) >= 0;
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
        {/* trendPct null = hesaplanamiyor (orn. Brand'de createdAt yok) — rozet gizlenir */}
        {metric.trendPct !== null && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
              {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {up ? '+' : ''}{metric.trendPct}%
            </span>
            <span className="text-[10px] text-slate-400">önceki aya göre</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminStatsPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [ai, setAi] = useState<AiKullanimi | null>(null);
  // Butce bir AYAR METNIDIR; girdi kutusu ham metni tutar, sayiya cevrim
  // `butceOku` ile TEK yerden yapilir (testle muhurlu).
  const [butceGirdi, setButceGirdi] = useState('');
  // KAYITLI deger AYRI tutulur: butce durumu yalniz bundan hesaplanir. Yoksa
  // kullanici kutuya yazarken cubuk hemen oynar ve degeri KAYDETTIGINI sanir.
  const [butceKayitli, setButceKayitli] = useState('');
  const [butceKaydediliyor, setButceKaydediliyor] = useState(false);
  const [butceKaydedildi, setButceKaydedildi] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([fetchAdminStats(), fetchAiKullanimi(), fetchSistemAyarlari()])
      .then(([s, a, ayarlar]) => {
        setStats(s);
        setAi(a);
        setButceGirdi(ayarlar[AI_BUTCE_ANAHTARI] ?? '');
        setButceKayitli(ayarlar[AI_BUTCE_ANAHTARI] ?? '');
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const butceKaydet = async () => {
    setButceKaydediliyor(true);
    setButceKaydedildi(false);
    const deger = butceGirdi.trim();
    const ok = await kaydetSistemAyari(AI_BUTCE_ANAHTARI, deger);
    setButceKaydediliyor(false);
    setButceKaydedildi(ok);
    // Cubuk YALNIZ kayit basariliysa oynar — basarisiz PATCH'te ekran
    // kaydedilmis gibi gorunmez.
    if (ok) setButceKayitli(deger);
  };

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
            Platform kullanım özeti — gerçek veri
            {stats.live
              ? <Badge variant="success" className="ml-2">canlı</Badge>
              : <Badge variant="destructive" className="ml-2">veri alınamadı</Badge>}
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
          {stats.quoteTrend.length === 0 ? (
            <ChartEmpty text="Son 30 günde teklif verisi yok" />
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.quoteTrend} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="teklif" stroke="#3b82f6" strokeWidth={2} dot={false} name="Teklif" />
            </LineChart>
          </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Disiplin dagilimi (pie) ── */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Disiplin Dağılımı (Mekanik / Elektrik)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {stats.disciplineSplit.length === 0 ? (
              <ChartEmpty text="Henüz kütüphane verisi yok — kullanıcılar marka aktardıkça dolar" />
            ) : (
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
            )}
          </CardContent>
        </Card>

        {/* ── Top 5 marka aktarimi (yatay bar) ── */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Kütüphaneye En Çok Aktarılan Markalar (Top 5)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {stats.topBrands.length === 0 ? (
              <ChartEmpty text="Henüz kütüphaneye marka aktarılmamış" />
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.topBrands} layout="vertical" margin={{ top: 6, right: 24, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={72} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="aktarim" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={18} name="Aktarım" />
              </BarChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ══ AI KULLANIMI (13.08) ══════════════════════════════════════════
          `GET /admin/ai-stats` 12.08'den beri vardi ama HICBIR ekran onu
          okumuyordu. Gosterilen her sayi API'nin dondurdugu gercek olcumdur;
          olculemeyen cagri 0 yazar — 0 "bedava" degil "OLCULEMEDI" demektir. */}
      {ai && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-violet-600" />
                AI Kullanımı — bu ay
                {!ai.live && <Badge variant="destructive">veri alınamadı</Badge>}
              </CardTitle>
              {ai.live && ai.period.from && (
                <span className="text-[11px] text-slate-400">
                  {new Date(ai.period.from).toLocaleDateString('tr-TR')} →{' '}
                  {new Date(ai.period.to).toLocaleDateString('tr-TR')}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!ai.live ? (
              <p className="text-xs text-slate-400">
                İstatistik servisine ulaşılamadı — aşağıdaki sıfırlar ölçüm değildir.
              </p>
            ) : (
              <>
                {/* ── Ozet sayilar ── */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Toplam çağrı</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                      {ai.total.totalCalls.toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Başarısız çağrı</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${ai.total.failedCalls > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                      {ai.total.failedCalls.toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Toplam token</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                      {ai.total.totalTokens.toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Tahmini maliyet</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                      {usd(ai.total.estimatedCost)}
                    </p>
                  </div>
                </div>

                {/* ── Aylik butce ──
                    Saglayici hesap BAKIYESI normal mesaj ucundan OKUNAMAZ
                    (org-seviyesi Admin API + ayri anahtar gerekir). Bakiyeyi
                    tahmin etmek panelde uydurma bir sayi uretirdi; bu yuzden
                    olculebilen sey gosterilir: gercek harcama / adminin
                    girdigi butce. */}
                {(() => {
                  const durum = butceDurumu(ai.total.estimatedCost, butceOku(butceKayitli));
                  const kirli = butceGirdi.trim() !== butceKayitli.trim();
                  return (
                    <div className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-600">Aylık AI bütçesi</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-400">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={butceGirdi}
                            onChange={(e) => { setButceGirdi(e.target.value); setButceKaydedildi(false); }}
                            placeholder="örn. 50"
                            className="h-7 w-24 rounded-md border border-slate-200 px-2 text-xs tabular-nums outline-none focus:border-blue-400"
                          />
                          <Button size="sm" variant="outline" onClick={butceKaydet} disabled={butceKaydediliyor || !kirli}>
                            {butceKaydediliyor
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : butceKaydedildi
                                ? <Check className="h-3.5 w-3.5 text-emerald-600" />
                                : 'Kaydet'}
                          </Button>
                        </div>
                      </div>

                      {durum ? (
                        <div className="mt-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${durum.asildi ? 'bg-red-500' : durum.yuzde >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${durum.cubukYuzde}%` }}
                            />
                          </div>
                          <p className="mt-1.5 text-xs text-slate-600 tabular-nums">
                            {usd(durum.harcanan)} / {usd(durum.butce)} · %{durum.yuzde}
                            {durum.asildi
                              ? <span className="ml-1 font-semibold text-red-600">— bütçe aşıldı ({usd(durum.kalan)})</span>
                              : <span className="ml-1 text-slate-400">— kalan {usd(durum.kalan)}</span>}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-400">
                          Bütçe tanımlı değil — kutuya aylık limiti yazıp kaydedin.
                        </p>
                      )}

                      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-400">
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                        Sağlayıcı hesap bakiyesi API&apos;den okunamaz — bu oran, ölçülen
                        harcamanın buraya girdiğiniz bütçeye kıyasıdır.
                      </p>
                    </div>
                  );
                })()}

                {/* ── Ozellik kirilimi ──
                    Onbellek isabet orani DUSERSE sozluk prefix'i bozulmus
                    demektir (prompt onbellegi tek bayt degisimiyle gecersizlesir)
                    — cevirinin ekonomisi dogrudan buna bagli. */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-1.5 pr-2 font-medium">Özellik</th>
                        <th className="py-1.5 px-2 text-right font-medium">Çağrı</th>
                        <th className="py-1.5 px-2 text-right font-medium">Başarısız</th>
                        <th className="py-1.5 px-2 text-right font-medium">Token</th>
                        <th className="py-1.5 px-2 text-right font-medium">Önbellek isabeti</th>
                        <th className="py-1.5 pl-2 text-right font-medium">Maliyet</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {AI_OZELLIK_ADLARI.map(({ anahtar, ad }) => {
                        const v: AiOzellikKullanimi = ai[anahtar];
                        return (
                          <tr key={anahtar} className="border-b border-slate-100">
                            <td className="py-1.5 pr-2 text-slate-700">{ad}</td>
                            <td className="py-1.5 px-2 text-right">{v.totalCalls.toLocaleString('tr-TR')}</td>
                            <td className={`py-1.5 px-2 text-right ${v.failedCalls > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                              {v.failedCalls.toLocaleString('tr-TR')}
                            </td>
                            <td className="py-1.5 px-2 text-right">{v.totalTokens.toLocaleString('tr-TR')}</td>
                            {/* Cagri YOKSA "%0" yazmak "onbellek calismiyor" gibi
                                okunurdu — olcum yoksa tire gosterilir. */}
                            <td className="py-1.5 px-2 text-right">
                              {v.totalCalls === 0 ? <span className="text-slate-300">—</span> : `%${v.cacheHitRate}`}
                            </td>
                            <td className="py-1.5 pl-2 text-right">{usd(v.estimatedCost)}</td>
                          </tr>
                        );
                      })}
                      <tr className="font-semibold text-slate-900">
                        <td className="py-1.5 pr-2">Toplam</td>
                        <td className="py-1.5 px-2 text-right">{ai.total.totalCalls.toLocaleString('tr-TR')}</td>
                        <td className={`py-1.5 px-2 text-right ${ai.total.failedCalls > 0 ? 'text-red-600' : ''}`}>
                          {ai.total.failedCalls.toLocaleString('tr-TR')}
                        </td>
                        <td className="py-1.5 px-2 text-right">{ai.total.totalTokens.toLocaleString('tr-TR')}</td>
                        <td className="py-1.5 px-2 text-right">
                          {ai.total.totalCalls === 0 ? <span className="text-slate-300">—</span> : `%${ai.total.cacheHitRate}`}
                        </td>
                        <td className="py-1.5 pl-2 text-right">{usd(ai.total.estimatedCost)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {ai.total.totalCalls === 0 && (
                  <p className="text-xs text-slate-400">
                    Bu ay hiç AI çağrısı ölçülmedi.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
