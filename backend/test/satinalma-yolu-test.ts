/**
 * SATIN ALMA YOLU TURU  (`npm run test:satinalma`)
 *
 * AG/DB GEREKTIRMEZ: PrismaService ve IyzicoClient yerine sahte nesneler
 * konur, `SatinAlmaServisi.baslat` GERCEKTEN cagrilir ve DAVRANISI olculur.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * 02.09'da `--uygula` kosup 5 paket acildiktan SONRA olculdu ki satin alma
 * yolu UCTAN UCA CALISMIYOR. Iki bagimsiz kapi vardi ve ikisi de kapaliydi:
 *
 *   (1) HERKESI etkiler — on yuz `/abonelik/basla` ucuna yalniz
 *       `paketSurumuId` gonderiyordu; servis govdeyi KOSULSUZ aciyordu
 *       (`p.musteri.ad`). `@Body()` SATIR-ICI TIP LITERALI oldugu icin
 *       global ValidationPipe devreye girmez (metatype = Object), yani
 *       eksik govde 400 ile durmaz: TypeError firlar, Nest 500 doner.
 *
 *   (2) MEVCUT MUSTERIYI etkiler — ADIM 2 gocu her firmaya `miras-*`
 *       paketiyle `AKTIF` bir satir yazmisti (goc emniyeti, tutar 0).
 *       "Zaten etkin aboneliginiz var" kapisi bu satiri saglikli abonelik
 *       sayip 400 doneriyordu. Mesajin isaret ettigi "yukseltme yolu" ise
 *       YOK (`paketDegistir` hicbir yerden cagrilmiyor).
 *
 * Ikisi birlikte: gelir kanali fiilen SIFIRDI ve hicbir test bunu
 * yakalamiyordu — cunku testler METNI/tipi olcuyordu, YOLU degil.
 *
 * ── OLCULEN ────────────────────────────────────────────────────────────
 *   P1 eksikMusteriAlanlari: govde yok / eksik / bosluk-only
 *   P2 mirasPaketiMi ayrimi
 *   P3 ⭐ musteri govdesi YOKKEN `baslat` 400 atar (TypeError/500 DEGIL)
 *   P4 ⭐ miras satiri satin almayi ENGELLEMEZ (iyzico'ya gercekten gidilir)
 *   P5 ⭐ GERCEK paket satiri satin almayi HALA engeller (cift tahsilat kalkani)
 *   P6 SONA_ERDI/ASKIDA satiri engellemez (eski davranis korundu)
 *   P7 on yuz ile sunucunun zorunlu alan listeleri AYNI
 *   P8 ⭐ ERISIM KISALTILMIYOR — odemek, odememekten kotu OLMAMALI
 *      (goc satiri 365 gun tasiyor; odeme `simdi+32 gune` dusuruyordu)
 *   P9 ⭐ TELEFON BICIMI — yerel yazim (`0533...`) +90'a cevrilir
 *   P10 ⭐ IYZICO HATASI 500 DEGIL — uzak ucun mesaji kullaniciya ULASIR
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import {
  SatinAlmaServisi,
  eksikMusteriAlanlari,
  mirasPaketiMi,
  telefonuNormalize,
  ZORUNLU_MUSTERI_ALANLARI,
} from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import {
  iyzicoDurumunuHttpyeCevir,
  kullaniciyaMesaj,
} from '../src/ozellik/odeme/iyzico/iyzico-hata.filter';

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

const TAM_MUSTERI = {
  ad: 'Ayse',
  soyad: 'Yilmaz',
  eposta: 'ayse@ornek.com',
  telefon: '+905301234567',
  kimlikNo: '11111111111',
  sehir: 'Istanbul',
  adres: 'Ornek Mah. 1. Sok. No 2',
};

/** Verilen paket koduyla bir abonelik satiri dondüren sahte Prisma. */
function sahtePrisma(mevcutPaketKodu: string | null, mevcutDurum = 'AKTIF') {
  return {
    paketSurumu: {
      findUnique: async () => ({
        id: 's1',
        iyzicoPlanKodu: 'plan-1',
        satistaMi: true,
        denemeGunu: 30,
        paket: { kod: 'pro-mek', ad: 'Pro Mekanik' },
      }),
    },
    abonelik: {
      findUnique: async () =>
        mevcutPaketKodu === null
          ? null
          : {
              id: 'a1',
              durum: mevcutDurum,
              paketSurumu: { paket: { kod: mevcutPaketKodu } },
            },
    },
    firma: {
      findUnique: async () => ({
        unvan: null,
        yetkiliEposta: null,
        faturaAdresi: null,
        il: null,
      }),
      update: async () => ({}),
    },
    abonelikBaslatma: { create: async () => ({ id: 'n1' }) },
  } as any;
}

