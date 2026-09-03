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
  Languages,
} from 'lucide-react';
import { Button } from '@/ortak/ui/button';
import { adDisiplinTahmini } from '@/ozellik/tablo/disiplin';
import { Card, CardContent, CardHeader, CardTitle } from '@/ortak/ui/card';
import { Input } from '@/ortak/ui/input';
import { Label } from '@/ortak/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ortak/ui/select';
import api from '@/ortak/lib/api';
import { toast } from '@/ortak/hooks/use-toast';
import { confirm } from '@/ortak/hooks/use-confirm';
import { cn } from '@/ortak/lib/utils';
import { ExcelGrid } from '@/ozellik/tablo/excel-grid/ExcelGrid';
import type { ExcelGridHandle } from '@/ozellik/tablo/excel-grid/ExcelGrid';
import { SheetTabs } from '@/ozellik/tablo/excel-grid/SheetTabs';
import ColumnManagerPanel from '@/ozellik/tablo/quotes/ColumnManagerPanel';
import type { ExcelGridData, ExcelRowData, MultiSheetData, SheetData, MatchCandidate as ExcelMatchCandidate } from '@/ozellik/tablo/excel-grid/types';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
// DwgUploader artik bagimsiz /dwg-workspace route'unda render ediliyor —
// ana quotes bundle'i DWG viewer agirligindan kurtuldu.
import type { MetrajResult } from '@/components/dwg-metraj/types';
import MetrajEditor from '@/components/dwg-metraj/MetrajEditor';
import { parseMaterialText } from '@/ozellik/tablo/parse-material-text';
import { mergeMultiSheet } from '@/ozellik/tablo/merge-multisheet';
import { kaynakKolonEtiketi } from '@/ozellik/giris/kaynak-kolon';
import { indeksUyarilari } from '@/lib/indeks-sagligi';
import { DWG_SISTEM_ALANLARI, dwgTeklifSemasi } from '@/ozellik/teklif/dwg-teklif-sema';
import { kalemUret } from '@/ozellik/teklif/teklif-kalem';
import { restoreRematch } from '@/ozellik/teklif/restore-rematch';
import { TASLAK_ANAHTARI, TASLAK_SURUMU } from '@/ozellik/teklif/taslak';
import { cevrilecekMetinler, ceviriUygula, ceviriGeriAl } from '@/ozellik/teklif/ceviri';
import { sayiAlani } from '@/ozellik/fiyat/sayi-alani';
import { fiyatsizKalemOzeti, fiyatsizOnayMetni, uyariyaGirerMi } from '@/ozellik/teklif/fiyatsiz-kalem-uyarisi';
// NOT: `etkinMiktar` buradan DUSTU — tek tuketicisi restore blogunun icindeki
// satir ici re-matching idi, o da ozellik/teklif/restore-rematch'e tasindi.
import { hesaplaSatisBirimFiyat, hesaplaSatirToplam, toplamlariTamamla } from '@/ozellik/fiyat/pricing';
import type { Brand } from '@/ortak/types';
import type {
  Currency,
  LaborFirm,
  AvailableBrand,
  UploadResponse,
  MatchCandidate,
  EditableRow,
} from '@/ortak/types/quotes';
import { useCurrency } from '@/ozellik/fiyat/use-currency';

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
  const [discipline, setDiscipline] = useState<'mechanical' | 'electrical' | 'hybrid'>('mechanical');
  const [laborPref, setLaborPref] = useState<'include' | 'exclude'>('include');
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
      if (!stored) {
        // SESSIZ BOS YASAK: metraj yuku gelmediyse (ornegin sessionStorage
        // kotasi doldu ve /dwg-workspace yazamadi) ekran bombos kalir.
        // ⚠ Bu dalda taslaga DOKUNULMAZ — asagidaki temizlik guard'in
        // ALTINDADIR. Aksi halde "veri de yok, eski calisman da yok" olurdu.
        toast({
          title: 'Metraj aktarılamadı',
          description: 'Çizimden gelen metraj verisi okunamadı. Çizime dönüp "Tümünü Onayla & Fiyatlandırmaya Geç" adımını tekrarlayın.',
          variant: 'destructive',
        });
        return;
      }
      // ── TAZE METRAJ GELDI → eski draft'i TEMIZLE (Excel dalinin ikizi) ──
      // Bu satir DWG dalinda EKSIKTI. Bedeli, revizyon yolu acilinca gorunur
      // olur: kullanici cizime donup capi duzeltip TEKRAR fiyatlandirmaya
      // gectiginde, asagidaki draft-restore efekti bir onceki turdan kalan
      // taslagi geri yukleyip TAZE metrajin uzerine yaziyor — ekranda eski
      // rakamlar kaliyor ama toast "Metraj onaylandi" diyor. Ustelik metraj
      // anahtari yukarida (:141) silindigi icin veri kurtarilamiyor.
      // Excel yolu ayni korumayi :322'de zaten yapiyor.
      //
      // ⚠ BEDELI ACIKCA SOYLENIR: DWG dali satirlari SIFIRDAN kurar
      // (_marka:null, _malzKar:0) — yani onceki turda secilen marka, girilen
      // kar ve eslesen birim fiyatlar gider. Sessizce gitmesin diye asagida
      // kirmizi uyari cikar. (Excel yolundaki gibi merge YOK; metraj satirlari
      // yeniden gruplandigi icin eslestirilecek stabil bir satir kimligi yok.)
      const bayatTaslakVardi = !!sessionStorage.getItem(DRAFT_KEY);
      sessionStorage.removeItem(DRAFT_KEY);
      try {
        const { metraj, fileName } = JSON.parse(stored) as {
          metraj: MetrajResult;
          fileName: string;
        };
        // ── DOGRU VERI ESLESTIRMESI (manuel etiketleme mimarisi) ──
        //   seg.layer     = Layer/sistem adi (orn "a-yagmur")   -> "Hat / Sistem"
        //   seg.diameter  = kullanicinin bucket/kalem metni       -> "Malzeme ve Cap"
        //                   (orn "Ø160 HDPE BORU")
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
              const hatSistem = seg.layer || layer.hat_tipi || layer.layer || '';
              const malzemeCap = seg.diameter || 'Belirtilmemis';
              add(hatSistem, malzemeCap, 'm', seg.length || 0);
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
              // Sistem alanlari TAM SET (iscilik dahil) — alan satirda yoksa
              // ExcelGrid'in firma fill'i sessizce bos yazar (dwg-teklif-sema).
              ...DWG_SISTEM_ALANLARI,
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
          _isSpareRow: true, ...DWG_SISTEM_ALANLARI,
          ...emptyDataFields,
        });
        // SABIT SEMA tek kaynaktan (ozellik/teklif/dwg-teklif-sema): malzeme + ISCILIK
        // kolonlari + roller. Eskiden burada elle kuruluydu ve iscilik
        // kolonlari UNUTULMUSTU — kullanici fiyatlandirmada isciligi hic
        // goremiyordu. Sema artik testle muhurlu.
        const { columnDefs, columnRoles: dwgColumnRoles } = dwgTeklifSemasi();
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
        // REVIZYON TURU BEDELI (sessiz kayip yasak): ikinci kez fiyatlandirmaya
        // gelindiyse tablo TAZE metrajdan sifirdan kurulur — onceki turda
        // secilen marka/kar/fiyatlar TASINMAZ. Kullanici bunu ekranda gorsun.
        if (bayatTaslakVardi) {
          toast({
            title: 'Fiyatlandırma sıfırlandı',
            description: 'Metraj yenilendiği için tablo sıfırdan kuruldu — önceki turda seçtiğiniz marka, kâr ve birim fiyatlar taşınmadı.',
            variant: 'destructive',
          });
        }
      } catch (e) {
        // SESSIZ BOS YASAK (06.08): onaylanan metraj ekrana gelmiyorsa
        // kullanici BILMELI — yoksa "onayladim ama tablo bos" tuzagi dogar.
        console.error('DWG metraj parse failed:', e);
        toast({
          title: 'Metraj yuklenemedi',
          description: 'Onaylanan DWG metraji tabloya aktarilamadi. Cizime donup metraji yeniden onaylayin.',
          variant: 'destructive',
        });
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
        // ── KD11 (kalem 54, Yol A): ICE AKTARMADA EKSIK TOPLAMLARI TAMAMLA ──
        // Backend dosyadaki toplam sutununu YALNIZ KOPYALAR
        // (standart-sema.ts:191-195); dosyada o sutun yoksa hucre bos kalir
        // ve ice aktarma hattinda carpma HIC YOKTUR. PANOVA'da 56 satirda
        // birim fiyat 2.300.000 dolu, Malz. Toplam bostu.
        // Dosyadan gelen degere DOKUNULMAZ; yalniz BOS hucreler doldurulur.
        let tamamlanan = 0;
        for (const s of multi.sheets) {
          tamamlanan += toplamlariTamamla(s.rowData ?? [], (s.columnRoles ?? {}) as any);
        }
        if (tamamlanan > 0) console.log(`[KD11] ice aktarmada ${tamamlanan} eksik toplam hucresi tamamlandi`);
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
  // PRD v3.0 Bolum A1: sayfa-bazli gizli sutun listesi (field adlari). Gizle =
  // yalniz gorsel (veri durur, toplama dahil). Anahtar = sayfa index'i.
  const [colHiddenBySheet, setColHiddenBySheet] = useState<Record<number, string[]>>({});
  // GS8: kolon genislik tercihi (sayfa bazinda) — teklifle birlikte saklanir
  const [colWidthsBySheet, setColWidthsBySheet] = useState<Record<number, Record<string, number>>>({});
  // PRD v3.0 Bolum A2: sayfa-bazli "kat" olarak isaretli sutunlar. Dolu ise
  // MIK = katlarin satir-toplami (hesaplanan, salt-okunur).
  const [colFloorsBySheet, setColFloorsBySheet] = useState<Record<number, string[]>>({});
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
  // PRD v3.0 Bolum B: "Otomatik varyant atama" toggle KALDIRILDI (global gate yok);
  // yayilim yalniz SURUKLE/CIFT-TIK ile. Motor korunur.
  // I7 (18.07): BAYAT INDEKS gorunurlugu — yalniz log YETMEZ, kucuk rozet.
  const [indexHealth, setIndexHealth] = useState<{ bayat: number; indekssiz: number } | null>(null);
  useEffect(() => {
    api.get('/matching/index-health').then(({ data }) => setIndexHealth(data)).catch(() => {});
  }, []);
  // Sheet disiplinleri (kullanici override edebilir)
  const [sheetDisciplines, setSheetDisciplines] = useState<Record<number, 'mechanical' | 'electrical' | null>>({});
  // Iscilik firmalari + secilen firma (sheet bazli)
  const [laborFirms, setLaborFirms] = useState<LaborFirm[]>([]);
  const { capabilities } = useCapabilities();
  const excelGridRef = useRef<ExcelGridHandle>(null);

  const hasAnyLabor = capabilities.mechanical.labor || capabilities.electrical.labor;

  // ── CEVIRI (13.08) ─────────────────────────────────────────────────────
  // Akis: benzersizlestir (dokunulmazlar elenir) → backend onbellek+API →
  // haritayi satirlara uygula. Cap/olcu/sayi ASLA gonderilmez —
  // ozellik/teklif/ceviri.ts testle muhurlu.
  const [ceviriDili, setCeviriDili] = useState<'tr' | 'en'>('tr');
  const [ceviriYukleniyor, setCeviriYukleniyor] = useState(false);

  const handleCeviri = async () => {
    if (!multiSheet?.sheets) return;
    const sheets = multiSheet.sheets;

    // Satirlar YERINDE degistigi icin grid'e YENI dizi referansi verilmeli;
    // aksi halde AG-Grid ayni diziyi gorup yeniden cizmez.
    const tazele = () => {
      const aktif = sheets[activeSheetIndex];
      if (!aktif) return;
      const satirlar = liveRowDataBySheet[aktif.index] ?? aktif.rowData ?? [];
      setExcelGridData((onceki) => (onceki ? { ...onceki, rowData: [...satirlar] } : onceki));
    };

    // Turkce'ye donus: API'ye HIC gitmez, orijinal metin satirda saklidir.
    if (ceviriDili === 'en') {
      const geri = ceviriGeriAl(sheets as any, liveRowDataBySheet);
      if (geri > 0) setLiveRowDataBySheet({ ...liveRowDataBySheet });
      setCeviriDili('tr');
      tazele();
      return;
    }

    const metinler = cevrilecekMetinler(sheets as any, liveRowDataBySheet);
    if (metinler.length === 0) {
      toast({ title: 'Cevrilecek metin yok', description: 'Bu teklifte cevrilebilir malzeme adi bulunamadi.' });
      return;
    }

    setCeviriYukleniyor(true);
    try {
      const { data } = await api.post('/ai/translate', { metinler, hedefDil: 'en' });
      const yazilan = ceviriUygula(sheets as any, data?.harita ?? {}, liveRowDataBySheet);

      // ⚠ Kayitli teklif ekraninin IKIZI — ayni yalan burada da kapatildi:
      // tek hucre bile degismediyse "tamamlandi" DENMEZ ve dil dugmesi
      // "Turkceye Don"e GECMEZ (13.08, gecersiz anahtar canli olcumu).
      if (yazilan === 0) {
        toast({
          title: 'Ceviri uygulanamadi',
          description: 'Sunucudan ceviri gelmedi — hicbir hucre degismedi.',
          variant: 'destructive',
        });
        return;
      }

      setLiveRowDataBySheet({ ...liveRowDataBySheet });
      setCeviriDili('en');
      tazele();
      const eksik = Number(data?.basarisiz ?? 0) > 0;
      toast({
        title: eksik ? 'Ceviri KISMEN tamamlandi' : 'Ceviri tamamlandi',
        description: eksik
          ? `${yazilan} hucre cevrildi · ${data.basarisiz} parca basarisiz, o metinler Turkce kaldi`
          : `${yazilan} hucre cevrildi · ${data?.onbellekten ?? 0} onbellekten, ${data?.cevrilen ?? 0} yeni`,
        variant: eksik ? 'destructive' : undefined,
      });
    } catch (e: any) {
      toast({
        title: 'Ceviri basarisiz',
        description: e?.response?.data?.message || e?.message || 'Bilinmeyen hata',
        variant: 'destructive',
      });
    } finally {
      setCeviriYukleniyor(false);
    }
  };

  // ── SessionStorage draft key ──
  // 14.08: deger ORTAK MODULDEN (ozellik/teklif/taslak.ts) — revizyon yolunda
  // detay sayfasi da ayni anahtara yazar. Iki taraf ayni sabiti KODDAN paylasir.
  const DRAFT_KEY = TASLAK_ANAHTARI;
  // Draft sema surumu — eski/bozuk draft'lar restore EDILMEZ, otomatik silinir.
  // Sema degistiginde artir.
  //   v2: multi-sheet tek-kopya draft
  //   v3: SABIT SEMA — eski draft'ta nameField marka sutununu, fiyat Excel
  //       sutununu gosteriyordu; sabit sistem sutunlari (_matBirim...) yok.
  //       Eski draft yuklenirse fiyat eslesmez → zorla temizle.
  //   v4: DWG semasina ISCILIK kolonlari eklendi (dwg-teklif-sema). Draft
  //       kendi columnDefs'ini tasidigi icin v3 DWG taslagi kolonsuz geri
  //       gelirdi ve kullanici "iscilik ozelligi gelmemis" sanirdi — taslak
  //       her kayitta yine eski semayla yazildigi icin durum KENDILIGINDEN
  //       asla duzelmezdi. BILINCLI TAKAS: artirmak Excel yolundaki kayitsiz
  //       taslaklari da temizler; sessiz-eski-sema yaniltmasina tercih edildi.
  const DRAFT_VERSION = TASLAK_SURUMU;

  /**
   * REVIZYON KIMLIGI (14.08) — dolu ise "Teklifi Kaydet" YENI kayit acmaz,
   * BU teklifi gunceller. Detay sayfasindaki "Düzenle" butonu taslaga
   * `quoteId` yazar, asagidaki restore efekti onu buraya tasir.
   *
   * ⚠ State'te tutulmasi SART: yalniz taslakta kalsaydi, taslak her
   * degisiklikte yeniden yazildigi icin kimlik ilk yazimda DUSER ve kullanici
   * revize ettigini sanirken KOPYA olusturuurdu.
   */
  const [revizyonId, setRevizyonId] = useState<string | null>(null);

  // Iscilik firmalarini cek (capability varsa)
  useEffect(() => {
    if (!hasAnyLabor) return;
    api.get<LaborFirm[]>('/labor-firms').then(({ data }) => {
      setLaborFirms(data);
    // SESSIZ BOS YASAK: marka listesiyle ayni gerekce — firma dropdown'i bos
    // kalirsa "hic firmam yok" ile ayirt edilemez, iscilik fiyatlanamaz.
    }).catch((e: any) => {
      const kod = e?.response?.status;
      toast({
        title: 'Iscilik firmalari yuklenemedi',
        description: `Firma listesi alinamadi${kod ? ` (HTTP ${kod})` : ''} — liste bos gorunuyor ama BOS OLDUGU ICIN DEGIL. Sayfayi yenileyin.`,
        variant: 'destructive',
      });
    });
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
      // SESSIZ BOS YASAK: bu istek dusetse marka dropdown'i BOS kalir ve
      // "kutuphanemde hic marka yok" ile AYNI gorunur — kullanici hicbir
      // satiri fiyatlandiramaz, sebebini de goremez.
      .catch((e: any) => {
        const kod = e?.response?.status;
        toast({
          title: 'Marka listesi yuklenemedi',
          description: `Kutuphane markalari alinamadi${kod ? ` (HTTP ${kod})` : ''} — liste bos gorunuyor ama BOS OLDUGU ICIN DEGIL. Sayfayi yenileyin.`,
          variant: 'destructive',
        });
      });
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
        // PRD v3.0 Part A kaliciligi: kat + gizli sutun config'i draft'tan geri
        // yukle (eski v3 draft'larda alan yok → bos obje ile baslar, kirilmaz).
        setColHiddenBySheet(draft.colHiddenBySheet ?? {});
        setColWidthsBySheet(draft.colWidthsBySheet ?? {});
        setColFloorsBySheet(draft.colFloorsBySheet ?? {});
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
        if (draft.quoteId) setRevizyonId(draft.quoteId);
        console.log('[quotes/new] Draft restored from sessionStorage'
          + (draft.quoteId ? ` (REVIZYON: ${draft.quoteId})` : ''));

        // Marka/firma atanmis satirlar icin otomatik re-matching — malzeme +
        // ISCILIK ikizi TEK MEKANIZMADAN (ozellik/teklif/restore-rematch,
        // testle muhurlu). Eski inline blok yalniz malzeme tarafini kosuyordu;
        // _firma atanmis satirlarin iscilik fiyati restore sonrasi sessizce
        // bos kaliyordu.
        setTimeout(async () => {
          const multi = draft.multiSheet;
          if (!multi?.sheets) return;
          const live = restoredLive;
          const reMatched = await restoreRematch(
            multi.sheets,
            live,
            async (url, body) => (await api.post(url, body)).data,
          );
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
        colHiddenBySheet,
        colWidthsBySheet,
        colFloorsBySheet,
        // Revizyon kimligi taslakta KALICI — sayfa yenilense de "guncelle"
        // davranisi korunur (yoksa yenileme sonrasi KOPYA olusurdu).
        quoteId: revizyonId ?? undefined,
      }));
    } catch (e) {
      // Kota vb. hata: ESKI draft'i birakma — bayat state restore edilmesin.
      // (Kayit yapilamiyorsa refresh'te bos baslamak, yanlis/eski veriyle
      // baslamaktan iyidir.)
      sessionStorage.removeItem(DRAFT_KEY);
      console.warn('[quotes/new] Draft save failed, eski draft temizlendi:', e);
    }
    // ⚠ `revizyonId` bagimliliga DAHIL: eksik olsaydi bu efekt kimlik
    // set edilmeden once kapanan closure'i tasir, taslaga `undefined` yazar
    // ve revizyon SESSIZCE kopyaya donerdi.
  }, [multiSheet, liveRowDataBySheet, activeSheetIndex, sheetDisciplines, title, allBrands, colHiddenBySheet, colFloorsBySheet, colWidthsBySheet, revizyonId]);

  // Marka fiyat cache: brandId → { materialName → PriceLookupResult }
  const brandPriceCacheRef = useRef<Record<string, Record<string, any>>>({});
  // Devam eden fetch promise'leri — ayni brand icin tekrar cagrilmasini engeller
  const brandFetchPromises = useRef<Record<string, Promise<Record<string, any>> | undefined>>({});
  const [brandPriceCache, setBrandPriceCache] = useState<Record<string, Record<string, any>>>({});

  // Currency (TRY/USD/EUR) hook — state + exchange rate + conversion
  const { currency, setCurrency, ratesLoaded, conversionRate, displayPrice, exchangeRates } = useCurrency();

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


  // ── Malzeme Adı düzeltme: kullanıcı hangi Excel sütununun malzeme adı
  //    olduğunu değiştirebilir (otomatik tespit yanlışsa). Aktif sayfanın
  //    columnRoles.nameField'ini günceller → eşleştirme yeni sütunu okur.
  /** GS6: seçici değişince grid ANINDA yeniden doldurulur.
   *  ESKİ DAVRANIŞ (kök neden §A.2): yalnız `columnRoles.nameField` değişiyordu;
   *  satırların `_ad` değeri ve `_isDataRow` sınıflandırması sunucuda ESKİ
   *  sütuna göre hesaplanmış halde kalıyordu → kullanıcı sütunu düzeltse bile
   *  ekran değişmiyordu. Artık her satırın `_kaynak` metinlerinden `_ad`
   *  yeniden yazılır ve satır tipi yeniden belirlenir. */
  function handleNameFieldChange(newField: string) {
    const yenidenDoldur = (s: any) => {
      if (!s?.rowData?.length || !s.rowData.some((r: any) => r?._kaynak)) {
        return { ...s, columnRoles: { ...s.columnRoles, nameField: newField } };
      }
      const rowData = s.rowData.map((r: any) => {
        const ad = String(r?._kaynak?.[newField] ?? '').trim();
        const miktar = String(r?._miktar ?? '').trim();
        const birim = String(r?._birim ?? '').trim();
        return { ...r, _ad: ad, _isDataRow: !!ad && (!!birim || (!!miktar && miktar !== '0')) };
      });
      return { ...s, rowData, kaynakAdKolonu: newField };
    };
    setMultiSheet((prev) => prev ? {
      ...prev,
      sheets: prev.sheets.map((s) => (s.index === activeSheetIndex ? yenidenDoldur(s) : s)),
    } : prev);
    setExcelGridData((prev) => (prev ? yenidenDoldur(prev) : prev));

    // ── GS6b KOK NEDEN (PK8, 31.07.2026) ────────────────────────────────────
    // Yukaridaki iki setState DOGRUYDU ve `_ad` gercekten yeniden yaziliyordu
    // (olcum: backend fixture'iyla 21 satirda deger degisiyor). Ama EKRAN
    // degismiyordu, cunku grid rowData'yi BURADAN okumuyor:
    //
    //     page.tsx:1663  rowData: liveRowDataBySheet[active.index] ?? active.rowData
    //
    // `liveRowDataBySheet` yuklemenin hemen ardindan TUM sayfalar icin
    // dolduruluyor (page.tsx:345-347) → `active.rowData` fallback'i HIC
    // calismiyor. Yani canli satirlar, tazelenen satirlari GOLGELIYOR.
    // Satirlarin iki ayri kaynagi var ve yalniz biri guncelleniyordu.
    //
    // Ayni bug SINIFI daha once yasandi: kalem ekleme `liveRows` STATE race'i
    // (24.07, `liveRowsRef` ile cozulmustu). Kural: satir listesini degistiren
    // HER islem `liveRowDataBySheet`i de guncellemek ZORUNDA.
    setLiveRowDataBySheet((prev) => {
      const mevcut = prev[activeSheetIndex];
      if (!mevcut?.length) return prev; // golge yok — fallback zaten dogruyu okur
      const tazelenmis = mevcut.map((r: any) => {
        if (!r?._kaynak) return r;
        const ad = String(r._kaynak?.[newField] ?? '').trim();
        const miktar = String(r?._miktar ?? '').trim();
        const birim = String(r?._birim ?? '').trim();
        return { ...r, _ad: ad, _isDataRow: !!ad && (!!birim || (!!miktar && miktar !== '0')) };
      });
      return { ...prev, [activeSheetIndex]: tazelenmis };
    });
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

  // ── PRD v3.0 Bolum A1: Sutun gizle/goster ──────────────────────────────
  // Aktif sayfa + o sayfanin gizli sutun listesi. Anahtar = sayfa index'i.
  const activeSheetObj = multiSheet
    ? (multiSheet.sheets[activeSheetIndex] ?? multiSheet.sheets.find((s) => !s.isEmpty))
    : null;
  const activeSheetKey = activeSheetObj?.index ?? 0;
  const activeHiddenFields = colHiddenBySheet[activeSheetKey];
  // A2: aktif sayfanin "kat" sutunlari + MIK (quantityField)
  const activeFloorFields = colFloorsBySheet[activeSheetKey] ?? [];
  const activeQtyField = activeSheetObj?.columnRoles?.quantityField ?? columnRoles.quantity;
  // Kullaniciya panelde gosterilecek Excel sutunlari (sistem '_' kolonlari haric)
  const managedColumns = ((activeSheetObj?.columnDefs ?? excelGridData?.columnDefs ?? []) as ExcelGridData['columnDefs'])
    .filter((c) => c.field && !c.field.startsWith('_'))
    .map((c) => ({ field: c.field, headerName: c.headerName }));
  // Kilitli sutunlar: malzeme adi (eslestirme cipasi) + sira no
  const lockedColumns = [
    activeSheetObj?.columnRoles?.nameField ?? columnRoles.name,
    activeSheetObj?.columnRoles?.noField ?? columnRoles.no,
  ].filter(Boolean) as string[];
  // GIZLI + (A2) MIK salt-okunur uygulanmis columnDefs (memoize)
  const displayColumnDefs = useMemo(() => {
    const cols = (activeSheetObj?.columnDefs ?? excelGridData?.columnDefs ?? []) as ExcelGridData['columnDefs'];
    const hs = new Set(activeHiddenFields ?? []);
    const floorsOn = (activeFloorFields?.length ?? 0) > 0;
    if (hs.size === 0 && !floorsOn) return cols;
    return cols.map((c) => {
      let out = c;
      if (hs.has(c.field)) out = { ...out, hide: true };
      // A2: kat isaretliyken MIK hesaplanan → salt-okunur
      if (floorsOn && activeQtyField && c.field === activeQtyField) out = { ...out, editable: false };
      return out;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSheetObj?.columnDefs, excelGridData?.columnDefs, activeHiddenFields, activeFloorFields, activeQtyField]);

  function toggleColumnHidden(field: string) {
    if (lockedColumns.includes(field)) return;
    setColHiddenBySheet((prev) => {
      const cur = prev[activeSheetKey] ?? [];
      const next = cur.includes(field) ? cur.filter((f) => f !== field) : [...cur, field];
      return { ...prev, [activeSheetKey]: next };
    });
  }
  function showAllColumns() {
    setColHiddenBySheet((prev) => ({ ...prev, [activeSheetKey]: [] }));
  }

  // A2: sutunu "kat" isaretle/kaldir + MIK = katlarin satir-toplami (yeniden hesap)
  function toggleColumnFloor(field: string) {
    if (lockedColumns.includes(field)) return;
    const cur = activeFloorFields;
    const next = cur.includes(field) ? cur.filter((f) => f !== field) : [...cur, field];
    setColFloorsBySheet((prev) => ({ ...prev, [activeSheetKey]: next }));
    // MIK'i yeni kat setine gore tum satirlarda yeniden hesapla
    const qf = activeSheetObj?.columnRoles?.quantityField;
    if (!qf) return;
    const rows = liveRowDataBySheet[activeSheetKey] ?? activeSheetObj?.rowData ?? [];
    const nextRows = rows.map((r: any) => {
      if (!r._isDataRow || next.length === 0) return r;
      let sum = 0;
      for (const f of next) sum += parseFloat(String(r[f] ?? '').replace(',', '.')) || 0;
      return { ...r, [qf]: sum === 0 ? '' : String(Math.round(sum * 1000) / 1000) };
    });
    setLiveRowDataBySheet((prev) => ({ ...prev, [activeSheetKey]: nextRows }));
  }

  // A3: sutunu KALICI kaldir (yikici — veri silinir, kat idiyse MIK duser).
  // Dolu sutunda onay + "Gizle" alternatifi (yanlislikla veri/toplam bozulmasin).
  async function removeColumn(field: string) {
    if (lockedColumns.includes(field)) return;
    const col = managedColumns.find((c) => c.field === field);
    const rows = liveRowDataBySheet[activeSheetKey] ?? activeSheetObj?.rowData ?? [];
    const dolu = rows.filter((r: any) => r._isDataRow && String(r[field] ?? '').trim() !== '').length;
    if (dolu > 0) {
      const ok = await confirm({
        title: `"${col?.headerName ?? field}" sütunu kalıcı silinsin mi?`,
        description: `${dolu} kalemde veri var`
          + (activeFloorFields.includes(field) ? ' (kat sütunu → MİK düşecek)' : '')
          + '. Yalnızca ekrandan gizlemek için Vazgeç deyip panelden göz ikonuyla gizleyin (veri + toplam korunur).',
      });
      if (!ok) return;
    }
    // 1) columnDefs'ten cikar
    setMultiSheet((prev) => prev ? {
      ...prev,
      sheets: prev.sheets.map((s) => s.index === activeSheetKey
        ? { ...s, columnDefs: (s.columnDefs ?? []).filter((c) => c.field !== field) }
        : s),
    } : prev);
    // 2) floor idiyse cikar; her satirdan field'i sil + (floor ise) MIK yeniden hesap
    const wasFloor = activeFloorFields.includes(field);
    const nextFloors = wasFloor ? activeFloorFields.filter((f) => f !== field) : activeFloorFields;
    if (wasFloor) setColFloorsBySheet((prev) => ({ ...prev, [activeSheetKey]: nextFloors }));
    const qf = activeSheetObj?.columnRoles?.quantityField;
    const nextRows = rows.map((r: any) => {
      const rest = { ...r };
      delete rest[field];
      if (wasFloor && r._isDataRow && qf && nextFloors.length > 0) {
        let sum = 0;
        for (const f of nextFloors) sum += parseFloat(String(rest[f] ?? '').replace(',', '.')) || 0;
        rest[qf] = sum === 0 ? '' : String(Math.round(sum * 1000) / 1000);
      }
      return rest;
    });
    setLiveRowDataBySheet((prev) => ({ ...prev, [activeSheetKey]: nextRows }));
    // 3) gizli listesinden de temizle
    setColHiddenBySheet((prev) => ({ ...prev, [activeSheetKey]: (prev[activeSheetKey] ?? []).filter((f) => f !== field) }));
  }

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
      } catch (e: any) {
        // ── SESSIZ BOS YASAK (06.08) ──────────────────────────────────────
        // Eskiden burada YALNIZ console.error vardi ve `{}` donuyordu. `{}`
        // "hicbiri eslesmedi" demektir — yani sunucu 500 dondugunde ekran
        // TAM OLARAK "bu markada hicbir sey bulunamadi" gibi gorunuyordu.
        // Butun satirlar sessizce fiyatsiz kaliyor, kullanici sebebini
        // goremiyordu; 06.08'de bir teshisi saatlerce zorlastiran sey buydu.
        // Akis DEGISMEZ (`{}` donmeye devam eder, cagiranlar kirilmaz) —
        // degisen tek sey: basarisizlik artik GORUNUR.
        const kod = e?.response?.status;
        console.error('[SemanticCache] Error:', e);
        toast({
          title: 'Fiyatlar alinamadi',
          description: `${uniqueNames.length} malzeme sorgulanamadi${kod ? ` (HTTP ${kod})` : ''} — satirlar fiyatsiz kaldi, "eslesme yok" DEGIL. Tekrar deneyin.`,
          variant: 'destructive',
        });
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
          const kar = sayiAlani(r.materialKar);
          // ADIM 6 (06.08): HAM `net*(1+kar/100)` KALDIRILDI — kanonik cift
          // (yukarıYuvarla 1 hane) kullanilir; grid yoluyla (ExcelGrid:2467)
          // ayni sayiyi uretmek KAR SATIRININ on kosulu.
          const finalPrice = hesaplaSatisBirimFiyat(netPrice, kar);
          const qty = qtyCol ? (parseFloat(String(r.cells[qtyCol])) || 0) : 0;
          const total = hesaplaSatirToplam(finalPrice, qty);

          const newCells = { ...r.cells };
          if (priceCol) newCells[priceCol] = finalPrice;
          if (totalCol) newCells[totalCol] = total;

          return { ...r, brandId, _matNetPrice: netPrice, _matKurBilgi: (result as any).kaynakKur ?? null, _candidates: null, cells: newCells };
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
    } catch (e: any) {
      // SESSIZ BOS YASAK (06.08 dersi, a75e41b'nin devami): kullanici tikladi,
      // sunucu hata verdi — ekran susarsa "eslesme yok" sanilir.
      console.error('[SemanticMatch] Error:', e);
      const kod = e?.response?.status;
      toast({
        title: 'Eslestirme sorgusu basarisiz',
        description: `"${materialName.slice(0, 40)}" sorgulanamadi${kod ? ` (HTTP ${kod})` : ''} — "eslesme yok" DEGIL. Tekrar deneyin.`,
        variant: 'destructive',
      });
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
        // ADIM 6: kanonik cift (bkz. 1155'teki not)
        const finalPrice = hesaplaSatisBirimFiyat(netPrice, kar);
        const qty = qtyCol ? (parseFloat(String(r.cells[qtyCol])) || 0) : 0;
        const total = hesaplaSatirToplam(finalPrice, qty);

        console.log(`[KarChange] netPrice=${netPrice}, kar=${kar}%, finalPrice=${finalPrice}, qty=${qty}, total=${total}`);

        const newCells = { ...r.cells };
        newCells[priceCol] = isNaN(finalPrice) ? 'Hata' : finalPrice;
        if (totalCol) newCells[totalCol] = isNaN(total) ? 'Hata' : total;
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
    // ── K6 (27.08): GORUNMEYEN TABLO KAYDEDILEMEZ ──────────────────────
    // Kaydin kaynagi ekranda CIZILEN tablodur (`multiSheet` ya da
    // `excelGridData`). Ikisi de yokken kayit yolu yine de calisip kullanicinin
    // GORMEDIGI bir icerigi (ya da bos bir teklifi) kaydedebiliyordu.
    // ⚠ Olcut BILEREK "ekranda ne cizildi" — "items dolu mu" DEGIL: olculdu,
    // items bazi yollarda DOLU olur ve o kapi bu vakada hic atesmez.
    // Canli her yol bu ikisinden birini set eder (Excel yukleme, DWG metraj
    // donusu, taslak restore) — yani kapi mesru bir kaydi engellemez.
    if (!multiSheet && !excelGridData) {
      toast({
        title: 'Kaydedilecek tablo yok',
        description: 'Ekranda bir tablo gorunmuyor — dosyayi yeniden yukleyin.',
        variant: 'destructive',
      });
      return;
    }
    // Baslik bos ise dosya adi veya varsayilan kullan
    const finalTitle = title.trim() || `Teklif ${new Date().toLocaleDateString('tr-TR')}`;

    setIsSaving(true);
    // ⚠ try DISINDA: catch blogu teshis icin bunlari okur (sessiz hata yutma
    // kapatildiginda payload ozeti konsola yazilir).
    let payloadItems: any[] = [];
    // Uyari adaylari = kaydedilenlerin Icmal (_ozet) satirlari CIKARILMIS hali.
    // Legacy `rows` dalinda `_ozet` kavrami yok; orada iki liste ayni.
    let uyariKalemleri: any[] = [];
    let sheetsPayload: any[] | undefined;
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
          // ⚠ 12.08 CANLI 400'ÜN LİTERAL BİÇİMİ: `x || 0` sayı süzgeci değildir
          // (boş olmayan string aynen geçer). Çok-sayfa dalında kapatılmıştı,
          // legacy dalda DURUYORDU — kâr süzgeci kapısı yakaladı.
          materialMargin: sayiAlani(row.materialKar),
          laborMargin: sayiAlani(row.laborKar),
          brandId: row.brandId || undefined,
          // IKIZ: brandId vardi, laborFirmaId YOKTU — cok-sayfa dalinda
          // kapatilan asimetrinin bu daldaki esi.
          laborFirmaId: row.laborFirmaId || undefined,
        }));

      // Multi-sheet: sheets payload'u ve items summary'sini turet
      // ⚠ P2-4 SONRASI `items` HER ZAMAN BOS. Onu besleyen `columnRoles`
      // yalniz `/excel-engine/analyze` ciktisindan geliyordu; o cagri
      // kaldirildi (dashboard/page.tsx), dolayisiyla `nameCol` hep undefined
      // ve bu filtre hicbir satir gecirmiyor. Yani asagidaki "grid bos
      // kalirsa yedek" davranisi ARTIK YOK — kayit tamamen `multiItems`e
      // dayanir. Yedek bilerek kaldirildi: analyze yalniz ILK sayfayi okuyor
      // ve gizli-sayfa kuralini (R-C, excel-grid.service.ts:148-152)
      // uygulamiyordu; yani yedek devreye girdiginde gizli sayfa satirlarini
      // teklife sizdirabiliyordu. Satirlar, legacy `rows` yolu tamamen
      // silinecegi gun kaldirilmali (bkz. P3 olu kod kalemi).
      payloadItems = items;
      uyariKalemleri = items;
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
        // Fiyatsiz UYARISININ adaylari — kaydedilen kalemlerden AYRI liste.
        // Fark tek: Icmal (`_ozet`) satirlari uyariya girmez (bkz.
        // `uyariyaGirerMi`). Kayit davranisi DEGISMEZ: ozet satiri bugune kadar
        // nasil kaydediliyorsa oyle kaydedilmeye devam eder (o ayri bir is).
        const uyariAdaylari: any[] = [];
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
            // KALEM URETIMI TEK KAYNAKTAN (ozellik/teklif/teklif-kalem). Burasi satir ici
            // yazilinca `materialMargin`/`laborMargin` parseFloat SUZGECI
            // ALMAMISTI: Kar % hucresine elle yazilan "50" STRING olarak
            // gidiyor ve backend @IsNumber() reddedip HTTP 400 veriyordu.
            const kalem = kalemUret(r, roles as any);
            if (!kalem) return;
            multiItems.push(kalem);
            if (uyariyaGirerMi(r)) uyariAdaylari.push(kalem);
          });
        });
        if (multiItems.length > 0) { payloadItems = multiItems; uyariKalemleri = uyariAdaylari; }
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
          // PRD v3.0 Part A kaliciligi: kat + gizli sutun tercihi teklifle
          // birlikte saklanir (detay sayfasi gizlileri uygular).
          columnConfig: {
            hidden: colHiddenBySheet[s.index] ?? [],
            // GS8: kullanicinin surukleyerek ayarladigi kolon genislikleri
            widths: colWidthsBySheet[s.index] ?? {},
            floors: colFloorsBySheet[s.index] ?? [],
          },
        }));
      }

      // ── FİYATSIZ KALEM: BLOKLAMAYAN ONAY (12.08 kullanıcı kararı) ───────
      // Adı olan ama fiyatı olmayan satır bugüne kadar SESSİZCE kaydediliyordu:
      // PANOVA'da DWG'den gelen "Belirtilmemis" satırı 3.123,64 m ile ve 0 ₺
      // ile teklife giriyordu. Yukarıdaki filtre yalnız ADI BOŞ satırı eliyor.
      // Kullanıcı bilerek fiyatsız kaydedebilir (henüz fiyat alınmamış kalem
      // olur) — o yüzden bloklamıyoruz, SÖYLÜYORUZ. Çizim tarafındaki çapsız
      // segment onayının (DwgProjectWorkspace.handleConfirmAll) kayıt anı ikizi.
      // ⚠ Ölçüt payload üzerinde: ekranda ne göründüğü değil, teklife NE
      // YAZILACAĞI sorulur (satır süzgeçleri çoktan uygulanmış olur).
      const fiyatsiz = fiyatsizKalemOzeti(uyariKalemleri);
      if (fiyatsiz) {
        // İptal → `finally` bloğu setIsSaving(false) yapar, kayıt yapılmaz.
        if (!(await confirm(fiyatsizOnayMetni(fiyatsiz)))) return;
      }

      // REVIZYON mu YENI KAYIT mi (14.08): `revizyonId` doluysa AYNI teklif
      // guncellenir (PUT). Backend her iki yolda da AYNI hazirliktan gecer —
      // iliskisel alan suzgeci, kalem uretimi ve P2003 geri dususu ortaktir.
      const govde = {
        title: finalTitle,
        items: payloadItems,
        sheets: sheetsPayload,
        originalFileBase64: originalFileBase64 ?? undefined,
        originalFileName: originalFileName ?? undefined,
        // 13.08: ceviri yapildiysa teklif Ingilizce KAYDEDILIR. Bu alan
        // olmadan satirlar Ingilizce kaydediliyor ama "bu teklif Ingilizce"
        // bilgisi hicbir yerde durmuyordu; detay sayfasi dili 'tr' varsayip
        // export'a dil gecmiyor, musteriye satirlari Ingilizce ama
        // basliklari/birimleri TURKCE bir dosya gidiyordu.
        displayLanguage: ceviriDili,
      };
      const { data: created } = revizyonId
        ? await api.put(`/quotes/${revizyonId}`, govde)
        : await api.post('/quotes', govde);

      // Goruntuleme para birimi (KH8: Duzenle'de secilen birim TEKLIFLE
      // kaydedilir — detay ayni birimle acilir). Kapak alanlari bu ekrandan
      // kaldirildi (06.08 istegi); detay sayfasindan girilir — PATCH kismi
      // guncelleme yaptigi icin gonderilmeyen alanlara dokunulmaz.
      if (created?.id && currency !== 'TRY') {
        try {
          await api.patch(`/quotes/${created.id}/info`, {
            displayCurrency: currency,
            displayRate: exchangeRates.TRY,
            displayRateDate: new Date().toLocaleDateString('tr-TR'),
          });
        } catch { /* goruntuleme birimi opsiyonel */ }
      }

      // Draft temizle — artik kayitli teklif var
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(FROM_DWG_KEY);

      toast({
        title: revizyonId ? 'Teklif güncellendi' : 'Teklif kaydedildi',
        description: revizyonId
          ? `"${finalTitle}" revize edildi — yeni kopya oluşturulmadı.`
          : `"${finalTitle}" basariyla olusturuldu.`,
      });
      router.push('/quotes');
    } catch (e: any) {
      // ── SESSIZ HATA YUTMA KAPANDI (11.08) ─────────────────────────────
      // Onceki hal `catch {}` idi: backend'in NE dedigi (400 dogrulama
      // mesaji dahil) tamamen kayboluyordu. Kullanici "bir hata olustu"
      // goruyor, gelistirici de teshis edemiyordu. Bu, projede daha once
      // 4 aksiyonda kapatilan desenin bu ekranda kalmis olani.
      const status = e?.response?.status as number | undefined;
      const data = e?.response?.data;
      // NestJS ValidationPipe: { message: string[] , error, statusCode }
      const detay = Array.isArray(data?.message)
        ? data.message.join(' · ')
        : (data?.message ?? data?.detail ?? e?.message ?? 'Bilinmeyen hata');
      const kisa = String(detay).length > 300 ? String(detay).slice(0, 300) + '…' : String(detay);
      console.error('[quotes/new] Kayit hatasi:', { status, data, payloadOzet: {
        itemSayisi: payloadItems?.length,
        sheetSayisi: sheetsPayload?.length,
        ilkItem: payloadItems?.[0],
      } });
      toast({
        title: status ? `Teklif kaydedilemedi (HTTP ${status})` : 'Teklif kaydedilemedi',
        description: kisa,
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

        <div className="flex flex-col items-end gap-3">
          {/* 13.08 istegi: CEVIRI butonu para birimi seciciNIN SOLUNA (pembe cerceve) */}
          <div className="flex items-center gap-2">
            {excelGridData && (
              <Button
                type="button"
                variant="outline"
                onClick={handleCeviri}
                disabled={ceviriYukleniyor}
                title="Malzeme/is adlarini Ingilizceye cevirir. Cap, olcu ve sayilara DOKUNULMAZ."
              >
                {ceviriYukleniyor ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Languages className="mr-2 h-4 w-4" />
                )}
                {ceviriDili === 'tr' ? 'Ingilizceye Cevir' : 'Turkceye Don'}
              </Button>
            )}
          {/* Currency Toggle */}
          <div className="flex rounded-lg border bg-white p-0.5">
            {currencies.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  currency === c
                    ? 'bg-blue-600 text-white shadow-sm' /* v1 spec .mpx-para .sec: secili para birimi MAVI dolgulu */
                    : 'text-muted-foreground hover:text-foreground',
                )}
                disabled={!ratesLoaded && c !== 'TRY'}
              >
                {c === 'TRY' ? 'TL' : c}
              </button>
            ))}
          </div>
          </div>

          {/* Teklifi Kaydet — 06.08'de alt sagdan buraya, 13.08'de bir satir
              asagi tasindi (yesil cerceve): ust satir ceviri + para birimi. */}
          {excelGridData && (
            /* 18.08 kullanici karari (hedef tasarim): Kaydet YESIL — lacivert
               birincilden ayrisir, "olumlu/bitirici" eylem rengi. */
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleSave()}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {/* Revizyonda etiket DEGISIR: kullanici yeni kopya mi
                      olusturdugunu yoksa mevcut teklifi mi guncelledigini
                      butona basmadan ONCE gormeli. */}
                  {revizyonId ? 'Teklifi Güncelle' : 'Teklifi Kaydet'}
                </>
              )}
            </Button>
          )}
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
      {!multiSheet && !excelGridData && (
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
          // GS6: sabit şemada grid kolonları hep `_`-alanlarıdır; seçici artık
          // sunucunun gönderdiği KAYNAK kolon listesini gösterir (dosyanın
          // metin taşıyan sütunları). Şema değişmez — yalnız `_ad`i hangi
          // sütunun beslediği değişir.
          const kaynaklar = (activeSheet as any).kaynakKolonlar as
            | { field: string; headerName: string; ornek: string }[] | undefined;
          const excelCols = kaynaklar?.length
            // Etiket TEK KAYNAKTAN gelir (lib/kaynak-kolon.ts): gerçek başlık
            // varsa yalnız başlık, yoksa örnek değer ipucu olarak kalır.
            ? kaynaklar.map((k) => ({ field: k.field, headerName: kaynakKolonEtiketi(k) }))
            : (activeSheet.columnDefs ?? []).filter((c) => c.field && !c.field.startsWith('_'));
          if (excelCols.length === 0) return null;
          const current = kaynaklar?.length
            ? ((activeSheet as any).kaynakAdKolonu ?? '')
            : (activeSheet.columnRoles?.nameField ?? '');
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
              {/* I7 (18.07): indeks sagligi rozetleri — istek aninda oto-tamir var
                  ama KALICI cozum reindex; kullanici durumu GORMELI.
                  04.08: `indekssiz` de ciziliyor — backend sayiyi uretiyor, FE
                  cekiyordu ama HIC gostermiyordu (markanin TAMAMI indekssizken
                  bile ekran sessizdi). Karar: lib/indeks-sagligi.ts */}
              {indeksUyarilari(indexHealth).map((u) => (
                <span
                  key={u.tur}
                  title={u.baslik}
                  className={
                    u.tur === 'indekssiz'
                      ? 'ml-2 inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800'
                      : 'ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800'
                  }
                >
                  {u.etiket}
                </span>
              ))}
              {/* PRD v3.0 Bolum B: "Otomatik varyant atama" TOGGLE KALDIRILDI.
                  Motor korunur; yayilim artik yalniz ACIK NIYET ile — marka
                  hucresini asagi SURUKLE (aralik) veya tutamaga CIFT-TIK (aile).
                  Global ac/kapa yok → "anahtar acik miydi?" belirsizligi biter. */}
              <span
                className="ml-auto flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500"
                title="Bir satırda markayı seç, sonra hücrenin sağ-alt tutamağını aşağı sürükle — her satıra kendi çapının fiyatı yazılır. Tutamağa çift-tık → aile bitene kadar doldurur."
              >
                <span className="text-amber-500">⚡</span>
                Marka seç → <b className="font-semibold text-slate-600">sürükle</b> ya da tutamağa{' '}
                <b className="font-semibold text-slate-600">çift-tık</b> ile grubu/aileyi doldur
              </span>
            </div>
          );
        })()}
        {/* KP: FIYATLANDIRMA IPUCU — "Malzeme Adı sütunu" cubugunun ICINDE
            DEGIL, kendi seridinde. Oradaydi ve KAYBOLUYORDU: o blok
            `excelCols.length === 0` ile erken donuyor; sabit semada grid
            alanlarinin HEPSI `_` onekli oldugu icin, kaydet→"Revize Et"
            turunda (payload `kaynakKolonlar`i tasimiyor) sutun listesi bos
            kaliyor ve serit hic cizilmiyordu. Yani ozellik Excel kaynakli
            HER REVIZYONDA gorunmez oluyordu — kesfedilemeyen ozellik yok
            hukmundedir. Kutuphane seridiyle simetri icin Ctrl+C de yazili. */}
        {(multiSheet || excelGridData) && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50/60 px-3 py-1.5 text-xs text-indigo-900">
            <span className="text-indigo-500">📋</span>
            <span>
              Birim fiyat: kütüphanede <b className="font-semibold">Ctrl+C</b> ile kopyala →
              buraya <b className="font-semibold">Ctrl+V</b> ile yapıştır ya da hücreye{' '}
              <b className="font-semibold">elle yaz</b>
            </span>
            <span className="text-[11px] text-indigo-400">
              Blok seçmek için Shift+ok / Shift+tık · toplamlar her iki yolda da yeniden hesaplanır
            </span>
          </div>
        )}
        {/* PRD v3.0 Bolum A1: "Sutunlar" paneli + gizli-sutun cipleri */}
        {managedColumns.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ColumnManagerPanel
              columns={managedColumns}
              hidden={activeHiddenFields ?? []}
              locked={lockedColumns}
              onToggleHidden={toggleColumnHidden}
              onShowAll={showAllColumns}
              floors={activeFloorFields}
              onToggleFloor={toggleColumnFloor}
              mikField={activeQtyField}
              onRemove={removeColumn}
            />
            {(activeHiddenFields ?? []).length > 0 && (
              <span className="text-[11px] text-slate-400">Gizli:</span>
            )}
            {(activeHiddenFields ?? []).map((f) => {
              const col = managedColumns.find((c) => c.field === f);
              if (!col) return null;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleColumnHidden(f)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
                  title="Sütunu geri getir"
                >
                  {col.headerName}
                  <span className="text-slate-400">×</span>
                </button>
              );
            })}
          </div>
        )}
        <ExcelGrid
          ref={excelGridRef}
          key={multiSheet ? `sheet-${activeSheetIndex}` : 'single'}
          // PRD v3.0 Bolum B: global oto-varyant KAPALI — dropdown tek-satir
          // (manuel), yayilim yalniz SURUKLE/CIFT-TIK ile. onAutoVariantChange
          // GONDERILMEZ: surukleme artik global anahtar acmaz.
          autoVariantEnabled={false}
          // PRD v3.0 A2: "kat" isaretli sutunlar → MIK = katlarin satir-toplami
          floorFields={activeFloorFields}
          // §3: yayilim bilgisi — "n satır güncellendi"
          onAutoVariantApplied={({ applied, waiting, missing, hatali }) => {
            const parca: string[] = [];
            if (applied > 0) parca.push(`${applied} satır güncellendi`);
            if (waiting > 0) parca.push(`${waiting} seçim bekliyor`);
            if (missing > 0) parca.push(`${missing} markada yok`);
            if ((hatali ?? 0) > 0) parca.push(`${hatali} sorgu hatası — tekrar deneyin`);
            if (parca.length > 0) toast({ title: '⚡ Otomatik varyant atama', description: parca.join(' · ') });
          }}
          // Excel-vari "en altta hep bos satir" — DWG metraj grid'inde aktif
          // (Excel yolunda backend kolonlari cok genis, davranis degismesin)
          autoAppendRow={multiSheet?.sheets?.length === 1 && multiSheet.sheets[0]?.name === 'DWG Metraj'}
          // DINAMIK GRID: sag tik → satir/sutun ekle-sil (yalniz teklif duzenleme;
          // detay sayfasi salt okunur kalir). Sutun degisimi multiSheet'e yazilir →
          // draft (sessionStorage) + kayit (sheetsPayload) otomatik persist.
          enableStructureEdit
          // YAPISAL DEGISIKLIK (03.09): satir ekle/sil, spare→gercek satir,
          // fitting bagi/kapsami. Hucre nesneleri referansla paylasilsa da
          // EKLENEN satir bu diziye girmiyordu (sekme gecisi/kayit kaybi) ve
          // yerinde mutasyon taslak efektini tetiklemiyordu (F5 fitting isini
          // siliyordu). Grid'in guncel listesi yazilir → kayit + taslak gorur.
          // `onRowDataChange` BILEREK verilmiyor: her hucre yaziminda parent
          // render acik editoru iptal ederdi; bu kanca yalniz yapisal olayda.
          onStructureChange={(rows) => {
            setLiveRowDataBySheet((prev) => ({ ...prev, [activeSheetKey]: rows }));
          }}
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
                    // PRD v3.0 A1: gizli sutunlar uygulanmis (memoize edilmis)
                    columnDefs: displayColumnDefs,
                    rowData: liveRowDataBySheet[active.index] ?? active.rowData ?? [],
                    columnRoles: active.columnRoles ?? {},
                    brands: multiSheet.brands ?? [],
                    headerEndRow: active.headerEndRow ?? 0,
                  };
                })()
              : excelGridData!
          }
          brands={allBrands}
          columnWidths={colWidthsBySheet[activeSheetKey]}
          onColumnWidthsChange={(w) => setColWidthsBySheet((prev) => ({ ...prev, [activeSheetKey]: w }))}
          currencySymbol={currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₺'}
          conversionRate={conversionRate}
          laborFirms={laborFirms}
          sheetDiscipline={(() => {
            const idx = activeSheetIndex;
            // PANO 17a: kayitli/eski sayfalarda discipline yoksa AD'dan tespit
            return sheetDisciplines[idx] ?? multiSheet?.sheets[idx]?.discipline
              ?? adDisiplinTahmini(multiSheet?.sheets[idx]?.name);
          })()}
          laborEnabled={(() => {
            const idx = activeSheetIndex;
            // PANO 17a: disiplin AD'dan da cozulur; hicbiri yoksa mekanik
            // varsayilir (satir "Disiplin?" ile BLOKLANMAZ — 17c).
            const disc = sheetDisciplines[idx] ?? multiSheet?.sheets[idx]?.discipline
              ?? adDisiplinTahmini(multiSheet?.sheets[idx]?.name) ?? 'mechanical';
            if (disc === 'electrical') return capabilities.electrical.labor;
            return capabilities.mechanical.labor;
          })()}
          onFirmaChange={async (rowIdx, firmaId, laborName, opts) => {
            try {
              // PRD Iscilik: TEK MOTOR — malzeme onBrandChange ile ayni akis.
              // E2/L6: satirin BIRIMI motora sinyal + SERT filtre (mt↔adet).
              let units: Record<string, string> | undefined;
              if (multiSheet) {
                const active = multiSheet.sheets[activeSheetIndex] ?? multiSheet.sheets.find((s) => !s.isEmpty);
                const unitField = (active?.columnRoles as any)?.unitField;
                if (active && unitField) {
                  const rowsNow = liveRowDataBySheet[active.index] ?? active.rowData ?? [];
                  const row = rowsNow.find((r: any) => r._rowIdx === rowIdx);
                  const u = String((row as any)?.[unitField] ?? '').trim();
                  if (u) units = { [laborName]: u };
                }
              }
              const { data: result } = await api.post('/labor-matching/bulk-match', {
                firmaId,
                laborNames: [laborName],
                // L7: surukleme kalem cinsini (kaynakli/yivli) tasir
                variantTags: opts?.variantTags,
                units,
              });
              const match = result[laborName];
              const silent = opts?.silent === true; // fill sirasinda toast yok
              if (!match) {
                if (!silent) toast({ title: 'Iscilik eslesmedi', description: `"${laborName.slice(0, 40)}"` });
                return null;
              }
              // L4: secim popup'i ExcelGrid'de acilir — eylemsiz toast YOK (B3)
              if (match.confidence === 'multi' && match.candidates?.length) {
                // K3 (27.08): alternatifler MULTI dalinda da tasinir. Motor S7 den
                // beri coklu adayda da capraz-firma alternatifi uretiyor; FE bu
                // alani ATTIGI icin kullanici "bu firmada su adaylar" ile "su
                // firmalarda da var" bilgisinden YALNIZ birini gorebiliyordu.
                return { netPrice: 0, matchedName: match.matchedName, candidates: match.candidates, alternatives: match.alternatives, reason: match.reason, variantMissing: match.variantMissing };
              }
              if (match.netPrice > 0) {
                const netPrice = parseFloat(String(match.netPrice)) || 0;
                if (!silent) toast({
                  title: match.autoVariant
                    ? `⚡ Otomatik işçilik: ${displayPrice(netPrice)} — ${laborName.slice(0, 40)}`
                    : `🔧 ${displayPrice(netPrice)} (iscilik)`,
                  description: `Eslesti: ${match.matchedName?.slice(0, 80) ?? 'Bilinmeyen'}`,
                });
                return { netPrice, matchedName: match.matchedName, reason: match.reason, confidence: match.confidence, autoVariant: match.autoVariant, hafizaOtoyaz: match.hafizaOtoyaz, variantTags: match.variantTags, kaynakKur: (match as any).kaynakKur };
              }
              // Eslesme bulundu ama fiyat 0 — kullaniciya uyari
              if (match.confidence === 'high' && match.matchedName) {
                if (!silent) toast({
                  title: `⚠ Iscilik fiyati 0`,
                  description: `"${match.matchedName.slice(0, 60)}" eslesti ama firma listesinde bu kalemin fiyati girilmemis. Kutuphaneye gidip iskonto/fiyat ekleyin.`,
                  variant: 'destructive',
                });
                return { netPrice: 0, matchedName: match.matchedName, candidates: match.candidates, reason: match.reason };
              }
              // URUN DEGIL (oran/hizmet satiri) — fiyat beklenmiyor
              if (match.notProduct) {
                if (!silent) toast({ title: 'Ürün değil', description: 'Oran/hizmet satırı — işçilik beklenmiyor.' });
                return { netPrice: 0, notProduct: true, reason: match.reason };
              }
              // L5: bu firmada yok — alternatif firmalar popup'i ExcelGrid'de
              if (match.alternatives?.length) {
                return { netPrice: 0, alternatives: match.alternatives, reason: match.reason };
              }
              if (!silent) toast({ title: 'Iscilik eslesmedi', description: match.reason ?? `"${laborName.slice(0, 40)}"` });
              // K3-FE (27.08): SEBEP DUSURULMEZ. Eskiden null donuluyordu ve
              // motorun ozenli gerekce cumlesi (E4/E6: "Bu üründe … yok · en
              // yakın: … · çevrim: …") SURUKLEME yolunda kullaniciya HIC
              // ulasmiyordu — hucrede jenerik "Kütüphanede eşleşme yok"
              // kaliyordu. fill-down r.reason'i zaten sebep alanina yazar;
              // eksik olan tek sey bu donus nesnesiydi (E5'in reason ikizi).
              return { netPrice: 0, reason: match.reason };
            } catch (e: any) {
              // SESSIZ BOS YASAK (06.08): sunucu hatasi "eslesmedi" gibi
              // gorunmesin. VS (25.08): SURUKLEMEDE (silent) hata YUTULMAZ —
              // fillDown'un SD2b 'hata' dali ancak throw ile canlanir (iscilik
              // dali malzemenin IKIZI). Etkilesimli tekil cagrida toast kalir.
              if (opts?.silent === true) throw e;
              console.error('[FirmaDropdown] error:', e);
              const kod = e?.response?.status;
              toast({
                title: 'Iscilik sorgusu basarisiz',
                description: `"${laborName.slice(0, 40)}" sorgulanamadi${kod ? ` (HTTP ${kod})` : ''} — "eslesmedi" DEGIL. Tekrar deneyin.`,
                variant: 'destructive',
              });
              return null;
            }
          }}
          onBrandChange={async (rowIdx, brandId, materialName, opts) => {
            try {
              // E2 (Boru Disi Kalemler PRD): satirin BIRIMI aile cozumune sinyal
              // (metre→boru, adet→ekipman) — aktif sheet'ten okunur, bulunamazsa
              // gonderilmez (backend'de opsiyonel).
              let units: Record<string, string> | undefined;
              if (multiSheet) {
                const active = multiSheet.sheets[activeSheetIndex] ?? multiSheet.sheets.find((s) => !s.isEmpty);
                const unitField = (active?.columnRoles as any)?.unitField;
                if (active && unitField) {
                  const rowsNow = liveRowDataBySheet[active.index] ?? active.rowData ?? [];
                  const row = rowsNow.find((r: any) => r._rowIdx === rowIdx);
                  const u = String((row as any)?.[unitField] ?? '').trim();
                  if (u) units = { [materialName]: u };
                }
              }
              const { data: result } = await api.post('/matching/bulk-match', {
                brandId,
                materialNames: [materialName],
                // V4: grup varyant filtresi — adaylar bu tag'lerin tamamini tasimali
                variantTags: opts?.variantTags,
                units,
              });
              const match = result[materialName];
              const silent = opts?.silent === true; // grup ici toplu uygulamada toast yok
              if (!match) {
                if (!silent) toast({ title: 'Eslesmedi', description: `"${materialName.slice(0, 40)}"` });
                return null;
              }

              // Multi-match: kullaniciya secenek sun (V4.5 variantMissing dahil).
              // B3: EYLEMSIZ TOAST YOK — secim popup'i ExcelGrid'de acilir,
              // toast gurultusu kaldirildi (hata raporu: "pasif uyari + dead-end").
              if (match.confidence === 'multi' && match.candidates?.length) {
                // K3 (27.08): alternatifler MULTI dalinda da tasinir (iscilik ikizi yukarida).
                // ⚠ K4 ile birlikte ONEMLI: yuzey-genisletilmis satirlar artik 'multi'
                // donuyor; bu alan tasinmazsa capraz-marka kutusu O SATIRLARDA DUSERDI
                // (kullanici DOGRU yuzeyli urunu baska markada gormeyi kaybederdi).
                return { netPrice: 0, matchedName: match.matchedName, candidates: match.candidates, alternatives: match.alternatives, reason: match.reason, donusum: match.donusum, variantMissing: match.variantMissing };
              }

              // Tek eslesme basarili
              if (match.netPrice > 0) {
                const netPrice = parseFloat(String(match.netPrice)) || 0;
                // U2 seffaf cevrim rozeti: "DN 25 → 1" (çelik)" — cevrim yapildiysa goster
                const rozet = match.donusum ? ` · ${match.donusum}` : '';
                // A5/B3: "Öneri / tahmini eşleşme — lütfen kontrol edin" pasif
                // balonu TAMAMEN KALDIRILDI — netPrice>0 artik yalniz 'high'
                // (kesin) veya autoVariant (kullanici seciminin yayilimi) olabilir.
                if (!silent) toast({
                  title: match.autoVariant
                    ? `⚡ Otomatik varyant: ${displayPrice(netPrice)} — ${materialName.slice(0, 40)}`
                    : `🟢 ${displayPrice(netPrice)} — ${materialName.slice(0, 50)}`,
                  description: `Eslesti: ${match.matchedName?.slice(0, 80) ?? 'Bilinmeyen'}${rozet}`,
                });
                // hafizaOtoyaz (I6 rozeti): fiyat GECMIS SECIMDEN atandi — grid
                // hucrede "Geçmiş seçiminizden atandı" rozeti gosterir.
                return { netPrice, matchedName: match.matchedName, candidates: match.candidates, reason: match.reason, confidence: match.confidence, donusum: match.donusum, autoVariant: match.autoVariant, hafizaOtoyaz: match.hafizaOtoyaz, variantTags: match.variantTags, kaynakKur: (match as any).kaynakKur };
              }

              // Eslesme bulundu ama fiyat 0 — kullaniciya uyari
              if (match.confidence === 'high' && match.matchedName) {
                if (!silent) toast({
                  title: `⚠ Malzeme fiyati 0`,
                  description: `"${match.matchedName.slice(0, 60)}" eslesti ama kutuphanede fiyat girilmemis. Kutuphaneye gidip fiyat ekleyin.`,
                  variant: 'destructive',
                });
                return { netPrice: 0, matchedName: match.matchedName, candidates: match.candidates, reason: match.reason };
              }

              // URUN DEGIL (spec): oran/hizmet satiri — fiyat beklenmiyor,
              // hucre gri isaretlenir; hata tonu YOK.
              if (match.notProduct) {
                if (!silent) toast({ title: 'Ürün değil', description: 'Oran/hizmet satırı — fiyat beklenmiyor.' });
                return { netPrice: 0, notProduct: true, reason: match.reason };
              }
              // M3: bu markada urun yok ama baska markalarda VAR — tiklanabilir
              // alternatif listesi ExcelGrid popup'inda acilir (eylemsiz toast yok)
              if (match.alternatives?.length) {
                return { netPrice: 0, alternatives: match.alternatives, reason: match.reason };
              }
              // Eslesme yok
              if (!silent) toast({ title: 'Eslesmedi', description: match.reason ?? `"${materialName.slice(0, 40)}"` });
              // K3-FE (27.08): SEBEP DUSURULMEZ — iscilik ikiziyle ayni gerekce.
              return { netPrice: 0, reason: match.reason };
            } catch (e: any) {
              // SESSIZ BOS YASAK (06.08): sunucu hatasi "eslesmedi" gibi
              // gorunmesin. `silent` toplu yayilimda gurultuyu keser.
              // VS (25.08): SURUKLEMEDE (silent) hata YUTULMAZ — fillDown'un
              // SD2b 'hata' dali ancak throw ile canlanir; null donmek sunucu
              // hatasini 'kutuphanede yok' pembesine boyuyordu (yanlis bilgi).
              if (opts?.silent === true) throw e;
              console.error('[ExcelGrid] brand change error:', e);
              const kod = e?.response?.status;
              toast({
                title: 'Marka sorgusu basarisiz',
                description: `"${materialName.slice(0, 40)}" sorgulanamadi${kod ? ` (HTTP ${kod})` : ''} — "eslesmedi" DEGIL. Tekrar deneyin.`,
                variant: 'destructive',
              });
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
      ) : (
        <div className="rounded border-2 border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-muted-foreground">
          Excel yukleniyor veya Excel goruntu alinamadi. Geri donup tekrar yuklemeyi deneyin.
        </div>
      )}

    </div>
  );
}
