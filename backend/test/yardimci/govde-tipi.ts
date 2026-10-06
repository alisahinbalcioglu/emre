/**
 * GÖVDE TİPİ — bir ucun `@Body()` tipi DİZİ taşıyor mu? (06.10.2026)
 *
 * `test:buyuk-govde` B10 (dizili gövdeli yönetici ucu geniş gövde kuralında mı)
 * bunu okur. Tip AST ile çözülür: satır içi tip, aynı dosyadaki ya da GÖRELİ
 * içe aktarılan (takma adlı dahil) sınıf / arayüz / tip takma adı, `extends`
 * ve `PartialType(X)` gibi türetmeler, `Partial`/`Record` gibi yerleşik
 * genelleştirmeler.
 *
 * ⚠ FAIL-CLOSED: çözülemeyen tip (`any`, `unknown`, `object`, tipsiz parametre,
 *   bulunamayan ad, varsayılan/ad alanı içe aktarma, paket tipi) `'cozulemedi'`
 *   döner ve kapı onu "dizi taşıyabilir" sayar — yeni bir uç kör noktadan
 *   geçip 1 MB'ta kalmasın (06.10 kod incelemesi LOW-1).
 */
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import type { Uc } from './uc-envanteri';

export type GovdeTipi = 'dizi' | 'dizisiz' | 'cozulemedi';

const kaynaklar = new Map<string, ts.SourceFile>();
function kaynak(dosya: string): ts.SourceFile {
  let k = kaynaklar.get(dosya);
  if (!k) {
    k = ts.createSourceFile(dosya, fs.readFileSync(dosya, 'utf8'), ts.ScriptTarget.ES2021, true);
    kaynaklar.set(dosya, k);
  }
  return k;
}

type Bildirim = ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration;
/** Ad → bildirimi: aynı dosyada ya da adlı GÖRELİ içe aktarmayla. */
function bildirimBul(dosya: string, ad: string, derinlik = 0): { dosya: string; dugum: Bildirim } | undefined {
  if (derinlik > 4) return undefined;
  const k = kaynak(dosya);
  for (const d of k.statements) {
    if ((ts.isClassDeclaration(d) || ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d)) && d.name?.text === ad) return { dosya, dugum: d };
  }
  for (const d of k.statements) {
    const baglar = ts.isImportDeclaration(d) ? d.importClause?.namedBindings : undefined;
    if (!baglar || !ts.isNamedImports(baglar)) continue;
    const oge = baglar.elements.find((e) => e.name.text === ad);
    const modul = (d as ts.ImportDeclaration).moduleSpecifier;
    if (!oge || !ts.isStringLiteral(modul) || !modul.text.startsWith('.')) continue;
    const taban = path.resolve(path.dirname(dosya), modul.text);
    const hedef = [`${taban}.ts`, path.join(taban, 'index.ts')].find((p) => fs.existsSync(p));
    return hedef ? bildirimBul(hedef, (oge.propertyName ?? oge.name).text, derinlik + 1) : undefined;
  }
  return undefined;
}

const birlestir = (sonuclar: GovdeTipi[]): GovdeTipi =>
  sonuclar.includes('dizi') ? 'dizi' : sonuclar.includes('cozulemedi') ? 'cozulemedi' : 'dizisiz';
/** Yerleşik genelleştirmeler: karar tip argümanlarındadır. */
const YERLESIK = new Set(['Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Record', 'NonNullable']);
const DIZISIZ_ANAHTAR = new Set([ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.UndefinedKeyword, ts.SyntaxKind.NullKeyword, ts.SyntaxKind.LiteralType, ts.SyntaxKind.VoidKeyword]);

function bildirimTipi(b: { dosya: string; dugum: Bildirim }, derinlik: number): GovdeTipi {
  if (ts.isTypeAliasDeclaration(b.dugum)) return tipDizi(b.dosya, b.dugum.type, derinlik + 1);
  const uyeler = (b.dugum.members as ts.NodeArray<ts.Node>).map((m) =>
    (ts.isPropertyDeclaration(m) || ts.isPropertySignature(m) || ts.isIndexSignatureDeclaration(m))
      ? tipDizi(b.dosya, m.type, derinlik + 1) : 'dizisiz' as GovdeTipi);
  // `extends X` / `extends PartialType(X)`: ata da okunur (çözülemezse fail-closed).
  const atalar = (b.dugum.heritageClauses ?? []).flatMap((h) => h.types).map((t) => {
    const ifade = ts.isCallExpression(t.expression) ? t.expression.arguments[0] : t.expression;
    const ata = ifade && ts.isIdentifier(ifade) ? bildirimBul(b.dosya, ifade.text) : undefined;
    return ata ? bildirimTipi(ata, derinlik + 1) : 'cozulemedi' as GovdeTipi;
  });
  return birlestir([...uyeler, ...atalar]);
}

