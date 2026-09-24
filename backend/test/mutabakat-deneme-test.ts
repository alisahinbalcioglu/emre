/**
 * MUTABAKAT DENEMEYİ AKTİF'E ÇEKMEZ  (`npm run test:mutabakat-deneme`) · 23.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. GERÇEK `MutabakatJob`, `AbonelikServisi` ve
 * `ErisimServisi` bellek-Prisma üzerinde koşar. Bellek-Prisma `where`i
 * GERÇEKTEN uygular (eşitlik/null/in/not/lt/lte/gt/gte/OR/AND/NOT) ve
 * bilmediği operatörde PATLAR (sessizce yok saymaz). iyzico sahtedir: yalnız
 * ABONELİK DETAYI döndürür, kime sorulduğunu kaydeder ve tanımlanmamış kod
 * için VARSAYILAN UYDURMAZ (hata fırlatır).
 *
 * ── NEDEN ─────────────────────────────────────────────────────────────────
 * iyzico'da TRIAL durumu yok; deneme içindeki abonelik ACTIVE görünür
 * (docs.iyzico.com › Abonelik İşlemleri: denemeli planda ACTIVE başlayan
 * abonelikte iyzico yalnız kartı doğrular). Gece mutabakatı ACTIVE'i AKTIF okuyup
 * DENEME satırını İLK GECE AKTIF'e çekiyordu: deneme uyarısı kayboluyor
 * (müşteri ilk çekimden önce uyarılmıyor), rozet "Aktif" diyor, satır DENEME
 * yaşam döngüsünden çıkıyordu. Kural: mutabakat.job.ts → `denemeSuruyorMu`.
 *
 * ⚠ SAHTE iyzico YALNIZ DOKÜMANTE ALANLARI taşır (`subscriptionStatus` +
 * `trialDays`/`trialStartDate`/`trialEndDate`; dokümana göre epoch ms —
 * denemeli bir yanıt hiç GÖZLENMEDİ). Deneme içindeki `startDate` ve
 * `orders` değerleri ÖLÇÜLMEDİ; kural onları okumaz, fixture da uydurmaz.
 * Sipariş yalnız W bloğunda, webhook yolunun doğruladığı sipariş olarak
 * vardır; ödeme denemesi taşımadığı için gece mutabakatının kanıt kuralına
 * (`odenmisSiparisMi`) göre KANIT DEĞİLDİR — bkz. test:mutabakat-kayip-tahsilat.
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   S  saf kural `denemeSuruyorMu`: sınır anı, boş/bozuk tarih, yalnız DENEME
 *   M  tek satır mutabakatı (GERÇEK iş): deneme sürerken ACTIVE → DENEME
 *      kalır; UNPAID/CANCELED yine işlenir. 24.09: deneme bittikten sonra
 *      da çıplak ACTIVE AKTIF'e çekmez (kanıtsız terfi yok) — ödenmiş sipariş
 *      tahsilat yolundan yeniden oynatılır: `test:mutabakat-kayip-tahsilat`
 *   E  sonuç: müşteri ilk çekimden önce UYARILIR (GERÇEK ErisimServisi.karar)
 *   W  tahsilat webhook'u DENEME'yi yine AKTIF'e çeker (tek kanıt yolu)
 *   G  gece taraması (cron giriş noktası): kuralı HATASIZ uygular, özet
 *      satırı korunan satırı sayar — BAĞLANTI
 *   K  iyzico'ya ulaşılamazsa korunan satır DENEME yaşam döngüsünde kalır
 *      (erişimi dolunca saatlik kapatma SONA_ERDI yapar)
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, Logger } from '@nestjs/common';
import {
  MutabakatJob,
  denemeSuruyorMu,
} from '../src/ozellik/odeme/abonelik/mutabakat.job';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { donemTarihleriHesapla } from '../src/ozellik/odeme/abonelik/satinalma.servisi';

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

// Nest günlüğü gürültüsü kapalı; MD_GUNLUK=1 ile açılır.
if (!process.env.MD_GUNLUK) Logger.overrideLogger(false);

const GUN = 86_400_000;

/**
 * Günlüğü TOPLAR. ⚠ `geceMutabakati` satır hatasını YAKALAYIP yalnız günlüğe
 * yazar; günlük kapalıyken patlayan bir satır "DENEME kaldı" diye YEŞİL
 * görünürdü. G/K blokları bu yüzden hata/uyarı satırlarını sayar.
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
    Logger.overrideLogger(process.env.MD_GUNLUK ? new ConsoleLogger() : false);
  }
  return { kayitlar, uyarilar, hatalar };
}

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — yalnız bu paketin dokunduğu yüzey, ama SADIK
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: { paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' } },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
};

const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    denemeSonu: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null, iyzicoMusteriKodu: null,
    iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART', ilkBasarisizlik: null,
    denemeSayisi: 0, sonDeneme: null, kisitlandi: null, iptalTalebi: null, iptalNedeni: null,
    olusturuldu: new Date(), guncellendi: new Date(),
  }),
  abonelikOlayi: () => ({ olusturuldu: new Date(), aktor: 'sistem', oncekiDurum: null, yeniDurum: null }),
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

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);

  // Prisma her okumada TAZE nesne döndürür; çağıranın nesneyi değiştirmesi
  // tabloyu değiştirmez. Taklit de öyle (kopya döner).
  function yansit(model: string, satir: Satir, spec: any): Satir {
    if (spec?.select) {
      const sonuc: Satir = {};
      for (const [k, v] of Object.entries(spec.select)) if (v) sonuc[k] = satir[k];
      return sonuc;
    }
    const sonuc: Satir = { ...satir };
    for (const [k, v] of Object.entries(spec?.include ?? {})) {
      if (!v) continue;
      const il = ILISKILER[model]?.[k];
      if (!il) throw new Error(`bellek-Prisma: bilinmeyen iliski ${model}.${k}`);
      const hedef = tablo(il.model).find((r) => r.id === satir[il.yerel]);
      sonuc[k] = hedef ? yansit(il.model, hedef, v === true ? {} : v) : null;
    }
    return sonuc;
  }

  function veriUygula(hedef: Satir, data: Satir): void {
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) hedef[k] = v;
    }
  }

  function olustur(model: string, data: Satir): Satir {
    const satir: Satir = { id: randomUUID(), ...(VARSAYILAN[model]?.() ?? {}) };
    veriUygula(satir, data);
    tablo(model).push(satir);
    return satir;
  }

  const modelYuzu = (model: string) => ({
    findUnique: async (arg: any) => {
      await Promise.resolve();
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      return s ? yansit(model, s, arg) : null;
    },
    findUniqueOrThrow: async (arg: any) => {
      await Promise.resolve();
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (!s) throw Object.assign(new Error(`${model} bulunamadi`), { code: 'P2025' });
      return yansit(model, s, arg);
    },
    findFirst: async (arg: any = {}) => {
      await Promise.resolve();
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      return s ? yansit(model, s, arg) : null;
    },
    findMany: async (arg: any = {}) => {
      await Promise.resolve();
      return tablo(model).filter((r) => whereUygula(r, arg.where)).map((s) => yansit(model, s, arg));
    },
    count: async (arg: any = {}) => {
      await Promise.resolve();
      return tablo(model).filter((r) => whereUygula(r, arg.where)).length;
    },
    create: async (arg: any) => {
      await Promise.resolve();
      return yansit(model, olustur(model, arg.data), arg);
    },
    update: async (arg: any) => {
      await Promise.resolve();
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (!s) throw Object.assign(new Error(`${model} guncellenecek satir yok`), { code: 'P2025' });
      veriUygula(s, arg.data);
      return yansit(model, s, arg);
    },
    updateMany: async (arg: any) => {
      await Promise.resolve();
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
        // bu paket geri açmanın atomikliğini ölçmez (onu `test:odeme-imha`
        // ölçer); yalnız tahsilat yolunun DENEME'yi AKTIF'e çektiğini ölçer.
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
//  SAHTE iyzico — yalnız abonelik detayı; soruları kaydeder
// ═════════════════════════════════════════════════════════════════════════
function sahteIyzico() {
  const detaylar = new Map<string, unknown>();
  const sorulan: string[] = [];
  return {
    detaylar,
    sorulan,
    istemci: {
      abonelikGetir: async (kod: string) => {
        sorulan.push(kod);
        const d = detaylar.get(kod);
        if (!d) throw new Error(`sahte iyzico: ${kod} icin detay tanimlanmadi`);
        return d;
      },
    } as any,
  };
}

/**
 * Dokümandaki abonelik detayı biçimi (docs.iyzico.com › Abonelik İşlemleri ›
 * abonelik detayı): `subscriptionStatus` + deneme alanları (epoch ms). Deneme
 * içindeki `startDate`/`orders` ölçülmedi — bilerek KONMADI. Sipariş yalnız
 * çekim kanıtı gereken yerde (W) verilir; biçimi 20.08 sandbox tutanağından
 * (`endPeriod` epoch ms SAYI).
 */
