/**
 * ODEME TARAFI — VERI IMHASI TURU  (`npm run test:odeme-imha`)
 *
 * AG/DB GEREKTIRMEZ: PrismaService yerine sahte nesneler konur, GERCEK
 * servisler cagrilir ve DAVRANIS olculur.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Plan 5.8 (veri imhasi) iki olculmus kusuru kapatiyor:
 *
 *  K4 · FATURA KENDI KOPYASINI TASIMIYORDU (brief §6)
 *      `fatura.servisi.tekFatura` musteri kimligini `prisma.firma` satirindan
 *      O AN okuyordu. Fatura ise TAHSILAT aninda yazilip kesim @Cron ile
 *      SONRA kosuyor (hata halinde 10 saate kadar geri cekilerek, ayrica
 *      `yenidenDene` ile aylar sonra). Sonuc: musteri adresini degistirince
 *      GECEN YILIN faturasi da yeni adresi gosteriyordu — VUK md. 230
 *      faturada musterinin unvanini, ADRESINI, vergi dairesini ve numarasini
 *      sart kosar ve fatura KESILDIGI ANIN bilgisini tasimak zorundadir.
 *      Ikincisi: imha firma satirini bosaltinca saklanan faturalar eksik
 *      kalirdi (yasal saklama bozulur).
 *
 *  §4.6 · ODEME GECINCE HESAP GERI ACILMIYORDU
 *      Olculdu: `backend/src/ozellik/odeme/` altinda `deletedAt` kelimesi
 *      HIC GECMIYORDU. Kapatilan hesabin 30 gun icinde geri donmesinin TEK
 *      yolu paket satin almak (K1) — ama odeme gecse bile kapatma izleri
 *      duruyordu.
 *
 * ── OLCULEN ────────────────────────────────────────────────────────────
 *   D1  SAF  faturaMusteriKopyasiCikar: unvan ?? ad, bosluk-only → null
 *   D2  SAF  kopyadanMusteri kopyadan okur (imzasinda firma parametresi YOK)
 *   D3  SAF  kopya/teslim adresi eksikse FaturaKopyasiEksikHatasi
 *   D4  ⭐  kuyrugaAl 7 alani TAHSILAT aninda fatura satirina YAZIYOR
 *   D5  ⭐⭐ ADRES DEGISINCE ESKI FATURA DEGISMIYOR (asil kanit)
 *   D6  ⭐  firma satiri BOSALTILINCA fatura hala TAM okunuyor
 *   D7  ⭐  KAYNAK KAPISI: tekFatura'da canli `firma.<kimlik alani>` KALMADI
 *   D8  ⭐  firma satiri SILINMIS olsa da tekFatura cokmuyor (findUnique)
 *   D9  SAF  geri acilan nedenler KAPALI liste: [kendi, firmaKapandi]
 *   D10 ⭐  firmayiGeriAc dogru alanlari temizliyor (Firma + User)
 *   D11 ⭐⭐ ekiptenCikarildi / yonetici GERI GELMIYOR (suzgec kanit)
 *   D12 ⭐  passwordChangedAt · email · status'e DOKUNULMUYOR
 *   D13 ⭐  idempotent: acik hesapta olay YAZILMIYOR
 *   D14 ⭐⭐ KABLOLAMA: KART satin alma yolu geri acmayi GERCEKTEN cagiriyor
 *   D15 ⭐  KABLOLAMA: erisimiUzat (havale) geri acmayi AYNI tx ile cagiriyor
 *   D16 ⭐  KABLOLAMA: tahsilatBasarili (webhook yenileme) de cagiriyor
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { KapatmaNedeni } from '@prisma/client';
import {
  FaturaServisi,
  FaturaKopyasiEksikHatasi,
  faturaMusteriKopyasiCikar,
  kopyadanMusteri,
} from '../src/ozellik/odeme/fatura/fatura.servisi';
import {
  AbonelikServisi,
  GERI_ACILAN_KAPATMA_NEDENLERI,
} from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { SatinAlmaServisi } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { DenemeHakkiServisi } from '../src/ozellik/odeme/abonelik/deneme-hakki.servisi';
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

/* ═══════════════════════════════════════════════════════════════════════
   Sahte firma satirlari
   ═══════════════════════════════════════════════════════════════════════ */

/** Tahsilat ANINDAKI firma: Kadikoy adresi. */
const FIRMA_ESKI = {
  ad: 'acme',
  unvan: 'Acme Muhendislik Ltd. Sti.',
  vergiNo: '1234567890',
  vergiDairesi: 'Kadikoy',
  tcKimlikNo: null as string | null,
  faturaAdresi: 'Eski Mah. 1. Sok. No 2',
  il: 'Istanbul',
  ilce: 'Kadikoy',
  faturaEposta: 'muhasebe@acme.test',
  yetkiliEposta: 'sahip@acme.test',
};

