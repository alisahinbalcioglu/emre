/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TAHSİLAT KANITI — iyzico'nun KENDİ sipariş kaydı · SAF, TEK KAYNAK (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Webhook gövdesi ne başarının ne başarısızlığın kanıtıdır: uç herkese açık,
 *  imza varsayılan olarak zorunlu değil (`IYZICO_IMZA_ZORUNLU`). Kanıt, iyzico'ya
 *  SORULAN abonelik detayıdır. Bu dosya o detayı okuyan kuralları taşır:
 *
 *   · `odenmisSiparisMi` — ÖDENDİ Mİ. Üç yer okur: gece mutabakatının kayıp
 *     tahsilatı (`mutabakat.job.ts` → `erisimiUzatanOdemeler`), başarılı
 *     tahsilat webhook'u (`AbonelikServisi.tahsilatBasarili`) ve başarısızlık
 *     kararının vetosu (aşağıda). Mutabakattan buraya TAŞINDI: servis
 *     mutabakatı içe aktaramaz (mutabakat servisi içe aktarır — döngüde Nest'in
 *     kurucu tip bilgisi `undefined` kalır). Mutabakat yeniden dışa verir.
 *   · `siparisiBul` — gövdedeki kodun iyzico listesindeki BİREBİR karşılığı.
 *   · `tahsilatBasarisizligiKarari` — REDDEDİLDİ Mİ (`tahsilatBasarisiz`).
 *
 *  ÖLÇÜLDÜ (20.08 sandbox, docs/adim0-tutanak/adim0-ek-cikti.json):
 *   · ödenmiş sipariş: `orderStatus: 'SUCCESS'` + `paymentAttempts[{paymentStatus: 'SUCCESS'}]`;
 *   · ACTIVE abonelikte `orderStatus: 'WAITING'`, `paymentAttempts: []`
 *     (TEST 2-dogrulama) — ACTIVE, ödemenin kanıtı DEĞİLDİR;
 *   · iyzico sonraki dönemin siparişini ÖNCEDEN açar (UPGRADED abonelikte
 *     `SUBSCRIPTION_UPGRADED`, deneme yok — TEST 2-dogrulama-2).
 *  ÖLÇÜLMEDİ: reddedilmiş denemenin değeri ('FAILURE'? 'FAILED'?), FAILED
 *  siparişin biçimi, bildirimin iyzico listesinden ÖNCE gelip gelmediği.
 *
 *  Kapılar: `test:webhook-tahsilat-dogrulama` (S + webhook/mutabakat bağlantısı),
 *  `test:mutabakat-kayip-tahsilat` S.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ⚠ Deneme alanının ADI: 20.08 tutanağı `paymentStatus` gösteriyor, istemci
 * tipi (`IyzicoOdemeDenemesi`) `paymentAttemptStatus` diyor. İkisi de okunur —
 * ikisi de iyzico'nun kendi verisidir; yalnız birini okumak, adı yanlışsa her
 * ödemeyi "kanıtsız" sayardı.
 */
function basariliOdemeDenemesiMi(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false;
  const x = d as Record<string, unknown>;
  return x.paymentStatus === 'SUCCESS' || x.paymentAttemptStatus === 'SUCCESS';
}

/**
 * REDDEDİLMİŞ deneme: durum değeri VAR ve SUCCESS değil. Değerin kendisi
 * ölçülmedi ('FAILURE' / 'FAILED'), o yüzden adıyla aranmaz. Değeri olmayan
 * (biçimi bilinmeyen) deneme ret SAYILMAZ — tahmin yürütülmez.
 */
function reddedilmisOdemeDenemesiMi(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false;
  const x = d as Record<string, unknown>;
  const degerler = [x.paymentStatus, x.paymentAttemptStatus].filter((s) => typeof s === 'string' && s !== '');
  return degerler.length > 0 && !degerler.includes('SUCCESS');
}

/** Ödendi mi? `orderStatus: 'SUCCESS'` VE en az bir SUCCESS ödeme denemesi. SAF. */
export function odenmisSiparisMi(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  if (o.orderStatus !== 'SUCCESS') return false;
  return Array.isArray(o.paymentAttempts) && o.paymentAttempts.some(basariliOdemeDenemesiMi);
}

/**
 * iyzico'nun sipariş listesinde kodu BİREBİR eşleşen sipariş. SAF.
 * Kod boş ya da dize değilse eşleşme YOK: `orderReferenceCode` taşımayan
 * gövde, listede kodu eksik bir siparişe (`undefined === undefined`) bağlanamaz.
 */
export function siparisiBul<T>(siparisler: readonly T[] | null | undefined, kod: unknown): T | undefined {
  if (!Array.isArray(siparisler) || typeof kod !== 'string' || kod === '') return undefined;
  return siparisler.find(
    (s) => !!s && typeof s === 'object' && (s as { referenceCode?: unknown }).referenceCode === kod,
  );
}

