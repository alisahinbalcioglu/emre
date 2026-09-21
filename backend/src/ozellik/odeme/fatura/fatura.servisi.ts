import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { FaturaDurumu, Prisma } from '@prisma/client';
import {
  FaturaMusterisi,
  MuhasebeAdaptoru,
  MUHASEBE_ADAPTORU,
} from './muhasebe.adaptor';
import { Inject } from '@nestjs/common';
import { EpostaServisi } from '../eposta/eposta.servisi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  e-Arşiv / e-Fatura kesimi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  NEDEN BU DOSYA VAR:
 *  iyzico müşterinize fatura KESMEZ. Kendi komisyonunu size faturalar, o kadar.
 *  Her başarılı tahsilat için e-arşiv (vergi mükellefi olmayan / e-fatura
 *  kullanıcısı olmayan alıcı) ya da e-fatura (kayıtlı kullanıcı) üretmek
 *  sizin yasal yükümlülüğünüz. Aylık abonelikte bu, elle takip edilebilecek
 *  bir iş değil.
 *
 *  TASARIM:
 *  Fatura kesimi tahsilat akışını ASLA bloklamaz. Webhook işleyici buraya
 *  yalnızca "kuyruğa al" der ve geçer. Muhasebe servisi yavaşsa, bakımdaysa
 *  ya da bir alan reddediyorsa abonelik yine de aktifleşir — fatura kuyrukta
 *  bekler ve tekrar denenir.
 *
 *  Üstel geri çekilme: 1dk, 5dk, 25dk, 2sa, 10sa. 5 denemeden sonra
 *  ELLE_MUDAHALE durumuna alınır ve yönetime e-posta gider. Sessizce
 *  kaybolmaz — kaybolursa vergi cezası sizin olur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const AZAMI_DENEME = 5;
const GERI_CEKILME_DK = [1, 5, 25, 120, 600];

/* ═══════════════════════════════════════════════════════════════════════════
   K4 (21.09.2026) — FATURA KENDI KOPYASINI TASIR
   ═══════════════════════════════════════════════════════════════════════════

   OLCULEN KUSUR (bu dosya, eski satir 126-143):
   `tekFatura` musteri kimligini `prisma.firma.findUniqueOrThrow` ile O AN
   okuyordu. Fatura ise `kuyrugaAl`da, TAHSILAT aninda yaziliyor ve kesim
   @Cron ile SONRA kosuyor — hata olursa 5 kez, 10 SAATE kadar geri cekilerek
   (`GERI_CEKILME_DK`), `yenidenDene` ile aylar sonra da. Iki sonuc:

     1. IMHADAN BAGIMSIZ DA YANLIS: musteri adresini degistirirse GECEN YILIN
        faturasi da yeni adresi gosteriyordu. VUK md. 230 faturada musterinin
        adi/unvani, ADRESI, vergi dairesi ve numarasini sart kosar — fatura
        KESILDIGI ANIN bilgisini tasimak zorundadir.
     2. Plan 5.8 veri imhasi firma satirini BOSALTINCA saklanan faturalar
        eksik kalirdi (yasal saklama bozulur).

   COZUM: kimlik TAHSILAT ANINDA `Fatura` satirina KOPYALANIR; kesim yalnizca
   bu kopyayi okur. `Firma`ya giden CANLI okuma YOLU KALMADI — kopya yoksa
   fatura kesilmez, ELLE_MUDAHALE merdivenine duser ve yonetime mail gider.
   Sessiz yanlis fatura, gurultulu basarisizliktan KOTUDUR.

   ⚠ GERIYE DOLDURMA YOK (brief §6): olculdu 21.09, canlida 0 fatura kaydi
   var; gecmisi bugunku firma bilgisiyle doldurmak zaten yanlis veri uretirdi.

   ⚠ E-POSTA BILEREK KOPYALANMIYOR: VUK md. 230 sayimi icinde DEGIL — fatura
   ICERIGI degil TESLIM adresidir, ve musterinin GUNCEL adresine gitmelidir.
   Firma satiri bosaltildiktan sonra kesilmemis bir fatura kalirsa adres de
   kalmaz; o hal SESSIZCE gecilmez, asagidaki `FaturaKopyasiEksikHatasi` ile
   elle mudahaleye duser (rapora yazildi: `Fatura.musteriEposta` alani
   eklenirse bu bosluk tamamen kapanir).
   ═══════════════════════════════════════════════════════════════════════════ */

