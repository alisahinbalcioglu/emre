'use client';

// Cloudflare Pages icin Edge Runtime (dynamic route)
export const runtime = 'edge';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Loader2, Wrench, Zap, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import InlineFirmEntry from '@/components/library/InlineFirmEntry';
import type { FirmEntryHandle } from '@/components/library/InlineFirmEntry';
import type { ExcelGridData, ExcelRowData } from '@/components/excel-grid/types';

interface LaborFirm {
  id: string;
  name: string;
  discipline: 'mechanical' | 'electrical';
}

interface PriceList {
  id: string;
  name: string;
  uploadedAt: string;
  _count: { prices: number };
}

export default function LaborFirmDetailPage() {
  const params = useParams<{ firmaId: string }>();
  const router = useRouter();
  const firmaId = params.firmaId;

  const [firma, setFirma] = useState<LaborFirm | null>(null);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // L2 BEKLEYEN rozeti: adi cozumlenemedigi icin eslesmeye KAPALI kalem sayisi
  const [bekleyen, setBekleyen] = useState(0);
  // Sentetik sheet (save-bulk/manuel liste): nameField = kalemin TAM adi →
  // ad duzenlemesi guvenle kaydedilebilir (import JSON'unda cap-only olabilir)
  const [syntheticSheet, setSyntheticSheet] = useState(false);

  // Aktif liste icin ExcelGrid data
  const [gridData, setGridData] = useState<ExcelGridData | null>(null);
  const [liveRows, setLiveRows] = useState<ExcelRowData[]>([]);
  // KRITIK: kaydet sirasinda EN GUNCEL satirlari SENKRON oku. liveRows STATE
  // async — son hucre commit'i (fiyat) butona tiklama aninda setLiveRows ile
  // gelir ama handleSaveDrafts ayni tiklamada ESKI liveRows'u okurdu → yeni
  // satirin fiyati 0 gorunup "Birim Fiyat yok" ile atlaniyordu. Ref senkron.
  // (InlineFirmEntry de ayni nedenle rowsRef kullanir.)
  const liveRowsRef = useRef<ExcelRowData[]>([]);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [savingDrafts, setSavingDrafts] = useState(false);

  // Bos firma sabit-format giris grid'i — header "Degisiklikleri Kaydet" tetikler
  const inlineEntryRef = useRef<FirmEntryHandle>(null);
  const [headerSaving, setHeaderSaving] = useState(false);
  // "+ Yeni Liste": ayni firmaya ilave fiyat listesi (bos giris grid'i acilir,
  // kaydet YENI liste olusturur). Kullanici istegi 22.07 — "ilave sayfalar".
  const [newListMode, setNewListMode] = useState(false);

  const fetchFirma = useCallback(async () => {
    try {
      const { data } = await api.get<{ firma: LaborFirm; priceLists: PriceList[]; bekleyen?: number }>(
        `/labor-firms/${firmaId}/price-lists`,
      );
      setFirma(data.firma);
      setPriceLists(data.priceLists);
      setBekleyen(data.bekleyen ?? 0);
      if (data.priceLists.length > 0 && !activeListId) {
        setActiveListId(data.priceLists[0].id);
      }
      if (data.priceLists.length === 0) {
        setActiveListId(null);
        setGridData(null);
      }
    } catch {
      toast({ title: 'Yuklenemedi', variant: 'destructive' });
      router.push('/labor-firms');
    } finally {
      setLoading(false);
    }
  }, [firmaId, activeListId, router]);

  useEffect(() => {
    fetchFirma();
  }, [fetchFirma]);

  const fetchSheets = useCallback(async (listId: string) => {
    try {
      const { data } = await api.get(`/labor-firms/price-lists/${listId}/sheets`);
      if (!data?.sheet) {
        setGridData(null);
        return;
      }
      const sheet = data.sheet;
      // INLINE YENI KALEM (kullanici istegi 20.07): mevcut satirlarin altina
      // 30 bos satir + hep-bos spare (autoAppendRow) — malzeme marka-detay
      // sayfasiyla ayni desen. Kaydet: mevcut→save-sheets, yeni→save-bulk.
      const maxIdx = (sheet.rowData as any[]).reduce((m: number, r: any) => Math.max(m, r._rowIdx ?? 0), 0);
      const blank = (idx: number, spare = false) => {
        const row: any = { _rowIdx: idx, _isDataRow: true, _isHeaderRow: false };
        if (spare) row._isSpareRow = true;
        for (const c of sheet.columnDefs as any[]) {
          if (c.field && !String(c.field).startsWith('_')) row[c.field] = '';
        }
        return row;
      };
      const withBlanks = [...sheet.rowData];
      for (let i = 1; i <= 30; i++) withBlanks.push(blank(maxIdx + i));
      withBlanks.push(blank(maxIdx + 31, true));
      setGridData({
        columnDefs: sheet.columnDefs,
        rowData: withBlanks,
        columnRoles: sheet.columnRoles,
        brands: [],
        headerEndRow: sheet.headerEndRow ?? 0,
      });
      liveRowsRef.current = withBlanks;
      setLiveRows(withBlanks);
      setSyntheticSheet(!!sheet.synthetic);
      setDirtyCount(0);
    } catch (e: any) {
      toast({ title: 'Sheet yuklenemedi', description: e?.response?.data?.message, variant: 'destructive' });
      setGridData(null);
    }
  }, []);

  useEffect(() => {
    if (activeListId) fetchSheets(activeListId);
  }, [activeListId, fetchSheets]);

  function handleRowsChange(rows: ExcelRowData[]) {
    // Yeni array referansi olustur (React state update tetiklemek icin)
    const fresh = [...rows];
    liveRowsRef.current = fresh; // SENKRON — handleSaveDrafts bunu okur
    setLiveRows(fresh);
    const dirty = fresh.filter((r: any) => r._isDataRow && r._dirty).length;
    setDirtyCount(dirty);
    console.log(`[labor-firms detay] handleRowsChange: ${rows.length} satir, ${dirty} dirty`);
  }

  function parseTrNum(v: unknown): number {
    let s = String(v ?? '').replace(/[₺$€\s]/g, '').trim();
    if (s === '') return 0;
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.'); // TR bicimi
    else if (hasComma) s = s.replace(',', '.');
    return parseFloat(s) || 0;
  }

  async function handleSaveDrafts() {
    if (!activeListId || !gridData) return;
    const priceField = gridData.columnRoles.laborUnitPriceField;
    const unitField = gridData.columnRoles.unitField;
    const nameField = gridData.columnRoles.nameField;

    // liveRowsRef: SENKRON güncel satırlar (son hücre commit'i dahil). liveRows
    // STATE async olduğu için burada ref okunur — yoksa yeni satırın fiyatı kaçar.
    const rows = liveRowsRef.current;
    // MEVCUT kalemler (dirty + _laborPriceId) → save-sheets
    const dirtyExisting = rows.filter((r: any) => r._isDataRow && r._dirty && r._laborPriceId);
    // YENI satirlar (inline bos satirlara girilenler) → save-bulk
    const newFilled = rows.filter((r: any) =>
      r._isDataRow && !r._laborPriceId && !r._isSpareRow
      && nameField && String(r[nameField] ?? '').trim().length >= 2);

    if (dirtyExisting.length === 0 && newFilled.length === 0) {
      toast({ title: 'Degisiklik yok' });
      return;
    }

    setSavingDrafts(true);
    try {
      // ── Mevcut kalem guncellemeleri ──────────────────────────────
      // CANLI BULGU (20.07): unit HIC GONDERILMIYORDU — kullanici Birim'i
      // duzeltti, "kaydedildi" dendi ama DB'ye gitmedi. Artik gider.
      // AD/ÇAP DÜZENLEME (24.07): SABIT-FORMAT sheet'te (nameField='ad',
      // InlineFirmEntry) kalemin adı ad+cins+çap BİRLEŞİMİDİR. Kullanıcı Çap
      // veya Ad hücresini değiştirince laborItemName YENİDEN hesaplanıp gider →
      // backend LaborItem.name'i günceller + yeniden indeksler (eşleşme açılır).
      // Sentetik sheet: nameField=TAM ad → doğrudan. Import JSON'da nameField
      // cap-only olabilir (ne 'ad' ne synthetic) → ad overwrite YASAK, undefined.
      const fixedFormat = nameField === 'ad'; // InlineFirmEntry sabit-format imzası
      const buildLaborName = (r: any): string | undefined => {
        if (fixedFormat) {
          const parts = [String(r.ad ?? '').trim(), String(r.cins ?? '').trim(), String(r.cap ?? '').trim()].filter(Boolean);
          return parts.length ? parts.join(' ') : undefined;
        }
        return syntheticSheet && nameField ? (String(r[nameField] ?? '').trim() || undefined) : undefined;
      };
      if (dirtyExisting.length > 0) {
        const payload = dirtyExisting.map((r: any) => ({
          laborPriceId: r._laborPriceId,
          listPrice: priceField ? parseTrNum(r[priceField]) : undefined,
          discountRate: r._draftDiscount ?? r._laborDiscountRate ?? 0,
          unit: unitField ? (String(r[unitField] ?? '').trim() || undefined) : undefined,
          laborItemName: buildLaborName(r),
        })).filter((p) => !!p.laborPriceId);

        // SABIT-FORMAT: görsel yerleşim (ad/cins/çap/para/not) sheet JSON'da
        // yaşar. Ad/Çap düzenlemesi kalıcı olsun diye güncel grid'i de gönder
        // (header + kayıtlı kalemler; blank + henüz kaydedilmemiş satır HARİÇ).
        const sheetPayload = fixedFormat && gridData
          ? {
              columnDefs: gridData.columnDefs,
              columnRoles: gridData.columnRoles,
              headerEndRow: gridData.headerEndRow ?? 0,
              rowData: rows.filter((r: any) => r._isHeaderRow || (r._isDataRow && r._laborPriceId)),
            }
          : undefined;
        const { data } = await api.post(`/labor-firms/price-lists/${activeListId}/save-sheets`, {
          dirtyRows: payload,
          sheet: sheetPayload,
        });
        toast({ title: 'Kaydedildi', description: `${data.updated} kalem guncellendi` });
        if (data.errors && data.errors.length > 0) {
          toast({ title: 'Uyari', description: `${data.errors.length} hata`, variant: 'destructive' });
        }
      }

      // ── Yeni kalemler (inline giris) ─────────────────────────────
      if (newFilled.length > 0) {
        const items = newFilled.map((r: any) => ({
          laborName: String(r[nameField!]).trim(),
          unit: unitField ? (String(r[unitField] ?? '').trim() || 'Adet') : 'Adet',
          unitPrice: priceField ? parseTrNum(r[priceField]) : 0,
          discountRate: r._draftDiscount !== undefined && r._draftDiscount !== null && String(r._draftDiscount) !== ''
            ? parseTrNum(r._draftDiscount) : undefined,
        }));
        const fiyatli = items.filter((i) => i.unitPrice > 0);
        const fiyatsiz = items.length - fiyatli.length;
        if (fiyatli.length > 0) {
          const { data } = await api.post(`/labor-firms/${firmaId}/save-bulk`, {
            priceListId: activeListId,
            items: fiyatli,
          });
          toast({ title: 'Yeni kalemler eklendi', description: `${data.imported} kalem` });
        }
        if (fiyatsiz > 0) {
          toast({ title: 'Uyari', description: `${fiyatsiz} yeni satırda Birim Fiyat yok — kaydedilmedi.`, variant: 'destructive' });
        }
      }

      await fetchSheets(activeListId);
      await fetchFirma(); // bekleyen rozeti tazelensin
    } catch (e: any) {
      toast({ title: 'Kaydetme hatasi', description: e?.response?.data?.message, variant: 'destructive' });
    } finally {
      setSavingDrafts(false);
    }
  }

  async function deletePriceList(listId: string) {
    if (!(await confirm('Bu fiyat listesi silinsin mi?'))) return;
    try {
      await api.delete(`/labor-firms/price-lists/${listId}`);
      setPriceLists((prev) => prev.filter((pl) => pl.id !== listId));
      if (activeListId === listId) {
        setActiveListId(null);
        setGridData(null);
      }
      toast({ title: 'Silindi' });
    } catch {
      toast({ title: 'Hata', variant: 'destructive' });
    }
  }

  // TEK KAYDET (header'daki tek buton): bos firmada InlineFirmEntry (save-bulk),
  // dolu firmada aktif liste taslak degisiklikleri (handleSaveDrafts).
  async function handleHeaderSave() {
    setHeaderSaving(true);
    try {
      if (newListMode || priceLists.length === 0) {
        await inlineEntryRef.current?.save();
      } else {
        await handleSaveDrafts();
      }
    } finally {
      setHeaderSaving(false);
    }
  }

  // beforeunload
  useEffect(() => {
    if (dirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!firma) return null;

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/labor-firms?discipline=${firma.discipline}`}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />Firmalar
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {firma.discipline === 'mechanical' ? (
              <Wrench className="h-5 w-5 text-blue-600" />
            ) : (
              <Zap className="h-5 w-5 text-amber-600" />
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{firma.name}</h1>
              <p className="text-sm text-muted-foreground">
                {firma.discipline === 'mechanical' ? 'Mekanik' : 'Elektrik'} iscilik firmasi
                {bekleyen > 0 && (
                  <span
                    title="Adından iş/malzeme çıkarılamayan kalemler eşleşmeye kapalıdır. Kalem adını düzenleyince otomatik açılır."
                    className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-300"
                  >
                    ⏳ {bekleyen} bekleyen kalem
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {/* TEK BUTON (kullanici karari 22.07): "Manuel Kalem Ekle" ve "Excel
                Yukle" kaldirildi — sabit-format grid + tek "Degisiklikleri Kaydet". */}
            <Button size="sm" onClick={handleHeaderSave} disabled={headerSaving || savingDrafts}>
              {(headerSaving || savingDrafts) ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Kaydediliyor...</>
              ) : (
                <><Save className="mr-1 h-4 w-4" />Değişiklikleri Kaydet{dirtyCount > 0 ? ` (${dirtyCount})` : ''}</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Fiyat listeleri tab bar + "+ Yeni Liste" (ilave sayfa) */}
      {priceLists.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1">
          {priceLists.map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => { setNewListMode(false); setActiveListId(pl.id); }}
              className={[
                'px-3 py-1.5 text-xs rounded-md border transition-colors',
                !newListMode && activeListId === pl.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white border-gray-200 hover:bg-gray-50',
              ].join(' ')}
            >
              {pl.name} <span className="opacity-70">({pl._count.prices})</span>
            </button>
          ))}
          {/* Ayni firmaya ilave liste ekle */}
          <button
            type="button"
            onClick={() => setNewListMode(true)}
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
              onClick={() => deletePriceList(activeListId)}
            >
              <Trash2 className="mr-1 h-3 w-3" />Listeyi Sil
            </Button>
          )}
        </div>
      )}

      {/* KULLANICI KARARI (22.07): boş firmada VEYA "+ Yeni Liste" seçilince
          sabit-format giriş tablosu (malzeme listesiyle aynı: İskonto%+Net Fiyat);
          kaydet YENİ liste olusturur+indeksler. Mevcut listede: aktif grid
          (satır satır düzenle + blank satırlara ilave kalem + autoAppend). */}
      {newListMode || priceLists.length === 0 ? (
        <Card className="overflow-hidden p-3">
          <InlineFirmEntry
            key={newListMode ? 'yeni-liste' : 'bos-firma'}
            ref={inlineEntryRef}
            firmaId={firmaId}
            onSaved={async () => { setNewListMode(false); await fetchFirma(); }}
          />
        </Card>
      ) : activeListId && gridData ? (
        <Card className="overflow-hidden">
          <ExcelGrid
            key={activeListId}
            data={gridData}
            brands={[]}
            currencySymbol="₺"
            conversionRate={1}
            mode="library"
            libraryPriceField="laborUnitPriceField"
            autoAppendRow
            onBrandChange={async () => null}
            onRowDataChange={handleRowsChange}
          />
        </Card>
      ) : null}
    </div>
  );
}
