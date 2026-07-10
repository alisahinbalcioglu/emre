/**
 * Cevrim Motoru Test Suite (PRD v1.1 §6-§7) — DB GEREKMEZ
 *   npx ts-node test/conversion-test.ts
 *
 * PRD kabul senaryolarinin unit karsiliklarini kapsar:
 * T1/T2 (celik DN→inc), T6/T7 (PPR mm), T8 (P4 belirsizlik),
 * T9 (ters yon), T11 (32x5.4), T13 (HDPE 110), D3/D4/P3 gosterim toleranslari.
 */

import { extractSizeInfo, sizeEquivalents, isSizeTag } from '../src/modules/matching/conversion';
import type { SizeClass, SizeInfo } from '../src/modules/matching/conversion';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function expectSize(text: string, source: SizeInfo['source'] | null, value?: number) {
  const info = extractSizeInfo(text);
  if (source === null) {
    check(`extract "${text}" → null`, info === null, `got ${JSON.stringify(info)}`);
    return;
  }
  check(
    `extract "${text}" → ${source}:${value}`,
    !!info && info.source === source && info.value === value,
    `got ${JSON.stringify(info)}`,
  );
}

function expectTags(cls: SizeClass, text: string, mustInclude: string[], opts?: { ambiguous?: boolean; noConversion?: boolean }) {
  const info = extractSizeInfo(text);
  if (!info) {
    check(`equiv(${cls}) "${text}"`, false, 'size cikarilamadi');
    return;
  }
  const eq = sizeEquivalents(cls, info);
  const missing = mustInclude.filter((t) => !eq.tags.includes(t));
  check(`equiv(${cls}) "${text}" ⊇ [${mustInclude.join(',')}]`, missing.length === 0, `eksik [${missing.join(',')}], tags=[${eq.tags.join(',')}]`);
  if (opts?.ambiguous !== undefined) {
    check(`equiv(${cls}) "${text}" ambiguous=${opts.ambiguous}`, eq.ambiguous === opts.ambiguous, `got ${eq.ambiguous}`);
  }
  if (opts?.noConversion !== undefined) {
    check(`equiv(${cls}) "${text}" noConversion=${opts.noConversion}`, eq.noConversion === opts.noConversion, `got ${eq.noConversion}`);
  }
}

// ── D4: DN gosterim toleransi ──────────────────────────────
expectSize('DN 25', 'dn', 25);
expectSize('DN25', 'dn', 25);
expectSize('dn-25', 'dn', 25);
expectSize('SPRİNK HATTI BORULARI DN 25', 'dn', 25);

// ── D3: inc gosterim toleransi ─────────────────────────────
expectSize('SİYAH BORU 2"', 'inch', 2);
expectSize("SİYAH BORU 2''", 'inch', 2); // iki apostrof
expectSize('1 inç boru', 'inch', 1);
expectSize('1 inch pipe', 'inch', 1);
expectSize('1.25" boru', 'inch', 1.25);
expectSize('1 1/4" boru', 'inch', 1.25);
expectSize('1¼" boru', 'inch', 1.25);
expectSize('2 ½" boru', 'inch', 2.5);
expectSize('yangin borusu 3/4"', 'inch', 0.75);

// ── P3: mm gosterim toleransi ──────────────────────────────
expectSize('PPR BORU 32 mm', 'mm', 32);
expectSize('PPR Ø32', 'mm', 32);
expectSize('ppr d32', 'mm', 32);
expectSize('PPR-C BORU 32x5.4', 'mm', 32); // T11
expectSize('celik boru 21,3mm', 'mm', 21.3);

// ── Olcu yok ───────────────────────────────────────────────
expectSize('SPRİNK HATTI BORULARI', null);
expectSize('FİTTİNGS ORANI', null);

// ── Celik cevrim (T1/T2/T9) ────────────────────────────────
expectTags('steel', 'SPRİNK HATTI BORULARI DN 25', ['dn25']); // T1: DN25 = 1" — dn25 tag'i kutuphanenin 1" urununu bulur
expectTags('steel', 'DN 100', ['dn100']); // T2
expectTags('steel', '1"', ['dn25']); // T9 ters yon: inc → DN
expectTags('steel', '1 1/4"', ['dn32']);
expectTags('steel', 'DN 90', ['dn90'], { noConversion: true }); // D5: tabloda yok
expectTags('steel', 'DN 250', ['dn250'], { noConversion: false }); // tablo genisletildi
expectTags('steel', '10"', ['dn250']);

// ── PPR/HDPE cevrim (T6/T7/T13) ────────────────────────────
expectTags('plastic', 'PPR BORULAR DN 32', ['od-32', 'dn32'], { ambiguous: false }); // T6: 32mm (celik dn32 = 1 1/4 DEGIL)
expectTags('plastic', '1"', ['od-32', 'dn32']); // T7: 1" → 32 mm
expectTags('plastic', 'DN 110', ['od-110', 'dn110', 'dn100']); // T13: kutuphane "110mm" → dn100 tag'lenir
expectTags('plastic', '2"', ['od-63', 'dn63']); // PPR 2" = 63 mm
expectTags('plastic', '63 mm', ['od-63', 'dn63']);
expectTags('plastic', 'DN 63', ['od-63', 'dn63']);

// ── P4: sinif belirsiz — iki yorum birlikte ────────────────
expectTags('unknown', 'DN 32', ['dn32', 'od-32'], { ambiguous: true }); // T8: celik 1 1/4" VE PPR 32mm
expectTags('unknown', '1"', ['dn25', 'od-32'], { ambiguous: true }); // celik DN25 VE PPR 32mm
expectTags('unknown', '32 mm', ['od-32', 'dn32'], { ambiguous: false }); // mm = mm, belirsizlik yok

// ── Rozet metinleri (U2) ───────────────────────────────────
{
  const eq = sizeEquivalents('steel', extractSizeInfo('DN 25')!);
  check('rozet celik DN 25', eq.rozet === 'DN 25 → 1" (çelik)', `got "${eq.rozet}"`);
  const eq2 = sizeEquivalents('plastic', extractSizeInfo('1"')!);
  check('rozet PPR 1"', eq2.rozet === '1" → 32 mm (PPR)', `got "${eq2.rozet}"`);
}

// ── isSizeTag ──────────────────────────────────────────────
check('isSizeTag dn25', isSizeTag('dn25'));
check('isSizeTag od-63', isSizeTag('od-63'));
check('isSizeTag celik=false', !isSizeTag('celik'));

console.log(`\n${'='.repeat(60)}`);
console.log(`SONUC: ${passed} PASS, ${failed} FAIL`);
console.log('='.repeat(60));
if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach((f) => console.log('  - ' + f));
}
process.exit(failed > 0 ? 1 : 0);
