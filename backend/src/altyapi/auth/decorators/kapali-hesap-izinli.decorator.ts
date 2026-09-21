import { SetMetadata } from '@nestjs/common';

/**
 * PLAN 5.8 §4.5 — KAPALI HESABIN ULASABILECEGI UCLAR.
 *
 * Kapali (ya da firmasi kapanmis) hesap her istekte 403 `HESAP_KAPALI` alir.
 * Bu dekatorun tasidigi uclar O KAPIYA TAKILMAZ.
 *
 * ⚠ IZIN LISTESI, `erisim.servisi.ts`teki **"askida"** kipinin uc
 * karsiligidir — yeni bir kip DEGIL ("Askidayken yalnizca odeme sayfasi",
 * `ASKIDA_ACIK = { ABONELIK_YONET }`). Uc madde ve hepsinin gerekcesi var:
 *   · `GET /auth/me`                → geri donus ekrani kendi verisini alir
 *                                     (izinli olmasaydi ekran kendi 403'unu
 *                                      yakalar ve sonsuz donguye girerdi)
 *   · `GET /auth/hesabim/verilerim` → KVKK m.11. "Verilerimi indir ODEMEYE
 *                                     BAGLANAMAZ" bu depoda YAZILI bir kural
 *                                     (`hesap.servisi.ts` basligi). Hesabin
 *                                     kapali olmasi da bir odeme durumudur.
 *   · `@Controller('abonelik')`     → geri donmenin TEK yolu paket satin
 *                                     almak (K1). Kapali olsaydi musteri
 *                                     ekrandaki "Paket sec" dugmesine basip
 *                                     403 alirdi: calismayan bir soz.
 * BASKA HICBIR UC. Genisletmek, 30 gun boyunca odemesiz calisan bir urun
 * demektir — kapatilmak istenen gelir aciginin ta kendisi.
 *
 * ⚠ `POST /auth/hesabimi-kapat` BILEREK LISTEDE DEGIL: hesap zaten kapali.
 * ⚠ `@KoltukDisiIzinli` ile KARISTIRMAYIN: o "paket kac kisilik" ekseni, bu
 * "hesap acik mi" ekseni. Ikisi DIK; biri digerinin yerine gecmez ve bir
 * ucun ikisini birden tasimasi gayet normaldir.
 */
export const KAPALI_HESAP_IZINLI = 'kapaliHesapIzinli';

export const KapaliHesapIzinli = () => SetMetadata(KAPALI_HESAP_IZINLI, true);
