import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import type { Kimlik } from '../../../altyapi/auth/kimlik';
import { ceviriIcerigi, type CeviriIcerigi } from '../../giris/ai/ceviri-kurali';
import {
  ceviriKotasiCoz,
  kotaDonemi,
  kotaKarari,
  kotaRedMesaji,
  sonucHesabi,
  type CeviriKotasi,
  type CeviriSonucDurumu,
  type KotaKarari,
} from './ceviri-kotasi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ÇEVİRİ KOTASI — ayırma, sayma, sonuçlandırma (Faz 6.2, 14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  AKIŞ (CeviriService.teklifiCevir):
 *    rezerveEt → [tekrar ise önbellekten dön] → çevir → sonuclandir
 *
 *  ── NEDEN İSTEMCİ YALNIZ TEKLİF KİMLİĞİ GÖNDERİR ──
 *  Satır sayısı ve çevrilecek metinler KAYITLI `Quote.sheets`'ten, çeviriyle
 *  AYNI kuraldan (`ceviriIcerigi`) sunucuda çıkar. İstemcinin gönderdiği bir
 *  sayıya güvenmek kotayı tarayıcı konsoluna emanet etmek olurdu.
 *
 *  ── NEDEN AI ÇAĞRISINDAN ÖNCE AYRILIYOR ──
 *  Sonra kontrol etmek token harcayıp kullanıcıyı reddetmek olur. Ayırma
 *  (`ISLENIYOR` kaydı) kotaya SAYILIR; böylece aynı firmadan eşzamanlı iki
 *  istek tavanı birlikte aşamaz. Ayırma firma başına bir advisory kilit
 *  altında yapılır — kilit yalnız bu kısa işlemi kapsar, AI çağrısını değil.
 *
 *  ── TEKRAR KORUMASI (karar 13.09) ──
 *  Aynı teklifin her çevirisi kotadan düşer. Ama AYNI çeviri iki kez
 *  sayılmaz: çeviri TAMAMLANDIKTAN SONRAKİ `TEKRAR_PENCERESI_DK` içinde, aynı
 *  teklifin değişmemiş içeriği (özet) için gelen istek yeni kayıt yazmaz,
 *  önbellekten döner. Süren bir çeviri için gelen ikinci istek 409 alır.
 *  ⚠ Pencere BİTİŞTEN ölçülür (14.09 incelemesi Y2): başlangıçtan ölçülseydi
 *  8 dakika süren çeviride bağlantısı kopan kullanıcının iş bitince yaptığı
 *  yeniden deneme ikinci tam tüketim olurdu.
 *
 *  ── KISMİ ÇEVİRİ (14.09 incelemesi Y1/O4) ──
 *  Kotadan TESLİM EDİLEN satır düşer (`sonucHesabi`). Hiç satır teslim
 *  edilmezse (hata) hiçbir şey düşmez. Bir kısmı teslim edilirse (`KISMI`)
 *  yalnız o kısım düşer; aynı içeriğin pencere içindeki DEVAMI yalnız yeni
 *  teslim edilen satırı düşer ve dosya hakkından ikinci kez yemez. İlk hâli
 *  "tam değilse düşmez"di: harita yine istemciye döndüğü için bir parçayı
 *  bilerek patlatan teklif çevirinin çoğunu kotasız alabiliyordu.
 *
 *  ── YARIM KALAN AYIRMA ──
 *  Süreç çökerse (deploy, bellek) `ISLENIYOR` kayıt kalır. Açılışta hepsi
 *  kapatılır — TEK sunucu örneği varsayımıyla (docker compose, tek backend).
 *  Asılı kalan bir süreç için ayrıca `ISLENIYOR_ZAMAN_ASIMI_DK` sonra sayımdan
 *  düşer; zaman aşımıyla kapatılan iş sonradan biterse yine SONUÇLANIR ve
 *  teslim ettiği satır düşer (uzun iş kotasız kalmaz).
 *
 *  ── DÖNEM ──
 *  `Abonelik`'te dönem başlangıcı tutan alan YOK (yalnız `erisimSonu`, o da
 *  yenilemede ezilir — 14.09 ölçüldü). Çapa `Abonelik.olusturuldu`, adım
 *  `PaketSurumu.periyot × periyotAdedi`: kart, havale, miras ve deneme için
 *  tek tip; takvim ayı kullanılmaz. Paket değişince (aynı Abonelik satırı
 *  güncellenir) dönem sürer, yeni paketin tavanı hemen uygulanır.
 *
 *  ── KOTA REDDİ KAYIT BIRAKMAZ ──
 *  Reddedilen istek tüketim değildir ve çeviriye ulaşmaz; tabloya yazılmaz,
 *  günlüğe yazılır. Tablo "ne tüketildi" sorusunun cevabıdır.
 */

