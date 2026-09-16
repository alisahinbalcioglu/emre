import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import type { Kimlik } from '../../../altyapi/auth/kimlik';
import { CeviriKotaServisi, type KotaOzeti, type OdenmemeNedeni } from '../../odeme/abonelik/ceviri-kota.servisi';
import {
  ceviriKapisiReddi,
  ceviriTamamlanamadiHatasi,
  sonucHesabi,
} from '../../odeme/abonelik/ceviri-kotasi';
import { AiService } from './ai.service';
import { katmanlariBirlestir, kaynakOzeti, type KatmanliHarita } from './ceviri-katmani';
import { duzeltmeReddi } from './ceviri-duzeltme.servisi';
import {
  ceviriAnahtari,
  ceviriGuvenliMi,
  ceviriIcerigi,
  cevrilemeyenMetinler,
  disaAktarimPlani,
  kaynakMetinleriniGeriYaz,
  planiUygula,
  teslimEdilenSatir,
  type CeviriIcerigi,
} from './ceviri-kurali';

/**
 * TEKNIK METIN CEVIRISI — ONBELLEK ONCE, API SONRA (13.08).
 *
 * ── AKIS ────────────────────────────────────────────────────────────────────
 *   benzersiz metinler → katmanli harita (onbellek) → EKSIK OLANLAR icin
 *   tek/birkac API cagrisi → onbellege yaz → birlesik harita
 *
 * Metinleri istemci GONDERMEZ (Faz 6.2, 14.09): `teklifiCevir` kayitli
 * teklifi okur, DOKUNULMAZLARI (cap/olcu/kod) eler ve benzersizlestirir —
 * kural tek yerde, `ceviri-kurali.ts` (testle muhurlu). 13.08–14.09 arasi bu
 * karar on yuzdeydi; kota satiri da ondan cikacagi icin sunucuya tasindi.
 *
 * ── HEPSI YA DA HICBIRI (REVIZE K-T7, Emre 15.09) ───────────────────────────
 * Ceviri ya tamamlanir ya hic yapilmaz: tek metin bile cevrilemezse tuketim
 * BASARISIZ, kotadan hicbir sey dusmez ve istemciye harita DONMEZ (422 +
 * cevrilemeyenlerin listesi). Cevrilen metinler onbellege yazilir: tekrar
 * deneme ucretsiz ve hizlidir, tamamlaninca tek seferde duser.
 *
 * ── BAKMAK ≠ CEVIRMEK (Faz 6.10/6.11, 15.09) ────────────────────────────────
 * Ingilizce metin istemciye (ekran ya da dosya) yalniz ODENMIS icerik icin
 * cikar ve her okumada TEK fonksiyondan (`katmanliHarita`) kurulur. Hicbir
 * yol rastgele bir metnin ortak karsiligini dondurmez: aksi halde "ucretsiz
 * sozluk sorgusu" ile teklif elle Ingilizceye cevrilip kota asilirdi.
 *
 * ── NEDEN ONBELLEK ONCE ─────────────────────────────────────────────────────
 * Canli teklif 15.137 satir. Benzersizlestirme birkac yuze indiriyor; kalici
 * onbellek ikinci teklifte onu da SIFIRA indiriyor. Ceviri ozelliginin
 * ekonomisi tamamen buna bagli — bu yuzden onbellek isabeti loglanir ve
 * admin panelinde gorunur.
 *
 * ── SOZLUK NEDEN SISTEM PROMPT'UNDA ─────────────────────────────────────────
 * Mekanik tesisat terimleri genel cevirmende bozulur ("Rekor" → "record").
 * Sozluk sabit oldugu icin sistem prompt'unda durur ve PROMPT ONBELLEGINE
 * girer (ikinci cagridan itibaren o kisim ~%10 fiyata okunur).
 */

/** Yapilandirilmis cikti semasi — ayristirma hatasi YAPISAL OLARAK imkansiz. */
const CEVIRI_SEMASI = {
  type: 'object',
  properties: {
    ceviriler: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kaynak: { type: 'string' },
          ceviri: { type: 'string' },
        },
        required: ['kaynak', 'ceviri'],
        additionalProperties: false,
      },
    },
  },
  required: ['ceviriler'],
  additionalProperties: false,
} as const;

/**
 * MEKANIK/TESISAT TERIM SOZLUGU.
 * Genel cevirinin en sik bozdugu terimler. Liste buyudukce prompt onbellegi
 * daha da degerli olur (sabit prefix).
 */