/** iyzico'ya GERCEKTEN gidildi mi olcen sahte istemci. */
function sahteIyzico() {
  const cagrilar: any[] = [];
  return {
    cagrilar,
    istemci: {
      abonelikBaslat: async (g: any) => {
        cagrilar.push(g);
        return { checkoutFormContent: '<form>iyzico</form>', token: 't1' };
      },
    } as any,
  };
}

function servisKur(prisma: any, iyzico: any) {
  return new SatinAlmaServisi(
    prisma,
    iyzico,
    {} as any,
    new ConfigService({ UYGULAMA_URL: 'https://ornek.test' }),
  );
}

/** `baslat` cagrisinin SONUCUNU siniflandirir: hangi hata tipi dondu? */
async function baslatSonucu(prisma: any, iyzico: any, musteri: any) {
  const servis = servisKur(prisma, iyzico);
  try {
    await servis.baslat({
      firmaId: 'f1',
      kullaniciId: 'u1',
      paketSurumuId: 's1',
      musteri,
    });
    return { tip: 'BASARILI' as const, mesaj: '' };
  } catch (e: any) {
    if (e instanceof BadRequestException)
      return { tip: 'BAD_REQUEST' as const, mesaj: String(e.message) };
    if (e instanceof TypeError)
      return { tip: 'TYPE_ERROR' as const, mesaj: String(e.message) };
    return { tip: e?.constructor?.name ?? 'BILINMEYEN', mesaj: String(e?.message) };
  }
}

