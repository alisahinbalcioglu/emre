import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikDurumu } from '@prisma/client';
import { IyzicoClient } from '../iyzico/iyzico.client';
import { AbonelikServisi } from '../abonelik/abonelik.servisi';
import { EpostaServisi } from '../eposta/eposta.servisi';
import {
  DUNNING_METINLERI,
  tarihYaz,
  tutarYaz,
} from './dunning.metinleri';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Dunning — başarısız ödemeyi kurtarma
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  KRİTİK BİLGİ: iyzico başarısız tahsilatı KENDİLİĞİNDEN TEKRARLAMIYOR.
 *
 *  Dokümanda otomatik bir yeniden deneme takvimi yok; yazan şu:
 *  "Başarısız ödeme işlemleri için, retry servisi ile veya iyzico kontrol
 *   paneli üzerinden tekrar ödeme işlemi denenebilir."
 *  Yani tetiği siz çekeceksiniz. Bu dosya onu yapıyor.
 *
 *  Pencere: başarısızlıktan sonra EN FAZLA 160 GÜN. Sonrasında o abonelik
 *  için yeniden deneme yapılamıyor.
 *
 *  Merdiven (gün, başarısızlıktan itibaren):
 *      0   → bildirim + kart güncelleme bağlantısı
 *      3   → yeniden dene, olmazsa 2. bildirim
 *      7   → yeniden dene, olmazsa 3. bildirim ("N gün sonra kısıtlanacak")
 *      10  → KISITLI (salt okunur) + bildirim
 *      20  → yeniden dene, olmazsa son uyarı
 *      30  → ASKIDA + bildirim
 *
 *  Süreler ortam değişkenleriyle ayarlanabilir; müşteri profilinize göre
 *  uzatmak isteyebilirsiniz. Taahhüt sektöründe muhasebe döngüsü yavaştır,
 *  10 gün agresif olabilir — 14/45 gibi değerler daha uygun olabilir.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Basamak {
  gun: number;
  tekrarDene: boolean;
  metinAnahtari: keyof typeof DUNNING_METINLERI | null;
  yeniDurum?: AbonelikDurumu;
}

@Injectable()
export class DunningServisi {
  private readonly logger = new Logger(DunningServisi.name);
  private readonly basamaklar: Basamak[];
  private readonly uygulamaUrl: string;

  /** iyzico'nun yeniden deneme penceresi. Aşılırsa denemeyi bırakırız. */
  private readonly AZAMI_GUN = 160;

  constructor(
    private readonly prisma: PrismaService,
    private readonly iyzico: IyzicoClient,
    private readonly abonelik: AbonelikServisi,
    private readonly eposta: EpostaServisi,
    config: ConfigService,
  ) {
    // ⚠ getOrThrow DEGIL: bu servis onyuklemede kurulur; degisken eksikken
    // getOrThrow TUM API'yi dusururdu (bkz. yapilandirma.ts). Dunning
    // e-postasindaki baglanti icin makul bir varsayilana duseriz.
    this.uygulamaUrl =
      config.get<string>('UYGULAMA_URL') ?? 'https://app.metapricex.com';
    const s = (a: string, v: number) => Number(config.get(a) ?? v);
    const basamaklar: Basamak[] = [
      { gun: s('DUNNING_GUN_1', 3), tekrarDene: true, metinAnahtari: 'ikinci' },
      { gun: s('DUNNING_GUN_2', 7), tekrarDene: true, metinAnahtari: 'ucuncu' },
      {
        gun: s('DUNNING_KISIT_GUNU', 10),
        tekrarDene: false,
        metinAnahtari: 'kisitlandi',
        yeniDurum: AbonelikDurumu.KISITLI,
      },
      { gun: s('DUNNING_GUN_3', 20), tekrarDene: true, metinAnahtari: 'sonUyari' },
      {
        gun: s('DUNNING_ASKI_GUNU', 30),
        tekrarDene: false,
        metinAnahtari: 'askiyaAlindi',
        yeniDurum: AbonelikDurumu.ASKIDA,
      },
    ];
    this.basamaklar = basamaklar.sort((a, b) => a.gun - b.gun);
  }

