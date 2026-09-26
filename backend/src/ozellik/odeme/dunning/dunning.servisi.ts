import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikDurumu, OdemeYontemi, Prisma } from '@prisma/client';
import { IyzicoAbonelikDetayi, IyzicoClient, IyzicoHatasi } from '../iyzico/iyzico.client';
import { kullaniciyaMesaj } from '../iyzico/iyzico-hata.filter';
import { odenmisSiparisMi, siparisiBul, yenidenDenemeHedefi } from '../iyzico/tahsilat-kaniti';
import { AbonelikServisi } from '../abonelik/abonelik.servisi';
import { kartGuncellenebilirMi } from '../abonelik/kart-kapatma';
import { EpostaServisi } from '../eposta/eposta.servisi';
import {
  DUNNING_METINLERI,
  tarihYaz,
  tutarYaz,
} from './dunning.metinleri';
import { dunningKisitGunu, kisitlamayaKalanGun } from './kisit-gunu';
import {
  AnindaDenemeSonucu,
  KIRA_RET_MS,
  KIRA_SONUC_MS,
  YENIDEN_DENEME_PENCERESI_GUN,
  anindaDenemeEngeli,
  denemeHatasiSinifi,
} from './tahsilat-kirasi';

/** Anlık denemenin kuyruğa yazdığı başarı olayının kaynağı (`WebhookOlayi.kaynak`, tekil anahtar öneki). */
export const ANINDA_DENEME_KAYNAGI = 'aninda-deneme';

