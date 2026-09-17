/**
 * ISCILIK KATALOG LISTESININ ADRESI (Faz 7 · 2.12 · R1-O4, 17.09.2026).
 *
 * ⚠ OLCULEN KUSUR: paket seviyesi artik YALNIZ abonelikten geliyor. Isçilik
 * katalog sayfasi KURESEL katalogu duzenleyen yonetici ekranidir; yazma
 * uclari (POST/PUT/DELETE) yalniz `@Roles('admin')` ister ve paket kapisi
 * TASIMAZ. Ama liste `GET /labor` ile cekiliyordu ve o uc
 * `@RequireTier('pro')` + `KUTUPHANE_GORUNTULE` altindaydi. Sonuc: aboneligi
 * pro olmayan bir platform yoneticisi kalem EKLEYEBILIYOR ama eklediklerini
 * GOREMIYOR (bos liste, 403 bile degil — ekran "kalem eklenmemis" diyor).
 *
 * ⚠ ROL YALNIZ HANGI UCUN CAGRILACAGINI secer, yetki VERMEZ. Gercek kapi
 * sunucudadir (`@Get('yonetici-katalog') @Roles('admin')`); buradaki rol
 * bilgisi localStorage'dan gelir ve kullanici tarafindan degistirilebilir.
 * Degistiren kisi yalnizca 403 alir.
 */
export function iscilikKatalogAdresi(rol: string | null | undefined, discipline: string): string {
  const q = `discipline=${encodeURIComponent(discipline)}`;
  return rol === 'admin' ? `/labor/yonetici-katalog?${q}` : `/labor?${q}`;
}
