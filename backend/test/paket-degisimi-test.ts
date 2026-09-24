/**
 * PAKET DEGISIMI — KAPI · `npm run test:paket-degisimi`
 * (23.09.2026, yonetici paneli turu A1 — Emre karari)
 *
 * DB GEREKTIRMEZ · AG GEREKTIRMEZ · IYZICO GEREKTIRMEZ (sahte Prisma + iyzico).
 *
 * ── BU TUR NEDEN VAR ─────────────────────────────────────────────────────
 * `IyzicoClient.paketDegistir` TANIMLIYDI ama HICBIR YERDEN CAGRILMIYORDU.
 * Aktif abonelikli firma baska pakete gecemiyordu — DAHA FAZLA odemek isteyen
 * bile (gelir acigi). Hata mesaji olmayan bir "yukseltme yolu"nu gosteriyordu.
 *
 * Emre karari: yukseltme → ozellikler HEMEN, ucret DONEM SONUNDA. Dusurme →
 * ikisi de DONEM SONUNDA. iyzico'ya HER ZAMAN `NEXT_PERIOD` (NOW kist hesap
 * yapmaz, 20.08 olcumu). iyzico kisiti (resmi dokuman): gecis yalniz AYNI
 * URUN altindaki planlar arasinda.
 *
 * ── BLOKLAR ──────────────────────────────────────────────────────────────
 *   H · Hak karsilastirmasi: 5×5 GERCEK paket matrisi (yon HAKLA, fiyatla degil)
 *   Y · Yol karari: satin-al / degistir / yok (+ satin alma kapisiyla TEK kural)
 *   T · Tarih: iyzico `startDate` (ms sayisi) + deneme tamponu tuzagi
 *   S · Servis: sira (once iyzico), NEXT_PERIOD, yazilan alanlar, onayin izi
 *   G · Planli gecis: vade, tek kaynak, idempotent, tarama
 *   W · Webhook: odenen plana hizalama, eski halka, erisim kisalmaz, zincir
 *   R · Temizlik: yeniden abonelik ve iptal planli gecisi siler
 *   B · Baglanti: uc, kapilar, modul, kurulum betigi
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { AbonelikDurumu } from '@prisma/client';

import {
  beklenenGecisTarihi,
  degisimCumlesi,
  gecisTarihiSec,
  iyzicoTarihi,
  paketDegisimYolu,
  paketHakKayiplari,
  tlYaz,
  yeniAbonelikEngelliMi,
  type DegisimAboneligi,
  type DegisimSurumu,
  type PaketHaklari,
} from '../src/ozellik/odeme/abonelik/paket-degisimi';
import {
  SatinAlmaServisi,
  yeniAbonelikEngelliMi as satinAlmaKapisi,
} from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { PaketDegisimiServisi } from '../src/ozellik/odeme/abonelik/paket-degisimi.servisi';
import { IyzicoHatasi } from '../src/ozellik/odeme/iyzico/iyzico.client';
import { HUKUKI_METIN_SURUMU } from '../src/altyapi/auth/hukuki-surum';
import {
  TEK_URUN_ADI,
  tekUrunPlanTanimlari,
  tekUruneTasinmaliMi,
} from '../scripts/paketleri-kur';

Logger.overrideLogger(false);

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
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');
/** Yorumlari atar: kapi YORUMU degil KODU olcsun. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const GUN = 86_400_000;
// ⚠ GERCEK SAAT, sabit tarih DEGIL: servis kendi `new Date()`sini kullaniyor.
// Sabit bir SIMDI yazilsaydi test o tarihten 20 gun sonra CI'da kirmiziya
// donerdi (fikstur erisimSonu'lari "gecmis" olur) — kararsiz test uretmek.
const SIMDI = new Date();
const gunSonra = (n: number) => new Date(SIMDI.getTime() + n * GUN);

// ═══════════════════════════════════════════════════════════════════════════
//  GERCEK KATALOG — paketleri-kur.ts PAKETLER ile AYNI haklar (17.09 E-2)
// ═══════════════════════════════════════════════════════════════════════════
const HAKLAR: Record<string, PaketHaklari> = {
  'basic-mek': { seviye: 'core', kapsam: 'mechanical', kullaniciHakki: 1, dwgAktif: false, aylikTeklifHakki: null },
  'pro-mek': { seviye: 'pro', kapsam: 'mechanical', kullaniciHakki: 2, dwgAktif: true, aylikTeklifHakki: null },
  'basic-elk': { seviye: 'core', kapsam: 'electrical', kullaniciHakki: 1, dwgAktif: false, aylikTeklifHakki: null },
  'pro-elk': { seviye: 'pro', kapsam: 'electrical', kullaniciHakki: 2, dwgAktif: true, aylikTeklifHakki: null },
  'pro-mep': { seviye: 'pro', kapsam: 'mep', kullaniciHakki: 3, dwgAktif: true, aylikTeklifHakki: null },
};
const TUTAR: Record<string, string> = {
  'basic-mek': '1299.00',
  'pro-mek': '1649.00',
  'basic-elk': '1299.00',
  'pro-elk': '1649.00',
  'pro-mep': '2449.00',
};
const TEK_URUN = 'urun-tek';

/** Sahte `PaketSurumu` (Prisma bicimi: `tutar` Decimal gibi `toFixed` tasir). */
function surum(kod: string, o: Record<string, unknown> = {}): any {
  const tutar = (o.tutarDize as string) ?? TUTAR[kod] ?? '0.00';
  return {
    id: `s-${kod}`,
    paketId: `p-${kod}`,
    surumNo: 2,
    satistaMi: true,
    periyot: 'MONTHLY',
    periyotAdedi: 1,
    iyzicoUrunKodu: TEK_URUN,
    iyzicoPlanKodu: `plan-${kod}`,
    iyzicoDenemesizPlanKodu: `plan-${kod}-denemesiz`,
    denemeGunu: 30,
    paraBirimi: 'TRY',
    tutar: { toFixed: (n: number) => Number(tutar).toFixed(n), toString: () => tutar },
    paket: { kod, ad: `Paket ${kod}`, ...(HAKLAR[kod] ?? HAKLAR['basic-mek']) },
    ...o,
  };
}

/** Sahte `Abonelik` (paketSurumu dahil). */
function abonelik(kod: string, o: Record<string, unknown> = {}): any {
  const s = surum(kod);
  return {
    id: 'ab1',
    firmaId: 'f1',
    paketSurumuId: s.id,
    paketSurumu: s,
    planliPaketSurumuId: null,
    paketGecisTarihi: null,
    durum: AbonelikDurumu.AKTIF,
    erisimSonu: gunSonra(20),
    denemeSonu: null,
    odemeYontemi: 'KART',
    iyzicoAbonelikKodu: 'uc-0',
    iyzicoKokKodu: 'uc-0',
    iyzicoMusteriKodu: 'm-1',
    iyzicoDurum: 'ACTIVE',
    odenenPaketSurumuId: null,
    ilkBasarisizlik: null,
    sonDeneme: null,
    ...o,
  };
}

