import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class DwgEngineService {
  private readonly pythonServiceUrl: string;

  constructor() {
    this.pythonServiceUrl = process.env.DWG_ENGINE_URL || 'http://localhost:8011';
  }

  /**
   * Layer listesi cikar (hizli, uzunluk hesaplamaz).
   * Dosya Python tarafinda cache'lenir, file_id doner.
   */
  async listLayers(fileBuffer: Buffer, fileName: string) {
    const formData = new FormData();
    const blob = new Blob([fileBuffer as any]);
    formData.append('file', blob, fileName);

    // Buyuk DWG'ler icin 5 dakika (ODA converter + ezdxf parse uzun surebilir)
    try {
      const response = await fetch(
        `${this.pythonServiceUrl}/layers`,
        { method: 'POST', body: formData, signal: AbortSignal.timeout(300_000) },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(
          `Layer listesi hatasi: ${error}`,
          response.status >= 500 ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const msg = (error as any)?.name === 'TimeoutError'
        ? 'DWG cok buyuk veya karmasik — 5 dakikada cevap alinamadi. Daha kucuk bir bolumunu deneyin.'
        : 'DWG Engine servisi baglanti hatasi. Servis calismiyor olabilir.';
      throw new HttpException(msg, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * DWG/DXF parse edip layer bazinda metraj cikarir.
   *
   * fileId varsa: Python'daki cache'ten dosya kullanilir (fileBuffer gerekmez).
   * fileId yoksa: fileBuffer yuklenir (geriye uyumlu mod).
   */
  async parseDwg(
    fileBuffer: Buffer | null,
    fileName: string,
    discipline: string = 'mechanical',
    scale: number = 0.001,
    fileId?: string,
    selectedLayers?: string[],
    layerHatTipi?: Record<string, string>,
    layerMaterialType?: Record<string, string>,
    sprinklerLayers?: string[],
    useAiDiameter: boolean = false,
    layerDefaultDiameter?: Record<string, string>,
  ) {
    const params = new URLSearchParams({
      discipline,
      scale: String(scale),
    });

    if (fileId) {
      params.set('file_id', fileId);
    }
    if (selectedLayers && selectedLayers.length > 0) {
      params.set('selected_layers', JSON.stringify(selectedLayers));
    }
    if (layerHatTipi && Object.keys(layerHatTipi).length > 0) {
      params.set('layer_hat_tipi', JSON.stringify(layerHatTipi));
    }
    if (layerMaterialType && Object.keys(layerMaterialType).length > 0) {
      params.set('layer_material_type', JSON.stringify(layerMaterialType));
    }
    if (sprinklerLayers && sprinklerLayers.length > 0) {
      params.set('sprinkler_layers', JSON.stringify(sprinklerLayers));
    }
    if (useAiDiameter) {
      params.set('use_ai_diameter', 'true');
    }
    if (layerDefaultDiameter && Object.keys(layerDefaultDiameter).length > 0) {
      params.set('layer_default_diameter', JSON.stringify(layerDefaultDiameter));
    }

    const fetchOptions: RequestInit = {
      method: 'POST',
      signal: AbortSignal.timeout(300_000),
    };

    // file_id varsa dosya gondermeye gerek yok, bos form gonder
    if (fileId) {
      // Python tarafinda file opsiyonel, file_id yeterli
      // Bos bir FormData gondermek gerekiyor cunku endpoint multipart bekliyor
      const formData = new FormData();
      fetchOptions.body = formData;
    } else if (fileBuffer) {
      const formData = new FormData();
      const blob = new Blob([fileBuffer as any]);
      formData.append('file', blob, fileName);
      fetchOptions.body = formData;
    }

    try {
      const response = await fetch(
        `${this.pythonServiceUrl}/parse?${params.toString()}`,
        fetchOptions,
      );

      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(
          `DWG Engine hatasi: ${error}`,
          response.status >= 500 ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'DWG Engine servisi baglanti hatasi. Servis calismiyor olabilir.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async convertToDxf(fileBuffer: Buffer, fileName: string) {
    const formData = new FormData();
    const blob = new Blob([fileBuffer as any]);
    formData.append('file', blob, fileName);

    try {
      const response = await fetch(
        `${this.pythonServiceUrl}/convert`,
        { method: 'POST', body: formData, signal: AbortSignal.timeout(120_000) },
      );
      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(`DXF cevirme hatasi: ${error}`, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('DWG Engine baglanti hatasi', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * DXF geometrisini (LINE/POLYLINE koordinatlari) getir.
   * Frontend SVG viewer (dwg-viewer klasoru) kullanir.
   */
  async getGeometry(fileId: string, layers: string = '') {
    const params = new URLSearchParams();
    if (layers) params.set('layers', layers);
    const qs = params.toString();
    const url = `${this.pythonServiceUrl}/geometry/${encodeURIComponent(fileId)}${qs ? '?' + qs : ''}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(
          `Geometri hatasi: ${error}`,
          response.status >= 500 ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'DWG Engine baglanti hatasi',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.pythonServiceUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
