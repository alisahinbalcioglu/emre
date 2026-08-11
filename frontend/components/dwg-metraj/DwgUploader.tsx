'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/ortak/lib/utils';
import { toast } from '@/ortak/hooks/use-toast';
import api from '@/ortak/lib/api';
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

/** Dosya iceriginin sha256 kisa hash'i (16 hex) — backend dedup ile ayni bicim.
 *  EMEK KAYBI SIGORTASI: workspace state'i bu hash ile anahtarlanir; sunucu
 *  cache'i dusse ve ayni dosya yeniden yuklense bile (YENI file_id) tum
 *  etiketlemeler localStorage'dan geri gelir. Hata/eski tarayici → null
 *  (file_id anahtarlamasina zarifce duser). */
async function computeFileHash(f: File): Promise<string | null> {
  try {
    const buf = await f.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

/** Birim override secenekleri — backend'in uretebildigi TUM birimler.
 *  Eski modal yalniz {mm, cm, m} sunuyordu; motor dm/inch/ft de uretebiliyor ve
 *  GERCEK bir projede dogru cevap 'dm' cikti — o cevap eski listede ifade dahi
 *  edilemiyordu, yani kullanicinin duzeltmesi imkansizdi. */
const BIRIM_SECENEKLERI: { value: number; label: string; desc: string }[] = [
  { value: 0.001, label: 'mm', desc: 'Milimetre' },
  { value: 0.01, label: 'cm', desc: 'Santimetre' },
  { value: 0.1, label: 'dm', desc: 'Desimetre' },
  { value: 1.0, label: 'm', desc: 'Metre' },
  { value: 0.0254, label: 'inch', desc: 'İnç' },
  { value: 0.3048, label: 'ft', desc: 'Fit' },
];

const GUVEN_METNI: Record<string, string> = {
  kesin: 'kesin — iki bağımsız kanıt uyuştu',
  yuksek: 'yüksek — tek kanıt doğruladı',
  orta: 'orta — yalnız dosya başlığına dayanıyor',
  dusuk: 'DÜŞÜK — doğrulayın',
  yok: 'henüz hesaplanmadı',
};

export default function DwgUploader({ onMetrajApproved }: DwgUploaderProps) {
  // file: dosya nesnesi (yuklemede gerekli). Refresh sonrasi YOK ama
  // fileName + fileId localStorage'dan gelir — workspace acilir.
  const [file, setFile] = useState<File | null>(null);
  // DEBUG: Cloudflare build/cache test marker — yeni JS yuklendigini ispatlar
  // (eski JS bu satiri yazmaz)
  if (typeof window !== 'undefined' && !(window as any).__metaprice_v_marker) {
    (window as any).__metaprice_v_marker = 'v2026-05-27-AUTO-DETECT';
    console.warn('%c🚀 MetaPrice v2026-05-27 AUTO-DETECT yüklendi', 'color:#22c55e;font-size:14px;font-weight:bold');
  }
  // restoredFileName: refresh sonrasi localStorage'dan gelen dosya adi (file nesnesi yok)
  const [restoredFileName, setRestoredFileName] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  /** Icerik hash'i — workspace state'inin kalici anahtari (emek kaybi sigortasi). */
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [extractingLayers, setExtractingLayers] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // BIRIM ARTIK OTOMATIK. Yukleme oncesi soru sorulmuyor: backend cizimin
  // kendi yazili beyanini okuyor (antet pafta olcusu + "ÖLÇEK 1/N" metni
  // kesisimi — bkz. python/unit_detect.py) ve metre carpanini doniyor.
  // Kullaniciya modal ACILMAZ; tespit bir bant olarak GOSTERILIR ve gerekirse
  // oradan degistirilir. Geri alma yolu bilerek birakildi: tespit yanilirsa
  // kullanicinin duzeltmesi imkansiz olmamali.
  const [selectedUnit, setSelectedUnit] = useState<number>(0.001);
  const [tespit, setTespit] = useState<{
    scale: number;
    label: string;
    confidence: string;
    method: string;
    evidence: string[];
  } | null>(null);
  const [birimPaneli, setBirimPaneli] = useState(false);
  const [birimElle, setBirimElle] = useState(false);  // kullanici ezdi mi

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
      extractLayers(pendingFile, { override: pendingScale });
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
            // ── BIRIMIN TEK GERCEK KAYNAGI SUNUCUDUR ────────────────────
            // Onceki surum burada localStorage'daki `session.scale`'i geri
            // yukluyordu. O deger eski oturumlardan kalma mm (0.001) olabilir
            // ve sunucunun tespitini SESSIZCE eziyordu: sayfa yenilenince
            // metraj 100x yanlisa donuyordu, hicbir uyari yoktu.
            // Artik sunucunun tespiti esas; kayitli deger YALNIZ kullanici
            // bilerek ezmisse (birimElle) korunur.
            const st = res.data;
            const sunucuScale = typeof st.suggested_scale === 'number' && st.suggested_scale > 0
              ? st.suggested_scale
              : null;
            const elleEzilmis = session.birimElle === true
              && typeof session.scale === 'number' && session.scale > 0;

            if (elleEzilmis) {
              setSelectedUnit(session.scale);
              setBirimElle(true);
            } else if (sunucuScale) {
              setSelectedUnit(sunucuScale);
              setTespit({
                scale: sunucuScale,
                label: st.suggested_unit_label ?? '?',
                confidence: st.suggested_confidence ?? 'dusuk',
                method: st.suggested_method ?? '',
                evidence: Array.isArray(st.suggested_evidence) ? st.suggested_evidence : [],
              });
              if (st.suggested_confidence === 'dusuk' || st.suggested_confidence === 'yok') {
                setBirimPaneli(true);
              }
            } else {
              // Sunucu birim bilgisi vermedi (eski onbellek kaydi ya da eski
              // motor surumu). SESSIZCE mm varsayma — kullaniciya soyle.
              setSelectedUnit(session.scale && session.scale > 0 ? session.scale : 0.001);
              setBirimPaneli(true);
              toast({
                title: 'Çizim birimi doğrulanamadı',
                description: 'Sunucu bu dosya için birim bilgisi döndürmedi (eski önbellek olabilir). '
                  + 'Metrajı kullanmadan önce birimi doğrulayın veya dosyayı yeniden yükleyin.',
                variant: 'destructive',
              });
            }
            setFileHash(session.fileHash ?? null);
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
        fileHash,
        scale: selectedUnit,
        // Kayitli birimin OTOMATIK mi yoksa KULLANICI KARARI mi oldugunu
        // ayirt etmek sart: restore'da yalnizca kullanici karari sunucunun
        // tespitini ezebilir. Bu bayrak olmadan eski oturumdan kalma mm,
        // dogru tespiti sessizce eziyordu.
        birimElle,
        savedAt: Date.now(),
      }));
    } catch {}
  }, [fileId, file, restoredFileName, selectedUnit, fileHash, birimElle]);

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
    // override: kullanici birimi BILEREK ezdiginde gelir; yoksa otomatik tespit
    opts: { override?: number } = {},
  ) => {
    setFile(f);
    setFileId(null);
    setTespit(null);
    setBirimPaneli(false);
    setBirimElle(false);
    setError(null);
    setExtractingLayers(true);
    startTimer();

    // EMEK KAYBI SIGORTASI: icerik hash'i upload'dan ONCE hesaplanir —
    // workspace bu anahtarla acilir; ayni dosyanin onceki etiketleri
    // (sunucu file_id'yi unutmus olsa bile) localStorage'dan geri gelir.
    const contentHash = await computeFileHash(f);
    setFileHash(contentHash);

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
      // Sunucu ayni icerigi TANIDI mi? (main.py: hash eslesirse eski file_id +
      // `dedup:true` doner, dosya YENIDEN parse EDILMEZ.) Bu bayrak bugune
      // kadar okunmuyordu; ekranda her zaman "Proje hazirlandi" yaziyordu ve
      // kullanici ayni dosyayi tekrar yukledigini anlamiyordu.
      const dedupEdildi: boolean = uploadRes.data?.dedup === true;

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

      // 3) Sonuc — BIRIM OTOMATIK TESPIT EDILDI.
      // Backend cizimin kendi beyanini okur (antet pafta olcusu + "ÖLÇEK 1/N"
      // kesisimi). opts.override yalnizca kullanici bilerek ezdiginde gelir.
      const totalLayers = statusData.total_layers ?? (statusData.layers?.length ?? 0);
      const otoScale: number | undefined =
        typeof statusData.suggested_scale === 'number' && statusData.suggested_scale > 0
          ? statusData.suggested_scale
          : undefined;
      const guven: string = statusData.suggested_confidence ?? 'dusuk';
      const etiket: string = statusData.suggested_unit_label ?? 'mm';
      const kanit: string[] = Array.isArray(statusData.suggested_evidence)
        ? statusData.suggested_evidence
        : [];

      const kullanilacak = opts.override ?? otoScale ?? 0.001;
      setSelectedUnit(kullanilacak);
      setBirimElle(opts.override != null);
      setTespit(otoScale
        ? { scale: otoScale, label: etiket, confidence: guven,
            method: statusData.suggested_method ?? '', evidence: kanit }
        : null);

      // Guven dusukse SESSIZ GECME. "mm" hem "eminim" hem "pes ettim"
      // anlamina gelebiliyordu; kullanici farki goremiyordu.
      const guvensiz = guven === 'dusuk' || guven === 'yok';
      if (!opts.override && guvensiz) {
        setBirimPaneli(true);
      }

      const birimMetni = opts.override
        ? ''
        : ` · birim: ${etiket}${guvensiz ? ' (DOĞRULAYIN)' : ''}`;
      toast({
        title: dedupEdildi ? 'Bu dosya daha önce yüklenmişti' : 'Proje hazirlandi',
        description: (dedupEdildi
          ? `${totalLayers} layer · önceki analiz yeniden kullanıldı, varsa etiketlemeniz geri gelir.`
          : `${totalLayers} layer`) + birimMetni,
        variant: guvensiz && !opts.override ? 'destructive' : undefined,
      });

      setFileId(uploadFileId);
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
    setFileHash(null);
    setTespit(null);
    setBirimPaneli(false);
    setBirimElle(false);
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
    // Birim SORULMAZ — backend otomatik tespit eder, sonuc bant olarak gosterilir.
    extractLayers(f);
  };

  /** Kullanici otomatik tespiti eziyor. Metraj yeniden hesaplanmali. */
  const birimiDegistir = (yeniScale: number) => {
    setSelectedUnit(yeniScale);
    setBirimElle(true);
    setBirimPaneli(false);
    toast({
      title: 'Birim değiştirildi',
      description: `Çizim birimi elle ${BIRIM_SECENEKLERI.find((b) => b.value === yeniScale)?.label ?? yeniScale} olarak ayarlandı — hesaplanan metrajları yenileyin.`,
    });
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

  // ── BIRIM BANDI ────────────────────────────────────────────────
  // Degisken olarak tutulur cunku IKI ayri return dalinda da render
  // edilmesi gerekiyor: workspace acikken (asil kullanim) ve yukleme
  // ekraninda. Ilk surumde yalniz ikincisine konmustu ve workspace
  // acilinca bant HIC gorunmuyordu — tespiti gorme/duzeltme yolu yoktu.
  const birimBandi = (tespit || birimElle) ? (
      <div
        className={cn(
          'mt-4 rounded-lg border px-4 py-3',
          birimElle
            ? 'border-slate-200 bg-slate-50'
            : tespit?.confidence === 'kesin' || tespit?.confidence === 'yuksek'
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-300 bg-amber-50',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">
              {birimElle
                ? `Çizim birimi (elle): ${BIRIM_SECENEKLERI.find((b) => b.value === selectedUnit)?.label ?? selectedUnit}`
                : `Çizim birimi otomatik bulundu: ${tespit?.label}`}
              {!birimElle && tespit && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  ({GUVEN_METNI[tespit.confidence] ?? tespit.confidence})
                </span>
              )}
            </p>
            {!birimElle && tespit && (tespit.confidence === 'dusuk' || tespit.confidence === 'orta') && (
              <p className="mt-1 text-xs font-medium text-amber-800">
                Kanıt zayıf — metrajı kullanmadan önce birimi doğrulayın.
              </p>
            )}
            {!birimElle && tespit?.evidence?.length ? (
              <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-slate-500">
                {tespit.evidence.slice(0, 3).map((k, i) => (
                  <li key={i}>· {k}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            onClick={() => setBirimPaneli((v) => !v)}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {birimPaneli ? 'Kapat' : 'Değiştir'}
          </button>
        </div>

        {birimPaneli && (
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="mb-2 text-xs text-slate-500">
              Çizimde 1 birim gerçekte kaç uzunluk? (metraj bu çarpanla metreye çevrilir)
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {BIRIM_SECENEKLERI.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => birimiDegistir(opt.value)}
                  className={cn(
                    'rounded-lg border-2 px-2 py-2 text-center transition-all',
                    selectedUnit === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300',
                  )}
                >
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-slate-400">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
  ) : null;


  // ── RENDER: fileId hazirsa workspace acilir ──
  // file objesi olabilir (yeni upload) veya restoredFileName (session restore)
  const effectiveFileName = file?.name || restoredFileName;
  if (fileId && effectiveFileName) {
    // ⚠ BIRIM BANDI BURADA DA RENDER EDILMELI. Ilk surumde bant yalniz
    // asagidaki (yukleme ekrani) JSX'ine konmustu; bu erken donus yuzunden
    // workspace acilinca ASLA gorunmuyordu — yani kullanicinin tespiti gorme
    // ve duzeltme yolu yoktu. Tam da "ozelligi acmak = yolu acmaktir" hatasi.
    return (
      <div>
        {birimBandi}
        <DwgProjectWorkspace
          fileId={fileId}
          scale={selectedUnit}
          fileName={effectiveFileName}
          fileHash={fileHash}
          onReset={resetAll}
          onApproved={onMetrajApproved}
        />
      </div>
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

    {birimBandi}
    </div>
  );
}
