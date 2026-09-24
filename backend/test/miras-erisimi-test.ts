/**
 * MIRAS ERISIMI — KAPI · `npm run test:miras-erisimi`
 * (24.09.2026 — "odemek, odememekten kotu olmasin" iki ucta)
 *
 * DB GEREKTIRMEZ · AG GEREKTIRMEZ · IYZICO GEREKTIRMEZ (sahte Prisma + iyzico).
 * GERCEK `SatinAlmaServisi` + GERCEK `AbonelikServisi`.
 *
 * ── BU KAPI NEDEN VAR ────────────────────────────────────────────────────
 * 02.09 karari: kart satin almasi zaten verilmis erisimi KISALTMAZ — miras
 * (goc) satirinin 365 gunu `max(mevcut, yeni)` ile korunur
 * (`aboneligiAcVeyaGuncelle`). Yorumu "webhook yolu da koruyor" diyordu;
 * YANLISTI: kart tahsilat webhook'u (`tahsilatBasarili`) guncel uctan gelen
 * sipariste `erisimSonu`nu iyzico'nun `endPeriod`una yaziyordu (satin almanin
 * 31+2 gunluk kopru tamponunu duzeltmek icin — 23.09 inceleme bulgusu 3).
 * Miras firma deneme ALMAZ, ilk tahsilat satin almadan dakikalar sonra gelir:
 * korunan ~332 gun ilk tahsilatta siliniyordu. Birim testler iki ucu AYRI
 * olcuyordu (P8 satin almayi, W8 webhook'u) — BAGLANTIYI kimse olcmuyordu.
 *
 * KURAL (tek alan, iki uc): satin alma kopru tarihini `kopruErisimSonu`na da
 * yazar; webhook `erisimSonu`nu YALNIZ hala o degerse kisaltir, baska her
 * durumda yalniz uzatir. Kopru yalniz erisimi BITMIS (ya da hic olmayan)
 * satirda yazilir.
 *
 * ── BLOKLAR ──────────────────────────────────────────────────────────────
 *   K · Kopru yazimi: satin alma hangi satirda kopru yazar, hangisinde NULL;
 *       ayni aboneligin yeniden sonuclandirilmasi kopruyu korur (K7/K8)
 *   Y · Yeniden sonuclandirma uctan uca: TAMAMLANDI yazilamadi → ikinci donus
 *   M · ⭐ Miras uctan uca: donus → webhook → 340 gun KORUNUR (asil kusur)
 *   D · Kopru duzeltmesi SURER: yeni firma → webhook → 33 → 30 gun (W8'in ikizi)
 *   V · Sonradan verilen erisim (havale/yonetici uzatmasi) kisalmaz; eski halka
 *   O · Olay izi: erisimin nasil degistigi olay kaydindan okunur
 *   B · Baglanti: sema alani + goc
 *
 * ⚠ GERCEK SAAT: servisler kendi `new Date()`sini kullaniyor; beklenen
 * tarihler test aninin gun katlari, karsilastirma 60 sn toleransli.
 * ⚠ BEKLENEN KOPRU ELLE YAZILDI (33 / 32 gun) — `donemTarihleriHesapla` ya da
 * `TAMPON_GUN`dan TURETILMEDI (dairesel olcut yasak).
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { AbonelikDurumu } from '@prisma/client';

import { SatinAlmaServisi } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';

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

const GUN = 86_400_000;
const TOLERANS = 60_000;
const gunSonra = (n: number) => new Date(Date.now() + n * GUN);
/** `t` beklenen ana (test aninin `gun` sonrasi) 60 sn icinde mi? */
const yakin = (t: Date | null | undefined, gun: number) =>
  t instanceof Date && Math.abs(t.getTime() - (Date.now() + gun * GUN)) < TOLERANS;
const gunOlarak = (t: Date | null | undefined) =>
  t instanceof Date ? ((t.getTime() - Date.now()) / GUN).toFixed(3) : String(t);

// ═══════════════════════════════════════════════════════════════════════════
//  SAHTE DUNYA
// ═══════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

/** Prisma `where` alt kumesi: esitlik, Date, null, OR. */
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
    if (v === null) {
      if (d != null) return false;
      continue;
    }
    if (d !== v) return false;
  }
  return true;
}

function surum(kod: string, o: Satir = {}): Satir {
  return {
    id: `s-${kod}`,
    iyzicoPlanKodu: `plan-${kod}`,
    iyzicoDenemesizPlanKodu: `plan-${kod}-denemesiz`,
    denemeGunu: 30,
    periyot: 'MONTHLY',
    periyotAdedi: 1,
    satistaMi: true,
    paket: { kod, ad: `Paket ${kod}` },
    ...o,
  };
}
const SURUMLER: Satir[] = [
  // Goc paketi: migration 20260828100000 — tutar 0, satis disi, deneme 0.
  surum('miras-core', { iyzicoPlanKodu: 'MIRAS-miras-core', iyzicoDenemesizPlanKodu: null, denemeGunu: 0, satistaMi: false }),
  surum('pro-mek'),
];

