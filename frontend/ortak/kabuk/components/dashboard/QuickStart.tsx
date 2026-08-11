'use client';

import { useRef, useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/ortak/lib/utils';
import { toast } from '@/ortak/hooks/use-toast';

interface QuickStartProps {
  onExcelFile: (file: File) => void;
  /** scale ARTIK OPSIYONEL: verilmezse backend cizim birimini otomatik tespit
   *  eder (python/unit_detect.py). Yalnizca kullanici bilerek ezerse gecilir. */
  onDwgFile: (file: File, scale?: number) => void;
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

  // BIRIM DIALOG'U KALDIRILDI: cizim birimi artik backend'de OTOMATIK tespit
  // ediliyor (python/unit_detect.py — antet pafta olcusu + "ÖLÇEK 1/N" kesisimi).
  // Kullaniciya dosyayi ACMADAN ONCE birim sormak zaten cevaplanamaz bir soruydu.
  // Tespit sonucu ve gerekirse degistirme yolu DwgUploader'daki birim bandinda.

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
      onDwgFile(file);
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
      onDwgFile(file);
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
    if (file) onDwgFile(file);   // birim sorulmaz — otomatik tespit
    e.target.value = '';
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

    </div>
  );
}
