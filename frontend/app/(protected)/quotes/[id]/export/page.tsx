'use client';

// ── PRD Teklif Formatim §3: CIKTI ONIZLEME ──
// Sekmeler: [Kapak — duzenlenebilir] [Icmal — duzenlenebilir] [Liste — SALT
// OKUNUR (T15)]. Duzenlemeler TEKLIF KATMANINA yazilir (T13 — ana format
// DEGISMEZ); otomatik dolan hucre duzenlenirse "manuel" rozeti + "otomatige
// don" (T14). "Excel + PDF Olustur" soru sormaz (v2) — rev artar (T10).

export const runtime = 'edge';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Download, Save, RotateCcw, Lock, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import type { ExcelGridData, ExcelRowData } from '@/components/excel-grid/types';

interface YerTutucu { etiket: string; sheet: string; addr: string }
interface GridSheet {
  name: string;
  columnDefs: Array<{ field: string; headerName: string; width: number; editable: boolean }>;
  rowData: Array<Record<string, any>>;
}
interface PreviewData {
  quoteId: string;
  teklifNo: string | null;
  rev: number;
  formatSheets: GridSheet[];
  // Bulgu B1 gorunurlugu: hangi format kullaniliyor (yerlesik ise uyari)
  formatAdi?: string;
  formatKaynak?: 'kullanici' | 'yerlesik';
  dolan: YerTutucu[];
  overrides: Record<string, Record<string, { value: string | number; manual?: boolean }>>;
  listeAdlari: string[];
  info: { musteri?: string; proje?: string; hazirlayan?: string; gecerlilik?: string; formatId?: string | null };
}
interface ExportKaydi { id: string; rev: number; fileName: string; createdAt: string }

