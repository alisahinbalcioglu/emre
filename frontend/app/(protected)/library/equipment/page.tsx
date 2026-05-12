'use client';

/**
 * Ekipman & Sarf Kütüphanesi
 *
 * Kombi, pompa, vana gibi ekipman/sarf malzemelerini önceden tanımlama sayfası.
 * DWG çizimde bir INSERT (ekipman) noktasına tıklandığında bu listeden seçim
 * yapılır — seçilen ekipmanın güç/kapasite/fiyat bilgileri otomatik olarak
 * hesaplamaya dahil edilir.
 *
 * UserLibrary.category = 'ekipman' filtresi ile çekilir.
 * UserLibrary.specs JSON alanında serbest key-value teknik bilgi tutulur
 * (örn. { "Güç": "24 kW", "Kapasite": "100 m³/h" }).
 */

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, ArrowLeft, X, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';

interface Brand {
  id: string;
  name: string;
}

interface EquipmentItem {
  id: string;
  materialName: string;
  brandId?: string;
  brand?: Brand;
  customPrice?: number;
  listPrice?: number;
  unit?: string;
  specs?: Record<string, string> | null;
  category?: string | null;
}

interface SpecRow {
  key: string;
  value: string;
}

interface FormState {
  materialName: string;
  brandId: string;
  listPrice: string;
  unit: string;
  specs: SpecRow[];
}

const INITIAL_FORM: FormState = {
  materialName: '',
  brandId: '',
  listPrice: '',
  unit: 'adet',
  specs: [{ key: '', value: '' }],
};

// Hızlı eklenebilen yaygın spec'ler — preset chip'ler
const SPEC_PRESETS = ['Güç', 'Kapasite', 'Voltaj', 'Akım', 'Debi', 'Basma yüksekliği', 'Çap'];

