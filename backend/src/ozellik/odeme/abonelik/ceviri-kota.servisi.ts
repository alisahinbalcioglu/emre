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
import { epostaDogrulandiMi } from '../../../altyapi/auth/eposta-dogrulama';
import {
  anahtarSatirlari,
  ceviriIcerigi,
  cevrilemeyenMetinler,
  type CeviriIcerigi,
} from '../../giris/ai/ceviri-kurali';
import { katmanliHaritaOku } from '../../giris/ai/ceviri-katmani';
import {
  ceviriKotasiCoz,
  gecisAnahtari,
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
 *    rezerveEt → [ödenmiş içerik ise tekrar] → çevir → sonuclandir
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
 *  ── PARA HARCANANA HAK DÜŞER (Emre 16.09 — ESKİ KURALIN YERİNE) ──
 *  Kotadan YALNIZ Claude'a gerçekten gönderilen satırlar düşer. Ortak
 *  önbellekte (`Translation`) ya da firma sözlüğünde (`CeviriDuzeltmesi`)
 *  karşılığı olan satır API'ye hiç gitmez, para harcatmaz, sayılmaz. Bir
 *  çeviride API'ye hiç metin gitmiyorsa o çeviri kotadan da DOSYA hakkından
 *  da hiç düşmez. Ayırma çağrıdan ÖNCE aynı önbellek bakışıyla hesaplanır
 *  (`katmanliHaritaOku` — çevirinin okuduğu katmanların aynısı);
 *  sonuçlandırmada GERÇEKTEN API'den dönen satır esas alınır.
 *
 *  13.09'un "aynı teklifin her çevirisi tam düşer" kuralı ARTIK GEÇERSİZDİR;
 *  onun yerine koyulan 15.09 "ödenmiş içerik" dalı da (kota bakmadan API'ye
 *  gitme yolu) KALKTI — ödenmiş bir içeriğin önbellekten düşmüş satırı
 *  yeniden para harcatıyorsa yeniden ücretlenir, harcatmıyorsa hiç
 *  ücretlenmez. Böylece "kotasız API" yolu kalmadı.
 *
 *  ── ÖDENMİŞ İÇERİK KANITI: BAKMAK ≠ ÇEVİRMEK (Faz 6.11, 15.09) ──
 *  `odenmisKayit` ARTIK KOTA KARARI VERMEZ; yalnız "bu teklifin İngilizce
 *  hâli daha önce üretildi mi" sorusuna cevap verir: İngilizce görüntüleme ve
 *  İngilizce dosya kapısı bunu sorar (`odenmisIcerikKaniti`). Kanıt =
 *  tamamlanmış (`BASARILI`) tüketim kaydı ya da geçiş izni; ZAMAN PENCERESİ
 *  ve DÖNEM SÜZGECİ YOK (K-T8, K-T9). Süren bir çeviri için gelen ikinci
 *  istek 409 alır.
 *
 *  ── HEPSİ YA DA HİÇBİRİ (REVİZE K-T7, Emre 15.09) ──
 *  Çeviri ya tamamlanır ya hiç yapılmaz. Tek satır bile çevrilemezse kayıt
 *  `BASARISIZ` olur, kotadan HİÇBİR ŞEY düşmez ve istemciye harita dönmez
 *  (`sonucHesabi`). 14.09'daki KISMI kural (yalnız teslim edileni düşürüp
 *  haritayı vermek) ve devam zinciri kalktı; eski `KISMI` kayıtlar dönem
 *  sayımında geçmiş tüketim olarak sayılır ama ödenmiş içerik KANITI da
 *  devam hakkı da DEĞİLDİR.
 *
 *  ── YARIM KALAN AYIRMA ──
 *  Süreç çökerse (deploy, bellek) `ISLENIYOR` kayıt kalır. Açılışta hepsi
 *  kapatılır — TEK sunucu örneği varsayımıyla (docker compose, tek backend).
 *  Asılı kalan bir süreç için ayrıca `ISLENIYOR_ZAMAN_ASIMI_DK` sonra sayımdan
 *  düşer; zaman aşımıyla kapatılan iş sonradan tamamlanırsa yine SONUÇLANIR ve
 *  düşer (uzun iş kotasız kalmaz).
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

