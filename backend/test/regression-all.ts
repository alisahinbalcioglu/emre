/**
 * ARINMA FAZ 1 — TEK REGRESYON PAKETI
 *   npm run test:regression
 *
 * 5 cekirdek zincirin (Z1-Z5) TUM kabul/regresyon suite'lerini SIRAYLA
 * kosar, ozet tablo basar; herhangi biri kirmiziysa exit 1.
 *  - DB'siz suite'ler HER ZAMAN kosulur.
 *  - DB gerektirenler (gercek PostgreSQL) baglanti yoksa SKIP raporlanir
 *    (CI/VPS'te DB varken tam kosulur) — sessiz atlama YOK, tabloya yazilir.
 * MUHUR KURALI (Faz 4): bu paket yesil olmadan hicbir degisiklik birlesmez.
 */
import { spawnSync } from 'child_process';

interface Suite { ad: string; script: string; zincir: string; db?: boolean }

const SUITES: Suite[] = [
  { ad: 'Gerçek dosya uyumluluk (TF/KH1)', script: 'test:tf', zincir: 'Z1' },
  { ad: 'Excel grid parse (E/KG6)', script: 'test:grid', zincir: 'Z1' },
  { ad: 'Ürün indeksleyici (P/K)', script: 'test:product-index', zincir: 'Z1' },
  { ad: 'İndeksli motor kabul (K/TS/KH4-6)', script: 'test:index', zincir: 'Z2' },
  // 04.08.2026: bagsiz (productIndexId=NULL) satirlarda manuelUrunIndeksle fallback'i.
  // PK1 manifest kapisi bu testi GOREMEZDI: kapi package.json'daki her `test:*`in
  // SUITES'te olmasini denetler, ama DOSYA→script yonunu denetlemez. Test dosyasi
  // yazilip script'i hic eklenmezse hicbir kapi fark etmez — bu satir o deligi kapatir.
  { ad: 'Fallback AD-kilidi (bağsız satır)', script: 'test:fallback-ad', zincir: 'Z2' },
  { ad: 'Eşleştirme birim (D)', script: 'test:matching', zincir: 'Z2' },
  { ad: 'Çap çevrimi (DN/inç/OD-mm)', script: 'test:conversion', zincir: 'Z2' },
  { ad: 'Spec regresyon (R1-R12)', script: 'test:spec', zincir: 'Z2' },
  { ad: 'Sözleşme dondurma (C1-C10)', script: 'test:contract', zincir: 'Z2' },
  { ad: 'İşçilik tek motor (L)', script: 'test:labor', zincir: 'Z2' },
  // ── S2+S3 (06.08.2026): ÖNERİ KUTUSU. Çapraz-marka/firma önerisi ana
  //    motoru çağırıyor ve motorun "onaylat" dediği tek adayı KESİN gibi
  //    sunuyordu. İki kural mühürlendi: kanıt gücü yetmeyen aday (çapı ya da
  //    adı doğrulanamamış) HİÇ önerilmez; meşru kalan çekinceli aday
  //    çekincesiyle birlikte taşınır. Malzeme + işçilik ikizinde ölçülür.
  { ad: 'Öneri kutusu çekince (S2+S3)', script: 'test:oneri', zincir: 'Z2' },
  // ── S4+S5 (06.08.2026): MALZEME KATMANI + AILE ZAYIFLIGI. Sozlugun
  //    "pis su = PVC" bilgisi motora HIC ulasmiyordu (kinds yalniz
  //    siyah/galvaniz suzgecinden geciyordu) ve aile ADdan cozulemeyince
  //    KATEGORIDEN cozulup alakasiz kalemi 'boru' ailesine yaziyordu.
  //    Iki eksen tek surumde: ikisi de ProductIndex semasina dokunur.
  { ad: 'Malzeme katmanı + aile zayıflığı (S4+S5)', script: 'test:s45', zincir: 'Z2' },
  // ── 06.08.2026: AILE COZUM ONCELIGI (kapsama ustunlugu).
  //    `basIsimAilesi` sondan-parca merdiveninde EN KISA cozulen parcada
  //    duruyordu → daha uzun sozluk ifadesine hic sira gelmiyordu. Olculdu
  //    (`test/sozluk-golgeleme-olcum.ts`): 295 sozluk deseninin 9'u OLU KOD.
  //    Aile tespiti TUM eslestirmenin girdisidir; bu suite hem kurtarilan 9
  //    deseni hem DEGISMEMESI gereken 16 vakayi kilitler.
  { ad: 'Aile çözüm önceliği (kapsama üstünlüğü)', script: 'test:aile', zincir: 'Z2' },
  // ── 06.08.2026: S6 — AILE UYUSMAZLIGI TESHISI.
  //    Aile SERT KILIT; kilit YANLIS aileye kapandiginda sonuc none/ad-yok
  //    oluyordu ve bu "markada gercekten yok" ile BIT BIT AYNI gorunuyordu
  //    (NORM KELEPÇE: ekranda `Bu markada "boru" bulunamadi.`). Artik sonuc
  //    zaten none ise ikinci bir gecis YALNIZ aile kilidi kapali kosulur;
  //    tek ve kimligi dogrulanmis aday varsa durum SOYLENIR ve ONAYA duser.
  //    Bu suite kurtarmayi da, gurultu yasagini da, "fiyat otomatik
  //    YAZILMAZ" kuralini da kilitler.
  { ad: 'Aile uyuşmazlığı teşhisi (S6)', script: 'test:aile-uyusmazligi', zincir: 'Z2' },
  // ── 06.08.2026: KUTUPHANEDE AD DUZENLEME. Kullanici adi degistirip
  //    kaydettiginde ekran "Kaydedildi" diyor, ad ESKI kaliyordu. Iki katman:
  //    FE adi HIC gondermiyordu (gerekce dogru ama YANLIS alana uygulanmisti)
  //    ve BE yalniz `materialName` yaziyordu — oysa sheet uretici adi
  //    `adRaw ?? materialName` sirasiyla okur, yani degisiklik kullanicinin
  //    GORMEDIGI alana gidiyordu. B blogu o tuzagi kilitler; C blogu
  //    paylasilan `Material` katalogunun DOKUNULMADIGINI olcer.
  { ad: 'Kütüphanede ad düzenleme + kaynak sadakati', script: 'test:kb-ad', zincir: 'Z1' },
  // T1/T3/T4: sablona-yazan eski motor SILINDI; "kolon esleme" (test:ke) ve
  // "iki katmanli baslik" (test:kb) suite'leri onunla birlikte kaldirildi.
  // Yerine gelen sozlesmeler:
  { ad: 'Standart grid şeması (GS/MF)', script: 'test:gs', zincir: 'Z1' },
  { ad: 'Standart çıktı (EX1-EX8)', script: 'test:ex', zincir: 'Z4' },
  { ad: 'Teklif formatı kabul (T/KF2)', script: 'test:export', zincir: 'Z5' },
  { ad: 'Canlı simülasyon (SIM/G)', script: 'test:livesim', zincir: 'Z5' },
  // ── KAPATMA TURU ADIM 2 (31.07.2026): pakette OLMAYAN 4 suite eklendi.
  //    Delik: bu dordu assert'liydi ama `npm run test:regression` onlari HIC
  //    kosmuyordu — "regresyon yesil" cumlesi KG9-KG13'u kapsamiyordu.
  //    Dordu de DB'siz (fixture/saf fonksiyon) → db bayragi YOK, hep kosar.
  { ad: 'Önceden fiyatlı (KG9-KG13)', script: 'test:of', zincir: 'Z1' },
  { ad: 'Admin Excel import (import-fidelity)', script: 'test:admin-import', zincir: 'Z1' },
  { ad: 'Kütüphane sayfa üretici (L1-L3)', script: 'test:library', zincir: 'Z1' },
  { ad: 'Performans bütçeleri', script: 'test:perf', zincir: 'Z3' },
  // ── PK1 (31.07.2026): MANIFEST KAPISI. Yukaridaki 4 suite aylarca bu
  //    listede DEGILDI; kok neden "unutmayi engelleyen kapi yok" idi. Bu suite
  //    o kapiyi kurar: package.json'daki her `test:*` ya burada olacak ya da
  //    manifest-kapisi.ts'teki GEREKCELI istisna listesinde.
  { ad: 'Manifest kapısı (PK1)', script: 'test:manifest', zincir: 'Z0' },
  { ad: 'build_sha kablolaması (PK2)', script: 'test:build-sha', zincir: 'Z0' },
  { ad: 'Sessiz indeks geri-düşüşü yasak (PK9)', script: 'test:pk9', zincir: 'Z2' },
  { ad: 'Para birimi çıktıya geçer (18a-18c)', script: 'test:18', zincir: 'Z4' },
  { ad: 'Toplamlar: üç yol × iki sütun (KD11)', script: 'test:kd11', zincir: 'Z1' },
  { ad: 'Kayıt toplamı ekranla aynı (KL P1-b)', script: 'test:kl-kayit', zincir: 'Z1' },
  { ad: 'Başlık satırı veri sayılmaz (KD12)', script: 'test:kd12', zincir: 'Z1' },
  { ad: 'Kimlik haritası sözleşmesi (PK3)', script: 'test:pk3', zincir: 'Z0' },
  { ad: 'Fixture kapsama kapısı (PK3-repo)', script: 'test:pk3-repo', zincir: 'Z0' },
  { ad: 'Kur ölçütünün kendisi (KD9)', script: 'test:kd9', zincir: 'Z4' },
  { ad: 'Kod haritası denetimi (HR3)', script: 'test:harita', zincir: 'Z0' },
  // ── ADIM 6 (04.08.2026): KLASOR↔GRUP DISIPLIN KAPISI.
  //    `test:harita` bir dosyanin haritada ANILDIGINI denetler, DOGRU KLASORDE
  //    oldugunu denetlemez. 155 dosya tasindiktan sonra kapisiz duzen BIR
  //    TURLUKTUR. Iki kural: (1) her kod dosyasi ilan edilmis bir alan kokunde
  //    olacak — 322/322 · (2) haritada X grubunda yazan dosya X'in yolunda
  //    olacak — 257 olculur, 31'i cerceve bagli (`frontend/app/**`) atlanir.
  //    Kural metni `klasor-duzeni.txt`'de, betikte DEGIL.
  { ad: 'Klasör↔grup disiplini (ADIM 6)', script: 'test:klasor', zincir: 'Z0' },
  // ── DB gerektirenler (yerelde PG yoksa SKIP; VPS/CI'da kosulur) ──
  { ad: 'Eşleştirme DB regresyonu', script: 'test:regression:db', zincir: 'Z2', db: true },
  { ad: 'Kütüphane liste ekleme (KL)', script: 'test:kl', zincir: 'Z1', db: true },
  { ad: 'İşçilik sheet (DB)', script: 'test:labor-sheet', zincir: 'Z1', db: true },
  { ad: 'Sheets indeks + mükerrer yasağı (P2-2)', script: 'test:p2-2', zincir: 'Z1', db: true },
  { ad: 'Öksüz kütüphane satırı raporlanır (kalem 59)', script: 'test:kalem59', zincir: 'Z1', db: true },
  // ── 04.08.2026 — KULLANICI EKONOMISI SAVUNMA KATMANLARI (B → D → A) ──
  // Uc suite de kirmizi-once turunda eklendi; UCU DE ARTIK YESIL (duzeltmeler
  // yapildi). Kirmiziya donerlerse bu bir REGRESYON'dur, "bilincli kirmizi"
  // DEGIL — o not 04.08'de gecerliydi ve duzeltmelerle birlikte kaldirildi.
  //
  // B-1: ProductIndex silinince kutuphane satiri CASCADE ile ucuyordu;
  //      schema.prisma UserLibrary.product → SetNull yapildi.
  { ad: 'Kütüphane satırı cascade ile silinmez (B-1)', script: 'test:b1', zincir: 'Z1', db: true },
  // D-1: marka silinince TUM kullanicilarin kutuphane satirlari (iskonto/ozel
  //      fiyat dahil) elle deleteMany ile uctuyordu; ekonomi tasiyan satir
  //      varsa onaysiz silme artik 409 (brands.service.ts `remove`).
  { ad: 'Marka silme çapraz-tenant kütüphaneyi götürmez (D-1)', script: 'test:d1', zincir: 'Z1', db: true },
  // A-1: silme ONCESI sayim uclari + fiyat listesi yolunda 409 on kontrolu.
  //      A0 assertleri ayrica B'nin SetNull'unu canli DB'de olcer — FK geri
  //      Cascade'e donerse ekran metni yanlis vaat etmeden ONCE burasi kizarir.
  { ad: 'Silme etkisi sayım uçları + ön kontrol (A-1)', script: 'test:a1', zincir: 'Z1', db: true },
  // ── 04.08.2026 — UÇ GÜVENLİĞİ (K1/K2/K4). DB GEREKTİRMEZ: dekoratör
  //    metadata'sı + sahte ExecutionContext + sahte servis casusu ile ölçülür,
  //    gerçek veriye dokunmaz → `db` bayrağı YOK, her koşumda çalışır.
  //    DURUM: 41 PASS / 0 FAIL — kusurlar aynı gün düzeltildi (K1 iki uca
  //    metot düzeyi @Roles · K2 TierGuard getAllAndOverride · K4 ?onaylandi
  //    bayrağının HTTP→servis kablolaması). KIRMIZIYA DÖNERSE BU BİR REGRESYONDUR.
  //    ⚠ K3 (materials deletePrice kapsamı) 04.08'de KALDIRILDI — ölçtüğü uç
  //    ölüydü ve silindi; ayrıntı `guvenlik-uclari-test.ts` baş yorumunda.
  //    O ölçüt kontrol vakaları, fixture kapıları ve ★KALKAN assertleri
  //    (aynı sınıftaki altı normal-kullanıcı ucu admin İSTEMEMELİ) da buradadır.
  { ad: 'Uç güvenliği: rol/tier/kapsam sözleşmesi (K1/K2/K4)', script: 'test:guvenlik', zincir: 'Z0' },
  // ── 04.08.2026 — HAFIZA IMZASININ EKSENLERI. DB GEREKTIRMEZ (saf fonksiyon
  //    + fake Prisma) → `db` bayragi YOK, her kosumda calisir.
  //    ARTIK YESIL (28/0) — kirmizi-once turunun ALTI kusuru ayni gun kapandi:
  //    A-R1 yuzey · A-R2 baglanti · A-R3 akiskan ekseni imzaya girdi
  //    (`marka|olcu|tip|cins|yuzey|baglanti`, etiketler sirali); E-R1 olcu
  //    cozulemezse imza URETILMEZ ve `remember` tam imzayi YAZMAZ; C-R1a/b
  //    on-secim metni "onaylayin" demeyi birakti, sayacin ANAHTARA ait
  //    oldugunu soyluyor. Ö* olcut kapilari ve L* regresyon kilitleri
  //    (buildKindImza kasitli genis + determinizm + asiri daraltma yasagi)
  //    duzeltme ONCESI de SONRASI da YESIL. Kirmiziya donerse REGRESYONDUR.
  { ad: 'Hafıza imzasının eksenleri (A-R/E-R/C-R)', script: 'test:imza', zincir: 'Z2' },
];

