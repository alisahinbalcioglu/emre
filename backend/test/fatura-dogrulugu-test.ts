/**
 * FATURA DOĞRULUĞU  (`npm run test:fatura-dogrulugu`) · 28.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. GERÇEK `WebhookIsleyici`, `AbonelikServisi`,
 * `FaturaServisi` (kuyruk + kesim turu), `DunningServisi` ve `MutabakatJob`
 * bellek-Prisma üzerinde koşar; muhasebe adaptörü NES talebini YAKALAR (elle/
 * NES kesimin gerçek girdisi `FaturaKesTalebi`, e-postası GERÇEK
 * `faturaKesimTalebiEpostasi`). Bellek-Prisma ve sahte iyzico
 * `mutabakat-faturasiz-tahsilat-test.ts`ten (depo deseni: her kapı kendi
 * taklidini taşır): `where`i GERÇEKTEN uygular, tekillik (P2002) taşır,
 * bilmediği anahtarda PATLAR; sahte iyzico her çağrıda TAZE kopya verir.
 *
 * ── NEDEN (iyzico canlıya geçmeden; koordinatör işi, Emre isteği) ────────
 *  1. PAKET ADI: fatura kalemi paketi KESİM anında aboneliğin O ANKİ
 *     paketinden okuyordu. Kuyruk ile kesim arasında paket değişirse
 *     (yükseltme, yönetici, planlı geçiş) ya da tahsilat eski halkanın geç
 *     gelen siparişiyse fatura ÖDENMEYEN paketin adını taşırdı.
 *  2. ÖDEME ANI (VUK md. 231/5 — 7 gün): satır ödeme anını taşımıyordu; NES
 *     e-postası son günü min(kuyruk, dönem başı)ndan sayıyordu — yeniden
 *     denemeyle toparlanan tahsilatta gerçek ödemeden günler ÖNCE; süresi
 *     geçmiş tahsilat için "süre geçti" hiç denmiyordu.
 *  3. TUTAR: webhook `paidPrice ?? paket fiyatı` yazıyordu. iyzico
 *     siparişinin ÖLÇÜLEN alanı `price` (20.08 sandbox, 5/5 sipariş: `price` +
 *     `currencyCode`, `paidPrice` YOK) atlanıyor, aboneliğin O ANKİ paketinin
 *     veritabanındaki fiyatı faturaya ve makbuza giriyordu.
 *
 * ── KARAR (Emre 28.09 "kuyruğa alma, uyar") ──────────────────────────────
 *  Tutar siparişten okunamazsa fatura kuyruğa ALINMAZ, makbuz gitmez, tutar
 *  UYDURULMAZ. Uyarı (28.09 kod incelemesiyle güçlendi): hata günlüğü +
 *  yöneticiye NES kanalından SON GÜNLÜ e-posta (sipariş başına BİR kez,
 *  denetim izi `fatura.tutar.okunamadi`); başarı olayı işlenmiş siparişi gece
 *  mutabakatı OYNATMAZ (oynatma tutarı getirmez), her gece "elle fatura" +
 *  özet sayacı (kural 7f). İlk sürüm oynatıyordu: 2. geceden sonra özet
 *  sıfırdı. Webhook'u KAYBOLMUŞ tutarsız sipariş ise BİR KEZ oynatılır —
 *  koşulsuz 7f dunning'deki ödemiş satırı takılı bırakıyordu (2. inceleme).
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   S  saf kurallar: `tahsilEdilenTutar` · `odemeAni` (siparişin ÖDENDİĞİ an;
 *      çift çekimde İLKİ) · `faturaSatiriVerisi` (kopyalanan alanlar,
 *      matrah/KDV kuruşu kuruşuna) · `istanbulGunSonu`
 *   E  NES e-postası "SÜRE GEÇTİ": İstanbul GÜN sınırı (son günün TAMAMI süre
 *      içinde), test ödemesi, havale (kayıtlı numarada talimat KOŞULLU),
 *      tahsilatsız talep
 *   W  webhook uçtan uca:
 *      W1 tutar + para birimi SİPARİŞTEN (price ≠ paket fiyatı; EUR sipariş +
 *         TRY paket): satır, NES talebi + e-postası, makbuz, tahsilat olayı
 *      W2 ödeme anı = BAŞARILI denemenin anı (ret, ertesi gün yeniden deneme)
 *      W3 paket adı TAHSİLAT anında donar (kesimden önce paket değişti)
 *      W4 yükseltme beklerken ESKİ halkanın geç webhook'u → ÖDENEN paket
 *         (`odenenPaketSurumuId`) ve eski halkanın fiyatı; makbuz aynı paket
 *      W5 yeni ucun İLK çekimi → yeni paket (kilit kalkar, işaretçi silinir)
 *      W6 tutar YOK → fatura yok, makbuz yok; hata günlüğü + yöneticiye son
 *         günlü uyarı; olay işlendi, erişim uzadı; gece 1 ve 2: oynatma YOK,
 *         "elle fatura" + özet sayacı 1; W6g aynı sipariş ikinci olayla
 *         (anlık deneme) işlenince uyarı TEK, denetim izi tek kayıt — 28.09:
 *         ikinci olay tahsilat izinde (tutar-okunamadı izi) TEKRAR sayılır;
 *         W6h dunning'deki satırda kısa devre yok, uyarıyı sipariş başına
 *         tek-uyarı kuralı keser ("zaten bildirildi")
 *      W7 dunning'den çıkış (GERÇEK ret yolu → yeniden deneme tuttu):
 *         "ödemeniz alındı" ÇEKİLEN tutarı yazar; tutar okunamazsa tutarsız
 *      W8 ödenen sürüm okunamazsa paket adı NULL + hata; kesim o anki pakete
 *      W9 kalemin "Dönem" metni İSTANBUL günüyle (süreç TZ=UTC)
 *      W10 webhook'u KAYBOLMUŞ tutarsız sipariş, dunning'deki satır (erişim
 *         siparişten ileride): gece 1 BİR KEZ oynatılır (toparlanır, uyarı),
 *         gece 2 "elle fatura" (kural 7f yalnız İŞLENMİŞ olayda)
 *   Havale yolu: `test:havale-teklif-paketi` K4b/K4c · mutabakat oynatması:
 *   `test:mutabakat-faturasiz-tahsilat` V · alandan ÖNCEKİ satır (NULL
 *   yedeği): `test:yonetim-epostalari` E11 · göç: `test:migration-zinciri` Z3f.
 *
 * ESKİ HÂL (28.09, mutasyonla — kurallar TEK TEK eski hâline döndürüldü):
 * tutar `paidPrice ?? paket` → W1a/c/d/e/f, W4a/b/c, W6a/b/c/e/f, W7a/b
 * kırmızı (son hâlde 15);
 * ödeme anı = dönem başı → W2a/b; kesimde o anki paket → W3b, W4c; satırda
 * paket adı yok → S12, W3a/b, W4a/c, W5a; anlık son gün → E1, E2; UTC günü →
 * S15, E1, E2; makbuzda o anki paket → W4b; eşik `>=` → E2; önek/başlık/ilk
 * paragraf → E3/E5. Elle mutasyon 34 mutant: 33 öldü, hepsi assert'le (8
 * dosya; ikiz kapılar `test:mutabakat-faturasiz-tahsilat` V1/V3 ve
 * S16/S18/S20/E3b, `test:yonetim-epostalari` E1b/E3a/E8b,
 * `test:musteri-epostalari` D10, `test:havale-teklif-paketi` K4b/K4c,
 * `test:havale-iyzico` Y1c/Y1d/Y9); 1
 * EŞDEĞER: havale onayında `tahsilatTarihi: donemBasi` — `donemBasi` onay
 * damgasından milisaniyeler sonra alınan `new Date()`. İlk turda 3 mutant
 * YAŞADI, fikstür güçlendirildi: S9 tek sıralıydı (yanlış kural da doğru
 * cevabı veriyordu) → iki sıra; para birimi her dünyada TRY/TRY'ydi →
 * W1f (EUR sipariş, TRY paket); `test:havale-iyzico` siparişe ölçülmemiş
 * `paidPrice` koyuyordu (`price` okunmasa da yeşil) → ölçülen biçim.
 * Tur 2 (kod incelemesi düzeltmeleri, 17 mutant — 12 yeni + değişen koddaki
 * 5 tekrar): 17/17 öldü — ödeme anı "son"/"listedeki ilk" (S9), dunning
 * tutarı paket/boş cümle/null (W7a/W7b), yönetici uyarısı yok (W6c/W6f/W7b),
 * son gün işleme anından (W6b/W6c — W6'da ödeme 30 sa önce: aynı gün
 * olsaydı yaşardı), kural 7f iki yarısı (W6e/W6f + ikiz S21), kayıtlı
 * numarada koşulsuz talimat (E5b), son gün 6 gün (E1-E5, W2b, W6b/c),
 * dönem UTC günü (W9). Tur 3 (2. inceleme: 7f yalnız işlenmiş olayda +
 * uyarı tekilleştirme, 5 mutant): 5/5 öldü — koşulsuz 7f (W10a/b + ikiz
 * S22), işlenmiş sorgusu/geçişi bozuk (W6e/f, W10b), tekilleştirme ya da
 * denetim izi yok (W6g). TOPLAM 51 ayrı mutant: 50 öldü, 1 eşdeğer.
 * 28.09 (webhook güvenliği, tahsilat izi): tekilleştirme mutantını artık W6h
 * öldürür (W6g ikinci olayı iz keser); W6g iz dalını ölçer.
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { MUTABAKAT_KAYNAGI, MutabakatJob } from '../src/ozellik/odeme/abonelik/mutabakat.job';
import { istanbulGunSonu as hatirlatmaGunSonu } from '../src/ozellik/odeme/abonelik/deneme-hatirlatmasi.servisi';
import { TUTAR_OKUNAMADI_OLAYI, WebhookIsleyici } from '../src/ozellik/odeme/webhook/webhook.isleyici';
import { FaturaServisi, faturaSatiriVerisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import type { FaturaMusteriKopyasi, FaturaTalebi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { ANINDA_DENEME_KAYNAGI, DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
import { istanbulGunSonu, tarihYaz } from '../src/ozellik/odeme/dunning/dunning.metinleri';
import { faturaKesimTalebiEpostasi } from '../src/ozellik/odeme/fatura/fatura-kesim-epostasi';
import type { FaturaKesTalebi } from '../src/ozellik/odeme/fatura/muhasebe.adaptor';
import { odemeAni, tahsilEdilenTutar } from '../src/ozellik/odeme/iyzico/tahsilat-kaniti';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

// Kabuk ortamından yalıtılır: süreç konteyner gibi UTC'de (W9 İstanbul
// gününü ancak böyle ayırt eder; yerel makine +03), yönetim adresi
// YONETIM_EPOSTA'dan değil dünyadaki yönetici hesabından (canlıdaki gibi).
process.env.TZ = 'UTC';
delete process.env.YONETIM_EPOSTA;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

// Nest günlüğü gürültüsü kapalı; FD_GUNLUK=1 ile açılır.
if (!process.env.FD_GUNLUK) Logger.overrideLogger(false);

const DK = 60_000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;

/**
 * Günlüğü TOPLAR (`mutabakat-kayip-tahsilat-test.ts` ile aynı gerekçe):
 * webhook işleyicisi, fatura turu ve gece işi hatayı YAKALAYIP yalnız günlüğe
 * yazar; günlük kapalıyken patlayan bir adım "değişmedi" diye boşuna yeşil
 * görünürdü. W6'nın "hata günlüğü" ölçütü de buradan okunur.
 */
