'use client';

import { useRef, useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface QuickStartProps {
  onExcelFile: (file: File) => void;
  onDwgFile: (file: File, scale: number) => void;
  excelUploading: boolean;
  dwgUploading: boolean;
  elapsed: number;
}

export default function QuickStart({
  onExcelFile,
  onDwgFile,
  excelUploading,
  dwgUploading,
  elapsed,
}: QuickStartProps) {
  const [excelDragOver, setExcelDragOver] = useState(false);
  const [dwgDragOver, setDwgDragOver] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const dwgInputRef = useRef<HTMLInputElement>(null);

  // DWG birim secim dialog
  const [unitDialogFile, setUnitDialogFile] = useState<File | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<number>(0.001); // mm varsayilan

  // ── Excel Drop ──
  const handleExcelDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExcelDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['xlsx', 'xls'].includes(ext ?? '')) {
      onExcelFile(file);
    } else if (['dwg', 'dxf'].includes(ext ?? '')) {
      setUnitDialogFile(file);
    } else {
      toast({ title: 'Gecersiz dosya', description: 'Excel (.xlsx/.xls) dosyasi yukleyin.', variant: 'destructive' });
    }
  }, [onExcelFile]);

  // ── DWG Drop ──
  const handleDwgDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDwgDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['dwg', 'dxf'].includes(ext ?? '')) {
      setUnitDialogFile(file);
      setSelectedUnit(0.001);
    } else if (['xlsx', 'xls'].includes(ext ?? '')) {
      onExcelFile(file);
    } else {
      toast({ title: 'Gecersiz dosya', description: 'DWG veya DXF dosyasi yukleyin.', variant: 'destructive' });
    }
  }, [onExcelFile]);

  const handleExcelInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onExcelFile(file);
    e.target.value = '';
  };

  const handleDwgInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUnitDialogFile(file);
      setSelectedUnit(0.001);
    }
    e.target.value = '';
  };

  const handleUnitConfirm = () => {
    if (unitDialogFile) {
      onDwgFile(unitDialogFile, selectedUnit);
      setUnitDialogFile(null);
    }
  };

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-5 py-3.5 text-sm font-semibold">Hizli Baslat</div>
      <div className="p-5">
        {/* Loading durumu */}
        {(excelUploading || dwgUploading) ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-blue-700">
              {excelUploading ? 'Excel analiz ediliyor...' : 'DWG analiz ediliyor...'}
            </p>
            <p className="text-xs text-blue-400">{elapsed} saniye</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Excel Upload Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setExcelDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setExcelDragOver(true); }}
              onDragLeave={() => setExcelDragOver(false)}
              onDrop={handleExcelDrop}
              onClick={() => excelInputRef.current?.click()}
              className={cn(
                'cursor-pointer rounded-xl border-2 border-dashed py-8 text-center transition-all',
                excelDragOver
                  ? 'border-emerald-500 bg-emerald-50 scale-[1.01]'
                  : 'border-slate-200 bg-slate-50/50 hover:border-emerald-400 hover:bg-emerald-50/30',
              )}
            >
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="text-sm font-semibold">Excel Kesif</h3>
              <p className="mt-1 text-xs text-muted-foreground">Metraj dosyanizi surukleyin</p>
              <div className="mt-2 flex items-center justify-center gap-1.5">
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">.xlsx</span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">.xls</span>
              </div>
              <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelInput} />
            </div>

            {/* DWG Upload Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDwgDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDwgDragOver(true); }}
              onDragLeave={() => setDwgDragOver(false)}
              onDrop={handleDwgDrop}
              onClick={() => dwgInputRef.current?.click()}
              className={cn(
                'cursor-pointer rounded-xl border-2 border-dashed py-8 text-center transition-all',
                dwgDragOver
                  ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                  : 'border-slate-200 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/30',
              )}
            >
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="text-sm font-semibold">DWG Proje</h3>
              <p className="mt-1 text-xs text-muted-foreground">Tesisat projesini surukleyin</p>
              <div className="mt-2 flex items-center justify-center gap-1.5">
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">.dwg</span>
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">.dxf</span>
              </div>
              <span className="mt-2 inline-block rounded bg-blue-600/10 px-2 py-0.5 text-[9px] font-semibold text-blue-600">PRO</span>
              <input ref={dwgInputRef} type="file" accept=".dwg,.dxf" className="hidden" onChange={handleDwgInput} />
            </div>
          </div>
        )}
      </div>

      {/* DWG Birim Secim Dialog */}
      {unitDialogFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setUnitDialogFile(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Cizim Birimi</h3>
            <p className="text-sm text-muted-foreground mb-4">{unitDialogFile.name}</p>

            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[11px] text-amber-700">
                AutoCAD projeleri genellikle milimetre (mm) biriminde cizilir. Dogru birimi secin, aksi halde boru uzunluklari yanlis hesaplanir.
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
              <button
                onClick={() => setUnitDialogFile(null)}
                className="rounded-lg border px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
              >
                Iptal
              </button>
              <button
                onClick={handleUnitConfirm}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Analiz Et
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
