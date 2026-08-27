'use client';

import { useRef, useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/ortak/lib/utils';
import { toast } from '@/ortak/hooks/use-toast';
import { dosyaTuruSec } from './dosya-turu';

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

  // ── K6 (27.08): DOSYA YONLENDIRME TEK YERDEN ──────────────────────────
  // Dort giris yolu (Excel drop, DWG drop, Excel secici, DWG secici) ayni
  // karari verir. OLCULDU: uzanti denetimi yalniz IKI DROP yolunda vardi;
  // SECICI yollari dosyayi sorgusuz isleyiciye veriyordu ve `accept` bir
  // ipucu oldugu icin (kullanici "Tum dosyalar"i secebilir) .dwg dosyasi
  // Excel cozumleyicisine gidebiliyordu. Karar `dosyaTuruSec`te (saf, testten
  // kosulabilir); burada yalniz yonlendirme + mesaj var.
  const dosyayiYonlendir = useCallback((file: File, gecersizMesaji: string) => {
    const tur = dosyaTuruSec(file.name);
    if (tur === 'excel') onExcelFile(file);
    else if (tur === 'dwg') onDwgFile(file);
    else toast({ title: 'Gecersiz dosya', description: gecersizMesaji, variant: 'destructive' });
  }, [onExcelFile, onDwgFile]);

  // ── Excel Drop ──
  const handleExcelDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExcelDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    dosyayiYonlendir(file, "Excel (.xlsx/.xls) dosyasi yukleyin.");
  }, [dosyayiYonlendir]);

  // ── DWG Drop ──
  const handleDwgDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDwgDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    dosyayiYonlendir(file, "DWG veya DXF dosyasi yukleyin.");
  }, [dosyayiYonlendir]);

  const handleExcelInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // K6: SECICI yolunda da uzanti denetlenir — accept bir ipucudur, garanti degil.
    if (file) dosyayiYonlendir(file, "Excel (.xlsx/.xls) dosyasi yukleyin.");
    e.target.value = '';
  };

  const handleDwgInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // K6: SECICI yolunda da uzanti denetlenir (birim yine sorulmaz).
    if (file) dosyayiYonlendir(file, "DWG veya DXF dosyasi yukleyin.");
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
                'group cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all',
                excelDragOver
                  ? 'scale-[1.01] border-emerald-500 bg-emerald-50'
                  : 'border-emerald-300 bg-emerald-50/30 hover:bg-emerald-50/60',
              )}
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 transition-transform group-hover:scale-110">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Excel Keşif</h3>
              <p className="mt-1 text-xs text-slate-500">Metraj dosyanızı sürükleyin</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-700">.xlsx</span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-700">.xls</span>
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
                'group cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all',
                dwgDragOver
                  ? 'scale-[1.01] border-blue-500 bg-blue-50'
                  : 'border-blue-200 bg-blue-50/30 hover:bg-blue-50/60',
              )}
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 transition-transform group-hover:scale-110">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">DWG Proje</h3>
              <p className="mt-1 text-xs text-slate-500">Tesisat projesini sürükleyin</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-[10px] font-medium text-blue-700">.dwg</span>
                <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-[10px] font-medium text-blue-700">.dxf</span>
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
