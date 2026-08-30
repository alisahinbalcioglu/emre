'use client';

// Cloudflare Pages icin Edge Runtime (dynamic route)
export const runtime = 'edge';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/ortak/ui/button';
import { GeriButonu } from '@/ortak/ui/geri-butonu';
import { Card } from '@/ortak/ui/card';
import api from '@/ortak/lib/api';
import { toast } from '@/ortak/hooks/use-toast';
import { confirm } from '@/ortak/hooks/use-confirm';
import { ExcelGrid, type ExcelGridHandle } from '@/ozellik/tablo/excel-grid/ExcelGrid';
import type { ExcelGridData, ExcelRowData } from '@/ozellik/tablo/excel-grid/types';

interface BrandLibraryResponse {
  id: string;
  userId: string;
  brandId: string;
  sheets: { sheets: Array<any> };
}

/** Markanin fiyat listesi sekmesi (iscilik "ilave sayfa"nin ikizi). */
interface LibraryListInfo {
  id: string;
  name: string;
  uploadedAt: string;
  _count: { items: number };
}

// Yapisal kolonlar — MEVCUT satirlarda salt-okunur (kaynak sadakati),
// YENI (bos) satirlarda editable (inline malzeme girisi).
const STRUCT_FIELDS = ['col_cins', 'col_baglanti', 'col_cap', 'col_boy', 'col_kod', 'col_not'];
const BLANK_ROW_COUNT = 30;
// STABIL referans — ExcelGrid'e her render'da YENI [] gecersek columnDefs useMemo
// recompute eder → AG-Grid kolon genislikleri resetlenir + aktif editor iptal olur.
const EMPTY_BRANDS: any[] = [];

