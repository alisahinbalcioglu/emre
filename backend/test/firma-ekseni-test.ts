/**
 * FIRMA EKSENI TURU — G7/G8  (`npm run test:firma-ekseni`)
 *
 * DB GEREKTIRMEZ. SAHTE PRISMA CASUSU ile gercekte Prisma'ya giden `where`
 * nesnesi yakalanir ve EKSENI olculur.
 *
 * ── BU DOSYA NEDEN VAR: TSC YESILI KANIT DEGIL ──────────────────────────
 * G7/G8 gocurmesi sirasinda `tsc --noEmit` TEMIZ verdi, ama 13 cagri hala
 * `user.id` (string) geciriyordu. Sebep: controller'larda
 * `@CurrentUser() user: any` var ve `any` TIP KAPISINI DEVRE DISI BIRAKIR —
 * `user.id` de `any` oldugu icin `Kimlik` bekleyen parametreye SESSIZCE
 * uyuyordu.
 *
 * Calisma anindaki sonucu: `k.firmaId` bir string uzerinde `undefined`
 * olurdu ve Prisma'da `where: { firmaId: undefined }` kosulu SESSIZCE
 * DUSER (kimlik.ts:16-24 bunu ayrica uyariyor) → HER FIRMANIN iscilik
 * firmalari donerdi. Yani gocurme, duzeltmeye calistigi seyden daha buyuk
 * bir capraz-tenant sizintisi acabilirdi ve tsc bunu GORMEZDI.
 *
 * Bu paket o deligi kapatir: tipe degil, PRISMA'YA GIDEN GERCEK SORGUYA
 * bakar.
 *
 *   G7  LaborFirm FIRMAYA ait olmali. `create` firmaId YAZMIYORDU: ADIM 1
 *       backfill'i mevcut satirlari doldurmustu ama yazma yolu
 *       guncellenmedigi icin DEPLOY SONRASI acilan her iscilik firmasi
 *       firmaId=NULL kaliyordu; quotes.service:194 `f.firmaId === k.firmaId`
 *       karsilastirdigi icin kullanici KENDI firmasini "baskasinin firmasi"
 *       uyarisiyla goruyordu.
 *
 *   G8  Eslestirme aday havuzu (UserLibrary) hala `userId` ile suzuluyordu.
 *       UserLibrary ADIM 1'de firmaya gecmisti; asimetri bugun gorunmuyor
 *       cunku her firmada tek uye var, ama davet akisi acilinca AYNI
 *       FIRMANIN ikinci uyesi teklif ekraninda BOS HAVUZ gorurdu.
 *
 * ── ISIM CAKISMASI (bu turun en buyuk tuzagi) ───────────────────────────
 * `matching.service` ve `labor-firms.service` icinde `firmaId` ISCILIK
 * FIRMASI (LaborFirm) anlaminda da kullaniliyor. Kiraci firma DAIMA
 * `k.firmaId`dir. C* bloklari bu ayrimin korundugunu olcer — iscilik
 * havuzunun yanlislikla kiraci firmaya gore suzulmedigini de sinar.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import 'reflect-metadata';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { LaborFirmsService } from '../src/ozellik/kutuphane/labor-firms/labor-firms.service';
import { Kimlik } from '../src/altyapi/auth/kimlik';

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

const K: Kimlik = { userId: 'KISI-1', firmaId: 'FIRMA-A' };

/** Prisma casusu: cagrilan metot + gecen argumani kaydeder. */
function casus() {
  const cagrilar: Array<{ model: string; metot: string; arg: any }> = [];
  const yakala = (model: string) =>
    new Proxy(
      {},
      {
        get: (_t, metot: string) => (arg: any) => {
          cagrilar.push({ model, metot, arg });
          if (metot === 'findMany') return Promise.resolve([]);
          if (metot === 'count') return Promise.resolve(0);
          if (metot === 'findFirst' || metot === 'findUnique')
            return Promise.resolve(null);
          if (metot === 'create') return Promise.resolve({ id: 'YENI' });
          return Promise.resolve(null);
        },
      },
    );
  const prisma: any = new Proxy(
    {},
    { get: (_t, model: string) => yakala(model) },
  );
  return { prisma, cagrilar };
}

