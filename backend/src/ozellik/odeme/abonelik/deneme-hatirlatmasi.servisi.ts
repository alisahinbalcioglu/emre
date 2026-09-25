import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AbonelikDurumu, OdemeYontemi, Prisma } from '@prisma/client';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { EpostaServisi } from '../eposta/eposta.servisi';
import { denemeBitiyorEpostasi } from '../eposta/musteri-epostalari';

/* ═══════════════════════════════════════════════════════════════════════════
   "DENEME SÜRENİZ BİTİYOR" HATIRLATMASI (25.09.2026)
   ═══════════════════════════════════════════════════════════════════════════

   ÖLÇÜLEN BOŞLUK: deneme bitince iyzico ilk ödemeyi kayıtlı karttan KENDİ
   çeker; müşteriye önceden hiçbir e-posta gitmiyordu (yalnız uygulama içi
   şerit, son 5 gün). Emre (25.09): ilk çekimden 3 GÜN önce, BİR kez.

   KAPSAM: yalnız KART ile denemedeki, iptal etmemiş satırlar — iptal eden
   ya da havaleyle ödeyen için kartından çekilecek bir ücret yok.

   TAM BİR KEZ: e-posta gönderilmeden ÖNCE `denemeHatirlatmasi` KOŞULLU yazılır
   (`null` iken). Aynı satırı iki tur / iki süreç aynı anda görse de yalnız
   biri yazar ve gönderir. Tur kilidi (`calisiyor`) süreç içi örtüşmeyi keser
   (cron 3.2 turu bitmesini beklemeden başlatır). Gönderim düşerse işaret GERİ
   alınır: satır hâlâ penceredeyse sonraki tur yeniden dener.

   ZAMAN: her gün 09:00 İstanbul. Pencere (şimdi, 3 gün sonraki GÜNÜN sonu] →
   hatırlatma ilk çekim gününden 3 takvim günü önce, sabah gelir (bkz.
   `hatirlatmaAdayKosulu`).

   BİLİNEN SINIR: SMTP iletiyi KABUL ettikten sonra bağlantı düşerse (zaman
   aşımı) işaret geri alınır ve ertesi gün ikinci hatırlatma gidebilir —
   gönderim onayı ile işaret tek işlemde tutulamaz.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DENEME_HATIRLATMA_GUNU = 3;
const GUN_MS = 24 * 60 * 60 * 1000;
/** İstanbul UTC+3 — 2016'dan beri yaz saati uygulaması YOK. */
const ISTANBUL_MS = 3 * 60 * 60 * 1000;
/** Tur başına aday sınırı (dolarsa günlüğe uyarı; kalanlar sonraki turda). */
export const TUR_SINIRI = 200;

export interface TaramaSonucu {
  aday: number;
  gonderilen: number;
  atlanan: number;
  dusen: number;
}

/** `t`nin İstanbul takvim gününün SON anı. */
export function istanbulGunSonu(t: Date): Date {
  const gunBasi = Math.floor((t.getTime() + ISTANBUL_MS) / GUN_MS) * GUN_MS;
  return new Date(gunBasi + GUN_MS - 1 - ISTANBUL_MS);
}

/**
 * Hatırlatmaya aday: KART + denemede + iptalsiz + iyzico'da açık + gönderilmemiş
 * + ilk çekim penceresinde.
 *  · DENEME TARİHE GÖRE (`yonetici-islemi.ts` H1 ile aynı okuma): gece
 *    mutabakatı eskiden deneme satırını AKTIF'e çekiyordu; ilk çekimi hâlâ
 *    GELECEKTE olan AKTIF satır da denemededir (pencere `denemeSonu > şimdi`).
 *  · "3 gün kala" TAKVİM günüdür: 09:00 turu, ilk çekimi 3 gün sonraki GÜNÜN
 *    sonuna kadar olanları alır. (şimdi, şimdi+72 sa] çoğu müşteriye 2 gün kala
 *    düşüyordu (inceleme M7).
 *  · iyzico'da kapalı bilinen kart aboneliğinden çekim YAPILMAZ
 *    (`kartAboneligiKapaliMi` ile aynı durumlar) — hatırlatma yalan olurdu.
 */
export function hatirlatmaAdayKosulu(simdi: Date): Prisma.AbonelikWhereInput {
  return {
    durum: { in: [AbonelikDurumu.DENEME, AbonelikDurumu.AKTIF] },
    odemeYontemi: OdemeYontemi.KART,
    iptalTalebi: null,
    denemeHatirlatmasi: null,
    OR: [{ iyzicoDurum: null }, { iyzicoDurum: { notIn: ['CANCELED', 'EXPIRED'] } }],
    denemeSonu: {
      gt: simdi,
      lte: istanbulGunSonu(new Date(simdi.getTime() + DENEME_HATIRLATMA_GUNU * GUN_MS)),
    },
  };
}

type Aday = {
  id: string;
  firmaId: string;
  denemeSonu: Date | null;
  planliPaketSurumuId: string | null;
  paketSurumu: {
    tutar: Prisma.Decimal;
    paraBirimi: string;
    periyot: string;
    periyotAdedi: number;
    paket: { ad: string };
  };
};

