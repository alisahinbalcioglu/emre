import type { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../altyapi/db/prisma.service';
import type { AbonelikServisi } from '../abonelik/abonelik.servisi';
import type { EpostaServisi } from '../eposta/eposta.servisi';
import { tarihYaz, tutarYaz } from '../dunning/dunning.metinleri';
import { kapatmaCumlesi, kartAboneligiKapaliMi, type KartKapatmaSonucu } from '../abonelik/kart-kapatma';
import { kotaDonemi } from '../abonelik/ceviri-kotasi';
import { yonetimeYaz } from '../eposta/yonetim-bildirimi';
import { iyzicoTarihi } from '../iyzico/iyzico-tarihi';
import { odenmisSiparisMi } from '../iyzico/tahsilat-kaniti';
import type { IyzicoAbonelikDetayi } from '../iyzico/iyzico.client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KART ABONELİĞİ AÇIKKEN HAVALE — teklif ↔ onay penceresi (25.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Havale günlerce sürer; bu arada firmanın kart aboneliği iyzico'da AÇIKTIR.
 *  Yenileme, deneme sonu ilk çekimi ya da UNPAID yeniden denemesi pencereye
 *  düşerse satır o an KART olduğu için webhook onu OLAĞAN yenileme sayar —
 *  kart sessizce bir dönem daha çekiliyor, kimseye söylenmiyordu (ölçüldü;
 *  çift tahsilat dalı yalnız HAVALE satırına bakar).
 *  KARAR (Emre, "uyar + onayda bildir"): teklif REDDEDİLMEZ —
 *   · teklif: `kartUyarisiOku` → yanıtta `kartUyarisi` (iyzico canlı okunur);
 *   · onay: `teklifSonrasiKartCekimleri` → tekliften sonraki kart çekimleri
 *     yöneticiye e-posta + olay + yanıtta `kartCekimleri`.
 *  Onaydan SONRA işlenen kart çekimi webhook'u zaten çift tahsilat dalına
 *  düşer (`AbonelikServisi.havaleSatirindaKartTahsilati`) — bu dosya yalnız
 *  pencereyi kapsar. Kapısı `backend/test/havale-teklif-paketi-test.ts`, C
 *  bloğu. Havale akışının kendisi `havale.servisi.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Teklif anındaki canlı okumanın süre sınırı. Uyarı BİLGİDİR: iyzico yavaşken
 * yönetici teklifi dakikalarca beklememeli (tek okuma 20 sn'ye, UPGRADED
 * zinciri birkaç çağrıya çıkabilir — inceleme). Aşılırsa uyarı yerel kayıtla.
 */
export const KART_OKUMA_SURESI_MS = 5_000;

/** Onay bildiriminin olay tipi; önceki bildirimler de buradan okunur. */
const BILDIRIM_OLAYI = 'havale.onay.kart.cekimi';

/**
 * Teklif anında kart aboneliği iyzico'da AÇIK. Teklif REDDEDİLMEZ: kartı düşen
 * (UNPAID) müşteri havaleye tam da bu yoldan gelir.
 */
export interface HavaleKartUyarisi {
  /** iyzico'daki durum (canlı okuma; okunamazsa yerel kayıt). */
  iyzicoDurum: string | null;
  /** `false` = iyzico okunamadı, yerel kayda göre uyarılıyor. */
  dogrulandi: boolean;
  /**
   * Sonraki kart çekimi (ISO). `null`: UNPAID'de, çekim zamanı gelmişse ya da
   * tarih bilinmiyorsa — anlamı `sonrakiCekimKaynagi` söyler ('bilinmiyor').
   */
  sonrakiCekim: string | null;
  /**
   * Tarihin KAYNAĞI: `iyzico` (kendi siparişi / denemesi), `yerel` (tahmin —
   * kesin değil; iyzico okunamadı YA DA okundu ama tarih vermedi, inceleme D1),
   * `bilinmiyor` (yerel tahmin de yapılamadı: erişim sonu kart döneminden uzak,
   * ör. miras satır). UNPAID'de `null` (tarih kavramı yok).
   */
  sonrakiCekimKaynagi: 'iyzico' | 'yerel' | 'bilinmiyor' | null;
  /** O çekimin tutarı ("1299.00") — planlı düşürme varsa planlı paketin fiyatı. */
  tutar: string | null;
  paraBirimi: string | null;
  mesaj: string;
}

/** Onayda bildirilen, tekliften sonraki kart çekimi (API yanıtındaki biçim). */
export interface HavaleKartCekimi {
  /** `null` = olayda sipariş kodu yok (bugün yazan yol yok) — çekim DÜŞÜRÜLMEZ. */
  siparisKodu: string | null;
  /** Olayın yazıldığı an (ISO). */
  zaman: string;
}

/** Teklifin okuduğu satır alanları (`teklifOlustur` → `bugunku`). */
export interface KartUyarisiAboneligi {
  durum: string;
  erisimSonu: Date;
  denemeSonu: Date | null;
  iyzicoAbonelikKodu: string | null;
  iyzicoKokKodu: string | null;
  iyzicoMusteriKodu: string | null;
  iyzicoDurum: string | null;
  iptalTalebi: Date | null;
  planliPaketSurumuId: string | null;
  paketSurumu: { tutar: Prisma.Decimal; paraBirimi: string; periyot: string; periyotAdedi: number };
}

/** Servisin verdiği bağımlılıklar (Nest dışı: saf işlevler + bu bağlam). */
export interface KartPenceresiBaglami {
  prisma: PrismaService;
  abonelik: Pick<AbonelikServisi, 'canliUcuBul' | 'olayYaz'>;
  eposta: EpostaServisi;
  logger: Logger;
}

// ── Sonraki çekim ───────────────────────────────────────────────────────────

/**
 * SONRAKİ KART ÇEKİMİ — iyzico'nun KENDİ kaydından. SAF.
 * Yerel `erisimSonu` kart dönemi DEĞİLDİR: miras firma kartla ödeyince satın
 * alma 365 günü korur, webhook erişimi yalnız ileri yazar — tarih oradan
 * okununca uyarı "sonraki çekim 11 ay sonra" diyordu, kart 10 gün sonra
 * çekildi (inceleme Y1, ölçüldü).
 * ÖLÇÜLEN anlam (20.08 tutanağı, `docs/adim0-tutanak/adim0-ek-cikti.json`):
 * ödenmiş dönem ödenmiş siparişin [startPeriod, endPeriod] aralığıdır; iyzico
 * sonraki dönemin siparişini ÖNCEDEN açar ve onun `startPeriod`u önceki
 * `endPeriod`dur. ⚠ Denemeli abonelik sandbox'ta ÖLÇÜLMEDİ: denemede dayanak
 * siparişler değil `trialEndDate`.
 * SIRA: süren deneme (`trialEndDate`) → son ödenmiş dönemin sonu → bekleyen
 * (WAITING) siparişin başı → geçmiş deneme sonu. Deneme ÖNCE: deneme
 * sürerken sonraki çekim deneme sonudur; iyzico denemede kartı doğrular (1 TL
 * çekip iade eder) ve bunun sipariş olarak yazılıp yazılmadığı ölçülmedi —
 * ödenmiş sayılıp "her an" dedirtmesin (inceleme D3). Tarih geçmişse `null`
 * (çekim her an); hiçbiri çözülemezse `undefined` — çağıran yerel kayda düşer.
 */
export function sonrakiKartCekimi(detay: IyzicoAbonelikDetayi, simdi: Date): Date | null | undefined {
  const siparisler = Array.isArray(detay.orders) ? detay.orders : [];
  const anlar = (liste: typeof siparisler, alan: 'startPeriod' | 'endPeriod') =>
    liste
      .map((s) => iyzicoTarihi(s[alan]))
      .filter((t): t is Date => t !== null)
      .map((t) => t.getTime());
  const gelecekse = (ms: number) => (ms > simdi.getTime() ? new Date(ms) : null);

  const deneme = iyzicoTarihi(detay.trialEndDate);
  if (deneme && deneme.getTime() > simdi.getTime()) return deneme;
  const odenmis = anlar(siparisler.filter(odenmisSiparisMi), 'endPeriod');
  if (odenmis.length > 0) return gelecekse(Math.max(...odenmis));
  const bekleyen = anlar(
    siparisler.filter((s) => s.orderStatus === 'WAITING'),
    'startPeriod',
  );
  if (bekleyen.length > 0) return gelecekse(Math.min(...bekleyen));
  return deneme ? null : undefined;
}

/** Yerel tahminin kart dönemine payı: satın alma köprüsü (+2 gün) ve ay uzunluk farkları. */
const YEREL_TAHMIN_PAYI_MS = 7 * 86_400_000;

/**
 * iyzico tarih vermediğinde YEREL tahmin — kesin değil, metin bunu söyler.
 * SAF. Deneme TARİHE göre okunur (`beklenenGecisTarihi` ile aynı: süren
 * deneme, satır hangi durumda olursa olsun ilk çekimdir — inceleme D2).
 * Deneme bitmiş ama satır hâlâ DENEME ise ilk çekim işleniyor → `null`
 * (eskiden `erisimSonu`nun 2 günlük tamponu "sonraki çekim" diye
 * gösteriliyordu, inceleme Y1). Erişim sonu geçmişse `null` (her an).
 * Kart HER DÖNEM çekilir: erişim sonu şimdiden bir kart döneminden (+7 gün
 * pay) uzaksa kart dönemi OLAMAZ — miras satır 365 günü korur; "11 ay sonra
 * (kesin değil)" demek sistematik yanlıştı (inceleme tekrarı) → `undefined`
 * = tahmin yapılamaz, metin "bilinmiyor" der. Aksi hâlde erişim sonu.
 */
export function yerelSonrakiCekim(
  ab: {
    durum: string;
    erisimSonu: Date;
    denemeSonu: Date | null;
    paketSurumu: { periyot: string; periyotAdedi: number };
  },
  simdi: Date,
): Date | null | undefined {
  if (ab.denemeSonu && ab.denemeSonu.getTime() > simdi.getTime()) return ab.denemeSonu;
  if (ab.durum === 'DENEME' && ab.denemeSonu) return null;
  if (ab.erisimSonu.getTime() <= simdi.getTime()) return null;
  const birDonemSonra = kotaDonemi(simdi, ab.paketSurumu.periyot, ab.paketSurumu.periyotAdedi, simdi).bitis;
  return ab.erisimSonu.getTime() > birDonemSonra.getTime() + YEREL_TAHMIN_PAYI_MS ? undefined : ab.erisimSonu;
}

/** Yöneticiye, teklif ANINDA — düz metin (havale için yönetici ekranı yok). */
export function kartUyarisiMetni(k: Omit<HavaleKartUyarisi, 'mesaj'>): string {
  const dogrulama = k.dogrulandi
    ? ''
    : `⚠ Kart aboneliğinin iyzico'daki durumu doğrulanamadı (yerel kayıt: ${k.iyzicoDurum ?? 'bilinmiyor'}). `;
  if (k.iyzicoDurum === 'UNPAID') {
    return (
      dogrulama +
      "Firmanın kart aboneliği iyzico'da ödeme bekliyor (UNPAID): kart güncellenirse ya da yeniden deneme " +
      'geçerse onaydan ÖNCE karttan çekim yapılabilir. Havale onayı kart aboneliğini kapatır; öncesinde çekim ' +
      'olursa onayda size bildirilir.'
    );
  }
  const tutar = k.tutar ? ` (${tutarYaz(Number(k.tutar), k.paraBirimi ?? undefined)})` : '';
  // Ek, doğrulamaya değil tarihin KAYNAĞINA bağlı: iyzico okunup tarih
  // vermediyse de tarih yerel tahmindir (inceleme D1).
  const kesinDegil = k.sonrakiCekimKaynagi === 'yerel' ? ' (yerel kayda göre, kesin değil)' : '';
  const cekim =
    k.sonrakiCekimKaynagi === 'bilinmiyor'
      ? "Sonraki kart çekiminin tarihi bilinmiyor (iyzico'dan tarih alınamadı; yerel erişim sonu kart döneminden " +
        `uzak): çekim bir kart dönemi içinde her an olabilir${tutar}.`
      : k.sonrakiCekim
        ? `Sonraki kart çekimi ${tarihYaz(new Date(k.sonrakiCekim))}${tutar}${kesinDegil}.`
        : `Çekim zamanı geldi; karttan her an çekim yapılabilir${tutar}${kesinDegil}.`;
  return (
    dogrulama +
    `Firmanın kart aboneliği iyzico'da açık (${k.iyzicoDurum ?? 'bilinmiyor'}). ${cekim} Havale onayı kart ` +
    'aboneliğini kapatır; onay bundan önce gelmezse karttan bir dönem daha çekilir (havale süresi erişimin ' +
    'bitişine eklenir). Çekimden önce onaylayın ya da müşteri kart aboneliğini iptal etsin (Hesabım → Abonelik ' +
    'sekmesi → "Aboneliği iptal et"; erişimi dönem sonuna kadar sürer).'
  );
}

