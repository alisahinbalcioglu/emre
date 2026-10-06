/**
 * EKIP & IZINLER KAPISI  (`npm run test:ekip-izinleri`) — 23.09.2026
 *   06.10.2026: dort izin IKI YETKIYE indi (ekip/yetki plani B) — `fiyat`, `dwg`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `fiyat` = Excel kesif + fiyat eslestirme + Firma kutuphanesi + iscilik
 * firmalari + teklif formatlari + firmanin TUM teklifleri (eski excel +
 * kutuphane + firmaTeklifleri). `dwg` = cizimden metraj. Emre karari (23.09):
 * firma teklifleri kapali (artik: fiyat yetkisi yok) kisi YALNIZ KENDI
 * hazirladigi teklifleri gorur.
 *
 * DB ISTEMEZ. Olculenler:
 *   S · saf kurallar (`uye-izinleri.ts`, `kimlik.ts` teklif kapsami)
 *   E · sema / migration / on yuz sozlugu ESLIGI (ayni iki anahtar)
 *   D · DTO katmani: en az bir yetki, eski izin adi 400
 *   K · KAPI DAVRANISI — gercek `ErisimGuard` + GERCEK denetleyici metadata'si
 *   B · BAGLANTI — dekorator ↔ guard, yetenekten turetme, kontrol SIRASI
 *   T · TEKLIF KAPSAMI — gercek `QuotesService` / `CeviriKotaServisi` + sahte DB
 *   U · teklif okuyan UCLAR kimligi `teklifKimligiCoz`dan alir (kaynak)
 * Servis akisi (davet → kabul → duzenleme → /auth/me) `faz7-ekip-test.ts` I.
 * Goc veri eslemesi (excel → fiyat, geri donus) `test:migration` UY blogu.
 *
 * ⚠ "Mekanizma var, baglanti yok" bu depoda olculmus en sik kusur: K ve T
 * bloklari MEKANIZMAYI degil, GERCEK uclardan/servislerden gecen yolu olcer.
 * ⚠ "Yetkisiz" fikstur `['dwg']`dir, `['fiyat','dwg']` DEGIL — ikincisi
 * kullaniciyi yetkili yapar ve testi korlestirirdi.
 *
 * CIKIS KODU: 0 → PASS · 1 → en az bir FAIL
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Controller, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  IZIN_ADI,
  TUM_IZINLER,
  UYE_IZINLERI,
  YETENEK_IZNI,
  etkinIzinler,
  izinleriSuz,
  izinMetni,
  izinVarMi,
  teklifKapsamiCoz,
  yetkiSecimiGecerli,
  yeteneklerinIzinleri,
  type UyeIzni,
} from '../src/ozellik/firma/uye-izinleri';
import { DavetOlusturDto } from '../src/ozellik/firma/dto/davet-olustur.dto';
import { UyeIzinleriDto } from '../src/ozellik/firma/dto/uye-izinleri.dto';
import { teklifKimligiCoz, teklifKosulu, type TeklifKimligi } from '../src/altyapi/auth/kimlik';
import { ErisimGuard, YETENEK_KEY } from '../src/ozellik/odeme/abonelik/erisim.guard';
import { Yetenek } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { UYE_IZNI_KEY, UyeIzniGerekli } from '../src/altyapi/auth/decorators/uye-izni.decorator';
import { JwtAuthGuard } from '../src/altyapi/auth/guards/jwt-auth.guard';
import { LibraryController } from '../src/ozellik/kutuphane/library/library.controller';
import { LaborFirmsController } from '../src/ozellik/kutuphane/labor-firms/labor-firms.controller';
import { MaterialsController } from '../src/ozellik/kutuphane/materials/materials.controller';
import { MatchingController } from '../src/ozellik/eslestirme/matching/matching.controller';
import { LaborMatchingController } from '../src/ozellik/eslestirme/labor-matching/labor-matching.controller';
import { ExcelGridController } from '../src/ozellik/giris/excel-grid/excel-grid.controller';
import { ExcelEngineController } from '../src/ozellik/giris/excel-engine/excel-engine.controller';
import { DwgEngineController } from '../src/modules/dwg-engine/dwg-engine.controller';
import { QuotesController } from '../src/ozellik/teklif/quotes/quotes.controller';
import { QuoteFormatsController } from '../src/ozellik/cikti/quote-formats/quote-formats.controller';
import { AiController } from '../src/ozellik/giris/ai/ai.controller';
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { CeviriKotaServisi } from '../src/ozellik/odeme/abonelik/ceviri-kota.servisi';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

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
/** Yorumlari at: kapi YORUMDA degil KODDA eslessin (bu depoda bes kez yasandi). */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const js = (v: unknown) => JSON.stringify(v);
const hataGovdesi = (e: any) => e?.response ?? e?.getResponse?.() ?? e;
const hataDurumu = (e: any) => e?.status ?? e?.getStatus?.() ?? null;
async function dene<T>(fn: () => Promise<T> | T): Promise<{ deger?: T; hata?: any }> {
  try {
    return { deger: await fn() };
  } catch (hata) {
    return { hata };
  }
}

const IKI: UyeIzni[] = ['fiyat', 'dwg'];
/** Eski dort izin adi — artik GECERSIZ (goc onlari esledi). */
const ESKI_ADLAR = ['excel', 'firmaTeklifleri', 'kutuphane'];

