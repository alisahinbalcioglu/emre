import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikServisi } from '../abonelik/abonelik.servisi';
import { FaturaServisi } from '../fatura/fatura.servisi';
import { DunningServisi } from '../dunning/dunning.servisi';

const AZAMI_DENEME = 5;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Webhook işleyici
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Controller olayı diske yazdı ve 200 döndü. Asıl iş burada, controller'ın
 *  isteğinden bağımsız olarak yapılıyor. İki tetikleyici var:
 *
 *    1. `kuyrugaAl` — controller'dan gelen anlık dürtme (setImmediate)
 *    2. Dakikada bir çalışan tarama — dürtme kaçarsa (süreç yeniden başladı,
 *       hata oldu) olay yine de işlenir. Emniyet ağı budur.
 *
 *  Not: tek süreçli kurulum varsayılmıştır. Birden fazla örnek (replica)
 *  çalıştırıyorsanız `islemeBasla` içindeki seçimi `FOR UPDATE SKIP LOCKED`
 *  ile alın ya da BullMQ gibi bir kuyruğa taşıyın — OKUBENI.md'de not var.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class WebhookIsleyici {
  private readonly logger = new Logger(WebhookIsleyici.name);
  private calisiyor = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly abonelik: AbonelikServisi,
    private readonly fatura: FaturaServisi,
    private readonly dunning: DunningServisi,
  ) {}

  /** Controller'dan çağrılır; isteği bekletmez. */
  kuyrugaAl(olayId: string): void {
    setImmediate(() => {
      this.tekOlayIsle(olayId).catch((e) =>
        this.logger.error(`Webhook ${olayId} işlenemedi: ${e}`),
      );
    });
  }

  /** Emniyet ağı: dürtmesi kaçan ya da hata alan olayları toplar. */
  @Cron(CronExpression.EVERY_MINUTE)
  async bekleyenleriIsle(): Promise<void> {
    if (this.calisiyor) return;
    this.calisiyor = true;
    try {
      const bekleyenler = await this.prisma.webhookOlayi.findMany({
        where: { islendi: false, denemeSayisi: { lt: AZAMI_DENEME } },
        orderBy: { alindi: 'asc' },
        take: 50,
      });
      for (const o of bekleyenler) {
        await this.tekOlayIsle(o.id).catch((e) =>
          this.logger.error(`Webhook ${o.id}: ${e}`),
        );
      }
    } finally {
      this.calisiyor = false;
    }
  }

  private async tekOlayIsle(olayId: string): Promise<void> {
    const olay = await this.prisma.webhookOlayi.findUnique({
      where: { id: olayId },
    });
    if (!olay || olay.islendi) return;
    if (olay.denemeSayisi >= AZAMI_DENEME) return;

    try {
      switch (olay.olayTipi) {
        case 'subscription.order.success':
          await this.basariliTahsilat(olay.abonelikKodu!, olay.siparisKodu!);
          break;

        case 'subscription.order.failure':
          await this.basarisizTahsilat(olay.abonelikKodu!, olay.siparisKodu!);
          break;

        default:
          this.logger.warn(`Bilinmeyen olay tipi: ${olay.olayTipi}`);
      }

      await this.prisma.webhookOlayi.update({
        where: { id: olayId },
        data: { islendi: true, islenmeZamani: new Date(), hata: null },
      });
    } catch (e: unknown) {
      const mesaj = e instanceof Error ? e.message : String(e);
      await this.prisma.webhookOlayi.update({
        where: { id: olayId },
        data: { denemeSayisi: { increment: 1 }, hata: mesaj },
      });
      throw e;
    }
  }

  private async basariliTahsilat(abonelikKodu: string, siparisKodu: string) {
    const sonuc = await this.abonelik.tahsilatBasarili(abonelikKodu, siparisKodu);
    if (!sonuc) return;

    // Fatura kuyruğa alınır — burada kesilmez. Paraşüt yavaşsa ya da
    // ölüyse webhook işlemesi bundan etkilenmemeli.
    await this.fatura.kuyrugaAl({
      abonelikId: sonuc.abonelik.id,
      tahsilatKodu: siparisKodu,
      tutar: sonuc.siparis?.paidPrice ?? Number(sonuc.abonelik.paketSurumu.tutar),
      paraBirimi: sonuc.abonelik.paketSurumu.paraBirimi,
      donemBasi: sonuc.siparis?.startPeriod
        ? new Date(sonuc.siparis.startPeriod)
        : new Date(),
      donemSonu: sonuc.donemSonu,
    });

    // Dunning'den çıktıysa "geri hoş geldiniz" bildirimi
    await this.dunning.tahsilatToparlandi(sonuc.abonelik.id);
  }

  private async basarisizTahsilat(abonelikKodu: string, siparisKodu: string) {
    const ab = await this.abonelik.tahsilatBasarisiz(abonelikKodu, siparisKodu);
    if (!ab) return;
    // İlk bildirimi hemen gönder; sonraki kademeler zamanlayıcıdan gelir.
    await this.dunning.ilkBildirim(ab.id, siparisKodu);
  }
}
