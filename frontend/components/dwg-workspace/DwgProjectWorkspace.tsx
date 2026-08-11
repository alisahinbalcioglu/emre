'use client';

/**
 * DWG Project Workspace — tek ekran MANUEL ETIKETLEME metraj akisi.
 * Sol: buyuk Canvas2D cizim | Sag: Cap Kalemleri + lejant + layer + ozet.
 *
 * Kullanici:
 *  - Layer secer → "Layer'i Segmentlerine Ayir" → borular capsiz (NEON) cikar
 *  - Cap Kalemi secer → boruya tiklar → cap atanir (ayni capa tekrar tik = geri al)
 *  - "Hesaplamayi Tamamla" → layer onaylanir, kalem/secim resetlenir
 *  - Birden fazla layer ekleye ekleye finale gider
 *
 * NOT: "Ekipman isaretleme" akisi 10.08'de KALDIRILDI (kullanici karari).
 * Sembol (INSERT/CIRCLE) tiklamasi artik boru tiklamasiyla ayni isi yapar:
 * layer secer / gizleme modunda gizler.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import { toast } from '@/ortak/hooks/use-toast';
import { confirm } from '@/ortak/hooks/use-confirm';
import api from '@/ortak/lib/api';
import { DxfCanvasViewer } from '@/components/dwg-viewer';
import { DiameterEditPopup, type EdgeSegment } from '@/components/dwg-metraj';
import type { MetrajResult } from '@/components/dwg-metraj/types';
import LayerInfoSidebar from './LayerInfoSidebar';
import LayerVisibilityPanel from './LayerVisibilityPanel';
import MetrajSummaryPanel from './MetrajSummaryPanel';
import { useWorkspaceState } from './useWorkspaceState';
import { capRenkliGorunur } from './onay-revizyon';
import type { CalculatedLayer } from './types';
import {
  useLayerCalc,
  useOriginalColorState,
  DiameterLegendPanel,
} from '@/components/dwg-diameter-engine';
import { BucketPanel, useActiveBucket, useTaggingStore } from '@/components/dwg-tagging';
import { diameterToColor, canonicalizeDiameter } from '@/components/dwg-metraj/diameter-colors';
import { isUnassignedDiameter } from '@/components/dwg-metraj/constants';
import { exportMetrajToExcel, type MetrajSheet } from '@/lib/metraj-excel';

interface DwgProjectWorkspaceProps {
  fileId: string;
  scale: number;
  fileName: string;
  /** Dosya iceriginin sha256 kisa hash'i (DwgUploader hesaplar). Workspace
   *  state'i bununla anahtarlanir — sunucu file_id'yi unutsa bile ayni dosya
   *  yeniden yuklenince TUM etiketler localStorage'dan geri gelir. */
  fileHash?: string | null;
  onReset: () => void;
  onApproved: (metraj: MetrajResult, fileName: string) => void;
}

/** Metre carpanini insan-okunur birim adina cevirir (bant metni icin). */
const BIRIM_ADI = (scale: number): string => {
  const t: [number, string][] = [[0.001, 'mm'], [0.01, 'cm'], [0.1, 'dm'],
                                 [1, 'm'], [0.0254, 'inch'], [0.3048, 'ft']];
  const bulunan = t.find(([m]) => Math.abs(scale - m) / m < 1e-6);
  return bulunan ? bulunan[1] : `x${scale}`;
};

