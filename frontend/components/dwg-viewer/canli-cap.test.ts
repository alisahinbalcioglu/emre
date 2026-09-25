/**
 * SABIT BILGI KUTUSU CAPI — 25.09 tarayici vakasinin muhru (bkz. canli-cap.ts).
 *
 * ⚠ IKI AYAK: (1) kural dogru mu, (2) viewer bu kurali gercekten kullaniyor
 * mu. Bu depoda olculmus hata sinifi "mekanizma var, baglanti yok"; baglanti
 * kapisi bu yuzden DxfCanvasViewer.tsx'i yorumsuz AST olarak okur.
 *
 * ★ AYIRT EDIYOR MU? — ana kriterlerde ESKI davranisin replikasi da olculur
 * ve kriteri IHLAL ETTIGI assert edilir. Eski kod kutuya `selectedLine ??
 * hovered!` fotografini AYNEN veriyor, segmenti diziden dusen sabit secimi
 * de tutuyordu.
 *
 * ⚠ BIR ASSERT TEK KRITERE (proje kurali).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { canliCapliVarlik, canliSegmentiBul, sabitSecimGecersiz, type CapliVarlik } from './canli-cap';
import { isUnassignedDiameter } from '../dwg-metraj/constants';
import type { EdgeSegment } from '../dwg-metraj/types';

/** Eski davranis: fotograf aynen kutuya gidiyordu. */
const eski = <T,>(varlik: T): T => varlik;
/** Eski davranis: sabit secim yalniz Esc, tik ya da layer gizleme ile kalkardi. */
const eskiSecimGecersiz = (): boolean => false;

function segment(p: Partial<EdgeSegment> & { segment_id: number }): EdgeSegment {
  return { layer: 'TEMIZ SU', diameter: '', length: 3.2, coords: [0, 0, 1000, 0], ...p };
}

/** Tiklama anindaki fotograf — computeHovered'in urettigi bicim. */
function fotograf(p: Partial<CapliVarlik & { length: number }> = {}) {
  return { type: 'edge', layer: 'TEMIZ SU', index: 0, coords: [0, 0, 1000, 0] as [number, number, number, number], diameter: undefined as string | undefined, isInherited: false, length: 3.2, ...p };
}

// ── A) ATAMA / GERI ALMA ────────────────────────────────────────────────────

describe('atama ve geri alma sonrasi sabit kutu', () => {
  const atanmis = [segment({ segment_id: 7, diameter: 'Ø50' })];
  const silinmis = [segment({ segment_id: 7, diameter: '' })];

  it('atama sonrasi kutu yeni capi gosterir', () => {
    expect(canliCapliVarlik(fotograf(), atanmis).diameter).toBe('Ø50');
  });

  it('ESKI davranis atamayi gostermiyordu (kriteri ihlal eder)', () => {
    expect(eski(fotograf()).diameter).toBeUndefined();
  });

  it('geri alma (ayni kaleme tekrar tik) sonrasi cap satiri kalkar', () => {
    expect(isUnassignedDiameter(canliCapliVarlik(fotograf({ diameter: 'Ø50' }), silinmis).diameter)).toBe(true);
  });

  it('ESKI davranis geri almada eski capi tutuyordu (kriteri ihlal eder)', () => {
    expect(isUnassignedDiameter(eski(fotograf({ diameter: 'Ø50' })).diameter)).toBe(false);
  });

  it('bos cap computeHovered bicimindedir: undefined', () => {
    expect(canliCapliVarlik(fotograf({ diameter: 'Ø50' }), silinmis).diameter).toBeUndefined();
  });

  it('miras bilgisi de canli: segment miras aldiysa kutu soyler', () => {
    const miras = [segment({ segment_id: 7, diameter: 'Ø40', is_inherited: true })];
    expect(canliCapliVarlik(fotograf(), miras).isInherited).toBe(true);
  });

  it('miras bilgisi de canli: segment artik miras degilse kutu soylemez', () => {
    expect(canliCapliVarlik(fotograf({ isInherited: true }), atanmis).isInherited).toBe(false);
  });

  it('cap disindaki alanlar fotograftan korunur (uzunluk, kimlik, geometri)', () => {
    const f = fotograf({ polyline: [[0, 0], [500, 0], [1000, 0]] });
    const dizi = [segment({ segment_id: 7, polyline: [[0, 0], [500, 0], [1000, 0]], diameter: 'Ø50' })];
    const { diameter: _d, isInherited: _m, ...geriKalan } = canliCapliVarlik(f, dizi);
    const { diameter: _fd, isInherited: _fm, ...beklenen } = f;
    expect(geriKalan).toEqual(beklenen);
  });
});

