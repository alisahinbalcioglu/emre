import {
  Controller, Post, Get, Param, UploadedFile,
  UseGuards, UseInterceptors, Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DwgEngineService } from './dwg-engine.service';

@Controller('dwg-engine')
@UseGuards(JwtAuthGuard)
export class DwgEngineController {
  constructor(private readonly dwgEngine: DwgEngineService) {}

  /**
   * Layer listesi cikar (hizli, uzunluk hesaplamaz).
   * file_id doner — bu ID ile /parse cagirilabilir.
   *
   * Dosya boyut limiti 200MB (buyuk mimari projeler icin). DWG->DXF
   * donustume (ODA converter) bazen uzun surer, timeout 180 saniyeye
   * kadar tolerans verilir.
   */
  @Post('layers')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  }))
  async listLayers(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { error: 'Dosya yuklenemedi' };
    }
    return this.dwgEngine.listLayers(file.buffer, file.originalname);
  }

  /**
   * DWG/DXF parse edip layer bazinda metraj cikarir.
   *
   * file_id varsa: cache'teki dosya kullanilir (dosya yuklemeye gerek yok).
   * file_id yoksa: dosya yuklenmeli (geriye uyumlu).
   */
  @Post('parse')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  }))
  async parseDwg(
    @UploadedFile() file: Express.Multer.File,
    @Query('discipline') discipline?: string,
    @Query('scale') scale?: string,
    @Query('file_id') fileId?: string,
    @Query('selected_layers') selectedLayers?: string,
    @Query('layer_hat_tipi') layerHatTipi?: string,
    @Query('layer_material_type') layerMaterialType?: string,
    @Query('sprinkler_layers') sprinklerLayers?: string,
    @Query('use_ai_diameter') useAiDiameter?: string,
    @Query('layer_default_diameter') layerDefaultDiameter?: string,
  ) {
    // file_id varsa dosya gerekmez, yoksa dosya zorunlu
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

    // layer_default_diameter JSON object parse — AI'nin atayamadigi segment'ler icin layer-level default cap
    let parsedDefaultDiameter: Record<string, string> | undefined;
    if (layerDefaultDiameter) {
      try {
        parsedDefaultDiameter = JSON.parse(layerDefaultDiameter);
      } catch {
        return { error: 'layer_default_diameter gecersiz JSON formati' };
      }
    }

    return this.dwgEngine.parseDwg(
      file?.buffer ?? null,
      file?.originalname ?? '',
      discipline || 'mechanical',
      parseFloat(scale || '0.001') || 0.001,
      fileId,
      parsedLayers,
      parsedHatTipi,
      parsedMaterialType,
      parsedSprinklerLayers,
      useAiDiameter === 'true',
      parsedDefaultDiameter,
    );
  }

  @Post('convert')
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
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 1024 },
  }))
  async uploadAsync(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { error: 'Dosya yuklenemedi' };
    return this.dwgEngine.uploadAsync(file.buffer, file.originalname);
  }

  /**
   * F5C — Background parse durumu sorgula.
   * Frontend setInterval ile poll eder, "ready" olunca devam.
   */
  @Get('status/:fileId')
  async getUploadStatus(@Param('fileId') fileId: string) {
    return this.dwgEngine.getUploadStatus(fileId);
  }

  /**
   * Cache'teki DXF'ten koordinatlari dondur — SVG viewer (dwg-viewer) icin.
   */
  @Get('geometry/:fileId')
  async getGeometry(
    @Param('fileId') fileId: string,
    @Query('layers') layers?: string,
  ) {
    return this.dwgEngine.getGeometry(fileId, layers ?? '');
  }
}
