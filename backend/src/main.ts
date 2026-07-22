import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Buyuk DWG/DXF dosyalari + multi-sheet Excel payload icin body limit yukselt.
  // Multer FileInterceptor zaten kendi fileSize limitini kullanir (1GB controller'da),
  // bu buraya JSON/urlencoded icin global guvenlik ucu.
  app.use(json({ limit: '500mb' }));
  app.use(urlencoded({ extended: true, limit: '500mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // CORS origin'leri: env'den gelenler + localhost'lar + bilinen prod'lar.
  // - Localhost'lar dışarıdan exploit edilemez (loopback), prod'da bile dahil.
  // - Cloudflare Pages preview URL'leri (*.metaprice.pages.dev) regex ile dahil.
  // - Vercel preview URL'leri (*.vercel.app) backward-compat icin dahil.
  const envOrigins = process.env.CORS_ORIGINS
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
  const staticOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3005', // worktree onizleme (dev)
    'http://localhost:3010', // Playwright e2e dev sunucusu
    'https://metaprice.pages.dev',         // Cloudflare Pages production
    'https://metaprice.vercel.app',        // Vercel backward-compat
  ];
  const allowedOrigins = Array.from(new Set([...envOrigins, ...staticOrigins]));
  // Regex pattern'ler: preview/deploy-specific URL'ler
  const allowedPatterns: RegExp[] = [
    /^https:\/\/[a-z0-9-]+\.metaprice\.pages\.dev$/,  // CF Pages unique deploys
    /^https:\/\/metaprice-[a-z0-9-]+\.vercel\.app$/,  // Vercel preview deploys
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin (browser address bar veya server-to-server) — origin undefined
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (allowedPatterns.some((re) => re.test(origin))) return callback(null, true);
      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`MetaPrice API running on http://localhost:${port}/api`);
}
bootstrap();