/** Goc satiri (miras): HAVALE, iyzico bagi YOK — migration'in yazdigi bicim. */
function mirasSatiri(erisimSonu: Date, o: Satir = {}): Satir {
  return {
    id: 'ab1',
    firmaId: 'f1',
    paketSurumuId: 's-miras-core',
    durum: AbonelikDurumu.AKTIF,
    erisimSonu,
    denemeSonu: null,
    kopruErisimSonu: null,
    odemeYontemi: 'HAVALE',
    iyzicoAbonelikKodu: null,
    iyzicoKokKodu: null,
    iyzicoMusteriKodu: null,
    iyzicoDurum: null,
    planliPaketSurumuId: null,
    paketGecisTarihi: null,
    odenenPaketSurumuId: null,
    ilkBasarisizlik: null,
    denemeSayisi: 0,
    sonDeneme: null,
    ...o,
  };
}

function niyet(o: Satir = {}): Satir {
  return {
    id: 'n1',
    token: 'tok-1',
    firmaId: 'f1',
    paketSurumuId: 's-pro-mek',
    olusturanId: 'u1',
    denemeGunu: 0,
    planKodu: 'plan-pro-mek-denemesiz',
    epostaNormal: null,
    formEpostaNormal: null,
    telefonNormal: null,
    sozlesmeSurumu: 'v-test',
    durum: 'BEKLIYOR',
    iyzicoAbonelikKodu: null,
    denemeSayisi: 0,
    ...o,
  };
}

function dunya(p: { abonelik?: Satir | null; niyetler?: Satir[]; tamamlandiHatasi?: number } = {}) {
  const abonelikler: Satir[] = p.abonelik ? [p.abonelik] : [];
  const niyetler: Satir[] = p.niyetler ?? [niyet()];
  const olaylar: Satir[] = [];
  // Niyetin TAMAMLANDI damgasi ilk N denemede patlar (surec coktu / DB koptu):
  // satir yazildi, niyet BEKLIYOR kaldi → ayni niyet YENIDEN sonuclandirilir.
  let tamamlandiHatasi = p.tamamlandiHatasi ?? 0;
  const surumBul = (id: string | null) => SURUMLER.find((s) => s.id === id) ?? null;
  const dolu = (a: Satir | undefined | null) => (a ? { ...a, paketSurumu: surumBul(a.paketSurumuId) } : null);
  const bul = (where: Satir) => abonelikler.find((a) => eslesir(a, where));
  const niyetBul = (where: Satir) => niyetler.find((n) => eslesir(n, where));

  // iyzico: form sonucu ve abonelik detayi (siparisler test boyunca EKLENIR).
  const formlar: Record<string, Satir> = {
    'tok-1': {
      referenceCode: 'sub-1',
      customerReferenceCode: 'm-1',
      subscriptionStatus: 'ACTIVE',
      pricingPlanReferenceCode: 'plan-pro-mek-denemesiz',
    },
  };
  const detaylar: Record<string, Satir> = {
    'sub-1': {
      referenceCode: 'sub-1',
      customerReferenceCode: 'm-1',
      pricingPlanReferenceCode: 'plan-pro-mek-denemesiz',
      subscriptionStatus: 'ACTIVE',
      orders: [] as Satir[],
    },
  };
  const iyzico: any = {
    formSonucu: async (token: string) => {
      const f = formlar[token];
      if (!f) throw new Error(`sahte iyzico: form yok (${token})`);
      return f;
    },
    abonelikGetir: async (kod: string) => {
      const d = detaylar[kod];
      if (!d) throw new Error(`sahte iyzico: detay yok (${kod})`);
      return d;
    },
  };
  /** Kodun siparis listesine basarili bir siparis ekler (iyzico cekimi). */
  const siparisEkle = (kod: string, ref: string, bitis: Date) => {
    detaylar[kod].orders.push({
      referenceCode: ref,
      orderStatus: 'SUCCESS',
      startPeriod: new Date(bitis.getTime() - 30 * GUN).toISOString(),
      endPeriod: bitis.toISOString(),
      paidPrice: 1649,
    });
  };

  const db: any = {
    olaylar,
    abonelikler,
    niyetler,
    satir: () => abonelikler[0],
    abonelik: {
      findUnique: async ({ where }: any) => dolu(bul(where)),
      findUniqueOrThrow: async ({ where }: any) => {
        const a = bul(where);
        if (!a) throw new Error('findUniqueOrThrow: satir yok');
        return dolu(a);
      },
      findFirst: async ({ where }: any) => dolu(bul(where)),
      create: async ({ data }: any) => {
        const a = { id: 'ab-yeni', ...data };
        abonelikler.push(a);
        return dolu(a);
      },
      update: async ({ where, data }: any) => {
        const a = bul(where);
        if (!a) throw new Error('update: satir yok');
        Object.assign(a, data);
        return dolu(a);
      },
      updateMany: async ({ where, data }: any) => {
        const hedef = abonelikler.filter((a) => eslesir(a, where));
        hedef.forEach((a) => Object.assign(a, data));
        return { count: hedef.length };
      },
    },
    abonelikBaslatma: {
      findUnique: async ({ where }: any) => niyetBul(where) ?? null,
      findUniqueOrThrow: async ({ where }: any) => {
        const n = niyetBul(where);
        if (!n) throw new Error('niyet yok');
        return { ...n, paketSurumu: surumBul(n.paketSurumuId) };
      },
      update: async ({ where, data }: any) => {
        const n = niyetBul(where);
        if (!n) throw new Error('niyet update: yok');
        if (data?.durum === 'TAMAMLANDI' && tamamlandiHatasi > 0) {
          tamamlandiHatasi--;
          throw new Error('sahte DB: TAMAMLANDI yazilamadi');
        }
        Object.assign(n, data);
        return n;
      },
    },
    paketSurumu: {
      findFirst: async ({ where }: any) => SURUMLER.find((s) => eslesir(s, where)) ?? null,
    },
    abonelikOlayi: {
      create: async ({ data }: any) => {
        olaylar.push(data);
        return data;
      },
    },
    denemeKullanimi: { upsert: async () => ({}) },
    firma: {
      findUnique: async () => ({ ad: 'Firma A', faturaEposta: 'fatura@firma.test', yetkiliEposta: null }),
      updateMany: async () => ({ count: 0 }),
    },
    user: { updateMany: async () => ({ count: 0 }), count: async () => 0 },
    $transaction: async (arg: any) => (typeof arg === 'function' ? arg(db) : Promise.all(arg)),
  };

  const abonelik = new AbonelikServisi(db, iyzico);
  const eposta: any = { gonder: async () => undefined };
  const satinAlma = new SatinAlmaServisi(db, iyzico, abonelik, { get: () => undefined } as any, {} as any, eposta);
  return { db, iyzico, abonelik, satinAlma, siparisEkle, formlar, detaylar };
}

