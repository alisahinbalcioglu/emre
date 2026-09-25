/**
 * EKIP & IZINLER KAPISI  (`npm run test:ekip-izinleri`) — 23.09.2026
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Emre: "bu tasarimi uygula, ekip tarafi degisecek". Alt kullanici icin dort
 * modul izni: Excel kesif · DWG proje · Son teklifler & tutar · Kutuphanem.
 * Emre karari (23.09): "Son teklifler" kapaliysa kisi YALNIZ KENDI
 * hazirladigi teklifleri gorur.
 *
 * DB ISTEMEZ. Olculenler:
 *   S · saf kurallar (`uye-izinleri.ts`, `kimlik.ts` teklif kapsami)
 *   E · sema / migration / on yuz sozlugu ESLIGI (ayni dort anahtar)
 *   K · KAPI DAVRANISI — gercek `ErisimGuard` + GERCEK denetleyici metadata'si
 *   B · BAGLANTI — dekorator ↔ guard, yetenekten turetme, kontrol SIRASI
 *   T · TEKLIF KAPSAMI — gercek `QuotesService` / `CeviriKotaServisi` + sahte DB
 *   U · teklif okuyan UCLAR kimligi `teklifKimligiCoz`dan alir (kaynak)
 * Servis akisi (davet → kabul → duzenleme → /auth/me) `faz7-ekip-test.ts` I.
 *
 * ⚠ "Mekanizma var, baglanti yok" bu depoda olculmus en sik kusur: K ve T
 * bloklari MEKANIZMAYI degil, GERCEK uclardan/servislerden gecen yolu olcer.
 *
 * CIKIS KODU: 0 → PASS · 1 → en az bir FAIL
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Controller, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
  yeteneklerinIzinleri,
  type UyeIzni,
} from '../src/ozellik/firma/uye-izinleri';
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

const DORT: UyeIzni[] = ['excel', 'dwg', 'firmaTeklifleri', 'kutuphane'];

// ═══════════════════════════════════════════════════════════════════════════
//  S · SAF KURALLAR
// ═══════════════════════════════════════════════════════════════════════════
function bolumS(): void {
  console.log('\n── S · SAF KURALLAR ──');
  check('S0 kanonik liste dort izin, bu sirada', js(UYE_IZINLERI) === js(DORT), js(UYE_IZINLERI));

  const sahipBos = { firmaRol: 'sahip', izinler: [] };
  check('S1 SAHIP her izne sahip — saklanan liste BOS olsa da (liste okunmaz)',
    DORT.every((i) => izinVarMi(sahipBos, i)) && js(etkinIzinler(sahipBos)) === js(DORT));

  const uyeExcel = { firmaRol: 'uye', izinler: ['excel'] };
  check('S2 UYE yalniz listesindekine sahip (excel var, digerleri yok)',
    izinVarMi(uyeExcel, 'excel') && !izinVarMi(uyeExcel, 'dwg') &&
      !izinVarMi(uyeExcel, 'firmaTeklifleri') && !izinVarMi(uyeExcel, 'kutuphane'));

  check('S3 FAIL-CLOSED: rolu bilinmeyen kimlik HICBIR izne sahip degil',
    DORT.every((i) => !izinVarMi({ izinler: DORT }, i)) &&
      DORT.every((i) => !izinVarMi({ firmaRol: 'admin', izinler: DORT }, i)) &&
      !izinVarMi(null, 'excel') && !izinVarMi(undefined, 'excel'));
  check('S4 FAIL-CLOSED: uyede liste dizi degilse (null / metin) izin YOK',
    !izinVarMi({ firmaRol: 'uye', izinler: null }, 'excel') &&
      !izinVarMi({ firmaRol: 'uye', izinler: 'excel' }, 'excel'));

  check('S5 izinleriSuz: gecersiz → null (dizi degil / bilinmeyen / sayi)',
    izinleriSuz('excel') === null && izinleriSuz(['excel', 'x']) === null &&
      izinleriSuz([1]) === null && izinleriSuz(null) === null);
  check('S5 izinleriSuz: tekrar atilir + kanonik sira; bos dizi gecerli',
    js(izinleriSuz(['kutuphane', 'excel', 'excel'])) === '["excel","kutuphane"]' &&
      js(izinleriSuz([])) === '[]');

  check('S6 YETENEK_IZNI anahtarlari `Yetenek` enum DEGERLERIYLE birebir (enum yeniden adlanirsa kirmizi)',
    YETENEK_IZNI[Yetenek.EXCEL_YUKLE] === 'excel' && YETENEK_IZNI[Yetenek.DWG_YUKLE] === 'dwg' &&
      Object.keys(YETENEK_IZNI).length === 2, js(YETENEK_IZNI));
  check('S6 yeteneklerinIzinleri: yalniz yukleme yetenekleri izin turetir',
    js(yeteneklerinIzinleri([Yetenek.EXCEL_YUKLE, Yetenek.TEKLIF_DUZENLE])) === '["excel"]' &&
      js(yeteneklerinIzinleri([Yetenek.KUTUPHANE_DUZENLE])) === '[]' &&
      js(yeteneklerinIzinleri(undefined)) === '[]');

  check('S7 teklif kapsami: sahip → firma · uye+izin → firma · uye izinsiz → kendi · rolsuz → kendi',
    teklifKapsamiCoz({ firmaRol: 'sahip', izinler: [] }) === 'firma' &&
      teklifKapsamiCoz({ firmaRol: 'uye', izinler: ['firmaTeklifleri'] }) === 'firma' &&
      teklifKapsamiCoz({ firmaRol: 'uye', izinler: ['excel'] }) === 'kendi' &&
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

  check('S10 teklifKimligiCoz: uye izinsiz → kendi · sahip → firma',
    teklifKimligiCoz({ id: 'B', firmaId: 'F1', firmaRol: 'uye', izinler: ['excel'] }).teklifKapsami === 'kendi' &&
      teklifKimligiCoz({ id: 'A', firmaId: 'F1', firmaRol: 'sahip', izinler: [] }).teklifKapsami === 'firma');
  let firmasiz: any = null;
  try { teklifKimligiCoz({ id: 'A', firmaId: null, firmaRol: 'sahip' }); } catch (e) { firmasiz = e; }
  check('S10 teklifKimligiCoz firmasiz hesabi GURULTULU durdurur (kimlikCoz 403 mirasi)',
    hataDurumu(firmasiz) === 403, String(hataDurumu(firmasiz)));

  check('S11 denetim metni kanonik ve bos kume "-"',
    izinMetni(['excel', 'kutuphane']) === 'excel,kutuphane' && izinMetni([]) === '-');
  check('S12 her iznin ekranda okunacak adi var', DORT.every((i) => (IZIN_ADI[i] ?? '').length > 2));
}

// ═══════════════════════════════════════════════════════════════════════════
//  E · SEMA / MIGRATION / ON YUZ ESLIGI — ayni dort anahtar, ayni varsayilan
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

  const migDizin = 'backend/prisma/migrations/20260923120000_ekip_uye_izinleri/migration.sql';
  const mig = oku(migDizin).replace(/^\s*--.*$/gm, '');
  const tip = /CREATE TYPE "UyeIzni" AS ENUM \(([^)]*)\)/.exec(mig)?.[1]?.split(',').map((s) => s.trim().replace(/'/g, ''));
  check('E3 migration CREATE TYPE degerleri == UYE_IZINLERI', js(tip) === js(UYE_IZINLERI), js(tip));
  const diziler = [...mig.matchAll(/ADD COLUMN\s+"izinler" "UyeIzni"\[\] DEFAULT ARRAY\[([^\]]*)\]/g)]
    .map((m) => m[1].split(',').map((s) => s.trim().replace(/'/g, '')));
  check('E3 migration IKI kolon (User + FirmaDavet) varsayilani == TUM_IZINLER',
    diziler.length === 2 && diziler.every((d) => js(d) === js(TUM_IZINLER)) &&
      /ALTER TABLE "User"/.test(mig) && /ALTER TABLE "FirmaDavet"/.test(mig), js(diziler));
  check('E3 migration YALNIZ EKLER (DROP / DELETE / UPDATE yok)',
    !/\bDROP\b|\bDELETE\s+FROM\b|\bUPDATE\s+"/i.test(mig));

  const onYuz = kodu(oku('frontend/ozellik/firma/ekip/izin-metinleri.ts'));
  const anahtarlar = [...onYuz.matchAll(/anahtar:\s*'([a-zA-Z]+)'/g)].map((m) => m[1]);
  check('E4 on yuz izin sozlugu anahtarlari == UYE_IZINLERI (ayni sira)',
    js(anahtarlar) === js(UYE_IZINLERI), js(anahtarlar));
}

// ═══════════════════════════════════════════════════════════════════════════
//  K · KAPI DAVRANISI — gercek `ErisimGuard`, GERCEK denetleyici metadata'si
// ═══════════════════════════════════════════════════════════════════════════
const reflector = new Reflector();
const metotlar = (cls: any): string[] =>
  Object.getOwnPropertyNames(cls.prototype).filter((m) => m !== 'constructor');
const yetenekleri = (cls: any, m: string): string[] =>
  reflector.getAllAndOverride<string[]>(YETENEK_KEY, [cls.prototype[m], cls]) ?? [];

/** Abonelik kapisi HER ZAMAN acik: burada olculen yalniz uye izni ekseni. */
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
const uyeHaric = (x: UyeIzni) => uyeYalniz(...DORT.filter((i) => i !== x));
const ROLSUZ = { id: 'X', firmaId: 'F1', izinler: DORT };

