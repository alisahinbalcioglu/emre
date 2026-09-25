/**
 * DENEME GERİ SAYIMI İLK ÇEKİM GÜNÜNE SAYAR  (`npm run test:deneme-geri-sayim`) · 24.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. GERÇEK `ErisimServisi.karar` bellek-Prisma üzerinde koşar;
 * DENEME satırının tarihleri satın almanın KENDİ fonksiyonundan
 * (`donemTarihleriHesapla`) gelir — fixture tarih UYDURMAZ. B bloğu satırı
 * satın almanın GERÇEK yazma yolundan (`aboneligiAcVeyaGuncelle`) üretir.
 *
 * ── NEDEN ─────────────────────────────────────────────────────────────────
 * `erisimSonu` 2 günlük webhook tamponu TAŞIR (`TAMPON_GUN`); iyzico ilk
 * çekimi `denemeSonu`nda yapar. Şerit ("Deneme sürenizin bitmesine N gün
 * kaldı") ve Hesabım'daki "N gün kaldı" (`kalanGun`) `erisimSonu`na
 * sayıyordu. ÖLÇÜLDÜ (24.09, bu dosyanın ilk sürümü): çekime 1,5 gün varken
 * "4 gün kaldı", çekim günü GEÇTİKTEN sonra 2 gün daha "2/1 gün kaldı".
 * Uyarının tek işi müşteriyi ilk çekimden ÖNCE uyarmak; `donemTarihleriHesapla`
 * yorumu bu yalanı adıyla yasaklıyor ("ekran '2 gün daha deneme var' der").
 *
 * KARAR (Emre, 24.09): geri sayım `denemeSonu`na. Çekim günü geçip tampon
 * sürerken "Deneme süreniz sona erdi · İlk ödemeniz işleniyor" (bilgi,
 * düğmesiz), `kalanGun` 0. "Deneme süreniz doldu" DEĞİŞMEZ (erişim kapanınca).
 * `denemeSonu` boşsa eski davranış (`erisimSonu`).
 *
 * ⚠ ERİŞİM KARARI DEĞİŞMEZ: `abonelik-erisim.ts` `erisimSonu`nu okur — tampon
 * geç gelen webhook'ta ÖDEYEN müşteriyi kapıda bırakmasın diye var. E bloğu
 * her saat için servis kararını saf çekirdekle KARŞILAŞTIRIR; `abonelik-
 * erisim-test` T bloğu bunu göremez (sahte satırında `denemeSonu` YOK).
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   F  fixture: tarihler satın alma fonksiyonundan, tampon TAM 2 gün
 *   G  zaman çizelgesi: sabit beklentiler (gün, şerit, seviye) + 1 saatlik
 *      tarama değişmezleri (negatif gün yok, "bitmesine 0" yok, şerit = kalanGun)
 *   T  tampon penceresi: "sona erdi · ilk ödemeniz işleniyor", düğmesiz, erişim açık
 *   D  "Deneme süreniz doldu" değişmedi — erisimSonu anında, 1 ms önce DEĞİL
 *   N  `denemeSonu` boş / alan yok → eski davranış (erisimSonu'na sayar)
 *   E  erişim kararı değişmedi: 801 saatte servis ≡ saf çekirdek (erisimSonu)
 *   B  BAĞLANTI: satın almanın gerçek yazma yolu (ilk alım + geri dönen müşteri)
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { abonelikErisimi } from '../src/altyapi/auth/abonelik-erisim';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import {
  SatinAlmaServisi,
  TAMPON_GUN,
  donemTarihleriHesapla,
} from '../src/ozellik/odeme/abonelik/satinalma.servisi';
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

const SAAT = 3_600_000;
const GUN = 24 * SAAT;
/** Denemenin başladığı an: `denemeSonu` = 31.10 09:00, `erisimSonu` = 02.11 09:00. */
const BASLANGIC = new Date('2026-10-01T09:00:00.000Z');
const DENEME_GUNU = 30;
const an = (saat: number) => new Date(BASLANGIC.getTime() + saat * SAAT);

const SONA_ERDI_BASLIK = 'Deneme süreniz sona erdi';
const SONA_ERDI_METIN = 'İlk ödemeniz işleniyor; hesabınızı kullanmaya devam edebilirsiniz.';
const DOLDU_BASLIK = 'Deneme süreniz doldu';
const DOLDU_METIN =
  'Tekliflerinize erişmeye devam etmek için bir paket seçin. Verileriniz duruyor, silinmedi.';