// ═══════════════════════════════════════════════════════════════════════════
//  S · SAF KURALLAR
// ═══════════════════════════════════════════════════════════════════════════
function bolumS(): void {
  console.log('\n── S · SAF KURALLAR ──');
  check('S0 kanonik liste iki yetki, bu sirada (fiyat, dwg)', js(UYE_IZINLERI) === js(IKI), js(UYE_IZINLERI));

  const sahipBos = { firmaRol: 'sahip', izinler: [] };
  check('S1 SAHIP her yetkiye sahip — saklanan liste BOS olsa da (liste okunmaz)',
    IKI.every((i) => izinVarMi(sahipBos, i)) && js(etkinIzinler(sahipBos)) === js(IKI));

  const uyeDwg = { firmaRol: 'uye', izinler: ['dwg'] };
  const uyeFiyat = { firmaRol: 'uye', izinler: ['fiyat'] };
  check('S2 UYE yalniz listesindekine sahip (dwg ↔ fiyat birbirini acmaz)',
    izinVarMi(uyeDwg, 'dwg') && !izinVarMi(uyeDwg, 'fiyat') &&
      izinVarMi(uyeFiyat, 'fiyat') && !izinVarMi(uyeFiyat, 'dwg'));
  check('S2b ⭐ ESKI izin adlariyla kalmis liste HICBIR yetki vermez (excel/kutuphane ≠ fiyat)',
    !izinVarMi({ firmaRol: 'uye', izinler: ESKI_ADLAR }, 'fiyat') &&
      js(etkinIzinler({ firmaRol: 'uye', izinler: [...ESKI_ADLAR] })) === '[]');

  check('S3 FAIL-CLOSED: rolu bilinmeyen kimlik HICBIR yetkiye sahip degil',
    IKI.every((i) => !izinVarMi({ izinler: IKI }, i)) &&
      IKI.every((i) => !izinVarMi({ firmaRol: 'admin', izinler: IKI }, i)) &&
      !izinVarMi(null, 'fiyat') && !izinVarMi(undefined, 'fiyat'));
  check('S4 FAIL-CLOSED: uyede liste dizi degilse (null / metin) yetki YOK',
    !izinVarMi({ firmaRol: 'uye', izinler: null }, 'fiyat') &&
      !izinVarMi({ firmaRol: 'uye', izinler: 'fiyat' }, 'fiyat'));

  check('S5 izinleriSuz: gecersiz → null (dizi degil / bilinmeyen / sayi / ESKI ADLAR)',
    izinleriSuz('fiyat') === null && izinleriSuz(['fiyat', 'x']) === null &&
      izinleriSuz([1]) === null && izinleriSuz(null) === null &&
      ESKI_ADLAR.every((a) => izinleriSuz([a]) === null) && izinleriSuz(['dwg', 'excel']) === null);
  check('S5b izinleriSuz: tekrar atilir + kanonik sira; bos dizi OKUMADA gecerli (fail-closed)',
    js(izinleriSuz(['dwg', 'fiyat', 'fiyat'])) === '["fiyat","dwg"]' && js(izinleriSuz([])) === '[]');
  check('S5c yetkiSecimiGecerli (YAZMA kurali): bos / null → hayir · en az bir → evet',
    !yetkiSecimiGecerli([]) && !yetkiSecimiGecerli(null) &&
      yetkiSecimiGecerli(['dwg']) && yetkiSecimiGecerli(['fiyat', 'dwg']));

  check('S6 YETENEK_IZNI anahtarlari `Yetenek` enum DEGERLERIYLE birebir: Excel → fiyat, DWG → dwg',
    YETENEK_IZNI[Yetenek.EXCEL_YUKLE] === 'fiyat' && YETENEK_IZNI[Yetenek.DWG_YUKLE] === 'dwg' &&
      Object.keys(YETENEK_IZNI).length === 2, js(YETENEK_IZNI));
  check('S6 yeteneklerinIzinleri: yalniz yukleme yetenekleri yetki turetir',
    js(yeteneklerinIzinleri([Yetenek.EXCEL_YUKLE, Yetenek.TEKLIF_DUZENLE])) === '["fiyat"]' &&
      js(yeteneklerinIzinleri([Yetenek.KUTUPHANE_DUZENLE])) === '[]' &&
      js(yeteneklerinIzinleri(undefined)) === '[]');

  check('S7 teklif kapsami: sahip → firma · uye+fiyat → firma · yalniz dwg → kendi · rolsuz → kendi',
    teklifKapsamiCoz({ firmaRol: 'sahip', izinler: [] }) === 'firma' &&
      teklifKapsamiCoz({ firmaRol: 'uye', izinler: ['fiyat'] }) === 'firma' &&
      teklifKapsamiCoz({ firmaRol: 'uye', izinler: ['dwg'] }) === 'kendi' &&
      teklifKapsamiCoz({ firmaRol: 'uye', izinler: ['firmaTeklifleri'] }) === 'kendi' &&
      teklifKapsamiCoz({}) === 'kendi');

  const firma: TeklifKimligi = { userId: 'B', firmaId: 'F1', teklifKapsami: 'firma' };
  const kendi: TeklifKimligi = { userId: 'B', firmaId: 'F1', teklifKapsami: 'kendi' };
  check('S8 teklifKosulu firma → {firmaId}, userId ANAHTARI YOK',
    js(teklifKosulu(firma, { id: 'q' })) === '{"id":"q","firmaId":"F1"}', js(teklifKosulu(firma, { id: 'q' })));
  check('S8 teklifKosulu kendi → {firmaId, userId}',
    js(teklifKosulu(kendi, { id: 'q' })) === '{"id":"q","firmaId":"F1","userId":"B"}', js(teklifKosulu(kendi)));
  check('S8 cagiran firmaId/userId EZEMEZ (ek once yayilir)',
    js(teklifKosulu(kendi, { firmaId: 'F9', userId: 'Z' })) === '{"firmaId":"F1","userId":"B"}',
    js(teklifKosulu(kendi, { firmaId: 'F9', userId: 'Z' })));
  check('S9 FAIL-CLOSED: kapsami bozuk/eksik kimlik YALNIZ KENDI',
    teklifKosulu({ userId: 'B', firmaId: 'F1' } as any).userId === 'B' &&
      teklifKosulu({ userId: 'B', firmaId: 'F1', teklifKapsami: 'FIRMA' } as any).userId === 'B');

  check('S10 teklifKimligiCoz: yalniz dwg → kendi · sahip → firma',
    teklifKimligiCoz({ id: 'B', firmaId: 'F1', firmaRol: 'uye', izinler: ['dwg'] }).teklifKapsami === 'kendi' &&
      teklifKimligiCoz({ id: 'A', firmaId: 'F1', firmaRol: 'sahip', izinler: [] }).teklifKapsami === 'firma');
  let firmasiz: any = null;
  try { teklifKimligiCoz({ id: 'A', firmaId: null, firmaRol: 'sahip' }); } catch (e) { firmasiz = e; }
  check('S10 teklifKimligiCoz firmasiz hesabi GURULTULU durdurur (kimlikCoz 403 mirasi)',
    hataDurumu(firmasiz) === 403, String(hataDurumu(firmasiz)));

  check('S11 denetim metni kanonik ve bos kume "-"',
    izinMetni(['fiyat', 'dwg']) === 'fiyat,dwg' && izinMetni([]) === '-');
  check('S12 her yetkinin ekranda okunacak adi var', IKI.every((i) => (IZIN_ADI[i] ?? '').length > 2));
}

