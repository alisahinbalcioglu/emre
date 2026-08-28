/**
 * MIGRATION ZINCIRI TURU  (`npm run test:migration`)
 *
 * SUNUCU GEREKTIRMEZ: PGlite (WASM PostgreSQL 16) sureç içinde ayaga kalkar.
 * Bu yuzden `db: true` DEGILDIR — her kosumda calisir, PG_REGRESSION istemez.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Uretimde sema `prisma migrate deploy` ile uygulanir (backend/Dockerfile:55
 * ve render.yaml:64 — `npx prisma migrate deploy && node dist/main`). Yani
 * BOZUK BIR MIGRATION KONTEYNERI ACILMAZ HALE GETIRIR: API baslamaz,
 * deploy.sh saglik dogrulamasindan `build_sha` alamaz ve deploy geri doner.
 *
 * Bu depoda migration zincirinin gercekle ayrisma GECMISI VAR: `f2a0b7a`
 * commit'i "migration zinciri gercek semayla hizalandi (8 tablo db push'la
 * acilmisti)" diyor. Yani sekiz tablo hicbir migration'da yoktu ve TEMIZ bir
 * veritabaninda `migrate deploy` PATLIYORDU. Kusur aylarca gorunmedi cunku
 * gelistirme veritabanlari `db push` ile guncelleniyordu ve kimse zinciri
 * SIFIRDAN kosmuyordu.
 *
 * Bu paket tam olarak onu yapar: BOS bir veritabaninda migration'larin
 * TAMAMINI sirayla kosar. ADIM 2 migration'i 394 satirdir ve 5 adimlik bir
 * BACKFILL icerir (miras paketleri, her firmaya abonelik, fatura kimligi);
 * bu SQL uretimde ilk kez kosacaktir — burada kosmazsa orada kosar.
 *
 * ── AYRICA OLCULEN: BACKFILL'IN SOZU ────────────────────────────────────
 * Backfill'in tek kurali "hicbir mevcut kullanicinin erisimi kesilmez".
 * B* bloklari bunu VERIYLE sinar: goc oncesi kullanicilar kurulur, zincir
 * kosulur, sonra her firmanin abonelik satiri ve seviyesi dogrulanir.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

const MIGRATIONS = path.join(__dirname, '../prisma/migrations');

async function main() {
  const db = new PGlite();

  // ── Zinciri sirayla kos ────────────────────────────────────────────────
  const klasorler = fs
    .readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(); // Prisma klasor adlari zaman damgasiyla baslar → leksik sira = zaman sirasi

  check(
    'Z-OLCUT migration klasoru bulundu ve bos degil',
    klasorler.length > 0,
    `adet=${klasorler.length}`,
  );
  check(
    'Z-OLCUT ADIM 2 migration"i zincirde',
    klasorler.some((k) => k.includes('adim2_abonelik_odeme')),
    `klasorler=${JSON.stringify(klasorler.slice(-3))}`,
  );

  let kosan = 0;
  for (const k of klasorler) {
    const dosya = path.join(MIGRATIONS, k, 'migration.sql');
    if (!fs.existsSync(dosya)) continue;
    const sql = fs.readFileSync(dosya, 'utf8');
    try {
      await db.exec(sql);
      kosan++;
    } catch (e) {
      check(
        `Z1 migration kosuyor: ${k}`,
        false,
        (e instanceof Error ? e.message : String(e)).slice(0, 400),
      );
      // Zincir kirildiktan sonrasini kosmanin anlami yok.
      console.log(
        `\n${'='.repeat(64)}\nMIGRATION ZINCIRI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
      );
      failures.forEach((f) => console.log(`  · ${f}`));
      process.exit(1);
    }
  }
  check(`Z1 TEMIZ veritabaninda ${kosan} migration"in tamami kostu`, kosan > 0);

  // ── Z2: ADIM 2 tablolari gercekten olustu mu ──────────────────────────
  const beklenenTablolar = [
    'Paket',
    'PaketSurumu',
    'Abonelik',
    'AbonelikBaslatma',
    'AbonelikOlayi',
    'WebhookOlayi',
    'Fatura',
    'HavaleOdemesi',
  ];
  const tabloSonuc = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`,
  );
  const tablolar = tabloSonuc.rows.map((r) => r.table_name);

  // OLCUT: probe calisiyor mu? ADIM 2 ile ilgisi olmayan bilinen bir tablo.
  check(
    'Z-OLCUT tablo listeleyici calisiyor (bilinen "User" goruluyor)',
    tablolar.includes('User'),
    `toplam tablo=${tablolar.length}`,
  );
  for (const t of beklenenTablolar) {
    check(`Z2 tablo olustu: ${t}`, tablolar.includes(t));
  }

  // ── Z3: Firma fatura alanlari eklendi mi ──────────────────────────────
  const kolonSonuc = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='Firma'`,
  );
  const firmaKolonlari = kolonSonuc.rows.map((r) => r.column_name);
  for (const k of [
    'unvan',
    'yetkiliEposta',
    'faturaEposta',
    'vergiNo',
    'vergiDairesi',
    'tcKimlikNo',
    'faturaAdresi',
    'il',
    'ilce',
  ]) {
    check(`Z3 Firma.${k} kolonu var`, firmaKolonlari.includes(k));
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  B* — BACKFILL SOZU: "hicbir mevcut kullanicinin erisimi kesilmez"
  // ═══════════════════════════════════════════════════════════════════════
  //  Yukaridaki zincir BOS bir veritabaninda kostu, yani backfill hicbir
  //  satira DOKUNMADI. Sozu gercekten sinamak icin GOC ONCESI durumu kurup
  //  backfill'i TEKRAR kosmamiz gerekir. Asagida ADIM 2 oncesi bir dunya
  //  kurulur (firmalar + kullanicilar + abonelikler), sonra backfill blogu
  //  yeniden uygulanir.
  //
  //  ⚠ Bu, backfill'in IDEMPOTENT oldugunu da olcer: ayni SQL ikinci kez
  //  kostugunda cift satir URETMEMELIDIR (ON CONFLICT / NOT EXISTS kapilari).

  const bugun = new Date().toISOString();
  await db.exec(`
    INSERT INTO "Firma" ("id","ad","createdAt") VALUES
      ('f-core','Core Firma','${bugun}'),
      ('f-pro','Pro Firma','${bugun}'),
      ('f-tiersiz','Abonesiz Firma','${bugun}'),
      ('f-asimetrik','Asimetrik Firma','${bugun}');

    INSERT INTO "User" ("id","email","password","role","status","tier","firmaId","firmaRol","createdAt") VALUES
      ('u-core','core@x.com','h','user','active','core','f-core','sahip','${bugun}'),
      ('u-pro','pro@x.com','h','user','active','core','f-pro','sahip','${bugun}'),
      ('u-tiersiz','yok@x.com','h','user','active','core','f-tiersiz','sahip','${bugun}'),
      ('u-suite','suite@x.com','h','user','active','suite','f-tiersiz','uye','${bugun}'),
      ('u-asim','asim@x.com','h','user','active','core','f-asimetrik','sahip','${bugun}');

    INSERT INTO "UserSubscription" ("id","userId","level","scope","startsAt","active","createdAt") VALUES
      ('s1','u-core','core','mechanical','${bugun}',true,'${bugun}'),
      ('s2','u-pro','pro','mep','${bugun}',true,'${bugun}'),
      ('s3','u-asim','pro','mechanical','${bugun}',true,'${bugun}'),
      ('s4','u-asim','core','electrical','${bugun}',true,'${bugun}');
  `);

  // Goc oncesi dogrulama: HENUZ abonelik yok (olcut kontrolu).
  const oncesi = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "Abonelik"`,
  );
  check(
    'B-OLCUT goc oncesi bu firmalarin abonelik satiri YOK',
    Number(oncesi.rows[0].n) === 0,
    `adet=${oncesi.rows[0].n}`,
  );

  // Backfill blogunu YENIDEN kos (ADIM 2 migration dosyasinin backfill kismi).
  const adim2 = klasorler.find((k) => k.includes('adim2_abonelik_odeme'))!;
  const tamSql = fs.readFileSync(
    path.join(MIGRATIONS, adim2, 'migration.sql'),
    'utf8',
  );
  const ayrac = '--  BACKFILL — ADIM 2 (28.08.2026)';
  check('B-OLCUT backfill blogu dosyada bulundu', tamSql.includes(ayrac));
  const backfillSql = tamSql.slice(tamSql.indexOf(ayrac));
  await db.exec(backfillSql);

  // ── B1: HER firmaya abonelik acildi ───────────────────────────────────
  const sonrasi = await db.query<{ firmaId: string; kod: string; durum: string }>(
    `SELECT a."firmaId", p."kod", a."durum"::text AS durum
       FROM "Abonelik" a
       JOIN "PaketSurumu" s ON s."id" = a."paketSurumuId"
       JOIN "Paket" p ON p."id" = s."paketId"
      ORDER BY a."firmaId"`,
  );
  const harita = new Map(sonrasi.rows.map((r) => [r.firmaId, r]));

  check(
    'B1 HER firmaya abonelik acildi (4/4)',
    sonrasi.rows.length === 4,
    `adet=${sonrasi.rows.length} → ${JSON.stringify(sonrasi.rows)}`,
  );
  check(
    'B1 hepsi AKTIF (deploy gunu kimse kapida kalmaz)',
    sonrasi.rows.every((r) => r.durum === 'AKTIF'),
    JSON.stringify(sonrasi.rows.map((r) => r.durum)),
  );

  // ── B2: seviye TAVANDAN secildi ───────────────────────────────────────
  check(
    'B2 core aboneli firma → miras-core',
    harita.get('f-core')?.kod === 'miras-core',
    `kod=${harita.get('f-core')?.kod}`,
  );
  check(
    'B2 pro aboneli firma → miras-pro',
    harita.get('f-pro')?.kod === 'miras-pro',
    `kod=${harita.get('f-pro')?.kod}`,
  );
  check(
    'B2 aboneligi YOK ama uyesi suite olan firma → miras-pro (tier de sayilir)',
    harita.get('f-tiersiz')?.kod === 'miras-pro',
    `kod=${harita.get('f-tiersiz')?.kod}`,
  );
  check(
    'B2 asimetrik (pro-mek + core-elk) → miras-pro (TAVAN, erisim daralmaz)',
    harita.get('f-asimetrik')?.kod === 'miras-pro',
    `kod=${harita.get('f-asimetrik')?.kod}`,
  );

  // ── B3: miras paketleri SATISA KAPALI ─────────────────────────────────
  const mirasSonuc = await db.query<{ aktif: boolean; satistaMi: boolean }>(
    `SELECT p."aktif", s."satistaMi"
       FROM "Paket" p JOIN "PaketSurumu" s ON s."paketId" = p."id"
      WHERE p."kod" LIKE 'miras-%'`,
  );
  check(
    'B3 miras paketleri fiyat sayfasinda GORUNMEZ (aktif=false, satistaMi=false)',
    mirasSonuc.rows.length === 2 &&
      mirasSonuc.rows.every((r) => !r.aktif && !r.satistaMi),
    JSON.stringify(mirasSonuc.rows),
  );

  // ── B4: kart taramalarinin disinda (iyzico karsiligi yok) ─────────────
  const yontem = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "Abonelik"
      WHERE "odemeYontemi" = 'HAVALE' AND "iyzicoAbonelikKodu" IS NULL`,
  );
  check(
    'B4 miras abonelikleri HAVALE + iyzico kodsuz (dunning/mutabakat atlar)',
    Number(yontem.rows[0].n) === 4,
    `adet=${yontem.rows[0].n}`,
  );

  // ── B5: fatura kimligi sahibin e-postasindan dolduruldu ───────────────
  const eposta = await db.query<{ id: string; yetkiliEposta: string | null }>(
    `SELECT "id", "yetkiliEposta" FROM "Firma" ORDER BY "id"`,
  );
  check(
    'B5 her firmanin yetkiliEposta"si dolduruldu',
    eposta.rows.every((r) => !!r.yetkiliEposta),
    JSON.stringify(eposta.rows),
  );
  check(
    'B5 SAHIP uyenin e-postasi secildi (uye degil)',
    eposta.rows.find((r) => r.id === 'f-tiersiz')?.yetkiliEposta === 'yok@x.com',
    `f-tiersiz → ${eposta.rows.find((r) => r.id === 'f-tiersiz')?.yetkiliEposta}`,
  );

  // ── B6: IDEMPOTENT — ikinci kosum cift satir uretmez ──────────────────
  await db.exec(backfillSql);
  const ikinci = await db.query<{ ab: number; pk: number }>(
    `SELECT (SELECT count(*)::int FROM "Abonelik") AS ab,
            (SELECT count(*)::int FROM "Paket") AS pk`,
  );
  check(
    'B6 backfill IDEMPOTENT — ikinci kosumda abonelik sayisi degismedi',
    Number(ikinci.rows[0].ab) === 4,
    `abonelik=${ikinci.rows[0].ab}`,
  );
  check(
    'B6 backfill IDEMPOTENT — miras paketleri cogalmadi',
    Number(ikinci.rows[0].pk) === 2,
    `paket=${ikinci.rows[0].pk}`,
  );

  await db.close();

  console.log(
    `\n${'='.repeat(64)}\nMIGRATION ZINCIRI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
  );
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
