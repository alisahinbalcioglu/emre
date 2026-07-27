/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  },
  // Cloudflare Pages icin: build sirasinda dev'in dahil etmesini onle
  // (cf adapter zaten Edge runtime'a cevirir).
  experimental: {
    serverComponentsExternalPackages: ['xlsx'],
  },
  // ARINMA Faz 2D: production build'te debug console.log'lar SOKULUR
  // ([BrandDropdown]/[Save]/[SemanticCache] — veri sizintisi + gurultu
  // hijyeni). error/warn KALIR (kullanici hata bildirimi icin). Dev'de
  // loglar aynen durur — teshis akisi degismez.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
};

// Cloudflare Pages dev mode: wrangler ile lokal preview yaparken
// .dev.vars veya env binding'leri yuklemek icin setupDevPlatform cagrilir.
if (process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  try {
    const { setupDevPlatform } = require('@cloudflare/next-on-pages/next-dev');
    setupDevPlatform().catch(() => {});
  } catch {
    // Cloudflare adapter yuklenmemisse local Next.js dev'i etkilemez
  }
}

module.exports = nextConfig;
