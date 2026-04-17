'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Loader2, Wrench, Zap, Upload, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import { SheetTabs } from '@/components/excel-grid/SheetTabs';
import type { MultiSheetData, ExcelGridData, ExcelRowData } from '@/components/excel-grid/types';

interface LaborFirm {
  id: string;
  name: string;
  discipline: 'mechanical' | 'electrical';
}

interface PriceList {
  id: string;
  name: string;
  uploadedAt: string;
  _count: { prices: number };
}

export default function LaborFirmDetailPage() {
  const params = useParams<{ firmaId: string }>();
  const router = useRouter();
  const firmaId = params.firmaId;

  const [firma, setFirma] = useState<LaborFirm | null>(null);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Aktif liste icin ExcelGrid data
  const [gridData, setGridData] = useState<ExcelGridData | null>(null);
  const [liveRows, setLiveRows] = useState<ExcelRowData[]>([]);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [savingDrafts, setSavingDrafts] = useState(false);

  // Excel yukleme modal state (multi-sheet ilk kayit icin)
  const [editorOpen, setEditorOpen] = useState(false);
  const [multiSheet, setMultiSheet] = useState<MultiSheetData | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [liveRowDataBySheet, setLiveRowDataBySheet] = useState<Record<number, ExcelRowData[]>>({});
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFirma = useCallback(async () => {
    try {
      const { data } = await api.get<{ firma: LaborFirm; priceLists: PriceList[] }>(
        `/labor-firms/${firmaId}/price-lists`,
      );
      setFirma(data.firma);
      setPriceLists(data.priceLists);
      if (data.priceLists.length > 0 && !activeListId) {
        setActiveListId(data.priceLists[0].id);
      }
      if (data.priceLists.length === 0) {
        setActiveListId(null);
        setGridData(null);
      }
    } catch {
      toast({ title: 'Yuklenemedi', variant: 'destructive' });
      router.push('/labor-firms');
    } finally {
      setLoading(false);
    }
  }, [firmaId, activeListId, router]);

  useEffect(() => {
    fetchFirma();
  }, [fetchFirma]);

  const fetchSheets = useCallback(async (listId: string) => {
    try {
      const { data } = await api.get(`/labor-firms/price-lists/${listId}/sheets`);
      if (!data?.sheet) {
        setGridData(null);
        return;
      }
      const sheet = data.sheet;
      setGridData({
        columnDefs: sheet.columnDefs,
        rowData: sheet.rowData,
        columnRoles: sheet.columnRoles,
        brands: [],
        headerEndRow: sheet.headerEndRow ?? 0,
      });
      setLiveRows(sheet.rowData);
      setDirtyCount(0);
    } catch (e: any) {
      toast({ title: 'Sheet yuklenemedi', description: e?.response?.data?.message, variant: 'destructive' });
      setGridData(null);
    }
  }, []);

  useEffect(() => {
    if (activeListId) fetchSheets(activeListId);
  }, [activeListId, fetchSheets]);

  function handleRowsChange(rows: ExcelRowData[]) {
    // Yeni array referansi olustur (React state update tetiklemek icin)
    const fresh = [...rows];
    setLiveRows(fresh);
    const dirty = fresh.filter((r: any) => r._isDataRow && r._dirty).length;
    setDirtyCount(dirty);
    console.log(`[labor-firms detay] handleRowsChange: ${rows.length} satir, ${dirty} dirty`);
  }

  async function handleSaveDrafts() {
    if (!activeListId || !gridData) return;
    const dirtyRows = liveRows.filter((r: any) => r._isDataRow && r._dirty);
    if (dirtyRows.length === 0) {
      toast({ title: 'Degisiklik yok' });
      return;
    }

    setSavingDrafts(true);
    try {
      const priceField = gridData.columnRoles.laborUnitPriceField;
      // ONEMLI: laborItemName gondermiyoruz cunku row'daki nameField sadece
      // cap degeri (ornek "1 1/4\""). Gercek LaborItem.name grup basligi + cap
      // birlestirilmis tam ad ("SIYAH CELIK BORULAR 1 1/4""). Gondersek backend
      // name'i kisa versiyonla overwrite eder, tag'ler bozulur, matching fail.
      const payload = dirtyRows.map((r: any) => ({
        laborPriceId: r._laborPriceId,
        listPrice: priceField ? parseFloat(String(r[priceField] ?? '')) || 0 : undefined,
        discountRate: r._draftDiscount ?? r._laborDiscountRate ?? 0,
      })).filter((p) => !!p.laborPriceId);

      const { data } = await api.post(`/labor-firms/price-lists/${activeListId}/save-sheets`, {
        dirtyRows: payload,
      });
      toast({ title: 'Kaydedildi', description: `${data.updated} kalem guncellendi` });
      if (data.errors && data.errors.length > 0) {
        toast({ title: 'Uyari', description: `${data.errors.length} hata`, variant: 'destructive' });
      }
      await fetchSheets(activeListId);
    } catch (e: any) {
      toast({ title: 'Kaydetme hatasi', description: e?.response?.data?.message, variant: 'destructive' });
    } finally {
      setSavingDrafts(false);
    }
  }

  async function deletePriceList(listId: string) {
    if (!confirm('Bu fiyat listesi silinsin mi?')) return;
    try {
      await api.delete(`/labor-firms/price-lists/${listId}`);
      setPriceLists((prev) => prev.filter((pl) => pl.id !== listId));
      if (activeListId === listId) {
        setActiveListId(null);
        setGridData(null);
      }
      toast({ title: 'Silindi' });
    } catch {
      toast({ title: 'Hata', variant: 'destructive' });
    }
  }

  // ── Excel upload (multi-sheet ilk kayit akisi — degismedi) ──

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<MultiSheetData>(
        `/labor-firms/${firmaId}/parse-full-excel`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      if (!data?.sheets || data.sheets.length === 0) {
        toast({ title: 'Excel bos', variant: 'destructive' });
        return;
      }
      const nonEmpty = data.sheets.filter((s) => !s.isEmpty);
      if (nonEmpty.length === 0) {
        toast({ title: 'Hic dolu sheet bulunamadi', variant: 'destructive' });
        return;
      }
      setMultiSheet(data);
      setUploadedFileName(file.name);
      const firstNonEmpty = data.sheets.findIndex((s) => !s.isEmpty);
      setActiveSheetIndex(firstNonEmpty >= 0 ? firstNonEmpty : 0);
      const initialLive: Record<number, ExcelRowData[]> = {};
      data.sheets.forEach((s) => { initialLive[s.index] = s.rowData; });
      setLiveRowDataBySheet(initialLive);
      setEditorOpen(true);
    } catch (e: any) {
      toast({ title: 'Parse hatasi', description: e?.response?.data?.message ?? 'Bilinmeyen', variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  }

  async function handleSaveFromSheets() {
    if (!multiSheet) return;
    setSaving(true);
    try {
      const sheetsToSend = multiSheet.sheets.map((s) => ({
        name: s.name,
        index: s.index,
        isEmpty: s.isEmpty,
        rowData: liveRowDataBySheet[s.index] ?? s.rowData,
        columnRoles: s.columnRoles,
        columnDefs: s.columnDefs,
        headerEndRow: s.headerEndRow,
      }));
      const { data } = await api.post(`/labor-firms/${firmaId}/save-from-sheets`, {
        sheets: sheetsToSend,
      });
      toast({
        title: 'Kaydedildi',
        description: `${data.totalListsCreated} liste, ${data.totalImported} kalem`,
      });
      if (data.warnings && data.warnings.length > 0) {
        data.warnings.forEach((w: string) => toast({ title: 'Uyari', description: w }));
      }
      setEditorOpen(false);
      setMultiSheet(null);
      setLiveRowDataBySheet({});
      await fetchFirma();
    } catch (e: any) {
      toast({ title: 'Kaydetme hatasi', description: e?.response?.data?.message ?? 'Bilinmeyen', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function closeEditor() {
    if (!confirm('Kaydedilmemis degisiklikler kaybolacak. Emin misiniz?')) return;
    setEditorOpen(false);
    setMultiSheet(null);
    setLiveRowDataBySheet({});
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

  if (!firma) return null;

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/labor-firms?discipline=${firma.discipline}`}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />Firmalar
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {firma.discipline === 'mechanical' ? (
              <Wrench className="h-5 w-5 text-blue-600" />
            ) : (
              <Zap className="h-5 w-5 text-amber-600" />
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{firma.name}</h1>
              <p className="text-sm text-muted-foreground">
                {firma.discipline === 'mechanical' ? 'Mekanik' : 'Elektrik'} iscilik firmasi
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {dirtyCount > 0 && (
              <Button size="sm" onClick={handleSaveDrafts} disabled={savingDrafts}>
                {savingDrafts ? (
                  <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Kaydediliyor...</>
                ) : (
                  <><Save className="mr-1 h-4 w-4" />Degisiklikleri Kaydet ({dirtyCount})</>
                )}
              </Button>
            )}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
              {parsing ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Yukleniyor...</>
              ) : (
                <><Upload className="mr-1 h-4 w-4" />Excel Yukle</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Fiyat listeleri tab bar */}
      {priceLists.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1">
          {priceLists.map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => setActiveListId(pl.id)}
              className={[
                'px-3 py-1.5 text-xs rounded-md border transition-colors',
                activeListId === pl.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white border-gray-200 hover:bg-gray-50',
              ].join(' ')}
            >
              {pl.name} <span className="opacity-70">({pl._count.prices})</span>
            </button>
          ))}
          {activeListId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive"
              onClick={() => deletePriceList(activeListId)}
            >
              <Trash2 className="mr-1 h-3 w-3" />Listeyi Sil
            </Button>
          )}
        </div>
      )}

      {/* Aktif liste — ExcelGrid library mode */}
      {activeListId && gridData ? (
        <Card className="overflow-hidden">
          <ExcelGrid
            key={activeListId}
            data={gridData}
            brands={[]}
            currencySymbol="₺"
            conversionRate={1}
            mode="library"
            libraryPriceField="laborUnitPriceField"
            onBrandChange={async () => null}
            onRowDataChange={handleRowsChange}
          />
        </Card>
      ) : priceLists.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-sm text-muted-foreground">
            Henuz fiyat listesi yok. Yukaridan Excel dosyasi yukleyin.
          </div>
        </Card>
      ) : null}

      {/* Multi-sheet ilk yukleme modal */}
      {editorOpen && multiSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2">
          <div className="w-full h-full max-w-[98vw] max-h-[98vh] rounded-lg bg-background shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b p-3">
              <div>
                <h2 className="text-base font-bold">{uploadedFileName}</h2>
                <p className="text-xs text-muted-foreground">
                  {multiSheet.sheets.filter((s) => !s.isEmpty).length} sayfa · Her sayfa ayri bir fiyat listesi olur
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={closeEditor} disabled={saving}>
                  <X className="mr-1 h-3.5 w-3.5" />Iptal
                </Button>
                <Button size="sm" onClick={handleSaveFromSheets} disabled={saving}>
                  {saving ? (
                    <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Kaydediliyor...</>
                  ) : (
                    <><Save className="mr-1 h-3.5 w-3.5" />Tum Sayfalari Kaydet</>
                  )}
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-auto">
                <ExcelGrid
                  key={`sheet-${activeSheetIndex}`}
                  data={(() => {
                    const active = multiSheet.sheets[activeSheetIndex] ?? multiSheet.sheets.find((s) => !s.isEmpty);
                    if (!active || !Array.isArray(active.columnDefs) || active.columnDefs.length === 0) {
                      return {
                        columnDefs: [],
                        rowData: [],
                        columnRoles: {},
                        brands: [],
                        headerEndRow: 0,
                      };
                    }
                    return {
                      columnDefs: active.columnDefs,
                      rowData: liveRowDataBySheet[active.index] ?? active.rowData ?? [],
                      columnRoles: active.columnRoles ?? {},
                      brands: [],
                      headerEndRow: active.headerEndRow ?? 0,
                    };
                  })()}
                  brands={[]}
                  currencySymbol="₺"
                  conversionRate={1}
                  onBrandChange={async () => null}
                  onRowDataChange={(rows) => {
                    const active = multiSheet.sheets[activeSheetIndex];
                    if (active) {
                      setLiveRowDataBySheet((prev) => ({ ...prev, [active.index]: rows }));
                    }
                  }}
                />
              </div>
              <SheetTabs
                sheets={multiSheet.sheets.map((s) => ({
                  name: s.name,
                  index: s.index,
                  isEmpty: s.isEmpty,
                }))}
                activeIndex={activeSheetIndex}
                onChange={setActiveSheetIndex}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
