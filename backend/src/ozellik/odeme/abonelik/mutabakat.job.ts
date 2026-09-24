import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikDurumu } from '@prisma/client';
import { IyzicoClient } from '../iyzico/iyzico.client';
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
 *   · Deneme BİTTİKTEN sonra eski davranış sürer: tahsilat webhook'u
 *     kaybolduysa (iyzico ~45 dk sonra bırakır) satırı AKTIF'e çeken tek yol
 *     yine bu iştir. ⚠ Yalnız DURUMU çeker: `erisimSonu`nu uzatmaz, faturayı
 *     kuyruğa almaz (ikisi de yalnız webhook yolunda) — bilinen açık, ayrı iş.
 *   · `denemeSonu` boş DENEME satırı eski davranışta kalır. Bugün kart
 *     aboneliğinde DENEME'yi yalnız satın alma açar ve `denemeSonu`nu her
 *     zaman yazar (`satinalma.servisi.ts` → `donemTarihleriHesapla`).
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

@Injectable()
export class MutabakatJob {
  private readonly logger = new Logger(MutabakatJob.name);

  /** Son gece koşumunda deneme sürdüğü için AKTIF'e ÇEKİLMEYEN satır sayısı. */
  private denemedeKorunan = 0;

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
      select: { id: true, iyzicoAbonelikKodu: true, durum: true },
    });

    this.logger.log(`Mutabakat başlıyor: ${abonelikler.length} abonelik`);
    let degisen = 0;
    this.denemedeKorunan = 0;

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
    this.logger.log(
      `Mutabakat bitti. Değişen: ${degisen} · deneme sürdüğü için AKTIF'e çekilmeyen: ${this.denemedeKorunan}`,
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

    const hedef = iyzicoDurumunuYorumla(detay.subscriptionStatus);
    if (!hedef || hedef === ab.durum) return false;

    // Deneme sürüyor: iyzico'nun ACTIVE'i tahsilat kanıtı DEĞİL (bkz.
    // `denemeSuruyorMu`). DENEME → AKTIF'i yalnız başarılı tahsilat
    // webhook'u yapar. `iyzicoSonKontrol` yukarıda yine yazıldı — iz kalır.
    if (hedef === AbonelikDurumu.AKTIF && denemeSuruyorMu(ab, new Date())) {
      this.denemedeKorunan++;
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

    await this.abonelikServisi.durumDegistir(abonelikId, hedef, {
      aciklama: `Mutabakat: iyzico durumu ${detay.subscriptionStatus}`,
      aktor: 'mutabakat',
      veri: { iyzicoDurum: detay.subscriptionStatus },
      // İptal edildiyse ödenmiş dönemin sonuna kadar erişim sürsün
      ...(hedef === AbonelikDurumu.IPTAL && detay.endDate
        ? { erisimSonu: new Date(detay.endDate) }
        : {}),
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
}
