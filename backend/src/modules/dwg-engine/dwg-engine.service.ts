import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';

/**
 * Geometri GOVDESININ tavani (baslik zaman asimindan AYRI). Govde istemcinin
 * hizinda akar (Caddy arkasinda 17 MB ~1,3 MB gzip); tavan yalniz asili motor
 * baglantisinin sonsuza dek tutulmasini onler. On yuzun agir istek tavaniyla
 * (`frontend/ortak/lib/api.ts` AGIR_ZAMAN_ASIMI_MS) ayni.
 */
const GEOMETRI_GOVDE_TAVANI_MS = 300_000;

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
   *
   * istemciKoptu (26.09): tarayici istegi iptal edince iptal olan sinyal
   * (`altyapi/http/istemci-koptu.ts`). Motor istegi `AbortSignal.any([zaman
   * asimi, istemciKoptu])` ile gider — istemci koparsa motor baglantisi da
   * kapanir ve motor alt sureci durdurur. Istemci gittiyse YENIDEN DENEME YOK:
   * kimsenin beklemedigi ikinci bir is baslatilmaz.
   */
  private async fetchWithRetry(
    url: string,
    optionsFactory: (timeoutMs: number) => RequestInit,
    initialTimeout: number,
    retryTimeout: number = 90_000,
    label: string = 'request',
    istemciKoptu?: AbortSignal,
  ): Promise<Response> {
    const tryOnce = async (timeout: number): Promise<Response> => {
      // Iptal edilmis sinyalle fetch CAGRILMAZ: undici 7 (Node 24) FormData govdeli
      // istekte reddin USTUNE yakalanmamis istisna atiyor ("Invalid state:
      // ReadableStream is already closed") — surec duser. Olculdu 26.09: Node 24
      // once iptal 2/2, fetch'ten sonra ayni tick'te iptal 0/30; canlidaki Node
      // 20.20.2 (undici 6.24.1) 0/2. Node yukseltmesinde de guvende kalsin. Kapi: Y.
      istemciKoptu?.throwIfAborted();
      const opts = optionsFactory(timeout);
      if (!istemciKoptu || !opts.signal) return fetch(url, opts);
      // Node 20'de AbortSignal.any kaynak sinyali ZAYIF tutar; undici'nin dinleyicisi
      // birlesik sinyalde oldugu icin zaman asimi sinyali GC'de toplanir ve HIC
      // tetiklenmez (olculdu 26.09, canli imaj Node 20.20.2: gc() sonrasi zaman asimi
      // yok; Node 24'te var). Bu dinleyici onu tetiklenene dek tutar. Kapi: Z (gc'li).
      opts.signal.addEventListener('abort', () => undefined, { once: true });
      return fetch(url, { ...opts, signal: AbortSignal.any([opts.signal, istemciKoptu]) });
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
      // Karar sinyalden: hatanin adi iptal nedenine gore degisir (AbortError da olabilir).
      if (istemciKoptu?.aborted) throw err;
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

  /**
   * Istemci yanit beklemeden gitti, motor istegi kesildi. Yanit kimseye
   * ulasmaz: 499 (nginx "Client Closed Request") sessiz bir HttpException —
   * 503 "motor calismiyor" ya da yeniden deneme uyarisi gunluge YAZILMAZ.
   * Tek satirlik iz canlida iptalin calistigini gosterir.
   */
  private istemciGitti(label: string, baslangic: number): never {
    this.logger.log(`[${label}] istemci koptu — motor istegi ${Date.now() - baslangic} ms sonra kesildi`);
    throw new HttpException('Istemci baglantiyi kapatti', 499);
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
   * Motorun cache'indeki dosyanin (fileId, `/upload`tan) layer bazinda metrajini cikarir.
   * Dosya govdeli "geriye uyumlu" mod 26.09'da kaldirildi (bkz. denetleyici).
   *
   * istemciKoptu: tarayici istegi iptal ederse motor istegi de kesilir (DWG
   * Analiz birim degisince ayirmayi iptal edip yeniden baslatir; kesilmezse
   * motor eski birimli isi sonuna kadar kosturuyordu). Bkz. fetchWithRetry.
   */
  async parseDwg(
    fileId: string,
    discipline: string = 'mechanical',
    scale?: number,
    selectedLayers?: string[],
    layerHatTipi?: Record<string, string>,
    layerMaterialType?: Record<string, string>,
    sprinklerLayers?: string[],
    splitMode?: string,
    istemciKoptu?: AbortSignal,
  ) {
    const baslangic = Date.now();
    const params = new URLSearchParams({ discipline });
    // Auto-mode: scale undefined -> parametreyi HIC gonderme. Python query
    // default'u None olur -> unit_detect.detect_unit calisir (antet+olcek
    // kesisimi; $INSUNITS yalnizca son care, cunku YALAN soyleyebiliyor).
    if (scale !== undefined && scale !== null) {
      params.set('scale', String(scale));
    }

    params.set('file_id', fileId);
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
    // split_mode yalniz varsayilan-disi ('none') iken gonderilir — eski Python
    // motoru parametreyi tanimasa bile 't' akisi hicbir zaman etkilenmez.
    if (splitMode === 'none') {
      params.set('split_mode', 'none');
    }
    // layer_default_diameter + use_proximity_diameter KALDIRILDI —
    // otomatik cap atama motoru sokuldu, cap atamasi frontend'de manuel.

    // Motor govdeyi OKUMAZ; bos form on yuzun gonderdigi bicimin aynisi (motorun
    // kopma bekcisi `test_parse_iptal.py` I5/I6'da bu bicimle olculdu).
    const factory = (timeoutMs: number): RequestInit => ({
      method: 'POST',
      body: new FormData(),
      headers: this.headers(),
      signal: AbortSignal.timeout(timeoutMs),
    });

    try {
      const response = await this.fetchWithRetry(
        `${this.pythonServiceUrl}/parse?${params.toString()}`,
        factory,
        300_000,
        300_000,
        'parseDwg',
        istemciKoptu,
      );

      if (!response.ok) {
        const error = await response.text();
        // Engine bos body donduyse '(empty body)' marker - debug icin
        const display = error?.trim() ? error : `(empty body, HTTP ${response.status})`;
        this.logger.error(`[parseDwg] ${response.status} from engine: ${display}`);
        throw new HttpException(
          `DWG Engine hatasi [${response.status}]: ${display}`,
          // 429 (CF rate limit) + 5xx → SERVICE_UNAVAILABLE — frontend retry yapsin.
          // 4xx (validation, missing file) → UNPROCESSABLE_ENTITY — kalici hata.
          response.status >= 500 || response.status === 429
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      return await response.json();
    } catch (error) {
      if (istemciKoptu?.aborted) this.istemciGitti('parseDwg', baslangic);
      this.translateError(error);
    }
  }

  /**
   * DXF geometrisini (Canvas2D viewer, dwg-viewer) motordan istemciye COZMEDEN akitir.
   *
   * Motorun yaniti zaten son bicimdedir (upload_worker: `_json_safe` + katı JSON +
   * UTF-8; `/geometry` onu FileResponse ile akitir). Eskiden burada `response.json()`
   * + Express `res.json` vardi: canli backend imajinda (Node 20.20.2, 1 CPU) 18 MB'de
   * JSON.parse 443 ms + JSON.stringify 253 ms (+ 17 MB'lik ETag sha1) — Nest'in TEK
   * olay dongusu her proje acilisinda ~0,7 sn duruyordu (26.09).
   *
   * HATA ESLEMESI aynen ve govde akmaya baslamadan: motor 5xx/429 → 503 (on yuz
   * yeniden dener), diger 4xx (409 "onbellekte yok", 404, 410) → 422 (on yuz
   * "Oturum sona erdi… yeniden yukleyin"). Cold start / yeniden deneme: fetchWithRetry.
   *
   * ZAMAN ASIMI yalniz BASLIKLARA kadar (60 + 90 sn, eskisi gibi): govde istemcinin
   * hizinda akar. Eski `AbortSignal.timeout` istegin tamamini kapsiyordu — tamponlayan
   * eski yolda zararsizdi (ic ag, 17 MB milisaniyeler), akitan yolda yavas istemcinin
   * indirmesini keserdi. Govdeye ayri, comert tavan: GEOMETRI_GOVDE_TAVANI_MS.
   *
   * KOPMA: istemci giderse (istemciKoptu) motor istegi kesilir; akis ortasinda
   * `pipeline` iki ucu da yikar — motor baglantisi sizmaz. Basliklar gittikten sonra
   * motor olurse yanit YIKILIR (temiz bitmez): istemci ag hatasi gorur ve yeniden
   * dener; "tamam" gorunen yarim JSON almaz. Kapi: `npm run test:dwg-geometri-akis`.
   */
  async geometriyiAkit(fileId: string, res: ExpressResponse, istemciKoptu?: AbortSignal): Promise<void> {
    const baslangic = Date.now();
    const url = `${this.pythonServiceUrl}/geometry/${encodeURIComponent(fileId)}`;

    // Her deneme kendi denetimini tasir. Zaman asimi sinyali istegi DOGRUDAN kesmez:
    // yalniz basliklar gelmeden dolarsa denetimi keser. Dinleyici sinyali GC'den de
    // korur (Node 20'de AbortSignal.any kaynagi zayif tutar — bkz. fetchWithRetry).
    type Deneme = { denetim: AbortController; basliklarGeldi: boolean; sureyiBirak: () => void };
    let deneme: Deneme | undefined;
    const factory = (timeoutMs: number): RequestInit => {
      const bu: Deneme = { denetim: new AbortController(), basliklarGeldi: false, sureyiBirak: () => undefined };
      deneme = bu;
      const sure = AbortSignal.timeout(timeoutMs);
      const sureDoldu = () => {
        if (!bu.basliklarGeldi) bu.denetim.abort(sure.reason);
      };
      sure.addEventListener('abort', sureDoldu, { once: true });
      // Basliklar gelince dinleyici kalkar: sure dolana dek (60/90 sn) bu denemeyi tutmasin.
      bu.sureyiBirak = () => sure.removeEventListener('abort', sureDoldu);
      return { method: 'GET', headers: this.headers(), signal: bu.denetim.signal };
    };

    let response: Response;
    try {
      response = await this.fetchWithRetry(url, factory, 60_000, 90_000, 'getGeometry', istemciKoptu);
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
      // Govde artik COZULMEDIGI icin bos/eksik yanit burada, basliklardan ONCE elenir
      // (eski yolda response.json() onu 503'e ceviriyordu; on yuz yeniden dener).
      if (!response.body) throw new Error('motor geometri yaniti govdesiz');
      if (response.headers.get('content-length') === '0') throw new Error('motor geometri yaniti bos');
    } catch (error) {
      if (istemciKoptu?.aborted) this.istemciGitti('getGeometry', baslangic);
      this.translateError(error);
    }

    // Basliklar geldi: bundan sonrasi istemcinin hizinda. Baslik suresi kapanir,
    // govde tavani kurulur (asili motor baglantisi sonsuza dek tutulmasin).
    const akan = deneme!;
    akan.basliklarGeldi = true;
    akan.sureyiBirak();
    const tavan = AbortSignal.timeout(GEOMETRI_GOVDE_TAVANI_MS);
    const tavanDoldu = () => akan.denetim.abort(tavan.reason);
    tavan.addEventListener('abort', tavanDoldu, { once: true });

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Uzunluk aktarilir: yarim kalan govde HTTP cercevesinde de yakalanir (istemci
    // uzunluk uyusmazligi gorur, hicbir yol yarim JSON'u "tamam" bitiremez). Kodlanmis
    // (gzip) yanitta undici govdeyi actigi icin uzunluk tutmaz — o zaman aktarilmaz.
    const uzunluk = response.headers.get('content-length');
    if (uzunluk && !response.headers.get('content-encoding')) res.setHeader('Content-Length', uzunluk);
    const kaynak = Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>);
    // Hangi uc ONCE dustu? Sonradan `istemciKoptu.aborted`a bakmak yetmez: kaynak
    // hata verince pipeline yaniti yikar, 'close' kopma sinyalini de kurar (olculdu).
    let ilkDusen: 'istemci' | 'motor' | undefined;
    const istemciDustu = () => { ilkDusen ??= 'istemci'; };
    istemciKoptu?.addEventListener('abort', istemciDustu, { once: true });
    kaynak.once('error', () => { ilkDusen ??= 'motor'; });
    try {
      await pipeline(kaynak, res);
    } catch (e: any) {
      // Burada THROW YOK: basliklar gitti; Nest'in istisna suzgeci yaniti TEMIZ bitirirdi
      // (yarim JSON "tamam" gorunurdu). Yanit YIKILIR — pipeline zaten yikar, garanti icin.
      if (!res.destroyed) res.destroy();
      if (ilkDusen === 'istemci') {
        this.logger.log(`[getGeometry] istemci koptu — motor akisi ${Date.now() - baslangic} ms sonra kesildi`);
        return;
      }
      // Basliklar gitti; pipeline yaniti YIKTI (temiz bitmedi) → istemci ag hatasi
      // gorur ve yeniden dener. Motor oldu, govde tavani doldu ya da yazim bozuldu.
      this.logger.error(
        `[getGeometry] geometri akarken kesildi (${Date.now() - baslangic} ms): ${e?.name ?? 'hata'}: ${e?.message ?? e}`,
      );
    } finally {
      tavan.removeEventListener('abort', tavanDoldu);
      istemciKoptu?.removeEventListener('abort', istemciDustu);
    }
  }

  /**
   * Async upload (OCERP pattern). Python dosyayi diske yazip file_id doner
   * (~1-2sn); DWG→DXF donusumu + parse izole subprocess'te arka planda.
   * Frontend /status ile poll eder.
   *
   * kapsam (26.09): firmaya ozgu opak tekillestirme anahtari (`dedupKapsami`).
   * Motor ayni icerigi yalniz ayni kapsamda tekillestirir; kapsamsiz yukleme hic
   * tekillestirilmez.
   */
  async uploadAsync(fileBuffer: Buffer, fileName: string, kapsam: string) {
    const factory = (timeoutMs: number): RequestInit => {
      const formData = new FormData();
      const blob = new Blob([fileBuffer as any]);
      formData.append('file', blob, fileName);
      formData.append('kapsam', kapsam);
      return {
        method: 'POST',
        body: formData,
        headers: this.headers(),
        signal: AbortSignal.timeout(timeoutMs),
      };
    };

    try {
      const response = await this.fetchWithRetry(
        `${this.pythonServiceUrl}/upload`,
        factory,
        // PRD 2.4 — timeout hizalama: Python /upload artik LibreDWG donusumu
        // YAPMIYOR (izole subprocess'e tasindi), sadece disk yazimi + spawn.
        // 15sn ic-ag dosya transferi icin bol pay. Toplam en kotu senaryo
        // 15+2+30=47sn < frontend axios 120sn — katmanlar artik CAKISMAZ,
        // eski 30/60sn ile buyuk DWG'de olusan 503 zinciri kalkti.
        15_000,
        30_000,
        'uploadAsync',
      );
      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(
          `Upload hatasi: ${error}`,
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

  /** F5C — Background parse status sorgula (polling icin). Hafif, 5sn timeout. */
  async getUploadStatus(fileId: string) {
    const factory = (timeoutMs: number): RequestInit => ({
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(timeoutMs),
    });

    try {
      const response = await this.fetchWithRetry(
        `${this.pythonServiceUrl}/status/${encodeURIComponent(fileId)}`,
        factory,
        // 5sn cok kisa: background parse CPU-heavy oldugunda engine main
        // thread'i kisa sure bloke olabiliyor (LibreDWG subprocess wait,
        // ezdxf parse vb.). Bu durumda /status hizli geri donmeyebiliyor,
        // backend 503 firlatip kullaniciya generic hata gosteriyor.
        // 30sn'ye cikartiyoruz; engine bloke olsa bile yaniti bekleyelim,
        // /health 200 dondugu surece worker yaşıyor demektir.
        30_000,
        45_000,  // retry daha da uzun
        'getUploadStatus',
      );
      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(
          `Status hatasi: ${error}`,
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
