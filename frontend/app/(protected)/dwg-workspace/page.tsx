'use client';

/**
 * DWG Workspace — bagimsiz route.
 *
 * Neden ayri sayfa:
 * - Canvas2D viewer + DwgProjectWorkspace bundle'i ayri tutulur, ana app
 *   hizli initial paint yapar (lazy load).
 * - DWG analiz state machine'i karmasik (file_id, layer secimi, sprinkler,
 *   ekipman, hesaplama). Bagimsiz route saf state ile baslar — quotes/new
 *   icindeki Excel akisi ile karismiyor.
 * - URL bookmark: kullanici analiz oturumunu paylasabilir / kaydedebilir.
 *
 * Akis:
 *   1. Buraya direk gel (Dashboard'dan veya quotes/new "DWG analizi" butonu)
 *   2. DwgUploader → /layers → DwgProjectWorkspace
 *   3. "Tumunu Onayla" → metraj sessionStorage'a kaydedilir
 *   4. /quotes/new?from=dwg-workspace adresine yonlendirilir, fiyatlandirma akisi
 *      mevcut Excel akisi ile ayni kalir.
 */

import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { MetrajResult } from '@/components/dwg-metraj/types';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { dwgKapisi } from '@/ozellik/odeme/dwg-kapisi';

// Canvas2D viewer browser-only — ssr: false zorunlu (window/canvas referansi var).
// Loading state component'i mount sirasinda gosterilir.
const DwgUploader = dynamic(
  () => import('@/components/dwg-metraj/DwgUploader'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm">DWG analiz motoru yukleniyor...</p>
        </div>
      </div>
    ),
  },
);

export default function DwgWorkspacePage() {
  const router = useRouter();

  // ⚠ Core pakette bu sayfa ACILMAMALI. Dashboard kutusu sonuk ama bu rota
  // DOGRUDAN ADRESLE de gelinebilir (yer imi, eski baglanti, quotes/new
  // yonlendirmesi). Kapi burada yoksa kullanici yukleyiciyi gorur, dosya
  // secer ve ancak sunucu 403'unde ne oldugunu anlamaya calisir.
  const { loading: yeteneklerYukleniyor, hasAnyDwg } = useCapabilities();
  const dwgDurum = dwgKapisi({ loading: yeteneklerYukleniyor, dwgVar: hasAnyDwg() });

  function handleMetrajApproved(metraj: MetrajResult, fileName: string) {
    // sessionStorage uzerinden quotes/new'e tasi — fiyatlandirma akisi
    // burada degil, mevcut quote sayfasinda devam eder.
    try {
      sessionStorage.setItem(
        'metaprice_dwg_metraj',
        JSON.stringify({ metraj, fileName }),
      );
    } catch (e) {
      console.error('sessionStorage write failed:', e);
    }
    router.push('/quotes/new?from=dwg-workspace');
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-[1800px]">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/quotes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Geri
        </Link>
        <h1 className="text-2xl font-semibold">DWG Analiz</h1>
      </div>

      {dwgDurum === 'yukleniyor' ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : dwgDurum === 'sonuk' ? (
        <div className="rounded-xl border bg-card">
          <div className="px-6 py-16 text-center">
            <p className="mb-2 text-lg font-medium text-muted-foreground">
              DWG metraj icin Pro paket gerekli
            </p>
            <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
              Tesisat projesinden otomatik metraj cikarma Pro pakete dahildir.
              Mevcut paketinizde teklif olusturma ve Excel akisi acik kalir.
            </p>
            <Link
              href="/abonelik"
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Paketleri gor
            </Link>
          </div>
        </div>
      ) : (
        <DwgUploader onMetrajApproved={handleMetrajApproved} />
      )}
    </div>
  );
}
