/**
 * HUKUKİ METİNLER — dört sayfanın TEK KAYNAĞI (FAZ 5.2/5.4/5.6).
 *
 * ⚠ BU DOSYA ELLE YAZILMADI. Metinler, uygulamanın KODUNDAN ölçülen
 * gerçek veri akışına göre üretildi ve ayrı bir denetim turunda
 * "envanterde olmayan bir şey iddia ediliyor mu / envanterde olan bir şey
 * gizleniyor mu" diye sınandı. Ölçüme dayanan başlıca maddeler:
 *   · Yüklenen Excel/PDF içeriğinin bir kısmı Anthropic (ABD) servisine
 *     gidiyor — metnin en önemli cümlesi, gizlenmesi kabul edilemezdi.
 *   · Uygulamada HTTP çerezi ve üçüncü taraf izleyici YOK; fontlar
 *     self-host. Bu yüzden "çerez politikası" metni kopyalanmadı,
 *     tarayıcı DEPOLAMASI anlatıldı (kopyalansaydı yalan olurdu).
 *   · Hesap kapatma veriyi ANINDA İMHA ETMİYOR — metin "sildik" demiyor.
 *   · Ödeme adımında iyzico kendi betiklerini enjekte ediyor; adıyla anıldı.
 *
 * ⚠ METİN DEĞİŞİRSE `HUKUKI_METIN_SURUMU` da değişmeli ve backend
 * (`altyapi/auth/hukuki-surum.ts`) ile AYNI kalmalı — kayıt sırasında
 * kullanıcının onayladığı sürüm o sabitten yazılıyor. İkisinin eşitliği
 * `npm run test:faz5` kapısında ÖLÇÜLÜYOR.
 */

/** ⚠ Backend `altyapi/auth/hukuki-surum.ts` ile AYNI olmak ZORUNDA. */
export const HUKUKI_METIN_SURUMU = '2026-09-09';

/**
 * Metinler avukat incelemesinden GEÇMEDİ. `taslak` olduğu sürece her
 * hukuki sayfanın üstünde uyarı şeridi görünür. İnceleme bitince bu
 * sabit 'onayli' yapılır ve şerit DÖRT sayfadan birden kalkar —
 * sayfaları tek tek düzenlemek gerekmez.
 */
export const HUKUKI_METIN_DURUMU: 'taslak' | 'onayli' = 'taslak';

/**
 * SATICI KİMLİĞİ — henüz doldurulmadı.
 *
 * ⚠ `dolduruldu` false olduğu sürece altbilgi bu bilgileri GÖSTERMEZ.
 * "[FİRMA UNVANI]" yazan bir altbilgi, boş bırakmaktan daha kötüdür:
 * kurumsal alıcıya özensizlik olarak görünür. Değerler girildiğinde
 * `dolduruldu` true yapılır.
 */
export const SATICI = {
  dolduruldu: false,
  gorunenAd: 'MetaPriceX',
  unvan: '[FİRMA UNVANI]',
  adres: '[ADRES]',
  mersis: '[MERSİS NO]',
  vergiDairesi: '[VERGİ DAİRESİ]',
  vergiNo: '[VERGİ NO]',
  eposta: '[BAŞVURU E-POSTA ADRESİ]',
  telefon: '[TELEFON]',
} as const;

export interface HukukiBolum {
  baslik: string;
  paragraflar: string[];
  madde?: string[];
}

export interface HukukiMetin {
  yol: string;
  kisaAd: string;
  baslik: string;
  girisNotu: string;
  bolumler: HukukiBolum[];
}

