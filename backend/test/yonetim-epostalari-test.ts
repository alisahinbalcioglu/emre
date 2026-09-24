/**
 * YÖNETİM E-POSTALARI — uyarılar + NES fatura kesim talebi (`npm run test:yonetim-epostalari`)
 *
 * AĞ/DB GEREKTİRMEZ: Prisma yerine bellek-içi tablo, SMTP yerine gönderimi
 * kaydeden taklit konur; `FaturaServisi.kuyrugaAl` + `tekFatura`,
 * `ElleMuhasebeAdaptoru.faturaKes` ve ortak yönetim bildirimi GERÇEKTEN
 * çağrılır ve DAVRANIŞ ölçülür.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Emre (24.09.2026): "faturalar ve uyarılar vs. e posta olarak gitmeli".
 * Aynı gün ölçülen üç kusur:
 *
 *   (1) Yönetici uyarıları YALNIZ `YONETIM_EPOSTA`ya gidiyordu ve canlıda bu
 *       değişken BOŞ. Çift tahsilat, iyzico iptalinin düşmesi ve 5 denemede
 *       kesilemeyen fatura uyarısı KİMSEYE ulaşmıyordu.
 *   (2) `FaturaServisi.yonetimeHaberVer` adres yokken SESSİZCE dönüyordu —
 *       günlüğe bile düşmüyordu. Düğmesi de var olmayan
 *       `/yonetim/faturalar/<id>` sayfasına gidiyordu (yönetim paneli `/admin`).
 *   (3) Canlıda muhasebe `sahte`: her tahsilatın `Fatura` satırını
 *       `TEST000001` numarasıyla KESILDI işaretliyor ve kimseye bir şey
 *       göndermiyordu. Faturalar NES'te ELLE kesiliyor (Emre 24.09) ama sistem
 *       yöneticiye "şu faturayı kes" demiyordu. Oysa müşteriye giden iki e-posta
 *       ("Faturanız ayrıca iletilecektir") ve yayındaki Mesafeli Satış metni
 *       ("Faturanız e-posta ile tarafınıza iletilir") fatura sözü veriyor.
 *
 * ── ÖLÇÜLEN ────────────────────────────────────────────────────────────
 *   A  SAF adres çözümü — ortam önce, boşsa yönetici hesapları, tekilleştirme,
 *      yer tutucu alan adı (ornek.com, example.*) adres SAYILMAZ
 *   B  DB — yalnız ETKİN + SİLİNMEMİŞ + DOĞRULANMIŞ yönetici; ortam varken
 *      DB'ye gidilmez
 *   C  yonetimeYaz (best-effort) — engel → içerikli HATA günlüğü, hiçbir
 *      koşulda fırlatmaz
 *   K  yonetimeYazKritik — engel ya da gönderim hatası → FIRLATIR
 *   D  FaturaServisi ELLE_MUDAHALE uyarısı — yönetici hesabına gider, sessiz
 *      değil, ölü bağlantı yok
 *   E  ⭐ ElleMuhasebeAdaptoru uçtan uca (kuyrugaAl → tekFatura): içerik,
 *      7 gün sınırı, test ödemesi, havale (kayıtlı numarada çelişkisiz
 *      "kontrol edin"), şahıs, satırın tutarları, hata → yeniden deneme,
 *      tekrar gönderim yok. KOD İNCELEMESİ (24.09): ⭐ iki eşzamanlı işlem TEK
 *      e-posta (kira), gönderimden SONRA düşen kayıt HATA'ya çekilmez, elle
 *      bütçesi ~7 gün (20 deneme), tur kilidi, müşteri alanında satır sonu
 *   F  BAĞLANTI — adaptör seçimi ("nes"/yazım hatası → elle), Nest
 *      enjeksiyonu, compose varsayılanı, modül kaydı, doğrudan ortam okuması
 *      kalmadı. Kabuk ortamından yalıtılmış (IYZICO_TABAN_URL vb. silinir)
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/altyapi/db/prisma.service';
import { EpostaServisi } from '../src/ozellik/odeme/eposta/eposta.servisi';
import {
  yonetimAdresleri,
  yonetimAdresleriniCoz,
  yonetimeYaz,
  yonetimeYazKritik,
} from '../src/ozellik/odeme/eposta/yonetim-bildirimi';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import {
  ElleMuhasebeAdaptoru,
  MUHASEBE_ADAPTORU,
  MUHASEBE_ADAPTORU_SAGLAYICISI,
  ParasutAdaptoru,
  SahteMuhasebeAdaptoru,
  iyzicoTestOrtamiMi,
  muhasebeAdaptoruSec,
} from '../src/ozellik/odeme/fatura/muhasebe.adaptor';

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

const KOK = join(__dirname, '..', '..');

/** Yorum satırlarını soyar — kapı kendi BELGESİNİ ölçmesin (14.09 dersi). */
function yorumsuz(kaynak: string): string {
  return kaynak
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*#.*$/gm, '');
}

/** `anahtar: [ ... ]` dizisinin GÖVDESİ (köşeli parantez sayarak); yoksa ''. */
function diziGovdesi(kaynak: string, anahtar: string): string {
  const bas = kaynak.search(new RegExp(`\\b${anahtar}\\s*:\\s*\\[`));
  if (bas < 0) return '';
  const ac = kaynak.indexOf('[', bas);
  let derinlik = 0;
  for (let i = ac; i < kaynak.length; i++) {
    if (kaynak[i] === '[') derinlik++;
    else if (kaynak[i] === ']' && --derinlik === 0) return kaynak.slice(ac + 1, i);
  }
  return '';
}

// ═════════════════════════════════════════════════════════════════════════
//  GÜNLÜK — yutulan hata GÖRÜNSÜN
// ═════════════════════════════════════════════════════════════════════════
const gunluk: Array<{ seviye: 'bilgi' | 'uyari' | 'hata'; metin: string }> = [];
const gunlukServisi = {
  log: (m: unknown) => void gunluk.push({ seviye: 'bilgi', metin: String(m) }),
  debug: () => undefined,
  verbose: () => undefined,
  warn: (m: unknown) => void gunluk.push({ seviye: 'uyari', metin: String(m) }),
  error: (m: unknown) => void gunluk.push({ seviye: 'hata', metin: String(m) }),
  fatal: (m: unknown) => void gunluk.push({ seviye: 'hata', metin: String(m) }),
};
Logger.overrideLogger(gunlukServisi);
const hatalarSonra = (i: number) => gunluk.slice(i).filter((g) => g.seviye === 'hata').map((g) => g.metin);

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — yalnız bu paketin dokunduğu yüzey; tanınmayan koşul PATLAR
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
  fatura: { abonelik: { model: 'abonelik', yerel: 'abonelikId' } },
};

const TEKILLER: Record<string, string[]> = {
  fatura: ['tahsilatKodu'],
  user: ['email'],
};

/** Prisma verilmeyen opsiyonel alanı `null` döndürür ve şema varsayılanını uygular. */
const VARSAYILAN: Record<string, () => Satir> = {
  fatura: () => ({
    denemeSayisi: 0, hata: null, saglayici: null, saglayiciId: null, faturaNo: null, faturaUrl: null,
    kesildi: null, sonDeneme: null, olusturuldu: new Date(),
  }),
  // Şema varsayılanı: yeni hesap DOĞRULANMAMIŞ başlar (Faz 3.4).
  user: () => ({ role: 'user', status: 'active', deletedAt: null, emailVerified: false, createdAt: new Date() }),
  firma: () => ({
    unvan: null, vergiNo: null, vergiDairesi: null, tcKimlikNo: null, faturaAdresi: null, il: null,
    ilce: null, faturaEposta: null, yetkiliEposta: null,
  }),
  havaleOdemesi: () => ({ teklifNo: null, faturaNo: null }),
};

function kosulUygula(deger: any, kosul: any): boolean {
  if (kosul === null) return deger === null || deger === undefined;
  if (kosul instanceof Date) return deger instanceof Date && deger.getTime() === kosul.getTime();
  if (typeof kosul !== 'object') return deger === kosul;
  const bos = deger === null || deger === undefined;
  return Object.entries(kosul).every(([op, v]: [string, any]) => {
    switch (op) {
      case 'in': return !bos && (v as any[]).some((x) => kosulUygula(deger, x));
      case 'not': return v === null ? !bos : !bos && !kosulUygula(deger, v);
      case 'lt': return !bos && deger < v;
      case 'lte': return !bos && deger <= v;
      case 'gt': return !bos && deger > v;
      case 'gte': return !bos && deger >= v;
      default: throw new Error(`bellek-Prisma: desteklenmeyen operatör "${op}"`);
    }
  });
}

