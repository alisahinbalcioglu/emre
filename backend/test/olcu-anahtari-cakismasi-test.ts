/**
 * OLCU ANAHTARI CAKISMASI — HAFIZA YOLUNDAN GERI ACILAN CC KAPISI
 *   npm run test:olcu-anahtari      (DB GEREKMEZ)
 *
 * ── OLCULEN IKI BAGIMSIZ KUSUR (27.08.2026, olcum turu) ──
 *
 * (1) IMZA CAKISMASI. `buildImza` olcu bilesenini `generateTags` etiketinden
 *     alir; o da `normalizer.extractDiameter`e dayanir. Oradaki tam-inc
 *     yakalayicisinin SOL SINIRI YOKTU: '1/4"' metninin ICINDEN '4"' parcasini
 *     yakaliyordu. Cevrilemez kesirler REVERSE_DIAMETER'da KAYITLI OLMADIGI
 *     icin (K2 kumesi) once fracRe bos doner, overlap korumasi da bos kume
 *     uzerinde calisamaz. Olculdu (27.08):
 *        dn200 <= 1/8" | 3/8" | 5/8" | 7/8" | 8"     (BES olcu TEK anahtar)
 *        dn100 <= 1/4" | 4"
 *     Yani kullanicinin 4" satirinda verdigi karar, 1/4" satirinin hafiza
 *     anahtarina yaziliyordu ve tersi. Motorun KENDI cap yolu (extractSizeInfo /
 *     line-parser / buildProductIndex.capTags) bu yazimlarda DOGRU davraniyor —
 *     kusur yalniz ETIKET katmanindaydi.
 *
 * (2) HAFIZA OTOYAZISI 'cap-cevrilemedi' KAPISINI OKUMUYORDU. 26.08'de
 *     (K2/CC) "satirin capi cevrim tablosunda yok → fiyat otomatik yazilmaz"
 *     kapisi kondu. Ama `MatchResult` sozlesmesi `outcome.kapilar`dan yalniz
 *     `yuzey-genisletildi`i tasiyordu (outcome-mapper.ts). Dolayisiyla
 *     matching.service'teki otoyaz kosulu CC'yi GOREMIYOR ve hafiza kaydi
 *     varken kapinin UYARI CUMLESINI SILIP fiyati 'high' yaziyordu.
 *     Bu kusur (1)'den BAGIMSIZDIR: cakisma olmasa da ayni satir imzasina
 *     kullanici bir kez cevap verdiginde kapi dusuyordu.
 *
 * ── YAPI ──
 *   Ö*  → OLCUT KONTROLU / FIXTURE KANITI. Bunlar gecmeden asagisi kanit degil.
 *   A-R*→ (1) imza cakismasi
 *   A-P*→ (1)'in PARA sonucu (uretim yolu: remember → bulkMatch)
 *   B-R*→ (2) CC kapisi (para: onaysiz yazim)
 *   L*  → ★ REGRESYON KILIDI: bugun dogru olan davranis bozulmamali.
 *
 * ERISIM GEREKCESI: `buildImza` TypeScript'te `private` — derleme-zamani
 * kisitidir, calisma zamaninda normal metottur (imza-ekseni-test.ts ile ayni
 * gerekce). Uretim koduna test icin gorunurluk degisikligi YAPILMADI.
 */

import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';
import { generateTags } from '../src/ozellik/eslestirme/matching/tag-generator';
import { extractDiameter } from "../src/ozellik/eslestirme/matching/normalizer";
import { extractSizeInfo } from '../src/ozellik/eslestirme/matching/conversion';

function lib(name: string, price: number) {
  return { id: `lib-${name}`, material: null, materialName: name, customPrice: null, listPrice: price, discountRate: 0 };
}

