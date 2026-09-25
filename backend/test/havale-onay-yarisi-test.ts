/**
 * HAVALE ONAYI — AYNI HAVALEYE EŞZAMANLI İKİ ONAY  (`npm run test:havale-onay-yarisi`) · 25.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. GERÇEK `HavaleServisi` (teklif → fatura → onay → iptal),
 * `AbonelikServisi` (erişim uzatma + kart aboneliği kapatma) ve `FaturaServisi`
 * (kuyruğa alma), Postgres READ COMMITTED davranışını taklit eden bellek-Prisma
 * üzerinde koşar. Uç: `POST /api/yonetim/havale/:id/onayla` (yalnız admin).
 *
 * ── NEDEN ─────────────────────────────────────────────────────────────────
 * `odemeyiOnayla` havale satırını İŞLEM DIŞINDA okuyup "zaten onaylanmış mı"
 * denetimini orada yapıyordu; işlem içinde `erisimiUzat` aboneliği N ay
 * uzatıyor, en sonda KOŞULSUZ `update` ONAYLANDI yazıyordu. Aynı havaleye iki
 * onay isteği (çift tıklama, yavaş yanıttan sonra yeniden deneme, iki yönetici)
 * ikisi de ön denetimden geçebiliyordu. (Bugün ön yüzde bu ucu çağıran ekran
 * YOK — ölçüldü; istek API'den gelir.)
 *
 * ── DÜZELTME ───────────────────────────────────────────────────────────────
 * İşlemin İLK yazması KOŞULLU SAHİPLENME: `updateMany({ where: { id,
 * ...ONAYLANABILIR } })` (onay bekleyen durum + `onaylandi` boş). `count ===
 * 0` → işlem geri alınır, istek 400 ("zaten onaylanmış" / "iptal edilmiş");
 * onayın işlem sonrası yan etkileri (fatura kuyruğu → NES kesim talebi,
 * müşteri e-postası, kart aboneliğini kapatma) yalnız kazananda koşar.
 * Sahiplenme satırı işlem boyunca kilitli tuttuğu için o sürede gelen iptal
 * ve "fatura kesildi" de kilidi bekler (kod incelemesi M1): ikisi de aynı
 * koşulla yazar, commit'ten sonra ONAYLANDI'yı ezemez. "Fatura kesildi"
 * onaylı satıra YALNIZ numara yazar (eskiden ODEME_BEKLENIYOR'a çekip ikinci
 * onaya kapı açıyordu), iptal edilmiş satırda 400 verir (diriltmez).
 *
 * ── TAKLİT: READ COMMITTED (Postgres varsayılanı; depoda isolationLevel YOK) ─
 *   · her deyim olay döngüsüne döner: iki istek gerçekten iç içe geçer;
 *   · commit edilmemiş yazma başka işleme ve işlem dışı okumaya GÖRÜNMEZ;
 *   · UPDATE satır kilidi alır, kilit işlem bitene dek tutulur; kilitli satırı
 *     güncellemek isteyen BEKLER. Sahip commit ederse WHERE satırın YENİ
 *     sürümünde yeniden değerlendirilir, tutmazsa satır ATLANIR; sahip geri
 *     alırsa özgün satırla devam edilir (Postgres belgesi, "Read Committed
 *     Isolation Level"). Koşulsuz UPDATE commit'ten sonra yine yazar (kayıp
 *     güncelleme — taklit fazladan sıralamaz);
 *   · düz okuma kilit beklemez; işlem fırlatırsa her yazması geri alınır;
 *     kilitlenme (deadlock) P2034 ile düşer.
 *   Taklidin kendisi T bloğunda ölçülür (ölçüt kör değil).
 * ⚠ Taklit Prisma'nın `updateMany`sini TEK koşullu UPDATE sayar. Prisma 5.22
 * motoru (605197351a) üst düzey `updateMany`yi `relationMode` "foreignKeys"
 * iken `update_many_from_filter` ile koşar: `UPDATE … WHERE <koşul>`, sayı o
 * deyimin etkilediği satır. `relationMode = "prisma"` önce id okuyup
 * `WHERE id IN (…)` ile KOŞULSUZ günceller — sahiplenme o zaman korumaz. K
 * bloğu bu iki önkoşulu (şema + Prisma ana sürümü) kaynaktan sabitler.
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   T  taklit: izolasyon · kilit bekleme · yeniden değerlendirme · geri alma
 *   Y1 iki istek AYNI ANDA (ikisi de ön denetimden geçer, işlemler iç içe)
 *   Y2 ikinci istek birincinin işlemi AÇIKKEN gelir (kilidi bekler)
 *   Y3 ikincinin ön denetimi birincinin commit'inden ÖNCE, işlemi SONRA
 *   Y4 ilk sahiplenen işlem GERİ ALINIR → bekleyen istek kazanır, tek uzatma
 *   S  sıralı ikinci onay 400 + yönetim listesi · TEKLIF'ten doğrudan onay
 *   İ  iptal ↔ onay: iptal sahiplenmeden ÖNCE commit → onay 400 · iptalin
 *      ön okuması onaydan önce, yazması sonra → iptal 400 · iptal onayın
 *      AÇIK işleminin kilidini bekler → iptal 400 · ikinci iptal olay yazmaz
 *   F  onaydan sonra "fatura kesildi": yalnız numara, durum ONAYLANDI kalır
 *   FK "fatura kesildi": TEKLIF'te eskisi gibi · iptal edilmiş teklif
 *      DİRİLMEZ · onayın açık işlemiyle yarış → yalnız numara · numarasız
 *      istek 400 · olmayan kimlik P2025
 *   G  25.09 öncesi kusurdan kalma satır (onaylı, durumu geri çekilmiş):
 *      listede yok, yeniden onay/iptal 400, fatura no yalnız numara ·
 *      G2 ONAYLANDI ama onay anı boş (elle/eski veri): kapalı liste
 *   D  denetleyici: gövdedeki `havaleId` yoldaki kimliği ezemez
 *   Ö  ÖLÇÜM (assert değil): aynı aboneliğe FARKLI iki havale aynı anda
 *   K  kaynak: `relationMode`/`referentialIntegrity` "prisma" değil · Prisma 5.x
 * Her Y senaryosu fatura kuyruğunu GERÇEK `FaturaServisi.kuyrugaBak` +
 * `ElleMuhasebeAdaptoru` ile işler: NES kesim talebi e-postası da sayılır.
 *
 * Günlük: `HO_GUNLUK=1` Nest günlüğünü konsola da basar.
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { ElleMuhasebeAdaptoru } from '../src/ozellik/odeme/fatura/muhasebe.adaptor';
import { HavaleController } from '../src/ozellik/odeme/havale/havale.controller';
import { HavaleServisi } from '../src/ozellik/odeme/havale/havale.servisi';
import { IyzicoHatasi } from '../src/ozellik/odeme/iyzico/iyzico.client';

let passed = 0;
let failed = 0;
const failures: string[] = [];
const olcumler: string[] = [];

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

/** Assert DEĞİL: senaryonun ölçtüğü değer (özette tekrar basılır). */
function olcum(metin: string): void {
  olcumler.push(metin);
  console.log(`  · ÖLÇÜM ${metin}`);
}

const GUN = 86_400_000;
/** Kurulum beklemelerinin emniyet süresi — dolarsa senaryo yine biter, kanıt assert'i kırmızı yanar. */
const EMNIYET_MS = 2000;
/** Emniyet süresine düşen kurulum beklemeleri (Z assert'i: senaryo istenen sırayı kuramadı). */
let zamanAsimiSayisi = 0;

const tarih = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : 'yok');
const gunFarki = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / GUN);

/** Takvim ayı ekler — `AbonelikServisi.erisimiUzat` ile AYNI kural (`setMonth`). */
function ayEkle(d: Date, ay: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + ay);
  return x;
}

// ═════════════════════════════════════════════════════════════════════════
//  GÜNLÜK — yutulan hata GÖRÜNSÜN
// ═════════════════════════════════════════════════════════════════════════
const gunluk: Array<{ seviye: 'uyari' | 'hata'; metin: string }> = [];
const konsol = process.env.HO_GUNLUK ? new ConsoleLogger() : null;
Logger.overrideLogger({
  log: (m: unknown) => konsol?.log(m),
  debug: () => undefined,
  verbose: () => undefined,
  warn: (m: unknown) => {
    gunluk.push({ seviye: 'uyari', metin: String(m) });
    konsol?.warn(m);
  },
  error: (m: unknown) => {
    gunluk.push({ seviye: 'hata', metin: String(m) });
    konsol?.error(m);
  },
  fatal: (m: unknown) => {
    gunluk.push({ seviye: 'hata', metin: String(m) });
    konsol?.fatal(m);
  },
});
const hatalarSonra = (i: number) => gunluk.slice(i).filter((g) => g.seviye === 'hata').map((g) => g.metin);

// ═════════════════════════════════════════════════════════════════════════
//  İSTEK ETİKETİ — her deyim hangi istekten geldiğini bilir (AsyncLocalStorage)
// ═════════════════════════════════════════════════════════════════════════
const istekBaglami = new AsyncLocalStorage<{ istek: string }>();
const istekEtiketi = () => istekBaglami.getStore()?.istek ?? '-';
const istekle = <T>(istek: string, fn: () => Promise<T>): Promise<T> => istekBaglami.run({ istek }, fn);

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — READ COMMITTED + satır kilidi
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
  havaleOdemesi: {
    abonelik: { model: 'abonelik', yerel: 'abonelikId' },
    // 25.09 teklif paketi: teklif paketini taşır, `bekleyenler` onu da döndürür.
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
  },
  fatura: { abonelik: { model: 'abonelik', yerel: 'abonelikId' } },
};

/** Şemadaki @unique alanlar — ihlal P2002 (fatura tekilliği buna dayanır). */
const TEKILLER: Record<string, string[]> = {
  abonelik: ['firmaId', 'iyzicoAbonelikKodu'],
  havaleOdemesi: ['teklifNo'],
  fatura: ['tahsilatKodu'],
};

/** Prisma verilmeyen opsiyonel alanı `null` döndürür ve şema varsayılanını uygular — taklit de öyle. */
const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    durum: 'DENEME', denemeSonu: null, planliPaketSurumuId: null, paketGecisTarihi: null,
    odenenPaketSurumuId: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null, iyzicoMusteriKodu: null,
    iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART', ilkBasarisizlik: null,
    denemeSayisi: 0, sonDeneme: null, kisitlandi: null, iptalTalebi: null, iptalNedeni: null,
    olusturuldu: new Date(), guncellendi: new Date(),
  }),
  havaleOdemesi: () => ({
    durum: 'TEKLIF', paraBirimi: 'TRY', teklifNo: null, faturaNo: null, dekontUrl: null, aciklama: null,
    onaylayanId: null, onaylandi: null, uzatilanTarih: null, olusturuldu: new Date(), guncellendi: new Date(),
  }),
  abonelikOlayi: () => ({ oncekiDurum: null, yeniDurum: null, aciklama: null, veri: null, aktor: 'sistem', olusturuldu: new Date() }),
  fatura: () => ({
    denemeSayisi: 0, hata: null, saglayici: null, saglayiciId: null, faturaNo: null, faturaUrl: null,
    kesildi: null, olusturuldu: new Date(),
  }),
  firma: () => ({
    unvan: null, vergiNo: null, vergiDairesi: null, tcKimlikNo: null, faturaAdresi: null, il: null,
    ilce: null, faturaEposta: null, yetkiliEposta: null, imhaTarihi: null,
  }),
};

/** Yalnız ölçülen operatörler; tanınmayan koşul PATLAR (sessizce yok saymaz). */
function kosulUygula(deger: any, kosul: any): boolean {
  if (kosul === null) return deger === null || deger === undefined;
  if (kosul instanceof Date) return deger instanceof Date && deger.getTime() === kosul.getTime();
  if (typeof kosul !== 'object') return deger === kosul;
  const bos = deger === null || deger === undefined;
  return Object.entries(kosul).every(([op, v]: [string, any]) => {
    switch (op) {
      // SQL: NULL hiçbir listede değildir ve `<>` karşılaştırmasında düşer.
      case 'in': return !bos && (v as any[]).some((x) => kosulUygula(deger, x));
      case 'notIn': return !bos && !(v as any[]).some((x) => kosulUygula(deger, x));
      case 'not': return v === null ? !bos : !bos && !kosulUygula(deger, v);
      case 'gt': return !bos && deger > v;
      case 'gte': return !bos && deger >= v;
      case 'lt': return !bos && deger < v;
      case 'lte': return !bos && deger <= v;
      default: throw new Error(`bellek-Prisma: desteklenmeyen operatör "${op}"`);
    }
  });
}

function whereUygula(satir: Satir, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]: [string, any]) => {
    const liste = (x: any) => (Array.isArray(x) ? x : [x]);
    if (k === 'OR') return (v as any[]).some((w) => whereUygula(satir, w));
    if (k === 'AND') return liste(v).every((w) => whereUygula(satir, w));
    // Prisma: NOT içindeki koşulların HİÇBİRİ tutmamalı (üç değerli SQL
    // mantığı taklit edilmez: NOT yalnız kullanıcı sayımında geçer, o tablo boş).
    if (k === 'NOT') return !liste(v).some((w) => whereUygula(satir, w));
    return kosulUygula(satir[k], v);
  });
}

function sirala(satirlar: Satir[], orderBy: any): Satir[] {
  if (!orderBy) return satirlar;
  const kurallar = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
  return [...satirlar].sort((a, b) => {
    for (const [alan, yon] of kurallar) {
      const x = a[alan];
      const y = b[alan];
      if (x === y || (x instanceof Date && y instanceof Date && x.getTime() === y.getTime())) continue;
      const kucuk = x < y ? -1 : 1;
      return yon === 'desc' ? -kucuk : kucuk;
    }
    return 0;
  });
}

