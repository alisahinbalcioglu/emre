/**
 * T2.14 — UÇ KAPISI  (`npm run test:uc-kapisi`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * KURAL: Her HTTP ucu ya bir ÜCRETLİ KAPI taşıyacak (`@RequireTier` ve/veya
 * `@GerekliYetenek`) ya da aşağıdaki `UCRETSIZ` listesinde KATEGORİSİ ve
 * GEREKÇESİYLE yer alacak. İkisi de yoksa bu kapı KIRMIZI yanar.
 *
 * ── NEDEN VAR (aynı kör noktaya İKİ KEZ çarpıldı, 22.09.2026) ─────────────
 *  1. Veri imhası turunda §4.5'in 403 kapısı `@GerekliYetenek` ile kurulamadı:
 *     `library` · `brands` · `materials` · `labor-firms` denetleyicilerinde
 *     SIFIR dekoratör vardı ve `erisim.guard.ts` metadata yoksa `true` döner.
 *     Kapı `JwtAuthGuard`a konarak DOLANILDI.
 *  2. 2.13 kapatılırken ölçüldü: 200 ucun 178'i ne `@RequireTier` ne
 *     `@GerekliYetenek` taşıyordu.
 *
 * İki kez aynı yerde tökezlemek yapısal bir boşluğa işaret eder: KAPI EKLEMEK
 * TEK BAŞINA ÇÖZÜM DEĞİLDİR — yarın eklenen uç yine kapısız doğar. Bu dosya
 * "unutmayı engelleyen kapı"dır; deseni `manifest-kapisi.ts`ten (PK1) alınmıştır
 * ("her script ya SUITES'te ya gerekçeli istisnada").
 *
 * ── LİSTE SESSİZ ÇÖP KUTUSU OLMASIN ──────────────────────────────────────
 * Gerekçesiz satır kabul EDİLMEZ. Kategori de nerede ölçülebiliyorsa ÖLÇÜLÜR:
 *   · `YONETICI` kategorisi gerçekten `@Roles('admin')` taşımak zorundadır —
 *     "bu zaten admin ucu" demek yetmez, kanıt koddan okunur.
 *   · `YONETICI_KATALOGU` gerekçesi bir `dosya.tsx:satır` kanıtı taşımak
 *     zorundadır — iddia değil ÖLÇÜM.
 *   · `KIMLIK` / `ODEME` / `KVKK` kategorisindeki bir uca ücretli kapı
 *     konulursa kapı kırmızı yanar (bunlar ödemeye BAĞLANAMAZ).
 *
 * ── MEKANİZMA ↔ BAĞLANTI (bu depoda tek oturumda 6 kez görülen hata) ──────
 * Dekoratör tek başına hiçbir şeyi kapatmaz. `@GerekliYetenek` taşıyan bir uç
 * `ErisimGuard`ı görmüyorsa dekoratör SÜS'tür. Aynısı `@RequireTier` ↔
 * `TierGuard` için. Kural 3 tam olarak bunu ölçer.
 *
 * ÇIKIŞ KODU SÖZLEŞMESİ:
 *   0 → tüm kurallar geçti
 *   1 → en az bir ihlal
 *   2 → ÖN KOŞUL YOK / ölçüt boşa düştü (boş küme yalancı yeşil üretmesin)
 */
import * as path from 'path';
import {
  Uc,
  controllerDosyalari,
  dekoratorVar,
  ucEnvanteri,
  ucretliKapiVar,
} from './yardimci/uc-envanteri';

/** Ücretsiz kalmasının GEREKÇE AİLESİ. Kapalı küme — yenisi eklenmek istenirse
 *  önce buraya kural metni yazılır. */
type Kategori =
  /** Kimlik: giriş, kayıt, parola, e-posta doğrulama, MFA, kurumsal giriş.
   *  Kuralı: giriş yapamayan müşteri HİÇ ödeyemez. Ödemeye bağlanamaz. */
  | 'KIMLIK'
  /** Ödeme: paket seçme, abonelik, iyzico dönüşü/webhook, havale, fiyat sayfası.
   *  Kuralı: ödeme yolunu ödemeye bağlamak KİLİTLENME üretir (askıdaki firma
   *  askıdan çıkamaz). `erisim.servisi.ts` ABONELIK_YONET yedi durumun
   *  yedisinde de açık; `erisim-kapisi-test.ts` W3 ★KALKAN bunu kilitler. */
  | 'ODEME'
  /** KVKK: veri indirme, hesap kapatma.
   *  Kuralı (`hesap.servisi.ts` başlığı): bir KVKK hakkı ödeme durumuna
   *  bağımlı olamaz. */
  | 'KVKK'
  /** Sağlık/teşhis/sürüm/kur: değer üretmez, satılmaz. */
  | 'SAGLIK'
  /** Platform yöneticisi ucu. ⚠ `@Roles('admin')` ÖLÇÜLÜR (Kural 5).
   *  Kuralı (K2-F1, `guvenlik-uclari-test.ts`): aboneliği olmayan yönetici
   *  KENDİ küresel kataloğunu yönetebilmeli. */
  | 'YONETICI'
  /** Müşteriye de görünen ama YÖNETİCİ KATALOG EKRANI'nın da bağımlı olduğu
   *  uç. ⚠ Gerekçede `dosya.tsx:satır` kanıtı ZORUNLU (Kural 6). */
  | 'YONETICI_KATALOGU'
  /** Firma kimliği/üyelik/kurumsal giriş yönetimi.
   *  Kuralı: kapatmak firmayı TUZAĞA düşürür — koltuk azaltamaz, sahipliği
   *  devredemez, fatura kimliğini düzeltemez, yani ödeyemez hâle gelir. */
  | 'FIRMA_YONETIMI'
  /** "Veriyi göstermeye devam et, değer üretmeyi durdur" (erisim.servisi.ts).
   *  ⚠ `erisim-kapisi-test.ts` W4 ★KALKAN bu uçlara yetenek KONULMAMASINI
   *  ayrıca kilitler — buradaki satır o kalkanın ikizidir. */
  | 'KISITLI_MODDA_GORUNTULEME';

