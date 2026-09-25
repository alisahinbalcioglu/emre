/**
 * ÖDEME BEKLİYOR GERİ SAYIMI  (`npm run test:odeme-bekliyor-geri-sayim`) · 24.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. GERÇEK `ErisimServisi.karar` bellek-Prisma üzerinde koşar;
 * ODEME_BEKLIYOR satırı başarısız tahsilatın GERÇEK yazma yollarından üretilir
 * (`AbonelikServisi.tahsilatBasarisiz` webhook'u + gece mutabakatının UNPAID
 * dalı) — fixture `ilkBasarisizlik` UYDURMAZ.
 *
 * ── NEDEN ─────────────────────────────────────────────────────────────────
 * ODEME_BEKLIYOR dalı `kalanGun`u `erisimSonu`na sayıyordu, kırpmasız. Yenileme
 * başarılıyken `erisimSonu` = iyzico siparişinin `endPeriod`u (tampon yok);
 * sonraki çekim başarısız olunca satır ODEME_BEKLIYOR'a düşer ve `erisimSonu`
 * TAM çekim anıdır — yani GEÇMİŞTİR. Dunning 10. günde KISITLI yapana kadar
 * Hesabım › Abonelik "−1, −3, −9 gün kaldı" yazıyordu (ÖLÇÜLDÜ, 24.09); aynı
 * gün dunning e-postası kısıtlamaya kalan günü sayıyordu (7. gün: "3 gün
 * sonra kısıtlanacak"). Denemenin ilk çekimi başarısızsa 2 günlük tampon
 * bitince aynısı.
 *
 * KARAR (Emre, 24.09): `kalanGun` = KISITLAMAYA kalan gün — dunning e-postasıyla
 * AYNI sayı (`kisit-gunu.ts`, `ilkBasarisizlik` + `DUNNING_KISIT_GUNU`, 0'da
 * durur). `ilkBasarisizlik` yoksa (merdiven satırı taramaz) sayı YOK.
 * ⚠ ERİŞİM KARARI (`abonelik-erisim.ts`) ve şerit metni DEĞİŞMEZ (A bloğu).
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   F  fixture: üç gerçek yazma yolu ODEME_BEKLIYOR + `ilkBasarisizlik` üretir
 *   R  yeniden üretim: 12 günlük saatlik taramada `kalanGun` null ya da ≥ 0
 *      tam sayı (eksi gün YOK) + ölçüm tablosu (ekran ↔ e-posta)
 *   G  çizelge: sabit beklentiler (10 → 0), üç yolda da; deneme sonrası dahil;
 *      saat satırdan ms ÖNCE okunmuşsa 11 değil 10
 *   E  e-posta ≡ ekran: GERÇEK `gonder`in sayısı 289 saatte `kalanGun`a eşit
 *   L  GERÇEK dunning merdiveni (günlük koşum, iki saat kayması): ekran > 0
 *      iken kısıtlamaz, 0 gördüğü ilk koşumda kısıtlar; 7. gün e-postası = ekran
 *   N  `ilkBasarisizlik` yazılmadan önceki GERÇEK ara an ve `kisitlandi` → null
 *   H  havaleye geçmiş ODEME_BEKLIYOR satırı (`d792251` öncesinden kalan veri):
 *      merdiven KART dışını taramaz → sayı YOK, 0'da donmaz
 *   K  `DUNNING_KISIT_GUNU=14`: ekran, e-posta ve merdiven birlikte 14'e sayar
 *   A  erişim kararı ve şerit değişmedi: servis ≡ saf çekirdek, metin birebir
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { abonelikErisimi } from '../src/altyapi/auth/abonelik-erisim';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { MutabakatJob } from '../src/ozellik/odeme/abonelik/mutabakat.job';
import { DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
import { donemTarihleriHesapla } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
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

const SAAT = 3_600_000;
const GUN = 24 * SAAT;
const DAKIKA = 60_000;

/**
 * Gerçek saat sınıfı. `saatte()` global `Date`i geçici olarak değiştirir;
 * taklidin tarih denetimleri HER ZAMAN bu sınıfa bakar (alt sınıfın örnekleri
 * de bunun örneğidir).
 */
const GercekDate = Date;

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — karar, tahsilat/mutabakat yazma yolu ve dunning yüzeyi
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: { paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' } },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
};

/**
 * Prisma, verilmeyen opsiyonel alanı `null` döndürür (undefined DEĞİL) ve
 * şema varsayılanını uygular. Yazma yolu `ilkBasarisizlik`i yazmayı unutursa
 * satır NULL taşır — taklit de öyle.
 */
const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    durum: 'DENEME', denemeSonu: null, planliPaketSurumuId: null, paketGecisTarihi: null,
    odenenPaketSurumuId: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null,
    iyzicoMusteriKodu: null, iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART',
    ilkBasarisizlik: null, denemeSayisi: 0, sonDeneme: null, kisitlandi: null,
    iptalTalebi: null, iptalNedeni: null, olusturuldu: new Date(), guncellendi: new Date(),
  }),
};

const esit = (a: any, b: any) =>
  a instanceof GercekDate && b instanceof GercekDate ? a.getTime() === b.getTime() : a === b;

