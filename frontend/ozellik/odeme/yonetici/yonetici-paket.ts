/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Yönetici "Paket işlemleri" penceresi — saf yardımcılar (24.09.2026, A2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  KARAR SUNUCUDA (`yonetici-islemi.ts`, `GET /yonetim/abonelik/:firmaId`).
 *  Bu modül yalnız sunucunun kararını METNE ve DÜĞME durumuna çevirir; bir
 *  paketin "doğrudan düşürülebilir" olup olmadığını KENDİSİ hesaplamaz. Ekran
 *  "düşür" deyip sunucu reddedemez; sunucu da kararı kuyrukta taze satırla
 *  yeniden verir (panel iki istek arasında bayatlayabilir).
 *
 *  Emre kararları (23.09): yükseltme → müşteri onayı (öneri); düşürme →
 *  onaysız, dönem sonunda; kartsız müşteri → süreli paket. Blok 1 yalnız
 *  doğrudan düşürmeyi AÇAR; öneri ve süreli paket sonraki bloklarda açılır.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { trTarih } from '../../teklif/ceviri-kota';
import { tutarYaz } from '../paket-bicim';

export type YoneticiIslemTuru = 'oneri' | 'dogrudan-dusur' | 'sureli-paket' | 'yok';
export type HakKaybi = 'seviye' | 'kapsam' | 'kullanici' | 'dwg' | 'teklif' | 'ceviri';

/** `GET /yonetim/abonelik/:firmaId` yanıtı (sunucudaki `YoneticiPaneli` ile aynı biçim). */
export interface YoneticiPaneli {
  firma: { id: string; ad: string; kapali: boolean };
  aktifUye: number;
  sahipler: string[];
  abonelik: null | {
    durum: string;
    odemeYontemi: string;
    paket: { kod: string; ad: string };
    surumNo: number;
    tutar: string;
    paraBirimi: string;
    kullaniciHakki: number;
    erisimSonu: string;
    denemeSonu: string | null;
    iyzicoBagli: boolean;
    planliPaket: { kod: string; ad: string } | null;
    paketGecisTarihi: string | null;
    beklenenGecis: string;
  };
  secenekler: YoneticiSecenegi[];
}

export interface YoneticiSecenegi {
  paketSurumuId: string;
  paket: { kod: string; ad: string; kullaniciHakki: number };
  tutar: string;
  paraBirimi: string;
  islem: YoneticiIslemTuru;
  aciklama: string;
  kayiplar: HakKaybi[];
  kazanclar: HakKaybi[];
  durdurulacakUye: number;
}

/**
 * Hak adları — SUNUCUNUN e-posta sözlüğüyle (`yonetici-paket-epostalari.ts`
 * `HAK_ADI`) AYNI metin. Yönetici ekranda ne görürse müşteri e-postada onu
 * okur; ayrışmayı `yonetici-paket.test.ts` iki dosyayı okuyarak ölçer.
 */
export const HAK_ADI: Record<HakKaybi, string> = {
  seviye: 'Pro seviyesi özellikleri',
  kapsam: 'disiplin kapsamı (mekanik/elektrik)',
  kullanici: 'kullanıcı hakkı',
  dwg: 'DWG metraj',
  teklif: 'aylık teklif hakkı',
  ceviri: 'çeviri kotası',
};

export function hakListesi(haklar: readonly HakKaybi[]): string {
  return haklar.map((h) => HAK_ADI[h] ?? h).join(', ');
}

export const DURUM_ETIKETI: Record<string, string> = {
  DENEME: 'Deneme',
  AKTIF: 'Aktif',
  ODEME_BEKLIYOR: 'Ödeme bekliyor',
  KISITLI: 'Kısıtlı',
  ASKIDA: 'Askıda',
  IPTAL: 'İptal edildi',
  SONA_ERDI: 'Sona erdi',
};

export const ODEME_ETIKETI: Record<string, string> = {
  KART: 'Kart (iyzico)',
  HAVALE: 'Havale / kartsız',
};

export interface IslemDugmesi {
  etiket: string;
  etkin: boolean;
  /** Kapalı düğmenin nedeni (fare ile üstüne gelince). */
  ipucu: string | null;
}

/**
 * Seçeneğin düğmesi. ⚠ Blok 1: yalnız doğrudan düşürme AÇIK. Öneri ve süreli
 * paket düğmesi görünür ama kapalıdır — yönetici yolun VAR olduğunu ve ne
 * zaman açılacağını görür, "yok" sanmaz.
 */
export function islemDugmesi(islem: YoneticiIslemTuru): IslemDugmesi | null {
  switch (islem) {
    case 'dogrudan-dusur':
      return { etiket: 'Dönem sonunda düşür', etkin: true, ipucu: null };
    case 'oneri':
      return {
        etiket: 'Öneri gönder',
        etkin: false,
        ipucu: 'Müşteri onaylı öneri bir sonraki adımda açılacak.',
      };
    case 'sureli-paket':
      return {
        etiket: 'Süreli paket tanımla',
        etkin: false,
        ipucu: 'Süreli paket bir sonraki adımda açılacak.',
      };
    case 'yok':
      return null;
  }
}

export const GEREKCE_EN_AZ = 5;
export const METIN_EN_COK = 500;

/** Sunucudaki DTO ile aynı sınırlar (en az 5, en çok 500 karakter). */
export function gerekceGecerliMi(gerekce: string): boolean {
  const t = gerekce.trim();
  return t.length >= GEREKCE_EN_AZ && t.length <= METIN_EN_COK;
}

/**
 * Düşürme onay kutusundaki satırlar — yönetici "Düşür"e basmadan ÖNCE neyin
 * NE ZAMAN olacağını, müşterinin ne KAYBEDECEĞİNİ ve kimin DURACAĞINI görür.
 */
export function dusurmeOzeti(g: {
  mevcutPaketAdi: string;
  secenek: YoneticiSecenegi;
  beklenenGecis: string;
}): string[] {
  const s = g.secenek;
  const tarih = trTarih(g.beklenenGecis);
  const satirlar = [
    `${g.mevcutPaketAdi} → ${s.paket.ad}`,
    tarih
      ? `Geçiş: ${tarih} (dönem sonu). O tarihe kadar mevcut paket açık kalır.`
      : 'Geçiş: dönem sonunda. O tarihe kadar mevcut paket açık kalır.',
    `Yeni aylık ücret: ${tutarYaz(s.tutar, s.paraBirimi)} (KDV dahil), o tarihten itibaren.`,
  ];
  if (s.kayiplar.length > 0) {
    satirlar.push(`Müşterinin azalan ya da kalkan hakları: ${hakListesi(s.kayiplar)}.`);
  }
  if (s.durdurulacakUye > 0) {
    satirlar.push(`Geçişten sonra ${s.durdurulacakUye} ekip üyesinin erişimi durur.`);
  }
  satirlar.push('Müşteri onayı alınmaz; firma sahibine bilgi e-postası gider.');
  return satirlar;
}
