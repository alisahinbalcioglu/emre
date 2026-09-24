import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikDurumu, KapatmaNedeni, Prisma } from '@prisma/client';
import { IyzicoClient, IyzicoAbonelikDetayi } from '../iyzico/iyzico.client';
// Saf modul (Prisma/Nest bilmez) — dongusel import YOK.
import { iyzicoTarihi } from './paket-degisimi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Abonelik durum makinesi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Geçerli geçişler:
 *
 *      DENEME ──ödeme başarılı──────────────► AKTIF
 *         ├────ilk tahsilat başarısız──────► ODEME_BEKLIYOR  (Faz 6.12a)
 *         └────süre doldu──────────────────► SONA_ERDI
 *
 *      AKTIF ──tahsilat başarısız──────────► ODEME_BEKLIYOR
 *        └───müşteri iptal──────────────────► IPTAL
 *
 *      ODEME_BEKLIYOR ──tahsilat başarılı──► AKTIF
 *                     └──tolerans doldu────► KISITLI
 *
 *      KISITLI ──tahsilat başarılı─────────► AKTIF
 *              └──kısıt süresi doldu───────► ASKIDA
 *
 *      ASKIDA ──tahsilat başarılı──────────► AKTIF
 *             └──160 gün / iyzico EXPIRED──► SONA_ERDI
 *
 *      IPTAL ──dönem sonu──────────────────► SONA_ERDI
 *            └──müşteri vazgeçti───────────► AKTIF
 *
 *  Her geçiş AbonelikOlayi tablosuna yazılır. Bir müşteri "ben ödedim ama
 *  hesabım kapandı" dediğinde tek bakılacak yer orasıdır.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ⚠ FAZ 6.12a (15.09) — DENEME → ODEME_BEKLIYOR EKSIKTI. Olculen zincir:
// deneme sonu kart reddi → `tahsilatBasarisiz` DENEME satirinda
// ODEME_BEKLIYOR istiyor → GecersizGecisHatasi → `ilkBasarisizlik` HIC
// yazilmiyor, dunning ilk bildirimine ulasilmiyor, webhook olayi 5 kez dusup
// kaliyor, gece mutabakati iyzico UNPAID'ini de "gecersiz gecis" diye
// atliyordu. Satir DENEME kaliyor, `erisimSonu`nda SONA_ERDI oluyor ve satin
// alma kapisi SONA_ERDI'yi gecirdigi icin firma YENI deneme aliyordu (32
// gunluk sonsuz dongu, iptal bile gerekmeden). Denemesi biten HICBIR firmaya
// hatirlatma ya da yeniden tahsilat denemesi gitmiyordu.
const GECERLI_GECISLER: Record<AbonelikDurumu, AbonelikDurumu[]> = {
  DENEME: ['AKTIF', 'ODEME_BEKLIYOR', 'SONA_ERDI', 'IPTAL'] as AbonelikDurumu[],
  AKTIF: ['ODEME_BEKLIYOR', 'IPTAL', 'SONA_ERDI'] as AbonelikDurumu[],
  ODEME_BEKLIYOR: ['AKTIF', 'KISITLI', 'IPTAL', 'SONA_ERDI'] as AbonelikDurumu[],
  KISITLI: ['AKTIF', 'ASKIDA', 'IPTAL', 'SONA_ERDI'] as AbonelikDurumu[],
  ASKIDA: ['AKTIF', 'SONA_ERDI'] as AbonelikDurumu[],
  IPTAL: ['AKTIF', 'SONA_ERDI'] as AbonelikDurumu[],
  SONA_ERDI: ['AKTIF'] as AbonelikDurumu[], // yeniden abone olabilir
};

export class GecersizGecisHatasi extends Error {
  constructor(onceki: AbonelikDurumu, yeni: AbonelikDurumu) {
    super(`Geçersiz abonelik geçişi: ${onceki} → ${yeni}`);
    this.name = 'GecersizGecisHatasi';
  }
}