export function tipDizi(dosya: string, tip: ts.Node | undefined, derinlik = 0): GovdeTipi {
  if (!tip || derinlik > 6) return 'cozulemedi';
  if (ts.isArrayTypeNode(tip) || ts.isTupleTypeNode(tip)) return 'dizi';
  if (DIZISIZ_ANAHTAR.has(tip.kind)) return 'dizisiz';
  if (ts.isTypeReferenceNode(tip)) {
    const ad = tip.typeName.getText();
    if (ad === 'Array' || ad === 'ReadonlyArray') return 'dizi';
    const argumanlar = (tip.typeArguments ?? []).map((a) => tipDizi(dosya, a, derinlik + 1));
    if (YERLESIK.has(ad)) return birlestir(argumanlar);
    const b = bildirimBul(dosya, ad);
    return b ? birlestir([...argumanlar, bildirimTipi(b, derinlik)]) : 'cozulemedi';
  }
  if (ts.isTypeLiteralNode(tip)) {
    return birlestir(tip.members.map((m) =>
      (ts.isPropertySignature(m) || ts.isIndexSignatureDeclaration(m)) ? tipDizi(dosya, m.type, derinlik + 1) : 'dizisiz'));
  }
  if (ts.isUnionTypeNode(tip) || ts.isIntersectionTypeNode(tip)) return birlestir(tip.types.map((t) => tipDizi(dosya, t, derinlik + 1)));
  if (ts.isParenthesizedTypeNode(tip)) return tipDizi(dosya, tip.type, derinlik + 1);
  return 'cozulemedi'; // any, unknown, object, koşullu/eşlenmiş tip …
}

/** Ucun `@Body()` parametresinin tipi (birden çok `@Body` varsa birleşik karar). */
export function govdeTipi(backendKoku: string, u: Uc): GovdeTipi {
  const dosya = path.join(backendKoku, u.dosya);
  const sinif = kaynak(dosya).statements.find((d): d is ts.ClassDeclaration => ts.isClassDeclaration(d) && d.name?.text === u.sinif);
  const metot = sinif?.members.find((m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && m.name.getText() === u.metot);
  const govdeler = (metot?.parameters ?? []).filter((p) => (ts.getDecorators(p) ?? []).some((d) => /^Body\b/.test(d.expression.getText())));
  return govdeler.length ? birlestir(govdeler.map((p) => tipDizi(dosya, p.type))) : 'dizisiz';
}

// ═══ Ön yüz çağrı taraması ════════════════════════════════════════════════
/** Ön yüzün kaynak dosyaları (bağımlılık, derleme ve test dizinleri hariç). */
export function onYuzDosyalari(depoKoku: string): string[] {
  const sonuc: string[] = [];
  const gez = (d: string) => {
    for (const g of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', '.next', 'e2e', 'tests', '__tests__'].includes(g.name)) continue;
      const p = path.join(d, g.name);
      if (g.isDirectory()) gez(p);
      else if (/\.(ts|tsx)$/.test(g.name) && !/\.(test|spec)\.tsx?$/.test(g.name)) sonuc.push(p);
    }
  };
  gez(path.join(depoKoku, 'frontend'));
  return sonuc;
}
const PARAM_KESIMI = '[^/\'"`\\s]+';
const kacisla = (k: string) => k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
/** Yol kalıbını ön yüz çağrısıyla eşleyen ifade: `:param` ↔ `${...}` ya da düz kesim. */
export const cagriDeseni = (yol: string) =>
  new RegExp(yol.split('/').map((k) => (k.startsWith(':') ? PARAM_KESIMI : kacisla(k))).join('/') + '(?![\\w-])');