const SURE_DOLDU = Symbol('sure-doldu');

/** İşi `ms` ile sınırlar; iş sürerse `SURE_DOLDU` döner (iş iptal edilmez, sonucu yok sayılır). */
async function sureyleSinirla<T>(is: Promise<T>, ms: number): Promise<T | typeof SURE_DOLDU> {
  let zamanlayici: ReturnType<typeof setTimeout> | undefined;
  const sure = new Promise<typeof SURE_DOLDU>((coz) => {
    zamanlayici = setTimeout(() => coz(SURE_DOLDU), ms);
  });
  try {
    return await Promise.race([is, sure]);
  } finally {
    clearTimeout(zamanlayici);
  }
}

/**
 * KART UYARISI — teklif anında kart aboneliği iyzico'da açık mı.
 * Bilinen kapalıda (kod yok, CANCELED/EXPIRED, iptal talebi) iyzico'ya
 * GİDİLMEZ (`kartAboneligiKapaliMi`, onayın iptaliyle aynı kural). Canlı uç
 * `canliUcuBul` ile okunur (UPGRADED zincirini izler), en çok
 * `KART_OKUMA_SURESI_MS`; canlı kapalıysa uyarı YOK — yerel kayıt bayat
 * olabilir. ⚠ ASLA FIRLATMAZ: okuma düşer ya da gecikirse uyarı yerel kayıtla
 * "doğrulanamadı" der, teklif yine oluşur.
 */
