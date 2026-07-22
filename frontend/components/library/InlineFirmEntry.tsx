'use client';

// ── İşçilik BOŞ FİRMA satır-içi giriş grid'i ──
// Kullanıcı kararı (22.07): her yeni/boş işçilik firma sayfasında "Henüz fiyat
// listesi yok" yerine DOĞRUDAN sabit-format tablo gelir. Format + kayıt mantığı
// ManualFirmModal ile TEK KAYNAK (buildBlankFirmGrid / buildFirmSaveItems).
// Kütüphane modu → İskonto% + Net Fiyat (malzeme listesiyle aynı). save-bulk
// kalemleri oluşturur + indeksler (L2), eşleştirme buradan çalışır.

import { useCallback, useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import type { ExcelGridData, ExcelRowData } from '@/components/excel-grid/types';
import { buildBlankFirmGrid, buildFirmSaveItems } from './ManualFirmModal';

const EMPTY_BRANDS: any[] = [];

interface Props {
  firmaId: string;
  /** Kayıt başarılı → sayfa firma listesini yeniler (aktif liste grid'i açılır). */
  onSaved: () => void;
}

export default function InlineFirmEntry({ firmaId, onSaved }: Props) {
  const noBrandChange = useCallback(async () => null, []);
  const [saving, setSaving] = useState(false);
  // Lazy init — stabil referans (her render'da yeni grid = editor iptali).
  const [grid] = useState<ExcelGridData>(buildBlankFirmGrid);
  const [rows, setRows] = useState<ExcelRowData[]>(() => grid.rowData);

  async function handleSave() {
    const items = buildFirmSaveItems(rows);
    if (items.length === 0) {
      toast({ title: 'Kalem yok', description: 'En az bir satırda İşçilik Kalemi + Birim Fiyat girin.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post(`/labor-firms/${firmaId}/save-bulk`, { priceListId: 'auto', items });
      toast({ title: 'Kaydedildi', description: `${data.imported} kalem eklendi ("${data.priceListName}")` });
      onSaved();
    } catch (e: any) {
      toast({ title: 'Hata', description: e?.response?.data?.message ?? 'Kaydedilemedi.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Fiyat listesini buraya girin · Excel&apos;den kopyala-yapıştır · en alta yeni satır otomatik eklenir · yalnız İşçilik Kalemi + Birim Fiyat zorunlu
        </p>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? (
            <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Kaydediliyor...</>
          ) : (
            <><Save className="mr-1 h-3.5 w-3.5" />Kaydet</>
          )}
        </Button>
      </div>
      <ExcelGrid
        data={grid}
        brands={EMPTY_BRANDS}
        currencySymbol="₺"
        conversionRate={1}
        mode="library"
        libraryPriceField="laborUnitPriceField"
        autoAppendRow
        enableStructureEdit
        onBrandChange={noBrandChange}
        onRowDataChange={setRows}
      />
    </div>
  );
}