/**
 * Başarısızlık bildiriminin iyzico'daki karşılığı:
 *  · KANITLI  — iyzico reddi doğruluyor → dunning başlar.
 *  · ODENMIS  — anılan sipariş ÖDENMİŞ → bildirim eskimiş ya da sahte; durum
 *               DEĞİŞMEZ, yeniden denenmez.
 *  · KANITSIZ — henüz kanıt yok → olay yeniden denenir.
 */
export type BasarisizlikKarari = 'KANITLI' | 'ODENMIS' | 'KANITSIZ';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BAŞARISIZLIK KANITI (24.09.2026) — SAF
 * ═══════════════════════════════════════════════════════════════════════════
 *  ESKİ HÂL: `tahsilatBasarisiz` iyzico'ya HİÇ sormuyordu — abonelik kodunu
 *  anan her gövde AKTIF/DENEME'yi ODEME_BEKLIYOR'a atıp dunning'i başlatıyordu.
 *  Gece mutabakatı bunu artık geri almıyor (kanıtsız terfi yok, Emre 24.09):
 *  ödeyen müşteri 10. gün KISITLI, 30. gün ASKIDA.
 *
 *  KARAR, SIRAYLA:
 *   1. Anılan sipariş ÖDENMİŞ → ODENMIS. Bildirim eskimiş (ilk deneme
 *      reddedildi, yeniden deneme tuttu) ya da sahte. ABONELİK DURUMUNDAN
 *      ÖNCE gelir: iyzico aboneliği henüz UNPAID gösterse de BU sipariş için
 *      dunning başlamaz — başka bir siparişin reddi kendi bildirimiyle ya da
 *      gece mutabakatının UNPAID dalıyla gelir.
 *   2. Abonelik `UNPAID` → KANITLI (iyzico'nun kendi hükmü).
 *   3. Sipariş listede, ödenmemiş VE iyzico ÇEKİM DENEMİŞ: `orderStatus`
 *      'FAILED' ya da değeri SUCCESS olmayan en az bir deneme → KANITLI.
 *   4. Diğer her şey → KANITSIZ: sipariş listede yok ya da çekim denenmemiş.
 *      ⚠ "Listede ve SUCCESS değil" YETMEZ: tutanakta ACTIVE abonelikte
 *      denemesiz WAITING sipariş var ve iyzico sonraki dönemi önceden açar —
 *      o siparişi anan sahte ret kanıt sayılırdı. Çekimi denenmemiş sipariş
 *      reddedilmiş olamaz.
 *  KANITSIZ yeniden denenir (işleyici 5 kez); ret gerçekse iyzico UNPAID der
 *  ve gece mutabakatı da ODEME_BEKLIYOR + `ilkBasarisizlik` yazar (ikiz yol).
 *  Büyük/küçük harf: iyzico büyük harf yazar; 'unpaid' kanıt SAYILMAZ.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function tahsilatBasarisizligiKarari(
  detay: unknown,
  siparisKodu: unknown,
): { karar: BasarisizlikKarari; gerekce: string } {
  const d = detay && typeof detay === 'object' ? (detay as Record<string, unknown>) : {};
  const siparis = siparisiBul(Array.isArray(d.orders) ? (d.orders as unknown[]) : undefined, siparisKodu) as
    | Record<string, unknown>
    | undefined;
  const abonelik = typeof d.subscriptionStatus === 'string' ? d.subscriptionStatus : '?';
  const siparisDurumu = siparis ? `orderStatus ${String(siparis.orderStatus ?? '?')}` : 'listede yok';

  if (siparis && odenmisSiparisMi(siparis)) {
    return { karar: 'ODENMIS', gerekce: `sipariş ödenmiş (${siparisDurumu}, başarılı deneme var), abonelik ${abonelik}` };
  }
  if (d.subscriptionStatus === 'UNPAID') {
    return { karar: 'KANITLI', gerekce: `abonelik UNPAID (sipariş ${siparisDurumu})` };
  }
  const cekimReddedildi =
    !!siparis &&
    (siparis.orderStatus === 'FAILED' ||
      (Array.isArray(siparis.paymentAttempts) && siparis.paymentAttempts.some(reddedilmisOdemeDenemesiMi)));
  if (cekimReddedildi) {
    return { karar: 'KANITLI', gerekce: `sipariş reddedildi (${siparisDurumu}), abonelik ${abonelik}` };
  }
  return { karar: 'KANITSIZ', gerekce: `sipariş ${siparisDurumu}, reddedilmiş çekim yok; abonelik ${abonelik}` };
}