export const TEKRAR_PENCERESI_DK = 10;
export const ISLENIYOR_ZAMAN_ASIMI_DK = 90;
export const ZAMAN_ASIMI_NOTU = 'zaman asimi — sonuclanmadi';
export const YENIDEN_BASLAMA_NOTU = 'sunucu yeniden basladi — yarim kaldi';

/**
 * Kilit + sayım + ayırma işleminin sınırları. Prisma varsayılanı (2 sn
 * bekleme, 5 sn işlem) sessizce uygulanmasın diye açık yazıldı: aynı firmadan
 * eşzamanlı istekler kilidi sırayla bekler.
 */
const ISLEM_AYARI = { maxWait: 5_000, timeout: 10_000 } as const;

type Db = PrismaService | Prisma.TransactionClient;

export interface KotaOzeti {
  readonly paketKodu: string;
  readonly kota: CeviriKotasi;
  readonly donemBaslangic: string;
  /** Yenilenme anı (hariç bitiş). */
  readonly donemBitis: string;
  readonly kullanilanSatir: number;
  readonly kullanilanDosya: number;
  readonly kalanSatir: number;
  readonly kalanDosya: number;
}

interface Baglam {
  abonelikId: string;
  ozet: KotaOzeti;
  donem: { baslangic: Date; bitis: Date };
}

/** Aynı teklifin aynı içeriği için yakın geçmiş. */
interface Zincir {
  /** Taze bir ayırma sürüyor mu. */
  readonly suren: boolean;
  /** Pencere içinde TAMAMLANMIŞ kayıt — varsa istek tekrardır. */
  readonly tamamlanan: { id: string } | null;
  /** Pencere içindeki son KISMI kaydın zincir teslimi — devamda düşülmez. */
  readonly oncekiTeslim: number;
}

export type Rezervasyon =
  | { tur: 'tekrar'; kayitId: string; icerik: CeviriIcerigi; ozet: KotaOzeti }
  | {
      tur: 'yeni';
      kayitId: string;
      icerik: CeviriIcerigi;
      ozet: KotaOzeti;
      /** Zincirde önceden teslim edilip düşülmüş satır. */
      oncekiTeslim: number;
      /** true → yarım kalan çevirinin devamı. */
      devam: boolean;
    };

export interface Onizleme {
  readonly epostaDogrulandi: boolean;
  /** Bu istekte kotadan düşebilecek satır: devamda KALAN satır, tekrarda 0. */
  readonly gerekenSatir: number;
  readonly metinSayisi: number;
  /** true → aynı içerik az önce çevrildi; istek kotadan düşmez. */
  readonly tekrar: boolean;
  /** true → yarım kalan çevirinin devamı; yalnız kalan satır düşer. */
  readonly devam: boolean;
  /** true → bu içeriğin çevirisi şu an sürüyor; yeni istek 409 alır. */
  readonly suruyor: boolean;
  readonly izin: boolean;
  readonly sebep: KotaKarari['sebep'];
  readonly redMesaji: string | null;
  readonly kota: KotaOzeti;
}

export interface SonuclandirmaGirdisi {
  /** Teklifin çevrilecek satır sayısı. */
  toplamSatir: number;
  /** Bu istekte haritanın karşıladığı satır. */
  teslimEdilen: number;
  /** Zincirde önceden düşülen satır (rezervasyondan). */
  oncekiTeslim: number;
  onbellekten: number;
  cevrilen: number;
  basarisizParca: number;
  hata?: string;
}

const dk = (n: number) => n * 60_000;

