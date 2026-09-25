/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KART ABONELİĞİ KAPATMA — SAF KURALLAR (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Havaleye geçen satırın iyzico kart aboneliğini kapatma işinin (Emre
 *  kararı: "ikisi birden, onay beklemez") DB'siz, iyzico'suz parçaları.
 *  Uygulayan: `AbonelikServisi.havaleIcinKartAboneliginiKapat`; atlama kuralını
 *  müşteri iptali (`SatinAlmaServisi.iptalEt`) de okur — TEK kural.
 *
 *  ⚠ Prisma/Nest BİLMEZ (tip bile import edilmez): hem servis hem satın alma
 *  yolu import eder, döngü doğmaz. Kapısı: `backend/test/havale-iyzico-
 *  cakismasi-test.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** `havaleIcinKartAboneliginiKapat` sonucu. */
export type KartKapatmaSonucu =
  | { sonuc: 'kod-yok' }
  | { sonuc: 'iptal-edildi' | 'zaten-kapali'; kod: string }
  | { sonuc: 'basarisiz'; kod: string; hata: string };

/**
 * iyzico'daki kart aboneliği BİLDİĞİMİZ kadarıyla kapalı mı — yeniden iptale
 * gerek yok, iyzico'ya gidilmez:
 *   · kod yok → kapatılacak bir şey yok (havale yolunun KENDİ açtığı satır);
 *   · `iyzicoDurum` CANCELED/EXPIRED → son bakışta kapalıydı. İkisi de
 *     iyzico'da TERMİNAL: iptal edilmiş abonelik yeniden açılmaz
 *     (`abonelikAktiflestir` yalnız PENDING içindir ve hiç çağrılmıyor);
 *   · `iptalTalebi` dolu → `SatinAlmaServisi.iptalEt` bu alanı ancak iyzico'da
 *     iptal BAŞARILI olduktan sonra yazar (ölçüldü 24.09: tek yazan o; yeniden
 *     satın alma NULL'a çeker).
 *
 * ⚠ İKİ OKUYUCU: havale onayının iptali VE müşteri iptali. Kapalı aboneliğe
 * ikinci iptal iyzico'da hata döner (tutanak: 201403); okumayan yol düşer —
 * havaleye geçmiş müşteri aboneliğini iptal EDEMİYORDU (inceleme YÜKSEK-1).
 */
export function kartAboneligiKapaliMi(ab: {
  iyzicoAbonelikKodu: string | null;
  iyzicoDurum: string | null;
  iptalTalebi: Date | null;
}): boolean {
  if (!ab.iyzicoAbonelikKodu) return true;
  if (ab.iyzicoDurum === 'CANCELED' || ab.iyzicoDurum === 'EXPIRED') return true;
  return ab.iptalTalebi != null;
}

/**
 * Kayıtlı kart GÜNCELLENEBİLİR mi — kart formu açılır mı, şeridin ödeme
 * eylemi kart sayfasına mı gider? (25.09.2026)
 *
 * Kartla ödenen, bitmemiş ve iyzico'da KAPANMAMIŞ (yukarıdaki kural)
 * abonelik. Havale satırında (havale teklifi `ASKIDA` + `HAVALE` satırı
 * açar), iptal edilmiş ya da iyzico'da CANCELED/EXPIRED abonelikte
 * güncellenecek kart yoktur: form açılmaz, şerit `/abonelik`e yollar. Kart
 * sayfasına yollasaydı müşteri "kart aboneliği yok" retiyle çıkmaza düşerdi
 * (inceleme M3).
 *
 * ⚠ İKİ OKUYUCU, TEK KURAL: `SatinAlmaServisi.kartGuncellemeFormu` (ret) ve
 * `ErisimServisi.karar` (şerit eylemi). Kapısı: `backend/test/kart-guncelleme-test.ts`.
 */
export function kartGuncellenebilirMi<
  T extends {
    odemeYontemi: string;
    durum: string;
    iyzicoAbonelikKodu: string | null;
    iyzicoDurum: string | null;
    iptalTalebi: Date | null;
  },
>(ab: T): ab is T & { iyzicoAbonelikKodu: string } {
  if (ab.odemeYontemi !== 'KART' || ab.durum === 'SONA_ERDI') return false;
  return !kartAboneligiKapaliMi(ab);
}

/** Çift tahsilat e-postasında kart aboneliğinin son durumu. */
export function kapatmaCumlesi(k: KartKapatmaSonucu): string {
  switch (k.sonuc) {
    case 'iptal-edildi':
      return `Kart aboneliği (${k.kod}) şimdi iyzico'da iptal edildi; sonraki dönemlerde karttan çekim olmayacak.`;
    case 'zaten-kapali':
      return `Kart aboneliği (${k.kod}) iyzico'da kapalı görünüyor; bu çekim kapanmadan önce yapılmış olabilir.`;
    case 'basarisiz':
      return (
        `⚠ Kart aboneliği (${k.kod}) iyzico'da iptal EDİLEMEDİ (${k.hata}): iyzico panelinden ` +
        'elle iptal edin, yoksa sonraki dönemde yine çekilir.'
      );
    default:
      return 'Kart aboneliği kaydı bulunamadı.';
  }
}
