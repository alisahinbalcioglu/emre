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
  // ── 24.08.2026: KAUCUK IZOLASYON VAKASI (KI). Uc bagimsiz kusur ust
  //    usteydi: (1) "Elastomerik kauçuk köpüğü boru" sondaki 'boru' ile
  //    yanlis aileye dusuyordu → SERT kilit sifir aday; (2) izolasyonun
  //    yuvarlanmis OD caplari (22/28/35) cevrimsiz kalip olu od- tag'i
  //    uretiyordu; (3) AD_ZENGINLESTIRME'nin dnli:true bayragi OLU idi →
  //    sizeClass unknown → celik+plastik birlesimi yapay 2. aday cikariyordu.
  { ad: 'Kauçuk izolasyon vakası (KI)', script: 'test:kaucuk', zincir: 'Z2' },
  // VS (25.08): surukle-doldur varyant yayilimi — canli PILSA "PP KURESEL
  // VANALAR" vakasi. Uc yapisal kusurun kapisi: (1) tam-dizgi tag esitligi
  // (yazim kaymasi + ada gomulu olcu grubu variantMissing'e dusuruyordu) →
  // varyantTagEsit toleransi; (2) PARA: capsiz urune kaynak fiyati yayilmasi
  // → capsizAutoYasak; (3) yalin 'pp' plastik sayilmiyordu → DN63 koprusu.
  { ad: 'Varyant sürükleme (VS)', script: 'test:varyant', zincir: 'Z2' },
  // KM (26.08): VS turunda BILINCLI ERTELENEN dort bulgu — hepsi 'cap-yok'
  // ERKEN DONUSUNDE bulusuyor. (1) E2: dosyadaki 12 'none'un 12'si de V4.7
  // kurtarmasindan ONCE donuyordu → kurtarma, ele almak icin yazildigi vakaya
  // hic ulasamiyordu (kirmizi 2½" kutuphanede dururken "bu markada yok").
  // (2) E4: yuzey filtresi 'none' DONMEZ, yalniz daraltir → sebep kodunu HER
  // ZAMAN sonraki (cap) filtre yaziyordu; markada 2" siyah boru DURURKEN
  // ekran "Bu markada 2\" yok" diyordu. (3) E6: 'en yakin' listesi olculemez
  // sayilardan uretiliyordu (inc satir ↔ mm kutuphane TERS siralaniyor,
  // `3/4"` parseFloat ile 3 sayiliyor). (4) E1 PARA: sozluk hint'i
  // (sizeClassHint/hintClass) kullanicinin ACIK surukleme secimini eziyor,
  // 140 TL'lik celik boru yerine 18 TL'lik PPR OTOMATIK yaziliyordu.
  { ad: 'Kurtarma + cap-yok mesajı (KM)', script: 'test:kurtarma-mesaj', zincir: 'Z2' },
  // CC (26.08): PARA — satirin capi CEVRILEMEYINCE cap suzgeci sessizce
  // atlaniyordu. `sizeEquivalents` bos tag donerse blok komple atlaniyor,
  // TUM caplar aday kaliyor ve yanlis OLCUNUN fiyati OTOMATIK yaziliyordu:
  // '1/4" Küresel Vana' + havuzda yalniz 1/2" → 850 TL · '8" PVC Pis Su' +
  // havuzda yalniz 110 mm → 300 TL · surukleme ile 1/4" hedefe 1/2"nin 500 TL'si.
  // Olculen payda: celikte 15 yazim (1/4" 3/8" 5/8" 7/8" 1 1/8" …), plastikte
  // ayrica 8" 10" 12" 14" 16" — sonuncular pis su borusunda SIK kullanilir.
  // Cozum iki parcali: IMZA esitligiyle geri dusus + `cap-cevrilemedi` kapisi
  // (fiyat otomatik yazilmaz, kalem GORUNUR kalir — S4).
  { ad: 'Çap çevrilemedi kapısı (CC)', script: 'test:cap-cevrilemedi', zincir: 'Z2' },
  // EK (27.08): E2 kurtarmayi yalniz 'cap-yok' donusune baglamisti; cins /
  // yuzey-celiskisi / baglanti eksenlerindeki UC erken 'none' hala kurtarmasizdi
  // — kullanicinin sectigi varyant HEDEF CAPTA kutuphanede DURURKEN motor "yok"
  // diyordu. Bu noktalarda CAP SUZGECI HENUZ KOSMADIGI icin `erkenKurtar` kendi
  // suzgecini kendi kurar; suzgecsiz cagri olculmus PARA HATASI uretiyor
  // (hedef DN100 iken DN50'nin fiyati). Ayrica bu paket SINIF UYUMUNU da kilitler:
  // cap tag ad uzayi asiri yuklu ('dn25' celikte DN25=1", plastikte 25mm=3/4")
  // ve capraz-sinif kiyasi 999 TL'yi 3/4" satirina yazdiriyordu (EK-18).
  { ad: 'Erken none kurtarması + sınıf uyumu (EK)', script: 'test:erken-kurtarma', zincir: 'Z2' },
  // YG (27.08): E4'un IKINCI YARISI. E4 mesaji durustlestirdi ("bu üründe 2\"
  // galvaniz olarak yok") ama kullanicinin GORDUGU sey hala bostu — markada
  // SIYAH 2" @300 DURURKEN kalem ekrana HIC gelmiyordu. Artik yuzey
  // uygulanmamis havuz (ayni cap/baglanti/boy/birim suzgeclerinden gecmis)
  // aday olarak sunulur; fiyat OTOMATIK YAZILMAZ (aday YAZILI bir kisiti
  // ihlal ediyor) ve hafiza otoyazisi da kapatilir.
  { ad: 'Yüzey genişletme kapısı (YG)', script: 'test:yuzey-genisletme', zincir: 'Z2' },
  // UD (27.08): canli KAUCUK sikayetinin yan bulgusu — "(... dahil)" tarzi
  // PARANTEZ ICI notlar masum urun satirlarini NOT_PRODUCT'a dusuruyordu
  // ("Ürün değil" toast'i; satir tam cikmaz sokak: havuz, kurtarma, capraz
  // oneri hicbiri kosmaz). Hizmet taramasi artik parantezleri soyulmus
  // metinde — dosyanin ZATEN yaptigi aile-cozumu parantez muafiyetinin
  // (Faz 2b) hizmet taramasina uygulanmis hali. Gercek hizmet satirlari
  // (8 ornek) davranisini korur.
  { ad: 'Ürün-değil parantez muafiyeti (UD)', script: 'test:urun-degil', zincir: 'Z2' },
  // TS (27.08): CANLI DUYAR vakasi. TAM-AD kilidi satirla BIREBIR ortusen
  // kayitlara kilitlenir; adi UST KUME olan "Küresel vana (pirinç)" kayitlari
  // `adGenis`e SURULUR (dogru davranis) ama hicbir kurtarma yolu adGenis'i
  // OKUMUYORDU → kullanicinin surukleyerek sectigi kimlik havuzda YAPISAL
  // olarak bulunamiyor, 3/4"-1" pembe kaliyor ve 1 1/4"te "bu capta yok"
  // yalani cikiyordu (urun @1227 kutuphanede DURURKEN). Ustelik ayni capta
  // 3.121 TL'lik FLANSLI urun, 491 TL'lik dogrusu dururken yazilabiliyordu.
  // Cozum: ucuncu havuz + SIFIR KAPISI (merge DEGIL — merge olculdu ve bugun
  // dogru calisan bir vakayi cap-yok yalanina dusuruyordu).
  { ad: 'Tam-ad sürgünü kurtarması (TS)', script: 'test:tam-ad-surgunu', zincir: 'Z2' },
  { ad: 'Ölçü anahtarı çakışması + hafızanın CC kapısı', script: 'test:olcu-anahtari', zincir: 'Z2' },
  { ad: 'DN nominal köprüsü — komşu DN fiyatı yazılmaz', script: 'test:dn-koprusu', zincir: 'Z2' },
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
  //    S7 (24.08 urun karari): COKLU aday da artik susmaz — kanit-sirali
  //    SORU acilir (kesit 12, zayif kume acilmaz, paylasilmayan aday girmez).
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
  // ── 07.08.2026: HAYALET LISTE sinifi (iscilik + kutuphane, IKI AILE).
  //    'new' hedefli kayitta liste dogrulamadan ONCE olusuyordu; ayrica
  //    sheet'siz liste 4 jenerik kolona dusuyordu ("sutunlar kayboldu").
  //    Kutuphane liste sekmeleri ayni sozlesmeyle dogdu (lazy goc dahil).
  { ad: 'Kütüphane liste sekmeleri + hayalet liste yasağı', script: 'test:kb-liste', zincir: 'Z1' },
  // ── 06.08.2026: ISCILIK IKIZI. Malzeme tarafinda satir silme baglanirken bu
  //    taraf UNUTULDU (kullanici bildirdi). Ustelik burada silme HIC YOKTU:
  //    `enableStructureEdit` verilmedigi icin sag tik menusu bile acilmiyordu.
  //    Ayrica silmenin IKI YERDE olmasi sart — `getPriceListSheets` satirlari
  //    sheet JSON'undan okur, yalniz `laborPrice.delete` demek satiri geri
  //    getirirdi. Bu suite o "geri gelme"yi kilitler.
  { ad: 'İşçilik satır silme kalıcı (ikiz)', script: 'test:isc-sil', zincir: 'Z1' },
  // ── 06.08.2026: KUR DONMASI (kullanici karari: "dovizli maliyetin kuru
  //    teklife donsun — evet donsun"). Dovizli kutuphane satirindan fiyat
  //    yazildiginda cevrimde kullanilan kur sonucla tasinir (kaynakKur) ve
  //    FE satira yazar → teklif JSON'uyla donar. TRY'de ve kur metaverisi
  //    olmayan ceviricide alan HIC uretilmez (uydurma kur yasak).
  { ad: 'Kur donması (kaynakKur sözleşmesi)', script: 'test:kur', zincir: 'Z2' },
  // ── 06.08.2026: ALIAS KELIME YUTMASI. Ogrenme kapisi `adSlug === adBucket`
  //    proxy'siyle "sozluksuz" tahmini yapiyordu; sozlugun COZDUGU tek
  //    kelimelik adlarda (Sprinkler, Fan, Damper, Conta, Kelepce... 68 ad)
  //    YANLIS atesleyip GLOBAL alias ogreniyordu. O alias teklif satirindaki
  //    ayni kelimeyi yutunca satir ADSIZ kaliyor, K8 kapisi none/ad-yok
  //    donduruyordu — canli AYVAZ sprinkler vakasi (0 aday).
  //    Iki katman kilitlenir: (B) kapi artik `selfFamily` acik alanina bakar,
  //    (C) yutma satiri adsiz birakiyorsa UYGULANMAZ (mevcut alias'lari da
  //    etkisizler — veri temizligi beklenmez).
  { ad: 'Alias kelime yutması (AYVAZ sprinkler)', script: 'test:alias-yutma', zincir: 'Z2' },
  // ── 12.08.2026: ILISKISEL ALAN SUZGECI. Teklif kaydinda marka/isçilik
  //    firmasi ID'leri QuoteItem'in ILISKISEL alanlarina baglanir; silinmis
  //    ya da BASKA HESABA ait ID'ler kayit BLOKLANMADAN dusurulur (logout
  //    sessionStorage'i temizlemedigi icin bayat ID tasiyan taslak olabilir;
  //    sert 400 teklifin tamamini kaybettirirdi). Suite DB gerektirmez.
  //    ⚠ Bu satir 12.08'de EKSIKTI: script package.json'a yazilmis ama
  //    SUITES'e islenmemisti — PK1 manifest kapisi bunu kirmizi gosteriyordu
  //    ve 10 testlik muhur regresyonda HIC kosmuyordu (muhur var, kapi yok).
  { ad: 'İlişkisel alan süzgeci (marka + işçilik firması)', script: 'test:iliskisel-alan', zincir: 'Z1' },
  // ── 24.08.2026: KISISEL LISTE/MARKA IZOLASYONU. Kutuphane "Marka Ekle" /
  //    "satir ekle" akislari global Brand+PriceList yaratiyordu; admin panel
  //    ve havuz gorunumleri sahiplik suzgeci olmadan listeliyor, kisisel
  //    listenin SATIRLARI (fiyat dahil) id bilen herkese aciliyordu
  //    (capraz-tenant sizinti). Sozlesme: Brand.isGlobal=false + PriceList
  //    .ownerUserId; havuz/admin uclari suzer, icerigi yalniz sahibi okur,
  //    admin ayni adla marka acarsa kisisel marka havuza TERFI eder.
  //    Sahte Prisma where'i KENDISI uygular — suzgec duserse kirmizi. DB'siz.
  { ad: 'Kişisel liste/marka izolasyonu (24.08)', script: 'test:kisisel-liste', zincir: 'Z1' },
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
  // 13.08 — ceviri turu: DB'siz, deterministik iki suite.
  { ad: 'Çeviri başarısızlık kararı (sessiz başarı yasağı)', script: 'test:ceviri', zincir: 'Z2' },
  { ad: 'Çıktı dili sözlüğü (başlık + birim)', script: 'test:cikti-dil', zincir: 'Z4' },
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
  // ── 28.08.2026 — ÖK2 FIRMA IZOLASYONU (ADIM 1). DB GEREKTIRIR: 2 firma +
  //    3 kullanici + teklif olusturulup silinir. Teklif suzgecleri 28.08'de
  //    userId -> firmaId'ye gecti; o degisiklik BUGUN gorunmez (her firmada
  //    tek kullanici var), yani yanlis yazilsaydi hicbir mevcut test
  //    kirilmazdi. Bu paket iki uyeli firmayi ELLE kurup olcer:
  //    ayni firma GORUR · baska firma GORMEZ/ACAMAZ/SILEMEZ/REVIZE EDEMEZ ·
  //    firmasiz kimlik 403 (Prisma'da undefined kosulu SESSIZCE duserdi).
  { ad: 'Firma izolasyonu (ÖK2)', script: 'test:firma', zincir: 'Z1', db: true },
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
  // ── 28.08.2026 — ADIM 2 ÖDEME/ABONELİK. DB GEREKTİRMEZ: PrismaClient'ın
  //    `$connect`i no-op'lanır, böylece TÜM sağlayıcılar gerçekten kurulur
  //    (kurucu gövdeleri koşar) ama hiçbir bağlantı açılmaz → `db` bayrağı YOK.
  //    Bu ayrım kasıtlı: DI grafiğini "preview" modunda doğrulamak sağlayıcıları
  //    HİÇ kurmaz ve O1'i kaçırırdı — kusur tam olarak KURUCUDA yaşıyordu.
  //    Ölçtüğü dört şey, gelen pakette DÖRDÜ DE bozuktu:
  //    O1 ÖNYÜKLEME KATİLİ — iyzico anahtarları `getOrThrow` ile kurucuda
  //      okunuyordu; biri eksikse OdemeModule TÜM API'yi düşürürdü (teklif,
  //      kütüphane, DWG dahil). Test anahtarları AÇIKÇA SİLEREK koşar.
  //    O2 KORUMASIZ YÖNETİM UÇLARI — havale `@UseGuards` satırı YORUMDAYDI;
  //      oturum açmış herkes kendi aboneliğini uzatabilirdi.
  //    O3 SAHTE DENETİM İZİ — aktör istek GÖVDESİNDEN okunuyordu; artık JWT'den.
  //    O4 SATIN ALMA YOLU YOKLUĞU — 5 iyzico metodunun 5'inin de çağrı yeri
  //      yoktu, `iyzicoAbonelikKodu` hiç YAZILMIYORDU; kartla abone olmanın
  //      yolu yoktu ve her webhook eşleşmeyen kodla gelip yutulurdu.
  //    MUTASYONLA ÖLÇÜLDÜ (2/2 öldü): kurucuya getOrThrow geri konunca O1
  //    kırmızı; @Roles('admin') kaldırılınca O2 kırmızı. KIRMIZIYA DÖNERSE
  //    BU BİR REGRESYONDUR.
  { ad: 'Ödeme önyükleme + uç sözleşmesi (O1-O4/W1)', script: 'test:odeme', zincir: 'Z0' },
  // ── 28.08.2026 — MIGRATION ZINCIRI (Z1-Z3) + BACKFILL SÖZÜ (B1-B6).
  //    SUNUCU GEREKTİRMEZ: PGlite (WASM PG16) süreç içinde ayağa kalkar →
  //    `db` bayrağı YOK, PG_REGRESSION istemez, her koşumda çalışır.
  //    NEDEN: üretimde şema `prisma migrate deploy` ile uygulanır
  //    (Dockerfile:55, render.yaml:64) — bozuk migration konteyneri
  //    AÇILMAZ hâle getirir. Bu depoda zincirin gerçekle ayrışma GEÇMİŞİ
  //    var: `f2a0b7a` "8 tablo db push'la açılmıştı" diyor; temiz bir DB'de
  //    `migrate deploy` patlıyordu ve kusur aylarca görünmedi çünkü kimse
  //    zinciri SIFIRDAN koşmuyordu. Bu paket tam olarak onu yapar.
  //    Ayrıca ADIM 2 backfill'inin TEK KURALINI veriyle sınar: "hiçbir
  //    mevcut kullanıcının erişimi kesilmez" — göç öncesi dünya kurulur,
  //    backfill koşar, her firmanın AKTİF aboneliği ve TAVANDAN seçilmiş
  //    seviyesi doğrulanır. B6 idempotensi ölçer (aynı SQL iki kez).
  //    KIRMIZIYA DÖNERSE DEPLOY KIRILIR — bu paket deploy'un ön provasıdır.
  { ad: 'Migration zinciri + backfill sözü (Z1-Z3/B1-B6)', script: 'test:migration', zincir: 'Z0' },
  // ── 28.08.2026 — ERİŞİM KAPISI (K/L/W). DB GEREKTİRMEZ: karar matrisi saf
  //    fonksiyonla, uç kablolaması dekoratör metadata'sıyla ölçülür.
  //    ADIM 2'nin ürün sözü tek cümledir: "veriyi göstermeye devam et, DEĞER
  //    ÜRETMEYİ durdur." Bu cümle İKİ ayrı yerde birden doğru olmalı: kararın
  //    kendisi (erisim.servisi) ve o kararın uçlara BAĞLI olması (guard +
  //    dekoratörler). İkisi ayrı ayrı doğru olup birlikte yanlış olabilir.
  //    BU DEPODA ÖNCEDENİ VAR: `getUserCapabilities` motoru doğru yazılmıştı
  //    ama TEK tüketicisi /auth/me yanıtıydı — hiçbir guard onu okumuyordu,
  //    yani yetenek matrisi aylarca süs payı olarak durdu. W* blokları o
  //    hatanın tekrarını engeller.
  //    L1 EN KRİTİK: ABONELIK_YONET yedi durumun YEDİSİNDE de açık kalmalı;
  //    kapanırsa askıdaki firma ödeyemez ve askıdan ÇIKAMAZ (kilitlenme).
  //    W3/W4 ★KALKAN: abonelik ucuna ve görüntüleme uçlarına kapı KONULMAMALI.
  //    MUTASYONLA ÖLÇÜLDÜ (2/2 öldü): kısıtlı moda CIKTI_INDIR eklenince K2
  //    kırmızı; export ucundan dekoratör kaldırılınca W1 kırmızı.
  { ad: 'Erişim kapısı: karar matrisi + uç kablolaması (K/L/W)', script: 'test:erisim', zincir: 'Z0' },
  // ── 28.08.2026 — GÜVENLİK TURU 2 (G1-G6). DB GEREKTİRMEZ.
  //    ADIM 2 denetimi sırasında ödeme DIŞINDA bulunan altı kusur; hepsi kod
  //    OKUNARAK doğrulandı (grep sonucuna güvenilmedi), sonra düzeltildi.
  //    G1 BANLI KULLANICI GİRİŞ YAPABİLİYORDU — `status` alanını tüm auth
  //      katmanında hiçbir yer okumuyordu; "ban" düğmesi panelde çalışıyor
  //      görünüp HİÇBİR ŞEY yapmıyordu. İKİ kapı gerekti: giriş + mevcut
  //      token (7 günlük pencere).
  //    G2 DWG ÇAPRAZ-TENANT SIZINTI — fileId'yi bilen herhangi bir oturumlu
  //      kullanıcı BAŞKA firmanın çizim geometrisini okuyabiliyordu; yedi ucun
  //      hiçbiri kullanıcıyı parametre olarak bile ALMIYORDU.
  //    G3 İŞÇİLİK KATALOĞU — pro olan herkes DELETE /labor/:id ile küresel
  //      kalemi silip TÜM firmaların fiyatlarını cascade ile götürebiliyordu.
  //    G4 KİMLİK ASİMETRİSİ — upload-excel ham user.id, kardeşi kimlikCoz.
  //    G5 ÇIPLAK firmaId — `where: { firmaId: undefined }` sessizce düşer.
  //    G6 BOOTSTRAP HESAP DEVRALMA — govdeden newPassword ile parola sıfırlama.
  //    MUTASYONLA ÖLÇÜLDÜ (3/3 öldü): jwt.strategy banned kontrolü kalkınca
  //    G1-b · labor remove'dan @Roles kalkınca G3-a · getGeometry sahiplik
  //    kontrolü kalkınca G2-a kırmızı. KIRMIZIYA DÖNERSE REGRESYONDUR.
  { ad: 'Güvenlik turu 2: ban/DWG izolasyon/katalog/kimlik (G1-G6)', script: 'test:guvenlik2', zincir: 'Z0' },
  // ── 28.08.2026 — FİRMA EKSENİ (G7/G8). ADIM 1'in yarım kalan dilimi.
  //    DB GEREKTİRMEZ: SAHTE PRISMA CASUSU ile Prisma'ya giden gerçek `where`
  //    nesnesi yakalanır ve EKSENİ ölçülür.
  //    ⚠ BU PAKET NEDEN TİPE DEĞİL SORGUYA BAKAR: göçürme sırasında
  //    `tsc --noEmit` TEMİZ verdi ama 13 çağrı hâlâ `user.id` (string)
  //    geçiriyordu — controller'larda `@CurrentUser() user: any` var ve `any`
  //    tip kapısını DEVRE DIŞI BIRAKIR. Çalışma anında `k.firmaId` undefined
  //    olur, `where: { firmaId: undefined }` koşulu SESSİZCE DÜŞER ve HER
  //    firmanın işçilik firmaları dönerdi. Yani göçürme, düzeltmeye çalıştığı
  //    şeyden büyük bir çapraz-tenant sızıntısı açabilirdi ve tsc GÖRMEZDİ.
  //    G7 LaborFirm.create firmaId YAZMIYORDU → deploy sonrası açılan her
  //      işçilik firması öksüz kalıyor, kullanıcı KENDİ firmasını
  //      "başkasının firması" uyarısıyla görüyordu (canlıda bozuktu).
  //    G8 Eşleştirme aday havuzu hâlâ userId ile süzülüyordu → davet akışı
  //      açılınca aynı firmanın ikinci üyesi BOŞ HAVUZ görürdü.
  //    C* ★KALKAN: bu dosyalarda `firmaId` İŞÇİLİK FİRMASI anlamına da
  //      geliyor; kiracı firmanın işçilik havuzuna SIZMADIĞI ölçülür.
  //    MUTASYONLA ÖLÇÜLDÜ (2/2 öldü): create'ten firmaId kalkınca G7-a ·
  //    havuz userId'ye dönünce G8-a/b/★ kırmızı.
  { ad: 'Firma ekseni: havuz + işçilik firması sahipliği (G7/G8)', script: 'test:firma-ekseni', zincir: 'Z0' },
  // ── 29.08.2026 — ORTAM DEĞİŞKENLERİ KAPISI. DB/sunucu GEREKTİRMEZ.
  //    Bu kurulumda bir değişken İKİ YERE birden yazılmak zorunda:
  //    sunucudaki `.env` (DEĞERİ verir) VE docker-compose.yml
  //    backend.environment (konteynere GEÇİRİR). Yalnız .env'e yazmak
  //    YETMEZ — compose'da anılmayan değişken konteynere HİÇ GEÇMEZ.
  //    Kusurun sinsi tarafı: hiçbir şey patlamaz, .env dolu görünür ve
  //    kimse compose'a bakmayı akıl etmez.
  //    Kapı, kodun GERÇEKTEN okuduğu değişkenleri kaynaktan çıkarır ve
  //    hem compose'da hem .env.example'da anıldığını ölçer. Ayrıca:
  //    G1 .env.example'a gerçek sır kaçmasın (dosya COMMIT EDİLİR),
  //    G2 IYZICO_IMZA_ZORUNLU varsayılanı false kalsın (ilk webhook'tan
  //       önce true = her olay sessizce düşer),
  //    G3 hiçbir ödeme değişkeni compose'da ZORUNLU kılınmasın (ödeme
  //       yapılandırması tüm ürünü ayağa kaldırmama hakkına sahip değil).
  //    ⚠ G1 ilk yazımda YANLIŞ ALARM verdi: `=\s*\S+` deseni `\s`
  //    newline'ı kapsadığı için BOŞ satırı bir sonrakinin ADIYLA eşledi;
  //    ölçüldü, kusur üründe değil ÖLÇÜTTEYDİ — desen satıra sabitlendi.
  //    MUTASYONLA ÖLÇÜLDÜ: .env.example'a sahte anahtar konunca G1 kırmızı.
  { ad: 'Ortam değişkenleri: kod ↔ compose ↔ .env.example (E/G)', script: 'test:ortam', zincir: 'Z0' },
  // ── 29.08.2026 — FİYAT ÇAPASI (Y/H/K). DB ve AĞ GEREKTİRMEZ.
  //    Kullanıcı kararı: müşteriye "$28/ay" gösterilir, karttan TL çekilir.
  //    İki kavram KARIŞIRSA para hatası olur:
  //      `tutar` (TL)          → SÖZLEŞME; kart bundan çekilir, fatura bunu yazar
  //      `referansTutar` (USD) → VİTRİN; hiçbir tahsilat/fatura bunu okumaz
  //    Y  Yuvarlama ASLA aşağı inmez (bedelin altına düşmek gelir kaybıdır)
  //       ve …49/…99 biçimini korur; fark 100 TL'yi aşmaz.
  //    H  TL hesabı KDV DAHİL üretir — çünkü iyzico planında ayrı KDV satırı
  //       yok ve `fatura.servisi` geleni KDV dahil kabul edip matrahı GERİYE
  //       hesaplıyor. H2 bu iki formülün AYRIŞMADIĞINI ölçer; ayrışırsa KDV
  //       yanlış beyan edilir.
  //    K  Kur değişimi fiyata doğru yansır; K3 kur kilidinin çalıştığını
  //       (eski müşterinin dolar karşılığının düşmesini) belgeler.
  //    MUTASYONLA ÖLÇÜLDÜ (2/2 öldü): aşağı yuvarlamaya izin verilince Y1 ·
  //    KDV çarpanı kaldırılınca H1/H2 kırmızı.
  { ad: 'Fiyat çapası: vitrin dolar / sözleşme TL (Y/H/K)', script: 'test:fiyat-capasi', zincir: 'Z0' },
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
