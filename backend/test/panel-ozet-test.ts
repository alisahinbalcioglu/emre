/**
 * PANO OZETI KAPISI — `GET /panel/ozet` (t.3, 21.09.2026)
 * (`npm run test:panel-ozet`)
 *
 * DB, SUNUCU ve AG GEREKTIRMEZ. Sahte Prisma `where`i GERCEKTEN uygular
 * (`faz7-ekip-test.ts` deseni): kapsam suzgecini kaldiran bir mutasyon
 * BU PAKETI kirmizi yapar — casus sahte (`where`i yalniz kaydeden) bunu
 * goremezdi. CI'da DB yok; bu yuzden kapi gercekten KOSAR.
 *
 * ── NE KILITLENIYOR ──────────────────────────────────────────────────────
 * Bugunku kusur: pano dort sayiyi `GET /admin/stats` ucundan okuyordu.
 *   (a) Uc `@Roles('admin')` korumali → musteride `stats` null → DORT KUTU
 *       HIC CIZILMIYOR.
 *   (b) Admin'de gelen sayilar SISTEMIN TAMAMI (10 teklif / 21.723 malzeme /
 *       4 kullanici), oysa hesabin kendi sayilari 4 teklif / 1 kullanici.
 * Kusurun OZU, ayni seyi gosteren iki ekranin FARKLI saymasiydi. O yuzden
 * asil kapi B BOLUMU: ozetin her sayisi, o listeyi ureten GERCEK servisin
 * ayni sahte DB'de dondurdugu adede EŞIT olmak zorunda. Sayimi tek basina
 * sinamak yetmez — ikiz kural yazildiginda tek basina yine yesil kalirdi.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Reflector } from '@nestjs/core';

import { PanelServisi } from '../src/ozellik/panel/panel.servisi';
import { PanelController } from '../src/ozellik/panel/panel.controller';
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { LibraryService } from '../src/ozellik/kutuphane/library/library.service';
import { UyelikServisi } from '../src/ozellik/firma/uyelik.servisi';
import { AdminController } from '../src/ozellik/kutuphane/admin/admin.controller';
import { etkinHesapKosulu } from '../src/ozellik/firma/uyelik-kurallari';
import { ROLES_KEY } from '../src/altyapi/auth/decorators/roles.decorator';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, kanit?: string) {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${kanit ? ` — ${kanit}` : ''}`);
    console.log(`  ✗ ${ad}${kanit ? ` — ${kanit}` : ''}`);
  }
}

const KOK = path.join(__dirname, '../..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');
/** Yorum satirlarini atar: kapi YORUMDA degil KODDA eslessin. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const reflector = new Reflector();
const guardAdlari = (handler: any, cls: any): string[] =>
  [
    ...((Reflect.getMetadata('__guards__', cls) ?? []) as any[]),
    ...((Reflect.getMetadata('__guards__', handler) ?? []) as any[]),
  ].map((g: any) => g?.name ?? String(g));

async function dene<T>(fn: () => Promise<T>): Promise<{ deger?: T; hata?: any }> {
  try {
    return { deger: await fn() };
  } catch (hata) {
    return { hata };
  }
}
const hataDurumu = (e: any) => e?.status ?? e?.getStatus?.() ?? null;

// ═══════════════════════════════════════════════════════════════════════════
//  BELLEK ICI SAHTE PRISMA — `where`i GERCEKTEN uygular
//  (`faz7-ekip-test.ts` motoru; `distinct` destegi eklendi — marka sayisi
//   `findLibraryBrands` ile AYNI sorgudan gelir.)
// ═══════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

function karsilastir(a: any, b: any): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  if (x === y) return 0;
  return x < y ? -1 : 1;
}
function esitMi(a: any, b: any): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return karsilastir(a, b) === 0;
  return a === b;
}

function esles(satir: Satir, kosul: any): boolean {
  if (!kosul) return true;
  for (const [alan, deger] of Object.entries(kosul)) {
    if (alan === 'OR') {
      if (!(deger as any[]).some((k) => esles(satir, k))) return false;
      continue;
    }
    if (alan === 'AND') {
      if (!(deger as any[]).every((k) => esles(satir, k))) return false;
      continue;
    }
    if (alan === 'NOT') {
      if (esles(satir, deger)) return false;
      continue;
    }
    const mevcut = satir[alan];
    if (deger !== null && typeof deger === 'object' && !(deger instanceof Date)) {
      const OPERATORLER = ['lt', 'lte', 'gt', 'gte', 'not', 'in', 'equals', 'mode', 'contains'];
      const operatorVar = Object.keys(deger as any).some((k) => OPERATORLER.includes(k));
      if (!operatorVar && mevcut !== null && typeof mevcut === 'object' && !(mevcut instanceof Date)) {
        if (!esles(mevcut, deger)) return false;
        continue;
      }
      const duyarsiz = (deger as any).mode === 'insensitive';
      const kucult = (v: any) => (duyarsiz && typeof v === 'string' ? v.toLowerCase() : v);
      for (const [op, ham] of Object.entries(deger as Record<string, any>)) {
        if (op === 'mode') continue;
        const hedef = kucult(ham);
        const mevcutK = kucult(mevcut);
        if (op === 'equals') { if (!esitMi(mevcutK, hedef)) return false; continue; }
        if (op === 'contains') {
          if (typeof mevcutK !== 'string' || !mevcutK.includes(String(hedef))) return false;
          continue;
        }
        if (op === 'in') {
          if (!(ham as any[]).some((h) => esitMi(mevcutK, kucult(h)))) return false;
          continue;
        }
        if (op === 'lt') { if (!(karsilastir(mevcut, hedef) < 0)) return false; }
        else if (op === 'lte') { if (!(karsilastir(mevcut, hedef) <= 0)) return false; }
        else if (op === 'gt') { if (!(karsilastir(mevcut, hedef) > 0)) return false; }
        else if (op === 'gte') { if (!(karsilastir(mevcut, hedef) >= 0)) return false; }
        else if (op === 'not') { if (esitMi(mevcutK, hedef)) return false; }
        else throw new Error(`SAHTE PRISMA: bilinmeyen operator "${op}" (alan ${alan})`);
      }
      continue;
    }
    if (!esitMi(mevcut, deger)) return false;
  }
  return true;
}

function sirala(satirlar: Satir[], orderBy: any): Satir[] {
  if (!orderBy) return satirlar;
  const kurallar = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...satirlar].sort((a, b) => {
    for (const k of kurallar) {
      const [alan, yon] = Object.entries(k)[0] as [string, string];
      const f = karsilastir(a[alan], b[alan]);
      if (f !== 0) return yon === 'desc' ? -f : f;
    }
    return 0;
  });
}

/** Prisma `distinct: ['alan']` — ILK satir kalir (Prisma da boyle yapar). */
function tekil(satirlar: Satir[], distinct: string[] | undefined): Satir[] {
  if (!distinct?.length) return satirlar;
  const gorulen = new Set<string>();
  const out: Satir[] = [];
  for (const s of satirlar) {
    // Anahtar JSON: ayirac olarak NUL/ozel karakter kullanmak dosyayi
    // IKILI (binary) yapar; grep/diff araclari dosyayi okumaz.
    const anahtar = JSON.stringify(distinct.map((a) => s[a]));
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    out.push(s);
  }
  return out;
}