export const GIZLILIK: HukukiMetin = {
  yol: "/gizlilik",
  kisaAd: "Gizlilik ve KVKK",
  baslik: "Gizlilik Politikası ve KVKK Aydınlatma Metni",
  girisNotu: "MetaPriceX'i kullanırken hangi verilerinizi işlediğimizi, kimlerle paylaştığımızı ve ne kadar süre sakladığımızı bu sayfada anlatıyoruz. En önemli maddeyi baştan söylüyoruz: teklif hazırlamak için yüklediğiniz Excel/PDF dosyalarının içeriğinin bir kısmı, yapay zekâ destekli ayıklama ve çeviri adımlarında yurt dışındaki bir yapay zekâ sağlayıcısına gönderilir.",
  bolumler: [
    {
      baslik: "Veri sorumlusu kim?",
      paragraflar: [
        "MetaPriceX platformunu işleten ve bu metinde anlatılan kişisel verileri işleyen veri sorumlusu aşağıdaki şirkettir. Bu metin hem 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun (KVKK) 10. maddesi uyarınca aydınlatma yükümlülüğümüzü karşılar, hem de platformun gizlilik politikasıdır.",
        "Metni bilerek kısa ve okunabilir tuttuk. Okunmayan uzun bir metin, kimseyi korumaz.",
      ],
      madde: [
        "Unvan: [FIRMA UNVANI]",
        "Adres: [ADRES]",
        "MERSİS No: [MERSIS NO]",
        "Vergi dairesi / numarası: [VERGI DAIRESI VE VERGI NO]",
        "İletişim: [BASVURU E-POSTA ADRESI] · [TELEFON]",
      ],
    },
    {
      baslik: "Hangi verilerinizi işliyoruz?",
      paragraflar: [
        "MetaPriceX, mekanik ve elektrik tesisat işleri için metraj ve teklif hazırlayan firmalara yöneliktir. Her kayıt kendi firmasını açar; bugün ekip daveti gibi bir akış yoktur, bir hesap bir firmaya karşılık gelir.",
        "Platformu kullanırken aşağıdaki veriler oluşur ve saklanır. Parolanızı düz metin olarak saklamıyoruz; yalnızca geri döndürülemeyen kriptografik özeti tutulur. Parola sıfırlama ve e-posta doğrulama bağlantılarının kendisi de veritabanında düz olarak değil, özet olarak durur.",
      ],
      madde: [
        "Hesap bilgileri: e-posta, parola özeti, ad, soyad, telefon, rol, paket, kayıt tarihi, e-posta doğrulama durumu, parola değişim ve hesap kapatma damgaları, onay damgaları",
        "Firma ve fatura bilgileri: firma adı, resmî unvan, yetkili ve fatura e-postası, vergi numarası, vergi dairesi, şahıs şirketiyseniz T.C. kimlik numarası, fatura adresi, il, ilçe, telefon, firma logosu",
        "Teklif ve proje verisi: müşteri adı, proje adı, hazırlayan kişi, geçerlilik bilgisi, teklifin kendisi (keşif/metraj satırları ve kalem fiyatları) ve yüklediğiniz orijinal .xlsx dosyasının kendisi",
        "DWG dosyaları: yüklediğiniz çizim dosyaları ve bunların firma sahipliği",
        "Kullanım ve ödeme kayıtları: yapay zekâ kullanım kaydı (hangi kullanıcı ve firma, hangi sağlayıcı, kaç jeton, ne maliyet), abonelik, fatura ve havale ödeme kayıtları",
        "Yönetici işlem kayıtları: bir yöneticinin hesabınız üzerinde yaptığı işlemler, yöneticinin ve hedef kullanıcının e-postasıyla birlikte kaydedilir",
      ],
    },
    {
      baslik: "Yüklediğiniz dosyaların içeriği yapay zekâ sağlayıcısına gönderilir",
      paragraflar: [
        "Bu, metnin en önemli maddesidir ve saklamıyoruz: teklif hazırlamak için yüklediğiniz Excel veya PDF dosyalarının içeriğinin bir kısmı — malzeme adları ve satır metinleri — ayıklama, eşleştirme ve çeviri işlemleri için Anthropic'in Claude servisine gönderilir. Anthropic'in sunucuları Amerika Birleşik Devletleri'ndedir. Bu bir yurt dışına aktarımdır.",
        "Platform yöneticisinin hangi sağlayıcının anahtarını tanımladığına bağlı olarak aynı içerik Google (Gemini) veya OpenRouter üzerinden de işlenebilir. Veri sınıfı aynıdır.",
        "Gönderilen bu içerik çoğunlukla kişisel veri değil, sizin veya müşterinizin projesine ait ticari veridir: malzeme listeleri, metraj satırları, kalem tanımları. Kişisel veri olmaması, gizli olmadığı anlamına gelmez. Kendi müşterinize karşı sorumluluğunuz olduğu için bu aktarımı açıkça bildirmeyi gerekli görüyoruz.",
        "Bu aktarım yalnızca yapay zekâ destekli ayıklama, eşleştirme veya çeviri adımını çalıştırdığınızda gerçekleşir. Her çağrıda hangi kullanıcı ve firma adına ne kadar kullanım yapıldığı tarafımızca kaydedilir; bu kayıt maliyet takibi ve kötüye kullanımın engellenmesi içindir.",
      ],
    },
    {
      baslik: "Verilerinizi hangi amaçla ve hangi hukuki sebeple işliyoruz?",
      paragraflar: [
        "KVKK'nın 5. maddesi, kişisel verinin ancak sayılı sebeplerden birine dayanarak işlenebileceğini söyler. Aşağıda her amacın karşısına dayandığımız sebebi yazdık.",
        "Bugün pazarlama amaçlı e-posta göndermiyoruz. Gönderdiğimiz e-postalar yalnızca parola sıfırlama, e-posta doğrulama ve ödeme/abonelik bildirimlerinden ibarettir. İleride tanıtım veya bülten göndermek istersek bunun için ayrıca açık rızanızı isteriz.",
      ],
      madde: [
        "Hesap açma, giriş, oturum yönetimi — sözleşmenin kurulması ve ifası için zorunlu olması",
        "Teklif hazırlama, DWG ve Excel dosyalarının işlenmesi, kütüphane ve fiyat listelerinin tutulması — sözleşmenin ifası için zorunlu olması",
        "Yapay zekâ destekli ayıklama, eşleştirme ve çeviri — talep ettiğiniz hizmetin ifası; bu adımı siz başlatırsınız",
        "Abonelik, ödeme ve faturalandırma — sözleşmenin ifası ve vergi mevzuatından doğan hukuki yükümlülüğümüz",
        "Güvenlik kayıtları, hatalı giriş denemelerinin sınırlanması, kötüye kullanımın önlenmesi — meşru menfaatimiz",
        "Yönetici işlemlerinin denetim kaydına yazılması — meşru menfaatimiz ve hesap verebilirlik",
        "Açık rıza gerektiren bir işleme yapmamız gerekirse, bunu ayrıca ve açıkça sorarız",
      ],
    },
    {
      baslik: "Kimlerle paylaşıyoruz ve yurt dışına çıkıyor mu?",
      paragraflar: [
        "Verilerinizi satmıyoruz, reklam veya pazarlama amacıyla üçüncü taraflara aktarmıyoruz. Aşağıdaki aktarımların tamamı hizmetin çalışması için zorunludur. Yetkili bir mahkeme veya idari makam mevzuata uygun bir talepte bulunursa, o talep çerçevesinde paylaşım yapılabilir.",
        "Platformun tüm veritabanı ve dosyaları Almanya'daki (Falkenstein) sunucularda barındırılır. Bu da KVKK açısından yurt dışına aktarım anlamına gelir; Almanya Avrupa Birliği üyesidir. Yapay zekâ işlemlerinin bir kısmı ise Amerika Birleşik Devletleri'ne gider.",
      ],
      madde: [
        "Anthropic (Claude) — Amerika Birleşik Devletleri. Yüklediğiniz dosya içeriğinin bir kısmı (malzeme adları, satır metinleri) yapay zekâ işlemleri için gönderilir.",
        "Google (Gemini) ve OpenRouter — alternatif yapay zekâ sağlayıcıları. Platform yöneticisinin anahtar tanımlamasına bağlı olarak devreye girer; aynı veri sınıfı gönderilir.",
        "iyzico — ödeme altyapısı, Türkiye'de yerleşiktir. Ad, soyad, e-posta, telefon, adres, şehir ve kimlik numarası aktarılır.",
        "Brevo — e-posta gönderimi, Fransa/Avrupa Birliği. Alıcı e-posta adresiniz ve gönderilen iletinin içeriği aktarılır.",
        "Hetzner Online GmbH — sunucu barındırma, Almanya. Veritabanı ve dosyaların tamamı burada tutulur.",
        "TCMB ve open.er-api.com — döviz kuru bilgisi alınır. Bu servislere hiçbir kişisel veri gönderilmez.",
      ],
    },
    {
      baslik: "Çerez kullanıyor muyuz?",
      paragraflar: [
        "Hayır. Platform hiçbir yerde çerez yazmıyor veya okumuyor. Üçüncü taraf analitik, ölçümleme veya izleme aracı (analytics, piksel, ısı haritası vb.) kullanmıyoruz. Yazı tipleri kendi sunucumuzdan sunulur; tarayıcınız yazı tipi almak için Google'a istek göndermez.",
        "Bu yüzden size \"çerezleri kabul et / reddet\" penceresi göstermiyoruz. Göstermek, olmayan bir şey için onay almak anlamına gelirdi ve yanıltıcı olurdu.",
        "Buna karşılık, platformun çalışabilmesi için tarayıcınızın kendi depolama alanında (localStorage ve sessionStorage) bazı veriler tutulur: oturum anahtarınız, hesabınızın kısa özeti, açtığınız her DWG dosyası için ayrı bir çalışma kaydı ve yarım kalan teklif taslağınız. DWG çalışma kayıtları proje verisi içerir ve dosya açtıkça birikir. Bu veriler cihazınızda durur; çıkış yaparak ve tarayıcınızın site verilerini temizleyerek silebilirsiniz.",
        "Tek istisna ödeme adımıdır: ödeme sayfasında iyzico'nun kendi betikleri sayfaya yüklenir. Bu, ödemenin gerçekleşebilmesi için zorunludur. iyzico bu sırada kendi çerezlerini veya izlerini bırakabilir; bu kısım iyzico'nun kendi gizlilik politikasına tabidir.",
      ],
    },
    {
      baslik: "Verileri ne kadar süre saklıyoruz?",
      paragraflar: [
        "Hesabınız açık olduğu sürece hesabınıza, firmanıza ve tekliflerinize ait veriler saklanır. Bunun dışındaki süreler aşağıdadır.",
      ],
      madde: [
        "Veritabanı yedekleri: sunucuda 14 gün tutulur. Sunucu dışındaki kopya şifrelenmiş olarak saklanır.",
        "Parola sıfırlama bağlantısı: 1 saat. E-posta doğrulama bağlantısı: 24 saat. Oturumunuz (giriş anahtarı): 7 gün.",
        "DWG çizim geometrisi, işleme servisinin önbelleğinde 24 saat boyunca kalır.",
        "Fatura, ödeme ve abonelik kayıtları: vergi ve ticaret mevzuatının öngördüğü süre boyunca — [YASAL SAKLAMA SURESI].",
        "Yönetici işlem kayıtları (denetim izi): silinmez. Bu kayıtlar, bir hesap kapatılsa bile o hesap üzerinde kimin ne yaptığının izlenebilmesi için tutulur.",
      ],
    },
    {
      baslik: "Hesabınızı kapattığınızda ne oluyor?",
      paragraflar: [
        "Burada dürüst olmak gerekiyor: hesap kapatma işlemi verinizi o anda imha etmez. Hesabınıza bir kapatma damgası işlenir; girişiniz kapanır, mevcut oturumunuz geçersiz olur ve platformu kullanamazsınız. Verileriniz ise veritabanında kalmaya devam eder.",
        "Ayrıca, kapatma anından önce alınmış yedeklerde verileriniz 14 gün daha bulunur; yedekler döngüsel olarak yenilendiği için bu süre sonunda o kopyalar da devre dışı kalır. Fatura kayıtları ve yönetici denetim izi ise yukarıda anlatıldığı gibi ayrıca saklanır.",
        "Verilerinizin kalıcı olarak silinmesini istiyorsanız, aşağıdaki başvuru bölümünden bunu ayrıca talep etmeniz gerekir. Talebinizi mevzuatın izin verdiği ölçüde — yani yasal saklama yükümlülüğü bulunmayan veriler bakımından — karşılarız.",
      ],
    },
    {
      baslik: "Haklarınız ve bunları nasıl kullanacağınız",
      paragraflar: [
        "KVKK'nın 11. maddesi size aşağıdaki hakları verir. Bu hakları kullanmak ücretsizdir ve ödeme durumunuzdan bağımsızdır: aboneliği sona ermiş veya ödemesi gecikmiş bir kullanıcı da bu haklarını kullanabilir.",
      ],
      madde: [
        "Kişisel verinizin işlenip işlenmediğini öğrenme ve işlenmişse buna ilişkin bilgi talep etme",
        "Verilerinizin hangi amaçla işlendiğini ve amacına uygun kullanılıp kullanılmadığını öğrenme",
        "Yurt içinde veya yurt dışında verilerinizin aktarıldığı üçüncü kişileri bilme",
        "Eksik veya yanlış işlenmiş verinizin düzeltilmesini isteme",
        "Verilerinizin silinmesini veya yok edilmesini isteme",
        "Düzeltme, silme ve yok etme işlemlerinin, verinizin aktarıldığı üçüncü kişilere bildirilmesini isteme",
        "İşlenen verilerin yalnızca otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç doğmasına itiraz etme",
        "Verilerinizin hukuka aykırı işlenmesi sebebiyle zarara uğrarsanız zararın giderilmesini talep etme",
      ],
    },
    {
      baslik: "Bu hakları üründe nasıl kullanırsınız?",
      paragraflar: [
        "Giriş yaptıktan sonra Profil sayfasından parolanızı değiştirebilirsiniz. Parolanızı değiştirdiğinizde, o ana kadar açık olan diğer oturumlarınız güvenlik gereği geçersiz hale gelir.",
        "Hesabınızdaki verilerin tamamını makine tarafından okunabilir bir JSON dosyası olarak indirebilir ve hesabınızı kapatabilirsiniz. Hesap kapatma işleminde, işlemi gerçekten sizin yaptığınızdan emin olmak için parolanızı yeniden girmeniz istenir. Hesap kapatmanın veriyi anında imha etmediğini yukarıda anlattık.",
        "Aradığınız işlemi ekranda bulamıyorsanız veya listedeki diğer haklarınızı kullanmak istiyorsanız, aşağıdaki başvuru yolunu kullanın; aynı işlemi sizin adınıza biz yaparız.",
      ],
    },
    {
      baslik: "Verilerin güvenliği",
      paragraflar: [
        "Parolanız geri döndürülemeyen bir özet fonksiyonuyla saklanır; parola sıfırlama ve e-posta doğrulama bağlantıları da veritabanında düz metin olarak değil özet olarak tutulur. Platformla tarayıcınız arasındaki trafik şifrelidir. Sunucuya parola ile giriş kapalıdır, yalnızca anahtarla erişim mümkündür ve sunucu dışına çıkan yedek kopyalar şifrelenir.",
        "Hiçbir sistem için \"tamamen güvenlidir\" veya \"hiçbir risk yoktur\" demiyoruz; böyle bir vaatte bulunmak dürüst olmazdı. Yaptığımız, bilinen saldırı yollarını kapatmak ve olay çıktığında bunu görebilecek kayıtları tutmaktır.",
        "Verilerinizin hukuka aykırı olarak başkalarının eline geçtiğini tespit edersek, KVKK'nın 12. maddesi uyarınca Kişisel Verileri Koruma Kurulu'na ve etkilenen kullanıcılara en kısa sürede bildirimde bulunuruz.",
      ],
    },
    {
      baslik: "Başvuru yolu",
      paragraflar: [
        "Haklarınızı kullanmak için talebinizi [BASVURU E-POSTA ADRESI] adresine iletebilir veya yazılı olarak [ADRES] adresine gönderebilirsiniz. Başvurunuzu, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e uygun olarak, kimliğinizi tespit etmemize yetecek bilgilerle birlikte yapmanız gerekir.",
        "Talebinizi, niteliğine göre en geç otuz gün içinde ücretsiz olarak sonuçlandırırız. İşlemin ayrıca bir maliyet gerektirmesi hâlinde Kurul'ca belirlenen tarifedeki ücret talep edilebilir.",
        "Başvurunuzun sonucundan memnun kalmazsanız veya otuz gün içinde yanıt alamazsanız, Kişisel Verileri Koruma Kurulu'na şikâyette bulunma hakkınız saklıdır.",
      ],
    },
    {
      baslik: "Bu metinde değişiklik olursa",
      paragraflar: [
        "Bu metni, platformda yaptığımız değişikliklere göre güncelleriz. Güncel sürüm her zaman bu sayfada yayımlanır.",
        "Kullandığımız bir hizmet sağlayıcısının değişmesi, yeni bir veri kategorisi işlemeye başlamamız veya verilerinizin gittiği yerlerin değişmesi gibi esaslı bir değişiklik olursa, bunu uygulama içinde veya e-posta ile ayrıca duyururuz.",
      ],
    },
  ],
};

