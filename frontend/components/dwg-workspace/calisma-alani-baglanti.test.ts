/**
 * DWG ANALIZ CALISMA ALANI — BAGLANTI KAPILARI (25.09 yeni tasarim).
 *
 * Saf kurallar kendi testlerinde (calisma-kaydi, adim-durumu, etiket-aktarimi).
 * Bu dosya o kurallarin EKRANA BAGLI oldugunu olcer: bu depoda olculmus hata
 * sinifi "mekanizma var, baglanti yok" (fonksiyon dogru, cagiran yok). Kaynaklar
 * YORUMSUZ AST olarak okunur — yorumda gecen ad kapiyi yesile boyamaz.
 *
 * ⚠ BIR ASSERT TEK KRITERE (proje kurali).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

function oku(yol: string): ts.SourceFile {
  const tur = yol.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(yol, readFileSync(yol, 'utf-8'), ts.ScriptTarget.Latest, true, tur);
}

const CALISMA = oku(join(__dirname, 'DwgProjectWorkspace.tsx'));
const KANCA = oku(join(__dirname, 'useWorkspaceState.ts'));
const ARAC = oku(join(__dirname, 'CizimAracCubugu.tsx'));
const USTU = oku(join(__dirname, 'CizimUstu.tsx'));
const BIRIM = oku(join(__dirname, 'BirimPenceresi.tsx'));
const VIEWER = oku(join(__dirname, '..', 'dwg-viewer', 'DxfCanvasViewer.tsx'));
const VIEWPORT = oku(join(__dirname, '..', 'dwg-viewer', 'useViewport.ts'));
const MOTOR = oku(join(__dirname, '..', 'dwg-diameter-engine', 'useLayerCalc.ts'));

const metin = (n: ts.Node) => n.getText(n.getSourceFile());

function bul<T extends ts.Node>(kok: ts.Node, kosul: (n: ts.Node) => n is T): T[] {
  const out: T[] = [];
  const gez = (n: ts.Node) => { if (kosul(n)) out.push(n); ts.forEachChild(n, gez); };
  gez(kok);
  return out;
}

const cagriMi = (n: ts.Node | undefined, ad: string): n is ts.CallExpression =>
  !!n && ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === ad;

/** `kok` altinda `ad(...)` cagrisi var mi? */
const cagiriyor = (kok: ts.Node | undefined, ad: string): boolean =>
  !!kok && bul(kok, (n): n is ts.CallExpression => cagriMi(n, ad)).length > 0;

const fonksiyonMu = (n: ts.Node | undefined): n is ts.ArrowFunction | ts.FunctionExpression =>
  !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));

/** Ifadedeki tanimlayici adlari. */
const adlar = (n: ts.Node | undefined): string[] =>
  (n ? bul(n, (x): x is ts.Identifier => ts.isIdentifier(x)).map((x) => x.text) : []);

/** `const ad = …` bildiriminin degeri — dosyada TEK olmali. */
function bildirim(kaynak: ts.SourceFile, ad: string): ts.Expression {
  const b = bul(kaynak, (n): n is ts.VariableDeclaration =>
    ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === ad);
  if (b.length !== 1 || !b[0].initializer) throw new Error(`${ad} bildirimi tek degil (${b.length})`);
  return b[0].initializer;
}

/** useCallback(fn, …) ya da duz fonksiyon → govde. */
function govde(ifade: ts.Expression): ts.Node {
  const fn = cagriMi(ifade, 'useCallback') ? ifade.arguments[0] : ifade;
  if (!fonksiyonMu(fn)) throw new Error(`fonksiyon degil: ${metin(ifade).slice(0, 60)}`);
  return fn.body;
}

/** Nesne literalindeki `ad:` ozelliginin degeri. */
function ozellik(o: ts.Node | undefined, ad: string): ts.Expression | undefined {
  if (!o || !ts.isObjectLiteralExpression(o)) return undefined;
  const p = o.properties.find((q): q is ts.PropertyAssignment => ts.isPropertyAssignment(q) && metin(q.name) === ad);
  return p?.initializer;
}

type JsxOge = ts.JsxSelfClosingElement | ts.JsxOpeningElement;

function ogeler(kok: ts.Node, etiket: string): JsxOge[] {
  return bul(kok, (n): n is JsxOge =>
    (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && metin(n.tagName) === etiket);
}

function tekOge(kok: ts.Node, etiket: string): JsxOge {
  const o = ogeler(kok, etiket);
  if (o.length !== 1) throw new Error(`<${etiket}> tek degil (${o.length})`);
  return o[0];
}

/** JSX niteliginin ifadesi (`ad="…"` icin dize literali). */
function nitelik(oge: JsxOge, ad: string): ts.Expression | undefined {
  const a = oge.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && metin(p.name) === ad,
  );
  if (!a?.initializer) return undefined;
  if (ts.isStringLiteral(a.initializer)) return a.initializer;
  return (a.initializer as ts.JsxExpression).expression;
}

const nitelikMetni = (oge: JsxOge, ad: string): string | null => {
  const e = nitelik(oge, ad);
  return e ? metin(e) : null;
};

/** aria-label'i verilen <button> (tek olmali). */
function dugme(kok: ts.Node, etiket: string): JsxOge {
  const d = ogeler(kok, 'button').filter((o) => {
    const a = nitelik(o, 'aria-label');
    return !!a && ts.isStringLiteral(a) && a.text === etiket;
  });
  if (d.length !== 1) throw new Error(`aria-label="${etiket}" dugmesi tek degil (${d.length})`);
  return d[0];
}

/** <button>…metin…</button> — cocuk metni verilen dugmeler. */
function metinliDugmeler(kok: ts.Node, yazi: string): JsxOge[] {
  return ogeler(kok, 'button').filter((o) =>
    ts.isJsxOpeningElement(o) && ts.isJsxElement(o.parent)
    && o.parent.children.some((c) => ts.isJsxText(c) && c.text.trim() === yazi));
}

function kapsayanFonksiyon(n: ts.Node): ts.Node {
  let p: ts.Node | undefined = n.parent;
  while (p && !ts.isFunctionLike(p)) p = p.parent;
  if (!p) throw new Error('kapsayan fonksiyon yok');
  return p;
}

// ── A) GECMIS ISLEVLERI KANCADAN ────────────────────────────────────────────

/** `const { … } = ws` ve `ws = useWorkspaceState(…)` — kancadan cikan adlar. */
function kancaAdlari(): string[] {
  const kaliplar = bul(CALISMA, (n): n is ts.VariableDeclaration =>
    ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && !!n.initializer);
  return kaliplar
    .filter((v) => {
      const i = v.initializer!;
      if (cagriMi(i, 'useWorkspaceState')) return true;
      if (!ts.isIdentifier(i)) return false;
      const b = bul(CALISMA, (n): n is ts.VariableDeclaration =>
        ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === i.text);
      return b.length === 1 && cagriMi(b[0].initializer, 'useWorkspaceState');
    })
    .flatMap((v) => (v.name as ts.ObjectBindingPattern).elements.map((e) => metin(e.name)));
}

