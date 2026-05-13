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
export default function DwgUploader({ onMetrajApproved }: DwgUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
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
  const [selectedUnit, setSelectedUnit] = useState<number>(0.001);

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
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
   * F5A — /layers parse + pre-cache geometry (OCERP pattern, polling YOK).
   *
   * F5C async/polling karmasikligi production'da 503 bug yaratti — F5A'ya
   * geri donus. /layers endpoint'i tek ezdxf parse ile layers + entities.json
   * pre-cache yazar. /geometry GET sonra cache hit (~100ms). Toplam ~30sn.
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

    const RETRY_DELAYS = [2000, 5000, 10000, 20000, 40000];
    const isTransient = (e: any): boolean => {
      const status = e?.response?.status;
      if (status === 503 || status === 502 || status === 504 || status === 500) return true;
      if (status === 429 || status === 422) return true;
      const code = e?.code;
      if (code === 'ECONNABORTED' || code === 'ERR_NETWORK') return true;
      if (!e?.response) return true;
      return false;
    };

    try {
      const formData = new FormData();
      formData.append('file', f);
      const sendOnce = () => api.post(
        '/dwg-engine/layers',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 },
      );

      let res: any = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        try {
          res = await sendOnce();
          break;
        } catch (err: any) {
          lastErr = err;
          if (!isTransient(err)) throw err;
          if (attempt >= RETRY_DELAYS.length) throw err;
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        }
      }
      if (!res) throw lastErr;
      const data = res.data;

      const suggestedScale = typeof data.suggested_scale === 'number' ? data.suggested_scale : 0.001;
      const suggestedLabel = data.suggested_unit_label ?? 'mm';
      setSelectedUnit(opts.override ?? suggestedScale);

      toast({
        title: 'Proje hazirlandi',
        description: `${data.total_layers} layer · ${suggestedLabel} birimi`,
      });

      if (opts.skipDialog) {
        setFileId(data.file_id);
      } else {
        setPendingUnitChoice({ fileId: data.file_id, suggestedUnitLabel: suggestedLabel });
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
    setFileId(null);
    setPendingUnitChoice(null);
    setError(null);
    setExtractingLayers(false);
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
  if (fileId && file) {
    return (
      <DwgProjectWorkspace
        fileId={fileId}
        scale={selectedUnit}
        fileName={file.name}
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
        <p className="text-xs text-blue-400">{elapsed} saniye · {file?.name}</p>
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
