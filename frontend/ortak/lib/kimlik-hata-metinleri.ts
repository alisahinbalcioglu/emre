/**
 * FAZ 7 F1b — SUNUCU HATA KODU → KULLANICI METNI (tek sözlük).
 *
 * ⚠ Sunucu her reddi bir `kod` ile döner (sessiz dal yok). Ön yüz o kodu
 * BURADAN metne çevirir; her ekran kendi metnini yazarsa aynı ret iki yerde
 * iki farklı cümleyle görünür.
 *
 * ⚠ Sunucunun `mesaj` alanı varsa O ÖNCELİKLİDİR: sunucu bağlama özel bilgi
 * (kaç kişilik paket, hangi adres) taşıyabilir. Buradaki metinler yedektir.
 */
export const KIMLIK_HATA_METINLERI: Record<string, string> = {
  FIRMA_SAHIBI_GEREKLI: 'Bu işlemi yalnız firma sahibi yapabilir.',
  PAKET_EKIP_YOK:
    'Basic paketinde ekip yok — ekip kurmak için Pro pakete geçin.',
  KOLTUK_DOLU:
    'Paketinizin kullanıcı hakkı dolu. Paketi yükseltin ya da bir üyeyi/daveti çıkarın.',
  ZATEN_EKIPTE: 'Bu e-posta adresi zaten ekibinizde.',
  BASKA_FIRMADA_KAYITLI:
    'Bu e-posta adresi başka bir firmada kayıtlı. Katılmak için önce mevcut hesabınızı kapatmanız gerekir.',
  DAVET_GECERSIZ:
    'Davet bağlantısı geçersiz ya da süresi dolmuş. Firma sahibinden yeni davet isteyin.',
  DAVET_YOK: 'Davet bulunamadı.',
  UYE_YOK: 'Üye bulunamadı.',
  SON_SAHIP:
    'Firmanın son sahibi bu kişi ve ekipte başka kişiler var. Önce başka birini sahip yapın.',
  KENDINI_CIKARAMAZ:
    'Kendinizi ekipten çıkaramazsınız. Hesabım → Hesabımı kapat adımını kullanın.',
  ONAY_UYUSMADI: 'Yazdığınız e-posta adresi üyenin adresiyle aynı değil.',
  GUNLUK_DAVET_SINIRI:
    'Günlük davet sınırına ulaştınız (24 saatte 20). Yarın tekrar deneyin.',
  GONDERIM_SINIRI:
    'Bu davet için gönderim sınırına ulaşıldı. Daveti iptal edip yenisini oluşturun.',
  EPOSTA_GONDERILEMEDI:
    'Davet e-postası gönderilemedi, davet oluşturulmadı. Lütfen birazdan tekrar deneyin.',
  KOLTUK_ASILDI:
    'Firmanızın paketi bu kadar kişiye yetmiyor; yöneticiniz paketi yükseltmeli ya da ekibi düzenlemeli.',
  ABONELIK_KISITLI:
    'Aboneliğiniz kısıtlı olduğu için bu işlem yapılamıyor.',

  // ── FAZ 7 F2b · İKİ ADIMLI GİRİŞ ──────────────────────────────────────
  MFA_KOD_HATALI:
    'Kod hatalı ya da az önce kullanıldı. Uygulamadaki bir sonraki kodu bekleyin.',
  MFA_KILITLI:
    'Çok fazla hatalı deneme yapıldı; doğrulama adımı kilitlendi. "Parolamı unuttum" ile açabilir ya da yöneticinize başvurabilirsiniz.',
  MFA_ZATEN_ACIK: 'Bu hesapta iki adımlı giriş zaten açık.',
  MFA_ZORUNLU:
    'Rolünüz ya da firmanızın ayarı gereği iki adımlı giriş kapatılamıyor.',
  MFA_ZORUNLU_DEGIL:
    'Bu hesapta iki adımlı giriş artık zorunlu değil. Lütfen yeniden giriş yapın.',
  MFA_KAPALI: 'Bu hesapta iki adımlı giriş açık değil.',
  MFA_DOGRULAMA_YOK: 'Doğrulama kodunu ya da bir kurtarma kodunu girin.',
  MFA_KURULUM_GEREKLI:
    'Yönetici hesaplarında iki adımlı giriş zorunlu. Lütfen yeniden giriş yapın.',
  KURULUM_SURESI_DOLDU:
    'Kurulum süresi doldu (15 dakika). Lütfen yeniden başlatın.',
  PAROLA_HATALI: 'Parolanız hatalı.',
  YENIDEN_GIRIS_GEREKLI:
    'Bu işlem için son 10 dakika içinde giriş yapmış olmanız gerekiyor. Çıkış yapıp yeniden girin.',
  ONCE_KENDINIZ_ACIN:
    'Firmanız için zorunlu kılmadan önce kendi hesabınızda iki adımlı girişi açın.',
  MEYDAN_OKUMA_GECERSIZ:
    'Doğrulama süresi doldu. Lütfen yeniden giriş yapın.',
  KIMLIK_SIFRELEME_YOK:
    'Sunucu yapılandırması eksik; iki adımlı giriş şu an kullanılamıyor. Kurtarma kodunuzla girebilirsiniz.',
  KENDI_MFA_SIFIRLANAMAZ:
    'Kendi iki adımlı girişinizi panelden sıfırlayamazsınız.',

  // ── FAZ 7 F3b · KURUMSAL GİRİŞ ────────────────────────────────────────
  KURUMSAL_GIRIS_ZORUNLU:
    'Şirketiniz kurumsal giriş kullanıyor; giriş ekranında "Şirket hesabımla giriş yap" düğmesini kullanın.',
  SAGLAYICI_KULLANILAMAZ: 'Bu şirket girişi şu an kullanılamıyor.',
  SAGLAYICI_YOK: 'Firmanızda şirket girişi tanımlı değil.',
  AKIS_GECERSIZ:
    'Giriş bağlantısının süresi doldu ya da zaten kullanıldı. Lütfen yeniden deneyin.',
  IDP_REDDETTI: 'Şirket kimlik sağlayıcınız girişi reddetti.',
  IDP_HATASI: 'Şirket kimlik sağlayıcınıza ulaşılamadı. Lütfen birazdan tekrar deneyin.',
  ISTEMCI_SIRRI_GECERSIZ:
    'Şirket girişi ayarındaki istemci anahtarı geçersiz ya da süresi dolmuş. Firma sahibi ayarı yenilemeli.',
  KOD_GECERSIZ: 'Giriş bağlantısı geçersiz. Lütfen yeniden deneyin.',
  IMZA_GECERSIZ: 'Şirket hesabı doğrulanamadı (imza geçersiz).',
  ISSUER_UYUSMADI: 'Şirket hesabı doğrulanamadı (kimlik sağlayıcı uyuşmadı).',
  AUD_UYUSMADI: 'Şirket girişi ayarı bu uygulamaya ait değil (istemci kimliği uyuşmadı).',
  NONCE_UYUSMADI: 'Giriş bağlantısı geçersiz. Lütfen yeniden deneyin.',
  SURE_DOLDU: 'Giriş bağlantısının süresi doldu. Lütfen yeniden deneyin.',
  KESIF_GECERSIZ: 'Şirket kimlik sağlayıcınızın ayar belgesi okunamadı.',
  JWKS_GECERSIZ: 'Şirket kimlik sağlayıcınızın anahtarları okunamadı.',
  ANAHTAR_YOK: 'Şirket hesabı doğrulanamadı (imza anahtarı bulunamadı).',
  ALG_IZINSIZ: 'Şirket hesabı doğrulanamadı (imza algoritması kabul edilmiyor).',
  MISAFIR_HESAP:
    'Misafir (konuk) hesaplarla şirket girişi yapılamaz. Kurumunuzun kendi hesabıyla girin.',
  KIRACI_UYUSMADI:
    'Bu hesap firmanızın kurumsal dizinine ait değil. Şirket hesabınızla girin.',
  KIRACI_GECERSIZ:
    'Kiracı kimliği kurumsal bir dizin kimliği olmalı; kişisel hesap dizini kabul edilmiyor.',
  ALAN_ADI_TANIMSIZ:
    'Şirket hesabınızın alan adı bu firmada tanımlı değil. Firma sahibinden alan adını doğrulamasını isteyin.',
  ALAN_ADI_YOK: 'Bu alan adı doğrulanmış değil.',
  EPOSTA_KANITSIZ:
    'Şirket hesabınızın e-postası doğrulanmış olarak gelmedi. Yöneticiniz uygulama kaydında e-posta taleplerini eklemeli.',
  EPOSTA_DOGRULANMAMIS:
    'Hesabınızın e-posta adresi doğrulanmamış. Önce parolanızla girip doğrulama bağlantısını kullanın.',
  EPOSTA_UYUSMADI:
    'Şirket hesabınızın e-posta adresi bu hesabın e-posta adresiyle aynı olmalı.',
  KIMLIK_BASKA_FIRMADA:
    'Bu şirket hesabı başka bir firmanın kullanıcısına bağlı.',
  KIMLIK_BASKA_HESAPTA: 'Bu şirket hesabı başka bir kullanıcıya bağlı.',
  BASKA_KIMLIK_BAGLI:
    'Bu hesaba aynı şirket girişinden başka bir kimlik bağlı. Profil sayfasından bağlantıyı kaldırın.',
  YONETICI_KURUMSAL_GIRIS_YOK:
    'Platform yöneticisi hesapları şirket girişini kullanamaz; parolanızla girin.',
  HESAP_ASKIDA: 'Hesabınız askıya alınmış.',
  HESAP_KAPALI: 'Hesabınız kapatılmış.',
  KATILIM_KAPALI:
    'Firmanız yeni kişilerin şirket hesabıyla katılmasına izin vermiyor. Yöneticinizden davet isteyin.',
  ZATEN_KAYITLI:
    'Bu adres zaten kayıtlı. Giriş ekranından şirket hesabınızla girin.',
  SSO_KOD_GECERSIZ:
    'Giriş bağlantısının süresi doldu ya da başka bir tarayıcıda açıldı. Lütfen yeniden deneyin.',
  SSO_BILET_GECERSIZ:
    'Katılım onayının süresi doldu. Lütfen şirket hesabınızla yeniden giriş yapın.',
  SINAMA_KANITSIZ:
    'Şirket hesabınızın e-postası doğrulanmış olarak gelmedi; alan adı doğrulanamadı.',
  SINAMA_ALAN_ADI_UYUSMADI:
    'Giriş yaptığınız şirket hesabının alan adı, ayarda yazdığınız alan adlarından biri değil.',
  SINAMA_ALAN_ADI_BASKA_FIRMADA:
    'Bu alan adı başka bir firmada doğrulanmış. Lütfen destek ekibiyle iletişime geçin.',
  DOGRULANMADI:
    'Önce "Bağlantıyı sına" ile şirket hesabınızla girip alan adınızı doğrulayın.',
  ONCE_HESABINIZI_BAGLAYIN:
    'Zorunlu kılmadan önce kendi hesabınızı şirket hesabınıza bağlayın; aksi hâlde siz de giriş yapamazsınız.',
  SIR_GEREKLI: 'İlk kayıtta istemci anahtarı (client secret) zorunludur.',
  ONAY_GEREKLI: 'Silmek için kutuya SİL yazın.',
  BAGLANTI_YOK: 'Hesabınıza bağlı bir şirket hesabı yok.',
  SON_GIRIS_YOLU:
    'Bu, hesabınıza girmenin tek yolu. Önce "Parolamı unuttum" ile bir parola belirleyin, sonra bağlantıyı kaldırın.',
  PAROLA_YOK:
    'Hesabınızın parolası yok; şirket hesabıyla açıldı. Firmanız izin veriyorsa "Parolamı unuttum" ile bir parola belirleyebilirsiniz.',
};

/** Sunucu yanıtından kullanıcıya gösterilecek metni çözer. */
export function kimlikHataMetni(hata: unknown, yedek = 'Bir sorun oluştu, lütfen tekrar deneyin.'): string {
  const d = (hata as { response?: { data?: { kod?: string; mesaj?: string; message?: string } } })
    ?.response?.data;
  if (d?.mesaj) return d.mesaj;
  if (d?.kod && KIMLIK_HATA_METINLERI[d.kod]) return KIMLIK_HATA_METINLERI[d.kod];
  if (typeof d?.message === 'string') return d.message;
  return yedek;
}
