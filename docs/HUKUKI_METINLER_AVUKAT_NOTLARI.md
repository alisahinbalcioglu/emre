# Hukuki metinler — avukata sorulacaklar

> ## ✅ 22.09.2026 — METİNLER ONAYLANDI, DÖRT YER TUTUCU KAPANDI
>
> **`HUKUKI_METIN_DURUMU` = `'onayli'`** (Emre: "avukat onay verdi").
> Dört hukuki sayfanın üstündeki taslak şeridi KALKTI. Metin sürümü
> `2026-09-22` (ön yüz ve arka yüz ikizi birlikte artırıldı).
>
> **Açık kalan dört yer tutucunun DÖRDÜ DE dolduruldu** (Emre kararları) ve
> `HUKUKI_KARARLAR` sabitine taşındı — metne düz yazılmadı:
>
> | Yer tutucu | Karar |
> |---|---|
> | `[YASAL SAKLAMA SURESI]` | **10 yıl** |
> | `[FIRMA ISLEM KAYDI SAKLAMA SURESI]` | **hesabınız açık olduğu sürece** |
> | `[DENEME KAYDI SAKLAMA SÜRESİ]` | **2 yıl** |
> | `[FATURA İLETİM YÖNTEMİ]` | **e-posta ile** |
>
> Aşağıdaki bölümlerde bu dördü için geçen "hâlâ boş / doldurulmadı"
> ifadeleri BAYATTIR.
>
> **⚠⚠ "2 yıl" YAZMADAN ÖNCE KOD DÜZELTİLDİ.** 21.09'da ürün bu kaydı
> (`DenemeKullanimi`) **hiç silmiyordu**; şemanın kendi yorumu "bu satırı
> silmemeli" diyordu. Yer tutucuya "2 yıl" yazmak müşteriye tutulmayan bir
> söz vermek olurdu. Önce **yaş ekseni** eklendi
> (`backend/src/ozellik/imha/saklama-sureleri.ts` +
> `ImhaServisi.eskiDenemeKayitlariniSil`, günlük 04:15 işine bağlı), sonra
> cümle yazıldı. Kayıt firma ekseninde HÂLÂ korunuyor (hesabını kapatan kişi
> ikinci bir ücretsiz deneme alamaz); silinen şey **2 yaşını dolduran** kayıt.
> `test:faz5` D13 metin ile kodun aynı yılı söylediğini ölçer.
>
> **⚠ AVUKATA HATIRLATILACAK — onay, aşağıdaki ÜÇ SSO SORUSUNDAN ÖNCE
> geldi.** Bu dosyanın "Kurumsal giriş" bölümü, KVKK m.9 (yurt dışına
> aktarım), sıfat (veri sorumlusu / veri işleyen) ve alıcı listesi
> sorularının yanıtlanmadan metinlerin onaylı yapılmamasını yazıyordu.
> Emre'nin 22.09 beyanı genel bir onaydır; bu üç soru **ayrıca teyit
> edilmeli**. Yanıt metni değiştirirse sürüm artar ve gerekirse şerit
> `HUKUKI_METIN_DURUMU = 'taslak'` ile geri getirilir (mekanizma duruyor,
> `test:faz5` D8b/D9 ölçüyor).
>
> **Posta kutusu:** `info@metapricex.com` çalışıyor — Emre teyidi (21.09,
> "mail geliyor"). Aşağıdaki "kutu henüz açılmadı" uyarısı BAYATTIR.

