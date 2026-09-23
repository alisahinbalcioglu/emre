import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../db/prisma.service';
import { EpostaServisi } from '../../../ozellik/odeme/eposta/eposta.servisi';
import { OturumServisi, hesapKapisi, yakinZamandaGirisMi } from '../oturum.servisi';
import { anahtarDurumu, coz, sifrele } from '../kimlik-sifreleme';
import { meydanOkumaDogrula } from './meydan-okuma';
import {
  girisKarariSaf,
  kapatilabilirMi,
  mfaTemizlemeVerisi,
  type MfaZorunlulukNedeni,
} from './mfa-karari';
import {
  base32Coz,
  base32Kodla,
  otpauthUri,
  totpDogrula,
  totpSiriUret,
} from './totp';
import {
  kurtarmaKoduNormalize,
  kurtarmaKodlariniOzetle,
  kurtarmaKodlariUret,
} from './kurtarma-kodu';
import {
  EPOSTA_KODU_GECERLILIK_SN,
  epostaKoduOzetle,
  epostaKoduSuresiDoldu,
  epostaKoduTutuyorMu,
  epostaKoduUret,
  yenidenGonderilebilirMi,
} from './eposta-kodu';
import {
  mfaAcildiEpostasi,
  mfaBesHataliEpostasi,
  mfaKapatildiEpostasi,
  mfaKilitlendiEpostasi,
  mfaGirisKoduEpostasi,
  mfaKurtarmaKoduKullanildiEpostasi,
} from './mfa-epostalari';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — IKI ADIMLI GIRIS SERVISI (§4.4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ── UC KURAL, HEPSI OLCULMUS BIR HATADAN DOGDU ──────────────────────────
 *
 *  1) OTURUM ACIKKEN YANLIS PAROLA/KOD **400**'DUR, 401 DEGIL.
 *     `api.ts:36-52` yakalayicisi 401 goren her istekte kullaniciyi OTURUMDAN
 *     ATAR. "Kodu yanlis yazdim" diye uygulamadan atilmak kullanicinin
 *     hatasini cezalandirmaktir. 401 YALNIZ meydan okuma gecersizken doner
 *     (o zaten giris ekranindadir ve 1. adima donmesi DOGRU davranistir).
 *
 *  2) HER DENEME ONCE **REZERVE EDER** (R1-O2). Once "dogru mu" bakip sonra
 *     sayaci artirmak, N istegi ayni anda gonderen saldirganin siniri
 *     asmasina izin verirdi. Sayac `updateMany` ile KOSULLU artirilir
 *     (`mfaHataSayaci < 20` ve `mfaKilitliAt: null`); `count === 0` ise
 *     deneme HIC yapilmaz. Sinir atomiktir, kod hicbir yerde "once oku
 *     sonra yaz" yapmaz.
 *
 *  3) MFA'SI ACIK BIR HESABIN SIRRI PAROLAYLA DEGISTIRILEMEZ (R1-Y2).
 *     Her onay yolu `updateMany({ where: { id, mfaAcikAt: null } })` ile
 *     yazar: yaris da olsa, elle basilmis token da olsa acik bir hesabin
 *     sirrinin uzerine YAZILAMAZ (`count !== 1` → `MFA_ZATEN_ACIK`).
 */

/** Bekleyen (henuz kodla onaylanmamis) kurulum sirrinin omru. */
export const KURULUM_SURESI_DK = 15;
/** Art arda hatali deneme tavani; ulasilinca hesap kilitlenir. */
export const HATA_TAVANI = 20;
/** Bu esikte kullaniciya "parolaniz baskasinin elinde olabilir" uyarisi. */
export const UYARI_ESIGI = 5;
/** Uretilen kurtarma kodu adedi. */
export const KURTARMA_KODU_ADEDI = 10;
/**
 * Zorunlu kurulum yolunun BEKLEDIGI meydan okuma amaci (R1-Y2).
 *
 * ⚠ TEK SABIT: uc yerde (baslat, onayla, zorunluluk yeniden olcumu) ayri
 * ayri yazilsaydi biri gunun birinde `mfa-dogrula` olur ve MFA'si ACIK bir
 * hesabin sirri parolayla degistirilebilirdi.
 */
const ZORUNLU_AMAC = 'mfa-kurulum' as const;

