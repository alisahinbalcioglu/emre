'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2, Wrench, Zap, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { useCapabilities } from '@/contexts/CapabilitiesContext';

interface LaborFirm {
  id: string;
  name: string;
  discipline: 'mechanical' | 'electrical';
  logo: string | null;
  createdAt: string;
  _count: { priceLists: number; laborPrices: number };
}

export default function LaborFirmsPage() {
  const searchParams = useSearchParams();
  const disciplineFilter = searchParams.get('discipline') as 'mechanical' | 'electrical' | null;

  const { capabilities, loading: capLoading } = useCapabilities();
  const [firms, setFirms] = useState<LaborFirm[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDiscipline, setNewDiscipline] = useState<'mechanical' | 'electrical'>(disciplineFilter ?? 'mechanical');

  const canMechLabor = capabilities.mechanical.labor;
  const canElecLabor = capabilities.electrical.labor;
  const hasAnyLabor = canMechLabor || canElecLabor;

  // URL filter'a gore listeyi daralt
  const visibleFirms = disciplineFilter
    ? firms.filter((f) => f.discipline === disciplineFilter)
    : firms;

  const pageTitle = disciplineFilter === 'mechanical'
    ? 'Mekanik Iscilik Firmalarim'
    : disciplineFilter === 'electrical'
      ? 'Elektrik Iscilik Firmalarim'
      : 'Iscilik Firmalarim';

  useEffect(() => {
    fetchFirms();
  }, []);

  // Capability'ye gore default discipline (URL filter varsa onu kullan)
  useEffect(() => {
    if (disciplineFilter) {
      setNewDiscipline(disciplineFilter);
    } else if (canMechLabor) {
      setNewDiscipline('mechanical');
    } else if (canElecLabor) {
      setNewDiscipline('electrical');
    }
  }, [canMechLabor, canElecLabor, disciplineFilter]);

  async function fetchFirms() {
    try {
      const { data } = await api.get<LaborFirm[]>('/labor-firms');
      setFirms(data);
    } catch {
      toast({ title: 'Firmalar yuklenemedi', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function createFirm() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post<LaborFirm>('/labor-firms', {
        name: newName.trim(),
        discipline: newDiscipline,
      });
      setFirms((prev) => [...prev, { ...data, _count: { priceLists: 0, laborPrices: 0 } }]);
      setNewName('');
      toast({ title: 'Firma eklendi', description: data.name });
    } catch (e: any) {
      toast({ title: 'Hata', description: e?.response?.data?.message ?? 'Eklenemedi', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  async function deleteFirm(firm: LaborFirm) {
    if (!confirm(`"${firm.name}" silinsin mi? Tum fiyat listeleri de silinecek.`)) return;
    try {
      await api.delete(`/labor-firms/${firm.id}`);
      setFirms((prev) => prev.filter((f) => f.id !== firm.id));
      toast({ title: 'Silindi' });
    } catch {
      toast({ title: 'Hata', variant: 'destructive' });
    }
  }

  if (capLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAnyLabor) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-4">{pageTitle}</h1>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-lg font-medium text-muted-foreground mb-2">
              Iscilik ozelligi icin Pro paket gerekli
            </p>
            <p className="text-sm text-muted-foreground">
              Iscilik fiyatlandirmasi yapabilmek icin Pro Mekanik veya Pro Elektrik paketine sahip olmaniz gerekir.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Disciplin filter aktifse ve kullanicinin o disiplinde labor capability yoksa engelle
  if (disciplineFilter === 'mechanical' && !canMechLabor) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-4">{pageTitle}</h1>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Mekanik iscilik icin Pro Mekanik paketi gerekli.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (disciplineFilter === 'electrical' && !canElecLabor) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-4">{pageTitle}</h1>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Elektrik iscilik icin Pro Elektrik paketi gerekli.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Iscilik kalemleri icin firma ekleyin ve fiyat listelerini yukleyiniz.
        </p>
      </div>

      {/* Yeni firma ekleme */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-muted-foreground mb-1">Firma Adi</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="orn. Ahmet Tesisat"
                onKeyDown={(e) => e.key === 'Enter' && createFirm()}
              />
            </div>
            {!disciplineFilter && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Disiplin</label>
                <select
                  value={newDiscipline}
                  onChange={(e) => setNewDiscipline(e.target.value as any)}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  {canMechLabor && <option value="mechanical">🔧 Mekanik</option>}
                  {canElecLabor && <option value="electrical">⚡ Elektrik</option>}
                </select>
              </div>
            )}
            <Button onClick={createFirm} disabled={creating || !newName.trim()}>
              <Plus className="mr-1.5 h-4 w-4" />
              Firma Ekle
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Firma listesi */}
      {visibleFirms.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Henuz firma yok. Yukaridan ilk firmanizi ekleyin.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleFirms.map((firm) => (
            <Card key={firm.id} className="group hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {firm.discipline === 'mechanical' ? (
                      <Wrench className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Zap className="h-4 w-4 text-amber-600" />
                    )}
                    <h3 className="font-semibold">{firm.name}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive opacity-0 group-hover:opacity-100"
                    onClick={() => deleteFirm(firm)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  <span>{firm._count.priceLists} liste</span>
                  <span>·</span>
                  <span>{firm._count.laborPrices} kalem</span>
                </div>
                <Link
                  href={`/labor-firms/${firm.id}`}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  Yonet <ArrowRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
