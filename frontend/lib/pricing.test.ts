import { describe, it, expect } from 'vitest';
import { yukariYuvarla, hesaplaNetFiyat, hesaplaSatisBirimFiyat, hesaplaSatirToplam } from './pricing';

// Spec'in "Kucuk kendi kendine test" bolumu — birebir.
describe('fiyat cekirdegi (spec)', () => {
  it('hesaplaNetFiyat(3354.64, 10) === 3019.2 (yukari, 1 hane)', () => {
    expect(hesaplaNetFiyat(3354.64, 10)).toBe(3019.2);
  });

  it('hesaplaNetFiyat(2622.80, 0) === 2622.8 (iskonto 0 → net = liste)', () => {
    expect(hesaplaNetFiyat(2622.80, 0)).toBe(2622.8);
  });

  it('hesaplaSatisBirimFiyat(137.65, 0) === 137.7 (kar 0 → satis = net, 1 haneye yukari)', () => {
    expect(hesaplaSatisBirimFiyat(137.65, 0)).toBe(137.7);
  });

  it('hesaplaSatisBirimFiyat(100, 20) === 120.0', () => {
    expect(hesaplaSatisBirimFiyat(100, 20)).toBe(120.0);
  });

  it('satir toplami = satis × miktar, yukari 1 hane', () => {
    expect(hesaplaSatirToplam(137.7, 78)).toBe(10740.6);
    expect(hesaplaSatirToplam(291.2, 120)).toBe(34944);
  });

  it('float epsilon: zaten 1 haneli deger ust dilime TASINMAZ', () => {
    // 1.1*10 = 11.000000000000002 → naive ceil 1.2 yapardi
    expect(yukariYuvarla(1.1)).toBe(1.1);
    expect(yukariYuvarla(100)).toBe(100);
    expect(yukariYuvarla(2622.8)).toBe(2622.8);
  });

  it('iskonto siniri: 0-100 disina tasan degerler kirpilir', () => {
    expect(hesaplaNetFiyat(100, 150)).toBe(0);
    expect(hesaplaNetFiyat(100, -10)).toBe(100);
  });
});
