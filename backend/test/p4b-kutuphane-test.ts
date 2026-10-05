/**
 * P4B KUTUPHANE (05.10.2026, P4b Parti 2a) — `npm run test:p4b-kutuphane`, DB/AG GEREKTIRMEZ.
 *
 * F · OZEL FIYAT BIRIMI (C3, Emre karari 01.10): kutuphane ozel fiyati
 *     girildigi PARA BIRIMINDE kalir. Satirin tek `currency`si vardi;
 *     "Kutuphaneme Aktar" havuzun birimini yazinca ozel fiyat sessizce YENI
 *     birimde okunuyordu (120 TL → 120 €). Yazanlar birimi `customPriceCurrency`
 *     alanina dondurur, aktarim dokunmaz, izgara ozel fiyati kendi birimiyle
 *     gosterir, fiyat duzenlemesi `listPrice`a yabanci birimli sayi yazmaz.
 * A · AD DUZELTMESI (C7, Emre karari 01.10): ad yalniz GOSTERILEN addan
 *     farkliysa duzeltmedir. Sahipli urunde ProductIndex'in kendisi (ad +
 *     turetilmis alanlar, kimlik sabit, indeks + satir tek islemde); ortak
 *     (havuz) urunde `kullaniciAdi` — yalniz o firmada, aktarim ezmez, havuz
 *     adina donus temizler.
 * M · MANUEL URUN (yan bulgu, 05.10): `insertLibraryRows` ProductIndex'i elle
 *     yazilmis alan listesiyle olusturuyordu; S4/S5'in `malzemeler` /
 *     `aileZayif` alanlari yoktu → urun surum atlamasina dek varsayilanla
 *     ([] / false) kaliyordu (yeniden indeksleme guncel surumu atlar).
 * H/R · TEK LISTE: `turetilmisIndeksAlanlari` = buildProductIndex alanlari ∩
 *     sema − rowKey; yonetici yeniden indekslemesi de onu yazar.
 * K · MARKAYI KALDIR (Parti 3 yan bulgusu, 05.10): satirlar, liste sekmeleri
 *     ve marka kaydi TEK islemde silinir — sekmeler kaliyordu, yeniden
 *     aktarimda satirlar artik sekmeye baglaniyordu.
 *
 * INCELEME TURU (05.10, code/security/database-reviewer): bagi kopan satirda
 * eski duzeltme yeni adi golgeliyordu (A14) · eski karisik listede baska
 * firmanin satiri sahipli indekse bagli (A15) · degisen ad 500 karakter (A16)
 * · urun yalniz ad degisince okunur (A17) · eski yol aktarimi duzeltmeyi
 * ezmez (A18) · ayrismis satirda PATCH (F11) · yazimlar islemin ICINDE (A6g,
 * isaretli tx) · yeniden indeksleme yarisi (R3) · elle alan listesi yok (H3).
 *
 * Gercek LibraryService + AdminService, bellek-prisma (sema-farkinda: semada
 * olmayan alana yazim FIRLATIR — yeni kolonlar uretilmis istemcide olmali).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Prisma } from '@prisma/client';
import { LibraryService } from '../src/ozellik/kutuphane/library/library.service';
import { AdminService } from '../src/ozellik/kutuphane/admin/admin.service';
import { buildProductIndex, INDEX_VERSION, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { turetilmisIndeksAlanlari } from '../src/ozellik/kutuphane/urun-indeksi-alanlari';
import { bellekPrisma, type BellekPrisma } from './yardimci/bellek-prisma';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateLibraryItemDto } from '../src/ozellik/kutuphane/library/dto/create-library-item.dto';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const js = (x: unknown) => JSON.stringify(x);
/** Anahtar SIRASINDAN bağımsız satır karşılaştırması (create dönüşü ≠ saklanan satırın sırası). */
const kanonik = (o: Record<string, unknown> | undefined) => JSON.stringify(Object.keys(o ?? {}).sort().map((k) => [k, o![k]]));

const KA = { userId: 'u-a', firmaId: 'f-a' } as any;
const KA2 = { userId: 'u-a2', firmaId: 'f-a' } as any; // ayni firmanin BASKA uyesi
const KB = { userId: 'u-b', firmaId: 'f-b' } as any;
const HAVUZ_MARKA = 'b-havuz';
const HAVUZ_LISTE = 'pl-havuz';

// Turetilmis alanlar SEMADAN ve buildProductIndex'ten turetilir (elle liste YOK):
// biri yeni alan ekleyip yardimciyi unutursa H1 kizarir.
const PI_ALANLARI = new Set(Prisma.dmmf.datamodel.models.find((m) => m.name === 'ProductIndex')!.fields.map((f) => f.name));
function kolonlar(c: Partial<ProductColumns> & { ad: string }): ProductColumns {
  return {
    kategori: null, cins: null, baglanti: null, cap: null, boy: null, birim: null, price: 0, paraBirimi: 'TRY',
    urunKodu: null, not: null, sheetName: 'Havuz', sourceRow: 0, sortOrder: 0, ...c,
  };
}
const TURETILMIS = Object.keys(buildProductIndex(kolonlar({ ad: 'PVC Boru' })))
  .filter((a) => PI_ALANLARI.has(a) && a !== 'rowKey').sort();

/** ProductIndex satirindan ham kolonlar (yeniden indeksleme + yeniden adlandirma ile AYNI esleme). */
function piKolonlari(pi: any): ProductColumns {
  return {
    kategori: pi.kategori, ad: pi.ad, cins: pi.cins, baglanti: pi.baglanti, cap: pi.capRaw, boy: pi.boyMm,
    birim: pi.birim, price: pi.price, paraBirimi: pi.currency, urunKodu: pi.urunKodu, not: pi.not,
    sheetName: pi.sheetName, sourceRow: pi.sourceRow, sortOrder: pi.sortOrder,
  };
}
/** PI'nin turetilmis alanlarindan buildProductIndex'in hesabina UYMAYANLAR. */
function turetilmisFarki(pi: any, beklenen = buildProductIndex(piKolonlari(pi)) as any): string[] {
  return TURETILMIS.filter((a) => js(pi[a]) !== js(beklenen[a]));
}

interface Dunya {
  db: BellekPrisma;
  svc: LibraryService;
  ogrenme: Array<{ aliases: Array<{ adBucket: string; canonical: string }>; userId: string | null | undefined }>;
  /** `$transaction(fn)` geri cagrisinin `tx` uzerinden yaptigi cagrilar (model.islem). */
  islemIci: string[];
}

/**
 * ISLEM IZI (P4b incelemesi M3a): bellek-prisma `$transaction(fn)`e kuresel
 * istemciyi verir ve hatada TUM tablolari geri yukler — geri cagri `tx` yerine
 * dis istemciyle yazsa da (gercek Prisma'da islem DISI, geri alinmaz) test
 * ayirt edemezdi. Bu sarmalayici geri cagriya ISARETLI istemci verir; yalniz
 * `tx` uzerinden yapilan cagrilar `islemIci`ne duser.
 */
function islemIzli(istemci: any, islemIci: string[]): any {
  const isaretle = (tx: any) => new Proxy(tx, {
    get(t, model) {
      const m = t[model];
      if (typeof model !== 'string' || model.startsWith('$') || !m || typeof m !== 'object') return m;
      return new Proxy(m, {
        get(mt, islem) {
          const fn = mt[islem];
          if (typeof fn !== 'function') return fn;
          return (args: unknown) => { islemIci.push(`${model}.${String(islem)}`); return fn(args); };
        },
      });
    },
  });
  return new Proxy(istemci, {
    get(t, ad) {
      if (ad === '$transaction') {
        return (x: any) => (typeof x === 'function' ? t.$transaction((tx: any) => x(isaretle(tx))) : t.$transaction(x));
      }
      return t[ad];
    },
  });
}

async function dunyaKur(): Promise<Dunya> {
  const db = bellekPrisma();
  const p = db.istemci;
  for (const f of ['f-a', 'f-b']) await p.firma.create({ data: { id: f, ad: f } });
  await p.user.create({ data: { id: 'u-a', email: 'a@ornek.test', password: 'x', firmaId: 'f-a' } });
  await p.user.create({ data: { id: 'u-a2', email: 'a2@ornek.test', password: 'x', firmaId: 'f-a' } });
  await p.user.create({ data: { id: 'u-b', email: 'b@ornek.test', password: 'x', firmaId: 'f-b' } });
  await p.brand.create({ data: { id: HAVUZ_MARKA, name: 'Havuz Marka' } });
  await p.priceList.create({ data: { id: HAVUZ_LISTE, name: 'Havuz Liste', brandId: HAVUZ_MARKA } });
  const ogrenme: Dunya['ogrenme'] = [];
  const terminoloji = {
    learnFamilyAliases: async (aliases: any[], userId?: string | null) => {
      ogrenme.push({ aliases, userId });
      return { ogrenilen: aliases.length };
    },
  };
  const islemIci: string[] = [];
  return { db, svc: new LibraryService(islemIzli(p, islemIci), terminoloji as any), ogrenme, islemIci };
}

/** Indeksli urun (admin ice-aktarim deseni). Varsayilan havuz (sahipsiz). */
async function urunKur(
  d: Dunya, id: string, c: ProductColumns,
  yer: { brandId?: string; priceListId?: string; ownerUserId?: string | null; ownerFirmaId?: string | null } = {},
): Promise<void> {
  const idx = buildProductIndex(c);
  await d.db.istemci.productIndex.create({
    data: {
      id, brandId: yer.brandId ?? HAVUZ_MARKA, priceListId: yer.priceListId ?? HAVUZ_LISTE,
      ownerUserId: yer.ownerUserId ?? null, ownerFirmaId: yer.ownerFirmaId ?? null,
      kategori: c.kategori, ad: c.ad, cins: c.cins, baglanti: c.baglanti, capRaw: c.cap, boyMm: null,
      birim: c.birim, price: c.price, currency: c.paraBirimi ?? 'TRY', urunKodu: c.urunKodu, not: c.not,
      sheetName: c.sheetName, sourceRow: c.sourceRow ?? 0, sortOrder: c.sortOrder ?? 0,
      ...turetilmisIndeksAlanlari(idx), rowKey: idx.rowKey,
    },
  });
}