export const KULLANIM_KOSULLARI: HukukiMetin = {
  yol: "/kullanim-kosullari",
  kisaAd: "Kullanım Koşulları",
  baslik: "Kullanım Koşulları",
  girisNotu: "Bu metin, MetaPriceX platformunu hangi kurallarla kullandığınızı anlatır. Uzun hukuk diliyle değil, gerçekten okunsun diye sade yazıldı; özellikle \"yüklediğiniz dosyalara ne oluyor\" ve \"teklifin doğruluğundan kim sorumlu\" başlıklarını atlamadan okumanızı öneririz.",
  bolumler: [
    {
      baslik: "1. Taraflar ve bu metnin kapsamı",
      paragraflar: [
        "Bu Kullanım Koşulları, bir tarafta MetaPriceX platformunu işleten [FİRMA UNVANI] (adres: [FİRMA ADRESİ], MERSİS: [MERSİS NO], vergi dairesi ve numarası: [VERGİ DAİRESİ] / [VERGİ NO]) ile diğer tarafta platforma hesap açan siz arasındadır. Metinde \"biz\" ve \"Platform\" işleticiyi, \"siz\" ve \"Kullanıcı\" hesabı açan kişiyi ve o hesabın bağlı olduğu firmayı ifade eder.",
        "Hesap açtığınızda bu koşulları okuduğunuzu ve kabul ettiğinizi varsayarız. Kabul etmiyorsanız hesap açmayın ve platformu kullanmayın.",
        "Platform kurumsal kullanıma yöneliktir: mekanik ve elektrik tesisat işi yapan mühendislik ve taahhüt firmaları için tasarlanmıştır. Platformu tüketici sıfatıyla değil, ticari faaliyetiniz kapsamında kullandığınızı kabul edersiniz.",
      ],
    },
    {
      baslik: "2. Hizmetin tanımı — ne yapar, ne yapmaz",
      paragraflar: [
        "MetaPriceX bir metraj ve teklif hazırlama platformudur. Yüklediğiniz Excel dosyalarından malzeme ve fiyat listelerini okur, DWG/DXF projelerinden boru ve ekipman metrajı çıkarır, bunları kendi malzeme kütüphanenizle eşleştirir ve düzenleyebileceğiniz bir teklif tablosu üretir.",
        "Platform bir hesaplama ve düzenleme aracıdır. Mühendislik hizmeti, keşif hizmeti, fiyat danışmanlığı ya da proje onayı vermez. Ürettiği her sonuç, sizin yüklediğiniz verilere, seçtiğiniz ayarlara ve girdiğiniz fiyatlara bağlıdır.",
        "Platformun özelliklerini geliştirmeye, değiştirmeye ve gerektiğinde kaldırmaya devam ederiz. Belirli bir özelliğin süresiz kalacağını taahhüt etmiyoruz. Paketinizin kapsamını doğrudan etkileyen bir değişiklik yaparsak bunu 11. maddedeki usulle önceden bildiririz.",
      ],
    },
    {
      baslik: "3. Hesap açma ve hesabınızın güvenliği",
      paragraflar: [
        "Hesap, e-posta adresi ve parola ile açılır. Her yeni kayıt kendi firmasını oluşturur. Şu an için bir hesaba başka kullanıcı davet etme akışı bulunmuyor; yani pratikte bir hesap bir firma demektir. Ekip arkadaşlarınızla aynı hesabı paylaşırsanız o hesapla yapılan her işlem sizin sorumluluğunuzda olur.",
        "Parolanız sizin sorumluluğunuzdadır. Kimseyle paylaşmayın, başka servislerde kullandığınız bir parolayı burada kullanmayın. Parolanızın ele geçirildiğini düşünüyorsanız hemen değiştirin: parolanızı değiştirdiğinizde diğer cihazlardaki açık oturumlar kapatılır.",
        "Oturumunuz tarayıcınızda saklanır ve 7 gün geçerlidir. Parolanızı unutursanız giriş ekranındaki \"Parolamı unuttum\" bağlantısıyla sıfırlama isteyebilirsiniz; gönderilen bağlantı 1 saat, e-posta doğrulama bağlantısı ise 24 saat geçerlidir.",
        "Ortak veya paylaşılan bir bilgisayarda çalışıyorsanız işiniz bitince çıkış yapın. Yarım kalan teklif taslaklarınız ve DWG çalışma alanınız o tarayıcıda saklanır ve siz temizlemedikçe orada birikir.",
      ],
    },
    {
      baslik: "4. Abonelik, paketler ve ödeme",
      paragraflar: [
        "Platform ücretlidir. Paketler hem seviyeye hem de çalıştığınız disipline göre farklılaşır (mekanik, elektrik veya her ikisi birlikte). Güncel paketler, kapsamları ve fiyatları uygulama içindeki Abonelik ekranında gösterilir; bu metin fiyat belirlemez, fiyatı Abonelik ekranındaki güncel liste belirler.",
        "Kredi kartıyla ödeme iyzico üzerinden alınır. Kart bilgileriniz bize ulaşmaz ve bizde saklanmaz; iyzico tarafında tutulur. Kartınızı Abonelik ekranındaki kart güncelleme adımıyla değiştirebilirsiniz — doğrulama için kartınızdan 1 TL çekilip iade edilir. Banka havalesi/EFT ile ödeme de mümkündür; bu yol elle onaylandığı için erişiminiz, ödemenin tarafımızca görülmesinin ardından açılır.",
        "Ödemeniz alınamazsa hesabınız aniden kapanmaz, kademeli bir süreç işler:",
        "Ödeme tamamlandığında kapatılan yetenekler yeniden açılır. Bu kademelerde size gönderilen bilgilendirme e-postaları, hesabınızın e-posta adresine gider — bu yüzden adresinizin güncel ve erişilebilir olması önemlidir.",
      ],
      madde: [
        "Önce hatırlatma e-postası gönderilir.",
        "Ardından yeni teklif oluşturma ve fiyatlı çıktı (Excel/teklif formatı) indirme geçici olarak kapatılır; mevcut tekliflerinizi görmeye devam edersiniz.",
        "Ödeme yine alınamazsa hesap erişimi kapatılır.",
      ],
    },
    {
      baslik: "5. Yüklediğiniz içerik: mülkiyet sizde kalır, işleme izni bize verilir",
      paragraflar: [
        "Platforma yüklediğiniz her şey size aittir: Excel fiyat listeleri, DWG/DXF projeleri, PDF kataloglar, müşteri ve proje bilgileri, hazırladığınız teklifler. Bunların mülkiyeti bize geçmez. İçeriğinizi kendi ürünümüzü pazarlamak, başkalarına satmak veya sizinle ilgisi olmayan üçüncü kişilerle paylaşmak için kullanmayız.",
        "Buna karşılık, hizmeti size sunabilmemiz için içeriğinizi işlememize izin vermiş olursunuz: saklamak, açmak, okumak, dönüştürmek, kütüphanenizle eşleştirmek, hesaplamak ve size geri göstermek.",
        "Bu iznin en önemli parçasını açıkça bilmenizi istiyoruz: yüklediğiniz Excel ve PDF dosyalarındaki malzeme adlarının ve satır metinlerinin bir kısmı, otomatik ayıklama ve çeviri işlemi için yapay zekâ sağlayıcılarına gönderilir. Bugün kullanılan sağlayıcılar Anthropic (Claude), Google (Gemini) ve OpenRouter'dır; Anthropic'in sunucuları Amerika Birleşik Devletleri'ndedir. Gönderilen bu metinler, müşterinizin projesine ait ticari bilgi niteliğinde olabilir. Bu aktarımı istemiyorsanız ilgili dosyaları platforma yüklemeyin.",
        "Yüklediğiniz içerik üzerinde gerekli hakka sahip olduğunuzu ve müşterinize ait verileri bu şekilde işletme yetkiniz bulunduğunu beyan edersiniz. Üçüncü kişilere ait gizli belgeleri, izniniz olmadan platforma yüklemeyin.",
        "Verileriniz Almanya'daki (Hetzner, Falkenstein) sunucularda barındırılır. Hangi verinin toplandığı, kimlere aktarıldığı ve ne kadar saklandığı Gizlilik Politikası'nda ayrıntılı olarak anlatılır.",
      ],
    },
    {
      baslik: "6. Fiyat ve teklif doğruluğu — son sorumluluk sizdedir",
      paragraflar: [
        "Platform metraj çıkarır, malzeme eşleştirir ve hesap yapar. Bu işlerin önemli bir kısmı otomatik tahmine dayanır: DWG'den okunan boru uzunlukları, çizim biriminin yorumlanması, çap eşleştirmesi, yapay zekânın malzeme adından çıkardığı sınıflandırma. Bunların her biri hatalı sonuç verebilir.",
        "Müşterinize sunduğunuz teklif sizin teklifinizdir. Göndermeden önce kontrol etmek sizin sorumluluğunuzdadır: metrajın doğruluğu, birim fiyatların güncelliği, iskonto ve kâr oranları, para birimi ve kur, işçilik kalemleri ve toplamların tutarlılığı.",
        "Hatalı çıkmış bir metraj, yanlış eşleşmiş bir malzeme, eksik kalmış bir kalem veya yanlış hesaplanmış bir toplam nedeniyle uğrayacağınız zarardan sorumlu değiliz. Platform bir uyarı gösterse de göstermese de son kontrol sizdedir.",
        "Döviz kurları harici kaynaklardan (TCMB ve bir kur servisi) alınır. Kurun anlık, kesintisiz ve hatasız olduğunu taahhüt edemeyiz; kur hassasiyeti olan bir teklifte kuru göndermeden önce doğrulayın.",
      ],
    },
    {
      baslik: "7. Yasak kullanımlar",
      paragraflar: [
        "Platformu kullanırken aşağıdakileri yapmamayı kabul edersiniz:",
        "Bu kuralların ihlali, 10. maddedeki fesih sebeplerini oluşturur.",
      ],
      madde: [
        "Yürürlükteki mevzuata aykırı bir amaçla kullanmak.",
        "Hesabınızı satmak, kiralamak veya erişiminizi abonelik kapsamı dışındaki firmalara kullandırmak.",
        "Platformun güvenlik önlemlerini aşmaya çalışmak, izinsiz erişim denemek, başka kullanıcıların verisine ulaşmaya çalışmak.",
        "Sistemi otomatik araçlarla aşırı yüklemek, ölçüsüz istek göndermek, servisi kullanılamaz hale getirmeye çalışmak.",
        "Platformun kaynak kodunu geri derlemek, tersine mühendislik yapmak veya rakip bir ürün geliştirmek amacıyla kopyalamak.",
        "Üzerinde hakkınız olmayan, gizlilik yükümlülüğüne tabi ya da zararlı yazılım içeren dosyalar yüklemek.",
      ],
    },
    {
      baslik: "8. Hizmet sürekliliği ve kesintiler",
      paragraflar: [
        "Platformun kesintisiz çalışacağını taahhüt etmiyoruz. Bakım, güncelleme, altyapı sağlayıcısı kaynaklı arıza, ağ sorunu, yapay zekâ veya ödeme sağlayıcısındaki kesintiler hizmeti geçici olarak durdurabilir. Planlı bakımları mümkün olduğunca önceden duyurmaya çalışırız.",
        "Veritabanı düzenli olarak yedeklenir ve yedekler bir süre saklanır; bir kopya şifreli biçimde sunucu dışında tutulur. Bu, kaybolan verinin her koşulda geri getirileceği anlamına gelmez. Sizin için kritik olan dosyaların (özellikle orijinal Excel ve DWG projelerinin) kendi kopyasını kendi sisteminizde tutun.",
        "Bu maddedeki hiçbir ifade bir hizmet seviyesi taahhüdü (SLA) oluşturmaz. Ayrı ve yazılı bir hizmet seviyesi sözleşmesi imzalanmadıkça belirli bir çalışma süresi oranı garanti edilmez.",
      ],
    },
    {
      baslik: "9. Sorumluluğun sınırı",
      paragraflar: [
        "Hizmet, mevcut haliyle ve mevcut özellikleriyle sunulur. Platformun belirli bir amaca uygun olacağı, hatasız çalışacağı veya beklentinizi tam karşılayacağı yönünde zımni bir garanti vermiyoruz.",
        "Kastımız ve ağır ihmalimiz saklı kalmak üzere; dolaylı zararlardan, kâr veya iş kaybından, sözleşme kaybından, veri kaybından ve itibar kaybından sorumlu değiliz. Kaybedilen bir ihale, yanlış verilmiş bir teklif veya gecikmiş bir çıktı nedeniyle doğan zararlar bu kapsamdadır.",
        "Her hâlükârda toplam sorumluluğumuz, zarara yol açan olaydan önceki on iki ayda bize fiilen ödediğiniz abonelik bedeli toplamını aşmaz.",
        "Bu sınırlamalar, yürürlükteki mevzuatın sorumluluğun sınırlandırılmasına izin vermediği hâllerde uygulanmaz.",
      ],
    },
    {
      baslik: "10. Sözleşmenin sona ermesi",
      paragraflar: [
        "Aboneliğinizi dilediğiniz zaman Abonelik ekranındaki iptal adımıyla sonlandırabilirsiniz. İptal ettiğinizde erişiminiz o anda kesilmez: ödemesini yaptığınız dönemin sonuna kadar devam eder ve dönem sonunda yenileme yapılmaz. Dönem ortasında yapılan iptallerde kısmi iade konusunda [İADE POLİTİKASI] uygulanır.",
        "Hesabınızın tamamen kapatılmasını istiyorsanız [İLETİŞİM E-POSTASI] adresine, hesabınızın kayıtlı e-posta adresinden talep göndermeniz gerekir. Şu an için hesabı doğrudan kapatan bir düğme uygulama içinde bulunmamaktadır; talebiniz elle işlenir.",
        "Hesap kapatıldığında ne olduğunu açıkça belirtmek isteriz: girişiniz kapanır ve platformu kullanamazsınız, ancak verileriniz aynı anda imha edilmez. Kapatma işlemi hesabınıza bir \"kapatıldı\" damgası düşer; kayıtlarınız yedeklerde ve saklama süreleri boyunca sistemde kalmaya devam eder. Fatura, ödeme ve yönetici işlem kayıtları ise ispat ve yasal saklama yükümlülükleri nedeniyle daha uzun süre tutulur. Verilerinizin silinmesine ilişkin haklarınız ve süreler Gizlilik Politikası'nda anlatılır.",
        "Biz de bu sözleşmeyi feshedebiliriz: bu koşulların ağır biçimde ihlali, ödemenin yapılmaması, hukuka aykırı kullanım ya da platformun güvenliğini tehdit eden davranış hâllerinde. Durumun niteliği elverdiği ölçüde önce uyarır ve düzeltmeniz için makul bir süre veririz.",
      ],
    },
    {
      baslik: "11. Koşullarda değişiklik",
      paragraflar: [
        "Bu koşulları zaman içinde güncelleyebiliriz. Fiyat, paket kapsamı, sorumluluk sınırları veya verilerinizin işlenme biçimi gibi esaslı değişiklikleri, yürürlüğe girmeden önce hesabınızın kayıtlı e-posta adresine bildiririz.",
        "Değişikliği kabul etmiyorsanız aboneliğinizi 10. maddedeki usulle iptal edebilirsiniz. Değişiklik yürürlüğe girdikten sonra platformu kullanmaya devam etmeniz, yeni koşulları kabul ettiğiniz anlamına gelir.",
        "Yazım hatası düzeltmesi, bölüm numaralandırması gibi anlamı değiştirmeyen düzenlemeler için ayrıca bildirim yapılmayabilir.",
      ],
    },
    {
      baslik: "12. Uygulanacak hukuk ve yetkili mahkeme",
      paragraflar: [
        "Bu sözleşmeye Türk hukuku uygulanır.",
        "Bu sözleşmeden doğan uyuşmazlıklarda [YETKİLİ MAHKEME ŞEHRİ] Mahkemeleri ve İcra Daireleri yetkilidir.",
        "Taraflar arasında ayrıca imzalanmış yazılı bir çerçeve sözleşme bulunması hâlinde, o sözleşme ile bu metin arasındaki çelişkide imzalı sözleşme hükümleri öncelikli olarak uygulanır.",
      ],
    },
    {
      baslik: "13. İletişim",
      paragraflar: [
        "Bu koşullarla ilgili sorularınız, abonelik talepleriniz ve hesap kapatma istekleriniz için: [FİRMA UNVANI], [FİRMA ADRESİ], e-posta: [İLETİŞİM E-POSTASI], telefon: [TELEFON].",
        "Yazışmalarınızı hesabınızın kayıtlı e-posta adresinden göndermenizi rica ederiz; kimlik doğrulaması bu şekilde daha hızlı yapılır.",
      ],
    },
  ],
};

