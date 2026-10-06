import { Logger } from '@nestjs/common';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CLASS-TRANSFORMER KARESEL TEKİLLEŞTİRME YAMASI (06.10.2026, güvenlik HIGH-3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Genel ValidationPipe (`whitelist + transform`, main.ts) her DTO gövdesini
 *  class-transformer 0.5.1 ile sınıfa çevirir. `TransformOperationExecutor
 *  .getKeys` her nesnenin anahtarlarını
 *      keys.filter((key, index, self) => self.indexOf(key) === index)
 *  ile tekilleştirir: O(n²). Fazla anahtarları whitelist SONRA siler, yani
 *  gövdeye eklenen 80 bin üst düzey anahtar (~1 MB) her DTO ucunda olay
 *  döngüsünü tutar — ölçüldü: kimliksiz `POST /auth/login`'de ayrı süreçten
 *  komşu istek 11,7 sn (güvenlik incelemesi, 849 KB) / 14,6 sn (kapı, 1005 KB)
 *  bekledi; dizi tavanı (`dizi-tavani.ts`) bunu kapatamaz (dizi değil, anahtar
 *  sayısı).
 *
 *  HIZLI YOL — yalnız KANITLANABİLİR EŞDEĞER koşulda:
 *    · hedefin sınıf düzeyi stratejisi YOK (`getStrategy` = 'none': sınıfa
 *      `@Expose()`/`@Exclude()` takılmamış — 06.10 incelemesi: sınıf düzeyi
 *      `@Exclude()` özgünde `[]` verir, `getMetadata` onu SÜZDÜĞÜ için yalnız
 *      özellik sayımı bunu görmez),
 *    · hedefte ve atalarında özellik düzeyi @Expose / @Exclude meta verisi YOK,
 *    · dönüşüm seçenekleri sade: ignoreDecorators / excludeExtraneousValues /
 *      version / groups / excludePrefixes yok, strateji `exposeAll` (varsayılan),
 *    · Map değil.
 *  Bu koşulda özgün işlev her adımda boş meta veriyle geçer ve `Object.keys
 *  (object)`'i AYNEN döndürür (Object.keys zaten tekildir; tekilleştirme
 *  hiçbir şey yapmaz). Hızlı yol onu doğrudan döndürür; öbür HER durumda
 *  özgün işleve düşer. Meta veri HER çağrıda okunur (önbellek YOK): özgün de
 *  her çağrıda okur, ilk kullanımdan sonra eklenen dekoratör bayat kalmaz.
 *  Ölçüldü (06.10): 80 bin anahtar 12,9 sn → 0,26 sn; depodaki tüm DTO'larla
 *  ve iki yönde (gövde → sınıf, sınıf → düz nesne) çıktılar birebir
 *  (`test:govde-genisligi` E). Depoda @Expose/@Exclude ve özel dönüşüm
 *  seçeneği kullanılmıyor (grep).
 *
 *  SÜRÜM KİLİDİ: yalnız okunmuş sürümde (0.5.1) kurulur. Başka sürümde
 *  KURULMAZ, açılışta ERROR yazar ve kapı kırmızıya döner — yükseltmede
 *  `getKeys` yeniden okunmalı.
 *  ⚠ main.ts'te uygulama kurulmadan ÖNCE, tek yerden çağrılır.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const YAMALI_SURUM = '0.5.1';
/** Kurulu işlevin işareti (çift kurulum ve bağlantı denetimi için). */
export const YAMA_ISARETI = '__metapriceTekillestirmeYamasi';

/** class-transformer'ın modül içi yapısı (tip paketi bunları dışa vermez). */
interface MetaVeriDeposu {
  getStrategy(hedef: unknown): 'excludeAll' | 'exposeAll' | 'none';
  getExposedMetadatas(hedef: unknown): unknown[];
  getExcludedMetadatas(hedef: unknown): unknown[];
}
type AnahtarIslevi = ((this: { options?: Record<string, any> }, hedef: any, nesne: any, harita: boolean) => string[]) & {
  [YAMA_ISARETI]?: true;
  ozgun?: AnahtarIslevi;
};

export const yamaSurumUyarMi = (surum: string): boolean => surum === YAMALI_SURUM;

function yalinSecenek(o: Record<string, any> | undefined): boolean {
  const s = o ?? {};
  return !s.ignoreDecorators && !s.excludeExtraneousValues && s.version === undefined
    && !(s.groups && s.groups.length) && !(s.excludePrefixes && s.excludePrefixes.length)
    && (s.strategy === undefined || s.strategy === 'exposeAll');
}

/**
 * Yamayı kurar; kuruluysa yeniden kurmaz. Kurulduysa (ya da zaten kuruluysa)
 * true, kurulamadıysa false döner ve ERROR yazar. `surum` yalnız test içindir
 * (varsayılan: kurulu paketin sürümü).
 */
export function sinifDonusturucuYamasiniKur(
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  surum: string = require('class-transformer/package.json').version,
): boolean {
  const gunluk = new Logger('SinifDonusturucuYamasi');
  if (!yamaSurumUyarMi(surum)) {
    gunluk.error(`class-transformer ${surum}: yama KURULMADI (yalnız ${YAMALI_SURUM} okundu) — geniş gövde karesel kalır`);
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TransformOperationExecutor } = require('class-transformer/cjs/TransformOperationExecutor');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { defaultMetadataStorage } = require('class-transformer/cjs/storage') as { defaultMetadataStorage: MetaVeriDeposu };
  const proto = TransformOperationExecutor.prototype as { getKeys: AnahtarIslevi };
  if (proto.getKeys?.[YAMA_ISARETI]) return true;

  // Hedefsiz (iç içe düz nesne) özgünde de dekoratör adımı atlanır.
  const hedefSadeMi = (hedef: any): boolean => !hedef || (
    defaultMetadataStorage.getStrategy(hedef) === 'none'
    && defaultMetadataStorage.getExposedMetadatas(hedef).length === 0
    && defaultMetadataStorage.getExcludedMetadatas(hedef).length === 0
  );

  const ozgun = proto.getKeys;
  const hizli: AnahtarIslevi = function (this, hedef, nesne, harita) {
    if (!harita && !(nesne instanceof Map) && yalinSecenek(this.options) && hedefSadeMi(hedef)) {
      return Object.keys(nesne);
    }
    return (hizli.ozgun as AnahtarIslevi).call(this, hedef, nesne, harita);
  };
  hizli[YAMA_ISARETI] = true;
  hizli.ozgun = ozgun;
  proto.getKeys = hizli;
  return true;
}

/** Bağlantı denetimi: yama şu an kurulu mu (test ve açılış için). */
export function sinifDonusturucuYamasiKuruluMu(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TransformOperationExecutor } = require('class-transformer/cjs/TransformOperationExecutor');
  return !!(TransformOperationExecutor.prototype.getKeys as AnahtarIslevi)?.[YAMA_ISARETI];
}
