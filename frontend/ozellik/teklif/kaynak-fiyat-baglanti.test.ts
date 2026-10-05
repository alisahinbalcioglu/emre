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

// ── F4 (05.10): kip KAYITTAN turetilir, kayit ve geri yukleme kipi tasir ──────
const detay = readFileSync(join(__dirname, '..', '..', 'app', '(protected)', 'quotes', '[id]', 'page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

describe('F4 BAGLANTI — karisik kip sayfalara ve kayda ulasir', () => {
  it('★★ duzenleme sayfasi izgaraya kayittan turetilen kipi verir', () => {
    expect(sayfa).toMatch(/karisikKipMi\(/);
    expect(sayfa).toMatch(/paraBirimiKipi=\{karisikKip \? 'karisik' : 'tl'\}/);
  });
  it('★★ kayit kalemleri karisik kipte TL karsiligi secenegiyle uretilir', () => {
    expect(sayfa).toMatch(/kalemUret\(r, roles as any, karisikKip \? \{ tlKuru: tlKurlari \} : undefined\)/);
  });
  it('★ taslak geri yuklemesi karisik kipi iletir', () => {
    expect(sayfa).toMatch(/restoreRematch\([\s\S]{0,400}?\{ karisik: karisikKipMi\(/);
  });
  it('★★ goruntuleme sayfasi da kipi kayittan turetir', () => {
    expect(detay).toMatch(/paraBirimiKipi=\{karisikKipMi\(sheets\) \? 'karisik' : 'tl'\}/);
  });
});