const SOZLUK: Array<[string, string]> = [
  ['küresel vana', 'ball valve'],
  ['kelebek vana', 'butterfly valve'],
  ['çek vana', 'check valve'],
  ['pislik tutucu', 'strainer'],
  ['rekor', 'union'],
  ['flanş', 'flange'],
  ['dirsek', 'elbow'],
  ['te', 'tee'],
  ['redüksiyon', 'reducer'],
  ['kelepçe', 'clamp'],
  ['manşon', 'coupling'],
  ['körtapa', 'end cap'],
  ['hidrofor', 'booster pump set'],
  ['sıhhi tesisat', 'plumbing'],
  ['temiz su', 'domestic cold water'],
  ['pis su', 'waste water'],
  ['yangın', 'fire fighting'],
  ['sprinkler', 'sprinkler'],
  ['izolasyon', 'insulation'],
  ['montaj bedeli', 'installation cost'],
  ['işçilik', 'labour'],
  ['fittings oranı', 'fittings allowance'],
];

/**
 * CEVIRI MODELI — saglik kontrolu de AYNI sabiti kullanir (admin.service).
 *
 * ⚠ 13.08'de bu iki yer AYRI modeller kullaniyordu: panel `claude-sonnet-4-6`
 * ile "Baglanti basarili" diyordu, ceviri ise `claude-opus-5` cagiriyordu.
 * Yesil rozet, ceviri yolunun calistigini KANITLAMIYORDU — hesabin o modele
 * erisimi yoksa ya da fiyati bakiyeyi asiyorsa panel yesil kalirken ceviri
 * patlardi. Olcut, olcmesi gereken seyin KENDISI olmali.
 *
 * Neden Sonnet: bu is ceviri degil ESLEME — sozluk sistem prompt'unda sabit,
 * cikti json_schema ile YAPISAL olarak zorlanmis. Opus'un ek muhakemesi
 * burada karsiligi olmayan bir maliyet; ayni bakiye Sonnet'le kat kat daha
 * uzaga gider.
 */
export const CEVIRI_MODEL = 'claude-sonnet-5';
const MODEL = CEVIRI_MODEL;
/**
 * Tek istekte gonderilecek metin sayisi.
 *
 * ⚠ 13.08 canli olcumu: 9.142 satirlik teklifte 150'lik parcalar 529
 * (`overloaded_error`) aldi — AYNI anda ayni anahtarla saglik kontrolu (5
 * token'lik ping) BASARILIYDI. Yani anahtar/kota degil, ISTEGIN BUYUKLUGU
 * belirleyici: buyuk istekler yogunluk aninda once reddediliyor.
 *
 * 60'a dusurmenin iki olculebilir etkisi var: (1) tek istek daha kisa surer,
 * reddedilme penceresi daralir; (2) bir parca patladiginda 150 degil 60 metin
 * kaybolur — gerisi onbellege yazildigi icin tekrar deneme kaldigi yerden
 * devam eder. Daha da kucultmek istek SAYISINI artirip 429 riskini buyutur.
 */
const PARCA = 60;

/**
 * SDK varsayilani 2 deneme. 529/5xx GECICI oldugu icin tek dogru davranis
 * beklemek ve yeniden denemek — SDK bunu ustel geri cekilmeyle kendisi yapar.
 * Kullaniciya hata gostermeden once daha fazla sans verilir.
 */
const YENIDEN_DENEME = 5;

export interface CeviriSonucu {
  harita: Record<string, string>;
  onbellekten: number;
  cevrilen: number;
  /** API'ye gidip BASARISIZ olan parca sayisi. */
  basarisiz: number;
  /** Ilk parca hatasi — 422 aciklamasinin sebep metni icin. */
  ilkHata: { durum?: number; mesaj: string } | null;
  /** Guvenlik suzgecinden (K-T11) gecemeyen AI yaniti — haritaya ve onbellege GIRMEDI. */
  guvensiz?: number;
}

/** Teklif çevirisinin istemciye dönen hâli — yalnız TAMAMLANMIŞ çeviride (Faz 6.2 · REVİZE K-T7). */
export interface TeklifCeviriSonucu extends Omit<CeviriSonucu, 'ilkHata' | 'guvensiz'> {
  /** Teklifin çevrilecek metin içeren satır sayısı. */
  satirSayisi: number;
  /** Bu istekte kotadan düşen satır (ödenmiş içerikte 0). */
  dusulenSatir: number;
  /** true → bu içeriğin çevirisi ödenmişti; yeni tüketim YOK. */
  tekrar: boolean;
  /** true → kotadan satır düştü. */
  kotadanDustu: boolean;
  /** İstek SONRASI kota durumu. */
  kota: KotaOzeti;
}

