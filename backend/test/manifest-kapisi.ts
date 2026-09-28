/**
 * PK1 — MANIFEST KAPISI  (`npm run test:manifest`)
 *
 * Kapatma turunda kalem 30'un KOK NEDENI bulundu: `test:of` · `test:admin-import`
 * · `test:library` · `test:perf` aylarca `regression-all.ts` SUITES listesinde
 * DEGILDI. Dordu de assert'liydi ama "regresyon yesil" cumlesi onlari
 * KAPSAMIYORDU. Kok neden **unutulma** idi — ve unutmayi engelleyen hicbir kapi
 * yoktu. Bu dosya o kapidir: yeni bir `test:*` scripti eklenip SUITES'e
 * girilmezse regresyon KIRMIZI olur.
 *
 * Kural: package.json'daki HER `test:*` scripti ya SUITES'te olacak ya da
 * asagidaki ISTISNALAR listesinde GEREKCESIYLE yer alacak. Gerekcesiz istisna
 * kabul edilmez (bos gerekce = FAIL) — istisna listesi sessiz cop kutusu olmasin.
 *
 * Kural 4 (asili soz, 27.09.2026): SUITES'teki `ts-node test/x.ts` kapisi
 * ASYNC ise asili soz korumasi tasir. Yoksa FAIL, kapinin adiyla. Neden:
 * cozulmeyen bir soz olay dongusunu bosaltirsa Node OZETSIZ 0 ile cikar ve
 * regression-all onu PASS sayar. Olculdu (25.09): akisi hic baslatmayan
 * mutant 90 async kapinin 88'inde ozetsiz 0 verdi.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/** Istisna = pakete GIRMEMESI dogru olan script. Gerekce ZORUNLU.
 *  KARARSIZ TEST (14.09.2026 kurali): duzeltilemeyen kararsiz test SUITES'ten
 *  cikarilacaksa buraya ADIYLA, gerekce + tarihle yazilir — sessizce silinmez. */
const ISTISNALAR: Record<string, string> = {
  'test:regression': 'Paketin KENDISI (orkestrator) — kendini calistiramaz, sonsuz dongu olur.',
  'test:tam': 'Ust zincir: test:regression + FE vitest + Playwright. Paketi KAPSAR, icine giremez.',
};

const kok = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(kok, 'package.json'), 'utf-8'));
const regKaynak = fs.readFileSync(path.join(kok, 'test', 'regression-all.ts'), 'utf-8');

/** SUITES bloğundaki `script: 'test:xxx'` degerleri. */
const suitesBlok = regKaynak.split('const SUITES')[1]?.split('\n];')[0] ?? '';
const suitesScriptleri = new Set(
  [...suitesBlok.matchAll(/script:\s*'([^']+)'/g)].map((m) => m[1]),
);

const testScriptleri = Object.keys(pkg.scripts ?? {}).filter((s) => s.startsWith('test:'));

const hatalar: string[] = [];

// ── 1) Her test:* ya SUITES'te ya gerekceli istisnada ────────────────────────
for (const s of testScriptleri) {
  if (suitesScriptleri.has(s)) continue;
  if (!(s in ISTISNALAR)) {
    hatalar.push(`MANIFEST DELIGI: "${s}" ne SUITES'te ne istisnada — regresyon bu suite'i HIC kosmuyor.`);
  } else if (!ISTISNALAR[s]?.trim()) {
    hatalar.push(`GEREKCESIZ ISTISNA: "${s}" istisnada ama gerekcesi bos.`);
  }
}

// ── 2) Ters yon: SUITES'te olup package.json'da olmayan script (yazim hatasi) ─
for (const s of suitesScriptleri) {
  if (!testScriptleri.includes(s)) {
    hatalar.push(`OLU SUITE KAYDI: SUITES'te "${s}" var ama package.json'da boyle bir script YOK.`);
  }
}

// ── 3) Istisna listesi bayatlamasin: silinen scriptin istisnasi da silinsin ──
for (const s of Object.keys(ISTISNALAR)) {
  if (!testScriptleri.includes(s)) {
    hatalar.push(`BAYAT ISTISNA: "${s}" artik package.json'da yok, istisnadan da kaldirilmali.`);
  }
}