function whereUygula(satir: Satir, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]: [string, any]) => {
    if (k === 'OR') return (v as any[]).some((w) => whereUygula(satir, w));
    if (k === 'AND') return (Array.isArray(v) ? v : [v]).every((w) => whereUygula(satir, w));
    if (k === 'NOT') return !(Array.isArray(v) ? v : [v]).some((w) => whereUygula(satir, w));
    return kosulUygula(satir[k], v);
  });
}

function sirala(satirlar: Satir[], orderBy: any): Satir[] {
  if (!orderBy) return satirlar;
  const kurallar = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
  return [...satirlar].sort((a, b) => {
    for (const [alan, yon] of kurallar) {
      const x = a[alan] instanceof Date ? a[alan].getTime() : a[alan];
      const y = b[alan] instanceof Date ? b[alan].getTime() : b[alan];
      if (x === y) continue;
      const kucuk = x < y ? -1 : 1;
      return yon === 'desc' ? -kucuk : kucuk;
    }
    return 0;
  });
}

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);
  /** "model.islem" — hangi sorgunun koştuğunu ölçmek için. */
  const cagrilar: string[] = [];
  /** Bu modele yapılan her okuma/yazma PATLAR (DB kopması taklidi). */
  const bozuk = new Set<string>();
  /** Koşulu tutan yazım `kalan` kez PATLAR (ör. gönderimden SONRAKİ kayıt). */
  const yazmaHatalari: Array<{ model: string; islem: string; kosul: (arg: any) => boolean; kalan: number }> = [];
  const yazmaDenetle = (model: string, islem: string, arg: any) => {
    const h = yazmaHatalari.find((x) => x.model === model && x.islem === islem && x.kalan > 0 && x.kosul(arg));
    if (h) {
      h.kalan--;
      throw new Error(`DB yazma hatası (taklit: ${model}.${islem})`);
    }
  };

  function yansit(model: string, satir: Satir, spec: any): Satir {
    const iliski = (ad: string, alt: any) => {
      const il = ILISKILER[model]?.[ad];
      if (!il) throw new Error(`bellek-Prisma: bilinmeyen ilişki ${model}.${ad}`);
      const hedef = tablo(il.model).find((r) => r.id === satir[il.yerel]);
      return hedef ? yansit(il.model, hedef, alt === true ? {} : alt) : null;
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

  function tekilDenetle(model: string, satir: Satir): void {
    for (const alan of TEKILLER[model] ?? []) {
      const deger = satir[alan];
      if (deger === null || deger === undefined) continue;
      if (tablo(model).some((r) => r !== satir && r[alan] === deger)) {
        throw Object.assign(new Error(`Unique constraint failed on ${model}.${alan}`), { code: 'P2002' });
      }
    }
  }

  /** `undefined` = dokunma; Decimal ve Date DEĞER olarak yazılır. */
  function veriUygula(hedef: Satir, data: Satir): void {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const islem = v !== null && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Prisma.Decimal);
      if (islem && 'increment' in v) hedef[k] = (hedef[k] ?? 0) + (v as any).increment;
      else hedef[k] = v;
    }
  }

  function ekle(model: string, data: Satir): Satir {
    const satir: Satir = { id: randomUUID(), ...(VARSAYILAN[model]?.() ?? {}) };
    veriUygula(satir, data);
    tekilDenetle(model, satir);
    tablo(model).push(satir);
    return satir;
  }

  const modelYuzu = (model: string) => {
    const kapi = (islem: string) => {
      cagrilar.push(`${model}.${islem}`);
      if (bozuk.has(model)) throw new Error(`DB bağlantısı koptu (${model}.${islem})`);
    };
    return {
      findUnique: async (arg: any) => {
        kapi('findUnique');
        const s = tablo(model).find((r) => whereUygula(r, arg.where));
        return s ? yansit(model, s, arg) : null;
      },
      findUniqueOrThrow: async (arg: any) => {
        kapi('findUniqueOrThrow');
        const s = tablo(model).find((r) => whereUygula(r, arg.where));
        if (!s) throw Object.assign(new Error(`${model} bulunamadı`), { code: 'P2025' });
        return yansit(model, s, arg);
      },
      findFirst: async (arg: any = {}) => {
        kapi('findFirst');
        const s = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy)[0];
        return s ? yansit(model, s, arg) : null;
      },
      findMany: async (arg: any = {}) => {
        kapi('findMany');
        let liste = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy);
        if (arg.take !== undefined) liste = liste.slice(0, arg.take);
        return liste.map((s) => yansit(model, s, arg));
      },
      create: async (arg: any) => {
        kapi('create');
        return yansit(model, ekle(model, arg.data), arg);
      },
      update: async (arg: any) => {
        kapi('update');
        yazmaDenetle(model, 'update', arg);
        const s = tablo(model).find((r) => whereUygula(r, arg.where));
        if (!s) throw Object.assign(new Error(`${model} güncellenecek satır yok`), { code: 'P2025' });
        veriUygula(s, arg.data);
        tekilDenetle(model, s);
        return yansit(model, s, arg);
      },
      // Koşullu yazma: koşul ile yazım AYNI adımda (SQL'deki tek UPDATE gibi)
      // — kiranın "tek kazanan" iddiası buna dayanır.
      updateMany: async (arg: any) => {
        kapi('updateMany');
        yazmaDenetle(model, 'updateMany', arg);
        const hedefler = tablo(model).filter((r) => whereUygula(r, arg.where));
        hedefler.forEach((s) => veriUygula(s, arg.data));
        return { count: hedefler.length };
      },
    };
  };

  const prisma: any = new Proxy(
    {},
    { get: (_h, ad: string) => (ad === 'then' ? undefined : modelYuzu(ad)) },
  );
  return { prisma, tablo, ekle, cagrilar, bozuk, yazmaHatalari };
}

// ═════════════════════════════════════════════════════════════════════════
//  SAHTE E-POSTA — gerçek sözleşme: `gonder` SMTP yoksa sessiz döner,
//  `gonderKritik` FIRLATIR; ikisi de gönderim hatasında FIRLATIR
// ═════════════════════════════════════════════════════════════════════════
interface GidenPosta {
  kip: 'gonder' | 'kritik';
  kime: string;
  konu: string;
  baslik: string;
  paragraflar: string[];
  dugme?: { etiket: string; url: string };
}

function sahteEposta(o: { smtp?: boolean; hata?: string | null; bekletici?: Promise<void> } = {}) {
  const giden: GidenPosta[] = [];
  const kaydet = (kip: GidenPosta['kip'], m: any) =>
    giden.push({ kip, kime: m.kime, konu: m.konu, baslik: m.baslik, paragraflar: [...(m.paragraflar ?? [])], dugme: m.dugme });
  const servis = {
    yapilandirildiMi: () => o.smtp !== false,
    gonder: async (m: any) => {
      if (o.smtp === false) return;
      if (o.hata) throw new Error(o.hata);
      kaydet('gonder', m);
    },
    gonderKritik: async (m: any) => {
      // Asılı SMTP taklidi: gönderim, test `bekletici`yi çözene kadar sürer.
      if (o.bekletici) await o.bekletici;
      if (o.smtp === false) throw new Error('E-posta gonderilemiyor: SMTP_HOST tanimli degil.');
      if (o.hata) throw new Error(o.hata);
      kaydet('kritik', m);
    },
  };
  return { servis: servis as any, giden };
}

