'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Package, Plus, Search, Upload, Loader2, X, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import type { ExcelGridData, ExcelRowData } from '@/components/excel-grid/types';

interface LibraryBrand {
  brandId: string;
  brandName: string;
  itemCount: number;
}

interface PoolBrand {
  id: string;
  name: string;
}

interface ExtractedItem {
  materialName: string;
  unit: string;
  unitPrice: number;
}

function getRole(): string | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('user') || '{}').role ?? null; } catch { return null; }
}

// ── "Marka Ekle" bos tablosu — foto 3 formatinin bos hali ──
// Sabit sema (ProductIndex 11 kolonuyla birebir). Kullanici uygulama icinde
// doldurur; en alta autoAppendRow ile hep bos satir eklenir. Kayitta bos
// (Malzeme Adi girilmemis) satirlar elenir.
const MANUAL_COLUMNS: ExcelGridData['columnDefs'] = [
  { field: 'col0', headerName: 'No', width: 56, editable: false },
  { field: 'ad', headerName: 'Malzeme Adı', width: 340, editable: true },
  { field: 'cins', headerName: 'Cinsi', width: 150, editable: true },
  { field: 'baglanti', headerName: 'Bağlantı Şekli', width: 130, editable: true },
  { field: 'cap', headerName: 'Çap', width: 90, editable: true },
  { field: 'boy', headerName: 'Boy (mm)', width: 90, editable: true },
  { field: 'urunKodu', headerName: 'Ürün Kodu', width: 120, editable: true },
  { field: 'not', headerName: 'Not', width: 180, editable: true },
  { field: 'birim', headerName: 'Birim', width: 90, editable: true },
  { field: 'fiyat', headerName: 'Liste Fiyat', width: 120, editable: true },
  // İskonto % + Net Fiyat kolonlarini ExcelGrid library modu OTOMATIK ekler
  // (_draftDiscount editable + Net = Liste × (1 − İskonto/100), canli hesap).
];
const MANUAL_ROLES = { noField: 'col0', nameField: 'ad', unitField: 'birim', materialUnitPriceField: 'fiyat' };

function buildBlankManualGrid(dataRows = 18): ExcelGridData {
  const blank = (idx: number, spare = false): ExcelRowData => {
    const row: any = { _rowIdx: idx, _isDataRow: true, _isHeaderRow: false };
    if (spare) row._isSpareRow = true;
    for (const c of MANUAL_COLUMNS) if (!c.field.startsWith('_')) row[c.field] = '';
    return row;
  };
  const rowData: ExcelRowData[] = [];
  for (let i = 0; i < dataRows; i++) rowData.push(blank(i));
  rowData.push(blank(dataRows, true)); // en altta hep-bos spare satir
  return { columnDefs: MANUAL_COLUMNS, rowData, columnRoles: MANUAL_ROLES, brands: [], headerEndRow: 0 };
}

