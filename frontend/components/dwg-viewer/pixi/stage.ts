/**
 * PixiJS v8 Application wrapper.
 *
 * Tek amacı: canvas + Application init/destroy lifecycle'ını
 * React component'ten soyutlamak. DxfPixiViewer bu helper'ı kullanır.
 */

import { Application } from 'pixi.js';

export interface PixiStageOpts {
  canvas: HTMLCanvasElement;
  /** Arka plan rengi (0xRRGGBB). Default: koyu lacivert #0b1220 */
  background?: number;
  /** DPR override. Default: window.devicePixelRatio (retina destek) */
  resolution?: number;
  /** Canvas'ı parent'ın boyutlarına otomatik fit et */
  resizeTo?: HTMLElement;
}

/**
 * PixiJS v8 Application oluşturur ve `init()` bitinceye kadar bekler.
 * Dönen Application hazır — stage'e container eklenebilir.
 *
 * ÖNEMLI: v7 constructor-init yerine v8 async init kullanıyoruz.
 */
export async function createPixiStage(opts: PixiStageOpts): Promise<Application> {
  const app = new Application();
  await app.init({
    canvas: opts.canvas,
    background: opts.background ?? 0x0b1220,
    resolution: opts.resolution ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1),
    // Pixi v8.18.1 + antialias=true + buyuk Graphics path = shader linking bug
    // (logProgramError split null). Antialias kapatildi, MSAA yok ama stabil.
    antialias: false,
    autoDensity: true,
    resizeTo: opts.resizeTo,
    preference: 'webgl',
    // WebGL2 default; WebGL1 fallback driver-bug toleransi icin.
    powerPreference: 'high-performance',
  });
  return app;
}

/**
 * Application'ı güvenle yok et. Canvas DOM'dan kaldırılmaz (React unmount eder).
 * GPU textures, geometry buffers ve event listener'lar temizlenir.
 */
export function destroyPixiStage(app: Application | null): void {
  if (!app) return;
  try {
    app.destroy({ removeView: false }, { children: true, texture: true, textureSource: true });
  } catch {
    // already destroyed — yut
  }
}
