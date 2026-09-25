import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { FaturaDurumu, Prisma } from '@prisma/client';
import {
  FaturaKesSonucu,
  FaturaMusterisi,
  MuhasebeAdaptoru,
  MUHASEBE_ADAPTORU,
} from './muhasebe.adaptor';
import { Inject } from '@nestjs/common';
import { EpostaServisi } from '../eposta/eposta.servisi';
import { yonetimeYaz } from '../eposta/yonetim-bildirimi';
import { tutarYaz } from '../dunning/dunning.metinleri';

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
/**
 * 24.09.2026 — ELLE (NES) kesimde deneme bütçesi ~7 gün. Talep yöneticiye
 * ulaşmazsa (SMTP/kota kesintisi) 5 deneme ≈ 12,5 saatte tükeniyordu ve
 * vazgeçme uyarısı da AYNI posta yolundan gidiyordu (inceleme M1). VUK md.
 * 231/5 süresi 7 gün: 1+5+25+120 dk + 16 × 600 dk ≈ 6,8 gün.
 */
const ELLE_AZAMI_DENEME = 20;
const GERI_CEKILME_DK = [1, 5, 25, 120, 600];
/** Kira: işlenen satırı başka tur/süreç almasın (bkz. `tekFatura`). */
const KIRA_DK = 15;

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

  const vergiNo = doluYaDaNull(f.musteriVergiNo);
  const tcKimlikNo = doluYaDaNull(f.musteriTcKimlikNo);
  const vergiDairesi = doluYaDaNull(f.musteriVergiDairesi);

  // ── T47 (22.09.2026): VERGI KIMLIGI OLMADAN FATURA KESILMEZ ────────────
  //
  // OLCULEN KUSUR (bu fonksiyon, eski hali): uc vergi alani da `?? undefined`
  // ile SESSIZCE geciyordu. Ucu birden bos oldugunda muhasebe saglayicisina
  // `tax_number: undefined, tax_office: undefined` gidiyor ve fatura
  // KESILIYORDU. VUK md. 230 faturada musterinin vergi dairesi ve hesap
  // numarasini (gercek kisi icin T.C. kimlik numarasini) SART KOSAR — yani
  // uretilen belge hukuken gecersizdi ve kimse fark etmiyordu.
  //
  // Ustteki iki kapi (unvan / teslim e-postasi) bu hali YAKALAYAMAZ, cunku
  // ikisi de pratikte hic bos kalmaz: `faturaMusteriKopyasiCikar` `unvan ?? ad`
  // yapar ve `Firma.ad` NOT NULL'dur; `yetkiliEposta` ise her satin almada
  // yazilir. Yani K4'un "gurultulu basarisizlik" merdiveni KURULU ama bu
  // kusur ona HIC ulasmiyordu.
  //
  // ⚠ TAHSILATI BLOKLAMAZ — dosya basindaki tasarim notu gecerli. Buradan
  // firlayan hata KESIM asamasindadir: fatura HATA'ya duser, 5 kez geri
  // cekilerek denenir, tukenince ELLE_MUDAHALE olur ve yonetime mail gider.
  // Musterinin aboneligi calismaya devam eder. Asil kapi ONCEDEDIR: satin
  // alma formu artik sirket adina alandan vergi dairesini de ister ve
  // `satinalma.servisi.ts` kimlik numarasini `Firma`ya YAZAR — yani saglikli
  // yolda buraya eksik kopya GELMEZ. Bu kapi o yolun DISINDAN gelenler icin:
  // K4 oncesi kayitlar, elle acilmis firmalar, havale yolu, imha edilmis satir.
  //
  // ⚠ SAHIS/TUZEL AYRIMI BURADA DA GECERLI:
  //   · TCKN varsa yeter — gercek kisiye e-Arsiv'de vergi dairesi istenmez.
  //   · VKN varsa vergi dairesi de ZORUNLU (VUK md. 230).
  if (!vergiNo && !tcKimlikNo) {
    throw new FaturaKopyasiEksikHatasi('vergi kimligi (VKN ya da T.C. kimlik no)');
  }
  if (vergiNo && !tcKimlikNo && !vergiDairesi) {
    throw new FaturaKopyasiEksikHatasi('vergi dairesi (VKN ile birlikte zorunlu)');
  }

  return {
    unvan,
    vergiNo: vergiNo ?? undefined,
    vergiDairesi: vergiDairesi ?? undefined,
    tcKimlikNo: tcKimlikNo ?? undefined,
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
  private calisiyor = false;

  /** Adaptöre göre deneme bütçesi — elle (NES) kesimde ~7 gün. */
  private get azamiDeneme(): number {
    return this.muhasebe.ad === 'elle' ? ELLE_AZAMI_DENEME : AZAMI_DENEME;
  }

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MUHASEBE_ADAPTORU)
    private readonly muhasebe: MuhasebeAdaptoru,
    private readonly eposta: EpostaServisi,
  ) {}

  /**
   * Faturayı kuyruğa alır. Aynı `tahsilatKodu` ikinci kez gelirse sessizce
   * yok sayılır — webhook tekrarı fatura tekrarına dönüşmez.
   *
   * Dönüş (25.09): `true` = satır BU çağrıyla yazıldı (tahsilat ilk kez
   * işleniyor); `false` = aynı tahsilat kodu zaten vardı (webhook tekrarı,
   * mutabakat oynatması). Sorunsuz yenilemenin "ödemeniz alındı" e-postası bu
   * cevaba bağlıdır — tahsilat başına TAM BİR KEZ (`WebhookIsleyici`).
   */
  async kuyrugaAl(t: FaturaTalebi): Promise<boolean> {
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
      return true;
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        this.logger.debug(`Fatura zaten var: ${t.tahsilatKodu}`);
        return false;
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
    // 24.09 — turlar ÖRTÜŞMESİN (webhook.isleyici ile aynı kilit): cron 3.2
    // bir sonraki turu öncekinin bitmesini beklemeden başlatır; asılı SMTP ya
    // da muhasebe turu 60 sn'nin ötesine taşırsa aynı satırlar iki kez
    // işlenirdi (inceleme H1). Süreçler arası koruma `tekFatura`daki kira.
    if (this.calisiyor) return;
    this.calisiyor = true;
    try {
      const simdi = new Date();
      const bekleyenler = await this.prisma.fatura.findMany({
        where: {
          durum: { in: [FaturaDurumu.BEKLIYOR, FaturaDurumu.HATA] },
          denemeSayisi: { lt: this.azamiDeneme },
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
    } finally {
      this.calisiyor = false;
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

    // ── 24.09 — KİRA: satır işlenmeden ÖNCE koşullu yazmayla alınır ────────
    // `kuyrugaBak`taki kilit yalnız BU süreçteki turları sıraya koyar; ikinci
    // bir süreç ya da elle `yenidenDene` aynı satırı aynı anda işleyebilir.
    // Elle (NES) kesimde ikinci işlem ikinci "fatura kesilecek" e-postasıdır =
    // ÇİFT FATURA riski (inceleme H1: iki eşzamanlı `tekFatura` iki e-posta
    // gönderdi). Yalnız vadesi gelmiş BEKLIYOR/HATA satırı alınır ve
    // `sonDeneme` KIRA_DK ileri atılır; kaybeden 0 satır görür, dokunmaz.
    // Süreç işlemin ortasında ölürse kira dolunca satır yeniden alınır.
    const kira = await this.prisma.fatura.updateMany({
      where: {
        id: faturaId,
        durum: { in: [FaturaDurumu.BEKLIYOR, FaturaDurumu.HATA] },
        sonDeneme: { lte: new Date() },
      },
      data: { sonDeneme: new Date(Date.now() + KIRA_DK * 60_000) },
    });
    if (kira.count !== 1) {
      this.logger.debug(`Fatura ${faturaId} başka bir işlemde ya da vadesi gelmemiş — atlandı`);
      return;
    }

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

    // Sağlayıcı işi YAPTI mı (fatura kesildi / NES talebi e-postalandı)?
    // Doluysa sonraki hata yalnız KAYDIN hatasıdır — bkz. catch.
    let sonuc: FaturaKesSonucu | null = null;
    try {
      const musteri = kopyadanMusteri(
        f,
        firma?.faturaEposta ?? firma?.yetkiliEposta,
      );
      sonuc = await this.muhasebe.faturaKes({
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
        // Satırın KENDİ tutarları + ödeme anı (elle/NES kesim yöneticiye
        // yazar). Ödeme anı = dönem başı ile kuyruğa alınmanın ERKENİ:
        // geç işlenen webhook son günü ertelemesin (VUK 231/5, 7 gün).
        tahsilat: {
          matrah: Number(f.tutar),
          kdv: Number(f.kdvTutari),
          toplam: Number(f.toplamTutar),
          tarih: f.olusturuldu && f.olusturuldu < f.donemBasi ? f.olusturuldu : f.donemBasi,
        },
      });

      await this.kesildiYaz(faturaId, sonuc);
      this.logger.log(`Fatura kesildi: ${sonuc.faturaNo ?? sonuc.saglayiciId}`);
    } catch (e: unknown) {
      const mesaj = e instanceof Error ? e.message : String(e);
      if (sonuc) {
        // 24.09 (inceleme H1'in ikinci yolu): sağlayıcıda iş YAPILDI, yalnız
        // satır yazılamadı. HATA'ya çekmek yeniden denemede İKİNCİ faturayı /
        // e-postayı üretirdi. Kayıt bir kez daha denenir; o da düşerse satır
        // kirada kalır ve KIRA_DK sonra yeniden işlenebilir — günlüğe ÇİFT
        // GÖNDERİM uyarısı yazılır.
        const tamamlanan = sonuc;
        await this.kesildiYaz(faturaId, tamamlanan).then(
          () => this.logger.warn(`Fatura ${faturaId} kaydı ikinci denemede yazıldı (ilk hata: ${mesaj})`),
          (e2: unknown) =>
            this.logger.error(
              `Fatura ${faturaId} (${f.tahsilatKodu}) sağlayıcıda TAMAMLANDI ama satır yazılamadı: ${mesaj} / ` +
                `${e2 instanceof Error ? e2.message : String(e2)}. Kira ${KIRA_DK} dk sonra dolunca YENİDEN ` +
                `İŞLENEBİLİR — çift gönderime dikkat (${tamamlanan.faturaNo ?? tamamlanan.saglayiciId}).`,
            ),
        );
        return;
      }
      const yeniDeneme = f.denemeSayisi + 1;
      const tukendi = yeniDeneme >= this.azamiDeneme;
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
        await this.yonetimeHaberVer(f, faturaAdi, mesaj);
      } else {
        this.logger.warn(
          `Fatura ${faturaId} başarısız (${yeniDeneme}/${this.azamiDeneme}), ` +
            `${bekleme} dk sonra tekrar: ${mesaj}`,
        );
      }
    }
  }

  private async kesildiYaz(faturaId: string, sonuc: FaturaKesSonucu): Promise<void> {
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
  }

  /**
   * 24.09.2026 — adres ORTAK yardımcıdan (`YONETIM_EPOSTA`, boşsa etkin
   * yönetici hesapları). Eskiden adres yokken SESSİZCE dönüyordu (canlıda
   * değişken boş: bu uyarı hiç gitmedi, günlüğe de düşmedi) ve düğmesi var
   * olmayan `/yonetim/faturalar/<id>` sayfasına gidiyordu (panel `/admin`,
   * fatura ekranı yok). Gönderilemezse içerik HATA günlüğüne yazılır.
   */
  private async yonetimeHaberVer(
    f: { id: string; tahsilatKodu: string; toplamTutar: Prisma.Decimal; paraBirimi: string },
    firmaAdi: string,
    hata: string,
  ): Promise<void> {
    await yonetimeYaz(
      { prisma: this.prisma, eposta: this.eposta, logger: this.logger },
      {
        konu: `[MetaPriceX] Fatura kesilemedi — ${firmaAdi}`,
        baslik: 'Otomatik fatura kesimi başarısız',
        paragraflar: [
          `Firma: ${firmaAdi}`,
          `Fatura kaydı: ${f.id}`,
          `Tahsilat: ${f.tahsilatKodu} — ${tutarYaz(Number(f.toplamTutar), f.paraBirimi)}`,
          `Son hata: ${hata}`,
          'Otomatik denemeler tükendi. Faturanın elle kesilmesi gerekiyor.',
        ],
      },
    );
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
