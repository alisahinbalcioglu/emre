'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Database, Tag, Users, Sparkles, Plus,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { useCapabilities } from '@/contexts/CapabilitiesContext';
import QuickStart from '@/components/dashboard/QuickStart';
import RecentQuotes from '@/components/dashboard/RecentQuotes';
import QuickAccess from '@/components/dashboard/QuickAccess';
import Link from 'next/link';

interface DashStats {
  userCount: number;
  brandCount: number;
  materialCount: number;
  quoteCount: number;
}

interface UploadResponse {
  headers: string[];
  rows: Record<string, any>[];
  brands: { id: string; name: string }[];
  columnRoles?: Record<string, string>;
  usedProvider?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashStats | null>(null);
  const [userName, setUserName] = useState('');
  useCapabilities();

  // Upload state
  const [excelUploading, setExcelUploading] = useState(false);
  const [dwgUploading, setDwgUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!excelUploading && !dwgUploading) { setElapsed(0); return; }
    const interval = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [excelUploading, dwgUploading]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUserName(parsed.email?.split('@')[0] ?? '');
      }
    } catch {}
    api.get<DashStats>('/admin/stats').then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  /* ── Excel Upload Handler ── */
  const handleExcelFile = useCallback(async (file: File) => {
    setExcelUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const gridFormData = new FormData();
      gridFormData.append('file', file);

      const [analyzeRes, gridRes] = await Promise.all([
        api.post<UploadResponse>('/excel-engine/analyze', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
        api.post<any>('/excel-grid/prepare', gridFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
      ]);

      const data = analyzeRes.data;

      // Original file binary → base64
      let fileBase64: string | undefined;
      try {
        const reader = new FileReader();
        fileBase64 = await new Promise<string>((resolve) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] ?? result);
          };
          reader.readAsDataURL(file);
        });
      } catch {}

      sessionStorage.setItem('metaprice_upload_result', JSON.stringify({
        headers: data.headers,
        rows: data.rows,
        brands: data.brands,
        columnRoles: data.columnRoles,
        usedProvider: data.usedProvider,
        fileName: file.name,
        multiSheetData: gridRes.data,
        originalFileBase64: fileBase64,
      }));

      toast({ title: 'Analiz tamamlandi', description: `${data.rows?.length ?? 0} satir bulundu.` });
      router.push('/quotes/new?from=dashboard');
    } catch (e: any) {
      toast({
        title: 'Hata',
        description: e?.response?.data?.message ?? 'Excel dosyasi analiz edilirken hata olustu.',
        variant: 'destructive',
      });
    } finally {
      setExcelUploading(false);
    }
  }, [router]);

  /* ── DWG/DXF Upload Handler — quotes/new sayfasina yonlendir (layer secim akisi) ── */
  const handleDwgFile = useCallback(async (file: File, scale: number = 0.001) => {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (['dwg', 'dxf'].includes(ext ?? '')) {
      // Eski cache temizle
      sessionStorage.removeItem('metaprice_upload_result');
      sessionStorage.removeItem('metaprice_quote_draft');
      sessionStorage.removeItem('metaprice_dwg_metraj');

      // Dosyayi global degiskende sakla (File objesi sessionStorage'da saklanamaz)
      (window as any).__metaprice_dwg_file = file;
      (window as any).__metaprice_dwg_scale = scale;

      // quotes/new'e yonlendir — DwgUploader dosyayi otomatik alacak
      router.push('/quotes/new?mode=dwg');
      return;
    }

    // PDF — eski akis
    setDwgUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<UploadResponse>('/ai/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      sessionStorage.setItem('metaprice_upload_result', JSON.stringify({
        headers: data.headers, rows: data.rows, brands: data.brands,
        columnRoles: data.columnRoles, usedProvider: data.usedProvider, fileName: file.name,
      }));
      toast({ title: 'Analiz tamamlandi', description: `${data.rows?.length ?? 0} satir bulundu.` });
      router.push('/quotes/new?from=dashboard');
    } catch {
      toast({ title: 'Hata', description: 'Dosya analiz edilirken hata olustu.', variant: 'destructive' });
    } finally {
      setDwgUploading(false);
    }
  }, [router]);

  const STAT_ITEMS = [
    { label: 'Teklifler', value: stats?.quoteCount ?? 0, icon: FileText, bg: 'bg-violet-50', color: 'text-violet-600' },
    { label: 'Malzemeler', value: stats?.materialCount ?? 0, icon: Database, bg: 'bg-blue-50', color: 'text-blue-600' },
    { label: 'Markalar', value: stats?.brandCount ?? 0, icon: Tag, bg: 'bg-emerald-50', color: 'text-emerald-600' },
    { label: 'Kullanicilar', value: stats?.userCount ?? 0, icon: Users, bg: 'bg-amber-50', color: 'text-amber-600' },
  ];

  return (
    <div>
      {/* Welcome Banner */}
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Hosgeldiniz{userName ? `, ${userName}` : ''}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">MetaPrice kontrol merkeziniz</p>
        </div>
        <Link
          href="/quotes/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Yeni Teklif
        </Link>
      </div>

      {/* Stat Cards */}
      {stats && (
        <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STAT_ITEMS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-start gap-3.5 rounded-xl border bg-card px-5 py-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.bg}`}>
                  <Icon className={`h-[18px] w-[18px] ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">{s.value.toLocaleString('tr-TR')}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Two-Column: Quick Start + Recent Quotes */}
      <div className="mb-7 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <QuickStart
            onExcelFile={handleExcelFile}
            onDwgFile={handleDwgFile}
            excelUploading={excelUploading}
            dwgUploading={dwgUploading}
            elapsed={elapsed}
          />
        </div>
        <div className="lg:col-span-2">
          <RecentQuotes />
        </div>
      </div>

      {/* Quick Access */}
      <QuickAccess />

      {/* Tester Toggle (hidden) */}
      <div className="mt-16 flex justify-center">
        <button
          type="button"
          className="text-[10px] text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors"
          onDoubleClick={() => {
            const tiers = ['core', 'pro', 'suite'];
            try {
              const stored = localStorage.getItem('user');
              if (stored) {
                const parsed = JSON.parse(stored);
                const idx = tiers.indexOf(parsed.tier ?? 'core');
                parsed.tier = tiers[(idx + 1) % tiers.length];
                localStorage.setItem('user', JSON.stringify(parsed));
                window.location.reload();
              }
            } catch {}
          }}
        >
          · · ·
        </button>
      </div>
    </div>
  );
}
