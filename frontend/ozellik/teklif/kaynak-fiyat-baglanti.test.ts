/**
 * COKLU PARA BIRIMI F2 — BAGLANTI: teklif sayfasinin eslestirme sarmalayicilari
 * motorun `kaynakFiyat`ini izgaraya TASIR.
 *
 * Sarmalayicilar tek-eslesme donusunu ELLE kuruyor (alan alan); `kaynakKur`
 * eklenirken unutulsaydi oldugu gibi `kaynakFiyat` da dusurulurdu ve karisik
 * kip (F6'da uretimde acilinca) dovizli kalemi SESSIZCE ₺ yazardi — izgara
 * kaynak fiyati goremeyince TL nete duser. Aday ve oneri listeleri ham gecer.
 * ("mekanizma var, baglanti yok" dersi; yorumlar soyulur.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sayfa = readFileSync(join(__dirname, '..', '..', 'app', '(protected)', 'quotes', 'new', 'page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

describe('kaynakFiyat sarmalayicidan izgaraya tasinir', () => {
  it('★★ kur tasiyan HER tek-eslesme donusu kaynak fiyati da tasir (malzeme + iscilik)', () => {
    const kurlu = sayfa.split('\n').filter((l) => /return \{ netPrice,.*kaynakKur:/.test(l));
    expect(kurlu.length, 'tek-eslesme donusleri bulunamadi').toBeGreaterThanOrEqual(2);
    for (const l of kurlu) expect(l).toMatch(/kaynakFiyat: \(match as any\)\.kaynakFiyat/);
  });
});