/** Firma + ortak katmandan okunan çeviri haritası (tanım: `ceviri-katmani.ts`). */
export type { KatmanliHarita };

/** `GET /ai/translate/goruntule` yanıtı — harita YALNIZ ödenmiş ve tam içerikte. */
export type GoruntulemeYaniti =
  | { odenmis: true; tamam: true; kaynak: 'TUKETIM' | 'GECIS'; harita: Record<string, string>; satirSayisi: number }
  | { odenmis: true; tamam: false; kaynak: 'TUKETIM' | 'GECIS'; satirSayisi: number; cevrilemeyenSatir: number }
  | { odenmis: false; neden: OdenmemeNedeni; satirSayisi: number; degisecekSatir: number; karsiliksizSatir: number };

/** Dışa aktarımın dil kararı: dosya etiketi, yazılan hücre, görünür uyarı. */
export interface DisaAktarimCevirisi {
  /** Dosyanın etiket dili — KAYIT yolunda Türkçeye indirgenirse 'tr'. */
  readonly dil: 'tr' | 'en';
  readonly cevrilen: number;
  readonly uyari?: string;
  /** true → kayıttan gelen İngilizce istek tam İngilizce çıkamadı, dosya tamamen Türkçe. */
  readonly indirgendi: boolean;
}

/** KAYIT yolunda Türkçeye indirgeme uyarısı (X-Export-Warning). */
export const KAYIT_INDIRGEME_UYARISI = 'Dosya teklifin Türkçe hâliyle indi: tamamlanmış İngilizce çevirisi yok.';

/**
 * API hatasini kullanicinin YAPABILECEGI bir eyleme cevirir.
 *
 * ⚠ Ham SDK mesaji ("invalid x-api-key") kullaniciya tek basina hicbir sey
 * soylemiyor. 13.08'de tam olarak bu yasandi: anahtar gecersizdi, her parca
 * 401 aldi, ama uc 200 + BOS HARITA dondu ve ekran "Ceviri tamamlandi" dedi.
 * Ozellik calismiyordu ve bunu kimse goremiyordu.
 */
export function ceviriHataMesaji(durum: number | undefined, mesaj: string): string {
  if (durum === 401 || durum === 403) {
    return 'Claude API anahtari GECERSIZ (401). Admin → Istatistikler → AI Kullanimi bolumunden guncel anahtari girin.';
  }
  if (durum === 429) {
    return 'Claude API istek siniri asildi (429). Kisa bir sure sonra tekrar deneyin.';
  }
  /**
   * 5xx = saglayicinin SUNUCU tarafi. 529 (`overloaded_error`) bunun en sik
   * gorulen hali: sunucular o an asiri yuklu. Anahtar, kota, bakiye ve kod
   * ile ILGISI YOK — tek dogru eylem beklemek. Genel dala dusurmek ("servis
   * yanit vermedi") kullaniciyi CALISAN anahtarini kurcalamaya iterdi.
   *
   * ⚠ Bu kosul once `durum === 529 || (… >= 500 && … < 600)` yazilmisti;
   * mutasyon turu IKI parcanin da OLU oldugunu gosterdi: 529 zaten 5xx
   * araliginda ve HTTP'de 6xx YOK, yani ust sinir hicbir zaman is yapmiyordu.
   * Olculemeyen kod, dogru gorunse bile yanlis guven verir — silindi.
   */
  if (durum !== undefined && durum >= 500) {
    return `AI servisi su an asiri yogun (${durum}) — anahtarinizda ya da teklifinizde bir sorun YOK. Birkac dakika sonra tekrar deneyin; cevrilmis metinler onbellege yazildigi icin tekrar deneme kaldigi yerden devam eder.`;
  }
  if (durum === 400) {
    return `Ceviri istegi reddedildi (400): ${mesaj}`;
  }
  return `Ceviri servisi yanit vermedi: ${mesaj}`;
}

/** Prototipsiz kopya: "constructor" gibi bir metin haritada VAR sanılmasın. */
function haritaKopyasi(kaynak: Readonly<Record<string, string>>): Record<string, string> {
  const kopya: Record<string, string> = Object.create(null);
  for (const [a, v] of Object.entries(kaynak)) kopya[a] = v;
  return kopya;
}

@Injectable()
export class CeviriService {
  private readonly logger = new Logger(CeviriService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private kota: CeviriKotaServisi,
  ) {}

