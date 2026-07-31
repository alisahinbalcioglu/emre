import { Controller, Get } from '@nestjs/common';
import { BUILD_SHA, AGAC_KIRLI, DERLEME_ZAMANI } from './surum';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    // PK2 + PK11: `build_sha` CALISAN KODUN surumudur.
    //
    // ⚠ BURADA `git rev-parse` CALISTIRMAK YASAK. Istek aninda hesaplanan bir
    // sha, calisan surec eski koddan olsa bile AGACIN sha'sini doner; surum
    // kapisi her zaman gecer ve hicbir ise yaramaz. 31.07'de tam bu yuzden
    // 18 saatlik bir backend sessizce olculdu (pano kalem 45).
    // Deger `surum.generated.ts` uzerinden DERLEME aninda gomulur.
    const buildSha = (
      process.env.RENDER_GIT_COMMIT ||
      process.env.K_REVISION ||
      BUILD_SHA
    ).slice(0, 16);
    return {
      status: 'ok',
      service: 'metaprice-api',
      timestamp: new Date().toISOString(),
      build_sha: buildSha,
      // PK11d: derleme anindaki agac kirli miydi (damgali dizin -KIRLI alir)
      tree_dirty: AGAC_KIRLI,
      build_time: DERLEME_ZAMANI,
      // Yeni proximity feature deploy edildi mi tespit etmek icin sentinel:
      proximity_support: true,
    };
  }
}