export const CEREZ_POLITIKASI: HukukiMetin = {
  yol: "/cerez-politikasi",
  kisaAd: "Çerez ve Depolama",
  baslik: "Çerez ve Tarayıcı Depolaması Politikası",
  girisNotu: "MetaPriceX çerez (cookie) kullanmıyor; sitede hiçbir analitik, reklam veya davranış izleme aracı çalışmıyor. Bunun yerine uygulamanın çalışabilmesi için tarayıcınızın kendi depolama alanlarını (localStorage ve sessionStorage) kullanıyoruz; bu sayfada neyi, neden ve ne kadar süre sakladığımızı tek tek yazdık.",
  bolumler: [
    {
      baslik: "Kısaca durum",
      paragraflar: [
        "Uygulamanın hiçbir yerinde tarayıcınıza çerez yazmıyor, çerez okumuyoruz. Google Analytics, reklam pikseli, ısı haritası gibi üçüncü taraf izleme araçları da kullanmıyoruz.",
        "Buna karşılık uygulamanın çalışması için tarayıcınızda veri saklıyoruz: giriş yaptığınızı hatırlamak, yarım kalan teklifinizi kaybetmemek ve DWG çizimlerinde saatler süren etiketleme çalışmanızı korumak için. Bu kayıtlar cihazınızda kalır, kendiliğinden sunucumuza gönderilmez.",
        "Tek istisna ödeme adımıdır: kart formunu iyzico'nun kendi betikleri çizer ve iyzico kendi çerezlerini kullanabilir. Bunu aşağıda ayrı bir başlıkta anlattık.",
      ],
      madde: [
        "Çerez (cookie): yok",
        "Üçüncü taraf izleyici / analitik / reklam pikseli: yok",
        "Tarayıcı depolaması (localStorage, sessionStorage): var — aşağıda tek tek listelendi",
        "Ödeme ekranında iyzico betikleri: var (yalnız o ekranda)",
      ],
    },
    {
      baslik: "Neden \"çerez politikası\" demiyoruz da bunu anlatıyoruz",
      paragraflar: [
        "Çerez, tarayıcınızın sunucuya yaptığı hemen her istekle birlikte otomatik olarak gönderilen küçük bir kayıttır. Biz çerez kullanmadığımız için, alışılmış bir çerez politikası metnini buraya kopyalamak sizi yanıltırdı.",
        "Kullandığımız yöntemler farklıdır. localStorage tarayıcınızda siz veya biz silene kadar durur ve yalnızca uygulama kodu okuduğunda kullanılır. sessionStorage ise yalnız açık sekme yaşadığı sürece durur; sekmeyi kapattığınızda tarayıcınız onu kendiliğinden siler.",
        "Bu metnin amacı, sakladığımız her kaydı adıyla ve nedeniyle göstermektir.",
      ],
    },
    {
      baslik: "Tarayıcınızda kalıcı olarak sakladıklarımız (localStorage)",
      paragraflar: [
        "Aşağıdaki kayıtlar, siz silene kadar tarayıcınızda kalır. Kayıt adlarını da yazdık; tarayıcınızın geliştirici araçlarındaki Depolama (Storage) bölümünden bunları kendiniz görebilirsiniz.",
      ],
      madde: [
        "token — Oturum jetonunuz. Giriş yaptığınızı kanıtlar ve her istekte yetkilendirme başlığında sunucumuza gönderilir. 7 gün geçerlidir; süresi dolunca yeniden giriş yapmanız gerekir.",
        "user — Ekranda adınızı, rolünüzü ve paketinizi gösterebilmek için tutulan kullanıcı özeti (ad, e-posta, rol, paket bilgisi).",
        "metaprice_dwg_session — En son yüklediğiniz DWG dosyasının kimliği, dosya adı, içerik özeti ve seçtiğiniz çizim birimi. Sayfayı yenilediğinizde kaldığınız yerden devam edebilmenizi sağlar.",
        "metaprice_dwg_ws_… — Her DWG dosyası için ayrı bir kayıt: o çizimdeki katman seçimleriniz, çap etiketleriniz, hesaplanan metrajlar ve onaylarınız. Bu, projenize ait iş verisidir.",
        "metaprice_dwg_buckets — Etiketleme sırasında tanımladığınız çap kalemleri (etiketleme paletiniz).",
      ],
    },
    {
      baslik: "Sekmeyi kapatınca silinenler (sessionStorage)",
      paragraflar: [
        "Bu kayıtlar bir ekrandan diğerine iş taşımak ve yenileme anında emeğinizi korumak içindir. Sekmeyi kapattığınızda tarayıcınız bunları kendiliğinden siler; ayrıca bir işlem yapmanız gerekmez.",
      ],
      madde: [
        "metaprice_quote_draft — Henüz kaydetmediğiniz teklif taslağı.",
        "metaprice_upload_result — Yüklediğiniz Excel dosyasının işlenmiş sonucu; panodan teklif ekranına taşınırken kullanılır.",
        "metaprice_dwg_metraj — DWG çalışma alanından teklife aktardığınız metraj satırları.",
        "metaprice_quote_from_dwg — Teklif ekranına DWG üzerinden gelindiğini belirten tek karakterlik bir işaret.",
      ],
    },
    {
      baslik: "Önemli: DWG çalışma verisi tarayıcınızda birikir",
      paragraflar: [
        "Yüklediğiniz her DWG dosyası için tarayıcınızda ayrı bir çalışma kaydı oluşur ve bu kayıtlar kendiliğinden silinmez. Uygulamayı uzun süre kullandığınızda tarayıcınızda çok sayıda proje kaydı birikebilir.",
        "Bunu bilerek böyle yaptık: katman etiketleme çalışması saatler sürebiliyor ve bu çalışmanın sunucu tarafında bir kopyası tutulmuyor. Kayıt silinirse etiketleme emeğiniz geri getirilemez.",
        "Tek bir çizimin kaydını silmek isterseniz DWG çalışma ekranındaki \"Bu dosyayı sıfırla\" düğmesini kullanın; bu düğme yalnız o dosyaya ait etiket ve onayları siler, diğer projelerinize dokunmaz. Tümünü silmek isterseniz tarayıcı ayarlarından bu siteye ait verileri temizleyebilirsiniz — bu işlem tüm çizimlerdeki çalışmanızı geri alınamaz biçimde siler ve sizi uygulamadan çıkarır.",
        "Ortak kullanılan bir bilgisayarda çalışıyorsanız şunu bilin: \"Çıkış Yap\" yalnızca oturum jetonunuzu ve kullanıcı özetinizi siler; DWG çalışma kayıtları tarayıcıda kalmaya devam eder. Proje verisinin o cihazda kalmasını istemiyorsanız site verilerini de temizlemeniz gerekir.",
      ],
    },
    {
      baslik: "Neden onayınızı istemiyoruz",
      paragraflar: [
        "Tarayıcınızda sakladığımız kayıtların tamamı hizmetin çalışması için zorunludur: giriş yapmış kalmanız, sayfa yenilendiğinde işinizi kaybetmemeniz ve çizim üzerindeki çalışmanızın korunması. Reklam, profilleme, davranış takibi veya ziyaretçi ölçümü amacıyla hiçbir kayıt tutmuyoruz.",
        "Bu nedenle \"kabul et / reddet\" seçenekli bir çerez bandı göstermiyoruz. Böyle bir bandı göstermek gerçek bir seçim sunmazdı: bu kayıtları reddetmeniz halinde uygulamaya giriş yapmanız mümkün olmazdı. Bunun yerine ne sakladığımızı bu sayfada açıkça yazmayı tercih ettik.",
        "Kararı yine de siz verirsiniz: tarayıcınızın ayarlarından bu site için depolamayı engelleyebilir veya kayıtları istediğiniz an silebilirsiniz. Depolama kapalıyken oturumunuz açık kalmaz ve yarım kalan işiniz korunmaz.",
      ],
    },
    {
      baslik: "Ödeme sırasında: iyzico",
      paragraflar: [
        "Abonelik ödemesinde kart formunu biz çizmiyoruz. Ödeme ekranında iyzico'nun barındırılan formu kullanılır ve bu formu çizebilmesi için iyzico'ya ait betikler o sayfaya yüklenip çalıştırılır.",
        "Bu betikler iyzico tarafından yönetilir. iyzico kendi çerezlerini veya tarayıcı depolamasını kullanabilir ve dolandırıcılık kontrolü amacıyla cihazınıza ilişkin bilgi toplayabilir. Bu kayıtlar üzerinde bizim denetimimiz yoktur; iyzico'nun kendi gizlilik ve çerez politikası geçerlidir.",
        "Kart numaranız hiçbir aşamada sunucularımıza gelmez ve tarafımızca saklanmaz. iyzico betikleri yalnızca ödeme ekranında yüklenir; uygulamanın diğer hiçbir sayfasında çalışmaz.",
      ],
    },
    {
      baslik: "Yazı tipleri ve dışarıya giden istekler",
      paragraflar: [
        "Sitede kullanılan yazı tipi, uygulama derlenirken indirilip kendi sunucumuzdan sunulur. Yani sayfayı açtığınızda tarayıcınız Google'a yazı tipi isteği göndermez.",
        "Döviz kuru gibi dış servislerden aldığımız bilgiler sunucumuz tarafından sorgulanır; tarayıcınızdan bu servislere doğrudan istek gitmez ve bu sorgularda kişisel veriniz yer almaz.",
        "Ödeme adımı dışında sayfalarımızda üçüncü taraf betiği, reklam etiketi veya izleme pikseli bulunmaz.",
      ],
    },
    {
      baslik: "Sakladıklarınızı nasıl görür ve silersiniz",
      paragraflar: [
        "Bu kayıtlar sizin cihazınızda olduğu için kontrolü de sizdedir. Aşağıdaki yolların tamamı bugün çalışır durumdadır.",
      ],
      madde: [
        "\"Çıkış Yap\" (sağ üstteki menü veya Profil sayfası) — oturum jetonunuzu ve kullanıcı özetinizi siler.",
        "\"Bu dosyayı sıfırla\" (DWG çalışma ekranı) — yalnız o çizime ait etiketleri, hesapları ve onayları siler. Geri alınamaz, bu yüzden onay sorulur.",
        "Tarayıcı ayarları > site verilerini temizle — bu siteye ait tüm localStorage ve sessionStorage kayıtlarını siler.",
        "Gizli/özel pencerede çalışmak — pencereyi kapattığınızda tüm kayıtlar silinir.",
        "Tarayıcınızın geliştirici araçlarındaki Depolama (Storage) bölümü — hangi kaydın tutulduğunu adıyla ve içeriğiyle kendiniz görebilirsiniz.",
      ],
    },
    {
      baslik: "Bu metin değişirse",
      paragraflar: [
        "Uygulamada tarayıcınızda sakladığımız bir kayıt eklenir, çıkarılır veya amacı değişirse bu sayfayı güncelleriz. Çerez kullanmaya veya üçüncü taraf izleme aracı eklemeye karar verirsek, bunu uygulamayı kullanmaya devam etmeden önce göreceğiniz biçimde ayrıca duyururuz.",
        "Kişisel verilerinizin ne amaçla işlendiği, kimlerle paylaşıldığı ve haklarınız Aydınlatma Metni'nde ayrıntılı olarak anlatılmaktadır. Bu sayfa yalnızca tarayıcınızdaki kayıtları konu alır.",
      ],
    },
    {
      baslik: "İletişim",
      paragraflar: [
        "Bu sayfadaki kayıtlarla ilgili sorularınız için bize yazabilirsiniz.",
        "Veri sorumlusu: [FİRMA UNVANI]",
        "Adres: [FİRMA ADRESİ]",
        "E-posta: [İLETİŞİM E-POSTA ADRESİ]",
      ],
    },
  ],
};

