/**
 * YONETICI PAKET ISLEMLERI — KAPI · `npm run test:yonetici-paket`
 * (24.09.2026, yonetici paneli turu A2 — Emre karari)
 *
 * DB GEREKTIRMEZ · AG GEREKTIRMEZ · IYZICO GEREKTIRMEZ (sahte Prisma + iyzico).
 *
 * ── BU TUR NEDEN VAR ─────────────────────────────────────────────────────
 * Yonetici HICBIR yoldan firmanin paketini degistiremiyordu: `updateUserTier`
 * her zaman `PAKET_ABONELIKTEN` doner; "abonelik ekle" uclari eski kisi-basi
 * tabloya yaziyordu ve ERISIM VERMIYORDU (canlida 0 kullanim, 24.09).
 *
 * Emre: yonetici YUKSELTIRSE musteri onayi; DUSURME onaysiz dogrudan; tek yol
 * (A1'in cekirdegi). Bu blok (Blok 1) dogrudan dusurmeyi ve paneli kurar.
 *
 * ── BLOKLAR ──────────────────────────────────────────────────────────────
 *   K · Karar: 5×5 gercek katalog + fiyat kurali + deneme + kartsiz + red metinleri
 *   D · Dusurme servisi: A1 cekirdegi, niyet denetimi ONCE, sonuc denetimi AYNI
 *       islemde, kurtarmada e-posta yok, kuyrukta taze kural, sira
 *   P · Panel: okuma yuzu (iyzico kodu sizmaz, koltuk etkisi, 404)
 *   O · Oneri (Blok 2): saf kural, olustur (tek bekleyen, denetim ayni islemde,
 *       e-posta sahiplere), geri cek, ret (ikinci katman), kabul = A1 cekirdegi,
 *       baska degisiklikte kapanma, kuyruk yarisi, ic ice sira, musteri yaniti
 *   B · Baglanti: uc korumalari, DTO, modul, eski uclar kaldirildi, tek cagiran,
 *       oneri uclari, imha, sema kilidi, goc
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { AbonelikDurumu, OdemeYontemi, PaketOnerisiDurumu, Prisma } from '@prisma/client';

import type { PaketHaklari } from '../src/ozellik/odeme/abonelik/paket-degisimi';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { PaketDegisimiServisi } from '../src/ozellik/odeme/abonelik/paket-degisimi.servisi';
import {
  durdurulacakUye,
  kurusa,
  yoneticiIslemi,
} from '../src/ozellik/odeme/abonelik/yonetici/yonetici-islemi';
import { YoneticiDusurmeServisi } from '../src/ozellik/odeme/abonelik/yonetici/yonetici-dusurme.servisi';
import { YoneticiAbonelikServisi } from '../src/ozellik/odeme/abonelik/yonetici/yonetici-abonelik.servisi';
import { PaketOnerisiServisi } from '../src/ozellik/odeme/abonelik/yonetici/paket-onerisi.servisi';
import {
  oneriDurumu,
  oneriKabulKarari,
  oneriSonGecerlilik,
} from '../src/ozellik/odeme/abonelik/yonetici/paket-onerisi';
import {
  gunlukIcinMaskele,
  hakListesi,
  yoneticiDusurmeEpostasi,
  yoneticiOneriEpostasi,
} from '../src/ozellik/odeme/abonelik/yonetici/yonetici-paket-epostalari';
import { AbonelikController } from '../src/ozellik/odeme/abonelik/abonelik.controller';
import { KAPALI_HESAP_IZINLI } from '../src/altyapi/auth/decorators/kapali-hesap-izinli.decorator';
import { IyzicoHatasi } from '../src/ozellik/odeme/iyzico/iyzico.client';

// Sessiz ama OLCULEBILIR: `DENETIM-YAZILAMADI` etiketi alarm betiginin saydigi
// tek iz (sunucu-urunleri-test.ts). Kapi o satirin YAZILDIGINI olcer.
const GUNLUK: string[] = [];
Logger.overrideLogger({
  log: () => undefined,
  warn: (m: unknown) => void GUNLUK.push(String(m)),
  error: (m: unknown) => void GUNLUK.push(String(m)),
  debug: () => undefined,
  verbose: () => undefined,
  fatal: (m: unknown) => void GUNLUK.push(String(m)),
});

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
// ⚠ GERCEK SAAT (A1 dersi): sabit tarih birkac hafta sonra fikstürü bozar.
const SIMDI = new Date();
const gunSonra = (n: number) => new Date(SIMDI.getTime() + n * GUN);

// ═══════════════════════════════════════════════════════════════════════════
//  GERCEK KATALOG — paketleri-kur.ts PAKETLER ile AYNI haklar ve fiyatlar
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
const KODLAR = Object.keys(HAKLAR);
const TEK_URUN = 'urun-tek';

type Satir = Record<string, any>;

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
    paket: { kod, ad: `Paket ${kod}`, sira: KODLAR.indexOf(kod), aktif: true, ...(HAKLAR[kod] ?? HAKLAR['basic-mek']) },
    ...o,
  };
}

/** Sahte `Abonelik` (paketSurumu dahil). */
function abonelik(kod: string, o: Record<string, unknown> = {}): any {
  const { surum: ozelSurum, ...geri } = o as Record<string, any>;
  const s = ozelSurum ?? surum(kod);
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
    ...geri,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  K · KARAR (saf) — 5×5 gercek katalog
// ═══════════════════════════════════════════════════════════════════════════
function kBlogu(): void {
  console.log('\n── K · yonetici karari (dogrudan dusurme = kayip var, kazanc yok, fiyat artmaz, AKTIF) ──');
  const karar = (mevcut: string, yeni: string, o: Record<string, unknown> = {}, y: any = surum(yeni)) =>
    yoneticiIslemi({ ab: abonelik(mevcut, o), yeni: y, simdi: SIMDI, firmaKapali: false });

  // Beklenen matris (satir = mevcut, sutun = yeni). Hak farki: basic<pro; mek/elk ⊂ mep.
  const BEKLENEN: Record<string, Record<string, string>> = {
    'basic-mek': { 'basic-mek': 'yok', 'pro-mek': 'oneri', 'basic-elk': 'oneri', 'pro-elk': 'oneri', 'pro-mep': 'oneri' },
    'pro-mek': { 'basic-mek': 'dogrudan-dusur', 'pro-mek': 'yok', 'basic-elk': 'oneri', 'pro-elk': 'oneri', 'pro-mep': 'oneri' },
    'basic-elk': { 'basic-mek': 'oneri', 'pro-mek': 'oneri', 'basic-elk': 'yok', 'pro-elk': 'oneri', 'pro-mep': 'oneri' },
    'pro-elk': { 'basic-mek': 'oneri', 'pro-mek': 'oneri', 'basic-elk': 'dogrudan-dusur', 'pro-elk': 'yok', 'pro-mep': 'oneri' },
    'pro-mep': { 'basic-mek': 'dogrudan-dusur', 'pro-mek': 'dogrudan-dusur', 'basic-elk': 'dogrudan-dusur', 'pro-elk': 'dogrudan-dusur', 'pro-mep': 'yok' },
  };
  const hatalar: string[] = [];
  for (const m of KODLAR) {
    for (const y of KODLAR) {
      const k = karar(m, y);
      if (k.tur !== BEKLENEN[m][y]) hatalar.push(`${m}→${y}: ${k.tur} (beklenen ${BEKLENEN[m][y]})`);
    }
  }
  check('K1 ⭐ 5×5 GERCEK katalog: dogrudan yalniz saf dusurme, yukseltme ve yatay ONERI', hatalar.length === 0, hatalar.join(' · '));
  const hucreler = Object.values(BEKLENEN).flatMap((r) => Object.values(r));
  check(
    'K1b matris FIXTURE KANITI: 6 dogrudan, 14 oneri, 5 ayni paket (yok) — tek sinifa cokmedi',
    hucreler.filter((v) => v === 'dogrudan-dusur').length === 6 &&
      hucreler.filter((v) => v === 'oneri').length === 14 &&
      hucreler.filter((v) => v === 'yok').length === 5,
  );

  const yatay = karar('pro-mek', 'pro-elk');
  check(
    'K2 ⭐ yatay gecis (Pro Mek → Pro Elk) ONERI: kayip VE kazanc birlikte (kapsam)',
    yatay.tur === 'oneri' && yatay.kayiplar.includes('kapsam') && yatay.kazanclar.includes('kapsam') && /Yatay/.test(yatay.aciklama),
    JSON.stringify(yatay),
  );
  const yukselt = karar('basic-mek', 'pro-mek');
  check(
    'K3 yukseltme ONERI: kazanc var, kayip yok, aciklama "Yükseltme"',
    yukselt.tur === 'oneri' && yukselt.kayiplar.length === 0 && yukselt.kazanclar.includes('seviye') && /Yükseltme/.test(yukselt.aciklama),
    JSON.stringify(yukselt),
  );

  // ── Fiyat kurali: kur farkiyla "dusurme" daha PAHALI olabilir ─────────
  const pahaliBasic = surum('basic-mek', { tutarDize: '1700.00' });
  const pahali = yoneticiIslemi({ ab: abonelik('pro-mek'), yeni: pahaliBasic, simdi: SIMDI, firmaKapali: false });
  check(
    'K4 ⭐ haklar azaliyor ama yeni ucret DAHA YUKSEK → dogrudan DEGIL, oneri (musteriden habersiz fazla cekilmez)',
    pahali.tur === 'oneri' && pahali.kazanclar.length === 0 && pahali.kayiplar.length > 0,
    JSON.stringify(pahali),
  );
  const esitBasic = surum('basic-mek', { tutarDize: '1649.00' });
  check(
    'K4b sinir: yeni ucret mevcutla ESIT → dogrudan (<=, kesin kucuk DEGIL)',
    yoneticiIslemi({ ab: abonelik('pro-mek'), yeni: esitBasic, simdi: SIMDI, firmaKapali: false }).tur === 'dogrudan-dusur',
  );
  const dovizBasic = surum('basic-mek', { paraBirimi: 'USD', tutarDize: '10.00' });
  check(
    'K4c farkli para birimi → fiyat karsilastirilamaz → oneri',
    yoneticiIslemi({ ab: abonelik('pro-mek'), yeni: dovizBasic, simdi: SIMDI, firmaKapali: false }).tur === 'oneri',
  );
  const bozukTutar = surum('basic-mek', { tutarDize: 'abc' });
  check(
    'K4d cozulemeyen tutar (NaN) → oneri (kapali varsayim)',
    yoneticiIslemi({ ab: abonelik('pro-mek'), yeni: bozukTutar, simdi: SIMDI, firmaKapali: false }).tur === 'oneri',
  );

  // ── Deneme: olculmemis NEXT_PERIOD-denemede yolu musteriden habersiz kullanilmaz
  const deneme = karar('pro-mep', 'pro-mek', { durum: AbonelikDurumu.DENEME, denemeSonu: gunSonra(10) });
  check(
    'K5 ⭐ DENEMEDEKI firmada saf dusurme bile ONERI (dogrudan yalniz AKTIF)',
    deneme.tur === 'oneri' && /deneme/.test(deneme.aciklama),
    JSON.stringify(deneme),
  );
  // Inceleme bulgusu H1: gece mutabakati deneme satirini AKTIF'e cekebiliyordu.
  const etiketAktif = karar('pro-mep', 'pro-mek', { durum: AbonelikDurumu.AKTIF, denemeSonu: gunSonra(10) });
  check(
    "K5b ⭐ etiketi AKTIF ama denemeSonu GELECEKTE → yine ONERI (deneme TARIHE gore okunur)",
    etiketAktif.tur === 'oneri' && /deneme/.test(etiketAktif.aciklama),
    JSON.stringify(etiketAktif),
  );
  const denemeBitti = karar('pro-mep', 'pro-mek', { durum: AbonelikDurumu.AKTIF, denemeSonu: gunSonra(-5) });
  check(
    'K5c denemesi BITMIS AKTIF firma → dogrudan (tarih kurali gereginden genis degil)',
    denemeBitti.tur === 'dogrudan-dusur',
    JSON.stringify(denemeBitti),
  );

  // ── Bilinmeyen deger: iki yonde de kayip → kazanc var → oneri ─────────
  const garip = surum('basic-mek', { paket: { kod: 'x', ad: 'X', seviye: 'altin', kapsam: 'mechanical', kullaniciHakki: 1, dwgAktif: false, aylikTeklifHakki: null } });
  check(
    'K6 bilinmeyen seviye → kazanc da sayilir (kapali) → oneri, asla dogrudan',
    yoneticiIslemi({ ab: abonelik('pro-mek'), yeni: garip, simdi: SIMDI, firmaKapali: false }).tur === 'oneri',
  );

  // ── Kartsiz: satir yok / HAVALE / miras ─────────────────────────────
  const yok = yoneticiIslemi({ ab: null, yeni: surum('pro-mek'), simdi: SIMDI, firmaKapali: false });
  check('K7 aboneligi OLMAYAN firma → sureli-paket', yok.tur === 'sureli-paket', JSON.stringify(yok));
  const havale = karar('pro-mek', 'pro-mep', { odemeYontemi: 'HAVALE', iyzicoAbonelikKodu: null });
  check('K8 HAVALE ile odeyen (AKTIF) → sureli-paket (iyzico yolu YOK)', havale.tur === 'sureli-paket', JSON.stringify(havale));
  const havaleAyni = karar('pro-mek', 'pro-mek', { odemeYontemi: 'HAVALE', iyzicoAbonelikKodu: null });
  check('K8b havalede AYNI paket → sureli-paket (sure uzatma), "yok" DEGIL', havaleAyni.tur === 'sureli-paket' && /uzatıl/.test(havaleAyni.aciklama), JSON.stringify(havaleAyni));
  const miras = yoneticiIslemi({
    ab: abonelik('pro-mep', {
      odemeYontemi: 'HAVALE',
      iyzicoAbonelikKodu: null,
      surum: surum('pro-mep', { id: 's-miras-pro', satistaMi: false, paket: { kod: 'miras-pro', ad: 'Miras Pro', seviye: 'pro', kapsam: 'mep', kullaniciHakki: 5, dwgAktif: true, aylikTeklifHakki: null } }),
    }),
    yeni: surum('pro-mep'),
    simdi: SIMDI,
    firmaKapali: false,
  });
  check(
    'K9 miras (havale) firmasi → sureli-paket; kullanici hakki 5→3 KAYIP olarak raporlanir',
    miras.tur === 'sureli-paket' && miras.kayiplar.includes('kullanici'),
    JSON.stringify(miras),
  );

  // ── Kart satiri: A1 reddi yoneticiye UCUNCU SAHIS diliyle ─────────────
  const sonaErmis = karar('pro-mek', 'basic-mek', {
    durum: AbonelikDurumu.SONA_ERDI,
    erisimSonu: gunSonra(-3),
    iyzicoDurum: 'CANCELED',
  });
  check(
    'K10 ⭐ kart satiri SONA_ERDI → sureli-paket DEGIL ("yok": musteri kendi satin alir)',
    sonaErmis.tur === 'yok' && /satın alabilir/.test(sonaErmis.aciklama),
    JSON.stringify(sonaErmis),
  );
  // master f369d54: iyzico'su hala ACIK geri donen musteri satiri → A1 `KART_ABONELIGI_ACIK`.
  const acikKart = karar('pro-mek', 'basic-mek', {
    durum: AbonelikDurumu.SONA_ERDI,
    erisimSonu: gunSonra(-3),
    iyzicoDurum: 'ACTIVE',
  });
  check(
    'K10b ⭐ SONA_ERDI ama iyzico\'da ACIK → yok + yonetici metni ("hâlâ açık"; `undefined` DEGIL)',
    acikKart.tur === 'yok' && /hâlâ açık/.test(acikKart.aciklama ?? ''),
    JSON.stringify(acikKart),
  );
  const askida = karar('pro-mek', 'basic-mek', { durum: AbonelikDurumu.ASKIDA, iyzicoDurum: 'UNPAID' });
  check('K11 kart satiri ASKIDA → yok (once odeme)', askida.tur === 'yok' && /askıda/.test(askida.aciklama), JSON.stringify(askida));
  const eskiUrun = karar('pro-mek', 'basic-mek', { surum: surum('pro-mek', { iyzicoUrunKodu: 'urun-eski' }) });
  check(
    'K12 ⭐ eski urun yapisi (URUN_FARKLI) → yok + yoneticiye yol: "iptal edip ... satın alabilir"',
    eskiUrun.tur === 'yok' && /eski paket yapısında/.test(eskiUrun.aciklama) && /iptal edip/.test(eskiUrun.aciklama),
    JSON.stringify(eskiUrun),
  );
  const ayni = karar('pro-mek', 'pro-mek');
  check(
    'K13 kart + ayni paket → yok, MUSTERI dili YOK ("kullanıyorsunuz" gecmez)',
    ayni.tur === 'yok' && !/kullanıyorsunuz/.test(ayni.aciklama) && /mevcut paketi/.test(ayni.aciklama),
    ayni.aciklama,
  );
  const kilitli = karar('pro-mep', 'pro-mek', { paketGecisTarihi: gunSonra(20) });
  check('K14 bekleyen degisim (kilit) → yok + gecis tarihi', kilitli.tur === 'yok' && /zaten yapıldı/.test(kilitli.aciklama), kilitli.aciklama);
  const iptal = karar('pro-mep', 'pro-mek', { durum: AbonelikDurumu.IPTAL });
  check('K15 iptal edilmis → yok + bitis tarihi', iptal.tur === 'yok' && /iptal edildi/.test(iptal.aciklama), iptal.aciklama);

  // ── Firma kapali / satista degil ───────────────────────────────────────
  const kapali = yoneticiIslemi({ ab: abonelik('pro-mep'), yeni: surum('pro-mek'), simdi: SIMDI, firmaKapali: true });
  check('K16 kapatilmis firma → HER islem yok (geri acma ayri is)', kapali.tur === 'yok' && /kapatılmış/.test(kapali.aciklama), kapali.aciklama);
  const kapaliSatirsiz = yoneticiIslemi({ ab: null, yeni: surum('pro-mek'), simdi: SIMDI, firmaKapali: true });
  check('K16b kapali + satirsiz → sureli-paket DEGIL', kapaliSatirsiz.tur === 'yok');
  const satissiz = yoneticiIslemi({ ab: null, yeni: surum('pro-mek', { satistaMi: false }), simdi: SIMDI, firmaKapali: false });
  check('K17 satista olmayan surum → yok', satissiz.tur === 'yok' && /satışta değil/.test(satissiz.aciklama));

  // ── Yardimcilar ──────────────────────────────────────────────────────────
  check(
    'K18 kurusa: "1649.00"=164900, "1649.5"=164950, "12"=1200; bicimsiz → NaN',
    kurusa('1649.00') === 164900 && kurusa('1649.5') === 164950 && kurusa('12') === 1200 && Number.isNaN(kurusa('1,5')),
  );
  check(
    'K19 durdurulacakUye: 3 etkin, hak 2 → 1 · hak 0/1 → en eski sahip kalir (2 durur) · hak yeterli → 0',
    durdurulacakUye(3, 2) === 1 && durdurulacakUye(3, 0) === 2 && durdurulacakUye(3, 1) === 2 && durdurulacakUye(2, 3) === 0,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SAHTE PRISMA (GERI ALAN islem) + IYZICO + E-POSTA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prisma `where` alt kumesi: esitlik, Date, null, {lte, gt, in, not}, OR, NOT
 * ve ILISKI suzgeci (`paket: { aktif: true }` — operatorsuz nesne ic satira
 * uygulanir; eskiden SESSIZCE atlaniyordu).
 */
function eslesir(satir: Satir, where: Record<string, any> | undefined): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(v as Satir[]).some((w) => eslesir(satir, w))) return false;
      continue;
    }
    if (k === 'NOT') {
      if (eslesir(satir, v)) return false;
      continue;
    }
    const d = satir[k];
    if (v instanceof Date) {
      if (!(d instanceof Date) || d.getTime() !== v.getTime()) return false;
      continue;
    }
    if (v !== null && typeof v === 'object') {
      // Iliski suzgeci YALNIZ satirin alani da nesneyse (ic satir). Aksi hâlde
      // operator nesnesidir; bilinmeyen operator eskisi gibi atlanir.
      if (d !== null && typeof d === 'object' && !(d instanceof Date) && !Array.isArray(d)) {
        if (!eslesir(d, v)) return false;
        continue;
      }
      if ('lte' in v && !(d instanceof Date && d.getTime() <= v.lte.getTime())) return false;
      if ('gt' in v && !(d instanceof Date && d.getTime() > v.gt.getTime())) return false;
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

const FIRMA = () => ({
  id: 'f1',
  ad: 'Firma A',
  imhaTarihi: null as Date | null,
  faturaEposta: 'fatura@firma.test',
  yetkiliEposta: null as string | null,
});
const KULLANICI = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  email: `${id}@firma.test`,
  firmaId: 'f1',
  firmaRol: 'uye',
  deletedAt: null,
  status: 'active',
  createdAt: new Date(2026, 0, 1),
  ...o,
});
/** Sahip + iki etkin uye + bir silinmis uye (sayilmaz). */
const EKIP = () => [
  KULLANICI('sahip', { firmaRol: 'sahip' }),
  KULLANICI('uye1'),
  KULLANICI('uye2'),
  KULLANICI('eski', { deletedAt: new Date(2026, 5, 1) }),
];

