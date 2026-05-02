'use client';

import { useEffect, useState } from 'react';

/**
 * RAF-tabanli debounced state.
 *
 * Hizli degisen bir input'u (ornegin viewport.zoom wheel patladiginda) bir
 * sessizlik penceresi sonunda tek seferde yansitir. Aradaki tetiklemeler atilir.
 *
 * Kullanim: zoom wheel her tikta `setViewport` calisir, ama layer modullerinin
 * `g.clear()+redraw` yapmasini wheel-burst boyunca ertelemek istiyoruz; sadece
 * son zoom degeriyle 1 redraw yeterli. Pan/zoom anlik olarak GPU'da uygulanir;
 * sadece stroke-width re-tessellation gibi pahali isler bu hook'la gec yapilir.
 *
 * @param value Takip edilen deger
 * @param ms Sessizlik penceresi (default 80ms — yaklasik 5 frame)
 */
export function useRafDebounce<T>(value: T, ms = 80): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);

  return debounced;
}