@Injectable()
export class CeviriKotaServisi implements OnApplicationBootstrap {
  private readonly logger = new Logger(CeviriKotaServisi.name);
  private readonly uyarilanPaketler = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Önceki süreçten `ISLENIYOR` kalan ayırmaları kapatır. HTTP dinlemesi
   * açılıştan SONRA başladığı için bu anda süren gerçek bir çeviri olamaz.
   * Veritabanı yoksa (test önyüklemesi) uygulamayı düşürmez, günlüğe yazar.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const r = await this.prisma.ceviriTuketimi.updateMany({
        where: { durum: 'ISLENIYOR', olusturuldu: { lt: new Date() } },
        data: { durum: 'BASARISIZ', hata: YENIDEN_BASLAMA_NOTU, sonuclandi: new Date() },
      });
      if (r.count > 0) this.logger.warn(`Acilista ${r.count} yarim ceviri ayirmasi kapatildi (sunucu yeniden basladi)`);
    } catch (e) {
      this.logger.error(`Acilista yarim ceviri ayirmalari kapatilamadi: ${(e as Error).message}`);
    }
  }

  /** Firmanın kayıtlı teklifinden çeviri içeriği. Başka firmanın teklifi → 404 (varlık ifşa edilmez). */
  private async teklifIcerigi(k: Kimlik, quoteId: string): Promise<CeviriIcerigi> {
    const teklif = await this.prisma.quote.findFirst({
      where: { id: quoteId, firmaId: k.firmaId },
      select: { sheets: true },
    });
    if (!teklif) throw new NotFoundException('Teklif bulunamadı.');
    return ceviriIcerigi(teklif.sheets);
  }

  private async epostaDogrulandiMi(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
    return u?.emailVerified === true;
  }

  private sayimKosulu(firmaId: string, donem: { baslangic: Date; bitis: Date }, simdi: Date): Prisma.CeviriTuketimiWhereInput {
    return {
      firmaId,
      olusturuldu: { gte: donem.baslangic, lt: donem.bitis },
      OR: [
        { durum: { in: ['BASARILI', 'KISMI'] } },
        { durum: 'ISLENIYOR', olusturuldu: { gt: new Date(simdi.getTime() - dk(ISLENIYOR_ZAMAN_ASIMI_DK)) } },
      ],
    };
  }

  private async baglam(db: Db, firmaId: string, simdi: Date): Promise<Baglam> {
    const ab = await db.abonelik.findUnique({
      where: { firmaId },
      include: { paketSurumu: { include: { paket: true } } },
    });
    if (!ab) {
      throw new ForbiddenException({
        mesaj: 'Aboneliğiniz bulunmuyor',
        aciklama: 'Çeviri için bir paket seçin.',
        eylem: { etiket: 'Paketleri gör', yol: '/abonelik' },
        kod: 'ABONELIK_KISITLI',
      });
    }
    const paket = ab.paketSurumu.paket;
    const cozulen = ceviriKotasiCoz({ seviye: paket.seviye, kapsam: paket.kapsam });
    if (!cozulen.eslendi && !this.uyarilanPaketler.has(paket.kod)) {
      this.uyarilanPaketler.add(paket.kod);
      this.logger.warn(`Paket ${paket.kod} (${paket.seviye}/${paket.kapsam}) ceviri kota tablosunda YOK — en dusuk kotaya dusuruldu`);
    }
    const kota: CeviriKotasi = { satir: cozulen.satir, dosya: cozulen.dosya };
    const donem = kotaDonemi(ab.olusturuldu, ab.paketSurumu.periyot, ab.paketSurumu.periyotAdedi, simdi);

    const kosul = this.sayimKosulu(firmaId, donem, simdi);
    const toplam = await db.ceviriTuketimi.aggregate({ where: kosul, _sum: { dusulenSatir: true } });
    // Dosya: satır düşen ve bir zincirin DEVAMI olmayan kayıt.
    const kullanilanDosya = await db.ceviriTuketimi.count({ where: { ...kosul, dusulenSatir: { gt: 0 }, devam: false } });
    const kullanilanSatir = toplam._sum.dusulenSatir ?? 0;

    return {
      abonelikId: ab.id,
      donem,
      ozet: {
        paketKodu: paket.kod,
        kota,
        donemBaslangic: donem.baslangic.toISOString(),
        donemBitis: donem.bitis.toISOString(),
        kullanilanSatir,
        kullanilanDosya,
        kalanSatir: Math.max(0, kota.satir - kullanilanSatir),
        kalanDosya: Math.max(0, kota.dosya - kullanilanDosya),
      },
    };
  }

  private async zincir(db: Db, k: Kimlik, quoteId: string, hedefDil: string, icerikOzeti: string, simdi: Date): Promise<Zincir> {
    const ayni = { firmaId: k.firmaId, quoteId, hedefDil, icerikOzeti };
    const suren = await db.ceviriTuketimi.findFirst({
      where: { ...ayni, durum: 'ISLENIYOR', olusturuldu: { gt: new Date(simdi.getTime() - dk(ISLENIYOR_ZAMAN_ASIMI_DK)) } },
      select: { id: true },
    });
    // Zincirin son halkası. Damgalar ms çözünürlüklü ve Postgres eşitlerin
    // sırasını garanti etmez: aynı ms'de sonuçlanan yarım (KISMI) halka
    // seçilirse tamamlanmış çeviri devam sanılır, kalan satır bir kez daha
    // düşer. Eşitlikte önce son OLUŞTURULAN; o da eşitse (tüm zincir tek ms'de)
    // zincirde en çok TESLİM EDEN — toplamTeslim zincir boyunca azalmaz,
    // BASARILI halkanınki KISMI'ninkinden büyüktür. (W21f · W21j · W21k)
    const son = await db.ceviriTuketimi.findFirst({
      where: { ...ayni, durum: { in: ['BASARILI', 'KISMI'] }, sonuclandi: { gt: new Date(simdi.getTime() - dk(TEKRAR_PENCERESI_DK)) } },
      orderBy: [{ sonuclandi: 'desc' }, { olusturuldu: 'desc' }, { toplamTeslim: 'desc' }],
      select: { id: true, durum: true, toplamTeslim: true },
    });
    return {
      suren: suren !== null,
      tamamlanan: son?.durum === 'BASARILI' ? { id: son.id } : null,
      oncekiTeslim: son?.durum === 'KISMI' ? son.toplamTeslim : 0,
    };
  }

  /** Profil ekranı: bu dönemin kotası. Aboneliği olmayan firma için null. */
  async durum(k: Kimlik, simdi = new Date()): Promise<KotaOzeti | null> {
    try {
      return (await this.baglam(this.prisma, k.firmaId, simdi)).ozet;
    } catch (e) {
      if (e instanceof ForbiddenException) return null;
      throw e;
    }
  }

  /** Teklif ekranı, çevirmeden ÖNCE: bu dosya kaç satır yer, kalan ne, geçer mi. Kayıt yazmaz. */
  async onizleme(k: Kimlik, quoteId: string, hedefDil = 'en', simdi = new Date()): Promise<Onizleme> {
    const icerik = await this.teklifIcerigi(k, quoteId);
    const { ozet } = await this.baglam(this.prisma, k.firmaId, simdi);
    const z = await this.zincir(this.prisma, k, quoteId, hedefDil, icerik.ozet, simdi);
    const tekrar = z.tamamlanan !== null;
    const devam = !tekrar && z.oncekiTeslim > 0;
    const gerekenSatir = tekrar ? 0 : Math.max(0, icerik.satirSayisi - z.oncekiTeslim);
    const karar = kotaKarari({
      kota: ozet.kota,
      kullanilanSatir: ozet.kullanilanSatir,
      kullanilanDosya: ozet.kullanilanDosya,
      gerekenSatir,
      yeniDosya: !devam,
    });
    return {
      epostaDogrulandi: await this.epostaDogrulandiMi(k.userId),
      gerekenSatir,
      metinSayisi: icerik.metinler.length,
      tekrar,
      devam,
      suruyor: z.suren,
      izin: karar.izin,
      sebep: karar.sebep,
      redMesaji: karar.izin ? null : kotaRedMesaji(karar, ozet.kota, new Date(ozet.donemBitis)),
      kota: ozet,
    };
  }

  /**
   * AI çağrısından ÖNCE: e-posta, tekrar, kota. Geçerse `ISLENIYOR` kaydı yazar.
   * Reddederse istisna fırlatır ve HİÇBİR şey yazmaz.
   */
  async rezerveEt(k: Kimlik, quoteId: string, hedefDil: string, simdi = new Date()): Promise<Rezervasyon> {
    if (!(await this.epostaDogrulandiMi(k.userId))) {
      throw new ForbiddenException({
        mesaj: 'Çeviri için e-posta adresinizi doğrulayın',
        aciklama: 'Hesabınıza gönderilen doğrulama bağlantısına tıklayın; ardından çeviriyi tekrar başlatın.',
        kod: 'EPOSTA_DOGRULANMADI',
      });
    }
    const icerik = await this.teklifIcerigi(k, quoteId);

    return this.prisma.$transaction(async (tx) => {
      // Firma başına seri: kota okuma + ayırma arasına başka istek giremez.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ceviri-kota:${k.firmaId}`}))::text AS kilit`;

      // Asılı kalmış ayırmalar kotayı işgal etmesin (çöken süreç açılışta kapanır).
      await tx.ceviriTuketimi.updateMany({
        where: {
          firmaId: k.firmaId,
          durum: 'ISLENIYOR',
          olusturuldu: { lte: new Date(simdi.getTime() - dk(ISLENIYOR_ZAMAN_ASIMI_DK)) },
        },
        data: { durum: 'BASARISIZ', hata: ZAMAN_ASIMI_NOTU, sonuclandi: simdi },
      });

      const b = await this.baglam(tx, k.firmaId, simdi);
      const z = await this.zincir(tx, k, quoteId, hedefDil, icerik.ozet, simdi);

      if (z.suren) {
        throw new ConflictException({
          mesaj: 'Bu teklifin çevirisi zaten sürüyor',
          aciklama: 'Birkaç dakika sonra sayfayı yenileyin. Aynı çeviri iki kez sayılmaz.',
          kod: 'CEVIRI_SURUYOR',
        });
      }
      if (z.tamamlanan) return { tur: 'tekrar', kayitId: z.tamamlanan.id, icerik, ozet: b.ozet };

      const devam = z.oncekiTeslim > 0;
      const gerekenSatir = Math.max(0, icerik.satirSayisi - z.oncekiTeslim);
      const karar = kotaKarari({
        kota: b.ozet.kota,
        kullanilanSatir: b.ozet.kullanilanSatir,
        kullanilanDosya: b.ozet.kullanilanDosya,
        gerekenSatir,
        yeniDosya: !devam,
      });
      if (!karar.izin) {
        this.logger.log(`Ceviri kotasi reddi: firma=${k.firmaId} sebep=${karar.sebep} gereken=${karar.gerekenSatir} kalanSatir=${karar.kalanSatir} kalanDosya=${karar.kalanDosya}`);
        throw new ForbiddenException({
          mesaj: kotaRedMesaji(karar, b.ozet.kota, b.donem.bitis),
          kod: 'CEVIRI_KOTASI',
          sebep: karar.sebep,
          gerekenSatir: karar.gerekenSatir,
          kalanSatir: karar.kalanSatir,
          kalanDosya: karar.kalanDosya,
          kota: b.ozet.kota,
          yenilenme: b.ozet.donemBitis,
          ...(karar.sebep === 'DOSYA_TAVANDAN_BUYUK'
            ? { eylem: { etiket: 'Paketleri gör', yol: '/abonelik' } }
            : {}),
        });
      }

      const kayit = await tx.ceviriTuketimi.create({
        data: {
          firmaId: k.firmaId,
          userId: k.userId,
          abonelikId: b.abonelikId,
          paketKodu: b.ozet.paketKodu,
          donemBaslangic: b.donem.baslangic,
          donemBitis: b.donem.bitis,
          quoteId,
          hedefDil,
          satirSayisi: icerik.satirSayisi,
          // Ayırma: sonuçlanana kadar kalan satırın tamamı sayılır.
          dusulenSatir: gerekenSatir,
          toplamTeslim: z.oncekiTeslim,
          devam,
          metinSayisi: icerik.metinler.length,
          icerikOzeti: icerik.ozet,
          durum: 'ISLENIYOR',
          olusturuldu: simdi,
        },
        select: { id: true },
      });
      return { tur: 'yeni', kayitId: kayit.id, icerik, ozet: b.ozet, oncekiTeslim: z.oncekiTeslim, devam };
    }, ISLEM_AYARI);
  }

  /**
   * Ayırmayı kapatır: TESLİM EDİLEN satıra göre durum ve düşülen satır.
   * Hâlâ `ISLENIYOR` olanı ya da ZAMAN AŞIMIYLA kapatılmış olanı günceller —
   * uzun süren iş geç biterse de teslim ettiği satır düşer. Açılışta kapatılan
   * (süreci ölmüş) kayıt sonuçlanamaz zaten.
   */
  async sonuclandir(kayitId: string, s: SonuclandirmaGirdisi): Promise<{ durum: CeviriSonucDurumu; dusulenSatir: number }> {
    const h = sonucHesabi({ toplamSatir: s.toplamSatir, teslimEdilen: s.teslimEdilen, oncekiTeslim: s.oncekiTeslim });
    await this.prisma.ceviriTuketimi.updateMany({
      where: {
        id: kayitId,
        OR: [{ durum: 'ISLENIYOR' }, { durum: 'BASARISIZ', hata: ZAMAN_ASIMI_NOTU }],
      },
      data: {
        durum: h.durum,
        dusulenSatir: h.dusulenSatir,
        toplamTeslim: h.toplamTeslim,
        onbellekten: s.onbellekten,
        cevrilen: s.cevrilen,
        basarisizParca: s.basarisizParca,
        hata: s.hata ? s.hata.slice(0, 500) : null,
        sonuclandi: new Date(),
      },
    });
    return { durum: h.durum, dusulenSatir: h.dusulenSatir };
  }
}
