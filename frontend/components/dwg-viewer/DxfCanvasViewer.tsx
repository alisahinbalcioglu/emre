'use client';

/**
 * DWG Viewer — native HTML5 Canvas2D rendering.
 *
 * Mimari:
 *   - HTML <canvas> + 2d context
 *   - useViewport pan/zoom state (native wheel listener)
 *   - Y-flip transform: canvas Y-asagi, DWG Y-yukari → ctx.scale(zoom, -zoom)
 *   - Adaptive grid (log10 step) + viewport culling + selection glow
 *   - Per-layer batched stroke (single beginPath + multi moveTo/lineTo + stroke)
 *   - rbush spatial index: 26K+ cizgide hover/click O(log N)
 *   - Hover overlay: cursor pointer + glow
 *   - Per-line selection + tooltip (layer + uzunluk)
 *
 * Layer durumlari (her biri bagimsiz):
 *   - hidden:  hic cizilmez, hit-test'te atlanır
 *   - dimmed:  %25 opacity gri, hit-test'te atlanır (referans)
 *   - normal:  ACI renkli, etkilesime acik
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RBush from 'rbush';
import { Loader2, AlertCircle, ZoomIn, ZoomOut, Maximize2, Eraser, Undo2, RotateCcw, Check, X } from 'lucide-react';
import api from '@/lib/api';
import type { GeometryResult } from './types';
import type { EdgeSegment } from '@/components/dwg-metraj/types';
import { diameterToColor } from '@/components/dwg-metraj/diameter-colors';
import { isUnassignedDiameter, UNASSIGNED_LABEL } from '@/components/dwg-metraj/constants';
import { resolveHoverLength } from './segment-length';
import { useViewport } from './useViewport';
import { aciToColor } from './aci-colors';

interface DxfCanvasViewerProps {
  fileId: string | null;
  selectedLayers?: string[];
  edgeSegments?: EdgeSegment[];
  calculatedEdgesByLayer?: Record<string, EdgeSegment[]>;
  /** Layer adi -> T-junction noktalari ([x,y] listesi). Canvas2D'de marker olarak cizilir. */
  calculatedJunctionsByLayer?: Record<string, [number, number][]>;
  selectedLayer?: string | null;
  markedEquipmentKeys?: Set<string>;
  onSegmentClick?: (segment: EdgeSegment) => void;
  onLineClick?: (line: { layer: string; index: number; shiftKey: boolean; screenX: number; screenY: number }) => void;
  onInsertClick?: (insert: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => void;
  onCircleClick?: (circle: { layer: string; circleIndex: number; center: [number, number]; radius: number }) => void;
  sprinklerLayers?: Set<string>;
  highlightLayer?: string;
  className?: string;
  onClearSelection?: () => void;
  onLayersAvailable?: (layers: string[]) => void;
  hiddenLayers?: Set<string>;
  dimmedLayers?: Set<string>;
  /** Birim donusturucu (DWG birimi → metre). mm=0.001, cm=0.01, m=1.0. Tooltip uzunluk hesabi icin. */
  scale?: number;
  // ── SILGI MODU (AutoCAD-style erase) ──────────────────────────────
  /** Silgi modu aktif mi? Toolbar button toggle. */
  eraseMode?: boolean;
  onToggleEraseMode?: () => void;
  /** Hidden LINE key set — "x1,y1,x2,y2" (round 1dp). Render skip eder. */
  hiddenLineKeys?: Set<string>;
  /** Hidden INSERT index set. Render skip eder. */
  hiddenInsertKeys?: Set<number>;
  /** Hidden TEXT index set (geometry.texts array index). Render skip eder. */
  hiddenTextKeys?: Set<number>;
  /** Hesaplanmis edge segment'leri cap-bazli renklerle (true, default) ya da
   *  layer orijinal ACI rengiyle (false) ciz. PRD §5: save sonrasi false. */
  useDiameterColors?: boolean;
  /** Silgi mod aktif iken tik veya marquee → bu callback'le hidden'a ekleme yapilir.
   *  textIndices: geometry.texts[] array index'leri. */
  onEraseEntities?: (lineKeys: string[], insertIndices: number[], textIndices: number[]) => void;
  /** Undo button — son silmeyi geri al. */
  onUndoErase?: () => void;
  canUndoErase?: boolean;
  /** "Tumunu Geri Getir" — tum hidden'lari temizle. */
  onRestoreAllErased?: () => void;
  // ── PENDING ERASE (AutoCAD-style sec-onayla-sil) ──────────────────
  /** Tikla/marquee ile secilmis ama henuz silinmemis LINE'lar. Turuncu highlight. */
  pendingLineKeys?: Set<string>;
  /** Pending INSERT index seti. Turuncu highlight. */
  pendingInsertKeys?: Set<number>;
  /** Pending TEXT index seti. Turuncu highlight. */
  pendingTextKeys?: Set<number>;
  /** Enter / "Sil" butonu → pending'i hidden'a aktar. */
  onConfirmPendingErase?: () => void;
  /** Esc / "Iptal" butonu → pending'i temizle. */
  onCancelPendingErase?: () => void;
  // ── CAP RENKLERI LISTE NAVIGATION (focus segment) ─────────────────
  /** Legend'dan cap satirina tiklandiginda secilen segment'in id'si.
   *  Set ise: viewport o segmente zoom yapilir + uzerine kalin halo cizilir. */
  focusedSegmentId?: number | null;
  /** Halo rengi (cap rengi). null ise sari/vurgu rengi kullanir. */
  focusedHaloColor?: string | null;
  /** Ayni segment'e art arda tiklayinca zoom + flash tekrari icin token.
   *  Parent her tiklamada increment eder; bu sayede ayni segmentId'de bile
   *  effect yeniden tetiklenir. */
  focusVersion?: number;
  // ── MANUEL ETIKETLEME (tikla-etiketle) ────────────────────────────
  /** Aktif cap kaleminin rengi. Set ise edge hover vurgusu bu renge boyanir —
   *  kullanici tiklamadan ONCE hangi rengin atanacagini gorur (izolasyon
   *  onizleme: run'in uc noktalari da ayni renkte isaretlenir). */
  activeTagColor?: string | null;
  /** SEGMENT IZOLASYONU teyidi: tiklanan run ~900ms kalem rengiyle parlar,
   *  uc noktalari (T-noktalari arasi sinir) vurgulanir. */
  flashSegment?: { segmentId: number; color: string; at: number } | null;
}

const COLOR_BG = '#0b1220';
const COLOR_PASSIVE = '#94a3b8';
const COLOR_SELECTED = '#60a5fa';
const COLOR_TEXT = '#fbbf24';
const COLOR_SPRINKLER = '#22d3ee';
const COLOR_MARKED_EQUIPMENT = '#f97316';
const COLOR_DIMMED = '#475569';            // slate-600
const COLOR_HOVER = '#fde68a';             // amber-200 glow
const COLOR_LINE_SELECTED = '#3b82f6';     // brand blue
/** EKSIK PARCA TESPITI: capsiz segment NEON — koyu zeminde bagirir,
 *  rapor oncesi gozden kacan boru kalmaz (diameter-colors ile senkron). */
const COLOR_UNASSIGNED_NEON = '#39ff14';
const DIMMED_ALPHA = 0.45;
const HOVER_TOL_PX = 6;

interface SpatialEntry {
  minX: number; minY: number; maxX: number; maxY: number;
  type: 'line' | 'edge';
  layer: string;
  /** geometry.lines[] icindeki index ya da edgeSegments[] icindeki index */
  index: number;
  coords: [number, number, number, number];
  polyline?: Array<[number, number]>;
  /** Sadece type='edge' icin: backend'in hesapladigi metre uzunluk (tooltip). */
  length?: number;
  // NOT: diameter/isInherited BILEREK index'te tutulmaz — cap her tiklamada
  // degisir; index'te olsa ya stale kalir ya da 700K'lik agac her tiklamada
  // yeniden kurulur (OOM). Hover aninda allEdgeSegments'ten canli okunur.
}

interface HoveredEntity {
  type: 'line' | 'edge';
  layer: string;
  index: number;
  coords: [number, number, number, number];
  polyline?: Array<[number, number]>;
  /** Metre cinsinden hesaplanmis uzunluk (scale uygulanmis). */
  length: number;
  /** Sadece edge tipi icin: cap ve BFS miras durumu */
  diameter?: string;
  isInherited?: boolean;
}