function hBlogu(): void {
  // ── H · HAK KARSILASTIRMASI ─────────────────────────────────────────────
  console.log('\n── H · hak karsilastirmasi (yon HAKLA belirlenir) ──');

  // ⚠ BEKLENEN KUME ELLE YAZILDI — fonksiyondan TURETILMEDI (dairesel olcut
  // yasak). Bir paketin haklarinin TAMAMINI kapsayan (ve ondan farkli) paket:
  const HEMEN_ELLE = new Set([
    'basic-mek>pro-mek',
    'basic-mek>pro-mep',
    'basic-elk>pro-elk',
    'basic-elk>pro-mep',
    'pro-mek>pro-mep',
    'pro-elk>pro-mep',
  ]);
  const kodlar = Object.keys(HAKLAR);
  let cift = 0;
  const hemenBulunan = new Set<string>();
  for (const a of kodlar) {
    for (const b of kodlar) {
      if (a === b) continue;
      cift++;
      if (paketHakKayiplari(HAKLAR[a], HAKLAR[b]).length === 0) hemenBulunan.add(`${a}>${b}`);
    }
  }
  check('H0-OLCUT 5×5 matris: 20 farkli cift karsilastirildi', cift === 20, `cift=${cift}`);
  const fark = [...hemenBulunan].filter((x) => !HEMEN_ELLE.has(x))
    .concat([...HEMEN_ELLE].filter((x) => !hemenBulunan.has(x)));
  check(
    'H1 ⭐ "hemen" ciftleri TAM OLARAK elle yazilan 6 cift (kalan 14 donem sonu)',
    fark.length === 0 && hemenBulunan.size === 6,
    `fark=${JSON.stringify(fark)}`,
  );

  const k = (a: string, b: string) => paketHakKayiplari(HAKLAR[a], HAKLAR[b]).sort().join(',');
  check('H2 pro-mek → basic-mek: seviye+kullanici+dwg+ceviri kaybi', k('pro-mek', 'basic-mek') === 'ceviri,dwg,kullanici,seviye', k('pro-mek', 'basic-mek'));
  check('H3 ⭐ basic-mek → basic-elk (YATAY): yalniz kapsam kaybi → donem sonu', k('basic-mek', 'basic-elk') === 'kapsam', k('basic-mek', 'basic-elk'));
  check('H4 pro-mep → pro-mek: kapsam+kullanici+ceviri kaybi', k('pro-mep', 'pro-mek') === 'ceviri,kapsam,kullanici', k('pro-mep', 'pro-mek'));

  // FAIL-CLOSED: tanimadigi deger KAYIP sayilir.
  const bilinmeyenSeviye = { ...HAKLAR['pro-mek'], seviye: 'suite' };
  check('H5 bilinmeyen seviye (suite) → seviye KAYBI (fail-closed)', paketHakKayiplari(HAKLAR['basic-mek'], bilinmeyenSeviye).includes('seviye'));
  const bilinmeyenKapsam = { ...HAKLAR['pro-mep'], kapsam: 'tesisat' };
  check('H6 bilinmeyen kapsam → kapsam KAYBI', paketHakKayiplari(HAKLAR['pro-mek'], bilinmeyenKapsam).includes('kapsam'));
  // ⚠ Map yerine duz nesne kullanilsa `constructor` bir FONKSIYON donerdi.
  const kurnaz = { ...HAKLAR['pro-mek'], seviye: 'constructor', kapsam: 'toString' };
  const kurnazKayip = paketHakKayiplari(HAKLAR['basic-mek'], kurnaz);
  check('H7 prototip anahtari (constructor/toString) bilinmeyen sayilir', kurnazKayip.includes('seviye') && kurnazKayip.includes('kapsam'), kurnazKayip.join(','));

  // Teklif hakki: null = sinirsiz.
  const t = (m: number | null, y: number | null) =>
    paketHakKayiplari({ ...HAKLAR['pro-mek'], aylikTeklifHakki: m }, { ...HAKLAR['pro-mek'], aylikTeklifHakki: y }).includes('teklif');
  check('H8 sinirsiz → 100 teklif: KAYIP', t(null, 100) === true);
  check('H9 100 → sinirsiz: kayip DEGIL', t(100, null) === false);
  check('H10 100 → 50: KAYIP · 50 → 100: kayip degil', t(100, 50) === true && t(50, 100) === false);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Y · YOL KARARI
// ═══════════════════════════════════════════════════════════════════════════
function yBlogu(): void {
  console.log('\n── Y · yol karari (satin-al / degistir / yok) ──');
  const yol = (ab: DegisimAboneligi | null, hedef: DegisimSurumu) => paketDegisimYolu(ab, hedef, SIMDI);
  const kodu_ = (r: ReturnType<typeof yol>) => (r.yol === 'yok' ? r.kod : r.yol);

  check('Y1 abonelik YOK → satin-al', yol(null, surum('pro-mek')).yol === 'satin-al');
  const miras = abonelik('basic-mek');
  miras.paketSurumu = { ...miras.paketSurumu, paket: { ...miras.paketSurumu.paket, kod: 'miras-pro' } };
  check('Y2 miras → satin-al (goc emniyeti tahsilat degil)', yol(miras, surum('pro-mek')).yol === 'satin-al');
  // ⚠ 24.09 — geri donen musteri YALNIZ iyzico'daki kart aboneligi kapaliysa
  // satin alir (cift cekim korumasi, `iyzicoAboneligiAcikMi`). Fikstur
  // varsayilani `iyzicoDurum: 'ACTIVE'`; sona ermis/askidaki satirin gercekci
  // iyzico durumu CANCELED/EXPIRED/UNPAID'dir.
  check('Y3 SONA_ERDI (iyzico CANCELED) → satin-al',
    yol(abonelik('basic-mek', { durum: 'SONA_ERDI', iyzicoDurum: 'CANCELED' }), surum('pro-mek')).yol === 'satin-al');
  check('Y4 ASKIDA (iyzico UNPAID) → satin-al',
    yol(abonelik('basic-mek', { durum: 'ASKIDA', iyzicoDurum: 'UNPAID' }), surum('pro-mek')).yol === 'satin-al');
  check('Y3b ⭐ SONA_ERDI ama iyzico hala ACTIVE → KART_ABONELIGI_ACIK (yeni abonelik eskisini sahipsiz birakirdi)',
    kodu_(yol(abonelik('basic-mek', { durum: 'SONA_ERDI', iyzicoDurum: 'ACTIVE' }), surum('pro-mek'))) === 'KART_ABONELIGI_ACIK');
  check('Y4b ⭐ ASKIDA ama iyzico hala ACTIVE → KART_ABONELIGI_ACIK',
    kodu_(yol(abonelik('basic-mek', { durum: 'ASKIDA', iyzicoDurum: 'ACTIVE' }), surum('pro-mek'))) === 'KART_ABONELIGI_ACIK');

  check('Y5 ayni paket → AYNI_PAKET', kodu_(yol(abonelik('pro-mek'), surum('pro-mek'))) === 'AYNI_PAKET');
  check('Y6 satista olmayan surum → SATISTA_DEGIL', kodu_(yol(abonelik('basic-mek'), surum('pro-mek', { satistaMi: false }))) === 'SATISTA_DEGIL');
  check('Y7 HAVALE → HAVALE', kodu_(yol(abonelik('basic-mek', { odemeYontemi: 'HAVALE' }), surum('pro-mek'))) === 'HAVALE');
  check('Y8 KART ama iyzico kodu yok → KART_BAGI_YOK', kodu_(yol(abonelik('basic-mek', { iyzicoAbonelikKodu: null }), surum('pro-mek'))) === 'KART_BAGI_YOK');
  check('Y9 ODEME_BEKLIYOR → ODEME_SORUNU', kodu_(yol(abonelik('basic-mek', { durum: 'ODEME_BEKLIYOR' }), surum('pro-mek'))) === 'ODEME_SORUNU');
  check('Y10 KISITLI → ODEME_SORUNU', kodu_(yol(abonelik('basic-mek', { durum: 'KISITLI' }), surum('pro-mek'))) === 'ODEME_SORUNU');
  const iptal = yol(abonelik('basic-mek', { durum: 'IPTAL', erisimSonu: new Date('2026-10-05T09:00:00Z') }), surum('pro-mek'));
  check(
    'Y11 IPTAL → IPTAL_EDILDI + bitis tarihi TR biciminde',
    iptal.yol === 'yok' && iptal.kod === 'IPTAL_EDILDI' && iptal.mesaj.includes('05.10.2026'),
    JSON.stringify(iptal),
  );
  check('Y12 erisimSonu gecmis → SURESI_DOLDU', kodu_(yol(abonelik('basic-mek', { erisimSonu: gunSonra(-1) }), surum('pro-mek'))) === 'SURESI_DOLDU');
  const bekliyor = yol(abonelik('basic-mek', { paketGecisTarihi: gunSonra(10) }), surum('pro-mek'));
  check('Y13 ⭐ bu donem degisim yapildi (gecis gelecekte) → DEGISIM_BEKLIYOR', bekliyor.yol === 'yok' && bekliyor.kod === 'DEGISIM_BEKLIYOR', JSON.stringify(bekliyor));
  // ⭐ KILIT TARIHLE DEGIL ODEMEYLE KALKAR (inceleme bulgusu 4): gecis tarihi
  // gecmis ama yeni ucun ilk tahsilati gorulmemis → hala kilitli; mesaj
  // gecmis tarih YAZMAZ, "ilk odeme bekleniyor" der.
  const tarihGecti = yol(abonelik('basic-mek', { paketGecisTarihi: gunSonra(-1) }), surum('pro-mek'));
  check(
    'Y14 ⭐ gecis tarihi GECMIS ama kilit kalkmamis → hala DEGISIM_BEKLIYOR ("ilk ödemesi alındıktan sonra")',
    tarihGecti.yol === 'yok' && tarihGecti.kod === 'DEGISIM_BEKLIYOR' && tarihGecti.mesaj.includes('ilk ödemesi alındıktan sonra'),
    JSON.stringify(tarihGecti),
  );
  check('Y14b kilit yok (webhook kaldirdi) → yol acik', yol(abonelik('basic-mek', { paketGecisTarihi: null }), surum('pro-mek')).yol === 'degistir');
  check('Y15 periyot farkli (YEARLY) → PERIYOT_FARKLI (iyzico 201406)', kodu_(yol(abonelik('basic-mek'), surum('pro-mek', { periyot: 'YEARLY' }))) === 'PERIYOT_FARKLI');
  check('Y16 periyot adedi farkli → PERIYOT_FARKLI', kodu_(yol(abonelik('basic-mek'), surum('pro-mek', { periyotAdedi: 3 }))) === 'PERIYOT_FARKLI');
  check('Y17 ⭐ farkli iyzico URUNU → URUN_FARKLI (iyzico resmi kisiti)', kodu_(yol(abonelik('basic-mek'), surum('pro-mek', { iyzicoUrunKodu: 'urun-pro-mek' }))) === 'URUN_FARKLI');

  const yuk = yol(abonelik('basic-mek'), surum('pro-mek'));
  check('Y18 AKTIF basic→pro → degistir / HEMEN', yuk.yol === 'degistir' && yuk.zamanlama === 'hemen', JSON.stringify(yuk));
  const dus = yol(abonelik('pro-mek', { durum: 'DENEME', denemeSonu: gunSonra(5) }), surum('basic-mek'));
  check('Y19 DENEME pro→basic → degistir / DONEM SONU', dus.yol === 'degistir' && dus.zamanlama === 'donem-sonu', JSON.stringify(dus));

  // ⭐ FIYAT DEGIL HAK: kur artmis yeni surumde Basic, eski Pro'dan PAHALI.
  const pahaliBasic = surum('basic-mek', { tutarDize: '1899.00' });
  const kurTuzagi = yol(abonelik('pro-mek'), pahaliBasic);
  check(
    'Y20 ⭐ PAHALI ama ALT paket (kur tuzagi) → DONEM SONU (Pro ozellikleri donem ortasinda ALINMAZ)',
    kurTuzagi.yol === 'degistir' && kurTuzagi.zamanlama === 'donem-sonu',
    JSON.stringify(kurTuzagi),
  );

  // ⭐ TEK KURAL: satin-al yolu ⟺ satin alma kapisi ACIK.
  const durumlar = Object.values(AbonelikDurumu);
  let karsilastirilan = 0;
  let celiski = 0;
  // ⚠ 24.09: iyzico durumu da eksen — geri donen musteride kapi ona bakar.
  // Yalniz fikstur varsayilani (ACTIVE) donulseydi SONA_ERDI/ASKIDA'nin ACIK
  // tarafi hic karsilastirilmazdi.
  const iyzicoDurumlari = ['ACTIVE', 'CANCELED', null];
  let acikKapi = 0;
  for (const d of durumlar) {
    for (const mirasMi of [false, true]) {
      for (const iyzicoDurum of iyzicoDurumlari) {
        const ab = abonelik('basic-mek', { durum: d, iyzicoDurum });
        if (mirasMi) ab.paketSurumu = { ...ab.paketSurumu, paket: { ...ab.paketSurumu.paket, kod: 'miras-core' } };
        karsilastirilan++;
        if (!satinAlmaKapisi(ab)) acikKapi++;
        if ((yol(ab, surum('pro-mek')).yol === 'satin-al') !== !satinAlmaKapisi(ab)) celiski++;
      }
    }
  }
  check(
    `Y21 ⭐ ${karsilastirilan} durum×miras×iyzico: "satin-al" ⟺ satin alma kapisi acik (celiski 0, acik kapi ${acikKapi})`,
    karsilastirilan === durumlar.length * 2 * iyzicoDurumlari.length && karsilastirilan >= 42 && celiski === 0 &&
      acikKapi === durumlar.length * iyzicoDurumlari.length + 2 * 2,
    `celiski=${celiski} acikKapi=${acikKapi}`,
  );
  check(
    'Y22 satinalma.servisi AYNI fonksiyonu disa aciyor (kopya degil, kimlik esit)',
    satinAlmaKapisi === yeniAbonelikEngelliMi,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  T · TARIH
// ═══════════════════════════════════════════════════════════════════════════
function tBlogu(): void {
  console.log('\n── T · iyzico tarihi ve gecis ani ──');
  const ms = 1789893431301; // 20.08 sandbox yanitindan AYNEN
  check('T1 ms SAYISI (olculen bicim) cozulur', iyzicoTarihi(ms)?.getTime() === ms);
  check('T2 ms DIZESI cozulur', iyzicoTarihi(String(ms))?.getTime() === ms);
  check('T3 ISO dize cozulur', iyzicoTarihi('2026-10-20T10:00:00.000Z')?.toISOString() === '2026-10-20T10:00:00.000Z');
  const bozuklar: unknown[] = [null, undefined, '', '   ', 'abc', 0, -5, NaN, {}, []];
  check(
    `T4 ${bozuklar.length} bozuk deger → null (tarih UYDURULMAZ)`,
    bozuklar.every((b) => iyzicoTarihi(b) === null),
    JSON.stringify(bozuklar.map((b) => iyzicoTarihi(b))),
  );
  const deneme = { erisimSonu: gunSonra(32), denemeSonu: gunSonra(30) };
  check(
    'T5 ⭐ yanitta tarih yoksa DENEMEDE deneme bitisi (erisimSonu 2 gun TAMPON tasir)',
    gecisTarihiSec(undefined, deneme, SIMDI).getTime() === gunSonra(30).getTime(),
  );
  check('T6 yanitta tarih yoksa (deneme yok) erisimSonu', gecisTarihiSec(undefined, { erisimSonu: gunSonra(20), denemeSonu: null }, SIMDI).getTime() === gunSonra(20).getTime());
  check('T7 iyzico tarihi ONCELIKLI', gecisTarihiSec(ms, deneme, SIMDI).getTime() === ms);
  check('T8 denemeSonu bos → erisimSonu', beklenenGecisTarihi({ erisimSonu: gunSonra(9), denemeSonu: null }, SIMDI).getTime() === gunSonra(9).getTime());
  // ⭐ DENEME TARIHE GORE: gece mutabakati deneme satirini AKTIF'e cekse bile
  // deneme bitisi gelecekteyse ilk cekim ODUR (etiket degil tarih karar verir).
  check(
    'T8b ⭐ deneme bitisi GELECEKTE → ilk cekim deneme bitisi (satir etiketi ne olursa olsun)',
    beklenenGecisTarihi({ erisimSonu: gunSonra(14), denemeSonu: gunSonra(12) }, SIMDI).getTime() === gunSonra(12).getTime(),
  );
  check(
    'T8c deneme bitisi GECMIS → erisimSonu (donem sonu)',
    beklenenGecisTarihi({ erisimSonu: gunSonra(25), denemeSonu: gunSonra(-5) }, SIMDI).getTime() === gunSonra(25).getTime(),
  );
  check('T9 TL bicimi: 1649.00 → "1.649,00 TL"', tlYaz('1649.00') === '1.649,00 TL', tlYaz('1649.00'));
  const hemen = degisimCumlesi({ zamanlama: 'hemen', yeniPaketAdi: 'Pro', yeniTutar: '1649.00', gecisTarihi: new Date('2026-10-20T10:00:00Z') });
  const sonra = degisimCumlesi({ zamanlama: 'donem-sonu', yeniPaketAdi: 'Basic', yeniTutar: '1299.00', gecisTarihi: new Date('2026-10-20T10:00:00Z') });
  check('T10 "hemen" cumlesi: ozellik simdi + ucret tarihten + EK UCRET YOK', /hemen açıldı/.test(hemen) && hemen.includes('20.10.2026') && /ek ücret alınmaz/.test(hemen), hemen);
  check('T11 "donem sonu" cumlesi: gecis tarihi + mevcut paket o tarihe kadar', /20\.10\.2026 tarihinde yapılacak/.test(sonra) && /mevcut paketinizin özellikleri açık kalır/.test(sonra), sonra);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SAHTE PRISMA + IYZICO + E-POSTA
// ═══════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

/** Prisma `where` alt kumesi: esitlik, Date, null, {lte, in, not}, OR. */
function eslesir(satir: Satir, where: Record<string, any> | undefined): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(v as Satir[]).some((w) => eslesir(satir, w))) return false;
      continue;
    }
    const d = satir[k];
    if (v instanceof Date) {
      if (!(d instanceof Date) || d.getTime() !== v.getTime()) return false;
      continue;
    }
    if (v !== null && typeof v === 'object') {
      if ('lte' in v && !(d instanceof Date && d.getTime() <= v.lte.getTime())) return false;
      if ('in' in v && !v.in.includes(d)) return false;
      if ('not' in v && (v.not === null ? d == null : d === v.not)) return false;
      continue;
    }
    if (v === null) {
      if (d != null) return false;
      continue;
    }
    if (d !== v) return false;
  }
  return true;
}