function dbErisilebilir(): boolean {
  // Hizli TCP kontrolu yerine: DATABASE_URL tanimli + PG_REGRESSION=1 bayragi
  // (yerel gelistirmede PG cogu zaman kapali — yanlis negatif kirmizi yerine
  // ACIK bayrakla kosulur; VPS/CI ortami bayragi set eder).
  return process.env.PG_REGRESSION === '1';
}

const sonuclar: Array<{ ad: string; zincir: string; durum: 'PASS' | 'FAIL' | 'SKIP'; sure: string; not?: string }> = [];
const dbVar = dbErisilebilir();

for (const s of SUITES) {
  if (s.db && !dbVar) {
    sonuclar.push({ ad: s.ad, zincir: s.zincir, durum: 'SKIP', sure: '-', not: 'DB yok — PG_REGRESSION=1 ile koşulur' });
    continue;
  }
  const t0 = Date.now();
  const r = spawnSync('npm', ['run', s.script], { shell: true, encoding: 'utf-8' });
  const sure = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  // CIKIS KODU SOZLESMESI (31.07): 0 = PASS · 2 = ON KOSUL YOK (fixture
  // verisi eksik → SKIP) · diger = FAIL. Ayrimin sebebi: veri eksikligi
  // motor gerilemesi gibi gorunuyordu (test:regression:db 9/10 kirmizi,
  // oysa ÇAYIROVA fiyat listesinin adlari cokmus + ProductIndex 0 satir).
  const durum = r.status === 0 ? 'PASS' : r.status === 2 ? 'SKIP' : 'FAIL';
  const onKosulNotu = (r.stdout ?? '').split('\n').find((l: string) => l.includes('ON KOSUL YOK'))?.trim();
  sonuclar.push({
    ad: s.ad, zincir: s.zincir, durum, sure,
    not: durum === 'SKIP' ? (onKosulNotu ?? 'ÖN KOŞUL YOK (çıkış 2)') : undefined,
  });
  console.log(`${durum === 'PASS' ? '✅' : durum === 'SKIP' ? '⚪' : '❌'} [${s.zincir}] ${s.ad} (${sure})`);
  if (durum === 'FAIL') {
    console.log((r.stdout ?? '').split('\n').filter((l: string) => l.includes('FAIL')).slice(0, 10).join('\n'));
  }
  if (durum === 'SKIP') {
    console.log((r.stderr ?? '').split('\n').filter((l: string) => /ON KOSUL|marka fiyat|farkli cap|ProductIndex|→/.test(l)).slice(0, 6).join('\n'));
  }
}

console.log(`\n${'═'.repeat(64)}`);
console.log('ARINMA REGRESYON PAKETI — OZET');
console.log('═'.repeat(64));
for (const r of sonuclar) {
  console.log(`  ${r.durum === 'PASS' ? '🟢' : r.durum === 'SKIP' ? '⚪' : '🔴'} ${r.durum.padEnd(4)} [${r.zincir}] ${r.ad}`
    + `${r.sure !== '-' ? ` (${r.sure})` : ''}${r.not ? ` — ${r.not}` : ''}`);
}
const fail = sonuclar.filter((r) => r.durum === 'FAIL').length;
const skip = sonuclar.filter((r) => r.durum === 'SKIP').length;
console.log(`\nTOPLAM: ${sonuclar.length - fail - skip} PASS · ${fail} FAIL · ${skip} SKIP`);
if (skip) console.log('⚠ SKIP PASS DEĞİLDİR — atlanan paket doğrulanmamış sayılır.');
process.exit(fail > 0 ? 1 : 0);