async function havuzKur(d: Dunya): Promise<void> {
  await urunKur(d, 'pi-kv', kolonlar({ ad: 'Küresel Vana', cins: 'Pirinç', cap: '1"', price: 100, sourceRow: 0, sortOrder: 0 }));
  await urunKur(d, 'pi-kb', kolonlar({ ad: 'Kelebek Vana', cap: 'DN50', price: 50, paraBirimi: 'EUR', sourceRow: 1, sortOrder: 1 }));
  await urunKur(d, 'pi-ppr', kolonlar({ ad: 'PPR Boru', cap: '20', price: 10, sourceRow: 2, sortOrder: 2 }));
}
const aktar = (d: Dunya, k: any) => d.svc.importPriceList(k, { brandId: HAVUZ_MARKA, priceListId: HAVUZ_LISTE });
const satir = (d: Dunya, firmaId: string, piId: string) =>
  d.db.tablo('UserLibrary').find((r) => r.firmaId === firmaId && r.productIndexId === piId)!;
const pi = (d: Dunya, id: string) => d.db.tablo('ProductIndex').find((r) => r.id === id)!;
async function izgara(d: Dunya, k: any, brandId: string): Promise<any[]> {
  const s: any = await d.svc.getBrandSheets(k, brandId);
  return s.sheets.sheets[0].rowData.filter((r: any) => r._isDataRow);
}
const izgaraSatiri = async (d: Dunya, k: any, brandId: string, ulId: string) =>
  (await izgara(d, k, brandId)).find((r) => r._libraryItemId === ulId);
/** Son UserLibrary.update cagrisinin verisi (yazilan alanlar). */
function sonSatirYazimi(d: Dunya, izBas: number): Record<string, unknown> | undefined {
  const iz = d.db.izler.slice(izBas).filter((i) => i.model === 'UserLibrary' && i.islem === 'update');
  return iz[iz.length - 1]?.args?.data;
}
const indeksYazimi = (d: Dunya, izBas: number) =>
  d.db.izler.slice(izBas).filter((i) => i.model === 'ProductIndex' && ['update', 'updateMany', 'upsert', 'create'].includes(i.islem));

// ═══ H — tek alan listesi ═════════════════════════════════════════════════
function hBlogu(): void {
  console.log('\n── H · türetilmiş alan listesi TEK yerde ──');
  const idx = buildProductIndex(kolonlar({ ad: 'Tip A', kategori: 'Küresel Vanalar', cap: 'DN50', price: 1 }));
  const yaz = turetilmisIndeksAlanlari(idx) as Record<string, unknown>;
  check('H0 ÖLÇÜT: şemadan türeyen liste 16 alan, selfFamily (şemada yok) ve rowKey dışarıda',
    TURETILMIS.length === 16 && !TURETILMIS.includes('selfFamily') && !TURETILMIS.includes('rowKey'), js(TURETILMIS));
  check('H1 ⭐ yardımcı TAM olarak buildProductIndex ∩ şema − rowKey alanlarını yazar',
    js(Object.keys(yaz).sort()) === js(TURETILMIS), `${js(Object.keys(yaz).sort())} ≠ ${js(TURETILMIS)}`);
  check('H2 her alanın değeri buildProductIndex\'inkiyle aynı (alan kayması yok)',
    TURETILMIS.every((a) => js(yaz[a]) === js((idx as any)[a])), js(yaz));

  // H3 — KAYNAK KAPISI: kütüphane klasöründe ProductIndex'e türetilmiş alanı
  // ELLE yazan kalmadı (yönetici içe aktarımı iki upsert, yeniden indeksleme,
  // manuel oluşturma, sahipli yeniden adlandırma hepsi yardımcıdan). Desen
  // `adSlug: idx.adSlug` / `malzemeler: f.malzemeler` biçimi; yardımcının kendisi hariç.
  const kok = path.join(__dirname, '../src/ozellik/kutuphane');
  const dosyalar: string[] = [];
  const gez = (k: string) => {
    for (const e of fs.readdirSync(k, { withFileTypes: true })) {
      const y = path.join(k, e.name);
      if (e.isDirectory()) gez(y);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('urun-indeksi-alanlari.ts')) dosyalar.push(y);
    }
  };
  gez(kok);
  // adSlug/belirsiz/indexVersion/adBucket yazim DISI baglamlarda da gecer
  // (rebuildIndexFields girdisi, kosullu yazimin where'i, alias ogrenme) — desen
  // yalniz turetilmis LISTEYE ozgu 12 alanla; elle yazilmis liste bunlarin cogunu icerir.
  const listeyeOzgu = TURETILMIS.filter((a) => !['adSlug', 'belirsiz', 'indexVersion', 'adBucket'].includes(a));
  const desen = new RegExp(`\\b(${listeyeOzgu.join('|')})\\s*:\\s*[A-Za-z_$][\\w$]*\\.\\1\\b`);
  const elle = dosyalar.flatMap((y) => fs.readFileSync(y, 'utf8').split('\n')
    .map((l, i) => ({ y: path.relative(kok, y), i: i + 1, l: l.trim() }))
    .filter((s) => !s.l.startsWith('//') && !s.l.startsWith('*') && desen.test(s.l)));
  check('H3 ⭐ kütüphanede türetilmiş alanı elle yazan ProductIndex yazıcısı YOK (hepsi yardımcıdan)',
    dosyalar.length > 20 && elle.length === 0,
    `${dosyalar.length} dosya · ${js(elle.map((s) => `${s.y}:${s.i} ${s.l.slice(0, 60)}`))}`);
}

// ═══ M — manuel ürün türetilmiş alanları (yan bulgu) ═══════════════════════
async function mBlogu(): Promise<void> {
  console.log('\n── M · manuel ürün indeksi S4/S5 alanlarını da yazar ──');
  const d = await dunyaKur();
  const mb = await d.svc.createManualBrand(KA, {
    brandName: 'Kendi Marka',
    rows: [
      { ad: 'PVC Boru', cap: '50', birim: 'm', price: 12, currency: 'EUR' },
      { ad: 'Tip A', kategori: 'Küresel Vanalar', cap: 'DN50', price: 30 },
    ],
  } as any);
  const pis = d.db.tablo('ProductIndex').filter((r) => r.brandId === mb.brandId).sort((a, b) => a.sortOrder - b.sortOrder);
  const [pvc, tip] = pis;
  check('M0 FIXTURE: iki sahipli ürün; hesap boş değil (PVC → [pvc], kategoriden aile → aileZayif)',
    pis.length === 2 && pis.every((r) => r.ownerFirmaId === 'f-a') &&
      js(buildProductIndex(piKolonlari(pvc)).malzemeler) === js(['pvc']) && buildProductIndex(piKolonlari(tip)).aileZayif === true,
    js(pis.map((r) => [r.ad, r.malzemeler, r.aileZayif])));
  check('M1 ⭐ PVC ürününün malzemesi indekste (varsayılan [] değil)', js(pvc?.malzemeler) === js(['pvc']), js(pvc?.malzemeler));
  check('M2 ⭐ kategoriden gelen aile zayıf işaretli (varsayılan false değil)', tip?.aileZayif === true, js(tip?.aileZayif));
  check('M3 tüm türetilmiş alanlar buildProductIndex hesabıyla aynı',
    turetilmisFarki(pvc).length === 0 && turetilmisFarki(tip).length === 0, js([turetilmisFarki(pvc), turetilmisFarki(tip)]));
}

