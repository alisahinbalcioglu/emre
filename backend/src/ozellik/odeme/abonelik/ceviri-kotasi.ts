import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ÇEVİRİ KOTASI — paket → aylık satır / dosya tavanı (Faz 6, 13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  TEK KAYNAK. Fiyat sayfası (`GET /fiyatlar`), abonelik sayfası
 *  (`GET /abonelik/paketler`) ve kota uygulaması (Faz 6.2) bu tabloyu okur.
 *  Rakam başka HİÇBİR yere yazılmaz: fiyat sayfasına sabit yazılan bir kota,
 *  tablo değişince sessizce yalan söyler.
 *
 *  ── NEDEN SEVİYE × KAPSAM, NEDEN YALNIZ SEVİYE DEĞİL ──
 *  `pro-mek`, `pro-elk` ve `pro-mep` üçü de `seviye = pro`; ayrıştıkları yer
 *  `kapsam`. Pro MEP, Pro'nun iki katı kota alır (karar 13.09). Kotayı yalnız
 *  `PackageLevel`'dan çözen bir uygulama Pro MEP müşterisine SESSİZCE yarım
 *  kota verirdi — iki kat ödeyen müşteriye, şikâyet olarak duyulacak şekilde.
 *
 *  ── TABLO (karar 13.09, Emre) ──
 *                 tek disiplin          MEP (iki disiplin)
 *     core        3.000 satır / 30      6.000 satır / 60    ← yalnız miras-core
 *     pro         4.500 satır / 60      9.000 satır / 120   ← pro-mep, miras-pro
 *
 *  Veritabanında 13.09'da ölçülen 7 paketin 7'si bir hücreye düşer:
 *  basic-mek, basic-elk (core·tek) · pro-mek, pro-elk (pro·tek) ·
 *  pro-mep (pro·mep) · miras-core (core·mep) · miras-pro (pro·mep).
 *  Miras hücreleri de AÇIKÇA karar verildi ("kuralı aynen uygula"): miras-pro
 *  pro-mep ile aynı yetenekleri veriyor, aynı kotayı alır.
 *
 *  ── EŞLENMEMİŞ BİRLEŞİM ──
 *  Tabloda olmayan seviye ya da kapsam (ör. ileride `suite`) EN DÜŞÜK kotayı
 *  alır, SINIRSIZI DEĞİL. `eslendi: false` döner ki çağıran bunu loglayabilsin:
 *  yeni bir paket açıldığında tabloya eklenmeyi unutmak sessiz kalmamalı.
 */

export interface CeviriKotasi {
  /** Abonelik dönemi başına çevrilebilecek toplam satır. */
  readonly satir: number;
  /** Abonelik dönemi başına çevrilebilecek dosya (çeviri işi) sayısı. */
  readonly dosya: number;
}

export interface CozulenKota extends CeviriKotasi {
  /** false → paket tabloda yok, en düşük kotaya düşürüldü. */
  readonly eslendi: boolean;
}

type Hucreler = Readonly<Record<string, CeviriKotasi>>;

const KOTA_TABLOSU: Readonly<Record<string, Hucreler>> = Object.freeze({
  core: Object.freeze({
    mechanical: Object.freeze({ satir: 3000, dosya: 30 }),
    electrical: Object.freeze({ satir: 3000, dosya: 30 }),
    mep: Object.freeze({ satir: 6000, dosya: 60 }),
  }),
  pro: Object.freeze({
    mechanical: Object.freeze({ satir: 4500, dosya: 60 }),
    electrical: Object.freeze({ satir: 4500, dosya: 60 }),
    mep: Object.freeze({ satir: 9000, dosya: 120 }),
  }),
});

/**
 * Eşlenmemiş paketin düştüğü kota. Tablonun en küçük hücresidir; bunu
 * `ceviri-kotasi-test` ölçer (tablo değişip bu sabit geride kalırsa kırmızı).
 */
export const EN_DUSUK_KOTA: CeviriKotasi = Object.freeze({ satir: 3000, dosya: 30 });

function kendiAlani<T>(nesne: Readonly<Record<string, T>>, anahtar: string): T | undefined {
  // `in`/köşeli parantez tek başına YETMEZ: "constructor", "toString" gibi
  // anahtarlar prototipten bir değer döndürür ve eşlenmiş sanılırdı.
  return Object.prototype.hasOwnProperty.call(nesne, anahtar) ? nesne[anahtar] : undefined;
}

export function ceviriKotasiCoz(paket: { seviye: string; kapsam: string }): CozulenKota {
  const satirlar = kendiAlani(KOTA_TABLOSU, String(paket.seviye));
  const hucre = satirlar ? kendiAlani(satirlar, String(paket.kapsam)) : undefined;
  if (hucre) return { satir: hucre.satir, dosya: hucre.dosya, eslendi: true };
  return { satir: EN_DUSUK_KOTA.satir, dosya: EN_DUSUK_KOTA.dosya, eslendi: false };
}

/** Test ve denetim için: tablonun bütün hücreleri (salt okunur kopya). */
export function kotaHucreleri(): Array<{ seviye: string; kapsam: string } & CeviriKotasi> {
  return Object.entries(KOTA_TABLOSU).flatMap(([seviye, satirlar]) =>
    Object.entries(satirlar).map(([kapsam, k]) => ({ seviye, kapsam, satir: k.satir, dosya: k.dosya })),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  KOTA KARARI — saf (Faz 6.2, 14.09.2026)
// ═══════════════════════════════════════════════════════════════════════════

/** Neden reddedildi — mesaj HANGİ tavanın dolduğunu söylemek zorunda. */
export type KotaRedSebebi = 'DOSYA_TAVANDAN_BUYUK' | 'DOSYA_TAVANI' | 'SATIR_TAVANI';

export interface KotaKarari {
  readonly izin: boolean;
  readonly sebep: KotaRedSebebi | null;
  readonly gerekenSatir: number;
  /** Bu istekten ÖNCE kalan. */
  readonly kalanSatir: number;
  readonly kalanDosya: number;
}

/**
 * Karar sırası ölçülen bir sorunun cevabıdır:
 *  1. Dosya dönemlik SATIR TAVANINDAN büyükse → hiçbir dönem çevrilemez. İlk
 *     bu sorulur: "kotanız yenilenince deneyin" demek kullanıcıyı hiç
 *     gelmeyecek bir aya bekletir.
 *  2. Dosya hakkı bittiyse → hangi boyda olursa olsun bu dönem çevrilemez.
 *  3. Kalan satır yetmiyorsa → kısmen ÇEVRİLMEZ, önceden reddedilir.
 *
 * ⚠ `gerekenSatir` 16.09'dan (Emre) beri TEKLİFİN SATIRI DEĞİL, API'ye
 * GİDECEK satırdır: ortak önbellekte ve firma sözlüğünde karşılığı olan satır
 * para harcatmaz, sayılmaz. Yani 5.000 satırlık bir teklifin 300 satırı
 * yeniyse tavan 300 üzerinden sorulur ve "bu teklif bu pakette hiç
 * çevrilemez" kararı da 300 üzerinden verilir.
 *
 * API'ye gidecek satırı OLMAYAN istek (0 satır) kota harcamaz ve reddedilmez:
 * ne yeni bir metin vardır ne de AI çağrısı yapılır — dosya hakkı da düşmez
 * (`sonucHesabi` 0 düşürür, sayım `dusulenSatir > 0` olan kaydı dosya sayar).
 *
 * Her çeviri yeni dosyadır (REVİZE K-T7, 15.09): yarım çevirinin "devamı"
 * kalktı, dosya tavanı her istekte sorulur.
 */
export function kotaKarari(p: {
  kota: CeviriKotasi;
  kullanilanSatir: number;
  kullanilanDosya: number;
  gerekenSatir: number;
}): KotaKarari {
  const kalanSatir = Math.max(0, p.kota.satir - p.kullanilanSatir);
  const kalanDosya = Math.max(0, p.kota.dosya - p.kullanilanDosya);
  const temel = { gerekenSatir: p.gerekenSatir, kalanSatir, kalanDosya };
  if (p.gerekenSatir <= 0) return { izin: true, sebep: null, ...temel };
  if (p.gerekenSatir > p.kota.satir) return { izin: false, sebep: 'DOSYA_TAVANDAN_BUYUK', ...temel };
  if (kalanDosya < 1) return { izin: false, sebep: 'DOSYA_TAVANI', ...temel };
  if (p.gerekenSatir > kalanSatir) return { izin: false, sebep: 'SATIR_TAVANI', ...temel };
  return { izin: true, sebep: null, ...temel };
}

/**
 * Yeni kayıtta üretilen sonuç. Prisma enum'unda `KISMI` durur: 15.09'dan önce
 * yazılmış kayıtlar için (dönem sayımı onları hâlâ sayar), bu kod onu ÜRETMEZ.
 */
export type CeviriSonucDurumu = 'BASARILI' | 'BASARISIZ';

/**
 * Çeviri SONUÇLANINCA kotadan ne düşer.
 *
 * İKİ KURAL BİRLİKTE İŞLER:
 *  · HEPSİ YA DA HİÇBİRİ (REVİZE K-T7, Emre 15.09: "o Excel tam
 *    çevrilemiyorsa çevirmesin") — tek satır bile eksikse BASARISIZ ve
 *    hiçbir şey düşmez (harita da istemciye DÖNMEZ — `CeviriService`).
 *  · PARA HARCANANA HAK DÜŞER (Emre 16.09) — tam çeviride bile kotadan
 *    yalnız API'DEN DÖNEN satırlar düşer. Ortak önbellekten ya da firma
 *    sözlüğünden karşılanan satır Claude'a hiç gitmediği için ücretlenmez.
 *    `apiSatir = 0` ise çeviri BASARILI'dır ama kotadan 0 düşer ve dosya
 *    hakkı da yenmez (sayım `dusulenSatir > 0` olan kaydı dosya sayar).
 *
 * `apiSatir` AYIRMA sayısı değil, GERÇEKLEŞEN sayıdır: ayırma ile çağrı
 * arasında başka bir firma aynı metni çevirip önbelleğe yazmışsa kullanıcı
 * onu ödemez. Toplamı aşamaz (kırpılır): tek bir satır iki kez ücretlenmesin.
 *
 * 14.09'daki KISMI kuralı (yalnız teslim edileni düşürüp haritayı vermek) ve
 * 10 dakikalık "devam" zinciri kalktı. Çevrilecek satırı olmayan istek
 * (toplam 0) BASARILI sayılır ve hiçbir şey düşmez.
 */
export function sonucHesabi(p: {
  toplamSatir: number;
  teslimEdilen: number;
  /** API'den dönen (para harcanan) satır. */
  apiSatir: number;
}): { durum: CeviriSonucDurumu; dusulenSatir: number; toplamTeslim: number } {
  const toplam = Math.max(0, p.toplamSatir);
  if (p.teslimEdilen < toplam) return { durum: 'BASARISIZ', dusulenSatir: 0, toplamTeslim: 0 };
  const dusulenSatir = Math.min(toplam, Math.max(0, p.apiSatir));
  return { durum: 'BASARILI', dusulenSatir, toplamTeslim: toplam };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ÖDENMİŞ İÇERİK — geçiş izni ve İngilizce çıktı kapısı (Faz 6.10/6.11)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kota öncesi İngilizceye çevrilmiş teklifin geçiş izni anahtarı
 * (`SystemSettings.key`). Kanıt fonksiyonu ve geçiş betiği AYNI fonksiyonu
 * kullanır.
 */
export function gecisAnahtari(quoteId: string, hedefDil: string): string {
  return `ceviri.gecis.${hedefDil}.${quoteId}`;
}

export type CiktiKapisiNedeni = 'CEVIRI_YOK' | 'ICERIK_DEGISTI' | 'CEVIRI_SURUYOR' | 'CEVIRI_EKSIK';

/**
 * İngilizce dosya indirilemediğinde kullanıcıya giden metinler — TEK sabit.
 * Testler buradan okur. "Tam değilse çevirmesin" ilkesi dosyaya da uygulanır
 * (Emre 15.09): başlıkları İngilizce, adları Türkçe karışık dosya ÜRETİLMEZ.
 */
export const CIKTI_KAPISI_METNI: Readonly<Record<CiktiKapisiNedeni, { readonly mesaj: string; readonly aciklama: string }>> = Object.freeze({
  CEVIRI_YOK: Object.freeze({
    mesaj: 'Bu teklifin güncel hâli İngilizceye çevrilmemiş',
    aciklama: 'Önce teklif ekranında İngilizceye Çevir düğmesine basın. Türkçe dosya kotadan düşmeden iner.',
  }),
  ICERIK_DEGISTI: Object.freeze({
    mesaj: 'Çeviriden sonra teklif değişti',
    aciklama: 'Malzeme/iş adları ya da satırlar çeviriden sonra değişti. İngilizce dosya için teklifi yeniden çevirin; kotadan yalnız daha önce çevrilmemiş satırlar düşer.',
  }),
  CEVIRI_EKSIK: Object.freeze({
    mesaj: 'Bu teklifin çevirisi eksik',
    aciklama: 'İngilizce dosya için teklif ekranında İngilizceye Çevir düğmesine basın; eksik kalan satır daha önce çevrilmişse kotadan düşmez.',
  }),
  CEVIRI_SURUYOR: Object.freeze({
    mesaj: 'Bu teklifin çevirisi sürüyor',
    aciklama: 'Çeviri bitince İngilizce dosyayı indirebilirsiniz; birkaç dakika sonra tekrar deneyin.',
  }),
});

/**
 * İngilizce çıktı reddi. 403 `CEVIRI_GEREKLI` (çeviri yok / içerik değişti),
 * 409 `CEVIRI_SURUYOR`, 409 `CEVIRI_EKSIK` (ödenmiş ama tamamlanmamış).
 * ⚠ 401 DEĞİL: ön yüzün 401 yakalayıcısı oturumu kapatır (§3.1).
 * `message` eski istemciler ve indirme bildirimi için ZORUNLU.
 */
export function ceviriKapisiReddi(neden: CiktiKapisiNedeni): ForbiddenException | ConflictException {
  const m = CIKTI_KAPISI_METNI[neden];
  const govde = { message: `${m.mesaj}. ${m.aciklama}`, mesaj: m.mesaj, aciklama: m.aciklama, neden };
  if (neden === 'CEVIRI_SURUYOR') return new ConflictException({ ...govde, kod: 'CEVIRI_SURUYOR' });
  if (neden === 'CEVIRI_EKSIK') return new ConflictException({ ...govde, kod: 'CEVIRI_EKSIK' });
  return new ForbiddenException({ ...govde, kod: 'CEVIRI_GEREKLI' });
}

/**
 * Çeviri TAMAMLANAMADI (REVİZE K-T7): 422. Kotadan hiçbir şey düşmedi, teklif
 * Türkçe kaldı, harita istemciye verilmez; çevrilemeyen metinler listelenir.
 * `satirSayisi` çevrilemeyen metinlerin tuttuğu SATIR; liste metin listesidir
 * (ilk 50). ⚠ 401 değil (oturum düşürülmez), 409 `CEVIRI_SURUYOR`dan ayrı.
 */
export function ceviriTamamlanamadiHatasi(
  eksikAnahtarlar: readonly string[],
  satirSayisi: number,
  sebep?: string,
): UnprocessableEntityException {
  const mesaj = 'Çeviri tamamlanamadı, tekrar deneyin';
  const aciklama =
    `${binlik(satirSayisi)} satır çevrilemedi; kotadan hiçbir şey düşmedi ve teklif Türkçe kaldı. ` +
    'Tekrar denediğinizde çevrilmiş satırlar beklemeden gelir.' +
    (sebep ? ` Sebep: ${sebep}` : '');
  return new UnprocessableEntityException({
    message: `${mesaj}. ${aciklama}`,
    mesaj,
    aciklama,
    kod: 'CEVIRI_TAMAMLANAMADI',
    cevrilemeyenSayisi: satirSayisi,
    cevrilemeyenMetinSayisi: eksikAnahtarlar.length,
    cevrilemeyenSatirlar: eksikAnahtarlar.slice(0, 50),
  });
}

/** TR binlik ayraç — `toLocaleString` sunucunun ICU verisine bağlıdır, kullanılmaz. */
export function binlik(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Türkiye tarihi, gg.aa.yyyy. Sunucu UTC'de; Türkiye 2016'dan beri sabit
 * UTC+3 (yaz saati yok). Yenilenme 21:30 UTC'deyse kullanıcının takviminde
 * ertesi gündür — UTC tarihi yazmak bir gün erken söylerdi.
 */
export function trTarih(t: Date): string {
  const tr = new Date(t.getTime() + 3 * 60 * 60 * 1000);
  const gg = String(tr.getUTCDate()).padStart(2, '0');
  const aa = String(tr.getUTCMonth() + 1).padStart(2, '0');
  return `${gg}.${aa}.${tr.getUTCFullYear()}`;
}

/**
 * Reddin kullanıcıya söylenecek cümlesi. Genel bir "kota yetersiz" YOKTUR —
 * her sebep kendi rakamlarıyla konuşur.
 *
 * ⚠ 16.09'dan beri rakam TEKLİFİN satırı değil YENİ satırdır (önbellekte
 * karşılığı olmayan). "Bu teklif 5.000 satır gerektiriyor" demek, 4.700
 * satırı zaten hazırken kullanıcıyı gereksiz yere pakete yollardı; mesaj
 * kullanıcının ödeyeceği sayıyı söyler.
 */
export function kotaRedMesaji(k: KotaKarari, kota: CeviriKotasi, yenilenme: Date): string {
  switch (k.sebep) {
    case 'DOSYA_TAVANDAN_BUYUK':
      return (
        `Bu teklifin ${binlik(k.gerekenSatir)} satırı yeni (daha önce çevrilmemiş); paketinizin dönemlik ` +
        `çeviri tavanı ${binlik(kota.satir)} satır. Bu teklif bu pakette hiçbir dönem çevrilemez — çevirmek ` +
        `için daha yüksek kotalı bir pakete geçmeniz gerekir.`
      );
    case 'DOSYA_TAVANI':
      return (
        `Bu dönemki ${binlik(kota.dosya)} dosyalık çeviri hakkınızın tamamını kullandınız. ` +
        `Kotanız ${trTarih(yenilenme)} tarihinde yenilenir.`
      );
    case 'SATIR_TAVANI':
      return (
        `Bu teklifin ${binlik(k.gerekenSatir)} satırı yeni; bu dönem kalan çeviri hakkınız ` +
        `${binlik(k.kalanSatir)} satır. Teklif kısmen çevrilmez. ` +
        `Kotanız ${trTarih(yenilenme)} tarihinde yenilenir.`
      );
    default:
      return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  KOTA DÖNEMİ — abonelik dönemi, TAKVİM AYI DEĞİL (Faz 6.2)
// ═══════════════════════════════════════════════════════════════════════════

export interface KotaDonemi {
  readonly baslangic: Date;
  /** Hariç — bir sonraki dönemin başlangıcı = yenilenme anı. */
  readonly bitis: Date;
}

function aySonGunu(yil: number, ay: number): number {
  return new Date(Date.UTC(yil, ay + 1, 0)).getUTCDate();
}

/** Çapaya k ay ekler; gün taşarsa ayın son gününe kırpılır (31 Oca → 28/29 Şub → 31 Mar). */
function ayEkle(capa: Date, k: number): Date {
  const hedefAy = capa.getUTCMonth() + k;
  const yil = capa.getUTCFullYear() + Math.floor(hedefAy / 12);
  const ay = ((hedefAy % 12) + 12) % 12;
  const gun = Math.min(capa.getUTCDate(), aySonGunu(yil, ay));
  return new Date(
    Date.UTC(yil, ay, gun, capa.getUTCHours(), capa.getUTCMinutes(), capa.getUTCSeconds(), capa.getUTCMilliseconds()),
  );
}

/**
 * `simdi`'yi içeren dönem. Her dönem ÇAPADAN doğrudan hesaplanır (bir önceki
 * dönemden değil): 31 Ocak çapası Şubat'ta 28'ine kırpılır ama Mart'ta yine
 * 31'ine döner — zincirleme hesap kırpılmayı kalıcılaştırırdı.
 *
 * Periyot `PaketSurumu.periyot` × `periyotAdedi`. Tanınmayan periyot aylık
 * sayılır (satıştaki ve miras sürümlerin hepsi MONTHLY·1 — 13.09 ölçüldü).
 */
export function kotaDonemi(capa: Date, periyot: string, periyotAdedi: number, simdi: Date): KotaDonemi {
  const adet = Number.isInteger(periyotAdedi) && periyotAdedi > 0 ? periyotAdedi : 1;

  if (periyot === 'DAILY' || periyot === 'WEEKLY') {
    const adim = (periyot === 'DAILY' ? 1 : 7) * adet * 86_400_000;
    const k = Math.max(0, Math.floor((simdi.getTime() - capa.getTime()) / adim));
    const baslangic = new Date(capa.getTime() + k * adim);
    return { baslangic, bitis: new Date(baslangic.getTime() + adim) };
  }

  const adimAy = (periyot === 'YEARLY' ? 12 : 1) * adet;
  if (simdi.getTime() < capa.getTime()) return { baslangic: capa, bitis: ayEkle(capa, adimAy) };

  const ayFarki =
    (simdi.getUTCFullYear() - capa.getUTCFullYear()) * 12 + (simdi.getUTCMonth() - capa.getUTCMonth());
  let k = Math.floor(ayFarki / adimAy);
  // Ay farkı gün/saat hesaba katmaz: çapanın günü henüz gelmediyse bir geri çekil.
  while (k > 0 && ayEkle(capa, k * adimAy).getTime() > simdi.getTime()) k--;
  while (ayEkle(capa, (k + 1) * adimAy).getTime() <= simdi.getTime()) k++;
  return { baslangic: ayEkle(capa, k * adimAy), bitis: ayEkle(capa, (k + 1) * adimAy) };
}
