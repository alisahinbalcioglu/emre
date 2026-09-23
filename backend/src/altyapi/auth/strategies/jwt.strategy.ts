import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../db/prisma.service';
import { jwtSecret } from '../jwt-secret';
import {
  koltukDurumuHesapla,
  type FirmaRol,
} from '../../../ozellik/firma/uyelik-kurallari';
import {
  geriDonusPenceresinde,
  kapaliHesapDurumu,
  kapaliHesapMetni,
} from '../kapali-hesap';

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
    /**
     * 23.09.2026 — "bu token IKINCI ADIM GECILEREK alindi" (`mfa/dogrula`).
     * Yoneticide `mfaAcikAt` bos oldugu icin (e-posta yolunda TOTP kurulumu
     * yok) zorunluluk denetimi bunu okur. Eski token'larda YOKTUR.
     */
    mfa?: unknown;
    aud?: unknown;
    amac?: unknown;
  }) {
    // ── FAZ 7 F2b (§4.5 KATMAN 2): MEYDAN OKUMA OTURUM DEGILDIR ──────────
    // Iki adimli girisin ara token'i (`amac: 'mfa-dogrula' | 'mfa-kurulum'`,
    // `aud: 'metaprice:mfa'`) AYRI bir anahtarla imzalanir; katman 1 onu
    // zaten IMZA asamasinda reddeder ve bu satira HIC gelinmez.
    //
    // Bu satir KATMAN 2'dir: biri gunun birinde meydan okumayi yanlislikla
    // ANA anahtarla imzalarsa yine de oturum sayilmasin. Bir katman ucuz,
    // hesabin tamami pahali.
    //
    // ⚠ MEVCUT TOKEN'LAR ETKILENMEZ: bugunku erisim token'inda `aud` da
    // `amac` da YOK (`token-imza.ts` yalniz sub/email/role/authAt basar;
    // E2E'nin elle bastigi token de `aud`suz). `authAt` REDDEDILMEZ — o
    // bizim alanimiz.
    //
    // ⚠ ILK SATIR olmasi bilincli: DB'ye gitmeden once reddeder.
    if (payload.amac !== undefined || payload.aud !== undefined) {
      throw new UnauthorizedException();
    }
    // ⚠ PLAN 5.8 §4: `include` EKLENDI, `select` DEGIL. Sekil AYNEN korunur
    // (asagidaki her `user.<alan>` okumasi calismaya devam eder) ve firma
    // satirindan YALNIZ `imhaTarihi` gelir — tek sorguda JOIN, ek gidis
    // donus YOK. Ayri bir `firma.findUnique` yazilsaydi HER istege bir
    // sorgu daha binerdi.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { firma: { select: { imhaTarihi: true } } },
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
    //
    // ── PLAN 5.8 §4.1 (K1): GERI DONUS PENCERESI ─────────────────────────
    // ⚠ Bu kapiyi da gevsetmek ZORUNLU: `hesapKapisi` tek basina
    // gevsetilseydi musteri giris yapar, ELINDEKI TAZE token'la attigi ILK
    // istekte (o istek `/auth/me`dir) 401 alir, `ortak/lib/api.ts`
    // yakalayicisi token'i silip `/login`e atardi — sonsuz dongu. Iki kapi
    // AYNI saf yuklemi okur (`kapali-hesap.ts`), ikiz kural yok.
    //
    // ⚠ 401 KAPISI ACILDI, YETKI ACILMADI: pencerede olan hesap yalnizca
    // KIMLIKLI sayilir. "Ne yapabilir" sorusunu hemen asagidaki
    // `hesapKapali` bayragi ve `JwtAuthGuard` yanitlar (403 `HESAP_KAPALI`).
    if (user.deletedAt && !geriDonusPenceresinde(user)) {
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
    // ── FAZ 7 F2b: YONETICIDE IKI ADIMLI GIRIS ZORUNLU (§4.6) ────────────
    // Emre'nin karari: platform yoneticisi (role === 'admin') iki adimli
    // giris KURMADAN panele giremez.
    //
    // ⚠ NEDEN GIRIS YOLU YETMEZ: deploy aninda yoneticinin elinde 7 gunluk
    // gecerli bir token vardir ve giris ekranina HIC ugramadan calismaya
    // devam ederdi. Bu satir o token'i bir sonraki istekte 401'e dusurur;
    // on yuz `/login`e atar, parola dogrulanir ve zorunlu kurulum sihirbazi
    // acilir (`girisKarari` → `mfa-kurulum`).
    //
    // ⚠ FIRMA ZORUNLULUGU BURAYA KONMAZ (§4.6 gerekce): kurumsal girisle
    // alinmis MESRU token'i reddederdi (o yolda kod sorulmuyor) ve token'a
    // "giris yolu" yazmak yeni bir iddia yuzeyi acardi.
    //
    // ⚠ SIRA: ban/silme/parola kapilarindan SONRA, koltuk hesabindan ONCE.
    // Banli yoneticiye once "askiya alindi" denmeli; koltuk sorgusu ise
    // zaten reddedilecek bir istek icin bosuna kosmamali.
    /**
     * ── 23.09.2026: DAYANAK `mfaAcikAt`TAN IKINCI ADIM KANITINA TASINDI ──
     *
     * ⚠⚠ CANLIDA YASANDI. Emre karariyla yonetici girisinde kod artik
     * e-postadan geliyor ve o yolda TOTP KURULUMU YOK, yani `mfaAcikAt` HIC
     * dolmuyor. Bu satir yalniz `mfaAcikAt`a bakiyordu; sonuc: yonetici kodu
     * DOGRU giriyor, token aliniyor, ILK istekte 401 `MFA_KURULUM_GEREKLI`
     * yiyor ve giris ekranina geri atiliyordu — yani yonetici girisi
     * TAMAMEN KAPANMISTI.
     *
     * ⚠ KURAL UC YERDE YASIYOR ve UCU DE AYNI SEYI SOYLEMELI:
     *   · `girisKarariSaf`  → yoneticiyi `mfa-eposta` dalina yollar
     *   · `MfaServisi.epostaYontemiMi` → dogrulamayi e-posta koduna baglar
     *   · BURASI            → jetonu ikinci adim kanitiyla kabul eder
     * Ilk ikisini degistirip bu ucuncuyu unutmak, tam da bu deponun
     * tekrarlayan "ikizi unutma" hatasiydi.
     *
     * ⚠ KORUMA KALKMADI. Amac "deploy aninda elde duran 7 gunluk token bir
     * sonraki istekte dussun" idi; eski token'lar `mfa` iddiasini TASIMAZ,
     * yani aynen duserler ve yonetici yeniden giris yapar. Degisen tek sey
     * kanitin NEREDEN okundugu.
     */
    const ikinciAdimKaniti = payload.mfa === true;
    if (user.role === 'admin' && !user.mfaAcikAt && !ikinciAdimKaniti) {
      throw new UnauthorizedException({
        kod: 'MFA_KURULUM_GEREKLI',
        message:
          'Yönetici hesaplarında iki adımlı giriş zorunlu. Lütfen yeniden giriş yapın.',
      });
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
    // ── PLAN 5.8 §4.5: KAPALI HESAP / KAPALI FIRMA ───────────────────────
    // ⚠ KARAR BURADA VERILMEZ, yalniz HESAPLANIR — koltuk kapisiyla AYNI
    // gerekce: 403'u `JwtAuthGuard` atar cunku izin listesini (`@KapaliHesapIzinli`)
    // okumak `Reflector` ister, strateji onu gormez.
    //
    // ⚠ FIRMA EKSENI YETMEZ, KULLANICI EKSENI SART (olculdu): hesap
    // kapatilinca abonelik iptal edilir ve `erisim.servisi.ts` `IPTAL`
    // dalinda odenmis donem bitene kadar `erisimVar: true` doner — yani
    // firma ekseni kapali hesabi HIC durdurmaz. `Firma.imhaTarihi` ise
    // K2'nin ayagi: firmasi kapanan uye kendi `deletedAt`i BOS olsa da
    // durur.
    const kapali = kapaliHesapDurumu({
      deletedAt: user.deletedAt,
      kapatmaNedeni: user.kapatmaNedeni,
      imhaTarihi: user.imhaTarihi,
      firmaImhaTarihi: user.firma?.imhaTarihi ?? null,
    });

    // ⚠ Kapali hesapta koltuk sorgusu ATILMAZ: `JwtAuthGuard` kapali kapisini
    // ONCE calistirir, yani sonuc HICBIR ZAMAN okunmazdi. Ayrica durdurulmus
    // kapali bir hesabi `/koltuk-durduruldu`ya gondermek yanlis ekran olurdu.
    let koltukDurduruldu = false;
    let koltukHakki: number | null = null;
    if (!kapali.kapali && user.firmaId) {
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
      // PLAN 5.8 §4.5 — `JwtAuthGuard` bunlari okur. `kapatmaMetni` ekranda
      // ve 403 govdesinde AYNI cumle olsun diye burada uretilir.
      hesapKapali: kapali.kapali,
      kapatmaTipi: kapali.tip,
      imhaTarihi: kapali.imhaTarihi,
      kapatmaMetni: kapali.kapali ? kapaliHesapMetni(kapali) : null,
    };
  }
}
