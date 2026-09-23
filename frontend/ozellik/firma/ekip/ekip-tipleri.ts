/**
 * `GET /firma/uyeler` yanitinin ekran tipleri (FAZ 7 F1b + 23.09 izinler).
 * Sekil sunucudadir (`uyelik.servisi.ts` `uyeleriGetir`); burada yalniz
 * okunan alanlar tiplenir.
 */
import type { UyeIzni } from './izin-metinleri';

export type Uye = {
  id: string;
  eposta: string;
  ad: string | null;
  soyad: string | null;
  firmaRol: 'sahip' | 'uye';
  durum: string;
  katildi: string;
  durduruldu: boolean;
  /** FAZ 7 F2b: uyenin iki adimli girisi acik mi (sunucu hesaplar). */
  mfaAcik?: boolean;
  /**
   * 23.09: ETKIN izinler (sahip → dordu). `null` = bu satirin izinleri SANA
   * gosterilmiyor (uye yalniz kendi satirini ve ana kullaniciyi gorur). Alan
   * hic yoksa (eski sunucu) `undefined`.
   */
  izinler?: UyeIzni[] | null;
};

export type Davet = {
  id: string;
  eposta: string;
  sonGecerlilik: string;
  gonderimSayisi: number;
  /** 23.09: sahibin davette sectigi izinler (kabulde hesaba gecer). */
  izinler?: UyeIzni[];
};

/**
 * 23.09.2026 — sağdan açılan "Üye izinleri" panelinin hedefi. Aktif üye
 * ile bekleyen davet AYRI uçlara gider (izin: `PATCH /firma/uyeler/:id/izinler`
 * ↔ `POST /firma/davetler`; çıkarma: `DELETE /firma/uyeler/:id` ↔
 * `DELETE /firma/davetler/:id`), bu yüzden tür açıkça taşınır.
 */
export type PanelHedefi = { tur: 'uye'; uye: Uye } | { tur: 'davet'; davet: Davet };

export type EkipYaniti = {
  koltuk: { aktif: number; bekleyen: number; hak: number | null; durdurulan: number };
  uyeler: Uye[];
  bekleyenDavetler: Davet[];
  davet: { acik: boolean; nedenKodu: string | null };
};