function sahteDb(p: { abonelikler: Satir[]; surumler: Satir[]; firma?: Satir | null }) {
  const olaylar: Satir[] = [];
  const surumBul = (id: string | null) => p.surumler.find((s) => s.id === id) ?? null;
  const dolu = (a: Satir | undefined | null) => (a ? { ...a, paketSurumu: surumBul(a.paketSurumuId) } : null);
  const bul = (where: Satir) => p.abonelikler.find((a) => eslesir(a, where));
  const db: any = {
    olaylar,
    satir: () => p.abonelikler[0],
    abonelik: {
      findUnique: async ({ where }: any) => dolu(bul(where)),
      findUniqueOrThrow: async ({ where }: any) => {
        const a = bul(where);
        if (!a) throw new Error('findUniqueOrThrow: satir yok');
        return dolu(a);
      },
      findFirst: async ({ where }: any) => dolu(bul(where)),
      findMany: async ({ where }: any) => p.abonelikler.filter((a) => eslesir(a, where)).map(dolu),
      update: async ({ where, data }: any) => {
        const a = bul(where);
        if (!a) throw new Error('update: satir yok');
        Object.assign(a, data);
        return dolu(a);
      },
      updateMany: async ({ where, data }: any) => {
        const hedef = p.abonelikler.filter((a) => eslesir(a, where));
        hedef.forEach((a) => Object.assign(a, data));
        return { count: hedef.length };
      },
    },
    paketSurumu: {
      findUnique: async ({ where }: any) => p.surumler.find((s) => eslesir(s, where)) ?? null,
      findFirst: async ({ where }: any) => p.surumler.find((s) => eslesir(s, where)) ?? null,
      findMany: async ({ where }: any) => p.surumler.filter((s) => eslesir(s, where)),
    },
    abonelikOlayi: {
      create: async ({ data }: any) => {
        olaylar.push(data);
        return data;
      },
    },
    firma: {
      findUnique: async () => p.firma ?? { ad: 'Firma A', faturaEposta: 'fatura@firma.test', yetkiliEposta: null },
      updateMany: async () => ({ count: 0 }),
    },
    user: { updateMany: async () => ({ count: 0 }), count: async () => 0 },
    $transaction: async (arg: any) => (typeof arg === 'function' ? arg(db) : Promise.all(arg)),
  };
  return db;
}

/** Tum testler boyunca GIDEN her `paketDegistir` cagrisi (S11: hic NOW yok). */
const TUM_DEGISIM_CAGRILARI: any[] = [];

function sahteIyzico(
  o: {
    degisimYaniti?: any;
    degisimHatasi?: Error;
    detaylar?: Record<string, any>;
    /** `abonelikAra` yaniti — ⚠ sahte FILTRE UYGULAMAZ: gercek iyzico da
     *  tanimadigi filtreyi yutar; suzme cagiranin isidir (S18 bunu olcer). */
    aramaSonucu?: any[];
    /** `abonelikIptal` icin koda gore hata (201403 = UPGRADED uc). */
    iptalHatasi?: Record<string, Error>;
  } = {},
) {
  const cagrilar: Array<{ metot: string; args: any[] }> = [];
  return {
    cagrilar,
    degisimSayisi: () => cagrilar.filter((c) => c.metot === 'paketDegistir').length,
    sayi: (metot: string) => cagrilar.filter((c) => c.metot === metot).length,
    istemci: {
      abonelikAra: async (f: any) => {
        cagrilar.push({ metot: 'abonelikAra', args: [f] });
        return o.aramaSonucu ?? [];
      },
      paketDegistir: async (...args: any[]) => {
        cagrilar.push({ metot: 'paketDegistir', args });
        TUM_DEGISIM_CAGRILARI.push(args);
        // Gercek aga cikan istek gibi davran: bir tur bekle (yaris olculebilsin).
        await new Promise((r) => setImmediate(r));
        if (o.degisimHatasi) throw o.degisimHatasi;
        return (
          o.degisimYaniti ?? {
            referenceCode: 'uc-1',
            parentReferenceCode: 'uc-0',
            subscriptionStatus: 'ACTIVE',
            startDate: gunSonra(20).getTime(),
          }
        );
      },
      abonelikGetir: async (kod: string) => {
        cagrilar.push({ metot: 'abonelikGetir', args: [kod] });
        const d = o.detaylar?.[kod];
        if (!d) throw new Error(`sahte iyzico: detay yok (${kod})`);
        return d;
      },
      abonelikIptal: async (kod: string) => {
        cagrilar.push({ metot: 'abonelikIptal', args: [kod] });
        const h = o.iptalHatasi?.[kod];
        if (h) throw h;
        return {};
      },
    } as any,
  };
}

function sahteEposta(hata?: Error) {
  const giden: any[] = [];
  return {
    giden,
    servis: {
      gonder: async (m: any) => {
        giden.push(m);
        if (hata) throw hata;
      },
    } as any,
  };
}

const KONFIG = { get: () => undefined } as any;
const TUM_SURUMLER = () => Object.keys(HAKLAR).map((k) => surum(k));

function kur(db: any, iyz: ReturnType<typeof sahteIyzico>, ep = sahteEposta()) {
  const ab = new AbonelikServisi(db, iyz.istemci);
  const pd = new PaketDegisimiServisi(db, iyz.istemci, ab, ep.servis, KONFIG);
  return { ab, pd, ep };
}

/**
 * Basari beklenen senaryoyu CALISTIRIR; atilan hata senaryoyu (ve ardindan
 * gelen TUM bloklari) COKERTMEZ — assert'e cevrilir. Mutasyon olcumu (24.09):
 * iki mutant kapiyi assert'le degil `main().catch` COKMESIYLE kirmizi yapti;
 * cokme sonraki bloklarin sonuclarini da gizler.
 */
async function basarir<T>(ad: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e: any) {
    check(`${ad} — BEKLENMEDIK HATA`, false, e?.message ?? String(e));
    return null;
  }
}

async function reddeder(fn: () => Promise<unknown>): Promise<{ durum: number | null; govde: any } | null> {
  try {
    await fn();
    return null;
  } catch (e: any) {
    return {
      durum: typeof e?.getStatus === 'function' ? e.getStatus() : null,
      govde: typeof e?.getResponse === 'function' ? e.getResponse() : e?.message,
    };
  }
}

// ⚠ ONAY ACIKCA VERILIR, varsayilan parametre YOK: `f(x, undefined)` JS'te
// VARSAYILANI tetikler — ilk yazimda "onaysiz" diye kurulan istek `true` ile
// gitti ve S1 onayli bir degisimi olctu (kapi kendi olcutunu yakaladi).
const DEGISTIR = (paket: string) => ({
  firmaId: 'f1',
  kullaniciId: 'u1',
  paketSurumuId: `s-${paket}`,
  sozlesmeOnayi: true as boolean | undefined,
});

