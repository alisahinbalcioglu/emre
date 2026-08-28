import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikDurumu, Prisma } from '@prisma/client';
import { IyzicoClient, IyzicoAbonelikDetayi } from '../iyzico/iyzico.client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Abonelik durum makinesi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Geçerli geçişler:
 *
 *      DENEME ──ödeme başarılı──────────────► AKTIF
 *         └────süre doldu──────────────────► SONA_ERDI
 *
 *      AKTIF ──tahsilat başarısız──────────► ODEME_BEKLIYOR
 *        └───müşteri iptal──────────────────► IPTAL
 *
 *      ODEME_BEKLIYOR ──tahsilat başarılı──► AKTIF
 *                     └──tolerans doldu────► KISITLI
 *
 *      KISITLI ──tahsilat başarılı─────────► AKTIF
 *              └──kısıt süresi doldu───────► ASKIDA
 *
 *      ASKIDA ──tahsilat başarılı──────────► AKTIF
 *             └──160 gün / iyzico EXPIRED──► SONA_ERDI
 *
 *      IPTAL ──dönem sonu──────────────────► SONA_ERDI
 *            └──müşteri vazgeçti───────────► AKTIF
 *
 *  Her geçiş AbonelikOlayi tablosuna yazılır. Bir müşteri "ben ödedim ama
 *  hesabım kapandı" dediğinde tek bakılacak yer orasıdır.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const GECERLI_GECISLER: Record<AbonelikDurumu, AbonelikDurumu[]> = {
  DENEME: ['AKTIF', 'SONA_ERDI', 'IPTAL'] as AbonelikDurumu[],
  AKTIF: ['ODEME_BEKLIYOR', 'IPTAL', 'SONA_ERDI'] as AbonelikDurumu[],
  ODEME_BEKLIYOR: ['AKTIF', 'KISITLI', 'IPTAL', 'SONA_ERDI'] as AbonelikDurumu[],
  KISITLI: ['AKTIF', 'ASKIDA', 'IPTAL', 'SONA_ERDI'] as AbonelikDurumu[],
  ASKIDA: ['AKTIF', 'SONA_ERDI'] as AbonelikDurumu[],
  IPTAL: ['AKTIF', 'SONA_ERDI'] as AbonelikDurumu[],
  SONA_ERDI: ['AKTIF'] as AbonelikDurumu[], // yeniden abone olabilir
};

export class GecersizGecisHatasi extends Error {
  constructor(onceki: AbonelikDurumu, yeni: AbonelikDurumu) {
    super(`Geçersiz abonelik geçişi: ${onceki} → ${yeni}`);
    this.name = 'GecersizGecisHatasi';
  }
}

/** iyzico durumunun bizim durumumuza etkisi. */
export function iyzicoDurumunuYorumla(
  iyzico: IyzicoAbonelikDetayi['subscriptionStatus'],
): AbonelikDurumu | null {
  switch (iyzico) {
    case 'ACTIVE':
      return AbonelikDurumu.AKTIF;
    case 'CANCELED':
      return AbonelikDurumu.IPTAL;
    case 'EXPIRED':
      return AbonelikDurumu.SONA_ERDI;
    case 'UNPAID':
      // Bizim tarafta doğrudan KISITLI demiyoruz — tolerans süresini
      // biz yönetiyoruz. Yalnızca "ödeme sorunu var" bilgisini alıyoruz.
      return AbonelikDurumu.ODEME_BEKLIYOR;
    case 'PENDING':
    case 'UPGRADED':
      return null; // durumu değiştirmez
    default:
      return null;
  }
}

@Injectable()
export class AbonelikServisi {
  private readonly logger = new Logger(AbonelikServisi.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly iyzico: IyzicoClient,
  ) {}

  gecisGecerliMi(onceki: AbonelikDurumu, yeni: AbonelikDurumu): boolean {
    if (onceki === yeni) return true;
    return GECERLI_GECISLER[onceki]?.includes(yeni) ?? false;
  }

  /**
   * Durumu değiştirir ve olay günlüğüne yazar.
   * Geçersiz geçişte hata fırlatır — sessizce yutmaz.
   */
  async durumDegistir(
    abonelikId: string,
    yeniDurum: AbonelikDurumu,
    p: {
      aciklama?: string;
      aktor?: string;
      veri?: Prisma.InputJsonValue;
      erisimSonu?: Date;
      /** Dunning sayaçlarını sıfırla (başarılı tahsilatta). */
      sayaclariSifirla?: boolean;
      tx?: Prisma.TransactionClient;
    } = {},
  ) {
    // Prisma.TransactionClient ile PrismaService aynı model yüzeyini paylaşır.
    const db = (p.tx ?? this.prisma) as PrismaService;
    const mevcut = await db.abonelik.findUniqueOrThrow({
      where: { id: abonelikId },
    });

    if (!this.gecisGecerliMi(mevcut.durum, yeniDurum)) {
      throw new GecersizGecisHatasi(mevcut.durum, yeniDurum);
    }

    const guncel = await db.abonelik.update({
      where: { id: abonelikId },
      data: {
        durum: yeniDurum,
        ...(p.erisimSonu ? { erisimSonu: p.erisimSonu } : {}),
        ...(p.sayaclariSifirla
          ? {
              ilkBasarisizlik: null,
              denemeSayisi: 0,
              sonDeneme: null,
              kisitlandi: null,
            }
          : {}),
      },
    });

    await db.abonelikOlayi.create({
      data: {
        abonelikId,
        tip: 'durum.degisti',
        oncekiDurum: mevcut.durum,
        yeniDurum,
        aciklama: p.aciklama,
        veri: p.veri,
        aktor: p.aktor ?? 'sistem',
      },
    });

    this.logger.log(
      `Abonelik ${abonelikId}: ${mevcut.durum} → ${yeniDurum}` +
        (p.aciklama ? ` (${p.aciklama})` : ''),
    );
    return guncel;
  }

