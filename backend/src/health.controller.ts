import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    // Deploy verification: Render her container start'inda RENDER_GIT_COMMIT
    // env'i set ediyor. Bu sayede /health response'undan NestJS API'nin
    // gercekten son commit'i deploy edip etmedigi anlasilir.
    const buildSha = (
      process.env.RENDER_GIT_COMMIT ||
      process.env.K_REVISION ||
      process.env.BUILD_SHA ||
      'local'
    ).slice(0, 16);
    return {
      status: 'ok',
      service: 'metaprice-api',
      timestamp: new Date().toISOString(),
      build_sha: buildSha,
      // Yeni proximity feature deploy edildi mi tespit etmek icin sentinel:
      proximity_support: true,
    };
  }
}