/** `undefined` = dokunma; `{ increment }` sayaç; Decimal/Json/Date DEĞER olarak yazılır. */
function veriUygula(hedef: Satir, data: Satir): void {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const islem = v !== null && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Prisma.Decimal);
    if (islem && 'increment' in v) hedef[k] = (hedef[k] ?? 0) + (v as any).increment;
    else hedef[k] = v;
  }
}

const OKUMALAR = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findMany', 'count']);

/** İstemci `undefined` alanları göndermez: tanımlı alanı olmayan `data` BOŞTUR. */
const bosVeri = (data: Satir | undefined) => !data || Object.values(data).every((v) => v === undefined);

/** Veritabanı olay günlüğü — senaryoların FIXTURE KANITI buradan okunur. */
interface DbOlayi {
  sira: number;
  tur: 'deyim' | 'islemBasla' | 'commit' | 'geriAl' | 'kilitBekle';
  istek: string;
  /** İşlem no; işlem dışı (tek deyimlik) deyimde null. */
  islem: number | null;
  model?: string;
  ad?: string;
  /** kilitBekle: kilidi tutan işlemin isteği ve no'su. */
  sahipIstek?: string;
  sahipIslem?: number;
}

interface DeyimBilgisi {
  istek: string;
  islem: number | null;
  model: string;
  ad: string;
  arg: any;
}

interface Kancalar {
  /** Deyim koşmadan ÖNCE (fırlatırsa deyim hata verir). */
  deyimOncesi?: (o: DeyimBilgisi) => Promise<void> | void;
  /** Deyimin sonucu HESAPLANDIKTAN sonra, çağırana dönmeden önce. */
  deyimSonrasi?: (o: DeyimBilgisi) => Promise<void> | void;
  /** Etkileşimli işlem commit edilmeden hemen önce (işlem AÇIK, kilitler tutuluyor). */
  commitOncesi?: (o: { islem: number; istek: string }) => Promise<void> | void;
}

interface Islem {
  no: number;
  istek: string;
  /** Tek deyimlik (işlem dışı) deyimin kendi işlemi — olay günlüğüne commit yazılmaz. */
  otomatik: boolean;
  /** Commit edilmemiş sürümler: model → id → satır. */
  ozel: Map<string, Map<string, Satir>>;
  /** Bu işlemin eklediği satırlar: model → id. */
  yeni: Map<string, Set<string>>;
  kilitler: Set<string>;
  durum: 'acik' | 'commit' | 'geriAlindi';
  bitti: Promise<void>;
  bitir: () => void;
}

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  /** Yalnız COMMIT edilmiş satırlar. */
  const tablo = (m: string) => (tablolar[m] ??= []);
  const olaylar: DbOlayi[] = [];
  const dinleyiciler = new Set<() => void>();
  const kancalar: Kancalar = {};
  const acik = new Set<Islem>();
  const kilitler = new Map<string, { sahip: Islem; uyandir: Array<() => void> }>();
  /** Bekleme çizgesi: işlem no → beklediği işlem (kilitlenme tespiti). */
  const bekliyor = new Map<number, Islem>();
  let islemSayaci = 0;
  let sira = 0;

  const durt = () => {
    for (const d of [...dinleyiciler]) d();
  };
  const yaz = (o: Omit<DbOlayi, 'sira'>) => {
    olaylar.push({ sira: ++sira, ...o });
    durt();
  };

  /**
   * Koşul tutana dek bekler: her DB olayında ve `durt()`ta yeniden bakar.
   * ⚠ Emniyet zamanlayıcısı REF'Lİ (unref YOK) ve iş bitince temizlenir:
   * `unref`li tek zamanlayıcı döngüyü boşaltıp kapıyı ÖZETSİZ ÇIKIŞ 0 ile
   * kapatabiliyordu (asılı söz dersi). Dolarsa `false` döner, senaryo sürer.
   */
  function bekleKosul(kosul: () => boolean, ms = EMNIYET_MS): Promise<boolean> {
    if (kosul()) return Promise.resolve(true);
    return new Promise<boolean>((coz) => {
      const bitir = (sonuc: boolean) => {
        clearTimeout(zaman);
        dinleyiciler.delete(dinle);
        if (!sonuc) zamanAsimiSayisi++;
        coz(sonuc);
      };
      const dinle = () => {
        if (kosul()) bitir(true);
      };
      const zaman = setTimeout(() => bitir(false), ms);
      dinleyiciler.add(dinle);
    });
  }

  function islemAc(otomatik: boolean): Islem {
    let bitir!: () => void;
    const bitti = new Promise<void>((r) => (bitir = r));
    const ic: Islem = {
      no: ++islemSayaci, istek: istekEtiketi(), otomatik, ozel: new Map(), yeni: new Map(),
      kilitler: new Set(), durum: 'acik', bitti, bitir,
    };
    acik.add(ic);
    return ic;
  }

  /** Deyimin gördüğü satırlar: commit edilmiş + işlemin KENDİ yazdıkları. */
  function gorunen(model: string, ic: Islem | null): Satir[] {
    const ozel = ic?.ozel.get(model);
    const liste = tablo(model).map((s) => ozel?.get(s.id) ?? s);
    for (const id of ic?.yeni.get(model) ?? []) liste.push(ozel!.get(id)!);
    return liste;
  }

  function ozelYaz(ic: Islem, model: string, satir: Satir, yeni = false): void {
    if (!ic.ozel.has(model)) ic.ozel.set(model, new Map());
    ic.ozel.get(model)!.set(satir.id, satir);
    if (yeni) {
      if (!ic.yeni.has(model)) ic.yeni.set(model, new Set());
      ic.yeni.get(model)!.add(satir.id);
    }
  }

  /** Satır kilidi: sahibi başka AÇIK işlemse o bitene dek bekler. `true` = bekledi. */
  async function kilitAl(model: string, id: string, ic: Islem): Promise<boolean> {
    const anahtar = `${model}:${id}`;
    let bekledi = false;
    for (;;) {
      const k = kilitler.get(anahtar);
      if (!k) {
        kilitler.set(anahtar, { sahip: ic, uyandir: [] });
        ic.kilitler.add(anahtar);
        return bekledi;
      }
      if (k.sahip === ic) return bekledi;
      // Kilitlenme: sahibin bekleme zinciri bu işleme dönüyorsa Postgres
      // birini düşürür (40P01; Prisma P2034 "write conflict or a deadlock").
      for (let z: Islem | undefined = k.sahip; z; z = bekliyor.get(z.no)) {
        if (z === ic) throw Object.assign(new Error(`bellek-Prisma: deadlock detected (${anahtar})`), { code: 'P2034' });
      }
      bekledi = true;
      bekliyor.set(ic.no, k.sahip);
      yaz({ tur: 'kilitBekle', istek: ic.istek, islem: ic.no, model, sahipIstek: k.sahip.istek, sahipIslem: k.sahip.no });
      await new Promise<void>((r) => k.uyandir.push(r));
      bekliyor.delete(ic.no);
    }
  }

  function kilitleriBirak(ic: Islem): void {
    for (const a of ic.kilitler) {
      const k = kilitler.get(a);
      if (k?.sahip !== ic) continue;
      kilitler.delete(a);
      k.uyandir.forEach((r) => r());
    }
    ic.kilitler.clear();
  }

  function commit(ic: Islem): void {
    for (const [model, satirlar] of ic.ozel) {
      const t = tablo(model);
      for (const [id, s] of satirlar) {
        const i = t.findIndex((r) => r.id === id);
        if (i >= 0) t[i] = s;
        else t.push(s);
      }
    }
    ic.durum = 'commit';
    acik.delete(ic);
    kilitleriBirak(ic);
    ic.bitir();
    if (!ic.otomatik) yaz({ tur: 'commit', istek: ic.istek, islem: ic.no });
  }

  function geriAl(ic: Islem): void {
    ic.ozel.clear();
    ic.yeni.clear();
    ic.durum = 'geriAlindi';
    acik.delete(ic);
    kilitleriBirak(ic);
    ic.bitir();
    if (!ic.otomatik) yaz({ tur: 'geriAl', istek: ic.istek, islem: ic.no });
  }

  /**
   * Tekil alan: commit edilmiş ya da kendi satırıyla çakışma → P2002; başka
   * AÇIK işlemin yazısıyla çakışma → o işlem bitene dek bekle, yeniden bak
   * (Postgres tekil dizini de böyle bekler).
   */
  async function tekilKapisi(model: string, satir: Satir, ic: Islem): Promise<void> {
    for (const alan of TEKILLER[model] ?? []) {
      const deger = satir[alan];
      if (deger === null || deger === undefined) continue;
      for (;;) {
        const baska = [...acik].find(
          (o) => o !== ic && [...(o.ozel.get(model)?.values() ?? [])].some((r) => r.id !== satir.id && r[alan] === deger),
        );
        if (baska) {
          await baska.bitti;
          continue;
        }
        if (gorunen(model, ic).some((r) => r.id !== satir.id && r[alan] === deger)) {
          throw Object.assign(new Error(`Unique constraint failed on the fields: (\`${alan}\`)`), { code: 'P2002' });
        }
        break;
      }
    }
  }

  /**
   * UPDATE: adaylar deyimin gördüğü satırlardan seçilir; her aday için satır
   * kilidi alınır. Kilit alındıktan sonra WHERE satırın EN SON sürümünde
   * (arada başka işlem commit ettiyse onunki) YENİDEN değerlendirilir ve
   * tutmayan satır ATLANIR — Postgres READ COMMITTED'ın UPDATE kuralı.
   */
  async function guncelle(model: string, ic: Islem, where: any, data: any): Promise<Satir[]> {
    const adaylar = gorunen(model, ic).filter((r) => whereUygula(r, where)).map((r) => r.id as string);
    const sonuc: Satir[] = [];
    for (const id of adaylar) {
      await kilitAl(model, id, ic);
      const surum = ic.ozel.get(model)?.get(id) ?? tablo(model).find((r) => r.id === id);
      if (!surum || !whereUygula(surum, where)) continue;
      const yeni = { ...surum };
      veriUygula(yeni, data);
      // Şemada `guncellendi @updatedAt`: her yazımda o anın saati.
      if ('guncellendi' in yeni) yeni.guncellendi = new Date();
      await tekilKapisi(model, yeni, ic);
      ozelYaz(ic, model, yeni);
      sonuc.push(yeni);
    }
    return sonuc;
  }

  /** Prisma her okumada TAZE nesne döndürür; ilişkiyi yalnız `include`/`select` ile getirir. */
  function yansit(model: string, satir: Satir, spec: any, ic: Islem | null): Satir {
    const iliski = (ad: string, alt: any) => {
      const il = ILISKILER[model]?.[ad];
      if (!il) throw new Error(`bellek-Prisma: bilinmeyen ilişki ${model}.${ad}`);
      const hedef = gorunen(il.model, ic).find((r) => r.id === satir[il.yerel]);
      return hedef ? yansit(il.model, hedef, alt === true ? {} : alt, ic) : null;
    };
    if (spec?.select) {
      const sonuc: Satir = {};
      for (const [k, v] of Object.entries(spec.select)) {
        if (!v) continue;
        sonuc[k] = ILISKILER[model]?.[k] ? iliski(k, v) : satir[k] ?? null;
      }
      return sonuc;
    }
    const sonuc: Satir = { ...satir };
    for (const [k, v] of Object.entries(spec?.include ?? {})) if (v) sonuc[k] = iliski(k, v);
    return sonuc;
  }

  /** Her deyim: olay döngüsüne döner (ağ gidiş-dönüşü), kancalar, olay kaydı. */
  async function deyim<T>(model: string, ad: string, arg: any, ic: Islem | null, govde: () => Promise<T> | T): Promise<T> {
    const bilgi: DeyimBilgisi = { istek: istekEtiketi(), islem: ic?.no ?? null, model, ad, arg };
    await Promise.resolve();
    if (ic && ic.durum !== 'acik') {
      throw new Error(`bellek-Prisma: Transaction already closed (işlem ${ic.no} ${ic.durum}; ${model}.${ad})`);
    }
    await kancalar.deyimOncesi?.(bilgi);
    yaz({ tur: 'deyim', istek: bilgi.istek, islem: bilgi.islem, model, ad });
    const sonuc = await govde();
    await kancalar.deyimSonrasi?.(bilgi);
    return sonuc;
  }

  /** Yazma deyimi: işlem içindeyse onun içinde; değilse TEK deyimlik kendi işleminde (otomatik commit). */
  async function yazmaIslemi<T>(ic: Islem | null, fn: (w: Islem) => Promise<T>): Promise<T> {
    if (ic) return fn(ic);
    const w = islemAc(true);
    try {
      const r = await fn(w);
      commit(w);
      return r;
    } catch (e) {
      geriAl(w);
      throw e;
    }
  }

  const bulunamadi = (model: string, ne: string) => Object.assign(new Error(`${model}: ${ne}`), { code: 'P2025' });

  function modelYuzu(model: string, ic: Islem | null) {
    const oku = (arg: any) => gorunen(model, ic).filter((r) => whereUygula(r, arg?.where));
    return {
      findUnique: (arg: any) =>
        deyim(model, 'findUnique', arg, ic, () => {
          const s = oku(arg)[0];
          return s ? yansit(model, s, arg, ic) : null;
        }),
      findUniqueOrThrow: (arg: any) =>
        deyim(model, 'findUniqueOrThrow', arg, ic, () => {
          const s = oku(arg)[0];
          if (!s) throw bulunamadi(model, 'No record was found');
          return yansit(model, s, arg, ic);
        }),
      findFirst: (arg: any = {}) =>
        deyim(model, 'findFirst', arg, ic, () => {
          const s = sirala(oku(arg), arg.orderBy)[0];
          return s ? yansit(model, s, arg, ic) : null;
        }),
      findMany: (arg: any = {}) =>
        deyim(model, 'findMany', arg, ic, () => {
          let liste = sirala(oku(arg), arg.orderBy);
          if (arg.take !== undefined) liste = liste.slice(0, arg.take);
          return liste.map((s) => yansit(model, s, arg, ic));
        }),
      count: (arg: any = {}) => deyim(model, 'count', arg, ic, () => oku(arg).length),
      create: (arg: any) =>
        deyim(model, 'create', arg, ic, () =>
          yazmaIslemi(ic, async (w) => {
            const satir: Satir = { id: randomUUID(), ...(VARSAYILAN[model]?.() ?? {}) };
            veriUygula(satir, arg.data);
            await tekilKapisi(model, satir, w);
            ozelYaz(w, model, satir, true);
            return yansit(model, satir, arg, w);
          }),
        ),
      // Prisma 5.22 motoru BOŞ `data`da yazmaz (kaynak okundu): `update` satırı
      // yalnız OKUR (`update_one_with_selection`), `updateMany` sorgu atmadan
      // 0 döner (`update_records`); `@updatedAt` de yalnız dolu veride eklenir.
      update: (arg: any) =>
        deyim(model, 'update', arg, ic, () => {
          if (bosVeri(arg.data)) {
            const s = oku(arg)[0];
            if (!s) throw bulunamadi(model, 'Record to update not found.');
            return yansit(model, s, arg, ic);
          }
          return yazmaIslemi(ic, async (w) => {
            const [s] = await guncelle(model, w, arg.where, arg.data);
            if (!s) throw bulunamadi(model, 'Record to update not found.');
            return yansit(model, s, arg, w);
          });
        }),
      updateMany: (arg: any) =>
        deyim(model, 'updateMany', arg, ic, () =>
          bosVeri(arg.data)
            ? { count: 0 }
            : yazmaIslemi(ic, async (w) => ({ count: (await guncelle(model, w, arg.where, arg.data)).length })),
        ),
    };
  }

  /** `ic` verilirse etkileşimli işlemin `tx`i; verilmezse kök istemci. */
  function istemci(ic: Islem | null): any {
    return new Proxy(
      {},
      {
        get: (_h, ad: string | symbol) => {
          if (typeof ad !== 'string' || ad === 'then') return undefined;
          if (ad === '$transaction') {
            // Prisma'da `tx` üzerinde iç içe işlem YOK.
            if (ic) return undefined;
            return async (fn: unknown) => {
              if (typeof fn !== 'function') throw new Error('bellek-Prisma: dizi biçimli $transaction bu pakette modellenmedi');
              const yeni = islemAc(false);
              yaz({ tur: 'islemBasla', istek: yeni.istek, islem: yeni.no });
              let sonuc: unknown;
              try {
                sonuc = await (fn as (tx: unknown) => Promise<unknown>)(istemci(yeni));
                await kancalar.commitOncesi?.({ islem: yeni.no, istek: yeni.istek });
              } catch (e) {
                geriAl(yeni);
                throw e;
              }
              commit(yeni);
              return sonuc;
            };
          }
          if (ad.startsWith('$')) {
            return () => {
              throw new Error(`bellek-Prisma: ${ad} bu pakette modellenmedi`);
            };
          }
          return modelYuzu(ad, ic);
        },
      },
    );
  }

  /** Fixture: doğrudan COMMIT edilmiş satır (deyim değil, olay yazılmaz). */
  function ekle(model: string, data: Satir): Satir {
    const satir: Satir = { id: randomUUID(), ...(VARSAYILAN[model]?.() ?? {}) };
    veriUygula(satir, data);
    tablo(model).push(satir);
    return satir;
  }

  return {
    prisma: istemci(null),
    tablo,
    ekle,
    olaylar,
    kancalar,
    bekleKosul,
    durt,
    acikIslemSayisi: () => acik.size,
    kilitSayisi: () => kilitler.size,
  };
}
type BellekDb = ReturnType<typeof bellekPrisma>;