/** Musteri seneye TASINDI. Eski faturanin bunu GORMEMESI gerekir. */
const FIRMA_YENI = {
  ...FIRMA_ESKI,
  unvan: 'Acme Muhendislik A.S.',
  vergiDairesi: 'Cankaya',
  faturaAdresi: 'Yeni Cad. 99',
  il: 'Ankara',
  ilce: 'Cankaya',
};

/** C'nin imha isi firma satirini BOSALTTIKTAN sonraki hal (§5.2). */
const FIRMA_IMHA_EDILMIS = {
  ad: '',
  unvan: null,
  vergiNo: null,
  vergiDairesi: null,
  tcKimlikNo: null,
  faturaAdresi: null,
  il: null,
  ilce: null,
  faturaEposta: null,
  yetkiliEposta: null,
};

/**
 * K4 yolunu ucdan uca kosturan sahte Prisma.
 * `firmaKutusu.deger` ile firma satiri TEST ORTASINDA degistirilebilir —
 * gercek dunyadaki "musteri adresini guncelledi" olayi budur.
 */
function sahteFaturaPrisma(firmaKutusu: { deger: any }) {
  const yazilanFaturalar: any[] = [];
  const guncellemeler: any[] = [];
  return {
    yazilanFaturalar,
    guncellemeler,
    db: {
      abonelik: {
        findUnique: async (_a: any) => ({ firma: firmaKutusu.deger }),
      },
      firma: {
        findUnique: async (_a: any) => firmaKutusu.deger,
      },
      fatura: {
        create: async (a: any) => {
          yazilanFaturalar.push(a.data);
          return a.data;
        },
        findUniqueOrThrow: async (_a: any) => ({
          denemeSayisi: 0,
          ...yazilanFaturalar[0],
          id: 'fat-1',
          abonelik: {
            firmaId: 'f1',
            paketSurumu: { paket: { ad: 'Pro Mekanik' } },
          },
        }),
        update: async (a: any) => {
          guncellemeler.push(a.data);
          return a.data;
        },
        // 24.09: `tekFatura` satırı işlemeden önce KİRALAR (koşullu yazma,
        // `test:yonetim-epostalari` E16). Bu kapının konusu değil: kira alınır.
        updateMany: async () => ({ count: 1 }),
      },
    } as any,
  };
}

/** Muhasebe adaptorune GIDEN govdeyi yakalar. */
function sahteMuhasebe() {
  const talepler: any[] = [];
  return {
    talepler,
    adaptor: {
      ad: 'sahte',
      faturaKes: async (t: any) => {
        talepler.push(t);
        return { saglayiciId: 's-1', faturaNo: 'TEST000001' };
      },
    } as any,
  };
}

const SESSIZ_EPOSTA = { gonder: async () => undefined } as any;

/* ═══════════════════════════════════════════════════════════════════════
   §4.6 — geri acma yolunu olcen sahte Prisma
   ═══════════════════════════════════════════════════════════════════════ */

function sahteGeriAcmaPrisma(p: {
  firmaKapaliMi?: boolean;
  acilacakKullanici?: number;
  atlanacakKullanici?: number;
}) {
  const cagrilar: any = {
    firmaUpdateMany: [] as any[],
    userUpdateMany: [] as any[],
    userCount: [] as any[],
    olaylar: [] as any[],
    txKullanildi: false,
  };
  const yuzey = {
    firma: {
      updateMany: async (a: any) => {
        cagrilar.firmaUpdateMany.push(a);
        return { count: p.firmaKapaliMi ? 1 : 0 };
      },
    },
    user: {
      updateMany: async (a: any) => {
        cagrilar.userUpdateMany.push(a);
        return { count: p.acilacakKullanici ?? 0 };
      },
      count: async (a: any) => {
        cagrilar.userCount.push(a);
        return p.atlanacakKullanici ?? 0;
      },
    },
    abonelikOlayi: {
      create: async (a: any) => {
        cagrilar.olaylar.push(a.data);
        return a.data;
      },
    },
  };
  const db = {
    ...yuzey,
    $transaction: async (fn: any) => {
      cagrilar.txKullanildi = true;
      return fn(yuzey);
    },
  } as any;
  return { cagrilar, db, yuzey };
}

/* ═══════════════════════════════════════════════════════════════════════ */

