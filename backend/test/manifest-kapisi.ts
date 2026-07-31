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
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import * as fs from 'fs';
import * as path from 'path';

/** Istisna = pakete GIRMEMESI dogru olan script. Gerekce ZORUNLU. */
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

console.log('── PK1 MANIFEST KAPISI ──');
console.log(`  package.json test:* scripti : ${testScriptleri.length}`);
console.log(`  SUITES'te kayitli           : ${suitesScriptleri.size}`);
console.log(`  gerekceli istisna           : ${Object.keys(ISTISNALAR).length}`);
for (const [s, g] of Object.entries(ISTISNALAR)) console.log(`    - ${s}: ${g}`);

if (hatalar.length) {
  console.log('');
  for (const h of hatalar) console.log(`  ❌ ${h}`);
  console.log(`\nPK1 FAIL — ${hatalar.length} manifest ihlali.`);
  process.exit(1);
}
console.log(`\nPK1 PASS — ${testScriptleri.length} scriptin tamami kapsanmis (SUITES veya gerekceli istisna).`);
