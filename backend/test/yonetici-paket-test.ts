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
 *   B · Baglanti: uc korumalari, DTO, modul, eski uclar kaldirildi, tek cagiran
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { AbonelikDurumu } from '@prisma/client';

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
import {
  hakListesi,
  yoneticiDusurmeEpostasi,
} from '../src/ozellik/odeme/abonelik/yonetici/yonetici-paket-epostalari';
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
    paket: { kod, ad: `Paket ${kod}`, sira: KODLAR.indexOf(kod), ...(HAKLAR[kod] ?? HAKLAR['basic-mek']) },
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
  const sonaErmis = karar('pro-mek', 'basic-mek', { durum: AbonelikDurumu.SONA_ERDI, erisimSonu: gunSonra(-3) });
  check(
    'K10 ⭐ kart satiri SONA_ERDI → sureli-paket DEGIL ("yok": musteri kendi satin alir)',
    sonaErmis.tur === 'yok' && /satın alabilir/.test(sonaErmis.aciklama),
    JSON.stringify(sonaErmis),
  );
  const askida = karar('pro-mek', 'basic-mek', { durum: AbonelikDurumu.ASKIDA });
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

/** Prisma `where` alt kumesi: esitlik, Date, null, {lte, in, not}, OR, NOT. */
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
}) {
  const olaylar: Satir[] = [];
  const denetimler: Satir[] = [];
  /** Denetim satirlari ve iyzico cagrilari TEK siraya yazilir (sira olcumu). */
  const sira: string[] = [];
  const kullanicilar = p.kullanicilar ?? EKIP();
  const firma = p.firma === undefined ? FIRMA() : p.firma;
  const surumBul = (id: string | null) => p.surumler.find((s) => s.id === id) ?? null;
  const dolu = (a: Satir | undefined | null) =>
    a ? { ...a, paketSurumu: surumBul(a.paketSurumuId), planliPaketSurumu: surumBul(a.planliPaketSurumuId) } : null;
  const bul = (where: Satir) => p.abonelikler.find((a) => eslesir(a, where));
  const db: any = {
    olaylar,
    denetimler,
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
      findFirst: async ({ where }: any) => p.surumler.find((s) => eslesir(s, where)) ?? null,
      findMany: async ({ where }: any) => p.surumler.filter((s) => eslesir(s, where)),
    },
    abonelikOlayi: {
      create: async ({ data }: any) => {
        olaylar.push(data);
        return data;
      },
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
      findUnique: async ({ where }: any) => (firma && where?.id === firma.id ? { ...firma } : null),
      updateMany: async () => ({ count: 0 }),
    },
    user: {
      count: async ({ where }: any) => kullanicilar.filter((u) => eslesir(u, where)).length,
      findMany: async ({ where }: any) =>
        kullanicilar.filter((u) => eslesir(u, where)).map((u) => ({ id: u.id, email: u.email })),
      updateMany: async () => ({ count: 0 }),
    },
    // ⚠ GERCEKTEN GERI ALIR: A1'in sahtesi islemi geri almiyordu — "denetim
    // dustu → yerel degisim geri alinir" ancak boyle OLCULUR.
    $transaction: async (fn: any) => {
      const kopya = p.abonelikler.map((a) => ({ ...a }));
      const olayBoyu = olaylar.length;
      const denetimBoyu = denetimler.length;
      try {
        return await fn(db);
      } catch (e) {
        p.abonelikler.splice(0, p.abonelikler.length, ...kopya);
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
  return { ab, pd, yd, panel, ep };
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
}

async function blok(ad: string, fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch (e: any) {
    check(`${ad} BLOGU COKTU`, false, e?.stack ?? String(e));
  }
}

async function main(): Promise<void> {
  console.log('YONETICI PAKET ISLEMLERI (A2) — kapi');
  await blok('K', kBlogu);
  await blok('D', dBlogu);
  await blok('P', pBlogu);
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
}

main().catch((e) => {
  console.error('KAPI COKTU:', e);
  process.exitCode = 1;
});