const geriSayimBasligi = (gun: number) => `Deneme sürenizin bitmesine ${gun} gün kaldı`;

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — `karar` ve satın almanın yazma yolunun dokunduğu yüzey
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: { paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' } },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
};

/**
 * Prisma, verilmeyen opsiyonel alanı `null` döndürür (undefined DEĞİL) ve
 * şema varsayılanını uygular (`durum @default(DENEME)`). Yazma yolu
 * `denemeSonu`nu yazmayı unutursa satır NULL taşır — taklit de öyle.
 */
const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    durum: 'DENEME',
    denemeSonu: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null, iyzicoMusteriKodu: null,
    iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART', ilkBasarisizlik: null,
    denemeSayisi: 0, sonDeneme: null, kisitlandi: null, iptalTalebi: null, iptalNedeni: null,
    olusturuldu: new Date(), guncellendi: new Date(),
  }),
};

/** Yalnız skaler eşitlik; operatör nesnesi gelirse PATLAR (sessizce yok saymaz). */
function whereUygula(satir: Satir, where: any): boolean {
  for (const [k, v] of Object.entries(where ?? {})) {
    if (v !== null && typeof v === 'object') {
      throw new Error(`bellek-Prisma: desteklenmeyen kosul ${k}=${JSON.stringify(v)}`);
    }
    if (satir[k] !== v) return false;
  }
  return true;
}

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);

  // Prisma her okumada TAZE nesne döndürür (kopya) ve ilişkiyi yalnız
  // `include` ile getirir; bilinmeyen ilişkide PATLAR.
  function yansit(model: string, satir: Satir, spec: any): Satir {
    if (spec?.select) throw new Error('bellek-Prisma: select bu pakette beklenmiyor');
    const sonuc: Satir = { ...satir };
    for (const [k, v] of Object.entries(spec?.include ?? {})) {
      if (!v) continue;
      const il = ILISKILER[model]?.[k];
      if (!il) throw new Error(`bellek-Prisma: bilinmeyen iliski ${model}.${k}`);
      const hedef = tablo(il.model).find((r) => r.id === satir[il.yerel]);
      sonuc[k] = hedef ? yansit(il.model, hedef, v === true ? {} : v) : null;
    }
    return sonuc;
  }

  function olustur(model: string, data: Satir): Satir {
    const satir: Satir = { id: randomUUID(), ...(VARSAYILAN[model]?.() ?? {}) };
    for (const [k, v] of Object.entries(data)) if (v !== undefined) satir[k] = v;
    tablo(model).push(satir);
    return satir;
  }

  const modelYuzu = (model: string) => ({
    findUnique: async (arg: any) => {
      await Promise.resolve();
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      return s ? yansit(model, s, arg) : null;
    },
    create: async (arg: any) => {
      await Promise.resolve();
      return yansit(model, olustur(model, arg.data), arg);
    },
    update: async (arg: any) => {
      await Promise.resolve();
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (!s) throw Object.assign(new Error(`${model} guncellenecek satir yok`), { code: 'P2025' });
      // `undefined` = "dokunma" (Prisma sözleşmesi).
      for (const [k, v] of Object.entries(arg.data)) if (v !== undefined) s[k] = v;
      return yansit(model, s, arg);
    },
  });

  const prisma: any = new Proxy(
    {},
    { get: (_h, ad: string) => (ad === 'then' ? undefined : modelYuzu(ad)) },
  );
  return { prisma, tablo, ekle: olustur };
}

function dunyaKur() {
  const db = bellekPrisma();
  db.ekle('paket', { id: 'P1', kod: 'pro-mek', kullaniciHakki: 2, dwgAktif: true });
  db.ekle('paketSurumu', { id: 'S30', paketId: 'P1', denemeGunu: DENEME_GUNU });
  const erisim = new ErisimServisi(db.prisma);

  /** Kartlı DENEME satırı — tarihler satın almanın fonksiyonundan. */
  function denemeSatiri(firmaId: string, ek: Satir = {}): Satir {
    const { erisimSonu, denemeSonu } = donemTarihleriHesapla(BASLANGIC, DENEME_GUNU);
    return db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S30', durum: 'DENEME', erisimSonu, denemeSonu, ...ek,
    });
  }
  return { db, erisim, denemeSatiri };
}

