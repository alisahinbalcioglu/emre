import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../altyapi/db/prisma.service';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DWG DOSYA SAHIPLIGI — capraz-tenant kapisi (G2, 28.08)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ OLCULMUS SIZINTI: DWG dosyalari Python servisinin cache'inde `file_id`
 *  anahtariyla durur. Bu anahtarin KIME ait oldugunu soyleyen hicbir kayit
 *  YOKTU ve DwgEngineController'in yedi ucunun hicbiri kullaniciyi parametre
 *  olarak bile ALMIYORDU — yani firma suzgeci YAPISAL OLARAK IMKANSIZDI.
 *
 *  Somut sonuc: `GET /api/dwg-engine/geometry/:fileId` ucunda fileId'yi bilen
 *  HERHANGI bir oturumlu kullanici BASKA bir firmanin projesinin
 *  koordinatlarini okuyabiliyordu. Mimari cizimin geometrisi projenin ta
 *  kendisidir; bu ticari sir sizintisidir.
 *
 *  ── NEDEN NEST KATMANINDA ────────────────────────────────────────────────
 *  Python servisi `klasor-duzeni.txt`te DONMUS BLOK olarak ilan edilmistir.
 *  Izolasyonu oraya tasimak donmus bloga dokunmak ve iki serviste birden
 *  kimlik tasimak demekti. Bunun yerine bag Nest tarafinda kurulur:
 *  URETICI uclar (layers/upload) kaydi YAZAR, TUKETICI uclar
 *  (parse/status/geometry) DOGRULAR. Python servisi degismez.
 *
 *  ── ESKI DOSYALAR (kayitsizlar) ──────────────────────────────────────────
 *  Bu tablo bugun BOS baslar; bu degisiklikten ONCE yuklenmis dosyalarin
 *  kaydi yoktur. Onlara `ForbiddenException` vermek calisan ekranlari
 *  kirardi. Karar: KAYDI OLMAYAN fileId'ye izin verilir ama UYARI gunlugu
 *  duser. Kapi yeni yuklemelerin tamamini kapsar ve cache dogasi geregi
 *  (surec omurlu) eski anahtarlar zaten kisa surede tukenir.
 *  ⚠ Bu bilincli bir ACIKLIKTIR, gozden kacma degil: alternatifi
 *  "deploy aninda herkesin acik cizimi bozulsun" idi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class DwgSahiplikServisi {
  private readonly logger = new Logger(DwgSahiplikServisi.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Python yanitindaki file_id'yi firmaya baglar.
   * Yanit sekli servise gore degisebildigi icin id birkac olasi alandan
   * aranir; bulunamazsa SESSIZCE gecilir (uretici ucun kendi isi bozulmaz).
   */
  async kaydet(
    yanit: unknown,
    firmaId: string,
    olusturanId: string,
    dosyaAdi?: string,
  ): Promise<void> {
    const fileId = this.fileIdCikar(yanit);
    if (!fileId) return;

    try {
      await this.prisma.dwgDosya.upsert({
        where: { fileId },
        create: { fileId, firmaId, olusturanId, dosyaAdi },
        update: {}, // ayni id tekrar gelirse SAHIPLIK DEGISMEZ
      });
    } catch (e) {
      // Sahiplik yazilamazsa yukleme akisi bozulmamali; ama sessiz de kalmamali.
      this.logger.error(
        `DWG sahiplik kaydi yazilamadi (fileId=${fileId}): ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Tuketici uclarin kapisi. Baska firmanin dosyasiysa 403. */
  async dogrula(fileId: string | undefined, firmaId: string): Promise<void> {
    if (!fileId) return; // fileId yoksa dosya govdeden geliyordur — kapi konusu degil

    const kayit = await this.prisma.dwgDosya.findUnique({ where: { fileId } });

    if (!kayit) {
      // Bkz. sinif basligi "ESKI DOSYALAR" notu — bilincli aciklik.
      this.logger.warn(
        `DWG sahiplik kaydi YOK (fileId=${fileId}); bu degisiklikten once ` +
          `yuklenmis olabilir, izin verildi. Firma: ${firmaId}`,
      );
      return;
    }

    if (kayit.firmaId !== firmaId) {
      this.logger.error(
        `DWG CAPRAZ-TENANT ERISIM ENGELLENDI: fileId=${fileId} ` +
          `sahibi=${kayit.firmaId} isteyen=${firmaId}`,
      );
      throw new ForbiddenException('Bu dosyaya erisim yetkiniz yok.');
    }
  }

  /** Python yanitindan file_id'yi cikarir (alan adi varyasyonlarina dayanikli). */
  private fileIdCikar(yanit: unknown): string | null {
    if (!yanit || typeof yanit !== 'object') return null;
    const y = yanit as Record<string, unknown>;
    for (const anahtar of ['file_id', 'fileId', 'id']) {
      const d = y[anahtar];
      if (typeof d === 'string' && d.length > 0) return d;
    }
    return null;
  }
}
