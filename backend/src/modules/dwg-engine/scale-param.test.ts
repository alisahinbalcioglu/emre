/**
 * resolveScaleParam izole test — ts-node ile calistirilir:
 *   npx ts-node src/modules/dwg-engine/scale-param.test.ts
 * Backend'de jest/vitest yok; node assert ile self-contained.
 */
import * as assert from 'node:assert';
import { resolveScaleParam } from './scale-param';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  PASS: ${name}`);
}

console.log('resolveScaleParam:');

check('BUG-2 repro: undefined (Auto) -> undefined (auto-detect tetiklenir, 0.001 ZORLAMA yok)', () => {
  assert.strictEqual(resolveScaleParam(undefined), undefined);
});

check('bos string -> undefined (Auto)', () => {
  assert.strictEqual(resolveScaleParam(''), undefined);
});

check('whitespace -> undefined (Auto)', () => {
  assert.strictEqual(resolveScaleParam('   '), undefined);
});

check('manuel mm "0.001" -> 0.001', () => {
  assert.strictEqual(resolveScaleParam('0.001'), 0.001);
});

check('manuel cm "0.01" -> 0.01', () => {
  assert.strictEqual(resolveScaleParam('0.01'), 0.01);
});

check('manuel m "1" -> 1', () => {
  assert.strictEqual(resolveScaleParam('1'), 1);
});

check('gecersiz "abc" -> undefined (mm zorlamak yerine auto-detect)', () => {
  assert.strictEqual(resolveScaleParam('abc'), undefined);
});

check('negatif/sifir "0" -> undefined (auto-detect)', () => {
  assert.strictEqual(resolveScaleParam('0'), undefined);
});

console.log(`\n${passed}/8 PASS`);