/** Olay günlüğü sorguları — FIXTURE KANITI. */
const ilkOlay = (db: BellekDb, f: (o: DbOlayi) => boolean) => db.olaylar.find(f);
const commitOlayi = (db: BellekDb, istek: string) => ilkOlay(db, (o) => o.tur === 'commit' && o.istek === istek);
const islemBaslaOlayi = (db: BellekDb, istek: string) => ilkOlay(db, (o) => o.tur === 'islemBasla' && o.istek === istek);
const havaleOkumasi = (db: BellekDb, istek: string) =>
  ilkOlay(db, (o) => o.tur === 'deyim' && o.istek === istek && o.model === 'havaleOdemesi' && OKUMALAR.has(o.ad ?? ''));
const kilitBekledi = (db: BellekDb, istek: string, sahipIstek: string) =>
  db.olaylar.some((o) => o.tur === 'kilitBekle' && o.istek === istek && o.sahipIstek === sahipIstek);

// ═════════════════════════════════════════════════════════════════════════
//  SAHTE iyzico — yalnız kart aboneliğini kapatma yolu (ACTIVE iptal edilir,
//  kapalıya ikinci iptal 201403 — 20.08 sandbox ölçümü, docs/adim0-tutanak)
// ═════════════════════════════════════════════════════════════════════════
function sahteIyzico() {
  const abonelikler = new Map<string, { kod: string; durum: string; musteri: string }>();
  const cagrilar: Array<{ ad: string; kod: string }> = [];
  const detay = (a: { kod: string; durum: string; musteri: string }) => ({
    referenceCode: a.kod,
    customerReferenceCode: a.musteri,
    pricingPlanReferenceCode: 'plan-pro',
    subscriptionStatus: a.durum,
    createdDate: new Date(Date.now() - 60 * GUN).toISOString(),
    orders: [],
  });
  const bul = (kod: string) => {
    const a = abonelikler.get(kod);
    if (!a) throw new IyzicoHatasi('201400', `Abonelik bulunamadı: ${kod}`, 422);
    return a;
  };
  const istemci: any = {
    abonelikIptal: async (kod: string) => {
      cagrilar.push({ ad: 'abonelikIptal', kod });
      await Promise.resolve();
      const a = bul(kod);
      if (a.durum !== 'ACTIVE' && a.durum !== 'UNPAID') throw new IyzicoHatasi('201403', 'Bu abonelik iptal edilemez.', 422);
      a.durum = 'CANCELED';
      return {};
    },
    abonelikGetir: async (kod: string) => {
      cagrilar.push({ ad: 'abonelikGetir', kod });
      await Promise.resolve();
      return detay(bul(kod));
    },
    abonelikAra: async () => {
      cagrilar.push({ ad: 'abonelikAra', kod: '' });
      await Promise.resolve();
      return [...abonelikler.values()].map(detay);
    },
  };
  return {
    istemci,
    kur: (kod: string, musteri: string) => void abonelikler.set(kod, { kod, durum: 'ACTIVE', musteri }),
    sayi: (ad: string) => cagrilar.filter((c) => c.ad === ad).length,
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  DÜNYA — gerçek servisler, sahte iyzico/e-posta/muhasebe
// ═════════════════════════════════════════════════════════════════════════
const HAVALE_TUTARI = 16490;
const ONAY_EPOSTASI = /ödemeniz alındı/;
/** `ElleMuhasebeAdaptoru`nun yöneticiye giden NES kesim talebi (havalede numara kayıtlıysa "kontrol edin" konusu). */
const NES_EPOSTASI = /^\[MetaPriceX\] (Fatura kesilecek|Havale faturası kayıtlı)/;
const YONETIM = 'yonetim@ornek.test';

function dunyaKur() {
  const db = bellekPrisma();
  const iyz = sahteIyzico();
  db.ekle('paket', { id: 'P1', kod: 'pro-mek', ad: 'Pro — Mekanik' });
  db.ekle('paketSurumu', {
    id: 'S1', paketId: 'P1', surumNo: 2, iyzicoPlanKodu: 'plan-pro', tutar: new Prisma.Decimal(1649),
    paraBirimi: 'TRY', periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 30,
  });

  const epostalar: Array<{ kime: string; konu: string; kritik: boolean }> = [];
  const eposta: any = {
    yapilandirildiMi: () => true,
    gonder: async (m: { kime: string; konu: string }) => {
      await Promise.resolve();
      epostalar.push({ kime: m.kime, konu: m.konu, kritik: false });
    },
    // `elle` muhasebenin NES kesim talebi KRİTİK yoldan gider.
    gonderKritik: async (m: { kime: string; konu: string }) => {
      await Promise.resolve();
      epostalar.push({ kime: m.kime, konu: m.konu, kritik: true });
    },
  };
  // CANLI muhasebe modu (`elle`): kesim yerine yöneticiye NES kesim talebi.
  const muhasebe = new ElleMuhasebeAdaptoru(new ConfigService({}), db.prisma, eposta);

  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci, eposta);
  const fatura = new FaturaServisi(db.prisma, muhasebe, eposta);
  const havale = new HavaleServisi(db.prisma, abonelik, fatura, eposta);

  // YAN ETKİ SAYAÇLARI: "tam bir kez" ÇAĞRIDAN sayılır — fatura satırının
  // tekilliği (`tahsilatKodu` @unique) ikinci kuyruğa almayı SESSİZCE yutar.
  const cagri = { faturaKuyrugu: 0, kartKapat: 0 };
  const asilKuyruk = fatura.kuyrugaAl.bind(fatura);
  fatura.kuyrugaAl = async (t: Parameters<FaturaServisi['kuyrugaAl']>[0]) => {
    cagri.faturaKuyrugu++;
    return asilKuyruk(t);
  };
  const asilKapat = abonelik.havaleIcinKartAboneliginiKapat.bind(abonelik);
  abonelik.havaleIcinKartAboneliginiKapat = async (
    id: string,
    p: Parameters<AbonelikServisi['havaleIcinKartAboneliginiKapat']>[1],
  ) => {
    cagri.kartKapat++;
    return asilKapat(id, p);
  };

  /** Biten istekler — kurulum beklemeleri "istek bitti mi"ye de bakar. */
  const bitenler = new Set<string>();

  /** Satın alma yolunun yazdığı kartlı satır (AKTİF, iyzico'da ACTIVE); havaleyle ödeyecek. */
  function kartliSatir(firmaId: string, erisimSonu: Date): Satir {
    // Tam fatura kimliği: NES kesim talebi eksik kimlikte düşerdi (T47 kapısı).
    db.ekle('firma', {
      id: firmaId, ad: `Firma ${firmaId}`, unvan: `${firmaId} Mühendislik Ltd.`, vergiNo: '1234567890',
      vergiDairesi: 'Kadıköy', faturaAdresi: 'Moda Cad. 1', il: 'İstanbul', ilce: 'Kadıköy',
      faturaEposta: `muhasebe@${firmaId.toLowerCase()}.test`, yetkiliEposta: `yetkili@${firmaId.toLowerCase()}.test`,
    });
    const kod = `sub-${firmaId}`;
    iyz.kur(kod, `mus-${firmaId}`);
    return db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S1', durum: 'AKTIF', erisimSonu, odemeYontemi: 'KART',
      iyzicoAbonelikKodu: kod, iyzicoKokKodu: kod, iyzicoMusteriKodu: `mus-${firmaId}`,
      iyzicoDurum: 'ACTIVE', iyzicoSonKontrol: new Date(),
    });
  }

  /** Yöneticinin GERÇEK ilk adımları: teklif (→ TEKLIF) ve istenirse "fatura kesildi" (→ ODEME_BEKLENIYOR). */
  async function bekleyenHavale(firmaId: string, p: { ayAdedi?: number; faturali?: boolean } = {}): Promise<string> {
    return istekle('kurulum', async () => {
      const teklif = await havale.teklifOlustur({
        firmaId, paketSurumuId: 'S1', ayAdedi: p.ayAdedi ?? 12, tutar: HAVALE_TUTARI, olusturanId: 'yonetici-0',
      });
      if (p.faturali !== false) await havale.faturaKesildi(teklif.id, `FTR-${teklif.teklifNo}`, 'yonetici-0');
      return teklif.id;
    });
  }

  const havaleSatiri = (id: string) => db.tablo('havaleOdemesi').find((r) => r.id === id)!;
  const abonelikSatiri = (id: string) => db.tablo('abonelik').find((r) => r.id === id)!;
  /** GERÇEK fatura taraması (`@Cron` her dakika): kuyruktaki satır → `elle` → NES kesim talebi. */
  const nesKesimi = () => istekle('cron', () => fatura.kuyrugaBak());
  const olaySayisi = (tip: string, abonelikId: string) =>
    db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && o.tip === tip).length;

  return {
    db, iyz, epostalar, abonelik, fatura, havale, cagri, bitenler,
    kartliSatir, bekleyenHavale, havaleSatiri, abonelikSatiri, nesKesimi, olaySayisi,
  };
}
type Dunya = ReturnType<typeof dunyaKur>;

// ═════════════════════════════════════════════════════════════════════════
//  İSTEKLER
// ═════════════════════════════════════════════════════════════════════════
interface IstekSonucu {
  istek: string;
  tamam: boolean;
  donen?: { abonelik: Satir; havale: Satir };
  hata?: { ad: string; durumKodu: number | null; mesaj: string };
}

const hataOzeti = (s: IstekSonucu | undefined) =>
  !s ? 'istek yok' : s.tamam ? `${s.istek}: BAŞARILI` : `${s.istek}: ${s.hata?.durumKodu ?? '-'} ${s.hata?.ad} "${s.hata?.mesaj}"`;

/**
 * Denetleyicinin çağırdığı GERÇEK servis ucu (`HavaleController.onayla` →
 * `odemeyiOnayla`). Her istek kendi dekontunu taşır: sahiplenmenin yazdığı
 * `dekontUrl` kazananınki mi, ölçülür.
 */
