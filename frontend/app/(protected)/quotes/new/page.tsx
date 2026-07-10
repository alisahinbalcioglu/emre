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
import { parseMaterialText } from '@/lib/parse-material-text';
import { mergeMultiSheet } from '@/lib/merge-multisheet';
import { hesaplaSatisBirimFiyat, hesaplaSatirToplam } from '@/lib/pricing';
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

/** DWG Workspace'ten gelindi isareti — sayfa yenilense bile "Çizime / Projeye
 *  Dön" butonu korunur (state degil, sessionStorage; teklif kaydedilince silinir). */
const FROM_DWG_KEY = 'metaprice_quote_from_dwg';

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

    // Onceki oturumda DWG'den gelinmisti ve sayfa yenilendi — "Çizime /
    // Projeye Dön" butonu kaybolmasin (draft restore ile birlikte calisir).
    try {
      if (sessionStorage.getItem(FROM_DWG_KEY) === '1') setCameFromDwg(true);
    } catch {}

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
      // Geri butonu artik "Cizime Don" olarak calisir (DWG state /dwg-workspace'te
      // localStorage'da korunuyor). Kullanici dashboard'a atilmaz.
      setCameFromDwg(true);
      try { sessionStorage.setItem(FROM_DWG_KEY, '1'); } catch {}
      if (!stored) return;
      try {
        const { metraj, fileName } = JSON.parse(stored) as {
          metraj: MetrajResult;
          fileName: string;
        };
        // ── DOGRU VERI ESLESTIRMESI (manuel etiketleme mimarisi) ──
        //   seg.layer     = Layer/sistem adi (orn "a-yagmur")   -> "Hat / Sistem"
        //   seg.diameter  = kullanicinin bucket/kalem metni       -> "Malzeme ve Cap"
        //                   (orn "Ø160 HDPE BORU")
        //   Ekipman satirlari (material_type "Ekipman..." ile baslar) ayri: kalem
        //   metni ekipman etiketidir, "sistem" yok -> Hat/Sistem = "Ekipman".
        //
        // (Hat/Sistem, Malzeme ve Cap, Birim) bazinda groupBy — ayni kalemin
        // farkli layer'lardaki uzunluklari ayri satir kalir, cap bazli toplam.
        const grouped = new Map<
          string,
          { hatSistem: string; malzemeCap: string; unit: string; totalQty: number }
        >();
        const add = (hatSistem: string, malzemeCap: string, unit: string, qty: number) => {
          const key = `${hatSistem}__${malzemeCap}__${unit}`;
          const entry = grouped.get(key);
          if (entry) entry.totalQty += qty;
          else grouped.set(key, { hatSistem, malzemeCap, unit, totalQty: qty });
        };
        for (const layer of metraj.layers) {
          if (layer.segments && layer.segments.length > 0) {
            for (const seg of layer.segments) {
              const isEquip = (seg.material_type || '').startsWith('Ekipman');
              if (isEquip) {
                // "Ekipman · {birim} (marka) [specs]" -> birim ayikla
                const m = (seg.material_type || '').match(/Ekipman\s*·\s*([^\s(]+)/);
                const unit = m?.[1]?.trim() || 'adet';
                // Ekipman kalem metni = layer alani (handleConfirmAll g.label'i buraya koyar)
                const label = seg.layer || layer.hat_tipi || layer.layer || 'Ekipman';
                add('Ekipman', label, unit, seg.length || 0);
              } else {
                const hatSistem = seg.layer || layer.hat_tipi || layer.layer || '';
                const malzemeCap = seg.diameter || 'Belirtilmemis';
                add(hatSistem, malzemeCap, 'm', seg.length || 0);
              }
            }
          } else {
            // Segment'siz layer (nadir) — sistem adi bilinir, kalem metni yok
            const hatSistem = layer.hat_tipi || layer.layer || '';
            add(hatSistem, 'Belirtilmemis', 'm', layer.length || 0);
          }
        }
        // ── EXCEL-VARI YAPI (spreadsheet UX) ──
        // 1) Hat/Sistem artik SUTUN DEGIL, GRUP BANDI: _isGroupRow satirlari
        //    ExcelGrid'de full-width bant olarak cizilir (Excel'deki gibi).
        // 2) Kalem metni regex ile ikiye ayrilir: "Ø110 PVC BORU" →
        //    Çapı="Ø110", Malzeme Cinsi="PVC BORU" (parse-material-text).
        //    Eslestirme/kayit aninda tekrar birlestirilir (diameterField).
        // 3) Fiyatlandirma sistem kolonlari eklendi (Kar %, Marka, Birim
        //    Fiyat, Tutar) — Excel yolundaki grid ile ayni deneyim, GENEL
        //    TOPLAM pinned satiri da otomatik gelir.
        // 4) En altta HEP bos satir (autoAppendRow) — 'Satir Ekle' butonu YOK.
        const byHat = new Map<string, Array<{ malzemeCap: string; unit: string; totalQty: number }>>();
        grouped.forEach((g) => {
          let arr = byHat.get(g.hatSistem);
          if (!arr) { arr = []; byHat.set(g.hatSistem, arr); }
          arr.push(g);
        });
        const emptyDataFields = {
          'Malzeme Cinsi': '', 'Çapı': '', 'Birim': '', 'Miktar': '',
          'Birim Fiyat': '', 'Tutar': '',
        };
        const rows: ExcelRowData[] = [];
        let rowIdx = 0;
        byHat.forEach((items, hat) => {
          rows.push({
            _rowIdx: rowIdx++, _isDataRow: false, _isHeaderRow: false,
            _isGroupRow: true, _groupLabel: hat, _groupCount: items.length,
            ...emptyDataFields,
          });
          items.sort((a, b) => b.totalQty - a.totalQty);
          for (const it of items) {
            const { cap, cins } = parseMaterialText(it.malzemeCap);
            rows.push({
              _rowIdx: rowIdx++, _isDataRow: true, _isHeaderRow: false,
              _malzKar: 0, _marka: null, _matNetPrice: 0,
              'Malzeme Cinsi': cins || it.malzemeCap,
              'Çapı': cap,
              'Birim': it.unit,
              'Miktar': it.totalQty.toFixed(2),
              'Birim Fiyat': '',
              'Tutar': '',
            });
          }
        });
        // En altta hep bos satir — kullanici yazmaya baslayinca otomatik
        // yeni satir olusur (ExcelGrid autoAppendRow).
        rows.push({
          _rowIdx: rowIdx++, _isDataRow: true, _isHeaderRow: false,
          _isSpareRow: true, _malzKar: 0, _marka: null, _matNetPrice: 0,
          ...emptyDataFields,
        });
        const columnDefs = [
          { field: 'Malzeme Cinsi', headerName: 'Malzeme Cinsi', width: 240, editable: true },
          { field: 'Çapı', headerName: 'Çapı', width: 90, editable: true },
          { field: 'Birim', headerName: 'Birim', width: 70, editable: true },
          { field: 'Miktar', headerName: 'Miktar', width: 90, editable: true },
          { field: '_malzKar', headerName: 'Malz. Kar %', width: 100 },
          { field: '_marka', headerName: 'Malz. Marka', width: 150, cellRenderer: 'brandRenderer' },
          { field: 'Birim Fiyat', headerName: 'Birim Fiyat', width: 110, editable: true },
          { field: 'Tutar', headerName: 'Tutar', width: 120 },
        ];
        // nameField=Cins, diameterField=Çap: marka eslestirme adi grid icinde
        // "Çap + Cins" (orn "Ø110 PVC BORU") olarak birlestirilir — cins tek
        // basina fiyat listesinde bulunamaz.
        const dwgColumnRoles = {
          nameField: 'Malzeme Cinsi',
          diameterField: 'Çapı',
          quantityField: 'Miktar',
          unitField: 'Birim',
          materialUnitPriceField: 'Birim Fiyat',
          materialTotalField: 'Tutar',
        };
        setExcelGridData({
          columnDefs,
          rowData: rows,
          columnRoles: dwgColumnRoles,
          brands: allBrands,
          headerEndRow: 0,
        });
        // KAYDETME + DRAFT KALICILIGI: handleSave items'i multiSheet'ten kurar
        // ve draft-persist effect'i yalniz multiSheet varken calisir. Tek-sheet
        // MultiSheet olarak da yaz — yoksa "Teklifi Kaydet" BOS teklif kaydeder
        // ve sayfa yenilenince tablo kaybolur (MetrajEditor yoluyla ayni desen).
        const multiData: MultiSheetData = {
          sheets: [{
            index: 0,
            name: 'DWG Metraj',
            isEmpty: false,
            discipline: 'mechanical' as const,
            columnDefs,
            rowData: rows,
            columnRoles: dwgColumnRoles,
            headerEndRow: 0,
          }],
          brands: allBrands,
        };
        setMultiSheet(multiData);
        setActiveSheetIndex(0);
        setLiveRowDataBySheet({ 0: rows });
        setTitle(fileName.replace(/\.[^.]+$/, '') + ' — DWG Metraj');
        const itemCount = rows.filter((r) => r._isDataRow && !r._isSpareRow).length;
        toast({ title: 'Metraj onaylandi', description: `${itemCount} kalem fiyatlandirmaya aktarildi` });
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
      // YENI DOSYA GELDI → eski draft'i TEMIZLE. Yoksa asagidaki draft-restore
      // efekti bayat taslagi geri yukleyip yeni yuklemeyi eziyordu ("surekli
      // ayni dosyayi aciyor"). Yeni dosya tek dogruluk kaynagi.
      sessionStorage.removeItem('metaprice_quote_draft');

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
      // KUTUPHANEM IZOLASYONU: data.brands (global havuz) ARTIK dropdown'i
      // beslemez — mount'taki /library/brands fetch'i tek dogruluk kaynagi.
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
  // DWG Workspace'ten mi gelindi? Evetse "Geri" butonu dashboard yerine
  // /dwg-workspace'e (cizime) doner — metraj/etiketleme state'i localStorage'da
  // korunur, kullanici projeden atilmaz.
  const [cameFromDwg, setCameFromDwg] = useState(false);
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
  // Draft sema surumu — eski/bozuk draft'lar restore EDILMEZ, otomatik silinir.
  // Sema degistiginde artir.
  //   v2: multi-sheet tek-kopya draft
  //   v3: SABIT SEMA — eski draft'ta nameField marka sutununu, fiyat Excel
  //       sutununu gosteriyordu; sabit sistem sutunlari (_matBirim...) yok.
  //       Eski draft yuklenirse fiyat eslesmez → zorla temizle.
  const DRAFT_VERSION = 3;

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

  // ── KUTUPHANEM IZOLASYONU (PRD) ──
  // Marka dropdown'i GLOBAL Malzeme Havuzu'ndan DEGIL, kullanicinin kendi
  // kutuphanesindeki markalardan beslenir. Akis: Havuz'da begen → "Kutuphaneme
  // Aktar" → fiyat/iskontoyu ozgurce duzenle → teklif SADECE bu veriyi okur.
  useEffect(() => {
    api.get<Brand[]>('/library/brands')
      .then(({ data }) => setAllBrands(data ?? []))
      .catch(() => {});
  }, []);
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
      // SURUM KONTROLU: eski semali draft'lar (multi-sheet bug doneminden
      // kalma tek-sheet'li olanlar dahil) restore edilmez — "yeni Excel
      // yukledim ama tek sekme geldi" bayat-state semptomunun kok cozumu.
      if (draft.v !== DRAFT_VERSION) {
        sessionStorage.removeItem(DRAFT_KEY);
        console.log('[quotes/new] Eski surumlu draft atildi (v=' + draft.v + ')');
        return;
      }
      if (draft.multiSheet) {
        // v2 semasi: tek kopya — live rowData zaten sheets[i].rowData icinde.
        const restoredLive: Record<number, ExcelRowData[]> = {};
        (draft.multiSheet.sheets ?? []).forEach((s: any) => {
          restoredLive[s.index] = s.rowData ?? [];
        });
        setMultiSheet(draft.multiSheet);
        setActiveSheetIndex(draft.activeSheetIndex ?? 0);
        setLiveRowDataBySheet(restoredLive);
        setSheetDisciplines(draft.sheetDisciplines ?? {});
        setTitle(draft.title ?? '');
        setAllBrands(draft.allBrands ?? []);
        const activeIdx = draft.activeSheetIndex ?? 0;
        const active = draft.multiSheet.sheets?.[activeIdx];
        if (active && Array.isArray(active.columnDefs)) {
          setExcelGridData({
            columnDefs: active.columnDefs,
            rowData: restoredLive[active.index] ?? active.rowData,
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
          const live = restoredLive;
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
                        const satisRestore = hesaplaSatisBirimFiyat(match.netPrice, parseFloat(String(row._malzKar ?? 0)) || 0);
                        row[roles.materialUnitPriceField] = satisRestore.toFixed(1);
                        const qty = roles.quantityField ? parseFloat(String(row[roles.quantityField] ?? '')) || 0 : 0;
                        if (roles.materialTotalField) row[roles.materialTotalField] = hesaplaSatirToplam(satisRestore, qty).toFixed(1);
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
      // TEK KOPYA (v2): live rowData sheets'in icine gomulur — eski sema ayni
      // veriyi iki kez yazip buyuk dosyalarda sessionStorage kotasini asiyordu
      // (setItem sessizce fail → bayat draft restore → "sekmeler kayboldu").
      const draftMulti = {
        ...multiSheet,
        sheets: multiSheet.sheets.map((s) => ({
          ...s,
          rowData: liveRowDataBySheet[s.index] ?? s.rowData,
        })),
      };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        v: DRAFT_VERSION,
        multiSheet: draftMulti,
        activeSheetIndex,
        sheetDisciplines,
        title,
        allBrands,
      }));
    } catch (e) {
      // Kota vb. hata: ESKI draft'i birakma — bayat state restore edilmesin.
      // (Kayit yapilamiyorsa refresh'te bos baslamak, yanlis/eski veriyle
      // baslamaktan iyidir.)
      sessionStorage.removeItem(DRAFT_KEY);
      console.warn('[quotes/new] Draft save failed, eski draft temizlendi:', e);
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

  /** ── VERI KORUMALI EXCEL YUKLEME (PRD) ──
   * Yeni Excel mevcut grid'i EZMEZ: sheet'ler ada, satirlar poz+ad anahtarina
   * gore MERGE edilir — kullanicinin kar marji/marka/fiyat emegi korunur,
   * eslesen pozlarin kaynak hucreleri (miktar vb.) dosyadan guncellenir,
   * yeni satir/sheet eklenir, yalniz eskide olanlar sona tasinir. */
  function applyIncomingMultiSheet(multi: MultiSheetData) {
    let merged: MultiSheetData;
    let live: Record<number, ExcelRowData[]>;
    let stats: ReturnType<typeof mergeMultiSheet>['stats'];
    try {
      ({ merged, live, stats } = mergeMultiSheet(multiSheet, liveRowDataBySheet, multi));
    } catch (e) {
      // Merge patlarsa dosyadan geleni DOGRUDAN uygula — eski gorunumun
      // ekranda kalmasi (sekmelerin "kaybolmasi") en kotu senaryodur.
      console.error('[quotes/new] merge hatasi, dosya dogrudan uygulaniyor:', e);
      merged = multi;
      live = {};
      multi.sheets.forEach((s) => { live[s.index] = s.rowData; });
      stats = { matchedRows: 0, newRows: 0, preservedRows: 0, newSheets: multi.sheets.length };
    }
    setMultiSheet(merged);
    setLiveRowDataBySheet(live);
    const firstNonEmpty = merged.sheets.findIndex((s) => !s.isEmpty);
    const activeIdx = firstNonEmpty >= 0 ? firstNonEmpty : 0;
    setActiveSheetIndex(activeIdx);
    setSheetDisciplines((prevDisc) => {
      const d: Record<number, 'mechanical' | 'electrical' | null> = {};
      merged.sheets.forEach((s) => { d[s.index] = s.discipline ?? prevDisc[s.index] ?? null; });
      return d;
    });
    const active = merged.sheets[activeIdx];
    if (active && Array.isArray(active.columnDefs)) {
      setExcelGridData({
        columnDefs: active.columnDefs,
        rowData: live[active.index] ?? active.rowData,
        columnRoles: active.columnRoles,
        brands: allBrands,
        headerEndRow: active.headerEndRow,
      });
    }
    const filledCount = merged.sheets.filter((s) => !s.isEmpty).length;
    if (multiSheet) {
      toast({
        title: 'Excel birleştirildi — verileriniz korundu',
        description: `${stats.matchedRows} satır güncellendi · ${stats.newRows} yeni · ${stats.preservedRows} eski satır korundu${stats.newSheets ? ` · ${stats.newSheets} yeni sayfa` : ''}`,
      });
    } else {
      // Ilk yukleme: kullanici kac sayfanin acildigini HEMEN gorsun —
      // "sekmeler kayboldu mu?" belirsizligini bitirir.
      toast({
        title: 'Excel yüklendi',
        description: `${merged.sheets.length} sayfa okundu, ${filledCount} veri sayfası açıldı.`,
      });
    }
    return stats;
  }

  function handleModeSwitch(mode: UploadMode) {
    setUploadMode(mode);
    setFile(null);
  }

  // ── Malzeme Adı düzeltme: kullanıcı hangi Excel sütununun malzeme adı
  //    olduğunu değiştirebilir (otomatik tespit yanlışsa). Aktif sayfanın
  //    columnRoles.nameField'ini günceller → eşleştirme yeni sütunu okur.
  function handleNameFieldChange(newField: string) {
    setMultiSheet((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sheets: prev.sheets.map((s) =>
          s.index === activeSheetIndex
            ? { ...s, columnRoles: { ...s.columnRoles, nameField: newField } }
            : s,
        ),
      };
    });
    setExcelGridData((prev) =>
      prev ? { ...prev, columnRoles: { ...prev.columnRoles, nameField: newField } } : prev,
    );
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
            // Not: Backend /excel-grid/prepare fiyatlari ARTIK SILMIYOR
            // (stripPrices:false — 2026-07-07 kullanici karari): dosyadaki
            // fiyatlar grid'e oldugu gibi gelir.
            // VERI KORUMA: mevcut grid EZILMEZ — merge (kar/marka/fiyat korunur).
            applyIncomingMultiSheet(multi);
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
      // KUTUPHANEM IZOLASYONU: data.brands (global havuz) ARTIK dropdown'i
      // beslemez — mount'taki /library/brands fetch'i tek dogruluk kaynagi.
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
            if (!r._isDataRow || r._isGroupRow || r._isSpareRow) return;
            // AKILLI SUTUN: Çapı ayri sutundaysa kayit adi = "Çap + Cins"
            // (orn "Ø110 PVC BORU") — PDF/Excel ciktisinda tam metin gorunur.
            const baseName = roles.nameField ? String(r[roles.nameField] ?? '').trim() : '';
            const diaVal = roles.diameterField ? String(r[roles.diameterField] ?? '').trim() : '';
            const matName = [diaVal, baseName].filter(Boolean).join(' ');
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
          // Spare (en alttaki bos) satir kayda girmez; grup bandi satirlari
          // gorunum icin SAKLANIR (detay sayfasi ayni bantlari cizer).
          rowData: (liveRowDataBySheet[s.index] ?? s.rowData).filter((r) => !r._isSpareRow),
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
      sessionStorage.removeItem(FROM_DWG_KEY);

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
            // DWG'den gelindiyse cizime don — /dwg-workspace DwgUploader mount'ta
            // localStorage'daki session'i (fileId + hash) /status ile dogrulayip
            // workspace'i etiketlerle birlikte geri acar. Aksi halde dashboard.
            // Draft sessionStorage'da kalir (kaldigi yerden devam edebilir).
            if (cameFromDwg) {
              router.push('/dwg-workspace');
            } else {
              router.push('/dashboard');
            }
          }}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {cameFromDwg ? 'Çizime / Projeye Dön' : 'Geri'}
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
                        // VERI KORUMA: mevcut grid EZILMEZ — merge
                        applyIncomingMultiSheet(multi);
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
                        // setExcelGridData'yi applyIncomingMultiSheet zaten yapti;
                        // merge toast'i da orada (once yukleme varsa) gosterilir.
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
        {/* MALZEME ADI DÜZELTME ÇUBUĞU — otomatik tespit yanlışsa düzelt.
            Fiyat eşleştirme bu sütunu okur; yanlış sütun (örn marka metni)
            seçiliyse fiyat bulunamaz. */}
        {(() => {
          const activeSheet = multiSheet?.sheets.find((s) => s.index === activeSheetIndex);
          if (!activeSheet || activeSheet.isEmpty) return null;
          const excelCols = (activeSheet.columnDefs ?? []).filter(
            (c) => c.field && !c.field.startsWith('_'),
          );
          if (excelCols.length === 0) return null;
          const current = activeSheet.columnRoles?.nameField ?? '';
          return (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-1.5 text-xs">
              <span className="font-medium text-slate-700">Malzeme Adı sütunu:</span>
              <select
                value={current}
                onChange={(e) => handleNameFieldChange(e.target.value)}
                className="h-7 rounded border border-slate-300 bg-white px-2 text-xs"
              >
                {excelCols.map((c) => (
                  <option key={c.field} value={c.field}>{c.headerName}</option>
                ))}
              </select>
              <span className="text-slate-500">
                (Fiyat eşleşmiyorsa doğru sütunu seçin — marka değil, malzeme/çap sütunu)
              </span>
            </div>
          );
        })()}
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
                      // 'high' (kesin) + 'suggestion' (oneri) fiyat yazar; 'multi'
                      // (popup gerek) ve 'none' atlanir. Oneriler sari isaretlenir.
                      const writable = match && match.netPrice > 0 &&
                        (match.confidence === 'high' || match.confidence === 'suggestion');
                      if (writable) {
                        const netPrice = parseFloat(String(match.netPrice)) || 0;
                        const satis = hesaplaSatisBirimFiyat(netPrice, parseFloat(String(row._malzKar ?? 0)) || 0);
                        const qty = roles.quantityField ? parseFloat(String(row[roles.quantityField] ?? '')) || 0 : 0;
                        if (roles.materialUnitPriceField) row[roles.materialUnitPriceField] = satis.toFixed(1);
                        if (roles.materialTotalField) row[roles.materialTotalField] = hesaplaSatirToplam(satis, qty).toFixed(1);
                        row._matNetPrice = netPrice;
                        row._matSuggestion = match.confidence === 'suggestion';
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
                          const satisLab = hesaplaSatisBirimFiyat(netPrice, parseFloat(String(row._iscKar ?? 0)) || 0);
                          if (roles.laborUnitPriceField) row[roles.laborUnitPriceField] = satisLab.toFixed(1);
                          if (roles.laborTotalField) row[roles.laborTotalField] = hesaplaSatirToplam(satisLab, qty).toFixed(1);
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
          // Excel-vari "en altta hep bos satir" — DWG metraj grid'inde aktif
          // (Excel yolunda backend kolonlari cok genis, davranis degismesin)
          autoAppendRow={multiSheet?.sheets?.length === 1 && multiSheet.sheets[0]?.name === 'DWG Metraj'}
          // DINAMIK GRID: sag tik → satir/sutun ekle-sil (yalniz teklif duzenleme;
          // detay sayfasi salt okunur kalir). Sutun degisimi multiSheet'e yazilir →
          // draft (sessionStorage) + kayit (sheetsPayload) otomatik persist.
          enableStructureEdit
          onColumnsChange={(newDefs) => {
            if (multiSheet) {
              const activeIdx = multiSheet.sheets[activeSheetIndex]?.index ?? activeSheetIndex;
              setMultiSheet((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  sheets: prev.sheets.map((s) =>
                    s.index === activeIdx ? { ...s, columnDefs: newDefs } : s,
                  ),
                };
              });
            }
            setExcelGridData((prev) => (prev ? { ...prev, columnDefs: newDefs } : prev));
          }}
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
                const isSuggestion = match.confidence === 'suggestion';
                // KATMAN 3: Gorsel dogrulama — kullanici hangi DB malzemesinin secildigini gorsun.
                // 'suggestion' → sari uyari tonu, kesin degil "kontrol edin".
                toast({
                  title: isSuggestion
                    ? `🟡 Öneri: ${displayPrice(netPrice)} — ${materialName.slice(0, 45)}`
                    : `🟢 ${displayPrice(netPrice)} — ${materialName.slice(0, 50)}`,
                  description: isSuggestion
                    ? `Tahmini eşleşme: ${match.matchedName?.slice(0, 70) ?? '?'} — lütfen kontrol edin`
                    : `Eslesti: ${match.matchedName?.slice(0, 80) ?? 'Bilinmeyen'}`,
                });
                return { netPrice, matchedName: match.matchedName, candidates: match.candidates, reason: match.reason, confidence: match.confidence };
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

              // URUN DEGIL (spec): oran/hizmet satiri — fiyat beklenmiyor,
              // hucre gri isaretlenir; hata tonu YOK.
              if (match.notProduct) {
                toast({ title: 'Ürün değil', description: 'Oran/hizmet satırı — fiyat beklenmiyor.' });
                return { netPrice: 0, notProduct: true, reason: match.reason };
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
