import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { FaturaDurumu, Prisma } from '@prisma/client';
import { MuhasebeAdaptoru, MUHASEBE_ADAPTORU } from './muhasebe.adaptor';
import { Inject } from '@nestjs/common';
import { EpostaServisi } from '../eposta/eposta.servisi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  e-Arşiv / e-Fatura kesimi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  NEDEN BU DOSYA VAR:
 *  iyzico müşterinize fatura KESMEZ. Kendi komisyonunu size faturalar, o kadar.
 *  Her başarılı tahsilat için e-arşiv (vergi mükellefi olmayan / e-fatura
 *  kullanıcısı olmayan alıcı) ya da e-fatura (kayıtlı kullanıcı) üretmek
 *  sizin yasal yükümlülüğünüz. Aylık abonelikte bu, elle takip edilebilecek
 *  bir iş değil.
 *
 *  TASARIM:
 *  Fatura kesimi tahsilat akışını ASLA bloklamaz. Webhook işleyici buraya
 *  yalnızca "kuyruğa al" der ve geçer. Muhasebe servisi yavaşsa, bakımdaysa
 *  ya da bir alan reddediyorsa abonelik yine de aktifleşir — fatura kuyrukta
 *  bekler ve tekrar denenir.
 *
 *  Üstel geri çekilme: 1dk, 5dk, 25dk, 2sa, 10sa. 5 denemeden sonra
 *  ELLE_MUDAHALE durumuna alınır ve yönetime e-posta gider. Sessizce
 *  kaybolmaz — kaybolursa vergi cezası sizin olur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const AZAMI_DENEME = 5;
const GERI_CEKILME_DK = [1, 5, 25, 120, 600];

export interface FaturaTalebi {
  abonelikId: string;
  /** Tekilleştirme anahtarı — aynı tahsilat için iki fatura kesilmesin. */
  tahsilatKodu: string;
  /** KDV DAHİL tahsil edilen tutar. */
  tutar: number;
  paraBirimi: string;
  donemBasi: Date;
  donemSonu: Date;
}

