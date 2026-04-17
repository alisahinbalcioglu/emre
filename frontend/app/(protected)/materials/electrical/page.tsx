'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap, Loader2, Search, BookmarkPlus, Trash2, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface Brand { id: string; name: string; logoUrl?: string | null; _count?: { priceLists: number; materialPrices: number } }

function getRole(): string | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('user') || '{}').role ?? null; } catch { return null; }
}

export default function ElectricalPoolPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isAdmin = getRole() === 'admin';

  const [addOpen, setAddOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const fetchBrands = useCallback(() => {
    api.get<Brand[]>('/brands?discipline=electrical').then(({ data }) => setBrands(data))
      .catch(() => toast({ title: 'Hata', variant: 'destructive' })).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  async function handleAddBrand() {
    const trimmed = newBrandName.trim();
    if (!trimmed) return;
    setAddLoading(true);
    try {
      await api.post('/brands', { name: trimmed, discipline: 'electrical' });
      toast({ title: 'Marka eklendi', description: trimmed });
      setAddOpen(false); setNewBrandName(''); fetchBrands();
    } catch { toast({ title: 'Hata', description: 'Marka eklenemedi.', variant: 'destructive' }); }
    finally { setAddLoading(false); }
  }

  async function handleDeleteBrand(brand: Brand) {
    if (!window.confirm(`"${brand.name}" ve tum fiyat listelerini silmek istediginize emin misiniz?`)) return;
    try {
      await api.delete(`/brands/${brand.id}`);
      toast({ title: 'Silindi', description: `"${brand.name}" basariyla kaldirildi.` });
      fetchBrands();
    } catch { toast({ title: 'Hata', description: 'Marka silinirken hata olustu.', variant: 'destructive' }); }
  }

  return (
    <div>
      <Link href="/materials" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Malzeme Havuzu
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-500" />Elektrik Havuz
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Elektrik tesisat malzeme markalari ve fiyat listeleri</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />Marka Ekle</Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Elektrik markalarda ara..." className="pl-9" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : brands.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20">
          <Zap className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Henuz elektrik markasi eklenmemis.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {brands.map((b) => {
            const initials = b.name.slice(0, 2).toUpperCase();
            return (
              <Card key={b.id} className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <CardContent className="flex flex-col p-0">
                  <Link href={`/materials/${b.id}`} className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 transition-transform group-hover:scale-105">
                      <span className="text-xl font-bold text-amber-400">{initials}</span>
                    </div>
                    <h3 className="text-sm font-semibold">{b.name}</h3>
                    <p className="text-[10px] text-muted-foreground">{b._count?.priceLists ?? 0} liste · {b._count?.materialPrices ?? 0} malzeme</p>
                  </Link>
                  <div className="border-t px-2 py-1.5 space-y-1">
                    {isAdmin && (
                      <Button variant="ghost" size="sm" className="h-7 w-full text-[11px] text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.preventDefault(); handleDeleteBrand(b); }}>
                        <Trash2 className="mr-1 h-3 w-3" />Kaldir
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-full text-[11px] text-primary hover:bg-primary/10"
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          const { data } = await api.get(`/brands/${b.id}/price-lists`);
                          const lists = data.priceLists;
                          if (!lists || lists.length === 0) { toast({ title: 'Liste yok', description: 'Bu markada fiyat listesi bulunamadi.' }); return; }
                          const res = await api.post('/library/import-price-list', { brandId: b.id, priceListId: lists[0].id });
                          toast({ title: 'Aktarildi', description: `${res.data.imported} malzeme kutuphanenize eklendi.` });
                        } catch { toast({ title: 'Hata', variant: 'destructive' }); }
                      }}>
                      <BookmarkPlus className="mr-1 h-3 w-3" />Kutuphaneme Aktar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Marka Ekle Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Elektrik Marka Ekle</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Marka Adi</Label>
            <Input value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} placeholder="Orn: Schneider, Legrand..." onKeyDown={(e) => { if (e.key === 'Enter') handleAddBrand(); }} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Iptal</Button>
            <Button onClick={handleAddBrand} disabled={addLoading || !newBrandName.trim()}>{addLoading ? 'Ekleniyor...' : 'Ekle'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