  /** Yalnızca günlüğe yazar, durum değiştirmez. */
  async olayYaz(
    abonelikId: string,
    tip: string,
    p: { aciklama?: string; veri?: Prisma.InputJsonValue; aktor?: string } = {},
  ) {
    return this.prisma.abonelikOlayi.create({
      data: {
        abonelikId,
        tip,
        aciklama: p.aciklama,
        veri: p.veri,
        aktor: p.aktor ?? 'sistem',
      },
    });
  }

  // ── Webhook'tan gelen başarılı tahsilat ─────────────────────────────────
  /**
   * Webhook gövdesinde tutar ve dönem YOK — yalnızca referans kodları var.
   * Bu yüzden dönem sonunu öğrenmek için iyzico'ya sormak zorundayız.
   */
  async tahsilatBasarili(abonelikKodu: string, siparisKodu: string) {
    const ab = await this.prisma.abonelik.findUnique({
      where: { iyzicoAbonelikKodu: abonelikKodu },
      include: { paketSurumu: true },
    });
    if (!ab) {
      this.logger.warn(
        `Bilinmeyen abonelik kodu: ${abonelikKodu} — webhook yok sayıldı`,
      );
      return null;
    }

    const detay = await this.iyzico.abonelikGetir(abonelikKodu);
    const siparis = detay.orders?.find((o) => o.referenceCode === siparisKodu);
    const donemSonu = siparis?.endPeriod
      ? new Date(siparis.endPeriod)
      : this.donemSonuHesapla(ab.erisimSonu, ab.paketSurumu.periyot, ab.paketSurumu.periyotAdedi);

    await this.durumDegistir(ab.id, AbonelikDurumu.AKTIF, {
      aciklama: `Tahsilat başarılı (sipariş ${siparisKodu})`,
      aktor: 'webhook',
      erisimSonu: donemSonu,
      sayaclariSifirla: true,
      veri: { siparisKodu, iyzicoDurum: detay.subscriptionStatus },
    });

    await this.prisma.abonelik.update({
      where: { id: ab.id },
      data: {
        iyzicoDurum: detay.subscriptionStatus,
        iyzicoSonKontrol: new Date(),
      },
    });

    return { abonelik: ab, siparis, donemSonu };
  }

  // ── Webhook'tan gelen başarısız tahsilat ────────────────────────────────
  async tahsilatBasarisiz(abonelikKodu: string, siparisKodu: string) {
    const ab = await this.prisma.abonelik.findUnique({
      where: { iyzicoAbonelikKodu: abonelikKodu },
    });
    if (!ab) {
      this.logger.warn(`Bilinmeyen abonelik kodu: ${abonelikKodu}`);
      return null;
    }

    // Zaten ödeme bekliyor/kısıtlı/askıdaysa durumu geri almıyoruz;
    // yalnızca ilk başarısızlık zamanını işaretliyoruz.
    if (ab.durum === AbonelikDurumu.AKTIF || ab.durum === AbonelikDurumu.DENEME) {
      await this.durumDegistir(ab.id, AbonelikDurumu.ODEME_BEKLIYOR, {
        aciklama: `Tahsilat başarısız (sipariş ${siparisKodu})`,
        aktor: 'webhook',
        veri: { siparisKodu },
      });
    } else {
      await this.olayYaz(ab.id, 'tahsilat.basarisiz', {
        aciklama: `Sipariş ${siparisKodu}`,
        veri: { siparisKodu },
        aktor: 'webhook',
      });
    }

    await this.prisma.abonelik.update({
      where: { id: ab.id },
      data: {
        ilkBasarisizlik: ab.ilkBasarisizlik ?? new Date(),
        // Dunning zamanlayıcısının bu kaydı hemen görmesi için
        sonDeneme: ab.sonDeneme ?? new Date(),
      },
    });

    return ab;
  }

  private donemSonuHesapla(
    baslangic: Date,
    periyot: string,
    adet: number,
  ): Date {
    const d = new Date(baslangic);
    switch (periyot) {
      case 'DAILY':
        d.setDate(d.getDate() + adet);
        break;
      case 'WEEKLY':
        d.setDate(d.getDate() + 7 * adet);
        break;
      case 'YEARLY':
        d.setFullYear(d.getFullYear() + adet);
        break;
      case 'MONTHLY':
      default:
        d.setMonth(d.getMonth() + adet);
        break;
    }
    return d;
  }

  /** Havale akışı ve yönetici müdahalesi için: erişimi elle uzat. */
  async erisimiUzat(
    abonelikId: string,
    ayAdedi: number,
    p: { aktor: string; aciklama: string; tx?: Prisma.TransactionClient },
  ) {
    const db = (p.tx ?? this.prisma) as PrismaService;
    const ab = await db.abonelik.findUniqueOrThrow({ where: { id: abonelikId } });

    // Süresi geçmişse bugünden, geçmemişse mevcut bitişten uzat.
    const simdi = new Date();
    const baslangic = ab.erisimSonu > simdi ? ab.erisimSonu : simdi;
    const yeniSon = new Date(baslangic);
    yeniSon.setMonth(yeniSon.getMonth() + ayAdedi);

    return this.durumDegistir(abonelikId, AbonelikDurumu.AKTIF, {
      erisimSonu: yeniSon,
      sayaclariSifirla: true,
      aktor: p.aktor,
      aciklama: p.aciklama,
      veri: { ayAdedi, oncekiErisimSonu: ab.erisimSonu.toISOString() },
      tx: p.tx,
    });
  }
}
