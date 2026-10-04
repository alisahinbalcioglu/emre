/**
 * Y4 (02.10) — SURUKLE-DOLDUR OZET TOSTUNUN METNI.
 *
 * Isçilik doldurma ozeti geri geldi (ExcelGrid `_firma` dali); ama sayfanin tost
 * metni eksik sayisini HEP "N markada yok" diye yaziyordu — isçilikte bu yanlis
 * yonlendirme olurdu (kullanici marka menusune bakar, sorun firmadadir).
 * Metin saf yardimciya alindi; bu dosya hem kurali hem SAYFAYA BAGLANTISINI
 * olcer ("mekanizma var, baglanti yok" dersi).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { doldurmaOzetMetni } from './doldurma-ozeti';

describe('doldurmaOzetMetni', () => {
  it('★ ISCILIK: eksikler "firmada yok" yazilir', () => {
    expect(doldurmaOzetMetni({ applied: 5, waiting: 1, missing: 1, hatali: 1, dal: 'iscilik' }))
      .toBe('5 satır güncellendi · 1 seçim bekliyor · 1 firmada yok · 1 sorgu hatası — tekrar deneyin');
  });

  it('MALZEME: eksikler "markada yok" (degismedi)', () => {
    expect(doldurmaOzetMetni({ applied: 2, waiting: 0, missing: 3, dal: 'malzeme' }))
      .toBe('2 satır güncellendi · 3 markada yok');
  });

  it('dal verilmezse eski davranis (malzeme dili)', () => {
    expect(doldurmaOzetMetni({ applied: 0, waiting: 0, missing: 1 })).toBe('1 markada yok');
  });

  it('★ hata sayisi tek basina da gosterilir (sessiz kalmaz)', () => {
    expect(doldurmaOzetMetni({ applied: 0, waiting: 0, missing: 0, hatali: 2, dal: 'iscilik' }))
      .toBe('2 sorgu hatası — tekrar deneyin');
  });

  it('hicbir sey yoksa null (bos tost atilmaz)', () => {
    expect(doldurmaOzetMetni({ applied: 0, waiting: 0, missing: 0, hatali: 0 })).toBeNull();
  });
});

describe('BAGLANTI — teklif duzenleme sayfasi yardimciyi kullanir', () => {
  const sayfa = readFileSync(join(__dirname, '..', '..', 'app', '(protected)', 'quotes', 'new', 'page.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

  it('★ onAutoVariantApplied tostu metni yardimcidan alir', () => {
    expect(sayfa).toMatch(/doldurmaOzetMetni\(/);
  });

  it('★ "markada yok" metni sayfada ELLE yazili kalmadi (iki kaynak ayrisamaz)', () => {
    expect(sayfa).not.toMatch(/markada yok/);
  });
});