> ## ⚠ 16.09.2026 GÜNCELLEMESİ — bu dosyanın altındaki bazı bulgular BAYATTI
>
> **Satıcı kimliği GİRİLDİ (Faz 6.4).** Aşağıdaki "Doldurulması gereken alanlar"
> listelerindeki satıcı alanlarının TAMAMI dolduruldu ve artık tek kaynaktan
> (`frontend/ozellik/hukuki/metinler.ts` → `SATICI`) okunuyor; metinlerde düz
> yazılmış köşeli parantez KALMADI. Girilen değerler:
> unvan, adres, MERSİS, **ticaret sicil no**, vergi dairesi/no, e-posta, telefon.
> KEP adresi YOK → alan `null` ve metinde satır **hiç basılmıyor**.
>
> **İki hukuki karar da verildi (Emre, 15.09)** ve tek sabitte
> (`HUKUKI_KARARLAR`) duruyor:
> - İade: "Kalan günler için iade yapılmaz; dönem sonuna kadar kullanmaya devam edersiniz."
> - Yetkili mahkeme: "İstanbul Anadolu Mahkemeleri ve İcra Daireleri"
>
> **~~HÂLÂ AÇIK olan üç yer tutucu~~ — ÜÇÜ DE 22.09'DA KAPANDI** (yukarıdaki bloğa bak):
> - `[YASAL SAKLAMA SURESI]` — Gizlilik, fatura/ödeme kayıtları (avukat)
> - `[DENEME KAYDI SAKLAMA SÜRESİ]` — Gizlilik, ücretsiz deneme kaydı (avukat)
> - `[FATURA İLETİM YÖNTEMİ]` — Ön Bilgilendirme 11. bölüm (muhasebe programı kararı)
>
> **Cayma hakkı bölümü** bilerek kesin hükme bağlanmadı (Ön Bilgilendirme 8,
> Sözleşme 5) — avukat kararı bekliyor.
>
> **YENİ METİN: Mesafeli Satış Sözleşmesi.** Bugüne kadar yalnız Ön
> Bilgilendirme Formu vardı. Sözleşme aynı sayfada ikinci bölüm olarak
> yayımlandı (`/mesafeli-satis#sozlesme`) ve satın alma adımında **zorunlu onay
> kutusuyla** onaylatılıyor; onay zamanı ve onaylanan metin sürümü kayda
> geçiyor. Aşağıdaki "Bugün satın alma akışında onay kutusu ve onay kaydı YOK"
> maddesi bu nedenle ARTIK GEÇERSİZ — sorulacak soru değişti: **alınan onayın
> biçimi ve saklanan iz yeterli mi?**
>
> **BAYAT BULGU DÜZELTMESİ:** aşağıda iki yerde "GET /auth/hesabim/verilerim ve
> POST /auth/hesabimi-kapat uçları kodda YOK" yazıyor. **YANLIŞ:** iki uç da
> bugün VAR (`backend/src/altyapi/auth/auth.controller.ts`) ve ekranda Profil
> sayfasında "Verilerimi indir (JSON)" ile "Hesabımı kapat" olarak görünüyor.
> Kullanım Koşulları'ndaki "kapatan düğme yok" cümlesi de kaldırıldı.
>
> **~~HÂLÂ GEÇERLİ UYARI~~ — BAYAT (22.09): posta kutusu ÇALIŞIYOR.**
> ~~`info@metapricex.com` kutusu **henüz açılmadı**.~~ Dört hukuki sayfa ve sözleşme başvuru adresi olarak bu
> adresi gösteriyor. **Kutu açılıp test maili ulaşmadan bu sürüm canlıya
> ÇIKMAZ.**
>
> **~~Metin durumu hâlâ `taslak`~~ — BAYAT (22.09): durum `onayli`,**
> şerit dört sayfadan da kalktı.


Metinler uygulamanin KODUNDAN olculen gercek veri akisina gore yazildi
ve bir denetim turundan gecti. Asagidaki maddeler KOD tarafindan
cozulemeyen, hukuki karar gerektiren noktalardir.

## Gizlilik Politikası ve KVKK Aydınlatma Metni (`/gizlilik`)

**Doldurulmasi gereken alanlar:**
- [FIRMA UNVANI]
- [ADRES]
- [MERSIS NO]
- [VERGI DAIRESI VE VERGI NO]
- [BASVURU E-POSTA ADRESI]
- [TELEFON]
- ~~[YASAL SAKLAMA SURESI]~~ → **KAPANDI 22.09: 10 yıl** (Emre kararı).

**Hukuki karar gerektirenler:**
- Yurt dışına aktarım (Anthropic/ABD, Brevo/Fransa, Hetzner/Almanya) KVKK m.9 kapsamında neye dayandırılacak: açık rıza mı, standart sözleşme + Kurul bildirimi mi, taahhütname mi? Metinde bugün yalnızca aktarımın varlığı bildiriliyor, hukuki ayak belirtilmiyor.
- Kullanıcının yüklediği keşif/metraj dosyası kendi müşterisine ait veri içeriyor. Bu durumda biz kullanıcı karşısında 'veri işleyen' konumuna geçiyor muyuz ve kullanıcılarla ayrı bir veri işleyen sözleşmesi imzalanması gerekiyor mu?
- VERBIS (Veri Sorumluları Sicili) kayıt yükümlülüğü doğuyor mu? Çalışan sayısı ve yıllık ciro eşikleri değerlendirilmeli.
- Fatura, ödeme ve abonelik kayıtları için metne yazılacak kesin saklama süresi ne olmalı — VUK 5 yıl mı, TTK 10 yıl mı, ikisinin uzunu mu?
- Yönetici işlem kayıtlarının (denetim izi) süresiz saklanması meşru menfaat kapsamında savunulabilir mi, yoksa azami bir süre belirlenmeli mi? Bu kayıtta silinen kullanıcının e-postası da kopyalanıyor.
- Hesap kapatmada kullanılan damgalama yöntemi (veri anında imha edilmiyor) silme talebi karşısında yeterli mi? Metinde imha için taahhüt edilecek azami bir süre yazılmalı mı?
- Şahıs şirketi faturası için T.C. kimlik numarası toplanması ek bir açık rıza veya ayrı aydınlatma gerektiriyor mu?
- Ödeme sayfasına iyzico'nun betikleri enjekte ediliyor ve iyzico kendi çerezlerini bırakabiliyor. Bu, bizim tarafımızdan ayrı bir çerez onayı gerektirir mi, yoksa zorunlu hizmet unsuru sayılır mı?
- Kullanım Şartları / Mesafeli Satış Sözleşmesi metinleriyle bu metnin sınırı nasıl çizilecek — ödeme, iade ve abonelik hükümleri buraya değil oraya mı yazılmalı?
- Veri ihlali bildiriminde Kurul'a 72 saat süresinin metinde açıkça yazılması isteniyor mu, yoksa 'en kısa sürede' ifadesi yeterli mi?
- Metin yayına alınmadan önce [BASVURU E-POSTA ADRESI] alanına yazılacak adresin posta alabildiği doğrulanmalı: alan adının MX kaydı bugün tanımlı değil, bu adrese gönderilen iletiler göndericiye geri döner. Cevaplanamayan bir başvuru adresi, KVKK m.13 başvuru hakkını fiilen kullanılamaz hâle getirir.