const KOD_HATALI = {
  kod: 'MFA_KOD_HATALI',
  message:
    'Kod hatalı ya da az önce kullanıldı. Uygulamadaki bir sonraki kodu bekleyin.',
};
const KILITLI = {
  kod: 'MFA_KILITLI',
  message:
    'Çok fazla hatalı deneme yapıldı; doğrulama adımı kilitlendi. ' +
    'Parolanızı sıfırlayarak ya da yöneticinize başvurarak açabilirsiniz.',
};
const ZATEN_ACIK = {
  kod: 'MFA_ZATEN_ACIK',
  message: 'Bu hesapta iki adımlı giriş zaten açık.',
};
const ZORUNLU_DEGIL = {
  kod: 'MFA_ZORUNLU_DEGIL',
  message: 'Bu hesapta iki adımlı giriş artık zorunlu değil. Yeniden giriş yapın.',
};
const SURE_DOLDU = {
  kod: 'KURULUM_SURESI_DOLDU',
  message: `Kurulum süresi doldu (${KURULUM_SURESI_DK} dakika). Lütfen yeniden başlatın.`,
};
const PAROLA_HATALI = {
  kod: 'PAROLA_HATALI',
  message: 'Parolanız hatalı.',
};
const YENIDEN_GIRIS = {
  kod: 'YENIDEN_GIRIS_GEREKLI',
  message:
    'Bu işlem için son 10 dakika içinde giriş yapmış olmanız gerekiyor. ' +
    'Çıkış yapıp yeniden girin.',
};
const MFA_KAPALI = {
  kod: 'MFA_KAPALI',
  message: 'Bu hesapta iki adımlı giriş açık değil.',
};
const DOGRULAMA_YOK = {
  kod: 'MFA_DOGRULAMA_YOK',
  message: 'Doğrulama kodu ya da kurtarma kodu gönderin.',
};

type KullaniciSatiri = {
  id: string;
  email: string;
  role: string;
  password: string;
  status: string;
  deletedAt: Date | null;
  passwordChangedAt: Date | null;
  firmaId: string | null;
  firmaRol: string;
  createdAt: Date;
  mfaSirriSifreli: string | null;
  mfaAcikAt: Date | null;
  mfaKaynagi: string | null;
  mfaSonAdim: number | null;
  mfaBekleyenSirSifreli: string | null;
  mfaBekleyenAt: Date | null;
  mfaHataSayaci: number;
  mfaKilitliAt: Date | null;
  // 23.09 — yonetici girisinde e-posta kodu (Emre karari)
  mfaEpostaKoduOzeti: string | null;
  mfaEpostaKoduAt: Date | null;
  mfaEpostaSonGonderim: Date | null;
};

@Injectable()
export class MfaServisi {
  private readonly logger = new Logger(MfaServisi.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oturum: OturumServisi,
    private readonly eposta: EpostaServisi,
  ) {}

  // ═════════════════════════════════════════════════════════════════════════
  //  GIRIS DALI — MEYDAN OKUMA ILE (guardsiz uclar)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * `POST /auth/mfa/dogrula` — 6 haneli kod ya da kurtarma kodu → token.
   *
   * ⚠ Meydan okumayi dogrulamak YETMEZ: kullanici o token basildiktan sonra
   * banlanmis, hesabini kapatmis ya da parolasini degistirmis olabilir.
   * Ayni kapilar (strateji kurali) BURADA DA kosar.
   */
  /**
   * ═════════════════════════════════════════════════════════════════════
   *  `POST /auth/mfa/eposta/gonder` — YONETICI GIRIS KODU (23.09.2026)
   * ═════════════════════════════════════════════════════════════════════
   *
   *  Emre karari: yonetici girisinde kod telefondaki uygulamadan degil
   *  e-posta kutusundan gelir. Kurulum adimi YOKTUR.
   *
   *  ⚠ AYNI UC "YENIDEN GONDER" UCUDUR. Ayri bir uc acilsaydi kisit iki
   *  yerde tutulurdu ve biri gunun birinde otekinden saparadi.
   *
   *  ⚠ GONDERIM SONUCU OKUNUR. `mfa-epostalari.ts` basligindaki "hicbiri
   *  akisi bloklamaz" kurali BU POSTAYA UYMAZ: gitmezse yonetici GIREMEZ.
   *  Bu yuzden `gonder` basarisizsa 503 firlatilir ve ekran "gonderilemedi,
   *  tekrar deneyin" der — sessizce beklemez.
   *
   *  ⚠ KOD, POSTA GIDERSE yazilir. Once yazip sonra gondermeyi denersek,
   *  gonderim basarisiz oldugunda kullanicinin elinde OLMAYAN bir kod
   *  veritabaninda gecerli durur ve onceki (eline ulasmis) kodu gecersiz
   *  kilmis oluruz — kisi calisan kodunu kaybeder.
   */
  async epostaKoduGonder(meydanOkuma: string) {
    const { user } = await this.meydanOkumayiCoz(meydanOkuma, 'mfa-dogrula');
    const simdi = new Date();

    const kisit = yenidenGonderilebilirMi(user.mfaEpostaSonGonderim, simdi);
    if (!kisit.olur) {
      throw new BadRequestException({
        kod: 'MFA_EPOSTA_COK_SIK',
        message: `Yeni kod istemek için ${kisit.kalanSn} saniye bekleyin.`,
        kalanSn: kisit.kalanSn,
      });
    }

    const kod = epostaKoduUret();
    /**
     * ⚠ `gonderKritik`, `gonder` DEGIL. Fark olculdu: `gonder` SMTP
     * yapilandirilmamissa yalnizca uyari loglar ve SESSIZCE doner — bu
     * akista o davranis, kullanicinin hic gelmeyecek bir kodu sonsuza kadar
     * beklemesi demek olurdu. `gonderKritik` hata FIRLATIR.
     */
    try {
      await this.eposta.gonderKritik(
        mfaGirisKoduEpostasi(user.email, kod, Math.round(EPOSTA_KODU_GECERLILIK_SN / 60)),
      );
    } catch (e) {
      this.logger.error(`[MFA] giris kodu POSTALANAMADI: ${user.id}`, e as Error);
      throw new ServiceUnavailableException({
        kod: 'MFA_EPOSTA_GONDERILEMEDI',
        message:
          'Doğrulama kodu gönderilemedi. Birazdan tekrar deneyin; sorun sürerse destek ekibine yazın.',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEpostaKoduOzeti: epostaKoduOzetle(kod, user.id),
        mfaEpostaKoduAt: simdi,
        mfaEpostaSonGonderim: simdi,
      },
    });
    // ⚠ KOD YANITTA DONMEZ. Doner olsaydi posta kutusuna erisimi olmayan
    //   biri de girebilirdi, yani ikinci adim hic olmazdi.
    return { gonderildi: true, gecerlilikSn: EPOSTA_KODU_GECERLILIK_SN };
  }