type Iz = { cagrilar: { tablo: string; islem: string; arg: any }[] };

function tabloYap(ad: string, satirlar: Satir[], iz: Iz) {
  const kaydet = (islem: string, arg: any) => iz.cagrilar.push({ tablo: ad, islem, arg });
  const bul = (w: any) => satirlar.filter((s) => esles(s, w));
  return {
    findUnique: async (a: any) => { kaydet('findUnique', a); return bul(a.where)[0] ?? null; },
    findFirst: async (a: any) => { kaydet('findFirst', a); return sirala(bul(a.where), a.orderBy)[0] ?? null; },
    findMany: async (a: any = {}) => {
      kaydet('findMany', a);
      return tekil(sirala(bul(a.where), a.orderBy), a.distinct);
    },
    count: async (a: any = {}) => { kaydet('count', a); return bul(a.where).length; },
    create: async (a: any) => {
      kaydet('create', a);
      const yeni: Satir = { id: a.data?.id ?? `${ad}-${satirlar.length + 1}`, createdAt: new Date(), ...a.data };
      satirlar.push(yeni);
      return yeni;
    },
  };
}

function sahtePrisma(veri: Record<string, Satir[]>) {
  const iz: Iz = { cagrilar: [] };
  const p: any = { _iz: iz, _veri: veri };
  for (const [ad, satirlar] of Object.entries(veri)) p[ad] = tabloYap(ad, satirlar, iz);
  // ⚠ BILINMEYEN TABLO BOS DONER, `undefined` DEGIL: `uyeleriGetir` abonelik
  // ve firmaDavet de okuyor; her fixture'a elle eklemek testi konusundan
  // uzaklastirirdi. Bos tablo "veri yok" demektir, sessiz bir yalan uretmez.
  return new Proxy(p, {
    get(hedef: any, anahtar: string | symbol) {
      if (typeof anahtar !== 'string' || anahtar in hedef) return hedef[anahtar as any];
      if (anahtar.startsWith('$') || anahtar.startsWith('_')) return undefined;
      veri[anahtar] = [];
      hedef[anahtar] = tabloYap(anahtar, veri[anahtar], iz);
      return hedef[anahtar];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  FIXTURE — IKI FIRMA, ASIMETRIK SAYILAR
//
//  Sayilar BILEREK birbirinden farkli: her sayac kendi alanini okumazsa
//  (kopyala-yapistir hatasi) test kirmizi olur. Ayni sayilari verseydik
//  `malzemeSayisi`yi `teklifSayisi`ye baglayan bir hata YESIL kalirdi.
//    F1 → 3 teklif · 5 kutuphane satiri · 2 marka · 2 etkin kullanici
//    F2 → 7 teklif · 4 kutuphane satiri · 3 marka · 1 etkin kullanici
// ═══════════════════════════════════════════════════════════════════════════
const t = (g: number) => new Date(Date.UTC(2026, 0, g));

function fixture() {
  const veri: Record<string, Satir[]> = {
    user: [
      // F1 — 2 ETKIN (sahip A + uye A2) + 2 SAYILMAYACAK
      { id: 'A', firmaId: 'F1', firmaRol: 'sahip', status: 'active', deletedAt: null, createdAt: t(1), email: 'a@f1.test' },
      { id: 'A2', firmaId: 'F1', firmaRol: 'uye', status: 'active', deletedAt: null, createdAt: t(2), email: 'a2@f1.test' },
      // Kapatilmis hesap: koltuk tutmaz → Ekip sayfasinda da sayilmaz
      { id: 'A3', firmaId: 'F1', firmaRol: 'uye', status: 'active', deletedAt: t(3), createdAt: t(3), email: 'a3@f1.test' },
      // Banli hesap: parasi odenen yeri KULLANMIYOR → sayilmaz (§3.4)
      { id: 'A4', firmaId: 'F1', firmaRol: 'uye', status: 'banned', deletedAt: null, createdAt: t(4), email: 'a4@f1.test' },
      // F2 — 1 ETKIN
      { id: 'B', firmaId: 'F2', firmaRol: 'sahip', status: 'active', deletedAt: null, createdAt: t(1), email: 'b@f2.test' },
    ],
    quote: [
      ...Array.from({ length: 3 }, (_, i) => ({ id: `q-f1-${i}`, firmaId: 'F1', userId: 'A', createdAt: t(10 + i), items: [] })),
      ...Array.from({ length: 7 }, (_, i) => ({ id: `q-f2-${i}`, firmaId: 'F2', userId: 'B', createdAt: t(10 + i), items: [] })),
    ],
    userLibrary: [
      // F1: 5 satir, 2 DISTINCT marka (M1 x3, M2 x2)
      { id: 'l1', firmaId: 'F1', userId: 'A', brandId: 'M1', materialName: 'a' },
      { id: 'l2', firmaId: 'F1', userId: 'A', brandId: 'M1', materialName: 'b' },
      { id: 'l3', firmaId: 'F1', userId: 'A', brandId: 'M1', materialName: 'c' },
      { id: 'l4', firmaId: 'F1', userId: 'A2', brandId: 'M2', materialName: 'd' },
      { id: 'l5', firmaId: 'F1', userId: 'A2', brandId: 'M2', materialName: 'e' },
      // F2: 4 satir, 3 DISTINCT marka
      { id: 'l6', firmaId: 'F2', userId: 'B', brandId: 'M3', materialName: 'f' },
      { id: 'l7', firmaId: 'F2', userId: 'B', brandId: 'M3', materialName: 'g' },
      { id: 'l8', firmaId: 'F2', userId: 'B', brandId: 'M4', materialName: 'h' },
      { id: 'l9', firmaId: 'F2', userId: 'B', brandId: 'M5', materialName: 'i' },
    ],
  };
  return sahtePrisma(veri);
}

// 23.09: teklif kapsami ACIK (firma sahibi) — 'kendi' kapsami E bolumunde AYRICA olculur.
const K = (userId: string, firmaId: string) => ({ userId, firmaId, teklifKapsami: 'firma' as const });

/** FIXTURE KANITI — dal HIC kosmadan yesil olmasin (hafiza dersi). */
function bolumF() {
  console.log('\n── F · FIXTURE KANITI ──');
  const prisma: any = fixture();
  check('F1 fixture: 5 kullanici · 10 teklif · 9 kutuphane satiri yuklu',
    prisma._veri.user.length === 5 && prisma._veri.quote.length === 10 && prisma._veri.userLibrary.length === 9,
    `user=${prisma._veri.user.length} quote=${prisma._veri.quote.length} lib=${prisma._veri.userLibrary.length}`);
  // Asimetri FIXTURE'DAN SAYILIR, sabit yazilmaz: fixture degistirilirse bu
  // kapi da degisir (dairesel olcut degil — iki firmanin kendi satirlari).
  const say = (tablo: string, firma: string, ek: (s: Satir) => boolean = () => true) =>
    prisma._veri[tablo].filter((s: Satir) => s.firmaId === firma && ek(s)).length;
  const marka = (firma: string) =>
    new Set(prisma._veri.userLibrary.filter((s: Satir) => s.firmaId === firma).map((s: Satir) => s.brandId)).size;
  const etkin = (firma: string) => say('user', firma, (u) => u.deletedAt === null && u.status === 'active');
  const F1 = [say('quote', 'F1'), say('userLibrary', 'F1'), marka('F1'), etkin('F1')];
  const F2 = [say('quote', 'F2'), say('userLibrary', 'F2'), marka('F2'), etkin('F2')];
  check('F2 fixture ASIMETRIK: dort eksenin DORDU de iki firmada farkli (kopyala-yapistir hatasi yakalanabilsin)',
    F1.every((v, i) => v !== F2[i]), `F1=${F1.join('/')} F2=${F2.join('/')}`);
  check('F3 fixture beklenen degerleri tasiyor (F1 3/5/2/2 · F2 7/4/3/1)',
    F1.join('/') === '3/5/2/2' && F2.join('/') === '7/4/3/1', `F1=${F1.join('/')} F2=${F2.join('/')}`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  A · KAPSAM — A kullanicisinin ozeti B'nin verisini SAYMAZ
// ═══════════════════════════════════════════════════════════════════════════
async function bolumA() {
  console.log('\n── A · KAPSAM (capraz-firma sizintisi) ──');
  const prisma: any = fixture();
  const panel = new PanelServisi(prisma);

  const a = await panel.ozet(K('A', 'F1'));
  const b = await panel.ozet(K('B', 'F2'));

  check('A1 F1 ozeti: 3 teklif (F2nin 7 teklifi SAYILMADI)', a.teklifSayisi === 3, `teklifSayisi=${a.teklifSayisi}`);
  check('A2 F1 ozeti: 5 malzeme (F2nin 4 satiri SAYILMADI)', a.malzemeSayisi === 5, `malzemeSayisi=${a.malzemeSayisi}`);
  check('A3 F1 ozeti: 2 marka (F2nin M3/M4/M5 markalari SAYILMADI)', a.markaSayisi === 2, `markaSayisi=${a.markaSayisi}`);
  check('A4 F1 ozeti: 2 kullanici (F2nin sahibi SAYILMADI)', a.kullaniciSayisi === 2, `kullaniciSayisi=${a.kullaniciSayisi}`);

  check('A5 F2 ozeti: 7 teklif (F1in 3 teklifi SAYILMADI)', b.teklifSayisi === 7, `teklifSayisi=${b.teklifSayisi}`);
  check('A6 F2 ozeti: 4 malzeme · 3 marka · 1 kullanici',
    b.malzemeSayisi === 4 && b.markaSayisi === 3 && b.kullaniciSayisi === 1,
    JSON.stringify(b));

  // ⚠ ASIL MUTASYON KAPISI. `panel.servisi.ts`teki
  //   `const kapsam = { firmaId: k.firmaId };`
  // satiri `{}` yapilirsa her sayi SISTEM TOPLAMINA cikar — tam olarak
  // bugun `/admin/stats`in yaptigi hata. Bu iki assert o mutanti oldurur.
  check('A7 MUTASYON KAPISI: hicbir sayi SISTEM TOPLAMINA esit degil (F1)',
    a.teklifSayisi !== 10 && a.malzemeSayisi !== 9 && a.markaSayisi !== 5 && a.kullaniciSayisi !== 3,
    JSON.stringify(a));
  check('A8 MUTASYON KAPISI: F1 ve F2 ozetleri FARKLI (suzgec gercekten uygulaniyor)',
    JSON.stringify(a) !== JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

  // Suzgecin SORGUYA girdiginin izden kaniti — "mekanizma var, baglanti yok".
  const iz = prisma._iz.cagrilar.filter((c: any) => c.islem === 'count' || c.islem === 'findMany');
  check('A9 dort sorgunun DORDU de `firmaId` tasiyor (iz kaydi)',
    iz.length >= 8 && iz.every((c: any) => c.arg?.where?.firmaId === 'F1' || c.arg?.where?.firmaId === 'F2'),
    `sorgu=${iz.length} · ${iz.map((c: any) => `${c.tablo}.${c.islem}(${c.arg?.where?.firmaId})`).join(', ')}`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  B · TUTARLILIK — ozet sayilari LISTE UCLARIYLA birebir esit
//
//  Ayni sahte DB'de GERCEK servisler kosar. Kusurun ozu iki ekranin farkli
//  saymasiydi; kilitlenen sey bu.
// ═══════════════════════════════════════════════════════════════════════════
async function bolumB() {
  console.log('\n── B · TUTARLILIK (ozet ↔ liste uclari, AYNI sahte DB) ──');
  const prisma: any = fixture();
  const panel = new PanelServisi(prisma);
  // Bu uc servisin okunan metotlari YALNIZ `this.prisma` kullanir; kalan
  // bagimliliklar cagrilmadigi icin null gecilir (cagrilirsa test patlar —
  // sessiz gecmez).
  const quotes = new QuotesService(prisma, null as any, null as any);
  const library = new LibraryService(prisma, null as any);
  const uyelik = new UyelikServisi(prisma, null as any, null as any, null as any);

  for (const [firma, kisi] of [['F1', 'A'], ['F2', 'B']] as const) {
    const k = K(kisi, firma);
    const ozet = await panel.ozet(k);

    const liste = await quotes.findAll(k, {});
    check(`B1/${firma} teklifSayisi === Teklifler ucunun toplami (${ozet.teklifSayisi})`,
      ozet.teklifSayisi === liste.toplam && ozet.teklifSayisi === liste.kayitlar.length,
      `ozet=${ozet.teklifSayisi} toplam=${liste.toplam} kayit=${liste.kayitlar.length}`);

    const kutuphane = await library.findAll(k);
    check(`B2/${firma} malzemeSayisi === Kutuphanem satir adedi (${ozet.malzemeSayisi})`,
      ozet.malzemeSayisi === kutuphane.length,
      `ozet=${ozet.malzemeSayisi} kutuphane=${kutuphane.length}`);

    const markalar = await library.findLibraryBrands(k);
    check(`B3/${firma} markaSayisi === Kutuphanem marka adedi (${ozet.markaSayisi})`,
      ozet.markaSayisi === markalar.length,
      `ozet=${ozet.markaSayisi} marka=${markalar.length}`);

    const ekip: any = await uyelik.uyeleriGetir(k);
    check(`B4/${firma} kullaniciSayisi === Ekip sayfasinin koltuk.aktif degeri (${ozet.kullaniciSayisi})`,
      ozet.kullaniciSayisi === ekip.koltuk.aktif,
      `ozet=${ozet.kullaniciSayisi} koltuk.aktif=${ekip.koltuk.aktif}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  C · ETKIN HESAP TANIMI — silinen/banli hesap SAYILMAZ, kural ICERI ALINIR
// ═══════════════════════════════════════════════════════════════════════════
async function bolumC() {
  console.log('\n── C · ETKIN HESAP (tek tanim) ──');
  const prisma: any = fixture();
  const panel = new PanelServisi(prisma);
  const ozet = await panel.ozet(K('A', 'F1'));

  check('C1 F1de 4 kullanici satiri var ama kullaniciSayisi 2 (kapatilan + banli DUSTU)',
    prisma._veri.user.filter((u: Satir) => u.firmaId === 'F1').length === 4 && ozet.kullaniciSayisi === 2,
    `satir=${prisma._veri.user.filter((u: Satir) => u.firmaId === 'F1').length} sayac=${ozet.kullaniciSayisi}`);

  const kullaniciSorgusu = prisma._iz.cagrilar.find((c: any) => c.tablo === 'user' && c.islem === 'count');
  check('C2 kullanici sorgusu `etkinHesapKosulu()` ciktisini TASIYOR (kural kopyalanmadi)',
    !!kullaniciSorgusu &&
      kullaniciSorgusu.arg.where.deletedAt === etkinHesapKosulu().deletedAt &&
      kullaniciSorgusu.arg.where.status === etkinHesapKosulu().status,
    JSON.stringify(kullaniciSorgusu?.arg?.where));

  const kaynak = kodu(oku('backend/src/ozellik/panel/panel.servisi.ts'));
  check('C3 `etkinHesapKosulu` KODDA import edilmis (ikinci bir "etkin kullanici" tanimi YOK)',
    /import\s*\{\s*etkinHesapKosulu\s*\}\s*from\s*'\.\.\/firma\/uyelik-kurallari'/.test(kaynak) &&
      !/status:\s*'active'/.test(kaynak),
    kaynak.includes('etkinHesapKosulu') ? 'import var' : 'import YOK');
}

// ═══════════════════════════════════════════════════════════════════════════
//  D · KAPI VE KABLOLAMA — uc herkese acik, firmasiz hesap 403
// ═══════════════════════════════════════════════════════════════════════════
async function bolumD() {
  console.log('\n── D · KAPI / KABLOLAMA ──');
  const ctrl: any = PanelController.prototype;
  const guardlar = guardAdlari(ctrl.ozet, PanelController);

  check('D1 `JwtAuthGuard` var (oturum sart)', guardlar.includes('JwtAuthGuard'), guardlar.join(','));
  check('D2 `RolesGuard` YOK ve `@Roles` YOK — musteri de cagirabilir',
    !guardlar.includes('RolesGuard') &&
      (reflector.getAllAndOverride<any>(ROLES_KEY, [ctrl.ozet, PanelController]) ?? null) === null,
    guardlar.join(','));

  check('D3 rota `panel` + `ozet` (GET /panel/ozet)',
    Reflect.getMetadata('path', PanelController) === 'panel' &&
      Reflect.getMetadata('path', ctrl.ozet) === 'ozet',
    `${Reflect.getMetadata('path', PanelController)}/${Reflect.getMetadata('path', ctrl.ozet)}`);

  // FIRMASIZ HESAP: Prisma'da `firmaId: undefined` kosulu SESSIZCE DUSER ve
  // BUTUN firmalarin satirlari sayilirdi. `kimlikCoz` gurultulu durur.
  const prisma: any = fixture();
  const controller = new PanelController(new PanelServisi(prisma));
  const { hata } = await dene(async () => controller.ozet({ id: 'A', firmaId: null }));
  check('D4 firmasiz hesap 403 (sessiz capraz-firma sayimi olmaz)', hataDurumu(hata) === 403, String(hataDurumu(hata)));

  const { deger } = await dene(async () => controller.ozet({ id: 'A', firmaId: 'F1', firmaRol: 'sahip' }));
  check('D5 firmali hesap ozeti alir', JSON.stringify(deger) === JSON.stringify({
    teklifSayisi: 3, malzemeSayisi: 5, markaSayisi: 2, kullaniciSayisi: 2,
  }), JSON.stringify(deger));

  // ── 23.09.2026 (Ekip & Izinler): TEKLIF SAYACI TEKLIF KAPSAMIYLA ────────
  // F1'in 3 teklifinin ucunu de sahip A yazdi; uye A2'nin KENDI teklifi yok.
  // "Son teklifler" izni kapali uye panoda firmanin teklif ADEDINI de
  // gormemeli (liste ile ayni kosul). Izni acik uye firmanin tamamini sayar.
  const izinsiz = await dene(async () =>
    controller.ozet({ id: 'A2', firmaId: 'F1', firmaRol: 'uye', izinler: ['excel', 'dwg', 'kutuphane'] }));
  check('D5b "Son teklifler" izni KAPALI uye: teklif sayaci YALNIZ kendi (0, firmanin 3u DEGIL)',
    (izinsiz.deger as any)?.teklifSayisi === 0, JSON.stringify(izinsiz.deger));
  const izinli = await dene(async () =>
    controller.ozet({ id: 'A2', firmaId: 'F1', firmaRol: 'uye', izinler: ['firmaTeklifleri'] }));
  check('D5c izni ACIK uye firmanin TUM tekliflerini sayar (3) — D5b olcutu kendi kendine 0 vermiyor',
    (izinli.deger as any)?.teklifSayisi === 3, JSON.stringify(izinli.deger));

  const app = kodu(oku('backend/src/app.module.ts'));
  check('D6 `PanelModule` app.module.ts KODUNDA kayitli (mekanizma var, baglanti yok tuzagi)',
    /import\s*\{\s*PanelModule\s*\}/.test(app) && /^\s*PanelModule,\s*$/m.test(app));
}

// ═══════════════════════════════════════════════════════════════════════════
//  E · ON YUZ — pano yeni uca bagli, role kapisi kalkti
// ═══════════════════════════════════════════════════════════════════════════
function bolumE() {
  console.log('\n── E · ON YUZ (dashboard/page.tsx) ──');
  const pano = kodu(oku('frontend/app/(protected)/dashboard/page.tsx'));

  check('E1 `/panel/ozet` cagriliyor', /api\.get<PanoOzeti>\('\/panel\/ozet'\)/.test(pano));
  check('E2 `/admin/stats` ARTIK cagrilmiyor', !/\/admin\/stats/.test(pano));
  check('E3 role kapisi KALKTI (`role === \'admin\'` kodda yok)', !/role\s*===\s*'admin'/.test(pano));
  check('E4 kartlar KOSULSUZ ciziliyor (`{stats && (` deseni kodda yok)', !/\{stats\s*&&/.test(pano));
  check('E5 dort sayac da yeni ucun alanlarini okuyor',
    /ozet\?\.teklifSayisi/.test(pano) && /ozet\?\.malzemeSayisi/.test(pano) &&
    /ozet\?\.markaSayisi/.test(pano) && /ozet\?\.kullaniciSayisi/.test(pano));
  check('E6 ozet gelmeden UYDURMA 0 yazilmiyor (`— ` geri dususu var, `?? 0` yok)',
    /=== undefined \? '—'/.test(pano) && !/\?\? 0/.test(pano));
  check('E7 TURKCE: `Kullanıcılar` duzeldi, `Kullanicilar` kalmadi',
    pano.includes('Kullanıcılar') && !pano.includes('Kullanicilar'));
  check('E8 TURKCE: `oluştu` / `tamamlandı` / `yüklendi` duzeldi',
    pano.includes('hata oluştu.') && pano.includes('Analiz tamamlandı') && pano.includes('sayfa yüklendi.'));

  // FAZ 7 KORUNSUN: bu turda dokunulan ekranin komsulari bozulmadi.
  check('E9 QuickStart/RecentQuotes/QuickAccess bolumleri yerinde',
    /<QuickStart/.test(pano) && /<RecentQuotes\s*\/>/.test(pano) && /<QuickAccess\s*\/>/.test(pano));
}

// ═══════════════════════════════════════════════════════════════════════════
//  G · YONETICI PANOSU BOZULMADI — /admin/stats yerinde ve hala rol korumali
// ═══════════════════════════════════════════════════════════════════════════
function bolumG() {
  console.log('\n── G · /admin/stats DOKUNULMADI ──');
  const adminCtrl: any = AdminController.prototype;
  check('G1 `GET admin/stats` hala var',
    Reflect.getMetadata('path', AdminController) === 'admin' &&
      Reflect.getMetadata('path', adminCtrl.getStats) === 'stats');
  const adminRolleri = (reflector.getAllAndOverride<string[]>(ROLES_KEY, [adminCtrl.getStats, AdminController]) ?? []) as string[];
  check('G2 hala `admin` rolu gerektiriyor', adminRolleri.includes('admin'), adminRolleri.join(','));
  // ⚠ Bu kapi ONCE `app/admin/stats/page.tsx`e bakiyordu ve KIRMIZI verdi:
  // o dosyadaki tek `/admin/stats` gecisi bir YORUMDU (`kodu()` yorumlari
  // atar). Gercek tuketici asagidaki veri katmanidir — "yorum kanit degildir"
  // dersinin bu turdaki ornegi.
  const yonetici = kodu(oku('frontend/ozellik/kutuphane/admin-stats.ts'));
  check('G3 yonetici panosunun veri katmani `/admin/stats` okumaya DEVAM ediyor',
    /api\.get<StatsApiResponse>\('\/admin\/stats'\)/.test(yonetici));
}

async function main() {
  bolumF();
  await bolumA();
  await bolumB();
  await bolumC();
  await bolumD();
  bolumE();
  bolumG();
  console.log(`\n${'='.repeat(64)}`);
  console.log(`PANO OZETI (t.3): ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(64));
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  · ${f}`));
  }
  // ⚠ `process.exit` DEGIL: Windows'ta acik soketle 0xC0000409 uretiyor.
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