describe('gecmis islevleri calisma alani kancasindan gelir', () => {
  it('geriAl, yinele, etiketler, tepe sorusu ve hesap sonucu kancadan', () => {
    expect(kancaAdlari()).toEqual(expect.arrayContaining(
      ['geriAl', 'yinele', 'geriEtiketi', 'ileriEtiketi', 'islemTepedeMi', 'hesapSonucu'],
    ));
  });

  /** Kanca islevinin gonderdigi eylem turleri. */
  const eylemler = (ad: string): (string | null)[] =>
    bul(govde(bildirim(KANCA, ad)), (n): n is ts.CallExpression => cagriMi(n, 'dispatch'))
      .map((c) => {
        const t = ozellik(c.arguments[0], 'tur');
        return t && ts.isStringLiteral(t) ? t.text : null;
      });

  it("kanca: geriAl → { tur: 'geri' }", () => {
    expect(eylemler('geriAl')).toEqual(['geri']);
  });

  it("kanca: yinele → { tur: 'ileri' }", () => {
    expect(eylemler('yinele')).toEqual(['ileri']);
  });

  it("kanca: hesapSonucu → { tur: 'hesap' } (etiket aktarimi indirgeyicide)", () => {
    expect(eylemler('hesapSonucu')).toEqual(['hesap']);
  });
});

// ── B) KLAVYE ───────────────────────────────────────────────────────────────

describe('klavye: Ctrl+Z geri alir, Ctrl+Y / Ctrl+Shift+Z yineler', () => {
  function keydownKaydi(): ts.CallExpression {
    const k = bul(CALISMA, (n): n is ts.CallExpression =>
      ts.isCallExpression(n) && metin(n.expression) === 'window.addEventListener'
      && !!n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === 'keydown');
    if (k.length !== 1) throw new Error(`keydown kaydi tek degil (${k.length})`);
    return k[0];
  }

  function isleyici(): ts.ArrowFunction | ts.FunctionExpression {
    const kayit = keydownKaydi();
    const arg = kayit.arguments[1];
    let fn: ts.Node | undefined = arg;
    if (ts.isIdentifier(arg)) {
      const b = bul(kapsayanFonksiyon(kayit), (n): n is ts.VariableDeclaration =>
        ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === arg.text);
      fn = b.length === 1 ? b[0].initializer : undefined;
    }
    if (!fonksiyonMu(fn)) throw new Error('keydown isleyicisi fonksiyon degil');
    return fn;
  }

  /** `if (k === 'geri') … else …` — k, kisayolEylemi(e) sonucudur. */
  function geriDali(): ts.IfStatement {
    const fn = isleyici();
    const karar = bul(fn.body, (n): n is ts.VariableDeclaration =>
      ts.isVariableDeclaration(n) && cagriMi(n.initializer, 'kisayolEylemi'));
    if (karar.length !== 1) throw new Error('kisayolEylemi sonucu tek degiskende degil');
    const k = metin(karar[0].name);
    const d = bul(fn.body, (n): n is ts.IfStatement => {
      if (!ts.isIfStatement(n) || !ts.isBinaryExpression(n.expression)) return false;
      const b = n.expression;
      return b.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
        && metin(b.left) === k && ts.isStringLiteral(b.right) && b.right.text === 'geri';
    });
    if (d.length !== 1) throw new Error(`k === 'geri' dali tek degil (${d.length})`);
    return d[0];
  }

  it('onay kutusu acikken klavye ONA aittir — isleyicinin ilk deyimi', () => {
    const g = isleyici().body;
    const ilk = ts.isBlock(g) ? g.statements[0] : undefined;
    expect(!!ilk && ts.isIfStatement(ilk) && cagriMi(ilk.expression, 'onayKutusuAcikMi') && ts.isReturnStatement(ilk.thenStatement)).toBe(true);
  });

  it('yazi alaninda Ctrl+Z / Ctrl+Y metnin kendisine kalir — geri al dalindan ONCE', () => {
    const dal = geriDali();
    const blok = dal.parent;
    const onceki = ts.isBlock(blok) ? blok.statements.slice(0, blok.statements.indexOf(dal)) : [];
    expect(onceki.some((s) => ts.isIfStatement(s) && cagriMi(s.expression, 'yaziAlaniMi') && ts.isReturnStatement(s.thenStatement))).toBe(true);
  });

  it('Esc zinciri yazi alaninda da calisir (yazi alani denetimi yalniz kisayol dalinda)', () => {
    const fn = isleyici();
    const yaziDenetimleri = bul(fn.body, (n): n is ts.CallExpression => cagriMi(n, 'yaziAlaniMi'));
    const kisayolDali = geriDali().parent;
    expect(yaziDenetimleri.length > 0 && yaziDenetimleri.every((c) => {
      let p: ts.Node | undefined = c;
      while (p && p !== kisayolDali) p = p.parent;
      return p === kisayolDali;
    })).toBe(true);
  });

  it("'geri' dali geriAl'i cagirir", () => {
    expect(cagiriyor(geriDali().thenStatement, 'geriAl')).toBe(true);
  });

  it("'geri' dali yinele'yi cagirmaz", () => {
    expect(cagiriyor(geriDali().thenStatement, 'yinele')).toBe(false);
  });

  it("diger dal ('ileri') yinele'yi cagirir", () => {
    expect(cagiriyor(geriDali().elseStatement, 'yinele')).toBe(true);
  });

  it('ayirma surerken (kilit) geri al / yinele calismaz', () => {
    const dal = geriDali();
    const blok = dal.parent;
    const onceki = ts.isBlock(blok) ? blok.statements.slice(0, blok.statements.indexOf(dal)) : [];
    expect(onceki.some((s) => ts.isIfStatement(s) && metin(s.expression) === 'kilit' && ts.isReturnStatement(s.thenStatement))).toBe(true);
  });

  it('isleyici etki temizlenirken kaldirilir', () => {
    const kayit = keydownKaydi();
    const kaldir = bul(kapsayanFonksiyon(kayit), (n): n is ts.CallExpression =>
      ts.isCallExpression(n) && metin(n.expression) === 'window.removeEventListener'
      && !!n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === 'keydown'
      && !!n.arguments[1] && metin(n.arguments[1]) === metin(kayit.arguments[1]));
    expect(kaldir).toHaveLength(1);
  });
});

// ── C) ARAC CUBUGU ──────────────────────────────────────────────────────────