export async function kartUyarisiOku(
  d: Pick<KartPenceresiBaglami, 'prisma' | 'abonelik' | 'logger'>,
  ab: KartUyarisiAboneligi | null,
  simdi: Date,
): Promise<HavaleKartUyarisi | null> {
  if (!ab || kartAboneligiKapaliMi(ab)) return null;
  let canli: IyzicoAbonelikDetayi | null = null;
  try {
    const sonuc = await sureyleSinirla(d.abonelik.canliUcuBul(ab), KART_OKUMA_SURESI_MS);
    if (sonuc === SURE_DOLDU) {
      d.logger.warn(
        `Havale teklifi: kart aboneliği iyzico'da ${KART_OKUMA_SURESI_MS} ms içinde okunamadı ` +
          `(${ab.iyzicoAbonelikKodu}) — uyarı yerel kayıtla`,
      );
    } else {
      canli = sonuc;
    }
  } catch (e) {
    d.logger.warn(
      `Havale teklifi: kart aboneliği iyzico'da okunamadı (${ab.iyzicoAbonelikKodu}): ` +
        `${e instanceof Error ? e.message : String(e)} — uyarı yerel kayıtla`,
    );
  }
  const iyzicoDurum = canli ? (canli.subscriptionStatus ?? null) : ab.iyzicoDurum;
  if (canli && (iyzicoDurum === 'CANCELED' || iyzicoDurum === 'EXPIRED')) return null;

  // UNPAID'de tarih yok: yeniden deneme her an. Tarih önce iyzico'nun kendi
  // siparişlerinden; çözülemezse (ya da okunamadıysa) yerel kayıttan — ve
  // kaynağı yanıtta AÇIKÇA söylenir.
  let sonrakiCekim: Date | null = null;
  let sonrakiCekimKaynagi: HavaleKartUyarisi['sonrakiCekimKaynagi'] = null;
  if (iyzicoDurum !== 'UNPAID') {
    const iyzicodan = canli ? sonrakiKartCekimi(canli, simdi) : undefined;
    if (iyzicodan !== undefined) {
      sonrakiCekim = iyzicodan;
      sonrakiCekimKaynagi = 'iyzico';
    } else {
      const yerel = yerelSonrakiCekim(ab, simdi);
      sonrakiCekim = yerel ?? null;
      sonrakiCekimKaynagi = yerel === undefined ? 'bilinmiyor' : 'yerel';
    }
  }
  // Tutar: planlı düşürme varsa sonraki çekim PLANLI paketin fiyatıdır.
  const surum = ab.planliPaketSurumuId
    ? await d.prisma.paketSurumu
        .findUnique({ where: { id: ab.planliPaketSurumuId }, select: { tutar: true, paraBirimi: true } })
        .catch(() => null)
    : ab.paketSurumu;
  const govde = {
    iyzicoDurum,
    dogrulandi: canli !== null,
    sonrakiCekim: sonrakiCekim?.toISOString() ?? null,
    sonrakiCekimKaynagi,
    tutar: surum ? new Prisma.Decimal(surum.tutar).toFixed(2) : null,
    paraBirimi: surum?.paraBirimi ?? null,
  };
  return { ...govde, mesaj: kartUyarisiMetni(govde) };
}

