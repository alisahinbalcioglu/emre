/**
 * FAZ 6.1 — ÇEVİRİ KOTASI TABLOSU + FİYAT UCU  (`npm run test:ceviri-kota`)
 *
 * DB'siz, deterministik. Üç şeyi ayrı ayrı kilitler:
 *
 *  A) TABLO — veritabanında 13.09'da ölçülen 7 paketin HER BİRİ açıkça bir
 *     hücreye düşüyor; hiçbiri en düşük kotaya "kazara" düşmüyor. Pro MEP
 *     kotası Pro'nunkinden FARKLI (seviye × kapsam, yalnız seviye değil).
 *  B) EŞLENMEMİŞ — tabloda olmayan birleşim en düşük kotayı alıyor, sınırsızı
 *     değil; prototip anahtarları ("constructor", "toString") eşleşme sanılmıyor.
 *  C) BAĞLANTI — `satistakiPaketler()` kotayı gerçekten TABLODAN ekliyor;
 *     `GET /fiyatlar` JWT istemiyor, modüle kayıtlı ve aynı metodu çağırıyor;
 *     `GET /abonelik/paketler` da aynı metodu çağırıyor (iki sayfa, bir kaynak).
 *
 * Bağlantı blokları "mekanizma var, çağıran yok" dersinin kapısıdır: tablo
 * doğru olsa bile servis onu okumuyorsa fiyat sayfası boş ya da yanlış kalır.
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · 1 = FAIL.
 */
import 'reflect-metadata';
import {
  EN_DUSUK_KOTA,
  ceviriKotasiCoz,
  kotaHucreleri,
} from '../src/ozellik/odeme/abonelik/ceviri-kotasi';
import { SatinAlmaServisi } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { FIYAT_ONBELLEK_MS, FiyatController } from '../src/ozellik/odeme/abonelik/fiyat.controller';
import { AbonelikController } from '../src/ozellik/odeme/abonelik/abonelik.controller';
import { OdemeModule } from '../src/ozellik/odeme/odeme.module';
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

// ── A) TABLO ────────────────────────────────────────────────────────────────
console.log('\nA) Veritabanındaki 7 paketin kotası (13.09 ölçümü)');

/**
 * FIXTURE KANITI: bu liste varsayım değil, 13.09 ölçüm turunda üretim
 * dökümünün kopyasından okundu (`Paket` tablosu, 7 satır). Beşi
 * `backend/scripts/paketleri-kur.ts`'ten, ikisi (miras-*) ADIM 2 göç
 * migration'ından geliyor. Yeni paket açılırsa bu liste de uzamalı.
 */
const DB_PAKETLERI = [
  { kod: 'basic-mek', seviye: 'core', kapsam: 'mechanical', satir: 3000, dosya: 30 },
  { kod: 'basic-elk', seviye: 'core', kapsam: 'electrical', satir: 3000, dosya: 30 },
  { kod: 'pro-mek', seviye: 'pro', kapsam: 'mechanical', satir: 4500, dosya: 60 },
  { kod: 'pro-elk', seviye: 'pro', kapsam: 'electrical', satir: 4500, dosya: 60 },
  { kod: 'pro-mep', seviye: 'pro', kapsam: 'mep', satir: 9000, dosya: 120 },
  { kod: 'miras-core', seviye: 'core', kapsam: 'mep', satir: 6000, dosya: 60 },
  { kod: 'miras-pro', seviye: 'pro', kapsam: 'mep', satir: 9000, dosya: 120 },
];

check('fixture 7 paket taşıyor', DB_PAKETLERI.length === 7, `${DB_PAKETLERI.length}`);

for (const p of DB_PAKETLERI) {
  const k = ceviriKotasiCoz(p);
  check(`${p.kod} açıkça eşlendi (en düşüğe DÜŞMEDİ)`, k.eslendi === true);
  check(
    `${p.kod} = ${p.satir} satır / ${p.dosya} dosya`,
    k.satir === p.satir && k.dosya === p.dosya,
    `gelen ${k.satir}/${k.dosya}`,
  );
}

const proMek = ceviriKotasiCoz({ seviye: 'pro', kapsam: 'mechanical' });
const proMep = ceviriKotasiCoz({ seviye: 'pro', kapsam: 'mep' });
check(
  'Pro MEP kotası Pro tek disiplinin İKİ KATI (seviye × kapsam, yalnız seviye değil)',
  proMep.satir === 2 * proMek.satir && proMep.dosya === 2 * proMek.dosya,
  `pro-mek ${proMek.satir}/${proMek.dosya} · pro-mep ${proMep.satir}/${proMep.dosya}`,
);

