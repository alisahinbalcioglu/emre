'use client';

/**
 * AutoCAD-vari toolbar — viewer'in ust tarafinda overlay.
 *
 * Sol grup: Zoom in / Zoom out / Fit to Screen
 * Sag grup: Grid toggle, Reset view (opsiyonel butonlar)
 */

import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Home } from 'lucide-react';

interface ViewerToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset?: () => void;
  /** Grid toggle — null/undefined ise buton gosterilmez. */
  gridVisible?: boolean;
  onGridToggle?: () => void;
}

/**
 * Tek bir ikon buton — toolbar icinde tutarli stil.
 */
function ToolButton({
  onClick,
  title,
  active = false,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
        active
          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
          : 'text-slate-200 hover:bg-slate-700/60'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-5 w-px bg-slate-700" />;
}

export function ViewerToolbar({
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  gridVisible,
  onGridToggle,
}: ViewerToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-700 bg-slate-900/90 backdrop-blur-sm px-1.5 py-1 shadow-lg">
      <ToolButton onClick={onZoomIn} title="Yakinlastir (+)">
        <ZoomIn className="h-4 w-4" />
      </ToolButton>
      <ToolButton onClick={onZoomOut} title="Uzaklastir (-)">
        <ZoomOut className="h-4 w-4" />
      </ToolButton>
      <Divider />
      <ToolButton onClick={onFit} title="Ekrana Sigdir (F)">
        <Maximize2 className="h-4 w-4" />
      </ToolButton>
      {onReset && (
        <ToolButton onClick={onReset} title="Goruntumu Sifirla (Home)">
          <Home className="h-4 w-4" />
        </ToolButton>
      )}
      {typeof gridVisible === 'boolean' && onGridToggle && (
        <>
          <Divider />
          <ToolButton onClick={onGridToggle} title={gridVisible ? 'Grid Kapat' : 'Grid Ac'} active={gridVisible}>
            <Grid3x3 className="h-4 w-4" />
          </ToolButton>
        </>
      )}
    </div>
  );
}

export default ViewerToolbar;