// ── Onayda bildirim ─────────────────────────────────────────────────────────

/** Olay kaydından okunan çekim: tutar, dönem ve erişime etkisi (webhook 25.09'dan beri yazar). */
interface CekimKaydi extends HavaleKartCekimi {
  tutar: number | null;
  paraBirimi: string | null;
  donemBasi: Date | null;
  donemSonu: Date | null;
  oncekiErisimSonu: Date | null;
  yeniErisimSonu: Date | null;
}

/** `durum.degisti` olayının verisinden çekim kaydı. SAF. */
function cekimKaydi(o: { veri: unknown; olusturuldu: Date }): CekimKaydi {
  const v = (o.veri && typeof o.veri === 'object' ? o.veri : {}) as Record<string, unknown>;
  return {
    siparisKodu: typeof v.siparisKodu === 'string' ? v.siparisKodu : null,
    zaman: o.olusturuldu.toISOString(),
    tutar: typeof v.tutar === 'number' ? v.tutar : null,
    paraBirimi: typeof v.paraBirimi === 'string' ? v.paraBirimi : null,
    donemBasi: iyzicoTarihi(v.startPeriod),
    donemSonu: iyzicoTarihi(v.endPeriod),
    oncekiErisimSonu: iyzicoTarihi(v.oncekiErisimSonu),
    yeniErisimSonu: iyzicoTarihi(v.yeniErisimSonu),
  };
}