## Kullanım Koşulları (`/kullanim-kosullari`)

**Doldurulmasi gereken alanlar:**
- [FİRMA UNVANI]
- [FİRMA ADRESİ]
- [MERSİS NO]
- [VERGİ DAİRESİ]
- [VERGİ NO]
- [İLETİŞİM E-POSTASI]
- [TELEFON]
- [İADE POLİTİKASI]
- [YETKİLİ MAHKEME ŞEHRİ]

**Hukuki karar gerektirenler:**
- ⚠⚠ **BU MADDE BAYAT (16.09): iki uç da VAR, metin düzeltildi.** Aşağıdaki metin tarihsel kayıt olarak duruyor. — ⚠ ENVANTER DÜZELTMESİ (koddan ölçüldü, yayına almadan önce KARAR gerekir): Envanter E maddesi 'GET /auth/hesabim/verilerim' ve 'POST /auth/hesabimi-kapat' uçlarının BUGÜN çalıştığını söylüyor. ÖLÇTÜM: bu iki uç kodda YOK. Tüm worktree'de (backend+frontend, .ts/.tsx) 'hesabimi-kapat', 'verilerim', 'delete-account', 'data-export' için SIFIR eşleşme. Canlı auth controller'da (backend/src/altyapi/auth/auth.controller.ts) tam 9 rota var: register, login, me, forgot-password, reset-password, change-password, verify-email, resend-verification. Kendi verisini indirme ve kendi hesabını kapatma özelliği KULLANICIYA AÇIK DEĞİL. 'deletedAt' damgasını yazan tek yer admin tarafı (src/ozellik/kutuphane/admin/admin.service.ts:332-337). Bu yüzden 10. maddeyi 'e-posta ile talep edin' şeklinde yazdım. İki seçenek: (a) metni böyle bırakın ve talebi elle işleyin, (b) önce iki ucu yazın, sonra metni 'Hesabım ekranından kapatabilirsiniz' diye güncelleyin. Gizlilik Politikası metni de aynı düzeltmeyi almalı — orada 'JSON olarak indirebilirsiniz' yazılırsa var olmayan bir hak vaat edilmiş olur.
- ⚠ MX KAYDI YOK: metinde hesap kapatma ve tüm bildirimler [İLETİŞİM E-POSTASI] adresine yönlendiriliyor. Alan adının MX kaydı bugün bulunmadığı için o adrese gelen postalar geri döner. Metin yayına alınmadan ÖNCE MX kaydı kurulmalı, yoksa sözleşmede söz verilen tek iletişim kanalı fiilen kapalı olur.
- İADE POLİTİKASI belirlenmedi. 'POST /abonelik/iptal' kodda dönem sonuna kadar erişim veriyor (abonelik.controller.ts:102 yorumu), ama kısmi dönem iadesi yapılıp yapılmayacağı kodda yok. [İADE POLİTİKASI] yer tutucusu bunun için bırakıldı — mesafeli satış / abonelik mevzuatı açısından cayma hakkı ile birlikte değerlendirilmeli.
- KDV ve fiyat gösterimi konusunda hiçbir şey yazmadım (kodda ölçülemedi). Abonelik ekranındaki fiyatların KDV dahil mi hariç mi gösterildiği netleşince 4. maddeye tek cümle eklenmeli.
- Kullanıcının 'tüketici değil, ticari faaliyet kapsamında' kullandığı kabulü (madde 1) ve yetki anlaşması (madde 12) birbirine bağlı. Kayıt akışı bugün şahıs şirketi için TC kimlik no da topluyor; tüketici sayılabilecek bir kullanıcı profili varsa yetki anlaşmasının geçerliliği tartışmalı hale gelir.
- Sorumluluk tavanı olarak 'son 12 ayda ödenen abonelik bedeli' seçildi. Bu yaygın bir sınır ama TBK m.115 (kast/ağır ihmal) karşısındaki geçerliliği ve B2B sözleşmede genel işlem koşulu denetimi açısından teyit edilmeli.
- Yapay zekâ aktarımı (madde 5) bilinçli olarak açıkça yazıldı. Bu, KVKK açısından yurt dışına aktarım (Anthropic/ABD) anlamına geliyor — Kullanım Koşulları'ndaki bu cümle tek başına yeterli hukuki dayanak DEĞİL; Gizlilik Politikası ve gerekiyorsa ayrı açık rıza / standart sözleşme mekanizması ile desteklenmeli.

