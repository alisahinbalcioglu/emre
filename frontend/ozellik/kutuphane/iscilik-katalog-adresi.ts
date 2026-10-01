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
 *
 * 30.09.2026 (Emre, Paket 1 / C2): katalog YALNIZ yoneticiye acik — `GET
 * /labor` da artik `@Roles('admin')` (kiraci 403). Eskiden kiraci
 * yuklemesinin actigi kalem (ad + o kiracinin fiyati) her pro kiraciya
 * donuyordu. Yonetici DISINDA adres YOK (`null`): sayfa istegi hic atmaz,
 * "yalniz yonetici" notu gosterir. Kiracinin iscilik fiyatlari kendi
 * iscilik firmasi listelerindedir (Kutuphanem).
 */
export function iscilikKatalogAdresi(rol: string | null | undefined, discipline: string): string | null {
  if (rol !== 'admin') return null;
  return `/labor/yonetici-katalog?discipline=${encodeURIComponent(discipline)}`;
}
