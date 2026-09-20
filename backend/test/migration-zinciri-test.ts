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
    'YoneticiOlayi',
    'WebhookOlayi',
    'Fatura',
    'HavaleOdemesi',
    // Faz 6.2 (14.09): çeviri tüketim kaydı — kota bu tablodan sayılır.
    'CeviriTuketimi',
    // Tur 3 A4c (14.09): K1 donmus ozel fiyat temizliginin yedegi (geri alma izi).
    'KutuphaneOzelFiyatYedegi',
    // Faz 6.9 (T2): firma ceviri duzeltmesi + olay izi.
    'CeviriDuzeltmesi',
    'CeviriDuzeltmeOlayi',
    // Faz 6.12a (16.09): deneme kullanim kaydi — ucretsiz deneme bir kez.
    'DenemeKullanimi',
    // Faz 7 F1b (17.09): ekip daveti + firma denetim kaydi.
    'FirmaDavet',
    'FirmaOlayi',
    // Faz 7 F2b (20.09): iki adimli giris kurtarma kodlari.
    'MfaKurtarmaKodu',
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

  // ── Z2b (Faz 6.9 T2): firma düzeltmesinin tekilliği ÖZETTE ve gerçekten UNIQUE ──
  // Tekillik ham metinde olsaydı uzun şartname satırı btree tavanını patlatırdı;
  // UNIQUE olmasaydı aynı firma aynı metne iki karşılık yazabilirdi (okuma
  // hangisini seçeceğini bilemezdi). İndeks tanımı pg_indexes'ten okunur.
  const duzeltmeIndeksleri = (await db.query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('CeviriDuzeltmesi','CeviriDuzeltmeOlayi') ORDER BY indexname`,
  )).rows;
  const tekil = duzeltmeIndeksleri.find((r) => r.indexname === 'CeviriDuzeltmesi_firmaId_hedefDil_kaynakOzeti_key');
  check(
    'Z2b CeviriDuzeltmesi (firmaId, hedefDil, kaynakOzeti) indeksi UNIQUE ve ham kaynakMetin hiçbir indekste yok',
    !!tekil && /CREATE UNIQUE INDEX/.test(tekil.indexdef) && /\("firmaId", "hedefDil", "kaynakOzeti"\)/.test(tekil.indexdef) &&
      !duzeltmeIndeksleri.some((r) => r.indexdef.includes('"kaynakMetin"')),
    JSON.stringify(duzeltmeIndeksleri.map((r) => r.indexdef)),
  );
  check(
    'Z2b iki tabloda toplam 4 ikincil indeks (tekil + firma/güncellendi + olay firma/zaman + olay kullanıcı/zaman)',
    duzeltmeIndeksleri.filter((r) => !r.indexname.endsWith('_pkey')).length === 4,
    JSON.stringify(duzeltmeIndeksleri.map((r) => r.indexname)),
  );

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

  // ── Z3b (Faz 7 F2b): iki adimli giris kolonlari ────────────────────────
  // ⚠ Kolonlarin HEPSI nullable ya da varsayilanli: migration hicbir mevcut
  // hesabin girisini degistirmez (backfill YOK). `mfaZorunlu` varsayilani
  // `false` — deploy aninda hicbir firmada zorunluluk ACILMAZ.
  const userKolonlari = (
    await db.query<{ column_name: string; is_nullable: string; column_default: string | null }>(
      `SELECT column_name, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema='public' AND table_name='User'`,
    )
  ).rows;
  const userKolonAdlari = userKolonlari.map((r) => r.column_name);
  for (const k of [
    'mfaSirriSifreli',
    'mfaAcikAt',
    'mfaKaynagi',
    'mfaSonAdim',
    'mfaBekleyenSirSifreli',
    'mfaBekleyenAt',
    'mfaHataSayaci',
    'mfaKilitliAt',
  ]) {
    check(`Z3b User.${k} kolonu var`, userKolonAdlari.includes(k));
  }
  const mfaSayac = userKolonlari.find((r) => r.column_name === 'mfaHataSayaci');
  check(
    'Z3b User.mfaHataSayaci NOT NULL DEFAULT 0 (mevcut satirlar bos kalmaz)',
    mfaSayac?.is_nullable === 'NO' && String(mfaSayac?.column_default ?? '').startsWith('0'),
    JSON.stringify(mfaSayac),
  );
  const firmaMfa = (
    await db.query<{ column_name: string; is_nullable: string; column_default: string | null }>(
      `SELECT column_name, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema='public' AND table_name='Firma' AND column_name='mfaZorunlu'`,
    )
  ).rows[0];
  check(
    'Z3b Firma.mfaZorunlu var ve varsayilani false (deploy kimseyi zorlamaz)',
    !!firmaMfa && firmaMfa.is_nullable === 'NO' && /false/i.test(String(firmaMfa.column_default)),
    JSON.stringify(firmaMfa),
  );

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

  await k1DonmusOzelFiyat(db, klasorler);
  await denemeHakkiDoldurmasi(db, klasorler);

  await db.close();

  console.log(
    `\n${'='.repeat(64)}\nMIGRATION ZINCIRI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
  );
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// K) K1 DONMUS OZEL FIYAT TEMIZLIGI (tur 3 A4c, 14.09)
//    Onaylanan kosul ("havuza bagli VE customPrice = listPrice") kullanicinin
//    BILEREK yazdigi fiyati da siliyordu (PGlite olcumu: C = L = 150, havuz 100;
//    havuz guncellenip yeniden aktarilinca 150 → 120). Migration GUVENLI kosulu
//    uygular (L = kaynak havuz fiyati + ayni para birimi). Burada GERCEK
//    migration dosyasi fixture'a YENIDEN kosulur; geri alma blogu DOSYADAN
//    okunur — belgelenen geri alma ile sinanan AYNI metin.
// ═════════════════════════════════════════════════════════════════════════
async function k1DonmusOzelFiyat(db: PGlite, klasorler: string[]): Promise<void> {
  const klasor = klasorler.find((k) => k.includes('k1_donmus_ozel_fiyat'));
  check('K-OLCUT K1 migration zincirde', !!klasor, JSON.stringify(klasorler.slice(-2)));
  if (!klasor) return;
  const k1Sql = fs.readFileSync(path.join(MIGRATIONS, klasor, 'migration.sql'), 'utf8');
  const satirlar = k1Sql.split(/\r?\n/);
  const gaBas = satirlar.findIndex((l) => l.startsWith('-- GERI ALMA BASLANGIC'));
  const gaSon = satirlar.findIndex((l) => l.startsWith('-- GERI ALMA BITIS'));
  const geriAlmaSql = satirlar.slice(gaBas + 1, gaSon).map((l) => l.replace(/^-- ?/, '')).join('\n');
  check('K-OLCUT geri alma blogu dosyada (yorum icinde, elle kosulur)',
    gaBas >= 0 && gaSon > gaBas && /UPDATE "UserLibrary"/.test(geriAlmaSql), geriAlmaSql.slice(0, 80));

  await db.exec(`
    INSERT INTO "Firma" ("id","ad") VALUES ('k1f1','K1 Firma 1'), ('k1f2','K1 Firma 2');
    INSERT INTO "User" ("id","email","password","firmaId") VALUES ('k1u1','k1u1@x.com','h','k1f1'), ('k1u2','k1u2@x.com','h','k1f2');
    INSERT INTO "Brand" ("id","name","isGlobal") VALUES
      ('k1b-havuz','K1 HAVUZ VANA',true), ('k1b-kisisel','K1 KIRKE',false), ('k1b-ad','K1 HAVUZ AD',true), ('k1b-legacy','K1 LEGACY',true);
    INSERT INTO "PriceList" ("id","name","brandId","ownerUserId","ownerFirmaId") VALUES
      ('k1pl-havuz','HAVUZ VANA 2026','k1b-havuz',NULL,NULL),
      ('k1pl-kisisel','KIRKE — Manuel Liste','k1b-kisisel','k1u1','k1f1'),
      ('k1pl-eski-kisisel','KIRKE — sahiplik backfill almamis liste','k1b-kisisel',NULL,NULL),
      ('k1pl-ad','HAVUZ AD 2026','k1b-ad',NULL,NULL),
      ('k1pl-legacy','LEGACY 2026','k1b-legacy',NULL,NULL);
    INSERT INTO "Material" ("id","name") VALUES ('k1m-leg','K1 Legacy Vana 1"');
    INSERT INTO "MaterialPrice" ("id","materialId","brandId","priceListId","price","currency") VALUES ('k1mp-leg','k1m-leg','k1b-legacy','k1pl-legacy',500,'TRY');
  `);
  const pi = (id: string, pl: string, b: string, price: number, sahipU: string | null, sahipF: string | null, cur = 'TRY') =>
    db.query(`INSERT INTO "ProductIndex" ("id","brandId","priceListId","ownerUserId","ownerFirmaId","ad","price","currency","adSlug","adBucket","displayName","rowKey")
              VALUES ($1,$2,$3,$4,$5,'Küresel Vana',$6,$7,'vana','kuresel vana',$1,$1)`, [id, b, pl, sahipU, sahipF, price, cur]);
  for (const [id, price, cur] of [['k1pi-01', 100], ['k1pi-02', 120], ['k1pi-04', 200], ['k1pi-05', 300], ['k1pi-06', 400], ['k1pi-07', 100],
    ['k1pi-09', 100], ['k1pi-10', 120], ['k1pi-11', 10, 'USD'], ['k1pi-12', 100, 'USD'], ['k1pi-14', 0.1 + 0.2]] as [string, number, string?][]) {
    await pi(id, 'k1pl-havuz', 'k1b-havuz', price, null, null, cur ?? 'TRY');
  }
  await pi('k1pk-03', 'k1pl-kisisel', 'k1b-kisisel', 50, 'k1u1', 'k1f1');
  await pi('k1pe-11', 'k1pl-eski-kisisel', 'k1b-kisisel', 60, 'k1u1', 'k1f1');
  await pi('k1pa-18', 'k1pl-ad', 'k1b-ad', 80, null, null);
  const ul = (id: string, o: Record<string, any>) => db.query(
    `INSERT INTO "UserLibrary" ("id","userId","firmaId","brandId","productIndexId","sourcePriceListId","materialId","materialName","listPrice","customPrice","discountRate","currency")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$1,$8,$9,$10,$11)`,
    [id, o.u ?? 'k1u1', o.f ?? 'k1f1', o.b ?? 'k1b-havuz', o.pi ?? null, o.pl ?? null, o.m ?? null, o.l ?? null, o.c ?? null, o.d ?? null, o.cur ?? 'TRY']);
  await ul('R01-havuz-esit-donmus', { pi: 'k1pi-01', pl: 'k1pl-havuz', l: 100, c: 100 });
  await ul('R02-havuz-ayrismis', { pi: 'k1pi-02', pl: 'k1pl-havuz', l: 120, c: 100, d: 10 });
  await ul('R03-kullanici-satiri-esit', { b: 'k1b-kisisel', pi: 'k1pk-03', pl: 'k1pl-kisisel', l: 50, c: 50 });
  await ul('R04-havuz-esit-iskontolu', { pi: 'k1pi-04', pl: 'k1pl-havuz', l: 200, c: 200, d: 10 });
  await ul('R05-havuz-custom-null', { pi: 'k1pi-05', pl: 'k1pl-havuz', l: 300, c: null });
  await ul('R06-havuz-list-null', { pi: 'k1pi-06', pl: 'k1pl-havuz', l: null, c: 400 });
  await ul('R06b-havuz-ikisi-null', { pi: 'k1pi-06', pl: 'k1pl-havuz', l: null, c: null });
  await ul('R07-havuz-bilincli-fiyat', { pi: 'k1pi-07', pl: 'k1pl-havuz', l: 150, c: 150 });
  await ul('R08-legacy-havuz-esit', { b: 'k1b-legacy', m: 'k1m-leg', pl: 'k1pl-legacy', l: 500, c: 500, d: 5 });
  await ul('R09-yetim-esit', { l: 70, c: 70 });
  await ul('R10-manuel-create', { l: null, c: 99 });
  await ul('R11-eski-kisisel-liste-sahipsiz', { b: 'k1b-kisisel', pi: 'k1pe-11', pl: 'k1pl-eski-kisisel', l: 60, c: 60 });
  await ul('R12-havuz-custom-sifir', { pi: 'k1pi-09', pl: 'k1pl-havuz', l: 100, c: 0 });
  await ul('R13-havuz-donmus-aktarilmamis', { pi: 'k1pi-10', pl: 'k1pl-havuz', l: 100, c: 100 });
  await ul('R14-havuz-float', { pi: 'k1pi-14', pl: 'k1pl-havuz', l: 0.1 + 0.2, c: 0.1 + 0.2 });
  await ul('R15-f2-havuz-esit', { u: 'k1u2', f: 'k1f2', pi: 'k1pi-01', pl: 'k1pl-havuz', l: 100, c: 100 });
  await ul('R16-havuz-usd-esit', { pi: 'k1pi-11', pl: 'k1pl-havuz', l: 10, c: 10, cur: 'USD' });
  await ul('R17-havuz-pb-degismis', { pi: 'k1pi-12', pl: 'k1pl-havuz', l: 100, c: 100, cur: 'TRY' });
  await ul('R18-havuz-yalniz-ad-donmus', { b: 'k1b-ad', pi: 'k1pa-18', pl: 'k1pl-ad', l: 80, c: 80 });
  // Ayni tutar FARKLI double: ekranin 0,30'u iki ayri yoldan dogmus (0,3 ile 0,1 + 0,2) — '=' esit saymaz.
  await ul('R19-havuz-float-karisik', { pi: 'k1pi-14', pl: 'k1pl-havuz', l: 0.1 + 0.2, c: 0.3 });

  type Gorunum = { ekran: number; taban: number; c: number | null; l: number | null; isk: number };
  /** Ekran (library.service sheetItemOf: customPrice ?? listPrice) + eslestirme tabani (C > 0 ise C, degilse L). */
  const gorunum = async (): Promise<Map<string, Gorunum>> => new Map((await db.query<any>(`
    SELECT ul.id, COALESCE(ul."customPrice", ul."listPrice", 0) AS ekran,
           CASE WHEN ul."customPrice" IS NOT NULL AND ul."customPrice" > 0 THEN ul."customPrice" ELSE COALESCE(ul."listPrice", pi.price, 0) END AS taban,
           ul."customPrice" AS c, ul."listPrice" AS l, COALESCE(ul."discountRate", 0) AS isk
      FROM "UserLibrary" ul LEFT JOIN "ProductIndex" pi ON pi.id = ul."productIndexId"
     WHERE ul.id LIKE 'R%'`)).rows.map((r: any) => [r.id, { ekran: Number(r.ekran), taban: Number(r.taban), c: r.c, l: r.l, isk: Number(r.isk) }]));
  const tablolar = async () => {
    const out: Record<string, Map<string, string>> = {};
    for (const t of ['UserLibrary', 'ProductIndex', 'PriceList', 'MaterialPrice', 'Brand']) {
      out[t] = new Map((await db.query<any>(`SELECT * FROM "${t}" ORDER BY id`)).rows.map((r: any) => [r.id, JSON.stringify(r)]));
    }
    return out;
  };

  const GUVENLI = ['R01-havuz-esit-donmus', 'R04-havuz-esit-iskontolu', 'R08-legacy-havuz-esit', 'R14-havuz-float',
    'R15-f2-havuz-esit', 'R16-havuz-usd-esit', 'R18-havuz-yalniz-ad-donmus', 'R19-havuz-float-karisik'];
  const DOKUNULMAZ = ['R02-havuz-ayrismis', 'R03-kullanici-satiri-esit', 'R05-havuz-custom-null', 'R06-havuz-list-null',
    'R06b-havuz-ikisi-null', 'R07-havuz-bilincli-fiyat', 'R09-yetim-esit', 'R10-manuel-create', 'R11-eski-kisisel-liste-sahipsiz',
    'R12-havuz-custom-sifir', 'R13-havuz-donmus-aktarilmamis', 'R17-havuz-pb-degismis'];

  const once = await gorunum();
  const onceT = await tablolar();
  await db.exec(k1Sql);
  const sonra = await gorunum();
  const sonraT = await tablolar();

  check('K1 GUVENLI kume temizlendi: donmus havuz satirlari (legacy, float, 2. firma, USD, yalniz-ad dahil) customPrice NULL',
    GUVENLI.every((id) => sonra.get(id)?.c === null), GUVENLI.filter((id) => sonra.get(id)?.c !== null).join(','));
  check('K2 ★ BILINCLI fiyat korunur: R07 (C = L = 150, havuz 100) — onaylanan kosul bunu silerdi',
    sonra.get('R07-havuz-bilincli-fiyat')?.c === 150, String(sonra.get('R07-havuz-bilincli-fiyat')?.c));
  check('K3 dokunulmayanlar ayni: ayrismis, null, sifir, aktarilmamis (L ≠ havuz), para birimi degismis, kisisel, eski-kisisel, yetim, create',
    DOKUNULMAZ.every((id) => sonra.get(id)?.c === once.get(id)?.c),
    DOKUNULMAZ.filter((id) => sonra.get(id)?.c !== once.get(id)?.c).map((id) => `${id}:${once.get(id)?.c}→${sonra.get(id)?.c}`).join(' '));
  // Karsilastirma 1e-9 toleransla: R19'da C = 0,3 ve L = 0,1 + 0,2 AYNI tutarin iki
  // double'i (fark 5e-17, ekranda ikisi de "0,30") — tutar degismez, bit degisir.
  const ayni = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  check('K4 temizlik ANINDA ekran (C ?? L) ve eslestirme tabani hicbir satirda degismedi (float ikizi R19 dahil)',
    [...once.keys()].every((id) => ayni(once.get(id)!.ekran, sonra.get(id)!.ekran) && ayni(once.get(id)!.taban, sonra.get(id)!.taban)),
    [...once.keys()].filter((id) => !ayni(once.get(id)!.ekran, sonra.get(id)!.ekran) || !ayni(once.get(id)!.taban, sonra.get(id)!.taban)).join(','));
  {
    // Ekrandaki isaret (library-sheet-builder `havuzFiyatAyrisimi`) = migration'in "ayrismis" sayimi — AYNI satirlar.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { havuzFiyatAyrisimi } = require('../src/ozellik/kutuphane/library/library-sheet-builder');
    const satirlar = (await db.query<any>(`
      SELECT ul.id, ul."customPrice", ul."listPrice", ul."productIndexId", ul."sourcePriceListId",
             pl."ownerUserId" AS pl_u, pl."ownerFirmaId" AS pl_f, pi."ownerUserId" AS pi_u, pi."ownerFirmaId" AS pi_f
        FROM "UserLibrary" ul
        LEFT JOIN "PriceList" pl ON pl.id = ul."sourcePriceListId"
        LEFT JOIN "ProductIndex" pi ON pi.id = ul."productIndexId"
       WHERE ul.id LIKE 'R%' ORDER BY ul.id`)).rows;
    const ekranIsaretli = satirlar.filter((r: any) => havuzFiyatAyrisimi({
      customPrice: r.customPrice, listPrice: r.listPrice, productIndexId: r.productIndexId,
      sourcePriceList: r.sourcePriceListId ? { ownerUserId: r.pl_u, ownerFirmaId: r.pl_f } : null,
      product: r.productIndexId ? { ownerUserId: r.pi_u, ownerFirmaId: r.pi_f } : null,
    }) !== null).map((r: any) => r.id);
    const sqlAyrismis = (await db.query<any>(`
      SELECT ul.id FROM "UserLibrary" ul
        JOIN "PriceList" pl ON pl.id = ul."sourcePriceListId"
        LEFT JOIN "ProductIndex" pi ON pi.id = ul."productIndexId"
       WHERE ul.id LIKE 'R%' AND pl."ownerUserId" IS NULL AND pl."ownerFirmaId" IS NULL
         AND (ul."productIndexId" IS NULL OR (pi."ownerUserId" IS NULL AND pi."ownerFirmaId" IS NULL))
         AND ul."customPrice" IS NOT NULL AND ul."listPrice" IS NOT NULL
         AND NOT (abs(ul."customPrice" - ul."listPrice") < 0.000001)
       ORDER BY ul.id`)).rows.map((r: any) => r.id);
    check('K4b ekran isareti (havuzFiyatAyrisimi) = migration "ayrismis" kumesi: R02 + R12 — tanim tek',
      ekranIsaretli.join(',') === sqlAyrismis.join(',') && sqlAyrismis.join(',') === 'R02-havuz-ayrismis,R12-havuz-custom-sifir',
      `ekran=${ekranIsaretli.join(',')} sql=${sqlAyrismis.join(',')}`);
  }
  const farklar: string[] = [];
  for (const t of Object.keys(onceT)) {
    for (const [id, s] of sonraT[t]) {
      if (onceT[t].get(id) === s) continue;
      const o = JSON.parse(onceT[t].get(id) ?? '{}'); const n = JSON.parse(s);
      farklar.push(`${t}.${id}:${Object.keys(n).filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k])).join('+')}`);
    }
    if (onceT[t].size !== sonraT[t].size) farklar.push(`${t}: satir sayisi ${onceT[t].size}→${sonraT[t].size}`);
  }
  check(`K5 tam tablo farki: 5 tabloda YALNIZ beklenen ${GUVENLI.length} satirin YALNIZ customPrice alani degisti`,
    farklar.length === GUVENLI.length && GUVENLI.every((id) => farklar.includes(`UserLibrary.${id}:customPrice`)), farklar.join(' | '));
  const yedek = (await db.query<any>(`SELECT "userLibraryId" AS id, "eskiCustomPrice" AS eski, "kaynakFiyat" AS kaynak FROM "KutuphaneOzelFiyatYedegi" WHERE "userLibraryId" LIKE 'R%' ORDER BY 1`)).rows;
  check(`K6 yedek: ${GUVENLI.length} satir, eski ozel fiyat = kaynak havuz fiyati; iskonto satirda kalir (R04 %10)`,
    yedek.length === GUVENLI.length && yedek.every((y: any) => Math.abs(Number(y.eski) - Number(y.kaynak)) < 1e-6) && sonra.get('R04-havuz-esit-iskontolu')?.isk === 10,
    JSON.stringify(yedek));

  await db.exec(k1Sql);
  const ikinciT = await tablolar();
  const yedek2 = (await db.query<any>(`SELECT count(*)::int AS n FROM "KutuphaneOzelFiyatYedegi" WHERE "userLibraryId" LIKE 'R%'`)).rows[0].n;
  check('K7 IDEMPOTENT: ikinci kosum kutuphane satirlarini ve yedegi degistirmez',
    yedek2 === GUVENLI.length && [...ikinciT.UserLibrary].every(([id, s]) => sonraT.UserLibrary.get(id) === s), `yedek=${yedek2}`);

  // Havuz ×1,2 guncellenip yeniden aktarilir (importFromIndex listPrice yazar, customPrice'a dokunmaz)
  await db.exec(`
    UPDATE "ProductIndex" SET price = round((price * 1.2)::numeric, 2)::float8 WHERE "ownerUserId" IS NULL AND id LIKE 'k1%';
    UPDATE "UserLibrary" ul SET "listPrice" = pi.price FROM "ProductIndex" pi, "PriceList" pl
     WHERE pi.id = ul."productIndexId" AND pl.id = ul."sourcePriceListId" AND pl."ownerUserId" IS NULL AND ul.id LIKE 'R%';`);
  const aktarim = await gorunum();
  check('K8 ★ havuz ×1,2 + yeniden aktarim: donmus satir havuzu izler (R01 120), bilincli fiyat kalir (R07 150)',
    aktarim.get('R01-havuz-esit-donmus')?.ekran === 120 && aktarim.get('R07-havuz-bilincli-fiyat')?.ekran === 150,
    `R01=${aktarim.get('R01-havuz-esit-donmus')?.ekran} R07=${aktarim.get('R07-havuz-bilincli-fiyat')?.ekran}`);

  // Temizlikten SONRA kullanici R01'e 111 yazdi; geri alma onu ezmemeli.
  await db.exec(`UPDATE "UserLibrary" SET "customPrice" = 111 WHERE id = 'R01-havuz-esit-donmus'`);
  await db.exec(geriAlmaSql);
  const geri = await gorunum();
  const donen = GUVENLI.filter((id) => id !== 'R01-havuz-esit-donmus');
  check('K9 geri alma (dosyadaki blok): temizlenen satirlar eski ozel fiyatina doner, sonradan girilen R01 = 111 EZILMEZ',
    donen.every((id) => once.get(id)?.c !== null && Math.abs(Number(geri.get(id)?.c) - Number(once.get(id)?.c)) < 1e-9)
      && geri.get('R01-havuz-esit-donmus')?.c === 111,
    donen.map((id) => `${id}:${geri.get(id)?.c}/${once.get(id)?.c}`).join(' ') + ` R01=${geri.get('R01-havuz-esit-donmus')?.c}`);
}

