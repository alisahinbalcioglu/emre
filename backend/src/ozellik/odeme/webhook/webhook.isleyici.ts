import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikServisi } from '../abonelik/abonelik.servisi';
import { FaturaServisi } from '../fatura/fatura.servisi';
import { DunningServisi } from '../dunning/dunning.servisi';
import { EpostaServisi } from '../eposta/eposta.servisi';
import { odemeAlindiEpostasi } from '../eposta/musteri-epostalari';
import { yonetimeYaz } from '../eposta/yonetim-bildirimi';
import { tarihYaz } from '../dunning/dunning.metinleri';
import { sonDuzenlemeGunu } from '../fatura/fatura-kesim-epostasi';
import { iyzicoTarihi } from '../iyzico/iyzico-tarihi';
import { odemeAni, tahsilEdilenTutar } from '../iyzico/tahsilat-kaniti';
import { TUTAR_OKUNAMADI_OLAYI, tutarIziVarMi } from '../abonelik/tahsilat-izi';

/**
 * Olay basina deneme siniri. Asan olay "olu"dur: tarama onu bir daha almaz.
 * Gece mutabakati kendi yeniden oynattigi olu olayi bu sinira bakarak
 * yeniden kurar (mutabakat.job.ts → KAYIP TAHSILAT, kural 4).
 */
export const AZAMI_DENEME = 5;

/**
 * Tutarı okunamayan tahsilatın denetim izi — tanım `abonelik/tahsilat-izi.ts`e
 * TAŞINDI (28.09): `AbonelikServisi` onu "sipariş uygulandı" ölçütü olarak
 * okur ve bu dosyayı içe aktaramaz (döngü). Burada yeniden dışa verilir.
 */
