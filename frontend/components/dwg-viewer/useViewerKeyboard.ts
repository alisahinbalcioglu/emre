'use client';

/**
 * Klavye kisayollari hook'u — AutoCAD'den gelen kullanicilar icin
 * tanidik kisayollar. Sadece viewer aktif iken (mouse uzerinde veya
 * focus'ta) calisir, input/textarea/contenteditable focus'tayken
 * tetiklenmez.
 *
 * Kisayollar:
 *   F           — Fit to screen (cizimi cerceveye sigdir)
 *   Esc         — Secimi temizle (selectedLayer = null)
 *   + / =       — Zoom in
 *   -           — Zoom out
 *   G           — Grid toggle
 *   Ctrl+Home   — Reset view (fit + clear selection)
 *
 * Tum kisayollar viewer container icine veya disinda iken çalışır;
 * input alanlari focused iken atlanir.
 */

import { useEffect } from 'react';

export interface ViewerKeyboardOpts {
  enabled?: boolean;
  onFit?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onClearSelection?: () => void;
  onToggleGrid?: () => void;
  onReset?: () => void;
}

/**
 * Bir element'in input gibi davranip davranmadigini kontrol et.
 * Focus orada ise klavye kisayollarini gec — kullanici yaziyor olabilir.
 */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function useViewerKeyboard(opts: ViewerKeyboardOpts) {
  const {
    enabled = true,
    onFit,
    onZoomIn,
    onZoomOut,
    onClearSelection,
    onToggleGrid,
    onReset,
  } = opts;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      // Modifier-li kisayollar
      if (e.ctrlKey && e.key === 'Home') {
        e.preventDefault();
        if (onReset) {
          onReset();
        } else {
          onClearSelection?.();
          onFit?.();
        }
        return;
      }

      // Modifier varsa diger kisayollari atla (tarayici defaultu rahatsiz olmasin)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case 'f':
        case 'F':
          e.preventDefault();
          onFit?.();
          break;
        case 'Escape':
          // Sadece bir secim varsa preventDefault — yoksa modal vb. kapatabilsin
          if (onClearSelection) {
            onClearSelection();
          }
          break;
        case '+':
        case '=': // Turkce klavyede '+' icin Shift+ gerekir, '=' tek tusla
          e.preventDefault();
          onZoomIn?.();
          break;
        case '-':
        case '_':
          e.preventDefault();
          onZoomOut?.();
          break;
        case 'g':
        case 'G':
          e.preventDefault();
          onToggleGrid?.();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, onFit, onZoomIn, onZoomOut, onClearSelection, onToggleGrid, onReset]);
}
