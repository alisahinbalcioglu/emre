/**
 * "ÖDEMENİZ ALINDI" (TOPARLANDI) E-POSTASI  (`npm run test:dunning-toparlandi`) · 24.09.2026
 *
 * AĞ/DB/SMTP GEREKTİRMEZ. GERÇEK `WebhookIsleyici`, `AbonelikServisi`,
 * `FaturaServisi` ve `DunningServisi` bellek-Prisma üzerinde koşar. Bellek-Prisma
 * `where`i GERÇEKTEN uygular, tekillik kısıtlarını (P2002) taşır ve bilmediği
 * operatörde/anahtarda PATLAR (sessizce yok saymaz). iyzico sahtedir: yalnız
 * ABONELİK DETAYI döndürür (her çağrıda TAZE kopya), tanımlanmamış kod için
 * VARSAYILAN UYDURMAZ. Posta sahtedir: giden her iletiyi kaydeder.
 *
 * ── ÖLÇÜLEN KUSUR (24.09, DB'siz ölçüm, webhook yolu, günlükte hata YOK) ──
 * ODEME_BEKLIYOR müşterinin (ilkBasarisizlik dolu, denemeSayisi 2) başarılı
 * tahsilat webhook'u işlendiğinde "ödemeniz alındı" e-postası GİTMİYOR ve
 * `dunning.eposta.toparlandi` olayı YAZILMIYORDU. Neden: `tahsilatBasarili`
 * → `durumDegistir(..., { sayaclariSifirla: true })` ilkBasarisizlik /
 * denemeSayisi / sonDeneme / kisitlandi'yi SİLDİKTEN SONRA
 * `DunningServisi.tahsilatToparlandi` satırı YENİDEN okuyor ve "zaten
 * sorunsuz" diye dönüyordu — e-posta HİÇBİR müşteriye gidemezdi. İşleyici
 * olayın kaynağına BAKMAZ: gece mutabakatının yeniden oynatma biçimi
 * (`WebhookOlayi.kaynak = 'mutabakat'`) da aynı yoldan geçer.
 *
 * ── KURAL (tek yol, tek kural) ──
 * Döngüden çıkış SIFIRLAMANIN KENDİSİNDEN okunur: `tahsilatBasarili`
 * sayaçları KOŞULLU sıfırlar (yalnız döngüdeyse — ilkBasarisizlik dolu YA DA
 * denemeSayisi ≠ 0, kural değişmedi) ve güncellenen satır sayısını
 * `dunningdenCikti` olarak döndürür; `WebhookIsleyici.basariliTahsilat` onu
 * `tahsilatToparlandi`ya verir; dunning satırı sayaç için YENİDEN okumaz.
 * Koşullu yazma aynı olayı aynı anda işleyen iki süreçten (kuyrugaAl +
 * dakikalık tarama) yalnız BİRİNE "evet" der. Posta hatası tahsilat olayını
 * DÜŞÜRMEZ (satın alma / havale / paket değişimi postasıyla aynı kural):
 * yeniden deneme e-postayı zaten gönderemezdi (döngü izi silindi).
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   Ö  ÖLÇÜT + uçtan uca: aynı dünyada başarısızlık webhook'u "ödemeniz
 *      alınamadı"yı GÖNDERİR (posta yakalayıcısı kör değil), ardından aynı
 *      siparişin başarı webhook'u "alındı"yı — sayaçları GERÇEK yol yazar
 *   T  ölçülen vaka (ODEME_BEKLIYOR, denemeSayisi 2): tam BİR e-posta, tam BİR
 *      olay, doğru alıcı, durum geçişinden SONRA; FIXTURE: tahsilat yolu koştu
 *   K  diğer döngü hâlleri: KISITLI · ASKIDA · yalnız ilkBasarisizlik (ilk
 *      e-posta gidemedi) · yalnız denemeSayisi → her biri tam BİR
 *   N  hiç dunning'e girmemiş müşteri: AKTİF yenileme · DENEME → AKTİF ilk
 *      çekim → e-posta YOK, olay YOK (FIXTURE: tahsilat yolu yine koştu)
 *   Y  TAM BİR KEZ (sırayla): aynı sipariş aynı taramada iki kez (oynatma
 *      satırı + geç gelen gerçek webhook) + sonraki ayın yenilemesi
 *   E  TAM BİR KEZ (EŞZAMANLI): aynı olay iki süreçte aynı anda (kuyrugaAl'ın
 *      çağırdığı işleme + dakikalık tarama); iyzico gecikmeli, bellek-Prisma
 *      her işlemde makro-görev bekler → iki süreç işlem düzeyinde iç içe geçer
 *   M  `kaynak: 'mutabakat'` satırı tek başına → tam BİR (işleyici kaynağa bakmaz)
 *   H  posta HATASI: "alındı" gönderilemezse tahsilat olayı yine işlenir
 *      (yeniden deneme yok, tahsilat yolu bir kez koşar), hata günlükte görünür
 *
 * Her işleme koşumu günlüğü TOPLAR: işleyici olay hatasını yakalayıp yalnız
 * günlüğe yazar; günlük kapalıyken patlayan bir olay "e-posta yok" assert'ini
 * boşuna yeşil yapardı. Bu yüzden her senaryo olayın `islendi` olduğunu,
 * `hata` taşımadığını ve günlükte (H dışında) hata/uyarı OLMADIĞINI ölçer.
 *
 * ESKİ HÂL (düzeltme öncesi kod, 24.09 ölçüldü): N yeşil; e-posta ve olay
 * assert'leri kırmızı. Sayı KOD_HARITASI'nda.
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { WebhookIsleyici } from '../src/ozellik/odeme/webhook/webhook.isleyici';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
import { DUNNING_METINLERI } from '../src/ozellik/odeme/dunning/dunning.metinleri';
import { tekilAnahtarUret } from '../src/ozellik/odeme/iyzico/imza';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

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

// Nest günlüğü gürültüsü kapalı; DT_GUNLUK=1 ile açılır.
if (!process.env.DT_GUNLUK) Logger.overrideLogger(false);

const DK = 60_000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;

const BASARILI = 'subscription.order.success';
const BASARISIZ = 'subscription.order.failure';

// Konu satırları ürünün KENDİ şablonundan: bu kapı METNİ değil GÖNDERİMİ
// ölçer. İki konu birbirine çok benzer ("alındı" / "alınamadı") — tam eşitlik.
const SABLON_BAGLAMI = { firmaAdi: '-', paketAdi: '-', tutar: '-' };
const KONU_ALINDI = DUNNING_METINLERI.toparlandi(SABLON_BAGLAMI).konu;
const KONU_ALINAMADI = DUNNING_METINLERI.ilk(SABLON_BAGLAMI).konu;

type Gunluk = { kayitlar: string[]; uyarilar: string[]; hatalar: string[] };

/** Günlüğü TOPLAR — işleyici olay hatasını yutar, yalnız günlüğe yazar. */
async function gunluguTopla(is: () => Promise<unknown>): Promise<Gunluk> {
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
    Logger.overrideLogger(process.env.DT_GUNLUK ? new ConsoleLogger() : false);
  }
  return { kayitlar, uyarilar, hatalar };
}

