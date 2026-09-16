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
 *      gecersizlesir. VERI SILINMEZ.
 *    · VERI IMHASI    → gercek silme/anonimlestirme. BU TURDA YAPILMADI ve
 *      urun de kullaniciya "verileriniz silindi" DEMEZ. `deletedAt`
 *      damgalayip "sildik" demek KVKK'da silme degil, olsa olsa "islemeyi
 *      kisitlama"dir; ikisini ayni kelimeyle anlatmak yanlis beyandir.
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

    // ⚠ `sheets` DAHIL: teklifin kendisi kullanicinin verisidir ve
    // tasinabilirlik hakkinin ASIL konusu odur. Ham .xlsx ise ikili — asagida
    // ayrica listeleniyor.
    const teklifler = firmaId
      ? await this.prisma.quote.findMany({
          where: { firmaId },
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
      firmaId ? this.prisma.dwgDosya.findMany({ where: { firmaId } }) : Promise.resolve([]),
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
    const ticari = firmaId
      ? await this.prisma.abonelik.findMany({
          where: { firmaId },
          select: {
            id: true, durum: true, erisimSonu: true, denemeSonu: true,
            odemeYontemi: true, paketSurumu: { select: { paket: { select: { ad: true, seviye: true } } } },
          },
        })
      : [];
    const faturalar = firmaId
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
      kullanici,
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
      ikiliVeriler,
      notlar: [
        'Ikili (binary) dosyalar bu dosyaya GOMULMEDI: orijinal Excel dosyalari ve ' +
          'firma logosu tek bir JSON govdesinde onlarca MB tutardi. Her birinin adi ve ' +
          'indirme adresi "ikiliVeriler" listesinde yer aliyor.',
        'Parolaniz burada YOKTUR ve hicbir yerde duz metin tutulmaz; yalnizca geri ' +
          'cevrilemez bir ozeti (bcrypt) saklanir.',
        'Fatura ve odeme kayitlari, hesabiniz kapatilsa bile vergi mevzuati geregi ' +
          'saklanir; bu nedenle ayri baslikta listelenmistir.',
        'Ceviri duzeltme olaylarinda ortak sozlugun o anki karsiligi yer almaz: o deger ' +
          'kisisel veriniz degildir, yalniz denetim izi olarak sistemde tutulur.',
        'Ücretsiz deneme kullanım kayıtları ("denemeKullanimKayitlari"), ücretsiz ' +
          'denemenin her firma ve kişi için bir kez verilebilmesi amacıyla hesabınız ' +
          'kapatılsa bile saklanır. E-posta adresiniz ve telefonunuz bu kayıtta ' +
          'karşılaştırma için sadeleştirilmiş biçimde durur.',
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
  async hesabiKapat(userId: string, parola: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new UnauthorizedException();

    const dogru = await bcrypt.compare(parola, user.password);
    if (!dogru) throw new UnauthorizedException('Parolaniz hatali.');

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

    // Abonelik iptali ONCE denenir: hesap kapandiktan sonra denemek, hata
    // durumunda kullaniciyi "hesabi kapali ama karti cekiliyor" durumunda
    // birakirdi. Hata YUTULUR ama LOGLANIR — abonelik servisi erisilemez
    // diye kullanicinin hesabini kapatamamasi da kabul edilemez.
    if (user.firmaId) {
      try {
        await this.satinAlma.iptalEt(user.firmaId, userId, 'hesap kapatma');
      } catch (e) {
        this.logger.error(
          `Hesap kapatilirken abonelik iptali BASARISIZ (firma ${user.firmaId}): ` +
            `${e instanceof Error ? e.message : String(e)} — ELLE IPTAL GEREKEBILIR.`,
        );
      }
    }

    const simdi = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: simdi,
        // ⚠ Mevcut token'i da oldurur: `jwt.strategy`teki `iat` kapisi bu
        // damgadan ONCE imzalanmis her token'i reddeder. `deletedAt` kapisi
        // zaten var ama ikisi birlikte, kapatmayi ANINDA etkili kilar.
        passwordChangedAt: simdi,
        // E-posta serbest birakilir (bkz. sema notu): adres `kapatilanEposta`ya
        // tasinir, `email` anonimlesir. `.invalid` RFC 2606 ile ayrilmis bir
        // TLD'dir — gercek bir adrese carpma ihtimali YOKTUR.
        kapatilanEposta: user.email,
        email: `kapali-${user.id}@metapricex.invalid`,
      },
    });

    return {
      mesaj:
        'Hesabiniz kapatildi. Oturumunuz sonlandirildi ve varsa aboneliginiz iptal edildi. ' +
        'Ayni e-posta adresiyle yeniden kayit olabilirsiniz.',
      // ⚠ DURUSTLUK: "verileriniz silindi" DEMIYORUZ, cunku silinmedi.
      veriNotu:
        'Teklifleriniz ve kutuphaneniz sistemde kalmaya devam eder; erisim kapatilmistir. ' +
        'Verilerinizin tamamen imhasini istiyorsaniz bu talebi ayrica iletmeniz gerekir.',
    };
  }
}
