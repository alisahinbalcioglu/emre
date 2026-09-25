/**
 * T2.14 — UÇ KAPISI DAVRANIŞ TESTİ  (`npm run test:uc-kapisi-davranis`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DB GEREKTİRMEZ. GERÇEK `TierGuard` ve GERÇEK `ErisimGuard` gerçek
 * `Reflector` ile kurulur; yalnız Prisma sahtelenir ve `ExecutionContext`
 * taklit edilir. `ErisimServisi` de GERÇEĞİDİR — karar mantığı taklit
 * EDİLMEZ, yalnız beslendiği satır sahtedir.
 *
 * ── NEDEN METADATA DEĞİL DAVRANIŞ ────────────────────────────────────────
 * `uc-kapisi.ts` "dekoratör var mı" sorusunu sorar. Bu dosya asıl soruyu
 * sorar: **ücretsiz/aboneliksiz istek GERÇEKTEN 403 alıyor mu, geçerli
 * abonelik GERÇEKTEN geçiyor mu?** Bu depoda metadata'sı doğru olup hiçbir
 * şeyi kapatmayan dekoratör sınıfı KAYITLI bir hatadır ("mekanizma var,
 * bağlantı yok" — tek oturumda 6 kez).
 *
 * ── LİSTE ELLE TUTULMAZ ──────────────────────────────────────────────────
 * Sınanacak uçlar `uc-envanteri.ts` ile KAYNAKTAN çıkarılır: yarın eklenen
 * her kapılı uç bu teste OTOMATİK girer. Elle liste bayatlar, envanter
 * bayatlamaz.
 *
 * ── ÖLÇÜT KONTROLÜ ───────────────────────────────────────────────────────
 * "Hepsi geçti" ile "hiçbirine bakmadım" aynı çıktıyı verir. Bu yüzden:
 *   · kapılı uç sayısı bir tabanın altına düşerse kapı ÖN KOŞUL YOK der (2),
 *   · her koşumda abonelik sorgusu sayacı ölçülür (fixture gerçekten sürüldü mü),
 *   · düzeneğin RED de YEŞİL de üretebildiği ayrıca sınanır (Ö1/Ö2).
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · 1 = FAIL · 2 = ÖN KOŞUL YOK.
 */
import 'reflect-metadata';
import * as path from 'path';
import { Reflector } from '@nestjs/core';
import { AbonelikDurumu } from '@prisma/client';
import { TierGuard } from '../src/altyapi/auth/guards/tier.guard';
import { ErisimGuard } from '../src/ozellik/odeme/abonelik/erisim.guard';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { Uc, dekoratorVar, ucEnvanteri, ucretliKapiVar } from './yardimci/uc-envanteri';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

const BACKEND_KOKU = path.resolve(__dirname, '..');

/** Bugün kapılı uç sayısı 76. Taban bilinçli olarak biraz altında: kapı
 *  eklenmesi serbest, TOPLU KAYBOLMASI şüphelidir. */