/** iyzico durumunun bizim durumumuza etkisi. */
export function iyzicoDurumunuYorumla(
  iyzico: IyzicoAbonelikDetayi['subscriptionStatus'],
): AbonelikDurumu | null {
  switch (iyzico) {
    case 'ACTIVE':
      // ⚠ ACTIVE tahsilat KANITI DEĞİL: iyzico'da TRIAL durumu yok, deneme
      // içindeki abonelik de ACTIVE görünür (resmî doküman; denemeli abonelik
      // sandbox'ta ölçülmedi). DENEME satırı için mutabakatın bu değeri nasıl
      // sınırladığı: mutabakat.job.ts → `denemeSuruyorMu`.
      return AbonelikDurumu.AKTIF;
    case 'CANCELED':
      return AbonelikDurumu.IPTAL;
    case 'EXPIRED':
      return AbonelikDurumu.SONA_ERDI;
    case 'UNPAID':
      // Bizim tarafta doğrudan KISITLI demiyoruz — tolerans süresini
      // biz yönetiyoruz. Yalnızca "ödeme sorunu var" bilgisini alıyoruz.
      return AbonelikDurumu.ODEME_BEKLIYOR;
    case 'PENDING':
    case 'UPGRADED':
      return null; // durumu değiştirmez
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   §4.6 — ODEME BASARILI OLUNCA HESAP GERI ACILIR (plan 5.8, K1/K2)
   ═══════════════════════════════════════════════════════════════════════════

   Kapatilan hesabin 30 gun icinde geri donmesinin TEK yolu paket satin
   almaktir. Odeme gecince kapatma izleri silinir:

     `User.deletedAt` · `User.imhaTarihi` · `User.kapatmaNedeni` · `Firma.imhaTarihi`

   ── KIM GERI GELIR: KAPALI LISTE ───────────────────────────────────────────
   Yalnizca asagidaki iki neden. Liste ACIK degil (`!== 'ekiptenCikarildi'`
   gibi bir NEGATIF suzgec YAZILMAZ): semaya yarin yeni bir kapatma nedeni
   eklenirse negatif suzgec onu SESSIZCE geri acardi.

     · `kendi`        → geri donen musterinin KENDISI. Giris acik, odeyen o.
     · `firmaKapandi` → son sahip kapattigi icin durdurulan uye (brief §3.3.5:
                        "sahip geri acinca uyeler KENDILIGINDEN geri gelir").

   GELMEYENLER ve NEDENI:
     · `ekiptenCikarildi` — brief §3.3.5 ACIKCA "gelmez" diyor. Sahip onu
       ekipten cikardi; ayrica K1 istisnasi geregi e-postasi HEMEN serbest
       birakildi, baska bir firmaya katilmis olabilir. Geri acmak onu iki
       firmada birden gosterirdi. ⚠ `kapatmaVerisi` bugun `firmaId`yi
       TEMIZLEMIYOR (olculdu: uyelik-kurallari.ts:166-180), yani satir hala
       bu firmada gorunuyor — koruma YALNIZ bu kapali listedir.
     · `yonetici` — yonetici mudahalesi bir cezadir; parayla geri alinmaz.
     · `kapatmaNedeni = null` — bu turdan ONCE kapanmis hesap (olculdu 21.09:
       canlida 0 kapali hesap). Hangi yoldan kapandigi BILINMEDIGI icin
       tahmin yurutulmez.

   ── DOKUNULMAYANLAR (bilincli) ─────────────────────────────────────────────
   · `passwordChangedAt` — kapatma bunu `simdi` yapip elindeki token'i oldurur
     (jwt.strategy `iat` kapisi). GERI ALINMAZ: tarihi geri cekmek kapatmadan
     ONCE uretilmis token'lari YENIDEN GECERLI kilardi.
   · `email` / `kapatilanEposta` — K1 geregi kapatma artik `kendi`,
     `yonetici` ve `firmaKapandi` yollarinda e-postayi YERINDE birakiyor
     (A'nin isi), yani geri acmada yapilacak bir sey yok. Ayrica `email`
     @unique: adres bu arada baskasina gitmisse geri yazma TAHSILAT
     ALINDIKTAN SONRA transaction'i patlatirdi.
   · `status` (`active`/`banned`) — yonetici yasagi, kapatmayla ilgisiz.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Odeme ile geri acilan kapatma nedenleri — KAPALI liste, bkz. ustteki not. */
export const GERI_ACILAN_KAPATMA_NEDENLERI: KapatmaNedeni[] = [
  KapatmaNedeni.kendi,
  KapatmaNedeni.firmaKapandi,
];

/** Geri acma sonucu — olay kaydina ve gunluge SAYI olarak yazilir. */
export interface GeriAcmaSonucu {
  /** `Firma.imhaTarihi` temizlendi mi (firma gercekten kapaliydi). */
  firmaAcildi: boolean;
  /** `deletedAt`/`imhaTarihi`/`kapatmaNedeni` temizlenen kullanici sayisi. */
  acilanKullanici: number;
  /** Kapali listede OLMADIGI icin kapali birakilan kullanici sayisi. */
  atlananKullanici: number;
}

/** Hicbir sey degismedi mi? (idempotent cagrilarda olay yazilmasin). */
export function geriAcmaBosMu(s: GeriAcmaSonucu): boolean {
  return !s.firmaAcildi && s.acilanKullanici === 0;
}

@Injectable()
export class AbonelikServisi {
  private readonly logger = new Logger(AbonelikServisi.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly iyzico: IyzicoClient,
  ) {}

  gecisGecerliMi(onceki: AbonelikDurumu, yeni: AbonelikDurumu): boolean {
    if (onceki === yeni) return true;
    return GECERLI_GECISLER[onceki]?.includes(yeni) ?? false;
  }

  /**
   * Durumu değiştirir ve olay günlüğüne yazar.
   * Geçersiz geçişte hata fırlatır — sessizce yutmaz.
   */
  async durumDegistir(
    abonelikId: string,
    yeniDurum: AbonelikDurumu,
    p: {
      aciklama?: string;
      aktor?: string;
      veri?: Prisma.InputJsonValue;
      erisimSonu?: Date;
      /** Dunning sayaçlarını sıfırla (başarılı tahsilatta). */
      sayaclariSifirla?: boolean;
      tx?: Prisma.TransactionClient;
    } = {},
  ) {
    // Prisma.TransactionClient ile PrismaService aynı model yüzeyini paylaşır.
    const db = (p.tx ?? this.prisma) as PrismaService;
    const mevcut = await db.abonelik.findUniqueOrThrow({
      where: { id: abonelikId },
    });

    if (!this.gecisGecerliMi(mevcut.durum, yeniDurum)) {
      throw new GecersizGecisHatasi(mevcut.durum, yeniDurum);
    }

    const guncel = await db.abonelik.update({
      where: { id: abonelikId },
      data: {
        durum: yeniDurum,
        ...(p.erisimSonu ? { erisimSonu: p.erisimSonu } : {}),
        ...(p.sayaclariSifirla
          ? {
              ilkBasarisizlik: null,
              denemeSayisi: 0,
              sonDeneme: null,
              kisitlandi: null,
            }
          : {}),
      },
    });

    await db.abonelikOlayi.create({
      data: {
        abonelikId,
        tip: 'durum.degisti',
        oncekiDurum: mevcut.durum,
        yeniDurum,
        aciklama: p.aciklama,
        veri: p.veri,
        aktor: p.aktor ?? 'sistem',
      },
    });

    this.logger.log(
      `Abonelik ${abonelikId}: ${mevcut.durum} → ${yeniDurum}` +
        (p.aciklama ? ` (${p.aciklama})` : ''),
    );
    return guncel;
  }

  /**
   * §4.6 — ODEME BASARILI: firmayi ve uyelerini geri acar.
   *
   * TEK KAYNAK. Uc odeme yolu da buraya gelir; ikinci bir "geri acma"
   * yazilmaz (bu depoda ikiz kural olculmus bir hata sinifi):
   *   1. KART      — satinalma.servisi: abonelik acildiktan hemen sonra
   *   2. HAVALE    — `erisimiUzat` (havale.servisi.odemeyiOnayla → buradan)
   *   3. YENILEME  — `tahsilatBasarili` (webhook): kapaliyken cekim gectiyse
   *                  musteri PARA ODEMISTIR, erisim acilmak ZORUNDADIR.
   *
   * IDEMPOTENT: acik hesapta hicbir satira dokunmaz, olay da yazmaz
   * (`updateMany` + `where` suzgeci sifir satir gunceller). Ayni odeme
   * yolunun iki kez tetiklenmesi (donus POST'u + kurtarma taramasi) gurultu
   * uretmez.
   *
   * ⚠ HATA YUTULMAZ ama TAHSILATI DA DUSURMEZ: cagiran taraf `catch` ile
   * gunluge yazip devam eder — parasi alinmis musterinin aboneligi yarim
   * birakilamaz. Yarim kalirsa musteri girise kadar gelir ve ayni odeme
   * yolunun ikinci tetiklemesi ya da yonetici mudahalesi tamamlar.
   */
  async firmayiGeriAc(
    firmaId: string,
    p: {
      aktor: string;
      aciklama: string;
      /** Verilirse `AbonelikOlayi`na SAYI ozeti yazilir (icerik DEGIL). */
      abonelikId?: string;
      tx?: Prisma.TransactionClient;
    },
  ): Promise<GeriAcmaSonucu> {
    const calistir = async (
      db: Prisma.TransactionClient | PrismaService,
    ): Promise<GeriAcmaSonucu> => {
      const firma = await db.firma.updateMany({
        where: { id: firmaId, imhaTarihi: { not: null } },
        data: { imhaTarihi: null },
      });

      const acilan = await db.user.updateMany({
        where: {
          firmaId,
          deletedAt: { not: null },
          kapatmaNedeni: { in: GERI_ACILAN_KAPATMA_NEDENLERI },
        },
        data: { deletedAt: null, imhaTarihi: null, kapatmaNedeni: null },
      });

      // Kapali kalanlar: `ekiptenCikarildi` · `yonetici` · nedeni bilinmeyen.
      // ⚠ `kapatmaNedeni: null` AYRI dal olarak yazildi: SQL'de
      // `NOT (x IN (...))` NULL icin UNKNOWN doner ve satir DUSER — bu turdan
      // once kapanmis hesaplar (nedeni bos) sayimdan sessizce kaybolurdu.
      // Sayi yalnizca tanidir ama YANLIS tani, taninin olmamasindan kotudur.
      const atlanan = await db.user.count({
        where: {
          firmaId,
          deletedAt: { not: null },
          OR: [
            { kapatmaNedeni: null },
            { NOT: { kapatmaNedeni: { in: GERI_ACILAN_KAPATMA_NEDENLERI } } },
          ],
        },
      });

      return {
        firmaAcildi: firma.count > 0,
        acilanKullanici: acilan.count,
        atlananKullanici: atlanan,
      };
    };

    // Cagiran transaction verdiyse ONUN icinde kal (havale yolu: erisim
    // uzatma ile geri acma ayni islemde olmali). Vermediyse kendi
    // transaction'imizi acariz — yarim geri acma birakmayalim.
    const sonuc = p.tx
      ? await calistir(p.tx)
      : await this.prisma.$transaction((tx) => calistir(tx));

    if (geriAcmaBosMu(sonuc)) return sonuc;

    this.logger.log(
      `Hesap geri acildi: firma=${firmaId} firmaAcildi=${sonuc.firmaAcildi} ` +
        `acilanKullanici=${sonuc.acilanKullanici} atlanan=${sonuc.atlananKullanici} (${p.aciklama})`,
    );

    if (p.abonelikId) {
      const db = (p.tx ?? this.prisma) as PrismaService;
      await db.abonelikOlayi.create({
        data: {
          abonelikId: p.abonelikId,
          tip: 'hesap.geri.acildi',
          aciklama: p.aciklama,
          // ⚠ ICERIK DEGIL SAYI: kimin geri geldigi kisisel veridir.
          veri: {
            firmaAcildi: sonuc.firmaAcildi,
            acilanKullanici: sonuc.acilanKullanici,
            atlananKullanici: sonuc.atlananKullanici,
          },
          aktor: p.aktor,
        },
      });
    }
    return sonuc;
  }

  /** Yalnızca günlüğe yazar, durum değiştirmez. */
  async olayYaz(
    abonelikId: string,
    tip: string,
    p: { aciklama?: string; veri?: Prisma.InputJsonValue; aktor?: string } = {},
  ) {
    return this.prisma.abonelikOlayi.create({
      data: {
        abonelikId,
        tip,
        aciklama: p.aciklama,
        veri: p.veri,
        aktor: p.aktor ?? 'sistem',
      },
    });
  }

  // ── Webhook'tan gelen başarılı tahsilat ─────────────────────────────────
  /**
   * Webhook gövdesinde tutar ve dönem YOK — yalnızca referans kodları var.
   * Bu yüzden dönem sonunu öğrenmek için iyzico'ya sormak zorundayız.
   */
  /**
   * ═════════════════════════════════════════════════════════════════════
   *  ZINCIR COZUCU — webhook kodunu aboneligimize baglar
   * ═════════════════════════════════════════════════════════════════════
   *
   *  ⚠ NEDEN DUZ `findUnique` YETMEZ (olculmus davranis):
   *  Paket degisiminde (upgrade/downgrade) iyzico YENI bir
   *  subscriptionReferenceCode uretir; yeni kayit eskisine
   *  `parentReferenceCode` ile baglanir, eski kayit UPGRADED durumuna
   *  duser ve terminal olur. Kaynak: docs/RAPOR_ADIM0_iyzico_Sandbox.md
   *  (20.08) — "201402 yukseltilemez / 201403 iptal edilemez" hatalari
   *  sandbox'ta olculmus.
   *
   *  Yani plan degisiminden SONRAKI her webhook YENI kodla gelir. Duz
   *  esleme onu bulamaz, olay "bilinmeyen abonelik kodu" diye yutulur ve
   *  MUSTERI ODEDIGI HALDE aboneligi guncellenmez. Raporun kendi cumlesi:
   *  "webhook eslemesi zincir koküyle yapilmali."
   *
   *  UC KADEMELI ARAMA:
   *    1. Guncel uc      — `iyzicoAbonelikKodu` birebir
   *    2. Zincir koku    — daha once kaydedilmis `iyzicoKokKodu`
   *    3. iyzico'ya SOR  — `parentReferenceCode` zincirini yukari yuru
   *
   *  3. kademe KENDINI ONARIR: zincirden bulunan abonelikte guncel kod
   *  yazilir, kok kodu sabitlenir. Boylece ayni abonelik icin bir daha
   *  iyzico'ya sorulmaz — degisim uygulamamiz DISINDA (iyzico panelinden)
   *  yapilmis olsa bile sistem kendi kendine hizalanir.
   */
  private async aboneligiKodlaBul(abonelikKodu: string) {
    // 1. Guncel uc
    const dogrudan = await this.prisma.abonelik.findUnique({
      where: { iyzicoAbonelikKodu: abonelikKodu },
      include: { paketSurumu: true },
    });
    if (dogrudan) return dogrudan;

    // 2. Zincir koku (daha once bir degisim yasanmis ve kok kaydedilmis)
    const koktenn = await this.prisma.abonelik.findFirst({
      where: { iyzicoKokKodu: abonelikKodu },
      include: { paketSurumu: true },
    });
    if (koktenn) return koktenn;

    // 3. iyzico'ya sor: bu kodun atasi kim?
    //    Zincir uzun olabilir (art arda plan degisimleri) — sinirli
    //    derinlikte yukari yururuz; sonsuz dongu riski alinmaz.
    let kod: string | undefined = abonelikKodu;
    // Webhook'un KENDI aboneliginin iyzico durumu (ilk adimda okunur).
    let webhookDurumu: string | undefined;
    for (let adim = 0; adim < 5 && kod; adim++) {
      let detay: Awaited<ReturnType<IyzicoClient['abonelikGetir']>>;
      try {
        detay = await this.iyzico.abonelikGetir(kod);
      } catch (e) {
        this.logger.warn(
          `Zincir cozulemedi (${kod}): ${e instanceof Error ? e.message : e}`,
        );
        return null;
      }
      if (adim === 0) webhookDurumu = detay?.subscriptionStatus;
      const ata = detay?.parentReferenceCode;
      if (!ata) break;

      const bulunan = await this.prisma.abonelik.findFirst({
        where: {
          OR: [{ iyzicoAbonelikKodu: ata }, { iyzicoKokKodu: ata }],
        },
        include: { paketSurumu: true },
      });
      if (bulunan && webhookDurumu === 'UPGRADED') {
        // ⚠ 23.09 — WEBHOOK ESKI BIR HALKADAN: onun aboneligi iyzico'da
        // UPGRADED (terminal). Paket degisimi artik uygulamadan yapiliyor ve
        // zincirde ARA halkalar olusuyor (kok → uc1 → uc2); uc1'in bir
        // siparisi icin GEC gelen webhook (iyzico ~45 dk tekrarlar) buraya
        // duser. Eski kod guncel ucun USTUNE yazilsaydi iptal ve mutabakat
        // terminal koda baglanirdi (iptal 201403 ile patlar).
        //
        // ⚠ KARAR iyzico'nun DURUMUNDAN, zincirdeki KONUMDAN degil (inceleme
        // bulgusu 5): `parentReferenceCode`un dogrudan ata mi yoksa HEP kok mu
        // oldugu OLCULMEDI (20.08'de tek adim olculdu; rapor ona "zincirin
        // sabiti" diyor). Konumdan karar veren ilk yazim, kok-semantiginde
        // YENI ucu de "eski" sanip onarimi kapatiyordu. Durum iki semantikte
        // de dogru: canli uc UPGRADED DEGILDIR.
        this.logger.warn(
          `Zincir: ${abonelikKodu} iyzico'da UPGRADED (eski halka); guncel uc ` +
            `${bulunan.iyzicoAbonelikKodu} KORUNDU`,
        );
        return bulunan;
      }
      if (bulunan) {
        // KENDINI ONARMA: guncel ucu yaz, kokU sabitle. Webhook'un aboneligi
        // iyzico'da UPGRADED DEGIL — yani zincirin CANLI ucu (uygulama
        // disinda, ya da yerel yazmasi kaybolan bir degisimle olusmus).
        const guncel = await this.prisma.abonelik.update({
          where: { id: bulunan.id },
          data: {
            iyzicoAbonelikKodu: abonelikKodu,
            iyzicoKokKodu: bulunan.iyzicoKokKodu ?? ata,
          },
          include: { paketSurumu: true },
        });
        await this.prisma.abonelikOlayi.create({
          data: {
            abonelikId: guncel.id,
            tip: 'iyzico.zincir.hizalandi',
            aciklama:
              `Plan degisimi sonrasi yeni abonelik kodu baglandi: ` +
              `${bulunan.iyzicoAbonelikKodu} → ${abonelikKodu}`,
            aktor: 'webhook',
          },
        });
        this.logger.warn(
          `Zincir hizalandi: ${bulunan.iyzicoAbonelikKodu} → ${abonelikKodu}`,
        );
        return guncel;
      }
      kod = ata; // bir ust halkaya
    }

    return null;
  }

  async tahsilatBasarili(abonelikKodu: string, siparisKodu: string) {
    const ab = await this.aboneligiKodlaBul(abonelikKodu);
    if (!ab) {
      this.logger.warn(
        `Bilinmeyen abonelik kodu: ${abonelikKodu} — webhook yok sayıldı`,
      );
      return null;
    }

    const detay = await this.iyzico.abonelikGetir(abonelikKodu);
    const siparis = detay.orders?.find((o) => o.referenceCode === siparisKodu);

    // GUVENLIK: WEBHOOK GOVDESI TAHSILAT KANITI DEGILDIR.
    //
    // Eski hal, siparis kodu iyzico'nun siparis listesinde BULUNAMAYINCA
    // donemSonuHesapla'ya dusuyor ve erisimi bir donem ILERI atiyordu. Yani
    // "odemeyi dogrulayamadim" hali "bir donem daha ver" olarak yorumlanıyordu.
    //
    // Bu, uc korumasiz oldugu icin (webhook.controller.ts'de @UseGuards yok) ve
    // imza varsayilan olarak zorunlu olmadigi icin somurulebilirdi: gecerli bir
    // abonelik kodunu bilen biri (yani mevcut bir musteri) uydurma siparis
    // kodlariyla art arda POST atarak kendi erisimini bedavaya uzatabilirdi.
    // Tekilleme anahtari da govdedeki iyziReferenceCode'dan turedigi icin her
    // istek YENI olay sayiliyor, tekrar korumasi devreye girmiyordu. Mutabakat
    // isi de bunu geri almiyor: erisimSonu'na yalniz IPTAL dalinda dokunuluyor.
    //
    // Karar: kanit yoksa erisim UZATILMAZ. Hata firlatiyoruz ki olay "islendi"
    // damgasi YEMESIN — iyzico'nun siparis listesi gecikmeli guncellenirse
    // (eventual consistency) dakikalik tarama tekrar dener ve GERCEK odeme
    // kaybolmaz.
    if (!siparis) {
      this.logger.error(
        `Tahsilat kanıtı YOK: abonelik=${abonelikKodu} sipariş=${siparisKodu} — ` +
          `iyzico sipariş listesinde bulunamadı (${detay.orders?.length ?? 0} kayıt). ` +
          `Erişim UZATILMADI; olay yeniden denenecek.`,
      );
      throw new Error(
        `iyzico siparişi doğrulanamadı: ${siparisKodu} (abonelik ${abonelikKodu})`,
      );
    }

    const donemSonu = siparis.endPeriod
      ? new Date(siparis.endPeriod)
      : this.donemSonuHesapla(ab.erisimSonu, ab.paketSurumu.periyot, ab.paketSurumu.periyotAdedi);

    // ⚠ 23.09 — GUNCEL UC MU, ESKI HALKA MI? Paket degisiminden sonra
    // zincirde eski halkalar olur; onlarin bir siparisi icin GEC gelen
    // webhook da buraya duser (zincir cozucu onu kokten bulur). O olay
    // tahsilati dogrular ama aboneligin BUGUNKU haline dair hicbir sey
    // soylemez: iyzico durumu ve odenen plan ESKI aboneligindir.
    const guncelUcMu = abonelikKodu === ab.iyzicoAbonelikKodu;

    // ⚠ 23.09 — ESKI HALKA ERISIMI KISALTAMAZ. Eski halkanin gec gelen
    // siparisi DAHA ERKEN bir donem sonu tasir; onu kosulsuz yazmak odenmis
    // sureyi geri alirdi. GUNCEL uctan gelen siparis ise olagan kurali KORUR
    // (erisim = iyzico'nun `endPeriod`u): satin almadaki gecici tamponu
    // (31+2 gun) ilk tahsilatta duzelten sey budur. Ilk yazim "asla kisaltma"
    // kuralini HER siparise yaymisti ve o duzeltmeyi sessizce kaldiriyordu
    // (inceleme bulgusu 3) — kural yalniz ESKI HALKAYA aittir.
    const yeniErisimSonu =
      guncelUcMu || donemSonu > ab.erisimSonu ? donemSonu : ab.erisimSonu;

    await this.durumDegistir(ab.id, AbonelikDurumu.AKTIF, {
      aciklama: `Tahsilat başarılı (sipariş ${siparisKodu})`,
      aktor: 'webhook',
      erisimSonu: yeniErisimSonu,
      sayaclariSifirla: true,
      veri: { siparisKodu, iyzicoDurum: detay.subscriptionStatus, guncelUcMu },
    });

    await this.prisma.abonelik.update({
      where: { id: ab.id },
      data: {
        ...(guncelUcMu ? { iyzicoDurum: detay.subscriptionStatus } : {}),
        iyzicoSonKontrol: new Date(),
      },
    });

    // ── 23.09: PAKET DEGISIMI — donem basinda paket ODENEN PLANA oturur ──
    // 1) Vadesi gelen planli gecis (dusurme / yatay) uygulanir — TEK KAYNAK.
    // 2) Odenen plan hangi surumse etkin paket o olur (yalniz guncel uctan).
    // 3) Guncel ucun basarili tahsilati = yeni donem iyzico'da BASLADI →
    //    degisim kilidi kalkar. Kilit BIZIM SAATIMIZLE degil iyzico'nun
    //    cekimiyle acilir (inceleme bulgusu 4): cekim partisi gec kosarsa
    //    saatle acilan kilit baslamamis uca ikinci degisimi gecirirdi.
    // Sira: faturadan ONCE — `webhook.isleyici` faturanin yedek tutarini
    // donen `abonelik.paketSurumu`ndan okur.
    // ⚠ HATA TAHSILATI DUSURMEZ: gecis yazilamazsa 10 dakikalik tarama
    // ayni isi tekrar dener; webhook "islendi" damgasi yemeli.
    await this.planliGecisiUygula(ab.id, { aktor: 'webhook' }).catch((e) =>
      this.logger.error(
        `Planli gecis uygulanamadi (abonelik=${ab.id}): ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
    if (guncelUcMu) {
      await this.odenenPaketeHizala(ab.id, detay.pricingPlanReferenceCode, abonelikKodu, 'webhook').catch((e) =>
        this.logger.error(
          `Paket hizalanamadi (abonelik=${ab.id}): ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
      await this.degisimKilidiniKaldir(ab.id, { aktor: 'webhook', webhookKodu: abonelikKodu }).catch((e) =>
        this.logger.error(
          `Degisim kilidi kaldirilamadi (abonelik=${ab.id}): ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }

    // §4.6 — kapali hesapta cekim GECTIYSE musteri PARA ODEMISTIR; erisim
    // acilir. Normalde kapatma aboneligi iptal eder, yani bu dal bostur
    // (idempotent: acik hesapta sifir satir gunceller, olay da yazmaz).
    // Hata TAHSILATI DUSURMEZ — webhook "islendi" damgasi yemeli.
    await this.firmayiGeriAc(ab.firmaId, {
      aktor: 'webhook',
      aciklama: `Tahsilat basarili (siparis ${siparisKodu}) — hesap geri acildi`,
      abonelikId: ab.id,
    }).catch((e) =>
      this.logger.error(
        `Hesap geri acilamadi (abonelik=${ab.id}): ${e instanceof Error ? e.message : String(e)}`,
      ),
    );

    // Gecis/hizalama paketi degistirmis olabilir: fatura yedek tutarini ve
    // para birimini GUNCEL surumden okusun (bayat `ab` eski paketi tasir).
    const guncel = await this.prisma.abonelik.findUnique({
      where: { id: ab.id },
      include: { paketSurumu: true },
    });
    return { abonelik: guncel ?? ab, siparis, donemSonu };
  }

  /**
   * ═════════════════════════════════════════════════════════════════════
   *  PLANLI PAKET GECISI — TEK KAYNAK (23.09.2026)
   * ═════════════════════════════════════════════════════════════════════
   *
   *  `paketGecisTarihi` geldiyse planli paket ETKIN pakete yazilir ve planli
   *  alan temizlenir. ⚠ DEGISIM KILIDINE (`paketGecisTarihi`) DOKUNMAZ: o,
   *  yeni ucun ilk basarili tahsilatiyla kalkar (`degisimKilidiniKaldir`).
   *  Ozellik gecisi TARIHE bagli (Emre: "dusurme donem sonunda" — odeme
   *  sonucuna bagli degil), kilit ODEMEYE bagli (inceleme bulgusu 4).
   *
   *  Tetikler (hepsi BURAYI cagirir, ikinci bir gecis yazilmaz):
   *    · `tahsilatBasarili` / `tahsilatBasarisiz` — yenileme webhook'lari
   *    · `PaketDegisimiServisi.planliGecisleriTara` — 10 dk'lik tarama
   *
   *  ⚠ KOSULLU YAZMA: iki tetik ayni anda gelirse ikincisi SIFIR satir
   *  gunceller (`where` alanlarin OKUNAN degerini tasir) ve ikinci olay
   *  yazilmaz.
   *
   *  @param zorla Vade beklenmez — `odenenPaketeHizala` iyzico'nun planli
   *    paketi ZATEN cektigini gordugunde kullanir (saat farki: iyzico'nun
   *    donem basi bizim saatimizden birkac saniye once olabilir).
   *  @returns Satir guncellendi mi.
   */
  async planliGecisiUygula(
    abonelikId: string,
    p: { aktor: string; simdi?: Date; zorla?: boolean },
  ): Promise<boolean> {
    const simdi = p.simdi ?? new Date();
    const ab = await this.prisma.abonelik.findUnique({
      where: { id: abonelikId },
      select: {
        id: true,
        durum: true,
        paketSurumuId: true,
        planliPaketSurumuId: true,
        paketGecisTarihi: true,
      },
    });
    if (!ab || !ab.planliPaketSurumuId || !ab.paketGecisTarihi) return false;
    if (!p.zorla && ab.paketGecisTarihi.getTime() > simdi.getTime()) return false;

    const sonuc = await this.prisma.abonelik.updateMany({
      where: {
        id: ab.id,
        paketGecisTarihi: ab.paketGecisTarihi,
        planliPaketSurumuId: ab.planliPaketSurumuId,
      },
      data: { paketSurumuId: ab.planliPaketSurumuId, planliPaketSurumuId: null },
    });
    if (sonuc.count === 0) return false;

    if (ab.planliPaketSurumuId !== ab.paketSurumuId) {
      await this.prisma.abonelikOlayi.create({
        data: {
          abonelikId: ab.id,
          tip: 'paket.degisti',
          oncekiDurum: ab.durum,
          yeniDurum: ab.durum,
          aciklama: 'Planlı paket geçişi uygulandı (dönem sonu)',
          veri: {
            oncekiPaketSurumuId: ab.paketSurumuId,
            yeniPaketSurumuId: ab.planliPaketSurumuId,
            gecisTarihi: ab.paketGecisTarihi.toISOString(),
            zorla: p.zorla === true,
          },
          aktor: p.aktor,
        },
      });
      this.logger.log(
        `Planli paket gecisi: abonelik=${ab.id} ${ab.paketSurumuId} → ${ab.planliPaketSurumuId}`,
      );
    }
    return true;
  }

  /**
   * ODENEN PLAN = ETKIN PAKET (23.09.2026). Yalniz GUNCEL uctan gelen basarili
   * tahsilatta cagrilir.
   *
   *   · Odenen plan PLANLI paketse → planli gecis vade beklenmeden uygulanir.
   *   · Odenen plan etkin paketten BASKAYSA → etkin paket odenen plana
   *     hizalanir. Olagan yolda bu dal BOSTUR; iki kurtarma durumu icindir:
   *     (a) iyzico'da degisim gecti ama bizim yazmamiz dustu (surec coktu),
   *     (b) plan iyzico panelinden elle degistirildi. Iki durumda da musteri
   *     o plani ODEMISTIR — paketi odedigi paket olmalidir.
   *
   * Bilinmeyen plan kodu (bizim surumlerimizde yok) → dokunulmaz, gunluge
   * yazilir: tahmin yurutulmez.
   */
  private async odenenPaketeHizala(
    abonelikId: string,
    planKodu: string | undefined,
    webhookKodu: string,
    aktor: string,
  ): Promise<void> {
    if (!planKodu) return;
    const surum = await this.prisma.paketSurumu.findFirst({
      where: { OR: [{ iyzicoPlanKodu: planKodu }, { iyzicoDenemesizPlanKodu: planKodu }] },
      select: { id: true },
    });
    if (!surum) {
      this.logger.warn(`Odenen plan ${planKodu} hicbir surumle eslesmedi — paket hizalanmadi`);
      return;
    }
    const ab = await this.prisma.abonelik.findUnique({
      where: { id: abonelikId },
      select: {
        id: true,
        durum: true,
        paketSurumuId: true,
        planliPaketSurumuId: true,
        iyzicoAbonelikKodu: true,
      },
    });
    if (!ab) return;
    // ⚠ YARIS (inceleme bulgusu 6): webhook satiri BASTA okudu; iyzico'ya
    // giden istekler surerken musteri paket degistirmis olabilir (guncel uc
    // artik baska kod). O zaman bu siparisin plani BUGUNKU paketi soylemez —
    // hizalama yapilsaydi az once verilen yukseltme GERI alinirdi. Taze satir
    // ve yazmanin kendisi webhook'un koduna baglanir.
    if (ab.iyzicoAbonelikKodu !== webhookKodu) return;

    if (ab.planliPaketSurumuId === surum.id) {
      await this.planliGecisiUygula(ab.id, { aktor, zorla: true });
      return;
    }
    if (ab.paketSurumuId === surum.id) return;

    const sonuc = await this.prisma.abonelik.updateMany({
      where: { id: ab.id, paketSurumuId: ab.paketSurumuId, iyzicoAbonelikKodu: webhookKodu },
      data: { paketSurumuId: surum.id, planliPaketSurumuId: null, odenenPaketSurumuId: null },
    });
    if (sonuc.count === 0) return;
    await this.prisma.abonelikOlayi.create({
      data: {
        abonelikId: ab.id,
        tip: 'paket.hizalandi',
        oncekiDurum: ab.durum,
        yeniDurum: ab.durum,
        aciklama:
          'Etkin paket, iyzico\'da ödenen plana hizalandı (yerel kayıt ödenen planla uyuşmuyordu).',
        veri: {
          oncekiPaketSurumuId: ab.paketSurumuId,
          yeniPaketSurumuId: surum.id,
          iyzicoPlanKodu: planKodu,
        },
        aktor,
      },
    });
    this.logger.warn(
      `PAKET HIZALANDI: abonelik=${ab.id} ${ab.paketSurumuId} → ${surum.id} (odenen plan ${planKodu})`,
    );
  }

  /**
   * DEGISIM KILIDINI KALDIRIR (23.09) — `paketGecisTarihi` +
   * `odenenPaketSurumuId`. Iki tetik:
   *   · guncel ucun BASARILI tahsilati (olagan; `webhookKodu` verilir) —
   *     yeni donem iyzico'da basladi, ikinci degisim artik CANLI uca gider;
   *   · 10 dk taramasinin EMNIYET SUPABI (`KILIT_EMNIYET_GUN`) — o webhook
   *     hic gelmediyse musteri sonsuza dek kilitli kalmasin.
   * Vadesi gelmis planli paket varsa ONCE o yazilir: kilit kalkarken yarim
   * gecis birakilmaz (planli gecis kilide bakan tarama ile yurur).
   *
   * @param webhookKodu Verilirse yazma o koda BAGLANIR (yaris: webhook satiri
   *   okuduktan sonra musteri yeni bir degisim yapmis olabilir — o degisimin
   *   kilidi bu eski siparisle KALKMAMALI).
   */
  async degisimKilidiniKaldir(
    abonelikId: string,
    p: { aktor: string; webhookKodu?: string },
  ): Promise<boolean> {
    const ab = await this.prisma.abonelik.findUnique({
      where: { id: abonelikId },
      select: {
        id: true,
        paketGecisTarihi: true,
        planliPaketSurumuId: true,
        iyzicoAbonelikKodu: true,
      },
    });
    if (!ab || !ab.paketGecisTarihi) return false;
    if (p.webhookKodu && ab.iyzicoAbonelikKodu !== p.webhookKodu) return false;
    if (ab.planliPaketSurumuId) {
      await this.planliGecisiUygula(ab.id, { aktor: p.aktor, zorla: true });
    }
    const sonuc = await this.prisma.abonelik.updateMany({
      where: {
        id: ab.id,
        paketGecisTarihi: ab.paketGecisTarihi,
        ...(p.webhookKodu ? { iyzicoAbonelikKodu: p.webhookKodu } : {}),
      },
      data: { paketGecisTarihi: null, odenenPaketSurumuId: null },
    });
    return sonuc.count > 0;
  }

  /**
   * ZINCIRIN CANLI UCU (23.09, inceleme bulgusu 1). Kayitli ucumuz iyzico'da
   * UPGRADED DEGILSE odur. UPGRADED ise — yaniti kaybolan (ag hatasi, surec
   * coktu) bir paket degisimi yeni bir uc uretmis demektir — cocuklar aranir.
   *
   * ⚠⚠ ARAMA SONUCU BURADA SUZULUR: yalniz ust kodu BIZIM zincirimizden biri
   * olan ve (biliniyorsa) musteri kodu bizimki olan kayit kabul edilir.
   * iyzico tanimadigi filtreyi SESSIZCE yutar (20.08 olcumu); yanlis/yok
   * sayilan bir filtre TUM aboneleri dondurur ve "UPGRADED olmayan ilk kayit"
   * BASKA BIR MUSTERININ aboneligi olurdu. Bulunamazsa `null` — tahmin YOK.
   * `parentReferenceCode`un dogrudan ata mi kok mu oldugu olculmedi: suzgec
   * ikisini de kabul eder (kaydettigimiz kok + yuruyus boyunca gorulen uclar).
   */
  async canliUcuBul(ab: {
    iyzicoAbonelikKodu: string | null;
    iyzicoKokKodu: string | null;
    iyzicoMusteriKodu: string | null;
  }): Promise<IyzicoAbonelikDetayi | null> {
    if (!ab.iyzicoAbonelikKodu) return null;
    let uc = await this.iyzico.abonelikGetir(ab.iyzicoAbonelikKodu);
    const zincir = new Set<string>([ab.iyzicoAbonelikKodu]);
    if (ab.iyzicoKokKodu) zincir.add(ab.iyzicoKokKodu);
    for (let adim = 0; adim < 5 && uc?.subscriptionStatus === 'UPGRADED'; adim++) {
      const adaylar = await this.iyzico.abonelikAra({
        parent: uc.referenceCode,
        customerReferenceCode: ab.iyzicoMusteriKodu ?? undefined,
      });
      const bizim = adaylar.filter(
        (x) =>
          !!x.referenceCode &&
          !zincir.has(x.referenceCode) &&
          !!x.parentReferenceCode &&
          zincir.has(x.parentReferenceCode) &&
          (!ab.iyzicoMusteriKodu || x.customerReferenceCode === ab.iyzicoMusteriKodu),
      );
      if (bizim.length === 0) return null;
      const canli = bizim.find((x) => x.subscriptionStatus !== 'UPGRADED');
      if (canli) return canli;
      // Hepsi UPGRADED (arka arkaya degisimler): en yenisinden yurumeye devam.
      const sonraki = [...bizim].sort(
        (a, b) => (iyzicoTarihi(b.createdDate)?.getTime() ?? 0) - (iyzicoTarihi(a.createdDate)?.getTime() ?? 0),
      )[0];
      zincir.add(sonraki.referenceCode);
      uc = sonraki;
    }
    return uc && uc.subscriptionStatus !== 'UPGRADED' ? uc : null;
  }

  // ── Webhook'tan gelen başarısız tahsilat ────────────────────────────────
  async tahsilatBasarisiz(abonelikKodu: string, siparisKodu: string) {
    // ⚠ IKIZ: basarili yolla AYNI zincir cozumu. Yalniz birini duzeltmek,
    // "odeme gecti guncellendi ama basarisizlik kaydedilmedi" gibi yarim
    // bir durum uretirdi — dunning merdiveni hic baslamazdi.
    const ab = await this.aboneligiKodlaBul(abonelikKodu);
    if (!ab) {
      this.logger.warn(`Bilinmeyen abonelik kodu: ${abonelikKodu}`);
      return null;
    }

    // ⚠ 23.09 (inceleme bulgusu 7) — IKIZ YOL: vadesi gelen planli dusurme
    // basarili yolda oldugu gibi ONCE uygulanir. Basarisiz yenileme cekimi
    // DUSURULMUS paketin fiyatiydi; 10 dk taramasini beklemek ilk dunning
    // bildirimine ESKI (ust) paketi ve fiyatini yazdirirdi.
    await this.planliGecisiUygula(ab.id, { aktor: 'webhook' }).catch((e) =>
      this.logger.error(
        `Planli gecis uygulanamadi (abonelik=${ab.id}): ${e instanceof Error ? e.message : String(e)}`,
      ),
    );

    // Zaten ödeme bekliyor/kısıtlı/askıdaysa durumu geri almıyoruz;
    // yalnızca ilk başarısızlık zamanını işaretliyoruz.
    if (ab.durum === AbonelikDurumu.AKTIF || ab.durum === AbonelikDurumu.DENEME) {
      await this.durumDegistir(ab.id, AbonelikDurumu.ODEME_BEKLIYOR, {
        aciklama: `Tahsilat başarısız (sipariş ${siparisKodu})`,
        aktor: 'webhook',
        veri: { siparisKodu },
      });
    } else {
      await this.olayYaz(ab.id, 'tahsilat.basarisiz', {
        aciklama: `Sipariş ${siparisKodu}`,
        veri: { siparisKodu },
        aktor: 'webhook',
      });
    }

    await this.prisma.abonelik.update({
      where: { id: ab.id },
      data: {
        ilkBasarisizlik: ab.ilkBasarisizlik ?? new Date(),
        // Dunning zamanlayıcısının bu kaydı hemen görmesi için
        sonDeneme: ab.sonDeneme ?? new Date(),
      },
    });

    return ab;
  }

  private donemSonuHesapla(
    baslangic: Date,
    periyot: string,
    adet: number,
  ): Date {
    const d = new Date(baslangic);
    switch (periyot) {
      case 'DAILY':
        d.setDate(d.getDate() + adet);
        break;
      case 'WEEKLY':
        d.setDate(d.getDate() + 7 * adet);
        break;
      case 'YEARLY':
        d.setFullYear(d.getFullYear() + adet);
        break;
      case 'MONTHLY':
      default:
        d.setMonth(d.getMonth() + adet);
        break;
    }
    return d;
  }

  /** Havale akışı ve yönetici müdahalesi için: erişimi elle uzat. */
  async erisimiUzat(
    abonelikId: string,
    ayAdedi: number,
    p: { aktor: string; aciklama: string; tx?: Prisma.TransactionClient },
  ) {
    const db = (p.tx ?? this.prisma) as PrismaService;
    const ab = await db.abonelik.findUniqueOrThrow({ where: { id: abonelikId } });

    // Süresi geçmişse bugünden, geçmemişse mevcut bitişten uzat.
    const simdi = new Date();
    const baslangic = ab.erisimSonu > simdi ? ab.erisimSonu : simdi;
    const yeniSon = new Date(baslangic);
    yeniSon.setMonth(yeniSon.getMonth() + ayAdedi);

    // §4.6 — HAVALE yolu buradan gecer (havale.servisi:odemeyiOnayla) ve
    // kendi transaction'ini verir: erisim uzatma ile geri acma AYNI islemde
    // olmali, yoksa "erisimi var ama girisi kapali" yarim hali olusur.
    // ⚠ HATA YUTULMAZ: burada `catch` YOK — havalenin transaction'i geri
    // alinmali, aksi halde onay "yarim" kalirdi.
    await this.firmayiGeriAc(ab.firmaId, {
      aktor: p.aktor,
      aciklama: `${p.aciklama} — hesap geri acildi`,
      abonelikId,
      tx: p.tx,
    });

    return this.durumDegistir(abonelikId, AbonelikDurumu.AKTIF, {
      erisimSonu: yeniSon,
      sayaclariSifirla: true,
      aktor: p.aktor,
      aciklama: p.aciklama,
      veri: { ayAdedi, oncekiErisimSonu: ab.erisimSonu.toISOString() },
      tx: p.tx,
    });
  }
}
