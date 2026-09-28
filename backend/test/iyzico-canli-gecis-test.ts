/**
 * iyzico SANDBOX → CANLI ANAHTAR GEÇİŞİ  (`npm run test:iyzico-canli-gecis`) · 28.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. Betiğin GERÇEK akışı (`scripts/iyzico-canli-gecis.ts` →
 * `calistir`) ve kuralı (`src/ozellik/odeme/abonelik/canli-gecis.ts`) GERÇEK
 * `AbonelikServisi` (durum makinesi + miras geçidi) ile bellek-Prisma üzerinde
 * koşar; ardından GERÇEK `MutabakatJob` (saatlik kapanış + gece mutabakatı) ve
 * `ErisimServisi` bağlantıyı ölçer. Bellek-Prisma `webhook-tahsilat-dogrulama-
 * test.ts`teki taklidin kopyasıdır: `where`i GERÇEKTEN uygular, bilmediği
 * operatörde PATLAR.
 *
 * NEDEN: canlı iyzico hesabı ayrı ve boştur — sandbox kodları orada yoktur.
 * KARAR (Emre 28.09): sandbox KART aboneliğinin erişimi geçişte biter; havale
 * gerçek paradır, havale satırında yalnız kodlar temizlenir.
 *
 *   S  saf: satır eylemi tablosu · uygulama kapısı · `--beklenen` okuma
 *   P  PROVA: plan doğru, HİÇBİR tablo değişmez, çıktıda iyzico kodu yok
 *   U  UYGULA: durum başına sonuç · havale · niyet · olay · fatura · deneme ·
 *      denetim izi · idempotent ikinci koşum
 *   B  BAĞLANTI: saatlik iş IPTAL satırları kapatır, erişim yok; gece
 *      mutabakatı iyzico'ya sormaz; satın alma kapısı açılır
 *   G  KAPI: sandbox adresi ve yanlış `--beklenen` hiçbir şey yazmaz
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { MutabakatJob } from '../src/ozellik/odeme/abonelik/mutabakat.job';
import { iyzicoAboneligiAcikMi } from '../src/ozellik/odeme/abonelik/paket-degisimi';
import {
  ANAHTAR_GECISI_OLAYI,
  gecisiUygula,
  gecisPlaniCikar,
  planYaz,
  satirEylemi,
  uygulamaEngeli,
} from '../src/ozellik/odeme/abonelik/canli-gecis';
import { beklenenOku, calistir } from '../scripts/iyzico-canli-gecis';
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

if (!process.env.ICG_GUNLUK) Logger.overrideLogger(false);

const GUN = 86_400_000;
const CANLI = 'https://api.iyzipay.com';
const SANDBOX = 'https://sandbox-api.iyzipay.com';
const iso = (t: unknown) => (t instanceof Date ? t.toISOString() : String(t));

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — `webhook-tahsilat-dogrulama-test.ts`teki taklidin kopyası
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
};

const TEKIL: Record<string, string[]> = {
  abonelik: ['firmaId', 'iyzicoAbonelikKodu'],
  fatura: ['tahsilatKodu'],
  webhookOlayi: ['tekilAnahtar'],
  abonelikBaslatma: ['token'],
};

const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    denemeSonu: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null, iyzicoMusteriKodu: null,
    iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART', ilkBasarisizlik: null,
    denemeSayisi: 0, sonDeneme: null, kisitlandi: null, iptalTalebi: null, iptalNedeni: null,
    planliPaketSurumuId: null, paketGecisTarihi: null, odenenPaketSurumuId: null, kopruErisimSonu: null,
    mirasPaketSurumuId: null, mirasErisimSonu: null, tahsilatKirasi: null,
    olusturuldu: new Date(), guncellendi: new Date(),
  }),
  abonelikOlayi: () => ({ olusturuldu: new Date(), aktor: 'sistem', oncekiDurum: null, yeniDurum: null }),
  webhookOlayi: () => ({
    kaynak: 'iyzico', imzaBasligi: null, imzaGecerli: false, abonelikKodu: null, siparisKodu: null,
    musteriKodu: null, iyzicoRefKodu: null, olayZamani: null, islendi: false, islenmeZamani: null,
    denemeSayisi: 0, hata: null, alindi: new Date(),
  }),
  fatura: () => ({ durum: 'BEKLIYOR', faturaNo: null, hata: null, olusturuldu: new Date() }),
  abonelikBaslatma: () => ({ durum: 'BEKLIYOR', iyzicoAbonelikKodu: null, hata: null, sonuclandi: null, olusturuldu: new Date() }),
  denemeKullanimi: () => ({ iyzicoMusteriKodu: null, olusturuldu: new Date() }),
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

function anahtarDenetle(model: string, islem: string, arg: any, izinli: string[]): void {
  for (const k of Object.keys(arg ?? {})) {
    if (!izinli.includes(k)) throw new Error(`bellek-Prisma: ${model}.${islem} "${k}" desteklenmiyor`);
  }
}

function sirala(satirlar: Satir[], orderBy: any): Satir[] {
  if (!orderBy) return satirlar;
  const kurallar = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...satirlar].sort((a, b) => {
    for (const kural of kurallar) {
      const [alan, yon] = Object.entries(kural)[0] as [string, string];
      const x = a[alan] instanceof Date ? a[alan].getTime() : a[alan];
      const y = b[alan] instanceof Date ? b[alan].getTime() : b[alan];
      if (x === y) continue;
      return (x < y ? -1 : 1) * (yon === 'asc' ? 1 : -1);
    }
    return 0;
  });
}

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);

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
    for (const [k, v] of Object.entries(spec?.include ?? {})) if (v) sonuc[k] = iliski(k, v);
    return sonuc;
  }

  function veriUygula(hedef: Satir, data: Satir): void {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) hedef[k] = (hedef[k] ?? 0) + (v as any).increment;
      else hedef[k] = v;
    }
  }

  function tekillikDenetle(model: string, aday: Satir, haric?: Satir): void {
    for (const alan of TEKIL[model] ?? []) {
      const d = aday[alan];
      if (d === null || d === undefined) continue;
      if (tablo(model).some((r) => r !== haric && r[alan] === d)) {
        throw Object.assign(new Error(`Unique constraint failed on ${model}.${alan}`), { code: 'P2002' });
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
      return (typeof arg.take === 'number' ? hepsi.slice(0, arg.take) : hepsi).map((s) => yansit(model, s, arg));
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
        // Taklit ATOMİK DEĞİL: işlem gövdesi aynı yüzeyle koşar (bu kapı
        // atomikliği ölçmez; satır başına koşullu yazımı ölçer).
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

/** Tüm tabloların derin kopyası (tarihler ISO) — "hiçbir şey değişmedi" ölçütü. */
function goruntu(db: ReturnType<typeof bellekPrisma>): string {
  const modeller = ['abonelik', 'abonelikOlayi', 'abonelikBaslatma', 'webhookOlayi', 'fatura', 'denemeKullanimi', 'paketSurumu'];
  return JSON.stringify(modeller.map((m) => db.tablo(m)));
}

