import { ValidationPipe } from '@nestjs/common';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GÜVENLİ DOĞRULAMA BORUSU — KENDİ `constructor` ANAHTARI SİLİNİR
 *  (06.10.2026, güvenlik incelemesi HIGH-A)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  class-transformer 0.5.1 tipi verilmemiş iç içe nesnenin tipini
 *  `value.constructor`'dan TAHMİN eder (TransformOperationExecutor.js:120-130).
 *  İstek bu nesneye KENDİ `constructor` anahtarını koyabilir — JSON gövdesi;
 *  urlencoded gövde ve sorgu dizesi de (body-parser urlencoded.js:166 ve
 *  Express utils.js:290 qs'i `allowPrototypes: true` ile çağırır). Tahmin
 *  edilen "tip" `getKeys` → `getAncestors` yolunda MetadataStorage'ın süreç
 *  ömürlü `_ancestorsMap`ine (güçlü Map, MetadataStorage.js:205) yazılır ve
 *  BİR DAHA TOPLANMAZ; ardından `new targetType()`
 *  TypeError → 500 + yığınlı ERROR. Gövde DTO'da olmayan alanda olsa da olur:
 *  dönüşüm whitelist'ten ÖNCE tüm anahtarları gezer — kimliksiz
 *  `POST /api/auth/login` dahil HER DTO ucu. Ölçüldü (güvenlik incelemesi,
 *  HTTP): kimliksiz login 300 × 31 KB → GC sonrası +11,6 MB kalıcı; 50 MB'lık
 *  uçta 10 × 20 MB → +220 MB kalıcı.
 *
 *  Nest'in `stripProtoKeys`i yalnız `__proto__` siler. Bu alt sınıf aynı
 *  özyinelemede (Nest kendini `this` üzerinden çağırır: her derinlik, dizi
 *  öğeleri dahil) nesnenin KENDİ `constructor` anahtarını da siler.
 *  Meşru çıktı DEĞİŞMEZ: class-transformer `constructor` anahtarını dönüşümde
 *  zaten atlar (TransformOperationExecutor.js:155) — silinen tek şey tip
 *  tahmininin girdisidir. `prototype` SİLİNMEZ: tek başına okunmaz (yalnız
 *  tahmin edilen "tip"in alanıdır), silmek o adlı meşru alanı değiştirirdi.
 *  Görünür tek fark: kullanıcı anahtarlı sözlükte (ör. bulk-match `units`)
 *  "constructor" adlı satır eskiden TÜM isteği 500'e düşürüyordu (tahmin
 *  edilen "tip" bir dize); şimdi yalnız o satır düşer (class-transformer onu
 *  zaten atlıyordu), istek geçer.
 *
 *  KENDİ `toString` / `valueOf` da silinir (güvenlik incelemesi LOW-1, önceden
 *  vardı; kalıcı bellek yok): sayıya çevrilen alanda (`@Type(() => Number)`,
 *  ör. `GET /api/quotes?sayfa[valueOf]=1&sayfa[toString]=1`) class-transformer
 *  `Number(value)` çağırır (:86-89) → "Cannot convert object to primitive
 *  value" → 500 + yığınlı ERROR. Silinince `Number({})` NaN olur, doğrulama
 *  400 verir. Meşru çıktı yine değişmez: hedefte işlev olan anahtarı
 *  (Object.prototype'tan gelen toString/valueOf) dönüşüm zaten atlar (:271-277).
 *
 *  ⚠ Uygulamadaki HER ValidationPipe bu sınıftan kurulur (main.ts global +
 *  parametre boruları). src'de düz `ValidationPipe` ve `ParseArrayPipe` ADI
 *  YASAK (new, takma adlı içe aktarma, `@UsePipes(ValidationPipe)`, APP_PIPE
 *  useClass) — ParseArrayPipe içinde düz ValidationPipe kurar; APP_PIPE
 *  genel borudan ÖNCE koşar. Kapı: `test:dogrulama-borusu` K (sözdizim ağacı).
 * ═══════════════════════════════════════════════════════════════════════════
 */
/** İstekten gelen nesnenin KENDİ olarak taşıyamayacağı anahtarlar (yukarıda). */
export const SILINEN_OZ_ANAHTARLAR: readonly string[] = ['constructor', 'toString', 'valueOf'];

export class GuvenliValidationPipe extends ValidationPipe {
  // `override`: Nest yöntemi yeniden adlandırırsa derleme kırılır (sessizce
  // hiç çağrılmayan bir yönteme dönüşmez).
  protected override stripProtoKeys(value: any): void {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const anahtar of SILINEN_OZ_ANAHTARLAR) {
        if (Object.prototype.hasOwnProperty.call(value, anahtar)) delete value[anahtar];
      }
    }
    super.stripProtoKeys(value);
  }
}