  /**
   * TEKLİF ÇEVİRİSİ — istemcinin tek giriş yolu (Faz 6.2, 14.09 · REVİZE K-T7, 15.09).
   *
   * İstemci yalnız teklif kimliği gönderir. Çevrilecek metinler ve kotadan
   * düşecek satır KAYITLI teklif içeriğinden, aynı kuraldan çıkar
   * (`ceviri-kurali.ts`). Sıra değiştirilemez:
   *   1. rezerveEt — e-posta, ödenmiş içerik, kota; geçmezse AI'ya HİÇ gidilmez
   *   2. ödenmiş içerik → katmanlı harita; eksik anahtar kotasız tamamlanır
   *   3. çevir
   *   4. tek metin bile eksikse BASARISIZ + 422 (harita dönmez, hiçbir şey
   *      düşmez); tamsa BASARILI ve satırın tamamı düşer
   */
  async teklifiCevir(k: Kimlik, quoteId: string, hedefDil = 'en'): Promise<TeklifCeviriSonucu> {
    const r = await this.kota.rezerveEt(k, quoteId, hedefDil);

    if (r.tur === 'tekrar') return this.odenmisIcerigiTamamla(k, r.icerik, hedefDil, r.ozet);

    const toplamSatir = r.icerik.satirSayisi;
    let sonuc: CeviriSonucu;
    try {
      sonuc = await this.cevir(r.icerik.metinler, hedefDil, k);
    } catch (e) {
      await this.sonuclandirSessiz(r.kayitId, {
        toplamSatir,
        teslimEdilen: 0,
        onbellekten: 0,
        cevrilen: 0,
        basarisizParca: 0,
        hata: (e as Error)?.message ?? 'bilinmeyen hata',
      });
      throw e;
    }

    const eksik = cevrilemeyenMetinler(r.icerik.metinler, sonuc.harita);
    if (eksik.length > 0) {
      const teslimEdilen = teslimEdilenSatir(r.icerik, sonuc.harita);
      await this.sonuclandirSessiz(r.kayitId, {
        toplamSatir,
        teslimEdilen,
        onbellekten: sonuc.onbellekten,
        cevrilen: sonuc.cevrilen,
        basarisizParca: sonuc.basarisiz,
        hata: `${eksik.length} metin cevrilemedi (${sonuc.basarisiz} parca basarisiz${sonuc.guvensiz ? `, ${sonuc.guvensiz} yanit guvenlik suzgecinden gecmedi` : ''})`,
      });
      throw ceviriTamamlanamadiHatasi(eksik, toplamSatir - teslimEdilen, this.sebepMetni(sonuc.ilkHata));
    }

    const h = sonucHesabi({ toplamSatir, teslimEdilen: toplamSatir });
    await this.sonuclandirSessiz(r.kayitId, {
      toplamSatir,
      teslimEdilen: toplamSatir,
      onbellekten: sonuc.onbellekten,
      cevrilen: sonuc.cevrilen,
      basarisizParca: sonuc.basarisiz,
    });

    const dosya = h.dusulenSatir > 0 ? 1 : 0;
    return {
      harita: sonuc.harita,
      onbellekten: sonuc.onbellekten,
      cevrilen: sonuc.cevrilen,
      basarisiz: sonuc.basarisiz,
      satirSayisi: toplamSatir,
      dusulenSatir: h.dusulenSatir,
      tekrar: false,
      kotadanDustu: h.dusulenSatir > 0,
      kota: {
        ...r.ozet,
        kullanilanSatir: r.ozet.kullanilanSatir + h.dusulenSatir,
        kullanilanDosya: r.ozet.kullanilanDosya + dosya,
        kalanSatir: Math.max(0, r.ozet.kalanSatir - h.dusulenSatir),
        kalanDosya: Math.max(0, r.ozet.kalanDosya - dosya),
      },
    };
  }