// ═══════════════════════════════════════════════════════════════════════════
//  E · SEMA / MIGRATION / ON YUZ ESLIGI — ayni iki anahtar, ayni varsayilan
// ═══════════════════════════════════════════════════════════════════════════
function bolumE(): void {
  console.log('\n── E · SEMA / MIGRATION / ON YUZ ESLIGI ──');
  const sema = kodu(oku('backend/prisma/schema.prisma'));
  const enumBlok = /enum UyeIzni \{([\s\S]*?)\}/.exec(sema)?.[1] ?? '';
  const enumDegerleri = enumBlok.split(/\s+/).filter(Boolean);
  check('E1 sema `enum UyeIzni` degerleri == UYE_IZINLERI (ayni sira)',
    js(enumDegerleri) === js(UYE_IZINLERI), js(enumDegerleri));

  const varsayilan = (model: string) => {
    const blok = sema.slice(sema.indexOf(`model ${model} {`));
    const m = /\bizinler\s+UyeIzni\[\]\s+@default\(\[([^\]]*)\]\)/.exec(blok.slice(0, blok.indexOf('\n}')));
    return m ? m[1].split(',').map((x) => x.trim()) : null;
  };
  check('E2 User.izinler varsayilani == TUM_IZINLER', js(varsayilan('User')) === js(TUM_IZINLER), js(varsayilan('User')));
  check('E2 FirmaDavet.izinler varsayilani == TUM_IZINLER',
    js(varsayilan('FirmaDavet')) === js(TUM_IZINLER), js(varsayilan('FirmaDavet')));

  const migDizin = 'backend/prisma/migrations/20261006100000_uye_yetkileri_fiyat_dwg/migration.sql';
  const mig = oku(migDizin).replace(/^\s*--.*$/gm, '');
  const tip = /CREATE TYPE "UyeIzni_new" AS ENUM \(([^)]*)\)/.exec(mig)?.[1]?.split(',').map((s) => s.trim().replace(/'/g, ''));
  check('E3 yeni goc CREATE TYPE degerleri == UYE_IZINLERI', js(tip) === js(UYE_IZINLERI), js(tip));
  const diziler = [...mig.matchAll(/ALTER COLUMN "izinler" SET DEFAULT ARRAY\[([^\]]*)\]/g)]
    .map((m) => m[1].split(',').map((s) => s.trim().replace(/'/g, '')));
  check('E3 goc IKI kolon (User + FirmaDavet) varsayilani == TUM_IZINLER',
    diziler.length === 2 && diziler.every((d) => js(d) === js(TUM_IZINLER)), js(diziler));
  check('E3 goc esleme kurali: fiyat YALNIZ excel\'den gelir (iki tabloda da)',
    (mig.match(/v = 'fiyat' AND 'excel' = ANY\("izinler"\)/g) ?? []).length === 2 &&
      (mig.match(/v = 'dwg' AND 'dwg' = ANY\("izinler"\)/g) ?? []).length === 2);
  check('E3 goc SATIR SILMEZ (yalniz tip + esleme; DELETE yok)', !/\bDELETE\s+FROM\b/i.test(mig));

  // Prisma uygulanmis gocun saglama toplamini tutar: eski dosya degisirse deploy kirilir.
  const eski = oku('backend/prisma/migrations/20260923120000_ekip_uye_izinleri/migration.sql');
  check('E3b eski goc (20260923120000) DEGISMEDI — dort degerli CREATE TYPE yerinde',
    /CREATE TYPE "UyeIzni" AS ENUM \('excel', 'dwg', 'firmaTeklifleri', 'kutuphane'\)/.test(eski));

  const onYuz = kodu(oku('frontend/ozellik/firma/ekip/izin-metinleri.ts'));
  const anahtarlar = [...onYuz.matchAll(/anahtar:\s*'([a-zA-Z]+)'/g)].map((m) => m[1]);
  check('E4 on yuz yetki sozlugu anahtarlari == UYE_IZINLERI (ayni sira)',
    js(anahtarlar) === js(UYE_IZINLERI), js(anahtarlar));
  // Kisa etiket: 403 mesajindaki ad (IZIN_ADI) ile ekrandaki satir adi AYNI
  // olmali — biri degisip oteki kalirsa uye "X yetkiniz yok" der, ekranda Y gorur.
  const etiketler = [...onYuz.matchAll(/\betiket:\s*'([^']*)'/g)].map((m) => m[1]);
  check('E4b on yuz kisa etiketleri == backend IZIN_ADI (birebir, ayni sira)',
    js(etiketler) === js(UYE_IZINLERI.map((i) => IZIN_ADI[i])), js({ onYuz: etiketler, backend: IZIN_ADI }));
}

// ═══════════════════════════════════════════════════════════════════════════
//  D · DTO KATMANI — en az bir yetki; eski izin adi 400 "sayfayi yenileyin"
// ═══════════════════════════════════════════════════════════════════════════
async function dtoHatalari(cls: any, govde: any): Promise<string[]> {
  const hatalar = await validate(plainToInstance(cls, govde));
  return hatalar.flatMap((h) => Object.values(h.constraints ?? {}));
}

async function bolumD(): Promise<void> {
  console.log('\n── D · DTO KATMANI ──');
  const eposta = 'yeni@firma.test';
  const davetBos = await dtoHatalari(DavetOlusturDto, { eposta, izinler: [] });
  const davetEski = await dtoHatalari(DavetOlusturDto, { eposta, izinler: ['excel', 'dwg'] });
  const davetTek = await dtoHatalari(DavetOlusturDto, { eposta, izinler: ['dwg'] });
  const davetYok = await dtoHatalari(DavetOlusturDto, { eposta });
  check('D1 ⭐ davet: bos yetki listesi → "En az bir yetki seçin."', davetBos.includes('En az bir yetki seçin.'), js(davetBos));
  check('D2 ⭐ davet: eski izin adi (bayat sekme) → "Sayfayı yenileyip tekrar deneyin."',
    davetEski.some((m) => /Sayfayı yenileyip/.test(m)), js(davetEski));
  check('D3 davet: tek yetki gecerli · alan hic yoksa gecerli (eski istemci → servis TUM yazar)',
    davetTek.length === 0 && davetYok.length === 0, js({ davetTek, davetYok }));

  const pBos = await dtoHatalari(UyeIzinleriDto, { izinler: [] });
  const pEski = await dtoHatalari(UyeIzinleriDto, { izinler: ['kutuphane'] });
  const pIki = await dtoHatalari(UyeIzinleriDto, { izinler: ['fiyat', 'dwg'] });
  check('D4 ⭐ yetki degistirme: bos liste → "En az bir yetki seçin." · eski ad → yenileyin · iki yetki gecerli',
    pBos.includes('En az bir yetki seçin.') && pEski.some((m) => /Sayfayı yenileyip/.test(m)) && pIki.length === 0,
    js({ pBos, pEski, pIki }));
}

// ═══════════════════════════════════════════════════════════════════════════
//  K · KAPI DAVRANISI — gercek `ErisimGuard`, GERCEK denetleyici metadata'si
// ═══════════════════════════════════════════════════════════════════════════
const reflector = new Reflector();
const metotlar = (cls: any): string[] =>
  Object.getOwnPropertyNames(cls.prototype).filter((m) => m !== 'constructor');
const yetenekleri = (cls: any, m: string): string[] =>
  reflector.getAllAndOverride<string[]>(YETENEK_KEY, [cls.prototype[m], cls]) ?? [];

/** Abonelik kapisi HER ZAMAN acik: burada olculen yalniz uye yetkisi ekseni. */
const karar = { sayi: 0 };
const erisimAcik = {
  karar: async () => {
    karar.sayi++;
    return {
      erisimVar: true, saltOkunur: false, durum: 'AKTIF', uyari: null,
      kalanGun: null, paketKodu: 'pro-mek', kullaniciHakki: 5, dwgAktif: true,
    };
  },
  yetenekKararla: () => true,
};
const guard = new ErisimGuard(reflector, erisimAcik as any);
const baglam = (cls: any, m: string, user: any): any => ({
  getHandler: () => cls.prototype[m],
  getClass: () => cls,
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
});
async function sina(cls: any, m: string, user: any): Promise<{ gecti: boolean; kod?: string; izin?: string; durum?: number }> {
  const r = await dene(() => guard.canActivate(baglam(cls, m, user)));
  if (!r.hata) return { gecti: r.deger === true };
  return { gecti: false, kod: hataGovdesi(r.hata)?.kod, izin: hataGovdesi(r.hata)?.izin, durum: hataDurumu(r.hata) };
}

const SAHIP_BOS = { id: 'A', firmaId: 'F1', firmaRol: 'sahip', izinler: [] };
const UYE_HICBIRI = { id: 'C', firmaId: 'F1', firmaRol: 'uye', izinler: [] };
const uyeYalniz = (...i: UyeIzni[]) => ({ id: 'B', firmaId: 'F1', firmaRol: 'uye', izinler: i });
/** Istenen yetki DISINDA her sey acik (fiyat → ['dwg'], dwg → ['fiyat']). */
const uyeHaric = (x: UyeIzni) => uyeYalniz(...IKI.filter((i) => i !== x));
const ROLSUZ = { id: 'X', firmaId: 'F1', izinler: IKI };

/** Sahte denetleyici: yetki isaretli, YETENEKSIZ uc — kontrol SIRASINI olcer. */
@Controller('sahte-izin')
@UseGuards(JwtAuthGuard, ErisimGuard)
class YeteneksizIzinliController {
  @UyeIzniGerekli('fiyat')
  isaretli() { return true; }
  serbest() { return true; }
}

async function izinBekle(
  etiket: string,
  hedefler: { cls: any; m: string }[],
  izin: UyeIzni,
): Promise<void> {
  const sonuc: string[] = [];
  let hepsi = true;
  for (const { cls, m } of hedefler) {
    const red = await sina(cls, m, uyeHaric(izin));
    const acik = await sina(cls, m, uyeYalniz(izin));
    const sahip = await sina(cls, m, SAHIP_BOS);
    const ok = !red.gecti && red.durum === 403 && red.kod === 'UYE_IZNI_YOK' && red.izin === izin &&
      acik.gecti && sahip.gecti;
    if (!ok) { hepsi = false; sonuc.push(`${cls.name}.${m} red=${js(red)} acik=${acik.gecti} sahip=${sahip.gecti}`); }
  }
  check(`${etiket} (${hedefler.length} uc): yetkisiz → 403 UYE_IZNI_YOK/${izin} · yetkili → gecer · sahip (bos liste) → gecer`,
    hepsi && hedefler.length > 0, sonuc.join(' | '));
}

async function bolumK(): Promise<void> {
  console.log('\n── K · KAPI DAVRANISI (gercek uclar) ──');

  // Excel: yetenekten TURETILEN yetki (fiyat) — dekorator yok, yine de kapali
  const excelUclari = [
    { cls: ExcelGridController, m: 'prepare' },
    { cls: ExcelEngineController, m: 'analyze' },
    { cls: QuotesController, m: 'parseExcel' },
  ];
  check('K0-FIXTURE KANITI: Excel uclarinin UCU de EXCEL_YUKLE tasiyor',
    excelUclari.every(({ cls, m }) => yetenekleri(cls, m).includes(Yetenek.EXCEL_YUKLE)));
  await izinBekle('K1 Excel kesif (fiyat)', excelUclari, 'fiyat');

  const dwgUclari = metotlar(DwgEngineController)
    .filter((m) => yetenekleri(DwgEngineController, m).includes(Yetenek.DWG_YUKLE))
    .map((m) => ({ cls: DwgEngineController, m }));
  // 4 = parse · upload · status · geometry. 26.09'da `layers` ve `convert`
  // kaldirildi (DWG→DXF donusumu motorun olay dongusundeydi, canli kullanim 0).
  check('K2-FIXTURE KANITI: DWG denetleyicisinde 4 DWG_YUKLE ucu', dwgUclari.length === 4,
    js(dwgUclari.map((u) => u.m)));
  await izinBekle('K2 DWG', dwgUclari, 'dwg');
  const dwgSaglik = await sina(DwgEngineController, 'health', UYE_HICBIRI);
  check('K2b yeteneksiz DWG saglik ucu yetki ISTEMEZ', dwgSaglik.gecti, js(dwgSaglik));

  const fiyatUclari = [
    ...metotlar(LibraryController).map((m) => ({ cls: LibraryController, m })),
    ...metotlar(LaborFirmsController).map((m) => ({ cls: LaborFirmsController, m })),
    ...['bulkMatch', 'remember', 'listAliases', 'saveAlias', 'deleteAlias'].map((m) => ({ cls: MatchingController, m })),
    ...['bulkMatch', 'remember', 'reindex'].map((m) => ({ cls: LaborMatchingController, m })),
    // 23.09 guvenlik incelemesi (HIGH): PDF analizi firmanin kutuphanesinden
    // iskonto + ozel fiyat dondurur (`ai.service.ts` `matchWithDatabase`).
    { cls: AiController, m: 'analyze' },
    // 06.10 Emre karari 3: teklif formatlari fiyat yetkisine bagli (sinif duzeyi).
    ...metotlar(QuoteFormatsController).map((m) => ({ cls: QuoteFormatsController, m })),
  ];
  // ⚠ Sayilar OLCULDU: kutuphane 15+ · iscilik firmalari 17+ · eslestirme 8 ·
  //   AI 1 · teklif formatlari 8 (06.10: upload list sample preview previewPdf
  //   replaceFile update remove).
  check('K3-FIXTURE KANITI: fiyat kumesi dolu (kutuphane 15+ · iscilik 17+ · eslestirme 8 · AI 1 · formatlar 8)',
    metotlar(LibraryController).length >= 15 && metotlar(LaborFirmsController).length >= 17 &&
      metotlar(QuoteFormatsController).length === 8 && fiyatUclari.length >= 49,
    `kutuphane=${metotlar(LibraryController).length} iscilik=${metotlar(LaborFirmsController).length} formatlar=${metotlar(QuoteFormatsController).length} toplam=${fiyatUclari.length}`);
  await izinBekle('K3 Fiyat (Firma kutuphanesi · eslestirme · iscilik · AI · teklif formatlari)', fiyatUclari, 'fiyat');

  // Yetki ISTEMEYEN uclar: havuz, eslestirme saglik, teklif listesi
  const serbest = [
    { cls: MaterialsController, m: metotlar(MaterialsController)[0] },
    { cls: MatchingController, m: 'indexHealth' },
    { cls: QuotesController, m: 'findAll' },
  ];
  const serbestSonuc = await Promise.all(serbest.map(async (u) => ({ ad: `${u.cls.name}.${u.m}`, r: await sina(u.cls, u.m, UYE_HICBIRI) })));
  check('K4 Malzeme Havuzu · indeks sagligi · teklif listesi yetki ISTEMEZ (hic yetkisi olmayan uye gecer)',
    serbestSonuc.every((s) => s.r.gecti) && serbest.every((u) => u.m), js(serbestSonuc));

  const rolsuz = await sina(ExcelGridController, 'prepare', ROLSUZ);
  check('K5 FAIL-CLOSED: rolu bilinmeyen kimlik (liste dolu olsa da) → 403', !rolsuz.gecti && rolsuz.durum === 403, js(rolsuz));

  const govde = await dene(() => guard.canActivate(baglam(LibraryController, 'findAll', uyeHaric('fiyat'))));
  const g = hataGovdesi(govde.hata);
  check('K6 403 govdesi ABONELIK_KISITLI DEGIL (on yuz odeme seridi acmasin) ve cozumu soyler',
    g?.kod === 'UYE_IZNI_YOK' && g?.kod !== 'ABONELIK_KISITLI' && /ana kullanıcı/.test(g?.mesaj ?? ''), js(g));

  karar.sayi = 0;
  await sina(ExcelGridController, 'prepare', uyeHaric('fiyat'));
  check('K7 yetki reddi DB\'ye GITMEZ (abonelik karari hic sorulmadi)', karar.sayi === 0, `karar=${karar.sayi}`);

  const isaretli = await sina(YeteneksizIzinliController, 'isaretli', uyeHaric('fiyat'));
  const serbestIs = await sina(YeteneksizIzinliController, 'serbest', uyeHaric('fiyat'));
  check('K8 ⭐ SIRA: yeteneksiz ama yetki isaretli uc da kapali (erken `return true` yetkiyi YUTMAZ)',
    !isaretli.gecti && isaretli.kod === 'UYE_IZNI_YOK' && serbestIs.gecti, js({ isaretli, serbestIs }));

  const eskiListe = { id: 'B', firmaId: 'F1', firmaRol: 'uye', izinler: [...ESKI_ADLAR, 'dwg'] };
  const eskiFiyat = await sina(LibraryController, 'findAll', eskiListe);
  const eskiDwg = await sina(DwgEngineController, dwgUclari[0]?.m ?? 'parse', eskiListe);
  check('K9 eski adli liste: fiyat uclari 403, dwg acik (eski ad fiyat SAYILMAZ)',
    !eskiFiyat.gecti && eskiFiyat.izin === 'fiyat' && eskiDwg.gecti, js({ eskiFiyat, eskiDwg }));
}

// ═══════════════════════════════════════════════════════════════════════════
//  B · BAGLANTI — dekorator tek basina SUSTUR; `ErisimGuard` gormeli
// ═══════════════════════════════════════════════════════════════════════════
const guardAdlari = (hedef: any): string[] =>
  ((Reflect.getMetadata('__guards__', hedef) ?? []) as any[]).map((x: any) => x?.name ?? String(x));

function kaynakGez(dizin: string, sonuc: string[] = []): string[] {
  for (const g of fs.readdirSync(dizin, { withFileTypes: true })) {
    const tam = path.join(dizin, g.name);
    if (g.isDirectory()) kaynakGez(tam, sonuc);
    else if (g.name.endsWith('.ts')) sonuc.push(tam);
  }
  return sonuc;
}

function bolumB(): void {
  console.log('\n── B · BAGLANTI ──');
  for (const cls of [LibraryController, LaborFirmsController, QuoteFormatsController]) {
    check(`B1 ${cls.name}: SINIF duzeyinde 'fiyat' + sinif guard'larinda ErisimGuard`,
      Reflect.getMetadata(UYE_IZNI_KEY, cls) === 'fiyat' && guardAdlari(cls).includes('ErisimGuard'),
      js({ izin: Reflect.getMetadata(UYE_IZNI_KEY, cls), guardlar: guardAdlari(cls) }));
  }
  for (const [cls, ms] of [
    [MatchingController, ['bulkMatch', 'remember', 'listAliases', 'saveAlias', 'deleteAlias']],
    [LaborMatchingController, ['bulkMatch', 'remember', 'reindex']],
  ] as const) {
    const eksik = ms.filter((m) => Reflect.getMetadata(UYE_IZNI_KEY, (cls as any).prototype[m]) !== 'fiyat');
    check(`B2 ${cls.name}: fiyat ceken ${ms.length} ucta 'fiyat' + sinifta ErisimGuard`,
      eksik.length === 0 && guardAdlari(cls).includes('ErisimGuard'), js({ eksik, guardlar: guardAdlari(cls) }));
  }

  check("B2 AiController.analyze: 'fiyat' + sinifta ErisimGuard (PDF analizi kutuphane fiyati dondurur)",
    Reflect.getMetadata(UYE_IZNI_KEY, (AiController as any).prototype.analyze) === 'fiyat' &&
      guardAdlari(AiController).includes('ErisimGuard'));
  // Kisisel fiyat listesi (/brands/price-lists/:id/materials) yetkiye SERVISTE
  // baglidir: havuz listesi acik kalmali, sinif dekoratoru konamaz.
  const brandsKodu = kodu(oku('backend/src/ozellik/kutuphane/brands/brands.controller.ts'));
  const brandsServis = kodu(oku('backend/src/ozellik/kutuphane/brands/brands.service.ts'));
  // 23.09.2026 (vitrin): cagri DORDUNCU argumani (havuz fiyati karari) aldi.
  // Desen onu da SABITLER: ucuncu yer yine tam olarak fiyat yetkisi olmali —
  // argumanlar yer degistirirse (yetki yerine fiyat karari) kisisel liste
  // yetkisiz uyeye acilirdi.
  check('B2b kisisel fiyat listesi: uc yetkiyi servise GECIRIR, servis kisisel listede yetki ISTER',
    /getPriceListMaterials\(\s*listId,\s*kimlikCoz\(user\)\.firmaId,\s*izinVarMi\(user, 'fiyat'\),\s*await this\.erisim\.havuzFiyatiGorunurMu\(kimlikCoz\(user\)\.firmaId, user\?\.role\),?\s*\)/.test(brandsKodu) &&
      /if \(pl\.ownerUserId && !fiyatIzni\)/.test(brandsServis) && /uyeIzniYokGovdesi\('fiyat'\)/.test(brandsServis));

  // Kaynak kurali: `@UyeIzniGerekli(` kullanan HER dosya ErisimGuard'i guard listesinde tasir.
  const dosyalar = kaynakGez(path.join(KOK, 'backend/src'))
    .filter((d) => !d.endsWith('uye-izni.decorator.ts'))
    .filter((d) => /@UyeIzniGerekli\(/.test(kodu(fs.readFileSync(d, 'utf8'))));
  const guardsiz = dosyalar.filter((d) => !/@UseGuards\([^)]*\bErisimGuard\b[^)]*\)/.test(kodu(fs.readFileSync(d, 'utf8'))));
  check('B3 `@UyeIzniGerekli` kullanan HER dosyada `@UseGuards(... ErisimGuard ...)` var',
    dosyalar.length >= 6 && guardsiz.length === 0,
    js({ dosya: dosyalar.map((d) => path.basename(d)), guardsiz: guardsiz.map((d) => path.basename(d)) }));

  const g = kodu(oku('backend/src/ozellik/odeme/abonelik/erisim.guard.ts'));
  const izinOkuma = g.indexOf('UYE_IZNI_KEY');
  const izinKarari = g.indexOf('izinVarMi(');
  const erkenDonus = g.indexOf('if (!gerekenler || gerekenler.length === 0) return true;');
  check('B4 kaynak SIRASI: yetki okunur ve karar verilir, SONRA yeteneksiz uc icin erken donus',
    izinOkuma > 0 && izinKarari > izinOkuma && erkenDonus > izinKarari, js({ izinOkuma, izinKarari, erkenDonus }));
  check('B5 yetki yetenekten TURETILIR (`yeteneklerinIzinleri(gerekenler)`)',
    /yeteneklerinIzinleri\(gerekenler\)/.test(g));

  const strateji = kodu(oku('backend/src/altyapi/auth/strategies/jwt.strategy.ts'));
  check('B6 JwtStrategy donusu `izinler: user.izinler` tasir (kapinin girdisi)',
    /izinler:\s*user\.izinler/.test(strateji));

  const uyelik = kodu(oku('backend/src/ozellik/firma/uyelik.servisi.ts'));
  const yetkiKurali = (uyelik.match(/if \(!yetkiSecimiGecerli\(izinler\)\) throw new BadRequestException\(YETKI_SECILMEDI\)/g) ?? []).length;
  check('B7 servis IKINCI katman: davet + yetki degistirme EN AZ BIR yetki ister (2 yer)', yetkiKurali === 2, `yer=${yetkiKurali}`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  T · TEKLIF KAPSAMI — gercek servisler, sahte DB (where GERCEKTEN uygulanir)
// ═══════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;
function eslesir(s: Satir, where: any): boolean {
  for (const [k, v] of Object.entries(where ?? {})) {
    if (v !== null && typeof v === 'object') throw new Error(`SAHTE DB: desteklenmeyen kosul ${k}=${js(v)}`);
    if (s[k] !== v) return false;
  }
  return true;
}
function teklifDb() {
  const iz: { islem: string; where: any }[] = [];
  const quote: Satir[] = [
    { id: 'Q-A', firmaId: 'F1', userId: 'A', title: 'Sahibin teklifi', createdAt: new Date(1), items: [], sheets: [], user: { email: 'a@f1.test' } },
    { id: 'Q-B', firmaId: 'F1', userId: 'B', title: 'Uyenin teklifi', createdAt: new Date(2), items: [], sheets: [], user: { email: 'b@f1.test' } },
    { id: 'Q-X', firmaId: 'F2', userId: 'X', title: 'Baska firma', createdAt: new Date(3), items: [], sheets: [], user: { email: 'x@f2.test' } },
  ];
  const tablo = {
    findMany: async (a: any) => { iz.push({ islem: 'findMany', where: a.where }); return quote.filter((q) => eslesir(q, a.where)); },
    findFirst: async (a: any) => { iz.push({ islem: 'findFirst', where: a.where }); return quote.find((q) => eslesir(q, a.where)) ?? null; },
    count: async (a: any) => { iz.push({ islem: 'count', where: a.where }); return quote.filter((q) => eslesir(q, a.where)).length; },
    update: async (a: any) => {
      const q = quote.find((x) => x.id === a.where.id);
      if (!q) throw new Error('SAHTE DB: update — satir yok');
      Object.assign(q, a.data);
      return q;
    },
    delete: async (a: any) => {
      const i = quote.findIndex((x) => x.id === a.where.id);
      return quote.splice(i, 1)[0];
    },
  };
  const prisma: any = {
    quote: tablo,
    quoteItem: { deleteMany: async () => ({ count: 0 }) },
    quoteExport: { findMany: async () => [] },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma, quote, iz };
}

async function bolumT(): Promise<void> {
  console.log('\n── T · TEKLIF KAPSAMI (gercek QuotesService + CeviriKotaServisi) ──');
  const SAHIP = teklifKimligiCoz({ id: 'A', firmaId: 'F1', firmaRol: 'sahip', izinler: [] });
  const UYE_FIYATLI = teklifKimligiCoz({ id: 'B', firmaId: 'F1', firmaRol: 'uye', izinler: ['fiyat'] });
  // ⚠ YETKISIZ = yalniz dwg. `['fiyat','dwg']` YAZILMAZ (kullaniciyi yetkili yapar).
  const UYE_YALNIZ_DWG = teklifKimligiCoz({ id: 'B', firmaId: 'F1', firmaRol: 'uye', izinler: ['dwg'] });
  check('T0-FIXTURE KANITI: kapsamlar beklenen (sahip firma · fiyatli firma · yalniz dwg kendi)',
    SAHIP.teklifKapsami === 'firma' && UYE_FIYATLI.teklifKapsami === 'firma' && UYE_YALNIZ_DWG.teklifKapsami === 'kendi',
    js([SAHIP.teklifKapsami, UYE_FIYATLI.teklifKapsami, UYE_YALNIZ_DWG.teklifKapsami]));

  const liste = async (k: TeklifKimligi) => {
    const { prisma } = teklifDb();
    const r = await new QuotesService(prisma, null as any, null as any).findAll(k, {});
    return { ids: r.kayitlar.map((q: any) => q.id).sort(), toplam: r.toplam };
  };
  const lSahip = await liste(SAHIP);
  const lFiyatli = await liste(UYE_FIYATLI);
  const lDwg = await liste(UYE_YALNIZ_DWG);
  check('T1 sahip firmanin TUM teklifleri (Q-A, Q-B) — baska firma YOK', js(lSahip.ids) === '["Q-A","Q-B"]', js(lSahip));
  check('T1 fiyat yetkili uye firmanin tamami (Q-A, Q-B)', js(lFiyatli.ids) === '["Q-A","Q-B"]', js(lFiyatli));
  check('T2 ⭐ yalniz DWG uyesi YALNIZ kendi (Q-B) ve sayac da 1', js(lDwg.ids) === '["Q-B"]' && lDwg.toplam === 1, js(lDwg));

  const { prisma, quote, iz } = teklifDb();
  const svc = new QuotesService(prisma, null as any, null as any);
  const baskasinin = await dene(() => svc.findOne(UYE_YALNIZ_DWG, 'Q-A'));
  const kendi = await dene(() => svc.findOne(UYE_YALNIZ_DWG, 'Q-B'));
  check('T3 yalniz DWG uyesi baskasinin teklifini ACAMAZ (404), kendisininkini acar',
    hataDurumu(baskasinin.hata) === 404 && (kendi.deger as any)?.id === 'Q-B',
    js({ baska: hataDurumu(baskasinin.hata), kendi: (kendi.deger as any)?.id }));

  const sil = await dene(() => svc.remove(UYE_YALNIZ_DWG, 'Q-A'));
  const bilgi = await dene(() => svc.updateInfo(UYE_YALNIZ_DWG, 'Q-A', { musteri: 'ele gecirme' }));
  const revize = await dene(() => svc.create(UYE_YALNIZ_DWG, { title: 'ele gecirme', items: [] } as any, 'Q-A'));
  const arsiv = await dene(() => svc.listExports(UYE_YALNIZ_DWG, 'Q-A'));
  const qa = quote.find((q) => q.id === 'Q-A');
  check('T4 ⭐ baskasinin teklifi: SILME · KAPAK · REVIZE · CIKTI ARSIVI → 404 ve teklif DEGISMEDI',
    [sil, bilgi, revize, arsiv].every((r) => hataDurumu(r.hata) === 404) &&
      !!qa && qa.title === 'Sahibin teklifi' && qa.musteri === undefined,
    js({ sil: hataDurumu(sil.hata), bilgi: hataDurumu(bilgi.hata), revize: hataDurumu(revize.hata), arsiv: hataDurumu(arsiv.hata), qa }));

  const kendiBilgi = await dene(() => svc.updateInfo(UYE_YALNIZ_DWG, 'Q-B', { musteri: 'Acme' }));
  check('T5 kendi teklifinde calisir (kapak guncellendi)', !kendiBilgi.hata &&
    quote.find((q) => q.id === 'Q-B')?.musteri === 'Acme', js(hataGovdesi(kendiBilgi.hata)));

  const sahipSil = await dene(() => new QuotesService(teklifDb().prisma, null as any, null as any).findOne(SAHIP, 'Q-B'));
  check('T5b sahip uyenin teklifini acar (kapsam yalniz UYEYI daraltir)', (sahipSil.deger as any)?.id === 'Q-B');

  const kosullar = iz.filter((c) => ['findMany', 'findFirst', 'count'].includes(c.islem));
  check('T6 ⭐ BAGLANTI: yalniz DWG uyesinin HER teklif sorgusu userId=B + firmaId=F1 tasir',
    kosullar.length >= 6 && kosullar.every((c) => c.where?.userId === 'B' && c.where?.firmaId === 'F1'),
    js(kosullar.map((c) => `${c.islem}:${js(c.where)}`)));

  const kota = new CeviriKotaServisi(teklifDb().prisma);
  const cevBaska = await dene(() => kota.kayitliIcerik(UYE_YALNIZ_DWG, 'Q-A'));
  const cevKendi = await dene(() => kota.kayitliIcerik(UYE_YALNIZ_DWG, 'Q-B'));
  const cevSahip = await dene(() => kota.kayitliIcerik(SAHIP, 'Q-B'));
  check('T7 CEVIRI: baskasinin teklif metni okunamaz (404) — kendi ve sahip okur',
    hataDurumu(cevBaska.hata) === 404 && !cevKendi.hata && !cevSahip.hata,
    js({ baska: hataDurumu(cevBaska.hata), kendi: !!cevKendi.hata, sahip: !!cevSahip.hata }));
}

// ═══════════════════════════════════════════════════════════════════════════
//  U · UCLAR — teklif okuyan her uc kimligi `teklifKimligiCoz`dan alir
// ═══════════════════════════════════════════════════════════════════════════
function bolumU(): void {
  console.log('\n── U · UCLAR teklif kimligini dogru yerden alir (kaynak) ──');
  const qc = kodu(oku('backend/src/ozellik/teklif/quotes/quotes.controller.ts'));
  // Ilk argumani ureten FONKSIYONUN adi (`teklifKimligiCoz` / `kimlikCoz`).
  // ⚠ Ilk yazimda `[^,)]*` ilk argumani kapanis parantezinde kesiyordu ve
  //   dogru kodu "yanlis" sayiyordu (kapi kirmizi yandi, olcut duzeltildi).
  const servisCagrilari = [...qc.matchAll(/this\.quotesService\.(\w+)\(\s*(\w+)\(/g)].map((m) => ({ ad: m[1], ilk: m[2] }));
  const yanlis = servisCagrilari.filter((c) =>
    c.ad === 'parseExcel' ? c.ilk !== 'kimlikCoz' : c.ilk !== 'teklifKimligiCoz');
  check('U1 QuotesController: parseExcel DISINDA her servis cagrisi `teklifKimligiCoz(user)`',
    servisCagrilari.length >= 10 && yanlis.length === 0, js({ sayi: servisCagrilari.length, yanlis }));

  const ai = kodu(oku('backend/src/ozellik/giris/ai/ai.controller.ts'));
  check('U2 AiController: cevir / goruntule / onizleme `teklifKimligiCoz`',
    /teklifiCevir\(teklifKimligiCoz\(user\)/.test(ai) && /teklifGorunumu\(teklifKimligiCoz\(user\)/.test(ai) &&
      /onizleme\(teklifKimligiCoz\(user\)/.test(ai));
  const dz = kodu(oku('backend/src/ozellik/giris/ai/ceviri-duzeltme.controller.ts'));
  check('U3 CeviriDuzeltmeController: listele / kaydet `teklifKimligiCoz`',
    /listele\(teklifKimligiCoz\(user\)/.test(dz) && /kaydet\(teklifKimligiCoz\(user\)/.test(dz));
  const pc = kodu(oku('backend/src/ozellik/panel/panel.controller.ts'));
  check('U4 PanelController teklif sayaci `teklifKimligiCoz`', /ozet\(teklifKimligiCoz\(user\)\)/.test(pc));

  const qs = kodu(oku('backend/src/ozellik/teklif/quotes/quotes.service.ts'));
  check('U5 QuotesService: kapsamsiz `quote.findFirst({ where: { id, firmaId: k.firmaId } })` KALMADI',
    !/quote\.findFirst\(\{\s*where:\s*\{\s*id,\s*firmaId:\s*k\.firmaId\s*\}/.test(qs) &&
      (qs.match(/teklifKosulu\(/g) ?? []).length >= 6, `teklifKosulu=${(qs.match(/teklifKosulu\(/g) ?? []).length}`);
  const ck = kodu(oku('backend/src/ozellik/odeme/abonelik/ceviri-kota.servisi.ts'));
  check('U6 CeviriKotaServisi.kayitliIcerik `teklifKosulu` ile okur',
    /kayitliIcerik\(k: TeklifKimligi[\s\S]{0,200}teklifKosulu\(k, \{ id: quoteId \}\)/.test(ck));
  const ps = kodu(oku('backend/src/ozellik/panel/panel.servisi.ts'));
  check('U7 PanelServisi teklif sayisi `teklifKosulu(k)`', /quote\.count\(\{\s*where:\s*teklifKosulu\(k\)\s*\}\)/.test(ps));
  const hs = kodu(oku('backend/src/altyapi/auth/hesap.servisi.ts'));
  check('U8 KVKK indirmesi uyeye YALNIZ kendi teklifleri (degismedi, yetkiden bagimsiz)',
    /where:\s*sahipMi\s*\?\s*\{\s*firmaId\s*\}\s*:\s*\{\s*firmaId,\s*userId\s*\}/.test(hs));
}

async function main() {
  bolumS();
  bolumE();
  await bolumD();
  await bolumK();
  bolumB();
  await bolumT();
  bolumU();
  console.log(`\n${'='.repeat(64)}`);
  console.log(`EKIP & IZINLER: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(64));
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  · ${f}`));
  }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