/** `Fatura` satirindaki donmus musteri kimligi (VUK md. 230 sayimi). */
export interface FaturaMusteriKopyasi {
  musteriUnvan: string | null;
  musteriVergiDairesi: string | null;
  musteriVergiNo: string | null;
  musteriTcKimlikNo: string | null;
  musteriAdres: string | null;
  musteriIl: string | null;
  musteriIlce: string | null;
}

/** Kopya cikarilirken `Firma` satirindan okunan EN DAR yuzey. */
export interface FirmaFaturaKimligi {
  ad: string | null;
  unvan: string | null;
  vergiNo: string | null;
  vergiDairesi: string | null;
  tcKimlikNo: string | null;
  faturaAdresi: string | null;
  il: string | null;
  ilce: string | null;
}

/** Bos/bosluk-only degeri `null`a cevirir — imha bosalttiginda `''` kalmasin. */
function doluYaDaNull(d: string | null | undefined): string | null {
  const t = d?.trim();
  return t ? t : null;
}

/**
 * SAF — tahsilat anindaki firma satirindan fatura kopyasini cikarir.
 *
 * `unvan ?? ad` ayrimi semadaki kurala uyar: `ad` kayit akisinda uretilen
 * GORUNEN ad, `unvan` faturaya yazilacak resmi unvandir.
 */
export function faturaMusteriKopyasiCikar(
  firma: FirmaFaturaKimligi | null | undefined,
): FaturaMusteriKopyasi {
  return {
    musteriUnvan: doluYaDaNull(firma?.unvan) ?? doluYaDaNull(firma?.ad),
    musteriVergiDairesi: doluYaDaNull(firma?.vergiDairesi),
    musteriVergiNo: doluYaDaNull(firma?.vergiNo),
    musteriTcKimlikNo: doluYaDaNull(firma?.tcKimlikNo),
    musteriAdres: doluYaDaNull(firma?.faturaAdresi),
    musteriIl: doluYaDaNull(firma?.il),
    musteriIlce: doluYaDaNull(firma?.ilce),
  };
}

/** Kopya ya da teslim adresi yoksa: fatura KESILMEZ, elle mudahaleye duser. */
export class FaturaKopyasiEksikHatasi extends Error {
  constructor(eksik: string) {
    super(
      `Fatura kendi musteri kopyasini tasimiyor (eksik: ${eksik}). ` +
        'K4 oncesi kayit ya da firma satiri bosaltilmis olabilir; fatura ELLE kesilmeli.',
    );
    this.name = 'FaturaKopyasiEksikHatasi';
  }
}

/**
 * SAF — saklanan kopyadan muhasebe adaptorunun musteri govdesini uretir.
 * `Firma` satirina BAKMAZ: bu fonksiyonun firma parametresi YOKTUR.
 */
export function kopyadanMusteri(
  f: FaturaMusteriKopyasi,
  teslimEpostasi: string | null | undefined,
): FaturaMusterisi {
  const unvan = doluYaDaNull(f.musteriUnvan);
  if (!unvan) throw new FaturaKopyasiEksikHatasi('unvan');
  const eposta = doluYaDaNull(teslimEpostasi);
  if (!eposta) throw new FaturaKopyasiEksikHatasi('teslim e-postasi');
  return {
    unvan,
    vergiNo: doluYaDaNull(f.musteriVergiNo) ?? undefined,
    vergiDairesi: doluYaDaNull(f.musteriVergiDairesi) ?? undefined,
    tcKimlikNo: doluYaDaNull(f.musteriTcKimlikNo) ?? undefined,
    eposta,
    adres: doluYaDaNull(f.musteriAdres) ?? undefined,
    il: doluYaDaNull(f.musteriIl) ?? undefined,
    ilce: doluYaDaNull(f.musteriIlce) ?? undefined,
  };
}

export interface FaturaTalebi {
  abonelikId: string;
  /** Tekilleştirme anahtarı — aynı tahsilat için iki fatura kesilmesin. */
  tahsilatKodu: string;
  /** KDV DAHİL tahsil edilen tutar. */
  tutar: number;
  paraBirimi: string;
  donemBasi: Date;
  donemSonu: Date;
}

