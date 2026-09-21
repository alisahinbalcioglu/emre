import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../altyapi/db/prisma.service';
import { EpostaServisi } from '../odeme/eposta/eposta.servisi';
import { OturumServisi } from '../../altyapi/auth/oturum.servisi';
import { epostaKucult, epostaIleKullaniciBul } from '../../altyapi/auth/eposta';
import { tokenUret, tokenOzetle, DAVET_OMRU_MS } from '../../altyapi/auth/token-ozet';
import { uygulamaKokuCoz } from '../../altyapi/auth/uygulama-url';
import { HUKUKI_METIN_SURUMU } from '../../altyapi/auth/hukuki-surum';
import {
  alanAdiKurumsalGiris,
  alanAdiZorunluMu,
  KURUMSAL_GIRIS_ZORUNLU_GOVDE,
} from '../../altyapi/auth/kurumsal/kurumsal-zorunluluk';
import type { Kimlik } from '../../altyapi/auth/kimlik';
import { DavetKabulDto } from './dto/davet-kabul.dto';
import {
  ayrilmaKarari,
  bekleyenDavetKosulu,
  etkinHesapKosulu,
  firmaKilitliIslem,
  disKimlikleriSil,
  kapatmaVerisi,
  koltukKarari,
  koltukSirasiKarari,
  oncekilerKosulu,
  type FirmaRol,
} from './uyelik-kurallari';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F1b — UYELIK SERVISI (davet, koltuk, rol, cikarma)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ── IKI KATMANLI SAHIP KAPISI (R1-Y3) ────────────────────────────────────
 *  Birinci katman `FirmaRolGuard` (token'daki `firmaRol`). Ikinci katman
 *  BURASI: sahip gerektiren her metot, FIRMA KILIDININ ICINDE cagiranin
 *  rolunu DB'den yeniden okur. Neden iki katman:
 *    · Tek bir `@FirmaRolu('sahip')` dekatoru unutulursa/silinirse
 *      (mutant #29-32) uye kendini sahip yapabilirdi.
 *    · Token bir istek eski olabilir: sahibi az once uyeye dusuren bir
 *      islemle YARISMAK mumkun; kilit ici okuma bu yarisi kapatir.
 *
 *  ── HER MUTASYON AYNI TRANSACTION'DA OLAY YAZAR ──────────────────────────
 *  `admin.service.ts` `denetimliMutasyon` deseninin firma karsiligi. Olay
 *  yazilamazsa islem de uygulanmaz: "kim kimi cikardi" sorusunun cevapsiz
 *  kalmasi, islemin hic olmamasindan daha kotudur.
 *
 *  ── DAVET SORGULARI HER ZAMAN `firmaId` TASIR (R1-D2) ────────────────────
 *  `where: { id }` yazmak, baska firmanin davet kimligini bilen bir sahibin
 *  o daveti iptal etmesine izin verirdi. Tum davet okuma/yazmalari
 *  `{ id, firmaId: k.firmaId }`.
 */
@Injectable()
export class UyelikServisi {
  private readonly logger = new Logger(UyelikServisi.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eposta: EpostaServisi,
    private readonly oturum: OturumServisi,
    private readonly config: ConfigService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  //  OKUMA
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * EKIP LISTESI. Uye de gorur (salt okunur); bekleyen davetler yalniz sahibe.
   *
   * ⚠ `durduruldu` HER UYE ICIN TEK SORGUDA hesaplanir: liste zaten sirali
   * cekiliyor, sira numarasi dizide bulunur. Uye basina bir `count` atmak
   * 20 kisilik firmada 20 sorgu demekti.
   */
  async uyeleriGetir(k: Kimlik) {
    const simdi = new Date();
    const [hepsi, bekleyenDavetler, hak, ben] = await Promise.all([
      this.prisma.user.findMany({
        where: { firmaId: k.firmaId, deletedAt: null },
        orderBy: [{ firmaRol: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true, email: true, ad: true, soyad: true, firmaRol: true,
          status: true, createdAt: true,
          // FAZ 7 F2b (§6.5): ekip listesinde "iki adimli giris" sutunu.
          // ⚠ YALNIZ DURUM: sir, kaynak ve kurtarma kodu sayisi BASKASININ
          // hesabina ait ayrintidir — sahip bile gormez.
          mfaAcikAt: true,
        },
      }),
      this.prisma.firmaDavet.findMany({
        where: { firmaId: k.firmaId, ...bekleyenDavetKosulu(simdi) },
        orderBy: { olusturuldu: 'desc' },
        select: {
          id: true, eposta: true, sonGecerlilik: true, gonderimSayisi: true,
          sonGonderimAt: true, davetEdenEposta: true,
        },
      }),
      this.hakOku(this.prisma, k.firmaId),
      this.prisma.user.findUnique({
        where: { id: k.userId },
        select: { firmaRol: true },
      }),
    ]);

    // ⚠ Sira `oncekilerKosulu` ile AYNI olmak zorunda: once sahipler
    // (createdAt, id), sonra uyeler. Prisma `firmaRol: 'asc'` enum'u tanim
    // sirasina gore dizer — enum'da `sahip` once geldigi icin ayrica
    // diziliyoruz ki sira kural dosyasindan turetilsin, enum sirasindan degil.
    const etkin = hepsi.filter((u) => u.status === 'active');
    const sirali = [...etkin].sort((a, b) => {
      if (a.firmaRol !== b.firmaRol) return a.firmaRol === 'sahip' ? -1 : 1;
      const f = a.createdAt.getTime() - b.createdAt.getTime();
      return f !== 0 ? f : a.id.localeCompare(b.id);
    });
    const sirasi = new Map(sirali.map((u, i) => [u.id, i]));

    const uyeler = hepsi.map((u) => {
      const onceGelen = sirasi.get(u.id);
      const durduruldu =
        onceGelen === undefined
          ? false
          : !koltukSirasiKarari({ onceGelen, hak }).iceride;
      return {
        id: u.id,
        eposta: u.email,
        ad: u.ad,
        soyad: u.soyad,
        firmaRol: u.firmaRol,
        durum: u.status,
        katildi: u.createdAt,
        durduruldu,
        mfaAcik: !!u.mfaAcikAt,
      };
    });

    const sahipMi = ben?.firmaRol === 'sahip';
    const aktif = etkin.length;
    const karar = koltukKarari({
      etkinHesap: aktif,
      bekleyenDavet: bekleyenDavetler.length,
      hak: hak ?? 0,
    });
    return {
      koltuk: {
        aktif,
        bekleyen: bekleyenDavetler.length,
        hak,
        durdurulan: uyeler.filter((u) => u.durduruldu).length,
      },
      uyeler,
      // ⚠ Uye bekleyen davetleri GORMEZ: davet edilen kisinin e-posta adresi
      // firmanin ticari kaydi degil, ucuncu kisinin verisidir.
      bekleyenDavetler: sahipMi ? bekleyenDavetler : [],
      // ⚠ Karar SUNUCUDA verilir; on yuz yeniden hesaplamaz (`erisim-durumu.ts`
      // ikizi bu depoda olculmus bir hata sinifi).
      davet: sahipMi
        ? { acik: karar.izin, nedenKodu: karar.nedenKodu ?? null }
        : { acik: false, nedenKodu: 'FIRMA_SAHIBI_GEREKLI' },
    };
  }

  /**
   * DAVET BILGISI — giris YAPMAMIS kisiye gosterilir (guardsiz uc).
   *
   * ⚠ TEK RET MESAJI: yok / kullanilmis / iptal / suresi dolmus AYRILMAZ
   * (`parola.servisi.ts:137-146` deseni). Ayirmak, elinde token listesi olan
   * birine "bu firma var ve bu davet gercekti" bilgisini verirdi.
   */
  async davetBilgi(token: string) {
    const davet = await this.davetiCoz(this.prisma, token);
    const firma = await this.prisma.firma.findUnique({
      where: { id: davet.firmaId },
      select: { ad: true },
    });
    const kurumsalAday = await alanAdiKurumsalGiris(this.prisma, davet.eposta);
    // ⚠ Yalniz DAVETIN FIRMASININ saglayicisi gosterilir: baska bir firmanin
    // alan adiyla davet edilen kisiye o firmanin dugmesini cizmek, davete
    // alakasiz bir kimlik saglayicisi baglardi.
    const kurumsal =
      kurumsalAday &&
      (await this.prisma.dogrulanmisAlanAdi.count({
        where: { saglayiciId: kurumsalAday.saglayiciId, firmaId: davet.firmaId },
      })) > 0
        ? kurumsalAday
        : null;
    return {
      firmaAd: firma?.ad ?? '',
      davetEdenEposta: davet.davetEdenEposta,
      eposta: davet.eposta,
      sonGecerlilik: davet.sonGecerlilik,
      // FAZ 7 F3b: davet ekrani "Sirket hesabimla katil" dugmesini buradan
      // cizer; `zorunlu` ise parola formu HIC cizilmez (§6.4).
      // ⚠ Alan adi ekseni: davet edilen kisinin hesabi HENUZ YOK.
      kurumsalGiris: kurumsal
        ? { var: true, zorunlu: kurumsal.zorunlu, tip: kurumsal.tip, saglayiciId: kurumsal.saglayiciId }
        : { var: false, zorunlu: false, tip: null as string | null, saglayiciId: null as string | null },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  DAVET
  // ═══════════════════════════════════════════════════════════════════════

  async davetOlustur(k: Kimlik, hamEposta: string) {
    const eposta = epostaKucult(hamEposta);
    const simdi = new Date();

    const sonuc = await firmaKilitliIslem(this.prisma, k.firmaId, async (tx) => {
      const aktor = await this.sahipOku(tx, k);
      await this.gunlukSinir(tx, k.firmaId);

      // ⚠ ZATEN EKIPTE kontrolu davet ANINDA yapilir cunku bu bilgi zaten
      // sahibin kendi ekibidir. "Bu adres BASKA bir firmada kayitli" ise
      // burada SORULMAZ — sahibe "bu e-posta MetaPriceX musterisi" demek
      // numaralandirma sizintisidir. O ret yalniz KABULDE, adresin
      // SAHIBINE gosterilir (V3).
      const ekipte = await epostaIleKullaniciBul(tx, eposta);
      if (ekipte && ekipte.firmaId === k.firmaId && !ekipte.deletedAt && ekipte.status === 'active') {
        throw new BadRequestException({
          kod: 'ZATEN_EKIPTE',
          mesaj: 'Bu e-posta adresi zaten ekibinizde.',
        });
      }

      // Ayni firma + ayni e-posta icin ikinci BEKLEYEN davet acilmaz;
      // ikinci istek YENIDEN GONDERIMDIR (Prisma kismi tekil indeks
      // yazamadigi icin kural kilit icinde burada).
      const mevcut = await tx.firmaDavet.findFirst({
        where: { firmaId: k.firmaId, eposta, ...bekleyenDavetKosulu(simdi) },
        select: { id: true },
      });
      if (mevcut) return this.davetGonderimi(tx, k, mevcut.id, aktor, simdi);

      await this.koltukKapisi(tx, k.firmaId, simdi, null);

      const { token, ozet } = tokenUret();
      const davet = await tx.firmaDavet.create({
        data: {
          firmaId: k.firmaId,
          eposta,
          // ⚠ DUZ TOKEN DB'YE YAZILMAZ — yalniz SHA-256 ozeti (token-ozet.ts).
          tokenHash: ozet,
          sonGecerlilik: new Date(simdi.getTime() + DAVET_OMRU_MS),
          davetEdenId: k.userId,
          davetEdenEposta: aktor.email,
        },
        select: { id: true, eposta: true, sonGecerlilik: true },
      });
      await this.olayYaz(tx, k.firmaId, aktor, 'davet.olusturuldu', {
        hedefEposta: eposta,
      });
      await this.davetPostala(tx, davet.eposta, aktor.email, token, k.firmaId);
      return davet;
    });
    return sonuc;
  }

  async davetYenidenGonder(k: Kimlik, davetId: string) {
    const simdi = new Date();
    return firmaKilitliIslem(this.prisma, k.firmaId, async (tx) => {
      const aktor = await this.sahipOku(tx, k);
      await this.gunlukSinir(tx, k.firmaId);
      return this.davetGonderimi(tx, k, davetId, aktor, simdi);
    });
  }

  async davetIptal(k: Kimlik, davetId: string) {
    return firmaKilitliIslem(this.prisma, k.firmaId, async (tx) => {
      const aktor = await this.sahipOku(tx, k);
      // ⚠ `firmaId` KOSULU SART (R1-D2): baska firmanin davet kimligiyle
      // gelen istek 404 alir ve HICBIR yazma yapilmaz.
      const davet = await tx.firmaDavet.findFirst({
        where: { id: davetId, firmaId: k.firmaId },
        select: { id: true, eposta: true, iptalAt: true, kabulAt: true },
      });
      if (!davet || davet.iptalAt || davet.kabulAt) {
        throw new NotFoundException({
          kod: 'DAVET_YOK',
          mesaj: 'Davet bulunamadı.',
        });
      }
      await tx.firmaDavet.update({
        where: { id: davet.id },
        data: { iptalAt: new Date(), iptalEdenId: k.userId },
      });
      await this.olayYaz(tx, k.firmaId, aktor, 'davet.iptal', {
        hedefEposta: davet.eposta,
      });
      return { iptal: true };
    });
  }

  /**
   * DAVET KABUL — guardsiz uc. Kisi burada HESABINI ACAR.
   *
   * ⚠ UC KURAL, UCUNUN DE MUTANTI VAR:
   *   1. `firma: { create: … }` YOK — davet kabul eden kisi YENI FIRMA ACMAZ
   *      (acsaydi firma hem davet eden hem yeni firmada gorunur, abonelik
   *      hangi firmaya ait belirsizlesir).
   *   2. `firmaId` DAVETTEN gelir — govdedeki `firmaId` OKUNMAZ.
   *   3. `firmaRol: 'uye'` ACIKCA yazilir — sema varsayilani `sahip`tir;
   *      satiri silmek davet edilen herkesi SAHIP yapardi.
   */
  async davetKabul(dto: DavetKabulDto) {
    const ozet = tokenOzetle(dto.token);
    const simdi = new Date();

    const yeni = await this.prisma.$transaction(async (tx: any) => {
      const davet = await tx.firmaDavet.findUnique({
        where: { tokenHash: ozet },
        select: {
          id: true, firmaId: true, eposta: true, kabulAt: true,
          iptalAt: true, sonGecerlilik: true,
        },
      });
      if (
        !davet ||
        davet.kabulAt ||
        davet.iptalAt ||
        davet.sonGecerlilik.getTime() <= simdi.getTime()
      ) {
        throw new BadRequestException(DAVET_GECERSIZ);
      }

      // ⚠ KILIT BURADA (kabul, firma uyeligini degistirir). Davet cozumu
      // kilitten once yapildi cunku hangi firmanin kilidi alinacagi ancak
      // davetten ogrenilir.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`firma-uyelik:${davet.firmaId}`}))::text AS kilit`;

      // ── FAZ 7 F3b (V7 ikizi, §5.10): PAROLA YOLU KAPALI ─────────────
      // Davetin firmasinda kurumsal giris zorunlu ve davet edilen adresin
      // alan adi dogrulanmissa, bu kisi parolali hesap ACAMAZ — ekranda
      // "Sirket hesabimla katil" gosterilir. Olmasaydi davet baglantisi,
      // zorunlulugun disinda kalan bir PAROLALI hesap acma yolu olurdu.
      if (await alanAdiZorunluMu(tx, davet.eposta)) {
        throw new BadRequestException(KURUMSAL_GIRIS_ZORUNLU_GOVDE);
      }

      // ⚠ BUYUK/KUCUK HARFE DUYARSIZ (K-P6): `epostaIleKullaniciBul` ile
      // AYNI kural. Birebir eslesme yazilsaydi "Ali@x.com" ile kayitli kisi
      // "ali@x.com" davetini kabul edip IKINCI hesap acardi ve V3 ("bir kisi
      // yalniz bir firmada") sessizce delinirdi.
      const mevcut = await epostaIleKullaniciBul(tx, davet.eposta);
      if (mevcut && !mevcut.deletedAt) {
        // V3: bir kisi ayni anda YALNIZ BIR firmanin uyesidir.
        if (mevcut.firmaId === davet.firmaId) {
          throw new BadRequestException({
            kod: 'ZATEN_EKIPTE',
            mesaj: 'Bu adres zaten bu firmanın ekibinde.',
          });
        }
        throw new BadRequestException({
          kod: 'BASKA_FIRMADA_KAYITLI',
          mesaj:
            'Bu e-posta adresi başka bir firmada kayıtlı. Davete katılmak için ' +
            'önce mevcut hesabınızı kapatmanız ya da o firmadan ayrılmanız gerekir.',
        });
      }

      // Koltuk YENIDEN sinanir: paket arada kuculmus ya da baska biri
      // katilmis olabilir. Kabul edilen davetin kendisi sayimdan DUSER
      // (koltugu zaten o tutuyordu) — `haricDavetId`.
      await this.koltukKapisi(tx, davet.firmaId, simdi, davet.id);

      // ⚠ KOSULLU TUKETIM (yaris): `updateMany` + `kabulAt: null` kosulu.
      // Duz `update` iki es zamanli kabulde IKI hesap acardi.
      const tuketim = await tx.firmaDavet.updateMany({
        where: { id: davet.id, kabulAt: null, iptalAt: null },
        data: { kabulAt: simdi },
      });
      if (tuketim.count !== 1) throw new BadRequestException(DAVET_GECERSIZ);

      const kullanici = await tx.user.create({
        data: {
          email: davet.eposta,
          password: await bcrypt.hash(dto.parola, 10),
          firmaId: davet.firmaId,
          firmaRol: 'uye',
          role: 'user',
          // Davet baglantisi kisinin gelen kutusuna gitti: adres kanitli.
          emailVerified: true,
          sozlesmeOnayiAt: simdi,
          sozlesmeSurumu: HUKUKI_METIN_SURUMU,
          ticariIletiOnayiAt: dto.ticariIletiOnayi === true ? simdi : null,
        },
        select: {
          id: true, email: true, role: true, firmaId: true,
          firmaRol: true, createdAt: true,
          // FAZ 7 F2b: `girisKarari` bu iki alani okur. Yeni hesapta ikisi
          // de bos — ama SEKIL eksik olursa karar "MFA kapali" yerine
          // "alan yok" gorur ve ileride kurumsal yol dali sessizce sasardi.
          mfaAcikAt: true, mfaKaynagi: true,
        },
      });
      await tx.firmaDavet.update({
        where: { id: davet.id },
        data: { kabulEdenId: kullanici.id },
      });
      await this.olayYaz(
        tx,
        davet.firmaId,
        { id: kullanici.id, email: kullanici.email },
        'uye.katildi',
        { hedefId: kullanici.id, hedefEposta: kullanici.email, veri: { yol: 'davet' } },
      );
      return kullanici;
    });

    // FAZ 7 F2b (R1-O1): firma MFA zorunlulugu DAVET KABULUNDE DE gecerli.
    // ⚠ Kullanici transaction ICINDE olusturuldu ve commit EDILDI; karar
    // ondan SONRA verilir. Boylece yeni uye, firma zorunluysa token yerine
    // kurulum meydan okumasi alir ve sihirbaza duser — yanitta `token`
    // ANAHTARI HIC YOKTUR.
    return this.oturum.girisKarari(yeni, 'parola');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  ROL / CIKARMA
  // ═══════════════════════════════════════════════════════════════════════

  async rolDegistir(k: Kimlik, hedefId: string, yeniRol: FirmaRol) {
    return firmaKilitliIslem(this.prisma, k.firmaId, async (tx) => {
      const aktor = await this.sahipOku(tx, k);
      const hedef = await tx.user.findFirst({
        where: { id: hedefId, firmaId: k.firmaId, deletedAt: null },
        select: { id: true, email: true, firmaRol: true },
      });
      if (!hedef) throw new NotFoundException(UYE_YOK);
      if (hedef.firmaRol === yeniRol) return { firmaRol: yeniRol };

      if (hedef.firmaRol === 'sahip' && yeniRol === 'uye') {
        const digerEtkinSahip = await tx.user.count({
          where: {
            firmaId: k.firmaId, firmaRol: 'sahip',
            NOT: { id: hedef.id }, ...etkinHesapKosulu(),
          },
        });
        if (digerEtkinSahip === 0) throw new BadRequestException(SON_SAHIP);
      }

      // ⚠ ONCEKI DEGER UPDATE'TEN ONCE yakalanir: Prisma'nin dondurdugu nesne
      // guncellemeyle ayni referans OLABILIR (ORM/sahte katmana bagli) ve o
      // zaman denetim satirina "uye → uye" gibi anlamsiz bir iz duserdi.
      const oncekiRol = hedef.firmaRol;
      await tx.user.update({
        where: { id: hedef.id },
        data: { firmaRol: yeniRol },
      });
      await this.olayYaz(tx, k.firmaId, aktor, 'rol.degisti', {
        hedefId: hedef.id,
        hedefEposta: hedef.email,
        oncekiDeger: oncekiRol,
        yeniDeger: yeniRol,
      });
      return { firmaRol: yeniRol };
    });
  }

  /**
   * UYE CIKARMA — hesap kapatmanin IKIZI (§3.8).
   *
   * ⚠ `user.delete` DEGIL: `Quote` ve `UserLibrary` `onDelete: Cascade`
   * tasiyor; sert silme cikarilan kisinin BUTUN tekliflerini firmadan
   * gotururdu. Teklifler firmada KALIR ve "Hazirlayan: X (ayrildi)"
   * notuyla gorunur.
   *
   * ⚠ Cagiran SAHIP oldugu icin `digerHesap > 0` her zaman dogrudur →
   * abonelik iptali BU YOLDAN HICBIR ZAMAN cagrilmaz.
   */
  async uyeCikar(k: Kimlik, hedefId: string, epostaOnayi: string) {
    const sonuc = await firmaKilitliIslem(this.prisma, k.firmaId, async (tx) => {
      const aktor = await this.sahipOku(tx, k);
      if (hedefId === k.userId) {
        throw new BadRequestException({
          kod: 'KENDINI_CIKARAMAZ',
          mesaj:
            'Kendinizi ekipten çıkaramazsınız. Hesabınızı kapatmak için ' +
            'Hesabım → Hesabımı kapat adımını kullanın.',
        });
      }
      const hedef = await tx.user.findFirst({
        where: { id: hedefId, firmaId: k.firmaId, deletedAt: null },
        select: { id: true, email: true, firmaRol: true, ad: true, soyad: true },
      });
      if (!hedef) throw new NotFoundException(UYE_YOK);

      // ⚠ E-POSTA ONAYI: yanlis satira basip bir calisani silmek geri
      // donusu ZOR bir zarardir (hesap yumusak silinir ama kisi giremez).
      if (epostaKucult(epostaOnayi) !== epostaKucult(hedef.email)) {
        throw new BadRequestException({
          kod: 'ONAY_UYUSMADI',
          mesaj: 'Yazdığınız e-posta adresi çıkarılacak üyenin adresiyle aynı değil.',
        });
      }

      const { digerHesap, digerEtkinSahip } = await this.ayrilmaSayimlari(
        tx,
        k.firmaId,
        hedef.id,
      );
      const karar = ayrilmaKarari({
        firmaRol: hedef.firmaRol as FirmaRol,
        digerHesap,
        digerEtkinSahip,
      });
      if (!karar.izin) throw new BadRequestException(SON_SAHIP);

      const simdi = new Date();
      await tx.user.update({
        where: { id: hedef.id },
        data: kapatmaVerisi(hedef, simdi),
      });
      // FAZ 7 F3b: cikarilan uye sirket hesabiyla geri giremez.
      await disKimlikleriSil(tx, hedef.id);
      await this.olayYaz(tx, k.firmaId, aktor, 'uye.cikarildi', {
        hedefId: hedef.id,
        hedefEposta: hedef.email,
      });
      return hedef;
    });

    // Bilgi e-postasi best-effort (`gonder`, `gonderKritik` DEGIL): SMTP
    // erisilemez diye cikarma islemi geri alinamaz.
    await this.eposta
      .gonder({
        kime: sonuc.email,
        konu: 'MetaPriceX — ekipten çıkarıldınız',
        baslik: 'Ekip üyeliğiniz sonlandırıldı',
        paragraflar: [
          'Firma sahibi sizi MetaPriceX ekibinden çıkardı ve hesabınıza erişim kapatıldı.',
          'Hazırladığınız teklifler firmanın kaydı olduğu için firmada kalır.',
          'Aynı e-posta adresiyle yeni bir hesap açabilir ya da başka bir firmanın davetini kabul edebilirsiniz.',
        ],
      })
      .catch((e) =>
        this.logger.error(
          `Uye cikarma bilgi e-postasi GONDERILEMEDI (${sonuc.email}): ${
            e instanceof Error ? e.message : String(e)
          }`,
        ),
      );
    return { cikarildi: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  YARDIMCILAR
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * IKINCI SAHIP KATMANI (R1-Y3) — kilit ICINDE, DB'den.
   * Dekorator birinci katmandir; bu okuma onu tek basina dusurmeyi engeller.
   */
  private async sahipOku(tx: any, k: Kimlik): Promise<{ id: string; email: string }> {
    const u = await tx.user.findUnique({
      where: { id: k.userId },
      select: { id: true, email: true, firmaId: true, firmaRol: true, deletedAt: true, status: true },
    });
    if (
      !u ||
      u.deletedAt ||
      u.status !== 'active' ||
      u.firmaId !== k.firmaId ||
      u.firmaRol !== 'sahip'
    ) {
      throw new ForbiddenException({
        kod: 'FIRMA_SAHIBI_GEREKLI',
        mesaj: 'Bu işlemi yalnız firma sahibi yapabilir.',
      });
    }
    return { id: u.id, email: u.email };
  }

  /** Firmanin `Paket.kullaniciHakki` degeri; abonelik yoksa `null`. */
  private async hakOku(db: any, firmaId: string): Promise<number | null> {
    const ab = await db.abonelik.findUnique({
      where: { firmaId },
      select: { paketSurumu: { select: { paket: { select: { kullaniciHakki: true } } } } },
    });
    const h = ab?.paketSurumu?.paket?.kullaniciHakki;
    return typeof h === 'number' ? h : null;
  }

  /** Koltuk kapisi — kilidin ICINDE cagrilir (§3.4). */
  private async koltukKapisi(
    tx: any,
    firmaId: string,
    simdi: Date,
    haricDavetId: string | null,
  ): Promise<void> {
    const [etkinHesap, bekleyenDavet, hak] = await Promise.all([
      tx.user.count({ where: { firmaId, ...etkinHesapKosulu() } }),
      tx.firmaDavet.count({
        where: {
          firmaId,
          ...bekleyenDavetKosulu(simdi),
          ...(haricDavetId ? { id: { not: haricDavetId } } : {}),
        },
      }),
      this.hakOku(tx, firmaId),
    ]);
    const karar = koltukKarari({ etkinHesap, bekleyenDavet, hak: hak ?? 0 });
    if (karar.izin) return;
    throw new BadRequestException({
      kod: karar.nedenKodu,
      mesaj:
        karar.nedenKodu === 'PAKET_EKIP_YOK'
          ? 'Paketinizde ekip özelliği yok. Ekip kurmak için Pro pakete geçin.'
          : `Paketinizin kullanıcı hakkı dolu (firma sahibi dahil ${hak ?? 0} kişi). ` +
            'Paketi yükseltin ya da bir üyeyi/daveti çıkarın.',
      hak: hak ?? 0,
    });
  }

  /**
   * GUNLUK DAVET SINIRI — firma basina son 24 saatte 20 davet olayi.
   * Brevo gunde 300 e-posta veriyor (`auth.controller.ts:119-121`); tek firma
   * kotayi tuketip DIGER firmalarin parola sifirlamasini bozmamali.
   */
  private async gunlukSinir(tx: any, firmaId: string): Promise<void> {
    const sayi = await tx.firmaOlayi.count({
      where: {
        firmaId,
        tip: { in: ['davet.olusturuldu', 'davet.yeniden-gonderildi'] },
        olusturuldu: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (sayi >= 20) {
      // ⚠ 429 (400 DEGIL): hiz siniri bir dogrulama hatasi degildir; on yuz
      // "yarin tekrar deneyin" metnini durum kodundan da ayirt edebilmeli.
      throw new HttpException(
        {
          kod: 'GUNLUK_DAVET_SINIRI',
          mesaj: 'Günlük davet sınırına ulaştınız (24 saatte 20). Yarın tekrar deneyin.',
        },
        429,
      );
    }
  }

  /** Yeniden gonderim: yeni token, eski baglanti olur, sure bastan. */
  private async davetGonderimi(
    tx: any,
    k: Kimlik,
    davetId: string,
    aktor: { id: string; email: string },
    simdi: Date,
  ) {
    const davet = await tx.firmaDavet.findFirst({
      where: { id: davetId, firmaId: k.firmaId },
      select: {
        id: true, eposta: true, kabulAt: true, iptalAt: true,
        gonderimSayisi: true,
      },
    });
    if (!davet || davet.kabulAt || davet.iptalAt) {
      throw new NotFoundException({ kod: 'DAVET_YOK', mesaj: 'Davet bulunamadı.' });
    }
    if (davet.gonderimSayisi >= 5) {
      throw new BadRequestException({
        kod: 'GONDERIM_SINIRI',
        mesaj:
          'Bu davet için gönderim sınırına ulaşıldı (5). Daveti iptal edip yenisini oluşturun.',
      });
    }
    const { token, ozet } = tokenUret();
    const guncel = await tx.firmaDavet.update({
      where: { id: davet.id },
      data: {
        tokenHash: ozet,
        sonGecerlilik: new Date(simdi.getTime() + DAVET_OMRU_MS),
        sonGonderimAt: simdi,
        gonderimSayisi: { increment: 1 },
      },
      select: { id: true, eposta: true, sonGecerlilik: true },
    });
    await this.olayYaz(tx, k.firmaId, aktor, 'davet.yeniden-gonderildi', {
      hedefEposta: davet.eposta,
    });
    await this.davetPostala(tx, guncel.eposta, aktor.email, token, k.firmaId);
    return guncel;
  }

  /**
   * DAVET E-POSTASI — `gonderKritik` (hata FIRLATIR, transaction geri alinir).
   *
   * ⚠ BILEREK KRITIK: sahibe "davet gonderildi" deyip gondermemek koltugu
   * bosuna tutar ve sahip neden katilmadigini anlamaz. SMTP yoksa davet
   * OLUSMAZ ve 503 doner.
   */
  private async davetPostala(
    tx: any,
    kime: string,
    davetEden: string,
    token: string,
    firmaId: string,
  ): Promise<void> {
    const firma = await tx.firma.findUnique({
      where: { id: firmaId },
      select: { ad: true },
    });
    const kok = uygulamaKokuCoz(this.config);
    // ⚠ `redirect`/`next` parametresi YOK (acik yonlendirme deligi,
    // `parola.servisi.ts:95-99` gerekcesi).
    const url = `${kok}/davet-kabul?token=${encodeURIComponent(token)}`;
    try {
      await this.eposta.gonderKritik({
        kime,
        konu: `MetaPriceX — ${firma?.ad ?? 'firma'} ekibine davet edildiniz`,
        baslik: 'Ekibe katılın',
        paragraflar: [
          `${davetEden}, sizi MetaPriceX'te "${firma?.ad ?? 'firma'}" ekibine davet etti.`,
          'Aşağıdaki bağlantıdan parolanızı belirleyip ekibe katılabilirsiniz. Bağlantı 7 gün geçerlidir.',
          'Bu daveti beklemiyorsanız bu iletiyi yok sayabilirsiniz; hiçbir hesap açılmaz.',
        ],
        dugme: { etiket: 'Ekibe katıl', url },
        altNot: 'Bağlantı çalışmıyorsa tarayıcınızın adres çubuğuna kopyalayın: ' + url,
      });
    } catch (e) {
      this.logger.error(
        `Davet e-postasi GONDERILEMEDI (${kime}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new ServiceUnavailableException({
        kod: 'EPOSTA_GONDERILEMEDI',
        mesaj:
          'Davet e-postası gönderilemedi, davet oluşturulmadı. Lütfen birazdan tekrar deneyin.',
      });
    }
  }

  /** Davet cozumu — dort gecersizlik dali AYNI mesaji doner. */
  private async davetiCoz(db: any, token: string) {
    const davet = await db.firmaDavet.findUnique({
      where: { tokenHash: tokenOzetle(token) },
      select: {
        id: true, firmaId: true, eposta: true, davetEdenEposta: true,
        kabulAt: true, iptalAt: true, sonGecerlilik: true,
      },
    });
    if (
      !davet ||
      davet.kabulAt ||
      davet.iptalAt ||
      davet.sonGecerlilik.getTime() <= Date.now()
    ) {
      throw new BadRequestException(DAVET_GECERSIZ);
    }
    return davet;
  }

  /** §3.8 sayimlari — KILIDIN ICINDE cagrilir. */
  private async ayrilmaSayimlari(tx: any, firmaId: string, hedefId: string) {
    const [digerHesap, digerEtkinSahip] = await Promise.all([
      // ⚠ BANLI HESAP DE SAYILIR (Emre'nin "tek kullanici" olcusu).
      tx.user.count({ where: { firmaId, deletedAt: null, NOT: { id: hedefId } } }),
      tx.user.count({
        where: {
          firmaId, firmaRol: 'sahip', NOT: { id: hedefId }, ...etkinHesapKosulu(),
        },
      }),
    ]);
    return { digerHesap, digerEtkinSahip };
  }

  /** `FirmaOlayi` — mutasyonla AYNI transaction'da. */
  private async olayYaz(
    tx: any,
    firmaId: string,
    aktor: { id: string; email: string } | null,
    tip: string,
    ek: {
      hedefId?: string;
      hedefEposta?: string;
      oncekiDeger?: string;
      yeniDeger?: string;
      veri?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    await tx.firmaOlayi.create({
      data: {
        firmaId,
        aktorId: aktor?.id ?? null,
        aktorEposta: aktor?.email ?? null,
        hedefKullaniciId: ek.hedefId ?? null,
        hedefEposta: ek.hedefEposta ?? null,
        tip,
        oncekiDeger: ek.oncekiDeger ?? null,
        yeniDeger: ek.yeniDeger ?? null,
        veri: (ek.veri ?? undefined) as never,
      },
    });
  }
}

const DAVET_GECERSIZ = {
  kod: 'DAVET_GECERSIZ',
  mesaj: 'Davet bağlantısı geçersiz ya da süresi dolmuş. Firma sahibinden yeni davet isteyin.',
};

const UYE_YOK = { kod: 'UYE_YOK', mesaj: 'Üye bulunamadı.' };

const SON_SAHIP = {
  kod: 'SON_SAHIP',
  mesaj:
    'Firmanın son sahibi bu kişi ve ekipte başka kişiler var. ' +
    'Önce Ekip sayfasından birini sahip yapın.',
};