  // ── Webhook geldiğinde: ilk bildirim ────────────────────────────────────
  async ilkBildirim(abonelikId: string, siparisKodu: string): Promise<void> {
    const b = await this.baglam(abonelikId);
    if (!b) return;

    // Aynı başarısızlık döngüsünde ikinci kez ilk bildirim göndermeyelim
    if (b.abonelik.denemeSayisi > 0) return;

    await this.gonder(abonelikId, 'ilk', siparisKodu);
    await this.prisma.abonelik.update({
      where: { id: abonelikId },
      data: { denemeSayisi: 1, sonDeneme: new Date() },
    });
  }

  // ── Günlük merdiven taraması ────────────────────────────────────────────
  @Cron('0 0 10 * * *') // her gün 10:00 — iş saatinde, sabah 3'te değil
  async merdiveniYurut(): Promise<void> {
    const adaylar = await this.prisma.abonelik.findMany({
      where: {
        ilkBasarisizlik: { not: null },
        durum: {
          in: [
            AbonelikDurumu.ODEME_BEKLIYOR,
            AbonelikDurumu.KISITLI,
            AbonelikDurumu.ASKIDA,
          ],
        },
        odemeYontemi: 'KART',
      },
    });

    this.logger.log(`Dunning taraması: ${adaylar.length} abonelik`);

    for (const ab of adaylar) {
      try {
        await this.tekAbonelik(ab.id);
      } catch (e) {
        this.logger.error(`Dunning hatası (${ab.id}): ${e}`);
      }
    }
  }

  private async tekAbonelik(abonelikId: string): Promise<void> {
    const b = await this.baglam(abonelikId);
    if (!b?.abonelik.ilkBasarisizlik) return;
    const ab = b.abonelik;

    const gecenGun = Math.floor(
      (Date.now() - ab.ilkBasarisizlik!.getTime()) / 86_400_000,
    );

    if (gecenGun > this.AZAMI_GUN) {
      this.logger.warn(
        `Abonelik ${abonelikId}: 160 günlük yeniden deneme penceresi aşıldı`,
      );
      if (ab.durum !== AbonelikDurumu.SONA_ERDI) {
        await this.abonelik.durumDegistir(abonelikId, AbonelikDurumu.SONA_ERDI, {
          aciklama: 'iyzico yeniden deneme penceresi (160 gün) doldu',
          aktor: 'dunning',
        });
      }
      return;
    }

    // Bugün hangi basamak? En büyük "gun <= gecenGun" olan basamak.
    const basamak = [...this.basamaklar]
      .reverse()
      .find((x) => gecenGun >= x.gun);
    if (!basamak) return;

    // Bu basamak zaten uygulandı mı? denemeSayisi basamak sırasını tutuyor.
    const basamakNo = this.basamaklar.indexOf(basamak) + 2; // ilk bildirim = 1
    if (ab.denemeSayisi >= basamakNo) return;

    // ── Yeniden tahsilat denemesi ────────────────────────────────────────
    if (basamak.tekrarDene && ab.iyzicoAbonelikKodu) {
      const sonSiparis = await this.sonBasarisizSiparis(ab.iyzicoAbonelikKodu);
      if (sonSiparis) {
        try {
          await this.iyzico.tahsilatiTekrarla(sonSiparis);
          await this.abonelik.olayYaz(abonelikId, 'dunning.tekrar.denendi', {
            aciklama: `Basamak ${basamakNo} — sipariş ${sonSiparis}`,
            aktor: 'dunning',
          });
          // Sonucu webhook getirecek. Başarılıysa tahsilatToparlandi()
          // çalışıp sayaçları sıfırlayacak. Burada bekleyip bildirim
          // göndermiyoruz — 24 saat sonraki tarama devam ettirir.
          await this.prisma.abonelik.update({
            where: { id: abonelikId },
            data: { denemeSayisi: basamakNo, sonDeneme: new Date() },
          });
          return;
        } catch (e) {
          this.logger.warn(`Yeniden deneme reddedildi (${abonelikId}): ${e}`);
        }
      }
    }

    // ── Durum düşürme ────────────────────────────────────────────────────
    if (basamak.yeniDurum && ab.durum !== basamak.yeniDurum) {
      await this.abonelik.durumDegistir(abonelikId, basamak.yeniDurum, {
        aciklama: `Dunning basamağı: ${gecenGun}. gün`,
        aktor: 'dunning',
      });
      if (basamak.yeniDurum === AbonelikDurumu.KISITLI) {
        await this.prisma.abonelik.update({
          where: { id: abonelikId },
          data: { kisitlandi: new Date() },
        });
      }
    }

    // ── Bildirim ─────────────────────────────────────────────────────────
    if (basamak.metinAnahtari) {
      await this.gonder(abonelikId, basamak.metinAnahtari);
    }

    await this.prisma.abonelik.update({
      where: { id: abonelikId },
      data: { denemeSayisi: basamakNo, sonDeneme: new Date() },
    });
  }