// ── B) INDEX KAYMASI — baska segmentin capi GOSTERILMEZ ──────────────────────
// Onaylanan layer'in segmentleri viewer dizisinden duser; onayi kaldirilinca
// dizinin BASINA doner. Fotograftaki index artik baska bir segmenti gosterir.

describe('index kaymasi', () => {
  const kutudaki = fotograf({ layer: 'PIS SU', index: 0, coords: [10, 20, 30, 40] });
  const gercek = segment({ segment_id: 9, layer: 'PIS SU', coords: [10, 20, 30, 40], diameter: 'Ø110' });

  // Tuzak: index 0'da duran, kutudaki segmentten TEK bir yonden farkli segment.
  // T-noktasinda uc paylasan komsu segmentler tam olarak boyledir.
  const tuzaklar: Array<[string, Partial<EdgeSegment>]> = [
    ['baska layer, ayni koordinat', { layer: 'TEMIZ SU', coords: [10, 20, 30, 40] }],
    ['x1 farkli', { layer: 'PIS SU', coords: [11, 20, 30, 40] }],
    ['y1 farkli', { layer: 'PIS SU', coords: [10, 21, 30, 40] }],
    ['x2 farkli', { layer: 'PIS SU', coords: [10, 20, 31, 40] }],
    ['y2 farkli', { layer: 'PIS SU', coords: [10, 20, 30, 41] }],
  ];

  it.each(tuzaklar)('index\'teki segment ayni degilse (%s) gercek segment bulunur', (_ad, fark) => {
    const dizi = [segment({ segment_id: 1, diameter: 'Ø32', ...fark }), gercek];
    expect(canliCapliVarlik(kutudaki, dizi).diameter).toBe('Ø110');
  });

  // By-pass: uclari AYNI iki boru. Tiklanan U seklindeki; index'te ikizi duruyor.
  const u: Array<[number, number]> = [[10, 20], [10, 60], [30, 60], [30, 40]];
  const ikizler: Array<[string, Array<[number, number]> | undefined]> = [
    ['duz ikiz (polyline yok)', undefined],
    ['karsi yone donen ikiz (y farkli)', [[10, 20], [10, 0], [30, 0], [30, 40]]],
    ['yana acilan ikiz (x farkli)', [[10, 20], [0, 60], [40, 60], [30, 40]]],
    ['son noktasi tekrarlanan ikiz (nokta sayisi farkli)', [...u, [30, 40]]],
  ];

  it.each(ikizler)('by-pass: uclari ayni %s ile karismaz, tiklanan bulunur', (_ad, ikizCizgisi) => {
    const dizi = [
      segment({ segment_id: 1, layer: 'PIS SU', coords: [10, 20, 30, 40], polyline: ikizCizgisi, diameter: 'Ø32' }),
      segment({ segment_id: 2, layer: 'PIS SU', coords: [10, 20, 30, 40], polyline: u, diameter: 'Ø25' }),
    ];
    expect(canliCapliVarlik({ ...kutudaki, polyline: u }, dizi).diameter).toBe('Ø25');
  });

  it('tek noktali polyline yok sayilir (mekansal indeks kurali) — ayni segment taninir', () => {
    const dizi = [segment({ segment_id: 7, polyline: [[0, 0]], diameter: 'Ø50' })];
    expect(canliCapliVarlik(fotograf(), dizi).diameter).toBe('Ø50');
  });

  it('ayirt edilemeyen ikizler (layer + uc + cizgi ayni) index kayinca BULUNMAZ', () => {
    const dizi = [
      segment({ segment_id: 1, layer: 'PIS SU', coords: [0, 0, 5, 5], diameter: 'Ø32' }),
      segment({ segment_id: 2, layer: 'PIS SU', coords: [10, 20, 30, 40], diameter: 'Ø25' }),
      segment({ segment_id: 3, layer: 'PIS SU', coords: [10, 20, 30, 40], diameter: 'Ø50' }),
    ];
    expect(canliSegmentiBul(kutudaki, dizi)).toBeUndefined();
  });

  it('segment diziden tamamen dustuyse kural fotografi aynen dondurur (secimi viewer kaldirir, bkz. C)', () => {
    const f = fotograf({ layer: 'PIS SU', coords: [10, 20, 30, 40], diameter: 'Ø110' });
    const dizi = [segment({ segment_id: 1, layer: 'PIS SU', coords: [0, 0, 5, 5], diameter: 'Ø32' })];
    expect(canliCapliVarlik(f, dizi)).toBe(f);
  });
});

