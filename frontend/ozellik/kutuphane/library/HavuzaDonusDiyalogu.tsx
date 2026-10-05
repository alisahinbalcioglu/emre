'use client';

// «Havuz fiyatına dön» seçim penceresi (P4b Parti 3, 05.10.2026) — kural ve
// gerekçe `ozellik/kutuphane/havuza-donus.ts`. Pencere yalnız SEÇİMİ toplar;
// istekleri sayfa atar (liste yenileme ve bildirim sayfanın işi).

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/ortak/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ortak/ui/dialog';
import { HAVUZA_DON_EYLEMI } from '@/ozellik/tablo/excel-grid/isaret';
import type { HavuzaDonusAdayi } from '@/ozellik/kutuphane/havuza-donus';

interface Props {
  acik: boolean;
  adaylar: HavuzaDonusAdayi[];
  calisiyor: boolean;
  onKapat: () => void;
  onOnayla: (idler: string[]) => void;
}

export function HavuzaDonusDiyalogu({ acik, adaylar, calisiyor, onKapat, onOnayla }: Props) {
  const [secili, setSecili] = useState<ReadonlySet<string>>(new Set());
  // Her açılışta seçim BOŞ başlar: hangi özel fiyatın gideceği kullanıcının kararı.
  // Kapanışta sıfırlanır — açılışta sıfırlamak bir kare eski seçimi gösterirdi.
  useEffect(() => { if (!acik) setSecili(new Set()); }, [acik]);

  const hepsi = adaylar.length > 0 && adaylar.every((a) => secili.has(a.id));
  const kismen = !hepsi && secili.size > 0;
  const degistir = (id: string) => setSecili((onceki) => {
    const yeni = new Set(onceki);
    if (yeni.has(id)) yeni.delete(id); else yeni.add(id);
    return yeni;
  });

  return (
    <Dialog open={acik} onOpenChange={(o) => { if (!o && !calisiyor) onKapat(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{HAVUZA_DON_EYLEMI}</DialogTitle>
          <DialogDescription>
            Seçtiğiniz satırların özel fiyatı silinir; satır havuzun liste fiyatını kendi para biriminde
            gösterir ve sonraki havuz güncellemelerini izler. İskonto değişmez.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label="Tümünü seç"
                    className="h-4 w-4"
                    checked={hepsi}
                    ref={(el) => { if (el) el.indeterminate = kismen; }}
                    disabled={calisiyor}
                    onChange={() => setSecili(hepsi ? new Set() : new Set(adaylar.map((a) => a.id)))}
                  />
                </th>
                <th className="px-2 py-2">Malzeme</th>
                <th className="px-2 py-2 text-right">Özel fiyat</th>
                <th className="px-2 py-2 text-right">Havuz liste fiyatı</th>
              </tr>
            </thead>
            <tbody>
              {adaylar.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`${a.ad}${a.ayrinti ? ` (${a.ayrinti})` : ''} seç`}
                      className="h-4 w-4"
                      checked={secili.has(a.id)}
                      disabled={calisiyor}
                      onChange={() => degistir(a.id)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {a.ad}
                    {a.birimFarkli && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        farklı para birimi
                      </span>
                    )}
                    {a.ayrinti && <div className="text-xs text-muted-foreground">{a.ayrinti}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.ozel}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.havuz}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onKapat} disabled={calisiyor}>Vazgeç</Button>
          <Button size="sm" onClick={() => onOnayla(Array.from(secili))} disabled={calisiyor || secili.size === 0}>
            {calisiyor
              ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Dönülüyor...</>
              : `Seçilenleri havuz fiyatına döndür (${secili.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
