import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaketOnerisiDurumu, Prisma, type PaketDegisimOnerisi } from '@prisma/client';
import { PrismaService } from '../../../../altyapi/db/prisma.service';
import { etkinHesapKosulu } from '../../../firma/uyelik-kurallari';
import { EpostaServisi } from '../../eposta/eposta.servisi';
import { beklenenGecisTarihi, paketDegisimYolu, type DegisimZamanlamasi, type HakKaybi } from '../paket-degisimi';
import {
  PaketDegisimiServisi,
  type AbonelikSatiri,
  type OneriKancalari,
  type SurumSatiri,
} from '../paket-degisimi.servisi';
import {
  KAPATAN_DURUMLAR,
  ONERI_DURUM_METNI,
  oneriDurumu,
  oneriKabulKarari,
  oneriSonGecerlilik,
  type OneriGecmisi,
} from './paket-onerisi';
import { GEREKCE_EN_AZ, durdurulacakUye, yoneticiIslemi } from './yonetici-islemi';
import { gunlukIcinMaskele, yoneticiOneriEpostasi } from './yonetici-paket-epostalari';

interface Kisi {
  id: string;
  email: string;
}

/** `GET /abonelik/paketler` icin bekleyen oneri. Notu SAHIP OLMAYANA cagiran gizler. */
export interface BekleyenOneri {
  id: string;
  hedefPaketSurumuId: string;
  sonGecerlilik: string;
  musteriNotu: string | null;
}

/** Kuyrukta yazilan onerinin, sira DISINDA gidecek e-posta icin ozeti. */
interface OneriKaydi {
  oneri: PaketDegisimOnerisi;
  firmaId: string;
  firmaAdi: string;
  mevcut: AbonelikSatiri;
  yeni: SurumSatiri;
  zamanlama: DegisimZamanlamasi;
  beklenenGecis: Date;
  kazanclar: HakKaybi[];
  kayiplar: HakKaybi[];
  aktifUye: number;
  sahipler: Kisi[];
}

const ONERI_ZATEN_VAR = {
  kod: 'ONERI_ZATEN_VAR',
  message: 'Bu firmaya gönderilmiş, müşteri onayı bekleyen bir öneri var; yenisi için önce onu geri çekin.',
} as const;

/**
 * `oneriDurumu`nun GECMIS girdisi — anlik goruntunun goremedigi iki gercek
 * (inceleme O2 + D5). Panel servisi de BUNU cagirir: iki yerde iki kural olmaz.
 *   · kapatan gecis: oneriden SONRA `durum.degisti` olayi IPTAL/SONA_ERDI/
 *     ASKIDA yazildi mi? Durumu yazan TEK yer `AbonelikServisi.durumDegistir`
 *     ve her gecis olay birakir; oneriden ONCEKI gecis sayilmaz.
 *   · hedef satista: yeni surum yayimlaninca eskisi satistan cekilir; oneri
 *     musterinin listesinden duser, panel "bekliyor" demesin.
 */
