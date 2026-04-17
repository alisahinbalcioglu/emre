'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2, Wrench, Loader2, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface LaborItem {
  id: string;
  name: string;
  unit: string;
  unitPrice: number;
  discipline: 'mechanical' | 'electrical';
  category: string | null;
  description: string | null;
}

type Discipline = 'mechanical' | 'electrical';

const DISC_LABELS: Record<Discipline, string> = {
  mechanical: 'Mekanik',
  electrical: 'Elektrik',
};

function fmt(v: number) {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function LaborLibraryPage() {
  const searchParams = useSearchParams();
  const urlDiscipline = searchParams.get('discipline') as Discipline | null;

  const [items, setItems] = useState<LaborItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeDiscipline, setActiveDiscipline] = useState<Discipline>(urlDiscipline ?? 'mechanical');

  // URL değişince discipline'ı güncelle
  useEffect(() => {
    if (urlDiscipline && urlDiscipline !== activeDiscipline) {
      setActiveDiscipline(urlDiscipline);
    }
  }, [urlDiscipline]);

  // Form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LaborItem | null>(null);
  const [form, setForm] = useState({ name: '', unit: 'Adet', unitPrice: '', discipline: 'mechanical' as Discipline, category: '', description: '' });
  const [isSaving, setIsSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get<LaborItem[]>(`/labor?discipline=${activeDiscipline}`);
      setItems(data);
    } catch {
      toast({ title: 'Hata', description: 'İşçilik kalemleri yüklenemedi.', variant: 'destructive' });
    } finally { setIsLoading(false); }
  }, [activeDiscipline]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function openAddDialog() {
    setEditingItem(null);
    setForm({ name: '', unit: 'Adet', unitPrice: '', discipline: activeDiscipline, category: '', description: '' });
    setDialogOpen(true);
  }

  function openEditDialog(item: LaborItem) {
    setEditingItem(item);
    setForm({
      name: item.name,
      unit: item.unit,
      unitPrice: String(item.unitPrice),
      discipline: item.discipline,
      category: item.category ?? '',
      description: item.description ?? '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.unitPrice) {
      toast({ title: 'Uyarı', description: 'Ad ve fiyat zorunlu.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const payload = { ...form, unitPrice: parseFloat(form.unitPrice) };
      if (editingItem) {
        await api.put(`/labor/${editingItem.id}`, payload);
        toast({ title: 'Güncellendi' });
      } else {
        await api.post('/labor', payload);
        toast({ title: 'Eklendi' });
      }
      setDialogOpen(false);
      await fetchItems();
    } catch { toast({ title: 'Hata', variant: 'destructive' }); }
    finally { setIsSaving(false); }
  }

  async function handleDelete(item: LaborItem) {
    if (!window.confirm(`"${item.name}" silinsin mi?`)) return;
    try {
      await api.delete(`/labor/${item.id}`);
      toast({ title: 'Silindi' });
      await fetchItems();
    } catch { toast({ title: 'Hata', variant: 'destructive' }); }
  }

  // Kategoriye göre grupla
  const grouped = items.reduce<Record<string, LaborItem[]>>((acc, item) => {
    const cat = item.category || 'Genel';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div>
      <Link href="/library" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Kutuphanem
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {activeDiscipline === 'mechanical' ? <Wrench className="h-6 w-6" /> : <Zap className="h-6 w-6" />}
            {DISC_LABELS[activeDiscipline]} Iscilik
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{DISC_LABELS[activeDiscipline]} iscilik birim fiyatlarinizi yonetin</p>
        </div>
        <Button onClick={openAddDialog}><Plus className="mr-2 h-4 w-4" />Kalem Ekle</Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20">
          <Wrench className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{DISC_LABELS[activeDiscipline]} işçilik kalemi henüz eklenmemiş.</p>
          <Button variant="outline" className="mt-4" onClick={openAddDialog}><Plus className="mr-2 h-4 w-4" />İlk Kalemi Ekle</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, catItems]) => (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground">{category} ({catItems.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">İşçilik Adı</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Birim</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Birim Fiyat</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catItems.map((item, i) => (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2 font-medium">{item.name}</td>
                        <td className="px-4 py-2">{item.unit}</td>
                        <td className="px-4 py-2 text-right font-medium">₺{fmt(item.unitPrice)}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(item)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(item)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingItem ? 'Kalemi Düzenle' : 'Yeni İşçilik Kalemi'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">İşçilik Adı</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Boru montaj, kablo çekimi..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Birim</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Birim Fiyat (₺)</Label>
                <Input type="number" min={0} step={0.01} value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Disiplin</Label>
                <Select value={form.discipline} onValueChange={(v) => setForm({ ...form, discipline: v as Discipline })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mechanical">Mekanik</SelectItem>
                    <SelectItem value="electrical">Elektrik</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Boru Montaj, Kablo..." />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editingItem ? 'Güncelle' : 'Ekle'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
