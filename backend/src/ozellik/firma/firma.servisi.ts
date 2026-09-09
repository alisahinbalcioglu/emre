import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../altyapi/db/prisma.service';
import { Kimlik } from '../../altyapi/auth/kimlik';
import { FirmaGuncelleDto } from './dto/firma-guncelle.dto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FIRMA PROFILI (FAZ 4.1 / 4.3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ NEDEN VAR — OLCULMUS BOSLUK "SEMA DEGIL YOL":
 *  Plan "ayri bir Company modeli olustur" diyordu; olcum bunu curuttu —
 *  `Firma` modeli 28.08'den beri var ve 12 alani mevcut. Gercek boslugun
 *  yeri baskaydi: butun backend'de `prisma.firma.update` TEK bir yerde
 *  (`satinalma.servisi.ts:341`) ve orada yalniz DORT alan doluyordu.
 *  `vergiNo`, `vergiDairesi`, `tcKimlikNo`, `ilce`, `faturaEposta` alanlarini
 *  fatura servisi OKUYOR ama HICBIR kod yolu YAZMIYORDU — yani her kurumsal
 *  fatura vergi numarasiz gidiyor ve musteri e-postasiyla tekillesiyordu
 *  (`muhasebe.adaptor.ts:174`: `m.vergiNo ?? m.tcKimlikNo ?? m.eposta`).
 *  Bu servis o yolu aciyor.
 *
 *  ── IKI YAZMA YOLU, IKI FARKLI ANLAM (karistirmayin) ────────────────────
 *  1) `satinalma.servisi.ts` — odeme formundan gelen bilgiyi `??` ile YALNIZ
 *     BOS alanlara yazar. Kasitli: yoneticinin/e-fatura entegrasyonunun
 *     girdigi degeri EZMEZ.
 *  2) BU SERVIS — kullanicinin ACIKCA duzenledigi form. `set` semantigi
 *     kullanir: kullanici bir alani degistirdiyse yeni deger GECERLIDIR,
 *     bosaltmak istediyse bosaltilir. Buraya `??` koymak, kullanicinin
 *     yanlis girdigi bir vergi numarasini duzeltmesini imkansiz kilardi.
 *
 *  ── ERISIM KAPISI YOK (bilincli) ────────────────────────────────────────
 *  Uclara `@GerekliYetenek` KONMADI. Gerekce: odemesi geciken (KISITLI) bir
 *  firma, odeyebilmek icin fatura bilgisini DUZELTEBILMELI. Kapiyi koymak
 *  "odemek icin bilgiyi duzelt, ama duzeltmek icin once ode" dongusu uretirdi.
 *
 *  ── YETKI: `firmaRol` ILK KEZ OKUNUYOR ──────────────────────────────────
 *  `firmaRol` bugune kadar YALNIZCA yaziliyordu (`auth.service.register`) ve
 *  tum depoda SIFIR kez okunuyordu — olu bir alandi. Burasi ilk okuyucu:
 *  firmayi yalniz `sahip` duzenleyebilir. Bugun davranisi degistirmez
 *  (olculdu: 4 kullanicinin 4'u de `sahip`, birden fazla uyesi olan firma
 *  YOK) ama davet akisi geldiginde kural ZATEN yerinde olur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** JSON yanitinda donen alanlar. ⚠ `logoBytes` BILEREK YOK — bkz. `logoOku`. */
const FIRMA_ALANLARI = {
  id: true,
  ad: true,
  unvan: true,
  yetkiliEposta: true,
  faturaEposta: true,
  vergiNo: true,
  vergiDairesi: true,
  tcKimlikNo: true,
  faturaAdresi: true,
  il: true,
  ilce: true,
  telefon: true,
  logoMime: true,
  createdAt: true,
} as const;

/**
 * Logo icin kabul edilen turler.
 *
 * ⚠ SVG BILEREK YOK. SVG bir XML belgesidir ve `<script>` tasiyabilir;
 * `image/svg+xml` olarak AYNI KOKENDEN servis edilirse tarayicida calisir
 * (depolanmis XSS). Kullanici logosu guvenilmeyen girdidir.
 */
const IZINLI_LOGO_TURLERI = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** 2 MB. Logo bir antet gorselidir; bundan buyugu hem gereksiz hem de her
 *  `GET /firma/logo` cagrisinda DB'den okunup taşınır. */
export const LOGO_AZAMI_BAYT = 2 * 1024 * 1024;

@Injectable()
export class FirmaServisi {
  constructor(private prisma: PrismaService) {}

  /** Firmanin kendi bilgileri. Logo ikili verisi DAHIL DEGIL. */
  async getir(kimlik: Kimlik) {
    const firma = await this.prisma.firma.findUnique({
      where: { id: kimlik.firmaId },
      select: FIRMA_ALANLARI,
    });
    if (!firma) throw new NotFoundException('Firma bulunamadi.');
    // `logoMime` doluysa logo VARDIR — on yuz `GET /firma/logo`u ancak o zaman
    // cagirir. Ikili veriyi JSON'a koymak her sayfa acilisinda base64 tasirdi.
    return { ...firma, logoVar: Boolean(firma.logoMime) };
  }

