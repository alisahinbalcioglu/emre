'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Database, Tag, Users, Sparkles,
} from 'lucide-react';
import api from '@/ortak/lib/api';
import { toast } from '@/ortak/hooks/use-toast';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import QuickStart from '@/ortak/kabuk/components/dashboard/QuickStart';
import RecentQuotes from '@/ozellik/teklif/dashboard/RecentQuotes';
import QuickAccess from '@/ortak/kabuk/components/dashboard/QuickAccess';

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
        // KH3 (SORUN 14): /admin/stats yalniz ADMIN oturumunda cagrilir —
        // normal kullanicida 403 + console kirliligi olusuyordu (veri zaten
        // gosterilemiyordu).
        if (parsed.role === 'admin') {
          api.get<DashStats>('/admin/stats').then(({ data }) => setStats(data)).catch(() => {});
        }
      }
    } catch {}
  }, []);

  /* ── Excel Upload Handler ── */
  const handleExcelFile = useCallback(async (file: File) => {
    setExcelUploading(true);
    try {
      // P2-4: TEK PARSE. Eskiden ayni dosya `/excel-engine/analyze` ve
      // `/excel-grid/prepare` uclarina BIRDEN gonderiliyordu (sunucuda iki kez
      // XLSX.read + bir Gemini gidis-donusu). Iki gerekce ile tek uca indi:
      //  1. analyze ciktisinin (headers/rows/columnRoles) tek tuketicisi
      //     `quotes/new` icindeki `uploadMode === 'pdf'` daliydi; o dalin tek
      //     setter'i (`handleModeSwitch`) HICBIR YERDEN cagrilmiyor → olu.
      //  2. `Promise.all` oldugu icin Gemini/ag hatasi, grid dosyayi basariyla
      //     ayristirmis olsa bile TUM yuklemeyi catch'e dusuruyordu; kullanici
      //     "analiz hatasi" gorup teklife hic giremiyordu. Tek-nokta-arizasi.
      // Ayni akisin sayfa-ici muadili (`quotes/new` Excel yukleme) zaten TEK
      // uca gidiyor — bu ucun gereksizliginin calisan kaniti.
      const gridFormData = new FormData();
      gridFormData.append('file', file);

      const gridRes = await api.post<any>('/excel-grid/prepare', gridFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

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

      // `headers`/`rows`/`columnRoles`/`usedProvider` ARTIK YAZILMIYOR (P2-4):
      // hepsi analyze ciktisiydi ve tuketicileri ulasilamaz `pdf` dalindaydi.
      // Okuyan taraf (`quotes/new:317-330`) `?? []` / `?? {}` korumali.
      // `brands` de yaziliydi ama tuketilmiyordu — `quotes/new:328` "kutuphanem
      // izolasyonu" geregi dropdown'i mount'taki /library/brands besliyor.
      sessionStorage.setItem('metaprice_upload_result', JSON.stringify({
        fileName: file.name,
        multiSheetData: gridRes.data,
        originalFileBase64: fileBase64,
      }));

      const sayfaSayisi = (gridRes.data?.sheets ?? []).filter((s: any) => !s.isEmpty).length;
      toast({ title: 'Analiz tamamlandi', description: `${sayfaSayisi} sayfa yuklendi.` });
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
  // scale OPSIYONEL — verilmezse birim backend'de OTOMATIK tespit edilir.
  // ⚠ Eski imza `scale: number = 0` idi: birim modali kalkinca 0 asagida
  // `override` olarak tasiniyor ve `??` zinciri 0'i GECERLI sayiyordu ->
  // selectedUnit=0, ham cizgi hover'i 0.00 m (PANOVA, 11.08). Default YOK.
  const handleDwgFile = useCallback(async (file: File, scale?: number) => {
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
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-slate-900">
          Hoşgeldiniz{userName ? `, ${userName}` : ''}!
        </h1>
        <p className="mt-1 text-xs text-slate-500">MetaPriceX kontrol merkeziniz</p>
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