export default function DxfCanvasViewer({
  fileId,
  edgeSegments,
  calculatedEdgesByLayer,
  calculatedJunctionsByLayer,
  selectedLayer,
  markedEquipmentKeys,
  onSegmentClick,
  onLineClick,
  onInsertClick,
  onCircleClick,
  sprinklerLayers,
  highlightLayer,
  className = '',
  onClearSelection,
  onLayersAvailable,
  hiddenLayers,
  dimmedLayers,
  scale = 0.001,
  eraseMode = false,
  onToggleEraseMode,
  hiddenLineKeys,
  hiddenInsertKeys,
  onEraseEntities,
  onUndoErase,
  canUndoErase = false,
  onRestoreAllErased,
  hiddenTextKeys,
  pendingLineKeys,
  pendingInsertKeys,
  pendingTextKeys,
  onConfirmPendingErase,
  onCancelPendingErase,
  useDiameterColors = true,
  focusedSegmentId = null,
  focusedHaloColor = null,
  focusVersion = 0,
  activeTagColor = null,
  flashSegment = null,
}: DxfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [geometry, setGeometry] = useState<GeometryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<HoveredEntity | null>(null);
  const [selectedLine, setSelectedLine] = useState<HoveredEntity | null>(null);

  // TAG FLASH temizligi: flash 900ms gorunur; suresi dolunca bir kez redraw
  // tetikle ki parlaklik ekrandan silinsin (draw loop surekli calismiyor).
  const [flashTick, setFlashTick] = useState(0);
  useEffect(() => {
    if (!flashSegment) return;
    const t = setTimeout(() => setFlashTick((v) => v + 1), 950);
    return () => clearTimeout(t);
  }, [flashSegment]);

  // ── SILGI MODU state ──────────────────────────────────────────
  /** Marquee selection box (screen coords). Drag sirasinda guncellenir. */
  const [marquee, setMarquee] = useState<{ sx1: number; sy1: number; sx2: number; sy2: number } | null>(null);

  /** LINE coords → kararli string key. 1dp precision (0.1mm). Render skip + erase eslesme icin. */
  const computeLineKey = useCallback((coords: [number, number, number, number]): string => {
    const [x1, y1, x2, y2] = coords;
    return `${x1.toFixed(1)},${y1.toFixed(1)},${x2.toFixed(1)},${y2.toFixed(1)}`;
  }, []);

  const isLineHidden = useCallback(
    (coords: [number, number, number, number]): boolean => {
      if (!hiddenLineKeys || hiddenLineKeys.size === 0) return false;
      return hiddenLineKeys.has(computeLineKey(coords));
    },
    [hiddenLineKeys, computeLineKey],
  );

  const isInsertHidden = useCallback(
    (insertIndex: number): boolean => {
      if (!hiddenInsertKeys || hiddenInsertKeys.size === 0) return false;
      return hiddenInsertKeys.has(insertIndex);
    },
    [hiddenInsertKeys],
  );

  const isLinePending = useCallback(
    (coords: [number, number, number, number]): boolean => {
      if (!pendingLineKeys || pendingLineKeys.size === 0) return false;
      return pendingLineKeys.has(computeLineKey(coords));
    },
    [pendingLineKeys, computeLineKey],
  );

  const isInsertPending = useCallback(
    (insertIndex: number): boolean => {
      if (!pendingInsertKeys || pendingInsertKeys.size === 0) return false;
      return pendingInsertKeys.has(insertIndex);
    },
    [pendingInsertKeys],
  );

  const isTextHidden = useCallback(
    (textIndex: number): boolean => {
      if (!hiddenTextKeys || hiddenTextKeys.size === 0) return false;
      return hiddenTextKeys.has(textIndex);
    },
    [hiddenTextKeys],
  );

  const isTextPending = useCallback(
    (textIndex: number): boolean => {
      if (!pendingTextKeys || pendingTextKeys.size === 0) return false;
      return pendingTextKeys.has(textIndex);
    },
    [pendingTextKeys],
  );

  const pendingCount = (pendingLineKeys?.size ?? 0) + (pendingInsertKeys?.size ?? 0) + (pendingTextKeys?.size ?? 0);

  // Hesaplanmis tum edge segment'leri tek bir array'e flatten et.
  // edgeSegments prop'u verilirse onu, yoksa calculatedEdgesByLayer'daki tum
  // layer'larin segment'lerini birlestir. Boylece render path + spatial index
  // + bounds tek bir kaynak kullanir.
  const allEdgeSegments = useMemo<EdgeSegment[] | null>(() => {
    if (edgeSegments && edgeSegments.length > 0) return edgeSegments;
    if (calculatedEdgesByLayer) {
      const flat = Object.values(calculatedEdgesByLayer).flat();
      if (flat.length > 0) return flat;
    }
    return null;
  }, [edgeSegments, calculatedEdgesByLayer]);

  // Bounds (DWG world)
  const bounds = useMemo<[number, number, number, number]>(() => {
    if (allEdgeSegments && allEdgeSegments.length > 0) {
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const es of allEdgeSegments) {
        const [x1, y1, x2, y2] = es.coords;
        if (x1 < mnx) mnx = x1; if (y1 < mny) mny = y1;
        if (x2 < mnx) mnx = x2; if (y2 < mny) mny = y2;
        if (x1 > mxx) mxx = x1; if (y1 > mxy) mxy = y1;
        if (x2 > mxx) mxx = x2; if (y2 > mxy) mxy = y2;
      }
      return [mnx, mny, mxx, mxy];
    }
    if (geometry?.bounds) return geometry.bounds;
    return [0, 0, 100, 100];
  }, [geometry, allEdgeSegments]);

  const { viewport, fitView, zoomToBounds, zoomIn, zoomOut, wasDragged, isDragging, pointerHandlers } = useViewport({
    bounds,
    containerRef,
    autoFit: !!geometry || !!allEdgeSegments,
    // KAMERA KILIDI: dosya basina TEK otomatik fit. Onay/hesaplama/etiketleme
    // bounds'u degistirse bile kamera kullanicinin biraktigi yerde kalir.
    fitKey: fileId,
  });

  // ─── Focus segment: cap-renkleri legend'dan tiklanan segment'e zoom + halo ─
  // Halo'yu kisa bir pulse animasyonu icin RAF tabanli alpha state'i tutuyoruz.
  // focusVersion her tiklamada increment olur → ayni segment'e bile zoom+flash tetikler.
  const focusedSegment = useMemo<EdgeSegment | null>(() => {
    if (focusedSegmentId == null || !allEdgeSegments) return null;
    return allEdgeSegments.find((s) => s.segment_id === focusedSegmentId) ?? null;
  }, [focusedSegmentId, allEdgeSegments]);

  useEffect(() => {
    if (!focusedSegment) return;
    // Segment'in dunya bounds'u (polyline varsa tum vertex'ler, yoksa coords)
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    const pts: Array<[number, number]> =
      focusedSegment.polyline && focusedSegment.polyline.length >= 2
        ? focusedSegment.polyline
        : [
            [focusedSegment.coords[0], focusedSegment.coords[1]],
            [focusedSegment.coords[2], focusedSegment.coords[3]],
          ];
    for (const [px, py] of pts) {
      if (px < mnx) mnx = px;
      if (py < mny) mny = py;
      if (px > mxx) mxx = px;
      if (py > mxy) mxy = py;
    }
    // Segment'in etrafina padding ekle ki cevre context gozuksun.
    // Kullanici talimati: 2. fotograftaki gibi yakin zoom — segment + cap text'leri
    // net okunabilir olmali, uzak alan degil. Min padding 150mm (15cm) yeterli;
    // 500mm cok uzak goruntu veriyor (kucuk Ø20 segment'inde ekran 1m+ alani gosteriyor).
    const w = mxx - mnx;
    const h = mxy - mny;
    const padX = Math.max(w * 0.3, 150);
    const padY = Math.max(h * 0.3, 150);
    // Fill oranini %85 -> %95: ekran neredeyse tam kapla, kenar bosluklarini azalt
    zoomToBounds([mnx - padX, mny - padY, mxx + padX, mxy + padY], 0.95);
  }, [focusedSegment, focusVersion, zoomToBounds]);

  // ─── Geometry fetch + retry (Render free tier cold-start) ─────────
  useEffect(() => {
    if (!fileId || edgeSegments) {
      setGeometry(null);
      return;
    }
    let cancelled = false;
    const RETRY_DELAYS = [2000, 5000, 10000, 20000, 40000];
    setLoading(true);
    setError(null);

    const isTransient = (e: any): boolean => {
      const status = e?.response?.status;
      // 5xx cold-start / overload — retry mantikli
      if (status === 503 || status === 502 || status === 504 || status === 500) return true;
      if (status === 429) return true;
      // 422: 'file_id bilinmiyor (cache TTL gecmis olabilir)' — Cloud Run revision
      // switch'i veya 15dk TTL sonrasi. file_id bir daha asla geri gelmeyecek,
      // retry anlamsiz. Hemen hata goster, kullanici resetlesin.
      // 404: file_id tamamen bilinmiyor — ayni
      if (status === 422 || status === 404) return false;
      const code = e?.code;
      if (code === 'ECONNABORTED' || code === 'ERR_NETWORK') return true;
      if (!e?.response) return true;
      return false;
    };

    (async () => {
      let lastErr: any = null;
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        if (cancelled) return;
        try {
          const res = await api.get<GeometryResult>(`/dwg-engine/geometry/${fileId}`);
          if (cancelled) return;
          setGeometry(res.data);
          setLoading(false);
          const layerNames = Object.keys(res.data.layer_colors ?? {});
          if (layerNames.length > 0) onLayersAvailable?.(layerNames);
          return;
        } catch (e: any) {
          lastErr = e;
          if (!isTransient(e)) break;
          if (attempt >= RETRY_DELAYS.length) break;
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        }
      }
      if (!cancelled) {
        const status = lastErr?.response?.status;
        let msg: string;
        if (status === 422 || status === 404) {
          // Cache TTL gecti / deploy oldu — DWG'yi yeniden yuklemek gerekli.
          // Kullaniciya net aksiyon: "Yeni DWG Yukle" butonu zaten ust toolbar'da.
          msg = 'Oturum sona erdi (sunucu file_id\'yi unutmus). Lutfen "Yeni DWG Yukle" butonuna basip dosyayi tekrar yukleyin.';
        } else if (status) {
          msg = `${status}: Servis cevap vermedi (Render free tier cold-start). Sayfayi yenile.`;
        } else {
          msg = lastErr?.message ?? 'Geometri alinamadi';
        }
        setError(msg);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fileId, edgeSegments, onLayersAvailable]);

  // ─── Canvas init + DPR ─────────────────────────────────────────────
  // resizeTick: boyut degisince render effect'i tetikler + sahne cache'ini
  // gecersiz kilar (canvas.width degisimi icerigi zaten siler).
  const [resizeTick, setResizeTick] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctxRef.current = ctx;
      }
      setResizeTick((t) => t + 1);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ─── Sahne cache (KATMAN MIMARISI — OOM/re-render fix) ─────────────
  // Statik sahne (706K cizgi + arc + circle + text + edge'ler) offscreen
  // canvas'ta tutulur. Hover/flash/secim/halo gibi OVERLAY degisimlerinde
  // sahne YENIDEN CIZILMEZ — tek drawImage (blit) + birkac vurgu cizgisi.
  // Sahne yalniz asagidaki "sceneDeps" parmak izi degisince yeniden cizilir
  // (pan/zoom, layer gorunurlugu, cap renkleri, silgi...).
  const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneKeyRef = useRef<unknown[] | null>(null);

  // ─── Spatial index (rbush) ────────────────────────────────────────
  // 700K+ cizgide hover/click O(log N). Build O(N) — SADECE GEOMETRI
  // degisince yeniden kurulur.
  //
  // MEMORY LEAK FIX (OOM): eski kod calculatedEdgesByLayer/allEdgeSegments
  // IDENTITY'sine bagliydi — her cap etiketleme tiklamasi yeni state objesi
  // uretir, 700K+ SpatialEntry'lik agac SIFIRDAN allocate edilirdi (yuzlerce
  // MB cop/tiklama → GC yetisemez → Chrome "Out of Memory"). Cozum:
  //  1. Rebuild anahtari GEOMETRIK parmak izi (segment_id listesi + layer
  //     seti) — cap degisimi id'leri DEGISTIRMEZ, agac ayakta kalir.
  //  2. diameter/is_inherited index'te SAKLANMAZ — hover aninda guncel
  //     allEdgeSegments'ten okunur (stale veri riski yok).
  //  3. Silgi (hiddenLineKeys) kontrolu de sorgu anina tasindi — silme de
  //     rebuild tetiklemez.
  //
  // KRITIK (davranis korunur): hesaplanmis layer'larin RAW LINE'lari index'e
  // EKLENMEZ — aksi halde click hit-test uzun raw LWPOLYLINE'a duser.
  const skipRawLayersKey = useMemo(
    () => (calculatedEdgesByLayer ? JSON.stringify(Object.keys(calculatedEdgesByLayer).sort()) : '[]'),
    [calculatedEdgesByLayer],
  );
  const edgeGeomKey = useMemo(() => {
    if (!allEdgeSegments) return 'none';
    let k = String(allEdgeSegments.length);
    for (const s of allEdgeSegments) k += ',' + s.segment_id;
    return k;
  }, [allEdgeSegments]);
  // Guncel segment dizisine parmak-izi degismeden erisim (memo'yu tetiklemez;
  // ayni parmak izinde diziler geometrik olarak esdegerdir).
  const allEdgeSegmentsRef = useRef(allEdgeSegments);
  allEdgeSegmentsRef.current = allEdgeSegments;

  const spatialIndex = useMemo<RBush<SpatialEntry>>(() => {
    const tree = new RBush<SpatialEntry>();
    const items: SpatialEntry[] = [];
    const skipRawLayers = new Set<string>(JSON.parse(skipRawLayersKey));
    if (geometry) {
      geometry.lines.forEach((ln, i) => {
        // Hesaplanmis layer ise raw LINE'lari atla (edge_segments'i kullaniliyor)
        if (skipRawLayers.has(ln.layer)) return;
        const [x1, y1, x2, y2] = ln.coords;
        items.push({
          minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
          minY: Math.min(y1, y2), maxY: Math.max(y1, y2),
          type: 'line', layer: ln.layer, index: i, coords: ln.coords,
        });
      });
    }
    const segs = allEdgeSegmentsRef.current;
    if (segs) {
      segs.forEach((seg, i) => {
        const meta = {
          type: 'edge' as const, layer: seg.layer, index: i,
          coords: seg.coords,
          length: seg.length,
        };
        if (seg.polyline && seg.polyline.length >= 2) {
          let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
          for (const [x, y] of seg.polyline) {
            if (x < mnx) mnx = x; if (x > mxx) mxx = x;
            if (y < mny) mny = y; if (y > mxy) mxy = y;
          }
          items.push({
            minX: mnx, minY: mny, maxX: mxx, maxY: mxy,
            ...meta, polyline: seg.polyline,
          });
        } else {
          const [x1, y1, x2, y2] = seg.coords;
          items.push({
            minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
            minY: Math.min(y1, y2), maxY: Math.max(y1, y2),
            ...meta,
          });
        }
      });
    }
    tree.load(items);
    return tree;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- allEdgeSegments bilerek
    // parmak izi (edgeGeomKey) uzerinden takip edilir; identity degisimi rebuild
    // TETIKLEMEMELI (OOM fix). Detay: yukaridaki blok yorumu.
  }, [geometry, edgeGeomKey, skipRawLayersKey]);

  // Hidden/dimmed layer degisince hover/selected gecersiz olabilir, temizle
  useEffect(() => {
    if (hovered && (hiddenLayers?.has(hovered.layer) || dimmedLayers?.has(hovered.layer))) {
      setHovered(null);
    }
    if (selectedLine && (hiddenLayers?.has(selectedLine.layer) || dimmedLayers?.has(selectedLine.layer))) {
      setSelectedLine(null);
    }
  }, [hiddenLayers, dimmedLayers, hovered, selectedLine]);

  // ─── Render — sahne cache (statik katman) + overlay, RAF ile ─────
  useEffect(() => {
    let rafId = 0;
    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(render);
    };

    // ── SAHNE (statik katman) — yalniz sceneDeps degisince cizilir ──
    // Icerik: grid + raw line/arc/circle/text + ekipman + edge segment'ler +
    // T-junction marker'lari. Hover/flash/secim/halo BURADA DEGIL (overlay).
    // 706K cizgide her hover'da bu fonksiyonun kosmasi OOM/kasma sebebiydi.
    const drawScene = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = COLOR_BG;
      ctx.fillRect(0, 0, w, h);

      // Adaptive grid (screen space, transform oncesi)
      const rawStep = 50 / viewport.zoom;
      const exponent = Math.floor(Math.log10(rawStep));
      const minorStep = Math.pow(10, exponent);
      const majorStep = minorStep * 10;
      const minorPx = minorStep * viewport.zoom;
      const majorPx = majorStep * viewport.zoom;
      const drawGrid = (stepPx: number, alpha: string) => {
        if (stepPx <= 8) return;
        ctx.strokeStyle = alpha;
        ctx.lineWidth = 1;
        const startX = Math.floor(-viewport.panX / stepPx) * stepPx + viewport.panX;
        const startY = Math.floor(-viewport.panY / stepPx) * stepPx + viewport.panY;
        ctx.beginPath();
        for (let x = startX; x < w; x += stepPx) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = startY; y < h; y += stepPx) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();
      };
      drawGrid(minorPx, 'rgba(255,255,255,0.03)');
      drawGrid(majorPx, 'rgba(255,255,255,0.07)');

      // Viewport culling
      const marginPx = 50;
      const worldMinX = (-marginPx - viewport.panX) / viewport.zoom;
      const worldMaxX = (w + marginPx - viewport.panX) / viewport.zoom;
      const worldMinY = (viewport.panY - (h + marginPx)) / viewport.zoom;
      const worldMaxY = (viewport.panY + marginPx) / viewport.zoom;
      const inView = (x: number, y: number) => x >= worldMinX && x <= worldMaxX && y >= worldMinY && y <= worldMaxY;
      const lineInView = (x1: number, y1: number, x2: number, y2: number) => {
        const lnMinX = Math.min(x1, x2), lnMaxX = Math.max(x1, x2);
        const lnMinY = Math.min(y1, y2), lnMaxY = Math.max(y1, y2);
        return lnMaxX >= worldMinX && lnMinX <= worldMaxX && lnMaxY >= worldMinY && lnMinY <= worldMaxY;
      };

      ctx.save();
      ctx.translate(viewport.panX, viewport.panY);
      ctx.scale(viewport.zoom, -viewport.zoom);

      const strokeWidth = 1 / viewport.zoom;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';

      if (geometry && !edgeSegments) {
        const layerColors = geometry.layer_colors || {};
        const skipLayers = calculatedEdgesByLayer ? new Set(Object.keys(calculatedEdgesByLayer)) : null;

        // Layer bazinda 3 grup: normal, dimmed (skip render path is hidden)
        const normalByLayer = new Map<string, Array<[number, number, number, number]>>();
        const dimmedByLayer = new Map<string, Array<[number, number, number, number]>>();

        for (const ln of geometry.lines) {
          if (hiddenLayers?.has(ln.layer)) continue;
          if (skipLayers?.has(ln.layer)) continue;
          if (isLineHidden(ln.coords)) continue;  // SILGI: silinen LINE'i cizme
          const [x1, y1, x2, y2] = ln.coords;
          if (!lineInView(x1, y1, x2, y2)) continue;
          const bucket = dimmedLayers?.has(ln.layer) ? dimmedByLayer : normalByLayer;
          let arr = bucket.get(ln.layer);
          if (!arr) {
            arr = [];
            bucket.set(ln.layer, arr);
          }
          arr.push(ln.coords);
        }

        // ─── Dimmed layers (önce, arka plana otursun) ─────────────
        if (dimmedByLayer.size > 0) {
          ctx.globalAlpha = DIMMED_ALPHA;
          ctx.strokeStyle = COLOR_DIMMED;
          ctx.lineWidth = strokeWidth;
          ctx.beginPath();
          dimmedByLayer.forEach((coordsList) => {
            for (const [x1, y1, x2, y2] of coordsList) {
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
            }
          });
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // ─── Normal layers (ACI renkli) ───────────────────────────
        normalByLayer.forEach((coordsList, layer) => {
          const isSelected = selectedLayer === layer;
          const isHighlighted = highlightLayer === layer;
          let color: string;
          let alpha = 1;
          let lw = strokeWidth;

          if (isSelected) {
            color = COLOR_SELECTED;
            lw = strokeWidth * 2.5;
          } else if (highlightLayer && !isHighlighted) {
            color = COLOR_PASSIVE;
            alpha = 0.3;
          } else {
            const aci = layerColors[layer] ?? 7;
            color = aciToColor(aci);
          }

          ctx.strokeStyle = color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = lw;
          if (isSelected) {
            ctx.shadowColor = 'rgba(96, 165, 250, 0.5)';
            ctx.shadowBlur = 8;
          }
          ctx.beginPath();
          for (const [x1, y1, x2, y2] of coordsList) {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
          }
          ctx.stroke();
          if (isSelected) {
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
          }
        });
        ctx.globalAlpha = 1;

        // ─── Arcs (normal + dimmed iki pass) ──────────────────────
        if (geometry.arcs.length > 0) {
          const drawArcs = (filterDim: boolean, color: string, alpha: number) => {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = strokeWidth;
            ctx.beginPath();
            for (const a of geometry.arcs) {
              if (hiddenLayers?.has(a.layer)) continue;
              const isDim = !!dimmedLayers?.has(a.layer);
              if (filterDim !== isDim) continue;
              const r = a.radius;
              if (!lineInView(a.center[0] - r, a.center[1] - r, a.center[0] + r, a.center[1] + r)) continue;
              const sa = (a.start_angle * Math.PI) / 180;
              const ea = (a.end_angle * Math.PI) / 180;
              ctx.moveTo(a.center[0] + r * Math.cos(sa), a.center[1] + r * Math.sin(sa));
              ctx.arc(a.center[0], a.center[1], r, sa, ea, false);
            }
            ctx.stroke();
          };
          drawArcs(false, COLOR_PASSIVE, 1);
          if (dimmedLayers && dimmedLayers.size > 0) {
            drawArcs(true, COLOR_DIMMED, DIMMED_ALPHA);
          }
          ctx.globalAlpha = 1;
        }

        // ─── Circles (sprinkler/normal × normal/dimmed = 4 pass) ──
        if (geometry.circles.length > 0) {
          const circleInView = (cx: number, cy: number, r: number) =>
            lineInView(cx - r, cy - r, cx + r, cy + r);

          const drawCircles = (
            filterSprinkler: boolean,
            filterDim: boolean,
            color: string,
            lw: number,
            alpha: number,
          ) => {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.beginPath();
            for (const c of geometry.circles) {
              if (hiddenLayers?.has(c.layer)) continue;
              const isSprink = !!sprinklerLayers?.has(c.layer);
              if (filterSprinkler !== isSprink) continue;
              const isDim = !!dimmedLayers?.has(c.layer);
              if (filterDim !== isDim) continue;
              if (!circleInView(c.center[0], c.center[1], c.radius)) continue;
              ctx.moveTo(c.center[0] + c.radius, c.center[1]);
              ctx.arc(c.center[0], c.center[1], c.radius, 0, Math.PI * 2);
            }
            ctx.stroke();
          };

          // Normal pass'lar
          drawCircles(true, false, COLOR_SPRINKLER, strokeWidth * 1.6, 1);
          drawCircles(false, false, COLOR_PASSIVE, strokeWidth * 0.8, 1);
          // Dimmed pass'lar (sprinkler ya da normal fark etmez, hepsi gri+%25)
          if (dimmedLayers && dimmedLayers.size > 0) {
            drawCircles(true, true, COLOR_DIMMED, strokeWidth * 0.8, DIMMED_ALPHA);
            drawCircles(false, true, COLOR_DIMMED, strokeWidth * 0.8, DIMMED_ALPHA);
          }
          ctx.globalAlpha = 1;
        }

        // ─── Marked equipment (hidden = atla; dimmed = %25 alpha) ─
        if (markedEquipmentKeys && markedEquipmentKeys.size > 0) {
          ctx.fillStyle = COLOR_MARKED_EQUIPMENT;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = strokeWidth * 0.5;
          for (const ins of geometry.inserts) {
            const key = `${ins.layer}:${ins.insert_index}`;
            if (!markedEquipmentKeys.has(key)) continue;
            if (hiddenLayers?.has(ins.layer)) continue;
            if (isInsertHidden(ins.insert_index)) continue;  // SILGI: silinmis insert dot'unu cizme
            ctx.globalAlpha = dimmedLayers?.has(ins.layer) ? DIMMED_ALPHA : 1;
            ctx.beginPath();
            ctx.arc(ins.position[0], ins.position[1], 3.5 / viewport.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }

        // ─── Texts (dimmed = gri + %25 alpha, fillText per-text) ──
        // SILGI: hiddenText skip; pendingText turuncu arka plan + outline.
        if (viewport.zoom >= 0.3 && geometry.texts.length > 0) {
          ctx.textBaseline = 'alphabetic';
          for (let ti = 0; ti < geometry.texts.length; ti++) {
            const t = geometry.texts[ti];
            if (hiddenLayers?.has(t.layer)) continue;
            if (!t.text) continue;
            if (isTextHidden(ti)) continue;  // SILGI: silinmis text'i cizme
            if (!inView(t.position[0], t.position[1])) continue;
            const isDim = !!dimmedLayers?.has(t.layer);
            const isPending = isTextPending(ti);
            // Pending text: arka plana turuncu yari-saydam rect (text'i de
            // turuncu glow ile cevreler)
            if (isPending) {
              const tw = t.text.length * Math.max(t.height, 1) * 0.6;
              const th = Math.max(t.height, 1);
              const pad = 1 / viewport.zoom;
              ctx.save();
              ctx.fillStyle = 'rgba(251, 146, 60, 0.30)';   // orange-400 @ 30%
              ctx.strokeStyle = '#fb923c';
              ctx.lineWidth = 1.5 / viewport.zoom;
              ctx.shadowColor = 'rgba(251, 146, 60, 0.7)';
              ctx.shadowBlur = 8;
              ctx.fillRect(t.position[0] - pad, t.position[1] - pad, tw + 2 * pad, th + 2 * pad);
              ctx.strokeRect(t.position[0] - pad, t.position[1] - pad, tw + 2 * pad, th + 2 * pad);
              ctx.restore();
            }
            ctx.fillStyle = isDim ? COLOR_DIMMED : COLOR_TEXT;
            ctx.globalAlpha = isDim ? DIMMED_ALPHA : 1;
            ctx.save();
            ctx.translate(t.position[0], t.position[1]);
            ctx.scale(1, -1);
            if (t.rotation) ctx.rotate(-t.rotation * Math.PI / 180);
            ctx.font = `${Math.max(t.height, 1)}px ui-monospace, Menlo, Consolas, monospace`;
            ctx.fillText(t.text, 0, 0);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        }
      }

      // ─── Calculated edges (hidden = atla, dimmed = ayri gri pass) ─
      if (allEdgeSegments && allEdgeSegments.length > 0) {
        const drawSegPath = (seg: EdgeSegment) => {
          if (seg.polyline && seg.polyline.length >= 2) {
            ctx.moveTo(seg.polyline[0][0], seg.polyline[0][1]);
            for (let i = 1; i < seg.polyline.length; i++) {
              ctx.lineTo(seg.polyline[i][0], seg.polyline[i][1]);
            }
          } else {
            ctx.moveTo(seg.coords[0], seg.coords[1]);
            ctx.lineTo(seg.coords[2], seg.coords[3]);
          }
        };

        // Normal pass: layer-bazli filtrele, cap-bazli renkli grupla
        const byDiameter = new Map<string, EdgeSegment[]>();
        const dimmedSegs: EdgeSegment[] = [];
        for (const seg of allEdgeSegments) {
          if (hiddenLayers?.has(seg.layer)) continue;
          if (dimmedLayers?.has(seg.layer)) {
            dimmedSegs.push(seg);
            continue;
          }
          // Atanmis ve atanmamis ayri grupla — atanmamis sentinel'leri tek
          // anahtara toplanir (backend "" veya "Belirtilmemis" gonderse de
          // legend ile birebir ortusur).
          const key = isUnassignedDiameter(seg.diameter) ? UNASSIGNED_LABEL : seg.diameter;
          let arr = byDiameter.get(key);
          if (!arr) { arr = []; byDiameter.set(key, arr); }
          arr.push(seg);
        }

        ctx.lineWidth = strokeWidth * 1.8;
        ctx.globalAlpha = 1;
        if (useDiameterColors) {
          // PRD §3: cap-bazli dinamik renklendirme (legend ile esles)
          // EKSIK PARCA TESPITI (operasyon madde 1): capsiz borular NEON +
          // glow + kesikli — rapor oncesi gozden kacan parca aninda gorunur.
          byDiameter.forEach((segs, diameter) => {
            const isUnassigned = diameter === UNASSIGNED_LABEL;
            if (isUnassigned) {
              ctx.save();
              ctx.strokeStyle = COLOR_UNASSIGNED_NEON;
              ctx.lineWidth = strokeWidth * 2.6;
              ctx.shadowColor = 'rgba(57, 255, 20, 0.85)';
              ctx.shadowBlur = 12;
              ctx.setLineDash([8, 4]);
              ctx.beginPath();
              for (const seg of segs) drawSegPath(seg);
              ctx.stroke();
              ctx.restore();
              ctx.lineWidth = strokeWidth * 1.8;  // save/restore lineWidth'i geri alir ama emin ol
            } else {
              ctx.strokeStyle = diameterToColor(diameter);
              ctx.setLineDash([]);
              ctx.beginPath();
              for (const seg of segs) drawSegPath(seg);
              ctx.stroke();
            }
          });
          ctx.setLineDash([]);  // sonraki pass'lere taşmasın
        } else {
          // PRD §5: save sonrasi cap renkleri kaldirilir, layer orijinal ACI
          // rengine donulur. Tum diameter group'larini layer'a yeniden grupla.
          const byLayer = new Map<string, EdgeSegment[]>();
          byDiameter.forEach((segs) => {
            for (const seg of segs) {
              let arr = byLayer.get(seg.layer);
              if (!arr) { arr = []; byLayer.set(seg.layer, arr); }
              arr.push(seg);
            }
          });
          const layerColorsMap = geometry?.layer_colors || {};
          byLayer.forEach((segs, layer) => {
            const aci = layerColorsMap[layer] ?? 7;
            ctx.strokeStyle = aciToColor(aci);
            ctx.beginPath();
            for (const seg of segs) drawSegPath(seg);
            ctx.stroke();
          });
        }

        // Dimmed pass: hepsi gri + %25
        if (dimmedSegs.length > 0) {
          ctx.globalAlpha = DIMMED_ALPHA;
          ctx.strokeStyle = COLOR_DIMMED;
          ctx.beginPath();
          for (const seg of dimmedSegs) drawSegPath(seg);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // FOCUS HALO overlay'e tasindi (sahne cache'i halo yuzunden
        // gecersiz olmasin — legend tiklamasi sahneyi yeniden cizmez).
      }

      // ─── T-junction noktalari (gorsel ayraq) ──────────────────────
      // 866 segment hepsi tek path'te ve ayni renkte cizildigi icin gorsel
      // olarak tek parca gibi gozukur. Junction'larda kucuk yari-seffaf nokta
      // koy → kullanici hangi noktada segment'in degistigini anlar.
      // (Hover'da daha belirgin mavi marker zaten cizilir.)
      if (calculatedJunctionsByLayer) {
        const allJunctions: [number, number][] = [];
        for (const [layer, pts] of Object.entries(calculatedJunctionsByLayer)) {
          if (hiddenLayers?.has(layer) || dimmedLayers?.has(layer)) continue;
          allJunctions.push(...pts);
        }
        if (allJunctions.length > 0) {
          const r = 2.5 / viewport.zoom;
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#94a3b8';  // slate-400, dikkat dagitmaz
          for (const [jx, jy] of allJunctions) {
            ctx.beginPath();
            ctx.arc(jx, jy, r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();  // sahne world-transform'u kapat
    };  // drawScene sonu

    const render = () => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // ── 1) SAHNE CACHE — parmak izi degismediyse 706K cizgi CIZILMEZ ──
      // Hover/flash/secim degisimlerinde bu dizi AYNI kalir → sadece blit.
      const sceneDeps: unknown[] = [
        geometry, allEdgeSegments, viewport.panX, viewport.panY, viewport.zoom,
        selectedLayer, highlightLayer, hiddenLayers, dimmedLayers,
        sprinklerLayers, markedEquipmentKeys, calculatedJunctionsByLayer,
        hiddenLineKeys, hiddenInsertKeys, hiddenTextKeys, pendingTextKeys,
        useDiameterColors, calculatedEdgesByLayer, canvas.width, canvas.height,
      ];
      let scene = sceneCanvasRef.current;
      const prevKey = sceneKeyRef.current;
      const sceneValid =
        !!scene && scene.width === canvas.width && scene.height === canvas.height &&
        !!prevKey && prevKey.length === sceneDeps.length &&
        prevKey.every((v, i) => Object.is(v, sceneDeps[i]));

      if (!sceneValid) {
        if (!scene) {
          scene = document.createElement('canvas');
          sceneCanvasRef.current = scene;
        }
        if (scene.width !== canvas.width) scene.width = canvas.width;
        if (scene.height !== canvas.height) scene.height = canvas.height;
        const sctx = scene.getContext('2d');
        if (!sctx) return;
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScene(sctx, w, h);
        sceneKeyRef.current = sceneDeps;
      }

      // ── 2) BLIT — sahneyi ana canvas'a tek kopyalama (device px 1:1) ──
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(scene as HTMLCanvasElement, 0, 0);
      ctx.restore();

      // ── 3) OVERLAY — hover/flash/pending/secim/halo (az obje, ucuz) ──
      ctx.save();
      ctx.translate(viewport.panX, viewport.panY);
      ctx.scale(viewport.zoom, -viewport.zoom);
      const strokeWidth = 1 / viewport.zoom;
      ctx.lineCap = 'round';

      // ─── HOVER overlay (amber glow + 2x stroke) ───────────────────
      // TIKLA-ETIKETLE onizleme: aktif kalem varken edge hover'i kalem
      // rengine boyanir — kullanici tiklamadan once atanacak rengi gorur.
      if (hovered) {
        const isTagHover = hovered.type === 'edge' && !!activeTagColor;
        ctx.strokeStyle = isTagHover ? (activeTagColor as string) : COLOR_HOVER;
        ctx.lineWidth = strokeWidth * 2.2;
        ctx.shadowColor = isTagHover ? (activeTagColor as string) : 'rgba(253, 230, 138, 0.7)';
        ctx.shadowBlur = isTagHover ? 14 : 10;
        ctx.beginPath();
        if (hovered.polyline && hovered.polyline.length >= 2) {
          ctx.moveTo(hovered.polyline[0][0], hovered.polyline[0][1]);
          for (let i = 1; i < hovered.polyline.length; i++) {
            ctx.lineTo(hovered.polyline[i][0], hovered.polyline[i][1]);
          }
        } else {
          ctx.moveTo(hovered.coords[0], hovered.coords[1]);
          ctx.lineTo(hovered.coords[2], hovered.coords[3]);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';

        // Edge segment ise — segment'in iki ucunda mavi nokta marker'i
        // (kullanici T noktasinda nerede ayrildigini gorsun)
        if (hovered.type === 'edge') {
          const markerR = 4 / viewport.zoom;
          const borderW = 1.5 / viewport.zoom;
          const endpoints: [number, number][] = hovered.polyline && hovered.polyline.length >= 2
            ? [hovered.polyline[0] as [number, number], hovered.polyline[hovered.polyline.length - 1] as [number, number]]
            : [[hovered.coords[0], hovered.coords[1]], [hovered.coords[2], hovered.coords[3]]];
          ctx.globalAlpha = 1;
          for (const [ex, ey] of endpoints) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(ex, ey, markerR + borderW, 0, Math.PI * 2);
            ctx.fill();
            // Kalem aktifse marker da kalem renginde — izolasyon onizleme
            ctx.fillStyle = activeTagColor ?? '#3b82f6';
            ctx.beginPath();
            ctx.arc(ex, ey, markerR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ─── TAG FLASH — SEGMENT IZOLASYONU teyidi (operasyon madde 2) ──
      // Tiklanan run ~900ms kalem rengiyle parlar; uc noktalar (T-noktalari
      // arasi sinirlar) beyaz halkali marker'la vurgulanir. Kullanici neyi
      // etiketledigini net gorur.
      if (flashSegment && allEdgeSegments && Date.now() - flashSegment.at < 900) {
        const fs = allEdgeSegments.find((s) => s.segment_id === flashSegment.segmentId);
        if (fs) {
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowColor = flashSegment.color;
          ctx.shadowBlur = 20;
          // Dis beyaz kusak (yari seffaf) + ic kalem rengi
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = strokeWidth * 5.5;
          ctx.beginPath();
          if (fs.polyline && fs.polyline.length >= 2) {
            ctx.moveTo(fs.polyline[0][0], fs.polyline[0][1]);
            for (let i = 1; i < fs.polyline.length; i++) ctx.lineTo(fs.polyline[i][0], fs.polyline[i][1]);
          } else {
            ctx.moveTo(fs.coords[0], fs.coords[1]);
            ctx.lineTo(fs.coords[2], fs.coords[3]);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = flashSegment.color;
          ctx.lineWidth = strokeWidth * 2.8;
          ctx.stroke();
          // Uc nokta marker'lari
          const fEnds: [number, number][] = fs.polyline && fs.polyline.length >= 2
            ? [fs.polyline[0] as [number, number], fs.polyline[fs.polyline.length - 1] as [number, number]]
            : [[fs.coords[0], fs.coords[1]], [fs.coords[2], fs.coords[3]]];
          const fr = 5 / viewport.zoom;
          for (const [ex, ey] of fEnds) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(ex, ey, fr + 1.5 / viewport.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = flashSegment.color;
            ctx.beginPath();
            ctx.arc(ex, ey, fr, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // ─── PENDING ERASE highlight (turuncu, kalin) ──────────────────
      // Sec-onayla-sil flow: kullanici tıkladi/marquee yapti ama Enter'a
      // basmadi. Onaylanana dek hidden DEGIL — turuncu vurgu ile gosterilir.
      if (pendingLineKeys && pendingLineKeys.size > 0 && geometry) {
        ctx.save();
        ctx.strokeStyle = '#fb923c';  // orange-400 — silgi rose'undan ayri
        ctx.lineWidth = strokeWidth * 2.8;
        ctx.shadowColor = 'rgba(251, 146, 60, 0.7)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        // Raw LINE'lar
        for (const ln of geometry.lines) {
          if (hiddenLayers?.has(ln.layer)) continue;
          if (isLineHidden(ln.coords)) continue;
          if (!isLinePending(ln.coords)) continue;
          ctx.moveTo(ln.coords[0], ln.coords[1]);
          ctx.lineTo(ln.coords[2], ln.coords[3]);
        }
        // Hesaplanmis edge segment'leri (allEdgeSegments — ayni computeLineKey)
        if (allEdgeSegments) {
          for (const seg of allEdgeSegments) {
            if (hiddenLayers?.has(seg.layer)) continue;
            if (isLineHidden(seg.coords)) continue;
            if (!isLinePending(seg.coords)) continue;
            if (seg.polyline && seg.polyline.length >= 2) {
              ctx.moveTo(seg.polyline[0][0], seg.polyline[0][1]);
              for (let i = 1; i < seg.polyline.length; i++) {
                ctx.lineTo(seg.polyline[i][0], seg.polyline[i][1]);
              }
            } else {
              ctx.moveTo(seg.coords[0], seg.coords[1]);
              ctx.lineTo(seg.coords[2], seg.coords[3]);
            }
          }
        }
        ctx.stroke();
        ctx.restore();
      }
      if (pendingInsertKeys && pendingInsertKeys.size > 0 && geometry) {
        ctx.save();
        ctx.fillStyle = '#fb923c';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = strokeWidth * 0.8;
        ctx.shadowColor = 'rgba(251, 146, 60, 0.8)';
        ctx.shadowBlur = 10;
        const r = 5 / viewport.zoom;
        for (const ins of geometry.inserts) {
          if (hiddenLayers?.has(ins.layer)) continue;
          if (isInsertHidden(ins.insert_index)) continue;
          if (!isInsertPending(ins.insert_index)) continue;
          ctx.beginPath();
          ctx.arc(ins.position[0], ins.position[1], r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      // ─── SELECTED overlay (brand blue + 2.5x stroke + bigger glow) ──
      if (selectedLine) {
        ctx.strokeStyle = COLOR_LINE_SELECTED;
        ctx.lineWidth = strokeWidth * 3;
        ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        if (selectedLine.polyline && selectedLine.polyline.length >= 2) {
          ctx.moveTo(selectedLine.polyline[0][0], selectedLine.polyline[0][1]);
          for (let i = 1; i < selectedLine.polyline.length; i++) {
            ctx.lineTo(selectedLine.polyline[i][0], selectedLine.polyline[i][1]);
          }
        } else {
          ctx.moveTo(selectedLine.coords[0], selectedLine.coords[1]);
          ctx.lineTo(selectedLine.coords[2], selectedLine.coords[3]);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }

      // ─── FOCUS HALO — legend'dan tiklanan segment (overlay katmani) ──
      // Sahne cache'inden bagimsiz: legend tiklamasi 706K'lik sahneyi
      // yeniden CIZDIRMEZ, sadece blit + bu halo.
      if (focusedSegment) {
        const fs = focusedSegment;
        const haloColor = focusedHaloColor || '#fde047'; // amber-300 fallback
        const haloPath = () => {
          ctx.beginPath();
          if (fs.polyline && fs.polyline.length >= 2) {
            ctx.moveTo(fs.polyline[0][0], fs.polyline[0][1]);
            for (let i = 1; i < fs.polyline.length; i++) {
              ctx.lineTo(fs.polyline[i][0], fs.polyline[i][1]);
            }
          } else {
            ctx.moveTo(fs.coords[0], fs.coords[1]);
            ctx.lineTo(fs.coords[2], fs.coords[3]);
          }
        };
        ctx.save();
        ctx.shadowColor = haloColor;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = haloColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // Iki kademe: dis daha kalin + yari-seffaf, ic dolgun cap rengi
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = strokeWidth * 6;
        haloPath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = strokeWidth * 2.8;
        haloPath();
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    };

    schedule();
    return () => cancelAnimationFrame(rafId);
  }, [geometry, allEdgeSegments, calculatedJunctionsByLayer, calculatedEdgesByLayer, viewport, selectedLayer, highlightLayer, hiddenLayers, dimmedLayers, sprinklerLayers, markedEquipmentKeys, hovered, selectedLine, pendingLineKeys, pendingInsertKeys, pendingTextKeys, hiddenTextKeys, isLinePending, isInsertPending, isLineHidden, isInsertHidden, isTextHidden, isTextPending, useDiameterColors, focusedSegment, focusedHaloColor, activeTagColor, flashSegment, flashTick, resizeTick]);

  // ─── Hover detection (rbush ile O(log N)) ────────────────────────
  const computeHovered = useCallback(
    (worldX: number, worldY: number): HoveredEntity | null => {
      const tol = HOVER_TOL_PX / viewport.zoom;
      const candidates = spatialIndex.search({
        minX: worldX - tol, minY: worldY - tol,
        maxX: worldX + tol, maxY: worldY + tol,
      });
      let best: SpatialEntry | null = null;
      let bestDist = Infinity;
      for (const c of candidates) {
        if (hiddenLayers?.has(c.layer)) continue;
        if (dimmedLayers?.has(c.layer)) continue;
        // SILGI: silinen LINE'lar sorgu aninda atlanir (index rebuild gerektirmez)
        if (c.type === 'line' && isLineHidden(c.coords)) continue;
        let d: number;
        if (c.polyline && c.polyline.length >= 2) {
          d = Infinity;
          for (let i = 0; i < c.polyline.length - 1; i++) {
            const di = pointToSegmentDistance(
              worldX, worldY,
              c.polyline[i][0], c.polyline[i][1],
              c.polyline[i + 1][0], c.polyline[i + 1][1],
            );
            if (di < d) d = di;
          }
        } else {
          d = pointToSegmentDistance(worldX, worldY, c.coords[0], c.coords[1], c.coords[2], c.coords[3]);
        }
        if (d <= tol && d < bestDist) {
          best = c;
          bestDist = d;
        }
      }
      if (!best) return null;
      // Cap/miras bilgisi CANLI okunur — index'te tutulmaz (OOM fix, stale onlemi)
      const liveSeg = best.type === 'edge' ? allEdgeSegments?.[best.index] : undefined;
      return {
        type: best.type,
        layer: best.layer,
        index: best.index,
        coords: best.coords,
        polyline: best.polyline,
        length: resolveHoverLength(best, scale),
        diameter: liveSeg?.diameter || undefined,
        isInherited: liveSeg?.is_inherited || false,
      };
    },
    [spatialIndex, viewport.zoom, hiddenLayers, dimmedLayers, scale, isLineHidden, allEdgeSegments],
  );

  // ─── Mouse pozisyonu → world coord + hover ──────────────────────
  // EVENT THROTTLING (OOM/CPU fix): pointermove yuksek Hz'li fare/monitorde
  // saniyede 120-250 kez tetiklenir. Her event'te 2 setState + rbush sorgusu
  // React agacini bogup GC baskisi yaratiyordu. Cozum: son event ref'te
  // birikir, frame basina EN FAZLA 1 hover/cursor hesabi yapilir (RAF).
  // Pan (drag) gercek zamanli kalir — pointerHandlers.onPointerMove throttle
  // DISINDA senkron cagrilir.
  const moveRafRef = useRef(0);
  const lastMoveRef = useRef<{ clientX: number; clientY: number } | null>(null);
  useEffect(() => () => cancelAnimationFrame(moveRafRef.current), []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointerHandlers.onPointerMove(e); // pan — throttle'siz, gercek zamanli
      lastMoveRef.current = { clientX: e.clientX, clientY: e.clientY };
      if (moveRafRef.current) return; // bu frame icin zaten planli
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = 0;
        const pos = lastMoveRef.current;
        const el = containerRef.current;
        if (!pos || !el) return;
        const rect = el.getBoundingClientRect();
        const mx = pos.clientX - rect.left;
        const my = pos.clientY - rect.top;
        const worldX = (mx - viewport.panX) / viewport.zoom;
        const worldY = (viewport.panY - my) / viewport.zoom;
        setCursorWorld({ x: worldX, y: worldY });
        setCursorScreen({ x: mx, y: my });

        // Hover detection — pan/drag esnasinda ATLA (kamera zaten hareketli,
        // hover hesabi + glow cizimi bos yere frame yer)
        if (isDragging()) return;
        const newHover = computeHovered(worldX, worldY);
        // Ayni entity ise state IDENTITY korunur — re-render/redraw tetiklenmez
        setHovered((prev) => {
          if (newHover?.type === prev?.type && newHover?.index === prev?.index && newHover?.layer === prev?.layer) {
            return prev;
          }
          return newHover;
        });
      });
    },
    [pointerHandlers, viewport.panX, viewport.panY, viewport.zoom, computeHovered, isDragging],
  );

  // ─── Click hit-test ──────────────────────────────────────────────
  const handleClick = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (wasDragged()) return;
      const el = containerRef.current;
      if (!el || !geometry) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const worldX = (mx - viewport.panX) / viewport.zoom;
      const worldY = (viewport.panY - my) / viewport.zoom;
      const tol = HOVER_TOL_PX / viewport.zoom;

      // ── SILGI MODU: tek tık = entity sil (boru/insert/text) ──────
      if (eraseMode && onEraseEntities) {
        // INSERT (sembol noktasi) once
        for (const ins of geometry.inserts) {
          if (hiddenLayers?.has(ins.layer)) continue;
          if (isInsertHidden(ins.insert_index)) continue;
          const dx = worldX - ins.position[0];
          const dy = worldY - ins.position[1];
          if (Math.hypot(dx, dy) <= tol + 2) {
            onEraseEntities([], [ins.insert_index], []);
            return;
          }
        }
        // TEXT hit-test — monospace yaklasik bbox (rotation goz ardi).
        // height * 0.6 yaklasik karakter genisligi, padding tol kadar.
        for (let ti = 0; ti < geometry.texts.length; ti++) {
          const t = geometry.texts[ti];
          if (!t.text) continue;
          if (hiddenLayers?.has(t.layer)) continue;
          if (isTextHidden(ti)) continue;
          const tw = t.text.length * Math.max(t.height, 1) * 0.6;
          const th = Math.max(t.height, 1);
          const pad = tol;
          if (worldX >= t.position[0] - pad && worldX <= t.position[0] + tw + pad &&
              worldY >= t.position[1] - pad && worldY <= t.position[1] + th + pad) {
            onEraseEntities([], [], [ti]);
            return;
          }
        }
        // LINE (boru hatti) — spatial index ile en yakini
        const target = computeHovered(worldX, worldY);
        if (target && target.type === 'line') {
          onEraseEntities([computeLineKey(target.coords)], [], []);
          return;
        }
        // EDGE segment (hesaplanmis layer'da) — siliniyorsa LINE key olarak gonder
        if (target && target.type === 'edge') {
          onEraseEntities([computeLineKey(target.coords)], [], []);
          return;
        }
        // Bos alana tik → bir sey olmaz (marquee zaten pointer handler'la)
        return;
      }

      // Insert/circle önce (sembol > çizgi). Dimmed/hidden atlanir.
      for (const ins of geometry.inserts) {
        if (hiddenLayers?.has(ins.layer)) continue;
        if (dimmedLayers?.has(ins.layer)) continue;
        if (isInsertHidden(ins.insert_index)) continue;  // SILGI: silinmis insert tik almasin
        const dx = worldX - ins.position[0];
        const dy = worldY - ins.position[1];
        if (Math.hypot(dx, dy) <= tol + 2) {
          setSelectedLine(null);
          onInsertClick?.({ layer: ins.layer, insertIndex: ins.insert_index, insertName: ins.insert_name, position: ins.position });
          return;
        }
      }

      for (const c of geometry.circles) {
        if (hiddenLayers?.has(c.layer)) continue;
        if (dimmedLayers?.has(c.layer)) continue;
        const dx = worldX - c.center[0];
        const dy = worldY - c.center[1];
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - c.radius) <= tol || d <= c.radius) {
          setSelectedLine(null);
          onCircleClick?.({ layer: c.layer, circleIndex: c.circle_index, center: c.center, radius: c.radius });
          return;
        }
      }

      // Line/edge: spatial index ile en yakini bul
      const target = computeHovered(worldX, worldY);
      if (target) {
        setSelectedLine(target);
        if (target.type === 'line') {
          onLineClick?.({ layer: target.layer, index: target.index, shiftKey: e.shiftKey, screenX: e.clientX, screenY: e.clientY });
        } else if (target.type === 'edge' && allEdgeSegments) {
          onSegmentClick?.(allEdgeSegments[target.index]);
        }
        return;
      }

      // Hicbir sey tutmadi → clear selection
      setSelectedLine(null);
      onClearSelection?.();
    },
    [geometry, allEdgeSegments, viewport, wasDragged, computeHovered, hiddenLayers, dimmedLayers, onLineClick, onCircleClick, onInsertClick, onSegmentClick, onClearSelection, eraseMode, onEraseEntities, isInsertHidden, isTextHidden, computeLineKey],
  );

  // ── SILGI MODU — marquee selection pointer handler'lari ──────────
  // ERASE mode'da pan disabled, drag = marquee box. Click (small move) = single
  // entity erase (handleClick yapar).
  const handleErasePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!eraseMode || e.button !== 0) {
        // Normal: pan handler
        pointerHandlers.onPointerDown(e);
        return;
      }
      // BUG FIX: Toolbar button'lari container'in cocugu. setPointerCapture
      // butonlara giden click event'ini calar (Sil/Iptal cevap vermiyordu).
      // event.target button/svg/icon ise marquee BASLATMA, browser'in normal
      // button click flow'una birak.
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, [role="button"]')) {
        return;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setMarquee({ sx1: sx, sy1: sy, sx2: sx, sy2: sy });
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    },
    [eraseMode, pointerHandlers],
  );

  const handleErasePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Normal hover/cursor logic her zaman calissin
      handlePointerMove(e);
      if (eraseMode && marquee) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setMarquee({
          ...marquee,
          sx2: e.clientX - rect.left,
          sy2: e.clientY - rect.top,
        });
      }
    },
    [eraseMode, marquee, handlePointerMove],
  );

  const handleErasePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!eraseMode) {
        pointerHandlers.onPointerUp(e);
        handleClick(e);
        return;
      }
      // ERASE mode — marquee var mi?
      if (!marquee) {
        // Marquee baslamadi (mouse up sirasinda kayboldu) — tek tik handler
        handleClick(e);
        return;
      }
      const dx = Math.abs(marquee.sx2 - marquee.sx1);
      const dy = Math.abs(marquee.sy2 - marquee.sy1);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      if (dx <= 4 && dy <= 4) {
        // Cok kucuk hareket = tek tik
        setMarquee(null);
        handleClick(e);
        return;
      }
      // MARQUEE FINAL — AutoCAD davranisi:
      //   sol→sag surukleme (sx2 > sx1): WINDOW — sadece TAMAMEN icerideki secilir (mavi)
      //   sag→sol surukleme (sx2 < sx1): CROSSING — kesisen de secilir (yesil)
      const isWindow = marquee.sx2 > marquee.sx1;
      const minSx = Math.min(marquee.sx1, marquee.sx2);
      const maxSx = Math.max(marquee.sx1, marquee.sx2);
      const minSy = Math.min(marquee.sy1, marquee.sy2);
      const maxSy = Math.max(marquee.sy1, marquee.sy2);
      // Screen → world (Y ters!)
      const minWx = (minSx - viewport.panX) / viewport.zoom;
      const maxWx = (maxSx - viewport.panX) / viewport.zoom;
      const minWy = (viewport.panY - maxSy) / viewport.zoom;
      const maxWy = (viewport.panY - minSy) / viewport.zoom;

      // LINE/segment secim testi — yon-bazli (window vs crossing).
      // Window: bbox kutuda TAMAMEN icerde (her iki uc + bbox icerde).
      // Crossing: bbox overlap (kesisme yeterli) — eski davranis.
      const lineInBox = (x1: number, y1: number, x2: number, y2: number): boolean => {
        const lnMnx = Math.min(x1, x2);
        const lnMxx = Math.max(x1, x2);
        const lnMny = Math.min(y1, y2);
        const lnMxy = Math.max(y1, y2);
        if (isWindow) {
          // TAMAMEN icerde
          return lnMnx >= minWx && lnMxx <= maxWx && lnMny >= minWy && lnMxy <= maxWy;
        }
        // Crossing: bbox overlap
        return lnMxx >= minWx && lnMnx <= maxWx && lnMxy >= minWy && lnMny <= maxWy;
      };

      const lineKeys: string[] = [];
      const insertIndices: number[] = [];
      const textIndices: number[] = [];

      if (geometry) {
        for (const ln of geometry.lines) {
          if (hiddenLayers?.has(ln.layer)) continue;
          if (isLineHidden(ln.coords)) continue;
          const [x1, y1, x2, y2] = ln.coords;
          if (lineInBox(x1, y1, x2, y2)) {
            lineKeys.push(computeLineKey(ln.coords));
          }
        }
        // INSERT: nokta entity — window/crossing fark etmez (point ya icerde ya degil)
        for (const ins of geometry.inserts) {
          if (hiddenLayers?.has(ins.layer)) continue;
          if (isInsertHidden(ins.insert_index)) continue;
          const [px, py] = ins.position;
          if (px >= minWx && px <= maxWx && py >= minWy && py <= maxWy) {
            insertIndices.push(ins.insert_index);
          }
        }
        // TEXT bbox — line ile ayni yon-bazli testi kullan
        for (let ti = 0; ti < geometry.texts.length; ti++) {
          const t = geometry.texts[ti];
          if (!t.text) continue;
          if (hiddenLayers?.has(t.layer)) continue;
          if (isTextHidden(ti)) continue;
          const tw = t.text.length * Math.max(t.height, 1) * 0.6;
          const th = Math.max(t.height, 1);
          if (lineInBox(t.position[0], t.position[1], t.position[0] + tw, t.position[1] + th)) {
            textIndices.push(ti);
          }
        }
      }
      // Edge segments (hesaplanmis layer'lar) — ayni yon-bazli test
      if (allEdgeSegments) {
        for (const seg of allEdgeSegments) {
          if (isLineHidden(seg.coords)) continue;
          // Polyline varsa: tum vertex'lerin bbox'ini kullan
          if (seg.polyline && seg.polyline.length >= 2) {
            let pMnx = Infinity, pMxx = -Infinity, pMny = Infinity, pMxy = -Infinity;
            for (const [px, py] of seg.polyline) {
              if (px < pMnx) pMnx = px;
              if (px > pMxx) pMxx = px;
              if (py < pMny) pMny = py;
              if (py > pMxy) pMxy = py;
            }
            if (lineInBox(pMnx, pMny, pMxx, pMxy)) {
              lineKeys.push(computeLineKey(seg.coords));
            }
          } else {
            const [x1, y1, x2, y2] = seg.coords;
            if (lineInBox(x1, y1, x2, y2)) {
              lineKeys.push(computeLineKey(seg.coords));
            }
          }
        }
      }

      if (lineKeys.length > 0 || insertIndices.length > 0 || textIndices.length > 0) {
        onEraseEntities?.(lineKeys, insertIndices, textIndices);
      }
      setMarquee(null);
    },
    [
      eraseMode, marquee, pointerHandlers, viewport, geometry, allEdgeSegments,
      hiddenLayers, isLineHidden, isInsertHidden, isTextHidden, computeLineKey, onEraseEntities, handleClick,
    ],
  );

  // Esc → clear selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedLine(null);
        setHovered(null);
        setMarquee(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const usingEdges = !!edgeSegments && edgeSegments.length > 0;
  const lineCount = usingEdges ? edgeSegments!.length : (geometry?.lines.length ?? 0);
  const insertCount = geometry?.inserts?.length ?? 0;
  const layerCount = geometry?.layer_colors ? Object.keys(geometry.layer_colors).length : 0;

  const cursorClass = eraseMode ? 'cursor-cell' : (hovered ? 'cursor-pointer' : 'cursor-crosshair');

  return (
    <div className={`flex flex-col rounded-xl border border-slate-700 overflow-hidden bg-slate-950 ${className}`}>
      <div
        ref={containerRef}
        className={`relative flex-1 overflow-hidden ${cursorClass}`}
        style={{ touchAction: 'none', backgroundColor: COLOR_BG }}
        onPointerDown={handleErasePointerDown}
        onPointerMove={handleErasePointerMove}
        onPointerUp={handleErasePointerUp}
        onPointerCancel={pointerHandlers.onPointerCancel}
        onPointerLeave={() => {
          setCursorWorld(null);
          setCursorScreen(null);
          setHovered(null);
        }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />

        {/* MARQUEE SELECTION BOX — AutoCAD davranisi:
            sol→sag (sx2 > sx1) = WINDOW (mavi, solid border, sadece TAMAMEN icerde)
            sag→sol (sx2 < sx1) = CROSSING (yesil, dashed border, kesisen de secilir) */}
        {marquee && (
          <div
            className={
              'pointer-events-none absolute z-20 border-2 ' +
              (marquee.sx2 > marquee.sx1
                ? 'border-blue-400 bg-blue-500/15'
                : 'border-emerald-400 bg-emerald-500/15 [border-style:dashed]')
            }
            style={{
              left: Math.min(marquee.sx1, marquee.sx2),
              top: Math.min(marquee.sy1, marquee.sy2),
              width: Math.abs(marquee.sx2 - marquee.sx1),
              height: Math.abs(marquee.sy2 - marquee.sy1),
            }}
          />
        )}

        {/* SILGI MODU AKTIF badge */}
        {eraseMode && (
          <div className="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg">
            <Eraser className="h-3 w-3" />
            SILGI AKTIF · Esc ile cik
          </div>
        )}

        {/* PENDING ERASE toolbar — secildi ama silinmedi, onay/iptal.
            stopPropagation: silgi modu pointerDown viewer container'a capture
            yapiyor; double-safety olarak toolbar level'da event'i durdur. */}
        {pendingCount > 0 && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={
              'absolute right-2 z-20 flex items-center gap-2 rounded-md border border-orange-400/60 bg-slate-900/95 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm ' +
              (eraseMode ? 'top-10' : 'top-2')
            }
          >
            <span className="flex items-center gap-1 text-orange-300">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.8)]" />
              {pendingCount} oge secildi
            </span>
            {onConfirmPendingErase && (
              <button
                type="button"
                onClick={onConfirmPendingErase}
                className="flex items-center gap-1 rounded bg-rose-600 px-2 py-0.5 text-white hover:bg-rose-700"
                title="Secimi sil (Enter)"
              >
                <Check className="h-3 w-3" />
                Sil (Enter)
              </button>
            )}
            {onCancelPendingErase && (
              <button
                type="button"
                onClick={onCancelPendingErase}
                className="flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-slate-200 hover:bg-slate-600"
                title="Secimi iptal et (Esc)"
              >
                <X className="h-3 w-3" />
                Iptal (Esc)
              </button>
            )}
          </div>
        )}

        {/* Toolbar */}
        <div className="absolute left-2 top-2 z-10 flex gap-1 rounded-md bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-1">
          <button type="button" onClick={zoomIn} className="rounded p-1.5 text-slate-300 hover:bg-slate-700" title="Yakinlas">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={zoomOut} className="rounded p-1.5 text-slate-300 hover:bg-slate-700" title="Uzaklas">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={fitView} className="rounded p-1.5 text-slate-300 hover:bg-slate-700" title="Cerceveye sigdir (F)">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          {/* SILGI MODU butonu */}
          {onToggleEraseMode && (
            <button
              type="button"
              onClick={onToggleEraseMode}
              className={
                'rounded p-1.5 transition-colors ' +
                (eraseMode
                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                  : 'text-slate-300 hover:bg-slate-700')
              }
              title={eraseMode ? 'Silgi modu AKTIF — tek tik veya kare ile sil. Esc ile cik.' : 'Silgi modu (sil)'}
            >
              <Eraser className="h-3.5 w-3.5" />
            </button>
          )}
          {/* UNDO — son silmeyi geri al */}
          {onUndoErase && (
            <button
              type="button"
              onClick={onUndoErase}
              disabled={!canUndoErase}
              className={
                'rounded p-1.5 transition-colors ' +
                (canUndoErase ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 cursor-not-allowed')
              }
              title="Son silmeyi geri al (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          )}
          {/* TUMUNU GERI GETIR */}
          {onRestoreAllErased && canUndoErase && (
            <button
              type="button"
              onClick={onRestoreAllErased}
              className="rounded p-1.5 text-slate-300 hover:bg-slate-700"
              title="Tum silinen objeleri geri getir"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Tooltip — hover ya da selected uzerinde */}
        {(selectedLine || hovered) && cursorScreen && (
          <Tooltip
            entity={selectedLine ?? hovered!}
            screenX={cursorScreen.x}
            screenY={cursorScreen.y}
            pinned={!!selectedLine}
          />
        )}

        {/* States */}
        {!fileId && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-sm text-slate-300">
            Cizim icin once DWG yukleyin
          </div>
        )}
        {fileId && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              <p className="text-xs text-slate-300">Cizim hazirlaniyor...</p>
              <p className="text-[10px] text-slate-500">Render free tier cold-start: ~80sn'ye kadar surebilir</p>
            </div>
          </div>
        )}
        {fileId && !loading && error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-4">
            <div className="flex items-start gap-2 max-w-md">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Cizim yuklenemedi</p>
                <p className="text-xs text-slate-300 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-slate-700 bg-slate-900/95 px-3 py-1.5 text-[11px] text-slate-400">
        <div className="flex items-center gap-3">
          {cursorWorld ? (
            <span className="font-mono tabular-nums">
              X: {cursorWorld.x.toFixed(2)} · Y: {cursorWorld.y.toFixed(2)}
            </span>
          ) : (
            <span>koordinat yok</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular-nums">Zoom: {(viewport.zoom * 100).toFixed(1)}%</span>
          <span>·</span>
          <span className="tabular-nums">{lineCount} cizgi</span>
          <span>·</span>
          <span className="tabular-nums">{insertCount} ekipman</span>
          <span>·</span>
          <span className="tabular-nums">{layerCount} layer</span>
          <span className="ml-2 rounded bg-emerald-900/50 px-1.5 py-0.5 text-[10px] text-emerald-400">Canvas2D</span>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// computeEntityLength + resolveHoverLength artik ./segment-length modulunde
// (izole test edilebilir, Auto-mode scale=0 bug fix orada).

// ─── Tooltip subcomponent ───────────────────────────────────────────

interface TooltipProps {
  entity: HoveredEntity;
  screenX: number;
  screenY: number;
  /** Selected ise (tıklanmıs), hover ise false. Pinned tooltip biraz daha belirgin. */
  pinned: boolean;
}

function Tooltip({ entity, screenX, screenY, pinned }: TooltipProps) {
  // Farenin sag-altinda (+14, +14) — PRD'ye uygun. Ekran kenarina tasarsa ayarla.
  const offsetX = 14;
  const offsetY = 14;
  return (
    <div
      className={`pointer-events-none absolute z-20 rounded-lg border px-3 py-1.5 shadow-xl backdrop-blur-sm transition-opacity ${
        pinned
          ? 'border-blue-400 bg-blue-900/95 text-white'
          : 'border-amber-400/60 bg-slate-900/95 text-amber-100'
      }`}
      style={{
        left: `${screenX + offsetX}px`,
        top: `${screenY + offsetY}px`,
        maxWidth: '320px',
      }}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-70">
        {entity.type === 'edge' ? 'Segment' : 'Boru'}
      </div>
      <div className="mt-0.5 text-sm font-semibold truncate" title={entity.layer}>
        {entity.layer}
      </div>
      {!isUnassignedDiameter(entity.diameter) && (
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-xs opacity-70">Cap:</span>
          <span className="font-mono text-sm font-bold tabular-nums">
            {entity.diameter}
          </span>
          {entity.isInherited && (
            <span
              className="ml-1 text-[10px] opacity-75 italic"
              title="Cap, komsu segmentten graph BFS ile miras alindi"
            >
              ↳ miras
            </span>
          )}
        </div>
      )}
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xs opacity-70">Uzunluk:</span>
        <span className="font-mono text-sm font-bold tabular-nums">
          {entity.length.toFixed(2)}
        </span>
        <span className="text-xs opacity-70">m</span>
      </div>
      {pinned && (
        <div className="mt-1 text-[10px] opacity-60">Esc ile kaldir</div>
      )}
    </div>
  );
}
