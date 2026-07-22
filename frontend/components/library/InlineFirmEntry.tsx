'use client';

// ── İşçilik SABİT-FORMAT giriş grid'i ──
// Kullanıcı kararı (22.07): işçilik firma tablosu MALZEME listesiyle birebir
// aynı; rastgele Excel ayrıştırma YOK — sabit format, kullanıcı girer/yapıştırır.
// Boş firmada doğrudan bu grid gelir; kayıt sayfa header'ındaki TEK "Değişiklikleri
// Kaydet" butonundan tetiklenir (save() ref ile dışarı verilir). Kütüphane modu →
// İskonto% + Net Fiyat (malzeme listesiyle aynı). save-bulk kalemi oluşturur +
// L2 indeksler, eşleştirme buradan çalışır.

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import type { ExcelGridData, ExcelRowData } from '@/components/excel-grid/types';

// 7-kolon sabit sema — İşçilik Kalemi (AD) · Cins · Çap · Birim · Birim Fiyat ·
// Para · Not. İskonto%/Net Fiyat kütüphane modu kolonlarıdır (_draftDiscount /
// _draftNetPrice). laborName = AD + Cins + Çap (indeksleyici cap/cins'i çözer).
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

/** Doldurulmuş satırları save-bulk payload'una çevir (AD zorunlu). */
function buildFirmSaveItems(rows: ExcelRowData[]) {
  return rows
    .filter((r: any) => r._isDataRow && !r._isSpareRow && String(r.ad ?? '').trim() !== '')
    .map((r: any) => ({
      laborName: [String(r.ad).trim(), trimOrU(r.cins), trimOrU(r.cap)].filter(Boolean).join(' '),
      unit: trimOrU(r.birim) ?? 'Adet',
      unitPrice: numOrU(r.fiyat) ?? 0,
      discountRate: numOrU(r._draftDiscount),
      currency: trimOrU(r.para),
      category: trimOrU(r.not),
    }));
}

export interface FirmEntryHandle {
  /** Girilen kalemleri save-bulk ile kaydeder. Boşsa uyarır, false döner. */
  save: () => Promise<boolean>;
}

interface Props {
  firmaId: string;
  /** Kayıt başarılı → sayfa firma listesini yeniler (aktif liste grid'i açılır). */
  onSaved: () => void;
}

const InlineFirmEntry = forwardRef<FirmEntryHandle, Props>(function InlineFirmEntry({ firmaId, onSaved }, ref) {
  const noBrandChange = useCallback(async () => null, []);
  // Lazy init — stabil referans (her render'da yeni grid = editor iptali).
  const [grid] = useState<ExcelGridData>(buildBlankFirmGrid);
  // Son satır durumu (save closure'u en güncel veriyi okusun).
  const rowsRef = useRef<ExcelRowData[]>(grid.rowData);

  const save = useCallback(async (): Promise<boolean> => {
    const items = buildFirmSaveItems(rowsRef.current);
    if (items.length === 0) {
      toast({ title: 'Kalem yok', description: 'En az bir satırda İşçilik Kalemi + Birim Fiyat girin.', variant: 'destructive' });
      return false;
    }
    try {
      // 'new': HER giris AYRI liste olusturur (bos firma = 1. liste, "+ Yeni
      // Liste" = ilave liste). 'auto' en son listeyi yeniden kullaniyordu.
      const { data } = await api.post(`/labor-firms/${firmaId}/save-bulk`, { priceListId: 'new', items });
      toast({ title: 'Kaydedildi', description: `${data.imported} kalem eklendi ("${data.priceListName}")` });
      onSaved();
      return true;
    } catch (e: any) {
      toast({ title: 'Hata', description: e?.response?.data?.message ?? 'Kaydedilemedi.', variant: 'destructive' });
      return false;
    }
  }, [firmaId, onSaved]);

  useImperativeHandle(ref, () => ({ save }), [save]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Fiyat listesini buraya girin · Excel&apos;den kopyala-yapıştır · en alta yeni satır otomatik eklenir · yalnız İşçilik Kalemi + Birim Fiyat zorunlu
      </p>
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
        onRowDataChange={(r) => { rowsRef.current = r; }}
      />
    </div>
  );
});

export default InlineFirmEntry;
