import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../db/prisma.service';
import { HUKUKI_METIN_SURUMU } from './hukuki-surum';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { getFirmaCapabilities } from './capabilities.helper';
import { ErisimServisi } from '../../ozellik/odeme/abonelik/erisim.servisi';
import { EpostaDogrulamaServisi } from './eposta-dogrulama.servisi';
import { epostaIleKullaniciBul, epostaKucult } from './eposta';
import { firmaPaketSeviyesi } from './seviye';
import { OturumServisi, hesapKapisi } from './oturum.servisi';
import { mfaZorunluMu, type MfaZorunlulukNedeni } from './mfa/mfa-karari';
import { tokenImzala } from './token-imza';
import { firmaRolaGoreSuz } from '../../ozellik/firma/firma-maskele';
import { koltukDurumuHesapla, etkinHesapKosulu, type FirmaRol } from '../../ozellik/firma/uyelik-kurallari';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private erisim: ErisimServisi,
    private epostaDogrulama: EpostaDogrulamaServisi,
    // FAZ 7 F1b (§3.11): token veren TEK kapi. `login`/`register` artik
    // kendi yanitini kurmaz — ban/silme kapisi ve `authAt` tek yerde.
    private oturum: OturumServisi,
  ) {}

  async register(dto: RegisterDto) {
    // ── FAZ 6.12a / K-P6 (15.09): E-POSTA HARF BUYUKLUGU ─────────────────
    // Olculen acik: kayit adresi normalize etmiyor, varlik kontrolu BIREBIR
    // eslestiriyordu. "Ali@firma.com" kayitliyken "ali@firma.com" ile ikinci
    // hesap + yeni firma + yeni ucretsiz deneme aciliyordu. Artik kontrol
    // duyarsiz (mevcut karisik harfli kayitlari da yakalar) ve yeni adres
    // kucuk harfle saklanir. Kural tek yerde: eposta.ts.
    const email = epostaKucult(dto.email);
    const existing = await epostaIleKullaniciBul(this.prisma, email);
    if (existing) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 10);
    // ADIM 1 (firma): hesap artik KISI degil FIRMA. Her yeni kayit KENDI
    // firmasini acar ve o firmanin SAHIBI olur. Ic ice create tek islemdir —
    // kullanici olusup firma olusmazsa ortada suzgeclerin hicbir satiri
    // gormedigi "firmasiz hesap" kalirdi. Firma adi simdilik e-postanin @
    // oncesi parcasi (backfill ile ayni kural); sahibi ADIM 2'de degistirecek.
    // FAZ 5.3 — ONAY DAMGALARI. Boolean degil TARIH yaziliyor: uyusmazlikta
    // "onayladi mi" degil "NE ZAMAN ve HANGI METNI onayladi" sorulur.
    // ⚠ `sozlesmeOnayi` DTO'da `@Equals(true)` ile zorunlu; buraya ulasan
    // her istek onay vermistir. Ticari ileti izni AYRI ve varsayilani YOK —
    // gonderilmediyse izin VERILMEMIS sayilir (ETK/IYS: onceden isaretli ya
    // da sozlesmeye yedirilmis pazarlama izni gecersizdir).
    const simdi = new Date();
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashed,
        firmaRol: 'sahip',
        firma: { create: { ad: email.split('@')[0] } },
        sozlesmeOnayiAt: simdi,
        sozlesmeSurumu: HUKUKI_METIN_SURUMU,
        ticariIletiOnayiAt: dto.ticariIletiOnayi === true ? simdi : null,
      },
    });

    // FAZ 3.4: doğrulama bağlantısı yollanır. ⚠ `await` EDİLİR ama kendi
    // içinde hatayı yutar (`…Sessizce`): SMTP erişilemezse yeni kullanıcı
    // HESAP AÇAMAZ duruma düşmemeli — doğrulama bir işaret, kayıt ise ürünün
    // kapısıdır. Hata loglanır, kayıt tamamlanır.
    await this.epostaDogrulama.dogrulamaGonderSessizce(user.id, user.email);

    // FAZ 7 F1b: `authAt` = BIRINCIL kimlik dogrulama ani. Kayit parolayi
    // kullanicinin kendisi belirledigi icin birincildir.
    // FAZ 7 F2b (R1-O1): karar `girisKarari`da — yeni kayit da yonetici
    // olabilir (yonetici rolu sonradan verilse bile bir sonraki girisinde
    // kurulum sihirbazina duser) ve firma zorunlulugu burada da gecerlidir.
    return this.oturum.girisKarari(user, 'parola');
  }

  async login(dto: LoginDto) {
    // K-P6: buyuk/kucuk harfe duyarsiz; mevcut karisik harfli kayitlar
    // degistirilmedi, kayittaki yazimla da baska yazimla da giris calisir.
    const user = await epostaIleKullaniciBul(this.prisma, dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // ── G1 (28.08): BANLI HESAP GIRIS YAPAMAZ ────────────────────────────
    // Olculmus kusur: `UserStatus { active, banned }` semada VARDI ve admin
    // PATCH /api/admin/users/:id/status ile banliyordu, ama `status` alanini
    // TUM auth katmaninda HICBIR YER OKUMUYORDU (olculdu: auth.service +
    // jwt.strategy'de sifir gecis). Yani "ban" dugmesi yonetici panelinde
    // calisiyor gorunup HICBIR SEY YAPMIYORDU: banlanan kullanici giris
    // yapmaya ve calismaya devam ediyordu.
    // ⚠ Tek basina burasi YETMEZ — mevcut token'lar 7 gun daha gecerlidir.
    // Ikinci kapi jwt.strategy.validate'tedir; ikisi BIRLIKTE anlamlidir.
    // ⚠ FAZ 7 F1b: metinler `oturum.servisi.ts`e TASINDI (degistirilmedi).
    // Gerekce: token veren yol sayisi artiyor (davet kabul, MFA, kurumsal
    // giris) ve her biri bu iki kontrolu kendi yazarsa biri unutur.
    // ⚠ FAZ 7 F2b: `girisKarari` de ayni kapiyi cagirir; buradaki cagri
    // KALDIRILMADI cunku kaynak kapilari (`faz2-kullanici-yonetimi-test.ts`,
    // `guvenlik-turu-2-test.ts`) bu dosyada `hesapKapisi(` ARIYOR ve iki kez
    // cagrilmasinin bedeli sifir (saf, yan etkisiz).
    hesapKapisi(user);

    // FAZ 7 F2b (R1-O1): parola dogruysa is BITMEDI. Iki adimli giris acik
    // ya da zorunluysa yanit TOKEN DEGIL MEYDAN OKUMADIR (§4.4).
    return this.oturum.girisKarari(user, 'parola');
  }

  /**
   * ETKIN PAKET SEVIYESI (2.12, 17.09.2026) — `login`, `register` ve `/auth/me`
   * yanitlarindaki `tier` alani artik SAKLANAN `User.tier` degil, firmanin
   * aboneliginden TURETILIR.
   *
   * ⚠ Alan ADI korunur (`tier`): on yuz bu degeri localStorage kopyasina
   * yaziyor (`CapabilitiesContext.tsx`) ve kenar cubugu rozeti oradan okuyor.
   * Adi degistirmek ekranda sessizce bos rozet birakirdi.
   *
   * ⚠ Aboneligi olmayan firma `'core'` gorur (bugunku varsayilanin aynisi) —
   * `null` donmek on yuzde "paket yok" yerine BOZUK rozet uretirdi.
   *
   * ⚠ KVKK disa aktarimi bu turetmeyi KULLANMAZ: `hesap.servisi.ts` saklanan
   * degeri aynen verir (kisi hakkinda TUTULAN veri odur).
   */
  private async etkinSeviye(firmaId: string | null | undefined): Promise<string> {
    return (await firmaPaketSeviyesi(this.prisma, firmaId)) ?? 'core';
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        tier: true,
        createdAt: true,
        firmaId: true,
        // FAZ 3.4: uyarı şeridi buradan beslenir. /auth/me ön yüzün TEK
        // besleme noktasıdır (login yanıtı bunu taşımaz) — alan burada
        // dönmezse şerit hiçbir zaman görünmez.
        emailVerified: true,
        // FAZ 4.1 — KİŞİ alanları. Profil ekranı bunları gösterip düzenler.
        ad: true,
        soyad: true,
        telefon: true,
        firmaRol: true,
        // FAZ 7 F2b (§4.4): Guvenlik karti bu tek uctan beslenir.
        // ⚠ `mfaSirriSifreli` BURADA YOK ve OLMAMALI: sir hicbir yanitta
        // donmez (kurulum baslatma yanitindaki `otpauthUri` disinda, o da
        // bir kez). `select` yazmak kadar NE YAZMAMAK da kurali tasir.
        mfaAcikAt: true,
        mfaKaynagi: true,
        // FAZ 4.1 — FİRMA. ⚠ Ölçüldü: ön yüz bugüne kadar firma bilgisini HİÇ
        // göremiyordu; `/auth/me` yalnız `firmaId` dönüyordu ve `/abonelik/durum`
        // firma KİMLİĞİ taşımıyordu. Yani profil sayfası firmanın adını bile
        // yazamıyordu. Düzenlenebilir alan koymadan önce GÖSTERİLECEK değer olmalı.
        //
        // ⚠ `logoBytes` BURADA YOK ve olmamalı: Prisma `Bytes`i Buffer döndürür,
        // JSON'da base64'e çevrilir — logoyu bu yanıta koymak HER sayfa açılışında
        // binary taşırdı. Varlığı `logoMime` ile bildirilir, içeriği ayrı uçtan
        // (`GET /firma/logo`) gelir.
        firma: {
          select: {
            id: true,
            ad: true,
            // FAZ 7 F2b: zorunluluk rozeti ve sahip anahtarinin durumu.
            mfaZorunlu: true,
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
          },
        },
      },
    });
    if (!user) return null;

    const capabilities = await getFirmaCapabilities(this.prisma, user.firmaId);
    const subscriptions = await this.prisma.userSubscription.findMany({
      where: { userId, active: true },
      select: { id: true, level: true, scope: true, startsAt: true, endsAt: true },
    });

    // ADIM 2: YETENEK ile ERISIM ayri iki sorudur (bkz. capabilities.helper.ts).
    // `capabilities` = ne satin alindi · `erisim` = su an kullanilabilir mi.
    // Ikisi de BURADAN doner cunku on yuzun tek besleme noktasi /auth/me'dir
    // (login yaniti bunlari TASIMAZ — olculdu: auth.service.ts:55 yalniz
    // {id,email,role,tier} doner). Serit, kilitli butonlar ve "kalan gun"
    // sayaci bu tek yanittan beslenir.
    const erisim = user.firmaId
      ? await this.erisim.karar(user.firmaId)
      : null;

    // `logoVar`: on yuz logoyu ancak varsa cekmeli. Ikili veri bu yanitta YOK.
    // ⚠ FAZ 7 F1b (§3.6): UYEYE T.C. kimlik no ve yetkili e-posta GIZLENIR.
    // Antette basilan alanlar (vergi no/dairesi, fatura adresi/e-postasi,
    // telefon) firmanin TICARI kimligidir — uyeden gizlenmez, yalniz
    // duzenlenemez (duzenleme sahip kapili).
    const firma = user.firma
      ? firmaRolaGoreSuz(
          { ...user.firma, logoVar: Boolean(user.firma.logoMime) },
          user.firmaRol,
        )
      : null;

    // FAZ 7 F1b (§3.12 madde 4): durdurma ekrani bu tek uctan beslenir.
    const koltuk = await this.koltukBilgisi(user);

    // FAZ 7 F2b (§4.4): Guvenlik karti. ⚠ SIR ve KOD OZETLERI YOK — yalniz
    // "acik mi", "ne zaman acildi", "kac kurtarma kodu KALDI" ve zorunluluk.
    const mfa = await this.mfaBilgisi(user);

    // ⚠ `mfaAcikAt`/`mfaKaynagi` ham alanlar olarak da yayilirdi: `mfa`
    // nesnesi tek dogru okuma noktasi olsun diye YAYILIMDAN CIKARILIR.
    const { mfaAcikAt: _ham1, mfaKaynagi: _ham2, ...kisi } = user;

    // ⚠ `tier` SAKLANAN degeri EZER (2.12): `user` yayilimindan sonra gelir.
    return { ...kisi, tier: await this.etkinSeviye(user.firmaId), firma, koltuk, mfa, capabilities, subscriptions, erisim };
  }

  /**
   * MFA BILGISI (§4.4) — `/auth/me` yanitinin `mfa` alani.
   *
   * `zorunlu`/`zorunlulukNedeni` `mfa-karari.ts`teki AYNI saf yuklemden
   * gelir; ikiz yazilsaydi kart "kapatabilirsiniz" der, uc 400 dondururdu.
   */
  private async mfaBilgisi(user: {
    id: string;
    role: string;
    mfaAcikAt: Date | null;
    mfaKaynagi: string | null;
    firma: { mfaZorunlu: boolean } | null;
  }): Promise<{
    acik: boolean;
    acikAt: Date | null;
    kaynak: string | null;
    kalanKurtarmaKodu: number;
    zorunlu: boolean;
    zorunlulukNedeni: MfaZorunlulukNedeni | null;
  }> {
    const { zorunlu, neden } = mfaZorunluMu(user, user.firma);
    const kalanKurtarmaKodu = user.mfaAcikAt
      ? await this.prisma.mfaKurtarmaKodu.count({
          where: { userId: user.id, kullanildiAt: null },
        })
      : 0;
    return {
      acik: !!user.mfaAcikAt,
      acikAt: user.mfaAcikAt,
      kaynak: user.mfaKaynagi,
      kalanKurtarmaKodu,
      zorunlu,
      zorunlulukNedeni: neden,
    };
  }

  /**
   * KOLTUK BILGISI (§3.12) — `/auth/me` yanitinin `koltuk` alani.
   *
   * ⚠ `durduruldu` AYNI saf fonksiyondan gelir (`koltukDurumuHesapla`);
   * strateji de onu cagirir. Ikiz yazilsaydi biri "durduruldu" der, digeri
   * demezdi ve kullanici 403 alip "her sey normal" yazan bir ekran gorurdu.
   *
   * `sahipAdi` = firmanin EN ESKI ETKIN sahibi — durdurulan uye "kime
   * soyleyeyim" diye sormasin.
   */
  private async koltukBilgisi(user: {
    id: string;
    firmaId: string | null;
    firmaRol: string;
    createdAt: Date;
  }): Promise<{ durduruldu: boolean; hak: number | null; sahipAdi: string | null }> {
    if (!user.firmaId) return { durduruldu: false, hak: null, sahipAdi: null };
    const { durduruldu, hak } = await koltukDurumuHesapla(this.prisma, {
      id: user.id,
      firmaId: user.firmaId,
      firmaRol: user.firmaRol as FirmaRol,
      createdAt: user.createdAt,
    });
    const sahip = await this.prisma.user.findFirst({
      where: { firmaId: user.firmaId, firmaRol: 'sahip', ...etkinHesapKosulu() },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { ad: true, soyad: true, email: true },
    });
    const adSoyad = [sahip?.ad, sahip?.soyad].filter(Boolean).join(' ').trim();
    return {
      durduruldu,
      hak,
      sahipAdi: sahip ? (adSoyad || sahip.email) : null,
    };
  }

  /**
   * FAZ 4.1 — kullanicinin KENDI kisi bilgileri.
   *
   * ⚠ NEDEN AYRI BIR UC (firma ucundan bagimsiz): `ad/soyad/telefon` `User`a,
   * fatura alanlari `Firma`ya aittir. Tek uca yigmak, `firmaRol` kapisini
   * (yalniz `sahip` firmayi duzenler) kisi bilgilerine de dayatirdi — oysa
   * herkes KENDI adini degistirebilmeli.
   *
   * PATCH semantigi: govdede olmayan alana dokunulmaz, bos string TEMIZLER.
   */
  async profilGuncelle(
    userId: string,
    dto: { ad?: string; soyad?: string; telefon?: string },
  ) {
    const veri: Record<string, string | null> = {};
    for (const alan of ['ad', 'soyad', 'telefon'] as const) {
      const deger = dto[alan];
      if (deger === undefined) continue;
      const kirpik = deger.trim();
      veri[alan] = kirpik === '' ? null : kirpik;
    }
    if (Object.keys(veri).length > 0) {
      await this.prisma.user.update({ where: { id: userId }, data: veri });
    }
    // Tek besleme noktasi /auth/me oldugu icin GUNCEL tam sekli doneriz —
    // on yuz ikinci bir istek atmak zorunda kalmasin.
    return this.me(userId);
  }

  /**
   * ⚠ PUBLIC (Faz 3.5): `ParolaServisi` parola değişiminden sonra TAZE bir
   * token imzalamak zorunda — `passwordChangedAt` damgası kullanıcının
   * elindeki token'ı da geçersiz kılıyor. İmza kuralı (anahtar + süre) TEK
   * yerde kalsın diye kopyalanmadı, buradan paylaşılıyor.
   */
  signToken(id: string, email: string, role: string, authAt?: number | null) {
    // FAZ 7 F1b: govde `token-imza.ts`e tasindi. `authAt` ISTEGE BAGLI —
    // mevcut cagiranlar (`ParolaServisi`, testlerdeki sahteler) argumani
    // vermez ve davranislari degismez (`null` → payload'a alan konmaz).
    return tokenImzala(this.jwtService, id, email, role, authAt ?? null);
  }
}
