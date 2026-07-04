'use client';

/**
 * DWG Project Workspace — tek ekran MANUEL ETIKETLEME metraj akisi.
 * Sol: buyuk Canvas2D cizim | Sag: Cap Kalemleri + lejant + layer + ozet.
 *
 * Kullanici:
 *  - Layer secer → "Layer'i Segmentlerine Ayir" → borular capsiz (NEON) cikar
 *  - Cap Kalemi secer → boruya tiklar → cap atanir (ayni capa tekrar tik = geri al)
 *  - "Hesaplamayi Tamamla" → layer onaylanir, kalem/secim resetlenir
 *  - Ekipman (INSERT) noktasina tiklar → popup, ad+birim girer
 *  - Birden fazla layer + ekipman ekleye ekleye finale gider
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { DxfCanvasViewer } from '@/components/dwg-viewer';
import { DiameterEditPopup, type EdgeSegment } from '@/components/dwg-metraj';
import type { MetrajResult } from '@/components/dwg-metraj/types';
import LayerInfoSidebar from './LayerInfoSidebar';
import LayerVisibilityPanel from './LayerVisibilityPanel';
import MetrajSummaryPanel from './MetrajSummaryPanel';
import EquipmentDetailPopup from './EquipmentDetailPopup';
import { useWorkspaceState } from './useWorkspaceState';
import type { MarkedEquipment, CalculatedLayer } from './types';
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

export default function DwgProjectWorkspace({
  fileId, scale, fileName, fileHash = null, onReset, onApproved,
}: DwgProjectWorkspaceProps) {
  const {
    state,
    selectLayer,
    addCalculatedLayer, approveLayer, unapproveLayer, removeCalculatedLayer,
    updateEdgeSegmentDiameter,
    applyDiameterWithPropagation,
    beginEditEquipment, cancelEditEquipment, saveEquipment, removeEquipment,
    removeSprinklerLayer, toggleSprinklerLayer,
    toggleLayerVisibility, showAllLayers,
    toggleLayerDimmed, showAllDimmed,
  } = useWorkspaceState(fileId, scale, fileHash);

  /** Geometry'den cikan layer isimleri — DxfCanvasViewer onLayersAvailable
   *  callback'inden gelir. Layer goruntusu paneli icin kullanilir. */
  const [availableLayers, setAvailableLayers] = useState<string[]>([]);
  const hiddenLayersSet = useMemo(() => new Set(state.hiddenLayers), [state.hiddenLayers]);
  const dimmedLayersSet = useMemo(() => new Set(state.dimmedLayers), [state.dimmedLayers]);

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
  const [pendingEquipment, setPendingEquipment] = useState<null | {
    key: string; insertIndex: number; layer: string; insertName: string; position: [number, number];
  }>(null);

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

      if (pendingEquipment) { setPendingEquipment(null); return; }
      if (state.editingEquipmentKey) { cancelEditEquipment(); return; }
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
  }, [pendingEquipment, state.editingEquipmentKey, editingSegment, state.selectedLayer, hideMode, eraseMode, eraseHistory.length, pendingErase, activeDiameter, cancelEditEquipment, selectLayer, handleUndoErase, handleConfirmErase, handleCancelPendingErase, handleClearActiveDiameter]);

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
  const calculatedEdgesByLayer = useMemo(() => {
    const map: Record<string, EdgeSegment[]> = {};
    for (const [layer, cl] of Object.entries(state.calculatedLayers)) {
      if (cl.approved) continue;  // onayli -> cap renksiz, orijinal
      map[layer] = cl.edgeSegments;
    }
    return map;
  }, [state.calculatedLayers]);

  const calculatedJunctionsByLayer = useMemo(() => {
    const map: Record<string, [number, number][]> = {};
    for (const [layer, cl] of Object.entries(state.calculatedLayers)) {
      if (cl.approved) continue;  // onayli -> T-junction marker da kapali
      if (cl.junctionPoints && cl.junctionPoints.length > 0) {
        map[layer] = cl.junctionPoints;
      }
    }
    return map;
  }, [state.calculatedLayers]);

  const markedEquipmentKeys = useMemo(
    () => new Set(Object.keys(state.markedEquipments)),
    [state.markedEquipments]
  );

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

  const handleLineClick = (line: { layer: string; index: number; shiftKey: boolean; screenX: number; screenY: number }) => {
    // LINE click -> SADECE layer secimi. Hesaplama "Hesapla" butonuyla manuel
    // tetiklenir (LayerInfoSidebar'da).
    console.log('[handleLineClick] FIRED', { layer: line.layer });
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

  const handleInsertClick = (ins: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => {
    // EKIPMAN AKISI SIMDILIK KAPALI. INSERT'in layer'ini sec.
    tryChangeLayer(ins.layer);
  };

  const handleCircleClick = (_c: { layer: string; circleIndex: number; center: [number, number]; radius: number }) => {
    // Sprinkler/sembol isaretleme LayerVisibilityPanel damla ikonuyla yapilir.
    // CIRCLE tik su an no-op.
  };

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
    const equipments = Object.values(state.markedEquipments);

    if (approvedLayers.length === 0 && equipments.length === 0) {
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
      const ok = window.confirm(
        `${unassignedInApproved} boru parçasının çapı hâlâ atanmamış (çizimde neon).\n` +
        'Bunlar Excel/fiyatlandırmada "Belirtilmemis" olarak görünecek.\n\nYine de devam edilsin mi?',
      );
      if (!ok) return;
    }

    // Onaylanmamis layer kalmis mi? Uyari ver ama bloklamadan devam (kullanici karari)
    const pendingCount = allLayers.length - approvedLayers.length;
    if (pendingCount > 0) {
      toast({
        title: `${pendingCount} layer hala onaylanmadi`,
        description: 'Onaysiz layer\'lar Excel\'e ve fiyatlandirmaya DAHIL EDILMEYECEK.',
      });
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

    // Ekipmanlari ayni isim+marka+birim ile grupla — adet topla, fiyatlandir
    type EqGroup = {
      label: string;
      brandName: string | null;
      unit: string;
      unitPrice: number | null;
      specs: Record<string, string> | null;
      libraryItemId: string | null;
      layer: string;
      count: number;
    };
    const eqGroups: Record<string, EqGroup> = {};
    for (const eq of equipments) {
      const k = `${eq.libraryItemId ?? eq.userLabel}__${eq.unit}`;
      if (!eqGroups[k]) {
        eqGroups[k] = {
          label: eq.userLabel,
          brandName: eq.brandName ?? null,
          unit: eq.unit,
          unitPrice: eq.unitPrice ?? null,
          specs: eq.specs ?? null,
          libraryItemId: eq.libraryItemId ?? null,
          layer: eq.layer,
          count: 0,
        };
      }
      eqGroups[k].count += 1;
    }

    // (1) Structured equipments — quotes/Excel/PDF için
    finalMetraj.equipments = Object.values(eqGroups).map((g) => ({
      name: g.label,
      brandName: g.brandName,
      unit: g.unit,
      quantity: g.count,
      unitPrice: g.unitPrice,
      totalPrice: g.unitPrice != null ? g.unitPrice * g.count : null,
      specs: g.specs,
      layer: g.layer,
      libraryItemId: g.libraryItemId,
    }));

    // (2) Legacy fake-layer satırı — mevcut MetrajTable görünümü için
    //     material_type'a marka + specs özetini koy ki tabloda görünsün
    for (const g of Object.values(eqGroups)) {
      const specsSummary = g.specs && Object.keys(g.specs).length > 0
        ? Object.entries(g.specs).map(([k, v]) => `${k}:${v}`).join(', ')
        : '';
      const matType = [
        `Ekipman · ${g.unit}`,
        g.brandName && `(${g.brandName})`,
        specsSummary && `[${specsSummary}]`,
      ].filter(Boolean).join(' ');
      finalMetraj.layers.push({
        layer: g.label,
        length: g.count,
        line_count: g.count,
        hat_tipi: g.label,
        segments: [{
          segment_id: 0,
          layer: g.label,
          length: g.count,
          line_count: g.count,
          material_type: matType,
          diameter: g.unitPrice != null ? `₺${g.unitPrice.toFixed(2)}/${g.unit}` : '',
        }],
      });
    }

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

  const editingEquipmentExisting = state.editingEquipmentKey
    ? state.markedEquipments[state.editingEquipmentKey]
    : undefined;

  return (
    <div>
      {/* Ust bar */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Proje: {fileName}</h3>
          <p className="text-xs text-muted-foreground">
            {Object.keys(state.calculatedLayers).length} layer hesaplandı ·{' '}
            {Object.values(state.calculatedLayers).filter((l) => l.approved).length} onaylı ·{' '}
            {Object.keys(state.markedEquipments).length} ekipman işaretli
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

      {/* Ana grid: sol buyuk cizim + sag panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-3">
        {/* Sol: Canvas2D Viewer */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <DxfCanvasViewer
            fileId={fileId}
            calculatedEdgesByLayer={calculatedEdgesByLayer}
            calculatedJunctionsByLayer={calculatedJunctionsByLayer}
            selectedLayer={state.selectedLayer}
            markedEquipmentKeys={markedEquipmentKeys}
            sprinklerLayers={new Set(state.sprinklerLayers)}
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
              <strong className="ml-2">Ekipman:</strong> Noktaya tıkla → ad + birim gir.
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
            onComplete={(layer) => {
              // UX #4: "Hesaplamayi Tamamla" — layer onaylanir, etiketleme
              // ekrani sifirlanir (aktif kalem + secim reset).
              const cl = state.calculatedLayers[layer];
              if (!cl) return;
              const empty = cl.edgeSegments.filter((es) => isUnassignedDiameter(es.diameter)).length;
              if (empty > 0) {
                const ok = window.confirm(
                  `${empty} segment hâlâ çapsız (çizimde neon).\nYine de bu layer tamamlansın mı?`,
                );
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
            markedEquipments={state.markedEquipments}
            onRemoveLayer={removeCalculatedLayer}
            onRemoveEquipment={removeEquipment}
            onEditEquipment={(key) => {
              const eq = state.markedEquipments[key];
              if (eq) {
                setPendingEquipment({
                  key: eq.key,
                  insertIndex: eq.insertIndex,
                  layer: eq.layer,
                  insertName: eq.insertName,
                  position: eq.position,
                });
                beginEditEquipment(key);
              }
            }}
            onApproveLayer={(layer) => {
              // UX #4: ozet panelinden onay da etiketleme ekranini sifirlar
              approveLayer(layer);
              clearActiveBucket();
            }}
            onSelectLayerCard={(layer) => {
              // Hesaplanmis Metraj kartina tikla:
              //  - Layer onayli ise onayi kaldir (revize moduna gec, cap renkleri donsun)
              //  - tryChangeLayer guard'indan gec (mevcut onaysiz layer varsa uyari)
              const cl = state.calculatedLayers[layer];
              if (cl?.approved) {
                unapproveLayer(layer);
              }
              // Onaysizlasinca tryChangeLayer (selectedLayer'da onaysiz mevcut var mi)
              // mantigini bozmamak icin direkt selectLayer cagiriyoruz: bu layer'in
              // kendisi zaten artik "onaysiz" durumda ve seciliyor.
              selectLayer(layer);
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

      {/* Ekipman popup */}
      {pendingEquipment && state.editingEquipmentKey && (
        <EquipmentDetailPopup
          pending={pendingEquipment}
          existing={editingEquipmentExisting}
          onCancel={() => { cancelEditEquipment(); setPendingEquipment(null); }}
          onSave={(eq) => {
            saveEquipment(eq);
            setPendingEquipment(null);
            toast({ title: 'Ekipman kaydedildi', description: `${eq.userLabel} (${eq.unit})` });
          }}
          onDelete={editingEquipmentExisting ? () => {
            removeEquipment(editingEquipmentExisting.key);
            setPendingEquipment(null);
          } : undefined}
        />
      )}
    </div>
  );
}