// ═══════════════════════════════════════════════════════════════════════════
//  S · SERVIS
// ═══════════════════════════════════════════════════════════════════════════
async function sBlogu(): Promise<void> {
  console.log('\n── S · servis: once iyzico, NEXT_PERIOD, yazilan alanlar ──');

  // S1 · onay yoksa iyzico'ya HIC gidilmez.
  {
    const iyz = sahteIyzico();
    const { pd } = kur(sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() }), iyz);
    const r1 = await reddeder(() => pd.degistir({ ...DEGISTIR('pro-mek'), sozlesmeOnayi: false }));
    const r2 = await reddeder(() => pd.degistir({ ...DEGISTIR('pro-mek'), sozlesmeOnayi: undefined }));
    check(
      'S1 onay false/undefined → 400 ve iyzico\'ya 0 istek',
      r1?.durum === 400 && r2?.durum === 400 && iyz.degisimSayisi() === 0,
      `r1=${r1?.durum} r2=${r2?.durum} iyzico=${iyz.degisimSayisi()}`,
    );
  }

  // S2 · YUKSELTME
  {
    const iyz = sahteIyzico();
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const { pd, ep } = kur(db, iyz);
    const sonuc = await pd.degistir(DEGISTIR('pro-mek'));
    const cagri = iyz.cagrilar.find((c) => c.metot === 'paketDegistir');
    check('S2-OLCUT iyzico\'ya TEK degisim istegi gitti', iyz.degisimSayisi() === 1, `sayi=${iyz.degisimSayisi()}`);
    check('S2a istek ESKI uca gitti (uc-0)', cagri?.args[0] === 'uc-0', `uc=${cagri?.args[0]}`);
    check(
      'S2b ⭐ NEXT_PERIOD + deneme YOK + DENEMESIZ ikiz plan',
      cagri?.args[1]?.nezaman === 'NEXT_PERIOD' &&
        cagri?.args[1]?.denemeUygula === false &&
        cagri?.args[1]?.tekrarSayisiniSifirla === false &&
        cagri?.args[1]?.yeniPlanKodu === 'plan-pro-mek-denemesiz',
      JSON.stringify(cagri?.args[1]),
    );
    const s = db.satir();
    check('S2c ⭐ ozellikler HEMEN: etkin paket pro-mek', s.paketSurumuId === 's-pro-mek', s.paketSurumuId);
    check('S2d planli paket YOK (yukseltme donem sonunu beklemez)', s.planliPaketSurumuId === null);
    check(
      'S2d2 ⭐ donemi ODENMIS paket saklandi (yeni ucret baslamadan iptalde buna donulur)',
      s.odenenPaketSurumuId === 's-basic-mek',
      String(s.odenenPaketSurumuId),
    );
    check('S2e gecis tarihi = iyzico startDate (yeni ucretin ilk cekimi)', s.paketGecisTarihi?.getTime() === gunSonra(20).getTime(), String(s.paketGecisTarihi));
    check('S2f ⭐ guncel uc YENI kod, kok SABIT', s.iyzicoAbonelikKodu === 'uc-1' && s.iyzicoKokKodu === 'uc-0', `${s.iyzicoAbonelikKodu}/${s.iyzicoKokKodu}`);
    const olay = db.olaylar.find((o: Satir) => o.tip === 'paket.degisti');
    check(
      'S2g ⭐ olay + ONAYIN IZI (surum backend sabitinden, zaman sunucuda)',
      !!olay &&
        olay.veri.sozlesmeSurumu === HUKUKI_METIN_SURUMU &&
        !Number.isNaN(Date.parse(olay.veri.sozlesmeOnayiZamani)) &&
        olay.veri.yeniIyzicoKodu === 'uc-1' &&
        olay.veri.eskiIyzicoKodu === 'uc-0' &&
        olay.aktor === 'u1',
      JSON.stringify(olay),
    );
    check('S2h sonuc "hemen" + mesaj olay aciklamasiyla AYNI', sonuc.zamanlama === 'hemen' && olay?.aciklama === sonuc.mesaj);
    check(
      'S2i musteriye e-posta: fatura adresine, ilk paragraf AYNI cumle',
      ep.giden.length === 1 && ep.giden[0].kime === 'fatura@firma.test' && ep.giden[0].paragraflar[0] === sonuc.mesaj,
      JSON.stringify(ep.giden[0]?.kime),
    );
  }

  // S3 · DUSURME
  {
    const iyz = sahteIyzico();
    const db = sahteDb({ abonelikler: [abonelik('pro-mek')], surumler: TUM_SURUMLER() });
    const { pd } = kur(db, iyz);
    const sonuc = await pd.degistir(DEGISTIR('basic-mek'));
    const s = db.satir();
    check('S3a ⭐ DUSURME: etkin paket DEGISMEDI (pro-mek)', s.paketSurumuId === 's-pro-mek', s.paketSurumuId);
    check('S3b planli paket basic-mek', s.planliPaketSurumuId === 's-basic-mek', s.planliPaketSurumuId);
    check('S3b2 dusurmede "odenmis paket" isaretcisi YOK (geri alinacak ust paket yok)', s.odenenPaketSurumuId === null);
    check('S3c olay "planlandi", "degisti" DEGIL', db.olaylar.some((o: Satir) => o.tip === 'paket.degisim.planlandi') && !db.olaylar.some((o: Satir) => o.tip === 'paket.degisti'));
    check('S3d sonuc donem-sonu', sonuc.zamanlama === 'donem-sonu');
    check('S3e iyzico yine NEXT_PERIOD', iyz.cagrilar.find((c) => c.metot === 'paketDegistir')?.args[1]?.nezaman === 'NEXT_PERIOD');
  }

  // S4 · iyzico ACIK bir kodla REDDEDERSE yerelde HICBIR SEY degismez.
  // (201406 = farkli odeme araligi — 20.08'de olculmus kesin red.)
  {
    const iyz = sahteIyzico({ degisimHatasi: new IyzicoHatasi('201406', 'Abonelik farklı ödeme sıklığına sahip ödeme plana yükseltilemez.') });
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const { pd, ep } = kur(db, iyz);
    const once = JSON.stringify(db.satir());
    const r = await reddeder(() => pd.degistir(DEGISTIR('pro-mek')));
    check('S4a ⭐ iyzico reddetti → satir BIREBIR ayni (once iyzico, sonra biz)', JSON.stringify(db.satir()) === once);
    check('S4b 502 + kod SAGLAYICI_DEGISIM_HATASI', r?.durum === 502 && r?.govde?.kod === 'SAGLAYICI_DEGISIM_HATASI', JSON.stringify(r));
    check('S4c iyzico\'nun HAM metni musteriye gosterilmez', !String(r?.govde?.message ?? '').includes('yükseltilemez'));
    const olay = db.olaylar.find((o: Satir) => o.tip === 'paket.degisim.basarisiz');
    check('S4d basarisiz deneme olay kaydinda (iyzico kodu ile)', olay?.veri?.iyzicoKodu === '201406', JSON.stringify(olay));
    check('S4e e-posta GITMEDI', ep.giden.length === 0);
    check('S4f KESIN redde iyzico\'ya yeniden SORULMAZ (dogrulama yalniz belirsiz sonucta)', iyz.sayi('abonelikGetir') === 0 && iyz.sayi('abonelikAra') === 0);
  }

  // ── S15-S19 · BELIRSIZ SONUC (inceleme bulgusu 1) ─────────────────────
  // Ag hatasi / 201402: iyzico degisimi yapmis, yanit kaybolmus olabilir.
  // "Paketiniz degismedi" ancak iyzico'ya SORULUP dogrulanirsa denir.
  const agHatasi = () => new Error('socket hang up');
  const cocuk = (o: Record<string, unknown> = {}) => ({
    referenceCode: 'uc-1',
    parentReferenceCode: 'uc-0',
    customerReferenceCode: 'm-1',
    pricingPlanReferenceCode: 'plan-pro-mek-denemesiz',
    subscriptionStatus: 'ACTIVE',
    startDate: gunSonra(20).getTime(),
    ...o,
  });
  {
    const iyz = sahteIyzico({
      degisimHatasi: agHatasi(),
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'ACTIVE' } },
    });
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const once = JSON.stringify(db.satir());
    const r = await reddeder(() => kur(db, iyz).pd.degistir(DEGISTIR('pro-mek')));
    check(
      'S15 ⭐ ag hatasi + kayitli uc hala CANLI → iyzico\'ya SORULDU, "degismedi" KESIN (502), satir ayni',
      iyz.sayi('abonelikGetir') === 1 && r?.govde?.kod === 'SAGLAYICI_DEGISIM_HATASI' && JSON.stringify(db.satir()) === once,
      `getir=${iyz.sayi('abonelikGetir')} r=${JSON.stringify(r)}`,
    );
  }
  {
    // S15b · ZAMAN ASIMI (24.09): istegimiz kesildi ama iyzico yukseltmeyi
    // HALA isliyor olabilir — hemen ardindan sorulan soruda kayitli ucun canli
    // gorunmesi KESIN degil. "Degismedi" (502) denirse musteri yanlis
    // bilgilenir; "dogrulanamadi" (503) denir. Ag hatasi S15'te 502'de KALIR.
    const zamanAsimi = new IyzicoHatasi(undefined, 'iyzico yanıt vermedi (zaman aşımı, 20 sn)', undefined, true);
    const iyz = sahteIyzico({
      degisimHatasi: zamanAsimi,
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'ACTIVE' } },
    });
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const once = JSON.stringify(db.satir());
    const r = await reddeder(() => kur(db, iyz).pd.degistir(DEGISTIR('pro-mek')));
    check('S15b-OLCUT zaman asimi hatasi KODSUZ ve isaretli', zamanAsimi.kod === undefined && zamanAsimi.zamanAsimi === true);
    check(
      'S15b ⭐ zaman asimi + kayitli uc hala CANLI → "degismedi" DENMEZ: 503 DEGISIM_DOGRULANAMADI, satir ayni',
      iyz.sayi('abonelikGetir') === 1 && r?.durum === 503 && r?.govde?.kod === 'DEGISIM_DOGRULANAMADI' && JSON.stringify(db.satir()) === once,
      `getir=${iyz.sayi('abonelikGetir')} r=${JSON.stringify(r)}`,
    );
    const olay = db.olaylar.find((o: Satir) => o.tip === 'paket.degisim.belirsiz');
    check(
      'S15c belirsiz olay kaydi: iyzicoKodu null, neden zaman asimi',
      !!olay && olay.veri?.iyzicoKodu === null && /zaman asimi/.test(olay.veri?.neden ?? ''),
      JSON.stringify(olay?.veri),
    );
  }
  {
    const iyz = sahteIyzico({
      degisimHatasi: agHatasi(),
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'UPGRADED' } },
      aramaSonucu: [cocuk()],
    });
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const sonuc = await basarir('S16', () => kur(db, iyz).pd.degistir(DEGISTIR('pro-mek')));
    const s = db.satir();
    const olay = db.olaylar.find((o: Satir) => o.tip === 'paket.degisti');
    check(
      'S16 ⭐ yaniti KAYBOLAN degisim bulundu → yerele alindi (yeni uc uc-1, paket pro-mek, kilit, basari)',
      s.iyzicoAbonelikKodu === 'uc-1' && s.paketSurumuId === 's-pro-mek' && !!s.paketGecisTarihi && sonuc?.oncekiDegisim === false,
      JSON.stringify({ uc: s.iyzicoAbonelikKodu, p: s.paketSurumuId, oncekiDegisim: sonuc?.oncekiDegisim }),
    );
    check('S16b kurtarma olay kaydinda iz birakti', !!olay?.veri?.kurtarma && olay.veri.kurtarma.farkliDegisim === false, JSON.stringify(olay?.veri?.kurtarma));
  }
  {
    // S16c · kok-semantiginde arama zincirin TUM torunlarini dondurur: once
    // eski (UPGRADED) ara halka, sonra canli uc. Ilk kaydi almak ESKI halkayi
    // "canli" sanmak olurdu.
    const iyz = sahteIyzico({
      degisimHatasi: agHatasi(),
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'UPGRADED' } },
      aramaSonucu: [
        cocuk({ referenceCode: 'uc-ara', subscriptionStatus: 'UPGRADED' }),
        cocuk({ referenceCode: 'uc-canli' }),
      ],
    });
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    await basarir('S16c', () => kur(db, iyz).pd.degistir(DEGISTIR('pro-mek')));
    check('S16c ⭐ birden cok torun: UPGRADED ara halka degil CANLI uc secildi', db.satir().iyzicoAbonelikKodu === 'uc-canli', db.satir().iyzicoAbonelikKodu);
  }
  {
    const iyz = sahteIyzico({
      degisimHatasi: new IyzicoHatasi('201402', 'Bu abonelik yükseltilemez'),
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'UPGRADED' } },
      aramaSonucu: [cocuk({ pricingPlanReferenceCode: 'plan-pro-mep-denemesiz' })],
    });
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const sonuc = await basarir('S17', () => kur(db, iyz).pd.degistir(DEGISTIR('pro-mek')));
    check(
      'S17 ⭐ 201402 = kayitli uc BAYAT: ONCEKI (kaybolan) degisim bulundu → O yerele alindi (pro-mep), istenen DEGIL',
      db.satir().paketSurumuId === 's-pro-mep' && sonuc?.oncekiDegisim === true && !!sonuc?.mesaj.startsWith('Daha önce başlattığınız paket değişikliği'),
      JSON.stringify({ p: db.satir().paketSurumuId, oncekiDegisim: sonuc?.oncekiDegisim, mesaj: sonuc?.mesaj.slice(0, 60) }),
    );
  }
  {
    // ⭐⭐ YABANCI ABONELIK: sahte arama filtre UYGULAMAZ (gercek iyzico da
    // tanimadigi filtreyi yutar). Donen tek kayit BASKA musterinin — ust kodu
    // bizim zincirimizde degil. Kabul edilseydi BASKA FIRMANIN aboneligi bu
    // firmaya baglanirdi.
    const iyz = sahteIyzico({
      degisimHatasi: agHatasi(),
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'UPGRADED' } },
      aramaSonucu: [cocuk({ referenceCode: 'yabanci-9', parentReferenceCode: 'yabanci-kok', customerReferenceCode: 'm-baska' })],
    });
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const once = JSON.stringify(db.satir());
    const r = await reddeder(() => kur(db, iyz).pd.degistir(DEGISTIR('pro-mek')));
    check(
      'S18 ⭐⭐ arama BASKA musterinin aboneligini dondurdu → KABUL EDILMEDI: 503 DEGISIM_DOGRULANAMADI, satir ayni',
      r?.durum === 503 && r?.govde?.kod === 'DEGISIM_DOGRULANAMADI' && JSON.stringify(db.satir()) === once,
      JSON.stringify(r),
    );
    check('S18b belirsiz sonuc olay kaydinda (yonetici kontrolu)', db.olaylar.some((o: Satir) => o.tip === 'paket.degisim.belirsiz'));
    check('S18c "doğrulanamadı" der, "değişmedi" DEMEZ', !String(r?.govde?.message ?? '').includes('değişmedi'), String(r?.govde?.message));
  }
  {
    // Ayni musteri kodu ama zincir DISI ust kod da reddedilir (musteri kodu tek basina yetmez).
    const iyz = sahteIyzico({
      degisimHatasi: agHatasi(),
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'UPGRADED' } },
      aramaSonucu: [cocuk({ referenceCode: 'x-5', parentReferenceCode: 'baska-kok' })],
    });
    const r = await reddeder(() => kur(sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() }), iyz).pd.degistir(DEGISTIR('pro-mek')));
    check('S18d ayni musteri, ZINCIR DISI ust kod → kabul edilmedi (503)', r?.durum === 503, JSON.stringify(r));
  }
  {
    // S18e · IKI BAGIMSIZ SUZGEC: ust kod zincirde olsa bile musteri kodu
    // bizimki degilse reddedilir. Gercekte bu kombinasyon beklenmez; ama
    // arama yaniti bozuk/yanlis gelirse tek suzgece guvenmek riskliydi.
    const iyz = sahteIyzico({
      degisimHatasi: agHatasi(),
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'UPGRADED' } },
      aramaSonucu: [cocuk({ customerReferenceCode: 'm-baska' })],
    });
    const r = await reddeder(() => kur(sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() }), iyz).pd.degistir(DEGISTIR('pro-mek')));
    check('S18e zincirdeki ust kod + BASKA musteri kodu → kabul edilmedi (503)', r?.durum === 503, JSON.stringify(r));
  }
  {
    const iyz = sahteIyzico({ degisimHatasi: agHatasi(), detaylar: {} });
    const r = await reddeder(() => kur(sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() }), iyz).pd.degistir(DEGISTIR('pro-mek')));
    check('S19 iyzico\'ya SORULAMADI → 503 DEGISIM_DOGRULANAMADI (tahmin yok)', r?.durum === 503 && r?.govde?.kod === 'DEGISIM_DOGRULANAMADI', JSON.stringify(r));
  }

  // S5 · KARAR reddederse iyzico'ya gidilmez.
  {
    const iyz = sahteIyzico();
    const { pd } = kur(sahteDb({ abonelikler: [abonelik('basic-mek', { odemeYontemi: 'HAVALE' })], surumler: TUM_SURUMLER() }), iyz);
    const r = await reddeder(() => pd.degistir(DEGISTIR('pro-mek')));
    check('S5 HAVALE → 400 kod HAVALE, iyzico\'ya 0 istek', r?.durum === 400 && r?.govde?.kod === 'HAVALE' && iyz.degisimSayisi() === 0, JSON.stringify(r));
  }

  // S6 · DENEMESIZ plan yoksa DENEMELI plana DUSULMEZ.
  {
    const iyz = sahteIyzico();
    const surumler = TUM_SURUMLER().map((s) => (s.id === 's-pro-mek' ? { ...s, iyzicoDenemesizPlanKodu: null } : s));
    const { pd } = kur(sahteDb({ abonelikler: [abonelik('basic-mek')], surumler }), iyz);
    const r = await reddeder(() => pd.degistir(DEGISTIR('pro-mek')));
    check('S6a ⭐ ikiz yok + denemeli surum → 503 DENEMESIZ_PLAN_YOK, iyzico\'ya 0 istek', r?.durum === 503 && r?.govde?.kod === 'DENEMESIZ_PLAN_YOK' && iyz.degisimSayisi() === 0, JSON.stringify(r));

    const iyz2 = sahteIyzico();
    const denemesiz = TUM_SURUMLER().map((s) => (s.id === 's-pro-mek' ? { ...s, iyzicoDenemesizPlanKodu: null, denemeGunu: 0 } : s));
    const { pd: pd2 } = kur(sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: denemesiz }), iyz2);
    await pd2.degistir(DEGISTIR('pro-mek'));
    check('S6b surumde deneme YOKSA ana plan zaten denemesiz → kullanilir', iyz2.cagrilar.find((c) => c.metot === 'paketDegistir')?.args[1]?.yeniPlanKodu === 'plan-pro-mek');
  }

  // S7 · yanitta yeni kod yoksa: degisim yazilir, uc KORUNUR (webhook onarir).
  {
    const iyz = sahteIyzico({ degisimYaniti: { subscriptionStatus: 'ACTIVE', startDate: gunSonra(20).getTime() } });
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const { pd } = kur(db, iyz);
    await pd.degistir(DEGISTIR('pro-mek'));
    check('S7 yanitta referenceCode YOK → paket yazildi, uc eski kodda kaldi (uydurulmadi)', db.satir().paketSurumuId === 's-pro-mek' && db.satir().iyzicoAbonelikKodu === 'uc-0');
  }

  // S8 · yanitta tarih yoksa beklenen tarih.
  {
    const iyz = sahteIyzico({ degisimYaniti: { referenceCode: 'uc-1' } });
    const db = sahteDb({ abonelikler: [abonelik('basic-mek', { erisimSonu: gunSonra(17) })], surumler: TUM_SURUMLER() });
    const { pd } = kur(db, iyz);
    await pd.degistir(DEGISTIR('pro-mek'));
    check('S8 yanitta startDate YOK → gecis = erisimSonu (AKTIF)', db.satir().paketGecisTarihi?.getTime() === gunSonra(17).getTime());
  }

  // S9 · ⭐ donem basina TEK degisim — ikinci istek iyzico'ya GITMEZ.
  {
    const iyz = sahteIyzico();
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const { pd } = kur(db, iyz);
    await pd.degistir(DEGISTIR('pro-mek'));
    const r = await reddeder(() => pd.degistir(DEGISTIR('pro-mep')));
    check('S9 ⭐ ikinci degisim → DEGISIM_BEKLIYOR, iyzico\'ya toplam 1 istek', r?.govde?.kod === 'DEGISIM_BEKLIYOR' && iyz.degisimSayisi() === 1, `${JSON.stringify(r)} sayi=${iyz.degisimSayisi()}`);
  }

  // S10 · ⭐ ayni anda iki istek — firma sirasi ikisini sirayla kosar.
  {
    const iyz = sahteIyzico();
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const { pd } = kur(db, iyz);
    const sonuclar = await Promise.allSettled([pd.degistir(DEGISTIR('pro-mek')), pd.degistir(DEGISTIR('pro-mep'))]);
    const tamam = sonuclar.filter((x) => x.status === 'fulfilled').length;
    check('S10 ⭐ esZAMANLI iki istek → 1 basarili, 1 red, iyzico\'ya 1 istek (cift cekim yok)', tamam === 1 && iyz.degisimSayisi() === 1, `tamam=${tamam} iyzico=${iyz.degisimSayisi()}`);
  }

  // S12 · kart dugmeleri (yollar) — ayni saf karar.
  {
    const iyz = sahteIyzico();
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const { pd } = kur(db, iyz);
    const y = await pd.yollar('f1', TUM_SURUMLER().map((s) => s.id), SIMDI);
    const pro = y.get('s-pro-mek') as any;
    check('S12a pro-mek → degistir/hemen + beklenen tarih = erisimSonu', pro?.yol === 'degistir' && pro.zamanlama === 'hemen' && pro.beklenenTarih === gunSonra(20).toISOString(), JSON.stringify(pro));
    check('S12b basic-elk → degistir/donem-sonu (yatay)', (y.get('s-basic-elk') as any)?.zamanlama === 'donem-sonu');
    check('S12c kendi paketi → yok/AYNI_PAKET', (y.get('s-basic-mek') as any)?.kod === 'AYNI_PAKET');
    check('S12d ⭐ kart ozeti iyzico KODU tasimaz (fiyat sayfasi disa acik)', !JSON.stringify([...y.values()]).includes('plan-') && !JSON.stringify([...y.values()]).includes('uc-0'));
    const yok = await kur(sahteDb({ abonelikler: [], surumler: TUM_SURUMLER() }), sahteIyzico()).pd.yollar('f1', ['s-pro-mek'], SIMDI);
    check('S12e aboneligi olmayan firma → satin-al', (yok.get('s-pro-mek') as any)?.yol === 'satin-al');
    const denemede = await kur(
      sahteDb({ abonelikler: [abonelik('basic-mek', { durum: 'DENEME', denemeSonu: gunSonra(12), erisimSonu: gunSonra(14) })], surumler: TUM_SURUMLER() }),
      sahteIyzico(),
    ).pd.yollar('f1', ['s-pro-mek'], SIMDI);
    check(
      'S12f ⭐ denemede kartta gosterilen tarih DENEME BITISI (tamponlu erisimSonu degil)',
      (denemede.get('s-pro-mek') as any)?.beklenenTarih === gunSonra(12).toISOString(),
      JSON.stringify(denemede.get('s-pro-mek')),
    );
  }

  // S13 · e-posta dusse de degisim tamamlanir.
  {
    const iyz = sahteIyzico();
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const { pd } = kur(db, iyz, sahteEposta(new Error('SMTP kapali')));
    const r = await reddeder(() => pd.degistir(DEGISTIR('pro-mek')));
    check('S13 e-posta hatasi degisimi DUSURMEZ', r === null && db.satir().paketSurumuId === 's-pro-mek', JSON.stringify(r));
  }

  // S14 · aboneligi yoksa degistir ucu satin almaya yollar.
  {
    const iyz = sahteIyzico();
    const { pd } = kur(sahteDb({ abonelikler: [], surumler: TUM_SURUMLER() }), iyz);
    const r = await reddeder(() => pd.degistir(DEGISTIR('pro-mek')));
    check('S14 abonelik yok → 400 SATIN_ALMA_YOLU, iyzico\'ya 0 istek', r?.govde?.kod === 'SATIN_ALMA_YOLU' && iyz.degisimSayisi() === 0, JSON.stringify(r));
  }

  // S11 · ⭐ bu dosyada iyzico'ya giden HER degisim istegi NEXT_PERIOD.
  const nowlar = TUM_DEGISIM_CAGRILARI.filter((a) => a[1]?.nezaman !== 'NEXT_PERIOD');
  check(
    `S11 ⭐ ${TUM_DEGISIM_CAGRILARI.length} degisim isteginin HICBIRI NOW degil (kist hesap yok)`,
    TUM_DEGISIM_CAGRILARI.length >= 8 && nowlar.length === 0,
    `toplam=${TUM_DEGISIM_CAGRILARI.length} now=${nowlar.length}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  G · PLANLI GECIS (tek kaynak: AbonelikServisi.planliGecisiUygula)
// ═══════════════════════════════════════════════════════════════════════════
async function gBlogu(): Promise<void> {
  console.log('\n── G · planli gecis: vade, tek kaynak, idempotent, tarama ──');
  const planli = (o: Record<string, unknown>) =>
    abonelik('pro-mek', { planliPaketSurumuId: 's-basic-mek', ...o });

  {
    const db = sahteDb({ abonelikler: [planli({ paketGecisTarihi: gunSonra(5) })], surumler: TUM_SURUMLER() });
    const { ab } = kur(db, sahteIyzico());
    const oldu = await ab.planliGecisiUygula('ab1', { aktor: 'sistem', simdi: SIMDI });
    check('G1 vade GELMEDI → uygulanmaz, paket pro-mek', oldu === false && db.satir().paketSurumuId === 's-pro-mek' && db.satir().planliPaketSurumuId === 's-basic-mek');
  }
  {
    const vade = gunSonra(-0.001);
    const db = sahteDb({ abonelikler: [planli({ paketGecisTarihi: vade })], surumler: TUM_SURUMLER() });
    const { ab } = kur(db, sahteIyzico());
    const oldu = await ab.planliGecisiUygula('ab1', { aktor: 'sistem', simdi: SIMDI });
    const s = db.satir();
    check(
      'G2 ⭐ vade geldi → etkin paket basic-mek, planli TEMIZ, KILIT (gecis tarihi) DURUYOR — odemeyle kalkar',
      oldu && s.paketSurumuId === 's-basic-mek' && s.planliPaketSurumuId === null && s.paketGecisTarihi?.getTime() === vade.getTime(),
      JSON.stringify({ p: s.paketSurumuId, pl: s.planliPaketSurumuId, t: s.paketGecisTarihi }),
    );
    check('G3 olay "paket.degisti" (onceki/yeni surum ile)', db.olaylar.length === 1 && db.olaylar[0].tip === 'paket.degisti' && db.olaylar[0].veri.oncekiPaketSurumuId === 's-pro-mek' && db.olaylar[0].veri.yeniPaketSurumuId === 's-basic-mek');
    const ikinci = await ab.planliGecisiUygula('ab1', { aktor: 'sistem', simdi: SIMDI });
    check('G4 ⭐ IDEMPOTENT: ikinci tetik bir sey yapmaz, ikinci olay YOK', ikinci === false && db.olaylar.length === 1);
  }
  {
    // ⭐ YARIS: webhook ve tarama AYNI ANDA okur. Erken donus (tarih bos mu)
    // bunu yakalayamaz — ikisi de dolu satiri okumustur. Yalniz KOSULLU yazma
    // (`where`de okunan degerler) ikinciyi sifir satira dusurur.
    const db = sahteDb({ abonelikler: [planli({ paketGecisTarihi: gunSonra(-0.01) })], surumler: TUM_SURUMLER() });
    const { ab } = kur(db, sahteIyzico());
    const [a, b] = await Promise.all([
      ab.planliGecisiUygula('ab1', { aktor: 'webhook', simdi: SIMDI }),
      ab.planliGecisiUygula('ab1', { aktor: 'sistem', simdi: SIMDI }),
    ]);
    check('G4b ⭐ esZAMANLI iki tetik → TEK uygulama, TEK olay', [a, b].filter(Boolean).length === 1 && db.olaylar.length === 1, `a=${a} b=${b} olay=${db.olaylar.length}`);
  }
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep', { paketGecisTarihi: gunSonra(-1) })], surumler: TUM_SURUMLER() });
    const { ab } = kur(db, sahteIyzico());
    const oldu = await ab.planliGecisiUygula('ab1', { aktor: 'sistem', simdi: SIMDI });
    check(
      'G5 ⭐ yukseltme sonrasi (planli YOK): planli gecis HICBIR SEY yapmaz — kilit SAATLE degil odemeyle kalkar',
      oldu === false && db.satir().paketSurumuId === 's-pro-mep' && db.satir().paketGecisTarihi !== null && db.olaylar.length === 0,
    );
  }
  {
    const db = sahteDb({ abonelikler: [planli({ paketGecisTarihi: gunSonra(3) })], surumler: TUM_SURUMLER() });
    const { ab } = kur(db, sahteIyzico());
    const oldu = await ab.planliGecisiUygula('ab1', { aktor: 'webhook', simdi: SIMDI, zorla: true });
    check('G6 zorla → vade beklenmez (iyzico planli paketi ZATEN cekti)', oldu && db.satir().paketSurumuId === 's-basic-mek');
  }
  {
    const satirlar = [
      planli({ id: 'a1', firmaId: 'f1', paketGecisTarihi: gunSonra(-0.5) }),
      abonelik('pro-mep', { id: 'a2', firmaId: 'f2', paketGecisTarihi: gunSonra(-0.2), iyzicoAbonelikKodu: 'x2' }),
      planli({ id: 'a3', firmaId: 'f3', paketGecisTarihi: gunSonra(4), iyzicoAbonelikKodu: 'x3' }),
      abonelik('basic-mek', { id: 'a4', firmaId: 'f4', iyzicoAbonelikKodu: 'x4' }),
    ];
    const db = sahteDb({ abonelikler: satirlar, surumler: TUM_SURUMLER() });
    const { pd } = kur(db, sahteIyzico());
    const n = await pd.vadesiGelenGecisleriUygula(SIMDI);
    check(
      'G7 ⭐ tarama: vadesi gelen PLANLI satir uygulandi; gelecekteki, bos ve yukseltme kilidi DOKUNULMADI',
      n.gecis === 1 && n.kilit === 0 &&
        satirlar[0].paketSurumuId === 's-basic-mek' &&
        satirlar[1].paketGecisTarihi !== null &&
        satirlar[2].planliPaketSurumuId === 's-basic-mek' && satirlar[2].paketSurumuId === 's-pro-mek',
      JSON.stringify(n),
    );
  }
  {
    // ⭐ EMNIYET SUPABI: yeni ucun tahsilat webhook'u hic gelmedi. 3 gun
    // sonra kilit acilir (musteri sonsuza dek kilitli kalmaz), SESSIZ degil.
    const satirlar = [
      abonelik('pro-mep', { id: 'k1', firmaId: 'f1', paketGecisTarihi: gunSonra(-4), odenenPaketSurumuId: 's-basic-mek', iyzicoAbonelikKodu: 'k1u' }),
      abonelik('pro-mek', { id: 'k2', firmaId: 'f2', planliPaketSurumuId: 's-basic-mek', paketGecisTarihi: gunSonra(-4), iyzicoAbonelikKodu: 'k2u' }),
      abonelik('pro-mep', { id: 'k3', firmaId: 'f3', paketGecisTarihi: gunSonra(-2), iyzicoAbonelikKodu: 'k3u' }),
    ];
    const db = sahteDb({ abonelikler: satirlar, surumler: TUM_SURUMLER() });
    const { pd } = kur(db, sahteIyzico());
    const n = await pd.vadesiGelenGecisleriUygula(SIMDI);
    check(
      'G8 ⭐ emniyet supabi: 3 gunu gecen kilitler acildi (odenmis paket isaretcisi de), 2 gunluk DURUYOR',
      n.kilit === 2 && satirlar[0].paketGecisTarihi === null && satirlar[0].odenenPaketSurumuId === null &&
        satirlar[1].paketGecisTarihi === null && satirlar[2].paketGecisTarihi !== null,
      JSON.stringify(n),
    );
    check('G8b planli gecis kilitten ONCE uygulandi (yarim gecis birakilmadi)', satirlar[1].paketSurumuId === 's-basic-mek' && satirlar[1].planliPaketSurumuId === null);
    check(
      'G8c emniyetle acilan kilit olay kaydinda (sessiz gecilmez)',
      db.olaylar.filter((o: Satir) => o.tip === 'paket.degisim.kilit.zaman.asimi').length === 2,
    );
  }
  {
    // G8d · KILIT PLANLI PAKET DURURKEN KALKMAZ. Mutasyon olcumu (24.09):
    // `degisimKilidiniKaldir` icindeki "once planli gecisi uygula" cagrisini
    // silen mutant YASADI — G8'de taramanin 1. adimi planliyi ZATEN
    // uygulamisti, cagrinin kendi isi olculmuyordu. Kural: kilit (gecis
    // tarihi) planli paket dururken kalkarsa o paket bir daha HIC uygulanamaz
    // (tarama `paketGecisTarihi`ne bakar). Dogrudan cagri ile olculur.
    const db = sahteDb({
      abonelikler: [abonelik('pro-mek', { planliPaketSurumuId: 's-basic-mek', paketGecisTarihi: gunSonra(-5) })],
      surumler: TUM_SURUMLER(),
    });
    await kur(db, sahteIyzico()).ab.degisimKilidiniKaldir('ab1', { aktor: 'sistem' });
    const s = db.satir();
    check(
      'G8d ⭐ kilit kalkarken bekleyen planli paket ONCE uygulandi (basic-mek), yetim kalmadi',
      s.paketGecisTarihi === null && s.planliPaketSurumuId === null && s.paketSurumuId === 's-basic-mek',
      JSON.stringify({ p: s.paketSurumuId, pl: s.planliPaketSurumuId, t: s.paketGecisTarihi }),
    );
  }
  {
    // ⭐ YARIS: kilidi kaldiran webhook ESKI koddan geliyorsa (musteri arada
    // yeni degisim yapti) YENI degisimin kilidi kalkmaz.
    const db = sahteDb({ abonelikler: [abonelik('pro-mep', { iyzicoAbonelikKodu: 'uc-1', paketGecisTarihi: gunSonra(20) })], surumler: TUM_SURUMLER() });
    const { ab } = kur(db, sahteIyzico());
    const oldu = await ab.degisimKilidiniKaldir('ab1', { aktor: 'webhook', webhookKodu: 'uc-0' });
    check('G9 ⭐ eski koddan gelen kilit kaldirma YOK SAYILDI (yeni degisimin kilidi duruyor)', oldu === false && db.satir().paketGecisTarihi !== null);
  }
  {
    // G9b · ayni yaris, planli dusurme VARKEN: erken donus olmasaydi kilit
    // kaldirmadan once cagrilan "zorla" gecis, eski siparisle yeni degisimin
    // dusurmesini VADESINDEN ONCE uygulardi. (Yazmadaki kod kosulu tek
    // basina yetmez: zorla gecis ondan ONCE kosar.)
    const db = sahteDb({
      abonelikler: [abonelik('pro-mek', { iyzicoAbonelikKodu: 'uc-1', planliPaketSurumuId: 's-basic-mek', paketGecisTarihi: gunSonra(20) })],
      surumler: TUM_SURUMLER(),
    });
    await kur(db, sahteIyzico()).ab.degisimKilidiniKaldir('ab1', { aktor: 'webhook', webhookKodu: 'uc-0' });
    check('G9b ⭐ eski koddan gelen cagri planli dusurmeyi VADESINDEN ONCE uygulamadi', db.satir().paketSurumuId === 's-pro-mek' && db.satir().planliPaketSurumuId === 's-basic-mek');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  E · ERISIM KARARINDA BEKLEYEN DEGISIM (ekranin kaynagi)
// ═══════════════════════════════════════════════════════════════════════════
async function eBlogu(): Promise<void> {
  console.log('\n── E · erisim kararinda bekleyen degisim ──');
  const { ErisimServisi } = await import('../src/ozellik/odeme/abonelik/erisim.servisi');
  const karar = async (satir: Satir | null) =>
    new ErisimServisi(sahteDb({ abonelikler: satir ? [satir] : [], surumler: TUM_SURUMLER() })).karar('f1', SIMDI);

  const dus = await karar(abonelik('pro-mek', { planliPaketSurumuId: 's-basic-mek', paketGecisTarihi: gunSonra(9) }));
  check('E1 bekleyen DUSURME: tarih + planli paket adi', dus.paketGecisi?.tarih === gunSonra(9).toISOString() && dus.paketGecisi?.planliPaket?.kod === 'basic-mek', JSON.stringify(dus.paketGecisi));
  check('E1b ⭐ bekleyen dusurmede ETKIN paket hala pro-mek (ozellik donem sonuna kadar)', dus.paketKodu === 'pro-mek');
  const yuk = await karar(abonelik('pro-mep', { paketGecisTarihi: gunSonra(9) }));
  check('E2 yukseltme sonrasi: tarih var, planli paket null (yeni ucret tarihi)', yuk.paketGecisi?.planliPaket === null && !!yuk.paketGecisi?.tarih);
  const gecmis = await karar(abonelik('pro-mek', { paketGecisTarihi: gunSonra(-1), planliPaketSurumuId: 's-basic-mek' }));
  check('E3 tarih gecmis → paketGecisi null', gecmis.paketGecisi === null);
  check('E4 abonelik yok → paketGecisi null', (await karar(null)).paketGecisi === null);
  const temiz = await karar(abonelik('pro-mek'));
  check('E5 degisim yok → null', temiz.paketGecisi === null);
}

// ═══════════════════════════════════════════════════════════════════════════
//  W · WEBHOOK (tahsilatBasarili) — odenen plan etkin paketi belirler
// ═══════════════════════════════════════════════════════════════════════════
async function wBlogu(): Promise<void> {
  console.log('\n── W · webhook: odenen plana hizalama, eski halka, zincir ──');
  // ⚠ 24.09: odenmis siparis KANITIYLA tasinir (20.08 tutanagi: basarili odeme
  // denemesi) — webhook odenmemis siparisi reddeder (`test:webhook-tahsilat-dogrulama`).
  const siparis = (ref: string, bitis: Date) => ({ referenceCode: ref, orderStatus: 'SUCCESS', paymentAttempts: [{ paymentStatus: 'SUCCESS' }], endPeriod: bitis.toISOString(), startPeriod: SIMDI.toISOString(), paidPrice: 1299 });

  // W1 · yenileme: iyzico PLANLI paketi cekti (saat farki: vade bizde 1 dk ileride).
  {
    const db = sahteDb({
      abonelikler: [abonelik('pro-mek', { iyzicoAbonelikKodu: 'uc-1', planliPaketSurumuId: 's-basic-mek', paketGecisTarihi: new Date(Date.now() + 60_000), erisimSonu: gunSonra(0.2) })],
      surumler: TUM_SURUMLER(),
    });
    const iyz = sahteIyzico({ detaylar: { 'uc-1': { referenceCode: 'uc-1', pricingPlanReferenceCode: 'plan-basic-mek-denemesiz', subscriptionStatus: 'ACTIVE', orders: [siparis('sip-2', gunSonra(30))] } } });
    const { ab } = kur(db, iyz);
    const sonuc: any = await ab.tahsilatBasarili('uc-1', 'sip-2');
    const s = db.satir();
    check('W1a ⭐ odenen plan = planli paket → gecis vade BEKLENMEDEN uygulandi', s.paketSurumuId === 's-basic-mek' && s.planliPaketSurumuId === null && s.paketGecisTarihi === null, JSON.stringify({ p: s.paketSurumuId, pl: s.planliPaketSurumuId }));
    check('W1b ⭐ donen abonelik YENI surumu tasiyor (fatura yedek tutari)', sonuc?.abonelik?.paketSurumu?.id === 's-basic-mek', sonuc?.abonelik?.paketSurumu?.id);
    check('W1c erisim yeni donem sonuna uzadi', s.erisimSonu.getTime() === gunSonra(30).getTime());
    check(
      'W1d gecis OLAGAN yoldan (paket.degisti), "uyusmazlik kurtarmasi" (paket.hizalandi) DEGIL',
      db.olaylar.some((o: Satir) => o.tip === 'paket.degisti') && !db.olaylar.some((o: Satir) => o.tip === 'paket.hizalandi'),
      JSON.stringify(db.olaylar.map((o: Satir) => o.tip)),
    );
  }

  // W2 · kurtarma: yerelde A yazili, iyzico B cekiyor → B.
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mek', { iyzicoAbonelikKodu: 'uc-1' })], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico({ detaylar: { 'uc-1': { referenceCode: 'uc-1', pricingPlanReferenceCode: 'plan-pro-mep', subscriptionStatus: 'ACTIVE', orders: [siparis('sip-3', gunSonra(30))] } } });
    await kur(db, iyz).ab.tahsilatBasarili('uc-1', 'sip-3');
    check('W2 ⭐ yerel kayit odenen planla uyusmuyor → odenen pakete HIZALANDI + olay', db.satir().paketSurumuId === 's-pro-mep' && db.olaylar.some((o: Satir) => o.tip === 'paket.hizalandi'));
  }

  // W3 · ESKI halkanin gec gelen siparisi (kokten eslesir) HICBIR SEYI geri almaz.
  {
    const erisim = gunSonra(25);
    const db = sahteDb({ abonelikler: [abonelik('pro-mep', { iyzicoAbonelikKodu: 'uc-2', iyzicoKokKodu: 'uc-0', erisimSonu: erisim, iyzicoDurum: 'ACTIVE' })], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico({ detaylar: { 'uc-0': { referenceCode: 'uc-0', pricingPlanReferenceCode: 'plan-basic-mek', subscriptionStatus: 'UPGRADED', orders: [siparis('sip-1', gunSonra(5))] } } });
    await kur(db, iyz).ab.tahsilatBasarili('uc-0', 'sip-1');
    const s = db.satir();
    check('W3a ⭐ eski halka: paket GERI ALINMADI (pro-mep)', s.paketSurumuId === 's-pro-mep', s.paketSurumuId);
    check('W3b ⭐ eski halka: erisim KISALMADI', s.erisimSonu.getTime() === erisim.getTime(), s.erisimSonu.toISOString());
    check('W3c eski halka: iyzicoDurum "UPGRADED" ile EZILMEDI', s.iyzicoDurum === 'ACTIVE', s.iyzicoDurum);
    check('W3d guncel uc KORUNDU (uc-2)', s.iyzicoAbonelikKodu === 'uc-2');
  }

  // W4 · zincir 3. kademe: ARA halka kokten bulunur → guncel uc EZILMEZ.
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep', { iyzicoAbonelikKodu: 'uc-2', iyzicoKokKodu: 'uc-0' })], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico({ detaylar: { 'uc-1': { referenceCode: 'uc-1', parentReferenceCode: 'uc-0', pricingPlanReferenceCode: 'plan-pro-mek', subscriptionStatus: 'UPGRADED', orders: [siparis('sip-x', gunSonra(3))] } } });
    await kur(db, iyz).ab.tahsilatBasarili('uc-1', 'sip-x');
    check('W4 ⭐ ara halka (uc-1) kokten eslesti → guncel uc uc-2 KORUNDU, paket degismedi', db.satir().iyzicoAbonelikKodu === 'uc-2' && db.satir().paketSurumuId === 's-pro-mep', db.satir().iyzicoAbonelikKodu);
  }

  // W5 · zincir 3. kademe: GERCEKTEN yeni kod (atasi bizim uc) → onarim SURUYOR.
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mek', { iyzicoAbonelikKodu: 'uc-1', iyzicoKokKodu: 'uc-0' })], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico({ detaylar: { 'uc-2': { referenceCode: 'uc-2', parentReferenceCode: 'uc-1', pricingPlanReferenceCode: 'plan-pro-mek-denemesiz', subscriptionStatus: 'ACTIVE', orders: [siparis('sip-y', gunSonra(30))] } } });
    await kur(db, iyz).ab.tahsilatBasarili('uc-2', 'sip-y');
    check('W5 atasi guncel uc olan YENI kod → uc onarildi (uc-2), olay yazildi', db.satir().iyzicoAbonelikKodu === 'uc-2' && db.olaylar.some((o: Satir) => o.tip === 'iyzico.zincir.hizalandi'));
  }

  // W7 · YUKSELTME SONRASI YENILEME: planli paket YOK, odenen plan = etkin paket.
  // Hizalama dali bos doner; kilidi (`paketGecisTarihi`) KALDIRAN tek sey
  // webhook'taki planli gecis cagrisidir. Mutasyon olcumu (23.09) bu cagriyi
  // silen mutantin YASADIGINI gosterdi: W1'de odenen plan planli paketti ve
  // hizalama isi zaten yapiyordu — cagrinin kendi isi HIC olculmuyordu.
  {
    const db = sahteDb({
      abonelikler: [abonelik('pro-mep', { iyzicoAbonelikKodu: 'uc-1', paketGecisTarihi: new Date(Date.now() - 60_000), erisimSonu: gunSonra(0.01) })],
      surumler: TUM_SURUMLER(),
    });
    const iyz = sahteIyzico({ detaylar: { 'uc-1': { referenceCode: 'uc-1', pricingPlanReferenceCode: 'plan-pro-mep-denemesiz', subscriptionStatus: 'ACTIVE', orders: [siparis('sip-7', gunSonra(30))] } } });
    await kur(db, iyz).ab.tahsilatBasarili('uc-1', 'sip-7');
    check(
      'W7 ⭐ yukseltme sonrasi ilk yenileme → "bu donem degisim yapildi" kilidi webhook\'ta KALKAR (taramayi beklemez)',
      db.satir().paketGecisTarihi === null && db.satir().paketSurumuId === 's-pro-mep',
      String(db.satir().paketGecisTarihi),
    );
  }

  // W4b · KOK SEMANTIGI (inceleme bulgusu 5): `parentReferenceCode` HEP kok
  // olabilir (20.08'de tek adim olculdu). Canli yeni uc uc-2'nin atasi kok
  // (uc-0), bizim guncel ucumuz uc-1. Konuma bakan ilk kural bunu "eski halka"
  // sanip onarimi kapatiyordu; karar iyzico DURUMUNDAN: ACTIVE = canli uc.
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mek', { iyzicoAbonelikKodu: 'uc-1', iyzicoKokKodu: 'uc-0' })], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico({ detaylar: { 'uc-2': { referenceCode: 'uc-2', parentReferenceCode: 'uc-0', pricingPlanReferenceCode: 'plan-pro-mek-denemesiz', subscriptionStatus: 'ACTIVE', orders: [siparis('sip-k', gunSonra(30))] } } });
    await kur(db, iyz).ab.tahsilatBasarili('uc-2', 'sip-k');
    check('W4b ⭐ kok-semantigi: atasi KOK olan canli uc (ACTIVE) → onarildi (uc-2)', db.satir().iyzicoAbonelikKodu === 'uc-2', db.satir().iyzicoAbonelikKodu);
  }

  // W8 · GUNCEL uctan gelen siparis olagan kurali korur (inceleme bulgusu 3):
  // satin almadaki gecici tampon (31+2 gun) ilk tahsilatta iyzico'nun donem
  // sonuna DUZELIR. "Asla kisaltma" kurali yalniz ESKI halkaya aittir.
  // ⚠ 24.09: fikstur satin almanin YAZDIGI hali tasir — kopru (`kopruErisimSonu`)
  // `erisimSonu` ile ayni. Kisaltma artik bu kaniti ister; W8b karsi tarafi,
  // `test:miras-erisimi` satin alma → webhook BAGLANTISINI olcer.
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mek', { iyzicoAbonelikKodu: 'uc-1', erisimSonu: gunSonra(33), kopruErisimSonu: gunSonra(33) })], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico({ detaylar: { 'uc-1': { referenceCode: 'uc-1', pricingPlanReferenceCode: 'plan-pro-mek-denemesiz', subscriptionStatus: 'ACTIVE', orders: [siparis('sip-ilk', gunSonra(30))] } } });
    await kur(db, iyz).ab.tahsilatBasarili('uc-1', 'sip-ilk');
    check('W8 ⭐ guncel uc: erisim iyzico donem sonuna DUZELDI (33 → 30 gun; tampon kaldirildi)', db.satir().erisimSonu.getTime() === gunSonra(30).getTime(), db.satir().erisimSonu.toISOString());
    check('W8a kopru ilk tahsilatla KAPANDI (ikinci siparis kisaltamaz)', db.satir().kopruErisimSonu === null, String(db.satir().kopruErisimSonu));
  }

  // W8b · ayni guncel uc siparisi, ama `erisimSonu` KOPRU DEGIL (miras gocunun
  // 365 gunu satin almada korundu, kopru NULL): donem sonu erisimi KISALTMAZ.
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mek', { iyzicoAbonelikKodu: 'uc-1', erisimSonu: gunSonra(340), kopruErisimSonu: null })], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico({ detaylar: { 'uc-1': { referenceCode: 'uc-1', pricingPlanReferenceCode: 'plan-pro-mek-denemesiz', subscriptionStatus: 'ACTIVE', orders: [siparis('sip-ilk', gunSonra(30))] } } });
    await kur(db, iyz).ab.tahsilatBasarili('uc-1', 'sip-ilk');
    check('W8b ⭐ guncel uc, kopru YOK: verilmis 340 gun KISALMADI (miras erisimi)', db.satir().erisimSonu.getTime() === gunSonra(340).getTime(), db.satir().erisimSonu.toISOString());
    // "Degismedi" webhook hic kosmasa da gecer: siparisin ISLENDIGI ayrica olculur.
    check('W8b-KANIT webhook siparisi isledi (durum olayi, aktor webhook)', db.olaylar.some((o: Satir) => o.tip === 'durum.degisti' && o.aktor === 'webhook' && o.veri?.siparisKodu === 'sip-ilk'));
  }

  // W9 · ⭐ YARIS (inceleme bulgusu 6): webhook satiri okuduktan SONRA musteri
  // yukseltir (guncel uc uc-1, paket pro-mep, kilit). Webhook devam eder:
  // eski siparisin plani (Basic) yukseltmeyi GERI ALMAMALI, kilidi KALDIRMAMALI.
  {
    const db = sahteDb({ abonelikler: [abonelik('basic-mek', { iyzicoAbonelikKodu: 'uc-0' })], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico({ detaylar: { 'uc-0': { referenceCode: 'uc-0', pricingPlanReferenceCode: 'plan-basic-mek-denemesiz', subscriptionStatus: 'ACTIVE', orders: [siparis('sip-y9', gunSonra(30))] } } });
    const asilGetir = iyz.istemci.abonelikGetir;
    iyz.istemci.abonelikGetir = async (kod: string) => {
      // Musterinin yukseltmesi TAM bu anda yerel satira yazilir.
      Object.assign(db.satir(), { iyzicoAbonelikKodu: 'uc-1', paketSurumuId: 's-pro-mep', paketGecisTarihi: gunSonra(29), odenenPaketSurumuId: 's-basic-mek' });
      return asilGetir(kod);
    };
    await kur(db, iyz).ab.tahsilatBasarili('uc-0', 'sip-y9');
    const s = db.satir();
    check(
      'W9 ⭐ yaris: arada yapilan yukseltme GERI ALINMADI ve kilidi KALKMADI (yazmalar webhook koduna bagli)',
      s.paketSurumuId === 's-pro-mep' && s.paketGecisTarihi !== null && s.odenenPaketSurumuId === 's-basic-mek',
      JSON.stringify({ p: s.paketSurumuId, t: s.paketGecisTarihi }),
    );
  }

  // W9b · ayni yaris, bu kez musterinin YENI degisimi bir DUSURME (planli,
  // vadesi gelecekte) ve eski siparisin odenen plani TAM o planli paket.
  // Hizalamadaki taze-satir kosulu olmasaydi "odenen plan = planli paket"
  // dali planli dusurmeyi VADESINDEN ONCE zorla uygulardi.
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mek', { iyzicoAbonelikKodu: 'uc-0' })], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico({ detaylar: { 'uc-0': { referenceCode: 'uc-0', pricingPlanReferenceCode: 'plan-basic-mek-denemesiz', subscriptionStatus: 'ACTIVE', orders: [siparis('sip-y9b', gunSonra(30))] } } });
    const asilGetir = iyz.istemci.abonelikGetir;
    iyz.istemci.abonelikGetir = async (kod: string) => {
      Object.assign(db.satir(), { iyzicoAbonelikKodu: 'uc-1', planliPaketSurumuId: 's-basic-mek', paketGecisTarihi: gunSonra(29) });
      return asilGetir(kod);
    };
    await kur(db, iyz).ab.tahsilatBasarili('uc-0', 'sip-y9b');
    check(
      'W9b ⭐ yaris: arada planlanan dusurme eski siparisle ERKEN uygulanmadi (pro-mek, planli duruyor)',
      db.satir().paketSurumuId === 's-pro-mek' && db.satir().planliPaketSurumuId === 's-basic-mek',
      JSON.stringify({ p: db.satir().paketSurumuId, pl: db.satir().planliPaketSurumuId }),
    );
  }

  // W10 · BASARISIZ yenileme (inceleme bulgusu 7): vadesi gelmis dusurme
  // ONCE uygulanir — ilk dunning bildirimi DUSURULMUS paketin fiyatini yazsin.
  {
    const db = sahteDb({
      abonelikler: [abonelik('pro-mek', { iyzicoAbonelikKodu: 'uc-1', planliPaketSurumuId: 's-basic-mek', paketGecisTarihi: new Date(Date.now() - 60_000) })],
      surumler: TUM_SURUMLER(),
    });
    // ⚠ 24.09: ret iyzico'dan DOGRULANIR (`tahsilatBasarisizligiKarari`,
    // `test:webhook-tahsilat-dogrulama` F) — gercek reddin karsiligi: abonelik
    // UNPAID, sipariste reddedilmis deneme.
    const iyz = sahteIyzico({ detaylar: { 'uc-1': { referenceCode: 'uc-1', pricingPlanReferenceCode: 'plan-basic-mek-denemesiz', subscriptionStatus: 'UNPAID', orders: [{ referenceCode: 'sip-f', orderStatus: 'FAILED', paymentAttempts: [{ paymentStatus: 'FAILURE' }] }] } } });
    await kur(db, iyz).ab.tahsilatBasarisiz('uc-1', 'sip-f');
    check(
      'W10 ⭐ basarisiz yenilemede planli dusurme UYGULANDI (dunning dusurulmus paketi gorur), durum ODEME_BEKLIYOR',
      db.satir().paketSurumuId === 's-basic-mek' && db.satir().durum === 'ODEME_BEKLIYOR',
      JSON.stringify({ p: db.satir().paketSurumuId, d: db.satir().durum }),
    );
  }

  // W6 · bilinmeyen plan kodu → tahmin yok.
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mek', { iyzicoAbonelikKodu: 'uc-1' })], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico({ detaylar: { 'uc-1': { referenceCode: 'uc-1', pricingPlanReferenceCode: 'plan-bilinmeyen', subscriptionStatus: 'ACTIVE', orders: [siparis('sip-z', gunSonra(30))] } } });
    await kur(db, iyz).ab.tahsilatBasarili('uc-1', 'sip-z');
    check('W6 bilinmeyen plan → paket DOKUNULMADI', db.satir().paketSurumuId === 's-pro-mek' && !db.olaylar.some((o: Satir) => o.tip === 'paket.hizalandi'));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  R · TEMIZLIK — eski planli gecis yeni duruma TASINMAZ
// ═══════════════════════════════════════════════════════════════════════════
async function rBlogu(): Promise<void> {
  console.log('\n── R · temizlik: iptal ve yeniden abonelik planli gecisi siler ──');
  const satinAlma = (db: any, iyz: ReturnType<typeof sahteIyzico>) =>
    new SatinAlmaServisi(db, iyz.istemci, new AbonelikServisi(db, iyz.istemci), KONFIG, {} as any, sahteEposta().servis);

  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mek', { iyzicoAbonelikKodu: 'uc-1', planliPaketSurumuId: 's-basic-mek', paketGecisTarihi: gunSonra(9) })], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico();
    await satinAlma(db, iyz).iptalEt('f1', 'u1', 'deneme');
    const s = db.satir();
    check('R1 ⭐ iptal → planli paket ve gecis tarihi TEMIZ', s.planliPaketSurumuId === null && s.paketGecisTarihi === null && s.durum === 'IPTAL');
    check('R1b dusurme planliyken iptal: etkin paket ODENMIS ust pakette kalir (pro-mek)', s.paketSurumuId === 's-pro-mek');
    check('R2 iptal GUNCEL uca gitti (uc-1 — eski kod terminal, 201403)', iyz.cagrilar.find((c) => c.metot === 'abonelikIptal')?.args[0] === 'uc-1');
  }
  {
    // ⭐⭐ YUKSELT + IPTAL ISTISMARI (inceleme bulgusu 2): yeni ucret baslamadan
    // iptal → etkin paket ODENMIS pakete doner. Aksi: her ay Basic al, MEP'e
    // gec, iptal et → MEP'i Basic fiyatina SUREKLI kullan.
    const db = sahteDb({
      abonelikler: [abonelik('pro-mep', { iyzicoAbonelikKodu: 'uc-1', paketGecisTarihi: gunSonra(20), odenenPaketSurumuId: 's-basic-mek' })],
      surumler: TUM_SURUMLER(),
    });
    await satinAlma(db, sahteIyzico()).iptalEt('f1', 'u1');
    const s = db.satir();
    check(
      'R4 ⭐⭐ yeni ucret baslamadan iptal → etkin paket ODENMIS pakete dondu (basic-mek) + olay',
      s.paketSurumuId === 's-basic-mek' && s.odenenPaketSurumuId === null && db.olaylar.some((o: Satir) => o.tip === 'paket.geri.alindi'),
      JSON.stringify({ p: s.paketSurumuId, o: s.odenenPaketSurumuId }),
    );
  }
  {
    // Yeni ucretin tarihi GECTI (ust paket odenmis sayilir; kilit webhook'u
    // bekliyor olsa da): iptal ust paketi GERI ALMAZ.
    const db = sahteDb({
      abonelikler: [abonelik('pro-mep', { iyzicoAbonelikKodu: 'uc-1', paketGecisTarihi: gunSonra(-0.1), odenenPaketSurumuId: 's-basic-mek' })],
      surumler: TUM_SURUMLER(),
    });
    await satinAlma(db, sahteIyzico()).iptalEt('f1', 'u1');
    check('R5 yeni ucret basladiktan sonra iptal → ust paket KORUNUR (pro-mep)', db.satir().paketSurumuId === 's-pro-mep' && !db.olaylar.some((o: Satir) => o.tip === 'paket.geri.alindi'));
  }
  {
    // ⭐ IPTAL BAYAT UCA TAKILMAZ (inceleme bulgusu 1): kayitli uc uc-0 iyzico'da
    // UPGRADED (201403 "iptal edilemez"); canli uc uc-1 bulunur, O iptal edilir.
    const iyz = sahteIyzico({
      iptalHatasi: { 'uc-0': new IyzicoHatasi('201403', 'Bu abonelik iptal edilemez') },
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'UPGRADED' } },
      aramaSonucu: [{ referenceCode: 'uc-1', parentReferenceCode: 'uc-0', customerReferenceCode: 'm-1', pricingPlanReferenceCode: 'plan-pro-mek-denemesiz', subscriptionStatus: 'ACTIVE' }],
    });
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    await basarir('R6', () => satinAlma(db, iyz).iptalEt('f1', 'u1'));
    const iptaller = iyz.cagrilar.filter((c) => c.metot === 'abonelikIptal').map((c) => c.args[0]);
    check(
      'R6 ⭐ 201403 → canli uc bulundu ve IPTAL EDILDI, kayit canli uca guncellendi',
      JSON.stringify(iptaller) === '["uc-0","uc-1"]' && db.satir().iyzicoAbonelikKodu === 'uc-1' && db.satir().durum === 'IPTAL',
      JSON.stringify({ iptaller, uc: db.satir().iyzicoAbonelikKodu, d: db.satir().durum }),
    );
  }
  {
    const iyz = sahteIyzico({
      iptalHatasi: { 'uc-0': new IyzicoHatasi('201403', 'Bu abonelik iptal edilemez') },
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'UPGRADED' } },
      aramaSonucu: [],
    });
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const r = await reddeder(() => satinAlma(db, iyz).iptalEt('f1', 'u1'));
    check('R7 canli uc BULUNAMAZSA asil hata atilir, yerel durum IPTAL YAZILMAZ (sessiz basari yok)', r !== null && db.satir().durum === 'AKTIF', JSON.stringify(r));
  }
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mek', { durum: 'SONA_ERDI', planliPaketSurumuId: 's-basic-mek', paketGecisTarihi: gunSonra(-3) })], surumler: TUM_SURUMLER() });
    await (satinAlma(db, sahteIyzico()) as any).aboneligiAcVeyaGuncelle({ firmaId: 'f1', paketSurumuId: 's-pro-mep', iyzicoAbonelikKodu: 'yeni-1', denemeGunu: 0 });
    const s = db.satir();
    check('R3 ⭐ yeniden abonelik → eski planli gecis SILINDI (yeni paketin ustune uygulanmaz)', s.paketSurumuId === 's-pro-mep' && s.planliPaketSurumuId === null && s.paketGecisTarihi === null, JSON.stringify({ p: s.paketSurumuId, pl: s.planliPaketSurumuId }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  B · BAGLANTI — mekanizma var, BAGLANTI da var mi?
// ═══════════════════════════════════════════════════════════════════════════
function bBlogu(): void {
  console.log('\n── B · baglanti (uc, kapilar, modul, zamanlayici, kurulum) ──');
  const ctrl = kodu(oku('backend/src/ozellik/odeme/abonelik/abonelik.controller.ts')).replace(/\r\n/g, '\n');
  const i = ctrl.indexOf("@Post('degistir')");
  check('B0-OLCUT degistir ucu bulundu', i > -1);
  // Dekorator blogu: ONCEKI METODUN kapanisindan (2 bosluk girintili `}`)
  // rotaya kadar. ⚠ Ilk olcut "onceki `}` karakteri"ydi ve `@Throttle({ … })`
  // eklenince kesim o nesnenin icine dustu — blok bos kaldi, B1/B2 KIRMIZI.
  const blok = ctrl.slice(ctrl.lastIndexOf('\n  }\n', i), i);
  check('B0b-OLCUT dekorator blogu bir onceki metottan basliyor (FirmaRolGuard gorunur)', blok.includes('@FirmaRolu'), blok.slice(0, 80));
  check('B1 ⭐ uc SAHIP kapili (FirmaRolGuard + sahip)', /@UseGuards\(FirmaRolGuard\)/.test(blok) && /@FirmaRolu\('sahip'\)/.test(blok), blok.trim());
  check('B2 kapali hesap bu ucta METOTTA kapatildi', /@SetMetadata\(KAPALI_HESAP_IZINLI, false\)/.test(blok));
  check(
    'B2b hiz siniri: oturum sahibi kovasi + 15 dk\'da 5 (her cagri iyzico\'ya gider)',
    /@UseGuards\(KullaniciHizSiniriGuard\)/.test(blok) && /@Throttle\(\{ default: \{ ttl: 900_000, limit: 5 \} \}\)/.test(blok),
    blok.trim(),
  );
  const govde = ctrl.slice(i, i + 600);
  check('B3 govde SINIF dto (satir-ici tip ValidationPipe\'i atlar)', /@Body\(\) g: AbonelikDegistirDto/.test(govde));
  check('B4 uc servise baglanmis', /this\.paketDegisimi\.degistir\(/.test(govde));
  const paketler = ctrl.slice(ctrl.indexOf("@Get('paketler')"), ctrl.indexOf("@Get('durum')"));
  check('B5 ⭐ kart dugmeleri AYNI karardan (yollar → degisim alani)', /this\.paketDegisimi\.yollar\(/.test(paketler) && /degisim: yollar\.get\(/.test(paketler));

  const dto = kodu(oku('backend/src/ozellik/odeme/abonelik/dto/abonelik-degistir.dto.ts'));
  check('B6 dto: onay @Equals(true) (false GECMEZ)', /@Equals\(true/.test(dto) && /sozlesmeOnayi: boolean/.test(dto));

  const modul = kodu(oku('backend/src/ozellik/odeme/odeme.module.ts'));
  const saglayici = modul.slice(modul.indexOf('providers:'), modul.indexOf('exports:'));
  const disa = modul.slice(modul.indexOf('exports:'));
  check('B7 ⭐ servis modulde SAGLAYICI (zamanlayici ancak boyle kosar)', /\bPaketDegisimiServisi,/.test(saglayici));
  check('B8 servis disa acik (yonetici paneli ayni yolu kullanacak)', /\bPaketDegisimiServisi,/.test(disa));

  const servis = kodu(oku('backend/src/ozellik/odeme/abonelik/paket-degisimi.servisi.ts'));
  check(
    'B9 ⭐ 10 dk zamanlayici PARAMETRESIZ (cron argumani tarih sanilmaz)',
    /@Cron\(CronExpression\.EVERY_10_MINUTES\)\s*async planliGecisleriTara\(\): Promise<void>/.test(servis),
  );
  check('B10 zamanlayici TEK KAYNAGI cagiriyor', /this\.abonelik\s*\.planliGecisiUygula\(/.test(servis));
  check('B10b zamanlayici emniyet supabini TEK KAYNAKTAN aciyor', /this\.abonelik\s*\.degisimKilidiniKaldir\(/.test(servis));

  const kurulum = kodu(oku('backend/scripts/paketleri-kur.ts'));
  check('B11 ⭐ yeni paket kurulumu TEK URUN kullaniyor (paket basina urun YOK)', /const urunAdi = TEK_URUN_ADI;/.test(kurulum) && !kurulum.includes('`MetaPriceX ${p.ad}`'));
  check('B12 --tek-urun kipi bagli', /if \(tekUrun\) \{[\s\S]{0,600}await tekUruneTasi\(/.test(kurulum));

  const s1 = { satistaMi: true, iyzicoUrunKodu: 'eski' };
  check('B13 tasima karari: satistaki + baska urun → TASI; ayni urun ya da satis disi → atla',
    tekUruneTasinmaliMi(s1, 'tek') && !tekUruneTasinmaliMi({ ...s1, iyzicoUrunKodu: 'tek' }, 'tek') && !tekUruneTasinmaliMi({ ...s1, satistaMi: false }, 'tek') && tekUruneTasinmaliMi(s1, null));
  const t = tekUrunPlanTanimlari({ tutar: '1649.00', paraBirimi: 'TRY', periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 30, paket: { ad: 'Pro' } });
  check('B14 ⭐ goc FIYATI DEGISTIRMEZ: ana + ikiz ayni tutar, ana denemeli, ikiz denemesiz',
    t.ana.tutar === 1649 && t.ikiz?.tutar === 1649 && t.ana.denemeGunu === 30 && t.ikiz?.denemeGunu === 0, JSON.stringify(t));
  const t0 = tekUrunPlanTanimlari({ tutar: '1649.00', paraBirimi: 'TRY', periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 0, paket: { ad: 'Pro' } });
  check('B15 denemesiz surumde ikinci plan KURULMAZ', t0.ikiz === null);
  check('B16 tek urun adi sabit', TEK_URUN_ADI === 'MetaPriceX Abonelik');

  const satin = kodu(oku('backend/src/ozellik/odeme/abonelik/satinalma.servisi.ts'));
  check('B17 satin alma reddi artik VAR OLAN yolu gosteriyor', satin.includes('Bu pakete geç') && !/yukseltme yolunu kullanin/.test(satin));
}

/** Bir blokta cokme sonrakileri GIZLEMESIN: hata o blogun kirmizisi olur, kosu surer. */
async function blok(ad: string, fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch (e: any) {
    check(`${ad} blogu — BEKLENMEDIK HATA (blok yarida kaldi)`, false, e?.message ?? String(e));
  }
}

async function main(): Promise<void> {
  await blok('H', hBlogu);
  await blok('Y', yBlogu);
  await blok('T', tBlogu);
  await blok('S', sBlogu);
  await blok('G', gBlogu);
  await blok('E', eBlogu);
  await blok('W', wBlogu);
  await blok('R', rBlogu);
  await blok('B', bBlogu);

  console.log(`\n${'═'.repeat(60)}\n  PAKET DEGISIMI: ${passed} gecti, ${failed} kaldi\n${'═'.repeat(60)}`);
  if (failed > 0) {
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('BEKLENMEDIK HATA:', e);
  process.exitCode = 1;
});
