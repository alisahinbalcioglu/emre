/**
 * FATURA KIMLIGI KAPISI — T47 (`npm run test:fatura-kimligi`)
 *
 * AG/DB GEREKTIRMEZ: PrismaService, IyzicoClient ve muhasebe adaptoru yerine
 * sahte nesneler konur; `SatinAlmaServisi.baslat` ve `FaturaServisi.tekFatura`
 * GERCEKTEN cagrilir ve DAVRANIS olculur.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * 22.09'da olculdu: "fatura bilgisi eksik bir firma gercek bir fatura kesme
 * noktasina geldiginde sistem ne yapiyor?" Cevap UC PARCALIYDI, ucu de kotu:
 *
 *   (1) SATIN ALMA YOLUNDAKI KAPI FATURA KAPISI DEGILDI. `eksikMusteriAlanlari`
 *       `ZORUNLU_MUSTERI_ALANLARI`ni (ad soyad eposta telefon kimlikNo sehir
 *       adres) olcer ve kodun KENDI yorumu bunu acikca soyler: "iyzico'nun
 *       abonelik formu icin ZORUNLU tuttugu alanlar". Faturada gereken unvan /
 *       vergi dairesi / ilce SORULMUYORDU.
 *
 *   (2) ⭐ `kimlikNo` TOPLANIYOR, IYZICO'YA GIDIYOR, DB'YE YAZILMIYORDU.
 *       `prisma.firma.update` yalniz unvan/yetkiliEposta/faturaAdresi/il/
 *       telefon yaziyordu. `Firma.tcKimlikNo` / `vergiNo` / `vergiDairesi`yi
 *       yazan TEK yol profil formuydu. Bu, 08.09'da olculen `Firma.telefon`
 *       kusurunun BIREBIR IKIZIDIR — ayni `update`, ayni alan listesi.
 *
 *   (3) ⭐⭐ KOPYA BOSKEN FATURA YINE DE KESILIYORDU. `kopyadanMusteri`
 *       yalniz `unvan` ve teslim e-postasi icin firliyordu; vergi kimligi
 *       uclusu `?? undefined` ile sessizce geciyordu. Ustelik o iki kapi
 *       pratikte HIC kapanmaz (`unvan ?? ad` ve `Firma.ad` NOT NULL;
 *       `yetkiliEposta` her satin almada yazilir). Yani K4'un gurultulu
 *       basarisizlik merdiveni KURULU ama bu kusur ona HIC ULASMIYORDU:
 *       muhasebeye `tax_number: undefined` gidiyor ve fatura kesiliyordu.
 *       VUK md. 230 musterinin vergi dairesi ve hesap numarasini (gercek kisi
 *       icin TCKN'yi) SART KOSAR — uretilen belge hukuken gecersizdi.
 *
 * SAHIS/LIMITED AYRIMI TUM DEPODA YOKTU (olculdu: backend/src'de
 * `sahis|limited|sirketTuru|mukellef|tuzel` taramasi YALNIZ IKI YORUM buluyor,
 * SIFIR kod). "Ikisinden biri yeterli mi, ikisi de bossa mi engelleniyor?"
 * sorusunun cevabi: NE BIRI GEREKLIYDI NE DE ENGELLEME VARDI.
 *
 * ── OLCULEN ────────────────────────────────────────────────────────────
 *   T1  SAF  kimlikTuru — 11 hane TCKN, 10 hane VKN, digeri bilinmiyor
 *   T2  SAF  vergiDairesiGerekli — sahiste HAYIR, tuzelde EVET
 *   T3  SAF  faturaKimligiAlanlari — dogru kolona esleme, `undefined`=DOKUNMA
 *   T4  ⭐ SAHIS (TCKN) satin alabiliyor — YOL KAPANMADI + TCKN DB'ye YAZILDI
 *   T5  ⭐ LIMITED vergi dairesiz: 400 + iyzico'ya SIFIR cagri + YAN ETKI YOK
 *   T6  ⭐ LIMITED vergi dairesiyle satin alabiliyor + VKN/VD DB'ye YAZILDI
 *   T7  ⭐ `??` semantigi — kayitli vergi kimligi EZILMIYOR
 *   T8  ⭐ kopyadanMusteri — vergi kimligi yoksa FIRLIYOR; sahiste GECIYOR
 *   T9  ⭐⭐ UCTAN UCA — eksik kimlikli firmanin faturasi KESILMIYOR,
 *           muhasebeye HIC gidilmiyor, ELLE_MUDAHALE merdivenine dusuyor
 *   T10 ⭐ BAGLANTI — "mekanizma var, cagiran yok" halini kapatir
 *   T11 ⭐ KVKK — veri indirme bu kapidan ETKILENMIYOR
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SatinAlmaServisi,
  ZORUNLU_MUSTERI_ALANLARI,
  faturaKimligiAlanlari,
  kimlikTuru,
  vergiDairesiGerekli,
} from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { DenemeHakkiServisi } from '../src/ozellik/odeme/abonelik/deneme-hakki.servisi';
import { ParasutAdaptoru } from '../src/ozellik/odeme/fatura/muhasebe.adaptor';
import {
  FaturaKopyasiEksikHatasi,
  FaturaServisi,
  kopyadanMusteri,
} from '../src/ozellik/odeme/fatura/fatura.servisi';

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

/**
 * Yorum satirlarini soyar — kapi kendi BELGESINI olcmesin.
 * (14.09 dersi: `/forgot-password` deseni KODDA degil ACIKLAMA yorumunda
 * eslesmisti ve mutant sagkaldi.)
 */