  /**
   * ÖDENMİŞ İÇERİK (tekrar dalı, Revizyon 1 R1-A4). Harita katmanlı okumadan
   * gelir. Önbellekte eksik anahtar varsa (önbellek yazımı patlamış içerik)
   * API'ye YALNIZ o anahtarlar sorulur: AI maliyeti firmaya yazılır, KOTA ve
   * tüketim kaydı YOK (ödenmiş içerik yeniden ücretlenmez, K-T8). Yine eksik
   * kalırsa 422 — kısmi harita teslim edilmez (K-T7b).
   */
  private async odenmisIcerigiTamamla(k: Kimlik, icerik: CeviriIcerigi, hedefDil: string, ozet: KotaOzeti): Promise<TeklifCeviriSonucu> {
    const okunan = await this.katmanliHarita(icerik.metinler, hedefDil, k.firmaId);
    const harita = haritaKopyasi(okunan.harita);
    const onbellekten = Object.keys(harita).length;
    let cevrilen = 0;
    let basarisiz = 0;
    let ilkHata: CeviriSonucu['ilkHata'] = null;

    const eksik = cevrilemeyenMetinler(icerik.metinler, harita);
    if (eksik.length > 0) {
      const ek = await this.cevir(eksik, hedefDil, k);
      for (const [a, v] of Object.entries(ek.harita)) harita[a] = v;
      cevrilen = ek.cevrilen;
      basarisiz = ek.basarisiz;
      ilkHata = ek.ilkHata;
    }
    const kalan = cevrilemeyenMetinler(icerik.metinler, harita);
    if (kalan.length > 0) {
      throw ceviriTamamlanamadiHatasi(kalan, icerik.satirSayisi - teslimEdilenSatir(icerik, harita), this.sebepMetni(ilkHata));
    }
    return {
      harita,
      onbellekten,
      cevrilen,
      basarisiz,
      satirSayisi: icerik.satirSayisi,
      dusulenSatir: 0,
      tekrar: true,
      kotadanDustu: false,
      kota: ozet,
    };
  }

  private sebepMetni(ilkHata: CeviriSonucu['ilkHata']): string | undefined {
    return ilkHata ? ceviriHataMesaji(ilkHata.durum, ilkHata.mesaj) : undefined;
  }

  /**
   * Sonuçlandırma yazılamazsa çeviri sonucu kullanıcıdan SAKLANMAZ — ama sessiz
   * de kalmaz (hata yutma dersi). Kayıt `ISLENIYOR` kalır; zaman aşımında
   * kotaya sayılmaz ve bir sonraki ayırmada temizlenir.
   */
  private async sonuclandirSessiz(
    kayitId: string,
    s: Parameters<CeviriKotaServisi['sonuclandir']>[1],
  ): Promise<void> {
    try {
      await this.kota.sonuclandir(kayitId, s);
    } catch (e) {
      this.logger.error(`Ceviri tuketim kaydi sonuclandirilamadi (${kayitId}): ${(e as Error).message}`);
    }
  }

  private sistemPrompt(): string {
    const sozluk = SOZLUK.map(([tr, en]) => `${tr} = ${en}`).join('\n');
    return [
      'You translate Turkish mechanical/plumbing (HVAC & sanitary) bill-of-quantity item names into English.',
      'These strings appear in a commercial quotation sent to a client, so use standard industry terminology, not literal translation.',
      '',
      'RULES:',
      '- Keep every size, diameter, code and number EXACTLY as written: DN 20, Ø110, 6", 1 1/4", PN 20, 9MM.',
      '- Never add explanations, units, or parenthetical notes that were not in the source.',
      '- Keep the original capitalisation style (ALL CAPS source stays ALL CAPS).',
      '- Brand names and proper nouns stay unchanged.',
      '- If a string is already English, return it unchanged.',
      '',
      'GLOSSARY (authoritative — use these exact terms):',
      sozluk,
    ].join('\n');
  }

  /** Anthropic istemcisi — testler bu metodu sahte istemciyle ezer (dikiş). */
  protected anthropicIstemcisi(apiKey: string): Pick<Anthropic, 'messages'> {
    return new Anthropic({ apiKey, maxRetries: YENIDEN_DENEME });
  }

  /**
   * KATMANLI HARİTA — İngilizce metnin TEK okuma yolu (Faz 6.11 · 6.9). Çeviri,
   * görüntüleme ve dışa aktarım haritayı yalnız buradan kurar; harita yalnız
   * verilen metinlerin anahtarları için kurulur. Okuma sırası firma → ortak →
   * API (iş emri 6.9 §3): iki sorgu paralel, birleştirme saf
   * (`katmanlariBirlestir`) — firma düzeltmesi ortağın ÜSTÜNE biner, silmez.
   * ⚠ `firmaId` ZORUNLU: Prisma `undefined` süzgeci sessizce düşürür (kimlik.ts
   * dersi) — firma süzgeci düşerse A firmasının düzeltmesi B'nin teklifine girerdi.
   */
  async katmanliHarita(metinler: readonly string[], hedefDil: string, firmaId: string): Promise<KatmanliHarita> {
    if (typeof firmaId !== 'string' || firmaId === '') throw new Error('katmanliHarita: firmaId zorunlu');
    const benzersiz = Array.from(new Set(metinler.map((m) => ceviriAnahtari(m)).filter(Boolean)));
    if (benzersiz.length === 0) return { harita: Object.create(null), katman: new Map() };
    const [ortak, firma] = await Promise.all([
      this.prisma.translation.findMany({
        where: { targetLang: hedefDil, sourceText: { in: benzersiz } },
        select: { sourceText: true, translatedText: true },
      }),
      this.prisma.ceviriDuzeltmesi.findMany({
        where: { firmaId, hedefDil, kaynakOzeti: { in: benzersiz.map((m) => kaynakOzeti(m)) } },
        select: { kaynakMetin: true, kaynakOzeti: true, ceviriMetni: true },
      }),
    ]);
    return katmanlariBirlestir(benzersiz, ortak, firma);
  }