/** YONETIM_EPOSTA'yı verilen değerle (undefined = tanımsız) koşturur, sonra geri yükler. */
async function ortamla<T>(deger: string | undefined, fn: () => Promise<T>): Promise<T> {
  const eski = process.env.YONETIM_EPOSTA;
  if (deger === undefined) delete process.env.YONETIM_EPOSTA;
  else process.env.YONETIM_EPOSTA = deger;
  try {
    return await fn();
  } finally {
    if (eski === undefined) delete process.env.YONETIM_EPOSTA;
    else process.env.YONETIM_EPOSTA = eski;
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  FİKSTÜR
// ═════════════════════════════════════════════════════════════════════════
const KURUCU = 'kurucu@ornek.test';
const ORTAK = 'ortak@ornek.test';
const CANLI_IYZICO = 'https://api.iyzipay.com';
const TEST_IYZICO = 'https://sandbox-api.iyzipay.com';
// Geçmişte, öğlen: kuyruğa alma anı (`olusturuldu` = şimdi) HER ZAMAN bundan
// sonradır → ödeme tarihi deterministik; öğlen saati TZ kaymasını önler.
const DONEM_BASI = new Date('2026-09-20T12:00:00Z');
const DONEM_SONU = new Date('2026-10-20T12:00:00Z');

/** Tüzel kişi (VKN + vergi dairesi). */
const TUZEL = {
  id: 'F1', ad: 'Yılmaz', unvan: 'Yılmaz Mühendislik Ltd. Şti.', vergiNo: '1234567890', vergiDairesi: 'Kadıköy',
  faturaAdresi: 'Moda Cad. No:1', il: 'İstanbul', ilce: 'Kadıköy',
  faturaEposta: 'muhasebe@yilmaz.test', yetkiliEposta: 'yetkili@yilmaz.test',
};
/** Şahıs (TCKN, unvan yok → ad; fatura e-postası yok → yetkili). */
const SAHIS = {
  id: 'F2', ad: 'Ayşe Demir', unvan: null, tcKimlikNo: '12345678901',
  faturaAdresi: 'Atatürk Blv. 5', il: 'Ankara', ilce: 'Çankaya', faturaEposta: null, yetkiliEposta: 'ayse@demir.test',
};

function faturaDunyasi(
  o: {
    yonetici?: boolean;
    smtp?: boolean;
    postaHatasi?: string | null;
    iyzicoTaban?: string | null;
    firma?: Satir;
    adaptor?: any;
    bekletici?: Promise<void>;
  } = {},
) {
  const db = bellekPrisma();
  const firma = o.firma ?? TUZEL;
  db.ekle('paket', { id: 'P1', ad: 'Pro — Mekanik' });
  db.ekle('paketSurumu', { id: 'S1', paketId: 'P1' });
  db.ekle('firma', firma);
  db.ekle('abonelik', { id: 'AB1', firmaId: firma.id, paketSurumuId: 'S1' });
  if (o.yonetici !== false) {
    db.ekle('user', {
      email: KURUCU, role: 'admin', status: 'active', emailVerified: true, createdAt: new Date('2026-01-01T12:00:00Z'),
    });
  }
  const posta = sahteEposta({ smtp: o.smtp, hata: o.postaHatasi, bekletici: o.bekletici });
  const config = new ConfigService(o.iyzicoTaban === null ? {} : { IYZICO_TABAN_URL: o.iyzicoTaban ?? CANLI_IYZICO });
  const elle = new ElleMuhasebeAdaptoru(config, db.prisma, posta.servis);
  const fatura = new FaturaServisi(db.prisma, o.adaptor ?? elle, posta.servis);

  async function kuyruk(tahsilatKodu = 'ord-777', tutar = 1200, donemBasi = DONEM_BASI): Promise<Satir> {
    await fatura.kuyrugaAl({
      abonelikId: 'AB1', tahsilatKodu, tutar, paraBirimi: 'TRY', donemBasi, donemSonu: DONEM_SONU,
    });
    return db.tablo('fatura').find((f) => f.tahsilatKodu === tahsilatKodu)!;
  }
  async function kes(tahsilatKodu = 'ord-777', tutar = 1200, donemBasi = DONEM_BASI): Promise<Satir> {
    const satir = await kuyruk(tahsilatKodu, tutar, donemBasi);
    await (fatura as any).tekFatura(satir.id);
    return satir;
  }
  return { db, posta, fatura, elle, kuyruk, kes };
}

const iceren = (p: GidenPosta | undefined, re: RegExp) => !!p && p.paragraflar.some((x) => re.test(x));
const satiri = (p: GidenPosta | undefined, re: RegExp) => p?.paragraflar.find((x) => re.test(x)) ?? '';

// ═════════════════════════════════════════════════════════════════════════
//  A — SAF ADRES ÇÖZÜMÜ
// ═════════════════════════════════════════════════════════════════════════
function aBlogu(): void {
  console.log('\n── A · SAF adres çözümü ──');
  const a1 = yonetimAdresleriniCoz('ops@ornek.test', [KURUCU]);
  check('A1 ortam doluysa YALNIZ ortam (yönetici hesapları yok sayılır)',
    a1.kaynak === 'ortam' && a1.adresler.join('|') === 'ops@ornek.test', JSON.stringify(a1));
  const a2 = yonetimAdresleriniCoz(' a@x.test, b@y.test;c@z.test\nA@X.test ', []);
  check('A2 virgül/noktalı virgül/boşlukla liste; büyük-küçük harf farkı TEK adres',
    a2.adresler.join('|') === 'a@x.test|b@y.test|c@z.test', JSON.stringify(a2));
  for (const bos of [undefined, '', '   ']) {
    const r = yonetimAdresleriniCoz(bos, [KURUCU]);
    check(`A3 ortam ${JSON.stringify(bos)} → yönetici hesapları`,
      r.kaynak === 'yonetici-hesaplari' && r.adresler.join('|') === KURUCU, JSON.stringify(r));
  }
  const a4 = yonetimAdresleriniCoz(undefined, []);
  check('A4 ortam da hesap da yoksa: boş liste, kaynak "yok"', a4.kaynak === 'yok' && a4.adresler.length === 0,
    JSON.stringify(a4));
  const a5 = yonetimAdresleriniCoz('yonetim', [KURUCU]);
  check('A5 "@" içermeyen ortam değeri adres SAYILMAZ → uyarı kara deliğe düşmez, hesaba gider',
    a5.kaynak === 'yonetici-hesaplari' && a5.adresler.join('|') === KURUCU, JSON.stringify(a5));
  const a6 = yonetimAdresleriniCoz(undefined, [KURUCU, null, 'Kurucu@Ornek.test', ORTAK, '']);
  check('A6 hesap listesi: boş/null atlanır, harf farkıyla ikiz tekilleşir, sıra korunur',
    a6.adresler.join('|') === `${KURUCU}|${ORTAK}`, JSON.stringify(a6));
  // 24.09 olayı: canlıya `YONETIM_EPOSTA=ADRES@ORNEK.COM` yazıldı. NES talebi
  // alıcının TCKN/VKN/adresini taşıdığı için yer tutucu alan adı SIZINTIDIR.
  const yerTutucu = ['ADRES@ORNEK.COM', 'a@ornek.com.tr', 'x@example.com', 'y@mail.example.org', 'z@site.invalid',
    'w@host.localhost', 'v@firma.example'];
  const a7 = yerTutucu.map((a) => yonetimAdresleriniCoz(a, [KURUCU]));
  check('A7 ⭐ yer tutucu alan adı (ornek.com, example.*, .invalid/.localhost/.example) ADRES SAYILMAZ → hesaba düşer',
    a7.every((r) => r.kaynak === 'yonetici-hesaplari' && r.adresler.join('|') === KURUCU),
    yerTutucu.map((a, i) => `${a}→${a7[i].kaynak}`).join(' '));
  const a7b = yonetimAdresleriniCoz('fatura@metapricex.com, ops@ornek.test, bilgi@ornekfirma.com', []);
  check('A7b gerçek alan adları (ve test fikstürü .test) adres SAYILIR — süzgeç fazla geniş değil',
    a7b.kaynak === 'ortam' && a7b.adresler.join('|') === 'fatura@metapricex.com|ops@ornek.test|bilgi@ornekfirma.com',
    JSON.stringify(a7b));
}

// ═════════════════════════════════════════════════════════════════════════
//  B — DB: hangi yöneticiler
// ═════════════════════════════════════════════════════════════════════════
async function bBlogu(): Promise<void> {
  console.log('\n── B · DB: yalnız etkin + silinmemiş yönetici ──');
  const db = bellekPrisma();
  db.ekle('user', { email: KURUCU, role: 'admin', status: 'active', emailVerified: true, createdAt: new Date('2026-01-01T12:00:00Z') });
  db.ekle('user', { email: 'engelli@ornek.test', role: 'admin', status: 'banned', emailVerified: true, createdAt: new Date('2026-01-02T12:00:00Z') });
  db.ekle('user', {
    email: 'silinen@ornek.test', role: 'admin', status: 'active', emailVerified: true, deletedAt: new Date('2026-05-01T12:00:00Z'),
    createdAt: new Date('2026-01-03T12:00:00Z'),
  });
  db.ekle('user', { email: 'musteri@ornek.test', role: 'user', status: 'active', emailVerified: true, createdAt: new Date('2026-01-04T12:00:00Z') });
  db.ekle('user', { email: ORTAK, role: 'admin', status: 'active', emailVerified: true, createdAt: new Date('2026-02-01T12:00:00Z') });
  db.ekle('user', { email: 'Kurucu@Ornek.test', role: 'admin', status: 'active', emailVerified: true, createdAt: new Date('2026-03-01T12:00:00Z') });
  // Doğrulanmamış yönetici: adresinin çalıştığı kanıtlanmadı → alıcı DEĞİL.
  db.ekle('user', { email: 'dogrulanmamis@ornek.test', role: 'admin', status: 'active', emailVerified: false, createdAt: new Date('2026-01-05T12:00:00Z') });

  const b1 = await ortamla(undefined, () => yonetimAdresleri(db.prisma));
  check('B1 ⭐ ortam boş → ETKİN yöneticiler (engellenen, silinen, e-postası DOĞRULANMAMIŞ ve sıradan kullanıcı YOK), kayıt sırasıyla',
    b1.kaynak === 'yonetici-hesaplari' && b1.adresler.join('|') === `${KURUCU}|${ORTAK}`, JSON.stringify(b1));

  const c0 = db.cagrilar.length;
  const b2 = await ortamla('ops@ornek.test', () => yonetimAdresleri(db.prisma));
  check('B2 ortam dolu → ortam; kullanıcı tablosuna HİÇ gidilmez',
    b2.kaynak === 'ortam' && b2.adresler.join('|') === 'ops@ornek.test' && db.cagrilar.length === c0,
    `${JSON.stringify(b2)} sorgu=${db.cagrilar.slice(c0).join(',')}`);

  const b3 = await ortamla('   ', () => yonetimAdresleri(db.prisma));
  check('B3 ortam yalnız boşluk → DB (compose boş değişkeni "tanımlı ama boş" verir)',
    b3.kaynak === 'yonetici-hesaplari' && b3.adresler.length === 2, JSON.stringify(b3));
}

// ═════════════════════════════════════════════════════════════════════════
//  C — yonetimeYaz (best-effort)   ·   K — yonetimeYazKritik
// ═════════════════════════════════════════════════════════════════════════
const BILDIRIM = { konu: '[MetaPriceX] Deneme uyarısı — Firma X', baslik: 'Deneme', paragraflar: ['Firma: Firma X', 'Kod: sub-X'] };

function yoneticiDb(adet: 0 | 1 | 2) {
  const db = bellekPrisma();
  if (adet >= 1) db.ekle('user', { email: KURUCU, role: 'admin', status: 'active', emailVerified: true, createdAt: new Date('2026-01-01T12:00:00Z') });
  if (adet >= 2) db.ekle('user', { email: ORTAK, role: 'admin', status: 'active', emailVerified: true, createdAt: new Date('2026-02-01T12:00:00Z') });
  return db;
}

async function cBlogu(): Promise<void> {
  console.log('\n── C · yonetimeYaz (best-effort) ──');
  const logger = new Logger('YonetimTesti');
  {
    const db = yoneticiDb(2);
    const posta = sahteEposta();
    const sonuc = await ortamla(undefined, () => yonetimeYaz({ prisma: db.prisma, eposta: posta.servis, logger }, BILDIRIM));
    const p = posta.giden[0];
    check('C1 ⭐ iki etkin yönetici → TEK e-posta ikisine; konu/başlık/paragraflar aynen; true döner',
      sonuc === true && posta.giden.length === 1 && p.kip === 'gonder' && p.kime === `${KURUCU}, ${ORTAK}` &&
        p.konu === BILDIRIM.konu && p.baslik === BILDIRIM.baslik && p.paragraflar.join('|') === BILDIRIM.paragraflar.join('|'),
      `${sonuc} ${JSON.stringify(posta.giden)}`);
  }
  {
    const db = yoneticiDb(0);
    const posta = sahteEposta();
    const g0 = gunluk.length;
    const sonuc = await ortamla(undefined, () => yonetimeYaz({ prisma: db.prisma, eposta: posta.servis, logger }, BILDIRIM));
    const iz = hatalarSonra(g0).find((m) => /YONETICI BILDIRIMI GONDERILEMEDI/.test(m)) ?? '';
    check('C2 ⭐ adres yok → false, e-posta YOK, içerik HATA günlüğünde (sessiz kayıp yok)',
      sonuc === false && posta.giden.length === 0 && /YONETIM_EPOSTA tanimli degil/.test(iz) &&
        /Deneme uyarısı/.test(iz) && /sub-X/.test(iz),
      `${sonuc} iz=${iz}`);
  }
  {
    const db = yoneticiDb(1);
    const posta = sahteEposta({ smtp: false });
    const g0 = gunluk.length;
    const sonuc = await ortamla(undefined, () => yonetimeYaz({ prisma: db.prisma, eposta: posta.servis, logger }, BILDIRIM));
    const iz = hatalarSonra(g0).find((m) => /YONETICI BILDIRIMI GONDERILEMEDI/.test(m)) ?? '';
    check('C3 SMTP kurulu değil → false, içerik HATA günlüğünde ("SMTP")',
      sonuc === false && posta.giden.length === 0 && /SMTP yapilandirilmamis/.test(iz) && /sub-X/.test(iz),
      `${sonuc} iz=${iz}`);
  }
  {
    const db = yoneticiDb(1);
    const posta = sahteEposta({ hata: 'SMTP 421 geçici hata' });
    const g0 = gunluk.length;
    let firladi = false;
    let sonuc: boolean | null = null;
    try {
      sonuc = await ortamla(undefined, () => yonetimeYaz({ prisma: db.prisma, eposta: posta.servis, logger }, BILDIRIM));
    } catch {
      firladi = true;
    }
    check('C4 gönderim hatası → false, FIRLATMAZ, günlükte konu + SMTP yanıtı + PARAGRAFLAR (posta yolu kapalıyken tek kayıt)',
      !firladi && sonuc === false &&
        hatalarSonra(g0).some((m) => /SMTP 421/.test(m) && /Deneme uyarısı/.test(m) && /sub-X/.test(m)),
      `firladi=${firladi} sonuc=${sonuc} iz=${hatalarSonra(g0).join(' · ')}`);
  }
  {
    // Sözleşme: yardımcı HİÇBİR koşulda fırlatmaz — biçimi bozuk bir e-posta
    // nesnesi (ör. eski testlerin `{ gonder }` taklidi) uyarıyı düşürse de
    // çağıranın asıl işini (onay, kuyruk) düşürmemeli.
    const db = yoneticiDb(1);
    const g0 = gunluk.length;
    let firladi = false;
    let sonuc: boolean | null = null;
    try {
      sonuc = await ortamla(undefined, () =>
        yonetimeYaz({ prisma: db.prisma, eposta: { gonder: async () => undefined } as any, logger }, BILDIRIM),
      );
    } catch {
      firladi = true;
    }
    check('C7 biçimi bozuk e-posta nesnesi (yapilandirildiMi yok) → false, FIRLATMAZ, içerik günlükte',
      !firladi && sonuc === false && hatalarSonra(g0).some((m) => /GONDERILEMEDI/.test(m) && /sub-X/.test(m)),
      `firladi=${firladi} sonuc=${sonuc} iz=${hatalarSonra(g0).join(' · ')}`);
  }
  {
    const db = yoneticiDb(1);
    const g0 = gunluk.length;
    const sonuc = await ortamla(undefined, () => yonetimeYaz({ prisma: db.prisma, eposta: undefined, logger }, BILDIRIM));
    check('C5 e-posta servisi enjekte edilmemiş → false, günlükte "e-posta servisi yok"',
      sonuc === false && hatalarSonra(g0).some((m) => /e-posta servisi yok/.test(m) && /sub-X/.test(m)),
      hatalarSonra(g0).join(' · '));
  }
  {
    const db = yoneticiDb(1);
    db.bozuk.add('user');
    const posta = sahteEposta();
    const g0 = gunluk.length;
    let firladi = false;
    let sonuc: boolean | null = null;
    try {
      sonuc = await ortamla(undefined, () => yonetimeYaz({ prisma: db.prisma, eposta: posta.servis, logger }, BILDIRIM));
    } catch {
      firladi = true;
    }
    const iz = hatalarSonra(g0).find((m) => /YONETICI BILDIRIMI GONDERILEMEDI/.test(m)) ?? '';
    check('C6 yönetici hesapları okunamazsa → false, FIRLATMAZ, günlükte neden + içerik',
      !firladi && sonuc === false && posta.giden.length === 0 && /okunamadi/.test(iz) && /DB bağlantısı koptu/.test(iz) &&
        /YONETIM_EPOSTA tanimli degil/.test(iz) && /sub-X/.test(iz),
      `firladi=${firladi} sonuc=${sonuc} iz=${iz}`);
  }

  console.log('\n── K · yonetimeYazKritik ──');
  const kritik = async (db: ReturnType<typeof bellekPrisma>, posta: ReturnType<typeof sahteEposta>) => {
    try {
      await ortamla(undefined, () => yonetimeYazKritik({ prisma: db.prisma, eposta: posta.servis, logger }, BILDIRIM));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  {
    const db = yoneticiDb(1);
    const posta = sahteEposta();
    const hata = await kritik(db, posta);
    check('K1 başarı → TEK kritik gönderim, yöneticiye', hata === null && posta.giden.length === 1 &&
      posta.giden[0].kip === 'kritik' && posta.giden[0].kime === KURUCU, `${hata} ${JSON.stringify(posta.giden)}`);
  }
  {
    const db = yoneticiDb(0);
    const posta = sahteEposta();
    const hata = await kritik(db, posta);
    check('K2 ⭐ adres yok → FIRLATIR (fatura kuyruğu yeniden denesin), nedeni söyler',
      hata !== null && /YONETIM_EPOSTA/.test(hata) && posta.giden.length === 0, String(hata));
  }
  {
    const db = yoneticiDb(1);
    const posta = sahteEposta({ smtp: false });
    const hata = await kritik(db, posta);
    check('K3 SMTP yok → FIRLATIR', hata !== null && /SMTP/.test(hata), String(hata));
  }
  {
    const db = yoneticiDb(1);
    const posta = sahteEposta({ hata: 'SMTP 550 reddedildi' });
    const hata = await kritik(db, posta);
    check('K4 gönderim hatası → FIRLATIR (yutulmaz)', hata !== null && /SMTP 550/.test(hata), String(hata));
  }
  {
    const db = yoneticiDb(1);
    db.bozuk.add('user');
    const posta = sahteEposta();
    const hata = await kritik(db, posta);
    check('K5 hesaplar okunamazsa → FIRLATIR', hata !== null && /DB bağlantısı koptu/.test(hata), String(hata));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  D — FaturaServisi ELLE_MUDAHALE uyarısı
// ═════════════════════════════════════════════════════════════════════════
const BOZUK_SAGLAYICI = {
  ad: 'parasut',
  faturaKes: async () => {
    throw new Error('Paraşüt 500: iç hata');
  },
};

/** Kuyruğa al, 4 deneme harcanmış say, 5.yi koştur → ELLE_MUDAHALE. */
async function tukenenFatura(d: ReturnType<typeof faturaDunyasi>, oncekiDeneme = 4): Promise<Satir> {
  const satir = await d.kuyruk();
  satir.denemeSayisi = oncekiDeneme;
  await (d.fatura as any).tekFatura(satir.id);
  return satir;
}

async function dBlogu(): Promise<void> {
  console.log('\n── D · FaturaServisi ELLE_MUDAHALE uyarısı ──');
  {
    const d = faturaDunyasi({ adaptor: BOZUK_SAGLAYICI });
    const satir = await ortamla(undefined, () => tukenenFatura(d));
    const p = d.posta.giden[0];
    check('D1 ⭐ ortam boş + etkin yönetici → uyarı YÖNETİCİ HESABINA gider (eskiden sessizce kayboluyordu)',
      satir.durum === 'ELLE_MUDAHALE' && d.posta.giden.length === 1 && p.kime === KURUCU &&
        /Fatura kesilemedi/.test(p.konu) && /Yılmaz Mühendislik Ltd\. Şti\./.test(p.konu),
      `durum=${satir.durum} ${JSON.stringify(d.posta.giden)}`);
    check('D1b uyarıda fatura kaydı, son hata, tahsilat kodu ve toplam var',
      iceren(p, new RegExp(satir.id)) && iceren(p, /Paraşüt 500: iç hata/) && iceren(p, /ord-777/) &&
        iceren(p, /₺1\.200,00/),
      JSON.stringify(p?.paragraflar));
    check('D2 ölü bağlantı YOK (`/yonetim/faturalar/...` sayfası yok)',
      !!p && !JSON.stringify(p).includes('/yonetim/faturalar'), JSON.stringify(p?.dugme));
  }
  {
    const d = faturaDunyasi({ adaptor: BOZUK_SAGLAYICI, yonetici: false });
    const g0 = gunluk.length;
    const satir = await ortamla(undefined, () => tukenenFatura(d));
    const iz = hatalarSonra(g0).find((m) => /YONETICI BILDIRIMI GONDERILEMEDI/.test(m)) ?? '';
    check('D3 ⭐ adres yok → e-posta yok ama içerik HATA günlüğünde (eskiden HİÇBİR iz yoktu)',
      satir.durum === 'ELLE_MUDAHALE' && d.posta.giden.length === 0 && /Fatura kesilemedi/.test(iz) &&
        iz.includes(satir.id) && /Paraşüt 500/.test(iz),
      `durum=${satir.durum} iz=${iz}`);
  }
  {
    const d = faturaDunyasi({ adaptor: BOZUK_SAGLAYICI });
    await ortamla('ops@ornek.test', () => tukenenFatura(d));
    check('D4 ortam dolu → ortamdaki adrese (yönetici hesabına DEĞİL)',
      d.posta.giden.length === 1 && d.posta.giden[0].kime === 'ops@ornek.test', JSON.stringify(d.posta.giden));
  }
  {
    const d = faturaDunyasi({ adaptor: BOZUK_SAGLAYICI });
    const satir = await ortamla(undefined, () => tukenenFatura(d, 0));
    check('D5 ilk başarısızlık → HATA, yeniden denenecek, uyarı YOK (merdiven değişmedi)',
      satir.durum === 'HATA' && satir.denemeSayisi === 1 && d.posta.giden.length === 0,
      `durum=${satir.durum} deneme=${satir.denemeSayisi} posta=${d.posta.giden.length}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  E — ⭐ ELLE (NES) KESİM TALEBİ uçtan uca
// ═════════════════════════════════════════════════════════════════════════
async function eBlogu(): Promise<void> {
  console.log('\n── E · ElleMuhasebeAdaptoru: NES kesim talebi uçtan uca ──');
  {
    const d = faturaDunyasi();
    const g0 = gunluk.length;
    const satir = await ortamla(undefined, () => d.kes());
    const p = d.posta.giden[0];
    check('E1 ⭐ kart tahsilatı (canlı iyzico) → yöneticiye TEK kritik e-posta',
      d.posta.giden.length === 1 && p.kip === 'kritik' && p.kime === KURUCU, JSON.stringify(d.posta.giden));
    check('E1b konu: "Fatura kesilecek — <unvan> — <toplam> — <tahsilat kodu>" (aylık yenilemeler AYIRT edilir)',
      p?.konu === '[MetaPriceX] Fatura kesilecek — Yılmaz Mühendislik Ltd. Şti. — ₺1.200,00 — ord-777', p?.konu);
    check('E2 ödeme türü + sipariş kodu', satiri(p, /^Ödeme:/) === 'Ödeme: Kart (iyzico) — sipariş ord-777',
      satiri(p, /^Ödeme:/));
    check('E2b alıcı: unvan, VKN + vergi dairesi, adres/ilçe/il, faturanın gideceği e-posta',
      satiri(p, /^Alıcı:/) === 'Alıcı: Yılmaz Mühendislik Ltd. Şti.' &&
        satiri(p, /^VKN:/) === 'VKN: 1234567890 · Vergi dairesi: Kadıköy' &&
        satiri(p, /^Adres:/) === 'Adres: Moda Cad. No:1, Kadıköy / İstanbul' &&
        satiri(p, /e-posta:/) === 'Faturanın gönderileceği e-posta: muhasebe@yilmaz.test' &&
        !iceren(p, /T\.C\. kimlik/),
      JSON.stringify(p?.paragraflar));
    check('E2c kalem: paket adı, dönem, birim fiyat (KDV hariç), KDV oranı',
      /Pro — Mekanik — Yazılım Kullanım Bedeli/.test(satiri(p, /^Kalem:/)) &&
        /Dönem: 20\.09\.2026/.test(satiri(p, /^Kalem:/)) && /₺1\.000,00 \(KDV hariç\)/.test(satiri(p, /^Kalem:/)) &&
        /KDV %20/.test(satiri(p, /^Kalem:/)),
      satiri(p, /^Kalem:/));
    check('E2d tutarlar: matrah + KDV + tahsil edilen toplam',
      satiri(p, /^Matrah:/) === 'Matrah: ₺1.000,00 · KDV: ₺200,00 · Toplam (tahsil edilen, KDV dahil): ₺1.200,00',
      satiri(p, /^Matrah:/));
    check('E3 ⭐ VUK 231/5: ödeme tarihi ve SON DÜZENLEME GÜNÜ (ödeme + 7 gün)',
      satiri(p, /^Ödeme tarihi:/) === 'Ödeme tarihi: 20 Eylül 2026' &&
        /^Son düzenleme günü: 27 Eylül 2026/.test(satiri(p, /^Son düzenleme günü:/)),
      `${satiri(p, /^Ödeme tarihi:/)} | ${satiri(p, /^Son düzenleme/)}`);
    check('E3b NES talimatı (alıcı e-postası, e-Fatura mükellefine elle kopya) + "BİR kez kesilir" + "müşteriye iletmeyin"',
      iceren(p, /NES'te e-Arşiv faturayı/) && iceren(p, /e-Fatura mükellefi/) &&
        iceren(p, /Aynı tahsilat kodu \(ord-777\) ikinci kez gelirse fatura BİR kez kesilir/) &&
        iceren(p, /müşteriye iletmeyin/) && !/TEST/.test(p?.konu ?? ''),
      JSON.stringify(p?.paragraflar));
    check('E4 satır: KESILDI + sağlayıcı "elle" + sağlayıcıId "elle:<kod>", fatura numarası YOK (TEST no üretilmez)',
      satir.durum === 'KESILDI' && satir.saglayici === 'elle' && satir.saglayiciId === 'elle:ord-777' &&
        satir.faturaNo === null && satir.hata === null,
      JSON.stringify({ durum: satir.durum, s: satir.saglayici, id: satir.saglayiciId, no: satir.faturaNo }));
    check('E4b bu yolda yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));

    const e0 = d.posta.giden.length;
    await ortamla(undefined, () => (d.fatura as any).tekFatura(satir.id));
    check('E5 aynı satır yeniden işlenirse İKİNCİ talep YOK (KESILDI koruması)', d.posta.giden.length === e0,
      `önce=${e0} sonra=${d.posta.giden.length}`);
    // `p` yoksa (mutant) blok FIRLAMASIN — sonraki assert'ler de koşsun.
    const kopyasi = p ? new EpostaServisi(new ConfigService({})).icerikUret({ ...p, paragraflar: p.paragraflar }) : null;
    check('E5b paragraflarda HTML yok (şablon kaçışlar); düz metin gövdede kalem ve toplam görünüyor',
      !!p && !!kopyasi && !p.paragraflar.some((x) => /<\/?[a-z][^>]*>/i.test(x)) &&
        kopyasi.metin.includes('Yazılım Kullanım Bedeli') && kopyasi.metin.includes('₺1.200,00'),
      kopyasi?.metin.slice(0, 200) ?? '(e-posta yok)');
  }
  for (const [ad, taban] of [['sandbox', TEST_IYZICO], ['tanımsız (istemcinin varsayılanı sandbox)', null]] as const) {
    const d = faturaDunyasi({ iyzicoTaban: taban });
    const satir = await ortamla(undefined, () => d.kes());
    const p = d.posta.giden[0];
    check(`E6 ⭐ iyzico ${ad} → TEST ÖDEMESİ: konu + ilk satır "fatura KESMEYİN", son gün YOK`,
      d.posta.giden.length === 1 && /^\[MetaPriceX\] TEST ödemesi — fatura KESMEYİN/.test(p.konu) &&
        /TEST ÖDEMESİ/.test(p.paragraflar[0]) && /KESMEYİN/.test(p.paragraflar[0]) && !iceren(p, /^Son düzenleme günü/) &&
        satir.durum === 'KESILDI',
      `${p?.konu} | ${p?.paragraflar[0]}`);
  }
  {
    const d = faturaDunyasi({ iyzicoTaban: TEST_IYZICO });
    d.db.ekle('havaleOdemesi', { id: 'H1', teklifNo: 'HVL-2026-0007', faturaNo: null });
    await ortamla(undefined, () => d.kes('havale:H1', 16490));
    const p = d.posta.giden[0];
    check('E7 ⭐ havale → iyzico sandbox olsa da GERÇEK para: test uyarısı YOK, teklif no (konuda da), son gün VAR',
      d.posta.giden.length === 1 && !/TEST/.test(p.konu) && !iceren(p, /TEST ÖDEMESİ/) && /— HVL-2026-0007$/.test(p.konu) &&
        satiri(p, /^Ödeme:/) === 'Ödeme: Havale/EFT — teklif HVL-2026-0007' && iceren(p, /^Son düzenleme günü/) &&
        !iceren(p, /İKİNCİ KEZ/),
      `${p?.konu} | ${JSON.stringify(p?.paragraflar)}`);
  }
  {
    const d = faturaDunyasi();
    d.db.ekle('havaleOdemesi', { id: 'H2', teklifNo: 'HVL-2026-0008', faturaNo: 'FTR-2026-000019' });
    await ortamla(undefined, () => d.kes('havale:H2', 16490));
    const p = d.posta.giden[0];
    check('E8 ⭐ havaleye önceden fatura/proforma no girilmişse: "İKİNCİ KEZ KESMEYİN" + numara (çift fatura riski)',
      iceren(p, /FTR-2026-000019/) && iceren(p, /İKİNCİ KEZ KESMEYİN/), JSON.stringify(p?.paragraflar));
    // İnceleme M3: "Fatura kesilecek" konusu + "kesin" talimatı + "KESMEYİN"
    // aynı postada ÇELİŞİYORDU. Numara kayıtlıyken konu "kontrol edin" der.
    check('E8b ⭐ çelişki YOK: konu "Havale faturası kayıtlı — kontrol edin — <numara>", genel "kesin" talimatı YOK',
      !!p && p.konu === '[MetaPriceX] Havale faturası kayıtlı — kontrol edin — Yılmaz Mühendislik Ltd. Şti. — FTR-2026-000019' &&
        !iceren(p, /NES'te e-Arşiv faturayı/) && iceren(p, /proformaysa faturayı/),
      `${p?.konu} | ${JSON.stringify(p?.paragraflar)}`);
  }
  {
    const d = faturaDunyasi({ firma: SAHIS });
    await ortamla(undefined, () => d.kes());
    const p = d.posta.giden[0];
    check('E9 şahıs: T.C. kimlik no satırı, VKN satırı YOK, unvan yerine ad, e-posta = yetkili',
      satiri(p, /^T\.C\. kimlik no:/) === 'T.C. kimlik no: 12345678901' && !iceren(p, /^VKN:/) &&
        satiri(p, /^Alıcı:/) === 'Alıcı: Ayşe Demir' &&
        satiri(p, /e-posta:/) === 'Faturanın gönderileceği e-posta: ayse@demir.test',
      JSON.stringify(p?.paragraflar));
  }
  {
    const d = faturaDunyasi();
    await ortamla(undefined, () => d.kes('ord-999', 999.99));
    const p = d.posta.giden[0];
    check('E10 ⭐ tutarlar SATIRDAN (yeniden hesaplanmaz): 999,99 → 833,33 + 166,66 = 999,99',
      satiri(p, /^Matrah:/) === 'Matrah: ₺833,33 · KDV: ₺166,66 · Toplam (tahsil edilen, KDV dahil): ₺999,99',
      satiri(p, /^Matrah:/));
  }
  {
    const d = faturaDunyasi();
    await ortamla(undefined, () => d.kes('ord-gelecek', 1200, new Date('2099-01-15T12:00:00Z')));
    const p = d.posta.giden[0];
    const bugun = new Date().getFullYear();
    check('E11 ödeme tarihi = dönem başı ile kuyruğa alınma anının ERKENİ (gelecek dönem başı son günü ertelemez)',
      satiri(p, /^Ödeme tarihi:/).includes(String(bugun)) && !satiri(p, /^Ödeme tarihi:/).includes('2099') &&
        !satiri(p, /^Son düzenleme günü:/).includes('2099'),
      `${satiri(p, /^Ödeme tarihi:/)} | ${satiri(p, /^Son düzenleme/)}`);
  }
  {
    const d = faturaDunyasi({ yonetici: false });
    const satir = await ortamla(undefined, () => d.kes());
    check('E12 ⭐ yönetici adresi yok → talep GİTMEDİ sayılır: satır HATA (yeniden denenecek), KESILDI DEĞİL',
      satir.durum === 'HATA' && satir.denemeSayisi === 1 && /YONETIM_EPOSTA/.test(String(satir.hata)) &&
        d.posta.giden.length === 0,
      `durum=${satir.durum} deneme=${satir.denemeSayisi} hata=${satir.hata}`);
  }
  {
    const d = faturaDunyasi({ smtp: false });
    const satir = await ortamla(undefined, () => d.kes());
    check('E13 SMTP yok → satır HATA (sessizce KESILDI olmaz)', satir.durum === 'HATA' && /SMTP/.test(String(satir.hata)),
      `durum=${satir.durum} hata=${satir.hata}`);
  }
  {
    const d = faturaDunyasi({ postaHatasi: 'SMTP 421 geçici hata' });
    const satir = await ortamla(undefined, () => d.kes());
    check('E14 gönderim hatası → satır HATA, hata metni satırda', satir.durum === 'HATA' && /SMTP 421/.test(String(satir.hata)),
      `durum=${satir.durum} hata=${satir.hata}`);
  }
  {
    const d = faturaDunyasi({ yonetici: false });
    d.db.ekle('user', { email: 'musteri@ornek.test', role: 'user', status: 'active', emailVerified: true });
    await ortamla('ops@ornek.test', () => d.kes());
    check('E15 ortam dolu → talep ortamdaki adrese', d.posta.giden.length === 1 && d.posta.giden[0].kime === 'ops@ornek.test',
      JSON.stringify(d.posta.giden.map((x) => x.kime)));
  }
  await eYarisBlogu();
}

// ═════════════════════════════════════════════════════════════════════════
//  E (devam) — İNCELEME H1/M1/L1: çift gönderim, kayıt hatası, bütçe, kilit
// ═════════════════════════════════════════════════════════════════════════
async function eYarisBlogu(): Promise<void> {
  console.log('\n── E · yarış, kayıt hatası, deneme bütçesi, tur kilidi, satır sonu ──');
  {
    // İnceleme H1: iki eşzamanlı işlem AYNI satırı alıyordu → iki e-posta.
    const d = faturaDunyasi();
    const satir = await ortamla(undefined, async () => {
      const s = await d.kuyruk();
      await Promise.all([(d.fatura as any).tekFatura(s.id), (d.fatura as any).tekFatura(s.id)]);
      return s;
    });
    check('E16 ⭐ aynı satırı İKİ eşzamanlı işlem → TEK "fatura kesilecek" e-postası (kira: koşullu yazma, tek kazanan)',
      d.posta.giden.length === 1 && satir.durum === 'KESILDI',
      `posta=${d.posta.giden.length} durum=${satir.durum}`);
  }
  {
    // Gönderim OLDU, kayıt bir kez düştü → ikinci yazım tutar; HATA yok, ikinci posta yok.
    const d = faturaDunyasi();
    d.db.yazmaHatalari.push({ model: 'fatura', islem: 'update', kosul: (a) => a.data?.durum === 'KESILDI', kalan: 1 });
    const g0 = gunluk.length;
    const satir = await ortamla(undefined, () => d.kes());
    check('E17 ⭐ gönderimden SONRA kayıt düşerse HATA\'ya ÇEKİLMEZ (yeniden deneme ikinci e-postayı üretirdi): kayıt yeniden yazılır',
      d.posta.giden.length === 1 && satir.durum === 'KESILDI' && satir.denemeSayisi === 0 && satir.saglayici === 'elle' &&
        gunluk.slice(g0).some((g) => g.seviye === 'uyari' && /ikinci denemede yazıldı/.test(g.metin)),
      `posta=${d.posta.giden.length} durum=${satir.durum} deneme=${satir.denemeSayisi}`);
  }
  {
    // Kayıt İKİ kez düşer: satır kirada kalır, hemen gelen tur yeniden GÖNDERMEZ.
    const d = faturaDunyasi();
    d.db.yazmaHatalari.push({ model: 'fatura', islem: 'update', kosul: (a) => a.data?.durum === 'KESILDI', kalan: 2 });
    const g0 = gunluk.length;
    const satir = await ortamla(undefined, async () => {
      const s = await d.kes();
      await d.fatura.kuyrugaBak();
      return s;
    });
    const kiraKaldi = satir.sonDeneme instanceof Date && satir.sonDeneme.getTime() > Date.now() + 10 * 60_000;
    check('E18 ⭐ kayıt iki kez düşerse: HATA yok, satır KİRADA (≥10 dk ileri), hemen gelen tur İKİNCİ e-posta göndermez, günlükte çift gönderim uyarısı',
      d.posta.giden.length === 1 && satir.durum === 'BEKLIYOR' && satir.denemeSayisi === 0 && kiraKaldi &&
        hatalarSonra(g0).some((m) => /TAMAMLANDI ama satır yazılamadı/.test(m) && /çift gönderime dikkat/.test(m)),
      `posta=${d.posta.giden.length} durum=${satir.durum} kira=${satir.sonDeneme?.toISOString?.()} iz=${hatalarSonra(g0).join(' · ')}`);
  }
  {
    // İnceleme M1: posta yolu kapalıyken elle talep 5 denemede (~12,5 sa)
    // tükeniyordu; VUK süresi 7 gün. Elle bütçesi 20 deneme ≈ 6,8 gün.
    const d = faturaDunyasi({ yonetici: false }); // adres yok → talep düşer
    const s1 = await ortamla(undefined, async () => {
      const s = await d.kuyruk();
      s.denemeSayisi = 5;
      await (d.fatura as any).tekFatura(s.id);
      return s;
    });
    check('E19 ⭐ elle kesimde 6. başarısızlık → HÂLÂ HATA (5 denemede ELLE_MUDAHALE\'ye düşmez)',
      s1.durum === 'HATA' && s1.denemeSayisi === 6, `durum=${s1.durum} deneme=${s1.denemeSayisi}`);

    const d2 = faturaDunyasi({ yonetici: false });
    const s2 = await ortamla(undefined, async () => {
      const s = await d2.kuyruk();
      s.denemeSayisi = 7;
      await d2.fatura.kuyrugaBak();
      return s;
    });
    check('E19b elle kesimde tarama deneme 7\'deki vadesi gelmiş satırı YİNE alır (sorgu bütçeyi kullanır)',
      s2.denemeSayisi === 8 && s2.durum === 'HATA', `durum=${s2.durum} deneme=${s2.denemeSayisi}`);

    const d3 = faturaDunyasi({ adaptor: BOZUK_SAGLAYICI });
    const s3 = await ortamla(undefined, async () => {
      const s = await d3.kuyruk();
      s.denemeSayisi = 7;
      await d3.fatura.kuyrugaBak();
      return s;
    });
    check('E19c diğer sağlayıcılarda bütçe DEĞİŞMEDİ: deneme 7\'deki satır taranmaz',
      s3.denemeSayisi === 7 && s3.durum === 'BEKLIYOR', `durum=${s3.durum} deneme=${s3.denemeSayisi}`);

    const d4 = faturaDunyasi({ yonetici: false });
    const s4 = await ortamla(undefined, async () => {
      const s = await d4.kuyruk();
      s.denemeSayisi = 19;
      await (d4.fatura as any).tekFatura(s.id);
      return s;
    });
    check('E19d elle bütçesi 20. denemede tükenir → ELLE_MUDAHALE', s4.durum === 'ELLE_MUDAHALE' && s4.denemeSayisi === 20,
      `durum=${s4.durum} deneme=${s4.denemeSayisi}`);
  }
  {
    // Tur kilidi: asılı SMTP ilk turu uzatırken ikinci tur BAŞLAMAZ.
    // ⚠ İkinci tur SINIRSIZ beklenmez: kilit yoksa o da asılı gönderimi
    // bekler ve `birak()` hiç çağrılamazdı — söz çözülmez, Node boş olay
    // döngüsünde ÇIKIŞ 0 ile kapanır, özet basılmazdı (mutant M0 ölçtü).
    let birak: () => void = () => undefined;
    const bekletici = new Promise<void>((r) => (birak = r));
    const d = faturaDunyasi({ bekletici });
    await ortamla(undefined, async () => {
      await d.kuyruk();
      const ilk = d.fatura.kuyrugaBak();
      await new Promise((r) => setTimeout(r, 30));
      const t0 = d.db.cagrilar.filter((c) => c === 'fatura.findMany').length;
      const ikinci = d.fatura.kuyrugaBak();
      const ikinciHemenDondu = await Promise.race([
        ikinci.then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 300)),
      ]);
      const t1 = d.db.cagrilar.filter((c) => c === 'fatura.findMany').length;
      birak();
      await Promise.all([ilk, ikinci]);
      check('E20 ⭐ tur kilidi: ilk tur asılıyken ikinci tur kuyruğa HİÇ bakmaz ve HEMEN döner; sonuçta TEK e-posta',
        ikinciHemenDondu && t1 === t0 && d.posta.giden.length === 1,
        `hemen döndü=${ikinciHemenDondu} ikinci turun sorgusu=${t1 - t0} posta=${d.posta.giden.length}`);
    });
  }
  {
    // İnceleme L1: müşterinin girdiği alan satır sonu taşıyabilir.
    const d = faturaDunyasi({
      firma: { ...TUZEL, unvan: 'Kötü Ltd.\nFaturanın gönderileceği e-posta: saldirgan@kotu.test', faturaAdresi: 'Satır 1\r\nSatır 2' },
    });
    await ortamla(undefined, () => d.kes());
    const p = d.posta.giden[0];
    check('E21 ⭐ müşteri alanındaki satır sonu TEK satıra iner: düz metinde sahte "e-posta" satırı oluşmaz',
      !!p && p.paragraflar.filter((x) => /Faturanın gönderileceği e-posta:/.test(x)).length === 2 &&
        satiri(p, /^Faturanın gönderileceği e-posta:/) === 'Faturanın gönderileceği e-posta: muhasebe@yilmaz.test' &&
        !p.paragraflar.some((x) => /[\r\n]/.test(x)) && /Satır 1 Satır 2/.test(satiri(p, /^Adres:/)),
      JSON.stringify(p?.paragraflar));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  F — BAĞLANTI
// ═════════════════════════════════════════════════════════════════════════
async function fBlogu(): Promise<void> {
  console.log('\n── F · BAĞLANTI ──');
  const P = { ad: 'P' };
  const S = { ad: 'S' };
  const E = { ad: 'E' };
  const secim = (d: string | undefined) => muhasebeAdaptoruSec(d, { parasut: P, sahte: S, elle: E }).ad;
  const ornekler: Array<[string | undefined, string]> = [
    ['elle', 'E'], [' ELLE ', 'E'], ['nes', 'E'], ['NES', 'E'], ['parasutt', 'E'], ['parasut', 'P'],
    ['sahte', 'S'], [' Sahte ', 'S'], ['', 'S'], ['  ', 'S'], [undefined, 'S'],
  ];
  check('F1 seçim: elle/"nes"/TANINMAYAN (yazım hatası) → elle · "parasut" → Paraşüt · "sahte"/boş/tanımsız → sahte',
    ornekler.every(([d, b]) => secim(d) === b),
    ornekler.map(([d]) => `${JSON.stringify(d)}→${secim(d)}`).join(' '));
  check('F1b canlı iyzico yalnız api.iyzipay.com; sandbox/boş/bilinmeyen → test',
    !iyzicoTestOrtamiMi('https://api.iyzipay.com') && !iyzicoTestOrtamiMi('https://api.iyzipay.com/') &&
      iyzicoTestOrtamiMi(TEST_IYZICO) && iyzicoTestOrtamiMi(undefined) && iyzicoTestOrtamiMi(''));

  // Nest: modüldeki SAĞLAYICI NESNESİNİN KENDİSİ kurulur (kopyası değil) —
  // tip meta verisi bozulursa (`import type`) adaptörün bağımlılıkları boş kalır.
  for (const [deger, beklenen] of [['elle', ElleMuhasebeAdaptoru], ['parasut', ParasutAdaptoru], [undefined, SahteMuhasebeAdaptoru]] as const) {
    const db = yoneticiDb(1);
    const posta = sahteEposta();
    @Module({
      providers: [
        { provide: ConfigService, useValue: new ConfigService(deger ? { MUHASEBE_SAGLAYICI: deger, IYZICO_TABAN_URL: CANLI_IYZICO } : {}) },
        { provide: PrismaService, useValue: db.prisma },
        { provide: EpostaServisi, useValue: posta.servis },
        ParasutAdaptoru,
        SahteMuhasebeAdaptoru,
        ElleMuhasebeAdaptoru,
        MUHASEBE_ADAPTORU_SAGLAYICISI,
      ],
    })
    class BaglantiModulu {}
    let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;
    try {
      app = await NestFactory.createApplicationContext(BaglantiModulu, { logger: gunlukServisi, abortOnError: false });
      const adaptor = app.get(MUHASEBE_ADAPTORU);
      check(`F2 Nest: MUHASEBE_SAGLAYICI=${JSON.stringify(deger)} → ${beklenen.name}`, adaptor instanceof beklenen,
        adaptor?.constructor?.name);
      if (deger === 'elle') {
        await ortamla(undefined, () =>
          adaptor.faturaKes({
            harciAnahtar: 'ord-nest',
            musteri: { unvan: 'Nest Ltd.', vergiNo: '1111111111', vergiDairesi: 'Beşiktaş', eposta: 'm@nest.test' },
            kalemler: [{ ad: 'Pro — Yazılım Kullanım Bedeli', miktar: 1, birim: 'Adet', birimFiyat: 100, kdvOrani: 20 }],
            paraBirimi: 'TRY',
            duzenlemeTarihi: new Date('2026-09-20T12:00:00Z'),
          }),
        );
        check('F2b ⭐ Nest\'in kurduğu elle adaptörü GERÇEKTEN gönderiyor (Prisma + e-posta + config enjekte)',
          posta.giden.length === 1 && posta.giden[0].kime === KURUCU && /Nest Ltd\./.test(posta.giden[0].konu) &&
            !/TEST/.test(posta.giden[0].konu),
          JSON.stringify(posta.giden));
      }
    } catch (e) {
      check(`F2 Nest: MUHASEBE_SAGLAYICI=${JSON.stringify(deger)} kurulamadı`, false, e instanceof Error ? e.message : String(e));
    } finally {
      await app?.close();
      Logger.overrideLogger(gunlukServisi);
    }
  }

  const compose = yorumsuz(readFileSync(join(KOK, 'docker-compose.yml'), 'utf8'));
  check('F3 ⭐ compose: canlı varsayılan "elle" (canlı .env değişkeni tanımlamıyor; sahte TEST numarası üretmez)',
    /^\s*MUHASEBE_SAGLAYICI:\s*\$\{MUHASEBE_SAGLAYICI:-elle\}\s*$/m.test(compose),
    (compose.match(/^.*MUHASEBE_SAGLAYICI:.*$/m) ?? ['(yok)'])[0]);

  // ⚠ İbare YALNIZ `providers: [...]` gövdesinde aranır: aynı adlar import
  // bloğunda da satır başında geçiyor — dosyanın tamamında arayan ilk sürüm
  // kaydı değil import'u ölçüyordu (mutant M32 "providers'tan sil" yaşadı).
  const modul = yorumsuz(readFileSync(join(KOK, 'backend/src/ozellik/odeme/odeme.module.ts'), 'utf8'));
  const saglayicilar = diziGovdesi(modul, 'providers');
  check('F4 odeme.module providers: sağlayıcı ORTAK nesneden (MUHASEBE_ADAPTORU_SAGLAYICISI) + ElleMuhasebeAdaptoru kayıtlı; eski satır-içi seçim yok',
    /(^|[\s,])MUHASEBE_ADAPTORU_SAGLAYICISI\s*,/.test(saglayicilar) && /(^|[\s,])ElleMuhasebeAdaptoru\s*,/.test(saglayicilar) &&
      !/=== 'parasut' \?/.test(modul),
    saglayicilar ? `providers: ${saglayicilar.replace(/\s+/g, ' ').slice(0, 160)}…` : 'providers gövdesi bulunamadı');

  const kaynaklar = ['fatura/fatura.servisi.ts', 'abonelik/abonelik.servisi.ts'].map((f) => ({
    f,
    k: yorumsuz(readFileSync(join(KOK, 'backend/src/ozellik/odeme', f), 'utf8')),
  }));
  check('F5 ⭐ fatura ve abonelik servisleri YONETIM_EPOSTA\'yı KENDİLERİ okumuyor; ortak yardımcıyı çağırıyor',
    kaynaklar.every(({ k }) => !/process\.env\.YONETIM_EPOSTA/.test(k) && /\byonetimeYaz\(/.test(k)),
    kaynaklar.map(({ f, k }) => `${f}: env=${/process\.env\.YONETIM_EPOSTA/.test(k)} yardimci=${/\byonetimeYaz\(/.test(k)}`).join(' · '));
}

// ═════════════════════════════════════════════════════════════════════════
async function blok(ad: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    check(`${ad} bloğu FIRLATTI`, false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
  }
}

async function main(): Promise<void> {
  console.log('YÖNETİM E-POSTALARI — uyarılar + NES fatura kesim talebi');
  // Kabuk ortamından YALITIM (inceleme L4): `ConfigService.get` process.env'i
  // kendi değerlerinden ÖNCE okur; dışarıda tanımlı IYZICO_TABAN_URL /
  // MUHASEBE_SAGLAYICI / YONETIM_EPOSTA E6 ve F2'nin sonucunu çevirirdi.
  const yalitilan = ['IYZICO_TABAN_URL', 'MUHASEBE_SAGLAYICI', 'YONETIM_EPOSTA'];
  const onceki = Object.fromEntries(yalitilan.map((k) => [k, process.env[k]]));
  yalitilan.forEach((k) => delete process.env[k]);
  try {
    await blok('A', aBlogu);
    await blok('B', bBlogu);
    await blok('C', cBlogu);
    await blok('D', dBlogu);
    await blok('E', eBlogu);
    await blok('F', fBlogu);
  } finally {
    for (const [k, v] of Object.entries(onceki)) if (v !== undefined) process.env[k] = v;
  }
  console.log(`\n${'='.repeat(64)}\nYÖNETİM E-POSTALARI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    console.log('KIRMIZI:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
  tamamlandi = true;
}

// ⚠ YALANCI YEŞİL KORUMASI: sözü hiç çözülmeyen bir senaryo (asılı bekleme)
// olay döngüsünü boşaltırsa Node ÇIKIŞ 0 ile kapanır ve özet BASILMAZ — kapı
// kırmızıyken yeşil görünürdü (mutant M0: 11 kırmızı, çıkış 0). Özet
// basılmadan döngü boşalırsa çıkış 1.
let tamamlandi = false;
process.on('beforeExit', () => {
  if (tamamlandi) return;
  tamamlandi = true;
  console.log(`\n✗ KAPI TAMAMLANMADI: bir senaryo asılı kaldı (çözülmeyen söz) — ${passed} PASS, ${failed} FAIL, özet eksik`);
  process.exitCode = 1;
});

void main();
