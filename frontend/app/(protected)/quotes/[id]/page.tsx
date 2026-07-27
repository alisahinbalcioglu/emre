'use client';

// Cloudflare Pages icin Edge Runtime (dynamic route)
export const runtime = 'edge';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { teklifCiktisiniIndir, fiyatliExceliIndir } from '@/lib/export-download';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import { SheetTabs } from '@/components/excel-grid/SheetTabs';
import type { ExcelGridData } from '@/components/excel-grid/types';
import { useCurrency } from '@/hooks/use-currency';
import { useCapabilities } from '@/contexts/CapabilitiesContext';
import type { Currency } from '@/types/quotes';

interface QuoteDetail {
  id: string;
  title: string;
  createdAt: string;
  user: { email: string };
  sheets?: any[];
  items: any[];
  displayCurrency?: string;
}

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [exporting, setExporting] = useState(false);

  // SORUN 16 (KH8/KH9): goruntuleme para birimi — teklifte KAYITLI birimle
  // acilir; toggle degisince kalici yazilir. Cevrim yalniz GORUNTULEME
  // (kutuphane fiyatlari orijinal biriminde kalir), canli TCMB kuru.
  const { currency, setCurrency, exchangeRates, ratesLoaded, conversionRate } = useCurrency();
  // KH10: Pro entitlement DUZENLE ekraniyla AYNI kaynaktan (/auth/me)
  const { capabilities } = useCapabilities();

  useEffect(() => {
    api.get<QuoteDetail>(`/quotes/${id}`)
      .then(({ data }) => {
        setQuote(data);
        if (data.displayCurrency === 'USD' || data.displayCurrency === 'EUR') {
          setCurrency(data.displayCurrency as Currency);
        }
        // Ilk non-empty sheet'i aktif yap
        if (Array.isArray(data.sheets)) {
          const firstNonEmpty = data.sheets.findIndex((s: any) => !s.isEmpty);
          if (firstNonEmpty >= 0) setActiveSheetIndex(firstNonEmpty);
        }
      })
      .catch(() => setError('Teklif yuklenirken hata olustu.'))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const birimSec = (c: Currency) => {
    setCurrency(c);
    // KH8: secim TEKLIFLE kaydedilir (kismi PATCH — kapak alanlarina dokunmaz)
    api.patch(`/quotes/${id}/info`, {
      displayCurrency: c,
      displayRate: c === 'TRY' ? null : exchangeRates.TRY,
      displayRateDate: new Date().toLocaleDateString('tr-TR'),
    }).catch(() => { /* goruntuleme yine calisir; kayit sessiz denenir */ });
  };

  /* ── Render ── */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div>
        <Link href="/quotes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Teklifler
        </Link>
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? 'Teklif bulunamadi.'}
        </div>
      </div>
    );
  }

  const sheets = Array.isArray(quote.sheets) ? quote.sheets.filter((s: any) => !s.isEmpty) : [];
  const activeSheet = sheets[activeSheetIndex] ?? sheets[0];

  // Kayitta saklanan gizli-sutun tercihi (PRD v3.0 Part A) detayda da uygulanir.
  const hiddenFields = new Set<string>(activeSheet?.columnConfig?.hidden ?? []);

  // Aktif sheet icin ExcelGridData olustur
  const gridData: ExcelGridData | null = activeSheet
    ? {
        columnDefs: (activeSheet.columnDefs ?? []).map((c: any) =>
          hiddenFields.has(c.field) ? { ...c, hide: true } : c,
        ),
        rowData: activeSheet.rowData ?? [],
        columnRoles: activeSheet.columnRoles ?? {},
        brands: [],
        headerEndRow: activeSheet.headerEndRow ?? 0,
      }
    : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/quotes" className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Teklifler
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{quote.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{new Date(quote.createdAt).toLocaleDateString('tr-TR')}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* KH9: TL/USD/EUR — Duzenle'dekiyle ayni bilesen deseni */}
          <div className="flex rounded-lg border bg-muted p-0.5">
            {(['TRY', 'USD', 'EUR'] as Currency[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => birimSec(c)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  currency === c
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                disabled={!ratesLoaded && c !== 'TRY'}
              >
                {c === 'TRY' ? 'TL' : c}
              </button>
            ))}
          </div>
          {currency !== 'TRY' && ratesLoaded && (
            <span className="text-xs text-muted-foreground">
              1 {currency} = ₺{(currency === 'USD' ? exchangeRates.TRY : exchangeRates.TRY / exchangeRates.EUR).toFixed(2)} · TCMB {new Date().toLocaleDateString('tr-TR')}
            </span>
          )}
          {/* KULLANICI KARARI (24.07): PDF kaldirildi, cikti IKIYE ayrildi —
              her tik TEK dosya indirir (Chrome coklu-indirme blogu tetiklenmez).
              1. Fiyatli Excel: musterinin kesif dosyasi, fiyatlar yazilmis.
              2. Teklif Formati: kapak/icmal'li tam cikti (rev artar). */}
          <Button
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try { await fiyatliExceliIndir(id); } finally { setExporting(false); }
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Fiyatlandırılmış Excel
          </Button>
          <Button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try { await teklifCiktisiniIndir(id); } finally { setExporting(false); }
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting ? 'Hazırlanıyor…' : 'Teklif Formatında Aktar'}
          </Button>
        </div>
      </div>

      {/* Multi-sheet ExcelGrid render (read-only) */}
      {sheets.length > 0 && gridData ? (
        <>
          <Card className="overflow-hidden">
            <ExcelGrid
              key={`detail-sheet-${activeSheetIndex}`}
              data={gridData}
              brands={[]}
              currencySymbol={currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₺'}
              conversionRate={conversionRate}
              onBrandChange={async () => null}
              sheetDiscipline={activeSheet?.discipline ?? null}
              laborEnabled={(() => {
                // KH10: PRO kullanicida "Pro Gerekli" HICBIR ekranda gorunmez —
                // entitlement Duzenle ile ayni kaynaktan (capabilities).
                const disc = activeSheet?.discipline;
                if (disc === 'electrical') return capabilities.electrical.labor;
                return capabilities.mechanical.labor;
              })()}
            />
          </Card>
          {sheets.length > 1 && (
            <SheetTabs
              sheets={sheets.map((s: any, i: number) => ({
                name: s.name ?? `Sayfa ${i + 1}`,
                index: i,
                isEmpty: false,
              }))}
              activeIndex={activeSheetIndex}
              onChange={setActiveSheetIndex}
            />
          )}
        </>
      ) : (
        <div className="rounded-md border border-muted p-8 text-center text-sm text-muted-foreground">
          Bu teklifte goruntulecek veri bulunamadi.
        </div>
      )}
    </div>
  );
}