const kolonHarf = (n: number): string => {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

const EMPTY_BRANDS: any[] = [];

function blobIndir(data: Blob, headers: any, fallback: string) {
  const url = window.URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a');
  a.href = url;
  let filename = fallback;
  const disposition = headers?.['content-disposition'];
  if (disposition) {
    const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match?.[1]) filename = decodeURIComponent(match[1].replace(/['"]/g, ''));
  }
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

export default function ExportPreviewPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<PreviewData | null>(null);
  const [listeSheets, setListeSheets] = useState<any[]>([]);
  const [exports, setExports] = useState<ExportKaydi[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [overrides, setOverrides] = useState<PreviewData['overrides']>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<PreviewData['info']>({});
  // Grid'in SON bilinen satirlari (hucre diff'i icin) — sheet adi → rows
  const prevRowsRef = useRef<Record<string, ExcelRowData[]>>({});

  const fetchAll = useCallback(async () => {
    try {
      const [{ data: p }, { data: q }, { data: ex }] = await Promise.all([
        api.get<PreviewData>(`/quotes/${id}/export-preview`),
        api.get(`/quotes/${id}`),
        api.get<ExportKaydi[]>(`/quotes/${id}/exports`),
      ]);
      setData(p);
      setOverrides(p.overrides ?? {});
      setInfo(p.info ?? {});
      setListeSheets(Array.isArray(q.sheets) ? q.sheets.filter((s: any) => !s.isEmpty) : []);
      setExports(ex);
      prevRowsRef.current = {};
      for (const s of p.formatSheets) {
        prevRowsRef.current[s.name] = JSON.parse(JSON.stringify(s.rowData));
      }
      setDirty(false);
    } catch (e: any) {
      toast({ title: 'Onizleme yuklenemedi', description: e?.response?.data?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Otomatik dolan hucre haritasi: "sheet|addr" → etiket (T14 rozeti)
  const dolanMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of data?.dolan ?? []) m.set(`${d.sheet}|${d.addr}`, d.etiket);
    return m;
  }, [data]);

  const formatCount = data?.formatSheets.length ?? 0;
  const aktifFormatSheet = data && activeTab < formatCount ? data.formatSheets[activeTab] : null;
  const aktifListeSheet = activeTab >= formatCount ? listeSheets[activeTab - formatCount] : null;

  // ── Duzenlenebilir kapak/icmal grid'i (T13: degisiklik teklif katmanina) ──
  const formatGridData: ExcelGridData | null = useMemo(() => {
    if (!aktifFormatSheet) return null;
    return {
      columnDefs: aktifFormatSheet.columnDefs,
      rowData: prevRowsRef.current[aktifFormatSheet.name] ?? aktifFormatSheet.rowData,
      columnRoles: {},
      brands: [],
      headerEndRow: 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktifFormatSheet?.name, data]);

  // ── Salt okunur liste grid'i (T15) ──
  const listeGridData: ExcelGridData | null = useMemo(() => {
    if (!aktifListeSheet) return null;
    return {
      columnDefs: (aktifListeSheet.columnDefs ?? []).map((c: any) => ({ ...c, editable: false })),
      rowData: aktifListeSheet.rowData ?? [],
      columnRoles: aktifListeSheet.columnRoles ?? {},
      brands: [],
      headerEndRow: aktifListeSheet.headerEndRow ?? 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktifListeSheet]);

  const noBrandChange = useCallback(async () => null, []);

  // Hucre degisikligi → override kaydi (adres: colN → harf+satir)
  function handleFormatRowsChange(rows: ExcelRowData[]) {
    if (!aktifFormatSheet) return;
    const ad = aktifFormatSheet.name;
    const onceki = prevRowsRef.current[ad] ?? [];
    const yeni: PreviewData['overrides'] = JSON.parse(JSON.stringify(overrides));
    let degisti = false;
    for (let ri = 0; ri < rows.length; ri++) {
      const r: any = rows[ri];
      const o: any = onceki[ri] ?? {};
      for (const key of Object.keys(r)) {
        if (key.startsWith('_')) continue;
        const a = String(o[key] ?? '');
        const b = String(r[key] ?? '');
        if (a === b) continue;
        const colIdx = parseInt(key.replace('col', ''), 10);
        if (isNaN(colIdx)) continue;
        const addr = `${kolonHarf(colIdx + 1)}${ri + 1}`;
        if (!yeni[ad]) yeni[ad] = {};
        // T14: otomatik dolan hucre elle degisti → "manuel" isareti
        yeni[ad][addr] = { value: r[key], manual: dolanMap.has(`${ad}|${addr}`) };
        degisti = true;
      }
    }
    prevRowsRef.current[ad] = JSON.parse(JSON.stringify(rows));
    if (degisti) {
      setOverrides(yeni);
      setDirty(true);
    }
  }

  async function kaydetOverrides(sessiz = false) {
    try {
      await api.put(`/quotes/${id}/export-overrides`, { overrides });
      setDirty(false);
      if (!sessiz) toast({ title: 'Duzenlemeler kaydedildi', description: 'Yalniz bu teklifin ciktisina islenir — ana format degismez.' });
    } catch (e: any) {
      toast({ title: 'Kaydedilemedi', description: e?.response?.data?.message, variant: 'destructive' });
      throw e;
    }
  }

  // T14: "otomatige don" — override silinir, sunucu guncel degeri doldurur
  async function otomatigeDon(sheet: string, addr: string) {
    const yeni: PreviewData['overrides'] = JSON.parse(JSON.stringify(overrides));
    if (yeni[sheet]) { delete yeni[sheet][addr]; if (Object.keys(yeni[sheet]).length === 0) delete yeni[sheet]; }
    setOverrides(yeni);
    try {
      await api.put(`/quotes/${id}/export-overrides`, { overrides: yeni });
      setLoading(true);
      await fetchAll();
      toast({ title: 'Otomatik degere donuldu' });
    } catch {
      toast({ title: 'Hata', variant: 'destructive' });
    }
  }

  async function bilgileriKaydet() {
    try {
      await api.patch(`/quotes/${id}/info`, info);
      setLoading(true);
      await fetchAll(); // otomatik alanlar guncel degerle tazelenir
      toast({ title: 'Teklif bilgileri kaydedildi' });
    } catch (e: any) {
      toast({ title: 'Kaydedilemedi', description: e?.response?.data?.message, variant: 'destructive' });
    }
  }

  // "Excel + PDF Olustur" — soru YOK (v2): once duzenlemeler, sonra uretim
  async function olustur() {
    setBusy(true);
    try {
      if (dirty) await kaydetOverrides(true);
      const xlsx = await api.post(`/quotes/${id}/export`, {}, { responseType: 'blob' });
      blobIndir(xlsx.data, xlsx.headers, `teklif-${id.slice(0, 8)}.xlsx`);
      const pdf = await api.get(`/quotes/${id}/export-pdf`, { responseType: 'blob' });
      blobIndir(pdf.data, pdf.headers, `teklif-${id.slice(0, 8)}.pdf`);
      toast({ title: 'Excel + PDF olusturuldu', description: 'Revizyon arsive eklendi.' });
      setLoading(true);
      await fetchAll(); // teklif no + rev + arsiv guncellenir
    } catch (e: any) {
      toast({ title: 'Uretim hatasi', description: e?.response?.data?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  /** Uretmeden gercek gorunum: guncel durumun PDF'i yeni sekmede acilir
   *  (rev ARTMAZ — export-pdf rev degistirmez). */
  async function gercekGorunum() {
    try {
      if (dirty) await kaydetOverrides(true);
      const r = await api.get(`/quotes/${id}/export-pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast({ title: 'Onizleme uretilemedi', description: e?.response?.data?.message, variant: 'destructive' });
    }
  }

  async function revIndir(rev: number, fileName: string) {
    try {
      const r = await api.get(`/quotes/${id}/exports/${rev}`, { responseType: 'blob' });
      blobIndir(r.data, r.headers, fileName);
    } catch {
      toast({ title: 'Indirilemedi', variant: 'destructive' });
    }
  }

  // Manuel isaretli hucre cipleri (T14)
  const manuelCipler = useMemo(() => {
    const out: Array<{ sheet: string; addr: string; etiket: string }> = [];
    for (const [sheet, cells] of Object.entries(overrides ?? {})) {
      for (const addr of Object.keys(cells ?? {})) {
        const etiket = dolanMap.get(`${sheet}|${addr}`);
        if (etiket) out.push({ sheet, addr, etiket });
      }
    }
    return out;
  }, [overrides, dolanMap]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) return null;

  return (
    <div>
      {/* Baslik */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/quotes/${id}`} className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Teklif
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Çıktı Önizleme</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.teklifNo ? `${data.teklifNo} · ` : ''}Üretilecek: Rev.{String(data.rev).padStart(2, '0')}
            {' · '}Kapak/İcmal düzenlenebilir — değişiklik yalnız bu teklifin çıktısına işler.
          </p>
          {/* Bulgu B1: hangi format kullaniliyor — yerlesikse UYARI */}
          {data.formatKaynak === 'yerlesik' ? (
            <p className="mt-1 inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
              ⚠ Teklif formatınız yok — sade varsayılan şablon kullanılacak.{' '}
              <Link href="/quote-formats" className="ml-1 underline">Format yükleyin</Link>
            </p>
          ) : data.formatAdi ? (
            <p className="mt-1 inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
              Format: {data.formatAdi}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="outline" onClick={() => kaydetOverrides()}>
              <Save className="mr-1 h-4 w-4" />Duzenlemeleri Kaydet
            </Button>
          )}
          {/* GERCEK gorunum: uretmeden PDF'i yeni sekmede gor (rev artmaz) */}
          <Button variant="outline" onClick={gercekGorunum} disabled={busy}>
            Gerçek Görünüm
          </Button>
          <Button onClick={olustur} disabled={busy}>
            {busy
              ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Olusturuluyor...</>
              : <><Download className="mr-1 h-4 w-4" />Excel + PDF Oluştur</>}
          </Button>
        </div>
      </div>

      {/* Teklif bilgileri (kapak alanlari) */}
      <Card className="mb-4 p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Input placeholder="Müşteri" value={info.musteri ?? ''} onChange={(e) => setInfo({ ...info, musteri: e.target.value })} className="h-8 text-sm" />
          <Input placeholder="Proje" value={info.proje ?? ''} onChange={(e) => setInfo({ ...info, proje: e.target.value })} className="h-8 text-sm" />
          <Input placeholder="Hazırlayan" value={info.hazirlayan ?? ''} onChange={(e) => setInfo({ ...info, hazirlayan: e.target.value })} className="h-8 text-sm" />
          <Input placeholder="Geçerlilik (örn. 30 gün)" value={info.gecerlilik ?? ''} onChange={(e) => setInfo({ ...info, gecerlilik: e.target.value })} className="h-8 text-sm" />
          <Button variant="outline" size="sm" className="h-8" onClick={bilgileriKaydet}>Bilgileri Kaydet</Button>
        </div>
      </Card>

      {/* T14: manuel isaretli hucreler */}
      {manuelCipler.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-amber-700">Manuel hücreler:</span>
          {manuelCipler.map((m) => (
            <span key={`${m.sheet}|${m.addr}`} className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">
              {m.sheet}!{m.addr} ({`{{${m.etiket}}}`})
              <button
                onClick={() => otomatigeDon(m.sheet, m.addr)}
                title="Otomatiğe dön — güncel değerle tazelenir"
                className="ml-0.5 inline-flex items-center text-amber-700 hover:text-amber-900"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Sekmeler */}
      <div className="mb-2 flex flex-wrap gap-1">
        {data.formatSheets.map((s, i) => (
          <button
            key={s.name}
            onClick={() => setActiveTab(i)}
            className={[
              'rounded-md border px-3 py-1.5 text-xs font-medium',
              activeTab === i ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white hover:bg-gray-50',
            ].join(' ')}
          >
            <FileText className="mr-1 inline h-3 w-3" />{s.name} — düzenlenebilir
          </button>
        ))}
        {listeSheets.map((s: any, i: number) => (
          <button
            key={`liste-${i}`}
            onClick={() => setActiveTab(formatCount + i)}
            className={[
              'rounded-md border px-3 py-1.5 text-xs font-medium',
              activeTab === formatCount + i ? 'border-slate-600 bg-slate-600 text-white' : 'bg-white text-muted-foreground hover:bg-gray-50',
            ].join(' ')}
          >
            <Lock className="mr-1 inline h-3 w-3" />{s.name ?? `Sayfa ${i + 1}`}
          </button>
        ))}
      </div>

      {/* Aktif sekme */}
      {aktifFormatSheet && formatGridData && (
        <Card className="overflow-hidden">
          {(aktifFormatSheet as any).resimSayisi > 0 && (
            <div className="border-b border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              🖼 Bu sayfada {(aktifFormatSheet as any).resimSayisi} görsel var — tabloda görünmez,
              <b> çıktıda aynen korunur</b>. Tam görünüm için <b>Gerçek Görünüm</b> düğmesini kullanın.
            </div>
          )}
          <ExcelGrid
            key={`fmt-${aktifFormatSheet.name}`}
            data={formatGridData}
            brands={EMPTY_BRANDS}
            currencySymbol="₺"
            conversionRate={1}
            onBrandChange={noBrandChange}
            onRowDataChange={handleFormatRowsChange}
          />
        </Card>
      )}
      {aktifListeSheet && listeGridData && (
        <>
          {/* T15: salt okunur + yonlendirme */}
          <div className="mb-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <Lock className="mr-1 inline h-3 w-3" />
            Liste sayfaları burada değiştirilemez — fiyat/satır düzeltmesi teklif ekranında yapılır (tek doğruluk kaynağı).{' '}
            <Link href="/quotes" className="font-semibold text-blue-700 hover:underline">Tekliflere git →</Link>
          </div>
          <Card className="overflow-hidden">
            <ExcelGrid
              key={`liste-${activeTab}`}
              data={listeGridData}
              brands={EMPTY_BRANDS}
              currencySymbol="₺"
              conversionRate={1}
              onBrandChange={noBrandChange}
            />
          </Card>
        </>
      )}

      {/* T10: revizyon arsivi */}
      {exports.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold">Revizyon Arşivi</h2>
          <div className="flex flex-col gap-1">
            {exports.map((e) => (
              <button
                key={e.id}
                onClick={() => revIndir(e.rev, e.fileName)}
                className="flex items-center justify-between rounded-md border bg-white px-3 py-1.5 text-left text-xs hover:bg-gray-50"
              >
                <span className="font-medium">Rev.{String(e.rev).padStart(2, '0')} — {e.fileName}</span>
                <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleString('tr-TR')} · <Download className="inline h-3 w-3" /></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