/** Basari beklenen adimi calistirir; hata sonraki bloklari COKERTMEZ, assert olur. */
async function basarir<T>(ad: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e: any) {
    check(`${ad} — BEKLENMEDIK HATA`, false, e?.message ?? String(e));
    return null;
  }
}

/**
 * Webhook bu siparisi GERCEKTEN isledi mi? (olay kaydindaki iz sayisi)
 * ⚠ "Erisim DEGISMEDI" assert'i webhook hic kosmasa (bilinmeyen kod, erken
 * donus) da gecer — her "kisalmadi" assert'inin yaninda bu kanit durur.
 */
const isledi = (d: ReturnType<typeof dunya>, siparisKodu: string) =>
  d.db.olaylar.filter(
    (o: Satir) => o.tip === 'durum.degisti' && o.aktor === 'webhook' && o.veri?.siparisKodu === siparisKodu,
  );

const aboneligiAc = (d: ReturnType<typeof dunya>, denemeGunu: number) =>
  (d.satinAlma as any).aboneligiAcVeyaGuncelle({
    firmaId: 'f1',
    paketSurumuId: 's-pro-mek',
    iyzicoAbonelikKodu: 'sub-1',
    iyzicoMusteriKodu: 'm-1',
    iyzicoDurum: 'ACTIVE',
    denemeGunu,
  });

