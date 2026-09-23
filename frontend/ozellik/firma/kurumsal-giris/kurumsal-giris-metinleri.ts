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
 *
 *  23.09.2026: Ekip sayfasının ikinci tasarımıyla aynı dil ("sen") ve aynı
 *  sadelik. Dönüş adresi artık adımların ÜSTÜNDE — metinler "yukarıdaki" der.
 *  ⚠ IMPORT YOK: saf dosya testte doğrudan okunur (vitest `@/` çözmüyor).
 */

export type SaglayiciTipi = 'entra' | 'google';
export type SaglayiciDurumu = 'TASLAK' | 'DOGRULANDI' | 'ETKIN' | 'KAPALI';

export const SAGLAYICI_GORUNEN_AD: Record<SaglayiciTipi, string> = {
  entra: 'Microsoft Entra ID',
  google: 'Google Workspace',
};

export const DURUM_ROZETI: Record<SaglayiciDurumu, { etiket: string; aciklama: string }> = {
  TASLAK: {
    etiket: 'Taslak',
    aciklama: 'Bilgiler kaydedildi ama bağlantı henüz sınanmadı. Kimse şirket hesabıyla giremez.',
  },
  DOGRULANDI: {
    etiket: 'Doğrulandı',
    aciklama: 'Alan adın kanıtlandı. Açmak için "Şirket hesabıyla giriş" anahtarını aç.',
  },
  ETKIN: {
    etiket: 'Açık',
    aciklama: 'Ekibin giriş ekranında "Şirket hesabımla giriş yap" düğmesini görüyor.',
  },
  KAPALI: {
    etiket: 'Kapalı',
    aciklama: 'Ayar duruyor ama kimseye görünmüyor.',
  },
};

export const ENTRA_ADIMLARI: string[] = [
  'Entra yönetim merkezinde "Uygulama kayıtları" → "Yeni kayıt" ile bir uygulama oluştur.',
  'Yönlendirme URI türü olarak "Web" seç ve yukarıdaki dönüş adresini yapıştır.',
  '"Sertifikalar ve gizli diziler" bölümünden yeni bir istemci gizli dizisi (client secret) üret; DEĞERİ yalnız bir kez görünür — aşağıya yapıştır ve bitiş tarihini de gir.',
  '"Belirteç yapılandırması" bölümünde ID belirteci için "email" ve "xms_edov" isteğe bağlı taleplerini EKLE. ' +
    'Bu iki talep olmadan e-postan kanıtlanmış sayılmaz ve bağlantı sınaması başarısız olur.',
  '"API izinleri" altında openid, profile ve email izinlerinin olduğundan emin ol; gerekiyorsa "Yönetici onayı ver" de.',
  'Dizin (kiracı) kimliğini ve uygulama (istemci) kimliğini aşağıdaki alanlara yapıştır.',
  'Şirketinin e-posta alan adlarını yaz, kaydet ve "Bağlantıyı sına" ile kendi şirket hesabınla giriş yap.',
];

export const GOOGLE_ADIMLARI: string[] = [
  'Google Cloud Console → "API ve Hizmetler" → "Kimlik bilgileri" → "OAuth istemci kimliği oluştur" → tür: Web uygulaması.',
  'Yetkili yönlendirme URI olarak yukarıdaki dönüş adresini yapıştır.',
  'Oluşan istemci kimliğini ve istemci gizli anahtarını aşağıdaki alanlara yapıştır.',
  'OAuth izin ekranında kullanıcı türünü "Dahili" seç. "Harici" seçilirse HERHANGİ bir Google hesabı kimlik doğrulayabilir; ' +
    'tek koruma alan adı (hd) kontrolüdür, bu yüzden alan adlarını doğru yaz.',
  'Kapsamların openid, profile ve email içerdiğinden emin ol.',
  'Workspace alan adını yaz, kaydet ve "Bağlantıyı sına" ile kendi şirket hesabınla giriş yap.',
];

export const SINAMA_SONUC_METNI: Record<string, string> = {
  sinandi: 'Bağlantı sınandı, alan adın doğrulandı.',
};

/**
 * Hesabım'ın GÜVENLİK sekmesi — "Şirket hesabı" kartı orada (23.09 sekmeli
 * Hesabım; `hesabim.ts` `sekmeAdresi('guvenlik')` ile aynı adres, `/sso/tamam`
 * da bağlantıdan sonra buraya döner).
 */
export const HESABIM_GUVENLIK_ADRESI = '/profile?sekme=guvenlik';

export const HESAP_BAGLANMADI_METNI =
  'Alan adı doğrulandı; hesabın bu şirket hesabına bağlanmadı (e-postalar farklı). ' +
  'Parolayla girişi kapatmak istersen önce Hesabım → Güvenlik → Şirket hesabı adımından kendi hesabını bağla.';

/**
 * Üç adımlık kurulum ilerlemesi (kaydet → sına → aç). Karar SUNUCUNUN
 * durumundan: doğrulanmış alan adı yoksa ya da ayar TASLAK ise sınama
 * TAMAMLANMAMIŞTIR — sunucu da o hâlde açmayı reddeder (`DOGRULANMADI`).
 */
export function kurulumIlerlemesi(
  s: { durum: SaglayiciDurumu; dogrulanmisAlanAdlari: readonly unknown[] } | null,
): { ad: string; tamam: boolean }[] {
  return [
    { ad: 'Bilgileri kaydet', tamam: s !== null },
    { ad: 'Bağlantıyı sına', tamam: acilabilirMi(s) },
    { ad: 'Aç', tamam: s !== null && s.durum === 'ETKIN' },
  ];
}

/** Açma anahtarı kullanılabilir mi? (Sunucunun `DOGRULANMADI` kuralıyla aynı.) */
export function acilabilirMi(
  s: { durum: SaglayiciDurumu; dogrulanmisAlanAdlari: readonly unknown[] } | null,
): boolean {
  return s !== null && s.durum !== 'TASLAK' && s.dogrulanmisAlanAdlari.length > 0;
}

/** İstemci anahtarının süresi 14 günden az mı kaldı (ya da doldu mu)? */
export function sirBitisYakinMi(iso: string | null | undefined, simdi: number = Date.now()): boolean {
  if (!iso) return false;
  const bitis = new Date(iso).getTime();
  return Number.isFinite(bitis) && bitis - simdi < 14 * 24 * 3600_000;
}

/** "firma.com.tr, firma.com" → ['firma.com.tr', 'firma.com'] (boşlar atılır). */
export function alanAdlariniAyir(metin: string): string[] {
  return metin.split(',').map((a) => a.trim()).filter(Boolean);
}