function strOrU(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  return s === '' ? undefined : s;
}
function numOrU(v: unknown): number | undefined {
  // Excel yapistirinca TR bicimi: "6.500,00" (nokta=binlik, virgul=ondalik)
  let s = String(v ?? '').replace(/[₺$€\s]/g, '').trim();
  if (s === '') return undefined;
  const hasComma = s.includes(','), hasDot = s.includes('.');
  if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (hasComma) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

/** Yapisal kolonlari YALNIZ yeni (kutuphane kaydi olmayan) satirlarda editable
 *  yap. Ad/Birim/Fiyat zaten her satirda editable (save-sheets kalici yazar). */
function withNewRowEditable(cols: any[]): any[] {
  return cols.map((c) =>
    STRUCT_FIELDS.includes(c.field)
      ? { ...c, editable: (p: any) => !!p.data && !p.data._libraryItemId }
      : c,
  );
}

function makeBlankLibRow(cols: any[], idx: number, spare = false): ExcelRowData {
  const row: any = { _rowIdx: idx, _isDataRow: true, _isHeaderRow: false, _currency: 'TRY', _groupKey: '' };
  if (spare) row._isSpareRow = true;
  for (const c of cols) if (!c.field.startsWith('_')) row[c.field] = '';
  return row;
}

export default function LibraryBrandDetailPage() {
  const params = useParams<{ brandId: string }>();
  const router = useRouter();
  const brandId = params.brandId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gridData, setGridData] = useState<ExcelGridData | null>(null);
  const [brandName, setBrandName] = useState('');
  // Liste sekmeleri (iscilik deseni): aktif sekme + "+ Yeni Liste" modu
  const [lists, setLists] = useState<LibraryListInfo[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [newListMode, setNewListMode] = useState(false);
  // Yeni-liste bos grid'i icin son yuklenen kolon seti (backend hep tam set doner)
  const colDefsRef = useRef<any[] | null>(null);
  const colRolesRef = useRef<any | null>(null);
  const [liveRows, setLiveRows] = useState<ExcelRowData[]>([]);
  // KRITIK (race fix — işçilikle aynı): handleSave SENKRON güncel satırları
  // okumalı. liveRows STATE async — son hücre commit'i (fiyat) Kaydet'e tıklama
  // anında setLiveRows ile gelir ama AYNI event'te handleSave eski liveRows'u
  // okurdu → yeni malzeme kaçar/kaydedilmez. Ref senkron.
  const liveRowsRef = useRef<ExcelRowData[]>([]);
  const gridRef = useRef<ExcelGridHandle>(null); // save öncesi stopEditing()+getRowData()
  const [dirtyCount, setDirtyCount] = useState(0); // mevcut satir fiyat/iskonto degisikligi
  const [newCount, setNewCount] = useState(0);     // yeni girilen malzeme satiri

  /** Liste sekmelerini ceker (backend NULL satirlari varsayilan listeye gocurur). */
  const fetchLists = useCallback(async (): Promise<LibraryListInfo[]> => {
    const { data } = await api.get<{ lists: LibraryListInfo[] }>(`/library/brand/${brandId}/lists`);
    setLists(data.lists ?? []);
    return data.lists ?? [];
  }, [brandId]);

  // BAYAT CEVAP KORUMASI: hizli sekme gecisinde (veya kayit sonrasi gecişte)
  // YAVAS donen eski istek, yeni sekmenin grid'ini ezebiliyordu — canli
  // dogrulamada birebir yasandi (116 satirli eski liste, 1 satirli yeni
  // listeden GEC dondu ve ekrani geri aldi). Yalniz SON istegin cevabi yazilir.
  const fetchSeq = useRef(0);

  /** Aktif sekmenin grid'ini yukler. Bos liste de gecerli: backend satirsiz
   *  ama TAM kolonlu sheet doner (iscilik "kolonlar kayboldu" dersi). */
  const fetchData = useCallback(async (listId: string) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const { data } = await api.get<BrandLibraryResponse>(
        `/library/brand/${brandId}/sheets?listId=${listId}`,
      );
      if (seq !== fetchSeq.current) return; // bayat cevap — yenisi yolda
      const firstSheet = data.sheets?.sheets?.[0];
      if (!firstSheet) {
        toast({ title: 'Veri yok', variant: 'destructive' });
        router.push('/library');
        return;
      }

      // TEK TIP kolonlar (backend hep tam set doner) + yeni-satir editable
      const cols = withNewRowEditable(firstSheet.columnDefs ?? []);
      colDefsRef.current = firstSheet.columnDefs ?? [];
      colRolesRef.current = firstSheet.columnRoles;
      const existing: ExcelRowData[] = firstSheet.rowData ?? [];

      // Inline giris: en alta 30 bos satir + 1 spare (autoAppendRow devami)
      const maxIdx = existing.reduce((m: number, r: any) => Math.max(m, r._rowIdx ?? 0), 0);
      const blanks: ExcelRowData[] = [];
      for (let i = 0; i < BLANK_ROW_COUNT; i++) blanks.push(makeBlankLibRow(cols, maxIdx + 1 + i));
      blanks.push(makeBlankLibRow(cols, maxIdx + 1 + BLANK_ROW_COUNT, true));
      const rowData = [...existing, ...blanks];

      setGridData({
        columnDefs: cols,
        rowData,
        columnRoles: firstSheet.columnRoles,
        brands: [],
        headerEndRow: firstSheet.headerEndRow ?? 0,
      });
      liveRowsRef.current = rowData;
      setLiveRows(rowData);
      setDirtyCount(0);
      setNewCount(0);
    } catch (e: any) {
      toast({ title: 'Yuklenemedi', description: e?.response?.data?.message, variant: 'destructive' });
      router.push('/library');
    } finally {
      setLoading(false);
    }
  }, [brandId, router]);

  // Mount: marka adi + sekmeler → ilk sekme aktif
  useEffect(() => {
    (async () => {
      try {
        try {
          const { data: brand } = await api.get<{ name: string }>(`/brands/${brandId}`);
          setBrandName(brand.name);
        } catch {}
        const ls = await fetchLists();
        if (ls.length === 0) {
          toast({ title: 'Veri yok', variant: 'destructive' });
          router.push('/library');
          return;
        }
        setActiveListId(ls[0].id);
      } catch (e: any) {
        toast({ title: 'Yuklenemedi', description: e?.response?.data?.message, variant: 'destructive' });
        router.push('/library');
      }
    })();
  }, [brandId, fetchLists, router]);

  // Aktif sekme degisince grid'i yukle (yeni-liste modunda fetch YOK)
  useEffect(() => {
    if (activeListId && !newListMode) fetchData(activeListId);
  }, [activeListId, newListMode, fetchData]);

  /** "+ Yeni Liste": bos grid (ayni kolon seti, tum satirlar yeni=editable). */
  function enterNewListMode() {
    const defs = colDefsRef.current;
    if (!defs) return;
    const cols = withNewRowEditable(defs);
    const rowData: ExcelRowData[] = [];
    for (let i = 0; i < BLANK_ROW_COUNT; i++) rowData.push(makeBlankLibRow(cols, i));
    rowData.push(makeBlankLibRow(cols, BLANK_ROW_COUNT, true));
    setGridData({
      columnDefs: cols,
      rowData,
      columnRoles: colRolesRef.current,
      brands: [],
      headerEndRow: 0,
    });
    liveRowsRef.current = rowData;
    setLiveRows(rowData);
    setDirtyCount(0);
    setNewCount(0);
    setNewListMode(true);
  }

  const nameField = gridData?.columnRoles.nameField ?? 'col1';

  // STABIL — memoize edilmezse her render'da yeni ref → columnDefs recompute →
  // kolon reset + editor iptal. deps: nameField (fetch'te bir kez degisir).
  const handleRowsChange = useCallback((rows: ExcelRowData[]) => {
    const fresh = [...rows];
    liveRowsRef.current = fresh; // SENKRON — handleSave bunu okur
    setLiveRows(fresh);
    const dirty = fresh.filter((r: any) => r._isDataRow && r._libraryItemId && r._dirty).length;
    const yeni = fresh.filter(
      (r: any) => r._isDataRow && !r._libraryItemId && String(r[nameField] ?? '').trim() !== '',
    ).length;
    setDirtyCount(dirty);
    setNewCount(yeni);
  }, [nameField]);
  const noBrandChange = useCallback(async () => null, []);

  async function handleSave() {
    if (!gridData) return;
    const priceField = gridData.columnRoles.materialUnitPriceField;
    const unitField = gridData.columnRoles.unitField;

    // HİPOTEZ 1 (talep 24.07): son hücreye yazıp blur ETMEDEN Kaydet'e basınca
    // aktif düzenlemeyi ZORLA commit et (yoksa yazılan çap/satır payload'a girmez).
    gridRef.current?.stopEditing();
    // HİPOTEZ 2: grid'in TAM güncel halini al; liveRowsRef fallback.
    const gridRows = gridRef.current?.getRowData();
    const rows2 = (gridRows && gridRows.length) ? gridRows : liveRowsRef.current;
    const dirtyExisting = rows2.filter((r: any) => r._isDataRow && r._libraryItemId && r._dirty);
    const newRows = rows2.filter(
      (r: any) => r._isDataRow && !r._libraryItemId && String(r[nameField] ?? '').trim() !== '',
    );
    if (dirtyExisting.length === 0 && newRows.length === 0) {
      toast({ title: 'Degisiklik yok' });
      return;
    }

    const rowsPayload = (list: any[]) => list.map((r: any) => ({
      ad: String(r[nameField]).trim(),
      cins: strOrU(r.col_cins),
      baglanti: strOrU(r.col_baglanti),
      cap: strOrU(r.col_cap),
      boy: strOrU(r.col_boy),
      urunKodu: strOrU(r.col_kod),
      not: strOrU(r.col_not),
      birim: strOrU(unitField ? r[unitField] : undefined),
      price: numOrU(priceField ? r[priceField] : undefined),
      discountRate: numOrU(r._draftDiscount),
    }));

    setSaving(true);
    try {
      // ── YENI LISTE MODU: satirlar 'new' hedefiyle gider (iscilik ikizi). ──
      // Backend ISCILIK DERSINI uygular: gecerli satir yoksa 400 doner ve liste
      // HIC OLUSMAZ — catch'e duseriz, mod acik kalir, girilenler ekranda durur.
      if (newListMode) {
        const { data } = await api.post(`/library/brand/${brandId}/rows`, {
          listId: 'new',
          rows: rowsPayload(newRows),
        });
        toast({ title: 'Kaydedildi', description: `"${data.listName}" olusturuldu · ${data.created} malzeme` });
        // Iki set AYNI senkron blokta: tek render → effect BIR kez, yeni id ile
        // kosar. Once mod kapatilip await edilseydi effect eski id ile de
        // atesleniyordu (iki istek yarisir, yavas olan ekrani ezerdi).
        setActiveListId(data.listId);
        setNewListMode(false);
        await fetchLists();
        return;
      }

      let updated = 0;
      let added = 0;

      // 1) Mevcut satir fiyat/iskonto guncelle (save-sheets)
      if (dirtyExisting.length > 0) {
        const payload = dirtyExisting.map((r: any) => ({
          libraryItemId: r._libraryItemId,
          // ⚠ `parseFloat` DEGIL `numOrU` (ayni dosyada zaten tanimli, yeni
          // satir yolunda kullaniliyordu — bu dal atlanmisti):
          //   parseFloat('6.500,00')   → 6.5   (BIN KAT dusuk, kalici olarak DB'ye)
          //   parseFloat('₺105.800,00') → NaN → `|| 0` ile 0 (fiyat SILINIR)
          // Hucrede TR bicimli metin bulunmasi olagan: kullanici elle yazar,
          // Excel'den ya da kutuphanenin kendi Net Fiyat sutunundan yapistirir.
          // Iscilik ikizi (labor-firms/[firmaId]/page.tsx: parseTrNum) bu metni
          // ZATEN dogru okuyordu — ayni alan, ikiz sayfa, iki farkli sonuc.
          listPrice: priceField ? (numOrU(r[priceField]) ?? 0) : undefined,
          discountRate: r._draftDiscount ?? r._libraryDiscountRate ?? 0,
          // Birim edit'i de kalici (save-sheets trim'ler).
          unit: unitField ? String(r[unitField] ?? '').trim() || undefined : undefined,
          // ── AD DA GONDERILIR (06.08 kullanici bildirimi) ──────────────────
          // Onceden BILEREK gonderilmiyordu; gerekce "Material.name kisa
          // surumle ezilmesin (kaynak sadakati)" idi. Gerekce dogruydu ama
          // YANLIS ALANA uygulanmis: `save-sheets` paylasilan `Material`e HIC
          // dokunmaz, yalniz kullanicinin KENDI `UserLibrary` satirini yazar
          // (backend testi C1 bunu olcer). Bedeli su oldu: kullanici adi
          // degistiriyor, ekran "Kaydedildi" diyor, ad eski kaliyordu.
          materialName: String(r[nameField] ?? '').trim() || undefined,
        }));
        const { data } = await api.post(`/library/brand/${brandId}/save-sheets`, { dirtyRows: payload });
        updated = data.updated ?? 0;
      }

      // 2) Yeni malzemeler → AKTIF listeye ekle. Eski yol `manual-brand` idi:
      //    marka ADIYLA calisir ve her kayitta gorunmez yeni PriceList acardi;
      //    sekmeler varken satirlar hedefsiz kalirdi — artik sekmeye gider.
      if (newRows.length > 0 && activeListId) {
        const { data } = await api.post(`/library/brand/${brandId}/rows`, {
          listId: activeListId,
          rows: rowsPayload(newRows),
        });
        added = data.created ?? 0;
      }

      toast({ title: 'Kaydedildi', description: `${updated} guncellendi · ${added} yeni malzeme` });
      await fetchLists(); // sekme sayaclari tazelensin
      if (activeListId) await fetchData(activeListId);
    } catch (e: any) {
      toast({ title: 'Kaydetme hatasi', description: e?.response?.data?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  /** Aktif liste sekmesini sil (satirlariyla birlikte — onayli). */
  async function deleteActiveList() {
    const liste = lists.find((l) => l.id === activeListId);
    if (!liste) return;
    const sayi = liveRows.filter((r: any) => r._isDataRow && r._libraryItemId).length;
    if (!(await confirm(`"${liste.name}" listesi ve içindeki ${sayi} malzeme kütüphanenizden silinsin mi?`))) return;
    try {
      await api.delete(`/library/brand/${brandId}/lists/${liste.id}`);
      toast({ title: 'Silindi', description: liste.name });
      const kalan = await fetchLists();
      if (kalan.length === 0) {
        // Son liste de gitti → marka kutuphaneden dustu
        router.push('/library/mechanical-brands');
        return;
      }
      setActiveListId(kalan[0].id);
    } catch (e: any) {
      toast({ title: 'Silinemedi', description: e?.response?.data?.message, variant: 'destructive' });
    }
  }

  /**
   * KALICI SATIR SILME (06.08 kullanici bildirimi: "ilave eklediklerimi
   * silemiyorum").
   *
   * ESKI DAVRANIS: sag tik → "Satırı sil" satiri YALNIZ gridden kaldiriyordu
   * (ExcelGrid.deleteRow → applyTransaction). Kutuphane satirinin arkasinda
   * kendi kaydi (UserLibrary) oldugu icin sayfa yenilenince satir GERI
   * GELIYORDU — kullanicinin "silemiyorum" dedigi sey buydu.
   *
   * Iki satir tipi AYRI: kaydi olan satir sunucudan da silinir; henuz
   * kaydedilmemis (bos/yeni) satirin sunucuda karsiligi YOKTUR, dogrudan
   * gridden kalkar. Onay YALNIZ gercek kayit icin istenir — bos satir
   * silmek icin onay sormak gurultudur.
   */
  const handleRowDelete = useCallback(async (row: ExcelRowData): Promise<boolean> => {
    const itemId = (row as any)._libraryItemId as string | undefined;
    if (!itemId) return true; // kaydedilmemis satir — sunucuda karsiligi yok

    const ad = String((row as any)[nameField] ?? '').trim() || 'Bu malzeme';
    if (!(await confirm(`"${ad}" kütüphanenizden silinsin mi?`))) return false;
    try {
      await api.delete(`/library/${itemId}`);
      toast({ title: 'Silindi', description: ad });
      fetchLists().catch(() => {}); // sekme sayaci tazelensin (kritik degil)
      return true;
    } catch (e: any) {
      // Sessiz basarisizlik YASAK: silinemediyse satir EKRANDA KALIR ve
      // kullanici nedenini gorur (yoksa "sildim sandim" hali dogar).
      toast({
        title: 'Silinemedi',
        description: e?.response?.data?.message ?? 'Sunucu satiri silemedi.',
        variant: 'destructive',
      });
      return false;
    }
  }, [nameField]);

  async function handleRemoveBrand() {
    if (!(await confirm(`"${brandName}" kütüphanenizden tamamen kaldırılsın mı?`))) return;
    try {
      await api.delete(`/library/brand/${brandId}`);
      toast({ title: 'Silindi' });
      router.push('/library/mechanical-brands');
    } catch {
      toast({ title: 'Hata', variant: 'destructive' });
    }
  }

  const pendingCount = dirtyCount + newCount;

  // beforeunload — kaydedilmemis degisiklik/yeni malzeme varken uyar
  useEffect(() => {
    if (pendingCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!gridData) return null;

  const malzemeSayisi = liveRows.filter((r: any) => r._isDataRow && r._libraryItemId).length;

  return (
    <div>
      <GeriButonu hedef="/library" />
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{brandName || 'Marka'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {newListMode
              ? 'Yeni liste — satırları doldurup Kaydet\'e basın'
              : `${malzemeSayisi} malzeme`}
            <span className="ml-2 text-xs text-muted-foreground/70">
              · Yeni malzeme için en alttaki boş satırları doldurun (Excel&apos;den yapıştırabilirsiniz)
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {pendingCount > 0 && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Kaydediliyor...</>
              ) : (
                <><Save className="mr-1 h-4 w-4" />Kaydet ({pendingCount})</>
              )}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleRemoveBrand}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />Markayi Kaldir
          </Button>
        </div>
      </div>

      {/* Fiyat listesi sekmeleri + "+ Yeni Liste" (iscilik firma detayindaki desen) */}
      {lists.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1">
          {lists.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => { setNewListMode(false); setActiveListId(l.id); }}
              className={[
                'px-3 py-1.5 text-xs rounded-md border transition-colors',
                !newListMode && activeListId === l.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white border-gray-200 hover:bg-gray-50',
              ].join(' ')}
            >
              {l.name} <span className="opacity-70">({l._count.items})</span>
            </button>
          ))}
          <button
            type="button"
            onClick={enterNewListMode}
            className={[
              'px-3 py-1.5 text-xs rounded-md border border-dashed transition-colors',
              newListMode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white border-blue-300 text-blue-600 hover:bg-blue-50',
            ].join(' ')}
          >
            + Yeni Liste
          </button>
          {!newListMode && activeListId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive"
              onClick={deleteActiveList}
            >
              <Trash2 className="mr-1 h-3 w-3" />Listeyi Sil
            </Button>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        <ExcelGrid
          key={newListMode ? 'yeni-liste' : (activeListId ?? 'liste')}
          ref={gridRef}
          data={gridData}
          brands={EMPTY_BRANDS}
          currencySymbol="₺"
          conversionRate={1}
          mode="library"
          libraryPriceField="materialUnitPriceField"
          autoAppendRow
          enableStructureEdit
          onRowDelete={handleRowDelete}
          onBrandChange={noBrandChange}
          onRowDataChange={handleRowsChange}
        />
      </Card>
    </div>
  );
}
