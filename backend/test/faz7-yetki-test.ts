/**
 * FAZ 7 · F1a — YETKI TAMIRLERI KAPISI (`npm run test:faz7-yetki`)
 *
 * DB, SUNUCU ve AG GEREKTIRMEZ: her sey sahte Prisma ve gercek sinif
 * ornekleriyle olculur. Sema ve migration YOK; canli veri degismez.
 *
 * ── NE OLCULUYOR ────────────────────────────────────────────────────────
 * 2.12 — PAKET SEVIYESI YALNIZ ABONELIKTEN. 07.09'dan beri `TierGuard`
 * `Math.max(User.tier, abonelik)` okuyordu. O kural bir kusuru kapatmak icin
 * konmustu (pro satin alan firma `User.tier: core` kaldigi icin 403
 * aliyordu) ama TERS YONE aciyordu: `User.tier`i hicbir odeme yolu YAZMIYOR,
 * yalniz yonetici paneli ELLE degistiriyordu. Yani abonelik iptal edilse,
 * dusurulse ya da hic olmasa bile elle verilmis bir `tier` kapiyi acik
 * tutuyordu — seviye satin almayla degil elle dagitiliyordu.
 *
 * K1-K3 — KISI EKSENI → FIRMA EKSENI. Kutuphane 28.08'de firmaya gecti ama
 * uc sorgu kisiye bakmaya devam ediyordu: isçilik sahipligi
 * (`labor-matching.service`), alternatif havuzu (`matching.service`) ve PDF
 * analizinin kutuphane sorgusu (`ai.service`). Sonuc SESSIZDI: ayni firmanin
 * IKINCI uyesi 403 aliyor ya da bos sonuc goruyordu. Bu yuzden F1b (davet)
 * F1a'dan ONCE canliya cikamaz.
 *
 * ── NEDEN SAHTE PRISMA `where`i GERCEKTEN UYGULAMIYOR ───────────────────
 * Burada olculen sey "sorgu dogru satirlari buluyor mu" degil, "sorgu DOGRU
 * EKSENDE mi yaziliyor". Bu yuzden sahte Prisma `where`i KAYDEDER ve testler
 * kaydedilen sekli dogrular (casus). Eksenin gercek satirlarda calistigi
 * `test:labor` ve `test:oneri`de, DB'li dogrulugu ise migration paketinde.
 *
 * Mutant tablosu F1a raporunda. KIRMIZIYA DONERSE REGRESYON.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import { Reflector } from '@nestjs/core';
import { TierGuard, TIER_KEY, RequireTier } from '../src/altyapi/auth/guards/tier.guard';
import { RolesGuard } from '../src/altyapi/auth/guards/roles.guard';
import { ROLES_KEY } from '../src/altyapi/auth/decorators/roles.decorator';
import { ErisimGuard, YETENEK_KEY } from '../src/ozellik/odeme/abonelik/erisim.guard';
import {
  SEVIYE_SIRASI, seviyeSirasi, seviyeGorunenAd, firmaPaketSeviyesi,
} from '../src/altyapi/auth/seviye';
import { LaborController } from '../src/ozellik/kutuphane/labor/labor.controller';
import { AiController } from '../src/ozellik/giris/ai/ai.controller';
import { AiService } from '../src/ozellik/giris/ai/ai.service';
import { AuthService } from '../src/altyapi/auth/auth.service';
import { OturumServisi } from '../src/altyapi/auth/oturum.servisi';
import { AdminService } from '../src/ozellik/kutuphane/admin/admin.service';
import { HesapServisi } from '../src/altyapi/auth/hesap.servisi';
/** PLAN 5.8 §3.4: `HesapServisi` artik kapatma bildirimi de gonderiyor.
 *  Bu paketlerin konusu e-posta DEGIL — sessiz, yutmayan bir gonderici
 *  yeterli. Icerik `test:faz7-ekip` H/K bolumlerinde olculuyor. */
const EPOSTA_SAHTE = { gonder: async () => undefined } as any;
import { LaborMatchingService } from '../src/ozellik/eslestirme/labor-matching/labor-matching.service';
import { LaborMatchingController } from '../src/ozellik/eslestirme/labor-matching/labor-matching.controller';
import { LaborFirmsController } from '../src/ozellik/kutuphane/labor-firms/labor-firms.controller';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

// JWT imzasi yalniz `login` yolunda gerekir; `jwt-secret.ts` yedek deger
// KABUL ETMEZ (bilerek). Testin kendi ortami — canli anahtarla ilgisi yok.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'faz7-yetki-testi-icin-yerel-anahtar-32+';

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

const reflector = new Reflector();
const metadataOku = (anahtar: string, handler: any, cls: any): any =>
  reflector.getAllAndOverride<any>(anahtar, [handler, cls]) ?? null;
/** Nest'in etkin guard kumesi: sinif duzeyi + metot duzeyi birlesimi. */
const guardAdlari = (handler: any, cls: any): string[] => [
  ...((Reflect.getMetadata('__guards__', cls) ?? []) as any[]),
  ...((Reflect.getMetadata('__guards__', handler) ?? []) as any[]),
].map((g: any) => g?.name ?? String(g));

// ═══════════════════════════════════════════════════════════════════════════
//  ORTAK SAHTE PRISMA — SEVIYE EKSENI
// ═══════════════════════════════════════════════════════════════════════════
type SeviyeIz = { abonelikSorgusu: number; abonelikWhere: any[] };