async function onayIstegi(d: Dunya, istek: string, havaleId: string): Promise<IstekSonucu> {
  try {
    const donen = await istekle(istek, () =>
      d.havale.odemeyiOnayla({ havaleId, onaylayanId: `yonetici-${istek}`, dekontUrl: `dekont-${istek}` }),
    );
    return { istek, tamam: true, donen: donen as any };
  } catch (e: any) {
    const durumKodu = typeof e?.getStatus === 'function' ? e.getStatus() : null;
    return { istek, tamam: false, hata: { ad: e?.name ?? typeof e, durumKodu, mesaj: e?.message ?? String(e) } };
  } finally {
    d.bitenler.add(istek);
    d.db.durt();
  }
}

/** Onaydan sonraki ölçümler — commit edilmiş tablolardan. */
function olc(d: Dunya, abonelikId: string, havaleId: string) {
  const olaylar = d.db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId);
  return {
    erisimSonu: d.abonelikSatiri(abonelikId).erisimSonu as Date,
    durumDegisti: olaylar.filter((o) => o.tip === 'durum.degisti').length,
    musteriEpostasi: d.epostalar.filter((e) => ONAY_EPOSTASI.test(e.konu)).length,
    faturaCagrisi: d.cagri.faturaKuyrugu,
    faturaSatiri: d.db.tablo('fatura').filter((f) => f.tahsilatKodu === `havale:${havaleId}`).length,
    kartKapatCagrisi: d.cagri.kartKapat,
    iyzicoIptal: d.iyz.sayi('abonelikIptal'),
    /** Yöneticiye giden NES kesim talebi — `nesKesimi()` koştuktan SONRA anlamlı. */
    nesEpostasi: d.epostalar.filter((e) => e.kritik && e.kime === YONETIM && NES_EPOSTASI.test(e.konu)).length,
    havale: d.havaleSatiri(havaleId),
  };
}
type Olcum = ReturnType<typeof olc>;

/** Fatura taramasını koşup (NES kesim talebi) ölçer. */
async function olcNesli(d: Dunya, abonelikId: string, havaleId: string): Promise<Olcum> {
  await d.nesKesimi();
  return olc(d, abonelikId, havaleId);
}

const olcumSatiri = (k: string, o: Olcum, taban: Date, sonuclar: IstekSonucu[]) =>
  `${k}: erişim sonu ${tarih(o.erisimSonu)} (taban ${tarih(taban)}, +${gunFarki(o.erisimSonu, taban)} gün) · ` +
  `durum.degisti ${o.durumDegisti} · "ödemeniz alındı" ${o.musteriEpostasi} · fatura kuyruğu çağrısı ${o.faturaCagrisi} ` +
  `(satır ${o.faturaSatiri}, NES talebi ${o.nesEpostasi}) · kart kapatma ${o.kartKapatCagrisi} (iyzico iptal ${o.iyzicoIptal}) · ` +
  `havale ${o.havale.durum} / onaylayan ${o.havale.onaylayanId} · ${sonuclar.map(hataOzeti).join(' | ')}`;

/**
 * AYNI havaleye iki istekten sonra beklenen son hâl: TAM BİR onay. Her ölçüt
 * AYRI assert (paylaşılan assert hangi ölçütün düştüğünü gizler).
 */
function tekOnayOlcutleri(
  k: string,
  d: Dunya,
  o: Olcum,
  sonuclar: IstekSonucu[],
  p: { taban: Date; kazanan?: string; gunluk0: number },
): void {
  const kazananlar = sonuclar.filter((s) => s.tamam);
  const kaybedenler = sonuclar.filter((s) => !s.tamam);
  const kazanan = kazananlar[0];
  const kaybeden = kaybedenler[0];
  const beklenen = ayEkle(p.taban, 12);
  check(`${k}.1 tam BİR istek başarılı`, kazananlar.length === 1, sonuclar.map(hataOzeti).join(' | '));
  if (p.kazanan) check(`${k}.1b kazanan ${p.kazanan}`, kazanan?.istek === p.kazanan, sonuclar.map(hataOzeti).join(' | '));
  check(
    `${k}.2 kaybeden istek 400`,
    kaybedenler.length === 1 && kaybeden.hata?.durumKodu === 400,
    kaybeden ? hataOzeti(kaybeden) : 'kaybeden YOK — iki istek de onaylandı',
  );
  check(`${k}.3 kaybedenin mesajı "zaten onaylanmış"`, /zaten onaylanmış/.test(kaybeden?.hata?.mesaj ?? ''), hataOzeti(kaybeden));
  check(
    `${k}.4 abonelik TEK kez uzadı (+12 ay)`,
    o.erisimSonu.getTime() === beklenen.getTime(),
    `erişim sonu ${tarih(o.erisimSonu)} · beklenen ${tarih(beklenen)} · tabandan +${gunFarki(o.erisimSonu, p.taban)} gün`,
  );
  check(`${k}.5 "durum.degisti" olayı TAM BİR`, o.durumDegisti === 1, `${o.durumDegisti}`);
  check(`${k}.6 "ödemeniz alındı" e-postası TAM BİR`, o.musteriEpostasi === 1, `${o.musteriEpostasi}`);
  check(`${k}.7 fatura kuyruğa TAM BİR kez alındı (çağrı)`, o.faturaCagrisi === 1, `${o.faturaCagrisi}`);
  check(`${k}.8 fatura satırı TAM BİR`, o.faturaSatiri === 1, `${o.faturaSatiri}`);
  check(`${k}.9 kart aboneliği kapatma TAM BİR kez denendi`, o.kartKapatCagrisi === 1, `${o.kartKapatCagrisi}`);
  check(`${k}.10 iyzico'ya TEK iptal isteği gitti`, o.iyzicoIptal === 1, `${o.iyzicoIptal}`);
  check(`${k}.11 havale ONAYLANDI`, o.havale.durum === 'ONAYLANDI', o.havale.durum);
  // `onaylandi` "onaylanabilir" koşulunun yükünü taşır (durum geri çekilse de onaylı sayılır).
  check(`${k}.11b onay anı (onaylandi) yazıldı`, o.havale.onaylandi instanceof Date, `${o.havale.onaylandi}`);
  check(
    `${k}.12 onaylayan kazanan istek (denetim izi ezilmedi)`,
    !!kazanan && o.havale.onaylayanId === `yonetici-${kazanan.istek}`,
    `onaylayan ${o.havale.onaylayanId} · kazanan ${kazanan?.istek ?? 'yok'}`,
  );
  check(
    `${k}.13 uzatılan tarih = erişim sonu`,
    o.havale.uzatilanTarih instanceof Date && o.havale.uzatilanTarih.getTime() === o.erisimSonu.getTime(),
    `uzatılan ${tarih(o.havale.uzatilanTarih)} · erişim ${tarih(o.erisimSonu)}`,
  );
  check(
    `${k}.14 kazananın yanıtı commit edilen satırla aynı`,
    !!kazanan?.donen &&
      kazanan.donen.havale.durum === 'ONAYLANDI' &&
      (kazanan.donen.abonelik.erisimSonu as Date).getTime() === o.erisimSonu.getTime(),
    kazanan?.donen ? `${kazanan.donen.havale.durum} · ${tarih(kazanan.donen.abonelik.erisimSonu)}` : 'yanıt yok',
  );
  check(
    `${k}.15 açık işlem ve tutulan kilit kalmadı`,
    d.db.acikIslemSayisi() === 0 && d.db.kilitSayisi() === 0,
    `açık işlem ${d.db.acikIslemSayisi()} · kilit ${d.db.kilitSayisi()}`,
  );
  const hatalar = hatalarSonra(p.gunluk0);
  check(`${k}.16 günlükte HATA yok`, hatalar.length === 0, hatalar.join(' | '));
  check(`${k}.17 NES kesim talebi e-postası TAM BİR (gerçek fatura taraması)`, o.nesEpostasi === 1, `${o.nesEpostasi}`);
  check(
    `${k}.18 dekont kazananınki (kaybeden yazamadı)`,
    !!kazanan && o.havale.dekontUrl === `dekont-${kazanan.istek}`,
    `dekont ${o.havale.dekontUrl} · kazanan ${kazanan?.istek ?? 'yok'}`,
  );
  olcum(olcumSatiri(k, o, p.taban, sonuclar));
}

/** Kartlı satır: erişim sonu gerçek saatten 20 gün ileride (sabit tarih değil — saat bombası dersi). */
const tabanTarih = () => new Date(Date.now() + 20 * GUN);

/** Olay döngüsünde bir tur (bekleyen işin gerçekten ASILI olduğunu görmek için). */
const turAt = () => new Promise<void>((r) => setImmediate(r));

/**
 * BARİYER kancası: verilen istekler havale satırını İLK kez okuyunca durur;
 * hepsi okuyana dek hiçbiri ilerlemez (hepsi satırı onaysız görür), sonra
 * birlikte bırakılır.
 */