/** Günlük ve olay için hata metni. */
function hataMetni(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

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
  private readonly AZAMI_GUN = YENIDEN_DENEME_PENCERESI_GUN;

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

    // ⚠ 26.09 — BİR TAHSİLAT DENEMESİ SÜRÜYOR YA DA SONUCU BEKLENİYOR: müşteri
    // kartını güncelleyip ödemeyi az önce denetti (`anindaDene`) ya da önceki
    // denemenin yanıtı gelmedi. Basamak BUGÜN uygulanmaz — ne yeni çekim, ne
    // durum düşürme, ne bildirim: ödeyen müşteriye "kısıtlandı" gitmesin, belirsiz
    // çekimin üstüne ikinci çekim gelmesin. Yarınki tarama taze bilgiyle bakar
    // (kira `KIRA_SONUC_MS` = 20 sa, ertesi 10:00'dan önce biter).
    if (ab.tahsilatKirasi && ab.tahsilatKirasi.getTime() > Date.now()) {
      this.logger.log(
        `Abonelik ${abonelikId}: tahsilat denemesi sürüyor ya da sonucu bekleniyor ` +
          `(kira ${ab.tahsilatKirasi.toISOString()}) — basamak ${basamakNo} yarına`,
      );
      return;
    }

    // ── Yeniden tahsilat denemesi ────────────────────────────────────────
    if (basamak.tekrarDene && ab.iyzicoAbonelikKodu) {
      const sonSiparis = await this.sonBasarisizSiparis(ab.iyzicoAbonelikKodu);
      if (sonSiparis) {
        // KİRA (26.09): müşterinin anlık denemesiyle AYNI kira. Satır okunduktan
        // sonra müşteri kazandıysa iyzico'ya GİDİLMEZ, basamak yarına kalır.
        const kira = await this.kiraAl(abonelikId, new Date());
        if (!kira) {
          this.logger.log(`Abonelik ${abonelikId}: kira başka bir denemede — basamak ${basamakNo} yarına`);
          return;
        }
        // ⚠ `try` YALNIZ iyzico cagrisini sarar (24.09): basarili denemeden
        // sonra olay/DB yazmasi duserse bu RED DEGILDIR. Eskiden catch'e
        // dusuyor ve odeme alinmisken "tekrar denedik, yine alinamadi"
        // e-postasi gidiyordu.
        let basarili = false;
        let hata: unknown;
        try {
          await this.iyzico.tahsilatiTekrarla(sonSiparis);
          basarili = true;
        } catch (e) {
          hata = e;
        }
        // Kira YALNIZ kesin retde kısalır (para çekilmedi); başarılı ya da
        // belirsiz denemede UZUN kalır — müşteri 10 dk sonra ikinci çekimi
        // tetikleyemesin. Merdivenin bildirim kararı aşağıda DEĞİŞMEDİ.
        if (!basarili && denemeHatasiSinifi(hata) === 'reddedildi') {
          await this.kiraKisalt(abonelikId, kira).catch((e) =>
            this.logger.error(`Kira kısaltılamadı (${abonelikId}): ${e instanceof Error ? e.message : String(e)}`),
          );
        }
        if (basarili) {
          await this.abonelik.olayYaz(abonelikId, 'dunning.tekrar.denendi', {
            aciklama: `Basamak ${basamakNo} — sipariş ${sonSiparis}`,
            aktor: 'dunning',
          });
          // Sonucu webhook getirecek. Başarılıysa `tahsilatBasarili`
          // sayaçları sıfırlar, `tahsilatToparlandi` "ödemeniz alındı"
          // e-postasını gönderir. Burada bekleyip bildirim göndermiyoruz —
          // 24 saat sonraki tarama devam ettirir.
          await this.prisma.abonelik.update({
            where: { id: abonelikId },
            data: { denemeSayisi: basamakNo, sonDeneme: new Date() },
          });
          return;
        }
        // ⚠ ZAMAN ASIMI RED DEGILDIR (24.09): iyzico yeniden denemeyi yapmis
        // olabilir, yalniz yaniti gelmedi. Basamak BIR KEZ ertelenir: bildirim
        // gitmez, basamak islenmis sayilmaz, yarinki tarama taze bilgiyle
        // bakar (basarili cekim o arada webhook/mutabakatla aboneligi
        // listeden cikarir). Ayni basamakta IKINCI zaman asiminda bildirim
        // GIDER: sinirsiz erteleme her gun yeni bir deneme ve hic gitmeyen on
        // uyarilar demekti — musteri uyarisiz kisitlanirdi.
        const zamanAsimi = hata instanceof IyzicoHatasi && hata.zamanAsimi;
        if (zamanAsimi && !(await this.basamakErtelendiMi(abonelikId, ab.ilkBasarisizlik!, basamak.gun))) {
          const mesaj = (hata as Error).message;
          this.logger.warn(
            `Yeniden deneme SONUCU BILINMIYOR (${abonelikId}): ${mesaj} — bildirim bir gun ertelendi`,
          );
          await this.abonelik.olayYaz(abonelikId, 'dunning.tekrar.belirsiz', {
            aciklama: `Basamak ${basamakNo} — sipariş ${sonSiparis}: ${mesaj}`,
            aktor: 'dunning',
          });
          return;
        }
        this.logger.warn(
          zamanAsimi
            ? `Yeniden deneme yine YANITSIZ (${abonelikId}): erteleme hakki kullanildi, bildirim gidiyor`
            : `Yeniden deneme reddedildi (${abonelikId}): ${hata}`,
        );
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
  /**
   * "Ödemeniz alındı" — yalnız başarısız tahsilat döngüsünden ÇIKAN aboneliğe.
   *
   * ⚠ 24.09 — DÖNGÜ BİLGİSİ ÇAĞIRANDAN GELİR, satırdan OKUNMAZ. Tek çağıran
   * `WebhookIsleyici.basariliTahsilat`; ondan önce koşan
   * `AbonelikServisi.tahsilatBasarili` dunning sayaçlarını SIFIRLAR. Eski hâl
   * satırı burada yeniden okuyup "ilkBasarisizlik boş, denemeSayisi 0"
   * görüyordu: e-posta HİÇBİR müşteriye gitmiyordu. `dunningdenCikti`
   * sıfırlamanın KENDİSİNDEN gelir (koşullu yazma) — kural orada, tek yerde.
   * Posta hatası FIRLATIR; çağıran yutar ve günlüğe yazar.
   */
  async tahsilatToparlandi(abonelikId: string, dunningdenCikti: boolean): Promise<void> {
    // Zaten sorunsuzsa "geri hoş geldiniz" göndermeyelim
    if (!dunningdenCikti) return;
    await this.gonder(abonelikId, 'toparlandi');
  }

  // ── Kart güncellemesinden sonra ANLIK deneme (26.09.2026) ──────────────
  /**
   * Emre kararı (26.09): kart güncellenince bekleyen ödeme HEMEN bir kez
   * yeniden tahsil edilir. Tetikleyen OTURUMLU uçtur (`POST /abonelik/odeme-
   * tekrar-dene`, yalnız firma sahibi, hız sınırlı) — çapraz-site ve oturumsuz
   * kart dönüş ucu para çeken bir işi TETİKLEMEZ.
   *
   * SIRA: ön koşul (saf) → aday siparişler (bildirimler) → KİRA (koşullu
   * yazım; kaybeden iyzico'ya gitmez) → hedefi iyzico'ya SOR (listede,
   * ödenmemiş, reddi doğrulanmış) → yeniden deneme (POST — PARA ÇEKER,
   * kendiliğinden yeniden DENENMEZ) → ödendi mi SOR.
   *
   * BAŞARI YOLU YENİ DEĞİL: sipariş iyzico'da ödenmiş görünürse webhook
   * işleyicisinin kuyruğuna başarı olayı yazılır (gece mutabakatının kayıp
   * tahsilat kalıbı). İşleyici `tahsilatBasarili` (ödemeyi iyzico'ya YENİDEN
   * sorar) + fatura + "ödemeniz alındı"yı koşar; iyzico'nun kendi webhook'u da
   * gelirse koşullu sıfırlama ve tekil fatura satırı ikinci e-postayı keser.
   * Bu metot E-POSTA GÖNDERMEZ.
   */
  async anindaDene(firmaId: string): Promise<AnindaDenemeSonucu> {
    const simdi = new Date();
    const ab = await this.prisma.abonelik.findUnique({ where: { firmaId } });
    const engel = anindaDenemeEngeli(ab, !!ab && kartGuncellenebilirMi(ab), simdi);
    if (engel || !ab?.iyzicoAbonelikKodu) {
      this.logger.log(`Anında deneme gerekmedi (firma ${firmaId}): ${engel ?? 'kod yok'}`);
      return { sonuc: 'gerekmiyor' };
    }
    const abonelikKodu = ab.iyzicoAbonelikKodu;

    const adaylar = await this.basarisizSiparisAdaylari(abonelikKodu);
    if (adaylar.length === 0) {
      await this.anindaIz(ab.id, 'dunning.aninda.yapilamadi', 'başarısızlık bildirimi yok — hedef sipariş bilinmiyor');
      return { sonuc: 'yapilamadi' };
    }

    const kira = await this.kiraAl(ab.id, simdi);
    if (!kira) {
      // Kira başkasında YA DA satır arada döngüden çıktı (ödendi, havale).
      const guncel = await this.prisma.abonelik.findUnique({
        where: { id: ab.id },
        select: { tahsilatKirasi: true, ilkBasarisizlik: true },
      });
      const k = guncel?.tahsilatKirasi;
      if (guncel?.ilkBasarisizlik && k && k.getTime() > simdi.getTime()) {
        return { sonuc: 'zaten-deneniyor', kiraBitis: k.toISOString() };
      }
      return { sonuc: 'gerekmiyor' };
    }

    // Hedef iyzico'ya SORULUR (GET: kopan bağlantıda kendiliğinden yeniden denenir).
    let detay: IyzicoAbonelikDetayi;
    try {
      detay = await this.iyzico.abonelikGetir(abonelikKodu);
    } catch (e) {
      await this.kiraBirak(ab.id, kira);
      await this.anindaIz(ab.id, 'dunning.aninda.yapilamadi', `iyzico okunamadı: ${hataMetni(e)}`);
      return { sonuc: 'yapilamadi' };
    }
    const hedef = yenidenDenemeHedefi(detay, adaylar);
    if (hedef.tur === 'odenmis') {
      // Bekleyen ödeme YOK: başarının webhook'u gecikmiş ya da kaybolmuş.
      // Yeniden ÇEKİLMEZ; başarı yolu kuyruğa yazılır, kira uzun kalır.
      await this.basariYolunaYaz(abonelikKodu, hedef.kod, detay);
      await this.anindaIz(ab.id, 'dunning.aninda.odenmis', hedef.gerekce, { siparisKodu: hedef.kod });
      return { sonuc: 'alindi' };
    }
    if (hedef.tur === 'yok') {
      await this.kiraBirak(ab.id, kira);
      await this.anindaIz(ab.id, 'dunning.aninda.yapilamadi', hedef.gerekce);
      return { sonuc: 'yapilamadi' };
    }

    // ── PARA ÇEKEN ÇAĞRI — tek kez; hata kendiliğinden yeniden DENENMEZ ───
    try {
      await this.iyzico.tahsilatiTekrarla(hedef.kod);
    } catch (e) {
      if (denemeHatasiSinifi(e) === 'reddedildi') {
        await this.kiraKisalt(ab.id, kira).catch((k) =>
          this.logger.error(`Kira kısaltılamadı (${ab.id}): ${hataMetni(k)}`),
        );
        const mesaj = kullaniciyaMesaj(e as IyzicoHatasi);
        await this.anindaIz(ab.id, 'dunning.aninda.reddedildi', `sipariş ${hedef.kod}: ${mesaj}`, {
          siparisKodu: hedef.kod,
        });
        return { sonuc: 'reddedildi', mesaj };
      }
      // Belirsiz: iyzico çekmiş olabilir. Kira UZUN kalır — ne müşteri ne
      // merdiven bugün ikinci çekimi gönderebilir.
      await this.anindaIz(ab.id, 'dunning.aninda.belirsiz', `sipariş ${hedef.kod}: ${hataMetni(e)}`, {
        siparisKodu: hedef.kod,
      });
      return { sonuc: 'belirsiz' };
    }
    await this.anindaIz(ab.id, 'dunning.aninda.denendi', `sipariş ${hedef.kod} — ${hedef.gerekce}`, {
      siparisKodu: hedef.kod,
    });

    // iyzico "success" dedi — belge bunun ödemenin ALINDIĞI anlamına gelip
    // gelmediğini SÖYLEMİYOR (25.09 okundu). "Alındı" yalnız iyzico'nun
    // listesi siparişi ödenmiş gösterirse söylenir.
    try {
      const son = await this.iyzico.abonelikGetir(abonelikKodu);
      const siparis = siparisiBul(son.orders, hedef.kod);
      if (siparis && odenmisSiparisMi(siparis)) {
        await this.basariYolunaYaz(abonelikKodu, hedef.kod, son);
        return { sonuc: 'alindi' };
      }
    } catch (e) {
      this.logger.warn(`Anında deneme sonrası iyzico okunamadı (${ab.id}): ${hataMetni(e)}`);
    }
    return { sonuc: 'iletildi' };
  }

  // ── Tahsilat denemesi kirası (26.09) ────────────────────────────────────
  /**
   * iyzico'ya yeniden tahsilat göndermeden ÖNCE: kira NULL ya da geçmişse
   * yazılır, kazanan iyzico'ya gider. Yalnız dunning döngüsündeki KART satırı
   * kiralanır (arada ödenen ya da havaleye geçen satır 0 satır verir). Kira UZUN
   * alınır (`KIRA_SONUC_MS`); kesin retde `kiraKisalt`, çekim hiç
   * gönderilmediyse `kiraBirak`. Dönen değer kiranın kimliğidir (bitiş anı):
   * sonraki yazımlar yalnız kira HÂLÂ bizimse uygulanır. `null` = kazanamadık.
   */
  private async kiraAl(abonelikId: string, simdi: Date): Promise<Date | null> {
    const bitis = new Date(simdi.getTime() + KIRA_SONUC_MS);
    const r = await this.prisma.abonelik.updateMany({
      where: {
        id: abonelikId,
        odemeYontemi: OdemeYontemi.KART,
        ilkBasarisizlik: { not: null },
        OR: [{ tahsilatKirasi: null }, { tahsilatKirasi: { lt: simdi } }],
      },
      data: { tahsilatKirasi: bitis },
    });
    return r.count === 1 ? bitis : null;
  }

  /** Kesin ret: para çekilmedi — kira kısalır, başka kartla yeniden denenebilir. */
  private async kiraKisalt(abonelikId: string, kira: Date): Promise<void> {
    await this.prisma.abonelik.updateMany({
      where: { id: abonelikId, tahsilatKirasi: kira },
      data: { tahsilatKirasi: new Date(Date.now() + KIRA_RET_MS) },
    });
  }

  /** Çekim hiç gönderilmedi (hedef doğrulanamadı, iyzico okunamadı): kira geri verilir. */
  private async kiraBirak(abonelikId: string, kira: Date): Promise<void> {
    await this.prisma.abonelik
      .updateMany({ where: { id: abonelikId, tahsilatKirasi: kira }, data: { tahsilatKirasi: null } })
      .catch((e) => this.logger.error(`Kira bırakılamadı (${abonelikId}): ${hataMetni(e)}`));
  }

  /** Başarısızlık bildirimlerindeki sipariş kodları — yeniden eskiye, tekil. Anlık denemenin ADAYLARI (kanıt değil). */
  private async basarisizSiparisAdaylari(abonelikKodu: string): Promise<string[]> {
    const olaylar = await this.prisma.webhookOlayi.findMany({
      where: { abonelikKodu, olayTipi: 'subscription.order.failure' },
      orderBy: { alindi: 'desc' },
      select: { siparisKodu: true },
      take: 20,
    });
    return [...new Set(olaylar.map((o) => o.siparisKodu).filter((k): k is string => !!k))];
  }

  /**
   * Ödenmiş görünen siparişi webhook işleyicisinin BAŞARI yoluna yazar — gece
   * mutabakatının kayıp tahsilat oynatmasıyla aynı kalıp (`mutabakat.job.ts`
   * `tahsilatiYenidenOynat`). İşleyici dakikalık taramada koşar ve ödemeyi
   * iyzico'ya YENİDEN sorar: bu olay tek başına erişim VERMEZ. Tekil anahtar
   * siparişe bağlı: aynı siparişin ikinci yazımı (P2002) sessizce geçer.
   * Kritik değil: yazılamazsa iyzico'nun webhook'u ya da gece mutabakatı aynı
   * yolu koşar — hata günlüğe yazılır, sonuç müşteriye yine "alındı"dır.
   */
  private async basariYolunaYaz(abonelikKodu: string, siparisKodu: string, detay: IyzicoAbonelikDetayi): Promise<void> {
    const kanit = siparisiBul(detay.orders, siparisKodu) ?? null;
    try {
      await this.prisma.webhookOlayi.create({
        data: {
          tekilAnahtar: `${ANINDA_DENEME_KAYNAGI}:subscription.order.success:${siparisKodu}`,
          kaynak: ANINDA_DENEME_KAYNAGI,
          olayTipi: 'subscription.order.success',
          // iyzico bu gövdeyi GÖNDERMEDİ: webhook alanları + kanıt (iyzico'nun
          // kendi sipariş kaydı). İmza yok → `imzaGecerli` varsayılanı (false).
          hamGovde: {
            kaynak: ANINDA_DENEME_KAYNAGI,
            iyziEventType: 'subscription.order.success',
            subscriptionReferenceCode: abonelikKodu,
            orderReferenceCode: siparisKodu,
            customerReferenceCode: detay.customerReferenceCode ?? null,
            kanit: kanit as unknown as Prisma.InputJsonValue,
          } as Prisma.InputJsonObject,
          abonelikKodu,
          siparisKodu,
          musteriKodu: detay.customerReferenceCode ?? null,
        },
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') return;
      this.logger.error(`Başarı olayı kuyruğa yazılamadı (sipariş ${siparisKodu}): ${hataMetni(e)}`);
    }
  }

  /** Anlık denemenin izi. Kritik değil: para çeken çağrının sonucunu DÜŞÜRMEZ. */
  private async anindaIz(abonelikId: string, tip: string, aciklama: string, veri?: Prisma.InputJsonObject): Promise<void> {
    await this.abonelik
      .olayYaz(abonelikId, tip, { aciklama, veri, aktor: 'musteri' })
      .catch((e) => this.logger.error(`Olay yazılamadı (${tip}, ${abonelikId}): ${hataMetni(e)}`));
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

  /**
   * Bu basamak bir zaman asimi yuzunden ZATEN ertelendi mi? Basamak basi =
   * ilk basarisizlik + basamak gunu; o andan sonra yazilmis
   * `dunning.tekrar.belirsiz` olayi varsa erteleme hakki kullanilmistir.
   * (Onceki basamagin ertelemesi bu basamagin hakkini YEMEZ.)
   */
  private async basamakErtelendiMi(
    abonelikId: string,
    ilkBasarisizlik: Date,
    gun: number,
  ): Promise<boolean> {
    const basamakBasi = new Date(ilkBasarisizlik.getTime() + gun * 86_400_000);
    const adet = await this.prisma.abonelikOlayi.count({
      where: { abonelikId, tip: 'dunning.tekrar.belirsiz', olusturuldu: { gte: basamakBasi } },
    });
    return adet > 0;
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

    const kisitGunu = dunningKisitGunu();
    const askiGunu = Number(process.env.DUNNING_ASKI_GUNU ?? 30);
    const temel = ab.ilkBasarisizlik ?? new Date();
    const kisitTarihi = new Date(temel);
    kisitTarihi.setDate(kisitTarihi.getDate() + kisitGunu);
    const askiTarihi = new Date(temel);
    askiTarihi.setDate(askiTarihi.getDate() + askiGunu);

    const metin = DUNNING_METINLERI[anahtar]({
      firmaAdi: firma.ad,
      paketAdi: ab.paketSurumu.paket.ad,
      tutar: tutarYaz(Number(ab.paketSurumu.tutar), ab.paketSurumu.paraBirimi),
      // Ekran (Hesabım "N gün kaldı") AYNI sayıyı buradan okur — `kisit-gunu.ts`.
      kalanGun: kisitlamayaKalanGun(temel, Date.now(), kisitGunu),
      kisitTarihi: tarihYaz(
        anahtar === 'sonUyari' ? askiTarihi : kisitTarihi,
      ),
    });

    await this.eposta.gonder({
      kime: firma.faturaEposta ?? firma.yetkiliEposta,
      konu: metin.konu,
      baslik: metin.baslik,
      paragraflar: metin.govde,
      // "Ödemeniz alındı"nın düğmesi "Uygulamaya dön": ödeyen müşteriyi kart
      // formuna değil panele götürür (25.09; kart sayfası yokken ikisi de 404'tü).
      dugme: {
        etiket: metin.dugmeEtiketi,
        url: anahtar === 'toparlandi' ? `${this.uygulamaUrl}/dashboard` : kartUrl,
      },
      altNot: metin.altNot,
    });

    await this.abonelik.olayYaz(abonelikId, `dunning.eposta.${anahtar}`, {
      aciklama: metin.konu,
      veri: { siparisKodu, kime: firma.faturaEposta ?? firma.yetkiliEposta },
      aktor: 'dunning',
    });
  }
}
