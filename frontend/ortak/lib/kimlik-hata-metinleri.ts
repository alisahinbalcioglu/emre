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
