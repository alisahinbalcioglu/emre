import {
  CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, PayloadTooLargeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { kimlikCoz } from '../../altyapi/auth/kimlik';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DWG YUKLEME KAPISI — boyut tavani + firma basina es zamanli yukleme (26.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  TAVAN 250 MB. Olculdu (26.09): canli `DwgDosya` 8 yukleme / 5 ayri dosya, en
 *  buyugu 10,8 MB; Emre'nin gercek proje arsivinde 1.452 DWG → p50 2,5 MB · p90
 *  22,9 MB · p99 63,1 MB · en buyuk 98,8 MB, 100 MB'i gecen YOK. 250 MB en buyuk
 *  gercek dosyanin 2,5 kati. Eskiden 1 GB'a kadar govde BELLEKTE tutuluyordu
 *  (multer memoryStorage + motora Blob kopyasi: istek basina ~2 GB).
 *  ⚠ IKI YERDE AYNI SINIR: burasi · `Caddyfile` (`request_body`, cok parcali
 *  zarf payiyla biraz buyuk; kenarda dis katman). Kapi: `test:dwg-yukleme` C blogu.
 *
 *  ON DENETIM: `Content-Length` tavani asiyorsa govde HIC okunmadan 413. Tarayici
 *  FormData yuklemesinde uzunlugu daima gonderir; yalan/eksik uzunlukta multer'in
 *  `fileSize` siniri govdeyi akarken keser (parca silinir).
 *
 *  FIRMA BASINA ES ZAMANLI YUKLEME: DWG uclarinda hiz siniri yoktu. Her yukleme
 *  Nest'te diske 250 MB'a kadar gecici dosya, motorda bir o kadar kaynak dosya ve
 *  bir donusum hatti isi demektir; tek firma paralel yuklemeyle ikisini de
 *  tuketebilirdi. Firma basina en cok 2 yukleme ayni anda suruyor; ucuncusu
 *  govdesi okunmadan 429 + `Retry-After`. ON YUZ 429'DA DOSYAYI YENIDEN GONDERMEZ
 *  (28.09): otomatik deneme her seferinde dosyanin TAMAMINI tasirdi; kullaniciya
 *  mesaj + "Tekrar dene" (`frontend/components/dwg-metraj/yukleme-hatasi.ts`).
 *  Yer, yanit kapaninca (`res` 'close': bitis, hata ya da istemci kopusu — hepsi)
 *  TAM BIR KEZ geri verilir. Surec ici sayac: backend tek surec.
 *  Motor tarafi (donusum hatti ve /parse ayri sinirli semaforlar, hat kuyrugu):
 *  `python/main.py` ES ZAMANLILIK.
 *
 *  SIRA: sinif duzeyi kapilar (JWT + erisim) ONCE kosar — kimliksiz istek sayaca
 *  hic dokunmaz; bu kapi multer'dan (`FileInterceptor`) ONCE kosar — reddedilen
 *  istegin govdesi diske yazilmaz.
 */
export const DWG_YUKLEME_AZAMI_MB = 250;
export const DWG_YUKLEME_AZAMI_BAYT = DWG_YUKLEME_AZAMI_MB * 1024 * 1024;
/** Cok parcali zarf (sinirlar + parca basliklari + dosya adi) icin Content-Length payi. */
export const DWG_YUKLEME_ZARF_PAYI_BAYT = 64 * 1024;
export const FIRMA_BASINA_ES_ZAMANLI_YUKLEME = 2;
/** Firma sinirina takilan yuklemeye onerilen bekleme (sn, `Retry-After`): suren
 *  yuklemelerden biri genelde bu surede biter. On yuz otomatik yeniden GONDERMEZ. */
export const DWG_YUKLEME_SURUYOR_TEKRAR_SN = 30;
/** Motorun donusum hatti doluyken (motorun 429'u) onerilen bekleme (sn, `Retry-After`):
 *  hat (kosan + sirada) buyuk dosyada dakikalar icinde bosalir. */
export const DWG_MOTOR_YOGUN_TEKRAR_SN = 60;

/** Anahtar basina es zamanli is sayaci (surec ici). */
export class AnahtarliEsZamanlilik {
  private readonly suren = new Map<string, number>();

  constructor(private readonly azami: number) {}

  /** Yer varsa ayirir (true); doluysa false. */
  al(anahtar: string): boolean {
    const n = this.suren.get(anahtar) ?? 0;
    if (n >= this.azami) return false;
    this.suren.set(anahtar, n + 1);
    return true;
  }

  birak(anahtar: string): void {
    const n = this.suren.get(anahtar) ?? 0;
    if (n <= 1) this.suren.delete(anahtar);
    else this.suren.set(anahtar, n - 1);
  }

  sayi(anahtar: string): number {
    return this.suren.get(anahtar) ?? 0;
  }
}

/** Surecte TEK sayac (kapi ornegi Nest'te modul basina kurulsa da sayac paylasilir). */
export const firmaYuklemeleri = new AnahtarliEsZamanlilik(FIRMA_BASINA_ES_ZAMANLI_YUKLEME);

export const DWG_YUKLEME_COK_BUYUK_MESAJI =
  `DWG dosyasi en fazla ${DWG_YUKLEME_AZAMI_MB} MB olabilir. Dosyayi AutoCAD'de PURGE/AUDIT ile ` +
  'kucultup ya da gereksiz layout ve xref\'leri ayirip yeniden deneyin.';
export const DWG_YUKLEME_SURUYOR_MESAJI =
  `Firmanizin ${FIRMA_BASINA_ES_ZAMANLI_YUKLEME} DWG yuklemesi zaten suruyor; biri bitince yeniden deneyin.`;

@Injectable()
export class DwgYuklemeKapisi implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const uzunluk = Number(req.headers['content-length']);
    if (Number.isFinite(uzunluk) && uzunluk > DWG_YUKLEME_AZAMI_BAYT + DWG_YUKLEME_ZARF_PAYI_BAYT) {
      throw new PayloadTooLargeException(DWG_YUKLEME_COK_BUYUK_MESAJI);
    }

    const { firmaId } = kimlikCoz((req as Request & { user?: unknown }).user);
    // Istemci kapidan once gittiyse 'close' coktan yayildi: yer alinirsa hic geri verilmez.
    if (res.destroyed) return false;
    if (!firmaYuklemeleri.al(firmaId)) {
      res.setHeader('Retry-After', String(DWG_YUKLEME_SURUYOR_TEKRAR_SN));
      throw new HttpException(DWG_YUKLEME_SURUYOR_MESAJI, HttpStatus.TOO_MANY_REQUESTS);
    }
    // `once`: 'close' ikinci kez yayilsa da yer tek kez geri verilir.
    res.once('close', () => firmaYuklemeleri.birak(firmaId));
    return true;
  }
}