/** Sahte denetleyici: izin isaretli, YETENEKSIZ uc — kontrol SIRASINI olcer. */
@Controller('sahte-izin')
@UseGuards(JwtAuthGuard, ErisimGuard)
class YeteneksizIzinliController {
  @UyeIzniGerekli('kutuphane')
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
  check(`${etiket} (${hedefler.length} uc): izinsiz → 403 UYE_IZNI_YOK/${izin} · izinli → gecer · sahip (bos liste) → gecer`,
    hepsi && hedefler.length > 0, sonuc.join(' | '));
}

async function bolumK(): Promise<void> {
  console.log('\n── K · KAPI DAVRANISI (gercek uclar) ──');

  // Excel: yetenekten TURETILEN izin — dekorator yok, yine de kapali
  const excelUclari = [
    { cls: ExcelGridController, m: 'prepare' },
    { cls: ExcelEngineController, m: 'analyze' },
    { cls: QuotesController, m: 'parseExcel' },
  ];
  check('K0-FIXTURE KANITI: Excel uclarinin UCU de EXCEL_YUKLE tasiyor',
    excelUclari.every(({ cls, m }) => yetenekleri(cls, m).includes(Yetenek.EXCEL_YUKLE)));
  await izinBekle('K1 Excel', excelUclari, 'excel');

  const dwgUclari = metotlar(DwgEngineController)
    .filter((m) => yetenekleri(DwgEngineController, m).includes(Yetenek.DWG_YUKLE))
    .map((m) => ({ cls: DwgEngineController, m }));
  check('K2-FIXTURE KANITI: DWG denetleyicisinde 6 DWG_YUKLE ucu', dwgUclari.length === 6,
    js(dwgUclari.map((u) => u.m)));
  await izinBekle('K2 DWG', dwgUclari, 'dwg');
  const dwgSaglik = await sina(DwgEngineController, 'health', UYE_HICBIRI);
  check('K2b yeteneksiz DWG saglik ucu izin ISTEMEZ', dwgSaglik.gecti, js(dwgSaglik));

  const kutuphaneUclari = [
    ...metotlar(LibraryController).map((m) => ({ cls: LibraryController, m })),
    ...metotlar(LaborFirmsController).map((m) => ({ cls: LaborFirmsController, m })),
    ...['bulkMatch', 'remember', 'listAliases', 'saveAlias', 'deleteAlias'].map((m) => ({ cls: MatchingController, m })),
    ...['bulkMatch', 'remember', 'reindex'].map((m) => ({ cls: LaborMatchingController, m })),
    // 23.09 guvenlik incelemesi (HIGH): PDF analizi firmanin kutuphanesinden
    // iskonto + ozel fiyat dondurur (`ai.service.ts` `matchWithDatabase`).
    { cls: AiController, m: 'analyze' },
  ];
  // ⚠ Sayilar OLCULDU (23.09): kutuphane 15 · iscilik firmalari 17 · eslestirme 8 · AI 1.
  //   Ilk yazimda "16+ / 15+" yazilmisti ve kapi kirmizi yandi — iddia degil olcum.
  check('K3-FIXTURE KANITI: kutuphane kumesi dolu (kutuphane 15+ · iscilik firmalari 17+ · eslestirme 8 · AI analizi 1)',
    metotlar(LibraryController).length >= 15 && metotlar(LaborFirmsController).length >= 17 &&
      kutuphaneUclari.length >= 41,
    `kutuphane=${metotlar(LibraryController).length} iscilik=${metotlar(LaborFirmsController).length} toplam=${kutuphaneUclari.length}`);
  await izinBekle('K3 Kutuphanem', kutuphaneUclari, 'kutuphane');

  // Izin ISTEMEYEN uclar: havuz, antet, eslestirme saglik, teklif listesi
  const serbest = [
    { cls: MaterialsController, m: metotlar(MaterialsController)[0] },
    { cls: MatchingController, m: 'indexHealth' },
    { cls: QuotesController, m: 'findAll' },
    { cls: QuoteFormatsController, m: metotlar(QuoteFormatsController).find((m) => m === 'list') ?? '' },
  ];
  const serbestSonuc = await Promise.all(serbest.map(async (u) => ({ ad: `${u.cls.name}.${u.m}`, r: await sina(u.cls, u.m, UYE_HICBIRI) })));
  check('K4 Malzeme Havuzu · antet listesi · indeks sagligi · teklif listesi izin ISTEMEZ (hic izni olmayan uye gecer)',
    serbestSonuc.every((s) => s.r.gecti) && serbest.every((u) => u.m), js(serbestSonuc));

  const rolsuz = await sina(ExcelGridController, 'prepare', ROLSUZ);
  check('K5 FAIL-CLOSED: rolu bilinmeyen kimlik (liste dolu olsa da) → 403', !rolsuz.gecti && rolsuz.durum === 403, js(rolsuz));

  const govde = await dene(() => guard.canActivate(baglam(LibraryController, 'findAll', uyeHaric('kutuphane'))));
  const g = hataGovdesi(govde.hata);
  check('K6 403 govdesi ABONELIK_KISITLI DEGIL (on yuz odeme seridi acmasin) ve cozumu soyler',
    g?.kod === 'UYE_IZNI_YOK' && g?.kod !== 'ABONELIK_KISITLI' && /ana kullanıcı/.test(g?.mesaj ?? ''), js(g));

  karar.sayi = 0;
  await sina(ExcelGridController, 'prepare', uyeHaric('excel'));
  check('K7 izin reddi DB\'ye GITMEZ (abonelik karari hic sorulmadi)', karar.sayi === 0, `karar=${karar.sayi}`);

  const isaretli = await sina(YeteneksizIzinliController, 'isaretli', uyeHaric('kutuphane'));
  const serbestIs = await sina(YeteneksizIzinliController, 'serbest', uyeHaric('kutuphane'));
  check('K8 ⭐ SIRA: yeteneksiz ama izin isaretli uc da kapali (erken `return true` izni YUTMAZ)',
    !isaretli.gecti && isaretli.kod === 'UYE_IZNI_YOK' && serbestIs.gecti, js({ isaretli, serbestIs }));
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
  for (const cls of [LibraryController, LaborFirmsController]) {
    check(`B1 ${cls.name}: SINIF duzeyinde 'kutuphane' + sinif guard'larinda ErisimGuard`,
      Reflect.getMetadata(UYE_IZNI_KEY, cls) === 'kutuphane' && guardAdlari(cls).includes('ErisimGuard'),
      js({ izin: Reflect.getMetadata(UYE_IZNI_KEY, cls), guardlar: guardAdlari(cls) }));
  }
  for (const [cls, ms] of [
    [MatchingController, ['bulkMatch', 'remember', 'listAliases', 'saveAlias', 'deleteAlias']],
    [LaborMatchingController, ['bulkMatch', 'remember', 'reindex']],
  ] as const) {
    const eksik = ms.filter((m) => Reflect.getMetadata(UYE_IZNI_KEY, (cls as any).prototype[m]) !== 'kutuphane');
    check(`B2 ${cls.name}: fiyat ceken ${ms.length} ucta 'kutuphane' + sinifta ErisimGuard`,
      eksik.length === 0 && guardAdlari(cls).includes('ErisimGuard'), js({ eksik, guardlar: guardAdlari(cls) }));
  }

  check("B2 AiController.analyze: 'kutuphane' + sinifta ErisimGuard (PDF analizi kutuphane fiyati dondurur)",
    Reflect.getMetadata(UYE_IZNI_KEY, (AiController as any).prototype.analyze) === 'kutuphane' &&
      guardAdlari(AiController).includes('ErisimGuard'));
  // Kisisel fiyat listesi (/brands/price-lists/:id/materials) izne SERVISTE
  // baglidir: havuz listesi acik kalmali, sinif dekoratoru konamaz.
  const brandsKodu = kodu(oku('backend/src/ozellik/kutuphane/brands/brands.controller.ts'));
  const brandsServis = kodu(oku('backend/src/ozellik/kutuphane/brands/brands.service.ts'));
  // 23.09.2026 (vitrin): cagri DORDUNCU argumani (havuz fiyati karari) aldi.
  // Desen onu da SABITLER: ucuncu yer yine tam olarak Kutuphanem izni olmali —
  // argumanlar yer degistirirse (izin yerine fiyat karari) kisisel liste
  // izinsiz uyeye acilirdi.
  check('B2b kisisel fiyat listesi: uc izni servise GECIRIR, servis kisisel listede izin ISTER',
    /getPriceListMaterials\(\s*listId,\s*kimlikCoz\(user\)\.firmaId,\s*izinVarMi\(user, 'kutuphane'\),\s*await this\.erisim\.havuzFiyatiGorunurMu\(kimlikCoz\(user\)\.firmaId, user\?\.role\),?\s*\)/.test(brandsKodu) &&
      /if \(pl\.ownerUserId && !kutuphaneIzni\)/.test(brandsServis));

  // Kaynak kurali: `@UyeIzniGerekli(` kullanan HER dosya ErisimGuard'i guard listesinde tasir.
  const dosyalar = kaynakGez(path.join(KOK, 'backend/src'))
    .filter((d) => !d.endsWith('uye-izni.decorator.ts'))
    .filter((d) => /@UyeIzniGerekli\(/.test(kodu(fs.readFileSync(d, 'utf8'))));
  const guardsiz = dosyalar.filter((d) => !/@UseGuards\([^)]*\bErisimGuard\b[^)]*\)/.test(kodu(fs.readFileSync(d, 'utf8'))));
  check('B3 `@UyeIzniGerekli` kullanan HER dosyada `@UseGuards(... ErisimGuard ...)` var',
    dosyalar.length >= 5 && guardsiz.length === 0,
    js({ dosya: dosyalar.map((d) => path.basename(d)), guardsiz: guardsiz.map((d) => path.basename(d)) }));

  const g = kodu(oku('backend/src/ozellik/odeme/abonelik/erisim.guard.ts'));
  const izinOkuma = g.indexOf('UYE_IZNI_KEY');
  const izinKarari = g.indexOf('izinVarMi(');
  const erkenDonus = g.indexOf('if (!gerekenler || gerekenler.length === 0) return true;');
  check('B4 kaynak SIRASI: izin okunur ve karar verilir, SONRA yeteneksiz uc icin erken donus',
    izinOkuma > 0 && izinKarari > izinOkuma && erkenDonus > izinKarari, js({ izinOkuma, izinKarari, erkenDonus }));
  check('B5 izin yetenekten TURETILIR (`yeteneklerinIzinleri(gerekenler)`)',
    /yeteneklerinIzinleri\(gerekenler\)/.test(g));

  const strateji = kodu(oku('backend/src/altyapi/auth/strategies/jwt.strategy.ts'));
  check('B6 JwtStrategy donusu `izinler: user.izinler` tasir (kapinin girdisi)',
    /izinler:\s*user\.izinler/.test(strateji));
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
  const UYE_IZINLI = teklifKimligiCoz({ id: 'B', firmaId: 'F1', firmaRol: 'uye', izinler: ['firmaTeklifleri'] });
  const UYE_IZINSIZ = teklifKimligiCoz({ id: 'B', firmaId: 'F1', firmaRol: 'uye', izinler: ['excel', 'dwg', 'kutuphane'] });

  const liste = async (k: TeklifKimligi) => {
    const { prisma } = teklifDb();
    const r = await new QuotesService(prisma, null as any, null as any).findAll(k, {});
    return { ids: r.kayitlar.map((q: any) => q.id).sort(), toplam: r.toplam };
  };
  const lSahip = await liste(SAHIP);
  const lIzinli = await liste(UYE_IZINLI);
  const lIzinsiz = await liste(UYE_IZINSIZ);
  check('T1 sahip firmanin TUM teklifleri (Q-A, Q-B) — baska firma YOK', js(lSahip.ids) === '["Q-A","Q-B"]', js(lSahip));
  check('T1 izni ACIK uye firmanin tamami (Q-A, Q-B)', js(lIzinli.ids) === '["Q-A","Q-B"]', js(lIzinli));
  check('T2 ⭐ izni KAPALI uye YALNIZ kendi (Q-B) ve sayac da 1', js(lIzinsiz.ids) === '["Q-B"]' && lIzinsiz.toplam === 1, js(lIzinsiz));

  const { prisma, quote, iz } = teklifDb();
  const svc = new QuotesService(prisma, null as any, null as any);
  const baskasinin = await dene(() => svc.findOne(UYE_IZINSIZ, 'Q-A'));
  const kendi = await dene(() => svc.findOne(UYE_IZINSIZ, 'Q-B'));
  check('T3 izni kapali uye baskasinin teklifini ACAMAZ (404), kendisininkini acar',
    hataDurumu(baskasinin.hata) === 404 && (kendi.deger as any)?.id === 'Q-B',
    js({ baska: hataDurumu(baskasinin.hata), kendi: (kendi.deger as any)?.id }));

  const sil = await dene(() => svc.remove(UYE_IZINSIZ, 'Q-A'));
  const bilgi = await dene(() => svc.updateInfo(UYE_IZINSIZ, 'Q-A', { musteri: 'ele gecirme' }));
  const revize = await dene(() => svc.create(UYE_IZINSIZ, { title: 'ele gecirme', items: [] } as any, 'Q-A'));
  const arsiv = await dene(() => svc.listExports(UYE_IZINSIZ, 'Q-A'));
  const qa = quote.find((q) => q.id === 'Q-A');
  check('T4 ⭐ baskasinin teklifi: SILME · KAPAK · REVIZE · CIKTI ARSIVI → 404 ve teklif DEGISMEDI',
    [sil, bilgi, revize, arsiv].every((r) => hataDurumu(r.hata) === 404) &&
      !!qa && qa.title === 'Sahibin teklifi' && qa.musteri === undefined,
    js({ sil: hataDurumu(sil.hata), bilgi: hataDurumu(bilgi.hata), revize: hataDurumu(revize.hata), arsiv: hataDurumu(arsiv.hata), qa }));

  const kendiBilgi = await dene(() => svc.updateInfo(UYE_IZINSIZ, 'Q-B', { musteri: 'Acme' }));
  check('T5 kendi teklifinde calisir (kapak guncellendi)', !kendiBilgi.hata &&
    quote.find((q) => q.id === 'Q-B')?.musteri === 'Acme', js(hataGovdesi(kendiBilgi.hata)));

  const sahipSil = await dene(() => new QuotesService(teklifDb().prisma, null as any, null as any).findOne(SAHIP, 'Q-B'));
  check('T5b sahip uyenin teklifini acar (kapsam yalniz UYEYI daraltir)', (sahipSil.deger as any)?.id === 'Q-B');

  const kosullar = iz.filter((c) => ['findMany', 'findFirst', 'count'].includes(c.islem));
  check('T6 ⭐ BAGLANTI: izni kapali uyenin HER teklif sorgusu userId=B + firmaId=F1 tasir',
    kosullar.length >= 6 && kosullar.every((c) => c.where?.userId === 'B' && c.where?.firmaId === 'F1'),
    js(kosullar.map((c) => `${c.islem}:${js(c.where)}`)));

  const kota = new CeviriKotaServisi(teklifDb().prisma);
  const cevBaska = await dene(() => kota.kayitliIcerik(UYE_IZINSIZ, 'Q-A'));
  const cevKendi = await dene(() => kota.kayitliIcerik(UYE_IZINSIZ, 'Q-B'));
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
  check('U8 KVKK indirmesi uyeye YALNIZ kendi teklifleri (degismedi, izinden bagimsiz)',
    /where:\s*sahipMi\s*\?\s*\{\s*firmaId\s*\}\s*:\s*\{\s*firmaId,\s*userId\s*\}/.test(hs));
}

async function main() {
  bolumS();
  bolumE();
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
