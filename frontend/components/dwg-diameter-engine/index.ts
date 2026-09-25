/**
 * dwg-diameter-engine — public exports.
 *
 * DwgProjectWorkspace.tsx tek tüketici (composition root). Diger dosyalar
 * import etmemeli; izolasyon korunmali.
 *
 * 25.09: capraz-layer "Cap Renkleri" paneli (DiameterLegendPanel) kaldirildi —
 * yerini Adim 2'nin secili layer icin metrajli cap listesi aldi
 * (dwg-workspace/cap-gruplari.ts).
 */

export { useLayerCalc } from './useLayerCalc';
export type { HesapSecenekleri } from './useLayerCalc';
export { useOriginalColorState } from './useOriginalColorState';
export type { LayerCalcResult } from './types';
