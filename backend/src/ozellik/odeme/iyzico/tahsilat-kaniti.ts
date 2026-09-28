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
 *   · `yenidenDenemeHedefi` — yeniden denemenin (anlık 26.09, merdiven 28.09)
 *     hedef siparişi: bildirimlerdeki adaylardan iyzico'nun listesinde doğrulanan.
 *   · `tahsilEdilenTutar` · `odemeAni` — FATURANIN iki gerçeği (28.09):
 *     çekilen tutar + para birimi ve ödeme anı (aşağıdaki not).
 *   · `sonrakiDonemIslenmisMi` — ESKİ DÖNEM (28.09): ödenmiş sipariş bugünkü
 *     hâli (dunning, durum) değiştirebilir mi (dosya sonu).
 *
 *  ÖLÇÜLDÜ (20.08 sandbox, docs/adim0-tutanak/adim0-ek-cikti.json):
 *   · ödenmiş sipariş: `orderStatus: 'SUCCESS'` + `paymentAttempts[{paymentStatus: 'SUCCESS'}]`;
 *   · ACTIVE abonelikte `orderStatus: 'WAITING'`, `paymentAttempts: []`
 *     (TEST 2-dogrulama) — ACTIVE, ödemenin kanıtı DEĞİLDİR;
 *   · iyzico sonraki dönemin siparişini ÖNCEDEN açar (UPGRADED abonelikte
 *     `SUBSCRIPTION_UPGRADED`, deneme yok — TEST 2-dogrulama-2).
 *  BELGEDE ama ÖLÇÜLMEDİ (canlıda başarısız sipariş yok, 28.09): iyzico
 *  "Abonelik İşlemleri" → Abonelik Detayı şeması (docs.iyzico.com/urunler/
 *  abonelik/abonelik-entegrasyonu/abonelik-islemleri, 28.09 okundu) —
 *  `orderStatus` WAITING · SUCCESS · FAILED; deneme `paymentStatus` SUCCESS ·
 *  FAILED, `errorCode`/`errorMessage` yalnız FAILED'de; yeniden denemenin
 *  `referenceCode`u = başarısızlık webhook'unun `orderReferenceCode`u. Örnek
 *  JSON yok. ÖLÇÜLMEDİ: bildirimin iyzico listesinden ÖNCE gelip gelmediği.
 *
 *  Kapılar: `test:webhook-tahsilat-dogrulama` (S + webhook/mutabakat bağlantısı),
 *  `test:mutabakat-kayip-tahsilat` S, `test:fatura-dogrulugu` S.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { iyzicoTarihi } from './iyzico-tarihi';

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
 * Çekimi REDDEDİLDİ mi (siparişin kendi kaydı): `orderStatus` 'FAILED' ya da
 * değeri SUCCESS olmayan en az bir deneme. Başarısızlık kanıtının sipariş
 * kuralı (aşağıda, kural 3) ve eski dönem kuralı bunu okur — ikiz yok. SAF.
 */
