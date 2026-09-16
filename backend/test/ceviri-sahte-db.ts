/**
 * ÇEVİRİ SAHTE PRİSMA (Faz 6.10/6.11 15.09 · 6.9 16.09.2026) — yardımcı, suite değil.
 * Kullananlar: `ceviri-gorunum-cikti-test.ts`, `ceviri-gecis-test.ts`, `ceviri-duzeltme-test.ts`.
 *
 * Sadakat kuralları (tasarım §9A.3 — 6.10 çürütücüsünün Ö8 bulgusu: eski sahte
 * `select`'i yok sayıyor, `targetLang`'i süzmüyor, `not`'ta patlıyordu):
 *  · `where`: eşitlik (Date dahil), `gt/gte/lt/lte/in/not` ve `OR`; TANIMADIĞI
 *    operatörde PATLAR — sessizce "eşleşti" demez (yalancı yeşil dersi)
 *  · `where`'de olmayan alan süzmez (gerçek Prisma gibi)
 *  · dizi `orderBy`: sıra = öncelik, eşitlikte sonraki anahtar; NULL en büyük
 *  · `select` UYGULANIR (yalnız istenen alanlar döner)
 *  · `$transaction`: fonksiyon biçimi anlık görüntü + hata olursa GERİ ALMA;
 *    dizi biçimi Promise.all
 *  · her yazma ve kilit/işlem `olaylar`a düşer; `okumalariKaydet` ile okumalar da
 *    (T2 U6: kilit okumadan, sayımdan ve yazmadan ÖNCE mi — sıra ölçülür)
 *  · bileşik tekil anahtar (`firmaId_hedefDil_kaynakOzeti`, `sourceText_targetLang`)
 *    findUnique/update/delete/upsert'te düz alanlara açılır
 *  · T2 tabloları `olusturuldu`/`guncellendi` varsayılanını sahte saatle alır
 *    (gerçekte `@default(now())`/`@updatedAt`; günlük tavan bu alanı sayar)
 */

export type Kayit = Record<string, any>;

export interface Tablolar {
  quote: Kayit[];
  ceviriTuketimi: Kayit[];
  systemSettings: Kayit[];
  translation: Kayit[];
  abonelik: Kayit[];
  user: Kayit[];
  firma: Kayit[];
  quoteFormat: Kayit[];
  quoteExport: Kayit[];
  /** `_prisma_migrations` satırları: { migration_name, finished_at }. */
  migrations: Kayit[];
  /** Faz 6.9 (T2) */
  ceviriDuzeltmesi: Kayit[];
  ceviriDuzeltmeOlayi: Kayit[];
  yoneticiOlayi: Kayit[];
}

export interface SahteAyar {
  /** true → findFirst/findUnique/findMany/count okumaları da `olaylar`a düşer (`<tablo>.<işlem>`). */
  okumalariKaydet?: boolean;
  /** T2 tablolarının zaman varsayılanları için saat. */
  saat?: () => Date;
}

const OPERATORLER = new Set(['gt', 'gte', 'lt', 'lte', 'in', 'not']);

/** Bileşik tekil anahtar nesnesini düz alanlara açar; operatör nesnesine dokunmaz. */
function duzlestir(where: Kayit | undefined): Kayit | undefined {
  if (!where) return where;
  const duz: Kayit = {};
  for (const [a, v] of Object.entries(where)) {
    const nesne = v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v) && !Array.isArray(v);
    if (nesne && a !== 'OR' && !Object.keys(v).every((k) => OPERATORLER.has(k))) Object.assign(duz, v);
    else duz[a] = v;
  }
  return duz;
}

const olcek = (v: unknown) => (v instanceof Date ? v.getTime() : v);

export function eslesir(kayit: Kayit, where: Kayit | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([alan, kosul]) => {
    if (alan === 'OR') return (kosul as Kayit[]).some((alt) => eslesir(kayit, alt));
    if (alan === 'AND' || alan === 'NOT') throw new Error(`sahte Prisma: tanınmayan mantık operatörü "${alan}"`);
    const deger = kayit[alan];
    if (kosul instanceof Date) return olcek(deger) === kosul.getTime();
    if (kosul !== null && typeof kosul === 'object' && !Buffer.isBuffer(kosul)) {
      return Object.entries(kosul).every(([op, hedef]) => {
        const a = olcek(deger) as any;
        const b = olcek(hedef) as any;
        switch (op) {
          case 'gt': return a != null && a > b;
          case 'gte': return a != null && a >= b;
          case 'lt': return a != null && a < b;
          case 'lte': return a != null && a <= b;
          case 'in': return (hedef as unknown[]).map(olcek).includes(a);
          case 'not': return hedef === null ? deger != null : a !== b;
          default: throw new Error(`sahte Prisma: tanınmayan operatör "${op}"`);
        }
      });
    }
    return deger === kosul;
  });
}