// ── 4) Async kapi asili soz korumali ─────────────────────────────────────────
// Kabul edilen iki koruma:
//   (a) SON deyim `bitmezseKirmizi(<akis>)` VE yardimci './yardimci/bitmezse-kirmizi'ten
//       adiyla ice aktarilmis. Yerel bir sahte fonksiyon koruma sayilmaz.
//   (b) Ust duzeyde `process.on('beforeExit' | 'exit', <isleyici>)` kaydi (satir ici
//       koruma) VE isleyici cikisi kirmiziya ceker: `process.exitCode = <0 disi sayi>`
//       ya da `process.exit(<0 disi sayi>)`. Yalniz kayit yetmez: cikis kodu satiri
//       silinen isleyici koruma degildir.
// ASYNC = kodda `await` ifadesi (for await dahil) ya da `.then/.catch/.finally` cagrisi.
// Tespit AST ile yapilir, metinle degil. Yorumdaki ve dize/regex icindeki "await"
// sayilmaz: metin olcutu faz5 ile eposta-kodu'yu yanlislikla async sayiyordu.
// ts-node DISI kapi (senkron .mjs) sessizce atlanmaz: TS_NODE_DISI defterinde
// gerekcesiyle durur. Kosucusu degisen kapi (tsx, vitest...) FAIL olur.
// Zincirli komutta (`ts-node a.ts && ts-node b.ts`) her dosya denetlenir.
// BILINEN SINIR (27.09 incelemesi, bugun ornegi yok):
//   - Sarmalin argumani akisin TAMAMI mi, olculmez.
//   - Akisini baska dosyadaki yardimciya devreden kapi senkron gorunur.
//   Ikisini kapinin eklendigi turdaki asili mutant olcer.
const KORUMA_YARDIMCISI = './yardimci/bitmezse-kirmizi';
const KORUMA_SARMALI = 'bitmezseKirmizi';
const KORUMA_OLAYLARI = new Set(['beforeExit', 'exit']);

/** ts-node olmayan SUITES kapilari. Gerekce ZORUNLU: neden asili soz riski tasimaz. */
const TS_NODE_DISI: Record<string, string> = {
  'test:harita': 'node ../scripts/harita-denetle.mjs — senkron .mjs (soz, zamanlayici, await yok)',
  'test:klasor': 'node ../scripts/klasor-denetle.mjs — senkron .mjs (soz, zamanlayici, await yok)',
};

/** Isleyici govdesi cikisi kirmiziya ceker mi: `process.exitCode = N` ya da `process.exit(N)`, N ≠ 0. */
function cikisiKirmiziyaCeker(isleyici: ts.Node): boolean {
  let var_ = false;
  const processUyesi = (e: ts.Node, ad: string): boolean => ts.isPropertyAccessExpression(e)
    && ts.isIdentifier(e.expression) && e.expression.text === 'process' && e.name.text === ad;
  const sifirDisi = (e: ts.Node): boolean => ts.isNumericLiteral(e) && Number(e.text) !== 0;
  const ara = (n: ts.Node): void => {
    if (var_) return;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && processUyesi(n.left, 'exitCode') && sifirDisi(n.right)) {
      var_ = true;
      return;
    }
    if (ts.isCallExpression(n) && processUyesi(n.expression, 'exit')
      && n.arguments.length === 1 && sifirDisi(n.arguments[0])) {
      var_ = true;
      return;
    }
    ts.forEachChild(n, ara);
  };
  ara(isleyici);
  return var_;
}

function kapiSinifla(ad: string, kaynak: string): { async: boolean; sarmal: boolean; satirIci: boolean } {
  const sf = ts.createSourceFile(ad, kaynak, ts.ScriptTarget.ES2021, true, ts.ScriptKind.TS);
  let async = false;
  const gez = (n: ts.Node): void => {
    if (async) return;
    const promiseZinciri = ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
      && ['then', 'catch', 'finally'].includes(n.expression.name.text);
    if (ts.isAwaitExpression(n) || (ts.isForOfStatement(n) && !!n.awaitModifier) || promiseZinciri) {
      async = true;
      return;
    }
    ts.forEachChild(n, gez);
  };
  gez(sf);

  const yardimciIceAktarildi = sf.statements.some((d) => {
    if (!ts.isImportDeclaration(d) || !ts.isStringLiteral(d.moduleSpecifier)) return false;
    if (d.moduleSpecifier.text !== KORUMA_YARDIMCISI) return false;
    const adlar = d.importClause?.namedBindings;
    return !!adlar && ts.isNamedImports(adlar)
      && adlar.elements.some((e) => e.name.text === KORUMA_SARMALI && !e.propertyName);
  });
  const son = sf.statements[sf.statements.length - 1];
  const sarmal = yardimciIceAktarildi && !!son && ts.isExpressionStatement(son)
    && ts.isCallExpression(son.expression) && ts.isIdentifier(son.expression.expression)
    && son.expression.expression.text === KORUMA_SARMALI && son.expression.arguments.length === 1;
  const satirIci = sf.statements.some((d) => {
    if (!ts.isExpressionStatement(d) || !ts.isCallExpression(d.expression)) return false;
    const c = d.expression;
    return ts.isPropertyAccessExpression(c.expression) && ts.isIdentifier(c.expression.expression)
      && c.expression.expression.text === 'process' && c.expression.name.text === 'on'
      && c.arguments.length === 2 && ts.isStringLiteralLike(c.arguments[0])
      && KORUMA_OLAYLARI.has(c.arguments[0].text) && cikisiKirmiziyaCeker(c.arguments[1]);
  });
  return { async, sarmal, satirIci };
}