// ═══ F — özel fiyat birimi (C3) ════════════════════════════════════════════
async function fBlogu(): Promise<void> {
  console.log('\n── F · özel fiyat girildiği birimde kalır (C3) ──');
  const d = await dunyaKur();
  await havuzKur(d);
  await aktar(d, KA);
  await aktar(d, KB);
  const kv = satir(d, 'f-a', 'pi-kv');
  const kb = satir(d, 'f-a', 'pi-kb');
  const ppr = satir(d, 'f-a', 'pi-ppr');
  check('F0 FIXTURE: aktarım satırları özel fiyatsız, birim alanı boş; liste birimi TRY / EUR',
    [kv, kb, ppr].every((r) => r && r.customPrice == null && r.customPriceCurrency == null) &&
      kv.currency === 'TRY' && kb.currency === 'EUR',
    js([kv, kb, ppr].map((r) => r && [r.currency, r.customPrice, r.customPriceCurrency])));

  // F1 — manuel satır: özel fiyat liste birimiyle doğar
  const mb = await d.svc.createManualBrand(KA, {
    brandName: 'Kendi Marka',
    rows: [{ ad: 'Zıbırtı Aparatı', price: 7, currency: 'USD' }, { ad: 'Tip 3', price: 3 }],
  } as any);
  const manuel = d.db.tablo('UserLibrary').filter((r) => r.brandId === mb.brandId).sort((a, b) => a.sortOrder - b.sortOrder);
  check('F1 manuel satır: özel fiyat liste birimiyle doğar (USD → USD, birimsiz → TRY)',
    manuel.length === 2 && manuel[0].customPrice === 7 && manuel[0].customPriceCurrency === 'USD' &&
      manuel[1].customPrice === 3 && manuel[1].customPriceCurrency === 'TRY',
    js(manuel.map((r) => [r.customPrice, r.currency, r.customPriceCurrency])));

  // F2 — tekil oluşturma
  const e1: any = await d.svc.create(KA, { materialName: 'Elle Kalem', brandId: HAVUZ_MARKA, customPrice: 40 } as any);
  const e2: any = await d.svc.create(KA, { materialName: 'Elle Kalem 2', brandId: HAVUZ_MARKA } as any);
  check('F2 tekil oluşturma: özel fiyatlı → TRY (satırın birimi), özel fiyatsız → boş',
    e1.customPriceCurrency === 'TRY' && e1.currency === 'TRY' && e2.customPriceCurrency == null,
    js([e1.customPriceCurrency, e1.currency, e2.customPriceCurrency]));

  // F3 — PATCH: özel fiyat GÖSTERİLEN birimde; silinince birim de gider
  await d.svc.update(KA, kb.id, { customPrice: 45 } as any);
  const kb1 = { ...satir(d, 'f-a', 'pi-kb') };
  await d.svc.update(KA, kb.id, { customPrice: null } as any);
  const kb2 = { ...satir(d, 'f-a', 'pi-kb') };
  check('F3 ⭐ PATCH özel fiyat EUR satırında EUR\'ya donar (liste fiyatı 50 kalır)',
    kb1.customPrice === 45 && kb1.customPriceCurrency === 'EUR' && kb1.listPrice === 50, js(kb1));
  check('F3b özel fiyat silinince birimi de silinir', kb2.customPrice == null && kb2.customPriceCurrency == null, js(kb2));

  // F4 — ızgara fiyat düzenlemesi (aynı birim): özel + liste fiyatı yazılır, birim donar
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: kv.id, listPrice: 120 }]);
  const kv1 = { ...satir(d, 'f-a', 'pi-kv') };
  check('F4 ⭐ ızgarada 120 TRY: özel fiyat 120, birimi TRY, liste fiyatı da 120 (aynı birim)',
    kv1.customPrice === 120 && kv1.customPriceCurrency === 'TRY' && kv1.listPrice === 120, js(kv1));

  // F5 — havuz birimi değişir (100 TRY → 90 EUR) ve yeniden aktarılır
  await d.db.istemci.productIndex.update({ where: { id: 'pi-kv' }, data: { price: 90, currency: 'EUR' } });
  await aktar(d, KA);
  const kv2 = { ...satir(d, 'f-a', 'pi-kv') };
  check('F5 ⭐ yeniden aktarım liste fiyatını/birimini yeniler, özel fiyata ve BİRİMİNE dokunmaz',
    kv2.listPrice === 90 && kv2.currency === 'EUR' && kv2.customPrice === 120 && kv2.customPriceCurrency === 'TRY', js(kv2));
  const g5 = await izgaraSatiri(d, KA, HAVUZ_MARKA, kv.id);
  check('F5b ⭐ ızgara 120\'yi KENDİ biriminde gösterir (TRY, "120 €" değil)',
    g5?.col3 === 120 && g5?._currency === 'TRY', js(g5 && { col3: g5.col3, _currency: g5._currency }));
  check('F5c ayrışma işareti iki birimi de taşır (özel 120 TRY · havuz 90 EUR)',
    js(g5?._fiyatAyrisik) === js({ ozel: 120, havuz: 90, ozelBirim: 'TRY', havuzBirim: 'EUR' }), js(g5?._fiyatAyrisik));

  // F6 — birimler ayrıyken fiyat düzenlemesi: liste fiyatına yabancı birimli sayı yazılmaz
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: kv.id, listPrice: 130 }]);
  const kv3 = { ...satir(d, 'f-a', 'pi-kv') };
  check('F6 ⭐ 130 (gösterilen birim TRY) özel fiyata yazılır; EUR liste fiyatı 90 KALIR',
    kv3.customPrice === 130 && kv3.customPriceCurrency === 'TRY' && kv3.listPrice === 90 && kv3.currency === 'EUR', js(kv3));

  // F7 — yalnız iskonto (ön yüz ekrandaki fiyatı da yollar): fiyat alanlarına dokunulmaz (K1)
  const iz7 = d.db.izler.length;
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: kv.id, listPrice: 130, discountRate: 7 }]);
  const y7 = sonSatirYazimi(d, iz7) ?? {};
  check('F7 KORUMA: yalnız iskonto değişince fiyat ve birim alanları YAZILMAZ',
    y7.discountRate === 7 && !('customPrice' in y7) && !('customPriceCurrency' in y7) && !('listPrice' in y7), js(y7));

  // F11 — PATCH birimleri AYRIŞMIŞ satırda: özel fiyat gösterilen birimde (TRY) kalır
  await d.svc.update(KA, kv.id, { customPrice: 140 } as any);
  const kv4 = { ...satir(d, 'f-a', 'pi-kv') };
  check('F11 ⭐ PATCH ayrışmış satırda gösterilen birimi (TRY) korur; EUR liste fiyatı 90 kalır',
    kv4.customPrice === 140 && kv4.customPriceCurrency === 'TRY' && kv4.listPrice === 90 && kv4.currency === 'EUR', js(kv4));

  // F8 — göç öncesi / yedekten dönen satır: birim alanı boş → liste birimine düşer
  await d.db.istemci.userLibrary.update({ where: { id: ppr.id }, data: { currency: 'USD', customPrice: 11, customPriceCurrency: null } });
  const g8 = await izgaraSatiri(d, KA, HAVUZ_MARKA, ppr.id);
  check('F8 eski satır (birim alanı boş): gösterilen birim liste birimi, ayrışma birimsiz',
    g8?.col3 === 11 && g8?._currency === 'USD' && js(g8?._fiyatAyrisik) === js({ ozel: 11, havuz: 10 }),
    js(g8 && { col3: g8.col3, _currency: g8._currency, ay: g8._fiyatAyrisik }));
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: ppr.id, listPrice: 12 }]);
  const ppr1 = { ...satir(d, 'f-a', 'pi-ppr') };
  check('F8b eski satırda düzenleme birimi gösterilen birime (USD) dondurur, liste fiyatı da yazılır',
    ppr1.customPrice === 12 && ppr1.customPriceCurrency === 'USD' && ppr1.listPrice === 12, js(ppr1));

  // F9 — yazım farkı aynı birim: 'TL' = 'TRY'
  await d.db.istemci.userLibrary.update({ where: { id: ppr.id }, data: { currency: 'TL', customPrice: 15, listPrice: 15, customPriceCurrency: 'TRY' } });
  const g9 = await izgaraSatiri(d, KA, HAVUZ_MARKA, ppr.id);
  check('F9 \'TL\' ile \'TRY\' AYNI birim: ayrışma işareti yok', g9 != null && g9._fiyatAyrisik === undefined, js(g9?._fiyatAyrisik));
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: ppr.id, listPrice: 16 }]);
  const ppr2 = { ...satir(d, 'f-a', 'pi-ppr') };
  check('F9b \'TRY\' özel fiyat düzenlemesi \'TL\' liste fiyatını da yazar (aynı birim)',
    ppr2.customPrice === 16 && ppr2.listPrice === 16 && ppr2.customPriceCurrency === 'TRY', js(ppr2));

  const bkv = satir(d, 'f-b', 'pi-kv');
  check('F10 KİRACI: A\'nın düzenlemeleri B\'nin aynı ürün satırına dokunmaz',
    bkv.customPrice == null && bkv.customPriceCurrency == null && bkv.listPrice === 100 && bkv.currency === 'TRY', js(bkv));
}