function cekimiReddedilmisMi(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    o.orderStatus === 'FAILED' ||
    (Array.isArray(o.paymentAttempts) && o.paymentAttempts.some(reddedilmisOdemeDenemesiMi))
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FATURANIN İKİ GERÇEĞİ: ÇEKİLEN TUTAR + ÖDEME ANI (28.09.2026) · SAF
 * ═══════════════════════════════════════════════════════════════════════════
 *  ÖLÇÜLDÜ (20.08 sandbox, docs/adim0-tutanak/*.json, 5 sipariş): tutar
 *  `price` (SAYI: 199 · 89.9 · 49.9) + `currencyCode` ('TRY'); `paidPrice`
 *  HİÇ görülmedi (istemci tipinde var). Ödeme denemesi tutar TAŞIMAZ:
 *  `{conversationId, createdDate (epoch ms), paymentId, paymentStatus}`.
 *
 *  ESKİ HÂL — ÜÇ AYRI KURAL: fatura `paidPrice ?? paket fiyatı` okuyordu —
 *  ölçülen `price`ı ATLAYIP aboneliğin O ANKİ paketinin fiyatını yazıyordu;
 *  tahsilat olayı ve havale ↔ kart bildirimi `paidPrice ?? price`. Kural
 *  artık TEK: `paidPrice` (ödeme API'sinde müşteriden çekilen) GELDİYSE o —
 *  okunamıyorsa `price`a düşülmez —, gelmediyse `price`. Emre kararı
 *  (28.09): tutar okunamazsa fatura kuyruğa ALINMAZ —
 *  paket fiyatı UYDURULMAZ (`WebhookIsleyici` yöneticiye son günlü uyarı
 *  yazar; gece mutabakatı böyle siparişi OYNATMAZ, "elle fatura" sayar —
 *  kural 7).
 *
 *  Ödeme anı VUK md. 231/5 son düzenleme gününün (7 gün) başlangıcıdır.
 *  Satır eskiden onu TAŞIMIYORDU; e-posta min(kuyruk, dönem başı) yazıyordu —
 *  yeniden denemeyle toparlanan tahsilatta gerçek ödemeden günler önce.
 *  Kapı: `test:fatura-dogrulugu`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Sonlu, sıfırdan büyük sayı ya da rakam-dizesi ("1649.00"); aksi hâlde null — uydurma yok. */
function tutarSayisi(v: unknown): number | null {
  const n =
    typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Tahsil edilen tutar (KDV DAHİL) ve para birimi — iyzico siparişinin KENDİ
 * kaydından. Tutar yoksa null; para birimi yoksa `paraBirimi: null` (çağıran
 * paketin para birimine düşer — iki alan da ölçümde her siparişte vardı). SAF.
 */
export function tahsilEdilenTutar(s: unknown): { tutar: number; paraBirimi: string | null } | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  // `paidPrice` GELDİYSE söz onundur: okunamıyorsa (0, bozuk) `price`a
  // DÜŞÜLMEZ — liste fiyatı çekilen tutar olmayabilir (indirim); o hâlde
  // çekilen tutar bilinmiyor demektir.
  const tutar =
    o.paidPrice !== undefined && o.paidPrice !== null ? tutarSayisi(o.paidPrice) : tutarSayisi(o.price);
  if (tutar === null) return null;
  const pb = typeof o.currencyCode === 'string' && o.currencyCode.trim() !== '' ? o.currencyCode.trim() : null;
  return { tutar, paraBirimi: pb };
}

/**
 * Ödeme anı — siparişin ÖDENDİĞİ an: BAŞARILI ödeme denemesinin
 * `createdDate`i (tarih `iyzicoTarihi` ile çözülür). Birden çoksa İLKİ:
 * sipariş o an ödendi, ikinci başarılı deneme çift çekimdir (ölçülmedi) ve
 * VUK son günü İLK ödemeden sayılır — sonrakini seçmek süreyi uzatırdı
 * (28.09 kod incelemesi). Çözülemezse null: çağıran dönem başına düşer
 * (iyzico dönem başında çeker). SAF.
 */
export function odemeAni(s: unknown): Date | null {
  if (!s || typeof s !== 'object') return null;
  const denemeler = (s as Record<string, unknown>).paymentAttempts;
  if (!Array.isArray(denemeler)) return null;
  let ilk: Date | null = null;
  for (const d of denemeler) {
    if (!basariliOdemeDenemesiMi(d)) continue;
    const an = iyzicoTarihi((d as Record<string, unknown>).createdDate);
    if (an && (!ilk || an < ilk)) ilk = an;
  }
  return ilk;
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
  if (cekimiReddedilmisMi(siparis)) {
    return { karar: 'KANITLI', gerekce: `sipariş reddedildi (${siparisDurumu}), abonelik ${abonelik}` };
  }
  return { karar: 'KANITSIZ', gerekce: `sipariş ${siparisDurumu}, reddedilmiş çekim yok; abonelik ${abonelik}` };
}

/** Yeniden denemenin (anlık + merdiven) hedefi: dene / zaten ödenmiş / doğrulanamadı. */
export type DenemeHedefi =
  | { tur: 'dene'; kod: string; gerekce: string }
  | { tur: 'odenmis'; kod: string; gerekce: string }
  | { tur: 'yok'; gerekce: string };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YENİDEN DENEMENİN HEDEFİ — anlık (26.09) + merdiven (28.09) · SAF
 * ═══════════════════════════════════════════════════════════════════════════
 *  Adaylar: bu aboneliğin başarısızlık BİLDİRİMLERİNDEKİ sipariş kodları,
 *  YENİDEN ESKİYE. Bildirim kanıt DEĞİLDİR (uç açık, imza zorunlu değil):
 *  sahte, eskimiş ya da sonradan ödenmiş olabilir. Para çeken İKİ yol —
 *  anlık deneme ve (28.09'dan beri) dunning merdiveni, ikisi de
 *  `DunningServisi.hedefiDogrula` — karar vermeden iyzico'nun KENDİ listesine bakar:
 *   · listede OLMAYAN aday atlanır (sahte ya da başka aboneliğin kodu);
 *   · ESKİ DÖNEM adayı atlanır (28.09, `sonrakiDonemIslenmisMi` — webhook'un
 *     ret ve başarı yollarıyla TEK kural, UNPAID genişlemesi OLMADAN): sonraki
 *     dönemi başlamış ve iyzico'da işlenmiş sipariş, ödenmiş olsun olmasın,
 *     karar VERMEZ. Reddedilmişse yeniden çekilmez (geçmiş dönemin parası);
 *     ödenmişse "ödenmiş" SAYILMAZ — bugünkü borcu gizlerdi: başarı yolu eski
 *     dönemde döngüyü sıfırlamadığı için merdiven her gün "ödenmiş" deyip ne
 *     çekerdi ne bildirirdi. Genişleme bilerek YOK: dönemi bitmiş başarısız
 *     sipariş (kartını 40. günde güncelleyen ASKIDA müşteri) denenmez olurdu;
 *   · listede olan İLK (en yeni) GÜNCEL aday karar verir:
 *       ödenmiş               → `odenmis` (bekleyen ödeme yok; başarı yolu
 *                               kuyruğa yazılır, yeniden ÇEKİLMEZ);
 *       ödenmemiş + KANITLI   → `dene`;
 *       ödenmemiş + KANITSIZ  → `yok` (ret doğrulanamadı; para çekilmez);
 *   · hiçbiri listede değil  → `yok`.
 *  ⚠ "Listede ve ödenmemiş" TEK BAŞINA yetmez: ACTIVE abonelikte denemesiz
 *  WAITING sipariş olur (`tahsilatBasarisizligiKarari` kural 4) — ret kararı
 *  aynı fonksiyondan, ikiz kural yok.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function yenidenDenemeHedefi(
  detay: unknown,
  adaylar: readonly unknown[],
  simdi: Date = new Date(Date.now()),
): DenemeHedefi {
  const d = detay && typeof detay === 'object' ? (detay as Record<string, unknown>) : {};
  const siparisler = Array.isArray(d.orders) ? (d.orders as unknown[]) : undefined;
  let eski = 0;
  for (const aday of adaylar) {
    const siparis = siparisiBul(siparisler, aday);
    if (!siparis) continue;
    if (sonrakiDonemIslenmisMi(siparisler, siparis, simdi)) {
      eski++;
      continue;
    }
    const kod = aday as string;
    if (odenmisSiparisMi(siparis)) return { tur: 'odenmis', kod, gerekce: `sipariş ${kod} iyzico'da ödenmiş` };
    const k = tahsilatBasarisizligiKarari(detay, kod);
    return k.karar === 'KANITLI'
      ? { tur: 'dene', kod, gerekce: k.gerekce }
      : { tur: 'yok', gerekce: `sipariş ${kod}: ${k.gerekce}` };
  }
  return {
    tur: 'yok',
    gerekce: eski
      ? `${adaylar.length} adaydan ${eski}'i eski dönem (sonraki dönem işlenmiş), gerisi iyzico listesinde yok`
      : `${adaylar.length} adayın hiçbiri iyzico listesinde yok`,
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ESKİ DÖNEM — sonraki dönemi iyzico'da İŞLENMİŞ ödenmiş sipariş (28.09.2026) · SAF
 * ═══════════════════════════════════════════════════════════════════════════
 *  Listede bu siparişten SONRA başlayan bir dönemin siparişi iyzico'da zaten
 *  İŞLENMİŞSE (ödenmiş ya da çekimi reddedilmiş) bu sipariş ESKİ DÖNEMDİR:
 *  ödeme gerçektir ama aboneliğin BUGÜNKÜ hâli hakkında bir şey söylemez.
 *  `yenidenDenemeHedefi` böyle adayı atlar (yeniden çekmez, "ödenmiş" saymaz).
 *  `AbonelikServisi.tahsilatBasarili` böyle siparişle dunning'i SIFIRLAMAZ,
 *  durumu DEĞİŞTİRMEZ (24.09 yoklaması, ölçüldü: eski ödenmiş siparişi anan
 *  gövde KISITLI satırı AKTIF'e çekiyor, dunning'i sıfırlıyordu; ertesi gece
 *  UNPAID yeni bir TAM erişimli tolerans açıyordu — tekrarlanabilir).
 *
 *   · "Sonra başlayan": `startPeriod` bu siparişinkinden BÜYÜK. Dönem sınırı
 *     eşitliğine (`startPeriod(n+1) = endPeriod(n)`, 20.08 tutanağı) DAYANMAZ.
 *   · ⭐ "Başlamış": sonraki siparişin `startPeriod`u `simdi`den büyük DEĞİL.
 *     Vadesi gelmemiş dönem hiçbir şeyi eskitmez: iyzico önceden açtığı
 *     siparişi abonelik UNPAID'e düşünce reddedilmiş işaretlerse (biçimi
 *     ÖLÇÜLMEDİ) reddedilen dönemin gerçek ödemesi "eski" sayılır, müşteri
 *     ödediği hâlde dunning'den hiç çıkamazdı (28.09 kod incelemesi).
 *   · "İşlenmiş": ödenmiş (`odenmisSiparisMi`) ya da çekimi reddedilmiş
 *     (`cekimiReddedilmisMi` — başarısızlık kanıtının sipariş kuralı).
 *     iyzico'nun ÖNCEDEN açtığı denemesiz WAITING sipariş SAYILMAZ: dunning'den
 *     çıkaran gerçek ödemenin listesinde de bulunur (tutanak: sonraki dönem
 *     önceden açılır).
 *   · ⭐ Abonelik UNPAID iken (`abonelikDurumu`) başlamış HER sonraki sipariş
 *     işlenmiş sayılır; siparişin KENDİ dönemi bitmişse (`endPeriod` ≤
 *     `simdi`) sonraki dönem listede OLMASA da eskidir. Dunning abonelik
 *     UNPAID'iyle de başlar (başarısızlık kanıtı kural 2 — reddedilen sipariş
 *     listede yok ya da denemesiz WAITING olabilir, biçim ÖLÇÜLMEDİ); o hâlde
 *     eski ödenmiş siparişin tekrarı döngüyü sıfırlardı (28.09 güvenlik ve
 *     kod incelemesi). UNPAID'de dönemi süren ödeme (iyzico'nun durumu
 *     gecikmiş) eski DEĞİLDİR: döngüyü kapatır. Durumu YALNIZ başarı yolu
 *     geçirir: ret yolunda UNPAID genişlemesi kimseyi korumaz (iyzico
 *     "ödenmedi" derken eski ret gerçeğe aykırı değil), dunning'i geciktirirdi.
 *   · Tarih `iyzicoTarihi` ile (sayı · rakam-dizesi · ISO); çözülemeyen
 *     başlangıç karşılaştırılmaz — eski SAYILMAZ, tahmin yürütülmez.
 *
 *  İKİZİ VAR (bilinçli, birleştirme ayrı iş): gece mutabakatının kural 7e
 *  engeli `sonrakiDonemDenendiMi` (mutabakat.job.ts) — `startPeriod ≥
 *  endPeriod` ve ödeme DENEMESİ arar, vade denetimi yok. Birleştirmek 7e'nin
 *  oynatma kararını değiştirir (o kapılar yeniden ölçülmeli).
 *  BİLİNEN SINIR: yalnız AYNI aboneliğin (iyzico'ya sorulan kodun) listesine
 *  bakar; paket değişimi zincirinin ESKİ halkasının siparişini
 *  `tahsilatBasarili` ödeme sorunu olan satırda bu kurala sormadan eski
 *  dönem sayar (değişim o satırda reddedilir; döngü yeni ucundur). Sorunsuz
 *  satırda eski halkanın geç bildirimi olağan yenilemedir.
 *  Kapı: `test:webhook-tahsilat-dogrulama` S5-S6 + R.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function sonrakiDonemIslenmisMi(
  siparisler: unknown,
  siparis: unknown,
  simdi: Date = new Date(Date.now()),
  abonelikDurumu?: unknown,
): boolean {
  if (!Array.isArray(siparisler) || !siparis || typeof siparis !== 'object') return false;
  const bas = iyzicoTarihi((siparis as Record<string, unknown>).startPeriod);
  if (!bas) return false;
  const abonelikOdenmemis = abonelikDurumu === 'UNPAID';
  const son = iyzicoTarihi((siparis as Record<string, unknown>).endPeriod);
  if (abonelikOdenmemis && son && son.getTime() <= simdi.getTime()) return true;
  return siparisler.some((s) => {
    if (!s || typeof s !== 'object') return false;
    const sonrakiBas = iyzicoTarihi((s as Record<string, unknown>).startPeriod);
    return (
      !!sonrakiBas &&
      sonrakiBas > bas &&
      sonrakiBas.getTime() <= simdi.getTime() &&
      (abonelikOdenmemis || odenmisSiparisMi(s) || cekimiReddedilmisMi(s))
    );
  });
}
