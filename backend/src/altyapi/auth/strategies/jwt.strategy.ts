import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../db/prisma.service';
import { jwtSecret } from '../jwt-secret';
import {
  koltukDurumuHesapla,
  type FirmaRol,
} from '../../../ozellik/firma/uyelik-kurallari';

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
   * ⚠ KARŞILAŞTIRMA SANİYE ↔ SANİYE YAPILIR — MİLİSANİYE DEĞİL.
   *
   * JWT'nin `iat` alanı SANİYE cinsindendir ve imzalanırken AŞAĞI yuvarlanır;
   * `passwordChangedAt` ise milisaniyeli bir `DateTime`. İki farklı çözünürlüğü
   * doğrudan karşılaştırmak iki yönlü de yanlış sonuç verir, bu yüzden damga da
   * saniyeye indirilip öyle kıyaslanır.
   *
   * ⚠ BU KOD ÖNCE "2 SANİYE TOLERANS" OLARAK YAZILDI ve CANLIDA ÇÖKTÜ:
   * hesap açılıp ~2 sn sonra parola değiştirildiğinde ESKİ token hâlâ KABUL
   * EDİLİYORDU (ölçüldü: `/auth/me` 200 döndü, 401 beklenirken). Birim testi
   * yeşildi çünkü orada aradaki fark 60 sn'ydi — tolerans yalnız DAR aralıkta
   * yanlış davranıyordu. Ders: iki farklı çözünürlüğü "tolerans" ile
   * uzlaştırmak, hatayı yok etmez; yalnız hangi aralıkta patlayacağını
   * değiştirir.
   *
   * Saniye↔saniye karşılaştırma bunu kesin olarak çözer:
   *   · Parola değişimiyle AYNI saniyede imzalanan TAZE token: `S < S` yanlış
   *     → KABUL (kullanıcı kendi işlemiyle dışarı atılmaz).
   *   · Önceki herhangi bir saniyede imzalanmış token: `S-n < S` doğru → RET.
   * Geriye kalan ≤1 sn'lik pencere `iat`'in saniye çözünürlüğünden gelir ve
   * kapatılamaz; çalınmış bir token için pratik değeri yoktur.
   *
   * Damganın yazılırken yuvarlanmış olmasına GEREK YOK: her iki taraf da
   * burada saniyeye indirildiği için kural, damgayı kimin yazdığından bağımsız
   * çalışır.
   */
  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    iat?: number;
    authAt?: number;
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
      const degisimSaniyesi = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (payload.iat < degisimSaniyesi) {
        throw new UnauthorizedException(
          'Parolaniz degistirildi. Lutfen tekrar giris yapin.',
        );
      }
    }
    // ── FAZ 7 F1b: KISI SINIRI HER ISTEKTE (§3.12, Emre karari E-3) ──────
    // Paket kuculdugunde ya da hak dusuruldugunde kimse SILINMEZ; hakki asan
    // hesaplar DURDURULUR. Karar TURETILIR (saklanmaz): hak degisikligi
    // betik, webhook, havale ve yonetici gibi cok kaynaktan gelir ve
    // saklanan bir bayrak o kaynaklardan birinde bayatlardi.
    //
    // ⚠ KARAR BURADA VERILMEZ, yalniz HESAPLANIR. 403'u `JwtAuthGuard`
    // atar: izin listesini (`@KoltukDisiIzinli`) okumak icin `Reflector` ve
    // `ExecutionContext` gerekir, strateji ikisini de gormez.
    //
    // ⚠ MALIYET: `onceGelen === 0` ise hak sorgusu ATILMAZ — tek kisilik
    // firmada istek basina ek maliyet TEK `count`. Indeks migration'da
    // (`User(firmaId, firmaRol, createdAt)`).
    let koltukDurduruldu = false;
    let koltukHakki: number | null = null;
    if (user.firmaId) {
      const durum = await koltukDurumuHesapla(this.prisma, {
        id: user.id,
        firmaId: user.firmaId,
        firmaRol: user.firmaRol as FirmaRol,
        createdAt: user.createdAt,
      });
      koltukDurduruldu = durum.durduruldu;
      koltukHakki = durum.hak;
    }
    // ADIM 1 (firma): kimligin DAR BOGAZI burasi — bu sekli okuyan tuketici
    // SAYISI OLCULMEDI; sekil yalniz EKLEMELI degisir, hicbir tuketici
    // kirilmaz. firmaId SUZGEC, userId YAZAR (kimlik.ts).
    // `firmaRol` (F1b): FirmaRolGuard'in birinci katmani. Sorgu zaten tam
    // satiri cekiyordu — ek maliyet YOK. Rol degisikligi token yenilemeden
    // SONRAKI istekte etkilidir (guard bu degeri okur, servis ayrica DB'den).
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firmaId: user.firmaId,
      firmaRol: user.firmaRol,
      authAt: typeof payload.authAt === 'number' ? payload.authAt : null,
      koltukDurduruldu,
      koltukHakki,
    };
  }
}
