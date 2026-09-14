import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * PLAN 6.6 KAPISI — anasayfa açılışında inmemesi gereken varlıklar + alt kararları.
 *
 * Ölçüm (canlı eae583e, boş Chromium, 1366×768): açılışta 2.227.607 bayt;
 * en büyüğü 1.017.826 baytlık video (ilk ekranda DEĞİL, 2283 px aşağıda) —
 * `autoPlay` yüzünden tamamı iniyordu; 189.616 baytlık posteri de tarayıcı
 * öznitelik görülür görülmez çekiyordu. Dört büyük ekran görüntüsü ve 15 küçük
 * önizleme de React'in eager `img` için bastığı `<link rel="preload">` ile
 * açılışta iniyordu. Bu test o kapıları ve 16 boş alt'ın kararını kilitler.
 *
 * Bileşen render EDİLMEZ; kaynak TypeScript ayrıştırıcısıyla okunur (fiyat-sayfasi
 * testiyle aynı yöntem): ölçülen şey JSX'te hangi özniteliğin YAZILI olduğu.
 */
const sf = ts.createSourceFile(
  'NasilCalisir.tsx',
  readFileSync(join(__dirname, 'NasilCalisir.tsx'), 'utf-8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

type Oge = { ad: string; dugum: ts.JsxOpeningElement | ts.JsxSelfClosingElement; oz: Map<string, ts.JsxAttribute> };

function ogeler(ad: string): Oge[] {
  const out: Oge[] = [];
  const gez = (n: ts.Node): void => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText() === ad) {
      const oz = new Map<string, ts.JsxAttribute>();
      for (const a of n.attributes.properties) if (ts.isJsxAttribute(a)) oz.set(a.name.getText(), a);
      out.push({ ad, dugum: n, oz });
    }
    n.forEachChild(gez);
  };
  gez(sf);
  return out;
}

/** `preload="none"` → 'none'; `alt=""` → ''; `alt={secili.alt}` → 'secili.alt' (süslü parantezsiz ifade metni). */
const deger = (a: ts.JsxAttribute | undefined): string | undefined => {
  if (!a) return undefined;
  if (!a.initializer) return 'true';
  if (ts.isStringLiteral(a.initializer)) return a.initializer.text;
  if (ts.isJsxExpression(a.initializer)) return a.initializer.expression?.getText();
  return a.initializer.getText();
};

/** Kaynaktaki bütün düğümler içinden koşulu sağlayanlar. */
function dugumler<T extends ts.Node>(sec: (n: ts.Node) => n is T): T[] {
  const out: T[] = [];
  const gez = (n: ts.Node): void => {
    if (sec(n)) out.push(n);
    n.forEachChild(gez);
  };
  gez(sf);
  return out;
}
/** Bir daldaki çağrıların metinleri (`vid.play`, `setPosterBagli` …). */
const cagrilar = (n: ts.Node | undefined): string[] => {
  const out: string[] = [];
  const gez = (d: ts.Node): void => {
    if (ts.isCallExpression(d)) out.push(d.expression.getText());
    d.forEachChild(gez);
  };
  if (n) gez(n);
  return out;
};
const ifler = (kosul: string) => dugumler(ts.isIfStatement).filter((i) => i.expression.getText() === kosul);

describe('Video — ilk ekranda değil, görünür olunca iner', () => {
  const [video] = ogeler('video');

  it('tek video var (ölçütün kendisi)', () => {
    expect(ogeler('video')).toHaveLength(1);
  });

  it('autoPlay YOK — varken preload yok sayılır ve dosyanın tamamı açılışta iner', () => {
    expect(video.oz.has('autoPlay')).toBe(false);
  });

  it('preload="none"', () => {
    expect(deger(video.oz.get('preload'))).toBe('none');
  });

  it('muted + playsInline korunuyor (yoksa programla oynatma engellenir)', () => {
    expect(video.oz.has('muted')).toBe(true);
    expect(video.oz.has('playsInline')).toBe(true);
  });

  it('gözcü görünürken OYNATIR, görünmezken DURAKLATIR — ters koşul açılışta indirirdi', () => {
    const [kosul, ...fazla] = ifler('g.isIntersecting');
    expect(kosul).toBeDefined();
    expect(fazla).toHaveLength(0);
    expect(cagrilar(kosul.thenStatement)).toContain('vid.play');
    expect(cagrilar(kosul.thenStatement)).not.toContain('vid.pause');
    expect(cagrilar(kosul.elseStatement)).toContain('vid.pause');
    expect(cagrilar(kosul.elseStatement)).not.toContain('vid.play');
  });

  it('iki gözcü de videoya BAĞLI (tanımlı olmak yetmez)', () => {
    const baglananlar = dugumler(ts.isCallExpression)
      .filter((c) => /\.observe$/.test(c.expression.getText()))
      .map((c) => c.getText());
    expect(baglananlar.sort()).toEqual(['gozcu.observe(vid)', 'yaklasma.observe(vid)']);
  });

  it('gözcüsüz tarayıcıda da oynar ve poster bağlanır (geri düşüş)', () => {
    const dallar = ifler("typeof IntersectionObserver === 'undefined'").map((i) => cagrilar(i.thenStatement));
    expect(dallar.some((c) => c.includes('vid.play'))).toBe(true);
    expect(dallar.some((c) => c.includes('setPosterBagli'))).toBe(true);
  });

  it('poster ilk HTML\'de yok: yalnız durum doğruyken bağlanır (poster özniteliği görülür görülmez iner)', () => {
    const ifade = video.oz.get('poster')?.initializer;
    expect(ifade && ts.isJsxExpression(ifade) && ifade.expression && ts.isConditionalExpression(ifade.expression)).toBe(true);
    const k = (ifade as ts.JsxExpression).expression as ts.ConditionalExpression;
    expect(k.condition.getText()).toBe('posterBagli');
    expect(k.whenTrue.getText()).toContain('video-poster.jpg');
    expect(k.whenFalse.getText()).toBe('undefined');
  });

  it('posteri yaklaşma gözcüsü bağlıyor (bir ekran boyu önce) ve sonra bırakıyor', () => {
    const yaklasma = dugumler(ts.isNewExpression).find((n) => {
      const ata = n.parent;
      return n.expression.getText() === 'IntersectionObserver' && ts.isVariableDeclaration(ata) && ata.name.getText() === 'yaklasma';
    });
    expect(yaklasma).toBeDefined();
    const [geriCagri, ayar] = yaklasma!.arguments ?? [];
    expect(cagrilar(geriCagri)).toEqual(expect.arrayContaining(['setPosterBagli', 'yaklasma.disconnect']));
    expect(ayar?.getText()).toMatch(/rootMargin:\s*'100% 0px'/);
  });

  it('poster geç geldiği için kutunun oranını width/height tutuyor (içerik kaymasın)', () => {
    expect(video.oz.has('width')).toBe(true);
    expect(video.oz.has('height')).toBe(true);
  });
});