/** Bu içeriğin ödendiğinin kanıtı: tamamlanmış tüketim kaydı ya da geçiş izni. */
export type OdenmisKayit = { kaynak: 'TUKETIM'; kayitId: string } | { kaynak: 'GECIS'; kayitId: null };

/** Ayırma. `gerekenSatir` 0 ise API'ye hiç metin gitmeyecek: kota da dosya hakkı da düşmez. */
export interface Rezervasyon {
  readonly kayitId: string;
  readonly icerik: CeviriIcerigi;
  readonly ozet: KotaOzeti;
  /** Ayırma anında API'ye gidecek satır (önbellek/sözlük bakışından). */
  readonly gerekenSatir: number;
  /** true → bu istekte API'ye gidecek yeni satır yok; kotadan düşmeyecek. */
  readonly tekrar: boolean;
}

/** Önbellek/sözlük bakışının sonucu: neyin API'ye gideceği. */
export interface YeniIcerik {
  /** Hiçbir katmanda karşılığı olmayan metinler — API'ye bunlar gider. */
  readonly yeniMetinler: string[];
  /** O metinlerin tuttuğu satır: kotadan düşecek olan. */
  readonly gerekenSatir: number;
  /** Önbellek/sözlükten karşılanan satır — kotadan düşmez (denetim). */
  readonly onbellektenSatir: number;
}

/** Neden ödenmiş sayılmadı — kullanıcıya YALAN söylemeyen üç durum. */
export type OdenmemeNedeni = 'CEVIRI_SURUYOR' | 'ICERIK_DEGISTI' | 'CEVIRI_YOK';

export type CeviriKaniti =
  | { odenmis: true; kaynak: 'TUKETIM' | 'GECIS'; kayitId: string | null }
  | { odenmis: false; neden: OdenmemeNedeni };

export interface Onizleme {
  readonly epostaDogrulandi: boolean;
  /** Bu istekte kotadan düşecek satır = API'ye gidecek (yeni) satır. */
  readonly gerekenSatir: number;
  /** Teklifin çevrilecek TOPLAM satırı (gerekenSatir + onbellektenSatir). */
  readonly toplamSatir: number;
  /** Önbellek/sözlükten karşılanacak, kotadan DÜŞMEYECEK satır. */
  readonly onbellektenSatir: number;
  readonly metinSayisi: number;
  /** true → API'ye gidecek yeni satır yok; çeviri kotadan hiç düşmez. */
  readonly tekrar: boolean;
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
  /** GERÇEKTEN API'den dönen satır — kotadan düşecek olan (Emre 16.09). */
  apiSatir: number;
  /** Önbellek/sözlükten karşılanan satır — kotadan düşmeyen (denetim). */
  onbellektenSatir: number;
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

