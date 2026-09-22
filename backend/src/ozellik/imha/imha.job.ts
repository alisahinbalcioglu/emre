import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../altyapi/db/prisma.service';
import { CaprazFirmaBagiHatasi, ImhaServisi, ImhaSonucu } from './imha.servisi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GUNLUK VERI IMHASI ISI (plan 5.8 · §5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Gunde BIR KEZ kosar ve `imhaTarihi` gecmis kayitlari imha eder.
 *
 *  ⚠⚠ ADAY SECIMI YALNIZ `imhaTarihi`E BAKAR. `deletedAt` BU DOSYADA HIC
 *     OKUNMAZ. Ikisi FARKLI seyler:
 *        `deletedAt`  = hesap KAPALI (K1: 30 gun yasar, geri donebilir)
 *        `imhaTarihi` = veriyi SILME ani (kapatma + 30 gun)
 *     `deletedAt`e bakan bir sorgu, kapatmanin ERTESI GUNU musterinin butun
 *     verisini silerdi ve geri donus hicbir zaman calismazdi. Kabul olcutu 2
 *     bunu mutasyonla siniyor.
 *
 *  SAAT: 04:15. `mutabakat.job` 03:30'da, dunning merdiveni ondan sonra
 *  kosuyor; imha en sona birakildi ki ayni gece bir odeme hesabi GERI ACARSA
 *  (K1 · §4.6 `imhaTarihi` temizlenir) imha o kaydi hic gormesin.
 *
 *  ⚠ `ScheduleModule.forRoot()` zaten `odeme.module.ts`te cagriliyor; Nest
 *    statik modulleri tekillestirdigi icin `ImhaModule` onu TEKRAR cagirmaz
 *    (ayni not `firma.module.ts` ve `admin.module.ts`te de yazili).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class ImhaJob {
  private readonly logger = new Logger(ImhaJob.name);

  /**
   * Tek kosumda islenecek AZAMI kayit. Bir gun toplu kapatma olursa gece
   * boyunca suren, kilit tutan bir kosum olmasin; kalanlar ertesi gece.
   */
  private readonly AZAMI_KAYIT = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly imha: ImhaServisi,
  ) {}

  @Cron('0 15 4 * * *') // her gece 04:15
  async gunlukImha(): Promise<void> {
    await this.kosumYap(new Date());
  }

  /**
   * Isin govdesi — testten ve (gerekirse) elle cagrilabilsin diye ayri.
   * `simdi` disaridan verilir: "30 gun gecti mi" sinamasi sistem saatine
   * degil, verilen ana gore olculebilsin.
   */
  async kosumYap(simdi: Date): Promise<ImhaSonucu[]> {
    const sonuclar: ImhaSonucu[] = [];

    // ── 1) FIRMA IMHASI ──────────────────────────────────────────────────
    const firmalar: Array<{ id: string }> = await this.prisma.firma.findMany({
      where: { imhaTarihi: { lt: simdi } },
      select: { id: true },
      orderBy: { imhaTarihi: 'asc' },
      take: this.AZAMI_KAYIT,
    });

    for (const f of firmalar) {
      try {
        const sonuc = await this.imha.firmaImhaEt(f.id);
        sonuclar.push(sonuc);
        if (!sonuc.atlandi) {
          this.logger.log(
            `Firma imha edildi (${f.id}): ` +
              Object.entries(sonuc.sayilar)
                .filter(([, n]) => n > 0)
                .map(([t, n]) => `${t}=${n}`)
                .join(' '),
          );
        }
      } catch (e) {
        // ⚠ SESSIZ YUTMA YASAK. Firma imha EDILMEDI, transaction geri alindi,
        //   `imhaTarihi` duruyor → yarin gece tekrar denenir. Capraz bag
        //   hatasi insan karari ister, bu yuzden ayrica isaretlenir.
        if (e instanceof CaprazFirmaBagiHatasi) {
          this.logger.error(
            `IMHA DURDURULDU — INSAN KARARI GEREKIYOR (${f.id}): ${e.message}`,
          );
        } else {
          this.logger.error(`Firma imhasi basarisiz (${f.id}): ${e}`);
        }
      }
    }

    // ── 2) UYE IMHASI (firma devam ediyor) ───────────────────────────────
    // Firmasi da imha kuyrugunda olan kullanici BU YOLDAN gecmez: onu firma
    // imhasi zaten ele aldi (ya da almadi — o zaman yarim bir anonimlestirme
    // yapip firmanin icerigini birakmak, "imha edildi" yalanini uretirdi).
    const imhaliFirmalar = new Set(
      (
        await this.prisma.firma.findMany({
          where: { imhaTarihi: { not: null } },
          select: { id: true },
        })
      ).map((f: { id: string }) => f.id),
    );

    const uyeler: Array<{ id: string; firmaId: string | null }> =
      await this.prisma.user.findMany({
        where: { imhaTarihi: { lt: simdi } },
        select: { id: true, firmaId: true },
        orderBy: { imhaTarihi: 'asc' },
        take: this.AZAMI_KAYIT,
      });

    for (const u of uyeler) {
      if (u.firmaId && imhaliFirmalar.has(u.firmaId)) continue;
      try {
        const sonuc = await this.imha.uyeImhaEt(u.id);
        sonuclar.push(sonuc);
        if (!sonuc.atlandi) this.logger.log(`Uye imha edildi (${u.id})`);
      } catch (e) {
        this.logger.error(`Uye imhasi basarisiz (${u.id}): ${e}`);
      }
    }

    if (firmalar.length === this.AZAMI_KAYIT || uyeler.length === this.AZAMI_KAYIT) {
      this.logger.warn(
        `Imha kosumu ${this.AZAMI_KAYIT} kayit sinirina dayandi — kalanlar ertesi gece.`,
      );
    }

    // ── 3) YAS EKSENI: SURESI DOLMUS DENEME KAYITLARI ────────────────────
    // ⚠ 1 ve 2'DEN BAGIMSIZ, BILEREK. Ustteki iki adim `imhaTarihi`e, yani
    //   HESABIN durumuna bakar. Bu adim kaydin KENDI yasina bakar ve acik
    //   hesaplarin kayitlarini da kapsar — Gizlilik Politikasi'ndaki "2 yil"
    //   cumlesi ancak boyle dogru olur. Gerekce: `saklama-sureleri.ts`.
    // ⚠ `AZAMI_KAYIT` UYGULANMIYOR: tek tabloda tek `deleteMany`; parcalamak
    //   kilit suresini kisaltmaz, yalnizca ayni isi N gece yayardi.
    try {
      await this.imha.eskiDenemeKayitlariniSil(simdi);
    } catch (e) {
      // Bu adimin dusmesi 1 ve 2'yi GECERSIZ KILMAZ; onlar zaten islendi.
      // Sessiz yutma yok: yarin gece tekrar denenir, kayit log'da durur.
      this.logger.error(`Suresi dolmus deneme kaydi temizligi basarisiz: ${e}`);
    }

    return sonuclar;
  }
}
