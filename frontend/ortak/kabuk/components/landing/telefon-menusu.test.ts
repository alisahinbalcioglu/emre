import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TelefonMenusu } from './TelefonMenusu';

/**
 * TELEFONDA "FİYATLAR" BAĞLANTISI — DOM + BAĞLANTI KAPISI
 * (Faz 6.1 kapanış, 15.09.2026)
 *
 * Kusur: anasayfanın tek menüsü `hidden md:flex` idi; 768 pikselin altında
 * /fiyatlar'a giden bağlantı YOKTU. Eski kapı (`fiyat-sayfasi.test.ts`) yalnız
 * `href="/fiyatlar"` METNİNİN kaynakta olduğuna bakıyordu, görünür olup
 * olmadığına bakmıyordu — o yüzden yeşildi.
 *
 * İKİ KATMAN:
 *   · MANTIK (DOM): `TelefonMenusu` react-dom/server ile GERÇEKTEN çizilir;
 *     çizilen `<a href="/fiyatlar">` ve bütün ataları telefonda gizleyen
 *     sınıf taşımamalı.
 *   · BAĞLANTI (AST): bileşen anasayfanın `<header>`ında kullanılıyor ve
 *     sayfadaki hiçbir ata onu gizlemiyor; hukuki sayfa başlığında da
 *     görünür bir /fiyatlar bağlantısı var. (Sayfalar vitest'te içe
 *     aktarılamıyor: `@/` takma adı yok.)
 *
 * GÖRÜNÜRLÜK ÖLÇÜTÜ (≤640px, Tailwind varsayılan kırılımları): öğe ya da bir
 * atası telefonda geçerli bir GİZLEYEN sınıf, `hidden` özniteliği,
 * `aria-hidden="true"` ya da gizleyen satır içi stil taşıyorsa telefonda
 * GÖRÜNMEZ.
 *   · telefonda geçerli önek: öneksiz, `sm:` (640 dahil), `max-*:`, `dark:`;
 *     `!` önemi soyulur. `md:`/`lg:` (≥768) ve `hover:`/`focus:` gibi durum
 *     önekleri telefonda durağan ekranda uygulanmaz → görünür sayılır.
 *   · tek başına gizleyen: hidden, invisible, collapse, sr-only, opacity-0,
 *     scale-0, text-transparent.
 *   · birlikte gizleyen: sıfır boyut (h-0, max-h-0, w-0, max-w-0, size-0) +
 *     taşma kesme (overflow-hidden / overflow-clip, x/y dahil). `h-0` TEK
 *     BAŞINA gizlemez — içerik taşar ve görünür.
 *   · satır içi stil (DOM katmanı): display:none, visibility:hidden|collapse,
 *     opacity:0, 0 yükseklik/genişlik + overflow hidden|clip.
 * P1-ek (15.09): ölçüt önceden yalnız hidden/invisible/sr-only tanıyordu;
 * nav'a `h-0 overflow-hidden opacity-0` eklenince 13/13 yeşil kalıyordu.
 * ⚠ SINIR: sınıfı ve stili ölçer, çizimi değil — taşma ve kırpma (ör. dar
 * ekranda satırın yana kayması) Chromium ölçümüyle bakılır. AST katmanı
 * (sayfa ataları) yalnız düz `className` metnini okur, `style={{…}}` nesnesini değil.
 */
const kok = join(__dirname, '..', '..', '..', '..');
const TELEFONDA_GECERLI_ONEK = /^(?:sm|max-[\w[\]-]+|dark)$/;
const TEK_BASINA_GIZLEYEN = /^(?:hidden|invisible|collapse|sr-only|opacity-0|scale-0|scale-[xy]-0|text-transparent)$/;
const SIFIR_BOYUT = /^(?:h-0|max-h-0|w-0|max-w-0|size-0)$/;
const TASMA_KESEN = /^overflow(?:-[xy])?-(?:hidden|clip)$/;
/** Sınıf listesinden telefonda (durağan ekranda) geçerli yardımcılar, öneksiz hâlleriyle. */
const telefondaGecerliSiniflar = (sinif: string | undefined) =>
  (sinif ?? '').split(/\s+/).filter(Boolean).flatMap((t) => {
    const parca = t.split(':');
    const arac = (parca.pop() ?? '').replace(/^!/, '');
    return parca.every((o) => TELEFONDA_GECERLI_ONEK.test(o)) ? [arac] : [];
  });
const gizleyenSinifVar = (sinif: string | undefined) => {
  const s = telefondaGecerliSiniflar(sinif);
  return s.some((t) => TEK_BASINA_GIZLEYEN.test(t)) || (s.some((t) => SIFIR_BOYUT.test(t)) && s.some((t) => TASMA_KESEN.test(t)));
};
const gizleyenStilVar = (stil: string | undefined) => {
  const s = stil ?? '';
  const sifirBoyut = /(?:^|;)\s*(?:max-)?(?:height|width)\s*:\s*0(?:px)?\s*(?:;|$)/i.test(s);
  return (
    /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0(?:\.0+)?)\s*(?:;|$)/i.test(s) ||
    (sifirBoyut && /overflow(?:-[xy])?\s*:\s*(?:hidden|clip)/i.test(s))
  );
};