// ═══ A — ad düzeltmesi (C7) ════════════════════════════════════════════════
async function aBlogu(): Promise<void> {
  console.log('\n── A · ad düzeltmesi: sahipli → indeks, ortak → kullaniciAdi (C7) ──');
  const d = await dunyaKur();
  await havuzKur(d);
  await aktar(d, KA);
  await aktar(d, KB);
  const kv = satir(d, 'f-a', 'pi-kv');
  const piKvOnce = { ...pi(d, 'pi-kv') };
  check('A0 FIXTURE: ortak satır havuz adını gösteriyor (adRaw = havuz adı), kullaniciAdi boş',
    kv.adRaw === 'Küresel Vana' && kv.kullaniciAdi == null && piKvOnce.ownerFirmaId == null, js(kv));

  // A1 — ön yüz adı HER kirli satırda yollar: değişmeyen ad düzeltme DEĞİL
  let iz = d.db.izler.length;
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: kv.id, materialName: 'Küresel Vana', discountRate: 5 }]);
  const y1 = sonSatirYazimi(d, iz) ?? {};
  check('A1 ⭐ gösterilen ad aynen gelince ad alanları YAZILMAZ (kullaniciAdi doğmaz), iskonto yazılır',
    y1.discountRate === 5 && !('kullaniciAdi' in y1) && !('materialName' in y1) && !('adRaw' in y1) &&
      satir(d, 'f-a', 'pi-kv').kullaniciAdi == null && indeksYazimi(d, iz).length === 0, js(y1));

  // A2 — ortak üründe düzeltme: kullaniciAdi, havuz indeksi DEĞİŞMEZ, B etkilenmez
  iz = d.db.izler.length;
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: kv.id, materialName: '  Küresel Vana Tam Geçişli ' }]);
  const kv2 = { ...satir(d, 'f-a', 'pi-kv') };
  check('A2 ⭐ ortak ürün: düzeltme kullaniciAdi\'na (kırpılmış) yazılır',
    kv2.kullaniciAdi === 'Küresel Vana Tam Geçişli' && kv2.materialName === 'Küresel Vana Tam Geçişli', js(kv2));
  check('A2b ⭐ havuz indeksi DEĞİŞMEZ (başka firma etkilenmez): hiç indeks yazımı yok, ad/displayName/adSlug aynı',
    indeksYazimi(d, iz).length === 0 && js(pi(d, 'pi-kv')) === js(piKvOnce), js(indeksYazimi(d, iz).map((i) => i.islem)));
  const gA = await izgaraSatiri(d, KA, HAVUZ_MARKA, kv.id);
  const bkv = satir(d, 'f-b', 'pi-kv');
  const gB = await izgaraSatiri(d, KB, HAVUZ_MARKA, bkv.id);
  check('A2c ızgara: A düzeltilmiş adı, B havuz adını görür',
    gA?.col1 === 'Küresel Vana Tam Geçişli' && gB?.col1 === 'Küresel Vana' && bkv.kullaniciAdi == null,
    js([gA?.col1, gB?.col1, bkv.kullaniciAdi]));

  // A3 — yeniden aktarım düzeltmeyi EZMEZ
  await aktar(d, KA);
  const kv3 = { ...satir(d, 'f-a', 'pi-kv') };
  const g3 = await izgaraSatiri(d, KA, HAVUZ_MARKA, kv.id);
  check('A3 ⭐ yeniden aktarım kaynak adı yeniler (adRaw), kullaniciAdi KALIR ve ızgarada o görünür',
    kv3.adRaw === 'Küresel Vana' && kv3.kullaniciAdi === 'Küresel Vana Tam Geçişli' && g3?.col1 === 'Küresel Vana Tam Geçişli',
    js([kv3.adRaw, kv3.kullaniciAdi, g3?.col1]));

  // A4 — düzeltilmiş ad aynen geri gelir (iskonto kaydı): hiçbir ad alanı yazılmaz
  iz = d.db.izler.length;
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: kv.id, materialName: 'Küresel Vana Tam Geçişli', discountRate: 9 }]);
  const y4 = sonSatirYazimi(d, iz) ?? {};
  check('A4 düzeltilmiş ad değişmeden gelince ad alanları yazılmaz, düzeltme korunur',
    !('kullaniciAdi' in y4) && !('adRaw' in y4) && !('materialName' in y4) &&
      satir(d, 'f-a', 'pi-kv').kullaniciAdi === 'Küresel Vana Tam Geçişli', js(y4));

  // A5 — havuz adına dönüş düzeltmeyi temizler
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: kv.id, materialName: 'Küresel Vana' }]);
  const kv5 = { ...satir(d, 'f-a', 'pi-kv') };
  const g5 = await izgaraSatiri(d, KA, HAVUZ_MARKA, kv.id);
  check('A5 ⭐ havuz adına dönüş kullaniciAdi\'nı temizler, ızgara havuz adını gösterir',
    kv5.kullaniciAdi === null && g5?.col1 === 'Küresel Vana', js([kv5.kullaniciAdi, g5?.col1]));

  // A6 — sahipli ürün: indeksin KENDİSİ yeniden adlandırılır
  const mb = await d.svc.createManualBrand(KA, { brandName: 'Kendi Marka', rows: [{ ad: 'Özel Kollektör 3 Ağızlı', cap: '1"', price: 70 }] } as any);
  const own = d.db.tablo('UserLibrary').find((r) => r.brandId === mb.brandId)!;
  const ownPiOnce = { ...pi(d, own.productIndexId) };
  check('A6-FIXTURE sahipli ürün: firma A\'nın, sahibi u-a, adı "kolektor" ailesinde, malzemesiz',
    ownPiOnce.ownerFirmaId === 'f-a' && ownPiOnce.ownerUserId === 'u-a' && ownPiOnce.adSlug === 'kolektor' &&
      js(ownPiOnce.malzemeler) === js([]), js(ownPiOnce));
  iz = d.db.izler.length;
  d.islemIci.length = 0;
  const s6: any = await d.svc.saveBrandSheets(KA, mb.brandId, [{ libraryItemId: own.id, materialName: 'PVC Boru' }]);
  const ownPi6 = { ...pi(d, own.productIndexId) };
  const own6 = { ...d.db.tablo('UserLibrary').find((r) => r.id === own.id)! };
  check('A6 ⭐ sahipli ürün: indeksin adı yeni ad, türetilmiş alanlar yeni addan (aile boru, malzeme pvc)',
    s6.updated === 1 && ownPi6.ad === 'PVC Boru' && ownPi6.adSlug === 'boru' && js(ownPi6.malzemeler) === js(['pvc']) &&
      turetilmisFarki(ownPi6).length === 0,
    js({ s6, ad: ownPi6.ad, adSlug: ownPi6.adSlug, malz: ownPi6.malzemeler, fark: turetilmisFarki(ownPi6) }));
  check('A6b ⭐ kimlik DEĞİŞMEZ: id ve rowKey aynı (mükerrer / kopuk bağ yok)',
    ownPi6.id === ownPiOnce.id && ownPi6.rowKey === ownPiOnce.rowKey, js([ownPiOnce.rowKey, ownPi6.rowKey]));
  check('A6c sahipli üründe kullaniciAdi YAZILMAZ; satır ve ızgara yeni adı gösterir',
    own6.kullaniciAdi == null && own6.materialName === 'PVC Boru' && own6.adRaw === 'PVC Boru' &&
      (await izgaraSatiri(d, KA, mb.brandId, own.id))?.col1 === 'PVC Boru', js(own6));
  const um = indeksYazimi(d, iz);
  check('A6d KİRACI koşulu SORGUDA: indeks yazımı tek updateMany, where = { id, ownerFirmaId: f-a }',
    um.length === 1 && um[0].islem === 'updateMany' && js(um[0].args.where) === js({ id: ownPiOnce.id, ownerFirmaId: 'f-a' }),
    js(um.map((i) => [i.islem, i.args.where])));
  check('A6e sözlükte karşılığı olan ad ÖĞRENİLMEZ', d.ogrenme.length === 0, js(d.ogrenme));
  check('A6g ⭐ indeks ve satır yazımı İŞLEMİN İÇİNDE (tx üzerinden; dış istemciyle yazım geri alınmazdı)',
    js(d.islemIci) === js(['productIndex.updateMany', 'userLibrary.update']), js(d.islemIci));

  // A7 — firmanın BAŞKA üyesi sözlüksüz ada çevirir: SAHİBİN sözlüğüne öğrenilir.
  // Satırda (eski/bayat) bir kullaniciAdi da var: sahipli dal onu temizler, yoksa yeni ad görünmezdi.
  await d.db.istemci.userLibrary.update({ where: { id: own.id }, data: { kullaniciAdi: 'Bayat Düzeltme' } });
  await d.svc.saveBrandSheets(KA2, mb.brandId, [{ libraryItemId: own.id, materialName: 'Zıbırtı Aparatı' }]);
  check('A7 ⭐ sözlüksüz yeni ad ürünün SAHİBİNE (u-a) öğrenilir, düzenleyene (u-a2) değil',
    d.ogrenme.length === 1 && d.ogrenme[0].userId === 'u-a' &&
      js(d.ogrenme[0].aliases) === js([{ adBucket: 'zibirti aparati', canonical: 'Zıbırtı Aparatı' }]) &&
      pi(d, own.productIndexId).adSlug === 'zibirti aparati',
    js(d.ogrenme));
  const own7 = d.db.tablo('UserLibrary').find((r) => r.id === own.id)!;
  check('A7b sahipli dal satırdaki eski kullaniciAdi\'nı temizler; ızgara yeni adı gösterir',
    own7.kullaniciAdi === null && (await izgaraSatiri(d, KA, mb.brandId, own.id))?.col1 === 'Zıbırtı Aparatı',
    js(own7.kullaniciAdi));

  // A8 — anlamsız ad: buildProductIndex hesabı (belirsiz); eski ailenin slug'ı YAPIŞMAZ
  await d.svc.saveBrandSheets(KA, mb.brandId, [{ libraryItemId: own.id, materialName: 'X-1' }]);
  const ownPi8 = { ...pi(d, own.productIndexId) };
  check('A8 ⭐ anlamsız yeni ad: indeks belirsiz (eski "zibirti aparati" ailesi yeni ada yapıştırılmaz)',
    ownPi8.ad === 'X-1' && ownPi8.belirsiz === true && ownPi8.adSlug === 'belirsiz',
    js({ ad: ownPi8.ad, belirsiz: ownPi8.belirsiz, adSlug: ownPi8.adSlug }));

  // A9 — kişisiz (yalnız firma) sahipli ürün: ad yazılır, sözlüğe ÖĞRENİLMEZ (C5)
  await d.db.istemci.priceList.create({ data: { id: 'pl-firma', name: 'Firma Listesi', brandId: mb.brandId, ownerFirmaId: 'f-a' } });
  await urunKur(d, 'pi-firma', kolonlar({ ad: 'Tip 3', cap: '1"', price: 5, sheetName: 'Manuel' }),
    { brandId: mb.brandId, priceListId: 'pl-firma', ownerUserId: null, ownerFirmaId: 'f-a' });
  const fr = await d.db.istemci.userLibrary.create({
    data: { userId: 'u-a', firmaId: 'f-a', brandId: mb.brandId, sourcePriceListId: 'pl-firma', productIndexId: 'pi-firma',
      materialName: 'Tip 3', adRaw: 'Tip 3', listPrice: 5, currency: 'TRY' },
  });
  const ogrenmeOnce = d.ogrenme.length;
  await d.svc.saveBrandSheets(KA, mb.brandId, [{ libraryItemId: fr.id, materialName: 'Fırfır Takımı Özel' }]);
  check('A9 kişisiz sahipli ürün: indeks yeniden adlandırılır, sözlüğe ÖĞRENİLMEZ (ortak sözlüğe sızmaz)',
    pi(d, 'pi-firma').ad === 'Fırfır Takımı Özel' && d.ogrenme.length === ogrenmeOnce, js(d.ogrenme.slice(ogrenmeOnce)));

  // A10 — indeks + satır TEK işlemde: satır yazımı düşerse indeks de geri alınır
  const piOnce10 = { ...pi(d, own.productIndexId) };
  const api = d.db.istemci.userLibrary;
  const asil = api.update;
  api.update = async (args: any) => {
    if (args?.where?.id === own.id) { api.update = asil; throw new Error('ic ayrinti 7f3a'); }
    return asil(args);
  };
  const s10: any = await d.svc.saveBrandSheets(KA, mb.brandId, [{ libraryItemId: own.id, materialName: 'PPR Boru' }]);
  api.update = asil;
  check('A10 ⭐ satır yazımı düşünce indeks yeniden adlandırması GERİ ALINIR (ekran adı ≠ motor adı olmaz)',
    s10.updated === 0 && s10.errors?.length === 1 && js(pi(d, own.productIndexId)) === js(piOnce10) &&
      !js(s10).includes('ic ayrinti'),
    js({ s10, ad: pi(d, own.productIndexId).ad }));

  // A11 — indeks güncellenemezse (eşzamanlı silme/sahiplik değişimi) satır da yazılmaz
  const pim = d.db.istemci.productIndex;
  const asilUm = pim.updateMany;
  pim.updateMany = async () => { pim.updateMany = asilUm; return { count: 0 }; };
  const s11: any = await d.svc.saveBrandSheets(KA, mb.brandId, [{ libraryItemId: own.id, materialName: 'PPR Boru' }]);
  pim.updateMany = asilUm;
  const own11 = d.db.tablo('UserLibrary').find((r) => r.id === own.id)!;
  check('A11 indeks 0 satır güncellerse satır yazılmaz ve hata döner (sessiz yarım kayıt yok)',
    s11.updated === 0 && s11.errors?.length === 1 && own11.adRaw === 'X-1' && pi(d, own.productIndexId).ad === 'X-1',
    js({ s11, adRaw: own11.adRaw }));

  // A12 — (savunma) satır BAŞKA firmanın ürününe bağlıysa: o ürün sahipli SAYILMAZ, ona yazılmaz
  await urunKur(d, 'pi-b', kolonlar({ ad: 'B Ürünü', cap: '1"', price: 9 }), { ownerUserId: 'u-b', ownerFirmaId: 'f-b' });
  const yabanci = await d.db.istemci.userLibrary.create({
    data: { userId: 'u-a', firmaId: 'f-a', brandId: HAVUZ_MARKA, productIndexId: 'pi-b', materialName: 'B Ürünü',
      adRaw: 'B Ürünü', listPrice: 9, currency: 'TRY' },
  });
  const piBOnce = { ...pi(d, 'pi-b') };
  iz = d.db.izler.length;
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: yabanci.id, materialName: 'A\'nın Adı' }]);
  check('A12 başka firmanın ürünü: indeksine YAZILMAZ, düzeltme yalnız A\'nın kullaniciAdi\'nda',
    indeksYazimi(d, iz).length === 0 && js(pi(d, 'pi-b')) === js(piBOnce) &&
      d.db.tablo('UserLibrary').find((r) => r.id === yabanci.id)?.kullaniciAdi === 'A\'nın Adı',
    js(indeksYazimi(d, iz).map((i) => i.args)));

  // A13 — indekssiz satır: iki ad alanı (motor indekssiz satırda materialName
  // okur) + kullaniciAdi (aktarım adRaw/materialName'i yeniden yazar, düzeltme kalmalı)
  const eski = await d.db.istemci.userLibrary.create({
    data: { userId: 'u-a', firmaId: 'f-a', brandId: HAVUZ_MARKA, materialName: 'Eski Kalem', adRaw: 'Eski Kalem', listPrice: 3, currency: 'TRY' },
  });
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: eski.id, materialName: 'Eski Kalem Yeni' }]);
  const eski1 = d.db.tablo('UserLibrary').find((r) => r.id === eski.id)!;
  check('A13 indekssiz satır: iki ad alanı + kullaniciAdi yazılır',
    eski1.materialName === 'Eski Kalem Yeni' && eski1.adRaw === 'Eski Kalem Yeni' && eski1.kullaniciAdi === 'Eski Kalem Yeni', js(eski1));

  // A14 (inceleme H1) — düzeltmesi olan ortak satırın ürünü silinir (indeks bağı SetNull):
  // yeni ad, eski kullaniciAdi'nın ARKASINDA kalmamalı ("Kaydedildi" deyip ad değişmiyordu)
  const ppr = satir(d, 'f-a', 'pi-ppr');
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: ppr.id, materialName: 'PPR Boru Özel' }]);
  const ppr0 = { ...d.db.tablo('UserLibrary').find((r) => r.id === ppr.id)! };
  await d.db.istemci.productIndex.delete({ where: { id: 'pi-ppr' } });
  const pprKopuk = { ...d.db.tablo('UserLibrary').find((r) => r.id === ppr.id)! };
  check('A14-FIXTURE düzeltme yazıldı, ürün silinince satırın indeks bağı koptu (SetNull)',
    ppr0.kullaniciAdi === 'PPR Boru Özel' && pprKopuk.productIndexId === null && pprKopuk.kullaniciAdi === 'PPR Boru Özel',
    js({ once: ppr0.kullaniciAdi, bag: pprKopuk.productIndexId }));
  const s14: any = await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: ppr.id, materialName: 'PPR Boru Yeni' }]);
  check('A14 ⭐ bağı kopan satırda yeni ad ızgarada GÖRÜNÜR (eski düzeltme gölgelemez)',
    s14.updated === 1 && (await izgaraSatiri(d, KA, HAVUZ_MARKA, ppr.id))?.col1 === 'PPR Boru Yeni',
    js({ s14, satir: d.db.tablo('UserLibrary').find((r) => r.id === ppr.id) }));

  // A15 (inceleme M2) — eski karışık liste: sahipli indekse BAŞKA firmanın satırı da bağlı.
  // Yeniden adlandırma o firmanın motor girdisini de değiştirirdi → indeks ortak sayılır.
  await d.db.istemci.priceList.create({ data: { id: 'pl-karisik', name: 'Eski Kişisel', brandId: HAVUZ_MARKA } });
  await urunKur(d, 'pi-karisik', kolonlar({ ad: 'Karışık Ürün', cap: '1"', price: 4 }),
    { priceListId: 'pl-karisik', ownerUserId: 'u-a', ownerFirmaId: 'f-a' });
  const kA = await d.db.istemci.userLibrary.create({ data: { userId: 'u-a', firmaId: 'f-a', brandId: HAVUZ_MARKA,
    sourcePriceListId: 'pl-karisik', productIndexId: 'pi-karisik', materialName: 'Karışık Ürün', adRaw: 'Karışık Ürün', listPrice: 4, currency: 'TRY' } });
  const kB = await d.db.istemci.userLibrary.create({ data: { userId: 'u-b', firmaId: 'f-b', brandId: HAVUZ_MARKA,
    sourcePriceListId: 'pl-karisik', productIndexId: 'pi-karisik', materialName: 'Karışık Ürün', adRaw: 'Karışık Ürün', listPrice: 4, currency: 'TRY' } });
  const piKarisikOnce = { ...pi(d, 'pi-karisik') };
  iz = d.db.izler.length;
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: kA.id, materialName: 'A\'nın Karışık Adı' }]);
  check('A15 ⭐ başka firmanın da bağlı olduğu sahipli indeks YENİDEN ADLANDIRILMAZ; düzeltme A\'nın kullaniciAdi\'nda',
    indeksYazimi(d, iz).length === 0 && js(pi(d, 'pi-karisik')) === js(piKarisikOnce) &&
      d.db.tablo('UserLibrary').find((r) => r.id === kA.id)?.kullaniciAdi === 'A\'nın Karışık Adı' &&
      kanonik(d.db.tablo('UserLibrary').find((r) => r.id === kB.id)) === kanonik(kB),
    js(indeksYazimi(d, iz).map((i) => i.args)));
  // A15b — firması ATANMAMIŞ (NULL) bir satır da "başka" sayılır (SQL '<>' NULL'u dışarıda bırakırdı)
  await urunKur(d, 'pi-atanmamis', kolonlar({ ad: 'Atanmamış Ürün', cap: '1"', price: 4, sourceRow: 1 }),
    { priceListId: 'pl-karisik', ownerUserId: 'u-a', ownerFirmaId: 'f-a' });
  const nA = await d.db.istemci.userLibrary.create({ data: { userId: 'u-a', firmaId: 'f-a', brandId: HAVUZ_MARKA,
    productIndexId: 'pi-atanmamis', materialName: 'Atanmamış Ürün', adRaw: 'Atanmamış Ürün', listPrice: 4, currency: 'TRY' } });
  await d.db.istemci.userLibrary.create({ data: { userId: 'u-b', firmaId: null, brandId: HAVUZ_MARKA,
    productIndexId: 'pi-atanmamis', materialName: 'Atanmamış Ürün', adRaw: 'Atanmamış Ürün', listPrice: 4, currency: 'TRY' } });
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: nA.id, materialName: 'Atanmamış Yeni Ad' }]);
  check('A15b firması atanmamış bağlı satır varken de indeks yeniden adlandırılmaz',
    pi(d, 'pi-atanmamis').ad === 'Atanmamış Ürün' &&
      d.db.tablo('UserLibrary').find((r) => r.id === nA.id)?.kullaniciAdi === 'Atanmamış Yeni Ad',
    js(pi(d, 'pi-atanmamis').ad));

  // A16 (güvenlik incelemesi MEDIUM-1) — değişen ad 500 karakteri aşamaz (indeks hesabı adla karesel büyür)
  const piA16Once = { ...pi(d, own.productIndexId) };
  const uzunAd = (n: number) => `KV${'x'.repeat(n - 2)}`;
  iz = d.db.izler.length;
  const s16: any = await d.svc.saveBrandSheets(KA, mb.brandId, [{ libraryItemId: own.id, materialName: uzunAd(501), discountRate: 3 }]);
  // (UserBrandLibrary.upsert her kayıtta görünümü yeniden kurar — veri yazımı değil)
  const yazim16 = d.db.izler.slice(iz).filter((i) =>
    ['UserLibrary', 'ProductIndex'].includes(i.model) && ['update', 'updateMany', 'upsert', 'create'].includes(i.islem));
  check('A16 ⭐ 501 karakterlik yeni ad reddedilir ("en fazla 500"), satır ve indekse HİÇ yazılmaz',
    s16.updated === 0 && s16.errors?.[0]?.error === 'Malzeme adı en fazla 500 karakter olabilir.' && yazim16.length === 0 &&
      js(pi(d, own.productIndexId)) === js(piA16Once),
    js({ s16, yazim: yazim16.map((i) => `${i.model}.${i.islem}`) }));
  const s16b: any = await d.svc.saveBrandSheets(KA, mb.brandId, [{ libraryItemId: own.id, materialName: uzunAd(500) }]);
  check('A16b tam 500 karakter kabul edilir (sınır dahil)',
    s16b.updated === 1 && pi(d, own.productIndexId).ad.length === 500, js({ s16b, uz: pi(d, own.productIndexId).ad.length }));
  // Sınırdan UZUN eski bir ad (sınırdan önce yazılmış) DEĞİŞMEDEN gelirse fiyat düzenlemesi reddedilmez
  const eskiUzun = await d.db.istemci.userLibrary.create({
    data: { userId: 'u-a', firmaId: 'f-a', brandId: HAVUZ_MARKA, materialName: uzunAd(800), adRaw: uzunAd(800), listPrice: 3, currency: 'TRY' },
  });
  const s16c: any = await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: eskiUzun.id, materialName: uzunAd(800), listPrice: 4 }]);
  check('A16c sınırdan uzun ESKİ ad değişmeden gelince fiyat düzenlemesi geçer (sınır yalnız değişen adda)',
    s16c.updated === 1 && d.db.tablo('UserLibrary').find((r) => r.id === eskiUzun.id)?.customPrice === 4, js(s16c));

  // A17 (inceleme L3/DB M3) — ad değişmeyen kayıtta ürün OKUNMAZ (toplu iskontoda satır başına sorgu yok)
  const kvA17 = satir(d, 'f-a', 'pi-kv');
  iz = d.db.izler.length;
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: kvA17.id, materialName: 'Küresel Vana', discountRate: 11 }]);
  const okumalar = d.db.izler.slice(iz).filter((i) =>
    i.model === 'ProductIndex' || (i.model === 'UserLibrary' && i.islem === 'findFirst' && i.args?.include?.product));
  check('A17 ad değişmeyen satırda ProductIndex okunmaz (findFirst include yok, ayrı sorgu yok)',
    okumalar.length === 0 && satir(d, 'f-a', 'pi-kv').discountRate === 11, js(okumalar.map((i) => `${i.model}.${i.islem}`)));

  // A18 (DB incelemesi MEDIUM-2) — indekssiz ESKİ YOL aktarımı: yeniden aktarım adRaw/materialName'i
  // yeniden yazar; düzeltme kullaniciAdi'nda KALIR
  await d.db.istemci.priceList.create({ data: { id: 'pl-eski', name: 'Eski Yol Listesi', brandId: HAVUZ_MARKA } });
  await d.db.istemci.material.create({ data: { id: 'mat-eski', name: 'Eski Vana' } });
  await d.db.istemci.materialPrice.create({ data: { materialId: 'mat-eski', brandId: HAVUZ_MARKA, priceListId: 'pl-eski', price: 5, adRaw: 'Eski Vana Ham' } });
  const eskiAktar = () => d.svc.importPriceList(KA, { brandId: HAVUZ_MARKA, priceListId: 'pl-eski' });
  await eskiAktar();
  const ey = d.db.tablo('UserLibrary').find((r) => r.firmaId === 'f-a' && r.sourcePriceListId === 'pl-eski')!;
  check('A18-FIXTURE eski yol satırı: indekssiz, kaynak adı gösteriliyor',
    ey && ey.productIndexId == null && ey.materialId === 'mat-eski' && ey.adRaw === 'Eski Vana Ham', js(ey));
  await d.svc.saveBrandSheets(KA, HAVUZ_MARKA, [{ libraryItemId: ey.id, materialName: 'Eski Vana Düzeltilmiş' }]);
  await eskiAktar();
  const ey2 = d.db.tablo('UserLibrary').find((r) => r.id === ey.id)!;
  check('A18 ⭐ eski yol yeniden aktarımı adRaw\'ı geri yazar; düzeltme kullaniciAdi\'nda kalır ve ızgarada o görünür',
    ey2.adRaw === 'Eski Vana Ham' && ey2.kullaniciAdi === 'Eski Vana Düzeltilmiş' &&
      (await izgaraSatiri(d, KA, HAVUZ_MARKA, ey.id))?.col1 === 'Eski Vana Düzeltilmiş',
    js({ adRaw: ey2.adRaw, k: ey2.kullaniciAdi }));
}

