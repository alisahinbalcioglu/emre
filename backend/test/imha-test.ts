/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VERI IMHASI KAPISI  (`npm run test:imha`)   — plan 5.8 · §5
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  DB, SUNUCU ve AG GEREKTIRMEZ: her sey BELLEK ICI sahte Prisma ve GERCEK
 *  `ImhaServisi`/`ImhaJob` ornekleriyle olculur.
 *
 *  BU KAPI NEYI KORUYOR — geri alinamaz silmenin dort olum sekli:
 *    1. YANLIS ZAMAN   → `deletedAt`e bakip kapatmanin ertesi gunu silmek (D)
 *    2. YANLIS KAPSAM  → A firmasini silerken B'nin satirina dokunmak     (I)
 *    3. EKSIK IMHA     → bir tabloyu atlayip "imha edildi" demek        (K/E)
 *    4. YARIM IMHA     → yarisi silinmis firma birakmak                   (A)
 *  Ayrica: silinmemesi gerekenleri silmek (S), havuz/seed satirini silmek (H),
 *  baska firmanin teklifini sessizce degistirmek (C), isi hic baglamamak (J).
 *
 *  SAHTE PRISMA `where`i GERCEKTEN UYGULAR (kaydeden casus DEGIL): esitlik,
 *  `null`, `in`, `not`, `lt`, `OR` gercekten suzer; bilinmeyen operator
 *  GURULTULU duser. `$transaction` anlik goruntu alir ve firlatan islemi
 *  GERI ALIR — atomiklik (§5.6) olculebilsin.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';

import {
  FIRMA_BOSALTILACAK_ALANLAR,
  FIRMA_IMHA_ADI,
  KULLANICI_ANONIM_ALANLARI,
  SILINECEKLER,
  SILINMEZLER,
  cakisanModeller,
  imhaEpostasi,
  kapsamDisiModeller,
  semadaOlmayanKayitlar,
} from '../src/ozellik/imha/imha-listesi';
import {
  CaprazFirmaBagiHatasi,
  IMHA_AKTORU,
  IMHA_FIRMA_TIPI,
  IMHA_UYE_TIPI,
  ImhaServisi,
} from '../src/ozellik/imha/imha.servisi';
import { ImhaJob } from '../src/ozellik/imha/imha.job';
import {
  DENEME_KAYDI_SAKLAMA_GUN,
  DENEME_KAYDI_SAKLAMA_YIL,
} from '../src/ozellik/imha/saklama-sureleri';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
  } else {
    failed++;
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

const KOK = path.resolve(__dirname, '..', '..');
const oku = (goreli: string) => fs.readFileSync(path.join(KOK, goreli), 'utf-8');

/**
 * ⚠ KAYNAK TARAMASI YORUMU SAYMAZ. Bu depoda olculmus hata sinifi: "mutasyon
 *   deseni yorumda eslesirse kodu degistirmez". Ayni tuzak DENETIMDE de var —
 *   `user.delete()` cumlesi aciklama blogunda geciyor diye "cagriliyor"
 *   demek yalanci kirmizi uretir. Once yorumlari at, sonra ara.
 */
const yorumsuz = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ═══════════════════════════════════════════════════════════════════════════
//  SAHTE PRISMA
// ═══════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

function esles(satir: Satir, where: any): boolean {
  if (!where) return true;
  for (const [alan, kosul] of Object.entries(where)) {
    if (alan === 'OR') {
      if (!(kosul as any[]).some((k) => esles(satir, k))) return false;
      continue;
    }
    if (alan === 'AND') {
      if (!(kosul as any[]).every((k) => esles(satir, k))) return false;
      continue;
    }
    if (alan === 'NOT') {
      if (esles(satir, kosul)) return false;
      continue;
    }
    // ⚠⚠ GERCEK PRISMA DAVRANISI: `undefined` deger SUZGECI DUSURUR.
    //    `deleteMany({ where: { firmaId: undefined } })` TUM TABLOYU siler.
    //    Sahte Prisma bunu taklit ETMEZSE, guvenlik kapisini olcen test
    //    bos bir tiyatro olur (kapi kaldirilinca yine yesil kalirdi —
    //    ilk yazimda TAM OLARAK bu oldu, M5 mutasyonu hayatta kaldi).
    if (kosul === undefined) continue;
    const deger = satir[alan];
    if (kosul === null) {
      if (deger !== null && deger !== undefined) return false;
      continue;
    }
    if (kosul !== null && typeof kosul === 'object' && !(kosul instanceof Date)) {
      const k = kosul as any;
      const anahtarlar = Object.keys(k);
      for (const op of anahtarlar) {
        if (op === 'in') {
          if (deger === null || deger === undefined) return false;
          if (!(k.in as any[]).includes(deger)) return false;
        } else if (op === 'notIn') {
          if ((k.notIn as any[]).includes(deger)) return false;
        } else if (op === 'not') {
          if (k.not === null) {
            if (deger === null || deger === undefined) return false;
          } else if (deger === k.not) {
            return false;
          }
        } else if (op === 'lt') {
          if (deger === null || deger === undefined) return false;
          if (!(new Date(deger).getTime() < new Date(k.lt).getTime())) return false;
        } else if (op === 'gt') {
          if (deger === null || deger === undefined) return false;
          if (!(new Date(deger).getTime() > new Date(k.gt).getTime())) return false;
        } else if (op === 'equals') {
          if (deger !== k.equals) return false;
        } else if (op === 'startsWith') {
          if (typeof deger !== 'string' || !deger.startsWith(k.startsWith)) return false;
        } else {
          // ⚠ SESSIZ "eslesti" YOK: bilinmeyen operator gurultulu duser.
          throw new Error(`SAHTE PRISMA: bilinmeyen operator "${op}"`);
        }
      }
      continue;
    }
    if (deger instanceof Date && kosul instanceof Date) {
      if (deger.getTime() !== kosul.getTime()) return false;
      continue;
    }
    if (deger !== kosul) return false;
  }
  return true;
}

interface Iz {
  cagrilar: Array<{ tablo: string; islem: string; arg: any }>;
  ham: string[];
}

function tabloYap(ad: string, satirlar: Satir[], iz: Iz) {
  const kaydet = (islem: string, arg: any) => iz.cagrilar.push({ tablo: ad, islem, arg });
  const bul = (where: any) => satirlar.filter((s) => esles(s, where));
  const suz = (s: Satir, select: any) => {
    if (!select) return { ...s };
    const c: Satir = {};
    for (const k of Object.keys(select)) c[k] = s[k] ?? null;
    return c;
  };
  return {
    findMany: async (a: any = {}) => {
      kaydet('findMany', a);
      let sonuc = bul(a.where);
      if (a.take !== undefined) sonuc = sonuc.slice(0, a.take);
      return sonuc.map((s) => suz(s, a.select));
    },
    findFirst: async (a: any = {}) => {
      kaydet('findFirst', a);
      const s = bul(a.where)[0];
      return s ? suz(s, a.select) : null;
    },
    count: async (a: any = {}) => {
      kaydet('count', a);
      return bul(a.where).length;
    },
    create: async (a: any) => {
      kaydet('create', a);
      const yeni: Satir = { id: a.data?.id ?? `${ad}-${satirlar.length + 1}`, ...a.data };
      satirlar.push(yeni);
      return yeni;
    },
    update: async (a: any) => {
      kaydet('update', a);
      const s = bul(a.where)[0];
      if (!s) throw new Error(`SAHTE PRISMA: ${ad}.update — satir yok`);
      Object.assign(s, a.data);
      return s;
    },
    deleteMany: async (a: any = {}) => {
      kaydet('deleteMany', a);
      // ⚠ SUZGECSIZ SILME TESPITI: gercek Prisma'da `where: {}` ya da
      //   `where: { x: undefined }` TUM TABLOYU siler. Sahte Prisma bunu
      //   SESSIZCE yapmaz, isaretler ki test gorebilsin.
      const bos =
        !a.where ||
        Object.keys(a.where).length === 0 ||
        Object.values(a.where).every((v) => v === undefined);
      if (bos) iz.ham.push(`SUZGECSIZ-DELETEMANY:${ad}`);
      const kalan = satirlar.filter((s) => !esles(s, a.where));
      const n = satirlar.length - kalan.length;
      satirlar.length = 0;
      satirlar.push(...kalan);
      return { count: n };
    },
  };
}

function canlandir(s: Satir): Satir {
  const yeni: Satir = {};
  for (const [k, v] of Object.entries(s)) {
    yeni[k] =
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) ? new Date(v) : v;
  }
  return yeni;
}

