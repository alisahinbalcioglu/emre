/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PARA BIRIMI YAZIM KAPISI — KUR-02 yazma yollari  (`npm run test:para-birimi-yazim`)
 *
 *  IS EMRI (14.09.2026, tur 3 A3; Emre onayi): tanınmayan para birimi kodu
 *  yazma yollarinda gerekceli 400 ile reddedilsin.
 *      EURO · $ · GBP · bos · xyz → 400        USD · EUR · TRY → 2xx
 *
 *  ── OLCULEN ONCUL (gercek HTTP yigini, 14.09) ──────────────────────────────
 *  Alti yazma ucunun HICBIRI 400 donmuyordu: 'EURO', '$', 'GBP', 'xyz' 201 ile
 *  ham yaziliyor; admin commit '' yaziyor; iscilikte sayi, liste acildiktan
 *  SONRA 500 verip hayalet liste birakiyordu. Admin ONIZLEMESI Para Birimi
 *  kolonundaki GBP/xyz'yi TRY, "CAD $"i USD yapiyordu — commit'e tanınmayan kod
 *  hic ulasmiyor, 1:1 TL yaziliyordu (commit'teki 400 o yolu hic gormezdi).
 *
 *  ── KORUNAN SOZLESME ───────────────────────────────────────────────────────
 *  R) Kural (`paraBirimiYazimi`): alan yok → dokunma · bos/null → RED ·
 *     'usd'/' USD ' kanonik · EURO/$/TL RED + ipucu · okuma kurali degismez.
 *  I) Iscilik save-bulk: RED → liste ACILMAZ, satir YAZILMAZ; alan yoksa
 *     mevcut para birimine dokunulmaz.
 *  K) Kutuphane "Marka Ekle" + satir ekleme: RED → marka/liste ACILMAZ; DTO
 *     (whitelist) alani silmez; satir numarasi kullanicinin tablo sirasi.
 *  A) Admin commit + save-bulk: RED → 'auto' liste acilmaz, replace silmesi
 *     KOSMAZ, markaya commit icin acilan liste geri silinir.
 *  P) Admin onizleme: taninmayan yazim HAM tasinir + tek uyari; ON YUZUN
 *     yaptigi gibi items aynen commit edilince 400.
 *
 *  DB GEREKMEZ: sahte Prisma + gercek servis/DTO/ValidationPipe.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  paraBirimiKodu,
  paraBirimiYazimi,
  paraBirimleriniDogrula,
  satirAdi,
} from '../src/ozellik/fiyat/exchange-rates/exchange-rates.service';
import { LaborFirmsService } from '../src/ozellik/kutuphane/labor-firms/labor-firms.service';
import { LibraryService } from '../src/ozellik/kutuphane/library/library.service';
import { LibraryController } from '../src/ozellik/kutuphane/library/library.controller';
import { CreateManualBrandDto } from '../src/ozellik/kutuphane/library/dto/create-manual-brand.dto';
import { AddLibraryRowsDto } from '../src/ozellik/kutuphane/library/dto/add-library-rows.dto';
import { AdminService } from '../src/ozellik/kutuphane/admin/admin.service';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay?: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
}

/** Is emrinin RED listesi + yazim ailesinin kardesleri (bosluk, null, sayi). */
const RED: unknown[] = ['EURO', '$', 'GBP', '', 'xyz', '   ', null, 123];
/** Kabul: [gonderilen, DB'ye yazilacak kanonik kod]. */
const KABUL: [string, string][] = [['USD', 'USD'], ['EUR', 'EUR'], ['TRY', 'TRY'], ['usd', 'USD'], [' USD ', 'USD']];
const KANONIK = JSON.stringify(KABUL.map(([, k]) => k));

async function hata(fn: () => Promise<unknown>): Promise<any> {
  try { await fn(); return null; } catch (e) { return e; }
}
const mesaj = (e: any): string => String(e?.message ?? e);
const ozet = (l: { h: unknown; e: any }[]) => l.map((x) => `${JSON.stringify(x.h)}→${x.e?.constructor?.name ?? 'KABUL'}`).join(' | ');

