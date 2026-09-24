import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikDurumu, KapatmaNedeni, OdemeYontemi, Prisma } from '@prisma/client';
import {
  IyzicoClient,
  IyzicoAbonelikDetayi,
  IyzicoHatasi,
  IyzicoSiparis,
} from '../iyzico/iyzico.client';
import { EpostaServisi } from '../eposta/eposta.servisi';
import { tarihYaz, tutarYaz } from '../dunning/dunning.metinleri';
// Saf modul (Prisma/Nest bilmez) — dongusel import YOK.
import { iyzicoTarihi } from './paket-degisimi';
import { KartKapatmaSonucu, kapatmaCumlesi, kartAboneligiKapaliMi } from './kart-kapatma';
import {
  odenmisSiparisMi,
  siparisiBul,
  tahsilatBasarisizligiKarari,
} from '../iyzico/tahsilat-kaniti';

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
      // sandbox'ta ölçülmedi). Mutabakat bu değeri AKTIF'e yalnız IPTAL
      // satırında çevirir; diğer satırları AKTIF'e ödenmiş sipariş (tahsilat
      // yolu) çeker: mutabakat.job.ts → `denemeSuruyorMu`, KAYIP TAHSİLAT notu.
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
    // 24.09 — YALNIZ yonetici bildirimi (havale ↔ kart cakismasi, asagida).
    // ⚠ `@Optional()` BILEREK YOK: Nest bu parametreyi ZORUNLU cozer, modulden
    // duserse onyukleme GURULTUYLE patlar (bildirim sessizce kaybolmaz). TS'de
    // istege bagli olmasi yalniz servisi 2 argumanla kuran eski test
    // fikstorleri derlensin diye; o fikstorler bu yolu kosmaz.
    private readonly eposta?: EpostaServisi,
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
      /**
       * 24.09 — İYİMSER EŞZAMANLILIK: yazma ANINDA satırın hâlâ tutması
       * gereken koşul. Tutmazsa Prisma P2025 fırlatır, hiçbir şey yazılmaz
       * ve çağıran yeniden dener. Webhook yolları `odemeYontemi: KART` verir:
       * satırı okuyup iyzico'yu beklerken yönetici havaleyi onaylarsa eski
       * okumayla havale yılını `endPeriod`a kısaltmak / ODEME_BEKLIYOR yazmak
       * yerine olay yeniden denenir ve havale dalına düşer (inceleme ORTA-2).
       */
      kosul?: Omit<Prisma.AbonelikWhereInput, 'id' | 'firmaId' | 'iyzicoAbonelikKodu'>;
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
      where: { ...(p.kosul ?? {}), id: abonelikId },
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
    const siparis = siparisiBul(detay.orders, siparisKodu);

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

    // ⚠ 24.09 — LISTEDE OLMAK ODENMIS OLMAK DEGILDIR. Varlik denetimi
    // yetmiyordu: iyzico sonraki donemin siparisini ONCEDEN acar (20.08
    // tutanagi: ACTIVE abonelikte WAITING, odeme denemesi YOK). O siparisi
    // anan sahte govde erisimi bir donem uzatiyor, dunning sayaclarini
    // sifirliyor (KISITLI → AKTIF) ve tahsil edilmemis paraya fatura
    // aciyordu. Kanit gece mutabakatinin kaniti ile AYNI kuraldir
    // (`odenmisSiparisMi`, tek kaynak — ikiz yazilmadi). Hata firlatilir:
    // olay "islendi" damgasi yemez, isleyici yeniden dener (liste gecikmisse
    // tutar); 5 denemede olurse gercek odemeyi gece mutabakati iyzico'nun
    // listesinden bulup YENIDEN OYNATIR (mutabakat.job.ts → KAYIP TAHSILAT).
    // Yani siki kanit gercek odemeyi KAYBETTIRMEZ; bedeli, liste gecikirse
    // erisimin en gec ertesi gece uzamasidir. Kapi: `test:webhook-tahsilat-dogrulama` B.
    if (!odenmisSiparisMi(siparis)) {
      this.logger.error(
        `Tahsilat kanıtı YOK: abonelik=${abonelikKodu} sipariş=${siparisKodu} listede ama ÖDENMEMİŞ ` +
          `(orderStatus=${siparis.orderStatus}, başarılı ödeme denemesi yok). Erişim UZATILMADI; olay yeniden denenecek.`,
      );
      throw new Error(
        `iyzico siparişi doğrulanamadı: ${siparisKodu} ödenmemiş (orderStatus ${siparis.orderStatus}; abonelik ${abonelikKodu})`,
      );
    }

    // ⚠ 24.09 — HAVALEYLE ODENMIS SATIR (Emre karari: "ikisi birden, onay
    // beklemez"). Bu, eski KART aboneliginin cekimidir: musteri o donemi
    // havaleyle ODEDI. Asagidaki olagan yol erisimSonu'nu iyzico'nun
    // `endPeriod`una yazip havale donemini KISALTIYOR (olculdu: 334 gun),
    // faturayi kesiyor ve cekimi gelir sayiyordu. Havale satirinda durum,
    // erisim ve fatura DEGISMEZ; cekim "cift tahsilat — iade" olarak
    // kaydedilir, yoneticiye yazilir, kart aboneligi yeniden kapatilir.
    // `null` → isleyici fatura KESMEZ, "toparlandi" GONDERMEZ.
    // Kanit kurali (ustte) BURADA DA gecerli: uydurma webhook yoneticiye
    // "iade et" dedirtemez.
    if (ab.odemeYontemi === OdemeYontemi.HAVALE) {
      await this.havaleSatirindaKartTahsilati(ab, { abonelikKodu, siparisKodu, siparis });
      return null;
    }

    // Tarih TEK cozucuden (24.09): iyzico ms SAYI yolluyor ama tip `string`
    // diyor; rakam-dizesi `new Date` ile Invalid Date olurdu. Cozulemeyen
    // deger EKSIK sayilir (eski davranisin eksik dali).
    const donemSonu =
      iyzicoTarihi(siparis.endPeriod) ??
      this.donemSonuHesapla(ab.erisimSonu, ab.paketSurumu.periyot, ab.paketSurumu.periyotAdedi);

    // ⚠ 23.09 — GUNCEL UC MU, ESKI HALKA MI? Paket degisiminden sonra
    // zincirde eski halkalar olur; onlarin bir siparisi icin GEC gelen
    // webhook da buraya duser (zincir cozucu onu kokten bulur). O olay
    // tahsilati dogrular ama aboneligin BUGUNKU haline dair hicbir sey
    // soylemez: iyzico durumu ve odenen plan ESKI aboneligindir.
    const guncelUcMu = abonelikKodu === ab.iyzicoAbonelikKodu;

    // ⚠ 24.09 — ERISIM YALNIZ SATIN ALMANIN KOPRUSUNDEN KISALIR.
    // Varsayilan: yalniz UZAT (donem sonu ileriyse yaz, degilse dokunma).
    // Tek istisna: satin alma `erisimSonu`na tamponlu bir KOPRU tarih yazdi
    // (`kopruErisimSonu`, satinalma.servisi `aboneligiAcVeyaGuncelle`) ve o
    // tarih HALA yerinde — iyzico'nun gercek donem sonu onu duzeltir, gerekirse
    // kisaltir (31+2 gun → donem sonu; 23.09 inceleme bulgusu 3). Kopru baska
    // bir yazmayla (havale, yonetici, mutabakat) degistiyse esitlik bozulur:
    // kanit yoksa kisaltma yok.
    //
    // NEDEN: 23.09 kurali guncel uctan gelen HER sipariste `erisimSonu`nu
    // `endPeriod`a yaziyordu. Miras (goc) firma kartla odeyince satin alma 365
    // gunu korudu (02.09 karari, `max(mevcut, yeni)`) ama ilk tahsilat —
    // miras firmaya deneme verilmez, tahsilat satin almadan dakikalar sonra
    // gelir — onu ~30 gune indirip ~332 gunu siliyordu: odemek, odememekten
    // kotuydu. ESKI HALKA kurali (23.09) aynen durur: eski halkanin gec gelen
    // siparisi DAHA ERKEN bir donem sonu tasir ve koprusu olsa bile kisaltmaz.
    const kopruDuzeltilir =
      guncelUcMu &&
      !!ab.kopruErisimSonu &&
      ab.erisimSonu.getTime() === ab.kopruErisimSonu.getTime();
    const yeniErisimSonu =
      kopruDuzeltilir || donemSonu > ab.erisimSonu ? donemSonu : ab.erisimSonu;

    // ⚠ 24.09 — DUNNING DONGUSUNDEN CIKIS SIFIRLAMANIN KENDISINDEN OKUNUR.
    // Asagidaki `sayaclariSifirla` ilkBasarisizlik/denemeSayisi/sonDeneme/
    // kisitlandi'yi siler; "odemeniz alindi" e-postasinin karari (Dunning-
    // Servisi.tahsilatToparlandi) satiri SONRA okuyordu ve her musteriyi
    // "zaten sorunsuz" goruyordu: e-posta HIC gitmiyordu (olculdu, gunlukte
    // hata yok). Kural degismedi — dongude = ilkBasarisizlik dolu YA DA
    // denemeSayisi ≠ 0 — ve TEK yerde: bu KOSULLU yazmanin `where`i.
    // Guncellenen satir sayisi "bu cagri donguyu kapatti mi"nin cevabidir:
    // ayni olayi ayni anda isleyen iki surec (kuyrugaAl + dakikalik tarama)
    // ikisi birden "evet" alamaz — e-posta TAM BIR kez gider. Olayin kaynagi
    // (iyzico ya da mutabakat oynatmasi) fark etmez: isleyici ona bakmaz.
    // Asagidaki durum gecisiyle AYNI yaris korumasi (`kosul`): arada havale
    // onaylandiysa satira dokunulmaz, gecis P2025 ile duser, olay havale
    // dalina yeniden gelir.
    const donguKapandi = await this.prisma.abonelik.updateMany({
      where: {
        id: ab.id,
        odemeYontemi: OdemeYontemi.KART,
        OR: [{ ilkBasarisizlik: { not: null } }, { denemeSayisi: { not: 0 } }],
      },
      data: { ilkBasarisizlik: null, denemeSayisi: 0 },
    });
    const dunningdenCikti = donguKapandi.count > 0;

    await this.durumDegistir(ab.id, AbonelikDurumu.AKTIF, {
      kosul: { odemeYontemi: OdemeYontemi.KART }, // 24.09 yarış: arada havale onaylandıysa P2025 → yeniden dene
      aciklama: `Tahsilat başarılı (sipariş ${siparisKodu})`,
      aktor: 'webhook',
      erisimSonu: yeniErisimSonu,
      sayaclariSifirla: true,
      veri: {
        siparisKodu,
        iyzicoDurum: detay.subscriptionStatus,
        guncelUcMu,
        // 24.09: erisimin bu tahsilatta nasil degistigi olaydan okunabilsin.
        oncekiErisimSonu: ab.erisimSonu.toISOString(),
        kopruDuzeltildi: kopruDuzeltilir,
      },
    });

    await this.prisma.abonelik.update({
      where: { id: ab.id },
      data: {
        // Guncel ucun basarili tahsilati = iyzico gercek donemi bildirdi;
        // kopru kapanir (duzeltildi ya da uzatildi). Eski halka kopruye
        // DOKUNMAZ: kopru guncel ucun ilk tahsilatini bekler.
        ...(guncelUcMu ? { iyzicoDurum: detay.subscriptionStatus, kopruErisimSonu: null } : {}),
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
    return { abonelik: guncel ?? ab, siparis, donemSonu, dunningdenCikti };
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

    // ⚠ 24.09 — HAVALEYLE ODENMIS SATIR (Emre karari; ikizi `tahsilatBasarili`).
    // Eski kart aboneliginin reddi havaleyle odenmis donemi ilgilendirmez.
    // Yazilmasaydi: ODEME_BEKLIYOR + "Odemeniz alinamadi" seridi ve e-postasi;
    // merdiven ve mutabakat KART disini taramadigi icin satir orada KALIR ve
    // ODEME_BEKLIYOR `erisimSonu`na bakmadigindan havale donemi bitince de
    // erisim SURESIZ acik kalirdi (olculdu). `null` → isleyici dunning ilk
    // bildirimini GONDERMEZ. Kart aboneligi onayda kapatildi; kapatilamadiysa
    // yonetici o anda uyarildi (`havaleIcinKartAboneliginiKapat`).
    if (ab.odemeYontemi === OdemeYontemi.HAVALE) {
      await this.olayYaz(ab.id, 'tahsilat.havale.yok.sayildi', {
        aciklama:
          `Havaleyle ödenen abonelikte eski kart aboneliğinin çekimi başarısız ` +
          `(sipariş ${siparisKodu}) — durum ve erişim DEĞİŞMEDİ`,
        veri: { abonelikKodu, siparisKodu },
        aktor: 'webhook',
      });
      this.logger.warn(
        `Havale satirinda kart cekimi basarisiz: abonelik=${ab.id} kod=${abonelikKodu} ` +
          `siparis=${siparisKodu} — yok sayildi`,
      );
      return null;
    }

    // ⚠ 24.09 — GUVENLIK: WEBHOOK GOVDESI BASARISIZLIK KANITI DA DEGILDIR.
    // Eski hal iyzico'ya HIC sormuyordu: abonelik kodunu anan her govde (uc
    // acik, imza zorunlu degil) odeyen musteriyi ODEME_BEKLIYOR'a atip
    // dunning e-postasi gonderiyordu. Gece mutabakati bunu artik geri
    // ALMIYOR (kanitsiz terfi yok, Emre 24.09) → 10. gun KISITLI, 30. gun
    // ASKIDA. Karar iyzico'nun KENDI kaydindan (`tahsilatBasarisizligiKarari`,
    // iyzico/tahsilat-kaniti.ts — sira ve gerekceler orada):
    //  · ODENMIS  — anilan siparis odenmis (eskimis ya da sahte bildirim):
    //               durum DEGISMEZ, iz olayi yazilir, dunning bildirimi
    //               GITMEZ (`null` → isleyici `ilkBildirim` cagirmaz); olay
    //               islendi sayilir — yeniden denemenin anlami yok.
    //  · KANITSIZ — hata firlatilir: olay "islendi" damgasi yemez, isleyici
    //               yeniden dener (iyzico henuz guncellememis olabilir). Ret
    //               gercekse iyzico UNPAID der; gece mutabakatinin UNPAID dali
    //               da ODEME_BEKLIYOR + `ilkBasarisizlik` yazar (ikiz yol).
    // Planli gecis de kanittan SONRA: sahte govde hicbir yazmayi tetiklemez.
    // Kapi: `test:webhook-tahsilat-dogrulama` F.
    const detay = await this.iyzico.abonelikGetir(abonelikKodu);
    const kanit = tahsilatBasarisizligiKarari(detay, siparisKodu);
    if (kanit.karar === 'ODENMIS') {
      this.logger.warn(
        `Başarısız tahsilat bildirimi YOK SAYILDI: abonelik=${abonelikKodu} sipariş=${siparisKodu} — ${kanit.gerekce}`,
      );
      await this.olayYaz(ab.id, 'tahsilat.basarisiz.yok.sayildi', {
        aciklama: `Sipariş ${siparisKodu} iyzico'da ödenmiş — başarısızlık bildirimi uygulanmadı`,
        veri: { siparisKodu, kanit: kanit.gerekce, iyzicoDurum: detay.subscriptionStatus },
        aktor: 'webhook',
      });
      return null;
    }
    if (kanit.karar === 'KANITSIZ') {
      this.logger.error(
        `Başarısızlık kanıtı YOK: abonelik=${abonelikKodu} sipariş=${siparisKodu} — ${kanit.gerekce}. ` +
          `Durum DEĞİŞTİRİLMEDİ; olay yeniden denenecek.`,
      );
      throw new Error(
        `iyzico başarısızlığı doğrulanamadı: ${siparisKodu} (abonelik ${abonelikKodu}; ${kanit.gerekce})`,
      );
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
        // 24.09 yarış: arada havale onaylandıysa P2025 → olay yeniden denenir
        // ve havale dalına düşer (ikizi `tahsilatBasarili`).
        kosul: { odemeYontemi: OdemeYontemi.KART },
        aciklama: `Tahsilat başarısız (sipariş ${siparisKodu})`,
        aktor: 'webhook',
        veri: { siparisKodu, kanit: kanit.gerekce },
      });
    } else {
      await this.olayYaz(ab.id, 'tahsilat.basarisiz', {
        aciklama: `Sipariş ${siparisKodu}`,
        veri: { siparisKodu, kanit: kanit.gerekce },
        aktor: 'webhook',
      });
    }

    // ⚠ 24.09 — KOŞULLU: satır okunduktan sonra havaleye geçtiyse (0 satır)
    // dunning izi YAZILMAZ ve olay yeniden denenir. Yazılsaydı işleyici
    // havaleyle ödemiş müşteriye "ödemeniz alınamadı" gönderirdi (onay
    // sayaçları sıfırladığı için ilk bildirim kapısı açık).
    const isaret = await this.prisma.abonelik.updateMany({
      where: { id: ab.id, odemeYontemi: OdemeYontemi.KART },
      data: {
        ilkBasarisizlik: ab.ilkBasarisizlik ?? new Date(),
        // Dunning zamanlayıcısının bu kaydı hemen görmesi için
        sonDeneme: ab.sonDeneme ?? new Date(),
      },
    });
    if (isaret.count === 0) {
      throw new Error(
        `Abonelik ${ab.id} okunduktan sonra havaleye geçti (sipariş ${siparisKodu}) — olay yeniden denenecek`,
      );
    }

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

  // ═══════════════════════════════════════════════════════════════════════
  //  HAVALE ↔ KART ABONELIGI (24.09.2026 — Emre karari: "ikisi birden, onay
  //  beklemez")
  // ═══════════════════════════════════════════════════════════════════════
  //  OLCULEN KUSUR (`backend/test/havale-iyzico-cakismasi-test.ts`): kartli
  //  musteri havaleyle odeyince onay yalniz `odemeYontemi: 'HAVALE'` yaziyor,
  //  iyzico aboneligi ACIK kaliyordu. Donem sonunda iyzico karttan da cekiyor
  //  (cift tahsilat + ikinci fatura) ve webhook havale donemini `endPeriod`a
  //  kisaltiyordu (334 gun); kart reddinde musteri "Odemeniz alinamadi"
  //  goruyor, satir ODEME_BEKLIYOR'da takilip havale donemi bitince bile
  //  erisim acik kaliyordu.
  //
  //  UC PARCA, TEK KARAR:
  //    1. Onayda kart aboneligi iyzico'da KAPATILIR (`havaleIcinKartAboneliginiKapat`,
  //       cagiran `HavaleServisi.odemeyiOnayla` — islem BITTIKTEN sonra).
  //       iyzico kapatamazsa onay YINE gecer: olay + yonetici e-postasi.
  //       UNPAID aboneligin iptali iyzico dokumaninda TARIF EDILMIYOR; karti
  //       reddedilip havaleye gecen musteri tam da bu yoldan gelir — onayi
  //       iyzico'ya baglamak onu kilitlerdi.
  //    2. Havale satirina sonradan gelen RET webhook'u yok sayilir (olay).
  //    3. Havale satirina gelen BASARILI cekim = cift tahsilat: erisim ve
  //       fatura DEGISMEZ; olay + yonetici e-postasi ("iade edin"), kart
  //       aboneligi yeniden kapatilir.
  //  ⚠ `iyzicoAbonelikKodu` SILINMEZ: gec gelen webhook bu satira baglansin ve
  //  (2)/(3)'e dussun. Silinseydi "bilinmeyen kod" diye yutulur, cift
  //  tahsilat HIC gorulmezdi.

  /**
   * iyzico'da kart aboneligini IPTAL EDER. Kayitli uc 201403 ("iptal
   * edilemez") donerse zincirin CANLI ucu aranir: yaniti kaybolan bir paket
   * degisimi yeni uc uretmis olabilir — o iptal edilir. Uc zaten
   * CANCELED/EXPIRED ise `zaten-kapali`. Baska her durumda asil hata AYNEN
   * firlatilir (sessiz basari yok).
   *
   * ⚠ IKIZ: `SatinAlmaServisi.iptalEt` ayni 201403 kuralini satir icinde
   * tasiyor (bilinen kapaliyi ATLAMA kurali artik ORTAK: `kart-kapatma.ts`
   * → `kartAboneligiKapaliMi`). Birlesmesi bekleyen bir is (24.09) `iptalEt`in
   * iptal blogunu degistirdigi icin orasi simdi tasinmadi (cakisma); o is
   * birlestikten sonra `iptalEt` bu yardimciyi cagirmali.
   */
  async iyzicoAboneliginiIptalEt(ab: {
    iyzicoAbonelikKodu: string;
    iyzicoKokKodu: string | null;
    iyzicoMusteriKodu: string | null;
  }): Promise<{ sonuc: 'iptal-edildi' | 'zaten-kapali'; kod: string; iyzicoDurum: string }> {
    try {
      await this.iyzico.abonelikIptal(ab.iyzicoAbonelikKodu);
      return { sonuc: 'iptal-edildi', kod: ab.iyzicoAbonelikKodu, iyzicoDurum: 'CANCELED' };
    } catch (e) {
      if (!(e instanceof IyzicoHatasi) || e.kod !== '201403') throw e;
      const canli = await this.canliUcuBul(ab).catch(() => null);
      if (!canli) throw e;
      if (canli.subscriptionStatus === 'CANCELED' || canli.subscriptionStatus === 'EXPIRED') {
        return { sonuc: 'zaten-kapali', kod: canli.referenceCode, iyzicoDurum: canli.subscriptionStatus };
      }
      if (canli.referenceCode === ab.iyzicoAbonelikKodu) throw e;
      try {
        await this.iyzico.abonelikIptal(canli.referenceCode);
      } catch (e2) {
        // Mesaj CANLI kodu taşır: yönetici panelde eski (UPGRADED, terminal)
        // kodu arayıp açık olan çocuğu bulamazdı (inceleme bulgusu 6).
        throw new Error(
          `canlı uç ${canli.referenceCode} iptal edilemedi: ${e2 instanceof Error ? e2.message : String(e2)}`,
        );
      }
      return { sonuc: 'iptal-edildi', kod: canli.referenceCode, iyzicoDurum: 'CANCELED' };
    }
  }

  /**
   * Havaleye gecen satirin kart aboneligini iyzico'da kapatir (parca 1).
   * iyzico hatasini ASLA FIRLATMAZ — onay iyzico'yu beklemez: sonucu dondurur;
   * basarisizlikta olay + gunluk + (istenirse) yonetici e-postasi. Bildigimiz
   * kadariyla kapali abonelikte iyzico'ya HIC gidilmez (`kartAboneligiKapaliMi`);
   * kapatilamamissa sonraki onay ya da cift tahsilat webhook'u YENIDEN dener.
   */
  async havaleIcinKartAboneliginiKapat(
    abonelikId: string,
    p: { aktor: string; neden: string; yoneticiyeYaz?: boolean },
  ): Promise<KartKapatmaSonucu> {
    const ab = await this.prisma.abonelik.findUnique({
      where: { id: abonelikId },
      select: {
        id: true,
        firmaId: true,
        iyzicoAbonelikKodu: true,
        iyzicoKokKodu: true,
        iyzicoMusteriKodu: true,
        iyzicoDurum: true,
        iptalTalebi: true,
      },
    });
    if (!ab?.iyzicoAbonelikKodu) return { sonuc: 'kod-yok' };
    if (kartAboneligiKapaliMi(ab)) return { sonuc: 'zaten-kapali', kod: ab.iyzicoAbonelikKodu };

    let r: Awaited<ReturnType<AbonelikServisi['iyzicoAboneliginiIptalEt']>>;
    try {
      r = await this.iyzicoAboneliginiIptalEt({
        iyzicoAbonelikKodu: ab.iyzicoAbonelikKodu,
        iyzicoKokKodu: ab.iyzicoKokKodu,
        iyzicoMusteriKodu: ab.iyzicoMusteriKodu,
      });
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `KART ABONELIGI IPTAL EDILEMEDI: abonelik=${ab.id} kod=${ab.iyzicoAbonelikKodu} ` +
          `(${p.neden}): ${mesaj}`,
      );
      await this.olayYaz(ab.id, 'iyzico.abonelik.iptal.basarisiz', {
        aciklama: `Kart aboneliği iyzico'da iptal EDİLEMEDİ — ${p.neden}`,
        veri: { kod: ab.iyzicoAbonelikKodu, hata: mesaj.slice(0, 500), neden: p.neden },
        aktor: p.aktor,
      }).catch((e2) =>
        this.logger.error(
          `Iptal hatasi olaya yazilamadi (abonelik=${ab.id}): ${e2 instanceof Error ? e2.message : String(e2)}`,
        ),
      );
      if (p.yoneticiyeYaz !== false) {
        await this.yoneticiyeYaz(ab.firmaId, {
          konu: 'Kart aboneliği iptal edilemedi',
          baslik: "Havale onaylandı ama iyzico'daki kart aboneliği kapatılamadı",
          paragraflar: [
            `iyzico aboneliği: ${ab.iyzicoAbonelikKodu}`,
            `İşlem: ${p.neden}`,
            `iyzico yanıtı: ${mesaj}`,
            'Havale onayı geri alınmadı; müşterinin erişimi uzatıldı.',
            "Kart aboneliği iyzico'da açık kalabilir ve bir sonraki dönemde karttan da " +
              'çekim yapılabilir. iyzico panelinden elle iptal edin.',
          ],
        });
      }
      return { sonuc: 'basarisiz', kod: ab.iyzicoAbonelikKodu, hata: mesaj };
    }

    await this.prisma.abonelik.update({
      where: { id: ab.id },
      data: {
        iyzicoDurum: r.iyzicoDurum,
        iyzicoSonKontrol: new Date(),
        // Kayitli uc bayatti (201403) ve canli uc kapatildi: satir o uca
        // baglanir, kok korunur (ikizi `iptalEt`).
        ...(r.kod !== ab.iyzicoAbonelikKodu
          ? { iyzicoAbonelikKodu: r.kod, iyzicoKokKodu: ab.iyzicoKokKodu ?? ab.iyzicoAbonelikKodu }
          : {}),
      },
    });
    await this.olayYaz(ab.id, 'iyzico.abonelik.iptal', {
      aciklama:
        r.sonuc === 'iptal-edildi'
          ? `Kart aboneliği iyzico'da iptal edildi — ${p.neden}`
          : `Kart aboneliği iyzico'da zaten kapalıydı (${r.iyzicoDurum}) — ${p.neden}`,
      veri: { kod: r.kod, sonuc: r.sonuc, neden: p.neden },
      aktor: p.aktor,
    });
    return { sonuc: r.sonuc, kod: r.kod };
  }

  /**
   * Havale satirina gelen BASARILI kart cekimi = cift tahsilat (parca 3).
   * Kanit: siparis iyzico'da SUCCESS. Degilse FIRLATIR → olay yeniden denenir:
   * odendigi dogrulanmadan yoneticiye "iade et" yazilmaz, cekim de kacirilmaz.
   * SIPARIS BASINA BIR KEZ: ayni siparis yeni bir olayla (yeni tekil anahtar —
   * or. mutabakatin kayip tahsilat oynatmasi) ya da DB hatasindan sonraki
   * yeniden denemeyle tekrar gelirse ikinci olay/e-posta YAZILMAZ.
   */
  private async havaleSatirindaKartTahsilati(
    ab: { id: string; firmaId: string; erisimSonu: Date; paketSurumu: { paraBirimi: string } },
    p: { abonelikKodu: string; siparisKodu: string; siparis: IyzicoSiparis },
  ): Promise<void> {
    if (p.siparis.orderStatus !== 'SUCCESS') {
      throw new Error(
        `Havale satirinda kart cekimi dogrulanamadi: siparis ${p.siparisKodu} iyzico'da ` +
          `${p.siparis.orderStatus} — olay yeniden denenecek`,
      );
    }
    const oncekiler = await this.prisma.abonelikOlayi.findMany({
      where: { abonelikId: ab.id, tip: 'tahsilat.cift' },
      select: { veri: true },
    });
    if (oncekiler.some((o) => (o.veri as { siparisKodu?: unknown } | null)?.siparisKodu === p.siparisKodu)) {
      this.logger.warn(
        `Cift tahsilat zaten kayitli: abonelik=${ab.id} siparis=${p.siparisKodu} — ikinci uyari yazilmadi`,
      );
      return;
    }
    const tutar = p.siparis.paidPrice ?? p.siparis.price;
    const tutarMetni =
      typeof tutar === 'number' ? tutarYaz(tutar, ab.paketSurumu.paraBirimi) : 'bilinmiyor';
    // Tarih TEK çözücüden: iyzico dönem sınırını ms SAYISI (ya da rakam
    // dizesi) yollayabilir; `new Date('1789…')` Invalid Date yazardı.
    const baslangic = iyzicoTarihi(p.siparis.startPeriod);
    const bitis = iyzicoTarihi(p.siparis.endPeriod);
    const donem = baslangic && bitis ? `${tarihYaz(baslangic)} – ${tarihYaz(bitis)}` : 'bilinmiyor';
    this.logger.error(
      `CIFT TAHSILAT: havaleyle odenen abonelik=${ab.id} kart aboneligi=${p.abonelikKodu} ` +
        `siparis=${p.siparisKodu} tutar=${tutar} — erisim/fatura DEGISMEDI, iade gerekiyor`,
    );
    await this.olayYaz(ab.id, 'tahsilat.cift', {
      aciklama:
        `Havaleyle ödenen abonelikte eski kart aboneliğinden çekim yapıldı ` +
        `(sipariş ${p.siparisKodu}, ${tutarMetni}) — erişim DEĞİŞMEDİ, fatura KESİLMEDİ; iade gerekiyor`,
      veri: {
        abonelikKodu: p.abonelikKodu,
        siparisKodu: p.siparisKodu,
        tutar: tutar ?? null,
        startPeriod: p.siparis.startPeriod ?? null,
        endPeriod: p.siparis.endPeriod ?? null,
      },
      aktor: 'webhook',
    });
    // Cekim yapildiysa abonelik iyzico'da ACIKTIR: sonraki donem de
    // cekilmesin. Sonuc AYNI e-postada soylenir (ikinci e-posta yok).
    const kapatma = await this.havaleIcinKartAboneliginiKapat(ab.id, {
      aktor: 'webhook',
      neden: `Çift tahsilat — sipariş ${p.siparisKodu}`,
      yoneticiyeYaz: false,
    });
    await this.yoneticiyeYaz(ab.firmaId, {
      konu: 'Çift tahsilat — iade gerekiyor',
      baslik: 'Havaleyle ödeyen müşteriden karttan da çekim yapıldı',
      paragraflar: [
        `iyzico aboneliği: ${p.abonelikKodu} · sipariş: ${p.siparisKodu}`,
        `Çekilen tutar: ${tutarMetni} · kart çekiminin dönemi: ${donem}`,
        `Havaleyle ödenmiş erişim: ${tarihYaz(ab.erisimSonu)} tarihine kadar. Erişim DEĞİŞMEDİ, ` +
          'bu çekim için fatura KESİLMEDİ.',
        // ⚠ Kart dönemi havale döneminden ÖNCEYSE (eski bir borcun geç
        // tahsilatı) çekim meşrudur: kararı dönemleri gören yönetici verir
        // (inceleme bulgusu 4 — satırda havale başlangıcı tutulmuyor).
        'Yapılacak: dönemler çakışıyorsa bu çekimi iyzico panelinden iade edin; kart dönemi ' +
          'havaleyle ödenen dönemden ÖNCEYSE (eski bir borcun geç tahsilatı) iade yerine faturalayın.',
        kapatmaCumlesi(kapatma),
      ],
    });
  }

  /**
   * Yoneticiye e-posta — `YONETIM_EPOSTA`, fatura servisinin elle mudahale
   * uyarisiyla AYNI adres. ASLA firlatmaz. Adres, gonderici ya da SMTP yoksa
   * uyari SESSIZCE kaybolmaz: icerik HATA seviyesinde gunluge yazilir (olay
   * kaydi cagiranda zaten dusuldu). ⚠ SMTP'siz `gonder` yalniz UYARI basip
   * doner — o yol burada yakalanir (inceleme bulgusu 8).
   */
  private async yoneticiyeYaz(
    firmaId: string,
    t: { konu: string; baslik: string; paragraflar: string[] },
  ): Promise<void> {
    const firma = await this.prisma.firma
      .findUnique({ where: { id: firmaId }, select: { ad: true } })
      .catch(() => null);
    const ad = firma?.ad ?? firmaId;
    const kime = process.env.YONETIM_EPOSTA?.trim();
    const engel = !kime
      ? 'YONETIM_EPOSTA tanimli degil'
      : !this.eposta
        ? 'e-posta servisi yok'
        : !this.eposta.yapilandirildiMi()
          ? 'SMTP yapilandirilmamis'
          : null;
    if (engel) {
      this.logger.error(
        `YONETICI BILDIRIMI GONDERILEMEDI (${engel}): [${ad}] ${t.konu} — ${t.paragraflar.join(' | ')}`,
      );
      return;
    }
    await this.eposta
      .gonder({
        kime,
        konu: `[MetaPriceX] ${t.konu} — ${ad}`,
        baslik: t.baslik,
        paragraflar: [`Firma: ${ad}`, ...t.paragraflar],
      })
      .catch((e) =>
        this.logger.error(
          `Yonetici bildirimi gonderilemedi (${t.konu}, ${ad}): ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
  }
}