function trimOrU(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  return s === '' ? undefined : s;
}
function numOrU(v: unknown): number | undefined {
  const s = String(v ?? '').trim().replace(',', '.');
  if (s === '') return undefined;
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

export default function MechanicalBrandsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<LibraryBrand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const isAdmin = getRole() === 'admin';

  // Pool brands for dropdowns
  const [poolBrands, setPoolBrands] = useState<PoolBrand[]>([]);

  // "Marka Ekle" — uygulama ici bos tablo state
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [manualGrid, setManualGrid] = useState<ExcelGridData | null>(null);
  const [manualRows, setManualRows] = useState<ExcelRowData[]>([]);

  // PDF Yukle dialog state
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBrandId, setPdfBrandId] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [pdfStep, setPdfStep] = useState<'upload' | 'preview'>('upload');
  const [saveLoading, setSaveLoading] = useState(false);

  const fetchBrands = useCallback(() => {
    setIsLoading(true);
    api.get('/library').then(({ data }) => {
      const map = new Map<string, LibraryBrand>();
      for (const item of data) {
        // Sadece MEKANIK markalari goster
        const disc = item.brand?.discipline;
        if (disc !== 'mechanical') continue;
        const bid = item.brandId ?? '_none';
        const bname = item.brand?.name ?? 'Markasiz';
        if (!map.has(bid)) map.set(bid, { brandId: bid, brandName: bname, itemCount: 0 });
        map.get(bid)!.itemCount++;
      }
      setBrands(Array.from(map.values()).sort((a, b) => a.brandName.localeCompare(b.brandName, 'tr')));
    }).catch(() => toast({ title: 'Hata', variant: 'destructive' })).finally(() => setIsLoading(false));
  }, []);

  const fetchPoolBrands = useCallback(() => {
    api.get<PoolBrand[]>('/brands?discipline=mechanical').then(({ data }) => setPoolBrands(data)).catch(() => {});
  }, []);

  useEffect(() => { fetchBrands(); fetchPoolBrands(); }, [fetchBrands, fetchPoolBrands]);

  const filteredBrands = brands.filter((b) =>
    b.brandName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function openManual() {
    const g = buildBlankManualGrid();
    setManualGrid(g);
    setManualRows(g.rowData);
    setNewBrandName('');
    setManualOpen(true);
  }

  function closeManual() {
    const dolu = manualRows.some((r: any) => r._isDataRow && !r._isSpareRow && String(r.ad ?? '').trim() !== '');
    if ((dolu || newBrandName.trim()) && !window.confirm('Girdiğiniz bilgiler kaybolacak. Kapatılsın mı?')) return;
    setManualOpen(false);
    setManualGrid(null);
    setManualRows([]);
    setNewBrandName('');
  }

  function resetPdfDialog() {
    setPdfFile(null);
    setPdfBrandId('');
    setExtractedItems([]);
    setPdfStep('upload');
  }

  async function handleSaveManualBrand() {
    const name = newBrandName.trim();
    if (!name) {
      toast({ title: 'Marka adı gerekli', description: 'Önce marka adını girin.', variant: 'destructive' });
      return;
    }
    const dataRows = manualRows.filter(
      (r: any) => r._isDataRow && !r._isSpareRow && String(r.ad ?? '').trim() !== '',
    );
    if (dataRows.length === 0) {
      toast({ title: 'Malzeme yok', description: 'En az bir satırda Malzeme Adı girin.', variant: 'destructive' });
      return;
    }
    const rows = dataRows.map((r: any) => ({
      ad: String(r.ad).trim(),
      cins: trimOrU(r.cins),
      baglanti: trimOrU(r.baglanti),
      cap: trimOrU(r.cap),
      boy: trimOrU(r.boy),
      urunKodu: trimOrU(r.urunKodu),
      not: trimOrU(r.not),
      birim: trimOrU(r.birim),
      price: numOrU(r.fiyat),
      // İskonto library modunda _draftDiscount alaninda tutulur
      discountRate: numOrU(r._draftDiscount),
    }));

    setManualSaving(true);
    try {
      const { data } = await api.post('/library/manual-brand', {
        brandName: name,
        discipline: 'mechanical',
        rows,
      });
      toast({
        title: 'Marka oluşturuldu',
        description: `"${data.brandName}" kütüphanenize eklendi · ${data.created} malzeme.`,
      });
      setManualOpen(false);
      setManualGrid(null);
      setManualRows([]);
      setNewBrandName('');
      router.push(`/library/brand/${data.brandId}`);
    } catch (e: any) {
      toast({ title: 'Hata', description: e?.response?.data?.message ?? 'Marka oluşturulamadı.', variant: 'destructive' });
    } finally {
      setManualSaving(false);
    }
  }

  async function handlePdfExtract() {
    if (!pdfFile || !pdfBrandId) return;
    if (pdfFile.size > 10 * 1024 * 1024) {
      toast({ title: 'Hata', description: 'Dosya boyutu 10MB\'dan buyuk olamaz.', variant: 'destructive' });
      return;
    }
    setPdfLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      const { data } = await api.post('/admin/materials/extract-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const items: ExtractedItem[] = (data.materials ?? data.items ?? data ?? []).map((m: Record<string, unknown>) => ({
        materialName: m.materialName ?? m.name ?? '',
        unit: m.unit ?? 'Adet',
        unitPrice: Number(m.unitPrice ?? m.price ?? 0),
      }));
      if (items.length === 0) {
        toast({ title: 'Uyari', description: 'PDF\'den malzeme ayiklanamadi.' });
        return;
      }
      setExtractedItems(items);
      setPdfStep('preview');
    } catch {
      toast({ title: 'Hata', description: 'PDF ayiklama basarisiz oldu.', variant: 'destructive' });
    } finally {
      setPdfLoading(false);
    }
  }

  async function handlePdfSaveConfirm() {
    if (extractedItems.length === 0 || !pdfBrandId) return;
    setSaveLoading(true);
    try {
      await api.post('/admin/materials/save-bulk', {
        brandId: pdfBrandId,
        priceListId: 'auto',
        items: extractedItems.map((it) => ({
          materialName: it.materialName,
          unit: it.unit,
          unitPrice: it.unitPrice,
        })),
      });
      // Auto-import to library
      const { data: brandData } = await api.get(`/brands/${pdfBrandId}/price-lists`);
      const lists = brandData.priceLists;
      if (lists && lists.length > 0) {
        const res = await api.post('/library/import-price-list', { brandId: pdfBrandId, priceListId: lists[0].id });
        toast({ title: 'Basarili', description: `${res.data.imported} malzeme kutuphanenize aktarildi.` });
      } else {
        toast({ title: 'Kaydedildi', description: 'Malzemeler havuza eklendi.' });
      }
      setPdfOpen(false);
      resetPdfDialog();
      fetchBrands();
    } catch {
      toast({ title: 'Hata', description: 'Kaydetme basarisiz oldu.', variant: 'destructive' });
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <div>
      <Link href="/library" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Kutuphanem
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6" />Mekanik Markalar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Kutuphanenizdeki mekanik malzeme markalari</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openManual}>
            <Plus className="mr-2 h-4 w-4" />Marka Ekle
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={() => setPdfOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />PDF Yukle (Admin)
            </Button>
          )}
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Mekanik markalarda ara..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : filteredBrands.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20">
          <Package className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {searchQuery ? 'Aramanizla eslesen marka bulunamadi.' : 'Henuz mekanik marka eklenmemis.'}
          </p>
          {!searchQuery && (
            <Link href="/materials" className="mt-4 text-sm text-primary underline">Malzeme Havuzundan Aktar</Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredBrands.map((b) => {
            const initials = b.brandName.slice(0, 2).toUpperCase();
            return (
              <Link key={b.brandId} href={`/library/brand/${b.brandId}`}>
                <Card className="group cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <CardContent className="flex aspect-square flex-col items-center justify-center gap-2 p-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-muted bg-gradient-to-br from-slate-50 to-slate-100 transition-transform group-hover:scale-105">
                      <span className="text-xl font-bold text-slate-400">{initials}</span>
                    </div>
                    <h3 className="text-sm font-semibold">{b.brandName}</h3>
                    <p className="text-[10px] text-muted-foreground">{b.itemCount} malzeme</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Marka Ekle — uygulama ici bos tablo (foto 3 formatinin bos hali) */}
      {manualOpen && manualGrid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2">
          <div className="flex h-full max-h-[98vh] w-full max-w-[98vw] flex-col overflow-hidden rounded-lg bg-background shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b p-3">
              <div className="flex flex-1 items-center gap-3">
                <h2 className="whitespace-nowrap text-base font-bold">Yeni Marka</h2>
                <Input
                  autoFocus
                  placeholder="Marka adı (örn: AYVAZ)"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  className="h-9 max-w-xs"
                />
                <p className="hidden text-xs text-muted-foreground lg:block">
                  Boş tabloyu doldurun · en alta yeni satır otomatik eklenir · yalnız Malzeme Adı zorunlu
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={closeManual} disabled={manualSaving}>
                  <X className="mr-1 h-3.5 w-3.5" />İptal
                </Button>
                <Button size="sm" onClick={handleSaveManualBrand} disabled={manualSaving || !newBrandName.trim()}>
                  {manualSaving ? (
                    <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Kaydediliyor...</>
                  ) : (
                    <><Save className="mr-1 h-3.5 w-3.5" />Markayı Kaydet</>
                  )}
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <ExcelGrid
                data={manualGrid}
                brands={[]}
                currencySymbol="₺"
                conversionRate={1}
                mode="library"
                libraryPriceField="materialUnitPriceField"
                autoAppendRow
                enableStructureEdit
                onBrandChange={async () => null}
                onRowDataChange={setManualRows}
              />
            </div>
          </div>
        </div>
      )}

      {/* PDF Yukle Dialog */}
      <Dialog open={pdfOpen} onOpenChange={(open) => { setPdfOpen(open); if (!open) resetPdfDialog(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{pdfStep === 'upload' ? 'PDF Yukle' : 'Ayiklanan Malzemeler'}</DialogTitle>
          </DialogHeader>

          {pdfStep === 'upload' ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Marka</Label>
                <Select value={pdfBrandId} onValueChange={setPdfBrandId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Marka secin" />
                  </SelectTrigger>
                  <SelectContent>
                    {poolBrands.map((pb) => (
                      <SelectItem key={pb.id} value={pb.id}>{pb.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>PDF Dosyasi (max 10MB)</Label>
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
          ) : (
            <div className="max-h-96 overflow-auto py-4">
              <p className="mb-3 text-sm text-muted-foreground">{extractedItems.length} malzeme ayiklandi.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Malzeme Adi</th>
                    <th className="pb-2 font-medium">Birim</th>
                    <th className="pb-2 text-right font-medium">Birim Fiyat</th>
                  </tr>
                </thead>
                <tbody>
                  {extractedItems.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2">{item.materialName}</td>
                      <td className="py-2">{item.unit}</td>
                      <td className="py-2 text-right">{item.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DialogFooter>
            {pdfStep === 'upload' ? (
              <>
                <Button variant="outline" onClick={() => { setPdfOpen(false); resetPdfDialog(); }}>Iptal</Button>
                <Button onClick={handlePdfExtract} disabled={pdfLoading || !pdfFile || !pdfBrandId}>
                  {pdfLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Ayiklaniyor...</> : 'Ayikla'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setPdfStep('upload'); setExtractedItems([]); }}>Geri</Button>
                <Button onClick={handlePdfSaveConfirm} disabled={saveLoading}>
                  {saveLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Kaydediliyor...</> : 'Onayla ve Kaydet'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