describe('arac cubugu: Geri al / Yinele dugmeleri gecmise bagli', () => {
  const cubuk = () => tekOge(CALISMA, 'CizimAracCubugu');

  it('onGeriAl = geriAl', () => {
    expect(nitelikMetni(cubuk(), 'onGeriAl')).toBe('geriAl');
  });

  it('onYinele = yinele', () => {
    expect(nitelikMetni(cubuk(), 'onYinele')).toBe('yinele');
  });

  it('geriEtiketi kancadan (dugmenin basligi ve etkinligi)', () => {
    expect(nitelikMetni(cubuk(), 'geriEtiketi')).toBe('geriEtiketi');
  });

  it('ileriEtiketi kancadan', () => {
    expect(nitelikMetni(cubuk(), 'ileriEtiketi')).toBe('ileriEtiketi');
  });

  it('ayirma surerken gecmis dugmeleri kilitli (gecmisKilitli = kilit)', () => {
    expect(nitelikMetni(cubuk(), 'gecmisKilitli')).toBe('kilit');
  });

  it('"Geri al" dugmesi p.onGeriAl cagirir', () => {
    expect(nitelikMetni(dugme(ARAC, 'Geri al'), 'onClick')).toBe('p.onGeriAl');
  });

  it('"Yinele" dugmesi p.onYinele cagirir', () => {
    expect(nitelikMetni(dugme(ARAC, 'Yinele'), 'onClick')).toBe('p.onYinele');
  });

  it('"Geri al" kilitliyken kapali (geriAcik gecmisKilitli\'yi okur)', () => {
    expect(adlar(bildirim(ARAC, 'geriAcik'))).toContain('gecmisKilitli');
  });
});

// ── D) BILDIRIMDEKI "GERI AL" ───────────────────────────────────────────────

describe('bildirimdeki "Geri al"', () => {
  const b = () => tekOge(CALISMA, 'DurumBildirimi');

  it('onGeriAl geriAl cagirir', () => {
    const fn = nitelik(b(), 'onGeriAl');
    expect(fonksiyonMu(fn) ? cagiriyor(fn.body, 'geriAl') : fn ? metin(fn) === 'geriAl' : false).toBe(true);
  });

  it('yalniz islem gecmisin TEPESINDEYKEN gecerli (islemTepedeMi)', () => {
    expect(cagiriyor(nitelik(b(), 'geriAlinabilir'), 'islemTepedeMi')).toBe(true);
  });

  it('ayirma surerken kapali (kilit)', () => {
    expect(adlar(nitelik(b(), 'geriAlinabilir'))).toContain('kilit');
  });

  const bildirimDugmeleri = () => {
    const fonk = bul(USTU, (n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === 'DurumBildirimi');
    if (fonk.length !== 1) throw new Error('DurumBildirimi tek degil');
    return ogeler(fonk[0], 'button').filter((o) => nitelikMetni(o, 'onClick') === 'onGeriAl');
  };

  it('DurumBildirimi dugmesi onGeriAl cagirir', () => {
    expect(bildirimDugmeleri()).toHaveLength(1);
  });

  it('dugme yalniz geriAlinabilir iken cizilir', () => {
    let p: ts.Node | undefined = bildirimDugmeleri()[0];
    let korumali = false;
    while (p) {
      if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        && metin(p.left) === 'geriAlinabilir') korumali = true;
      p = p.parent;
    }
    expect(korumali).toBe(true);
  });
});

// ── E) BIRIM KAYDET → YENIDEN AYIRMA ────────────────────────────────────────

describe('Birim Kaydet → bayat layer\'lar yeniden ayrilir (etiketler korunur)', () => {
  it('Kaydet dugmesi onKaydet(secim) cagirir', () => {
    const d = metinliDugmeler(BIRIM, 'Kaydet');
    const fn = d.length === 1 ? nitelik(d[0], 'onClick') : undefined;
    expect(fonksiyonMu(fn) && cagriMi(fn.body, 'onKaydet') ? fn.body.arguments.map(metin) : null).toEqual(['secim']);
  });

  it('<BirimPenceresi onKaydet={birimKaydet}>', () => {
    expect(nitelikMetni(tekOge(CALISMA, 'BirimPenceresi'), 'onKaydet')).toBe('birimKaydet');
  });

  it('birimKaydet birimi ust bilesene iletir', () => {
    expect(cagiriyor(govde(bildirim(CALISMA, 'birimKaydet')), 'onBirimDegistir')).toBe(true);
  });

  it('birimKaydet yeniden ayirma bayragini kaldirir', () => {
    const atama = bul(govde(bildirim(CALISMA, 'birimKaydet')), (n): n is ts.BinaryExpression =>
      ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && metin(n.left) === 'birimSonrasiAyirRef.current' && n.right.kind === ts.SyntaxKind.TrueKeyword);
    expect(atama).toHaveLength(1);
  });

  /** Birime tepki veren etki: bagimliligi yalniz [scale], yenidenAyir cagirir. */
  const birimEtkisi = (): ts.CallExpression[] =>
    bul(CALISMA, (n): n is ts.CallExpression => {
      if (!cagriMi(n, 'useEffect')) return false;
      const [fn, bag] = n.arguments;
      return fonksiyonMu(fn) && !!bag && ts.isArrayLiteralExpression(bag)
        && bag.elements.map(metin).join(',') === 'scale' && cagiriyor(fn.body, 'yenidenAyir');
    });

  it('birim degisince (bagimlilik [scale]) yenidenAyir cagrilir', () => {
    expect(birimEtkisi()).toHaveLength(1);
  });

  it('yeniden ayrilacaklar birimBayatMi ile secilir', () => {
    expect(cagiriyor(birimEtkisi()[0]?.arguments[0], 'birimBayatMi')).toBe(true);
  });

  it('etki yalniz Kaydet sonrasi calisir (bayragi okur)', () => {
    const okuma = bul(birimEtkisi()[0]?.arguments[0] ?? CALISMA, (n): n is ts.PropertyAccessExpression =>
      ts.isPropertyAccessExpression(n) && metin(n) === 'birimSonrasiAyirRef.current');
    expect(okuma.length).toBeGreaterThan(0);
  });

  const motorCagrilari = () =>
    bul(govde(bildirim(CALISMA, 'yenidenAyir')), (n): n is ts.CallExpression => cagriMi(n, 'calculateLayer'));

  it('yenidenAyir motora GUNCEL birimi verir (scaleRef.current, bayat kapanis degil)', () => {
    expect(motorCagrilari().map((c) => { const s = ozellik(c.arguments[1], 'scale'); return s ? metin(s) : null; }))
      .toEqual(['scaleRef.current']);
  });

  it('yenidenAyir layer\'in kendi bolme yontemini korur (yarida kalan ilk ayirmada onunkini)', () => {
    const g = govde(bildirim(CALISMA, 'yenidenAyir'));
    const c = motorCagrilari();
    const o = c.length === 1 ? c[0].arguments[1] : undefined;
    const p = o && ts.isObjectLiteralExpression(o)
      ? o.properties.find((q) => !!q.name && metin(q.name) === 'splitMode')
      : undefined;
    // `{ splitMode }` kisaltmasi → ayni adli yerel degiskenin degeri.
    const deger = p && ts.isShorthandPropertyAssignment(p)
      ? bul(g, (n): n is ts.VariableDeclaration => ts.isVariableDeclaration(n) && metin(n.name) === 'splitMode')[0]?.initializer
      : p && ts.isPropertyAssignment(p) ? p.initializer : undefined;
    expect(deger ? metin(deger) : null).toBe("cl ? cl.splitMode ?? 't' : ilk?.splitMode ?? 't'");
  });

  it('"Bölmeden" layer motora gitmez: yerelOlceklenebilir → olcekle', () => {
    const d = bul(govde(bildirim(CALISMA, 'yenidenAyir')), (n): n is ts.IfStatement =>
      ts.isIfStatement(n) && cagiriyor(n.expression, 'yerelOlceklenebilir'));
    expect(d.length === 1 && cagiriyor(d[0].thenStatement, 'olcekle')).toBe(true);
  });
});

