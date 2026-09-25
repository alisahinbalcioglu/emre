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
 *   · Erişim siparişin dönem sonundan zaten İLERİDEYSE tetik yok: denemesiz
 *     satın almanın ilk siparişi (satın alma `erisimSonu`nu 31+2 gün köprüyle
 *     yazar) ve erişimi SÜREN satırdaki satın almanın siparişleri (satın alma
 *     `erisimSonu`nu KORUR — miras firmada erişim bitene dek, canlıda ~1 yıl,
 *     HER sipariş). Webhook'u kaybolan böyle bir siparişin faturası kuyruğa
 *     girmez ve UYARI da düşmez (erişim etkilenmez; kural 3'ün "elle fatura"
 *     uyarısı yalnız erişimi uzatan siparişleri sayar) — faturası olmayan
 *     ödenmiş siparişi saymak ayrı iş.
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

/** iyzico'nun sipariş listesindeki, erişimi uzatan ödenmiş sipariş. */
export interface OdenmisSiparis {
  siparisKodu: string;
  donemSonu: Date;
  /** iyzico'nun döndürdüğü ham sipariş — olay kaydında KANIT olarak saklanır. */
  ham: Record<string, unknown>;
}

/** Oynatılan olayın kaynağı — `WebhookOlayi.kaynak` ve tekil anahtar öneki. */
export const MUTABAKAT_KAYNAGI = 'mutabakat';

/** Yeniden oynatılan olay tipi — webhook işleyicisinin başarılı tahsilat dalı. */
const BASARILI_TAHSILAT: AbonelikWebhookGovdesi['iyziEventType'] = 'subscription.order.success';

/**
 * Ödendi mi? (kural 1) — kural `iyzico/tahsilat-kaniti.ts`e TAŞINDI (24.09):
 * başarılı tahsilat webhook'u (`AbonelikServisi.tahsilatBasarili`) da AYNI
 * kanıtı ister; servis bu dosyayı içe aktaramaz (döngü). Burada yeniden dışa
 * verilir — iki yol TEK fonksiyonu okur (`test:webhook-tahsilat-dogrulama` S1).
 */
export { odenmisSiparisMi };

/**
 * `erisimSonu`nu UZATAN ödenmiş siparişler, dönem sonuna göre ESKİDEN YENİYE
 * (kural 1-3). Boş dizi = kayıp tahsilat yok. SAF.
 *
 * Dönem sonu `iyzicoTarihi` ile okunur (sayı · rakam-dizesi · ISO). Bozuk
 * `erisimSonu` (şemada NOT NULL) ile hiçbir sipariş uzatmaz sayılır: `x > NaN`
 * yanlıştır — tahmin yürütülmez.
 */
