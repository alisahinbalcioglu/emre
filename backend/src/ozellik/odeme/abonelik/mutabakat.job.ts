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
@Injectable()
export class MutabakatJob {
  private readonly logger = new Logger(MutabakatJob.name);

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

    this.logger.log(`Mutabakat bitti. Değişen: ${degisen}`);
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
    return true;
  }
}