// ── C) ONAY SONRASI SABIT SECIM — kutu bayat capa DONMEZ ────────────────────
// Kod incelemesi (25.09, orta): kalemle atamadan sonra layer onaylaninca
// segment viewer dizisinden duser; sabit kutu tiklama anindaki bos capa
// donuyor, "onay capi sildi" izlenimi veriyordu.

describe('onay sonrasi sabit secim (sabitSecimGecersiz)', () => {
  const kutudaki = fotograf({ layer: 'PIS SU', index: 3, coords: [10, 20, 30, 40] });
  const gercek = segment({ segment_id: 9, layer: 'PIS SU', coords: [10, 20, 30, 40], diameter: 'Ø50' });
  const onaySonrasi = [segment({ segment_id: 1, layer: 'TEMIZ SU', coords: [0, 0, 5, 0] })];

  it('segment dizide duruyorsa secim gecerli', () => {
    expect(sabitSecimGecersiz(kutudaki, [gercek])).toBe(false);
  });

  it("layer'i onaylanip segment diziden dustuyse secim GECERSIZ", () => {
    expect(sabitSecimGecersiz(kutudaki, onaySonrasi)).toBe(true);
  });

  it('ESKI davranis secimi tutuyordu (kriteri ihlal eder)', () => {
    expect(eskiSecimGecersiz()).toBe(false);
  });

  it('son layer da onaylandi (dizi null) — secim GECERSIZ', () => {
    expect(sabitSecimGecersiz(kutudaki, null)).toBe(true);
  });

  it('edge disi sabit secim (yazi) dokunulmaz', () => {
    expect(sabitSecimGecersiz(fotograf({ type: 'text' }), null)).toBe(false);
  });

  it('secim yoksa gecersiz sayilmaz', () => {
    expect(sabitSecimGecersiz(null, null)).toBe(false);
  });
});

// ── D) KAPSAM — yalniz edge ─────────────────────────────────────────────────

describe('edge disi varliklar', () => {
  it('ham cizgi (line) — index geometry.lines\'a aittir, edge capi ALINMAZ', () => {
    const cizgi = fotograf({ type: 'line' });
    expect(canliCapliVarlik(cizgi, [segment({ segment_id: 7, diameter: 'Ø50' })])).toBe(cizgi);
  });

  it('segment dizisi yoksa varlik aynen doner', () => {
    const f = fotograf();
    expect(canliCapliVarlik(f, null)).toBe(f);
  });
});

// ── E) BAGLANTI — viewer bu kurallari gercekten kullaniyor mu ────────────────

