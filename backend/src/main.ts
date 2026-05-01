import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // GZIP — DWG geometry response 5-10 MB JSON. Sikistirma ile ~85-90% kucuk
  // network transfer. Bu NestJS proxy katmaninda; Python tarafi da ayrica
  // GZipMiddleware ekledigi icin Python→NestJS hop'unda da sikistirilmis.
  app.use(compression());

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

  // CORS origin'leri: env'den gelenler + localhost'lar HER ZAMAN.
  // Localhost'lar dışarıdan exploit edilemez (loopback), bu yüzden
  // prod'da bile dahil etmek geliştirici makinesinden direkt prod
  // backend'e konuşma kolayligi saglar — Render'a dokunmaya gerek yok.
  const envOrigins = process.env.CORS_ORIGINS
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
  const localOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
  ];
  const corsOrigins = Array.from(new Set([...envOrigins, ...localOrigins]));

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`MetaPrice API running on http://localhost:${port}/api`);
}
bootstrap();
