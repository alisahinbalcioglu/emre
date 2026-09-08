import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../db/prisma.service';
import { jwtSecret } from '../jwt-secret';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // KL P1-a: dogrulama anahtari da TEK kaynaktan — imzalayan ve dogrulayan
      // ayni degeri okur; yedek deger yok.
      secretOrKey: jwtSecret(),
    });
  }

  /**
   * ⚠ `iat` KAPISININ TOLERANSI — 2 SANİYE, KEYFİ DEĞİL.
   *
   * JWT'nin `iat` alanı SANİYE cinsindendir ve imzalanırken AŞAĞI yuvarlanır;
   * `passwordChangedAt` ise milisaniyeli bir `DateTime`. Parola değiştirildiği
   * anda ikisi de "şimdi"dir, ama token'ın `iat`'i 999 ms'ye kadar GERİDE
   * kalabilir. Tolerans olmasaydı, parola değişiminden hemen sonra ürettiğimiz
   * TAZE token kendi kapısına takılır ve kullanıcı "parolamı değiştirdim,
   * uygulama beni attı" derdi — üstelik yalnız saniyenin küsuratına bağlı
   * olarak, yani ARADA BİR. 2 sn bu yuvarlamayı ve makineler arası küçük saat
   * kaymasını örter; çalınmış bir token için 2 sn'lik pencerenin pratik bir
   * değeri yoktur.
   */
  private static readonly IAT_TOLERANS_MS = 2000;

  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    iat?: number;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException();
    // ── G1 (28.08): BANLI HESABIN MEVCUT TOKEN'I DA GECERSIZ ─────────────
    // Girise kapi koymak TEK BASINA yetmez: token omru 7 gundur
    // (JWT_EXPIRES_IN ?? '7d'), yani banlanan kullanici bir hafta boyunca
    // calismaya devam ederdi. Kapinin ISE YARADIGI yer burasidir — bu sorgu
    // zaten her istekte kullaniciyi cekiyordu, EK MALIYET YOK.
    if (user.status === 'banned') {
      throw new UnauthorizedException('Hesabiniz askiya alinmis.');
    }
    // YUMUSAK SILME (2.3): ban ile ayni gerekce — token omru 7 gun oldugu icin
    // yalniz girise kapi koymak silinen hesabi bir hafta daha calistirirdi.
    if (user.deletedAt) {
      throw new UnauthorizedException('Hesabiniz kapatilmis.');
    }
    // ── FAZ 3.5: PAROLA DEĞİŞİNCE ESKİ TOKEN'LAR ÖLÜR ────────────────────
    // JWT durumsuzdur ve `localStorage`'da durur: parola değiştirmek, ÇALINMIŞ
    // bir token'ı kendiliğinden geçersiz KILMAZ — saldırgan yeni parolayı
    // bilmese de 7 gün (JWT_EXPIRES_IN) boyunca oturumu sürdürürdü. Yani
    // "parolamı değiştirdim, artık güvendeyim" varsayımı bu satır olmadan
    // YANLIŞTI. Ban ve yumuşak silme kapılarıyla aynı yerde duruyor ki biri
    // eklenip diğeri unutulmasın.
    // `passwordChangedAt` NULL ise (hiç değiştirilmemiş, göç edilen hesaplar)
    // hiçbir token reddedilmez.
    if (user.passwordChangedAt && typeof payload.iat === 'number') {
      const tokenMs = payload.iat * 1000;
      if (
        tokenMs + JwtStrategy.IAT_TOLERANS_MS <
        user.passwordChangedAt.getTime()
      ) {
        throw new UnauthorizedException(
          'Parolaniz degistirildi. Lutfen tekrar giris yapin.',
        );
      }
    }
    // ADIM 1 (firma): kimligin DAR BOGAZI burasi — 55 tuketici bu sekli okur.
    // firmaId EKLENIR (var olan alanlar aynen kalir, hicbir tuketici kirilmaz):
    // teklif/kutuphane suzgecleri artik kisiyi degil FIRMAYI temel alacak.
    // Sorgu zaten kullaniciyi cekiyordu — ek maliyet YOK.
    return { id: user.id, email: user.email, role: user.role, firmaId: user.firmaId };
  }
}