@Injectable()
export class DenemeHatirlatmasiServisi {
  private readonly logger = new Logger(DenemeHatirlatmasiServisi.name);
  private readonly uygulamaUrl: string;
  private calisiyor = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eposta: EpostaServisi,
    config: ConfigService,
  ) {
    this.uygulamaUrl = config.get<string>('UYGULAMA_URL') ?? 'https://app.metapricex.com';
  }

  @Cron('0 9 * * *', { name: 'deneme-hatirlatmasi', timeZone: 'Europe/Istanbul' })
  async gunlukTarama(): Promise<void> {
    await this.tara(new Date()).catch((e) =>
      this.logger.error(`Deneme hatirlatma taramasi dustu: ${e instanceof Error ? e.message : String(e)}`),
    );
  }

  async tara(simdi: Date): Promise<TaramaSonucu> {
    const sonuc: TaramaSonucu = { aday: 0, gonderilen: 0, atlanan: 0, dusen: 0 };
    if (this.calisiyor) return sonuc;
    this.calisiyor = true;
    try {
      const adaylar: Aday[] = await this.prisma.abonelik.findMany({
        where: hatirlatmaAdayKosulu(simdi),
        select: {
          id: true,
          firmaId: true,
          denemeSonu: true,
          planliPaketSurumuId: true,
          paketSurumu: {
            select: {
              tutar: true,
              paraBirimi: true,
              periyot: true,
              periyotAdedi: true,
              paket: { select: { ad: true } },
            },
          },
        },
        orderBy: { denemeSonu: 'asc' },
        take: TUR_SINIRI,
      });
      sonuc.aday = adaylar.length;
      if (adaylar.length === TUR_SINIRI) {
        this.logger.warn(`Deneme hatirlatmasi: tur siniri (${TUR_SINIRI}) doldu — kalan adaylar sonraki turda`);
      }
      for (const ab of adaylar) {
        const s = await this.tekHatirlatma(ab, simdi);
        if (s === 'gonderildi') sonuc.gonderilen++;
        else if (s === 'dustu') sonuc.dusen++;
        else sonuc.atlanan++;
      }
      if (sonuc.aday) {
        this.logger.log(
          `Deneme hatirlatmasi: aday ${sonuc.aday}, gonderilen ${sonuc.gonderilen}, ` +
            `atlanan ${sonuc.atlanan}, dusen ${sonuc.dusen}`,
        );
      }
      return sonuc;
    } finally {
      this.calisiyor = false;
    }
  }

  private async tekHatirlatma(ab: Aday, simdi: Date): Promise<'gonderildi' | 'atlandi' | 'dustu'> {
    // TAM BİR KEZ: işaret GÖNDERİMDEN ÖNCE ve koşullu; aday koşulu yazım
    // anında yeniden sınanır (arada iptal/ödeme olduysa 0 satır).
    const isaret = await this.prisma.abonelik.updateMany({
      where: { ...hatirlatmaAdayKosulu(simdi), id: ab.id },
      data: { denemeHatirlatmasi: simdi },
    });
    if (isaret.count !== 1) return 'atlandi';

    try {
      const firma = await this.prisma.firma.findUnique({
        where: { id: ab.firmaId },
        select: { ad: true, faturaEposta: true, yetkiliEposta: true },
      });
      const kime = firma?.faturaEposta ?? firma?.yetkiliEposta;
      if (!firma || !kime) {
        // Adres yokken yeniden denemek her gün aynı uyarıyı üretirdi; işaret kalır.
        this.logger.warn(`Deneme hatirlatmasi ATLANDI: firma ${ab.firmaId} icin adres yok`);
        return 'atlandi';
      }
      await this.eposta.gonderKritik({
        kime,
        ...denemeBitiyorEpostasi({
          firmaAdi: firma.ad,
          paketAdi: ab.paketSurumu.paket.ad,
          cekimTarihi: ab.denemeSonu!,
          simdi,
          // Planlı paket değişimi ilk çekimin tutarını değiştirebilir: rakam
          // YAZILMAZ (yanlış tutar sözü vermektense genel cümle).
          tutar: ab.planliPaketSurumuId ? null : Number(ab.paketSurumu.tutar),
          paraBirimi: ab.paketSurumu.paraBirimi,
          periyot: ab.paketSurumu.periyot,
          periyotAdedi: ab.paketSurumu.periyotAdedi,
          uygulamaUrl: this.uygulamaUrl,
        }),
      });
      return 'gonderildi';
    } catch (e) {
      // Gönderilemedi: işaret GERİ — yalnız BU turun yazdığı işaret.
      await this.prisma.abonelik
        .updateMany({ where: { id: ab.id, denemeHatirlatmasi: simdi }, data: { denemeHatirlatmasi: null } })
        .catch((e2) =>
          this.logger.error(
            `Deneme hatirlatmasi isareti geri alinamadi (abonelik ${ab.id}): ` +
              `${e2 instanceof Error ? e2.message : String(e2)} — hatirlatma bir daha GITMEZ`,
          ),
        );
      this.logger.error(
        `Deneme hatirlatmasi gonderilemedi (abonelik ${ab.id}), sonraki turda yeniden denenecek: ` +
          `${e instanceof Error ? e.message : String(e)}`,
      );
      return 'dustu';
    }
  }
}