const hucreler = kotaHucreleri();
check('tablo tam 6 hücre (2 seviye × 3 kapsam)', hucreler.length === 6, `${hucreler.length}`);
const enKucukSatir = Math.min(...hucreler.map((h) => h.satir));
const enKucukDosya = Math.min(...hucreler.map((h) => h.dosya));
check(
  'EN_DUSUK_KOTA tablonun en küçük hücresi (tablo değişip sabit geride kalamaz)',
  EN_DUSUK_KOTA.satir === enKucukSatir && EN_DUSUK_KOTA.dosya === enKucukDosya,
  `sabit ${EN_DUSUK_KOTA.satir}/${EN_DUSUK_KOTA.dosya} · tablo min ${enKucukSatir}/${enKucukDosya}`,
);
check(
  'her hücre pozitif ve sonlu (sınırsız kota YOK)',
  hucreler.every((h) => Number.isFinite(h.satir) && h.satir > 0 && Number.isFinite(h.dosya) && h.dosya > 0),
);

// ── B) EŞLENMEMİŞ ───────────────────────────────────────────────────────────
console.log('\nB) Eşlenmemiş birleşim en düşük kotaya düşer');

const eslenmemisler: Array<{ seviye: string; kapsam: string }> = [
  { seviye: 'suite', kapsam: 'mep' },
  { seviye: 'core', kapsam: 'bilinmeyen' },
  { seviye: '', kapsam: '' },
  // Prototip anahtarları: köşeli parantez tek başına bunları EŞLEŞME sanır.
  { seviye: 'core', kapsam: 'constructor' },
  { seviye: 'pro', kapsam: 'toString' },
  { seviye: 'constructor', kapsam: 'mep' },
  { seviye: '__proto__', kapsam: 'mechanical' },
];
for (const e of eslenmemisler) {
  const k = ceviriKotasiCoz(e);
  check(
    `${JSON.stringify(e)} → eslendi=false, ${EN_DUSUK_KOTA.satir}/${EN_DUSUK_KOTA.dosya}`,
    k.eslendi === false && k.satir === EN_DUSUK_KOTA.satir && k.dosya === EN_DUSUK_KOTA.dosya,
    `gelen ${JSON.stringify(k)}`,
  );
}