const gunlukYaz = (g: Gunluk) => `hatalar=${JSON.stringify(g.hatalar)} uyarilar=${JSON.stringify(g.uyarilar)}`;
const temiz = (g: Gunluk) => g.hatalar.length === 0 && g.uyarilar.length === 0;
const iso = (t: unknown) => (t instanceof Date ? t.toISOString() : String(t));

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — ödeme kapılarındaki taklidin bu yolun dokunduğu yüzeye
//  daraltılmışı: tekillik (P2002), ilişki `select`/`include`i, orderBy/take,
//  `increment`, bilinmeyen operatörde/anahtarda PATLAR
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
};

/** Şemadaki `@unique` alanlar (yalnız bu yolun dokunduğu tablolar). */
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
    planliPaketSurumuId: null, paketGecisTarihi: null, odenenPaketSurumuId: null,
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
    // Prisma `undefined` koşulu YOK SAYAR ("eşit olsun" demez).
    if (v === undefined) continue;
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

// Her işlem (süzgeç + yazma) TEK adımda uygulanır — iki eşzamanlı süreç
// işlemler ARASINDA iç içe geçer, bir işlemin İÇİNDE geçemez (satır kilidinin
// taklidi; E bloğu buna dayanır).
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
      const artir =
        v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) &&
        Object.keys(v).length === 1 && Object.keys(v)[0] === 'increment';
      hedef[k] = artir ? (hedef[k] ?? 0) + (v as any).increment : v;
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
        // bu kapı geri açmanın atomikliğini ölçmez (onu `test:odeme-imha` ölçer).
        if (ad === '$transaction') {
          return async (is: unknown) => {
            if (typeof is === 'function') return (is as (tx: unknown) => unknown)(prisma);
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
//  SAHTE iyzico — yalnız abonelik detayı (her çağrıda TAZE kopya)
// ═════════════════════════════════════════════════════════════════════════
/**
 * @param bariyer > 0 ise `abonelikGetir` bu kadar çağrı birikene kadar YANIT
 *   VERMEZ, sonra hepsini AYNI anda bırakır: eşzamanlı süreçlerin ikisi de
 *   satırı okumuş ve ağda bekliyordur — yarış penceresinin tam modeli (E).
 *   Emniyet: 2 sn'de birikmezse yine bırakır (kapı asılı kalmaz; E-FIXTURE
 *   iki çağrının da geldiğini ayrıca ölçer).
 *   ⚠ Emniyet zamanlayıcısı `unref`li DEĞİL. Kod iki çağrıyı sıraya alırsa
 *   (ikinci süreç birincinin bitmesini bekler) bariyer hiç dolmaz ve bekleyen
 *   TEK iş bu zamanlayıcı olur. `unref`li olsaydı Node döngüyü boş sayar,
 *   kapı E bloğunda ÖZETSİZ 0 ile çıkardı. 25.09'da ölçüldü:
 *   `tekOlayIsle`ye süreç içi sıra konunca E, M ve H blokları hiç
 *   raporlanmadı. Bariyer dolunca zamanlayıcı temizlenir, bitmiş kapıyı
 *   2 sn bekletmez.
 */
function sahteIyzico(bariyer = 0) {
  const detaylar = new Map<string, unknown>();
  const sorulan: string[] = [];
  let bekleyenler: Array<() => void> = [];
  let emniyet: NodeJS.Timeout | undefined;
  const birak = () => {
    clearTimeout(emniyet);
    emniyet = undefined;
    const kuyruk = bekleyenler;
    bekleyenler = [];
    kuyruk.forEach((f) => f());
  };
  return {
    detaylar,
    sorulan,
    istemci: {
      abonelikGetir: async (kod: string) => {
        sorulan.push(kod);
        if (bariyer > 0) {
          await new Promise<void>((r) => {
            bekleyenler.push(r);
            if (bekleyenler.length >= bariyer) birak();
            else emniyet ??= setTimeout(birak, 2000);
          });
        }
        const d = detaylar.get(kod);
        if (!d) throw new Error(`sahte iyzico: ${kod} icin detay tanimlanmadi`);
        return JSON.parse(JSON.stringify(d));
      },
      tahsilatiTekrarla: async () => {
        throw new Error('sahte iyzico: bu kapida yeniden tahsilat DENENMEZ');
      },
    } as any,
  };
}

/**
 * Sipariş — 20.08 sandbox tutanağındaki biçim (docs/adim0-tutanak/adim0-cikti.json):
 * epoch-ms SAYI `startPeriod`/`endPeriod`, `orderStatus`,
 * `paymentAttempts[].paymentStatus`. `paidPrice` tutanakta YOK — konmadı
 * (işleyici faturayı paket tutarından yazar).
 */
function siparis(kod: string, bas: number, son: number, denemeler: string[] = ['SUCCESS'], durum = 'SUCCESS') {
  return {
    referenceCode: kod,
    price: 1649,
    currencyCode: 'TRY',
    startPeriod: bas,
    endPeriod: son,
    orderStatus: durum,
    paymentAttempts: denemeler.map((s, i) => ({
      conversationId: `conv-${kod}-${i}`,
      createdDate: bas + i * GUN + DK,
      paymentId: 37_387_490 + i,
      paymentStatus: s,
    })),
  };
}

/** Abonelik detayı — yalnız tahsilat yolunun okuduğu alanlar. */
function iyzicoDetayi(kod: string, siparisler: unknown[], durum = 'ACTIVE') {
  return {
    referenceCode: kod,
    pricingPlanReferenceCode: 'plan-30',
    customerReferenceCode: `cus-${kod}`,
    subscriptionStatus: durum,
    orders: siparisler,
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  DÜNYA — her senaryo TAZE dünya kurar
// ═════════════════════════════════════════════════════════════════════════
const MUHASEBE_YASAK = {
  // Bu kapı faturanın KUYRUĞA alındığını ölçer; kesim (muhasebe) ÇAĞRILMAZ.
  faturaKes: async () => {
    throw new Error('bu kapida fatura KESILMEZ');
  },
} as any;

interface Giden {
  kime: string;
  konu: string;
}

/**
 * @param p.bariyer   iyzico bariyeri (bkz. `sahteIyzico`)
 * @param p.postaReddi konu için `true` dönerse posta sunucusu REDDEDER
 *   (`EpostaServisi.gonder` gönderim hatasında fırlatır — aynı sözleşme)
 */
function dunyaKur(p: { bariyer?: number; postaReddi?: (konu: string) => boolean } = {}) {
  const db = bellekPrisma();
  const iyz = sahteIyzico(p.bariyer ?? 0);
  const giden: Giden[] = [];
  const reddedilen: Giden[] = [];
  const posta = {
    gonder: async (t: Giden) => {
      if (p.postaReddi?.(t.konu)) {
        reddedilen.push({ kime: t.kime, konu: t.konu });
        throw new Error('sahte SMTP: 421 4.3.2 hizmet gecici olarak kullanilamiyor');
      }
      giden.push({ kime: t.kime, konu: t.konu });
    },
  } as any;
  db.ekle('paket', { id: 'P1', kod: 'pro-mek', ad: 'Pro Mekanik', kullaniciHakki: 2, dwgAktif: true });
  db.ekle('paketSurumu', {
    id: 'S30', paketId: 'P1', surumNo: 1, periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 30,
    tutar: 1649, paraBirimi: 'TRY', iyzicoPlanKodu: 'plan-30', iyzicoDenemesizPlanKodu: 'plan-30-denemesiz',
    satistaMi: true,
  });
  const config = new ConfigService({ UYGULAMA_URL: 'https://ornek.test' });
  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci);
  const fatura = new FaturaServisi(db.prisma, MUHASEBE_YASAK, posta);
  const dunning = new DunningServisi(db.prisma, iyz.istemci, abonelik, posta, config);
  const isleyici = new WebhookIsleyici(db.prisma, abonelik, fatura, dunning);

  /** Kart aboneliği satırı + fatura kimliği tam firma (limited şirket). */
  function kartSatiri(firmaId: string, kod: string, alanlar: Satir): Satir {
    db.ekle('firma', {
      id: firmaId, ad: `Firma ${firmaId}`, unvan: `${firmaId} Tesisat Ltd. Şti.`, vergiNo: '1234567890',
      vergiDairesi: 'Kadıköy', tcKimlikNo: null, faturaAdresi: 'Moda Cad. 1', il: 'İstanbul',
      ilce: 'Kadıköy', faturaEposta: `muhasebe@${firmaId.toLowerCase()}.test`,
      yetkiliEposta: `sahip@${firmaId.toLowerCase()}.test`, imhaTarihi: null,
    });
    return db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S30', odemeYontemi: 'KART', iyzicoAbonelikKodu: kod,
      iyzicoKokKodu: kod, iyzicoMusteriKodu: `cus-${kod}`, iyzicoDurum: 'ACTIVE',
      iyzicoSonKontrol: new Date(Date.now() - GUN), ...alanlar,
    });
  }

  /**
   * Webhook olayı — controller'ın yazdığı biçim (`webhook.controller.ts`
   * `hamKaydet`, tekil anahtar GERÇEK `tekilAnahtarUret`ten). `kaynak:
   * 'mutabakat'` = gece mutabakatının yeniden oynattığı kayıp webhook: tekil
   * anahtarı `mutabakat:<tip>:<sipariş>`, imzasız; işleyici `kaynak`a BAKMAZ.
   */
  function olay(tip: string, kod: string, siparisKodu: string, p: { alindi: number; kaynak?: 'iyzico' | 'mutabakat' }) {
    const kaynak = p.kaynak ?? 'iyzico';
    const iyziReferenceCode = `iyz-${siparisKodu}-${tip === BASARILI ? 'b' : 'f'}`;
    return db.ekle('webhookOlayi', {
      tekilAnahtar: kaynak === 'mutabakat'
        ? `mutabakat:${tip}:${siparisKodu}`
        : tekilAnahtarUret({ iyziEventType: tip, iyziReferenceCode } as any),
      kaynak,
      olayTipi: tip,
      hamGovde: { iyziEventType: tip, subscriptionReferenceCode: kod, orderReferenceCode: siparisKodu },
      abonelikKodu: kod,
      siparisKodu,
      musteriKodu: `cus-${kod}`,
      iyzicoRefKodu: kaynak === 'mutabakat' ? null : iyziReferenceCode,
      alindi: new Date(p.alindi),
    });
  }

  /** Dakikalık tarama (`@Cron`) — işlenmemiş TÜM olaylar, `alindi` sırasıyla. */
  const isle = () => gunluguTopla(() => isleyici.bekleyenleriIsle());

  const alindiPostasi = (kime?: string) =>
    giden.filter((g) => g.konu === KONU_ALINDI && (kime === undefined || g.kime === kime));
  const olaylar = (abonelikId: string, tip: string) =>
    db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && o.tip === tip);
  const dunningOlaylari = (abonelikId: string) =>
    db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && String(o.tip).startsWith('dunning.'));
  const faturalar = (abonelikId: string) => db.tablo('fatura').filter((f) => f.abonelikId === abonelikId);
  /** Olay işlendi ve hata taşımıyor (yutulmuş hata "e-posta yok"u boşuna yeşil yapardı). */
  const olayTemiz = (o: Satir) => o.islendi === true && o.hata === null && o.denemeSayisi === 0;

  return {
    db, iyz, giden, reddedilen, isleyici, kartSatiri, olay, isle, alindiPostasi, olaylar, dunningOlaylari,
    faturalar, olayTemiz,
  };
}