/** Yalnız ölçülen operatörler; tanınmayan koşul PATLAR (sessizce yok saymaz). */
function kosulUygula(deger: any, kosul: any): boolean {
  if (kosul === null || typeof kosul !== 'object' || kosul instanceof GercekDate) return esit(deger, kosul);
  return Object.entries(kosul).every(([op, v]: [string, any]) => {
    switch (op) {
      case 'not': return !esit(deger, v);
      case 'in': return (v as any[]).some((x) => esit(deger, x));
      case 'lte': return deger != null && deger <= v;
      case 'lt': return deger != null && deger < v;
      case 'gte': return deger != null && deger >= v;
      case 'gt': return deger != null && deger > v;
      default: throw new Error(`bellek-Prisma: desteklenmeyen operatör ${op}`);
    }
  });
}

function whereUygula(satir: Satir, where: any): boolean {
  return Object.entries(where ?? {}).every(([k, v]) => {
    if (k === 'OR' || k === 'AND' || k === 'NOT') throw new Error(`bellek-Prisma: desteklenmeyen ${k}`);
    return kosulUygula(satir[k], v);
  });
}

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);

  // Prisma her okumada TAZE nesne döndürür; ilişkiyi yalnız `include`/`select`
  // ile getirir; bilinmeyen ilişkide PATLAR.
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
        sonuc[k] = k in (ILISKILER[model] ?? {}) ? iliski(k, v) : satir[k] ?? null;
      }
      return sonuc;
    }
    const sonuc: Satir = { ...satir };
    for (const [k, v] of Object.entries(spec?.include ?? {})) if (v) sonuc[k] = iliski(k, v);
    return sonuc;
  }

  function olustur(model: string, data: Satir): Satir {
    const satir: Satir = { id: randomUUID(), ...(VARSAYILAN[model]?.() ?? {}) };
    for (const [k, v] of Object.entries(data)) if (v !== undefined) satir[k] = v;
    tablo(model).push(satir);
    return satir;
  }

  const sirala = (satirlar: Satir[], orderBy: any) => {
    const [[alan, yon]] = Object.entries(orderBy ?? { id: 'asc' }) as [string, string][];
    return [...satirlar].sort((a, b) => (a[alan] > b[alan] ? 1 : a[alan] < b[alan] ? -1 : 0) * (yon === 'desc' ? -1 : 1));
  };

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
    findFirst: async (arg: any) => {
      await Promise.resolve();
      const s = sirala(tablo(model).filter((r) => whereUygula(r, arg?.where)), arg?.orderBy)[0];
      return s ? yansit(model, s, arg) : null;
    },
    findMany: async (arg: any) => {
      await Promise.resolve();
      return tablo(model).filter((r) => whereUygula(r, arg?.where)).map((r) => yansit(model, r, arg));
    },
    create: async (arg: any) => {
      await Promise.resolve();
      return yansit(model, olustur(model, arg.data), arg);
    },
    update: async (arg: any) => {
      await Promise.resolve();
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (!s) throw Object.assign(new Error(`${model} guncellenecek satir yok`), { code: 'P2025' });
      yaz(model, s, arg.data);
      return yansit(model, s, arg);
    },
    // Koşullu yazım (`tahsilatBasarisiz`: yalnız hâlâ KART ise): eşleşmezse
    // 0 satır, hata YOK — Prisma sözleşmesi.
    updateMany: async (arg: any) => {
      await Promise.resolve();
      const satirlar = tablo(model).filter((r) => whereUygula(r, arg.where));
      for (const s of satirlar) yaz(model, s, arg.data);
      return { count: satirlar.length };
    },
  });

  function yaz(model: string, s: Satir, data: Satir): void {
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && typeof v === 'object' && !(v instanceof GercekDate)) {
        throw new Error(`bellek-Prisma: desteklenmeyen guncelleme ${k}=${JSON.stringify(v)}`);
      }
      // `undefined` = "dokunma" (Prisma sözleşmesi).
      if (v !== undefined) s[k] = v;
    }
    // Şemada `guncellendi @updatedAt`: her yazımda o anın saati.
    if (model === 'abonelik') s.guncellendi = new Date();
  }

  const prisma: any = new Proxy(
    {},
    { get: (_h, ad: string) => (ad === 'then' ? undefined : modelYuzu(ad)) },
  );
  return { prisma, tablo, ekle: olustur };
}

/**
 * Saati verilen ana sabitler. Dunning merdiveni ve e-postası saati
 * `Date.now()`dan okur, yazdığı damgaları (`sonDeneme`, `kisitlandi`,
 * `guncellendi`) `new Date()`den alır — İKİSİ de sabitlenir. Yalnız `Date.now`
 * sabitlenseydi merdivenin 3. gün yazdığı `sonDeneme` gerçek saate
 * (≈ `ilkBasarisizlik`) düşerdi ve YANLIŞ alana sayan kod yeşil kalırdı.
 * İş bitince her durumda geri yükler.
 */
