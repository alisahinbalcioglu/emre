import { describe, it, expect } from 'vitest';
import { resolveHoverLength, computeEntityLength } from './segment-length';

describe('resolveHoverLength — Auto-mode scale=0 bug', () => {
  it('BUG-1 repro: edge segment, scale=0 olsa bile backend metre length doner', () => {
    // Eski kod: computeEntityLength(coords, 0) = 0.00 (HATA)
    // Yeni: backend length 5.5m kullanilir
    const entry = {
      type: 'edge' as const,
      length: 5.5,
      coords: [0, 0, 1000, 0] as [number, number, number, number],
    };
    expect(resolveHoverLength(entry, 0)).toBe(5.5);
  });

  it('edge backend length=0 (gecersiz) -> ham hesaba duser', () => {
    const entry = {
      type: 'edge' as const,
      length: 0,
      coords: [0, 0, 1000, 0] as [number, number, number, number],
    };
    expect(resolveHoverLength(entry, 0.001)).toBeCloseTo(1.0);
  });

  it('line segment: backend length yok -> ham koordinat x scale', () => {
    const entry = {
      type: 'line' as const,
      coords: [0, 0, 2000, 0] as [number, number, number, number],
    };
    expect(resolveHoverLength(entry, 0.001)).toBeCloseTo(2.0);
  });
});

describe('computeEntityLength', () => {
  it('coords duz mesafe x scale', () => {
    expect(
      computeEntityLength({ coords: [0, 0, 3000, 4000] }, 0.001),
    ).toBeCloseTo(5.0); // 3-4-5 ucgeni: 5000mm = 5m
  });

  it('polyline vertex toplami x scale', () => {
    expect(
      computeEntityLength(
        { coords: [0, 0, 0, 0], polyline: [[0, 0], [3000, 0], [3000, 4000]] },
        0.001,
      ),
    ).toBeCloseTo(7.0); // 3000 + 4000 = 7000mm = 7m
  });

  it('scale=0 -> 0 (bug kaynagi, computeEntityLength tek basina dogru)', () => {
    expect(computeEntityLength({ coords: [0, 0, 1000, 0] }, 0)).toBe(0);
  });
});