const bul = (cagrilar: any[], model: string, metot: string) =>
  cagrilar.find((c) => c.model === model && c.metot === metot);

// ═══════════════════════════════════════════════════════════════════════════
async function g8_havuz() {
  console.log('\n── G8 · ESLESTIRME HAVUZU ──');
  const { prisma, cagrilar } = casus();
  const servis = new MatchingService(
    prisma,
    { loadAliases: async () => [] } as any,
    { cevir: async (x: any) => x } as any,
  );

  await servis.bulkMatch(K, 'MARKA-1', ['boru']).catch(() => undefined);

  const c = bul(cagrilar, 'userLibrary', 'findMany');
  // OLCUT: casus gercekten yakaladi mi?
  check(
    'G8-OLCUT havuz sorgusu yakalandi (userLibrary.findMany cagrildi)',
    !!c,
    `cagrilar=${JSON.stringify(cagrilar.map((x) => `${x.model}.${x.metot}`))}`,
  );
  if (!c) return;

  const where = c.arg?.where ?? {};
  check(
    'G8-a havuz FIRMA ekseninde suzuluyor (where.firmaId dolu)',
    where.firmaId === 'FIRMA-A',
    `where=${JSON.stringify(where)}`,
  );
  check(
    'G8-b havuzda userId suzgeci KALMADI (ikinci uye bos havuz gormez)',
    where.userId === undefined,
    `where=${JSON.stringify(where)}`,
  );
  // ★ SESSIZ DUSME KAPISI: firmaId ASLA undefined gitmemeli.
  check(
    'G8-★ where.firmaId undefined DEGIL (Prisma sessizce dusurmez)',
    'firmaId' in where && where.firmaId !== undefined,
    `where=${JSON.stringify(where)}`,
  );
  check(
    'G8-c marka suzgeci korundu (kapsam genislemedi)',
    where.brandId === 'MARKA-1',
    `where=${JSON.stringify(where)}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
async function g8_indexHealth() {
  console.log('\n── G8 · INDEKS ROZETI ──');
  const { prisma, cagrilar } = casus();
  const servis = new MatchingService(
    prisma,
    { loadAliases: async () => [] } as any,
    { cevir: async (x: any) => x } as any,
  );
  await servis.indexHealth(K).catch(() => undefined);

  const sayimlar = cagrilar.filter(
    (c) => c.model === 'userLibrary' && c.metot === 'count',
  );
  check('G8-OLCUT rozet sorgulari yakalandi (2 count)', sayimlar.length === 2,
    `adet=${sayimlar.length}`);
  check(
    'G8-d rozet de FIRMA ekseninde (havuzla ayni eksen)',
    sayimlar.every((c) => c.arg?.where?.firmaId === 'FIRMA-A'),
    JSON.stringify(sayimlar.map((c) => c.arg?.where)),
  );
  check(
    'G8-e rozette userId suzgeci KALMADI',
    sayimlar.every((c) => c.arg?.where?.userId === undefined),
    JSON.stringify(sayimlar.map((c) => c.arg?.where)),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
async function g7_iscilikFirmasi() {
  console.log('\n── G7 · ISCILIK FIRMASI ──');
  const { prisma, cagrilar } = casus();
  const servis = new LaborFirmsService(prisma, {} as any);

  // ── create: firmaId YAZILMALI (asil kusur) ─────────────────────────
  await servis
    .create(K, { name: 'ACME', discipline: 'mechanical' } as any)
    .catch(() => undefined);

  const olustur = bul(cagrilar, 'laborFirm', 'create');
  check(
    'G7-OLCUT create sorgusu yakalandi',
    !!olustur,
    `cagrilar=${JSON.stringify(cagrilar.map((x) => `${x.model}.${x.metot}`))}`,
  );
  if (olustur) {
    const data = olustur.arg?.data ?? {};
    check(
      'G7-a create firmaId YAZIYOR (asil kusur — yeni firmalar oksuz kalmaz)',
      data.firmaId === 'FIRMA-A',
      `data=${JSON.stringify(data)}`,
    );
    check(
      'G7-b create userId de yaziyor (YAZAR bilgisi korundu)',
      data.userId === 'KISI-1',
      `data=${JSON.stringify(data)}`,
    );
  }

  // Tekillik kontrolu de firma bazli olmali
  const tekillik = bul(cagrilar, 'laborFirm', 'findFirst');
  if (tekillik) {
    check(
      'G7-c ayni-isim kontrolu FIRMA bazli (iki uye ayni firmayi iki kez acamaz)',
      tekillik.arg?.where?.firmaId === 'FIRMA-A' &&
        tekillik.arg?.where?.userId === undefined,
      `where=${JSON.stringify(tekillik.arg?.where)}`,
    );
  } else {
    check('G7-OLCUT tekillik sorgusu yakalandi', false, 'findFirst cagrilmadi');
  }

  // ── findAll: liste FIRMANIN ────────────────────────────────────────
  const { prisma: p2, cagrilar: c2 } = casus();
  const servis2 = new LaborFirmsService(p2, {} as any);
  await servis2.findAll(K).catch(() => undefined);
  const liste = bul(c2, 'laborFirm', 'findMany');
  check('G7-OLCUT liste sorgusu yakalandi', !!liste);
  if (liste) {
    check(
      'G7-d liste FIRMA ekseninde (uyeler ayni firmalari gorur)',
      liste.arg?.where?.firmaId === 'FIRMA-A',
      `where=${JSON.stringify(liste.arg?.where)}`,
    );
    check(
      'G7-e listede userId suzgeci KALMADI',
      liste.arg?.where?.userId === undefined,
      `where=${JSON.stringify(liste.arg?.where)}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  C — ISIM CAKISMASI KALKANI
// ═══════════════════════════════════════════════════════════════════════════
async function c_isimCakismasi() {
  console.log('\n── C · ISIM CAKISMASI KALKANI ──');
  const { prisma, cagrilar } = casus();
  const servis = new MatchingService(
    prisma,
    { loadAliases: async () => [] } as any,
    { cevir: async (x: any) => x } as any,
  );

  // ISCILIK havuzu: LaborPrice, ISCILIK FIRMASININ id'siyle suzulmeli —
  // KIRACI firmayla DEGIL. Ikisi karisirsa iscilik fiyatlari hic bulunmaz.
  await servis
    .bulkMatchLabor(K, 'ISCILIK-FIRMA-9', ['kaynak'])
    .catch(() => undefined);

  const c = bul(cagrilar, 'laborPrice', 'findMany');
  check(
    'C-OLCUT iscilik havuz sorgusu yakalandi',
    !!c,
    `cagrilar=${JSON.stringify(cagrilar.map((x) => `${x.model}.${x.metot}`))}`,
  );
  if (c) {
    check(
      'C1 ★KALKAN iscilik havuzu ISCILIK FIRMASI ile suzuluyor (kiraci firma DEGIL)',
      c.arg?.where?.firmaId === 'ISCILIK-FIRMA-9',
      `where=${JSON.stringify(c.arg?.where)} — kiraci firma sizmis olabilir`,
    );
    check(
      'C2 ★KALKAN kiraci firma iscilik havuzuna SIZMADI',
      c.arg?.where?.firmaId !== 'FIRMA-A',
      `where=${JSON.stringify(c.arg?.where)}`,
    );
  }
}

async function main() {
  await g8_havuz();
  await g8_indexHealth();
  await g7_iscilikFirmasi();
  await c_isimCakismasi();

  console.log(
    `\n${'='.repeat(64)}\nFIRMA EKSENI (G7/G8): ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
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