function yorumsuz(kaynak: string): string {
  return kaynak
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/* ═══════════════════════════════════════════════════════════════════════
   Sahte satin alma dunyasi
   ═══════════════════════════════════════════════════════════════════════ */

/** SAHIS: 11 haneli TCKN. Vergi dairesi ISTENMEZ (e-Arsiv, gercek kisi). */
const MUSTERI_SAHIS = {
  ad: 'Ayse',
  soyad: 'Yilmaz',
  eposta: 'ayse@ornek.com',
  telefon: '+905301234567',
  kimlikNo: '12345678901', // 11 hane
  sehir: 'Istanbul',
  adres: 'Ornek Mah. 1. Sok. No 2',
};

/** LIMITED: 10 haneli VKN. Vergi dairesi ZORUNLU (VUK md. 230). */
const MUSTERI_LIMITED = {
  ...MUSTERI_SAHIS,
  ad: 'Mehmet',
  soyad: 'Demir',
  kimlikNo: '1234567890', // 10 hane
};

/** Tum kimlik alanlari BOS firma — bugun kayit akisinin urettigi hal. */
const FIRMA_BOS = {
  unvan: null,
  yetkiliEposta: null,
  faturaAdresi: null,
  il: null,
  telefon: null,
  tcKimlikNo: null,
  vergiNo: null,
  vergiDairesi: null,
};

function sahteSatinAlmaPrisma(mevcutFirma: Record<string, unknown>) {
  const firmaGuncellemeleri: any[] = [];
  return {
    firmaGuncellemeleri,
    db: {
      paketSurumu: {
        findUnique: async () => ({
          id: 's1',
          iyzicoPlanKodu: 'plan-1',
          iyzicoDenemesizPlanKodu: 'plan-1-denemesiz',
          satistaMi: true,
          denemeGunu: 30,
          paket: { kod: 'pro-mek', ad: 'Pro Mekanik' },
        }),
      },
      user: {
        findUnique: async () => ({
          email: 'ayse@ornek.com',
          emailVerified: true,
        }),
      },
      denemeKullanimi: { findFirst: async () => null },
      abonelik: { findUnique: async () => null },
      firma: {
        findUnique: async () => mevcutFirma,
        update: async (a: any) => {
          firmaGuncellemeleri.push(a.data);
          return a.data;
        },
      },
      abonelikBaslatma: { create: async () => ({ id: 'n1' }) },
    } as any,
  };
}

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
    new DenemeHakkiServisi(prisma),
    { gonder: async () => undefined } as any,
  );
}

