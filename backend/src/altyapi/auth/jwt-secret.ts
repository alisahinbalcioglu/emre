/**
 * KL P1-a (pano kalem 63) — JWT ANAHTARININ TEK KAYNAGI.
 *
 * ONCESI: uc dosya (`auth.module.ts`, `auth.service.ts`,
 * `strategies/jwt.strategy.ts`) `process.env.JWT_SECRET || '<sabit deger>'`
 * yaziyordu. Ortam degiskeni tanimli degilse uygulama SESSIZCE kaynak kodda
 * yazan anahtarla token imzaliyordu — depoyu goren herkes gecerli token
 * uretebilirdi. Yedek degerin varligi, eksik yapilandirmayi bir hataya degil
 * bir GUVENLIK ACIGINA cevirir.
 *
 * SIMDI: yedek YOK. Anahtar yoksa uygulama ACILMAZ ve NEDENINI SOYLER.
 * Sessizce varsayilana dusmek bu tamirin basarisizligi olurdu (KL3 - ikinci
 * cikis yolu ateslenerek olculdu).
 *
 * Cagri ANI onemli: `auth.module.ts` bunu @Module metadata'sinda cagirir,
 * yani modul yuklenirken — bootstrap'tan ONCE. Yanlis yapilandirma ilk
 * istegi beklemeden, acilista patlar.
 *
 * DEGISMEYENLER (KL4 siniri): token suresi, imza algoritmasi, payload,
 * login akisi, yetki kontrolu. Degisen TEK sey anahtarin KAYNAGI.
 */
export function jwtSecret(): string {
  const deger = process.env.JWT_SECRET;
  if (!deger || !deger.trim()) {
    throw new Error(
      'JWT_SECRET tanimli degil — uygulama BASLATILMADI.\n' +
        '  Neden: token imza anahtari yalnizca ortamdan okunur; kaynak kodda\n' +
        '  yedek deger YOKTUR (bilincli — kalem 63).\n' +
        '  Cozum: ortam degiskenini tanimlayin (or. .env icinde\n' +
        '  JWT_SECRET="<en az 32 karakter rastgele deger>"), sonra yeniden baslatin.\n' +
        '  Uyari: anahtar DEGISIRSE mevcut tum token`lar gecersiz olur\n' +
        '  (kullanicilar bir kez cikis yapmis olur).',
    );
  }
  return deger;
}
