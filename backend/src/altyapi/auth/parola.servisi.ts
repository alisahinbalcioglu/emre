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
import { epostaIleKullaniciBul } from './eposta';
import { SIFIRLAMA_OMRU_MS, tokenOzetle, tokenUret } from './token-ozet';
import { uygulamaKokuCoz } from './uygulama-url';
import { kurumsalZorunluMu } from './kurumsal/kurumsal-zorunluluk';
import { PAROLA_HATALI_YANIT } from './parola-kurali';

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
    // ⚠ Bu satır 10.09.2026'da ONARILDI. Eskiden `??` zinciriydi ve `??`
    // BOŞ DİZEDE DÜŞMEZ: compose `APP_URL: ${APP_URL:-}` yazdığı için değer
    // boş dize geliyordu ve bağlantı alan adsız çıkıyordu. Kural artık
    // doluluk kontrolü — gerekçesi `uygulama-url.ts` başında.
    this.uygulamaUrl = uygulamaKokuCoz(config);
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
    // ⚠ FAZ 6.12a / K-P6 (15.09): eşleşme ARTIK büyük/küçük harfe DUYARSIZ —
    // `login` ve kayıt ile AYNI kural (eposta.ts `epostaIleKullaniciBul`).
    // Eski not "küçük harfe ÇEVRİLMEZ, login birebir eşleştiriyor" diyordu;
    // login duyarsız olup burası birebir kalsaydı adresi "ali@x.com" diye
    // yazan kullanıcı giriş yapabilir ama parolasını SIFIRLAYAMAZDI. Mevcut
    // karışık harfli kayıt DEĞİŞTİRİLMEZ; kayıttaki yazımla da bulunur.
    // Tek sorgu, iki dalda da aynı: süre farkı numaralandırma açmaz.
    // (Hız sınırı kovası zaten küçük harfe çevriliyordu.)
    const user = await epostaIleKullaniciBul(this.prisma, epostaAdresi);

    // Token İKİ DALDA da üretilir: maliyeti sabit tutar, dallar arasında
    // ölçülebilir bir CPU farkı bırakmaz.
    const { token, ozet } = tokenUret();

    // ── FAZ 7 F3b (V7, §5.10): KURUMSAL GIRIS ZORUNLUYSA E-POSTA GITMEZ ──
    // ⚠ Cevap YINE TEKDUZEDIR (`TEKDUZE_CEVAP`): "bu adres kurumsal giris
    // kullaniyor" demek, hangi sirketin hangi adresi kullandigini dogrulayan
    // bir numaralandirma oracle'i olurdu. Yalniz e-posta GONDERILMEZ —
    // zorunlu hesabin parolasi zaten bir giris yolu degildir ve gonderilen
    // baglanti kullaniciyi calismayan bir yola sokardi.
    const kurumsalZorunlu = user
      ? await kurumsalZorunluMu(this.prisma, user)
      : false;
    const gonderilebilir =
      !!user && !user.deletedAt && user.status !== 'banned' && !kurumsalZorunlu;

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

    // FAZ 7 F3b (V7 ikizi): zorunluluk sifirlamadan SONRA acilmis olabilir —
    // elde kalan eski bir baglanti parolali yolu geri acmamali.
    if (await kurumsalZorunluMu(this.prisma, kayit.user)) {
      throw new BadRequestException({
        kod: 'KURUMSAL_GIRIS_ZORUNLU',
        mesaj:
          'Bu hesap şirket hesabıyla kullanılıyor; parola belirlenemez. ' +
          'Giriş ekranında "Şirket hesabımla giriş yap" düğmesini kullanın.',
      });
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
          // ── FAZ 7 F3b (§2.6): ARTIK PAROLASI VAR ────────────────────────
          // Kurumsal girisle acilmis hesap (`parolaTanimli: false`) ancak
          // buradan parola kazanir; boylece "Sirket hesabi kaldirilirsa ne
          // olacak" sorusunun cevabi olur.
          parolaTanimli: true,
          // ── FAZ 7 F2b (§4.4): KILIDI AÇAN İKİ YOLDAN BİRİ ───────────────
          // 20 hatalı koddan sonra doğrulama adımı kilitlenir. Kullanıcının
          // kendi başına açabileceği tek yol budur (diğeri yöneticidir):
          // e-posta kutusuna erişimini kanıtlamış olur.
          // ⚠ İKİ ADIMLI GİRİŞ **AÇIK KALIR**: `mfaAcikAt`/`mfaSirriSifreli`
          // BURADA TEMİZLENMEZ. Temizlenseydi, parola sıfırlama bağlantısını
          // ele geçiren biri ikinci adımı da kaldırmış olurdu — iki adımlı
          // girişin varlık sebebi tam olarak bunu engellemektir.
          mfaHataSayaci: 0,
          mfaKilitliAt: null,
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

    // FAZ 7 F3b (§5.11): PAROLASIZ HESAP — 400, 401 DEGIL. 401 donseydi
    // `api.ts` yakalayicisi kullaniciyi oturumdan ATAR ve kisi "neden
    // atildim" bilmezdi; bu bir kimlik hatasi degil, ozellik yokluğudur.
    if ((user as unknown as { parolaTanimli?: boolean }).parolaTanimli === false) {
      throw new BadRequestException({
        kod: 'PAROLA_YOK',
        mesaj:
          'Hesabınızın parolası yok; şirket hesabıyla açıldı. Firmanız izin ' +
          'veriyorsa "Parolamı unuttum" ile bir parola belirleyebilirsiniz.',
      });
    }

    const dogru = await bcrypt.compare(mevcutParola, user.password);
    // ⚠ 400 — 401 DEGIL (Gorunur kusurlar turu, t.16). Bu uc KORUMALIDIR:
    // buraya ulasan istegin token'i ZATEN gecerli. 401 donuldugu surece
    // `frontend/ortak/lib/api.ts` yakalayicisi token'i silip kullaniciyi
    // `/login`e atiyordu — yanlis parola yazan kisi "parolami degistir"
    // ekranindan sessizce DISARI dusuyordu. Gerekce ve desen:
    // `parola-kurali.ts` PAROLA_HATALI_YANIT. Hemen yukaridaki PAROLA_YOK
    // dali ayni kararı F3b'de zaten vermisti; bu dal atlanmisti.
    if (!dogru) {
      throw new BadRequestException(PAROLA_HATALI_YANIT);
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
    // FAZ 7 F1b (R1-Y1): parola degistirme MEVCUT parolayi dogruladi →
    // BIRINCIL kimlik dogrulamadir, `authAt` YENILENIR (kopyalanmaz).
    // ⚠ Cürütücü "kopyala" oneriyordu; sapma bilincli: `authAt`i okuyan her
    // akis yalniz PAROLASIZ hesaplarda kosar (F2b/F3b) ve parolasiz hesap
    // parola degistiremez — etkilesim YOK.
    const token = this.auth.signToken(
      user.id,
      user.email,
      user.role,
      Math.floor(Date.now() / 1000),
    );

    return {
      token,
      mesaj:
        'Parolanız güncellendi. Diğer cihazlardaki oturumlar kapatıldı.',
    };
  }
}
