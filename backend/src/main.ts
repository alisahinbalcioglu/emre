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

  // CORS origin'leri CORS_ORIGINS env'inden virgullu okunur.
  // Production'da Netlify URL'i buraya eklenir: "https://app.netlify.app,https://metaprice.com"
  // Locale varsayilan: localhost:3000/3002/3003 (geri uyumluluk).
  const corsOrigins = (process.env.CORS_ORIGINS
    ?? 'http://localhost:3000,http://localhost:3002,http://localhost:3003')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

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
