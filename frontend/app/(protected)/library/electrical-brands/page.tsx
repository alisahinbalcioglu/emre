'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap, Plus, Search, Upload, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import PdfToExcelButton from '@/components/library/PdfToExcelButton';

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

export default function ElectricalBrandsPage() {
  const [brands, setBrands] = useState<LibraryBrand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const isAdmin = getRole() === 'admin';

  // Pool brands for dropdowns
  const [poolBrands, setPoolBrands] = useState<PoolBrand[]>([]);

  // Malzeme Ekle dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [materialName, setMaterialName] = useState('');
  const [unit, setUnit] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');

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
      // Sadece ELEKTRIK markalari goster
      const map = new Map<string, LibraryBrand>();
      for (const item of data) {
        const disc = item.brand?.discipline;
        if (disc !== 'electrical') continue;
        const bid = item.brandId ?? '_none';
        const bname = item.brand?.name ?? 'Markasiz';
        if (!map.has(bid)) map.set(bid, { brandId: bid, brandName: bname, itemCount: 0 });
        map.get(bid)!.itemCount++;
      }
      setBrands(Array.from(map.values()).sort((a, b) => a.brandName.localeCompare(b.brandName, 'tr')));
    }).catch(() => toast({ title: 'Hata', variant: 'destructive' })).finally(() => setIsLoading(false));
  }, []);

  const fetchPoolBrands = useCallback(() => {
    api.get<PoolBrand[]>('/brands?discipline=electrical').then(({ data }) => setPoolBrands(data)).catch(() => {});
  }, []);

  useEffect(() => { fetchBrands(); fetchPoolBrands(); }, [fetchBrands, fetchPoolBrands]);

  const filteredBrands = brands.filter((b) =>
    b.brandName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function resetAddDialog() {
    setMaterialName('');
    setUnit('');
    setCustomPrice('');
    setSelectedBrandId('');
  }

  function resetPdfDialog() {
    setPdfFile(null);
    setPdfBrandId('');
    setExtractedItems([]);
    setPdfStep('upload');
  }

  async function handleAddMaterial() {
    const trimmed = materialName.trim();
    if (!trimmed || !unit || !selectedBrandId) return;
    setAddLoading(true);
    try {
      await api.post('/library', {
        materialName: trimmed,
        unit,
        customPrice: customPrice ? parseFloat(customPrice) : undefined,
        brandId: selectedBrandId,
      });
      toast({ title: 'Eklendi', description: `"${trimmed}" kutuphanenize eklendi.` });
      setAddOpen(false);
      resetAddDialog();
      fetchBrands();
    } catch {
      toast({ title: 'Hata', description: 'Malzeme eklenemedi.', variant: 'destructive' });
    } finally {
      setAddLoading(false);
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
            <Zap className="h-6 w-6 text-amber-500" />Elektrik Markalar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Kutuphanenizdeki elektrik malzeme markalari</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />Malzeme Ekle
          </Button>
          <PdfToExcelButton label="PDF'den Excel'e Cevir" />
          {isAdmin && (
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setPdfOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />PDF Yukle (Admin)
            </Button>
          )}
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Elektrik markalarda ara..."
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
          <Zap className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {searchQuery ? 'Aramanizla eslesen marka bulunamadi.' : 'Henuz elektrik markasi eklenmemis.'}
          </p>
          {!searchQuery && (
            <Link href="/materials/electrical" className="mt-4 text-sm text-primary underline">Elektrik Havuzundan Aktar</Link>
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
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 transition-transform group-hover:scale-105">
                      <span className="text-xl font-bold text-amber-400">{initials}</span>
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

      {/* Malzeme Ekle Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetAddDialog(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Malzeme Ekle</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Marka</Label>
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
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
              <Label>Malzeme Adi</Label>
              <Input
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder="Orn: Kablo 3x2.5mm"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Birim</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Birim secin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Adet">Adet</SelectItem>
                  <SelectItem value="Metre">Metre</SelectItem>
                  <SelectItem value="Kg">Kg</SelectItem>
                  <SelectItem value="Paket">Paket</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fiyat (TL)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetAddDialog(); }}>Iptal</Button>
            <Button
              onClick={handleAddMaterial}
              disabled={addLoading || !materialName.trim() || !unit || !selectedBrandId}
            >
              {addLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Ekleniyor...</> : 'Ekle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <Button className="bg-amber-600 hover:bg-amber-700" onClick={handlePdfExtract} disabled={pdfLoading || !pdfFile || !pdfBrandId}>
                  {pdfLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Ayiklaniyor...</> : 'Ayikla'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setPdfStep('upload'); setExtractedItems([]); }}>Geri</Button>
                <Button className="bg-amber-600 hover:bg-amber-700" onClick={handlePdfSaveConfirm} disabled={saveLoading}>
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