  /**
   * Firmanın kayıtlı teklifi: sayfalar + çeviri içeriği (görüntüleme ikinci
   * teklif okuması yapmasın diye sayfalar da döner). Başka firmanın teklifi →
   * 404 (varlık ifşa edilmez).
   */
  async kayitliIcerik(k: Kimlik, quoteId: string): Promise<{ sayfalar: unknown; icerik: CeviriIcerigi }> {
    const teklif = await this.prisma.quote.findFirst({
      where: { id: quoteId, firmaId: k.firmaId },
      select: { sheets: true },
    });
    if (!teklif) throw new NotFoundException('Teklif bulunamadı.');
    return { sayfalar: teklif.sheets, icerik: ceviriIcerigi(teklif.sheets) };
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
    // Dosya: satır düşen ve (15.09 öncesi) bir zincirin DEVAMI olmayan kayıt.
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

  /**
   * ÖDENMİŞ İÇERİK — kanıtın TEK kuralı (Faz 6.11). Zincir, görüntüleme ve
   * dışa aktarım yalnız bunu çağırır.
   *  1. Aynı firma + teklif + dil, özet v2 ya da v1 (T1 öncesi kayıt), durum
   *     `BASARILI` — pencere ve dönem süzgeci YOK. `KISMI`, `BASARISIZ`,
   *     `ISLENIYOR` kanıt DEĞİLDİR.
   *  2. Yoksa geçiş izni (`SystemSettings`, kota öncesi çevrilmiş teklifler):
   *     değer içeriğin v2 özetini, firmayı ve dili taşımak ZORUNDA — içerik
   *     değişince izin kendiliğinden düşer. İzin denetimsiz yönetici ucuyla da
   *     yazılabildiği için izinle geçen her istek günlüğe yazılır.
   * Eşit damgalarda sıra: son sonuçlanan → son oluşturulan → en çok teslim
   * eden (W21j · W21k).
   */
  private async odenmisKayit(
    db: Db,
    firmaId: string,
    quoteId: string,
    hedefDil: string,
    icerik: Pick<CeviriIcerigi, 'ozet' | 'eskiOzet'>,
  ): Promise<OdenmisKayit | null> {
    const kayit = await db.ceviriTuketimi.findFirst({
      where: { firmaId, quoteId, hedefDil, icerikOzeti: { in: [icerik.ozet, icerik.eskiOzet] }, durum: 'BASARILI' },
      orderBy: [{ sonuclandi: 'desc' }, { olusturuldu: 'desc' }, { toplamTeslim: 'desc' }],
      select: { id: true },
    });
    if (kayit) return { kaynak: 'TUKETIM', kayitId: kayit.id };

    const izin = await db.systemSettings.findUnique({ where: { key: gecisAnahtari(quoteId, hedefDil) } });
    if (!izin) return null;
    let deger: Record<string, unknown> | null = null;
    try {
      const cozulen: unknown = JSON.parse(izin.value);
      deger = cozulen !== null && typeof cozulen === 'object' ? (cozulen as Record<string, unknown>) : null;
    } catch {
      deger = null;
    }
    if (!deger) {
      this.logger.warn(`ceviri gecis izni okunamadi (bozuk deger) firma=${firmaId} teklif=${quoteId}`);
      return null;
    }
    const uygun =
      deger.surum === 1 &&
      deger.firmaId === firmaId &&
      deger.hedefDil === hedefDil &&
      deger.icerikOzeti === icerik.ozet;
    if (!uygun) {
      this.logger.warn(`ceviri gecis izni bu icerige uymuyor firma=${firmaId} teklif=${quoteId}`);
      return null;
    }
    this.logger.log(`ceviri gecis izni kullanildi firma=${firmaId} teklif=${quoteId}`);
    return { kaynak: 'GECIS', kayitId: null };
  }

  private async surenVarMi(db: Db, k: Kimlik, quoteId: string, hedefDil: string, ozet: string, simdi: Date): Promise<boolean> {
    const suren = await db.ceviriTuketimi.findFirst({
      where: {
        firmaId: k.firmaId,
        quoteId,
        hedefDil,
        icerikOzeti: ozet,
        durum: 'ISLENIYOR',
        olusturuldu: { gt: new Date(simdi.getTime() - dk(ISLENIYOR_ZAMAN_ASIMI_DK)) },
      },
      select: { id: true },
    });
    return suren !== null;
  }

  /**
   * ÖNBELLEK BAKIŞI — kotanın TEK sayma yolu (Emre 16.09). Çeviriyle AYNI iki
   * katmanı AYNI fonksiyondan okur (`katmanliHaritaOku`): karşılığı olan metin
   * API'ye gitmeyecek, para harcatmayacak, kotadan düşmeyecektir. Kayıt yazmaz.
   *
   * ⚠ Bu sayı bir TAHMİN değil, ayırma anındaki ölçümdür; kesin ücretlendirme
   * sonuçlandırmada GERÇEKTEN API'den dönen satırla yapılır (arada başka bir
   * firma aynı metni çevirip önbelleğe yazmış olabilir — kullanıcı onu ödemez).
   */
  private async yeniIcerik(db: Db, firmaId: string, hedefDil: string, icerik: CeviriIcerigi): Promise<YeniIcerik> {
    const { harita } = await katmanliHaritaOku(db, icerik.metinler, hedefDil, firmaId);
    const yeniMetinler = cevrilemeyenMetinler(icerik.metinler, harita);
    const gerekenSatir = anahtarSatirlari(icerik, yeniMetinler);
    return { yeniMetinler, gerekenSatir, onbellektenSatir: Math.max(0, icerik.satirSayisi - gerekenSatir) };
  }

  /**
   * Bu teklifin GÜNCEL içeriği için ödenmiş çeviri var mı — varsa kaynağı,
   * yoksa nedeni. Kayıt yazmaz, kilit almaz, kotaya dokunmaz. Neden sırası:
   * aynı özetli taze `ISLENIYOR` → `CEVIRI_SURUYOR`; aynı teklifte başka
   * özetli `BASARILI` → `ICERIK_DEGISTI`; aksi (eski KISMI, BASARISIZ, hiç
   * kayıt, izni yazılmamış kota öncesi teklif) → `CEVIRI_YOK` ("içerik
   * değişti" diye yalan söylenmez).
   */
  async odenmisIcerikKaniti(
    k: Kimlik,
    quoteId: string,
    hedefDil: string,
    icerik: CeviriIcerigi,
    simdi = new Date(),
  ): Promise<CeviriKaniti> {
    const odenmis = await this.odenmisKayit(this.prisma, k.firmaId, quoteId, hedefDil, icerik);
    if (odenmis) return { odenmis: true, kaynak: odenmis.kaynak, kayitId: odenmis.kayitId };
    if (await this.surenVarMi(this.prisma, k, quoteId, hedefDil, icerik.ozet, simdi)) {
      return { odenmis: false, neden: 'CEVIRI_SURUYOR' };
    }
    // odenmisKayit boş döndüyse bu özet için BASARILI yoktur: bulunan kayıt
    // başka bir içeriğe aittir.
    const baskaIcerik = await this.prisma.ceviriTuketimi.findFirst({
      where: { firmaId: k.firmaId, quoteId, hedefDil, durum: 'BASARILI' },
      select: { id: true },
    });
    return { odenmis: false, neden: baskaIcerik ? 'ICERIK_DEGISTI' : 'CEVIRI_YOK' };
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

  /**
   * Teklif ekranı, çevirmeden ÖNCE: bu dosyanın kaç satırı YENİ (kotadan
   * düşecek), kaçı önbellekten geliyor, kalan ne, geçer mi. Kayıt yazmaz.
   * Ödenmiş içerik ayrıca sorulmaz: ödenmiş içeriğin satırları zaten
   * önbellektedir, bakış onu kendiliğinden 0'a indirir (Emre 16.09).
   */
  async onizleme(k: Kimlik, quoteId: string, hedefDil = 'en', simdi = new Date()): Promise<Onizleme> {
    const { icerik } = await this.kayitliIcerik(k, quoteId);
    const { ozet } = await this.baglam(this.prisma, k.firmaId, simdi);
    const yeni = await this.yeniIcerik(this.prisma, k.firmaId, hedefDil, icerik);
    const suruyor = await this.surenVarMi(this.prisma, k, quoteId, hedefDil, icerik.ozet, simdi);
    const karar = kotaKarari({
      kota: ozet.kota,
      kullanilanSatir: ozet.kullanilanSatir,
      kullanilanDosya: ozet.kullanilanDosya,
      gerekenSatir: yeni.gerekenSatir,
    });
    return {
      epostaDogrulandi: await epostaDogrulandiMi(this.prisma, k.userId),
      gerekenSatir: yeni.gerekenSatir,
      toplamSatir: icerik.satirSayisi,
      onbellektenSatir: yeni.onbellektenSatir,
      metinSayisi: icerik.metinler.length,
      tekrar: yeni.gerekenSatir === 0,
      suruyor,
      izin: karar.izin,
      sebep: karar.sebep,
      redMesaji: karar.izin ? null : kotaRedMesaji(karar, ozet.kota, new Date(ozet.donemBitis)),
      kota: ozet,
    };
  }

  /**
   * AI çağrısından ÖNCE: e-posta, süren çeviri, önbellek bakışı, kota. Geçerse
   * `ISLENIYOR` kaydı yazar. Reddederse istisna fırlatır ve HİÇBİR şey yazmaz.
   *
   * Ayrılan satır = API'ye GİDECEK satır (Emre 16.09). API'ye gidecek satırı
   * olmayan istek de kayıt yazar (`dusulenSatir: 0`): denetim satırı, süren
   * çeviri kilidi ve ödenmiş içerik kanıtı ondan çıkar — ama kotadan da dosya
   * hakkından da hiçbir şey yemez.
   */
  async rezerveEt(k: Kimlik, quoteId: string, hedefDil: string, simdi = new Date()): Promise<Rezervasyon> {
    if (!(await epostaDogrulandiMi(this.prisma, k.userId))) {
      throw new ForbiddenException({
        mesaj: 'Çeviri için e-posta adresinizi doğrulayın',
        aciklama: 'Hesabınıza gönderilen doğrulama bağlantısına tıklayın; ardından çeviriyi tekrar başlatın.',
        kod: 'EPOSTA_DOGRULANMADI',
      });
    }
    const { icerik } = await this.kayitliIcerik(k, quoteId);

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

      if (await this.surenVarMi(tx, k, quoteId, hedefDil, icerik.ozet, simdi)) {
        throw new ConflictException({
          mesaj: 'Bu teklifin çevirisi zaten sürüyor',
          aciklama: 'Birkaç dakika sonra sayfayı yenileyin. Aynı çeviri iki kez sayılmaz.',
          kod: 'CEVIRI_SURUYOR',
        });
      }

      const yeni = await this.yeniIcerik(tx, k.firmaId, hedefDil, icerik);
      const gerekenSatir = yeni.gerekenSatir;
      const karar = kotaKarari({
        kota: b.ozet.kota,
        kullanilanSatir: b.ozet.kullanilanSatir,
        kullanilanDosya: b.ozet.kullanilanDosya,
        gerekenSatir,
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
          // Ayırma: sonuçlanana kadar API'ye gidecek satırın tamamı sayılır.
          dusulenSatir: gerekenSatir,
          onbellektenSatir: yeni.onbellektenSatir,
          toplamTeslim: 0,
          devam: false,
          metinSayisi: icerik.metinler.length,
          icerikOzeti: icerik.ozet,
          durum: 'ISLENIYOR',
          olusturuldu: simdi,
        },
        select: { id: true },
      });
      return { kayitId: kayit.id, icerik, ozet: b.ozet, gerekenSatir, tekrar: gerekenSatir === 0 };
    }, ISLEM_AYARI);
  }

  /**
   * Ayırmayı kapatır: tam teslimde `BASARILI` ve GERÇEKTEN API'den dönen satır
   * düşer, eksikte `BASARISIZ` ve hiçbir şey düşmez (`sonucHesabi`). Hâlâ
   * `ISLENIYOR` olanı ya da ZAMAN AŞIMIYLA kapatılmış olanı günceller — uzun
   * süren iş geç biterse de düşer. Açılışta kapatılan (süreci ölmüş) kayıt
   * sonuçlanamaz zaten.
   */
  async sonuclandir(kayitId: string, s: SonuclandirmaGirdisi): Promise<{ durum: CeviriSonucDurumu; dusulenSatir: number }> {
    const h = sonucHesabi({ toplamSatir: s.toplamSatir, teslimEdilen: s.teslimEdilen, apiSatir: s.apiSatir });
    await this.prisma.ceviriTuketimi.updateMany({
      where: {
        id: kayitId,
        OR: [{ durum: 'ISLENIYOR' }, { durum: 'BASARISIZ', hata: ZAMAN_ASIMI_NOTU }],
      },
      data: {
        durum: h.durum,
        dusulenSatir: h.dusulenSatir,
        toplamTeslim: h.toplamTeslim,
        // Denetim: düşen (API) satır ile düşmeyen (önbellek) satır AYRIK durur.
        onbellektenSatir: Math.max(0, s.onbellektenSatir),
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
