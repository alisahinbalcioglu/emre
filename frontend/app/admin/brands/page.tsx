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

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  Package, Plus, Trash2, Loader2, ChevronRight, RefreshCw, AlertCircle, Upload,
  AlertTriangle,
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
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface Brand {
  id: string;
  name: string;
  discipline?: string;
  _count?: { priceLists: number; materialPrices: number };
}
interface PriceList { id: string; name: string; createdAt: string; _count?: { items: number } }
interface PoolMaterial {
  id: string; materialName: string; unit: string; price: number;
  // Z4: fiyatin orijinal para birimi — havuz kendi birimiyle listeler
  currency?: 'TRY' | 'USD' | 'EUR';
  // Kaynak sadakati (Y1/Y2/Y5) — eski kayitlarda null
  kategori?: string | null; cins?: string | null; cap?: string | null;
  adRaw?: string | null; sortOrder?: number;
}

// ── Excel ice aktarim onizlemesi (Z1-Z6) ──────────────────────────────
interface PreviewItem {
  materialName: string; unit: string;
  unitPrice: number | null;
  priceRaw?: string | number | null;
  ambiguous?: boolean;
  asThousands?: number | null;
  asDecimal?: number | null;
  currency?: 'TRY' | 'USD' | 'EUR';
  kategori?: string | null; cins?: string | null; cap?: string | null;
  adRaw?: string | null; birimRaw?: string | null; sortOrder?: number;
  sapma?: string | null;
}
interface ImportPreview {
  brandName: string;
  priceListName?: string | null;
  items: PreviewItem[];
  warnings: string[];
  formatQuestion: { count: number; samples: { raw: string; asThousands: number | null; asDecimal: number | null }[] } | null;
  dotMeaning: 'thousands' | 'decimal' | null;
  stats: {
    toplam: number; gecerli: number; belirsiz: number; sapan: number;
    atlanacak: number; kategoriSayisi: number; currencies: Record<string, number>;
  };
}

