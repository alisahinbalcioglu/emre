import {
  BadRequestException, Controller, Post, Get, Param, UploadedFile,
  UseGuards, UseInterceptors, Query, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../altyapi/auth/guards/jwt-auth.guard';
import { istemciKopmaSinyali } from '../../altyapi/http/istemci-koptu';
import { DwgEngineService } from './dwg-engine.service';
import { resolveScaleParam } from './scale-param';
import { CurrentUser } from '../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../altyapi/auth/kimlik';
import { DwgSahiplikServisi } from './dwg-sahiplik.servisi';
import { ErisimGuard, GerekliYetenek } from '../../ozellik/odeme/abonelik/erisim.guard';
import { Yetenek } from '../../ozellik/odeme/abonelik/erisim.servisi';

@Controller('dwg-engine')
@UseGuards(JwtAuthGuard, ErisimGuard)
export class DwgEngineController {
  constructor(
    private readonly dwgEngine: DwgEngineService,
    private readonly sahiplik: DwgSahiplikServisi,
  ) {}

  /**
   * `/upload` ile yuklenmis dosyanin (file_id) secilen layer'larinin metrajini cikarir.
   *
   * YALNIZ file_id (26.09): dosya govdeli "geriye uyumlu" yol KALDIRILDI —
   * eski `layers` ve `convert` uclariyla birlikte. Motor o yollarda DWG→DXF
   * donusumunu olay dongusunde yapiyordu: tek istek tek isciyi (WORKERS=1)
   * 120 sn'ye kadar dondurup TUM kiracilari bekletebiliyordu. Canlida kullanimi
   * sifir olculdu (on yuz 21.05'ten beri yalniz /upload + file_id). Dosya alici
   * (multer, istek basina 1 GB'a kadar bellekte) da gitti: govde OKUNMAZ.
   *
   * ISTEMCI KOPARSA (26.09): on yuz birim degisince ayirmayi iptal edip yeni
   * birimle yeniden baslatir. Motor istegi de kesilir — kesilmezse motor eski
   * birimli isi sonuna kadar kosturup yeni istekle CPU paylasiyordu.
   * Sinyal ILK satirda kurulur: sahiplik sorgusu surerken kopan istemci de
   * motora hic istek gondermez.
   */
  @Post('parse')
  @GerekliYetenek(Yetenek.DWG_YUKLE)
  async parseDwg(
    @CurrentUser() kullanici: unknown,
    @Res({ passthrough: true }) res: Response,
    @Query('discipline') discipline?: string,
    @Query('scale') scale?: string,
    @Query('split_mode') splitMode?: string,
    @Query('file_id') fileId?: string,
    @Query('selected_layers') selectedLayers?: string,
    @Query('layer_hat_tipi') layerHatTipi?: string,
    @Query('layer_material_type') layerMaterialType?: string,
    @Query('sprinkler_layers') sprinklerLayers?: string,
  ) {
    const istemciKoptu = istemciKopmaSinyali(res);
    // Govde islenmez ama AKITILIR: okunmayan govde yuksek su isaretini (16 KiB)
    // asinca Node soketi okumayi birakir ve istemcinin kopusunu GORMEZ — iptal
    // zinciri yalniz kucuk govdede calisirdi (olculdu 26.09, kapi B). Veri atilir.
    res.req.resume();
    if (!fileId) {
      throw new BadRequestException('file_id gerekli (dosya once /dwg-engine/upload ile yuklenir)');
    }
    // G2: cache'teki dosyanin sahipligi DOGRULANIR (baska firmanin dosyasi 403).
    await this.sahiplik.dogrula(fileId, kimlikCoz(kullanici).firmaId);

    // selected_layers JSON array parse
    let parsedLayers: string[] | undefined;
    if (selectedLayers) {
      try {
        parsedLayers = JSON.parse(selectedLayers);
      } catch {
        return { error: 'selected_layers gecersiz JSON formati' };
      }
    }

    // layer_hat_tipi JSON object parse
    let parsedHatTipi: Record<string, string> | undefined;
    if (layerHatTipi) {
      try {
        parsedHatTipi = JSON.parse(layerHatTipi);
      } catch {
        return { error: 'layer_hat_tipi gecersiz JSON formati' };
      }
    }

    // layer_material_type JSON object parse
    let parsedMaterialType: Record<string, string> | undefined;
    if (layerMaterialType) {
      try {
        parsedMaterialType = JSON.parse(layerMaterialType);
      } catch {
        return { error: 'layer_material_type gecersiz JSON formati' };
      }
    }

    // sprinkler_layers JSON array parse — kullanicinin manuel isaretledigi sprinkler layer'lar
    let parsedSprinklerLayers: string[] | undefined;
    if (sprinklerLayers) {
      try {
        parsedSprinklerLayers = JSON.parse(sprinklerLayers);
      } catch {
        return { error: 'sprinkler_layers gecersiz JSON formati' };
      }
    }

    // NOT: layer_default_diameter + use_proximity_diameter parametreleri
    // KALDIRILDI — otomatik cap atama motoru sokuldu (operasyon Faz 2).
    // Cap atamasi frontend dwg-tagging modulunde manuel yapilir.

    return this.dwgEngine.parseDwg(
      fileId,
      discipline || 'mechanical',
      // AUTO-MODE: scale gonderilmezse resolveScaleParam undefined doner ve
      // parametre Python'a HIC gitmez -> motor cizim birimini KENDI okur
      // (python/unit_detect.py: antet pafta olcusu + "ÖLÇEK 1/N" kesisimi).
      // 0.001'e zorlamak bu dali OLU KODA cevirir — daha once oyleydi.
      resolveScaleParam(scale),
      parsedLayers,
      parsedHatTipi,
      parsedMaterialType,
      parsedSprinklerLayers,
      // Bolme modu: 't' (varsayilan, T noktalarinda bol) | 'none' (bolme yok —
      // her cizim entity'si bastan sona tek segment; kullanici hatta tek tikla
      // cap atayabilsin). Dogrulama Python'da (gecersiz deger 400).
      splitMode,
      istemciKoptu,
    );
  }

  @Get('health')
  async health() {
    const ok = await this.dwgEngine.healthCheck();
    return { status: ok ? 'ok' : 'unavailable', service: 'dwg-engine' };
  }

  /**
   * F5C — Async upload (OCERP pattern). 2sn'de file_id doner, parse arka
   * planda. Frontend /status/:fileId ile durumu sorar, "ready" olunca
   * /geometry/:fileId cache hit (50ms).
   */
  @Post('upload')
  @GerekliYetenek(Yetenek.DWG_YUKLE)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 1024 },
  }))
  async uploadAsync(
    @CurrentUser() kullanici: unknown,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) return { error: 'Dosya yuklenemedi' };
    const { firmaId, userId } = kimlikCoz(kullanici);
    const yanit = await this.dwgEngine.uploadAsync(file.buffer, file.originalname);
    await this.sahiplik.kaydet(yanit, firmaId, userId, file.originalname);
    return yanit;
  }

  /**
   * F5C — Background parse durumu sorgula.
   * Frontend setInterval ile poll eder, "ready" olunca devam.
   */
  @Get('status/:fileId')
  @GerekliYetenek(Yetenek.DWG_YUKLE)
  async getUploadStatus(
    @CurrentUser() kullanici: unknown,
    @Param('fileId') fileId: string,
  ) {
    await this.sahiplik.dogrula(fileId, kimlikCoz(kullanici).firmaId);
    return this.dwgEngine.getUploadStatus(fileId);
  }

  /**
   * Cache'teki DXF'ten koordinatlari dondur — SVG viewer (dwg-viewer) icin.
   */
  @Get('geometry/:fileId')
  @GerekliYetenek(Yetenek.DWG_YUKLE)
  async getGeometry(
    @CurrentUser() kullanici: unknown,
    @Param('fileId') fileId: string,
    @Query('layers') layers?: string,
  ) {
    // G2: cizim GEOMETRISI projenin ta kendisidir — capraz-tenant okuma burada durur.
    await this.sahiplik.dogrula(fileId, kimlikCoz(kullanici).firmaId);
    return this.dwgEngine.getGeometry(fileId, layers ?? '');
  }
}
