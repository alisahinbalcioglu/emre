'use client';

/**
 * Worker client — main thread'in geometryWorker ile typed RPC sozlesmesi.
 *
 * Promise-tabanli API. id ile request/response eslestirilir; ayni anda
 * birden fazla call paralel calisabilir. Worker tek instance.
 */

import type { GeometryResult, PickResult } from '../types';
import type { WorkerRequest, WorkerResponse } from './types';

type Pending = {
  resolve: (val: WorkerResponse) => void;
  reject: (err: Error) => void;
};

export class GeometryWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending: Map<number, Pending> = new Map();

  constructor() {
    if (typeof window === 'undefined') return;
    this.worker = new Worker(new URL('./geometryWorker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.addEventListener('message', this.handleMessage);
  }

  private handleMessage = (e: MessageEvent<WorkerResponse>) => {
    const res = e.data;
    const p = this.pending.get(res.id);
    if (!p) return;
    this.pending.delete(res.id);
    if (res.kind === 'error') {
      p.reject(new Error(res.message));
      return;
    }
    p.resolve(res);
  };

  /** Generic post — full WorkerRequest (with id) gonderir, response Promise. */
  private post(req: WorkerRequest): Promise<WorkerResponse> {
    if (!this.worker) {
      return Promise.reject(new Error('Worker yok (SSR ortami?)'));
    }
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(req.id, { resolve, reject });
      this.worker!.postMessage(req);
    });
  }

  private nextRequestId(): number {
    return this.nextId++;
  }

  async load(geometry: GeometryResult): Promise<{ layerNames: string[]; entityCount: number }> {
    const id = this.nextRequestId();
    const r = await this.post({ id, kind: 'load', geometry });
    if (r.kind !== 'loaded') throw new Error(`Beklenmeyen response: ${r.kind}`);
    return { layerNames: r.layerNames, entityCount: r.entityCount };
  }

  async queryViewport(bbox: [number, number, number, number]): Promise<string[]> {
    const id = this.nextRequestId();
    const r = await this.post({ id, kind: 'queryViewport', bbox });
    if (r.kind !== 'visibleIds') throw new Error(`Beklenmeyen response: ${r.kind}`);
    return r.ids;
  }

  async pick(worldX: number, worldY: number, zoom: number): Promise<PickResult | null> {
    const id = this.nextRequestId();
    const r = await this.post({ id, kind: 'pick', worldX, worldY, zoom });
    if (r.kind !== 'pickResult') throw new Error(`Beklenmeyen response: ${r.kind}`);
    return r.result;
  }

  async setHidden(layers: Set<string>): Promise<void> {
    const id = this.nextRequestId();
    const arr: string[] = [];
    layers.forEach((l) => arr.push(l));
    await this.post({ id, kind: 'setHidden', layers: arr });
  }

  async setIsolated(layer: string | null): Promise<void> {
    const id = this.nextRequestId();
    await this.post({ id, kind: 'setIsolated', layer });
  }

  async getRelated(parentBlockId: string): Promise<string[]> {
    const id = this.nextRequestId();
    const r = await this.post({ id, kind: 'getRelated', parentBlockId });
    if (r.kind !== 'related') throw new Error(`Beklenmeyen response: ${r.kind}`);
    return r.ids;
  }

  terminate(): void {
    if (!this.worker) return;
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.terminate();
    this.worker = null;
    this.pending.forEach((p) => p.reject(new Error('Worker terminated')));
    this.pending.clear();
  }
}
