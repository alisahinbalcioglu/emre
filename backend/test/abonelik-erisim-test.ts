/**
 * 2.13 — ABONELIK SAGLIGI TEK KAYNAKTAN (`npm run test:abonelik-erisim`)
 *
 * DB, SUNUCU ve AG GEREKTIRMEZ: sahte Prisma + gercek sinif ornekleri.
 * Sema ve migration YOK; canli veri degismez.
 *
 * ── KAPATILAN KUSUR ─────────────────────────────────────────────────────
 * `TierGuard`in okudugu seviye (`seviye.ts`) ve `/auth/me` yetenekleri
 * (`capabilities.helper.ts`) aboneligin `durum`/`erisimSonu` alanlarini HIC
 * CEKMIYORDU. Iptal edilmis ya da suresi dolmus abonelik paket seviyesini
 * vermeye devam ediyordu.
 *
 * ⚠ OLCULDU (22.09): uc duzeyinde SOMUT acik YOKTU — `@RequireTier` tasiyan
 * 3 ucun 3'u de `@GerekliYetenek` tasiyor ve `ErisimGuard` 403 veriyor. Bu
 * paket bu yuzden KAPININ KENDISINI olcer, `ErisimGuard`in arkasina
 * saklanmaz: `TierGuard` TEK BASINA (ErisimGuard OLMADAN) kosturulur. Aksi
 * halde yesil, `ErisimGuard`in hakkini `TierGuard`a yazan bir yalan olurdu
 * (`feedback_yesil_test_kanit_degil_mutasyonla_olc`).
 *
 * ── ODENMIS DONEM KESILMEZ ──────────────────────────────────────────────
 * Olcut ham `durum` DEGIL erisim kararidir: `IPTAL` eden musteri odedigi
 * donemin sonuna kadar GECER (I2). `durum='AKTIF'` diye daraltan bir mutant
 * I2'yi kirmiziya dondurur.
 *
 * ── IKIZ KURAL KAPISI ───────────────────────────────────────────────────
 * T bolumu 7 durum × 2 tarih = 14 bilesimde `abonelikErisimi` ile
 * `ErisimServisi.karar`i KARSILASTIRIR. Iki taraftan biri digerinden
 * ayrisirsa kirmizi — "aboneligi yuruyor mu" sorusunun ikinci bir cevabi
 * olamaz.
 *
 * Mutant tablosu T2.13 raporunda. KIRMIZIYA DONERSE REGRESYON.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Reflector } from '@nestjs/core';
import {
  ABONELIK_DURUMLARI,
  abonelikErisimi,
} from '../src/altyapi/auth/abonelik-erisim';
import { firmaPaketDurumu, firmaPaketSeviyesi } from '../src/altyapi/auth/seviye';
import { getFirmaCapabilities } from '../src/altyapi/auth/capabilities.helper';
import { TierGuard } from '../src/altyapi/auth/guards/tier.guard';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { LaborController } from '../src/ozellik/kutuphane/labor/labor.controller';

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

const GUN = 86_400_000;
const SIMDI = new Date('2026-09-22T12:00:00.000Z');
const GELECEK = new Date(SIMDI.getTime() + 10 * GUN);
const GECMIS = new Date(SIMDI.getTime() - 10 * GUN);

const KOK = path.join(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════════
//  SAHTE PRISMA — abonelik ekseni
// ═══════════════════════════════════════════════════════════════════════════
type Iz = { cagri: number; select: any[] };

/**
 * ⚠ `user.tier` KASITLI olarak 'suite' (abonelikten YUKSEK): kapi yeniden
 * `User.tier` okumaya baslarsa bu fixture onu YAKALAR (2.12 nobeti).
 */
function abonelikPrisma(
  o: {
    durum?: string;
    erisimSonu?: Date | null;
    seviye?: string;
    kapsam?: string;
    dwgAktif?: boolean;
    yok?: boolean;
    iz?: Iz;
  } = {},
): any {
  return {
    user: { findUnique: async () => ({ firmaId: 'F1', tier: 'suite' }) },
    abonelik: {
      findUnique: async (args: any) => {
        if (o.iz) {
          o.iz.cagri++;
          o.iz.select.push(args?.select ?? args?.include ?? null);
        }
        if (o.yok) return null;
        return {
          durum: o.durum ?? 'AKTIF',
          erisimSonu: o.erisimSonu === undefined ? GELECEK : o.erisimSonu,
          paketSurumu: {
            paket: {
              seviye: o.seviye ?? 'pro',
              kod: 'pro-mep',
              kapsam: o.kapsam ?? 'mep',
              dwgAktif: o.dwgAktif ?? true,
              kullaniciHakki: 5,
            },
          },
        };
      },
    },
  };
}

