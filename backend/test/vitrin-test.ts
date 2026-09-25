/**
 * VİTRİN — PAKETSİZ YENİ HESAP  (`npm run test:vitrin`)       23.09.2026
 *
 * Emre: "ana sayfa her şey açılsın, kullanıcının önüne gelsin; kullanıcı
 * paket seçsin (kart bilgisini girip), ödeme 30 günün sonunda çekilsin."
 * Kararlar: "yalnızca gezsin" · Malzeme Havuzu'nda "fiyatlar paketle açılsın".
 *
 * DB GEREKTİRMEZ. Sahte Prisma, servisin GEÇİRDİĞİ `where`i fixture'a
 * KENDİSİ uygular (kayıt defteri değil, DAVRANIŞ ölçülür).
 *
 * ── BLOKLAR ─────────────────────────────────────────────────────────────
 *  V · KARAR     — abonelik satırı YOK → `vitrin: true`, erişim KAPALI;
 *                  başka hiçbir durum vitrin değil; vitrin HİÇBİR yetenek
 *                  açmaz (★ en kritik kalkan: "gezsin" ≠ "kullansın").
 *  G · GUARD     — vitrin firması yetenekli uçta 403 `ABONELIK_KISITLI`
 *                  alır ve gövde vitrin başlığını taşır (ön yüzdeki paket
 *                  penceresinin yedek yolu bu koda bakar).
 *  S · SÖZLEŞME  — SUNUCUNUN gerçek kararı ön yüzün saf fonksiyonuna verilir:
 *                  bayrak adı iki tarafta aynı mı (duvar yok · kart var ·
 *                  süresi biten abone hâlâ duvarda).
 *  H · HAVUZ FİYATI — kural (saf) · servis (iki dal) · kişisel liste KORUNUR ·
 *                  ★BAĞLANTI: gerçek uç + gerçek erişim servisi zinciri.
 *  U · UÇ YÜZEYİ — havuzu gezdiren uçlar yeteneksiz KALMALI (vitrin onlara
 *                  dayanıyor); kapı eklenirse vitrinde Malzeme Havuzu 403 olur.
 *                  U2: havuz fiyat ARAMASI kapatılmış hesaba açık DEĞİL
 *                  (güvenlik incelemesi HIGH-1, 24.09 — kayıt → kapat →
 *                  yeniden giriş yolu bütün havuz fiyatını çekiyordu).
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL.
 */
import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { AbonelikDurumu } from '@prisma/client';
import {
  ErisimKarari,
  ErisimServisi,
  Yetenek,
  havuzFiyatiGorunurMu,
} from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { ErisimGuard, YETENEK_KEY } from '../src/ozellik/odeme/abonelik/erisim.guard';
import { BrandsService } from '../src/ozellik/kutuphane/brands/brands.service';
import { BrandsController } from '../src/ozellik/kutuphane/brands/brands.controller';
import { ABONELIK_DURUMLARI } from '../src/altyapi/auth/abonelik-erisim';
import { KAPALI_HESAP_IZINLI } from '../src/altyapi/auth/decorators/kapali-hesap-izinli.decorator';
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
const js = (x: unknown) => JSON.stringify(x);

// ═══════════════════════════════════════════════════════════════════════════
//  FIXTURE — firmalar, abonelikler, havuz ve kişisel listeler
// ═══════════════════════════════════════════════════════════════════════════
const GELECEK = new Date(Date.now() + 20 * 86_400_000);
const GECMIS = new Date(Date.now() - 5 * 86_400_000);

function abonelik(durum: AbonelikDurumu, erisimSonu: Date) {
  return {
    durum,
    erisimSonu,
    kisitlandi: null,
    paketSurumu: { paket: { kod: 'pro-mep', kullaniciHakki: 3, dwgAktif: true } },
  };
}

/** firmaId → abonelik satırı (YOKSA vitrin). */
const ABONELIKLER: Record<string, ReturnType<typeof abonelik>> = {
  'f-aktif': abonelik(AbonelikDurumu.AKTIF, GELECEK),
  'f-deneme': abonelik(AbonelikDurumu.DENEME, GELECEK),
  'f-kisitli': abonelik(AbonelikDurumu.KISITLI, GECMIS),
  'f-askida': abonelik(AbonelikDurumu.ASKIDA, GELECEK),
  'f-sona-erdi': abonelik(AbonelikDurumu.SONA_ERDI, GECMIS),
  'f-deneme-bitti': abonelik(AbonelikDurumu.DENEME, GECMIS),
  'f-iptal-suruyor': abonelik(AbonelikDurumu.IPTAL, GELECEK),
  'f-iptal-bitti': abonelik(AbonelikDurumu.IPTAL, GECMIS),
  'f-tolerans': abonelik(AbonelikDurumu.ODEME_BEKLIYOR, GECMIS),
  // 'f-yeni' BİLEREK YOK → vitrin
};