function okumaBariyeri(d: Dunya, istekler: string[]): Kancalar['deyimSonrasi'] {
  const okuyanlar = new Set<string>();
  return async (o) => {
    if (!istekler.includes(o.istek) || o.model !== 'havaleOdemesi' || !OKUMALAR.has(o.ad) || okuyanlar.has(o.istek)) return;
    okuyanlar.add(o.istek);
    d.db.durt();
    await d.db.bekleKosul(() => okuyanlar.size === istekler.length);
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  T — TAKLİT: READ COMMITTED + satır kilidi (ölçüt kör değil)
// ═════════════════════════════════════════════════════════════════════════
/**
 * Etkileşimli işlemi `fn`den sonra AÇIK tutar (kilitler tutulur); `kapat`
 * 'commit' ya da 'geriAl' der. `soz` işlem bitince null ya da hatayı verir.
 */
function acikTut(db: BellekDb, istek: string, fn: (tx: any) => Promise<unknown>) {
  let karar!: (k: 'commit' | 'geriAl') => void;
  const kapi = new Promise<'commit' | 'geriAl'>((r) => (karar = r));
  let hazir!: (deger: unknown) => void;
  const hazirSoz = new Promise<unknown>((r) => (hazir = r));
  const soz = istekle(istek, () =>
    db.prisma.$transaction(async (tx: any) => {
      try {
        hazir(await fn(tx));
      } catch (e) {
        hazir(e);
        throw e;
      }
      if ((await kapi) === 'geriAl') throw new Error('bilinçli geri alma');
    }),
  ).then(
    () => null,
    (e: unknown) => e,
  );
  return { hazir: hazirSoz, kapat: (k: 'commit' | 'geriAl') => karar(k), soz };
}

async function tBlogu(): Promise<void> {
  console.log('\n── T · taklit: READ COMMITTED + satır kilidi ──');
  const tohum = (db: BellekDb, id = 'h1') =>
    db.ekle('havaleOdemesi', { id, abonelikId: 'a1', durum: 'ODEME_BEKLENIYOR', tutar: new Prisma.Decimal(1), ayAdedi: 1 });
  const sahiplen = (tx: any, kim: string) =>
    tx.havaleOdemesi.updateMany({
      where: { id: 'h1', durum: { in: ['TEKLIF', 'ODEME_BEKLENIYOR'] }, onaylandi: null },
      data: { durum: 'ONAYLANDI', onaylayanId: kim, onaylandi: new Date() },
    });

  // T1–T4: A açık işlemde koşullu sahiplenir; B aynı sahiplenmeyi dener; A commit eder.
  {
    const db = bellekPrisma();
    tohum(db);
    const a = acikTut(db, 'A', async (tx) => {
      const r = await sahiplen(tx, 'A');
      const icerden = await tx.havaleOdemesi.findUnique({ where: { id: 'h1' } });
      return { sayi: r.count, durum: icerden?.durum };
    });
    const aSonuc = (await a.hazir) as { sayi: number; durum: string };
    const disardan = await istekle<any>('C', () => db.prisma.havaleOdemesi.findUnique({ where: { id: 'h1' } }));
    check('T1 commit edilmemiş yazı işlem dışına GÖRÜNMEZ (okuma kilit beklemez)', disardan?.durum === 'ODEME_BEKLENIYOR', disardan?.durum);
    check('T2 işlem kendi yazısını görür', aSonuc?.sayi === 1 && aSonuc?.durum === 'ONAYLANDI', JSON.stringify(aSonuc));
    let bBitti = false;
    const b = istekle('B', () => db.prisma.$transaction((tx: any) => sahiplen(tx, 'B'))).then((r: any) => {
      bBitti = true;
      return r;
    });
    const bekledi = await db.bekleKosul(() => kilitBekledi(db, 'B', 'A'));
    await turAt();
    check('T3 kilitli satırı güncellemek isteyen işlem BEKLER', bekledi && !bBitti, `kilit bekleme ${bekledi} · B bitti ${bBitti}`);
    a.kapat('commit');
    const bSonuc = await b;
    await a.soz;
    const s = db.tablo('havaleOdemesi')[0];
    check('T4 sahip commit edince WHERE YENİ sürümde yeniden değerlendirilir → 0 satır', bSonuc?.count === 0, JSON.stringify(bSonuc));
    check('T4b satır sahibin yazdığı gibi kaldı', s.durum === 'ONAYLANDI' && s.onaylayanId === 'A', `${s.durum}/${s.onaylayanId}`);
    check('T4c açık işlem ve kilit kalmadı', db.acikIslemSayisi() === 0 && db.kilitSayisi() === 0);
  }

  // T5: sahip GERİ ALIRSA bekleyen özgün satırla devam eder.
  {
    const db = bellekPrisma();
    tohum(db);
    const a = acikTut(db, 'A', (tx) => sahiplen(tx, 'A'));
    await a.hazir;
    const b = istekle<any>('B', () => db.prisma.$transaction((tx: any) => sahiplen(tx, 'B')));
    await db.bekleKosul(() => kilitBekledi(db, 'B', 'A'));
    a.kapat('geriAl');
    const bSonuc = await b;
    const aHata = await a.soz;
    const s = db.tablo('havaleOdemesi')[0];
    check('T5 sahip geri alınca bekleyen ÖZGÜN satırla devam eder → 1 satır', bSonuc?.count === 1, JSON.stringify(bSonuc));
    check('T5b geri alınan yazı iz bırakmadı', aHata instanceof Error && s.onaylayanId === 'B', `${s.durum}/${s.onaylayanId}`);
  }

  // T6: KOŞULSUZ UPDATE kilidi bekler, commit'ten sonra ÜSTÜNE yazar (kayıp
  // güncelleme) — taklit Postgres'ten fazla SIRALAMAZ.
  {
    const db = bellekPrisma();
    tohum(db);
    const a = acikTut(db, 'A', (tx) => tx.havaleOdemesi.update({ where: { id: 'h1' }, data: { ayAdedi: 5 } }));
    await a.hazir;
    const b = istekle('B', () => db.prisma.havaleOdemesi.update({ where: { id: 'h1' }, data: { ayAdedi: 7 } }));
    const bekledi = await db.bekleKosul(() => kilitBekledi(db, 'B', 'A'));
    a.kapat('commit');
    await b;
    await a.soz;
    const s = db.tablo('havaleOdemesi')[0];
    check('T6 koşulsuz UPDATE bekler, commit sonrası ÜSTÜNE yazar', bekledi && s.ayAdedi === 7, `bekledi ${bekledi} · ayAdedi ${s.ayAdedi}`);
  }

  // T7: eklenen satır commit edilmeden görünmez, geri almayla silinir.
  {
    const db = bellekPrisma();
    tohum(db);
    const a = acikTut(db, 'A', (tx) => tx.abonelikOlayi.create({ data: { abonelikId: 'a1', tip: 'deneme' } }));
    await a.hazir;
    const disardan = await db.prisma.abonelikOlayi.count({ where: { abonelikId: 'a1' } });
    a.kapat('geriAl');
    await a.soz;
    check('T7 eklenen satır commit edilmeden görünmez, geri almayla silinir', disardan === 0 && db.tablo('abonelikOlayi').length === 0, `dışarıdan ${disardan} · tablo ${db.tablo('abonelikOlayi').length}`);
  }

  // T8: tanınmayan operatör PATLAR.
  {
    const db = bellekPrisma();
    tohum(db);
    const hata = await db.prisma.havaleOdemesi
      .findMany({ where: { durum: { contains: 'ONAY' } } })
      .then(() => '', (e: Error) => e.message);
    check('T8 tanınmayan operatör sessizce yok sayılmaz', /desteklenmeyen operatör/.test(hata), hata || 'fırlatmadı');
  }

  // T9: kilitlenme birini P2034 ile düşürür, diğeri tamamlanır — kapı asılı kalmaz.
  {
    const db = bellekPrisma();
    tohum(db, 'h1');
    tohum(db, 'h2');
    let aIlk!: () => void;
    const aIlkSoz = new Promise<void>((r) => (aIlk = r));
    let bIlk!: () => void;
    const bIlkSoz = new Promise<void>((r) => (bIlk = r));
    const a = istekle('A', () =>
      db.prisma.$transaction(async (tx: any) => {
        await tx.havaleOdemesi.update({ where: { id: 'h1' }, data: { ayAdedi: 2 } });
        aIlk();
        await bIlkSoz;
        await tx.havaleOdemesi.update({ where: { id: 'h2' }, data: { ayAdedi: 2 } });
      }),
    ).then(() => 'tamam', (e: any) => e?.code ?? String(e));
    const b = istekle('B', () =>
      db.prisma.$transaction(async (tx: any) => {
        await aIlkSoz;
        await tx.havaleOdemesi.update({ where: { id: 'h2' }, data: { ayAdedi: 3 } });
        bIlk();
        await db.bekleKosul(() => kilitBekledi(db, 'A', 'B'));
        await tx.havaleOdemesi.update({ where: { id: 'h1' }, data: { ayAdedi: 3 } });
      }),
    ).then(() => 'tamam', (e: any) => e?.code ?? String(e));
    const sonuc = (await Promise.all([a, b])).sort().join(',');
    check('T9 kilitlenme birini P2034 ile düşürür, diğeri tamamlanır', sonuc === 'P2034,tamam', sonuc);
    check('T9b açık işlem ve kilit kalmadı', db.acikIslemSayisi() === 0 && db.kilitSayisi() === 0);
  }

  // T10: BOŞ veri — motor yazmaz: `updateMany` 0 döner (satır eşleşse de),
  // `update` yalnız okur; ikisi de başka işlemin kilidini BEKLEMEZ.
  {
    const db = bellekPrisma();
    tohum(db);
    const a = acikTut(db, 'A', (tx) => tx.havaleOdemesi.update({ where: { id: 'h1' }, data: { ayAdedi: 5 } }));
    await a.hazir;
    const bos = await istekle<any>('B', () => db.prisma.havaleOdemesi.updateMany({ where: { id: 'h1' }, data: { faturaNo: undefined } }));
    const okuma = await istekle<any>('C', () => db.prisma.havaleOdemesi.update({ where: { id: 'h1' }, data: {} }));
    a.kapat('commit');
    await a.soz;
    check(
      'T10 boş veri: updateMany 0 döner, update yalnız okur (kilit beklemez)',
      bos?.count === 0 && okuma?.ayAdedi === 1 && !kilitBekledi(db, 'B', 'A') && !kilitBekledi(db, 'C', 'A'),
      `updateMany ${bos?.count} · update ayAdedi ${okuma?.ayAdedi}`,
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  Y — AYNI HAVALEYE İKİ ONAY İSTEĞİ
// ═════════════════════════════════════════════════════════════════════════
async function y1Blogu(): Promise<void> {
  console.log('\n── Y1 · iki istek AYNI ANDA: ikisi de ön denetimden geçer, işlemler iç içe ──');
  const d = dunyaKur();
  const taban = tabanTarih();
  const ab = d.kartliSatir('FY1', taban);
  const havaleId = await d.bekleyenHavale('FY1');
  const g0 = gunluk.length;
  d.db.kancalar.deyimSonrasi = okumaBariyeri(d, ['A', 'B']);
  const sonuclar = await Promise.all([onayIstegi(d, 'A', havaleId), onayIstegi(d, 'B', havaleId)]);
  d.db.kancalar.deyimSonrasi = undefined;
  const ilkCommit = ilkOlay(d.db, (x) => x.tur === 'commit');
  const aOkuma = havaleOkumasi(d.db, 'A');
  const bOkuma = havaleOkumasi(d.db, 'B');
  check(
    "Y1.0 FIXTURE: iki istek de satırı ilk commit'ten ÖNCE okudu",
    !!(aOkuma && bOkuma && ilkCommit) && aOkuma.sira < ilkCommit.sira && bOkuma.sira < ilkCommit.sira,
    `okuma A ${aOkuma?.sira} · B ${bOkuma?.sira} · ilk commit ${ilkCommit?.sira}`,
  );
  check(
    'Y1.0b FIXTURE: iki istek de işlem AÇTI (işlem dışı ön denetimden geçti)',
    !!islemBaslaOlayi(d.db, 'A') && !!islemBaslaOlayi(d.db, 'B'),
  );
  tekOnayOlcutleri('Y1', d, await olcNesli(d, ab.id, havaleId), sonuclar, { taban, gunluk0: g0 });
}

async function y2Blogu(): Promise<void> {
  console.log('\n── Y2 · ikinci istek birincinin işlemi AÇIKKEN gelir: kilidi bekler ──');
  const d = dunyaKur();
  const taban = tabanTarih();
  const ab = d.kartliSatir('FY2', taban);
  const havaleId = await d.bekleyenHavale('FY2');
  const g0 = gunluk.length;
  let bSozu: Promise<IstekSonucu> | null = null;
  d.db.kancalar.commitOncesi = async (o) => {
    if (o.istek !== 'A' || bSozu) return;
    // A'nın işlemi AÇIK, kilitleri tutuyor: B şimdi gelir. A, B onun bir
    // kilidini beklemeye başlayana (ya da B bitene) dek commit etmez.
    bSozu = onayIstegi(d, 'B', havaleId);
    await d.db.bekleKosul(() => kilitBekledi(d.db, 'B', 'A') || d.bitenler.has('B'));
  };
  const a = await onayIstegi(d, 'A', havaleId);
  const b = bSozu ? await bSozu : undefined;
  d.db.kancalar.commitOncesi = undefined;
  const aBasla = islemBaslaOlayi(d.db, 'A');
  const aCommit = commitOlayi(d.db, 'A');
  const bBasla = islemBaslaOlayi(d.db, 'B');
  check(
    "Y2.0 FIXTURE: B, A'nın işlemi AÇIKKEN işlem açtı (ön denetimden geçti)",
    !!(aBasla && aCommit && bBasla) && aBasla.sira < bBasla.sira && bBasla.sira < aCommit.sira,
    `A başla ${aBasla?.sira} · B başla ${bBasla?.sira} · A commit ${aCommit?.sira}`,
  );
  check("Y2.0b FIXTURE: B, A'nın işleminin tuttuğu satır kilidini BEKLEDİ", kilitBekledi(d.db, 'B', 'A'));
  tekOnayOlcutleri('Y2', d, await olcNesli(d, ab.id, havaleId), b ? [a, b] : [a], { taban, kazanan: 'A', gunluk0: g0 });
}

async function y3Blogu(): Promise<void> {
  console.log("\n── Y3 · ikincinin ön denetimi birincinin commit'inden ÖNCE, işlemi SONRA ──");
  const d = dunyaKur();
  const taban = tabanTarih();
  const ab = d.kartliSatir('FY3', taban);
  const havaleId = await d.bekleyenHavale('FY3');
  const g0 = gunluk.length;
  let bOkudu = false;
  d.db.kancalar.deyimSonrasi = async (o) => {
    if (o.istek !== 'B' || bOkudu || o.model !== 'havaleOdemesi' || !OKUMALAR.has(o.ad)) return;
    bOkudu = true;
    // B satırı onaysız okudu; A işlemini commit edene dek B bekler.
    await d.db.bekleKosul(() => !!commitOlayi(d.db, 'A') || d.bitenler.has('A'));
  };
  const sonuclar = await Promise.all([onayIstegi(d, 'A', havaleId), onayIstegi(d, 'B', havaleId)]);
  d.db.kancalar.deyimSonrasi = undefined;
  const bOkuma = havaleOkumasi(d.db, 'B');
  const aCommit = commitOlayi(d.db, 'A');
  const bBasla = islemBaslaOlayi(d.db, 'B');
  check(
    "Y3.0 FIXTURE: B satırı A'nın commit'inden ÖNCE okudu, işlemini SONRA açtı",
    !!(bOkuma && aCommit && bBasla) && bOkuma.sira < aCommit.sira && aCommit.sira < bBasla.sira,
    `B okuma ${bOkuma?.sira} · A commit ${aCommit?.sira} · B başla ${bBasla?.sira}`,
  );
  tekOnayOlcutleri('Y3', d, await olcNesli(d, ab.id, havaleId), sonuclar, { taban, kazanan: 'A', gunluk0: g0 });
}

async function y4Blogu(): Promise<void> {
  console.log('\n── Y4 · ilk sahiplenen işlem GERİ ALINIR → bekleyen istek kazanır, tek uzatma ──');
  const d = dunyaKur();
  const taban = tabanTarih();
  const ab = d.kartliSatir('FY4', taban);
  const havaleId = await d.bekleyenHavale('FY4');
  const g0 = gunluk.length;
  let bSozu: Promise<IstekSonucu> | null = null;
  d.db.kancalar.deyimOncesi = async (o) => {
    if (bSozu || o.istek !== 'A' || o.islem === null || o.model !== 'abonelikOlayi' || o.ad !== 'create') return;
    if (o.arg?.data?.tip !== 'durum.degisti') return;
    // A'nın işlemi açık, satırları kilitli: B gelir; B, A'nın bir kilidini
    // beklemeye başlayınca A'nın işlemi bağlantı hatasıyla düşer.
    bSozu = onayIstegi(d, 'B', havaleId);
    await d.db.bekleKosul(() => kilitBekledi(d.db, 'B', 'A') || d.bitenler.has('B'));
    throw Object.assign(new Error('ENJEKTE: veritabanı bağlantısı koptu'), { code: 'P1017' });
  };
  const a = await onayIstegi(d, 'A', havaleId);
  const b = bSozu ? await bSozu : undefined;
  d.db.kancalar.deyimOncesi = undefined;
  const o = await olcNesli(d, ab.id, havaleId);
  const beklenen = ayEkle(taban, 12);
  check("Y4.0 FIXTURE: B, A'nın işleminin tuttuğu kilidi BEKLEDİ", kilitBekledi(d.db, 'B', 'A'));
  check("Y4.0b FIXTURE: A'nın işlemi GERİ ALINDI", !!ilkOlay(d.db, (x) => x.tur === 'geriAl' && x.istek === 'A'));
  check('Y4.1 A enjekte hatayla düştü (400 DEĞİL)', !a.tamam && /ENJEKTE/.test(a.hata?.mesaj ?? ''), hataOzeti(a));
  check('Y4.2 B başarılı — geri alınan sahiplenme kalıcı engel bırakmadı', !!b?.tamam, hataOzeti(b));
  check(
    'Y4.3 abonelik TEK kez uzadı (+12 ay)',
    o.erisimSonu.getTime() === beklenen.getTime(),
    `erişim sonu ${tarih(o.erisimSonu)} · beklenen ${tarih(beklenen)} · tabandan +${gunFarki(o.erisimSonu, taban)} gün`,
  );
  check("Y4.4 \"durum.degisti\" TAM BİR (A'nınki geri alındı)", o.durumDegisti === 1, `${o.durumDegisti}`);
  check('Y4.5 havale ONAYLANDI, onaylayan B', o.havale.durum === 'ONAYLANDI' && o.havale.onaylayanId === 'yonetici-B', `${o.havale.durum}/${o.havale.onaylayanId}`);
  check(
    'Y4.6 uzatılan tarih = erişim sonu',
    o.havale.uzatilanTarih instanceof Date && o.havale.uzatilanTarih.getTime() === o.erisimSonu.getTime(),
    `uzatılan ${tarih(o.havale.uzatilanTarih)}`,
  );
  check('Y4.7 "ödemeniz alındı" TAM BİR', o.musteriEpostasi === 1, `${o.musteriEpostasi}`);
  check('Y4.8 fatura kuyruğu TAM BİR çağrı', o.faturaCagrisi === 1, `${o.faturaCagrisi}`);
  check('Y4.9 kart kapatma TAM BİR, iyzico iptali TEK', o.kartKapatCagrisi === 1 && o.iyzicoIptal === 1, `${o.kartKapatCagrisi}/${o.iyzicoIptal}`);
  check('Y4.10 açık işlem ve kilit kalmadı', d.db.acikIslemSayisi() === 0 && d.db.kilitSayisi() === 0);
  const hatalar = hatalarSonra(g0);
  check('Y4.11 günlükte HATA yok', hatalar.length === 0, hatalar.join(' | '));
  check('Y4.12 NES kesim talebi TAM BİR', o.nesEpostasi === 1, `${o.nesEpostasi}`);
  check("Y4.13 dekont B'ninki (geri alınan A'nınki kalmadı)", o.havale.dekontUrl === 'dekont-B', `${o.havale.dekontUrl}`);
  olcum(olcumSatiri('Y4', o, taban, b ? [a, b] : [a]));
}

// ═════════════════════════════════════════════════════════════════════════
//  S — SIRALI (kontrol): ikinci onay 400 · TEKLIF'ten doğrudan onay
// ═════════════════════════════════════════════════════════════════════════
async function sBlogu(): Promise<void> {
  console.log("\n── S · sıralı: ikinci onay 400 · TEKLIF'ten doğrudan onay ──");
  {
    const d = dunyaKur();
    const taban = tabanTarih();
    const ab = d.kartliSatir('FS1', taban);
    const havaleId = await d.bekleyenHavale('FS1');
    const g0 = gunluk.length;
    const listede = async () =>
      (await istekle('liste', () => d.havale.bekleyenler())).some((h: Satir) => h.id === havaleId);
    check('S1.0 onay bekleyen havale yönetim listesinde', await listede());
    const a = await onayIstegi(d, 'A', havaleId);
    const b = await onayIstegi(d, 'B', havaleId);
    tekOnayOlcutleri('S1', d, await olcNesli(d, ab.id, havaleId), [a, b], { taban, kazanan: 'A', gunluk0: g0 });
    check('S1.19 onaylı havale yönetim listesinden çıktı', !(await listede()));
    olcum(`S1: ikinci istek işlem açtı mı: ${islemBaslaOlayi(d.db, 'B') ? 'evet (sahiplenme reddetti)' : 'hayır (işlem dışı ön denetim reddetti)'}`);
  }
  {
    const d = dunyaKur();
    const taban = tabanTarih();
    const ab = d.kartliSatir('FS2', taban);
    const havaleId = await d.bekleyenHavale('FS2', { faturali: false });
    check('S2.0 FIXTURE: havale TEKLIF durumunda', d.havaleSatiri(havaleId).durum === 'TEKLIF', d.havaleSatiri(havaleId).durum);
    const a = await onayIstegi(d, 'A', havaleId);
    const o = olc(d, ab.id, havaleId);
    check("S2.1 TEKLIF'ten doğrudan onay çalışır (eski davranış korundu)", a.tamam && o.havale.durum === 'ONAYLANDI', hataOzeti(a));
    check('S2.2 abonelik +12 ay', o.erisimSonu.getTime() === ayEkle(taban, 12).getTime(), tarih(o.erisimSonu));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  YAN İSTEKLER — iptal ve "fatura kesildi" (denetleyicinin çağırdığı servis uçları)
// ═════════════════════════════════════════════════════════════════════════
interface YanSonuc {
  hata: string | null;
  /** HTTP durumu (Nest HttpException); Prisma hatasında null. */
  durumKodu: number | null;
  /** Prisma hata kodu (P2025 …). */
  kod: string | null;
  satir: Satir | null;
}

async function yanIstek(d: Dunya, istek: string, fn: () => Promise<unknown>): Promise<YanSonuc> {
  try {
    return { hata: null, durumKodu: null, kod: null, satir: (await istekle(istek, fn)) as Satir };
  } catch (e: any) {
    const durumKodu = typeof e?.getStatus === 'function' ? e.getStatus() : null;
    return { hata: String(e?.message ?? e), durumKodu, kod: e?.code ?? null, satir: null };
  } finally {
    d.bitenler.add(istek);
    d.db.durt();
  }
}

const iptalIstegi = (d: Dunya, havaleId: string, istek = 'C', neden = 'müşteri vazgeçti') =>
  yanIstek(d, istek, () => d.havale.iptalEt(havaleId, `yonetici-${istek}`, neden));
const faturaIstegi = (d: Dunya, havaleId: string, faturaNo: string, istek = 'C') =>
  yanIstek(d, istek, () => d.havale.faturaKesildi(havaleId, faturaNo, `yonetici-${istek}`));
const yanOzeti = (s: YanSonuc | null) =>
  !s ? 'istek yok' : s.hata === null ? `BAŞARILI (${s.satir?.durum})` : `${s.durumKodu ?? '-'} "${s.hata}"`;

// ═════════════════════════════════════════════════════════════════════════
//  İ — İPTAL ↔ ONAY
// ═════════════════════════════════════════════════════════════════════════
/** Onayla yarışan iptal onaylı havaleyi EZEMEZ: iptal 400, havale ONAYLANDI, tek uzatma. */
function iptalOnayiEzemez(
  k: string,
  d: Dunya,
  p: { abonelikId: string; havaleId: string; taban: Date; a: IstekSonucu; c: YanSonuc | null; gunluk0: number },
): void {
  const o = olc(d, p.abonelikId, p.havaleId);
  check(`${k}.1 onay başarılı`, p.a.tamam, hataOzeti(p.a));
  check(`${k}.2 iptal 400`, !!p.c && p.c.hata !== null && p.c.durumKodu === 400, yanOzeti(p.c));
  check(`${k}.3 iptal mesajı "Onaylanmış ödeme iptal edilemez"`, /Onaylanmış ödeme iptal edilemez/.test(p.c?.hata ?? ''), yanOzeti(p.c));
  check(`${k}.4 havale ONAYLANDI kaldı`, o.havale.durum === 'ONAYLANDI', o.havale.durum);
  check(`${k}.5 "havale.iptal" olayı yazılmadı`, d.olaySayisi('havale.iptal', p.abonelikId) === 0, `${d.olaySayisi('havale.iptal', p.abonelikId)}`);
  check(
    `${k}.6 abonelik TEK kez uzadı (+12 ay)`,
    o.erisimSonu.getTime() === ayEkle(p.taban, 12).getTime(),
    `tabandan +${gunFarki(o.erisimSonu, p.taban)} gün`,
  );
  check(`${k}.7 açık işlem ve kilit kalmadı`, d.db.acikIslemSayisi() === 0 && d.db.kilitSayisi() === 0);
  const hatalar = hatalarSonra(p.gunluk0);
  check(`${k}.8 günlükte HATA yok`, hatalar.length === 0, hatalar.join(' | '));
  olcum(`${k}: onay ${hataOzeti(p.a)} · iptal ${yanOzeti(p.c)} · havale ${o.havale.durum} · erişim +${gunFarki(o.erisimSonu, p.taban)} gün`);
}

async function iBlogu(): Promise<void> {
  console.log('\n── İ1 · iptal, onayın ön denetiminden SONRA sahiplenmesinden ÖNCE commit olur ──');
  {
    const d = dunyaKur();
    const taban = tabanTarih();
    const ab = d.kartliSatir('FI1', taban);
    const havaleId = await d.bekleyenHavale('FI1');
    const g0 = gunluk.length;
    let iptal: YanSonuc | null = null;
    let bOkudu = false;
    d.db.kancalar.deyimSonrasi = async (o) => {
      if (o.istek !== 'B' || bOkudu || o.model !== 'havaleOdemesi' || !OKUMALAR.has(o.ad)) return;
      bOkudu = true;
      // B satırı ODEME_BEKLENIYOR okudu; başka bir yönetici tam o anda iptal eder.
      iptal = await iptalIstegi(d, havaleId);
    };
    const b = await onayIstegi(d, 'B', havaleId);
    d.db.kancalar.deyimSonrasi = undefined;
    const o = await olcNesli(d, ab.id, havaleId);
    const bOkuma = havaleOkumasi(d.db, 'B');
    const cYazma = ilkOlay(d.db, (x) => x.tur === 'deyim' && x.istek === 'C' && x.model === 'havaleOdemesi' && x.ad === 'updateMany');
    const bBasla = islemBaslaOlayi(d.db, 'B');
    check(
      "İ1.0 FIXTURE: iptal, B'nin okuması ile işlemi ARASINDA commit edildi",
      (iptal as YanSonuc | null)?.hata === null && !!(bOkuma && cYazma && bBasla) && bOkuma.sira < cYazma.sira && cYazma.sira < bBasla.sira,
      `iptal ${yanOzeti(iptal)} · sıra ${bOkuma?.sira}/${cYazma?.sira}/${bBasla?.sira}`,
    );
    check('İ1.1 onay isteği 400', !b.tamam && b.hata?.durumKodu === 400, hataOzeti(b));
    check('İ1.2 mesaj "İptal edilmiş ödeme onaylanamaz"', /İptal edilmiş ödeme onaylanamaz/.test(b.hata?.mesaj ?? ''), hataOzeti(b));
    check('İ1.3 havale IPTAL kaldı', o.havale.durum === 'IPTAL', o.havale.durum);
    check('İ1.4 abonelik UZAMADI', o.erisimSonu.getTime() === taban.getTime(), `erişim sonu ${tarih(o.erisimSonu)} · taban ${tarih(taban)}`);
    check('İ1.5 "durum.degisti" yok', o.durumDegisti === 0, `${o.durumDegisti}`);
    check('İ1.6 "ödemeniz alındı" gitmedi', o.musteriEpostasi === 0, `${o.musteriEpostasi}`);
    check('İ1.7 fatura kuyruğa alınmadı, NES talebi yok', o.faturaCagrisi === 0 && o.faturaSatiri === 0 && o.nesEpostasi === 0, `${o.faturaCagrisi}/${o.faturaSatiri}/${o.nesEpostasi}`);
    check('İ1.8 kart aboneliğine dokunulmadı', o.kartKapatCagrisi === 0 && o.iyzicoIptal === 0, `${o.kartKapatCagrisi}/${o.iyzicoIptal}`);
    check('İ1.9 açık işlem ve kilit kalmadı', d.db.acikIslemSayisi() === 0 && d.db.kilitSayisi() === 0);
    const hatalar = hatalarSonra(g0);
    check('İ1.10 günlükte HATA yok', hatalar.length === 0, hatalar.join(' | '));
    olcum(olcumSatiri('İ1', o, taban, [b]));
  }

  console.log("\n── İ2 · iptalin ön okuması onayın commit'inden ÖNCE, yazması SONRA ──");
  {
    const d = dunyaKur();
    const taban = tabanTarih();
    const ab = d.kartliSatir('FI2', taban);
    const havaleId = await d.bekleyenHavale('FI2');
    const g0 = gunluk.length;
    let cOkudu = false;
    d.db.kancalar.deyimSonrasi = async (o) => {
      if (o.istek !== 'C' || cOkudu || o.model !== 'havaleOdemesi' || !OKUMALAR.has(o.ad)) return;
      cOkudu = true;
      await d.db.bekleKosul(() => !!commitOlayi(d.db, 'A') || d.bitenler.has('A'));
    };
    const [a, c] = await Promise.all([onayIstegi(d, 'A', havaleId), iptalIstegi(d, havaleId)]);
    d.db.kancalar.deyimSonrasi = undefined;
    const cOkuma = havaleOkumasi(d.db, 'C');
    const aCommit = commitOlayi(d.db, 'A');
    const cYazma = ilkOlay(
      d.db,
      (x) => x.tur === 'deyim' && x.istek === 'C' && x.model === 'havaleOdemesi' && (x.ad === 'update' || x.ad === 'updateMany'),
    );
    check(
      "İ2.0 FIXTURE: iptal satırı onayın commit'inden ÖNCE okudu, yazmayı SONRA denedi",
      !!(cOkuma && aCommit && cYazma) && cOkuma.sira < aCommit.sira && aCommit.sira < cYazma.sira,
      `okuma ${cOkuma?.sira} · A commit ${aCommit?.sira} · yazma ${cYazma?.sira}`,
    );
    iptalOnayiEzemez('İ2', d, { abonelikId: ab.id, havaleId, taban, a, c, gunluk0: g0 });
  }

  console.log("\n── İ3 · iptal onayın AÇIK işleminin kilidini bekler (kod incelemesi M1) ──");
  {
    const d = dunyaKur();
    const taban = tabanTarih();
    const ab = d.kartliSatir('FI3', taban);
    const havaleId = await d.bekleyenHavale('FI3');
    const g0 = gunluk.length;
    let cSozu: Promise<YanSonuc> | null = null;
    d.db.kancalar.commitOncesi = async (o) => {
      if (o.istek !== 'A' || cSozu) return;
      // Onayın işlemi AÇIK, sahiplenme satırı kilitli: iptal şimdi gelir.
      cSozu = iptalIstegi(d, havaleId);
      await d.db.bekleKosul(() => kilitBekledi(d.db, 'C', 'A') || d.bitenler.has('C'));
    };
    const a = await onayIstegi(d, 'A', havaleId);
    const c = cSozu ? await cSozu : null;
    d.db.kancalar.commitOncesi = undefined;
    check("İ3.0 FIXTURE: iptal, onayın işleminin tuttuğu satır kilidini BEKLEDİ", kilitBekledi(d.db, 'C', 'A'));
    iptalOnayiEzemez('İ3', d, { abonelikId: ab.id, havaleId, taban, a, c, gunluk0: g0 });
  }

  console.log('\n── İ4 · ikinci iptal (yeniden deneme) olay tekrarlamaz ──');
  {
    const d = dunyaKur();
    const taban = tabanTarih();
    const ab = d.kartliSatir('FI4', taban);
    const havaleId = await d.bekleyenHavale('FI4');
    const c1 = await iptalIstegi(d, havaleId, 'C', 'ilk neden');
    const c2 = await iptalIstegi(d, havaleId, 'D', 'ikinci neden');
    check('İ4.1 ilk iptal başarılı', c1.hata === null && c1.satir?.durum === 'IPTAL', yanOzeti(c1));
    check('İ4.2 ikinci iptal hatasız döner (aynı satır)', c2.hata === null && c2.satir?.durum === 'IPTAL', yanOzeti(c2));
    check('İ4.3 "havale.iptal" olayı TAM BİR', d.olaySayisi('havale.iptal', ab.id) === 1, `${d.olaySayisi('havale.iptal', ab.id)}`);
    check('İ4.4 ilk iptalin nedeni korundu', d.havaleSatiri(havaleId).aciklama === 'ilk neden', `${d.havaleSatiri(havaleId).aciklama}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  F — onaydan SONRA "fatura kesildi": yalnız numara, durum ONAYLANDI kalır
// ═════════════════════════════════════════════════════════════════════════
async function fBlogu(): Promise<void> {
  console.log('\n── F · onaydan sonra "fatura kesildi": yalnız numara, durum ONAYLANDI kalır ──');
  const d = dunyaKur();
  const taban = tabanTarih();
  const ab = d.kartliSatir('FF1', taban);
  const havaleId = await d.bekleyenHavale('FF1');
  const g0 = gunluk.length;
  const a = await onayIstegi(d, 'A', havaleId);
  const onaydaki = { ...d.havaleSatiri(havaleId) };
  const olay0 = d.olaySayisi('havale.fatura.kesildi', ab.id);
  // Yönetici NES'te kestiği asıl faturanın numarasını kaydeder: aynı uç, onaylı satır.
  const fk = await faturaIstegi(d, havaleId, 'NES-2026-000123');
  const sonra = d.havaleSatiri(havaleId);
  const bekleyenler = await istekle('liste', () => d.havale.bekleyenler());
  const zaman = (x: unknown) => (x instanceof Date ? x.getTime() : x);
  check('F.0 FIXTURE: onay başarılı, satır ONAYLANDI', a.tamam && onaydaki.durum === 'ONAYLANDI', hataOzeti(a));
  check('F.1 "fatura kesildi" onaylı satırda hatasız döner', fk.hata === null, yanOzeti(fk));
  check('F.2 durum ONAYLANDI kaldı (bekleyenlere dönmedi)', sonra.durum === 'ONAYLANDI', sonra.durum);
  check('F.3 fatura numarası yazıldı', sonra.faturaNo === 'NES-2026-000123', `${sonra.faturaNo}`);
  check(
    'F.4 onay izi değişmedi (onaylayan, onay anı, uzatılan tarih, dekont)',
    sonra.onaylayanId === onaydaki.onaylayanId &&
      zaman(sonra.onaylandi) === zaman(onaydaki.onaylandi) &&
      zaman(sonra.uzatilanTarih) === zaman(onaydaki.uzatilanTarih) &&
      sonra.dekontUrl === onaydaki.dekontUrl,
    `${sonra.onaylayanId}/${tarih(sonra.uzatilanTarih)}/${sonra.dekontUrl}`,
  );
  check('F.5 "havale.fatura.kesildi" olayı yazıldı', d.olaySayisi('havale.fatura.kesildi', ab.id) === olay0 + 1, `${d.olaySayisi('havale.fatura.kesildi', ab.id)}`);
  check('F.6 yönetim listesinde YOK', !bekleyenler.some((h: Satir) => h.id === havaleId));
  const b = await onayIstegi(d, 'B', havaleId);
  const o = await olcNesli(d, ab.id, havaleId);
  check('F.7 ikinci onay 400', !b.tamam && b.hata?.durumKodu === 400, hataOzeti(b));
  check('F.8 mesaj "zaten onaylanmış"', /zaten onaylanmış/.test(b.hata?.mesaj ?? ''), hataOzeti(b));
  check('F.9 abonelik TEK kez uzadı (+12 ay)', o.erisimSonu.getTime() === ayEkle(taban, 12).getTime(), `tabandan +${gunFarki(o.erisimSonu, taban)} gün`);
  check('F.10 "durum.degisti" TAM BİR', o.durumDegisti === 1, `${o.durumDegisti}`);
  check('F.11 "ödemeniz alındı" TAM BİR', o.musteriEpostasi === 1, `${o.musteriEpostasi}`);
  check('F.12 fatura kuyruğu TAM BİR çağrı', o.faturaCagrisi === 1, `${o.faturaCagrisi}`);
  check('F.13 kart kapatma TAM BİR', o.kartKapatCagrisi === 1, `${o.kartKapatCagrisi}`);
  check('F.14 NES kesim talebi TAM BİR', o.nesEpostasi === 1, `${o.nesEpostasi}`);
  const hatalar = hatalarSonra(g0);
  check('F.15 günlükte HATA yok', hatalar.length === 0, hatalar.join(' | '));
  olcum(olcumSatiri('F', o, taban, [a, b]));
}

// ═════════════════════════════════════════════════════════════════════════
//  FK — "fatura kesildi": TEKLIF'te eskisi gibi · iptal DİRİLMEZ · onayla yarış
// ═════════════════════════════════════════════════════════════════════════
async function fkBlogu(): Promise<void> {
  console.log('\n── FK1 · "fatura kesildi" TEKLIF\'te eskisi gibi: numara + ODEME_BEKLENIYOR ──');
  {
    const d = dunyaKur();
    const ab = d.kartliSatir('FK1', tabanTarih());
    const havaleId = await d.bekleyenHavale('FK1', { faturali: false });
    check('FK1.0 FIXTURE: havale TEKLIF durumunda', d.havaleSatiri(havaleId).durum === 'TEKLIF', d.havaleSatiri(havaleId).durum);
    const fk = await faturaIstegi(d, havaleId, 'PROFORMA-1');
    const s = d.havaleSatiri(havaleId);
    check('FK1.1 hatasız', fk.hata === null, yanOzeti(fk));
    check('FK1.2 TEKLIF → ODEME_BEKLENIYOR', s.durum === 'ODEME_BEKLENIYOR', s.durum);
    check('FK1.3 numara yazıldı', s.faturaNo === 'PROFORMA-1', `${s.faturaNo}`);
    check('FK1.4 olay yazıldı', d.olaySayisi('havale.fatura.kesildi', ab.id) === 1, `${d.olaySayisi('havale.fatura.kesildi', ab.id)}`);
  }

  console.log('\n── FK2 · iptal edilmiş teklif "fatura kesildi"yle DİRİLMEZ ──');
  {
    const d = dunyaKur();
    const taban = tabanTarih();
    const ab = d.kartliSatir('FK2', taban);
    const havaleId = await d.bekleyenHavale('FK2');
    const iptal = await iptalIstegi(d, havaleId);
    const iptalSonrasi = d.havaleSatiri(havaleId).durum;
    const numara0 = d.havaleSatiri(havaleId).faturaNo;
    const olay0 = d.olaySayisi('havale.fatura.kesildi', ab.id);
    const fk = await faturaIstegi(d, havaleId, 'NES-IPTAL-1', 'D');
    const s = d.havaleSatiri(havaleId);
    const bekleyenler = await istekle('liste', () => d.havale.bekleyenler());
    const b = await onayIstegi(d, 'B', havaleId);
    check('FK2.0 FIXTURE: teklif iptal edildi', iptal.hata === null && iptalSonrasi === 'IPTAL', `${yanOzeti(iptal)} · ${iptalSonrasi}`);
    check('FK2.1 "fatura kesildi" 400', fk.hata !== null && fk.durumKodu === 400, yanOzeti(fk));
    check('FK2.2 mesaj "İptal edilmiş havaleye fatura kaydedilemez"', /İptal edilmiş havaleye fatura kaydedilemez/.test(fk.hata ?? ''), yanOzeti(fk));
    check('FK2.3 durum IPTAL kaldı (dirilmedi)', s.durum === 'IPTAL', s.durum);
    check('FK2.4 numara değişmedi', s.faturaNo === numara0, `${s.faturaNo} (önce ${numara0})`);
    check('FK2.5 olay yazılmadı', d.olaySayisi('havale.fatura.kesildi', ab.id) === olay0, `${d.olaySayisi('havale.fatura.kesildi', ab.id)}`);
    check('FK2.6 yönetim listesinde YOK', !bekleyenler.some((h: Satir) => h.id === havaleId));
    check(
      'FK2.7 ardından onay 400 "İptal edilmiş ödeme onaylanamaz"',
      !b.tamam && b.hata?.durumKodu === 400 && /İptal edilmiş ödeme onaylanamaz/.test(b.hata?.mesaj ?? ''),
      hataOzeti(b),
    );
    check('FK2.8 abonelik UZAMADI', (d.abonelikSatiri(ab.id).erisimSonu as Date).getTime() === taban.getTime(), tarih(d.abonelikSatiri(ab.id).erisimSonu));
  }

  console.log('\n── FK3 · "fatura kesildi" onayın AÇIK işleminin kilidini bekler (kod incelemesi M1) ──');
  {
    const d = dunyaKur();
    const taban = tabanTarih();
    const ab = d.kartliSatir('FK3', taban);
    const havaleId = await d.bekleyenHavale('FK3');
    const g0 = gunluk.length;
    let cSozu: Promise<YanSonuc> | null = null;
    d.db.kancalar.commitOncesi = async (o) => {
      if (o.istek !== 'A' || cSozu) return;
      // Onayın işlemi AÇIK, sahiplenme satırı kilitli: fatura numarası şimdi girilir.
      cSozu = faturaIstegi(d, havaleId, 'NES-2026-000777');
      await d.db.bekleKosul(() => kilitBekledi(d.db, 'C', 'A') || d.bitenler.has('C'));
    };
    const a = await onayIstegi(d, 'A', havaleId);
    const c = cSozu ? await cSozu : null;
    d.db.kancalar.commitOncesi = undefined;
    const s = d.havaleSatiri(havaleId);
    check('FK3.0 FIXTURE: "fatura kesildi", onayın işleminin tuttuğu satır kilidini BEKLEDİ', kilitBekledi(d.db, 'C', 'A'));
    check('FK3.1 onay başarılı', a.tamam, hataOzeti(a));
    check('FK3.2 "fatura kesildi" hatasız (onaylı satıra yalnız numara)', c?.hata === null, yanOzeti(c));
    check('FK3.3 durum ONAYLANDI kaldı (geri çekilmedi)', s.durum === 'ONAYLANDI', s.durum);
    check('FK3.4 numara yazıldı', s.faturaNo === 'NES-2026-000777', `${s.faturaNo}`);
    const b = await onayIstegi(d, 'B', havaleId);
    check('FK3.5 ardından ikinci onay 400', !b.tamam && b.hata?.durumKodu === 400, hataOzeti(b));
    check(
      'FK3.6 abonelik TEK kez uzadı (+12 ay)',
      (d.abonelikSatiri(ab.id).erisimSonu as Date).getTime() === ayEkle(taban, 12).getTime(),
      `tabandan +${gunFarki(d.abonelikSatiri(ab.id).erisimSonu, taban)} gün`,
    );
    check('FK3.7 açık işlem ve kilit kalmadı', d.db.acikIslemSayisi() === 0 && d.db.kilitSayisi() === 0);
    const hatalar = hatalarSonra(g0);
    check('FK3.8 günlükte HATA yok', hatalar.length === 0, hatalar.join(' | '));
  }

  console.log('\n── FK4 · numarasız "fatura kesildi" (gövde doğrulanmaz) → 400, hiçbir şey yazılmaz ──');
  {
    const d = dunyaKur();
    const ab = d.kartliSatir('FK4', tabanTarih());
    const teklif = await d.bekleyenHavale('FK4', { faturali: false });
    const onayli = await d.bekleyenHavale('FK4');
    const a = await onayIstegi(d, 'A', onayli);
    check('FK4.0 FIXTURE: biri TEKLIF, biri onaylı', d.havaleSatiri(teklif).durum === 'TEKLIF' && a.tamam, hataOzeti(a));
    const olay0 = d.olaySayisi('havale.fatura.kesildi', ab.id);
    const numara0 = d.havaleSatiri(onayli).faturaNo;
    const t = await faturaIstegi(d, teklif, undefined as unknown as string);
    const o = await faturaIstegi(d, onayli, '   ', 'D');
    check('FK4.1 TEKLIF satırında 400 "Fatura numarası gerekli"', t.durumKodu === 400 && /Fatura numarası gerekli/.test(t.hata ?? ''), yanOzeti(t));
    check('FK4.2 TEKLIF ilerlemedi', d.havaleSatiri(teklif).durum === 'TEKLIF', d.havaleSatiri(teklif).durum);
    check('FK4.3 onaylı satırda 400 "Fatura numarası gerekli" (yanlış "iptal" mesajı değil)', o.durumKodu === 400 && /Fatura numarası gerekli/.test(o.hata ?? ''), yanOzeti(o));
    check('FK4.4 onaylı satırın numarası ve durumu değişmedi', d.havaleSatiri(onayli).faturaNo === numara0 && d.havaleSatiri(onayli).durum === 'ONAYLANDI', `${d.havaleSatiri(onayli).faturaNo}/${d.havaleSatiri(onayli).durum}`);
    check('FK4.5 olay yazılmadı', d.olaySayisi('havale.fatura.kesildi', ab.id) === olay0, `${d.olaySayisi('havale.fatura.kesildi', ab.id)}`);
  }

  console.log('\n── FK5 · olmayan havaleye "fatura kesildi" → P2025 (eskisi gibi, 400 değil) ──');
  {
    const d = dunyaKur();
    d.kartliSatir('FK5', tabanTarih());
    const fk = await faturaIstegi(d, 'yok-boyle-havale', 'NES-1');
    check('FK5.1 P2025 (kayıt yok), 400 değil', fk.kod === 'P2025' && fk.durumKodu === null, `${yanOzeti(fk)} · kod ${fk.kod}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  G — 25.09 ÖNCESİ KUSURDAN KALMA SATIR: onaylı ama durumu geri çekilmiş
// ═════════════════════════════════════════════════════════════════════════
async function gBlogu(): Promise<void> {
  console.log('\n── G · kusurdan kalma satır: onaylı (onaylandi dolu) ama durumu ODEME_BEKLENIYOR ──');
  const d = dunyaKur();
  const taban = tabanTarih();
  const ab = d.kartliSatir('FG1', taban);
  const havaleId = await d.bekleyenHavale('FG1');
  const a = await onayIstegi(d, 'A', havaleId);
  // Eski "fatura kesildi"nin bıraktığı iz (canlı veride olabilir, sayılmadı):
  // durum geri çekilmiş, onay izi duruyor. Fixture doğrudan yazar.
  const satir = d.havaleSatiri(havaleId);
  satir.durum = 'ODEME_BEKLENIYOR';
  const erisim0 = (d.abonelikSatiri(ab.id).erisimSonu as Date).getTime();
  const g0 = gunluk.length;
  check(
    'G.0 FIXTURE: onaylı (onaylandi dolu) ama durumu ODEME_BEKLENIYOR',
    a.tamam && satir.onaylandi instanceof Date && d.havaleSatiri(havaleId).durum === 'ODEME_BEKLENIYOR',
    hataOzeti(a),
  );
  const bekleyenler = await istekle('liste', () => d.havale.bekleyenler());
  check('G.1 yönetim listesinde YOK', !bekleyenler.some((h: Satir) => h.id === havaleId));
  const b = await onayIstegi(d, 'B', havaleId);
  check('G.2 yeniden onay 400 "zaten onaylanmış"', !b.tamam && b.hata?.durumKodu === 400 && /zaten onaylanmış/.test(b.hata?.mesaj ?? ''), hataOzeti(b));
  check('G.3 abonelik ikinci kez UZAMADI', (d.abonelikSatiri(ab.id).erisimSonu as Date).getTime() === erisim0, tarih(d.abonelikSatiri(ab.id).erisimSonu));
  const fk = await faturaIstegi(d, havaleId, 'NES-ESKI-1');
  const s = d.havaleSatiri(havaleId);
  check('G.4 "fatura kesildi" yalnız numara yazar (onaylı sayılır)', fk.hata === null && s.faturaNo === 'NES-ESKI-1', `${yanOzeti(fk)} · ${s.faturaNo}`);
  check('G.5 onay izi korunuyor (onaylandi dolu)', s.onaylandi instanceof Date);
  const c = await iptalIstegi(d, havaleId);
  check(
    'G.6 iptal 400 "Onaylanmış ödeme iptal edilemez"',
    c.durumKodu === 400 && /Onaylanmış ödeme iptal edilemez/.test(c.hata ?? ''),
    yanOzeti(c),
  );
  check('G.7 durum IPTAL olmadı', d.havaleSatiri(havaleId).durum !== 'IPTAL', d.havaleSatiri(havaleId).durum);
  check('G.8 açık işlem ve kilit kalmadı', d.db.acikIslemSayisi() === 0 && d.db.kilitSayisi() === 0);
  const hatalar = hatalarSonra(g0);
  check('G.9 günlükte HATA yok', hatalar.length === 0, hatalar.join(' | '));

  // G2 — KAPALI LİSTE: ONAYLANDI ama onay anı BOŞ (elle girilmiş / eski veri).
  // Onaylı satır damgasız da olsa onaylanabilir sayılmaz: liste, "fatura
  // kesildi" ve onay yalnız onay bekleyen durumları okur (mutant MS2 —
  // listeye ONAYLANDI eklemek — ancak bu satırda görünür).
  console.log('\n── G2 · ONAYLANDI ama onay anı boş (elle/eski veri): kapalı liste ──');
  const d2 = dunyaKur();
  const ab2 = d2.kartliSatir('FG2', tabanTarih());
  const h2 = await d2.bekleyenHavale('FG2');
  const a2 = await onayIstegi(d2, 'A', h2);
  d2.havaleSatiri(h2).onaylandi = null;
  const erisim2 = (d2.abonelikSatiri(ab2.id).erisimSonu as Date).getTime();
  check('G2.0 FIXTURE: satır ONAYLANDI, onay anı boş', a2.tamam && d2.havaleSatiri(h2).durum === 'ONAYLANDI' && d2.havaleSatiri(h2).onaylandi === null, hataOzeti(a2));
  const liste2 = await istekle('liste', () => d2.havale.bekleyenler());
  check('G2.1 yönetim listesinde YOK', !liste2.some((h: Satir) => h.id === h2));
  const fk2 = await faturaIstegi(d2, h2, 'NES-DAMGASIZ-1');
  check('G2.2 "fatura kesildi" durumu DEĞİŞTİRMEZ (yalnız numara)', fk2.hata === null && d2.havaleSatiri(h2).durum === 'ONAYLANDI' && d2.havaleSatiri(h2).faturaNo === 'NES-DAMGASIZ-1', `${yanOzeti(fk2)} · ${d2.havaleSatiri(h2).durum}`);
  const b2 = await onayIstegi(d2, 'B', h2);
  check('G2.3 yeniden onay 400, abonelik ikinci kez uzamadı', !b2.tamam && b2.hata?.durumKodu === 400 && (d2.abonelikSatiri(ab2.id).erisimSonu as Date).getTime() === erisim2, hataOzeti(b2));
}

// ═════════════════════════════════════════════════════════════════════════
//  D — DENETLEYİCİ: gövdedeki `havaleId` yoldaki kimliği ezemez (kod incelemesi N3)
// ═════════════════════════════════════════════════════════════════════════
async function dBlogu(): Promise<void> {
  console.log('\n── D · denetleyici: gövdedeki havaleId yoldaki kimliği ezemez ──');
  const d = dunyaKur();
  d.kartliSatir('FD1', tabanTarih());
  const yoldaki = await d.bekleyenHavale('FD1');
  const govdedeki = await d.bekleyenHavale('FD1');
  const denetleyici = new HavaleController(d.havale);
  // Satır içi tip literali ValidationPipe'ı atlar: gövde her alanı taşıyabilir.
  const hata = await istekle('A', () =>
    denetleyici.onayla(yoldaki, { id: 'yonetici-A' }, { havaleId: govdedeki, onaylayanId: 'sahte', dekontUrl: 'dekont-D' } as any),
  ).then(
    () => null,
    (e: any) => String(e?.message ?? e),
  );
  const y = d.havaleSatiri(yoldaki);
  const g = d.havaleSatiri(govdedeki);
  check('D.1 onay hatasız', hata === null, hata ?? '');
  check('D.2 YOLDAKİ havale onaylandı', y.durum === 'ONAYLANDI', `${y.durum}`);
  check("D.2b onaylayan JWT'deki kullanıcı (gövdedeki onaylayanId sayılmaz)", y.onaylayanId === 'yonetici-A', `${y.onaylayanId}`);
  check('D.3 gövdedeki havaleye dokunulmadı', g.durum === 'ODEME_BEKLENIYOR' && g.onaylandi === null, `${g.durum}`);
  check('D.4 gövdenin diğer alanı (dekont) yine kullanıldı', y.dekontUrl === 'dekont-D', `${y.dekontUrl}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  Ö — ÖLÇÜM (assert DEĞİL): ikiz yarış, bu işin kapsamı dışında
// ═════════════════════════════════════════════════════════════════════════
async function oBlogu(): Promise<void> {
  console.log('\n── Ö · ÖLÇÜM (assert değil): aynı aboneliğe FARKLI iki havale aynı anda ──');
  // Sahiplenmeler çakışmaz; iki `erisimiUzat` aynı eski bitişi okur.
  const d = dunyaKur();
  const taban = tabanTarih();
  const ab = d.kartliSatir('FO1', taban);
  const h1 = await d.bekleyenHavale('FO1');
  const h2 = await d.bekleyenHavale('FO1');
  d.db.kancalar.deyimSonrasi = okumaBariyeri(d, ['A', 'B']);
  const [a, b] = await Promise.all([onayIstegi(d, 'A', h1), onayIstegi(d, 'B', h2)]);
  d.db.kancalar.deyimSonrasi = undefined;
  const son = d.abonelikSatiri(ab.id).erisimSonu as Date;
  const iki = ayEkle(ayEkle(taban, 12), 12);
  olcum(
    `Ö1 aynı abonelik, farklı iki 12 aylık havale aynı anda: ${hataOzeti(a)} | ${hataOzeti(b)} · ` +
      `erişim sonu +${gunFarki(son, taban)} gün (iki ödeme +${gunFarki(iki, taban)} gün eder) · ` +
      `durum.degisti ${d.olaySayisi('durum.degisti', ab.id)}`,
  );
}

// ═════════════════════════════════════════════════════════════════════════
//  K — KAYNAK: sahiplenmenin Prisma önkoşulları
// ═════════════════════════════════════════════════════════════════════════
function kBlogu(): void {
  console.log('\n── K · kaynak: sahiplenmenin Prisma önkoşulları ──');
  const sema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf-8');
  const kaynak = sema.match(/^datasource\s+\w+\s*\{([^}]*)\}/m)?.[1] ?? null;
  // Yorum satırı sayılmaz: ibare satır başında (boşluktan sonra) aranır.
  // `referentialIntegrity` eski adıdır; 5.22 şema motoru onu hâlâ kabul
  // ediyor (yalnız "deprecated" uyarısı) ve AYNI emülasyonu açar.
  const mod = kaynak?.match(/^\s*(?:relationMode|referentialIntegrity)\s*=\s*"(\w+)"/m)?.[1] ?? null;
  check('K1 schema.prisma datasource bloğu okundu', kaynak !== null);
  check(
    'K2 relationMode/referentialIntegrity "prisma" DEĞİL — updateMany tek koşullu UPDATE (sayı etkilenen satırdan)',
    kaynak !== null && (mod === null || mod === 'foreignKeys'),
    `mod = ${mod}: "prisma" modunda motor önce id okuyup WHERE id IN (…) ile KOŞULSUZ günceller, sahiplenme korumaz`,
  );
  const surum: string = JSON.parse(fs.readFileSync(require.resolve('@prisma/client/package.json'), 'utf-8')).version;
  check(
    'K3 Prisma 5.x — sahiplenme 5.22 motor kaynağıyla doğrulandı',
    /^5\./.test(surum),
    `@prisma/client ${surum}: ana sürüm değişti — yeni motorda update_many_records → update_many_from_filter yolunu YENİDEN doğrula`,
  );
}

// ═════════════════════════════════════════════════════════════════════════
function son(): void {
  console.log(`\n${'='.repeat(64)}\nHAVALE ONAY YARIŞI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (olcumler.length) {
    console.log('ÖLÇÜMLER:');
    olcumler.forEach((o) => console.log(`  · ${o}`));
  }
  if (failed) {
    console.log('KIRMIZI:');
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

/** Bir bloğun fırlatması KIRMIZI bir assert olur, koşuyu bitirmez: kalan bloklar yine koşar. */
async function blok(ad: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    check(`${ad} bloğu çökmeden bitti`, false, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

async function main(): Promise<void> {
  console.log('HAVALE ONAYI — aynı havaleye eşzamanlı iki onay (READ COMMITTED taklidi)');
  // NES kesim talebinin adresi ortamdan (yönetici hesabı tablosu taklitte
  // yok); kabuktaki değer sonucu çevirmesin diye yalıtılır, sonda geri konur.
  const oncekiYonetim = process.env.YONETIM_EPOSTA;
  process.env.YONETIM_EPOSTA = YONETIM;
  try {
    await blok('T', tBlogu);
    await blok('Y1', y1Blogu);
    await blok('Y2', y2Blogu);
    await blok('Y3', y3Blogu);
    await blok('Y4', y4Blogu);
    await blok('S', sBlogu);
    await blok('İ', iBlogu);
    await blok('F', fBlogu);
    await blok('FK', fkBlogu);
    await blok('G', gBlogu);
    await blok('D', dBlogu);
    await blok('Ö', oBlogu);
    await blok('K', kBlogu);
  } finally {
    if (oncekiYonetim === undefined) delete process.env.YONETIM_EPOSTA;
    else process.env.YONETIM_EPOSTA = oncekiYonetim;
  }
  check('Z kurulum beklemeleri emniyet süresine düşmedi (senaryolar istenen sırayı kurdu)', zamanAsimiSayisi === 0, `${zamanAsimiSayisi} bekleme ${EMNIYET_MS} ms'de doldu`);
  son();
  tamamlandi = true;
}

// ⚠ YALANCI YEŞİL KORUMASI: sözü hiç çözülmeyen bir senaryo olay döngüsünü
// boşaltırsa Node ÇIKIŞ 0 ile kapanır ve özet BASILMAZ — kapı kırmızıyken
// yeşil görünürdü. Özet basılmadan döngü boşalırsa çıkış 1.
let tamamlandi = false;
process.on('beforeExit', () => {
  if (tamamlandi) return;
  tamamlandi = true;
  console.log(`\n✗ KAPI TAMAMLANMADI: bir senaryo asılı kaldı (çözülmeyen söz) — ${passed} PASS, ${failed} FAIL, özet eksik`);
  process.exitCode = 1;
});

main().catch((e) => {
  tamamlandi = true;
  console.error(e);
  process.exitCode = 1;
});
