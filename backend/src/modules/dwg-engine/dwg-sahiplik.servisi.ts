import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
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
 *  URETICI uc (upload; `layers` 26.09'da kaldirildi) kaydi YAZAR, TUKETICI
 *  uclar (parse/status/geometry) DOGRULAR. Motor kimlik TASIMAZ; yalniz
 *  tekillestirme icin firmaya ozgu OPAK bir kapsam alir (asagi).
 *
 *  ── KIRACI DEDUP (26.09) ────────────────────────────────────────────────
 *  Motor ayni icerigi (sha256) TUM kiracilar arasinda tekillestiriyordu:
 *  ikinci firmanin yuklemesi birincinin file_id'sini `dedup: true` ile
 *  aliyor, sahiplik ilk firmada kaldigi icin kendi yuklemesinde 403 yiyor
 *  ve ayni cizimi baskasinin yukledigini ogreniyordu (ihale cizimi birden
 *  cok yukleniciye gider). Artik her yukleme `dedupKapsami(firmaId)` tasir,
 *  motor yalniz ayni kapsamda tekillestirir ve bunu `kapsamli: true` ile
 *  bildirir. Bildirmeyen motor (eski imaj, surum kaymasi) HER yuklemede ayni
 *  503'u alir: yalniz tekillestirilen dosya reddedilseydi "bu cizimi baskasi
 *  yuklemis" yine okunurdu. `kaydet` ayrica baska firmaya ait bir kimligi
 *  ASLA geri vermez (motor kapsamladim deyip yine de tekillestirirse).
 *
 *  ── KAYITSIZ KIMLIK KAPALI (26.09, Emre) ─────────────────────────────────
 *  28.08'de tablo BOS basladigi icin kaydi olmayan fileId'ye izin veriliyordu
 *  ("deploy aninda acik cizimler bozulmasin"). Onbellek TTL'i 24 saat; o
 *  pencere coktan kapandi. Olculdu (26.09 canli): motordaki 2 kaydin ikisinin
 *  de sahiplik satiri var. Kaydi olmayan kimlik artik 403 alir ve yaniti
 *  baska firmanin dosyasina verilenle AYNIDIR (var/yok ayirt edilemez).
 *  Bu yuzden sahiplik yazilamazsa yukleme HATA verir — eskiden hata
 *  yutuluyordu ve kapi kapaliyken dosya sahibine de kapanirdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Motorun urettigi file_id bicimi — `uuid.uuid4().hex[:12]` (python/main.py). */
export const DWG_FILE_ID_BICIMI = /^[0-9a-f]{12}$/;

/** Baska firmanin dosyasi ve kaydi olmayan kimlik AYNI yaniti alir. */
const ERISIM_YOK = 'Bu dosyaya erisim yetkiniz yok.';
/** Yukleme kaydedilemedi: nedeni (DB, motor sozlesmesi) kullaniciya sizmaz. */
const KAYDEDILEMEDI = 'Dosya kaydedilemedi, lutfen tekrar yukleyin.';

/**
 * Motorun tekillestirme KAPSAMI: firmaya ozgu, firma icinde sabit. Firma kimligi
 * motora HAM gitmez, ama deger GIZLI DEGILDIR (anahtarsiz ozet; firma kendi
 * /status yanitinda gorebilir). Amac ayirmak: motor ayni icerigi yalniz ayni
 * kapsamda tekillestirir — baska firmanin yuklemesine hic baglanmaz. Anahtar
 * (HMAC) eklenmedi: kapsam kimlik kaniti olarak kullanilmiyor, Nest onu JWT'nin
 * firmaId'sinden yeniden hesaplar (guvenlik incelemesi 26.09).
 */
export function dedupKapsami(firmaId: string): string {
  return createHash('sha256').update(`metaprice:dwg-dedup:v1:${firmaId}`).digest('hex');
}

@Injectable()
export class DwgSahiplikServisi {
  private readonly logger = new Logger(DwgSahiplikServisi.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Python yanitindaki file_id'yi firmaya baglar. Baglanamazsa yukleme HATA
   * verir (kayitsiz kimlik `dogrula`da 403 alir; sessiz gecmek dosyayi
   * sahibine kapatirdi). Motor kapsami uyguladigini bildirmezse ya da baska
   * firmaya ait bir kimlik donerse o kimlik bu firmaya VERILMEZ. Butun
   * hatalarin yaniti ayni: nedeni sizmaz.
   */
  async kaydet(
    yanit: unknown,
    firmaId: string,
    olusturanId: string,
    dosyaAdi?: string,
  ): Promise<void> {
    if ((yanit as { kapsamli?: unknown } | null)?.kapsamli !== true) {
      this.logger.error(
        `DWG motoru dedup kapsamini uyguladigini bildirmedi (eski motor?); yukleme reddedildi. Firma: ${firmaId}`,
      );
      throw new ServiceUnavailableException(KAYDEDILEMEDI);
    }
    const fileId = this.fileIdCikar(yanit);
    if (!fileId || !DWG_FILE_ID_BICIMI.test(fileId)) {
      this.logger.error(
        `DWG motoru gecersiz file_id dondu (${JSON.stringify(fileId)}); sahiplik yazilmadi. Firma: ${firmaId}`,
      );
      throw new ServiceUnavailableException(KAYDEDILEMEDI);
    }

    const kayit = await this.sahiplikSatiri(fileId, firmaId, olusturanId, dosyaAdi);
    if (!kayit) throw new ServiceUnavailableException(KAYDEDILEMEDI);

    if (kayit.firmaId !== firmaId) {
      // Motor kapsami yok saydi (surum kaymasi ya da gerileme): kimlik de, dedup
      // bayragi da ikinci firmaya ulasmaz.
      this.logger.error(
        `DWG CAPRAZ-FIRMA DEDUP: motor fileId=${fileId} (sahibi=${kayit.firmaId}) ` +
          `isteyen=${firmaId} firmaya dondu — dedup kapsami yok sayilmis olabilir; yanit verilmedi.`,
      );
      throw new ServiceUnavailableException(KAYDEDILEMEDI);
    }
  }

  /** Tuketici uclarin kapisi. Bicimsiz 400; kaydi yoksa ya da baska firmanin ise 403. */
  async dogrula(fileId: string | undefined, firmaId: string): Promise<void> {
    // Kimliksiz istek kapidan GECMEZ (26.09). Eskiden "fileId yok = dosya
    // govdeden geliyor" sayilip izin veriliyordu; govdeli /parse kaldirildi.
    if (!fileId) throw new ForbiddenException('Dosya kimligi (file_id) eksik.');
    // Bicimsiz kimlik DB'ye ve motora GITMEZ (motor onu dosya yoluna katiyor).
    if (!DWG_FILE_ID_BICIMI.test(fileId)) {
      throw new BadRequestException('Gecersiz dosya kimligi (file_id).');
    }

    const kayit = await this.prisma.dwgDosya.findUnique({ where: { fileId } });

    if (!kayit) {
      // Bkz. sinif basligi "KAYITSIZ KIMLIK KAPALI".
      this.logger.warn(
        `DWG sahiplik kaydi YOK (fileId=${fileId}); erisim REDDEDILDI. Firma: ${firmaId}`,
      );
      throw new ForbiddenException(ERISIM_YOK);
    }

    if (kayit.firmaId !== firmaId) {
      this.logger.error(
        `DWG CAPRAZ-TENANT ERISIM ENGELLENDI: fileId=${fileId} ` +
          `sahibi=${kayit.firmaId} isteyen=${firmaId}`,
      );
      throw new ForbiddenException(ERISIM_YOK);
    }
  }

  /**
   * Sahiplik satirini yazar; ayni kimligi az once baska bir istek yazdiysa onu
   * okur. Yazilamazsa null (ERROR gunlugu dusulur). Sahiplik cagiranda
   * karsilastirilir.
   */
  private async sahiplikSatiri(
    fileId: string,
    firmaId: string,
    olusturanId: string,
    dosyaAdi?: string,
  ): Promise<{ firmaId: string } | null> {
    try {
      return await this.prisma.dwgDosya.upsert({
        where: { fileId },
        create: { fileId, firmaId, olusturanId, dosyaAdi },
        update: {}, // ayni id tekrar gelirse SAHIPLIK DEGISMEZ
      });
    } catch (e) {
      // `update: {}` ile Prisma 5.22 upsert'u SELECT + INSERT'e dusurur, atomik
      // degil (kod incelemesi 26.09, Prisma sorgu gunlugu, SQLite): ayni dosyayi
      // ayni anda yukleyen ikinci istek P2002 alir. Eskiden hata yutuluyordu;
      // simdi yukleme reddedilecegi icin kazananin satiri okunur.
      if ((e as { code?: string })?.code === 'P2002') {
        const kazanan = await this.prisma.dwgDosya
          .findUnique({ where: { fileId } })
          .catch(() => null);
        if (kazanan) return kazanan;
      }
      this.logger.error(
        `DWG sahiplik kaydi yazilamadi (fileId=${fileId}): ${e instanceof Error ? e.message : e}`,
      );
      return null;
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
