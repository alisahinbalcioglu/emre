'use client';

/**
 * Admin → Marka & Fiyat Listeleri — GLOBAL Malzeme Havuzu CRUD'u.
 *
 * Havuz standart kullaniciya SALT OKUNUR'dur; marka/kategori/baz fiyat
 * ekleme-cikarma YALNIZ buradan (admin) yapilir. Backend zaten korumali:
 * /brands yazma uclari @Roles('admin'), /admin/* uclari RolesGuard.
 *
 * Sol: marka listesi (+ekle/sil). Sag: secili markanin fiyat listeleri
 * (+ekle/sil) + secili listenin malzemeleri + hizli malzeme ekleme.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Package, Plus, Trash2, Loader2, ChevronRight, RefreshCw, AlertCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface Brand {
  id: string;
  name: string;
  discipline?: string;
  _count?: { priceLists: number; materialPrices: number };
}
interface PriceList { id: string; name: string; createdAt: string; _count?: { items: number } }
interface PoolMaterial { id: string; materialName: string; unit: string; price: number }

export default function AdminBrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);

  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [selectedList, setSelectedList] = useState<PriceList | null>(null);
  const [materials, setMaterials] = useState<PoolMaterial[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Formlar
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandDiscipline, setNewBrandDiscipline] = useState<'mechanical' | 'electrical'>('mechanical');
  const [newListName, setNewListName] = useState('');
  const [matName, setMatName] = useState('');
  const [matUnit, setMatUnit] = useState('Adet');
  const [matPrice, setMatPrice] = useState('');

  const fetchBrands = useCallback(() => {
    setLoadingBrands(true);
    api.get<Brand[]>('/brands')
      .then(({ data }) => {
        const list = data ?? [];
        setBrands(list);
        // STALE SELECTION FIX: secili marka artik listede yoksa (baska yerden
        // silinmis olabilir) secimi ve detay panelini temizle — aksi halde tum
        // liste/malzeme islemleri 404 doner, kullanici "yuklenemiyor" sanir.
        setSelectedBrand((prev) => {
          if (prev && !list.some((b) => b.id === prev.id)) {
            setPriceLists([]);
            setSelectedList(null);
            setMaterials([]);
            return null;
          }
          return prev;
        });
      })
      .catch((e: any) => toast({
        title: 'Markalar yüklenemedi',
        description: e?.response?.data?.message ?? e?.message ?? 'Bilinmeyen hata',
        variant: 'destructive',
      }))
      .finally(() => setLoadingBrands(false));
  }, []);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  const openBrand = useCallback(async (b: Brand) => {
    setSelectedBrand(b);
    setSelectedList(null);
    setMaterials([]);
    setLoadingDetail(true);
    try {
      const { data } = await api.get<{ priceLists: PriceList[] }>(`/admin/brands/${b.id}/materials`);
      setPriceLists(data.priceLists ?? []);
    } catch {
      toast({ title: 'Fiyat listeleri yüklenemedi', variant: 'destructive' });
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const openList = useCallback(async (pl: PriceList) => {
    setSelectedList(pl);
    setLoadingDetail(true);
    try {
      const { data } = await api.get<{ materials: PoolMaterial[] }>(`/admin/price-lists/${pl.id}/materials`);
      setMaterials(data.materials ?? []);
    } catch {
      toast({ title: 'Malzemeler yüklenemedi', variant: 'destructive' });
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  async function addBrand() {
    const name = newBrandName.trim();
    if (!name) return;
    try {
      await api.post('/brands', { name, discipline: newBrandDiscipline });
      toast({ title: 'Marka eklendi', description: name });
      setNewBrandName('');
      fetchBrands();
    } catch (e: any) {
      toast({ title: 'Hata', description: e?.response?.data?.message ?? 'Marka eklenemedi', variant: 'destructive' });
    }
  }

  async function deleteBrand(b: Brand) {
    if (!window.confirm(`"${b.name}" markasi ve TUM fiyat listeleri havuzdan silinecek. Emin misiniz?`)) return;
    try {
      await api.delete(`/brands/${b.id}`);
      toast({ title: 'Marka silindi', description: b.name });
      if (selectedBrand?.id === b.id) { setSelectedBrand(null); setPriceLists([]); setSelectedList(null); setMaterials([]); }
      fetchBrands();
    } catch {
      toast({ title: 'Hata', description: 'Marka silinemedi', variant: 'destructive' });
    }
  }

  async function addPriceList() {
    if (!selectedBrand) return;
    const name = newListName.trim();
    if (!name) return;
    try {
      await api.post(`/admin/brands/${selectedBrand.id}/price-lists`, { name });
      toast({ title: 'Fiyat listesi eklendi', description: name });
      setNewListName('');
      openBrand(selectedBrand);
    } catch {
      toast({ title: 'Hata', description: 'Liste eklenemedi', variant: 'destructive' });
    }
  }

  async function deletePriceList(pl: PriceList) {
    if (!window.confirm(`"${pl.name}" listesi ve icindeki tum baz fiyatlar silinecek. Emin misiniz?`)) return;
    try {
      await api.delete(`/admin/price-lists/${pl.id}`);
      toast({ title: 'Liste silindi', description: pl.name });
      if (selectedList?.id === pl.id) { setSelectedList(null); setMaterials([]); }
      if (selectedBrand) openBrand(selectedBrand);
    } catch {
      toast({ title: 'Hata', description: 'Liste silinemedi', variant: 'destructive' });
    }
  }

  async function addMaterial() {
    if (!selectedBrand || !selectedList) return;
    const name = matName.trim();
    const price = parseFloat(matPrice.replace(',', '.'));
    if (!name || isNaN(price) || price < 0) {
      toast({ title: 'Eksik bilgi', description: 'Malzeme adı ve geçerli baz fiyat girin.', variant: 'destructive' });
      return;
    }
    try {
      await api.post('/admin/materials/save-bulk', {
        brandId: selectedBrand.id,
        priceListId: selectedList.id,
        items: [{ materialName: name, unit: matUnit || 'Adet', unitPrice: price }],
      });
      toast({ title: 'Baz fiyat eklendi', description: `${name} — ₺${price.toFixed(2)}` });
      setMatName(''); setMatPrice('');
      openList(selectedList);
    } catch (e: any) {
      toast({ title: 'Hata', description: e?.response?.data?.message ?? 'Malzeme eklenemedi', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
            <Package className="h-5 w-5 text-blue-600" />
            Marka &amp; Fiyat Listeleri
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Global Malzeme Havuzu yönetimi — kullanıcılara salt okunur, CRUD yalnız burada
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchBrands} disabled={loadingBrands}>
          <RefreshCw className={loadingBrands ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} />
          Yenile
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* SOL: markalar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Markalar ({brands.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Yeni marka adı"
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addBrand(); }}
                className="h-8 text-sm"
              />
              <Select value={newBrandDiscipline} onValueChange={(v) => setNewBrandDiscipline(v as any)}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mechanical">Mekanik</SelectItem>
                  <SelectItem value="electrical">Elektrik</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 px-2" onClick={addBrand} disabled={!newBrandName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {loadingBrands ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : brands.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Havuzda marka yok</p>
            ) : (
              <div className="max-h-[60vh] space-y-1 overflow-y-auto">
                {brands.map((b) => (
                  <div
                    key={b.id}
                    className={
                      'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors ' +
                      (selectedBrand?.id === b.id
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-transparent hover:bg-slate-50')
                    }
                    onClick={() => openBrand(b)}
                  >
                    <span className="flex-1 truncate font-medium">{b.name}</span>
                    <Badge variant={b.discipline === 'electrical' ? 'warning' : 'info'}>
                      {b.discipline === 'electrical' ? 'Elk' : 'Mek'}
                    </Badge>
                    <button
                      type="button"
                      title="Markayı havuzdan sil"
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      onClick={(e) => { e.stopPropagation(); deleteBrand(b); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SAG: secili marka detayi */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedBrand ? `${selectedBrand.name} — Fiyat Listeleri` : 'Marka seçin'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedBrand ? (
              <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
                <AlertCircle className="h-6 w-6" />
                <p className="text-sm">Soldan bir marka seçin — fiyat listeleri ve baz fiyatlar burada yönetilir.</p>
              </div>
            ) : (
              <>
                {/* Fiyat listeleri */}
                <div className="flex gap-2">
                  <Input
                    placeholder='Yeni liste adı (örn: "2026 Ocak Liste")'
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addPriceList(); }}
                    className="h-8 max-w-xs text-sm"
                  />
                  <Button size="sm" className="h-8" onClick={addPriceList} disabled={!newListName.trim()}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Liste
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {priceLists.length === 0 && !loadingDetail && (
                    <p className="text-xs text-slate-400">Bu markada fiyat listesi yok.</p>
                  )}
                  {priceLists.map((pl) => (
                    <div
                      key={pl.id}
                      className={
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ' +
                        (selectedList?.id === pl.id ? 'border-blue-400 bg-blue-50' : 'hover:bg-slate-50')
                      }
                      onClick={() => openList(pl)}
                    >
                      <span className="font-medium">{pl.name}</span>
                      <Badge variant="secondary">{pl._count?.items ?? 0} malzeme</Badge>
                      <button
                        type="button"
                        className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={(e) => { e.stopPropagation(); deletePriceList(pl); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Secili listenin malzemeleri */}
                {selectedList && (
                  <div className="space-y-3 border-t pt-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[220px] flex-1">
                        <Input
                          placeholder='Malzeme adı (örn: Ø110 PVC BORU)'
                          value={matName}
                          onChange={(e) => setMatName(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Input
                        placeholder="Birim"
                        value={matUnit}
                        onChange={(e) => setMatUnit(e.target.value)}
                        className="h-8 w-20 text-sm"
                      />
                      <Input
                        placeholder="Baz fiyat ₺"
                        value={matPrice}
                        onChange={(e) => setMatPrice(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addMaterial(); }}
                        className="h-8 w-28 text-sm"
                      />
                      <Button size="sm" className="h-8" onClick={addMaterial}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Baz Fiyat Ekle
                      </Button>
                    </div>

                    {loadingDetail ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 hover:bg-slate-50">
                            <TableHead>Malzeme</TableHead>
                            <TableHead className="w-24">Birim</TableHead>
                            <TableHead className="w-32 text-right">Baz Fiyat</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {materials.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="py-8 text-center text-xs text-slate-400">
                                Bu listede malzeme yok — yukarıdan ekleyin.
                              </TableCell>
                            </TableRow>
                          )}
                          {materials.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="font-medium text-slate-900">{m.materialName}</TableCell>
                              <TableCell>{m.unit}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                ₺{m.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