describe('Görseller — tembel yükleme ve 16 alt kararı', () => {
  const imgler = ogeler('img');
  const buyuk = imgler.find((i) => deger(i.oz.get('src'))?.includes('/gorseller/web/') && i.oz.has('width'));
  const kucuk = imgler.find((i) => deger(i.oz.get('src'))?.includes('/gorseller/kucuk/'));
  const pencere = imgler.find((i) => deger(i.oz.get('alt')) === 'buyutulen.alt');

  it('üç img ögesi var: adım görseli, küçük önizleme, büyütme penceresi (ölçütün kendisi)', () => {
    expect(imgler).toHaveLength(3);
    expect(buyuk && kucuk && pencere).toBeTruthy();
  });

  it('her img ögesinde alt özniteliği YAZILI (eksik alt yok)', () => {
    for (const i of imgler) expect(i.oz.has('alt')).toBe(true);
  });

  it('sayfada duran görseller tembel: loading="lazy" + decoding="async"', () => {
    for (const i of [buyuk!, kucuk!]) {
      expect(deger(i.oz.get('loading'))).toBe('lazy');
      expect(deger(i.oz.get('decoding'))).toBe('async');
    }
  });

  it('adım görseli yer ayırıyor: width + height yazılı (tembel görsel inerken içerik kaymasın)', () => {
    expect(buyuk!.oz.has('width')).toBe(true);
    expect(buyuk!.oz.has('height')).toBe(true);
  });

  it('adım görselinin alt metni veriden (anlamlı metin), boş değil', () => {
    expect(deger(buyuk!.oz.get('alt'))).toBe('secili.alt');
  });

  it('15 küçük önizleme: alt="" BİLİNÇLİ — aynı düğmede görünür <em> sekme adı var', () => {
    expect(deger(kucuk!.oz.get('alt'))).toBe('');
    // img'nin bulunduğu düğmenin içinde {g.sekme} yazan bir <em> olmalı; yoksa sekme adsız kalır.
    let dugme: ts.JsxElement | undefined;
    for (let p: ts.Node | undefined = kucuk!.dugum.parent; p; p = p.parent) {
      if (ts.isJsxElement(p) && p.openingElement.tagName.getText() === 'button') {
        dugme = p;
        break;
      }
    }
    expect(dugme).toBeDefined();
    const emler = dugme!.children.filter((c): c is ts.JsxElement => ts.isJsxElement(c) && c.openingElement.tagName.getText() === 'em');
    expect(emler.map((e) => e.children.map((c) => c.getText()).join(''))).toContain('{g.sekme}');
  });

  it('büyütme penceresinin görseli yalnız açıkken var — boş src / boş alt ile sayfada durmuyor', () => {
    expect(deger(pencere!.oz.get('src'))).not.toMatch(/''|""/);
    const kosul = pencere!.dugum.parent;
    expect(ts.isBinaryExpression(kosul) || ts.isParenthesizedExpression(kosul)).toBe(true);
    let ata: ts.Node | undefined = kosul;
    while (ata && !ts.isBinaryExpression(ata)) ata = ata.parent;
    expect(ata && ts.isBinaryExpression(ata) && ata.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken).toBe(true);
    expect((ata as ts.BinaryExpression).left.getText()).toBe('buyutulen');
  });

  it('pencerenin KABI ise koşulsuz duruyor (CSS sözleşmesi: display:none + .acik)', () => {
    const kap = ogeler('div').find((d) => deger(d.oz.get('className'))?.includes('nc-buyut'));
    expect(kap).toBeDefined();
    // <div> ögesi fragment'in DOĞRUDAN çocuğu — `&&` ya da `?:` içinde değil.
    expect(ts.isJsxElement(kap!.dugum.parent) && ts.isJsxFragment(kap!.dugum.parent.parent)).toBe(true);
  });
});