// ═════════════════════════════════════════════════════════════════════════
//  DÜNYA — geçiş günündeki olası satırların hepsi
// ═════════════════════════════════════════════════════════════════════════
function dunyaKur() {
  const db = bellekPrisma();
  const sorulan: string[] = [];
  const iyzico = {
    abonelikGetir: async (kod: string) => {
      sorulan.push(kod);
      throw new Error('sahte iyzico: canlıda bu kod YOK');
    },
  } as any;
  const simdi = Date.now();
  db.ekle('paket', { id: 'P-PRO', kod: 'pro-mek', ad: 'Pro Mekanik', kullaniciHakki: 2, dwgAktif: true });
  db.ekle('paket', { id: 'P-MIRAS', kod: 'miras-core', ad: 'Geçiş Core', kullaniciHakki: 1, dwgAktif: false });
  db.ekle('paketSurumu', {
    id: 'S-PRO', paketId: 'P-PRO', surumNo: 2, periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 0,
    tutar: 1649, paraBirimi: 'TRY', iyzicoPlanKodu: 'plan-sandbox-pro', iyzicoUrunKodu: 'urun-sandbox', satistaMi: true,
  });
  db.ekle('paketSurumu', {
    id: 'S-MIRAS', paketId: 'P-MIRAS', surumNo: 1, periyot: 'YEARLY', periyotAdedi: 1, denemeGunu: 0,
    tutar: 0, paraBirimi: 'TRY', iyzicoPlanKodu: null, iyzicoUrunKodu: null, satistaMi: false,
  });
  const firma = (id: string) =>
    db.ekle('firma', { id, ad: `Firma ${id}`, imhaTarihi: null, faturaEposta: `f@${id.toLowerCase()}.test` });
  const kodlar = (k: string, durum = 'ACTIVE') => ({
    iyzicoAbonelikKodu: `sub-${k}`, iyzicoKokKodu: `kok-${k}`, iyzicoMusteriKodu: `cus-${k}`, iyzicoDurum: durum,
  });
  const satir = (id: string, alanlar: Satir) => {
    firma(id);
    return db.ekle('abonelik', { firmaId: id, paketSurumuId: 'S-PRO', odemeYontemi: 'KART', ...alanlar });
  };
  const s = {
    aktif: satir('F-AKTIF', {
      durum: 'AKTIF', erisimSonu: new Date(simdi + 20 * GUN), ...kodlar('aktif'),
      planliPaketSurumuId: 'S-PRO', paketGecisTarihi: new Date(simdi + 20 * GUN), odenenPaketSurumuId: 'S-PRO',
      kopruErisimSonu: new Date(simdi + 20 * GUN), iyzicoSonKontrol: new Date(simdi - GUN),
    }),
    deneme: satir('F-DENEME', {
      durum: 'DENEME', denemeSonu: new Date(simdi + 10 * GUN), erisimSonu: new Date(simdi + 10 * GUN), ...kodlar('deneme'),
    }),
    odeme: satir('F-ODEME', {
      durum: 'ODEME_BEKLIYOR', erisimSonu: new Date(simdi - 3 * GUN), ...kodlar('odeme', 'UNPAID'),
      ilkBasarisizlik: new Date(simdi - 3 * GUN), denemeSayisi: 2, sonDeneme: new Date(simdi - GUN),
    }),
    kisitli: satir('F-KISITLI', {
      durum: 'KISITLI', erisimSonu: new Date(simdi - 12 * GUN), ...kodlar('kisitli', 'UNPAID'),
      ilkBasarisizlik: new Date(simdi - 12 * GUN), denemeSayisi: 4, kisitlandi: new Date(simdi - 2 * GUN),
    }),
    askida: satir('F-ASKIDA', {
      durum: 'ASKIDA', erisimSonu: new Date(simdi - 40 * GUN), ...kodlar('askida', 'UNPAID'),
      ilkBasarisizlik: new Date(simdi - 40 * GUN), denemeSayisi: 6,
    }),
    askidaMiras: satir('F-ASKIDA-M', {
      durum: 'ASKIDA', erisimSonu: new Date(simdi - 40 * GUN), ...kodlar('askida-m', 'UNPAID'),
      ilkBasarisizlik: new Date(simdi - 40 * GUN), denemeSayisi: 6,
      mirasPaketSurumuId: 'S-MIRAS', mirasErisimSonu: new Date(simdi + 300 * GUN),
    }),
    iptal: satir('F-IPTAL', {
      durum: 'IPTAL', erisimSonu: new Date(simdi + 15 * GUN), iptalTalebi: new Date(simdi - GUN), ...kodlar('iptal', 'CANCELED'),
    }),
    sona: satir('F-SONA', { durum: 'SONA_ERDI', erisimSonu: new Date(simdi - 5 * GUN), ...kodlar('sona') }),
    havale: satir('F-HAVALE', {
      durum: 'AKTIF', odemeYontemi: 'HAVALE', erisimSonu: new Date(simdi + 200 * GUN), ...kodlar('havale', 'CANCELED'),
      // Havale döneminin sonunda planlı paket geçişi (yönetici): kart
      // temizliği bunu SİLMEMELİ — havale satırında yalnız iyzico izleri gider.
      planliPaketSurumuId: 'S-PRO', paketGecisTarihi: new Date(simdi + 200 * GUN),
    }),
    temiz: satir('F-TEMIZ', { durum: 'SONA_ERDI', erisimSonu: new Date(simdi - 50 * GUN) }),
    // Kodları gitmiş ama `iyzicoDurum`u kalmış satır: satın alma kapısı YALNIZ
    // ona bakar (ACTIVE → "açık kart aboneliği") — o da temizlenmeli.
    yalnizDurum: satir('F-DURUM', { durum: 'SONA_ERDI', erisimSonu: new Date(simdi - 9 * GUN), iyzicoDurum: 'ACTIVE' }),
    mirasHavale: satir('F-MIRAS-H', {
      durum: 'AKTIF', odemeYontemi: 'HAVALE', paketSurumuId: 'S-MIRAS', erisimSonu: new Date(simdi + 300 * GUN),
      mirasPaketSurumuId: 'S-MIRAS', mirasErisimSonu: new Date(simdi + 300 * GUN),
    }),
  };
  const once = new Map(Object.entries(s).map(([k, v]) => [k, { ...v }]));
  db.ekle('abonelikBaslatma', { token: 'tok-bekleyen', firmaId: 'F-YENI', paketSurumuId: 'S-PRO', olusturanId: 'U-1' });
  db.ekle('abonelikBaslatma', {
    token: 'tok-bitmis', firmaId: 'F-AKTIF', paketSurumuId: 'S-PRO', olusturanId: 'U-2', durum: 'TAMAMLANDI',
    iyzicoAbonelikKodu: 'sub-aktif',
  });
  db.ekle('webhookOlayi', { tekilAnahtar: 'iyzico:s:1', olayTipi: 'subscription.order.success', hamGovde: {}, siparisKodu: 'ord-1' });
  db.ekle('webhookOlayi', {
    tekilAnahtar: 'iyzico:s:2', olayTipi: 'subscription.order.success', hamGovde: {}, siparisKodu: 'ord-2', islendi: true,
  });
  db.ekle('fatura', { abonelikId: s.aktif.id, tahsilatKodu: 'ord-bekliyor', durum: 'BEKLIYOR' });
  db.ekle('fatura', { abonelikId: s.odeme.id, tahsilatKodu: 'ord-hata', durum: 'HATA' });
  db.ekle('fatura', { abonelikId: s.sona.id, tahsilatKodu: 'ord-kesildi', durum: 'KESILDI', faturaNo: 'NES-0001' });
  db.ekle('fatura', { abonelikId: s.havale.id, tahsilatKodu: 'havale:h-1', durum: 'BEKLIYOR' });
  db.ekle('denemeKullanimi', { firmaId: 'F-DENEME', kaynak: 'deneme', iyzicoMusteriKodu: 'cus-deneme' });
  const abonelik = new AbonelikServisi(db.prisma, iyzico);
  const mutabakat = new MutabakatJob(db.prisma, iyzico, abonelik);
  const erisim = new ErisimServisi(db.prisma);
  const cikti: string[] = [];
  const hatalar: string[] = [];
  const kos = (argv: string[], taban = CANLI) =>
    calistir({ argv, prisma: db.prisma, taban, yaz: (x) => cikti.push(x), hata: (x) => hatalar.push(x) });
  const izler = (id: string) => db.tablo('abonelikOlayi').filter((o) => o.abonelikId === id && o.tip === ANAHTAR_GECISI_OLAYI);
  return { db, s, once, simdi, sorulan, mutabakat, erisim, cikti, hatalar, kos, izler, abonelik };
}

