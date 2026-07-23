'use client';

// ── Şık, tıklanan-yerde onay (native window.confirm yerine) ──
// Toast ile aynı singleton desen: modul-seviye state + global renderer
// (ConfirmRoot, layout'ta). confirm() Promise<boolean> döner → drop-in:
//   if (!(await confirm('Silinsin mi?'))) return;
// Popover, SON pointer koordinatında açılır ("tıklama yaptığın yerde").

import * as React from 'react';

export interface ConfirmOptions {
  /** Ana soru metni (zorunlu içerik). */
  description: string;
  /** Opsiyonel başlık (kalın). */
  title?: string;
  /** Onay butonu metni. Varsayılan "Sil". */
  confirmText?: string;
  /** Vazgeç butonu metni. Varsayılan "Vazgeç". */
  cancelText?: string;
  /** danger → kırmızı onay butonu (silme). default → mavi (aktar/kaydet). */
  tone?: 'danger' | 'default';
}

interface ConfirmState {
  open: boolean;
  x: number;
  y: number;
  opts: ConfirmOptions;
  resolve?: (v: boolean) => void;
}

let state: ConfirmState = { open: false, x: 0, y: 0, opts: { description: '' } };
const listeners = new Set<(s: ConfirmState) => void>();

// Son pointer konumu — confirm() bunu popover ankraji olarak kullanır.
let lastPointer = { x: 0, y: 0 };
if (typeof window !== 'undefined') {
  lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  window.addEventListener(
    'pointerdown',
    (e) => { lastPointer = { x: e.clientX, y: e.clientY }; },
    true, // capture: buton kendi handler'ından ÖNCE koordinatı yakala
  );
}

function emit() {
  listeners.forEach((l) => l(state));
}

/**
 * Şık onay sorusu göster; kullanıcı Onayla → true, Vazgeç/dışarı/Esc → false.
 * @example if (!(await confirm('Bu liste silinsin mi?'))) return;
 */
export function confirm(input: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof input === 'string' ? { description: input } : input;
  return new Promise((resolve) => {
    // Önceki açık bir onay varsa iptal et (çakışma olmasın).
    state.resolve?.(false);
    state = { open: true, x: lastPointer.x, y: lastPointer.y, opts, resolve };
    emit();
  });
}

function settle(result: boolean) {
  state.resolve?.(result);
  state = { ...state, open: false, resolve: undefined };
  emit();
}

/** ConfirmRoot bileşeni için — state aboneliği + kapatma. */
export function useConfirmController() {
  const [s, setS] = React.useState<ConfirmState>(state);
  React.useEffect(() => {
    listeners.add(setS);
    return () => { listeners.delete(setS); };
  }, []);
  return {
    ...s,
    onConfirm: () => settle(true),
    onCancel: () => settle(false),
  };
}