// ── Sahte depolar ───────────────────────────────────────────────────────────
function iscilikSahte() {
  const s = { listeAcilan: 0, kalemAcilan: 0, upsert: [] as any[] };
  const client: any = {
    laborFirm: { findUnique: async () => ({ id: 'f1', firmaId: 'fa', name: 'Yasin Usta', discipline: 'mechanical' }) },
    laborPriceList: {
      findFirst: async () => null,
      create: async (a: any) => { s.listeAcilan++; return { id: 'pl-yeni', ...a.data }; },
      findUnique: async () => ({ id: 'pl1', name: 'Liste', firmaId: 'f1' }),
      update: async () => ({}),
    },
    laborItem: {
      findFirst: async () => null,
      create: async (a: any) => { s.kalemAcilan++; return { id: `li-${s.kalemAcilan}`, ...a.data }; },
      update: async () => ({}),
    },
    laborPrice: { upsert: async (a: any) => { s.upsert.push(a); return { id: `lp-${s.upsert.length}` }; } },
  };
  return { s, svc: new LaborFirmsService(client, { laborItemIndexData: () => ({}) } as any) };
}

function kutuphaneSahte() {
  const s = { markaAcilan: 0, fiyatListesi: 0, listeAcilan: 0, pi: [] as any[], ul: [] as any[] };
  const client: any = {
    brand: {
      findUnique: async () => ({ id: 'b1', name: 'kirke', discipline: 'mechanical' }),
      upsert: async (a: any) => { s.markaAcilan++; return { id: 'b-yeni', name: a.create.name }; },
    },
    userLibrary: {
      count: async () => 15,
      aggregate: async () => ({ _max: { sortOrder: 4 } }),
      create: async (a: any) => { s.ul.push(a.data); return { id: `ul${s.ul.length}` }; },
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
    },
    libraryList: {
      findFirst: async () => null,
      create: async (a: any) => { s.listeAcilan++; return { id: 'll-yeni', ...a.data }; },
      findMany: async () => [],
    },
    priceList: { create: async (a: any) => { s.fiyatListesi++; return { id: 'pl-k', ...a.data }; } },
    productIndex: { create: async (a: any) => { s.pi.push(a.data); return { id: `pi-${s.pi.length}`, ...a.data }; } },
    userBrandLibrary: { deleteMany: async () => ({ count: 0 }), upsert: async () => ({}) },
  };
  const svc = new LibraryService(client, { learnFamilyAliases: async () => undefined } as any);
  (svc as any).rebuildUserBrandLibrary = async () => undefined;
  return { s, svc };
}