const KODSUZ = (ab: Satir) =>
  ab.iyzicoAbonelikKodu === null && ab.iyzicoKokKodu === null && ab.iyzicoMusteriKodu === null &&
  ab.iyzicoDurum === null && ab.iyzicoSonKontrol === null;

// ═════════════════════════════════════════════════════════════════════════
async function main(): Promise<void> {
  console.log('\n── S · saf: satır eylemi · uygulama kapısı · --beklenen ──');
  const tablo: Array<[string, string, string]> = [
    ['KART', 'DENEME', 'iptal'], ['KART', 'AKTIF', 'iptal'], ['KART', 'ODEME_BEKLIYOR', 'iptal'],
    ['KART', 'KISITLI', 'iptal'], ['KART', 'ASKIDA', 'sona-erdi'], ['KART', 'IPTAL', 'erisim'],
    ['KART', 'SONA_ERDI', 'yalniz-kod'], ['HAVALE', 'AKTIF', 'yalniz-kod'], ['HAVALE', 'ASKIDA', 'yalniz-kod'],
  ];
  const sapan = tablo.filter(([y, d, e]) => satirEylemi({ odemeYontemi: y, durum: d }) !== e);
  check(`S1 satır eylemi tablosu (${tablo.length} satır) — HAVALE hiçbir durumda erişim/durum değiştirmez`,
    sapan.length === 0, JSON.stringify(sapan));
  const plan = (n: number, canli: boolean, onceki: Date | null = null, etkinlik = 0) =>
    ({
      canli, taban: canli ? CANLI : SANDBOX, abonelikler: Array(n).fill({}), oncekiGecis: onceki,
      sonrakiEtkinlik: { niyet: etkinlik, olay: 0, abonelik: 0 },
    }) as any;
  check('S2 ⭐ uygulama kapısı: sandbox adresi · --beklenen yok · sayı tutmuyor → ENGEL; canlı + eşit sayı → geçer',
    !!uygulamaEngeli(plan(1, false), 1) && !!uygulamaEngeli(plan(1, true), null) && !!uygulamaEngeli(plan(2, true), 1) &&
      uygulamaEngeli(plan(1, true), 1) === null && uygulamaEngeli(plan(0, true), 0) === null);
  check('S2b ⭐ tekrar kilidi: önceki uygulamadan SONRA canlı etkinlik varsa ENGEL (sayı tutsa da); etkinlik yoksa geçer (bakım penceresinde yeniden koşum)',
    !!uygulamaEngeli(plan(1, true, new Date(), 1), 1) && uygulamaEngeli(plan(1, true, new Date(), 0), 1) === null);
  check('S3 --beklenen okuma: yalnız negatif olmayan tam sayı',
    beklenenOku(['x', '--beklenen=3']) === 3 && beklenenOku(['--beklenen=0']) === 0 && beklenenOku(['--beklenen=']) === null &&
      beklenenOku(['--beklenen=-1']) === null && beklenenOku(['--beklenen=1.5']) === null && beklenenOku([]) === null);

  console.log('\n── P · PROVA: plan doğru, hiçbir tablo değişmez, çıktıda iyzico kodu yok ──');
  {
    const d = dunyaKur();
    const once = goruntu(d.db);
    const kod = await d.kos([]);
    const p = await gecisPlaniCikar(d.db.prisma, CANLI);
    check('P1 ⭐ PROVA hiçbir şey yazmadı (tüm tablolar aynı), çıkış 0', goruntu(d.db) === once && kod === 0);
    const idler = p.abonelikler.map((a) => a.id).sort();
    const beklenen = ['aktif', 'deneme', 'odeme', 'kisitli', 'askida', 'askidaMiras', 'iptal', 'sona', 'havale', 'yalnizDurum']
      .map((k) => (d.s as any)[k].id).sort();
    check('P2 plan: kodlu 10 satır (yalnız iyzicoDurum kalmış satır DAHİL) (kodsuz kart ve miras havale YOK), niyet 1, olay 1, iptal edilecek kart faturası 2, kesilmiş 1, deneme 1, satıştaki sürüm 1',
      JSON.stringify(idler) === JSON.stringify(beklenen) && p.bekleyenNiyet === 1 && p.islenmemisOlay === 1 &&
        p.iptalEdilecekFatura.length === 2 && p.kesilmisKartFatura.map((f) => f.faturaNo).join() === 'NES-0001' &&
        p.denemeMusteriKodlu === 1 && p.satistakiSurum.length === 1 && p.canli === true,
      JSON.stringify({ n: idler.length, niyet: p.bekleyenNiyet, olay: p.islenmemisOlay, f: p.iptalEdilecekFatura.length }));
    const metin = d.cikti.join('\n') + planYaz(p);
    const sizan = ['sub-', 'kok-', 'cus-'].filter((k) => metin.includes(k));
    check('P3 ⭐ çıktıda iyzico kodu YOK; kesilmiş fatura NES numarasıyla ve seedpaketler adımı yazıldı; uygula komutu doğru sayıyı önerir',
      sizan.length === 0 && metin.includes('NES-0001') && metin.includes('seedpaketler -- --tek-urun') &&
        metin.includes('--uygula --beklenen=10'),
      `sizan=${sizan} cikti=${d.cikti.join(' | ').slice(0, 300)}`);
  }

  console.log('\n── G · kapı: sandbox adresi ve yanlış --beklenen hiçbir şey yazmaz ──');
  {
    const d = dunyaKur();
    const once = goruntu(d.db);
    const k1 = await d.kos(['--uygula', '--beklenen=10'], SANDBOX);
    const k2 = await d.kos(['--uygula', '--beklenen=8']);
    const k3 = await d.kos(['--uygula']);
    check('G1 ⭐ sandbox adresinde, yanlış ve eksik --beklenen ile UYGULANMADI: çıkış 1, tablolar aynı, neden yazıldı',
      k1 === 1 && k2 === 1 && k3 === 1 && goruntu(d.db) === once && d.hatalar.length === 3 &&
        d.hatalar[0].includes('CANLI değil') && d.hatalar[1].includes('dünya değişti') && d.hatalar[2].includes('--beklenen'),
      JSON.stringify(d.hatalar));
  }

  console.log('\n── U · UYGULA: durum başına sonuç ──');
  const d = dunyaKur();
  const t0 = Date.now();
  const kod = await d.kos(['--uygula', '--beklenen=10']);
  const t1 = Date.now();
  const simdiMi = (x: unknown) => x instanceof Date && x.getTime() >= t0 && x.getTime() <= t1;
  const { s, once } = d;
  check('U0 çıkış 0, atlanan yok', kod === 0 && d.hatalar.length === 0, JSON.stringify(d.hatalar));
  check('U1 ⭐ AKTIF kart (Emre\'nin test firması): IPTAL, erişim ŞİMDİ, kodlar + köprü + bekleyen paket değişimi temiz',
    s.aktif.durum === 'IPTAL' && simdiMi(s.aktif.erisimSonu) && KODSUZ(s.aktif) && s.aktif.kopruErisimSonu === null &&
      s.aktif.planliPaketSurumuId === null && s.aktif.paketGecisTarihi === null && s.aktif.odenenPaketSurumuId === null,
    `durum=${s.aktif.durum} erisimSonu=${iso(s.aktif.erisimSonu)} kod=${s.aktif.iyzicoAbonelikKodu}`);
  const iz = d.izler(s.aktif.id);
  check('U1b ⭐ denetim izi ÖNCE yazıldı: eski kodlar + önceki durum/erişim; durum geçişi durum makinesinden (aktör anahtar-gecisi)',
    iz.length === 1 && iz[0].veri?.eskiKodlar?.iyzicoAbonelikKodu === 'sub-aktif' && iz[0].veri?.eskiKodlar?.iyzicoDurum === 'ACTIVE' &&
      iz[0].veri?.oncekiDurum === 'AKTIF' && iz[0].veri?.oncekiErisimSonu === once.get('aktif')!.erisimSonu.toISOString() &&
      d.db.tablo('abonelikOlayi').some((o) => o.abonelikId === s.aktif.id && o.tip === 'durum.degisti' &&
        o.yeniDurum === 'IPTAL' && o.aktor === 'anahtar-gecisi'),
    JSON.stringify(iz.map((o) => o.veri)));
  check('U2 DENEME · ODEME_BEKLIYOR · KISITLI → IPTAL, erişim şimdi, dunning sayaçları sıfır, kodlar temiz',
    [s.deneme, s.odeme, s.kisitli].every((a) => a.durum === 'IPTAL' && simdiMi(a.erisimSonu) && KODSUZ(a) &&
      a.ilkBasarisizlik === null && a.denemeSayisi === 0 && a.kisitlandi === null),
    [s.deneme, s.odeme, s.kisitli].map((a) => `${a.firmaId}=${a.durum}/${a.denemeSayisi}`).join(' '));
  check('U3 ⭐ ASKIDA → SONA_ERDI; miras hakkı olan ASKIDA → geçit mirasa DÖNDÜRDÜ (miras paketi, AKTIF, HAVALE); ikisinde de kodlar temiz',
    s.askida.durum === 'SONA_ERDI' && KODSUZ(s.askida) && s.askidaMiras.durum === 'AKTIF' &&
      s.askidaMiras.paketSurumuId === 'S-MIRAS' && s.askidaMiras.odemeYontemi === 'HAVALE' && KODSUZ(s.askidaMiras),
    `askida=${s.askida.durum} miras=${s.askidaMiras.durum}/${s.askidaMiras.paketSurumuId}/${s.askidaMiras.odemeYontemi}`);
  check('U4 IPTAL → erişim ŞİMDİ (15 gün kısaldı), durum aynı; SONA_ERDI → yalnız kodlar (durum ve erişim aynı)',
    s.iptal.durum === 'IPTAL' && simdiMi(s.iptal.erisimSonu) && KODSUZ(s.iptal) &&
      s.sona.durum === 'SONA_ERDI' && s.sona.erisimSonu.getTime() === once.get('sona')!.erisimSonu.getTime() && KODSUZ(s.sona),
    `iptal=${iso(s.iptal.erisimSonu)} sona=${iso(s.sona.erisimSonu)}`);
  check('U5 ⭐ HAVALE (gerçek para): yalnız kodlar temiz — durum AKTIF, erişim +200 gün ve planlı paket geçişi aynen, ödeme yöntemi HAVALE',
    s.havale.durum === 'AKTIF' && s.havale.odemeYontemi === 'HAVALE' && s.havale.planliPaketSurumuId === 'S-PRO' &&
      s.havale.paketGecisTarihi instanceof Date &&
      s.havale.erisimSonu.getTime() === once.get('havale')!.erisimSonu.getTime() && KODSUZ(s.havale),
    `durum=${s.havale.durum} erisimSonu=${iso(s.havale.erisimSonu)}`);
  check('U6 kodsuz satırlara DOKUNULMADI (iz yok, alanlar aynı)',
    d.izler(s.temiz.id).length === 0 && d.izler(s.mirasHavale.id).length === 0 &&
      JSON.stringify(s.temiz) === JSON.stringify(once.get('temiz')) &&
      JSON.stringify(s.mirasHavale) === JSON.stringify(once.get('mirasHavale')));
  const niyetler = d.db.tablo('abonelikBaslatma');
  check('U7 bekleyen niyet → VAZGECILDI (hata + sonuçlandı damgası); tamamlanmış niyete dokunulmadı',
    niyetler.find((n) => n.token === 'tok-bekleyen')?.durum === 'VAZGECILDI' &&
      String(niyetler.find((n) => n.token === 'tok-bekleyen')?.hata).includes('anahtar geçişi') &&
      simdiMi(niyetler.find((n) => n.token === 'tok-bekleyen')?.sonuclandi) &&
      niyetler.find((n) => n.token === 'tok-bitmis')?.durum === 'TAMAMLANDI',
    JSON.stringify(niyetler.map((n) => [n.token, n.durum])));
  const olaylar = d.db.tablo('webhookOlayi');
  check('U8 işlenmemiş sandbox olayı → işlendi + hata (canlı API\'ye sorulmayacak); işlenmişe dokunulmadı',
    olaylar.find((o) => o.siparisKodu === 'ord-1')?.islendi === true &&
      String(olaylar.find((o) => o.siparisKodu === 'ord-1')?.hata).includes('sandbox olayı işlenmedi') &&
      olaylar.find((o) => o.siparisKodu === 'ord-2')?.hata === null);
  const faturalar = d.db.tablo('fatura');
  const fd = (k: string) => faturalar.find((f) => f.tahsilatKodu === k)?.durum;
  check('U9 ⭐ kesilmemiş kart faturaları (BEKLIYOR, HATA) → IPTAL; KESİLMİŞ ve havale faturasına dokunulmadı',
    fd('ord-bekliyor') === 'IPTAL' && fd('ord-hata') === 'IPTAL' && fd('ord-kesildi') === 'KESILDI' &&
      fd('havale:h-1') === 'BEKLIYOR' &&
      String(faturalar.find((f) => f.tahsilatKodu === 'ord-bekliyor')?.hata).includes('gerçek para yok'),
    JSON.stringify(faturalar.map((f) => [f.tahsilatKodu, f.durum])));
  check('U10 deneme kaydı (müşteri kodlu) DOKUNULMADI — deneme hakkı firmaya bağlı kalır',
    d.db.tablo('denemeKullanimi')[0]?.iyzicoMusteriKodu === 'cus-deneme');

  console.log('\n── U · idempotent: ikinci koşum hiçbir şey değiştirmez ──');
  {
    const sonra = goruntu(d.db);
    d.cikti.length = 0;
    const kod2 = await d.kos(['--uygula', '--beklenen=0']);
    check('U11 ⭐ ikinci koşum: kodlu satır 0, çıkış 0, TÜM tablolar aynı (yeni iz yok)',
      kod2 === 0 && goruntu(d.db) === sonra, d.cikti.join(' | ').slice(0, 200));
  }

  console.log('\n── U · plan ile uygulama arasında satır değişirse ATLANIR (yeni kod silinmez) ──');
  {
    const d2 = dunyaKur();
    const plan = await gecisPlaniCikar(d2.db.prisma, CANLI);
    // Plan okunduktan sonra firma CANLI iyzico'dan yeniden satın aldı: yeni kod.
    d2.s.sona.iyzicoAbonelikKodu = 'sub-canli-yeni';
    const sonuc = await gecisiUygula(d2.db.prisma, d2.abonelik, plan);
    check('U12 değişen satır ATLANDI ve raporlandı; canlı iyzico kodu SİLİNMEDİ; diğer satırlar uygulandı',
      sonuc.atlanan.map((a) => a.id).join() === d2.s.sona.id && d2.s.sona.iyzicoAbonelikKodu === 'sub-canli-yeni' &&
        sonuc.uygulanan.length === plan.abonelikler.length - 1,
      JSON.stringify({ atlanan: sonuc.atlanan, kod: d2.s.sona.iyzicoAbonelikKodu, uygulanan: sonuc.uygulanan.length }));
  }

  console.log('\n── U · uygulama YALNIZ plandaki kimliklere dokunur; durumu değişen satır atlanır ──');
  {
    const d3 = dunyaKur();
    const plan = await gecisPlaniCikar(d3.db.prisma, CANLI);
    // Plan okunduktan sonra: yeni (canlı) bir niyet ve gelen bir olay doğdu;
    // IPTAL satır yeniden AKTIF oldu (havale onayı gibi).
    const yeniNiyet = d3.db.ekle('abonelikBaslatma', {
      token: 'tok-arada', firmaId: 'F-ARA', paketSurumuId: 'S-PRO', olusturanId: 'U-8',
    });
    const yeniOlay = d3.db.ekle('webhookOlayi', {
      tekilAnahtar: 'iyzico:s:ara', olayTipi: 'subscription.order.success', hamGovde: {}, siparisKodu: 'ord-ara',
    });
    d3.s.iptal.durum = 'AKTIF';
    const iptalErisim = d3.s.iptal.erisimSonu.getTime();
    const sonuc = await gecisiUygula(d3.db.prisma, d3.abonelik, plan);
    check('U13 ⭐ arada doğan niyet ve olaya DOKUNULMADI (plan anlık görüntüsü); plandakiler kapandı',
      yeniNiyet.durum === 'BEKLIYOR' && yeniOlay.islendi === false && sonuc.vazgecilenNiyet === 1 && sonuc.kapatilanOlay === 1,
      JSON.stringify({ niyet: yeniNiyet.durum, olay: yeniOlay.islendi, v: sonuc.vazgecilenNiyet, k: sonuc.kapatilanOlay }));
    check('U14 ⭐ durumu arada değişen (IPTAL → AKTIF) satır ATLANDI: erişimi şimdiye ÇEKİLMEDİ, AKTIF kaldı',
      sonuc.atlanan.some((a) => a.id === d3.s.iptal.id) && d3.s.iptal.durum === 'AKTIF' &&
        d3.s.iptal.erisimSonu.getTime() === iptalErisim,
      JSON.stringify({ atlanan: sonuc.atlanan.map((a) => a.id), durum: d3.s.iptal.durum }));
  }

  console.log('\n── B · BAĞLANTI: saatlik iş · erişim · gece mutabakatı · satın alma kapısı ──');
  {
    const kapiOnce = iyzicoAboneligiAcikMi(d.once.get('sona') as any);
    await d.mutabakat.suresiDolanlariKapat();
    const kapanan = [s.aktif, s.deneme, s.odeme, s.kisitli, s.iptal];
    check('B1 ⭐ saatlik iş erişimi biten IPTAL satırlarını SONA_ERDI yaptı (durum makinesi, olağan yol)',
      kapanan.every((a) => a.durum === 'SONA_ERDI'), kapanan.map((a) => `${a.firmaId}=${a.durum}`).join(' '));
    const karar = await d.erisim.karar('F-AKTIF');
    check('B2 ⭐ test firmasının erişimi YOK', karar.erisimVar === false, JSON.stringify({ durum: karar.durum, erisim: karar.erisimVar }));
    await d.mutabakat.geceMutabakati();
    check('B3 ⭐ gece mutabakatı canlı iyzico\'ya sandbox kodu SORMADI (kodlu kart satırı kalmadı)',
      d.sorulan.length === 0, JSON.stringify(d.sorulan));
    check('B4 ⭐ satın alma kapısı: "açık kart aboneliği" engeli kalktı (önce ACTIVE → sonra yok) — yalnız durumu kalmış satırda da',
      kapiOnce === true && iyzicoAboneligiAcikMi(s.sona as any) === false &&
        iyzicoAboneligiAcikMi(d.once.get('yalnizDurum') as any) === true && iyzicoAboneligiAcikMi(s.yalnizDurum as any) === false);
  }

  console.log('\n── G · tekrar kilidi: ilk uygulamadan SONRA canlı satın alma geldiyse betik yeniden UYGULANMAZ ──');
  {
    // Ana dünya uygulandı (U). Backend canlıyla açıldı; bir firma CANLI kartla
    // aldı: tamamlanmış niyet + satıra canlı kod. Kodlu satır artık canlıdır.
    const sonra = new Date(Date.now() + 1000);
    d.db.ekle('abonelikBaslatma', {
      token: 'tok-canli', firmaId: 'F-SONA', paketSurumuId: 'S-PRO', olusturanId: 'U-9', durum: 'TAMAMLANDI',
      iyzicoAbonelikKodu: 'sub-canli', olusturuldu: sonra, sonuclandi: sonra,
    });
    Object.assign(s.sona, { iyzicoAbonelikKodu: 'sub-canli', iyzicoMusteriKodu: 'cus-canli', iyzicoDurum: 'ACTIVE' });
    const once = goruntu(d.db);
    d.hatalar.length = 0;
    d.cikti.length = 0;
    const k = await d.kos(['--uygula', '--beklenen=1']);
    check('G2 ⭐ geçişten sonra canlı etkinlik var: --uygula REDDEDİLDİ (sayı tutsa da), canlı satır ve tüm tablolar AYNI; PROVA önceki uygulamayı gösterir',
      k === 1 && goruntu(d.db) === once && s.sona.iyzicoAbonelikKodu === 'sub-canli' &&
        d.hatalar.some((h) => h.includes('canlı etkinlik var')) && d.cikti.join('\n').includes('önceki uygulama:'),
      `k=${k} hatalar=${JSON.stringify(d.hatalar)}`);
  }

  console.log('\n── G · tekrar kilidi her etkinlik türünde (taze dünya): gelen olay · yeni abonelik · uygulamadan ÖNCE açılıp SONRA tamamlanan niyet ──');
  {
    type Dunya = ReturnType<typeof dunyaKur>;
    const durumlar: Array<[string, number, (d: Dunya, esik: number) => void]> = [
      ['etkinlik yok (bakım penceresinde yeniden koşum)', 0, () => undefined],
      ['gelen olay', 0, (d, esik) => {
        d.db.ekle('webhookOlayi', {
          tekilAnahtar: 'iyzico:s:canli', olayTipi: 'subscription.order.success', hamGovde: {}, siparisKodu: 'ord-canli',
          alindi: new Date(esik + 1000),
        });
      }],
      ['yeni abonelik satırı', 1, (d, esik) => {
        d.db.ekle('firma', { id: 'F-CANLI', ad: 'Firma F-CANLI', imhaTarihi: null, faturaEposta: 'f@canli.test' });
        d.db.ekle('abonelik', {
          firmaId: 'F-CANLI', paketSurumuId: 'S-PRO', durum: 'AKTIF', erisimSonu: new Date(esik + 30 * GUN),
          iyzicoAbonelikKodu: 'sub-canli-2', iyzicoDurum: 'ACTIVE', olusturuldu: new Date(esik + 1000),
        });
      }],
      ['uygulamadan ÖNCE açılıp SONRA tamamlanan niyet', 0, (d, esik) => {
        d.db.ekle('abonelikBaslatma', {
          token: 'tok-ara', firmaId: 'F-YENI', paketSurumuId: 'S-PRO', olusturanId: 'U-8', durum: 'TAMAMLANDI',
          olusturuldu: new Date(esik - 1000), sonuclandi: new Date(esik + 1000),
        });
      }],
    ];
    const sonuc: string[] = [];
    for (const [ad, beklenen, etkinlik] of durumlar) {
      const d = dunyaKur();
      const ilk = await d.kos(['--uygula', '--beklenen=10']);
      const esik = Math.min(
        ...d.db.tablo('abonelikOlayi').filter((o) => o.tip === ANAHTAR_GECISI_OLAYI).map((o) => o.olusturuldu.getTime()),
      );
      etkinlik(d, esik);
      const once = goruntu(d.db);
      d.hatalar.length = 0;
      const k = await d.kos(['--uygula', `--beklenen=${beklenen}`]);
      const reddedildi = k === 1 && goruntu(d.db) === once && d.hatalar.some((h) => h.includes('canlı etkinlik var'));
      sonuc.push(`${ad}: ilk=${ilk} k=${k} ${reddedildi ? 'REDDEDİLDİ' : 'geçti'}`);
    }
    check('G3 ⭐ ilk uygulamadan sonra gelen olay, yeni abonelik satırı ve ÖNCE açılıp SONRA tamamlanan niyet ayrı ayrı --uygula\'yı REDDETTİ (tablolar aynı); etkinlik yokken yeniden koşum geçti',
      sonuc.join(' | ') ===
        'etkinlik yok (bakım penceresinde yeniden koşum): ilk=0 k=0 geçti | gelen olay: ilk=0 k=1 REDDEDİLDİ | ' +
          'yeni abonelik satırı: ilk=0 k=1 REDDEDİLDİ | uygulamadan ÖNCE açılıp SONRA tamamlanan niyet: ilk=0 k=1 REDDEDİLDİ',
      sonuc.join(' | '));
  }

  console.log(`\n${'='.repeat(64)}\niyzico CANLI GEÇİŞ: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
