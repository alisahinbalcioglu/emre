/**
 * Matching Regression Test Suite
 *
 * Bilinen Excel ornekleri ile matching dogrulugunu test eder.
 * Backend her degisiklikten sonra calistirilmali:
 *   npx ts-node test/matching-regression.ts
 *
 * Yeni test eklemek icin TEST_CASES dizisine eklemen yeter.
 */

import { PrismaClient } from '@prisma/client';
import { MatchingService } from '../src/modules/matching/matching.service';
import { generateTags } from '../src/modules/matching/tag-generator';
import { extractDiameter } from '../src/modules/matching/normalizer';

interface TestCase {
  name: string;
  input: string;
  brandId: string;
  expectedNetPrice?: number; // tek eslesme bekleniyorsa
  expectedConfidence?: 'high' | 'multi' | 'none';
  expectedMatchedNameContains?: string; // matched name icinde bu string olmali
  expectedTagContains?: string[]; // generateTags ciktisi bu tag'lari icermeli
}

const CAYIROVA_ID = '3ba57a23-461c-4d46-9f24-461b68e50d03';

// ────────────────────────────────────────────
// TEST CASES — Yeni durumlari buraya ekle
// ────────────────────────────────────────────
const TEST_CASES: TestCase[] = [
  // Yangin Tesisati — Siyah Celik Boru (her cap icin dogru fiyat)
  {
    name: 'SIYAH CELIK BORU 1" → dn25 → 105.86',
    input: 'YANGIN TESISATI SIYAH CELIK BORU - 1"',
    brandId: CAYIROVA_ID,
    expectedNetPrice: 105.86,
    expectedConfidence: 'high',
    expectedMatchedNameContains: 'DN25',
    expectedTagContains: ['dn25', 'siyah', 'boru', 'celik'],
  },
  {
    name: 'SIYAH CELIK BORU 1 1/4" → dn32 → 137.65',
    input: 'YANGIN TESISATI SIYAH CELIK BORU - 1 1/4"',
    brandId: CAYIROVA_ID,
    expectedNetPrice: 137.65,
    expectedMatchedNameContains: 'DN32',
    expectedTagContains: ['dn32'],
  },
  {
    name: 'SIYAH CELIK BORU 1 1/2" → dn40 → 158.22',
    input: 'YANGIN TESISATI SIYAH CELIK BORU - 1 1/2"',
    brandId: CAYIROVA_ID,
    expectedNetPrice: 158.22,
    expectedMatchedNameContains: 'DN40',
    expectedTagContains: ['dn40'],
  },
  {
    name: 'SIYAH CELIK BORU 2" → dn50 → 227.09',
    input: 'YANGIN TESISATI SIYAH CELIK BORU - 2"',
    brandId: CAYIROVA_ID,
    expectedNetPrice: 227.09,
    expectedMatchedNameContains: 'DN50',
    expectedTagContains: ['dn50'],
  },
  {
    name: 'SIYAH CELIK BORU 2 1/2" → dn65 → 288.25',
    input: 'YANGIN TESISATI SIYAH CELIK BORU - 2 1/2"',
    brandId: CAYIROVA_ID,
    expectedNetPrice: 288.25,
    expectedMatchedNameContains: 'DN65',
    expectedTagContains: ['dn65'],
  },
  {
    name: 'SIYAH CELIK BORU 3" → dn80 → 396.74',
    input: 'YANGIN TESISATI SIYAH CELIK BORU - 3"',
    brandId: CAYIROVA_ID,
    expectedNetPrice: 396.74,
    expectedMatchedNameContains: 'DN80',
  },
  {
    name: 'SIYAH CELIK BORU 4" → dn100 → 558.20',
    input: 'YANGIN TESISATI SIYAH CELIK BORU - 4"',
    brandId: CAYIROVA_ID,
    expectedNetPrice: 558.20,
    expectedMatchedNameContains: 'DN100',
  },

  // Galvaniz Boru
  {
    name: 'GALVANIZ BORU 2" → dn50 → 291.12',
    input: 'YANGIN TESISATI GALVANIZ BORU - 2"',
    brandId: CAYIROVA_ID,
    expectedNetPrice: 291.12,
    expectedMatchedNameContains: 'DN50',
    expectedTagContains: ['dn50', 'galvaniz', 'boru'],
  },
  {
    name: 'GALVANIZ BORU 2 1/2" → dn65 → 372.75',
    input: 'YANGIN TESISATI GALVANIZ BORU - 2 1/2"',
    brandId: CAYIROVA_ID,
    expectedNetPrice: 372.75,
    expectedMatchedNameContains: 'DN65',
    expectedTagContains: ['dn65', 'galvaniz'],
  },

  // Multi-cap senaryosu — yanlis parent felaketinin tekrar olmamasi icin
  {
    name: 'MULTI-CAP: ITFAIYE (2 1/2") + SIYAH BORU (1 1/4") → en sondaki cap dn32 alinmali',
    input: 'ITFAIYE BAGLANTI AGZI - 4"x2 1/2"x2 1/2" SIYAH CELIK BORU - 1 1/4"',
    brandId: CAYIROVA_ID,
    expectedTagContains: ['dn32'], // SON cap olmali
  },
];

