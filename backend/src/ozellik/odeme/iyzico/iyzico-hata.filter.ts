import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { IyzicoHatasi } from './iyzico.client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  IYZICO HATA SUZGECI — uzak ucun soyledigini KULLANICIYA ULASTIRIR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU DOSYA NEDEN VAR (02.09'da canli tarayici turunda olculdu)
 *
 *  Musteri fatura formunu EKSIKSIZ doldurdu, "Odemeye gec" dedi ve ekranda
 *  yalnizca su yazdi:
 *      Internal server error
 *
 *  Sebep: `IyzicoHatasi extends Error` — `HttpException` DEGIL. Nest'in
 *  varsayilan suzgeci tanimadigi bir Error gorunce govdeyi
 *  `{statusCode: 500, message: 'Internal server error'}` yapar. iyzico'nun
 *  gercek cevabi (`errorCode` + `errorMessage`) tam bu noktada YUTULUR.
 *
 *  Yani sistem sorunu BILIYORDU ama kimseye soyleyemiyordu. Musteri icin
 *  bu, hicbir sey bilmemekle ayni — hangi alani duzeltecegini goremiyor.
 *
 *  ── NEDEN SUZGEC, NEDEN CAGRI YERINDE try/catch DEGIL ──────────────────
 *  iyzico istemcisinin BES kullanici yuzu var (`basla`, `donus`,
 *  `kart-guncelle`, `iptal`, webhook mutabakati). Her birine ayri try/catch
 *  koymak ayni kurali bes kez yazmak ve BIRINI unutmaya davetiye cikarmak
 *  olurdu — nitekim bu kusur da tam olarak "bir yerde eksik kalan kural"di.
 *  Suzgec sinifa gore yakalar: yeni bir uc eklendiginde otomatik kapsanir.
 *
 *  ── NEDEN 502, NEDEN 500 DEGIL ─────────────────────────────────────────
 *  Hata BIZDE degil, ustteki serviste. 502 bunu dogru soyler; izleme
 *  tarafinda da "kendi kodumuz coktu" ile "odeme saglayicisi reddetti"
 *  ayrilabilir hale gelir. Dogrulama nitelikli reddetmeler (iyzico'nun
 *  4xx'i) 400'e cevrilir — cunku onlari duzeltecek olan KULLANICIDIR.
 *
 *  ⚠ GUVENLIK: govdeye yalnizca iyzico'nun KENDI mesaji ve hata kodu
 *  konur. Yigin izi, istek govdesi, anahtarlar ASLA gonderilmez; onlar
 *  yalniz sunucu gunlugune yazilir.
 */
@Catch(IyzicoHatasi)
export class IyzicoHataSuzgeci implements ExceptionFilter<IyzicoHatasi> {
  private readonly logger = new Logger('IyzicoHataSuzgeci');

  catch(hata: IyzicoHatasi, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const cevap = ctx.getResponse<Response>();
    const istek = ctx.getRequest<{ url?: string; method?: string }>();

    const durum = iyzicoDurumunuHttpyeCevir(hata.httpDurum);

    // Sunucu gunlugu TAM bilgiyi tutar — teshis buradan yapilir.
    this.logger.error(
      `iyzico reddetti — ${istek?.method ?? '?'} ${istek?.url ?? '?'} · ` +
        `kod=${hata.kod ?? '-'} httpDurum=${hata.httpDurum ?? '-'} · ${hata.message}`,
    );

    cevap.status(durum).json({
      statusCode: durum,
      // On yuz `data.message` okuyor (`api.ts` + abonelik sayfasi).
      message: kullaniciyaMesaj(hata),
      // ⚠ Onek `IYZICO_` OLMAMALI: `test:ortam` kapisi tirnak icindeki her
      // `IYZICO_*` metnini ORTAM DEGISKENI sayar (dolayli okumalari
      // kacirmamak icin bilerek genis bir ag). Bu bir hata kodu, degisken
      // degil — kapiyi zayiflatmak yerine ad degistirildi.
      kod: hata.kod ?? 'ODEME_SAGLAYICI_HATASI',
      kaynak: 'iyzico',
    });
  }
}

/**
 * iyzico'nun HTTP durumunu bizim ucumuzun durumuna cevirir. SAF fonksiyon.
 *
 * 4xx  → 400: girdiyle ilgili; duzeltecek olan KULLANICI.
 * diger→ 502: uzak servis sorunu; kullanici duzeltemez, tekrar denemeli.
 */
export function iyzicoDurumunuHttpyeCevir(iyzicoDurum?: number): number {
  if (iyzicoDurum && iyzicoDurum >= 400 && iyzicoDurum < 500) {
    return HttpStatus.BAD_REQUEST;
  }
  return HttpStatus.BAD_GATEWAY;
}

/**
 * Kullaniciya gosterilecek metin. SAF fonksiyon.
 *
 * iyzico mesajlari Turkce ve genelde eyleme donuk ("gsmNumber gecersiz").
 * Bos gelirse genel ama DURUST bir metin doneriz — "Internal server error"
 * gibi hicbir sey soylemeyen bir cumle DEGIL.
 */
export function kullaniciyaMesaj(hata: {
  kod?: string;
  message?: string;
}): string {
  const ham = (hata.message ?? '').trim();
  if (!ham) {
    return 'Odeme saglayicisi istegi reddetti. Bilgilerinizi kontrol edip tekrar deneyin.';
  }
  return hata.kod ? `${ham} (iyzico kodu: ${hata.kod})` : ham;
}
