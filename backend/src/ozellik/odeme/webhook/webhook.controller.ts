import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  iyzico abonelik webhook ucu
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  BU CONTROLLER'IN TEK İŞİ: kaydet ve 200 dön. İş mantığı burada çalışmaz.
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
    // X-IYZ-SIGNATURE-V3 hesabınızda açılana kadar false bırakın.
    this.imzaZorunlu = config.get('IYZICO_IMZA_ZORUNLU') === 'true';
    this.sabitSira = config.get<ImzaSirasi>('IYZICO_IMZA_SIRASI');
  }

  @Post('abonelik')
  @HttpCode(200) // 2xx dönmek tekrarları durdurur — her hâlükârda 200 dönüyoruz
  async abonelik(
    @Body() govde: AbonelikWebhookGovdesi,
    @Headers('x-iyz-signature-v3') imzaBasligi?: string,
  ): Promise<{ alindi: true }> {
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
      // Doküman çelişkisi yüzünden ilk kurulumda burası çalışabilir.
      // Beklenen iki değeri de günlüğe basıyoruz ki hangisinin tuttuğunu
      // (ya da merchantId'nin yanlış olduğunu) görebilelim.
      this.logger.error(
        `Webhook imzası eşleşmedi. gelen=${imzaBasligi} ` +
          `merchantIdOnce=${imza.beklenen?.merchantIdOnce} ` +
          `secretKeyOnce=${imza.beklenen?.secretKeyOnce}`,
      );
    } else if (!this.sabitSira) {
      // İlk gerçek webhook: hangi sıranın doğru olduğunu öğrendik.
      this.logger.warn(
        `İmza doğrulandı. Alan sırası: "${imza.eslesenSira}". ` +
          `IYZICO_IMZA_SIRASI=${imza.eslesenSira} olarak sabitleyin.`,
      );
    }

    if (this.imzaZorunlu && !imza.gecerli) {
      // Yine de 200 dönüyoruz: geçersiz imzalı olayı tekrar tekrar
      // almanın faydası yok. Kayıt düşüp sessizce bırakıyoruz.
      await this.hamKaydet(govde, imzaBasligi, false).catch(() => undefined);
      return { alindi: true };
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
          hamGovde: govde as unknown as object,
          imzaBasligi,
          imzaGecerli,
          abonelikKodu: govde.subscriptionReferenceCode,
          siparisKodu: govde.orderReferenceCode,
          musteriKodu: govde.customerReferenceCode,
          iyzicoRefKodu: govde.iyziReferenceCode,
          // iyziEventTime MİLİSANİYE cinsinden (13 hane)
          olayZamani: govde.iyziEventTime
            ? new Date(govde.iyziEventTime)
            : undefined,
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
