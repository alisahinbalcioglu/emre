/**
 * 30 GUN ICINDE GERI DONUS  (`npm run test:geri-donus`)  · PLAN 5.8 §4
 *
 * AG/DB GEREKTIRMEZ. Saf yuklemler DB'siz; servisler (`OturumServisi`,
 * `AuthService`, `ParolaServisi`, `JwtStrategy`, `JwtAuthGuard`,
 * `ErisimServisi`) GERCEK siniflardir ve kucuk bir bellek-Prisma uzerinde
 * kosar. Kapi kararlari GERCEK controller metadata'siyla olculur (Reflector
 * + gercek handler referanslari) — "403 donuyor" iddiasi taklit edilmis bir
 * dekorator uzerinde degil, `quotes`/`library`/`quote-formats`/`ai`
 * uclarinin KENDI metadata'si uzerinde sinanir.
 *
 * ── NEDEN ────────────────────────────────────────────────────────────────
 * Emre'nin K1 karari: kapanan hesabin e-postasi 30 gun hesapta kalir,
 * musteri ayni adres/parolayla girip PAKET SATIN ALARAK geri doner. Bu,
 * bugune kadar "kapali = her kapi kapali" olan uc kapiyi gevsetiyor
 * (`hesapKapisi`, `jwt.strategy`, parola sifirlama) ve gevseyen her kapi bir
 * risk: giris acilirken VERININ de acilmasi. Bu paket ikisini AYRI olcer.
 *
 * ── BLOKLAR ──────────────────────────────────────────────────────────────
 *   S  saf yuklemler (`kapali-hesap.ts`) + sema enum'uyla uyum
 *   G  giris kapisi (`hesapKapisi`) — yalniz `kendi`, yalniz pencerede
 *   M  iki adimli giris kapali hesapta da KOD ISTER (§4.7)
 *   P  parola sifirlama calisir ama hesabi GERI ACMAZ (§4.2)
 *   K  kapali adresle kayit: yeni hesap ACILMAZ, net mesaj (§4.3)
 *   E  erisim: teklif/kutuphane/cikti/ceviri 403 · veri indirme ODEMESIZ (§4.5)
 *   F  firmasi kapanan uye — durdurma deseni (§3.3.4 / K2)
 *   FK firmasi kapanan uye — `deletedAt` damgali GERCEK yol (Emre 21.09)
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';

// ⚠ IMPORT'LARDAN ONCE: `jwt-secret.ts` yedek deger TASIMAZ ve anahtar
// yoksa FIRLATIR (kalem 63). Bu paketin konusu imza degil geri donus;
// anahtar yerel ve sabit.
process.env.JWT_SECRET ??= 'geri-donus-testi-icin-yerel-anahtar-en-az-32-karakter';

import * as fs from 'fs';
import * as path from 'path';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import {
  KAPATMA_NEDENLERI,
  geriDonusPenceresinde,
  kapaliHesapDurumu,
  kapaliHesapMetni,
  imhaTarihiMetni,
  KAYIT_KAPALI_HESAP_MESAJI,
  KAYIT_FIRMA_KAPANDI_MESAJI,
  GIRIS_ACIK_KAPATMA_NEDENLERI,
} from '../src/altyapi/auth/kapali-hesap';
import { OturumServisi, hesapKapisi } from '../src/altyapi/auth/oturum.servisi';
import { AuthService } from '../src/altyapi/auth/auth.service';
import { ParolaServisi } from '../src/altyapi/auth/parola.servisi';
import { JwtStrategy } from '../src/altyapi/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/altyapi/auth/guards/jwt-auth.guard';
import { ErisimServisi, Yetenek } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { AuthController } from '../src/altyapi/auth/auth.controller';
import { QuotesController } from '../src/ozellik/teklif/quotes/quotes.controller';
import { LibraryController } from '../src/ozellik/kutuphane/library/library.controller';
import { QuoteFormatsController } from '../src/ozellik/cikti/quote-formats/quote-formats.controller';
import { AiController } from '../src/ozellik/giris/ai/ai.controller';
import { AbonelikController } from '../src/ozellik/odeme/abonelik/abonelik.controller';
import { tokenOzetle } from '../src/altyapi/auth/token-ozet';

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

/** Firlatan cagriyi yakalar; firlatmadiysa `null`. */
async function firlatti(fn: () => unknown): Promise<any | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

function hataGovdesi(e: any): any {
  return e?.response ?? e?.getResponse?.() ?? e;
}

// ═══════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — dar ama SADIK
// ═══════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

