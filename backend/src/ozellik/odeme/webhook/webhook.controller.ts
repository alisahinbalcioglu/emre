import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import {
  AbonelikWebhookGovdesi,
  ImzaSirasi,
  abonelikImzasiniDogrula,
  tekilAnahtarUret,
} from '../iyzico/imza';
import { WebhookIsleyici } from './webhook.isleyici';
import { odemeAyari } from '../yapilandirma';
import { iyzicoTarihi } from '../iyzico/iyzico-tarihi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  iyzico abonelik webhook ucu
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  BU CONTROLLER'IN TEK İŞİ: kaydet ve 200 dön. İş mantığı burada çalışmaz.
 *  (28.09: imza ZORUNLUYKEN eksik/yanlış imzalı istek 401 alır, kaydedilmez.)
 *
 *  Sebebi: iyzico 2xx alana kadar 15 dakikada bir tekrar gönderiyor ve
 *  TOPLAM 3 DENEMEDEN SONRA VAZGEÇİYOR. Yani ~45 dakikalık bir pencere var,
 *  sonra olay kalıcı olarak kayboluyor. Burada Paraşüt'e fatura kesmeye ya da
 *  e-posta göndermeye kalkarsak, o servis yavaşladığında olayı büsbütün
 *  kaybederiz. Önce diske yaz, sonra işle.
 *
 *  ÖNEMLİ: Abonelik ve ödeme webhook'ları AYRI panel alanlarından
 *  yapılandırılır, gövdeleri ve imza formülleri FARKLIDIR. Tek uca
 *  yönlendirip tipini tahmin etmeye çalışmayın.
 *      Ödemeler   : Ayarlar > Üye İşyeri Ayarları > Üye İşyeri Bildirimleri
 *      Abonelikler: Ayarlar > Üye İşyeri Ayarları > Üye İşyeri Abonelik Bildirimleri
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * Reddedilen (imzası doğrulanmamış) gövdenin alanı günlüğe: gönderen seçer —
 * satır sonu ve denetim karakteri sahte günlük satırı üretemesin. En çok 64
 * karakter; harf, rakam, `._-` dışı `?` olur.
 */
function gunlukIcin(deger: unknown): string {
  return String(deger).slice(0, 64).replace(/[^\w.-]/g, '?');
}

/**
 * ⚠ 28.09 — GÖVDE BİÇİMİ (güvenlik incelemesi). Uç herkese açık ve gövde tip
 * ARAYÜZÜYLE alınıyor: ValidationPipe onu doğrulamaz — 50 MB'a kadar her
 * JSON olduğu gibi kaydediliyor, kodlar günlüğe ve iyzico API yoluna HAM
 * gidiyordu. iyzico referans kodları harf, rakam ve tireden oluşur (belgede
 * UUID; canlıdaki tek kayıtta 9/9/19 karakter): ZORUNLU üçü (abonelik ·
 * sipariş · iyzico olay) eksik ya da biçimsizse 400, KAYDEDİLMEZ — işleme
 * onlarla yürür. Müşteri kodu İSTEĞE BAĞLI (28.09 canlı ölçüm: gövdede YOKTU,
 * belge listeler): yoksa (`undefined`/`null`/`""`) geçer, varsa aynı biçim
 * denetlenir; işleme onu kullanmaz, yalnız saklanır. Olay tipi noktalı küçük
 * harf (bilinmeyen tip yine kaydedilir, işleyici yok sayar). Olay zamanı
 * SERBEST, yoksa da geçer: çözülemeyen değer olayı düşürmez
 * (`test:webhook-tahsilat-dogrulama` T6, I10). Gerekçe alan ADINI söyler,
 * değeri günlüğe yazmaz.
 */
const KOD_BICIMI = /^[A-Za-z0-9-]{1,64}$/;
const OLAY_TIPI_BICIMI = /^[a-z]+(?:\.[a-z]+){1,4}$/;
const ZORUNLU_KOD_ALANLARI = ['subscriptionReferenceCode', 'orderReferenceCode', 'iyziReferenceCode'] as const;
const ISTEGE_BAGLI_KOD_ALANLARI = ['customerReferenceCode'] as const;

const yokMu = (v: unknown) => v === undefined || v === null || v === '';