const CURRENCY_SYMBOL: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
const fmtMoney = (v: number, currency?: string | null) =>
  `${CURRENCY_SYMBOL[currency ?? 'TRY'] ?? '₺'}${v.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;

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

  // Excel toplu yukleme — iki fazli (Z5): preview modal + commit
  const [importing, setImporting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [dotChoice, setDotChoice] = useState<'thousands' | 'decimal' | null>(null);
  const [resolvedAmbig, setResolvedAmbig] = useState<{ count: number; choice: 'thousands' | 'decimal' } | null>(null);
  const [importListName, setImportListName] = useState('');
  const excelInputRef = useRef<HTMLInputElement>(null);

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
    if (!window.confirm(`"${b.name}" markasi, TUM fiyat listeleri VE kullanicilarin bu markadan aktardigi kutuphane kayitlari silinecek. Emin misiniz?`)) return;
    try {
      const { data } = await api.delete(`/brands/${b.id}`);
      toast({
        title: 'Marka silindi',
        description: data?.deletedLibraryRows
          ? `${b.name} — ${data.deletedLibraryRows} kullanıcı kütüphane kaydı da temizlendi`
          : b.name,
      });
      if (selectedBrand?.id === b.id) { setSelectedBrand(null); setPriceLists([]); setSelectedList(null); setMaterials([]); }
      fetchBrands();
    } catch (e: any) {
      toast({ title: 'Hata', description: e?.response?.data?.message ?? 'Marka silinemedi', variant: 'destructive' });
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

  // ── Excel ice aktarim: IKI FAZLI (Z5 — onizleme onaylanmadan yazim yok) ──
  // FAZ 1: preview — dosya parse edilir, modal acilir. Fiyat bicimi
  // belirsizse (Z2) modalda DOSYA BASINA TEK SORU sorulur; cevap tum
  // kolona uygulanir (yeniden preview). FAZ 2: commit — onayla yazilir.
  async function openImportPreview(file: File, dotMeaning?: 'thousands' | 'decimal') {
    if (!selectedBrand) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (dotMeaning) formData.append('dotMeaning', dotMeaning);
      const url = selectedList
        ? `/admin/price-lists/${selectedList.id}/import-excel/preview`
        : `/admin/brands/${selectedBrand.id}/import-excel/preview`;
      const { data } = await api.post<ImportPreview>(
        url, formData, { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setPreviewFile(file);
      setPreview(data);
      if (dotMeaning) setDotChoice(dotMeaning);
      if (!dotMeaning) {
        setDotChoice(null);
        setResolvedAmbig(null);
        setImportListName(file.name.replace(/\.[^.]+$/, ''));
      }
    } catch (e: any) {
      toast({
        title: 'Excel önizlenemedi',
        description: e?.response?.data?.message ?? e?.message ?? 'Bilinmeyen hata',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  }

  // Z2: tek soru cevabi — ayni dosya secilen yorumla YENIDEN onizlenir;
  // belirsizler cozulur, Z6 sapma isaretleri cozulmus fiyatlarla guncellenir.
  function answerFormatQuestion(choice: 'thousands' | 'decimal') {
    if (!preview || !previewFile) return;
    setResolvedAmbig({ count: preview.formatQuestion?.count ?? 0, choice });
    openImportPreview(previewFile, choice);
  }

  function closePreview() {
    setPreview(null);
    setPreviewFile(null);
    setDotChoice(null);
    setResolvedAmbig(null);
  }

  async function commitImport() {
    if (!preview || !selectedBrand) return;
    setCommitting(true);
    try {
      const url = selectedList
        ? `/admin/price-lists/${selectedList.id}/import-excel/commit`
        : `/admin/brands/${selectedBrand.id}/import-excel/commit`;
      const body: any = {
        items: preview.items,
        dotMeaning: dotChoice ?? preview.dotMeaning ?? undefined,
      };
      if (!selectedList) {
        body.listName = importListName.trim() || previewFile?.name.replace(/\.[^.]+$/, '');
      }
      const { data } = await api.post(url, body);
      // Z5 raporu: kac kategori, kac urun, belirsizlik nasil cozuldu, kac satir atlandi
      toast({
        title: `${(data.imported ?? 0) + (data.updated ?? 0)} kalem içe aktarıldı — "${data.priceListName}"`,
        description: [
          data.kategoriSayisi ? `${data.kategoriSayisi} kategori` : null,
          data.imported ? `${data.imported} yeni` : null,
          data.updated ? `${data.updated} güncellendi` : null,
          data.removed ? `${data.removed} eski kalem temizlendi` : null,
          resolvedAmbig
            ? `${resolvedAmbig.count} belirsiz fiyat "${resolvedAmbig.choice === 'thousands' ? 'nokta = binlik' : 'nokta = ondalık'}" kararıyla çözüldü`
            : null,
          data.atlananSayisi ? `${data.atlananSayisi} satır atlandı` : null,
        ].filter(Boolean).join(' · '),
      });
      if (data.atlananSayisi > 0 && Array.isArray(data.atlananNedenler) && data.atlananNedenler.length) {
        toast({
          title: `${data.atlananSayisi} satır atlandı — nedenler`,
          description: data.atlananNedenler.slice(0, 3).join(' · ')
            + (data.atlananSayisi > 3 ? ` · … (+${data.atlananSayisi - 3})` : ''),
          variant: 'destructive',
        });
      }
      closePreview();
      // Listeleri tazele ve hedef listeyi ac — yuklenen urunler tabloda gorunur.
      // openBrand KULLANMA: secimi sifirlar ve openList'in doldurdugu
      // malzeme tablosunu yaristirip bosaltir.
      const { data: bm } = await api.get<{ priceLists: PriceList[] }>(
        `/admin/brands/${selectedBrand.id}/materials`,
      );
      const lists = bm.priceLists ?? [];
      setPriceLists(lists);
      const target = selectedList
        ? lists.find((pl) => pl.id === selectedList.id)
        : lists.find((pl) => pl.name === data.priceListName);
      if (target) openList(target);
    } catch (e: any) {
      toast({
        title: 'İçe aktarım başarısız',
        description: e?.response?.data?.message ?? e?.message ?? 'Bilinmeyen hata',
        variant: 'destructive',
      });
    } finally {
      setCommitting(false);
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

                {/* Excel toplu yukleme — liste secili OLMASA da calisir:
                    secili degilse backend dosya adiyla yeni liste acar. */}
                <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 px-3 py-2">
                  <div className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">Excel ile toplu yükleme</span>
                    {' — '}
                    {selectedList
                      ? <>Malzemeler <span className="font-medium">&quot;{selectedList.name}&quot;</span> listesine eklenecek.</>
                      : <>Liste seçili değil — dosya adıyla <span className="font-medium">yeni fiyat listesi otomatik oluşturulur</span>.</>}
                    {' '}Malzeme/Ürün Adı + Liste Fiyatı kolonları yeterli (Birim, Kod, Para Birimi opsiyonel; dövizli fiyatlar <span className="font-medium">kendi biriminde saklanır</span>, çevrim teklif ekranında yapılır). Yükleme öncesi önizleme gösterilir.
                  </div>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) openImportPreview(f);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    disabled={importing}
                    onClick={() => excelInputRef.current?.click()}
                  >
                    {importing
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                    {importing ? 'Yükleniyor…' : 'Excel Yükle'}
                  </Button>
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
                      (() => {
                        // Y5: kaynak sadakati — API kaynak sirasinda dondurur;
                        // kategori degistikce tam-genislik baslik satiri cizilir.
                        // Cinsi/Cap sutunlari yalniz veri varsa gosterilir.
                        const hasCins = materials.some((m) => m.cins);
                        const hasCap = materials.some((m) => m.cap);
                        const colCount = 3 + (hasCins ? 1 : 0) + (hasCap ? 1 : 0);
                        let prevKategori: string | null | undefined;
                        return (
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-slate-50 hover:bg-slate-50">
                                <TableHead>Malzeme</TableHead>
                                {hasCins && <TableHead className="w-44">Cinsi</TableHead>}
                                {hasCap && <TableHead className="w-20">Çap</TableHead>}
                                <TableHead className="w-24">Birim</TableHead>
                                <TableHead className="w-32 text-right">Baz Fiyat</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {materials.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={colCount} className="py-8 text-center text-xs text-slate-400">
                                    Bu listede malzeme yok — yukarıdan ekleyin.
                                  </TableCell>
                                </TableRow>
                              )}
                              {materials.map((m) => {
                                const showKategori = !!m.kategori && m.kategori !== prevKategori;
                                prevKategori = m.kategori ?? prevKategori;
                                return (
                                  <Fragment key={m.id}>
                                    {showKategori && (
                                      <TableRow className="bg-red-50 hover:bg-red-50">
                                        <TableCell colSpan={colCount} className="py-1.5 text-xs font-bold text-red-800">
                                          {m.kategori}
                                        </TableCell>
                                      </TableRow>
                                    )}
                                    <TableRow>
                                      {/* Y3: kaynak metin BIREBIR — adRaw varsa o gosterilir */}
                                      <TableCell className="font-medium text-slate-900">{m.adRaw ?? m.materialName}</TableCell>
                                      {hasCins && <TableCell className="text-slate-600">{m.cins ?? ''}</TableCell>}
                                      {hasCap && <TableCell className="text-slate-600">{m.cap ?? ''}</TableCell>}
                                      <TableCell>{m.unit}</TableCell>
                                      {/* Z4: havuz fiyati KENDI para birimiyle listeler */}
                                      <TableCell className="text-right tabular-nums">
                                        {fmtMoney(m.price, m.currency)}
                                      </TableCell>
                                    </TableRow>
                                  </Fragment>
                                );
                              })}
                            </TableBody>
                          </Table>
                        );
                      })()
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── ICE AKTARIM ONIZLEMESI (Z3/Z5): onaylanmadan HICBIR satir yazilmaz ── */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o && !committing) closePreview(); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              İçe Aktarım Önizlemesi
              {preview?.priceListName ? ` — "${preview.priceListName}"` : preview ? ` — ${preview.brandName}` : ''}
            </DialogTitle>
          </DialogHeader>

          {preview && (
            <div className="space-y-3">
              {/* Özet şeridi */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant="secondary">{preview.stats.toplam} satır</Badge>
                <Badge variant="secondary">{preview.stats.kategoriSayisi} kategori</Badge>
                {Object.entries(preview.stats.currencies).map(([c, n]) => (
                  <Badge key={c} variant="info">{CURRENCY_SYMBOL[c] ?? c} {n} satır</Badge>
                ))}
                {preview.stats.belirsiz > 0 && (
                  <Badge variant="warning">{preview.stats.belirsiz} fiyat biçim onayı bekliyor</Badge>
                )}
                {preview.stats.sapan > 0 && (
                  <Badge variant="warning">{preview.stats.sapan} şüpheli fiyat</Badge>
                )}
                {preview.stats.atlanacak > 0 && (
                  <Badge variant="destructive">{preview.stats.atlanacak} satır atlanacak</Badge>
                )}
              </div>

              {/* Z2: DOSYA BAŞINA TEK SORU — cevap tüm kolona uygulanır */}
              {preview.formatQuestion && (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-900">
                    Bu listede {preview.formatQuestion.count} satırın fiyat biçimi belirsiz.
                    Örn. &quot;{preview.formatQuestion.samples[0]?.raw}&quot; hangisi? Seçiminiz tüm satırlara uygulanır.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(['thousands', 'decimal'] as const).map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        disabled={importing}
                        onClick={() => answerFormatQuestion(choice)}
                        className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
                      >
                        <span className="font-semibold text-slate-900">
                          {choice === 'thousands' ? 'Nokta binlik ayracı' : 'Nokta ondalık ayracı'}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-600">
                          {preview.formatQuestion!.samples.map((s) => {
                            const v = choice === 'thousands' ? s.asThousands : s.asDecimal;
                            return `${s.raw} → ${v != null ? v.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '?'}`;
                          }).join(' · ')}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {importing && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Önizleme güncelleniyor…
                </div>
              )}

              {/* Yapısal uyarılar (sayfa atlandı vb.) — kısa, önizleme içinde */}
              {preview.warnings.length > 0 && (
                <div className="rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs text-orange-800">
                  {preview.warnings.slice(0, 3).join(' · ')}
                  {preview.warnings.length > 3 ? ` · … (+${preview.warnings.length - 3})` : ''}
                </div>
              )}

              {/* Marka moduna yükleme: liste adı (liste COMMIT anında açılır — Z5) */}
              {!selectedList && (
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs text-slate-500">Yeni liste adı:</span>
                  <Input
                    value={importListName}
                    onChange={(e) => setImportListName(e.target.value)}
                    className="h-8 max-w-sm text-sm"
                  />
                </div>
              )}

              {/* Önizleme tablosu — belirsiz/şüpheli satırlar işaretli (Z3/Z6) */}
              <div className="max-h-[42vh] overflow-y-auto rounded-md border">
                {(() => {
                  const hasCins = preview.items.some((i) => i.cins);
                  const hasCap = preview.items.some((i) => i.cap);
                  const colCount = 3 + (hasCins ? 1 : 0) + (hasCap ? 1 : 0);
                  let prevKategori: string | null | undefined;
                  return (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead>Malzeme</TableHead>
                          {hasCins && <TableHead className="w-40">Cinsi</TableHead>}
                          {hasCap && <TableHead className="w-20">Çap</TableHead>}
                          <TableHead className="w-20">Birim</TableHead>
                          <TableHead className="w-40 text-right">Fiyat</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.items.map((it, idx) => {
                          const showKategori = !!it.kategori && it.kategori !== prevKategori;
                          prevKategori = it.kategori ?? prevKategori;
                          const invalid = !it.ambiguous && (it.unitPrice == null || it.unitPrice <= 0);
                          return (
                            <Fragment key={idx}>
                              {showKategori && (
                                <TableRow className="bg-red-50 hover:bg-red-50">
                                  <TableCell colSpan={colCount} className="py-1 text-xs font-bold text-red-800">
                                    {it.kategori}
                                  </TableCell>
                                </TableRow>
                              )}
                              <TableRow className={it.ambiguous ? 'bg-amber-50/60' : invalid ? 'bg-red-50/40' : undefined}>
                                <TableCell className="py-1.5 text-sm text-slate-900">{it.adRaw ?? it.materialName}</TableCell>
                                {hasCins && <TableCell className="py-1.5 text-xs text-slate-600">{it.cins ?? ''}</TableCell>}
                                {hasCap && <TableCell className="py-1.5 text-xs text-slate-600">{it.cap ?? ''}</TableCell>}
                                <TableCell className="py-1.5 text-xs">{it.unit}</TableCell>
                                <TableCell className="py-1.5 text-right text-sm tabular-nums">
                                  {it.ambiguous ? (
                                    <span className="inline-flex items-center gap-1 text-amber-700">
                                      <AlertTriangle className="h-3 w-3" />
                                      {String(it.priceRaw ?? '')} — onay bekliyor
                                    </span>
                                  ) : it.unitPrice == null ? (
                                    <span className="text-red-600">okunamadı ({String(it.priceRaw ?? '')})</span>
                                  ) : it.unitPrice <= 0 ? (
                                    <span className="text-red-600">atlanacak (sıfır/negatif)</span>
                                  ) : (
                                    <span className={it.sapma ? 'text-amber-700' : undefined}>
                                      {it.sapma && (
                                        <AlertTriangle className="mr-1 inline h-3 w-3" aria-label={it.sapma} />
                                      )}
                                      <span title={it.sapma ?? undefined}>{fmtMoney(it.unitPrice, it.currency)}</span>
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  );
                })()}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closePreview} disabled={committing}>
              Vazgeç
            </Button>
            <Button
              onClick={commitImport}
              disabled={committing || importing || !preview || preview.stats.belirsiz > 0 || preview.stats.gecerli === 0}
              title={preview && preview.stats.belirsiz > 0 ? 'Önce fiyat biçimi sorusunu yanıtlayın' : undefined}
            >
              {committing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              İçe Aktar{preview ? ` (${preview.stats.gecerli} kalem)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