/** Gerçek Prisma her okumada TAZE nesne döner: okunan kaydı yerinde değiştirmek tabloyu değiştirmez. */
function secim(k: Kayit, select: Kayit | undefined): Kayit {
  if (!select) return structuredClone(k);
  return structuredClone(Object.fromEntries(Object.keys(select).filter((a) => select[a]).map((a) => [a, k[a]])));
}

function sirala(l: Kayit[], orderBy: unknown): Kayit[] {
  if (!orderBy) return l;
  const anahtarlar = (Array.isArray(orderBy) ? orderBy : [orderBy]).map((o: Kayit) => {
    const g = Object.entries(o);
    if (g.length !== 1 || (g[0][1] !== 'asc' && g[0][1] !== 'desc')) throw new Error(`sahte Prisma: tanınmayan orderBy ${JSON.stringify(o)}`);
    return g[0] as [string, 'asc' | 'desc'];
  });
  const kiyas = (x: unknown, y: unknown): number => {
    if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0);
    const a = olcek(x) as any;
    const b = olcek(y) as any;
    return a < b ? -1 : a > b ? 1 : 0;
  };
  return [...l].sort((a, b) => {
    for (const [alan, yon] of anahtarlar) {
      const fark = kiyas(a[alan], b[alan]);
      if (fark !== 0) return yon === 'desc' ? -fark : fark;
    }
    return 0;
  });
}

export interface SahteDb {
  db: any;
  t: Tablolar;
  olaylar: string[];
  /** `olaylar` içinde verilen önekle başlayan olay sayısı. */
  say: (onek: string) => number;
}

