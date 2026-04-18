'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { MetrajResult } from './MetrajTable';
import MetrajTabs from './MetrajTabs';
import LayerSelector, { type LayerInfo, type LayerSelection } from './LayerSelector';
import PipeMapTabs from './PipeMapTabs';
import { type EdgeSegment, type BranchPoint } from './PipeMapViewer';

interface DwgUploaderProps {
  onMetrajApproved: (metraj: MetrajResult, fileName: string) => void;
}

/**
 * DWG/DXF dosyasi yukleyip metraj cikarma akisi.
 *
 * Akis:
 *   1. Drag-drop veya dosya secimi
 *   2. Birim secimi (mm/cm/m)
 *   3. Layer listesi cikart (hizli, uzunluk yok) → file_id al
 *   4. Kullanici layer secer + hat tipi belirler
 *   5. Sadece secilen layer'lar icin uzunluk hesapla (file_id ile, dosya tekrar yuklenmez)
 *   6. MetrajEditor'de duzenle + onayla
 */
export default function DwgUploader({ onMetrajApproved }: DwgUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [metraj, setMetraj] = useState<MetrajResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discipline, setDiscipline] = useState<'mechanical' | 'electrical'>('mechanical');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Birim secimi
  const [unitDialogFile, setUnitDialogFile] = useState<File | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<number>(0.001);

  // Layer secim asamasi
  const [extractingLayers, setExtractingLayers] = useState(false);
  const [layerList, setLayerList] = useState<LayerInfo[] | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);

  // Cap dogrulama asamasi (PipeMapViewer)
  const [mapMode, setMapMode] = useState(false);
  const [selectedLayerNames, setSelectedLayerNames] = useState<string[]>([]);

  // Dashboard'dan gelen dosyayi otomatik isle
  const initialFileProcessed = useRef(false);
  useEffect(() => {
    if (initialFileProcessed.current) return;
    const pendingFile = (window as any).__metaprice_dwg_file as File | undefined;
    const pendingScale = (window as any).__metaprice_dwg_scale as number | undefined;
    if (pendingFile) {
      initialFileProcessed.current = true;
      // Global degiskeni temizle
      delete (window as any).__metaprice_dwg_file;
      delete (window as any).__metaprice_dwg_scale;
      // Birim bilgisi varsa kullan, yoksa varsayilan mm
      if (pendingScale) setSelectedUnit(pendingScale);
      // Dogrudan layer cikarma basla (birim dialog'u atla)
      extractLayers(pendingFile);
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
   * Adim 1: Dosyayi yukle, layer listesini cikar.
   * Dosya Python tarafinda cache'lenir, file_id doner.
   */
  const extractLayers = useCallback(async (f: File) => {
    setFile(f);
    setMetraj(null);
    setLayerList(null);
    setFileId(null);
    setError(null);
    setExtractingLayers(true);
    startTimer();

    try {
      const formData = new FormData();
      formData.append('file', f);

      // Buyuk DWG'ler icin 5 dakika timeout (DWG->DXF donusturme + parse uzun surebilir)
      const res = await api.post(
        '/dwg-engine/layers',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 },
      );

      const data = res.data;
      setLayerList(data.layers);
      setFileId(data.file_id);

      toast({
        title: 'Layer listesi hazirlandi',
        description: `${data.total_layers} layer tespit edildi`,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.response?.data?.detail ?? 'Layer listesi alinamadi';
      setError(msg);
      toast({ title: 'Hata', description: msg, variant: 'destructive' });
    } finally {
      setExtractingLayers(false);
      stopTimer();
    }
  }, []);

  /**
   * Adim 2: Secilen layer'larla metraj hesapla.
   * file_id ile cagrilir — dosya tekrar yuklenmez.
   */
  const calculateMetraj = useCallback(async (selections: LayerSelection[]) => {
    const selected = selections.filter((s) => s.selected);
    if (selected.length === 0) {
      toast({ title: 'Hata', description: 'En az bir layer secmelisiniz', variant: 'destructive' });
      return;
    }

    setError(null);
    setUploading(true);
    startTimer();

    try {
      const selectedNames = selected.map((s) => s.layer);
      setSelectedLayerNames(selectedNames);
      const hatTipiMap: Record<string, string> = {};
      const materialTypeMap: Record<string, string> = {};

      // TUM selections'tan hat ismi topla — sadece secili olanlar degil.
      // Kullanici sprinkler layer'ini "Sec" etmeyip sadece hat ismine
      // "sprinkler"/"upright" yazabilir; backend bunu yine sprinkler olarak
      // algilayabilsin diye hat_tipi_map'e ekliyoruz.
      for (const s of selections) {
        if (s.selected) {
          hatTipiMap[s.layer] = s.hatIsmi || s.layer;
          if (s.materialType) {
            materialTypeMap[s.layer] = s.materialType;
          }
        } else if (s.hatIsmi.trim()) {
          // Secilmemis ama hat ismi var — sprinkler ipucu olabilir
          hatTipiMap[s.layer] = s.hatIsmi;
        }
      }

      // Sprinkler layer tespiti backend tarafinda yapilir:
      // Kullanici hat ismine "sprinkler"/"upright"/"pendant"/"sidewall"
      // yazdiysa o layer sprinkler olarak islenir. layer_hat_tipi map'inden
      // backend bunu anlar.
      const params = new URLSearchParams({
        discipline,
        scale: String(selectedUnit),
        file_id: fileId ?? '',
        selected_layers: JSON.stringify(selectedNames),
        layer_hat_tipi: JSON.stringify(hatTipiMap),
        layer_material_type: JSON.stringify(materialTypeMap),
      });

      // file_id varsa dosya gondermiyoruz — bos FormData yeterli
      const formData = new FormData();
      const res = await api.post<MetrajResult>(
        `/dwg-engine/parse?${params.toString()}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 },
      );

      setMetraj(res.data);
      setLayerList(null); // Layer secim ekranini kapat

      // Edge segments varsa cap dogrulama haritasini goster
      if (res.data.edge_segments && res.data.edge_segments.length > 0) {
        setMapMode(true);
      }

      toast({
        title: 'Metraj hesaplandi',
        description: `${res.data.total_layers} layer, ${res.data.total_length.toFixed(1)}m toplam`,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.response?.data?.detail ?? 'Metraj hesaplanirken hata olustu';
      setError(msg);
      toast({ title: 'Hata', description: msg, variant: 'destructive' });
    } finally {
      setUploading(false);
      stopTimer();
    }
  }, [discipline, selectedUnit, fileId]);

  const resetAll = () => {
    setMetraj(null);
    setLayerList(null);
    setFileId(null);
    setFile(null);
    setError(null);
    setUploading(false);
    setExtractingLayers(false);
    setMapMode(false);
    setSelectedLayerNames([]);
  };

  const handleFileSelect = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['dwg', 'dxf'].includes(ext ?? '')) {
      toast({ title: 'Gecersiz dosya', description: 'Sadece .dwg ve .dxf dosyalari kabul edilir.', variant: 'destructive' });
      return;
    }
    setUnitDialogFile(f);
    setSelectedUnit(0.001);
  };

  const handleUnitConfirm = () => {
    if (unitDialogFile) {
      extractLayers(unitDialogFile);
      setUnitDialogFile(null);
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

  // ── RENDER: Cap dogrulama haritasi ──
  if (metraj && mapMode && metraj.edge_segments && metraj.edge_segments.length > 0) {
    const edgeSegs: EdgeSegment[] = metraj.edge_segments.map(s => ({
      segment_id: s.segment_id,
      layer: s.layer,
      diameter: s.diameter ?? '',
      length: s.length,
      line_count: s.line_count,
      material_type: s.material_type ?? '',
      coords: s.coords ?? [],
    }));
    const bps: BranchPoint[] = (metraj.branch_points ?? [])
      .filter(bp => bp.point_type === 'tee')
      .map(bp => ({
        x: bp.x,
        y: bp.y,
        connections: bp.connections,
        point_type: bp.point_type,
      }));

    return (
      <PipeMapTabs
        segments={edgeSegs}
        branchPoints={bps}
        backgroundLines={metraj.background_lines ?? []}
        layerNames={selectedLayerNames}
        onAllApproved={(corrected) => {
          // Tüm layer'lar onaylandı — MetrajEditor/MetrajTabs'a geç
          setMapMode(false);
          toast({
            title: 'Çaplar onaylandı',
            description: `${corrected.length} segment, ${selectedLayerNames.length} hat`,
          });
        }}
        onBack={() => {
          setMapMode(false);
          setMetraj(null);
        }}
      />
    );
  }

  // ── RENDER: Metraj sonucu (son adim) ──
  if (metraj) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">DWG Metraj — {file?.name}</h3>
            <p className="text-xs text-muted-foreground">{elapsed} saniyede analiz edildi</p>
          </div>
          <button
            onClick={resetAll}
            className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-slate-50"
          >
            Yeni DWG Yukle
          </button>
        </div>

        <MetrajTabs
          data={metraj}
          fileName={file?.name ?? 'dwg-file'}
          onAllApproved={(rows) => {
            // Satirlari hat tipine gore grupla, her grubun segmentlerini olustur
            const layerMap = new Map<string, { rows: typeof rows; hatTipi: string }>();
            for (const r of rows) {
              const key = (r as any).hatTipi || r.name;
              if (!layerMap.has(key)) layerMap.set(key, { rows: [], hatTipi: key });
              layerMap.get(key)!.rows.push(r);
            }

            const approvedMetraj: MetrajResult = {
              layers: Array.from(layerMap.values()).map(({ rows: groupRows, hatTipi }) => ({
                layer: hatTipi,
                length: groupRows.reduce((sum, r) => sum + (parseFloat(r.qty) || 0), 0),
                line_count: 0,
                hat_tipi: hatTipi,
                segments: groupRows.map((r, i) => ({
                  segment_id: i + 1,
                  layer: hatTipi,
                  diameter: r.diameter || '',
                  length: parseFloat(r.qty) || 0,
                  line_count: 0,
                  material_type: (r as any).materialType ?? '',
                })),
              })),
              total_length: rows.reduce((sum, r) => sum + (parseFloat(r.qty) || 0), 0),
              total_layers: layerMap.size,
              warnings: [],
            };
            onMetrajApproved(approvedMetraj, file?.name ?? 'dwg-metraj');
          }}
        />
      </div>
    );
  }

  // ── RENDER: Metraj hesaplaniyor (analiz loading) ──
  if (uploading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-blue-700">Metraj hesaplaniyor...</p>
        <p className="text-xs text-blue-400">{elapsed} saniye · {file?.name}</p>
      </div>
    );
  }

  // ── RENDER: Layer secim ekrani ──
  if (layerList) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {elapsed} saniyede layer listesi cikarildi
          </p>
          <button
            onClick={resetAll}
            className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-slate-50"
          >
            Yeni DWG Yukle
          </button>
        </div>

        <LayerSelector
          layers={layerList}
          fileName={file?.name ?? ''}
          onConfirm={calculateMetraj}
          onCancel={resetAll}
        />

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
      </div>
    );
  }

  // ── RENDER: Layer'lar cikariliyor (loading) ──
  if (extractingLayers) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-blue-700">Layer listesi cikariliyor...</p>
        <p className="text-xs text-blue-400">{elapsed} saniye · {file?.name}</p>
      </div>
    );
  }

  // ── RENDER: Upload zone (baslangic) ──
  return (
    <div>
      {/* Disiplin secimi */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Disiplin:</span>
        {(['mechanical', 'electrical'] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDiscipline(d)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              discipline === d
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {d === 'mechanical' ? 'Mekanik' : 'Elektrik'}
          </button>
        ))}
      </div>

      {/* Upload Zone */}
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
            <p className="text-sm font-medium text-red-800">Analiz Hatasi</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Birim Secim Dialog */}
      {unitDialogFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setUnitDialogFile(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Cizim Birimi</h3>
            <p className="text-sm text-muted-foreground mb-4">{unitDialogFile.name}</p>

            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[11px] text-amber-700">
                AutoCAD projeleri genellikle milimetre (mm) biriminde cizilir. Dogru birimi secin.
              </p>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-2">
              {[
                { value: 0.001, label: 'mm', desc: 'Varsayilan' },
                { value: 0.01, label: 'cm', desc: '' },
                { value: 1.0, label: 'm', desc: 'Gercek olcu' },
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
              <button onClick={() => setUnitDialogFile(null)} className="rounded-lg border px-4 py-2 text-sm text-slate-500 hover:bg-slate-50">
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
