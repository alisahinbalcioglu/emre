import { defineConfig } from '@playwright/test';
// PK10: artefakt damgasi (pano kalem 44). Damga BURADA uretilir — config,
// worker'lardan ve global-setup'tan ONCE degerlendirilir; `damga()` onu
// `process.env.E2E_DAMGA`ya yazar ve worker'lar miras alir.
import { damga } from './e2e-golden/artefakt-dizini.cjs';

const DAMGA = damga();

/**
 * E2E ALTIN YOL (GOREV 28.07): 10 gercek dosya, tam yerel yigin uzerinden
 * yukle → fiyatla → kaydet → yeniden ac → 2 export → programatik dogrulama.
 *
 * On kosul (runner otomatik BASLATMAZ — mevcut yigina baglanir):
 *   - PostgreSQL 5432 + backend 3001 (node dist/main) + frontend 3005 (next start)
 *   - test-fixtures/e2e/ altinda 10 dosya
 * Kosum: npm run test:e2e-golden
 *
 * workers:1 — determinism (ayni kullanici hesabi, sirali kosum).
 */
export default defineConfig({
  testDir: './e2e-golden',
  // 45dk/dosya: en buyuk fixture 7 sayfa · 1694 satir (Bursa Demirtaş) ve
  // her aile icin gercek eslestirme istegi atilir — 15dk yetmedi.
  timeout: 2_700_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  globalSetup: './e2e-golden/global-setup.mjs',
  reporter: [['list'], ['json', { outputFile: `e2e-artifacts/golden/${DAMGA}/playwright-report.json` }]],
  use: {
    baseURL: 'http://localhost:3005',
    viewport: { width: 1600, height: 950 },
    actionTimeout: 30_000,
    screenshot: 'only-on-failure',
  },
});