export default function DwgProjectWorkspace({
  fileId, scale, fileName, fileHash = null, onReset, onApproved,
}: DwgProjectWorkspaceProps) {
  const {
    state,
    restoredWork,
    birimDegisimi,
    resetFileState,
    selectLayer,
    focusLayer,
    addCalculatedLayer, approveLayer, unapproveLayer, removeCalculatedLayer,
    updateEdgeSegmentDiameter,
    applyDiameterWithPropagation,
    removeSprinklerLayer, toggleSprinklerLayer,
    toggleLayerVisibility, showAllLayers,
    toggleLayerDimmed, showAllDimmed,
  } = useWorkspaceState(fileId, scale, fileHash);

  /** Geometry'den cikan layer isimleri — DxfCanvasViewer onLayersAvailable
   *  callback'inden gelir. Layer goruntusu paneli icin kullanilir. */
  const [availableLayers, setAvailableLayers] = useState<string[]>([]);
  const hiddenLayersSet = useMemo(() => new Set(state.hiddenLayers), [state.hiddenLayers]);
  const dimmedLayersSet = useMemo(() => new Set(state.dimmedLayers), [state.dimmedLayers]);
  // PERF: inline `new Set(...)` her render'da YENI identity uretir → viewer'in
  // render effect'i tetiklenir → 706K cizgilik sahne bosuna yeniden cizilirdi.
  const sprinklerLayersSet = useMemo(() => new Set(state.sprinklerLayers), [state.sprinklerLayers]);

  /** AutoCAD-vari "Layer Gizle Modu". Toolbar'daki goz-kapali butonu ile toggle.
   *  Aktif iken cizimde tikla = o layer'i cizimden cikar. Geri getirmek icin
   *  sag panel "Layer Goruntusu" listesinden goz ikonuyla gosterirsin. */
  const [hideMode, setHideMode] = useState(false);

  /** SILGI MODU — AutoCAD'in Erase komutu mantigi.
   *  Aktif iken: tik = entity sil, drag = marquee select + sil.
   *  Silinen entity'ler hidden* set'lerinde tutulur, render skip eder.
   *  hesaplama yapilirken backend'e gonderilir (excluded_lines), metraj
   *  hesabindan da cikar. */
  const [eraseMode, setEraseMode] = useState(false);
  /** "x1,y1,x2,y2" formatinda LINE key set (round 1dp) */
  const [hiddenLineKeys, setHiddenLineKeys] = useState<Set<string>>(new Set());
  /** insert_index set (geometry.inserts array index) */
  const [hiddenInsertKeys, setHiddenInsertKeys] = useState<Set<number>>(new Set());
  /** geometry.texts[] array index set */
  const [hiddenTextKeys, setHiddenTextKeys] = useState<Set<number>>(new Set());

  /** PENDING ERASE — kullanici tikladi/marquee yapti ama henuz silmedi.
   *  "Sil (Enter)" butonuna basinca veya Enter tuşuna basinca hidden'a aktarilir.
   *  Esc veya "Iptal" ile temizlenir. AutoCAD'in seç-onayla-sil flow'u. */
  const [pendingErase, setPendingErase] = useState<{
    lines: string[];
    inserts: number[];
    texts: number[];
  } | null>(null);

  /** Undo history — son N erase action'i (her action = ne silindi) */
  const [eraseHistory, setEraseHistory] = useState<
    Array<{ lines: string[]; inserts: number[]; texts: number[] }>
  >([]);
  const MAX_ERASE_HISTORY = 10;

  /** Marquee'de tespit edilen veya tek tikla secilen entity'leri PENDING'e ekle.
   *  Hala silmiyor — confirm aksiyonu bekliyor. */
  const handleSelectForErase = useCallback(
    (lines: string[], inserts: number[], texts: number[]) => {
      if (lines.length === 0 && inserts.length === 0 && texts.length === 0) return;
      setPendingErase((prev) => {
        if (!prev) return { lines, inserts, texts };
        // Birikme — eski pending'e ekle (multi-select)
        return {
          lines: Array.from(new Set([...prev.lines, ...lines])),
          inserts: Array.from(new Set([...prev.inserts, ...inserts])),
          texts: Array.from(new Set([...prev.texts, ...texts])),
        };
      });
    },
    [],
  );

  /** Pending'i onayla — hidden'a aktar + history'e ekle. Enter veya "Sil" butonu. */
  const handleConfirmErase = useCallback(() => {
    if (!pendingErase) return;
    const { lines, inserts, texts } = pendingErase;
    setHiddenLineKeys((prev) => {
      const next = new Set(prev);
      for (const k of lines) next.add(k);
      return next;
    });
    setHiddenInsertKeys((prev) => {
      const next = new Set(prev);
      for (const k of inserts) next.add(k);
      return next;
    });
    setHiddenTextKeys((prev) => {
      const next = new Set(prev);
      for (const k of texts) next.add(k);
      return next;
    });
    setEraseHistory((prev) => {
      const next = [...prev, { lines, inserts, texts }];
      return next.length > MAX_ERASE_HISTORY ? next.slice(-MAX_ERASE_HISTORY) : next;
    });
    setPendingErase(null);
  }, [pendingErase]);

  /** Pending'i iptal et — secimi sifirla (silme yapilmaz). Esc veya "Iptal" butonu. */
  const handleCancelPendingErase = useCallback(() => {
    setPendingErase(null);
  }, []);

  const handleUndoErase = useCallback(() => {
    setEraseHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setHiddenLineKeys((s) => {
        const next = new Set(s);
        for (const k of last.lines) next.delete(k);
        return next;
      });
      setHiddenInsertKeys((s) => {
        const next = new Set(s);
        for (const k of last.inserts) next.delete(k);
        return next;
      });
      setHiddenTextKeys((s) => {
        const next = new Set(s);
        for (const k of last.texts) next.delete(k);
        return next;
      });
      return prev.slice(0, -1);
    });
  }, []);

  const handleRestoreAllErased = useCallback(() => {
    setHiddenLineKeys(new Set());
    setHiddenInsertKeys(new Set());
    setHiddenTextKeys(new Set());
    setEraseHistory([]);
    setPendingErase(null);
  }, []);

  const [calculating, setCalculating] = useState(false);

  // ── MANUEL ETIKETLEME AKISI (operasyon: otomatik proximity KALDIRILDI) ──
  // useLayerCalc: tek layer icin SAF geometri+uzunluk hesabi (/parse — cap
  // atamasi YOK, tum segmentler capsiz/neon gelir).
  // useOriginalColorState: save sonrasi viewer'da cap-renk kapat (PRD §5).
  const { useDiameterColors, enableDiameterColors, restoreOriginalColors } = useOriginalColorState();
  const { calculatingLayer, calculateLayer } = useLayerCalc({
    fileId,
    scale,
    sprinklerLayers: state.sprinklerLayers,
    onResult: ({ calculated }) => {
      addCalculatedLayer(calculated);
      enableDiameterColors();  // Yeni hesaplama -> cap renkleri aktif (capsizlar neon)
    },
    // Engine cache resetlendiginde (TTL 15dk / deploy): localStorage'daki
    // file_id gecersiz. Parent onReset() ile DwgUploader'a doner.
    onFileIdInvalid: () => {
      onReset();
    },
  });

  const [editingSegment, setEditingSegment] = useState<EdgeSegment | null>(null);

  // ── TIKLA-ETIKETLE (bucket) ─────────────────────────────────────────────
  // Aktif kalem varken cizimde boruya tik = capi dogrudan ata (popup yok).
  // tagFlash: SEGMENT IZOLASYONU teyidi — tiklanan run ~900ms kalem rengiyle
  // parlar, uc noktalari (T-noktalari arasi sinirlar) vurgulanir.
  const activeBucket = useActiveBucket();
  // UX #4 (state bulasmasi): yeni layer hesaplamasi / tamamlama aninda aktif
  // kalem deaktive edilir — sonraki layer'a yanlislikla cap bulasmasin.
  const clearActiveBucket = useTaggingStore((s) => s.clearActiveBucket);
  const [tagFlash, setTagFlash] = useState<{ segmentId: number; color: string; at: number } | null>(null);

  // Cap Renkleri legend'i SADECE onaysiz layer'larin caplarini gosterir.
  // Onaylanan layer kullanici icin "bitti" sayilir; cap listesi karismasin.
  // Hesaplanmis Metraj panelinde gerekirse o layer'a tiklayinca onay kalkar
  // ve renkler geri gelir (revize modu).
  const pendingCalculatedLayers = useMemo(() => {
    const map: Record<string, CalculatedLayer> = {};
    for (const [layer, cl] of Object.entries(state.calculatedLayers)) {
      if (!cl.approved) map[layer] = cl;
    }
    return map;
  }, [state.calculatedLayers]);

  // EKSIK PARCA TESPITI: bekleyen layer'lardaki capsiz segment sayisi.
  // Viewer bunlari NEON cizer; BucketPanel rozet + toplu-uygula gosterir.
  const unassignedPendingCount = useMemo(() => {
    let n = 0;
    for (const cl of Object.values(pendingCalculatedLayers)) {
      for (const es of cl.edgeSegments) {
        if (isUnassignedDiameter(es.diameter)) n += 1;
      }
    }
    return n;
  }, [pendingCalculatedLayers]);

  /** Aktif kalemi TUM capsiz segmentlere toplu uygula. Secili layer hesaplanmis
   *  ve onaysizsa yalniz ona; degilse tum bekleyen layer'lara. (Eski backend
   *  layer-default fallback'inin kullanici-tetikli karsiligi.) */
  const applyBucketToUnassigned = useCallback((diameter: string) => {
    const selCl = state.selectedLayer ? state.calculatedLayers[state.selectedLayer] : null;
    const targets = selCl && !selCl.approved ? [selCl] : Object.values(pendingCalculatedLayers);
    let n = 0;
    for (const cl of targets) {
      for (const es of cl.edgeSegments) {
        if (isUnassignedDiameter(es.diameter)) {
          updateEdgeSegmentDiameter(cl.layer, es.segment_id, diameter);
          n += 1;
        }
      }
    }
    toast({
      title: 'Toplu çap uygulandı',
      description: `${n} çapsız segment → ${diameter}${selCl && !selCl.approved ? ` (${selCl.layer})` : ' (tüm bekleyen layerlar)'}`,
    });
  }, [state.selectedLayer, state.calculatedLayers, pendingCalculatedLayers, updateEdgeSegmentDiameter]);

  // ── CAP RENKLERI LISTE NAVIGATION ──────────────────────────────────────
  // Legend'da bir cap'e tiklayinca o cap'in segment'leri arasinda dolas.
  // activeDiameter: aktif cap key ("Ø50", "Belirtilmemis", ...). null = kapali.
  // activeIndex: o cap icin gecerli segment index (0-based, modulo segment sayisi).
  // focusVersion: ayni segment'e tekrar basildiginda zoom+halo'yu yeniden tetikleme
  //   icin monoton artan token. Parent her cycle tikinda increment eder.
  const [activeDiameter, setActiveDiameter] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [focusVersion, setFocusVersion] = useState<number>(0);

  // Aktif cap icin onaysiz layer'lardaki eslesen segment'leri duzlestir.
  // Onayli layer'lar Cap Renkleri'nde gozukmuyor; cycle'da da olmamali.
  const activeDiameterSegments = useMemo<EdgeSegment[]>(() => {
    if (!activeDiameter) return [];
    const out: EdgeSegment[] = [];
    for (const cl of Object.values(pendingCalculatedLayers)) {
      for (const seg of cl.edgeSegments) {
        const segKey = seg.diameter || 'Belirtilmemis';
        if (segKey === activeDiameter) out.push(seg);
      }
    }
    out.sort((a, b) => a.segment_id - b.segment_id);
    return out;
  }, [activeDiameter, pendingCalculatedLayers]);

  // Tiklanan cap segment listesi degisirse (cap eklendi/silindi/duzeltildi) index'i
  // guvenle clamp et — out-of-bounds focus'u onler.
  useEffect(() => {
    if (activeDiameter && activeIndex >= activeDiameterSegments.length) {
      setActiveIndex(activeDiameterSegments.length > 0 ? 0 : 0);
    }
  }, [activeDiameter, activeIndex, activeDiameterSegments.length]);

  const handleCycleDiameter = useCallback((diameter: string) => {
    if (activeDiameter !== diameter) {
      // Yeni cap'e gec — basa al
      setActiveDiameter(diameter);
      setActiveIndex(0);
    } else {
      // Ayni cap'e tekrar tikla — sonraki segmente atla (modulo cycle)
      setActiveIndex((prev) => {
        const count = activeDiameterSegments.length;
        if (count <= 1) return 0;
        return (prev + 1) % count;
      });
    }
    setFocusVersion((v) => v + 1);  // Tek-segment cap'lerde bile zoom + halo yeniden tetiklensin
  }, [activeDiameter, activeDiameterSegments.length]);

  const handleClearActiveDiameter = useCallback(() => {
    setActiveDiameter(null);
    setActiveIndex(0);
  }, []);

  // Aktif segment ve halo rengini DxfCanvasViewer'a propagate et
  const focusedSegmentId = activeDiameter && activeDiameterSegments.length > 0
    ? activeDiameterSegments[Math.min(activeIndex, activeDiameterSegments.length - 1)].segment_id
    : null;
  const focusedHaloColor = activeDiameter ? diameterToColor(activeDiameter) : null;

  // selectedConfig KALDIRILDI (UX #3): hat ismi / malzeme / varsayilan cap
  // form alanlari silindi — cap bilgisi Cap Kalemleri modulunden geliyor.

  // ─── Global Esc: en ust katmandan baslayip tek tek geri al ─────────
  // Priority: acik popup'lar > duzenlenen ogeler > secim/mod. Her Esc tek
  // katman geri gider — kullanici uretici akisi kaybetmez.
  // Input'a focus iken Esc form temizleme yapsin (preventDefault yok).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (editingSegment) { setEditingSegment(null); return; }
      // Pending erase silgi modundan ONCE — Esc bir kademe geri gider:
      // pending varsa once pending iptal, sonraki Esc silgi modunu kapatir.
      if (pendingErase) { handleCancelPendingErase(); return; }
      if (eraseMode) { setEraseMode(false); return; }  // silgi modunu kapat
      if (activeDiameter) { handleClearActiveDiameter(); return; }  // cap-focus halo'yu kapat
      if (state.selectedLayer) { selectLayer(state.selectedLayer); return; }  // toggle off
      if (hideMode) { setHideMode(false); return; }
    };
    // Ctrl+Z undo erase
    const onUndoKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && eraseHistory.length > 0) {
        e.preventDefault();
        handleUndoErase();
      }
    };
    // Enter → pending erase'i onayla (AutoCAD-style: sec sonra Enter)
    // Input/textarea focus iken Enter form submit edebilir → atla.
    const onEnterKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !pendingErase) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      handleConfirmErase();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onUndoKey);
    window.addEventListener('keydown', onEnterKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onUndoKey);
      window.removeEventListener('keydown', onEnterKey);
    };
  }, [editingSegment, state.selectedLayer, hideMode, eraseMode, eraseHistory.length, pendingErase, activeDiameter, selectLayer, handleUndoErase, handleConfirmErase, handleCancelPendingErase, handleClearActiveDiameter]);

  // Pending erase Set'leri — viewer turuncu highlight icin (immutable Set)
  const pendingLineKeysSet = useMemo(
    () => (pendingErase ? new Set(pendingErase.lines) : undefined),
    [pendingErase],
  );
  const pendingInsertKeysSet = useMemo(
    () => (pendingErase ? new Set(pendingErase.inserts) : undefined),
    [pendingErase],
  );
  const pendingTextKeysSet = useMemo(
    () => (pendingErase ? new Set(pendingErase.texts) : undefined),
    [pendingErase],
  );

  // Onayli layer'lar cap-renkli edge listesinden DUSER — viewer onlara dokunmaz,
  // layer orijinal AutoCAD rengiyle kalir. Kullanici kurali: "onayla = bu layer
  // bitti, dikkati basa cek". T-junction marker'lari da onayli layer'larda gizli.
  // ⚠ KARAR TEK YERDE: "cap renkli gorunur mu" sorusu `onay-revizyon.ts`de
  // yasar ve testle kilitlidir. Eskiden bu iki blokta `if (cl.approved)
  // continue` elle TEKRARLANIYORDU; testin olctugu sey uretimde kullanilmayan
  // bir kopya olurdu (projenin "proxy olcut yasak" dersi).
  const calculatedEdgesByLayer = useMemo(() => {
    const map: Record<string, EdgeSegment[]> = {};
    for (const [layer, cl] of Object.entries(state.calculatedLayers)) {
      if (!capRenkliGorunur({ hesaplandi: true, onayli: cl.approved })) continue;
      map[layer] = cl.edgeSegments;
    }
    return map;
  }, [state.calculatedLayers]);

  const calculatedJunctionsByLayer = useMemo(() => {
    const map: Record<string, [number, number][]> = {};
    for (const [layer, cl] of Object.entries(state.calculatedLayers)) {
      // T-junction marker'lari cap renkleriyle AYNI kurala tabi.
      if (!capRenkliGorunur({ hesaplandi: true, onayli: cl.approved })) continue;
      if (cl.junctionPoints && cl.junctionPoints.length > 0) {
        map[layer] = cl.junctionPoints;
      }
    }
    return map;
  }, [state.calculatedLayers]);

  /** Layer panelinde her layer adının yanında atanmış çapı rozet olarak
   *  göstermek için lookup map. */
  const layerDiametersMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [layer, cfg] of Object.entries(state.layerConfigs)) {
      if (cfg.defaultDiameter?.trim()) m[layer] = cfg.defaultDiameter;
    }
    return m;
  }, [state.layerConfigs]);

  const calculatedLayerNames = useMemo(
    () => new Set(Object.keys(state.calculatedLayers)),
    [state.calculatedLayers],
  );

  // BULK auto-calc KALDIRILDI: Kullanici 142 layer'in hepsini hesaplama
  // istemiyor. Yeni akis: kullanici layer'a tikla, sag panel acilir, "Hesapla"
  // butonuna basinca SADECE o layer parse edilir. Engine load minimize, kontrol
  // kullanicida.


  /** Layer secimi degisikligini onaysiz-hesaplama korumasiyla yap.
   *  Mevcut secili layer hesaplandi ama onaylanmadi ise uyari ver, secimi
   *  degistirme. Ayni layer'a tekrar tiklama (toggle off) serbest.
   *  Returns: true -> secim degisti, false -> bloklandi. */
  const tryChangeLayer = (target: string): boolean => {
    const prev = state.selectedLayer;
    if (prev && prev !== target) {
      const cl = state.calculatedLayers[prev];
      if (cl && !cl.approved) {
        toast({
          title: 'Once mevcut layer\'i onaylayin',
          description: `"${prev}" hesaplandi ama onaylanmadi. Onayla butonuna basip sonra baska layer'a gec.`,
          variant: 'destructive',
        });
        return false;
      }
    }
    selectLayer(target);
    return true;
  };

  /**
   * REVIZYONA DON — onayi kaldir + layer'i calisilir hale getir (07.08 istegi:
   * "onaylandi butonunu bozabilmeli ve parcalanmis segmentler geri gelmeli").
   *
   * UC ADIM BIRLIKTE olmali; biri eksik kalirsa kullanici yine calisamaz:
   *  1. `unapproveLayer` — layer cap-renkli listelere geri girer
   *     (`calculatedEdgesByLayer` onaylilari eler), T-noktalari geri gelir ve
   *     segmentler yeniden TIKLANABILIR olur (viewer onaylilari raw LINE olarak
   *     indeksliyordu, o yuzden cap duzeltilemiyordu).
   *  2. `focusLayer` — secim ACIK kalir. `selectLayer` bir TOGGLE'dir ve layer
   *     zaten seciliyken cagrildiginda secimi NULL'a cekiyordu; sag panel
   *     bosalinca revizyon yine mumkun olmuyordu (fix oncesi ikinci kusur).
   *  3. `enableDiameterColors` — "Fiyatlandirmaya Gec" akisi cikarken
   *     `restoreOriginalColors()` cagirip cap renklerini GLOBAL kapatiyor
   *     (PRD §5). Bayrak kapali kalirsa onay kalksa bile ekranda hicbir sey
   *     degismez; kullanici "yine olmadi" der. Bayrak burada geri acilir.
   */
  const revizyonaDon = useCallback((layer: string) => {
    unapproveLayer(layer);
    focusLayer(layer);
    enableDiameterColors();
    // AKTIF KALEM TEMIZLENIR — onay yollarinin (approveLayer + onComplete)
    // hepsi bunu yapiyor; revizyon girisi de ayni sozlesmede olmali. Yoksa
    // onceki layer'dan kalan bayat cap kalemi aktif kalir ve kullanicinin
    // revize edilen layer'a ilk tiklamasi YANLIS capi yazar.
    clearActiveBucket();
    toast({
      title: 'Revize modu açıldı',
      description: `${layer} — onay kaldırıldı, segmentler ve çap renkleri geri geldi. Düzeltip tekrar onaylayın (onaylamazsanız teklife girmez).`,
    });
  }, [unapproveLayer, focusLayer, enableDiameterColors, clearActiveBucket]);

  const handleLineClick = (line: { layer: string; index: number; shiftKey: boolean; screenX: number; screenY: number }) => {
    // LINE click -> SADECE layer secimi. Hesaplama "Hesapla" butonuyla manuel
    // tetiklenir (LayerInfoSidebar'da).
    if (hideMode || line.shiftKey) {
      toggleLayerVisibility(line.layer);
      toast({
        title: state.hiddenLayers.includes(line.layer) ? 'Layer gosterildi' : 'Layer gizlendi',
        description: line.layer,
      });
      return;
    }
    tryChangeLayer(line.layer);
  };

  // ── SEMBOL (INSERT / CIRCLE) TIKLAMASI = LAYER SECIMI ──────────────────
  // Ekipman isaretleme ozelligi kaldirildi (kullanici karari 10.08). Bu iki
  // dal SILINMEDI, cunku viewer sembolleri hala tiklanabilir hedef olarak
  // indeksliyor: handler kaldirilsaydi tiklama sessizce YUTULURDU (altindaki
  // boruya da gecmez) — kullanici "tikliyorum bir sey olmuyor" yasardi.
  // Artik boru tiklamasiyla AYNI isi yapar: gizleme modunda layer'i gizler,
  // aksi halde layer'i secer.
  const handleSymbolClick = (layer: string) => {
    if (hideMode) {
      toggleLayerVisibility(layer);
      toast({
        title: state.hiddenLayers.includes(layer) ? 'Layer gosterildi' : 'Layer gizlendi',
        description: layer,
      });
      return;
    }
    tryChangeLayer(layer);
  };
  const handleInsertClick = (ins: { layer: string }) => handleSymbolClick(ins.layer);
  const handleCircleClick = (c: { layer: string }) => handleSymbolClick(c.layer);

  /** Hesaplanmis ve onaylanmis layer'lardan Excel sheet'leri kur.
   *  Her layer ayri sheet — Cap'lere groupBy, malzeme adi config.materialType. */
  const buildExcelSheets = (approvedLayers: CalculatedLayer[]): MetrajSheet[] => {
    return approvedLayers
      .slice()
      .sort((a, b) => (a.approvedAt ?? 0) - (b.approvedAt ?? 0))
      .map((cl) => {
        const byDia = new Map<string, number>();
        for (const seg of cl.edgeSegments) {
          const cap = seg.diameter || 'Belirtilmemis';
          byDia.set(cap, (byDia.get(cap) || 0) + (seg.length || 0));
        }
        const rows = Array.from(byDia.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([diameter, length]) => ({
            name: cl.materialType || '-',
            diameter,
            unit: 'm',
            qty: Math.round(length * 100) / 100,
          }));
        return {
          sheetName: cl.hatIsmi || cl.layer,
          rows,
          totalLength: cl.totalLength,
          materialType: cl.materialType || undefined,
        };
      });
  };

  const handleConfirmAll = async () => {
    const allLayers = Object.values(state.calculatedLayers);
    const approvedLayers = allLayers.filter((l) => l.approved);

    if (approvedLayers.length === 0) {
      toast({
        title: 'Onayli layer yok',
        description: 'Once hesaplanan layer\'lari "Onayla" butonuyla onayla, sonra finallestir.',
        variant: 'destructive',
      });
      return;
    }

    // EKSIK PARCA GUARD: onayli layer'larda capsiz segment kaldiysa kullanici
    // bilerek onaylasin — neon vurgu gozden kacmis olabilir (operasyon madde 1).
    const unassignedInApproved = approvedLayers.reduce(
      (n, cl) => n + cl.edgeSegments.filter((es) => isUnassignedDiameter(es.diameter)).length,
      0,
    );
    if (unassignedInApproved > 0) {
      const ok = await confirm({
        title: `${unassignedInApproved} boru parçasının çapı atanmamış`,
        description: 'Çizimde neon görünüyor. Bunlar Excel/fiyatlandırmada "Belirtilmemiş" olarak görünecek. Yine de devam edilsin mi?',
        confirmText: 'Devam et',
      });
      if (!ok) return;
    }

    // ── ONAYSIZ LAYER = TEKLIFE GIRMEYEN LAYER (BLOKLAYAN UYARI) ───────────
    // Eskiden burada yalniz bir toast vardi ve hemen ardindan gelen "Excel
    // olusturuldu" toast'i onu EZIYORDU: layer sessizce teklif disinda
    // kaliyordu. Revizyon yolu acildigi icin bu artik SIK bir senaryo —
    // kullanici revize etmek icin onayi kaldirir, duzeltir, yeniden
    // onaylamayi unutur. Onay sorusu, kullaniciyi durdurup adini soyluyor.
    const pendingLayers = allLayers.filter((l) => !l.approved);
    if (pendingLayers.length > 0) {
      const adlar = pendingLayers.map((l) => l.hatIsmi || l.layer).join(', ');
      const ok = await confirm({
        title: `${pendingLayers.length} layer onaylanmadı — teklife GİRMEYECEK`,
        description:
          `Onaysız: ${adlar}. Bu layer'lar Excel'e ve fiyatlandırmaya dahil edilmez. ` +
          'Revize ettiyseniz önce "Hesaplamayı Tamamla" ile yeniden onaylayın.',
        confirmText: 'Yine de devam et',
      });
      if (!ok) return;
    }

    // Excel indirimi (sadece onayli layer'lar)
    if (approvedLayers.length > 0) {
      try {
        const sheets = buildExcelSheets(approvedLayers);
        const result = await exportMetrajToExcel(sheets, fileName);
        if (result.success) {
          toast({
            title: 'Excel olusturuldu',
            description: `${result.sheetCount} layer · ${result.totalItems} satir`,
          });
        }
      } catch (e: any) {
        console.error('[handleConfirmAll] Excel hatasi:', e);
        toast({ title: 'Excel hatasi', description: String(e?.message ?? e), variant: 'destructive' });
      }
    }

    // FinalMetraj sadece ONAYLI layer'lardan kurulur — onaysizlar dahil degil
    const layers = approvedLayers;

    const finalMetraj: MetrajResult = {
      layers: layers.map((cl) => ({
        layer: cl.hatIsmi || cl.layer,
        length: cl.totalLength,
        line_count: cl.edgeSegments.length,
        hat_tipi: cl.hatIsmi || cl.layer,
        segments: cl.edgeSegments.map((es) => ({
          segment_id: es.segment_id,
          layer: cl.hatIsmi || cl.layer,
          length: es.length,
          line_count: 1,
          material_type: cl.materialType,
          diameter: es.diameter,
        })),
      })),
      total_length: layers.reduce((sum, cl) => sum + cl.totalLength, 0),
      total_layers: layers.length,
      warnings: [],
    };

    onApproved(finalMetraj, fileName);
    // UX #4: final sonrasi etiketleme ekrani da sifirlansin
    clearActiveBucket();
    // PRD §5: Save sonrasi viewer'da cap renkleri kaldirilir, layer orijinal
    // ACI rengine donulur. calculatedLayers state'i SAKLI tutulur (kullanici
    // dondukten sonra cap duzeltmesi yapabilsin). Sadece RENDER bayragi false.
    restoreOriginalColors();
    // Cap-renkleri legend navigation halo'su da kapansin — kaydet sonrasi cizim
    // orijinal goruntuye doner, halo'nun kalmasi gorsel kirlilik olur.
    handleClearActiveDiameter();
  };

  /** "Onceki calismaniz geri yuklendi" bandi kapatildi mi? (oturumluk) */
  const [geriYuklemeBandiKapali, setGeriYuklemeBandiKapali] = useState(false);
  const geriYuklemeBandi = restoredWork.layers > 0 && !geriYuklemeBandiKapali;

  /** Bu dosyanin kayitli calismasini sil — GERI DONUSU YOK, onay sart. */
  const handleResetThisFile = async () => {
    // ⚠ SAYIM GUNCEL DURUMDAN: `restoredWork` mount anindaki fotograftir.
    // Kullanici bu oturumda yeni layer hesapladiysa onay penceresi SILINECEK
    // isi EKSIK gosterirdi ("1 layer silinecek" deyip 4 layer silmek).
    const silinecekLayer = Object.keys(state.calculatedLayers).length;
    const ok = await confirm({
      title: 'Bu dosyanın kayıtlı çalışması silinsin mi?',
      description:
        `${silinecekLayer} hesaplanmış layer (çap etiketleriyle birlikte) silinecek, çizim sıfırdan başlayacak. ` +
        'Bu işlemin geri dönüşü yoktur (kayıt yalnız bu tarayıcıda tutulur). Diğer projeleriniz etkilenmez.',
      confirmText: 'Sıfırla',
    });
    if (!ok) return;
    resetFileState();
    clearActiveBucket();
    // "Sifirdan baslar" sozu SILGI icin de gecerli olmali — silinen cizgiler
    // workspace state'inde DEGIL, bu bilesenin kendi state'inde yasiyor.
    setHiddenLineKeys(new Set());
    setHiddenInsertKeys(new Set());
    setHiddenTextKeys(new Set());
    setPendingErase(null);
    setEraseHistory([]);
    setGeriYuklemeBandiKapali(true);
    toast({ title: 'Sıfırlandı', description: `${fileName} — temiz başlangıç.` });
  };

  return (
    <div>
      {/* Ust bar */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Proje: {fileName}</h3>
          <p className="text-xs text-muted-foreground">
            {Object.keys(state.calculatedLayers).length} layer hesaplandı ·{' '}
            {Object.values(state.calculatedLayers).filter((l) => l.approved).length} onaylı
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Final buton: en az 1 onayli layer varsa enabled */}
          <button
            onClick={handleConfirmAll}
            disabled={!Object.values(state.calculatedLayers).some((l) => l.approved)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
            title="Excel olustur + fiyatlandirmaya gec (sadece onayli layer'lar dahil)"
          >
            Tümünü Onayla & Fiyatlandırmaya Geç
          </button>
          <button
            onClick={onReset}
            className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-slate-50"
          >
            Yeni DWG Yükle
          </button>
        </div>
      </div>

      {/* BIRIM DEGISTI BANDI — kayitli metraj FARKLI cizim birimiyle
          hesaplanmisti, bu yuzden YUKLENMEDI. Sessizce silmek de sessizce
          10x farkla karistirmak kadar kotudur; ne oldugu YAZILIR. */}
      {birimDegisimi && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
          <span className="text-xs text-red-900">
            <strong>Çizim birimi değişti</strong> — bu dosyanın kayıtlı{' '}
            {birimDegisimi.dusenLayer} hesaplanmış layer&apos;ı{' '}
            <strong>{BIRIM_ADI(birimDegisimi.eskiScale)}</strong> ile üretilmişti, şimdi{' '}
            <strong>{BIRIM_ADI(birimDegisimi.yeniScale)}</strong> kullanılıyor. Eski metrajlar
            geçersiz olduğu için yüklenmedi — layer&apos;ları yeniden hesaplayın.
            (Etiketleme ve görünürlük tercihleriniz korundu.)
          </span>
        </div>
      )}

      {/* GERI YUKLEME BANDI — bu geri yukleme bugune kadar SESSIZDI: kullanici
          ayni dosyayi tekrar yukluyor, ekrana onceki calismasi geliyor ve
          "yeni yukledim ama segmentlerine ayiramiyorum" diye yasiyordu
          (onayli layer'lar icin "Segmentlerine Ayir" dugmesi hic cikmaz).
          Artik ne oldugu YAZIYOR ve iki cikis birden veriliyor. */}
      {geriYuklemeBandi && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="text-xs text-amber-900">
            <strong>Bu dosya daha önce yüklenmişti</strong> — önceki çalışmanız geri yüklendi:{' '}
            {restoredWork.layers} layer hesaplanmış
            {restoredWork.approved > 0 && <> · {restoredWork.approved} onaylı</>}.
            {restoredWork.approved > 0 && (
              <> Revize etmek için ilgili layer&apos;ın <strong>onayını kaldırın</strong> — segmentler geri gelir.</>
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleResetThisFile}
              className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
              title="Bu dosyanın kayıtlı çalışmasını sil, sıfırdan başla (geri dönüşü yok)"
            >
              Bu dosyayı sıfırla
            </button>
            <button
              onClick={() => setGeriYuklemeBandiKapali(true)}
              className="text-[11px] text-amber-700 hover:underline"
            >
              Tamam
            </button>
          </div>
        </div>
      )}

      {/* Ana grid: sol buyuk cizim + sag panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-3">
        {/* Sol: Canvas2D Viewer */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <DxfCanvasViewer
            fileId={fileId}
            calculatedEdgesByLayer={calculatedEdgesByLayer}
            calculatedJunctionsByLayer={calculatedJunctionsByLayer}
            selectedLayer={state.selectedLayer}
            sprinklerLayers={sprinklerLayersSet}
            onLineClick={handleLineClick}
            onInsertClick={handleInsertClick}
            onCircleClick={handleCircleClick}
            onSegmentClick={(seg) => {
              // TIKLA-ETIKETLE (UX #2 toggle mantigi):
              //  - Ayni cap zaten atanmissa  → SIL (capsiz/neon'a don) = geri alma
              //  - Farkli veya bos ise       → aktif kalemin capini yaz = uzerine yazma
              // Kalem yokken: eski davranis (DiameterEditPopup).
              if (activeBucket) {
                const current = (seg.diameter || '').trim();
                const sameAsBucket =
                  !isUnassignedDiameter(current) &&
                  canonicalizeDiameter(current) === activeBucket.diameter;
                if (sameAsBucket) {
                  updateEdgeSegmentDiameter(seg.layer, seg.segment_id, '');
                  // Geri alma teyidi: NEON flash (capsiz durumunun rengi)
                  setTagFlash({ segmentId: seg.segment_id, color: '#39ff14', at: Date.now() });
                } else {
                  updateEdgeSegmentDiameter(seg.layer, seg.segment_id, activeBucket.diameter);
                  setTagFlash({ segmentId: seg.segment_id, color: activeBucket.color, at: Date.now() });
                }
              } else {
                setEditingSegment(seg);
              }
            }}
            onClearSelection={() => {
              // selectLayer ayni layer ile cagrilinca toggle off yapiyor
              if (state.selectedLayer) selectLayer(state.selectedLayer);
            }}
            onLayersAvailable={setAvailableLayers}
            hiddenLayers={hiddenLayersSet}
            dimmedLayers={dimmedLayersSet}
            scale={scale}
            // SILGI MODU props
            eraseMode={eraseMode}
            onToggleEraseMode={() => setEraseMode((v) => !v)}
            hiddenLineKeys={hiddenLineKeys}
            hiddenInsertKeys={hiddenInsertKeys}
            hiddenTextKeys={hiddenTextKeys}
            // Tek tik / marquee → pending'e ekler (henuz silmez); confirm gerekir
            onEraseEntities={(lines, inserts, texts) => handleSelectForErase(lines, inserts, texts)}
            onUndoErase={handleUndoErase}
            canUndoErase={eraseHistory.length > 0}
            onRestoreAllErased={handleRestoreAllErased}
            // PENDING ERASE — viewer turuncu highlight + sag-ust onay/iptal toolbar
            pendingLineKeys={pendingLineKeysSet}
            pendingInsertKeys={pendingInsertKeysSet}
            pendingTextKeys={pendingTextKeysSet}
            onConfirmPendingErase={handleConfirmErase}
            onCancelPendingErase={handleCancelPendingErase}
            // PRD §3 + §5: cap-bazli dinamik renk; save sonrasi false -> layer ACI
            useDiameterColors={useDiameterColors}
            // TIKLA-ETIKETLE: hover vurgusu aktif kalem rengine boyanir
            // (tiklamadan once hangi rengin atanacagi gorunur — izolasyon onizleme)
            activeTagColor={activeBucket?.color ?? null}
            // SEGMENT IZOLASYONU: tiklanan run ~900ms parlar (secim teyidi)
            flashSegment={tagFlash}
            // Cap renkleri legend tiklama navigation
            focusedSegmentId={focusedSegmentId}
            focusedHaloColor={focusedHaloColor}
            focusVersion={focusVersion}
            className="h-[600px] lg:h-[calc(100vh-150px)]"
          />

          {/* Ipucu */}
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-slate-500 mt-0.5" />
            <p className="text-[11px] text-slate-600">
              <strong>1. Hesapla:</strong> Layer seç + &quot;Hesapla&quot; → borular çıkar (hepsi <span className="font-semibold text-lime-600">neon = çapsız</span>).
              <strong className="ml-2">2. Etiketle:</strong> Çap Kalemi seç → çizimde boruya tıkla, çap atanır.
              <strong className="ml-2">Kalem yokken:</strong> tıklama çap popup&apos;ı açar.
            </p>
          </div>
        </div>

        {/* Sag: cap kalemleri + aktif layer formu + cap renk legend + ozet */}
        <div className="space-y-3">
          {/* MANUEL ETIKETLEME: cap kalemi tanimla -> sec -> boruya tikla.
              Rozet: capsiz (neon) segment sayisi. */}
          <BucketPanel
            unassignedCount={unassignedPendingCount}
            onApplyToUnassigned={applyBucketToUnassigned}
          />
          {/* PRD §3: Dinamik renk legend — cizimle birebir esles
              Cap satirina tikla -> o cap'in segment'leri arasinda cycle */}
          <DiameterLegendPanel
            calculatedLayers={pendingCalculatedLayers}
            diameterColorsActive={useDiameterColors}
            activeDiameter={activeDiameter}
            activeIndex={activeDiameter ? activeIndex : 0}
            activeCount={activeDiameterSegments.length}
            onDiameterClick={handleCycleDiameter}
            onClearActive={handleClearActiveDiameter}
          />
          <LayerInfoSidebar
            selectedLayer={state.selectedLayer}
            calculating={calculating || (!!state.selectedLayer && calculatingLayer === state.selectedLayer)}
            calculatedLayer={state.selectedLayer ? state.calculatedLayers[state.selectedLayer] ?? null : null}
            onCalculate={(layer) => {
              if (calculating || calculatingLayer === layer) {
                toast({ title: 'Devam eden hesaplama var', description: 'Bitince tekrar dene.', variant: 'destructive' });
                return;
              }
              if (state.calculatedLayers[layer]) {
                toast({ title: 'Zaten hesaplandi', description: layer });
                return;
              }
              // UX #4: yeni layer hesaplamasi TERTEMIZ baslar — onceki layer'in
              // aktif kalemi bulasmasin diye kalem deaktive edilir.
              clearActiveBucket();
              // "Segmentlerine Ayir" = SAF geometri+uzunluk cikarimi. Cap
              // atamasi YOK — segmentler capsiz (neon) gelir; hat ismi/malzeme
              // alanlari kaldirildi (UX #3), cap bilgisi Cap Kalemleri'nden.
              calculateLayer(layer);
            }}
            onComplete={async (layer) => {
              // UX #4: "Hesaplamayi Tamamla" — layer onaylanir, etiketleme
              // ekrani sifirlanir (aktif kalem + secim reset).
              const cl = state.calculatedLayers[layer];
              if (!cl) return;
              const empty = cl.edgeSegments.filter((es) => isUnassignedDiameter(es.diameter)).length;
              if (empty > 0) {
                const ok = await confirm({
                  title: `${empty} segment hâlâ çapsız`,
                  description: 'Çizimde neon görünüyor. Yine de bu layer tamamlansın mı?',
                  confirmText: 'Tamamla',
                });
                if (!ok) return;
              }
              approveLayer(layer);
              clearActiveBucket();
              if (state.selectedLayer === layer) selectLayer(layer); // toggle off — secim temizlenir
              toast({
                title: 'Layer tamamlandı ✓',
                description: `${layer} onaylandı. Etiketleme ekranı yeni layer için sıfırlandı.`,
              });
            }}
            onUnapprove={(layer) => revizyonaDon(layer)}
            onClearSelection={() => selectLayer(state.selectedLayer!)}
            onHideLayer={() => {
              if (!state.selectedLayer) return;
              const layer = state.selectedLayer;
              toggleLayerVisibility(layer);
              toast({ title: 'Layer gizlendi', description: layer });
              selectLayer(layer);
            }}
          />

          <LayerVisibilityPanel
            availableLayers={availableLayers}
            hiddenLayers={state.hiddenLayers}
            dimmedLayers={state.dimmedLayers}
            selectedLayer={state.selectedLayer}
            calculatedLayers={calculatedLayerNames}
            layerDiameters={layerDiametersMap}
            sprinklerLayers={state.sprinklerLayers}
            onToggle={toggleLayerVisibility}
            onToggleDimmed={toggleLayerDimmed}
            onToggleSprinkler={toggleSprinklerLayer}
            onShowAll={showAllLayers}
            onShowAllDimmed={showAllDimmed}
            onLayerSelect={(layer, _x, _y) => {
              // Layer panel'den layer adina tikla = SADECE sec.
              // tryChangeLayer onaysiz-hesaplama korumasi yapar.
              tryChangeLayer(layer);
            }}
          />

          <MetrajSummaryPanel
            calculatedLayers={state.calculatedLayers}
            onRemoveLayer={async (layer) => {
              // ⚠ YIKICI VE GERI DONUSU YOK: segmentler + TUM cap etiketleri
              // gider (yeniden hesaplamak sadece segmentleri geri getirir,
              // etiketleme emegini DEGIL). Onaysiz calisiyordu; revizyon
              // dugmesi bunun hemen ustune geldigi icin yanlis tikta
              // kullanicinin saatlerce sureni tek hamlede silinebilirdi.
              const cl = state.calculatedLayers[layer];
              const segment = cl?.edgeSegments.length ?? 0;
              const etiketli = cl?.edgeSegments.filter((es) => !isUnassignedDiameter(es.diameter)).length ?? 0;
              const ok = await confirm({
                title: `"${cl?.hatIsmi || layer}" hesaplaması silinsin mi?`,
                description:
                  `${segment} segment ve ${etiketli} çap etiketi silinecek. Geri dönüşü yok — ` +
                  'yeniden hesaplarsanız segmentler geri gelir ama çap etiketlerini tekrar yapmanız gerekir. ' +
                  'Sadece revize etmek istiyorsanız "Onayı Kaldır" yeterlidir.',
                confirmText: 'Sil',
              });
              if (!ok) return;
              removeCalculatedLayer(layer);
              toast({ title: 'Hesaplama silindi', description: layer });
            }}
            onApproveLayer={(layer) => {
              // UX #4: ozet panelinden onay da etiketleme ekranini sifirlar
              approveLayer(layer);
              clearActiveBucket();
            }}
            onUnapproveLayer={(layer) => revizyonaDon(layer)}
            onSelectLayerCard={(layer) => {
              // Hesaplanmis Metraj kartina tikla:
              //  - Layer onayli ise revizyona don (onay kalkar, segmentler doner)
              //  - Onaysiz ise sadece o layer'i calisilir hale getir
              // ⚠ `selectLayer` DEGIL `focusLayer`: kart tiklamasi bir toggle
              // degildir, "bu layer'da calis" demektir. Eskiden selectLayer
              // cagriliyordu ve layer zaten seciliyse secim kapaniyordu.
              const cl = state.calculatedLayers[layer];
              if (cl?.approved) {
                revizyonaDon(layer);
                return;
              }
              focusLayer(layer);
            }}
          />
        </div>
      </div>

      {/* Cap duzenleme popup (hesaplanmis segment) */}
      {editingSegment && (
        <DiameterEditPopup
          segment={editingSegment}
          onCancel={() => setEditingSegment(null)}
          onSave={(segmentId, newDiameter) => {
            // PRD §3: manuel cap ataminda AYNI LAYER'da endpoint paylasan
            // null komsulara da otomatik dagit (1-HOP). Hedef segmentin hangi
            // layer'a ait oldugunu bulup, sadece o layer'da propagation yap.
            let totalPropagated = 0;
            let hitLayer: string | null = null;
            for (const layer of Object.keys(state.calculatedLayers)) {
              const { target, propagated } = applyDiameterWithPropagation(layer, segmentId, newDiameter);
              if (target) {
                hitLayer = layer;
                totalPropagated = propagated;
                break;  // segment_id global unique; tek layer'da olur
              }
            }
            setEditingSegment(null);
            const desc = totalPropagated > 0
              ? `Segment #${segmentId}: ${newDiameter} · ${totalPropagated} komşuya yayıldı`
              : `Segment #${segmentId}: ${newDiameter}`;
            toast({ title: 'Çap güncellendi', description: desc });
            // Defensive: hicbir layer'da bulunamadiysa eski davranisi koru
            if (!hitLayer) {
              for (const layer of Object.keys(state.calculatedLayers)) {
                updateEdgeSegmentDiameter(layer, segmentId, newDiameter);
              }
            }
          }}
        />
      )}

    </div>
  );
}
