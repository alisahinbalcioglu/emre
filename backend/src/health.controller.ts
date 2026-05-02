import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'metaprice-api', timestamp: new Date().toISOString() };
  }

  /**
   * Wake endpoint — Render free tier servisleri uyandirmak icin.
   *
   * Frontend cold-start oncesinde bunu cagirir; NestJS hem kendi yanit verir
   * (NestJS uyanir) hem Python /health'e fire-and-forget fetch (Python uyanir).
   *
   * Auth-less (CORS browser'dan dogrudan erisim icin sorun cikarmaz, NestJS
   * CORS config zaten frontend origin'i destekler). Server-to-server Python
   * fetch'inde CORS yok.
   */
  @Get('wake')
  async wake() {
    const urlEnv = process.env.DWG_ENGINE_URL?.trim();
    const hostEnv = process.env.DWG_ENGINE_HOST?.trim();
    const cleanHost = hostEnv?.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const pythonHealth = urlEnv
      ? `${urlEnv.replace(/\/+$/, '')}/health`
      : cleanHost
        ? `https://${cleanHost}/health`
        : 'http://localhost:8011/health';

    let pythonStatus: 'ok' | 'waking' | 'unreachable' = 'unreachable';
    try {
      // 60sn timeout — Python cold-start tolere edilir
      const r = await fetch(pythonHealth, {
        signal: AbortSignal.timeout(60_000),
      });
      pythonStatus = r.ok ? 'ok' : 'waking';
    } catch {
      // Cold-start hala devam ediyor olabilir — onemsiz, sadece status raporla
      pythonStatus = 'waking';
    }

    return {
      status: 'wake-triggered',
      services: {
        nestjs: 'ok',
        python: pythonStatus,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