function sahtePrisma(veri: Record<string, Satir[]>) {
  const iz: Iz = { cagrilar: [], ham: [] };
  const p: any = {
    _iz: iz,
    _veri: veri,
    $queryRaw: async (parcalar: TemplateStringsArray, ...degerler: any[]) => {
      const metin = parcalar.reduce(
        (a, s, i) => a + s + (i < degerler.length ? String(degerler[i]) : ''),
        '',
      );
      iz.ham.push(metin);
      return [{ kilit: 'ok' }];
    },
    $transaction: async (fn: any) => {
      const yedek = JSON.parse(JSON.stringify(veri));
      try {
        return await fn(vekil);
      } catch (e) {
        for (const [ad, satirlar] of Object.entries(veri)) {
          satirlar.length = 0;
          satirlar.push(...(yedek[ad] ?? []).map(canlandir));
        }
        throw e;
      }
    },
  };
  for (const [ad, satirlar] of Object.entries(veri)) p[ad] = tabloYap(ad, satirlar, iz);
  // Bilinmeyen tablo BOS doner, `undefined` DEGIL: servis 30+ tabloya
  // dokunuyor, her fixture'a hepsini elle yazmak testi konusundan uzaklastirir.
  const vekil: any = new Proxy(p, {
    get(hedef: any, anahtar: string | symbol) {
      if (typeof anahtar !== 'string' || anahtar in hedef) return hedef[anahtar as any];
      if (anahtar.startsWith('$') || anahtar.startsWith('_')) return undefined;
      veri[anahtar] = [];
      hedef[anahtar] = tabloYap(anahtar, veri[anahtar], iz);
      return hedef[anahtar];
    },
  });
  return vekil;
}

function servisYap(p: any): ImhaServisi {
  return new ImhaServisi(p as any);
}

// ═══════════════════════════════════════════════════════════════════════════
//  IKI FIRMALI FIXTURE — A imha edilir, B'nin TEK SATIRI bile degismemeli
// ═══════════════════════════════════════════════════════════════════════════
const GECMIS = new Date('2026-09-01T00:00:00Z');
const GELECEK = new Date('2026-12-01T00:00:00Z');
const SIMDI = new Date('2026-09-21T00:00:00Z');