function adminSahte() {
  const s = { listeAcilan: 0, listeSilinen: 0, silme: 0, mp: [] as any[], pi: [] as any[] };
  const p: any = {
    brand: { findUnique: async () => ({ id: 'b1', name: 'Ayvaz' }) },
    priceList: {
      findUnique: async () => ({ id: 'pl1', name: 'Ayvaz Şubat', brandId: 'b1', createdAt: new Date(), brand: { name: 'Ayvaz' } }),
      findFirst: async () => null,
      create: async (a: any) => { s.listeAcilan++; return { id: 'pl-yeni', createdAt: new Date(), ...a.data }; },
      delete: async () => { s.listeSilinen++; return {}; },
    },
    material: { findFirst: async () => null, create: async (a: any) => ({ id: `m-${a.data.name}`, ...a.data }), update: async () => ({}) },
    materialPrice: {
      upsert: async (a: any) => { s.mp.push(a.create); return {}; },
      findMany: async () => [],
      deleteMany: async () => { s.silme++; return { count: 0 }; },
    },
    productIndex: {
      upsert: async (a: any) => { s.pi.push(a.create); return {}; },
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
      updateMany: async () => ({ count: 0 }),
    },
    userLibrary: { count: async () => 0, findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    terminologyAlias: { findMany: async () => [], upsert: async () => ({}), createMany: async () => ({}) },
    $transaction: async (x: any) => (Array.isArray(x) ? Promise.all(x) : x(p)),
  };
  return { s, svc: new AdminService(p, {} as any, new Proxy({}, { get: () => async () => ({}) }) as any, { iptalEt: async () => undefined } as any) };
}

function excel(sayfa: string, aoa: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sayfa);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

(async () => {
  // ═══ R) KURAL ═══════════════════════════════════════════════════════════════
  console.log('── R) kural: paraBirimiYazimi ──');
  {
    const kod = (h: unknown) => { const y = paraBirimiYazimi(h); return 'kod' in y ? y.kod : `RED:${y.neden}`; };
    check('R1 USD · EUR · TRY kabul', kod('USD') === 'USD' && kod('EUR') === 'EUR' && kod('TRY') === 'TRY');
    check('R2 harf ve baş/son boşluk kanonik: usd · " USD " · Eur', kod('usd') === 'USD' && kod(' USD ') === 'USD' && kod('Eur') === 'EUR',
      `${kod('usd')} ${kod(' USD ')} ${kod('Eur')}`);
    check('R3 alan YOK (undefined) → dokunma: kod undefined, RED değil', kod(undefined) === undefined, String(kod(undefined)));
    check('R4 boş · boşluk · null → RED "boş gönderildi"', ['', '   ', null].every((h) => kod(h) === 'RED:para birimi boş gönderildi'),
      ['', '   ', null].map(kod).join(' | '));
    check('R5 EURO · $ · TL → RED + ipucu (okuma tarafı tanır, DB\'ye yalnız kanonik kod)',
      kod('EURO') === 'RED:para birimi "EURO" tanınmadı ("EUR" mi?)'
      && kod('$') === 'RED:para birimi "$" tanınmadı ("USD" mi?)'
      && kod('TL') === 'RED:para birimi "TL" tanınmadı ("TRY" mi?)',
      [kod('EURO'), kod('$'), kod('TL')].join(' | '));
    check('R6 GBP · xyz · 123 → RED, ipucu YOK',
      kod('GBP') === 'RED:para birimi "GBP" tanınmadı' && kod('xyz') === 'RED:para birimi "xyz" tanınmadı' && kod(123) === 'RED:para birimi "123" tanınmadı',
      [kod('GBP'), kod('xyz'), kod(123)].join(' | '));
    check('R7 OKUMA kuralı değişmedi: eski boş satır TRY, EURO → EUR (paraBirimiKodu)',
      paraBirimiKodu('') === 'TRY' && paraBirimiKodu(null) === 'TRY' && paraBirimiKodu('EURO') === 'EUR');

    const tek = await hata(async () => paraBirimleriniDogrula([{ ad: 'Boru montajı DN25', c: 'EURO' }], (x) => x.c, (x) => satirAdi('Satır 3', x.ad)));
    check('R8 tek satır mesajı: satır adı + neden + ne yazılacağı + hiçbir satır kaydedilmedi',
      tek instanceof BadRequestException
      && mesaj(tek) === 'Satır 3 ("Boru montajı DN25"): para birimi "EURO" tanınmadı ("EUR" mi?). TRY, USD ya da EUR yazın; hiçbir satır kaydedilmedi.',
      mesaj(tek));
    const cok = await hata(async () => paraBirimleriniDogrula(['USD', 'GBP', '', 'EUR'], (x) => x, (_x, i) => `Satır ${i + 1}`));
    check('R9 çok satır: sayı + yalnız HATALI satırlar',
      mesaj(cok) === '2 satırda para birimi geçersiz — Satır 2: para birimi "GBP" tanınmadı · Satır 3: para birimi boş gönderildi. TRY, USD ya da EUR yazın; hiçbir satır kaydedilmedi.',
      mesaj(cok));
    const kodlar = paraBirimleriniDogrula([' usd', undefined, 'TRY'], (x) => x, () => '');
    check('R10 hepsi geçerliyse satır sırasıyla kanonik kod (alan yok = undefined)',
      kodlar.length === 3 && kodlar[0] === 'USD' && kodlar[1] === undefined && kodlar[2] === 'TRY', String(kodlar));
  }

  // ═══ I) ISCILIK save-bulk ═══════════════════════════════════════════════════
  console.log('── I) işçilik save-bulk ──');
  const KI = { userId: 'u1', firmaId: 'fa' };
  {
    const l: { h: unknown; e: any; s: ReturnType<typeof iscilikSahte>['s'] }[] = [];
    for (const h of RED) {
      const { s, svc } = iscilikSahte();
      const e = await hata(() => svc.saveBulkPrices(KI, 'f1', 'new', [
        { laborName: 'PPR-C Boru 20 mm', unit: 'metre', unitPrice: 50, currency: 'TRY' },
        { laborName: 'Boru montajı DN25', unit: 'metre', unitPrice: 120, currency: h as any },
      ]));
      l.push({ h, e, s });
    }
    check('I1 EURO · $ · GBP · boş · xyz · boşluk · null · 123 → 400', l.every((x) => x.e instanceof BadRequestException), ozet(l));
    check('I2 ★ red: liste AÇILMAZ, kalem ve fiyat YAZILMAZ (sayı artık 500 + hayalet liste değil)',
      l.every((x) => x.s.listeAcilan === 0 && x.s.kalemAcilan === 0 && x.s.upsert.length === 0),
      l.map((x) => `${JSON.stringify(x.h)}:${x.s.listeAcilan}/${x.s.kalemAcilan}/${x.s.upsert.length}`).join(' | '));
    check('I3 mesaj satırı adıyla söyler (Satır 2 "Boru montajı DN25")',
      l.every((x) => mesaj(x.e).startsWith('Satır 2 ("Boru montajı DN25"): para birimi ')), mesaj(l[0].e));
  }
  {
    const { s, svc } = iscilikSahte();
    const r = await svc.saveBulkPrices(KI, 'f1', 'new', KABUL.map(([h], i) => ({ laborName: `Kalem ${i} montajı`, unit: 'Adet', unitPrice: 10 + i, currency: h })));
    const yazilan = JSON.stringify(s.upsert.map((a) => a.create.currency));
    check('I4 USD · EUR · TRY · usd · " USD " kabul → DB\'ye KANONİK kod', r.imported === 5 && yazilan === KANONIK, yazilan);
  }
  {
    const { s, svc } = iscilikSahte();
    await svc.saveBulkPrices(KI, 'f1', 'pl1', [{ laborName: 'Boru montajı DN25', unit: 'metre', unitPrice: 120 }]);
    const a = s.upsert[0];
    check('I5 alan YOK → para birimine dokunulmaz (mevcut USD fiyat TL\'ye çevrilmez; oluşturmada DB varsayılanı)',
      !!a && !('currency' in a.update) && !('currency' in a.create), JSON.stringify(a));
  }

  // ═══ K) KUTUPHANE ═══════════════════════════════════════════════════════════
  console.log('── K) kütüphane: Marka Ekle + satır ekleme ──');
  const KK = { userId: 'u1', firmaId: 'f1' } as any;
  {
    const l: { h: unknown; e: any; s: ReturnType<typeof kutuphaneSahte>['s'] }[] = [];
    for (const h of RED) {
      const { s, svc } = kutuphaneSahte();
      const e = await hata(() => svc.createManualBrand(KK, {
        brandName: 'Kirke',
        rows: [{ ad: 'Küresel Vana', cap: 'DN 25', price: 10, currency: 'USD' }, { ad: '' }, { ad: 'Kelebek Vana', price: 20, currency: h }],
      } as any));
      l.push({ h, e, s });
    }
    check('K1 Marka Ekle: EURO · $ · GBP · boş · xyz · boşluk · null · 123 → 400', l.every((x) => x.e instanceof BadRequestException), ozet(l));
    check('K2 ★ red: marka, fiyat listesi, indeks, kütüphane satırı AÇILMAZ',
      l.every((x) => x.s.markaAcilan === 0 && x.s.fiyatListesi === 0 && x.s.pi.length === 0 && x.s.ul.length === 0),
      l.map((x) => `${JSON.stringify(x.h)}:${x.s.markaAcilan}/${x.s.fiyatListesi}/${x.s.pi.length}/${x.s.ul.length}`).join(' | '));
    check('K3 satır numarası kullanıcının tablo sırası (boş 2. satır elenmeden: Satır 3)',
      l.every((x) => mesaj(x.e).startsWith('Satır 3 ("Kelebek Vana"): para birimi ')), mesaj(l[0].e));
  }
  {
    const l: { h: unknown; e: any; s: ReturnType<typeof kutuphaneSahte>['s'] }[] = [];
    for (const h of RED) {
      const { s, svc } = kutuphaneSahte();
      const e = await hata(() => svc.addRowsToBrandList(KK, 'b1', { listId: 'new', rows: [{ ad: 'Kelebek Vana', price: 20, currency: h }] } as any));
      l.push({ h, e, s });
    }
    check('K4 satır ekleme ("+ Yeni Liste"): red → 400, liste ve satır AÇILMAZ',
      l.every((x) => x.e instanceof BadRequestException && x.s.listeAcilan === 0 && x.s.fiyatListesi === 0 && x.s.ul.length === 0), ozet(l));
  }
  {
    const { s, svc } = kutuphaneSahte();
    await svc.createManualBrand(KK, { brandName: 'Kirke', rows: KABUL.map(([h], i) => ({ ad: 'Küresel Vana', cap: `DN ${15 + i * 5}`, price: 10, currency: h })) } as any);
    const pi = JSON.stringify(s.pi.map((d) => d.currency));
    const ul = JSON.stringify(s.ul.map((d) => d.currency));
    check('K5 kabul → ProductIndex ve kütüphane satırına KANONİK kod', pi === KANONIK && ul === KANONIK, `${pi} / ${ul}`);
  }
  {
    const tip1 = Reflect.getMetadata('design:paramtypes', LibraryController.prototype, 'createManualBrand') ?? [];
    const tip2 = Reflect.getMetadata('design:paramtypes', LibraryController.prototype, 'addRowsToBrandList') ?? [];
    check('K6 bağlantı: controller gövdeleri DTO sınıfı (ValidationPipe gerçekten koşar)',
      tip1[1] === CreateManualBrandDto && tip2[2] === AddLibraryRowsDto, `${tip1[1]?.name} / ${tip2[2]?.name}`);
    const pipe = new ValidationPipe({ whitelist: true, transform: true }); // main.ts ile aynı ayar
    const dto = await pipe.transform({ brandName: 'Kirke', rows: [{ ad: 'Kelebek Vana', currency: 'EURO' }] }, { type: 'body', metatype: CreateManualBrandDto, data: undefined });
    const { s, svc } = kutuphaneSahte();
    const e = await hata(() => svc.createManualBrand(KK, dto));
    check('K7 ★ pipe (whitelist) para birimini SİLMEZ: gövde → servis → 400, marka açılmaz',
      dto.rows?.[0]?.currency === 'EURO' && e instanceof BadRequestException && s.markaAcilan === 0, `${dto.rows?.[0]?.currency} · ${mesaj(e)}`);
    const e2 = await hata(() => pipe.transform({ brandName: 'Kirke', rows: [{ ad: 'Kelebek Vana', currency: 123 }] }, { type: 'body', metatype: CreateManualBrandDto, data: undefined }));
    check('K8 sayı para birimi pipe\'ta 400, mesaj ürün dilinde',
      e2 instanceof BadRequestException && JSON.stringify(e2.getResponse()).includes('para birimi metin olmalı — TRY, USD ya da EUR yazın'),
      JSON.stringify(e2?.getResponse?.()));
  }

  // ═══ A) ADMIN commit + save-bulk ════════════════════════════════════════════
  console.log('── A) admin: save-bulk + liste commit + marka commit ──');
  {
    const l: { h: unknown; e: any; s: ReturnType<typeof adminSahte>['s'] }[] = [];
    for (const h of RED) {
      const { s, svc } = adminSahte();
      const e = await hata(() => svc.saveBulkMaterials('b1', 'auto', [
        { materialName: 'Küresel Vana DN25', unit: 'Adet', unitPrice: 10, currency: 'USD' },
        { materialName: 'Kelebek Vana DN80', unit: 'Adet', unitPrice: 20, currency: h as any },
      ]));
      l.push({ h, e, s });
    }
    check('A1 save-bulk: EURO · $ · GBP · boş · xyz · boşluk · null · 123 → 400', l.every((x) => x.e instanceof BadRequestException), ozet(l));
    check('A2 ★ red: "auto" liste AÇILMAZ, fiyat ve indeks YAZILMAZ',
      l.every((x) => x.s.listeAcilan === 0 && x.s.mp.length === 0 && x.s.pi.length === 0),
      l.map((x) => `${JSON.stringify(x.h)}:${x.s.listeAcilan}/${x.s.mp.length}/${x.s.pi.length}`).join(' | '));
    check('A3 mesaj kalem sırası ve adıyla (Kalem 2 "Kelebek Vana DN80")',
      l.every((x) => mesaj(x.e).startsWith('Kalem 2 ("Kelebek Vana DN80"): para birimi ')), mesaj(l[0].e));
  }
  {
    const { s, svc } = adminSahte();
    const e = await hata(() => svc.commitPriceListImport('pl1', {
      items: [{ materialName: 'Kelebek Vana DN80', unit: 'Adet', unitPrice: 20, currency: 'GBP', sheetName: 'Vanalar', sourceRow: 6, adRaw: 'Kelebek Vana' }],
    }));
    check('A4 ★ mevcut listeye commit: red → 400, listenin eski kalemleri SİLİNMEZ (replace koşmaz)',
      e instanceof BadRequestException && s.silme === 0 && s.mp.length === 0, `${mesaj(e)} · silme=${s.silme}`);
    check('A5 içe aktarım satırı dosya konumuyla söylenir ("Vanalar" satır 7)',
      mesaj(e).startsWith('"Vanalar" satır 7 ("Kelebek Vana"): para birimi "GBP" tanınmadı'), mesaj(e));
  }
  {
    const { s, svc } = adminSahte();
    const e = await hata(() => svc.commitBrandImport('b1', { items: [{ materialName: 'Kelebek Vana DN80', unit: 'Adet', unitPrice: 20, currency: 'xyz' }], listName: 'Ayvaz Eylül' }));
    check('A6 markaya commit: red → 400, commit için açılan liste GERİ SİLİNİR',
      e instanceof BadRequestException && s.listeAcilan === 1 && s.listeSilinen === 1 && s.mp.length === 0,
      `acilan=${s.listeAcilan} silinen=${s.listeSilinen} · ${mesaj(e)}`);
  }
  {
    const { s, svc } = adminSahte();
    await svc.saveBulkMaterials('b1', 'pl1', KABUL.map(([h], i) => ({ materialName: `Küresel Vana DN${15 + i * 5}`, unit: 'Adet', unitPrice: 10 + i, currency: h })));
    const mp = JSON.stringify(s.mp.map((d) => d.currency));
    const pi = JSON.stringify(s.pi.map((d) => d.currency));
    check('A7 kabul → MaterialPrice ve ProductIndex\'e KANONİK kod', mp === KANONIK && pi === KANONIK, `${mp} / ${pi}`);
  }

  // ═══ P) ADMIN ONIZLEME → COMMIT ═════════════════════════════════════════════
  console.log('── P) admin önizleme: tanınmayan kod TRY\'ye düşmez ──');
  {
    const { s, svc } = adminSahte();
    const yazimlar = ['USD', 'EURO', 'TL', 'GBP', 'xyz', 'CAD $', ''];
    const aoa = [['Malzeme Adı', 'Birim Fiyat', 'Para Birimi', 'Birim'], ...yazimlar.map((k, i) => [`Küresel Vana DN${15 + i * 5}`, 10, k, 'Adet'])];
    const on: any = await svc.previewBrandExcel('b1', excel('Vanalar', aoa), null);
    const kodlar = JSON.stringify(on.items.map((it: any) => it.currency));
    check('P1 önizleme: EURO→EUR, TL→TRY; TANINMAYAN HAM kalır (GBP · xyz · "CAD $"); boş hücre TRY',
      kodlar === JSON.stringify(['USD', 'EUR', 'TRY', 'GBP', 'xyz', 'CAD $', 'TRY']), kodlar);
    check('P2 dosya başına TEK uyarı, listenin başında, satır sayısı ve yazımlarla',
      on.warnings[0] === '3 satırda Para Birimi tanınmadı ("GBP", "xyz", "CAD $") — bu satırlar düzeltilmeden içe aktarım kaydedilmez; dosyada TRY, USD ya da EUR yazın.'
      && on.warnings.filter((w: string) => w.includes('Para Birimi tanınmadı')).length === 1,
      JSON.stringify(on.warnings));
    const e = await hata(() => svc.commitBrandImport('b1', { items: on.items, listName: 'Ayvaz Eylül' }));
    check('P3 ★ önizleme → commit (ön yüz items\'ı aynen yollar): 400, üç satır adıyla, hiçbir fiyat yazılmaz',
      e instanceof BadRequestException
      && mesaj(e).startsWith('3 satırda para birimi geçersiz — "Vanalar" satır 5 ("Küresel Vana DN30"): para birimi "GBP" tanınmadı')
      && mesaj(e).includes('"Vanalar" satır 7 ("Küresel Vana DN40"): para birimi "CAD $" tanınmadı')
      && s.mp.length === 0,
      mesaj(e));
    const on2: any = await svc.previewBrandExcel('b1', excel('S', [['Malzeme Adı', 'Birim Fiyat'], ['Küresel Vana A', '$100'], ['Küresel Vana B', '100 €']]), null);
    const kodlar2 = JSON.stringify(on2.items.map((it: any) => it.currency));
    check('P4 Para Birimi kolonu YOKSA fiyat hücresi sembolü eskisi gibi ($100 → USD, 100 € → EUR)', kodlar2 === JSON.stringify(['USD', 'EUR']), kodlar2);
  }

  console.log('');
  const toplam = passed + failures.length;
  if (failures.length) {
    console.log(`✗ PARA BIRIMI YAZIM: ${passed}/${toplam} gecti, ${failures.length} BASARISIZ`);
    for (const f of failures) console.log(`   ✗ ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ PARA BIRIMI YAZIM: ${passed}/${toplam} kriter gecti`);
})().catch((e) => { console.error('BEKLENMEYEN HATA:', e); process.exitCode = 1; });