/** `anahtar` → [kategori, gerekçe]. Gerekçe BOŞ OLAMAZ. */
type Muafiyet = [Kategori, string];

// ═══════════════════════════════════════════════════════════════════════════
//  ÜCRETSİZ KALMASI DOĞRU OLAN UÇLAR
//  (22.09.2026 · T2.14 · 124 uç · sınıflandırma raporu: T214-rapor.md)
// ═══════════════════════════════════════════════════════════════════════════
const UCRETSIZ: Record<string, Muafiyet> = {
  // ── KİMLİK ────────────────────────────────────────────────────────────
  'POST /auth/register': ['KIMLIK', 'Kayıt olamayan ziyaretçi hiç müşteri olamaz.'],
  'POST /auth/login': ['KIMLIK', 'Giriş yapamayan müşteri ödeme sayfasına da ulaşamaz.'],
  'GET /auth/me': ['KIMLIK', 'Oturum kimliği + yetenek matrisi; ön yüz kısıtlı modu buradan öğrenir.'],
  'PATCH /auth/profil': ['KIMLIK', 'Ad/soyad düzeltmesi kimlik bilgisidir, satılan özellik değil.'],
  'POST /auth/forgot-password': ['KIMLIK', 'Parolasını unutan müşteri kilitlenirse ödeyemez.'],
  'POST /auth/reset-password': ['KIMLIK', 'Parola sıfırlama kimlik kurtarma yoludur.'],
  'POST /auth/change-password': ['KIMLIK', 'Güvenlik eylemi; ödemeye bağlanırsa ele geçirilen hesap kapatılamaz.'],
  'POST /auth/verify-email': ['KIMLIK', 'E-posta doğrulaması kayıt akışının parçası.'],
  'POST /auth/resend-verification': ['KIMLIK', 'Doğrulama e-postası ulaşmayan kullanıcı akışta kalamaz.'],
  'POST /auth/sso/kesfet': ['KIMLIK', 'Kurumsal giriş keşfi — girişin kendisi.'],
  'POST /auth/sso/baslat': ['KIMLIK', 'Kurumsal giriş başlatma — girişin kendisi.'],
  'POST /auth/sso/niyet': ['KIMLIK', 'Kurumsal giriş bağlama niyeti — giriş akışı.'],
  'GET /auth/sso/donus': ['KIMLIK', 'Kimlik sağlayıcısının dönüş ucu; oturum burada açılır.'],
  'POST /auth/sso/degis': ['KIMLIK', 'Hesap/firma değiştirme — giriş akışı.'],
  'POST /auth/sso/katil': ['KIMLIK', 'Kurumsal alan adıyla firmaya katılma — giriş akışı.'],
  'DELETE /auth/sso/baglanti': ['KIMLIK', 'Kendi kurumsal bağlantısını kaldırma; kapatılırsa kullanıcı giriş yolunu kaybeder.'],
  'POST /auth/mfa/dogrula': ['KIMLIK', 'İki adımlı girişin ikinci adımı — girişin kendisi.'],
  // 23.09.2026 (Emre kararı): yönetici girişinde kod e-postaya gider. Uç
  // GUARDSIZ olmak ZORUNDA — çağıran henüz oturum almamıştır; yetki meydan
  // okuma token'ından gelir (`mfa-dogrula`), oturumdan değil. Kötüye
  // kullanıma karşı iki kapı var: 60 sn yeniden gönderim kısıtı (servis) ve
  // 15 dk/6 istek throttle (denetleyici).
  'POST /auth/mfa/eposta/gonder': [
    'KIMLIK',
    'Yönetici giriş kodunu e-postaya gönderir — girişin ikinci adımı, oturum ÖNCESİ.',
  ],
  'POST /auth/mfa/zorunlu-kurulum/baslat': ['KIMLIK', 'Firma MFA zorunlu kıldıysa giriş bu adımdan geçer.'],
  'POST /auth/mfa/zorunlu-kurulum/onayla': ['KIMLIK', 'Zorunlu MFA kurulumunun onayı — girişin kendisi.'],
  'POST /auth/mfa/kurulum/baslat': ['KIMLIK', 'Güvenlik ayarı; ödemeye bağlanamaz.'],
  'POST /auth/mfa/kurulum/onayla': ['KIMLIK', 'Güvenlik ayarı; ödemeye bağlanamaz.'],
  'POST /auth/mfa/kapat': ['KIMLIK', 'Cihazını kaybeden kullanıcı MFA kapatamazsa hesabından kilitlenir.'],
  'POST /auth/mfa/kurtarma-kodlari/yenile': ['KIMLIK', 'Kurtarma kodu = hesaba erişimin son yolu.'],
  'POST /auth/mfa/sirket-girisinde-de-sor': ['KIMLIK', 'MFA tercihi; güvenlik ayarı, satılan özellik değil.'],
  'POST /auth/davet-bilgi': ['KIMLIK', 'Davet bağlantısının karşılama ekranı; davetli henüz oturum açmamıştır.'],
  'POST /auth/davet-kabul': ['KIMLIK', 'Daveti kabul = hesap açılışı. Davetin ücretli kapısı davet GÖNDERME ucundadır (KULLANICI_DAVET).'],

  // ── ÖDEME ─────────────────────────────────────────────────────────────
  'GET /abonelik/paketler': ['ODEME', 'Paket listesi görülmeden paket seçilemez.'],
  'GET /abonelik/durum': ['ODEME', 'Firmanın kendi abonelik durumu; kapatmak "neden kısıtlıyım" sorusunu cevapsız bırakır.'],
  'POST /abonelik/basla': ['ODEME', 'Satın almanın kendisi. Kapatılırsa askıdaki firma askıdan ÇIKAMAZ.'],
  // 23.09 — paket değişimi. Yetenek kapısı konmaz: yalnız AKTIF/DENEME firma
  // değiştirir ve bu kural `paketDegisimYolu`nda; kapıya bağlamak ödemesi
  // geciken firmaya "önce ödeyin" yerine "erişiminiz yok" dedirtirdi.
  'POST /abonelik/degistir': ['ODEME', 'Paket yükseltme/düşürme — sözleşme bedelini değiştiren ödeme işlemi; kural karar fonksiyonunda.'],
  'POST /abonelik/donus': ['ODEME', 'iyzico 3-D dönüşü; ödeme burada sonuçlanır.'],
  'POST /abonelik/kart-guncelle': ['ODEME', 'Kartı geçersizleşen firma kartını değiştiremezse hiç ödeyemez.'],
  'POST /abonelik/iptal': ['ODEME', 'İptal hakkı ödeme durumuna bağlanamaz (tüketici hakkı).'],
  'POST /abonelik/iyzico-donus': ['ODEME', 'iyzico çapraz-site dönüş POST\'u; kimlik token\'ın kendisidir, oturum yok.'],
  'POST /webhook/iyzico/abonelik': ['ODEME', 'Sağlayıcıdan gelen olay; oturum yok, imzayla doğrulanır.'],
  'GET /fiyatlar': ['ODEME', 'Girişsiz ziyaretçiye açık fiyat sayfası (Faz 6.1); ThrottlerGuard ile IP sınırlı.'],

  // ── KVKK ──────────────────────────────────────────────────────────────
  'GET /auth/hesabim/verilerim': ['KVKK', 'Veri indirme. `hesap.servisi.ts` başlığı: bir KVKK hakkı ödeme durumuna bağımlı olamaz.'],
  'GET /auth/hesabimi-kapat/onizleme': ['KVKK', 'Hesap kapatmanın sonuçlarını gösterir; kapatma hakkının ön adımı.'],
  'POST /auth/hesabimi-kapat': ['KVKK', 'Hesap kapatma (silme) hakkı ödeme durumuna bağımlı olamaz.'],

  // ── SAĞLIK / TEŞHİS ───────────────────────────────────────────────────
  'GET /health': ['SAGLIK', 'Canlılık probu; kimlik bile istemez, veri döndürmez.'],
  'GET /dwg-engine/health': ['SAGLIK', 'Python motorunun ayakta olup olmadığı; `{status}` dışında veri yok.'],
  'GET /matching/index-health': ['SAGLIK', 'İndeks sayaçları (teşhis). Eşleştirmenin KENDİSİ kapılı (POST bulk-match).'],
  'GET /exchange-rates': ['SAGLIK', 'TCMB kurları — kamuya açık veri, kimlik istemez.'],

  // ── KISITLI MODDA GÖRÜNTÜLEME (veri rehin alınmaz) ────────────────────
  'GET /quotes': ['KISITLI_MODDA_GORUNTULEME', 'W4 ★KALKAN (erisim-kapisi-test.ts): listeye yetenek konulursa müşteri kendi tekliflerini kaybeder.'],
  'GET /quotes/:id': ['KISITLI_MODDA_GORUNTULEME', 'W4 ★KALKAN: teklifi görüntüleme kapatılmaz; DEĞER üreten uçlar (PUT, export) kapılı.'],
  'GET /quotes/:id/exports': ['KISITLI_MODDA_GORUNTULEME', 'Geçmiş revizyonların LİSTESİ; indirme ucu (`/exports/:rev`) CIKTI_INDIR ile kapılı.'],
  'DELETE /quotes/:id': ['KISITLI_MODDA_GORUNTULEME', 'Kendi verisini kaldırmak değer üretmez; silmeyi ödemeye bağlamak KVKK kuralının komşusudur.'],
  'GET /ai/translate/goruntule': ['KISITLI_MODDA_GORUNTULEME', 'W4 ★KALKAN (Faz 6.11/K-T8): ödemesi durmuş firma DAHA ÖNCE ÖDEDİĞİ çeviriyi görebilmeli.'],
  'GET /ai/translate/kota': ['KISITLI_MODDA_GORUNTULEME', 'Kalan kota sayacı; sayacı gizlemek çeviri satmaz, yalnız müşteriyi kör eder.'],
  'GET /ai/translate/duzeltmeler': ['KISITLI_MODDA_GORUNTULEME', 'W4 ★KALKAN: firmanın KENDİ sözlüğü kısıtlı modda görünür (yazma uçları CEVIRI ister).'],
  'GET /panel/ozet': ['KISITLI_MODDA_GORUNTULEME', '`panel.controller.ts` başlığı: sayaç okumak satılan özellik değil, zaten görülebilen listelerin adedi.'],

  // ── FİRMA YÖNETİMİ (kapatmak firmayı tuzağa düşürür) ──────────────────
  'GET /firma': ['FIRMA_YONETIMI', 'Fatura kimliği ekranı; kapatılırsa firma fatura bilgisini düzeltip ödeyemez.'],
  'PATCH /firma': ['FIRMA_YONETIMI', 'Unvan/VKN/adres düzeltmesi fatura kesilebilmesi için ŞART (fatura kimliği kapısı).'],
  'PATCH /firma/guvenlik': ['FIRMA_YONETIMI', 'MFA zorunluluğu gibi güvenlik politikası; ödemeye bağlanamaz.'],
  'POST /firma/logo': ['FIRMA_YONETIMI', 'Antet logosu firma kimliğidir; çıktı ucu ayrıca CIKTI_INDIR ile kapılı.'],
  'GET /firma/logo': ['FIRMA_YONETIMI', 'Kendi logosunu okumak; kısıtlı modda ekran bozulmasın.'],
  'DELETE /firma/logo': ['FIRMA_YONETIMI', 'Kendi yüklediği görseli kaldırmak (veri kaldırma hakkı).'],
  'GET /firma/uyeler': ['FIRMA_YONETIMI', 'Koltuk sayısını görmeden koltuk azaltılamaz; azaltamayan firma paket düşüremez.'],
  'DELETE /firma/davetler/:id': ['FIRMA_YONETIMI', 'Bekleyen daveti iptal = koltuk boşaltma. Davet GÖNDERME ucu KULLANICI_DAVET ile kapılı.'],
  'PATCH /firma/uyeler/:id/rol': ['FIRMA_YONETIMI', 'Sahiplik devri; kapatılırsa ayrılan sahibin firması yönetilemez hâle gelir.'],
  // 23.09.2026 (Ekip & İzinler): izin DARALTMAK bir güvenlik eylemidir —
  // ayrılacak bir çalışanın fiyat listesine erişimini kapatmak ödemeye bağlanamaz.
  'PATCH /firma/uyeler/:id/izinler': ['FIRMA_YONETIMI', 'Alt kullanıcının modül izinleri; ödemesi geciken firma da üyesinin erişimini daraltabilmeli (güvenlik eylemi).'],
  'DELETE /firma/uyeler/:id': ['FIRMA_YONETIMI', 'Üye çıkarma = koltuk azaltma; ödeme düşürmenin ön koşulu.'],
  'GET /firma/kurumsal-giris': ['FIRMA_YONETIMI', 'Kurumsal giriş ayarının durumu; giriş yolunun yapılandırması.'],
  'PUT /firma/kurumsal-giris': ['FIRMA_YONETIMI', 'Kurumsal giriş yapılandırması — bozulursa firmanın TAMAMI giriş yapamaz.'],
  'POST /firma/kurumsal-giris/etkinlestir': ['FIRMA_YONETIMI', 'Giriş yolunu açma; kilitlenmeyi önler.'],
  'POST /firma/kurumsal-giris/kapat': ['FIRMA_YONETIMI', 'Bozuk SSO yapılandırmasından çıkış yolu — kapatılırsa firma giriş yapamaz.'],
  'DELETE /firma/kurumsal-giris': ['FIRMA_YONETIMI', 'SSO yapılandırmasını silme; aynı kilitlenme gerekçesi.'],
  'DELETE /firma/uyeler/:id/kurumsal-baglanti': ['FIRMA_YONETIMI', 'Üyenin SSO bağlantısını koparma; parolayla girişe dönüş yolu.'],

  // ── YÖNETİCİ KATALOĞU (müşteriye de görünür, yönetici ekranı BAĞIMLI) ──
  // ⚠ Buradaki üç uç K2-F1 emsalinin aynısıdır: aboneliği olmayan platform
  //    yöneticisi kendi küresel kataloğunu yönetebilmeli. Kanıt ÖLÇÜLDÜ
  //    (22.09): `app/admin/**` içinden `/admin/*` DIŞINA çıkan tek okuma
  //    `GET /brands`; katalog Excel akışı ise `(protected)/materials/[brandId]`
  //    sayfasında yaşıyor ve `isAdmin` dalıyla yönetici işidir.
  'GET /brands': ['YONETICI_KATALOGU', 'Yönetici marka ekranı bu ucu okur: frontend/app/admin/brands/page.tsx:131.'],
  'GET /brands/:id/price-lists': ['YONETICI_KATALOGU', 'Yönetici Excel içe aktarım akışı: frontend/app/(protected)/materials/[brandId]/page.tsx:192 (isAdmin dalı 168).'],
  'GET /brands/price-lists/:listId/materials': ['YONETICI_KATALOGU', 'Aynı yönetici akışının malzeme okuması: frontend/app/(protected)/materials/[brandId]/page.tsx:233.'],

  // ── PLATFORM YÖNETİCİSİ (Kural 5: @Roles('admin') ÖLÇÜLÜR) ────────────
  'GET /brands/:id/silme-etkisi': ['YONETICI', 'Küresel katalog silme ön ölçümü.'],
  'POST /brands': ['YONETICI', 'Küresel marka açma.'],
  'PUT /brands/:id': ['YONETICI', 'Küresel marka düzenleme.'],
  'DELETE /brands/:id': ['YONETICI', 'Küresel marka silme.'],
  'POST /materials': ['YONETICI', 'Küresel malzeme kataloğuna ekleme.'],
  'PUT /materials/:id': ['YONETICI', 'Küresel malzeme düzenleme.'],
  'DELETE /materials/:id': ['YONETICI', 'Küresel malzeme silme.'],
  'POST /materials/price': ['YONETICI', 'Küresel baz fiyat yazma.'],
  'GET /labor/yonetici-katalog': ['YONETICI', 'R1-O4: paketsiz yöneticinin katalog ekranı boş kalmasın (labor.controller.ts).'],
  'POST /labor': ['YONETICI', 'W5 ★KALKAN: yönetici kendi küresel işçilik kataloğundan kilitlenmesin.'],
  'PUT /labor/:id': ['YONETICI', 'W5 ★KALKAN (aynı gerekçe).'],
  'DELETE /labor/:id': ['YONETICI', 'W5 ★KALKAN (aynı gerekçe).'],
  'POST /matching/backfill-tags': ['YONETICI', 'Toplu etiket göçü — bakım işi.'],
  'POST /matching/generate-tags': ['YONETICI', 'Toplu etiket üretimi — bakım işi.'],
  'POST /labor-matching/backfill-tags': ['YONETICI', 'İşçilik etiket göçü — bakım işi.'],
  'POST /ai/translate/correct': ['YONETICI', 'W6 ★KALKAN: küresel çeviri sözlüğü düzeltmesi yalnız yöneticiye açık.'],
  'POST /admin/firmalar/:firmaId/kurumsal-giris/zorunlu-kapat': ['YONETICI', 'Destek işlemi: SSO kilidini açma.'],
  'DELETE /admin/alan-adlari/:alanAdi': ['YONETICI', 'Alan adı sahipliğini kaldırma.'],
  'GET /admin/stats': ['YONETICI', 'Platform sayaçları.'],
  'GET /admin/ai-stats': ['YONETICI', 'AI maliyet/kullanım sayaçları.'],
  'GET /admin/ai-tasks': ['YONETICI', 'AI görev yapılandırması.'],
  'PATCH /admin/ai-tasks': ['YONETICI', 'AI görev yapılandırmasını değiştirme.'],
  'POST /admin/ai-health-check': ['YONETICI', 'Sağlayıcı sağlık ölçümü.'],
  'GET /admin/users': ['YONETICI', 'Kullanıcı yönetimi.'],
  'PATCH /admin/users/:id/role': ['YONETICI', 'Rol değiştirme.'],
  'PATCH /admin/users/:id/status': ['YONETICI', 'Hesap askıya alma/ban.'],
  'PATCH /admin/users/:id/tier': ['YONETICI', 'Seviye alanı (2.12\'den beri YETKİ VERMEZ, yalnız kayıt).'],
  'PATCH /admin/users/:id/firma-rol': ['YONETICI', 'Firma rolü atama.'],
  'POST /admin/users/:id/mfa-sifirla': ['YONETICI', 'Destek: MFA kilidini açma.'],
  'DELETE /admin/users/:id': ['YONETICI', 'Kullanıcı silme (yumuşak).'],
  'GET /admin/denetim': ['YONETICI', 'Denetim kaydı okuma.'],
  // 24.09 (A2): eski kişi-başı `users/:id/subscriptions` uçları KALDIRILDI
  // (erişim vermiyorlardı, canlıda 0 kullanım); yerine `yonetim/abonelik`.
  'GET /admin/settings': ['YONETICI', 'Platform ayarları.'],
  'PATCH /admin/settings': ['YONETICI', 'Platform ayarlarını değiştirme.'],
  'POST /admin/reindex-products': ['YONETICI', 'Küresel indeks yeniden üretimi.'],
  'POST /admin/brands/:brandId/price-lists': ['YONETICI', 'Küresel fiyat listesi açma.'],
  'GET /admin/price-lists/:id/silme-etkisi': ['YONETICI', 'Silme ön ölçümü.'],
  'DELETE /admin/price-lists/:id': ['YONETICI', 'Küresel fiyat listesi silme.'],
  'GET /admin/brands/:brandId/materials': ['YONETICI', 'Katalog okuma (yönetici ekranı).'],
  'GET /admin/price-lists/:id/materials': ['YONETICI', 'Katalog okuma (yönetici ekranı).'],
  'POST /admin/materials/extract-pdf': ['YONETICI', 'PDF\'ten malzeme ayıklama (küresel katalog).'],
  'POST /admin/materials/parse-full-excel': ['YONETICI', 'Excel ayrıştırma (küresel katalog).'],
  'POST /admin/brands/:brandId/save-from-sheets': ['YONETICI', 'Küresel katalog yazma.'],
  'POST /admin/brands/:brandId/import-excel/preview': ['YONETICI', 'İçe aktarım önizlemesi.'],
  'POST /admin/price-lists/:id/import-excel/preview': ['YONETICI', 'İçe aktarım önizlemesi.'],
  'POST /admin/brands/:brandId/import-excel/commit': ['YONETICI', 'İçe aktarımı yazma.'],
  'POST /admin/price-lists/:id/import-excel/commit': ['YONETICI', 'İçe aktarımı yazma.'],
  'POST /admin/materials/save-bulk': ['YONETICI', 'Toplu malzeme yazma.'],
  'GET /yonetim/havale': ['YONETICI', 'Bekleyen havale başvuruları.'],
  'POST /yonetim/havale/teklif': ['YONETICI', 'Havale teklifi oluşturma.'],
  'POST /yonetim/havale/:id/fatura': ['YONETICI', 'Havale faturası kesme.'],
  'POST /yonetim/havale/:id/onayla': ['YONETICI', 'Havale onayı (abonelik açılır).'],
  'POST /yonetim/havale/:id/iptal': ['YONETICI', 'Havale başvurusu iptali.'],
  'GET /yonetim/abonelik/:firmaId': ['YONETICI', 'Paket işlemleri paneli (A2).'],
  'POST /yonetim/abonelik/:firmaId/dusur': ['YONETICI', 'Yönetici düşürmesi — müşteri onayısız, dönem sonu (A2).'],
};