@Injectable()
export class FaturaServisi {
  private readonly logger = new Logger(FaturaServisi.name);
  private readonly kdvOrani = Number(process.env.KDV_ORANI ?? 20);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MUHASEBE_ADAPTORU)
    private readonly muhasebe: MuhasebeAdaptoru,
    private readonly eposta: EpostaServisi,
  ) {}

  /**
   * Faturayı kuyruğa alır. Aynı `tahsilatKodu` ikinci kez gelirse sessizce
   * yok sayılır — webhook tekrarı fatura tekrarına dönüşmez.
   */
  async kuyrugaAl(t: FaturaTalebi): Promise<void> {
    // Tutar KDV dahil geliyor; matrahı ve KDV'yi ayrıştır.
    const carpan = 1 + this.kdvOrani / 100;
    const matrah = Math.round((t.tutar / carpan) * 100) / 100;
    const kdv = Math.round((t.tutar - matrah) * 100) / 100;

    // ── K4: MUSTERI KIMLIGI TAM BURADA DONAR ─────────────────────────────
    // Bu metot TAHSILAT anindan cagrilir (webhook.isleyici:basariliTahsilat).
    // Kesim sonra kosar; arada adres degisirse fatura ESKI adresi tasimalidir.
    const kopya = await this.musteriKopyasiniCikar(t.abonelikId);

    try {
      await this.prisma.fatura.create({
        data: {
          abonelikId: t.abonelikId,
          tahsilatKodu: t.tahsilatKodu,
          durum: FaturaDurumu.BEKLIYOR,
          ...kopya,
          tutar: new Prisma.Decimal(matrah),
          kdvOrani: this.kdvOrani,
          kdvTutari: new Prisma.Decimal(kdv),
          toplamTutar: new Prisma.Decimal(t.tutar),
          paraBirimi: t.paraBirimi,
          donemBasi: t.donemBasi,
          donemSonu: t.donemSonu,
          sonDeneme: new Date(Date.now() - 60_000), // hemen işlensin
        },
      });
      this.logger.log(`Fatura kuyruğa alındı: ${t.tahsilatKodu}`);
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        this.logger.debug(`Fatura zaten var: ${t.tahsilatKodu}`);
        return;
      }
      throw e;
    }
  }

  /**
   * K4 — tahsilat anindaki firma satirindan musteri kopyasini okur.
   *
   * ⚠ HATA FIRLATMAZ: fatura kesimi tahsilat akisini ASLA bloklamaz (dosya
   * basindaki tasarim notu). Firma okunamazsa kopya bos yazilir ve kesim
   * asamasinda `FaturaKopyasiEksikHatasi` ile GURULTULU sekilde duser —
   * sessizce yanlis kimlikle fatura kesmekten iyidir.
   */
  private async musteriKopyasiniCikar(
    abonelikId: string,
  ): Promise<FaturaMusteriKopyasi> {
    const ab = await this.prisma.abonelik.findUnique({
      where: { id: abonelikId },
      select: {
        firma: {
          select: {
            ad: true,
            unvan: true,
            vergiNo: true,
            vergiDairesi: true,
            tcKimlikNo: true,
            faturaAdresi: true,
            il: true,
            ilce: true,
          },
        },
      },
    });
    if (!ab?.firma) {
      this.logger.error(
        `Fatura musteri kopyasi CIKARILAMADI: abonelik=${abonelikId} firma satiri okunamadi. ` +
          'Fatura yine de kuyruga alinir ama kesilemez — elle mudahale gerekecek.',
      );
    }
    return faturaMusteriKopyasiCikar(ab?.firma);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async kuyrugaBak(): Promise<void> {
    const simdi = new Date();
    const bekleyenler = await this.prisma.fatura.findMany({
      where: {
        durum: { in: [FaturaDurumu.BEKLIYOR, FaturaDurumu.HATA] },
        denemeSayisi: { lt: AZAMI_DENEME },
        sonDeneme: { lte: simdi },
      },
      orderBy: { olusturuldu: 'asc' },
      take: 20,
    });

    for (const f of bekleyenler) {
      await this.tekFatura(f.id).catch((e) =>
        this.logger.error(`Fatura ${f.id}: ${e}`),
      );
    }
  }

  private async tekFatura(faturaId: string): Promise<void> {
    const f = await this.prisma.fatura.findUniqueOrThrow({
      where: { id: faturaId },
      include: {
        abonelik: {
          include: { paketSurumu: { include: { paket: true } } },
        },
      },
    });
    if (f.durum === FaturaDurumu.KESILDI) return;

    // ── K4: KIMLIK FATURANIN KENDI KOPYASINDAN ───────────────────────────
    // Firma satirindan YALNIZ teslim e-postasi okunur (VUK sayimi disinda,
    // musterinin GUNCEL adresine gitmeli). Unvan/vergi/adres/il/ilce ARTIK
    // BURADAN OKUNMAZ — `findUniqueOrThrow` da bilerek `findUnique` oldu:
    // imha firma satirini bosaltmis olsa bile saklanan fatura okunabilmeli.
    const firma = await this.prisma.firma.findUnique({
      where: { id: f.abonelik.firmaId },
      select: { ad: true, faturaEposta: true, yetkiliEposta: true },
    });
    const faturaAdi = f.musteriUnvan ?? firma?.ad ?? f.abonelik.firmaId;

    try {
      const musteri = kopyadanMusteri(
        f,
        firma?.faturaEposta ?? firma?.yetkiliEposta,
      );
      const sonuc = await this.muhasebe.faturaKes({
        // Muhasebe tarafındaki tekilleştirme — çift gönderime karşı
        harciAnahtar: f.tahsilatKodu,
        musteri,
        kalemler: [
          {
            ad: `${f.abonelik.paketSurumu.paket.ad} — Yazılım Kullanım Bedeli`,
            aciklama: `Dönem: ${f.donemBasi.toLocaleDateString('tr-TR')} – ${f.donemSonu.toLocaleDateString('tr-TR')}`,
            miktar: 1,
            birim: 'Adet',
            birimFiyat: Number(f.tutar),
            kdvOrani: f.kdvOrani,
          },
        ],
        paraBirimi: f.paraBirimi,
        duzenlemeTarihi: new Date(),
      });

      await this.prisma.fatura.update({
        where: { id: faturaId },
        data: {
          durum: FaturaDurumu.KESILDI,
          saglayici: this.muhasebe.ad,
          saglayiciId: sonuc.saglayiciId,
          faturaNo: sonuc.faturaNo,
          faturaUrl: sonuc.faturaUrl,
          kesildi: new Date(),
          hata: null,
        },
      });
      this.logger.log(`Fatura kesildi: ${sonuc.faturaNo ?? sonuc.saglayiciId}`);
    } catch (e: unknown) {
      const mesaj = e instanceof Error ? e.message : String(e);
      const yeniDeneme = f.denemeSayisi + 1;
      const tukendi = yeniDeneme >= AZAMI_DENEME;
      const bekleme =
        GERI_CEKILME_DK[Math.min(yeniDeneme, GERI_CEKILME_DK.length - 1)];

      await this.prisma.fatura.update({
        where: { id: faturaId },
        data: {
          durum: tukendi ? FaturaDurumu.ELLE_MUDAHALE : FaturaDurumu.HATA,
          denemeSayisi: yeniDeneme,
          sonDeneme: new Date(Date.now() + bekleme * 60_000),
          hata: mesaj.slice(0, 500),
        },
      });

      if (tukendi) {
        this.logger.error(
          `Fatura ${faturaId} elle müdahale gerektiriyor: ${mesaj}`,
        );
        await this.yonetimeHaberVer(faturaId, faturaAdi, mesaj);
      } else {
        this.logger.warn(
          `Fatura ${faturaId} başarısız (${yeniDeneme}/${AZAMI_DENEME}), ` +
            `${bekleme} dk sonra tekrar: ${mesaj}`,
        );
      }
    }
  }

  private async yonetimeHaberVer(
    faturaId: string,
    firmaAdi: string,
    hata: string,
  ): Promise<void> {
    const adres = process.env.YONETIM_EPOSTA;
    if (!adres) return;
    await this.eposta
      .gonder({
        kime: adres,
        konu: `[MetaPriceX] Fatura kesilemedi — ${firmaAdi}`,
        baslik: 'Otomatik fatura kesimi başarısız',
        paragraflar: [
          `Firma: ${firmaAdi}`,
          `Fatura kaydı: ${faturaId}`,
          `Son hata: ${hata}`,
          'Otomatik denemeler tükendi. Faturanın elle kesilmesi gerekiyor.',
        ],
        dugme: {
          etiket: 'Yönetim panelinde aç',
          url: `${process.env.UYGULAMA_URL}/yonetim/faturalar/${faturaId}`,
        },
      })
      .catch(() => undefined);
  }

  /** Yönetim panelinden elle tekrar tetikleme. */
  async yenidenDene(faturaId: string): Promise<void> {
    await this.prisma.fatura.update({
      where: { id: faturaId },
      data: {
        durum: FaturaDurumu.BEKLIYOR,
        denemeSayisi: 0,
        sonDeneme: new Date(Date.now() - 1000),
        hata: null,
      },
    });
  }
}