// ═════════════════════════════════════════════════════════════════════════
// D) DENEME HAKKI GERIYE DONUK DOLDURMA (Faz 6.12a, 16.09)
//    Zincir BOS veritabaninda kostu (doldurma hicbir satira dokunmadi). Soz
//    VERIYLE sinanir: gecmis niyetler + kapatilmis hesap + miras firma kurulur,
//    doldurma blogu DOSYADAN okunup yeniden kosulur. Ayrica SQL normalizesi
//    ile uygulamanin JS normalizesi (deneme-hakki.ts) AYNI ornek kumede
//    karsilastirilir: ikisi ayrisirsa gecmis deneme kaydi calisma anindaki
//    anahtarla ESLESMEZ ve acik gecmis musteriler icin sessizce acik kalir.
// ═════════════════════════════════════════════════════════════════════════
async function denemeHakkiDoldurmasi(db: PGlite, klasorler: string[]): Promise<void> {
  const { denemeEpostaAnahtari, telefonAnahtari } = await import(
    '../src/ozellik/odeme/abonelik/deneme-hakki'
  );
  console.log('\n── D · DENEME HAKKI GERIYE DONUK DOLDURMA ──');
  const klasor = klasorler.find((k) => k.includes('deneme_hakki'));
  check('D-OLCUT 6.12a migration zincirde', !!klasor, JSON.stringify(klasorler.slice(-2)));
  if (!klasor) return;
  const tamSql = fs.readFileSync(path.join(MIGRATIONS, klasor, 'migration.sql'), 'utf8');
  const ayrac = '-- ═══ GERIYE DONUK DOLDURMA (6.12a)';
  check('D-OLCUT doldurma blogu dosyada bulundu', tamSql.includes(ayrac));
  const doldurma = tamSql.slice(tamSql.indexOf(ayrac));

  const bos = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "DenemeKullanimi"`);
  check('D0 bos zincirde doldurma HATASIZ kostu ve kayit URETMEDI (sozun bos DB yolu)',
    Number(bos.rows[0].n) === 0, `kayit=${bos.rows[0].n}`);

  // Normalize ornekleri: kenar durumlar BILEREK (bos yerel kisim, '@' yok,
  // alan gmail degil ama nokta var, harfli alan, Turkce harf, bosluk).
  const epostaOrnekleri = [
    'Ali.Veli+Deneme@GoogleMail.com', 'ILKER@Firma.com.TR', '  bosluk@ornek.com ',
    '+etiket@ornek.com', 'nokta.li@firma.com', 'a+b+c@gmail.com', 'Çağrı@örnek.com',
    'isaretyok.ornek.com', '@alanyok.com', 'sonda@', 'X.Y@GMAIL.COM', '.@gmail.com',
  ];
  const telefonOrnekleri = [
    '0533 098 36 63', '12345', '+90 (533) 098-36-63', '905330983663', null, '0090 533 0983663',
    '0533 098 36 63', '5330983663', '', '(0212) 555 44 33', 'x', '+1 415 555 0100',
  ];
  const ornekDegerleri = epostaOrnekleri.map((e, i) =>
    `('dhP${i}', 'dhP${i}', ${telefonOrnekleri[i] === null ? 'NULL' : `'${telefonOrnekleri[i]}'`})`).join(',\n        ');
  const ornekKullanicilar = epostaOrnekleri.map((e, i) =>
    `('dhPU${i}', '${e.replace(/'/g, "''")}', 'h', 'dhP${i}')`).join(',\n        ');
  const ornekNiyetler = epostaOrnekleri.map((_, i) =>
    `('dhPN${i}', 't-dhPN${i}', 'dhP${i}', 'dh-s30', 'dhPU${i}', 'TAMAMLANDI', now())`).join(',\n        ');

  await db.exec(`
    INSERT INTO "Paket" ("id","kod","ad","kapsam","seviye","sira") VALUES
      ('dh-p', 'dh-pro', 'DH Pro', 'mechanical', 'pro', 1),
      ('dh-pm', 'miras-dh', 'DH Miras', 'mep', 'pro', 2);
    INSERT INTO "PaketSurumu" ("id","paketId","surumNo","iyzicoPlanKodu","iyzicoUrunKodu","tutar","denemeGunu") VALUES
      ('dh-s30', 'dh-p', 1, 'dh-plan-30', 'dh-urun', 1649.00, 30),
      ('dh-s0', 'dh-p', 2, 'dh-plan-0', 'dh-urun', 1649.00, 0),
      ('dh-sm', 'dh-pm', 1, 'dh-plan-m', 'dh-urun-m', 0, 0);
    INSERT INTO "Firma" ("id","ad","telefon") VALUES
      ('dhF1', 'DH1', '0533 098 36 63'), ('dhF2', 'DH2', NULL), ('dhF3', 'DH3', '0212 555 44 33'),
      ('dhF4', 'DH4', NULL), ('dhF5', 'DH5', NULL), ('dhF6', 'DH6', NULL),
      ${ornekDegerleri};
    INSERT INTO "User" ("id","email","password","firmaId","kapatilanEposta") VALUES
      ('dhU1', 'ALI.veli+X@googlemail.com', 'h', 'dhF1', NULL),
      ('dhU2', 'kapali-dhU2@metapricex.invalid', 'h', 'dhF2', 'Kapali.Kisi@Ornek.COM'),
      ('dhU3', 'bekleyen@ornek.com', 'h', 'dhF3', NULL),
      ('dhU4', 'denemesiz@ornek.com', 'h', 'dhF4', NULL),
      ('dhU5', 'miras@ornek.com', 'h', 'dhF5', NULL);
    INSERT INTO "User" ("id","email","password","firmaId") VALUES
      ${ornekKullanicilar};
    INSERT INTO "Abonelik" ("id","firmaId","paketSurumuId","durum","erisimSonu","iyzicoMusteriKodu","guncellendi") VALUES
      ('dhA1', 'dhF1', 'dh-s30', 'AKTIF', now() + interval '10 days', 'CUS-1', now()),
      ('dhA5', 'dhF5', 'dh-sm', 'AKTIF', now() + interval '300 days', NULL, now()),
      ('dhA6', 'dhF6', 'dh-s30', 'AKTIF', now() + interval '10 days', NULL, now());
    INSERT INTO "AbonelikBaslatma" ("id","token","firmaId","paketSurumuId","olusturanId","durum","sonuclandi") VALUES
      ('dhN1', 't-dhN1', 'dhF1', 'dh-s30', 'dhU1', 'TAMAMLANDI', now() - interval '40 days'),
      ('dhN2', 't-dhN2', 'dhF2', 'dh-s30', 'dhU2', 'TAMAMLANDI', now() - interval '20 days'),
      ('dhN3', 't-dhN3', 'dhF3', 'dh-s30', 'dhU3', 'BEKLIYOR', NULL),
      ('dhN4', 't-dhN4', 'dhF4', 'dh-s0', 'dhU4', 'TAMAMLANDI', now() - interval '5 days');
    INSERT INTO "AbonelikBaslatma" ("id","token","firmaId","paketSurumuId","olusturanId","durum","sonuclandi") VALUES
      ${ornekNiyetler};
  `);

  await db.exec(doldurma);

  const niyet = async (id: string) =>
    (await db.query<any>(`SELECT * FROM "AbonelikBaslatma" WHERE id = $1`, [id])).rows[0];
  const kayitlar = async () =>
    (await db.query<any>(`SELECT * FROM "DenemeKullanimi" WHERE "firmaId" LIKE 'dhF%' ORDER BY "firmaId"`)).rows;

  const n1 = await niyet('dhN1');
  check('D1 eski TAMAMLANDI niyet: deneme gunu ve plan SURUMDEN, anahtarlar normalize',
    n1.denemeGunu === 30 && n1.planKodu === 'dh-plan-30' && n1.epostaNormal === 'aliveli@gmail.com' &&
      n1.telefonNormal === '5330983663' && n1.formEpostaNormal === null, JSON.stringify(n1));
  const n2 = await niyet('dhN2');
  check('D2 ⭐ kapatilmis hesap: anahtar ANONIM adresten DEGIL kapatilanEposta\'dan (yol C gecmisi)',
    n2.epostaNormal === 'kapali.kisi@ornek.com', `epostaNormal=${n2.epostaNormal}`);
  const n3 = await niyet('dhN3');
  check('D3 BEKLIYOR niyet: karar surumden dondu (sonuclanirsa deneme kaydi yazilabilsin)',
    n3.denemeGunu === 30 && n3.telefonNormal === '2125554433', JSON.stringify(n3));
  const n4 = await niyet('dhN4');
  check('D4 denemesiz surumdeki niyet: deneme gunu 0', n4.denemeGunu === 0, JSON.stringify(n4));

  const k = await kayitlar();
  const kayit = (firma: string) => k.filter((r) => r.firmaId === firma);
  check('D5 ⭐ kayit yalniz DENEME ALMIS (TAMAMLANDI + deneme > 0) niyetlere + miras firmaya: F1, F2, F5 ve 12 ornek',
    kayit('dhF1').length === 1 && kayit('dhF2').length === 1 && kayit('dhF3').length === 0 &&
      kayit('dhF4').length === 0 && kayit('dhF5').length === 1 && kayit('dhF6').length === 0,
    k.map((r) => `${r.firmaId}:${r.kaynak}`).join(' '));
  const f1 = kayit('dhF1')[0] ?? {};
  check('D5 F1 kaydi: geriye-donuk · niyet · kisi · normalize e-posta/telefon · iyzico musteri no',
    f1.kaynak === 'geriye-donuk' && f1.abonelikBaslatmaId === 'dhN1' && f1.kullaniciId === 'dhU1' &&
      f1.epostaNormal === 'aliveli@gmail.com' && f1.telefonNormal === '5330983663' && f1.iyzicoMusteriKodu === 'CUS-1',
    JSON.stringify(f1));
  const f5 = kayit('dhF5')[0] ?? {};
  check('D5 ⭐ miras firma: kaynak miras, YALNIZ firma anahtari (kisi anahtari yok)',
    f5.kaynak === 'miras' && f5.kullaniciId === null && f5.epostaNormal === null && f5.telefonNormal === null,
    JSON.stringify(f5));

  // D6 — IDEMPOTENT: ikinci kosum hicbir satiri degistirmez.
  const oncekiDokum = JSON.stringify(await kayitlar()) + JSON.stringify(await niyet('dhN1'));
  const oncekiSayi = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "DenemeKullanimi"`)).rows[0].n;
  await db.exec(doldurma);
  const sonrakiSayi = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "DenemeKullanimi"`)).rows[0].n;
  check('D6 IDEMPOTENT: ikinci kosumda kayit sayisi ve icerik AYNI',
    Number(oncekiSayi) === Number(sonrakiSayi) &&
      JSON.stringify(await kayitlar()) + JSON.stringify(await niyet('dhN1')) === oncekiDokum,
    `once=${oncekiSayi} sonra=${sonrakiSayi}`);

  // D7 — SQL ↔ JS normalize ESITLIGI (tek kural, iki yazim).
  const farklar: string[] = [];
  for (let i = 0; i < epostaOrnekleri.length; i++) {
    const r = await niyet(`dhPN${i}`);
    const jsE = denemeEpostaAnahtari(epostaOrnekleri[i]);
    const jsT = telefonAnahtari(telefonOrnekleri[i]);
    if (r.epostaNormal !== jsE) farklar.push(`e-posta ${JSON.stringify(epostaOrnekleri[i])}: sql=${r.epostaNormal} js=${jsE}`);
    if (r.telefonNormal !== jsT) farklar.push(`telefon ${JSON.stringify(telefonOrnekleri[i])}: sql=${r.telefonNormal} js=${jsT}`);
  }
  check('D7-OLCUT ornek kumede null DA normalize de var (bos kume yesili yok)',
    epostaOrnekleri.some((e) => denemeEpostaAnahtari(e) === null) &&
      epostaOrnekleri.some((e) => denemeEpostaAnahtari(e) !== null) &&
      telefonOrnekleri.some((t) => telefonAnahtari(t) === null));
  check(`D7 ⭐ ${epostaOrnekleri.length} e-posta + ${telefonOrnekleri.length} telefon orneginde SQL doldurmasi = JS anahtari`,
    farklar.length === 0, farklar.join(' | '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