// ═══ R — yönetici yeniden indekslemesi ortak listeyi yazar ═══════════════
async function rBlogu(): Promise<void> {
  console.log('\n── R · yeniden indeksleme ortak alan listesini yazar ──');
  const d = await dunyaKur();
  await urunKur(d, 'pi-r1', kolonlar({ ad: 'PVC Boru', cap: '50', price: 1 }));
  await urunKur(d, 'pi-r2', kolonlar({ ad: 'Tip A', kategori: 'Küresel Vanalar', cap: 'DN50', price: 1, sourceRow: 1 }));
  // Eski surum: turetilmis alanlar BAYAT (S4/S5 oncesi gibi bos/yanlis)
  for (const id of ['pi-r1', 'pi-r2']) {
    await d.db.istemci.productIndex.update({
      where: { id },
      data: { indexVersion: INDEX_VERSION - 1, malzemeler: [], aileZayif: false, displayName: 'bayat', capTags: [], adTokens: [] },
    });
  }
  const rowKeyOnce = ['pi-r1', 'pi-r2'].map((id) => pi(d, id).rowKey);
  check('R0 FIXTURE: iki ürün bayat (eski sürüm, fark var)',
    turetilmisFarki(pi(d, 'pi-r1')).length > 0 && turetilmisFarki(pi(d, 'pi-r2')).length > 0,
    js([turetilmisFarki(pi(d, 'pi-r1')), turetilmisFarki(pi(d, 'pi-r2'))]));
  const admin = new AdminService(d.db.istemci, {} as any, { learnFamilyAliases: async () => ({ ogrenilen: 0 }) } as any, {} as any, {} as any);
  const sonuc = await admin.reindexProducts();
  check('R1 ⭐ yeniden indeksleme TÜM türetilmiş alanları yazar (malzemeler + aileZayif dahil)',
    sonuc.guncellenen === 2 && turetilmisFarki(pi(d, 'pi-r1')).length === 0 && turetilmisFarki(pi(d, 'pi-r2')).length === 0 &&
      js(pi(d, 'pi-r1').malzemeler) === js(['pvc']) && pi(d, 'pi-r2').aileZayif === true,
    js({ sonuc, f1: turetilmisFarki(pi(d, 'pi-r1')), f2: turetilmisFarki(pi(d, 'pi-r2')) }));
  check('R2 rowKey yazılmaz (P9d)', js(['pi-r1', 'pi-r2'].map((id) => pi(d, id).rowKey)) === js(rowKeyOnce), js(rowKeyOnce));

  // R3 (DB incelemesi MEDIUM-1) — YARIŞ: yeniden indeksleme satırları döngü başında okur. Arada
  // sahipli ürün yeniden adlandırılırsa (ad + türetilmişler + güncel sürüm) eski addan
  // hesaplanan alanlar onu EZMEMELİ — yoksa ad yeni, aile eski kalır ve sürüm güncel
  // göründüğü için bir sonraki sürüme dek düzelmez.
  await urunKur(d, 'pi-r3', kolonlar({ ad: 'Özel Kollektör 3 Ağızlı', cap: '1"', price: 1, sourceRow: 2 }),
    { ownerUserId: 'u-a', ownerFirmaId: 'f-a' });
  await d.db.istemci.productIndex.update({ where: { id: 'pi-r3' }, data: { indexVersion: INDEX_VERSION - 1 } });
  const pim = d.db.istemci.productIndex;
  const asilFindMany = pim.findMany;
  pim.findMany = async (a: any) => {
    const anlik = await asilFindMany(a);
    pim.findMany = asilFindMany;
    const { rowKey: _kimlik, ...yeni } = buildProductIndex({ ...piKolonlari(pi(d, 'pi-r3')), ad: 'PVC Boru' });
    await pim.update({ where: { id: 'pi-r3' }, data: { ad: 'PVC Boru', ...turetilmisIndeksAlanlari(yeni) } });
    return anlik;
  };
  const sonuc3 = await admin.reindexProducts();
  pim.findMany = asilFindMany;
  check('R3 ⭐ yarışta yeniden adlandırılan ürün EZİLMEZ: türetilmişler yeni addan (boru/pvc), satır atlandı',
    pi(d, 'pi-r3').ad === 'PVC Boru' && pi(d, 'pi-r3').adSlug === 'boru' && turetilmisFarki(pi(d, 'pi-r3')).length === 0 &&
      sonuc3.guncellenen === 0 && sonuc3.atlanan === 3,
    js({ sonuc3, adSlug: pi(d, 'pi-r3').adSlug, fark: turetilmisFarki(pi(d, 'pi-r3')) }));

  // R4 — yalnız "koşul tutmadı" (P2025) atlanır; başka DB hatası YUTULMAZ (sessiz "atlandı" olmasın)
  await d.db.istemci.productIndex.update({ where: { id: 'pi-r1' }, data: { indexVersion: INDEX_VERSION - 1 } });
  const asilUpdate = pim.update;
  pim.update = async () => { pim.update = asilUpdate; throw new Error('baglanti koptu (test)'); };
  let r4: unknown = null;
  try { await admin.reindexProducts(); } catch (e) { r4 = e; }
  pim.update = asilUpdate;
  check('R4 P2025 dışı yazım hatası yeniden indekslemeyi DURDURUR (yutulup "atlandı" sayılmaz)',
    r4 instanceof Error && r4.message === 'baglanti koptu (test)', String(r4));
}

