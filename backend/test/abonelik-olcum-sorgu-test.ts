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
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

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

/**
 * Ayni cozumu YAZAN sarmal icin yapar (`yaz '<SQL>'`).
 * Faz 6.4: paket-satis-kapat.sh'in tek yazma sorgusu.
 */
function yazmalariCikar(kaynak: string): string[] {
  const cikan: string[] = [];
  for (const s of kaynak.split('\n')) {
    const m = /^\s*yaz '(.*)'\s*$/.exec(s);
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
  await denemeBlogu(PGlite, sorgular, klasorler);
  // ── S7 · PAKET SATIS KAPATMA BETIGI (FAZ 6.4) ─────────────────────────
  //
  // `scripts/paket-satis-kapat.sh` canlida TEK SEFER, kritik bir kararin
  // ardindan kosacak. Oradaki her sorgu — okuma VE yazma — burada gercek
  // sema uzerinde kosturuluyor. Yazan sorgu ayrica DAVRANIS olarak
  // olculuyor: dogru satirlari mi kapatiyor, guvenlik kapisi tutuyor mu.
  console.log('\n── S7 · paket-satis-kapat.sh ──');
  const KAPAT_BETIK = join(KOK, 'scripts', 'paket-satis-kapat.sh');
  if (!existsSync(KAPAT_BETIK)) {
    check('S7-OLCUT betik bulundu', false, KAPAT_BETIK);
  } else {
    const kaynak = readFileSync(KAPAT_BETIK, 'utf8');
    const okumalar = sorgulariCikar(kaynak);
    const yazmalar = yazmalariCikar(kaynak);
    check('S7-OLCUT okuma sorgulari cikarildi', okumalar.length >= 8, `bulunan=${okumalar.length}`);
    check('S7-OLCUT yazma sorgusu cikarildi', yazmalar.length === 1, `bulunan=${yazmalar.length}`);
    check(
      'S7-OLCUT ⭐ betigin VARSAYILANI PROVA (uygula bayragi olmadan yazmaz)',
      /UYGULA="hayir"/.test(kaynak) && /if \[ "\$UYGULA" != "evet" \]/.test(kaynak),
      'prova kapisi',
    );

    // ⚠ KENDI PGlite ORNEGI: ustteki bolumler `db`yi kapatmis olabilir ve
    // fixture'lari bu bolumun sayimlarini bozar. Temiz sema, temiz sayim.
    const db = new PGlite();
    for (const k of klasorler) {
      const sqlYolu = join(MIGRATIONS, k, 'migration.sql');
      if (existsSync(sqlYolu)) await db.exec(readFileSync(sqlYolu, 'utf8'));
    }
    // ADIM 2 migration'i miras paketlerini KENDISI yaziyor; sayimlar
    // belirsizlesmesin diye tablo bu bolume ait fixture'la kuruluyor.
    await db.exec('DELETE FROM "Abonelik"; DELETE FROM "AbonelikBaslatma"; DELETE FROM "PaketSurumu"; DELETE FROM "Paket";');
    await db.exec(`
      INSERT INTO "Paket" (id, kod, ad, kapsam, seviye, sira) VALUES
        ('pk1','basic-mek','Basic Mekanik','mechanical','core',10),
        ('pk2','pro-mek','Pro Mekanik','mechanical','pro',20),
        ('pk3','basic-elk','Basic Elektrik','electrical','core',30),
        ('pk4','pro-elk','Pro Elektrik','electrical','pro',40),
        ('pk5','pro-mep','Pro MEP','mep','pro',50),
        ('pk6','miras-core','Miras','mechanical','core',90);
      INSERT INTO "PaketSurumu" (id,"paketId","surumNo","iyzicoPlanKodu","iyzicoUrunKodu",tutar,"satistaMi") VALUES
        ('v1','pk1',1,'p1','u1',1149.00,true),
        ('v2','pk2',1,'p2','u2',1649.00,true),
        ('v3','pk3',1,'p3','u3',1149.00,true),
        ('v4','pk4',1,'p4','u4',1649.00,true),
        ('v5','pk5',1,'p5','u5',2449.00,true),
        ('v6','pk6',1,'p6','u6',0.00,false);
    `);

    for (let i = 0; i < okumalar.length; i++) {
      const kisa = okumalar[i].slice(0, 46).replace(/\s+/g, ' ');
      try {
        await db.exec('BEGIN READ ONLY');
        await db.query(okumalar[i]);
        await db.exec('ROLLBACK');
        check(`S7.${i + 1} okuma kostu: ${kisa}…`, true);
      } catch (e: any) {
        try { await db.exec('ROLLBACK'); } catch { /* zaten dusmus */ }
        check(`S7.${i + 1} okuma kostu: ${kisa}…`, false, String(e?.message).slice(0, 160));
      }
    }

    // ── S7-YAZ · DAVRANIS ────────────────────────────────────────────────
    // psql'in BEGIN/COMMIT'i PGlite'ta `exec` ile ayni anlamda kosar.
    let yazHatasi: string | null = null;
    try {
      await db.exec(yazmalar[0]);
    } catch (e: any) {
      yazHatasi = String(e?.message);
      try { await db.exec('ROLLBACK'); } catch { /* zaten dusmus */ }
    }
    check('S7-YAZ1 yazma sorgusu gecerli sema uzerinde KOSTU', yazHatasi === null, String(yazHatasi));

    const son1: any = await db.query(
      `SELECT p.kod, s."satistaMi" FROM "PaketSurumu" s JOIN "Paket" p ON p.id = s."paketId" ORDER BY p.sira`,
    );
    const durum = Object.fromEntries(son1.rows.map((r: any) => [r.kod, r.satistaMi]));
    check(
      'S7-YAZ2 ⭐ UC elektrik paketi satistan cikti',
      durum['basic-elk'] === false && durum['pro-elk'] === false && durum['pro-mep'] === false,
      JSON.stringify(durum),
    );
    check(
      'S7-YAZ3 ⭐ mekanik paketlere DOKUNULMADI',
      durum['basic-mek'] === true && durum['pro-mek'] === true,
      JSON.stringify(durum),
    );

    // ⭐ GUVENLIK KAPISI: "satista kalan 2 degilse islem patlar ve ROLLBACK".
    // Fixture BILEREK bozuluyor (uc mekanik satis) — kapi yoksa bu sessizce
    // gecerdi ve yanlis bir canli veritabaninda betik kor kor yazardi.
    await db.exec(`UPDATE "PaketSurumu" SET "satistaMi" = true;`);
    let kapiPatladi = false;
    try {
      await db.exec(yazmalar[0]);
    } catch {
      kapiPatladi = true;
      try { await db.exec('ROLLBACK'); } catch { /* zaten dusmus */ }
    }
    const son2: any = await db.query(`SELECT count(*)::int AS n FROM "PaketSurumu" WHERE "satistaMi"`);
    check(
      'S7-YAZ4 ⭐ beklenmedik dagilimda islem PATLIYOR (kor kor yazmiyor)',
      kapiPatladi,
      `patladi=${kapiPatladi}`,
    );
    check(
      'S7-YAZ5 ⭐ patlayinca hicbir satir DEGISMEDI (ROLLBACK)',
      Number(son2.rows[0].n) === 6,
      `satista=${son2.rows[0].n} (beklenen 6 — hepsi acik kalmali)`,
    );
  }


  son();
}

// ═════════════════════════════════════════════════════════════════════════
// S5/S6 — DENEME TEKRARI KIPI (Faz 6.12a, 16.09). KOSULMADI (canli): burada
// yalniz gecerliligi ve SAYDIGI SEYIN dogrulugu olculur.
//
// ⚠ FIXTURE ASIMETRIK: her anahtarin fazladan sayisi FARKLI; bir normalize
// kurali (gmail noktasi, +etiket, harf) ya da bir anahtar dusurulurse toplam
// DEGISIR. Zaman sirasi: dakika once (buyuk = eski).
//   F1 tel yok, abonelik imk=M1 · n1 u1 'Ali.Veli@GMail.com' 90dk · n2 u1 50dk
//   F2 tel 0544 222 22 22       · n3 u2 'aliveli+x@gmail.com' 70dk · n9 u2 30dk
//   F3 tel +90 544 222 2222     · n4 u3 'veli@firma.com' 60dk
//   F4                           · n5 u4 'tekil@ornek.com' 80dk
//   F5 denemesiz surum (s0)     · n6 (deneme DEGIL)
//   F6 BEKLIYOR                 · n7 (deneme DEGIL)
//   F7 niyet denemeGunu=0 (deploy sonrasi denemesiz ikiz) · n8 (deneme DEGIL)
//   F8 miras ilk kart alimi: olay AKTIF→DENEME, deneme niyeti olaydan SONRA
//   F9 havale ASKIDA ilk kart: olay ASKIDA→DENEME, niyet olaydan SONRA
// Beklenen D2: firma 2 (n2,n9) · eposta 3 (n2,n3,n9) · telefon 2 (n4,n9) ·
//   iyzico_musteri 1 (n2) · HERHANGI_BIRI 4 baslatma / 3 firma.
// Beklenen D3: TOPLAM 2 · DENEME 1 (F1 yol B) · IPTAL 1 (F2 yol A); F8/F9 YOK.
// ═════════════════════════════════════════════════════════════════════════
async function denemeBlogu(PGlite: any, sorgular: string[], klasorler: string[]): Promise<void> {
  console.log('\n── S5 · DENEME TEKRARI KIPI (asimetrik fixture) ──');
  const bul = (sutun: string) => sorgular.find((s) => s.includes(` AS ${sutun}`));
  const d1 = bul('toplam_deneme');
  const d2 = bul('tekrar_anahtari');
  const d3 = bul('sona_ermeden_once');
  const d4 = bul('ikiz_kume');
  check('S5-OLCUT deneme kipinin dort sorgusu betikte bulundu', !!(d1 && d2 && d3 && d4),
    `d1=${!!d1} d2=${!!d2} d3=${!!d3} d4=${!!d4}`);
  if (!(d1 && d2 && d3 && d4)) return;

  const kos = async (db: any, sql: string) => {
    await db.exec('BEGIN READ ONLY');
    try {
      return (await db.query(sql)).rows as any[];
    } finally {
      await db.exec('ROLLBACK');
    }
  };
  const zincirKur = async (haric?: string) => {
    const db = new PGlite();
    for (const k of klasorler) {
      if (haric && k.includes(haric)) continue;
      const yol = join(MIGRATIONS, k, 'migration.sql');
      if (existsSync(yol)) await db.exec(readFileSync(yol, 'utf8'));
    }
    return db;
  };

  const db = await zincirKur();
  try {
    await db.exec(`
      INSERT INTO "Paket" (id, kod, ad, kapsam, seviye, sira) VALUES
        ('p1', 'pro-mek', 'Pro Mekanik', 'mechanical', 'pro', 1),
        ('pm', 'miras-fixture', 'Miras Fixture', 'mep', 'pro', 99);
      INSERT INTO "PaketSurumu" (id, "paketId", "surumNo", "iyzicoPlanKodu", "iyzicoUrunKodu", tutar, "denemeGunu") VALUES
        ('s30', 'p1', 1, 'plan-30', 'urun-1', 1649.00, 30),
        ('s0',  'p1', 2, 'plan-0',  'urun-1', 1649.00, 0),
        ('sm',  'pm', 1, 'plan-m',  'urun-m', 0, 0);
      INSERT INTO "Firma" (id, ad, telefon) VALUES
        ('F1', 'F1', NULL), ('F2', 'F2', '0544 222 22 22'), ('F3', 'F3', '+90 544 222 2222'),
        ('F4', 'F4', NULL), ('F5', 'F5', NULL), ('F6', 'F6', NULL), ('F7', 'F7', NULL),
        ('F8', 'F8', NULL), ('F9', 'F9', NULL), ('FT', 'FT', NULL);
      INSERT INTO "User" (id, email, password, "firmaId") VALUES
        ('u1', 'Ali.Veli@GMail.com', 'x', 'F1'), ('u2', 'aliveli+x@gmail.com', 'x', 'F2'),
        ('u3', 'veli@firma.com', 'x', 'F3'), ('u4', 'tekil@ornek.com', 'x', 'F4'),
        ('u5', 'bes@ornek.com', 'x', 'F5'), ('u6', 'alti@ornek.com', 'x', 'F6'),
        ('u7', 'yedi@ornek.com', 'x', 'F7'), ('u8', 'miras@ornek.com', 'x', 'F8'),
        ('u9', 'havale@ornek.com', 'x', 'F9'),
        ('t1', 'ALI@TWIN.com', 'x', 'FT'), ('t2', 'ali@twin.com', 'x', 'FT'),
        ('t3', 'Ali@Twin.com', 'x', 'FT'), ('t4', 'Solo@Case.com', 'x', 'FT');
      INSERT INTO "Abonelik" (id, "firmaId", "paketSurumuId", durum, "erisimSonu", "iyzicoMusteriKodu", guncellendi) VALUES
        ('A1', 'F1', 's30', 'DENEME', now() + interval '30 days', 'M1', now()),
        ('A2', 'F2', 's30', 'DENEME', now() + interval '30 days', NULL, now()),
        ('A8', 'F8', 's30', 'DENEME', now() + interval '30 days', NULL, now()),
        ('A9', 'F9', 's30', 'DENEME', now() + interval '30 days', NULL, now());
      INSERT INTO "AbonelikBaslatma" (id, token, "firmaId", "paketSurumuId", "olusturanId", durum, olusturuldu, sonuclandi, "denemeGunu") VALUES
        ('n1', 't-n1', 'F1', 's30', 'u1', 'TAMAMLANDI', now() - interval '91 minutes', now() - interval '90 minutes', NULL),
        ('n2', 't-n2', 'F1', 's30', 'u1', 'TAMAMLANDI', now() - interval '51 minutes', now() - interval '50 minutes', NULL),
        ('n3', 't-n3', 'F2', 's30', 'u2', 'TAMAMLANDI', now() - interval '71 minutes', now() - interval '70 minutes', NULL),
        ('n9', 't-n9', 'F2', 's30', 'u2', 'TAMAMLANDI', now() - interval '31 minutes', now() - interval '30 minutes', NULL),
        ('n4', 't-n4', 'F3', 's30', 'u3', 'TAMAMLANDI', now() - interval '61 minutes', now() - interval '60 minutes', NULL),
        ('n5', 't-n5', 'F4', 's30', 'u4', 'TAMAMLANDI', now() - interval '81 minutes', now() - interval '80 minutes', NULL),
        ('n6', 't-n6', 'F5', 's0',  'u5', 'TAMAMLANDI', now() - interval '41 minutes', now() - interval '40 minutes', NULL),
        ('n7', 't-n7', 'F6', 's30', 'u6', 'BEKLIYOR',   now() - interval '41 minutes', NULL, NULL),
        ('n8', 't-n8', 'F7', 's30', 'u7', 'TAMAMLANDI', now() - interval '21 minutes', now() - interval '20 minutes', 0),
        ('n10','t-n10','F8', 's30', 'u8', 'TAMAMLANDI', now() - interval '16 minutes', now() - interval '15 minutes', NULL),
        ('n11','t-n11','F9', 's30', 'u9', 'TAMAMLANDI', now() - interval '11 minutes', now() - interval '10 minutes', NULL);
      INSERT INTO "AbonelikOlayi" (id, "abonelikId", tip, "oncekiDurum", "yeniDurum", olusturuldu) VALUES
        ('o1', 'A1', 'durum.degisti', 'DENEME', 'SONA_ERDI', now() - interval '55 minutes'),
        ('o2', 'A1', 'abonelik.yeniden.acildi', 'SONA_ERDI', 'DENEME', now() - interval '50 minutes 30 seconds'),
        ('o3', 'A2', 'durum.degisti', 'IPTAL', 'SONA_ERDI', now() - interval '35 minutes'),
        ('o4', 'A2', 'abonelik.yeniden.acildi', 'SONA_ERDI', 'DENEME', now() - interval '30 minutes 30 seconds'),
        ('o5', 'A8', 'abonelik.yeniden.acildi', 'AKTIF', 'DENEME', now() - interval '15 minutes 30 seconds'),
        ('o6', 'A9', 'abonelik.yeniden.acildi', 'ASKIDA', 'DENEME', now() - interval '10 minutes 30 seconds');
    `);

    const r1 = (await kos(db, d1))[0];
    // n1,n2,n3,n9,n4,n5,n10,n11 = 8 · firmalar F1,F2,F3,F4,F8,F9 = 6
    check('S5.D1 ⭐ toplam_deneme=8 (denemesiz surum, BEKLIYOR ve denemesiz ikiz niyet SAYILMAZ)',
      Number(r1.toplam_deneme) === 8, JSON.stringify(r1));
    check('S5.D1 deneme_alan_firma=6 · ayni_firma_fazladan=2 · tamamlanan_satin_alma=10 (payda)',
      Number(r1.deneme_alan_firma) === 6 && Number(r1.ayni_firma_fazladan) === 2 &&
        Number(r1.tamamlanan_satin_alma) === 10, JSON.stringify(r1));

    const r2 = await kos(db, d2);
    const satir2 = (t: string) => r2.find((r) => r.tekrar_anahtari === t);
    const ozet2 = r2.map((r) => `${r.tekrar_anahtari}=${r.fazladan_deneme}/${r.tekrar_eden_firma}`).join(' ');
    check('S5.D2 firma: 2 fazladan / 2 firma', Number(satir2('firma')?.fazladan_deneme) === 2 &&
      Number(satir2('firma')?.tekrar_eden_firma) === 2, ozet2);
    check('S5.D2 ⭐ eposta: 3 fazladan (gmail noktasi + etiket + harf ayni kisi)',
      Number(satir2('eposta')?.fazladan_deneme) === 3 && Number(satir2('eposta')?.tekrar_eden_firma) === 2, ozet2);
    check('S5.D2 ⭐ telefon: 2 fazladan (farkli yazim, son 10 hane)',
      Number(satir2('telefon')?.fazladan_deneme) === 2 && Number(satir2('telefon')?.tekrar_eden_firma) === 2, ozet2);
    check('S5.D2 iyzico_musteri: 1 fazladan; tc satiri YOK (tc verisi yok)',
      Number(satir2('iyzico_musteri')?.fazladan_deneme) === 1 && !satir2('tc'), ozet2);
    check('S5.D2 ⭐ HERHANGI_BIRI: 4 deneme / 3 firma (tekillestirilmis toplam)',
      Number(satir2('HERHANGI_BIRI')?.fazladan_deneme) === 4 && Number(satir2('HERHANGI_BIRI')?.tekrar_eden_firma) === 3, ozet2);

    const r3 = await kos(db, d3);
    const satir3 = (t: string) => r3.find((r) => r.sona_ermeden_once === t);
    const ozet3 = r3.map((r) => `${r.sona_ermeden_once}=${r.yeniden_deneme}`).join(' ');
    check('S5.D3 ⭐ TOPLAM=2: miras ilk alim (AKTIF) ve havale-ASKIDA ilk alim (onceki deneme YOK) SAYILMAZ',
      Number(satir3('TOPLAM')?.yeniden_deneme) === 2 && !satir3('ASKIDA_ya_da_olay_yok'), ozet3);
    check('S5.D3 yol B (DENEME→SONA_ERDI) 1 · yol A (IPTAL→SONA_ERDI) 1',
      Number(satir3('DENEME')?.yeniden_deneme) === 1 && Number(satir3('IPTAL')?.yeniden_deneme) === 1, ozet3);

    const r4 = (await kos(db, d4))[0];
    check('S5.D4 ⭐ harf ikizi: 1 kume / 3 hesap / 2 fazladan; buyuk harfli 4 (tekil "Solo@Case" dahil)',
      Number(r4.ikiz_kume) === 1 && Number(r4.ikiz_hesap) === 3 && Number(r4.fazladan_hesap) === 2 &&
        Number(r4.buyuk_harfli_eposta) === 4 && Number(r4.kullanici_toplam) === 13, JSON.stringify(r4));
  } catch (e: any) {
    check('S5 fixture kuruldu ve sorgular kostu', false, String(e?.message).slice(0, 240));
  } finally {
    await db.close();
  }

  // ── S6: DEPLOY ONCESI SEMA ────────────────────────────────────────────
  // Olcum karar icin DEPLOY'DAN ONCE kosulacak; o semada "denemeGunu" niyet
  // sutunu ve iyzicoDenemesizPlanKodu YOK. Sorgu sutun adini dogrudan
  // ansaydi "column does not exist" ile patlardi (to_jsonb bunu onler).
  console.log('\n── S6 · DEPLOY ONCESI SEMADA (6.12a migration HARIC) ──');
  const once = await zincirKur('deneme_hakki');
  try {
    const kolon = await once.query(
      `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'AbonelikBaslatma' AND column_name = 'denemeGunu'`,
    );
    check('S6-OLCUT deploy oncesi semada niyet denemeGunu sutunu GERCEKTEN yok', Number((kolon.rows[0] as any).n) === 0);
    let hata = '';
    for (const sql of sorgular) {
      try {
        await kos(once, sql);
      } catch (e: any) {
        hata = `${sql.slice(0, 60)} → ${String(e?.message).slice(0, 120)}`;
        break;
      }
    }
    check(`S6 ⭐ ${sorgular.length} sorgunun HEPSI deploy oncesi semada da kostu`, hata === '', hata);
    await once.exec(`
      INSERT INTO "Paket" (id, kod, ad, kapsam, seviye, sira) VALUES ('p1', 'pro-mek', 'Pro', 'mechanical', 'pro', 1);
      INSERT INTO "PaketSurumu" (id, "paketId", "surumNo", "iyzicoPlanKodu", "iyzicoUrunKodu", tutar, "denemeGunu") VALUES
        ('s30', 'p1', 1, 'plan-30', 'urun-1', 1649.00, 30), ('s0', 'p1', 2, 'plan-0', 'urun-1', 1649.00, 0);
      INSERT INTO "AbonelikBaslatma" (id, token, "firmaId", "paketSurumuId", "olusturanId", durum) VALUES
        ('a', 'ta', 'F1', 's30', 'u1', 'TAMAMLANDI'), ('b', 'tb', 'F1', 's30', 'u1', 'TAMAMLANDI'),
        ('c', 'tc', 'F2', 's0', 'u2', 'TAMAMLANDI');
    `);
    const r = (await kos(once, d1))[0];
    check('S6 deploy oncesi D1 surumun deneme gununu okur: toplam 2, ayni firma fazladan 1',
      Number(r.toplam_deneme) === 2 && Number(r.ayni_firma_fazladan) === 1, JSON.stringify(r));
  } catch (e: any) {
    check('S6 deploy oncesi sema kuruldu', false, String(e?.message).slice(0, 240));
  } finally {
    await once.close();
  }
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

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exit(1);
}));