## Çerez ve Tarayıcı Depolaması Politikası (`/cerez-politikasi`)

**Doldurulmasi gereken alanlar:**
- [FİRMA UNVANI] — ticaret sicilindeki tam resmi unvan; doldurulmadan yayına alınmamalı
- [FİRMA ADRESİ] — tebligata elverişli açık adres (il/ilçe dahil)
- [İLETİŞİM E-POSTA ADRESİ] — DİKKAT: metapricex.com alan adının bugün MX kaydı yok, bu adrese gelen posta geri döner. Yayına almadan önce gerçekten posta alabilen bir adres yazılmalı

**Hukuki karar gerektirenler:**
- Uygulamada hiç HTTP çerezi yok, yalnızca zorunlu localStorage/sessionStorage kayıtları var. Bu tabloda çerez rızası (onay bandı) yükümlülüğü doğar mı, yoksa yalnızca bilgilendirme yeterli mi?
- Ödeme ekranında iyzico'nun kendi betiklerinin sayfada çalışması ve kendi çerezlerini koyabilmesi için ayrı bir bilgilendirme veya onay gerekiyor mu? İyzico ile veri paylaşımının hukuki dayanağı (sözleşmenin ifası) bu metinde de yazılmalı mı?
- DWG çalışma verisi kullanıcının kendi tarayıcısında süresiz kalıyor ve sunucumuzda kopyası yok. Bu bizim açımızdan bir veri işleme sayılır mı; bu kayıtlar için saklama süresi beyan etmemiz gerekir mi?
- ⚠⚠ **BU MADDE BAYAT (16.09): iki uç da VAR.** — ÖLÇÜM NOTU (envanterle uyuşmayan bulgu): Kullanıcının verilerini indirme (GET /auth/hesabim/verilerim) ve hesabını kapatma (POST /auth/hesabimi-kapat) uçları bu kod tabanında BULUNAMADI — backend/src/altyapi/auth/auth.controller.ts yalnız register, login, me, profil, forgot-password, reset-password, change-password, verify-email, resend-verification uçlarını taşıyor. Bu nedenle çerez metninde bu iki ekrana atıf yapılmadı. Haklarını kullanmak isteyen kullanıcı için e-posta başvurusu yeterli mi, yoksa ekranın yapılması mı gerekir?
- İletişim adresi olarak gösterilecek e-posta bugün posta alamıyor (alan adının MX kaydı yok). Başvuru kanalı olarak çalışan bir adres (KEP veya farklı bir alan adı) gösterilmesi zorunlu mu?

## Mesafeli Satış Sözleşmesi Ön Bilgilendirme Formu (`/mesafeli-satis`)

**Doldurulmasi gereken alanlar:**
- [FİRMA UNVANI]
- [FİRMA ADRESİ]
- [MERSİS NO]
- [VERGİ DAİRESİ]
- [VERGİ NO]
- [TELEFON]
- [İLETİŞİM E-POSTASI] — ⚠ yayına almadan önce alan adına MX kaydı eklenmeli; bugün metapricex.com'a gelen e-postalar geri döner, yani yazılan adres cevap alınabilir bir adres değil
- ~~[FATURA İLETİM YÖNTEMİ]~~ → **KAPANDI 22.09: e-posta ile** (Emre kararı).
  ⚠ Metne yalnız "e-posta ile tarafınıza iletilir" yazıldı; "kaç gün içinde",
  "hangi adrese" gibi ayrıntılar ürün davranışıyla ölçülmeden YAZILMADI —
  hukuki metne doğrulanmamış bir söz koymak, yer tutucu bırakmaktan kötüdür.
- [İADE POLİTİKASI] — iade talebinin hangi koşullarda karşılanacağı; ayrı bir sayfa yapılacaksa bağlantısı verilmeli
- [YETKİLİ MAHKEME VE İCRA DAİRELERİ] — tüketici sayılmayan firma müşteriler için yetki şartı