// ═════════════════════════════════════════════════════════════════════════
//  F — FIXTURE: tarihler satın alma fonksiyonundan
// ═════════════════════════════════════════════════════════════════════════
function fBlogu(): void {
  console.log('\n── F · fixture: tarihler donemTarihleriHesapla\'dan ──');
  const { erisimSonu, denemeSonu } = donemTarihleriHesapla(BASLANGIC, DENEME_GUNU);
  // Ölçüt test edilen fonksiyondan BAĞIMSIZ: ham ISO dizeleri.
  check('F1 denemeSonu = 31.10 09:00 (başlangıç + 30 gün — iyzico bu anda çeker)',
    denemeSonu?.toISOString() === '2026-10-31T09:00:00.000Z', `denemeSonu=${denemeSonu?.toISOString()}`);
  check('F2 erisimSonu = 02.11 09:00 (denemeSonu + TAMPON_GUN = 2 gün)',
    erisimSonu.toISOString() === '2026-11-02T09:00:00.000Z' && TAMPON_GUN === 2,
    `erisimSonu=${erisimSonu.toISOString()} TAMPON_GUN=${TAMPON_GUN}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  G — ZAMAN ÇİZELGESİ
// ═════════════════════════════════════════════════════════════════════════
/** [saat, kalanGun, şerit başlığı | null, seviye | null] — başlangıçtan saat. */
const CIZELGE: Array<[number, number, string | null, string | null]> = [
  [480, 10, null, null], //                         20. gün
  [597, 6, null, null], //                          çekime 5 gün 3 saat: şerit YOK
  [600, 5, geriSayimBasligi(5), 'bilgi'], //        çekime TAM 5 gün: şerit başlar
  [648, 3, geriSayimBasligi(3), 'bilgi'],
  [672, 2, geriSayimBasligi(2), 'uyari'],
  [684, 2, geriSayimBasligi(2), 'uyari'], //        çekime 1,5 gün (eski kod: 4)
  [718, 1, geriSayimBasligi(1), 'uyari'], //        çekime 2 saat (eski kod: 3)
  [720, 0, SONA_ERDI_BASLIK, 'bilgi'], //           TAM çekim anı
  [722, 0, SONA_ERDI_BASLIK, 'bilgi'], //           tampon (eski kod: "2 gün kaldı")
  [744, 0, SONA_ERDI_BASLIK, 'bilgi'], //           tampon (eski kod: "1 gün kaldı")
  [767, 0, SONA_ERDI_BASLIK, 'bilgi'], //           erişim kapanmadan 1 saat önce
  [768, 0, DOLDU_BASLIK, 'kritik'], //              TAM erisimSonu: erişim kapandı
  [792, 0, DOLDU_BASLIK, 'kritik'],
];

async function gBlogu(): Promise<void> {
  console.log('\n── G · zaman çizelgesi: geri sayım ilk çekim gününe ──');
  const d = dunyaKur();
  const ab = d.denemeSatiri('F-G');

  console.log('    saat | çekime | erişime | kalanGun | şerit');
  const sapan: string[] = [];
  for (const [saat, kalanGun, baslik, seviye] of CIZELGE) {
    const k = await d.erisim.karar('F-G', an(saat));
    console.log(
      `    ${String(saat).padStart(4)} | ${String(Math.ceil((ab.denemeSonu - an(saat).getTime()) / GUN)).padStart(6)} | ` +
        `${String(Math.ceil((ab.erisimSonu - an(saat).getTime()) / GUN)).padStart(7)} | ` +
        `${String(k.kalanGun).padStart(8)} | ${k.uyari ? `[${k.uyari.seviye}] ${k.uyari.baslik}` : '(yok)'}`,
    );
    if (k.kalanGun !== kalanGun || (k.uyari?.baslik ?? null) !== baslik || (k.uyari?.seviye ?? null) !== seviye) {
      sapan.push(`${saat}s: kalanGun=${k.kalanGun}/${kalanGun} baslik=${k.uyari?.baslik ?? null} seviye=${k.uyari?.seviye ?? null}`);
    }
  }
  check(`G1 ⭐ ${CIZELGE.length} noktanın hepsinde kalanGun, şerit ve seviye beklenen (çekim gününe sayar)`,
    sapan.length === 0, sapan.join(' · '));

  const g2 = await d.erisim.karar('F-G', an(684));
  check('G2 ⭐ çekime 1,5 gün varken kalanGun 2 — eski kod erisimSonu\'na sayıp 4 diyordu',
    g2.kalanGun === 2 && g2.uyari?.baslik === geriSayimBasligi(2), `kalanGun=${g2.kalanGun} baslik=${g2.uyari?.baslik}`);

  // 1 saatlik tarama: tek tek noktaların arasında kalan her an.
  const ihlal: string[] = [];
  let taranan = 0;
  for (let saat = 0; saat <= 800; saat++) {
    const k = await d.erisim.karar('F-G', an(saat));
    taranan++;
    const b = k.uyari?.baslik ?? '';
    if (!(Number.isInteger(k.kalanGun) && (k.kalanGun as number) >= 0)) ihlal.push(`${saat}s kalanGun=${k.kalanGun}`);
    if (/bitmesine -|bitmesine 0 /.test(b)) ihlal.push(`${saat}s "${b}"`);
    const sayi = /bitmesine (\d+) gün/.exec(b)?.[1];
    if (sayi !== undefined && Number(sayi) !== k.kalanGun) ihlal.push(`${saat}s şerit=${sayi} kalanGun=${k.kalanGun}`);
  }
  check('G3 801 saatlik taramada: kalanGun hep ≥ 0 tam sayı, "bitmesine 0/-N" yok, şerit sayısı = kalanGun',
    taranan === 801 && ihlal.length === 0, `taranan=${taranan} ${ihlal.slice(0, 5).join(' · ')}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  T — TAMPON PENCERESİ: çekim günü geçti, erişim sürüyor
// ═════════════════════════════════════════════════════════════════════════
async function tBlogu(): Promise<void> {
  console.log('\n── T · tampon penceresi (denemeSonu ≤ şimdi < erisimSonu) ──');
  const d = dunyaKur();
  d.denemeSatiri('F-T');
  const k = await d.erisim.karar('F-T', an(722)); // çekimden 2 saat sonra
  check('T1 ⭐ şerit "Deneme süreniz sona erdi · İlk ödemeniz işleniyor…" (bilgi)',
    k.uyari?.baslik === SONA_ERDI_BASLIK && k.uyari?.metin === SONA_ERDI_METIN && k.uyari?.seviye === 'bilgi',
    JSON.stringify(k.uyari));
  check('T2 ⭐ düğme YOK — müşterinin paketi zaten var ("Paket seç" ikinci satın almaya çağırırdı)',
    !!k.uyari && k.uyari.eylem === undefined, JSON.stringify(k.uyari?.eylem));
  check('T3 ⭐ erişim AÇIK, salt-okunur değil (tampon ödeyeni korur) · kalanGun 0',
    k.erisimVar === true && k.saltOkunur === false && k.kalanGun === 0,
    `erisim=${k.erisimVar} salt=${k.saltOkunur} kalan=${k.kalanGun}`);
  check('T4 tamponda "Deneme süreniz doldu" GÖRÜNMEZ (o metin "paket seçin" der, erişim kapanınca çıkar)',
    k.uyari?.baslik !== DOLDU_BASLIK && k.durum === 'DENEME', `baslik=${k.uyari?.baslik}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  D — "DENEME SÜRENİZ DOLDU" DEĞİŞMEDİ
// ═════════════════════════════════════════════════════════════════════════
async function dBlogu(): Promise<void> {
  console.log('\n── D · "Deneme süreniz doldu" — erisimSonu anında, değişmedi ──');
  const d = dunyaKur();
  const ab = d.denemeSatiri('F-D');
  const k = await d.erisim.karar('F-D', new Date(ab.erisimSonu.getTime()));
  check('D1 ⭐ TAM erisimSonu anında: "Deneme süreniz doldu" (kritik) · Paket seç · kalanGun 0 · erişim KAPALI',
    k.uyari?.baslik === DOLDU_BASLIK && k.uyari?.seviye === 'kritik' && k.uyari?.metin === DOLDU_METIN &&
      k.uyari?.eylem?.etiket === 'Paket seç' && k.uyari?.eylem?.yol === '/abonelik' &&
      k.kalanGun === 0 && k.erisimVar === false,
    JSON.stringify(k));
  const once = await d.erisim.karar('F-D', new Date(ab.erisimSonu.getTime() - 1));
  check('D2 sınır: erisimSonu\'ndan 1 ms önce "doldu" DEĞİL, "sona erdi" (erişim hâlâ açık)',
    once.uyari?.baslik === SONA_ERDI_BASLIK && once.erisimVar === true, `baslik=${once.uyari?.baslik}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  N — denemeSonu BOŞ → ESKİ DAVRANIŞ
// ═════════════════════════════════════════════════════════════════════════
async function nBlogu(): Promise<void> {
  console.log('\n── N · denemeSonu boş → eski davranış (erisimSonu\'na sayar) ──');
  // Eski davranışın beklentileri ilk sürümün ölçüm tablosundan (24.09):
  // 25. gün → 7, 28,5. gün → 4, 31. gün → 1.
  const beklenen: Array<[number, number, string | null]> = [
    [600, 7, null], [684, 4, geriSayimBasligi(4)], [744, 1, geriSayimBasligi(1)],
  ];
  for (const [etiket, ek] of [
    ['NULL', { denemeSonu: null }],
    ['alan YOK', { denemeSonu: undefined }],
  ] as const) {
    const d = dunyaKur();
    const ab = d.denemeSatiri('F-N', ek);
    if (etiket === 'alan YOK') delete ab.denemeSonu;
    const sapan: string[] = [];
    for (const [saat, kalanGun, baslik] of beklenen) {
      const k = await d.erisim.karar('F-N', an(saat));
      if (k.kalanGun !== kalanGun || (k.uyari?.baslik ?? null) !== baslik) {
        sapan.push(`${saat}s kalanGun=${k.kalanGun}/${kalanGun} baslik=${k.uyari?.baslik ?? null}`);
      }
    }
    check(`N-${etiket} ⭐ denemeSonu ${etiket}: geri sayım erisimSonu'na (7 · 4 · 1 gün), şerit eski metin`,
      sapan.length === 0 && ('denemeSonu' in ab) === (etiket === 'NULL'), sapan.join(' · '));
  }
  // ÖLÇÜT: N kör değil — aynı an denemeSonu DOLUYKEN başka sayı verir.
  const d = dunyaKur();
  d.denemeSatiri('F-N');
  const dolu = await d.erisim.karar('F-N', an(684));
  check('N-OLCUT aynı an (684s) denemeSonu doluyken 2 — N blokları aynı sayıyı tesadüfen görmüyor',
    dolu.kalanGun === 2, `kalanGun=${dolu.kalanGun}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  E — ERİŞİM KARARI DEĞİŞMEDİ (servis ≡ saf çekirdek, erisimSonu)
// ═════════════════════════════════════════════════════════════════════════
async function eBlogu(): Promise<void> {
  console.log('\n── E · erişim kararı erisimSonu\'na bağlı kaldı ──');
  const d = dunyaKur();
  const ab = d.denemeSatiri('F-E');
  const bolge = { deneme: 0, tampon: 0, kapali: 0 };
  const ayrisan: string[] = [];
  for (let saat = 0; saat <= 800; saat++) {
    const simdi = an(saat);
    const k = await d.erisim.karar('F-E', simdi);
    const c = abonelikErisimi({ durum: 'DENEME', erisimSonu: ab.erisimSonu }, simdi);
    if (simdi < ab.denemeSonu) bolge.deneme++;
    else if (simdi < ab.erisimSonu) bolge.tampon++;
    else bolge.kapali++;
    if (k.erisimVar !== c.erisimVar || k.saltOkunur !== c.saltOkunur) {
      ayrisan.push(`${saat}s servis={${k.erisimVar},${k.saltOkunur}} cekirdek={${c.erisimVar},${c.saltOkunur}}`);
    }
  }
  check('E-FIXTURE tarama üç bölgeye de düştü (deneme 720 · tampon 48 · kapalı 33 saat)',
    bolge.deneme === 720 && bolge.tampon === 48 && bolge.kapali === 33, JSON.stringify(bolge));
  check('E1 ⭐ 801 saatin hepsinde servis erişimi = saf çekirdek (erisimSonu) — denemeSonu erişimi KESMEZ',
    ayrisan.length === 0, ayrisan.slice(0, 5).join(' · '));
  const tampon = await d.erisim.karar('F-E', new Date(ab.denemeSonu.getTime() + 1));
  check('E2 ⭐ çekim anından 1 ms sonra erişim AÇIK (tampon ödeyeni kapıda bırakmaz)',
    tampon.erisimVar === true && tampon.saltOkunur === false, `erisim=${tampon.erisimVar}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  B — BAĞLANTI: satın almanın GERÇEK yazma yolu → karar
// ═════════════════════════════════════════════════════════════════════════
async function bBlogu(): Promise<void> {
  console.log('\n── B · bağlantı: aboneligiAcVeyaGuncelle → karar ──');
  const d = dunyaKur();
  // Yazma yolu yalnız `prisma`yı kullanır; kurucu `UYGULAMA_URL`i okur.
  const satinAlma = new SatinAlmaServisi(
    d.db.prisma, {} as any, {} as any, { get: () => undefined } as any, {} as any, {} as any,
  );
  const ac = (firmaId: string) =>
    (satinAlma as any).aboneligiAcVeyaGuncelle({
      firmaId, paketSurumuId: 'S30', iyzicoAbonelikKodu: `sub-${firmaId}`, denemeGunu: DENEME_GUNU,
    });

  // Yazma yolu `new Date()` okur: çekim anı satın almanın ÖNCESİ/SONRASI
  // saatle sınırlanır. Karar anı satırın KENDİ tarihinden DEĞİL, satın alma
  // anından türetilir (satır `denemeSonu`nu yazmazsa ölçüt onunla kaymasın).
  const alimaKadar = async (firmaId: string) => {
    const once = Date.now();
    await ac(firmaId);
    const sonra = Date.now();
    return { once, sonra, ab: d.db.tablo('abonelik').find((r) => r.firmaId === firmaId)! };
  };
  const tarihler = (ab: Satir, once: number, sonra: number) =>
    ab.denemeSonu instanceof Date &&
    ab.denemeSonu.getTime() >= once + 30 * GUN && ab.denemeSonu.getTime() <= sonra + 30 * GUN &&
    ab.erisimSonu.getTime() - ab.denemeSonu.getTime() === 2 * GUN;

  // ── İlk alım (create yolu) ─────────────────────────────────────────────
  const b1 = await alimaKadar('F-B1');
  check('B-FIXTURE ilk alım: DENEME, denemeSonu = alım + 30 gün, erisimSonu = denemeSonu + 2 gün',
    b1.ab?.durum === 'DENEME' && tarihler(b1.ab, b1.once, b1.sonra),
    `durum=${b1.ab?.durum} denemeSonu=${b1.ab?.denemeSonu} erisimSonu=${b1.ab?.erisimSonu?.toISOString?.()}`);
  // Alımdan 28,5 gün sonra: çekime 1,5 gün (+ alımın süresi) var.
  const k1 = await d.erisim.karar('F-B1', new Date(b1.once + 30 * GUN - 36 * SAAT));
  check('B1 ⭐ satın almanın yazdığı satırda çekime 1,5 gün → kalanGun 2, şerit "2 gün kaldı"',
    k1.kalanGun === 2 && k1.uyari?.baslik === geriSayimBasligi(2), `kalanGun=${k1.kalanGun} baslik=${k1.uyari?.baslik}`);

  // ── Geri dönen müşteri (update yolu): havale ASKIDA satırı, deneme yok ──
  d.db.ekle('abonelik', {
    firmaId: 'F-B2', paketSurumuId: 'S30', durum: 'ASKIDA', odemeYontemi: 'HAVALE',
    erisimSonu: new Date(Date.now() - 10 * GUN), denemeSonu: null,
  });
  const b2 = await alimaKadar('F-B2');
  check('B2-FIXTURE geri dönen: ASKIDA → DENEME, denemeSonu YAZILDI (eskisi NULL idi)',
    b2.ab.durum === 'DENEME' && tarihler(b2.ab, b2.once, b2.sonra),
    `durum=${b2.ab.durum} denemeSonu=${b2.ab.denemeSonu}`);
  const k2 = await d.erisim.karar('F-B2', new Date(b2.once + 30 * GUN - 36 * SAAT));
  check('B2 ⭐ geri dönen müşteride de geri sayım çekim gününe (2, eski NULL\'a düşseydi 4)',
    k2.kalanGun === 2, `kalanGun=${k2.kalanGun}`);
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nDENEME GERİ SAYIMI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

/**
 * Bir bloğun fırlatması KIRMIZI bir assert olur, koşuyu bitirmez: kalan
 * bloklar yine koşar ve özet satırı (regresyon tablosunun okuduğu) basılır.
 */
async function blok(ad: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    check(`${ad} bloğu çökmeden bitti`, false, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

async function main(): Promise<void> {
  await blok('F', fBlogu);
  await blok('G', gBlogu);
  await blok('T', tBlogu);
  await blok('D', dBlogu);
  await blok('N', nBlogu);
  await blok('E', eBlogu);
  await blok('B', bBlogu);
  son();
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