function iyzicoDetayi(
  kod: string,
  durum: string,
  deneme: { baslangic: Date; gun: number },
  siparisler?: unknown[],
) {
  return {
    referenceCode: kod,
    pricingPlanReferenceCode: 'plan-30',
    customerReferenceCode: `cus-${kod}`,
    subscriptionStatus: durum,
    trialDays: deneme.gun,
    trialStartDate: deneme.baslangic.getTime(),
    trialEndDate: deneme.baslangic.getTime() + deneme.gun * GUN,
    ...(siparisler ? { orders: siparisler } : {}),
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  DÜNYA — her blok TAZE dünya kurar
// ═════════════════════════════════════════════════════════════════════════
function dunyaKur() {
  const db = bellekPrisma();
  const iyz = sahteIyzico();
  db.ekle('paket', { id: 'P1', kod: 'pro-mek', kullaniciHakki: 2, dwgAktif: true });
  db.ekle('paketSurumu', {
    id: 'S30', paketId: 'P1', periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 30,
    tutar: 1649, paraBirimi: 'TRY', iyzicoPlanKodu: 'plan-30',
  });
  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci);
  const mutabakat = new MutabakatJob(db.prisma, iyz.istemci, abonelik);
  const erisim = new ErisimServisi(db.prisma);

  /**
   * Kartlı DENEME satırı — tarihler SATIN ALMANIN KENDİ fonksiyonundan
   * (`donemTarihleriHesapla`): `denemeSonu` = başlangıç + 30 gün,
   * `erisimSonu` = + 2 gün tampon. Fixture tarih UYDURMAZ. `iyzicoDurum`
   * satın almadaki gibi form sonucundan (ACTIVE) gelir.
   */
  function denemeSatiri(firmaId: string, kod: string, baslangic: Date, ek: Satir = {}) {
    const { erisimSonu, denemeSonu } = donemTarihleriHesapla(baslangic, 30);
    return db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S30', durum: 'DENEME', erisimSonu, denemeSonu,
      odemeYontemi: 'KART', iyzicoAbonelikKodu: kod, iyzicoKokKodu: kod,
      iyzicoDurum: 'ACTIVE', iyzicoSonKontrol: baslangic, ...ek,
    });
  }

  /** Gece işinin satır başına koştuğu GERÇEK metot (özel; cron onu çağırır). */
  const tekSatir = (id: string, kod: string): Promise<boolean> =>
    (mutabakat as any).tekAbonelikMutabakati(id, kod);

  const durumOlaylari = (abonelikId: string) =>
    db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && o.tip === 'durum.degisti');

  return { db, iyz, abonelik, mutabakat, erisim, denemeSatiri, tekSatir, durumOlaylari };
}