async function gunluguTopla(is: () => Promise<unknown>) {
  const kayitlar: string[] = [];
  const uyarilar: string[] = [];
  const hatalar: string[] = [];
  const bos = () => undefined;
  Logger.overrideLogger({
    log: (m: unknown) => { kayitlar.push(String(m)); },
    warn: (m: unknown) => { uyarilar.push(String(m)); },
    error: (m: unknown) => { hatalar.push(String(m)); },
    debug: bos,
    verbose: bos,
    fatal: bos,
  });
  try {
    await is();
  } finally {
    Logger.overrideLogger(process.env.FD_GUNLUK ? new ConsoleLogger() : false);
  }
  return { kayitlar, uyarilar, hatalar };
}

type Gunluk = { kayitlar: string[]; uyarilar: string[]; hatalar: string[] };
const gunlukYaz = (g: Gunluk) => `hatalar=${JSON.stringify(g.hatalar)} uyarilar=${JSON.stringify(g.uyarilar)}`;
/** Gece özet satırı (`geceMutabakati` sonu). */
const ozetSatiri = (g: Gunluk) => g.kayitlar.find((k) => k.startsWith('Mutabakat bitti')) ?? '';
const iso = (t: unknown) => (t instanceof Date ? t.toISOString() : String(t));

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — `mutabakat-faturasiz-tahsilat-test.ts`teki taklit (aynı kurallar)
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  // Kuyruk (`paketAdiniCikar`) ve makbuz ödenen sürümün paket ADINI okur.
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
  // W: fatura kesim turu (`tekFatura`) satırı aboneliğiyle okur.
  fatura: { abonelik: { model: 'abonelik', yerel: 'abonelikId' } },
};

/** Şemadaki `@unique` alanlar (yalnız bu paketin dokunduğu tablolar). */
const TEKIL: Record<string, string[]> = {
  abonelik: ['firmaId', 'iyzicoAbonelikKodu'],
  fatura: ['tahsilatKodu'],
  webhookOlayi: ['tekilAnahtar'],
};

const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    denemeSonu: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null, iyzicoMusteriKodu: null,
    iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART', ilkBasarisizlik: null,
    denemeSayisi: 0, sonDeneme: null, kisitlandi: null, iptalTalebi: null, iptalNedeni: null,
    kopruErisimSonu: null, planliPaketSurumuId: null, paketGecisTarihi: null, odenenPaketSurumuId: null,
    olusturuldu: new Date(), guncellendi: new Date(),
  }),
  abonelikOlayi: () => ({ olusturuldu: new Date(), aktor: 'sistem', oncekiDurum: null, yeniDurum: null }),
  webhookOlayi: () => ({
    kaynak: 'iyzico', imzaBasligi: null, imzaGecerli: false, abonelikKodu: null, siparisKodu: null,
    musteriKodu: null, iyzicoRefKodu: null, olayZamani: null, islendi: false, islenmeZamani: null,
    denemeSayisi: 0, hata: null, alindi: new Date(),
  }),
  fatura: () => ({
    durum: 'BEKLIYOR', kdvOrani: 20, paraBirimi: 'TRY', saglayici: null, saglayiciId: null,
    faturaNo: null, faturaUrl: null, denemeSayisi: 0, sonDeneme: null, hata: null,
    olusturuldu: new Date(),
  }),
};

function kosulUygula(deger: any, kosul: any): boolean {
  if (kosul === null) return deger === null || deger === undefined;
  if (kosul instanceof Date) return deger instanceof Date && deger.getTime() === kosul.getTime();
  if (typeof kosul !== 'object') return deger === kosul;
  const bos = deger === null || deger === undefined;
  for (const [op, v] of Object.entries(kosul)) {
    switch (op) {
      case 'in':
        if (!(v as unknown[]).includes(deger)) return false;
        break;
      case 'not':
        if (v === null ? bos : kosulUygula(deger, v)) return false;
        break;
      case 'lt':
        if (bos || !(deger < (v as any))) return false;
        break;
      case 'lte':
        if (bos || !(deger <= (v as any))) return false;
        break;
      case 'gt':
        if (bos || !(deger > (v as any))) return false;
        break;
      case 'gte':
        if (bos || !(deger >= (v as any))) return false;
        break;
      default:
        throw new Error(`bellek-Prisma: desteklenmeyen operator "${op}"`);
    }
  }
  return true;
}

function whereUygula(satir: Satir, where: any): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(v as any[]).some((w) => whereUygula(satir, w))) return false;
    } else if (k === 'AND') {
      if (!(v as any[]).every((w) => whereUygula(satir, w))) return false;
    } else if (k === 'NOT') {
      if (whereUygula(satir, v)) return false;
    } else if (!kosulUygula(satir[k], v)) {
      return false;
    }
  }
  return true;
}

/** Sorgu argümanında tanımadığı anahtar varsa PATLAR (sessiz yok sayma yok). */
function anahtarDenetle(model: string, islem: string, arg: any, izinli: string[]): void {
  for (const k of Object.keys(arg ?? {})) {
    if (!izinli.includes(k)) throw new Error(`bellek-Prisma: ${model}.${islem} "${k}" desteklenmiyor`);
  }
}

function sirala(satirlar: Satir[], orderBy: any): Satir[] {
  if (!orderBy) return satirlar;
  const kurallar = Array.isArray(orderBy) ? orderBy : [orderBy];
  const kopya = [...satirlar];
  kopya.sort((a, b) => {
    for (const kural of kurallar) {
      const [alan, yon] = Object.entries(kural)[0] as [string, string];
      if (yon !== 'asc' && yon !== 'desc') throw new Error(`bellek-Prisma: orderBy yonu "${yon}"`);
      const x = a[alan] instanceof Date ? a[alan].getTime() : a[alan];
      const y = b[alan] instanceof Date ? b[alan].getTime() : b[alan];
      if (x === y) continue;
      return (x < y ? -1 : 1) * (yon === 'asc' ? 1 : -1);
    }
    return 0;
  });
  return kopya;
}

const VERI_ISLEMLERI = ['increment', 'decrement'];

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);

  // Prisma her okumada TAZE nesne döndürür; taklit de öyle (kopya döner).
  function yansit(model: string, satir: Satir, spec: any): Satir {
    const iliski = (k: string, v: any) => {
      const il = ILISKILER[model]?.[k];
      if (!il) throw new Error(`bellek-Prisma: bilinmeyen iliski ${model}.${k}`);
      const hedef = tablo(il.model).find((r) => r.id === satir[il.yerel]);
      return hedef ? yansit(il.model, hedef, v === true ? {} : v) : null;
    };
    if (spec?.select) {
      const sonuc: Satir = {};
      for (const [k, v] of Object.entries(spec.select)) {
        if (!v) continue;
        sonuc[k] = ILISKILER[model]?.[k] ? iliski(k, v) : satir[k];
      }
      return sonuc;
    }
    const sonuc: Satir = { ...satir };
    for (const [k, v] of Object.entries(spec?.include ?? {})) {
      if (v) sonuc[k] = iliski(k, v);
    }
    return sonuc;
  }

  function veriUygula(hedef: Satir, data: Satir): void {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const islem =
        v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) &&
        Object.keys(v).length === 1 && VERI_ISLEMLERI.includes(Object.keys(v)[0])
          ? Object.keys(v)[0]
          : null;
      if (islem === 'increment') hedef[k] = (hedef[k] ?? 0) + (v as any).increment;
      else if (islem === 'decrement') hedef[k] = (hedef[k] ?? 0) - (v as any).decrement;
      else hedef[k] = v;
    }
  }

  function tekillikDenetle(model: string, aday: Satir, haric?: Satir): void {
    for (const alan of TEKIL[model] ?? []) {
      const d = aday[alan];
      if (d === null || d === undefined) continue;
      if (tablo(model).some((r) => r !== haric && r[alan] === d)) {
        throw Object.assign(new Error(`Unique constraint failed on ${model}.${alan}`), {
          code: 'P2002', meta: { target: [alan] },
        });
      }
    }
  }

  function olustur(model: string, data: Satir): Satir {
    const satir: Satir = { id: randomUUID(), ...(VARSAYILAN[model]?.() ?? {}) };
    veriUygula(satir, data);
    tekillikDenetle(model, satir);
    tablo(model).push(satir);
    return satir;
  }

  const modelYuzu = (model: string) => ({
    findUnique: async (arg: any) => {
      await Promise.resolve();
      anahtarDenetle(model, 'findUnique', arg, ['where', 'select', 'include']);
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      return s ? yansit(model, s, arg) : null;
    },
    findUniqueOrThrow: async (arg: any) => {
      await Promise.resolve();
      anahtarDenetle(model, 'findUniqueOrThrow', arg, ['where', 'select', 'include']);
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (!s) throw Object.assign(new Error(`${model} bulunamadi`), { code: 'P2025' });
      return yansit(model, s, arg);
    },
    findFirst: async (arg: any = {}) => {
      await Promise.resolve();
      anahtarDenetle(model, 'findFirst', arg, ['where', 'select', 'include', 'orderBy']);
      const s = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy)[0];
      return s ? yansit(model, s, arg) : null;
    },
    findMany: async (arg: any = {}) => {
      await Promise.resolve();
      anahtarDenetle(model, 'findMany', arg, ['where', 'select', 'include', 'orderBy', 'take']);
      const hepsi = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy);
      const kesit = typeof arg.take === 'number' ? hepsi.slice(0, arg.take) : hepsi;
      return kesit.map((s) => yansit(model, s, arg));
    },
    count: async (arg: any = {}) => {
      await Promise.resolve();
      anahtarDenetle(model, 'count', arg, ['where']);
      return tablo(model).filter((r) => whereUygula(r, arg.where)).length;
    },
    create: async (arg: any) => {
      await Promise.resolve();
      anahtarDenetle(model, 'create', arg, ['data', 'select', 'include']);
      return yansit(model, olustur(model, arg.data), arg);
    },
    update: async (arg: any) => {
      await Promise.resolve();
      anahtarDenetle(model, 'update', arg, ['where', 'data', 'select', 'include']);
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (!s) throw Object.assign(new Error(`${model} guncellenecek satir yok`), { code: 'P2025' });
      const aday = { ...s };
      veriUygula(aday, arg.data);
      tekillikDenetle(model, aday, s);
      veriUygula(s, arg.data);
      return yansit(model, s, arg);
    },
    updateMany: async (arg: any) => {
      await Promise.resolve();
      anahtarDenetle(model, 'updateMany', arg, ['where', 'data']);
      const hedefler = tablo(model).filter((r) => whereUygula(r, arg.where));
      hedefler.forEach((s) => veriUygula(s, arg.data));
      return { count: hedefler.length };
    },
  });

  const prisma: any = new Proxy(
    {},
    {
      get: (_h, ad: string) => {
        if (ad === 'then') return undefined;
        // `firmayiGeriAc` etkileşimli transaction açar. Taklit ATOMİK DEĞİL:
        // bu paket geri açmanın atomikliğini ölçmez (onu `test:odeme-imha` ölçer).
        if (ad === '$transaction') {
          return async (is: unknown) => {
            if (typeof is === 'function') return (is as (tx: unknown) => unknown)(prisma);
            if (Array.isArray(is)) return Promise.all(is);
            throw new Error('bellek-Prisma: beklenmeyen $transaction bicimi');
          };
        }
        return modelYuzu(ad);
      },
    },
  );
  return { prisma, tablo, ekle: (model: string, data: Satir) => olustur(model, data) };
}

// ═════════════════════════════════════════════════════════════════════════
//  SAHTE iyzico — abonelik detayı (her çağrıda TAZE kopya)
// ═════════════════════════════════════════════════════════════════════════
function sahteIyzico() {
  const detaylar = new Map<string, unknown>();
  const sorulan: string[] = [];
  const yasak = (ad: string) => async () => {
    throw new Error(`sahte iyzico: bu pakette ${ad} ÇAĞRILMAZ`);
  };
  return {
    detaylar,
    sorulan,
    istemci: {
      abonelikGetir: async (kod: string) => {
        sorulan.push(kod);
        const d = detaylar.get(kod);
        if (!d) throw new Error(`sahte iyzico: ${kod} icin detay tanimlanmadi`);
        return JSON.parse(JSON.stringify(d));
      },
      tahsilatiTekrarla: yasak('yeniden deneme'),
      abonelikIptal: yasak('iptal'),
      abonelikBaslat: yasak('abonelik formu'),
    } as any,
  };
}

