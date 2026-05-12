'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Upload,
  ArrowLeft,
  Loader2,
  Save,
  FileSpreadsheet,
  FileText,
  Sparkles,
  Plus,
  Trash2,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import type { ExcelGridHandle } from '@/components/excel-grid/ExcelGrid';
import { SheetTabs } from '@/components/excel-grid/SheetTabs';
import { buildMaterialContextFromArray } from '@/components/excel-grid/build-material-context';
import type { ExcelGridData, ExcelRowData, MultiSheetData, SheetData, MatchCandidate as ExcelMatchCandidate } from '@/components/excel-grid/types';
import { useCapabilities } from '@/contexts/CapabilitiesContext';
// DwgUploader artik bagimsiz /dwg-workspace route'unda render ediliyor —
// ana quotes bundle'i DWG viewer agirligindan kurtuldu.
import type { MetrajResult } from '@/components/dwg-metraj/types';
import MetrajEditor from '@/components/dwg-metraj/MetrajEditor';
import type { Brand } from '@/types';
import type {
  UploadMode,
  Currency,
  LaborFirm,
  AvailableBrand,
  UploadResponse,
  MatchCandidate,
  EditableRow,
} from '@/types/quotes';
import { useCurrency } from '@/hooks/use-currency';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
// Tipler @/types/quotes ve @/types altina tasindi.

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const EXCEL_EXTENSIONS = '.xlsx,.xls';
const PDF_EXTENSIONS = '.pdf';

// formatPrice ve CURRENCY_SYMBOLS @/hooks/use-currency altina tasindi.

// Calc fonksiyonlari kaldirildi — Excel aynen gosteriliyor

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `row-${keyCounter}`;
}