// ────────────────────────────────────────────
// Runner
// ────────────────────────────────────────────
async function runTests() {
  const prisma = new PrismaClient();
  // PrismaService extends PrismaClient — cast guvenli (sadece test icin)
  const service = new MatchingService(prisma as any);
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Matching Regression Test Suite — ${TEST_CASES.length} test`);
  console.log('='.repeat(70));

  for (const tc of TEST_CASES) {
    process.stdout.write(`\n${tc.name}\n  `);
    try {
      // 1. Tag check
      if (tc.expectedTagContains) {
        const tags = generateTags(tc.input);
        const missing = tc.expectedTagContains.filter((t) => !tags.tags.includes(t));
        if (missing.length > 0) {
          failed++;
          const msg = `FAIL: missing tags [${missing.join(',')}], got [${tags.tags.join(',')}]`;
          console.log(msg);
          failures.push(`${tc.name}: ${msg}`);
          continue;
        }
      }

      // 2. Match check
      if (tc.expectedNetPrice !== undefined || tc.expectedConfidence !== undefined) {
        const result = await service.bulkMatch('test-user', tc.brandId, [tc.input]);
        const match = result[tc.input];

        if (!match) {
          failed++;
          const msg = `FAIL: no match returned`;
          console.log(msg);
          failures.push(`${tc.name}: ${msg}`);
          continue;
        }

        if (tc.expectedConfidence && match.confidence !== tc.expectedConfidence) {
          failed++;
          const msg = `FAIL: confidence ${match.confidence} != ${tc.expectedConfidence}`;
          console.log(msg);
          failures.push(`${tc.name}: ${msg}`);
          continue;
        }

        if (tc.expectedNetPrice !== undefined) {
          if (Math.abs(match.netPrice - tc.expectedNetPrice) > 0.01) {
            failed++;
            const msg = `FAIL: netPrice ${match.netPrice} != ${tc.expectedNetPrice}`;
            console.log(msg);
            failures.push(`${tc.name}: ${msg}`);
            continue;
          }
        }

        if (tc.expectedMatchedNameContains && !match.matchedName?.includes(tc.expectedMatchedNameContains)) {
          failed++;
          const msg = `FAIL: matchedName "${match.matchedName}" should contain "${tc.expectedMatchedNameContains}"`;
          console.log(msg);
          failures.push(`${tc.name}: ${msg}`);
          continue;
        }
      }

      console.log('PASS');
      passed++;
    } catch (e) {
      failed++;
      const msg = `ERROR: ${(e as Error).message}`;
      console.log(msg);
      failures.push(`${tc.name}: ${msg}`);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`SONUC: ${passed}/${TEST_CASES.length} PASS, ${failed} FAIL`);
  console.log('='.repeat(70));

  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
  }

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((e) => {
  console.error('Test runner error:', e);
  process.exit(1);
});