export function erisimiUzatanOdemeler(
  siparisler: unknown,
  erisimSonu: Date | null | undefined,
): OdenmisSiparis[] {
  if (!Array.isArray(siparisler)) return [];
  const sinir = erisimSonu instanceof Date ? erisimSonu.getTime() : NaN;
  const sonuc: OdenmisSiparis[] = [];
  for (const s of siparisler) {
    if (!odenmisSiparisMi(s)) continue;
    const o = s as Record<string, unknown>;
    // Kod OLDUĞU GİBİ taşınır (kırpılmaz): `tahsilatBasarili` siparişi
    // iyzico'nun listesinde birebir eşleşmeyle yeniden arar.
    const kod = typeof o.referenceCode === 'string' ? o.referenceCode : '';
    const donemSonu = iyzicoTarihi(o.endPeriod);
    if (!kod || !donemSonu || !(donemSonu.getTime() > sinir)) continue;
    sonuc.push({ siparisKodu: kod, donemSonu, ham: o });
  }
  return sonuc.sort((a, b) => a.donemSonu.getTime() - b.donemSonu.getTime());
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
    // sonrası çekim bekleyen satırlar burada görünür.
    this.logger.log(
      `Mutabakat bitti. Değişen: ${degisen} · deneme sürdüğü için AKTIF'e çekilmeyen: ${this.denemedeKorunan}` +
        ` · kayıp tahsilat yeniden oynatılan: ${this.yenidenOynatilan}` +
        ` · kanıtsız ACTIVE ile AKTIF'e çekilmeyen: ${this.kanitsizAktif}`,
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

    // KAYIP TAHSİLAT (24.09, dosya başı kural 1-4). Durum denetimlerinden
    // ÖNCE: AKTIF satırda aşağıdaki `hedef === ab.durum` erken dönüşü kaybolan
    // dönemi hiç görmüyordu. Deneme kuralından da önce: ödenmiş sipariş
    // tahsilatın KENDİSİDİR. Satırı bu iş değiştirmez (`false`) — tahsilat
    // yolu değiştirir.
    if (detay.subscriptionStatus === 'ACTIVE') {
      const odemeler = erisimiUzatanOdemeler(detay.orders, ab.erisimSonu);
      if (odemeler.length > 0) {
        await this.tahsilatiYenidenOynat(abonelikId, abonelikKodu, detay, odemeler);
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
   * Kaybolmuş tahsilatı webhook işleyicisinin kuyruğuna yazar (kural 2-4).
   * İşleyici dakikalık taramasında `tahsilatBasarili` + fatura + dunning
   * yolunu koşar; bu metot erişime ve faturaya DOKUNMAZ. `tahsilatBasarili`
   * siparişi iyzico'nun listesinde YENİDEN arar ve AYNI kanıtı ister
   * (`odenmisSiparisMi`, 24.09) — sipariş arada ödenmiş görünmez olursa
   * uygulanmaz.
   */
  private async tahsilatiYenidenOynat(
    abonelikId: string,
    abonelikKodu: string,
    detay: IyzicoAbonelikDetayi,
    odemeler: OdenmisSiparis[],
  ): Promise<void> {
    const enYeni = odemeler[odemeler.length - 1];
    if (odemeler.length > 1) {
      this.logger.warn(
        `Kayıp tahsilat: abonelik ${abonelikId} için ${odemeler.length} ödenmiş sipariş erişimi uzatıyor; ` +
          `yalnız en yenisi (${enYeni.siparisKodu}) yeniden oynatılıyor. Faturası kuyruğa GİRMEYECEK ` +
          `siparişler: ${odemeler.slice(0, -1).map((o) => o.siparisKodu).join(', ')} — elle fatura gerekir.`,
      );
    }
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
            kanit: enYeni.ham,
          } as Prisma.InputJsonObject,
          abonelikKodu,
          siparisKodu: enYeni.siparisKodu,
          musteriKodu: detay.customerReferenceCode ?? null,
        },
      });
    } catch (e) {
      // P2002 = bu sipariş DAHA ÖNCE oynatıldı (kural 4) ve erişim hâlâ
      // uzamadı. İkinci olay YAZILMAZ; olay ÖLÜYSE (işleyici 5 denemede
      // bıraktı) yeniden KURULUR — gece koşumu işleyicinin geri çekilmesidir.
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
            : `Kayıp tahsilat daha önce yeniden oynatıldı ama erişim hâlâ uzamadı: abonelik ${abonelikId} ` +
                `sipariş ${enYeni.siparisKodu} — WebhookOlayi kaydına (kaynak ${MUTABAKAT_KAYNAGI}) elle bakın.`,
        );
        return;
      }
      throw e;
    }
    this.yenidenOynatilan++;
    this.logger.warn(
      `Kayıp tahsilat yeniden oynatıldı: abonelik ${abonelikId} sipariş ${enYeni.siparisKodu} ` +
        `(dönem sonu ${enYeni.donemSonu.toISOString()}) — webhook bu siparişi getirmedi ya da işlenemedi.`,
    );
  }
}