async function saatte<T>(an: number, fn: () => Promise<T>): Promise<T> {
  class SabitDate extends GercekDate {
    constructor(...args: any[]) {
      super(...((args.length ? args : [an]) as [number]));
    }
    static now(): number {
      return an;
    }
  }
  globalThis.Date = SabitDate as unknown as DateConstructor;
  try {
    return await fn();
  } finally {
    globalThis.Date = GercekDate;
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  DÜNYA — gerçek servisler, sahte iyzico/e-posta/yapılandırma
// ═════════════════════════════════════════════════════════════════════════
function dunyaKur() {
  const db = bellekPrisma();
  db.ekle('paket', { id: 'P1', kod: 'pro-mek', ad: 'Pro Mekanik', kullaniciHakki: 2, dwgAktif: true });
  db.ekle('paketSurumu', {
    id: 'S1', paketId: 'P1', denemeGunu: 30, tutar: 1250, paraBirimi: 'TRY',
    periyot: 'MONTHLY', periyotAdedi: 1,
  });

  /** iyzico: mutabakat için abonelik durumu; yeniden deneme REDDEDİLİR. */
  const iyzicoDurumu: Record<string, string> = {};
  const iyzico: any = {
    abonelikGetir: async (kod: string) => ({ subscriptionStatus: iyzicoDurumu[kod] ?? 'ACTIVE', orders: [] }),
    tahsilatiTekrarla: async () => {
      throw new Error('iyzico: kart reddedildi');
    },
  };
  const epostalar: Array<{ kime: string; konu: string; baslik: string; an: number }> = [];
  const eposta: any = {
    gonder: async (m: any) => {
      epostalar.push({ kime: m.kime, konu: m.konu, baslik: m.baslik, an: Date.now() });
    },
  };
  const config: any = { get: (ad: string) => process.env[ad] };

  const abonelik = new AbonelikServisi(db.prisma, iyzico);
  const erisim = new ErisimServisi(db.prisma);
  const mutabakat = new MutabakatJob(db.prisma, iyzico, abonelik);
  const dunning = new DunningServisi(db.prisma, iyzico, abonelik, eposta, config);

  /**
   * Kartlı abonelik satırı + firması. Abonelik bir yıl önce açılmış: tarih
   * alanları `ilkBasarisizlik`ten AYRIK — yanlış alana sayan kod aynı sayıyı
   * tesadüfen veremez.
   */
  function satir(firmaId: string, ek: Satir): Satir {
    db.ekle('firma', { id: firmaId, ad: `Firma ${firmaId}`, faturaEposta: `${firmaId}@ornek.test`, yetkiliEposta: null });
    const yilOnce = new Date(Date.now() - 400 * GUN);
    return db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S1', iyzicoAbonelikKodu: `sub-${firmaId}`,
      olusturuldu: yilOnce, guncellendi: yilOnce, ...ek,
    });
  }
  const oku = (firmaId: string) => db.tablo('abonelik').find((r) => r.firmaId === firmaId)!;
  return { db, iyzicoDurumu, epostalar, abonelik, erisim, mutabakat, dunning, satir, oku };
}
type Dunya = ReturnType<typeof dunyaKur>;

/**
 * Üç gerçek yol, her biri bir ODEME_BEKLIYOR satırı:
 *   Y  yenileme — AKTIF, `erisimSonu` = son ödenen siparişin `endPeriod`u
 *      (= bu çekimin anı, 5 dk önce); başarısızlık webhook'u → `tahsilatBasarisiz`
 *   D  deneme — tarihler satın almanın fonksiyonundan (`denemeSonu` 5 dk önce,
 *      `erisimSonu` +2 gün tampon); ilk çekimin başarısızlık webhook'u
 *   M  mutabakat — AKTIF, webhook KAYBOLDU; gece iyzico UNPAID der
 */
async function odemeBekleyenler(d: Dunya): Promise<Record<'Y' | 'D' | 'M', Satir>> {
  const simdi = Date.now();
  // ⚠ 24.09 (webhook tahsilat doğrulaması): ret artık iyzico'dan DOĞRULANIR
  // (`tahsilatBasarisizligiKarari`, `test:webhook-tahsilat-dogrulama` F) —
  // kanıtsız gövde durumu değiştirmez. Reddedilen çekimin iyzico karşılığı
  // abonelik UNPAID; Y ve D webhook yolundan geçer, M zaten UNPAID.
  d.satir('F-Y', { durum: 'AKTIF', erisimSonu: new Date(simdi - 5 * DAKIKA) });
  d.iyzicoDurumu['sub-F-Y'] = 'UNPAID';
  await d.abonelik.tahsilatBasarisiz('sub-F-Y', 'siparis-Y');

  const deneme = donemTarihleriHesapla(new Date(simdi - 30 * GUN - 5 * DAKIKA), 30);
  d.satir('F-D', { durum: 'DENEME', erisimSonu: deneme.erisimSonu, denemeSonu: deneme.denemeSonu });
  d.iyzicoDurumu['sub-F-D'] = 'UNPAID';
  await d.abonelik.tahsilatBasarisiz('sub-F-D', 'siparis-D');

  const m = d.satir('F-M', { durum: 'AKTIF', erisimSonu: new Date(simdi - 5 * DAKIKA) });
  d.iyzicoDurumu['sub-F-M'] = 'UNPAID';
  await (d.mutabakat as any).tekAbonelikMutabakati(m.id, 'sub-F-M');

  return { Y: d.oku('F-Y'), D: d.oku('F-D'), M: d.oku('F-M') };
}

