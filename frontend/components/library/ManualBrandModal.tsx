'use client';

import { useEffect, useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import type { ExcelGridData, ExcelRowData } from '@/components/excel-grid/types';

// ── "Marka Ekle" / "Malzeme Ekle" bos tablosu — foto formatinin bos hali ──
// Sabit sema (ProductIndex 11 kolonuyla birebir). İskonto %/Net Fiyat kolonlari
// ExcelGrid library modu OTOMATIK ekler (canli hesap). autoAppendRow ile en alta
// hep bos satir; Excel'den blok kopyala-yapistir destegi (library modu).
const MANUAL_COLUMNS: ExcelGridData['columnDefs'] = [
  { field: 'col0', headerName: 'No', width: 56, editable: false },
  { field: 'ad', headerName: 'Malzeme Adı', width: 340, editable: true },
  { field: 'cins', headerName: 'Cinsi', width: 150, editable: true },
  { field: 'baglanti', headerName: 'Bağlantı Şekli', width: 130, editable: true },
  { field: 'cap', headerName: 'Çap', width: 90, editable: true },
  { field: 'boy', headerName: 'Boy (mm)', width: 90, editable: true },
  { field: 'urunKodu', headerName: 'Ürün Kodu', width: 120, editable: true },
  { field: 'not', headerName: 'Not', width: 180, editable: true },
  { field: 'birim', headerName: 'Birim', width: 90, editable: true },
  { field: 'fiyat', headerName: 'Liste Fiyat', width: 120, editable: true },
];
const MANUAL_ROLES = { noField: 'col0', nameField: 'ad', unitField: 'birim', materialUnitPriceField: 'fiyat' };

function buildBlankManualGrid(dataRows = 30): ExcelGridData {
  const blank = (idx: number, spare = false): ExcelRowData => {
    const row: any = { _rowIdx: idx, _isDataRow: true, _isHeaderRow: false };
    if (spare) row._isSpareRow = true;
    for (const c of MANUAL_COLUMNS) if (!c.field.startsWith('_')) row[c.field] = '';
    return row;
  };
  const rowData: ExcelRowData[] = [];
  for (let i = 0; i < dataRows; i++) rowData.push(blank(i));
  rowData.push(blank(dataRows, true)); // en altta hep-bos spare satir
  return { columnDefs: MANUAL_COLUMNS, rowData, columnRoles: MANUAL_ROLES, brands: [], headerEndRow: 0 };
}

function trimOrU(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  return s === '' ? undefined : s;
}
function numOrU(v: unknown): number | undefined {
  // Excel'den yapistirinca TR bicimi gelebilir: "6.500,00" (nokta=binlik,
  // virgul=ondalik). Para sembolu/bosluk temizle, TR bicimini normalize et.
  let s = String(v ?? '').replace(/[₺$€\s]/g, '').trim();
  if (s === '') return undefined;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.'); // TR: nokta binlik, virgul ondalik
  else if (hasComma) s = s.replace(',', '.'); // yalniz virgul = ondalik
  // yalniz nokta / duz sayi: oldugu gibi (parseFloat)
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Kayit basarili → (brandId, eklenen adet). */
  onSaved: (brandId: string, created: number) => void;
  /** Dolu ise MEVCUT markaya EKLEME modu — marka adi kilitli. */
  lockedBrandName?: string;
  discipline?: 'mechanical' | 'electrical';
}

export default function ManualBrandModal({ open, onClose, onSaved, lockedBrandName, discipline = 'mechanical' }: Props) {
  const append = !!lockedBrandName;
  const [saving, setSaving] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [grid, setGrid] = useState<ExcelGridData | null>(null);
  const [rows, setRows] = useState<ExcelRowData[]>([]);

  useEffect(() => {
    if (open) {
      const g = buildBlankManualGrid();
      setGrid(g);
      setRows(g.rowData);
      setBrandName(lockedBrandName ?? '');
    } else {
      setGrid(null);
      setRows([]);
      setBrandName('');
    }
  }, [open, lockedBrandName]);

  if (!open || !grid) return null;

  const dataRowsFilled = () =>
    rows.filter((r: any) => r._isDataRow && !r._isSpareRow && String(r.ad ?? '').trim() !== '');

  function handleClose() {
    const dolu = dataRowsFilled().length > 0;
    if ((dolu || (!append && brandName.trim())) && !window.confirm('Girdiğiniz bilgiler kaybolacak. Kapatılsın mı?')) return;
    onClose();
  }

  async function handleSave() {
    const name = (lockedBrandName ?? brandName).trim();
    if (!name) {
      toast({ title: 'Marka adı gerekli', description: 'Önce marka adını girin.', variant: 'destructive' });
      return;
    }
    const filled = dataRowsFilled();
    if (filled.length === 0) {
      toast({ title: 'Malzeme yok', description: 'En az bir satırda Malzeme Adı girin.', variant: 'destructive' });
      return;
    }
    const payloadRows = filled.map((r: any) => ({
      ad: String(r.ad).trim(),
      cins: trimOrU(r.cins),
      baglanti: trimOrU(r.baglanti),
      cap: trimOrU(r.cap),
      boy: trimOrU(r.boy),
      urunKodu: trimOrU(r.urunKodu),
      not: trimOrU(r.not),
      birim: trimOrU(r.birim),
      price: numOrU(r.fiyat),
      // İskonto library modunda _draftDiscount alaninda tutulur
      discountRate: numOrU(r._draftDiscount),
    }));

    setSaving(true);
    try {
      const { data } = await api.post('/library/manual-brand', { brandName: name, discipline, rows: payloadRows });
      toast({
        title: append ? 'Malzemeler eklendi' : 'Marka oluşturuldu',
        description: `"${data.brandName}" · ${data.created} malzeme`,
      });
      onSaved(data.brandId, data.created);
    } catch (e: any) {
      toast({ title: 'Hata', description: e?.response?.data?.message ?? 'Kaydedilemedi.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2">
      <div className="flex h-full max-h-[98vh] w-full max-w-[98vw] flex-col overflow-hidden rounded-lg bg-background shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b p-3">
          <div className="flex flex-1 items-center gap-3">
            <h2 className="whitespace-nowrap text-base font-bold">{append ? 'Malzeme Ekle' : 'Yeni Marka'}</h2>
            {append ? (
              <span className="rounded-md bg-muted px-3 py-1.5 text-sm font-semibold">{lockedBrandName}</span>
            ) : (
              <Input
                autoFocus
                placeholder="Marka adı (örn: AYVAZ)"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="h-9 max-w-xs"
              />
            )}
            <p className="hidden text-xs text-muted-foreground lg:block">
              Boş tabloyu doldurun · Excel&apos;den kopyala-yapıştır · en alta yeni satır otomatik eklenir · yalnız Malzeme Adı zorunlu
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={saving}>
              <X className="mr-1 h-3.5 w-3.5" />İptal
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || (!append && !brandName.trim())}>
              {saving ? (
                <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Kaydediliyor...</>
              ) : (
                <><Save className="mr-1 h-3.5 w-3.5" />{append ? 'Malzemeleri Kaydet' : 'Markayı Kaydet'}</>
              )}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <ExcelGrid
            data={grid}
            brands={[]}
            currencySymbol="₺"
            conversionRate={1}
            mode="library"
            libraryPriceField="materialUnitPriceField"
            autoAppendRow
            enableStructureEdit
            onBrandChange={async () => null}
            onRowDataChange={setRows}
          />
        </div>
      </div>
    </div>
  );
}