/**
 * Sipariş — 20.08 sandbox tutanağındaki biçim (adim0-cikti.json, S2a-dogrulama
 * SUCCESS siparişi): `price` (SAYI), `currencyCode`, epoch-ms `startPeriod`/
 * `endPeriod`, `orderStatus`, `paymentAttempts[{conversationId, createdDate,
 * paymentId, paymentStatus}]`. `paidPrice` tutanakta YOK — konmadı. Dönem 31
 * gün (tutanaktaki takvim ayı). `tutarYok`: tutar alanı HİÇ yok (W6).
 * ⚠ Reddedilmiş denemenin `paymentStatus` değeri ÖLÇÜLMEDİ ('FAILURE' iyzico
 * ödeme API'sindeki değer); kurallar yalnız SUCCESS'i arar.
 */
function siparis(p: { kod: string; price?: number; tutarYok?: boolean; bas: number; denemeler: Array<[string, number]> }) {
  return {
    referenceCode: p.kod,
    ...(p.tutarYok ? {} : { price: p.price ?? 1649 }),
    currencyCode: 'TRY',
    startPeriod: p.bas,
    endPeriod: p.bas + 31 * GUN,
    orderStatus: 'SUCCESS',
    paymentAttempts: p.denemeler.map(([durum, an], i) => ({
      conversationId: `conv-${p.kod}-${i}`,
      createdDate: an,
      paymentId: 37_387_490 + i,
      paymentStatus: durum,
    })),
  };
}

/** Abonelik detayı — 20.08 tutanağındaki alanlar (denemesiz: `trialDays: 0`). */
function iyzicoDetayi(kod: string, durum: string, plan: string, siparisler: unknown[]) {
  return {
    referenceCode: kod,
    parentReferenceCode: `kok-${kod}`,
    pricingPlanReferenceCode: plan,
    customerReferenceCode: `cus-${kod}`,
    subscriptionStatus: durum,
    trialDays: 0,
    orders: siparisler,
  };
}

