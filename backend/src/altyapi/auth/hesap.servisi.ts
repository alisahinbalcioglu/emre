import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../db/prisma.service';
import { SatinAlmaServisi } from '../../ozellik/odeme/abonelik/satinalma.servisi';
import { denemeEpostaAnahtari } from '../../ozellik/odeme/abonelik/deneme-hakki';
import {
  ayrilmaKarari,
  etkinHesapKosulu,
  firmaKilitliIslem,
  disKimlikleriSil,
  imhaTarihiHesapla,
  kapatmaVerisi,
  topluKapatmaVerisi,
  KAPATMA_SAKLAMA_GUN,
  type FirmaRol,
} from '../../ozellik/firma/uyelik-kurallari';
import { firmaRolaGoreSuz } from '../../ozellik/firma/firma-maskele';
import { EpostaServisi } from '../../ozellik/odeme/eposta/eposta.servisi';
import { trTarih } from '../../ozellik/odeme/abonelik/ceviri-kotasi';
import {
  kendiKapatmaEpostasi,
  firmaKapandiEpostasi,
} from './kapatma-epostalari';
import { yakinZamandaGirisMi } from './oturum.servisi';
import { PAROLA_HATALI_YANIT } from './parola-kurali';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HESAP HAKLARI — VERI INDIRME ve HESAP KAPATMA (FAZ 5.5 · KVKK m.11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠⚠ NEDEN AYRI SERVIS — `adminService.deleteUser` CAGRILAMAZ:
 *  O servis bir YONETICI ARACIDIR ve `kilitlenmeyiOnle` icinde
 *  `yonetici.id === hedefId` kontrolu yapip "Kendi hesabinizi silemezsiniz."
 *  firlatir. Yani bugunku kodda kullanicinin KENDI hesabini kapatmasi
 *  ACIKCA YASAKLANMIS bir islemdir. Faz 5.5'i "Faz 2 altyapisini kullanir"
 *  diye gecistirmek, tam da bu duvara toslardi.
 *
 *  ⚠⚠ IKI ISI AYIRIYORUZ (planin birlestirdigi yer):
 *    · HESAP KAPATMA  → `deletedAt` damgalanir. Giris kapanir, mevcut token
 *      gecersizlesir. VERI O ANDA SILINMEZ.
 *    · VERI IMHASI    → gercek silme/anonimlestirme. Plan 5.8'den beri VAR
 *      ama BU DOSYADA DEGIL: kapatma yalnizca `imhaTarihi` (kapatma ani +
 *      30 gun) damgalar; silmeyi gunluk imha isi yapar. Urun kullaniciya
 *      "verileriniz silindi" DEMEZ — o gun gelmedi. `deletedAt` damgalayip
 *      "sildik" demek KVKK'da silme degil, olsa olsa "islemeyi
 *      kisitlama"dir; ikisini ayni kelimeyle anlatmak yanlis beyandir.
 *
 *  ⚠⚠ E-POSTA ARTIK ANONIMLESMIYOR (K1, 21.09): musteri 30 gun boyunca AYNI
 *  adres ve parolayla girip paket secerek geri donebilmeli. Tek istisna
 *  `ekiptenCikarildi` — gerekce `uyelik-kurallari.ts` `kapatmaVerisi`nde.
 *  Bunun BILINEN sonucu: kapali bir adresle YENI hesap acilamaz ve o adres
 *  baska bir firmanin davetini kabul edemez (30 gun). Ikisi de ACIK mesajla
 *  reddedilir — sessiz `@unique` cakismasi DEGIL.
 *
 *  ⚠ ODEME KAPISI YOK — bu SINIFIN VARLIK SEBEBI:
 *  Mevcut disa aktarim uclarinin hepsi `@GerekliYetenek(CIKTI_INDIR)`
 *  tasiyor ve `CIKTI_INDIR` kisitli modda ACIK DEGIL (olculdu:
 *  `KISITLI_MODDA_ACIK` yalniz TEKLIF_GORUNTULE, KUTUPHANE_GORUNTULE,
 *  ABONELIK_YONET icerir). Yani odemesi geciken kullanici KENDI verisini
 *  indiremiyordu — bir KVKK hakki odeme durumuna bagimli olamaz.
 *  Bu servisin uclarina kapi KONMAZ; mevcut export uclarini kopyalayarak
 *  yeni uc yazan kisi dekoratoru de kopyalamasin diye burada yaziyor.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class HesapServisi {
  private readonly logger = new Logger(HesapServisi.name);

  constructor(
    private prisma: PrismaService,
    private satinAlma: SatinAlmaServisi,
    // §3.4 — kapatma bildirimi. `OdemeModule` zaten disa aciyor; ikinci bir
    // gonderici YOK (`eposta.servisi.ts` basligindaki kural).
    private eposta: EpostaServisi,
  ) {}

  /**
   * KVKK m.11 — "islenen verileri ogrenme" hakkinin urun karsiligi.
   *
   * ⚠ IKILI VERI DAHIL DEGIL ve bu ACIKCA SOYLENIR: teklife yuklenen
   * orijinal .xlsx dosyalari ile firma logosu ikili (binary) veridir; tek bir
   * JSON yanitina base64 olarak koymak, 10 teklifte bile onlarca MB'lik bir
   * govde uretir ve bellegi tek istekle tuketebilir. Bunun yerine her ikili
   * kaydin ADI, BOYUTU ve INDIRME ADRESI listelenir — dosyalar zaten
   * kullanicinin kendi ekranindan indirilebiliyor. Sessizce atlanmiyor,
   * yanitin `ikiliVeriler` alaninda sayiliyor.
   */
  async verileriDisaAktar(userId: string) {
    const kullanici = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, ad: true, soyad: true, telefon: true,
        role: true, tier: true, status: true, firmaRol: true,
        createdAt: true, emailVerified: true, passwordChangedAt: true,
        deletedAt: true, sozlesmeOnayiAt: true, sozlesmeSurumu: true,
        ticariIletiOnayiAt: true,
        // FAZ 7 F2b (§3.10): iki adimli girisin VARLIGI kisisel veridir.
        // ⚠ `mfaSirriSifreli` ve kurtarma kodu OZETLERI BURADA YOK ve
        // OLMAMALI: disa aktarim dosyasi kullanicinin bilgisayarinda,
        // e-postasinda, bulutunda dolasir — sirri oraya yazmak, sifreleyerek
        // kazandigimiz her seyi geri verirdi.
        mfaAcikAt: true, mfaKaynagi: true,
        // FAZ 7 F3b (§3.10): parolasiz hesap OLGUSU da kisisel veridir.
        parolaTanimli: true,
        firma: {
          select: {
            id: true, ad: true, unvan: true, yetkiliEposta: true,
            faturaEposta: true, vergiNo: true, vergiDairesi: true,
            tcKimlikNo: true, faturaAdresi: true, il: true, ilce: true,
            telefon: true, logoMime: true, createdAt: true,
          },
        },
      },
    });
    if (!kullanici) throw new UnauthorizedException();

    const firmaId = (kullanici.firma?.id ?? null) as string | null;
    // ── FAZ 7 F1b (§3.10): KVKK EKSENI FIRMA ROLUNE GORE ─────────────────
    // ⚠ Firmalar artik cok kisili. `firmaId` eksenli her sorgu, bir UYEYE
    // firmadaki DIGER kisilerin verisini verirdi — KVKK "kendi verisini
    // ogrenme" hakki baskasinin verisini almak DEGILDIR.
    const sahipMi = kullanici.firmaRol === 'sahip';

    // ⚠ `sheets` DAHIL: teklifin kendisi kullanicinin verisidir ve
    // tasinabilirlik hakkinin ASIL konusu odur. Ham .xlsx ise ikili — asagida
    // ayrica listeleniyor.
    const teklifler = firmaId
      ? await this.prisma.quote.findMany({
          // Uye YALNIZ kendi hazirladigi teklifleri alir.
          where: sahipMi ? { firmaId } : { firmaId, userId },
          select: {
            id: true, title: true, quoteNo: true, rev: true, durum: true,
            musteri: true, proje: true, hazirlayan: true, gecerlilik: true,
            displayCurrency: true, displayLanguage: true,
            createdAt: true, updatedAt: true,
            originalName: true,
            sheets: true,
            items: true,
          },
        })
      : [];

    const [formatlar, kutuphane, listeler, markaKutuphaneleri, iscilikFirmalari,
      abonelikler, aiKullanimi, dwgDosyalari, ceviriDuzeltmeleri, ceviriDuzeltmeOlaylari] = await Promise.all([
      this.prisma.quoteFormat.findMany({
        where: { userId },
        select: { id: true, name: true, fileName: true, isDefault: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.userLibrary.findMany({ where: { userId } }),
      this.prisma.libraryList.findMany({ where: { userId } }),
      this.prisma.userBrandLibrary.findMany({ where: { userId } }),
      this.prisma.laborFirm.findMany({ where: { userId } }),
      this.prisma.userSubscription.findMany({ where: { userId } }),
      this.prisma.aiUsageLog.findMany({ where: { userId } }),
      firmaId
        ? this.prisma.dwgDosya.findMany({
            where: sahipMi ? { firmaId } : { firmaId, olusturanId: userId },
          })
        : Promise.resolve([]),
      // Faz 6.9: firmanın çeviri sözlüğü + bu kullanıcının düzeltme olayları.
      // ⚠ AÇIK select, `ortakDeger` BİLEREK YOK (Revizyon 1, R1-B1): olaydaki ortak
      // katman karşılığı kişisel veri değildir ve başka firmaların ödediği
      // çeviridir — veri indirmesi "ücretsiz sözlük sorgusu" yolu olmamalı.
      firmaId
        ? this.prisma.ceviriDuzeltmesi.findMany({
            where: { firmaId },
            select: { id: true, hedefDil: true, kaynakMetin: true, ceviriMetni: true, olusturuldu: true, guncellendi: true },
          })
        : Promise.resolve([]),
      this.prisma.ceviriDuzeltmeOlayi.findMany({
        where: { userId },
        select: { id: true, tip: true, hedefDil: true, kaynakMetin: true, oncekiDeger: true, yeniDeger: true, olusturuldu: true },
      }),
    ]);

    // ⚠ Ticari kayitlar (fatura/odeme) DA kullanicinin verisidir; hesap
    // kapatilsa bile saklanmalari gereken sinifta oldugu icin AYRI baslikta
    // ve saklama gerekcesiyle birlikte veriliyor.
    // ⚠ TICARI KAYITLAR YALNIZ SAHIBE (§3.10): abonelik, odeme yontemi ve
    // faturalar FIRMANIN ticari kaydidir; uyeye verilmez.
    const ticari = firmaId && sahipMi
      ? await this.prisma.abonelik.findMany({
          where: { firmaId },
          select: {
            id: true, durum: true, erisimSonu: true, denemeSonu: true,
            odemeYontemi: true, paketSurumu: { select: { paket: { select: { ad: true, seviye: true } } } },
          },
        })
      : [];
    const faturalar = firmaId && sahipMi
      ? await this.prisma.fatura.findMany({
          where: { abonelik: { firmaId } },
          select: { id: true, durum: true, tutar: true, paraBirimi: true, olusturuldu: true },
        })
      : [];

    // ── FAZ 6.12a — DENEME KULLANIM KAYDI (yeni kisisel veri tablosu) ─────
    // Tablo hesap kapatmada SILINMEZ (amac: denemenin bir kez verilmesi), bu
    // yuzden "hakkimda ne tutuyorsunuz" cevabinda da GORUNMEK zorunda.
    // Kapsam KISIYE ait satirlar: bu hesabin actigi niyetler + e-posta
    // anahtari bu adresle eslesenler (ayni adresle kapatilmis eski hesap dahil).
    // ⚠ Telefonla ve firmayla eslesen satirlar BILEREK YOK: ortak ofis
    // telefonu ya da ayni firmadaki baska uyenin kaydi BASKA KISININ verisidir.
    const epostaAnahtari = denemeEpostaAnahtari(kullanici.email);
    const denemeKullanimKayitlari = await this.prisma.denemeKullanimi.findMany({
      where: {
        OR: [
          { kullaniciId: userId },
          ...(epostaAnahtari
            ? [{ epostaNormal: epostaAnahtari }, { formEpostaNormal: epostaAnahtari }]
            : []),
          // ⚠ FAZ 7 F1b — TASARIMDAN BILINCLI SAPMA (celiski raporlandi).
          // §3.10 tablosu "sahip: firmaId satirlari" diyordu. UYGULANMADI:
          // Faz 6.12a'da bu kapsam OLCULEREK disarida birakilmisti ve
          // gerekce hâlâ gecerli — `DenemeKullanimi` satirinda BASKA bir
          // uyenin sadelestirilmis e-postasi/telefonu olabilir; onu firma
          // sahibine vermek "kendi verisini ogrenme" hakki degil UCUNCU
          // KISININ verisinin ifsasi olurdu. Mevcut kapi (`test:deneme-hakki`
          // H2) bunu ACIKCA olcuyor. Karar Emre/avukatta (avukat notlari).
        ],
      },
      select: {
        id: true, kaynak: true, firmaId: true, epostaNormal: true,
        formEpostaNormal: true, telefonNormal: true, iyzicoMusteriKodu: true,
        olusturuldu: true,
      },
      orderBy: { olusturuldu: 'asc' },
    });

    // ── FAZ 6.4 — MESAFELI SATIS SOZLESMESI ONAYLARI ─────────────────────
    // Satin alma adiminda alinan onayin izi (zaman + onaylanan metin surumu)
    // kisisel veridir ve ispat amaciyla saklanir: "hakkimda ne tutuyorsunuz"
    // cevabinda GORUNMEK zorunda. Kapsam BU KISININ actigi niyetler
    // (`olusturanId`) — ayni firmadaki baska uyenin onayi BASKA KISININ
    // verisidir, firma bazli sorgu onu da dokerdi.
    // ⚠ `token` DISARIDA: iyzico oturum anahtaridir, kisisel veri degil ve
    // disa aktarilan dosyaya yazmak gereksiz bir sir sizintisi olurdu.
    const sozlesmeOnaylari = await this.prisma.abonelikBaslatma.findMany({
      where: { olusturanId: userId },
      select: {
        id: true, sozlesmeOnayiZamani: true, sozlesmeSurumu: true,
        durum: true, olusturuldu: true,
      },
      orderBy: { olusturuldu: 'asc' },
    });

    // ── FAZ 7 F1b (§3.10): FIRMA ISLEM KAYDI ─────────────────────────────
    // Sahip firma genelini gorur; uye YALNIZ kendisinin aktor ya da hedef
    // oldugu satirlari ("beni kim davet etti, kim rolumu degistirdi").
    const firmaOlaylari = firmaId
      ? await this.prisma.firmaOlayi.findMany({
          where: sahipMi
            ? { firmaId }
            : {
                firmaId,
                OR: [{ aktorId: userId }, { hedefKullaniciId: userId }],
              },
          orderBy: { olusturuldu: 'asc' },
          select: {
            id: true, tip: true, aktorEposta: true, hedefEposta: true,
            oncekiDeger: true, yeniDeger: true, veri: true, olusturuldu: true,
          },
        })
      : [];

    // FAZ 7 F2b: kurtarma kodlarinin SAYISI verilir, OZETLERI ASLA.
    // ⚠ MFA kapaliyken sorgu ATILMAZ: kod uretilmemis bir hesapta sonuc
    // zaten 0'dir ve dosya cikaran her kullaniciya bir sorgu daha bindirmek
    // gereksiz (`/auth/me`deki `mfaBilgisi` ile AYNI kural).
    const kalanKurtarmaKodu = kullanici.mfaAcikAt
      ? await this.prisma.mfaKurtarmaKodu.count({
          where: { userId, kullanildiAt: null },
        })
      : 0;

    // ── FAZ 7 F3b (§3.10): DIS KIMLIK KAYITLARI ─────────────────────────
    // ⚠ `subject` DAHIL: kisiyi sirketin kimlik saglayicisinda TEKIL olarak
    // tanimlayan degerdir, yani kisisel veridir ve "hakkimda ne tutuyorsunuz"
    // cevabinda yer almasi gerekir.
    // ⚠ SAGLAYICI SIRRI (istemci anahtari) BURADA YOK: o firmanin sirridir,
    // kisinin verisi degil — disa aktarim dosyasina yazmak onu her uyenin
    // indirebilecegi bir yere koyardi.
    const disKimlikler = await this.prisma.kullaniciDisKimlik.findMany({
      where: { userId },
      select: {
        issuer: true, subject: true, entraKiraciId: true, epostaAnlik: true,
        baglamaYolu: true, olusturuldu: true, sonGirisAt: true,
        saglayici: { select: { tip: true } },
      },
    });

    const ikiliVeriler: { tur: string; ad: string; bayt: number | null; indirmeAdresi: string }[] = [];
    for (const t of teklifler) {
      if (t.originalName) {
        ikiliVeriler.push({
          tur: 'teklif-orijinal-dosya',
          ad: t.originalName,
          bayt: null,
          indirmeAdresi: `/api/quotes/${t.id}/export-priced`,
        });
      }
    }
    if (kullanici.firma?.logoMime) {
      ikiliVeriler.push({
        tur: 'firma-logosu', ad: `logo (${kullanici.firma.logoMime})`,
        bayt: null, indirmeAdresi: '/api/firma/logo',
      });
    }

    return {
      aciklama:
        'KVKK m.11 kapsaminda, hesabinizla iliskili olarak sistemimizde tutulan ' +
        'verilerin makine-okunur disa aktarimidir.',
      olusturulma: new Date().toISOString(),
      kullanici: {
        ...kullanici,
        // ⚠ FAZ 7 F1b (§3.6): uyeye T.C. kimlik no ve yetkili e-posta gizli.
        // `tier` SAKLANAN degerdir ve BILEREK turetilmez: "hakkimda ne
        // tutuyorsunuz" cevabinda tutulan deger yazilir (2.12 notu).
        firma: firmaRolaGoreSuz(kullanici.firma, kullanici.firmaRol),
        // FAZ 7 F2b: SAYI, ozet DEGIL.
        mfa: {
          acikAt: kullanici.mfaAcikAt,
          kaynak: kullanici.mfaKaynagi,
          kalanKurtarmaKodu: kalanKurtarmaKodu,
        },
      },
      // FAZ 7 F3b: sirket hesabi baglantilari.
      kurumsalKimlikler: disKimlikler,
      teklifler,
      teklifFormatlari: formatlar,
      kutuphane,
      kutuphaneListeleri: listeler,
      markaKutuphaneleri,
      iscilikFirmalari,
      abonelikKayitlari: abonelikler,
      ticariAbonelikler: ticari,
      faturalar,
      denemeKullanimKayitlari,
      sozlesmeOnaylari,
      aiKullanimKayitlari: aiKullanimi,
      dwgDosyalari,
      ceviriDuzeltmeleri,
      ceviriDuzeltmeOlaylari,
      firmaIslemKayitlari: firmaOlaylari,
      ikiliVeriler,
      notlar: [
        'Ikili (binary) dosyalar bu dosyaya GOMULMEDI: orijinal Excel dosyalari ve ' +
          'firma logosu tek bir JSON govdesinde onlarca MB tutardi. Her birinin adi ve ' +
          'indirme adresi "ikiliVeriler" listesinde yer aliyor.',
        'Parolaniz burada YOKTUR ve hicbir yerde duz metin tutulmaz; yalnizca geri ' +
          'cevrilemez bir ozeti (bcrypt) saklanir.',
        '"passwordChangedAt" alani yalnizca parola degisimini DEGIL, oturumlarinizin ' +
          'guvenlik nedeniyle kapatildigi son ani gosterir (parola degisimi, iki adimli ' +
          'giris ayari, hesap islemleri).',
        'Iki adimli giris aciksa dogrulama uygulamanizla paylasilan gizli anahtar ' +
          'sunucumuzda sifrelenmis olarak saklanir ve bu dosyaya KONMAZ; kurtarma ' +
          'kodlarinizin yalniz geri cevrilemez ozeti tutulur, burada yalnizca kac ' +
          'kodunuzun kullanilmamis oldugu yazar.',
        'Fatura ve odeme kayitlari, hesabiniz kapatilsa bile vergi mevzuati geregi ' +
          'saklanir; bu nedenle ayri baslikta listelenmistir.',
        'Ceviri duzeltme olaylarinda ortak sozlugun o anki karsiligi yer almaz: o deger ' +
          'kisisel veriniz degildir, yalniz denetim izi olarak sistemde tutulur.',
        'Ücretsiz deneme kullanım kayıtları ("denemeKullanimKayitlari"), ücretsiz ' +
          'denemenin her firma ve kişi için bir kez verilebilmesi amacıyla hesabınız ' +
          'kapatılsa bile saklanır. E-posta adresiniz ve telefonunuz bu kayıtta ' +
          'karşılaştırma için sadeleştirilmiş biçimde durur.',
        ...(sahipMi
          ? []
          : [
              'Firma üyesi olarak bu dosyada yalnız sizin hazırladığınız teklifler ve ' +
                'sizin işlemleriniz vardır; firmanın ticari kayıtları (abonelik, ödeme, ' +
                'fatura) firma sahibinin dosyasındadır. Firmanın fatura kimliğinden ' +
                'T.C. kimlik numarası ve yetkili e-posta adresi size gösterilmez.',
            ]),
      ],
    };
  }

  /**
   * SELF-SERVIS HESAP KAPATMA.
   *
   * ⚠ PAROLA DOGRULAMASI ZORUNLU: calinmis bir token'la hesabin kapatilmasi
   * geri donusu olmayan bir zarardir (geri alma yolu YOK — olculdu:
   * `deletedAt`i null'a ceviren tek bir satir bile yok).
   *
   * ⚠ SON YONETICI KORUMASI: `admin.service.kilitlenmeyiOnle`nin ayni dali
   * burada da kosar. Yoksa tek yonetici kendi hesabini kapatip yonetim
   * panelini KALICI olarak erisilemez birakir.
   *
   * ⚠ ABONELIK IPTALI SART: olculdu — silme ile abonelik BAGLI DEGIL. Bu
   * cagri olmasa kullanicinin karti cekilmeye devam eder ve dunning
   * e-postalari `firma.faturaEposta` adresine gitmeyi surdururdu; o adres
   * `User.email` DEGIL, yani kullanici "hesabimi kapattim" dedikten sonra
   * baska bir adresten odeme uyarisi almaya devam ederdi.
   */
  async hesabiKapat(userId: string, parola: string, authAt: number | null = null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new UnauthorizedException();

    // ── FAZ 7 F3b (§5.11): PAROLASIZ HESAP ───────────────────────────────
    // Kurumsal girisle acilmis hesabin parolasi YOKTUR (`password` kimsenin
    // bilmedigi rastgele bir ozettir). Yerine "son 10 dakikada BIRINCIL
    // kimlik dogrulamasi yapildi" kaniti aranir.
    // ⚠ Kanit `authAt`tir, `iat` DEGIL (R1-Y1): MFA kurulum/kapatma taze
    // `iat`li token basar ama `authAt`i KOPYALAR. `iat` okunsaydi calinmis
    // bir token MFA uclarindan gecirilerek "tazelenir" ve hesabi kapatirdi
    // (K18c).
    if ((user as unknown as { parolaTanimli?: boolean }).parolaTanimli === false) {
      if (!yakinZamandaGirisMi(authAt, Math.floor(Date.now() / 1000))) {
        throw new BadRequestException({
          kod: 'YENIDEN_GIRIS_GEREKLI',
          mesaj:
            'Güvenlik için çıkış yapıp şirket hesabınızla yeniden girin, ' +
            'sonra 10 dakika içinde tekrar deneyin.',
        });
      }
    } else {
      const dogru = await bcrypt.compare(parola, user.password);
      // ⚠ 400 — 401 DEGIL (Gorunur kusurlar turu, t.16). Uc KORUMALI; token
      // gecerli, yalniz GOVDEDEKI parola yanlis. 401 donuldugu surece
      // `frontend/ortak/lib/api.ts` yakalayicisi token'i silip kullaniciyi
      // `/login`e atiyordu: hesabini kapatmak isteyen kisi parolayi yanlis
      // yazinca "hesabim kapandi mi, atildim mi?" belirsizligiyle disari
      // dusuyordu. Hemen yukaridaki YENIDEN_GIRIS_GEREKLI dali F3b'de ayni
      // karari zaten vermisti. Gerekce: `parola-kurali.ts` PAROLA_HATALI_YANIT.
      // ⚠ Hiz siniri BU KARARDAN BAGIMSIZ ve DURUYOR: auth.controller.ts:154
      // `@Throttle({ ttl: 900_000, limit: 5 })` guard katmanindadir, yanit
      // kodunu okumaz (parola-kapisi-test.ts C blogu olcer).
      if (!dogru) throw new BadRequestException(PAROLA_HATALI_YANIT);
    }

    if (user.role === 'admin') {
      const kalanAdmin = await this.prisma.user.count({
        where: { role: 'admin', deletedAt: null, NOT: { id: userId } },
      });
      if (kalanAdmin === 0) {
        throw new BadRequestException(
          'Sistemdeki son yoneticisiniz. Hesabinizi kapatmak yonetim panelini ' +
            'erisilemez birakirdi; once baska bir yonetici atayin.',
        );
      }
    }

    // ── FAZ 7 F1b (§3.8, R1/E-1 · R1-O5): AYRILMA IKIZI ──────────────────
    // ⚠ ESKI HAL YANLISTI: abonelik HER hesap kapatmada iptal ediliyordu.
    // Firmalar artik cok kisili: ucuncu uye hesabini kapatinca FIRMANIN
    // aboneligi iptal olurdu (olculdu, sahte Prisma ile). Yeni kural
    // `ayrilmaKarari` ile TEK yerde: iptal YALNIZ firmanin son hesabi
    // ayrilirken.
    //
    // ⚠ SIRA DEGISTI: onceden "once iptal, sonra kapat" idi. Hata YUTULDUGU
    // icin o sira hicbir koruma saglamiyordu — yalniz kilidi ve
    // transaction'i bir dis HTTP cagrisi boyunca actik tutuyordu. Artik
    // karar + yazma AYNI kilitte, iptal COMMIT'TEN SONRA.
    const simdi = new Date();
    // TEK `simdi`, TEK `imhaTarihi`: sahip ve uyeler AYNI tarihte imha
    // olur (§3.2). Ayri `new Date()` cagrilari milisaniye farkiyla iki
    // farkli imha gunu uretebilirdi.
    const imha = imhaTarihiHesapla(simdi);
    let kapatilanAdres = user.email;
    // Firma kapanisinda durdurulan uyeler — e-posta COMMIT'TEN SONRA gider.
    let durdurulanUyeler: { id: string; email: string }[] = [];

    const karar = user.firmaId
      ? await firmaKilitliIslem(this.prisma, user.firmaId, async (tx) => {
          // Kullaniciyi kilit icinde YENIDEN oku: rolu bu arada degismis
          // olabilir (es zamanli `rolDegistir`).
          const taze = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, firmaRol: true, deletedAt: true },
          });
          if (!taze || taze.deletedAt) throw new UnauthorizedException();
          kapatilanAdres = taze.email;
          const [digerHesap, digerEtkinSahip] = await Promise.all([
            // ⚠ BANLI HESAP DE SAYILIR (Emre'nin "tek kullanici" olcusu).
            tx.user.count({
              where: { firmaId: user.firmaId, deletedAt: null, NOT: { id: userId } },
            }),
            tx.user.count({
              where: {
                firmaId: user.firmaId, firmaRol: 'sahip',
                NOT: { id: userId }, ...etkinHesapKosulu(),
              },
            }),
          ]);
          const k = ayrilmaKarari({
            firmaRol: taze.firmaRol as FirmaRol,
            digerHesap,
            digerEtkinSahip,
            // ⚠ K2 — YALNIZ BU YOL firmayi kapatabilir. Yonetici silmesi ve
            // uye cikarma `firmayiKapatabilir` GECIRMEZ ve SON_SAHIP almaya
            // devam eder: panelde yanlis satira basmak bir firmayi
            // kapatamamali.
            firmayiKapatabilir: true,
          });
          if (!k.izin) {
            // ⚠ K2 SONRASI ULASILMAZ ama DURUYOR: `firmayiKapatabilir`
            // satiri bir gun silinirse (ya da kural degisirse) akis sessizce
            // devam edip firmayi sahipsiz birakmasin.
            throw new BadRequestException({
              kod: 'SON_SAHIP',
              mesaj:
                'Firmanın son sahibisiniz ve ekipte başka kişiler var. ' +
                'Önce Ekip sayfasından birini sahip yapın.',
            });
          }
          await tx.user.update({
            where: { id: userId },
            data: kapatmaVerisi(taze, simdi, 'kendi'),
          });
          // FAZ 7 F3b: kapatilan hesap sirket hesabiyla GERI ACILMAZ.
          await disKimlikleriSil(tx, userId);

          if (k.firmaKapaniyor) {
            // ── K2: FIRMA KAPANIYOR ─────────────────────────────────────
            // Geride kalan hesaplar (varsa) `firmaKapandi` ile durur.
            // ⚠ Once OKU sonra YAZ: e-posta gonderebilmek icin adresler
            // lazim ve `updateMany` guncelledigi satirlari DONDURMEZ.
            // ⚠ `deletedAt: null` KOSULU SART — zaten kapali bir uyenin
            // (`ekiptenCikarildi`) nedeni ve imha tarihi EZILMEMELI; aksi
            // halde odeme yapilinca o kisi de ekibe geri donerdi (§3.3.5).
            const kalanKosul = {
              firmaId: user.firmaId, deletedAt: null, NOT: { id: userId },
            };
            durdurulanUyeler = await tx.user.findMany({
              where: kalanKosul,
              select: { id: true, email: true },
            });
            if (durdurulanUyeler.length > 0) {
              await tx.user.updateMany({
                where: kalanKosul,
                // ⚠ `kapatmaVerisi` DEGIL `topluKapatmaVerisi`: kisiye bagli
                // alan (`kapatilanEposta`, anonim `email`) toplu yazmada
                // yazilamaz — zaten GEREKMEZ de, cunku `firmaKapandi`
                // yolunda e-posta hic degismiyor, satirin kendisi adresi
                // tasimaya devam ediyor.
                data: topluKapatmaVerisi(simdi, 'firmaKapandi'),
              });
              await tx.firmaOlayi.create({
                data: {
                  firmaId: user.firmaId, aktorId: userId,
                  aktorEposta: taze.email, tip: 'uye.firma-kapandi',
                  veri: { durdurulan: durdurulanUyeler.length } as never,
                },
              });
            }
            // ⚠ UYELERIN DIS KIMLIKLERI SILINMEZ (bilerek): sahip 30 gun
            // icinde geri acarsa uye sirket hesabiyla girmeye devam
            // edebilmeli. Giris zaten `deletedAt` ile kapali.
            await tx.firma.update({
              where: { id: user.firmaId },
              data: { imhaTarihi: imha },
            });
            // Kapanan firmaya katilim olmasin: bekleyen davetler AYNI
            // transaction'da iptal edilir.
            await tx.firmaDavet.updateMany({
              where: { firmaId: user.firmaId, kabulAt: null, iptalAt: null },
              data: { iptalAt: simdi, iptalEdenId: userId },
            });
            await tx.firmaOlayi.create({
              data: {
                firmaId: user.firmaId, aktorId: userId, aktorEposta: taze.email,
                tip: 'davet.otomatik-iptal',
              },
            });
          }
          await tx.firmaOlayi.create({
            data: {
              firmaId: user.firmaId,
              aktorId: userId,
              aktorEposta: taze.email,
              hedefKullaniciId: userId,
              hedefEposta: taze.email,
              tip: 'uye.ayrildi',
              veri: {
                abonelikIptal: k.firmaKapaniyor,
                firmaKapandi: k.firmaKapaniyor,
                durdurulanUye: durdurulanUyeler.length,
                imhaTarihi: imha.toISOString(),
              } as never,
            },
          });
          return k;
        })
      : await (async () => {
          // Firmasiz hesap (eski kayit): kilit anahtari yok, abonelik de yok.
          await this.prisma.user.update({
            where: { id: userId },
            data: kapatmaVerisi(user, simdi, 'kendi'),
          });
          await disKimlikleriSil(this.prisma, userId);
          return { izin: true as const, firmaKapaniyor: false };
        })();

    // ⚠ COMMIT'TEN SONRA ve KILIT DISINDA: iptal bir dis HTTP cagrisidir.
    // Hata YUTULUR ama LOGLANIR — abonelik servisi erisilemez diye
    // kullanicinin hesabini kapatamamasi kabul edilemez.
    if (karar.izin && karar.firmaKapaniyor && user.firmaId) {
      try {
        await this.satinAlma.iptalEt(user.firmaId, userId, 'hesap kapatma');
      } catch (e) {
        this.logger.error(
          `Hesap kapatilirken abonelik iptali BASARISIZ (firma ${user.firmaId}): ` +
            `${e instanceof Error ? e.message : String(e)} — ELLE IPTAL GEREKEBILIR.`,
        );
      }
    }

    // ── §3.4 KAPATMA E-POSTALARI — COMMIT'TEN SONRA, best-effort ────────
    // `gonder` (`gonderKritik` DEGIL): SMTP erisilemez diye kapatma geri
    // alinamaz. Hata YUTULMAZ, LOGLANIR (hafiza dersi: hata mesajini yutma).
    await this.kapatmaEpostasiGonder(
      kendiKapatmaEpostasi(kapatilanAdres, imha), kapatilanAdres,
    );
    for (const uye of durdurulanUyeler) {
      await this.kapatmaEpostasiGonder(
        firmaKapandiEpostasi(uye.email, imha), uye.email,
      );
    }

    const gun = trTarih(imha);
    return {
      mesaj:
        'Hesabınız kapatıldı. Oturumunuz sonlandırıldı ve varsa aboneliğiniz iptal edildi.',
      // ⚠ DURUSTLUK: "verileriniz silindi" DEMIYORUZ, cunku silinmedi —
      // 30 gun boyunca duruyor ve geri donus yolu ACIK (K1).
      veriNotu:
        `Geri dönebilmeniz için verilerinizi ${gun} tarihine kadar saklıyoruz: bu sürede ` +
        'aynı e-posta ve parolanızla giriş yapıp bir paket seçerek hesabınızı kaldığınız ' +
        'yerden açabilirsiniz. Bu tarihten sonra teklifleriniz, kütüphaneniz ve ' +
        'yüklediğiniz belgeler kalıcı olarak silinir. Fatura ve ödeme kayıtları yasal ' +
        'süre boyunca saklanır.',
      imhaTarihi: imha.toISOString(),
      // Ön yüz "ekibiniz de durduruldu" cümlesini BU SAYIDAN cizer.
      durdurulanUye: durdurulanUyeler.length,
    };
  }

  /**
   * KAPATMA ONIZLEMESI (§3.3.1 · §8.1) — profil ekranindaki onay metni.
   *
   * ⚠ NEDEN SUNUCUDAN: "son sahip miyim, firmam kapanacak mi" sorusunun
   * cevabi `ayrilmaKarari`dadir. On yuz ayni hesabi kendi basina yapsaydi
   * (uye say, sahip say, karsilastir) IKIZ bir kural olurdu ve gun gelir
   * ekran "firmanız kapanır" demeden firma kapanirdi (§3.3 "Tek kaynak").
   *
   * ⚠ KARAR NESNESI OLDUGU GIBI DONER, ozetlenmez: on yuz `karar.izin` ve
   * `karar.firmaKapaniyor` dallarini kendi metnine esler. Burada
   * `firmaKapanir: boolean` gibi bir OZET dondurmek, sunucunun uc dalini
   * ikiye indirip "firmanin son hesabi" ile "firma kapaniyor, N kisi
   * duruyor" hâllerini ayirt edilemez yapardi.
   *
   * ⚠ HICBIR SEY YAZMAZ. Sayim kilitsiz okunur: onay metni TAHMINDIR,
   * karar kapatma aninda kilit icinde YENIDEN verilir — onizleme bayatlasa
   * bile yanlis bir kapatma olmaz.
   */
  async kapatmaOnizlemesi(userId: string): Promise<{
    firmaVar: boolean;
    karar: ReturnType<typeof ayrilmaKarari>;
    digerHesap: number;
    saklamaGun: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firmaId: true, firmaRol: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException();
    if (!user.firmaId) {
      // Firmasiz (eski) kayit: `hesabiKapat` de bu dalda `ayrilmaKarari`yi
      // HIC cagirmaz. `firmaVar: false` on yuze "firma cumlelerinin
      // HICBIRINI yazma" der; karar alani yalniz sekil butunlugu icin dolu.
      return {
        firmaVar: false,
        karar: { izin: true, firmaKapaniyor: false },
        digerHesap: 0,
        saklamaGun: KAPATMA_SAKLAMA_GUN,
      };
    }
    const [digerHesap, digerEtkinSahip] = await Promise.all([
      this.prisma.user.count({
        where: { firmaId: user.firmaId, deletedAt: null, NOT: { id: userId } },
      }),
      this.prisma.user.count({
        where: {
          firmaId: user.firmaId, firmaRol: 'sahip',
          NOT: { id: userId }, ...etkinHesapKosulu(),
        },
      }),
    ]);
    return {
      firmaVar: true,
      // ⚠ `firmayiKapatabilir: true` — ONIZLEME, KAPATMANIN AYNI YOLUDUR.
      // Gecirilmezse onizleme `SON_SAHIP` (izin:false) der, kapatma ise
      // basarili olur: ekran "yapamazsiniz" derken islem calisir.
      karar: ayrilmaKarari({
        firmaRol: user.firmaRol as FirmaRol,
        digerHesap,
        digerEtkinSahip,
        firmayiKapatabilir: true,
      }),
      digerHesap,
      // On yuzdeki `SAKLAMA_GUN` ikizinin baglanacagi tek kaynak.
      saklamaGun: KAPATMA_SAKLAMA_GUN,
    };
  }

  /** Kapatma bildirimleri TEK yerden gider; hata yutulmaz, loglanir. */
  private async kapatmaEpostasiGonder(
    talep: Parameters<EpostaServisi['gonder']>[0],
    kime: string,
  ): Promise<void> {
    try {
      await this.eposta.gonder(talep);
    } catch (e) {
      this.logger.error(
        `Kapatma bildirimi GONDERILEMEDI (${kime}): ` +
          `${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