export async function oneriGecmisiOku(
  prisma: Pick<PrismaService, 'abonelikOlayi' | 'paketSurumu'>,
  o: { olusturuldu: Date; hedefPaketSurumuId: string },
  abonelikId: string | null,
): Promise<OneriGecmisi> {
  const [kapatan, hedef] = await Promise.all([
    abonelikId
      ? prisma.abonelikOlayi.count({
          where: {
            abonelikId,
            tip: 'durum.degisti',
            yeniDurum: { in: [...KAPATAN_DURUMLAR] },
            olusturuldu: { gt: o.olusturuldu },
          },
        })
      : Promise.resolve(0),
    prisma.paketSurumu.findUnique({
      where: { id: o.hedefPaketSurumuId },
      select: { satistaMi: true, paket: { select: { aktif: true } } },
    }),
  ]);
  return { kapatanGecisVar: kapatan > 0, hedefSatista: !!hedef?.satistaMi && hedef.paket?.aktif === true };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAKET DEGISIM ONERISI (24.09.2026, yonetici paneli turu A2 Blok 2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Yonetici: olustur / geri cek. Musteri (firma SAHIBI): reddet / kabul.
 *  Kabul AYRI bir yol DEGILDIR: `POST /abonelik/degistir` + `oneriId` →
 *  `PaketDegisimiServisi.degistir(p, kabulKancalari(...))` — A1'in onay
 *  kapisi, iyzico cagrisi, kurtarmasi ve e-postasi aynen.
 *
 *  ⚠ HEPSI AYNI FIRMA SIRASINDAN (`firmaSirasinda`): kabul ile geri cekme /
 *  ret yarisamaz. Kuyruk tek sureci siralar; ikinci surece karsi kilit
 *  veritabaninda (`bekleyenFirmaId` UNIQUE) ve her sonuclandirma KOSULLU
 *  (`where durum: BEKLIYOR`).
 *
 *  ⚠ DENETIM DEGISIKLIKLE AYNI ISLEMDE: oneri kaydi ve `YoneticiOlayi` ya
 *  ikisi birden yazilir ya hicbiri. Denetim dusmusse yonetici "gonderildi"
 *  gormez; `DENETIM-YAZILAMADI` gunluge duser (alarm betigi sayar).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class PaketOnerisiServisi {
  private readonly logger = new Logger(PaketOnerisiServisi.name);
  private readonly uygulamaUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paketDegisimi: PaketDegisimiServisi,
    private readonly eposta: EpostaServisi,
    config: ConfigService,
  ) {
    this.uygulamaUrl = config.get<string>('UYGULAMA_URL') ?? 'https://app.metapricex.com';
  }

  private sahipleriGetir(firmaId: string): Promise<Kisi[]> {
    return this.prisma.user.findMany({
      where: { firmaId, firmaRol: 'sahip', ...etkinHesapKosulu() },
      select: { id: true, email: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  private aboneligiGetir(firmaId: string) {
    return this.prisma.abonelik.findUnique({
      where: { firmaId },
      include: { paketSurumu: { include: { paket: true } } },
    });
  }

  // ══ YONETICI ═══════════════════════════════════════════════════════════════

  async olustur(p: {
    firmaId: string;
    paketSurumuId: string;
    yonetici: Kisi;
    gerekce: string;
    musteriNotu?: string | null;
  }): Promise<{ oneriId: string; sonGecerlilik: string; epostaGonderildi: boolean }> {
    const gerekce = p.gerekce.trim();
    if (gerekce.length < GEREKCE_EN_AZ) {
      throw new BadRequestException(`Öneri gerekçesi en az ${GEREKCE_EN_AZ} karakter olmalı.`);
    }
    const musteriNotu = p.musteriNotu?.trim() || null;
    const kayit = await this.paketDegisimi.firmaSirasinda(p.firmaId, () =>
      this.olusturSirayla({ ...p, gerekce, musteriNotu }),
    );
    // E-posta SIRA DISINDA: posta sunucusu yavas diye firmanin degisim sirasi
    // beklemesin. Oneri kayitli; e-posta dusse de musteri sayfada gorur.
    const epostaGonderildi = await this.oneriMaili(kayit);
    return {
      oneriId: kayit.oneri.id,
      sonGecerlilik: kayit.oneri.sonGecerlilik.toISOString(),
      epostaGonderildi,
    };
  }

  private async olusturSirayla(p: {
    firmaId: string;
    paketSurumuId: string;
    yonetici: Kisi;
    gerekce: string;
    musteriNotu: string | null;
  }): Promise<OneriKaydi> {
    const simdi = new Date();
    const [firma, ab, yeni] = await Promise.all([
      this.prisma.firma.findUnique({ where: { id: p.firmaId }, select: { ad: true, imhaTarihi: true } }),
      this.aboneligiGetir(p.firmaId),
      this.prisma.paketSurumu.findUnique({ where: { id: p.paketSurumuId }, include: { paket: true } }),
    ]);
    if (!firma) throw new NotFoundException('Firma bulunamadı.');
    if (!yeni) throw new NotFoundException('Paket bulunamadı.');

    // Kural TAZE satirla, kuyrukta — panelin siniflandirmasina guvenilmez.
    const karar = yoneticiIslemi({ ab, yeni, simdi, firmaKapali: firma.imhaTarihi !== null });
    const yol = ab ? paketDegisimYolu(ab, yeni, simdi) : null;
    if (karar.tur !== 'oneri' || !ab || yol?.yol !== 'degistir') {
      throw new ConflictException({
        kod: 'ONERI_DEGIL',
        message:
          karar.tur === 'dogrudan-dusur'
            ? 'Bu değişiklik doğrudan düşürme: müşteri onayı gerekmez, "Düşür" işlemini kullanın.'
            : karar.aciklama,
      });
    }
    // D5 (inceleme): yalniz MUSTERININ GORDUGU surum onerilir — aktif paketin
    // satistaki EN SON surumu (`SatinAlmaServisi.satistakiPaketler` ile ayni
    // kural). Eski surum onerilseydi musteri listesinde karsiligi olmaz, serit
    // hic gorunmezdi; panel ise "bekliyor" derdi.
    const gorunen = await this.prisma.paketSurumu.findFirst({
      where: { paketId: yeni.paketId, satistaMi: true, paket: { aktif: true } },
      orderBy: { surumNo: 'desc' },
      select: { id: true },
    });
    if (gorunen?.id !== yeni.id) {
      throw new ConflictException({
        kod: 'ONERI_DEGIL',
        message:
          'Bu sürüm müşterinin paket listesinde görünmüyor (paketin daha yeni bir sürümü satışta ya da paket ' +
          'kapalı); müşterinin gördüğü sürümü önerin.',
      });
    }

    const [sahipler, aktifUye, eski] = await Promise.all([
      this.sahipleriGetir(p.firmaId),
      this.prisma.user.count({ where: { firmaId: p.firmaId, ...etkinHesapKosulu() } }),
      this.prisma.paketDegisimOnerisi.findUnique({ where: { bekleyenFirmaId: p.firmaId } }),
    ]);
    // Kabul yalniz SAHIBIN isi: sahibi olmayan firmaya gonderilen oneri
    // kimsenin kabul edemeyecegi bir kayit olurdu.
    if (sahipler.length === 0) {
      throw new ConflictException({
        kod: 'SAHIP_YOK',
        message: 'Firmanın etkin bir sahibi yok; öneriyi kabul edebilecek kimse olmadığı için gönderilmedi.',
      });
    }
    const eskiDurum = eski ? oneriDurumu(eski, ab, simdi, await oneriGecmisiOku(this.prisma, eski, ab.id)) : null;
    if (eskiDurum === 'bekliyor') throw new ConflictException(ONERI_ZATEN_VAR);

    let oneri: PaketDegisimOnerisi;
    try {
      oneri = await this.prisma.$transaction(async (tx) => {
        if (eski) {
          // Suresi dolmus ya da abonelik degismis bekleyen satir KAPANDI olur
          // ve kilidi (`bekleyenFirmaId`) birakir. Sonuclanmis ama kilidi
          // tutan (bozuk) bir satir varsa yalniz kilit bosaltilir.
          await tx.paketDegisimOnerisi.updateMany({
            where: { id: eski.id, bekleyenFirmaId: p.firmaId },
            data:
              eski.durum === PaketOnerisiDurumu.BEKLIYOR
                ? {
                    durum: PaketOnerisiDurumu.KAPANDI,
                    bekleyenFirmaId: null,
                    sonuclandi: simdi,
                    kapanisNedeni: eskiDurum,
                  }
                : { bekleyenFirmaId: null },
          });
        }
        const o = await tx.paketDegisimOnerisi.create({
          data: {
            firmaId: p.firmaId,
            bekleyenFirmaId: p.firmaId,
            hedefPaketSurumuId: yeni.id,
            kaynakPaketSurumuId: ab.paketSurumuId,
            kaynakIyzicoKodu: ab.iyzicoAbonelikKodu,
            gerekce: p.gerekce,
            musteriNotu: p.musteriNotu,
            sonGecerlilik: oneriSonGecerlilik(simdi),
            olusturanId: p.yonetici.id,
            olusturanEposta: p.yonetici.email,
          },
        });
        await this.denetimYaz(tx, 'paket.oneri.gonderildi', {
          yonetici: p.yonetici,
          sahip: sahipler[0],
          firmaAdi: firma.ad,
          mevcutPaketAdi: ab.paketSurumu.paket.ad,
          hedefPaketAdi: yeni.paket.ad,
          veri: {
            firmaId: p.firmaId,
            abonelikId: ab.id,
            oneriId: o.id,
            mevcutPaketSurumuId: ab.paketSurumuId,
            hedefPaketSurumuId: yeni.id,
            zamanlama: yol.zamanlama,
            kazanclar: karar.kazanclar,
            kayiplar: karar.kayiplar,
            gerekce: p.gerekce,
            musteriNotu: p.musteriNotu,
            sonGecerlilik: o.sonGecerlilik.toISOString(),
            ...(eski ? { kapatilanOneriId: eski.id, kapatilanOneriDurumu: eskiDurum } : {}),
          },
        });
        return o;
      });
    } catch (e) {
      // Ikinci surec ayni anda oneri yazdiysa veritabani kilidi durdurur.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(ONERI_ZATEN_VAR);
      }
      throw e;
    }

    return {
      oneri,
      firmaId: p.firmaId,
      firmaAdi: firma.ad,
      mevcut: ab,
      yeni,
      zamanlama: yol.zamanlama,
      beklenenGecis: beklenenGecisTarihi(ab, simdi),
      kazanclar: karar.kazanclar,
      kayiplar: karar.kayiplar,
      aktifUye,
      sahipler,
    };
  }

  async geriCek(p: { firmaId: string; oneriId: string; yonetici: Kisi }): Promise<{ geriCekildi: true }> {
    return this.paketDegisimi.firmaSirasinda(p.firmaId, async () => {
      const simdi = new Date();
      const [o, firma, ab, sahipler] = await Promise.all([
        this.prisma.paketDegisimOnerisi.findUnique({
          where: { id: p.oneriId },
          include: { hedefPaketSurumu: { include: { paket: true } } },
        }),
        this.prisma.firma.findUnique({ where: { id: p.firmaId }, select: { ad: true } }),
        this.aboneligiGetir(p.firmaId),
        this.sahipleriGetir(p.firmaId),
      ]);
      if (!o || !firma || o.firmaId !== p.firmaId) throw new NotFoundException('Öneri bulunamadı.');
      const etkin = oneriDurumu(o, ab, simdi, await oneriGecmisiOku(this.prisma, o, ab?.id ?? null));
      if (o.durum !== PaketOnerisiDurumu.BEKLIYOR) {
        throw new ConflictException({
          kod: 'ONERI_BEKLEMIYOR',
          message: `${ONERI_DURUM_METNI[etkin]} Geri çekilecek bir öneri yok.`,
        });
      }
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.paketDegisimOnerisi.updateMany({
          where: { id: o.id, durum: PaketOnerisiDurumu.BEKLIYOR },
          data: {
            durum: PaketOnerisiDurumu.GERI_CEKILDI,
            bekleyenFirmaId: null,
            sonuclandi: simdi,
            sonuclandiranId: p.yonetici.id,
          },
        });
        if (r.count !== 1) {
          throw new ConflictException({ kod: 'ONERI_BEKLEMIYOR', message: 'Öneri bu sırada sonuçlandı; paneli yenileyin.' });
        }
        await this.denetimYaz(tx, 'paket.oneri.geri-cekildi', {
          yonetici: p.yonetici,
          sahip: sahipler[0],
          firmaAdi: firma.ad,
          mevcutPaketAdi: ab?.paketSurumu.paket.ad ?? '(abonelik yok)',
          hedefPaketAdi: o.hedefPaketSurumu.paket.ad,
          veri: {
            firmaId: p.firmaId,
            oneriId: o.id,
            hedefPaketSurumuId: o.hedefPaketSurumuId,
            // Suresi dolmus / gecersizlesmis oneri de geri cekilebilir; iz ne oldugunu soyler.
            etkinDurum: etkin,
          },
        });
      });
      return { geriCekildi: true as const };
    });
  }

  // ══ MUSTERI (firma sahibi) ═════════════════════════════════════════════════

  /** Abonelik sayfasi icin gecerli bekleyen oneri (yoksa null). */
  async bekleyen(firmaId: string, simdi = new Date()): Promise<BekleyenOneri | null> {
    const [o, ab] = await Promise.all([
      this.prisma.paketDegisimOnerisi.findUnique({ where: { bekleyenFirmaId: firmaId } }),
      this.prisma.abonelik.findUnique({
        where: { firmaId },
        select: {
          id: true,
          paketSurumuId: true,
          iyzicoAbonelikKodu: true,
          paketGecisTarihi: true,
          durum: true,
          odemeYontemi: true,
        },
      }),
    ]);
    if (!o) return null;
    if (oneriDurumu(o, ab, simdi, await oneriGecmisiOku(this.prisma, o, ab?.id ?? null)) !== 'bekliyor') {
      return null;
    }
    return {
      id: o.id,
      hedefPaketSurumuId: o.hedefPaketSurumuId,
      sonGecerlilik: o.sonGecerlilik.toISOString(),
      musteriNotu: o.musteriNotu,
    };
  }

  async reddet(p: { firmaId: string; oneriId: string; kullaniciId: string }): Promise<{ reddedildi: true }> {
    return this.paketDegisimi.firmaSirasinda(p.firmaId, async () => {
      const simdi = new Date();
      // ⚠ IKINCI KATMAN (FirmaRolGuard'a ek; uyelik.servisi R1-Y3 kalibi): rol
      // kuyrukta VERITABANINDAN yeniden okunur — dekoratoru unutmak ya da
      // es zamanli rol dusurme tek basina yetki acmasin.
      const [kisi, o, ab] = await Promise.all([
        this.prisma.user.findFirst({
          where: { id: p.kullaniciId, firmaId: p.firmaId, firmaRol: 'sahip', ...etkinHesapKosulu() },
          select: { id: true },
        }),
        this.prisma.paketDegisimOnerisi.findUnique({
          where: { id: p.oneriId },
          include: { hedefPaketSurumu: { include: { paket: true } } },
        }),
        this.prisma.abonelik.findUnique({ where: { firmaId: p.firmaId } }),
      ]);
      if (!kisi) {
        throw new ForbiddenException({ kod: 'FIRMA_SAHIBI_GEREKLI', mesaj: 'Bu işlemi yalnız firma sahibi yapabilir.' });
      }
      // Baska firmanin onerisi "bulunamadi" ile AYNI cevabi alir.
      if (!o || o.firmaId !== p.firmaId) throw new NotFoundException('Öneri bulunamadı.');
      const durum = oneriDurumu(o, ab, simdi, await oneriGecmisiOku(this.prisma, o, ab?.id ?? null));
      if (durum !== 'bekliyor' || !ab) {
        throw new ConflictException({ kod: 'ONERI_GECERSIZ', message: ONERI_DURUM_METNI[durum] });
      }
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.paketDegisimOnerisi.updateMany({
          where: { id: o.id, durum: PaketOnerisiDurumu.BEKLIYOR },
          data: {
            durum: PaketOnerisiDurumu.REDDEDILDI,
            bekleyenFirmaId: null,
            sonuclandi: simdi,
            sonuclandiranId: p.kullaniciId,
          },
        });
        if (r.count !== 1) {
          throw new ConflictException({ kod: 'ONERI_GECERSIZ', message: 'Öneri bu sırada sonuçlandı; sayfayı yenileyin.' });
        }
        await tx.abonelikOlayi.create({
          data: {
            abonelikId: ab.id,
            tip: 'paket.oneri.reddedildi',
            oncekiDurum: ab.durum,
            yeniDurum: ab.durum,
            aciklama: `${o.hedefPaketSurumu.paket.ad} paketi önerisi reddedildi.`,
            veri: { oneriId: o.id, hedefPaketSurumuId: o.hedefPaketSurumuId },
            aktor: p.kullaniciId,
          },
        });
      });
      return { reddedildi: true as const };
    });
  }

  /**
   * Kabul kancalari — `degistir`in musteri islemcisine eklenir (tek yol).
   *   kontrol: kuyrukta, TAZE satirla, iyzico'dan ONCE; gecersizse 409 ve
   *            iyzico'ya istek GITMEZ.
   *   txEki:   ana islemde KOSULLU tuketim (`where durum: BEKLIYOR`).
   */
  kabulKancalari(p: { firmaId: string; oneriId: string; kullaniciId: string }): OneriKancalari {
    return {
      kontrol: async ({ ab, yeni, simdi }) => {
        // ⚠ IKINCI KATMAN (inceleme D9 + guvenlik D1): faturayi degistiren kabul,
        // retten ZAYIF korunmasin — rol kuyrukta VERITABANINDAN yeniden okunur
        // (istek kuyrukta beklerken sahiplikten dusurulen kisi kabul edemez).
        const kisi = await this.prisma.user.findFirst({
          where: { id: p.kullaniciId, firmaId: p.firmaId, firmaRol: 'sahip', ...etkinHesapKosulu() },
          select: { id: true },
        });
        if (!kisi) {
          throw new ForbiddenException({ kod: 'FIRMA_SAHIBI_GEREKLI', mesaj: 'Bu işlemi yalnız firma sahibi yapabilir.' });
        }
        const oneri = await this.prisma.paketDegisimOnerisi.findUnique({ where: { id: p.oneriId } });
        // Gecmis yalniz BU firmanin onerisi icin olculur; baskasininki zaten
        // "bulunamadi" cevabini alir (varlik sizmaz).
        const gecmis: OneriGecmisi =
          oneri && oneri.firmaId === p.firmaId
            ? await oneriGecmisiOku(this.prisma, oneri, ab?.id ?? null)
            : { kapatanGecisVar: false, hedefSatista: true };
        const karar = oneriKabulKarari({ oneri, firmaId: p.firmaId, paketSurumuId: yeni.id, ab, simdi, gecmis });
        // `=== false`: backend `strict` degil, `!karar.tamam` birlesimi DARALTMAZ.
        if (karar.tamam === false) throw new ConflictException({ kod: karar.kod, message: karar.mesaj });
      },
      // ⚠ KURTARMADA ATIF (inceleme D1): kaydedilen degisim ONERININ DEGIL
      // (iyzico'da once olmus baska bir degisim) — olay onu "oneri kabulu"
      // diye anmaz; imhadan sonra geriye kalan TEK iz budur.
      olayEki: (_simdi, b) =>
        b.kurtarma?.farkliDegisim ? { kaynak: 'kurtarma', kapananOneriId: p.oneriId } : { oneriId: p.oneriId },
      txEki: async (tx, b) => {
        const simdi = new Date();
        // Kurtarmada kaydedilen degisim ONERININ DEGIL (iyzico'da daha once
        // olmus baska bir degisim): oneri KABUL sayilmaz, kapanir.
        const farkli = b.kurtarma?.farkliDegisim === true;
        const r = await tx.paketDegisimOnerisi.updateMany({
          where: { id: p.oneriId, durum: PaketOnerisiDurumu.BEKLIYOR },
          data: farkli
            ? {
                durum: PaketOnerisiDurumu.KAPANDI,
                bekleyenFirmaId: null,
                sonuclandi: simdi,
                kapanisNedeni: 'kurtarma-onceki-degisim',
              }
            : {
                durum: PaketOnerisiDurumu.KABUL_EDILDI,
                bekleyenFirmaId: null,
                sonuclandi: simdi,
                sonuclandiranId: p.kullaniciId,
              },
        });
        // ⚠ FIRLATILMAZ: iyzico degisimi ZATEN yapti. Tuketim yazilamadi diye
        // yerel yazimi geri almak aboneligi YARIM birakirdi (iyzico'da yeni
        // plan, bizde eski). Kontrol ayni kuyrukta iyzico'dan hemen once
        // yapildi; buraya ancak ikinci bir surec oneriyi sonuclandirdiysa gelinir.
        if (r.count !== 1) {
          this.logger.error(
            `ONERI TUKETILEMEDI: oneri=${p.oneriId} firma=${p.firmaId} — degisim kaydedildi, ` +
              'oneri satiri artik BEKLIYOR degildi',
          );
        }
      },
    };
  }

  // ══ YARDIMCILAR ════════════════════════════════════════════════════════════

  /** Denetim satiri — cagiranin ISLEMINDE; yazilamazsa islem geri alinir. */
  private async denetimYaz(
    tx: Prisma.TransactionClient,
    tip: string,
    g: {
      yonetici: Kisi;
      sahip: Kisi | undefined;
      firmaAdi: string;
      mevcutPaketAdi: string;
      hedefPaketAdi: string;
      veri: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await tx.yoneticiOlayi.create({
        data: {
          yoneticiId: g.yonetici.id,
          yoneticiEpsta: g.yonetici.email,
          // Denetim sayfasi KULLANICIYA gore suzer; hedef = e-postayi alan ilk sahip.
          hedefKullaniciId: g.sahip?.id ?? null,
          hedefEposta: g.sahip?.email ?? null,
          tip,
          oncekiDeger: `${g.firmaAdi}: ${g.mevcutPaketAdi}`,
          yeniDeger: g.hedefPaketAdi,
          veri: g.veri as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      this.logger.error(
        `DENETIM-YAZILAMADI ${tip} yonetici=${g.yonetici.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new InternalServerErrorException({
        kod: 'DENETIM_YAZILAMADI',
        message: 'Denetim kaydı yazılamadığı için işlem yapılmadı.',
      });
    }
  }

  /**
   * Oneri e-postasi — yalniz etkin SAHIPLERE (kabul sahibin isi). `true` = en
   * az bir ileti GERCEKTEN gitti (`gonderKritik`; bir alicinin hatasi
   * digerlerini durdurmaz).
   */
  private async oneriMaili(k: OneriKaydi): Promise<boolean> {
    let gonderilen = 0;
    for (let sira = 0; sira < k.sahipler.length; sira++) {
      const sahip = k.sahipler[sira];
      try {
        await this.eposta.gonderKritik(
          yoneticiOneriEpostasi({
            kime: sahip.email,
            firmaAdi: k.firmaAdi,
            mevcutPaketAdi: k.mevcut.paketSurumu.paket.ad,
            hedefPaketAdi: k.yeni.paket.ad,
            hedefTutar: k.yeni.tutar.toFixed(2),
            zamanlama: k.zamanlama,
            beklenenGecis: k.beklenenGecis,
            kazanclar: k.kazanclar,
            kayiplar: k.kayiplar,
            hedefKullaniciHakki: k.yeni.paket.kullaniciHakki,
            durdurulacakUye: durdurulacakUye(k.aktifUye, k.yeni.paket.kullaniciHakki),
            musteriNotu: k.oneri.musteriNotu,
            sonGecerlilik: k.oneri.sonGecerlilik,
            oneriId: k.oneri.id,
            uygulamaUrl: this.uygulamaUrl,
          }),
        );
        gonderilen++;
      } catch (e) {
        // Adres gunluge YAZILMAZ (kisisel veri); firma ve sira yeter.
        this.logger.error(
          `Oneri maili GONDERILEMEDI: firma ${k.firmaId} alici ${sira + 1}/${k.sahipler.length}: ` +
            gunlukIcinMaskele(e instanceof Error ? e.message : String(e)),
        );
      }
    }
    return gonderilen > 0;
  }
}