/** Önceki onay bildirimlerinde SÖYLENMİŞ sipariş kodları. SAF. */
function bildirilenKodlar(olaylar: Array<{ veri: unknown }>): Set<string> {
  const kodlar = new Set<string>();
  for (const o of olaylar) {
    const liste = (o.veri as { siparisler?: unknown } | null)?.siparisler;
    if (Array.isArray(liste)) liste.filter((k): k is string => typeof k === 'string').forEach((k) => kodlar.add(k));
  }
  return kodlar;
}

/**
 * Aynı sipariş BİR kez (inceleme O1): webhook olayı iki kez işlenebilir —
 * fatura kuyruğu düşünce işleyici `tahsilatBasarili`yi baştan koşar, anlık
 * işleme ile dakikalık tarama aynı olayı eşzamanlı alabilir — ve her geçiş
 * yeni bir olay yazar. İlk kayıt tutulur (erişim etkisi onda). Önceki onayda
 * bildirilmiş kod yeniden söylenmez (aynı aboneliğe birden çok teklif serbest).
 * Kodsuz kayıt tekillenemez; düşürülmez. SAF.
 */
function tekille(liste: readonly CekimKaydi[], bildirilen: ReadonlySet<string>): CekimKaydi[] {
  const gorulen = new Set<string>();
  return liste.filter((c) => {
    if (c.siparisKodu === null) return true;
    if (bildirilen.has(c.siparisKodu) || gorulen.has(c.siparisKodu)) return false;
    gorulen.add(c.siparisKodu);
    return true;
  });
}