type Dunya = ReturnType<typeof dunyaKur>;

const faturaEposta = (firmaId: string) => `muhasebe@${firmaId.toLowerCase()}.test`;

/** Ortak FIXTURE kanıtı: başarı webhook'u tahsilat yolunu GERÇEKTEN koştu. */
function tahsilatKostu(d: Dunya, ab: Satir, siparisKodu: string, yeniSon: number): boolean {
  return (
    ab.durum === 'AKTIF' &&
    ab.erisimSonu instanceof Date &&
    ab.erisimSonu.getTime() === yeniSon &&
    d.faturalar(ab.id).some((f) => f.tahsilatKodu === siparisKodu)
  );
}

const sayaclarSifir = (ab: Satir) =>
  ab.ilkBasarisizlik === null && ab.denemeSayisi === 0 && ab.sonDeneme === null && ab.kisitlandi === null;

const sayacYaz = (ab: Satir) =>
  `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} deneme=${ab.denemeSayisi} kisit=${iso(ab.kisitlandi)} erisimSonu=${iso(ab.erisimSonu)}`;

// ═════════════════════════════════════════════════════════════════════════
//  Ö — ÖLÇÜT + UÇTAN UCA: sayaçları GERÇEK başarısızlık yolu yazar
// ═════════════════════════════════════════════════════════════════════════
async function oBlogu(): Promise<void> {
  console.log('\n── Ö · ölçüt + uçtan uca: başarısızlık webhook\'u "alınamadı", aynı siparişin başarısı "alındı" ──');
  check('Ö-OLCUT iki konu satırı birbirinden FARKLI (sayım tam eşitlikle yapılır)',
    KONU_ALINDI !== KONU_ALINAMADI && KONU_ALINDI.length > 0, `alindi="${KONU_ALINDI}" alinamadi="${KONU_ALINAMADI}"`);

  const d = dunyaKur();
  const simdi = Date.now();
  const donemBasi = simdi - 3 * GUN; // yenileme çekimi 3 gün önce reddedildi
  const yeniSon = donemBasi + 30 * GUN;
  const ab = d.kartSatiri('F-O', 'sub-o', { durum: 'AKTIF', erisimSonu: new Date(donemBasi) });
  // Ret anında iyzico'nun KENDİ kaydı: abonelik UNPAID (belgelenmiş durum),
  // sipariş ödenmemiş (reddedilmiş denemenin değeri ve başarısız siparişin
  // biçimi ölçülmedi — ödenmemiş olması yeter). Başarısızlık bildiriminin
  // kanıtı budur; iyzico'ya soran bir işleyici de aynı dünyayı görür.
  d.iyz.detaylar.set('sub-o', iyzicoDetayi('sub-o', [
    siparis('ord-o2', donemBasi, yeniSon, ['FAILURE'], 'WAITING'),
    siparis('ord-o1', donemBasi - 30 * GUN, donemBasi),
  ], 'UNPAID'));

  const f1 = d.olay(BASARISIZ, 'sub-o', 'ord-o2', { alindi: donemBasi + DK });
  const g1 = await d.isle();
  check('Ö1 ⭐ ÖLÇÜT: başarısızlık webhook\'u bu dünyada "ödemeniz alınamadı"yı faturalama adresine GÖNDERDİ (yakalayıcı kör değil)',
    d.giden.length === 1 && d.giden[0].konu === KONU_ALINAMADI && d.giden[0].kime === faturaEposta('F-O'),
    `giden=${JSON.stringify(d.giden)} ${gunlukYaz(g1)}`);
  check('Ö2 FIXTURE: GERÇEK yol döngüyü açtı — ODEME_BEKLIYOR, ilkBasarisizlik dolu, denemeSayisi 1; olay hatasız',
    ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik instanceof Date && ab.denemeSayisi === 1 &&
      d.olayTemiz(f1) && g1.hatalar.length === 0,
    `${sayacYaz(ab)} olay=${JSON.stringify({ i: f1.islendi, h: f1.hata })} ${gunlukYaz(g1)}`);

  // Aynı sipariş yeniden denendi ve tuttu (dunning `tahsilatiTekrarla`): iyzico
  // listesinde sipariş SUCCESS, önceki denemeler reddedilmiş.
  d.iyz.detaylar.set('sub-o', iyzicoDetayi('sub-o', [
    siparis('ord-o2', donemBasi, yeniSon, ['FAILURE', 'SUCCESS']),
    siparis('ord-o1', donemBasi - 30 * GUN, donemBasi),
  ]));
  const b1 = d.olay(BASARILI, 'sub-o', 'ord-o2', { alindi: simdi - DK });
  const g2 = await d.isle();
  check('Ö3 FIXTURE: başarı webhook\'u tahsilat yolunu koştu (AKTIF, dönem sonu, fatura), günlük temiz',
    tahsilatKostu(d, ab, 'ord-o2', yeniSon) && d.olayTemiz(b1) && temiz(g2),
    `${sayacYaz(ab)} ${gunlukYaz(g2)}`);
  check('Ö4 ⭐⭐ "ödemeniz alındı" faturalama adresine TAM BİR KEZ gitti',
    d.alindiPostasi(faturaEposta('F-O')).length === 1 && d.alindiPostasi().length === 1,
    `giden=${JSON.stringify(d.giden)}`);
  check('Ö5 ⭐ posta sırası: önce "alınamadı", sonra "alındı" — başka ileti yok',
    d.giden.length === 2 && d.giden[0].konu === KONU_ALINAMADI && d.giden[1].konu === KONU_ALINDI,
    `giden=${JSON.stringify(d.giden.map((g) => g.konu))}`);
  check('Ö6 dunning olay izi: dunning.eposta.ilk 1 + dunning.eposta.toparlandi 1',
    d.olaylar(ab.id, 'dunning.eposta.ilk').length === 1 && d.olaylar(ab.id, 'dunning.eposta.toparlandi').length === 1,
    `dunning=${d.dunningOlaylari(ab.id).map((o) => o.tip)}`);
  check('Ö7 döngü kapandı: sayaçlar sıfır', sayaclarSifir(ab), sayacYaz(ab));
}

