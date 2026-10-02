/**
 * D11 — surukle-doldur alan kumesi iscilik yetkisine bagli (02.10).
 * Davranisin tarayici olcumu: test/e2e/iscilik-kapali-tutamak.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import { fillAlanlari } from './fill-alanlari';

describe('fillAlanlari — iscilik yetkisi', () => {
  it('★ yetki KAPALI: iscilik alanlari tutamakla doldurulamaz', () => {
    const k = fillAlanlari(false);
    expect(k.has('_iscKar')).toBe(false);
    expect(k.has('_firma')).toBe(false);
  });

  it('yetki KAPALI: malzeme alanlari ve iskonto ETKILENMEZ', () => {
    const k = fillAlanlari(false);
    expect(Array.from(k).sort()).toEqual(['_draftDiscount', '_malzKar', '_marka']);
  });

  it('★ yetki ACIK: bes alanin hepsi doldurulabilir (kapi fazla kapatmiyor)', () => {
    expect(Array.from(fillAlanlari(true)).sort()).toEqual(['_draftDiscount', '_firma', '_iscKar', '_malzKar', '_marka']);
  });

  it('her cagri YENI kume doner — cagiranin degistirmesi digerini bozmaz', () => {
    const a = fillAlanlari(true);
    a.delete('_iscKar');
    expect(fillAlanlari(true).has('_iscKar')).toBe(true);
  });
});