/**
 * İNCELEME W2 (24.09): "vitrin DEĞİL" iddiası şemadaki HER durum × İKİ tarih
 * için ölçülür (14 bileşim). Elle seçilmiş altı durum IPTAL / geçmiş tarihli
 * AKTIF / ODEME_BEKLIYOR dalını kapsamıyordu — o dallardan birine sızan bir
 * `vitrin: true` süresi biten abonenin duvarını kaldırırdı ve hiçbir kapı
 * kızarmazdı. Liste `ABONELIK_DURUMLARI`ndan (şemayla eşliği ayrı test S1'de).
 */
for (const durum of ABONELIK_DURUMLARI) {
  ABONELIKLER[`f-bilesim-${durum}-gelecek`] = abonelik(durum as AbonelikDurumu, GELECEK);
  ABONELIKLER[`f-bilesim-${durum}-gecmis`] = abonelik(durum as AbonelikDurumu, GECMIS);
}

const LISTELER = [
  { id: 'pl-havuz', name: 'AYVAZ 2026', brandId: 'b-ayvaz', ownerUserId: null, ownerFirmaId: null, brand: { id: 'b-ayvaz', name: 'AYVAZ' } },
  { id: 'pl-havuz-eski', name: 'ESKI LISTE', brandId: 'b-ayvaz', ownerUserId: null, ownerFirmaId: null, brand: { id: 'b-ayvaz', name: 'AYVAZ' } },
  { id: 'pl-kisisel', name: 'Firma Listesi', brandId: 'b-ayvaz', ownerUserId: 'u-yeni', ownerFirmaId: 'f-yeni', brand: { id: 'b-ayvaz', name: 'AYVAZ' } },
];
/** ProductIndex (indeksli dal) — eski listenin indeksi YOK (eski dal koşar). */
const INDEKS = [
  { id: 'pi-1', priceListId: 'pl-havuz', ad: 'Küresel Vana 1/2', birim: 'Adet', price: 312.5, currency: 'TRY', sortOrder: 0 },
  { id: 'pi-2', priceListId: 'pl-havuz', ad: 'Küresel Vana 3/4', birim: 'Adet', price: 401, currency: 'USD', sortOrder: 1 },
  { id: 'pi-3', priceListId: 'pl-kisisel', ad: 'Özel Vana', birim: 'Adet', price: 999, currency: 'TRY', sortOrder: 0 },
];
/** MaterialPrice (eski, indekssiz dal). */
const ESKI_FIYATLAR = [
  { id: 'mp-1', priceListId: 'pl-havuz-eski', price: 77, currency: 'EUR', material: { name: 'Çelik Boru DN50', unit: 'Metre' } },
];

const sorgulananFirmalar: string[] = [];
const prisma: any = {
  abonelik: {
    findUnique: async (arg: any) => {
      sorgulananFirmalar.push(arg?.where?.firmaId);
      return ABONELIKLER[arg?.where?.firmaId] ?? null;
    },
  },
  priceList: {
    findUnique: async (arg: any) => LISTELER.find((l) => l.id === arg?.where?.id) ?? null,
  },
  productIndex: {
    findMany: async (arg: any) => INDEKS.filter((p) => p.priceListId === arg?.where?.priceListId),
  },
  materialPrice: {
    findMany: async (arg: any) => ESKI_FIYATLAR.filter((p) => p.priceListId === arg?.where?.priceListId),
  },
};

const erisim = new ErisimServisi(prisma);
const markalar = new BrandsService(prisma);
const uc = new BrandsController(markalar, erisim);

function kullanici(firmaId: string, rol = 'user') {
  return { id: `u-${firmaId}`, firmaId, role: rol, firmaRol: 'sahip', izinler: [] };
}