  async dogrula(
    meydanOkuma: string,
    girdi: { kod?: string; kurtarmaKodu?: string },
  ) {
    const { user } = await this.meydanOkumayiCoz(meydanOkuma, 'mfa-dogrula');

    /**
     * ── 23.09 — YONETICI E-POSTA KODU DALI ────────────────────────────
     * ⚠ `mfaAcikAt` DENETIMINDEN ONCE: yoneticide TOTP kurulumu YOKTUR,
     *   yani `mfaAcikAt` bostur. Asagidaki denetim once kosaydi yonetici
     *   dogru kodu girse bile "sureniz doldu" yerdi — ozelligin tamami
     *   sessizce olurdu.
     */
    if (this.epostaYontemiMi(user)) {
      await this.epostaKodunuDogrula(user, girdi);
      return this.oturum.oturumYaniti(user, {
        authAt: Math.floor(Date.now() / 1000),
      });
    }

    // Giris ile dogrulama arasinda MFA kapatildiysa ortada dogrulanacak bir
    // sey yoktur: kullaniciyi 1. adima gonderiyoruz (sayac HARCANMAZ).
    if (!user.mfaAcikAt) {
      throw new UnauthorizedException({
        kod: 'MEYDAN_OKUMA_GECERSIZ',
        message: 'Doğrulama süresi doldu ya da geçersiz. Lütfen yeniden giriş yapın.',
      });
    }
    await this.denemeyiDogrula(user, girdi);
    return this.oturum.oturumYaniti(user, {
      // ⚠ YENI `authAt`: ikinci adim da BIRINCIL kimlik dogrulamasidir.
      authAt: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * `POST /auth/mfa/zorunlu-kurulum/baslat` (R1-Y2).
   *
   * ⚠ IKI KATMAN AYRI AYRI: (1) meydan okumanin AMACI `mfa-kurulum` olmali —
   * `login`den gelen `mfa-dogrula` token'i BURAYA GIREMEZ; (2) kullanicinin
   * `mfaAcikAt`i BOS olmali. Tek katman yeterli sanilirsa, MFA'si acik bir
   * hesapta parolayi bilen biri sirri DEGISTIREBILIRDI.
   */
  async zorunluKurulumBaslat(meydanOkuma: string) {
    const { user } = await this.meydanOkumayiCoz(meydanOkuma, ZORUNLU_AMAC);
    if (user.mfaAcikAt !== null) throw new BadRequestException(ZATEN_ACIK);
    await this.zorunlulukHalaVarMi(user, meydanOkuma);
    return this.bekleyenSirriYaz(user);
  }

  /** `POST /auth/mfa/zorunlu-kurulum/onayla` — kod dogru → token + kodlar. */
  async zorunluKurulumOnayla(meydanOkuma: string, kod: string) {
    const { user } = await this.meydanOkumayiCoz(meydanOkuma, ZORUNLU_AMAC);
    if (user.mfaAcikAt !== null) throw new BadRequestException(ZATEN_ACIK);
    const neden = await this.zorunlulukHalaVarMi(user, meydanOkuma);
    const kurtarmaKodlari = await this.kurulumuTamamla(
      user,
      kod,
      neden === 'yonetici' ? 'zorunlu-yonetici' : 'zorunlu-firma',
    );
    const yanit = await this.oturum.oturumYaniti(user, {
      // Zorunlu kurulum GIRIS akisinin parcasidir: `authAt` YENIDIR.
      authAt: Math.floor(Date.now() / 1000),
    });
    return { ...yanit, kurtarmaKodlari };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  OTURUMLU UCLAR — yanlis girdide 400 (asla 401)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * `POST /auth/mfa/kurulum/baslat` (R1-Y1) — YENIDEN KIMLIK DOGRULAMASI.
   *
   * ⚠ NEDEN PAROLA ISTIYORUZ: kurulum yalnizca bearer token'la yapilabilseydi,
   * CALINMIS bir token tek basina iki adimli giris KURAR ve gercek sahibini
   * hesabindan kilitlerdi. "Taze `iat`" da kanit degildir: token'i basan her
   * islem `iat`i tazeler — bu yuzden `authAt` (birincil dogrulama ani) ayri
   * tutulur ve MFA yeniden basimlarinda KOPYALANIR, yenilenmez.
   */
  async kurulumBaslat(
    userId: string,
    girdi: { parola?: string },
    authAt: number | null,
  ) {
    const user = await this.kullaniciAl(userId);
    if (user.mfaAcikAt !== null) throw new BadRequestException(ZATEN_ACIK);
    await this.yenidenKimlikDogrula(user, girdi.parola, authAt);
    return this.bekleyenSirriYaz(user);
  }

  /** `POST /auth/mfa/kurulum/onayla` — token ESKI `authAt`i KOPYALAR. */
  async kurulumOnayla(userId: string, kod: string, authAt: number | null) {
    const user = await this.kullaniciAl(userId);
    if (user.mfaAcikAt !== null) throw new BadRequestException(ZATEN_ACIK);
    const kurtarmaKodlari = await this.kurulumuTamamla(user, kod, 'kisisel');
    // ⚠ `authAt` KOPYALANIR (R1-Y1): bu istek yeni bir birincil kimlik
    // dogrulamasi DEGILDIR — token yalnizca damga yuzunden yeniden basiliyor.
    const yanit = await this.oturum.oturumYaniti(user, { authAt });
    void this.epostaYolla(mfaAcildiEpostasi(user.email));
    return { ...yanit, kurtarmaKodlari };
  }

  /** `POST /auth/mfa/kapat` — parola YA DA kod/kurtarma kodu ister. */
  async kapat(
    userId: string,
    girdi: { parola?: string; kod?: string; kurtarmaKodu?: string },
    authAt: number | null,
  ) {
    const user = await this.kullaniciAl(userId);
    if (!user.mfaAcikAt) throw new BadRequestException(MFA_KAPALI);
    const firma = await this.firmaOku(user.firmaId);
    const { kapatilabilir, mesaj, neden } = kapatilabilirMi(user, firma);
    if (!kapatilabilir) {
      throw new BadRequestException({ kod: 'MFA_ZORUNLU', neden, message: mesaj });
    }
    if (typeof girdi.parola === 'string' && girdi.parola !== '') {
      await this.parolaDogrula(user, girdi.parola);
    } else {
      await this.denemeyiDogrula(user, girdi);
    }
    const simdi = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: mfaTemizlemeVerisi(simdi),
      });
      await tx.mfaKurtarmaKodu.deleteMany({ where: { userId: user.id } });
    });
    void this.epostaYolla(mfaKapatildiEpostasi(user.email));
    // Damga atildi: bu istegin token'i da olurdu. Taze token ESKI `authAt`i
    // tasir (R1-Y1) — kapatma yakin-zaman kaniti URETMEZ.
    return this.oturum.oturumYaniti(user, { authAt });
  }

