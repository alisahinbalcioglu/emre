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
   * Cold-start tolerant fetch — Render free tier servisi uyumusa ilk istek
   * 50+ saniye surebilir. Bu helper:
   *   1. Once normal timeout ile dene
   *   2. 5xx VEYA timeout/abort hatasi alirsa kisa backoff sonra retry et,
   *      retry timeout daha genis (cold start tamamlansin)
   *   3. Retry da basarisiz → orijinal hatayi firlat (handler 503'e cevirir)
   *
   * Multipart body'lerde dikkat: FormData stream tek seferlik. Retry icin
   * factory pattern: caller her cagri icin yeni RequestInit doner.
   */
  private async fetchWithRetry(
    url: string,
    optionsFactory: (timeoutMs: number) => RequestInit,
    initialTimeout: number,
    retryTimeout: number = 90_000,
    label: string = 'request',
  ): Promise<Response> {
    const tryOnce = async (timeout: number): Promise<Response> => {
      return fetch(url, optionsFactory(timeout));
    };

    try {
      const r = await tryOnce(initialTimeout);
      // 5xx → cold start ihtimali, retry et
      if (r.status >= 500 && r.status < 600) {
        this.logger.warn(`[${label}] ${r.status} response — cold start retry (${retryTimeout}ms)`);
        await this.delay(2000);
        return await tryOnce(retryTimeout);
      }
      // 401/403 → auth mismatch. Retry anlamsiz (token degismeyecek).
      // Acik mesaj firlat ki kullanici Render env senkronu sorununu hizli tani.
      // Sebep: NestJS DWG_ENGINE_TOKEN ile Python INTERNAL_API_TOKEN ayni
      // degerde degil (genelde Python servisi yeniden olusturuldugunda
      // generateValue yeni random uretir, NestJS env eski deger ile kalir).
      if (r.status === 401 || r.status === 403) {
        this.logger.error(
          `[${label}] ${r.status} Unauthorized — DWG_ENGINE_TOKEN / INTERNAL_API_TOKEN mismatch. ` +
          `Render dashboard'da metaprice-dwg-engine.INTERNAL_API_TOKEN degerini metaprice-api.DWG_ENGINE_TOKEN'a kopyalayin.`,
        );
        throw new HttpException(
          'DWG Engine yetkilendirme hatasi. Sunucu yoneticisinin token senkronizasyonunu kontrol etmesi gerekiyor (DWG_ENGINE_TOKEN / INTERNAL_API_TOKEN).',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return r;
    } catch (err: any) {
      const errName = err?.name ?? '';
      const isTransient = errName === 'TimeoutError' || errName === 'AbortError';
      if (!isTransient) throw err;
      this.logger.warn(`[${label}] ${errName} — cold start retry (${retryTimeout}ms)`);
      await this.delay(2000);
      // Retry hatasi orijinal hata gibi yukari firlatilir
      return await tryOnce(retryTimeout);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }

  /** Cold-start veya kisa-kesintili hata mesajlari — handler kullanilir */
  private translateError(err: unknown): never {
    if (err instanceof HttpException) throw err;
    const errName = (err as any)?.name ?? '';
    if (errName === 'TimeoutError' || errName === 'AbortError') {
      throw new HttpException(
        'DWG Engine yanit vermedi (cold start veya yogun yuk). Lutfen 30 saniye sonra tekrar deneyin.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    throw new HttpException(
      'DWG Engine servisi baglanti hatasi. Servis calismiyor olabilir.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /**
   * Layer listesi cikar (hizli, uzunluk hesaplamaz).
   * Dosya Python tarafinda cache'lenir, file_id doner.
   */
  async listLayers(fileBuffer: Buffer, fileName: string) {
    // FormData factory — retry icin her cagrida yeni body
    const factory = (timeoutMs: number): RequestInit => {
      const formData = new FormData();
      const blob = new Blob([fileBuffer as any]);
      formData.append('file', blob, fileName);
      return {
        method: 'POST',
        body: formData,
        headers: this.headers(),
        signal: AbortSignal.timeout(timeoutMs),
      };
    };

    try {
      const response = await this.fetchWithRetry(
        `${this.pythonServiceUrl}/layers`,
        factory,
        300_000, // 5 dakika - buyuk DWG icin
        300_000, // retry de 5 dakika (zaten cok genis)
        'listLayers',
      );

      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(
          `Layer listesi hatasi: ${error}`,
          // 429 (CF rate limit) + 5xx → SERVICE_UNAVAILABLE — frontend retry yapsin.
          // 4xx (validation, missing file) → UNPROCESSABLE_ENTITY — kalici hata.
          response.status >= 500 || response.status === 429
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      return await response.json();
    } catch (error) {
      this.translateError(error);
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

    const factory = (timeoutMs: number): RequestInit => {
      const opts: RequestInit = {
        method: 'POST',
        headers: this.headers(),
        signal: AbortSignal.timeout(timeoutMs),
      };

      // file_id varsa dosya gondermeye gerek yok, bos form gonder
      if (fileId) {
        opts.body = new FormData();
      } else if (fileBuffer) {
        const formData = new FormData();
        const blob = new Blob([fileBuffer as any]);
        formData.append('file', blob, fileName);
        opts.body = formData;
      }
      return opts;
    };

    try {
      const response = await this.fetchWithRetry(
        `${this.pythonServiceUrl}/parse?${params.toString()}`,
        factory,
        300_000,
        300_000,
        'parseDwg',
      );

      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(
          `DWG Engine hatasi: ${error}`,
          // 429 (CF rate limit) + 5xx → SERVICE_UNAVAILABLE — frontend retry yapsin.
          // 4xx (validation, missing file) → UNPROCESSABLE_ENTITY — kalici hata.
          response.status >= 500 || response.status === 429
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      return await response.json();
    } catch (error) {
      this.translateError(error);
    }
  }

  async convertToDxf(fileBuffer: Buffer, fileName: string) {
    const factory = (timeoutMs: number): RequestInit => {
      const formData = new FormData();
      const blob = new Blob([fileBuffer as any]);
      formData.append('file', blob, fileName);
      return {
        method: 'POST',
        body: formData,
        headers: this.headers(),
        signal: AbortSignal.timeout(timeoutMs),
      };
    };

    try {
      const response = await this.fetchWithRetry(
        `${this.pythonServiceUrl}/convert`,
        factory,
        120_000,
        180_000,
        'convertToDxf',
      );
      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(`DXF cevirme hatasi: ${error}`, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      return await response.json();
    } catch (error) {
      this.translateError(error);
    }
  }

  /**
   * DXF geometrisini (LINE/POLYLINE koordinatlari) getir.
   * Frontend Canvas2D viewer (dwg-viewer klasoru) kullanir.
   *
   * Cold-start hassasiyeti yuksek — kullanici dogrudan bekliyor. Initial 60s,
   * retry 90s. Toplam max ~150s + 2s backoff. Kullanici gozunde "uyandiriliyor"
   * olarak gosterilir (frontend B2 retry mantik).
   */
  async getGeometry(fileId: string, layers: string = '') {
    const params = new URLSearchParams();
    if (layers) params.set('layers', layers);
    const qs = params.toString();
    const url = `${this.pythonServiceUrl}/geometry/${encodeURIComponent(fileId)}${qs ? '?' + qs : ''}`;

    const factory = (timeoutMs: number): RequestInit => ({
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(timeoutMs),
    });

    try {
      const response = await this.fetchWithRetry(url, factory, 60_000, 90_000, 'getGeometry');
      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(
          `Geometri hatasi: ${error}`,
          // 429 (CF rate limit) + 5xx → SERVICE_UNAVAILABLE — frontend retry yapsin.
          // 4xx (validation, missing file) → UNPROCESSABLE_ENTITY — kalici hata.
          response.status >= 500 || response.status === 429
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      return await response.json();
    } catch (error) {
      this.translateError(error);
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
