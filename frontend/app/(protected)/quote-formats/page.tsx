'use client';

// ── PRD Teklif Formatim §4: format duzeyi (KALICI) yonetim ──
// Yukle → tarama onizlemesi (T3: bulunan/taninmayan yer tutucu listesi) ·
// varsayilan yap · dosya guncelle (T11: eski ciktilar etkilenmez) · sil ·
// ornek format indir. Teklif-bazli duzenleme AYRI katmandadir (T13 —
// /quotes/[id]/export onizlemesi), buradaki degisiklik SONRAKI tekliflere yansir.

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, FileText, Upload, Star, Trash2, Loader2, Download, Eye, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface YerTutucu { etiket: string; sheet: string; addr: string }
interface FormatKaydi {
  id: string;
  name: string;
  fileName: string;
  isDefault: boolean;
  createdAt: string;
  mapping?: { bulunan: YerTutucu[]; taninmayan: YerTutucu[] } | null;
}
interface OnizlemeSayfa {
  name: string;
  columnDefs: Array<{ field: string; headerName: string; width: number }>;
  rowData: Array<Record<string, any>>;
}

export default function QuoteFormatsPage() {
  const [formats, setFormats] = useState<FormatKaydi[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ name: string; mapping: FormatKaydi['mapping']; sheets: OnizlemeSayfa[] } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceHedef = useRef<string | null>(null);

  const fetchFormats = useCallback(async () => {
    try {
      const { data } = await api.get<FormatKaydi[]>('/quote-formats');
      setFormats(data);
    } catch {
      toast({ title: 'Formatlar yuklenemedi', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFormats(); }, [fetchFormats]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/quote-formats', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const b = data.mapping?.bulunan?.length ?? 0;
      const t = data.mapping?.taninmayan?.length ?? 0;
      toast({
        title: `Format yüklendi: ${data.name}`,
        description: `${b} yer tutucu bulundu${t > 0 ? ` · ⚠ ${t} tanınmayan etiket` : ''}`,
        variant: t > 0 ? 'destructive' : undefined,
      });
      await fetchFormats();
    } catch (err: any) {
      toast({ title: 'Yukleme hatasi', description: err?.response?.data?.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  async function handleReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = replaceHedef.current;
    if (!file || !id) return;
    e.target.value = '';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/quote-formats/${id}/file`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast({
        title: 'Format guncellendi',
        description: 'Yeni ciktilarda kullanilir — eski uretilmis dosyalar degismez.',
      });
      void data;
      await fetchFormats();
    } catch (err: any) {
      toast({ title: 'Guncelleme hatasi', description: err?.response?.data?.message, variant: 'destructive' });
    }
  }

  async function setDefault(id: string) {
    try {
      await api.patch(`/quote-formats/${id}`, { isDefault: true });
      await fetchFormats();
      toast({ title: 'Varsayilan format guncellendi' });
    } catch {
      toast({ title: 'Hata', variant: 'destructive' });
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`"${name}" format silinsin mi? (Uretilmis eski ciktilar etkilenmez)`)) return;
    try {
      await api.delete(`/quote-formats/${id}`);
      await fetchFormats();
      toast({ title: 'Silindi' });
    } catch {
      toast({ title: 'Hata', variant: 'destructive' });
    }
  }

  async function openPreview(f: FormatKaydi) {
    try {
      const { data } = await api.get(`/quote-formats/${f.id}/preview`);
      setPreview({ name: f.name, mapping: data.mapping, sheets: data.sheets ?? [] });
    } catch {
      toast({ title: 'Onizleme yuklenemedi', variant: 'destructive' });
    }
  }

  async function downloadSample() {
    try {
      const response = await api.get('/quote-formats/sample', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MetaPrice-Ornek-Teklif-Formati.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Ornek indirilemedi', variant: 'destructive' });
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/library" className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Kutuphanem
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Teklif Formatlarım</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Kendi kapak + icmal sablonunuz (.xlsx). Yer tutucular ({'{{MUSTERI}}'} gibi) cikti aninda otomatik dolar.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadSample}>
              <Download className="mr-1 h-4 w-4" />Ornek Format Indir
            </Button>
            <input ref={uploadRef} type="file" accept=".xlsx" onChange={handleUpload} className="hidden" />
            <Button size="sm" onClick={() => uploadRef.current?.click()} disabled={uploading}>
              {uploading
                ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Yukleniyor...</>
                : <><Upload className="mr-1 h-4 w-4" />Format Yukle</>}
            </Button>
          </div>
        </div>
      </div>

      <input ref={replaceRef} type="file" accept=".xlsx" onChange={handleReplace} className="hidden" />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : formats.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <FileText className="mb-3 h-12 w-12 text-muted-foreground" />
            <p className="font-medium text-muted-foreground">Henuz format yuklemediniz.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Format yuklemezseniz ciktilar MetaPrice&apos;in sade varsayilan kapak+icmaliyle uretilir.
              Ornegi indirip kendi tasariminizla degistirin.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {formats.map((f) => {
            const b = f.mapping?.bulunan?.length ?? 0;
            const t = f.mapping?.taninmayan?.length ?? 0;
            return (
              <Card key={f.id} className={f.isDefault ? 'border-emerald-400' : ''}>
                <CardContent className="p-4">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-emerald-600" />
                      <span className="font-semibold">{f.name}</span>
                    </div>
                    {f.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <Star className="h-3 w-3" />Varsayilan
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{f.fileName} · {new Date(f.createdAt).toLocaleDateString('tr-TR')}</p>
                  <p className="mt-2 text-xs">
                    <span className="text-emerald-700">{b} yer tutucu</span>
                    {t > 0 && <span className="ml-2 text-amber-600">⚠ {t} taninmayan etiket</span>}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => openPreview(f)}>
                      <Eye className="mr-1 h-3 w-3" />Onizle
                    </Button>
                    {!f.isDefault && (
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setDefault(f.id)}>
                        <Star className="mr-1 h-3 w-3" />Varsayilan Yap
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                      onClick={() => { replaceHedef.current = f.id; replaceRef.current?.click(); }}>
                      <Upload className="mr-1 h-3 w-3" />Guncelle
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => remove(f.id, f.name)}>
                      <Trash2 className="mr-1 h-3 w-3" />Sil
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Onizleme modali: tarama sonucu (T3) + sayfalarin basit tablosu */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b p-3">
              <h2 className="font-bold">{preview.name} — Onizleme</h2>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="overflow-auto p-4">
              <div className="mb-4 flex flex-wrap gap-1.5">
                {(preview.mapping?.bulunan ?? []).map((y, i) => (
                  <span key={i} className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                    {`{{${y.etiket}}}`} · {y.sheet}!{y.addr}
                  </span>
                ))}
                {(preview.mapping?.taninmayan ?? []).map((y, i) => (
                  <span key={`t${i}`} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                    title="Taninmayan etiket — doldurulmaz, hucre oldugu gibi kalir">
                    ⚠ {`{{${y.etiket}}}`} · {y.sheet}!{y.addr}
                  </span>
                ))}
              </div>
              {preview.sheets.map((s) => (
                <div key={s.name} className="mb-5">
                  <h3 className="mb-1 text-sm font-semibold">{s.name}</h3>
                  <div className="overflow-x-auto rounded border">
                    <table className="text-xs">
                      <tbody>
                        {s.rowData.slice(0, 30).map((r, ri) => (
                          <tr key={ri} className="border-b last:border-0">
                            {s.columnDefs.map((c) => (
                              <td key={c.field} className="whitespace-nowrap px-2 py-1" style={{ minWidth: 60 }}>
                                {String(r[c.field] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
