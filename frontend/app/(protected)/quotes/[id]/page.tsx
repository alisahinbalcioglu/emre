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
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import { SheetTabs } from '@/components/excel-grid/SheetTabs';
import type { ExcelGridData } from '@/components/excel-grid/types';

interface QuoteDetail {
  id: string;
  title: string;
  createdAt: string;
  user: { email: string };
  sheets?: any[];
  items: any[];
}

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  useEffect(() => {
    api.get<QuoteDetail>(`/quotes/${id}`)
      .then(({ data }) => {
        setQuote(data);
        // Ilk non-empty sheet'i aktif yap
        if (Array.isArray(data.sheets)) {
          const firstNonEmpty = data.sheets.findIndex((s: any) => !s.isEmpty);
          if (firstNonEmpty >= 0) setActiveSheetIndex(firstNonEmpty);
        }
      })
      .catch(() => setError('Teklif yuklenirken hata olustu.'))
      .finally(() => setIsLoading(false));
  }, [id]);

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

  // Aktif sheet icin ExcelGridData olustur
  const gridData: ExcelGridData | null = activeSheet
    ? {
        columnDefs: activeSheet.columnDefs ?? [],
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
        <div className="flex gap-2">
          {/* PRD Teklif Formatim: tek buton → Cikti Onizleme (kapak+icmal+
              liste; Excel+PDF oradan uretilir). Eski PDF/Excel endpoint'leri
              backend'de duruyor. */}
          <Button asChild>
            <Link href={`/quotes/${id}/export`}>
              <Download className="mr-2 h-4 w-4" />Teklifi Dışa Aktar
            </Link>
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
              currencySymbol="₺"
              conversionRate={1}
              onBrandChange={async () => null}
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
