'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface DxfViewerProps {
  dxfBase64: string | null;
  loading?: boolean;
  className?: string;
}

/**
 * 2D DXF viewer — dxf-viewer kutuphanesi ile WebGL render.
 * Dynamic import kullanir (SSR uyumlulugu icin).
 */
export default function DxfViewer({ dxfBase64, loading, className = '' }: DxfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  useEffect(() => {
    if (!dxfBase64 || !containerRef.current) return;

    let cancelled = false;

    async function initViewer() {
      try {
        // Dynamic import — SSR'da calismaz, sadece client'ta
        const { DxfViewer: DxfViewerLib } = await import('dxf-viewer');

        if (cancelled || !containerRef.current) return;

        // Onceki viewer'i temizle
        if (viewerRef.current) {
          try { viewerRef.current.Destroy(); } catch {}
        }
        containerRef.current.innerHTML = '';

        // Canvas olustur
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        containerRef.current.appendChild(canvas);

        // Viewer olustur
        const viewer = new DxfViewerLib(canvas, {
          clearColor: new (await import('three')).Color('#f8fafc'),
          autoResize: true,
          colorCorrection: true,
        });

        viewerRef.current = viewer;

        // Base64 → ArrayBuffer
        const binaryStr = atob(dxfBase64!);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        // DXF yukle
        const blob = new Blob([bytes], { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);

        await viewer.Load({ url, fonts: [] });
        URL.revokeObjectURL(url);

        if (!cancelled) {
          setViewerReady(true);
          setViewerError(null);
        }
      } catch (err: any) {
        console.error('[DxfViewer] Hata:', err);
        if (!cancelled) {
          setViewerError(err?.message ?? 'DXF viewer yuklenemedi');
        }
      }
    }

    initViewer();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        try { viewerRef.current.Destroy(); } catch {}
        viewerRef.current = null;
      }
    };
  }, [dxfBase64]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 rounded-xl border ${className}`}>
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <p className="text-xs text-muted-foreground">Proje yukleniyor...</p>
        </div>
      </div>
    );
  }

  if (!dxfBase64) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 rounded-xl border text-sm text-muted-foreground ${className}`}>
        DWG/DXF yukleyin
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-slate-50 ${className}`}>
      {/* Viewer canvas container */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Hata */}
      {viewerError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/90">
          <div className="text-center">
            <p className="text-sm font-medium text-red-600">Viewer Hatasi</p>
            <p className="text-xs text-muted-foreground mt-1">{viewerError}</p>
          </div>
        </div>
      )}

      {/* Zoom kontrolleri */}
      {viewerReady && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-1">
          <button
            onClick={() => viewerRef.current?.SetScale(viewerRef.current.GetScale() * 1.3)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 border shadow-sm hover:bg-white"
            title="Yakinlastir"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => viewerRef.current?.SetScale(viewerRef.current.GetScale() / 1.3)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 border shadow-sm hover:bg-white"
            title="Uzaklastir"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={() => viewerRef.current?.FitView()}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 border shadow-sm hover:bg-white"
            title="Tumu goster"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