  async guncelle(kimlik: Kimlik, dto: FirmaGuncelleDto) {
    await this.sahipMi(kimlik);

    // PATCH semantigi: govdede OLMAYAN alana DOKUNULMAZ; bos string gonderilen
    // alan TEMIZLENIR (null). `updateInfo` (quotes.service) ile ayni sozlesme.
    const veri: Record<string, string | null> = {};
    for (const alan of [
      'ad', 'unvan', 'yetkiliEposta', 'faturaEposta', 'vergiNo',
      'vergiDairesi', 'tcKimlikNo', 'faturaAdresi', 'il', 'ilce', 'telefon',
    ] as const) {
      const deger = dto[alan];
      if (deger === undefined) continue;
      const kirpik = typeof deger === 'string' ? deger.trim() : deger;
      veri[alan] = kirpik === '' ? null : kirpik;
    }

    // `ad` NOT NULL: temizlenmek istenirse reddet. Fatura servisi `unvan ?? ad`
    // okur; ikisi de bosalirsa faturada firma adi HIC olmaz.
    if (veri.ad === null) {
      throw new BadRequestException('Firma adi bos birakilamaz.');
    }
    if (Object.keys(veri).length === 0) return this.getir(kimlik);

    await this.prisma.firma.update({ where: { id: kimlik.firmaId }, data: veri });
    return this.getir(kimlik);
  }

  /** Logo yukle. Dogrulama SERVISTE — controller'daki multer `limits` yalniz
   *  ilk savunmadir ve tur denetimi yapmaz. */
  async logoYaz(kimlik: Kimlik, dosya?: Express.Multer.File) {
    await this.sahipMi(kimlik);
    if (!dosya?.buffer?.length) {
      throw new BadRequestException('Dosya alinamadi.');
    }
    if (dosya.size > LOGO_AZAMI_BAYT) {
      throw new BadRequestException(
        `Logo en fazla ${Math.floor(LOGO_AZAMI_BAYT / 1024 / 1024)} MB olabilir.`,
      );
    }
    const tur = (dosya.mimetype || '').toLowerCase();
    if (!IZINLI_LOGO_TURLERI.includes(tur as (typeof IZINLI_LOGO_TURLERI)[number])) {
      throw new BadRequestException(
        'Logo yalnizca PNG, JPEG veya WEBP olabilir. (SVG guvenlik nedeniyle kabul edilmiyor.)',
      );
    }
    // ⚠ TUR BEYANA GUVENILMEZ: `mimetype` istemcinin SOYLEDIGI seydir.
    // Dosyanin ILK BAYTLARI (magic number) da dogrulanir — aksi halde
    // `image/png` diye etiketlenmis bir HTML dosyasi DB'ye girer ve
    // ileride yanlis Content-Type ile servis edilirse tarayicida calisir.
    if (!this.imzaUyuyor(dosya.buffer, tur)) {
      throw new BadRequestException(
        'Dosya icerigi belirtilen turle uyusmuyor (gecerli bir PNG/JPEG/WEBP degil).',
      );
    }

    await this.prisma.firma.update({
      where: { id: kimlik.firmaId },
      data: { logoBytes: dosya.buffer, logoMime: tur },
    });
    return { tamam: true, tur, bayt: dosya.size };
  }

  /** Logo ikili verisi. Kimlik kapisi CAGIRANDA degil BURADA: sorgu
   *  `kimlik.firmaId` ile yapilir, yani baska firmanin logosu id tahminiyle
   *  cekilemez (DWG tarafinda ayni sorun `DwgSahiplikServisi` ile cozulmustu). */
  async logoOku(kimlik: Kimlik): Promise<{ bytes: Buffer; tur: string }> {
    const firma = await this.prisma.firma.findUnique({
      where: { id: kimlik.firmaId },
      select: { logoBytes: true, logoMime: true },
    });
    if (!firma?.logoBytes || !firma.logoMime) {
      throw new NotFoundException('Firma logosu yuklenmemis.');
    }
    return { bytes: Buffer.from(firma.logoBytes), tur: firma.logoMime };
  }

  async logoSil(kimlik: Kimlik) {
    await this.sahipMi(kimlik);
    await this.prisma.firma.update({
      where: { id: kimlik.firmaId },
      data: { logoBytes: null, logoMime: null },
    });
    return { tamam: true };
  }

  /** ⚠ `firmaRol`un TUM DEPODAKI ILK OKUYUCUSU (bkz. sinif notu). */
  private async sahipMi(kimlik: Kimlik) {
    const u = await this.prisma.user.findUnique({
      where: { id: kimlik.userId },
      select: { firmaRol: true },
    });
    if (u?.firmaRol !== 'sahip') {
      throw new ForbiddenException(
        'Firma bilgilerini yalnizca firma sahibi duzenleyebilir.',
      );
    }
  }

  /** Magic number denetimi — beyan edilen tur dosyanin gercegiyle tutuyor mu. */
  private imzaUyuyor(b: Buffer, tur: string): boolean {
    if (b.length < 12) return false;
    if (tur === 'image/png') {
      return (
        b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
        b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
      );
    }
    if (tur === 'image/jpeg') {
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    }
    if (tur === 'image/webp') {
      // "RIFF" .... "WEBP"
      return (
        b.toString('ascii', 0, 4) === 'RIFF' &&
        b.toString('ascii', 8, 12) === 'WEBP'
      );
    }
    return false;
  }
}
