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

// ── AUTO DALI ────────────────────────────────────────────────────
// Eskiden bu uc vaka 0.001 (mm) donuyordu ve Python'un otomatik birim
// tespitini BYPASS ediyordu (auto-detect dali hic calismiyordu).
check('undefined -> undefined (Python OTOMATIK tespit etsin)', () => {
  assert.strictEqual(resolveScaleParam(undefined), undefined);
});

check('bos string -> undefined (otomatik)', () => {
  assert.strictEqual(resolveScaleParam(''), undefined);
});

check('whitespace -> undefined (otomatik)', () => {
  assert.strictEqual(resolveScaleParam('   '), undefined);
});

check('gecersiz "abc" -> undefined (tahmin etmektense cizime sor)', () => {
  assert.strictEqual(resolveScaleParam('abc'), undefined);
});

check('negatif/sifir "0" -> undefined (otomatik)', () => {
  assert.strictEqual(resolveScaleParam('0'), undefined);
});

// ── KULLANICI OVERRIDE DALI (degismedi) ──────────────────────────
check('kullanici mm "0.001" -> 0.001', () => {
  assert.strictEqual(resolveScaleParam('0.001'), 0.001);
});

check('kullanici cm "0.01" -> 0.01', () => {
  assert.strictEqual(resolveScaleParam('0.01'), 0.01);
});

check('kullanici dm "0.1" -> 0.1 (gercek projenin birimi)', () => {
  assert.strictEqual(resolveScaleParam('0.1'), 0.1);
});

check('kullanici m "1" -> 1', () => {
  assert.strictEqual(resolveScaleParam('1'), 1);
});

console.log(`\n${passed}/9 PASS`);