// ═════════════════════════════════════════════════════════════════════════
//  F — FIXTURE: gerçek yazma yolları ODEME_BEKLIYOR üretir
// ═════════════════════════════════════════════════════════════════════════
async function fBlogu(): Promise<void> {
  console.log('\n── F · fixture: üç gerçek yazma yolu ──');
  const once = Date.now();
  const d = dunyaKur();
  const s = await odemeBekleyenler(d);
  const sonra = Date.now();
  for (const [yol, ab] of Object.entries(s)) {
    const ilk = ab.ilkBasarisizlik;
    check(`F-${yol} ${yol === 'M' ? 'mutabakat UNPAID' : 'webhook tahsilatBasarisiz'} → ODEME_BEKLIYOR, ` +
      'ilkBasarisizlik YAZILDI (şimdi), erisimSonu ondan ÖNCE, kısıt yok',
      ab.durum === 'ODEME_BEKLIYOR' && ilk instanceof Date && ilk.getTime() >= once &&
        ilk.getTime() <= sonra && ab.erisimSonu.getTime() < ilk.getTime() + (yol === 'D' ? 2 * GUN : 0) &&
        ab.kisitlandi === null,
      `durum=${ab.durum} ilk=${ilk?.toISOString?.()} erisimSonu=${ab.erisimSonu?.toISOString?.()} kisit=${ab.kisitlandi}`);
  }
  check('F-D2 deneme satırında erisimSonu = denemeSonu + 2 gün (satın almanın tamponu)',
    s.D.erisimSonu.getTime() - s.D.denemeSonu.getTime() === 2 * GUN,
    `fark=${(s.D.erisimSonu.getTime() - s.D.denemeSonu.getTime()) / GUN} gün`);
}

// ═════════════════════════════════════════════════════════════════════════
//  R — YENİDEN ÜRETİM: eksi gün yok + ölçüm tablosu
// ═════════════════════════════════════════════════════════════════════════
/** Dunning'in 7. gün e-postasının konusundaki sayı ("N gün sonra kısıtlanacak"). */
async function epostaninSayisi(d: Dunya, ab: Satir, an: number): Promise<number | null> {
  const once = d.epostalar.length;
  await saatte(an, () => (d.dunning as any).gonder(ab.id, 'ucuncu'));
  const konu = d.epostalar[once]?.konu ?? '';
  const m = /hesabınız (-?\d+) gün sonra kısıtlanacak/.exec(konu);
  return m ? Number(m[1]) : null;
}

