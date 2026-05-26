'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { MetrajResult } from './types';
import { DwgProjectWorkspace } from '@/components/dwg-workspace';

interface DwgUploaderProps {
  onMetrajApproved: (metraj: MetrajResult, fileName: string) => void;
}

/**
 * DWG/DXF dosyasi yukleyip metraj cikarma akisi.
 *
 * YENI AKIS (tek ekran):
 *   1. Drag-drop veya dosya secimi
 *   2. Birim secimi (mm/cm/m)
 *   3. /layers cagrisi ile file_id cikart (cache)
 *   4. Dogrudan DwgProjectWorkspace acilir:
 *      - Tum geometry cizilir (gri, tiklanabilir)
 *      - Kullanici boru layer'ina tiklar → sagda form → Hesapla
 *      - Ekleye ekleye birden fazla layer hesaplanabilir
 *      - Ekipmanlara (INSERT) tiklayip malzeme ad+birim girilir
 *   5. "Tumunu Onayla" → fiyatlandirmaya gider
 */
/** Sayfa yenilemede DWG oturumunu korumak icin localStorage key.
 *  Icerik: { fileId, fileName, scale, savedAt }
 *  Mount'ta: bu key'i oku, fileId'nin Cloud Run cache'inde HALA gecerli oldugunu
 *  /status/:fileId ile dogrula, gecerliyse state'i restore et — kullanici DWG'yi
 *  yeniden yuklemek zorunda kalmaz. */
const SESSION_STORAGE_KEY = 'metaprice_dwg_session';

