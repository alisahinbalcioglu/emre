/**
 * Pixi v8 Application kurulumu.
 *
 * Asynchronous init pattern (v8 zorunlu): `await app.init({ canvas, ... })`.
 * Renderer WebGL2 default, fallback canvas. Antialiasing aktif.
 */

import { Application } from 'pixi.js';

export interface CreateStageOpts {
  canvas: HTMLCanvasElement;
  background: number;
  resizeTo?: HTMLElement | Window;
}

export async function createPixiStage(opts: CreateStageOpts): Promise<Application> {
  const app = new Application();
  await app.init({
    canvas: opts.canvas,
    background: opts.background,
    antialias: true,
    autoDensity: true,
    resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    resizeTo: opts.resizeTo,
    eventMode: 'static',
  });
  return app;
}

export function destroyPixiStage(app: Application | null): void {
  if (!app) return;
  try {
    app.destroy(false, { children: true, texture: false, textureSource: false });
  } catch {
    // Pixi destroy bazen idempotent degil — yutuyoruz
  }
}