// ═══════════════════════════════════════════════════════════════════════════
//  V — KARAR
// ═══════════════════════════════════════════════════════════════════════════
async function kararBlogu(): Promise<ErisimKarari> {
  console.log('\n── V · VİTRİN KARARI ──');
  sorgulananFirmalar.length = 0;
  const k = await erisim.karar('f-yeni');
  check('V-OLCUT sahte DB GERÇEKTEN soruldu (fixture dalı sürdü)', sorgulananFirmalar.includes('f-yeni'), js(sorgulananFirmalar));
  check('V1 ★abonelik satırı YOK → vitrin: true', k.vitrin === true, js(k));
  check('V2 vitrinde erişim YİNE KAPALI (erisimVar false, saltOkunur false)',
    k.erisimVar === false && k.saltOkunur === false, js({ e: k.erisimVar, s: k.saltOkunur }));
  check('V3 uyarı BİLGİ seviyesinde (kırmızı duvar değil) ve başlık "Paketinizi seçin"',
    k.uyari?.seviye === 'bilgi' && k.uyari?.baslik === 'Paketinizi seçin', js(k.uyari));
  check('V4 ★ÇIKMAZ SOKAK YOK uyarının eylemi /abonelik', k.uyari?.eylem?.yol === '/abonelik', js(k.uyari?.eylem));

  // V5 ★★ EN KRİTİK KALKAN — "gezsin" ≠ "kullansın": vitrin sunucuda hiçbir
  // yetenek AÇMAZ. Yalnız ABONELIK_YONET (kilitlenme yasağı) açık.
  const acik = (Object.values(Yetenek) as Yetenek[]).filter((y) => erisim.yetenekKararla(k, y));
  check('V5 ★★ vitrin YALNIZ ABONELIK_YONET açar (teklif/yükleme/kütüphane/çeviri KAPALI)',
    acik.length === 1 && acik[0] === Yetenek.ABONELIK_YONET, js(acik));

  // V6 başka HİÇBİR durum vitrin değil — şemadaki 7 durum × 2 tarih + adlı örnekler.
  const vitrinOlanlar: string[] = [];
  let bilesim = 0;
  for (const firma of Object.keys(ABONELIKLER)) {
    const d = await erisim.karar(firma);
    if (firma.startsWith('f-bilesim-')) bilesim++;
    if (d.vitrin === true) vitrinOlanlar.push(firma);
  }
  check('V6-OLCUT şemanın her durumu × iki tarih ölçüldü (14 bileşim)', bilesim === ABONELIK_DURUMLARI.length * 2 && bilesim === 14, `bilesim=${bilesim}`);
  check('V6 ★aboneliği OLAN hiçbir firma vitrin sayılmaz (14 bileşim + 9 adlı örnek)', vitrinOlanlar.length === 0, js(vitrinOlanlar));

  const kapali = erisim.kapaliKarar({ kapali: true, tip: 'hesap', imhaTarihi: GELECEK });
  check('V7 kapatılmış hesap vitrin DEĞİL (geri dönüş ekranı ayrı eksen)', kapali.vitrin !== true, js(kapali));
  return k;
}

// ═══════════════════════════════════════════════════════════════════════════
//  G — GUARD: vitrin 403'ünün gövdesi
// ═══════════════════════════════════════════════════════════════════════════
async function guardBlogu() {
  console.log('\n── G · YETENEKLİ UÇTA VİTRİN 403 ──');
  const guard = new ErisimGuard(
    { getAllAndOverride: (anahtar: string) => (anahtar === YETENEK_KEY ? [Yetenek.EXCEL_YUKLE] : undefined) } as any,
    erisim,
  );
  const baglam: any = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user: kullanici('f-yeni') }) }),
  };
  let hata: any = null;
  try {
    await guard.canActivate(baglam);
  } catch (e) {
    hata = e;
  }
  const govde = hata instanceof ForbiddenException ? (hata.getResponse() as any) : null;
  check('G1 vitrin firması Excel yüklemede 403 alır', hata instanceof ForbiddenException, String(hata));
  check('G2 gövde kodu ABONELIK_KISITLI (ön yüz paket penceresi bu koda bakar)', govde?.kod === 'ABONELIK_KISITLI', js(govde));
  check('G3 gövde başlığı vitrin başlığı ("Paketinizi seçin")', govde?.mesaj === 'Paketinizi seçin', js(govde?.mesaj));
}

