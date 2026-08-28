import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Odeme ortam degiskenleri — GEC (lazy) okuma
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ NEDEN VAR — OLCULMUS ONYUKLEME KAZASI:
 *  Gelen pakette `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_MERCHANT_ID`
 *  ve `UYGULAMA_URL` degiskenleri `config.getOrThrow(...)` ile SINIF
 *  KURUCUSUNDA okunuyordu (iyzico.client.ts:94-95, webhook.controller.ts:52-53,
 *  dunning.servisi.ts:67). NestJS bu saglayicilari ONYUKLEMEDE kurar.
 *
 *  Sonuc: bu degiskenlerden BIRI bile tanimsizsa `OdemeModule`'un AppModule'e
 *  eklenmesi TUM API'yi dusururdu — teklif, kutuphane, eslestirme, DWG dahil
 *  odemeyle HICBIR ilgisi olmayan her sey. Uretimde `docker compose up`
 *  sonrasi konteyner acilmaz, `migrate deploy` kosar ama `node dist/main`
 *  patlar; deploy.sh'in saglik dogrulamasi `build_sha` alamaz ve deploy geri
 *  alinir. Yani "odeme yapilandirilmamis" hatasi "tum urun cevrimdisi"
 *  olarak tezahur ederdi.
 *
 *  COZUM: deger KURUCUDA okunmaz. Kurucu yalnizca ConfigService'i saklar;
 *  deger ILK KULLANIMDA istenir. Eksikse yalnizca O UC 503 doner, gerisi
 *  calismaya devam eder.
 *
 *  Kaybolan hicbir sey yok: paketin "sessizce yanlis calisma" korkusu
 *  yerinde. Bu yuzden eksik degisken SESSIZ DEGIL — onyuklemede WARN
 *  gunlugu duser (bkz. odemeYapilandirmasiniBildir) ve kullanim aninda
 *  aciklayici 503 firlatilir. Degistirilen sey hatanin ZAMANI ve KAPSAMI,
 *  varligi degil.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Kart tahsilati icin zorunlu olan degiskenler. */
export const IYZICO_ZORUNLU = [
  'IYZICO_API_KEY',
  'IYZICO_SECRET_KEY',
  'IYZICO_MERCHANT_ID',
] as const;

/**
 * Degeri okur; yoksa KULLANIM ANINDA aciklayici 503 firlatir.
 * Onyuklemede DEGIL — sebebi yukarida.
 */
export function odemeAyari(config: ConfigService, anahtar: string): string {
  const deger = config.get<string>(anahtar);
  if (!deger) {
    throw new ServiceUnavailableException(
      `Odeme altyapisi yapilandirilmamis: ${anahtar} tanimli degil. ` +
        `Bu uc, ortam degiskeni tanimlanana kadar hizmet veremez. ` +
        `Uygulamanin geri kalani etkilenmez.`,
    );
  }
  return deger;
}

/** Eksik degisken var mi — 503 firlatmadan sorar. */
export function odemeYapilandirildiMi(config: ConfigService): boolean {
  return IYZICO_ZORUNLU.every((a) => !!config.get<string>(a));
}

/**
 * Onyuklemede BIR KEZ calisir: eksik degiskenleri gorunur kilar.
 * Sessiz yanlis yapilandirmanin panzehiri budur — kapali kart tahsilatinin
 * gunlukte izi olur.
 */
export function odemeYapilandirmasiniBildir(config: ConfigService): void {
  const logger = new Logger('OdemeYapilandirma');
  const eksik = IYZICO_ZORUNLU.filter((a) => !config.get<string>(a));
  if (eksik.length === 0) return;
  logger.warn(
    `Kart tahsilati KAPALI — eksik ortam degiskeni: ${eksik.join(', ')}. ` +
      `Havale yolu ve erisim kararlari calismaya devam eder; yalnizca ` +
      `iyzico uclari 503 doner.`,
  );
}