/** Çekimin erişime etkisi — olaydaki önceki/yeni erişim sonundan. SAF. */
function erisimEtkisi(c: CekimKaydi): string {
  if (!c.oncekiErisimSonu || !c.yeniErisimSonu) return 'erişime etkisi kayıtlı değil';
  const once = c.oncekiErisimSonu.getTime();
  const sonra = c.yeniErisimSonu.getTime();
  if (sonra > once) return `erişimi ${tarihYaz(c.oncekiErisimSonu)} → ${tarihYaz(c.yeniErisimSonu)} uzattı`;
  if (sonra < once) {
    return `erişimi ${tarihYaz(c.oncekiErisimSonu)} → ${tarihYaz(c.yeniErisimSonu)} kısalttı (köprü düzeltmesi)`;
  }
  return `erişimi DEĞİŞTİRMEDİ (erişim zaten ${tarihYaz(c.oncekiErisimSonu)} tarihine kadar açıktı)`;
}

/** E-postada bir çekim: kod, an, tutar, kart dönemi ve ERİŞİME ETKİSİ. SAF. */
function cekimSatiri(c: CekimKaydi): string {
  const parcalar = [
    `${c.siparisKodu ?? 'sipariş kodu okunamadı'} — ${tarihYaz(new Date(c.zaman))}`,
    ...(c.tutar !== null ? [tutarYaz(c.tutar, c.paraBirimi ?? undefined)] : []),
    ...(c.donemBasi && c.donemSonu ? [`kart dönemi ${tarihYaz(c.donemBasi)} – ${tarihYaz(c.donemSonu)}`] : []),
  ];
  return `${parcalar.join(', ')}; ${erisimEtkisi(c)}`;
}

/**
 * ONAYDA BİLDİR: tekliften SONRA karttan yapılan başarılı çekimler. Kaynak
 * webhook'un başarılı tahsilat geçişi (`durum.degisti`, aktör webhook, yeni
 * durum AKTIF — mutabakatın kayıp tahsilat oynatması da bu yoldan geçer); ret
 * geçişi (ODEME_BEKLIYOR) sayılmaz. iyzico'ya gidilmez. Varsa olay + yönetici
 * e-postası.
 * TEK ÖLÇÜT AKTÖRDÜR: bu geçişi bugün yalnız `tahsilatBasarili` yazar (hep
 * sipariş kodlu); onayın kendi AKTIF geçişi (aktör onaylayan) ve mutabakatın
 * durum geçişi (aktör mutabakat) sayılmaz. Sipariş kodu tekilleme ve gösterim
 * içindir: kodsuz bir geçiş gelirse çekim DÜŞÜRÜLMEZ, "sipariş kodu
 * okunamadı" yazılır (ilk sürümde ikinci bir süzgeçti — birincinin yedeğiydi,
 * mutasyonla ölçülemiyordu).
 * DÖNÜŞ: çekim listesi (yoksa `[]`); olay kaydı OKUNAMAZSA `null` — "çekim
 * yok" ile karışmasın. ⚠ ASLA FIRLATMAZ: onay ve kart kapatma zaten tamam.
 */
