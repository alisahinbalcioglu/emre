/**
 * DWG Metraj barrel — boru/cap hesabi public API'si.
 * Bu klasor yukleme akisi, edge segment, cap palette ve cap UI'sini iceririr.
 */

export { default as DwgUploader } from './DwgUploader';
export { default as MetrajEditor } from './MetrajEditor';
export { default as DiameterEditPopup } from './DiameterEditPopup';

export type { EdgeSegment, MetrajResult, LayerMetraj, PipeSegment, MetrajEquipment } from './types';
export { diameterToColor, buildDiameterPalette } from './diameter-colors';
