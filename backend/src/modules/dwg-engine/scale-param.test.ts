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

check('TAHMIN YOK: undefined -> mm default (0.001)', () => {
  assert.strictEqual(resolveScaleParam(undefined), 0.001);
});

check('bos string -> mm default', () => {
  assert.strictEqual(resolveScaleParam(''), 0.001);
});

check('whitespace -> mm default', () => {
  assert.strictEqual(resolveScaleParam('   '), 0.001);
});

check('kullanici mm "0.001" -> 0.001', () => {
  assert.strictEqual(resolveScaleParam('0.001'), 0.001);
});

check('kullanici cm "0.01" -> 0.01', () => {
  assert.strictEqual(resolveScaleParam('0.01'), 0.01);
});

check('kullanici m "1" -> 1', () => {
  assert.strictEqual(resolveScaleParam('1'), 1);
});

check('gecersiz "abc" -> mm default', () => {
  assert.strictEqual(resolveScaleParam('abc'), 0.001);
});

check('negatif/sifir "0" -> mm default', () => {
  assert.strictEqual(resolveScaleParam('0'), 0.001);
});

console.log(`\n${passed}/8 PASS`);
