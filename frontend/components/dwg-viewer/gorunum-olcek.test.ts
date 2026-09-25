/**
 * Yakinlastir / uzaklastir dugmeleri (25.09 inceleme): yalniz `zoom`
 * degisiyordu, pan sabit kaldigi icin dunya ORIJINI yerinde duruyordu —
 * koordinatlari ~150 000 mm olan cizim bir tikta ekranin disina kayiyordu.
 * Dugmeler artik kap merkezinin etrafinda, tekerlekle ayni formulle olcekler.
 */
import { describe, expect, it } from 'vitest';
import { noktaEtrafindaOlcekle } from './useViewport';
import type { Viewport } from './types';

/** Ekran noktasinin altindaki dunya noktasi (viewer'in donusumu, Y ters). */
const dunya = (v: Viewport, mx: number, my: number): [number, number] => [(mx - v.panX) / v.zoom, (v.panY - my) / v.zoom];

// Kap 700 × 600; ~150 000 birimlik koordinatlardaki cizim ortada.
const V: Viewport = { panX: -149_650, panY: 20_300, zoom: 1 };
const MERKEZ: [number, number] = [350, 300];

describe('noktaEtrafindaOlcekle', () => {
  it('merkezdeki dunya noktasi yakinlastirinca yerinde kalir', () => {
    const [x0, y0] = dunya(V, ...MERKEZ);
    const [x1, y1] = dunya(noktaEtrafindaOlcekle(V, 1.3, ...MERKEZ), ...MERKEZ);
    expect([Math.abs(x1 - x0) < 1e-6, Math.abs(y1 - y0) < 1e-6]).toEqual([true, true]);
  });

  it('merkezdeki dunya noktasi uzaklastirinca da yerinde kalir', () => {
    const [x0, y0] = dunya(V, ...MERKEZ);
    const [x1, y1] = dunya(noktaEtrafindaOlcekle(V, 1 / 1.3, ...MERKEZ), ...MERKEZ);
    expect([Math.abs(x1 - x0) < 1e-6, Math.abs(y1 - y0) < 1e-6]).toEqual([true, true]);
  });

  it('zoom carpanla carpilir', () => {
    expect(noktaEtrafindaOlcekle(V, 1.3, ...MERKEZ).zoom).toBeCloseTo(1.3, 9);
  });

  it('ESKI davranis (yalniz zoom) merkezdeki noktayi binlerce birim kaydirirdi — kriteri ihlal eder', () => {
    const [x0] = dunya(V, ...MERKEZ);
    const [x1] = dunya({ ...V, zoom: V.zoom * 1.3 }, ...MERKEZ);
    expect(Math.abs(x1 - x0)).toBeGreaterThan(10_000);
  });
});