// ── F) MOTOR SONUCU → ETIKET AKTARIMI ───────────────────────────────────────

describe('motor sonucu belgeye yazilir; oturum tasinir', () => {
  it('useLayerCalc sonucu hesapGeldi\'ye gider', () => {
    const c = bul(CALISMA, (n): n is ts.CallExpression => cagriMi(n, 'useLayerCalc'));
    const r = c.length === 1 ? ozellik(c[0].arguments[0], 'onResult') : undefined;
    expect(r ? metin(r) : null).toBe('hesapGeldi');
  });

  it('hesapGeldi → hesapSonucu(calculated, oturumRef.current) — pay indirgeyicide VERIDEN', () => {
    const c = bul(govde(bildirim(CALISMA, 'hesapGeldi')), (n): n is ts.CallExpression => cagriMi(n, 'hesapSonucu'));
    expect(c.length === 1 ? c[0].arguments.map(metin) : null).toEqual(['calculated', 'oturumRef.current']);
  });

  /** Kanca islevinin `dispatch({ … })` nesnesindeki alan adlari. */
  const eylemAlanlari = (ad: string): string[] => {
    const d = bul(govde(bildirim(KANCA, ad)), (n): n is ts.CallExpression => cagriMi(n, 'dispatch'));
    const o = d.length === 1 ? d[0].arguments[0] : undefined;
    return o && ts.isObjectLiteralExpression(o) ? o.properties.map((p) => (p.name ? metin(p.name) : metin(p))) : [];
  };

  it('kanca: hesap eylemi oturumu tasir', () => {
    expect(eylemAlanlari('hesapSonucu')).toContain('oturum');
  });

  it('kanca: cap eylemi parcalama surumunu tasir', () => {
    expect(eylemAlanlari('capAta')).toContain('surum');
  });

  it('yenidenAyir oturumu motor istegi surerken acar, bitince kapatir', () => {
    const g = govde(bildirim(CALISMA, 'yenidenAyir'));
    const atamalar = bul(g, (n): n is ts.BinaryExpression =>
      ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && metin(n.left) === 'oturumRef.current');
    expect(atamalar.map((a) => metin(a.right))).toEqual(['oturum', 'undefined']);
  });

  it('bolmeden layer\'in yerel olceklenmesi de oturuma girer', () => {
    const c = bul(govde(bildirim(CALISMA, 'yenidenAyir')), (n): n is ts.CallExpression => cagriMi(n, 'olcekle'));
    expect(c.map((x) => (x.arguments[2] ? metin(x.arguments[2]) : null))).toEqual(['oturum']);
  });
});

// ── G) CAP EYLEMI SURUMU (eski parcalamaya gelen tik) ───────────────────────

describe('cap eylemi tiklanan parcalamanin surumunu tasir', () => {
  const capCagrilari = () => bul(CALISMA, (n): n is ts.CallExpression => cagriMi(n, 'capAta'));

  it('bos kume kapisi: calisma alaninda uc capAta cagrisi (silgi, kalem, toplu)', () => {
    expect(capCagrilari()).toHaveLength(3);
  });

  it('her capAta cagrisi surum olarak seciliHesap.computedAt verir', () => {
    expect(capCagrilari().map((c) => (c.arguments[3] ? metin(c.arguments[3]) : null)))
      .toEqual(['seciliHesap.computedAt', 'seciliHesap.computedAt', 'seciliHesap.computedAt']);
  });
});

// ── H) GORUNUR SECIM VE FIYATLANDIRMA ───────────────────────────────────────

describe('secilen layer gorunur yapilir; fiyatlandirma guncel durumdan kurulur', () => {
  const secimKosullari = (kume: string, islev: string) =>
    bul(govde(bildirim(CALISMA, 'layerSec')), (n): n is ts.IfStatement =>
      ts.isIfStatement(n) && adlar(n.expression).includes(kume) && cagiriyor(n.thenStatement, islev));

  it('layerSec gizli layer\'i gosterir (hiddenSet → toggleLayerVisibility)', () => {
    expect(secimKosullari('hiddenSet', 'toggleLayerVisibility')).toHaveLength(1);
  });

  it('layerSec soluk layer\'i parlatir (dimmedSet → toggleLayerDimmed)', () => {
    expect(secimKosullari('dimmedSet', 'toggleLayerDimmed')).toHaveLength(1);
  });

  it('Katmanlar paneli gizle / soluklastir icin koruyuculari kullanir', () => {
    const p = tekOge(CALISMA, 'KatmanlarPaneli');
    expect([nitelikMetni(p, 'onGizle'), nitelikMetni(p, 'onSoluklastir')]).toEqual(['gizleDegistir', 'soluklastirDegistir']);
  });

  it('fiyatlandirma son onay kutusundan SONRA guncel durumu yeniden turetir', () => {
    const fn = govde(bildirim(CALISMA, 'fiyatlandirmayaGec'));
    const beklemeler = bul(fn, (n): n is ts.AwaitExpression => ts.isAwaitExpression(n));
    const turetmeler = bul(fn, (n): n is ts.CallExpression =>
      cagriMi(n, 'fiyatlandirmaDurumu') && adlar(n).includes('stateRef') && adlar(n).includes('scaleRef'));
    const sonBekleme = Math.max(...beklemeler.map((b) => b.getStart()));
    expect(turetmeler.length === 1 && turetmeler[0].getStart() > sonBekleme).toBe(true);
  });

  it('teklif GUNCEL kumeden kurulur (onaySirasi(guncel.hazir))', () => {
    const c = bul(govde(bildirim(CALISMA, 'fiyatlandirmayaGec')), (n): n is ts.CallExpression => cagriMi(n, 'onaySirasi'));
    expect(c.map((x) => metin(x.arguments[0]))).toEqual(['guncel.hazir']);
  });
});