// ═══ D — tekil kütüphane kalemi adı sınırı (P4b 2b güvenlik incelemesi) ═══
// Indekssiz satirin adi eslestirmede HER istekte indekslenir (karesel); POST
// /library sinirsiz ad aliyordu. Urun olusturma ve ad duzeltmesiyle AYNI sinir.
async function dBlogu(): Promise<void> {
  console.log('\n── D · tekil kütüphane kalemi adı sınırı ──');
  const hatali = async (ad: string) =>
    (await validate(plainToInstance(CreateLibraryItemDto, { materialName: ad, brandId: 'b1' }))).map((e) => e.property);
  const d1 = await hatali('x'.repeat(501));
  check('D1 ⭐ 501 karakterlik ad reddedilir (indekssiz satır eşleştirmede her istekte indekslenir)', d1.includes('materialName'), js(d1));
  const d2 = await hatali('x'.repeat(500));
  check('D2 tam 500 karakter kabul (sınır dahil)', d2.length === 0, js(d2));
}

// ═══ K — markayı kaldır: satırlar + sekmeler TEK işlemde (P4b Parti 3 yan bulgusu, 05.10) ═══
async function kBlogu(): Promise<void> {
  console.log('\n── K · markayı kütüphaneden kaldır: satırlar + liste sekmeleri TEK işlemde ──');
  const d = await dunyaKur();
  await havuzKur(d);
  await aktar(d, KA);
  await d.svc.getBrandLists(KA, HAVUZ_MARKA); // tembel göç: "Fiyat Listesi" sekmesi
  // İkinci sekme (+ Yeni Liste ikizi): bellek-prisma `aggregate` bilmediği için
  // addRowsToBrandList yerine sekme kurulur ve bir satır ona taşınır.
  const ek = await d.db.istemci.libraryList.create({ data: { userId: 'u-a', firmaId: 'f-a', brandId: HAVUZ_MARKA, name: 'Ek Liste' } });
  const tasinan = d.db.tablo('UserLibrary').find((r) => r.firmaId === 'f-a' && r.brandId === HAVUZ_MARKA)!;
  await d.db.istemci.userLibrary.update({ where: { id: tasinan.id }, data: { libraryListId: ek.id } });
  await aktar(d, KB);
  await d.svc.getBrandLists(KB, HAVUZ_MARKA);
  // Aynı firmanın BAŞKA markası (satır + sekme + marka kaydı) — süzgeçten
  // `brandId` düşerse o da silinirdi (inceleme MEDIUM-2).
  const DIGER = 'b-diger';
  await d.db.istemci.brand.create({ data: { id: DIGER, name: 'Diğer Marka' } });
  await d.db.istemci.priceList.create({ data: { id: 'pl-diger', name: 'Diğer Liste', brandId: DIGER } });
  await urunKur(d, 'pi-dg', kolonlar({ ad: 'Diğer Vana', cap: 'DN25', price: 30 }), { brandId: DIGER, priceListId: 'pl-diger' });
  await d.svc.importPriceList(KA, { brandId: DIGER, priceListId: 'pl-diger' } as any);
  await d.svc.getBrandLists(KA, DIGER);
  const sekme = (f: string, b = HAVUZ_MARKA) => d.db.tablo('LibraryList').filter((l) => l.firmaId === f && l.brandId === b).length;
  const satirSay = (f: string, b = HAVUZ_MARKA) => d.db.tablo('UserLibrary').filter((r) => r.firmaId === f && r.brandId === b).length;
  const markaKaydi = (f: string, b = HAVUZ_MARKA) => d.db.tablo('UserBrandLibrary').some((u) => u.firmaId === f && u.brandId === b);
  const durum = () => js({
    a: [sekme('f-a'), satirSay('f-a'), markaKaydi('f-a')], aDiger: [sekme('f-a', DIGER), satirSay('f-a', DIGER), markaKaydi('f-a', DIGER)],
    b: [sekme('f-b'), satirSay('f-b'), markaKaydi('f-b')],
  });
  check('K0 ÖLÇÜT: f-a iki sekme + satır + kayıt, f-a diğer markada sekme + satır + kayıt, f-b sekme + satır + kayıt',
    sekme('f-a') === 2 && satirSay('f-a') > 0 && markaKaydi('f-a')
      && sekme('f-a', DIGER) === 1 && satirSay('f-a', DIGER) > 0 && markaKaydi('f-a', DIGER)
      && sekme('f-b') === 1 && satirSay('f-b') > 0 && markaKaydi('f-b'), durum());

  d.islemIci.length = 0;
  await d.svc.removeBrandFromLibrary(KA, HAVUZ_MARKA);
  check('K1 ⭐ kaldırınca f-a satırları VE sekmeleri gider (eskiden sekmeler 0 kalemle kalıyordu)',
    satirSay('f-a') === 0 && sekme('f-a') === 0, durum());
  // Gerçek Postgres'te işlem DIŞI istemciyle yapılan silme geri alınmaz; bellek-prisma
  // hatada tüm tabloları geri sardığı için K5 bunu tek başına ayırt etmez (inceleme MEDIUM-1).
  check('K1b ⭐ üç silme de İŞLEM istemcisinden (tek işlem), bu sırayla',
    js(d.islemIci) === js(['userLibrary.deleteMany', 'libraryList.deleteMany', 'userBrandLibrary.deleteMany']), js(d.islemIci));
  check('K2 marka kaydı (UserBrandLibrary) da gider', !markaKaydi('f-a'), durum());
  check('K3 başka firmanın sekmesi, satırları ve marka kaydı dokunulmaz',
    sekme('f-b') === 1 && satirSay('f-b') > 0 && markaKaydi('f-b'), durum());
  check('K3b aynı firmanın BAŞKA markası dokunulmaz (satır, sekme, kayıt)',
    sekme('f-a', DIGER) === 1 && satirSay('f-a', DIGER) > 0 && markaKaydi('f-a', DIGER), durum());

  await aktar(d, KA);
  const { lists } = await d.svc.getBrandLists(KA, HAVUZ_MARKA);
  check('K4 ⭐ yeniden aktarımda TEK sekme, eski boş sekme "(0)" geri gelmez',
    lists.length === 1 && satirSay('f-a') > 0 && lists[0]._count.items === satirSay('f-a'),
    js(lists.map((l: any) => [l.name, l._count.items])));

  // Atomiklik: sekme silme düşerse satırlar da YERİNDE kalmalı (tek işlem —
  // bellek-prisma fonksiyonlu $transaction hatasında tabloları geri sarar).
  const hataliTx = (tx: any) => new Proxy(tx, {
    get(t, ad) {
      if (ad !== 'libraryList') return t[ad];
      return new Proxy(t.libraryList, {
        get(m, islem) {
          if (islem === 'deleteMany') return async () => { throw new Error('taklit: sekme silinemedi'); };
          return m[islem];
        },
      });
    },
  });
  const hataliIstemci = new Proxy(d.db.istemci, {
    get(t, ad) {
      if (ad === '$transaction') return (fn: any, ...r: any[]) => t.$transaction((tx: any) => fn(hataliTx(tx)), ...r);
      return t[ad];
    },
  });
  const hataliSvc = new LibraryService(hataliIstemci, {} as any);
  const once = { satir: satirSay('f-a'), sekme: sekme('f-a') };
  let hata = '';
  try { await hataliSvc.removeBrandFromLibrary(KA, HAVUZ_MARKA); } catch (e: unknown) { hata = String((e as Error)?.message); }
  check('K5 ⭐ sekme silme düşerse satırlar ve marka kaydı da YERİNDE (tek işlem)',
    hata.includes('taklit') && satirSay('f-a') === once.satir && sekme('f-a') === once.sekme
      && d.db.tablo('UserBrandLibrary').some((u) => u.firmaId === 'f-a' && u.brandId === HAVUZ_MARKA),
    js({ hata, once, sonra: { satir: satirSay('f-a'), sekme: sekme('f-a') } }));
}