// ═══════════════════════════════════════════════════════════════════════════
//  ÜRÜN SÖZLEŞMESİ — KAPI AİLELERİ  (Kural 8)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Kural 1 "kapı VAR mı" diye sorar; hangi kapı olduğunu sormaz. Ölçüldü
 * (22.09, mutant M5): `labor-firms/findAll`den `@RequireTier('pro')`
 * kaldırılınca uç hâlâ `@GerekliYetenek` taşıdığı için Kural 1 SESSİZ kaldı —
 * yani işçiliği Pro'ya bağlayan ürün kuralı kapısız kalmıştı. Bu blok o
 * mutantı öldürür.
 *
 * KURAL: bir ailenin (yol öneki) `UCRETSIZ`te OLMAYAN her ucu, ailenin
 * beklediği kapıyı taşımak ZORUNDADIR. İstisnalar ayrıca yazılmaz —
 * `UCRETSIZ` listesi zaten tek istisna kaynağıdır (ikiz liste YOK).
 *
 * ⚠ EŞLEŞME SEGMENT SINIRINDA: `/labor` öneki `/labor-firms`i KAPSAMAZ.
 */
interface KapiAilesi {
  onek: string;
  /** Beklenen asgari paket kodu (`@RequireTier`). Yoksa paket kapısı aranmaz. */
  tier?: string;
  /** `@GerekliYetenek` zorunlu mu? */
  yetenek: boolean;
  gerekce: string;
}

