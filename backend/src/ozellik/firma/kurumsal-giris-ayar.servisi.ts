import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../altyapi/db/prisma.service';
import { ParolaServisi } from '../../altyapi/auth/parola.servisi';
import { KurumsalGirisServisi } from '../../altyapi/auth/kurumsal/kurumsal-giris.servisi';
import { sifrele } from '../../altyapi/auth/kimlik-sifreleme';
import { epostaKucult } from '../../altyapi/auth/eposta';
import {
  alanAdiNormalize,
  beklenenIssuer,
  epostaAlanAdi,
  kiraciIdGecerliMi,
  kiraciIdNormalize,
} from '../../altyapi/auth/kurumsal/saglayici-kurallari';
import { etkinHesapKosulu, firmaKilitliIslem } from './uyelik-kurallari';
import type { Kimlik } from '../../altyapi/auth/kimlik';
import type { KurumsalGirisKaydetDto } from '../../altyapi/auth/kurumsal/dto/kurumsal.dto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — KURUMSAL GIRIS AYARI (firma sahibi, §5.5 / §6.8)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ ISTEMCI SIRRI HICBIR YANITTA DONMEZ. `GET` yalniz `sirVar: true` der
 *  (mutant #20: yanita `istemciSirriSifreli` eklenirse K21 kirmizi olur).
 *  Sifreli deger de donmez: `v1.` onekli metin, anahtar sizarsa DOGRUDAN
 *  sirdir ve ekrana basilan her sey gunluklere/ekran goruntulerine sizar.
 *
 *  ⚠ DENETIM KAYDINA SIR YAZILMAZ (R1-D4, mutant #31): `FirmaOlayi.veri`
 *  yalniz `{ sirDegisti: true }` tasir. DTO'yu oldugu gibi yazmak, duz
 *  istemci sirrini denetim tablosuna KALICI olarak dokerdi.
 *
 *  ⚠ `issuer` KODDA TURETILIR (`beklenenIssuer`), formdan ALINMAZ: formdan
 *  alinsaydi sahip (ya da onun tarayicisina giren biri) dogrulamayi kendi
 *  sunucusuna yonlendirebilirdi.
 */
@Injectable()
export class KurumsalGirisAyarServisi {
  private readonly logger = new Logger(KurumsalGirisAyarServisi.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parola: ParolaServisi,
    private readonly kurumsal: KurumsalGirisServisi,
  ) {}

  // ═════════════════════════════════════════════════════════════════════════
  //  OKUMA
  // ═════════════════════════════════════════════════════════════════════════

  async durum(k: Kimlik) {
    const s = await this.prisma.firmaKimlikSaglayici.findUnique({
      where: { firmaId: k.firmaId },
      select: {
        id: true, tip: true, entraKiraciId: true, clientId: true,
        istemciSirriSonGecerlilik: true, beyanAlanAdlari: true, durum: true,
        jitKatilim: true, zorunlu: true, sonSinamaAt: true, sonHataKodu: true,
        dogrulanmisAlanAdlari: { select: { alanAdi: true, dogrulandiAt: true } },
      },
    });
    return {
      saglayici: s
        ? {
            id: s.id,
            tip: s.tip,
            entraKiraciId: s.entraKiraciId,
            clientId: s.clientId,
            // ⚠ SIR YOK — yalniz VARLIGI bildirilir.
            sirVar: true,
            istemciSirriSonGecerlilik: s.istemciSirriSonGecerlilik,
            beyanAlanAdlari: s.beyanAlanAdlari,
            dogrulanmisAlanAdlari: s.dogrulanmisAlanAdlari,
            durum: s.durum,
            jitKatilim: s.jitKatilim,
            zorunlu: s.zorunlu,
            sonSinamaAt: s.sonSinamaAt,
            sonHataKodu: s.sonHataKodu,
          }
        : null,
      donusAdresi: this.kurumsal.donusAdresi(),
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  KAYIT / GUNCELLEME
  // ═════════════════════════════════════════════════════════════════════════

  async kaydet(k: Kimlik, dto: KurumsalGirisKaydetDto) {
    const mevcut = await this.prisma.firmaKimlikSaglayici.findUnique({
      where: { firmaId: k.firmaId },
    });
    if (dto.tip === 'entra' && !kiraciIdGecerliMi(dto.entraKiraciId)) {
      throw new BadRequestException({
        kod: 'KIRACI_GECERSIZ',
        mesaj:
          'Kiracı kimliği kurumsal bir Entra kiracısının GUID\'i olmalı. ' +
          '"common", "organizations", "consumers" ve kişisel hesap kiracısı kabul edilmez.',
      });
    }
    if (!mevcut && !dto.istemciSirri) {
      throw new BadRequestException({
        kod: 'SIR_GEREKLI',
        mesaj: 'İlk kayıtta istemci anahtarı (client secret) zorunludur.',
      });
    }
    const kiraci = dto.tip === 'entra' ? kiraciIdNormalize(dto.entraKiraciId) : null;
    const issuerHam = beklenenIssuer(dto.tip, kiraci);
    const issuer = Array.isArray(issuerHam) ? issuerHam[0] : issuerHam;
    const alanlar = [
      ...new Set(
        dto.beyanAlanAdlari.map((a) => alanAdiNormalize(a)).filter((a): a is string => a !== null),
      ),
    ];
    const sirDegisti = typeof dto.istemciSirri === 'string' && dto.istemciSirri !== '';
    const bitis = dto.istemciSirriSonGecerlilik ? new Date(dto.istemciSirriSonGecerlilik) : null;

    const aktor = await this.aktorOku(k);

    if (!mevcut) {
      const yeni = await this.prisma.firmaKimlikSaglayici.create({
        data: {
          firmaId: k.firmaId,
          tip: dto.tip as any,
          entraKiraciId: kiraci,
          issuer,
          clientId: dto.clientId,
          // ⚠ DUZ SIR ASLA YAZILMAZ: AAD saglayici kimligini icerir ki
          // sifreli deger baska bir satira kopyalanamasin. Kimlik ancak
          // satir olustuktan sonra bilindigi icin sir IKINCI adimda yazilir.
          istemciSirriSifreli: '',
          istemciSirriSonGecerlilik: bitis,
          beyanAlanAdlari: alanlar,
        },
      });
      await this.prisma.firmaKimlikSaglayici.update({
        where: { id: yeni.id },
        data: { istemciSirriSifreli: sifrele(dto.istemciSirri as string, `idp:${yeni.id}`) },
      });
      await this.olayYaz(k.firmaId, aktor, 'kurumsal-giris.kaydedildi', { sirDegisti: true });
      return { kaydedildi: true, durum: 'TASLAK' };
    }

    // ⚠ `clientId` ya da kiraci DEGISTIYSE artik BASKA BIR UYGULAMADIR:
    // eski sinamanin kanitladigi alan adlari bu yeni kayit icin kanit
    // DEGILDIR. Durum TASLAK'a doner ve alan adlari silinir.
    const kimlikDegisti =
      mevcut.clientId !== dto.clientId ||
      mevcut.tip !== dto.tip ||
      (mevcut.entraKiraciId ?? null) !== kiraci;

    await this.prisma.$transaction(async (tx: any) => {
      await tx.firmaKimlikSaglayici.update({
        where: { id: mevcut.id },
        data: {
          tip: dto.tip as any,
          entraKiraciId: kiraci,
          issuer,
          clientId: dto.clientId,
          istemciSirriSonGecerlilik: bitis,
          beyanAlanAdlari: alanlar,
          ...(sirDegisti
            ? { istemciSirriSifreli: sifrele(dto.istemciSirri as string, `idp:${mevcut.id}`) }
            : {}),
          ...(kimlikDegisti ? { durum: 'TASLAK', zorunlu: false, sonHataKodu: null } : {}),
          ...(sirDegisti ? { sonSirUyarisiAt: null } : {}),
        },
      });
      if (kimlikDegisti) {
        await tx.dogrulanmisAlanAdi.deleteMany({ where: { saglayiciId: mevcut.id } });
      }
    });
    await this.olayYaz(k.firmaId, aktor, 'kurumsal-giris.kaydedildi', {
      sirDegisti,
      kimlikDegisti,
    });
    return { kaydedildi: true, durum: kimlikDegisti ? 'TASLAK' : mevcut.durum };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  ETKINLESTIRME / KAPATMA / SILME
  // ═════════════════════════════════════════════════════════════════════════

  async etkinlestir(k: Kimlik, dto: { jitKatilim: boolean; zorunlu: boolean }) {
    const s = await this.saglayiciAl(k);
    const alanlar = await this.prisma.dogrulanmisAlanAdi.findMany({
      where: { saglayiciId: s.id },
    });
    if (alanlar.length === 0 || s.durum === 'TASLAK') {
      throw new BadRequestException({
        kod: 'DOGRULANMADI',
        mesaj: 'Önce "Bağlantıyı sına" ile şirket hesabınızla girip alan adınızı doğrulayın.',
      });
    }
    if (dto.zorunlu) {
      // ⚠ R1-O3 (mutant #21) — KILITLENME KAPISI. Zorunluluk, e-posta alan
      // adi dogrulanmis olan herkesin parola yolunu kapatir. Sahip de o
      // alan adindaysa ve hesabi BAGLI DEGILSE, zorunlulugu acar acmaz
      // kendisi de disarida kalir. Alan adi FARKLI olan sahip (or. kisisel
      // adresle kayitli) zorunluluktan etkilenmez — ondan baglanmasi
      // ISTENMEZ, yoksa hic kuramazdi.
      const aktor = await this.aktorOku(k);
      const sahipAlani = alanAdiNormalize(epostaAlanAdi(epostaKucult(aktor.email)));
      const etkilenir = sahipAlani !== null && alanlar.some((a) => a.alanAdi === sahipAlani);
      if (etkilenir) {
        const bagli = await this.prisma.kullaniciDisKimlik.findFirst({
          where: { userId: aktor.id, saglayiciId: s.id },
        });
        if (!bagli) {
          throw new BadRequestException({
            kod: 'ONCE_HESABINIZI_BAGLAYIN',
            mesaj:
              'Zorunlu kılmadan önce kendi hesabınızı şirket hesabınıza bağlayın; ' +
              'aksi hâlde siz de giriş yapamazsınız. Profil → Şirket hesabı → "Şirket hesabımı bağla".',
          });
        }
      }
    }
    const aktor = await this.aktorOku(k);
    await this.prisma.firmaKimlikSaglayici.update({
      where: { id: s.id },
      data: { durum: 'ETKIN', jitKatilim: dto.jitKatilim, zorunlu: dto.zorunlu },
    });
    await this.olayYaz(k.firmaId, aktor, 'kurumsal-giris.etkinlestirildi', {
      jitKatilim: dto.jitKatilim,
      zorunlu: dto.zorunlu,
    });
    return { durum: 'ETKIN', jitKatilim: dto.jitKatilim, zorunlu: dto.zorunlu };
  }

  async kapat(k: Kimlik) {
    const s = await this.saglayiciAl(k);
    const aktor = await this.aktorOku(k);
    await this.prisma.firmaKimlikSaglayici.update({
      where: { id: s.id },
      data: { durum: 'KAPALI', zorunlu: false },
    });
    await this.olayYaz(k.firmaId, aktor, 'kurumsal-giris.kapatildi', {});
    const sifirlanan = await this.parolasizUyelereSifirlamaYolla(k.firmaId);
    return { durum: 'KAPALI', parolaSifirlamaGonderilen: sifirlanan };
  }

  async sil(k: Kimlik, onay: string) {
    if (onay !== 'SİL') {
      throw new BadRequestException({ kod: 'ONAY_GEREKLI', mesaj: 'Silmek için kutuya SİL yazın.' });
    }
    const s = await this.saglayiciAl(k);
    const aktor = await this.aktorOku(k);
    // ⚠ SIRA: once e-postalar HAZIRLANIR (uyeler okunur), sonra satir
    // silinir. Ters sirada, `saglayiciId` SetNull olduktan sonra kimin
    // parolasiz oldugu yine bulunur — ama olay kaydi firmasiz kalirdi.
    await this.prisma.firmaKimlikSaglayici.delete({ where: { id: s.id } });
    await this.olayYaz(k.firmaId, aktor, 'kurumsal-giris.silindi', {});
    const sifirlanan = await this.parolasizUyelereSifirlamaYolla(k.firmaId);
    return { silindi: true, parolaSifirlamaGonderilen: sifirlanan };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  UYENIN BAGLANTISINI KALDIRMA (R1-O3)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * `DELETE /firma/uyeler/:id/kurumsal-baglanti` — sahip, ayrilan ya da
   * telefonunu kaybeden bir uyenin sirket baglantisini kaldirabilir.
   *
   * ⚠ IKINCI KATMAN (F1b H6b deseni, R1-Y3): dekoratore ek olarak CAGIRANIN
   * rolu firma kilidinin ICINDE DB'den okunur. Es zamanli bir rol dusurmesi
   * dekoratorun okudugu token'i bayatlatabilir.
   */
  async uyeBaglantisiKaldir(k: Kimlik, hedefId: string) {
    return firmaKilitliIslem(this.prisma, k.firmaId, async (tx: any) => {
      const cagiran = await tx.user.findUnique({ where: { id: k.userId } });
      if (
        !cagiran ||
        cagiran.deletedAt ||
        cagiran.firmaId !== k.firmaId ||
        cagiran.firmaRol !== 'sahip'
      ) {
        throw new ForbiddenException({
          kod: 'FIRMA_SAHIBI_GEREKLI',
          mesaj: 'Bu işlemi yalnız firma sahibi yapabilir.',
        });
      }
      const hedef = await tx.user.findUnique({ where: { id: hedefId } });
      // ⚠ BASKA FIRMANIN KULLANICISI da 404: "var ama senin degil" demek
      // kullanici varligini sizdirirdi.
      if (!hedef || hedef.deletedAt || hedef.firmaId !== k.firmaId) {
        throw new NotFoundException({ kod: 'UYE_YOK', mesaj: 'Üye bulunamadı.' });
      }
      const kimlikler = await tx.kullaniciDisKimlik.findMany({ where: { userId: hedefId } });
      if (kimlikler.length === 0) {
        throw new NotFoundException({
          kod: 'BAGLANTI_YOK',
          mesaj: 'Bu üyenin bağlı bir şirket hesabı yok.',
        });
      }
      await tx.kullaniciDisKimlik.deleteMany({ where: { userId: hedefId } });
      await tx.firmaOlayi.create({
        data: {
          firmaId: k.firmaId,
          aktorId: cagiran.id,
          aktorEposta: cagiran.email,
          hedefKullaniciId: hedef.id,
          hedefEposta: hedef.email,
          tip: 'kurumsal-baglanti.kaldirildi',
        },
      });
      // ⚠ PAROLASIZ HEDEF DISARIDA KALIR: bagi kaldirilan kisinin BASKA
      // giris yolu yoktur. Parola belirleme baglantisi SART.
      if (hedef.parolaTanimli === false) {
        await this.sifirlamaYolla(hedef.email);
      }
      return { kaldirildi: true, parolaSifirlamaGonderildi: hedef.parolaTanimli === false };
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  YARDIMCILAR
  // ═════════════════════════════════════════════════════════════════════════

  private async saglayiciAl(k: Kimlik) {
    const s = await this.prisma.firmaKimlikSaglayici.findUnique({ where: { firmaId: k.firmaId } });
    if (!s) {
      throw new NotFoundException({ kod: 'SAGLAYICI_YOK', mesaj: 'Firmanızda şirket girişi tanımlı değil.' });
    }
    return s;
  }

  private async aktorOku(k: Kimlik): Promise<{ id: string; email: string }> {
    const u = await this.prisma.user.findUnique({
      where: { id: k.userId },
      select: { id: true, email: true },
    });
    if (!u) throw new NotFoundException({ kod: 'UYE_YOK', mesaj: 'Üye bulunamadı.' });
    return u;
  }

  /**
   * Sirket girisi kapatilinca/silinince parolasiz uyelerin TEK giris yolu
   * kapanir — her birine standart parola sifirlama baglantisi gider.
   * ⚠ IKINCI GONDERICI YOK: `ParolaServisi.sifirlamaIste` kullanilir.
   */
  private async parolasizUyelereSifirlamaYolla(firmaId: string): Promise<number> {
    const uyeler = await this.prisma.user.findMany({
      where: { firmaId, parolaTanimli: false, ...etkinHesapKosulu() },
      select: { email: true },
    });
    for (const u of uyeler) await this.sifirlamaYolla(u.email);
    return uyeler.length;
  }

  private async sifirlamaYolla(eposta: string): Promise<void> {
    try {
      await this.parola.sifirlamaIste(eposta);
    } catch (e) {
      this.logger.warn(
        `Parola belirleme baglantisi gonderilemedi (${eposta}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * ⚠ R1-D4 (mutant #31): `veri` yalniz KARAR bilgisini tasir. DTO'yu
   * oldugu gibi yazmak duz istemci sirrini denetim tablosuna dokerdi.
   */
  private async olayYaz(
    firmaId: string,
    aktor: { id: string; email: string },
    tip: string,
    veri: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.firmaOlayi.create({
      data: {
        firmaId,
        aktorId: aktor.id,
        aktorEposta: aktor.email,
        tip,
        veri: veri as never,
      },
    });
  }
}