function fixture(): Record<string, Satir[]> {
  return {
    firma: [
      {
        id: 'A',
        ad: 'A Muhendislik',
        unvan: 'A Muhendislik Ltd Sti',
        yetkiliEposta: 'sahip@a.test',
        faturaEposta: 'fatura@a.test',
        vergiNo: '1234567890',
        vergiDairesi: 'Kadikoy',
        tcKimlikNo: null,
        faturaAdresi: 'A sokak 1',
        il: 'Istanbul',
        ilce: 'Kadikoy',
        telefon: '5551112233',
        logoBytes: 'LOGO-BYTES',
        logoMime: 'image/png',
        imhaTarihi: GECMIS,
      },
      {
        id: 'B',
        ad: 'B Muhendislik',
        unvan: 'B Muhendislik AS',
        yetkiliEposta: 'sahip@b.test',
        faturaEposta: 'fatura@b.test',
        vergiNo: '9999999999',
        vergiDairesi: 'Sisli',
        tcKimlikNo: null,
        faturaAdresi: 'B sokak 2',
        il: 'Istanbul',
        ilce: 'Sisli',
        telefon: '5559998877',
        logoBytes: 'B-LOGO',
        logoMime: 'image/png',
        imhaTarihi: null,
      },
    ],
    user: [
      {
        id: 'A1', email: 'a1@a.test', firmaId: 'A', ad: 'Alparslan', soyad: 'Vurankaya',
        telefon: '5550001', kapatilanEposta: 'gercek-a1@a.test',
        mfaSirriSifreli: 'SIFRELI-SIR', mfaBekleyenSirSifreli: null,
        deletedAt: GECMIS, imhaTarihi: GECMIS, kapatmaNedeni: 'kendi',
      },
      {
        id: 'A2', email: 'a2@a.test', firmaId: 'A', ad: 'Ayse', soyad: 'Yilmaz',
        telefon: '5550002', kapatilanEposta: null,
        mfaSirriSifreli: null, mfaBekleyenSirSifreli: null,
        deletedAt: GECMIS, imhaTarihi: GECMIS, kapatmaNedeni: 'firmaKapandi',
      },
      {
        id: 'B1', email: 'b1@b.test', firmaId: 'B', ad: 'Burak', soyad: 'Kaya',
        telefon: '5559991', kapatilanEposta: null,
        mfaSirriSifreli: 'B-SIR', mfaBekleyenSirSifreli: null,
        deletedAt: null, imhaTarihi: null, kapatmaNedeni: null,
      },
    ],
    // MIRAS satir: `firmaId` bos, sahibi A2 → A imhasinda GITMELI
    quote: [
      { id: 'qA1', firmaId: 'A', userId: 'A1', formatId: 'fA', sheets: 'A-GRID' },
      { id: 'qA2', firmaId: null, userId: 'A2', formatId: null, sheets: 'A-MIRAS-GRID' },
      { id: 'qB1', firmaId: 'B', userId: 'B1', formatId: 'fB', sheets: 'B-GRID' },
    ],
    quoteItem: [
      { id: 'iA1', quoteId: 'qA1', laborFirmaId: 'lfA', materialName: 'Boru' },
      { id: 'iA2', quoteId: 'qA2', laborFirmaId: null, materialName: 'Vana' },
      { id: 'iB1', quoteId: 'qB1', laborFirmaId: 'lfB', materialName: 'Fitting' },
    ],
    quoteExport: [
      { id: 'eA1', quoteId: 'qA1', xlsxBytes: 'A-XLSX' },
      { id: 'eB1', quoteId: 'qB1', xlsxBytes: 'B-XLSX' },
    ],
    quoteFormat: [
      { id: 'fA', firmaId: 'A', userId: 'A1', fileBytes: 'A-FORMAT' },
      { id: 'fB', firmaId: 'B', userId: 'B1', fileBytes: 'B-FORMAT' },
    ],
    userLibrary: [
      { id: 'ulA1', firmaId: 'A', userId: 'A1' },
      { id: 'ulA2', firmaId: null, userId: 'A2' },
      { id: 'ulB', firmaId: 'B', userId: 'B1' },
    ],
    kutuphaneOzelFiyatYedegi: [
      { userLibraryId: 'ulA1', firmaId: 'A', eskiCustomPrice: 10 },
      { userLibraryId: 'ulA2', firmaId: null, eskiCustomPrice: 11 },
      { userLibraryId: 'ulB', firmaId: 'B', eskiCustomPrice: 12 },
    ],
    libraryList: [
      { id: 'llA', firmaId: 'A', userId: 'A1' },
      { id: 'llB', firmaId: 'B', userId: 'B1' },
    ],
    userBrandLibrary: [
      { id: 'ubA', firmaId: 'A', userId: 'A1', sheets: 'A-SHEETS' },
      { id: 'ubB', firmaId: 'B', userId: 'B1', sheets: 'B-SHEETS' },
    ],
    priceList: [
      { id: 'plA', ownerFirmaId: 'A', ownerUserId: 'A1' },
      { id: 'plAMiras', ownerFirmaId: null, ownerUserId: 'A2' },
      { id: 'plHAVUZ', ownerFirmaId: null, ownerUserId: null },
      { id: 'plB', ownerFirmaId: 'B', ownerUserId: 'B1' },
    ],
    productIndex: [
      { id: 'piA', ownerFirmaId: 'A', ownerUserId: 'A1' },
      { id: 'piHAVUZ', ownerFirmaId: null, ownerUserId: null },
      { id: 'piB', ownerFirmaId: 'B', ownerUserId: 'B1' },
    ],
    laborFirm: [
      { id: 'lfA', firmaId: 'A', userId: 'A1', name: 'A Iscilik' },
      { id: 'lfB', firmaId: 'B', userId: 'B1', name: 'B Iscilik' },
    ],
    // ⚠ TUZAK 1: bu iki tablonun `firmaId`si LaborFirm.id'dir ('lfA'), 'A' DEGIL.
    laborPriceList: [
      { id: 'lplA', firmaId: 'lfA', sheets: 'A-ISCILIK' },
      { id: 'lplB', firmaId: 'lfB', sheets: 'B-ISCILIK' },
    ],
    laborPrice: [
      { id: 'lpA', firmaId: 'lfA', priceListId: 'lplA', unitPrice: 100 },
      { id: 'lpB', firmaId: 'lfB', priceListId: 'lplB', unitPrice: 200 },
    ],
    eslesmeHafizasi: [
      { id: 'ehA', userId: 'A1', firmaId: 'A' },
      { id: 'ehB', userId: 'B1', firmaId: 'B' },
    ],
    terminologyAlias: [
      { id: 'taA', userId: 'A1', firmaId: 'A', createdBy: 'user' },
      { id: 'taSEED', userId: null, firmaId: null, createdBy: 'seed' },
      { id: 'taB', userId: 'B1', firmaId: 'B', createdBy: 'user' },
    ],
    brandMaterialType: [
      { id: 'bmA', userId: 'A1', firmaId: 'A', createdBy: 'user' },
      { id: 'bmSEED', userId: null, firmaId: null, createdBy: 'seed' },
      { id: 'bmB', userId: 'B1', firmaId: 'B', createdBy: 'user' },
    ],
    ceviriDuzeltmesi: [
      { id: 'cdA', firmaId: 'A' },
      { id: 'cdB', firmaId: 'B' },
    ],
    ceviriDuzeltmeOlayi: [
      { id: 'cdoA', firmaId: 'A', kullaniciEposta: 'a1@a.test' },
      { id: 'cdoB', firmaId: 'B', kullaniciEposta: 'b1@b.test' },
    ],
    ceviriTuketimi: [
      { id: 'ctA', firmaId: 'A', userId: 'A1' },
      { id: 'ctB', firmaId: 'B', userId: 'B1' },
    ],
    aiUsageLog: [
      { id: 'aiA', firmaId: 'A', userId: 'A1' },
      { id: 'aiAMiras', firmaId: null, userId: 'A2' },
      { id: 'aiB', firmaId: 'B', userId: 'B1' },
    ],
    dwgDosya: [
      { id: 'dA', firmaId: 'A', olusturanId: 'A1', fileId: 'f-a' },
      { id: 'dB', firmaId: 'B', olusturanId: 'B1', fileId: 'f-b' },
    ],
    dogrulanmisAlanAdi: [
      { id: 'daA', firmaId: 'A', saglayiciId: 'sagA' },
      { id: 'daB', firmaId: 'B', saglayiciId: 'sagB' },
    ],
    firmaKimlikSaglayici: [
      { id: 'sagA', firmaId: 'A' },
      { id: 'sagB', firmaId: 'B' },
    ],
    ssoAkisi: [
      { id: 'ssoA', saglayiciId: 'sagA', baslatanUserId: null, dogrulanmisKimlik: 'KIMLIK' },
      { id: 'ssoA2', saglayiciId: 'baska', baslatanUserId: 'A2', dogrulanmisKimlik: 'KIMLIK2' },
      { id: 'ssoB', saglayiciId: 'sagB', baslatanUserId: 'B1', dogrulanmisKimlik: 'B-KIMLIK' },
    ],
    kullaniciDisKimlik: [
      { id: 'dkA', userId: 'A1', epostaAnlik: 'a1@kurumsal.test' },
      { id: 'dkB', userId: 'B1', epostaAnlik: 'b1@kurumsal.test' },
    ],
    firmaDavet: [
      { id: 'fdA', firmaId: 'A', eposta: 'davet@a.test' },
      { id: 'fdB', firmaId: 'B', eposta: 'davet@b.test' },
    ],
    firmaOlayi: [
      { id: 'foA', firmaId: 'A', hedefEposta: 'a2@a.test' },
      { id: 'foB', firmaId: 'B', hedefEposta: 'b1@b.test' },
    ],
    passwordResetToken: [
      { id: 'prA', userId: 'A1' },
      { id: 'prB', userId: 'B1' },
    ],
    emailVerificationToken: [
      { id: 'evA', userId: 'A1' },
      { id: 'evB', userId: 'B1' },
    ],
    mfaKurtarmaKodu: [
      { id: 'mkA', userId: 'A1' },
      { id: 'mkB', userId: 'B1' },
    ],
    userSubscription: [
      { id: 'usA', userId: 'A1', firmaId: 'A' },
      { id: 'usB', userId: 'B1', firmaId: 'B' },
    ],

    // ── §5.5 SILINMEYECEKLER ────────────────────────────────────────────────
    fatura: [{ id: 'fatA', abonelikId: 'abA', musteriUnvan: 'A Muhendislik Ltd Sti' }],
    abonelik: [{ id: 'abA', firmaId: 'A' }],
    abonelikOlayi: [{ id: 'aoA', abonelikId: 'abA' }],
    abonelikBaslatma: [{ id: 'abbA', firmaId: 'A', epostaNormal: 'a1@a.test' }],
    denemeKullanimi: [{ id: 'dkuA', firmaId: 'A', kullaniciId: 'A1', epostaNormal: 'a1@a.test' }],
    havaleOdemesi: [{ id: 'hoA', abonelikId: 'abA', onaylayanId: 'admin' }],
    webhookOlayi: [{ id: 'whA', abonelikKodu: 'k1' }],
    yoneticiOlayi: [
      { id: 'yoEski', yoneticiId: 'admin', yoneticiEpsta: 'a@x', tip: 'rol.degisti', hedefKullaniciId: 'A1', yeniDeger: 'admin' },
    ],
    translation: [{ id: 'trA', sourceText: 'Boru', target: 'Pipe' }],
    brand: [{ id: 'brA', name: 'Marka' }],
    material: [{ id: 'mtA', name: 'Boru' }],
    materialPrice: [{ id: 'mpA', materialId: 'mtA', brandId: 'brA', priceListId: 'plHAVUZ' }],
    laborItem: [{ id: 'liA', name: 'Montaj' }],
    paket: [{ id: 'pkA', kod: 'pro' }],
    paketSurumu: [{ id: 'psA', paketId: 'pkA' }],
    systemSettings: [{ id: 'ssA' }],
  };
}

/** B firmasina ait butun satirlarin kimlikleri — imhadan sonra HEPSI durmali. */
const B_SATIRLARI: Array<[string, string, string]> = [
  ['firma', 'id', 'B'],
  ['user', 'id', 'B1'],
  ['quote', 'id', 'qB1'],
  ['quoteItem', 'id', 'iB1'],
  ['quoteExport', 'id', 'eB1'],
  ['quoteFormat', 'id', 'fB'],
  ['userLibrary', 'id', 'ulB'],
  ['kutuphaneOzelFiyatYedegi', 'userLibraryId', 'ulB'],
  ['libraryList', 'id', 'llB'],
  ['userBrandLibrary', 'id', 'ubB'],
  ['priceList', 'id', 'plB'],
  ['productIndex', 'id', 'piB'],
  ['laborFirm', 'id', 'lfB'],
  ['laborPriceList', 'id', 'lplB'],
  ['laborPrice', 'id', 'lpB'],
  ['eslesmeHafizasi', 'id', 'ehB'],
  ['terminologyAlias', 'id', 'taB'],
  ['brandMaterialType', 'id', 'bmB'],
  ['ceviriDuzeltmesi', 'id', 'cdB'],
  ['ceviriDuzeltmeOlayi', 'id', 'cdoB'],
  ['ceviriTuketimi', 'id', 'ctB'],
  ['aiUsageLog', 'id', 'aiB'],
  ['dwgDosya', 'id', 'dB'],
  ['dogrulanmisAlanAdi', 'id', 'daB'],
  ['firmaKimlikSaglayici', 'id', 'sagB'],
  ['ssoAkisi', 'id', 'ssoB'],
  ['kullaniciDisKimlik', 'id', 'dkB'],
  ['firmaDavet', 'id', 'fdB'],
  ['firmaOlayi', 'id', 'foB'],
  ['passwordResetToken', 'id', 'prB'],
  ['emailVerificationToken', 'id', 'evB'],
  ['mfaKurtarmaKodu', 'id', 'mkB'],
  ['userSubscription', 'id', 'usB'],
];