// ═════════════════════════════════════════════════════════════════════════
//  S — SAF KURAL
// ═════════════════════════════════════════════════════════════════════════
function sBlogu(): void {
  console.log('\n── S · saf kural: denemeSuruyorMu ──');
  const simdi = new Date('2026-09-23T10:00:00.000Z');
  const once = new Date(simdi.getTime() - 1);
  const sonra = new Date(simdi.getTime() + 1);
  check('S1 ⭐ DENEME + denemeSonu ileride → deneme SÜRÜYOR',
    denemeSuruyorMu({ durum: 'DENEME', denemeSonu: sonra }, simdi) === true);
  check('S2 sınır: denemeSonu TAM şimdi → deneme BİTTİ (abonelik-erisim `an <= simdi` ile aynı yön)',
    denemeSuruyorMu({ durum: 'DENEME', denemeSonu: new Date(simdi.getTime()) }, simdi) === false);
  check('S3 DENEME + denemeSonu geçmişte → bitti',
    denemeSuruyorMu({ durum: 'DENEME', denemeSonu: once }, simdi) === false);
  check('S4 kapsam: denemeSonu BOŞ → sürüyor SAYILMAZ (eski davranış)',
    denemeSuruyorMu({ durum: 'DENEME', denemeSonu: null }, simdi) === false &&
      denemeSuruyorMu({ durum: 'DENEME', denemeSonu: undefined }, simdi) === false);
  check('S5 bozuk tarih (Invalid Date) → sürüyor SAYILMAZ',
    denemeSuruyorMu({ durum: 'DENEME', denemeSonu: new Date('gecersiz') }, simdi) === false);
  const digerleri = ['AKTIF', 'ODEME_BEKLIYOR', 'KISITLI', 'ASKIDA', 'IPTAL', 'SONA_ERDI'];
  const sizan = digerleri.filter((durum) => denemeSuruyorMu({ durum, denemeSonu: sonra }, simdi));
  check('S6 ⭐ yalnız DENEME: tarih ileride olsa da diğer 6 durum → false',
    digerleri.length === 6 && sizan.length === 0, `sizan=${sizan.join(',')}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  M — TEK SATIR MUTABAKATI (GERÇEK iş)
// ═════════════════════════════════════════════════════════════════════════
async function mBlogu(): Promise<void> {
  console.log('\n── M · tek satır mutabakatı: deneme sürerken ACTIVE ──');
  {
    const d = dunyaKur();
    const kosumBasi = Date.now();
    const baslangic = new Date(kosumBasi - 1 * GUN); // denemenin 2. günü
    // `iyzicoDurum` BOŞ başlatıldı: satın alma ACTIVE yazar, o zaman M3'ün
    // "yazıldı" ölçümü fixture'ın kendi değerini görürdü.
    const ab = d.denemeSatiri('F-M1', 'sub-m1', baslangic, { iyzicoDurum: null });
    d.iyz.detaylar.set('sub-m1', iyzicoDetayi('sub-m1', 'ACTIVE', { baslangic, gun: 30 }));
    const denemeSonu = ab.denemeSonu.getTime();
    const erisimSonu = ab.erisimSonu.getTime();
    check('M-FIXTURE satır DENEME · denemeSonu İLERİDE · erisimSonu = denemeSonu + 2 gün',
      ab.durum === 'DENEME' && denemeSonu > kosumBasi && erisimSonu - denemeSonu === 2 * GUN,
      `durum=${ab.durum} kalan=${((denemeSonu - kosumBasi) / GUN).toFixed(2)}g`);

    const degisti = await d.tekSatir(ab.id, 'sub-m1');
    check('M1 ⭐ deneme sürerken iyzico ACTIVE → satır DENEME KALDI (geçiş yok)',
      degisti === false && ab.durum === 'DENEME', `degisti=${degisti} durum=${ab.durum}`);
    check('M2 olay günlüğüne `durum.degisti` YAZILMADI', d.durumOlaylari(ab.id).length === 0,
      JSON.stringify(d.durumOlaylari(ab.id)));
    check('M3 iz kaldı: iyzico SORULDU, iyzicoDurum=ACTIVE, iyzicoSonKontrol bu koşumda yazıldı',
      d.iyz.sorulan.includes('sub-m1') && ab.iyzicoDurum === 'ACTIVE' &&
        ab.iyzicoSonKontrol instanceof Date && ab.iyzicoSonKontrol.getTime() >= kosumBasi,
      `sorulan=${d.iyz.sorulan} kontrol=${ab.iyzicoSonKontrol?.toISOString?.()}`);
    check('M4 erisimSonu ve denemeSonu DEĞİŞMEDİ',
      ab.denemeSonu.getTime() === denemeSonu && ab.erisimSonu.getTime() === erisimSonu);
  }

  console.log('\n── M · kapsam: deneme içinde UNPAID ve CANCELED yine işlenir ──');
  {
    const d = dunyaKur();
    const baslangic = new Date(Date.now() - 5 * GUN);
    const ab = d.denemeSatiri('F-M5', 'sub-m5', baslangic);
    d.iyz.detaylar.set('sub-m5', iyzicoDetayi('sub-m5', 'UNPAID', { baslangic, gun: 30 }));
    const degisti = await d.tekSatir(ab.id, 'sub-m5');
    check('M5 ⭐ deneme içinde UNPAID → ODEME_BEKLIYOR + ilkBasarisizlik (kural yalnız ACTIVE\'i bastırır)',
      degisti === true && ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik instanceof Date,
      `degisti=${degisti} durum=${ab.durum} ilk=${ab.ilkBasarisizlik}`);
  }
  {
    const d = dunyaKur();
    const baslangic = new Date(Date.now() - 5 * GUN);
    const ab = d.denemeSatiri('F-M6', 'sub-m6', baslangic);
    d.iyz.detaylar.set('sub-m6', iyzicoDetayi('sub-m6', 'CANCELED', { baslangic, gun: 30 }));
    const degisti = await d.tekSatir(ab.id, 'sub-m6');
    check('M6 deneme içinde CANCELED → IPTAL (iptal denemede de gerçektir)',
      degisti === true && ab.durum === 'IPTAL', `degisti=${degisti} durum=${ab.durum}`);
  }

  // 24.09 — Emre kararı "kanıtsız terfi yok": deneme BİTTİKTEN sonra da
  // çıplak ACTIVE AKTIF'e çekmez. Eski hâl (yalnız DURUM terfisi) `erisimSonu`nu
  // uzatmıyor, faturayı kuyruğa almıyordu; ödenmiş ilk çekim artık tahsilat
  // yolundan yeniden oynatılır (`test:mutabakat-kayip-tahsilat` D/W/G).
  console.log('\n── M · deneme BİTTİKTEN sonra: çıplak ACTIVE terfi ettirmez ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const baslangic = new Date(simdi - 31 * GUN); // deneme DÜN bitti, tampon sürüyor
    const ab = d.denemeSatiri('F-M7', 'sub-m7', baslangic);
    d.iyz.detaylar.set('sub-m7', iyzicoDetayi('sub-m7', 'ACTIVE', { baslangic, gun: 30 }));
    check('M7-FIXTURE denemeSonu GEÇMİŞTE, erisimSonu hâlâ İLERİDE (2 gün tampon)',
      ab.denemeSonu.getTime() < simdi && ab.erisimSonu.getTime() > simdi);
    const degisti = await d.tekSatir(ab.id, 'sub-m7');
    check('M7 ⭐ deneme bittikten sonra ÇIPLAK ACTIVE (sipariş yok) → DENEME kalır (kanıtsız terfi yok)',
      degisti === false && ab.durum === 'DENEME', `degisti=${degisti} durum=${ab.durum}`);
    const sayac = (d.mutabakat as any).denemedeKorunan;
    check('M8 durum olayı YAZILMADI; deneme sayacı ARTMADI — satırı deneme kuralı değil kanıtsız-terfi kuralı tuttu',
      d.durumOlaylari(ab.id).length === 0 && sayac === 0 && (d.mutabakat as any).kanitsizAktif === 1,
      `olay=${JSON.stringify(d.durumOlaylari(ab.id))} deneme=${sayac}`);
  }

  console.log('\n── M · kapsam: deneme kuralı yalnız DENEME satırını sayar ──');
  {
    const d = dunyaKur();
    const baslangic = new Date(Date.now() - 2 * GUN);
    // Tarihi ileride ama DENEME olmayan satır: ödeme bekleyen abonelik.
    const ab = d.denemeSatiri('F-M9', 'sub-m9', baslangic, {
      durum: 'ODEME_BEKLIYOR', ilkBasarisizlik: new Date(), sonDeneme: new Date(),
    });
    d.iyz.detaylar.set('sub-m9', iyzicoDetayi('sub-m9', 'ACTIVE', { baslangic, gun: 30 }));
    const degisti = await d.tekSatir(ab.id, 'sub-m9');
    check('M9 ODEME_BEKLIYOR (denemeSonu ileride) + çıplak ACTIVE → ODEME_BEKLIYOR kalır; deneme sayacı ARTMAZ (kural DENEME dışına uygulanmaz)',
      degisti === false && ab.durum === 'ODEME_BEKLIYOR' && (d.mutabakat as any).denemedeKorunan === 0 &&
        (d.mutabakat as any).kanitsizAktif === 1,
      `degisti=${degisti} durum=${ab.durum} deneme=${(d.mutabakat as any).denemedeKorunan}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  E — SONUÇ: MÜŞTERİ İLK ÇEKİMDEN ÖNCE UYARILIR
// ═════════════════════════════════════════════════════════════════════════
async function eBlogu(): Promise<void> {
  console.log('\n── E · sonuç: deneme uyarısı görünür (GERÇEK ErisimServisi.karar) ──');
  const d = dunyaKur();
  const baslangic = new Date(Date.now() - 28 * GUN); // ilk çekime 2 gün var
  // Uyarının GÜN SAYISI bu paketin konusu DEĞİL (hangi tarihten sayılacağı
  // ayrı iş: deneme geri sayımı). Burada yalnız uyarının VAR olduğu ölçülür;
  // sayı BİLEREK sabitlenmez.
  const ab = d.denemeSatiri('F-E', 'sub-e', baslangic);
  d.iyz.detaylar.set('sub-e', iyzicoDetayi('sub-e', 'ACTIVE', { baslangic, gun: 30 }));
  await d.tekSatir(ab.id, 'sub-e');

  const k = await d.erisim.karar('F-E');
  check('E1 ⭐ mutabakattan sonra karar DENEME ve "Deneme sürenizin bitmesine … gün kaldı" uyarısı VAR',
    k.durum === 'DENEME' && !!k.uyari && k.uyari.baslik.startsWith('Deneme sürenizin bitmesine'),
    `durum=${k.durum} uyari=${JSON.stringify(k.uyari)}`);
  check('E2 erişim tam açık ve geri sayım var',
    k.erisimVar === true && k.saltOkunur === false && typeof k.kalanGun === 'number' && k.kalanGun > 0,
    `erisim=${k.erisimVar} salt=${k.saltOkunur} kalan=${k.kalanGun}`);

  // ÖLÇÜT: E1'in ölçtüğü şey gerçekten hatanın bozduğu şey mi? Aynı satır
  // AKTIF olsaydı (eski hal) uyarı ve geri sayım ÇIKMAZDI.
  ab.durum = 'AKTIF';
  const eski = await d.erisim.karar('F-E');
  check('E-OLCUT eski hal (AKTIF): uyarı YOK, geri sayım YOK — E1 kör değil',
    eski.uyari === null && eski.kalanGun === null, JSON.stringify(eski.uyari));
}

// ═════════════════════════════════════════════════════════════════════════
//  W — TAHSİLAT WEBHOOK'U DENEME'Yİ YİNE AKTIF'E ÇEKER
// ═════════════════════════════════════════════════════════════════════════
async function wBlogu(): Promise<void> {
  console.log('\n── W · tahsilat webhook\'u DENEME → AKTIF (tek kanıt yolu) ──');
  const d = dunyaKur();
  // iyzico denemeyi KENDİ `trialEndDate`inde bitirip çeker; bizim
  // `denemeSonu` niyet sonuçlanınca hesaplandığı için birkaç dakika SONRA
  // olabilir. İlk çekimin webhook'u `denemeSonu` henüz gelmemişken düşebilir.
  const baslangic = new Date(Date.now() - 30 * GUN + 5 * 60_000); // denemeSonu 5 dk ileride
  const ab = d.denemeSatiri('F-W', 'sub-w', baslangic);
  const donemBasi = Date.now() - 60_000;
  const donemSonu = donemBasi + 30 * GUN;
  // ⚠ 24.09: sipariş BİLEREK `paymentAttempts` taşımıyor — bu blok yalnız
  // WEBHOOK yolunu ölçer. Ödeme denemesi olsaydı gece mutabakatı onu kanıt
  // sayıp tahsilatı yeniden oynatırdı (satır W0'da yine DENEME kalır, olay
  // kuyruğa girerdi); o yol `test:mutabakat-kayip-tahsilat` W/D'de ölçülür.
  d.iyz.detaylar.set('sub-w', iyzicoDetayi('sub-w', 'ACTIVE', { baslangic, gun: 30 }, [
    { referenceCode: 'ord-w1', orderStatus: 'SUCCESS', startPeriod: donemBasi, endPeriod: donemSonu, price: 1649 },
  ]));
  // Ölçüt test edilen fonksiyondan BAĞIMSIZ (dairesel olmasın): ham tarih.
  check('W-FIXTURE denemeSonu hâlâ İLERİDE (mutabakat bu satırı korur)', ab.denemeSonu.getTime() > Date.now(),
    `denemeSonu=${ab.denemeSonu.toISOString()}`);

  const gece = await d.tekSatir(ab.id, 'sub-w');
  check('W0 mutabakat dokunmadı: ACTIVE tek başına kanıt değil', gece === false && ab.durum === 'DENEME',
    `degisti=${gece} durum=${ab.durum}`);

  await d.abonelik.tahsilatBasarili('sub-w', 'ord-w1');
  check('W1 ⭐ doğrulanmış sipariş → DENEME → AKTIF (kural tahsilat yolunu engellemez)', ab.durum === 'AKTIF',
    `durum=${ab.durum}`);
  check('W2 erisimSonu iyzico siparişinin dönem sonuna taşındı', ab.erisimSonu.getTime() === donemSonu,
    `erisimSonu=${ab.erisimSonu.toISOString()}`);
  const olay = d.durumOlaylari(ab.id)[0];
  check('W3 olay: DENEME → AKTIF, aktör webhook',
    olay?.oncekiDurum === 'DENEME' && olay?.yeniDurum === 'AKTIF' && olay?.aktor === 'webhook',
    JSON.stringify(olay));

  const ikinciGece = await d.tekSatir(ab.id, 'sub-w');
  check('W4 sonraki gece mutabakatı AKTIF satırı olduğu gibi bırakır',
    ikinciGece === false && ab.durum === 'AKTIF' && d.durumOlaylari(ab.id).length === 1,
    `degisti=${ikinciGece} durum=${ab.durum}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  G — GECE TARAMASI (cron giriş noktası) — BAĞLANTI
// ═════════════════════════════════════════════════════════════════════════
async function gBlogu(): Promise<void> {
  console.log('\n── G · gece taraması (cron giriş noktası) — BAĞLANTI ──');
  const d = dunyaKur();
  const simdi = Date.now();
  const suren = d.denemeSatiri('F-G1', 'sub-g1', new Date(simdi - 3 * GUN));
  const biten = d.denemeSatiri('F-G2', 'sub-g2', new Date(simdi - 31 * GUN));
  const aktif = d.db.ekle('abonelik', {
    firmaId: 'F-G3', paketSurumuId: 'S30', durum: 'AKTIF', erisimSonu: new Date(simdi + 20 * GUN),
    odemeYontemi: 'KART', iyzicoAbonelikKodu: 'sub-g3', iyzicoKokKodu: 'sub-g3',
    iyzicoSonKontrol: new Date(simdi - GUN),
  });
  const havale = d.db.ekle('abonelik', {
    firmaId: 'F-G4', paketSurumuId: 'S30', durum: 'AKTIF', erisimSonu: new Date(simdi + 200 * GUN),
    odemeYontemi: 'HAVALE',
  });
  const baslangiclar: Array<[string, number]> = [
    ['sub-g1', simdi - 3 * GUN], ['sub-g2', simdi - 31 * GUN], ['sub-g3', simdi - 60 * GUN],
  ];
  for (const [kod, bas] of baslangiclar) {
    d.iyz.detaylar.set(kod, iyzicoDetayi(kod, 'ACTIVE', { baslangic: new Date(bas), gun: 30 }));
  }

  const gBasi = Date.now();
  const g = await gunluguTopla(() => d.mutabakat.geceMutabakati());
  check('G1 ⭐ süren deneme gece taramasından DENEME çıktı', suren.durum === 'DENEME', `durum=${suren.durum}`);
  // 24.09: biten denemenin iyzico detayında ödenmiş sipariş YOK (fixture
  // uydurmaz) → kanıtsız terfi yok, DENEME kalır. Hangi kuralın tuttuğunu G6
  // SAYAR: deneme kuralı yalnız süreni (1), kanıtsız kuralı biteni (1).
  check('G2 ⭐ biten deneme (ödenmiş sipariş yok) AYNI taramada AKTIF\'e ÇEKİLMEDİ — kanıtsız terfi yok',
    biten.durum === 'DENEME', `durum=${biten.durum}`);
  const sorulan = [...d.iyz.sorulan].sort().join(',');
  check('G3 BAĞLANTI: üç kart aboneliği iyzico\'ya soruldu, havale sorulmadı', sorulan === 'sub-g1,sub-g2,sub-g3',
    `sorulan=${sorulan}`);
  check('G4 AKTIF ve havale satırları olduğu gibi', aktif.durum === 'AKTIF' && havale.durum === 'AKTIF');
  const islenmeyen = [suren, biten, aktif].filter(
    (r) => !(r.iyzicoSonKontrol instanceof Date && r.iyzicoSonKontrol.getTime() >= gBasi),
  );
  check('G5 ⭐ G1 boşuna yeşil değil: hiçbir satır hata/uyarı yazmadı, üç kart satırı da bu koşumda işlendi',
    g.hatalar.length === 0 && g.uyarilar.length === 0 && islenmeyen.length === 0,
    `hatalar=${JSON.stringify(g.hatalar)} uyarilar=${JSON.stringify(g.uyarilar)} islenmeyen=${islenmeyen.map((r) => r.firmaId)}`);
  const ozet = g.kayitlar.find((m) => m.startsWith('Mutabakat bitti')) ?? '';
  check('G6 özet satırı (deploy sonrası ölçüm): "Değişen: 0 · deneme sürdüğü için AKTIF\'e çekilmeyen: 1 · … kanıtsız …: 1"',
    ozet.includes('Değişen: 0') && ozet.includes('deneme sürdüğü için AKTIF\'e çekilmeyen: 1') &&
      ozet.includes('kanıtsız ACTIVE ile AKTIF\'e çekilmeyen: 1'), `ozet="${ozet}"`);

  // İkinci gece AYNI iş örneğiyle: sayaç sıfırlanmazsa birikir ve ölçüm yalan söyler.
  const g2 = await gunluguTopla(() => d.mutabakat.geceMutabakati());
  const ozet2 = g2.kayitlar.find((m) => m.startsWith('Mutabakat bitti')) ?? '';
  check('G7 ikinci gece: "Değişen: 0 · … çekilmeyen: 1 · … kanıtsız …: 1" (sayaçlar her gece sıfırlanır, süren deneme hâlâ DENEME)',
    ozet2.includes('Değişen: 0') && ozet2.includes('deneme sürdüğü için AKTIF\'e çekilmeyen: 1') &&
      ozet2.includes('kanıtsız ACTIVE ile AKTIF\'e çekilmeyen: 1') && suren.durum === 'DENEME',
    `ozet="${ozet2}" durum=${suren.durum}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  K — SAATLİK KAPATMA: korunan satır DENEME yaşam döngüsünde kalır
// ═════════════════════════════════════════════════════════════════════════
async function kBlogu(): Promise<void> {
  console.log('\n── K · iyzico\'ya ulaşılamazsa: korunan satır DENEME yaşam döngüsünde ──');
  const d = dunyaKur();
  const baslangic = new Date(Date.now() - 10 * GUN);
  const ab = d.denemeSatiri('F-K', 'sub-k', baslangic);
  d.iyz.detaylar.set('sub-k', iyzicoDetayi('sub-k', 'ACTIVE', { baslangic, gun: 30 }));
  await d.tekSatir(ab.id, 'sub-k');
  check('K0 deneme sürerken mutabakattan sonra satır DENEME', ab.durum === 'DENEME', `durum=${ab.durum}`);

  // Zaman atlaması: deneme ve 2 günlük tampon bitti; tampondaki gecelerde
  // iyzico'ya ULAŞILAMADI (sahte iyzico bu kod için hata fırlatır). ⚠ 24.09:
  // artık tek yol bu değil — iyzico'ya ulaşılsa da ödenmiş sipariş görünmezse
  // çıplak ACTIVE terfi ettirmez (M7) ve satır yine buraya düşer. SONA_ERDI +
  // iyzico ACTIVE satırın taranması ve yeniden alım kapısı:
  // `test:mutabakat-kayip-tahsilat` K/Z.
  ab.denemeSonu = new Date(Date.now() - 3 * GUN);
  ab.erisimSonu = new Date(Date.now() - 1 * GUN);
  d.iyz.detaylar.delete('sub-k');
  const gece = await gunluguTopla(() => d.mutabakat.geceMutabakati());
  check('K-FIXTURE iyzico ulaşılamadı: gece işi bu satır için TEK hata yazdı, satır DENEME kaldı',
    gece.hatalar.length === 1 && gece.hatalar[0].includes(ab.id) && ab.durum === 'DENEME',
    `hatalar=${JSON.stringify(gece.hatalar)} durum=${ab.durum}`);

  await d.mutabakat.suresiDolanlariKapat();
  check('K1 ⭐ erişimi dolan DENEME satırı saatlik işte SONA_ERDI (eski halde ilk gece AKTIF olup bu işin DIŞINDA kalıyordu)',
    ab.durum === 'SONA_ERDI', `durum=${ab.durum}`);
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nMUTABAKAT DENEME: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  sBlogu();
  await mBlogu();
  await eBlogu();
  await wBlogu();
  await gBlogu();
  await kBlogu();
  son();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