// ── I) VIEWER: ADIM 2 KILIDI, CAPSIZ ODAGI, INDEKS, SABITLEME ───────────────

describe('viewer: Adim 2 kilidi, capsiz odagi, iki agacli indeks, sabitleme', () => {
  const v = () => tekOge(CALISMA, 'DxfCanvasViewer');

  it('kilitliLayer secili layer\'a bagli (sabit degil)', () => {
    expect(adlar(nitelik(v(), 'kilitliLayer'))).toContain('secili');
  });

  it('capsizOdak durum degiskenine bagli', () => {
    expect(adlar(nitelik(v(), 'capsizOdak'))).toContain('capsizOdak');
  });

  it("etkilesimModu Adim 2 acikken 'cap-ata', degilse 'layer-sec'", () => {
    const e = nitelik(v(), 'etkilesimModu');
    expect(e && ts.isConditionalExpression(e) ? [metin(e.whenTrue), metin(e.whenFalse)] : null)
      .toEqual(["'cap-ata'", "'layer-sec'"]);
  });

  /** Isabet hesabi: iki agaci da sorgulayan TEK fonksiyon. */
  const isabetFonksiyonlari = () => bul(VIEWER, (n): n is ts.ArrowFunction => {
    if (!ts.isArrowFunction(n)) return false;
    const sorgular = bul(n.body, (x): x is ts.CallExpression => ts.isCallExpression(x)).map((x) => metin(x.expression));
    return sorgular.includes('hamIndeks.search') && sorgular.includes('parcaIndeks.search');
  });

  it('isabet hesabi ham ve parca agaclarinin IKISINI de sorgular', () => {
    expect(isabetFonksiyonlari()).toHaveLength(1);
  });

  it('hit-test kilitli layer disindaki adaylari atlar', () => {
    const kilitler = isabetFonksiyonlari().flatMap((f) => bul(f.body, (n): n is ts.IfStatement =>
      ts.isIfStatement(n) && ts.isContinueStatement(n.thenStatement)
      && bul(n.expression, (b): b is ts.BinaryExpression =>
        ts.isBinaryExpression(b) && b.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
        && metin(b.right) === 'kilitliLayer').length > 0));
    expect(kilitler.length).toBeGreaterThan(0);
  });

  it('hesaplanmis layer\'in HAM cizgisi secilmez (hesaplananlar ile elenir)', () => {
    const elemeler = isabetFonksiyonlari().flatMap((f) => bul(f.body, (n): n is ts.IfStatement =>
      ts.isIfStatement(n) && ts.isContinueStatement(n.thenStatement)
      && bul(n.expression, (c): c is ts.CallExpression =>
        ts.isCallExpression(c) && metin(c.expression) === 'hesaplananlar.has').length > 0));
    expect(elemeler).toHaveLength(1);
  });

  it('ham agac YALNIZ cizim degisince kurulur (bagimlilik [geometry])', () => {
    const agac = bildirim(VIEWER, 'hamIndeks');
    const bag = cagriMi(agac, 'useMemo') ? agac.arguments[1] : undefined;
    expect(bag && ts.isArrayLiteralExpression(bag) ? bag.elements.map(metin) : null).toEqual(['geometry']);
  });

  it('Adim 2\'de parca yazidan / bloktan once secilir (cap-ata onceliginde edge 0)', () => {
    const d = isabetFonksiyonlari().flatMap((f) => bul(f.body, (n): n is ts.ConditionalExpression =>
      ts.isConditionalExpression(n) && metin(n.condition) === "etkilesimModu === 'cap-ata'"));
    const edge = d.length === 1 ? ozellik(d[0].whenTrue, 'edge') : undefined;
    expect(edge ? metin(edge) : null).toBe('0');
  });

  it('kalem / silgi acikken tik bilgi kutusunu SABITLEMEZ (activeTagColor)', () => {
    const c = bul(VIEWER, (n): n is ts.CallExpression =>
      cagriMi(n, 'setSelectedLine') && !!n.arguments[0] && ts.isConditionalExpression(n.arguments[0]));
    expect(c.map((x) => adlar((x.arguments[0] as ts.ConditionalExpression).condition))).toEqual([['etkilesimModu', 'activeTagColor']]);
  });

  it('kamera yalniz YENI gezinme surumunde oynar (sonOdakSurumuRef)', () => {
    const d = bul(VIEWER, (n): n is ts.IfStatement =>
      ts.isIfStatement(n) && metin(n.expression) === 'sonOdakSurumuRef.current === focusVersion'
      && ts.isReturnStatement(n.thenStatement));
    expect(d).toHaveLength(1);
  });

  it('capsiz odak: kosul capsizOdak iken CAPSIZ_ODAK_ALPHA uygulanir', () => {
    const d = bul(VIEWER, (n): n is ts.IfStatement =>
      ts.isIfStatement(n) && adlar(n.expression).includes('capsizOdak')
      && adlar(n.thenStatement).includes('CAPSIZ_ODAK_ALPHA'));
    expect(d).toHaveLength(1);
  });

  it('kilit KALKINCA da bayat secim temizlenir (erken donus yok)', () => {
    const etkiler = bul(VIEWER, (n): n is ts.CallExpression => {
      if (!cagriMi(n, 'useEffect')) return false;
      const bag = n.arguments[1];
      return !!bag && ts.isArrayLiteralExpression(bag) && bag.elements.map(metin).join(',') === 'kilitliLayer';
    });
    const erkenDonus = etkiler.flatMap((e) => bul(e.arguments[0], (n): n is ts.IfStatement =>
      ts.isIfStatement(n) && metin(n.expression) === '!kilitliLayer' && ts.isReturnStatement(n.thenStatement)));
    expect(etkiler.length === 1 && erkenDonus.length === 0).toBe(true);
  });
});

// ── J) KORUYUCULAR, YAKINLASTIRMA, ISTEK IPTALI, KALICILIK ─────────────────