export function govdeBicimHatasi(govde: unknown): string | null {
  if (!govde || typeof govde !== 'object' || Array.isArray(govde)) return 'gövde nesne değil';
  const g = govde as Record<string, unknown>;
  for (const alan of ZORUNLU_KOD_ALANLARI) {
    const v = g[alan];
    if (typeof v !== 'string' || !KOD_BICIMI.test(v)) return `${alan} eksik ya da biçimsiz`;
  }
  for (const alan of ISTEGE_BAGLI_KOD_ALANLARI) {
    const v = g[alan];
    if (!yokMu(v) && (typeof v !== 'string' || !KOD_BICIMI.test(v))) return `${alan} biçimsiz`;
  }
  if (typeof g.iyziEventType !== 'string' || !OLAY_TIPI_BICIMI.test(g.iyziEventType)) {
    return 'iyziEventType eksik ya da biçimsiz';
  }
  return null;
}

/**
 * Kaydedilen ham gövde: YALNIZ bilinen altı alan (bilinmeyen yük tabloya
 * girmez); gövdede olmayan isteğe bağlı alan eklenmez — gelenin aynısı.
 */
function bilinenAlanlar(g: AbonelikWebhookGovdesi): AbonelikWebhookGovdesi {
  const secili: Record<string, unknown> = {
    orderReferenceCode: g.orderReferenceCode,
    customerReferenceCode: g.customerReferenceCode,
    subscriptionReferenceCode: g.subscriptionReferenceCode,
    iyziReferenceCode: g.iyziReferenceCode,
    iyziEventType: g.iyziEventType,
    iyziEventTime: g.iyziEventTime,
  };
  return Object.fromEntries(
    Object.entries(secili).filter(([, v]) => v !== undefined),
  ) as unknown as AbonelikWebhookGovdesi;
}

@Controller('webhook/iyzico')
export class IyzicoWebhookController {
  private readonly logger = new Logger(IyzicoWebhookController.name);
  private readonly imzaZorunlu: boolean;
  private readonly sabitSira?: ImzaSirasi;

  // ⚠ merchantId/secretKey KURUCUDA OKUNMAZ. Bu bir CONTROLLER'dir:
  // NestJS onu onyuklemede kurar, dolayisiyla getOrThrow burada TUM API'yi
  // dusururdu (bkz. yapilandirma.ts). Webhook govdesi geldiginde okunur.
  private get merchantId(): string {
    return odemeAyari(this.config, 'IYZICO_MERCHANT_ID');
  }
  private get secretKey(): string {
    return odemeAyari(this.config, 'IYZICO_SECRET_KEY');
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly isleyici: WebhookIsleyici,
    private readonly config: ConfigService,
  ) {
    // X-IYZ-SIGNATURE-V3 hesabınızda açılıp imzalı bir test bildirimi
    // DOĞRULANANA kadar false (28.09): zorunluyken imzasız her bildirim 401
    // alır — gerçek tahsilat bildirimleri de (runbook ön koşulu).
    this.imzaZorunlu = config.get('IYZICO_IMZA_ZORUNLU') === 'true';
    this.sabitSira = config.get<ImzaSirasi>('IYZICO_IMZA_SIRASI');
  }