// ═══════════════════════════════════════════════════════════════════════════
//  S — SUNUCU → ÖN YÜZ SÖZLEŞMESİ
// ═══════════════════════════════════════════════════════════════════════════
async function sozlesmeBlogu(vitrinKarari: ErisimKarari) {
  console.log('\n── S · SUNUCU KARARI → ÖN YÜZ SAF FONKSİYONU ──');
  const FE = require('../../frontend/ozellik/odeme/erisim-durumu');
  check('S-OLCUT ön yüz fonksiyonları dışa aktarılmış',
    typeof FE.icerikDurdurulsunMu === 'function' && typeof FE.vitrinKartiGosterilsinMi === 'function' && typeof FE.vitrinMi === 'function');
  if (typeof FE.vitrinKartiGosterilsinMi !== 'function') return;

  // Sunucunun GERÇEK nesnesi (elle kurulmuş taklit değil) — bayrak adı ya da
  // değeri iki tarafta ayrışırsa bu blok kırmızı olur.
  check('S1 ★ön yüz sunucunun vitrin kararını TANIYOR', FE.vitrinMi(vitrinKarari) === true);
  check('S2 ★vitrinde Ana Sayfa DUVARSIZ açılır', FE.icerikDurdurulsunMu(vitrinKarari, '/dashboard') === false
    && FE.vitrinKartiGosterilsinMi(vitrinKarari, '/dashboard') === false);
  check('S3 vitrinde Malzeme Havuzu marka sayfası gezilir',
    FE.vitrinKartiGosterilsinMi(vitrinKarari, '/materials/b-ayvaz') === false);
  check('S4 vitrinde Kütüphanem alt sayfası KART gösterir (yetenekli uçtan yüklenir)',
    FE.vitrinKartiGosterilsinMi(vitrinKarari, '/library/mechanical-brands') === true);

  const sonaErdi = await erisim.karar('f-sona-erdi');
  check('S5 ★süresi biten abone vitrin DEĞİL — duvar AYNEN (Emre: "bu işin dışında")',
    FE.vitrinMi(sonaErdi) === false && FE.icerikDurdurulsunMu(sonaErdi, '/dashboard') === true,
    js({ vitrin: sonaErdi.vitrin, erisimVar: sonaErdi.erisimVar }));
}

// ═══════════════════════════════════════════════════════════════════════════
//  H — HAVUZ FİYATI
// ═══════════════════════════════════════════════════════════════════════════
async function havuzFiyatiBlogu() {
  console.log('\n── H · HAVUZ FİYATI PAKETLE AÇILIR ──');

  // H1 saf kural
  check('H1a erişimi yürüyen firma görür', havuzFiyatiGorunurMu({ erisimVar: true }) === true);
  check('H1b erişimi kapalı firma GÖRMEZ', havuzFiyatiGorunurMu({ erisimVar: false }) === false);
  check('H1c karar yoksa GÖRMEZ (fail-closed)', havuzFiyatiGorunurMu(null) === false && havuzFiyatiGorunurMu(undefined) === false);
  check('H1d yönetici her zaman görür (havuzu o yükler)', havuzFiyatiGorunurMu({ erisimVar: false }, 'admin') === true);

  // H2 servis — indeksli dal
  const gizli = await markalar.getPriceListMaterials('pl-havuz', 'f-yeni', true, false);
  check('H2-OLCUT fixture fiyatlı (gizleme ölçülebilir)', INDEKS.filter((p) => p.priceListId === 'pl-havuz').every((p) => typeof p.price === 'number'));
  check('H2a ★havuz listesi + görünmez → her satırın fiyatı null',
    gizli.materials.length === 2 && gizli.materials.every((m: any) => m.price === null), js(gizli.materials));
  check('H2b yanıt fiyatGizli: true taşır (ön yüz nedeni söylesin)', (gizli as any).fiyatGizli === true);
  check('H2c ürün adları GÖRÜNÜR (katalog gezilir)', gizli.materials.map((m: any) => m.materialName).join('|') === 'Küresel Vana 1/2|Küresel Vana 3/4');

  const acik = await markalar.getPriceListMaterials('pl-havuz', 'f-aktif', true, true);
  check('H3 havuz listesi + görünür → fiyatlar AYNEN',
    acik.materials.map((m: any) => m.price).join('|') === '312.5|401' && (acik as any).fiyatGizli === false, js(acik.materials));

  // H4 ikiz dal — indekssiz eski liste
  const eskiGizli = await markalar.getPriceListMaterials('pl-havuz-eski', 'f-yeni', true, false);
  const eskiAcik = await markalar.getPriceListMaterials('pl-havuz-eski', 'f-aktif', true, true);
  check('H4a ★ESKİ (indekssiz) dal da gizler', eskiGizli.materials.length === 1 && eskiGizli.materials[0].price === null, js(eskiGizli));
  check('H4b eski dal görünürken fiyatı verir', eskiAcik.materials[0]?.price === 77, js(eskiAcik));

  // H5 kişisel liste KORUNUR — firmanın kendi verisi hiçbir durumda gizlenmez
  const kisisel = await markalar.getPriceListMaterials('pl-kisisel', 'f-yeni', true, false);
  check('H5 ★kişisel liste (firmanın KENDİ verisi) görünmez kararında bile FİYATLI',
    kisisel.materials[0]?.price === 999 && (kisisel as any).fiyatGizli === false, js(kisisel));

  // H6 ★BAĞLANTI — gerçek uç → gerçek erişim servisi → gerçek fiyat servisi.
  // Karar doğru, servis doğru ama uç kararı SORMASA (ya da yanlış firmayı
  // sorsa) fiyat açık kalırdı ("mekanizma var, bağlantı yok" — bu depoda 6 kez).
  const tablo: Array<[string, string, boolean]> = [
    ['f-yeni', 'user', false],
    ['f-askida', 'user', false],
    ['f-sona-erdi', 'user', false],
    ['f-deneme-bitti', 'user', false],
    ['f-aktif', 'user', true],
    ['f-deneme', 'user', true],
    ['f-kisitli', 'user', true],
    // Ödenmiş dönemi SÜREN iptal ve ödeme toleransı müşteridir — kataloğu görür.
    ['f-iptal-suruyor', 'user', true],
    ['f-tolerans', 'user', true],
    ['f-iptal-bitti', 'user', false],
    ['f-yeni', 'admin', true],
  ];
  const sapma: string[] = [];
  for (const [firma, rol, gorunmeli] of tablo) {
    const yanit: any = await uc.getPriceListMaterials(kullanici(firma, rol), 'pl-havuz');
    const gorundu = yanit.materials.every((m: any) => typeof m.price === 'number');
    const gizlendi = yanit.materials.every((m: any) => m.price === null);
    if (gorunmeli ? !gorundu : !gizlendi) sapma.push(`${firma}/${rol} beklenen=${gorunmeli ? 'görünür' : 'gizli'}`);
  }
  check(`H6 ★BAĞLANTI uç → erişim kararı → fiyat (${tablo.length} durum)`, sapma.length === 0, js(sapma));
}

