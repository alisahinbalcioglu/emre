'use client';

/**
 * useOriginalColorState — viewer'da cap-bazli dinamik renkler ile orijinal
 * (layer ACI) renkler arasinda toggle yonetir.
 *
 * PRD §5: "Kaydet" sonrasi cap renkleri kaldirilir, layer orijinal rengine
 * doner. State temizlenmez — sadece RENDER bayragi false olur.
 *
 * Kullanim:
 *   const { useDiameterColors, enable, restore } = useOriginalColorState();
 *   <DxfCanvasViewer useDiameterColors={useDiameterColors} ... />
 *
 *   // Hesaplama sonrasi enable() (zaten default true, manuel cagriya gerek
 *   //   yok ama save sonra restore() yapildiysa yeni hesaplama icin gerek)
 *   // onApproved sonrasi: restore()
 */

import { useCallback, useState } from 'react';

export function useOriginalColorState() {
  // Default: cap renkleri AKTIF. Yeni hesaplamada otomatik renkli gosterilir.
  const [useDiameterColors, setUseDiameterColors] = useState<boolean>(true);

  const enableDiameterColors = useCallback(() => {
    setUseDiameterColors(true);
  }, []);

  /** PRD §5 kritik: save sonrasi cap renklerini kapat, layer orijinal rengine don. */
  const restoreOriginalColors = useCallback(() => {
    setUseDiameterColors(false);
  }, []);

  return { useDiameterColors, enableDiameterColors, restoreOriginalColors };
}