const sahteCtx = (handler: any, cls: any): any => ({
  getHandler: () => handler,
  getClass: () => cls,
  switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', sub: 'u1' } }) }),
});

/**
 * `TierGuard`i TEK BASINA kosar — `ErisimGuard` DEVREDE DEGIL.
 * `LaborController.findAll` gercek `@RequireTier('pro')` metadata'sini tasir.
 */
async function tierKapisi(
  o: Parameters<typeof abonelikPrisma>[0] = {},
): Promise<{ gecti: boolean; mesaj: string; iz: Iz }> {
  const iz: Iz = { cagri: 0, select: [] };
  const guard = new TierGuard(new Reflector(), abonelikPrisma({ ...o, iz }));
  try {
    const r = await guard.canActivate(
      sahteCtx((LaborController.prototype as any).findAll, LaborController),
    );
    return { gecti: r === true, mesaj: `canActivate=${JSON.stringify(r)}`, iz };
  } catch (e: any) {
    return { gecti: false, mesaj: String(e?.message ?? e), iz };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  S · SAF CEKIRDEK ve SEMA ESLIGI
// ═══════════════════════════════════════════════════════════════════════════
function sCekirdek() {
  console.log('\n── S · Saf cekirdek + sema esligi ────────────────────────');

  const sema = fs.readFileSync(path.join(KOK, 'prisma', 'schema.prisma'), 'utf8');
  const blok = sema.split('enum AbonelikDurumu')[1]?.split('}')[0] ?? '';
  const semaDurumlari = [...blok.matchAll(/^\s*([A-Z_]+)\s*(?:\/\/.*)?$/gm)].map((m) => m[1]);
  check('S1-FIXTURE sema blogu okundu (bos kume yalanci yesil kapisi)',
    semaDurumlari.length > 0, `bulunan=${semaDurumlari.length}`);
  check('S1 ⭐ ABONELIK_DURUMLARI semadaki enum ile BIREBIR ayni',
    JSON.stringify(semaDurumlari) === JSON.stringify([...ABONELIK_DURUMLARI]),
    `sema=${JSON.stringify(semaDurumlari)} kod=${JSON.stringify([...ABONELIK_DURUMLARI])}`);

  // ⚠ `abonelik-erisim.ts` HICBIR SEY IMPORT ETMEMELI (dongu korumasi).
  const kaynak = fs.readFileSync(
    path.join(KOK, 'src', 'altyapi', 'auth', 'abonelik-erisim.ts'), 'utf8',
  );
  const importSatirlari = kaynak
    .split('\n')
    .filter((l) => /^\s*import\s/.test(l) || /^\s*export\s+\{[^}]*\}\s+from/.test(l));
  check('S2 ⭐ saf cekirdek HICBIR SEY import etmiyor (auth ↔ odeme dongusu yok)',
    importSatirlari.length === 0, importSatirlari.join(' | '));

  check('S3 abonelik yoksa kapali (fail-closed)',
    abonelikErisimi(null, SIMDI).erisimVar === false);
  check('S4 ⭐ taninmayan durum kapiyi ACMAZ (default fail-closed)',
    abonelikErisimi({ durum: 'YENI_BIR_DURUM', erisimSonu: GELECEK }, SIMDI).erisimVar === false);
  check('S5 ⭐ erisimSonu BOS ise "suresi dolmus" sayilir (NaN <= x tuzagi)',
    abonelikErisimi({ durum: 'AKTIF', erisimSonu: null }, SIMDI).erisimVar === false);
  check('S5b OLCUT: ayni durum GECERLI tarihle GECIYOR (kor degil)',
    abonelikErisimi({ durum: 'AKTIF', erisimSonu: GELECEK }, SIMDI).erisimVar === true);
  check('S6 tam erisimSonu ANINDA erisim KAPALI (<= , < degil)',
    abonelikErisimi({ durum: 'AKTIF', erisimSonu: SIMDI }, SIMDI).erisimVar === false);
}

// ═══════════════════════════════════════════════════════════════════════════
//  T · IKIZ KURAL KAPISI — cekirdek ≡ ErisimServisi
// ═══════════════════════════════════════════════════════════════════════════
async function tIkizKural() {
  console.log('\n── T · Cekirdek ile ErisimServisi AYNI cevabi veriyor ─────');

  let karsilastirma = 0;
  let ayrisan: string[] = [];

  for (const durum of ABONELIK_DURUMLARI) {
    for (const [etiket, tarih] of [['gelecek', GELECEK], ['gecmis', GECMIS]] as const) {
      const servis = new ErisimServisi(
        abonelikPrisma({ durum, erisimSonu: tarih }) as any,
      );
      const k = await servis.karar('F1', SIMDI);
      const c = abonelikErisimi({ durum, erisimSonu: tarih }, SIMDI);
      karsilastirma++;
      if (k.erisimVar !== c.erisimVar || k.saltOkunur !== c.saltOkunur) {
        ayrisan.push(
          `${durum}/${etiket}: servis={${k.erisimVar},${k.saltOkunur}} cekirdek={${c.erisimVar},${c.saltOkunur}}`,
        );
      }
    }
  }

  check('T-FIXTURE 14 bilesim GERCEKTEN karsilastirildi (bos dongu kapisi)',
    karsilastirma === 14, `karsilastirma=${karsilastirma}`);
  check('T ⭐ 7 durum × 2 tarih: cekirdek ile servis kararı AYNI (ikiz kural yok)',
    ayrisan.length === 0, ayrisan.join(' · '));
}

// ═══════════════════════════════════════════════════════════════════════════
//  I · UC KAPISI — TierGuard TEK BASINA
// ═══════════════════════════════════════════════════════════════════════════
async function iUcKapisi() {
  console.log('\n── I · TierGuard tek basina (ErisimGuard DEVREDE DEGIL) ───');

  const i0 = await tierKapisi({ durum: 'AKTIF', erisimSonu: GELECEK });
  check('I0-OLCUT yururlukteki AKTIF pro abonelik GECIYOR (kapi kor degil)',
    i0.gecti === true, i0.mesaj);
  check('I0-FIXTURE ⭐ sorgu `durum` ve `erisimSonu` ALANLARINI CEKIYOR',
    i0.iz.cagri === 1 && i0.iz.select[0]?.durum === true && i0.iz.select[0]?.erisimSonu === true,
    JSON.stringify(i0.iz.select[0]));

  const i1 = await tierKapisi({ durum: 'SONA_ERDI', erisimSonu: GECMIS });
  check('I1 ⭐ suresi dolmus abonelikle korunan uc 403',
    i1.gecti === false, i1.mesaj);

  const i2 = await tierKapisi({ durum: 'IPTAL', erisimSonu: GELECEK });
  check('I2 ⭐⭐ IPTAL ama ODENMIS DONEM SURUYOR → GECER (200)',
    i2.gecti === true, i2.mesaj);

  const i3 = await tierKapisi({ durum: 'IPTAL', erisimSonu: GECMIS });
  check('I3 ⭐ IPTAL ve odenmis donem BITTI → 403',
    i3.gecti === false, i3.mesaj);

  const i4 = await tierKapisi({ durum: 'ASKIDA', erisimSonu: GELECEK });
  check('I4 ASKIDA → 403 (tarih ileride olsa bile)', i4.gecti === false, i4.mesaj);

  const i5 = await tierKapisi({ durum: 'DENEME', erisimSonu: GECMIS });
  check('I5 suresi dolmus DENEME → 403', i5.gecti === false, i5.mesaj);

  const i6 = await tierKapisi({ durum: 'DENEME', erisimSonu: GELECEK });
  check('I6 suren DENEME → GECER', i6.gecti === true, i6.mesaj);

  // ⚠ Tolerans ve salt-okunur kiplerde SEVIYE KORUNUR: o iki kipte musteri
  // urunu gormeye devam etmeli, kisitlamayi ErisimGuard yapar.
  const i7 = await tierKapisi({ durum: 'ODEME_BEKLIYOR', erisimSonu: GECMIS });
  check('I7 ⭐ ODEME_BEKLIYOR (tolerans) → GECER, tarih gecmis olsa bile',
    i7.gecti === true, i7.mesaj);

  const i8 = await tierKapisi({ durum: 'KISITLI', erisimSonu: GECMIS });
  check('I8 ⭐ KISITLI (salt-okunur) seviyesini KORUR → TierGuard GECIRIR',
    i8.gecti === true, i8.mesaj);

  // Mesaj: paketi VAR ama erisimi YOKSA "paketiniz yok" DENMEZ.
  check('I9 ⭐ sona ermis Pro abonelikte mesaj SAGLIK mesaji ("etkin değil")',
    /etkin değil/.test(i1.mesaj) && !/Mevcut paketiniz yok/.test(i1.mesaj), i1.mesaj);

  const i10 = await tierKapisi({ yok: true });
  check('I10 aboneligi HIC olmayan firmada mesaj "Mevcut paketiniz yok"',
    i10.gecti === false && /Mevcut paketiniz yok/.test(i10.mesaj), i10.mesaj);

  // Seviye ekseni hala calisiyor mu (2.12 nobeti): saglikli ama CORE abonelik.
  const i11 = await tierKapisi({ durum: 'AKTIF', erisimSonu: GELECEK, seviye: 'core' });
  check('I11 saglikli ama Basic abonelik → 403 (seviye ekseni bozulmadi)',
    i11.gecti === false && /Pro paketi gerektirir/.test(i11.mesaj), i11.mesaj);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Y · YETENEKLER (/auth/me) ve SEVIYE TURETMESI
// ═══════════════════════════════════════════════════════════════════════════
async function yYetenek() {
  console.log('\n── Y · capabilities + firmaPaketDurumu ────────────────────');

  const cap = (o: Parameters<typeof abonelikPrisma>[0]) =>
    getFirmaCapabilities(abonelikPrisma(o) as any, 'F1', SIMDI);

  const y0 = await cap({ durum: 'AKTIF', erisimSonu: GELECEK });
  check('Y0-OLCUT saglikli pro/mep → iscilik ve dwg ACIK (kapi kor degil)',
    y0.mechanical.labor === true && y0.electrical.dwg === true, JSON.stringify(y0));

  const y1 = await cap({ durum: 'SONA_ERDI', erisimSonu: GECMIS });
  check('Y1 ⭐ sona ermis abonelikte TUM yetenekler kapali',
    y1.mechanical.material === false && y1.mechanical.labor === false
      && y1.electrical.material === false && y1.electrical.dwg === false,
    JSON.stringify(y1));

  const y2 = await cap({ durum: 'IPTAL', erisimSonu: GELECEK });
  check('Y2 ⭐⭐ IPTAL + odenmis donem suruyor → yetenekler KORUNUR',
    y2.mechanical.labor === true && y2.electrical.material === true, JSON.stringify(y2));

  const y3 = await cap({ durum: 'IPTAL', erisimSonu: GECMIS });
  check('Y3 IPTAL + donem bitti → yetenekler kapali',
    y3.mechanical.material === false, JSON.stringify(y3));

  const y4 = await cap({ durum: 'KISITLI', erisimSonu: GECMIS });
  check('Y4 ⭐ KISITLI (salt-okunur) yeteneklerini KORUR — yazmayi ErisimGuard kapatir',
    y4.mechanical.labor === true, JSON.stringify(y4));

  const y5 = await cap({ durum: 'ODEME_BEKLIYOR', erisimSonu: GECMIS });
  check('Y5 ⭐ ODEME_BEKLIYOR (tolerans) yeteneklerini KORUR',
    y5.mechanical.material === true, JSON.stringify(y5));

  const y6 = await cap({ durum: 'ASKIDA', erisimSonu: GELECEK });
  check('Y6 ASKIDA → yetenekler kapali', y6.mechanical.material === false, JSON.stringify(y6));

  // firmaPaketDurumu: etkin ≠ ham ayrimi
  const d1 = await firmaPaketDurumu(
    abonelikPrisma({ durum: 'SONA_ERDI', erisimSonu: GECMIS }), 'F1', SIMDI,
  );
  check('Y7 ⭐ firmaPaketDurumu: etkinSeviye null AMA paketSeviyesi "pro" (mesaj icin)',
    d1.etkinSeviye === null && d1.paketSeviyesi === 'pro' && d1.erisimVar === false,
    JSON.stringify(d1));

  const d2 = await firmaPaketDurumu(
    abonelikPrisma({ durum: 'IPTAL', erisimSonu: GELECEK }), 'F1', SIMDI,
  );
  check('Y8 odenmis donemde etkinSeviye = paketSeviyesi',
    d2.etkinSeviye === 'pro' && d2.erisimVar === true, JSON.stringify(d2));

  const izS: Iz = { cagri: 0, select: [] };
  const bos = await firmaPaketSeviyesi(abonelikPrisma({ iz: izS }), null, SIMDI);
  check('Y9 firmasiz hesap: null ve SORGU YOK (capraz-kiraci kapisi)',
    bos === null && izS.cagri === 0, `sonuc=${bos} cagri=${izS.cagri}`);

  const y10 = await firmaPaketSeviyesi(
    abonelikPrisma({ durum: 'ASKIDA', erisimSonu: GELECEK }), 'F1', SIMDI,
  );
  check('Y10 ⭐ firmaPaketSeviyesi VARSAYILAN olarak ETKIN degeri doner (fail-closed)',
    y10 === null, String(y10));
}

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  sCekirdek();
  await tIkizKural();
  await iUcKapisi();
  await yYetenek();

  console.log(`\n${'='.repeat(64)}`);
  console.log(`2.13 ABONELIK SAGLIGI: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(64));
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  · ${f}`));
  }
  // ⚠ Windows: `process.exit` acik soketle 0xC0000409 uretiyor.
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