async function rBlogu(): Promise<void> {
  console.log('\n── R · yeniden üretim: ODEME_BEKLIYOR geri sayımı ──');
  const d = dunyaKur();
  const s = await odemeBekleyenler(d);

  console.log('    yol | gün | kalanGun (ekran) | e-posta (7. gün metni)');
  for (const [yol, ab] of Object.entries(s)) {
    for (const g of [0, 1, 3, 7, 9]) {
      const an = ab.ilkBasarisizlik.getTime() + g * GUN + 2 * SAAT;
      const k = await d.erisim.karar(ab.firmaId, new Date(an));
      const e = await epostaninSayisi(d, ab, an);
      console.log(`    ${yol}   | ${String(g).padStart(3)} | ${String(k.kalanGun).padStart(16)} | ${e}`);
    }
  }

  // 12 gün boyunca saatlik: kısıtlama günü (10) ve sonrasının bir kısmı dahil.
  const ihlal: string[] = [];
  let taranan = 0;
  for (const [yol, ab] of Object.entries(s)) {
    for (let saat = 0; saat <= 12 * 24; saat++) {
      const k = await d.erisim.karar(ab.firmaId, new Date(ab.ilkBasarisizlik.getTime() + saat * SAAT));
      taranan++;
      if (k.durum !== 'ODEME_BEKLIYOR') ihlal.push(`${yol} ${saat}s durum=${k.durum}`);
      if (!(k.kalanGun === null || (Number.isInteger(k.kalanGun) && k.kalanGun >= 0))) {
        ihlal.push(`${yol} ${saat}s kalanGun=${k.kalanGun}`);
      }
    }
  }
  check('R1 ⭐ 3 yol × 289 saat: ODEME_BEKLIYOR kalanGun ya null ya ≥ 0 tam sayı ("−3 gün kaldı" yok)',
    taranan === 3 * 289 && ihlal.length === 0,
    `taranan=${taranan} ihlal=${ihlal.length} · ${ihlal.slice(0, 6).join(' · ')}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  G — ÇİZELGE: kısıtlamaya kalan gün (sabit beklentiler)
// ═════════════════════════════════════════════════════════════════════════
/** [başarısızlıktan bu yana saat, kalanGun] — `DUNNING_KISIT_GUNU` varsayılanı (10). */
const CIZELGE: Array<[number, number]> = [
  [0, 10], [2, 10], [23, 10], //       ilk gün
  [24, 9], [74, 7], [170, 3], //       1. · 3. · 7. gün (7. gün e-postası: "3 gün sonra")
  [218, 1], [239, 1], //               kısıttan 1 saat öncesine kadar 1
  [240, 0], [242, 0], [288, 0], //     kısıt anı ve sonrası 0 — eksiye düşmez
];

async function gBlogu(): Promise<void> {
  console.log('\n── G · çizelge: kısıtlamaya kalan gün ──');
  const d = dunyaKur();
  const s = await odemeBekleyenler(d);
  for (const [yol, ab] of Object.entries(s)) {
    const sapan: string[] = [];
    for (const [saat, beklenen] of CIZELGE) {
      const k = await d.erisim.karar(ab.firmaId, new Date(ab.ilkBasarisizlik.getTime() + saat * SAAT));
      if (k.kalanGun !== beklenen) sapan.push(`${saat}s kalanGun=${k.kalanGun}/${beklenen}`);
    }
    check(`G-${yol} ⭐ ${CIZELGE.length} noktada kalanGun beklenen (10 → 0, kısıt anında 0'da durur)`,
      sapan.length === 0, sapan.join(' · '));
  }
  const d3 = await d.erisim.karar('F-D', new Date(s.D.ilkBasarisizlik.getTime() + 74 * SAAT));
  check('G-D2 ⭐ denemenin ilk çekimi başarısız, 3. gün: 7 — eski kod tampona (erisimSonu) sayıp −1 diyordu',
    d3.kalanGun === 7, `kalanGun=${d3.kalanGun}`);
  // `karar` saatini satırı okumadan ÖNCE alır; webhook `ilkBasarisizlik`i
  // arada yazarsa istek anı ondan birkaç ms geride kalır.
  const geride = await d.erisim.karar('F-Y', new Date(s.Y.ilkBasarisizlik.getTime() - 5));
  check('G-SINIR istek saati ilkBasarisizlik\'ten 5 ms geride: 10 — kısıt gününü aşan 11 DEĞİL',
    geride.kalanGun === 10, `kalanGun=${geride.kalanGun}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  E — E-POSTA ≡ EKRAN: GERÇEK `gonder`in sayısı
// ═════════════════════════════════════════════════════════════════════════
async function eBlogu(): Promise<void> {
  console.log('\n── E · e-posta ≡ ekran: 289 saat ──');
  const d = dunyaKur();
  const { Y: ab } = await odemeBekleyenler(d);
  const ayrisan: string[] = [];
  let okunan = 0;
  for (let saat = 0; saat <= 12 * 24; saat++) {
    const an = ab.ilkBasarisizlik.getTime() + saat * SAAT;
    const e = await epostaninSayisi(d, ab, an);
    const k = await d.erisim.karar(ab.firmaId, new Date(an));
    if (e !== null) okunan++;
    if (e !== k.kalanGun) ayrisan.push(`${saat}s e-posta=${e} ekran=${k.kalanGun}`);
  }
  check('E-FIXTURE 289 e-postanın hepsinden sayı okundu (konu kalıbı tutuyor)',
    okunan === 289, `okunan=${okunan}`);
  check('E1 ⭐ 289 saatin hepsinde e-postadaki "N gün sonra kısıtlanacak" = ekrandaki kalanGun',
    ayrisan.length === 0, ayrisan.slice(0, 5).join(' · '));
}

// ═════════════════════════════════════════════════════════════════════════
//  L — GERÇEK DUNNING MERDİVENİ: ekranın 0'ı kısıtlama koşumuna denk
// ═════════════════════════════════════════════════════════════════════════
interface Kosum {
  gun: number;
  ekran: number | null;
  once: string;
  sonra: string;
  konular: string[];
}

/**
 * Merdiven günde bir koşar (10:00). Başarısızlık sabahsa ilk koşum aynı gün
 * (+2 saat), öğleden sonraysa ertesi sabah (+20 saat) gelir — gün aralığının
 * iki ucu; merdivenin gün hesabı `Math.round`a kayarsa yalnız ikincisi
 * yakalar. Başarısızlık webhook'u kayıtlı; iyzico yeniden denemeyi REDDEDER
 * (kart hâlâ geçmiyor), merdiven e-postasını gönderir.
 */
async function merdivenSenaryosu(ofsetSaat: number, gunSayisi = 12) {
  const d = dunyaKur();
  const { Y: ab } = await odemeBekleyenler(d);
  d.db.ekle('webhookOlayi', {
    abonelikKodu: 'sub-F-Y', olayTipi: 'subscription.order.failure',
    siparisKodu: 'siparis-Y', alindi: ab.ilkBasarisizlik,
  });
  const kosumlar: Kosum[] = [];
  for (let gun = 0; gun <= gunSayisi; gun++) {
    const an = ab.ilkBasarisizlik.getTime() + gun * GUN + ofsetSaat * SAAT;
    const k = await d.erisim.karar(ab.firmaId, new Date(an));
    const ilk = d.epostalar.length;
    await saatte(an, () => d.dunning.merdiveniYurut());
    kosumlar.push({
      gun, ekran: k.kalanGun, once: k.durum, sonra: d.oku('F-Y').durum,
      konular: d.epostalar.slice(ilk).filter((e) => e.kime === 'F-Y@ornek.test').map((e) => e.konu),
    });
  }
  return { d, ab, kosumlar };
}

const kisitlayan = (ks: Kosum[]) => ks.find((x) => x.once === 'ODEME_BEKLIYOR' && x.sonra === 'KISITLI');
const kisitSayisi = (konu: string) => /hesabınız (-?\d+) gün sonra kısıtlanacak/.exec(konu)?.[1];

async function lBlogu(): Promise<void> {
  console.log('\n── L · gerçek dunning merdiveni ↔ geri sayım ──');
  for (const [ad, ofset] of [['sabah', 2], ['öğleden sonra', 20]] as const) {
    const { d, ab, kosumlar } = await merdivenSenaryosu(ofset);
    console.log(`    [${ad}, koşum başarısızlıktan +${ofset} saat] gün | ekran | durum | e-posta`);
    for (const x of kosumlar) {
      console.log(`      ${String(x.gun).padStart(2)} | ${String(x.ekran).padStart(5)} | ${x.once} → ${x.sonra} | ${x.konular.join(' · ')}`);
    }
    const kisit = kisitlayan(kosumlar);
    const gonderilen = kosumlar.flatMap((x) => x.konular).join(' | ');
    check(`L-FIXTURE-${ad} merdiven gerçekten yürüdü: 3. · 7. gün e-postası, 10. gün KISITLI + e-postası`,
      kisit?.gun === 10 && /hatırlatması/.test(gonderilen) && /kısıtlanacak/.test(gonderilen) &&
        /salt-okunur moda alındı/.test(gonderilen),
      `kisit=${kisit?.gun} e-postalar=${gonderilen}`);

    const erken = kosumlar.filter((x) => x.once === 'ODEME_BEKLIYOR' && x.sonra === 'KISITLI' && x.ekran !== 0);
    const gec = kosumlar.filter((x) => x.once === 'ODEME_BEKLIYOR' && x.ekran === 0 && x.sonra !== 'KISITLI');
    const onceki = kosumlar.find((x) => kisit && x.gun === kisit.gun - 1);
    check(`L1-${ad} ⭐ ekran > 0 iken kısıtlanmadı; ekranı 0 gören İLK koşum kısıtladı ("0 gün kaldı" bir koşumdan kısa)`,
      !!kisit && erken.length === 0 && gec.length === 0 && (onceki?.ekran ?? 0) >= 1,
      `erken=${erken.map((x) => x.gun)} gec=${gec.map((x) => x.gun)} onceki=${onceki?.ekran}`);

    const yedinci = kosumlar.find((x) => x.konular.some((k) => kisitSayisi(k) !== undefined));
    const sayi = yedinci?.konular.map(kisitSayisi).find((x) => x !== undefined);
    check(`L2-${ad} ⭐ 7. gün e-postası "${sayi} gün sonra kısıtlanacak" = aynı an ekran (${yedinci?.ekran})`,
      yedinci?.gun === 7 && sayi !== undefined && Number(sayi) === yedinci.ekran && yedinci.ekran === 3,
      `gun=${yedinci?.gun} e-posta=${sayi} ekran=${yedinci?.ekran}`);

    const sonra = await d.erisim.karar(ab.firmaId, new Date(ab.ilkBasarisizlik.getTime() + 11 * GUN));
    check(`L3-${ad} kısıttan sonra KISITLI: kalanGun null, salt-okunur (erişim çekirdekten)`,
      sonra.durum === 'KISITLI' && sonra.kalanGun === null && sonra.erisimVar === true && sonra.saltOkunur === true,
      `durum=${sonra.durum} kalan=${sonra.kalanGun} erisim=${sonra.erisimVar} salt=${sonra.saltOkunur}`);

    // FIXTURE KANITI: satırın öbür tarih alanları `ilkBasarisizlik`ten AYRIK
    // — L2 yanlış alana (sonDeneme · guncellendi · olusturuldu) sayan kodu ayırt eder.
    const satir = d.oku('F-Y');
    const ilk = satir.ilkBasarisizlik.getTime();
    check(`L-FIXTURE2-${ad} merdiven damgaları simüle saatte (sonDeneme, guncellendi ≥ ilk + 3 gün), açılış bir yıl önce`,
      satir.sonDeneme.getTime() >= ilk + 3 * GUN && satir.guncellendi.getTime() >= ilk + 3 * GUN &&
        satir.olusturuldu.getTime() <= ilk - 300 * GUN,
      `sonDeneme=+${((satir.sonDeneme.getTime() - ilk) / GUN).toFixed(2)}g guncellendi=+${((satir.guncellendi.getTime() - ilk) / GUN).toFixed(2)}g ` +
        `olusturuldu=${((satir.olusturuldu.getTime() - ilk) / GUN).toFixed(0)}g`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  N — SAYI YOK: `ilkBasarisizlik` yazılmadan önceki GERÇEK ara an
// ═════════════════════════════════════════════════════════════════════════
async function nBlogu(): Promise<void> {
  console.log('\n── N · ilkBasarisizlik yok / kisitlandi dolu → sayı yok ──');
  const d = dunyaKur();
  d.satir('F-N', { durum: 'AKTIF', erisimSonu: new Date(Date.now() - 5 * DAKIKA) });
  d.iyzicoDurumu['sub-F-N'] = 'UNPAID'; // ret iyzico'dan doğrulanır (bkz. `odemeBekleyenler`)
  // `tahsilatBasarisiz` durumu ÖNCE yazar, `ilkBasarisizlik`i SONRA (ayrı
  // sorgu). Arada gelen istek bu satırı görür — an yakalanır, uydurulmaz.
  const gercek = d.abonelik.durumDegistir.bind(d.abonelik);
  let araAn: { satir: Satir; karar: any } | null = null;
  (d.abonelik as any).durumDegistir = async (...args: Parameters<typeof gercek>) => {
    const sonuc = await gercek(...args);
    araAn = { satir: { ...d.oku('F-N') }, karar: await d.erisim.karar('F-N') };
    return sonuc;
  };
  try {
    await d.abonelik.tahsilatBasarisiz('sub-F-N', 'siparis-N');
  } finally {
    (d.abonelik as any).durumDegistir = gercek;
  }
  const a = araAn as { satir: Satir; karar: any } | null;
  check('N-FIXTURE ara an yakalandı: durum ODEME_BEKLIYOR, ilkBasarisizlik HENÜZ null',
    a?.satir.durum === 'ODEME_BEKLIYOR' && a?.satir.ilkBasarisizlik === null,
    `durum=${a?.satir.durum} ilk=${a?.satir.ilkBasarisizlik}`);
  check('N1 ⭐ ilkBasarisizlik yokken kalanGun null (çökmez, NaN/eksi yazmaz); şerit yine "Ödemeniz alınamadı"',
    a?.karar.kalanGun === null && a?.karar.uyari?.baslik === 'Ödemeniz alınamadı',
    `kalanGun=${a?.karar.kalanGun} baslik=${a?.karar.uyari?.baslik}`);
  const yazildi = await d.erisim.karar('F-N');
  check('N-OLCUT aynı satır ilkBasarisizlik yazılınca 10 (N1 kör değil)',
    yazildi.kalanGun === 10, `kalanGun=${yazildi.kalanGun}`);

  // Mevcut kural korunur: kısıt anı yazılmışsa geri sayım yok.
  d.oku('F-N').kisitlandi = new Date();
  const kisitli = await d.erisim.karar('F-N');
  check('N2 kisitlandi doluysa kalanGun null (mevcut kural korundu)',
    kisitli.durum === 'ODEME_BEKLIYOR' && kisitli.kalanGun === null, `kalanGun=${kisitli.kalanGun}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  H — HAVALEYE GEÇMİŞ SATIR: merdiven taramaz → sayı YOK
// ═════════════════════════════════════════════════════════════════════════
/**
 * HAVALE + ODEME_BEKLIYOR satırı. 24.09'a dek havale onayı iyzico kart
 * aboneliğini kapatmıyordu ve eski aboneliğin başarısız çekim webhook'u
 * satırı ödeme yöntemine bakmadan ODEME_BEKLIYOR yapıyordu. `d792251`den beri
 * onay kart aboneliğini kapatır, webhook da HAVALE satırını yok sayar — yani
 * bu satır yalnız o tarihten ÖNCE yazılmış veride durur; burada doğrudan
 * kurulur. Merdiven yalnız KART satırlarını tarar, kısıt HİÇ gelmez: sayı
 * verilseydi 10'dan 0'a inip orada donardı.
 */
async function hBlogu(): Promise<void> {
  console.log('\n── H · havaleye geçmiş (eski) satır: kısıt yok → sayı yok ──');
  const d = dunyaKur();
  const ilkBasarisizlik = new Date(Date.now() - 2 * SAAT);
  d.satir('F-H', {
    durum: 'ODEME_BEKLIYOR', odemeYontemi: 'HAVALE', erisimSonu: new Date(Date.now() + 300 * GUN),
    ilkBasarisizlik, sonDeneme: ilkBasarisizlik,
  });
  const ab = d.oku('F-H');
  check('H-FIXTURE eski veri satırı: ODEME_BEKLIYOR + HAVALE + ilkBasarisizlik dolu, kısıt yok',
    ab.durum === 'ODEME_BEKLIYOR' && ab.odemeYontemi === 'HAVALE' && ab.ilkBasarisizlik instanceof GercekDate &&
      ab.kisitlandi === null,
    `durum=${ab.durum} yontem=${ab.odemeYontemi} ilk=${ab.ilkBasarisizlik} kisit=${ab.kisitlandi}`);

  const kosumlar: Array<{ gun: number; ekran: number | null; durum: string }> = [];
  for (let gun = 0; gun <= 12; gun++) {
    const an = ab.ilkBasarisizlik.getTime() + gun * GUN + 2 * SAAT;
    const k = await d.erisim.karar('F-H', new Date(an));
    await saatte(an, () => d.dunning.merdiveniYurut());
    kosumlar.push({ gun, ekran: k.kalanGun, durum: d.oku('F-H').durum });
  }
  check('H-FIXTURE2 GERÇEK merdiven 13 koşumda satırı hiç kısıtlamadı (KART değil — kısıt planlanmamış)',
    kosumlar.every((x) => x.durum === 'ODEME_BEKLIYOR'), kosumlar.map((x) => `${x.gun}:${x.durum}`).join(' '));
  check('H1 ⭐ 13 koşumun hepsinde kalanGun null — gelmeyecek bir kısıta sayılmaz, 0\'da donmaz',
    kosumlar.every((x) => x.ekran === null), kosumlar.map((x) => `${x.gun}:${x.ekran}`).join(' '));

  // ÖLÇÜT: aynı satır KART olsaydı sayı verirdi.
  ab.odemeYontemi = 'KART';
  const kart = await d.erisim.karar('F-H', new Date(ab.ilkBasarisizlik.getTime() + 2 * SAAT));
  check('H-OLCUT aynı satır KART olunca 10 (H1 kör değil)', kart.kalanGun === 10, `kalanGun=${kart.kalanGun}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  K — YAPILANDIRMA: DUNNING_KISIT_GUNU=14 → üçü birlikte 14'e sayar
// ═════════════════════════════════════════════════════════════════════════
async function kBlogu(): Promise<void> {
  console.log('\n── K · DUNNING_KISIT_GUNU=14: ekran, e-posta, merdiven ──');
  process.env.DUNNING_KISIT_GUNU = '14';
  try {
    const { kosumlar } = await merdivenSenaryosu(2, 16);
    // Ekran her koşumdan ÖNCE okundu: satır sonradan KISITLI olunca karar
    // geçmiş bir an için bile KISITLI dalından cevap verir.
    const g3 = kosumlar.find((x) => x.gun === 3);
    check('K1 ⭐ ekran 3. gün 11 (14 − 3) — varsayılan 10 DEĞİL',
      g3?.once === 'ODEME_BEKLIYOR' && g3.ekran === 11, `durum=${g3?.once} kalanGun=${g3?.ekran}`);
    const yedinci = kosumlar.find((x) => x.gun === 7);
    const sayi = yedinci?.konular.map(kisitSayisi).find((x) => x !== undefined);
    check('K2 ⭐ 7. gün e-postası "7 gün sonra kısıtlanacak" = ekran 7',
      sayi === '7' && yedinci?.ekran === 7, `e-posta=${sayi} ekran=${yedinci?.ekran}`);
    const kisit = kisitlayan(kosumlar);
    const onceki = kosumlar.find((x) => kisit && x.gun === kisit.gun - 1);
    check('K3 ⭐ merdiven 14. günde kısıtladı (10. günde DEĞİL); o koşumda ekran 0, bir öncekinde 1',
      kisit?.gun === 14 && kisit.ekran === 0 && onceki?.ekran === 1,
      `kisit=${kisit?.gun} ekran=${kisit?.ekran} onceki=${onceki?.ekran}`);
  } finally {
    delete process.env.DUNNING_KISIT_GUNU;
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  A — ERİŞİM KARARI VE ŞERİT DEĞİŞMEDİ
// ═════════════════════════════════════════════════════════════════════════
const SERIT = {
  seviye: 'uyari',
  baslik: 'Ödemeniz alınamadı',
  metin: 'Kayıtlı kartınızdan tahsilat yapılamadı. Kartınızı güncellerseniz kesinti yaşamazsınız.',
  eylem: { etiket: 'Kartı güncelle', yol: '/abonelik/kart' },
};

async function aBlogu(): Promise<void> {
  console.log('\n── A · erişim kararı ve şerit değişmedi ──');
  const d = dunyaKur();
  const s = await odemeBekleyenler(d);
  const ayrisan: string[] = [];
  const metin: string[] = [];
  let taranan = 0;
  for (const [yol, ab] of Object.entries(s)) {
    for (let saat = 0; saat <= 12 * 24; saat++) {
      const simdi = new Date(ab.ilkBasarisizlik.getTime() + saat * SAAT);
      const k = await d.erisim.karar(ab.firmaId, simdi);
      const c = abonelikErisimi({ durum: ab.durum, erisimSonu: ab.erisimSonu }, simdi);
      taranan++;
      if (k.erisimVar !== c.erisimVar || k.saltOkunur !== c.saltOkunur || !k.erisimVar || k.saltOkunur) {
        ayrisan.push(`${yol} ${saat}s servis={${k.erisimVar},${k.saltOkunur}} cekirdek={${c.erisimVar},${c.saltOkunur}}`);
      }
      if (JSON.stringify(k.uyari) !== JSON.stringify(SERIT)) metin.push(`${yol} ${saat}s ${JSON.stringify(k.uyari)}`);
    }
  }
  check('A1 ⭐ 3 yol × 289 saat: erişim = saf çekirdek — TAM erişim, salt-okunur değil (erisimSonu geçmişken bile)',
    taranan === 3 * 289 && ayrisan.length === 0, `taranan=${taranan} ${ayrisan.slice(0, 4).join(' · ')}`);
  check('A2 şerit birebir aynı: uyarı · "Ödemeniz alınamadı" · Kartı güncelle → /abonelik/kart',
    metin.length === 0, metin.slice(0, 2).join(' · '));
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nÖDEME BEKLİYOR GERİ SAYIMI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

/**
 * Bir bloğun fırlatması KIRMIZI bir assert olur, koşuyu bitirmez: kalan
 * bloklar yine koşar ve özet satırı (regresyon tablosunun okuduğu) basılır.
 */
async function blok(ad: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    check(`${ad} bloğu çökmeden bitti`, false, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

async function main(): Promise<void> {
  // Beklentiler varsayılan merdiveni ölçer (10. gün KISITLI); ortamdaki bir
  // dunning ayarı sayıları kaydırıp sahte kırmızı üretmesin.
  for (const ad of Object.keys(process.env)) if (ad.startsWith('DUNNING_')) delete process.env[ad];
  await blok('F', fBlogu);
  await blok('R', rBlogu);
  await blok('G', gBlogu);
  await blok('E', eBlogu);
  await blok('L', lBlogu);
  await blok('N', nBlogu);
  await blok('H', hBlogu);
  await blok('K', kBlogu);
  await blok('A', aBlogu);
  son();
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