  /**
   * Metin listesini cevirir. Katmanli haritada olanlar icin API'ye HIC gidilmez.
   * Karar VERMEZ: eksik kalan metinleri `teklifiCevir` `cevrilemeyenMetinler`
   * ile bulur (hepsi ya da hicbiri tek yerde).
   */
  async cevir(metinler: string[], hedefDil = 'en', kimlik: Kimlik): Promise<CeviriSonucu> {
    const benzersiz = Array.from(
      new Set(metinler.map((m) => ceviriAnahtari(m)).filter(Boolean)),
    );
    if (benzersiz.length === 0) return { harita: Object.create(null), onbellekten: 0, cevrilen: 0, basarisiz: 0, ilkHata: null };

    // ── 1) KATMANLI HARİTA (onbellek) ─────────────────────────────────────
    const okunan = await this.katmanliHarita(benzersiz, hedefDil, kimlik.firmaId);
    const harita = haritaKopyasi(okunan.harita);
    const onbellekten = Object.keys(harita).length;

    // Firma karşılığı da ortak karşılık da API'ye GİTMEZ (iki katman birden).
    const eksik = benzersiz.filter((m) => !Object.prototype.hasOwnProperty.call(harita, m));
    if (eksik.length === 0) return { harita, onbellekten, cevrilen: 0, basarisiz: 0, ilkHata: null, guvensiz: 0 };

    // ── 2) API ─────────────────────────────────────────────────────────────
    const ayarlar = await this.prisma.systemSettings.findMany({ where: { key: 'CLAUDE_API_KEY' } });
    const apiKey = ayarlar[0]?.value || process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      throw new BadRequestException(
        'Ceviri icin Claude API anahtari tanimli degil (Admin → Ayarlar → CLAUDE_API_KEY).',
      );
    }

    const client = this.anthropicIstemcisi(apiKey);
    let cevrilen = 0;
    // Parca sonuclari SAYILIR: "kac denendi / kaci patladi" bilinmeden
    // basarisizligi basaridan ayirmak imkansizdir.
    let basarisizParca = 0;
    let yazilamayan = 0;
    let guvensiz = 0;
    let ilkHata: { durum?: number; mesaj: string } | null = null;

