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

/**
 * PANO OZETI — `GET /panel/ozet` (t.3, 21.09.2026).
 *
 * Eskiden `GET /admin/stats` okunuyordu ve iki kusur EKRANDA gorunuyordu:
 *  (a) uc `@Roles('admin')` korumaliydi → musteri oturumunda `stats` null
 *      kaliyor, dort kutu HIC cizilmiyordu;
 *  (b) admin oturumunda gelen sayilar SISTEMIN TAMAMININ sayilariydi
 *      (10 teklif / 21.723 malzeme), oysa hesabin kendi sayilari 4 / 1'di.
 * Yeni uc kullanici kapsamlidir ve her sayisi ilgili LISTE SAYFASIYLA ayni
 * sorgudan gelir (Teklifler, Kutuphanem, Ekip).
 */
interface PanoOzeti {
  teklifSayisi: number;
  malzemeSayisi: number;
  markaSayisi: number;
  kullaniciSayisi: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [ozet, setOzet] = useState<PanoOzeti | null>(null);
  const [userName, setUserName] = useState('');
  useCapabilities();

  // Upload state
  const [excelUploading, setExcelUploading] = useState(false);
  // K6 (27.08): DWG isleyicisi artik SENKRON yonlendiriyor (eski PDF kuyrugu
  // silindi), yani bu bayrak hic true olmuyor ve DWG spinner'i gorunmuyor —
  // dogru davranis: bekleyecek bir ag cagrisi kalmadi. QuickStart yine de
  // bayragi okuyor, cunku Excel tarafinda spinner ISLEVSEL.
  const [dwgUploading] = useState(false);
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
    // t.3 (21.09): ROLE BAKILMAZ. Eski kod `parsed.role === 'admin'` kapisinin
    // ARKASINDAYDI ve okudugu uc de yoneticiye kilitliydi; sonuc olarak dort
    // kutu musteri panosunda HIC cizilmiyordu. Yeni uc her oturumda cagrilir
    // ve yalnizca cagiranin kendi firmasinin sayilarini doner.
    // ⚠ `catch`in SESSIZ olmasi burada bilerek: istek duserse `ozet` null
    // kalir ve dort kutu sayi yerine "—" gosterir — yani ariza EKRANDA
    // GORUNUR, yutulmus olmaz. Toast atmak her yenilemede gurultu yaratirdi.
    api.get<PanoOzeti>('/panel/ozet').then(({ data }) => setOzet(data)).catch(() => {});
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
      toast({ title: 'Analiz tamamlandı', description: `${sayfaSayisi} sayfa yüklendi.` });
      router.push('/quotes/new?from=dashboard');
    } catch (e: any) {
      toast({
        title: 'Hata',
        description: e?.response?.data?.message ?? 'Excel dosyası analiz edilirken hata oluştu.',
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
    // K6 (27.08): tur denetimi ARTIK GIRISTE (QuickStart → dosyaTuruSec).
    // Buraya yalniz .dwg/.dxf ulasir; eski PDF kuyrugu (`/ai/analyze` →
    // sessionStorage → quotes/new legacy tablosu) ULASILAMAZ hale geldi ve
    // hedefi olan legacy tablo da bu turda silindi — kuyruk kaldirildi.
    // Eski cache temizle
    sessionStorage.removeItem('metaprice_upload_result');
    sessionStorage.removeItem('metaprice_quote_draft');
    sessionStorage.removeItem('metaprice_dwg_metraj');

    // Dosyayi global degiskende sakla (File objesi sessionStorage'da saklanamaz)
    (window as any).__metaprice_dwg_file = file;
    (window as any).__metaprice_dwg_scale = scale;

    // quotes/new'e yonlendir — DwgUploader dosyayi otomatik alacak
    router.push('/quotes/new?mode=dwg');
  }, [router]);

  // ⚠ `?? 0` YOK. Ozet gelmeden ya da istek basarisiz olursa sayi YERINE "—"
  // yazilir: "0 teklif" gercek bir olcum gibi okunur ve YALANDIR. Bu depoda
  // olculmus bir hata sinifi (`x || 0` sayi suzgeci degildir / olcumu uydurma).
  const STAT_ITEMS = [
    { label: 'Teklifler', value: ozet?.teklifSayisi, icon: FileText, bg: 'bg-violet-50', color: 'text-violet-600' },
    { label: 'Malzemeler', value: ozet?.malzemeSayisi, icon: Database, bg: 'bg-blue-50', color: 'text-blue-600' },
    { label: 'Markalar', value: ozet?.markaSayisi, icon: Tag, bg: 'bg-emerald-50', color: 'text-emerald-600' },
    { label: 'Kullanıcılar', value: ozet?.kullaniciSayisi, icon: Users, bg: 'bg-amber-50', color: 'text-amber-600' },
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

      {/* Stat Cards — KOSULSUZ cizilir (t.3). Eski `{stats && (...)}` kapisi,
          ucun yoneticiye kilitli olmasiyla birlesince kutulari musteri
          panosundan TAMAMEN kaldiriyordu. */}
      <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT_ITEMS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-start gap-3.5 rounded-xl border bg-card px-5 py-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.bg}`}>
                <Icon className={`h-[18px] w-[18px] ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {s.value === undefined ? '—' : s.value.toLocaleString('tr-TR')}
                </p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

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