  @Post('abonelik')
  // 2xx dönmek tekrarları durdurur. Tek istisna: imza ZORUNLUYKEN eksik/yanlış
  // imza → 401 (28.09, aşağıda).
  @HttpCode(200)
  async abonelik(
    @Body() govde: AbonelikWebhookGovdesi,
    @Headers('x-iyz-signature-v3') imzaBasligi?: string,
  ): Promise<{ alindi: true }> {
    // ── 0. Biçim (28.09) — imzadan ÖNCE, ucuz ve kayıtsız ────────────────
    const bicimHatasi = govdeBicimHatasi(govde);
    if (bicimHatasi) {
      this.logger.warn(`Webhook REDDEDİLDİ (400): ${bicimHatasi}`);
      throw new BadRequestException('Webhook gövdesi biçimsiz');
    }

    // ── 1. İmza ───────────────────────────────────────────────────────────
    const imza = abonelikImzasiniDogrula(imzaBasligi, govde, {
      merchantId: this.merchantId,
      secretKey: this.secretKey,
      sabitSira: this.sabitSira,
    });

    if (imza.imzaYok) {
      this.logger.warn(
        'X-IYZ-SIGNATURE-V3 başlığı gelmedi. Bu özellik hesabınızda ' +
          'varsayılan olarak KAPALIDIR; açtırmak için entegrasyon@iyzico.com.',
      );
    } else if (!imza.gecerli) {
      // ⚠ 28.09 — BEKLENEN İMZA GÜNLÜĞE YAZILMAZ. Eskiden iki sıranın
      // beklenen değeri de basılıyordu: gövdeyi gönderen seçer, sunucu onun
      // GEÇERLİ imzasını hesaplayıp günlüğe yazar — günlüğü okuyan herkes
      // sahte bildirimi imzalayabilirdi. Kurulum teşhisi için iki sıra zaten
      // deneniyor; hiçbiri tutmuyorsa MID/gizli anahtar yanlıştır.
      this.logger.error(
        `Webhook imzası eşleşmedi (${this.sabitSira ? `sabit sıra ${this.sabitSira}` : 'iki alan sırası da denendi'}) — ` +
          'IYZICO_MERCHANT_ID, IYZICO_SECRET_KEY ve IYZICO_IMZA_SIRASI değerlerini denetleyin. ' +
          'Beklenen imza günlüğe yazılmaz.',
      );
    } else if (!this.sabitSira) {
      // İlk gerçek webhook: hangi sıranın doğru olduğunu öğrendik.
      this.logger.warn(
        `İmza doğrulandı. Alan sırası: "${imza.eslesenSira}". ` +
          `IYZICO_IMZA_SIRASI=${imza.eslesenSira} olarak sabitleyin.`,
      );
    }

    if (this.imzaZorunlu && !imza.gecerli) {
      // ⚠ 28.09 — ZORUNLU İMZA: eksik ya da yanlış imza 401 alır ve SATIR
      // YAZILMAZ. Eskiden 200 dönüp gövdeyi `imzaGecerli: false` ile
      // kaydediyordu: imzasız istekle tabloyu doldurmak serbestti ve gönderen
      // reddedildiğini bilmiyordu. iyzico 2xx görmeyince 15 dk arayla toplam 3
      // kez yeniden gönderir, sonra vazgeçer (dosya başı) — yanlış
      // yapılandırmada kaybolan tahsilatı gece mutabakatı iyzico'dan bulur.
      // Zorunluluk kod varsayılanı DEĞİL: canlı anahtar geçişinde imzalı bir
      // test bildirimi DOĞRULANDIKTAN sonra açılır (runbook ön koşulu,
      // docs/RUNBOOK_iyzico_canli_gecis.md; 28.09 canlı ölçüm: alınan tek
      // bildirimde başlık YOKTU). Kapı: `test:webhook-tahsilat-dogrulama` I.
      this.logger.warn(
        `Webhook REDDEDİLDİ (401): imza ${imza.imzaYok ? 'yok' : 'geçersiz'} — ` +
          `tip=${gunlukIcin(govde?.iyziEventType)} abonelik=${gunlukIcin(govde?.subscriptionReferenceCode)}`,
      );
      throw new UnauthorizedException('Webhook imzası doğrulanamadı');
    }

    // ── 2. Kaydet (tekrar gelirse burada takılır) ─────────────────────────
    const kayit = await this.hamKaydet(govde, imzaBasligi, imza.gecerli);

    // ── 3. İşlemeyi tetikle, ama BEKLEME ─────────────────────────────────
    if (kayit) {
      this.isleyici.kuyrugaAl(kayit.id);
    }

    return { alindi: true };
  }

  /**
   * @returns yeni kayıt, ya da olay daha önce geldiyse null
   */
  private async hamKaydet(
    govde: AbonelikWebhookGovdesi,
    imzaBasligi: string | undefined,
    imzaGecerli: boolean,
  ) {
    const tekilAnahtar = tekilAnahtarUret(govde);
    try {
      return await this.prisma.webhookOlayi.create({
        data: {
          tekilAnahtar,
          olayTipi: govde.iyziEventType,
          hamGovde: bilinenAlanlar(govde) as unknown as object,
          imzaBasligi,
          imzaGecerli,
          abonelikKodu: govde.subscriptionReferenceCode,
          siparisKodu: govde.orderReferenceCode,
          // İsteğe bağlı (bkz. `govdeBicimHatasi`): yoksa sütun boş kalır.
          musteriKodu: yokMu(govde.customerReferenceCode) ? undefined : govde.customerReferenceCode,
          iyzicoRefKodu: govde.iyziReferenceCode,
          // iyziEventTime MİLİSANİYE cinsinden (13 hane). TEK çözücüden
          // (24.09): gövde imzasız da gelebilir; rakam-dizesi ya da bozuk
          // değer Invalid Date olarak yazılmaya çalışılmasın — çözülemezse
          // alan boş kalır, olay YİNE kaydedilir.
          olayZamani: iyzicoTarihi(govde.iyziEventTime) ?? undefined,
        },
      });
    } catch (e: unknown) {
      // P2002 = unique ihlali = aynı olay tekrar geldi. Beklenen durum.
      if (
        typeof e === 'object' &&
        e !== null &&
        (e as { code?: string }).code === 'P2002'
      ) {
        this.logger.debug(`Tekrar eden webhook yutuldu: ${tekilAnahtar}`);
        return null;
      }
      throw e;
    }
  }
}
