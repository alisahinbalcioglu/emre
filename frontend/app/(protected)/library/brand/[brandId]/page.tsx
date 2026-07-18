'use client';

// Cloudflare Pages icin Edge Runtime (dynamic route)
export const runtime = 'edge';

import { useEffect, useState, useCallback } from 'react';
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

// Yapisal kolonlar — MEVCUT satirlarda salt-okunur (kaynak sadakati),
// YENI (bos) satirlarda editable (inline malzeme girisi).
const STRUCT_FIELDS = ['col_cins', 'col_baglanti', 'col_cap', 'col_boy', 'col_kod', 'col_not'];
const BLANK_ROW_COUNT = 30;

function strOrU(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  return s === '' ? undefined : s;
}
function numOrU(v: unknown): number | undefined {
  // Excel yapistirinca TR bicimi: "6.500,00" (nokta=binlik, virgul=ondalik)
  let s = String(v ?? '').replace(/[₺$€\s]/g, '').trim();
  if (s === '') return undefined;
  const hasComma = s.includes(','), hasDot = s.includes('.');
  if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (hasComma) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

/** Yapisal kolonlari YALNIZ yeni (kutuphane kaydi olmayan) satirlarda editable
 *  yap. Ad/Birim/Fiyat zaten her satirda editable (save-sheets kalici yazar). */
function withNewRowEditable(cols: any[]): any[] {
  return cols.map((c) =>
    STRUCT_FIELDS.includes(c.field)
      ? { ...c, editable: (p: any) => !!p.data && !p.data._libraryItemId }
      : c,
  );
}

function makeBlankLibRow(cols: any[], idx: number, spare = false): ExcelRowData {
  const row: any = { _rowIdx: idx, _isDataRow: true, _isHeaderRow: false, _currency: 'TRY', _groupKey: '' };
  if (spare) row._isSpareRow = true;
  for (const c of cols) if (!c.field.startsWith('_')) row[c.field] = '';
  return row;
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
  const [dirtyCount, setDirtyCount] = useState(0); // mevcut satir fiyat/iskonto degisikligi
  const [newCount, setNewCount] = useState(0);     // yeni girilen malzeme satiri

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
      try {
        const { data: brand } = await api.get<{ name: string }>(`/brands/${brandId}`);
        setBrandName(brand.name);
      } catch {}

      // TEK TIP kolonlar (backend hep tam set doner) + yeni-satir editable
      const cols = withNewRowEditable(firstSheet.columnDefs ?? []);
      const existing: ExcelRowData[] = firstSheet.rowData ?? [];

      // Inline giris: en alta 30 bos satir + 1 spare (autoAppendRow devami)
      const maxIdx = existing.reduce((m: number, r: any) => Math.max(m, r._rowIdx ?? 0), 0);
      const blanks: ExcelRowData[] = [];
      for (let i = 0; i < BLANK_ROW_COUNT; i++) blanks.push(makeBlankLibRow(cols, maxIdx + 1 + i));
      blanks.push(makeBlankLibRow(cols, maxIdx + 1 + BLANK_ROW_COUNT, true));
      const rowData = [...existing, ...blanks];

      setGridData({
        columnDefs: cols,
        rowData,
        columnRoles: firstSheet.columnRoles,
        brands: [],
        headerEndRow: firstSheet.headerEndRow ?? 0,
      });
      setLiveRows(rowData);
      setDirtyCount(0);
      setNewCount(0);
    } catch (e: any) {
      toast({ title: 'Yuklenemedi', description: e?.response?.data?.message, variant: 'destructive' });
      router.push('/library');
    } finally {
      setLoading(false);
    }
  }, [brandId, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const nameField = gridData?.columnRoles.nameField ?? 'col1';

  function handleRowsChange(rows: ExcelRowData[]) {
    const fresh = [...rows];
    setLiveRows(fresh);
    const dirty = fresh.filter((r: any) => r._isDataRow && r._libraryItemId && r._dirty).length;
    const yeni = fresh.filter(
      (r: any) => r._isDataRow && !r._libraryItemId && String(r[nameField] ?? '').trim() !== '',
    ).length;
    setDirtyCount(dirty);
    setNewCount(yeni);
  }

  async function handleSave() {
    if (!gridData) return;
    const priceField = gridData.columnRoles.materialUnitPriceField;
    const unitField = gridData.columnRoles.unitField;

    const dirtyExisting = liveRows.filter((r: any) => r._isDataRow && r._libraryItemId && r._dirty);
    const newRows = liveRows.filter(
      (r: any) => r._isDataRow && !r._libraryItemId && String(r[nameField] ?? '').trim() !== '',
    );
    if (dirtyExisting.length === 0 && newRows.length === 0) {
      toast({ title: 'Degisiklik yok' });
      return;
    }

    setSaving(true);
    try {
      let updated = 0;
      let added = 0;

      // 1) Mevcut satir fiyat/iskonto guncelle (save-sheets)
      if (dirtyExisting.length > 0) {
        const payload = dirtyExisting.map((r: any) => ({
          libraryItemId: r._libraryItemId,
          listPrice: priceField ? parseFloat(String(r[priceField] ?? '')) || 0 : undefined,
          discountRate: r._draftDiscount ?? r._libraryDiscountRate ?? 0,
        }));
        const { data } = await api.post(`/library/brand/${brandId}/save-sheets`, { dirtyRows: payload });
        updated = data.updated ?? 0;
      }

      // 2) Yeni malzemeler → mevcut markaya ekle (find-or-create)
      if (newRows.length > 0) {
        const rows = newRows.map((r: any) => ({
          ad: String(r[nameField]).trim(),
          cins: strOrU(r.col_cins),
          baglanti: strOrU(r.col_baglanti),
          cap: strOrU(r.col_cap),
          boy: strOrU(r.col_boy),
          urunKodu: strOrU(r.col_kod),
          not: strOrU(r.col_not),
          birim: strOrU(unitField ? r[unitField] : undefined),
          price: numOrU(priceField ? r[priceField] : undefined),
          discountRate: numOrU(r._draftDiscount),
        }));
        const { data } = await api.post('/library/manual-brand', { brandName, discipline: 'mechanical', rows });
        added = data.created ?? 0;
      }

      toast({ title: 'Kaydedildi', description: `${updated} guncellendi · ${added} yeni malzeme` });
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

  const pendingCount = dirtyCount + newCount;

  // beforeunload — kaydedilmemis degisiklik/yeni malzeme varken uyar
  useEffect(() => {
    if (pendingCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!gridData) return null;

  const malzemeSayisi = liveRows.filter((r: any) => r._isDataRow && r._libraryItemId).length;

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
            {malzemeSayisi} malzeme
            <span className="ml-2 text-xs text-muted-foreground/70">
              · Yeni malzeme için en alttaki boş satırları doldurun (Excel&apos;den yapıştırabilirsiniz)
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {pendingCount > 0 && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Kaydediliyor...</>
              ) : (
                <><Save className="mr-1 h-4 w-4" />Kaydet ({pendingCount})</>
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
          autoAppendRow
          enableStructureEdit
          onBrandChange={async () => null}
          onRowDataChange={handleRowsChange}
        />
      </Card>
    </div>
  );
}