describe('secili boru layer\'i gizlenemez / soluklastirilamaz', () => {
  const ilkDeyimSeciliKorumasi = (ad: string) => {
    const g = govde(bildirim(CALISMA, ad));
    const ilk = ts.isBlock(g) ? g.statements[0] : undefined;
    return !!ilk && ts.isIfStatement(ilk) && ts.isReturnStatement(ilk.thenStatement)
      && adlar(ilk.expression).includes('secili');
  };

  it('gizleDegistir secili layer icin erken doner', () => {
    expect(ilkDeyimSeciliKorumasi('gizleDegistir')).toBe(true);
  });

  it('soluklastirDegistir secili layer icin erken doner', () => {
    expect(ilkDeyimSeciliKorumasi('soluklastirDegistir')).toBe(true);
  });

  it('Shift+tik gizleme de koruyucudan gecer', () => {
    const v = tekOge(CALISMA, 'DxfCanvasViewer');
    expect(cagiriyor(nitelik(v, 'onLineClick'), 'gizleDegistir')).toBe(true);
  });
});

describe('yakinlastir / uzaklastir kap merkezinden olcekler', () => {
  it('zoomIn ve zoomOut merkezdenOlcekle ile', () => {
    expect([cagiriyor(bildirim(VIEWPORT, 'zoomIn'), 'merkezdenOlcekle'), cagiriyor(bildirim(VIEWPORT, 'zoomOut'), 'merkezdenOlcekle')])
      .toEqual([true, true]);
  });

  it('merkezdenOlcekle kap merkezini (genislik/2, yukseklik/2) verir', () => {
    const c = bul(govde(bildirim(VIEWPORT, 'merkezdenOlcekle')), (n): n is ts.CallExpression => cagriMi(n, 'noktaEtrafindaOlcekle'));
    expect(c.map((x) => x.arguments.slice(2).map(metin))).toEqual([['rect.width / 2', 'rect.height / 2']]);
  });
});

describe('motor istegi bilesen kaldirilinca iptal edilir (sonucu islenmez)', () => {
  it('istek iptal sinyaliyle gider', () => {
    const c = bul(MOTOR, (n): n is ts.CallExpression => ts.isCallExpression(n) && metin(n.expression) === 'api.post');
    expect(c.length === 1 ? metin(ozellik(c[0].arguments[2], 'signal') ?? c[0]) : null).toBe('denetleyici.signal');
  });

  it('iptal edilen istegin HATASI islenmez (catch ilk deyimi)', () => {
    const yakala = bul(MOTOR, (n): n is ts.CatchClause => ts.isCatchClause(n));
    const ilk = yakala.length === 1 ? yakala[0].block.statements[0] : undefined;
    expect(!!ilk && ts.isIfStatement(ilk) && metin(ilk.expression) === 'denetleyici.signal.aborted').toBe(true);
  });

  it('iptal edilen istegin SONUCU islenmez (onResult oncesi)', () => {
    const d = bul(MOTOR, (n): n is ts.IfStatement =>
      ts.isIfStatement(n) && metin(n.expression) === 'denetleyici.signal.aborted' && !ts.isCatchClause(n.parent.parent));
    const sonuc = bul(MOTOR, (n): n is ts.CallExpression => cagriMi(n, 'onResult'));
    expect(d.length > 0 && sonuc.length === 1 && d[0].getStart() < sonuc[0].getStart()).toBe(true);
  });

  it('bilesen kaldirilinca suren istekler iptal edilir', () => {
    const iptaller = bul(MOTOR, (n): n is ts.CallExpression =>
      ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'abort');
    expect(iptaller).toHaveLength(1);
  });
});

// ── K) BIRIM DEGISIMI: GOSTERIM + IPTAL (25.09 canli hata) ─────────────────
// Canli: motor layer basina ~23 sn yeniden ayirirken ekran eski birimin
// sayisini gosterdi ve Kaydet sessizce kapaliydi. Bilesenlerin "≈" cizdigi
// birim-gosterimi.test.ts'te; burada calisma alaninin onlari BAGLADIGI.