    for (let i = 0; i < eksik.length; i += PARCA) {
      const parca = eksik.slice(i, i + PARCA);
      try {
        const yanit = await client.messages.create({
          model: MODEL,
          max_tokens: 16000,
          // Sozluk sabit prefix → prompt onbellegi (ikinci cagridan ucuz).
          system: [{ type: 'text', text: this.sistemPrompt(), cache_control: { type: 'ephemeral' } }],
          output_config: { format: { type: 'json_schema', schema: CEVIRI_SEMASI } },
          messages: [
            {
              role: 'user',
              content:
                'Translate each item. Return one entry per input, with `kaynak` copied verbatim.\n\n' +
                parca.map((m) => `- ${m}`).join('\n'),
            },
          ],
        } as any);

        await this.ai.logUsage({
          kimlik,
          feature: 'translate',
          provider: 'claude',
          model: MODEL,
          usage: (yanit as any).usage,
          success: true,
        });

        const metin = (yanit.content.find((b: any) => b.type === 'text') as any)?.text ?? '';
        const cozulen = JSON.parse(metin) as { ceviriler: Array<{ kaynak: string; ceviri: string }> };

        for (const c of cozulen.ceviriler ?? []) {
          const kaynak = ceviriAnahtari(c.kaynak);
          const ceviri = String(c.ceviri ?? '').trim();
          // ⚠ Uydurulmus anahtar YAZILMAZ: model istemedigimiz bir metni geri
          // dondurdurse onbellege girmemeli — onbellek kalicidir, kirlenirse
          // hatayi her teklife tasir.
          if (!kaynak || !ceviri || !parca.includes(kaynak)) continue;
          // ⚠ ZEHİRLEME SÜZGECİ (K-T11 · R1-B2): kullanıcının KENDİ metniyle
          // tetiklenen yanıt ortak önbelleğe "ilk yazan kazanır" ile yazılır ve
          // her firmanın teklifine gider. Kaynaktaki sayı/ölçü dizileri korunmuyor
          // ya da kaynakta olmayan bağlantı/e-posta eklenmişse: haritaya GİRMEZ,
          // SAYILMAZ, önbelleğe YAZILMAZ → metin eksik kalır → teklif
          // "tamamlanamadı" (422, hepsi ya da hiçbiri), kotadan bir şey düşmez.
          if (!ceviriGuvenliMi(kaynak, ceviri)) {
            guvensiz++;
            continue;
          }
          harita[kaynak] = ceviri;
          cevrilen++;
          // ⚠ ANAHTAR BAŞINA (Revizyon 1 R1-A5): tek anahtarın yazımı patlarsa
          // (geçici DB hatası, uzun metnin indeks tavanı) parçanın kalan
          // çevirileri kaybolmasın. Hepsi-ya-da-hiçbiri altında ortak try, tek
          // bir kötü satırla teklifin TAMAMINI kalıcı olarak çevrilemez yapardı.
          try {
            await this.prisma.translation.upsert({
              where: { sourceText_targetLang: { sourceText: kaynak, targetLang: hedefDil } },
              create: { sourceText: kaynak, targetLang: hedefDil, translatedText: ceviri, kaynak: 'ai' },
              // Kullanici duzeltmesi (kaynak='manual') AI tarafindan EZILMEZ.
              update: {},
            });
          } catch {
            yazilamayan++;
          }
        }
      } catch (e) {
        basarisizParca++;
        const durum = (e as any)?.status as number | undefined;
        if (!ilkHata) ilkHata = { durum, mesaj: (e as Error).message };
        await this.ai.logUsage({
          kimlik,
          feature: 'translate',
          provider: 'claude',
          model: MODEL,
          success: false,
          errorMessage: (e as Error).message,
        });
        // Parca hatasi digerlerini durdurmaz; cevrilemeyenler eksik kalir.
        console.error('[Ceviri] parca hatasi:', durum ?? '-', (e as Error).message);
      }
    }

    // Metin gunluge YAZILMAZ (musteri verisi olabilir); sayi yazilir.
    if (yazilamayan > 0) this.logger.error(`Ceviri onbellege yazilamadi: ${yazilamayan} metin`);
    if (guvensiz > 0) this.logger.warn(`Ceviri guvenlik suzgeci ${guvensiz} yaniti reddetti (onbellege yazilmadi, teslim edilmedi)`);