  // ── Tahsilat toparlandığında ────────────────────────────────────────────
  async tahsilatToparlandi(abonelikId: string): Promise<void> {
    const b = await this.baglam(abonelikId);
    if (!b) return;
    // Zaten sorunsuzsa "geri hoş geldiniz" göndermeyelim
    if (!b.abonelik.ilkBasarisizlik && b.abonelik.denemeSayisi === 0) return;
    await this.gonder(abonelikId, 'toparlandi');
  }

  // ── Yardımcılar ─────────────────────────────────────────────────────────
  private async baglam(abonelikId: string) {
    const abonelik = await this.prisma.abonelik.findUnique({
      where: { id: abonelikId },
      include: { paketSurumu: { include: { paket: true } } },
    });
    if (!abonelik) return null;

    const firma = await this.prisma.firma.findUnique({
      where: { id: abonelik.firmaId },
      select: { ad: true, faturaEposta: true, yetkiliEposta: true },
    });
    if (!firma) return null;

    return { abonelik, firma };
  }

  /** Başarısızlık webhook'undan gelen en güncel orderReferenceCode. */
  private async sonBasarisizSiparis(
    abonelikKodu: string,
  ): Promise<string | null> {
    const olay = await this.prisma.webhookOlayi.findFirst({
      where: {
        abonelikKodu,
        olayTipi: 'subscription.order.failure',
      },
      orderBy: { alindi: 'desc' },
      select: { siparisKodu: true },
    });
    return olay?.siparisKodu ?? null;
  }

  private async gonder(
    abonelikId: string,
    anahtar: keyof typeof DUNNING_METINLERI,
    siparisKodu?: string,
  ): Promise<void> {
    const b = await this.baglam(abonelikId);
    if (!b) return;
    const { abonelik: ab, firma } = b;

    // Kart güncelleme bağlantısı — dunning'in asıl işi bu.
    let kartUrl = `${this.uygulamaUrl}/abonelik/kart`;
    if (ab.iyzicoAbonelikKodu) {
      // Barındırılan formu doğrudan e-postaya koymuyoruz; kendi
      // sayfamıza yollayıp formu orada açıyoruz. Böylece token süresi
      // dolarsa kullanıcı boş sayfayla karşılaşmaz.
      kartUrl = `${this.uygulamaUrl}/abonelik/kart?a=${ab.id}`;
    }

    const kisitGunu = Number(
      process.env.DUNNING_KISIT_GUNU ?? 10,
    );
    const askiGunu = Number(process.env.DUNNING_ASKI_GUNU ?? 30);
    const temel = ab.ilkBasarisizlik ?? new Date();
    const kisitTarihi = new Date(temel);
    kisitTarihi.setDate(kisitTarihi.getDate() + kisitGunu);
    const askiTarihi = new Date(temel);
    askiTarihi.setDate(askiTarihi.getDate() + askiGunu);

    const gecenGun = Math.floor((Date.now() - temel.getTime()) / 86_400_000);

    const metin = DUNNING_METINLERI[anahtar]({
      firmaAdi: firma.ad,
      paketAdi: ab.paketSurumu.paket.ad,
      tutar: tutarYaz(Number(ab.paketSurumu.tutar), ab.paketSurumu.paraBirimi),
      kalanGun: Math.max(0, kisitGunu - gecenGun),
      kisitTarihi: tarihYaz(
        anahtar === 'sonUyari' ? askiTarihi : kisitTarihi,
      ),
    });

    await this.eposta.gonder({
      kime: firma.faturaEposta ?? firma.yetkiliEposta,
      konu: metin.konu,
      baslik: metin.baslik,
      paragraflar: metin.govde,
      dugme: { etiket: metin.dugmeEtiketi, url: kartUrl },
      altNot: metin.altNot,
    });

    await this.abonelik.olayYaz(abonelikId, `dunning.eposta.${anahtar}`, {
      aciklama: metin.konu,
      veri: { siparisKodu, kime: firma.faturaEposta ?? firma.yetkiliEposta },
      aktor: 'dunning',
    });
  }
}
