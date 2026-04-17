'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
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

  /* ── PDF ── */
  async function handleDownloadPDF() {
    try {
      const response = await api.get(`/quotes/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `teklif-${id.slice(0, 8)}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Hata', description: 'PDF indirilemedi.', variant: 'destructive' });
    }
  }

  /* ── Excel Export — orijinal dosyadan fiyat hucreleri doldurularak indir ── */
  async function handleDownloadExcel() {
    if (!quote) return;
    try {
      const response = await api.get(`/quotes/${id}/excel`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      // Content-Disposition header'indan filename al, yoksa default
      const disposition = response.headers?.['content-disposition'];
      let filename = `teklif-${id.slice(0, 8)}.xlsx`;
      if (disposition) {
        const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match?.[1]) filename = decodeURIComponent(match[1].replace(/['"]/g, ''));
      }
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Hata', description: 'Excel indirilemedi. Orijinal dosya kayitli olmayabilir.', variant: 'destructive' });
    }
  }

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
          <Button variant="outline" onClick={handleDownloadPDF}>
            <Download className="mr-2 h-4 w-4" />PDF Indir
          </Button>
          <Button variant="outline" onClick={handleDownloadExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />Excel Indir
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