/**
 * `user.tier` KASITLI olarak dolu ve ABONELIKTEN YUKSEK verilir. Kapi
 * yeniden `tier` okumaya baslarsa bu fixture onu YAKALAR; ikisi ayni olsaydi
 * mutant sessizce hayatta kalirdi.
 */
function seviyePrisma(
  seviye: string | null,
  o: { tier?: string; firmaId?: string | null; iz?: SeviyeIz; durum?: string; erisimSonu?: Date } = {},
): any {
  const firmaId = o.firmaId === undefined ? 'F1' : o.firmaId;
  return {
    user: { findUnique: async () => ({ firmaId, tier: o.tier ?? 'pro' }) },
    abonelik: {
      findUnique: async (args: any) => {
        if (o.iz) { o.iz.abonelikSorgusu++; o.iz.abonelikWhere.push(args?.where); }
        // ⚠ 2.13: `durum` + `erisimSonu` ARTIK ZORUNLU. Seviye erisim
        // kararindan suzuluyor; bu fixture SAGLIKLI aboneligi temsil eder
        // (yururlukteki AKTIF). Saglik dallari `test:abonelik-erisim`te.
        return seviye === null
          ? null
          : {
              durum: o.durum ?? 'AKTIF',
              erisimSonu: o.erisimSonu ?? new Date(Date.now() + 30 * 86_400_000),
              paketSurumu: { paket: { seviye } },
            };
      },
    },
  };
}

const sahteCtx = (handler: any, cls: any, user: any): any => ({
  getHandler: () => handler,
  getClass: () => cls,
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
});

async function guardKosu(
  handler: any, cls: any, seviye: string | null,
  o: { tier?: string; firmaId?: string | null; rol?: string; durum?: string; erisimSonu?: Date } = {},
): Promise<{ gecti: boolean; mesaj: string; iz: SeviyeIz }> {
  const iz: SeviyeIz = { abonelikSorgusu: 0, abonelikWhere: [] };
  const guard = new TierGuard(new Reflector(), seviyePrisma(seviye, { ...o, iz }));
  const user = { id: 'u-test', sub: 'u-test', role: o.rol ?? 'user' };
  try {
    const r = await guard.canActivate(sahteCtx(handler, cls, user));
    return { gecti: r === true, mesaj: `canActivate=${JSON.stringify(r)}`, iz };
  } catch (e: any) {
    return { gecti: false, mesaj: String(e?.message ?? e), iz };
  }
}

