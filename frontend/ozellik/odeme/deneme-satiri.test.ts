import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { DenemeSatiri } from './DenemeSatiri';
import {
  DENEME_EPOSTA_DOGRULA_METNI,
  DENEME_KULLANILDI_METNI,
  denemeSatiri,
  odemeDenemeNotu,
} from './paket-bicim';

/**
 * FAZ 6.12a — DENEME BİR KEZ: abonelik kartı ve ödeme ekranı (16.09.2026)
 *
 * Sunucu ücretsiz denemeyi her firma ve kişi için bir kez veriyor; hakkı olmayan
 * satın alma engellenmiyor, ilk ay kart girilince alınıyor. Kart bunu ÖNCEDEN
 * söylemezse müşteri "30 gün ücretsiz" okuyup parası çekilmiş olur.
 *
 * MANTIK (saf fonksiyon) + ÇIKTI (bileşen gerçekten render edilir) + BAĞLANTI
 * (sayfa bileşeni ve ödeme notunu gerçekten kullanıyor; AST, yorumlar sayılmaz)
 * + K-P7 (girişsiz fiyat kartı hak bilemez, bu satırı KULLANMAZ).
 */
const kok = join(__dirname, '..', '..');
const kaynak = (yol: string) =>
  ts.createSourceFile(yol, readFileSync(join(kok, yol), 'utf-8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const yorumsuz = (sf: ts.SourceFile) => ts.createPrinter({ removeComments: true }).printFile(sf);

const surum = (ek: Record<string, unknown> = {}) => ({ denemeGunu: 30, ...ek }) as any;

describe('denemeSatiri — karar metni', () => {
  it('hak var: gün sayısı SÜRÜMDEN', () => {
    expect(denemeSatiri(surum({ denemeHakki: true, denemeGerekcesi: 'var' }))).toEqual({ ton: 'olumlu', metin: '30 gün ücretsiz deneme' });
    expect(denemeSatiri(surum({ denemeGunu: 14, denemeHakki: true, denemeGerekcesi: 'var' }))?.metin).toBe('14 gün ücretsiz deneme');
  });

  it('⭐ hak kullanılmış: "Deneme hakkınız daha önce kullanıldı — ilk aylık ücret kart bilgisini girdiğinizde alınır."', () => {
    const s = denemeSatiri(surum({ denemeHakki: false, denemeGerekcesi: 'kullanildi' }));
    expect(s).toEqual({ ton: 'bilgi', metin: DENEME_KULLANILDI_METNI });
    expect(DENEME_KULLANILDI_METNI).toBe('Deneme hakkınız daha önce kullanıldı — ilk aylık ücret kart bilgisini girdiğinizde alınır.');
    expect(s?.metin).not.toContain('ücretsiz deneme');
  });

  it('e-posta doğrulanmamış: gerekçeli uyarı', () => {
    expect(denemeSatiri(surum({ denemeHakki: false, denemeGerekcesi: 'eposta-dogrulanmadi' }))).toEqual({ ton: 'uyari', metin: DENEME_EPOSTA_DOGRULA_METNI });
  });

  it('hak YOK dendiyse tanınmayan gerekçede bile deneme VAAT EDİLMEZ', () => {
    expect(denemeSatiri(surum({ denemeHakki: false, denemeGerekcesi: 'gelecekteki-bir-kod' }))?.ton).toBe('bilgi');
    expect(denemeSatiri(surum({ denemeHakki: false }))?.metin).toBe(DENEME_KULLANILDI_METNI);
  });

  it('denemesiz sürüm: satır YOK; eski sunucu (alan yok): eski satır', () => {
    expect(denemeSatiri(surum({ denemeGunu: 0, denemeHakki: false, denemeGerekcesi: null }))).toBeNull();
    expect(denemeSatiri(surum())).toEqual({ ton: 'olumlu', metin: '30 gün ücretsiz deneme' });
  });
});

describe('odemeDenemeNotu — ödeme ekranı', () => {
  it('⭐ kart deneme dedi, sunucu formdaki bilgiyle hakkı kaldırdı → not', () => {
    expect(odemeDenemeNotu(surum(), { denemeHakki: false })).toBe(DENEME_KULLANILDI_METNI);
  });
  it('hak var / denemesiz sürüm / sürüm bulunamadı → not yok', () => {
    expect(odemeDenemeNotu(surum(), { denemeHakki: true })).toBeNull();
    expect(odemeDenemeNotu(surum({ denemeGunu: 0 }), { denemeHakki: false })).toBeNull();
    expect(odemeDenemeNotu(undefined, { denemeHakki: false })).toBeNull();
  });
});

describe('DenemeSatiri — render çıktısı', () => {
  const html = (s: any) => renderToStaticMarkup(createElement(DenemeSatiri, { surum: s }));

  it('⭐ hakkı olmayana kartta doğru metin görünür, "ücretsiz deneme" görünmez', () => {
    const h = html(surum({ denemeHakki: false, denemeGerekcesi: 'kullanildi' }));
    expect(h).toContain('Deneme hakkınız daha önce kullanıldı — ilk aylık ücret kart bilgisini girdiğinizde alınır.');
    expect(h).toContain('data-deneme-tonu="bilgi"');
    expect(h).not.toContain('ücretsiz deneme');
  });

  it('hak var: yeşil satır; denemesiz sürüm: HİÇ çıktı yok', () => {
    const h = html(surum({ denemeHakki: true, denemeGerekcesi: 'var' }));
    expect(h).toContain('30 gün ücretsiz deneme');
    expect(h).toContain('text-emerald-700');
    expect(html(surum({ denemeGunu: 0 }))).toBe('');
  });
});

describe('Bağlantı — abonelik sayfası satırı ve notu gerçekten kullanıyor', () => {
  const sayfa = kaynak('app/(protected)/abonelik/page.tsx');
  const kod = yorumsuz(sayfa);

  it('⭐ kart <DenemeSatiri surum={p.surum} /> basıyor; eski koşulsuz "gün ücretsiz deneme" satırı YOK', () => {
    // Yazıcı öz-kapanan JSX'i boşluksuz basar (`<X a={b}/>`).
    expect(kod).toMatch(/<DenemeSatiri surum=\{p\.surum\}\s*\/>/);
    expect(kod).not.toMatch(/gün ücretsiz deneme/);
  });

  it('⭐ basla yanıtı notu kuruyor ve ödeme ekranında gösteriliyor', () => {
    expect(kod).toMatch(/setDenemeNotu\(odemeDenemeNotu\(/);
    // Ödeme ekranı: `if (formHtml)` dalından paket listesinin ana dönüşüne kadar.
    const bas = kod.indexOf('if (formHtml)');
    const son = kod.indexOf('max-w-5xl');
    expect(bas).toBeGreaterThan(-1);
    expect(son).toBeGreaterThan(bas);
    const formBlogu = kod.slice(bas, son);
    // FIXTURE KANITI: blok gerçekten ödeme ekranı (iyzico formu burada çiziliyor)
    expect(formBlogu).toContain('<IyzicoFormu');
    expect(formBlogu).toMatch(/\{denemeNotu && \(/);
  });
});

describe('K-P7 — girişsiz fiyat kartı hak bilemez', () => {
  it('FiyatKartlari deneme hakkı alanlarını ve DenemeSatiri bileşenini KULLANMIYOR; gün sayısı sürümden', () => {
    const kart = yorumsuz(kaynak('ozellik/odeme/FiyatKartlari.tsx'));
    expect(kart).not.toMatch(/denemeHakki|denemeGerekcesi|DenemeSatiri/);
    expect(kart).toMatch(/\{p\.surum\.denemeGunu\} gün ücretsiz deneme/);
  });
});