**Hukuki karar gerektirenler:**
- Cayma hakkı: Abonelik ödeme onaylandığı anda kullanıma açılıyor. Bu, 'anında ifa edilen hizmet / gayrimaddi ürün' istisnası kapsamında mı? Ücretsiz deneme süresi varken 14 günlük süre ne zaman işlemeye başlar — deneme başlangıcı mı, ilk tahsilat mı?
- Müşteriler mühendislik ve taahhüt firmaları; hizmet ticari/mesleki amaçla alınıyor. Bu alıcılar TKHK anlamında 'tüketici' sayılır mı? Sayılmıyorsa mesafeli satış ön bilgilendirmesi zorunlu mu, yoksa ticari hizmet sözleşmesi mi düzenlenmeli?
- ⚠ GÜNCELLENDİ (16.09): onay kutusu ve onay kaydı EKLENDİ (zorunlu kutu, önceden işaretsiz; onay zamanı + metin sürümü `AbonelikBaslatma` satırında). Soru şuna döndü: bu iz 'kalıcı veri saklayıcısı' yükümlülüğünü karşılıyor mu, yoksa ön bilgilendirmenin müşteriye AYRICA e-postayla gönderilmesi mi gerekiyor? (Bugün satın alma sonrası e-posta ÖLÇÜLDÜ: `EpostaServisi` abonelik/ödeme bildirimi göndermiyor; yalnız dunning ve erişim uyarıları var.)
- ⚠ KARAR VERİLDİ (Emre, 15.09): kalan günler için iade YOK, metne yazıldı. Soru: bu hukuken savunulabilir mi? Deneme süresi bittikten hemen sonra iptal eden müşteride farklı bir sonuç doğar mı?
- Fiyat vitrinde ABD doları referansıyla gösterilip tahsilat TL yapılıyor. Döviz cinsinden fiyat gösterimine ilişkin kısıtlar (32 sayılı Karar ve ilgili tebliğler) açısından bu gösterim sakıncalı mı?
- Aylık otomatik yenileme öncesinde müşteriye ayrıca bildirim yapma yükümlülüğü var mı? Deneme süresi sonunda ücretli aboneliğe geçişte ek bildirim gerekiyor mu?
- Ödeme alınamadığında uygulanan kademeler (10. günde salt okunur, 30. günde askıya alma) sözleşmeye bu şekilde yazılabilir mi? Hizmet kesintisi öncesi asgari bildirim süresi gerekiyor mu?
- Fatura düzenleme ve iletme yükümlülüğü: e-arşiv fatura zorunlu mu, müşteriye hangi yolla ve hangi süre içinde iletilmeli?
- Hesap kapatıldığında verilerin anında imha edilmemesi (yedekler ve mevzuat gereği saklama) sözleşmede nasıl ifade edilmeli — KVKK ile mesafeli satış metni arasında çelişki doğuruyor mu?
- Yüklenen dosya içeriğinin yapay zekâ sağlayıcılarına (yurt dışına) gönderilmesi, hizmetin 'niteliği' olarak bu ön bilgilendirme formunda mı, yoksa yalnızca aydınlatma metninde mi yer almalı? Ayrıca açık rıza gerekiyor mu?

---

## Faz 7 — ekip ve kişi sınırı (F1b, 17.09.2026)

**Metne giren yenilikler (taslak, avukat onayı bekliyor):**
- Firma sahibi ekip arkadaşlarını e-postayla davet edebiliyor; bir kişi aynı anda yalnız bir firmanın üyesi olabiliyor (aydınlatma "kimler için" + kullanım koşulları "hesap" maddesi).
- Yeni aydınlatma bölümü **"Ekip içinde görünürlük"**: üyenin adı, e-posta adresi ve tekliflerdeki "Hazırlayan" bilgisi diğer üyelere görünür; ekipten çıkarılan ya da hesabını kapatan kişinin teklifleri firmada kalır ve "ayrıldı" notuyla görünür.
- Saklama süreleri: ekip daveti bağlantısı 7 gün; firma içi işlem kaydı →
  **KAPANDI 22.09: "hesabınız açık olduğu sürece"** (Emre kararı). Yönetici
  denetim izinden AYRILDI: o "silinmez", bu hesaba bağlı. Ölçüldü —
  `FirmaOlayi` imha listesinde `SILINECEKLER` içinde (`imha-listesi.ts:376`,
  firma ekseni), yani hesap imha edilince kayıt gerçekten gidiyor; cümle
  kodla uyumlu (`test:faz5` D13h ölçer).
- Kişi sınırı aşımı cümlesi (kullanım koşulları, paketler): hakkı aşan üyelerin erişimi **en son katılandan başlayarak durdurulur**, veri silinmez, durdurulan üye verilerini indirebilir ve hesabını kapatabilir.

**⚠ HUKUKİ KARAR GEREKTİREN — geriye dönük hak düşürme:**
Emre kararıyla (E-2) satıştaki paketlerin kullanıcı hakkı firma sahibi dahil **Basic 1 · Pro 2 · Pro-MEP 3** olarak yeniden tanımlandı. Bugünkü canlı değer beş pakette de **2**. Bu düşüş mevcut ödeyen Basic abonelerine **geriye dönük** uygulanırsa tek taraflı sözleşme değişikliği sayılabilir (mesafeli satış / abonelik koşulları). Sorular:
1. Mevcut abonelere eski hak dönem sonuna kadar korunmalı mı?
2. Korunmayacaksa asgari bildirim süresi ne olmalı?
3. "Erişimin durdurulması" (veri silinmeden) bir hizmet kesintisi midir; ödeme kademeleri için yazılan bildirim kuralı burada da geçerli mi?