export function sahteDb(bas: Partial<Tablolar> = {}, ayar: SahteAyar = {}): SahteDb {
  const t: Tablolar = {
    quote: [], ceviriTuketimi: [], systemSettings: [], translation: [], abonelik: [], user: [], firma: [],
    quoteFormat: [], quoteExport: [], migrations: [], ceviriDuzeltmesi: [], ceviriDuzeltmeOlayi: [], yoneticiOlayi: [],
    ...bas,
  };
  const olaylar: string[] = [];
  let sayac = 0;
  const saat = ayar.saat ?? (() => new Date());
  const oku = (ad: string, islem: string) => {
    if (ayar.okumalariKaydet) olaylar.push(`${ad}.${islem}`);
  };
  /** Gerçek şemanın zaman varsayılanları (yalnız T2 tabloları — T1 fikstürleri kendi zamanını taşır). */
  const varsayilan = (ad: keyof Tablolar, k: Kayit, yeni: boolean): void => {
    if (ad !== 'ceviriDuzeltmesi' && ad !== 'ceviriDuzeltmeOlayi' && ad !== 'yoneticiOlayi') return;
    if (yeni && k.olusturuldu === undefined) k.olusturuldu = saat();
    if (ad === 'ceviriDuzeltmesi') {
      if (yeni && k.hedefDil === undefined) k.hedefDil = 'en';
      k.guncellendi = saat();
    }
  };

  const tablo = (ad: keyof Tablolar) => ({
    findFirst: async ({ where, orderBy, select }: Kayit = {}) => {
      oku(ad, 'findFirst');
      const k = sirala(t[ad].filter((x) => eslesir(x, where)), orderBy)[0];
      return k ? secim(k, select) : null;
    },
    findUnique: async ({ where, select }: Kayit) => {
      oku(ad, 'findUnique');
      const k = t[ad].find((x) => eslesir(x, duzlestir(where)));
      return k ? secim(k, select) : null;
    },
    findMany: async ({ where, orderBy, select, take, skip }: Kayit = {}) => {
      oku(ad, 'findMany');
      let l = sirala(t[ad].filter((x) => eslesir(x, where)), orderBy);
      if (typeof skip === 'number') l = l.slice(skip);
      if (typeof take === 'number') l = l.slice(0, take);
      return l.map((k) => secim(k, select));
    },
    count: async ({ where }: Kayit = {}) => {
      oku(ad, 'count');
      return t[ad].filter((x) => eslesir(x, where)).length;
    },
    aggregate: async ({ where, _sum }: Kayit) => {
      const l = t[ad].filter((x) => eslesir(x, where));
      const alan = Object.keys(_sum)[0];
      return { _sum: { [alan]: l.length ? l.reduce((s, k) => s + k[alan], 0) : null } };
    },
    create: async ({ data, select }: Kayit) => {
      olaylar.push(`${ad}.create`);
      const k = { id: `${ad}-${++sayac}`, ...data };
      varsayilan(ad, k, true);
      t[ad].push(k);
      return secim(k, select);
    },
    update: async ({ where, data }: Kayit) => {
      olaylar.push(`${ad}.update`);
      const k = t[ad].find((x) => eslesir(x, duzlestir(where)));
      if (!k) throw new Error(`sahte Prisma: ${ad}.update kayıt yok`);
      Object.assign(k, data);
      varsayilan(ad, k, false);
      return { ...k };
    },
    updateMany: async ({ where, data }: Kayit) => {
      olaylar.push(`${ad}.updateMany`);
      const l = t[ad].filter((x) => eslesir(x, where));
      l.forEach((k) => Object.assign(k, data));
      return { count: l.length };
    },
    delete: async ({ where }: Kayit) => {
      olaylar.push(`${ad}.delete`);
      const i = t[ad].findIndex((x) => eslesir(x, duzlestir(where)));
      if (i < 0) throw new Error(`sahte Prisma: ${ad}.delete kayıt yok`);
      return t[ad].splice(i, 1)[0];
    },
    deleteMany: async ({ where }: Kayit = {}) => {
      olaylar.push(`${ad}.deleteMany`);
      const kalan = t[ad].filter((x) => !eslesir(x, where));
      const count = t[ad].length - kalan.length;
      t[ad].splice(0, t[ad].length, ...kalan);
      return { count };
    },
    upsert: async ({ where, create, update, select }: Kayit) => {
      olaylar.push(`${ad}.upsert`);
      // Bileşik tekil anahtar (ör. sourceText_targetLang) düz alanlara açılır.
      const k = t[ad].find((x) => eslesir(x, duzlestir(where)));
      if (k) {
        Object.assign(k, update);
        varsayilan(ad, k, false);
        return select ? secim(k, select) : { ...k };
      }
      const yeni = { id: `${ad}-${++sayac}`, ...create };
      varsayilan(ad, yeni, true);
      t[ad].push(yeni);
      return select ? secim(yeni, select) : { ...yeni };
    },
  });

  const db: any = {
    quote: tablo('quote'),
    ceviriTuketimi: tablo('ceviriTuketimi'),
    systemSettings: tablo('systemSettings'),
    translation: tablo('translation'),
    user: tablo('user'),
    firma: tablo('firma'),
    quoteFormat: tablo('quoteFormat'),
    quoteExport: tablo('quoteExport'),
    ceviriDuzeltmesi: tablo('ceviriDuzeltmesi'),
    ceviriDuzeltmeOlayi: tablo('ceviriDuzeltmeOlayi'),
    yoneticiOlayi: tablo('yoneticiOlayi'),
    abonelik: {
      ...tablo('abonelik'),
      // `include` ile iç içe paket sürümü kaydın kendisinde durur.
      findUnique: async ({ where }: Kayit) => {
        const k = t.abonelik.find((x) => eslesir(x, where));
        return k ? { ...k } : null;
      },
    },
    $queryRaw: async (parcalar: TemplateStringsArray, ...degerler: unknown[]) => {
      const metin = parcalar.join('?');
      if (metin.includes('pg_advisory_xact_lock')) {
        olaylar.push(`kilit:${degerler.join(',')}`);
        return [{ kilit: '' }];
      }
      if (metin.includes('_prisma_migrations')) {
        const adlar = degerler.flat().map(String);
        return t.migrations.filter((m) => adlar.includes(m.migration_name)).map((m) => ({ ...m }));
      }
      throw new Error(`sahte Prisma: tanınmayan ham sorgu: ${metin}`);
    },
    $transaction: async (arg: any, ayar?: { maxWait?: number; timeout?: number }) => {
      olaylar.push(`$transaction:${Array.isArray(arg) ? 'dizi' : `${ayar?.maxWait ?? '-'}/${ayar?.timeout ?? '-'}`}`);
      if (Array.isArray(arg)) return Promise.all(arg);
      const goruntu = structuredClone(t);
      try {
        return await arg(db);
      } catch (e) {
        for (const ad of Object.keys(goruntu) as Array<keyof Tablolar>) t[ad] = goruntu[ad];
        throw e;
      }
    },
  };

  return { db, t, olaylar, say: (onek: string) => olaylar.filter((o) => o.startsWith(onek)).length };
}
