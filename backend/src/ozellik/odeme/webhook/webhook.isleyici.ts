import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikServisi } from '../abonelik/abonelik.servisi';
import { FaturaServisi } from '../fatura/fatura.servisi';
import { DunningServisi } from '../dunning/dunning.servisi';
import { EpostaServisi } from '../eposta/eposta.servisi';
import { odemeAlindiEpostasi } from '../eposta/musteri-epostalari';
import { iyzicoTarihi } from '../iyzico/iyzico-tarihi';

/**
 * Olay basina deneme siniri. Asan olay "olu"dur: tarama onu bir daha almaz.
 * Gece mutabakati kendi yeniden oynattigi olu olayi bu sinira bakarak
 * yeniden kurar (mutabakat.job.ts → KAYIP TAHSILAT, kural 4).
 */
export const AZAMI_DENEME = 5;

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
      await this.tekOlayIsleKilitli(olayId);
    } finally {
      this.islenenOlaylar.delete(olayId);
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
    const sonuc = await this.abonelik.tahsilatBasarili(abonelikKodu, siparisKodu);
    if (!sonuc) return;

    // Fatura kuyruğa alınır — burada kesilmez. Paraşüt yavaşsa ya da
    // ölüyse webhook işlemesi bundan etkilenmemeli.
    const tutar = sonuc.siparis?.paidPrice ?? Number(sonuc.abonelik.paketSurumu.tutar);
    const paraBirimi = sonuc.abonelik.paketSurumu.paraBirimi;
    const donemBasi = iyzicoTarihi(sonuc.siparis?.startPeriod);
    const yeniTahsilat = await this.fatura.kuyrugaAl({
      abonelikId: sonuc.abonelik.id,
      tahsilatKodu: siparisKodu,
      tutar,
      paraBirimi,
      // Tarih TEK cozucuden (24.09): rakam-dizesi `new Date` ile Invalid Date
      // olup faturayi yazdirmiyordu. Cozulemezse eksik gibi: tahsilat ani.
      donemBasi: donemBasi ?? new Date(),
      donemSonu: sonuc.donemSonu,
    });

    // Dunning'den çıktıysa "geri hoş geldiniz" bildirimi. ⚠ Karar
    // `tahsilatBasarili`nin sayaçları SIFIRLARKEN verdiği cevaptan gelir
    // (`dunningdenCikti`); satır bundan sonra okunursa döngü izi silinmiş olur.
    // ⚠ KRİTİK DEĞİL (satın alma / havale / paket değişimi postasıyla aynı
    // kural): posta sunucusu düştü diye doğrulanmış tahsilat olayı
    // düşürülmez — yeniden deneme e-postayı zaten gönderemezdi (döngü izi
    // silindi), yalnız tahsilat yolunu boşuna yeniden koştururdu. Ama SESSİZ
    // değil: hata günlüğe yazılır.
    await this.dunning
      .tahsilatToparlandi(sonuc.abonelik.id, sonuc.dunningdenCikti)
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
    if (yeniTahsilat && !sonuc.dunningdenCikti) {
      await this.odemeAlindiBildir({
        abonelikId: sonuc.abonelik.id,
        tutar,
        paraBirimi,
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

  /** Sorunsuz yenilemenin makbuzu — metin `musteri-epostalari.ts`. */
  private async odemeAlindiBildir(p: {
    abonelikId: string;
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
      select: { firmaId: true, paketSurumu: { select: { paket: { select: { ad: true } } } } },
    });
    if (!ab) return;
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
        paketAdi: ab.paketSurumu?.paket?.ad ?? 'MetaPriceX',
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
