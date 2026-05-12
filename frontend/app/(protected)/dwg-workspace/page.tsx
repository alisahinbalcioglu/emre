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

      <DwgUploader onMetrajApproved={handleMetrajApproved} />
    </div>
  );
}