@Injectable()
export class FaturaServisi {
  private readonly logger = new Logger(FaturaServisi.name);
  private readonly kdvOrani = Number(process.env.KDV_ORANI ?? 20);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MUHASEBE_ADAPTORU)
    private readonly muhasebe: MuhasebeAdaptoru,
    private readonly eposta: EpostaServisi,
  ) {}

  /**
   * Faturayı kuyruğa alır. Aynı `tahsilatKodu` ikinci kez gelirse sessizce
   * yok sayılır — webhook tekrarı fatura tekrarına dönüşmez.
   */
  async kuyrugaAl(t: FaturaTalebi): Promise<void> {
    // Tutar KDV dahil geliyor; matrahı ve KDV'yi ayrıştır.
    const carpan = 1 + this.kdvOrani / 100;
    const matrah = Math.round((t.tutar / carpan) * 100) / 100;
    const kdv = Math.round((t.tutar - matrah) * 100) / 100;

    try {
      await this.prisma.fatura.create({
        data: {
          abonelikId: t.abonelikId,
          tahsilatKodu: t.tahsilatKodu,
          durum: FaturaDurumu.BEKLIYOR,
          tutar: new Prisma.Decimal(matrah),
          kdvOrani: this.kdvOrani,
          kdvTutari: new Prisma.Decimal(kdv),
          toplamTutar: new Prisma.Decimal(t.tutar),
          paraBirimi: t.paraBirimi,
          donemBasi: t.donemBasi,
          donemSonu: t.donemSonu,
          sonDeneme: new Date(Date.now() - 60_000), // hemen işlensin
        },
      });
      this.logger.log(`Fatura kuyruğa alındı: ${t.tahsilatKodu}`);
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        this.logger.debug(`Fatura zaten var: ${t.tahsilatKodu}`);
        return;
      }
      throw e;
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async kuyrugaBak(): Promise<void> {
    const simdi = new Date();
    const bekleyenler = await this.prisma.fatura.findMany({
      where: {
        durum: { in: [FaturaDurumu.BEKLIYOR, FaturaDurumu.HATA] },
        denemeSayisi: { lt: AZAMI_DENEME },
        sonDeneme: { lte: simdi },
      },
      orderBy: { olusturuldu: 'asc' },
      take: 20,
    });

    for (const f of bekleyenler) {
      await this.tekFatura(f.id).catch((e) =>
        this.logger.error(`Fatura ${f.id}: ${e}`),
      );
    }
  }

  private async tekFatura(faturaId: string): Promise<void> {
    const f = await this.prisma.fatura.findUniqueOrThrow({
      where: { id: faturaId },
      include: {
        abonelik: {
          include: { paketSurumu: { include: { paket: true } } },
        },
      },
    });
    if (f.durum === FaturaDurumu.KESILDI) return;

    const firma = await this.prisma.firma.findUniqueOrThrow({
      where: { id: f.abonelik.firmaId },
    });

    try {
      const sonuc = await this.muhasebe.faturaKes({
        // Muhasebe tarafındaki tekilleştirme — çift gönderime karşı
        harciAnahtar: f.tahsilatKodu,
        musteri: {
          unvan: firma.unvan ?? firma.ad,
          vergiNo: firma.vergiNo ?? undefined,
          vergiDairesi: firma.vergiDairesi ?? undefined,
          tcKimlikNo: firma.tcKimlikNo ?? undefined,
          eposta: firma.faturaEposta ?? firma.yetkiliEposta,
          adres: firma.faturaAdresi ?? undefined,
          il: firma.il ?? undefined,
          ilce: firma.ilce ?? undefined,
        },
        kalemler: [
          {
            ad: `${f.abonelik.paketSurumu.paket.ad} — Yazılım Kullanım Bedeli`,
            aciklama: `Dönem: ${f.donemBasi.toLocaleDateString('tr-TR')} – ${f.donemSonu.toLocaleDateString('tr-TR')}`,
            miktar: 1,
            birim: 'Adet',
            birimFiyat: Number(f.tutar),
            kdvOrani: f.kdvOrani,
          },
        ],
        paraBirimi: f.paraBirimi,
        duzenlemeTarihi: new Date(),
      });

      await this.prisma.fatura.update({
        where: { id: faturaId },
        data: {
          durum: FaturaDurumu.KESILDI,
          saglayici: this.muhasebe.ad,
          saglayiciId: sonuc.saglayiciId,
          faturaNo: sonuc.faturaNo,
          faturaUrl: sonuc.faturaUrl,
          kesildi: new Date(),
          hata: null,
        },
      });
      this.logger.log(`Fatura kesildi: ${sonuc.faturaNo ?? sonuc.saglayiciId}`);
    } catch (e: unknown) {
      const mesaj = e instanceof Error ? e.message : String(e);
      const yeniDeneme = f.denemeSayisi + 1;
      const tukendi = yeniDeneme >= AZAMI_DENEME;
      const bekleme =
        GERI_CEKILME_DK[Math.min(yeniDeneme, GERI_CEKILME_DK.length - 1)];

      await this.prisma.fatura.update({
        where: { id: faturaId },
        data: {
          durum: tukendi ? FaturaDurumu.ELLE_MUDAHALE : FaturaDurumu.HATA,
          denemeSayisi: yeniDeneme,
          sonDeneme: new Date(Date.now() + bekleme * 60_000),
          hata: mesaj.slice(0, 500),
        },
      });

      if (tukendi) {
        this.logger.error(
          `Fatura ${faturaId} elle müdahale gerektiriyor: ${mesaj}`,
        );
        await this.yonetimeHaberVer(faturaId, firma.ad, mesaj);
      } else {
        this.logger.warn(
          `Fatura ${faturaId} başarısız (${yeniDeneme}/${AZAMI_DENEME}), ` +
            `${bekleme} dk sonra tekrar: ${mesaj}`,
        );
      }
    }
  }

  private async yonetimeHaberVer(
    faturaId: string,
    firmaAdi: string,
    hata: string,
  ): Promise<void> {
    const adres = process.env.YONETIM_EPOSTA;
    if (!adres) return;
    await this.eposta
      .gonder({
        kime: adres,
        konu: `[MetaPriceX] Fatura kesilemedi — ${firmaAdi}`,
        baslik: 'Otomatik fatura kesimi başarısız',
        paragraflar: [
          `Firma: ${firmaAdi}`,
          `Fatura kaydı: ${faturaId}`,
          `Son hata: ${hata}`,
          'Otomatik denemeler tükendi. Faturanın elle kesilmesi gerekiyor.',
        ],
        dugme: {
          etiket: 'Yönetim panelinde aç',
          url: `${process.env.UYGULAMA_URL}/yonetim/faturalar/${faturaId}`,
        },
      })
      .catch(() => undefined);
  }

  /** Yönetim panelinden elle tekrar tetikleme. */
  async yenidenDene(faturaId: string): Promise<void> {
    await this.prisma.fatura.update({
      where: { id: faturaId },
      data: {
        durum: FaturaDurumu.BEKLIYOR,
        denemeSayisi: 0,
        sonDeneme: new Date(Date.now() - 1000),
        hata: null,
      },
    });
  }
}
