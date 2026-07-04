/**
 * dwg-diameter-engine — public exports.
 *
 * DwgProjectWorkspace.tsx tek tüketici (composition root). Diger dosyalar
 * import etmemeli; izolasyon korunmali.
 */

export { useLayerCalc } from './useLayerCalc';
export { useOriginalColorState } from './useOriginalColorState';
export { default as DiameterLegendPanel } from './DiameterLegendPanel';
export { buildLegendEntries } from './types';
export type {
  LayerCalcResult,
  DiameterLegendEntry,
} from './types';