function sahteDb() {
  const users: Satir[] = [];
  const firmalar: Satir[] = [];
  const tokenlar: Satir[] = [];
  const sayac = { userCreate: 0, userUpdate: 0 };

  const kucult = (s: string) => String(s ?? '').replace(/[A-Z]/g, (h) => h.toLowerCase());

  const prisma: any = {
    user: {
      findMany: async ({ where }: any) => {
        const es = where?.email;
        if (es?.equals !== undefined) {
          const a = es.mode === 'insensitive' ? kucult(es.equals) : es.equals;
          return users.filter((u) =>
            es.mode === 'insensitive' ? kucult(u.email) === a : u.email === a,
          );
        }
        return [...users];
      },
      findUnique: async ({ where, include }: any) => {
        const u = users.find((x) => x.id === where.id || x.email === where.email) ?? null;
        if (!u) return null;
        if (include?.firma) {
          return { ...u, firma: firmalar.find((f) => f.id === u.firmaId) ?? null };
        }
        return { ...u };
      },
      findFirst: async () => null,
      count: async () => 0,
      create: async ({ data }: any) => {
        sayac.userCreate++;
        const satir = { id: `U${users.length + 1}`, ...data };
        users.push(satir);
        return { ...satir };
      },
      update: async ({ where, data }: any) => {
        sayac.userUpdate++;
        const u = users.find((x) => x.id === where.id);
        if (!u) throw new Error('bellek-Prisma: user yok');
        Object.assign(u, data);
        return { ...u };
      },
    },
    firma: {
      findUnique: async ({ where }: any) =>
        firmalar.find((f) => f.id === where.id) ?? null,
    },
    // Abonelik BILEREK bos: kapali hesap karari aboneligi HIC okumamali.
    abonelik: { findUnique: async () => null },
    dogrulanmisAlanAdi: { findUnique: async () => null },
    kullaniciDisKimlik: { findFirst: async () => null },
    mfaKurtarmaKodu: { count: async () => 0 },
    passwordResetToken: {
      findUnique: async ({ where }: any) => {
        const t = tokenlar.find((x) => x.tokenHash === where.tokenHash);
        if (!t) return null;
        return { ...t, user: users.find((u) => u.id === t.userId) ?? null };
      },
      create: async ({ data }: any) => {
        const t = { id: `T${tokenlar.length + 1}`, usedAt: null, ...data };
        tokenlar.push(t);
        return { ...t };
      },
      updateMany: async ({ where, data }: any) => {
        let n = 0;
        for (const t of tokenlar) {
          if (t.userId === where.userId && (where.usedAt !== null || t.usedAt === null)) {
            Object.assign(t, data);
            n++;
          }
        }
        return { count: n };
      },
    },
    $transaction: async (islem: any) =>
      Array.isArray(islem) ? Promise.all(islem) : islem(prisma),
  };

  return { prisma, users, firmalar, tokenlar, sayac };
}

