'use client';

import { useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { Upload, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/ortak/lib/utils';
import { toast } from '@/ortak/hooks/use-toast';
import { dosyaTuruSec } from './dosya-turu';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { useVitrin } from '@/ozellik/odeme/VitrinSaglayici';
import type { VitrinIslemi } from '@/ozellik/odeme/vitrin-metinleri';
import { KilitliOzellikKarti } from '@/ozellik/firma/ekip/KilitliOzellikKarti';
import { useFirmaYoneticisi } from '@/ozellik/firma/ekip/useFirmaYoneticisi';
import {
  dwgKapisi,
  dwgTiklanabilir,
  dwgRozetMetni,
  dwgIpucu,
} from '@/ozellik/odeme/dwg-kapisi';
import {
  ipucu,
  kapiDurumu,
  rozetMetni,
  tiklanabilir,
} from '@/ozellik/odeme/ozellik-kapisi';

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

  // DWG: Pro'da aktif, Core'da sonuk. `useCapabilities` provider yoksa
  // savunmaci sekilde "yetenek yok" doner — yani varsayilan SONUKTUR.
  const { loading: yeteneklerYukleniyor, hasAnyDwg, hasAnyMaterial, kapali, izinVar, firmaRol } = useCapabilities();
  // EXCEL: 03.09 kullanici karari — "Excel de DWG gibi kapali olmali,
  // kullanicinin sectigi disipline gore aktif olacak." Kutu TEK oldugu ve
  // disiplin ancak dosya okununca belli oldugu icin kutu duzeyindeki dogru
  // kosul "HERHANGI bir disiplinde malzeme yetenegi"dir; disiplin bazli
  // ayrim izgarada zaten yapiliyor.
  // ⚠ 23.09.2026 — KAPALI HESAPTA YUKLEME YOK (Emre: "teklif hazirlama
  //   dwg — kaydedilen teklifler revizyonu calismayacak"). Kapatilmis
  //   hesabin yetenekleri zaten bos donuyor, yani bu alanlar SANSA BAGLI
  //   olarak da kapanirdi; ACIKCA yaziliyor cunku "yan etkiyle kapali"
  //   bir kapi, yan etki degisince sessizce acilir.
  const hesapKapali = kapali?.kapali === true;
  // ⚠ 23.09.2026 — ALT KULLANICI IZNI (Ekip & Izinler). Yonetici bu modulu
  //   kapattiysa yukleme kutusu yerine KILITLI KART cizilir (ikinci tasarim:
  //   "Yöneticin bu özelliği senin için kapattı." + "Yöneticine yaz");
  //   "Paket seç"/"Pro pakete yükselt" YAZILMAZ — alt kullanici paket alamaz.
  //   Sunucu zaten 403 `UYE_IZNI_YOK` donuyor (`ErisimGuard`).
  const excelUyeKapali = !yeteneklerYukleniyor && !izinVar('excel');
  const dwgUyeKapali = !yeteneklerYukleniyor && !izinVar('dwg');
  // Yonetici adresi yalniz kilitli kart cizilecekse istenir (fazladan istek yok).
  const yonetici = useFirmaYoneticisi(firmaRol === 'uye' && (excelUyeKapali || dwgUyeKapali));
  const excelDurum = kapiDurumu({ loading: yeteneklerYukleniyor, izinVar: hasAnyMaterial() && !hesapKapali && !excelUyeKapali });
  const excelAcik = tiklanabilir(excelDurum);
  const excelRozet = rozetMetni(excelDurum);
  const dwgDurum = dwgKapisi({ loading: yeteneklerYukleniyor, dwgVar: hasAnyDwg() && !hesapKapali && !dwgUyeKapali });
  const dwgAcik = dwgTiklanabilir(dwgDurum);
  const dwgRozet = dwgRozetMetni(dwgDurum);
  // ⚠ 23.09.2026 — VİTRİN (paketsiz YENİ hesap). Emre: "ana sayfa her şey
  //   açılsın, kullanıcının önüne gelsin"; karar "yalnızca gezsin". Kutular
  //   AÇIK görünür (sönük değil, "Pro paket gerekli" rozeti yok) ama dosya
  //   İŞLENMEZ: tıklama da bırakma da paket penceresini açar. Dosya seçtirip,
  //   yükleyip SONRA 403 göstermek kullanıcıyı boşuna bekletirdi.
  //   Aşağıdaki gerçek kutular BİLEREK DOKUNULMADAN duruyor — onların kapısı
  //   (`excelAcik`/`dwgAcik`) vitrinde zaten KAPALI (yetenek yok), yani
  //   vitrin dalı atlansa bile dosya işlenmez.
  const { vitrin, pencereAc } = useVitrin();

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
    else toast({ title: 'Geçersiz dosya', description: gecersizMesaji, variant: 'destructive' });
  }, [onExcelFile, onDwgFile]);

  // ── Excel Drop ──
  const handleExcelDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExcelDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    dosyayiYonlendir(file, "Excel (.xlsx/.xls) dosyası yükleyin.");
  }, [dosyayiYonlendir]);

  // ── DWG Drop ──
  const handleDwgDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDwgDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    dosyayiYonlendir(file, "DWG veya DXF dosyası yükleyin.");
  }, [dosyayiYonlendir]);

  const handleExcelInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // K6: SECICI yolunda da uzanti denetlenir — accept bir ipucudur, garanti degil.
    if (file) dosyayiYonlendir(file, "Excel (.xlsx/.xls) dosyası yükleyin.");
    e.target.value = '';
  };

  const handleDwgInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // K6: SECICI yolunda da uzanti denetlenir (birim yine sorulmaz).
    if (file) dosyayiYonlendir(file, "DWG veya DXF dosyası yükleyin.");
    e.target.value = '';
  };

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-5 py-3.5 text-sm font-semibold">Hızlı Başlat</div>
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
            {/* Excel Upload Zone — izni kapali uyede KILITLI KART (23.09). */}
            {excelUyeKapali ? (
              <KilitliOzellikKarti baslik="Excel Keşif" izin="excel" yonetici={yonetici} />
            ) : vitrin ? (
              <VitrinYuklemeKutusu tur="excel" onAc={pencereAc} />
            ) : (
            <div
              onDragOver={(e) => { if (!excelAcik) return; e.preventDefault(); e.stopPropagation(); setExcelDragOver(true); }}
              onDragEnter={(e) => { if (!excelAcik) return; e.preventDefault(); e.stopPropagation(); setExcelDragOver(true); }}
              onDragLeave={() => setExcelDragOver(false)}
              onDrop={excelAcik ? handleExcelDrop : undefined}
              onClick={() => { if (excelAcik) excelInputRef.current?.click(); }}
              title={ipucu(excelDurum, 'Excel keşif için bir paket gerekir. Abonelik sayfasından paket seçebilirsiniz.')}
              aria-disabled={!excelAcik}
              className={cn(
                'group rounded-2xl border-2 border-dashed p-8 text-center transition-all',
                !excelAcik
                  ? 'cursor-not-allowed border-slate-200 bg-slate-50/60 opacity-60'
                  : excelDragOver
                    ? 'scale-[1.01] cursor-pointer border-emerald-500 bg-emerald-50'
                    : 'cursor-pointer border-emerald-300 bg-emerald-50/30 hover:bg-emerald-50/60',
              )}
            >
              <div className={cn(
                'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition-transform',
                excelAcik
                  ? 'bg-emerald-100 text-emerald-600 group-hover:scale-110'
                  : 'bg-slate-200 text-slate-400',
              )}>
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <h3 className={cn('text-sm font-bold', excelAcik ? 'text-slate-900' : 'text-slate-500')}>Excel Keşif</h3>
              <p className="mt-1 text-xs text-slate-500">
                {excelAcik ? 'Metraj dosyanızı sürükleyin' : 'Metraj dosyasından otomatik fiyatlandırma'}
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className={cn('rounded px-2 py-0.5 font-mono text-[10px] font-medium', excelAcik ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500')}>.xlsx</span>
                <span className={cn('rounded px-2 py-0.5 font-mono text-[10px] font-medium', excelAcik ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500')}>.xls</span>
              </div>
              {excelRozet && (
                <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700">
                  {excelRozet}
                </span>
              )}
              {excelDurum === 'sonuk' && (
                <p className="mt-2 text-[10px]">
                  <Link href="/abonelik" className="font-medium text-emerald-700 underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
                    Paket seç
                  </Link>
                </p>
              )}
              <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelInput} disabled={!excelAcik} />
            </div>
            )}

            {/* DWG Upload Zone
                ⚠ Core pakette SONUK. Sunucu bu ucu zaten 403 ile kapatiyor
                (`@GerekliYetenek(DWG_YUKLE)`); onceden on yuz bunu HIC
                okumuyordu, kutu acik gorunuyor ve dosya surukleyen kullanici
                sessizce 403 yiyordu. Bkz. `ozellik/odeme/dwg-kapisi.ts`.
                23.09: izni kapali uyede KILITLI KART. */}
            {dwgUyeKapali ? (
              <KilitliOzellikKarti baslik="DWG Proje" izin="dwg" yonetici={yonetici} />
            ) : vitrin ? (
              <VitrinYuklemeKutusu tur="dwg" onAc={pencereAc} />
            ) : (
            <div
              onDragOver={(e) => { if (!dwgAcik) return; e.preventDefault(); e.stopPropagation(); setDwgDragOver(true); }}
              onDragEnter={(e) => { if (!dwgAcik) return; e.preventDefault(); e.stopPropagation(); setDwgDragOver(true); }}
              onDragLeave={() => setDwgDragOver(false)}
              onDrop={dwgAcik ? handleDwgDrop : undefined}
              onClick={() => { if (dwgAcik) dwgInputRef.current?.click(); }}
              title={dwgIpucu(dwgDurum)}
              aria-disabled={!dwgAcik}
              className={cn(
                'group rounded-2xl border-2 border-dashed p-8 text-center transition-all',
                !dwgAcik
                  ? 'cursor-not-allowed border-slate-200 bg-slate-50/60 opacity-60'
                  : dwgDragOver
                    ? 'scale-[1.01] cursor-pointer border-blue-500 bg-blue-50'
                    : 'cursor-pointer border-blue-200 bg-blue-50/30 hover:bg-blue-50/60',
              )}
            >
              <div className={cn(
                'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition-transform',
                dwgAcik
                  ? 'bg-blue-100 text-blue-600 group-hover:scale-110'
                  : 'bg-slate-200 text-slate-400',
              )}>
                <FileText className="h-6 w-6" />
              </div>
              <h3 className={cn('text-sm font-bold', dwgAcik ? 'text-slate-900' : 'text-slate-500')}>DWG Proje</h3>
              <p className="mt-1 text-xs text-slate-500">
                {dwgAcik ? 'Tesisat projesini sürükleyin' : 'Tesisat projesinden otomatik metraj'}
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className={cn('rounded px-2 py-0.5 font-mono text-[10px] font-medium', dwgAcik ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500')}>.dwg</span>
                <span className={cn('rounded px-2 py-0.5 font-mono text-[10px] font-medium', dwgAcik ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500')}>.dxf</span>
              </div>
              {dwgRozet && (
                <span className={cn(
                  'mt-2 inline-block rounded px-2 py-0.5 text-[9px] font-semibold',
                  dwgAcik ? 'bg-blue-600/10 text-blue-600' : 'bg-amber-100 text-amber-700',
                )}>
                  {dwgRozet}
                </span>
              )}
              {dwgDurum === 'sonuk' && (
                <p className="mt-2 text-[10px]">
                  <Link href="/abonelik" className="font-medium text-blue-600 underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
                    Pro pakete yükselt
                  </Link>
                </p>
              )}
              <input ref={dwgInputRef} type="file" accept=".dwg,.dxf" className="hidden" onChange={handleDwgInput} disabled={!dwgAcik} />
            </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

/**
 * 23.09.2026 — VİTRİN YÜKLEME KUTUSU (paketsiz yeni hesap).
 *
 * Gerçek kutunun AÇIK görünümünü taşır ama dosya almaz: tıklama, klavye ve
 * dosya bırakma paket penceresini açar. Dosya seçici HİÇ açılmaz (`<input>`
 * yok) — seçilen dosya zaten işlenemezdi.
 *
 * ⚠ SÜRÜKLE-BIRAK `preventDefault` ŞART: bırakma hedefi kabul etmezse
 *   tarayıcı dosyayı SEKMEDE AÇAR (varsayılan davranış) ve kullanıcı
 *   uygulamadan düşer.
 */
interface VitrinKutuTanimi {
  baslik: string;
  aciklama: string;
  uzantilar: readonly string[];
  rozet: string | null;
  cerceve: string;
  ustunde: string;
  simge: string;
  etiket: string;
  rozetSinifi: string;
  Simge: typeof FileText;
}

const VITRIN_KUTU: Record<'excel' | 'dwg', VitrinKutuTanimi> = {
  excel: {
    baslik: 'Excel Keşif',
    aciklama: 'Metraj dosyanızı sürükleyin',
    uzantilar: ['.xlsx', '.xls'],
    rozet: null,
    cerceve: 'border-emerald-300 bg-emerald-50/30 hover:bg-emerald-50/60',
    ustunde: 'scale-[1.01] border-emerald-500 bg-emerald-50',
    simge: 'bg-emerald-100 text-emerald-600',
    etiket: 'bg-emerald-100 text-emerald-700',
    rozetSinifi: '',
    Simge: FileSpreadsheet,
  },
  dwg: {
    baslik: 'DWG Proje',
    aciklama: 'Tesisat projesini sürükleyin',
    uzantilar: ['.dwg', '.dxf'],
    // DWG Pro'ya dahil; rozet gerçek kutunun AÇIK halindekiyle aynı ("PRO").
    rozet: 'PRO',
    cerceve: 'border-blue-200 bg-blue-50/30 hover:bg-blue-50/60',
    ustunde: 'scale-[1.01] border-blue-500 bg-blue-50',
    simge: 'bg-blue-100 text-blue-600',
    etiket: 'bg-blue-100 text-blue-700',
    rozetSinifi: 'bg-blue-600/10 text-blue-600',
    Simge: FileText,
  },
};

function VitrinYuklemeKutusu({
  tur,
  onAc,
}: {
  tur: 'excel' | 'dwg';
  onAc: (islem: VitrinIslemi) => void;
}) {
  const [ustunde, setUstunde] = useState(false);
  const k = VITRIN_KUTU[tur];
  const Simge = k.Simge;
  const ac = () => onAc(tur);

  return (
    <div
      role="button"
      tabIndex={0}
      data-vitrin-kutusu={tur}
      onClick={ac}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ac();
        }
      }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setUstunde(true); }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setUstunde(true); }}
      onDragLeave={() => setUstunde(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setUstunde(false); ac(); }}
      title="Başlamak için bir paket seçin"
      className={cn(
        'group cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all',
        ustunde ? k.ustunde : k.cerceve,
      )}
    >
      <div className={cn('mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110', k.simge)}>
        <Simge className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-bold text-slate-900">{k.baslik}</h3>
      <p className="mt-1 text-xs text-slate-500">{k.aciklama}</p>
      <div className="mt-3 flex items-center justify-center gap-2">
        {k.uzantilar.map((u) => (
          <span key={u} className={cn('rounded px-2 py-0.5 font-mono text-[10px] font-medium', k.etiket)}>{u}</span>
        ))}
      </div>
      {k.rozet && (
        <span className={cn('mt-2 inline-block rounded px-2 py-0.5 text-[9px] font-semibold', k.rozetSinifi)}>
          {k.rozet}
        </span>
      )}
    </div>
  );
}