// ═══ S — satır / sekme silerek marka BOŞALINCA aynı sonuç (kardeş yollar, 06.10) ═══
async function sBlogu(): Promise<void> {
  console.log('\n── S · tek satır ve sekme silme: firma markada satırsız kalınca sekmeler + kayıt da gider ──');
  const d = await dunyaKur();
  await havuzKur(d);
  await aktar(d, KA);
  await d.svc.getBrandLists(KA, HAVUZ_MARKA);
  const ek = await d.db.istemci.libraryList.create({ data: { userId: 'u-a', firmaId: 'f-a', brandId: HAVUZ_MARKA, name: 'Ek Liste' } });
  const ilk = d.db.tablo('UserLibrary').find((r) => r.firmaId === 'f-a' && r.brandId === HAVUZ_MARKA)!;
  await d.db.istemci.userLibrary.update({ where: { id: ilk.id }, data: { libraryListId: ek.id } });
  await aktar(d, KB);
  await d.svc.getBrandLists(KB, HAVUZ_MARKA);
  // Aynı firmanın BAŞKA markası: "markada satır kaldı mı" sayımından `brandId`
  // düşerse bu marka sayıma girer, temizlik hiç olmazdı (K bloğu dersi).
  const DIGER = 'b-diger-s';
  await d.db.istemci.brand.create({ data: { id: DIGER, name: 'Diğer Marka S' } });
  await d.db.istemci.priceList.create({ data: { id: 'pl-diger-s', name: 'Diğer Liste S', brandId: DIGER } });
  await urunKur(d, 'pi-dgs', kolonlar({ ad: 'Diğer Vana S', cap: 'DN32', price: 40 }), { brandId: DIGER, priceListId: 'pl-diger-s' });
  await d.svc.importPriceList(KA, { brandId: DIGER, priceListId: 'pl-diger-s' } as any);
  await d.svc.getBrandLists(KA, DIGER);
  const sekme = (f: string, b = HAVUZ_MARKA) => d.db.tablo('LibraryList').filter((l) => l.firmaId === f && l.brandId === b).length;
  const satirlar = (f: string, b = HAVUZ_MARKA) => d.db.tablo('UserLibrary').filter((r) => r.firmaId === f && r.brandId === b);
  const markaKaydi = (f: string, b = HAVUZ_MARKA) => d.db.tablo('UserBrandLibrary').some((u) => u.firmaId === f && u.brandId === b);
  const digerDuruyor = () => sekme('f-a', DIGER) === 1 && satirlar('f-a', DIGER).length > 0 && markaKaydi('f-a', DIGER);
  const durum = () => js({
    a: [sekme('f-a'), satirlar('f-a').length, markaKaydi('f-a')], aDiger: [sekme('f-a', DIGER), satirlar('f-a', DIGER).length, markaKaydi('f-a', DIGER)],
    b: [sekme('f-b'), satirlar('f-b').length, markaKaydi('f-b')],
  });
  check('S0 ÖLÇÜT: f-a iki sekme + 3 satır + kayıt; f-a diğer marka; f-b sekme + satır + kayıt',
    sekme('f-a') === 2 && satirlar('f-a').length === 3 && markaKaydi('f-a') && digerDuruyor()
      && sekme('f-b') === 1 && satirlar('f-b').length > 0 && markaKaydi('f-b'), durum());

  // Son satır DEĞİLKEN tek satır silme: sekmeler ve kayıt durur (yalnız satır gider)
  const [s1, s2, s3] = satirlar('f-a').map((r) => r.id);
  d.islemIci.length = 0;
  await d.svc.remove(KA, s1);
  check('S1 son satır değilken: satır gider, iki sekme ve kayıt DURUR', satirlar('f-a').length === 2 && sekme('f-a') === 2 && markaKaydi('f-a'), durum());
  check('S1b silme ve sayım İŞLEM içinde, temizlik YOK', js(d.islemIci) === js(['userLibrary.delete', 'userLibrary.count']), js(d.islemIci));
  await d.svc.remove(KA, s2);
  d.islemIci.length = 0;
  await d.svc.remove(KA, s3);
  check('S2 ⭐ SON satır silinince sekmeler ve marka kaydı da gider (eskiden ikisi de kalıyordu)',
    satirlar('f-a').length === 0 && sekme('f-a') === 0 && !markaKaydi('f-a'), durum());
  check('S2b hepsi TEK işlemde', js(d.islemIci) === js(['userLibrary.delete', 'userLibrary.count', 'libraryList.deleteMany', 'userBrandLibrary.deleteMany']), js(d.islemIci));
  check('S3 başka firma dokunulmaz', sekme('f-b') === 1 && satirlar('f-b').length > 0 && markaKaydi('f-b'), durum());
  check('S3b aynı firmanın başka markası dokunulmaz (satır, sekme, kayıt)', digerDuruyor(), durum());

  // Sekme silme: kalan son DOLU sekme silinince boş sekmeler de gider
  await aktar(d, KA);
  await d.svc.getBrandLists(KA, HAVUZ_MARKA);
  const bos = await d.db.istemci.libraryList.create({ data: { userId: 'u-a', firmaId: 'f-a', brandId: HAVUZ_MARKA, name: 'Boş Liste' } });
  const dolu = d.db.tablo('LibraryList').find((l) => l.firmaId === 'f-a' && l.brandId === HAVUZ_MARKA && l.id !== bos.id)!;
  const doluSatir = satirlar('f-a').filter((r) => r.libraryListId === dolu.id).length;
  check('S4 ÖLÇÜT: bir dolu + bir boş sekme', sekme('f-a') === 2 && doluSatir > 0 && satirlar('f-a').length === doluSatir, durum());
  // Görünümü yeniden kurma çağrılarını say: marka boşalınca kayıt İŞLEMDE
  // silinir, kurma hiç çağrılmaz — S5 kaydın yokluğunu ancak işlem içi
  // silmeyle sağlayabilir (eskiden işlem dışı kurma da sağlıyordu).
  const gercekKur = d.svc.rebuildUserBrandLibrary.bind(d.svc);
  let kurmaSayisi = 0;
  d.svc.rebuildUserBrandLibrary = async (...a: Parameters<typeof gercekKur>) => { kurmaSayisi++; return gercekKur(...a); };
  d.islemIci.length = 0;
  const s5 = await d.svc.deleteBrandList(KA, HAVUZ_MARKA, dolu.id);
  check('S5 ⭐ son DOLU sekme silinince boş sekme ve kayıt da gider', sekme('f-a') === 0 && satirlar('f-a').length === 0 && !markaKaydi('f-a'), durum());
  check('S5b sekme silme TEK işlemde (satırlar + sekme + temizlik)',
    js(d.islemIci) === js(['userLibrary.deleteMany', 'libraryList.delete', 'userLibrary.count', 'libraryList.deleteMany', 'userBrandLibrary.deleteMany']), js(d.islemIci));
  check('S5c sekme silmede de başka firma ve aynı firmanın başka markası dokunulmaz',
    digerDuruyor() && sekme('f-b') === 1 && satirlar('f-b').length > 0 && markaKaydi('f-b'), durum());
  check('S5d marka boşalınca görünüm yeniden KURULMAZ (kayıt işlemde silindi)', kurmaSayisi === 0, `kurma=${kurmaSayisi}`);
  check('S5e yanıt silinen satır sayısını taşır', s5.ok === true && s5.deletedRows === doluSatir, js(s5));

  // Sekme silme, başka sekmede satır VARKEN: diğer sekme ve kayıt durur
  await aktar(d, KA);
  await d.svc.getBrandLists(KA, HAVUZ_MARKA);
  const ikinci = await d.db.istemci.libraryList.create({ data: { userId: 'u-a', firmaId: 'f-a', brandId: HAVUZ_MARKA, name: 'İkinci' } });
  const tasi = satirlar('f-a')[0];
  await d.db.istemci.userLibrary.update({ where: { id: tasi.id }, data: { libraryListId: ikinci.id } });
  kurmaSayisi = 0;
  await d.svc.deleteBrandList(KA, HAVUZ_MARKA, ikinci.id);
  check('S6 başka sekmede satır varken: o sekme ve marka kaydı DURUR', sekme('f-a') === 1 && satirlar('f-a').length > 0 && markaKaydi('f-a'), durum());
  check('S6b marka boşalmadıysa görünüm yeniden kurulur (bir kez)', kurmaSayisi === 1, `kurma=${kurmaSayisi}`);

  // Silme KESİNLEŞTİKTEN sonra görünüm kurulamazsa istek yine başarılı döner
  // (500 "Silinemedi" dedirtip artık olmayan sekmeyi yeniden sildirirdi → 404).
  const ucuncu = await d.db.istemci.libraryList.create({ data: { userId: 'u-a', firmaId: 'f-a', brandId: HAVUZ_MARKA, name: 'Üçüncü' } });
  const tasi2 = satirlar('f-a')[0];
  await d.db.istemci.userLibrary.update({ where: { id: tasi2.id }, data: { libraryListId: ucuncu.id } });
  const kalanOnce = satirlar('f-a').length;
  d.svc.rebuildUserBrandLibrary = async () => { throw new Error('SIMULE: gorunum kurulamadi'); };
  const uyarilar: string[] = [];
  const kayitci = (d.svc as any).logger;
  const gercekUyari = kayitci.warn;
  kayitci.warn = (m: string) => { uyarilar.push(String(m)); };
  let s7: any;
  let s7Hata: unknown = null;
  try {
    s7 = await d.svc.deleteBrandList(KA, HAVUZ_MARKA, ucuncu.id);
  } catch (e) {
    s7Hata = e;
  } finally {
    kayitci.warn = gercekUyari;
    d.svc.rebuildUserBrandLibrary = gercekKur;
  }
  check('S7 ⭐ görünüm kurulamazsa da silme BAŞARILI döner (silme kesinleşti)',
    s7Hata === null && s7?.ok === true && s7?.deletedRows === 1, js({ s7, hata: String(s7Hata) }));
  check('S7b sekme ve satırı gerçekten silindi, diğer sekme ve kayıt duruyor',
    !d.db.tablo('LibraryList').some((l) => l.id === ucuncu.id) && satirlar('f-a').length === kalanOnce - 1
      && sekme('f-a') === 1 && markaKaydi('f-a'), durum());
  check('S7c kurulamama SESSİZ değil (uyarı günlüğü)', uyarilar.length === 1 && uyarilar[0].includes('SIMULE'), js(uyarilar));
}

bitmezseKirmizi((async () => {
  hBlogu();
  await mBlogu();
  await fBlogu();
  await aBlogu();
  await rBlogu();
  await dBlogu();
  await kBlogu();
  await sBlogu();
  console.log(`\n${'='.repeat(64)}\nP4B KUTUPHANE: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
})());
