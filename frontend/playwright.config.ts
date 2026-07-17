import { defineConfig } from '@playwright/test';

/**
 * K9 + K15-K19 e2e — /dev/grid-test mock harness'i uzerinden AUTH'SUZ kosar.
 * Kosum: npm run test:e2e  (dev sunucuyu 3010'da kendisi kaldirir)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3010',
  },
  webServer: {
    command: 'npm run dev -- -p 3010',
    url: 'http://localhost:3010/dev/grid-test',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