const koruma = { async: 0, sarmal: 0, satirIci: 0, senkron: 0, tsNodeDisi: 0 };
for (const s of [...suitesScriptleri].sort()) {
  const komut = String(pkg.scripts?.[s] ?? '');
  if (!komut.includes('ts-node')) {
    if (s in TS_NODE_DISI) koruma.tsNodeDisi++;
    else hatalar.push(`DENETLENEMEYEN KAPI: "${s}" → "${komut}" ts-node degil ve TS_NODE_DISI defterinde yok —`
      + ' asili soz denetimi bu kapiyi goremiyor. Kosucuyu ts-node yap ya da deftere gerekcesiyle yaz.');
    continue;
  }
  const dosyalar = [...komut.matchAll(/ts-node\s+(test\/\S+\.ts)/g)].map((m) => m[1]);
  if (!dosyalar.length) {
    hatalar.push(`TANINMAYAN KAPI KOMUTU: "${s}" → "${komut}" — asili soz denetimi dosyayi bulamiyor.`);
    continue;
  }
  for (const d of dosyalar) {
    const dosya = path.join(kok, d);
    if (!fs.existsSync(dosya)) {
      hatalar.push(`KAPI DOSYASI YOK: "${s}" → ${d} bulunamadi.`);
      continue;
    }
    const k = kapiSinifla(d, fs.readFileSync(dosya, 'utf-8'));
    if (!k.async) {
      koruma.senkron++;
    } else if (k.sarmal) {
      koruma.async++;
      koruma.sarmal++;
    } else if (k.satirIci) {
      koruma.async++;
      koruma.satirIci++;
    } else {
      koruma.async++;
      hatalar.push(`KORUMASIZ ASYNC KAPI: "${s}" (${d}) — cozulmeyen bir sozde olay dongusu bosalirsa`
        + ' OZETSIZ 0 ile cikar ve PASS sayilir. Son deyimi `bitmezseKirmizi(...)` ile sar'
        + ' (test/yardimci/bitmezse-kirmizi.ts) ya da ust duzeyde cikisi kirmiziya ceken'
        + ` process.on('beforeExit') korumasi ekle.`);
    }
  }
}
// Defter bayatlamasin: SUITES'ten cikan ya da ts-node'a gecen kapinin satiri silinsin.
for (const s of Object.keys(TS_NODE_DISI)) {
  if (!suitesScriptleri.has(s) || String(pkg.scripts?.[s] ?? '').includes('ts-node')) {
    hatalar.push(`BAYAT TS_NODE_DISI: "${s}" artik SUITES'te ts-node disi kapi degil, defterden kaldirilmali.`);
  }
}

console.log('── PK1 MANIFEST KAPISI ──');
console.log(`  package.json test:* scripti : ${testScriptleri.length}`);
console.log(`  SUITES'te kayitli           : ${suitesScriptleri.size}`);
console.log(`  gerekceli istisna           : ${Object.keys(ISTISNALAR).length}`);
for (const [s, g] of Object.entries(ISTISNALAR)) console.log(`    - ${s}: ${g}`);
console.log(`  asili soz: async kapi ${koruma.async} (sarmal ${koruma.sarmal} + satir ici ${koruma.satirIci})`
  + ` · senkron ${koruma.senkron} · ts-node disi ${koruma.tsNodeDisi} (defterde)`);
for (const [s, g] of Object.entries(TS_NODE_DISI)) console.log(`    - ${s}: ${g}`);

if (hatalar.length) {
  console.log('');
  for (const h of hatalar) console.log(`  ❌ ${h}`);
  console.log(`\nPK1 FAIL — ${hatalar.length} manifest ihlali.`);
  process.exit(1);
}
console.log(`\nPK1 PASS — ${testScriptleri.length} scriptin tamami kapsanmis (SUITES veya gerekceli istisna);`
  + ` ${koruma.async} async kapinin tamami asili soz korumali, ${koruma.tsNodeDisi} ts-node disi kapi defterde.`);
