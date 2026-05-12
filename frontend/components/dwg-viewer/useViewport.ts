'use client';

import { useCallback, useRef, useState, useEffect, RefObject } from 'react';
import type { Viewport } from './types';

interface UseViewportOpts {
  /** DXF world-space bounding box: [minX, minY, maxX, maxY] */
  bounds: [number, number, number, number];
  /** Viewer container ref (wheel/pointer event dinler) */
  containerRef: RefObject<HTMLElement | null>;
  /** Otomatik fit — ilk mount'ta bounds'u cerceveye sigdirir */
  autoFit?: boolean;
}

/**
 * Canvas2D viewer icin zoom/pan state yonetimi.
 * - Wheel: zoom (mouse pozisyonu etrafinda)
 * - Drag: pan
 * - FitView: bounds'u cerceveye sigdir
 */
export function useViewport({ bounds, containerRef, autoFit = true }: UseViewportOpts) {
  const [viewport, setViewport] = useState<Viewport>({ panX: 0, panY: 0, zoom: 1 });
  // Drag vs click ayrimi:
  // - startX/Y: pointer down konumu
  // - capturing: setPointerCapture aktif mi (threshold asilinca true olur)
  // - moved: tiklamayi yutmamak icin hareket oldu mu
  const dragStateRef = useRef<{
    active: boolean; capturing: boolean; moved: boolean;
    startX: number; startY: number; startPanX: number; startPanY: number;
    pointerId: number;
  }>({
    active: false, capturing: false, moved: false,
    startX: 0, startY: 0, startPanX: 0, startPanY: 0, pointerId: -1,
  });
  const DRAG_THRESHOLD = 4; // piksel — bu kadar hareket olmadan click sayilir

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const [minX, minY, maxX, maxY] = bounds;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) {
      setViewport({ panX: 0, panY: 0, zoom: 1 });
      return;
    }
    const rect = el.getBoundingClientRect();
    // Container henuz layout almadiysa zoom hesaplamasi sifir olur — sonraki RAF icin ertele
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const scaleX = rect.width / w;
    const scaleY = rect.height / h;
    let zoom = Math.min(scaleX, scaleY) * 0.92; // %8 padding

    // Guvenlik clip: Patolojik bounds (outlier kalmis olabilir) zoom'u 0'a cekerse
    // fallback olarak zoom=1 ve pan=0 — kullanici wheel ile yaklasabilir.
    if (!Number.isFinite(zoom) || zoom < 1e-6) {
      setViewport({ panX: rect.width / 2, panY: rect.height / 2, zoom: 1 });
      return;
    }

    // Orta noktayi viewport merkezine getir
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setViewport({
      panX: rect.width / 2 - centerX * zoom,
      // Canvas Y ekseni asagi, DWG yukari — negatif
      panY: rect.height / 2 + centerY * zoom,
      zoom,
    });
  }, [bounds, containerRef]);

  // Ilk mount + bounds degisiminde fit — container layout'u beklenmeli
  // Cok katmanli strateji: RAF x2 → yetmedyse 100ms sonra tekrar dene
  useEffect(() => {
    if (!autoFit) return;
    let raf1 = 0, raf2 = 0, retryTimer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const tryFit = () => {
      if (done) return;
      const el = containerRef.current;
      if (el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0) {
        fitView();
        done = true;
      }
    };

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        tryFit();
        if (!done) {
          // Container hala 0 — layout bitmemis. 100ms sonra tekrar dene.
          retryTimer = setTimeout(tryFit, 100);
        }
      });
    });

    return () => {
      done = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [autoFit, fitView, containerRef]);

  // Wheel zoom logic — hem native hem React onWheel icin ortak
  const applyWheel = useCallback((deltaY: number, clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const factor = deltaY < 0 ? 1.15 : 1 / 1.15;

    setViewport((v) => {
      const newZoom = v.zoom * factor;
      const worldX = (mx - v.panX) / v.zoom;
      const worldY = (v.panY - my) / v.zoom; // Y ters
      return {
        zoom: newZoom,
        panX: mx - worldX * newZoom,
        panY: my + worldY * newZoom,
      };
    });
  }, [containerRef]);

  // Native wheel listener — React synthetic event'in passive problemine karsi yedek
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      applyWheel(e.deltaY, e.clientX, e.clientY);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef, applyWheel]);

  // React onWheel — yedek, native listener primary path'i
  const onWheelReact = useCallback((e: React.WheelEvent) => {
    // preventDefault React 18'de passive mode ile calismaz — native listener asil is yapar
    applyWheel(e.deltaY, e.clientX, e.clientY);
  }, [applyWheel]);

  // Pointer down — DRAG BASLATMA, ama capture ALMA (click'i yutmasin).
  // Capture yalnizca DRAG_THRESHOLD asildigin da alinir.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    dragStateRef.current = {
      active: true,
      capturing: false,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: viewport.panX,
      startPanY: viewport.panY,
      pointerId: e.pointerId,
    };
  }, [viewport.panX, viewport.panY]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = dragStateRef.current;
    if (!s.active) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    // Threshold'u asmadikca drag baslamaz (tiklama olabilir)
    if (!s.capturing) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      s.capturing = true;
      s.moved = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    }
    setViewport((v) => ({ ...v, panX: s.startPanX + dx, panY: s.startPanY + dy }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const s = dragStateRef.current;
    if (s.capturing) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    }
    dragStateRef.current.active = false;
    dragStateRef.current.capturing = false;
  }, []);

  /** Bir alt bilesenin tiklama handler'i: drag olduysa click iptal edilmeli */
  const wasDragged = useCallback(() => dragStateRef.current.moved, []);

  const zoomIn = useCallback(() => setViewport((v) => ({ ...v, zoom: v.zoom * 1.3 })), []);
  const zoomOut = useCallback(() => setViewport((v) => ({ ...v, zoom: v.zoom / 1.3 })), []);

  return {
    viewport,
    fitView,
    zoomIn,
    zoomOut,
    onWheelReact,
    wasDragged,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