async function baslatSonucu(prisma: any, iyzico: any, musteri: any) {
  const servis = servisKur(prisma, iyzico);
  try {
    await servis.baslat({
      firmaId: 'f1',
      kullaniciId: 'u1',
      paketSurumuId: 's1',
      musteri,
      sozlesmeOnayi: true,
    });
    return { tip: 'BASARILI' as const, mesaj: '', kod: undefined as any };
  } catch (e: any) {
    if (e instanceof BadRequestException) {
      const y: any = e.getResponse();
      return {
        tip: 'BAD_REQUEST' as const,
        mesaj: String(typeof y === 'string' ? y : (y?.message ?? e.message)),
        kod: typeof y === 'object' ? y?.kod : undefined,
      };
    }
    return {
      tip: (e?.constructor?.name ?? 'BILINMEYEN') as any,
      mesaj: String(e?.message),
      kod: undefined as any,
    };
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Sahte fatura dunyasi (odeme-imha-test.ts deseniyle AYNI)
   ═══════════════════════════════════════════════════════════════════════ */

function sahteFaturaPrisma(firmaKutusu: { deger: any }) {
  const yazilanFaturalar: any[] = [];
  const guncellemeler: any[] = [];
  return {
    yazilanFaturalar,
    guncellemeler,
    db: {
      abonelik: { findUnique: async () => ({ firma: firmaKutusu.deger }) },
      firma: { findUnique: async () => firmaKutusu.deger },
      fatura: {
        create: async (a: any) => {
          yazilanFaturalar.push(a.data);
          return a.data;
        },
        findUniqueOrThrow: async () => ({
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

/** Bir tahsilati kuyruga alip kesimi kosturur; sonucu ozetler. */
async function faturaKesimi(firma: any) {
  const kutu = { deger: firma };
  const p = sahteFaturaPrisma(kutu);
  const mu = sahteMuhasebe();
  const fs = new FaturaServisi(p.db, mu.adaptor, SESSIZ_EPOSTA);
  await fs.kuyrugaAl({
    abonelikId: 'ab-1',
    tahsilatKodu: 'ord-1',
    tutar: 1200,
    paraBirimi: 'TRY',
    donemBasi: new Date('2026-09-01'),
    donemSonu: new Date('2026-10-01'),
  });
  let cokti = false;
  try {
    await (fs as any).tekFatura('fat-1');
  } catch {
    cokti = true;
  }
  return {
    cokti,
    muhasebeCagrisi: mu.talepler.length,
    giden: mu.talepler[0]?.musteri ?? {},
    durumlar: p.guncellemeler.map((g: any) => g.durum),
    hatalar: p.guncellemeler.map((g: any) => g.hata).filter(Boolean),
    yazilan: p.yazilanFaturalar[0] ?? {},
  };
}

/** Fatura kesimi icin kullanilan firma satiri (kimlik alanlari degisken). */
function firmaSatiri(ek: Record<string, unknown>) {
  return {
    ad: 'acme',
    unvan: 'Acme Muhendislik Ltd. Sti.',
    vergiNo: null,
    vergiDairesi: null,
    tcKimlikNo: null,
    faturaAdresi: 'Ornek Mah. 1. Sok. No 2',
    il: 'Istanbul',
    ilce: 'Kadikoy',
    faturaEposta: 'muhasebe@acme.test',
    yetkiliEposta: 'sahip@acme.test',
    ...ek,
  };
}

/** `kopyadanMusteri`yi cagirip hata adini ya da sonucu doner. */
function kopyaSonucu(kopyaEki: Record<string, unknown>) {
  const kopya = {
    musteriUnvan: 'Acme Muhendislik Ltd. Sti.',
    musteriVergiDairesi: null,
    musteriVergiNo: null,
    musteriTcKimlikNo: null,
    musteriAdres: 'Ornek Mah. 1. Sok. No 2',
    musteriIl: 'Istanbul',
    musteriIlce: 'Kadikoy',
    ...kopyaEki,
  } as any;
  try {
    return { hata: null as string | null, musteri: kopyadanMusteri(kopya, 'a@b.test') };
  } catch (e: any) {
    return { hata: String(e?.name ?? 'HATA'), mesaj: String(e?.message), musteri: null as any };
  }
}

/* ═══════════════════════════════════════════════════════════════════════ */

async function main() {
  // ── T1 · SAF: kimlikTuru ────────────────────────────────────────────
  console.log('\n── T1 · kimlikTuru (SAF) ──');
  check('T1.1 11 hane → tckn (sahis / gercek kisi)', kimlikTuru('12345678901') === 'tckn');
  check('T1.2 10 hane → vkn (tuzel kisi)', kimlikTuru('1234567890') === 'vkn');
  check(
    'T1.3 ⭐ bicim atiliyor — "123 456 789 01" da TCKN',
    kimlikTuru('123 456 789 01') === 'tckn',
    kimlikTuru('123 456 789 01'),
  );
  check('T1.4 9 hane → bilinmiyor', kimlikTuru('123456789') === 'bilinmiyor');
  check('T1.5 12 hane → bilinmiyor', kimlikTuru('123456789012') === 'bilinmiyor');
  check('T1.6 bos/undefined → bilinmiyor', kimlikTuru('') === 'bilinmiyor' && kimlikTuru(null) === 'bilinmiyor');

  // ── T2 · SAF: vergiDairesiGerekli ───────────────────────────────────
  console.log('\n── T2 · vergiDairesiGerekli (SAF) ──');
  check(
    'T2.1 ⭐ SAHIS (TCKN) → vergi dairesi SORULMAZ',
    vergiDairesiGerekli({ kimlikNo: '12345678901' }) === false,
  );
  check(
    'T2.2 ⭐ LIMITED (VKN) → vergi dairesi SORULUR',
    vergiDairesiGerekli({ kimlikNo: '1234567890' }) === true,
  );
  check(
    'T2.3 ⭐ turu BILINMEYEN numara da vergi dairesi ISTER — gecerli bir ' +
      'SAHIS kimligi elimizde YOK, fatura ancak VKN+daire ile kesilebilir',
    vergiDairesiGerekli({ kimlikNo: '12345' }) === true,
  );
  check(
    'T2.4 kimlik no HIC girilmemisse FALSE — o hal zorunlu-alan kapisinin isi ' +
      '(ayni anda iki hata gostermek anlasilmaz)',
    vergiDairesiGerekli({ kimlikNo: '' }) === false &&
      vergiDairesiGerekli(undefined) === false,
  );

  // ── T3 · SAF: faturaKimligiAlanlari ─────────────────────────────────
  console.log('\n── T3 · faturaKimligiAlanlari (SAF) ──');
  const a3sahis = faturaKimligiAlanlari({ kimlikNo: '12345678901' });
  check(
    'T3.1 ⭐ TCKN `tcKimlikNo` kolonuna gidiyor, `vergiNo` DOKUNULMUYOR',
    a3sahis.tcKimlikNo === '12345678901' && a3sahis.vergiNo === undefined,
    JSON.stringify(a3sahis),
  );
  const a3ltd = faturaKimligiAlanlari({ kimlikNo: '1234567890', vergiDairesi: 'Kadikoy' });
  check(
    'T3.2 ⭐ VKN `vergiNo` kolonuna gidiyor, `tcKimlikNo` DOKUNULMUYOR',
    a3ltd.vergiNo === '1234567890' &&
      a3ltd.tcKimlikNo === undefined &&
      a3ltd.vergiDairesi === 'Kadikoy',
    JSON.stringify(a3ltd),
  );
  check(
    'T3.3 ⭐ turu BILINMEYEN numara `vergiNo`ya yazilir, `tcKimlikNo`ya DEGIL ' +
      '(o kolon uyeden GIZLENEN kisisel veri — firma-maskele.ts)',
    faturaKimligiAlanlari({ kimlikNo: '12345' }).vergiNo === '12345' &&
      faturaKimligiAlanlari({ kimlikNo: '12345' }).tcKimlikNo === undefined,
  );
  check(
    'T3.4 bos girdi → TUM alanlar undefined ("DOKUNMA", null YAZMA)',
    Object.keys(faturaKimligiAlanlari({ kimlikNo: '', vergiDairesi: '' })).length === 0,
    JSON.stringify(faturaKimligiAlanlari({ kimlikNo: '', vergiDairesi: '' })),
  );
  check(
    'T3.5 bosluk-only vergi dairesi YAZILMAZ (kayitli degeri bosaltmasin)',
    faturaKimligiAlanlari({ kimlikNo: '1234567890', vergiDairesi: '   ' }).vergiDairesi ===
      undefined,
  );
  check(
    'T3.6 kirpma yapiliyor',
    faturaKimligiAlanlari({ kimlikNo: ' 1234567890 ', vergiDairesi: ' Kadikoy ' })
      .vergiDairesi === 'Kadikoy',
  );

  // ── T4 ⭐ DAVRANIS: SAHIS satin alabiliyor + TCKN DB'ye yaziliyor ────
  console.log("\n── T4 ⭐ SAHIS (TCKN) — yol KAPANMADI, kimlik YAZILDI ──");
  const p4 = sahteSatinAlmaPrisma(FIRMA_BOS);
  const i4 = sahteIyzico();
  const s4 = await baslatSonucu(p4.db, i4.istemci, MUSTERI_SAHIS);
  check('T4.1 ⭐ SAHIS satin almasi BASARILI (kapi yolu kapatmadi)', s4.tip === 'BASARILI', s4.mesaj);
  check('T4.2 ⭐ iyzico`ya GERCEKTEN gidildi', i4.cagrilar.length === 1, `cagri=${i4.cagrilar.length}`);
  const y4 = p4.firmaGuncellemeleri[0] ?? {};
  check(
    'T4.3 ⭐⭐ TCKN `Firma.tcKimlikNo`ya YAZILDI (bu satir once YOKTU)',
    y4.tcKimlikNo === '12345678901',
    JSON.stringify({ tc: y4.tcKimlikNo, vn: y4.vergiNo, vd: y4.vergiDairesi }),
  );
  check(
    'T4.4 ⭐ SAHIS`ta `vergiNo`/`vergiDairesi` DOKUNULMADI (undefined)',
    y4.vergiNo === undefined && y4.vergiDairesi === undefined,
    JSON.stringify({ vn: y4.vergiNo, vd: y4.vergiDairesi }),
  );
  check(
    'T4.5 mevcut davranis korundu: unvan/adres/il/telefon hala yaziliyor',
    y4.unvan === 'Ayse Yilmaz' &&
      y4.faturaAdresi === MUSTERI_SAHIS.adres &&
      y4.il === 'Istanbul' &&
      y4.telefon === MUSTERI_SAHIS.telefon,
    JSON.stringify(y4),
  );

  // ── T5 ⭐ DAVRANIS: LIMITED vergi dairesiz REDDEDILIYOR ──────────────
  console.log('\n── T5 ⭐ LIMITED (VKN) vergi dairesiz → 400, YAN ETKI YOK ──');
  const p5 = sahteSatinAlmaPrisma(FIRMA_BOS);
  const i5 = sahteIyzico();
  const s5 = await baslatSonucu(p5.db, i5.istemci, MUSTERI_LIMITED);
  check('T5.1 ⭐ 400 BadRequest (500 ya da sessiz gecis DEGIL)', s5.tip === 'BAD_REQUEST', `${s5.tip}: ${s5.mesaj}`);
  check('T5.2 ⭐ makine okunabilir kod donuyor', s5.kod === 'VERGI_DAIRESI_GEREKLI', String(s5.kod));
  check(
    'T5.3 ⭐ mesaj NE ISTENDIGINI soyluyor ("vergi dairesi") ve sahis cikisini gosteriyor',
    /vergi dairesi/i.test(s5.mesaj) && /T\.C\. kimlik/i.test(s5.mesaj),
    s5.mesaj,
  );
  check(
    'T5.4 ⭐⭐ IYZICO`YA HIC GIDILMEDI — kart girilmeden ONCE duruyor',
    i5.cagrilar.length === 0,
    `cagri=${i5.cagrilar.length}`,
  );
  check(
    'T5.5 ⭐ REDDEDILEN ISTEK YAN ETKI BIRAKMIYOR (firma.update kosmadi)',
    p5.firmaGuncellemeleri.length === 0,
    `update=${p5.firmaGuncellemeleri.length}`,
  );

  // ── T6 ⭐ DAVRANIS: LIMITED vergi dairesiyle geciyor ─────────────────
  console.log('\n── T6 ⭐ LIMITED (VKN + vergi dairesi) — geciyor, YAZILIYOR ──');
  const p6 = sahteSatinAlmaPrisma(FIRMA_BOS);
  const i6 = sahteIyzico();
  const s6 = await baslatSonucu(p6.db, i6.istemci, {
    ...MUSTERI_LIMITED,
    vergiDairesi: 'Kucukyali',
  });
  check('T6.1 ⭐ satin alma BASARILI', s6.tip === 'BASARILI', s6.mesaj);
  check('T6.2 iyzico`ya gidildi', i6.cagrilar.length === 1);
  const y6 = p6.firmaGuncellemeleri[0] ?? {};
  check(
    'T6.3 ⭐⭐ VKN + VERGI DAIRESI `Firma`ya YAZILDI',
    y6.vergiNo === '1234567890' && y6.vergiDairesi === 'Kucukyali',
    JSON.stringify({ vn: y6.vergiNo, vd: y6.vergiDairesi }),
  );
  check(
    'T6.4 ⭐ tuzel kiside `tcKimlikNo` DOKUNULMADI',
    y6.tcKimlikNo === undefined,
    String(y6.tcKimlikNo),
  );
  check(
    'T6.5 ⭐ vergi dairesi IYZICO GOVDESINE KONMADI (iyzico`nun alani degil)',
    JSON.stringify(i6.cagrilar[0] ?? {}).includes('Kucukyali') === false,
    JSON.stringify(i6.cagrilar[0]?.musteri ?? {}),
  );

  // ── T7 ⭐ `??` semantigi: kayitli kimlik EZILMIYOR ───────────────────
  console.log('\n── T7 ⭐ kayitli vergi kimligi EZILMIYOR (`??` semantigi) ──');
  const p7 = sahteSatinAlmaPrisma({
    ...FIRMA_BOS,
    vergiNo: '9999999999',
    vergiDairesi: 'Cankaya',
    tcKimlikNo: '99999999999',
  });
  const i7 = sahteIyzico();
  const s7 = await baslatSonucu(p7.db, i7.istemci, {
    ...MUSTERI_LIMITED,
    vergiDairesi: 'Kucukyali',
  });
  const y7 = p7.firmaGuncellemeleri[0] ?? {};
  check('T7.0 ON KOSUL: satin alma gecti', s7.tip === 'BASARILI', s7.mesaj);
  check(
    'T7.1 ⭐⭐ yoneticinin/profilin girdigi vergi kimligi KORUNDU',
    y7.vergiNo === '9999999999' &&
      y7.vergiDairesi === 'Cankaya' &&
      y7.tcKimlikNo === '99999999999',
    JSON.stringify({ vn: y7.vergiNo, vd: y7.vergiDairesi, tc: y7.tcKimlikNo }),
  );

  // ── T8 ⭐ SAF: kopyadanMusteri kapisi ────────────────────────────────
  console.log('\n── T8 ⭐ kopyadanMusteri — vergi kimligi kapisi ──');
  const k8bos = kopyaSonucu({});
  check(
    'T8.1 ⭐⭐ VERGI KIMLIGI HIC YOKSA fatura kesilemez (once SESSIZCE geciyordu)',
    k8bos.hata === 'FaturaKopyasiEksikHatasi',
    `${k8bos.hata ?? 'GECTI'} ${JSON.stringify(k8bos.musteri ?? {})}`,
  );
  check(
    'T8.2 hata mesaji NEYIN eksik oldugunu soyluyor',
    /vergi kimligi/i.test(String((k8bos as any).mesaj ?? '')),
    String((k8bos as any).mesaj ?? ''),
  );
  const k8sahis = kopyaSonucu({ musteriTcKimlikNo: '12345678901' });
  check(
    'T8.3 ⭐ SAHIS: TCKN TEK BASINA YETER — vergi dairesi ISTENMEZ',
    k8sahis.hata === null && k8sahis.musteri?.tcKimlikNo === '12345678901',
    String(k8sahis.hata),
  );
  const k8vknYalin = kopyaSonucu({ musteriVergiNo: '1234567890' });
  check(
    'T8.4 ⭐⭐ LIMITED: VKN var ama VERGI DAIRESI yok → FIRLIYOR (VUK md. 230)',
    k8vknYalin.hata === 'FaturaKopyasiEksikHatasi',
    String(k8vknYalin.hata),
  );
  const k8vknTam = kopyaSonucu({
    musteriVergiNo: '1234567890',
    musteriVergiDairesi: 'Kadikoy',
  });
  check(
    'T8.5 ⭐ LIMITED: VKN + vergi dairesi → GECIYOR',
    k8vknTam.hata === null &&
      k8vknTam.musteri?.vergiNo === '1234567890' &&
      k8vknTam.musteri?.vergiDairesi === 'Kadikoy',
    String(k8vknTam.hata),
  );
  const k8ikisi = kopyaSonucu({
    musteriVergiNo: '1234567890',
    musteriTcKimlikNo: '12345678901',
  });
  check(
    'T8.6 TCKN varsa VKN`nin dairesiz olmasi ENGELLEMEZ (sahis sirketi hali)',
    k8ikisi.hata === null,
    String(k8ikisi.hata),
  );
  check(
    'T8.7 ONCEKI KAPILAR BOZULMADI: unvan yoksa yine firliyor',
    kopyaSonucu({ musteriUnvan: null, musteriTcKimlikNo: '12345678901' }).hata ===
      'FaturaKopyasiEksikHatasi',
  );
  check(
    'T8.8 bosluk-only vergi kimligi DOLU sayilmiyor',
    kopyaSonucu({ musteriTcKimlikNo: '   ', musteriVergiNo: '  ' }).hata ===
      'FaturaKopyasiEksikHatasi',
  );
  check(
    'T8.9 hata sinifi disa acik (cagiran ayirt edebilsin)',
    typeof FaturaKopyasiEksikHatasi === 'function',
  );

  // ── T9 ⭐⭐ UCTAN UCA: eksik kimlikli firmanin faturasi ──────────────
  console.log('\n── T9 ⭐⭐ eksik kimlikli firma → FATURA KESILMIYOR ──');
  const f9bos = await faturaKesimi(firmaSatiri({}));
  check(
    'T9.0 ON KOSUL: kopya GERCEKTEN bos yazildi (kapi bos kopyayi olcuyor)',
    f9bos.yazilan.musteriVergiNo === null &&
      f9bos.yazilan.musteriTcKimlikNo === null &&
      f9bos.yazilan.musteriUnvan === 'Acme Muhendislik Ltd. Sti.',
    JSON.stringify({
      vn: f9bos.yazilan.musteriVergiNo,
      tc: f9bos.yazilan.musteriTcKimlikNo,
    }),
  );
  check('T9.1 ⭐ kesim COKMUYOR (hata kuyruk merdivenine dusuyor)', !f9bos.cokti);
  check(
    'T9.2 ⭐⭐ MUHASEBEYE HIC GIDILMEDI — vergi kimligi olmayan fatura KESILMEDI',
    f9bos.muhasebeCagrisi === 0,
    `cagri=${f9bos.muhasebeCagrisi}`,
  );
  check(
    'T9.3 ⭐ SESSIZ GECMIYOR: HATA/ELLE_MUDAHALE merdivenine dustu',
    f9bos.durumlar.some((d: any) => d === 'HATA' || d === 'ELLE_MUDAHALE'),
    JSON.stringify(f9bos.durumlar),
  );
  check(
    'T9.4 ⭐ KESILDI olarak isaretlenmedi',
    !f9bos.durumlar.includes('KESILDI'),
    JSON.stringify(f9bos.durumlar),
  );
  check(
    'T9.5 ⭐ hata metni kayda GECTI (insan neyin eksik oldugunu gorebilsin)',
    f9bos.hatalar.some((h: any) => /vergi kimligi/i.test(String(h))),
    JSON.stringify(f9bos.hatalar),
  );

  const f9sahis = await faturaKesimi(firmaSatiri({ tcKimlikNo: '12345678901' }));
  check(
    'T9.6 ⭐⭐ SAHIS firmasinin faturasi KESILIYOR — kapi mutlu yolu BOGMUYOR',
    f9sahis.muhasebeCagrisi === 1 && f9sahis.durumlar.includes('KESILDI'),
    JSON.stringify({ cagri: f9sahis.muhasebeCagrisi, durum: f9sahis.durumlar }),
  );
  check(
    'T9.7 muhasebeye giden govdede TCKN var, vergi dairesi yok',
    f9sahis.giden.tcKimlikNo === '12345678901' &&
      f9sahis.giden.vergiDairesi === undefined,
    JSON.stringify(f9sahis.giden),
  );

  const f9ltd = await faturaKesimi(
    firmaSatiri({ vergiNo: '1234567890', vergiDairesi: 'Kadikoy' }),
  );
  check(
    'T9.8 ⭐ LIMITED firmasinin (VKN+daire) faturasi da KESILIYOR',
    f9ltd.muhasebeCagrisi === 1 &&
      f9ltd.giden.vergiNo === '1234567890' &&
      f9ltd.giden.vergiDairesi === 'Kadikoy',
    JSON.stringify(f9ltd.giden),
  );

  const f9dairesiz = await faturaKesimi(firmaSatiri({ vergiNo: '1234567890' }));
  check(
    'T9.9 ⭐⭐ VKN var ama VERGI DAIRESI yok → fatura KESILMIYOR',
    f9dairesiz.muhasebeCagrisi === 0 &&
      f9dairesiz.durumlar.some((d: any) => d === 'HATA' || d === 'ELLE_MUDAHALE'),
    JSON.stringify({ cagri: f9dairesiz.muhasebeCagrisi, durum: f9dairesiz.durumlar }),
  );

  // ── T10 ⭐ BAGLANTI KAPILARI ────────────────────────────────────────
  // "Mekanizma var, cagiran yok" bu depoda TEK OTURUMDA 6 kez yasandi.
  // Saf fonksiyon dogru olsa bile BAGLANMAMIS olabilir; asagisi onu olcer.
  console.log('\n── T10 ⭐ baglanti kapilari ──');
  const satinAlmaKaynak = yorumsuz(
    readFileSync(
      join(KOK, 'backend', 'src', 'ozellik', 'odeme', 'abonelik', 'satinalma.servisi.ts'),
      'utf-8',
    ),
  );
  const updateGovdesi =
    satinAlmaKaynak.split('prisma.firma.update(')[1]?.split('});')[0] ?? '';
  check(
    'T10.0 ON KOSUL: firma.update govdesi bulundu',
    updateGovdesi.length > 100,
    `uzunluk=${updateGovdesi.length}`,
  );
  check(
    'T10.1 ⭐⭐ `firma.update` govdesi UC KIMLIK ALANINI da yaziyor',
    updateGovdesi.includes('tcKimlikNo:') &&
      updateGovdesi.includes('vergiNo:') &&
      updateGovdesi.includes('vergiDairesi:'),
    updateGovdesi.slice(0, 200),
  );
  const selectGovdesi =
    satinAlmaKaynak.split('prisma.firma.findUnique(')[1]?.split('});')[0] ?? '';
  check(
    'T10.2 ⭐ mevcut deger OKUNUYOR — yoksa `??` her satin almada EZERDI',
    selectGovdesi.includes('tcKimlikNo: true') &&
      selectGovdesi.includes('vergiNo: true') &&
      selectGovdesi.includes('vergiDairesi: true'),
    selectGovdesi.slice(0, 200),
  );
  check(
    'T10.3 ⭐ satin alma kapisi `baslat` icinden CAGRILIYOR',
    satinAlmaKaynak.includes('vergiDairesiGerekli(p.musteri)'),
  );

  const feKimlik = readFileSync(
    join(KOK, 'frontend', 'ozellik', 'odeme', 'fatura-kimligi.ts'),
    'utf-8',
  );
  check(
    'T10.4 ⭐ on yuz ikizi AYNI esikleri kullaniyor (11=tckn, 10=vkn)',
    /length === 11\) return 'tckn'/.test(feKimlik) &&
      /length === 10\) return 'vkn'/.test(feKimlik),
  );
  check(
    'T10.5 ⭐ on yuz kapisi `eksikAlanlar` icine BAGLI (dugme gerceken kapaniyor)',
    yorumsuz(feKimlik).includes('vergiDairesiGerekli(deger)'),
  );
  const fePage = readFileSync(
    join(KOK, 'frontend', 'app', '(protected)', 'abonelik', 'page.tsx'),
    'utf-8',
  );
  check(
    'T10.6 ⭐ odeme sayfasi alani GERCEKTEN ciziyor (kosullu)',
    yorumsuz(fePage).includes('vergiDairesiGerekli(fatura)') &&
      fePage.includes('fatura-vergiDairesi'),
  );
  check(
    // ⚠ KOSULU DA OLCER. Ilk yazimda desen yalniz `govde.vergiDairesi = vd`
    // ariyordu ve M11 mutanti (`if (vd)` → `if (false)`) SAGKALDI: atama
    // satiri yerinde duruyor, sadece hic kosmuyordu. Yesil assert ne olctugunu
    // soylemez — kosulu assert'e KOY. Davranis ikizi on yuzde:
    // `frontend/ozellik/odeme/fatura-kimligi.test.ts`.
    'T10.7 ⭐ govde uretici alani TASIYOR (kosuluyla birlikte)',
    yorumsuz(feKimlik).includes('if (vd) govde.vergiDairesi = vd'),
  );
  check(
    'T10.8 ⭐ P7 SOZLESMESI BOZULMADI — `ZORUNLU_MUSTERI_ALANLARI` hala 7 ' +
      'iyzico alani (vergi dairesi KOSULLU, o listeye EKLENMEDI)',
    ZORUNLU_MUSTERI_ALANLARI.length === 7 &&
      !(ZORUNLU_MUSTERI_ALANLARI as readonly string[]).includes('vergiDairesi'),
    ZORUNLU_MUSTERI_ALANLARI.join(','),
  );

  const faturaKaynak = yorumsuz(
    readFileSync(
      join(KOK, 'backend', 'src', 'ozellik', 'odeme', 'fatura', 'fatura.servisi.ts'),
      'utf-8',
    ),
  );
  check(
    'T10.9 ⭐ fatura kapisi `kopyadanMusteri` ICINDE (cagrilmayan yardimci degil)',
    faturaKaynak
      .split('export function kopyadanMusteri(')[1]
      ?.split('\n}')[0]
      ?.includes('FaturaKopyasiEksikHatasi') === true,
  );

  // ── T11 ⭐ KVKK: veri indirme bu kapidan ETKILENMIYOR ────────────────
  // `hesap.servisi.ts` basindaki kural: KVKK haklari odemeye baglanamaz.
  console.log('\n── T11 ⭐ KVKK hakki bu kapidan etkilenmiyor ──');
  const hesapKaynak = yorumsuz(
    readFileSync(join(KOK, 'backend', 'src', 'altyapi', 'auth', 'hesap.servisi.ts'), 'utf-8'),
  );
  check(
    'T11.1 ⭐ hesap servisi fatura kimligi kapisini IMPORT ETMIYOR',
    !hesapKaynak.includes('kopyadanMusteri') &&
      !hesapKaynak.includes('vergiDairesiGerekli') &&
      !hesapKaynak.includes('FaturaKopyasiEksikHatasi'),
  );
  check(
    'T11.2 ⭐ veri indirme firmanin vergi alanlarini HALA okuyor (kapi kisitlamadi)',
    hesapKaynak.includes('vergiNo: true') && hesapKaynak.includes('vergiDairesi: true'),
  );


  // ── T12 ⭐ MUHASEBE ADAPTORU MUSTERIYI KIMLIKLE BULUR (plan 4.9) ──────
  //
  // ESKI KUSUR: `filter[name]=<unvan>` ile aranip `data[0]` aliniyordu.
  // Unvan Turkiye'de TEKIL DEGIL — ayni ada sahip iki ayri musteri Parasut'te
  // TEK kayitta birlesir, birinin faturasi otekinin hesabina yazilirdi.
  // Hesaplanan kimlik anahtari YALNIZ hata metninde geciyordu: "mekanizma var,
  // baglanti yok" hata sinifinin tam ornegi.
  //
  // ⚠ Bu bolum KAYNAK degil DAVRANIS olcer: `fetch` sarilir ve GIDEN
  //   isteklerin adresleri okunur (bkz. feedback_giden_istegi_olc).
  console.log('\n── T12 ⭐ muhasebe adaptoru: musteri kimlikle bulunur ──');
  {
    const sahteConfig = {
      getOrThrow: (k: string) => `sahte-${k}`,
      get: (k: string) => `sahte-${k}`,
    } as any;

    type Cagri = { url: string; yontem: string; govde?: any };

    /** `contacts` aramasina kac kayit donecegini ve HTTP durumunu ayarlar. */
    function sahteFetchKur(aramaSonucu: { durum?: number; kayitlar?: Array<{ id: string }> }) {
      const cagrilar: Cagri[] = [];
      const orijinal = globalThis.fetch;
      globalThis.fetch = (async (url: any, init?: any) => {
        const u = String(url);
        const yontem = init?.method ?? 'GET';
        cagrilar.push({ url: u, yontem, govde: init?.body ? JSON.parse(init.body) : undefined });
        const yanit = (durum: number, govde: any) => ({
          ok: durum >= 200 && durum < 300,
          status: durum,
          json: async () => govde,
          text: async () => JSON.stringify(govde),
        });
        if (u.includes('/oauth/token')) {
          return yanit(200, { access_token: 'jeton', expires_in: 3600 });
        }
        if (u.includes('/contacts?')) {
          return yanit(aramaSonucu.durum ?? 200, { data: aramaSonucu.kayitlar ?? [] });
        }
        if (u.endsWith('/contacts') && yontem === 'POST') {
          return yanit(201, { data: { id: 'YENI-KAYIT' } });
        }
        if (u.includes('/sales_invoices')) {
          return yanit(201, { data: { id: 'FTR-1', attributes: { invoice_no: 'A-1' } } });
        }
        return yanit(404, {});
      }) as any;
      return { cagrilar, geriAl: () => { globalThis.fetch = orijinal; } };
    }

    const KALEM = [{ ad: 'Pro', miktar: 1, birim: 'adet', birimFiyat: 100, kdvOrani: 20 }];
    async function kes(musteri: any, aramaSonucu: any) {
      const s = sahteFetchKur(aramaSonucu);
      try {
        const a = new ParasutAdaptoru(sahteConfig);
        const sonuc = await a.faturaKes({
          harciAnahtar: 'h1',
          duzenlemeTarihi: new Date('2026-09-22T00:00:00Z'),
          paraBirimi: 'TRY',
          musteri,
          kalemler: KALEM,
        } as any);
        return { sonuc, cagrilar: s.cagrilar };
      } finally {
        s.geriAl();
      }
    }
    const adres = (c: Cagri[]) => c.map((x) => x.url).join(' | ');
    const yeniKayitAcildiMi = (c: Cagri[]) =>
      c.some((x) => x.yontem === 'POST' && x.url.endsWith('/contacts'));
    const faturaMusterisi = (c: Cagri[]) =>
      c.find((x) => x.url.includes('/sales_invoices'))?.govde?.data?.relationships?.contact?.data?.id;

    const LIMITED = { unvan: 'Yilmaz Insaat', vergiNo: '1111111111', eposta: 'a@x.test' };
    const SAHIS = { unvan: 'Ali Yilmaz', tcKimlikNo: '22222222222', eposta: 'b@x.test' };
    const KIMLIKSIZ = { unvan: 'Kimliksiz Ltd', eposta: 'c@x.test' };

    // ÖLÇÜTÜ ÖNCE DOĞRULA: sahte fetch gerçekten devrede mi? Devrede değilse
    // aşağıdaki "filter[name] yok" assert'i TESADÜFEN yeşil olurdu.
    const o1 = await kes(LIMITED, { kayitlar: [] });
    check('T12.0 olcut: sahte fetch calisti (jeton + arama + kayit + fatura)',
      o1.cagrilar.length >= 4, `cagri=${o1.cagrilar.length}`);

    check('T12.1 ⭐ ADA GORE ARAMA YOK (filter[name] hic gecmiyor)',
      !adres(o1.cagrilar).includes('filter[name]'), adres(o1.cagrilar).slice(0, 200));
    check('T12.2 ⭐ vergi numarasiyla araniyor',
      adres(o1.cagrilar).includes('filter[tax_number]=1111111111'),
      adres(o1.cagrilar).slice(0, 200));

    // TEK eslesme → o kayit kullanilir, YENI kayit acilmaz.
    const o2 = await kes(LIMITED, { kayitlar: [{ id: 'VAR-1' }] });
    check('T12.3 tek eslesme → mevcut kayit kullanilir, yeni kayit ACILMAZ',
      !yeniKayitAcildiMi(o2.cagrilar));
    check('T12.3b fatura O musteriye baglandi',
      faturaMusterisi(o2.cagrilar) === 'VAR-1', String(faturaMusterisi(o2.cagrilar)));

    // IKI eslesme → kimlik BELIRSIZ. Tahmin etmek yerine yeni kayit.
    const o3 = await kes(LIMITED, { kayitlar: [{ id: 'A' }, { id: 'B' }] });
    check('T12.4 ⭐ iki eslesme = kimlik belirsiz → data[0] ALINMAZ, yeni kayit acilir',
      yeniKayitAcildiMi(o3.cagrilar) && faturaMusterisi(o3.cagrilar) === 'YENI-KAYIT');

    // Sahis sirketi: vergi no yok, T.C. kimlik no var.
    const o4 = await kes(SAHIS, { kayitlar: [] });
    check('T12.5 sahis sirketinde T.C. kimlik no ile araniyor',
      adres(o4.cagrilar).includes('filter[tax_number]=22222222222'));

    // Hicbir kimlik yok → e-posta son care.
    const o5 = await kes(KIMLIKSIZ, { kayitlar: [] });
    check('T12.6 kimlik yoksa e-posta ile araniyor (ada gore DEGIL)',
      adres(o5.cagrilar).includes('filter[email]=c%40x.test'));

    // Arama HTTP hatasi → tahsilat DURMAZ, yeni kayit acilir.
    const o6 = await kes(LIMITED, { durum: 500 });
    check('T12.7 arama HTTP hatasi faturayi DUSURMEZ (yeni kayit acilir)',
      yeniKayitAcildiMi(o6.cagrilar) && o6.sonuc.saglayiciId === 'FTR-1');

    // ⭐⭐ ASIL KUSURUN OLCUMU: AYNI UNVAN, FARKLI VERGI NO.
    // Eski kodda ikisi de ayni `filter[name]` sorgusuna duser ve BIRLESIRDI.
    const A = { unvan: 'Yilmaz Insaat', vergiNo: '1111111111', eposta: 'a@x.test' };
    const B = { unvan: 'Yilmaz Insaat', vergiNo: '9999999999', eposta: 'b@x.test' };
    const sA = adres((await kes(A, { kayitlar: [] })).cagrilar);
    const sB = adres((await kes(B, { kayitlar: [] })).cagrilar);
    check('T12.8 ⭐⭐ AYNI UNVAN farkli vergi no → FARKLI sorgu (birlesme yok)',
      sA.includes('filter[tax_number]=1111111111') &&
        sB.includes('filter[tax_number]=9999999999') &&
        !sA.includes('9999999999') && !sB.includes('1111111111'));
  }

  // ── SONUC ───────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`FATURA KIMLIGI KAPISI: ${passed} PASS, ${failed} FAIL`);
  console.log('================================================================');
  if (failed) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
