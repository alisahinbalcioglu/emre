/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TAHSİLAT DENEMESİ KİRASI + ANLIK DENEME KURALLARI — SAF (26.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre kararı (26.09): kart güncellenince bekleyen ödeme HEMEN bir kez yeniden
 *  tahsil edilir (`DunningServisi.anindaDene`). iyzico'nun yeniden deneme
 *  çağrısı (`/operation/retry`) PARA ÇEKER ve POST'tur — kendiliğinden yeniden
 *  denenmez. İki yol aynı siparişi çekebilir: dunning merdiveni (günlük
 *  tarama) ve kartını güncelleyen müşteri (oturumlu uç). Çift tık, sayfa
 *  yenileme ya da aynı anda koşan tarama ikinci çağrıyı gönderirse ÇİFT ÇEKİM
 *  olabilir.
 *
 *  KİRA (`Abonelik.tahsilatKirasi`): iyzico'ya giden HER yol önce kirayı
 *  KOŞULLU yazar (NULL ya da geçmiş ise). Yalnız biri kazanır; kaybeden
 *  iyzico'ya GİTMEZ. ⚠ Kira başlarken UZUN alınır ve yalnız iyzico KESİN
 *  RET verdiyse kısaltılır: para çeken çağrıdan SONRAKİ bir yazım düşerse kira
 *  uzun kalır — hata tarafı "bir gün bekle"dir, "iki kez çek" değil.
 *
 *  Prisma/Nest BİLMEZ (tip bile import edilmez). Kapısı:
 *  `backend/test/aninda-tahsilat-test.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Sonucu beklenen deneme: başarılı (ödeme işleniyor) ya da BELİRSİZ (yanıt
 * gelmedi; iyzico çekmiş olabilir). Merdivenin zaman aşımı ertelemesiyle aynı
 * ölçü: bir gün — ama 24 saat DEĞİL: 10:00 taramasının aldığı kira ertesi
 * 10:00'dan önce bitmeli, yoksa "bir kez ertele" sessizce iki güne uzar.
 */
export const KIRA_SONUC_MS = 20 * 3_600_000;

/**
 * iyzico KESİN RET verdi (kart reddetti): para çekilmedi. Müşteri başka bir
 * kart girip yeniden deneyebilsin diye kısa; iyzico'yu ve bankayı art arda
 * reddedilen denemelerle doldurmasın diye sıfır değil.
 */
export const KIRA_RET_MS = 10 * 60_000;

/** iyzico'nun yeniden deneme penceresi: başarısızlıktan sonra EN FAZLA 160 gün. */
export const YENIDEN_DENEME_PENCERESI_GUN = 160;

/**
 * Yeniden deneme hatasının anlamı — KİRA süresini belirler (iki yolda da):
 *  · `reddedildi` — iyzico kodlu `failure` yanıtı verdi: kart reddetti, para
 *    ÇEKİLMEDİ.
 *  · `belirsiz`   — zaman aşımı, kodsuz hata, çözümlenemeyen yanıt, kopan
 *    bağlantı: istek iyzico'ya ulaşıp İŞLENMİŞ olabilir.
 * ⚠ Merdivenin bildirim kararı bundan GENİŞ değil: yalnız zaman aşımını
 * erteler (`IyzicoHatasi.zamanAsimi`), kalan hatayı ret sayıp e-postasını
 * gönderir — o davranış DEĞİŞMEDİ. Burada ölçülen tek şey kiranın ne kadar
 * tutulacağıdır: şüphede uzun.
 */
export function denemeHatasiSinifi(hata: unknown): 'reddedildi' | 'belirsiz' {
  if (!hata || typeof hata !== 'object') return 'belirsiz';
  const h = hata as { kod?: unknown; zamanAsimi?: unknown };
  if (h.zamanAsimi === true) return 'belirsiz';
  return typeof h.kod === 'string' && h.kod !== '' ? 'reddedildi' : 'belirsiz';
}

/** Anında denemenin yapılamama nedeni. `null` = denenebilir. */
export type AnindaDenemeEngeli =
  | 'ABONELIK_YOK'
  | 'KART_ABONELIGI_DEGIL'
  | 'BEKLEYEN_ODEME_YOK'
  | 'PENCERE_DOLDU';

/** Ödeme bekleyen (dunning döngüsündeki) durumlar — merdivenin taradığı üçü. */
export const ODEME_BEKLEYEN_DURUMLAR: readonly string[] = Object.freeze(['ODEME_BEKLIYOR', 'KISITLI', 'ASKIDA']);

/**
 * Bu satırda bekleyen ödeme ŞİMDİ yeniden denenebilir mi? SAF.
 *
 *  · Kart aboneliği açık olmalı — `kartGuncellenebilirMi` (kart formu ve
 *    şeridin eylemiyle TEK kural; çağıran sonucunu verir).
 *  · Dunning döngüsünde olmalı: ödeme bekleyen durum + `ilkBasarisizlik`.
 *    ASKIDA DAHİL: merdiven orada artık denemiyor; asıl amaç erişimi geri
 *    açmak.
 *  · iyzico'nun 160 günlük penceresi dolmamış olmalı.
 */
export function anindaDenemeEngeli(
  ab: { durum: string; ilkBasarisizlik: Date | null } | null,
  kartGuncellenebilir: boolean,
  simdi: Date,
): AnindaDenemeEngeli | null {
  if (!ab) return 'ABONELIK_YOK';
  if (!kartGuncellenebilir) return 'KART_ABONELIGI_DEGIL';
  if (!ODEME_BEKLEYEN_DURUMLAR.includes(ab.durum) || !ab.ilkBasarisizlik) return 'BEKLEYEN_ODEME_YOK';
  const gecenGun = (simdi.getTime() - ab.ilkBasarisizlik.getTime()) / 86_400_000;
  return gecenGun > YENIDEN_DENEME_PENCERESI_GUN ? 'PENCERE_DOLDU' : null;
}

/** Oturumlu ucun müşteriye döndürdüğü sonuç (ön yüz: `ozellik/odeme/kart-guncelleme.ts`). */
export type AnindaDenemeSonucu =
  /** iyzico siparişi ÖDENMİŞ gösteriyor — başarı yolu kuyruğa yazıldı. */
  | { sonuc: 'alindi' }
  /** iyzico denemeyi kabul etti, sipariş henüz ödenmiş görünmüyor. */
  | { sonuc: 'iletildi' }
  /** Kart reddetti; iyzico'nun kendi iletisi. */
  | { sonuc: 'reddedildi'; mesaj: string }
  /** Yanıt gelmedi — çekilmiş olabilir; yeniden denenmez. */
  | { sonuc: 'belirsiz' }
  /** Kira başka bir denemede (çift tık, yenileme, tarama); ne zaman biteceği. */
  | { sonuc: 'zaten-deneniyor'; kiraBitis: string }
  /** Bekleyen ödeme yok (ödenmiş, havale, döngü dışı). */
  | { sonuc: 'gerekmiyor' }
  /** Hedef sipariş doğrulanamadı ya da iyzico okunamadı — para çekilmedi. */
  | { sonuc: 'yapilamadi' };