/** Elle (NES) muhasebe adaptörünün yerine: talebi YAKALAR, e-posta göndermez. */
function nesYakalayici() {
  const talepler: FaturaKesTalebi[] = [];
  return {
    talepler,
    adaptor: {
      ad: 'elle',
      faturaKes: async (t: FaturaKesTalebi) => {
        talepler.push(t);
        return { saglayiciId: `nes-${t.harciAnahtar}` };
      },
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  DÜNYA — her senaryo TAZE dünya kurar
// ═════════════════════════════════════════════════════════════════════════
/** Üç paket, fiyatları BİLEREK farklı: yanlış paketten okunan tutar/ad görünür. */
const PAKETLER = [
  { paket: { id: 'P-PRO', kod: 'pro-mek', ad: 'Pro Mekanik' }, surum: { id: 'S-PRO', tutar: 1649, iyzicoPlanKodu: 'plan-pro' } },
  { paket: { id: 'P-BASIC', kod: 'basic-mek', ad: 'Basic Mekanik' }, surum: { id: 'S-BASIC', tutar: 899, iyzicoPlanKodu: 'plan-basic' } },
  { paket: { id: 'P-MEP', kod: 'pro-mep', ad: 'Pro MEP' }, surum: { id: 'S-MEP', tutar: 2499, iyzicoPlanKodu: 'plan-mep' } },
];

type Posta = { kime: string; konu: string; baslik?: string; paragraflar?: string[] };

function dunyaKur() {
  const db = bellekPrisma();
  const iyz = sahteIyzico();
  const nes = nesYakalayici();
  const giden: Posta[] = [];
  const posta = {
    gonder: async (p: Posta) => {
      giden.push({ kime: p.kime, konu: p.konu, baslik: p.baslik, paragraflar: p.paragraflar });
    },
    // Yönetim bildirimi (`yonetimeYaz`) SMTP yapılandırmasını sorar.
    yapilandirildiMi: () => true,
  } as any;
  // Yönetim adresi (YONETIM_EPOSTA boşsa etkin yönetici hesapları — canlı gibi).
  db.ekle('user', {
    email: 'yonetici@ornek.test', role: 'admin', status: 'active', deletedAt: null, emailVerified: true,
    createdAt: new Date(),
  });
  for (const { paket, surum } of PAKETLER) {
    db.ekle('paket', { ...paket, kullaniciHakki: 2, dwgAktif: true });
    db.ekle('paketSurumu', {
      ...surum, paketId: paket.id, periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 0,
      paraBirimi: 'TRY', satistaMi: true,
    });
  }
  const config = new ConfigService({ UYGULAMA_URL: 'https://ornek.test' });
  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci);
  const fatura = new FaturaServisi(db.prisma, nes.adaptor as any, posta);
  const dunning = new DunningServisi(db.prisma, iyz.istemci, abonelik, posta, config);
  // Beşinci argüman: sorunsuz yenilemenin "ödemeniz alındı" makbuzu da ölçülür.
  const isleyici = new WebhookIsleyici(db.prisma, abonelik, fatura, dunning, posta);
  const mutabakat = new MutabakatJob(db.prisma, iyz.istemci, abonelik);

  /** Fatura kopyası çıkarılabilsin diye tam kimlikli firma (limited şirket). */
  function firma(id: string) {
    return db.ekle('firma', {
      id, ad: `Firma ${id}`, unvan: `${id} Tesisat Ltd. Şti.`, vergiNo: '1234567890',
      vergiDairesi: 'Kadıköy', tcKimlikNo: null, faturaAdresi: 'Moda Cad. 1', il: 'İstanbul',
      ilce: 'Kadıköy', faturaEposta: `muhasebe@${id.toLowerCase()}.test`,
      yetkiliEposta: `sahip@${id.toLowerCase()}.test`, imhaTarihi: null,
    });
  }

  /**
   * Yenilemesi çekilmiş canlı KART satırı: erişim bir önceki dönemin sonunda
   * (= yeni siparişin dönem başı), iyzico ACTIVE. `ek` paket değişimi
   * alanlarını taşır (W4/W5).
   */
  function kartSatiri(firmaId: string, kod: string, paketSurumuId: string, erisimSonu: Date, ek: Satir = {}) {
    firma(firmaId);
    return db.ekle('abonelik', {
      firmaId, paketSurumuId, durum: 'AKTIF', odemeYontemi: 'KART', erisimSonu,
      iyzicoAbonelikKodu: kod, iyzicoMusteriKodu: `cus-${kod}`, iyzicoDurum: 'ACTIVE', ...ek,
    });
  }

  /** iyzico'nun GÖNDERDİĞİ olay (webhook.controller `hamKaydet` biçimi). */
  function gelenWebhook(kod: string, siparisKodu: string, tip: 'success' | 'failure' = 'success') {
    db.ekle('webhookOlayi', {
      tekilAnahtar: `iyzico:subscription.order.${tip}:iyz-${siparisKodu}`,
      olayTipi: `subscription.order.${tip}`, hamGovde: {}, abonelikKodu: kod, siparisKodu,
    });
  }

  const satir = (id: string) => db.tablo('abonelik').find((r) => r.id === id)!;
  const faturalar = (abonelikId: string) => db.tablo('fatura').filter((f) => f.abonelikId === abonelikId);
  const tahsilatOlayi = (abonelikId: string, siparisKodu: string) =>
    db.tablo('abonelikOlayi').find(
      (o) => o.abonelikId === abonelikId && o.tip === 'durum.degisti' && o.veri?.siparisKodu === siparisKodu,
    );
  // İki "ödemeniz alındı" aynı konuyu taşır: sorunsuz yenilemenin makbuzu
  // (musteri-epostalari.ts) ile dunning'den çıkışınki (dunning.metinleri.ts)
  // BAŞLIKTAN ayrılır.
  const makbuzlar = () =>
    giden.filter((p) => p.konu === 'MetaPriceX — ödemeniz alındı' && p.baslik === 'Ödemeniz için teşekkürler');
  const toparlandiPostalari = () =>
    giden.filter((p) => p.konu === 'MetaPriceX — ödemeniz alındı' && p.baslik === 'Her şey yolunda');
  const yoneticiUyarilari = () =>
    giden.filter((p) => p.konu.startsWith('[MetaPriceX] Fatura kuyruğa alınamadı — tutar okunamadı'));
  const tahsilatOlaylari = (abonelikId: string) =>
    db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && o.tip === 'durum.degisti' &&
      String(o.aciklama ?? '').startsWith('Tahsilat başarılı'));

  return {
    db, iyz, nes, giden, firma, kartSatiri, gelenWebhook, satir, faturalar, tahsilatOlayi, makbuzlar,
    toparlandiPostalari, yoneticiUyarilari, tahsilatOlaylari, faturaServisi: fatura,
    /** Webhook işleyicisinin dakikalık taraması (üretimde @Cron). */
    isle: () => gunluguTopla(() => isleyici.bekleyenleriIsle()),
    /** Fatura kesim turu (üretimde dakikalık @Cron) — NES talebi burada yakalanır. */
    kes: () => gunluguTopla(() => fatura.kuyrugaBak()),
    /** GECE: mutabakat, ardından işleyicinin taraması (ikisi de @Cron). */
    gece: () =>
      gunluguTopla(async () => {
        await mutabakat.geceMutabakati();
        await isleyici.bekleyenleriIsle();
      }),
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  S — SAF KURALLAR
// ═════════════════════════════════════════════════════════════════════════
function sBlogu(): void {
  console.log('\n── S · saf kurallar: tahsilEdilenTutar · odemeAni · faturaSatiriVerisi · istanbulGunSonu ──');
  const tt = (s: unknown) => JSON.stringify(tahsilEdilenTutar(s));

  // Ölçülen biçim (20.08 sandbox, 5 sipariş): price SAYI + currencyCode.
  check('S1 ⭐ ölçülen biçim (price + currencyCode) → çekilen tutar ve para birimi',
    tt({ price: 199, currencyCode: 'TRY' }) === '{"tutar":199,"paraBirimi":"TRY"}' &&
      tt({ price: 89.9, currencyCode: 'TRY' }) === '{"tutar":89.9,"paraBirimi":"TRY"}' &&
      tt({ price: 49.9, currencyCode: 'TRY' }) === '{"tutar":49.9,"paraBirimi":"TRY"}',
    `${tt({ price: 199, currencyCode: 'TRY' })} ${tt({ price: 89.9, currencyCode: 'TRY' })}`);
  check('S2 paidPrice GELDİYSE söz onundur (price liste fiyatıdır; indirimde çekilen paidPrice)',
    tt({ price: 199, paidPrice: 179.1, currencyCode: 'TRY' }) === '{"tutar":179.1,"paraBirimi":"TRY"}' &&
      tt({ price: 199, paidPrice: '179.10' }) === '{"tutar":179.1,"paraBirimi":null}',
    tt({ price: 199, paidPrice: 179.1, currencyCode: 'TRY' }));
  const okunamayan: unknown[] = [0, -5, 'abc', '', ' ', NaN, Infinity, {}, [], true];
  check('S3 ⭐ paidPrice geldi ama OKUNAMIYOR (0, negatif, bozuk) → null — liste fiyatına DÜŞÜLMEZ',
    okunamayan.every((pp) => tahsilEdilenTutar({ price: 199, paidPrice: pp, currencyCode: 'TRY' }) === null),
    tt(okunamayan.map((pp) => tahsilEdilenTutar({ price: 199, paidPrice: pp }))));
  check('S4 paidPrice null ya da HİÇ yok → price',
    tahsilEdilenTutar({ price: 199, paidPrice: null })?.tutar === 199 &&
      tahsilEdilenTutar({ price: 199, paidPrice: undefined })?.tutar === 199);
  const okunmayanDize = ['1.649,00', '1649,5', '1,649.00', '1e3', '0x10', '+5', '5.'];
  check('S5 rakam dizesi okunur ("1649.00", " 49.9 "); virgüllü / ayraçlı / bilimsel / işaretli dize OKUNMAZ (tahmin yok)',
    tahsilEdilenTutar({ price: '1649.00' })?.tutar === 1649 && tahsilEdilenTutar({ price: ' 49.9 ' })?.tutar === 49.9 &&
      okunmayanDize.every((p) => tahsilEdilenTutar({ price: p }) === null),
    tt(okunmayanDize.map((p) => tahsilEdilenTutar({ price: p }))));
  const gecersiz: unknown[] = [
    {}, { price: 0 }, { price: -1 }, { price: Infinity }, { price: NaN }, { price: null }, null, undefined, 'x', 5, [],
  ];
  check('S6 tutar yok / geçersiz (0, negatif, sonsuz, NaN, null; nesne olmayan girdi) → null',
    gecersiz.every((s) => tahsilEdilenTutar(s) === null), tt(gecersiz.map((s) => tahsilEdilenTutar(s))));
  check('S7 para birimi kırpılır; boş / dize dışı / yok → null (çağıran paketin para birimine düşer)',
    tahsilEdilenTutar({ price: 1, currencyCode: ' TRY ' })?.paraBirimi === 'TRY' &&
      tahsilEdilenTutar({ price: 1, currencyCode: '  ' })?.paraBirimi === null &&
      tahsilEdilenTutar({ price: 1, currencyCode: 949 })?.paraBirimi === null &&
      tahsilEdilenTutar({ price: 1 })?.paraBirimi === null);

  // `odemeAni` — T0 PARAMETRE, duvar saatine bağlı değil: sabit tarih burada güvenli.
  const T0 = 1_787_215_031_301; // 20.08 tutanağındaki startPeriod
  const den = (durum: string, an: unknown, alan = 'paymentStatus') => ({
    conversationId: 'c', createdDate: an, paymentId: 1, [alan]: durum,
  });
  const ms = (d: Date | null) => d?.getTime() ?? null;
  check('S8 ⭐ ödeme anı = BAŞARILI denemenin createdDate\'i; önceki ve SONRAKİ ret yok sayılır',
    ms(odemeAni({ paymentAttempts: [den('FAILURE', T0), den('SUCCESS', T0 + GUN), den('FAILURE', T0 + 2 * GUN)] })) ===
      T0 + GUN);
  // İKİ sıra: "listedeki ilk" ve "listedeki son" kuralı da tek sırada doğru
  // cevabı verebilir (mutasyon K6: tek sıralı fikstür yanlış kuralı yakalamadı).
  // İLKİ (kod incelemesi 28.09): sipariş o an ödendi; ikinci başarılı deneme
  // çift çekimdir ve VUK son günü ilk ödemeden sayılır.
  check('S9 birden çok başarılı deneme (çift çekim) → İLKİ — sipariş o an ödendi (listenin sırası değil, an — iki sırada)',
    ms(odemeAni({ paymentAttempts: [den('SUCCESS', T0 + 3 * GUN), den('SUCCESS', T0)] })) === T0 &&
      ms(odemeAni({ paymentAttempts: [den('SUCCESS', T0), den('SUCCESS', T0 + 3 * GUN)] })) === T0);
  check('S10 istemci tipindeki alan adı (`paymentAttemptStatus`) da okunur; rakam-dizesi tarih çözülür',
    ms(odemeAni({ paymentAttempts: [den('SUCCESS', String(T0), 'paymentAttemptStatus')] })) === T0);
  const anYok: unknown[] = [
    { paymentAttempts: [den('FAILURE', T0)] },
    { paymentAttempts: [den('SUCCESS', 'dün')] },
    { paymentAttempts: [den('SUCCESS', 0)] },
    { paymentAttempts: [] }, { paymentAttempts: 'x' }, {}, null, 'x',
  ];
  check('S11 başarılı deneme yok / tarihi çözülemez / liste yok → null (çağıran dönem başına düşer)',
    anYok.every((s) => odemeAni(s) === null), JSON.stringify(anYok.map((s) => iso(odemeAni(s)))));
  check('S11b çözülemeyen başarılı deneme, çözülebilen başarılıyı GİZLEMEZ',
    ms(odemeAni({ paymentAttempts: [den('SUCCESS', T0), den('SUCCESS', 'bozuk')] })) === T0);

  // `faturaSatiriVerisi` — kuyruğa alınan satırın TEK veri kuralı (yazımdan ayrı).
  const kopya: FaturaMusteriKopyasi = {
    musteriUnvan: 'Yılmaz Tesisat Ltd. Şti.', musteriVergiDairesi: 'Kadıköy', musteriVergiNo: '1234567890',
    musteriTcKimlikNo: null, musteriAdres: 'Moda Cad. 1', musteriIl: 'İstanbul', musteriIlce: 'Kadıköy',
  };
  const talep = (tutar: number): FaturaTalebi => ({
    abonelikId: 'AB-S', tahsilatKodu: 'ord-s', tutar, paraBirimi: 'TRY',
    donemBasi: new Date(T0), donemSonu: new Date(T0 + 31 * GUN),
    tahsilatTarihi: new Date(T0 + GUN + DK), paketSurumuId: 'S-PRO',
  });
  const simdi = new Date(T0 + 2 * GUN);
  const v = faturaSatiriVerisi(talep(1200), { kopya, paketAdi: 'Pro Mekanik', kdvOrani: 20, simdi });
  const an = (x: unknown) => (x instanceof Date ? x.getTime() : NaN);
  check('S12 ⭐ satır verisi: ödeme anı + paket adı + müşteri kopyası + dönem + kod AYNEN; BEKLIYOR; hemen işlenir (sonDeneme = şimdi − 60 sn)',
    an(v.tahsilatTarihi) === T0 + GUN + DK && v.paketAdi === 'Pro Mekanik' &&
      v.musteriUnvan === kopya.musteriUnvan && v.musteriVergiNo === '1234567890' && v.musteriIlce === 'Kadıköy' &&
      v.abonelikId === 'AB-S' && v.tahsilatKodu === 'ord-s' && v.durum === 'BEKLIYOR' && v.paraBirimi === 'TRY' &&
      an(v.donemBasi) === T0 && an(v.donemSonu) === T0 + 31 * GUN && an(v.sonDeneme) === simdi.getTime() - DK &&
      v.kdvOrani === 20,
    JSON.stringify(v));
  const ayir = (t: number) => {
    const d = faturaSatiriVerisi(talep(t), { kopya, paketAdi: null, kdvOrani: 20, simdi });
    return `${String(d.tutar)}+${String(d.kdvTutari)}=${String(d.toplamTutar)}`;
  };
  // Beklentiler ELLE hesaplandı (kuraldan türetilmedi).
  check('S13 KDV DAHİL tutardan: 1200 → 1000 + 200 · 999,99 → 833,33 + 166,66 · 1649 → 1374,17 + 274,83 · 1499,9 → 1249,92 + 249,98',
    ayir(1200) === '1000+200=1200' && ayir(999.99) === '833.33+166.66=999.99' &&
      ayir(1649) === '1374.17+274.83=1649' && ayir(1499.9) === '1249.92+249.98=1499.9',
    [1200, 999.99, 1649, 1499.9].map(ayir).join(' · '));
  let bozuk = 0;
  let sayilan = 0;
  let ornek = '';
  for (let kurus = 1; kurus <= 500_000; kurus += 7) {
    sayilan++;
    const d = faturaSatiriVerisi(talep(kurus / 100), { kopya, paketAdi: null, kdvOrani: 20, simdi });
    const parca = Math.round(Number(d.tutar) * 100) + Math.round(Number(d.kdvTutari) * 100);
    if (parca !== kurus || Math.round(Number(d.toplamTutar) * 100) !== kurus) {
      bozuk++;
      ornek ||= `${kurus} kuruş: ${String(d.tutar)} + ${String(d.kdvTutari)}`;
    }
  }
  check(`S14 matrah + KDV = tahsil edilen tutar, KURUŞU KURUŞUNA (0,01–5.000 TL, ${sayilan} tutar)`,
    bozuk === 0 && sayilan === 71_429, `bozuk=${bozuk} sayilan=${sayilan} ${ornek}`);

  check('S15 İstanbul günü UTC 21:00\'de biter (UTC+3, yaz saati yok) — `tarihYaz`ın yazdığı GÜN',
    istanbulGunSonu(new Date('2026-09-28T20:59:59.999Z')).toISOString() === '2026-09-28T20:59:59.999Z' &&
      istanbulGunSonu(new Date('2026-09-28T21:00:00.000Z')).toISOString() === '2026-09-29T20:59:59.999Z' &&
      istanbulGunSonu(new Date('2026-09-28T00:00:00.000Z')).toISOString() === '2026-09-28T20:59:59.999Z' &&
      tarihYaz(new Date('2026-09-28T21:00:00.000Z')) === '29 Eylül 2026');
  check('S16 TEK tanım: deneme hatırlatmasının gün sonu AYNI fonksiyon (yeniden dışa verilir, kopya değil)',
    hatirlatmaGunSonu === istanbulGunSonu);
}

// ═════════════════════════════════════════════════════════════════════════
//  E — NES E-POSTASI: SON DÜZENLEME GÜNÜ (VUK md. 231/5)
// ═════════════════════════════════════════════════════════════════════════
function eBlogu(): void {
  console.log('\n── E · NES e-postası: son düzenleme günü İstanbul GÜNÜ — son günün tamamı süre içinde ──');
  // Ödeme: İstanbul 1 Ekim 2026 01:00 = 30 Eylül 22:00 UTC → son gün 8 Ekim
  // 2026 (İstanbul). Beklentiler ELLE yazıldı (kuraldan türetilmedi).
  const ODEME = Date.parse('2026-09-30T22:00:00.000Z');
  const talep = (duzenleme: string, o: { anahtar?: string; tahsilatsiz?: boolean } = {}): FaturaKesTalebi => ({
    harciAnahtar: o.anahtar ?? 'ord-e1',
    musteri: {
      unvan: 'Yılmaz Tesisat Ltd. Şti.', vergiNo: '1234567890', vergiDairesi: 'Kadıköy',
      eposta: 'muhasebe@yilmaz.test', adres: 'Moda Cad. 1', il: 'İstanbul', ilce: 'Kadıköy',
    },
    kalemler: [{
      ad: 'Pro Mekanik — Yazılım Kullanım Bedeli', aciklama: 'Dönem: 1.10.2026 – 1.11.2026', miktar: 1,
      birim: 'Adet', birimFiyat: 1000, kdvOrani: 20,
    }],
    paraBirimi: 'TRY',
    duzenlemeTarihi: new Date(duzenleme),
    ...(o.tahsilatsiz ? {} : { tahsilat: { matrah: 1000, kdv: 200, toplam: 1200, tarih: new Date(ODEME) } }),
  });
  const kart = { iyzicoTestOrtami: false };
  const gecti = (e: { konu: string; baslik: string; paragraflar: string[] }) =>
    e.konu.includes('SÜRESİ GEÇTİ') || e.baslik.includes('SÜRESİ GEÇTİ') || e.paragraflar.some((p) => p.includes('SÜRE GEÇTİ'));

  // İstanbul 8 Ekim 13:00: ödemenin saati + 7×24 sa GEÇTİ (7 Ekim 22:00 UTC) ve
  // UTC günü de geçti — ama İstanbul'da hâlâ SON GÜN.
  const e1 = faturaKesimTalebiEpostasi(talep('2026-10-08T10:00:00.000Z'), kart);
  check('E1 ⭐ SON GÜNÜN öğleden sonrası (ödeme saati + 7×24 sa geçti, gün geçmedi) → süre GEÇMEDİ; ödeme "1 Ekim", son gün "8 Ekim" (İstanbul)',
    !gecti(e1) && e1.paragraflar.includes('Ödeme tarihi: 1 Ekim 2026') &&
      e1.paragraflar.some((p) => p.startsWith('Son düzenleme günü: 8 Ekim 2026 ')),
    JSON.stringify({ konu: e1.konu, p: e1.paragraflar.slice(0, 4) }));
  const e2 = faturaKesimTalebiEpostasi(talep('2026-10-08T20:59:59.999Z'), kart); // İstanbul 8 Ekim 23:59:59.999
  check('E2 sınır DAHİL: son günün SON milisaniyesi → süre geçmedi', !gecti(e2), e2.konu);
  const e3 = faturaKesimTalebiEpostasi(talep('2026-10-08T21:00:00.000Z'), kart); // İstanbul 9 Ekim 00:00
  check('E3 ⭐ ertesi günün İLK anı → SÜRE GEÇTİ: ilk paragraf, konu öneki, başlık',
    e3.paragraflar[0] ===
      '⚠ SÜRE GEÇTİ: yasal son düzenleme günü 8 Ekim 2026 idi (VUK md. 231/5, ödemeden itibaren 7 gün). ' +
        'Faturayı yine de HEMEN kesin ve gecikmeyi muhasebecinize bildirin.' &&
      e3.konu === '[MetaPriceX] SÜRESİ GEÇTİ — Fatura kesilecek — Yılmaz Tesisat Ltd. Şti. — ₺1.200,00 — ord-e1' &&
      e3.baslik === "NES'te kesilecek fatura — SÜRESİ GEÇTİ",
    JSON.stringify({ konu: e3.konu, baslik: e3.baslik, p0: e3.paragraflar[0] }));
  check('E3b süre geçse de ödeme tarihi ve son gün satırları yerinde (talimat kaybolmaz)',
    e3.paragraflar.includes('Ödeme tarihi: 1 Ekim 2026') &&
      e3.paragraflar.some((p) => p.startsWith('Son düzenleme günü: 8 Ekim 2026 ')));

  const e4 = faturaKesimTalebiEpostasi(talep('2026-10-20T09:00:00.000Z'), { iyzicoTestOrtami: true });
  check('E4 TEST ödemesi (sandbox kart) günler sonra da "süre geçti" DEMEZ — fatura zaten kesilmeyecek',
    !gecti(e4) && e4.konu.startsWith('[MetaPriceX] TEST ödemesi — fatura KESMEYİN'), e4.konu);
  const e5 = faturaKesimTalebiEpostasi(talep('2026-10-20T09:00:00.000Z', { anahtar: 'havale:hv-1' }), {
    iyzicoTestOrtami: true, havale: { teklifNo: 'MPX-2026-0042', faturaNo: 'NES2026000017' },
  });
  check('E5 havale HER ZAMAN gerçek para (test ortamı bayrağı yok sayılır): kayıtlı numarada da konu öneki + ilk paragraf',
    e5.konu ===
      '[MetaPriceX] SÜRESİ GEÇTİ — Havale faturası kayıtlı — kontrol edin — Yılmaz Tesisat Ltd. Şti. — NES2026000017' &&
      e5.paragraflar[0].startsWith('⚠ SÜRE GEÇTİ: yasal son düzenleme günü 8 Ekim 2026 idi'),
    JSON.stringify({ konu: e5.konu, p0: e5.paragraflar[0] }));
  // Kod incelemesi 28.09 (inceleme M3 kuralı): "HEMEN kesin" ile "İKİNCİ KEZ
  // KESMEYİN" aynı postada çelişmesin — kayıtlı numarada talimat koşullu.
  check('E5b kayıtlı numarada gecikme talimatı KOŞULLU ("proformaysa HEMEN kesin"); koşulsuz "yine de HEMEN kesin" YOK',
    e5.paragraflar[0].endsWith('Kayıtlı numara proformaysa faturayı HEMEN kesin ve gecikmeyi muhasebecinize bildirin.') &&
      !e5.paragraflar.some((p) => p.includes('yine de HEMEN kesin')) &&
      e3.paragraflar[0].endsWith('Faturayı yine de HEMEN kesin ve gecikmeyi muhasebecinize bildirin.'),
    JSON.stringify(e5.paragraflar[0]));
  const e6 = faturaKesimTalebiEpostasi(talep('2026-10-20T09:00:00.000Z', { tahsilatsiz: true }), kart);
  check('E6 tahsilat bilgisi TAŞIMAYAN talep (başka çağıran): ödeme = düzenleme anı → gecikme UYDURULMAZ',
    !gecti(e6) && e6.paragraflar.includes('Ödeme tarihi: 20 Ekim 2026'), JSON.stringify(e6.paragraflar.slice(0, 3)));
}

// ═════════════════════════════════════════════════════════════════════════
//  W — WEBHOOK UÇTAN UCA (gerçek işleyici + servisler + kesim turu)
// ═════════════════════════════════════════════════════════════════════════
/** Prisma.Decimal → "1499.9" (satırdaki para alanları). */
const tl = (x: unknown) => String(x);

async function w1(): Promise<void> {
  console.log('\n── W1 · tutar ve para birimi SİPARİŞTEN: satır · olay · makbuz · NES talebi ──');
  const d = dunyaKur();
  const bas = Date.now() - 2 * SAAT;
  const ab = d.kartSatiri('F-W1', 'sub-w1', 'S-PRO', new Date(bas));
  // iyzico planının fiyatı panelden değişti (ya da sürüm tutarı farklı):
  // siparişin KENDİ tutarı 1499,90, veritabanındaki paket fiyatı 1649.
  const o = siparis({ kod: 'ord-w1', price: 1499.9, bas, denemeler: [['SUCCESS', bas + DK]] });
  d.iyz.detaylar.set('sub-w1', iyzicoDetayi('sub-w1', 'ACTIVE', 'plan-pro', [o]));
  d.gelenWebhook('sub-w1', 'ord-w1');
  const g = await d.isle();
  const f = d.faturalar(ab.id);
  const surum = d.db.tablo('paketSurumu').find((r) => r.id === 'S-PRO');
  check('W1-FIXTURE paketin kayıtlı fiyatı 1649, sipariş 1499,90 çekti, `paidPrice` YOK (eski kural 1649 yazardı); olay işlendi, erişim dönem sonuna uzadı, günlük temiz',
    Number(surum?.tutar) === 1649 && !('paidPrice' in o) && d.db.tablo('webhookOlayi')[0]?.islendi === true &&
      d.satir(ab.id).erisimSonu.getTime() === o.endPeriod && g.hatalar.length === 0 && f.length === 1,
    `fatura=${f.length} ${gunlukYaz(g)}`);
  check('W1a ⭐ fatura satırı ÇEKİLEN tutarı taşır: toplam 1499,9 (KDV dahil) = matrah 1249,92 + KDV 249,98; TRY',
    tl(f[0]?.toplamTutar) === '1499.9' && tl(f[0]?.tutar) === '1249.92' && tl(f[0]?.kdvTutari) === '249.98' &&
      f[0]?.paraBirimi === 'TRY',
    `toplam=${tl(f[0]?.toplamTutar)} matrah=${tl(f[0]?.tutar)} kdv=${tl(f[0]?.kdvTutari)} pb=${f[0]?.paraBirimi}`);
  const olay = d.tahsilatOlayi(ab.id, 'ord-w1');
  check('W1b tahsilat olayı AYNI tutarı yazar (tek kural `tahsilEdilenTutar`)',
    olay?.veri?.tutar === 1499.9 && olay?.veri?.paraBirimi === 'TRY', JSON.stringify(olay?.veri));
  const m = d.makbuzlar();
  check('W1c ⭐ makbuz ("ödemeniz alındı") AYNI tutarı yazar: "Pro Mekanik aboneliğinizin ₺1.499,90 tutarındaki ödemesi"',
    m.length === 1 && !!m[0].paragraflar?.[0]?.includes('Pro Mekanik aboneliğinizin ₺1.499,90 tutarındaki ödemesi'),
    JSON.stringify(m.map((x) => x.paragraflar?.[0])));
  const k = await d.kes();
  const t = d.nes.talepler.find((x) => x.harciAnahtar === 'ord-w1');
  check('W1d ⭐ NES talebi: toplam 1499,9 = 1249,92 + 249,98; kalemin birim fiyatı matrah; TRY; kesim turu temiz',
    t?.tahsilat?.toplam === 1499.9 && t.tahsilat.matrah === 1249.92 && t.tahsilat.kdv === 249.98 &&
      t.kalemler[0]?.birimFiyat === 1249.92 && t.paraBirimi === 'TRY' && k.hatalar.length === 0,
    `${JSON.stringify(t?.tahsilat)} birim=${t?.kalemler[0]?.birimFiyat} ${gunlukYaz(k)}`);
  const e = t ? faturaKesimTalebiEpostasi(t, { iyzicoTestOrtami: false }) : null;
  check('W1e NES e-postasının konusu çekilen tutarı yazar',
    e?.konu === '[MetaPriceX] Fatura kesilecek — F-W1 Tesisat Ltd. Şti. — ₺1.499,90 — ord-w1', e?.konu);

  // W1f — PARA BİRİMİ de siparişten: iyzico planı EUR çekti, paket kaydı TRY
  // (yanlış yapılandırma). Yukarıdaki dünya TRY/TRY: sipariş para biriminin
  // okunduğunu ayırt etmez (mutasyon H9 orada yaşadı).
  const d2 = dunyaKur();
  const ab2 = d2.kartSatiri('F-W1F', 'sub-w1f', 'S-PRO', new Date(bas));
  const o2 = { ...siparis({ kod: 'ord-w1f', price: 99.9, bas, denemeler: [['SUCCESS', bas + DK]] }), currencyCode: 'EUR' };
  d2.iyz.detaylar.set('sub-w1f', iyzicoDetayi('sub-w1f', 'ACTIVE', 'plan-pro', [o2]));
  d2.gelenWebhook('sub-w1f', 'ord-w1f');
  const g2 = await d2.isle();
  const f2 = d2.faturalar(ab2.id)[0];
  const m2 = d2.makbuzlar();
  check('W1f para birimi de SİPARİŞTEN: iyzico EUR çektiyse (paket kaydı TRY) fatura EUR, makbuz "€99,90"',
    f2?.paraBirimi === 'EUR' && tl(f2?.toplamTutar) === '99.9' && m2.length === 1 &&
      !!m2[0].paragraflar?.[0]?.includes('Pro Mekanik aboneliğinizin €99,90 tutarındaki ödemesi') && g2.hatalar.length === 0,
    `pb=${f2?.paraBirimi} toplam=${tl(f2?.toplamTutar)} makbuz=${JSON.stringify(m2.map((x) => x.paragraflar?.[0]))} ${gunlukYaz(g2)}`);
}

async function w2(): Promise<void> {
  console.log('\n── W2 · ödeme anı = BAŞARILI denemenin anı (ret, ertesi gün yeniden deneme) ──');
  const d = dunyaKur();
  const bas = Date.now() - 27 * SAAT; // dönem dün başladı; ilk deneme reddedildi
  const ab = d.kartSatiri('F-W2', 'sub-w2', 'S-PRO', new Date(bas));
  const o = siparis({
    kod: 'ord-w2', price: 1649, bas, denemeler: [['FAILURE', bas + DK], ['SUCCESS', bas + GUN + DK]],
  });
  d.iyz.detaylar.set('sub-w2', iyzicoDetayi('sub-w2', 'ACTIVE', 'plan-pro', [o]));
  d.gelenWebhook('sub-w2', 'ord-w2');
  const g = await d.isle();
  // Beklenen ödeme anı FİKSTÜRÜN ham iyzico kaydından (başarılı denemenin
  // `createdDate`i) — kodun hesabından türetilmez.
  const odeme = o.paymentAttempts.find((a) => a.paymentStatus === 'SUCCESS')?.createdDate ?? NaN;
  const f = d.faturalar(ab.id)[0];
  check('W2-FIXTURE başarılı deneme dönem başından 1 gün SONRA (eski kural dönem başını yazardı); olay temiz',
    odeme - bas === GUN + DK && !!f && g.hatalar.length === 0,
    `fark=${((odeme - bas) / SAAT).toFixed(2)} sa ${gunlukYaz(g)}`);
  check('W2a ⭐ satır ödeme anını taşır: tahsilatTarihi = başarılı denemenin createdDate\'i',
    f?.tahsilatTarihi instanceof Date && f.tahsilatTarihi.getTime() === odeme,
    `${iso(f?.tahsilatTarihi)} beklenen=${iso(new Date(odeme))}`);
  await d.kes();
  const t = d.nes.talepler.find((x) => x.harciAnahtar === 'ord-w2');
  const e = t ? faturaKesimTalebiEpostasi(t, { iyzicoTestOrtami: false }) : null;
  check('W2b ⭐ NES talebinin ödeme tarihi AYNI an; e-posta son günü ödeme + 7 gün yazar, süre geçmedi',
    t?.tahsilat?.tarih?.getTime() === odeme &&
      !!e?.paragraflar.includes(`Ödeme tarihi: ${tarihYaz(new Date(odeme))}`) &&
      !!e?.paragraflar.some((p) => p.startsWith(`Son düzenleme günü: ${tarihYaz(new Date(odeme + 7 * GUN))} `)) &&
      !e?.konu.includes('SÜRESİ GEÇTİ'),
    JSON.stringify({
      tarih: iso(t?.tahsilat?.tarih),
      p: e?.paragraflar.filter((p) => p.startsWith('Ödeme tarihi') || p.startsWith('Son düzenleme')),
    }));
}

async function w3(): Promise<void> {
  console.log('\n── W3 · paket adı TAHSİLAT anında donar: kesimden önce paket değişti ──');
  const d = dunyaKur();
  const bas = Date.now() - 2 * SAAT;
  const ab = d.kartSatiri('F-W3', 'sub-w3', 'S-PRO', new Date(bas));
  const o = siparis({ kod: 'ord-w3', price: 1649, bas, denemeler: [['SUCCESS', bas + DK]] });
  d.iyz.detaylar.set('sub-w3', iyzicoDetayi('sub-w3', 'ACTIVE', 'plan-pro', [o]));
  d.gelenWebhook('sub-w3', 'ord-w3');
  const g = await d.isle();
  const f = d.faturalar(ab.id)[0];
  const durumOnce = f?.durum;
  // Kuyruk ile kesim arasında satırın paketi değişti (yönetici paket işlemi /
  // vadesi gelen planlı geçiş); kesim satırı aboneliğiyle birlikte okur.
  await d.db.prisma.abonelik.update({ where: { id: ab.id }, data: { paketSurumuId: 'S-BASIC' } });
  const k = await d.kes();
  const t = d.nes.talepler.find((x) => x.harciAnahtar === 'ord-w3');
  check('W3-FIXTURE fatura BEKLIYOR iken satırın paketi Basic Mekanik oldu (eski kural kesimde onu yazardı); günlükler temiz',
    durumOnce === 'BEKLIYOR' && d.satir(ab.id).paketSurumuId === 'S-BASIC' && g.hatalar.length === 0 &&
      k.hatalar.length === 0 && d.nes.talepler.length === 1,
    `durum=${durumOnce} ${gunlukYaz(g)} ${gunlukYaz(k)}`);
  check('W3a ⭐ satır ödenen paketin ADINI tahsilat anında kopyaladı', f?.paketAdi === 'Pro Mekanik', String(f?.paketAdi));
  check('W3b ⭐ NES kalemi TAHSİLAT anındaki paketi yazar: "Pro Mekanik — Yazılım Kullanım Bedeli" (kesim anındaki Basic DEĞİL)',
    t?.kalemler[0]?.ad === 'Pro Mekanik — Yazılım Kullanım Bedeli', String(t?.kalemler[0]?.ad));
}

async function w4(): Promise<void> {
  console.log('\n── W4 · yükseltme beklerken ESKİ halkanın geç webhook\'u → ÖDENEN paket + eski halkanın fiyatı ──');
  const d = dunyaKur();
  // Basic yenilemesi 40 dk önce ESKİ halkadan (kök `sub-w4`) çekildi; webhook
  // işlenmeden müşteri Pro MEP'e yükseltti. Satır paket-degisimi "hemen"
  // dalının yazdığı biçimde (`test:paket-degisimi` S2c/S2d2/S2e/S2f): etkin
  // paket YENİ, dönemi ödenmiş paket saklı, yeni uç kodu, kök sabit, yeni
  // ücretin ilk çekimi (geçiş) dönem sonunda.
  const bas = Date.now() - 40 * DK;
  const gecis = new Date(bas + 31 * GUN);
  const ab = d.kartSatiri('F-W4', 'sub-w4-uc1', 'S-MEP', new Date(bas), {
    iyzicoKokKodu: 'sub-w4', odenenPaketSurumuId: 'S-BASIC', paketGecisTarihi: gecis,
  });
  const o = siparis({ kod: 'ord-w4', price: 899, bas, denemeler: [['SUCCESS', bas + DK]] });
  d.iyz.detaylar.set('sub-w4', iyzicoDetayi('sub-w4', 'UPGRADED', 'plan-basic', [o]));
  d.gelenWebhook('sub-w4', 'ord-w4');
  const g = await d.isle();
  const s = d.satir(ab.id);
  const olay = d.tahsilatOlayi(ab.id, 'ord-w4');
  const f = d.faturalar(ab.id)[0];
  check('W4-FIXTURE eski halka: iyzico\'ya ESKİ kod soruldu, olay guncelUcMu=false; etkin paket Pro MEP (2499) KALDI, ödenen Basic ve kilit yerinde, uç korundu; günlük temiz',
    d.iyz.sorulan.includes('sub-w4') && olay?.veri?.guncelUcMu === false && s.paketSurumuId === 'S-MEP' &&
      s.odenenPaketSurumuId === 'S-BASIC' && s.paketGecisTarihi?.getTime() === gecis.getTime() &&
      s.iyzicoAbonelikKodu === 'sub-w4-uc1' && g.hatalar.length === 0 && !!f,
    `sorulan=${d.iyz.sorulan} guncelUc=${olay?.veri?.guncelUcMu} paket=${s.paketSurumuId} ` +
      `odenen=${s.odenenPaketSurumuId} ${gunlukYaz(g)}`);
  check('W4a ⭐ fatura ÖDENEN paketi ve eski halkanın ÇEKTİĞİ tutarı yazar: Basic Mekanik, 899 (Pro MEP / 2499 DEĞİL)',
    f?.paketAdi === 'Basic Mekanik' && tl(f?.toplamTutar) === '899', `paket=${f?.paketAdi} toplam=${tl(f?.toplamTutar)}`);
  const m = d.makbuzlar();
  check('W4b ⭐ makbuz faturayla AYNI paket ve tutar: "Basic Mekanik aboneliğinizin ₺899,00" (etkin paket Pro MEP DEĞİL)',
    m.length === 1 && !!m[0].paragraflar?.[0]?.includes('Basic Mekanik aboneliğinizin ₺899,00 tutarındaki ödemesi'),
    JSON.stringify(m.map((x) => x.paragraflar?.[0])));
  const k = await d.kes();
  const t = d.nes.talepler.find((x) => x.harciAnahtar === 'ord-w4');
  check('W4c NES kalemi "Basic Mekanik — Yazılım Kullanım Bedeli", toplam 899',
    t?.kalemler[0]?.ad === 'Basic Mekanik — Yazılım Kullanım Bedeli' && t?.tahsilat?.toplam === 899 &&
      k.hatalar.length === 0,
    `${t?.kalemler[0]?.ad} ${t?.tahsilat?.toplam} ${gunlukYaz(k)}`);
}

async function w5(): Promise<void> {
  console.log('\n── W5 · yeni ucun İLK çekimi → yeni paket (kilit kalkar, "ödenen" işaretçisi silinir) ──');
  const d = dunyaKur();
  // Aynı yükseltmenin devamı: geçiş anı geldi, YENİ uç (`sub-w5-uc1`) Pro MEP
  // ücretini ilk kez çekti.
  const bas = Date.now() - 1 * SAAT;
  const ab = d.kartSatiri('F-W5', 'sub-w5-uc1', 'S-MEP', new Date(bas), {
    iyzicoKokKodu: 'sub-w5', odenenPaketSurumuId: 'S-BASIC', paketGecisTarihi: new Date(bas),
  });
  const once = { odenen: d.satir(ab.id).odenenPaketSurumuId, gecis: d.satir(ab.id).paketGecisTarihi };
  const o = siparis({ kod: 'ord-w5', price: 2499, bas, denemeler: [['SUCCESS', bas + DK]] });
  d.iyz.detaylar.set('sub-w5-uc1', iyzicoDetayi('sub-w5-uc1', 'ACTIVE', 'plan-mep', [o]));
  d.gelenWebhook('sub-w5-uc1', 'ord-w5');
  const g = await d.isle();
  const s = d.satir(ab.id);
  const olay = d.tahsilatOlayi(ab.id, 'ord-w5');
  const f = d.faturalar(ab.id)[0];
  check('W5-FIXTURE güncel uç (guncelUcMu=true); webhook ÖNCESİ "ödenen" Basic idi, SONRA kilit kalktı ve işaretçi silindi; günlük temiz',
    once.odenen === 'S-BASIC' && once.gecis instanceof Date && olay?.veri?.guncelUcMu === true &&
      s.odenenPaketSurumuId === null && s.paketGecisTarihi === null && s.paketSurumuId === 'S-MEP' &&
      g.hatalar.length === 0 && !!f,
    `once=${JSON.stringify(once)} sonra odenen=${s.odenenPaketSurumuId} gecis=${iso(s.paketGecisTarihi)} ${gunlukYaz(g)}`);
  check('W5a ⭐ fatura yeni paketi ve yeni ücreti yazar: Pro MEP, 2499 (satır kilit kalktıktan SONRA okunur)',
    f?.paketAdi === 'Pro MEP' && tl(f?.toplamTutar) === '2499', `paket=${f?.paketAdi} toplam=${tl(f?.toplamTutar)}`);
  const m = d.makbuzlar();
  check('W5b makbuz: "Pro MEP aboneliğinizin ₺2.499,00"',
    m.length === 1 && !!m[0].paragraflar?.[0]?.includes('Pro MEP aboneliğinizin ₺2.499,00 tutarındaki ödemesi'),
    JSON.stringify(m.map((x) => x.paragraflar?.[0])));
}

async function w6(): Promise<void> {
  console.log('\n── W6 · tutar YOK → fatura ve makbuz YOK, tutar uydurulmaz; gece uyarır ──');
  const d = dunyaKur();
  // 30 sa önce (webhook geç işlendi): gece mutabakatı onu "yoldaki webhook"
  // (< 2 sa, kural 7e) saymaz; ödeme günü işleme gününden FARKLI — son günü
  // "işleme anı + 7" ile hesaplayan kural takvimde ayırt edilir.
  const bas = Date.now() - 30 * SAAT;
  const ab = d.kartSatiri('F-W6', 'sub-w6', 'S-PRO', new Date(bas));
  const o = siparis({ kod: 'ord-w6', tutarYok: true, bas, denemeler: [['SUCCESS', bas + DK]] });
  d.iyz.detaylar.set('sub-w6', iyzicoDetayi('sub-w6', 'ACTIVE', 'plan-pro', [o]));
  d.gelenWebhook('sub-w6', 'ord-w6');
  const g = await d.isle();
  const olayKaydi = d.db.tablo('webhookOlayi').find((x) => x.siparisKodu === 'ord-w6');
  const s = d.satir(ab.id);
  const olay = d.tahsilatOlayi(ab.id, 'ord-w6');
  const alinmadi = (gg: Gunluk) =>
    gg.hatalar.filter((h) => h.startsWith(`FATURA KUYRUĞA ALINMADI: sipariş ord-w6 (abonelik ${ab.id})`));
  check('W6-FIXTURE siparişte ne price ne paidPrice var (currencyCode var); deneme BAŞARILI; paketin fiyatı 1649 duruyor (eski kural onu yazardı)',
    !('price' in o) && !('paidPrice' in o) && o.currencyCode === 'TRY' &&
      o.paymentAttempts[0]?.paymentStatus === 'SUCCESS' &&
      Number(d.db.tablo('paketSurumu').find((r) => r.id === 'S-PRO')?.tutar) === 1649);
  check('W6a ⭐ fatura kuyruğa ALINMADI — tutar uydurulmadı', d.faturalar(ab.id).length === 0,
    `fatura=${d.faturalar(ab.id).length}`);
  // Beklenen ödeme anı ve son gün FİKSTÜRÜN ham kaydından (başarılı denemenin
  // `createdDate`i + 7 gün) — kodun hesabından türetilmez.
  const odeme = o.paymentAttempts[0]?.createdDate ?? NaN;
  const sonGunMetni = tarihYaz(new Date(odeme + 7 * GUN));
  check('W6b ⭐ hata günlüğü: tek satır "FATURA KUYRUĞA ALINMADI: sipariş ord-w6 (abonelik …)", son düzenleme gününü söyler — başka hata yok',
    alinmadi(g).length === 1 && alinmadi(g)[0].endsWith(`son düzenleme günü ${sonGunMetni}.`) && g.hatalar.length === 1,
    gunlukYaz(g));
  const uyari = d.yoneticiUyarilari();
  check('W6c ⭐ yöneticiye (NES kanalı) TEK uyarı: firma + sipariş konuda, ödeme tarihi + SON GÜN, "NES\'te elle kesin"; müşteriye makbuz GİTMEDİ',
    uyari.length === 1 && d.giden.length === 1 && d.makbuzlar().length === 0 &&
      uyari[0].kime === 'yonetici@ornek.test' &&
      uyari[0].konu === '[MetaPriceX] Fatura kuyruğa alınamadı — tutar okunamadı — Firma F-W6 — ord-w6' &&
      !!uyari[0].paragraflar?.includes(
        `Ödeme tarihi: ${tarihYaz(new Date(odeme))} · Son düzenleme günü: ${sonGunMetni} (VUK md. 231/5)`) &&
      !!uyari[0].paragraflar?.some((p) => p.includes("NES'te elle kesin")),
    JSON.stringify(d.giden));
  check('W6d tahsilat yine DOĞRULANDI: olay işlendi (yeniden denenmez — tutar gelmez), erişim dönem sonuna uzadı, AKTIF; olayın tutarı null',
    olayKaydi?.islendi === true && olayKaydi?.hata === null && olayKaydi?.denemeSayisi === 0 &&
      s.erisimSonu.getTime() === o.endPeriod && s.durum === 'AKTIF' && olay?.veri?.tutar === null,
    `islendi=${olayKaydi?.islendi} hata=${olayKaydi?.hata} erisim=${iso(s.erisimSonu)} tutar=${olay?.veri?.tutar}`);

  // Gece (kural 7f, 28.09 kod incelemesi): oynatma tutarı getirmez — boşuna
  // ikinci "tahsilat başarılı" olayı yazar ve özete "kayıp webhook" diye
  // düşerdi. Sipariş OYNATILMAZ, her gece "elle fatura" uyarısı + özet sayacı.
  const elleUyari = `Kayıp tahsilat: abonelik ${ab.id} için 1 ödenmiş siparişin faturası YOK ve kuyruğa GİRMEYECEK: ord-w6 — elle fatura gerekir.`;
  const n1 = await d.gece();
  const oynatma = d.db.tablo('webhookOlayi').filter((x) => x.kaynak === MUTABAKAT_KAYNAGI);
  check('W6e ⭐ gece 1: OYNATMA YOK (tutar yine gelmezdi), "elle fatura" uyarısı + özet "oynatılan: 0 · elle fatura: 1"; ikinci tahsilat olayı ve yeni hata yok',
    oynatma.length === 0 && d.faturalar(ab.id).length === 0 && n1.uyarilar.includes(elleUyari) &&
      ozetSatiri(n1).includes('kayıp tahsilat yeniden oynatılan: 0') &&
      ozetSatiri(n1).endsWith('faturasız ödenmiş sipariş (elle fatura): 1') &&
      d.tahsilatOlaylari(ab.id).length === 1 && n1.hatalar.length === 0,
    `oynatma=${oynatma.length} tahsilatOlayi=${d.tahsilatOlaylari(ab.id).length} ozet="${ozetSatiri(n1)}" ${gunlukYaz(n1)}`);
  const n2 = await d.gece();
  check('W6f ⭐ gece 2 (dönem sürdükçe her gece): yine "elle fatura" + sayaç 1 — sessiz kalmaz; fatura yok, yeni posta yok',
    n2.uyarilar.includes(elleUyari) && ozetSatiri(n2).endsWith('faturasız ödenmiş sipariş (elle fatura): 1') &&
      d.faturalar(ab.id).length === 0 && d.giden.length === 1 &&
      d.db.tablo('webhookOlayi').filter((x) => x.kaynak === MUTABAKAT_KAYNAGI).length === 0,
    `ozet="${ozetSatiri(n2)}" giden=${d.giden.length} ${gunlukYaz(n2)}`);

  // Kod incelemesi 28.09: anlık deneme olayı (dunning, kart güncellenince) ile
  // iyzico'nun kendi bildirimi AYNI siparişi iki olay olarak işleyebilir.
  d.db.ekle('webhookOlayi', {
    tekilAnahtar: `${ANINDA_DENEME_KAYNAGI}:subscription.order.success:ord-w6`, kaynak: ANINDA_DENEME_KAYNAGI,
    olayTipi: 'subscription.order.success', hamGovde: {}, abonelikKodu: 'sub-w6', siparisKodu: 'ord-w6',
  });
  const g3 = await d.isle();
  const iz = d.db.tablo('abonelikOlayi').filter((x) => x.abonelikId === ab.id && x.tip === TUTAR_OKUNAMADI_OLAYI);
  // 28.09 (webhook güvenliği): ikinci olay tahsilat izinde durur — tutar
  // okunamayan siparişin uygulandığının TEK kaydı bu denetim izidir.
  const tekrar = d.db.tablo('abonelikOlayi').filter((x) => x.abonelikId === ab.id && x.tip === 'tahsilat.tekrar.yok.sayildi');
  check('W6g ikinci olay aynı siparişi TEKRAR saydı (iz: tutar-okunamadı izi): yönetici uyarısı İKİNCİ kez gitmedi, yeni tahsilat olayı yok; denetim izi TEK kayıt, sipariş + son gün taşır',
    d.yoneticiUyarilari().length === 1 && d.giden.length === 1 &&
      tekrar.length === 1 && tekrar[0].veri?.iz === 'tutar-izi' && d.tahsilatOlaylari(ab.id).length === 1 &&
      g3.hatalar.length === 0 &&
      iz.length === 1 && iz[0].veri?.siparisKodu === 'ord-w6' &&
      iz[0].veri?.sonDuzenlemeGunu === new Date(odeme + 7 * GUN).toISOString(),
    `uyari=${d.yoneticiUyarilari().length} tekrar=${JSON.stringify(tekrar.map((x) => x.veri))} ` +
      `iz=${JSON.stringify(iz.map((x) => x.veri))} ${gunlukYaz(g3)}`);

  // W6h — dunning'deki satırda tekrar KISA DEVRE YAPMAZ (ödemenin döngüyü
  // kapatıp kapatmadığını iyzico listesi söyler): eski dönem siparişinin
  // ikinci olayı uyarı yoluna kadar gider; uyarıyı sipariş başına TEK uyarı
  // kuralı keser. Sonraki dönem 9 gün önce başladı ve reddedildi.
  const d2 = dunyaKur();
  const bas2 = Date.now() - 40 * GUN;
  const sonrakiBas = bas2 + 31 * GUN;
  const ab2 = d2.kartSatiri('F-W6H', 'sub-w6h', 'S-PRO', new Date(bas2), {
    durum: 'ODEME_BEKLIYOR', ilkBasarisizlik: new Date(sonrakiBas + SAAT), denemeSayisi: 1, iyzicoDurum: 'UNPAID',
  });
  const eski = siparis({ kod: 'ord-w6h', tutarYok: true, bas: bas2, denemeler: [['SUCCESS', bas2 + DK]] });
  const red = {
    ...siparis({ kod: 'ord-w6h-ret', bas: sonrakiBas, denemeler: [['FAILURE', sonrakiBas + DK]] }), orderStatus: 'FAILED',
  };
  d2.iyz.detaylar.set('sub-w6h', iyzicoDetayi('sub-w6h', 'UNPAID', 'plan-pro', [red, eski]));
  d2.gelenWebhook('sub-w6h', 'ord-w6h');
  await d2.isle();
  d2.db.ekle('webhookOlayi', {
    tekilAnahtar: `${ANINDA_DENEME_KAYNAGI}:subscription.order.success:ord-w6h`, kaynak: ANINDA_DENEME_KAYNAGI,
    olayTipi: 'subscription.order.success', hamGovde: {}, abonelikKodu: 'sub-w6h', siparisKodu: 'ord-w6h',
  });
  const g4 = await d2.isle();
  const tekrar2 = d2.db.tablo('abonelikOlayi').filter((x) => x.abonelikId === ab2.id && x.tip === 'tahsilat.tekrar.yok.sayildi');
  check('W6h dunning\'deki satırda ikinci olay kısa devre YAPMADI (satır ODEME_BEKLIYOR kaldı — eski dönem); yönetici uyarısı yine TEK ("zaten bildirildi")',
    d2.satir(ab2.id).durum === 'ODEME_BEKLIYOR' && d2.yoneticiUyarilari().length === 1 && tekrar2.length === 0 &&
      g4.uyarilar.some((u) => u.startsWith('Tutarı okunamayan tahsilat zaten bildirildi: sipariş ord-w6h ')),
    `durum=${d2.satir(ab2.id).durum} uyari=${d2.yoneticiUyarilari().length} tekrar=${tekrar2.length} ${gunlukYaz(g4)}`);
}

async function w10(): Promise<void> {
  console.log('\n── W10 · webhook\'u KAYBOLMUŞ tutarsız sipariş, dunning\'deki satır: gece BİR KEZ oynatılır, sonra "elle fatura" ──');
  const d = dunyaKur();
  const bas = Date.now() - 30 * SAAT;
  // Erişim siparişin dönem sonundan İLERİDE (köprü / havale uzatması gibi):
  // kural 2 "uzatan" demez — kaybı yalnız kural 7 görür (26.09 ⭐ vakası).
  const ab = d.kartSatiri('F-W10', 'sub-w10', 'S-PRO', new Date(Date.now() + 200 * GUN));
  const red = { ...siparis({ kod: 'ord-w10', price: 1649, bas, denemeler: [['FAILURE', bas + DK]] }), orderStatus: 'WAITING' };
  d.iyz.detaylar.set('sub-w10', iyzicoDetayi('sub-w10', 'UNPAID', 'plan-pro', [red]));
  d.gelenWebhook('sub-w10', 'ord-w10', 'failure');
  const g0 = await d.isle();
  // Yeniden deneme 3 sa sonra TUTTU; sipariş tutar taşımıyor; başarı bildirimi HİÇ gelmedi.
  const odendi = siparis({
    kod: 'ord-w10', tutarYok: true, bas, denemeler: [['FAILURE', bas + DK], ['SUCCESS', bas + 3 * SAAT]],
  });
  d.iyz.detaylar.set('sub-w10', iyzicoDetayi('sub-w10', 'ACTIVE', 'plan-pro', [odendi]));
  const once = d.satir(ab.id);
  check('W10-FIXTURE GERÇEK ret yolu satırı dunning\'e aldı (ODEME_BEKLIYOR, ilkBasarisizlik); erişim siparişin dönem sonundan İLERİDE; başarı olayı HİÇ yok',
    once.durum === 'ODEME_BEKLIYOR' && once.ilkBasarisizlik instanceof Date &&
      once.erisimSonu.getTime() > odendi.endPeriod && g0.hatalar.length === 0 &&
      !d.db.tablo('webhookOlayi').some((x) => x.olayTipi === 'subscription.order.success'),
    `durum=${once.durum} ${gunlukYaz(g0)}`);
  const n1 = await d.gece();
  const oynatma = () => d.db.tablo('webhookOlayi').filter((x) => x.kaynak === MUTABAKAT_KAYNAGI);
  const s = d.satir(ab.id);
  const t = d.toparlandiPostalari();
  check('W10a ⭐ gece 1: tutarsız ama İŞLENMEMİŞ sipariş BİR KEZ oynatıldı — satır toparlandı (AKTIF, sayaçlar sıfır), müşteriye tutarsız "ödemeniz alındı", yöneticiye tek uyarı; fatura yok',
    oynatma().length === 1 && oynatma()[0].islendi === true && s.durum === 'AKTIF' && s.ilkBasarisizlik === null &&
      s.denemeSayisi === 0 && t.length === 1 && t[0].paragraflar?.[0] === 'Ödemeniz alındı ve hesabınız tam erişime döndü.' &&
      d.yoneticiUyarilari().length === 1 && d.faturalar(ab.id).length === 0 &&
      ozetSatiri(n1).includes('kayıp tahsilat yeniden oynatılan: 1'),
    `oynatma=${oynatma().length} durum=${s.durum} ozet="${ozetSatiri(n1)}" ${gunlukYaz(n1)}`);
  const n2 = await d.gece();
  check('W10b gece 2: olay artık İŞLENMİŞ → oynatma yok (kural 7f), "elle fatura" + özet sayacı 1; yeni posta yok',
    oynatma().length === 1 &&
      n2.uyarilar.includes(`Kayıp tahsilat: abonelik ${ab.id} için 1 ödenmiş siparişin faturası YOK ve kuyruğa GİRMEYECEK: ord-w10 — elle fatura gerekir.`) &&
      ozetSatiri(n2).endsWith('faturasız ödenmiş sipariş (elle fatura): 1') &&
      d.yoneticiUyarilari().length === 1 && d.toparlandiPostalari().length === 1,
    `oynatma=${oynatma().length} ozet="${ozetSatiri(n2)}" ${gunlukYaz(n2)}`);
}

async function w7(): Promise<void> {
  console.log('\n── W7 · dunning\'den çıkış: "ödemeniz alındı" ÇEKİLEN tutarı yazar; tutar okunamazsa UYDURMAZ ──');
  for (const tutarli of [true, false]) {
    const ek = tutarli ? '' : 'b';
    const d = dunyaKur();
    const kod = `sub-w7${ek}`;
    const sipKod = `ord-w7${ek}`;
    const bas = Date.now() - 27 * SAAT; // yenileme dün reddedildi
    const ab = d.kartSatiri(`F-W7${ek.toUpperCase()}`, kod, 'S-PRO', new Date(bas));
    // Ret anında iyzico'nun KENDİ kaydı: abonelik UNPAID, sipariş ödenmemiş —
    // `test:dunning-toparlandi` Ö ile aynı dünya (reddedilmiş denemenin değeri
    // ve başarısız siparişin biçimi ÖLÇÜLMEDİ). GERÇEK başarısızlık yolu.
    const red = { ...siparis({ kod: sipKod, price: 1499.9, bas, denemeler: [['FAILURE', bas + DK]] }), orderStatus: 'WAITING' };
    d.iyz.detaylar.set(kod, iyzicoDetayi(kod, 'UNPAID', 'plan-pro', [red]));
    d.gelenWebhook(kod, sipKod, 'failure');
    const g1 = await d.isle();
    const dunningde = d.satir(ab.id);
    const acildi = dunningde.durum === 'ODEME_BEKLIYOR' && dunningde.ilkBasarisizlik instanceof Date &&
      dunningde.denemeSayisi === 1 && d.giden.filter((p) => p.konu === 'MetaPriceX — ödemeniz alınamadı').length === 1;
    // Ertesi gün yeniden deneme TUTTU (tutarsız dünyada sipariş tutarı taşımıyor).
    const odendi = siparis({
      kod: sipKod, price: 1499.9, tutarYok: !tutarli, bas, denemeler: [['FAILURE', bas + DK], ['SUCCESS', bas + GUN + DK]],
    });
    d.iyz.detaylar.set(kod, iyzicoDetayi(kod, 'ACTIVE', 'plan-pro', [odendi]));
    d.gelenWebhook(kod, sipKod, 'success');
    const g2 = await d.isle();
    const t = d.toparlandiPostalari();
    const s = d.satir(ab.id);
    if (tutarli) {
      check('W7-FIXTURE GERÇEK ret yolu dunning\'i açtı ("alınamadı" gitti, ODEME_BEKLIYOR, deneme 1); başarı webhook\'u döngüyü kapattı (AKTIF, sayaçlar sıfır); paket 1649 ≠ sipariş 1499,90; günlükler temiz',
        acildi && s.durum === 'AKTIF' && s.ilkBasarisizlik === null && s.denemeSayisi === 0 &&
          g1.hatalar.length === 0 && g2.hatalar.length === 0 &&
          Number(d.db.tablo('paketSurumu').find((r) => r.id === 'S-PRO')?.tutar) === 1649,
        `acildi=${acildi} durum=${s.durum} ${gunlukYaz(g1)} ${gunlukYaz(g2)}`);
      check('W7a ⭐ dunning\'in "ödemeniz alındı"sı ÇEKİLEN tutarı yazar ("₺1.499,90", paket fiyatı ₺1.649,00 DEĞİL) — faturayla aynı; yenileme makbuzu ayrıca gitmez',
        t.length === 1 && t[0].paragraflar?.[0] === '₺1.499,90 tutarındaki ödemeniz alındı ve hesabınız tam erişime döndü.' &&
          tl(d.faturalar(ab.id)[0]?.toplamTutar) === '1499.9' && d.makbuzlar().length === 0,
        JSON.stringify(t.map((x) => x.paragraflar?.[0])));
    } else {
      check('W7b ⭐ tutar okunamadı: dunning e-postası yine gider (hesap açıldı) ama TUTARSIZ cümleyle — hiçbir paragrafta ₺ yok; fatura yok, yöneticiye tek uyarı',
        acildi && s.durum === 'AKTIF' && t.length === 1 &&
          t[0].paragraflar?.[0] === 'Ödemeniz alındı ve hesabınız tam erişime döndü.' &&
          !t[0].paragraflar?.some((p) => p.includes('₺')) && d.faturalar(ab.id).length === 0 &&
          d.yoneticiUyarilari().length === 1 && d.makbuzlar().length === 0,
        `${JSON.stringify(t.map((x) => x.paragraflar))} fatura=${d.faturalar(ab.id).length} ${gunlukYaz(g2)}`);
    }
  }
}

async function w8(): Promise<void> {
  console.log('\n── W8 · ödenen sürüm okunamazsa: paket adı NULL + hata günlüğü; kuyruk düşmez, kesim o anki pakete düşer ──');
  const d = dunyaKur();
  const bas = Date.now() - 2 * SAAT;
  const ab = d.kartSatiri('F-W8', 'sub-w8', 'S-PRO', new Date(bas));
  const g = await gunluguTopla(() =>
    d.faturaServisi.kuyrugaAl({
      abonelikId: ab.id, tahsilatKodu: 'ord-w8', tutar: 1649, paraBirimi: 'TRY',
      donemBasi: new Date(bas), donemSonu: new Date(bas + 31 * GUN), tahsilatTarihi: new Date(bas + DK),
      paketSurumuId: 'S-SILINMIS',
    }));
  const f = d.faturalar(ab.id)[0];
  check('W8a sürüm bulunamadı: satır YİNE kuyrukta (tahsilat bloklanmaz), paketAdi NULL, tek hata satırı "Fatura paket adı ÇIKARILAMADI: paket sürümü S-SILINMIS"',
    !!f && f.paketAdi === null && g.hatalar.length === 1 &&
      g.hatalar[0].startsWith('Fatura paket adı ÇIKARILAMADI: paket sürümü S-SILINMIS'),
    gunlukYaz(g));
  const k = await d.kes();
  const t = d.nes.talepler.find((x) => x.harciAnahtar === 'ord-w8');
  check('W8b kesim NULL paket adında ESKİ kurala düşer: aboneliğin o anki paketi ("Pro Mekanik — Yazılım Kullanım Bedeli")',
    t?.kalemler[0]?.ad === 'Pro Mekanik — Yazılım Kullanım Bedeli' && k.hatalar.length === 0,
    `${t?.kalemler[0]?.ad} ${gunlukYaz(k)}`);
}

async function w9(): Promise<void> {
  console.log('\n── W9 · fatura kalemindeki dönem İSTANBUL günüyle (konteyner UTC) ──');
  const d = dunyaKur();
  // Bugünün (henüz gelmediyse dünün) İstanbul 01:30'u = UTC'de ÖNCEKİ günün 22:30'u.
  let bas = istanbulGunSonu(new Date(Date.now() - GUN)).getTime() + 1 + 90 * DK;
  if (bas > Date.now() - DK) bas -= GUN;
  const ab = d.kartSatiri('F-W9', 'sub-w9', 'S-PRO', new Date(bas));
  const o = siparis({ kod: 'ord-w9', price: 1649, bas, denemeler: [['SUCCESS', bas + DK]] });
  d.iyz.detaylar.set('sub-w9', iyzicoDetayi('sub-w9', 'ACTIVE', 'plan-pro', [o]));
  d.gelenWebhook('sub-w9', 'ord-w9');
  const g = await d.isle();
  await d.kes();
  const t = d.nes.talepler.find((x) => x.harciAnahtar === 'ord-w9');
  // Beklenen gün BAĞIMSIZ hesapla: UTC+3 kaydırılmış anın UTC takvim günü (Intl değil).
  const gun = (ms: number) => {
    const x = new Date(ms + 3 * SAAT);
    return `${String(x.getUTCDate()).padStart(2, '0')}.${String(x.getUTCMonth() + 1).padStart(2, '0')}.${x.getUTCFullYear()}`;
  };
  check('W9-FIXTURE dönem başı İstanbul 01:30 — UTC takviminde bir ÖNCEKİ gün (UTC konteynerde saat dilimsiz biçim bir gün önce yazardı); süreç TZ=UTC; faturalandı',
    new Date(bas + 3 * SAAT).getUTCHours() === 1 && new Date(bas + 3 * SAAT).getUTCDate() !== new Date(bas).getUTCDate() &&
      new Date(0).getTimezoneOffset() === 0 && !!t && ab.id === d.faturalar(ab.id)[0]?.abonelikId && g.hatalar.length === 0,
    `bas=${iso(new Date(bas))} ${gunlukYaz(g)}`);
  check('W9 ⭐ kalem açıklaması dönemi İSTANBUL günüyle yazar',
    t?.kalemler[0]?.aciklama === `Dönem: ${gun(bas)} – ${gun(bas + 31 * GUN)}`, String(t?.kalemler[0]?.aciklama));
}

async function wBlogu(): Promise<void> {
  console.log('\n── W · webhook uçtan uca: GERÇEK işleyici + servisler + kesim turu ──');
  await w1();
  await w2();
  await w3();
  await w4();
  await w5();
  await w6();
  await w7();
  await w8();
  await w9();
  await w10();
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nFATURA DOĞRULUĞU: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  sBlogu();
  eBlogu();
  await wBlogu();
  son();
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