// ═══════════════════════════════════════════════════════════════════════════
//  U — UÇ YÜZEYİ: vitrin bu uçların yeteneksiz kalmasına DAYANIR
// ═══════════════════════════════════════════════════════════════════════════
function ucYuzeyiBlogu() {
  console.log('\n── U · HAVUZU GEZDİREN UÇLAR YETENEKSİZ ──');
  const sinif = Reflect.getMetadata(YETENEK_KEY, BrandsController) ?? [];
  check('U0 BrandsController sınıf düzeyinde yetenek İSTEMİYOR', sinif.length === 0, js(sinif));
  for (const metot of ['findAll', 'getBrandPriceLists', 'getPriceListMaterials']) {
    const y = Reflect.getMetadata(YETENEK_KEY, (BrandsController.prototype as any)[metot]) ?? [];
    check(`U1 ${metot} yeteneksiz (vitrin Malzeme Havuzu'nu bu uçla gezer)`, y.length === 0, js(y));
  }

  // U2 ★ güvenlik incelemesi HIGH-1 (24.09): `GET /brands/search` havuz
  // FİYATLARINI döndürür. Kapatılmış hesapta `ErisimGuard` yetenek sorusunu
  // `KAPALI_HESAPTA_ACIK` ile ATLAR; uç `@KapaliHesapIzinli` taşısaydı hiç
  // paket almamış biri kayıt → hesabımı kapat → yeniden giriş ile bütün
  // havuzu çekebilirdi. `JwtAuthGuard` izni metot VE sınıf düzeyinde okur.
  const aramaIzni = Reflect.getMetadata(KAPALI_HESAP_IZINLI, (BrandsController.prototype as any).searchMaterials);
  const sinifIzni = Reflect.getMetadata(KAPALI_HESAP_IZINLI, BrandsController);
  check('U2 ★havuz fiyat araması kapatılmış hesaba AÇIK DEĞİL (metot + sınıf)', !aramaIzni && !sinifIzni, js({ aramaIzni, sinifIzni }));
  const aramaYetenegi = Reflect.getMetadata(YETENEK_KEY, (BrandsController.prototype as any).searchMaterials) ?? [];
  check('U2b havuz fiyat araması YETENEKLİ kalır (vitrine ve askıya 403)', aramaYetenegi.includes(Yetenek.KUTUPHANE_GORUNTULE), js(aramaYetenegi));
}

bitmezseKirmizi((async () => {
  try {
    const k = await kararBlogu();
    await guardBlogu();
    await sozlesmeBlogu(k);
    await havuzFiyatiBlogu();
    ucYuzeyiBlogu();
  } catch (e) {
    check('BEKLENMEYEN HATA — blok yarıda kaldı', false, (e as Error)?.stack ?? String(e));
  }
  console.log(`\n${'='.repeat(64)}\nVİTRİN: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
})());
