import { defineConfig } from 'vitest/config';

// e2e/ ve e2e-golden/ Playwright'a aittir (npx playwright test) — vitest
// toplarsa "test() did not expect to be called here" ile suite FAIL gorunur.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/e2e/**', '**/e2e-golden/**', '**/.next/**'],
  },
});
