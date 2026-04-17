'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import type { ExcelGridData, ExcelRowData } from '@/components/excel-grid/types';

interface BrandLibraryResponse {
  id: string;
  userId: string;
  brandId: string;
  sheets: { sheets: Array<any> };
}

export default function LibraryBrandDetailPage() {
  const params = useParams<{ brandId: string }>();
  const router = useRouter();
  const brandId = params.brandId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gridData, setGridData] = useState<ExcelGridData | null>(null);
  const [brandName, setBrandName] = useState('');
  const [liveRows, setLiveRows] = useState<ExcelRowData[]>([]);
  const [dirtyCount, setDirtyCount] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<BrandLibraryResponse>(`/library/brand/${brandId}/sheets`);
      const firstSheet = data.sheets?.sheets?.[0];
      if (!firstSheet) {
        toast({ title: 'Veri yok', variant: 'destructive' });
        router.push('/library');
        return;
      }
      // Brand adi icin ayri cagri
      try {
        const { data: brand } = await api.get<{ name: string }>(`/brands/${brandId}`);
        setBrandName(brand.name);
      } catch {}

      setGridData({
        columnDefs: firstSheet.columnDefs,
        rowData: firstSheet.rowData,
        columnRoles: firstSheet.columnRoles,
        brands: [],
        headerEndRow: firstSheet.headerEndRow ?? 0,
      });
      setLiveRows(firstSheet.rowData);
      setDirtyCount(0);
    } catch (e: any) {
      toast({ title: 'Yuklenemedi', description: e?.response?.data?.message, variant: 'destructive' });
      router.push('/library');
    } finally {
      setLoading(false);
    }
  }, [brandId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleRowsChange(rows: ExcelRowData[]) {
    const fresh = [...rows];
    setLiveRows(fresh);
    const dirty = fresh.filter((r: any) => r._isDataRow && r._dirty).length;
    setDirtyCount(dirty);
    console.log(`[library/brand] handleRowsChange: ${rows.length} satir, ${dirty} dirty`);
  }

  async function handleSave() {
    const dirtyRows = liveRows.filter((r: any) => r._isDataRow && r._dirty);
    if (dirtyRows.length === 0) {
      toast({ title: 'Degisiklik yok' });
      return;
    }

    setSaving(true);
    try {
      // ONEMLI: materialName gondermiyoruz — row'daki nameField sadece cap degeri
      // olabilir, gercek Material.name grup basligi + cap birlestirilmis tam ad.
      // Gondersek Material.name kisa versiyonla overwrite edilir, matching fail.
      const payload = dirtyRows.map((r: any) => {
        const priceField = gridData?.columnRoles.materialUnitPriceField;
        return {
          libraryItemId: r._libraryItemId,
          listPrice: priceField ? parseFloat(String(r[priceField] ?? '')) || 0 : undefined,
          discountRate: r._draftDiscount ?? r._libraryDiscountRate ?? 0,
        };
      });
      const { data } = await api.post(`/library/brand/${brandId}/save-sheets`, { dirtyRows: payload });
      toast({ title: 'Kaydedildi', description: `${data.updated} kalem guncellendi` });
      if (data.errors && data.errors.length > 0) {
        toast({ title: 'Uyari', description: `${data.errors.length} hata`, variant: 'destructive' });
      }
      await fetchData();
    } catch (e: any) {
      toast({ title: 'Kaydetme hatasi', description: e?.response?.data?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveBrand() {
    if (!confirm(`"${brandName}" kutuphanenizden tamamen kaldirilsin mi?`)) return;
    try {
      await api.delete(`/library/brand/${brandId}`);
      toast({ title: 'Silindi' });
      router.push('/library/mechanical-brands');
    } catch {
      toast({ title: 'Hata', variant: 'destructive' });
    }
  }

  // beforeunload
  useEffect(() => {
    if (dirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!gridData) return null;

  return (
    <div>
      <Link
        href="/library/mechanical-brands"
        className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />Geri
      </Link>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{brandName || 'Marka'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {liveRows.filter((r: any) => r._isDataRow).length} malzeme
          </p>
        </div>
        <div className="flex gap-2">
          {dirtyCount > 0 && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Kaydediliyor...</>
              ) : (
                <><Save className="mr-1 h-4 w-4" />Degisiklikleri Kaydet ({dirtyCount})</>
              )}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleRemoveBrand}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />Markayi Kaldir
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <ExcelGrid
          data={gridData}
          brands={[]}
          currencySymbol="₺"
          conversionRate={1}
          mode="library"
          libraryPriceField="materialUnitPriceField"
          onBrandChange={async () => null}
          onRowDataChange={handleRowsChange}
        />
      </Card>
    </div>
  );
}