// ═══════════════════════════════════════════════════════════════════════════
//  K · KOPRU YAZIMI (satin alma)
// ═══════════════════════════════════════════════════════════════════════════
async function kBlogu(): Promise<void> {
  console.log('\n── K · kopru yazimi: satin alma hangi satirda kopru yazar ──');

  // K1 · yeni firma (satir yok), denemesiz → erisimSonu = kopru = 31+2 gun.
  {
    const d = dunya({ abonelik: null });
    await basarir('K1', () => aboneligiAc(d, 0));
    const s = d.db.satir();
    check('K1-FIXTURE satir OLUSTURULDU (create dali)', !!s && s.id === 'ab-yeni');
    check('K1 ⭐ yeni firma: erisimSonu 33 gun VE kopru = erisimSonu', yakin(s?.erisimSonu, 33) && s?.kopruErisimSonu instanceof Date && s.kopruErisimSonu.getTime() === s.erisimSonu.getTime(), `e=${gunOlarak(s?.erisimSonu)} k=${gunOlarak(s?.kopruErisimSonu)}`);
  }

  // K2 · suresi GECMIS satir (geri donen musteri) → kopru yazilir.
  {
    const d = dunya({ abonelik: mirasSatiri(gunSonra(-40), { durum: AbonelikDurumu.SONA_ERDI, paketSurumuId: 's-pro-mek', odemeYontemi: 'KART' }) });
    await basarir('K2', () => aboneligiAc(d, 0));
    const s = d.db.satir();
    check('K2 suresi gecmis satir: erisimSonu 33 gun VE kopru = erisimSonu', yakin(s.erisimSonu, 33) && s.kopruErisimSonu instanceof Date && s.kopruErisimSonu.getTime() === s.erisimSonu.getTime(), `e=${gunOlarak(s.erisimSonu)} k=${gunOlarak(s.kopruErisimSonu)}`);
  }

  // K3 · ⭐ miras satiri (340 gun kaldi) → 340 KORUNUR, kopru NULL.
  {
    const miras = gunSonra(340);
    const d = dunya({ abonelik: mirasSatiri(miras) });
    await basarir('K3', () => aboneligiAc(d, 0));
    const s = d.db.satir();
    check('K3 ⭐ miras: erisimSonu 340 gun KORUNDU (02.09 kurali)', s.erisimSonu.getTime() === miras.getTime(), gunOlarak(s.erisimSonu));
    check('K3b ⭐ miras: kopru NULL (korunan tarih kopru DEGIL)', s.kopruErisimSonu === null, String(s.kopruErisimSonu));
  }

  // K4 · erisimi SUREN ama kopruden KISA satir (5 gun) → kopru tarihi yazilir,
  // kopru isareti NULL. BILINCLI BEDEL: webhook bunu kisaltmaz, musteri en
  // fazla kopru ile iyzico donemi farki kadar (≤5 gun) fazla erisir —
  // verilmis erisimi kesmek yerine.
  {
    const d = dunya({ abonelik: mirasSatiri(gunSonra(5)) });
    await basarir('K4', () => aboneligiAc(d, 0));
    const s = d.db.satir();
    check('K4 suren kisa erisim (5 gun): erisimSonu 33 gun, kopru NULL (bilincli bedel)', yakin(s.erisimSonu, 33) && s.kopruErisimSonu === null, `e=${gunOlarak(s.erisimSonu)} k=${String(s.kopruErisimSonu)}`);
  }

  // K5 · BAYAT KOPRU TASINMAZ: onceki satin almadan kalan kopru BUGUNKU
  // korunan tarihe ESIT (en tehlikeli hal — webhook onu kopru sanip keserdi).
  // Satin alma NULL'u ACIKCA yazmali.
  {
    const bayat = gunSonra(200);
    const d = dunya({ abonelik: mirasSatiri(bayat, { durum: AbonelikDurumu.SONA_ERDI, paketSurumuId: 's-pro-mek', odemeYontemi: 'KART', kopruErisimSonu: bayat }) });
    check('K5-FIXTURE bayat kopru erisimSonu ile ESIT', d.db.satir().kopruErisimSonu.getTime() === d.db.satir().erisimSonu.getTime());
    await basarir('K5', () => aboneligiAc(d, 0));
    const s = d.db.satir();
    check('K5 ⭐ bayat kopru SILINDI (NULL acikca yazildi), 200 gun korundu', s.kopruErisimSonu === null && s.erisimSonu.getTime() === bayat.getTime(), `e=${gunOlarak(s.erisimSonu)} k=${String(s.kopruErisimSonu)}`);
  }

  // K6 · denemeli yeni firma → kopru = 30+2 gun.
  {
    const d = dunya({ abonelik: null });
    await basarir('K6', () => aboneligiAc(d, 30));
    const s = d.db.satir();
    check('K6 denemeli yeni firma: DENEME, erisimSonu = kopru = 32 gun', s?.durum === AbonelikDurumu.DENEME && yakin(s?.erisimSonu, 32) && s?.kopruErisimSonu?.getTime() === s?.erisimSonu?.getTime(), `d=${s?.durum} e=${gunOlarak(s?.erisimSonu)}`);
  }

  // K7 · AYNI aboneligin yeniden sonuclandirilmasi (ayni iyzico kodu): ilk
  // cagrinin koprusu KORUNUR. Eski kural ikinci cagride kendi koprusunu
  // "suren erisim" sayip NULL'luyordu (24.09 inceleme bulgusu).
  {
    const d = dunya({ abonelik: null });
    await basarir('K7', () => aboneligiAc(d, 0));
    const ilk = d.db.satir()?.kopruErisimSonu as Date | undefined;
    await new Promise((r) => setTimeout(r, 5)); // ikinci cagrinin `simdi`si FARKLI olsun
    await basarir('K7', () => aboneligiAc(d, 0));
    const s = d.db.satir();
    check('K7-FIXTURE ilk cagri kopru yazdi', ilk instanceof Date);
    check('K7 ⭐ ayni aboneligin ikinci sonuclandirmasi kopruyu KORUDU (ayni an, NULL degil)', !!ilk && s.kopruErisimSonu instanceof Date && s.kopruErisimSonu.getTime() === ilk.getTime() && s.erisimSonu.getTime() === ilk.getTime(), `ilk=${gunOlarak(ilk)} k=${gunOlarak(s.kopruErisimSonu)} e=${gunOlarak(s.erisimSonu)}`);
  }

  // K8 · webhook kopruyu DUZELTTIKTEN sonra gelen yeniden sonuclandirma,
  // duzeltilmis donem sonunu yeni bir kopruyle EZMEZ.
  {
    const d = dunya({ abonelik: null });
    await basarir('K8', () => aboneligiAc(d, 0));
    d.siparisEkle('sub-1', 'sip-1', gunSonra(30));
    await basarir('K8', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-1'));
    const duzeltilmis = d.db.satir().erisimSonu as Date;
    check('K8-FIXTURE webhook kopruyu 30 gune duzeltti', yakin(duzeltilmis, 30) && d.db.satir().kopruErisimSonu === null, gunOlarak(duzeltilmis));
    await basarir('K8', () => aboneligiAc(d, 0));
    const s = d.db.satir();
    check('K8 ⭐ duzeltmeden sonra yeniden sonuclandirma: 30 gun ve kopru NULL KALDI (33 gunluk kopru geri gelmedi)', s.erisimSonu.getTime() === duzeltilmis.getTime() && s.kopruErisimSonu === null, `e=${gunOlarak(s.erisimSonu)} k=${String(s.kopruErisimSonu)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Y · YENIDEN SONUCLANDIRMA UCTAN UCA — gercek donus yolu ikinci kez girer
// ═══════════════════════════════════════════════════════════════════════════
async function yBlogu(): Promise<void> {
  console.log('\n── Y · yeniden sonuclandirma: TAMAMLANDI yazilamadi → ikinci donus → webhook ──');
  const d = dunya({ abonelik: null, tamamlandiHatasi: 1 });
  const ilk = await basarir('Y0', () => d.satinAlma.donusIyzicodan('tok-1'));
  check('Y-FIXTURE ilk donus satiri yazdi ama niyet BEKLIYOR kaldi', ilk === 'bekliyor' && d.db.niyetler[0].durum === 'BEKLIYOR' && d.db.satir()?.kopruErisimSonu instanceof Date, `donus=${ilk} niyet=${d.db.niyetler[0].durum}`);
  await new Promise((r) => setTimeout(r, 5));
  const ikinci = await basarir('Y0', () => d.satinAlma.donusIyzicodan('tok-1'));
  check('Y0 ikinci donus niyeti TAMAMLADI (ayni iyzico kodu, ikinci abonelik sayilmadi)', ikinci === 'tamam' && d.db.niyetler[0].durum === 'TAMAMLANDI', `donus=${ikinci}`);
  d.siparisEkle('sub-1', 'sip-1', gunSonra(30));
  await basarir('Y1', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-1'));
  check('Y1 ⭐ yeniden sonuclandirmadan sonra ilk tahsilat kopruyu YINE duzeltti: 30 gun', yakin(d.db.satir().erisimSonu, 30) && d.db.satir().kopruErisimSonu === null, `e=${gunOlarak(d.db.satir().erisimSonu)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  M · ⭐ MIRAS UCTAN UCA — donus (satin alma) → webhook (ilk tahsilat)
// ═══════════════════════════════════════════════════════════════════════════
async function mBlogu(): Promise<void> {
  console.log('\n── M · ⭐ miras uctan uca: odeme 340 gunu SILMEZ ──');
  const miras = gunSonra(340);
  const d = dunya({ abonelik: mirasSatiri(miras) });

  // FIXTURE KANITI: senaryo AYIRT EDICI mi? Siparisin donem sonu erisimden
  // ERKEN olmali — yoksa eski kod da "uzatir" ve kusur olculmez.
  check('M-FIXTURE satir miras-core · HAVALE · iyzico bagi yok · 340 gun', d.db.satir().paketSurumuId === 's-miras-core' && d.db.satir().odemeYontemi === 'HAVALE' && d.db.satir().iyzicoAbonelikKodu === null && d.db.satir().erisimSonu.getTime() === miras.getTime());

  const donus = await basarir('M0', () => d.satinAlma.donusIyzicodan('tok-1'));
  check('M0 donus: satin alma TAMAMLANDI (gercek giris noktasi)', donus === 'tamam' && d.db.niyetler[0].durum === 'TAMAMLANDI', `donus=${donus} niyet=${d.db.niyetler[0].durum}`);
  check('M0b satir KART + pro-mek + sub-1, erisim 340 gun (satin alma korudu)', d.db.satir().odemeYontemi === 'KART' && d.db.satir().paketSurumuId === 's-pro-mek' && d.db.satir().iyzicoAbonelikKodu === 'sub-1' && d.db.satir().erisimSonu.getTime() === miras.getTime(), gunOlarak(d.db.satir().erisimSonu));

  // Ilk tahsilat (denemesiz ikiz: form aninda cekildi) — donem sonu 30 gun.
  const ilkDonem = gunSonra(30);
  d.siparisEkle('sub-1', 'sip-1', ilkDonem);
  check('M-FIXTURE siparis donem sonu (30 gun) erisimden (340 gun) ERKEN', ilkDonem.getTime() < miras.getTime());
  await basarir('M1', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-1'));
  check('M1 ⭐⭐ ILK TAHSILAT miras erisimini SILMEDI: 340 gun duruyor', d.db.satir().erisimSonu.getTime() === miras.getTime(), gunOlarak(d.db.satir().erisimSonu));
  const m1 = isledi(d, 'sip-1');
  check('M1-KANIT webhook siparisi GERCEKTEN isledi (olay var, kopru duzeltilMEDI)', m1.length === 1 && m1[0].veri?.guncelUcMu === true && m1[0].veri?.kopruDuzeltildi === false, JSON.stringify(m1.map((o: Satir) => o.veri)));
  check('M1b durum AKTIF, dunning sayaclari sifir', d.db.satir().durum === AbonelikDurumu.AKTIF && d.db.satir().denemeSayisi === 0);

  // Ayni siparisin webhook'u iyzico tarafindan TEKRAR gonderilir (~45 dk).
  await basarir('M2', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-1'));
  check('M2 ayni siparis ikinci kez: erisim yine 340 gun', d.db.satir().erisimSonu.getTime() === miras.getTime(), gunOlarak(d.db.satir().erisimSonu));
  check('M2-KANIT ikinci teslim de islendi (2 olay)', isledi(d, 'sip-1').length === 2);

  // Sonraki yenileme (2. ay): donem sonu hala miras bitisinden once.
  d.siparisEkle('sub-1', 'sip-2', gunSonra(61));
  await basarir('M3', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-2'));
  check('M3 ⭐ yenileme (61 gun) de KISALTMAZ: 340 gun', d.db.satir().erisimSonu.getTime() === miras.getTime(), gunOlarak(d.db.satir().erisimSonu));
  check('M3-KANIT yenileme siparisi islendi', isledi(d, 'sip-2').length === 1);

  // Donem sonu miras bitisini GECINCE erisim uzar.
  const otesi = gunSonra(370);
  d.siparisEkle('sub-1', 'sip-13', otesi);
  await basarir('M4', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-13'));
  check('M4 donem sonu miras bitisini gecince (370 gun) erisim UZAR', d.db.satir().erisimSonu.getTime() === otesi.getTime(), gunOlarak(d.db.satir().erisimSonu));
}

// ═══════════════════════════════════════════════════════════════════════════
//  D · KOPRU DUZELTMESI SURER (23.09 inceleme bulgusu 3 — W8'in uctan ucu)
// ═══════════════════════════════════════════════════════════════════════════
async function dBlogu(): Promise<void> {
  console.log('\n── D · kopru duzeltmesi: yeni firmada 33 gun → iyzico donem sonu ──');
  {
    const d = dunya({ abonelik: null });
    const donus = await basarir('D0', () => d.satinAlma.donusIyzicodan('tok-1'));
    check('D0-FIXTURE yeni firma satin aldi: erisimSonu = kopru = 33 gun', donus === 'tamam' && yakin(d.db.satir()?.erisimSonu, 33) && d.db.satir()?.kopruErisimSonu?.getTime() === d.db.satir()?.erisimSonu?.getTime(), gunOlarak(d.db.satir()?.erisimSonu));

    const ilkDonem = gunSonra(30);
    d.siparisEkle('sub-1', 'sip-1', ilkDonem);
    await basarir('D1', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-1'));
    check('D1 ⭐ ilk tahsilat kopruyu DUZELTTI: 33 → 30 gun (kisaltma BURADA gerekli)', d.db.satir().erisimSonu.getTime() === ilkDonem.getTime(), gunOlarak(d.db.satir().erisimSonu));
    check('D1b kopru KAPANDI', d.db.satir().kopruErisimSonu === null, String(d.db.satir().kopruErisimSonu));

    await basarir('D2', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-1'));
    check('D2 ayni siparis tekrar: 30 gun (idempotent)', d.db.satir().erisimSonu.getTime() === ilkDonem.getTime(), gunOlarak(d.db.satir().erisimSonu));

    d.siparisEkle('sub-1', 'sip-2', gunSonra(61));
    await basarir('D3', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-2'));
    check('D3 yenileme uzatir: 61 gun', yakin(d.db.satir().erisimSonu, 61), gunOlarak(d.db.satir().erisimSonu));
  }
  {
    // D4 · denemeli satin alma: ilk cekim deneme sonunda, donem sonu kopruden
    // ILERIDE → uzatir; DENEME → AKTIF; kopru kapanir.
    const d = dunya({ abonelik: null, niyetler: [niyet({ denemeGunu: 30, planKodu: 'plan-pro-mek' })] });
    d.formlar['tok-1'].pricingPlanReferenceCode = 'plan-pro-mek';
    await basarir('D4', () => d.satinAlma.donusIyzicodan('tok-1'));
    check('D4-FIXTURE denemeli satin alma: DENEME, kopru 32 gun', d.db.satir()?.durum === AbonelikDurumu.DENEME && yakin(d.db.satir()?.kopruErisimSonu, 32), `d=${d.db.satir()?.durum} k=${gunOlarak(d.db.satir()?.kopruErisimSonu)}`);
    d.siparisEkle('sub-1', 'sip-1', gunSonra(60));
    await basarir('D4', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-1'));
    check('D4 deneme sonu ilk cekim: AKTIF, 60 gun, kopru kapandi', d.db.satir().durum === AbonelikDurumu.AKTIF && yakin(d.db.satir().erisimSonu, 60) && d.db.satir().kopruErisimSonu === null, `d=${d.db.satir().durum} e=${gunOlarak(d.db.satir().erisimSonu)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  V · SONRADAN VERILEN ERISIM — kopru degisince kisaltma YOK
// ═══════════════════════════════════════════════════════════════════════════
async function vBlogu(): Promise<void> {
  console.log('\n── V · sonradan verilen erisim (havale/yonetici uzatmasi), eski halka ──');
  {
    // V1 · yeni firma kartla aldi (kopru 33 gun), ilk tahsilat GELMEDEN erisim
    // GERCEK `erisimiUzat` ile 12 ay uzatildi (havale onayi / yonetici).
    // Kopru artik `erisimSonu`na esit DEGIL → ilk tahsilat kisaltamaz.
    const d = dunya({ abonelik: null });
    await basarir('V1', () => d.satinAlma.donusIyzicodan('tok-1'));
    const kopru = d.db.satir()?.kopruErisimSonu as Date | undefined;
    await basarir('V1', () => d.abonelik.erisimiUzat(d.db.satir().id, 12, { aktor: 'yonetici', aciklama: 'test uzatmasi' }));
    const uzatilmis = d.db.satir().erisimSonu as Date;
    check('V1-FIXTURE uzatma kopruden 11+ ay ileride', !!kopru && uzatilmis.getTime() - kopru.getTime() > 300 * GUN, `k=${gunOlarak(kopru)} e=${gunOlarak(uzatilmis)}`);
    d.siparisEkle('sub-1', 'sip-1', gunSonra(30));
    await basarir('V1', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-1'));
    check('V1 ⭐ sonradan verilen 12 ay ilk tahsilatta KISALMADI', d.db.satir().erisimSonu.getTime() === uzatilmis.getTime(), gunOlarak(d.db.satir().erisimSonu));
    const v1 = isledi(d, 'sip-1');
    check('V1-KANIT webhook islendi, kopru esitligi bozuk oldugu icin duzeltilMEDI', v1.length === 1 && v1[0].veri?.kopruDuzeltildi === false, JSON.stringify(v1.map((o: Satir) => o.veri)));
  }
  {
    // V2 · ESKI HALKA (23.09 kurali aynen): kopru yerinde olsa bile eski
    // halkanin gec siparisi kisaltmaz ve kopruyu KAPATMAZ (kopru guncel ucun
    // ilk tahsilatini bekler).
    const d = dunya({
      abonelik: mirasSatiri(gunSonra(33), {
        paketSurumuId: 's-pro-mek',
        odemeYontemi: 'KART',
        iyzicoAbonelikKodu: 'uc-2',
        iyzicoKokKodu: 'sub-1',
        kopruErisimSonu: null,
      }),
    });
    const s0 = d.db.satir();
    s0.kopruErisimSonu = s0.erisimSonu; // satin alma koprusu, guncel uc uc-2
    d.detaylar['sub-1'].subscriptionStatus = 'UPGRADED';
    d.siparisEkle('sub-1', 'sip-eski', gunSonra(30));
    await basarir('V2', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-eski'));
    const s = d.db.satir();
    check('V2 eski halka: kopru yerinde ama erisim KISALMADI (33 gun) ve kopru ACIK kaldi', yakin(s.erisimSonu, 33) && s.kopruErisimSonu instanceof Date && s.kopruErisimSonu.getTime() === s.erisimSonu.getTime(), `e=${gunOlarak(s.erisimSonu)} k=${gunOlarak(s.kopruErisimSonu)}`);
    const v2 = isledi(d, 'sip-eski');
    check('V2-KANIT eski halka siparisi islendi (guncelUcMu=false)', v2.length === 1 && v2[0].veri?.guncelUcMu === false, JSON.stringify(v2.map((o: Satir) => o.veri)));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  O · OLAY IZI — "odeme erisimi kisaltti mi" olay kaydindan okunur
// ═══════════════════════════════════════════════════════════════════════════
async function oBlogu(): Promise<void> {
  console.log('\n── O · olay izi ──');
  {
    const miras = gunSonra(340);
    const d = dunya({ abonelik: mirasSatiri(miras) });
    await basarir('O1', () => d.satinAlma.donusIyzicodan('tok-1'));
    const acildi = d.db.olaylar.find((o: Satir) => o.tip === 'abonelik.yeniden.acildi');
    check(
      'O1 yeniden acilma olayi: onceki + yazilan erisim 340 gun, kopru null',
      acildi?.veri?.oncekiErisimSonu === miras.toISOString() && acildi?.veri?.erisimSonu === miras.toISOString() && acildi?.veri?.kopruErisimSonu === null,
      JSON.stringify(acildi?.veri),
    );
    d.siparisEkle('sub-1', 'sip-1', gunSonra(30));
    await basarir('O2', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-1'));
    const tahsilat = d.db.olaylar.filter((o: Satir) => o.tip === 'durum.degisti' && o.aktor === 'webhook').pop();
    check('O2 tahsilat olayi: onceki erisim 340 gun, kopru DUZELTILMEDI', tahsilat?.veri?.oncekiErisimSonu === miras.toISOString() && tahsilat?.veri?.kopruDuzeltildi === false, JSON.stringify(tahsilat?.veri));
  }
  {
    const d = dunya({ abonelik: null });
    await basarir('O3', () => d.satinAlma.donusIyzicodan('tok-1'));
    d.siparisEkle('sub-1', 'sip-1', gunSonra(30));
    await basarir('O3', () => d.abonelik.tahsilatBasarili('sub-1', 'sip-1'));
    const tahsilat = d.db.olaylar.filter((o: Satir) => o.tip === 'durum.degisti' && o.aktor === 'webhook').pop();
    check('O3 yeni firma ilk tahsilat olayi: kopru DUZELTILDI', tahsilat?.veri?.kopruDuzeltildi === true, JSON.stringify(tahsilat?.veri));
    // Onceki deger YENI degerden farkli olmali ki alan ayirt edici olsun (33 → 30).
    check('O3b olaydaki onceki erisim KOPRU (33 gun), yazilan degil (30)', yakin(new Date(tahsilat?.veri?.oncekiErisimSonu), 33), JSON.stringify(tahsilat?.veri));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  B · BAGLANTI — sema alani + goc
// ═══════════════════════════════════════════════════════════════════════════
function bBlogu(): void {
  console.log('\n── B · baglanti: sema + goc ──');
  const KOK = join(__dirname, '..');
  const yorumsuz = (s: string) => s.replace(/\/\/\/?.*$/gm, '').replace(/--.*$/gm, '');
  const sema = yorumsuz(readFileSync(join(KOK, 'prisma', 'schema.prisma'), 'utf8'));
  const model = sema.slice(sema.indexOf('model Abonelik {'), sema.indexOf('}', sema.indexOf('model Abonelik {')));
  check('B0-OLCUT Abonelik modeli bulundu', model.includes('erisimSonu DateTime'));
  check('B1 sema: Abonelik.kopruErisimSonu DateTime? (NULL = kisaltma yok)', /\bkopruErisimSonu\s+DateTime\?/.test(model));

  const goclerKok = join(KOK, 'prisma', 'migrations');
  const eklenen = readdirSync(goclerKok)
    .map((k) => join(goclerKok, k, 'migration.sql'))
    .filter((f) => existsSync(f))
    .map((f) => ({ f, sql: yorumsuz(readFileSync(f, 'utf8')) }))
    .filter((x) => /ADD COLUMN\s+"kopruErisimSonu"\s+TIMESTAMP\(3\)/.test(x.sql));
  check('B2 ⭐ tam bir goc kolonu ekliyor (TIMESTAMP(3), NULL)', eklenen.length === 1, `adet=${eklenen.length}`);
  check(
    'B3 goc YALNIZ EKLER (DROP / DELETE / UPDATE / NOT NULL yok)',
    eklenen.length === 1 && !/\b(DROP|DELETE|UPDATE)\b|NOT NULL/i.test(eklenen[0].sql),
    eklenen[0]?.sql.trim(),
  );
}

/** Bir blokta cokme sonrakileri GIZLEMESIN. */
async function blok(ad: string, fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch (e: any) {
    check(`${ad} blogu — BEKLENMEDIK HATA (blok yarida kaldi)`, false, e?.message ?? String(e));
  }
}

async function main(): Promise<void> {
  await blok('K', kBlogu);
  await blok('Y', yBlogu);
  await blok('M', mBlogu);
  await blok('D', dBlogu);
  await blok('V', vBlogu);
  await blok('O', oBlogu);
  await blok('B', bBlogu);

  console.log(`\n${'═'.repeat(60)}\n  MIRAS ERISIMI: ${passed} gecti, ${failed} kaldi\n${'═'.repeat(60)}`);
  if (failed > 0) {
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('BEKLENMEDIK HATA:', e);
  process.exitCode = 1;
});