// createEmptyRow kaldirildi — dinamik tablo yapisi

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function NewQuotePage() {
  const router = useRouter();

  // Step 1 wizard kaldirildi — quotes/new direkt grid + form gosterir.
  // Bu state'ler hala API parametreleri olarak kullanildigi icin tutuluyor.
  const [uploadMode, setUploadMode] = useState<UploadMode>('excel');
  const [discipline, setDiscipline] = useState<'mechanical' | 'electrical' | 'hybrid'>('mechanical');
  const [laborPref, setLaborPref] = useState<'include' | 'exclude'>('include');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // Orijinal Excel dosya binary'si (base64) — kaydetme sirasinda backend'e gonderilir
  const [originalFileBase64, setOriginalFileBase64] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);

  // User tier
  const [userTier, setUserTier] = useState<'core' | 'pro' | 'suite'>('core');
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.tier) setUserTier(parsed.tier);
      }
    } catch {}
  }, []);

  // Dashboard'dan drag & drop ile gelen veriyi oku
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    // DWG mode — Dashboard'dan yonlendirildi, ayri /dwg-workspace sayfasina
    // git (Canvas2D viewer lazy load + state izolasyonu).
    if (params.get('mode') === 'dwg') {
      router.replace('/dwg-workspace');
      return;
    }

    // /dwg-workspace'ten metraj onaylanip donmussuz — sessionStorage'dan oku
    // ve fiyatlandirma akisina aktar.
    if (params.get('from') === 'dwg-workspace') {
      const stored = sessionStorage.getItem('metaprice_dwg_metraj');
      sessionStorage.removeItem('metaprice_dwg_metraj');
      window.history.replaceState({}, '', '/quotes/new');
      if (!stored) return;
      try {
        const { metraj, fileName } = JSON.parse(stored) as {
          metraj: MetrajResult;
          fileName: string;
        };
        const rows: ExcelRowData[] = [];
        let idx = 0;
        for (const layer of metraj.layers) {
          if (layer.segments && layer.segments.length > 0) {
            for (const seg of layer.segments) {
              rows.push({
                _isDataRow: true,
                _isHeaderRow: false,
                _rowIdx: idx++,
                'Malzeme Adi': seg.material_type || layer.hat_tipi || layer.layer,
                'Birim': 'm',
                'Miktar': String(seg.length.toFixed(2)),
              });
            }
          } else {
            rows.push({
              _isDataRow: true,
              _isHeaderRow: false,
              _rowIdx: idx++,
              'Malzeme Adi': layer.hat_tipi || layer.layer,
              'Cap': '',
              'Birim': 'm',
              'Miktar': String(layer.length.toFixed(2)),
            });
          }
        }
        const columnDefs = [
          { field: 'Malzeme Adi', headerName: 'Malzeme Adi', flex: 3 },
          { field: 'Cap', headerName: 'Cap', width: 90 },
          { field: 'Birim', headerName: 'Birim', width: 80 },
          { field: 'Miktar', headerName: 'Miktar', width: 100, type: 'rightAligned' as const },
        ];
        setExcelGridData({
          columnDefs,
          rowData: rows,
          columnRoles: { nameField: 'Malzeme Adi', quantityField: 'Miktar', unitField: 'Birim' },
          brands: allBrands,
          headerEndRow: 0,
        });
        setTitle(fileName.replace(/\.[^.]+$/, '') + ' — DWG Metraj');
        toast({ title: 'Metraj onaylandi', description: `${rows.length} kalem fiyatlandirmaya aktarildi` });
      } catch (e) {
        console.error('DWG metraj parse failed:', e);
      }
      return;
    }

    if (params.get('from') !== 'dashboard') return;
    const stored = sessionStorage.getItem('metaprice_upload_result');
    if (!stored) {
      // Veri yok — URL'den from parametresini temizle, normal Step 1 gosterilsin
      window.history.replaceState({}, '', '/quotes/new');
      return;
    }
    try {
      const data = JSON.parse(stored);
      sessionStorage.removeItem('metaprice_upload_result');

      setExcelHeaders(data.headers ?? []);
      setColumnRoles(data.columnRoles ?? {});
      const editableRows: EditableRow[] = (data.rows ?? []).map((row: any) => ({
        _key: nextKey(),
        cells: row,
        materialKar: 0, laborKar: 0,
        brandId: null, laborFirmaId: null,
        _matNetPrice: 0, _labNetPrice: 0,
      }));

      setRows(editableRows);
      if (data.brands) setAllBrands(data.brands);
      setUsedProvider(data.usedProvider ?? null);
      if (data.fileName) setTitle(data.fileName.replace(/\.[^.]+$/, ''));

      // Dashboard'dan gelen orijinal dosya binary'si
      if (data.originalFileBase64) {
        setOriginalFileBase64(data.originalFileBase64);
        setOriginalFileName(data.fileName ?? null);
      }

      // Dashboard'dan gelen multi-sheet verisini yukle
      const multi = data.multiSheetData ?? data.excelGridData;
      if (multi && Array.isArray(multi.sheets)) {
        setMultiSheet(multi);
        const firstNonEmpty = multi.sheets.findIndex((s: any) => !s.isEmpty);
        const activeIdx = firstNonEmpty >= 0 ? firstNonEmpty : 0;
        setActiveSheetIndex(activeIdx);
        const initialLive: Record<number, ExcelRowData[]> = {};
        multi.sheets.forEach((s: any) => { initialLive[s.index] = s.rowData; });
        setLiveRowDataBySheet(initialLive);
        const active = multi.sheets[activeIdx];
        if (active && Array.isArray(active.columnDefs)) {
          setExcelGridData({
            columnDefs: active.columnDefs,
            rowData: active.rowData,
            columnRoles: active.columnRoles,
            brands: multi.brands,
            headerEndRow: active.headerEndRow,
          });
        }
      } else if (multi && Array.isArray(multi.columnDefs)) {
        // Eski tek-sheet shape (backward compat)
        setExcelGridData(multi);
      }
    } catch {}

  }, []);

  // Step 2 state
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [columnRoles, setColumnRoles] = useState<Record<string, string>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingColumn = useRef<{ name: string; startX: number; startWidth: number } | null>(null);
  const [excelGridData, setExcelGridData] = useState<ExcelGridData | null>(null);
  const [dwgMetraj, setDwgMetraj] = useState<MetrajResult | null>(null);
  const [dwgFileName, setDwgFileName] = useState<string>('');
  // Multi-sheet state
  const [multiSheet, setMultiSheet] = useState<MultiSheetData | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [liveRowDataBySheet, setLiveRowDataBySheet] = useState<Record<number, ExcelRowData[]>>({});
  const [sheetMatchCounts, setSheetMatchCounts] = useState<Record<number, { total: number; matched: number }>>({});
  const [isMatchingAllSheets, setIsMatchingAllSheets] = useState(false);
  // Sheet disiplinleri (kullanici override edebilir)
  const [sheetDisciplines, setSheetDisciplines] = useState<Record<number, 'mechanical' | 'electrical' | null>>({});
  // Iscilik firmalari + secilen firma (sheet bazli)
  const [laborFirms, setLaborFirms] = useState<LaborFirm[]>([]);
  const [selectedFirmaBySheet, setSelectedFirmaBySheet] = useState<Record<number, string>>({});
  const [isMatchingLabor, setIsMatchingLabor] = useState(false);
  const { capabilities } = useCapabilities();
  const excelGridRef = useRef<ExcelGridHandle>(null);

  const hasAnyLabor = capabilities.mechanical.labor || capabilities.electrical.labor;

  // ── SessionStorage draft key ──
  const DRAFT_KEY = 'metaprice_quote_draft';

  // Iscilik firmalarini cek (capability varsa)
  useEffect(() => {
    if (!hasAnyLabor) return;
    api.get<LaborFirm[]>('/labor-firms').then(({ data }) => {
      setLaborFirms(data);
    }).catch(() => {});
  }, [hasAnyLabor]);
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [allBrands, setAllBrands] = useState<Brand[]>([]);
  const [usedProvider, setUsedProvider] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isMatching, setIsMatching] = useState(false);

  // ── SessionStorage draft — sayfa yenilendiginde Excel kaybolmasin ──

  // Restore: mount'ta sessionStorage'dan oku
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = sessionStorage.getItem(DRAFT_KEY);
      if (!stored) return;
      const draft = JSON.parse(stored);
      if (draft.multiSheet) {
        setMultiSheet(draft.multiSheet);
        setActiveSheetIndex(draft.activeSheetIndex ?? 0);
        setLiveRowDataBySheet(draft.liveRowDataBySheet ?? {});
        setSheetDisciplines(draft.sheetDisciplines ?? {});
        setTitle(draft.title ?? '');
        setAllBrands(draft.allBrands ?? []);
        const activeIdx = draft.activeSheetIndex ?? 0;
        const active = draft.multiSheet.sheets?.[activeIdx];
        if (active && Array.isArray(active.columnDefs)) {
          setExcelGridData({
            columnDefs: active.columnDefs,
            rowData: draft.liveRowDataBySheet?.[active.index] ?? active.rowData,
            columnRoles: active.columnRoles,
            brands: draft.multiSheet.brands ?? [],
            headerEndRow: active.headerEndRow ?? 0,
          });
        }
        console.log('[quotes/new] Draft restored from sessionStorage');

        // Marka/firma atanmis satirlar icin otomatik re-matching
        // (sessionStorage'dan restore edildikten sonra fiyatlar kayip — yeniden match et)
        setTimeout(async () => {
          const multi = draft.multiSheet;
          if (!multi?.sheets) return;
          const live = draft.liveRowDataBySheet ?? {};
          let reMatched = 0;

          for (const sheet of multi.sheets) {
            if (sheet.isEmpty) continue;
            const rows = live[sheet.index] ?? sheet.rowData ?? [];
            const roles = sheet.columnRoles ?? {};
            if (!roles.nameField) continue;

            for (let ri = 0; ri < rows.length; ri++) {
              const row = rows[ri];
              if (!row?._isDataRow) continue;

              // Malzeme re-matching
              if (row._marka && roles.materialUnitPriceField) {
                const currentVal = String(row[roles.materialUnitPriceField] ?? '').trim();
                if (!currentVal || currentVal === '0' || currentVal === '0.00') {
                  const currentName = String(row[roles.nameField] ?? '').trim();
                  if (currentName) {
                    try {
                      const { data: result } = await api.post('/matching/bulk-match', {
                        brandId: row._marka,
                        materialNames: [currentName],
                      });
                      const match = result[currentName];
                      if (match?.netPrice > 0) {
                        row[roles.materialUnitPriceField] = match.netPrice.toFixed(2);
                        const qty = roles.quantityField ? parseFloat(String(row[roles.quantityField] ?? '')) || 0 : 0;
                        if (roles.materialTotalField) row[roles.materialTotalField] = (match.netPrice * qty).toFixed(2);
                        row._matNetPrice = match.netPrice;
                        reMatched++;
                      }
                    } catch {}
                  }
                }
              }
            }
          }

          if (reMatched > 0) {
            setLiveRowDataBySheet({ ...live });
            console.log(`[quotes/new] Re-matched ${reMatched} rows after restore`);
          }
        }, 500);
      }
    } catch (e) {
      console.warn('[quotes/new] Draft restore failed:', e);
    }
  }, []);

  // Save: onemli state degisimlerinde sessionStorage'a yaz
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!multiSheet) {
      sessionStorage.removeItem(DRAFT_KEY);
      return;
    }
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        multiSheet,
        liveRowDataBySheet,
        activeSheetIndex,
        sheetDisciplines,
        title,
        allBrands,
      }));
    } catch (e) {
      console.warn('[quotes/new] Draft save failed:', e);
    }
  }, [multiSheet, liveRowDataBySheet, activeSheetIndex, sheetDisciplines, title, allBrands]);

  // Marka fiyat cache: brandId → { materialName → PriceLookupResult }
  const brandPriceCacheRef = useRef<Record<string, Record<string, any>>>({});
  // Devam eden fetch promise'leri — ayni brand icin tekrar cagrilmasini engeller
  const brandFetchPromises = useRef<Record<string, Promise<Record<string, any>> | undefined>>({});
  const [brandPriceCache, setBrandPriceCache] = useState<Record<string, Record<string, any>>>({});

  // Currency (TRY/USD/EUR) hook — state + exchange rate + conversion
  const { currency, setCurrency, ratesLoaded, conversionRate, displayPrice } = useCurrency();

  /* ---------- Step 1: Upload ---------- */

  function handleModeSwitch(mode: UploadMode) {
    setUploadMode(mode);
    setFile(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
  }

  async function handleUpload() {
    if (!file) {
      const fileType = uploadMode === 'excel' ? 'Excel' : 'PDF';
      toast({
        title: 'Dosya secin',
        description: `Lutfen bir ${fileType} dosyasi secin.`,
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const endpoint =
        uploadMode === 'excel' ? '/excel-engine/analyze' : '/ai/analyze';

      // Mevcut analyze + yeni preview parallel
      const analyzePromise = api.post<UploadResponse>(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Excel AG-Grid icin cagri
      if (uploadMode === 'excel') {
        const gridFormData = new FormData();
        gridFormData.append('file', file);
        try {
          const gridRes = await api.post<MultiSheetData>('/excel-grid/prepare', gridFormData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          const multi = gridRes.data;
          console.log('[ExcelGrid] prepare OK:', multi?.sheets?.length, 'sheet');
          console.log('[ExcelGrid] RAW response:', multi);
          if (multi?.sheets) {
            multi.sheets.forEach((s, i) => {
              console.log(`[ExcelGrid] sheet[${i}] name="${s?.name}" idx=${s?.index} isEmpty=${s?.isEmpty} colDefs=${Array.isArray(s?.columnDefs) ? s.columnDefs.length : 'NOT_ARRAY:' + typeof s?.columnDefs} rowData=${Array.isArray(s?.rowData) ? s.rowData.length : 'NOT_ARRAY'}`);
            });
          }
          if (multi?.sheets?.length) {
            // Not: Backend /excel-grid/prepare artik stripPrices=true ile cagriliyor,
            // fiyat kolonlari zaten backend'te temizlenmis geliyor.
            setMultiSheet(multi);
            // Ilk non-empty sheet'i aktif yap
            const firstNonEmpty = multi.sheets.findIndex((s) => !s.isEmpty);
            setActiveSheetIndex(firstNonEmpty >= 0 ? firstNonEmpty : 0);
            // Her sheet icin canli rowData'yi initialize et
            const initialLive: Record<number, ExcelRowData[]> = {};
            const initialDisc: Record<number, 'mechanical' | 'electrical' | null> = {};
            multi.sheets.forEach((s) => {
              initialLive[s.index] = s.rowData;
              initialDisc[s.index] = s.discipline ?? null;
            });
            setLiveRowDataBySheet(initialLive);
            setSheetDisciplines(initialDisc);
            // Backward compat: aktif sheet'i tekli excelGridData olarak da ayarla (diger kod yollari icin)
            const activeIdx = firstNonEmpty >= 0 ? firstNonEmpty : 0;
            const active = multi.sheets[activeIdx];
            if (active) {
              setExcelGridData({
                columnDefs: active.columnDefs,
                rowData: active.rowData,
                columnRoles: active.columnRoles,
                brands: multi.brands,
                headerEndRow: active.headerEndRow,
              });
            }
          }
        } catch (err: any) {
          console.error('[ExcelGrid] prepare HATA:', err);
          toast({
            title: 'Excel Hatasi',
            description: err?.response?.data?.message ?? err?.message ?? 'Bilinmeyen hata',
            variant: 'destructive',
          });
          throw err;
        }
      }

      const { data } = await analyzePromise;

      console.log('[QuoteEditor] Backend response:', data.rows?.length, 'rows, headers:', data.headers, 'roles:', data.columnRoles);

      setExcelHeaders(data.headers ?? []);
      setColumnRoles(data.columnRoles ?? {});
      const editableRows: EditableRow[] = (data.rows ?? []).map((row: any) => ({
        _key: nextKey(),
        cells: row,
        materialKar: 0, laborKar: 0,
        brandId: null, laborFirmaId: null,
        _matNetPrice: 0, _labNetPrice: 0,
      }));

      setRows(editableRows);
      if (data.brands) setAllBrands(data.brands);
      setUsedProvider(data.usedProvider ?? null);
    } catch {
      const fileType = uploadMode === 'excel' ? 'Excel' : 'PDF';
      toast({
        title: 'Hata',
        description: `${fileType} dosyasi analiz edilirken bir hata olustu.`,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  }

  /* ---------- Step 2: Edit rows ---------- */

  const updateRow = useCallback(
    (key: string, patch: Partial<EditableRow>) => {
      setRows((prev) =>
        prev.map((r) => (r._key === key ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  // ── Tier kontrol ──
  const isPro = userTier === 'pro' || userTier === 'suite';

  // ── Kolon role helper ──
  const priceCol = Object.entries(columnRoles).find(([, v]) => v === 'price')?.[0];
  const qtyCol = Object.entries(columnRoles).find(([, v]) => v === 'quantity')?.[0];
  const totalCol = Object.entries(columnRoles).find(([, v]) => v === 'total')?.[0];
  const nameCol = Object.entries(columnRoles).find(([, v]) => v === 'name')?.[0];

  // ── Sutun resize: mousedown handler ──
  function startColumnResize(e: React.MouseEvent, columnName: string, currentWidth: number) {
    e.preventDefault();
    e.stopPropagation();
    resizingColumn.current = { name: columnName, startX: e.clientX, startWidth: currentWidth };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingColumn.current) return;
      const diff = ev.clientX - resizingColumn.current.startX;
      const newWidth = Math.max(60, Math.min(600, resizingColumn.current.startWidth + diff));
      setColumnWidths((prev) => ({ ...prev, [resizingColumn.current!.name]: newWidth }));
    };

    const onMouseUp = () => {
      resizingColumn.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // ── Gorunur sutunlar: gereksiz kat/bodrum sutunlarini gizle ──
  const visibleHeaders = useMemo(() => {
    // Turkce normalize fonksiyonu (İ→i, Ç→c, Ş→s, Ü→u, Ö→o, Ğ→g)
    const trNorm = (s: string) => s
      .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
      .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c')
      .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ğĞ]/g, 'g')
      .toLowerCase().trim();

    const hiddenPatterns = /bodrum|zemin\s*kat|\d+\.\s*kat|cati\s*kat|diger|asma\s*kat/;

    return excelHeaders.filter((h) => {
      if (columnRoles[h]) return true;
      if (hiddenPatterns.test(trNorm(h))) return false;
      return true;
    });
  }, [excelHeaders, columnRoles]);

  // ── Hucre degistiginde hesapla ──
  function updateCellAndCalc(key: string, header: string, value: any) {
    setRows((prev) => prev.map((r) => {
      if (r._key !== key) return r;
      const newCells = { ...r.cells, [header]: value };

      // price veya quantity degistiyse total'i hesapla
      if (priceCol && qtyCol && totalCol && (header === priceCol || header === qtyCol)) {
        const price = parseFloat(String(newCells[priceCol]));
        const qty = parseFloat(String(newCells[qtyCol]));
        const total = price * qty;

        console.log(`[Calc] ${header} changed: price=${price}, qty=${qty}, total=${total}`);

        newCells[totalCol] = isNaN(total) ? 'Hata' : parseFloat(total.toFixed(2));
      }

      return { ...r, cells: newCells };
    }));
  }

  // ── Baglamsal Tanimlama: Parent row birlestime ──
  // Ust satirlara bakarak SIRA NO'su olan ilk grup basligini bul.
  // Miktari olan satirlari ATLA (bunlar ayni gruptaki diger malzemeler).
  // Aciklama satirlarini ATLA (SIRA NO'su yok, miktari yok).
  function buildMaterialContext(idx: number): string {
    if (!nameCol) return '';
    const currentName = String(rows[idx].cells[nameCol] ?? '').trim();
    if (!currentName) return '';

    const noColKey = Object.entries(columnRoles).find(([, v]) => v === 'no')?.[0];

    // Ust satirlara bak, SIRA NO'su olan ilk grup basligini bul
    for (let i = idx - 1; i >= 0; i--) {
      const prev = rows[i];
      const prevName = String(prev.cells[nameCol] ?? '').trim();
      const prevNo = noColKey ? String(prev.cells[noColKey] ?? '').trim() : '';
      const prevQty = qtyCol ? parseFloat(String(prev.cells[qtyCol] ?? '')) : NaN;

      // Grup basligi: SIRA NO var + isim var + miktar yok
      if (prevNo && prevName.length > 2 && (isNaN(prevQty) || prevQty === 0)) {
        return prevName + ' ' + currentName;
      }
      // Miktari olan satirlar ve aciklama satirlari atlanir, aramaya devam
    }

    return currentName;
  }

  // ── Marka fiyat listesini cek ve cache'le ──
  async function fetchBrandPrices(brandId: string): Promise<Record<string, any>> {
    // 1. Cache'te varsa hemen dondur
    if (brandPriceCacheRef.current[brandId]) {
      console.log(`[SemanticCache] HIT: ${brandId}, ${Object.keys(brandPriceCacheRef.current[brandId]).length} item`);
      return brandPriceCacheRef.current[brandId];
    }

    // 2. Ayni brand icin devam eden fetch varsa onu bekle (3x cagrilma engeli)
    if (brandFetchPromises.current[brandId]) {
      console.log(`[SemanticCache] WAIT: ${brandId}, devam eden istek bekleniyor...`);
      return brandFetchPromises.current[brandId];
    }

    // 3. Yeni fetch baslat
    const fetchPromise = (async () => {
      // Sadece MIKTARI OLAN satirlari gonder — aciklama/baslik satirlarini atla
      const allNames = rows
        .map((r, idx) => {
          const qty = qtyCol ? parseFloat(String(r.cells[qtyCol] ?? '')) : NaN;
          if (isNaN(qty) || qty <= 0) return ''; // miktar yok = malzeme degil
          return buildMaterialContext(idx);
        })
        .filter((n) => n.length > 1);

      const uniqueNames = Array.from(new Set(allNames));
      console.log(`[SemanticCache] MISS: ${brandId}, AI eslestirme icin ${uniqueNames.length} malzeme gonderiliyor...`);

      toast({ title: 'Eslestirme yapiliyor...', description: `${uniqueNames.length} malzeme araniyor.` });

      try {
        const { data } = await api.post('/matching/bulk-match', {
          brandId,
          materialNames: uniqueNames,
        });
        brandPriceCacheRef.current[brandId] = data;
        setBrandPriceCache((prev) => ({ ...prev, [brandId]: data }));
        const matchCount = Object.values(data).filter((r: any) => r.confidence !== 'none').length;
        console.log(`[SemanticCache] CACHED: ${brandId}, ${matchCount}/${uniqueNames.length} eslesti`);
        return data;
      } catch (e) {
        console.error('[SemanticCache] Error:', e);
        return {};
      } finally {
        delete brandFetchPromises.current[brandId];
      }
    })();

    brandFetchPromises.current[brandId] = fetchPromise;
    return fetchPromise;
  }

  // ── Marka degisince AI eslestirme yap ──
  async function handleBrandChange(key: string, brandId: string, materialName: string) {
    console.log(`[SemanticMatch] key=${key}, brand=${brandId}, material="${materialName}"`);

    if (!brandId) {
      setRows((prev) => prev.map((r) => r._key === key ? { ...r, brandId: null, _matNetPrice: 0 } : r));
      return;
    }

    setRows((prev) => prev.map((r) => r._key === key ? { ...r, brandId } : r));
    if (!materialName) return;

    setIsMatching(true);
    try {
      const prices = await fetchBrandPrices(brandId);
      const result = prices[materialName];

      console.log(`[SemanticMatch] lookup "${materialName}" →`, result);

      if (result && result.confidence === 'multi' && result.candidates?.length) {
        // Birden fazla aday — kullaniciya secenekleri goster
        setRows((prev) => prev.map((r) =>
          r._key === key ? { ...r, brandId, _candidates: result.candidates, _showAllCandidates: false } : r,
        ));
        toast({ title: `⚠ ${result.candidates.length} aday`, description: result.reason });
      } else if (result && result.netPrice > 0) {
        const netPrice = parseFloat(String(result.netPrice)) || 0;

        setRows((prev) => prev.map((r) => {
          if (r._key !== key) return r;
          const kar = parseFloat(String(r.materialKar)) || 0;
          const finalPrice = netPrice * (1 + kar / 100);
          const qty = qtyCol ? (parseFloat(String(r.cells[qtyCol])) || 0) : 0;
          const total = finalPrice * qty;

          const newCells = { ...r.cells };
          if (priceCol) newCells[priceCol] = parseFloat(finalPrice.toFixed(2));
          if (totalCol) newCells[totalCol] = parseFloat(total.toFixed(2));

          return { ...r, brandId, _matNetPrice: netPrice, _candidates: null, cells: newCells };
        }));

        const icon = result.confidence === 'high' ? '🟢' : result.confidence === 'medium' ? '🟡' : '🟠';
        const priceDisplay = displayPrice(netPrice);
        const desc = result.reason
          ? `${result.matchedName?.slice(0, 40)} — ${result.reason}`
          : result.matchedName?.slice(0, 60);
        toast({ title: `${icon} ${priceDisplay}`, description: desc });
      } else {
        const reason = result?.reason ?? 'Fiyat listesinde karsiligi bulunamadi.';
        toast({ title: 'Eslesmedi', description: `"${materialName.slice(0, 40)}" — ${reason}` });
      }
    } catch (e) {
      console.error('[SemanticMatch] Error:', e);
    } finally {
      setIsMatching(false);
    }
  }

  // ── Iscilik firma degisince fiyat cek ──
  async function handleFirmaChange(key: string, firmaId: string, _materialName: string) {
    if (!firmaId || firmaId === '_none') {
      setRows((prev) => prev.map((r) => r._key === key ? { ...r, laborFirmaId: null, _labNetPrice: 0 } : r));
      return;
    }
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, laborFirmaId: firmaId } : r));
  }

  // ── Kar % degisince fiyat yeniden hesapla ──
  function handleMatKarChange(key: string, kar: number) {
    setRows((prev) => prev.map((r) => {
      if (r._key !== key) return r;
      const updated = { ...r, materialKar: kar };
      if (r._matNetPrice > 0 && priceCol) {
        const netPrice = parseFloat(String(r._matNetPrice)) || 0;
        const finalPrice = netPrice * (1 + kar / 100);
        const qty = qtyCol ? (parseFloat(String(r.cells[qtyCol])) || 0) : 0;
        const total = finalPrice * qty;

        console.log(`[KarChange] netPrice=${netPrice}, kar=${kar}%, finalPrice=${finalPrice}, qty=${qty}, total=${total}`);

        const newCells = { ...r.cells };
        newCells[priceCol] = isNaN(finalPrice) ? 'Hata' : parseFloat(finalPrice.toFixed(2));
        if (totalCol) newCells[totalCol] = isNaN(total) ? 'Hata' : parseFloat(total.toFixed(2));
        updated.cells = newCells;
      }
      return updated;
    }));
  }

  function handleLabKarChange(key: string, kar: number) {
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, laborKar: kar } : r));
  }

  // ── Grand Total ──
  const grandTotal = useMemo(() => {
    if (!totalCol) return 0;
    return rows.reduce((sum, r) => sum + (parseFloat(String(r.cells[totalCol] ?? '')) || 0), 0);
  }, [rows, totalCol]);

  async function handleSave() {
    // Baslik bos ise dosya adi veya varsayilan kullan
    const finalTitle = title.trim() || `Teklif ${new Date().toLocaleDateString('tr-TR')}`;

    setIsSaving(true);
    try {
      // columnRoles'u kullanarak DTO alanlarini dogru maple
      const unitCol = Object.entries(columnRoles).find(([, v]) => v === 'unit')?.[0];
      const laborPriceCol = Object.entries(columnRoles).find(([, v]) => v === 'labor_price')?.[0];

      const items = rows
        .filter((row) => {
          // Bos satirlari atla — en az malzeme adi olmali
          const matName = nameCol ? String(row.cells[nameCol] ?? '').trim() : '';
          return matName.length > 0;
        })
        .map((row) => ({
          materialName: nameCol ? String(row.cells[nameCol] ?? '').trim() : '',
          unit: unitCol ? String(row.cells[unitCol] ?? '').trim() : 'Adet',
          quantity: qtyCol ? (parseFloat(String(row.cells[qtyCol] ?? '')) || 0) : 0,
          unitPrice: priceCol ? (parseFloat(String(row.cells[priceCol] ?? '')) || 0) : 0,
          materialUnitPrice: priceCol ? (parseFloat(String(row.cells[priceCol] ?? '')) || 0) : 0,
          laborUnitPrice: laborPriceCol ? (parseFloat(String(row.cells[laborPriceCol] ?? '')) || 0) : 0,
          materialMargin: row.materialKar || 0,
          laborMargin: row.laborKar || 0,
          brandId: row.brandId || undefined,
        }));

      // Multi-sheet: sheets payload'u ve items summary'sini turet
      let payloadItems = items;
      let sheetsPayload: any[] | undefined;
      if (multiSheet) {
        // KRITIK: Aktif sheet icin AG-Grid'den guncel rowData'yi al
        if (excelGridRef.current) {
          const freshRows = excelGridRef.current.getRowData();
          if (freshRows.length > 0) {
            liveRowDataBySheet[activeSheetIndex] = freshRows;
          }
        }
        // Fallback: liveRowDataBySheet bossa, multiSheet.sheets'ten rowData al
        multiSheet.sheets.forEach((s) => {
          if (!liveRowDataBySheet[s.index] && s.rowData?.length > 0) {
            liveRowDataBySheet[s.index] = s.rowData;
          }
        });

        const multiItems: any[] = [];
        multiSheet.sheets.forEach((sheet) => {
          if (sheet.isEmpty) return;
          // AG-Grid'den guncel veri varsa onu kullan, yoksa liveRowData, yoksa sheet.rowData
          let rowsForSheet = liveRowDataBySheet[sheet.index] ?? sheet.rowData;
          // Fallback: excelGridRef varsa oradan al
          if ((!rowsForSheet || rowsForSheet.length === 0) && excelGridRef.current) {
            const gridRows = excelGridRef.current.getRowData();
            if (gridRows.length > 0) rowsForSheet = gridRows;
          }
          console.log(`[Save] Sheet ${sheet.index}: ${rowsForSheet.length} rows, nameField=${sheet.columnRoles.nameField}`);
          const roles = sheet.columnRoles;
          rowsForSheet.forEach((r) => {
            if (!r._isDataRow) return;
            const matName = roles.nameField ? String(r[roles.nameField] ?? '').trim() : '';
            if (!matName) return;
            multiItems.push({
              materialName: matName,
              unit: roles.unitField ? String(r[roles.unitField] ?? '').trim() || 'Adet' : 'Adet',
              quantity: roles.quantityField ? parseFloat(String(r[roles.quantityField] ?? '')) || 0 : 0,
              unitPrice: roles.materialUnitPriceField ? parseFloat(String(r[roles.materialUnitPriceField] ?? '')) || 0 : 0,
              materialUnitPrice: roles.materialUnitPriceField ? parseFloat(String(r[roles.materialUnitPriceField] ?? '')) || 0 : 0,
              laborUnitPrice: roles.laborUnitPriceField ? parseFloat(String(r[roles.laborUnitPriceField] ?? '')) || 0 : 0,
              materialMargin: r._malzKar || 0,
              laborMargin: r._iscKar || 0,
            });
          });
        });
        if (multiItems.length > 0) payloadItems = multiItems;
        sheetsPayload = multiSheet.sheets.map((s) => ({
          name: s.name,
          index: s.index,
          isEmpty: s.isEmpty,
          columnDefs: s.columnDefs,
          columnRoles: s.columnRoles,
          headerEndRow: s.headerEndRow,
          rowData: liveRowDataBySheet[s.index] ?? s.rowData,
        }));
      }

      await api.post('/quotes', {
        title: finalTitle,
        items: payloadItems,
        sheets: sheetsPayload,
        originalFileBase64: originalFileBase64 ?? undefined,
        originalFileName: originalFileName ?? undefined,
      });

      // Draft temizle — artik kayitli teklif var
      sessionStorage.removeItem(DRAFT_KEY);

      toast({
        title: 'Teklif kaydedildi',
        description: `"${finalTitle}" basariyla olusturuldu.`,
      });
      router.push('/quotes');
    } catch {
      toast({
        title: 'Hata',
        description: 'Teklif kaydedilirken bir hata olustu.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }


  /* ---------- Render: Step 2 -- Edit Quote ---------- */

  const currencies: Currency[] = ['TRY', 'USD', 'EUR'];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => {
            // Draft sessionStorage'da kalir (geri donerse kaldigi yerden devam edebilir)
            // Kullanici acikca "kaydet" basmadiysa zaten kalici kayit yok
            router.push('/dashboard');
          }}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Geri
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Teklif Duzenle</h1>
          {usedProvider && (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
              &#10003; {usedProvider} ile analiz edildi
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Currency Toggle */}
          <div className="flex rounded-lg border bg-muted p-0.5">
            {currencies.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  currency === c
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                disabled={!ratesLoaded && c !== 'TRY'}
              >
                {c === 'TRY' ? 'TL' : c}
              </button>
            ))}
          </div>

          {/* Fiyatlandirma butonu kaldirildi — yeni yapida gerek yok */}
        </div>
      </div>

      {/* Teklif Basligi input kaldirildi — kaydetme sirasinda dosya adi kullanilir */}

      {/* DWG Metraj Duzeltme Ekrani — Dashboard'dan DWG parse sonrasi */}
      {dwgMetraj && !multiSheet && !excelGridData && (
        <Card className="mb-4">
          <CardContent className="py-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold">DWG Metraj — {dwgFileName}</h3>
              <p className="text-xs text-muted-foreground">Kontrol edin, duzeltmeleri yapin, onaylayin.</p>
            </div>
            <MetrajEditor
              data={dwgMetraj}
              fileName={dwgFileName}
              onApprove={(rows) => {
                const excelRows: ExcelRowData[] = rows.map((r, idx) => ({
                  _isDataRow: true,
                  _isHeaderRow: false,
                  _rowIdx: idx,
                  'Malzeme Adi': r.name,
                  'Birim': r.unit,
                  'Miktar': r.qty,
                }));
                const gridData: ExcelGridData = {
                  columnDefs: [
                    { field: 'Malzeme Adi', headerName: 'Malzeme Adi', width: 400 },
                    { field: 'Birim', headerName: 'Birim', width: 80 },
                    { field: 'Miktar', headerName: 'Miktar', width: 100 },
                  ],
                  rowData: excelRows,
                  columnRoles: { nameField: 'Malzeme Adi', quantityField: 'Miktar', unitField: 'Birim' },
                  brands: allBrands,
                  headerEndRow: 0,
                };
                setExcelGridData(gridData);
                // MultiSheet formatinda da set et (save icin gerekli)
                const multiData: MultiSheetData = {
                  sheets: [{
                    index: 0,
                    name: 'DWG Metraj',
                    isEmpty: false,
                    discipline: 'mechanical' as const,
                    columnDefs: gridData.columnDefs,
                    rowData: excelRows,
                    columnRoles: gridData.columnRoles,
                    headerEndRow: 0,
                  }],
                  brands: allBrands,
                };
                setMultiSheet(multiData);
                setActiveSheetIndex(0);
                setLiveRowDataBySheet({ 0: excelRows });
                setDwgMetraj(null);
                setTitle(dwgFileName.replace(/\.[^.]+$/, '') + ' — DWG Metraj');
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* DWG akisi artik /dwg-workspace route'unda. Bu sayfa sadece sonradan
          metraj donus akisini ele alir (sessionStorage uzerinden). */}
      {!multiSheet && !excelGridData && uploadMode === 'dwg' && (
        <Card className="mb-4">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">DWG analizi ayri sayfada yapilir</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tesisat planini analiz etmek icin DWG Workspace'e gidin.
                </p>
              </div>
              <Link
                href="/dwg-workspace"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                DWG Workspace'i Ac
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
      {!multiSheet && !excelGridData && uploadMode !== 'dwg' && (
        <Card className="mb-4">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Excel dosyasi yukleyin</p>
                <p className="text-sm text-muted-foreground">Fiyatlandirilacak kesif dosyanizi secin (.xlsx, .xls)</p>
              </div>
              <label htmlFor="quote-excel-upload" className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Dosya Sec
                <input
                  id="quote-excel-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    e.target.value = '';
                    setIsUploading(true);
                    try {
                      const formData = new FormData();
                      formData.append('file', f);
                      const gridRes = await api.post<MultiSheetData>('/excel-grid/prepare', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                      });
                      const multi = gridRes.data;
                      if (multi?.sheets?.length) {
                        setMultiSheet(multi);
                        const firstNonEmpty = multi.sheets.findIndex((s) => !s.isEmpty);
                        setActiveSheetIndex(firstNonEmpty >= 0 ? firstNonEmpty : 0);
                        const initialLive: Record<number, ExcelRowData[]> = {};
                        const initialDisc: Record<number, 'mechanical' | 'electrical' | null> = {};
                        multi.sheets.forEach((s) => {
                          initialLive[s.index] = s.rowData;
                          initialDisc[s.index] = s.discipline ?? null;
                        });
                        setLiveRowDataBySheet(initialLive);
                        setSheetDisciplines(initialDisc);
                        setTitle(f.name.replace(/\.[^.]+$/, ''));
                        // Orijinal dosya binary'sini base64'e cevir (kaydetme icin)
                        try {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const result = reader.result as string;
                            // data:application/...;base64,XXXX → sadece base64 kismini al
                            const base64 = result.split(',')[1] ?? result;
                            setOriginalFileBase64(base64);
                            setOriginalFileName(f.name);
                          };
                          reader.readAsDataURL(f);
                        } catch (e) {
                          console.warn('[quotes/new] File to base64 failed:', e);
                        }
                        const active = multi.sheets[firstNonEmpty >= 0 ? firstNonEmpty : 0];
                        if (active) {
                          setExcelGridData({
                            columnDefs: active.columnDefs,
                            rowData: active.rowData,
                            columnRoles: active.columnRoles,
                            brands: multi.brands,
                            headerEndRow: active.headerEndRow,
                          });
                        }
                        toast({ title: 'Analiz tamamlandi', description: `${multi.sheets.filter((s) => !s.isEmpty).length} sayfa yuklendi` });
                      }
                    } catch (err: any) {
                      toast({ title: 'Hata', description: err?.response?.data?.message ?? 'Dosya yuklenemedi', variant: 'destructive' });
                    } finally {
                      setIsUploading(false);
                    }
                  }}
                />
              </label>
              {isUploading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AG-Grid tabanli Excel gorunumu — multi-sheet destekli */}
      {(multiSheet || excelGridData) ? (
        <>
        {multiSheet && multiSheet.sheets.some((s) => !s.isEmpty) && (
          <div className="mb-2 text-xs text-muted-foreground">
            {multiSheet.sheets.filter((s) => !s.isEmpty).length} sayfa yuklendi
            {multiSheet.sheets.length > 1 && ' · Alt sekmeleri kullanarak gecis yap'}
          </div>
        )}
        {/* Toplu fiyatlandirma butonlari kaldirildi — marka secimi satir bazinda */}
        {false && (
          <div>
            <Button
              variant="default"
              size="sm"
              disabled={isMatchingAllSheets}
              onClick={async () => {
                if (!multiSheet) return;
                const brandId = allBrands[0]?.id;
                if (!brandId) {
                  toast({ title: 'Marka bulunamadi', variant: 'destructive' });
                  return;
                }
                setIsMatchingAllSheets(true);
                try {
                  const collected: { sheetIdx: number; rowIdx: number; name: string }[] = [];
                  multiSheet.sheets.forEach((sheet) => {
                    if (sheet.isEmpty) return;
                    const rows = liveRowDataBySheet[sheet.index] ?? sheet.rowData;
                    rows.forEach((row, rIdx) => {
                      if (!row._isDataRow) return;
                      const name = buildMaterialContextFromArray(rows, rIdx, sheet.columnRoles);
                      if (name && name.trim().length > 1) {
                        collected.push({ sheetIdx: sheet.index, rowIdx: rIdx, name });
                      }
                    });
                  });
                  if (collected.length === 0) {
                    toast({ title: 'Fiyatlandirilacak malzeme yok' });
                    return;
                  }
                  // 2. Dedupe
                  const uniqueNames = Array.from(new Set(collected.map((c) => c.name)));
                  // 3. Tek bulkMatch cagrisi
                  const { data: results } = await api.post('/matching/bulk-match', {
                    brandId,
                    materialNames: uniqueNames,
                  });
                  // 4. Sonuclari sheet bazinda dagit
                  const newCounts: Record<number, { total: number; matched: number }> = {};
                  setLiveRowDataBySheet((prev) => {
                    const next = { ...prev };
                    const sheetBucket: Record<number, ExcelRowData[]> = {};
                    collected.forEach(({ sheetIdx, rowIdx, name }) => {
                      const match = results[name];
                      if (!sheetBucket[sheetIdx]) sheetBucket[sheetIdx] = [...(next[sheetIdx] ?? [])];
                      const row = { ...sheetBucket[sheetIdx][rowIdx] };
                      const sheetDef = multiSheet.sheets.find((s) => s.index === sheetIdx)!;
                      const roles = sheetDef.columnRoles;
                      newCounts[sheetIdx] = newCounts[sheetIdx] ?? { total: 0, matched: 0 };
                      newCounts[sheetIdx].total++;
                      if (match && match.confidence === 'high' && match.netPrice > 0) {
                        const netPrice = parseFloat(String(match.netPrice)) || 0;
                        const qty = roles.quantityField ? parseFloat(String(row[roles.quantityField] ?? '')) || 0 : 0;
                        if (roles.materialUnitPriceField) row[roles.materialUnitPriceField] = netPrice.toFixed(2);
                        if (roles.materialTotalField) row[roles.materialTotalField] = (netPrice * qty).toFixed(2);
                        row._matNetPrice = netPrice;
                        row._marka = match.matchedName ?? null;
                        newCounts[sheetIdx].matched++;
                      }
                      sheetBucket[sheetIdx][rowIdx] = row;
                    });
                    Object.keys(sheetBucket).forEach((k) => { next[Number(k)] = sheetBucket[Number(k)]; });
                    return next;
                  });
                  setSheetMatchCounts(newCounts);
                  // Active sheet'in excelGridData'sini de guncelle
                  const active = multiSheet.sheets[activeSheetIndex];
                  if (active) {
                    setExcelGridData({
                      columnDefs: active.columnDefs,
                      rowData: liveRowDataBySheet[active.index] ?? active.rowData,
                      columnRoles: active.columnRoles,
                      brands: multiSheet.brands,
                      headerEndRow: active.headerEndRow,
                    });
                  }
                  const totalMatched = Object.values(newCounts).reduce((a, b) => a + b.matched, 0);
                  const totalItems = Object.values(newCounts).reduce((a, b) => a + b.total, 0);
                  toast({
                    title: `${multiSheet.sheets.filter((s) => !s.isEmpty).length} sayfa fiyatlandirildi`,
                    description: `${totalItems} malzeme, ${totalMatched} eslesti`,
                  });
                } catch (e: any) {
                  console.error('[matchAllSheets]', e);
                  toast({ title: 'Fiyatlandirma hatasi', description: e?.message ?? 'Bilinmeyen hata', variant: 'destructive' });
                } finally {
                  setIsMatchingAllSheets(false);
                }
              }}
            >
              {isMatchingAllSheets ? 'Fiyatlandiriliyor...' : 'Tum Sayfalari Fiyatlandir'}
            </Button>
            {hasAnyLabor && laborFirms.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={isMatchingLabor}
                onClick={async () => {
                  if (!multiSheet) return;
                  setIsMatchingLabor(true);
                  try {
                    // Her sheet icin disipline gore bir firma sec (ilk uygun firma)
                    const collected: Record<number, Array<{ rowIdx: number; name: string; firmaId: string }>> = {};
                    multiSheet.sheets.forEach((sheet) => {
                      if (sheet.isEmpty) return;
                      const disc = sheetDisciplines[sheet.index] ?? sheet.discipline;
                      if (!disc) return;
                      // Bu sheet icin labor capability var mi?
                      const labCap = disc === 'mechanical' ? capabilities.mechanical.labor : capabilities.electrical.labor;
                      if (!labCap) return;
                      // Firma sec — sheet bazinda kayitli yoksa ilk uygun firma
                      const firmaId = selectedFirmaBySheet[sheet.index] ?? laborFirms.find((f) => f.discipline === disc)?.id;
                      if (!firmaId) return;
                      const rows = liveRowDataBySheet[sheet.index] ?? sheet.rowData;
                      const sheetItems: Array<{ rowIdx: number; name: string; firmaId: string }> = [];
                      rows.forEach((row, rIdx) => {
                        if (!row._isDataRow) return;
                        const name = buildMaterialContextFromArray(rows, rIdx, sheet.columnRoles);
                        if (name && name.trim().length > 1) {
                          sheetItems.push({ rowIdx: rIdx, name, firmaId });
                        }
                      });
                      if (sheetItems.length > 0) collected[sheet.index] = sheetItems;
                    });

                    if (Object.keys(collected).length === 0) {
                      toast({ title: 'Iscilik fiyatlandirilacak sayfa yok' });
                      return;
                    }

                    let totalMatched = 0;
                    let totalItems = 0;
                    const newLive = { ...liveRowDataBySheet };

                    // Her firma icin ayri bulk-match cagrisi (firmalar farkli olabilir)
                    for (const [sheetIdxStr, items] of Object.entries(collected)) {
                      const sheetIdx = Number(sheetIdxStr);
                      const sheetDef = multiSheet.sheets.find((s) => s.index === sheetIdx)!;
                      const roles = sheetDef.columnRoles;
                      const firmaId = items[0].firmaId;
                      const uniqueNames = Array.from(new Set(items.map((i) => i.name)));
                      const { data: results } = await api.post('/labor-matching/bulk-match', {
                        firmaId,
                        laborNames: uniqueNames,
                      });
                      const sheetRows = [...(newLive[sheetIdx] ?? sheetDef.rowData)];
                      items.forEach(({ rowIdx, name }) => {
                        totalItems++;
                        const match = results[name];
                        if (match && match.confidence === 'high' && match.netPrice > 0) {
                          const netPrice = parseFloat(String(match.netPrice)) || 0;
                          const qty = roles.quantityField ? parseFloat(String(sheetRows[rowIdx][roles.quantityField] ?? '')) || 0 : 0;
                          const row = { ...sheetRows[rowIdx] };
                          if (roles.laborUnitPriceField) row[roles.laborUnitPriceField] = netPrice.toFixed(2);
                          if (roles.laborTotalField) row[roles.laborTotalField] = (netPrice * qty).toFixed(2);
                          row._labNetPrice = netPrice;
                          row._firma = match.matchedName ?? firmaId;
                          sheetRows[rowIdx] = row;
                          totalMatched++;
                        }
                      });
                      newLive[sheetIdx] = sheetRows;
                    }
                    setLiveRowDataBySheet(newLive);

                    // Active sheet'i guncelle
                    const active = multiSheet.sheets[activeSheetIndex];
                    if (active) {
                      setExcelGridData({
                        columnDefs: active.columnDefs,
                        rowData: newLive[active.index] ?? active.rowData,
                        columnRoles: active.columnRoles,
                        brands: multiSheet.brands,
                        headerEndRow: active.headerEndRow,
                      });
                    }
                    toast({
                      title: `Iscilik fiyatlandirildi`,
                      description: `${totalItems} kalem, ${totalMatched} eslesti`,
                    });
                  } catch (e: any) {
                    console.error('[matchAllLabor]', e);
                    toast({ title: 'Hata', description: e?.message ?? 'Bilinmeyen', variant: 'destructive' });
                  } finally {
                    setIsMatchingLabor(false);
                  }
                }}
              >
                {isMatchingLabor ? 'Iscilik fiyatlandiriliyor...' : 'Tum Sayfalari Iscilik Fiyatla'}
              </Button>
            )}
          </div>
        )}
        <ExcelGrid
          ref={excelGridRef}
          key={multiSheet ? `sheet-${activeSheetIndex}` : 'single'}
          data={
            multiSheet
              ? (() => {
                  const active = multiSheet.sheets[activeSheetIndex] ?? multiSheet.sheets.find((s) => !s.isEmpty);
                  if (!active || !Array.isArray(active.columnDefs) || active.columnDefs.length === 0) {
                    console.warn('[quotes/new] Active sheet missing columnDefs', { activeSheetIndex, active, sheets: multiSheet.sheets.map((s) => ({ name: s.name, idx: s.index, isEmpty: s.isEmpty, hasCols: Array.isArray(s.columnDefs), colCount: s.columnDefs?.length })) });
                    return {
                      columnDefs: [],
                      rowData: [],
                      columnRoles: {},
                      brands: multiSheet.brands ?? [],
                      headerEndRow: 0,
                    };
                  }
                  return {
                    columnDefs: active.columnDefs,
                    rowData: liveRowDataBySheet[active.index] ?? active.rowData ?? [],
                    columnRoles: active.columnRoles ?? {},
                    brands: multiSheet.brands ?? [],
                    headerEndRow: active.headerEndRow ?? 0,
                  };
                })()
              : excelGridData!
          }
          brands={allBrands}
          currencySymbol={currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₺'}
          conversionRate={conversionRate}
          laborFirms={laborFirms}
          sheetDiscipline={(() => {
            const idx = activeSheetIndex;
            return sheetDisciplines[idx] ?? multiSheet?.sheets[idx]?.discipline ?? null;
          })()}
          laborEnabled={(() => {
            const idx = activeSheetIndex;
            const disc = sheetDisciplines[idx] ?? multiSheet?.sheets[idx]?.discipline;
            if (disc === 'mechanical') return capabilities.mechanical.labor;
            if (disc === 'electrical') return capabilities.electrical.labor;
            return false;
          })()}
          onFirmaChange={async (rowIdx, firmaId, laborName) => {
            try {
              const { data: result } = await api.post('/labor-matching/bulk-match', {
                firmaId,
                laborNames: [laborName],
              });
              const match = result[laborName];
              if (!match) {
                toast({ title: 'Iscilik eslesmedi', description: `"${laborName.slice(0, 40)}"` });
                return null;
              }
              if (match.confidence === 'multi' && match.candidates?.length) {
                toast({ title: `⚠ ${match.candidates.length} aday`, description: match.reason ?? 'Birden fazla secenek var' });
                return { netPrice: 0, matchedName: match.matchedName, candidates: match.candidates, reason: match.reason };
              }
              if (match.netPrice > 0) {
                const netPrice = parseFloat(String(match.netPrice)) || 0;
                toast({
                  title: `🔧 ${displayPrice(netPrice)} (iscilik)`,
                  description: `Eslesti: ${match.matchedName?.slice(0, 80) ?? 'Bilinmeyen'}`,
                });
                return { netPrice, matchedName: match.matchedName, candidates: match.candidates, reason: match.reason };
              }
              // Eslesme bulundu ama fiyat 0 — kullaniciya uyari
              if (match.confidence === 'high' && match.matchedName) {
                toast({
                  title: `⚠ Iscilik fiyati 0`,
                  description: `"${match.matchedName.slice(0, 60)}" eslesti ama firma listesinde bu kalemin fiyati girilmemis. Kutuphaneye gidip iskonto/fiyat ekleyin.`,
                  variant: 'destructive',
                });
                return { netPrice: 0, matchedName: match.matchedName, candidates: match.candidates, reason: match.reason };
              }
              toast({ title: 'Iscilik eslesmedi', description: match.reason ?? `"${laborName.slice(0, 40)}"` });
              return null;
            } catch (e) {
              console.error('[FirmaDropdown] error:', e);
              return null;
            }
          }}
          onBrandChange={async (rowIdx, brandId, materialName) => {
            try {
              const { data: result } = await api.post('/matching/bulk-match', {
                brandId,
                materialNames: [materialName],
              });
              const match = result[materialName];
              if (!match) {
                toast({ title: 'Eslesmedi', description: `"${materialName.slice(0, 40)}"` });
                return null;
              }

              // Multi-match: kullaniciya secenek sun
              if (match.confidence === 'multi' && match.candidates?.length) {
                toast({ title: `⚠ ${match.candidates.length} aday`, description: match.reason ?? 'Birden fazla secenek var' });
                return { netPrice: 0, matchedName: match.matchedName, candidates: match.candidates, reason: match.reason };
              }

              // Tek eslesme basarili
              if (match.netPrice > 0) {
                const netPrice = parseFloat(String(match.netPrice)) || 0;
                // KATMAN 3: Gorsel dogrulama — kullanici hangi DB malzemesinin secildigini gorsun
                toast({
                  title: `🟢 ${displayPrice(netPrice)} — ${materialName.slice(0, 50)}`,
                  description: `Eslesti: ${match.matchedName?.slice(0, 80) ?? 'Bilinmeyen'}`,
                });
                return { netPrice, matchedName: match.matchedName, candidates: match.candidates, reason: match.reason };
              }

              // Eslesme bulundu ama fiyat 0 — kullaniciya uyari
              if (match.confidence === 'high' && match.matchedName) {
                toast({
                  title: `⚠ Malzeme fiyati 0`,
                  description: `"${match.matchedName.slice(0, 60)}" eslesti ama kutuphanede fiyat girilmemis. Kutuphaneye gidip fiyat ekleyin.`,
                  variant: 'destructive',
                });
                return { netPrice: 0, matchedName: match.matchedName, candidates: match.candidates, reason: match.reason };
              }

              // Eslesme yok
              toast({ title: 'Eslesmedi', description: match.reason ?? `"${materialName.slice(0, 40)}"` });
              return null;
            } catch (e) {
              console.error('[ExcelGrid] brand change error:', e);
              return null;
            }
          }}
        />
        {multiSheet && (
          <SheetTabs
            sheets={multiSheet.sheets.map((s) => ({
              name: s.name,
              index: s.index,
              isEmpty: s.isEmpty,
              discipline: sheetDisciplines[s.index] ?? s.discipline ?? null,
            }))}
            activeIndex={activeSheetIndex}
            onChange={(idx) => {
              setActiveSheetIndex(idx);
              const active = multiSheet.sheets[idx];
              if (active) {
                setExcelGridData({
                  columnDefs: active.columnDefs,
                  rowData: liveRowDataBySheet[active.index] ?? active.rowData,
                  columnRoles: active.columnRoles,
                  brands: multiSheet.brands,
                  headerEndRow: active.headerEndRow,
                });
              }
            }}
            onDisciplineChange={(sheetIdx, newDiscipline) => {
              setSheetDisciplines((prev) => ({ ...prev, [sheetIdx]: newDiscipline }));
            }}
            allowedDisciplines={{
              mechanical: capabilities.mechanical.material || capabilities.mechanical.labor,
              electrical: capabilities.electrical.material || capabilities.electrical.labor,
            }}
            matchCounts={sheetMatchCounts}
          />
        )}
        </>
      ) : uploadMode === 'pdf' ? (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {rows.length} satir
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => {
              setRows((prev) => [...prev, {
                _key: nextKey(),
                cells: Object.fromEntries(excelHeaders.map((h) => [h, ''])),
                materialKar: 0, laborKar: 0, brandId: null, laborFirmaId: null, _matNetPrice: 0, _labNetPrice: 0,
              }]);
            }}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Satir Ekle
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-auto">
            <table className="border-collapse border border-gray-200 dark:border-gray-700 text-xs" style={{ tableLayout: 'auto', width: '100%' }}>
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border bg-muted/60">
                  <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center text-muted-foreground" style={{ width: 32 }}>#</th>
                  {visibleHeaders.map((h) => {
                    const width = columnWidths[h] ?? 120;
                    return (
                      <th key={h} className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-left text-muted-foreground whitespace-nowrap text-xs relative group"
                        style={{ width, minWidth: 60, maxWidth: 600, overflow: 'hidden' }}>
                        <div className="truncate pr-2">{h}</div>
                        <div
                          onMouseDown={(e) => startColumnResize(e, h, width)}
                          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 z-20"
                          style={{ userSelect: 'none' }}
                          title="Genisligi ayarla"
                        />
                      </th>
                    );
                  })}
                  {/* Malz. Kar % — toplu atama */}
                  <th className="border border-gray-200 dark:border-gray-700 px-1 py-1 text-primary w-20 bg-blue-50/50 dark:bg-blue-950/20">
                    <div className="text-xs whitespace-nowrap mb-1">Malz. Kar %</div>
                    <Input type="number" min={0} step={1} placeholder="Tumu"
                      onChange={(e) => {
                        const kar = parseFloat(e.target.value);
                        if (!isNaN(kar)) {
                          setRows((prev) => prev.map((r) => {
                            const updated = { ...r, materialKar: kar };
                            if (r._matNetPrice > 0 && priceCol) {
                              const finalPrice = r._matNetPrice * (1 + kar / 100);
                              const qty = qtyCol ? (parseFloat(String(r.cells[qtyCol])) || 0) : 0;
                              const newCells = { ...r.cells };
                              if (priceCol) newCells[priceCol] = parseFloat(finalPrice.toFixed(2));
                              if (totalCol) newCells[totalCol] = parseFloat((finalPrice * qty).toFixed(2));
                              return { ...updated, cells: newCells };
                            }
                            return updated;
                          }));
                        }
                      }}
                      className="h-6 w-full border bg-white dark:bg-gray-900 px-1 text-right text-xs rounded" />
                  </th>
                  {isPro && (
                    <th className="border border-gray-200 dark:border-gray-700 px-1 py-1 text-primary w-20 bg-blue-50/50 dark:bg-blue-950/20">
                      <div className="text-xs whitespace-nowrap mb-1">Isc. Kar %</div>
                      <Input type="number" min={0} step={1} placeholder="Tumu"
                        onChange={(e) => {
                          const kar = parseFloat(e.target.value);
                          if (!isNaN(kar)) setRows((prev) => prev.map((r) => ({ ...r, laborKar: kar })));
                        }}
                        className="h-6 w-full border bg-white dark:bg-gray-900 px-1 text-right text-xs rounded" />
                    </th>
                  )}
                  {/* Malz. Marka — toplu atama */}
                  <th className="border border-gray-200 dark:border-gray-700 px-1 py-1 text-primary min-w-[110px] bg-blue-50/50 dark:bg-blue-950/20">
                    <div className="text-xs whitespace-nowrap mb-1">Malz. Marka</div>
                    <select
                      onChange={(e) => {
                        const brandId = e.target.value;
                        if (!brandId) return;
                        // Tum miktari olan satirlara marka ata ve eslestirme yap
                        rows.forEach((row, idx) => {
                          const qty = qtyCol ? parseFloat(String(row.cells[qtyCol] ?? '')) : NaN;
                          if (isNaN(qty) || qty <= 0) return;
                          const matName = buildMaterialContext(idx);
                          handleBrandChange(row._key, brandId, matName);
                        });
                      }}
                      className="h-6 w-full rounded border bg-white dark:bg-gray-900 px-1 text-xs"
                      defaultValue=""
                    >
                      <option value="">Tumu</option>
                      {allBrands.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                    </select>
                  </th>
                  {isPro && (
                    <th className="border border-gray-200 dark:border-gray-700 px-1 py-1 text-primary min-w-[110px] bg-blue-50/50 dark:bg-blue-950/20">
                      <div className="text-xs whitespace-nowrap mb-1">Isc. Firma</div>
                      <select
                        onChange={(e) => {
                          const firmaId = e.target.value;
                          if (!firmaId) return;
                          setRows((prev) => prev.map((r) => ({ ...r, laborFirmaId: firmaId })));
                        }}
                        className="h-6 w-full rounded border bg-white dark:bg-gray-900 px-1 text-xs"
                        defaultValue=""
                      >
                        <option value="">Tumu</option>
                        {allBrands.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                      </select>
                    </th>
                  )}
                  <th className="border border-gray-200 dark:border-gray-700 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  // Baglamsal tanimlama: parent row'lardan tam malzeme adi olustur
                  const materialNameForLookup = buildMaterialContext(idx);

                  // Bu satir gercek bir malzeme satiri mi? (miktari olan)
                  const rowQty = qtyCol ? parseFloat(String(row.cells[qtyCol] ?? '')) : NaN;
                  const isDataRow = !isNaN(rowQty) && rowQty > 0;

                  return (
                    <tr key={row._key} className="hover:bg-blue-50/30 dark:hover:bg-blue-950/10">
                      <td className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-muted-foreground text-center">{idx + 1}</td>
                      {/* Excel sutunlari — sadece gorunur olanlar */}
                      {visibleHeaders.map((h) => {
                        const isCurrencyCol = h === priceCol || h === totalCol;
                        const rawVal = row.cells[h] ?? '';
                        const numVal = parseFloat(String(rawVal));
                        const colWidth = columnWidths[h] ?? 120;
                        // Para birimi sutunlarinda donusturulmus deger goster
                        const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₺';
                        const convertedVal = isCurrencyCol && !isNaN(numVal) && numVal > 0
                          ? (numVal * conversionRate).toFixed(2)
                          : '';

                        // Coklu aday varsa fiyat hucresinde secenekleri goster
                        const showCandidates = h === priceCol && row._candidates && row._candidates.length > 0;
                        // Asama 1: sadece surfaceLevel adaylar (yuzey/cins farki). Asama 2: tumu
                        const candidateList = showCandidates
                          ? (row._showAllCandidates
                              ? row._candidates!
                              : row._candidates!.filter((c: MatchCandidate) => c.surfaceLevel))
                          : [];
                        const hasMoreCandidates = showCandidates && !row._showAllCandidates && row._candidates!.length > candidateList.length;

                        return (
                          <td key={h} className="border border-gray-200 dark:border-gray-700 px-1 py-0.5" style={{ width: colWidth, maxWidth: colWidth, overflow: 'hidden' }}>
                            {showCandidates ? (
                              <div className="text-xs">
                                <div className="text-amber-600 font-medium mb-1">⚠ Secin:</div>
                                {candidateList.map((c: MatchCandidate, ci: number) => (
                                  <button key={ci}
                                    className="block w-full text-left px-1 py-0.5 hover:bg-blue-50 dark:hover:bg-blue-950 rounded text-xs"
                                    onClick={() => {
                                      const netPrice = c.netPrice;
                                      setRows((prev) => prev.map((r) => {
                                        if (r._key !== row._key) return r;
                                        const kar = parseFloat(String(r.materialKar)) || 0;
                                        const fp = netPrice * (1 + kar / 100);
                                        const qty = qtyCol ? (parseFloat(String(r.cells[qtyCol])) || 0) : 0;
                                        const nc = { ...r.cells };
                                        if (priceCol) nc[priceCol] = parseFloat(fp.toFixed(2));
                                        if (totalCol) nc[totalCol] = parseFloat((fp * qty).toFixed(2));
                                        return { ...r, _matNetPrice: netPrice, _candidates: null, cells: nc };
                                      }));
                                      toast({ title: `🟢 ${c.label}`, description: `${displayPrice(netPrice)} — ${c.materialName.slice(0, 50)}` });
                                    }}
                                  >
                                    <span className="font-medium">{c.popular && '★ '}{c.label}</span>
                                    <span className="text-muted-foreground"> — {displayPrice(c.netPrice)}</span>
                                  </button>
                                ))}
                                {hasMoreCandidates && (
                                  <button className="text-blue-600 text-xs px-1 mt-0.5 hover:underline"
                                    onClick={() => setRows((prev) => prev.map((r) => r._key === row._key ? { ...r, _showAllCandidates: true } : r))}>
                                    ▸ Digerleri ({row._candidates!.length - candidateList.length})
                                  </button>
                                )}
                                {row._showAllCandidates && (
                                  <button className="text-gray-500 text-xs px-1 mt-0.5 hover:underline"
                                    onClick={() => setRows((prev) => prev.map((r) => r._key === row._key ? { ...r, _showAllCandidates: false } : r))}>
                                    ▴ Gizle
                                  </button>
                                )}
                              </div>
                            ) : isCurrencyCol && !isNaN(numVal) && numVal > 0 ? (
                              <span className="block h-7 leading-7 px-1 text-xs text-right tabular-nums">
                                {currencySymbol}{convertedVal}
                              </span>
                            ) : (
                              <Input
                                type="text"
                                value={String(rawVal)}
                                onChange={(e) => updateCellAndCalc(row._key, h, e.target.value)}
                                className="h-7 w-full border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              />
                            )}
                          </td>
                        );
                      })}
                      {/* === SISTEM SUTUNLARI === */}
                      {/* Malz. Kar % — sadece veri satirinda */}
                      <td className="border border-gray-200 dark:border-gray-700 px-1 py-0.5 bg-blue-50/50 dark:bg-blue-950/20">
                        {isDataRow ? (
                          <div className="flex items-center gap-0.5">
                            <Input type="number" min={0} step={1} value={row.materialKar}
                              onChange={(e) => handleMatKarChange(row._key, parseFloat(e.target.value) || 0)}
                              className="h-7 w-full border-0 bg-transparent px-1 text-right text-xs shadow-none focus-visible:ring-1" />
                            {row.materialKar > 0 && (
                              <button title="Asagiya kopyala" className="text-muted-foreground hover:text-primary text-xs px-0.5"
                                onClick={() => {
                                  const kar = row.materialKar;
                                  setRows((prev) => prev.map((r, i) => {
                                    if (i <= idx) return r;
                                    const updated = { ...r, materialKar: kar };
                                    if (r._matNetPrice > 0 && priceCol) {
                                      const fp = r._matNetPrice * (1 + kar / 100);
                                      const q = qtyCol ? (parseFloat(String(r.cells[qtyCol])) || 0) : 0;
                                      const nc = { ...r.cells };
                                      if (priceCol) nc[priceCol] = parseFloat(fp.toFixed(2));
                                      if (totalCol) nc[totalCol] = parseFloat((fp * q).toFixed(2));
                                      return { ...updated, cells: nc };
                                    }
                                    return updated;
                                  }));
                                }}>↓</button>
                            )}
                          </div>
                        ) : null}
                      </td>
                      {/* Isc. Kar % (Pro+) */}
                      {isPro && (
                        <td className="border border-gray-200 dark:border-gray-700 px-1 py-0.5 bg-blue-50/50 dark:bg-blue-950/20">
                          {isDataRow ? (
                            <Input type="number" min={0} step={1} value={row.laborKar}
                              onChange={(e) => handleLabKarChange(row._key, parseFloat(e.target.value) || 0)}
                              className="h-7 w-full border-0 bg-transparent px-1 text-right text-xs shadow-none focus-visible:ring-1" />
                          ) : null}
                        </td>
                      )}
                      {/* Malz. Marka — sadece veri satirinda */}
                      <td className="border border-gray-200 dark:border-gray-700 px-1 py-0.5 bg-blue-50/50 dark:bg-blue-950/20">
                        {isDataRow ? (
                          <div className="flex items-center gap-0.5">
                            <select
                              value={row.brandId ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleBrandChange(row._key, val, materialNameForLookup);
                              }}
                              className="h-7 w-full rounded border border-gray-200 bg-transparent px-1 text-xs"
                            >
                              <option value="">Marka</option>
                              {allBrands.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                            </select>
                            {row.brandId && (
                              <button title="Asagiya kopyala" className="text-muted-foreground hover:text-primary text-xs px-0.5"
                                onClick={() => {
                                  const brandId = row.brandId!;
                                  rows.forEach((r, i) => {
                                    if (i <= idx) return;
                                    const qty = qtyCol ? parseFloat(String(r.cells[qtyCol] ?? '')) : NaN;
                                    if (isNaN(qty) || qty <= 0) return;
                                    const matName = buildMaterialContext(i);
                                    handleBrandChange(r._key, brandId, matName);
                                  });
                                }}>↓</button>
                            )}
                          </div>
                        ) : null}
                      </td>
                      {/* Isc. Firma (Pro+) */}
                      {isPro && (
                        <td className="border border-gray-200 dark:border-gray-700 px-1 py-0.5 bg-blue-50/50 dark:bg-blue-950/20">
                          {isDataRow ? (
                            <select
                              value={row.laborFirmaId ?? ''}
                              onChange={(e) => handleFirmaChange(row._key, e.target.value, materialNameForLookup)}
                              className="h-7 w-full rounded border border-gray-200 bg-transparent px-1 text-xs"
                            >
                              <option value="">Firma</option>
                              {allBrands.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                            </select>
                          ) : null}
                        </td>
                      )}
                      {/* Sil */}
                      <td className="border border-gray-200 dark:border-gray-700 px-1">
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setRows((p) => p.filter((r) => r._key !== row._key))}>
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-bold">
                  <td colSpan={visibleHeaders.length + 1} className="border border-gray-200 dark:border-gray-700 px-2 py-3 text-right text-sm">GENEL TOPLAM</td>
                  <td colSpan={isPro ? 4 : 2} className="border border-gray-200 dark:border-gray-700 px-2 py-3 text-center text-sm">{displayPrice(grandTotal)}</td>
                  <td className="border border-gray-200 dark:border-gray-700"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
      ) : uploadMode !== 'dwg' ? (
        <div className="rounded border-2 border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-muted-foreground">
          Excel yukleniyor veya Excel goruntu alinamadi. Geri donup tekrar yuklemeyi deneyin.
        </div>
      ) : null}

      {/* Save — sadece excelGridData varsa goster */}
      {excelGridData && (
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Teklifi Kaydet
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
