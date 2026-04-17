'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Upload, Loader2, FolderOpen, Plus, Trash2,
  ChevronRight, Search,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';

/* ── Types ── */

interface Brand {
  id: string;
  name: string;
  logoUrl?: string | null;
  _count?: { priceLists: number; materialPrices: number };
}

interface SearchResult {
  materialName: string;
  unit: string;
  price: number;
  brandName: string;
  brandId: string;
  priceListName: string;
}

interface ExtractedRow { materialName: string; unit: string; unitPrice: number; _key: string }

function getRole(): string | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('user') || '{}').role ?? null; } catch { return null; }
}

/* ── Page ── */

export default function MaterialsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isAdmin = getRole() === 'admin';

  // Global search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Brand add
  const [addOpen, setAddOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // PDF upload state
  const [uploadBrandId, setUploadBrandId] = useState<string | null>(null);
  const [listName, setListName] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [previewRows, setPreviewRows] = useState<ExtractedRow[]>([]);
  const [usedProvider, setUsedProvider] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveResult, setSaveResult] = useState<{ imported: number; brandName: string; listName: string } | null>(null);
  const [currency, setCurrency] = useState<'TRY' | 'USD' | 'EUR'>('TRY');
  const [exchangeRates, setExchangeRates] = useState<{ usd: number; eur: number } | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  // Timer + ETA
  const [estimatedTotal, setEstimatedTotal] = useState(0);
  function estimateDuration(file: File): number {
    // Heuristic: ~15s base + ~8s per MB (AI processing scales with content)
    const mb = file.size / (1024 * 1024);
    return Math.max(20, Math.round(15 + mb * 8));
  }
  function startTimer(file: File) {
    const est = estimateDuration(file);
    setEstimatedTotal(est);
    setElapsedSec(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
  }
  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
  function fmtTime(s: number) { const m = Math.floor(s / 60); return m > 0 ? `${m}dk ${s % 60}sn` : `${s}sn`; }
  function remainingTime(): string {
    const remaining = Math.max(0, estimatedTotal - elapsedSec);
    if (remaining <= 0) return 'birazdan...';
    return `~${fmtTime(remaining)} kaldı`;
  }
  function progressPercent(): number {
    if (estimatedTotal <= 0) return 0;
    return Math.min(95, Math.round((elapsedSec / estimatedTotal) * 100));
  }

  /* ── Fetch ── */

  const fetchBrands = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get<Brand[]>('/brands');
      setBrands(data);
    } catch {
      toast({ title: 'Hata', description: 'Markalar yüklenemedi.', variant: 'destructive' });
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    fetchBrands();
    if (getRole() === 'admin') {
      api.get('/admin/settings').then(({ data }) => setAiConfigured(!!(data?.ACTIVE_AI_PROVIDER))).catch(() => setAiConfigured(false));
      fetch('https://open.er-api.com/v6/latest/USD').then(r => r.json()).then(d => {
        if (d.rates?.TRY && d.rates?.EUR) setExchangeRates({ usd: d.rates.TRY, eur: d.rates.TRY / d.rates.EUR });
      }).catch(() => {});
    }
  }, [fetchBrands]);

  /* ── Global Search (debounced) ── */

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get<SearchResult[]>(`/brands/search?q=${encodeURIComponent(q.trim())}`);
        setSearchResults(data);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
  }

  /* ── Brand Add ── */

  async function handleAddBrand() {
    const trimmed = newBrandName.trim();
    if (!trimmed) return;
    setAddLoading(true);
    try {
      await api.post('/brands', { name: trimmed });
      toast({ title: 'Marka eklendi', description: trimmed });
      setAddOpen(false); setNewBrandName(''); await fetchBrands();
    } catch { toast({ title: 'Hata', description: 'Marka eklenemedi.', variant: 'destructive' }); }
    finally { setAddLoading(false); }
  }

  async function handleDeleteBrand(brand: Brand) {
    if (!window.confirm(`"${brand.name}" ve tüm fiyat listelerini silmek istediğinize emin misiniz?`)) return;
    try { await api.delete(`/brands/${brand.id}`); toast({ title: 'Silindi' }); await fetchBrands(); }
    catch { toast({ title: 'Hata', variant: 'destructive' }); }
  }

  /* ── PDF Upload ── */

  function openUploadDialog(brandId: string) {
    setUploadBrandId(brandId); setListName(''); setPdfFile(null);
    setPreviewRows([]); setSaveResult(null); setUsedProvider(null); setCurrency('TRY');
  }

  async function handlePdfExtract() {
    if (!pdfFile || !uploadBrandId) return;
    setPdfLoading(true); setUploadProgress(0); setPreviewRows([]); startTimer(pdfFile);
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      const { data } = await api.post('/admin/materials/extract-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000,
        onUploadProgress: (e: any) => { if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100)); },
      });
      let idx = 0;
      const allRows = (data.materials || []);
      // Bos/gecersiz satirlari filtrele
      const validRows = allRows
        .filter((m: any) => m.materialName?.trim()?.length >= 2 && Number(m.unitPrice) > 0)
        .map((m: any) => ({ materialName: m.materialName.trim(), unit: m.unit?.trim() || 'Adet', unitPrice: Number(m.unitPrice), _key: `r-${++idx}` }));

      if (validRows.length === 0) {
        toast({ title: 'Hata', description: `AI PDF'ten ${allRows.length} satır çıkardı ancak hiçbirinde geçerli malzeme adı ve fiyat bulunamadı. PDF formatını kontrol edin.`, variant: 'destructive' });
      } else {
        setPreviewRows(validRows); setUsedProvider(data.usedProvider || null);
        const skippedCount = allRows.length - validRows.length;
        const desc = skippedCount > 0 ? `${validRows.length} geçerli malzeme (${skippedCount} boş satır atlandı, ${fmtTime(elapsedSec)})` : `${validRows.length} malzeme bulundu (${fmtTime(elapsedSec)})`;
        toast({ title: 'Ayıklama tamamlandı', description: desc });
      }
    } catch (err: any) { toast({ title: 'Hata', description: err?.response?.data?.message || 'PDF analiz edilemedi.', variant: 'destructive' }); }
    finally { stopTimer(); setPdfLoading(false); setUploadProgress(0); }
  }

  async function handleSavePreview() {
    if (!previewRows.length || !uploadBrandId) return;
    setSaveLoading(true);
    try {
      // 1. PriceList olustur (liste adi bossa otomatik tarih ata)
      const finalListName = listName.trim() || `Yükleme - ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
      const { data: pl } = await api.post(`/admin/brands/${uploadBrandId}/price-lists`, { name: finalListName });
      // 2. Save bulk
      const items = previewRows.map(r => ({ materialName: r.materialName, unit: r.unit, unitPrice: r.unitPrice }));
      let exchangeRate: number | undefined;
      if (currency === 'USD' && exchangeRates) exchangeRate = exchangeRates.usd;
      if (currency === 'EUR' && exchangeRates) exchangeRate = exchangeRates.eur;
      const { data } = await api.post('/admin/materials/save-bulk', { brandId: uploadBrandId, priceListId: pl.id, items, exchangeRate });
      setSaveResult({ imported: data.imported, brandName: data.brandName, listName: data.priceListName });
      setPreviewRows([]);
      toast({ title: 'Kaydedildi', description: `${data.imported} malzeme "${data.priceListName}" listesine eklendi.` });
      await fetchBrands();
    } catch (err: any) { toast({ title: 'Hata', description: err?.response?.data?.message || 'Kayıt hatası.', variant: 'destructive' }); }
    finally { setSaveLoading(false); }
  }

  function updateRow(key: string, field: string, value: string) {
    setPreviewRows(prev => prev.map(r => { if (r._key !== key) return r; if (field === 'unitPrice') return { ...r, unitPrice: parseFloat(value) || 0 }; return { ...r, [field]: value }; }));
  }
  function removeRow(key: string) { setPreviewRows(prev => prev.filter(r => r._key !== key)); }

  const uploadBrand = brands.find(b => b.id === uploadBrandId);

  /* ── Render ── */

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Malzeme Havuzu</h1>
            <p className="mt-1 text-sm text-muted-foreground">Markaya tıklayarak fiyat listelerini görüntüleyin</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />Marka Ekle</Button>
          )}
        </div>
      </div>

      {/* Discipline Navigation — Kutuphanem ile ayni tasarim */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/materials/mechanical" className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-6 text-sm font-medium transition-all hover:border-primary hover:bg-primary/5 hover:shadow-md">
          <FolderOpen className="h-8 w-8 text-primary" />
          <span className="text-base font-semibold">Mekanik Havuz</span>
          <span className="text-xs text-muted-foreground">Mekanik malzeme fiyat listeleri</span>
        </Link>
        <Link href="/materials/electrical" className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-6 text-sm font-medium transition-all hover:border-amber-500 hover:bg-amber-50 hover:shadow-md">
          <FolderOpen className="h-8 w-8 text-amber-500" />
          <span className="text-base font-semibold">Elektrik Havuz</span>
          <span className="text-xs text-muted-foreground">Elektrik malzeme fiyat listeleri</span>
        </Link>
      </div>



      {/* ── Add Brand Dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Marka Ekle</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Marka Adı</Label>
            <Input value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} placeholder="Örn: Schneider, ECA..." onKeyDown={(e) => { if (e.key === 'Enter') handleAddBrand(); }} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>İptal</Button>
            <Button onClick={handleAddBrand} disabled={addLoading || !newBrandName.trim()}>{addLoading ? 'Ekleniyor...' : 'Ekle'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PDF Upload Dialog ── */}
      <Dialog open={!!uploadBrandId} onOpenChange={(open) => { if (!open) { setUploadBrandId(null); setPreviewRows([]); setSaveResult(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{uploadBrand?.name} — Fiyat Listesi Yükle</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">

            {aiConfigured === false && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-700 dark:bg-amber-950/30">
                <p className="font-medium text-amber-800">AI sağlayıcı ayarlanmamış</p>
                <Link href="/admin" className="text-amber-700 underline">Sistem Yönetimi → AI Ayarları</Link>
              </div>
            )}

            {/* Step 1: Liste adı + PDF */}
            {previewRows.length === 0 && !saveResult && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Liste Adı (opsiyonel — boş bırakılırsa otomatik oluşturulur)</Label>
                  <Input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="Örn: Nisan 2026 Güncel Katalog" className="text-sm" />
                </div>

                <label htmlFor="brand-pdf" className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:border-primary hover:bg-muted/50 ${pdfFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}`}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/5'); }}
                  onDragLeave={(e) => { e.preventDefault(); if (!pdfFile) e.currentTarget.classList.remove('border-primary', 'bg-primary/5'); }}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f?.type === 'application/pdf') setPdfFile(f); else toast({ title: 'Hata', description: 'Sadece PDF.', variant: 'destructive' }); }}
                >
                  <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium">{pdfFile ? pdfFile.name : 'PDF sürükleyin veya tıklayın'}</span>
                  <input id="brand-pdf" type="file" accept=".pdf" className="sr-only" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
                </label>

                <Button onClick={handlePdfExtract} disabled={pdfLoading || !pdfFile} className="w-full">
                  {pdfLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />AI ile analiz ediliyor...</> : <><Upload className="mr-2 h-4 w-4" />PDF'i Analiz Et</>}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Excel yuklemek icin marka detay sayfasina gidin.
                </p>

                {pdfLoading && (
                  <div className="space-y-2">
                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground"><span>Yükleniyor...</span><span>{uploadProgress}%</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} /></div>
                      </div>
                    )}
                    {(uploadProgress >= 100 || uploadProgress === 0) && (
                      <div className="space-y-2 rounded-lg border bg-muted/50 px-4 py-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            AI analiz ediyor...
                          </span>
                          <span className="font-mono font-medium text-foreground">{remainingTime()}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all duration-1000" style={{ width: `${progressPercent()}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Step 2: Preview */}
            {previewRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">{previewRows.length} malzeme — &quot;{listName}&quot;</p>{usedProvider && <p className="text-xs text-muted-foreground">AI: {usedProvider}</p>}</div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Döviz:</Label>
                    <Select value={currency} onValueChange={(v) => setCurrency(v as 'TRY' | 'USD' | 'EUR')}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TRY">₺ TRY</SelectItem>
                        <SelectItem value="USD">$ USD {exchangeRates ? `(₺${exchangeRates.usd.toFixed(2)})` : ''}</SelectItem>
                        <SelectItem value="EUR">€ EUR {exchangeRates ? `(₺${exchangeRates.eur.toFixed(2)})` : ''}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="max-h-[350px] overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/95 backdrop-blur"><tr className="border-b">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Malzeme Adı</th>
                      <th className="w-24 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Birim</th>
                      <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Fiyat</th>
                      <th className="w-10" />
                    </tr></thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={row._key} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-1 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1"><Input value={row.materialName} onChange={(e) => updateRow(row._key, 'materialName', e.target.value)} className="h-7 text-xs" /></td>
                          <td className="px-3 py-1"><Input value={row.unit} onChange={(e) => updateRow(row._key, 'unit', e.target.value)} className="h-7 text-xs" /></td>
                          <td className="px-3 py-1"><Input type="number" step="0.01" value={row.unitPrice} onChange={(e) => updateRow(row._key, 'unitPrice', e.target.value)} className="h-7 text-right text-xs" /></td>
                          <td className="px-3 py-1 text-center"><button type="button" onClick={() => removeRow(row._key)} className="text-muted-foreground hover:text-destructive">&times;</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setPreviewRows([])} className="flex-1">İptal</Button>
                  <Button onClick={handleSavePreview} disabled={saveLoading} className="flex-1">
                    {saveLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Kaydediliyor...</> : <>Onayla ve Kaydet ({previewRows.length})</>}
                  </Button>
                </div>
              </div>
            )}

            {/* Result */}
            {saveResult && (
              <div className="rounded-lg border bg-green-50 p-4 dark:bg-green-950/20">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">{saveResult.imported} malzeme &quot;{saveResult.brandName} / {saveResult.listName}&quot; listesine eklendi</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSaveResult(null); setPdfFile(null); setListName(''); }}>Yeni Liste Yükle</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