function fakePrisma(brandName: string, libRows: any[]): any {
  const memStore = new Map<string, any>();
  const memKey = (w: any) => `${w.userId_imza.userId}|${w.userId_imza.imza}`;
  return {
    userLibrary: { findMany: async (args: any) => {
      const b = args?.where?.brandId;
      if (b && typeof b === 'object' && 'not' in b) return [];
      return libRows;
    } },
    brand: { findUnique: async () => ({ name: brandName }) },
    eslesmeHafizasi: {
      findUnique: async ({ where }: any) => memStore.get(memKey(where)) ?? null,
      upsert: async ({ where, update, create }: any) => {
        const k = memKey(where);
        const ex = memStore.get(k);
        if (ex) { ex.secilenAd = update.secilenAd ?? ex.secilenAd; ex.secimSayisi++; }
        else memStore.set(k, { ...create, secimSayisi: 1 });
      },
    },
    terminologyAlias: {
      findMany: async () => ALIAS_SEEDS.map((s, i) => ({ id: `a${i}`, userId: null, active: true, ...s })),
    },
  };
}

function makeService(brandName = 'TEST MARKA', libRows: any[] = []): MatchingService {
  const prisma = fakePrisma(brandName, libRows);
  const term = new TerminologyService(prisma);
  const fakeFx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }) } as any;
  return new MatchingService(prisma, term, fakeFx);
}

const BRAND = 'brand-1';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Payda: motorun cevrim tablosunun KAPSADIGI + KAPSAMADIGI inc yazimlari. */
const INC_YAZIMLARI = [
  '1/8"', '1/4"', '3/8"', '1/2"', '5/8"', '3/4"', '7/8"', '1"',
  '1 1/4"', '1 1/2"', '2"', '2 1/2"', '3"', '4"', '5"', '6"', '8"',
];

