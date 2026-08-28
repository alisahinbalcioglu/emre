import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { HavaleDurumu, Prisma } from '@prisma/client';
import { AbonelikServisi } from '../abonelik/abonelik.servisi';
import { FaturaServisi } from '../fatura/fatura.servisi';
import { EpostaServisi } from '../eposta/eposta.servisi';
import { tarihYaz, tutarYaz } from '../dunning/dunning.metinleri';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Havale / EFT ile yıllık abonelik
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  NEDEN BİRİNCİ SINIF BİR YOL:
 *  Mekanik taahhüt firmalarında satın alma kartla değil, muhasebeden geçerek
 *  olur. Kurumsal kart limitleri düşüktür, internetten ödemeye kapalı olabilir,
 *  ve yıllık peşin havale çoğu zaman firmanın TERCİH ETTİĞİ biçimdir —
 *  katlanmak zorunda kaldığı değil. Kartla ödemeyi tek yol yapan bir SaaS
 *  bu segmentte satış kaybeder.
 *
 *  AKIŞ:
 *      TEKLIF ──► FATURA_KESILDI ──► ODEME_BEKLENIYOR ──► ONAYLANDI
 *                                                            │
 *                                          abonelik N ay uzatılır
 *
 *  iyzico bu akışa hiç karışmaz. Abonelik kaydının `odemeYontemi` alanı
 *  HAVALE olur, `iyzicoAbonelikKodu` null kalır, dunning zamanlayıcısı
 *  bu kayıtları atlar (sorgusunda odemeYontemi:'KART' filtresi var).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class HavaleServisi {
  private readonly logger = new Logger(HavaleServisi.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly abonelik: AbonelikServisi,
    private readonly fatura: FaturaServisi,
    private readonly eposta: EpostaServisi,
  ) {}

  /** 1. Teklif oluştur — müşteriye gönderilecek. */
  async teklifOlustur(p: {
    firmaId: string;
    paketSurumuId: string;
    ayAdedi: number;
    tutar: number;
    paraBirimi?: string;
    aciklama?: string;
    olusturanId: string;
  }) {
    if (p.ayAdedi < 1 || p.ayAdedi > 36) {
      throw new BadRequestException('Ay adedi 1 ile 36 arasında olmalı');
    }

    const abonelik = await this.abonelikBulYaDaOlustur(
      p.firmaId,
      p.paketSurumuId,
    );

    const teklifNo = await this.teklifNoUret();

    const kayit = await this.prisma.havaleOdemesi.create({
      data: {
        abonelikId: abonelik.id,
        durum: HavaleDurumu.TEKLIF,
        tutar: new Prisma.Decimal(p.tutar),
        paraBirimi: p.paraBirimi ?? 'TRY',
        ayAdedi: p.ayAdedi,
        teklifNo,
        aciklama: p.aciklama,
      },
    });

    await this.abonelik.olayYaz(abonelik.id, 'havale.teklif.olusturuldu', {
      aciklama: `${teklifNo} — ${p.ayAdedi} ay, ${tutarYaz(p.tutar)}`,
      aktor: p.olusturanId,
      veri: { havaleId: kayit.id, teklifNo },
    });

    return kayit;
  }

  /** 2. Fatura kesildi işaretle (proforma ya da gerçek fatura). */
  async faturaKesildi(havaleId: string, faturaNo: string, aktorId: string) {
    const kayit = await this.prisma.havaleOdemesi.update({
      where: { id: havaleId },
      data: {
        durum: HavaleDurumu.ODEME_BEKLENIYOR,
        faturaNo,
      },
      include: { abonelik: true },
    });

    await this.abonelik.olayYaz(kayit.abonelikId, 'havale.fatura.kesildi', {
      aciklama: `Fatura ${faturaNo}`,
      aktor: aktorId,
      veri: { havaleId, faturaNo },
    });

    return kayit;
  }

  /**
   * 3. Ödemeyi onayla ve aboneliği uzat.
   *
   * Bütünlük açısından tek işlemde: hem havale kaydı ONAYLANDI olsun hem
   * abonelik uzasın. Biri olup diğeri olmazsa müşteri ya ödediği hâlde
   * giremez ya ödemeden girer.
   */
  async odemeyiOnayla(p: {
    havaleId: string;
    onaylayanId: string;
    dekontUrl?: string;
    /** Fatura zaten elle kesildiyse otomatik kesim atlanır. */
    faturaKesme?: boolean;
  }) {
    const mevcut = await this.prisma.havaleOdemesi.findUniqueOrThrow({
      where: { id: p.havaleId },
      include: { abonelik: { include: { paketSurumu: true } } },
    });

    if (mevcut.durum === HavaleDurumu.ONAYLANDI) {
      throw new BadRequestException('Bu ödeme zaten onaylanmış');
    }
    if (mevcut.durum === HavaleDurumu.IPTAL) {
      throw new BadRequestException('İptal edilmiş ödeme onaylanamaz');
    }

    const sonuc = await this.prisma.$transaction(async (tx) => {
      const abonelik = await this.abonelik.erisimiUzat(
        mevcut.abonelikId,
        mevcut.ayAdedi,
        {
          aktor: p.onaylayanId,
          aciklama: `Havale onayı — ${mevcut.teklifNo ?? p.havaleId} (${mevcut.ayAdedi} ay)`,
          tx,
        },
      );

      await tx.abonelik.update({
        where: { id: mevcut.abonelikId },
        data: { odemeYontemi: 'HAVALE' },
      });

      const havale = await tx.havaleOdemesi.update({
        where: { id: p.havaleId },
        data: {
          durum: HavaleDurumu.ONAYLANDI,
          onaylayanId: p.onaylayanId,
          onaylandi: new Date(),
          dekontUrl: p.dekontUrl,
          uzatilanTarih: abonelik.erisimSonu,
        },
      });

      return { abonelik, havale };
    });

    // Fatura kuyruğa — işlem dışında, çünkü muhasebe servisi yavaşsa
    // aboneliğin uzaması gecikmemeli.
    if (p.faturaKesme !== false) {
      const donemBasi = new Date();
      await this.fatura
        .kuyrugaAl({
          abonelikId: mevcut.abonelikId,
          tahsilatKodu: `havale:${p.havaleId}`,
          tutar: Number(mevcut.tutar),
          paraBirimi: mevcut.paraBirimi,
          donemBasi,
          donemSonu: sonuc.abonelik.erisimSonu,
        })
        .catch((e) => this.logger.error(`Havale faturası kuyruğa alınamadı: ${e}`));
    }

    await this.musteriyeHaberVer(mevcut.abonelikId, sonuc.abonelik.erisimSonu);
    return sonuc;
  }

  async iptalEt(havaleId: string, aktorId: string, neden?: string) {
    const kayit = await this.prisma.havaleOdemesi.findUniqueOrThrow({
      where: { id: havaleId },
    });
    if (kayit.durum === HavaleDurumu.ONAYLANDI) {
      throw new BadRequestException(
        'Onaylanmış ödeme iptal edilemez — abonelik uzatıldı. ' +
          'Düzeltme gerekiyorsa aboneliği elle kısaltın.',
      );
    }
    const guncel = await this.prisma.havaleOdemesi.update({
      where: { id: havaleId },
      data: { durum: HavaleDurumu.IPTAL, aciklama: neden },
    });
    await this.abonelik.olayYaz(kayit.abonelikId, 'havale.iptal', {
      aciklama: neden,
      aktor: aktorId,
      veri: { havaleId },
    });
    return guncel;
  }

  /** Bekleyen havaleler — yönetim ekranı için. */
  async bekleyenler() {
    return this.prisma.havaleOdemesi.findMany({
      where: {
        durum: {
          in: [
            HavaleDurumu.TEKLIF,
            HavaleDurumu.FATURA_KESILDI,
            HavaleDurumu.ODEME_BEKLENIYOR,
          ],
        },
      },
      include: { abonelik: { include: { paketSurumu: { include: { paket: true } } } } },
      orderBy: { olusturuldu: 'asc' },
    });
  }

  // ── Yardımcılar ─────────────────────────────────────────────────────────
  private async abonelikBulYaDaOlustur(firmaId: string, paketSurumuId: string) {
    const mevcut = await this.prisma.abonelik.findUnique({ where: { firmaId } });
    if (mevcut) return mevcut;

    return this.prisma.abonelik.create({
      data: {
        firmaId,
        paketSurumuId,
        durum: 'ASKIDA', // ödeme onaylanınca AKTIF'e geçecek
        erisimSonu: new Date(), // uzatma buradan başlar
        odemeYontemi: 'HAVALE',
      },
    });
  }

  private async teklifNoUret(): Promise<string> {
    const yil = new Date().getFullYear();
    const sayi = await this.prisma.havaleOdemesi.count({
      where: { olusturuldu: { gte: new Date(`${yil}-01-01`) } },
    });
    return `TKF-${yil}-${String(sayi + 1).padStart(4, '0')}`;
  }

  private async musteriyeHaberVer(abonelikId: string, yeniTarih: Date) {
    const ab = await this.prisma.abonelik.findUnique({
      where: { id: abonelikId },
      include: { paketSurumu: { include: { paket: true } } },
    });
    if (!ab) return;
    const firma = await this.prisma.firma.findUnique({
      where: { id: ab.firmaId },
      select: { ad: true, faturaEposta: true, yetkiliEposta: true },
    });
    if (!firma) return;

    await this.eposta
      .gonder({
        kime: firma.faturaEposta ?? firma.yetkiliEposta,
        konu: 'MetaPriceX — ödemeniz alındı, aboneliğiniz uzatıldı',
        baslik: 'Ödemeniz için teşekkürler',
        paragraflar: [
          `${firma.ad} için ${ab.paketSurumu.paket.ad} aboneliğiniz ` +
            `${tarihYaz(yeniTarih)} tarihine kadar uzatıldı.`,
          'Faturanız ayrıca iletilecektir.',
          'İyi çalışmalar.',
        ],
        dugme: {
          etiket: 'Uygulamaya git',
          url: `${process.env.UYGULAMA_URL}`,
        },
      })
      .catch((e) => this.logger.error(`Havale bildirimi gönderilemedi: ${e}`));
  }
}