async function main() {
  // ── D1 · SAF: kopya cikarma ─────────────────────────────────────────
  console.log('\n── D1 · faturaMusteriKopyasiCikar (SAF) ──');
  const k1 = faturaMusteriKopyasiCikar(FIRMA_ESKI);
  check(
    'D1.1 unvan varsa unvan yazilir (gorunen `ad` DEGIL)',
    k1.musteriUnvan === 'Acme Muhendislik Ltd. Sti.',
    `donen=${k1.musteriUnvan}`,
  );
  check(
    'D1.2 7 VUK alaninin hepsi kopyalanir',
    k1.musteriVergiNo === '1234567890' &&
      k1.musteriVergiDairesi === 'Kadikoy' &&
      k1.musteriAdres === 'Eski Mah. 1. Sok. No 2' &&
      k1.musteriIl === 'Istanbul' &&
      k1.musteriIlce === 'Kadikoy',
    JSON.stringify(k1),
  );
  check(
    'D1.3 unvan YOKSA gorunen `ad`a duser (sema kurali)',
    faturaMusteriKopyasiCikar({ ...FIRMA_ESKI, unvan: null }).musteriUnvan === 'acme',
  );
  check(
    'D1.4 ⭐ bosluk-only deger null olur (imha `\'\'` birakmasin)',
    faturaMusteriKopyasiCikar({ ...FIRMA_ESKI, unvan: '   ', ad: '  ' })
      .musteriUnvan === null,
  );
  check(
    'D1.5 firma satiri YOKSA tum alanlar null (cokmez)',
    faturaMusteriKopyasiCikar(null).musteriUnvan === null,
  );

  // ── D2 · SAF: kopyadan okuma ────────────────────────────────────────
  console.log('\n── D2 · kopyadanMusteri (SAF) ──');
  const m2 = kopyadanMusteri(k1, 'muhasebe@acme.test');
  check(
    'D2.1 unvan/vergi/adres/il/ilce KOPYADAN gelir',
    m2.unvan === 'Acme Muhendislik Ltd. Sti.' &&
      m2.vergiNo === '1234567890' &&
      m2.vergiDairesi === 'Kadikoy' &&
      m2.adres === 'Eski Mah. 1. Sok. No 2' &&
      m2.il === 'Istanbul' &&
      m2.ilce === 'Kadikoy',
    JSON.stringify(m2),
  );
  check(
    'D2.2 ⭐ imzasinda FIRMA parametresi YOK (canli okuma yolu kapali)',
    kopyadanMusteri.length === 2,
    `arite=${kopyadanMusteri.length}`,
  );
  check(
    'D2.3 null alanlar undefined olur (adaptor sozlesmesi)',
    kopyadanMusteri({ ...k1, musteriTcKimlikNo: null }, 'a@b.test').tcKimlikNo ===
      undefined,
  );

  // ── D3 · SAF: eksik kopya SESSIZ gecilmez ───────────────────────────
  console.log('\n── D3 · eksik kopya → FaturaKopyasiEksikHatasi ──');
  let d3a = 'YOK';
  try {
    kopyadanMusteri({ ...k1, musteriUnvan: null }, 'a@b.test');
  } catch (e: any) {
    d3a = e?.constructor?.name ?? 'BILINMEYEN';
  }
  check('D3.1 unvan yoksa hata firlar', d3a === 'FaturaKopyasiEksikHatasi', d3a);
  let d3b = 'YOK';
  try {
    kopyadanMusteri(k1, null);
  } catch (e: any) {
    d3b = e?.constructor?.name ?? 'BILINMEYEN';
  }
  check('D3.2 teslim e-postasi yoksa hata firlar', d3b === 'FaturaKopyasiEksikHatasi', d3b);
  check(
    'D3.3 hata sinifi disa acik (cagiran ayirt edebilsin)',
    typeof FaturaKopyasiEksikHatasi === 'function',
  );

  // ── D4 ⭐ DAVRANIS: kuyrugaAl kopyayi YAZIYOR ───────────────────────
  console.log('\n── D4 ⭐ kuyrugaAl tahsilat aninda kopyalar ──');
  const kutu4 = { deger: FIRMA_ESKI as any };
  const p4 = sahteFaturaPrisma(kutu4);
  const mu4 = sahteMuhasebe();
  const fs4 = new FaturaServisi(p4.db, mu4.adaptor, SESSIZ_EPOSTA);
  await fs4.kuyrugaAl({
    abonelikId: 'ab-1',
    tahsilatKodu: 'ord-1',
    tutar: 1200,
    paraBirimi: 'TRY',
    donemBasi: new Date('2026-09-01'),
    donemSonu: new Date('2026-10-01'),
  });
  const yazilan = p4.yazilanFaturalar[0] ?? {};
  check(
    'D4.1 ⭐ 7 musteri alani fatura satirina YAZILDI',
    yazilan.musteriUnvan === 'Acme Muhendislik Ltd. Sti.' &&
      yazilan.musteriVergiNo === '1234567890' &&
      yazilan.musteriVergiDairesi === 'Kadikoy' &&
      yazilan.musteriAdres === 'Eski Mah. 1. Sok. No 2' &&
      yazilan.musteriIl === 'Istanbul' &&
      yazilan.musteriIlce === 'Kadikoy' &&
      'musteriTcKimlikNo' in yazilan,
    JSON.stringify({
      unvan: yazilan.musteriUnvan,
      adres: yazilan.musteriAdres,
      il: yazilan.musteriIl,
    }),
  );
  check(
    'D4.2 tutar/KDV ayristirmasi bozulmadi (mevcut davranis korundu)',
    Number(yazilan.toplamTutar) === 1200 && Number(yazilan.tutar) === 1000,
    `tutar=${yazilan.tutar} toplam=${yazilan.toplamTutar}`,
  );

  // ── D5 ⭐⭐ ASIL KANIT: adres degisti, ESKI fatura degismedi ────────
  console.log('\n── D5 ⭐⭐ firma adresi degisti → eski fatura DEGISMIYOR ──');
  // Musteri tasindi: fatura kuyruga alindiktan SONRA firma satiri degisti.
  kutu4.deger = FIRMA_YENI;
  await (fs4 as any).tekFatura('fat-1');
  const giden = mu4.talepler[0]?.musteri ?? {};
  check(
    'D5.1 ⭐⭐ muhasebeye giden ADRES tahsilat anindaki adres',
    giden.adres === 'Eski Mah. 1. Sok. No 2',
    `giden=${giden.adres} (yeni firma adresi: ${FIRMA_YENI.faturaAdresi})`,
  );
  check(
    'D5.2 ⭐⭐ UNVAN da donmus (unvan degisikligi gecmise yansimiyor)',
    giden.unvan === 'Acme Muhendislik Ltd. Sti.',
    `giden=${giden.unvan}`,
  );
  check(
    'D5.3 ⭐⭐ VERGI DAIRESI ve IL/ILCE de donmus',
    giden.vergiDairesi === 'Kadikoy' &&
      giden.il === 'Istanbul' &&
      giden.ilce === 'Kadikoy',
    JSON.stringify({ vd: giden.vergiDairesi, il: giden.il, ilce: giden.ilce }),
  );
  check(
    'D5.4 fatura KESILDI olarak isaretlendi (mutlu yol gercekten kostu)',
    p4.guncellemeler.some((g) => g.durum === 'KESILDI'),
    JSON.stringify(p4.guncellemeler.map((g) => g.durum)),
  );
  check(
    'D5.5 TESLIM e-postasi ise CANLI okunur (fatura icerigi degil)',
    giden.eposta === 'muhasebe@acme.test',
    `giden=${giden.eposta}`,
  );

  // ── D6 ⭐ imha sonrasi: saklanan fatura hala TAM ────────────────────
  console.log('\n── D6 ⭐ firma satiri BOSALTILDI → fatura hala tam ──');
  const saklanan = {
    musteriUnvan: yazilan.musteriUnvan,
    musteriVergiDairesi: yazilan.musteriVergiDairesi,
    musteriVergiNo: yazilan.musteriVergiNo,
    musteriTcKimlikNo: yazilan.musteriTcKimlikNo,
    musteriAdres: yazilan.musteriAdres,
    musteriIl: yazilan.musteriIl,
    musteriIlce: yazilan.musteriIlce,
  };
  const bosFirmaKopyasi = faturaMusteriKopyasiCikar(FIRMA_IMHA_EDILMIS);
  check(
    'D6.1 ON KOSUL: imha edilmis firmadan kopya cikarilsa BOS olurdu',
    bosFirmaKopyasi.musteriUnvan === null && bosFirmaKopyasi.musteriAdres === null,
    JSON.stringify(bosFirmaKopyasi),
  );
  // ⚠ try/catch: kopya HIC yazilmamissa `kopyadanMusteri` firlatir. Mutasyon
  // turunda bu paketin GERI KALANI da kosmali ki kirmizinin kapsami gorunsun.
  let okunan: any = {};
  try {
    okunan = kopyadanMusteri(saklanan, 'arsiv@metapricex.test');
  } catch (e: any) {
    okunan = { hata: e?.message };
  }
  check(
    'D6.2 ⭐ firma bombos iken bile VUK md. 230 alanlari TAM okunuyor',
    okunan.unvan === 'Acme Muhendislik Ltd. Sti.' &&
      okunan.vergiNo === '1234567890' &&
      okunan.vergiDairesi === 'Kadikoy' &&
      okunan.adres === 'Eski Mah. 1. Sok. No 2' &&
      okunan.il === 'Istanbul' &&
      okunan.ilce === 'Kadikoy',
    JSON.stringify(okunan),
  );

  // ── D7 ⭐ KAYNAK KAPISI: canli kimlik okumasi KALMADI ───────────────
  console.log('\n── D7 ⭐ kaynak kapisi: tekFatura firma kimligi okumuyor ──');
  const kaynak = readFileSync(
    join(__dirname, '..', 'src', 'ozellik', 'odeme', 'fatura', 'fatura.servisi.ts'),
    'utf-8',
  );
  // Kesim govdesi: `tekFatura` metodunun basindan `yonetimeHaberVer`e kadar.
  const govde = kaynak.split('private async tekFatura(')[1]?.split('private async yonetimeHaberVer')[0] ?? '';
  check('D7.0 ON KOSUL: tekFatura govdesi bulundu', govde.length > 400, `uzunluk=${govde.length}`);
  const yasakli = [
    'firma.unvan',
    'firma.vergiNo',
    'firma.vergiDairesi',
    'firma.tcKimlikNo',
    'firma.faturaAdresi',
    'firma.ilce',
  ];
  const kalanlar = yasakli.filter((y) => govde.includes(y));
  check(
    'D7.1 ⭐ kesim govdesinde CANLI firma kimligi okumasi YOK',
    kalanlar.length === 0,
    `kalan=${kalanlar.join(', ')}`,
  );
  check(
    'D7.2 ⭐ kesim kimligi kopyadan aliyor (kopyadanMusteri cagrisi var)',
    govde.includes('kopyadanMusteri('),
  );
  check(
    'D7.3 ⭐ findUniqueOrThrow → findUnique (bosaltilmis satir cokertmesin)',
    !govde.includes('firma.findUniqueOrThrow'),
  );

  // ── D8 ⭐ firma satiri SILINMIS: cokme yok, gurultulu hata var ──────
  console.log('\n── D8 ⭐ firma satiri okunamiyor → ELLE_MUDAHALE merdiveni ──');
  const kutu8 = { deger: FIRMA_ESKI as any };
  const p8 = sahteFaturaPrisma(kutu8);
  const mu8 = sahteMuhasebe();
  const fs8 = new FaturaServisi(p8.db, mu8.adaptor, SESSIZ_EPOSTA);
  await fs8.kuyrugaAl({
    abonelikId: 'ab-1',
    tahsilatKodu: 'ord-8',
    tutar: 120,
    paraBirimi: 'TRY',
    donemBasi: new Date(),
    donemSonu: new Date(),
  });
  kutu8.deger = null; // firma satiri artik okunamiyor
  let d8Patladi = false;
  try {
    await (fs8 as any).tekFatura('fat-1');
  } catch {
    d8Patladi = true;
  }
  check('D8.1 ⭐ tekFatura COKMUYOR (hata kuyruk merdivenine dusuyor)', !d8Patladi);
  check(
    'D8.2 ⭐ fatura kesilmedi, HATA durumuna alindi (sessiz gecmedi)',
    p8.guncellemeler.some((g) => g.durum === 'HATA' || g.durum === 'ELLE_MUDAHALE'),
    JSON.stringify(p8.guncellemeler.map((g) => g.durum)),
  );
  check(
    'D8.3 ⭐ yanlis kimlikle fatura KESILMEDI (muhasebeye gidilmedi)',
    mu8.talepler.length === 0,
    `cagri=${mu8.talepler.length}`,
  );

  // ── D9 · SAF: geri acilan nedenler KAPALI liste ─────────────────────
  console.log('\n── D9 · GERI_ACILAN_KAPATMA_NEDENLERI ──');
  check(
    'D9.1 ⭐ tam olarak [kendi, firmaKapandi]',
    GERI_ACILAN_KAPATMA_NEDENLERI.length === 2 &&
      GERI_ACILAN_KAPATMA_NEDENLERI.includes(KapatmaNedeni.kendi) &&
      GERI_ACILAN_KAPATMA_NEDENLERI.includes(KapatmaNedeni.firmaKapandi),
    GERI_ACILAN_KAPATMA_NEDENLERI.join(','),
  );
  check(
    'D9.2 ⭐ ekiptenCikarildi listede DEGIL (brief §3.3.5)',
    !GERI_ACILAN_KAPATMA_NEDENLERI.includes(KapatmaNedeni.ekiptenCikarildi),
  );
  check(
    'D9.3 ⭐ yonetici listede DEGIL (ceza parayla geri alinmaz)',
    !GERI_ACILAN_KAPATMA_NEDENLERI.includes(KapatmaNedeni.yonetici),
  );

  // ── D10-D12 ⭐ DAVRANIS: firmayiGeriAc ──────────────────────────────
  console.log('\n── D10-D12 ⭐ firmayiGeriAc ──');
  const g10 = sahteGeriAcmaPrisma({
    firmaKapaliMi: true,
    acilacakKullanici: 3,
    atlanacakKullanici: 1,
  });
  const as10 = new AbonelikServisi(g10.db, {} as any);
  const s10 = await as10.firmayiGeriAc('f1', {
    aktor: 'sistem',
    aciklama: 'Paket satin alindi',
    abonelikId: 'ab-1',
  });
  check(
    'D10.1 Firma.imhaTarihi temizlendi',
    g10.cagrilar.firmaUpdateMany[0]?.data?.imhaTarihi === null,
    JSON.stringify(g10.cagrilar.firmaUpdateMany[0]?.data),
  );
  const uData = g10.cagrilar.userUpdateMany[0]?.data ?? {};
  const uWhere = g10.cagrilar.userUpdateMany[0]?.where ?? {};
  check(
    'D10.2 ⭐ User.deletedAt + imhaTarihi + kapatmaNedeni HEPSI temizlendi',
    uData.deletedAt === null &&
      uData.imhaTarihi === null &&
      uData.kapatmaNedeni === null,
    JSON.stringify(uData),
  );
  check(
    'D10.3 kapsam firmaya SINIRLI (baska firmanin satirina dokunulmaz)',
    uWhere.firmaId === 'f1',
    JSON.stringify(uWhere),
  );
  check(
    'D10.4 transaction icinde kosuyor (yarim geri acma yok)',
    g10.cagrilar.txKullanildi === true,
  );
  check(
    'D10.5 sonuc SAYI dondurur',
    s10.firmaAcildi === true && s10.acilanKullanici === 3 && s10.atlananKullanici === 1,
    JSON.stringify(s10),
  );

  const izinliler = uWhere.kapatmaNedeni?.in ?? [];
  check(
    'D11.1 ⭐⭐ suzgec KAPALI liste: yalniz kendi + firmaKapandi',
    Array.isArray(izinliler) &&
      izinliler.length === 2 &&
      izinliler.includes(KapatmaNedeni.kendi) &&
      izinliler.includes(KapatmaNedeni.firmaKapandi),
    JSON.stringify(izinliler),
  );
  check(
    'D11.2 ⭐⭐ ekiptenCikarildi suzgecte YOK → geri GELMEZ',
    !izinliler.includes(KapatmaNedeni.ekiptenCikarildi),
    JSON.stringify(izinliler),
  );
  check(
    'D11.3 ⭐ yonetici de suzgecte YOK',
    !izinliler.includes(KapatmaNedeni.yonetici),
  );
  check(
    'D11.4 ⭐ nedeni NULL olan eski kapali hesap da acilmaz (in-suzgeci disi)',
    // `in` listesi null icermez: Prisma `in` NULL ile eslesmez.
    !izinliler.includes(null as any),
  );

  const sayimWhere = g10.cagrilar.userCount[0]?.where ?? {};
  check(
    'D11.5 ⭐ atlanan sayimi nedeni NULL olani da SAYIYOR (NOT+IN NULL yutar)',
    Array.isArray(sayimWhere.OR) &&
      sayimWhere.OR.some((k: any) => k.kapatmaNedeni === null) &&
      sayimWhere.OR.some((k: any) => k.NOT?.kapatmaNedeni?.in),
    JSON.stringify(sayimWhere),
  );

  check(
    'D12.1 ⭐ passwordChangedAt GERI ALINMIYOR (eski token dirilmesin)',
    !('passwordChangedAt' in uData),
    JSON.stringify(Object.keys(uData)),
  );
  check(
    'D12.2 ⭐ email / kapatilanEposta yazilmiyor (@unique carpismasi riski)',
    !('email' in uData) && !('kapatilanEposta' in uData),
    JSON.stringify(Object.keys(uData)),
  );
  check(
    'D12.3 ⭐ status (banned) degistirilmiyor',
    !('status' in uData),
    JSON.stringify(Object.keys(uData)),
  );
  check(
    'D12.4 olay kaydi SAYI tasiyor, kisisel icerik TASIMIYOR',
    g10.cagrilar.olaylar[0]?.tip === 'hesap.geri.acildi' &&
      typeof (g10.cagrilar.olaylar[0]?.veri as any)?.acilanKullanici === 'number' &&
      !JSON.stringify(g10.cagrilar.olaylar[0]?.veri ?? {}).includes('@'),
    JSON.stringify(g10.cagrilar.olaylar[0]),
  );

  // ── D13 ⭐ idempotent ───────────────────────────────────────────────
  console.log('\n── D13 ⭐ idempotent: acik hesapta gurultu yok ──');
  const g13 = sahteGeriAcmaPrisma({
    firmaKapaliMi: false,
    acilacakKullanici: 0,
    atlanacakKullanici: 0,
  });
  const as13 = new AbonelikServisi(g13.db, {} as any);
  const s13 = await as13.firmayiGeriAc('f1', {
    aktor: 'sistem',
    aciklama: 'Paket satin alindi',
    abonelikId: 'ab-1',
  });
  check(
    'D13.1 ⭐ hicbir sey kapali degilse OLAY YAZILMIYOR',
    g13.cagrilar.olaylar.length === 0,
    `olay=${g13.cagrilar.olaylar.length}`,
  );
  check(
    'D13.2 sonuc bos donuyor',
    s13.firmaAcildi === false && s13.acilanKullanici === 0,
    JSON.stringify(s13),
  );

  // ── D14 ⭐⭐ KABLOLAMA: KART satin alma yolu ────────────────────────
  console.log('\n── D14 ⭐⭐ KART yolu geri acmayi GERCEKTEN cagiriyor ──');
  const geriAcmaCagrilari: any[] = [];
  const sahteAbonelikServisi = {
    firmayiGeriAc: async (firmaId: string, pp: any) => {
      geriAcmaCagrilari.push({ firmaId, ...pp });
      return { firmaAcildi: true, acilanKullanici: 1, atlananKullanici: 0 };
    },
  } as any;

  const niyet = {
    id: 'n1',
    token: 'tok-1',
    firmaId: 'f1',
    paketSurumuId: 's1',
    olusturanId: 'u1',
    durum: 'BEKLIYOR',
    denemeGunu: 0,
    planKodu: 'plan-1-denemesiz',
    epostaNormal: 'ayse@ornek.com',
    formEpostaNormal: 'ayse@ornek.com',
    telefonNormal: '+905301234567',
    sozlesmeSurumu: 'v1',
    iyzicoAbonelikKodu: null as string | null,
    paketSurumu: { denemeGunu: 30, paket: { kod: 'pro-mek', ad: 'Pro Mekanik' } },
  };
  const olusanAbonelikler: any[] = [];
  const satinalmaPrisma = {
    abonelikBaslatma: {
      findUnique: async () => niyet,
      findUniqueOrThrow: async () => niyet,
      update: async (a: any) => a.data,
    },
    abonelik: {
      findUnique: async () => null,
      create: async (a: any) => {
        olusanAbonelikler.push(a.data);
        return { id: 'ab-yeni', ...a.data };
      },
    },
    denemeKullanimi: { upsert: async () => ({}) },
    firma: {
      findUnique: async () => ({ ad: 'acme', faturaEposta: null, yetkiliEposta: 's@a.test' }),
    },
    abonelikOlayi: { create: async () => ({}) },
  } as any;
  const satinalmaIyzico = {
    formSonucu: async () => ({
      referenceCode: 'sub-1',
      subscriptionStatus: 'ACTIVE',
      customerReferenceCode: 'cus-1',
      pricingPlanReferenceCode: 'plan-1-denemesiz',
    }),
  } as any;
  const sa = new SatinAlmaServisi(
    satinalmaPrisma,
    satinalmaIyzico,
    sahteAbonelikServisi,
    new ConfigService({ UYGULAMA_URL: 'https://ornek.test' }),
    new DenemeHakkiServisi(satinalmaPrisma),
    SESSIZ_EPOSTA,
  );
  const d14Sonuc = await sa.donus('tok-1', 'f1');
  check(
    'D14.0 ON KOSUL: satin alma GERCEKTEN tamamlandi',
    d14Sonuc?.durum === 'TAMAMLANDI' && olusanAbonelikler.length === 1,
    JSON.stringify(d14Sonuc),
  );
  check(
    'D14.1 ⭐⭐ odeme gecince firmayiGeriAc CAGRILDI',
    geriAcmaCagrilari.length === 1,
    `cagri=${geriAcmaCagrilari.length}`,
  );
  check(
    'D14.2 ⭐ dogru firma ile cagrildi',
    geriAcmaCagrilari[0]?.firmaId === 'f1',
    JSON.stringify(geriAcmaCagrilari[0]),
  );
  check(
    'D14.3 ⭐ olay kaydi icin abonelik kimligi tasiniyor',
    geriAcmaCagrilari[0]?.abonelikId === 'ab-yeni',
    JSON.stringify(geriAcmaCagrilari[0]),
  );

  // ── D15 ⭐ KABLOLAMA: havale yolu (erisimiUzat) ─────────────────────
  console.log('\n── D15 ⭐ erisimiUzat geri acmayi AYNI tx ile cagiriyor ──');
  const g15 = sahteGeriAcmaPrisma({
    firmaKapaliMi: true,
    acilacakKullanici: 2,
    atlanacakKullanici: 0,
  });
  // Havalenin verdigi transaction istemcisi — geri acma BUNU kullanmali.
  const txCagrilari: any = { firma: [], user: [], olay: [] };
  const havaleTx = {
    firma: {
      updateMany: async (a: any) => {
        txCagrilari.firma.push(a);
        return { count: 1 };
      },
    },
    user: {
      updateMany: async (a: any) => {
        txCagrilari.user.push(a);
        return { count: 2 };
      },
      count: async () => 0,
    },
    abonelik: {
      findUniqueOrThrow: async () => ({
        id: 'ab-1',
        firmaId: 'f1',
        durum: 'ASKIDA',
        erisimSonu: new Date('2026-01-01'),
      }),
      update: async (a: any) => ({ id: 'ab-1', ...a.data }),
    },
    abonelikOlayi: {
      create: async (a: any) => {
        txCagrilari.olay.push(a.data);
        return a.data;
      },
    },
  } as any;
  const as15 = new AbonelikServisi(g15.db, {} as any);
  await as15.erisimiUzat('ab-1', 12, {
    aktor: 'yonetici-1',
    aciklama: 'Havale onayi — TKF-1 (12 ay)',
    tx: havaleTx,
  });
  check(
    'D15.1 ⭐ geri acma havalenin TX istemcisiyle kostu',
    txCagrilari.firma.length === 1 && txCagrilari.user.length === 1,
    `firma=${txCagrilari.firma.length} user=${txCagrilari.user.length}`,
  );
  check(
    'D15.2 ⭐ AYRI bir transaction ACILMADI (tx verildiginde $transaction yok)',
    g15.cagrilar.txKullanildi === false,
  );
  check(
    'D15.3 ⭐ tx disindaki prisma yuzeyine HIC yazilmadi',
    g15.cagrilar.firmaUpdateMany.length === 0 &&
      g15.cagrilar.userUpdateMany.length === 0,
    `firma=${g15.cagrilar.firmaUpdateMany.length} user=${g15.cagrilar.userUpdateMany.length}`,
  );
  check(
    'D15.4 ⭐ hem geri acma hem durum degisikligi olayi yazildi',
    txCagrilari.olay.some((o: any) => o.tip === 'hesap.geri.acildi') &&
      txCagrilari.olay.some((o: any) => o.tip === 'durum.degisti'),
    JSON.stringify(txCagrilari.olay.map((o: any) => o.tip)),
  );

  // ── D16 ⭐ KABLOLAMA: webhook yenileme ──────────────────────────────
  console.log('\n── D16 ⭐ tahsilatBasarili da geri aciyor ──');
  const w16: any = { firma: [], user: [], olay: [] };
  const wPrisma = {
    abonelik: {
      findUnique: async () => ({
        id: 'ab-1',
        firmaId: 'f1',
        durum: 'ASKIDA',
        erisimSonu: new Date('2026-01-01'),
        paketSurumu: { periyot: 'MONTHLY', periyotAdedi: 1 },
      }),
      findUniqueOrThrow: async () => ({
        id: 'ab-1',
        firmaId: 'f1',
        durum: 'ASKIDA',
        erisimSonu: new Date('2026-01-01'),
      }),
      update: async (a: any) => ({ id: 'ab-1', ...a.data }),
      // 24.09: `tahsilatBasarili` dunning döngüsünü KOŞULLU sıfırlar (satır
      // sayısı = "ödemeniz alındı" kararı, `test:dunning-toparlandi`). Bu
      // kapının konusu değil: döngüde olmayan satır gibi davranır.
      updateMany: async () => ({ count: 0 }),
    },
    firma: {
      updateMany: async (a: any) => {
        w16.firma.push(a);
        return { count: 1 };
      },
    },
    user: {
      updateMany: async (a: any) => {
        w16.user.push(a);
        return { count: 1 };
      },
      count: async () => 0,
    },
    abonelikOlayi: {
      create: async (a: any) => {
        w16.olay.push(a.data);
        return a.data;
      },
    },
    $transaction: async (fn: any) => fn(wPrismaYuzey),
  } as any;
  const wPrismaYuzey = wPrisma;
  // ⚠ 24.09: tahsilat yolu siparişin ÖDENDİĞİNİ ister (`odenmisSiparisMi`,
  // `test:webhook-tahsilat-dogrulama`) — 20.08 tutanağındaki biçim:
  // `orderStatus: 'SUCCESS'` + başarılı ödeme denemesi.
  const wIyzico = {
    abonelikGetir: async () => ({
      subscriptionStatus: 'ACTIVE',
      orders: [
        {
          referenceCode: 'ord-16',
          orderStatus: 'SUCCESS',
          paymentAttempts: [{ paymentStatus: 'SUCCESS' }],
          endPeriod: '2026-11-01T00:00:00Z',
          startPeriod: '2026-10-01T00:00:00Z',
        },
      ],
    }),
  } as any;
  const as16 = new AbonelikServisi(wPrisma, wIyzico);
  await as16.tahsilatBasarili('sub-1', 'ord-16');
  check(
    'D16.1 ⭐ basarili tahsilat sonrasi geri acma kostu',
    w16.firma.length === 1 && w16.user.length === 1,
    `firma=${w16.firma.length} user=${w16.user.length}`,
  );
  check(
    'D16.2 ⭐ geri acma olayi yazildi',
    w16.olay.some((o: any) => o.tip === 'hesap.geri.acildi'),
    JSON.stringify(w16.olay.map((o: any) => o.tip)),
  );

  // ── SONUC ───────────────────────────────────────────────────────────
  console.log(`\n── SONUC ── ${passed} gecti · ${failed} kaldi`);
  if (failures.length) {
    console.log('\nKALANLAR:');
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main().catch((e) => {
  console.error('BEKLENMEYEN HATA:', e);
  process.exitCode = 1;
}));