export const MESAFELI_SATIS: HukukiMetin = {
  yol: "/mesafeli-satis",
  kisaAd: "Mesafeli Satış",
  baslik: "Mesafeli Satış Sözleşmesi Ön Bilgilendirme Formu",
  girisNotu: "MetaPriceX paketleri internet üzerinden, kredi/banka kartıyla ve aylık abonelik olarak satılır. Bu form, satın almadan önce bilmeniz gereken her şeyi — kim satıyor, ne alıyorsunuz, ne kadar ödüyorsunuz, nasıl iptal ediyorsunuz — sade bir dille anlatır.",
  bolumler: [
    {
      baslik: "1. Bu form ve taraflar",
      paragraflar: [
        "Bu form, MetaPriceX üzerinden satın alacağınız abonelik paketi hakkında sizi satın alma öncesinde bilgilendirmek için hazırlanmıştır. Hizmeti sunan taraf aşağıda bilgileri verilen [FİRMA UNVANI]; alıcı taraf ise hesabı açan kullanıcı ve bu kullanıcının kayıt sırasında oluşturduğu firmadır.",
        "MetaPriceX'te her kayıt kendi firmasını açar; bir hesap bir firmaya bağlıdır. Paketi satın alan kullanıcı, aynı zamanda o firma adına abonelik sözleşmesini kuran kişidir.",
        "Bu formu satın almadan önce okumanızı öneririz. Sözleşmenin dili Türkçedir. Formun bir kopyasını tarayıcınızdan yazdırabilir veya kaydedebilirsiniz.",
      ],
    },
    {
      baslik: "2. Satıcı (hizmet sağlayıcı) bilgileri",
      paragraflar: [
        "Aşağıdaki bilgiler, hizmeti sunan ve faturayı düzenleyen tarafa aittir. Sorularınız, talepleriniz ve şikayetleriniz için bu adresleri kullanabilirsiniz.",
      ],
      madde: [
        "Unvan: [FİRMA UNVANI]",
        "Adres: [FİRMA ADRESİ]",
        "MERSİS numarası: [MERSİS NO]",
        "Vergi dairesi ve numarası: [VERGİ DAİRESİ] / [VERGİ NO]",
        "Telefon: [TELEFON]",
        "E-posta: [İLETİŞİM E-POSTASI]",
        "Web sitesi: metapricex.com",
      ],
    },
    {
      baslik: "3. Sözleşmenin konusu ve hizmetin nitelikleri",
      paragraflar: [
        "MetaPriceX, mekanik ve elektrik tesisat projelerinde metraj çıkarma ve teklif hazırlama işini kolaylaştıran, internet tarayıcısı üzerinden kullanılan bir yazılım hizmetidir. Fiziksel bir ürün teslim edilmez; size bir kutu, CD veya kurulum dosyası gönderilmez. Aldığınız şey, abonelik süresince yazılımı kullanma hakkıdır.",
        "Hangi özelliklere erişeceğiniz seçtiğiniz pakete bağlıdır. Paketler disipline (mekanik, elektrik ya da ikisi birden) ve seviyeye göre ayrılır: temel seviyede malzeme kütüphanesi ve teklif hazırlama; Pro seviyede bunlara ek olarak işçilik ve DWG üzerinden metraj çıkarma bulunur. Her paketin kapsamı, kullanıcı hakkı ve DWG'nin dahil olup olmadığı satın alma sayfasındaki paket kartında yazar.",
        "Hizmetin kullanılabilmesi için internet bağlantısı ve güncel bir web tarayıcısı gerekir. Yazılımı geliştirmeye ve iyileştirmeye devam ederiz; bu nedenle ekranlar ve özellikler zaman içinde değişebilir. Paketinizin kapsamını daraltan esaslı bir değişiklik yapmamız gerekirse sizi önceden bilgilendiririz.",
      ],
    },
    {
      baslik: "4. Fiyat, KDV ve para birimi",
      paragraflar: [
        "Güncel paket fiyatları, uygulamadaki Abonelik sayfasında listelenir. Fiyat vitrinde ABD doları karşılığıyla da gösterilir; ancak sözleşmenin ve tahsilatın para birimi Türk lirasıdır. Kartınızdan çekilen ve faturaya yazılan tutar, paket kartında gösterilen TL tutarıdır.",
        "Gösterilen TL tutarı KDV dahildir; ayrıca bir vergi eklenmez. Faturada matrah ve KDV tutarı yürürlükteki oran üzerinden ayrıştırılarak gösterilir.",
        "Aboneliğiniz devam ettiği sürece aylık tutarınız sabit kalır. Fiyatları güncellediğimizde yeni fiyat yeni bir paket sürümü olarak yayımlanır ve yalnızca yeni abonelikleri etkiler; mevcut aboneliğinizin tutarı, siz paket değiştirmediğiniz sürece kendiliğinden artmaz.",
      ],
    },
    {
      baslik: "5. Ödeme şekli ve kart bilgileriniz",
      paragraflar: [
        "Ödeme, ödeme kuruluşu iyzico üzerinden kredi veya banka kartıyla yapılır. Abonelik sayfasında \"Bu paketi seç\" düğmesine bastığınızda önce fatura bilgilerinizi girersiniz, ardından iyzico'nun kart formu sayfaya yüklenir. Bu adımda iyzico'nun kendi betikleri tarayıcınıza yüklenir; ödemenin yapılabilmesi için bu zorunludur.",
        "Kart numaranız, son kullanma tarihiniz ve güvenlik kodunuz doğrudan iyzico'ya iletilir. Bu bilgiler bize ulaşmaz ve sunucularımızda saklanmaz. iyzico'ya ödemenin gerçekleşmesi için adınız, soyadınız, e-posta adresiniz, telefonunuz, kimlik numaranız ve fatura adresiniz iletilir.",
        "Kartınızı değiştirmeniz gerekirse, size gönderilen kart güncelleme bağlantısını kullanabilir veya [İLETİŞİM E-POSTASI] adresinden bize yazabilirsiniz. Havale/EFT ile ödeme, uygulama içinden kendi başınıza yapabileceğiniz bir yol değildir; bu şekilde ödemek isterseniz önce bizimle iletişime geçmeniz gerekir.",
      ],
    },
    {
      baslik: "6. Ücretsiz deneme süresi",
      paragraflar: [
        "Bir pakette ücretsiz deneme süresi varsa, bu süre paket kartında \"… gün ücretsiz deneme\" şeklinde açıkça yazar. Deneme süresi boyunca paket özelliklerini kullanırsınız ve kartınızdan tahsilat yapılmaz.",
        "Deneme süresi dolduğunda abonelik kendiliğinden ücretli döneme geçer ve ilk tahsilat yapılır. Ücret ödemek istemiyorsanız, deneme süresi dolmadan aboneliğinizi iptal etmeniz yeterlidir (bkz. 9. bölüm); bu durumda kartınızdan çekim yapılmaz.",
        "Deneme süresini başlatabilmek için kart bilgilerinizin girilmesi gerekir; bu, sürenin sonunda hizmetin kesintisiz devam edebilmesi içindir.",
      ],
    },
    {
      baslik: "7. Sözleşmenin süresi, otomatik yenileme ve ifa",
      paragraflar: [
        "Abonelik aylıktır ve belirli bir taahhüt süresi yoktur. Ödemeniz onaylandığı anda paket kapsamındaki özellikler hesabınıza açılır; yani hizmet, sözleşmenin kurulmasının hemen ardından ifa edilmeye başlar.",
        "Abonelik, siz iptal etmediğiniz sürece her ay aynı dönemde kendiliğinden yenilenir ve tutar kayıtlı kartınızdan otomatik olarak tahsil edilir. Yenileme için ayrıca onay vermeniz gerekmez; istemediğiniz noktada iptal etmeniz yeterlidir.",
        "Aboneliğinizin güncel durumunu ve erişiminizin hangi tarihe kadar geçerli olduğunu Profil sayfanızdaki Abonelik bölümünden görebilirsiniz.",
      ],
    },
    {
      baslik: "8. Cayma hakkı",
      paragraflar: [
        "Mesafeli sözleşmelerde tüketicinin, kural olarak on dört gün içinde gerekçe göstermeden sözleşmeden cayma hakkı vardır. Öte yandan mevzuat, elektronik ortamda anında ifa edilen hizmetler ve tüketiciye anında teslim edilen gayrimaddi (dijital) ürünler için bu hakka istisna öngörmektedir.",
        "MetaPriceX aboneliği, ödemeniz onaylandığı anda kullanıma açıldığı için bu istisnanın kapsamına girebilir. Bu formda konuyu kesin bir hükümle bağlamıyoruz: cayma hakkının bu hizmet bakımından nasıl uygulanacağı, [FİRMA UNVANI] tarafından hukuki değerlendirme tamamlandıktan sonra bu bölüme açıkça yazılacaktır.",
        "Uygulamada bugün için geçerli olan durum şudur: aboneliğinizi dilediğiniz an, herhangi bir gerekçe göstermeden ve ek ücret ödemeden iptal edebilirsiniz. İptalin sonuçları bir sonraki bölümde anlatılmıştır. Cayma hakkına ilişkin talebinizi her hâlde [İLETİŞİM E-POSTASI] adresine iletebilirsiniz.",
      ],
    },
    {
      baslik: "9. İptal, iade ve hesabınızın kapatılması",
      paragraflar: [
        "Aboneliğinizi kendiniz iptal edebilirsiniz: Profil sayfasını açın, Abonelik kartındaki \"Abonelik yönetimi\" başlığını genişletin ve \"Aboneliği iptal et\" düğmesine basın. Onay verdiğinizde iptal talebiniz anında işlenir; bizimle ayrıca yazışmanız gerekmez.",
        "İptalden sonra kartınızdan yeni bir çekim yapılmaz, ancak erişiminiz hemen kapanmaz: halihazırda ödemesini yaptığınız dönemin sonuna kadar paketinizi kullanmaya devam edersiniz. Kalan günler için kendiliğinden kısmi iade yapılmaz; iade talebiniz varsa [İLETİŞİM E-POSTASI] adresine yazarak iletebilirsiniz, talebiniz [İADE POLİTİKASI] çerçevesinde değerlendirilir.",
        "Aboneliği iptal etmek ile hesabı kapatmak farklı şeylerdir. Hesabınızı tamamen kapatmak isterseniz bu talebinizi bize iletebilirsiniz. Hesap kapatıldığında girişiniz kapanır; verileriniz aynı anda imha edilmez, mevzuattan doğan saklama yükümlülükleri ve yedekleme düzenimiz çerçevesinde bir süre daha sistemlerimizde kalır. Ayrıntı için Gizlilik Politikası'na bakabilirsiniz.",
      ],
    },
    {
      baslik: "10. Ödeme alınamazsa ne olur",
      paragraflar: [
        "Yenileme günü kartınızdan tahsilat yapılamazsa hesabınızı hemen kapatmayız. Önce sizi bilgilendirir, kartınızı güncellemeniz için bağlantı gönderir ve tahsilatı belirli aralıklarla yeniden deneriz.",
        "Bugün uyguladığımız kademeler şunlardır (süreler gün olarak, ilk başarısız tahsilattan itibaren sayılır):",
      ],
      madde: [
        "0. gün: bilgilendirme e-postası ve kart güncelleme bağlantısı",
        "3. ve 7. günler: tahsilatın yeniden denenmesi, sonuçsuz kalırsa yeni bilgilendirme",
        "10. gün: hesabın salt okunur (kısıtlı) hale gelmesi — verilerinizi görürsünüz, yeni işlem yapamazsınız",
        "20. gün: son bir tahsilat denemesi ve son uyarı",
        "30. gün: aboneliğin askıya alınması",
      ],
    },
    {
      baslik: "11. Fatura",
      paragraflar: [
        "Satın alma sırasında sizden fatura bilgilerinizi (ad-soyad veya unvan, kimlik/vergi numarası, adres, şehir, telefon) isteriz. Fatura, girdiğiniz bu bilgilere göre düzenlenir; bu nedenle bilgileri eksiksiz ve doğru girmeniz önemlidir.",
        "Tahsilat KDV dahil tutar üzerinden yapılır; faturada matrah ve KDV ayrı satırlar hâlinde gösterilir. Faturanız [FATURA İLETİM YÖNTEMİ] ile tarafınıza iletilir.",
        "Fatura bilgilerinizde hata olduğunu fark ederseniz [İLETİŞİM E-POSTASI] adresinden bize bildirin.",
      ],
    },
    {
      baslik: "12. Kişisel verileriniz ve yüklediğiniz dosyalar",
      paragraflar: [
        "Ödeme sırasında verdiğiniz ad, soyad, e-posta, telefon, kimlik numarası ve adres bilgileri, ödemenin gerçekleştirilmesi amacıyla ödeme kuruluşu iyzico'ya aktarılır. Uygulamanın çalıştığı sunucular Almanya'dadır.",
        "Önemli bir noktayı açıkça belirtmek isteriz: uygulamaya yüklediğiniz Excel veya PDF dosyalarının içeriğinin bir bölümü (malzeme adları ve satır metinleri), otomatik ayıklama ve eşleştirme yapılabilmesi için yapay zekâ sağlayıcılarına gönderilir. Bu sağlayıcıların sunucuları yurt dışında bulunabilir. Bu, hizmetin çalışma biçiminin bir parçasıdır.",
        "Hangi verileri neden işlediğimiz, kimlere aktardığımız, ne kadar sakladığımız ve haklarınızı nasıl kullanabileceğiniz Gizlilik Politikası'nda ayrıntılı olarak anlatılmıştır.",
      ],
    },
    {
      baslik: "13. Uyuşmazlık çözümü, şikayet ve iletişim",
      paragraflar: [
        "Hizmetle ilgili her türlü soru, talep ve şikayetinizi önce doğrudan bize iletmenizi rica ederiz: [İLETİŞİM E-POSTASI] veya [TELEFON]. Sorunların büyük bölümü bu aşamada çözülür.",
        "Tüketici sıfatını taşıyan alıcılar, uyuşmazlık hâlinde parasal sınırlara göre yerleşim yerlerindeki Tüketici Hakem Heyetine veya Tüketici Mahkemesine başvurabilir. Güncel parasal sınırlar Ticaret Bakanlığı tarafından her yıl ilan edilir.",
        "MetaPriceX ticari ve mesleki faaliyet kapsamında kullanılan bir yazılımdır. Hizmeti bu kapsamda alan firmalar tüketici mevzuatının kapsamı dışında kalabilir; bu durumda uyuşmazlıklarda genel hükümler uygulanır ve [YETKİLİ MAHKEME VE İCRA DAİRELERİ] yetkilidir.",
      ],
    },
  ],
};

/**
 * Altbilgideki bağlantılar BU listeden türer.
 * ⚠ Elle senkron tutulmaz: bir metin listeden çıkarsa bağlantısı da düşer.
 * Bu deponun kuralı — tıklanınca hiçbir şey yapmayan bağlantı, var olmayan
 * bir şey vaat eder.
 */
export const HUKUKI_SAYFALAR: HukukiMetin[] = [
  GIZLILIK,
  KULLANIM_KOSULLARI,
  CEREZ_POLITIKASI,
  MESAFELI_SATIS,
];