/** A firmasina ait, imhadan sonra HICBIRI kalmamasi gereken satirlar. */
const A_SATIRLARI: Array<[string, string, string]> = [
  ['quote', 'id', 'qA1'],
  ['quote', 'id', 'qA2'],
  ['quoteItem', 'id', 'iA1'],
  ['quoteItem', 'id', 'iA2'],
  ['quoteExport', 'id', 'eA1'],
  ['quoteFormat', 'id', 'fA'],
  ['userLibrary', 'id', 'ulA1'],
  ['userLibrary', 'id', 'ulA2'],
  ['kutuphaneOzelFiyatYedegi', 'userLibraryId', 'ulA1'],
  ['kutuphaneOzelFiyatYedegi', 'userLibraryId', 'ulA2'],
  ['libraryList', 'id', 'llA'],
  ['userBrandLibrary', 'id', 'ubA'],
  ['priceList', 'id', 'plA'],
  ['priceList', 'id', 'plAMiras'],
  ['productIndex', 'id', 'piA'],
  ['laborFirm', 'id', 'lfA'],
  ['laborPriceList', 'id', 'lplA'],
  ['laborPrice', 'id', 'lpA'],
  ['eslesmeHafizasi', 'id', 'ehA'],
  ['terminologyAlias', 'id', 'taA'],
  ['brandMaterialType', 'id', 'bmA'],
  ['ceviriDuzeltmesi', 'id', 'cdA'],
  ['ceviriDuzeltmeOlayi', 'id', 'cdoA'],
  ['ceviriTuketimi', 'id', 'ctA'],
  ['aiUsageLog', 'id', 'aiA'],
  ['aiUsageLog', 'id', 'aiAMiras'],
  ['dwgDosya', 'id', 'dA'],
  ['dogrulanmisAlanAdi', 'id', 'daA'],
  ['firmaKimlikSaglayici', 'id', 'sagA'],
  ['ssoAkisi', 'id', 'ssoA'],
  ['ssoAkisi', 'id', 'ssoA2'],
  ['kullaniciDisKimlik', 'id', 'dkA'],
  ['firmaDavet', 'id', 'fdA'],
  ['firmaOlayi', 'id', 'foA'],
  ['passwordResetToken', 'id', 'prA'],
  ['emailVerificationToken', 'id', 'evA'],
  ['mfaKurtarmaKodu', 'id', 'mkA'],
  ['userSubscription', 'id', 'usA'],
];

const varMi = (veri: Record<string, Satir[]>, tablo: string, alan: string, deger: string) =>
  (veri[tablo] ?? []).some((s) => s[alan] === deger);

/**
 * ⚠ `find(...)!` KULLANMA. Satir silinmisse `!` ile erisim TypeError firlatir,
 *   kosum orada DURUR ve geriye kalan bolumler HIC kosmaz — "KIRMIZI" olur ama
 *   HANGI kuralin kirildigini SOYLEMEZ (olculdu: M2 mutasyonu boyle davrandi).
 *   Bu yardimci bos satir dondurur; assert adiyla duser.
 */
const satir = (veri: Record<string, Satir[]>, tablo: string, id: string): Satir =>
  (veri[tablo] ?? []).find((s) => s.id === id) ?? {};