Kod tarafı hazırlığı: `backend/scripts/kullanici-hakki-guncelle.ts` **varsayılan PROVA** modundadır ve hangi firmada kaç kişinin duracağını listeler; `--uygula` yalnız Emre onayından sonra koşulur. Bu turda **koşulmadı**, canlı `Paket` satırlarına dokunulmadı.

**⚠ İKİNCİ NOT — KVKK dışa aktarımında firma sahibinin gördüğü deneme kayıtları:**
§3.10 gereği firma sahibinin veri indirmesi artık firmanın `DenemeKullanimi` satırlarını da içeriyor. Bu satırlarda başka bir üyenin sadeleştirilmiş e-postası/telefonu bulunabilir. Firma sahibine verilen bu bilgi "kendi verisini öğrenme" hakkının kapsamında mı, yoksa üçüncü kişinin verisinin ifşası mı? (Faz 6.12a'da firma eksenli satırlar bilerek dışarıda bırakılmıştı; Faz 7 tasarımı sahip için içeri aldı.)

## Faz 7 — kurumsal giriş (F3b, 21.09.2026)

**Metne giren yenilikler (taslak, avukat onayı bekliyor):**
- Aydınlatma / işlenen veriler: **"Kurumsal giriş"** maddesi — firmanın kimlik hizmetinden (Microsoft Entra ID ya da Google Workspace) ad, soyad, e-posta, kurumsal hesap kimliği ve (Microsoft'ta) kuruluş kimliği alınır; parola hiçbir zaman görülmez. Firma zorunlu kılarsa parolayla giriş yapılamaz. İlk girişte boş kullanıcı hakkı varsa kişi ekibe üye olarak katılır ve bu sırada kullanım koşullarını onaylar.
- Aydınlatma / alıcılar: Microsoft ve Google **alıcı listesine EKLENMEDİ**; bunun yerine yönü açıkça yazan ayrı bir cümle eklendi ("veri akışı kimlik hizmetinden bize doğrudur; o hizmete sizin hakkınızda veri göndermeyiz — yalnız firmanızın alan adını yönlendirme ipucu olarak iletiriz").
- Aydınlatma / saklama: **"Kurumsal giriş işlem kaydı: en fazla 24 saat."** (`SsoAkisi` satırı; doğrulanmış kimlik özeti giriş biter bitmez null'lanır, satır 24 saatte silinir — saatlik iş.)
- Çerez/depolama politikası, sessionStorage listesi: **`mpx_sso_bag`** maddesi.
- Kullanım koşulları / hesap: kurumsal giriş, zorunlu kılma, otomatik katılım ve kapatma sonrası parola belirleme bağlantısı cümlesi.
- **Çerez beyanı cümlelerine DOKUNULMADI** ve dokunulmamalıdır: tasarım bilerek çerezsizdir (tarayıcı bağı bir `sessionStorage` sırrının SHA-256 özetidir; sunucu hiçbir yerde `Set-Cookie` yazmaz — `test:faz7-kurumsal` K28 bunu kaynak kapısı olarak tutuyor).

**⚠ HUKUKİ KARAR GEREKTİREN — yurt dışına aktarım ve sıfat:**
Kurumsal girişte Microsoft/Google, **müşteri firmanın kendi seçtiği ve yönettiği** kimlik sağlayıcısıdır. Akış tarayıcı yönlendirmesiyle oluşur ve bizden o hizmete kişisel veri gitmez (yalnız alan adı ipucu). Sorular:
1. Bu akış KVKK m.9 anlamında **yurt dışına aktarım** sayılır mı? Sayılırsa aktaran kimdir (biz mi, müşteri firma mı)?
2. Bu ilişkide bizim sıfatımız **veri sorumlusu** mu, **veri işleyen** mi? Müşteri firma kendi çalışanının verisi bakımından ayrı bir veri sorumlusu mudur?
3. Alıcı listesine eklememe tercihi (yalnız yön cümlesi) yeterli midir, yoksa Microsoft/Google alıcı olarak da sayılmalı mı?
Bu sorular yanıtlanmadan metinler `dolduruldu`/onaylı yapılmamalıdır (`HUKUKI_METIN_DURUMU = 'taslak'` korunuyor).

**⚠ İKİNCİ NOT — kişisel adresle kayıtlı üye bağlanamaz (bilinçli sınır):**
Açık bağlama ve sınama bağlaması, kurumsal hesabın kanıtlı e-postasının hesabın e-postasına **eşit olmasını** şart koşuyor (R1-O3: eşitlik olmadan çalınmış bir oturum anahtarı + firmanın dizinindeki herhangi ikinci bir kimlik = kalıcı, iki adımlı girişsiz arka kapı). Sonuç: e-postası şirket alan adında olmayan (örn. kişisel adresle kayıt olmuş) bir üye şirket hesabına bağlanamaz. O kişi için yol, sahibin onu ekipten çıkarması ve kişinin şirket hesabıyla yeniden katılmasıdır (verisi firmada kalır). Bu, ürün kararıdır; müşteriye duyurulacak metin gerekiyorsa avukat görüşü alınmalı.

**⚠ ÜÇÜNCÜ NOT — kilitlenme ve alan adı kurtarması:**
Firma sahibi süresi dolan bir istemci anahtarıyla kurumsal girişi zorunlu kılarsa firmadaki herkes dışarıda kalabilir. Kurtarma yolları: (1) platform yöneticisinin `zorunlu-kapat` ucu; (2) anahtarın bitişine 14 gün kala sahibe e-posta uyarısı. Ayrıca doğrulanmış alan adı tüm sistemde tekildir; yanlış firmada doğrulanmışsa gerçek sahibi kendi alan adını doğrulayamaz — bu durum yalnız platform yöneticisinin `DELETE /admin/alan-adlari/:alanAdi` ucuyla çözülür. Her iki müdahale de hem yönetici hem firma denetim kaydına yazılır. Bu müdahalelerin sözleşmesel dayanağının (destek/yönetim yetkisi) kullanım koşullarında ayrıca yazılması gerekip gerekmediği avukat görüşüne bağlıdır.

## Veri imhası — hesap kapatma, 30 gün ve yedekler (plan 5.8, 21.09.2026)

> **⚠ BU MADDE, 52. satırdaki ESKİ SORUYU CEVAPLIYOR.** Gizlilik bölümünde
> *"Hesap kapatmada kullanılan damgalama yöntemi (veri anında imha edilmiyor)
> silme talebi karşısında yeterli mi? Metinde imha için taahhüt edilecek azami
> bir süre yazılmalı mı?"* diye sorulmuştu. Emre kararıyla (K1/K3, 21.09) artık
> **azami süre vardır: 30 gün.** Süre dolunca imha kendiliğinden çalışır;
> "ayrıca talep etme" adımı kaldırıldı. Avukattan istenen, bu sürenin
> onayıdır.

**Metne giren yenilikler (taslak, avukat onayı bekliyor):**
- **Hesap kapatmada 30 gün saklama.** Kapatma anında kullanıcı kaydına bir *imha tarihi* yazılır (kapatma + 30 gün) ve imha kararı **yalnız bu tarihten** okunur. Bu süre içinde kişi aynı e-posta ve parolasıyla giriş yapıp bir paket seçerek hesabını kaldığı yerden açabilir; 30 günün sonunda teklifleri, kütüphanesi ve yüklediği belgeler kalıcı olarak silinir. Kapatma e-postası süreyi **gün olarak** ("30 gün sonra" değil, takvim tarihi) yazar.
- **Firma kapanınca üyeler (K2).** Firmanın son sahibi hesabını kapatırsa firma da kapanır ve üyelerin erişimi durur; **verileri silinmez**, hepsinin imha tarihi aynıdır. Sahip 30 gün içinde paket alıp geri açarsa ekip kendiliğinden geri gelir. Durdurulan üyenin **veri indirme hakkı açık kalır**.
- **Yedeklerden çıkma süresi (K5).** Gizlilik metninin saklama bölümüne tek cümle giriyor: *"silinen veriler yedeklerden en geç 30 gün içinde çıkar."* Ölçülen durum: planlı dökümler 14 gün saklanıyor, dağıtım öncesi dökümler bugüne kadar **hiç silinmiyordu** ve bu turda 30 güne bağlandı. Yani 30 gün, yedek ortamdaki **tavan** süredir.
- **Deneme hakkı kaydı hesap kapatmada da SİLİNMİYOR** ve metne adıyla istisna olarak giriyor (aşağıda ayrı not).

**Ekranda değişen metin (Profil → "Hesabımı kapat"):**
Eski cümle (*"Teklifleriniz ve kütüphaneniz sistemde kalmaya devam eder; tamamen imha edilmesini istiyorsanız bunu ayrıca iletmeniz gerekir. Aynı e-posta adresiyle yeniden kayıt olabilirsiniz."*) **kaldırıldı** — üç iddiası da yanlış olmuştu. Yeni metin:

> Hesabınız kapatılır, oturumunuz sonlandırılır ve varsa aboneliğiniz iptal edilir. Geri dönebilmeniz için verilerinizi 30 gün saklıyoruz: bu sürede aynı e-posta ve parolanızla giriş yapıp bir paket seçerek hesabınızı kaldığınız yerden açabilirsiniz. 30 günün sonunda teklifleriniz, kütüphaneniz ve yüklediğiniz belgeler kalıcı olarak silinir. Fatura ve ödeme kayıtları yasal süre boyunca saklanır.

Kapatan kişi firmanın son sahibiyse ve firmada başka kişiler varsa **ek bir uyarı** çıkar (*"Firmanızda N üye var. Hesabınızı kapatırsanız firmanız kapanır ve onların da erişimi durur…"*); firmada başka sahip varsa *"Hazırladığınız teklifler firmanızda kalır; kişisel bilgileriniz 30 gün sonra silinir."* yazar.

**⚠ HUKUKİ KARAR GEREKTİREN — 30 gün "gecikmeksizin silme" ile bağdaşıyor mu:**
Hesabını kapatan kişi bir silme iradesi göstermiş sayılabilir; buna rağmen veri 30 gün daha tutuluyor. Sorular:
1. Bu 30 gün KVKK m.7 ve Silme/Yok Etme Yönetmeliği karşısında savunulabilir mi; dayanak **meşru menfaat** (kazara kapatmadan dönüş, abonelik sürekliliği) mi, yoksa kapatma ekranındaki açık bilgilendirme ve kişinin bunu görerek onaylaması mı sayılmalı?
2. İlgili kişi **"30 günü beklemeyin, şimdi silin"** derse ne yapılacak? Bugün böyle bir yol **bilerek yok** (Emre kararı K3: yönetici panelinde "beklemeden sil" düğmesi yapılmayacak). Talebin elle karşılanması gerekiyorsa metne bir başvuru cümlesi eklenmeli mi?
3. Sürenin başlangıcı **kapatma anıdır**; başvuru tarihinden itibaren 30 günlük KVKK **cevap** süresiyle karışma riski var mı? Metinde ikisinin ayrı olduğu açıkça yazılmalı mı?
4. Firma sahibinin kapatması üyelerin verisini de 30 gün bekletiyor. Üyenin kendi verisi bakımından bu süreyi **kendi iradesiyle kısaltma** hakkı olmalı mı? (Bugün durdurulan üye hesabını ayrıca kapatabiliyor ve verisini indirebiliyor.)

**⚠ İKİNCİ NOT — yedek ortam taahhüdü yeterli mi:**
Metne giren cümle yalnız **süre** veriyor ("en geç 30 gün içinde çıkar"). Yönetmelik yedek ortamdaki veri için ayrı yükümlülük öngörüyor. Soru: cümleye, **yedekten geri yükleme yapılması hâlinde silinmiş verilerin yeniden silineceği** taahhüdü de eklenmeli mi? Bugün böyle bir otomatik yeniden-silme adımı **yok**; geri yükleme elle yapılan, ender bir olaydır.

**⚠ ÜÇÜNCÜ NOT — deneme hakkı kaydı hesap kapatmada ve imhada SİLİNMİYOR (bilinçli):**
`DenemeKullanimi` tablosu, ücretsiz denemenin ikinci kez alınmasını önlemek için tutuluyor. Şemanın kendi cümlesi: *"hesap kapatma ya da ileride veri imhası bu satırı SİLMEMELİ"*; tabloda bilerek yabancı anahtar ve zincirleme silme **yok**, bu yüzden kullanıcı silinse de satır ayakta kalır. İmha işinin "silinmez" listesinde adıyla duruyor.

Satırın **imhadan sonra da** taşıdığı kişisel veri:
- hesap e-postası (normalleştirilmiş) ve iyzico formuna yazılan e-posta (normalleştirilmiş),
- **telefonun son 10 hanesi**,
- iyzico müşteri kodu, firma kimliği ve kaydın oluşma zamanı.

Sorular:
1. Hesap kapandıktan ve diğer veriler imha edildikten sonra bu **e-posta ve telefonun** saklanmaya devam etmesinin hukuki dayanağı nedir — dolandırıcılığın/kötüye kullanımın önlenmesinde **meşru menfaat** yeterli mi, yoksa ayrı bir açık rıza mı gerekir?
2. ~~**Azami saklama süresi ne olmalı?**~~ → **KAPANDI 22.09: 2 yıl** (Emre
   kararı). Süresiz saklama seçilmedi. ⚠ Karar yalnız metne yazılmadı, KOD
   da değiştirildi: yaş ekseni eklenmeden önce bu kayıt hiç silinmiyordu
   (bkz. dosyanın başındaki 22.09 bloğu). 2 yıl dolunca kayıt gider ve o
   noktada deneme hakkı yeniden doğar — bu, kabul edilen sonuçtur.
3. İlgili kişi **"bu kaydı da silin"** derse verilecek cevap ne olmalı? Silinirse kişi hesabını kapatıp aynı adresle yeniden kaydolarak yeni bir ücretsiz deneme alır — yani talebin reddi bir **hak kaybı** değil, ürünün kötüye kullanım korumasıdır. Bu reddin metinde önceden ve açıkça yazılması gerekiyor mu?
4. Telefonun **son 10 hanesinin** ve e-postanın tutulması yerine geri döndürülemez bir **özet (hash)** yeterli olur muydu? (Teknik olarak mümkün; bugün düz tutuluyor çünkü KVKK veri indirmesi bu kayıtları kişiye **okunur** biçimde döndürüyor.)

**Ayrıca silinmeyenler (metinde sayılıyor):** fatura, ödeme ve abonelik
kayıtları (yasal saklama) ile yönetici işlem kayıtları (denetim izi).
Fatura/ödeme/abonelik süresi **KAPANDI 22.09: 10 yıl**. Yönetici denetim izi
metinde "silinmez" diyor ve bu bilerek süresizdir — kendi kanıtını silen bir
imha denetlenemez (`imha-listesi.ts` `YoneticiOlayi` gerekçesi).
