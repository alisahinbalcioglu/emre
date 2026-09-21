/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — KURUMSAL GİRİŞ AYAR EKRANININ METİNLERİ (§1.7 / §6.8)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Kurulum yardımının adım adım metni BURADA, bileşende DEĞİL: aynı cümleler
 *  hem ekranda hem testte okunur ve ileride destek dokümanına kopyalanır.
 *
 *  ⚠ `xms_edov` ve `email` talepleri ZORUNLU ADIMDIR (Entra): eklenmezse
 *  e-posta KANIT sayılmaz (§5.2) ve sınama "SINAMA_KANITSIZ" ile düşer.
 *  Kullanıcıya nedenini söylemeyen bir kurulum yardımı, o hatayı çözülemez
 *  yapardı.
 */

export const SAGLAYICI_GORUNEN_AD: Record<string, string> = {
  entra: 'Microsoft Entra ID',
  google: 'Google Workspace',
};

export const DURUM_ROZETI: Record<string, { etiket: string; aciklama: string }> = {
  TASLAK: {
    etiket: 'Taslak',
    aciklama: 'Ayar kaydedildi ama bağlantı henüz sınanmadı. Kimse şirket hesabıyla giremez.',
  },
  DOGRULANDI: {
    etiket: 'Doğrulandı',
    aciklama: 'Alan adınız kanıtlandı. Açmak için "Etkinleştir" deyin.',
  },
  ETKIN: {
    etiket: 'Etkin',
    aciklama: 'Ekibiniz giriş ekranında "Şirket hesabımla giriş yap" düğmesini görüyor.',
  },
  KAPALI: {
    etiket: 'Kapalı',
    aciklama: 'Ayar duruyor ama kimseye görünmüyor.',
  },
};

export const ENTRA_ADIMLARI: string[] = [
  'Entra yönetim merkezinde "Uygulama kayıtları" → "Yeni kayıt" ile bir uygulama oluşturun.',
  'Yönlendirme URI türü olarak "Web" seçin ve aşağıdaki dönüş adresini yapıştırın.',
  '"Sertifikalar ve gizli diziler" bölümünden yeni bir istemci gizli dizisi (client secret) üretin; DEĞERİ bir kez görünür, buraya yapıştırın ve bitiş tarihini de girin.',
  '"Belirteç yapılandırması" bölümünde ID belirteci için "email" ve "xms_edov" isteğe bağlı taleplerini EKLEYİN. ' +
    'Bu iki talep olmadan e-postanız kanıtlanmış sayılmaz ve bağlantı sınaması başarısız olur.',
  '"API izinleri" altında openid, profile ve email izinlerinin bulunduğundan emin olun ve gerekiyorsa "Yönetici onayı ver" deyin.',
  'Dizin (kiracı) kimliğini ve uygulama (istemci) kimliğini aşağıdaki alanlara yapıştırın.',
  'Şirketinizin e-posta alan adlarını yazın, kaydedin ve "Bağlantıyı sına" ile kendi şirket hesabınızla giriş yapın.',
];

export const GOOGLE_ADIMLARI: string[] = [
  'Google Cloud Console → "API ve Hizmetler" → "Kimlik bilgileri" → "OAuth istemci kimliği oluştur" → tür: Web uygulaması.',
  'Yetkili yönlendirme URI olarak aşağıdaki dönüş adresini yapıştırın.',
  'Oluşan istemci kimliğini ve istemci gizli anahtarını aşağıdaki alanlara yapıştırın.',
  'OAuth izin ekranında kullanıcı türünü "Dahili" seçin. "Harici" seçilirse HERHANGİ bir Google hesabı kimlik doğrulayabilir; ' +
    'tek koruma alan adı (hd) kontrolüdür, bu yüzden alan adlarınızı doğru yazın.',
  'Kapsamların openid, profile ve email içerdiğinden emin olun.',
  'Workspace alan adınızı yazın, kaydedin ve "Bağlantıyı sına" ile kendi şirket hesabınızla giriş yapın.',
];

export const SINAMA_SONUC_METNI: Record<string, string> = {
  sinandi: 'Bağlantı sınandı ve alan adınız doğrulandı.',
};

export const HESAP_BAGLANMADI_METNI =
  'Alan adı doğrulandı; hesabınız bu şirket hesabına bağlanmadı (e-postalar farklı). ' +
  'Kurumsal girişi zorunlu kılmak isterseniz önce Profil → Şirket hesabı adımından kendi hesabınızı bağlayın.';