// ═══════════════════════════════════════════════════════════════════════════
//  K — KAPSAYICILIK KAPISI (§5.1 · kabul 4)
// ═══════════════════════════════════════════════════════════════════════════
function bolumK(): void {
  const sema = oku('backend/prisma/schema.prisma');
  const semaModelleri = [...sema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);

  check('K1 semada model bulundu (ayristirici calisiyor)', semaModelleri.length >= 40,
    `bulunan=${semaModelleri.length}`);

  const disi = kapsamDisiModeller(semaModelleri);
  check('K2 semadaki HER tablo bir karara bagli (silinecek ya da silinmez)',
    disi.length === 0, `kapsam disi: ${disi.join(', ')}`);

  const bayat = semadaOlmayanKayitlar(semaModelleri);
  check('K3 listede olup semada OLMAYAN model yok (bayat kayit)',
    bayat.length === 0, bayat.join(', '));

  check('K4 ayni model hem silme hem koruma listesinde DEGIL',
    cakisanModeller().length === 0, cakisanModeller().join(', '));

  // MEKANIZMA TESTI: kapi gercekten kirmiziya doner mi? Semaya dokunmadan,
  // fonksiyona uydurma bir model adi verilerek olculur.
  const uydurma = kapsamDisiModeller([...semaModelleri, 'YarinEklenenTablo']);
  check('K5 yarin eklenen listelenmemis tablo KAPIYI KIRMIZI yapar',
    uydurma.length === 1 && uydurma[0] === 'YarinEklenenTablo', uydurma.join(','));

  check('K6 her silme kuralinin gerekcesi DOLU',
    SILINECEKLER.every((k) => k.neden.trim().length > 20));
  check('K7 her koruma kuralinin gerekcesi DOLU',
    SILINMEZLER.every((k) => k.neden.trim().length > 20));
  check('K8 her silme kuralinin kolonu ve ekseni DOLU',
    SILINECEKLER.every((k) => !!k.kolon && !!k.eksen && !!k.erisimci));

  // Erisimci adi model adinin ilk harfi kucultulmus hali olmali — yanlis ad
  // calisma aninda `tx[erisimci]` undefined verirdi.
  const yanlisErisimci = SILINECEKLER.filter(
    (k) => k.erisimci !== k.model.charAt(0).toLowerCase() + k.model.slice(1),
  );
  check('K9 erisimci adlari model adiyla tutarli', yanlisErisimci.length === 0,
    yanlisErisimci.map((k) => k.model).join(','));

  // Ayni (model, kolon) ikilisi iki kez yazilmamali (kopyala-yapistir hatasi)
  const ikili = SILINECEKLER.map((k) => `${k.model}.${k.kolon}`);
  check('K10 ayni model+kolon iki kez yazilmamis', new Set(ikili).size === ikili.length);

  // `mirasFirmasizDaAl` YALNIZ firma ekseninde anlamlidir (servis yalniz
  // orada okuyor); baska eksende yazilmis olsaydi OLU BAYRAK olurdu.
  const oluBayrak = SILINECEKLER.filter((k) => k.mirasFirmasizDaAl && k.eksen !== 'firma');
  check('K11 `mirasFirmasizDaAl` yalniz firma ekseninde (olu bayrak yok)',
    oluBayrak.length === 0, oluBayrak.map((k) => k.model).join(','));

  // §5.5 adiyla istenen dort koruma listede mi?
  for (const m of ['Fatura', 'Abonelik', 'DenemeKullanimi', 'YoneticiOlayi']) {
    check(`K12 §5.5 "${m}" koruma listesinde`, SILINMEZLER.some((k) => k.model === m));
  }
  const deneme = SILINMEZLER.find((k) => k.model === 'DenemeKullanimi');
  check('K13 deneme hakki izi ADIYLA ve gerekcesiyle istisna',
    !!deneme && /SILMEMELI|deneme/i.test(deneme.neden));

  // ⚠ TUZAK 1 KAPISI: LaborPriceList/LaborPrice `firmaId`si semada LaborFirm'e
  //   isaret ediyor. Kural `firma` eksenine cekilirse SIFIR satir siler.
  for (const m of ['LaborPriceList', 'LaborPrice']) {
    const blok = new RegExp(`model ${m} \\{[\\s\\S]*?\\n\\}`).exec(sema)?.[0] ?? '';
    const laborFirmeIsaret = /firma\s+LaborFirm\s+@relation\(fields:\s*\[firmaId\]/.test(blok);
    const kural = SILINECEKLER.find((k) => k.model === m);
    check(`K14 ${m}.firmaId semada LaborFirm'e isaret ediyor (tuzak gercek)`, laborFirmeIsaret);
    check(`K15 ${m} kurali "iscilikFirmasi" ekseninde (Firma.id ile SIFIR satir silerdi)`,
      kural?.eksen === 'iscilikFirmasi', `eksen=${kural?.eksen}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  D — YALNIZ `imhaTarihi` (kabul olcutu 2)
// ═══════════════════════════════════════════════════════════════════════════
async function bolumD(): Promise<void> {
  const jobKaynak = oku('backend/src/ozellik/imha/imha.job.ts');
  const servisKaynak = oku('backend/src/ozellik/imha/imha.servisi.ts');
  check('D1 imha isi KODUNDA `deletedAt` HIC gecmiyor',
    !/deletedAt/.test(yorumsuz(jobKaynak)), 'job kaynaginda deletedAt var');
  check('D2 imha servisi KODUNDA `deletedAt` HIC gecmiyor',
    !/deletedAt/.test(yorumsuz(servisKaynak)), 'servis kaynaginda deletedAt var');
  check('D3 aday secimi `imhaTarihi` ile yapiliyor',
    /imhaTarihi:\s*\{\s*lt:\s*simdi\s*\}/.test(jobKaynak));

  // DAVRANIS: `deletedAt` dolu ama `imhaTarihi` GELECEKTE → SILINMEZ.
  const veri = fixture();
  veri['firma'][0].imhaTarihi = GELECEK;
  veri['user'][0].imhaTarihi = GELECEK;
  veri['user'][1].imhaTarihi = GELECEK;
  const p = sahtePrisma(veri);
  const job = new ImhaJob(p as any, servisYap(p));
  await job.kosumYap(SIMDI);

  check('D4 `deletedAt` dolu ama `imhaTarihi` GELECEK → hicbir sey silinmedi',
    varMi(veri, 'quote', 'id', 'qA1') && varMi(veri, 'userLibrary', 'id', 'ulA1'));
  check('D5 30 gun dolmadan kullanicinin e-postasi DEGISMEDI',
    veri['user'][0].email === 'a1@a.test');

  // DAVRANIS: `deletedAt` BOS ama `imhaTarihi` GECMISTE → SILINIR.
  const veri2 = fixture();
  veri2['firma'][0].imhaTarihi = GECMIS;
  veri2['user'][0].deletedAt = null;
  veri2['user'][1].deletedAt = null;
  const p2 = sahtePrisma(veri2);
  await new ImhaJob(p2 as any, servisYap(p2)).kosumYap(SIMDI);
  check('D6 `deletedAt` BOS ama `imhaTarihi` GECMIS → imha KOSTU',
    !varMi(veri2, 'quote', 'id', 'qA1'));
}

// ═══════════════════════════════════════════════════════════════════════════
//  E + I + S + H — TAM IMHA · IZOLASYON · KORUMA · HAVUZ
// ═══════════════════════════════════════════════════════════════════════════
async function bolumEIS(): Promise<void> {
  const veri = fixture();
  const p = sahtePrisma(veri);
  const sonuc = await servisYap(p).firmaImhaEt('A');

  // ── E: A'nin HICBIR satiri kalmadi ────────────────────────────────────
  const kalanA = A_SATIRLARI.filter(([t, a, d]) => varMi(veri, t, a, d));
  check('E1 A firmasinin TUM icerigi silindi (eksik imha yok)', kalanA.length === 0,
    `kalan: ${kalanA.map(([t, , d]) => `${t}:${d}`).join(', ')}`);

  check('E2 MIRAS satir (firmaId bos, sahibi A2) da silindi',
    !varMi(veri, 'quote', 'id', 'qA2') && !varMi(veri, 'userLibrary', 'id', 'ulA2'));
  check('E3 ⚠TUZAK1: iscilik fiyat listesi GERCEKTEN silindi (0 satir degil)',
    !varMi(veri, 'laborPriceList', 'id', 'lplA') && (sonuc.sayilar['LaborPriceList'] ?? 0) === 1,
    `sayi=${sonuc.sayilar['LaborPriceList']}`);
  check('E4 ⚠TUZAK1: iscilik birim fiyatlari silindi',
    !varMi(veri, 'laborPrice', 'id', 'lpA') && (sonuc.sayilar['LaborPrice'] ?? 0) === 1);
  check('E5 SsoAkisi IKI koldan da temizlendi (saglayici + baslatan kullanici)',
    !varMi(veri, 'ssoAkisi', 'id', 'ssoA') && !varMi(veri, 'ssoAkisi', 'id', 'ssoA2'));

  // ── §5.2 firma satiri KALIR, alanlari bosalir ─────────────────────────
  const firmaA = satir(veri, 'firma', 'A');
  check('E6 firma SATIRI ve KIMLIGI duruyor (bag kopmadi)', !!firmaA && firmaA.id === 'A');
  const doluKalan = FIRMA_BOSALTILACAK_ALANLAR.filter((a) => firmaA[a] !== null);
  check('E7 firmanin butun kimlik/iletisim alanlari bosaldi', doluKalan.length === 0,
    doluKalan.join(','));
  check('E8 `Firma.ad` ZORUNLU oldugu icin null degil, tanimsiz degere cekildi',
    firmaA.ad === FIRMA_IMHA_ADI, String(firmaA.ad));
  check('E9 logo ikilisi gitti', firmaA.logoBytes === null && firmaA.logoMime === null);

  // ── §5.2 kullanicilarin kisisel bilgileri ─────────────────────────────
  const a1 = satir(veri, 'user', 'A1');
  check('E10 hesap SATIRI duruyor ("Hazirlayan" bagi kirilmadi)', !!a1);
  check('E11 e-posta anonim ve CAKISMAYAN bir degere cekildi',
    a1.email === imhaEpostasi('A1'), String(a1.email));
  check('E12 ⚠ `kapatilanEposta` ATLANMADI (gercek adres orada duruyordu)',
    a1.kapatilanEposta === null, String(a1.kapatilanEposta));
  const doluKisisel = KULLANICI_ANONIM_ALANLARI.filter((a) => a1[a] !== null);
  check('E13 ad/soyad/telefon/TOTP sirri temizlendi', doluKisisel.length === 0,
    doluKisisel.join(','));
  check('E14 iki kullanici da anonimlesti, e-postalari CAKISMIYOR',
    satir(veri, 'user', 'A2').email === imhaEpostasi('A2') &&
      new Set(veri['user'].map((u) => u.email)).size === 3);

  // ── I: B firmasinin TEK SATIRI bile degismemeli (kabul olcutu 3) ──────
  const kayipB = B_SATIRLARI.filter(([t, a, d]) => !varMi(veri, t, a, d));
  check('I1 A imhasi B firmasinin HICBIR satirina dokunmadi', kayipB.length === 0,
    `kaybolan: ${kayipB.map(([t, , d]) => `${t}:${d}`).join(', ')}`);
  const b1 = satir(veri, 'user', 'B1');
  check('I2 B kullanicisinin kisisel bilgileri DEGISMEDI',
    b1.email === 'b1@b.test' && b1.ad === 'Burak' && b1.mfaSirriSifreli === 'B-SIR');
  const firmaB = satir(veri, 'firma', 'B');
  check('I3 B firmasinin alanlari DEGISMEDI',
    firmaB.unvan === 'B Muhendislik AS' && firmaB.logoBytes === 'B-LOGO');
  check('I4 SUZGECSIZ deleteMany HIC cagrilmadi',
    !(p._iz.ham as string[]).some((h) => h.startsWith('SUZGECSIZ-DELETEMANY')),
    (p._iz.ham as string[]).filter((h) => h.startsWith('SUZGECSIZ')).join(','));

  // ── S: §5.5 silinmeyecekler (kabul olcutu 12) ─────────────────────────
  const korunmasi: Array<[string, string]> = [
    ['fatura', 'fatA'], ['abonelik', 'abA'], ['abonelikOlayi', 'aoA'],
    ['abonelikBaslatma', 'abbA'], ['denemeKullanimi', 'dkuA'],
    ['havaleOdemesi', 'hoA'], ['webhookOlayi', 'whA'], ['yoneticiOlayi', 'yoEski'],
    ['translation', 'trA'], ['brand', 'brA'], ['material', 'mtA'],
    ['materialPrice', 'mpA'], ['laborItem', 'liA'], ['paket', 'pkA'],
    ['paketSurumu', 'psA'], ['systemSettings', 'ssA'],
  ];
  const silinenKoruma = korunmasi.filter(([t, d]) => !varMi(veri, t, 'id', d));
  check('S1 §5.5 fatura/odeme/abonelik/deneme/yonetici kayitlari DURUYOR',
    silinenKoruma.length === 0, silinenKoruma.map(([t]) => t).join(','));
  check('S2 deneme hakki izi silinmedi (kapatip ayni adresle yeni deneme alinamaz)',
    varMi(veri, 'denemeKullanimi', 'id', 'dkuA'));
  check('S3 fatura kendi musteri kopyasini hala tasiyor (firma bosaldi ama fatura tam)',
    (veri['fatura'][0] ?? {}).musteriUnvan === 'A Muhendislik Ltd Sti');

  // ── H: havuz ve seed satirlari (TUZAK 3) ──────────────────────────────
  check('H1 PLATFORM HAVUZU fiyat listesi korundu (ownerFirmaId+ownerUserId null)',
    varMi(veri, 'priceList', 'id', 'plHAVUZ'));
  check('H2 PLATFORM HAVUZU urun indeksi korundu', varMi(veri, 'productIndex', 'id', 'piHAVUZ'));
  check('H3 SEED terim eslemesi korundu (userId null)',
    varMi(veri, 'terminologyAlias', 'id', 'taSEED'));
  check('H4 SEED marka-malzeme kurali korundu',
    varMi(veri, 'brandMaterialType', 'id', 'bmSEED'));
  check('H5 A firmasinin MIRAS fiyat listesi (ownerUserId=A2) silindi',
    !varMi(veri, 'priceList', 'id', 'plAMiras'));

  // ── N: §5.6 denetim kaydi — SAYILARLA, icerik DEGIL ───────────────────
  const olay = veri['yoneticiOlayi'].find((o) => o.tip === IMHA_FIRMA_TIPI);
  check('N1 imha yonetici olay tablosuna yazildi', !!olay);
  check('N2 kayit SAYI tasiyor (teklif/kutuphane/dosya)',
    olay?.veri?.teklifSayisi === 2 && olay?.veri?.kutuphaneSatiri === 2 &&
      olay?.veri?.dwgDosyaSayisi === 1,
    JSON.stringify(olay?.veri ?? {}).slice(0, 120));
  const govde = JSON.stringify(olay ?? {});
  const sizmaBelirtecleri = [
    'a1@a.test', 'Alparslan', 'Vurankaya', 'A-GRID', 'Muhendislik', 'SIFRELI-SIR',
  ];
  // ⚠ OLCUTU ONCE DOGRULA: belirtecin kendisi bir TABLO ADININ alt dizesiyse
  //   kapi yalanci kirmizi verir (ilk yazimda "Ali" ⊂ "TerminologyAlias"
  //   yuzunden oldu). Once belirteclerin temiz oldugunu kanitla.
  const tabloAdlari = SILINECEKLER.map((k) => k.model).join(' ');
  check('N3a sizma belirtecleri tablo adlariyla CAKISMIYOR (olcut gecerli)',
    sizmaBelirtecleri.every((b) => !tabloAdlari.includes(b)),
    sizmaBelirtecleri.filter((b) => tabloAdlari.includes(b)).join(','));
  const sizan = sizmaBelirtecleri.filter((b) => govde.includes(b));
  check('N3 kayitta ICERIK yok (e-posta, ad, unvan, grid sizmadi)',
    sizan.length === 0, sizan.join(','));
  check('N4 aktor "sistem" olarak yazildi (yonetici degil)', olay?.yoneticiId === IMHA_AKTORU);

  // ── P: idempotans — ikinci kosum silmez, ikinci kayit yazmaz ──────────
  const ikinci = await servisYap(p).firmaImhaEt('A');
  check('P1 ikinci kosum "zaten imha edildi" der', ikinci.atlandi === 'zaten-imha-edildi');
  check('P2 ikinci kosum ikinci denetim kaydi YAZMAZ',
    veri['yoneticiOlayi'].filter((o) => o.tip === IMHA_FIRMA_TIPI).length === 1);
}

// ═══════════════════════════════════════════════════════════════════════════
//  A — ATOMIKLIK (§5.6 · kabul olcutu 13)
// ═══════════════════════════════════════════════════════════════════════════
async function bolumA(): Promise<void> {
  const veri = fixture();
  const p = sahtePrisma(veri);

  // Imhanin ORTASINDA (teklifler silindikten SONRA, kutuphaneden once) patlat.
  let cagri = 0;
  const gercekUserLibrary = p.userLibrary.deleteMany;
  p.userLibrary.deleteMany = async (a: any) => {
    cagri++;
    throw new Error('SIMULE EDILEN KESINTI: baglanti koptu');
  };

  let firladi = false;
  try {
    await servisYap(p).firmaImhaEt('A');
  } catch {
    firladi = true;
  }
  p.userLibrary.deleteMany = gercekUserLibrary;

  check('A1 kesinti hatayi YUTMADI, disari firlatti', firladi && cagri === 1);
  const kalan = A_SATIRLARI.filter(([t, a, d]) => varMi(veri, t, a, d));
  check('A2 YARIDA KESILDI → HICBIR SEY silinmemis (tek transaction)',
    kalan.length === A_SATIRLARI.length,
    `${A_SATIRLARI.length - kalan.length} satir silinmis kaldi`);
  check('A3 firma alanlari da bosalmadi (geri alindi)',
    satir(veri, 'firma', 'A').unvan === 'A Muhendislik Ltd Sti');
  check('A4 kullanici anonimlesmedi (geri alindi)',
    satir(veri, 'user', 'A1').email === 'a1@a.test');
  check('A5 denetim kaydi da yazilmadi (kayit varsa silme KESIN olmus demektir)',
    !veri['yoneticiOlayi'].some((o) => o.tip === IMHA_FIRMA_TIPI));

  // Kesinti sonrasi yeniden deneme calismali (imhaTarihi duruyor).
  const p2 = sahtePrisma(veri);
  const sonuc = await servisYap(p2).firmaImhaEt('A');
  check('A6 ertesi gece yeniden deneme calisiyor', !sonuc.atlandi &&
    !varMi(veri, 'quote', 'id', 'qA1'));
}

// ═══════════════════════════════════════════════════════════════════════════
//  C — §5.4 BASKA FIRMANIN SATIRI
// ═══════════════════════════════════════════════════════════════════════════
async function bolumC(): Promise<void> {
  // Bugunku kod bu bagi URETEMIYOR (quotes.service.ts firma suzgeci), ama
  // suzgec ileride kaldirilirsa kapi calismali.
  const veri = fixture();
  veri['quoteItem'].push({ id: 'iB2', quoteId: 'qB1', laborFirmaId: 'lfA', materialName: 'X' });
  const p = sahtePrisma(veri);

  let hata: any = null;
  try {
    await servisYap(p).firmaImhaEt('A');
  } catch (e) {
    hata = e;
  }
  check('C1 baska firmanin kalemi A\'nin iscilik firmasina bagliysa IMHA DURUR',
    hata instanceof CaprazFirmaBagiHatasi, String(hata));
  check('C2 durdurulan imhada A\'nin verisi de SILINMEDI (sessiz yarim imha yok)',
    varMi(veri, 'quote', 'id', 'qA1') && varMi(veri, 'laborFirm', 'id', 'lfA'));
  check('C3 B firmasinin teklif kalemi SESSIZCE DEGISMEDI',
    satir(veri, 'quoteItem', 'iB2').laborFirmaId === 'lfA');

  // Ayni kapi teklif formati bagi icin de calismali
  const veri2 = fixture();
  satir(veri2, 'quote', 'qB1').formatId = 'fA';
  const p2 = sahtePrisma(veri2);
  let hata2: any = null;
  try {
    await servisYap(p2).firmaImhaEt('A');
  } catch (e) {
    hata2 = e;
  }
  check('C4 baska firmanin teklifi A\'nin formatina bagliysa IMHA DURUR',
    hata2 instanceof CaprazFirmaBagiHatasi && hata2.bag === 'Quote.formatId', String(hata2));
  check('C5 B\'nin teklifi hala A\'nin formatini gosteriyor (degistirilmedi)',
    satir(veri2, 'quote', 'qB1').formatId === 'fA');

  // NORMAL DURUM: capraz bag YOKKEN kapi imhayi ENGELLEMEZ (yalanci alarm yok)
  const veri3 = fixture();
  const p3 = sahtePrisma(veri3);
  const ok = await servisYap(p3).firmaImhaEt('A');
  check('C6 capraz bag yokken kapi imhayi engellemiyor', !ok.atlandi &&
    !varMi(veri3, 'laborFirm', 'id', 'lfA'));
}

// ═══════════════════════════════════════════════════════════════════════════
//  U — §5.3 UYE IMHASI (firma devam ediyor)
// ═══════════════════════════════════════════════════════════════════════════
async function bolumU(): Promise<void> {
  const veri = fixture();
  // B firmasindan bir uye ayriliyor; firma DEVAM EDIYOR.
  satir(veri, 'user', 'B1').imhaTarihi = GECMIS;
  satir(veri, 'user', 'B1').kapatmaNedeni = 'ekiptenCikarildi';
  satir(veri, 'firma', 'A').imhaTarihi = null; // A bu turda disarida
  satir(veri, 'user', 'A1').imhaTarihi = null;
  satir(veri, 'user', 'A2').imhaTarihi = null;

  const p = sahtePrisma(veri);
  await new ImhaJob(p as any, servisYap(p)).kosumYap(SIMDI);

  const b1 = satir(veri, 'user', 'B1');
  check('U1 hesap SATIRI duruyor (teklifteki "Hazirlayan" bagi kirilmadi)', !!b1);
  check('U2 kisisel bilgiler anonimlesti', b1.email === imhaEpostasi('B1') &&
    b1.ad === null && b1.soyad === null && b1.telefon === null);
  check('U3 TOTP sirri temizlendi', b1.mfaSirriSifreli === null);
  check('U4 ⚠ TEKLIFLER FIRMADA KALDI (§5.3: yalniz kisisel bilgi)',
    varMi(veri, 'quote', 'id', 'qB1') && varMi(veri, 'quoteItem', 'id', 'iB1'));
  check('U5 kutuphanesi ve isciligi firmada kaldi',
    varMi(veri, 'userLibrary', 'id', 'ulB') && varMi(veri, 'laborFirm', 'id', 'lfB'));
  check('U6 teklifin "Hazirlayan" bagi hala B1\'i gosteriyor',
    satir(veri, 'quote', 'qB1').userId === 'B1');
  check('U7 kisiye ait dis kimlik silindi (kurumsal girisle GERI ACILAMAZ)',
    !varMi(veri, 'kullaniciDisKimlik', 'id', 'dkB'));
  check('U8 kisiye ait token/kurtarma kodu silindi',
    !varMi(veri, 'passwordResetToken', 'id', 'prB') &&
      !varMi(veri, 'mfaKurtarmaKodu', 'id', 'mkB'));
  check('U9 uye imhasi denetim kaydi yazildi',
    veri['yoneticiOlayi'].some((o) => o.tip === IMHA_UYE_TIPI && o.hedefKullaniciId === 'B1'));
  check('U10 A firmasinin satirlarina DOKUNULMADI',
    varMi(veri, 'quote', 'id', 'qA1') && satir(veri, 'user', 'A1').email === 'a1@a.test');
}

// ═══════════════════════════════════════════════════════════════════════════
//  G — GUVENLIK KAPISI: suzgecsiz silme imkansiz
// ═══════════════════════════════════════════════════════════════════════════
async function bolumG(): Promise<void> {
  // ── OLCUTU ONCE DOGRULA: sahte Prisma gercekten tehlikeli mi? ─────────
  // Bu ilk iki assert OLCU ALETINI sinar. Olmasaydi G2 "hicbir sey
  // silinmedi" der ve kapi kaldirilinca DA yesil kalirdi (olculdu: M5
  // mutasyonu ilk yazimda hayatta kaldi).
  const denek = sahtePrisma({ t: [{ id: '1', firmaId: 'A' }, { id: '2', firmaId: 'B' }] });
  const d = await denek.t.deleteMany({ where: { firmaId: undefined } });
  check('G0a sahte Prisma `undefined` suzgecini DUSURUYOR (gercek Prisma gibi)',
    d.count === 2 && (denek._veri.t as Satir[]).length === 0, `silinen=${d.count}`);
  check('G0b suzgecsiz deleteMany ize yaziliyor',
    (denek._iz.ham as string[]).includes('SUZGECSIZ-DELETEMANY:t'));

  // ── ASIL KAPI: kapsam degeri undefined ise imha FIRLAMALI ─────────────
  const veri = fixture();
  const p = sahtePrisma(veri);
  let firladi = false;
  let mesaj = '';
  try {
    await servisYap(p).firmaImhaEt(undefined as any);
  } catch (e: any) {
    firladi = true;
    mesaj = String(e?.message ?? e);
  }
  check('G1 kapsam degeri undefined iken imha FIRLATIR', firladi, mesaj);
  check('G1a hata guvenlik kapisindan geliyor (baska bir kaza degil)',
    /IMHA GUVENLIK KAPISI/.test(mesaj), mesaj.slice(0, 120));
  check('G2 undefined kapsamda HICBIR satir silinmedi (A da B de duruyor)',
    A_SATIRLARI.every(([t, a, dd]) => varMi(veri, t, a, dd)) &&
      B_SATIRLARI.every(([t, a, dd]) => varMi(veri, t, a, dd)));
  check('G3 suzgecsiz deleteMany HIC cagrilmadi',
    !(p._iz.ham as string[]).some((h) => h.startsWith('SUZGECSIZ-DELETEMANY')),
    (p._iz.ham as string[]).filter((h) => h.startsWith('SUZGECSIZ')).join(','));

  // Bos string de kabul edilmez (gercek Prisma'da tabloyu silmez ama
  // "kimligi cozemedik" demektir; sessizce 0 satir silip "imha edildi"
  // demek bu dosyanin yasakladigi sey).
  const veri2 = fixture();
  const p2 = sahtePrisma(veri2);
  let firladi2 = false;
  try {
    await servisYap(p2).firmaImhaEt('');
  } catch {
    firladi2 = true;
  }
  check('G4 bos firma kimligi de reddediliyor', firladi2);

  const servisKaynak = yorumsuz(oku('backend/src/ozellik/imha/imha.servisi.ts'));
  check('G5 servis `firma.delete` / `user.delete` CAGIRMIYOR (CASCADE hic tetiklenmez)',
    !/(firma|user)\.delete\(/.test(servisKaynak));
  check('G6 firma basina TEK transaction ($transaction sarmalayicisi var)',
    /\$transaction\(async \(tx: any\)/.test(servisKaynak));
  check('G7 uyelik kilidi aliniyor (es zamanli davet kabulu imhadan sonra yazamasin)',
    /pg_advisory_xact_lock/.test(servisKaynak));
}

// ═══════════════════════════════════════════════════════════════════════════
//  Y — YAS EKSENI: SURESI DOLMUS DENEME KAYITLARI (22.09.2026)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * NEDEN VAR: Gizlilik Politikasi "ucretsiz deneme kaydi ... 2 yil" diyor.
 * 21.09'da o cumlede yer tutucu vardi ve kod bu satiri HIC silmiyordu; ayni
 * gun semaya "bu satiri SILMEMELI" yazilmisti. Yer tutucuya "2 yil" yazmak
 * tek basina metni DOGRU yapmazdi, YALAN yapardi. Once davranis eklendi.
 *
 * ⚠ IKI EKSEN AYNI ANDA DOGRU OLMALI:
 *   · FIRMA ekseni — hesap kapaninca bu satir KALIR (I-bolumu olcuyor:
 *     `varMi(veri, 'denemeKullanimi', 'id', 'dkuA')`). Kapatip ayni adresle
 *     kaydolan kisi ikinci deneme ALAMAZ.
 *   · YAS ekseni — satir 2 yasina gelince GIDER (bu bolum).
 * Birini otekinin yerine gecirmek iki ayri kurali kirar.
 */
async function bolumY(): Promise<void> {
  const gunOnce = (n: number) => new Date(SIMDI.getTime() - n * 24 * 60 * 60 * 1000);
  const YIL2 = DENEME_KAYDI_SAKLAMA_GUN; // 730

  // ── OLCUTU ONCE DOGRULA: fixture gercekten iki YASTA kayit tasiyor mu? ──
  // Hepsi "yeni" olsaydi Y1 tesaduefen yesil olurdu (bos kume tuzagi).
  const kayitlar = (): Satir[] => [
    { id: 'eski', firmaId: 'A', olusturuldu: gunOnce(YIL2 + 1) },
    { id: 'tam-sinirda', firmaId: 'B', olusturuldu: gunOnce(YIL2 - 1) },
    { id: 'dun', firmaId: 'C', olusturuldu: gunOnce(1) },
  ];
  check('Y0 olcut: fixture hem eski hem yeni kayit tasiyor',
    kayitlar().length === 3 &&
      kayitlar()[0].olusturuldu < gunOnce(YIL2) &&
      kayitlar()[2].olusturuldu > gunOnce(YIL2));

  // ── Y1/Y2 · SINIR DAVRANISI ────────────────────────────────────────────
  const veri: Record<string, Satir[]> = { denemeKullanimi: kayitlar() };
  const p = sahtePrisma(veri);
  const silinen = await servisYap(p).eskiDenemeKayitlariniSil(SIMDI);
  check('Y1 2 yildan ESKI kayit SILINDI',
    !varMi(veri, 'denemeKullanimi', 'id', 'eski'), `silinen=${silinen}`);
  check('Y2 2 yili DOLDURMAMIS kayitlar DURUYOR (sinir dogru tarafta)',
    varMi(veri, 'denemeKullanimi', 'id', 'tam-sinirda') &&
      varMi(veri, 'denemeKullanimi', 'id', 'dun'), `silinen=${silinen}`);
  check('Y3 donen sayi gercek silinen satir sayisi', silinen === 1, `silinen=${silinen}`);
  // ⚠ Suzgec dusseydi UCU DE giderdi ve Y1 YINE yesil olurdu. Asil tehlike bu.
  check('Y4 SUZGECSIZ deleteMany cagrilmadi (tum tabloyu goturmedi)',
    !(p._iz.ham as string[]).some((h) => h.startsWith('SUZGECSIZ-DELETEMANY')),
    (p._iz.ham as string[]).filter((h) => h.startsWith('SUZGECSIZ')).join(','));

  // ── Y5 · OLCUT HESABIN DURUMU DEGIL, KAYDIN YASI ───────────────────────
  // Hesabi ACIK, kaydi eski: yine silinmeli. `deletedAt`/`imhaTarihi`e bakan
  // bir uygulama bu satiri atlardi ve metin yine yalan olurdu.
  const veri5: Record<string, Satir[]> = {
    denemeKullanimi: [{ id: 'acik-hesap-eski', firmaId: 'Z', olusturuldu: gunOnce(YIL2 + 400) }],
  };
  const p5 = sahtePrisma(veri5);
  await servisYap(p5).eskiDenemeKayitlariniSil(SIMDI);
  check('Y5 hesap ACIK olsa da yasi dolmus kayit silindi (olcut yas)',
    !varMi(veri5, 'denemeKullanimi', 'id', 'acik-hesap-eski'));

  // ── Y6 · GECERSIZ TARIH GURULTULU DUSER, SESSIZCE "HEPSI" DEMEZ ────────
  // `new Date(NaN)` ile esik hesaplanirsa Prisma suzgeci dusurebilir ve
  // `deleteMany` TUM TABLOYU siler. Bu deponun olculmus hata sinifi.
  const veri6: Record<string, Satir[]> = { denemeKullanimi: kayitlar() };
  const p6 = sahtePrisma(veri6);
  let firladi6 = false;
  let mesaj6 = '';
  try {
    await servisYap(p6).eskiDenemeKayitlariniSil(new Date('gecersiz'));
  } catch (e: any) {
    firladi6 = true;
    mesaj6 = String(e?.message ?? e);
  }
  check('Y6 gecersiz "simdi" FIRLATIR', firladi6, mesaj6);
  check('Y6a gecersiz tarihte HICBIR satir silinmedi',
    (veri6['denemeKullanimi'] ?? []).length === 3,
    `kalan=${(veri6['denemeKullanimi'] ?? []).length}`);
  check('Y6b gecersiz tarihte deleteMany HIC cagrilmadi',
    !(p6._iz.cagrilar as any[]).some((c: any) => c.islem === 'deleteMany'));

  // ── Y7 · BAGLANTI: gunluk is bunu GERCEKTEN cagiriyor mu? ──────────────
  // "Mekanizma var, baglanti yok" bu depoda alti kez yasandi. Kaynak kapisi
  // (D13d) cagriyi METINDE arar; bu assert DAVRANISI olcer.
  const veri7 = fixture();
  veri7['denemeKullanimi'] = kayitlar();
  const p7 = sahtePrisma(veri7);
  await new ImhaJob(p7 as any, servisYap(p7)).kosumYap(SIMDI);
  check('Y7 GUNLUK IS yas eksenini kosturuyor (eski kayit gitti)',
    !varMi(veri7, 'denemeKullanimi', 'id', 'eski'));
  check('Y7a gunluk is yeni kayitlara dokunmadi',
    varMi(veri7, 'denemeKullanimi', 'id', 'dun'));

  // ── Y8 · IKI EKSEN CELISMIYOR ──────────────────────────────────────────
  // Firma imhasi kosarken YENI bir deneme kaydi silinmemeli (I-bolumunun
  // iddiasi) — ama burada ayni kosumda ikisi birlikte olculuyor.
  check('Y8 firma imhasi YENI deneme kaydini silmedi (ikinci deneme engeli duruyor)',
    varMi(veri7, 'denemeKullanimi', 'id', 'dun') &&
      varMi(veri7, 'denemeKullanimi', 'id', 'tam-sinirda'));

  // ── Y9 · SURE METINLE AYNI KAYNAKTAN ───────────────────────────────────
  check('Y9 saklama suresi 2 yil (730 gun) olarak tanimli',
    DENEME_KAYDI_SAKLAMA_YIL === 2 && DENEME_KAYDI_SAKLAMA_GUN === 730,
    `yil=${DENEME_KAYDI_SAKLAMA_YIL} gun=${DENEME_KAYDI_SAKLAMA_GUN}`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  J — BAGLANTI: "mekanizma var, baglanti yok" hatasinin kapisi
// ═══════════════════════════════════════════════════════════════════════════
function bolumJ(): void {
  const app = oku('backend/src/app.module.ts');
  check('J1 ImhaModule `app.module.ts`e import EDILDI', /from '\.\/ozellik\/imha\/imha\.module'/.test(app));
  check('J2 ImhaModule `imports` dizisinde (yoksa @Cron HIC kosmaz)',
    /imports:\s*\[[\s\S]*?\bImhaModule\b[\s\S]*?\]/.test(app));

  const modul = yorumsuz(oku('backend/src/ozellik/imha/imha.module.ts'));
  check('J3 modul ImhaJob ve ImhaServisi saglıyor',
    /providers:\s*\[[\s\S]*ImhaServisi[\s\S]*ImhaJob[\s\S]*\]/.test(modul));
  check('J4 modul ikinci kez ScheduleModule.forRoot CAGIRMIYOR',
    !/ScheduleModule\.forRoot\(\)/.test(modul));

  const job = oku('backend/src/ozellik/imha/imha.job.ts');
  check('J5 is GUNDE BIR KEZ kosuyor (@Cron gunluk ifade)',
    /@Cron\('0 \d+ \d+ \* \* \*'\)/.test(job), 'gunluk @Cron ifadesi bulunamadi');
  check('J6 `@nestjs/schedule` Cron import edildi', /from '@nestjs\/schedule'/.test(job));
  check('J7 hata SESSIZCE yutulmuyor (catch icinde logger.error var)',
    /catch \(e\) \{[\s\S]{0,400}logger\.error/.test(job));

  // Yeni test dosyasi manifest kapisina bagli mi?
  const reg = oku('backend/test/regression-all.ts');
  check('J8 `test:imha` regression-all SUITES listesinde',
    /script:\s*'test:imha'/.test(reg));
  const pkg = JSON.parse(oku('backend/package.json'));
  check('J9 package.json `test:imha` scripti var', !!pkg.scripts?.['test:imha']);
}

// ═══════════════════════════════════════════════════════════════════════════
/**
 * ⚠ BOLUM YALITIMI: bir bolum beklenmedik sekilde patlarsa digerleri YINE
 *   kossun. Yoksa tek bir TypeError butun kapinin gorunurlugunu yutar —
 *   "kirmizi" olur ama neyin kirildigi raporda gorunmez.
 */
async function bolum(ad: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e: any) {
    failed++;
    failures.push(`${ad} BOLUMU PATLADI: ${e?.message ?? e}`);
  }
}

async function main(): Promise<void> {
  await bolum('K', bolumK);
  await bolum('D', bolumD);
  await bolum('E/I/S/H/N/P', bolumEIS);
  await bolum('A', bolumA);
  await bolum('C', bolumC);
  await bolum('U', bolumU);
  await bolum('G', bolumG);
  await bolum('Y', bolumY);
  await bolum('J', bolumJ);

  console.log(`\n${'='.repeat(68)}`);
  console.log(`VERI IMHASI (plan 5.8 §5): ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(68));
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  · ${f}`));
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
