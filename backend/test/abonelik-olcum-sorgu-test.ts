/**
 * ABONELIK OLCUM BETIGI — SORGU GECERLILIK TURU
 *   (`npm run test:olcum-sorgu`)
 *
 * AG/DOCKER GEREKTIRMEZ: PGlite (WASM PostgreSQL 16) uzerine gercek migration
 * zinciri uygulanir, sonra `scripts/abonelik-olcum.sh` icindeki HER sorgu
 * gercekten CALISTIRILIR.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Olcum betikleri canlida, TEK SEFER, kritik bir kararin oncesinde kosuyor
 * (bkz. firma-olcum.sh 28.08 — ilk kosumda cikti ekrandan tasti ve sayimlar
 * okunamadi). Betik orada patlarsa ikinci sans yok: kullanici konsolda
 * anlamsiz bir psql hatasi gorur ve karar gecikir.
 *
 * Betikteki SQL UC KATMAN tirnaktan geciyor:
 *     betik kaynagi  ->  sh -c dizesi  ->  psql -c argumani
 * Tirnak DENGESI'ni saymak yeterli DEGIL — dengeli ama sutun adi yanlis bir
 * sorgu da "dengeli" gorunur. Tek gercek olcut: sorguyu gercek sema uzerinde
 * KOSTURMAK.
 *
 * ── OLCULEN ────────────────────────────────────────────────────────────
 *   S-OLCUT betikten sorgu gercekten cikarilabildi mi (0 sorgu = bosa dusme)
 *   S1 her sorgu gercek sema uzerinde HATASIZ kosuyor
 *   S2 sorgular SALT-OKUMA (BEGIN READ ONLY icinde de calisiyor)
 *   S3 beklenen sutun adlari cikiyor (A1 karar tablosu sozlesmesi)
 *   S4 bos veritabaninda da PATLAMADAN 0 donuyor (payda yolu)
 *
 * Cikis kodu sozlesmesi: 0 = PASS · 2 = SKIP (PGlite yok) · digeri = FAIL.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

const KOK = join(__dirname, '..', '..');
const BETIK = join(KOK, 'scripts', 'abonelik-olcum.sh');
const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');

/**
 * Betikteki `sorgu '<SQL>'` cagrilarini, bash'in yapacagi tirnak cozumunu
 * TAKLIT EDEREK cikarir.
 *
 *   '"'"'  ->  '     (bash tek-tirnak kacisi)
 *   \"     ->  "     (sh -c cift-tirnakli katmani)
 */
function sorgulariCikar(kaynak: string): string[] {
  const satirlar = kaynak.split('\n');
  const cikan: string[] = [];
  for (const s of satirlar) {
    const m = /^\s*sorgu '(.*)'\s*$/.exec(s);
    if (!m) continue;
    cikan.push(m[1].split(`'"'"'`).join("'").split('\\"').join('"'));
  }
  return cikan;
}