export async function teklifSonrasiKartCekimleri(
  d: KartPenceresiBaglami,
  h: { id: string; abonelikId: string; teklifNo: string | null; olusturuldu: Date; firmaId: string },
  erisimSonu: Date,
  aktor: string,
  kapatma: KartKapatmaSonucu | null,
): Promise<HavaleKartCekimi[] | null> {
  let cekimler: CekimKaydi[];
  try {
    const [olaylar, oncekiBildirimler] = await Promise.all([
      d.prisma.abonelikOlayi.findMany({
        where: {
          abonelikId: h.abonelikId,
          tip: 'durum.degisti',
          aktor: 'webhook',
          yeniDurum: 'AKTIF',
          olusturuldu: { gt: h.olusturuldu },
        },
        select: { veri: true, olusturuldu: true },
        orderBy: { olusturuldu: 'asc' },
      }),
      d.prisma.abonelikOlayi.findMany({
        where: { abonelikId: h.abonelikId, tip: BILDIRIM_OLAYI },
        select: { veri: true },
      }),
    ]);
    cekimler = tekille(olaylar.map(cekimKaydi), bildirilenKodlar(oncekiBildirimler));
  } catch (e) {
    d.logger.error(
      `Havale onayı: tekliften sonraki kart çekimleri OKUNAMADI (abonelik=${h.abonelikId}): ` +
        `${e instanceof Error ? e.message : String(e)} — yanıtta kartCekimleri=null`,
    );
    return null;
  }
  if (cekimler.length === 0) return [];

  const sonuc = cekimler.map(({ siparisKodu, zaman }) => ({ siparisKodu, zaman }));
  const kodlar = sonuc.map((c) => c.siparisKodu);
  try {
    const belge = h.teklifNo ?? h.id;
    // Olay düşerse e-posta YİNE gider (ayrı yakalanır); sipariş listesi günlükte.
    await d.abonelik
      .olayYaz(h.abonelikId, BILDIRIM_OLAYI, {
        aciklama: `Havale onayı — teklif ${belge} verildikten sonra karttan ${cekimler.length} çekim yapılmış`,
        veri: { havaleId: h.id, teklifNo: h.teklifNo, siparisler: kodlar },
        aktor,
      })
      .catch((e) =>
        d.logger.error(
          `Havale onayı: kart çekimi olayı yazılamadı (abonelik=${h.abonelikId}, siparişler=${kodlar.join(',')}): ` +
            `${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    const firma = await d.prisma.firma
      .findUnique({ where: { id: h.firmaId }, select: { ad: true } })
      .catch(() => null);
    const ad = firma?.ad ?? h.firmaId;
    const uzatan = cekimler.some(
      (c) => !!c.oncekiErisimSonu && !!c.yeniErisimSonu && c.yeniErisimSonu > c.oncekiErisimSonu,
    );
    await yonetimeYaz(
      { prisma: d.prisma, eposta: d.eposta, logger: d.logger },
      {
        konu: `[MetaPriceX] Havale onayı — tekliften sonra karttan çekim — ${ad}`,
        baslik: 'Havale onaylandı; teklif verildikten sonra karttan da çekim yapılmış',
        paragraflar: [
          `Firma: ${ad}`,
          `Teklif: ${belge} (${tarihYaz(h.olusturuldu)})`,
          'Tekliften sonra karttan yapılan çekim(ler):',
          ...cekimler.map((c) => `• ${cekimSatiri(c)}`),
          `Havale onayından sonra erişim ${tarihYaz(erisimSonu)} tarihine kadar (havale süresi erişim ` +
            'bitişine eklendi).',
          'Müşteri kartla devam etmek istemediyse çekimi iyzico panelinden iade edin.' +
            (uzatan
              ? ' ⚠ İade erişimi kendiliğinden KISALTMAZ: çekimin uzattığı dönem iade edilirse ücretsiz kalır.'
              : ''),
          kapatma ? kapatmaCumlesi(kapatma) : 'Kart aboneliğinin kapatma sonucu okunamadı; iyzico panelinden kontrol edin.',
        ],
      },
    );
  } catch (e) {
    d.logger.error(
      `Havale onayı: kart çekimi bildirilemedi (abonelik=${h.abonelikId}, siparişler=${kodlar.join(',')}): ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return sonuc;
}
