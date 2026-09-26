import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AbonelikDurumu, OdemeYontemi } from '@prisma/client';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikServisi } from './abonelik.servisi';
import { mirastaMi } from './miras-hakki';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MİRASA DÖNÜŞ TARAMASI — 10 dakikada bir (26.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Ücretli dönemi biten ve miras hakkı süren satırı miras paketine döndürür
 *  (`AbonelikServisi.mirasaDon` — tek yazıcı; kural `miras-hakki.ts`).
 *
 *  NEDEN AYRI İŞ:
 *   · HAVALE + AKTIF satırın dönemi bitince bugün HİÇBİR iş satırı kapatmıyor
 *     (saatlik `suresiDolanlariKapat` yalnız DENEME/IPTAL'e bakar; erişim
 *     yalnız `erisimSonu` emniyet kemeriyle kapanır). Miras firma havaleyle
 *     1 ay Pro alırsa dönem sonunda mirasa dönecek bir tetik gerekiyordu.
 *   · IPTAL satırı saatlik iş de `durumDegistir(SONA_ERDI)` geçidinden mirasa
 *     döndürür; bu tarama arayı 10 dakikaya indirir (dönem bitti ama satır
 *     dönmedi aralığında müşteri erişimsiz "doğrulanıyor" görür). İkisi aynı
 *     satıra gelirse koşullu yazım TEK dönüş yazar.
 *   · Saatlik işe koşul eklemek yerine ayrı dosya: `mutabakat.job.ts` başka
 *     bir oturumun çalışma alanı (koordinatör kısıtı, 26.09).
 *
 *  KART + AKTIF satır BİLEREK ALINMAZ: dönemi geçmiş kartlı satır = tahsilat
 *  webhook'u gecikmiş/kaybolmuş (gece mutabakatı kural 6 oynatır); HAVALE'ye
 *  çevirmek o ödemeyi "çift tahsilat" sayardı.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class MirasDonusuJob {
  private readonly logger = new Logger(MirasDonusuJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly abonelikServisi: AbonelikServisi,
  ) {}

  @Cron('0 */10 * * * *') // 10 dakikada bir
  async mirasaDonenleriTara(): Promise<number> {
    const simdi = new Date();
    const adaylar = await this.prisma.abonelik.findMany({
      where: {
        mirasPaketSurumuId: { not: null },
        mirasErisimSonu: { gt: simdi },
        erisimSonu: { lte: simdi },
        OR: [
          { durum: AbonelikDurumu.IPTAL },
          { durum: AbonelikDurumu.AKTIF, odemeYontemi: OdemeYontemi.HAVALE },
        ],
      },
      select: {
        id: true,
        paketSurumuId: true,
        erisimSonu: true,
        mirasPaketSurumuId: true,
        mirasErisimSonu: true,
        paketSurumu: { select: { paket: { select: { kod: true } } } },
      },
    });

    let donen = 0;
    for (const ab of adaylar) {
      // Satır zaten mirasta (dönmüş ya da hiç ayrılmamış): erişimi miras, dönüş yok.
      if (mirastaMi(ab)) continue;
      try {
        const sonuc = await this.abonelikServisi.mirasaDon(ab.id, {
          aktor: 'miras-donusu',
          aciklama: 'Ücretli dönem bitti',
        });
        // `donem-suruyor`: aday okunduktan sonra satın alma/ödeme geldi (bekçi);
        // `hak-yok`: hak arada bitti — ikisinde de yazım YOK.
        if (sonuc.sonuc === 'dondu') donen++;
      } catch (e) {
        // Koşullu yazım başka bir yazımla yarıştı (P2025) ya da DB hatası:
        // sonraki tur taze satırla yeniden karar verir.
        this.logger.error(
          `Mirasa dönüş yazılamadı (${ab.id}): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    if (donen > 0) this.logger.log(`${donen} abonelik ücretli dönem bitince miras paketine döndü`);
    return donen;
  }
}
