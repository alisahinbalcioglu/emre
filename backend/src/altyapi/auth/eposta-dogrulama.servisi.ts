import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../db/prisma.service';
import { EpostaServisi } from '../../ozellik/odeme/eposta/eposta.servisi';
import { DOGRULAMA_OMRU_MS, tokenOzetle, tokenUret } from './token-ozet';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  E-POSTA DOĞRULAMA  (Faz 3.4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ DOĞRULANMAMIŞ HESAP GİRİŞ YAPABİLİR — yalnızca uyarı şeridi görür.
 *  Girişi bloke etmek yeni kaydı kırar: kullanıcı kaydolur, mail gecikir ya da
 *  spam'e düşer ve ürünü HİÇ göremeden terk eder; üstelik her biri destek
 *  yükü üretir. Doğrulama bugün bir İŞARETTİR, bir kapı değil. Kapıya
 *  dönüştürmek ayrı ve bilinçli bir karardır.
 *
 *  GÖÇ: mevcut hesaplar migration'da `emailVerified = true` işaretlendi —
 *  aksi halde bugünkü kullanıcılar bir gecede kendi ürünlerinden kilitlenirdi.
 */
@Injectable()
export class EpostaDogrulamaServisi {
  private readonly logger = new Logger(EpostaDogrulamaServisi.name);
  private readonly uygulamaUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eposta: EpostaServisi,
    config: ConfigService,
  ) {
    this.uygulamaUrl = (
      config.get<string>('APP_URL') ??
      config.get<string>('UYGULAMA_URL') ??
      'https://www.metapricex.com'
    ).replace(/\/+$/, '');
  }

  /**
   * Doğrulama bağlantısı üretir ve yollar.
   *
   * ⚠ ARKA PLANDA koşar ve HİÇBİR ZAMAN çağıranı düşürmez: kayıt akışının
   * (`register`) içinden çağrılıyor ve SMTP'nin erişilemez olması yeni bir
   * kullanıcının HESAP AÇAMAMASINA yol açmamalı. Hata loglanır — yutulmaz.
   */
  async dogrulamaGonder(userId: string, epostaAdresi: string): Promise<void> {
    const { token, ozet } = tokenUret();

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          userId,
          tokenHash: ozet,
          expiresAt: new Date(Date.now() + DOGRULAMA_OMRU_MS),
        },
      }),
    ]);

    const url = `${this.uygulamaUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await this.eposta.gonderKritik({
      kime: epostaAdresi,
      konu: 'MetaPriceX — e-posta adresinizi doğrulayın',
      baslik: 'E-posta adresinizi doğrulayın',
      paragraflar: [
        'MetaPriceX hesabınız açıldı.',
        'Aşağıdaki bağlantıya tıklayarak e-posta adresinizi doğrulayabilirsiniz. Bağlantı 24 saat geçerlidir.',
        'Doğrulamadan da uygulamayı kullanabilirsiniz; doğrulama, önemli bildirimlerin size ulaşabildiğinden emin olmamızı sağlar.',
      ],
      dugme: { etiket: 'E-postamı doğrula', url },
      altNot:
        'Bağlantı çalışmıyorsa tarayıcınızın adres çubuğuna kopyalayın: ' + url,
    });
  }

  /** Çağıranı ASLA düşürmeyen sarmalayıcı (kayıt akışı bunu kullanır). */
  async dogrulamaGonderSessizce(
    userId: string,
    epostaAdresi: string,
  ): Promise<void> {
    try {
      await this.dogrulamaGonder(userId, epostaAdresi);
    } catch (hata) {
      this.logger.error(
        `Dogrulama e-postasi GONDERILEMEDI (${epostaAdresi}): ${
          hata instanceof Error ? hata.message : String(hata)
        }`,
      );
    }
  }

  /** Token ile doğrulama. Tek kullanımlık; süre dolmuşsa reddedilir. */
  async dogrula(token: string) {
    const kayit = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: tokenOzetle(token) },
      include: { user: true },
    });

    const gecersiz =
      !kayit || !!kayit.usedAt || kayit.expiresAt.getTime() <= Date.now();
    if (gecersiz) {
      throw new BadRequestException(
        'Doğrulama bağlantısı geçersiz ya da süresi dolmuş. Yeni bir bağlantı isteyin.',
      );
    }

    const simdi = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: kayit.userId },
        data: { emailVerified: true },
      }),
      this.prisma.emailVerificationToken.updateMany({
        where: { userId: kayit.userId, usedAt: null },
        data: { usedAt: simdi },
      }),
    ]);

    return { mesaj: 'E-posta adresiniz doğrulandı.', emailVerified: true };
  }

  /** Oturum açık kullanıcı yeni bağlantı ister. */
  async yenidenGonder(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Hesap bulunamadı.');
    if (user.emailVerified) {
      return { mesaj: 'E-posta adresiniz zaten doğrulanmış.', emailVerified: true };
    }
    await this.dogrulamaGonder(user.id, user.email);
    return {
      mesaj: 'Doğrulama bağlantısı e-posta adresinize gönderildi.',
      emailVerified: false,
    };
  }
}
