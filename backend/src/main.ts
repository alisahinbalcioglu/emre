import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { guvenlikBasliklariniKur } from './altyapi/http/guvenlik-basliklari';
import { govdeSinirlariniKur } from './altyapi/http/govde-siniri';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Caddy ters vekilinin arkasindayiz: backend disariya acik degil (compose'da
  // expose), tek giris caddy. Bu satir olmadan Express her istegi caddy
  // konteynerinin IP'sinden geliyor sanar ve IP'ye dayanan HER kapi tek kovaya
  // duser — asagidaki hiz siniri tum kullanicilari ortak kotaya sokardi.
  // Deger 1 = yalniz EN SON proxy guvenilir; `true` olsaydi istemcinin
  // uydurdugu X-Forwarded-For zinciri de yutulur ve sinir asilabilirdi.
  app.set('trust proxy', 1);

  // Kenar katmani (Caddy) atlanirsa da guvenlik basliklari gelsin, `X-Powered-By`
  // gitmesin (B3 · plan 1.15). Route'lardan ONCE: hata yanitlari da tasir.
  guvenlikBasliklariniKur(app);

  // Govde limiti 500mb -> 50mb. Buyuk DWG/Excel DOSYALARI buradan gecmez;
  // onlar multer ile ayri akistan gelir ve kendi fileSize limitine tabidir.
  // Buradan gecen tek sey JSON/urlencoded govdesi.
  //
  // Neden 50 ve neden 10 DEGIL: olculdu — kaydedilen teklif govdesi kaynak
  // xlsx'in 4-5 katina cikiyor, ~50 bin kalemlik bir marka fiyat listesi ice
  // aktarmasi ~22 MB govde uretiyor. 10mb sinirinda bunlar 413 alir ve
  // kullanici tum grid emegini kaybeder. 50mb, olculen en kotu durumun iki
  // katindan fazlasi; 500mb ise tek istekle bellegi tuketmeye izin veriyordu.
  //
  // Faz 6.9: cevirinin duzeltme uclari 32 KB — yol basina sinir global
  // ayristiricilardan ONCE kurulmali, sonra kurulursa SESSIZCE etkisizdir.
  govdeSinirlariniKur(app);
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // CORS: uretimde YALNIZ CORS_ORIGINS'te yazili adresler.
  //
  // Onceki hal uretimde de sunlari kabul ediyordu ve `credentials: true` ile
  // birlikte bu gercek bir aciktir:
  //   · localhost:3000-3010 — saldirganin KENDI makinesindeki bir sayfa,
  //     kurbanin tarayicisinda calisirken cerezli istek atabilirdi.
  //   · /^https:\/\/metaprice-[a-z0-9-]+\.vercel\.app$/ ve
  //     /^https:\/\/[a-z0-9-]+\.metaprice\.pages\.dev$/ — bu adlari HERKES
  //     kaydedebilir. "metaprice-xyz.vercel.app" acan biri kimlik dogrulamali
  //     istek atabilirdi. Uygulama artik Hetzner'de; bu saglayicilar olu.
  const uretim = process.env.NODE_ENV === 'production';
  const envOrigins = process.env.CORS_ORIGINS
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
  const gelistirmeOrigins = uretim
    ? []
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3005', // worktree onizleme (dev)
        'http://localhost:3010', // Playwright e2e dev sunucusu
      ];
  const allowedOrigins = Array.from(new Set([...envOrigins, ...gelistirmeOrigins]));
  const allowedPatterns: RegExp[] = [];

  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin (browser address bar veya server-to-server) — origin undefined
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (allowedPatterns.some((re) => re.test(origin))) return callback(null, true);
      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    // KF6: indirme yanitindaki dosya adi + self-check uyarisi cross-origin'de
    // de okunabilsin (same-origin'de zaten serbest)
    exposedHeaders: ['Content-Disposition', 'X-Export-Warning', 'X-Export-Summary'],
  });

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`MetaPrice API running on http://localhost:${port}/api`);
}
bootstrap();