describe('birim degisince ekran yeni birimle gosterir (≈)', () => {
  it('gorunen katmanlar gosterimHesabi(…, scale) ile turetilir', () => {
    const d = bildirim(CALISMA, 'gorunenKatmanlar');
    const c = bul(d, (n): n is ts.CallExpression => cagriMi(n, 'gosterimHesabi'));
    expect(c.map((x) => (x.arguments[1] ? metin(x.arguments[1]) : null))).toEqual(['scale']);
  });

  it('secili layer\'in gorunen hesabi gorunen katmanlardan', () => {
    expect(adlar(bildirim(CALISMA, 'seciliGorunen'))).toContain('gorunenKatmanlar');
  });

  it('"≈" bayraginin olcutu birimBayatMi(seciliHesap, scale)', () => {
    const c = bul(bildirim(CALISMA, 'seciliYaklasik'), (n): n is ts.CallExpression => cagriMi(n, 'birimBayatMi'));
    expect(c.map((x) => x.arguments.map(metin))).toEqual([['seciliHesap', 'scale']]);
  });

  it('Adim 1 satiri gorunen hesaptan (hesap={seciliGorunen})', () => {
    expect(nitelikMetni(tekOge(CALISMA, 'Adim1BoruLayer'), 'hesap')).toBe('seciliGorunen');
  });

  it('Adim 3 toplami gorunen hesaptan', () => {
    expect(adlar(nitelik(tekOge(CALISMA, 'Adim3Onay'), 'toplamMetre'))).toContain('seciliGorunen');
  });

  it('Adim 3 "≈" bayragi seciliYaklasik', () => {
    expect(nitelikMetni(tekOge(CALISMA, 'Adim3Onay'), 'yaklasik')).toBe('seciliYaklasik');
  });

  it('Adim 2 "≈" bayragi seciliYaklasik', () => {
    expect(nitelikMetni(tekOge(CALISMA, 'Adim2CapAta'), 'yaklasik')).toBe('seciliYaklasik');
  });

  it('cap listesi ve ilerleme gorunen parcalardan (seciliParcalar ← seciliGorunen)', () => {
    expect(adlar(bildirim(CALISMA, 'seciliParcalar'))).toContain('seciliGorunen');
  });

  it('calisilan layer listesinin metresi gorunen katmandan', () => {
    const d = bildirim(CALISMA, 'calisilanlar');
    const m = bul(d, (n): n is ts.PropertyAssignment => ts.isPropertyAssignment(n) && metin(n.name) === 'metre');
    expect(m.length === 1 ? adlar(m[0].initializer) : []).toContain('gorunenKatmanlar');
  });

  it('cizime giden parcalar gorunen katmanlardan (ipucundaki uzunluk)', () => {
    // Ad aramasi YETMEZ: bagimlilik dizisindeki ad, govde ham belgeyi okusa da
    // kapiyi yesil tutuyordu (mutasyon U21 yasadi). Olcut govdedeki atama.
    const d = bildirim(CALISMA, 'tumParcalar');
    const fn = cagriMi(d, 'useMemo') ? d.arguments[0] : undefined;
    const atama = fonksiyonMu(fn) ? bul(fn.body, (n): n is ts.BinaryExpression =>
      ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && metin(n.left) === 'm[ad]') : [];
    expect(atama.map((a) => metin(a.right))).toEqual(['gorunenKatmanlar[ad].edgeSegments']);
  });

  it('viewer ipucu parca uzunlugunu CANLI parcadan okur (agac ayni parmak iziyle kurulmaz)', () => {
    const c = bul(VIEWER, (n): n is ts.CallExpression => cagriMi(n, 'resolveHoverLength'));
    const o = c.length === 1 ? c[0].arguments[0] : undefined;
    const u = o && ts.isObjectLiteralExpression(o) ? ozellik(o, 'length') : undefined;
    expect(u ? metin(u) : null).toBe('liveSeg?.length ?? best.length');
  });

  it('viewer\'a "≈" layer\'lari verilir (yaklasikLayerlar={yaklasikSet})', () => {
    expect(nitelikMetni(tekOge(CALISMA, 'DxfCanvasViewer'), 'yaklasikLayerlar')).toBe('yaklasikSet');
  });

  it('"≈" layer kumesi birimBayatMi ile secilir', () => {
    expect(cagiriyor(bildirim(CALISMA, 'yaklasikSet'), 'birimBayatMi')).toBe(true);
  });

  it('viewer bilgi kutusuna layer\'in "≈" durumunu verir', () => {
    expect(nitelikMetni(tekOge(VIEWER, 'Tooltip'), 'yaklasik')).toBe('!!yaklasikLayerlar?.has(tooltipEntity.layer)');
  });

  it('bilgi kutusu parca uzunluguna "≈" yazar (yaklasik iken)', () => {
    const fonk = bul(VIEWER, (n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === 'Tooltip');
    const sablon = fonk.length === 1 ? bul(fonk[0], (n): n is ts.TemplateExpression =>
      ts.isTemplateExpression(n) && n.head.text.startsWith('Parça: ')) : [];
    expect(sablon.length === 1 ? metin(sablon[0].templateSpans[0].expression) : null).toBe("yaklasik ? '≈' : ''");
  });

  it('pencere notu birimin DEGISIP degismedigine gore (ayirmaNotu(ayirmaSuruyor, degisti))', () => {
    const c = bul(BIRIM, (n): n is ts.CallExpression => cagriMi(n, 'ayirmaNotu'));
    expect(c.map((x) => x.arguments.map(metin))).toEqual([['ayirmaSuruyor', 'degisti']]);
  });

  it('ipucu hapi oturum ilerlemesini alir (yenidenAyirma)', () => {
    const c = bul(CALISMA, (n): n is ts.CallExpression => cagriMi(n, 'ipucuHesapla'));
    const o = c.length === 1 ? c[0].arguments[0] : undefined;
    const p = o && ts.isObjectLiteralExpression(o) ? o.properties.map((q) => (q.name ? metin(q.name) : '')) : [];
    expect(p).toContain('yenidenAyirma');
  });
});

describe('birim ayirma surerken degisebilir: eski is durur, yeni birimle baslar', () => {
  it('<BirimPenceresi ayirmaSuruyor={kilit}> (pencere durumu soyler)', () => {
    expect(nitelikMetni(tekOge(CALISMA, 'BirimPenceresi'), 'ayirmaSuruyor')).toBe('kilit');
  });

  /** birimKaydet icindeki `if (!ayniOlcek(yeni, scale)) { … }` blogu. */
  const birimDegistiDali = (): ts.IfStatement => {
    const d = bul(govde(bildirim(CALISMA, 'birimKaydet')), (n): n is ts.IfStatement =>
      ts.isIfStatement(n) && metin(n.expression) === '!ayniOlcek(yeni, scale)');
    if (d.length !== 1) throw new Error(`birim degisti dali tek degil (${d.length})`);
    return d[0];
  };

  it('birim degisince suren ayirma durdurulur (ayirmayiDurdur)', () => {
    expect(cagiriyor(birimDegistiDali().thenStatement, 'ayirmayiDurdur')).toBe(true);
  });

  it('yarida kalan ILK ayirma sorulur: yarimKalanAyirma(calculatingLayer, state.calculatedLayers, ayrilanYontem)', () => {
    const c = bul(birimDegistiDali().thenStatement, (n): n is ts.CallExpression => cagriMi(n, 'yarimKalanAyirma'));
    expect(c.map((x) => x.arguments.map(metin))).toEqual([['calculatingLayer', 'state.calculatedLayers', 'ayrilanYontem']]);
  });

  it('yarida kalan ayirma kesilenAyirmaRef\'e yazilir (yarimKalanAyirma sonucu)', () => {
    const dal = birimDegistiDali().thenStatement;
    const a = bul(dal, (n): n is ts.BinaryExpression =>
      ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && metin(n.left) === 'kesilenAyirmaRef.current');
    const sag = a.length === 1 ? a[0].right : undefined;
    const kaynak = sag && ts.isIdentifier(sag)
      ? bul(dal, (n): n is ts.VariableDeclaration => ts.isVariableDeclaration(n) && metin(n.name) === sag.text)[0]?.initializer
      : sag;
    expect(cagriMi(kaynak, 'yarimKalanAyirma')).toBe(true);
  });

  it('yeni oturumun listesi yenidenAyirmaSirasi(bayat, secili, kesilen) — kesilen EN BASTA', () => {
    const e = bul(CALISMA, (n): n is ts.CallExpression => {
      if (!cagriMi(n, 'useEffect')) return false;
      const bag = n.arguments[1];
      return !!bag && ts.isArrayLiteralExpression(bag) && bag.elements.map(metin).join(',') === 'scale'
        && cagiriyor(n.arguments[0], 'yenidenAyir');
    });
    const c = e.length === 1 ? bul(e[0].arguments[0], (n): n is ts.CallExpression => cagriMi(n, 'yenidenAyir')) : [];
    const ilk = c.length === 1 ? c[0].arguments[0] : undefined;
    expect(cagriMi(ilk, 'yenidenAyirmaSirasi') ? ilk.arguments.map(metin) : null)
      .toEqual(['bayat', 'stateRef.current.selectedLayer', 'kesilen']);
  });

  it('birim etkisi yarida kalan ayirmayi yeni oturuma verir (yenidenAyir 2. arguman)', () => {
    const e = bul(CALISMA, (n): n is ts.CallExpression => {
      if (!cagriMi(n, 'useEffect')) return false;
      const bag = n.arguments[1];
      return !!bag && ts.isArrayLiteralExpression(bag) && bag.elements.map(metin).join(',') === 'scale'
        && cagiriyor(n.arguments[0], 'yenidenAyir');
    });
    const c = e.length === 1 ? bul(e[0].arguments[0], (n): n is ts.CallExpression => cagriMi(n, 'yenidenAyir')) : [];
    const ikinci = c.length === 1 ? c[0].arguments[1] : undefined;
    const kaynak = ikinci && ts.isIdentifier(ikinci)
      ? bul(e[0].arguments[0], (n): n is ts.VariableDeclaration => ts.isVariableDeclaration(n) && metin(n.name) === ikinci.text)[0]?.initializer
      : undefined;
    expect(kaynak ? metin(kaynak) : null).toBe('kesilenAyirmaRef.current');
  });

  it('ayirmayiDurdur motor istegini iptal eder (iptalEt)', () => {
    expect(cagiriyor(govde(bildirim(CALISMA, 'ayirmayiDurdur')), 'iptalEt')).toBe(true);
  });

  it('ayirmayiDurdur oturumun sahipligini birakir (aktifOturumRef.current = null)', () => {
    const a = bul(govde(bildirim(CALISMA, 'ayirmayiDurdur')), (n): n is ts.BinaryExpression =>
      ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && metin(n.left) === 'aktifOturumRef.current');
    expect(a.map((x) => metin(x.right))).toEqual(['null']);
  });

  it('ayirmayiDurdur kilidi kaldirir (setYenidenAyirma(null))', () => {
    const c = bul(govde(bildirim(CALISMA, 'ayirmayiDurdur')), (n): n is ts.CallExpression => cagriMi(n, 'setYenidenAyirma'));
    expect(c.map((x) => x.arguments.map(metin))).toEqual([['null']]);
  });

  it('eski dongu sahipligini kaybedince cikar (aktifOturumRef.current !== benim)', () => {
    const d = bul(govde(bildirim(CALISMA, 'yenidenAyir')), (n): n is ts.IfStatement =>
      ts.isIfStatement(n) && ts.isBreakStatement(n.thenStatement)
      && metin(n.expression).includes('aktifOturumRef.current !== benim'));
    expect(d).toHaveLength(1);
  });

  it('eski dongunun finally\'si YENI oturumun durumuna dokunmaz (sahiplik kosulu)', () => {
    const t = bul(govde(bildirim(CALISMA, 'yenidenAyir')), (n): n is ts.TryStatement => ts.isTryStatement(n));
    const f = t.length === 1 ? t[0].finallyBlock : undefined;
    const ilk = f?.statements[0];
    expect(!!ilk && f?.statements.length === 1 && ts.isIfStatement(ilk)
      && metin(ilk.expression) === 'aktifOturumRef.current === benim').toBe(true);
  });

  it('calisma alani motor kancasindan iptalEt alir', () => {
    const c = bul(CALISMA, (n): n is ts.VariableDeclaration =>
      ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && cagriMi(n.initializer, 'useLayerCalc'));
    expect(c.length === 1 ? (c[0].name as ts.ObjectBindingPattern).elements.map((e) => metin(e.name)) : []).toContain('iptalEt');
  });
});

describe('motor kancasi: kullanici iptali', () => {
  it('kanca iptalEt dondurur', () => {
    const d = bul(MOTOR, (n): n is ts.ReturnStatement =>
      ts.isReturnStatement(n) && !!n.expression && ts.isObjectLiteralExpression(n.expression)
      && n.expression.properties.some((p) => !!p.name && metin(p.name) === 'calculatingLayer'));
    const alanlar = d.length === 1 ? (d[0].expression as ts.ObjectLiteralExpression).properties.map((p) => (p.name ? metin(p.name) : '')) : [];
    expect(alanlar).toContain('iptalEt');
  });

  it('iptalEt suren istekleri iptal eder (surenleriIptalEt)', () => {
    expect(cagiriyor(govde(bildirim(MOTOR, 'iptalEt')), 'surenleriIptalEt')).toBe(true);
  });

  it('iptalEt "ayriliyor" gostergesini hemen kapatir', () => {
    const c = bul(govde(bildirim(MOTOR, 'iptalEt')), (n): n is ts.CallExpression => cagriMi(n, 'setCalculatingLayer'));
    expect(c.map((x) => x.arguments.map(metin))).toEqual([['null']]);
  });

  it('bilesen kaldirilinca da ayni iptal calisir (etkinin temizleyicisi surenleriIptalEt)', () => {
    const e = bul(MOTOR, (n): n is ts.CallExpression =>
      cagriMi(n, 'useEffect') && fonksiyonMu(n.arguments[0]) && metin((n.arguments[0] as ts.ArrowFunction).body) === 'surenleriIptalEt');
    expect(e).toHaveLength(1);
  });

  it('iptal edilen istegin finally\'si gostergeye DOKUNMAZ (yeni istegin durumunu silmesin)', () => {
    const t = bul(MOTOR, (n): n is ts.TryStatement => ts.isTryStatement(n) && !!n.finallyBlock);
    const d = t.length === 1 ? bul(t[0].finallyBlock!, (n): n is ts.IfStatement =>
      ts.isIfStatement(n) && cagiriyor(n.thenStatement, 'setCalculatingLayer')) : [];
    expect(d.map((x) => metin(x.expression))).toEqual(['!denetleyici.signal.aborted']);
  });
});

describe('kalicilik: dosya degisince eski dosyanin yazimi kendi anahtarina', () => {
  const dosyaEtkisi = () => bul(KANCA, (n): n is ts.CallExpression => {
    if (!cagriMi(n, 'useEffect')) return false;
    const bag = n.arguments[1];
    return !!bag && ts.isArrayLiteralExpression(bag) && bag.elements.map(metin).join(',') === 'fileId,fileHash,bosalt';
  });

  it('bekleyen yazim YUKLEMEDEN once bosaltilir', () => {
    const e = dosyaEtkisi();
    const bosalt = e.length === 1 ? bul(e[0].arguments[0], (n): n is ts.CallExpression => cagriMi(n, 'bosalt')) : [];
    const yukle = e.length === 1 ? bul(e[0].arguments[0], (n): n is ts.CallExpression => cagriMi(n, 'dispatch')) : [];
    expect(bosalt.length === 1 && yukle.length === 1 && bosalt[0].getStart() < yukle[0].getStart()).toBe(true);
  });

  it('kalici yazimin anahtari yuklenen dosyanindir (kayitAnahtariRef), prop degil', () => {
    const atama = bul(KANCA, (n): n is ts.BinaryExpression =>
      ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && metin(n.left) === 'bekleyenRef.current'
      && ts.isObjectLiteralExpression(n.right));
    expect(atama.map((a) => { const x = ozellik(a.right, 'anahtar'); return x ? metin(x) : null; })).toEqual(['kayitAnahtariRef.current']);
  });
});
