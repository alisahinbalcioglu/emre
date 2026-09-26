/**
 * Gorunum kutusu (26.09): proje acilista uzakta bir nokta gibi gorunuyordu
 * (Emre'nin ekran goruntusu: %0,0 yakinlastirma, imlec ~109 milyonda). Motorun
 * ham kutusu birkac uzak blogu da kapsiyordu. Fiksturler iki GERCEK dosyanin
 * olculmus ikizleridir (canli A-sihhi projesi ve Marina); G ile baslayanlar kural,
 * B baglanti (viewer kamerayi bu kutuyla sigdiriyor mu).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { gorunumKutusu, type Kutu } from './gorunum-kutusu';
import type {
  GeometryArc, GeometryCircle, GeometryInsert, GeometryLine, GeometryResult, GeometryText,
} from './types';

/** Belirlenimci rastgele (mulberry32) — fikstur her kosumda ayni. */
function rastgele(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cizgi = (x1: number, y1: number, x2: number, y2: number, layer = 'BORU'): GeometryLine => ({
  layer, color: 7, coords: [x1, y1, x2, y2],
});
const blok = (x: number, y: number, layer = '0'): GeometryInsert => ({
  insert_index: 0, layer, color: 256, insert_name: 'B', position: [x, y], rotation: 0, scale: [1, 1],
});
const daire = (x: number, y: number, radius: number): GeometryCircle => ({
  circle_index: 0, layer: 'SPRINK', color: 256, center: [x, y], radius,
});
const yazi = (x: number, y: number): GeometryText => ({
  text: 'Ø50', layer: 'YAZI', color: 7, position: [x, y], height: 250, rotation: 0,
});
const yay = (x: number, y: number, radius: number): GeometryArc => ({
  layer: 'BORU', color: 7, center: [x, y], radius, start_angle: 0, end_angle: 90,
});
/** Telden gecir: motor JSON yollar; NaN ve ±∞ JSON'da null olur (main.py `_json_safe`). */
const tel = (g: GeometryResult): GeometryResult => JSON.parse(JSON.stringify(g));

/** Kutu icinde rastgele kisa cizgiler (kume). */
function kume(adet: number, [x0, y0, x1, y1]: Kutu, tohum: number, layer = 'BORU'): GeometryLine[] {
  const r = rastgele(tohum);
  return Array.from({ length: adet }, () => {
    const ax = x0 + r() * (x1 - x0);
    const ay = y0 + r() * (y1 - y0);
    const bx = Math.min(x1, Math.max(x0, ax + (r() - 0.5) * 2000));
    const by = Math.min(y1, Math.max(y0, ay + (r() - 0.5) * 2000));
    return cizgi(ax, ay, bx, by, layer);
  });
}

/** Motor gibi: ham kutu butun varliklarin min/maks'i (sonlu olanlar). */
function geo(p: Partial<GeometryResult>): GeometryResult {
  const g: GeometryResult = {
    lines: p.lines ?? [], inserts: p.inserts ?? [], texts: p.texts ?? [], circles: p.circles ?? [],
    arcs: p.arcs ?? [], bounds: [0, 0, 0, 0], layer_colors: {},
  };
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  const n = (x: number, y: number, r = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    a = Math.min(a, x - r); b = Math.min(b, y - r); c = Math.max(c, x + r); d = Math.max(d, y + r);
  };
  g.lines.forEach((l) => { n(l.coords[0], l.coords[1]); n(l.coords[2], l.coords[3]); });
  g.inserts.forEach((e) => n(e.position[0], e.position[1]));
  g.circles.forEach((e) => n(e.center[0], e.center[1], e.radius));
  g.bounds = p.bounds ?? [a, b, c, d];
  return g;
}

const cizgiKutusu = (ls: GeometryLine[]): Kutu => geo({ lines: ls }).bounds;
const kosegen = ([a, b, c, d]: Kutu) => Math.hypot(c - a, d - b);

describe('gorunumKutusu — kural', () => {
  it('G1 canli proje ikizi: -445 milyondaki 3 blok + ~4 milyondaki 40 mimari blok kutuya GIRMEZ', () => {
    const plan = kume(5000, [102_000, 526_000, 156_000, 549_000], 1);
    const r = rastgele(2);
    const uzak = [
      ...[0, 1, 2].map((i) => blok(-445_580_213 + i * 50, -41_548_288)),
      ...Array.from({ length: 40 }, () => blok((r() - 0.5) * 8e6, (r() - 0.5) * 8e6, 'aYALKI_elevatıon 4')),
    ];
    const g = geo({ lines: plan, inserts: uzak });
    const k = gorunumKutusu(g);
    expect(k).toEqual(cizgiKutusu(plan));
    expect(kosegen(g.bounds) / kosegen(k)).toBeGreaterThan(1000); // olculen: 7.655 kat
  });

  it('G2 ikinci aile (Marina ikizi): 30 kosegen uzaktaki serit ve 4,5 kosegen uzaktaki grup disarida', () => {
    // Olculen oranlar: serit noktalarin %1,07'si (planla AYNI Y'de, X'te ±31 milyon),
    // grup %0,2 (planin 4,6 milyon yukarisinda). Planin %2-%98 dilimi cekirdektir.
    const plan = kume(8000, [-470_000, 4_520_000, 547_000, 4_600_000], 3);
    const r = rastgele(4);
    const serit = Array.from({ length: 86 }, () => {
      const x = (r() < 0.5 ? -1 : 1) * (2e6 + r() * 29e6);
      return cizgi(x, 4_600_000, x + 1000, 4_600_000, '977200');
    });
    const grup = kume(16, [-938_000, 9_150_000, 938_000, 9_220_000], 5, '---BORU-KANAL TAŞIYICI+KESİT');
    const k = gorunumKutusu(geo({ lines: [...plan, ...serit, ...grup] }));
    expect(k).toEqual(cizgiKutusu(plan));
  });

  it('G2b SINIR: bir uctaki sapkinlar noktalarin %2sini asarsa kutu onlari da kapsar (bugunku davranis, daha kotu degil)', () => {
    const plan = kume(4000, [0, 0, 100_000, 50_000], 14);
    const yigin = kume(200, [5e7, 0, 5e7 + 1000, 1000], 15); // 400 nokta = %4,8, tek uc
    const g = geo({ lines: [...plan, ...yigin] });
    expect(gorunumKutusu(g)).toEqual(g.bounds);
  });

  it('G3 sapkin yoksa sonuc ham kutunun KENDISI', () => {
    const g = geo({ lines: kume(3000, [0, 0, 80_000, 40_000], 6) });
    expect(gorunumKutusu(g)).toEqual(g.bounds);
  });

  it('G4 iki buyuk kume (esit agirlik) ikisi de kutuda — yan yana paftalar kirpilmaz', () => {
    const sol = kume(2500, [0, 0, 50_000, 30_000], 7);
    const sag = kume(2500, [1_000_000, 0, 1_050_000, 30_000], 8);
    const g = geo({ lines: [...sol, ...sag] });
    expect(gorunumKutusu(g)).toEqual(g.bounds);
  });

  it('G5 yogun icerigin cevresindeki SEYREK cerceve (4 cizgi) kirpilmaz', () => {
    const icerik = kume(5000, [0, 0, 100_000, 50_000], 9);
    const cerceve = [
      cizgi(-20_000, -15_000, 120_000, -15_000), cizgi(120_000, -15_000, 120_000, 65_000),
      cizgi(120_000, 65_000, -20_000, 65_000), cizgi(-20_000, 65_000, -20_000, -15_000),
    ];
    expect(gorunumKutusu(geo({ lines: [...icerik, ...cerceve] }))).toEqual([-20_000, -15_000, 120_000, 65_000]);
  });

  it('G6 kucuk cizim (10 cizgi, 20 nokta ≤ 25): uzaktaki parca da kutuda — cok az noktada ayiklama yapilmaz', () => {
    const ls = [...kume(9, [0, 0, 1000, 1000], 10), cizgi(1_000_000, 1_000_000, 1_000_100, 1_000_000)];
    const g = geo({ lines: ls });
    expect(gorunumKutusu(g)).toEqual(g.bounds);
  });

  it('G7 bellekteki NaN/±∞ ornekten suzulur — noktalarin %5i NaN olsa da sapkinlar ayiklanir', () => {
    // Suzulmeseydi NaN'lar siralamanin ucuna yigilir, %98 dilimi NaN olur ve
    // kural ham kutuya (uzak cizgiler dahil) donerdi.
    const plan = kume(2000, [0, 0, 10_000, 10_000], 11);
    const bozuk = Array.from({ length: 100 }, () => cizgi(NaN, 5, NaN, 7));
    const uzak = [cizgi(-4e8, -4e8, -4e8 + 10, -4e8), cizgi(4e8, 4e8, 4e8 + 10, 4e8), cizgi(Infinity, 0, 0, -Infinity)];
    const k = gorunumKutusu(geo({ lines: [...plan, ...bozuk, ...uzak] }));
    expect(k.every(Number.isFinite)).toBe(true);
    expect(k).toEqual(cizgiKutusu(plan));
  });

  it('G7b telden gelen null 0 SAYILMAZ — motor NaN/±∞u JSONda null yollar (cizgi, yazi, daire, yay)', () => {
    // Kod incelemesi 2. tur: null, >= ve <= karsilastirmasinda 0 sayilir. Plan
    // orijinden uzakta ama 0 payin icinde: tip denetimsiz kesin gecis null'u
    // min'e yazip ham kutuya (uzak cizgiler dahil) doner ya da kutuyu orijine
    // uzatirdi. Bellekteki NaN (G7) bu yolu SINAMAZ — tel null tasir.
    const plan = kume(2000, [1000, 1000, 11_000, 11_000], 11);
    const g = geo({
      lines: [
        ...plan,
        ...Array.from({ length: 50 }, () => cizgi(NaN, 5000, NaN, 7000)),
        ...Array.from({ length: 50 }, () => cizgi(5000, NaN, 7000, Infinity)),
        cizgi(-4e8, -4e8, -4e8 + 10, -4e8), cizgi(4e8, 4e8, 4e8 + 10, 4e8),
      ],
      texts: [yazi(NaN, 5000)],
      circles: [daire(5000, NaN, 10)],
      arcs: [yay(-Infinity, 5000, 10)],
    });
    const k = gorunumKutusu(tel(g));
    expect(k.every(Number.isFinite)).toBe(true);
    expect(k).toEqual(cizgiKutusu(plan));
  });

  it('G11 noktalarin neredeyse hepsi tek yerde + uzak sapkin: kutu o nokta, ham kutu DEGIL', () => {
    const yigin = Array.from({ length: 1000 }, () => cizgi(5, 5, 5, 5));
    const uzak = [cizgi(-4e8, -4e8, -4e8, -4e8 + 1), cizgi(4e8, 4e8, 4e8 + 1, 4e8), cizgi(1e8, -3e8, 1e8, -3e8)];
    const g = geo({ lines: [...yigin, ...uzak] });
    expect(gorunumKutusu(g)).toEqual([5, 5, 5, 5]);
  });

  it('G12 INSERT capasi kutuya GIRMEZ — sahne capayi cizmez; capalarin %30u 0,0da olsa da', () => {
    // Kod incelemesi (26.09): capalar %2'yi asarsa (tabani 0,0'da kalmis bloklar)
    // capayi sayan kural kutuyu orijine uzatir ve plan yine kucuk gorunurdu.
    const plan = kume(3000, [102_000, 526_000, 156_000, 549_000], 16);
    const capalar = Array.from({ length: 2600 }, () => blok(0, 0, 'MIMARI_BLOK'));
    expect(gorunumKutusu(geo({ lines: plan, inserts: capalar }))).toEqual(cizgiKutusu(plan));
  });

  it('G13 ornek VARLIK basina: adim cift oldugunda da cizginin IKI ucu orneklenir', () => {
    // 150 bin cizgi → adim 2. Cizgilerin %3'u uzak bir noktadan (baslangic) plana
    // (bitis) gidiyor: butun noktalarin %1,5'i uzak → ayiklanir. Nokta basina
    // adimlayan eski ornek yalniz BASLANGICLARI secip uzakligi %3 gorur, cekirdek
    // uzaga uzanirdi (kod incelemesi: kutu ~400 kat sisiyordu).
    const plan = kume(145_500, [0, 0, 200_000, 100_000], 17);
    const r = rastgele(18);
    const uzaktanGelen = Array.from({ length: 4_500 }, () =>
      cizgi(-4e8 + r() * 1e6, -4e8 + r() * 1e6, r() * 200_000, r() * 100_000));
    const k = gorunumKutusu(geo({ lines: [...plan, ...uzaktanGelen] }));
    expect(k[0]).toBeGreaterThanOrEqual(0);
    expect(k[1]).toBeGreaterThanOrEqual(0);
    expect(kosegen(k)).toBeLessThan(kosegen([0, 0, 200_000, 100_000]) * 1.01);
  });

  it('G8 dairenin yaricapi kutuya girer; anlamsiz buyuk yaricap kutuyu sisiremez', () => {
    const plan = kume(2000, [0, 0, 10_000, 10_000], 12);
    const [, , mx, my] = cizgiKutusu(plan);
    const k = gorunumKutusu(geo({ lines: plan, circles: [daire(mx, my, 500), daire(5000, 5000, 1e12)] }));
    expect([k[2], k[3]]).toEqual([mx + 500, my + 500]);
    expect(kosegen(k)).toBeLessThan(20_000);
  });

  it.each([['yazi', 0], ['daire', 40], ['yay', 40]] as const)(
    'G14 yalniz %s (yaricap %i): tip hem ornege hem kesin gecise girer; uzaktaki disarida',
    (tip, R) => {
      // Kod incelemesi 2. tur: hicbir test yazi ve yay vermiyordu — o satirlara
      // yapilan mutasyon yasardi. Tek tipli cizim ornegi de o tipten kurar.
      const r = rastgele(19);
      const ps = Array.from({ length: 500 }, (): [number, number] => [1000 + r() * 10_000, 1000 + r() * 10_000]);
      const varlik = [...ps, [4e8, 4e8] as [number, number]];
      const g =
        tip === 'yazi' ? geo({ texts: varlik.map(([x, y]) => yazi(x, y)) })
          : tip === 'daire' ? geo({ circles: varlik.map(([x, y]) => daire(x, y, R)) })
            : geo({ arcs: varlik.map(([x, y]) => yay(x, y, R)) });
      const xs = ps.map((p) => p[0]);
      const ys = ps.map((p) => p[1]);
      expect(gorunumKutusu(g)).toEqual([
        Math.min(...xs) - R, Math.min(...ys) - R, Math.max(...xs) + R, Math.max(...ys) + R,
      ]);
    },
  );

  it('G9 bos geometri: motorun kutusu aynen', () => {
    expect(gorunumKutusu(geo({ bounds: [1, 2, 3, 4] }))).toEqual([1, 2, 3, 4]);
  });

  it('G10 buyuk cizim (300 bin cizgi, orneklemeli yol) + uzak cizgiler: kesin plan kutusu', () => {
    // Sure BURADA olculmez (CI'da duvar saati esigi kararsiz olur); hiz olcumu
    // commit mesajinda. Bu test ornekleme yolunun dogrulugunu buyuk olcekte sinar.
    const plan = kume(300_000, [0, 0, 500_000, 300_000], 13);
    const g = geo({ lines: [...plan, cizgi(-9e8, -9e8, -9e8 + 1, -9e8), cizgi(9e8, 9e8, 9e8, 9e8 + 1)] });
    expect(gorunumKutusu(g)).toEqual(cizgiKutusu(plan));
  });
});

// ── B) BAGLANTI: viewer kamerayi HAM kutuyla degil gorunum kutusuyla sigdirir ──
function oku(yol: string): ts.SourceFile {
  return ts.createSourceFile(yol, readFileSync(yol, 'utf-8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
const VIEWER = oku(join(__dirname, 'DxfCanvasViewer.tsx'));
function hepsi<T extends ts.Node>(k: ts.Node, f: (n: ts.Node) => n is T): T[] {
  const s: T[] = [];
  const gez = (n: ts.Node) => { if (f(n)) s.push(n); ts.forEachChild(n, gez); };
  gez(k);
  return s;
}
const degisken = (ad: string) =>
  hepsi(VIEWER, (n): n is ts.VariableDeclaration => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === ad);

/** `const <ad> = useMemo(geri, [bag])` → [geri cagrinin govdesi, bagimlilik metni]. */
function memo(ad: string): [ts.Node | undefined, string | undefined] {
  const [d] = degisken(ad);
  const c = d?.initializer;
  if (!c || !ts.isCallExpression(c) || c.expression.getText() !== 'useMemo') return [undefined, undefined];
  const geri = c.arguments[0];
  return [geri && ts.isArrowFunction(geri) ? geri.body : undefined, c.arguments[1]?.getText()];
}

describe('gorunumKutusu — viewer baglantisi', () => {
  it('B1 cizimKutusu = useMemo(gorunumKutusu(geometry), [geometry]) — yalniz geometri degisince', () => {
    const [govde, bag] = memo('cizimKutusu');
    const cagri = govde ? hepsi(govde, (n): n is ts.CallExpression =>
      ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'gorunumKutusu') : [];
    expect([cagri.map((c) => c.arguments.map((a) => a.getText()).join(',')), bag]).toEqual([['geometry'], '[geometry]']);
  });

  it('B2 bounds ILK kosulda cizimKutusu dondurur ve ona bagimli; viewer HAM geometry.bounds okumaz', () => {
    const [govde, bag] = memo('bounds');
    const ilk = govde && ts.isBlock(govde) ? govde.statements[0] : undefined;
    const kosul = ilk && ts.isIfStatement(ilk) ? ilk.expression.getText() : undefined;
    const donus = ilk && ts.isIfStatement(ilk) ? ilk.thenStatement.getText() : undefined;
    expect([kosul, donus, /\bcizimKutusu\b/.test(bag ?? '')]).toEqual(['cizimKutusu', 'return cizimKutusu;', true]);
    const hamOkuma = hepsi(VIEWER, (n): n is ts.PropertyAccessExpression =>
      ts.isPropertyAccessExpression(n) && n.name.text === 'bounds' && n.expression.getText() === 'geometry');
    expect(hamOkuma.map((n) => n.getText())).toEqual([]);
  });

  it('B3 kamera (useViewport) bu bounds ile kurulur', () => {
    const cagri = hepsi(VIEWER, (n): n is ts.CallExpression =>
      ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useViewport');
    const nesne = cagri[0]?.arguments[0];
    const ozellik = nesne && ts.isObjectLiteralExpression(nesne)
      ? nesne.properties.find((p) => p.name?.getText() === 'bounds')
      : undefined;
    expect(ozellik?.getText()).toBe('bounds');
  });
});
