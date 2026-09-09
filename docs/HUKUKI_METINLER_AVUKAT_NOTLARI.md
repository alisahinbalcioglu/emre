# Hukuki metinler — avukata sorulacaklar

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
- [YASAL SAKLAMA SURESI]

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
- ⚠ ENVANTER DÜZELTMESİ (koddan ölçüldü, yayına almadan önce KARAR gerekir): Envanter E maddesi 'GET /auth/hesabim/verilerim' ve 'POST /auth/hesabimi-kapat' uçlarının BUGÜN çalıştığını söylüyor. ÖLÇTÜM: bu iki uç kodda YOK. Tüm worktree'de (backend+frontend, .ts/.tsx) 'hesabimi-kapat', 'verilerim', 'delete-account', 'data-export' için SIFIR eşleşme. Canlı auth controller'da (backend/src/altyapi/auth/auth.controller.ts) tam 9 rota var: register, login, me, forgot-password, reset-password, change-password, verify-email, resend-verification. Kendi verisini indirme ve kendi hesabını kapatma özelliği KULLANICIYA AÇIK DEĞİL. 'deletedAt' damgasını yazan tek yer admin tarafı (src/ozellik/kutuphane/admin/admin.service.ts:332-337). Bu yüzden 10. maddeyi 'e-posta ile talep edin' şeklinde yazdım. İki seçenek: (a) metni böyle bırakın ve talebi elle işleyin, (b) önce iki ucu yazın, sonra metni 'Hesabım ekranından kapatabilirsiniz' diye güncelleyin. Gizlilik Politikası metni de aynı düzeltmeyi almalı — orada 'JSON olarak indirebilirsiniz' yazılırsa var olmayan bir hak vaat edilmiş olur.
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
- ÖLÇÜM NOTU (envanterle uyuşmayan bulgu): Kullanıcının verilerini indirme (GET /auth/hesabim/verilerim) ve hesabını kapatma (POST /auth/hesabimi-kapat) uçları bu kod tabanında BULUNAMADI — backend/src/altyapi/auth/auth.controller.ts yalnız register, login, me, profil, forgot-password, reset-password, change-password, verify-email, resend-verification uçlarını taşıyor. Bu nedenle çerez metninde bu iki ekrana atıf yapılmadı. Haklarını kullanmak isteyen kullanıcı için e-posta başvurusu yeterli mi, yoksa ekranın yapılması mı gerekir?
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
- [FATURA İLETİM YÖNTEMİ] — e-arşiv/e-fatura mı, e-posta eki mi; hangisi kullanılacaksa yazılmalı
- [İADE POLİTİKASI] — iade talebinin hangi koşullarda karşılanacağı; ayrı bir sayfa yapılacaksa bağlantısı verilmeli
- [YETKİLİ MAHKEME VE İCRA DAİRELERİ] — tüketici sayılmayan firma müşteriler için yetki şartı

**Hukuki karar gerektirenler:**
- Cayma hakkı: Abonelik ödeme onaylandığı anda kullanıma açılıyor. Bu, 'anında ifa edilen hizmet / gayrimaddi ürün' istisnası kapsamında mı? Ücretsiz deneme süresi varken 14 günlük süre ne zaman işlemeye başlar — deneme başlangıcı mı, ilk tahsilat mı?
- Müşteriler mühendislik ve taahhüt firmaları; hizmet ticari/mesleki amaçla alınıyor. Bu alıcılar TKHK anlamında 'tüketici' sayılır mı? Sayılmıyorsa mesafeli satış ön bilgilendirmesi zorunlu mu, yoksa ticari hizmet sözleşmesi mi düzenlenmeli?
- Ön bilgilendirmenin 'kalıcı veri saklayıcısı' ile iletilmesi ve satın alma öncesi ayrı bir onay kutusuyla teyit alınması zorunlu mu? Bugün satın alma akışında onay kutusu ve onay kaydı YOK — eklenmesi gerekiyorsa hangi metinle ve nereye?
- İptal hâlinde kalan günler için kısmi iade yapılmaması hukuken savunulabilir mi? Deneme süresi bittikten hemen sonra iptal eden müşteride farklı bir sonuç doğar mı?
- Fiyat vitrinde ABD doları referansıyla gösterilip tahsilat TL yapılıyor. Döviz cinsinden fiyat gösterimine ilişkin kısıtlar (32 sayılı Karar ve ilgili tebliğler) açısından bu gösterim sakıncalı mı?
- Aylık otomatik yenileme öncesinde müşteriye ayrıca bildirim yapma yükümlülüğü var mı? Deneme süresi sonunda ücretli aboneliğe geçişte ek bildirim gerekiyor mu?
- Ödeme alınamadığında uygulanan kademeler (10. günde salt okunur, 30. günde askıya alma) sözleşmeye bu şekilde yazılabilir mi? Hizmet kesintisi öncesi asgari bildirim süresi gerekiyor mu?
- Fatura düzenleme ve iletme yükümlülüğü: e-arşiv fatura zorunlu mu, müşteriye hangi yolla ve hangi süre içinde iletilmeli?
- Hesap kapatıldığında verilerin anında imha edilmemesi (yedekler ve mevzuat gereği saklama) sözleşmede nasıl ifade edilmeli — KVKK ile mesafeli satış metni arasında çelişki doğuruyor mu?
- Yüklenen dosya içeriğinin yapay zekâ sağlayıcılarına (yurt dışına) gönderilmesi, hizmetin 'niteliği' olarak bu ön bilgilendirme formunda mı, yoksa yalnızca aydınlatma metninde mi yer almalı? Ayrıca açık rıza gerekiyor mu?