// ── MANTIK: çizilen HTML'de bağlantı ve ataları ─────────────────────────────
type Dugum = { etiket: string; oz: Record<string, string>; ata: Dugum[] };
const BOS_OGELER = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source']);

/** react-dom/server çıktısı iyi biçimlidir; etiket yığınıyla ata zinciri kurulur. */
function htmlDugumleri(html: string): Dugum[] {
  const yigin: Dugum[] = [];
  const hepsi: Dugum[] = [];
  // Array.from: tsconfig hedefi ES5, yineleyici doğrudan for-of ile gezilemez.
  for (const m of Array.from(html.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>/g))) {
    const [, kapanis, etiket, ozHam, kendiKapanan] = m;
    if (kapanis) {
      yigin.pop();
      continue;
    }
    const oz = Object.fromEntries(Array.from(ozHam.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)).map((x) => [x[1], x[2] ?? '']));
    const d: Dugum = { etiket, oz, ata: [...yigin] };
    hepsi.push(d);
    if (!kendiKapanan && !BOS_OGELER.has(etiket)) yigin.push(d);
  }
  return hepsi;
}
const telefondaGorunur = (d: Dugum) =>
  [...d.ata, d].every(
    (o) => !gizleyenSinifVar(o.oz.class) && !gizleyenStilVar(o.oz.style) && !('hidden' in o.oz) && o.oz['aria-hidden'] !== 'true',
  );
const fiyatBaglantilari = (html: string) =>
  htmlDugumleri(html).filter((d) => d.etiket === 'a' && d.oz.href === '/fiyatlar');

describe('Ölçütün kendisi — görünürlük sınıftan doğru okunuyor', () => {
  const tek = (html: string) => {
    const b = fiyatBaglantilari(html);
    expect(b).toHaveLength(1);
    return telefondaGorunur(b[0]);
  };

  it('masaüstü menüsü (hidden md:flex) telefonda GÖRÜNMEZ', () => {
    expect(tek('<nav class="hidden items-center md:flex"><a class="x" href="/fiyatlar">F</a></nav>')).toBe(false);
  });

  it('telefon satırı (flex md:hidden) telefonda GÖRÜNÜR', () => {
    expect(tek('<header><nav class="flex md:hidden"><a href="/fiyatlar">F</a></nav></header>')).toBe(true);
  });

  it.each([
    '<div class="sm:hidden"><a href="/fiyatlar">F</a></div>',
    '<div class="max-md:hidden"><span><a href="/fiyatlar">F</a></span></div>',
    '<div hidden=""><a href="/fiyatlar">F</a></div>',
    '<div aria-hidden="true"><a href="/fiyatlar">F</a></div>',
    '<div><a class="sr-only" href="/fiyatlar">F</a></div>',
    // P1-ek: sınıf listesinin önceden tanımadığı gizlemeler
    '<nav class="flex opacity-0"><a href="/fiyatlar">F</a></nav>',
    '<nav class="flex h-0 overflow-hidden opacity-0"><a href="/fiyatlar">F</a></nav>',
    '<nav class="flex h-0 overflow-hidden"><a href="/fiyatlar">F</a></nav>',
    '<div class="w-0 overflow-x-clip"><a href="/fiyatlar">F</a></div>',
    '<div class="max-h-0 overflow-y-hidden"><a href="/fiyatlar">F</a></div>',
    '<div><a class="invisible" href="/fiyatlar">F</a></div>',
    '<div class="collapse"><a href="/fiyatlar">F</a></div>',
    '<div class="scale-0"><a href="/fiyatlar">F</a></div>',
    '<div><a class="text-transparent" href="/fiyatlar">F</a></div>',
    '<div class="max-sm:opacity-0"><a href="/fiyatlar">F</a></div>',
    '<div class="sm:!hidden"><a href="/fiyatlar">F</a></div>',
    '<div class="dark:invisible"><a href="/fiyatlar">F</a></div>',
    '<div style="opacity:0"><a href="/fiyatlar">F</a></div>',
    '<div style="display:none"><a href="/fiyatlar">F</a></div>',
    '<div style="visibility:hidden"><a href="/fiyatlar">F</a></div>',
    '<div style="height:0;overflow:hidden"><a href="/fiyatlar">F</a></div>',
  ])('gizleyen ata ya da öznitelik yakalanır: %s', (html) => {
    expect(tek(html)).toBe(false);
  });

  it.each([
    '<div class="h-0"><a href="/fiyatlar">F</a></div>', // taşma kesilmiyor → içerik görünür
    '<div class="md:opacity-0 lg:hidden hover:opacity-0 group-hover:invisible"><a href="/fiyatlar">F</a></div>',
    '<div class="opacity-100 overflow-hidden"><a href="/fiyatlar">F</a></div>',
    '<div class="lg:h-0 overflow-hidden"><a href="/fiyatlar">F</a></div>',
    '<div class="collapse-title"><a href="/fiyatlar">F</a></div>',
    '<div style="opacity:0.5;height:10px"><a href="/fiyatlar">F</a></div>',
  ])('telefonda gizlemeyen sınıf/stil yanlış kırmızı üretmez: %s', (html) => {
    expect(tek(html)).toBe(true);
  });

  it('kapanan kardeş öğe atadan sayılmaz', () => {
    expect(tek('<nav><span class="hidden">x</span><a href="/fiyatlar">F</a></nav>')).toBe(true);
  });
});