const KAPILI_TABANI = 70;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
  } else {
    failed++;
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

// ── SAHTE PRİSMA ──────────────────────────────────────────────────────────
interface Iz {
  abonelikSorgusu: number;
  kullaniciSorgusu: number;
}

type AbonelikSatiri = null | {
  durum: AbonelikDurumu;
  erisimSonu: Date;
  kisitlandi?: boolean;
  paketSurumu: { paket: { kod: string; seviye: string; kullaniciHakki: number; dwgAktif: boolean } };
};

function sahtePrisma(satir: AbonelikSatiri, iz: Iz): any {
  return {
    user: {
      findUnique: async () => {
        iz.kullaniciSorgusu++;
        // ⚠ `tier: 'suite'` KASITLI OLARAK DOLU ve YANLIŞ YÖNDE: TierGuard
        // yeniden `User.tier` okumaya başlarsa "aboneliksiz" vakaları sessizce
        // yeşile dönerdi (2.12'de kapatılan kusur). Dolu ve yanlış bu alan,
        // kapının gerçekten aboneliğe baktığının kanıtıdır.
        return { firmaId: 'F-TEST', tier: 'suite' };
      },
    },
    abonelik: {
      findUnique: async () => {
        iz.abonelikSorgusu++;
        return satir;
      },
    },
  };
}

const gun = 86_400_000;

/** A — ÜCRETSİZ / ABONELİKSİZ: hiç abonelik satırı yok. */
const ABONELIKSIZ: AbonelikSatiri = null;

/** B — GEÇERLİ PRO ABONELİK. */
const PRO_AKTIF: AbonelikSatiri = {
  durum: AbonelikDurumu.AKTIF,
  erisimSonu: new Date(Date.now() + 30 * gun),
  paketSurumu: { paket: { kod: 'pro-mep', seviye: 'pro', kullaniciHakki: 5, dwgAktif: true } },
};

/** C — GEÇERLİ ama YETERSİZ paket (Basic). `@RequireTier('pro')` uçlarını sınar. */
const CORE_AKTIF: AbonelikSatiri = {
  durum: AbonelikDurumu.AKTIF,
  erisimSonu: new Date(Date.now() + 30 * gun),
  paketSurumu: { paket: { kod: 'basic-mek', seviye: 'core', kullaniciHakki: 1, dwgAktif: false } },
};

// ⚠ 23.09.2026 (Ekip & Izinler): `ErisimGuard` artik DORDUNCU ekseni de
// (uye izni) uygular ve rolu bilinmeyen kimligi FAIL-CLOSED reddeder.
// Bu paket ABONELIK davranisini olcer; kimlik bu yuzden FIRMA SAHIBIDIR
// (her zaman tam yetkili) — izin ekseni `ekip-izinleri-test.ts`te ayrica
// olculur. `firmaRol` eklenmeseydi 49 "gecer" beklentisi izin kapisina
// takiliyordu (olculdu), yani bu paket abonelik yerine izni olcerdi.
const sahteCtx = (handler: any, cls: any): any => ({
  getHandler: () => handler,
  getClass: () => cls,
  switchToHttp: () => ({
    getRequest: () => ({ user: { id: 'u-test', sub: 'u-test', firmaId: 'F-TEST', firmaRol: 'sahip' } }),
  }),
});

interface Sonuc {
  gecti: boolean;
  not: string;
  iz: Iz;
}

async function guardKosumu(
  hangi: 'tier' | 'erisim',
  handler: any,
  cls: any,
  satir: AbonelikSatiri,
): Promise<Sonuc> {
  const iz: Iz = { abonelikSorgusu: 0, kullaniciSorgusu: 0 };
  const prisma = sahtePrisma(satir, iz);
  const guard =
    hangi === 'tier'
      ? new TierGuard(new Reflector(), prisma)
      : new ErisimGuard(new Reflector(), new ErisimServisi(prisma));
  try {
    const r = await guard.canActivate(sahteCtx(handler, cls));
    return { gecti: r === true, not: `canActivate=${JSON.stringify(r)}`, iz };
  } catch (e: any) {
    const g = e?.getResponse?.();
    return {
      gecti: false,
      not: `${e?.constructor?.name}: ${typeof g === 'object' ? JSON.stringify(g) : e?.message}`,
      iz,
    };
  }
}

// ── CONTROLLER SINIFINI KAYNAK YOLUNDAN ÇÖZ ───────────────────────────────
const modulOnbellegi = new Map<string, any>();
function sinifCoz(uc: Uc): any | null {
  const yol = path.join(BACKEND_KOKU, uc.dosya);
  if (!modulOnbellegi.has(yol)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    modulOnbellegi.set(yol, require(yol));
  }
  return modulOnbellegi.get(yol)?.[uc.sinif] ?? null;
}

// ══════════════════════════════════════════════════════════════════════════
async function main(): Promise<void> {
  const uclar = ucEnvanteri(BACKEND_KOKU);
  const kapili = uclar.filter(ucretliKapiVar);

  // ── ÖN KOŞUL (boş küme yalancı yeşil üretmesin) ───────────────────────
  if (uclar.length === 0 || kapili.length < KAPILI_TABANI) {
    console.log('── T2.14 UÇ KAPISI DAVRANIŞ ──');
    console.log(
      `  ⚠ ÖN KOŞUL YOK: toplam uç=${uclar.length}, kapılı=${kapili.length} ` +
        `(taban ${KAPILI_TABANI}). Kapı YEŞİL DEMEZ.`,
    );
    process.exit(2);
  }

  console.log('── T2.14 UÇ KAPISI DAVRANIŞ ──');
  console.log(`  sınanacak kapılı uç: ${kapili.length}`);

  // ── Ö1/Ö2 ÖLÇÜT KONTROLÜ: düzenek hem RED hem YEŞİL üretebiliyor mu? ──
  // Bilinen bir uçla (PUT /quotes/:id → TEKLIF_DUZENLE) sınanır. İkisi de
  // beklendiği gibi değilse aşağıdaki 150+ assert'in "geçti" sonucu
  // ANLAMSIZDIR — ölçütün kendisi bozuk demektir.
  const olcutUcu = kapili.find((u) => u.anahtar === 'PUT /quotes/:id');
  if (!olcutUcu) {
    console.log('  ⚠ ÖN KOŞUL YOK: ölçüt kontrol ucu (PUT /quotes/:id) envanterde YOK.');
    process.exit(2);
  }
  const olcutSinif = sinifCoz(olcutUcu);
  const olcutHandler = olcutSinif?.prototype?.[olcutUcu.metot];
  const o1 = await guardKosumu('erisim', olcutHandler, olcutSinif, ABONELIKSIZ);
  const o2 = await guardKosumu('erisim', olcutHandler, olcutSinif, PRO_AKTIF);
  check('Ö1 ÖLÇÜT: düzenek RED üretebiliyor (aboneliksiz → 403)', o1.gecti === false, o1.not);
  check('Ö2 ÖLÇÜT: düzenek YEŞİL üretebiliyor (pro aktif → geçer)', o2.gecti === true, o2.not);
  check(
    'Ö3 ÖLÇÜT: abonelik satırı GERÇEKTEN okundu (fixture sürüldü)',
    o1.iz.abonelikSorgusu > 0 && o2.iz.abonelikSorgusu > 0,
    `A=${o1.iz.abonelikSorgusu} B=${o2.iz.abonelikSorgusu}`,
  );
  if (failed > 0) {
    console.log('\n  ⚠ ÖLÇÜT KONTROLÜ DÜŞTÜ — gerisi ölçülmez.');
    for (const f of failures) console.log(`    ${f}`);
    process.exit(1);
  }

  // ── B1/B2: her kapılı uç · aboneliksiz → 403 · pro aktif → geçer ──────
  let a403 = 0;
  let b200 = 0;
  let proKapisi = 0;
  for (const uc of kapili) {
    const sinif = sinifCoz(uc);
    const handler = sinif?.prototype?.[uc.metot];
    if (typeof handler !== 'function') {
      check(`B-ÖLÇÜT ${uc.anahtar}: sınıf/metot çözülebiliyor`, false, `${uc.sinif}.${uc.metot} bulunamadı`);
      continue;
    }

    const tierli = dekoratorVar(uc, 'RequireTier');
    const yetenekli = dekoratorVar(uc, 'GerekliYetenek');

    // A — ÜCRETSİZ (aboneliksiz) firma: EN AZ BİR kapı reddetmeli.
    const aTier = tierli ? await guardKosumu('tier', handler, sinif, ABONELIKSIZ) : null;
    const aYet = yetenekli ? await guardKosumu('erisim', handler, sinif, ABONELIKSIZ) : null;
    const aRed = (aTier && !aTier.gecti) || (aYet && !aYet.gecti);
    check(
      `B1 ${uc.anahtar} · aboneliksiz → 403`,
      Boolean(aRed),
      `tier=${aTier?.not ?? '—'} erisim=${aYet?.not ?? '—'}`,
    );
    if (aRed) a403++;

    // B — GEÇERLİ PRO abonelik: kapıların HEPSİ geçmeli.
    const bTier = tierli ? await guardKosumu('tier', handler, sinif, PRO_AKTIF) : null;
    const bYet = yetenekli ? await guardKosumu('erisim', handler, sinif, PRO_AKTIF) : null;
    const bGecer = (!bTier || bTier.gecti) && (!bYet || bYet.gecti);
    check(
      `B2 ${uc.anahtar} · geçerli Pro abonelik → geçer`,
      bGecer,
      `tier=${bTier?.not ?? '—'} erisim=${bYet?.not ?? '—'}`,
    );
    if (bGecer) b200++;

    // C — YETERSİZ PAKET: yalnız `@RequireTier` taşıyan uçlarda anlamlı.
    if (tierli) {
      const cTier = await guardKosumu('tier', handler, sinif, CORE_AKTIF);
      check(
        `B3 ${uc.anahtar} · Basic (core) aktif abonelik → 403 (paket ekseni)`,
        cTier.gecti === false,
        cTier.not,
      );
      if (!cTier.gecti) proKapisi++;
    }
  }

  console.log(`  B1 aboneliksiz 403 : ${a403}/${kapili.length}`);
  console.log(`  B2 pro aktif geçti : ${b200}/${kapili.length}`);
  console.log(`  B3 Basic reddedildi: ${proKapisi} (paket kapılı uç sayısı kadar)`);

  // ── B3-ÖLÇÜT: paket ekseni GERÇEKTEN sınandı mı? ──────────────────────
  // Liste kaynaktan türediği için bir uçtan `@RequireTier` kaldırılırsa
  // ilgili assert SESSİZCE yok olur ve "FAIL 0" yanıltıcı kalır (ölçüldü,
  // mutant M5). Taban, paket ekseninin toplu kaybolmasını yakalar; hangi
  // ucun kaybettiğini `uc-kapisi.ts` Kural 8 (aile kapısı) söyler.
  const PAKET_KAPISI_TABANI = 20; // bugün 23
  check(
    `B3-ÖLÇÜT: paket ekseni en az ${PAKET_KAPISI_TABANI} uçta sınandı`,
    proKapisi >= PAKET_KAPISI_TABANI,
    `sınanan=${proKapisi}`,
  );

  // ── B4: KVKK · ÖDEME · KİMLİK KİLİDİ (en kritik regresyon riski) ──────
  // Bu uçlar ödemesiz ÇALIŞMAYA DEVAM ETMELİ. Kilidi iki yönlü kuruyoruz:
  //  (a) ücretli kapı METADATA'sı taşımasınlar,
  //  (b) aboneliksiz fixture ile İKİ GUARD DA GEÇSİN (davranış).
  // (b) olmadan (a) tek başına zayıftır: dekoratör sınıf düzeyine konursa
  // metot metadata'sı yine boş görünür ama uç kapanmış olur.
  const ODEMESIZ_KALMALI: Array<[string, string]> = [
    ['GET /auth/hesabim/verilerim', 'KVKK: veri indirme ödeme durumuna bağlanamaz (hesap.servisi.ts)'],
    ['GET /auth/hesabimi-kapat/onizleme', 'KVKK: hesap kapatmanın ön adımı'],
    ['POST /auth/hesabimi-kapat', 'KVKK: hesap kapatma hakkı'],
    ['POST /auth/login', 'KİMLİK: giriş yapamayan müşteri hiç ödeyemez'],
    ['POST /auth/register', 'KİMLİK: kayıt'],
    ['POST /auth/forgot-password', 'KİMLİK: parola sıfırlama'],
    ['POST /auth/reset-password', 'KİMLİK: parola sıfırlama'],
    ['POST /auth/verify-email', 'KİMLİK: e-posta doğrulama'],
    ['POST /auth/mfa/dogrula', 'KİMLİK: iki adımlı girişin ikinci adımı'],
    ['GET /auth/sso/donus', 'KİMLİK: kurumsal giriş dönüşü'],
    ['GET /abonelik/paketler', 'ÖDEME: paket görülmeden paket seçilemez'],
    ['GET /abonelik/durum', 'ÖDEME: kendi abonelik durumu'],
    ['POST /abonelik/basla', 'ÖDEME: satın almanın kendisi — kapanırsa askıdaki firma askıdan ÇIKAMAZ'],
    ['POST /abonelik/donus', 'ÖDEME: iyzico 3-D dönüşü'],
    ['POST /abonelik/kart-guncelle', 'ÖDEME: kartı geçersizleşen firma ödeyemez hâle gelir'],
    ['POST /abonelik/iptal', 'ÖDEME: iptal hakkı'],
    ['POST /abonelik/iyzico-donus', 'ÖDEME: iyzico dönüş ucu'],
    ['POST /abonelik/iyzico-kart-donus', 'ÖDEME: iyzico kart güncelleme dönüş ucu'],
    ['POST /webhook/iyzico/abonelik', 'ÖDEME: sağlayıcı webhook\'u'],
    ['GET /fiyatlar', 'ÖDEME: girişsiz fiyat sayfası'],
  ];

  let odemesiz = 0;
  for (const [anahtar, gerekce] of ODEMESIZ_KALMALI) {
    const uc = uclar.find((u) => u.anahtar === anahtar);
    if (!uc) {
      check(`B4-ÖLÇÜT ${anahtar}: uç envanterde VAR`, false, 'bulunamadı — yol değişmiş olabilir');
      continue;
    }
    check(`B4a ${anahtar} · ücretli kapı METADATA'sı YOK (${gerekce})`, !ucretliKapiVar(uc),
      `metot=${JSON.stringify(uc.metotDekoratorleri)} sinif=${JSON.stringify(uc.sinifDekoratorleri)}`);

    const sinif = sinifCoz(uc);
    const handler = sinif?.prototype?.[uc.metot];
    if (typeof handler !== 'function') {
      check(`B4-ÖLÇÜT ${anahtar}: sınıf/metot çözülebiliyor`, false, `${uc.sinif}.${uc.metot}`);
      continue;
    }
    const t = await guardKosumu('tier', handler, sinif, ABONELIKSIZ);
    const e = await guardKosumu('erisim', handler, sinif, ABONELIKSIZ);
    const acik = t.gecti && e.gecti;
    check(
      `B4b ${anahtar} · ABONELİKSİZ firma GEÇİYOR (ödemesiz çalışır)`,
      acik,
      `tier=${t.not} erisim=${e.not}`,
    );
    if (acik) odemesiz++;
  }
  console.log(`  B4 ödemesiz açık   : ${odemesiz}/${ODEMESIZ_KALMALI.length}`);

  // ── RAPOR ─────────────────────────────────────────────────────────────
  console.log(`\n  PASS ${passed} · FAIL ${failed}`);
  if (failed) {
    console.log('\n  ── DÜŞENLER ──');
    for (const f of failures) console.log(`    ✗ ${f}`);
    console.log(`\nT2.14 DAVRANIŞ FAIL — ${failed} assert düştü.`);
    process.exitCode = 1;
    return;
  }
  console.log('\nT2.14 DAVRANIŞ PASS.');
}

bitmezseKirmizi(main().catch((e) => {
  console.error('T2.14 DAVRANIŞ — beklenmeyen hata:', e);
  process.exitCode = 1;
}));