function sahteDb(p: {
  abonelikler: Satir[];
  surumler: Satir[];
  firma?: Satir | null;
  kullanicilar?: Satir[];
  /** Bu tipteki `YoneticiOlayi` yazimi DUSER (denetim kaybi senaryolari). */
  dusenDenetim?: string;
  /** Oneri `create`inden HEMEN ONCE calisir: ikinci surecin araya girmesi. */
  oneriYazimOncesi?: (oneriler: Satir[]) => void;
  /** `firma` disindaki firmalar (baska firma yolundan istek senaryolari). */
  digerFirmalar?: Satir[];
}) {
  const olaylar: Satir[] = [];
  const denetimler: Satir[] = [];
  const oneriler: Satir[] = [];
  /** Denetim satirlari ve iyzico cagrilari TEK siraya yazilir (sira olcumu). */
  const sira: string[] = [];
  const kullanicilar = p.kullanicilar ?? EKIP();
  const firma = p.firma === undefined ? FIRMA() : p.firma;
  const surumBul = (id: string | null) => p.surumler.find((s) => s.id === id) ?? null;
  const dolu = (a: Satir | undefined | null) =>
    a ? { ...a, paketSurumu: surumBul(a.paketSurumuId), planliPaketSurumu: surumBul(a.planliPaketSurumuId) } : null;
  const bul = (where: Satir) => p.abonelikler.find((a) => eslesir(a, where));
  const oneriDolu = (o: Satir | undefined | null) =>
    o ? { ...o, hedefPaketSurumu: surumBul(o.hedefPaketSurumuId) } : null;
  const db: any = {
    olaylar,
    denetimler,
    oneriler,
    sira,
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
      // `orderBy: { surumNo: 'desc' }` GERCEKTEN uygulanir (musterinin gordugu
      // surum = en yuksek numara; D5 kapisi bunu olcer).
      findFirst: async ({ where, orderBy }: any) => {
        const bulunan = p.surumler.filter((s) => eslesir(s, where));
        if (orderBy?.surumNo === 'desc') bulunan.sort((a, b) => b.surumNo - a.surumNo);
        return bulunan[0] ?? null;
      },
      findMany: async ({ where }: any) => p.surumler.filter((s) => eslesir(s, where)),
    },
    abonelikOlayi: {
      create: async ({ data }: any) => {
        const kayit = { olusturuldu: new Date(), ...data }; // Prisma varsayilani now()
        olaylar.push(kayit);
        return kayit;
      },
      // `where` GERCEKTEN uygulanir (abonelik + tip + yeniDurum in + olusturuldu gt).
      count: async ({ where }: any) => olaylar.filter((o) => eslesir(o, where)).length,
    },
    yoneticiOlayi: {
      create: async ({ data }: any) => {
        if (p.dusenDenetim && data.tip === p.dusenDenetim) throw new Error('sahte DB: denetim yazimi dustu');
        denetimler.push(data);
        sira.push(`denetim:${data.tip}`);
        return data;
      },
    },
    firma: {
      findUnique: async ({ where }: any) => {
        const f = [...(firma ? [firma] : []), ...(p.digerFirmalar ?? [])].find((x) => x.id === where?.id);
        return f ? { ...f } : null;
      },
      updateMany: async () => ({ count: 0 }),
    },
    user: {
      count: async ({ where }: any) => kullanicilar.filter((u) => eslesir(u, where)).length,
      findMany: async ({ where }: any) =>
        kullanicilar.filter((u) => eslesir(u, where)).map((u) => ({ id: u.id, email: u.email })),
      findFirst: async ({ where }: any) => kullanicilar.find((u) => eslesir(u, where)) ?? null,
      updateMany: async () => ({ count: 0 }),
    },
    // A2 Blok 2 — `bekleyenFirmaId` UNIQUE GERCEKTEN uygulanir (P2002).
    paketDegisimOnerisi: {
      findUnique: async ({ where }: any) => oneriDolu(oneriler.find((o) => eslesir(o, where))),
      findFirst: async ({ where }: any) =>
        oneriDolu(
          oneriler
            .filter((o) => eslesir(o, where))
            .sort((a, b) => b.olusturuldu.getTime() - a.olusturuldu.getTime() || (b.id > a.id ? 1 : -1))[0],
        ),
      create: async ({ data }: any) => {
        p.oneriYazimOncesi?.(oneriler);
        if (data.bekleyenFirmaId && oneriler.some((o) => o.bekleyenFirmaId === data.bekleyenFirmaId)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`bekleyenFirmaId`)', {
            code: 'P2002',
            clientVersion: 'sahte',
          });
        }
        const satir = {
          id: randomUUID(),
          durum: 'BEKLIYOR',
          musteriNotu: null,
          kaynakIyzicoKodu: null,
          sonuclandi: null,
          sonuclandiranId: null,
          kapanisNedeni: null,
          olusturuldu: new Date(),
          ...data,
        };
        oneriler.push(satir);
        sira.push('oneri:create');
        return { ...satir };
      },
      updateMany: async ({ where, data }: any) => {
        const hedef = oneriler.filter((o) => eslesir(o, where));
        hedef.forEach((o) => Object.assign(o, data));
        return { count: hedef.length };
      },
    },
    // ⚠ GERCEKTEN GERI ALIR: A1'in sahtesi islemi geri almiyordu — "denetim
    // dustu → yerel degisim geri alinir" ancak boyle OLCULUR.
    $transaction: async (fn: any) => {
      const kopya = p.abonelikler.map((a) => ({ ...a }));
      const oneriKopya = oneriler.map((o) => ({ ...o }));
      const olayBoyu = olaylar.length;
      const denetimBoyu = denetimler.length;
      try {
        return await fn(db);
      } catch (e) {
        p.abonelikler.splice(0, p.abonelikler.length, ...kopya);
        oneriler.splice(0, oneriler.length, ...oneriKopya);
        olaylar.length = olayBoyu;
        denetimler.length = denetimBoyu;
        throw e;
      }
    },
  };
  return db;
}