export { TUTAR_OKUNAMADI_OLAYI };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Webhook işleyici
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Controller olayı diske yazdı ve 200 döndü. Asıl iş burada, controller'ın
 *  isteğinden bağımsız olarak yapılıyor. İki tetikleyici var:
 *
 *    1. `kuyrugaAl` — controller'dan gelen anlık dürtme (setImmediate)
 *    2. Dakikada bir çalışan tarama — dürtme kaçarsa (süreç yeniden başladı,
 *       hata oldu) olay yine de işlenir. Emniyet ağı budur.
 *
 *  Not: tek süreçli kurulum varsayılmıştır. Birden fazla örnek (replica)
 *  çalıştırıyorsanız `islemeBasla` içindeki seçimi `FOR UPDATE SKIP LOCKED`
 *  ile alın ya da BullMQ gibi bir kuyruğa taşıyın — OKUBENI.md'de not var.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class WebhookIsleyici {
  private readonly logger = new Logger(WebhookIsleyici.name);
  private calisiyor = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly abonelik: AbonelikServisi,
    private readonly fatura: FaturaServisi,
    private readonly dunning: DunningServisi,
    // 25.09 — YALNIZ sorunsuz yenilemenin "ödemeniz alındı" e-postası.
    // ⚠ `@Optional()` BİLEREK YOK (AbonelikServisi ile aynı kural): Nest bu
    // parametreyi ZORUNLU çözer, modülden düşerse önyükleme gürültüyle
    // patlar. TS'de isteğe bağlı olması yalnız servisi 4 argümanla kuran
    // eski test fikstürleri derlensin diye; o fikstürlerde e-posta gitmez.
    private readonly eposta?: EpostaServisi,
  ) {}

  /** Controller'dan çağrılır; isteği bekletmez. */
  kuyrugaAl(olayId: string): void {
    setImmediate(() => {
      this.tekOlayIsle(olayId).catch((e) =>
        this.logger.error(`Webhook ${olayId} işlenemedi: ${e}`),
      );
    });
  }

  /** Emniyet ağı: dürtmesi kaçan ya da hata alan olayları toplar. */
  @Cron(CronExpression.EVERY_MINUTE)
  async bekleyenleriIsle(): Promise<void> {
    if (this.calisiyor) return;
    this.calisiyor = true;
    try {
      const bekleyenler = await this.prisma.webhookOlayi.findMany({
        where: { islendi: false, denemeSayisi: { lt: AZAMI_DENEME } },
        orderBy: { alindi: 'asc' },
        take: 50,
      });
      for (const o of bekleyenler) {
        await this.tekOlayIsle(o.id).catch((e) =>
          this.logger.error(`Webhook ${o.id}: ${e}`),
        );
      }
    } finally {
      this.calisiyor = false;
    }
  }

  /** İşlenmekte olan olaylar — AYNI olay aynı anda iki kez işlenmesin. */
  private readonly islenenOlaylar = new Set<string>();

  private async tekOlayIsle(olayId: string): Promise<void> {
    // ⚠ 25.09 — AYNI OLAY AYNI ANDA İKİ KEZ İŞLENMESİN: denetleyicinin anlık
    // dürtmesi (`kuyrugaAl`, setImmediate) ile dakikalık tarama, işlenmekte
    // olan (henüz `islendi` olmayan) olayı birlikte alabiliyordu. Tahsilatın
    // kendi yazımları buna dayanıklı (koşullu dunning sıfırlaması, tekil fatura
    // satırı) ama iki "ödemeniz alındı" e-postası (dunning çıkışı ↔ yenileme
    // makbuzu) iki AYRI işlemcide kazanılıp birlikte gidebiliyordu (inceleme
    // M4). Kurulum TEK süreç (dosya başı notu): süreç içi küme yeter; birden
    // çok örnekte olay kirası gerekir.
    if (this.islenenOlaylar.has(olayId)) return;
    this.islenenOlaylar.add(olayId);
    try {
      await this.siparisKilidiyleIsle(olayId);
    } finally {
      this.islenenOlaylar.delete(olayId);
    }
  }

  /**
   * İşlenmekte olan SİPARİŞLER (olay tipi + sipariş kodu) — 28.09. Aynı
   * siparişin İKİ AYRI olayı (anlık denemenin kuyruğa yazdığı + iyzico'nun
   * kendi bildirimi; mutabakat oynatması + gecikmiş gerçek bildirim) aynı anda
   * işlenirse ikisi de tahsilat izini yazılmadan önce okur: iki `durum.degisti`,
   * iki "ödemeniz alındı" (biri dunning çıkışı, diğeri yenileme makbuzu) —
   * 28.09 kod incelemesi. İkinci olay BEKLER: işlenmeden bırakılır, deneme
   * sayılmaz; sonraki tarama onu iz yazıldıktan sonra tekrar olarak işler.
   * `islenenOlaylar` ile aynı katman ve sınır (tek süreç): iki AYRI süreçte
   * `tekOlayIsleKilitli`nin koşullu yazımları korur (`test:dunning-toparlandi` E).
   */
  private readonly islenenSiparisler = new Set<string>();

  /** Sipariş kilidi altında işler; aynı sipariş başka olayla işleniyorsa bekletir. */
  private async siparisKilidiyleIsle(olayId: string): Promise<void> {
    const kayit = await this.prisma.webhookOlayi.findUnique({
      where: { id: olayId },
      select: { olayTipi: true, siparisKodu: true },
    });
    const anahtar = kayit?.siparisKodu ? `${kayit.olayTipi}:${kayit.siparisKodu}` : null;
    if (anahtar && this.islenenSiparisler.has(anahtar)) {
      this.logger.log(`Webhook ${olayId} bekletildi: sipariş ${kayit?.siparisKodu} başka olayla işleniyor`);
      return;
    }
    if (anahtar) this.islenenSiparisler.add(anahtar);
    try {
      await this.tekOlayIsleKilitli(olayId);
    } finally {
      if (anahtar) this.islenenSiparisler.delete(anahtar);
    }
  }

  private async tekOlayIsleKilitli(olayId: string): Promise<void> {
    const olay = await this.prisma.webhookOlayi.findUnique({
      where: { id: olayId },
    });
    if (!olay || olay.islendi) return;
    if (olay.denemeSayisi >= AZAMI_DENEME) return;

    try {
      switch (olay.olayTipi) {
        case 'subscription.order.success':
          await this.basariliTahsilat(olay.abonelikKodu!, olay.siparisKodu!);
          break;

        case 'subscription.order.failure':
          await this.basarisizTahsilat(olay.abonelikKodu!, olay.siparisKodu!);
          break;

        default:
          this.logger.warn(`Bilinmeyen olay tipi: ${olay.olayTipi}`);
      }

      await this.prisma.webhookOlayi.update({
        where: { id: olayId },
        data: { islendi: true, islenmeZamani: new Date(), hata: null },
      });
    } catch (e: unknown) {
      const mesaj = e instanceof Error ? e.message : String(e);
      await this.prisma.webhookOlayi.update({
        where: { id: olayId },
        data: { denemeSayisi: { increment: 1 }, hata: mesaj },
      });
      throw e;
    }
  }

  private async basariliTahsilat(abonelikKodu: string, siparisKodu: string) {
    // `null`: bilinmeyen abonelik · havale satırı (çift tahsilat dalı) ·
    // ZATEN UYGULANMIŞ sipariş (28.09, tahsilat izi — fatura/makbuz/e-posta yok).
    const sonuc = await this.abonelik.tahsilatBasarili(abonelikKodu, siparisKodu);
    if (!sonuc) return;

    // Fatura kuyruğa alınır — burada kesilmez. Paraşüt yavaşsa ya da
    // ölüyse webhook işlemesi bundan etkilenmemeli.
    //
    // ⚠ 28.09 — TUTAR ve ÖDEME ANI iyzico siparişinin KENDİ kaydından (tek
    // kural: `tahsilEdilenTutar` / `odemeAni`, iyzico/tahsilat-kaniti.ts).
    // Eskiden `paidPrice ?? paket fiyatı`: ölçülen alan `price` ATLANIYOR,
    // aboneliğin O ANKİ paketinin fiyatı faturaya yazılıyordu. Emre kararı
    // (28.09): tutar okunamazsa fatura kuyruğa ALINMAZ — uydurulmaz. Olay yine
    // işlendi sayılır (erişim ve dunning yazıldı; yeniden deneme tutarı
    // getirmez); yöneticiye son günlü uyarı gider, gece mutabakatı siparişi
    // "elle fatura" sayar (mutabakat.job.ts, kural 7).
    //
    // `cekim` fatura, makbuz ve dunning'in "ödemeniz alındı"sının ORTAK
    // tutarıdır; para birimi de siparişten (yoksa paketin — ölçümde her
    // siparişte vardı).
    const tahsil = tahsilEdilenTutar(sonuc.siparis);
    const cekim = tahsil
      ? { tutar: tahsil.tutar, paraBirimi: tahsil.paraBirimi ?? sonuc.abonelik.paketSurumu.paraBirimi }
      : null;
    const donemBasi = iyzicoTarihi(sonuc.siparis?.startPeriod);
    // Ödeme anı: iyzico'nun başarılı denemesi; yoksa dönem başı (iyzico dönem
    // başında çeker); o da yoksa işleme anı (son çare).
    const odemeTarihi = odemeAni(sonuc.siparis) ?? donemBasi ?? new Date();
    // ÖDENEN paket: yükseltme bekliyorken dönemi ödenmiş olan eski paket
    // (`odenenPaketSurumuId`, paket-degisimi.servisi — eski halkanın geç
    // gelen siparişi); değilse tahsilatın hizaladığı etkin paket. Fatura ve
    // makbuz AYNI paketi yazar. BİLİNEN SINIR (kod incelemesi, ÇIKARIM):
    // kilit kalktıktan SONRA işlenen eski halka siparişi yeni paketi alır —
    // o yol yalnız mutabakattan gelebilir ve kural 7e/7b onu oynatmaz.
    const odenenPaket = sonuc.abonelik.odenenPaketSurumuId ?? sonuc.abonelik.paketSurumuId;
    let yeniTahsilat = false;
    if (!cekim) {
      await this.tutarsizTahsilatiBildir({
        abonelikId: sonuc.abonelik.id,
        firmaId: sonuc.abonelik.firmaId,
        abonelikKodu,
        siparisKodu,
        odeme: odemeTarihi,
      });
    } else {
      yeniTahsilat = await this.fatura.kuyrugaAl({
        abonelikId: sonuc.abonelik.id,
        tahsilatKodu: siparisKodu,
        tutar: cekim.tutar,
        paraBirimi: cekim.paraBirimi,
        // Tarih TEK cozucuden (24.09): rakam-dizesi `new Date` ile Invalid Date
        // olup faturayi yazdirmiyordu. Cozulemezse eksik gibi: tahsilat ani.
        donemBasi: donemBasi ?? new Date(),
        donemSonu: sonuc.donemSonu,
        tahsilatTarihi: odemeTarihi,
        paketSurumuId: odenenPaket,
      });
    }

    // Dunning'den çıktıysa "geri hoş geldiniz" bildirimi. ⚠ Karar
    // `tahsilatBasarili`nin sayaçları SIFIRLARKEN verdiği cevaptan gelir
    // (`dunningdenCikti`); satır bundan sonra okunursa döngü izi silinmiş olur.
    // ⚠ KRİTİK DEĞİL (satın alma / havale / paket değişimi postasıyla aynı
    // kural): posta sunucusu düştü diye doğrulanmış tahsilat olayı
    // düşürülmez — yeniden deneme e-postayı zaten gönderemezdi (döngü izi
    // silindi), yalnız tahsilat yolunu boşuna yeniden koştururdu. Ama SESSİZ
    // değil: hata günlüğe yazılır. 28.09: e-posta ÇEKİLEN tutarı yazar
    // (`cekim`; okunamadıysa tutarsız cümle — paket fiyatı uydurulmaz).
    await this.dunning
      .tahsilatToparlandi(sonuc.abonelik.id, sonuc.dunningdenCikti, cekim)
      .catch((e) =>
        this.logger.error(
          `"Ödemeniz alındı" e-postası gönderilemedi (abonelik=${sonuc.abonelik.id}): ` +
            `${e instanceof Error ? e.message : String(e)}`,
        ),
      );

    // 25.09 — SORUNSUZ YENİLEME: "ödemeniz alındı" bugüne kadar YALNIZ
    // dunning'den çıkışta gidiyordu. TAM BİR KEZ: yalnız bu tahsilatın fatura
    // satırı İLK KEZ yazıldıysa (tahsilat kodu tekil — webhook tekrarı ve
    // mutabakat oynatması `false` alır) ve dunning'den ÇIKILMADIYSA (o hâlde
    // yukarıdaki e-posta gitti; aynı ödemeye iki "ödemeniz alındı" gitmez).
    // Kritik değil: posta hatası doğrulanmış tahsilatı düşürmez, günlüğe yazılır.
    // 28.09: makbuz faturanın AYNI tutarını ve paketini yazar; tutar
    // okunamadıysa fatura da makbuz da yok (`yeniTahsilat` false).
    // 28.09: ESKİ DÖNEM siparişine makbuz GİTMEZ (`sonuc.eskiDonem`): sorunsuz
    // yenileme değil, geç uygulanan eski dönemdir — dunning'deki müşteri kısıt
    // sürerken "ödemeniz alındı" okurdu. Faturası yine kuyrukta.
    if (cekim && yeniTahsilat && !sonuc.dunningdenCikti && !sonuc.eskiDonem) {
      await this.odemeAlindiBildir({
        abonelikId: sonuc.abonelik.id,
        paketSurumuId: odenenPaket,
        tutar: cekim.tutar,
        paraBirimi: cekim.paraBirimi,
        donemBasi,
        donemSonu: sonuc.donemSonu,
      }).catch((e) =>
        this.logger.error(
          `Yenileme "ödemeniz alındı" e-postası gönderilemedi (abonelik=${sonuc.abonelik.id}): ` +
            `${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }
  }

  /**
   * 28.09 — TUTARI OKUNAMAYAN tahsilat (Emre kararı "kuyruğa alma, uyar"):
   * fatura yazılmadı; yöneticiye NES iş akışının kanalından (yönetim
   * e-postası) SON GÜNLÜ uyarı gider — faturayı elle o keser. Yalnız gece
   * günlüğüne kalsaydı VUK'un 7 günü içinde kimse görmeyebilirdi (kod
   * incelemesi). Posta best-effort (`yonetimeYaz` fırlatmaz; gönderilemezse
   * içerik HATA günlüğünde kalır); denetim izinin veritabanı hatası fırlar —
   * olay yeniden denenir.
   *
   * Sipariş başına BİR uyarı: anlık deneme olayı ile iyzico'nun kendi
   * bildirimi aynı siparişi iki olay olarak işleyebilir (kod incelemesi
   * 28.09). Çapa `TUTAR_OKUNAMADI_OLAYI` denetim izidir — `tahsilat.cift` ile
   * aynı anlık görüntü deseni: eşzamanlı iki işlemede iki uyarı gidebilir
   * (zararsız). Hata günlüğü her işlemede yazılır.
   */
  private async tutarsizTahsilatiBildir(p: {
    abonelikId: string;
    firmaId: string;
    abonelikKodu: string;
    siparisKodu: string;
    odeme: Date;
  }): Promise<void> {
    const sonGun = sonDuzenlemeGunu(p.odeme);
    this.logger.error(
      `FATURA KUYRUĞA ALINMADI: sipariş ${p.siparisKodu} (abonelik ${p.abonelikId}) — iyzico siparişi ` +
        `tahsil edilen tutarı taşımıyor (price/paidPrice). Tutar UYDURULMADI; NES'te elle kesin — ` +
        `son düzenleme günü ${tarihYaz(sonGun)}.`,
    );
    const onceki = await this.prisma.abonelikOlayi.findMany({
      where: { abonelikId: p.abonelikId, tip: TUTAR_OKUNAMADI_OLAYI },
      select: { veri: true },
    });
    if (tutarIziVarMi(onceki, p.siparisKodu)) {
      this.logger.warn(
        `Tutarı okunamayan tahsilat zaten bildirildi: sipariş ${p.siparisKodu} (abonelik ${p.abonelikId}) — ikinci uyarı yazılmadı`,
      );
      return;
    }
    await this.prisma.abonelikOlayi.create({
      data: {
        abonelikId: p.abonelikId,
        tip: TUTAR_OKUNAMADI_OLAYI,
        aciklama:
          `Kart tahsilatının tutarı okunamadı (sipariş ${p.siparisKodu}) — fatura kuyruğa ALINMADI; ` +
          `NES'te elle kesilmeli, son düzenleme günü ${tarihYaz(sonGun)}`,
        veri: {
          abonelikKodu: p.abonelikKodu,
          siparisKodu: p.siparisKodu,
          odemeAni: p.odeme.toISOString(),
          sonDuzenlemeGunu: sonGun.toISOString(),
        },
        aktor: 'webhook',
      },
    });
    const firma = await this.prisma.firma
      .findUnique({ where: { id: p.firmaId }, select: { ad: true } })
      .catch(() => null);
    const firmaAdi = firma?.ad ?? p.firmaId;
    await yonetimeYaz(
      { prisma: this.prisma, eposta: this.eposta, logger: this.logger },
      {
        konu: `[MetaPriceX] Fatura kuyruğa alınamadı — tutar okunamadı — ${firmaAdi} — ${p.siparisKodu}`,
        baslik: 'Kart tahsilatının tutarı okunamadı',
        paragraflar: [
          `Firma: ${firmaAdi} · abonelik kaydı: ${p.abonelikId}`,
          `iyzico aboneliği: ${p.abonelikKodu} · sipariş: ${p.siparisKodu}`,
          `Ödeme tarihi: ${tarihYaz(p.odeme)} · Son düzenleme günü: ${tarihYaz(sonGun)} (VUK md. 231/5)`,
          'iyzico siparişi tahsil edilen tutarı taşımıyor. Tutar UYDURULMADI: fatura kuyruğa ALINMADI, ' +
            'müşteriye giden e-postaya tutar yazılmadı.',
          "Yapılacak: çekilen tutarı iyzico panelinden okuyup faturayı NES'te elle kesin.",
        ],
      },
    );
  }

  /** Sorunsuz yenilemenin makbuzu — metin `musteri-epostalari.ts`. */
  private async odemeAlindiBildir(p: {
    abonelikId: string;
    /** ÖDENEN paket sürümü (faturayla aynı) — satırın o anki paketi değil. */
    paketSurumuId: string;
    tutar: number;
    paraBirimi: string;
    donemBasi: Date | null;
    donemSonu: Date;
  }): Promise<void> {
    // Servis yalnız 4 argümanlı ESKİ test fikstürlerinde yoktur: Nest onu
    // zorunlu çözer (kapı: `test:musteri-epostalari` N3). O fikstürler
    // günlüğün temizliğini ölçtüğü için iz DEBUG seviyesinde.
    if (!this.eposta) {
      this.logger.debug(`"Ödemeniz alındı" atlandı (e-posta servisi yok): abonelik=${p.abonelikId}`);
      return;
    }
    const ab = await this.prisma.abonelik.findUnique({
      where: { id: p.abonelikId },
      select: { firmaId: true },
    });
    if (!ab) return;
    const surum = await this.prisma.paketSurumu.findUnique({
      where: { id: p.paketSurumuId },
      select: { paket: { select: { ad: true } } },
    });
    const firma = await this.prisma.firma.findUnique({
      where: { id: ab.firmaId },
      select: { ad: true, faturaEposta: true, yetkiliEposta: true },
    });
    const kime = firma?.faturaEposta ?? firma?.yetkiliEposta;
    if (!firma || !kime) {
      this.logger.warn(`"Ödemeniz alındı" ATLANDI: firma ${ab.firmaId} için adres yok`);
      return;
    }
    await this.eposta.gonder({
      kime,
      ...odemeAlindiEpostasi({
        firmaAdi: firma.ad,
        paketAdi: surum?.paket?.ad ?? 'MetaPriceX',
        tutar: p.tutar,
        paraBirimi: p.paraBirimi,
        donemBasi: p.donemBasi,
        donemSonu: p.donemSonu,
        uygulamaUrl: process.env.UYGULAMA_URL ?? '',
      }),
    });
  }

  private async basarisizTahsilat(abonelikKodu: string, siparisKodu: string) {
    const ab = await this.abonelik.tahsilatBasarisiz(abonelikKodu, siparisKodu);
    if (!ab) return;
    // İlk bildirimi hemen gönder; sonraki kademeler zamanlayıcıdan gelir.
    await this.dunning.ilkBildirim(ab.id, siparisKodu);
  }
}
