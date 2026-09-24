import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../altyapi/db/prisma.service';
import { etkinHesapKosulu } from '../../../firma/uyelik-kurallari';
import { EpostaServisi } from '../../eposta/eposta.servisi';
import { paketHakKayiplari } from '../paket-degisimi';
import {
  PaketDegisimiServisi,
  type AbonelikSatiri,
  type DegisimIslemcisi,
  type DegisimSonucu,
  type SonucBaglami,
  type SurumSatiri,
} from '../paket-degisimi.servisi';
import { durdurulacakUye, yoneticiIslemi } from './yonetici-islemi';
import { yoneticiDusurmeEpostasi } from './yonetici-paket-epostalari';

/** DTO ile ayni alt sinir — ama KIRPILMIS metinde olculur. */
const GEREKCE_EN_AZ = 5;

@Injectable()
export class YoneticiDusurmeServisi {
  private readonly logger = new Logger(YoneticiDusurmeServisi.name);
  private readonly uygulamaUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paketDegisimi: PaketDegisimiServisi,
    private readonly eposta: EpostaServisi,
    config: ConfigService,
  ) {
    this.uygulamaUrl = config.get<string>('UYGULAMA_URL') ?? 'https://app.metapricex.com';
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  YONETICI DUSURMESI (24.09.2026, A2) — musteri onayi ALINMAZ (Emre karari)
   * ═════════════════════════════════════════════════════════════════════════
   *
   *  A1 ile AYNI cekirdek (`PaketDegisimiServisi.islemciyleDegistir` →
   *  `degistirSirayla`): ayni karar, ayni iyzico `NEXT_PERIOD`, ayni kurtarma,
   *  ayni olay tipi. Farklar islemcide:
   *
   *  · KURAL KUYRUKTA, TAZE SATIRLA: `yoneticiIslemi` `dogrudan-dusur` demeli
   *    (kayip var, kazanc yok, fiyat artmaz, AKTIF). Panelin siniflandirmasina
   *    guvenilmez — iki istek arasinda satir degismis olabilir.
   *  · NIYET DENETIMI iyzico'dan ONCE, kendi isleminde. ⚠ "Denetim dustu →
   *    degisim geri alinir" sozu BURADA TUTULAMAZ: iyzico cagrildiktan sonra
   *    yerel yazim geri alinsa bile iyzico'daki plan kalir (yenilemede
   *    `odenenPaketeHizala` uygular). Bu yuzden niyet ONCE yazilir; yazilamazsa
   *    iyzico'ya istek GITMEZ.
   *  · SONUC DENETIMI ana islemde. Kurtarmada (iyzico'da daha once yaniti
   *    kaybolmus BASKA bir degisim bulunursa) GERCEKTE olan kaydedilir ve
   *    denetim "uygulanmadi" der; "ekip dusurdu" e-postasi GONDERILMEZ.
   */
  async dusur(p: {
    firmaId: string;
    paketSurumuId: string;
    yonetici: { id: string; email: string };
    gerekce: string;
    musteriNotu?: string | null;
  }): Promise<DegisimSonucu & { epostaGonderildi: boolean }> {
    const gerekce = p.gerekce.trim();
    // ⚠ KIRPILDIKTAN SONRA olculur (inceleme L1): DTO ham metne bakar;
    // "a    " bes karakter sayilir ama denetime tek harf yazilirdi.
    if (gerekce.length < GEREKCE_EN_AZ) {
      throw new BadRequestException(`Düşürme gerekçesi en az ${GEREKCE_EN_AZ} karakter olmalı.`);
    }
    const musteriNotu = p.musteriNotu?.trim() || null;

    // `kontrol`da (kuyrukta) doldurulur; sonraki adimlar ayni istegin icinde.
    let firmaAdi = '';
    let aktifUye = 0;
    let sahipler: { id: string; email: string }[] = [];
    /** Niyet denetimi YAZILDIYSA dolar: hata olursa sonuc satiri ona baglanir. */
    let niyet: { mevcut: AbonelikSatiri; yeni: SurumSatiri } | null = null;

    const denetim = (
      tip: string,
      mevcut: AbonelikSatiri,
      hedef: SurumSatiri,
      ek: Record<string, unknown>,
    ): Prisma.YoneticiOlayiUncheckedCreateInput => ({
      yoneticiId: p.yonetici.id,
      yoneticiEpsta: p.yonetici.email,
      // Denetim sayfasi KULLANICIYA gore suzer; hedef = e-postayi alan sahip.
      hedefKullaniciId: sahipler[0]?.id ?? null,
      hedefEposta: sahipler[0]?.email ?? null,
      tip,
      oncekiDeger: `${firmaAdi}: ${mevcut.paketSurumu.paket.ad}`,
      yeniDeger: hedef.paket.ad,
      veri: {
        firmaId: p.firmaId,
        abonelikId: mevcut.id,
        mevcutPaketSurumuId: mevcut.paketSurumuId,
        hedefPaketSurumuId: hedef.id,
        gerekce,
        musteriNotu,
        ...ek,
      } as Prisma.InputJsonValue,
    });

    const islemci: DegisimIslemcisi & { kontrol: NonNullable<DegisimIslemcisi['kontrol']> } = {
      kontrol: async ({ ab, yeni, simdi }) => {
        const firma = await this.prisma.firma.findUnique({
          where: { id: p.firmaId },
          select: { ad: true, imhaTarihi: true },
        });
        if (!firma) throw new NotFoundException('Firma bulunamadı.');
        const karar = yoneticiIslemi({ ab, yeni, simdi, firmaKapali: firma.imhaTarihi !== null });
        if (karar.tur !== 'dogrudan-dusur') {
          throw new ConflictException({ kod: 'DOGRUDAN_DUSURME_DEGIL', message: karar.aciklama });
        }
        firmaAdi = firma.ad;
        [aktifUye, sahipler] = await Promise.all([
          this.prisma.user.count({ where: { firmaId: p.firmaId, ...etkinHesapKosulu() } }),
          this.prisma.user.findMany({
            where: { firmaId: p.firmaId, firmaRol: 'sahip', ...etkinHesapKosulu() },
            select: { id: true, email: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
        ]);
      },
      oncesi: async ({ mevcut, yeni }) => {
        try {
          await this.prisma.yoneticiOlayi.create({
            data: denetim('paket.dusurme.istendi', mevcut, yeni, {}),
          });
          niyet = { mevcut, yeni };
        } catch (e) {
          this.logger.error(
            `DENETIM-YAZILAMADI paket.dusurme.istendi firma=${p.firmaId} yonetici=${p.yonetici.id} — ` +
              `iyzico'ya istek GONDERILMEDI: ${e instanceof Error ? e.message : String(e)}`,
          );
          throw new InternalServerErrorException({
            kod: 'DENETIM_YAZILAMADI',
            message: 'Denetim kaydı yazılamadığı için işlem yapılmadı. Paket değişmedi.',
          });
        }
      },
      // ⚠ KURTARMADA ATIF (inceleme L3): kaydedilen degisim bu yonetici
      // isteginin DEGIL, iyzico'da once olmus baska bir degisimin — ona
      // "yonetici dusurdu" ve bu gerekce yazilmaz.
      olayEki: (_simdi, b) =>
        b.kurtarma?.farkliDegisim
          ? {
              kaynak: 'kurtarma',
              tetikleyen: { tur: 'yonetici', id: p.yonetici.id, eposta: p.yonetici.email },
              not: "Yönetici düşürmesi sırasında iyzico'da önceki bir değişiklik bulundu; kaydedilen o.",
            }
          : {
              kaynak: 'yonetici',
              yonetici: { id: p.yonetici.id, eposta: p.yonetici.email },
              gerekce,
              musteriNotu,
            },
      txEki: async (tx, b) => {
        const tip = b.kurtarma?.farkliDegisim ? 'paket.dusurme.uygulanmadi' : 'paket.dusuruldu';
        try {
          await tx.yoneticiOlayi.create({
            data: denetim(tip, b.mevcut, b.hedef, {
              zamanlama: b.zamanlama,
              paketGecisTarihi: b.gecis.toISOString(),
              kurtarma: b.kurtarma,
            }),
          });
        } catch (e) {
          this.logger.error(
            `DENETIM-YAZILAMADI ${tip} firma=${p.firmaId} yonetici=${p.yonetici.id}: ` +
              `${e instanceof Error ? e.message : String(e)}`,
          );
          throw e;
        }
      },
      bildir: async (b) => {
        if (b.kurtarma?.farkliDegisim) {
          this.logger.warn(
            `Yonetici dusurmesi UYGULANMADI (onceki degisim bulundu): firma=${p.firmaId} — musteriye e-posta yok`,
          );
          return false;
        }
        return this.mailGonder(b, { firmaAdi, aktifUye, sahipler, musteriNotu });
      },
    };

    try {
      const r = await this.paketDegisimi.islemciyleDegistir(
        { firmaId: p.firmaId, kullaniciId: p.yonetici.id, paketSurumuId: p.paketSurumuId },
        islemci,
      );
      return { ...r.sonuc, epostaGonderildi: r.bildirildi };
    } catch (e) {
      // Niyet yazilmadiysa iyzico'ya HIC gidilmedi (kural reddi / niyet
      // denetimi dustu): hata oldugu gibi.
      if (!niyet) throw e;
      throw await this.basarisizlikKaydi(e, niyet, denetim, p);
    }
  }

  /**
   * ── NIYET YAZILDI, SONUC GELMEDI (inceleme M2, 24.09) ────────────────────
   * iyzico'ya gidildikten sonraki her hata: (1) denetime SONUC satiri
   * (`basarisiz` / `belirsiz` / `yarim`) — yoksa denetim sayfasinda yalniz
   * "istendi" kalir; (2) YONETICI diliyle mesaj. A1'in hatalari MUSTERIYE
   * yazilmis ("paketinizi kontrol edin").
   * ⚠ Belirsizde dogru eylem AYNI dusurmeyi yeniden gondermek: iyzico'da
   * olduysa kayitli uc artik UPGRADED → 201402 → kurtarma ayni plani bulur,
   * kaydeder ve musteriye e-posta GIDER. Gondermezse degisim yenilemede
   * habersizce uygulanir (webhook hizalamasi) — mesaj bunu bu yuzden soyler.
   */
  private async basarisizlikKaydi(
    e: unknown,
    niyet: { mevcut: AbonelikSatiri; yeni: SurumSatiri },
    denetim: (
      tip: string,
      mevcut: AbonelikSatiri,
      hedef: SurumSatiri,
      ek: Record<string, unknown>,
    ) => Prisma.YoneticiOlayiUncheckedCreateInput,
    p: { firmaId: string; yonetici: { id: string } },
  ): Promise<HttpException> {
    const govde = e instanceof HttpException ? e.getResponse() : null;
    const kod =
      govde && typeof govde === 'object' && 'kod' in govde ? String((govde as { kod: unknown }).kod) : null;
    const mesaj = e instanceof Error ? e.message : String(e);

    let tip: string;
    let hata: HttpException;
    if (kod === 'SAGLAYICI_DEGISIM_HATASI') {
      tip = 'paket.dusurme.basarisiz';
      hata = new BadGatewayException({
        kod,
        message: 'iyzico düşürmeyi kabul etmedi; paket değişmedi. Ayrıntı denetim kaydında.',
      });
    } else if (kod === 'DEGISIM_DOGRULANAMADI') {
      tip = 'paket.dusurme.belirsiz';
      hata = new ServiceUnavailableException({
        kod,
        message:
          "iyzico'dan kesin yanıt alınamadı; düşürme iyzico'da olmuş olabilir. Birkaç dakika sonra AYNI " +
          "düşürmeyi yeniden gönderin — güvenlidir: iyzico'da olduysa bulunur, kaydedilir ve müşteriye " +
          'e-posta gider.',
      });
    } else if (kod === 'ABONELIK_DEGISTI') {
      tip = 'paket.dusurme.yarim';
      hata = new ConflictException({
        kod,
        message:
          'Abonelik bu sırada değişti (örneğin müşteri iptal etti); düşürme kaydedilmedi. Paneli yenileyip ' +
          'durumu kontrol edin.',
      });
    } else {
      tip = 'paket.dusurme.yarim';
      hata = new InternalServerErrorException({
        kod: 'DUSURME_YARIM',
        message:
          "Düşürme tamamlanamadı; iyzico tarafı değişmiş olabilir. Birkaç dakika sonra AYNI düşürmeyi " +
          "yeniden gönderin — güvenlidir: iyzico'da olduysa bulunur ve kaydedilir.",
      });
    }

    await this.prisma.yoneticiOlayi
      .create({ data: denetim(tip, niyet.mevcut, niyet.yeni, { hata: { kod, mesaj } }) })
      .catch((de) =>
        this.logger.error(
          `DENETIM-YAZILAMADI ${tip} firma=${p.firmaId} yonetici=${p.yonetici.id}: ` +
            `${de instanceof Error ? de.message : String(de)}`,
        ),
      );
    return hata;
  }

  /**
   * Bilgi e-postasi: etkin SAHIPLER + fatura adresi (inceleme Q2 — fiyat
   * degisiyor; A1 musteri e-postasi da fatura adresine gider). Ayni adres
   * iki kez GITMEZ. `true` = en az bir ileti GERCEKTEN gonderildi.
   * ⚠ `gonderKritik`: SMTP yoksa sessiz `gonder` basari sayilirdi ve ekran
   * "e-posta gonderildi" derdi (inceleme L2). Bir alicinin hatasi digerlerini
   * DURDURMAZ.
   */
  private async mailGonder(
    b: SonucBaglami,
    ek: {
      firmaAdi: string;
      aktifUye: number;
      sahipler: { id: string; email: string }[];
      musteriNotu: string | null;
    },
  ): Promise<boolean> {
    const firma = await this.prisma.firma.findUnique({
      where: { id: b.firmaId },
      select: { faturaEposta: true, yetkiliEposta: true },
    });
    const fatura = firma?.faturaEposta ?? firma?.yetkiliEposta ?? null;
    const tekil = new Map<string, string>();
    for (const a of [...ek.sahipler.map((s) => s.email), ...(fatura ? [fatura] : [])]) {
      // E-posta ASCII'dir: yerel ayarsiz kucultme ("I" → "i", Turkce "ı" DEGIL).
      const t = a.trim();
      if (t && !tekil.has(t.toLowerCase())) tekil.set(t.toLowerCase(), t);
    }
    const adresler = [...tekil.values()];
    if (adresler.length === 0) {
      this.logger.warn(`Yonetici dusurmesi maili ATLANDI: firma ${b.firmaId} icin adres yok`);
      return false;
    }
    const kayiplar = paketHakKayiplari(b.mevcut.paketSurumu.paket, b.hedef.paket);
    let gonderilen = 0;
    for (const kime of adresler) {
      try {
        await this.eposta.gonderKritik(
          yoneticiDusurmeEpostasi({
            kime,
            firmaAdi: ek.firmaAdi,
            mevcutPaketAdi: b.mevcut.paketSurumu.paket.ad,
            yeniPaketAdi: b.hedef.paket.ad,
            yeniTutar: b.hedef.tutar.toFixed(2),
            gecisTarihi: b.gecis,
            kayiplar,
            yeniKullaniciHakki: b.hedef.paket.kullaniciHakki,
            durdurulacakUye: durdurulacakUye(ek.aktifUye, b.hedef.paket.kullaniciHakki),
            musteriNotu: ek.musteriNotu,
            uygulamaUrl: this.uygulamaUrl,
          }),
        );
        gonderilen++;
      } catch (e) {
        // Adres gunluge YAZILMAZ (kisisel veri); firma ve sira yeter.
        this.logger.error(
          `Yonetici dusurmesi maili GONDERILEMEDI: firma ${b.firmaId} alici ${gonderilen + 1}/${adresler.length}: ` +
            `${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return gonderilen > 0;
  }
}
