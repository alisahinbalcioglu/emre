/**
 * dwg-diameter-engine — public exports.
 *
 * DwgProjectWorkspace.tsx tek tüketici (composition root). Diger dosyalar
 * import etmemeli; izolasyon korunmali.
 */

export { useProximityCalc } from './useProximityCalc';
export { useOriginalColorState } from './useOriginalColorState';
export { default as DiameterLegendPanel } from './DiameterLegendPanel';
export { buildLegendEntries } from './types';
export type {
  ProximitySummary,
  ProximityCalcResult,
  DiameterLegendEntry,
} from './types';