const KAPI_AILELERI: KapiAilesi[] = [
  {
    onek: '/labor-firms',
    tier: 'pro',
    yetenek: true,
    gerekce:
      'İŞÇİLİK = PRO. `scripts/paketleri-kur.ts:76`: "core (malzeme) | pro (malzeme + işçilik + dwg)". ' +
      'Ölçüldü (22.09): 17 ucun 17\'si `kimlikCoz(user)` ile FİRMA-ÖZEL; küresel/yönetici yolu YOK ' +
      '(yönetici kataloğu ayrı denetleyicide: /labor). Yani okuma-yazma ayrımı gerekmiyor, hepsi müşteri ucu.',
  },
  {
    onek: '/labor-matching',
    tier: 'pro',
    yetenek: true,
    gerekce: 'İşçilik eşleştirme motoru — aynı Pro kuralı (bakım ucu `backfill-tags` UCRETSIZ/YONETICI).',
  },
  {
    onek: '/labor',
    tier: 'pro',
    yetenek: true,
    gerekce: 'Küresel işçilik kataloğu OKUMA uçları Pro (W5 ★KALKAN: yazma uçları yönetici işidir, UCRETSIZ).',
  },
  { onek: '/library', yetenek: true, gerekce: 'Kullanıcının kendi kütüphanesi — ürünün satılan çekirdeği.' },
  { onek: '/brands', yetenek: true, gerekce: 'Malzeme havuzu okuması (yönetici ekranının bağımlı olduğu üç uç UCRETSIZ/YONETICI_KATALOGU).' },
  { onek: '/materials', yetenek: true, gerekce: 'Küresel malzeme okuması (yazma uçları yönetici işidir).' },
  { onek: '/matching', yetenek: true, gerekce: 'Eşleştirme motoru fiyat üretir — değer üreten uç.' },
  { onek: '/quotes', yetenek: true, gerekce: 'Teklif üretimi ve çıktısı (görüntüleme uçları W4 ★KALKAN ile UCRETSIZ).' },
  { onek: '/quote-formats', yetenek: true, gerekce: 'Teklif formatı = çıktı değeri.' },
  { onek: '/dwg-engine', yetenek: true, gerekce: 'DWG metrajı Pro paketin `dwgAktif` bayrağına bağlıdır (sağlık probu UCRETSIZ).' },
  { onek: '/excel-engine', yetenek: true, gerekce: 'Excel yükleme yolu — teklifin girdisi.' },
  { onek: '/excel-grid', yetenek: true, gerekce: 'Excel yükleme yolunun ikizi (tek parse, iki uç).' },
  { onek: '/ai', yetenek: true, gerekce: 'AI/çeviri GERÇEK para harcar; ödemesi durmuş firmaya masraf üretilmez.' },
];

