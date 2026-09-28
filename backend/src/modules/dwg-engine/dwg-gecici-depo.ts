import { HttpException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import { istemciKopmaSinyali } from '../../altyapi/http/istemci-koptu';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DWG GECICI DEPO — yuklenen DWG bellege alinmadan diske akar (26.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Eskiden `/dwg-engine/upload` multer `memoryStorage` (1 GB sinir) + motora
 *  giden `Blob` kopyasiyla istek basina govdenin IKI katini bellekte tutuyordu.
 *  Simdi govde parca parca bu dizine yazilir; motora da diskten akarak gider
 *  (`DwgEngineService.uploadAsync`). Bellekte ayni anda yalniz akis tamponlari.
 *
 *  ⚠ ISTEMCI KOPARSA: multer 2.0.2 (FileInterceptor'un kullandigi, platform-express
 *  icindeki surum) istek koptugunda busboy'u kapatmaz — dosya akisi bitmez, disk
 *  yazimi hic tamamlanmaz, denetleyici hic cagrilmaz: yarim dosya + acik tanitici
 *  SIZAR. Bu yuzden yazim `istemciKopmaSinyali` ile kesilir (akis 499'la yikilir);
 *  kesilen ya da hata veren yazimin yarim dosyasi burada silinir. Kapi:
 *  `test:dwg-yukleme` A blogu.
 *
 *  SUPURME: surec yarim yazimda olurse (cokus, OOM) parca kalir; konteyner yeniden
 *  basladiginda /tmp korunur. Bir saatten eski `.part` dosyalari en gec 10 dakikada
 *  bir, yeni yuklemede silinir.
 */
const PARCA_UZANTISI = '.part';
const ESKI_PARCA_MS = 60 * 60 * 1000;
const SUPURME_ARALIGI_MS = 10 * 60 * 1000;

/** Her cagrida okunur: `os.tmpdir()` ortami (TMPDIR/TEMP) o an okur — testler yalitir. */
export function dwgGeciciDizin(): string {
  return join(tmpdir(), 'metaprice-dwg-yukleme');
}

/**
 * Multer (busboy) cok parcali govdedeki `filename`i LATIN1 cozer; tarayici UTF-8
 * gonderir → Turkce ad bozuk ("BAHÃECÄ°"). Canlida 26.09'a dek DwgDosya'ya bozuk
 * yaziliyordu (ayni bulgu teklif formatlarinda 20.07'de duzeltilmisti). Cevirim
 * gecersiz karakter uretirse ad oldugu gibi kalir.
 * - busboy `filename*` (RFC 5987) adini bildirilen karakter kumesiyle DOGRU cozer:
 *   U+00FF ustu karakter tasiyan ad latin1 bayti degildir, cevrilmez ("Şişli").
 * - Denetim karakterleri (NUL dahil) `_` olur: NUL Prisma'da 500'e yol aciyordu
 *   (is motor kuyruguna girdikten SONRA) — inceleme 26.09.
 */
export function yuklenenDosyaAdi(ham: string): string {
  const cozulmus = /[^\u0000-\u00ff]/.test(ham) ? ham : Buffer.from(ham, 'latin1').toString('utf8');
  const ad = cozulmus.includes('\uFFFD') ? ham : cozulmus;
  return ad.replace(/[\u0000-\u001f\u007f]/g, '_');
}

export class DwgGeciciDepo implements StorageEngine {
  private readonly logger = new Logger(DwgGeciciDepo.name);
  private sonSupurme = 0;

  _handleFile(
    req: Request,
    file: Express.Multer.File,
    cb: (error?: unknown, info?: Partial<Express.Multer.File>) => void,
  ): void {
    this.yaz(req, file).then((bilgi) => cb(null, bilgi), (e) => cb(e));
  }

  _removeFile(_req: Request, file: Express.Multer.File, cb: (error: Error | null) => void): void {
    rm(file.path, { force: true }).then(() => cb(null), (e: Error) => cb(e));
  }

  private async yaz(req: Request, file: Express.Multer.File): Promise<Partial<Express.Multer.File>> {
    const dizin = dwgGeciciDizin();
    await mkdir(dizin, { recursive: true });
    this.eskileriSupur(dizin);
    const yol = join(dizin, `${randomUUID()}${PARCA_UZANTISI}`);
    const hedef = createWriteStream(yol, { flags: 'wx' });
    // Kopma aninda akis HttpException(499) ile yikilir: multer ilk gordugu hatayi
    // Nest'e verir; `pipeline`in sinyal secenegi AbortError verirdi ve Nest her
    // kopmayi ERROR yiginiyla gunluge yazardi (inceleme 26.09). 499 sessizdir; iz
    // tek satir — /parse'taki "istemci koptu" ile ayni. Express `req.res`i kurar.
    const koptu = istemciKopmaSinyali(req.res!);
    const kes = () => file.stream.destroy(new HttpException('Istemci baglantiyi kapatti', 499));
    if (koptu.aborted) kes();
    else koptu.addEventListener('abort', kes, { once: true });
    try {
      await pipeline(file.stream, hedef);
    } catch (e) {
      await rm(yol, { force: true }).catch((re: Error) =>
        this.logger.warn(`Yarim DWG parcasi silinemedi (${yol}): ${re.message}`));
      if (koptu.aborted) {
        this.logger.log(`[uploadAsync] istemci koptu — yukleme ${(hedef.bytesWritten / 1048576).toFixed(0)} MB'ta kesildi, parca silindi`);
      }
      throw e;
    } finally {
      koptu.removeEventListener('abort', kes);
    }
    return { destination: dizin, filename: yol.slice(dizin.length + 1), path: yol, size: hedef.bytesWritten };
  }

  private eskileriSupur(dizin: string): void {
    const simdi = Date.now();
    if (simdi - this.sonSupurme < SUPURME_ARALIGI_MS) return;
    this.sonSupurme = simdi;
    void (async () => {
      let silinen = 0;
      for (const ad of await readdir(dizin)) {
        if (!ad.endsWith(PARCA_UZANTISI)) continue;
        const yol = join(dizin, ad);
        const bilgi = await stat(yol).catch(() => null);
        if (bilgi && simdi - bilgi.mtimeMs > ESKI_PARCA_MS) {
          await rm(yol, { force: true }).catch(() => undefined);
          silinen++;
        }
      }
      if (silinen) this.logger.warn(`${silinen} eski DWG yukleme parcasi silindi (${dizin})`);
    })().catch((e) => this.logger.warn(`DWG gecici dizin supurmesi basarisiz: ${e?.message ?? e}`));
  }
}

const silmeGunlugu = new Logger('DwgGeciciDepo');

/** Denetleyici isini bitirince (basari ya da hata) gecici dosyayi siler. Silinemezse
 *  istek bozulmaz — uyari duser, supurme sonra toplar. */
export async function geciciDosyayiSil(yol: string | undefined): Promise<void> {
  if (!yol) return;
  await rm(yol, { force: true }).catch((e: Error) =>
    silmeGunlugu.warn(`DWG gecici dosyasi silinemedi (${yol}): ${e.message}`));
}