/** Gercek dekorator metadata'sini okuyan sahte `ExecutionContext`. */
function baglam(sinif: any, metot: any) {
  return {
    getHandler: () => metot,
    getClass: () => sinif,
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as any;
}

const GUN = 86_400_000;
const SIMDI = new Date('2026-09-21T12:00:00.000Z');
const ILERDE = new Date(SIMDI.getTime() + 20 * GUN);
const GECMIS = new Date(SIMDI.getTime() - 1 * GUN);

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n── S · SAF YUKLEMLER ────────────────────────────────────');
  // ═══════════════════════════════════════════════════════════════════════
  check(
    'S1 acik hesap pencerede DEGIL (yuklem yalniz kapali hesaba bakar)',
    geriDonusPenceresinde({ deletedAt: null, kapatmaNedeni: null, imhaTarihi: null }, SIMDI) === false,
  );
  check(
    'S2 ⭐ `kendi` + imhaTarihi ILERDE → pencerede',
    geriDonusPenceresinde({ deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: ILERDE }, SIMDI) === true,
  );
  {
    // ⚠ EMRE KARARI (21.09): `firmaKapandi` da GIRIS YAPABILIR. Gerekce
    // olculdu — o uyeye `deletedAt` + `passwordChangedAt` yazildigi icin
    // §3.3.4'un verdigi "veri indirme hakki"na ulasabilecegi baska hicbir
    // yol kalmiyordu. Yasal hak, urun erisimi kuralini ezer.
    const kapaliKalanlar = KAPATMA_NEDENLERI.filter(
      (n) => !GIRIS_ACIK_KAPATMA_NEDENLERI.includes(n),
    );
    const hicbiri = kapaliKalanlar.every(
      (n) => geriDonusPenceresinde({ deletedAt: GECMIS, kapatmaNedeni: n, imhaTarihi: ILERDE }, SIMDI) === false,
    );
    check(
      `S3 ⭐ kapali KALAN iki neden pencerede DEGIL (${kapaliKalanlar.join(', ')})`,
      kapaliKalanlar.length === 2 && hicbiri &&
        kapaliKalanlar.includes('yonetici') && kapaliKalanlar.includes('ekiptenCikarildi'),
      `sayilan=${kapaliKalanlar.length}: ${kapaliKalanlar.join(',')}`,
    );
    check(
      'S3b ⭐⭐ `firmaKapandi` PENCEREDE (KVKK: veri indirme hakkina ulasilabilsin)',
      geriDonusPenceresinde({ deletedAt: GECMIS, kapatmaNedeni: 'firmaKapandi', imhaTarihi: ILERDE }, SIMDI) === true,
    );
  }
  check(
    'S4 imhaTarihi GECMIS → pencerede degil',
    geriDonusPenceresinde({ deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: GECMIS }, SIMDI) === false,
  );
  check(
    'S5 ⭐ imhaTarihi BOS → pencerede degil (backfill yok; eski kapali hesaplar sessizce acilmaz)',
    geriDonusPenceresinde({ deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: null }, SIMDI) === false,
  );
  check(
    'S6 sinir: imhaTarihi === simdi → KAPALI (imha isiyle ayni ani iki taraf da acik saymaz)',
    geriDonusPenceresinde({ deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: SIMDI }, SIMDI) === false,
  );
  {
    const h = kapaliHesapDurumu({ deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: ILERDE });
    const f = kapaliHesapDurumu({ deletedAt: null, firmaImhaTarihi: ILERDE });
    const ikisi = kapaliHesapDurumu({ deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: ILERDE, firmaImhaTarihi: ILERDE });
    const acik = kapaliHesapDurumu({ deletedAt: null, firmaImhaTarihi: null });
    check('S7 durum: kendi→hesap · firma→firma · ikisi→hesap · yok→acik',
      h.tip === 'hesap' && f.tip === 'firma' && ikisi.tip === 'hesap' && acik.kapali === false,
      `${h.tip}/${f.tip}/${ikisi.tip}/${acik.kapali}`);
    // ⚠ TIP NEDENDEN GELIR, `deletedAt`ten DEGIL. `firmaKapandi` uyesinin de
    // `deletedAt`i DOLUDUR; yalniz ona bakan bir kural o kisiye "Hesabiniz
    // kapatildi… Paket sec" derdi — oysa hesabini o kapatmadi ve odeyemez.
    const fk = kapaliHesapDurumu({ deletedAt: GECMIS, kapatmaNedeni: 'firmaKapandi', imhaTarihi: ILERDE });
    check('S7b ⭐⭐ `firmaKapandi` + deletedAt DOLU → tip `firma` (hesap DEGIL)',
      fk.tip === 'firma' && fk.kapali === true, String(fk.tip));
  }
  {
    // Sema ile UYUM: enum'a besinci bir deger eklenip burada unutulursa kirmizi.
    const sema = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
    const govde = sema.split('enum KapatmaNedeni {')[1]?.split('}')[0] ?? '';
    const semadakiler = govde
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('///') && !s.startsWith('//'));
    const ayni =
      semadakiler.length === KAPATMA_NEDENLERI.length &&
      semadakiler.every((n) => (KAPATMA_NEDENLERI as readonly string[]).includes(n));
    check('S8 ⭐ `KAPATMA_NEDENLERI` semadaki enum ile BIREBIR', ayni, `sema=[${semadakiler}]`);
  }
  check('S9 tarih GUN olarak yazilir (gun.ay.yil)',
    imhaTarihiMetni(new Date(2026, 9, 5)) === '05.10.2026',
    imhaTarihiMetni(new Date(2026, 9, 5)));
  check('S10 metin: hesap dalinda TARIH var, firma dalinda "firma sahibiniz"',
    kapaliHesapMetni({ kapali: true, tip: 'hesap', imhaTarihi: new Date(2026, 9, 5) }).includes('05.10.2026') &&
      kapaliHesapMetni({ kapali: true, tip: 'firma', imhaTarihi: null }).includes('Firma sahibiniz'));

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n── G · GIRIS KAPISI ─────────────────────────────────────');
  // ═══════════════════════════════════════════════════════════════════════
  check('G1 ⭐ `kendi` + pencerede → GIRIS ACIK (firlatmaz)',
    (await firlatti(() => hesapKapisi({ status: 'active', deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: ILERDE }, SIMDI))) === null);
  {
    const kapaliKalanlar = KAPATMA_NEDENLERI.filter(
      (n) => !GIRIS_ACIK_KAPATMA_NEDENLERI.includes(n),
    );
    const hepsiKapali: boolean[] = [];
    for (const n of kapaliKalanlar) {
      const e = await firlatti(() => hesapKapisi({ status: 'active', deletedAt: GECMIS, kapatmaNedeni: n, imhaTarihi: ILERDE }, SIMDI));
      hepsiKapali.push(!!e && String(e.message).includes('Hesabiniz kapatilmis'));
    }
    check('G2 ⭐ `yonetici` ve `ekiptenCikarildi` GIRIS YAPAMAZ',
      hepsiKapali.length === 2 && hepsiKapali.every(Boolean), JSON.stringify(hepsiKapali));
    check('G2b ⭐⭐ `firmaKapandi` GIRIS YAPABILIR (Emre karari 21.09 — KVKK onceligi)',
      (await firlatti(() => hesapKapisi({ status: 'active', deletedAt: GECMIS, kapatmaNedeni: 'firmaKapandi', imhaTarihi: ILERDE }, SIMDI))) === null);
  }
  check('G3 pencere DISINDAKI `kendi` giris yapamaz',
    !!(await firlatti(() => hesapKapisi({ status: 'active', deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: GECMIS }, SIMDI))));
  {
    const e = await firlatti(() => hesapKapisi({ status: 'banned', deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: ILERDE }, SIMDI));
    check('G4 ⭐ BAN once: banli + pencerede → "askiya alinmis" (geri donus ekrani GORUNMEZ)',
      !!e && String(e.message).includes('askiya alinmis'), String(e?.message));
  }
  check('G5 acik hesap etkilenmedi', (await firlatti(() => hesapKapisi({ status: 'active', deletedAt: null }, SIMDI))) === null);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n── M · IKI ADIMLI GIRIS (§4.7) ──────────────────────────');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = sahteDb();
    const jwt = { sign: () => 'a.b.c' } as any;
    const oturum = new OturumServisi(db.prisma, jwt);
    db.firmalar.push({ id: 'F1', ad: 'F1', imhaTarihi: null, mfaZorunlu: false });
    const kapaliMfali = {
      id: 'U1', email: 'a@x.test', role: 'user', firmaId: 'F1', firmaRol: 'sahip',
      createdAt: GECMIS, mfaAcikAt: GECMIS, mfaKaynagi: 'kisisel',
      status: 'active', deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: ILERDE,
    };
    const yanit: any = await oturum.girisKarari(kapaliMfali as any, 'parola');
    check('M1 ⭐ kapali hesapta IKI ADIMLI GIRIS HALA KOD ISTIYOR (kapatma, MFA atlatma yolu degil)',
      yanit?.mfaGerekli === true && typeof yanit?.meydanOkuma === 'string' && yanit.token === undefined,
      JSON.stringify(Object.keys(yanit ?? {})));

    const kapaliMfasiz = { ...kapaliMfali, id: 'U2', mfaAcikAt: null, mfaKaynagi: null };
    const y2: any = await oturum.girisKarari(kapaliMfasiz as any, 'parola');
    check('M2 ⭐ MFA yoksa token VERILIR ve `hesapKapali: true` tasir (on yuz geri donus ekranina gider)',
      typeof y2?.token === 'string' && y2?.user?.hesapKapali === true, JSON.stringify(y2?.user));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n── P · PAROLA SIFIRLAMA (§4.2) ──────────────────────────');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = sahteDb();
    const giden: any[] = [];
    const eposta = { gonderKritik: async (t: any) => { giden.push(t); }, gonder: async () => undefined } as any;
    const parola = new ParolaServisi(db.prisma, eposta, {} as any, new ConfigService({ UYGULAMA_URL: 'https://ornek.test' }));

    db.users.push({
      id: 'P1', email: 'kapali@x.test', password: 'ozet', role: 'user', firmaId: null,
      status: 'active', deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: ILERDE,
      parolaTanimli: true,
    });
    db.users.push({
      id: 'P2', email: 'yonetici-kapatti@x.test', password: 'ozet', role: 'user', firmaId: null,
      status: 'active', deletedAt: GECMIS, kapatmaNedeni: 'yonetici', imhaTarihi: ILERDE,
      parolaTanimli: true,
    });

    await parola.sifirlamaIste('kapali@x.test');
    check('P1 ⭐ pencere icindeki kapali hesaba SIFIRLAMA E-POSTASI GIDIYOR',
      db.tokenlar.filter((t) => t.userId === 'P1').length === 1 && giden.length === 1,
      `token=${db.tokenlar.length} mail=${giden.length}`);

    await parola.sifirlamaIste('yonetici-kapatti@x.test');
    check('P2 `yonetici` ile kapatilana e-posta GITMIYOR (giremeyecegi bir yola sokmaz)',
      db.tokenlar.filter((t) => t.userId === 'P2').length === 0 && giden.length === 1);

    // Token'in duz hali e-postadaki baglantidan cikarilir — testin kendi
    // ozetini uydurmasi DAIRESEL olcut olurdu.
    const url = String(giden[0]?.dugme?.url ?? '');
    const duzToken = decodeURIComponent(url.split('token=')[1] ?? '');
    const kayit = db.tokenlar.find((t) => t.userId === 'P1');
    check('P3-on token e-postadaki baglantiyla AYNI (dairesel olcut yok)',
      !!duzToken && kayit?.tokenHash === tokenOzetle(duzToken));

    const oncekiDeletedAt = db.users[0].deletedAt;
    const sonuc: any = await parola.sifirla(duzToken, 'Yeni-Parola-123!');
    check('P3 ⭐ pencere icindeki hesapta parola SIFIRLANABILIYOR',
      typeof sonuc?.mesaj === 'string' && db.users[0].password !== 'ozet');

    const u = db.users[0];
    check('P4 ⭐⭐ PAROLA YENILEMEK HESABI GERI ACMADI (deletedAt/imhaTarihi/kapatmaNedeni DEGISMEDI)',
      u.deletedAt === oncekiDeletedAt && u.imhaTarihi === ILERDE && u.kapatmaNedeni === 'kendi',
      `deletedAt=${u.deletedAt} imha=${u.imhaTarihi} neden=${u.kapatmaNedeni}`);
    check('P5 hesap hala pencerede (yani giris yapabilir, ama hesap ACIK DEGIL)',
      geriDonusPenceresinde(u as any, SIMDI) === true && !!u.deletedAt);
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n── K · KAPALI ADRESLE KAYIT (§4.3) ──────────────────────');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = sahteDb();
    const jwt = { sign: () => 'a.b.c' } as any;
    const auth = new AuthService(
      db.prisma, jwt, {} as any,
      { dogrulamaGonderSessizce: async () => undefined } as any,
      new OturumServisi(db.prisma, jwt),
    );
    db.users.push({
      id: 'K1', email: 'donen@x.test', password: 'ozet', role: 'user', firmaId: null,
      status: 'active', deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: ILERDE,
    });
    db.users.push({
      id: 'K2', email: 'suresi-dolmus@x.test', password: 'ozet', role: 'user', firmaId: null,
      status: 'active', deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: GECMIS,
    });

    const oncekiCreate = db.sayac.userCreate;
    const e = await firlatti(() =>
      auth.register({ email: 'Donen@x.test', password: 'Parola-123!', sozlesmeOnayi: true } as any),
    );
    const govde = hataGovdesi(e);
    check('K1 ⭐⭐ pencere icindeki adresle kayit: YENI HESAP ACILMADI',
      db.sayac.userCreate === oncekiCreate, `create=${db.sayac.userCreate - oncekiCreate}`);
    check('K2 ⭐ net mesaj + kod (harf buyuklugune duyarsiz eslesti)',
      govde?.kod === 'HESAP_KAPALI_GERI_DONUS' && govde?.mesaj === KAYIT_KAPALI_HESAP_MESAJI &&
        govde?.message === KAYIT_KAPALI_HESAP_MESAJI,
      JSON.stringify(govde));
    check('K3 mesaj kullaniciya NE YAPACAGINI soyluyor ("giris yap")',
      /[Gg]iriş yap/.test(String(govde?.mesaj)));

    const e2 = await firlatti(() =>
      auth.register({ email: 'suresi-dolmus@x.test', password: 'Parola-123!', sozlesmeOnayi: true } as any),
    );
    const g2 = hataGovdesi(e2);
    check('K4 suresi DOLMUS kapali adres: bugunku davranis DEGISMEDI ("Email already in use")',
      (typeof g2 === 'string' ? g2 : g2?.message) === 'Email already in use', JSON.stringify(g2));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n── E · ERISIM: UCTAN UCA 403 (§4.5) ─────────────────────');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = sahteDb();
    db.firmalar.push({ id: 'F9', ad: 'F9', imhaTarihi: null });
    db.users.push({
      id: 'E1', email: 'kapali@e.test', password: 'x', role: 'user',
      firmaId: 'F9', firmaRol: 'sahip', createdAt: GECMIS, mfaAcikAt: null,
      status: 'active', deletedAt: GECMIS, kapatmaNedeni: 'kendi', imhaTarihi: ILERDE,
      passwordChangedAt: null,
    });
    const strateji = new JwtStrategy(db.prisma);
    const kimlik: any = await strateji.validate({ sub: 'E1', email: 'kapali@e.test', role: 'user' });
    check('E1 ⭐ TOKEN KAPISI: pencere icindeki hesap 401 ALMIYOR ve `hesapKapali: true` tasiyor',
      kimlik?.id === 'E1' && kimlik?.hesapKapali === true && kimlik?.kapatmaTipi === 'hesap');
    check('E2 403 govdesindeki cumle EKRANDAKIYLE ayni kaynaktan',
      kimlik?.kapatmaMetni === kapaliHesapMetni({ kapali: true, tip: 'hesap', imhaTarihi: ILERDE }),
      String(kimlik?.kapatmaMetni));

    const guard = new JwtAuthGuard(new Reflector());
    const kapiSonucu = (sinif: any, metot: any) => {
      try {
        guard.handleRequest(null, kimlik, null, baglam(sinif, metot));
        return null;
      } catch (err: any) {
        return hataGovdesi(err);
      }
    };

    const kapatilmasiGerekenler: Array<[string, any, any]> = [
      ['teklif listesi  GET /quotes', QuotesController, QuotesController.prototype.findAll],
      ['teklif detay    GET /quotes/:id', QuotesController, QuotesController.prototype.findOne],
      ['teklif olustur  POST /quotes', QuotesController, QuotesController.prototype.create],
      ['kutuphane       GET /library', LibraryController, LibraryController.prototype.findAll],
      ['kutuphane marka GET /library/brands', LibraryController, LibraryController.prototype.findLibraryBrands],
      ['cikti formati   GET /quote-formats', QuoteFormatsController, QuoteFormatsController.prototype.list],
      ['cikti ornek     GET /quote-formats/sample', QuoteFormatsController, (QuoteFormatsController.prototype as any).sample],
      ['ceviri          POST /ai/translate', AiController, (AiController.prototype as any).translate],
      ['AI analiz       POST /ai/analyze', AiController, (AiController.prototype as any).analyze],
    ];
    const sonuclar = kapatilmasiGerekenler.map(([ad, s, m]) => [ad, kapiSonucu(s, m)] as const);
    const hepsi403 = sonuclar.every(([, g]) => g?.kod === 'HESAP_KAPALI');
    check(`E3 ⭐⭐ ${sonuclar.length} UCUN HEPSI 403 HESAP_KAPALI (teklif · kutuphane · cikti · ceviri)`,
      hepsi403, sonuclar.filter(([, g]) => g?.kod !== 'HESAP_KAPALI').map(([a]) => a).join(' | '));
    check('E4 403 govdesi ekranin yazacagi cumleyi ve imha tarihini tasiyor',
      sonuclar[0][1]?.mesaj === kimlik.kapatmaMetni && !!sonuclar[0][1]?.imhaTarihi);

    // ⚠ PARA/KVKK KAPISI: bu ucun 403 DONMEMESI sart.
    const kvkk = kapiSonucu(AuthController, AuthController.prototype.verilerim);
    check('E5 ⭐⭐ "Verilerimi indir" ODEMESIZ ve kapali hesapta ACIK (GET /auth/hesabim/verilerim)',
      kvkk === null, JSON.stringify(kvkk));
    const me = kapiSonucu(AuthController, AuthController.prototype.me);
    check('E6 ⭐ GET /auth/me acik (geri donus ekraninin tek besleme noktasi)', me === null, JSON.stringify(me));
    const paket = kapiSonucu(AbonelikController, AbonelikController.prototype.paketler);
    const basla = kapiSonucu(AbonelikController, AbonelikController.prototype.basla);
    check('E7 ⭐ "Paket sec" acik: /abonelik/paketler ve /abonelik/basla 403 DONMUYOR (geri donusun TEK yolu)',
      paket === null && basla === null, `${JSON.stringify(paket)} ${JSON.stringify(basla)}`);
    const kapat = kapiSonucu(AuthController, AuthController.prototype.hesabimiKapat);
    check('E8 zaten kapali hesap tekrar "hesabimi kapat" DIYEMEZ (izin listesi dar)',
      kapat?.kod === 'HESAP_KAPALI');
  }

  {
    // ASKIDA kipi — YENI KIP YOK.
    const erisim = new ErisimServisi({} as any);
    const karar = erisim.kapaliKarar({ kapali: true, tip: 'hesap', imhaTarihi: ILERDE }, SIMDI);
    const acikKalanlar = Object.values(Yetenek).filter((y) => erisim.yetenekKararla(karar, y));
    check('E9 ⭐ ASKIDA kipi: yalniz ABONELIK_YONET acik ("Askidayken yalnizca odeme sayfasi")',
      acikKalanlar.length === 1 && acikKalanlar[0] === Yetenek.ABONELIK_YONET,
      acikKalanlar.join(','));
    check('E10 karar sekli ASKIDA dalinin AYNISI (yeni kip icat edilmedi)',
      karar.erisimVar === false && karar.saltOkunur === false && karar.durum === 'ASKIDA',
      `${karar.erisimVar}/${karar.saltOkunur}/${karar.durum}`);
    check('E11 kalan gun imha tarihinden turiyor (20 gun)', karar.kalanGun === 20, String(karar.kalanGun));
    check('E12 uyari basligi ekranin yazdigi cumle', karar.uyari?.baslik === kapaliHesapMetni({ kapali: true, tip: 'hesap', imhaTarihi: ILERDE }));
  }

  {
    // ⚠ FIRMA EKSENI YETMEZ — bu blok o iddianin KANITI.
    const erisim = new ErisimServisi({
      abonelik: {
        findUnique: async () => ({
          durum: 'AKTIF',
          erisimSonu: new Date(SIMDI.getTime() + 300 * GUN),
          kisitlandi: false,
          paketSurumu: { paket: { kod: 'pro', kullaniciHakki: 5, dwgAktif: true, seviye: 'pro' } },
        }),
      },
    } as any);
    const firmaKarari = await erisim.karar('F9', SIMDI);
    const kapaliKarari = erisim.kapaliKarar({ kapali: true, tip: 'hesap', imhaTarihi: ILERDE }, SIMDI);
    check('E13 ⭐⭐ FIRMA aboneligi AKTIF olsa bile kapali hesabin erisimi YOK (firma ekseni yetmez)',
      firmaKarari.erisimVar === true && kapaliKarari.erisimVar === false,
      `firma=${firmaKarari.erisimVar} kapali=${kapaliKarari.erisimVar}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n── F · FIRMASI KAPANAN UYE (K2 · §3.3.4) ────────────────');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = sahteDb();
    // Uyenin KENDI `deletedAt`i BOS — durdurma deseni. Kapanmayi yalniz
    // firma satiri soyluyor.
    db.firmalar.push({ id: 'FK', ad: 'FK', imhaTarihi: ILERDE });
    db.users.push({
      id: 'UY', email: 'uye@fk.test', password: 'x', role: 'user',
      firmaId: 'FK', firmaRol: 'uye', createdAt: GECMIS, mfaAcikAt: null,
      status: 'active', deletedAt: null, kapatmaNedeni: null, imhaTarihi: null,
      passwordChangedAt: null,
    });
    const strateji = new JwtStrategy(db.prisma);
    const kimlik: any = await strateji.validate({ sub: 'UY', email: 'uye@fk.test', role: 'user' });
    check('F1 ⭐ uyenin kendi deletedAt`i BOS olmasina ragmen erisimi DURDU (K2)',
      kimlik?.hesapKapali === true && kimlik?.kapatmaTipi === 'firma');
    check('F2 ⭐ TEK CUMLE: "Firmanizin hesabi kapatildi. Firma sahibiniz geri acarsa..."',
      String(kimlik?.kapatmaMetni).startsWith('Firmanızın hesabı kapatıldı.') &&
        String(kimlik?.kapatmaMetni).includes('geri gelir'),
      String(kimlik?.kapatmaMetni));

    const guard = new JwtAuthGuard(new Reflector());
    const kapiSonucu = (sinif: any, metot: any) => {
      try { guard.handleRequest(null, kimlik, null, baglam(sinif, metot)); return null; }
      catch (err: any) { return hataGovdesi(err); }
    };
    check('F3 ⭐⭐ VERI INDIRME HAKKI ACIK KALDI (KVKK — firma kapansa da)',
      kapiSonucu(AuthController, AuthController.prototype.verilerim) === null);
    check('F4 teklif ve kutuphane KAPALI',
      kapiSonucu(QuotesController, QuotesController.prototype.findAll)?.kod === 'HESAP_KAPALI' &&
        kapiSonucu(LibraryController, LibraryController.prototype.findAll)?.kod === 'HESAP_KAPALI');

    const erisim = new ErisimServisi({} as any);
    const karar = erisim.kapaliKarar({ kapali: true, tip: 'firma', imhaTarihi: ILERDE }, SIMDI);
    check('F5 ⭐ firmasi kapanan UYEYE "Paket sec" dugmesi GOSTERILMEZ (firmayi SAHIBI geri acar)',
      karar.uyari?.eylem === undefined, JSON.stringify(karar.uyari?.eylem));

    // Giris: `deletedAt` bos oldugu icin kapi zaten gecirir — §3.3.4'teki
    // "giris yapabilirse" dali. A'nin `deletedAt` damgalamasi hâlinde
    // `firmaKapandi` nedeni G2'de zaten kapali olarak olculuyor.
    check('F6 giris kapisi bu uyeyi engellemiyor (durdurma deseni; §3.3.4 "giris yapabilirse")',
      (await firlatti(() => hesapKapisi({ status: 'active', deletedAt: null }, SIMDI))) === null);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  FK · `firmaKapandi` UYESI — GIRIS ACIK, URUN KAPALI (Emre karari 21.09)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ NEDEN AYRI BLOK: F blogu uyenin `deletedAt`i BOS oldugu (durdurma
// deseni) hali olcer. A'nin GERCEK uygulamasi ise o uyeye `deletedAt` +
// `imhaTarihi` + `kapatmaNedeni: 'firmaKapandi'` YAZIYOR. Bu blok o yolu
// olcer: kisi girebiliyor mu, YALNIZ uc seyi mi goruyor, urun uclari kapali
// mi, KVKK indirmesi acik mi.
async function fkBlogu() {
  console.log('\n── FK · `firmaKapandi` UYESI (deletedAt DAMGALI) ─────────');
  const db = sahteDb();
  db.firmalar.push({ id: 'FX', ad: 'FX', imhaTarihi: ILERDE });
  db.users.push({
    id: 'FKU', email: 'uye@fx.test', password: 'ozet', role: 'user',
    firmaId: 'FX', firmaRol: 'uye', createdAt: GECMIS, mfaAcikAt: null,
    status: 'active', deletedAt: GECMIS, kapatmaNedeni: 'firmaKapandi',
    imhaTarihi: ILERDE, passwordChangedAt: null, parolaTanimli: true,
  });

  // 1) GIRIS
  check('FK1 ⭐⭐ `firmaKapandi` uyesi GIRIS YAPABILIYOR',
    (await firlatti(() => hesapKapisi(db.users[0] as any, SIMDI))) === null);

  const jwt = { sign: () => 'a.b.c' } as any;
  const oturum = new OturumServisi(db.prisma, jwt);
  const y: any = await oturum.girisKarari(db.users[0] as any, 'parola');
  check('FK2 giris yaniti token + `hesapKapali: true` (on yuz /hesap-kapali`ya gider)',
    typeof y?.token === 'string' && y?.user?.hesapKapali === true, JSON.stringify(y?.user));

  // 2) TOKEN KAPISI + EKRAN
  const strateji = new JwtStrategy(db.prisma);
  const kimlik: any = await strateji.validate({ sub: 'FKU', email: 'uye@fx.test', role: 'user' });
  check('FK3 ⭐ token kapisi 401 ATMIYOR ve tip `firma` (hesap DEGIL)',
    kimlik?.hesapKapali === true && kimlik?.kapatmaTipi === 'firma', String(kimlik?.kapatmaTipi));
  check('FK4 ⭐⭐ TEK CUMLE: §3.3.4 metni',
    kimlik?.kapatmaMetni === 'Firmanızın hesabı kapatıldı. Firma sahibiniz geri açarsa erişiminiz geri gelir.',
    String(kimlik?.kapatmaMetni));

  // 3) URUN UCLARI KAPALI · KVKK ACIK
  const guard = new JwtAuthGuard(new Reflector());
  const kapi = (sinif: any, metot: any) => {
    try { guard.handleRequest(null, kimlik, null, baglam(sinif, metot)); return null; }
    catch (err: any) { return hataGovdesi(err); }
  };
  const urunUclari: Array<[string, any, any]> = [
    ['teklif GET /quotes', QuotesController, QuotesController.prototype.findAll],
    ['teklif GET /quotes/:id', QuotesController, QuotesController.prototype.findOne],
    ['kutuphane GET /library', LibraryController, LibraryController.prototype.findAll],
    ['cikti GET /quote-formats', QuoteFormatsController, QuoteFormatsController.prototype.list],
    ['cikti GET /quote-formats/sample', QuoteFormatsController, (QuoteFormatsController.prototype as any).sample],
    ['ceviri POST /ai/translate', AiController, (AiController.prototype as any).translate],
  ];
  const sonuc = urunUclari.map(([ad, s2, m]) => [ad, kapi(s2, m)] as const);
  check(`FK5 ⭐⭐ ${sonuc.length} urun ucunun HEPSI 403 HESAP_KAPALI`,
    sonuc.every(([, g]) => g?.kod === 'HESAP_KAPALI'),
    sonuc.filter(([, g]) => g?.kod !== 'HESAP_KAPALI').map(([a]) => a).join(' | '));
  check('FK6 ⭐⭐ "Verilerimi indir" ODEMESIZ ACIK (KVKK — bu kararin TEK sebebi)',
    kapi(AuthController, AuthController.prototype.verilerim) === null);
  check('FK7 GET /auth/me acik (ekranin tek beslemesi)',
    kapi(AuthController, AuthController.prototype.me) === null);

  // 4) EKRANDA NE VAR: tek cumle + indir + cikis. "Paket sec" YOK.
  const erisim = new ErisimServisi({} as any);
  const karar = erisim.kapaliKarar({ kapali: true, tip: 'firma', imhaTarihi: ILERDE }, SIMDI);
  check('FK8 ⭐⭐ "Paket sec" eylemi YOK (uye odeyemez — firmayi SAHIBI geri acar)',
    karar.uyari?.eylem === undefined, JSON.stringify(karar.uyari?.eylem));
  check('FK9 erisim ASKIDA: hicbir urun yetenegi acik degil',
    Object.values(Yetenek).filter((yy) => erisim.yetenekKararla(karar, yy)).length === 1);

  // 5) PAROLASINI UNUTTUYSA: hakka ulasmanin onu kapanmasin
  const giden: any[] = [];
  const parola = new ParolaServisi(
    db.prisma,
    { gonderKritik: async (t: any) => { giden.push(t); }, gonder: async () => undefined } as any,
    {} as any,
    new ConfigService({ UYGULAMA_URL: 'https://ornek.test' }),
  );
  await parola.sifirlamaIste('uye@fx.test');
  check('FK10 ⭐ parolasini unutan uyeye SIFIRLAMA e-postasi gidiyor (aksi halde hakka ulasamaz)',
    giden.length === 1 && db.tokenlar.length === 1, `mail=${giden.length}`);

  // 6) KAYIT: yeni hesap acilmaz ve mesaj DOGRU olani
  const auth = new AuthService(
    db.prisma, jwt, {} as any,
    { dogrulamaGonderSessizce: async () => undefined } as any,
    new OturumServisi(db.prisma, jwt),
  );
  const oncekiCreate = db.sayac.userCreate;
  const e = await firlatti(() =>
    auth.register({ email: 'uye@fx.test', password: 'Parola-123!', sozlesmeOnayi: true } as any),
  );
  const govde = hataGovdesi(e);
  check('FK11 yeni hesap ACILMADI', db.sayac.userCreate === oncekiCreate);
  check('FK12 ⭐⭐ kayit mesaji "hesabinizi geri acabilirsiniz" DEMIYOR — uye acamaz',
    govde?.mesaj === KAYIT_FIRMA_KAPANDI_MESAJI &&
      govde?.mesaj !== KAYIT_KAPALI_HESAP_MESAJI &&
      !/hesabınızı geri aç/i.test(String(govde?.mesaj)),
    JSON.stringify(govde?.mesaj));
  check('FK13 mesaj ne YAPABILECEGINI soyluyor (verilerini indir)',
    /verilerinizi indirebilirsiniz/i.test(String(govde?.mesaj)));
}

function son() {
  console.log(`\n${'='.repeat(64)}\nGERI DONUS: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

main()
  .then(fkBlogu)
  .then(son)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