describe('DxfCanvasViewer baglantisi (yorumsuz AST)', () => {
  const YOL = join(__dirname, 'DxfCanvasViewer.tsx');
  const kaynak = ts.createSourceFile(YOL, readFileSync(YOL, 'utf-8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const metin = (n: ts.Node) => n.getText(kaynak);

  function bul<T extends ts.Node>(kok: ts.Node, kosul: (n: ts.Node) => n is T): T[] {
    const out: T[] = [];
    const gez = (n: ts.Node) => { if (kosul(n)) out.push(n); ts.forEachChild(n, gez); };
    gez(kok);
    return out;
  }
  const cagriMi = (n: ts.Node, ad: string): n is ts.CallExpression =>
    ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === ad;
  const fonksiyonMu = (n: ts.Node | undefined): n is ts.ArrowFunction | ts.FunctionExpression =>
    !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));

  const tooltipler = bul(kaynak, (n): n is ts.JsxSelfClosingElement =>
    ts.isJsxSelfClosingElement(n) && metin(n.tagName) === 'Tooltip');

  it('bos kume kapisi: tek bir <Tooltip> var', () => {
    expect(tooltipler).toHaveLength(1);
  });

  /** `entity` ifadesi — degiskense bildirimine kadar izlenir. */
  function entityKaynagi(): ts.Expression {
    const nitelik = tooltipler[0].attributes.properties.find(
      (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && metin(p.name) === 'entity',
    );
    const ifade = (nitelik?.initializer as ts.JsxExpression | undefined)?.expression;
    if (!ifade) throw new Error('<Tooltip entity={...}> bulunamadi');
    if (!ts.isIdentifier(ifade)) return ifade;
    const bildirimler = bul(kaynak, (n): n is ts.VariableDeclaration =>
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === ifade.text);
    if (bildirimler.length !== 1 || !bildirimler[0].initializer) throw new Error(`${ifade.text} bildirimi tek degil`);
    return bildirimler[0].initializer;
  }

  /** Kutuya giden degerler: memo ise geri cagirimin donusleri; kosullu ifade
   *  dallarina ayrilir. Kural cagrisi var diye yetmez — SONUCU kutuya gitmeli. */
  function kutuDegerleri(): string[] {
    const k = entityKaynagi();
    const donusler: ts.Expression[] = [];
    if (cagriMi(k, 'useMemo')) {
      const fn = k.arguments[0];
      if (!fonksiyonMu(fn)) throw new Error('useMemo geri cagirimi yok');
      if (ts.isBlock(fn.body)) {
        const gez = (n: ts.Node) => {
          if (ts.isReturnStatement(n) && n.expression) donusler.push(n.expression);
          if (!ts.isFunctionLike(n)) ts.forEachChild(n, gez);
        };
        ts.forEachChild(fn.body, gez);
      } else {
        donusler.push(fn.body);
      }
    } else {
      donusler.push(k);
    }
    const yaprak = (e: ts.Expression): ts.Expression[] => {
      if (ts.isParenthesizedExpression(e)) return yaprak(e.expression);
      if (ts.isConditionalExpression(e)) return [...yaprak(e.whenTrue), ...yaprak(e.whenFalse)];
      return [e];
    };
    return donusler.flatMap(yaprak)
      .filter((e) => e.kind !== ts.SyntaxKind.NullKeyword)
      .map((e) => (cagriMi(e, 'canliCapliVarlik') ? `kural(${e.arguments.slice(1).map(metin).join(',')})` : `CIPLAK: ${metin(e)}`));
  }

  it('kutuya giden her deger canliCapliVarlik(…, allEdgeSegments) sonucudur', () => {
    expect(Array.from(new Set(kutuDegerleri()))).toEqual(['kural(allEdgeSegments)']);
  });

  it('memo bagimliliklari segment dizisini izler (yoksa kutu yine bayat kalir)', () => {
    const k = entityKaynagi();
    // Dogrudan cagri ise her render taze — bagimlilik sorusu yok.
    if (cagriMi(k, 'canliCapliVarlik')) return;
    const bag = cagriMi(k, 'useMemo') ? k.arguments[1] : undefined;
    const adlar = bag && ts.isArrayLiteralExpression(bag) ? bag.elements.map(metin) : [];
    expect(adlar).toEqual(expect.arrayContaining(['selectedLine', 'hovered', 'allEdgeSegments']));
  });

  it('segmenti diziden dusen sabit secim kaldirilir (useEffect + bagimliliklar)', () => {
    const uyan = bul(kaynak, (n): n is ts.CallExpression => cagriMi(n, 'useEffect')).filter((c) => {
      const [fn, bag] = c.arguments;
      if (!fonksiyonMu(fn) || !bag || !ts.isArrayLiteralExpression(bag)) return false;
      const temizler = bul(fn.body, (n): n is ts.IfStatement => ts.isIfStatement(n)).some((s) =>
        cagriMi(s.expression, 'sabitSecimGecersiz')
        && s.expression.arguments.map(metin).join(',') === 'selectedLine,allEdgeSegments'
        && bul(s.thenStatement, (n): n is ts.CallExpression => cagriMi(n, 'setSelectedLine'))
          .some((c2) => c2.arguments.length === 1 && c2.arguments[0].kind === ts.SyntaxKind.NullKeyword));
      const adlar = bag.elements.map(metin);
      return temizler && adlar.includes('selectedLine') && adlar.includes('allEdgeSegments');
    });
    expect(uyan).toHaveLength(1);
  });
});
