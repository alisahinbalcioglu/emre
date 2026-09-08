import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../db/prisma.service';
import { EpostaServisi } from '../../ozellik/odeme/eposta/eposta.servisi';
import { AuthService } from './auth.service';
import { SIFIRLAMA_OMRU_MS, tokenOzetle, tokenUret } from './token-ozet';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAROLA SIFIRLAMA ve DEĞİŞTİRME  (Faz 3.3 · 3.5)
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class ParolaServisi {
  private readonly logger = new Logger(ParolaServisi.name);
  private readonly uygulamaUrl: string;

  /**
   * ⚠ TEKDÜZE CEVAP — KULLANICI NUMARALANDIRMASINA KARŞI TEK SAVUNMA.
   * `forgot-password`, e-posta kayıtlı OLSA DA OLMASA DA BU AYNI nesneyi
   * döner. Farklı cevap vermek (ya da 404) ucu, "hangi e-postalar bu ürünün
   * müşterisi" sorusunu yanıtlayan bir SORGU HİZMETİNE çevirirdi; rakip bir
   * firma müşteri listenizi tek tek sınayarak çıkarabilirdi.
   */
  static readonly TEKDUZE_CEVAP = {
    mesaj:
      'E-posta adresiniz kayıtlıysa parola sıfırlama bağlantısı gönderildi. ' +
      'Gelen kutunuzu ve spam klasörünü kontrol edin.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly eposta: EpostaServisi,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    // APP_URL yeni ad (Faz 3), UYGULAMA_URL bugün üretimde compose'dan geçen
    // ad. İkincisini okumayı bırakmak, bağlantıları sessizce varsayılana
    // düşürürdü. Sondaki '/' kırpılır: aksi halde URL '…com//reset-password'
    // olur ve bazı e-posta istemcileri bunu bozar.
    this.uygulamaUrl = (
      config.get<string>('APP_URL') ??
      config.get<string>('UYGULAMA_URL') ??
      'https://www.metapricex.com'
    ).replace(/\/+$/, '');
  }

  /**
   * 3.3 — SIFIRLAMA İSTEĞİ.
   *
   * ⚠ E-POSTA `await` EDİLMEZ (bilerek). Beklenseydi cevap süresi "kullanıcı
   * var" dalında SMTP'nin hızına, "yok" dalında sıfıra bağlanırdı; saldırgan
   * SÜREYE bakarak numaralandırmayı yine yapardı — tekdüze METİN tek başına
   * yetmez, tekdüze SÜRE de gerekir. Gönderim arka planda koşar; başarısız
   * olursa YÜKSEK SESLE loglanır (sessizce yutulmaz), kullanıcıya yine aynı
   * cevap döner.
   */
  async sifirlamaIste(epostaAdresi: string) {
    // ⚠ Küçük harfe ÇEVRİLMEZ: kayıt akışı e-postayı olduğu gibi saklıyor ve
    // `login` de birebir eşleştiriyor. Burada normalleştirmek, adresini büyük
    // harfle kaydetmiş bir kullanıcının parolasını HİÇ sıfırlayamaması
    // demekti. (Hız sınırı kovası ise küçük harfe çevrilir — orada amaç farklı:
    // saldırganın harf büyüklüğüyle sınırı atlamasını engellemek.)
    const adres = epostaAdresi.trim();
    const user = await this.prisma.user.findUnique({ where: { email: adres } });

    // Token İKİ DALDA da üretilir: maliyeti sabit tutar, dallar arasında
    // ölçülebilir bir CPU farkı bırakmaz.
    const { token, ozet } = tokenUret();

    const gonderilebilir =
      !!user && !user.deletedAt && user.status !== 'banned';

    if (user && gonderilebilir) {
      await this.prisma.$transaction([
        // Yeni token üretilince kullanıcının BEKLEYEN tüm token'ları ölür.
        // Aksi halde gelen kutusunda biriken her eski bağlantı hâlâ geçerli
        // bir hesap devralma aracı olurdu.
        this.prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: ozet,
            expiresAt: new Date(Date.now() + SIFIRLAMA_OMRU_MS),
          },
        }),
      ]);

      // ⚠ `redirect`/`next` gibi bir parametre KABUL EDİLMEZ ve URL sabit
      // `uygulamaUrl` üzerinden kurulur — açık yönlendirme (open redirect)
      // deliği, parola sıfırlama akışında token'ı saldırganın sitesine
      // taşıyabilirdi.
      const url = `${this.uygulamaUrl}/reset-password?token=${encodeURIComponent(token)}`;

      void this.eposta
        .gonderKritik({
          kime: user.email,
          konu: 'MetaPriceX — parola sıfırlama',
          baslik: 'Parolanızı sıfırlayın',
          paragraflar: [
            'Hesabınız için parola sıfırlama talebi aldık.',
            'Aşağıdaki bağlantı 1 saat geçerlidir ve yalnızca bir kez kullanılabilir.',
            'Bu talebi siz yapmadıysanız bu iletiyi yok sayabilirsiniz; parolanız değişmez.',
          ],
          dugme: { etiket: 'Parolamı sıfırla', url },
          altNot:
            'Bağlantı çalışmıyorsa tarayıcınızın adres çubuğuna kopyalayın: ' +
            url,
        })
        .catch((hata) =>
          // SESSİZ DEĞİL: kullanıcıya tekdüze cevap döndük ama operasyon
          // tarafında bu satır olmadan "mail gitmedi" hiçbir yerde görünmezdi.
          this.logger.error(
            `Parola sifirlama e-postasi GONDERILEMEDI (${user.email}): ${
              hata instanceof Error ? hata.message : String(hata)
            }`,
          ),
        );
    }

    return ParolaServisi.TEKDUZE_CEVAP;
  }

  /** 3.3 — TOKEN İLE SIFIRLAMA. */
  async sifirla(token: string, yeniParola: string) {
    const kayit = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: tokenOzetle(token) },
      include: { user: true },
    });

    // Üç ret sebebi de AYNI mesajı verir: "bu token vardı ama kullanılmıştı"
    // ile "böyle bir token hiç yok" arasındaki farkı söylemek, saldırgana
    // elindeki token'ın bir zamanlar geçerli olduğunu doğrulardı.
    const gecersiz =
      !kayit || !!kayit.usedAt || kayit.expiresAt.getTime() <= Date.now();
    if (gecersiz) {
      throw new BadRequestException(
        'Bağlantı geçersiz ya da süresi dolmuş. Lütfen yeni bir sıfırlama bağlantısı isteyin.',
      );
    }

    if (kayit.user.deletedAt || kayit.user.status === 'banned') {
      throw new UnauthorizedException('Bu hesap kullanılamıyor.');
    }

    const ozetlenmis = await bcrypt.hash(yeniParola, 10);
    const simdi = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: kayit.userId },
        data: {
          password: ozetlenmis,
          // ⚠ 3.5 ile ORTAK KAPI: bu damga olmadan sıfırlama, ÇALINMIŞ bir
          // token'ı geçersiz kılmaz — saldırgan parolayı bilmese de 7 gün
          // boyunca oturumu sürdürürdü. Parolayı sıfırlamanın amacı tam olarak
          // bunu kesmektir.
          passwordChangedAt: simdi,
        },
      }),
      // Kullanılan token ve varsa kardeşleri kapanır (tek kullanımlık).
      this.prisma.passwordResetToken.updateMany({
        where: { userId: kayit.userId, usedAt: null },
        data: { usedAt: simdi },
      }),
    ]);

    return {
      mesaj:
        'Parolanız güncellendi. Yeni parolanızla giriş yapabilirsiniz. ' +
        'Güvenlik için diğer cihazlardaki oturumlar kapatıldı.',
    };
  }

  /** 3.5 — OTURUM AÇIKKEN PAROLA DEĞİŞTİRME (mevcut parola doğrulamalı). */
  async degistir(userId: string, mevcutParola: string, yeniParola: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const dogru = await bcrypt.compare(mevcutParola, user.password);
    if (!dogru) {
      throw new UnauthorizedException('Mevcut parolanız hatalı.');
    }
    if (mevcutParola === yeniParola) {
      throw new BadRequestException(
        'Yeni parola mevcut parolanızla aynı olamaz.',
      );
    }

    const simdi = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(yeniParola, 10),
        passwordChangedAt: simdi,
      },
    });

    // ⚠ TAZE TOKEN ŞART — YOKSA KULLANICI KENDİ İŞLEMİYLE DIŞARI ATILIR.
    // `passwordChangedAt` damgalandığı anda jwt.strategy'deki kapı, o andan
    // ÖNCE imzalanmış her token'ı reddeder; kullanıcının ELİNDEKİ token da
    // budur. Yeni token dönmezsek "parolamı değiştirdim ve uygulamadan
    // atıldım" davranışı doğar. Ön yüz bunu localStorage'a yazar.
    const token = this.auth.signToken(user.id, user.email, user.role);

    return {
      token,
      mesaj:
        'Parolanız güncellendi. Diğer cihazlardaki oturumlar kapatıldı.',
    };
  }
}