// ═════════════════════════════════════════════════════════════════════════
//  T — ÖLÇÜLEN VAKA: ODEME_BEKLIYOR, ilkBasarisizlik dolu, denemeSayisi 2
// ═════════════════════════════════════════════════════════════════════════
async function tBlogu(): Promise<void> {
  console.log('\n── T · ölçülen vaka: ödeme bekleyen (deneme 2) müşterinin başarı webhook\'u ──');
  const d = dunyaKur();
  const simdi = Date.now();
  const donemBasi = simdi - 4 * GUN; // yenileme 4 gün önce reddedildi, 3. gün yeniden denendi
  const yeniSon = donemBasi + 30 * GUN;
  const ab = d.kartSatiri('F-T', 'sub-t', {
    durum: 'ODEME_BEKLIYOR', erisimSonu: new Date(donemBasi), iyzicoDurum: 'UNPAID',
    ilkBasarisizlik: new Date(donemBasi), sonDeneme: new Date(simdi - GUN), denemeSayisi: 2,
  });
  d.iyz.detaylar.set('sub-t', iyzicoDetayi('sub-t', [
    siparis('ord-t2', donemBasi, yeniSon, ['FAILURE', 'FAILURE', 'SUCCESS']),
    siparis('ord-t1', donemBasi - 30 * GUN, donemBasi),
  ]));
  const b = d.olay(BASARILI, 'sub-t', 'ord-t2', { alindi: simdi - DK });
  const g = await d.isle();

  check('T-FIXTURE tahsilat yolu koştu: AKTIF, erisimSonu = siparişin dönem sonu, fatura kuyrukta; olay hatasız, günlük temiz',
    tahsilatKostu(d, ab, 'ord-t2', yeniSon) && d.olayTemiz(b) && temiz(g),
    `${sayacYaz(ab)} olay=${JSON.stringify({ i: b.islendi, h: b.hata, n: b.denemeSayisi })} ${gunlukYaz(g)}`);
  check('T1 ⭐⭐ "ödemeniz alındı" TAM BİR KEZ gönderildi (eski hâlde 0)',
    d.alindiPostasi().length === 1, `giden=${JSON.stringify(d.giden)}`);
  check('T2 ⭐ alıcı firmanın faturalama adresi; başka ileti yok',
    d.giden.length === 1 && d.giden[0].kime === faturaEposta('F-T'), `giden=${JSON.stringify(d.giden)}`);
  const iz = d.olaylar(ab.id, 'dunning.eposta.toparlandi');
  check('T3 ⭐ AbonelikOlayi dunning.eposta.toparlandi TAM BİR (alıcı veride)',
    iz.length === 1 && iz[0].veri?.kime === faturaEposta('F-T') && iz[0].aktor === 'dunning',
    `olaylar=${JSON.stringify(iz.map((o) => ({ tip: o.tip, veri: o.veri })))}`);
  const tumu = d.db.tablo('abonelikOlayi').filter((o) => o.abonelikId === ab.id);
  const gecis = tumu.findIndex((o) => o.tip === 'durum.degisti' && o.oncekiDurum === 'ODEME_BEKLIYOR' && o.yeniDurum === 'AKTIF');
  const eposta = tumu.findIndex((o) => o.tip === 'dunning.eposta.toparlandi');
  check('T4 sıra: e-posta izi ODEME_BEKLIYOR → AKTIF geçişinden SONRA (ödeme doğrulanmadan "alındı" denmez)',
    gecis >= 0 && eposta > gecis, `sira=${tumu.map((o) => o.tip)}`);
  check('T5 döngü kapandı: ilkBasarisizlik / denemeSayisi / sonDeneme / kisitlandi sıfır', sayaclarSifir(ab), sayacYaz(ab));
}