    return { harita, onbellekten, cevrilen, basarisiz: basarisizParca, ilkHata, guvensiz };
  }

  /**
   * GÖRÜNTÜLEME — bakmak ≠ çevirmek (Faz 6.11). Kota işlemi, kilit, tüketim
   * kaydı, AI çağrısı ve `logUsage` YOK. Harita yalnız ödenmiş VE tam içerikte
   * döner; ödenmemiş ya da eksik içerikte istemciye yalnız sayı çıkar (sayı
   * dışa aktarımın `CEVIRI_GEREKLI` cevabından fazlasını söylemez). `tamam`
   * ölçütü dosyayla ortaktır: planın karşılıksız satırı yok.
   */
  async teklifGorunumu(k: Kimlik, quoteId: string, hedefDil = 'en'): Promise<GoruntulemeYaniti> {
    const { sayfalar, icerik } = await this.kota.kayitliIcerik(k, quoteId);
    const kanit = await this.kota.odenmisIcerikKaniti(k, quoteId, hedefDil, icerik);
    const { harita } = await this.katmanliHarita(icerik.metinler, hedefDil, k.firmaId);
    const plan = disaAktarimPlani(sayfalar, harita);
    if (kanit.odenmis === false) {
      return {
        odenmis: false,
        neden: kanit.neden,
        satirSayisi: icerik.satirSayisi,
        degisecekSatir: plan.degisecek.length,
        karsiliksizSatir: plan.karsiliksiz,
      };
    }
    if (plan.karsiliksiz === 0) {
      return { odenmis: true, tamam: true, kaynak: kanit.kaynak, harita, satirSayisi: icerik.satirSayisi };
    }
    return { odenmis: true, tamam: false, kaynak: kanit.kaynak, satirSayisi: icerik.satirSayisi, cevrilemeyenSatir: plan.karsiliksiz };
  }

  /**
   * İNGİLİZCE DOSYA KARARI (Faz 6.10 · R1-B6 · Emre 15.09 "tam değilse
   * çevirmesin"). Yalnız çözülmüş dil `en` iken çağrılır; rev/arşivden ÖNCE.
   * `sheets` bu indirmenin kopyasıdır (kayda dönmez) ve yerinde yazılır.
   *  · değişecek 0 ve karşılıksız 0 → İngilizce; kanıt SORULMAZ (değişen yok)
   *  · ödenmiş ve karşılıksız 0     → plan uygulanır, İngilizce
   *  · aksi (karşılıksız > 0 ya da ödenmemiş) tam İngilizce çıkamaz:
   *      açık istek  → 403 `CEVIRI_GEREKLI` / 409 `CEVIRI_SURUYOR` / 409 `CEVIRI_EKSIK`
   *      kayıttan    → dosya TAMAMEN Türkçe (işaretli hücre Türkçe kaynağına
   *                    döner) + görünür uyarı; kota ve kapı yok (KVKK indirmesi)
   * Başlıkları İngilizce, adları Türkçe karışık dosya hiçbir yoldan ÜRETİLMEZ.
   */
  async disaAktarimCevirisi(k: Kimlik, quoteId: string, sheets: unknown, dilKaynagi: 'ACIK' | 'KAYIT'): Promise<DisaAktarimCevirisi> {
    const icerik = ceviriIcerigi(sheets);
    const { harita } = await this.katmanliHarita(icerik.metinler, 'en', k.firmaId);
    const plan = disaAktarimPlani(sheets, harita);
    if (plan.degisecek.length === 0 && plan.karsiliksiz === 0) {
      return { dil: 'en', cevrilen: 0, indirgendi: false };
    }
    const kanit = await this.kota.odenmisIcerikKaniti(k, quoteId, 'en', icerik);
    if (kanit.odenmis && plan.karsiliksiz === 0) {
      return { dil: 'en', cevrilen: planiUygula(plan), indirgendi: false };
    }
    if (dilKaynagi === 'KAYIT') {
      kaynakMetinleriniGeriYaz(sheets);
      return { dil: 'tr', cevrilen: 0, uyari: KAYIT_INDIRGEME_UYARISI, indirgendi: true };
    }
    throw ceviriKapisiReddi(kanit.odenmis === false ? kanit.neden : 'CEVIRI_EKSIK');
  }

  /**
   * YÖNETİCİ DÜZELTMESİ — ORTAK katman (Faz 6.9 · K-T11). AI'nin üzerine yazar ve
   * bir daha sorulmaz; HER firmanın okumasını etkiler. Bu yüzden: aynı güvenlik
   * süzgeci (400), kaynak başına kilit, önceki değer ve `YoneticiOlayi`
   * (`ceviri.ortak.duzeltildi`) AYNI transaction'da — denetim satırı yazılamazsa
   * düzeltme de uygulanmaz (admin.service denetim notu: hata yutulmaz).
   * Kullanıcının yazma yolu firma katmanıdır (`CeviriDuzeltmeServisi`).
   */
  async duzelt(
    yonetici: { id?: string; email?: string } | null | undefined,
    sourceText: string,
    translatedText: string,
    hedefDil = 'en',
  ): Promise<void> {
    const kaynak = ceviriAnahtari(sourceText);
    const ceviri = String(translatedText ?? '').trim();
    if (!kaynak || !ceviri) throw new BadRequestException('Kaynak ve ceviri bos olamaz.');
    if (!ceviriGuvenliMi(kaynak, ceviri)) throw duzeltmeReddi('CEVIRI_GUVENSIZ');
    const yoneticiId = yonetici?.id;
    const yoneticiEpsta = yonetici?.email;
    if (!yoneticiId || !yoneticiEpsta) throw new ForbiddenException('Yonetici kimligi cozulemedi; duzeltme denetim kaydi olmadan yazilmaz.');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ceviri-ortak:${hedefDil}:${kaynakOzeti(kaynak)}`}))::text AS kilit`;
      const onceki = await tx.translation.findUnique({
        where: { sourceText_targetLang: { sourceText: kaynak, targetLang: hedefDil } },
        select: { translatedText: true },
      });
      await tx.translation.upsert({
        where: { sourceText_targetLang: { sourceText: kaynak, targetLang: hedefDil } },
        create: { sourceText: kaynak, targetLang: hedefDil, translatedText: ceviri, kaynak: 'manual' },
        update: { translatedText: ceviri, kaynak: 'manual' },
      });
      await tx.yoneticiOlayi.create({
        data: {
          yoneticiId,
          yoneticiEpsta,
          hedefKullaniciId: null,
          hedefEposta: null,
          tip: 'ceviri.ortak.duzeltildi',
          oncekiDeger: onceki?.translatedText ?? null,
          yeniDeger: ceviri,
          veri: { kaynak, hedefDil },
        },
      });
    });
  }
}
