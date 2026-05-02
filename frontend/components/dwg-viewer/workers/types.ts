/**
 * Worker mesaj sozlesmesi — main thread <-> geometryWorker.
 *
 * Tum mesajlar request/response. Request id ile cevap eslestirilir.
 * Transferable buffer kullanmiyoruz (28K obje icin gereksiz; payload kucuk).
 */

import type { GeometryResult, PickResult } from '../types';

/** Main → Worker request'leri */
export type WorkerRequest =
  | { id: number; kind: 'load'; geometry: GeometryResult }
  | { id: number; kind: 'queryViewport'; bbox: [number, number, number, number] }
  | { id: number; kind: 'pick'; worldX: number; worldY: number; zoom: number }
  | { id: number; kind: 'setHidden'; layers: string[] }
  | { id: number; kind: 'setIsolated'; layer: string | null }
  | { id: number; kind: 'getRelated'; parentBlockId: string };

/** Worker → Main response'lari */
export type WorkerResponse =
  | { id: number; kind: 'loaded'; layerNames: string[]; entityCount: number }
  | { id: number; kind: 'visibleIds'; ids: string[] }
  | { id: number; kind: 'pickResult'; result: PickResult | null }
  | { id: number; kind: 'ack' }
  | { id: number; kind: 'related'; ids: string[] }
  | { id: number; kind: 'error'; message: string };