// ═════════════════════════════════════════════════════════════════════════
//  K — DİĞER DÖNGÜ HÂLLERİ
// ═════════════════════════════════════════════════════════════════════════
async function kBlogu(): Promise<void> {
  console.log('\n── K · diğer döngü hâlleri: KISITLI · ASKIDA · yalnız ilkBasarisizlik · yalnız denemeSayisi ──');
  const simdi = Date.now();
  const durumlar: Array<{
    ad: string;
    firma: string;
    alanlar: (donemBasi: number) => Satir;
    gecen: number;
    /** Ödenen siparişin dönemi — varsayılan reddedilen dönem (yeniden deneme tuttu). */
    odenenBasi?: (donemBasi: number) => number;
  }> = [
    {
      ad: 'K1 KISITLI (10. gün kısıtlandı, deneme 4)', firma: 'F-K1', gecen: 12,
      alanlar: (t) => ({
        durum: 'KISITLI', ilkBasarisizlik: new Date(t), kisitlandi: new Date(t + 10 * GUN),
        sonDeneme: new Date(t + 10 * GUN), denemeSayisi: 4, iyzicoDurum: 'UNPAID',
      }),
    },
    {
      // Askıdaki müşteri kartını güncelledi; tutan çekim GÜNCEL dönemin
      // siparişi (reddedilen dönem 5 gün önce bitti).
      ad: 'K2 ASKIDA (30. gün askıya alındı, deneme 6)', firma: 'F-K2', gecen: 35,
      alanlar: (t) => ({
        durum: 'ASKIDA', ilkBasarisizlik: new Date(t), kisitlandi: new Date(t + 10 * GUN),
        sonDeneme: new Date(t + 30 * GUN), denemeSayisi: 6, iyzicoDurum: 'UNPAID',
      }),
      odenenBasi: (t) => t + 30 * GUN,
    },
    {
      // "alınamadı" iletisi GİDEMEDİ (SMTP hatası → ilkBildirim sayacı yazmaz).
      ad: 'K3 yalnız ilkBasarisizlik (ilk ileti gidemedi, deneme 0)', firma: 'F-K3', gecen: 1,
      alanlar: (t) => ({
        durum: 'ODEME_BEKLIYOR', ilkBasarisizlik: new Date(t), sonDeneme: new Date(t),
        denemeSayisi: 0, iyzicoDurum: 'UNPAID',
      }),
    },
    {
      // Bugün hiçbir yazıcı bu hâli ÜRETMEZ (başarı webhook'u ilkBildirim'in iki
      // adımı arasına düşerse doğar); kural "ilkBasarisizlik YA DA deneme ≠ 0"
      // değişmeden taşındığı için ölçülür.
      ad: 'K4 yalnız denemeSayisi (ilkBasarisizlik boş, deneme 1)', firma: 'F-K4', gecen: 2,
      alanlar: () => ({ durum: 'ODEME_BEKLIYOR', ilkBasarisizlik: null, denemeSayisi: 1, iyzicoDurum: 'UNPAID' }),
    },
  ];
  for (const k of durumlar) {
    const d = dunyaKur();
    const kod = `sub-${k.firma.toLowerCase()}`;
    const donemBasi = simdi - k.gecen * GUN;
    const odenenBasi = k.odenenBasi?.(donemBasi) ?? donemBasi;
    const yeniSon = odenenBasi + 30 * GUN;
    const ab = d.kartSatiri(k.firma, kod, { erisimSonu: new Date(donemBasi), ...k.alanlar(donemBasi) });
    d.iyz.detaylar.set(kod, iyzicoDetayi(kod, [siparis(`ord-${k.firma}`, odenenBasi, yeniSon, ['FAILURE', 'SUCCESS'])]));
    const b = d.olay(BASARILI, kod, `ord-${k.firma}`, { alindi: simdi - DK });
    const g = await d.isle();
    check(`${k.ad}: FIXTURE tahsilat yolu koştu, günlük temiz`,
      tahsilatKostu(d, ab, `ord-${k.firma}`, yeniSon) && d.olayTemiz(b) && temiz(g), `${sayacYaz(ab)} ${gunlukYaz(g)}`);
    check(`${k.ad}: ⭐ "ödemeniz alındı" TAM BİR (e-posta + olay), sayaçlar sıfır`,
      d.alindiPostasi(faturaEposta(k.firma)).length === 1 && d.giden.length === 1 &&
        d.olaylar(ab.id, 'dunning.eposta.toparlandi').length === 1 && sayaclarSifir(ab),
      `giden=${JSON.stringify(d.giden)} ${sayacYaz(ab)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  N — HİÇ DUNNING'E GİRMEMİŞ MÜŞTERİ
// ═════════════════════════════════════════════════════════════════════════
async function nBlogu(): Promise<void> {
  console.log('\n── N · hiç dunning\'e girmemiş müşteri: "alındı" GİTMEZ ──');
  const simdi = Date.now();

  // N1 — olağan AKTİF yenileme: dönem 8 saat önce bitti, çekim tuttu.
  {
    const d = dunyaKur();
    const eskiSon = simdi - 8 * SAAT;
    const yeniSon = eskiSon + 30 * GUN;
    const ab = d.kartSatiri('F-N1', 'sub-n1', { durum: 'AKTIF', erisimSonu: new Date(eskiSon) });
    d.iyz.detaylar.set('sub-n1', iyzicoDetayi('sub-n1', [
      siparis('ord-n1b', eskiSon, yeniSon),
      siparis('ord-n1a', eskiSon - 30 * GUN, eskiSon),
    ]));
    const b = d.olay(BASARILI, 'sub-n1', 'ord-n1b', { alindi: simdi - DK });
    const g = await d.isle();
    check('N1-FIXTURE AKTİF yenileme: tahsilat yolu koştu (erisimSonu uzadı, fatura), günlük temiz',
      tahsilatKostu(d, ab, 'ord-n1b', yeniSon) && d.olayTemiz(b) && temiz(g), `${sayacYaz(ab)} ${gunlukYaz(g)}`);
    check('N1 ⭐ AKTİF yenilemede HİÇ ileti yok, dunning olayı yok',
      d.giden.length === 0 && d.dunningOlaylari(ab.id).length === 0,
      `giden=${JSON.stringify(d.giden)} dunning=${d.dunningOlaylari(ab.id).map((o) => o.tip)}`);
  }

  // N2 — deneme sonu İLK çekim: DENEME → AKTİF.
  {
    const d = dunyaKur();
    const cekim = simdi - 2 * SAAT;
    const yeniSon = cekim + 30 * GUN;
    const ab = d.kartSatiri('F-N2', 'sub-n2', {
      durum: 'DENEME', denemeSonu: new Date(cekim), erisimSonu: new Date(cekim + 2 * GUN),
    });
    d.iyz.detaylar.set('sub-n2', iyzicoDetayi('sub-n2', [siparis('ord-n2', cekim, yeniSon)]));
    const b = d.olay(BASARILI, 'sub-n2', 'ord-n2', { alindi: simdi - DK });
    const g = await d.isle();
    check('N2-FIXTURE DENEME → AKTİF ilk çekim: tahsilat yolu koştu, günlük temiz',
      tahsilatKostu(d, ab, 'ord-n2', yeniSon) && d.olayTemiz(b) && temiz(g), `${sayacYaz(ab)} ${gunlukYaz(g)}`);
    check('N2 ⭐ deneme sonrası ilk çekimde "alındı" YOK, dunning olayı yok',
      d.giden.length === 0 && d.dunningOlaylari(ab.id).length === 0,
      `giden=${JSON.stringify(d.giden)} dunning=${d.dunningOlaylari(ab.id).map((o) => o.tip)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  Y — TAM BİR KEZ: aynı sipariş iki kez + sonraki ayın yenilemesi
// ═════════════════════════════════════════════════════════════════════════
async function yBlogu(): Promise<void> {
  console.log('\n── Y · tam bir kez: aynı sipariş aynı taramada iki kez, sonra olağan yenileme ──');
  const d = dunyaKur();
  const simdi = Date.now();
  const donemBasi = simdi - 5 * GUN;
  const yeniSon = donemBasi + 30 * GUN;
  const ab = d.kartSatiri('F-Y', 'sub-y', {
    durum: 'ODEME_BEKLIYOR', erisimSonu: new Date(donemBasi), iyzicoDurum: 'UNPAID',
    ilkBasarisizlik: new Date(donemBasi), sonDeneme: new Date(simdi - 2 * GUN), denemeSayisi: 2,
  });
  d.iyz.detaylar.set('sub-y', iyzicoDetayi('sub-y', [
    siparis('ord-y2', donemBasi, yeniSon, ['FAILURE', 'SUCCESS']),
  ]));
  // Gece mutabakatı kaybolmuş sanıp oynattı; iyzico'nun gecikmiş gerçek
  // webhook'u da ardından geldi. İkisi AYNI taramada, sırayla işlenir.
  const oynatma = d.olay(BASARILI, 'sub-y', 'ord-y2', { alindi: simdi - 2 * DK, kaynak: 'mutabakat' });
  const gercek = d.olay(BASARILI, 'sub-y', 'ord-y2', { alindi: simdi - DK });
  const g1 = await d.isle();
  check('Y-FIXTURE iki olay ayrı satır (tekil anahtar farklı), ikisi de hatasız işlendi, günlük temiz',
    oynatma.tekilAnahtar !== gercek.tekilAnahtar && d.olayTemiz(oynatma) && d.olayTemiz(gercek) &&
      tahsilatKostu(d, ab, 'ord-y2', yeniSon) && temiz(g1),
    `${sayacYaz(ab)} ${gunlukYaz(g1)}`);
  check('Y1 ⭐⭐ aynı siparişin İKİ olayı → "alındı" TAM BİR (e-posta + olay)',
    d.alindiPostasi().length === 1 && d.olaylar(ab.id, 'dunning.eposta.toparlandi').length === 1,
    `giden=${JSON.stringify(d.giden)}`);

  // Bir ay sonra olağan yenileme: müşteri artık döngüde DEĞİL.
  const sonrakiSon = yeniSon + 30 * GUN;
  d.iyz.detaylar.set('sub-y', iyzicoDetayi('sub-y', [
    siparis('ord-y3', yeniSon, sonrakiSon),
    siparis('ord-y2', donemBasi, yeniSon, ['FAILURE', 'SUCCESS']),
  ]));
  const sonraki = d.olay(BASARILI, 'sub-y', 'ord-y3', { alindi: simdi });
  const g2 = await d.isle();
  check('Y2-FIXTURE sonraki ayın yenilemesi koştu (erisimSonu yeni dönem sonu, fatura), günlük temiz',
    tahsilatKostu(d, ab, 'ord-y3', sonrakiSon) && d.olayTemiz(sonraki) && temiz(g2), `${sayacYaz(ab)} ${gunlukYaz(g2)}`);
  check('Y2 ⭐ olağan yenilemede ikinci "alındı" YOK — toplam hâlâ BİR, başka ileti yok',
    d.alindiPostasi().length === 1 && d.giden.length === 1 && d.olaylar(ab.id, 'dunning.eposta.toparlandi').length === 1,
    `giden=${JSON.stringify(d.giden)}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  E — TAM BİR KEZ, EŞZAMANLI: aynı olay iki süreçte aynı anda
// ═════════════════════════════════════════════════════════════════════════
async function eBlogu(): Promise<void> {
  console.log('\n── E · tam bir kez (eşzamanlı): aynı olay kuyrugaAl + dakikalık taramada aynı anda ──');
  // Üretimdeki yarış: controller olayı yazıp `kuyrugaAl` ile işlemeye başlar;
  // dakikalık tarama o sırada koşarsa olay hâlâ `islendi: false` olduğu için
  // AYNI olayı ikinci kez alır (`calisiyor` yalnız taramayı korur). Bariyer
  // iki süreci iyzico isteğinde buluşturur: ikisi de satırı okumuştur.
  const d = dunyaKur({ bariyer: 2 });
  const simdi = Date.now();
  const donemBasi = simdi - 4 * GUN;
  const yeniSon = donemBasi + 30 * GUN;
  const ab = d.kartSatiri('F-E', 'sub-e', {
    durum: 'ODEME_BEKLIYOR', erisimSonu: new Date(donemBasi), iyzicoDurum: 'UNPAID',
    ilkBasarisizlik: new Date(donemBasi), sonDeneme: new Date(simdi - GUN), denemeSayisi: 2,
  });
  d.iyz.detaylar.set('sub-e', iyzicoDetayi('sub-e', [
    siparis('ord-e2', donemBasi, yeniSon, ['FAILURE', 'SUCCESS']),
  ]));
  const b = d.olay(BASARILI, 'sub-e', 'ord-e2', { alindi: simdi - DK });
  // `kuyrugaAl` = setImmediate(() => tekOlayIsle(id)); zamanlayıcıyı değil
  // işlemenin KENDİSİNİ çağırıyoruz ki iki süreç de beklenebilsin.
  // ⚠ 25.09: `tekOlayIsle` artık SÜREÇ İÇİ olay kilidi taşır (aynı süreçte
  // ikinci çağrı hemen döner — `test:musteri-epostalari` Ö9). İki AYRI süreç
  // bu bellek içi kilidi paylaşmaz: burada ölçülen tolerans (koşullu
  // sıfırlama) çok süreçli kurulumun güvencesidir, o yüzden ikinci "süreç"
  // kilidin ALTINDAKİ işlemeyi çağırır.
  const kuyruktan = (d.isleyici as any).tekOlayIsleKilitli.bind(d.isleyici) as (id: string) => Promise<void>;
  const g = await gunluguTopla(() => Promise.all([kuyruktan(b.id), d.isleyici.bekleyenleriIsle()]));

  check('E-FIXTURE yarış GERÇEKTEN koştu: iki süreç de tahsilat yolunda iyzico\'ya sordu; AKTIF, dönem sonu, TEK fatura; olay hatasız, günlük temiz',
    d.iyz.sorulan.filter((k) => k === 'sub-e').length === 2 && tahsilatKostu(d, ab, 'ord-e2', yeniSon) &&
      d.faturalar(ab.id).length === 1 && d.olayTemiz(b) && temiz(g),
    `sorulan=${JSON.stringify(d.iyz.sorulan)} fatura=${d.faturalar(ab.id).length} ${sayacYaz(ab)} ${gunlukYaz(g)}`);
  check('E1 ⭐⭐ aynı olay iki süreçte aynı anda işlendi → "alındı" TAM BİR (e-posta + olay)',
    d.alindiPostasi(faturaEposta('F-E')).length === 1 && d.giden.length === 1 &&
      d.olaylar(ab.id, 'dunning.eposta.toparlandi').length === 1,
    `giden=${JSON.stringify(d.giden)} olay=${d.olaylar(ab.id, 'dunning.eposta.toparlandi').length}`);
  check('E2 döngü kapandı: sayaçlar sıfır', sayaclarSifir(ab), sayacYaz(ab));
}

// ═════════════════════════════════════════════════════════════════════════
//  H — POSTA HATASI tahsilat olayını düşürmez
// ═════════════════════════════════════════════════════════════════════════
async function hBlogu(): Promise<void> {
  console.log('\n── H · posta sunucusu "alındı"yı reddeder: tahsilat olayı yine işlenir ──');
  const d = dunyaKur({ postaReddi: (konu) => konu === KONU_ALINDI });
  const simdi = Date.now();
  const donemBasi = simdi - 4 * GUN;
  const yeniSon = donemBasi + 30 * GUN;
  const ab = d.kartSatiri('F-H', 'sub-h', {
    durum: 'ODEME_BEKLIYOR', erisimSonu: new Date(donemBasi), iyzicoDurum: 'UNPAID',
    ilkBasarisizlik: new Date(donemBasi), sonDeneme: new Date(simdi - GUN), denemeSayisi: 2,
  });
  d.iyz.detaylar.set('sub-h', iyzicoDetayi('sub-h', [
    siparis('ord-h2', donemBasi, yeniSon, ['FAILURE', 'SUCCESS']),
  ]));
  const b = d.olay(BASARILI, 'sub-h', 'ord-h2', { alindi: simdi - DK });
  const g = await d.isle();

  check('H-FIXTURE "alındı" GERÇEKTEN denendi ve posta sunucusu reddetti (karar doğru verildi)',
    d.reddedilen.length === 1 && d.reddedilen[0].konu === KONU_ALINDI && d.reddedilen[0].kime === faturaEposta('F-H'),
    `reddedilen=${JSON.stringify(d.reddedilen)}`);
  check('H1 ⭐⭐ tahsilat olayı yine İŞLENDİ: hata yok, yeniden deneme yok; AKTIF, dönem sonu, fatura kuyrukta',
    d.olayTemiz(b) && tahsilatKostu(d, ab, 'ord-h2', yeniSon),
    `olay=${JSON.stringify({ i: b.islendi, h: b.hata, n: b.denemeSayisi })} ${sayacYaz(ab)}`);
  check('H2 ⭐ hata SESSİZ değil: günlükte tam bir hata satırı (abonelik kimliğiyle), uyarı yok',
    g.hatalar.length === 1 && g.hatalar[0].includes('gönderilemedi') && g.hatalar[0].includes(ab.id) &&
      g.uyarilar.length === 0,
    gunlukYaz(g));
  check('H3 gönderilmeyen ileti gönderilmiş SAYILMAZ: "alındı" yok, dunning.eposta.toparlandi izi yok',
    d.alindiPostasi().length === 0 && d.olaylar(ab.id, 'dunning.eposta.toparlandi').length === 0,
    `giden=${JSON.stringify(d.giden)}`);
  const g2 = await d.isle();
  check('H4 sonraki tarama tahsilat yolunu YENİDEN koşmaz (iyzico\'ya tek soru), günlük temiz',
    d.iyz.sorulan.filter((k) => k === 'sub-h').length === 1 && temiz(g2),
    `sorulan=${JSON.stringify(d.iyz.sorulan)} ${gunlukYaz(g2)}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  M — MUTABAKAT OYNATMA SATIRI tek başına (işleyici kaynağa bakmaz)
// ═════════════════════════════════════════════════════════════════════════
async function mBlogu(): Promise<void> {
  console.log('\n── M · gece mutabakatının oynatma biçimi (kaynak: mutabakat) aynı yoldan ──');
  const d = dunyaKur();
  const simdi = Date.now();
  const donemBasi = simdi - 4 * GUN;
  const yeniSon = donemBasi + 30 * GUN;
  const ab = d.kartSatiri('F-M', 'sub-m', {
    durum: 'ODEME_BEKLIYOR', erisimSonu: new Date(donemBasi), iyzicoDurum: 'UNPAID',
    ilkBasarisizlik: new Date(donemBasi), sonDeneme: new Date(simdi - GUN), denemeSayisi: 2,
  });
  d.iyz.detaylar.set('sub-m', iyzicoDetayi('sub-m', [
    siparis('ord-m2', donemBasi, yeniSon, ['FAILURE', 'FAILURE', 'SUCCESS']),
  ]));
  const oynatma = d.olay(BASARILI, 'sub-m', 'ord-m2', { alindi: simdi - DK, kaynak: 'mutabakat' });
  const g = await d.isle();
  check('M-FIXTURE oynatma satırı tahsilat yolunu koştu (AKTIF, dönem sonu, fatura), olay hatasız, günlük temiz',
    tahsilatKostu(d, ab, 'ord-m2', yeniSon) && d.olayTemiz(oynatma) && temiz(g),
    `${sayacYaz(ab)} ${gunlukYaz(g)}`);
  check('M1 ⭐⭐ oynatma satırı da "alındı"yı TAM BİR KEZ gönderir (işleyici kaynağa bakmaz, aynı yol)',
    d.alindiPostasi(faturaEposta('F-M')).length === 1 && d.giden.length === 1 &&
      d.olaylar(ab.id, 'dunning.eposta.toparlandi').length === 1,
    `giden=${JSON.stringify(d.giden)}`);
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nDUNNING TOPARLANDI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  await oBlogu();
  await tBlogu();
  await kBlogu();
  await nBlogu();
  await yBlogu();
  await eBlogu();
  await mBlogu();
  await hBlogu();
  son();
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