  /** `POST /auth/mfa/kurtarma-kodlari/yenile` — 10 yeni kod, eskiler silinir. */
  async kurtarmaKodlariniYenile(userId: string, kod: string) {
    const user = await this.kullaniciAl(userId);
    if (!user.mfaAcikAt) throw new BadRequestException(MFA_KAPALI);
    await this.denemeyiDogrula(user, { kod });
    const { duzler, ozetler } = await this.kurtarmaKodlariHazirla();
    // ⚠ AYNI TRANSACTION: silme basarili olup yazma dusseydi kullanici
    // kurtarma kodsuz kalirdi (telefonunu kaybederse hesabina giremez).
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaKurtarmaKodu.deleteMany({ where: { userId: user.id } });
      await tx.mfaKurtarmaKodu.createMany({
        data: ozetler.map((kodOzeti) => ({ userId: user.id, kodOzeti })),
      });
    });
    // ⚠ DAMGA YOK (§4.7): kurtarma kodu yenilemek oturumlari KAPATMAZ.
    return { kurtarmaKodlari: duzler };
  }

  /**
   * `POST /auth/mfa/sirket-girisinde-de-sor` (R1/E-4).
   *
   * Zorunlulukla MFA kurmus kisiye sirket hesabiyla girerken kod SORULMAZ.
   * Kisi "bana yine de sorun" derse kaynak `kisisel`e cevrilir ve kurumsal
   * yolda da kod istenir. Kod ISTER: bu bir guvenlik ayaridir.
   */
  async sirketGirisindeDeSor(userId: string, kod: string) {
    const user = await this.kullaniciAl(userId);
    if (!user.mfaAcikAt) throw new BadRequestException(MFA_KAPALI);
    await this.denemeyiDogrula(user, { kod });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaKaynagi: 'kisisel' },
    });
    return { kaynak: 'kisisel' as const };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  ORTAK PARCALAR
  // ═════════════════════════════════════════════════════════════════════════

  /** Meydan okuma → kullanici; strateji kapilarinin AYNISI burada da kosar. */
  private async meydanOkumayiCoz(
    meydanOkuma: string,
    amac: 'mfa-dogrula' | 'mfa-kurulum',
  ): Promise<{ user: KullaniciSatiri; yol: 'parola' | 'kurumsal' }> {
    const { userId, yol, iat } = meydanOkumaDogrula(meydanOkuma, amac);
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
    })) as KullaniciSatiri | null;
    if (!user) throw new UnauthorizedException();
    // Ban / yumusak silme: meydan okuma basildiktan SONRA olmus olabilir.
    // ⚠ EN DAR SEKIL acikca gecirilir: kapinin okudugu iki alan gorunur
    // olsun ve bu cagri `kullaniciAl`dakinden METINSEL olarak ayrilsin
    // (mutasyon deseni KODDA benzersiz olmali).
    hesapKapisi({ status: user.status, deletedAt: user.deletedAt });
    // Parola degisimi (ya da MFA damgasi) meydan okumayi da olduren olaydir —
    // `jwt.strategy.ts`teki kuralin AYNISI, saniye↔saniye.
    if (user.passwordChangedAt) {
      const damga = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (iat < damga) {
        throw new UnauthorizedException({
          kod: 'MEYDAN_OKUMA_GECERSIZ',
          message: 'Doğrulama süresi doldu ya da geçersiz. Lütfen yeniden giriş yapın.',
        });
      }
    }
    return { user, yol };
  }

  /** Zorunluluk HALA duruyor mu — saf karar YENIDEN kosar (R1-Y2). */
  private async zorunlulukHalaVarMi(
    user: KullaniciSatiri,
    meydanOkuma: string,
  ): Promise<MfaZorunlulukNedeni> {
    const { yol } = meydanOkumaDogrula(meydanOkuma, ZORUNLU_AMAC);
    const firma = await this.firmaOku(user.firmaId);
    const { tip, neden } = girisKarariSaf({ user, firma, yol });
    // Firma anahtari arada kapatildiysa kimseyi kurulum yapmaya zorlamayiz.
    if (tip !== 'mfa-kurulum' || neden === null) {
      throw new BadRequestException(ZORUNLU_DEGIL);
    }
    return neden;
  }

  /** Oturumlu kurulumda yeniden kimlik dogrulamasi (R1-Y1). */
  private async yenidenKimlikDogrula(
    user: KullaniciSatiri,
    parola: string | undefined,
    authAt: number | null,
  ): Promise<void> {
    // `parolaTanimli` kolonu F3b'de gelir; bugun HERKES parolalidir.
    // Kolon yokken `undefined !== false` → parola dali kosar (dogru taraf).
    const parolasiz = (user as unknown as { parolaTanimli?: boolean }).parolaTanimli === false;
    if (!parolasiz) {
      await this.parolaDogrula(user, parola ?? '');
      return;
    }
    if (!yakinZamandaGirisMi(authAt, Math.floor(Date.now() / 1000))) {
      throw new BadRequestException(YENIDEN_GIRIS);
    }
  }

  private async parolaDogrula(user: KullaniciSatiri, parola: string): Promise<void> {
    const dogru =
      typeof user.password === 'string' &&
      user.password !== '' &&
      (await bcrypt.compare(parola, user.password));
    // ⚠ 400 — 401 DEGIL: oturum acikken 401 kullaniciyi disari atar.
    if (!dogru) throw new BadRequestException(PAROLA_HATALI);
  }

  /** Bekleyen sirri uretir, SIFRELI yazar ve kurulum verisini doner. */
  private async bekleyenSirriYaz(user: KullaniciSatiri) {
    this.anahtariDenetle();
    const sir = totpSiriUret();
    const b32 = base32Kodla(sir);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        // ⚠ DUZ SIR DB'YE HIC YAZILMAZ: AES-256-GCM + AAD `mfa:<userId>`.
        // AAD, sifreli degerin baska bir kullanicinin satirina
        // KOPYALANMASINI yakalar.
        mfaBekleyenSirSifreli: sifrele(b32, `mfa:${user.id}`),
        mfaBekleyenAt: new Date(),
      },
    });
    return { otpauthUri: otpauthUri(user.email, b32), elleAnahtar: b32 };
  }

  /**
   * Kurulum onayinin ORTAK govdesi: bekleyen sir → kod → KOSULLU yazim.
   *
   * ⚠ `where: { id, mfaAcikAt: null }`: acik bir hesabin sirri ASLA
   * uzerine yazilamaz (R1-Y2). `count !== 1` → transaction GERI ALINIR ve
   * kurtarma kodlari da yazilmaz.
   */
  private async kurulumuTamamla(
    user: KullaniciSatiri,
    kod: string,
    kaynak: 'kisisel' | 'zorunlu-firma' | 'zorunlu-yonetici',
  ): Promise<string[]> {
    this.anahtariDenetle();
    if (!user.mfaBekleyenSirSifreli || !user.mfaBekleyenAt) {
      throw new BadRequestException(SURE_DOLDU);
    }
    const yas = Date.now() - user.mfaBekleyenAt.getTime();
    if (yas > KURULUM_SURESI_DK * 60_000) throw new BadRequestException(SURE_DOLDU);
    const sirB32 = coz(user.mfaBekleyenSirSifreli, `mfa:${user.id}`);
    const adim = await this.kodAdiminiAl(user, kod, sirB32);
    const simdi = new Date();
    const { duzler, ozetler } = await this.kurtarmaKodlariHazirla();
    await this.prisma.$transaction(async (tx) => {
      const yazim = await tx.user.updateMany({
        where: { id: user.id, mfaAcikAt: null },
        data: {
          mfaSirriSifreli: sifrele(sirB32, `mfa:${user.id}`),
          mfaAcikAt: simdi,
          mfaKaynagi: kaynak,
          mfaSonAdim: adim,
          mfaBekleyenSirSifreli: null,
          mfaBekleyenAt: null,
          mfaHataSayaci: 0,
          mfaKilitliAt: null,
          // §4.7 — iki adimli giris acilinca diger cihazlar duser.
          passwordChangedAt: simdi,
        },
      });
      if (yazim.count !== 1) throw new BadRequestException(ZATEN_ACIK);
      await tx.mfaKurtarmaKodu.deleteMany({ where: { userId: user.id } });
      await tx.mfaKurtarmaKodu.createMany({
        data: ozetler.map((kodOzeti) => ({ userId: user.id, kodOzeti })),
      });
    });
    return duzler;
  }

  /**
   * Bu kullanici E-POSTA yontemini mi kullaniyor? (23.09, Emre karari)
   *
   * ⚠ TEK KAYNAK: kural `girisKarariSaf`taki dalla AYNI olmali — biri
   * "yoneticiye e-posta kodu sor" derken oteki TOTP beklerse kullanici
   * dogru kodu girip reddedilir. Ikisi de `role === 'admin'`e bakar ve bu
   * eslik kapida olculur.
   */
  private epostaYontemiMi(user: KullaniciSatiri): boolean {
    return user.role === 'admin';
  }

  /**
   * E-posta kodunu dogrular. Kilit/sayac MEKANIZMASI TOTP ile AYNIDIR
   * (`rezerveEt` / `hataSonrasi`) — ikinci bir kova yazilsaydi saldirgan
   * kovalardan birini tuketip otekinden devam ederdi.
   */
  private async epostaKodunuDogrula(
    user: KullaniciSatiri,
    girdi: { kod?: string; kurtarmaKodu?: string },
  ): Promise<void> {
    const kod = typeof girdi.kod === 'string' ? girdi.kod.trim() : '';
    if (kod === '') throw new BadRequestException(DOGRULAMA_YOK);
    // ⚠ REZERVASYON ONCE (TOTP yolundaki R1-O2 ile ayni gerekce): sinirsiz
    //   deneme olmasin. Kilitliyse burada `MFA_KILITLI` firlar.
    await this.rezerveEt(user);

    const simdi = new Date();
    if (epostaKoduSuresiDoldu(user.mfaEpostaKoduAt, simdi)) {
      await this.hataSonrasi(user);
      throw new BadRequestException({
        kod: 'MFA_EPOSTA_SURE_DOLDU',
        message: 'Kodun süresi doldu. "Kodu yeniden gönder" ile yeni bir kod isteyin.',
      });
    }
    if (!epostaKoduTutuyorMu(kod, user.id, user.mfaEpostaKoduOzeti)) {
      await this.hataSonrasi(user);
      throw new BadRequestException({
        kod: 'MFA_KOD_HATALI',
        message: 'Kod hatalı. E-postanıza gelen son kodu girin.',
      });
    }

    /**
     * ⚠ TEK KULLANIMLIK — YARISA DAYANIKLI. `updateMany` + ozetin HALA ayni
     * olmasi kosulu: duz `update` olsaydi, ayni kodla gelen iki es zamanli
     * istegin IKISI de kabul edilirdi. Kosul tutmazsa kod baska bir istek
     * tarafindan ZATEN harcanmistir.
     */
    const tuketim = await this.prisma.user.updateMany({
      where: { id: user.id, mfaEpostaKoduOzeti: user.mfaEpostaKoduOzeti },
      data: { mfaEpostaKoduOzeti: null, mfaEpostaKoduAt: null, mfaHataSayaci: 0 },
    });
    if (tuketim.count === 0) {
      await this.hataSonrasi(user);
      throw new BadRequestException({
        kod: 'MFA_KOD_HATALI',
        message: 'Kod hatalı ya da az önce kullanıldı. Yeni bir kod isteyin.',
      });
    }
  }

  /**
   * Bir denemeyi (kod ya da kurtarma kodu) REZERVE EDIP dogrular.
   * Basarisizlikta 400; kilitliyken `MFA_KILITLI`.
   */
  private async denemeyiDogrula(
    user: KullaniciSatiri,
    girdi: { kod?: string; kurtarmaKodu?: string },
  ): Promise<void> {
    const kod = typeof girdi.kod === 'string' ? girdi.kod.trim() : '';
    const kurtarma =
      typeof girdi.kurtarmaKodu === 'string' ? girdi.kurtarmaKodu.trim() : '';
    if (kod === '' && kurtarma === '') throw new BadRequestException(DOGRULAMA_YOK);
    // ⚠ REZERVASYON ONCE (R1-O2) — hem kod hem kurtarma kodu ayni kovadan
    // harcar; yoksa saldirgan sinirsiz kurtarma kodu deneyebilirdi.
    await this.rezerveEt(user);
    if (kurtarma !== '') {
      await this.kurtarmaKoduTuket(user, kurtarma);
      return;
    }
    // ⚠ ANAHTAR YOKSA 503 — ama YALNIZ kod yolunda. Kurtarma kodu yolu
    // sifrelemeye ihtiyac duymaz ve calismaya devam eder (kullanici
    // yapilandirma hatasi yuzunden hesabindan kilitlenmesin).
    this.anahtariDenetle();
    if (!user.mfaSirriSifreli) throw new BadRequestException(KOD_HATALI);
    const sirB32 = coz(user.mfaSirriSifreli, `mfa:${user.id}`);
    await this.kodAdiminiAl(user, kod, sirB32, true);
  }

  /**
   * Kodu dogrular ve (kurulum degilse) adimi KOSULLU tuketir.
   *
   * ⚠ `tuket` yalniz MFA'si ACIK hesapta anlamlidir; kurulum onayinda adim
   * ayni transaction'da yazildigi icin burada ikinci bir yazim YAPILMAZ.
   */
  private async kodAdiminiAl(
    user: KullaniciSatiri,
    kod: string,
    sirB32: string,
    tuket = false,
  ): Promise<number> {
    const sonuc = totpDogrula({
      // ⚠ `totpDogrula` COZULMUS (duz) sirri Buffer olarak ister; DB'de
      // duran deger base32 metindir. Cevrim BURADA yapilir ki sir tek
      // bicimde (base32) saklansin ve `otpauth://` URI'si ile ayni olsun.
      sir: base32Coz(sirB32),
      kod,
      simdiMs: Date.now(),
      sonAdim: tuket ? user.mfaSonAdim ?? null : null,
    });
    if (!sonuc.gecerli || sonuc.adim === null) {
      await this.hataSonrasi(user);
      throw new BadRequestException(KOD_HATALI);
    }
    if (!tuket) return sonuc.adim;
    // ⚠ YARISA DAYANIKLI TUKETIM: `updateMany` + `mfaSonAdim < adim`.
    // Duz `update` ayni kodla gelen iki es zamanli istegin IKISINI de kabul
    // ederdi (kod tek kullanimlik olmaktan cikardi).
    const tuketim = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ mfaSonAdim: null }, { mfaSonAdim: { lt: sonuc.adim } }],
      },
      data: { mfaSonAdim: sonuc.adim, mfaHataSayaci: 0 },
    });
    if (tuketim.count !== 1) {
      await this.hataSonrasi(user);
      throw new BadRequestException(KOD_HATALI);
    }
    return sonuc.adim;
  }

  /** Kurtarma kodunu bulur ve KOSULLU tuketir (ikinci kullanim gecersiz). */
  private async kurtarmaKoduTuket(user: KullaniciSatiri, girilen: string) {
    const normalize = kurtarmaKoduNormalize(girilen);
    const adaylar = await this.prisma.mfaKurtarmaKodu.findMany({
      where: { userId: user.id, kullanildiAt: null },
    });
    for (const aday of adaylar) {
      if (!(await bcrypt.compare(normalize, aday.kodOzeti))) continue;
      const tuketim = await this.prisma.mfaKurtarmaKodu.updateMany({
        where: { id: aday.id, kullanildiAt: null },
        data: { kullanildiAt: new Date() },
      });
      // Yaris: ayni kodla gelen ikinci istek `count: 0` gorur → gecersiz.
      if (tuketim.count !== 1) break;
      await this.prisma.user.updateMany({
        where: { id: user.id },
        data: { mfaHataSayaci: 0 },
      });
      const kalan = await this.prisma.mfaKurtarmaKodu.count({
        where: { userId: user.id, kullanildiAt: null },
      });
      void this.epostaYolla(mfaKurtarmaKoduKullanildiEpostasi(user.email, kalan));
      return;
    }
    await this.hataSonrasi(user);
    throw new BadRequestException(KOD_HATALI);
  }

  /**
   * REZERVASYON (R1-O2) — deneme YAPILMADAN once sayaci KOSULLU artirir.
   *
   * `count === 0` iki anlama gelir: hesap kilitli ya da tavana ulasilmis.
   * Ikisinde de cevap aynidir (`MFA_KILITLI`) ve TOTP hesabi HIC kosmaz.
   */
  private async rezerveEt(user: KullaniciSatiri): Promise<void> {
    const rezervasyon = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        mfaKilitliAt: null,
        mfaHataSayaci: { lt: HATA_TAVANI },
      },
      data: { mfaHataSayaci: { increment: 1 } },
    });
    if (rezervasyon.count !== 1) {
      // Tavana ILK ulasan istek kilidi yazar; kosullu yazim sayesinde
      // e-posta TAM BIR KEZ gider.
      await this.kilidiYaz(user);
      throw new BadRequestException(KILITLI);
    }
  }

  /** Hatali denemeden SONRA: tavan/uyari esikleri. */
  private async hataSonrasi(user: KullaniciSatiri): Promise<void> {
    const guncel = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { mfaHataSayaci: true },
    });
    const sayac = guncel?.mfaHataSayaci ?? 0;
    if (sayac >= HATA_TAVANI) {
      await this.kilidiYaz(user);
      return;
    }
    // ⚠ DURUST SINIR: bu uyari e-postasi TAM ESIKTE okunan degere bakar;
    // birebir ayni anda gelen iki istek esigi atlayabilir. Uyari BILGIDIR,
    // kapi degildir — kapi rezervasyonun `lt: 20` kosuludur (atomik).
    if (sayac === UYARI_ESIGI) {
      void this.epostaYolla(mfaBesHataliEpostasi(user.email));
    }
  }

  /** Kilidi KOSULLU yazar; yalniz yazan istek e-posta gonderir. */
  private async kilidiYaz(user: KullaniciSatiri): Promise<void> {
    const yazim = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        mfaKilitliAt: null,
        mfaHataSayaci: { gte: HATA_TAVANI },
      },
      data: { mfaKilitliAt: new Date() },
    });
    if (yazim.count === 1) void this.epostaYolla(mfaKilitlendiEpostasi(user.email));
  }

  private async kurtarmaKodlariHazirla(): Promise<{
    duzler: string[];
    ozetler: string[];
  }> {
    const duzler = kurtarmaKodlariUret(KURTARMA_KODU_ADEDI);
    const ozetler = await kurtarmaKodlariniOzetle(duzler);
    return { duzler, ozetler };
  }

  private async kullaniciAl(userId: string): Promise<KullaniciSatiri> {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
    })) as KullaniciSatiri | null;
    if (!user) throw new UnauthorizedException();
    hesapKapisi(user);
    return user;
  }

  private async firmaOku(firmaId: string | null) {
    if (!firmaId) return null;
    return this.prisma.firma.findUnique({
      where: { id: firmaId },
      select: { mfaZorunlu: true },
    });
  }

  /** Anahtar yoksa/bozuksa 503 (§2.7) — acilisi OLDURMEZ, ucu durdurur. */
  private anahtariDenetle(): void {
    if (anahtarDurumu() !== 'var') {
      // `sifrele`/`coz` zaten ayni istisnayi atar; burada ERKEN atmak
      // yarim yazim ve gereksiz bcrypt maliyetini onler.
      sifrele('', 'denetim');
    }
  }

  /** Bilgi e-postasi: BEST-EFFORT. Hatasi akisi BOZMAZ, loglanir. */
  private async epostaYolla(talep: Parameters<EpostaServisi['gonder']>[0]) {
    try {
      await this.eposta.gonder(talep);
    } catch (e) {
      this.logger.error(
        `MFA bilgi e-postasi gonderilemedi (konu=${talep.konu}): ` +
          `${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
