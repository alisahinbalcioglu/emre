import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';

@Injectable()
export class DwgEngineService {
  private readonly logger = new Logger(DwgEngineService.name);
  private readonly pythonServiceUrl: string;
  private readonly internalToken: string;

  constructor() {
    // Python engine URL önceligi:
    //   1. DWG_ENGINE_URL — acik URL (dev: http://localhost:8011)
    //   2. DWG_ENGINE_HOST — Render fromService.host ile set edilir, https eklenir
    //   3. fallback: localhost
    const urlEnv = process.env.DWG_ENGINE_URL?.trim();
    const hostEnv = process.env.DWG_ENGINE_HOST?.trim();
    // Defansif: host degerinin basinda http(s):// veya sonunda / kazara
    // varsa temizle, aksi halde double-prefix bug olusur (https://https://...).
    const cleanHost = hostEnv
      ?.replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');
    if (urlEnv) {
      this.pythonServiceUrl = urlEnv.replace(/\/+$/, '');
    } else if (cleanHost) {
      this.pythonServiceUrl = `https://${cleanHost}`;
    } else {
      this.pythonServiceUrl = 'http://localhost:8011';
    }
    this.internalToken = process.env.DWG_ENGINE_TOKEN?.trim() ?? '';
  }

  /** Python engine'e giden istekler icin header — INTERNAL auth */
  private headers(): Record<string, string> {
    return this.internalToken ? { 'X-Internal-Token': this.internalToken } : {};
  }

  /**
   * Python servisinden gelen hatalari kullaniciya anlasilir mesaja cevirir.
   * Bos body / 50sn cold start / worker crash durumlarinda generic Geometri hatasi:
   * cikmasin diye.
   *
   * @param prefix "Layer listesi hatasi" gibi mesaj on eki
   * @param status Python tarafinin HTTP status kodu
   * @param body Python tarafinin response body'si (text)
   * @param retryAfter upstream Retry-After header degeri (saniye), opsiyonel
   * @returns Birlestirilmis kullanici mesaji
   */
  private formatUpstreamError(prefix: string, status: number, body: string, retryAfter?: number): string {
    const trimmed = (body ?? '').trim();
    if (status === 429) {
      // Cloudflare/Render edge burst rate limit. Frontend retry tetikler.
      const wait = retryAfter && retryAfter > 0 ? `${retryAfter}sn` : 'birkac saniye';
      return `${prefix}: Sunucu kalabalik, ${wait} sonra tekrar denenecek`;
    }
    if (!trimmed) {
      // Bos body — Render edge crash, worker death, cold start drop senaryolari
      if (status >= 500) {
        return `${prefix}: DWG motoru cevap vermedi (HTTP ${status}, gecici hata olabilir, tekrar deneyin)`;
      }
      return `${prefix}: DWG motoru istegi reddetti (HTTP ${status})`;
    }
    return `${prefix}: ${trimmed}`;
  }

  /**
   * Upstream'in HTTP status kodunu, frontend'in dogru ele alabilecegi NestJS
   * HttpStatus'una map eder. Ozel durumlar (404 cache miss, 410 TTL expired,
   * 429 rate limit) korunur ki frontend retry mantigi calissin.
   */
  private mapUpstreamStatus(status: number): HttpStatus {
    if (status === 404) return HttpStatus.NOT_FOUND;
    if (status === 410) return HttpStatus.GONE;
    if (status === 429) return HttpStatus.TOO_MANY_REQUESTS;
    if (status >= 500) return HttpStatus.INTERNAL_SERVER_ERROR;
    return HttpStatus.UNPROCESSABLE_ENTITY;
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
    const url = `${this.pythonServiceUrl}/layers`;
    try {
      const response = await fetch(
        url,
        { method: 'POST', body: formData, headers: this.headers(), signal: AbortSignal.timeout(300_000) },
      );

      if (!response.ok) {
        const body = await response.text();
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '', 10);
        const ra = !Number.isNaN(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
        this.logger.warn(
          `upstream /layers status=${response.status} url=${url} retry-after=${ra ?? '-'} body=${body.slice(0, 200)}`,
        );
        throw new HttpException(
          this.formatUpstreamError('Layer listesi hatasi', response.status, body, ra),
          this.mapUpstreamStatus(response.status),
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const msg = (error as any)?.name === 'TimeoutError'
        ? 'DWG cok buyuk veya karmasik — 5 dakikada cevap alinamadi. Daha kucuk bir bolumunu deneyin.'
        : 'DWG Engine servisi baglanti hatasi. Servis calismiyor olabilir.';
      this.logger.warn(`upstream /layers transport error: ${(error as any)?.name ?? 'Error'}: ${(error as any)?.message ?? ''}`);
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
      headers: this.headers(),
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

    const url = `${this.pythonServiceUrl}/parse?${params.toString()}`;
    try {
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const body = await response.text();
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '', 10);
        const ra = !Number.isNaN(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
        this.logger.warn(
          `upstream /parse status=${response.status} retry-after=${ra ?? '-'} body=${body.slice(0, 200)}`,
        );
        throw new HttpException(
          this.formatUpstreamError('DWG Engine hatasi', response.status, body, ra),
          this.mapUpstreamStatus(response.status),
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`upstream /parse transport error: ${(error as any)?.name ?? 'Error'}: ${(error as any)?.message ?? ''}`);
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

    const url = `${this.pythonServiceUrl}/convert`;
    try {
      const response = await fetch(
        url,
        { method: 'POST', body: formData, headers: this.headers(), signal: AbortSignal.timeout(120_000) },
      );
      if (!response.ok) {
        const body = await response.text();
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '', 10);
        const ra = !Number.isNaN(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
        this.logger.warn(
          `upstream /convert status=${response.status} retry-after=${ra ?? '-'} body=${body.slice(0, 200)}`,
        );
        throw new HttpException(
          this.formatUpstreamError('DXF cevirme hatasi', response.status, body, ra),
          this.mapUpstreamStatus(response.status),
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`upstream /convert transport error: ${(error as any)?.name ?? 'Error'}: ${(error as any)?.message ?? ''}`);
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
        headers: this.headers(),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const body = await response.text();
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '', 10);
        const ra = !Number.isNaN(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
        this.logger.warn(
          `upstream /geometry status=${response.status} fileId=${fileId} retry-after=${ra ?? '-'} body=${body.slice(0, 200)}`,
        );
        // 404 cache miss, 410 TTL expired, 429 rate limit — hepsi mapUpstreamStatus
        // tarafindan korunur ki frontend retry/reset davranisi calissin.
        throw new HttpException(
          this.formatUpstreamError('Geometri hatasi', response.status, body, ra),
          this.mapUpstreamStatus(response.status),
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`upstream /geometry transport error: ${(error as any)?.name ?? 'Error'}: ${(error as any)?.message ?? ''}`);
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