// ── C) BAĞLANTI ─────────────────────────────────────────────────────────────
async function baglanti(): Promise<void> {
  console.log('\nC) Servis kotayı tablodan ekliyor · uçlar aynı kaynağı okuyor');

  const ondalik = (s: string) => ({ toFixed: () => s });
  // ⚠ SAHTE SATIRLAR GERÇEK SATIRIN BÜTÜN ALANLARINI TAŞIR — sızıntı kontrolü
  // ancak sızacak şey fixture'da VARSA bir şey ölçer. İlk sürümde iyzico
  // alanları yoktu ve `surum: {...s}` yapan bir eşleyici yeşil kalıyordu
  // (14.09 kod incelemesi).
  const SIZINTI = 'SIZINTI-IZI';
  const surumSatiri = (id: string, tutar: string, ref: string | null, deneme: number) => ({
    id,
    paketId: 'x',
    surumNo: 1,
    iyzicoPlanKodu: `${SIZINTI}-plan`,
    iyzicoUrunKodu: `${SIZINTI}-urun`,
    tutar: ondalik(tutar),
    paraBirimi: 'TRY',
    referansTutar: ref ? ondalik(ref) : null,
    referansParaBirimi: ref ? 'USD' : null,
    kurDegeri: ondalik('48.2759'),
    kurTarihi: new Date('2026-09-01T00:00:00Z'),
    periyot: 'MONTHLY',
    periyotAdedi: 1,
    denemeGunu: deneme,
    satistaMi: true,
    olusturuldu: new Date('2026-09-01T00:00:00Z'),
  });
  const paketSatiri = (id: string, kod: string, kapsam: string, seviye: string, surum: object) => ({
    id,
    kod,
    ad: kod,
    aciklama: null,
    sira: 10,
    kapsam,
    seviye,
    kullaniciHakki: 2,
    aylikTeklifHakki: null,
    dwgAktif: seviye === 'pro',
    aktif: true,
    olusturuldu: new Date('2026-09-01T00:00:00Z'),
    surumler: [surum],
  });
  const sahtePaketler = [
    ...DB_PAKETLERI.filter((p) => !p.kod.startsWith('miras')).map((p, i) =>
      paketSatiri(`p${i}`, p.kod, p.kapsam, p.seviye, surumSatiri(`s${i}`, '1299.00', '22.00', 30)),
    ),
    // Tabloda OLMAYAN birleşim: servis en düşüğe düşürmeli ve UYARMALI.
    paketSatiri('px', 'gelecek-paket', 'mep', 'suite', surumSatiri('sx', '9999.00', null, 0)),
  ];
  check('FIXTURE KANITI: sahte sürüm iyzico kodu TAŞIYOR', JSON.stringify(sahtePaketler).includes(SIZINTI));
  const sahtePrisma = { paket: { findMany: async () => sahtePaketler } };
  const servis = new SatinAlmaServisi(
    sahtePrisma as any,
    {} as any,
    {} as any,
    { get: () => undefined } as any,
    // Faz 6.12a: DenemeHakkiServisi — satistakiPaketler() onu ÇAĞIRMAZ (K-P7).
    {} as any,
    // Faz 6.4: EpostaServisi — satistakiPaketler() onu da ÇAĞIRMAZ.
    {} as any,
  );
  const uyarilar: string[] = [];
  (servis as any).logger = { warn: (m: string) => uyarilar.push(m), log: () => {}, error: () => {} };

  const liste = (await servis.satistakiPaketler()) as any[];
  for (const p of DB_PAKETLERI.filter((x) => !x.kod.startsWith('miras'))) {
    const satir = liste.find((x) => x.kod === p.kod);
    check(
      `satistakiPaketler: ${p.kod}.ceviriKotasi = ${p.satir}/${p.dosya}`,
      !!satir && satir.ceviriKotasi?.satir === p.satir && satir.ceviriKotasi?.dosya === p.dosya,
      `gelen ${JSON.stringify(satir?.ceviriKotasi)}`,
    );
  }
  const gelecek = liste.find((x) => x.kod === 'gelecek-paket');
  check(
    'tabloda olmayan paket en düşük kotayla listelendi (sınırsız değil)',
    gelecek?.ceviriKotasi?.satir === EN_DUSUK_KOTA.satir && gelecek?.ceviriKotasi?.dosya === EN_DUSUK_KOTA.dosya,
    `gelen ${JSON.stringify(gelecek?.ceviriKotasi)}`,
  );
  check(
    'tabloda olmayan paket için UYARI yazıldı (sessiz düşürme yok)',
    uyarilar.some((u) => u.includes('gelecek-paket')),
    `uyarılar: ${JSON.stringify(uyarilar)}`,
  );
  check(
    'eşlenmiş paketler için uyarı YOK (gürültü yok)',
    uyarilar.length === 1,
    `${uyarilar.length} uyarı`,
  );
  await servis.satistakiPaketler();
  check('aynı eşlenmemiş paket için uyarı İKİNCİ çağrıda tekrarlanmıyor', uyarilar.length === 1, `${uyarilar.length} uyarı`);
  check(
    'çıktı iyzico plan/ürün kodu taşımıyor (girişsiz uca sızmaz)',
    !JSON.stringify(liste).includes(SIZINTI),
  );
  const PAKET_ANAHTARLARI = ['aciklama', 'ad', 'aylikTeklifHakki', 'ceviriKotasi', 'dwgAktif', 'kapsam', 'kod', 'kullaniciHakki', 'paketId', 'seviye', 'surum'];
  const SURUM_ANAHTARLARI = ['denemeGunu', 'paketSurumuId', 'paraBirimi', 'periyot', 'periyotAdedi', 'referansParaBirimi', 'referansTutar', 'tutar'];
  const ilk = liste[0] ?? {};
  check(
    'paket nesnesinin anahtarları izin listesiyle BİREBİR',
    JSON.stringify(Object.keys(ilk).sort()) === JSON.stringify(PAKET_ANAHTARLARI),
    JSON.stringify(Object.keys(ilk).sort()),
  );
  check(
    'sürüm nesnesinin anahtarları izin listesiyle BİREBİR',
    JSON.stringify(Object.keys(ilk.surum ?? {}).sort()) === JSON.stringify(SURUM_ANAHTARLARI),
    JSON.stringify(Object.keys(ilk.surum ?? {}).sort()),
  );

  // Girişsiz uç: JWT guard YOK, hız sınırı VAR.
  const guardAdlari = ((Reflect.getMetadata('__guards__', FiyatController) ?? []) as any[]).map((g) => g?.name);
  check('FiyatController JwtAuthGuard TAŞIMIYOR (fiyat sayfası girişsiz)', !guardAdlari.includes('JwtAuthGuard'), JSON.stringify(guardAdlari));
  check('FiyatController ThrottlerGuard taşıyor (IP başına sınır)', guardAdlari.includes('ThrottlerGuard'), JSON.stringify(guardAdlari));
  const metotGuardlari = ((Reflect.getMetadata('__guards__', FiyatController.prototype.fiyatlar) ?? []) as any[]).map((g) => g?.name);
  check('fiyatlar() metodunda da JWT guard yok', !metotGuardlari.includes('JwtAuthGuard'), JSON.stringify(metotGuardlari));
  check('rota yolu "fiyatlar"', Reflect.getMetadata('path', FiyatController) === 'fiyatlar', String(Reflect.getMetadata('path', FiyatController)));

  const kayitli = (Reflect.getMetadata('controllers', OdemeModule) ?? []) as any[];
  check('FiyatController OdemeModule\'e KAYITLI (rota gerçekten açılıyor)', kayitli.includes(FiyatController));

  const isaret = [{ kod: 'isaret' }];
  let cagri = 0;
  const sahteServis = { satistakiPaketler: async () => { cagri++; return isaret; } } as any;
  const fiyatUcu = new FiyatController(sahteServis);

  // ⚠ KARARSIZ TEST DÜZELTMESİ (15.09): `t0` ilk istekten SONRA okunuyordu.
  // Uç önbelleği ilk istekteki `Date.now()` ile kurar (gecerliSon = T1 + süre);
  // `t0 + süre - 1 < T1 + süre` yalnız T1 == t0 iken doğru. Araya giren konsol
  // çıktısı 1 ms'yi aşınca "2 çağrı" ile düşüyordu (regresyonda + tek başına
  // 12 koşumda 2 düşüş; ilk istekle t0 arasına 2 ms koyunca HER SEFER düştü).
  // ms eşitliği testte KURULUR: saat ilk istekten ÖNCE dondurulur.
  const gercekSaat = Date.now;
  const t0 = gercekSaat();
  try {
    Date.now = () => t0;
    check('GET /fiyatlar → satistakiPaketler() (aynı kaynak)', (await fiyatUcu.fiyatlar()) === isaret);
    Date.now = () => t0 + FIYAT_ONBELLEK_MS - 1;
    await fiyatUcu.fiyatlar();
    check('önbellek süresi içinde ikinci istek veritabanına GİTMİYOR', cagri === 1, `${cagri} çağrı`);
    Date.now = () => t0 + FIYAT_ONBELLEK_MS + 1;
    await fiyatUcu.fiyatlar();
    check('süre dolunca yeniden okunuyor (fiyat değişikliği bayat kalmıyor)', cagri === 2, `${cagri} çağrı`);
  } finally {
    Date.now = gercekSaat;
  }
  // Faz 6.12a (16.09, BİLİNÇLİ GÜNCELLEME): uç eskiden listeyi AYNEN döndürüyordu
  // ve bu kontrol nesne kimliğiyle (===) yapılıyordu. Artık firma bazlı deneme
  // hakkı sürüme EKLENİYOR (girişsiz /fiyatlar'a değil — K-P7), yani kimlik
  // değişir. Kural aynı: aynı metot, bir kez, kaynak alanlar aynen.
  const isaretSurumlu = [{ kod: 'isaret', surum: { denemeGunu: 30 } }];
  let abonelikCagri = 0;
  const abonelikUcu = new AbonelikController(
    {} as any,
    { satistakiPaketler: async () => { abonelikCagri++; return isaretSurumlu; } } as any,
    { karar: async () => ({ hak: true, gerekce: 'var', anahtarlar: {} }) } as any,
    // 23.09: paket değişimi yolu (kart düğmesi) — bu kapının konusu değil;
    // boş harita → her kart "satin-al" (değişimin kendi kapısı: test:paket-degisimi).
    { yollar: async () => new Map() } as any,
    // 24.09 (A2 Blok 2): bekleyen yönetici önerisi — bu kapının konusu değil
    // (öneri yok); önerinin kendi kapısı test:yonetici-paket.
    { bekleyen: async () => null } as any,
    // 26.09: anlık ödeme denemesi (DunningServisi) — bu kapının konusu değil;
    // kendi kapısı test:aninda-tahsilat.
    {} as any,
  );
  const donen = (await abonelikUcu.paketler({ id: 'u1', firmaId: 'f1' })) as any[];
  check(
    'GET /abonelik/paketler → satistakiPaketler() (aynı kaynak, bir kez)',
    abonelikCagri === 1 && donen.length === 1 && donen[0].kod === 'isaret' && donen[0].surum.denemeGunu === 30,
    JSON.stringify(donen),
  );
}

bitmezseKirmizi(baglanti()
  .catch((e) => {
    failed++;
    failures.push(`bağlantı bloğu patladı: ${(e as Error).message}`);
    console.log(`  ✗ bağlantı bloğu patladı: ${(e as Error).stack}`);
  })
  .finally(() => {
    console.log(`\n${passed} geçti · ${failed} kaldı`);
    if (failed > 0) {
      console.log('\nKALANLAR:');
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exit(1);
    }
    process.exit(0);
  }));