export default function DwgUploader({ onMetrajApproved }: DwgUploaderProps) {
  // file: dosya nesnesi (yuklemede gerekli). Refresh sonrasi YOK ama
  // fileName + fileId localStorage'dan gelir — workspace acilir.
  const [file, setFile] = useState<File | null>(null);
  // restoredFileName: refresh sonrasi localStorage'dan gelen dosya adi (file nesnesi yok)
  const [restoredFileName, setRestoredFileName] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [extractingLayers, setExtractingLayers] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Birim secimi — /layers cevabindan sonra dialog acilir (backend onerisi default)
  const [pendingUnitChoice, setPendingUnitChoice] = useState<{
    fileId: string;
    suggestedUnitLabel: string;
  } | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<number>(0);  // 0 = Auto-detect (default)

  // Dashboard'dan gelen dosyayi otomatik isle — birim dialog'u atla (Dashboard zaten belirlemis)
  const initialFileProcessed = useRef(false);
  useEffect(() => {
    if (initialFileProcessed.current) return;
    const pendingFile = (window as any).__metaprice_dwg_file as File | undefined;
    const pendingScale = (window as any).__metaprice_dwg_scale as number | undefined;
    if (pendingFile) {
      initialFileProcessed.current = true;
      delete (window as any).__metaprice_dwg_file;
      delete (window as any).__metaprice_dwg_scale;
      if (pendingScale) setSelectedUnit(pendingScale);
      extractLayers(pendingFile, { skipDialog: true, override: pendingScale });
      return;
    }
    // SESSION RESTORE: sayfa yenilenmis olabilir, localStorage'da onceki
    // DWG session'i var mi? Varsa Cloud Run cache'inde hala valid mi check et.
    // Valid ise workspace'i geri ac — kullanici dosyayi tekrar yuklemek
    // zorunda kalmasin.
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      const session = JSON.parse(raw);
      if (!session?.fileId || !session?.fileName) return;
      initialFileProcessed.current = true;
      // Async: backend'e status sor — hala ready mi?
      api.get(`/dwg-engine/status/${session.fileId}`)
        .then((res) => {
          if (res?.data?.status === 'ready') {
            setRestoredFileName(session.fileName);
            // SESSION SCALE'i GOZ ARDI ET — her hesaplamada Auto-detect tetiklensin
            // (eski session'larda scale=0.001 sabit kayitli, bu Auto'yu bypass ediyordu).
            // Backend pipe physics ile dogru birimi her seferinde tespit eder.
            setSelectedUnit(0);  // 0 = Auto (scale parametresi backend'e gonderilmez)
            setFileId(session.fileId);
          } else {
            // Cache'te yok veya parse henuz bitmemis → temizle
            localStorage.removeItem(SESSION_STORAGE_KEY);
          }
        })
        .catch(() => {
          // 404 (cache TTL gecmis) veya baska hata → temizle, kullanici
          // yeniden yuklesin
          localStorage.removeItem(SESSION_STORAGE_KEY);
        });
    } catch {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // SESSION SAVE: fileId/fileName/scale degisince localStorage'a yansit.
  // Refresh sonrasi yukaridaki RESTORE bunu okur.
  useEffect(() => {
    if (!fileId) return;
    const fname = file?.name || restoredFileName;
    if (!fname) return;
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        fileId,
        fileName: fname,
        scale: selectedUnit,
        savedAt: Date.now(),
      }));
    } catch {}
  }, [fileId, file, restoredFileName, selectedUnit]);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  /**
   * F5D — Async /upload + /status polling.
   *
   * Eskiden: F5A /layers (senkron). Engine tek istekte DWG->DXF + ezdxf parse +
   * geometry pre-cache + INSUNITS-icin-ikinci-parse yapiyordu. Buyuk dosyalarda
   * peak memory 2x ezdxf doc olusturuyordu → 512MB free tier RAM'i asip
   * OOM-kill + 500/503 zinciri. Frontend 7 retry, hepsi fail.
   *
   * Yeni: /upload sadece DWG->DXF + cache yapar (2-30sn), file_id doner.
   * /status polling ile background parse'i izleriz. Avantajlar:
   *   - Peak memory dusuk (parse ayri thread'de, response handler bekletmez)
   *   - Gercek hata mesaji: status="error" + error string (artik vague 503 yok)
   *   - UX: frontend 5 dk sync request'te oturmaz, polling feedback verir
   *
   * Eski F5C revert sebebi (d83ebbf): NestJS uploadAsync multipart bug
   * sanildi ama net teshis yapilmadi. Bu session'da NestJS /upload test edildi
   * ve calisti (file_id donuyor) — bug eski iterasyondaymis veya beraberindeki
   * fix'lerle (b72fffb, 81f7a89) cozulmus.
   */
  const extractLayers = useCallback(async (
    f: File,
    opts: { skipDialog?: boolean; override?: number } = {},
  ) => {
    setFile(f);
    setFileId(null);
    setPendingUnitChoice(null);
    setError(null);
    setExtractingLayers(true);
    startTimer();

    // /upload icin retry: cold-start ihtimaline karsi 4 deneme
    // (upload kendi 2-30sn, parse arka planda → kisa toplam timeout yeter)
    const UPLOAD_RETRY_DELAYS = [3000, 8000, 20000, 45000];
    const isTransient = (e: any): boolean => {
      const status = e?.response?.status;
      if (status === 503 || status === 502 || status === 504 || status === 500) return true;
      if (status === 429) return true;
      const code = e?.code;
      if (code === 'ECONNABORTED' || code === 'ERR_NETWORK') return true;
      if (!e?.response) return true;
      return false;
    };

    try {
      // 1) UPLOAD — file_id al
      const formData = new FormData();
      formData.append('file', f);
      const uploadOnce = () => api.post(
        '/dwg-engine/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 },
      );

      let uploadRes: any = null;
      let uploadErr: any = null;
      for (let attempt = 0; attempt <= UPLOAD_RETRY_DELAYS.length; attempt++) {
        try {
          uploadRes = await uploadOnce();
          break;
        } catch (err: any) {
          uploadErr = err;
          if (!isTransient(err)) throw err;
          if (attempt >= UPLOAD_RETRY_DELAYS.length) throw err;
          await new Promise((r) => setTimeout(r, UPLOAD_RETRY_DELAYS[attempt]));
        }
      }
      if (!uploadRes) throw uploadErr;
      const uploadFileId: string = uploadRes.data.file_id;
      if (!uploadFileId) {
        throw new Error('Sunucudan file_id donmedi');
      }

      // 2) POLL /status — background parse bitene kadar
      // Timeout: 240sn (cold-start engine olabilir, sonra ~30-60sn parse)
      const POLL_INTERVAL = 3000;
      // Buyuk DWG dosyalari (>20 MB DXF cache) icin 10 dk timeout — kucuk
      // dosyalar genelde 30-60sn'de hazir, buyuk dosyalar (50-100MB) 5-10dk
      const POLL_MAX_MS = 600000;
      const pollStart = Date.now();
      let statusData: any = null;

      while (Date.now() - pollStart < POLL_MAX_MS) {
        try {
          // CACHE-BUSTING: NestJS GET handler'lari otomatik ETag uretiyor,
          // browser If-None-Match gonderiyor → 304 Not Modified zincirine
          // dusuyor. Bu durumda axios eski cache'lenmis body'i (status=processing)
          // sonsuza kadar okuyor; "ready" hic gorulmuyor.
          // Cozum: her request'e farkli query param ekle → URL'ler eslesmiyor
          // → browser cache match yok → her request fresh.
          //
          // NOT: Cache-Control header'i EKLEMIYORUZ — custom header CORS
          // preflight (OPTIONS) tetikliyordu, NestJS allowedHeaders default'ta
          // Cache-Control/Pragma yok → preflight fail → CORS error.
          // Query param tek basina yeterli.
          const s = await api.get(`/dwg-engine/status/${uploadFileId}`, {
            timeout: 15000,
            params: { _t: Date.now() },
          });
          const st = s.data?.status;
          if (st === 'ready') {
            statusData = s.data;
            break;
          }
          if (st === 'error') {
            const err = s.data?.error || 'Bilinmeyen parse hatasi';
            throw new Error(`Parse hatasi: ${err}`);
          }
          // st === 'processing' → bekle, polla
        } catch (err: any) {
          // Status endpoint'i transient hata atarsa polling devam (404/422 hariç)
          // 422 = backend "file_id bilinmiyor (cache TTL gecmis olabilir)" — Cloud Run
          // revision switch'inde memory state sifirlandiginda olur. Polling devam
          // etmek anlamsiz, kullaniciya yeniden yuklemeyi tetikle.
          const status = err?.response?.status;
          if (status === 404 || status === 422) {
            throw new Error('Sunucu file_id\'yi unutmus (cache TTL veya deploy oldu); dosyayi tekrar yukleyin');
          }
          if (!isTransient(err)) throw err;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }

      if (!statusData) {
        throw new Error(`Parse zaman asimi (${POLL_MAX_MS / 1000}sn)`);
      }

      // 3) Sonuc — /layers'in dondurdugu sekille uyumlu olarak normalize et
      const suggestedScale = typeof statusData.suggested_scale === 'number' ? statusData.suggested_scale : 0.001;
      const suggestedLabel = statusData.suggested_unit_label ?? 'mm';
      const totalLayers = statusData.total_layers ?? (statusData.layers?.length ?? 0);
      setSelectedUnit(opts.override ?? suggestedScale);

      toast({
        title: 'Proje hazirlandi',
        description: `${totalLayers} layer · ${suggestedLabel} birimi`,
      });

      if (opts.skipDialog) {
        setFileId(uploadFileId);
      } else {
        setPendingUnitChoice({ fileId: uploadFileId, suggestedUnitLabel: suggestedLabel });
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.response?.data?.detail ?? e?.message ?? 'Proje yuklenemedi';
      setError(msg);
      toast({ title: 'Hata', description: msg, variant: 'destructive' });
    } finally {
      setExtractingLayers(false);
      stopTimer();
    }
  }, []);

  const resetAll = () => {
    setFile(null);
    setRestoredFileName(null);
    setFileId(null);
    setPendingUnitChoice(null);
    setError(null);
    setExtractingLayers(false);
    // Session storage temizle — kullanici yeni DWG yuklemek istiyor
    try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch {}
  };

  const handleFileSelect = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['dwg', 'dxf'].includes(ext ?? '')) {
      toast({ title: 'Gecersiz dosya', description: 'Sadece .dwg ve .dxf dosyalari kabul edilir.', variant: 'destructive' });
      return;
    }
    // Dogrudan /layers cagir — backend birim onerisiyle birlikte dialog acacak
    extractLayers(f);
  };

  const handleUnitConfirm = () => {
    if (pendingUnitChoice) {
      // Kullanici birim secimi onayladi → workspace'e gec
      setFileId(pendingUnitChoice.fileId);
      setPendingUnitChoice(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
    e.target.value = '';
  };

  // ── RENDER: fileId hazirsa workspace acilir ──
  // file objesi olabilir (yeni upload) veya restoredFileName (session restore)
  const effectiveFileName = file?.name || restoredFileName;
  if (fileId && effectiveFileName) {
    return (
      <DwgProjectWorkspace
        fileId={fileId}
        scale={selectedUnit}
        fileName={effectiveFileName}
        onReset={resetAll}
        onApproved={onMetrajApproved}
      />
    );
  }

  // ── RENDER: Layer listesi cikariliyor (loading) ──
  if (extractingLayers) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-blue-700">Proje hazirlaniyor...</p>
        <p className="text-xs text-blue-400">{elapsed} saniye · {file?.name || restoredFileName}</p>
        {/* Cikis kapisi: deploy/restart sirasinda cache TTL gectiyse 422 ile takilabilir,
            ya da kullanici farkli dosya yuklemek isteyebilir. Loading'den her zaman
            cikabilsin. resetAll state'i + localStorage'i temizler. */}
        <button
          type="button"
          onClick={resetAll}
          className="mt-2 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
        >
          Iptal — yeniden yukle
        </button>
      </div>
    );
  }

  // ── RENDER: Upload zone (baslangic) ──
  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'cursor-pointer rounded-xl border-2 border-dashed py-16 text-center transition-all',
          dragOver
            ? 'border-blue-500 bg-blue-50 scale-[1.01]'
            : 'border-slate-200 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/30',
        )}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
          <Upload className="h-5 w-5 text-blue-600" />
        </div>
        <h3 className="text-sm font-semibold">DWG/DXF dosyanizi surukleyin</h3>
        <p className="mt-1 text-xs text-muted-foreground">veya dosya secmek icin tiklayin</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">.dwg</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">.dxf</span>
        </div>
        <input ref={inputRef} type="file" accept=".dwg,.dxf" className="hidden" onChange={handleInputChange} />
      </div>

      {/* Hata */}
      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Hata</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Birim Secim Dialog — /layers bitince acilir, backend onerisi default */}
      {pendingUnitChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPendingUnitChoice(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Cizim Birimi</h3>
            <p className="text-sm text-muted-foreground mb-4">{file?.name}</p>
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-[11px] text-blue-700">
                DWG dosyasinda birim <strong>{pendingUnitChoice.suggestedUnitLabel}</strong> olarak belirtilmis
                — default olarak secili. Gerekirse degistirebilirsin.
              </p>
            </div>
            <div className="mb-5 grid grid-cols-3 gap-2">
              {[
                { value: 0.001, label: 'mm', desc: 'Milimetre' },
                { value: 0.01, label: 'cm', desc: 'Santimetre' },
                { value: 1.0, label: 'm', desc: 'Metre' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedUnit(opt.value)}
                  className={cn(
                    'rounded-lg border-2 px-3 py-3 text-center transition-all',
                    selectedUnit === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300',
                  )}
                >
                  <div className="text-base font-semibold">{opt.label}</div>
                  {opt.desc && <div className="text-[10px] text-slate-400">{opt.desc}</div>}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setPendingUnitChoice(null); resetAll(); }} className="rounded-lg border px-4 py-2 text-sm text-slate-500 hover:bg-slate-50">
                Iptal
              </button>
              <button onClick={handleUnitConfirm} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Devam Et
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
