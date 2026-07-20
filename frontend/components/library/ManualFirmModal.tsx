'use client';

// ── PRD Iscilik L1: "Manuel Kalem Ekle" — ManualBrandModal'in ISCILIK ikizi ──
// 7-kolon sema (PRD §2): Iscilik Kalemi (AD) · Cinsi/Detay · Cap · Birim ·
// Birim Fiyat · Para Birimi · Not. Kayit: POST /labor-firms/:id/save-bulk
// (laborName = AD + Cins + Cap birlesimi — ayni indeksleyici adi cozer;
// para birimi CEVRILMEZ, ham gider). Iskonto% ExcelGrid library modunun
// _draftDiscount kolonundan okunur.

import { useEffect, useState, useCallback } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import type { ExcelGridData, ExcelRowData } from '@/components/excel-grid/types';

const FIRM_COLUMNS: ExcelGridData['columnDefs'] = [
  { field: 'col0', headerName: 'No', width: 56, editable: false },
  { field: 'ad', headerName: 'İşçilik Kalemi', width: 340, editable: true },
  { field: 'cins', headerName: 'Cinsi/Detay', width: 160, editable: true },
  { field: 'cap', headerName: 'Çap', width: 90, editable: true },
  { field: 'birim', headerName: 'Birim', width: 90, editable: true },
  { field: 'fiyat', headerName: 'Birim Fiyat', width: 120, editable: true },
  { field: 'para', headerName: 'Para Birimi', width: 100, editable: true },
  { field: 'not', headerName: 'Not', width: 180, editable: true },
];
const FIRM_ROLES = { noField: 'col0', nameField: 'ad', unitField: 'birim', laborUnitPriceField: 'fiyat' };
// STABIL referans — her render'da yeni [] gecersek columnDefs recompute → editor iptal
const EMPTY_BRANDS: any[] = [];

function buildBlankFirmGrid(dataRows = 30): ExcelGridData {
  const blank = (idx: number, spare = false): ExcelRowData => {
    const row: any = { _rowIdx: idx, _isDataRow: true, _isHeaderRow: false };
    if (spare) row._isSpareRow = true;
    for (const c of FIRM_COLUMNS) if (!c.field.startsWith('_')) row[c.field] = '';
    return row;
  };
  const rowData: ExcelRowData[] = [];
  for (let i = 0; i < dataRows; i++) rowData.push(blank(i));
  rowData.push(blank(dataRows, true)); // en altta hep-bos spare satir
  return { columnDefs: FIRM_COLUMNS, rowData, columnRoles: FIRM_ROLES, brands: [], headerEndRow: 0 };
}

function trimOrU(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  return s === '' ? undefined : s;
}
function numOrU(v: unknown): number | undefined {
  let s = String(v ?? '').replace(/[₺$€\s]/g, '').trim();
  if (s === '') return undefined;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.'); // TR bicimi
  else if (hasComma) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Kayit basarili → eklenen kalem adedi. */
  onSaved: (created: number) => void;
  firmaId: string;
  firmaName: string;
}

export default function ManualFirmModal({ open, onClose, onSaved, firmaId, firmaName }: Props) {
  const noBrandChange = useCallback(async () => null, []);
  const [saving, setSaving] = useState(false);
  const [grid, setGrid] = useState<ExcelGridData | null>(null);
  const [rows, setRows] = useState<ExcelRowData[]>([]);

  useEffect(() => {
    if (open) {
      const g = buildBlankFirmGrid();
      setGrid(g);
      setRows(g.rowData);
    } else {
      setGrid(null);
      setRows([]);
    }
  }, [open]);

  if (!open || !grid) return null;

  const dataRowsFilled = () =>
    rows.filter((r: any) => r._isDataRow && !r._isSpareRow && String(r.ad ?? '').trim() !== '');

  function handleClose() {
    if (dataRowsFilled().length > 0 && !window.confirm('Girdiğiniz bilgiler kaybolacak. Kapatılsın mı?')) return;
    onClose();
  }

  async function handleSave() {
    const filled = dataRowsFilled();
    if (filled.length === 0) {
      toast({ title: 'Kalem yok', description: 'En az bir satırda İşçilik Kalemi girin.', variant: 'destructive' });
      return;
    }
    // laborName = AD (+ Cins + Cap) — ayni indeksleyici adi cozer (cap/cins
    // metinden cikarilir); Birim L6 sert filtresine gider.
    const items = filled.map((r: any) => ({
      laborName: [String(r.ad).trim(), trimOrU(r.cins), trimOrU(r.cap)].filter(Boolean).join(' '),
      unit: trimOrU(r.birim) ?? 'Adet',
      unitPrice: numOrU(r.fiyat) ?? 0,
      discountRate: numOrU(r._draftDiscount),
      currency: trimOrU(r.para),
      category: trimOrU(r.not),
    }));

    setSaving(true);
    try {
      const { data } = await api.post(`/labor-firms/${firmaId}/save-bulk`, {
        priceListId: 'auto',
        items,
      });
      toast({
        title: 'Kalemler eklendi',
        description: `"${data.firmaName}" · ${data.imported} kalem ("${data.priceListName}")`,
      });
      onSaved(data.imported);
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
            <h2 className="whitespace-nowrap text-base font-bold">Manuel Kalem Ekle</h2>
            <span className="rounded-md bg-muted px-3 py-1.5 text-sm font-semibold">{firmaName}</span>
            <p className="hidden text-xs text-muted-foreground lg:block">
              Boş tabloyu doldurun · Excel&apos;den kopyala-yapıştır · en alta yeni satır otomatik eklenir · yalnız İşçilik Kalemi + Birim Fiyat zorunlu
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={saving}>
              <X className="mr-1 h-3.5 w-3.5" />İptal
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Kaydediliyor...</>
              ) : (
                <><Save className="mr-1 h-3.5 w-3.5" />Kalemleri Kaydet</>
              )}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
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
      </div>
    </div>
  );
}
