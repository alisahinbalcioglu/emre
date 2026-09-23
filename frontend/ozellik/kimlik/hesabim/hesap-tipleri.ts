/**
 * HESABIM — `/auth/me` yanıtının bu ekranın okuduğu şekli (23.09.2026).
 *
 * Tip daha önce `profile/page.tsx` içindeydi; sayfa sekmelere bölününce
 * sekme bileşenleri de aynı şekli okuduğu için buraya taşındı. İkinci bir
 * tanım AÇILMAZ: bir alan eklenecekse burada eklenir.
 */
import type { MfaDurumu } from '../IkiAdimliGirisKarti';
import type { KurumsalBilgi } from '../SirketHesabiKarti';
import type { CeviriKotaOzeti } from '../../teklif/ceviri-kota';

export interface HesapFirmasi {
  id: string;
  ad: string;
  unvan: string | null;
  yetkiliEposta: string | null;
  faturaEposta: string | null;
  vergiNo: string | null;
  vergiDairesi: string | null;
  tcKimlikNo: string | null;
  faturaAdresi: string | null;
  il: string | null;
  ilce: string | null;
  telefon: string | null;
  logoMime: string | null;
  logoVar?: boolean;
  // FAZ 7 F2b: firma geneli iki adımlı giriş zorunluluğu (sahip anahtarı).
  mfaZorunlu?: boolean;
}

export interface HesapProfili {
  id: string;
  email: string;
  role: string;
  /** ⚠ 2.15: etkin paket yoksa sunucu `null` döner — `?? 'core'` YEDEKLENMEZ. */
  tier: string | null;
  createdAt: string;
  // FAZ 4.1 — `/auth/me` KİŞİ ve FİRMA alanlarını da taşıyor.
  ad?: string | null;
  soyad?: string | null;
  telefon?: string | null;
  firmaRol?: string;
  firma?: HesapFirmasi | null;
  // FAZ 7 F2b (§4.4): güvenlik kartı bu alandan beslenir. Sır ve kod
  // özetleri BU YANITTA YOKTUR — yalnız durum ve SAYI.
  mfa?: MfaDurumu;
  // FAZ 7 F3b (§6.7): şirket hesabı kartı. `parolaTanimli: false` olan hesap
  // KURUMSAL GİRİŞLE açıldı.
  kurumsal?: KurumsalBilgi;
  capabilities: {
    mechanical: { material: boolean; labor: boolean; dwg: boolean };
    electrical: { material: boolean; labor: boolean; dwg: boolean };
  };
}

/**
 * Çeviri kotasının yüklenme hâli. Okunamazsa sayfa yine açılır; kutu
 * "okunamadı" der, rakam UYDURMAZ.
 */
export type KotaDurumu =
  | { durum: 'yukleniyor' }
  | { durum: 'hata' }
  | { durum: 'hazir'; kota: CeviriKotaOzeti | null };