/** Y6 icin: @RequireTier'i SINIF duzeyine koyan bir controller. */
@RequireTier('pro')
class SinifDuzeyiKontrolcu {
  bir() { return 'ok'; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Y1-Y6 · TIER GUARD DAVRANISI
// ═══════════════════════════════════════════════════════════════════════════
async function yTierGuard() {
  console.log('\n── Y1-Y6 · TierGuard: seviye yalniz abonelikten ──────────');
  const lProto: any = LaborController.prototype;
  const aProto: any = AiController.prototype;

  const y1 = await guardKosu(aProto.analyze, AiController, 'pro', { tier: 'core' });
  check('Y1 ⭐ User.tier core AMA abonelik pro → GECER (seviye abonelikten)',
    y1.gecti === true, y1.mesaj);
  check('Y1-FIXTURE abonelik GERCEKTEN sorgulandi (firmaId ile)',
    y1.iz.abonelikSorgusu === 1 && y1.iz.abonelikWhere[0]?.firmaId === 'F1',
    JSON.stringify(y1.iz));

  const y2 = await guardKosu(aProto.analyze, AiController, 'core', { tier: 'pro' });
  check('Y2 ⭐ User.tier pro AMA abonelik core → 403 (elle verilen tier kapi ACMAZ)',
    y2.gecti === false, y2.mesaj);
  check('Y2-mesaj tam olarak "Bu özellik Pro paketi gerektirir. Mevcut paketiniz: Basic"',
    y2.mesaj === 'Bu özellik Pro paketi gerektirir. Mevcut paketiniz: Basic', y2.mesaj);
  check('Y2-CORE ⭐ musteriye donen mesajda "CORE" YOK (R1/E-5)',
    !/CORE/.test(y2.mesaj) && !/\bPRO\b/.test(y2.mesaj), y2.mesaj);

  const y3 = await guardKosu(aProto.analyze, AiController, null, { tier: 'suite' });
  check('Y3 ⭐ User.tier suite AMA abonelik YOK → 403', y3.gecti === false, y3.mesaj);
  check('Y3-mesaj abonelik yoksa "Mevcut paketiniz yok" der (bos ad basilmaz)',
    y3.mesaj === 'Bu özellik Pro paketi gerektirir. Mevcut paketiniz yok', y3.mesaj);

  const y4 = await guardKosu(aProto.analyze, AiController, 'pro', { firmaId: null });
  check('Y4 ⭐ firmasiz hesap 403 aliyor', y4.gecti === false, y4.mesaj);
  check('Y4-sorgu ⭐ firmasiz hesapta abonelik sorgusu HIC ATILMADI',
    y4.iz.abonelikSorgusu === 0,
    'where: { firmaId: undefined } kosulu SESSIZCE duser → baskasinin aboneligi donerdi');

  // Blok 2 ("suite" paketi) henuz birlesmedi — Prisma `PackageLevel` enum'unda
  // `suite` YOK (olculdu 17.09). Sahte Prisma enum'a bagli olmadigi icin kural
  // BUGUNDEN olculebilir: siralama dogruysa suite pro kapisini acmali.
  const y5 = await guardKosu(aProto.analyze, AiController, 'suite', { tier: 'core' });
  check('Y5 abonelik suite → RequireTier(pro) GECER (siralama core<pro<suite)',
    y5.gecti === true, y5.mesaj);

  const y6 = await guardKosu(
    SinifDuzeyiKontrolcu.prototype.bir, SinifDuzeyiKontrolcu, 'core', { tier: 'pro' },
  );
  check('Y6 SINIF duzeyi @RequireTier de okunuyor (getAllAndOverride)',
    y6.gecti === false, y6.mesaj);

  // Kapinin tek seviye kaynagini kullandigi (kendi haritasini kurmadigi).
  check('Y6b seviye siralamasi tek sabitte (core<pro<suite)',
    SEVIYE_SIRASI.core === 1 && SEVIYE_SIRASI.pro === 2 && SEVIYE_SIRASI.suite === 3
      && seviyeSirasi('yok-boyle') === 0 && seviyeSirasi(null) === 0,
    JSON.stringify(SEVIYE_SIRASI));

  // `labor` okuma ucu ayni kurali yasiyor mu (ikinci aile).
  const y6c = await guardKosu(lProto.findAll, LaborController, 'core', { tier: 'pro' });
  check('Y6c IKINCI AILE: /labor findAll da ayni kurali uyguluyor',
    y6c.gecti === false, y6c.mesaj);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Y7 · REFLECTOR — PAKET KAPISI SINIFTAN METODA INDI
// ═══════════════════════════════════════════════════════════════════════════
function yReflector() {
  console.log('\n── Y7 · Labor metadata haritasi ──────────────────────────');
  const lProto: any = LaborController.prototype;
  const uclar = ['findAll', 'findOne', 'create', 'update', 'remove', 'yoneticiKatalogu'];
  check('Y7-FIXTURE alti ucun HEPSI fonksiyon (bos-kume yalanci yesil kapisi)',
    uclar.every((u) => typeof lProto[u] === 'function'),
    uclar.map((u) => `${u}:${typeof lProto[u]}`).join(', '));

  check('Y7a ⭐ LaborController SINIFINDA TIER_KEY YOK',
    Reflect.getMetadata(TIER_KEY, LaborController) === undefined,
    JSON.stringify(Reflect.getMetadata(TIER_KEY, LaborController) ?? null));
  for (const uc of ['findAll', 'findOne']) {
    check(`Y7b ${uc} metodunda TIER_KEY ['pro']`,
      JSON.stringify(Reflect.getMetadata(TIER_KEY, lProto[uc])) === JSON.stringify(['pro']),
      JSON.stringify(Reflect.getMetadata(TIER_KEY, lProto[uc]) ?? null));
  }
  for (const uc of ['create', 'update', 'remove']) {
    check(`Y7c ${uc} paket kapisi TASIMIYOR ama @Roles('admin') tasiyor`,
      metadataOku(TIER_KEY, lProto[uc], LaborController) === null
        && JSON.stringify(metadataOku(ROLES_KEY, lProto[uc], LaborController)) === JSON.stringify(['admin']),
      `tier=${JSON.stringify(metadataOku(TIER_KEY, lProto[uc], LaborController))} `
        + `roles=${JSON.stringify(metadataOku(ROLES_KEY, lProto[uc], LaborController))}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Y7b · YONETICI KATALOG UCU (R1-O4)
// ═══════════════════════════════════════════════════════════════════════════
async function yYoneticiKatalogu() {
  console.log('\n── Y7b · /labor/yonetici-katalog (R1-O4) ─────────────────');
  const lProto: any = LaborController.prototype;

  check('Y7b-1 ⭐ yoneticiKatalogu ROLES_KEY [admin], TIER_KEY ve YETENEK_KEY YOK',
    JSON.stringify(metadataOku(ROLES_KEY, lProto.yoneticiKatalogu, LaborController)) === JSON.stringify(['admin'])
      && metadataOku(TIER_KEY, lProto.yoneticiKatalogu, LaborController) === null
      && metadataOku(YETENEK_KEY, lProto.yoneticiKatalogu, LaborController) === null,
    `roles=${JSON.stringify(metadataOku(ROLES_KEY, lProto.yoneticiKatalogu, LaborController))} `
      + `tier=${JSON.stringify(metadataOku(TIER_KEY, lProto.yoneticiKatalogu, LaborController))} `
      + `yetenek=${JSON.stringify(metadataOku(YETENEK_KEY, lProto.yoneticiKatalogu, LaborController))}`);

  // Express rota sirasi: `:id` ONCE tanimlanirsa `:id = 'yonetici-katalog'`
  // eslesir ve bu uc HIC cagrilmaz (sessiz kusur, 404 bile vermez).
  const sira = Object.getOwnPropertyNames(LaborController.prototype);
  check('Y7b-2 ⭐ yoneticiKatalogu, findOne (@Get(":id")) tanimindan ONCE',
    sira.indexOf('yoneticiKatalogu') >= 0
      && sira.indexOf('yoneticiKatalogu') < sira.indexOf('findOne'),
    JSON.stringify(sira));

  // ── BAGLANTI: UC GERCEKTEN CALISIYOR MU ────────────────────────────────
  // Uc guard zinciri (TierGuard → ErisimGuard → RolesGuard) yonetici
  // hesabinda SIRAYLA `true` donmeli ve servis cagrilmali. "Metadata yok"
  // ara sonuctur; kullaniciya dokunan sey zincirin gecirmesidir.
  const iz: SeviyeIz = { abonelikSorgusu: 0, abonelikWhere: [] };
  const yoneticiKullanici = { id: 'y1', sub: 'y1', firmaId: 'F1', role: 'admin' };
  const ctx = sahteCtx(lProto.yoneticiKatalogu, LaborController, yoneticiKullanici);

  const tier = new TierGuard(new Reflector(), seviyePrisma('core', { tier: 'core', iz }));
  const erisim = new ErisimGuard(new Reflector(), { karar: async () => ({ kisitli: true }) } as any);
  const roles = new RolesGuard(new Reflector());
  let zincir = 'baslamadi';
  try {
    const a = await tier.canActivate(ctx);
    const b = await erisim.canActivate(ctx);
    const c = roles.canActivate(ctx);
    zincir = `tier=${a} erisim=${b} roles=${c}`;
    check('Y7b-3 ⭐ BAGLANTI: uc guard da yonetici hesabinda GECIRIYOR (abonelik core)',
      a === true && b === true && c === true, zincir);
  } catch (e: any) {
    check('Y7b-3 ⭐ BAGLANTI: uc guard da yonetici hesabinda GECIRIYOR (abonelik core)',
      false, `${e?.constructor?.name}: ${e?.message}`);
  }
  check('Y7b-4 paketsiz uc abonelik sorgusu bile ATMIYOR (metadata yok → erken cikis)',
    iz.abonelikSorgusu === 0, JSON.stringify(iz));

  // OLCUT: ayni zincir OKUMA ucunda RED uretebiliyor mu? Uretemiyorsa
  // yukaridaki "geciyor" sonucu duzenegin korlugunu olcerdi.
  const olcut = await guardKosu(lProto.findAll, LaborController, 'core', { tier: 'core', rol: 'admin' });
  check('Y7b-OLCUT ayni duzenek OKUMA ucunda RED uretiyor (kor degil)',
    olcut.gecti === false, olcut.mesaj);

  // Servis GERCEKTEN cagriliyor mu (uc gövdesi laborService.findAll'a gidiyor).
  const cagrilar: any[] = [];
  const kontrolcu = new LaborController({ findAll: (d?: string) => { cagrilar.push(d); return ['kalem']; } } as any);
  const sonuc = kontrolcu.yoneticiKatalogu('mechanical');
  check('Y7b-5 ⭐ BAGLANTI: uc laborService.findAll(discipline) cagiriyor',
    JSON.stringify(sonuc) === JSON.stringify(['kalem']) && cagrilar.length === 1 && cagrilar[0] === 'mechanical',
    JSON.stringify({ sonuc, cagrilar }));
}

// ═══════════════════════════════════════════════════════════════════════════
//  Y8 · KAPI: @RequireTier tasiyan her uc ErisimGuard + yetenek de tasir
// ═══════════════════════════════════════════════════════════════════════════
function yErisimEsligi() {
  console.log('\n── Y8 · RequireTier ⇒ ErisimGuard + yetenek ──────────────');
  // FIXTURE KANITI: kaynakta @RequireTier kullanan dosya listesi, asagidaki
  // ACIK controller listesiyle AYNI olmali. Yeni bir controller paket kapisi
  // koyar da buraya yazilmazsa bu assert kizarir (kapinin kor noktasi olmaz).
  const kaynakKok = path.join(KOK, 'backend/src');
  const bulunan: string[] = [];
  const tara = (dizin: string) => {
    for (const ad of fs.readdirSync(dizin)) {
      const tam = path.join(dizin, ad);
      const st = fs.statSync(tam);
      if (st.isDirectory()) tara(tam);
      else if (ad.endsWith('.ts') && oku(path.relative(KOK, tam).split(path.sep).join('/')).includes('@RequireTier(')) {
        bulunan.push(path.relative(kaynakKok, tam).split(path.sep).join('/'));
      }
    }
  };
  tara(kaynakKok);
  const beklenen = [
    'ozellik/giris/ai/ai.controller.ts',
    'ozellik/kutuphane/labor/labor.controller.ts',
    // ── T2.14 (22.09.2026): ISCILIK PAKET KAPISI IKI DOSYA DAHA KAZANDI.
    //    Bu satirlar "listeyi yesile boyamak" icin degil, ISCILIK = PRO
    //    urun kuralinin kod tarafina gecmesi icin eklendi: `/labor` (kuresel
    //    katalog) Pro kapiliyken kullanicinin KENDI iscilik firmalari
    //    (`/labor-firms`, 17 uc) ve iscilik eslestirme motoru
    //    (`/labor-matching`, 3 musteri ucu) kapisizdi — Basic abonelikle
    //    iscilik fiyati uretilebiliyordu. Paket tanimi: `scripts/paketleri-kur.ts:76`
    //    "core (malzeme) | pro (malzeme + iscilik + dwg)".
    'ozellik/eslestirme/labor-matching/labor-matching.controller.ts',
    'ozellik/kutuphane/labor-firms/labor-firms.controller.ts',
  ];
  check('Y8-FIXTURE @RequireTier kullanan dosya listesi testin listesiyle AYNI',
    JSON.stringify([...bulunan].sort()) === JSON.stringify([...beklenen].sort()),
    `kaynak=${JSON.stringify([...bulunan].sort())}`);

  const kontrolculer: Array<[string, any]> = [
    ['LaborController', LaborController],
    ['AiController', AiController],
    // T2.14: fixture listesine eklenen iki dosya BURAYA DA girmeli — yoksa
    // Y8-FIXTURE yesil olur ama Y8'in kendisi o uclara HIC bakmaz.
    ['LaborFirmsController', LaborFirmsController],
    ['LaborMatchingController', LaborMatchingController],
  ];
  let paketliUc = 0;
  for (const [ad, cls] of kontrolculer) {
    for (const uc of Object.getOwnPropertyNames(cls.prototype)) {
      if (uc === 'constructor') continue;
      const handler = cls.prototype[uc];
      if (metadataOku(TIER_KEY, handler, cls) === null) continue;
      paketliUc++;
      check(`Y8 ${ad}.${uc} paket kapisiyla birlikte ErisimGuard + yetenek tasiyor`,
        guardAdlari(handler, cls).includes('ErisimGuard')
          && metadataOku(YETENEK_KEY, handler, cls) !== null,
        `guards=${JSON.stringify(guardAdlari(handler, cls))} `
          + `yetenek=${JSON.stringify(metadataOku(YETENEK_KEY, handler, cls))}`);
    }
  }
  check('Y8-FIXTURE2 paket kapili uc SAYISI sifirdan buyuk (dongu gercekten kostu)',
    paketliUc >= 3, `paketliUc=${paketliUc}`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Y9-Y10 · TURETILMIS `tier` ve KVKK'nin SAKLANAN degeri
// ═══════════════════════════════════════════════════════════════════════════
async function yTuretilmisSeviye() {
  console.log('\n── Y9-Y10 · /auth/me, login ve KVKK ──────────────────────');

  const authPrisma = (seviye: string | null, tier: string, firmaId: string | null, kullanicilar?: any[]): any => ({
    user: {
      findUnique: async () => ({
        id: 'u1', email: 'a@b.test', role: 'user', tier, firmaId, createdAt: new Date(),
        emailVerified: true, ad: null, soyad: null, telefon: null, firmaRol: 'sahip', firma: null,
      }),
      findMany: async () => kullanicilar ?? [],
      // FAZ 7 F1b: `/auth/me` ve oturum yaniti artik KOLTUK durumunu da
      // hesapliyor (§3.12). Tek kisilik firma: onunde kimse yok → hak
      // sorgusu ATILMAZ ve bu paketin olctugu `tier` turetmesi degismez.
      count: async () => 0,
      findFirst: async () => ({ ad: 'Sahip', soyad: null, email: 'a@b.test' }),
    },
    // FAZ 7 F2b: `girisKarari` iki adimli giris zorunlulugu icin firmayi
    // okur; `/auth/me` de `mfa` alanini doldurur. Ikisi de bu paketin
    // olctugu `tier` turetmesini DEGISTIRMEZ (zorunluluk kapali).
    firma: { findUnique: async () => ({ mfaZorunlu: false }) },
    mfaKurtarmaKodu: { count: async () => 0 },
    abonelik: {
      // ⚠ 2.13: saglikli (AKTIF, suresi gelmemis) abonelik. Bu paket `tier`
      // TURETMESINI olcuyor; saglik dallari `test:abonelik-erisim`te.
      findUnique: async () => (seviye === null ? null : {
        durum: 'AKTIF',
        erisimSonu: new Date(Date.now() + 30 * 86_400_000),
        paketSurumu: { paket: { seviye, ad: 'Paket', kod: 'k', kapsam: 'mechanical', kullaniciHakki: 2 } },
      }),
    },
    userSubscription: { findMany: async () => [] },
    // FAZ 7 F3b: `/auth/me` "Sirket hesabi" kartini, `login` ise zorunlu
    // kurumsal girisi (V7) okuyor. Ikisi de bu paketin olctugu `tier`
    // turetmesini DEGISTIRMEZ (firmada saglayici yok).
    kullaniciDisKimlik: { findFirst: async () => null, findMany: async () => [] },
    firmaKimlikSaglayici: { findUnique: async () => null },
    dogrulanmisAlanAdi: { findUnique: async () => null, findMany: async () => [], count: async () => 0 },
  });
  const erisimSahte = { karar: async () => ({ kisitli: false }) } as any;
  const jwtSahte = { sign: () => 'sahte-token' } as any;
  const dogrulamaSahte = { dogrulamaGonderSessizce: async () => undefined } as any;

  const proPrisma = authPrisma('pro', 'core', 'F1');
  // FAZ 7 F1b: `AuthService` artik `OturumServisi`ye delege ediyor (§3.11).
  // GERCEK servis veriliyor (sahte degil): `login`/`register` yanitindaki
  // `tier` turetmesi ve ban/silme kapisi o sinifta kosuyor.
  const svcPro = new AuthService(proPrisma, jwtSahte, erisimSahte, dogrulamaSahte, new OturumServisi(proPrisma, jwtSahte));
  const me1: any = await svcPro.me('u1');
  check('Y9 ⭐ /auth/me: saklanan tier core, abonelik pro → yanit "pro"',
    me1?.tier === 'pro', `tier=${JSON.stringify(me1?.tier)}`);

  const yokPrisma = authPrisma(null, 'pro', 'F1');
  const svcYok = new AuthService(yokPrisma, jwtSahte, erisimSahte, dogrulamaSahte, new OturumServisi(yokPrisma, jwtSahte));
  const me2: any = await svcYok.me('u1');
  // 21.09.2026 (2.15): BEKLENEN DEGER 'core' -> null. Kuralin NIYETI ayni
  // ("saklanan `pro` DONDURULMEZ") ama artik daha siki saglaniyor.
  // 'core' de UYDURMA bir degerdi: abonelik yokken musteriye "Basic" demek,
  // ona SAHIP OLMADIGI bir paketi varmis gibi soylemekti — kenar cubugu
  // rozeti suresi dolmus PRO musteriye "Basic" gosteriyordu. Artik seviye
  // yoksa `null`, ekran da ad UYDURMUYOR (`paket-rozeti.test.ts`).
  check('Y9a ⭐ /auth/me: abonelik yok → null (ne saklanan "pro" ne uydurma "core")',
    me2?.tier === null, `tier=${JSON.stringify(me2?.tier)}`);

  // login yolu ayni kurali yasiyor mu (ikinci giris noktasi).
  const parolaOzeti = bcrypt.hashSync('parola123', 4);
  const kullanici = {
    id: 'u1', email: 'a@b.test', role: 'user', tier: 'suite', firmaId: 'F1',
    password: parolaOzeti, status: 'active', deletedAt: null, createdAt: new Date(),
  };
  const girisPrisma = authPrisma('core', 'suite', 'F1', [kullanici]);
  const girisSvc = new AuthService(
    girisPrisma, jwtSahte, erisimSahte, dogrulamaSahte, new OturumServisi(girisPrisma, jwtSahte),
  );
  const giris: any = await girisSvc.login({ email: 'a@b.test', password: 'parola123' } as any);
  check('Y9b ⭐ login yaniti: saklanan tier suite, abonelik core → "core"',
    giris?.user?.tier === 'core', JSON.stringify(giris?.user));
  check('Y9b-FIXTURE login gercekten calisti (token dondu)',
    giris?.token === 'sahte-token', JSON.stringify(giris?.token));

  // ── Y10 KVKK: disa aktarim SAKLANAN degeri verir ───────────────────────
  // Kisi hakkinda TUTULAN veri odur; turetilmis deger "hakkimda ne var"
  // sorusunun cevabi degildir.
  const kvkkKullanici = {
    id: 'u1', email: 'a@b.test', ad: null, soyad: null, telefon: null,
    role: 'user', tier: 'suite', status: 'active', firmaRol: 'sahip',
    createdAt: new Date(), emailVerified: true, passwordChangedAt: null,
    deletedAt: null, sozlesmeOnayiAt: null, sozlesmeSurumu: null,
    ticariIletiOnayiAt: null, firma: null,
  };
  const kvkkPrisma: any = new Proxy({}, {
    get: (_t, model: string) => {
      if (model === 'user') return { findUnique: async () => kvkkKullanici };
      // FAZ 7 F3b: disa aktarim `kullaniciDisKimlik.findMany` de okuyor.
      return {
        findMany: async () => [], findUnique: async () => null,
        findFirst: async () => null, count: async () => 0,
        deleteMany: async () => ({ count: 0 }),
      };
    },
  });
  const hesap = new HesapServisi(kvkkPrisma, {} as any, EPOSTA_SAHTE);
  const disa: any = await hesap.verileriDisaAktar('u1');
  check('Y10 ⭐ KVKK disa aktarimi SAKLANAN tier`i veriyor (suite), turetilmis DEGIL',
    disa?.kullanici?.tier === 'suite', `tier=${JSON.stringify(disa?.kullanici?.tier)}`);
  check('Y10-FIXTURE disa aktarim gercekten kostu (kullanici blogu dolu)',
    disa?.kullanici?.email === 'a@b.test', JSON.stringify(disa?.kullanici?.email ?? null));
}

// ═══════════════════════════════════════════════════════════════════════════
//  Y11-Y12 · YONETICI PANELI
// ═══════════════════════════════════════════════════════════════════════════
async function yYonetici() {
  console.log('\n── Y11-Y12 · Yonetici paneli ─────────────────────────────');
  const iz = { userUpdate: 0, userFindUnique: 0, where: null as any };
  const prisma: any = {
    user: {
      findUnique: async () => { iz.userFindUnique++; return { id: 'u1', tier: 'core', deletedAt: null }; },
      update: async () => { iz.userUpdate++; return {}; },
      count: async ({ where }: any) => { iz.where = where; return 0; },
      findMany: async ({ where }: any) => { iz.where = where; return []; },
    },
    $transaction: async (fn: any) => fn(prisma),
    yoneticiOlayi: { create: async () => ({}) },
  };
  // FAZ 7 F1b: dorduncu bagimlilik `SatinAlmaServisi` (E-1 — yonetici
  // silmesi tek kullanicili firmada abonelik de iptal eder).
  const admin = new AdminService(prisma, {} as any, {} as any, { iptalEt: async () => undefined } as any, { gonder: async () => undefined } as any);

  const hata: any = await admin
    .updateUserTier({ id: 'y1', email: 'y@b.test' }, 'u1', 'pro')
    .then(() => null, (e: unknown) => e);
  check('Y11 ⭐ updateUserTier PAKET_ABONELIKTEN ile reddediyor',
    hata !== null && hata?.response?.kod === 'PAKET_ABONELIKTEN',
    `hata=${hata?.constructor?.name} govde=${JSON.stringify(hata?.response ?? null)}`);
  check('Y11b ⭐ hicbir prisma yazmasi olmadi (user.update ve findUnique CAGRILMADI)',
    iz.userUpdate === 0 && iz.userFindUnique === 0, JSON.stringify(iz));

  await admin.getUsers({ paket: 'pro' } as any);
  const w = iz.where;
  check('Y12 ⭐ paket suzgeci YETKILI kaynaktan (where.firma.abonelik…paket.seviye)',
    w?.firma?.abonelik?.paketSurumu?.paket?.seviye === 'pro', JSON.stringify(w));
  check('Y12b ⭐ where.tier YOK (eski suzgec geri gelmedi)',
    w !== null && w?.tier === undefined, JSON.stringify(w));
}

// ═══════════════════════════════════════════════════════════════════════════
//  Y13 · MUSTERIYE GORUNEN AD (R1/E-5)
// ═══════════════════════════════════════════════════════════════════════════
function yGorunenAd() {
  console.log('\n── Y13 · Gorunen ad (Basic/Pro/Suite) ────────────────────');
  check('Y13 seviyeGorunenAd: core→Basic, pro→Pro, suite→Suite',
    seviyeGorunenAd('core') === 'Basic' && seviyeGorunenAd('pro') === 'Pro'
      && seviyeGorunenAd('suite') === 'Suite',
    [seviyeGorunenAd('core'), seviyeGorunenAd('pro'), seviyeGorunenAd('suite')].join('|'));
  check('Y13b taninmayan kod AYNEN doner (sessizce "Basic" DEMEZ)',
    seviyeGorunenAd('platin') === 'platin' && seviyeGorunenAd(null) === '',
    `${seviyeGorunenAd('platin')}|${seviyeGorunenAd(null)}`);
  check('Y13c ⭐ backend ve on yuz AYNI adlari soyluyor (tek sozluk ikizi)',
    /core: 'Basic'/.test(oku('frontend/ozellik/odeme/paket-bicim.ts'))
      && /pro: 'Pro'/.test(oku('frontend/ozellik/odeme/paket-bicim.ts')),
    'frontend/ozellik/odeme/paket-bicim.ts SEVIYE_AD');
}

// ═══════════════════════════════════════════════════════════════════════════
//  K1-K3 · KISI EKSENI → FIRMA EKSENI
// ═══════════════════════════════════════════════════════════════════════════
async function kFirmaEkseni() {
  console.log('\n── K1-K3 · Kisi ekseni → firma ekseni ────────────────────');

  // ── K1: isçilik sahipligi ──────────────────────────────────────────────
  const k1Iz = { bulk: 0, hafiza: [] as any[] };
  const k1Prisma: any = {
    laborFirm: {
      findUnique: async ({ where }: any) => (where.id === 'firma-A'
        ? { id: 'firma-A', userId: 'u1', firmaId: 'F1', name: 'A FIRMASI', discipline: 'mechanical' }
        : null),
    },
  };
  const k1Matching: any = {
    bulkMatchLabor: async () => { k1Iz.bulk++; return { kalem: { confidence: 'exact' } }; },
    remember: async (userId: string, imza: string) => { k1Iz.hafiza.push({ userId, imza }); return { ok: true }; },
  };
  const k1 = new LaborMatchingService(k1Prisma, k1Matching);

  // ⚠ u2 AYNI firmanin IKINCI uyesi: eski kural (`firma.userId !== k.userId`)
  // burada 403 veriyordu — F1b'nin ilk davetlisini vuran kusur.
  // ⚠ HATA YUTULMAZ, KONTROLE CEVRILIR: cagri dogrudan `await` edilseydi kural
  // bozulunca paket COKER ve geriye tek bir `✗` satiri bile kalmazdi (kirmizi
  // olur ama NEDENI okunmaz — mutasyon turunda "yanlis neden" sayilir).
  const k1aHata: any = await k1
    .bulkMatch({ userId: 'u2', firmaId: 'F1' }, 'firma-A', ['kalem'])
    .then(() => null, (e: unknown) => e);
  check('K1a ⭐ ayni firmanin ikinci uyesi (u2) gecti → bulkMatchLabor cagrildi',
    k1aHata === null && k1Iz.bulk === 1,
    `bulk=${k1Iz.bulk} hata=${k1aHata?.constructor?.name}: ${k1aHata?.message ?? '-'}`);

  const k1b: any = await k1
    .bulkMatch({ userId: 'u9', firmaId: 'F2' }, 'firma-A', ['kalem'])
    .then(() => null, (e: unknown) => e);
  check('K1b ⭐ BASKA firmanin kullanicisi 403 (capraz-kiraci kapisi)',
    k1b !== null && /Forbidden/i.test(k1b?.constructor?.name ?? ''),
    `${k1b?.constructor?.name}: ${k1b?.message}`);
  check('K1b-FIXTURE ret sahiplikten geldi, bulkMatchLabor ikinci kez CAGRILMADI',
    k1Iz.bulk === 1, `bulk=${k1Iz.bulk}`);

  await k1.remember({ userId: 'u2', firmaId: 'F1' }, 'firma-A', 'kalem', 'secilen');
  check('K1c ⭐ hafiza cagiran KISI (u2) adina, `iscilik|firma-A` kapsaminda yazildi',
    k1Iz.hafiza.length === 1 && k1Iz.hafiza[0].userId === 'u2'
      && k1Iz.hafiza[0].imza === 'iscilik|firma-A',
    JSON.stringify(k1Iz.hafiza));

  const k1d: any = await Promise.resolve()
    .then(() => new LaborMatchingController(k1 as any)
      .remember({ id: 'u3', firmaId: null }, { firmaId: 'firma-A', laborName: 'k', secilenAd: 's' }))
    .then(() => null, (e: unknown) => e);
  check('K1d ⭐ BAGLANTI: controller firmasiz hesabi 403 ile durduruyor (kimlikCoz)',
    k1d !== null && /Forbidden/i.test(k1d?.constructor?.name ?? ''),
    `${k1d?.constructor?.name}: ${k1d?.message}`);

  // ── K2: alternatif havuzu ──────────────────────────────────────────────
  const k2Iz = { where: null as any };
  const k2Prisma: any = {
    laborPrice: { findMany: async (args: any) => { k2Iz.where = args?.where; return []; } },
  };
  const k2Matching = new MatchingService(k2Prisma, {} as any, {} as any);
  await (k2Matching as any).findLaborAlternativesV2(
    { userId: 'u1', firmaId: 'F1' }, 'firma-A', { adSlug: 'boru' },
  );
  check('K2a ⭐ alternatif havuzu where.firma.firmaId = kiraci firma',
    k2Iz.where?.firma?.firmaId === 'F1', JSON.stringify(k2Iz.where));
  check('K2a-userId ⭐ ne ic ice ne ust duzeyde `userId` VAR',
    k2Iz.where?.firma?.userId === undefined && k2Iz.where?.userId === undefined,
    JSON.stringify(k2Iz.where));
  check('K2b isçilik firmasi haric tutuluyor (id: { not: firma-A }) — ic ice `firma` KORUNDU',
    k2Iz.where?.firma?.id?.not === 'firma-A' && k2Iz.where?.firmaId === undefined,
    JSON.stringify(k2Iz.where));

  // ── K3: PDF analizinin kutuphane sorgusu ───────────────────────────────
  const k3Iz = { where: null as any, kutuphaneCagri: 0 };
  const k3Prisma: any = {
    material: { findMany: async () => [] },
    userLibrary: {
      findMany: async (args: any) => { k3Iz.kutuphaneCagri++; k3Iz.where = args?.where; return []; },
    },
    brand: { findMany: async () => [] },
  };
  const k3 = new AiService(k3Prisma);
  await (k3 as any).matchWithDatabase({ userId: 'u1', firmaId: 'F1' }, [
    { materialName: 'BORU', quantity: 1, unit: 'mt' },
  ]);
  check('K3a-FIXTURE kutuphane sorgusu GERCEKTEN atildi',
    k3Iz.kutuphaneCagri === 1, `cagri=${k3Iz.kutuphaneCagri}`);
  check('K3a ⭐ kutuphane where = { firmaId: "F1" }, `userId` YOK',
    k3Iz.where?.firmaId === 'F1' && k3Iz.where?.userId === undefined,
    JSON.stringify(k3Iz.where));

  const k3b: any = await Promise.resolve()
    .then(() => new AiController({} as any, {} as any, {} as any, {} as any)
      .analyze({ id: 'u3', firmaId: null }, { buffer: Buffer.from(''), mimetype: 'application/pdf' } as any))
    .then(() => null, (e: unknown) => e);
  check('K3b ⭐ BAGLANTI: /ai/analyze firmasiz hesabi 403 ile durduruyor (kimlikCoz)',
    k3b !== null && /Forbidden/i.test(k3b?.constructor?.name ?? ''),
    `${k3b?.constructor?.name}: ${k3b?.message}`);

  // ── Tek kaynak kapisi: firmasiz cagrida abonelik sorgusu atilmamali ────
  const s1Iz = { cagri: 0 };
  const s1Prisma: any = { abonelik: { findUnique: async () => { s1Iz.cagri++; return null; } } };
  const bos = await firmaPaketSeviyesi(s1Prisma, null);
  check('K-S1 firmaPaketSeviyesi(null) → null ve SORGU YOK',
    bos === null && s1Iz.cagri === 0, `sonuc=${bos} cagri=${s1Iz.cagri}`);
  const dolu = await firmaPaketSeviyesi(
    { abonelik: { findUnique: async () => ({
      durum: 'AKTIF',
      erisimSonu: new Date(Date.now() + 30 * 86_400_000),
      paketSurumu: { paket: { seviye: 'pro' } },
    }) } } as any,
    'F1',
  );
  check('K-S1b firmaPaketSeviyesi("F1") → abonelik seviyesi', dolu === 'pro', String(dolu));
}

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  await yTierGuard();
  yReflector();
  await yYoneticiKatalogu();
  yErisimEsligi();
  await yTuretilmisSeviye();
  await yYonetici();
  yGorunenAd();
  await kFirmaEkseni();

  console.log(`\n${'='.repeat(64)}`);
  console.log(`FAZ 7 YETKI (2.12 + K1-K3): ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(64));
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  · ${f}`));
  }
  // ⚠ Windows: `process.exit` acik fetch soketiyle 0xC0000409 uretiyor.
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