async function main() {
  if (!existsSync(BETIK)) {
    console.log(`SKIP — betik bulunamadi: ${BETIK}`);
    process.exit(2);
  }

  let PGlite: any;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
  } catch {
    console.log('SKIP — @electric-sql/pglite kurulu degil.');
    process.exit(2);
  }

  const sorgular = sorgulariCikar(readFileSync(BETIK, 'utf8'));

  console.log('\n── S · OLCUT ──');
  // Bosa dusme kapisi: regex tutmazsa asagidaki her assert TESADUFEN yesil
  // kalirdi (bos dizide .every() daima true). Bkz. feedback_bos_dizi_yalanci_yesil.
  check(
    'S-OLCUT betikten sorgu cikarilabildi (bos degil)',
    sorgular.length >= 8,
    `bulunan=${sorgular.length}`,
  );
  if (sorgular.length === 0) return son();

  const db = new PGlite();

  // ── Gercek migration zinciri ──────────────────────────────────────────
  const klasorler = readdirSync(MIGRATIONS)
    .filter((d) => /^\d{14}_/.test(d))
    .sort();
  check('S-OLCUT migration zinciri bulundu', klasorler.length > 0, `adet=${klasorler.length}`);

  let uygulanan = 0;
  for (const k of klasorler) {
    const sqlYolu = join(MIGRATIONS, k, 'migration.sql');
    if (!existsSync(sqlYolu)) continue;
    try {
      await db.exec(readFileSync(sqlYolu, 'utf8'));
      uygulanan++;
    } catch (e: any) {
      check(`S-OLCUT migration uygulandi: ${k}`, false, String(e?.message).slice(0, 120));
      return son();
    }
  }
  check('S-OLCUT tum migration dosyalari uygulandi', uygulanan === klasorler.length, `${uygulanan}/${klasorler.length}`);

  // Betik `_prisma_migrations`'a bakmiyor ama tablo yoksa baska sorgular
  // etkilenmesin diye yine de var edelim (canlida Prisma yaratir).
  await db.exec(`CREATE TABLE IF NOT EXISTS _prisma_migrations (
    id text PRIMARY KEY, migration_name text, finished_at timestamptz)`);

  // ── S1/S2: her sorgu, canlidaki SARMALIN AYNISI icinde kosuyor mu? ────
  console.log('\n── S1/S2 · SORGULAR (BEGIN READ ONLY icinde) ──');
  const sonuclar: any[] = [];
  for (let i = 0; i < sorgular.length; i++) {
    const sql = sorgular[i];
    const kisa = sql.slice(0, 52).replace(/\s+/g, ' ');
    try {
      // Canlidaki `sorgu()` ile BIREBIR ayni sarmal: BEGIN READ ONLY ... ROLLBACK
      await db.exec('BEGIN READ ONLY');
      const r = await db.query(sql);
      await db.exec('ROLLBACK');
      sonuclar.push(r);
      check(`S1.${i + 1} kostu: ${kisa}…`, true);
    } catch (e: any) {
      try {
        await db.exec('ROLLBACK');
      } catch {
        /* zaten dusmus olabilir */
      }
      sonuclar.push(null);
      check(`S1.${i + 1} kostu: ${kisa}…`, false, String(e?.message).slice(0, 160));
    }
  }

  // ── S3: A1 karar tablosunun SOZLESMESI ────────────────────────────────
  // Betigin okuma talimati bu sutun adlarina gore yazildi; ad degisirse
  // talimat yalan soyler.
  console.log('\n── S3 · A1 KARAR TABLOSU SOZLESMESI ──');
  const a1 = sonuclar.find(
    (r) => r && r.fields?.some((f: any) => f.name === 'aboneliksiz_firma') && r.fields?.some((f: any) => f.name === 'firma_toplam'),
  );
  check('S3 A1 sorgusu bulundu', !!a1);
  if (a1) {
    const adlar = a1.fields.map((f: any) => f.name);
    for (const beklenen of [
      'firma_toplam',
      'abonelik_satiri',
      'aboneliksiz_firma',
      'kullanici_toplam',
      'firmasiz_kullanici',
      'etkilenen_kullanici',
    ]) {
      check(`S3 sutun var: ${beklenen}`, adlar.includes(beklenen), `donen=${adlar.join(',')}`);
    }
    // PAYDA kanidi: her sayim toplamiyla birlikte donmeli.
    check(
      'S3 ⭐ PAYDA donuyor (sayim yaninda toplam da var)',
      adlar.includes('firma_toplam') && adlar.includes('kullanici_toplam'),
    );
  }

  // ── S4: BOS veritabani yolu ───────────────────────────────────────────
  // "0 cikti" ile "patladi" ayirt edilebilmeli. Su an DB gercekten bos, yani
  // bu yol zaten kosuldu; ama sonucun 0 OLDUGUNU acikca assert ediyoruz —
  // aksi halde S1 "kostu" der, sonucun anlamli olup olmadigini soylemez.
  console.log('\n── S4 · BOS VERITABANI YOLU ──');
  if (a1) {
    const r = a1.rows[0];
    check(
      'S4 bos veritabaninda sayimlar 0 donuyor (patlamiyor)',
      Number(r.firma_toplam) === 0 && Number(r.aboneliksiz_firma) === 0,
      `firma_toplam=${r.firma_toplam} aboneliksiz=${r.aboneliksiz_firma}`,
    );
  }

  // ── S4-b: DOLU veritabani yolu ────────────────────────────────────────
  // Asil olcum bu: aboneligi OLMAYAN bir firma gercekten sayiliyor mu?
  // Bos DB'de 0 gormek, sorgunun DOGRU SEYI saydigini kanitlamaz.
  //
  // ⚠ FIXTURE ASIMETRIK OLMAK ZORUNDA. Ilk denemede 1 abonelikli + 1
  // aboneliksiz kurulmustu ve `NOT EXISTS -> EXISTS` mutasyonu HAYATTA
  // KALDI: simetrik kumede iki yon de 1 doner, test ayirt edemez.
  // Bugunku dagilim BILEREK her sayiyi FARKLI kiliyor:
  //     firma_toplam=3 · abonelik_satiri=1 · aboneliksiz_firma=2
  //     kullanici_toplam=4 · firmasiz=1 · etkilenen=2
  // Boylece tek bir yanlis yon/sutun bile sayiyi degistirir.
  // Bkz. feedback_fixture_dogru_dali_surmeli.
  console.log('\n── S4-b · DOLU VERITABANI (asil olcum, ASIMETRIK) ──');
  try {
    await db.exec(`
      INSERT INTO "Firma" (id, ad, "createdAt") VALUES
        ('f-abonelikli',  'Abonelikli AS',   now()),
        ('f-aboneliksiz1','Aboneliksiz-1 AS',now()),
        ('f-aboneliksiz2','Aboneliksiz-2 AS',now());
      INSERT INTO "Paket" (id, kod, ad, kapsam, seviye, sira)
        VALUES ('p1', 'pro-mek', 'Pro Mekanik', 'mechanical', 'pro', 1);
      INSERT INTO "PaketSurumu" (id, "paketId", "surumNo", "iyzicoPlanKodu", "iyzicoUrunKodu", tutar)
        VALUES ('s1', 'p1', 1, 'plan-1', 'urun-1', 1649.00);
      -- ⚠ "guncellendi" Prisma'nin @updatedAt alani: DB VARSAYILANI YOK,
      -- degeri uygulama katmani yazar. Ham SQL ile eklerken elle verilmeli.
      INSERT INTO "Abonelik" (id, "firmaId", "paketSurumuId", "erisimSonu", "guncellendi")
        VALUES ('a1', 'f-abonelikli', 's1', now() + interval '30 days', now());
      -- Kullanici dagilimi: abonelikli firmada 1, aboneliksiz-1'de 2,
      -- aboneliksiz-2'de 0, ayrica firmasiz 1 kisi.
      INSERT INTO "User" (id, email, password, "firmaId") VALUES
        ('u1', 'a@x.co', 'x', 'f-abonelikli'),
        ('u2', 'b@x.co', 'x', 'f-aboneliksiz1'),
        ('u3', 'c@x.co', 'x', 'f-aboneliksiz1'),
        ('u4', 'd@x.co', 'x', NULL);
    `);
    await db.exec('BEGIN READ ONLY');
    const r2: any = await db.query(sorgular.find((s) => s.includes('aboneliksiz_firma') && s.includes('firma_toplam'))!);
    await db.exec('ROLLBACK');
    const v = r2.rows[0];

    check(
      'S4-b ⭐ uc firmadan YALNIZ aboneliksiz IKISI sayiliyor',
      Number(v.aboneliksiz_firma) === 2,
      `aboneliksiz=${v.aboneliksiz_firma} (beklenen 2)`,
    );
    check(
      'S4-b payda dogru: firma_toplam=3, abonelik_satiri=1',
      Number(v.firma_toplam) === 3 && Number(v.abonelik_satiri) === 1,
      `toplam=${v.firma_toplam} abonelik=${v.abonelik_satiri}`,
    );
    check(
      'S4-b ⭐ etkilenen_kullanici=2 (firmasiz kisi SAYILMIYOR)',
      Number(v.etkilenen_kullanici) === 2,
      `etkilenen=${v.etkilenen_kullanici} (beklenen 2)`,
    );
    check(
      'S4-b firmasiz_kullanici=1, kullanici_toplam=4',
      Number(v.firmasiz_kullanici) === 1 && Number(v.kullanici_toplam) === 4,
      `firmasiz=${v.firmasiz_kullanici} toplam=${v.kullanici_toplam}`,
    );
  } catch (e: any) {
    check('S4-b dolu DB yolu kuruldu', false, String(e?.message).slice(0, 200));
  }

  await db.close();
  son();
}

function son() {
  console.log(
    `\n${'='.repeat(64)}\nABONELIK OLCUM SORGULARI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
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
