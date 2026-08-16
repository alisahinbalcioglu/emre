'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2, Wrench, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/ortak/ui/button';
import { GeriButonu } from '@/ortak/ui/geri-butonu';
import { Card, CardContent } from '@/ortak/ui/card';
import { Input } from '@/ortak/ui/input';
import api from '@/ortak/lib/api';
import { toast } from '@/ortak/hooks/use-toast';
import { confirm } from '@/ortak/hooks/use-confirm';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';

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

  /**
   * GERI — ortak bilesen (`ortak/ui/geri-butonu`). Gecmiste bir adim geri
   * gider; gecmis yoksa `hedef`e duser.
   *
   * ⚠ Bu sayfanin DORT cikis dali var (Pro yok · mekanik Pro yok · elektrik
   * Pro yok · normal). Baglanti hepsinde bulunmali — yalniz normal dala
   * konsaydi Pro engeline dusen kullanici ekranda KILITLI kalirdi.
   */
  const GeriBaglantisi = () => <GeriButonu hedef="/library" />;

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
    if (!(await confirm({ title: `"${firm.name}" silinsin mi?`, description: 'Tüm fiyat listeleri de silinecek.' }))) return;
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
        <GeriBaglantisi />
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
        <GeriBaglantisi />
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
        <GeriBaglantisi />
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
      <GeriBaglantisi />
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
        /* KART DUZENI = KUTUPHANE MARKA KARTLARI (14.08 kullanici istegi).
           Izgara, kare oran, bas-harf rozeti ve hover davranisi
           `library/mechanical-brands` ile BIREBIR ayni — iki liste ayni ise
           yariyor (bir varligi acip yonetmek), farkli gorunmeleri icin sebep
           yoktu.
           ⚠ SILME KORUNDU: marka kartinda silme yok, iscilikte VAR. Buton
           Link'in ICINE konsaydi tiklama kart navigasyonuyla cakisirdi —
           bu yuzden Link disinda, sarmalayicida `absolute` duruyor. */
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visibleFirms.map((firm) => {
            const basHarf = firm.name.slice(0, 2).toLocaleUpperCase('tr');
            return (
              <div key={firm.id} className="group relative">
                <Link href={`/labor-firms/${firm.id}`}>
                  <Card className="cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <CardContent className="flex aspect-square flex-col items-center justify-center gap-2 p-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-muted bg-gradient-to-br from-slate-50 to-slate-100 transition-transform group-hover:scale-105">
                        <span className="text-xl font-bold text-slate-400">{basHarf}</span>
                      </div>
                      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                        {firm.discipline === 'mechanical' ? (
                          <Wrench className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                        ) : (
                          <Zap className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        )}
                        {firm.name}
                      </h3>
                      <p className="text-[10px] text-muted-foreground">
                        {firm._count.priceLists} liste · {firm._count.laborPrices} kalem
                      </p>
                    </CardContent>
                  </Card>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Firmayı sil"
                  className="absolute right-1.5 top-1.5 h-7 w-7 p-0 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => deleteFirm(firm)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
