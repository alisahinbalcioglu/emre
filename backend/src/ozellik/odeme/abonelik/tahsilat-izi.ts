/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TAHSİLAT İZİ — kart siparişi bu aboneliğe UYGULANDI mı (28.09.2026) · SAF
 * ═══════════════════════════════════════════════════════════════════════════
 *  Uygulanan her kart tahsilatı iz bırakır (`webhook.isleyici` →
 *  `basariliTahsilat`): faturası kuyruğa alınır (`Fatura.tahsilatKodu` TEKİL =
 *  iyzico sipariş kodu) ya da tutar okunamadıysa `TUTAR_OKUNAMADI_OLAYI`
 *  denetim izi yazılır. İz, `AbonelikServisi.tahsilatBasarili`nin "bu sipariş
 *  zaten uygulandı" ölçütüdür: aynı siparişin İKİNCİ bildirimi (iyzico'nun
 *  yeni ref kodlu yeniden gönderimi, mutabakat ya da anlık deneme oynatması,
 *  sahte tekrar) hiçbir şey değiştirmez — `TAHSILAT_TEKRARI_OLAYI` izi kalır.
 *
 *  NEDEN İŞLENMİŞ OLAY DEĞİL: tekil anahtar gövdedeki `iyziReferenceCode`dan
 *  türer ve imza onu KAPSAMAZ (X-IYZ-SIGNATURE-V3: olay tipi + abonelik +
 *  sipariş + müşteri kodu; ölçüldü, `test:webhook-tahsilat-dogrulama` R-M1) —
 *  yeni ref kodlu tekrar YENİ olaydır. "Başarı olayı işlendi" de uygulandı
 *  demek değildir: satın alma sonuçlanmadan gelen bildirim "bilinmeyen
 *  abonelik" diye işlenir, ödemeyi gece mutabakatı sonra oynatır (R13).
 *  NEDEN DURUM OLAYI DEĞİL: fatura kuyruğu düşerse AYNI olay yeniden denenir
 *  ve faturayı ancak yeniden koşum yazar (R12) — durum olayı o sırada yazılmış
 *  olur. Fatura satırı gece mutabakatının "faturalı" ölçütüyle aynı tablodur
 *  (kural 7: faturası olan sipariş oynatılmaz); burada ayrıca satırın
 *  abonelik kimliği eşleşmeli (başka aboneliğin faturası iz değildir).
 *
 *  ⚠ ÖDEME SORUNU OLAN SATIRDA İZ KISA DEVRE YAPMAZ (`odemeSorunuVarMi`):
 *  orada soru "bu ödeme döngüyü kapatır mı"dır ve cevabı iyzico'nun listesi
 *  verir (eski dönem kuralı). Ödemesi uygulanmış satır iyzico'nun gecikmiş
 *  UNPAID'iyle yeniden ODEME_BEKLIYOR'a düşerse, anlık denemenin kuyruğa
 *  yazdığı başarı olayı onu ancak böyle döngüden çıkarır (28.09 kod
 *  incelemesi: kısa devre bu müşteriyi ödediği hâlde KISITLI bırakırdı).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Satır ödeme sorunu içinde mi: dunning döngüsü (`ilkBasarisizlik` dolu ya da
 * `denemeSayisi` ≠ 0 — `tahsilatBasarili`nin koşullu sıfırlamasıyla AYNI
 * tanım) YA DA ödeme sorunlu durum. SAF.
 */
export function odemeSorunuVarMi(ab: {
  durum: string;
  ilkBasarisizlik?: Date | null;
  denemeSayisi?: number | null;
}): boolean {
  return (
    ab.ilkBasarisizlik != null ||
    (ab.denemeSayisi ?? 0) !== 0 ||
    ab.durum === 'ODEME_BEKLIYOR' ||
    ab.durum === 'KISITLI' ||
    ab.durum === 'ASKIDA'
  );
}

/**
 * Tutarı okunamayan tahsilatın denetim izi (`AbonelikOlayi.tip`, 28.09) —
 * fatura yazılamadığında siparişin uygulandığının TEK kaydı; yönetici uyarısı
 * da sipariş başına BİR kez buna bakarak gider (`webhook.isleyici`).
 */
export const TUTAR_OKUNAMADI_OLAYI = 'fatura.tutar.okunamadi';

/** Uygulanmış siparişin tekrar bildirimi yok sayıldı (`AbonelikOlayi.tip`). */
export const TAHSILAT_TEKRARI_OLAYI = 'tahsilat.tekrar.yok.sayildi';

/**
 * Eski dönem siparişi uygulandı: ödeme gerçek, durum ve dunning DEĞİŞMEDİ
 * (`AbonelikOlayi.tip`; kural `iyzico/tahsilat-kaniti.ts` →
 * `sonrakiDonemIslenmisMi`). `durum.degisti` YAZILMAZ: havale ↔ kart penceresi
 * onu "tekliften sonra karttan çekim" sayar (havale-kart-penceresi.ts).
 */
export const ESKI_DONEM_TAHSILATI_OLAYI = 'tahsilat.eski.donem';

/** Olay listesinde bu siparişin tutar-okunamadı izi var mı? SAF. */
export function tutarIziVarMi(olaylar: ReadonlyArray<{ veri: unknown }>, siparisKodu: string): boolean {
  return olaylar.some((o) => (o.veri as { siparisKodu?: unknown } | null)?.siparisKodu === siparisKodu);
}
