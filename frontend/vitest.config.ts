import { defineConfig } from 'vitest/config';

// e2e/ Playwright'a aittir (npx playwright test) — vitest toplarsa
// "test.describe() not expected" hatasiyla suite FAIL gorunur.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.next/**'],
  },
});