function sahteIyzico(
  sira: string[],
  o: {
    degisimYaniti?: any;
    degisimHatasi?: Error;
    detaylar?: Record<string, any>;
    aramaSonucu?: any[];
    /** iyzico cagrisi SURERKEN baska bir yolun (ornegin iptal) yaptigi yazim. */
    cagriSirasinda?: () => void;
  } = {},
) {
  const cagrilar: Array<{ metot: string; args: any[] }> = [];
  return {
    cagrilar,
    degisimSayisi: () => cagrilar.filter((c) => c.metot === 'paketDegistir').length,
    istemci: {
      abonelikAra: async (f: any) => {
        cagrilar.push({ metot: 'abonelikAra', args: [f] });
        return o.aramaSonucu ?? [];
      },
      paketDegistir: async (...args: any[]) => {
        cagrilar.push({ metot: 'paketDegistir', args });
        sira.push('iyzico:paketDegistir');
        await new Promise((r) => setImmediate(r)); // gercek ag gibi bir tur bekle (yaris)
        o.cagriSirasinda?.();
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
    } as any,
  };
}

/**
 * `giden` = GERCEKTEN gonderilenler; `denenen` = her deneme. `dusenAlicilar`
 * bu adreslere gonderim FIRLATIR (SMTP reddi gibi). `gonderKritik` yonetici
 * yolunun kullandigi (SMTP yoksa firlatir); `gonder` A1 musteri yolunun.
 */
function sahteEposta(o: { dusenAlicilar?: string[] } = {}) {
  const giden: any[] = [];
  const denenen: any[] = [];
  const gonder = async (m: any) => {
    denenen.push(m);
    if (o.dusenAlicilar?.includes(m.kime)) throw new Error(`sahte SMTP: ${m.kime} reddedildi`);
    giden.push(m);
  };
  return { giden, denenen, servis: { gonder, gonderKritik: gonder } as any };
}

const KONFIG = { get: () => undefined } as any;
const TUM_SURUMLER = () => KODLAR.map((k) => surum(k));
const YONETICI = { id: 'y1', email: 'yonetici@metapricex.test' };

function kur(db: any, iyz: ReturnType<typeof sahteIyzico>, ep = sahteEposta()) {
  const ab = new AbonelikServisi(db, iyz.istemci);
  const pd = new PaketDegisimiServisi(db, iyz.istemci, ab, ep.servis, KONFIG);
  const yd = new YoneticiDusurmeServisi(db, pd, ep.servis, KONFIG);
  const panel = new YoneticiAbonelikServisi(db);
  const on = new PaketOnerisiServisi(db, pd, ep.servis, KONFIG);
  return { ab, pd, yd, panel, on, ep };
}

/** Basari beklenen senaryo; atilan hata TUM bloklari cokertmez, assert'e doner. */
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

const DUSUR = (paket: string, o: Record<string, unknown> = {}) => ({
  firmaId: 'f1',
  paketSurumuId: `s-${paket}`,
  yonetici: YONETICI,
  gerekce: 'Müşteri telefonla küçültme istedi',
  musteriNotu: 'Talebiniz üzerine paketinizi küçülttük.',
  ...o,
});

// ═══════════════════════════════════════════════════════════════════════════
//  D · DUSURME SERVISI — A1 cekirdegi, denetim sirasi, kurtarma
// ═══════════════════════════════════════════════════════════════════════════
async function dBlogu(): Promise<void> {
  console.log('\n── D · yonetici dusurmesi (tek yol: A1 cekirdegi) ──');

  // ── D1 · mutlu yol: Pro MEP → Pro Mek (saf dusurme, AKTIF) ────────────
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira);
    const { yd, ep } = kur(db, iyz);
    const sonuc = await basarir('D1', () => yd.dusur(DUSUR('pro-mek')));
    const cagri = iyz.cagrilar.find((c) => c.metot === 'paketDegistir');
    check(
      'D1 ⭐ BAGLANTI: A1 cekirdegi → iyzico TEK cagri, NEXT_PERIOD, denemesiz ikiz plan, deneme yok',
      iyz.degisimSayisi() === 1 &&
        cagri?.args[0] === 'uc-0' &&
        cagri?.args[1]?.nezaman === 'NEXT_PERIOD' &&
        cagri?.args[1]?.yeniPlanKodu === 'plan-pro-mek-denemesiz' &&
        cagri?.args[1]?.denemeUygula === false,
      JSON.stringify(cagri?.args),
    );
    const s = db.satir();
    check(
      'D1b donem sonu: etkin paket AYNI (pro-mep), planli = pro-mek, kilit + yeni uc yazildi',
      s.paketSurumuId === 's-pro-mep' && s.planliPaketSurumuId === 's-pro-mek' && !!s.paketGecisTarihi && s.iyzicoAbonelikKodu === 'uc-1',
      JSON.stringify({ p: s.paketSurumuId, pl: s.planliPaketSurumuId, uc: s.iyzicoAbonelikKodu }),
    );
    const olay = db.olaylar.find((o: Satir) => o.tip === 'paket.degisim.planlandi');
    check(
      'D1c ⭐ olay: aktor = YONETICI, kaynak/gerekce/yonetici izi VAR, sozlesme onayi izi YOK (musteri onaylamadi)',
      olay?.aktor === 'y1' &&
        olay?.veri?.kaynak === 'yonetici' &&
        olay?.veri?.gerekce === 'Müşteri telefonla küçültme istedi' &&
        olay?.veri?.yonetici?.eposta === YONETICI.email &&
        !('sozlesmeOnayiZamani' in (olay?.veri ?? {})) &&
        !('sozlesmeSurumu' in (olay?.veri ?? {})),
      JSON.stringify(olay?.veri),
    );
    const tipler = db.denetimler.map((d: Satir) => d.tip);
    const sonuncu = db.denetimler[1];
    check(
      'D1d ⭐ YoneticiOlayi: niyet + sonuc (iki satir), yonetici kimligi, hedef = firma SAHIBI, firma/paket adlari',
      JSON.stringify(tipler) === JSON.stringify(['paket.dusurme.istendi', 'paket.dusuruldu']) &&
        db.denetimler.every((d: Satir) => d.yoneticiId === 'y1' && d.yoneticiEpsta === YONETICI.email) &&
        sonuncu?.hedefEposta === 'sahip@firma.test' &&
        /Firma A/.test(sonuncu?.oncekiDeger ?? '') &&
        /pro-mep/.test(sonuncu?.oncekiDeger ?? '') &&
        sonuncu?.yeniDeger === 'Paket pro-mek' &&
        sonuncu?.veri?.firmaId === 'f1',
      JSON.stringify({ tipler, sonuncu }),
    );
    check(
      'D1e ⭐ SIRA: niyet denetimi → iyzico → sonuc denetimi',
      JSON.stringify(db.sira) === JSON.stringify(['denetim:paket.dusurme.istendi', 'iyzico:paketDegistir', 'denetim:paket.dusuruldu']),
      JSON.stringify(db.sira),
    );
    const m = ep.giden[0];
    const metin = (m?.paragraflar ?? []).join(' ');
    check(
      'D1f e-posta: etkin SAHIBE + fatura adresine (bilgi kopyasi; fiyat degisiyor), "dönem sonunda değişecek"',
      ep.giden.length === 2 &&
        m?.kime === 'sahip@firma.test' &&
        ep.giden[1]?.kime === 'fatura@firma.test' &&
        /dönem sonunda değişecek/.test(m?.konu ?? ''),
      JSON.stringify(ep.giden.map((g: Satir) => g.kime)),
    );
    check(
      'D1g ⭐ e-posta metni: "MetaPriceX ekibi", kayiplar, 1 uye durur, musteri notu; ONAY cumlesi ve IC GEREKCE YOK',
      /MetaPriceX ekibi/.test(metin) &&
        /Yeni pakette azalan ya da kalkan haklar/.test(metin) &&
        /1 ekip üyesinin erişimi durur/.test(metin) &&
        /Talebiniz üzerine/.test(metin) &&
        !/onayladığınız/i.test(metin) &&
        !/telefonla küçültme/.test(metin),
      metin.slice(0, 300),
    );
    check(
      'D1h yanit: donem-sonu, epostaGonderildi=true, oncekiDegisim=false',
      sonuc?.zamanlama === 'donem-sonu' && sonuc?.epostaGonderildi === true && sonuc?.oncekiDegisim === false,
      JSON.stringify(sonuc),
    );
  }

  // ── D2 · niyet denetimi yazilamazsa iyzico'ya HIC gidilmez ───────────
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER(), dusenDenetim: 'paket.dusurme.istendi' });
    const iyz = sahteIyzico(db.sira);
    const once = JSON.stringify(db.satir());
    const gunlukOnce = GUNLUK.length;
    const r = await reddeder(() => kur(db, iyz).yd.dusur(DUSUR('pro-mek')));
    check(
      'D2 ⭐ niyet denetimi dustu → iyzico cagrisi 0, 500 DENETIM_YAZILAMADI, satir AYNI',
      iyz.degisimSayisi() === 0 && r?.durum === 500 && r?.govde?.kod === 'DENETIM_YAZILAMADI' && JSON.stringify(db.satir()) === once,
      JSON.stringify({ iyz: iyz.degisimSayisi(), r }),
    );
    check(
      'D2b alarm etiketi: gunlukte "DENETIM-YAZILAMADI paket.dusurme.istendi"',
      GUNLUK.slice(gunlukOnce).some((g) => g.includes('DENETIM-YAZILAMADI paket.dusurme.istendi')),
    );
  }

  // ── D3 · sonuc denetimi dusunce YEREL yazim geri alinir ───────────────
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER(), dusenDenetim: 'paket.dusuruldu' });
    const iyz = sahteIyzico(db.sira);
    const gunlukOnce = GUNLUK.length;
    const r = await reddeder(() => kur(db, iyz).yd.dusur(DUSUR('pro-mek')));
    const s = db.satir();
    check(
      'D3 ⭐ sonuc denetimi dustu → islem GERI ALINDI (planli yok, olay yok), istek hata',
      r !== null && s.planliPaketSurumuId === null && s.paketGecisTarihi === null && db.olaylar.length === 0,
      JSON.stringify({ r, pl: s.planliPaketSurumuId, olay: db.olaylar.length }),
    );
    check(
      'D3b iz kaybolmadi: niyet satiri DURUYOR + ayri "yarim" sonuc satiri; yoneticiye "yeniden gönderin" (iyzico cagrildi)',
      JSON.stringify(db.denetimler.map((d: Satir) => d.tip)) ===
        JSON.stringify(['paket.dusurme.istendi', 'paket.dusurme.yarim']) &&
        iyz.degisimSayisi() === 1 &&
        /yeniden gönderin/.test(r?.govde?.message ?? ''),
      JSON.stringify({ tip: db.denetimler.map((d: Satir) => d.tip), m: r?.govde?.message }),
    );
    check(
      'D3c alarm etiketi + yarim degisim gunlugu',
      GUNLUK.slice(gunlukOnce).some((g) => g.includes('DENETIM-YAZILAMADI paket.dusuruldu')) &&
        GUNLUK.slice(gunlukOnce).some((g) => g.includes('PAKET DEGISIMI YARIM')),
    );
  }

  // ── D4-D7 · kural kuyrukta, TAZE satirla ─────────────────────────────
  const reddedilir = async (ad: string, ab: Satir, hedef: string, desen: RegExp, firma?: Satir) => {
    const db = sahteDb({ abonelikler: [ab], surumler: TUM_SURUMLER(), ...(firma ? { firma } : {}) });
    const iyz = sahteIyzico(db.sira);
    const r = await reddeder(() => kur(db, iyz).yd.dusur(DUSUR(hedef)));
    check(
      ad,
      r?.durum === 409 && desen.test(r?.govde?.message ?? '') && iyz.degisimSayisi() === 0 && db.denetimler.length === 0,
      JSON.stringify({ r, iyz: iyz.degisimSayisi(), denetim: db.denetimler.length }),
    );
  };
  await reddedilir('D4 ⭐ YUKSELTME dogrudan yapilamaz → 409, iyzico 0, denetim 0', abonelik('basic-mek'), 'pro-mek', /Yükseltme/);
  await reddedilir('D5 YATAY gecis dogrudan yapilamaz → 409', abonelik('pro-mek'), 'pro-elk', /Yatay/);
  await reddedilir(
    'D6 ⭐ DENEMEDEKI firmada dusurme dogrudan yapilamaz → 409',
    abonelik('pro-mep', { durum: AbonelikDurumu.DENEME, denemeSonu: gunSonra(10) }),
    'pro-mek',
    /deneme/,
  );
  await reddedilir(
    'D6b ⭐ etiketi AKTIF ama DENEMEDE (denemeSonu gelecekte) → 409, iyzico 0',
    abonelik('pro-mep', { durum: AbonelikDurumu.AKTIF, denemeSonu: gunSonra(10) }),
    'pro-mek',
    /deneme/,
  );
  await reddedilir(
    'D7 kapatilmis firma → 409',
    abonelik('pro-mep'),
    'pro-mek',
    /kapatılmış/,
    { ...FIRMA(), imhaTarihi: gunSonra(30) },
  );
  {
    const pahali = surum('pro-mek', { tutarDize: '2500.00' });
    const surumler = [...TUM_SURUMLER().filter((x) => x.id !== 's-pro-mek'), pahali];
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler });
    const iyz = sahteIyzico(db.sira);
    const r = await reddeder(() => kur(db, iyz).yd.dusur(DUSUR('pro-mek')));
    check('D7b ⭐ fiyati ARTAN "dusurme" → 409, iyzico 0', r?.durum === 409 && iyz.degisimSayisi() === 0, JSON.stringify(r));
  }

  // ── D8 · kurtarma: iyzico'da BASKA (onceki) degisim → gercek olan yazilir ──
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira, {
      degisimHatasi: new IyzicoHatasi('201402', 'Bu abonelik yükseltilemez'),
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'UPGRADED' } },
      aramaSonucu: [
        {
          referenceCode: 'uc-1',
          parentReferenceCode: 'uc-0',
          customerReferenceCode: 'm-1',
          pricingPlanReferenceCode: 'plan-basic-mek-denemesiz',
          subscriptionStatus: 'ACTIVE',
          startDate: gunSonra(20).getTime(),
        },
      ],
    });
    const { yd, ep } = kur(db, iyz);
    const sonuc = await basarir('D8', () => yd.dusur(DUSUR('pro-mek')));
    check(
      'D8 ⭐ kurtarma: GERCEKTE olan (basic-mek) yerele alindi, istenen DEGIL; oncekiDegisim=true',
      db.satir().planliPaketSurumuId === 's-basic-mek' && sonuc?.oncekiDegisim === true,
      JSON.stringify({ pl: db.satir().planliPaketSurumuId, sonuc }),
    );
    check(
      'D8b ⭐ denetim "uygulanmadi" der; "ekip dusurdu" e-postasi GONDERILMEDI; epostaGonderildi=false',
      db.denetimler.map((d: Satir) => d.tip).join(',') === 'paket.dusurme.istendi,paket.dusurme.uygulanmadi' &&
        ep.giden.length === 0 &&
        sonuc?.epostaGonderildi === false,
      JSON.stringify({ tip: db.denetimler.map((d: Satir) => d.tip), eposta: ep.giden.length }),
    );
    const olay = db.olaylar.find((o: Satir) => o.tip === 'paket.degisim.planlandi');
    check(
      'D8c kurtarilan degisimin olayi "yonetici dusurdu" DEMEZ: kaynak=kurtarma, bu gerekce YOK, tetikleyen yazili',
      olay?.veri?.kaynak === 'kurtarma' &&
        !('gerekce' in (olay?.veri ?? {})) &&
        olay?.veri?.tetikleyen?.tur === 'yonetici',
      JSON.stringify(olay?.veri),
    );
  }

  // ── D9 · bos gerekce: hicbir sey baslamaz ─────────────────────────────
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira);
    const r = await reddeder(() => kur(db, iyz).yd.dusur(DUSUR('pro-mek', { gerekce: '   ' })));
    check(
      'D9 bos gerekce → 400, iyzico 0, denetim 0',
      r?.durum === 400 && iyz.degisimSayisi() === 0 && db.denetimler.length === 0,
      JSON.stringify(r),
    );
    const r2 = await reddeder(() => kur(db, iyz).yd.dusur(DUSUR('pro-mek', { gerekce: 'a    ' })));
    check(
      'D9b gerekce KIRPILINCA 5 karakterden kisa ("a    " DTO\'yu gecer) → 400, iyzico 0',
      r2?.durum === 400 && iyz.degisimSayisi() === 0 && db.denetimler.length === 0,
      JSON.stringify(r2),
    );
  }

  // ── D10 · etkin sahip yoksa fatura adresine ────────────────────────────
  {
    const db = sahteDb({
      abonelikler: [abonelik('pro-mep')],
      surumler: TUM_SURUMLER(),
      kullanicilar: [KULLANICI('uye1'), KULLANICI('sahip', { firmaRol: 'sahip', status: 'banned' })],
    });
    const iyz = sahteIyzico(db.sira);
    const { yd, ep } = kur(db, iyz);
    await basarir('D10', () => yd.dusur(DUSUR('pro-mek')));
    check(
      'D10 etkin sahip yok (sahip YASAKLI) → bilgi fatura adresine',
      ep.giden.length === 1 && ep.giden[0].kime === 'fatura@firma.test',
      JSON.stringify(ep.giden.map((g: Satir) => g.kime)),
    );
  }

  // ── D11 · ayni firmaya yonetici dusurmesi + musteri yukseltmesi ayni anda ──
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mek')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira);
    const { yd, pd } = kur(db, iyz);
    const sonuclar = await Promise.allSettled([
      yd.dusur(DUSUR('basic-mek')),
      pd.degistir({ firmaId: 'f1', kullaniciId: 'u1', paketSurumuId: 's-pro-mep', sozlesmeOnayi: true }),
    ]);
    check(
      'D11 ⭐ AYNI KUYRUK: iki istekten biri gecti, digeri kilidi gordu; iyzico TEK cagri',
      iyz.degisimSayisi() === 1 &&
        sonuclar.filter((x) => x.status === 'fulfilled').length === 1 &&
        sonuclar.filter((x) => x.status === 'rejected').length === 1,
      JSON.stringify(sonuclar.map((x) => x.status)),
    );
  }

  // ── D12 · musteri yolu AYRI kalir: yonetici izi musteri olayina sizmaz ──
  {
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira);
    await basarir('D12', () =>
      kur(db, iyz).pd.degistir({ firmaId: 'f1', kullaniciId: 'u1', paketSurumuId: 's-pro-mek', sozlesmeOnayi: true }),
    );
    const olay = db.olaylar.find((o: Satir) => o.tip === 'paket.degisti');
    check(
      'D12 musteri olayi: onay izi VAR, "kaynak/yonetici/gerekce" YOK, yonetici denetimi YOK',
      !!olay?.veri?.sozlesmeOnayiZamani &&
        !('kaynak' in (olay?.veri ?? {})) &&
        !('yonetici' in (olay?.veri ?? {})) &&
        !('gerekce' in (olay?.veri ?? {})) &&
        db.denetimler.length === 0,
      JSON.stringify(olay?.veri),
    );
  }

  // ── D13 · e-posta sablonu (saf) ─────────────────────────────────────────
  {
    const e = yoneticiDusurmeEpostasi({
      kime: 'a@b.test',
      firmaAdi: 'F',
      mevcutPaketAdi: 'Pro',
      yeniPaketAdi: 'Basic',
      yeniTutar: '1299.00',
      gecisTarihi: gunSonra(20),
      kayiplar: [],
      yeniKullaniciHakki: 3,
      durdurulacakUye: 0,
      musteriNotu: null,
      uygulamaUrl: 'https://app.test',
    });
    const metin = e.paragraflar.join(' ');
    check(
      'D13 sablon: kayip/uye/not yoksa o paragraflar YOK; tutar TL bicimi; dugme /abonelik',
      !/azalan ya da kalkan/.test(metin) && !/erişimi durur/.test(metin) && !/notu:/.test(metin) &&
        /1\.299,00 TL/.test(metin) && e.dugme?.url === 'https://app.test/abonelik',
      metin,
    );
    check(
      'D13b hak adlari sozlugu: bilinen adlar Turkce, bilinmeyen AYNEN',
      hakListesi(['dwg', 'kullanici']) === 'DWG metraj, kullanıcı hakkı' && hakListesi(['xyz' as any]) === 'xyz',
    );
  }

  // ── D14 · iyzico cagrisi SURERKEN musteri iptal etti (iptal kuyruga girmez) ──
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira, {
      // `iptalEt`in yazdigi: canli uc iptal edildi, planli ve kilit silindi, IPTAL.
      cagriSirasinda: () =>
        Object.assign(db.satir(), {
          durum: AbonelikDurumu.IPTAL,
          iyzicoAbonelikKodu: 'uc-1',
          planliPaketSurumuId: null,
          paketGecisTarihi: null,
        }),
    });
    const { yd, ep } = kur(db, iyz);
    const r = await reddeder(() => yd.dusur(DUSUR('pro-mek')));
    const s = db.satir();
    check(
      'D14 ⭐ es zamanli IPTAL: kosullu yazim HICBIR SEY yazmadi (IPTAL aynen, planli/kilit YOK), 409',
      r?.durum === 409 &&
        s.durum === AbonelikDurumu.IPTAL &&
        s.planliPaketSurumuId === null &&
        s.paketGecisTarihi === null &&
        s.iyzicoAbonelikKodu === 'uc-1',
      JSON.stringify({ r, d: s.durum, pl: s.planliPaketSurumuId, k: s.paketGecisTarihi, uc: s.iyzicoAbonelikKodu }),
    );
    check(
      'D14b yonetici mesaji + denetim "yarim"; "dusuruldu" YOK, e-posta YOK, planlandi olayi YOK',
      /müşteri iptal etti/.test(r?.govde?.message ?? '') &&
        db.denetimler.map((d: Satir) => d.tip).join(',') === 'paket.dusurme.istendi,paket.dusurme.yarim' &&
        ep.giden.length === 0 &&
        db.olaylar.filter((o: Satir) => o.tip === 'paket.degisim.planlandi').length === 0,
      JSON.stringify({ tip: db.denetimler.map((d: Satir) => d.tip), m: r?.govde?.message }),
    );
  }
  {
    // Ayni koruma MUSTERI yolunda (A1): kendi yukseltmesi surerken iptal.
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira, {
      cagriSirasinda: () => Object.assign(db.satir(), { durum: AbonelikDurumu.IPTAL, iyzicoAbonelikKodu: 'uc-1' }),
    });
    const r = await reddeder(() =>
      kur(db, iyz).pd.degistir({ firmaId: 'f1', kullaniciId: 'u1', paketSurumuId: 's-pro-mek', sozlesmeOnayi: true }),
    );
    check(
      'D14c ⭐ musteri yolu da korunur: yukseltme IPTAL satirina YAZILMADI, 409 ABONELIK_DEGISTI',
      r?.durum === 409 &&
        r?.govde?.kod === 'ABONELIK_DEGISTI' &&
        db.satir().paketSurumuId === 's-basic-mek' &&
        db.olaylar.filter((o: Satir) => o.tip === 'paket.degisti').length === 0,
      JSON.stringify({ r, p: db.satir().paketSurumuId }),
    );
  }

  // ── D14d-f · kosullu yazimin UC sartinin HER BIRI tek basina korur ─────
  // (D14 uc alani birden degistirir; bir sart silinse bile yesil kalirdi.)
  for (const [ad, degisiklik] of [
    ['D14d yalniz iyzico UCU degisti (zincir onarimi)', { iyzicoAbonelikKodu: 'uc-9' }],
    ['D14e yalniz KILIT kondu (paketGecisTarihi)', { paketGecisTarihi: gunSonra(5) }],
    ['D14f yalniz DURUM degisti (IPTAL, uc ayni)', { durum: AbonelikDurumu.IPTAL }],
  ] as const) {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira, { cagriSirasinda: () => Object.assign(db.satir(), degisiklik) });
    const r = await reddeder(() => kur(db, iyz).yd.dusur(DUSUR('pro-mek')));
    check(
      `${ad} → 409, planli dusurme YAZILMADI`,
      r?.durum === 409 && db.satir().planliPaketSurumuId === null,
      JSON.stringify({ r: r?.durum, pl: db.satir().planliPaketSurumuId }),
    );
  }

  // ── D15 · sonuc BELIRSIZ: yoneticiye "ayni dusurmeyi yeniden gonderin" ──
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER() });
    // Ag hatasi + iyzico'ya sorulamadi (detay yok) → belirsiz.
    const iyz = sahteIyzico(db.sira, { degisimHatasi: new Error('socket hang up') });
    const r = await reddeder(() => kur(db, iyz).yd.dusur(DUSUR('pro-mek')));
    check(
      'D15 ⭐ belirsiz sonuc → 503, YONETICI mesaji ("AYNI düşürmeyi yeniden gönderin"), denetim "belirsiz"',
      r?.durum === 503 &&
        /AYNI düşürmeyi yeniden gönderin/.test(r?.govde?.message ?? '') &&
        !/paketinizi/.test(r?.govde?.message ?? '') &&
        db.denetimler.map((d: Satir) => d.tip).join(',') === 'paket.dusurme.istendi,paket.dusurme.belirsiz',
      JSON.stringify({ r, tip: db.denetimler.map((d: Satir) => d.tip) }),
    );
  }

  // ── D16 · kesin red: "paket degismedi" + denetim "basarisiz" ───────────
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira, { degisimHatasi: new IyzicoHatasi('100001', 'sistem hatasi') });
    const r = await reddeder(() => kur(db, iyz).yd.dusur(DUSUR('pro-mek')));
    check(
      'D16 kesin red (acik iyzico kodu) → 502 "iyzico düşürmeyi kabul etmedi", denetim "basarisiz" + hata kodu',
      r?.durum === 502 &&
        /iyzico düşürmeyi kabul etmedi/.test(r?.govde?.message ?? '') &&
        db.denetimler.map((d: Satir) => d.tip).join(',') === 'paket.dusurme.istendi,paket.dusurme.basarisiz' &&
        db.denetimler[1]?.veri?.hata?.kod === 'SAGLAYICI_DEGISIM_HATASI',
      JSON.stringify({ r, d: db.denetimler[1]?.veri }),
    );
  }

  // ── D17 · e-posta basarisi GERCEK: bir alici duserse digerleri yine gider ──
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira);
    const ep = sahteEposta({ dusenAlicilar: ['sahip@firma.test'] });
    const sonuc = await basarir('D17', () => kur(db, iyz, ep).yd.dusur(DUSUR('pro-mek')));
    check(
      'D17 sahibe gonderim DUSTU, fatura adresine GITTI → epostaGonderildi=true; iki deneme',
      ep.denenen.length === 2 &&
        ep.giden.length === 1 &&
        ep.giden[0].kime === 'fatura@firma.test' &&
        sonuc?.epostaGonderildi === true,
      JSON.stringify({ denenen: ep.denenen.length, giden: ep.giden.map((g: Satir) => g.kime), e: sonuc?.epostaGonderildi }),
    );
  }
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira);
    const ep = sahteEposta({ dusenAlicilar: ['sahip@firma.test', 'fatura@firma.test'] });
    const sonuc = await basarir('D17b', () => kur(db, iyz, ep).yd.dusur(DUSUR('pro-mek')));
    check(
      'D17b ⭐ HICBIR ileti gitmediyse epostaGonderildi=false (ekran "GÖNDERİLEMEDİ" der); degisim yine KAYITLI',
      sonuc?.epostaGonderildi === false && db.satir().planliPaketSurumuId === 's-pro-mek',
      JSON.stringify(sonuc),
    );
  }

  // ── D18 · ayni adres iki kez gitmez (fatura = sahip, harf farkiyla) ─────
  {
    const db = sahteDb({
      abonelikler: [abonelik('pro-mep')],
      surumler: TUM_SURUMLER(),
      firma: { ...FIRMA(), faturaEposta: 'SAHIP@firma.test' },
    });
    const iyz = sahteIyzico(db.sira);
    const { yd, ep } = kur(db, iyz);
    await basarir('D18', () => yd.dusur(DUSUR('pro-mek')));
    check(
      'D18 fatura adresi sahiple AYNI (buyuk-kucuk harf farki) → TEK ileti',
      ep.giden.length === 1 && ep.giden[0].kime === 'sahip@firma.test',
      JSON.stringify(ep.giden.map((g: Satir) => g.kime)),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  P · PANEL (okuma yuzu)
// ═══════════════════════════════════════════════════════════════════════════
async function pBlogu(): Promise<void> {
  console.log('\n── P · panel okuma yuzu ──');
  {
    const db = sahteDb({ abonelikler: [abonelik('pro-mep')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira);
    const panel = await basarir('P1', () => kur(db, iyz).panel.panel('f1', SIMDI));
    const secenek = (kod: string) => panel?.secenekler.find((s) => s.paket.kod === kod);
    check(
      'P1 ⭐ panel: kart aboneligi ozeti + her paket icin islem (pro-mek dogrudan, pro-mep yok)',
      panel?.abonelik?.paket.kod === 'pro-mep' &&
        panel?.abonelik?.odemeYontemi === 'KART' &&
        panel?.abonelik?.iyzicoBagli === true &&
        secenek('pro-mek')?.islem === 'dogrudan-dusur' &&
        secenek('pro-mep')?.islem === 'yok' &&
        panel?.secenekler.length === 5,
      JSON.stringify(panel?.secenekler.map((s) => [s.paket.kod, s.islem])),
    );
    check(
      'P1b ⭐ iyzico KODU yanita SIZMAZ (yalniz iyzicoBagli bayragi)',
      !JSON.stringify(panel).includes('uc-0') && !JSON.stringify(panel).includes('m-1'),
    );
    check(
      'P1c koltuk etkisi: 3 etkin kisi, basic (hak 1) → 2 durur; silinmis uye SAYILMAZ; sahipler yalniz etkin sahip',
      panel?.aktifUye === 3 &&
        secenek('basic-mek')?.durdurulacakUye === 2 &&
        JSON.stringify(panel?.sahipler) === JSON.stringify(['sahip@firma.test']),
      JSON.stringify({ aktif: panel?.aktifUye, sahipler: panel?.sahipler }),
    );
  }
  {
    const db = sahteDb({ abonelikler: [], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira);
    const panel = await basarir('P2', () => kur(db, iyz).panel.panel('f1', SIMDI));
    check(
      'P2 aboneligi yok → abonelik null, TUM secenekler sureli-paket, koltuk etkisi yine hesaplanir',
      panel?.abonelik === null &&
        panel?.secenekler.every((s) => s.islem === 'sureli-paket') &&
        panel?.secenekler.find((s) => s.paket.kod === 'basic-mek')?.durdurulacakUye === 2,
      JSON.stringify(panel?.secenekler.map((s) => [s.paket.kod, s.islem, s.durdurulacakUye])),
    );
  }
  {
    const db = sahteDb({ abonelikler: [], surumler: TUM_SURUMLER(), firma: null });
    const iyz = sahteIyzico(db.sira);
    const r = await reddeder(() => kur(db, iyz).panel.panel('f1', SIMDI));
    check('P3 bilinmeyen firma → 404', r?.durum === 404, JSON.stringify(r));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  O · ONERI (Blok 2) — musteri onayli degisim: olustur, geri cek, ret, kabul
// ═══════════════════════════════════════════════════════════════════════════
const NOT = 'DWG metrajını denemeniz için Pro paketini öneriyoruz.';
const ONER = (paket: string, o: Record<string, unknown> = {}) => ({
  firmaId: 'f1',
  paketSurumuId: `s-${paket}`,
  yonetici: YONETICI,
  gerekce: '  Müşteri DWG metrajı istedi, Pro önerildi  ',
  musteriNotu: NOT,
  ...o,
});
/** Kabul istegi — A1 ucunun govdesi (controller'in `degistir`e verdigi). */
const KABUL = (paket: string, firmaId = 'f1') => ({
  firmaId,
  kullaniciId: 'sahip',
  paketSurumuId: `s-${paket}`,
  sozlesmeOnayi: true,
});
const gecmis = () => new Date(Date.now() - 1_000);
const hataDurumu = (r: PromiseSettledResult<unknown>) =>
  r.status === 'rejected' && typeof (r.reason as any)?.getStatus === 'function' ? (r.reason as any).getStatus() : null;

/** Standart kurulum: basic-mek KART AKTIF firma + (istenirse) pro-mek onerisi. */
async function oneriKur(o: { paket?: string; oneriHedefi?: string | null; db?: Parameters<typeof sahteDb>[0] } = {}) {
  const db = sahteDb(o.db ?? { abonelikler: [abonelik(o.paket ?? 'basic-mek')], surumler: TUM_SURUMLER() });
  const iyz = sahteIyzico(db.sira);
  const k = kur(db, iyz);
  const hedef = o.oneriHedefi === undefined ? 'pro-mek' : o.oneriHedefi;
  const r = hedef ? await basarir(`hazirlik: ${hedef} onerisi`, () => k.on.olustur(ONER(hedef))) : null;
  return { db, iyz, ...k, oneriId: r?.oneriId ?? '' };
}

function oSafKurallar(): void {
  const ab = {
    paketSurumuId: 's-basic-mek',
    iyzicoAbonelikKodu: 'uc-0',
    paketGecisTarihi: null,
    durum: AbonelikDurumu.AKTIF,
    odemeYontemi: OdemeYontemi.KART,
  };
  const o = (x: Record<string, unknown> = {}): any => ({
    durum: PaketOnerisiDurumu.BEKLIYOR,
    sonGecerlilik: gunSonra(3),
    kaynakPaketSurumuId: 's-basic-mek',
    kaynakIyzicoKodu: 'uc-0',
    ...x,
  });
  /** Gecmis: kapatan gecis YOK, hedef satista (varsayilan). */
  const G = { kapatanGecisVar: false, hedefSatista: true };
  const tablo: Array<[string, string, string]> = [
    ['anlik goruntu ayni → bekliyor', oneriDurumu(o(), ab, SIMDI, G), 'bekliyor'],
    ['SINIR: sonGecerlilik == simdi → suresi-doldu', oneriDurumu(o({ sonGecerlilik: SIMDI }), ab, SIMDI, G), 'suresi-doldu'],
    ['abonelik yok', oneriDurumu(o(), null, SIMDI, G), 'abonelik-degisti'],
    ['etkin paket farkli', oneriDurumu(o(), { ...ab, paketSurumuId: 's-pro-mek' }, SIMDI, G), 'abonelik-degisti'],
    ['iyzico ucu farkli', oneriDurumu(o(), { ...ab, iyzicoAbonelikKodu: 'uc-1' }, SIMDI, G), 'abonelik-degisti'],
    ['degisim kilidi (yeni kod donmese bile)', oneriDurumu(o(), { ...ab, paketGecisTarihi: gunSonra(20) }, SIMDI, G), 'abonelik-degisti'],
    ['IPTAL', oneriDurumu(o(), { ...ab, durum: AbonelikDurumu.IPTAL }, SIMDI, G), 'abonelik-degisti'],
    ['SONA_ERDI', oneriDurumu(o(), { ...ab, durum: AbonelikDurumu.SONA_ERDI }, SIMDI, G), 'abonelik-degisti'],
    ['ASKIDA kapatir (erisim kapandi)', oneriDurumu(o(), { ...ab, durum: AbonelikDurumu.ASKIDA }, SIMDI, G), 'abonelik-degisti'],
    ['⭐ HAVALE (kod, paket, durum AYNI — inceleme O1)', oneriDurumu(o(), { ...ab, odemeYontemi: OdemeYontemi.HAVALE }, SIMDI, G), 'abonelik-degisti'],
    ['⭐ gecmiste KAPATAN gecis (simdi AKTIF, goruntu ayni — inceleme O2)', oneriDurumu(o(), ab, SIMDI, { ...G, kapatanGecisVar: true }), 'abonelik-degisti'],
    ['hedef satistan kalkti', oneriDurumu(o(), ab, SIMDI, { ...G, hedefSatista: false }), 'satistan-kalkti'],
    ['ODEME_BEKLIYOR oneriyi KAPATMAZ', oneriDurumu(o(), { ...ab, durum: AbonelikDurumu.ODEME_BEKLIYOR }, SIMDI, G), 'bekliyor'],
    ['KISITLI oneriyi KAPATMAZ', oneriDurumu(o(), { ...ab, durum: AbonelikDurumu.KISITLI }, SIMDI, G), 'bekliyor'],
    ['DENEME → bekliyor', oneriDurumu(o(), { ...ab, durum: AbonelikDurumu.DENEME }, SIMDI, G), 'bekliyor'],
    ['KABUL_EDILDI', oneriDurumu(o({ durum: PaketOnerisiDurumu.KABUL_EDILDI }), ab, SIMDI, G), 'kabul-edildi'],
    ['REDDEDILDI', oneriDurumu(o({ durum: PaketOnerisiDurumu.REDDEDILDI }), ab, SIMDI, G), 'reddedildi'],
    ['GERI_CEKILDI', oneriDurumu(o({ durum: PaketOnerisiDurumu.GERI_CEKILDI }), ab, SIMDI, G), 'geri-cekildi'],
    ['KAPANDI (suresi gelecekte olsa da)', oneriDurumu(o({ durum: PaketOnerisiDurumu.KAPANDI }), ab, SIMDI, G), 'kapandi'],
  ];
  for (const [ad, gercek, beklenen] of tablo) {
    check(`O0 oneriDurumu: ${ad}`, gercek === beklenen, `${gercek} ≠ ${beklenen}`);
  }
  // D7 (inceleme): son gecerlilik 7. gunun SONU, Turkiye saatiyle.
  check(
    'O0t ⭐ son gecerlilik 7. gunun SONU (TR): 24.09 15:00 TR → 01.10 23:59:59.999 TR',
    oneriSonGecerlilik(new Date('2026-09-24T12:00:00.000Z')).toISOString() === '2026-10-01T20:59:59.999Z',
    oneriSonGecerlilik(new Date('2026-09-24T12:00:00.000Z')).toISOString(),
  );
  check(
    'O0t gece yarisindan sonra (TR) olusan oneri: 25.09 01:30 TR → 02.10 gun sonu',
    oneriSonGecerlilik(new Date('2026-09-24T22:30:00.000Z')).toISOString() === '2026-10-02T20:59:59.999Z',
    oneriSonGecerlilik(new Date('2026-09-24T22:30:00.000Z')).toISOString(),
  );
  const hazir = { ...o(), firmaId: 'f1', hedefPaketSurumuId: 's-pro-mek' };
  const karar = (x: Record<string, any> = {}): any =>
    oneriKabulKarari({
      oneri: 'oneri' in x ? x.oneri : hazir,
      firmaId: x.firmaId ?? 'f1',
      paketSurumuId: x.paket ?? 's-pro-mek',
      ab,
      simdi: SIMDI,
      gecmis: x.gecmis ?? G,
    });
  check(
    'O0k gecmiste kapatan gecis → kabul ONERI_GECERSIZ',
    karar({ gecmis: { ...G, kapatanGecisVar: true } }).kod === 'ONERI_GECERSIZ',
  );
  check('O0k gecerli oneri + ayni firma + ayni paket → tamam', karar().tamam === true, JSON.stringify(karar()));
  check(
    'O0k ⭐ BASKA firmanin onerisi "bulunamadi" ile AYNI cevabi alir (varlik sizmaz)',
    karar({ firmaId: 'f2' }).tamam === false &&
      JSON.stringify(karar({ firmaId: 'f2' })) === JSON.stringify(karar({ oneri: null })),
    JSON.stringify([karar({ firmaId: 'f2' }), karar({ oneri: null })]),
  );
  check('O0k hedef farkli → ONERI_HEDEF_FARKLI', karar({ paket: 's-pro-mep' }).kod === 'ONERI_HEDEF_FARKLI');
  check(
    'O0k suresi dolmus → ONERI_GECERSIZ, metin "süresi doldu"',
    karar({ oneri: { ...hazir, sonGecerlilik: SIMDI } }).kod === 'ONERI_GECERSIZ' &&
      /süresi doldu/.test(karar({ oneri: { ...hazir, sonGecerlilik: SIMDI } }).mesaj),
  );
}

async function oOlusturma(): Promise<void> {
  {
    const { db, iyz, ep, oneriId } = await oneriKur();
    const s = db.oneriler[0];
    check(
      'O1 ⭐ oneri KAYITLI: BEKLIYOR, kilit firmada, anlik goruntu (etkin paket + iyzico ucu), hedef',
      db.oneriler.length === 1 &&
        s?.durum === 'BEKLIYOR' &&
        s?.bekleyenFirmaId === 'f1' &&
        s?.kaynakPaketSurumuId === 's-basic-mek' &&
        s?.kaynakIyzicoKodu === 'uc-0' &&
        s?.hedefPaketSurumuId === 's-pro-mek' &&
        s?.id === oneriId,
      JSON.stringify(s),
    );
    const sure = s ? s.sonGecerlilik.getTime() - s.olusturuldu.getTime() : 0;
    check(
      'O1b gecerlilik 7. gunun sonuna (TR 23:59:59.999) kadar: 7-8 gun arasi',
      sure > 7 * GUN - 5_000 && sure < 8 * GUN && s?.sonGecerlilik.toISOString().endsWith('T20:59:59.999Z'),
      `${sure} ${s?.sonGecerlilik.toISOString()}`,
    );
    check(
      'O1c ⭐ oneri PAKETI DEGISTIRMEZ: iyzico 0, abonelik ayni, kilit yok',
      iyz.cagrilar.length === 0 && db.satir().paketSurumuId === 's-basic-mek' && db.satir().paketGecisTarihi === null,
      JSON.stringify(iyz.cagrilar),
    );
    check('O1d gerekce KIRPILMIS kaydedildi', s?.gerekce === 'Müşteri DWG metrajı istedi, Pro önerildi', s?.gerekce);
    const d = db.denetimler;
    check(
      'O1e ⭐ denetim AYNI islemde: paket.oneri.gonderildi, oneriId + gerekce, yapan yonetici, hedef = sahip',
      d.length === 1 &&
        d[0].tip === 'paket.oneri.gonderildi' &&
        d[0].veri?.oneriId === s?.id &&
        d[0].veri?.gerekce === s?.gerekce &&
        d[0].yoneticiId === 'y1' &&
        d[0].hedefKullaniciId === 'sahip',
      JSON.stringify(d),
    );
    const alicilar = ep.giden.map((m: any) => m.kime);
    check(
      'O1f ⭐ e-posta YALNIZ etkin sahiplere (uyeler ve fatura adresi DEGIL — kabul sahibin isi)',
      JSON.stringify(alicilar) === JSON.stringify(['sahip@firma.test']),
      JSON.stringify(alicilar),
    );
    const m = ep.giden[0];
    const metin = JSON.stringify(m ?? {});
    check(
      'O1g ⭐ e-posta: baglanti oneri kimligiyle, not VAR, ic gerekce YOK, sozlesme cumlesi YOK, "onaylamadan değişmez"',
      (m?.dugme?.url ?? '').endsWith(`/abonelik?oneri=${s?.id}`) &&
        metin.includes(NOT) &&
        !metin.includes('Müşteri DWG metrajı istedi') &&
        !/Mesafeli Satış|Ön Bilgilendirme/.test(metin) &&
        metin.includes('onaylamadan değişmez'),
      metin.slice(0, 400),
    );
    check(
      'O1h yukseltme metni: ozellikler HEMEN, ucret onaydan sonraki ilk odeme gununden (tarih "bugunku bilgiyle" — D8)',
      metin.includes('hemen açılır') && metin.includes('ilk ödeme gününüzden') && metin.includes('bugünkü bilgiyle'),
      metin.slice(0, 400),
    );
  }
  {
    const { db, ep, on } = await oneriKur();
    const r = await reddeder(() => on.olustur(ONER('pro-mep')));
    check(
      'O2 ⭐ firma basina TEK bekleyen oneri: ikincisi 409 ONERI_ZATEN_VAR; ikinci satir, denetim, e-posta YOK',
      r?.durum === 409 &&
        r?.govde?.kod === 'ONERI_ZATEN_VAR' &&
        db.oneriler.length === 1 &&
        db.denetimler.length === 1 &&
        ep.giden.length === 1,
      JSON.stringify(r),
    );
  }
  const olusturmaReddi = async (
    ad: string,
    ab: Satir | null,
    paket: string,
    kod: string,
    ek: { desen?: RegExp; firma?: Satir; kullanicilar?: Satir[] } = {},
  ) => {
    const { db, ep, on } = await oneriKur({
      oneriHedefi: null,
      db: { abonelikler: ab ? [ab] : [], surumler: TUM_SURUMLER(), firma: ek.firma, kullanicilar: ek.kullanicilar },
    });
    const r = await reddeder(() => on.olustur(ONER(paket)));
    check(
      ad,
      r?.durum === 409 &&
        r?.govde?.kod === kod &&
        (!ek.desen || ek.desen.test(r?.govde?.message ?? '')) &&
        db.oneriler.length === 0 &&
        db.denetimler.length === 0 &&
        ep.giden.length === 0,
      JSON.stringify(r),
    );
  };
  await olusturmaReddi('O3 ⭐ dogrudan dusurme adayi → 409 ONERI_DEGIL, "Düşür"u gosterir', abonelik('pro-mep'), 'pro-mek', 'ONERI_DEGIL', {
    desen: /Düşür/,
  });
  await olusturmaReddi(
    'O3b kartsiz (havale) firma → 409 (sureli paket yolu)',
    abonelik('basic-mek', { odemeYontemi: 'HAVALE', iyzicoAbonelikKodu: null }),
    'pro-mek',
    'ONERI_DEGIL',
    { desen: /süreli paket/ },
  );
  await olusturmaReddi('O3c aboneligi yok → 409', null, 'pro-mek', 'ONERI_DEGIL');
  await olusturmaReddi('O3d ayni paket → 409', abonelik('basic-mek'), 'basic-mek', 'ONERI_DEGIL');
  await olusturmaReddi('O3e kapatilmis firma → 409', abonelik('basic-mek'), 'pro-mek', 'ONERI_DEGIL', {
    desen: /kapatılmış/,
    firma: { ...FIRMA(), imhaTarihi: gunSonra(30) },
  });
  await olusturmaReddi('O3f ⭐ etkin SAHIBI olmayan firma → 409 SAHIP_YOK (kimse kabul edemezdi)', abonelik('basic-mek'), 'pro-mek', 'SAHIP_YOK', {
    kullanicilar: [KULLANICI('sahip', { firmaRol: 'sahip', deletedAt: new Date(2026, 5, 1) }), KULLANICI('uye1')],
  });
  {
    const { db, ep, on } = await oneriKur({
      oneriHedefi: null,
      db: { abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER(), dusenDenetim: 'paket.oneri.gonderildi' },
    });
    GUNLUK.length = 0;
    const r = await reddeder(() => on.olustur(ONER('pro-mek')));
    check(
      'O4 ⭐ denetim yazilamazsa oneri de YOK (ayni islem): 500 DENETIM_YAZILAMADI, satir 0, e-posta 0, gunlukte etiket',
      r?.durum === 500 &&
        r?.govde?.kod === 'DENETIM_YAZILAMADI' &&
        db.oneriler.length === 0 &&
        ep.giden.length === 0 &&
        GUNLUK.some((g) => g.includes('DENETIM-YAZILAMADI paket.oneri.gonderildi')),
      JSON.stringify({ r, satir: db.oneriler.length }),
    );
  }
  {
    // D5 (inceleme): pro-mek'in IKI surumu satista; musteri yalniz EN YENIYI gorur.
    const yeniSurum = surum('pro-mek', {
      id: 's-pro-mek-3',
      surumNo: 3,
      iyzicoPlanKodu: 'plan-pro-mek-3',
      iyzicoDenemesizPlanKodu: 'plan-pro-mek-3-denemesiz',
    });
    const { db, on } = await oneriKur({
      oneriHedefi: null,
      db: { abonelikler: [abonelik('basic-mek')], surumler: [...TUM_SURUMLER(), yeniSurum] },
    });
    const eski = await reddeder(() => on.olustur(ONER('pro-mek')));
    check(
      'O3g ⭐ musterinin GORMEDIGI (eski) surum onerilemez → 409 ONERI_DEGIL, satir yok (D5)',
      eski?.durum === 409 && eski?.govde?.kod === 'ONERI_DEGIL' && /görünmüyor/.test(eski?.govde?.message ?? '') && db.oneriler.length === 0,
      JSON.stringify(eski),
    );
    const yeni = await basarir('O3h', () => on.olustur(ONER('pro-mek-3')));
    check('O3h musterinin gordugu EN YENI surum onerilebilir', !!yeni?.oneriId && db.oneriler[0]?.hedefPaketSurumuId === 's-pro-mek-3');
  }
  {
    // Guvenlik D2: SMTP ret metni aliciyi tasiyabilir — gunluge MASKELI gider.
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const { on } = kur(db, sahteIyzico(db.sira), sahteEposta({ dusenAlicilar: ['sahip@firma.test'] }));
    GUNLUK.length = 0;
    const r = await basarir('O4b', () => on.olustur(ONER('pro-mek')));
    const satir = GUNLUK.find((g) => g.includes('Oneri maili GONDERILEMEDI')) ?? '';
    check(
      'O4b ⭐ e-posta dusse de oneri KAYITLI, yanit "gonderilemedi"; gunlukte ALICI ADRESI YOK (maskeli)',
      !!r?.oneriId && r.epostaGonderildi === false && satir.includes('<adres>') && !satir.includes('@'),
      satir,
    );
    check(
      'O4c maske saglayici metnindeki adresi de ortuyor ("550 <kisi@firma.com> ...")',
      !gunlukIcinMaskele('550 5.1.1 <kisi@firma.com> mailbox unavailable').includes('@'),
    );
  }
  {
    const { db, on } = await oneriKur({ oneriHedefi: null });
    const r = await reddeder(() => on.olustur(ONER('pro-mek', { gerekce: '  ab    ' })));
    check('O5 gerekce KIRPILINCA 5\'ten kisa → 400, satir yok', r?.durum === 400 && db.oneriler.length === 0, JSON.stringify(r));
  }
  {
    // Ikinci surec: bizim okumamizdan SONRA, yazimimizdan ONCE ayni firmaya oneri yazdi.
    const { db, ep, on } = await oneriKur({
      oneriHedefi: null,
      db: {
        abonelikler: [abonelik('basic-mek')],
        surumler: TUM_SURUMLER(),
        oneriYazimOncesi: (liste) => {
          if (liste.some((x) => x.bekleyenFirmaId === 'f1')) return;
          liste.push({ id: 'baska-surec', firmaId: 'f1', bekleyenFirmaId: 'f1', durum: 'BEKLIYOR', olusturuldu: new Date() });
        },
      },
    });
    const r = await reddeder(() => on.olustur(ONER('pro-mek')));
    check(
      'O6 ⭐ ikinci surec araya girerse VERITABANI kilidi durdurur: P2002 → 409 ONERI_ZATEN_VAR, denetim ve e-posta YOK',
      r?.durum === 409 && r?.govde?.kod === 'ONERI_ZATEN_VAR' && db.denetimler.length === 0 && ep.giden.length === 0,
      JSON.stringify(r),
    );
  }
  {
    const { db, on, oneriId: ilk } = await oneriKur();
    db.oneriler[0].sonGecerlilik = gecmis();
    const ikinci = await basarir('O7', () => on.olustur(ONER('pro-mep')));
    const eski = db.oneriler.find((x: Satir) => x.id === ilk);
    const yeni = db.oneriler.find((x: Satir) => x.id === ikinci?.oneriId);
    check(
      'O7 ⭐ suresi dolmus oneri yenisini ENGELLEMEZ: eskisi KAPANDI (suresi-doldu) ve kilidi birakti, yenisi BEKLIYOR',
      eski?.durum === 'KAPANDI' &&
        eski?.kapanisNedeni === 'suresi-doldu' &&
        eski?.bekleyenFirmaId === null &&
        yeni?.durum === 'BEKLIYOR' &&
        yeni?.bekleyenFirmaId === 'f1',
      JSON.stringify({ eski, yeni }),
    );
    check(
      'O7b yeni onerinin denetimi kapatilan oneriyi anar',
      db.denetimler[1]?.veri?.kapatilanOneriId === ilk && db.denetimler[1]?.veri?.kapatilanOneriDurumu === 'suresi-doldu',
      JSON.stringify(db.denetimler[1]?.veri),
    );
  }
}

async function oGeriCekmeVeRet(): Promise<void> {
  {
    const { db, on, oneriId } = await oneriKur({
      db: { abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER(), digerFirmalar: [{ ...FIRMA(), id: 'f2', ad: 'Firma B' }] },
    });
    const baska = await reddeder(() => on.geriCek({ firmaId: 'f2', oneriId, yonetici: YONETICI }));
    check(
      'O8 baska firma yolundan geri cekme → 404, oneri BEKLIYOR kalir',
      baska?.durum === 404 && db.oneriler[0].durum === 'BEKLIYOR',
      JSON.stringify(baska),
    );
    const g = await basarir('O8b', () => on.geriCek({ firmaId: 'f1', oneriId, yonetici: YONETICI }));
    const s = db.oneriler[0];
    check(
      'O8b ⭐ geri cekme: GERI_CEKILDI, kilit bosaldi, yapan yonetici; denetim ayni islemde',
      g?.geriCekildi === true &&
        s.durum === 'GERI_CEKILDI' &&
        s.bekleyenFirmaId === null &&
        s.sonuclandiranId === 'y1' &&
        db.denetimler.map((x: Satir) => x.tip).join(',') === 'paket.oneri.gonderildi,paket.oneri.geri-cekildi',
      JSON.stringify({ s, tip: db.denetimler.map((x: Satir) => x.tip) }),
    );
    const ikinci = await reddeder(() => on.geriCek({ firmaId: 'f1', oneriId, yonetici: YONETICI }));
    check('O8c ikinci geri cekme → 409 ONERI_BEKLEMIYOR', ikinci?.durum === 409 && ikinci?.govde?.kod === 'ONERI_BEKLEMIYOR', JSON.stringify(ikinci));
    const yeniden = await basarir('O8d', () => on.olustur(ONER('pro-mep')));
    check('O8d geri cekilen oneri kilidi birakti: yeni oneri gonderilebilir', !!yeniden?.oneriId);
  }
  {
    const { db, iyz, on, oneriId } = await oneriKur({
      db: {
        abonelikler: [abonelik('basic-mek')],
        surumler: TUM_SURUMLER(),
        kullanicilar: [...EKIP(), KULLANICI('sahip2', { firmaId: 'f2', firmaRol: 'sahip' })],
      },
    });
    const uye = await reddeder(() => on.reddet({ firmaId: 'f1', oneriId, kullaniciId: 'uye1' }));
    check(
      'O9 ⭐ IKINCI KATMAN: sahip olmayan (uye) reddedemez → 403, oneri BEKLIYOR kalir',
      uye?.durum === 403 && db.oneriler[0].durum === 'BEKLIYOR',
      JSON.stringify(uye),
    );
    const baska = await reddeder(() => on.reddet({ firmaId: 'f2', oneriId, kullaniciId: 'sahip2' }));
    check('O9b baska firmanin sahibi reddedemez → 404', baska?.durum === 404 && db.oneriler[0].durum === 'BEKLIYOR', JSON.stringify(baska));
    const ret = await basarir('O9c', () => on.reddet({ firmaId: 'f1', oneriId, kullaniciId: 'sahip' }));
    const s = db.oneriler[0];
    const olay = db.olaylar.find((x: Satir) => x.tip === 'paket.oneri.reddedildi');
    check(
      'O9c ⭐ sahip reddetti: REDDEDILDI, kilit bosaldi, abonelik gecmisine olay (aktor sahip)',
      ret?.reddedildi === true &&
        s.durum === 'REDDEDILDI' &&
        s.bekleyenFirmaId === null &&
        s.sonuclandiranId === 'sahip' &&
        olay?.aktor === 'sahip' &&
        olay?.veri?.oneriId === s.id,
      JSON.stringify({ s, olay }),
    );
    check(
      'O9d ret paketi DEGISTIRMEZ (iyzico 0, abonelik ayni)',
      iyz.cagrilar.length === 0 && db.satir().paketSurumuId === 's-basic-mek',
      JSON.stringify(iyz.cagrilar),
    );
    const tekrar = await reddeder(() => on.reddet({ firmaId: 'f1', oneriId, kullaniciId: 'sahip' }));
    check('O9e reddedilmis oneri yeniden reddedilemez → 409 ONERI_GECERSIZ', tekrar?.durum === 409 && tekrar?.govde?.kod === 'ONERI_GECERSIZ', JSON.stringify(tekrar));
  }
}

async function oKabul(): Promise<void> {
  {
    const { db, iyz, pd, on, ep, oneriId } = await oneriKur();
    ep.giden.length = 0;
    const sonuc = await basarir('O10', () =>
      pd.degistir(KABUL('pro-mek'), on.kabulKancalari({ firmaId: 'f1', oneriId, kullaniciId: 'sahip' })),
    );
    const cagri = iyz.cagrilar.filter((c) => c.metot === 'paketDegistir');
    check(
      'O10 ⭐ BAGLANTI: kabul A1 cekirdeginden gecti — TEK iyzico cagrisi, eski uc, denemesiz hedef plan, NEXT_PERIOD',
      !!sonuc &&
        cagri.length === 1 &&
        cagri[0].args[0] === 'uc-0' &&
        cagri[0].args[1]?.yeniPlanKodu === 'plan-pro-mek-denemesiz' &&
        cagri[0].args[1]?.nezaman === 'NEXT_PERIOD',
      JSON.stringify(cagri),
    );
    const olay = db.olaylar.find((x: Satir) => x.tip === 'paket.degisti');
    const anahtarlar = Object.keys(olay?.veri ?? {});
    check(
      'O10b olay: A1 ile ayni tip (yukseltme HEMEN), oneri izi VAR, onay izi verinin SONUNDA, aktor sahip',
      olay?.veri?.oneriId === oneriId &&
        anahtarlar.slice(-2).join(',') === 'sozlesmeOnayiZamani,sozlesmeSurumu' &&
        olay?.aktor === 'sahip',
      JSON.stringify(anahtarlar),
    );
    const s = db.oneriler[0];
    check(
      'O10c ⭐ oneri TUKETILDI ayni islemde: KABUL_EDILDI, kilit bosaldi, kabul eden sahip',
      s.durum === 'KABUL_EDILDI' && s.bekleyenFirmaId === null && s.sonuclandiranId === 'sahip',
      JSON.stringify(s),
    );
    check(
      'O10d musteri A1 e-postasini aldi (sozlesme onayi cumlesiyle — onayi KENDISI verdi)',
      ep.giden.length === 1 && JSON.stringify(ep.giden[0]).includes('Mesafeli Satış'),
      JSON.stringify(ep.giden.map((x: any) => x.konu)),
    );
    check(
      'O10e abonelik yukseltildi: etkin paket pro-mek, yeni uc',
      db.satir().paketSurumuId === 's-pro-mek' && db.satir().iyzicoAbonelikKodu === 'uc-1',
      JSON.stringify({ p: db.satir().paketSurumuId, uc: db.satir().iyzicoAbonelikKodu }),
    );
  }
  const kabulReddi = async (
    ad: string,
    hazirla: (k: Awaited<ReturnType<typeof oneriKur>>) => Promise<void> | void,
    istek: { paket: string; firmaId?: string; kullaniciId?: string },
    kod: string,
    desen?: RegExp,
    durum = 409,
  ) => {
    const k = await oneriKur({
      db: {
        abonelikler: [
          abonelik('basic-mek'),
          abonelik('basic-mek', { id: 'ab2', firmaId: 'f2', iyzicoAbonelikKodu: 'uc-f2', iyzicoKokKodu: 'uc-f2' }),
        ],
        surumler: TUM_SURUMLER(),
        // f2'nin SAHIBI: kabul rolu veritabanindan okur (D9); f2 isteginde
        // 403 degil, oneri kurali (409 "bulunamadi") olculsun.
        kullanicilar: [...EKIP(), KULLANICI('sahip2', { firmaId: 'f2', firmaRol: 'sahip' })],
      },
    });
    await hazirla(k);
    const firmaId = istek.firmaId ?? 'f1';
    const kullaniciId = istek.kullaniciId ?? 'sahip';
    const r = await reddeder(() =>
      k.pd.degistir(KABUL(istek.paket, firmaId), k.on.kabulKancalari({ firmaId, oneriId: k.oneriId, kullaniciId })),
    );
    check(
      ad,
      r?.durum === durum &&
        r?.govde?.kod === kod &&
        (!desen || desen.test(r?.govde?.message ?? '')) &&
        k.iyz.degisimSayisi() === 0,
      JSON.stringify({ r, iyzico: k.iyz.degisimSayisi() }),
    );
    return k;
  };
  {
    const k = await kabulReddi('O11 ⭐ baska paketle kabul → 409 ONERI_HEDEF_FARKLI, iyzico 0', () => undefined, { paket: 'pro-mep' }, 'ONERI_HEDEF_FARKLI');
    check('O11b hedef farkli istek oneriyi TUKETMEZ', k.db.oneriler[0].durum === 'BEKLIYOR');
  }
  await kabulReddi(
    'O12 ⭐ suresi dolmus oneriyle kabul → 409 ONERI_GECERSIZ ("süresi doldu"), iyzico 0',
    (k) => {
      k.db.oneriler[0].sonGecerlilik = gecmis();
    },
    { paket: 'pro-mek' },
    'ONERI_GECERSIZ',
    /süresi doldu/,
  );
  await kabulReddi(
    'O13 geri cekilmis oneriyle kabul → 409 ("geri çekildi"), iyzico 0',
    async (k) => {
      await k.on.geriCek({ firmaId: 'f1', oneriId: k.oneriId, yonetici: YONETICI });
    },
    { paket: 'pro-mek' },
    'ONERI_GECERSIZ',
    /geri çekildi/,
  );
  {
    const k = await kabulReddi(
      'O14 ⭐ BASKA firmanin onerisiyle kabul (o firmanin SAHIBI) → 409 "bulunamadı" (varlik sizmaz), iyzico 0',
      () => undefined,
      { paket: 'pro-mek', firmaId: 'f2', kullaniciId: 'sahip2' },
      'ONERI_GECERSIZ',
      /bulunamadı/,
    );
    check('O14b f1\'in onerisi BEKLIYOR kalir, f2 aboneligi degismez', k.db.oneriler[0].durum === 'BEKLIYOR');
  }
  {
    const k = await kabulReddi(
      'O14c ⭐ IKINCI KATMAN (D9): veritabaninda sahip OLMAYAN kabul edemez → 403, iyzico 0 (token eski olabilir)',
      () => undefined,
      { paket: 'pro-mek', kullaniciId: 'uye1' },
      'FIRMA_SAHIBI_GEREKLI',
      undefined,
      403,
    );
    check('O14d rol reddi oneriyi TUKETMEZ', k.db.oneriler[0].durum === 'BEKLIYOR');
  }
  {
    const { db, iyz, pd, on, oneriId } = await oneriKur();
    const r = await reddeder(() =>
      pd.degistir({ ...KABUL('pro-mek'), sozlesmeOnayi: false }, on.kabulKancalari({ firmaId: 'f1', oneriId, kullaniciId: 'sahip' })),
    );
    check(
      'O15 ⭐ onay kapisi ONERIDEN ONCE: sozlesme onaysiz kabul 400, iyzico 0, oneri TUKETILMEZ',
      r?.durum === 400 && iyz.degisimSayisi() === 0 && db.oneriler[0].durum === 'BEKLIYOR',
      JSON.stringify(r),
    );
  }
  {
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira, {
      degisimHatasi: new IyzicoHatasi('201402', 'Bu abonelik yükseltilemez'),
      detaylar: { 'uc-0': { referenceCode: 'uc-0', subscriptionStatus: 'UPGRADED' } },
      aramaSonucu: [
        {
          referenceCode: 'uc-1',
          parentReferenceCode: 'uc-0',
          customerReferenceCode: 'm-1',
          pricingPlanReferenceCode: 'plan-pro-elk-denemesiz',
          subscriptionStatus: 'ACTIVE',
          startDate: gunSonra(20).getTime(),
        },
      ],
    });
    const { pd, on } = kur(db, iyz);
    const r = await basarir('O16 hazirlik', () => on.olustur(ONER('pro-mek')));
    const sonuc = await basarir('O16', () =>
      pd.degistir(KABUL('pro-mek'), on.kabulKancalari({ firmaId: 'f1', oneriId: r?.oneriId ?? '', kullaniciId: 'sahip' })),
    );
    const s = db.oneriler[0];
    check(
      'O16 ⭐ kurtarmada kaydedilen degisim ONERININ DEGIL → oneri KABUL SAYILMAZ: KAPANDI (kurtarma-onceki-degisim)',
      sonuc?.oncekiDegisim === true &&
        s?.durum === 'KAPANDI' &&
        s?.kapanisNedeni === 'kurtarma-onceki-degisim' &&
        s?.bekleyenFirmaId === null &&
        s?.sonuclandiranId === null,
      JSON.stringify({ sonuc, s }),
    );
    const olay = db.olaylar.find((x: Satir) => x.tip === 'paket.degisim.planlandi' || x.tip === 'paket.degisti');
    check(
      'O16b ⭐ kurtarilan degisimin olayi oneriye ATIF YAPMAZ (D1): kaynak=kurtarma, kapananOneriId var, oneriId YOK',
      olay?.veri?.kaynak === 'kurtarma' &&
        olay?.veri?.kapananOneriId === r?.oneriId &&
        !('oneriId' in (olay?.veri ?? {})),
      JSON.stringify(olay?.veri),
    );
  }
  {
    // D2 (inceleme): iyzico cagrisi SURERKEN oneri baska bir surecte sonuclandi
    // (kontrol iyzico'dan once gecti). Tuketim yazilamaz — ama degisim iyzico'da
    // OLDU: yerel yazimi geri almak aboneligi YARIM birakirdi.
    const db = sahteDb({ abonelikler: [abonelik('basic-mek')], surumler: TUM_SURUMLER() });
    const iyz = sahteIyzico(db.sira, {
      cagriSirasinda: () => {
        const o = db.oneriler[0];
        if (o) Object.assign(o, { durum: 'GERI_CEKILDI', bekleyenFirmaId: null });
      },
    });
    const { pd, on } = kur(db, iyz);
    const r = await basarir('O16c hazirlik', () => on.olustur(ONER('pro-mek')));
    GUNLUK.length = 0;
    const sonuc = await basarir('O16c', () =>
      pd.degistir(KABUL('pro-mek'), on.kabulKancalari({ firmaId: 'f1', oneriId: r?.oneriId ?? '', kullaniciId: 'sahip' })),
    );
    check(
      'O16c ⭐ tuketim yazilamazsa degisim GERI ALINMAZ: paket degisti, oneri GERI_CEKILDI kaldi, gunlukte ONERI TUKETILEMEDI',
      !!sonuc &&
        db.satir().paketSurumuId === 's-pro-mek' &&
        db.oneriler[0].durum === 'GERI_CEKILDI' &&
        GUNLUK.some((g) => g.includes('ONERI TUKETILEMEDI')),
      JSON.stringify({ sonuc: !!sonuc, p: db.satir().paketSurumuId, d: db.oneriler[0]?.durum }),
    );
  }
}

async function oKapanma(): Promise<void> {
  {
    const { db, iyz, pd, on, panel, oneriId } = await oneriKur();
    // Musteri oneriyi ANMADAN (oneriId'siz) kendi degisimini yapti.
    await basarir('O17 hazirlik', () => pd.degistir(KABUL('pro-mek')));
    const bekleyen = await on.bekleyen('f1');
    const p = await basarir('O17 panel', () => panel.panel('f1'));
    const r = await reddeder(() =>
      pd.degistir(KABUL('pro-mek'), on.kabulKancalari({ firmaId: 'f1', oneriId, kullaniciId: 'sahip' })),
    );
    check(
      'O17 ⭐ BASKA degisiklik oneriyi KAPATIR (hicbir yol onu anmadan): musteri yaniti null, panel "abonelik-degisti", kabul 409',
      bekleyen === null && p?.oneri?.durum === 'abonelik-degisti' && r?.durum === 409 && r?.govde?.kod === 'ONERI_GECERSIZ',
      JSON.stringify({ bekleyen, durum: p?.oneri?.durum, r }),
    );
    check('O17b kapanmis oneriyle kabul iyzico\'ya GITMEDI (yalniz musterinin kendi degisimi)', iyz.degisimSayisi() === 1, String(iyz.degisimSayisi()));
    check(
      'O17c okuma yolu YAZMAZ: satir BEKLIYOR ve kilit (bekleyenFirmaId) yerinde — kapanis HESAPLANIR',
      db.oneriler[0].durum === 'BEKLIYOR' && db.oneriler[0].bekleyenFirmaId === 'f1',
      JSON.stringify(db.oneriler[0]),
    );
  }
  {
    const { db, on, panel } = await oneriKur();
    // Yonetici havaleyi onayladi (havale.servisi): paket, kod ve durum AYNI kalir,
    // yalniz yontem HAVALE olur — goruntu bunu da gormeli (inceleme O1).
    db.satir().odemeYontemi = 'HAVALE';
    const bekleyen = await on.bekleyen('f1');
    const p = await basarir('O18b panel', () => panel.panel('f1'));
    check(
      'O18b ⭐ havale onayi oneriyi KAPATIR (O1): musteri yaniti null, panel "abonelik-degisti"',
      bekleyen === null && p?.oneri?.durum === 'abonelik-degisti',
      JSON.stringify({ bekleyen, durum: p?.oneri?.durum }),
    );
  }
  {
    const { db, ab, iyz, pd, on, panel, oneriId } = await oneriKur();
    db.oneriler[0].olusturuldu = new Date(Date.now() - 1_000); // olaylar kesin SONRA
    // Abonelik SONA_ERDI'ye dustu, sonra kayip tahsilat oynatildi: AYNI kod ve paketle AKTIF.
    await ab.durumDegistir('ab1', AbonelikDurumu.SONA_ERDI, { aktor: 'sistem' });
    await ab.durumDegistir('ab1', AbonelikDurumu.AKTIF, { aktor: 'sistem' });
    const bekleyen = await on.bekleyen('f1');
    const p = await basarir('O18c panel', () => panel.panel('f1'));
    const r = await reddeder(() =>
      pd.degistir(KABUL('pro-mek'), on.kabulKancalari({ firmaId: 'f1', oneriId, kullaniciId: 'sahip' })),
    );
    check(
      'O18c ⭐ KAPANMA TEK YONLU (O2): SONA_ERDI → AKTIF donusunde oneri CANLANMAZ — yanit null, panel "abonelik-degisti", kabul 409, iyzico 0',
      bekleyen === null && p?.oneri?.durum === 'abonelik-degisti' && r?.durum === 409 && iyz.degisimSayisi() === 0,
      JSON.stringify({ bekleyen, durum: p?.oneri?.durum, r }),
    );
    check(
      'O18d FIXTURE KANITI: durum AKTIF, kod ve paket AYNI (anlik goruntu TEK BASINA "bekliyor" derdi)',
      db.satir().durum === 'AKTIF' && db.satir().iyzicoAbonelikKodu === 'uc-0' && db.satir().paketSurumuId === 's-basic-mek',
    );
  }
  {
    const { db, ab, on } = await oneriKur();
    db.oneriler[0].olusturuldu = new Date(Date.now() - 1_000);
    await ab.durumDegistir('ab1', AbonelikDurumu.ODEME_BEKLIYOR, {});
    await ab.durumDegistir('ab1', AbonelikDurumu.AKTIF, {});
    check(
      'O18e odeme sorunu + duzelme oneriyi KAPATMAZ (yalniz IPTAL / SONA_ERDI / ASKIDA)',
      (await on.bekleyen('f1'))?.id === db.oneriler[0].id,
    );
  }
  {
    // Oneriden ONCEKI kapatan gecis sayilmaz: SONA_ERDI → AKTIF donusu oneri
    // OLUSMADAN once oldu (o anki abonelik zaten AKTIF, oneri gecerli).
    const { db, ab, on } = await oneriKur({ oneriHedefi: null });
    await ab.durumDegistir('ab1', AbonelikDurumu.SONA_ERDI, {});
    await ab.durumDegistir('ab1', AbonelikDurumu.AKTIF, {});
    db.olaylar.forEach((x: Satir) => (x.olusturuldu = new Date(Date.now() - 60_000)));
    const r = await basarir('O18f', () => on.olustur(ONER('pro-mek')));
    check('O18f oneriden ONCEKI kapatan gecis SAYILMAZ', !!r && (await on.bekleyen('f1'))?.id === r.oneriId);
  }
  {
    const { db, on, panel } = await oneriKur();
    // Yeni surum yayimlandi: hedefin eski surumu satistan cekildi (paketleri-kur.ts).
    const hedef = await db.paketSurumu.findUnique({ where: { id: 's-pro-mek' } });
    hedef.satistaMi = false;
    const bekleyen = await on.bekleyen('f1');
    const p = await basarir('O18g panel', () => panel.panel('f1'));
    check(
      'O18g ⭐ hedef surum satistan kalkinca (D5) musteri yaniti null, panel "satistan-kalkti" (ikisi AYNI kararda)',
      bekleyen === null && p?.oneri?.durum === 'satistan-kalkti',
      JSON.stringify({ bekleyen, durum: p?.oneri?.durum }),
    );
  }
  {
    const { db, yd, on } = await oneriKur({ paket: 'pro-mek', oneriHedefi: 'pro-mep' });
    await basarir('O18 hazirlik', () => yd.dusur(DUSUR('basic-mek')));
    check(
      'O18 yonetici dusurmesi de bekleyen oneriyi kapatir',
      (await on.bekleyen('f1')) === null &&
        // Gecmis "temiz" verilir: kapanisi ANLIK GORUNTU (yeni uc + kilit) yakalamali.
        oneriDurumu(db.oneriler[0], db.satir(), new Date(), { kapatanGecisVar: false, hedefSatista: true }) ===
          'abonelik-degisti',
      JSON.stringify(db.satir().paketGecisTarihi),
    );
  }
  {
    const { on, panel, oneriId } = await oneriKur();
    const p = await basarir('O19', () => panel.panel('f1'));
    check(
      'O19 panel: bekleyen oneri (hedef, gerekce, not, olusturan); iyzico kodu SIZMAZ',
      p?.oneri?.id === oneriId &&
        p?.oneri?.durum === 'bekliyor' &&
        p?.oneri?.hedef.kod === 'pro-mek' &&
        p?.oneri?.gerekce === 'Müşteri DWG metrajı istedi, Pro önerildi' &&
        p?.oneri?.musteriNotu === NOT &&
        p?.oneri?.olusturanEposta === YONETICI.email &&
        !JSON.stringify(p).includes('uc-0'),
      JSON.stringify(p?.oneri),
    );
    await on.geriCek({ firmaId: 'f1', oneriId, yonetici: YONETICI });
    const p2 = await basarir('O19b', () => panel.panel('f1'));
    check('O19b geri cekilen oneri panelde "geri-cekildi" (son oneri kaybolmaz)', p2?.oneri?.durum === 'geri-cekildi', JSON.stringify(p2?.oneri));
  }
}

async function oSiraVeYaris(): Promise<void> {
  {
    const { db, iyz, pd, on, oneriId } = await oneriKur();
    const [kabul, geri] = await Promise.allSettled([
      pd.degistir(KABUL('pro-mek'), on.kabulKancalari({ firmaId: 'f1', oneriId, kullaniciId: 'sahip' })),
      on.geriCek({ firmaId: 'f1', oneriId, yonetici: YONETICI }),
    ]);
    check(
      'O20 ⭐ kabul ile geri cekme AYNI sirada: once gelen (kabul) kazanir, geri cekme 409; tek iyzico cagrisi',
      kabul.status === 'fulfilled' && hataDurumu(geri) === 409 && db.oneriler[0].durum === 'KABUL_EDILDI' && iyz.degisimSayisi() === 1,
      JSON.stringify({ kabul: kabul.status, geri: hataDurumu(geri), durum: db.oneriler[0].durum }),
    );
  }
  {
    const { db, iyz, pd, on, oneriId } = await oneriKur();
    const [geri, kabul] = await Promise.allSettled([
      on.geriCek({ firmaId: 'f1', oneriId, yonetici: YONETICI }),
      pd.degistir(KABUL('pro-mek'), on.kabulKancalari({ firmaId: 'f1', oneriId, kullaniciId: 'sahip' })),
    ]);
    check(
      'O20b geri cekme once gelirse kabul 409 ve iyzico\'ya HIC gidilmez',
      geri.status === 'fulfilled' && hataDurumu(kabul) === 409 && iyz.degisimSayisi() === 0 && db.oneriler[0].durum === 'GERI_CEKILDI',
      JSON.stringify({ geri: geri.status, kabul: hataDurumu(kabul) }),
    );
  }
  {
    const { pd } = await oneriKur({ oneriHedefi: null });
    /**
     * Sure siniri. ⚠ `unref` YOK: kilitlenmede bekleyen TEK is bu zamanlayicidir;
     * unref'li olsaydi Node olay dongusunu bos sayar, surec OZETSIZ 0 ile cikar ve
     * kapi yesil gorunurdu (25.09 mutasyonu: M37/M38 tam bu yuzden YASADI —
     * "asili soz = sessiz cikis 0"). Is bitince zamanlayici temizlenir.
     */
    const sinirli = async <T>(is: Promise<T>, ms: number): Promise<T | 'ASILI KALDI'> => {
      let zamanlayici: NodeJS.Timeout | undefined;
      const sinir = new Promise<'ASILI KALDI'>((r) => {
        zamanlayici = setTimeout(() => r('ASILI KALDI'), ms);
      });
      try {
        return await Promise.race([is, sinir]);
      } finally {
        clearTimeout(zamanlayici);
      }
    };
    const ic = pd.firmaSirasinda('f1', () => pd.firmaSirasinda('f1', async () => 'ic'));
    const sonuc = await sinirli(ic.then(() => 'BITTI', (e: Error) => `HATA:${e.message}`), 2_000);
    check('O21 ⭐ ic ice AYNI firma sirasi KILITLENMEZ, hemen HATA verir', String(sonuc).startsWith('HATA:FIRMA SIRASI IC ICE'), String(sonuc));
    // f1 sirasi kilitlendiyse (bozuk kod) bu adimlar da ASILMASIN — sinirli.
    const farkli = await sinirli(pd.firmaSirasinda('f1', () => pd.firmaSirasinda('f2', async () => 7)), 2_000);
    check('O21b farkli firmanin sirasina girmek serbest', farkli === 7, String(farkli));
    const sonra = await sinirli(pd.firmaSirasinda('f1', async () => 'bos'), 2_000);
    check('O21c hatadan sonra firma sirasi TIKANMADI', sonra === 'bos', String(sonra));
  }
}

async function oMusteriYaniti(): Promise<void> {
  {
    const { on, oneriId } = await oneriKur();
    const ctrl = new AbonelikController(
      {} as any,
      {
        satistakiPaketler: async () =>
          ['basic-mek', 'pro-mek', 'pro-mep'].map((kod) => ({ kod, surum: { paketSurumuId: `s-${kod}`, denemeGunu: 30 } })),
      } as any,
      { karar: async () => ({ hak: false, gerekce: 'kullanildi' }) } as any,
      { yollar: async () => new Map() } as any,
      on,
    );
    const sahip = (await ctrl.paketler({ id: 'sahip', firmaId: 'f1', firmaRol: 'sahip' })) as any[];
    const uye = (await ctrl.paketler({ id: 'uye1', firmaId: 'f1', firmaRol: 'uye' })) as any[];
    const hedef = sahip.find((x) => x.kod === 'pro-mek');
    check(
      'O22 ⭐ paketler DIZI kalir; oneri YALNIZ hedef paketin satirinda, not SAHIBE',
      Array.isArray(sahip) && hedef?.oneri?.id === oneriId && hedef?.oneri?.not === NOT && sahip.filter((x) => x.oneri).length === 1,
      JSON.stringify(sahip.map((x) => [x.kod, x.oneri ?? null])),
    );
    const uyeHedef = uye.find((x) => x.kod === 'pro-mek');
    check('O22b uye oneriyi gorur ama NOTU GORMEZ', uyeHedef?.oneri?.id === oneriId && uyeHedef?.oneri?.not === null, JSON.stringify(uyeHedef?.oneri));
    check('O22c degisim alani A1 karari olarak kalir (oneri icine GIRMEZ)', !!hedef && !('oneri' in (hedef.degisim ?? {})), JSON.stringify(hedef?.degisim));
  }
  {
    const e = yoneticiOneriEpostasi({
      kime: 'a@b.test',
      firmaAdi: 'Firma A',
      mevcutPaketAdi: 'Pro Mekanik',
      hedefPaketAdi: 'Pro Elektrik',
      hedefTutar: '1649.00',
      zamanlama: 'donem-sonu',
      beklenenGecis: gunSonra(20),
      kazanclar: ['kapsam'],
      kayiplar: ['kapsam'],
      hedefKullaniciHakki: 2,
      durdurulacakUye: 1,
      musteriNotu: null,
      sonGecerlilik: gunSonra(7),
      oneriId: 'o-1',
      uygulamaUrl: 'https://app.test',
    });
    const m = e.paragraflar.join(' | ');
    check(
      'O23 donem-sonu metni: paket o tarihte degisir, o zamana kadar mevcut acik; kazanc + kayip + durdurulacak uye; not yoksa not paragrafi YOK',
      m.includes('Pro Elektrik olarak değişir') &&
        m.includes('onayınızdan sonraki ilk dönem sonunda (bugünkü bilgiyle') &&
        m.includes('Pro Mekanik paketinizin tüm özellikleri açık kalır') &&
        m.includes('eklenen ya da artan haklar') &&
        m.includes('azalan ya da kalkan haklar') &&
        m.includes('1 ekip üyesinin erişimi durur') &&
        !m.includes('ekibinin notu'),
      m,
    );
    check('O23b baglanti gizli anahtar TASIMAZ: yalniz /abonelik?oneri=<id>', e.dugme?.url === 'https://app.test/abonelik?oneri=o-1', e.dugme?.url);
  }
}

async function oBlogu(): Promise<void> {
  console.log('\n── O · oneri (musteri onayli degisim, Blok 2) ──');
  oSafKurallar();
  await oOlusturma();
  await oGeriCekmeVeRet();
  await oKabul();
  await oKapanma();
  await oSiraVeYaris();
  await oMusteriYaniti();
}

// ═══════════════════════════════════════════════════════════════════════════
//  B · BAGLANTI — mekanizma var, BAGLANTI da var mi?
// ═══════════════════════════════════════════════════════════════════════════
function tumKaynaklar(dizin: string, sonuc: string[] = []): string[] {
  for (const ad of readdirSync(dizin)) {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) tumKaynaklar(yol, sonuc);
    else if (yol.endsWith('.ts')) sonuc.push(yol);
  }
  return sonuc;
}

function bBlogu(): void {
  console.log('\n── B · baglanti ──');
  const ctrl = kodu(oku('backend/src/ozellik/odeme/abonelik/yonetici/yonetici-abonelik.controller.ts'));
  const sinifOncesi = ctrl.slice(0, ctrl.indexOf('export class YoneticiAbonelikController'));
  check(
    "B1 ⭐ uc SINIF duzeyinde korumali: @Controller('yonetim/abonelik') + JwtAuthGuard + RolesGuard + @Roles('admin')",
    /@Controller\('yonetim\/abonelik'\)/.test(sinifOncesi) &&
      /@UseGuards\(JwtAuthGuard, RolesGuard\)/.test(sinifOncesi) &&
      /@Roles\('admin'\)/.test(sinifOncesi),
  );
  check(
    'B2 dusur ucu: govde DTO SINIFI (satir-ici literal YOK), aktor @CurrentUser, firmaId ParseUUIDPipe',
    /@Body\(\) g: YoneticiDusurDto/.test(ctrl) &&
      !/@Body\(\)\s*\w+\s*:\s*\{/.test(ctrl) &&
      /@CurrentUser\(\) yonetici/.test(ctrl) &&
      (ctrl.match(/new ParseUUIDPipe\(\)/g) ?? []).length >= 2,
  );
  const dto = kodu(oku('backend/src/ozellik/odeme/abonelik/yonetici/dto/yonetici-dusur.dto.ts'));
  check(
    'B3 DTO: paketSurumuId @IsUUID, gerekce @MinLength(5)/@MaxLength(500), not istege bagli',
    /@IsUUID\(\)\s+paketSurumuId/.test(dto) && /@MinLength\(5/.test(dto) && /@IsOptional\(\)[\s\S]*musteriNotu\?/.test(dto),
  );
  const modul = kodu(oku('backend/src/ozellik/odeme/odeme.module.ts'));
  check(
    'B4 modul: denetleyici + iki servis kayitli',
    /YoneticiAbonelikController,/.test(modul) && /YoneticiAbonelikServisi,/.test(modul) && /YoneticiDusurmeServisi,/.test(modul),
  );
  const adminCtrl = kodu(oku('backend/src/ozellik/kutuphane/admin/admin.controller.ts'));
  const adminSrv = kodu(oku('backend/src/ozellik/kutuphane/admin/admin.service.ts'));
  check(
    'B5 ⭐ eski "abonelik ekle/kaldir" uclari KALDIRILDI (erisim vermiyorlardi)',
    !/subscriptions/.test(adminCtrl) &&
      !/userSubscription\.(upsert|delete|findMany)/.test(adminSrv) &&
      !/addUserSubscription|removeUserSubscription/.test(adminSrv),
  );
  check(
    'B5b kullanici listesi eski kisi-basi abonelikleri SECMIYOR',
    !/subscriptions:\s*\{/.test(adminSrv),
  );
  check(
    'B5c paket ucu yeni yolu gosteriyor ("Paket işlemleri")',
    /Paket işlemleri/.test(adminSrv),
  );
  const cagiranlar = tumKaynaklar(join(KOK, 'backend', 'src'))
    .filter((f) => /\.islemciyleDegistir\(/.test(kodu(readFileSync(f, 'utf8'))))
    .map((f) => f.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/'));
  check(
    'B6 ⭐ onay kapisiz dar giris (islemciyleDegistir) YALNIZ yonetici dusurme servisinden cagriliyor',
    cagiranlar.length === 1 && cagiranlar[0] === 'src/ozellik/odeme/abonelik/yonetici/yonetici-dusurme.servisi.ts',
    JSON.stringify(cagiranlar),
  );
  const cekirdek = kodu(oku('backend/src/ozellik/odeme/abonelik/paket-degisimi.servisi.ts'));
  check(
    'B7 dar giris TIP duzeyinde kapi ister: `kontrol`suz islemci DERLENMEZ',
    /islemci: DegisimIslemcisi & \{ kontrol: NonNullable<DegisimIslemcisi\['kontrol'\]> \}/.test(cekirdek),
  );

  // ── Blok 2 (oneri) ──────────────────────────────────────────────────────
  check('B8 ⭐ modul: PaketOnerisiServisi SAGLAYICI', /PaketOnerisiServisi,/.test(modul));
  check(
    'B9 yonetici oneri uclari: DTO SINIFI, aktor JWT, ParseUUIDPipe (panel 1 + dusur 1 + oneri 1 + geri-cek 2)',
    /@Post\(':firmaId\/oneri'\)/.test(ctrl) &&
      /@Post\(':firmaId\/oneri\/:oneriId\/geri-cek'\)/.test(ctrl) &&
      /@Body\(\) g: YoneticiOneriDto/.test(ctrl) &&
      (ctrl.match(/new ParseUUIDPipe\(\)/g) ?? []).length === 5,
    String((ctrl.match(/new ParseUUIDPipe\(\)/g) ?? []).length),
  );
  const oneriDto = kodu(oku('backend/src/ozellik/odeme/abonelik/yonetici/dto/yonetici-oneri.dto.ts'));
  check(
    'B9b oneri DTO: paketSurumuId @IsUUID, gerekce @MinLength(5)/@MaxLength(500), not istege bagli',
    /@IsUUID\(\)\s+paketSurumuId/.test(oneriDto) && /@MinLength\(5/.test(oneriDto) && /@IsOptional\(\)[\s\S]*musteriNotu\?/.test(oneriDto),
  );
  const musteriCtrl = kodu(oku('backend/src/ozellik/odeme/abonelik/abonelik.controller.ts')).replace(/\r\n/g, '\n');
  const retI = musteriCtrl.indexOf("@Post('oneri/:oneriId/reddet')");
  const retBlok = retI > -1 ? musteriCtrl.slice(musteriCtrl.lastIndexOf('\n  }\n', retI), retI) : '';
  check(
    'B10 ⭐ ret ucu: SAHIP kapili + hiz siniri (kaynak) ve kapali hesapta KAPALI (metadata)',
    /@UseGuards\(FirmaRolGuard\)/.test(retBlok) &&
      /@FirmaRolu\('sahip'\)/.test(retBlok) &&
      /@UseGuards\(KullaniciHizSiniriGuard\)/.test(retBlok) &&
      Reflect.getMetadata(KAPALI_HESAP_IZINLI, AbonelikController.prototype.oneriReddet) === false,
    retBlok.trim().slice(0, 200),
  );
  check(
    "B10b ret ucu degistir'den SONRA (A1 dekorator dilimi korunur)",
    musteriCtrl.indexOf("@Post('degistir')") > -1 && musteriCtrl.indexOf("@Post('degistir')") < retI,
  );
  check(
    'B11 ⭐ BAGLANTI: degistir ucu oneriId verilince KABUL kancalarini gecirir',
    /g\.oneriId \? this\.paketOnerisi\.kabulKancalari\(/.test(musteriCtrl),
  );
  const degistirDto = kodu(oku('backend/src/ozellik/odeme/abonelik/dto/abonelik-degistir.dto.ts'));
  check('B11b degistir DTO: oneriId istege bagli + @IsUUID', /@IsOptional\(\)\s*@IsUUID\(\)\s*oneriId\?: string/.test(degistirDto));
  const imha = kodu(oku('backend/src/ozellik/imha/imha-listesi.ts'));
  check(
    'B12 imha: oneri tablosu firma ekseninde SILINECEK',
    /model: 'PaketDegisimOnerisi',\s*erisimci: 'paketDegisimOnerisi',\s*kolon: 'firmaId',\s*eksen: 'firma'/.test(imha),
  );
  const sema = oku('backend/prisma/schema.prisma');
  check('B13 ⭐ sema: bekleyenFirmaId @unique (tek bekleyen onerinin VERITABANI kilidi)', /bekleyenFirmaId\s+String\?\s+@unique/.test(sema));
  const gocDizini = readdirSync(join(KOK, 'backend', 'prisma', 'migrations')).find((d) => d.endsWith('_paket_degisim_onerisi'));
  const gocSql = gocDizini ? oku(`backend/prisma/migrations/${gocDizini}/migration.sql`).replace(/--.*$/gm, '') : '';
  check(
    'B14 goc: tablo + UNIQUE kilit; YALNIZ EKLER (DROP / DELETE FROM / UPDATE yok)',
    /CREATE TABLE "PaketDegisimOnerisi"/.test(gocSql) &&
      /CREATE UNIQUE INDEX "PaketDegisimOnerisi_bekleyenFirmaId_key"/.test(gocSql) &&
      !/\bDROP\b/.test(gocSql) &&
      !/\bDELETE\s+FROM\b/i.test(gocSql) &&
      !/^\s*UPDATE\s/im.test(gocSql),
    gocDizini ?? '(goc yok)',
  );
}

async function blok(ad: string, fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch (e: any) {
    check(`${ad} BLOGU COKTU`, false, e?.stack ?? String(e));
  }
}

/**
 * ⚠ ASILI SOZ KORUMASI (hafiza dersi, 25.09 mutasyonuyla olculdu): cozulmeyen
 * bir `await` olay dongusunu bosaltirsa Node OZETSIZ ve 0 ile cikar — kapi
 * "yesil" gorunur. `main` sonuna ulasmadiysa cikis 1 olur.
 */
let kapiBitti = false;
process.on('beforeExit', () => {
  if (kapiBitti) return;
  console.error('KAPI ASILI KALDI: bir soz hic cozulmedi, ozet basilmadi (cikis 1).');
  process.exitCode = 1;
});

async function main(): Promise<void> {
  console.log('YONETICI PAKET ISLEMLERI (A2) — kapi');
  await blok('K', kBlogu);
  await blok('D', dBlogu);
  await blok('P', pBlogu);
  await blok('O', oBlogu);
  await blok('B', bBlogu);

  console.log('\n' + '═'.repeat(60));
  console.log(`  YONETICI PAKET: ${passed} gecti, ${failed} kaldi`);
  console.log('═'.repeat(60));
  if (failed > 0) {
    console.log('\nKALANLAR:');
    for (const f of failures) console.log(`  - ${f}`);
    // Windows: acik soketle process.exit 0xC0000409 verebilir (hafiza dersi).
    process.exitCode = 1;
  }
  kapiBitti = true;
}

main().catch((e) => {
  kapiBitti = true;
  console.error('KAPI COKTU:', e);
  process.exitCode = 1;
});
