import {
  Controller, Post, Get, Param, UploadedFile,
  UseGuards, UseInterceptors, Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../altyapi/auth/guards/jwt-auth.guard';
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
   * Layer listesi cikar (hizli, uzunluk hesaplamaz).
   * file_id doner — bu ID ile /parse cagirilabilir.
   *
   * Dosya boyut limiti 200MB (buyuk mimari projeler icin). DWG->DXF
   * donustume (ODA converter) bazen uzun surer, timeout 180 saniyeye
   * kadar tolerans verilir.
   */
  @Post('layers')
  @GerekliYetenek(Yetenek.DWG_YUKLE)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  }))
  async listLayers(
    @CurrentUser() kullanici: unknown,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const { firmaId, userId } = kimlikCoz(kullanici);
    if (!file) {
      return { error: 'Dosya yuklenemedi' };
    }
    const yanit = await this.dwgEngine.listLayers(file.buffer, file.originalname);
    // G2: uretilen file_id FIRMAYA baglanir — tuketici uclarin kapisi budur.
    await this.sahiplik.kaydet(yanit, firmaId, userId, file.originalname);
    return yanit;
  }

  /**
   * DWG/DXF parse edip layer bazinda metraj cikarir.
   *
   * file_id varsa: cache'teki dosya kullanilir (dosya yuklemeye gerek yok).
   * file_id yoksa: dosya yuklenmeli (geriye uyumlu).
   */
  @Post('parse')
  @GerekliYetenek(Yetenek.DWG_YUKLE)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  }))
  async parseDwg(
    @CurrentUser() kullanici: unknown,
    @UploadedFile() file: Express.Multer.File,
    @Query('discipline') discipline?: string,
    @Query('scale') scale?: string,
    @Query('split_mode') splitMode?: string,
    @Query('file_id') fileId?: string,
    @Query('selected_layers') selectedLayers?: string,
    @Query('layer_hat_tipi') layerHatTipi?: string,
    @Query('layer_material_type') layerMaterialType?: string,
    @Query('sprinkler_layers') sprinklerLayers?: string,
  ) {
    // file_id varsa dosya gerekmez, yoksa dosya zorunlu
    // G2: cache'ten okuyorsa (fileId var) sahiplik DOGRULANIR; dosya
    // govdeden geliyorsa kapi konusu degildir (kendi dosyasini yukluyor).
    await this.sahiplik.dogrula(fileId, kimlikCoz(kullanici).firmaId);
    if (!fileId && !file) {
      return { error: 'file_id veya dosya yuklenmeli' };
    }

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
      file?.buffer ?? null,
      file?.originalname ?? '',
      discipline || 'mechanical',
      // AUTO-MODE: scale gonderilmezse resolveScaleParam undefined doner ve
      // parametre Python'a HIC gitmez -> motor cizim birimini KENDI okur
      // (python/unit_detect.py: antet pafta olcusu + "ÖLÇEK 1/N" kesisimi).
      // 0.001'e zorlamak bu dali OLU KODA cevirir — daha once oyleydi.
      resolveScaleParam(scale),
      fileId,
      parsedLayers,
      parsedHatTipi,
      parsedMaterialType,
      parsedSprinklerLayers,
      // Bolme modu: 't' (varsayilan, T noktalarinda bol) | 'none' (bolme yok —
      // her cizim entity'si bastan sona tek segment; kullanici hatta tek tikla
      // cap atayabilsin). Dogrulama Python'da (gecersiz deger 400).
      splitMode,
    );
  }

  @Post('convert')
  @GerekliYetenek(Yetenek.DWG_YUKLE)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  }))
  async convertToDxf(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { error: 'Dosya yuklenemedi' };
    return this.dwgEngine.convertToDxf(file.buffer, file.originalname);
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