export default function EquipmentLibraryPage() {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [eqRes, brandRes] = await Promise.all([
        api.get<EquipmentItem[]>('/library/equipment'),
        api.get<Brand[]>('/brands'),
      ]);
      setItems(eqRes.data);
      setBrands(brandRes.data);
    } catch {
      toast({ title: 'Hata', description: 'Liste alinamadi.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function openAddDialog() {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setDialogOpen(true);
  }

  function openEditDialog(item: EquipmentItem) {
    setEditingId(item.id);
    const specRows: SpecRow[] = item.specs
      ? Object.entries(item.specs).map(([key, value]) => ({ key, value: String(value) }))
      : [{ key: '', value: '' }];
    if (specRows.length === 0) specRows.push({ key: '', value: '' });
    setForm({
      materialName: item.materialName ?? '',
      brandId: item.brandId ?? '',
      listPrice: (item.customPrice ?? item.listPrice ?? '').toString(),
      unit: item.unit ?? 'adet',
      specs: specRows,
    });
    setDialogOpen(true);
  }

  function addSpecRow(presetKey?: string) {
    setForm((prev) => ({
      ...prev,
      specs: [...prev.specs, { key: presetKey ?? '', value: '' }],
    }));
  }

  function removeSpecRow(idx: number) {
    setForm((prev) => ({
      ...prev,
      specs: prev.specs.filter((_, i) => i !== idx),
    }));
  }

  function updateSpecRow(idx: number, field: 'key' | 'value', val: string) {
    setForm((prev) => ({
      ...prev,
      specs: prev.specs.map((s, i) => (i === idx ? { ...s, [field]: val } : s)),
    }));
  }

  async function handleSubmit() {
    const name = form.materialName.trim();
    if (!name) {
      toast({ title: 'Uyari', description: 'Malzeme adi girin.', variant: 'destructive' });
      return;
    }
    if (!form.brandId) {
      toast({ title: 'Uyari', description: 'Marka secin.', variant: 'destructive' });
      return;
    }
    const price = form.listPrice.trim() ? Number(form.listPrice) : undefined;
    if (price !== undefined && (isNaN(price) || price < 0)) {
      toast({ title: 'Uyari', description: 'Fiyat 0 veya ustu olmali.', variant: 'destructive' });
      return;
    }

    // Specs object: bos key/value'lari filtrele
    const specsObj: Record<string, string> = {};
    for (const s of form.specs) {
      const k = s.key.trim();
      const v = s.value.trim();
      if (k && v) specsObj[k] = v;
    }

    const payload = {
      materialName: name,
      brandId: form.brandId,
      ...(price !== undefined ? { customPrice: price, listPrice: price } : {}),
      specs: Object.keys(specsObj).length > 0 ? specsObj : undefined,
      category: 'ekipman',
    };

    try {
      setSubmitting(true);
      if (editingId) {
        await api.put(`/library/${editingId}`, payload);
        toast({ title: 'Guncellendi', description: name });
      } else {
        await api.post('/library', payload);
        toast({ title: 'Eklendi', description: name });
      }
      setDialogOpen(false);
      await fetchAll();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Kaydedilemedi';
      toast({ title: 'Hata', description: Array.isArray(msg) ? msg.join(', ') : msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(item: EquipmentItem) {
    if (!window.confirm(`"${item.materialName}" silinsin mi?`)) return;
    try {
      await api.delete(`/library/${item.id}`);
      toast({ title: 'Silindi', description: item.materialName });
      await fetchAll();
    } catch {
      toast({ title: 'Hata', description: 'Silinemedi.', variant: 'destructive' });
    }
  }

  function formatPrice(v?: number | null) {
    if (v == null) return '-';
    return `₺${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/library"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            title="Kutuphaneye don"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Wrench className="h-6 w-6 text-amber-500" />
              Ekipman & Sarf Malzemeleri
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Kombi, pompa, vana gibi ekipmanları önceden tanımlayın. DWG çizimde
              tıklayınca buradan seçilir, güç/kapasite/fiyat bilgileri otomatik
              hesaplamaya eklenir.
            </p>
          </div>
        </div>
        <Button onClick={openAddDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Yeni Ekipman
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-xl border bg-slate-50 p-8 text-center text-sm text-slate-500">
          Yukleniyor...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-slate-50 p-12 text-center">
          <Wrench className="mx-auto h-10 w-10 text-slate-400" />
          <p className="mt-3 text-sm font-medium text-slate-700">
            Henuz ekipman eklenmemis
          </p>
          <p className="mt-1 text-xs text-slate-500">
            DWG calismasinda ekipmanlari secebilmek icin once buraya kombi/pompa/vana
            gibi malzemeleri ekleyin (gucu, kapasitesi, fiyatiyla birlikte).
          </p>
          <Button onClick={openAddDialog} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Ilk Ekipmani Ekle
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Malzeme</th>
                <th className="px-4 py-3 text-left">Marka</th>
                <th className="px-4 py-3 text-left">Teknik Bilgi</th>
                <th className="px-4 py-3 text-right">Birim Fiyat</th>
                <th className="px-4 py-3 text-center w-24">Birim</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.materialName}</td>
                  <td className="px-4 py-3 text-slate-600">{item.brand?.name ?? '-'}</td>
                  <td className="px-4 py-3">
                    {item.specs && Object.keys(item.specs).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(item.specs).map(([k, v]) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 border border-amber-200"
                          >
                            <span className="font-medium">{k}:</span>
                            <span>{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-800">
                    {formatPrice(item.customPrice ?? item.listPrice)}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{item.unit ?? 'adet'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEditDialog(item)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                        title="Duzenle"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="rounded p-1.5 text-red-500 hover:bg-red-50"
                        title="Sil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Ekipmani Duzenle' : 'Yeni Ekipman Ekle'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Malzeme Adi *</Label>
                <Input
                  value={form.materialName}
                  onChange={(e) => setForm({ ...form, materialName: e.target.value })}
                  placeholder="orn: Kombi Yogusmali 24kW"
                />
              </div>
              <div>
                <Label className="text-xs">Marka *</Label>
                <Select
                  value={form.brandId}
                  onValueChange={(v) => setForm({ ...form, brandId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Marka secin" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Liste Fiyati (₺)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.listPrice}
                  onChange={(e) => setForm({ ...form, listPrice: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label className="text-xs">Birim</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="adet, set, m, kg..."
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Teknik Bilgi (Guc, Kapasite vs.)</Label>
                <div className="flex flex-wrap gap-1">
                  {SPEC_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => addSpecRow(p)}
                      className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 border border-amber-200 hover:bg-amber-100"
                    >
                      + {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2 rounded-lg border bg-slate-50 p-2">
                {form.specs.map((s, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      placeholder="Ozellik adi (orn. Guc)"
                      value={s.key}
                      onChange={(e) => updateSpecRow(idx, 'key', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Deger (orn. 24 kW)"
                      value={s.value}
                      onChange={(e) => updateSpecRow(idx, 'value', e.target.value)}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeSpecRow(idx)}
                      className="rounded p-1.5 text-slate-400 hover:text-red-500"
                      title="Sil"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addSpecRow()}
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Bos satir ekle
                </button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Iptal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : editingId ? 'Guncelle' : 'Ekle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