async function main() {
  // ── P1 · SAF: eksik alan tespiti ──────────────────────────────────────
  console.log('\n── P1 · eksikMusteriAlanlari ──');
  check(
    'P1.1 govde YOK ise TUM zorunlu alanlar eksik',
    eksikMusteriAlanlari(undefined).length === ZORUNLU_MUSTERI_ALANLARI.length,
    `donen=${eksikMusteriAlanlari(undefined).length} beklenen=${ZORUNLU_MUSTERI_ALANLARI.length}`,
  );
  check('P1.2 tam govde ise eksik YOK', eksikMusteriAlanlari(TAM_MUSTERI).length === 0);
  check(
    'P1.3 ⭐ bosluk-only deger EKSIK sayilir',
    eksikMusteriAlanlari({ ...TAM_MUSTERI, telefon: '   ' }).join() === 'telefon',
    `donen=${eksikMusteriAlanlari({ ...TAM_MUSTERI, telefon: '   ' }).join()}`,
  );
  check(
    'P1.4 eksik alanin ADI doner (hangi alan oldugu belli)',
    eksikMusteriAlanlari({ ...TAM_MUSTERI, kimlikNo: '' }).join() === 'kimlikNo',
  );
  check(
    'P1.5 postaKodu ZORUNLU DEGIL (iyzico opsiyonel)',
    !ZORUNLU_MUSTERI_ALANLARI.includes('postaKodu' as any),
  );

  // ── P2 · SAF: miras paketi ayrimi ─────────────────────────────────────
  console.log('\n── P2 · mirasPaketiMi ──');
  check('P2.1 miras-core → true', mirasPaketiMi('miras-core'));
  check('P2.2 miras-pro → true', mirasPaketiMi('miras-pro'));
  check('P2.3 pro-mek → false', !mirasPaketiMi('pro-mek'));
  check('P2.4 basic-elk → false', !mirasPaketiMi('basic-elk'));
  check('P2.5 null/undefined → false', !mirasPaketiMi(null) && !mirasPaketiMi(undefined));

  // ── P3 ⭐ DAVRANIS: musteri govdesi yokken 400, 500 DEGIL ─────────────
  console.log('\n── P3 ⭐ musteri govdesi YOK ──');
  const i3 = sahteIyzico();
  const s3 = await baslatSonucu(sahtePrisma(null), i3.istemci, undefined);
  check(
    'P3.1 ⭐ 400 BadRequest atar (TypeError/500 DEGIL)',
    s3.tip === 'BAD_REQUEST',
    `donen=${s3.tip} mesaj=${s3.mesaj.slice(0, 90)}`,
  );
  check(
    'P3.2 hata mesaji hangi alanlarin eksik oldugunu SOYLER',
    s3.mesaj.includes('telefon') && s3.mesaj.includes('kimlikNo'),
    `mesaj=${s3.mesaj.slice(0, 120)}`,
  );
  check(
    'P3.3 ⭐ eksik govdede iyzico ucuna HIC gidilmez (bos istek atilmaz)',
    i3.cagrilar.length === 0,
    `cagri=${i3.cagrilar.length}`,
  );

  // Kismi govde de ayni yoldan donmeli.
  const i3b = sahteIyzico();
  const s3b = await baslatSonucu(
    sahtePrisma(null),
    i3b.istemci,
    { ad: 'Ayse', soyad: 'Yilmaz' },
  );
  check('P3.4 KISMI govde de 400 atar', s3b.tip === 'BAD_REQUEST', `donen=${s3b.tip}`);

  // ── OLCUT: tam govde + abonelik yok → GERCEKTEN basarili olmali ──────
  // Bu assert olmadan P3/P4 "her sey hata atiyor" halinde de yesil kalirdi.
  console.log('\n── P-OLCUT · mutlu yol gercekten calisiyor mu ──');
  const iM = sahteIyzico();
  const sM = await baslatSonucu(sahtePrisma(null), iM.istemci, TAM_MUSTERI);
  check(
    'P-OLCUT abonelik YOK + tam govde → BASARILI',
    sM.tip === 'BASARILI',
    `donen=${sM.tip} mesaj=${sM.mesaj.slice(0, 120)}`,
  );
  check('P-OLCUT iyzico gercekten cagrildi', iM.cagrilar.length === 1);
  check(
    'P-OLCUT govde iyzico alan adlarina cevrildi (ad→name, telefon→gsmNumber)',
    iM.cagrilar[0]?.musteri?.name === 'Ayse' &&
      iM.cagrilar[0]?.musteri?.gsmNumber === '+905301234567' &&
      iM.cagrilar[0]?.musteri?.identityNumber === '11111111111',
    JSON.stringify(iM.cagrilar[0]?.musteri ?? {}).slice(0, 140),
  );

  // ── P4 ⭐ DAVRANIS: miras satiri satin almayi ENGELLEMEZ ──────────────
  console.log('\n── P4 ⭐ miras satiri (goc emniyeti) ──');
  for (const kod of ['miras-core', 'miras-pro']) {
    const i4 = sahteIyzico();
    const s4 = await baslatSonucu(sahtePrisma(kod, 'AKTIF'), i4.istemci, TAM_MUSTERI);
    check(
      `P4 ⭐ ${kod} AKTIF iken satin alma GECER`,
      s4.tip === 'BASARILI' && i4.cagrilar.length === 1,
      `donen=${s4.tip} mesaj=${s4.mesaj.slice(0, 100)} iyzicoCagri=${i4.cagrilar.length}`,
    );
  }

  // ── P5 ⭐ DAVRANIS: GERCEK paket hala engeller (cift tahsilat kalkani) ─
  console.log('\n── P5 ⭐ gercek paket (cift tahsilat kalkani) ──');
  const i5 = sahteIyzico();
  const s5 = await baslatSonucu(sahtePrisma('pro-mek', 'AKTIF'), i5.istemci, TAM_MUSTERI);
  check(
    'P5.1 ⭐ pro-mek AKTIF iken satin alma REDDEDILIR',
    s5.tip === 'BAD_REQUEST',
    `donen=${s5.tip}`,
  );
  check('P5.2 ⭐ reddedilince iyzico ucuna gidilmez', i5.cagrilar.length === 0);

  const i5b = sahteIyzico();
  const s5b = await baslatSonucu(sahtePrisma('basic-mek', 'DENEME'), i5b.istemci, TAM_MUSTERI);
  check(
    'P5.3 DENEME durumundaki gercek paket de engeller',
    s5b.tip === 'BAD_REQUEST',
    `donen=${s5b.tip}`,
  );

  // ── P6 · SONA_ERDI / ASKIDA engellemez (eski davranis korundu) ────────
  console.log('\n── P6 · geri donen musteri ──');
  for (const durum of ['SONA_ERDI', 'ASKIDA']) {
    const i6 = sahteIyzico();
    const s6 = await baslatSonucu(sahtePrisma('pro-mek', durum), i6.istemci, TAM_MUSTERI);
    check(
      `P6 ${durum} durumunda yeniden satin alinabilir`,
      s6.tip === 'BASARILI',
      `donen=${s6.tip} mesaj=${s6.mesaj.slice(0, 90)}`,
    );
  }

  // ── P7 · On yuz ↔ sunucu zorunlu alan listeleri AYNI ─────────────────
  // Iki liste ayrisirsa: on yuz gondermez, sunucu ister → musteri kilitlenir.
  console.log('\n── P7 · on yuz ↔ sunucu alan sozlesmesi ──');
  const feYol = join(__dirname, '..', '..', 'frontend', 'ozellik', 'odeme', 'fatura-kimligi.ts');
  let feKaynak = '';
  try {
    feKaynak = readFileSync(feYol, 'utf8');
  } catch {
    /* asagida OLCUT yakalar */
  }
  check('P7-OLCUT on yuz dosyasi okunabildi', feKaynak.length > 0, feYol);
  if (feKaynak) {
    const blok = /export const ZORUNLU_ALANLAR = \[([\s\S]*?)\] as const;/.exec(feKaynak);
    check('P7-OLCUT on yuzde ZORUNLU_ALANLAR blogu bulundu', !!blok);
    if (blok) {
      const feAlanlar = [...blok[1].matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);
      check(
        'P7 ⭐ on yuz ve sunucu zorunlu alanlari AYNI',
        feAlanlar.join(',') === [...ZORUNLU_MUSTERI_ALANLARI].join(','),
        `on yuz=[${feAlanlar.join(',')}] sunucu=[${[...ZORUNLU_MUSTERI_ALANLARI].join(',')}]`,
      );
    }
  }

  // ── P8 ⭐ ERISIM KISALTILMIYOR (odemek, odememekten kotu OLMAMALI) ────
  //
  // 02.09'da olculdu: `aboneligiAcVeyaGuncelle` `erisimSonu`yu KOSULSUZ
  // eziyordu. Ayni gun satin alma yolu miras satirlarina acilinca bu
  // sessiz bir CEZAYA donustu — goc satiri 365 gun tasiyor, musteri
  // odeseydi `simdi+32 gune` duser ve ~332 gun buharlasirdi.
  //
  // Olcum DB'ye GIDEN YUKu yakalar; donen nesneye degil kaydedilen
  // degere bakar (donen nesne sahte, yuk gercek).
  console.log('\n── P8 ⭐ erisim kisaltilmiyor ──');
  {
    function yukYakalayanPrisma(mevcutErisimSonu: Date | null) {
      const yazilan: any[] = [];
      return {
        yazilan,
        prisma: {
          abonelik: {
            findUnique: async () =>
              mevcutErisimSonu === null
                ? null
                : { id: 'a1', erisimSonu: mevcutErisimSonu },
            update: async (arg: any) => {
              yazilan.push(arg.data);
              return { id: 'a1', ...arg.data };
            },
            create: async (arg: any) => {
              yazilan.push(arg.data);
              return { id: 'a1', ...arg.data };
            },
          },
          // Guncelleme dali sonrasinda denetim izi yaziliyor
          // (`abonelik.yeniden.acildi`). Sahtesi olmazsa akis P8'e
          // varmadan patlar ve olcum YAPILMAMIS olur.
          abonelikOlayi: { create: async () => ({}) },
        } as any,
      };
    }

    async function erisimSonuYazilan(mevcut: Date | null) {
      const y = yukYakalayanPrisma(mevcut);
      const servis = servisKur(y.prisma, sahteIyzico().istemci);
      await (servis as any).aboneligiAcVeyaGuncelle({
        firmaId: 'f1',
        paketSurumuId: 's1',
        iyzicoAbonelikKodu: 'sub-1',
        denemeGunu: 30,
      });
      return { yuk: y.yazilan[0], adet: y.yazilan.length };
    }

    const gun = 86_400_000;
    const simdi = Date.now();

    // OLCUT: mevcut satir YOKKEN normal hesap calisiyor mu? Bu assert
    // olmadan P8 "her zaman uzun tarih yaziliyor" halinde de yesil kalirdi.
    const yeni = await erisimSonuYazilan(null);
    const yeniGun = Math.round((new Date(yeni.yuk.erisimSonu).getTime() - simdi) / gun);
    check(
      'P8-OLCUT mevcut satir YOK -> normal donem yazilir (30+2 gun)',
      yeni.adet === 1 && yeniGun === 32,
      `gun=${yeniGun} (beklenen 32)`,
    );

    // ⭐ Miras satiri: 365 gunluk erisim KISALMAMALI.
    const uzun = new Date(simdi + 365 * gun);
    const mirasli = await erisimSonuYazilan(uzun);
    check(
      'P8.1 ⭐ 365 gunluk erisim odeme sonrasi KISALMIYOR',
      new Date(mirasli.yuk.erisimSonu).getTime() === uzun.getTime(),
      `yazilan=${new Date(mirasli.yuk.erisimSonu).toISOString().slice(0, 10)} ` +
        `beklenen=${uzun.toISOString().slice(0, 10)}`,
    );

    // Suresi GECMIS satir: yeni tarih kazanmali (geri donen musteri yolu).
    const gecmis = new Date(simdi - 60 * gun);
    const donen = await erisimSonuYazilan(gecmis);
    const donenGun = Math.round((new Date(donen.yuk.erisimSonu).getTime() - simdi) / gun);
    check(
      'P8.2 ⭐ suresi GECMIS satirda YENI tarih kazanir (32 gun)',
      donenGun === 32,
      `gun=${donenGun} (beklenen 32)`,
    );

    // Sinir: mevcut tarih yeniden KISA ise yine yeni kazanir.
    const kisa = new Date(simdi + 5 * gun);
    const kisali = await erisimSonuYazilan(kisa);
    const kisaGun = Math.round((new Date(kisali.yuk.erisimSonu).getTime() - simdi) / gun);
    check(
      'P8.3 mevcut 5 gun, yeni 32 gun -> UZUN olan (32) yazilir',
      kisaGun === 32,
      `gun=${kisaGun}`,
    );
  }

  // ── P9 ⭐ TELEFON BICIMI — giden istekte normalize edilmis mi ─────────
  //
  // 02.09 canli turunda musteri `05330983663` yazdi (Turkiye'de standart
  // yazim) ve uc `500 Internal server error` dondu. iyzico `gsmNumber`
  // alaninda ULKE KODLU bicim bekler.
  console.log('\n── P9 ⭐ telefon bicimi ──');
  check('P9.1 yerel yazim → +90', telefonuNormalize('05330983663') === '+905330983663',
    telefonuNormalize('05330983663'));
  check('P9.2 bosluk/tire temizlenir',
    telefonuNormalize('0533 098 36 63') === '+905330983663',
    telefonuNormalize('0533 098 36 63'));
  check('P9.3 parantezli yazim', telefonuNormalize('(0533) 098-3663') === '+905330983663',
    telefonuNormalize('(0533) 098-3663'));
  check('P9.4 bastaki sifirsiz (533...)', telefonuNormalize('5330983663') === '+905330983663',
    telefonuNormalize('5330983663'));
  check('P9.5 00 oneki → +', telefonuNormalize('00905330983663') === '+905330983663',
    telefonuNormalize('00905330983663'));
  check('P9.6 zaten dogru olan DEGISMEZ',
    telefonuNormalize('+905330983663') === '+905330983663');
  // ⚠ Fixture'in AYIRT EDICI olmasi sart: `'abc'`de temizlenecek karakter
  // YOK, yani ham === temiz olur ve "ham yerine temiz don" mutasyonu
  // HAYATTA KALIR (02.09'da tam boyle oldu). Tanimadigimiz ama BICIMLI
  // bir girdi lazim: `'123-456'` → temiz '123456', ikisi FARKLI.
  check('P9.7 ⭐ TANIMADIGI bicimi BOZMAZ — girdi AYNEN doner',
    telefonuNormalize('123-456') === '123-456',
    `donen=${telefonuNormalize('123-456')} (beklenen 123-456)`,
  );
  check('P9.7-b yurt disi numarasi da bozulmaz',
    telefonuNormalize('+1 415 555 0100') === '+14155550100',
    telefonuNormalize('+1 415 555 0100'),
  );

  // ⭐ DAVRANIS: normalize GERCEKTEN giden isteğe giriyor mu?
  // Saf fonksiyonun dogru olmasi, cagrildigini kanitlamaz — 02.09'da
  // `hasAnyDwg` tam boyle "tanimli ama cagrilmiyor" durumundaydi.
  const i9 = sahteIyzico();
  await baslatSonucu(sahtePrisma(null), i9.istemci, {
    ...TAM_MUSTERI,
    telefon: '0533 098 36 63',
  });
  check(
    'P9.8 ⭐ giden istekte gsmNumber NORMALIZE edilmis',
    i9.cagrilar[0]?.musteri?.gsmNumber === '+905330983663',
    `giden=${i9.cagrilar[0]?.musteri?.gsmNumber}`,
  );

  // ── P10 ⭐ IYZICO HATASI 500 DEGIL, ANLAMLI CEVAP OLMALI ──────────────
  //
  // `IyzicoHatasi extends Error` (HttpException DEGIL) oldugu icin Nest'in
  // varsayilan suzgeci govdeyi `500 Internal server error` yapiyordu ve
  // iyzico'nun gercek mesaji YUTULUYORDU. Musteri ekranda yalnizca
  // "Internal server error" goruyordu.
  console.log('\n── P10 ⭐ iyzico hatasi gorunur oluyor ──');
  check(
    'P10.1 iyzico 4xx → 400 (duzeltecek olan KULLANICI)',
    iyzicoDurumunuHttpyeCevir(400) === 400 && iyzicoDurumunuHttpyeCevir(422) === 400,
  );
  check(
    'P10.2 ⭐ diger/bilinmeyen → 502, 500 DEGIL (hata BIZDE degil)',
    iyzicoDurumunuHttpyeCevir(500) === 502 &&
      iyzicoDurumunuHttpyeCevir(undefined) === 502,
    `${iyzicoDurumunuHttpyeCevir(500)} / ${iyzicoDurumunuHttpyeCevir(undefined)}`,
  );
  check(
    'P10.3 ⭐ mesaj iyzico metnini TASIR (yutulmuyor)',
    kullaniciyaMesaj({ kod: '5006', message: 'gsmNumber gecersiz' }).includes(
      'gsmNumber gecersiz',
    ),
  );
  check(
    'P10.4 hata kodu da gosterilir (destege soylenebilsin)',
    kullaniciyaMesaj({ kod: '5006', message: 'x' }).includes('5006'),
  );
  check(
    'P10.5 ⭐ mesaj bossa bile "Internal server error" DEMEZ',
    (() => {
      const m = kullaniciyaMesaj({ message: '' });
      return m.length > 0 && !m.toLowerCase().includes('internal server error');
    })(),
    kullaniciyaMesaj({ message: '' }),
  );

  son();
}

function son() {
  console.log(
    `\n${'='.repeat(64)}\nSATIN ALMA YOLU: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
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
