import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikDurumu, Prisma } from '@prisma/client';
import { IyzicoAbonelikDetayi, IyzicoClient } from '../iyzico/iyzico.client';
import type { AbonelikWebhookGovdesi } from '../iyzico/imza';
import { iyzicoTarihi } from '../iyzico/iyzico-tarihi';
import { odenmisSiparisMi } from '../iyzico/tahsilat-kaniti';
import { AZAMI_DENEME as WEBHOOK_AZAMI_DENEME } from '../webhook/webhook.isleyici';
import { AbonelikServisi, iyzicoDurumunuYorumla } from './abonelik.servisi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Mutabakat işi — İSTEĞE BAĞLI DEĞİL, ZORUNLU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  iyzico'nun abonelik webhook'unda YALNIZCA İKİ olay tipi var:
 *      subscription.order.success
 *      subscription.order.failure
 *
 *  Yani şunların HİÇBİRİ size webhook olarak gelmez:
 *      • müşteri iyzico panelinden aboneliği iptal etti
 *      • abonelik süresi doldu (EXPIRED)
 *      • abonelik UNPAID durumuna düştü
 *      • paket değişti (UPGRADED)
 *
 *  Bunları öğrenmenin tek yolu iyzico'ya sormaktır. Bu iş onu yapar.
 *  Çalıştırmazsanız, iptal eden müşteri süresiz erişmeye devam eder.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DENEME SÜRERKEN iyzico'nun ACTIVE'i "ÖDENDİ" DEMEK DEĞİLDİR (23.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  iyzico'da TRIAL diye bir abonelik durumu YOK. Abonelik detayındaki
 *  `subscriptionStatus` altı değerden biridir (ACTIVE · PENDING · UNPAID ·
 *  UPGRADED · CANCELED · EXPIRED); deneme bilgisi AYRI alanlarda taşınır
 *  (`trialDays` · `trialStartDate` · `trialEndDate`). Resmî doküman
 *  (docs.iyzico.com › Abonelik İşlemleri, 23.09'da okundu): abonelik her
 *  zaman ACTIVE ya da PENDING başlar; "durum ACTIVE ancak ödeme planında bir
 *  deneme süresi belirtilmişse" iyzico yalnız kartı doğrular (1 TL çekip iade
 *  eder), tahsilat yapmaz.
 *
 *  Aboneliği `subscriptionInitialStatus: 'ACTIVE'` ile başlatıyoruz
 *  (`iyzico.client.ts` → `abonelikBaslat`), yani deneme boyunca iyzico ACTIVE
 *  der. Kendi sandbox tutanağımız (20.08) ACTIVE'in ödeme kanıtı olmadığını
 *  gösteriyor: abonelik DETAYI — bu işin sorduğu uç — tek siparişi WAITING ve
 *  ödeme denemesi YOKKEN ACTIVE döndü (docs/adim0-tutanak/adim0-ek-cikti.json,
 *  "TEST 2-dogrulama"); NEXT_PERIOD yükseltme YANITI da henüz başlamamış
 *  (startDate ileride) aboneliği ACTIVE gösterdi (adim0-cikti.json, "S2a").
 *  ⚠ Denemeli abonelik sandbox'ta ÖLÇÜLMEDİ (tutanaktaki planların hepsi
 *  `trialDays: 0`); deneme için dayanak dokümandır.
 *
 *  ESKİ HAL: `iyzicoDurumunuYorumla` ACTIVE'i AKTIF okuyor, DENEME → AKTIF de
 *  geçerli bir geçiş olduğu için deneme İLK GECE AKTIF'e çekiliyordu:
 *   · "Deneme sürenizin bitmesine X gün kaldı" uyarısı (`ErisimServisi.karar`,
 *     DENEME dalı) hiç görünmüyordu — müşteri ilk çekimden önce uyarılmıyordu;
 *   · Hesabım rozeti "Deneme" yerine "Aktif" diyordu;
 *   · satır DENEME yaşam döngüsünden çıkıyordu: saatlik `suresiDolanlariKapat`
 *     yalnız DENEME/IPTAL kapatır — deneme sonunda iyzico'ya ulaşılamazsa
 *     satır SONA_ERDI yerine süresi geçmiş AKTIF olarak kalırdı.
 *
 *  KURAL: `denemeSonu` gelmemiş DENEME satırı ACTIVE ile AKTIF'e ÇEKİLMEZ.
 *  DENEME → AKTIF'in kanıtı TAHSİLATTIR — başarılı tahsilat webhook'u
 *  (`AbonelikServisi.tahsilatBasarili`, sipariş iyzico'nun listesinde
 *  doğrulanarak) satırı AKTIF'e çeker. Kapsam BİLEREK dar:
 *   · Yalnız ACTIVE → AKTIF bastırılır. UNPAID/CANCELED/EXPIRED deneme içinde
 *     de işlenir (iptal ve ödeme sorunu denemede de gerçektir).
 *   · Deneme BİTTİKTEN sonra da çıplak ACTIVE AKTIF'e çekmez (24.09, aşağıdaki
 *     KAYIP TAHSİLAT notu, kural 5). İlk çekimin webhook'u kaybolduysa bu iş
 *     çekimi iyzico'nun sipariş listesinde bulur ve tahsilat yolunu yeniden
 *     oynatır — `erisimSonu` ve fatura o yoldan yazılır.
 *   · `denemeSonu` boş DENEME satırını bu kural korumaz (sayacında görünmez);
 *     çıplak ACTIVE onu da AKTIF'e çekmez (kural 5). Bugün kart aboneliğinde
 *     DENEME'yi yalnız satın alma açar ve `denemeSonu`nu her zaman yazar
 *     (`satinalma.servisi.ts` → `donemTarihleriHesapla`).
 *
 *  SAF — DB'siz ölçülür: `test:mutabakat-deneme`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function denemeSuruyorMu(
  ab: { durum: AbonelikDurumu | string; denemeSonu: Date | null | undefined },
  simdi: Date,
): boolean {
  if (ab.durum !== AbonelikDurumu.DENEME) return false;
  const son = ab.denemeSonu?.getTime?.();
  // Eksik/bozuk tarih "deneme sürüyor" SAYILMAZ: kural yalnız bitişi BİLİNEN
  // denemeyi korur (bkz. kapsam).
  if (typeof son !== 'number' || Number.isNaN(son)) return false;
  return son > simdi.getTime();
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KAYIP TAHSİLAT WEBHOOK'U — MUTABAKAT YENİDEN OYNATIR (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ÖLÇÜLEN KUSUR (`test:mutabakat-kayip-tahsilat`, eski hâl 10 kırmızı):
 *  ödenmiş dönemi `erisimSonu`na yazan, faturayı kuyruğa alan ve dunning
 *  sayaçlarını sıfırlayan TEK yol başarılı tahsilat webhook'udur
 *  (`WebhookIsleyici` → `AbonelikServisi.tahsilatBasarili` +
 *  `FaturaServisi.kuyrugaAl` + `DunningServisi.tahsilatToparlandi`). iyzico
 *  webhook'u ~3 denemede (~45 dk) bırakır; işleyici yalnız ALDIĞIMIZ olayı
 *  yeniden dener. Bu iş ise `erisimSonu`na yalnız İPTAL dalında dokunuyordu.
 *  Webhook'u kaybolan (kesinti, deploy) ödeyen müşteri:
 *   · AKTIF: `erisimSonu`nu geçip "Abonelik döneminiz doğrulanıyor"
 *     ekranında erişimsiz kalıyordu; fatura HİÇ kuyruğa girmiyordu;
 *   · deneme sonrası: satır yalnız DURUM olarak AKTIF oluyordu, tampon
 *     bitince erişim kapanıyordu; fatura yoktu;
 *   · ODEME_BEKLIYOR (tolerans, TAM erişim): çıplak ACTIVE satırı AKTIF'e
 *     çekiyordu; `erisimSonu` geride kaldığı için ÖDEYEN MÜŞTERİYİ bu iş
 *     KİLİTLİYORDU.
 *
 *  KURAL (Emre kararı 24.09 — "yeniden oynat + kanıtsız terfi yok"):
 *   1. KANIT iyzico'nun KENDİ sipariş listesidir, webhook gövdesi değil (bkz.
 *      `tahsilatBasarili` güvenlik notu): `orderStatus: 'SUCCESS'` VE en az bir
 *      SUCCESS ödeme denemesi olan sipariş ödenmiştir (`odenmisSiparisMi`,
 *      `iyzico/tahsilat-kaniti.ts` — tahsilat webhook'uyla TEK kural).
 *      Yalnız iyzico ACTIVE derken aranır.
 *   2. Ödenmiş siparişin dönem sonu `erisimSonu`ndan SONRAYSA tahsilat
 *      kaybolmuştur: bu iş `WebhookOlayi`na `kaynak: 'mutabakat'` satırı yazar,
 *      webhook işleyicisi dakikalık taramasında AYNI yolu koşar. İkinci bir
 *      "tahsilatı uygula" kuralı YAZILMADI — bu deponun ölçülmüş hata sınıfı
 *      (ikiz kural). Fatura tekilliği `Fatura.tahsilatKodu`, yeniden deneme
 *      işleyicinin (5 kez), iz `WebhookOlayi` satırının kendisidir. ⚠ Oynatılan
 *      olay İMZASIZDIR (`imzaGecerli` varsayılanı false): işleyici bir gün
 *      imzaya göre süzülürse bu yol SESSİZCE durur — süzgeç `kaynak`a da bakmalı.
 *   3. `erisimSonu` ASLA kısalmaz: tetik yalnız `>`; eşit ya da eski sipariş
 *      oynatılmaz. Birden fazla sipariş uzatıyorsa (iş bir dönem boyu
 *      koşmadıysa) yalnız EN YENİSİ oynatılır — eskisini sonra işlemek
 *      erişimi geri çekerdi; eskilerin faturası için UYARI yazılır.
 *   4. Aynı sipariş için TEK olay yazılır (`tekilAnahtar` =
 *      `mutabakat:subscription.order.success:<sipariş>`). Oynatılan olay
 *      işlenemediyse (5 deneme, ~5 dk) sonraki gece YENİDEN KURULUR (deneme
 *      sayacı sıfırlanır) ve UYARI düşer: gece koşumu işleyicinin geri
 *      çekilmesidir — 03:30'daki kısa bir iyzico kesintisi ödemeyi kalıcı
 *      olarak kaybettiremez. İşlenmiş ama erişim yine kısaysa yalnız UYARI.
 *   5. KANITSIZ TERFİ YOK: çıplak ACTIVE (erişimi uzatan ödenmiş sipariş yok)
 *      DENEME, ODEME_BEKLIYOR, KISITLI ve ASKIDA satırını AKTIF'e ÇEKMEZ —
 *      ACTIVE "iptal/durdurulmuş değil" demektir, "ödendi" değil (bkz. deneme
 *      notu). Tek istisna IPTAL → AKTIF: müşteri vazgeçti; yeni ödeme yok,
 *      ödenmiş dönem zaten `erisimSonu`nda.
 *   6. KORUMA (Emre kararı 24.09, "kural kalsın, koruma ekle"): kural 5
 *      yüzünden deneme sonrası satır kanıt 2 günlük tamponda bulunamazsa
 *      saatlik işte SONA_ERDI olur. iyzico'da hâlâ ACTIVE görünen SONA_ERDI
 *      satırı da gece TARANIR — yalnız kaybolmuş tahsilatı oynatmak için
 *      (durumu başka türlü değişmez, kanıt yoksa UYARI). Aynı satırda
 *      yeniden satın alma KAPALIDIR (paket-degisimi.ts →
 *      `iyzicoAboneligiAcikMi`): yeni abonelik eskisini sahipsiz bırakır,
 *      iyzico ikisinden de çeker.
 *
 *  BİLİNEN SINIRLAR (ölçüldü/okundu, bu işte DEĞİŞTİRİLMEDİ):
 *   · Yalnız ACTIVE'de aranır: bir yenilemenin webhook'u kaybolup SONRAKİ
 *     yenileme reddedildiyse (UNPAID) eski siparişin faturası kuyruğa girmez.
 *     `tahsilatBasarili` her zaman AKTIF'e çeker; UNPAID satırı AKTIF yapmak
 *     dunning'i silerdi.
 *   · ✓ KAPANDI 26.09 (kural 7, aşağıdaki not): erişim siparişin dönem
 *     sonundan zaten İLERİDEYSE (miras satırı, denemesiz satın almanın ilk
 *     siparişi) tetik yoktu — faturası olmayan ödenmiş sipariş artık sayılır.
 *   · Kilitli müşteri iptal ederse: yenilemesi ödenmiş ama webhook'u kaybolmuş
 *     müşteri "doğrulanıyor" ekranında iptal ederse satır IPTAL, sonra
 *     SONA_ERDI olur; iyzico CANCELED der — o dönem ne verilir ne faturalanır.
 *   · İPTAL dalındaki `endDate`in anlamı (dönem sonu mu, iptal anı mı)
 *     ÖLÇÜLMEDİ (okuma 24.09'dan beri `iyzicoTarihi`nden geçer).
 *   · iyzico kodu HİÇ döndüremezse (ör. sandbox → canlı anahtar geçişinde eski
 *     kodlar) SONA_ERDI + 'ACTIVE' satır her gece hata yazar ve yeniden alım
 *     kapısı kapalı kalır — geçiş adımı `iyzicoDurum`u temizlemeli.
 *   · Havale onayı kart aboneliğine bakmaz: iyzico'su açık bir firmaya havale
 *     satılırsa kart da çekilmeye devam eder (bu işten ÖNCE de vardı) — ayrı iş.
 *   · ✓ KAPANDI 24.09 (`test:webhook-tahsilat-dogrulama`): tahsilat yolu
 *     artık aynı kanıtı ister (`tahsilatBasarili` ödenmemiş siparişi
 *     reddeder); `tahsilatBasarisiz` iyzico'dan doğrular
 *     (`tahsilatBasarisizligiKarari` — kanıtsız bildirim durumu değiştirmez,
 *     böylece kural 5'in geri almadığı sahte ret artık hiç yazılmaz); tahsilat
 *     yolundaki tarih okumaları (`endPeriod`, `startPeriod`, bu işin `endDate`i,
 *     gövdenin `iyziEventTime`ı) `iyzicoTarihi`nden geçer.
 *   · (KAPANDI 24.09, `995736a`) "Toparlandı" e-postası hiç gitmiyordu:
 *     dunning düzeltmesi dunning'den çıkışı sıfırlamanın kendisinden bildirir
 *     (`dunningdenCikti`). İşleyici olay kaynağına göre dallanmadığı için
 *     oynatılan tahsilat da aynı yolu kullanır (okundu; bu işin testinde
 *     ayrıca ölçülmedi).
 *
 *  SAF parçalar DB'siz ölçülür: `test:mutabakat-kayip-tahsilat`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ERİŞİMİ UZATMAYAN KAYIP TAHSİLAT — FATURASIZ ÖDENMİŞ SİPARİŞ (26.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ÖLÇÜLEN KUSUR (`test:mutabakat-faturasiz-tahsilat`): kural 2 kaybı yalnız
 *  ERİŞİMDEN okuyordu (dönem sonu > `erisimSonu`). Erişim siparişten zaten
 *  İLERİDEYSE kaybolan webhook hiç görünmüyordu — özet satırı tamamen sıfır,
 *  UYARI yok, fatura yok (gerçek para çekilmiş, fatura yok):
 *   · miras (göç) satırı: satın alma ~1 yıllık erişimi KORUR (köprü NULL) —
 *     erişim bitene dek HER sipariş;
 *   · denemesiz satın almanın İLK siparişi (satın alma 31+2 gün köprü yazar,
 *     iyzico dönemi bir takvim ayı);
 *   · ⭐ miras satırı dunning'deyken merdivenin yeniden denemesi TUTTU ama
 *     webhook kayboldu: satır ODEME_BEKLIYOR'da kaldı (kural 5 çıplak ACTIVE
 *     ile çekmez) ve 10. gün KISITLI + "salt-okunur" e-postası — ÖDEMİŞ
 *     müşteriye (KISITLI/ASKIDA `erisimSonu`na bakmaz).
 *
 *  KURAL 7 (Emre kararı 26.09 — "aynı yol, süren dönem"):
 *   a. Faturası OLMAYAN (`Fatura.tahsilatKodu` = sipariş kodu yok) ve dönemi
 *      SÜREN (dönem sonu > şimdi) ödenmiş sipariş de kayıptır → kural 2'nin
 *      AYNI oynatması (tek olay, tek yol; ikinci "tahsilatı uygula" kuralı
 *      YOK). Sonuç, satır çekimden beri değişmediyse webhook o gece gelmiş
 *      hâliyle aynıdır: miras satırında köprü NULL → `tahsilatBasarili` yalnız
 *      uzatır, erişim DEĞİŞMEZ; köprü satırında satın almanın köprüsü iyzico
 *      dönemine düzelir (33 → 31 gün, tasarlanmış — `kopruErisimSonu`);
 *      dunning'deki satır toparlanır.
 *   b. Dönemi BİTMİŞ faturasız sipariş OYNATILMAZ: `tahsilatBasarili` satırı
 *      AKTIF'e çeker ve sayaçları sıfırlar — daha yeni bir reddin dunning'ini
 *      silerdi. Son `ELLE_FATURA_PENCERESI_GUN` gün içinde bittiyse UYARI
 *      ("elle fatura") + özet sayacı; daha eskisi tarihçedir (canlıdaki sandbox
 *      dönemi her gece uyarı üretmesin). Kural 3'ün eski uzatan siparişler
 *      uyarısı da artık yalnız FATURASIZ olanları sayar: faturası kuyruktaysa
 *      "elle fatura gerekir" yanlış olurdu.
 *   c. Deneme sürerken (`denemeSuruyorMu`) faturasız kuralı bakmaz: denemede
 *      tahsilat yoktur; deneme sonu çekimini kural 2 (erişimi uzatan) yakalar.
 *   d. Fatura, `tahsilatKodu` ile aranır (şemada @unique — `kuyrugaAl`
 *      tekilliğiyle AYNI anahtar), abonelik süzgeci YOK: sipariş başka bir
 *      satıra faturalandıysa da faturalıdır.
 *   e. ENGELLER (26.09 kod incelemesi) — süren faturasız sipariş şu hâllerde
 *      OYNATILMAZ, "elle fatura" uyarısına düşer (oynatma yanlış satır durumu
 *      üretirdi):
 *      · Sonraki dönemin çekimi DENENMİŞ (listede, başlangıcı bu siparişin
 *        dönem sonunda ya da sonrasında olan, ödeme denemesi taşıyan sipariş):
 *        iyzico'nun yenilemeyi dönem sonundan ne kadar ÖNCE çektiği ÖLÇÜLMEDİ;
 *        erken çekim reddedildiyse eski siparişi oynatmak o reddin dunning'ini
 *        siler, reddedilmiş müşteriye "ödemeniz alındı" gönderirdi. Önceden
 *        açılmış denemesiz WAITING sipariş (20.08 tutanağı) engel DEĞİLDİR.
 *      · Paket değişimi bekliyor (`paketGecisTarihi` dolu) ve sipariş geçişten
 *        ÖNCE başlamış: satırın kodu artık YENİ uçtur, oynatma olayı o kodla
 *        yazılır ve `tahsilatBasarili` onu yeni ucun tahsilatı sayar (kilit
 *        kalkar, paket ödenen plana hizalanır). Yeni ucun listesinde eski ucun
 *        siparişi görünür mü ÖLÇÜLMEDİ; görünürse bu yanlış olurdu. Yeni ucun
 *        kendi siparişi (başlangıcı ≥ geçiş) engellenmez — kilidi o kaldırır.
 *      · Son çekim denemesi `YOLDAKI_WEBHOOK_SAAT` saatten yeni: iyzico
 *        bildirimi ~45 dk yeniden gönderir; o gece "kayıp" sayılmaz, uyarı da
 *        yazılmaz (ertesi gece yeniden bakılır). Aynı siparişin gerçek ve
 *        oynatılmış olayı AYRI olaylardır — işleyicinin süreç içi kilidi
 *        ayırmaz; dunning'deki satırda iki "ödemeniz alındı" giderdi.
 *      Süren ama engelsiz, en yeni aday OLMAYAN faturasız sipariş uyarıya
 *      YAZILMAZ: sonraki gece oynatılır — "elle fatura" dese çift fatura olurdu.
 *
 *  BİLİNEN SINIRLAR:
 *   · Denemeli abonelikte kart doğrulaması (1 TL, iade) ödenmiş sipariş olarak
 *     GÖRÜNMEDİ — tek örnek, sandbox (26.09 canlı, salt okuma: listede yalnız
 *     önceden açılmış WAITING). Görünseydi deneme bittikten sonra 31 gün
 *     "elle fatura" uyarısı üretirdi; kapı en kötü hâli ölçer (D1).
 *   · İlk gece birikimi (26.09 14:58 TR canlı sayım, salt okuma): iyzico kodlu
 *     1 abonelik, ödenmiş sipariş 0 → 0 fatura, 0 uyarı.
 *   · Yalnız ACTIVE'de aranır (yukarıdaki UNPAID sınırı aynen).
 *   · Engeller BİLEREK yalnız kural 7'dedir; kural 2 (erişimi uzatan) aynen:
 *     sonraki dönemin denemesi/paket değişimi/yoldaki webhook orada da
 *     olabilir (24.09'dan beri) ama gecikme orada ERİŞİME mal olur — ayrı iş.
 *   · Paket değişiminde eski ucun faturasız siparişi yeni ucun listesinde
 *     görünmüyorsa (ölçülmedi) hiç görünmez: fatura yok, uyarı yok.
 *
 *  SAF parçalar DB'siz ölçülür: `test:mutabakat-faturasiz-tahsilat` (+ kural
 *  2-4 `test:mutabakat-kayip-tahsilat`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** iyzico'nun sipariş listesindeki ödenmiş sipariş (kanıtlı, kodu ve dönem sonu çözülmüş). */
export interface OdenmisSiparis {
  siparisKodu: string;
  donemSonu: Date;
  /** `startPeriod` — çözülemezse null (kural 7e paket değişimi engeli). */
  donemBasi: Date | null;
  /**
   * Son çekim denemesinin anı (`paymentAttempts[].createdDate` en büyüğü);
   * çözülemezse dönem başı, o da yoksa null (kural 7e yoldaki webhook).
   * Ödenmiş siparişte son deneme başarılı olandır — kanıt kuralı ikizlenmez.
   */
  sonDeneme: Date | null;
  /** iyzico'nun döndürdüğü ham sipariş — olay kaydında KANIT olarak saklanır. */
  ham: Record<string, unknown>;
}

/**
 * Kayıp tahsilatın NEDENİ: `erisim` = dönem sonu `erisimSonu`nu aşıyor
 * (kural 2); `fatura` = erişimi uzatmıyor ama faturası yok, dönemi sürüyor
 * (kural 7). İkisi birden geçerliyse `erisim`.
 */
export type KayipNedeni = 'erisim' | 'fatura';

export interface KayipTahsilat extends OdenmisSiparis {
  neden: KayipNedeni;
}

export interface KayipTahsilatKarari {
  /** Yeniden oynatılacak TEK sipariş (adayların dönem sonu en yenisi) — yoksa null. */
  oynatilacak: KayipTahsilat | null;
  /** Oynatılmayacak, faturası olmayan ödenmiş siparişler (eskiden yeniye) — "elle fatura". */
  elleFatura: OdenmisSiparis[];
}

/**
 * Dönemi bitmiş faturasız siparişin "elle fatura" uyarısı kaç gün sürer (kural
 * 7b): bir takvim dönemi. Daha eskisi tarihçedir — her gece uyarı üretmez.
 */
export const ELLE_FATURA_PENCERESI_GUN = 31;

/**
 * Son çekim denemesi bundan yeniyse webhook hâlâ yolda olabilir (kural 7e):
 * iyzico ~3 denemede ~45 dk yeniden gönderir. Yalnız kural 7'de uygulanır.
 */
export const YOLDAKI_WEBHOOK_SAAT = 2;

/** Oynatılan olayın kaynağı — `WebhookOlayi.kaynak` ve tekil anahtar öneki. */
export const MUTABAKAT_KAYNAGI = 'mutabakat';

/** Yeniden oynatılan olay tipi — webhook işleyicisinin başarılı tahsilat dalı. */
const BASARILI_TAHSILAT: AbonelikWebhookGovdesi['iyziEventType'] = 'subscription.order.success';

/** Daha önce oynatılmış siparişin hâlâ NEDEN kayıp sayıldığı (kural 4 uyarısı). */
const KAYIP_HALI: Record<KayipNedeni, string> = {
  erisim: 'erişim hâlâ uzamadı',
  fatura: 'faturası hâlâ yok',
};

/**
 * Ödendi mi? (kural 1) — kural `iyzico/tahsilat-kaniti.ts`e TAŞINDI (24.09):
 * başarılı tahsilat webhook'u (`AbonelikServisi.tahsilatBasarili`) da AYNI
 * kanıtı ister; servis bu dosyayı içe aktaramaz (döngü). Burada yeniden dışa
 * verilir — iki yol TEK fonksiyonu okur (`test:webhook-tahsilat-dogrulama` S1).
 */
export { odenmisSiparisMi };

/**
 * Ödenmiş siparişler (kural 1: kanıtlı, kodu ve dönem sonu çözülen), iyzico'nun
 * sırasıyla. SAF. Kodu ya da çözülebilir dönem sonu olmayan sipariş YOK
 * sayılır: oynatılamaz, fatura sorgusuna da girmez.
 */
export function odenmisSiparisler(siparisler: unknown): OdenmisSiparis[] {
  if (!Array.isArray(siparisler)) return [];
  const sonuc: OdenmisSiparis[] = [];
  for (const s of siparisler) {
    if (!odenmisSiparisMi(s)) continue;
    const o = s as Record<string, unknown>;
    // Kod OLDUĞU GİBİ taşınır (kırpılmaz): `tahsilatBasarili` siparişi
    // iyzico'nun listesinde birebir eşleşmeyle yeniden arar.
    const kod = typeof o.referenceCode === 'string' ? o.referenceCode : '';
    const donemSonu = iyzicoTarihi(o.endPeriod);
    if (!kod || !donemSonu) continue;
    const donemBasi = iyzicoTarihi(o.startPeriod);
    sonuc.push({ siparisKodu: kod, donemSonu, donemBasi, sonDeneme: sonDenemeAni(o) ?? donemBasi, ham: o });
  }
  return sonuc;
}

/** Siparişin çekim denemelerinden EN SONUNCUSUNUN anı (çözülemeyenler atlanır). SAF. */
function sonDenemeAni(o: Record<string, unknown>): Date | null {
  if (!Array.isArray(o.paymentAttempts)) return null;
  let son: Date | null = null;
  for (const d of o.paymentAttempts) {
    const an = d && typeof d === 'object' ? iyzicoTarihi((d as Record<string, unknown>).createdDate) : null;
    if (an && (!son || an > son)) son = an;
  }
  return son;
}

/**
 * Listede başlangıcı `an`da ya da sonrasında olan ve ödeme DENEMESİ taşıyan
 * (ödenmiş ya da reddedilmiş) sipariş var mı? Denemesiz sipariş (iyzico'nun
 * önceden açtığı WAITING) sayılmaz. SAF.
 */
function sonrakiDonemDenendiMi(siparisler: unknown, an: Date): boolean {
  if (!Array.isArray(siparisler)) return false;
  return siparisler.some((s) => {
    if (!s || typeof s !== 'object') return false;
    const o = s as Record<string, unknown>;
    const bas = iyzicoTarihi(o.startPeriod);
    return !!bas && bas >= an && Array.isArray(o.paymentAttempts) && o.paymentAttempts.length > 0;
  });
}

const eskidenYeniye = (a: OdenmisSiparis, b: OdenmisSiparis) => a.donemSonu.getTime() - b.donemSonu.getTime();

/**
 * `erisimSonu`nu UZATAN ödenmiş siparişler, dönem sonuna göre ESKİDEN YENİYE
 * (kural 1-3). Boş dizi = erişimi uzatan kayıp yok. SAF.
 *
 * Dönem sonu `iyzicoTarihi` ile okunur (sayı · rakam-dizesi · ISO). Bozuk
 * `erisimSonu` (şemada NOT NULL) ile hiçbir sipariş uzatmaz sayılır: `x > NaN`
 * yanlıştır — tahmin yürütülmez.
 */
export function erisimiUzatanOdemeler(
  siparisler: unknown,
  erisimSonu: Date | null | undefined,
): OdenmisSiparis[] {
  const sinir = erisimSonu instanceof Date ? erisimSonu.getTime() : NaN;
  return odenmisSiparisler(siparisler)
    .filter((o) => o.donemSonu.getTime() > sinir)
    .sort(eskidenYeniye);
}

/**
 * Kayıp tahsilat kararı (kural 2-3 + 7). SAF.
 *
 * Aday: erişimi UZATAN (kural 2 — `erisimiUzatanOdemeler`, tek kaynak) YA DA
 * faturasız, dönemi SÜREN ve ENGELSİZ (kural 7a/7e; deneme sürerken değil —
 * 7c) ödenmiş sipariş. Oynatılan TEK sipariş adayların dönem sonu en
 * yenisidir (kural 3: eskisini sonra işlemek erişimi geri çekerdi). "Elle
 * fatura": oynatılmayan faturasız siparişlerden erişimi uzatanlar (kural 3),
 * dönemi son `ELLE_FATURA_PENCERESI_GUN` gün içinde bitenler (7b) ve süren ama
 * ENGELLİ olanlar (7e). Yoldaki webhook (7e) ne oynatılır ne uyarılır.
 *
 * @param faturali `Fatura.tahsilatKodu` karşılığı OLAN sipariş kodları.
 * @param paketGecisTarihi Satırın bekleyen paket değişiminin geçiş anı (yoksa null).
 */
export function kayipTahsilatKarari(
  siparisler: unknown,
  p: {
    erisimSonu: Date | null | undefined;
    faturali: ReadonlySet<string>;
    simdi: Date;
    denemeSuruyor: boolean;
    paketGecisTarihi: Date | null;
  },
): KayipTahsilatKarari {
  const uzatan = new Set(erisimiUzatanOdemeler(siparisler, p.erisimSonu).map((o) => o.siparisKodu));
  const odenmis = odenmisSiparisler(siparisler).sort(eskidenYeniye);
  const an = p.simdi.getTime();
  const pencere = an - ELLE_FATURA_PENCERESI_GUN * 86_400_000;
  const yoldaSiniri = an - YOLDAKI_WEBHOOK_SAAT * 3_600_000;
  const faturasiz = (o: OdenmisSiparis) => !p.faturali.has(o.siparisKodu);
  // Bozuk `simdi` (NaN) ile hiçbir sipariş "süren", "yakın" ya da "yolda" sayılmaz.
  const suren = (o: OdenmisSiparis) => o.donemSonu.getTime() > an;
  const gecis = p.paketGecisTarihi;
  // Kural 7e engelleri — oynatma yanlış satır durumu üretirdi.
  const engelli = (o: OdenmisSiparis) =>
    sonrakiDonemDenendiMi(siparisler, o.donemSonu) ||
    (gecis instanceof Date && !(o.donemBasi && o.donemBasi >= gecis));
  const yolda = (o: OdenmisSiparis) => !!o.sonDeneme && o.sonDeneme.getTime() > yoldaSiniri;
  const oynatilabilir = (o: OdenmisSiparis) =>
    !p.denemeSuruyor && faturasiz(o) && suren(o) && !engelli(o) && !yolda(o);

  const adaylar = odenmis.filter((o) => uzatan.has(o.siparisKodu) || oynatilabilir(o));
  const secilen = adaylar[adaylar.length - 1];
  const oynatilacak: KayipTahsilat | null = secilen
    ? { ...secilen, neden: uzatan.has(secilen.siparisKodu) ? 'erisim' : 'fatura' }
    : null;
  const elleFatura = odenmis.filter(
    (o) =>
      o.siparisKodu !== oynatilacak?.siparisKodu &&
      faturasiz(o) &&
      (uzatan.has(o.siparisKodu) ||
        (!p.denemeSuruyor && (suren(o) ? engelli(o) && !yolda(o) : o.donemSonu.getTime() > pencere))),
  );
  return { oynatilacak, elleFatura };
}

@Injectable()
export class MutabakatJob {
  private readonly logger = new Logger(MutabakatJob.name);

  /** Son gece koşumunda deneme sürdüğü için AKTIF'e ÇEKİLMEYEN satır sayısı. */
  private denemedeKorunan = 0;

  /** Son gece koşumunda kaybolmuş tahsilatı YENİDEN OYNATILAN abonelik sayısı. */
  private yenidenOynatilan = 0;

  /** Son gece koşumunda çıplak ACTIVE ile AKTIF'e ÇEKİLMEYEN satır sayısı (kural 5). */
  private kanitsizAktif = 0;

  /** Son gece koşumunda "elle fatura" uyarısı yazılan ödenmiş sipariş sayısı (kural 3 + 7b). */
  private elleFatura = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly iyzico: IyzicoClient,
    private readonly abonelikServisi: AbonelikServisi,
  ) {}

  /** Gecelik tam tarama — kart ile ödeyen tüm canlı abonelikler. */
  @Cron('0 30 3 * * *') // her gece 03:30
  async geceMutabakati(): Promise<void> {
    const abonelikler = await this.prisma.abonelik.findMany({
      where: {
        odemeYontemi: 'KART',
        iyzicoAbonelikKodu: { not: null },
        OR: [
          {
            durum: {
              in: [
                AbonelikDurumu.DENEME,
                AbonelikDurumu.AKTIF,
                AbonelikDurumu.ODEME_BEKLIYOR,
                AbonelikDurumu.KISITLI,
                AbonelikDurumu.ASKIDA,
                AbonelikDurumu.IPTAL,
              ],
            },
          },
          // KORUMA (24.09, kural 6): iyzico'da hâlâ ACTIVE görünen SONA_ERDI
          // satırı — kaybolmuş tahsilat buradan oynatılır. iyzico başka bir
          // şey derse `iyzicoDurum` tazelenir ve satır taramadan çıkar.
          { durum: AbonelikDurumu.SONA_ERDI, iyzicoDurum: 'ACTIVE' },
        ],
      },
      select: { id: true, iyzicoAbonelikKodu: true, durum: true },
    });

    this.logger.log(`Mutabakat başlıyor: ${abonelikler.length} abonelik`);
    let degisen = 0;
    this.denemedeKorunan = 0;
    this.yenidenOynatilan = 0;
    this.kanitsizAktif = 0;
    this.elleFatura = 0;

    for (const ab of abonelikler) {
      try {
        const degisti = await this.tekAbonelikMutabakati(
          ab.id,
          ab.iyzicoAbonelikKodu!,
        );
        if (degisti) degisen++;
      } catch (e) {
        this.logger.error(`Mutabakat hatası (${ab.id}): ${e}`);
      }
      // iyzico'yu boğmayalım
      await new Promise((r) => setTimeout(r, 120));
    }

    // İkinci sayı deploy sonrası ölçümdür: süren deneme sayısı burada görünür
    // (bkz. `denemeSuruyorMu`). Sıfırsa ve deneme varsa kural bağlı değildir.
    // Üçüncü: kaybolmuş tahsilat webhook'u — sıfırdan büyükse webhook ucu
    // olay KAÇIRIYOR (ya da işleyemiyor) demektir. Dördüncü: kanıtsız ACTIVE (kural 5) — deneme
    // sonrası çekim bekleyen satırlar burada görünür. Beşinci (26.09, kural 7b): faturası
    // olmayan ve oynatılmayacak ödenmiş sipariş — sıfırdan büyükse NES'te elle fatura gerekir.
    this.logger.log(
      `Mutabakat bitti. Değişen: ${degisen} · deneme sürdüğü için AKTIF'e çekilmeyen: ${this.denemedeKorunan}` +
        ` · kayıp tahsilat yeniden oynatılan: ${this.yenidenOynatilan}` +
        ` · kanıtsız ACTIVE ile AKTIF'e çekilmeyen: ${this.kanitsizAktif}` +
        ` · faturasız ödenmiş sipariş (elle fatura): ${this.elleFatura}`,
    );
  }

  /**
   * Erişimi biten ama durumu güncellenmemiş kayıtları kapatır.
   * Mutabakattan bağımsız çalışır — iyzico erişilemese bile
   * süresi dolmuş abonelik açık kalmasın.
   */
  @Cron('0 5 * * * *') // saat başı 5. dakika
  async suresiDolanlariKapat(): Promise<void> {
    const simdi = new Date();
    const adaylar = await this.prisma.abonelik.findMany({
      where: {
        erisimSonu: { lte: simdi },
        durum: { in: [AbonelikDurumu.DENEME, AbonelikDurumu.IPTAL] },
      },
      select: { id: true, durum: true },
    });

    for (const ab of adaylar) {
      await this.abonelikServisi
        .durumDegistir(ab.id, AbonelikDurumu.SONA_ERDI, {
          aciklama: 'Erişim süresi doldu',
          aktor: 'mutabakat',
        })
        .catch((e) => this.logger.error(`Kapatma hatası (${ab.id}): ${e}`));
    }
    if (adaylar.length) {
      this.logger.log(`${adaylar.length} abonelik süresi dolduğu için kapatıldı`);
    }
  }

  private async tekAbonelikMutabakati(
    abonelikId: string,
    abonelikKodu: string,
  ): Promise<boolean> {
    const detay = await this.iyzico.abonelikGetir(abonelikKodu);
    const ab = await this.prisma.abonelik.findUniqueOrThrow({
      where: { id: abonelikId },
    });

    await this.prisma.abonelik.update({
      where: { id: abonelikId },
      data: {
        iyzicoDurum: detay.subscriptionStatus,
        iyzicoSonKontrol: new Date(),
      },
    });

    // KAYIP TAHSİLAT (24.09 kural 1-4, 26.09 kural 7 — dosya başı). Durum
    // denetimlerinden ÖNCE: AKTIF satırda aşağıdaki `hedef === ab.durum` erken
    // dönüşü kaybolan dönemi hiç görmüyordu. Deneme kuralından da önce: ödenmiş
    // sipariş tahsilatın KENDİSİDİR. Satırı bu iş değiştirmez (`false`) —
    // tahsilat yolu değiştirir.
    if (detay.subscriptionStatus === 'ACTIVE') {
      const simdi = new Date();
      const karar = kayipTahsilatKarari(detay.orders, {
        erisimSonu: ab.erisimSonu,
        faturali: await this.faturaliSiparisler(detay.orders),
        simdi,
        denemeSuruyor: denemeSuruyorMu(ab, simdi),
        paketGecisTarihi: ab.paketGecisTarihi ?? null,
      });
      if (karar.elleFatura.length > 0) {
        this.elleFatura += karar.elleFatura.length;
        this.logger.warn(
          `Kayıp tahsilat: abonelik ${abonelikId} için ${karar.elleFatura.length} ödenmiş siparişin faturası YOK ` +
            `ve kuyruğa GİRMEYECEK: ${karar.elleFatura.map((o) => o.siparisKodu).join(', ')} — elle fatura gerekir.`,
        );
      }
      if (karar.oynatilacak) {
        await this.tahsilatiYenidenOynat(abonelikId, abonelikKodu, detay, karar.oynatilacak);
        return false;
      }
    }

    // KORUMA (24.09, kural 6): SONA_ERDI satır YALNIZ kaybolmuş tahsilatı
    // oynatmak için taranır; durumu burada başka türlü DEĞİŞMEZ (iyzico'nun
    // CANCELED/EXPIRED'ı yukarıda `iyzicoDurum`a yazıldı → satır taramadan
    // çıkar). Hâlâ ACTIVE ve kanıt yoksa her gece UYARI: iyzico çekmeye devam
    // ediyor olabilir, yeniden satın alma bu satırda kapalı.
    if (ab.durum === AbonelikDurumu.SONA_ERDI) {
      if (detay.subscriptionStatus === 'ACTIVE') {
        this.logger.warn(
          `SONA_ERDI satır iyzico'da hâlâ ACTIVE, ödenmiş yeni sipariş yok: abonelik ${abonelikId} ` +
            `(${abonelikKodu}) — yeniden satın alma kapalı; müşteriyle görüşün ya da iyzico'da iptal edin.`,
        );
      }
      return false;
    }

    const hedef = iyzicoDurumunuYorumla(detay.subscriptionStatus);
    if (!hedef || hedef === ab.durum) return false;

    // Deneme sürüyor: iyzico'nun ACTIVE'i tahsilat kanıtı DEĞİL (bkz.
    // `denemeSuruyorMu`). DENEME → AKTIF'i yalnız başarılı tahsilat
    // webhook'u yapar. `iyzicoSonKontrol` yukarıda yine yazıldı — iz kalır.
    if (hedef === AbonelikDurumu.AKTIF && denemeSuruyorMu(ab, new Date())) {
      this.denemedeKorunan++;
      return false;
    }

    // KANITSIZ TERFİ YOK (24.09, kural 5): buraya ACTIVE ile ve erişimi
    // uzatan ödenmiş sipariş OLMADAN gelindi. Tolerans/kısıt satırını AKTIF'e
    // çekmek geride kalmış `erisimSonu` yüzünden erişimi KAPATIRDI. Tek
    // istisna IPTAL → AKTIF (vazgeçme; ödenmiş dönem zaten `erisimSonu`nda).
    if (hedef === AbonelikDurumu.AKTIF && ab.durum !== AbonelikDurumu.IPTAL) {
      this.kanitsizAktif++;
      return false;
    }

    // Kendi dunning basamaklarımızı iyzico'nun UNPAID'i ezmesin:
    // biz zaten KISITLI/ASKIDA'ya indirdiysek geri çıkarmayız.
    if (
      hedef === AbonelikDurumu.ODEME_BEKLIYOR &&
      (ab.durum === AbonelikDurumu.KISITLI || ab.durum === AbonelikDurumu.ASKIDA)
    ) {
      return false;
    }

    if (!this.abonelikServisi.gecisGecerliMi(ab.durum, hedef)) {
      this.logger.warn(
        `Mutabakat geçersiz geçiş istedi: ${ab.durum} → ${hedef} (${abonelikId})`,
      );
      return false;
    }

    // İptal edildiyse ödenmiş dönemin sonuna kadar erişim sürsün. `endDate`
    // TEK çözücüden (24.09): rakam-dizesi `new Date` ile Invalid Date olup
    // iptali yazdırmıyordu; çözülemeyen değer yokmuş gibi — tarih UYDURULMAZ.
    const iptalSonu = hedef === AbonelikDurumu.IPTAL ? iyzicoTarihi(detay.endDate) : null;
    await this.abonelikServisi.durumDegistir(abonelikId, hedef, {
      aciklama: `Mutabakat: iyzico durumu ${detay.subscriptionStatus}`,
      aktor: 'mutabakat',
      veri: { iyzicoDurum: detay.subscriptionStatus },
      ...(iptalSonu ? { erisimSonu: iptalSonu } : {}),
    });

    // ⚠ FAZ 6.12a (16.09) — İKİZİ UNUTMA: webhook yolu (tahsilatBasarisiz)
    // ODEME_BEKLIYOR'a geçerken `ilkBasarisizlik` yazıyor; bu yol yazmıyordu.
    // Dunning merdiveni YALNIZ `ilkBasarisizlik` dolu satırları tarar ve
    // ODEME_BEKLIYOR `erisimSonu`na bakmadan TAM erişimdir — başarısızlık
    // webhook'u kaybolup (iyzico 45 dk sonra bırakır) durumu gece mutabakatı
    // düzeltirse satır merdivene HİÇ girmez, erişim süresiz açık kalırdı.
    // K-P5 (DENEME → ODEME_BEKLIYOR geçerli) deneme sonu başarısızlığını da bu
    // yola soktu; o yüzden burada kapatılıyor.
    if (hedef === AbonelikDurumu.ODEME_BEKLIYOR && !ab.ilkBasarisizlik) {
      await this.prisma.abonelik.update({
        where: { id: abonelikId },
        data: { ilkBasarisizlik: new Date(), sonDeneme: ab.sonDeneme ?? new Date() },
      });
    }
    return true;
  }

  /**
   * Ödenmiş siparişlerden `Fatura.tahsilatKodu` karşılığı OLANLAR (kural 7d).
   * Kod `kuyrugaAl`ın tekillik anahtarıdır (@unique): abonelik süzgeci yok.
   */
  private async faturaliSiparisler(siparisler: unknown): Promise<Set<string>> {
    const kodlar = odenmisSiparisler(siparisler).map((o) => o.siparisKodu);
    if (kodlar.length === 0) return new Set();
    const satirlar = await this.prisma.fatura.findMany({
      where: { tahsilatKodu: { in: kodlar } },
      select: { tahsilatKodu: true },
    });
    return new Set(satirlar.map((f) => f.tahsilatKodu));
  }

  /**
   * Kaybolmuş tahsilatı webhook işleyicisinin kuyruğuna yazar (kural 2-4, 7).
   * İşleyici dakikalık taramasında `tahsilatBasarili` + fatura + dunning
   * yolunu koşar; bu metot erişime ve faturaya DOKUNMAZ. `tahsilatBasarili`
   * siparişi iyzico'nun listesinde YENİDEN arar ve AYNI kanıtı ister
   * (`odenmisSiparisMi`, 24.09) — sipariş arada ödenmiş görünmez olursa
   * uygulanmaz. Oynatılmayan eski siparişlerin "elle fatura" uyarısı
   * çağıranda (`kayipTahsilatKarari`).
   */
  private async tahsilatiYenidenOynat(
    abonelikId: string,
    abonelikKodu: string,
    detay: IyzicoAbonelikDetayi,
    enYeni: KayipTahsilat,
  ): Promise<void> {
    const tekilAnahtar = `${MUTABAKAT_KAYNAGI}:${BASARILI_TAHSILAT}:${enYeni.siparisKodu}`;
    try {
      await this.prisma.webhookOlayi.create({
        data: {
          tekilAnahtar,
          kaynak: MUTABAKAT_KAYNAGI,
          olayTipi: BASARILI_TAHSILAT,
          // iyzico bu gövdeyi GÖNDERMEDİ: webhook alanları + kanıt (iyzico'nun
          // kendi sipariş kaydı). İmza yok → `imzaGecerli` varsayılanı (false).
          hamGovde: {
            kaynak: MUTABAKAT_KAYNAGI,
            iyziEventType: BASARILI_TAHSILAT,
            subscriptionReferenceCode: abonelikKodu,
            orderReferenceCode: enYeni.siparisKodu,
            customerReferenceCode: detay.customerReferenceCode ?? null,
            // Denetim izi: neden oynatıldı (kural 2 erişim · kural 7 fatura).
            neden: enYeni.neden,
            kanit: enYeni.ham,
          } as Prisma.InputJsonObject,
          abonelikKodu,
          siparisKodu: enYeni.siparisKodu,
          musteriKodu: detay.customerReferenceCode ?? null,
        },
      });
    } catch (e) {
      // P2002 = bu sipariş DAHA ÖNCE oynatıldı (kural 4) ve hâlâ kayıp
      // (erişim uzamadı ya da faturası yok). İkinci olay YAZILMAZ; olay ÖLÜYSE
      // (işleyici 5 denemede bıraktı) yeniden KURULUR — gece koşumu
      // işleyicinin geri çekilmesidir.
      if ((e as { code?: string })?.code === 'P2002') {
        const olu = { tekilAnahtar, islendi: false, denemeSayisi: { gte: WEBHOOK_AZAMI_DENEME } };
        // Son hata sıfırlanmadan ÖNCE okunur ve uyarıya yazılır: her gece
        // yeniden kurulan olayın neden öldüğü kaybolmasın.
        const onceki = await this.prisma.webhookOlayi.findFirst({ where: olu, select: { hata: true } });
        const kurulan = onceki
          ? await this.prisma.webhookOlayi.updateMany({ where: olu, data: { denemeSayisi: 0, hata: null } })
          : { count: 0 };
        this.logger.warn(
          kurulan.count > 0
            ? `Kayıp tahsilat olayı işlenemeden ölmüştü, YENİDEN KURULDU: abonelik ${abonelikId} ` +
                `sipariş ${enYeni.siparisKodu} — son hata: ${onceki?.hata ?? '(boş)'}`
            : `Kayıp tahsilat daha önce yeniden oynatıldı ama ${KAYIP_HALI[enYeni.neden]}: abonelik ${abonelikId} ` +
                `sipariş ${enYeni.siparisKodu} — WebhookOlayi kaydına (kaynak ${MUTABAKAT_KAYNAGI}) elle bakın.`,
        );
        return;
      }
      throw e;
    }
    this.yenidenOynatilan++;
    this.logger.warn(
      `Kayıp tahsilat yeniden oynatıldı: abonelik ${abonelikId} sipariş ${enYeni.siparisKodu} ` +
        `(dönem sonu ${enYeni.donemSonu.toISOString()}) — webhook bu siparişi getirmedi ya da işlenemedi` +
        (enYeni.neden === 'fatura' ? ' (erişim siparişten zaten ileride; faturası yoktu).' : '.'),
    );
  }
}