function aileyeAitMi(yol: string, onek: string): boolean {
  return yol === onek || yol.startsWith(onek + '/');
}

/** `@RequireTier('pro')` gibi bir dekoratörün argümanlarını okur. */
function tierDegerleri(u: Uc): string[] {
  const hepsi = [...u.metotDekoratorleri, ...u.sinifDekoratorleri];
  for (const d of hepsi) {
    const m = d.match(/^RequireTier\((.*)\)$/s);
    if (m) return [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════
//  KOŞUM
// ═══════════════════════════════════════════════════════════════════════════
const BACKEND_KOKU = path.resolve(__dirname, '..');

const hatalar: string[] = [];
const onKosulHatalari: string[] = [];

const dosyalar = controllerDosyalari(path.join(BACKEND_KOKU, 'src'));
const uclar = ucEnvanteri(BACKEND_KOKU);
const kapili = uclar.filter(ucretliKapiVar);

// ── ÖLÇÜTÜ ÖNCE DOĞRULA (boş küme yalancı yeşil üretmesin) ────────────────
if (dosyalar.length === 0) onKosulHatalari.push('Hiç `*.controller.ts` bulunamadı — kapı hiçbir şeye bakmadı.');
if (uclar.length === 0) onKosulHatalari.push('Hiç HTTP ucu ayrıştırılamadı — AST ayrıştırıcısı boşa düşmüş olabilir.');
if (kapili.length === 0) onKosulHatalari.push('Hiç ücretli kapı bulunamadı — dekoratör okuma bozulmuş olabilir (bugün 76 bekleniyor).');

if (onKosulHatalari.length) {
  console.log('── T2.14 UÇ KAPISI ──');
  for (const h of onKosulHatalari) console.log(`  ⚠ ${h}`);
  console.log('\nT2.14 ÖN KOŞUL YOK — kapı YEŞİL DEMEZ (çıkış 2).');
  process.exit(2);
}

// ── KURAL 0: anahtar benzersiz olmalı (liste muğlak kalmasın) ─────────────
const sayac = new Map<string, Uc[]>();
for (const u of uclar) {
  if (!sayac.has(u.anahtar)) sayac.set(u.anahtar, []);
  sayac.get(u.anahtar)!.push(u);
}
for (const [anahtar, grup] of sayac) {
  if (grup.length > 1) {
    hatalar.push(
      `ÇAKIŞAN ANAHTAR: "${anahtar}" ${grup.length} kez tanımlı ` +
        `(${grup.map((g) => `${g.sinif}.${g.metot}`).join(', ')}) — muafiyet listesi hangisini kastettiğini söyleyemez.`,
    );
  }
}

// ── KURAL 1: her uç ya kapılı ya gerekçeli muaf ───────────────────────────
for (const u of uclar) {
  const kapiVar = ucretliKapiVar(u);
  const muaf = UCRETSIZ[u.anahtar];

  if (!kapiVar && !muaf) {
    hatalar.push(
      `KAPISIZ UÇ: "${u.anahtar}" (${u.dosya} · ${u.sinif}.${u.metot}) ne ücretli kapı taşıyor ` +
        'ne de UCRETSIZ listesinde. Ya `@RequireTier`/`@GerekliYetenek` ekleyin ya listeye KATEGORİ + GEREKÇE yazın.',
    );
    continue;
  }

  // ── KURAL 2: gerekçesiz muafiyet yok ──────────────────────────────────
  if (muaf && !muaf[1]?.trim()) {
    hatalar.push(`GEREKÇESİZ MUAFİYET: "${u.anahtar}" listede ama gerekçesi boş.`);
  }

  // ── KURAL 4: çelişki — hem muaf hem kapılı ────────────────────────────
  if (muaf && kapiVar) {
    const kategori = muaf[0];
    if (kategori === 'KIMLIK' || kategori === 'ODEME' || kategori === 'KVKK') {
      hatalar.push(
        `${kategori} UCUNA ÜCRETLİ KAPI KONMUŞ: "${u.anahtar}". ` +
          'Bu kategori ödemeye BAĞLANAMAZ — giriş/ödeme yolu kapanırsa müşteri hiç ödeyemez, ' +
          'KVKK hakkı ise hiçbir koşulda ödeme durumuna bağlanamaz (hesap.servisi.ts).',
      );
    } else {
      hatalar.push(
        `ÇELİŞKİ: "${u.anahtar}" hem UCRETSIZ listesinde hem ücretli kapı taşıyor — ` +
          'liste bayatlamış; kapı eklendiyse satırı listeden çıkarın.',
      );
    }
  }

  // ── KURAL 5: YONETICI kategorisi ÖLÇÜLÜR ──────────────────────────────
  if (muaf && muaf[0] === 'YONETICI' && !dekoratorVar(u, 'Roles')) {
    hatalar.push(
      `SAHTE YÖNETİCİ MUAFİYETİ: "${u.anahtar}" YONETICI kategorisinde ama `
        + '`@Roles` taşımıyor — "bu zaten admin ucu" iddiası koddan doğrulanamıyor.',
    );
  }

  // ── KURAL 6: YONETICI_KATALOGU gerekçesi KANIT taşımalı ───────────────
  if (muaf && muaf[0] === 'YONETICI_KATALOGU' && !/\.tsx?:\d+/.test(muaf[1])) {
    hatalar.push(
      `KANITSIZ KATALOG MUAFİYETİ: "${u.anahtar}" gerekçesinde `
        + '`dosya.tsx:satır` biçiminde bir yönetici çağrı yeri yok. İddia değil ÖLÇÜM yazın.',
    );
  }
}

// ── KURAL 3: MEKANİZMA ↔ BAĞLANTI (dekoratör tek başına kapatmaz) ────────
function etkinGuardlar(u: Uc): string[] {
  const hepsi = [...u.sinifDekoratorleri, ...u.metotDekoratorleri];
  const adlar: string[] = [];
  for (const d of hepsi) {
    const m = d.match(/^UseGuards\((.*)\)$/s);
    if (!m) continue;
    for (const p of m[1].split(',')) {
      const ad = p.trim().replace(/[^\w]/g, '');
      if (ad) adlar.push(ad);
    }
  }
  return adlar;
}

for (const u of uclar) {
  const guardlar = etkinGuardlar(u);
  if (dekoratorVar(u, 'GerekliYetenek') && !guardlar.includes('ErisimGuard')) {
    hatalar.push(
      `ÖLÜ DEKORATÖR: "${u.anahtar}" @GerekliYetenek taşıyor ama etkin guard listesinde ErisimGuard YOK ` +
        `(guardlar=${JSON.stringify(guardlar)}). Dekoratör süs, uç KORUMASIZ.`,
    );
  }
  if (dekoratorVar(u, 'RequireTier') && !guardlar.includes('TierGuard')) {
    hatalar.push(
      `ÖLÜ DEKORATÖR: "${u.anahtar}" @RequireTier taşıyor ama etkin guard listesinde TierGuard YOK ` +
        `(guardlar=${JSON.stringify(guardlar)}). Dekoratör süs, uç KORUMASIZ.`,
    );
  }
}

// ── KURAL 8: ÜRÜN SÖZLEŞMESİ — aile kapısı ───────────────────────────────
// "Kapı var" yetmez: DOĞRU kapı olmalı. Aileye ait olup `UCRETSIZ`te olmayan
// her uç, ailenin beklediği kapıyı taşımak zorunda.
for (const aile of KAPI_AILELERI) {
  const aitler = uclar.filter((u) => aileyeAitMi(u.yol, aile.onek));

  // ÖLÇÜT KONTROLÜ: aile boşsa kural hiçbir şeye bakmamıştır (önek bayatlamış).
  if (aitler.length === 0) {
    hatalar.push(
      `BAYAT AİLE ÖNEKİ: "${aile.onek}" hiçbir uca eşleşmiyor — yol değişmiş ve kural SESSİZ kalmış olabilir.`,
    );
    continue;
  }

  for (const u of aitler) {
    if (UCRETSIZ[u.anahtar]) continue; // istisna zaten gerekçeli
    if (aile.yetenek && !dekoratorVar(u, 'GerekliYetenek')) {
      hatalar.push(
        `AİLE KAPISI EKSİK: "${u.anahtar}" → ${aile.onek} ailesi @GerekliYetenek ister. ${aile.gerekce}`,
      );
    }
    if (aile.tier) {
      const okunan = tierDegerleri(u);
      if (!okunan.includes(aile.tier)) {
        hatalar.push(
          `AİLE PAKET KAPISI EKSİK: "${u.anahtar}" → ${aile.onek} ailesi @RequireTier('${aile.tier}') ister ` +
            `(okunan=${JSON.stringify(okunan)}). ${aile.gerekce}`,
        );
      }
    }
  }
}

// ── KURAL 7: bayat muafiyet (silinen ucun satırı da silinsin) ────────────
const mevcutAnahtarlar = new Set(uclar.map((u) => u.anahtar));
for (const anahtar of Object.keys(UCRETSIZ)) {
  if (!mevcutAnahtarlar.has(anahtar)) {
    hatalar.push(`BAYAT MUAFİYET: "${anahtar}" artık böyle bir uç YOK — listeden kaldırılmalı.`);
  }
}

// ── RAPOR ─────────────────────────────────────────────────────────────────
const kategoriSayim = new Map<string, number>();
for (const [, [k]] of Object.entries(UCRETSIZ)) {
  kategoriSayim.set(k, (kategoriSayim.get(k) ?? 0) + 1);
}

console.log('── T2.14 UÇ KAPISI ──');
console.log(`  controller dosyası        : ${dosyalar.length}`);
console.log(`  toplam HTTP ucu           : ${uclar.length}`);
console.log(`  ücretli kapı taşıyan      : ${kapili.length}`);
console.log(`  gerekçeli ÜCRETSİZ        : ${Object.keys(UCRETSIZ).length}`);
console.log(`  sınıflandırılmamış        : ${uclar.length - kapili.length - uclar.filter((u) => !ucretliKapiVar(u) && UCRETSIZ[u.anahtar]).length}`);
for (const [k, n] of [...kategoriSayim].sort()) console.log(`    ${k.padEnd(28)} ${n}`);

if (hatalar.length) {
  console.log('');
  for (const h of hatalar) console.log(`  ❌ ${h}`);
  console.log(`\nT2.14 FAIL — ${hatalar.length} ihlal.`);
  process.exit(1);
}
console.log(`\nT2.14 PASS — ${uclar.length} ucun tamamı kapsanmış (${kapili.length} kapılı + ${Object.keys(UCRETSIZ).length} gerekçeli ücretsiz).`);