async function run() {
  const svc: any = makeService();
  const imza = (n: string) => svc.buildImza(n, BRAND) as string | null;

  // ═══════════════════════════════════════════════════════════════
  // Ö — OLCUT KONTROLU / FIXTURE KANITI
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── Ö: ÖLÇÜT KONTROLÜ (bunlar geçmeden aşağısı kanıt değil) ──');

  {
    // Ö1: olcum araci calisiyor — imza URETILIYOR (null degil).
    const a = imza('4" Küresel Vana Pirinç');
    check('Ö1 imza üretiliyor (ölçüt kör değil)', typeof a === 'string' && a.length > 0, `imza=${a}`);
  }
  {
    // Ö2: KONTROL GRUBU — cevrim tablosundaki kesirler bugun DOGRU ayrisiyor.
    //     Bu gecmezse "cakisma" iddiasi tum kesirlere ait olurdu, koke degil.
    const a = imza('1/2" Küresel Vana Pirinç');
    const b = imza('2" Küresel Vana Pirinç');
    check('Ö2 kontrol grubu: 1/2" ile 2" imzaları FARKLI (tablo içi kesirler sağlam)',
      a !== b, `${a} vs ${b}`);
  }
  {
    // Ö3: FIXTURE KANITI — extractSizeInfo bu yazimlarin HEPSINI cozuyor,
    //     yani "olcu zaten belirsiz" savunmasi gecersiz. Payda basilir.
    const cozulen = INC_YAZIMLARI.filter((y) => extractSizeInfo(`${y} Küresel Vana`) !== null);
    check(`Ö3 extractSizeInfo payda ${INC_YAZIMLARI.length} yazımın hepsini çözüyor`,
      cozulen.length === INC_YAZIMLARI.length,
      `çözülen=${cozulen.length}/${INC_YAZIMLARI.length} · çözülemeyen=${INC_YAZIMLARI.filter((y) => !cozulen.includes(y)).join(' ')}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // A-R — (1) IMZA CAKISMASI
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── A-R: İMZA ÇAKIŞMASI ──');

  {
    // A-R1: en dar kanit — iki FARKLI fiziksel olcu, TEK anahtar.
    const a = imza('1/4" Küresel Vana Pirinç');
    const b = imza('4" Küresel Vana Pirinç');
    check('A-R1 1/4" ile 4" AYRI imza almalı', a !== b, `ikisi de "${a}"`);
  }
  {
    const a = imza('3/8" Küresel Vana Pirinç');
    const b = imza('8" Küresel Vana Pirinç');
    check('A-R2 3/8" ile 8" AYRI imza almalı', a !== b, `ikisi de "${a}"`);
  }
  {
    // A-R3: SAYIMLI kanit — payda VE kirilim basilir (bos kume yalanci yesil vermesin).
    const sahipler = new Map<string, string[]>();
    for (const y of INC_YAZIMLARI) {
      const k = imza(`${y} Küresel Vana Pirinç`);
      if (!k) continue;
      const olcu = k.split('|')[1];
      if (!sahipler.has(olcu)) sahipler.set(olcu, []);
      sahipler.get(olcu)!.push(y);
    }
    const anahtarUreten = [...sahipler.values()].flat().length;
    const cakisan = [...sahipler.entries()].filter(([, ys]) => ys.length > 1);
    const dokum = cakisan.map(([k, ys]) => `${k}<=${ys.join('/')}`).join(' · ');
    check(`A-R3 payda ${INC_YAZIMLARI.length} yazım · anahtar üreten ${anahtarUreten} · ÇAKIŞAN ANAHTAR = 0 olmalı`,
      cakisan.length === 0, `çakışan=${cakisan.length} → ${dokum}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // A-P — (1)'in PARA sonucu: 4" cevabi 1/4" satirina yaziliyor
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── A-P: ÇAKIŞMANIN PARA SONUCU (üretim yolu) ──');

  {
    // ⚠ FIXTURE TASARIMI (27.08'de bu tuzaga 5 kez dusuldu — bkz.
    //   feedback_fixture_dogru_dali_surmeli): hafiza kaydinin `secilenAd`i
    //   ADAYIN materialName'i olmalidir (gorunenAd: "Küresel Vana · Pirinç · 4\""),
    //   HAM kutuphane adi DEGIL. FE de popup'ta secilen ADAYIN adiyla
    //   /matching/remember cagirir. Ham ad verilirse otoyaz dali HIC kosmaz
    //   ve test YANLIS SEBEPLE yesil kalir.
    // 4" satirina taninmayan bir kelime ('zırhlı') eklenir ki satir 'single'
    // yerine 'ask'e dussun — yani kullanici GERCEKTEN popup'tan secsin.
    const URUN = 'Küresel Vana Pirinç 4"';
    const s: any = makeService('TEST MARKA', [lib(URUN, 12500)]);
    const DORT = '4" Küresel Vana Pirinç Zırhlı';
    const CEYREK = '1/4" Küresel Vana Pirinç';

    // MEKANIZMA ASSERT'I (ayri kriter, ayri assert — bkz.
    // feedback_bir_assert_tek_kriter): iki satir AYNI hafiza anahtarina
    // dusuyor mu? A-P1 SONUCU olcer, bu ONKOSULU. Ikisi ayri durmali:
    // olculdu ki A-P1 tek basina iki kapidan HERHANGI biriyle yesil kalir
    // (sol sinir VEYA CC kapisi), yani cakismanin kendisini kanitlamaz.
    const ayniAnahtar = imza(DORT) === imza(CEYREK);
    check('A-P0c MEKANİZMA: 4" ile 1/4" satırları AYNI hafıza anahtarına düşmemeli',
      !ayniAnahtar, `4"→${imza(DORT)} · 1/4"→${imza(CEYREK)}`);

    // FIXTURE KANITI 1: 4" satiri gercekten SORU aciyor (popup yolu kosuyor)
    const dortOnce = (await s.bulkMatch('u1', BRAND, [DORT]))[DORT];
    check('A-P0a FIXTURE KANITI: 4" satırı popup açıyor (aday listesi var)',
      (dortOnce.candidates?.length ?? 0) === 1,
      `conf=${dortOnce.confidence} aday=${dortOnce.candidates?.length ?? 0}`);

    // FIXTURE KANITI 2: hafizasiz halde 1/4" satiri fiyat YAZMIYOR
    // (yani asagidaki yazim gercekten HAFIZADAN geliyor, tesadüf degil).
    const oncesi = (await s.bulkMatch('u1', BRAND, [CEYREK]))[CEYREK];
    check('A-P0b FIXTURE KANITI: hafızasız 1/4" satırı fiyat yazmıyor',
      oncesi.netPrice === 0, `netPrice=${oncesi.netPrice} conf=${oncesi.confidence}`);

    // Kullanici 4" satirinda popup'tan secim yapiyor (uretim yolu: remember)
    const secilen = dortOnce.candidates![0].materialName;
    await s.remember('u1', BRAND, DORT, secilen);

    const sonrasi = (await s.bulkMatch('u1', BRAND, [CEYREK]))[CEYREK];
    check('A-P1 4" seçimi 1/4" satırına fiyat YAZMAMALI',
      sonrasi.netPrice === 0,
      `ayniAnahtar=${ayniAnahtar} netPrice=${sonrasi.netPrice} conf=${sonrasi.confidence} hafizaOtoyaz=${sonrasi.hafizaOtoyaz} matched=${sonrasi.matchedName}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // B-R — (2) HAFIZA OTOYAZISI 'cap-cevrilemedi' KAPISINI SILIYOR
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── B-R: HAFIZA, CC KAPISINI SİLİYOR (bağımsız kusur) ──');

  {
    // ⚠ FIXTURE SECIMI OLCULEREK YAPILDI (mutasyon turu): ilk denemede satir
    //   3/8" idi ve test YANLIS SEBEPLE yesildi — (1)'in duzeltmesinden sonra
    //   3/8" hic ETIKET uretmiyor, dolayisiyla `buildImza` null donuyor ve
    //   hafiza yoluna HIC girilmiyordu. Mutasyon (kapiyi kaldirmak) HAYATTA
    //   KALDI, yani kapinin ortusu SIFIRDI.
    //   Dogru fixture, ETIKET KATMANI ile CEVRIM TABLOSUNUN ayristigi yazim:
    //     8" → extractDiameter = 'dn200' (imza URETILIR)
    //        → celikte cevrilebilir AMA PLASTIKTE cevrilemez (olculdu)
    //   Yani PPR havuzunda 8" satiri hem imza uretir hem CC kapisini atesler.
    //   Payda (olculdu): imza uretip bir sinifta cevrilemeyen yazimlar =
    //     3/16" · 8" · 16" · 18" · 20" · 24"
    const URUN = 'PPR Boru 63 mm';
    const s: any = makeService('TEST MARKA', [lib(URUN, 250)]);
    const SATIR = '8" PPR Boru';

    const oncesi = (await s.bulkMatch('u1', BRAND, [SATIR]))[SATIR];
    // FIXTURE KANITI: CC dali GERCEKTEN kosuyor (mesajla kanitla)
    check('B-R0 FIXTURE KANITI: CC dalı koşuyor ("çevrim tablosunda yok")',
      /çevrim tablosunda yok/.test(oncesi.reason ?? ''), `reason=${oncesi.reason}`);
    check('B-R0b FIXTURE KANITI: hafızasız hâlde fiyat yazılmıyor',
      oncesi.netPrice === 0, `netPrice=${oncesi.netPrice}`);
    check('B-R0c FIXTURE KANITI: TEK aday var (otoyaz dalının ön koşulu)',
      (oncesi.candidates?.length ?? 0) === 1, `aday=${oncesi.candidates?.length ?? 0}`);
    // ⭐ EN KRITIK FIXTURE KANITI: hafiza ANAHTARI gercekten URETILIYOR.
    //   Bu assert olmasaydi (1)'in duzeltmesi imzayi null yapip hafiza yolunu
    //   komple atlatir, B-R1 kapi sayesinde degil ANAHTARSIZLIK sayesinde
    //   yesil kalirdi. Olculdu: tam olarak bu oldu.
    check('B-R0d FIXTURE KANITI: imza ÜRETİLİYOR (hafıza yolu gerçekten sürülüyor)',
      typeof imza(SATIR) === 'string' && (imza(SATIR) ?? '').split('|')[1] === 'dn200',
      `imza=${imza(SATIR)}`);

    // Kullanici bu satirda popup'tan secim yapiyor — `secilenAd` ADAYIN
    // materialName'idir (gorunenAd), ham kutuphane adi DEGIL. Ham ad
    // verilirse otoyaz dali hic kosmaz ve test yanlis sebeple yesil kalir.
    await s.remember('u1', BRAND, SATIR, oncesi.candidates![0].materialName);

    const sonrasi = (await s.bulkMatch('u1', BRAND, [SATIR]))[SATIR];
    check('B-R1 hafıza, çevrilemez çap kapısını SİLMEMELİ (fiyat otomatik yazılmamalı)',
      sonrasi.netPrice === 0,
      `netPrice=${sonrasi.netPrice} conf=${sonrasi.confidence} hafizaOtoyaz=${sonrasi.hafizaOtoyaz} reason=${sonrasi.reason}`);
    check('B-R2 kalem ekrandan DÜŞMEMELİ — aday listesi korunmalı (S4 çizgisi)',
      (sonrasi.candidates?.length ?? 0) > 0,
      `candidates=${sonrasi.candidates?.length ?? 0} conf=${sonrasi.confidence}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // C-R — (3) CIPLAK MM DALI INC ISARETINI GORMEZDEN GELIYOR
  //
  // extractDiameter'in SON dali (normalizer.ts): ad'da plastik kelimesi
  // (ppr/pvc/pe/hdpe) geciyorsa "bagimsiz 2-3 haneli sayi = DIS CAP (mm)"
  // sayar. Bu dal INC ISARETINI (") gormezden geliyordu, dolayisiyla
  // cevrim tablosunda karsiligi olmayan inc yazimlarini MILIMETRE okuyordu:
  //     20" PPR Boru  → dn20   (=3/4"!  20 inc ≈ DN500 — 25 KAT)
  //     16" PPR Boru  → od-16  (3/16" ile AYNI anahtar)
  //     18" PVC Boru  → od-18  ("18 mm" ile AYNI anahtar)
  //     24" PVC Boru  → od-24  ("24 mm" ile AYNI anahtar)
  // Olculdu (payda 13 inc yazimi × 4 plastik aile = 52): 20 kombinasyon
  // yanlis etiket uretiyor; plastik kelimesi OLMAYAN kontrol grubunda
  // (13 yazim) hepsi null — yani kusur bu dala OZGU.
  //
  // ⚠ SINIFI DURUSTCE: bu kusurun PARA yolu, yukaridaki (2) numarali CC
  //   kapisi tarafindan ZATEN kapatiliyor (olculdu: dort senaryoda da hedef
  //   satirda capCevrilemedi=true, otomatik yazim YOK). Kalan zarar hafiza
  //   ANAHTAR UZAYININ kirlenmesi (yanlis on-secim) ve ayni etiketin
  //   backfillTags/Material.tags ile iscilik eslestirmesine tasinmasidir —
  //   o yollar bu turda OLCULMEDI, iddia edilmiyor.
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── C-R: ÇIPLAK MM DALI İNÇ İŞARETİNİ GÖRMÜYOR ──');

  const PLASTIK_AILELER = ['PPR Boru', 'PVC Pis Su Borusu', 'HDPE PE100 Boru', 'PVC Boru'];
  const CEVRILEMEZ_INC = ['3/16"', '7"', '9"', '10"', '12"', '14"', '16"', '18"', '20"', '24"'];

  {
    // C-Ö FIXTURE KANITI: kusur bu DALA ozgu — plastik kelimesi olmayan
    // ayni yazimlar bugun de null donuyor. Bu gecmezse "inc yazimi etiket
    // uretiyor" iddiasi baska bir dala ait olurdu.
    const kontrol = CEVRILEMEZ_INC
      .map((y) => `${y} Küresel Vana Pirinç`)
      .filter((m) => extractDiameter(m) !== null);
    check(`C-Ö FIXTURE KANITI: plastik kelimesi YOKken bu ${CEVRILEMEZ_INC.length} yazım etiket üretmiyor`,
      kontrol.length === 0, `üreten=${kontrol.join(' | ')}`);
  }
  {
    // C-Ö2: extractSizeInfo bu yazimlari DOGRU cozuyor — yani bilgi kaynagi
    // saglam, kusur yalniz etiket dalinda.
    const si20 = extractSizeInfo('20" PPR Boru');
    const siCeyrek = extractSizeInfo('3/4" PPR Boru');
    check('C-Ö2 FIXTURE KANITI: extractSizeInfo 20" ile 3/4"ü AYIRIYOR',
      si20?.display === '20"' && siCeyrek?.display === '3/4"',
      `20"→${si20?.display} · 3/4"→${siCeyrek?.display}`);
  }
  /**
   * OLCUT: iki satir AYNI NULL-OLMAYAN anahtari PAYLASMAMALI.
   * `null === null` cakisma DEGILDIR: `buildImza` null donunce hafizaya
   * hicbir sey yazilmaz/okunmaz (DUZELTME E), yani ortak anahtar yoktur.
   * Duz `a !== b` yazsaydim iki null'da YANLIS SEBEPLE kirmizi verirdi.
   */
  const anahtarPaylasiyor = (a: string, b: string) => {
    const ia = imza(a);
    return ia !== null && ia === imza(b);
  };

  {
    check('C-R1 20" PPR ile 3/4" PPR aynı anahtarı PAYLAŞMAMALI (25 kat ölçü farkı)',
      !anahtarPaylasiyor('20" PPR Boru', '3/4" PPR Boru'),
      `ikisi de "${imza('20" PPR Boru')}"`);
  }
  {
    check('C-R2 16" PPR ile 3/16" PPR aynı anahtarı PAYLAŞMAMALI',
      !anahtarPaylasiyor('16" PPR Boru', '3/16" PPR Boru'),
      `ikisi de "${imza('16" PPR Boru')}"`);
  }
  {
    check('C-R3 18" PVC ile "18 mm" PVC aynı anahtarı PAYLAŞMAMALI (inç ≠ milimetre)',
      !anahtarPaylasiyor('18" PVC Boru', '18 mm PVC Boru'),
      `ikisi de "${imza('18" PVC Boru')}"`);
  }
  {
    // C-R4: SAYIMLI kanit — payda ve kirilim basilir.
    const kirli: string[] = [];
    for (const y of CEVRILEMEZ_INC) {
      for (const a of PLASTIK_AILELER) {
        const t = extractDiameter(`${y} ${a}`);
        if (t) kirli.push(`${y} ${a}→${t}`);
      }
    }
    const payda = CEVRILEMEZ_INC.length * PLASTIK_AILELER.length;
    check(`C-R4 payda ${payda} (${CEVRILEMEZ_INC.length} inç × ${PLASTIK_AILELER.length} plastik aile) · YANLIŞ ETİKET = 0 olmalı`,
      kirli.length === 0, `kirli=${kirli.length} → ${kirli.slice(0, 6).join(' | ')}${kirli.length > 6 ? ' …' : ''}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // L — ★ REGRESYON KILIDI: bugun DOGRU olan davranis korunmali
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── L: ★ REGRESYON KİLİDİ ──');

  {
    // L1: CEVRILEBILIR capta hafiza otoyazisi CALISMAYA DEVAM etmeli
    //     (17.07 kullanici karari — onay tekrari istenmez).
    //     Soru acilsin diye satira taninmayan bir kelime konur ('zırhlı'):
    //     kapi 'bilinmeyen-kelime'dir, CAP degil — yani duzeltme bu vakaya
    //     DOKUNMAMALI. B-R1 ile ayni yol, tek fark capin cevrilebilir olmasi.
    const URUN = 'Küresel Vana Pirinç 1/2"';
    const s: any = makeService('TEST MARKA', [lib(URUN, 850)]);
    const SATIR = '1/2" Küresel Vana Pirinç Zırhlı';
    const oncesi = (await s.bulkMatch('u1', BRAND, [SATIR]))[SATIR];
    check('L1-Ö FIXTURE KANITI: hafızasız hâlde soru açılıyor, fiyat yazılmıyor',
      oncesi.netPrice === 0 && (oncesi.candidates?.length ?? 0) === 1,
      `netPrice=${oncesi.netPrice} conf=${oncesi.confidence} aday=${oncesi.candidates?.length ?? 0}`);
    check('L1-Ö2 FIXTURE KANITI: kapı ÇAP değil, bilinmeyen-kelime',
      !/çevrim tablosunda yok/.test(oncesi.reason ?? ''), `reason=${oncesi.reason}`);
    await s.remember('u1', BRAND, SATIR, oncesi.candidates![0].materialName);
    const sonrasi = (await s.bulkMatch('u1', BRAND, [SATIR]))[SATIR];
    check('L1 ★ çevrilebilir çapta hafıza otoyazısı ÇALIŞMAYA DEVAM etmeli',
      sonrasi.netPrice === 850 && sonrasi.hafizaOtoyaz === true,
      `netPrice=${sonrasi.netPrice} hafizaOtoyaz=${sonrasi.hafizaOtoyaz} conf=${sonrasi.confidence}`);
  }
  {
    // L2: tablo ICI olculerin imza bileseni DEGISMEMELI — mevcut hafiza
    //     kayitlari (dn15/dn20/dn25...) erisilebilir kalsin. Format kirilirsa
    //     kullanicinin ogrenilmis TUM tercihleri sifirlanir.
    const beklenen: Record<string, string> = {
      '1/2" Küresel Vana Pirinç': 'dn15',
      '3/4" Küresel Vana Pirinç': 'dn20',
      '1" Küresel Vana Pirinç': 'dn25',
      '2" Küresel Vana Pirinç': 'dn50',
      '4" Küresel Vana Pirinç': 'dn100',
    };
    const bozuk = Object.entries(beklenen)
      .filter(([ad, olcu]) => (imza(ad) ?? '').split('|')[1] !== olcu)
      .map(([ad, olcu]) => `${ad}: bekl=${olcu} gercek=${(imza(ad) ?? '').split('|')[1]}`);
    check(`L2 ★ tablo içi ölçülerin imza bileşeni DEĞİŞMEMELİ (payda ${Object.keys(beklenen).length})`,
      bozuk.length === 0, bozuk.join(' | '));
  }
  {
    // L3: generateTags'in DIGER tuketicileri (iscilik/etiket/backfill) icin
    //     tam-inc yazimlari bozulmamali.
    const t2 = generateTags('2" Siyah boru').tags;
    const t4 = generateTags('4" Siyah boru').tags;
    check('L3 ★ tam-inç yazımları etiket üretmeye devam etmeli',
      t2.includes('dn50') && t4.includes('dn100'),
      `t2=${JSON.stringify(t2)} t4=${JSON.stringify(t4)}`);
  }
  {
    // L4: bilesik yazim (bosluklu ve bosluksuz) DOGRU kalmali.
    const a = generateTags('2 1/2" Siyah boru').tags;
    const b = generateTags('21/2" Siyah boru').tags;
    check('L4 ★ bileşik 2 1/2" → dn65 (boşluklu)', a.includes('dn65'), JSON.stringify(a));
    check('L4b ★ bileşik 21/2" → dn65 (boşluksuz)', b.includes('dn65'), JSON.stringify(b));
  }
  {
    // L5 ★ EN KRITIK KILIT (C-R fixinin asil riski): ciplak mm dali GERCEK
    //     mm olculerde CALISMAYA DEVAM etmeli. Bu dal PRD Adim 1 icin var:
    //     "63 PE100 - SDR17, PN10" gibi Ø'suz/mm'siz yazimlar. Inc isareti
    //     suzgeci bu yazimlara DOKUNMAMALI — dokunursa PE/PVC kataloglari
    //     toptan capsiz kalir (24.08 kaucuk turunun 'sifir tespit' sinifi).
    const vakalar: Record<string, string> = {
      '63 PE100 - SDR17, PN10': 'od-63',
      '110 mm PVC Pis Su Borusu': 'dn100',
      '20 mm PPR Boru': 'dn20',
      // ⚠ 'dn32' BEKLENIR, 'od-32' DEGIL: cikarim once MM_TO_DN'e bakar ve
      //   32 mm'nin DN karsiligi TABLODA VARDIR. Ilk yazdigim ölçüt yanlisti,
      //   kod dogruydu (feedback_olcutu_once_dogrula).
      '32 PPR Boru': 'dn32',
    };
    const bozuk = Object.entries(vakalar)
      .filter(([metin, bekl]) => extractDiameter(metin) !== bekl)
      .map(([metin, bekl]) => `"${metin}" bekl=${bekl} gercek=${extractDiameter(metin)}`);
    check(`L5 ★ çıplak/mm ölçüler ETİKET ÜRETMEYE DEVAM etmeli (payda ${Object.keys(vakalar).length})`,
      bozuk.length === 0, bozuk.join(' | '));
  }
  {
    // L6 ★ inç işareti süzgeci YALNIZ inç işaretli sayıya uygulanmalı:
    //     aynı satırda hem inç hem mm geçiyorsa mm okunabilmeli.
    const t = extractDiameter('PPR Boru 63 mm (2" karşılığı)');
    check('L6 ★ aynı satırda mm + inç varken mm okunabilmeli', t === 'od-63' || t === 'dn50',
      `gercek=${t}`);
  }

  console.log(`\n${'='.repeat(64)}`);
  console.log(`SONUC: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(64));
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