describe('TelefonMenusu — çizilen DOM (mantık)', () => {
  const html = renderToStaticMarkup(createElement(TelefonMenusu));

  it('/fiyatlar bağlantısı çiziliyor ve telefonda GÖRÜNÜR', () => {
    const b = fiyatBaglantilari(html);
    expect(b).toHaveLength(1);
    expect(telefondaGorunur(b[0])).toBe(true);
  });

  it('tek dokunuş: düz bağlantı (<a href>), açılır menü ya da düğme arkasında değil', () => {
    const d = htmlDugumleri(html);
    expect(d.some((o) => o.etiket === 'button' || 'aria-expanded' in o.oz)).toBe(false);
    expect(html).toMatch(/<a [^>]*href="\/fiyatlar"[^>]*>Fiyatlar<\/a>/);
  });

  it('satır sırası: Özellikler · Nasıl Çalışır? · Fiyatlar — yalnız telefonda (md:hidden)', () => {
    const baglantilar = htmlDugumleri(html).filter((o) => o.etiket === 'a').map((o) => o.oz.href);
    expect(baglantilar).toEqual(['#ozellikler', '#nasil-calisir', '/fiyatlar']);
    expect(html).toMatch(/>Özellikler<\/a>.*>Nasıl Çalışır\?<\/a>.*>Fiyatlar<\/a>/);
    const nav = htmlDugumleri(html).find((o) => o.etiket === 'nav');
    expect((nav?.oz.class ?? '').split(/\s+/)).toContain('md:hidden');
  });
});

// ── BAĞLANTI: sayfalarda gerçekten kullanılıyor mu ───────────────────────────
type JsxOge = ts.JsxElement | ts.JsxSelfClosingElement;
const ayristir = (yol: string) =>
  ts.createSourceFile(yol, readFileSync(join(kok, yol), 'utf-8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const acilis = (o: JsxOge) => (ts.isJsxElement(o) ? o.openingElement : o);
const ad = (o: JsxOge) => acilis(o).tagName.getText();
function oznitelikMetni(o: JsxOge, adi: string): string | undefined {
  const a = acilis(o).attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === adi);
  return a?.initializer && ts.isStringLiteral(a.initializer) ? a.initializer.text : undefined;
}
function ogeler(sf: ts.SourceFile, kosul: (o: JsxOge) => boolean): JsxOge[] {
  const out: JsxOge[] = [];
  const gez = (n: ts.Node): void => {
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && kosul(n)) out.push(n);
    n.forEachChild(gez);
  };
  gez(sf);
  return out;
}
/** Öğenin sayfadaki JSX ataları (içten dışa). */
function jsxAtalari(o: ts.Node): ts.JsxElement[] {
  const out: ts.JsxElement[] = [];
  for (let p = o.parent; p; p = p.parent) if (ts.isJsxElement(p)) out.push(p);
  return out;
}
const sayfadaGorunur = (o: JsxOge) =>
  [o, ...jsxAtalari(o)].every((x) => !gizleyenSinifVar(oznitelikMetni(x, 'className')) && oznitelikMetni(x, 'aria-hidden') !== 'true');

describe('Bağlantı — başlıklar telefonda Fiyatlar\'a yol veriyor', () => {
  it('anasayfa: TelefonMenusu <header> içinde ve hiçbir ata onu gizlemiyor', () => {
    const sf = ayristir('app/page.tsx');
    const kullanim = ogeler(sf, (o) => ad(o) === 'TelefonMenusu');
    expect(kullanim).toHaveLength(1);
    expect(jsxAtalari(kullanim[0]).map((a) => ad(a))).toContain('header');
    expect(sayfadaGorunur(kullanim[0])).toBe(true);
    expect(sf.statements.some((s) => ts.isImportDeclaration(s) && /landing\/TelefonMenusu['"]/.test(s.moduleSpecifier.getText()))).toBe(true);
  });

  it('hukuki sayfa başlığı: <header> içinde her genişlikte görünen /fiyatlar bağlantısı', () => {
    const sf = ayristir('ozellik/hukuki/HukukiSayfa.tsx');
    const baglanti = ogeler(sf, (o) => ad(o) === 'Link' && oznitelikMetni(o, 'href') === '/fiyatlar');
    expect(baglanti).toHaveLength(1);
    expect(jsxAtalari(baglanti[0]).map((a) => ad(a))).toContain('header');
    expect(sayfadaGorunur(baglanti[0])).toBe(true);
    expect(
      [baglanti[0], ...jsxAtalari(baglanti[0])].some((x) => /(^|\s)(sm|md|lg|xl):(hidden|invisible)(\s|$)/.test(oznitelikMetni(x, 'className') ?? '')),
    ).toBe(false);
  });
});
