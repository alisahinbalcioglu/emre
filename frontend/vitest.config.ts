import { defineConfig } from 'vitest/config';

// e2e/ ve e2e-golden/ Playwright'a aittir (npx playwright test) — vitest
// toplarsa "test() did not expect to be called here" ile suite FAIL gorunur.
export default defineConfig({
  // Faz 6.1 kapanış (15.09): bileşen testleri (ör. TelefonMenusu) react-dom/server
  // ile GERÇEKTEN çizilir. tsconfig `jsx: preserve` Next.js derleyicisi içindir;
  // Vite onu okuyup JSX'i dönüştürmeden bırakır ve içe aktarma "invalid JS
  // syntax" ile düşer. Test dönüşümüne otomatik runtime açıkça verilir.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    exclude: ['**/node_modules/**', '**/e2e/**', '**/e2e-golden/**', '**/.next/**'],
  },
});
