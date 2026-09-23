import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../db/prisma.service';
import { EpostaServisi } from '../../../ozellik/odeme/eposta/eposta.servisi';
import { OturumServisi, hesapKapisi, yakinZamandaGirisMi } from '../oturum.servisi';
import { epostaKucult, epostaIleKullaniciBul } from '../eposta';
import { uygulamaKokuCoz } from '../uygulama-url';
import { HUKUKI_METIN_SURUMU } from '../hukuki-surum';
import { coz as sirCoz } from '../kimlik-sifreleme';
import {
  bekleyenDavetKosulu,
  etkinHesapKosulu,
  firmaKilitliIslem,
  koltukKarari,
} from '../../../ozellik/firma/uyelik-kurallari';
import { izinleriSuz, TUM_IZINLER } from '../../../ozellik/firma/uye-izinleri';
import {
  alanAdiNormalize,
  beklenenIssuer,
  entraSinamaKaniti,
  epostaAlanAdi,
  epostaKanitli,
  googleSinamaKaniti,
  kimlikAnahtari,
  kiraciIdNormalize,
  kurumsalKimlikMi,
  misafirMi,
  GOOGLE_ISSUER,
  KurumsalKuralHatasi,
  type KurumsalTalepler,
  type SaglayiciTipi,
} from './saglayici-kurallari';
import {
  kesifAl,
  kodDegistir,
  idTokenDogrula,
  yetkilendirmeUrlKur,
  OidcHatasi,
  type FetchFn,
} from './oidc-istemci';
import { pkceUret, rastgeleDizge } from './pkce';
import {
  kurumsalBaglandiEpostasi,
  kurumsalBaglantiKaldirildiEpostasi,
  sirBitiyorEpostasi,
} from './kurumsal-epostalari';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — KURUMSAL GIRIS AKISI (§5.4-§5.8)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ── AKISIN IKIYE BOLUNMESI (en kritik tasarim karari) ──────────────────
 *  IdP donusu UST DUZEY BIR GET'tir: tarayici adres cubugundan gelir ve
 *  hicbir sir tasiyamaz (CEREZ YASAK — hukuki metinler "platform hicbir
 *  yerde cerez yazmiyor" diyor ve `faz5-kvkk-hukuki-test.ts` E3 bunu kapi
 *  olarak tutuyor). Bu yuzden:
 *
 *    `donus`  → YAN ETKISIZDIR. state'i tuketir, kodu degisir, id_token'i
 *               DOGRULAR, ozeti satira yazar, 60 sn'lik `kod` uretir, 302.
 *               HICBIR kullanici/kimlik/alan adi satiri YAZILMAZ.
 *    `degis`  → BUTUN kararlar ve yan etkiler burada. Sekme sirri
 *               (`sessionStorage`) gorulmeden hicbir sey olmaz.
 *
 *  Saldiri → neden basarisiz:
 *   (a) Giris CSRF'i: saldirgan kendi akisinin donus URL'ini kurbana
 *       tiklatir → kurbanin sekmesinde sir YOK → `degis` REDDEDER; kod
 *       saldirganin elinde degil.
 *   (b) Oltalamayla alan adi sahiplenme: "sina" akisinin adresi baska
 *       sirketin calisanina tiklatilirsa donus onun sekmesinde olur, sir
 *       yoktur, `DogrulanmisAlanAdi` YAZILMAZ.
 *   (c) `kod` sizarsa (gecmis, ekran paylasimi) tek basina ise yaramaz:
 *       sir + 60 sn + tek kullanim.
 *
 *  ⚠ SIRA (K5, mutant #4): kodun tuketimi SIR KONTROLUNDEN ONCEDIR. Yanlis
 *  sirla gelen istek de kodu YAKAR — kodu ele geciren ikinci deneme yapamaz.
 *
 *  ⚠ YENIDEN OKUMA (K6b, K11b, mutant #29): `degis` ve `katil` sirasinda
 *  saglayici, DOGRULANMIS ALAN ADLARI ve kullanici YENIDEN okunur. Donuste
 *  hesaplanan `kurumsalKimlikMi`/`epostaKanitli` yalniz BILGIDIR: arada
 *  sahip alan adini kaldirmis, hesap banlanmis ya da katilim kapatilmis
 *  olabilir.
 */

/** Akis satirinin omru: kullanici IdP ekraninda 10 dk gecirebilir. */
export const AKIS_OMRU_MS = 10 * 60 * 1000;
/** Donus sonucu kodu — cok kisa: aynı sekme zaten hemen degisir. */
export const SONUC_OMRU_MS = 60 * 1000;
/** Katilim onayi bileti: kullanici sozlesme kutularini okuyacak. */
export const BILET_OMRU_MS = 10 * 60 * 1000;
/** `SsoAkisi` satirlari 24 saat sonra silinir (kisisel veri saklama sozu). */
export const AKIS_SAKLAMA_MS = 24 * 60 * 60 * 1000;
/** Istemci sirrinin bitisine bu kadar kala sahibe uyari gider. */
export const SIR_UYARI_GUN = 14;

const SSO_KOD_GECERSIZ = {
  kod: 'SSO_KOD_GECERSIZ',
  mesaj:
    'Giriş bağlantısının süresi doldu ya da başka bir tarayıcıda açıldı. ' +
    'Lütfen yeniden deneyin.',
} as const;
const SSO_BILET_GECERSIZ = {
  kod: 'SSO_BILET_GECERSIZ',
  mesaj: 'Katılım onayının süresi doldu. Lütfen şirket hesabınızla yeniden giriş yapın.',
} as const;

/** sha256 → hex. state, sonuc kodu, bilet ve sekme sirri hep boyle saklanir. */
export function ozetle(deger: string): string {
  return createHash('sha256').update(deger, 'utf8').digest('hex');
}

/** Sabit sureli karsilastirma (uzunluk farkinda da patlamaz). */
function sabitEsit(a: string, b: string): boolean {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * Donuste id_token'dan cikarilan OZET (§2.5 `dogrulanmisKimlik`).
 *
 * ⚠ `talepler` NEDEN SAKLANIR: `degis` anında `kurumsalKimlikMi` ve
 * `epostaKanitli` YENIDEN hesaplanir (alan adlari degismis olabilir); bunun
 * icin ham talep alanlari gerekir. Yalniz kararlari saklasaydik, mutant #29
 * ("donuste hesaplanani kullan") hicbir testi kirmazdi cunku baska secenek
 * kalmazdi.
 */
export type DogrulanmisKimlik = {
  issuer: string;
  subject: string;
  entraKiraciId?: string | null;
  misafir: boolean;
  eposta?: string | null;
  /** YALNIZ BILGI — `degis` yeniden hesaplar. */
  epostaKanitliBilgi: boolean;
  /** YALNIZ BILGI — `degis` yeniden hesaplar (mutant #29 burada yasar). */
  kurumsalKimlikMiBilgi: boolean;
  hd?: string | null;
  sinamaKaniti: string[];
  ad?: string | null;
  soyad?: string | null;
  /** `kurumsalKimlikMi`/`epostaKanitli`nin okudugu talepler (sir YOK). */
  talepler: KurumsalTalepler;
};

/** `donus` kimlik kapilarinin (misafir / kiraci) tasidigi kod. */
class KimlikKapisiHatasi extends Error {
  constructor(readonly kod: string) {
    super(kod);
    this.name = 'KimlikKapisiHatasi';
  }
}

type SaglayiciSatiri = {
  id: string;
  firmaId: string;
  tip: SaglayiciTipi;
  entraKiraciId: string | null;
  /** ⚠ YALNIZ gosterim/denetim — `idTokenDogrula`ya ASLA verilmez (R1-D5). */
  issuer: string;
  clientId: string;
  istemciSirriSifreli: string;
  durum: string;
  jitKatilim: boolean;
  zorunlu: boolean;
};

@Injectable()
export class KurumsalGirisServisi {
  private readonly logger = new Logger(KurumsalGirisServisi.name);

  /**
   * ⚠ DISARI ACIK: test sahte saglayiciyi buraya takar (`sahteOidcSaglayici`).
   * Uretimde global `fetch`in ince sarmalayicisi — `oidc-istemci.ts` yalniz
   * `IZINLI_HOSTLAR`daki `https:` adreslere istek atar.
   */
  fetchFn: FetchFn = async (url, secenekler) => {
    const yanit = await fetch(url, secenekler as any);
    return { ok: yanit.ok, status: yanit.status, text: () => yanit.text() };
  };

  /** ⚠ DISARI ACIK: test 61 saniye ilerletir (K5). */
  simdiMs: () => number = () => Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly oturum: OturumServisi,
    private readonly eposta: EpostaServisi,
    private readonly config: ConfigService,
  ) {}

  private simdi(): Date {
    return new Date(this.simdiMs());
  }

  /** Donus adresi SABIT — istekten ASLA alinmaz (acik yonlendirme yuzeyi). */
  donusAdresi(): string {
    return `${uygulamaKokuCoz(this.config)}/api/auth/sso/donus`;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  KESIF (§5.12) — giris ekrani "sirket hesabiyla gir" dugmesini buradan alir
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * ⚠ KULLANICI TABLOSUNA BAKMAZ. Yalniz alan adina bakar; bilinmeyen alan
   * adi ile ETKIN olmayan saglayici BIREBIR AYNI yaniti verir (K20). Aksi
   * hâlde bu uc bir "bu adres kayitli mi" oracle'i olurdu.
   */
  async kesfet(email: string): Promise<{ kurumsal: null | { saglayiciId: string; tip: string; zorunlu: boolean } }> {
    const alan = alanAdiNormalize(epostaAlanAdi(epostaKucult(email)));
    if (!alan) return { kurumsal: null };
    const satir = await this.prisma.dogrulanmisAlanAdi.findUnique({
      where: { alanAdi: alan },
      select: { saglayici: { select: { id: true, tip: true, durum: true, zorunlu: true } } },
    });
    const s = satir?.saglayici;
    if (!s || s.durum !== 'ETKIN') return { kurumsal: null };
    return { kurumsal: { saglayiciId: s.id, tip: s.tip, zorunlu: s.zorunlu === true } };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  BASLATMA (§5.4)
  // ═════════════════════════════════════════════════════════════════════════

  /** `POST /auth/sso/baslat` — giris amacli akis (guardsiz). */
  async baslat(saglayiciId: string, tarayiciBagi: string): Promise<{ yonlendirmeUrl: string }> {
    const saglayici = await this.saglayiciAl(saglayiciId);
    if (!saglayici || saglayici.durum !== 'ETKIN') {
      throw new BadRequestException({
        kod: 'SAGLAYICI_KULLANILAMAZ',
        mesaj: 'Bu şirket girişi şu an kullanılamıyor.',
      });
    }
    return this.akisAc(saglayici, 'giris', tarayiciBagi, null);
  }

  /**
   * `POST /auth/sso/niyet` — oturumdaki kisinin "sina" / "bagla" akisi.
   *
   * ⚠ R1-O3 · YENIDEN KIMLIK DOGRULAMA: calinmis bir bearer token TEK
   * BASINA sahip hesabina kalici bir arka kapi acabiliyordu. Parolali
   * hesapta parola, parolasiz hesapta "son 10 dakikada sirket hesabiyla
   * girildi" (`authAt`) kaniti ZORUNLU — ve akis satiri YAZILMADAN ONCE
   * (K14d: `ssoAkisi.create` cagrilmaz).
   */
  async niyet(
    k: { id: string },
    amac: 'sinama' | 'bagla',
    tarayiciBagi: string,
    parola: string | undefined,
    authAt: number | null,
  ): Promise<{ yonlendirmeUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: k.id } });
    if (!user) throw new UnauthorizedException();
    hesapKapisi(user as any);
    if (!user.firmaId) throw new NotFoundException({ kod: 'SAGLAYICI_YOK', mesaj: 'Firmanızda şirket girişi tanımlı değil.' });

    const saglayici = await this.saglayiciAlFirma(user.firmaId);
    if (!saglayici) {
      throw new NotFoundException({ kod: 'SAGLAYICI_YOK', mesaj: 'Firmanızda şirket girişi tanımlı değil.' });
    }
    if (amac === 'bagla' && saglayici.durum !== 'DOGRULANDI' && saglayici.durum !== 'ETKIN') {
      throw new BadRequestException({
        kod: 'SAGLAYICI_KULLANILAMAZ',
        mesaj: 'Şirket girişi henüz doğrulanmadı; önce firma sahibi bağlantıyı sınamalı.',
      });
    }
    if (amac === 'sinama' && (user as any).firmaRol !== 'sahip') {
      throw new ForbiddenException({
        kod: 'FIRMA_SAHIBI_GEREKLI',
        mesaj: 'Bu işlemi yalnız firma sahibi yapabilir.',
      });
    }
    await this.yenidenKimlikDogrula(user as any, parola, authAt);
    return this.akisAc(saglayici, amac, tarayiciBagi, user.id);
  }

  /**
   * ORTAK BASLATMA — `SsoAkisi` satiri + IdP adresi.
   *
   * ⚠ IdP adresine E-POSTA YAZILMAZ (`login_hint` yok, `oidc-istemci.ts`
   * onu adresten siler): yalniz alan adi ipucu (`domain_hint`/`hd`) gider,
   * o da kisisel veri degildir.
   */
  private async akisAc(
    saglayici: SaglayiciSatiri,
    amac: 'giris' | 'sinama' | 'bagla',
    tarayiciBagi: string,
    baslatanUserId: string | null,
  ): Promise<{ yonlendirmeUrl: string }> {
    // Sir COZULEMEYECEKSE kullaniciyi IdP'ye hic gondermeyelim: donuste
    // 503 almak, sekme sirrini ve 10 dakikayi bosa harcamak demektir.
    this.sirriCoz(saglayici);

    const state = rastgeleDizge(32);
    const nonce = rastgeleDizge(32);
    const pkce = pkceUret();
    const simdi = this.simdi();

    const kesif = await kesifAl(this.kesifIssuer(saglayici), this.fetchFn, { simdiMs: simdi.getTime() });
    const alanIpucu = await this.alanIpucu(saglayici);
    const yonlendirmeUrl = yetkilendirmeUrlKur({
      authorizationEndpoint: kesif.authorizationEndpoint,
      tip: saglayici.tip,
      clientId: saglayici.clientId,
      redirectUri: this.donusAdresi(),
      state,
      nonce,
      codeChallenge: pkce.meydan,
      alanIpucu,
    });

    await this.prisma.ssoAkisi.create({
      data: {
        durumOzeti: ozetle(state),
        tarayiciBagiOzeti: tarayiciBagi,
        saglayiciId: saglayici.id,
        amac,
        baslatanUserId,
        nonce,
        pkceDogrulayici: pkce.dogrulayici,
        sonGecerlilik: new Date(simdi.getTime() + AKIS_OMRU_MS),
      },
    });
    return { yonlendirmeUrl };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  DONUS (§5.6) — YAN ETKISIZ
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * `GET /auth/sso/donus` — IdP'den gelen ust duzey GET. Donen deger
   * 302 hedefidir; controller `res.redirect` eder (CEREZ YAZILMAZ).
   */
  async donus(sorgu: { code?: string; state?: string; error?: string }): Promise<{ yonlendirme: string }> {
    const kok = uygulamaKokuCoz(this.config);
    const durumOzeti = ozetle(String(sorgu.state ?? ''));
    const simdi = this.simdi();

    const akis = await this.prisma.ssoAkisi.findUnique({ where: { durumOzeti } });
    if (!akis || akis.donusAt || akis.sonGecerlilik.getTime() <= simdi.getTime()) {
      return { yonlendirme: `${kok}/login?kurumsal_hata=AKIS_GECERSIZ` };
    }

    // ⚠ STATE TUKETIMI KOD DEGISIMINDEN ONCE (mutant #1): ayni donus URL'i
    // iki kez acilirsa (tarayici geri tusu, onizleme yapan e-posta istemcisi)
    // IKINCISI reddedilir ve IdP'ye ikinci token istegi HIC gitmez.
    const tuketim = await this.prisma.ssoAkisi.updateMany({
      where: { id: akis.id, donusAt: null },
      data: { donusAt: simdi },
    });
    if (tuketim.count !== 1) {
      return { yonlendirme: `${kok}/login?kurumsal_hata=AKIS_GECERSIZ` };
    }

    const hataAdresi = (kodu: string) => ({ yonlendirme: this.hataYolu(kok, akis.amac, kodu) });

    if (sorgu.error) {
      this.logger.warn(`IdP reddetti (akis ${akis.id}): ${String(sorgu.error).slice(0, 120)}`);
      await this.akisHatasi(akis.id, 'IDP_REDDETTI');
      return hataAdresi('IDP_REDDETTI');
    }

    const saglayici = await this.saglayiciAl(akis.saglayiciId);
    if (!saglayici || !this.durumAmacaUygun(saglayici.durum, akis.amac)) {
      await this.akisHatasi(akis.id, 'SAGLAYICI_YOK');
      return hataAdresi('SAGLAYICI_YOK');
    }

    let kimlik: DogrulanmisKimlik;
    try {
      kimlik = await this.idTokenAl(saglayici, akis, String(sorgu.code ?? ''), simdi);
    } catch (e) {
      const kodu = this.hataKodunaCevir(e);
      await this.akisHatasi(akis.id, kodu);
      // ⚠ Sahibin ayar kartinda gorunen tani: "istemci sirri gecersiz" gibi
      // bir hatayi yalniz gunluge yazsaydik sahip nicin calismadigini
      // ogrenemezdi.
      await this.prisma.firmaKimlikSaglayici.update({
        where: { id: saglayici.id },
        data: { sonHataKodu: kodu },
      });
      return hataAdresi(kodu);
    }

    const sonucKodu = rastgeleDizge(32);
    await this.prisma.ssoAkisi.update({
      where: { id: akis.id },
      data: {
        dogrulanmisKimlik: kimlik as never,
        sonucKoduOzeti: ozetle(sonucKodu),
        sonucSonGecerlilik: new Date(simdi.getTime() + SONUC_OMRU_MS),
      },
    });
    return { yonlendirme: `${kok}/sso/tamam?kod=${encodeURIComponent(sonucKodu)}` };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  DEGIS (§5.6-§5.8) — KARARLAR ve YAN ETKILER
  // ═════════════════════════════════════════════════════════════════════════

  async degis(kod: string, tarayiciSirri: string): Promise<any> {
    const simdi = this.simdi();
    const akis = await this.prisma.ssoAkisi.findFirst({
      where: { sonucKoduOzeti: ozetle(String(kod ?? '')) },
    });
    if (!akis) throw new UnauthorizedException(SSO_KOD_GECERSIZ);

    // ⚠ TUKETIM SIRDAN ONCE (mutant #4): yanlis sirla gelen istek de kodu
    // YAKAR. Aksi hâlde kodu ele geciren saldirgan sonsuz deneme yapabilir
    // ve dogru sekmeye ulasana kadar zaman kazanirdi.
    const tuketim = await this.prisma.ssoAkisi.updateMany({
      where: {
        id: akis.id,
        sonucKullanildiAt: null,
        sonucSonGecerlilik: { gt: simdi },
      },
      data: { sonucKullanildiAt: simdi },
    });
    if (tuketim.count !== 1) throw new UnauthorizedException(SSO_KOD_GECERSIZ);

    if (!sabitEsit(ozetle(String(tarayiciSirri ?? '')), akis.tarayiciBagiOzeti)) {
      throw new UnauthorizedException(SSO_KOD_GECERSIZ);
    }
    const kimlik = akis.dogrulanmisKimlik as unknown as DogrulanmisKimlik | null;
    if (!kimlik || !kimlik.issuer || !kimlik.subject) {
      throw new UnauthorizedException(SSO_KOD_GECERSIZ);
    }

    // ⚠ YENIDEN OKUMA (§5.6 madde 3): donusten beri saglayici kapatilmis,
    // alan adi kaldirilmis ya da hesap banlanmis olabilir.
    const saglayici = await this.saglayiciAl(akis.saglayiciId);
    if (!saglayici || !this.durumAmacaUygun(saglayici.durum, akis.amac)) {
      throw this.karar(akis.amac, 'SAGLAYICI_YOK', 'Şirket girişi artık kullanılamıyor.');
    }
    const dogrulanmis = await this.dogrulanmisAlanlar(this.prisma, saglayici.id);

    if (akis.amac === 'sinama') return this.sinamaDali(akis, saglayici, kimlik, simdi);
    if (akis.amac === 'bagla') return this.baglaDali(akis, saglayici, kimlik, dogrulanmis, simdi);
    return this.girisDali(akis, saglayici, kimlik, dogrulanmis, simdi);
  }

  /** §5.7 — bagli kimlik · e-postayla baglama · katilim bileti. */
  private async girisDali(
    akis: any,
    saglayici: SaglayiciSatiri,
    kimlik: DogrulanmisKimlik,
    dogrulanmis: string[],
    simdi: Date,
  ): Promise<any> {
    const amac = 'giris';
    // ⚠ `findFirst` (bilesik `@@unique` sozdizimi yerine): sahte Prisma ve
    // gercek Prisma AYNI kosulu gorur; indeks yine kullanilir.
    const bagli = await this.prisma.kullaniciDisKimlik.findFirst({
      where: { issuer: kimlik.issuer, subject: kimlik.subject },
    });

    if (bagli) {
      const user = await this.prisma.user.findUnique({ where: { id: bagli.userId } });
      if (!user) throw this.karar(amac, 'HESAP_KAPALI', 'Hesabınız kapatılmış.');
      if (user.firmaId !== saglayici.firmaId) {
        throw this.karar(amac, 'KIMLIK_BASKA_FIRMADA', 'Bu şirket hesabı başka bir firmanın kullanıcısına bağlı.');
      }
      if (user.role === 'admin') throw this.yoneticiReddi(amac);
      this.hesapKapisiKodlu(amac, user);
      // ⚠ mutant #29: burada donuste hesaplanan `kurumsalKimlikMiBilgi`
      // kullanilsaydi, sahip alan adini kaldirdiktan SONRA bile giris olurdu.
      if (!kurumsalKimlikMi(kimlik.talepler, saglayici, dogrulanmis)) {
        throw this.karar(amac, 'ALAN_ADI_TANIMSIZ', 'Şirket hesabınızın alan adı bu firmada tanımlı değil.');
      }
      await this.prisma.kullaniciDisKimlik.update({
        where: { id: bagli.id },
        data: { sonGirisAt: simdi, epostaAnlik: kimlik.eposta ?? null },
      });
      await this.kimligiTemizle(akis.id);
      return this.sekleCevir(await this.oturum.girisKarari(user as any, 'kurumsal'));
    }

    if (!kurumsalKimlikMi(kimlik.talepler, saglayici, dogrulanmis)) {
      throw this.karar(amac, 'ALAN_ADI_TANIMSIZ', 'Şirket hesabınızın alan adı bu firmada tanımlı değil.');
    }
    const kanit = epostaKanitli(kimlik.talepler, saglayici, dogrulanmis);
    if (!kanit) throw this.epostaKanitsiz(amac, saglayici.tip);

    // ⚠ `kapatilanEposta` uzerinden ASLA esleme yapilmaz: kapatilmis hesabin
    // adresi SERBESTTIR ve kisi yeni bir hesapla katilabilir.
    const mevcut = await epostaIleKullaniciBul(this.prisma, kanit.eposta);
    if (mevcut && !mevcut.deletedAt) {
      // ── E-POSTAYLA BAGLAMA: BES KOSULUN HEPSI (K9) ───────────────────
      if (mevcut.firmaId !== saglayici.firmaId) {
        throw this.karar(amac, 'KIMLIK_BASKA_FIRMADA', 'Bu adres başka bir firmada kayıtlı.');
      }
      if (mevcut.emailVerified !== true) {
        throw this.karar(
          amac,
          'EPOSTA_DOGRULANMAMIS',
          'Hesabınızın e-posta adresi doğrulanmamış. Önce parolanızla girip doğrulama bağlantısını kullanın.',
        );
      }
      if (mevcut.role === 'admin') throw this.yoneticiReddi(amac);
      this.hesapKapisiKodlu(amac, mevcut);
      const baskaKimlik = await this.prisma.kullaniciDisKimlik.findFirst({
        where: { userId: mevcut.id, issuer: kimlik.issuer },
      });
      if (baskaKimlik) {
        throw this.karar(
          amac,
          'BASKA_KIMLIK_BAGLI',
          'Bu hesaba aynı şirket girişinden başka bir kimlik bağlı. Profil sayfasından bağlantıyı kaldırın.',
        );
      }
      await this.prisma.kullaniciDisKimlik.create({
        data: {
          userId: mevcut.id,
          saglayiciId: saglayici.id,
          issuer: kimlik.issuer,
          subject: kimlik.subject,
          entraKiraciId: kimlik.entraKiraciId ?? null,
          epostaAnlik: kanit.eposta,
          baglamaYolu: 'eposta-eslesme',
          sonGirisAt: simdi,
        },
      });
      await this.kimligiTemizle(akis.id);
      return this.sekleCevir(await this.oturum.girisKarari(mevcut as any, 'kurumsal'));
    }

    // ── OTOMATIK KATILIM (V8) — yalniz BILET verilir, hesap ACILMAZ ─────
    const davet = await this.prisma.firmaDavet.findFirst({
      where: {
        firmaId: saglayici.firmaId,
        eposta: kanit.eposta,
        ...bekleyenDavetKosulu(simdi),
      },
    });
    if (!saglayici.jitKatilim && !davet) {
      throw this.karar(
        amac,
        'KATILIM_KAPALI',
        'Firmanız yeni kişilerin şirket hesabıyla katılmasına izin vermiyor. Yöneticinizden davet isteyin.',
      );
    }
    const bilet = rastgeleDizge(32);
    await this.prisma.ssoAkisi.update({
      where: { id: akis.id },
      data: {
        biletOzeti: ozetle(bilet),
        biletSonGecerlilik: new Date(simdi.getTime() + BILET_OMRU_MS),
      },
    });
    const firma = await this.prisma.firma.findUnique({
      where: { id: saglayici.firmaId },
      select: { ad: true },
    });
    return { tip: 'katilim-onayi', bilet, firmaAd: firma?.ad ?? '', eposta: kanit.eposta };
  }

  /** §5.8 — "Baglantiyi sina": alan adi KANITI + (kosullu) sahip baglamasi. */
  private async sinamaDali(
    akis: any,
    saglayici: SaglayiciSatiri,
    kimlik: DogrulanmisKimlik,
    simdi: Date,
  ): Promise<any> {
    const amac = 'sinama';
    const baslatan = akis.baslatanUserId
      ? await this.prisma.user.findUnique({ where: { id: akis.baslatanUserId } })
      : null;
    // ⚠ YENIDEN OKUNUR (mutant #26): sahip, akisi baslattiktan sonra
    // rolunu kaybetmis ya da cikarilmis olabilir. Alan adi dogrulamasi
    // FIRMANIN KIMLIGINI belirler — eski bir sahip token'iyla yapilamaz.
    if (
      !baslatan ||
      baslatan.deletedAt ||
      baslatan.status !== 'active' ||
      baslatan.firmaId !== saglayici.firmaId ||
      (baslatan as any).firmaRol !== 'sahip'
    ) {
      throw this.karar(amac, 'FIRMA_SAHIBI_GEREKLI', 'Bu işlemi yalnız firma sahibi yapabilir.');
    }

    const kanitlar =
      saglayici.tip === 'entra' ? entraSinamaKaniti(kimlik.talepler) : googleSinamaKaniti(kimlik.talepler);
    if (kanitlar.length === 0) {
      throw this.karar(
        amac,
        'SINAMA_KANITSIZ',
        saglayici.tip === 'entra'
          ? 'Uygulama kaydında "xms_edov" ve "email" isteğe bağlı taleplerini ID token için ekleyin, sonra yeniden sınayın.'
          : 'Google hesabınız bir Workspace alan adına ait olmalı ve e-postası doğrulanmış olmalı.',
      );
    }
    const beyan = (await this.beyanAlanlari(saglayici.id)).filter((a): a is string => a !== null);
    const kesisim = kanitlar.filter((a) => beyan.includes(a));
    if (kesisim.length === 0) {
      throw this.karar(
        amac,
        'SINAMA_ALAN_ADI_UYUSMADI',
        'Giriş yaptığınız şirket hesabının alan adı, ayarda yazdığınız alan adlarından biri değil.',
      );
    }

    for (const alanAdi of kesisim) {
      const mevcut = await this.prisma.dogrulanmisAlanAdi.findUnique({ where: { alanAdi } });
      if (mevcut && mevcut.saglayiciId !== saglayici.id) {
        throw this.karar(
          amac,
          'SINAMA_ALAN_ADI_BASKA_FIRMADA',
          `"${alanAdi}" alan adı başka bir firmada doğrulanmış. Lütfen destek ekibiyle iletişime geçin.`,
        );
      }
      if (!mevcut) {
        await this.prisma.dogrulanmisAlanAdi.create({
          data: {
            alanAdi,
            saglayiciId: saglayici.id,
            firmaId: saglayici.firmaId,
            dogrulayanId: baslatan.id,
          },
        });
      }
    }
    await this.prisma.firmaKimlikSaglayici.update({
      where: { id: saglayici.id },
      data: {
        durum: saglayici.durum === 'TASLAK' ? 'DOGRULANDI' : (saglayici.durum as any),
        sonSinamaAt: simdi,
        sonHataKodu: null,
      },
    });
    await this.olayYaz(this.prisma, saglayici.firmaId, baslatan, 'kurumsal-giris.dogrulandi', {
      veri: { alanAdlari: kesisim },
    });

    // ── SAHIP HESABI: YALNIZ E-POSTALAR ESITSE BAGLANIR (R1-O3, mutant #35)
    // Gerekce: e-posta sarti olmadan, calinmis bir sahip token'i + firmanin
    // kiracisindaki HERHANGI ikinci bir kimlik = sahip hesabina kalici,
    // MFA'siz arka kapi.
    const taze = await this.dogrulanmisAlanlar(this.prisma, saglayici.id);
    const kanit = epostaKanitli(kimlik.talepler, saglayici, taze);
    let hesapBaglandi = false;
    if (kanit && epostaKucult(kanit.eposta) === epostaKucult(baslatan.email)) {
      const baska = await this.prisma.kullaniciDisKimlik.findFirst({
        where: { issuer: kimlik.issuer, subject: kimlik.subject },
      });
      if (baska && baska.userId !== baslatan.id) {
        throw this.karar(amac, 'KIMLIK_BASKA_HESAPTA', 'Bu şirket hesabı başka bir kullanıcıya bağlı.');
      }
      if (!baska) {
        await this.prisma.kullaniciDisKimlik.create({
          data: {
            userId: baslatan.id,
            saglayiciId: saglayici.id,
            issuer: kimlik.issuer,
            subject: kimlik.subject,
            entraKiraciId: kimlik.entraKiraciId ?? null,
            epostaAnlik: kanit.eposta,
            baglamaYolu: 'sinama',
            sonGirisAt: simdi,
          },
        });
      }
      hesapBaglandi = true;
    }
    await this.kimligiTemizle(akis.id);
    return { tip: 'sinandi', alanAdlari: kesisim, hesapBaglandi };
  }

  /** §5.8 — Profil → "Sirket hesabimi bagla". */
  private async baglaDali(
    akis: any,
    saglayici: SaglayiciSatiri,
    kimlik: DogrulanmisKimlik,
    dogrulanmis: string[],
    simdi: Date,
  ): Promise<any> {
    const amac = 'bagla';
    const user = akis.baslatanUserId
      ? await this.prisma.user.findUnique({ where: { id: akis.baslatanUserId } })
      : null;
    if (!user) throw this.karar(amac, 'HESAP_KAPALI', 'Hesabınız kapatılmış.');
    this.hesapKapisiKodlu(amac, user);
    if (user.firmaId !== saglayici.firmaId) {
      throw this.karar(amac, 'KIMLIK_BASKA_FIRMADA', 'Hesabınız bu firmanın üyesi değil.');
    }
    if (user.role === 'admin') throw this.yoneticiReddi(amac);
    if (!kurumsalKimlikMi(kimlik.talepler, saglayici, dogrulanmis)) {
      throw this.karar(amac, 'ALAN_ADI_TANIMSIZ', 'Şirket hesabınızın alan adı bu firmada tanımlı değil.');
    }
    // ⚠ R1-O3 (mutant #25): e-posta ESITLIGI ZORUNLU. Olmasaydi, oturumu
    // ele gecirilmis bir kullanici hesabina SALDIRGANIN sirket kimligi
    // baglanir ve o kimlik kalici, parolasiz bir giris yolu olurdu.
    const kanit = epostaKanitli(kimlik.talepler, saglayici, dogrulanmis);
    if (!kanit || epostaKucult(kanit.eposta) !== epostaKucult(user.email)) {
      throw this.karar(
        amac,
        'EPOSTA_UYUSMADI',
        'Şirket hesabınızın e-posta adresi bu hesabın e-posta adresiyle aynı olmalı.',
      );
    }
    const baska = await this.prisma.kullaniciDisKimlik.findFirst({
      where: { issuer: kimlik.issuer, subject: kimlik.subject },
    });
    if (baska && baska.userId !== user.id) {
      throw this.karar(amac, 'KIMLIK_BASKA_HESAPTA', 'Bu şirket hesabı başka bir kullanıcıya bağlı.');
    }
    if (!baska) {
      await this.prisma.kullaniciDisKimlik.create({
        data: {
          userId: user.id,
          saglayiciId: saglayici.id,
          issuer: kimlik.issuer,
          subject: kimlik.subject,
          entraKiraciId: kimlik.entraKiraciId ?? null,
          epostaAnlik: kanit.eposta,
          baglamaYolu: 'acik-baglama',
          sonGirisAt: simdi,
        },
      });
      await this.olayYaz(this.prisma, saglayici.firmaId, user, 'kurumsal-baglanti.eklendi', {
        hedefId: user.id,
        hedefEposta: user.email,
      });
      void this.epostaYolla(kurumsalBaglandiEpostasi(user.email));
    }
    await this.kimligiTemizle(akis.id);
    return { tip: 'baglandi' };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  KATILIM (§5.7 `katil`)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * `POST /auth/sso/katil` — sozlesme onayi alindiktan SONRA hesap acilir.
   *
   * ⚠ ASLA `firma.create` YOK ve ASLA `sahip` DEGIL: kisi, sağlayicinin
   * SATIRINDAKI firmaya `uye` olarak katilir. Gövdeden `firmaId` okunsaydi
   * (mutant #8) saldirgan istedigi firmaya kendini yazardi.
   */
  async katil(dto: {
    bilet: string;
    tarayiciSirri: string;
    ticariIletiOnayi?: boolean;
  }): Promise<any> {
    const simdi = this.simdi();
    const akis = await this.prisma.ssoAkisi.findFirst({
      where: { biletOzeti: ozetle(String(dto.bilet ?? '')) },
    });
    if (!akis) throw new UnauthorizedException(SSO_BILET_GECERSIZ);
    const saglayici = await this.saglayiciAl(akis.saglayiciId);
    if (!saglayici || saglayici.durum !== 'ETKIN') {
      throw new BadRequestException({ kod: 'SAGLAYICI_YOK', mesaj: 'Şirket girişi artık kullanılamıyor.' });
    }
    const kimlik = akis.dogrulanmisKimlik as unknown as DogrulanmisKimlik | null;
    if (!kimlik) throw new UnauthorizedException(SSO_BILET_GECERSIZ);

    const yeni = await firmaKilitliIslem(this.prisma, saglayici.firmaId, async (tx: any) => {
      const tuketim = await tx.ssoAkisi.updateMany({
        where: { id: akis.id, biletKullanildiAt: null, biletSonGecerlilik: { gt: simdi } },
        data: { biletKullanildiAt: simdi },
      });
      if (tuketim.count !== 1) throw new UnauthorizedException(SSO_BILET_GECERSIZ);
      if (!sabitEsit(ozetle(String(dto.tarayiciSirri ?? '')), akis.tarayiciBagiOzeti)) {
        throw new UnauthorizedException(SSO_BILET_GECERSIZ);
      }

      // ⚠ HEPSI YENIDEN SINANIR (yaris + mutant #28): bilet alindiktan sonra
      // sahip katilimi kapatmis, alan adini kaldirmis ya da koltuk dolmus
      // olabilir.
      const dogrulanmis = await this.dogrulanmisAlanlar(tx, saglayici.id);
      if (!kurumsalKimlikMi(kimlik.talepler, saglayici, dogrulanmis)) {
        throw new BadRequestException({
          kod: 'ALAN_ADI_TANIMSIZ',
          mesaj: 'Şirket hesabınızın alan adı bu firmada tanımlı değil.',
        });
      }
      const kanit = epostaKanitli(kimlik.talepler, saglayici, dogrulanmis);
      if (!kanit) throw this.epostaKanitsiz('giris', saglayici.tip);

      const mevcut = await epostaIleKullaniciBul(tx, kanit.eposta);
      if (mevcut && !mevcut.deletedAt) {
        throw new BadRequestException({
          kod: 'ZATEN_KAYITLI',
          mesaj: 'Bu adres zaten kayıtlı. Giriş ekranından şirket hesabınızla girin.',
        });
      }
      const bagliKimlik = await tx.kullaniciDisKimlik.findFirst({
        where: { issuer: kimlik.issuer, subject: kimlik.subject },
      });
      if (bagliKimlik) {
        throw new BadRequestException({
          kod: 'KIMLIK_BASKA_HESAPTA',
          mesaj: 'Bu şirket hesabı başka bir kullanıcıya bağlı.',
        });
      }

      const davet = await tx.firmaDavet.findFirst({
        where: { firmaId: saglayici.firmaId, eposta: kanit.eposta, ...bekleyenDavetKosulu(simdi) },
      });
      if (!saglayici.jitKatilim && !davet) {
        throw new BadRequestException({
          kod: 'KATILIM_KAPALI',
          mesaj: 'Firmanız yeni kişilerin şirket hesabıyla katılmasına izin vermiyor.',
        });
      }
      await this.koltukKapisi(tx, saglayici.firmaId, simdi, davet?.id ?? null);

      const kullanici = await tx.user.create({
        data: {
          email: kanit.eposta,
          // §2.6: parola NULLABLE DEGIL. Kimsenin bilmedigi rastgele ozet
          // `bcrypt.compare` cagrilarini 500 yerine `false` yapar.
          password: await bcrypt.hash(rastgeleDizge(32), 10),
          parolaTanimli: false,
          firmaId: saglayici.firmaId,
          firmaRol: 'uye',
          // ⚠ 23.09.2026 — IZINLER (Ekip & Izinler), `davetKabul` IKIZI.
          //   Bekleyen davet varsa sahibin davette sectigi izinler TASINIR.
          //   Bu satir yokken sema varsayilani (DORT izin) yaziliyordu: kurumsal
          //   giris ZORUNLU firmalarda davet YALNIZ bu yoldan kabul edilebildigi
          //   icin sahibin secimi HER SEFERINDE kayboluyordu (guvenlik
          //   incelemesi buldu). Davetsiz otomatik katilim (JIT) → dordu,
          //   ACIKCA: ozellikten onceki davranis; sahip sonra daraltir.
          //   Bozuk davet listesi → `[]` (fail-closed).
          izinler: davet ? (izinleriSuz(davet.izinler) ?? []) : [...TUM_IZINLER],
          role: 'user',
          // Kimlik saglayicisi e-postayi KANITLADI (xms_edov / email_verified).
          emailVerified: true,
          ad: kimlik.ad ?? null,
          soyad: kimlik.soyad ?? null,
          sozlesmeOnayiAt: simdi,
          sozlesmeSurumu: HUKUKI_METIN_SURUMU,
          ticariIletiOnayiAt: dto.ticariIletiOnayi === true ? simdi : null,
        },
        select: {
          id: true, email: true, role: true, firmaId: true, firmaRol: true,
          createdAt: true, mfaAcikAt: true, mfaKaynagi: true,
          status: true, deletedAt: true,
        },
      });
      await tx.kullaniciDisKimlik.create({
        data: {
          userId: kullanici.id,
          saglayiciId: saglayici.id,
          issuer: kimlik.issuer,
          subject: kimlik.subject,
          entraKiraciId: kimlik.entraKiraciId ?? null,
          epostaAnlik: kanit.eposta,
          baglamaYolu: 'otomatik-katilim',
          sonGirisAt: simdi,
        },
      });
      if (davet) {
        await tx.firmaDavet.update({
          where: { id: davet.id },
          data: { kabulAt: simdi, kabulEdenId: kullanici.id },
        });
      }
      await this.olayYaz(tx, saglayici.firmaId, null, 'uye.katildi', {
        hedefId: kullanici.id,
        hedefEposta: kullanici.email,
        veri: { yol: 'kurumsal-giris' },
      });
      await tx.ssoAkisi.update({ where: { id: akis.id }, data: { dogrulanmisKimlik: null } });
      return kullanici;
    });

    return this.sekleCevir(await this.oturum.girisKarari(yeni as any, 'kurumsal'));
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  BAGLANTI KALDIRMA (R1-O3, §5.5)
  // ═════════════════════════════════════════════════════════════════════════

  async baglantiKaldir(userId: string, parola: string | undefined, authAt: number | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    hesapKapisi(user as any);
    const kimlikler = await this.prisma.kullaniciDisKimlik.findMany({ where: { userId } });
    if (kimlikler.length === 0) {
      throw new NotFoundException({ kod: 'BAGLANTI_YOK', mesaj: 'Hesabınıza bağlı bir şirket hesabı yok.' });
    }
    // ⚠ SIRA: son giris yolu kontrolu yeniden dogrulamadan SONRA degil
    // ONCE olmali mi? Hayir — once kimligi dogrula ki, "bu hesabin tek
    // giris yolu" bilgisi bile yetkisiz birine sizmasin.
    await this.yenidenKimlikDogrula(user as any, parola, authAt);
    if ((user as any).parolaTanimli === false && kimlikler.length === 1) {
      throw new BadRequestException({
        kod: 'SON_GIRIS_YOLU',
        mesaj:
          'Bu, hesabınıza girmenin tek yolu. Önce "Parolamı unuttum" ile bir parola belirleyin, sonra bağlantıyı kaldırın.',
      });
    }
    await this.prisma.kullaniciDisKimlik.deleteMany({ where: { userId } });
    if (user.firmaId) {
      await this.olayYaz(this.prisma, user.firmaId, user as any, 'kurumsal-baglanti.kaldirildi', {
        hedefId: user.id,
        hedefEposta: user.email,
      });
    }
    void this.epostaYolla(kurumsalBaglantiKaldirildiEpostasi(user.email));
    return { kaldirildi: true };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  SAATLIK IS — temizlik + istemci sirri bitis uyarisi
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * ⚠ `@Cron`un calismasi `ScheduleModule.forRoot()`un KURESEL kesfine
   * dayanir (`OdemeModule` kaydediyor). Bagi `test:faz7-kurumsal` K24
   * REFLECTOR ile olcer — "mekanizma var, baglanti yok" hatasi bu depoda
   * alti kez olculdu.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async saatlikIs(): Promise<void> {
    try {
      await this.akislariTemizle();
      await this.sirUyarilariniYolla();
    } catch (e) {
      this.logger.error(`Kurumsal giris saatlik isi basarisiz: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async akislariTemizle(): Promise<number> {
    const simdi = this.simdi();
    const { count } = await this.prisma.ssoAkisi.deleteMany({
      where: { olusturuldu: { lt: new Date(simdi.getTime() - AKIS_SAKLAMA_MS) } },
    });
    return count;
  }

  /** Sir bitisine 14 gun kala sahibe uyari — GUNDE EN FAZLA BIR kez. */
  async sirUyarilariniYolla(): Promise<number> {
    const simdi = this.simdi();
    const esik = new Date(simdi.getTime() + SIR_UYARI_GUN * 24 * 60 * 60 * 1000);
    const gunOnce = new Date(simdi.getTime() - 24 * 60 * 60 * 1000);
    const adaylar = await this.prisma.firmaKimlikSaglayici.findMany({
      where: {
        istemciSirriSonGecerlilik: { lt: esik },
        durum: { in: ['DOGRULANDI', 'ETKIN'] as any },
        OR: [{ sonSirUyarisiAt: null }, { sonSirUyarisiAt: { lt: gunOnce } }],
      },
    });
    let gonderilen = 0;
    for (const s of adaylar) {
      const sahip = await this.prisma.user.findFirst({
        where: { firmaId: s.firmaId, firmaRol: 'sahip', ...etkinHesapKosulu() },
        orderBy: [{ createdAt: 'asc' }],
      });
      if (!sahip) continue;
      await this.epostaYolla(sirBitiyorEpostasi(sahip.email, s.istemciSirriSonGecerlilik));
      await this.prisma.firmaKimlikSaglayici.update({
        where: { id: s.id },
        data: { sonSirUyarisiAt: simdi },
      });
      gonderilen++;
    }
    return gonderilen;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  ORTAK YARDIMCILAR
  // ═════════════════════════════════════════════════════════════════════════

  private async idTokenAl(
    saglayici: SaglayiciSatiri,
    akis: any,
    code: string,
    simdi: Date,
  ): Promise<DogrulanmisKimlik> {
    const issuer = this.kesifIssuer(saglayici);
    const kesif = await kesifAl(issuer, this.fetchFn, { simdiMs: simdi.getTime() });
    const { idToken } = await kodDegistir(
      {
        tokenUrl: kesif.tokenEndpoint,
        code,
        redirectUri: this.donusAdresi(),
        clientId: saglayici.clientId,
        clientSecret: this.sirriCoz(saglayici),
        codeVerifier: akis.pkceDogrulayici,
      },
      this.fetchFn,
      { simdiMs: simdi.getTime() },
    );
    const talepler = (await idTokenDogrula({
      idToken,
      jwksUri: kesif.jwksUri,
      fetchFn: this.fetchFn,
      // ⚠ R1-D5 (mutant #37): beklenen `iss` HER ZAMAN KODDAN turetilir.
      // DB'deki `issuer` kolonu yalniz gosterim icindir; Google icin tek
      // dizgeye indirgenirse `accounts.google.com` bicimli GECERLI token
      // reddedilir.
      issuer: beklenenIssuer(saglayici.tip, saglayici.entraKiraciId),
      clientId: saglayici.clientId,
      nonce: akis.nonce,
      simdiMs: simdi.getTime(),
    })) as KurumsalTalepler;

    // ── ORTAK KIMLIK KAPILARI — KIMLIK ANAHTARI CIKARILMADAN ONCE ──────
    // ⚠ SIRA SART: tuketici kiracisinin (`9188040d-…`) `tid`i
    // `kimlikAnahtari`ni "talep eksik" diye patlatirdi ve gercek neden
    // (kiraci uyusmadi) gunlukte KAYBOLURDU.
    // ⚠ MISAFIR (B2B) hesap `tid` kontrolunu GECER (kaynak kiracida
    // dogrulanir): tek kapi `idp !== iss` karsilastirmasidir (mutant #23).
    if (misafirMi(talepler, saglayici.tip)) {
      throw new KimlikKapisiHatasi('MISAFIR_HESAP');
    }
    if (saglayici.tip === 'entra') {
      const gelen = kiraciIdNormalize(talepler.tid);
      const beklenen = kiraciIdNormalize(saglayici.entraKiraciId);
      // `kiraciIdNormalize` tuketici kiracisini ZATEN null yapar — kisisel
      // Microsoft hesabi bu kapidan gecemez (mutant #30).
      if (!gelen || !beklenen || gelen !== beklenen) {
        throw new KimlikKapisiHatasi('KIRACI_UYUSMADI');
      }
    }

    const anahtar = kimlikAnahtari(talepler, saglayici.tip);
    const dar: KurumsalTalepler = {
      iss: talepler.iss,
      tid: talepler.tid,
      idp: talepler.idp,
      email: talepler.email,
      email_verified: talepler.email_verified,
      xms_edov: talepler.xms_edov,
      hd: talepler.hd,
    };
    const dogrulanmis = await this.dogrulanmisAlanlar(this.prisma, saglayici.id);
    const kanit = epostaKanitli(dar, saglayici, dogrulanmis);
    return {
      issuer: anahtar.issuer,
      subject: anahtar.subject,
      entraKiraciId: anahtar.entraKiraciId ?? null,
      misafir: misafirMi(talepler, saglayici.tip),
      eposta: kanit?.eposta ?? null,
      epostaKanitliBilgi: kanit !== null,
      kurumsalKimlikMiBilgi: kurumsalKimlikMi(dar, saglayici, dogrulanmis),
      hd: alanAdiNormalize(talepler.hd),
      sinamaKaniti:
        saglayici.tip === 'entra' ? entraSinamaKaniti(talepler) : googleSinamaKaniti(talepler),
      ad: typeof talepler.given_name === 'string' ? talepler.given_name : null,
      soyad: typeof talepler.family_name === 'string' ? talepler.family_name : null,
      talepler: dar,
    };
  }

  /** Kesif adresi icin TEK issuer (Google'in iki bicimi `beklenenIssuer`de). */
  private kesifIssuer(saglayici: { tip: SaglayiciTipi; entraKiraciId: string | null }): string {
    if (saglayici.tip === 'google') return GOOGLE_ISSUER;
    const b = beklenenIssuer('entra', saglayici.entraKiraciId);
    return Array.isArray(b) ? b[0] : b;
  }

  private sirriCoz(saglayici: { id: string; istemciSirriSifreli: string }): string {
    return sirCoz(saglayici.istemciSirriSifreli, `idp:${saglayici.id}`);
  }

  private async saglayiciAl(id: string): Promise<SaglayiciSatiri | null> {
    return (await this.prisma.firmaKimlikSaglayici.findUnique({ where: { id } })) as SaglayiciSatiri | null;
  }

  private async saglayiciAlFirma(firmaId: string): Promise<SaglayiciSatiri | null> {
    return (await this.prisma.firmaKimlikSaglayici.findUnique({
      where: { firmaId },
    })) as SaglayiciSatiri | null;
  }

  private durumAmacaUygun(durum: string, amac: string): boolean {
    if (amac === 'giris') return durum === 'ETKIN';
    if (amac === 'bagla') return durum === 'DOGRULANDI' || durum === 'ETKIN';
    // `sinama` HER durumda calisir (§5.6 madde 4): amaci ZATEN durumu
    // ilerletmektir; TASLAK saglayici baska turlu DOGRULANDI olamazdi.
    return true;
  }

  private async dogrulanmisAlanlar(db: any, saglayiciId: string): Promise<string[]> {
    const satirlar = await db.dogrulanmisAlanAdi.findMany({ where: { saglayiciId } });
    return satirlar.map((s: any) => s.alanAdi);
  }

  private async beyanAlanlari(saglayiciId: string): Promise<(string | null)[]> {
    const s = await this.prisma.firmaKimlikSaglayici.findUnique({ where: { id: saglayiciId } });
    return (s?.beyanAlanAdlari ?? []).map((a: string) => alanAdiNormalize(a));
  }

  private async alanIpucu(saglayici: SaglayiciSatiri): Promise<string | null> {
    const dogrulanmis = await this.dogrulanmisAlanlar(this.prisma, saglayici.id);
    if (dogrulanmis.length > 0) return dogrulanmis[0];
    const beyan = (await this.beyanAlanlari(saglayici.id)).filter((a): a is string => a !== null);
    return beyan[0] ?? null;
  }

  private async akisHatasi(akisId: string, kodu: string): Promise<void> {
    await this.prisma.ssoAkisi.update({ where: { id: akisId }, data: { hataKodu: kodu } });
  }

  private async kimligiTemizle(akisId: string): Promise<void> {
    await this.prisma.ssoAkisi.update({ where: { id: akisId }, data: { dogrulanmisKimlik: null } });
  }

  private hataYolu(kok: string, amac: string, kodu: string): string {
    if (amac === 'sinama') return `${kok}/firma/ekip/kurumsal-giris?sonuc=${kodu}`;
    if (amac === 'bagla') return `${kok}/profile?kurumsal=${kodu}`;
    return `${kok}/login?kurumsal_hata=${kodu}`;
  }

  private hataKodunaCevir(e: unknown): string {
    if (e instanceof OidcHatasi) return e.kod;
    if (e instanceof KurumsalKuralHatasi) return e.kod;
    if (e instanceof KimlikKapisiHatasi) return e.kod;
    if (e && typeof e === 'object' && 'response' in e) {
      const g = (e as any).response;
      if (g && typeof g.kod === 'string') return g.kod;
    }
    this.logger.error(`Kurumsal giris donusu basarisiz: ${e instanceof Error ? e.message : String(e)}`);
    return 'IDP_HATASI';
  }

  /** 400 `{ kod, amac, mesaj }` — on yuz hangi ekrana donecegini `amac`tan bilir. */
  private karar(amac: string, kod: string, mesaj: string): BadRequestException {
    return new BadRequestException({ kod, amac, mesaj });
  }

  private yoneticiReddi(amac: string): BadRequestException {
    return this.karar(
      amac,
      'YONETICI_KURUMSAL_GIRIS_YOK',
      'Platform yöneticisi hesapları şirket girişini kullanamaz; parolanızla girin.',
    );
  }

  private epostaKanitsiz(amac: string, tip: SaglayiciTipi): BadRequestException {
    return this.karar(
      amac,
      'EPOSTA_KANITSIZ',
      tip === 'entra'
        ? 'Şirket hesabınızın e-postası doğrulanmış olarak gelmedi. Yöneticiniz uygulama kaydında "xms_edov" ve "email" taleplerini eklemeli.'
        : 'Şirket hesabınızın e-postası doğrulanmış olarak gelmedi.',
    );
  }

  /** `hesapKapisi`yi KODLU hataya cevirir (tek kapi korunur, §3.11). */
  private hesapKapisiKodlu(amac: string, user: { status?: string | null; deletedAt?: Date | null }): void {
    try {
      hesapKapisi(user);
    } catch {
      throw this.karar(
        amac,
        user.status === 'banned' ? 'HESAP_ASKIDA' : 'HESAP_KAPALI',
        user.status === 'banned' ? 'Hesabınız askıya alınmış.' : 'Hesabınız kapatılmış.',
      );
    }
  }

  /**
   * YENIDEN KIMLIK DOGRULAMA (R1-Y1/O3) — `mfa.servisi.ts` ile AYNI kural.
   * Parolali hesapta parola, parolasiz hesapta `authAt ≤ 600 sn`.
   */
  private async yenidenKimlikDogrula(
    user: { password: string; parolaTanimli?: boolean },
    parola: string | undefined,
    authAt: number | null,
  ): Promise<void> {
    if (user.parolaTanimli === false) {
      if (!yakinZamandaGirisMi(authAt, Math.floor(this.simdiMs() / 1000))) {
        throw new BadRequestException({
          kod: 'YENIDEN_GIRIS_GEREKLI',
          mesaj:
            'Güvenlik için çıkış yapıp şirket hesabınızla yeniden girin, sonra 10 dakika içinde tekrar deneyin.',
        });
      }
      return;
    }
    const dogru = await bcrypt.compare(parola ?? '', user.password);
    if (!dogru) {
      throw new BadRequestException({ kod: 'PAROLA_HATALI', mesaj: 'Parolanız hatalı.' });
    }
  }

  private async koltukKapisi(
    tx: any,
    firmaId: string,
    simdi: Date,
    haricDavetId: string | null,
  ): Promise<void> {
    const [etkinHesap, bekleyenDavet, ab] = await Promise.all([
      tx.user.count({ where: { firmaId, ...etkinHesapKosulu() } }),
      tx.firmaDavet.count({
        where: {
          firmaId,
          ...bekleyenDavetKosulu(simdi),
          ...(haricDavetId ? { id: { not: haricDavetId } } : {}),
        },
      }),
      tx.abonelik.findUnique({
        where: { firmaId },
        select: { paketSurumu: { select: { paket: { select: { kullaniciHakki: true } } } } },
      }),
    ]);
    const hak = typeof ab?.paketSurumu?.paket?.kullaniciHakki === 'number'
      ? ab.paketSurumu.paket.kullaniciHakki
      : 0;
    const karar = koltukKarari({ etkinHesap, bekleyenDavet, hak });
    if (karar.izin) return;
    throw new BadRequestException({
      kod: karar.nedenKodu,
      mesaj:
        karar.nedenKodu === 'PAKET_EKIP_YOK'
          ? 'Firmanızın paketinde ekip özelliği yok. Yöneticiniz paketi yükseltmeli.'
          : `Firmanızın kullanıcı hakkı dolu (firma sahibi dahil ${hak} kişi). Yöneticinizden yer açmasını isteyin.`,
      hak,
    });
  }

  private async olayYaz(
    db: any,
    firmaId: string,
    aktor: { id: string; email: string } | null,
    tip: string,
    ek: { hedefId?: string; hedefEposta?: string; veri?: Record<string, unknown> } = {},
  ): Promise<void> {
    await db.firmaOlayi.create({
      data: {
        firmaId,
        aktorId: aktor?.id ?? null,
        aktorEposta: aktor?.email ?? null,
        hedefKullaniciId: ek.hedefId ?? null,
        hedefEposta: ek.hedefEposta ?? null,
        tip,
        veri: (ek.veri ?? undefined) as never,
      },
    });
  }

  /** Bilgi e-postasi hicbir akisi BLOKLAMAZ (hata yutulur + gunluk). */
  private async epostaYolla(talep: any): Promise<void> {
    try {
      await this.eposta.gonder(talep);
    } catch (e) {
      this.logger.warn(`Kurumsal giris bilgi e-postasi gonderilemedi: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** `girisKarari` cikisini uc sekline cevirir (§5.5). */
  private sekleCevir(karar: any): any {
    if (karar?.mfaGerekli === true) {
      return { tip: 'mfa', meydanOkuma: karar.meydanOkuma, yontemler: karar.yontemler };
    }
    if (karar?.mfaKurulumGerekli === true) {
      // Kurumsal yolda `girisKarariSaf` bu dali URETMEZ (§4.6); yine de
      // sessiz bir `undefined` token yerine anlamli bir sekil donulur.
      return { tip: 'mfa-kurulum', meydanOkuma: karar.meydanOkuma, neden: karar.neden };
    }
    return { tip: 'oturum', token: karar.token, user: karar.user };
  }
}
