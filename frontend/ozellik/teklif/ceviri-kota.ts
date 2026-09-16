/**
 * ÇEVİRİ KOTASI — İSTEMCİ TARAFI GÖSTERİM (Faz 6.2, 14.09.2026).
 *
 * ⚠ BU MODÜL KARAR VERMEZ, SAYMAZ. Hangi satırın çevrileceği ve kotadan kaç
 * satır düşeceği SUNUCUDA, kayıtlı teklif içeriğinden hesaplanır
 * (`backend/src/ozellik/giris/ai/ceviri-kurali.ts`). 13.08–14.09 arası sayım
 * burada yapılıyordu ve istemci `metinler` listesini kendisi gönderiyordu —
 * yani kotadan ne düşeceğini istemci söylüyordu. Burada yalnız sunucunun
 * döndürdüğü rakamlar metne çevrilir.
 */
import { sayiYaz } from '../odeme/paket-bicim';

export interface CeviriKotaOzeti {
  paketKodu: string;
  kota: { satir: number; dosya: number };
  donemBaslangic: string;
  /** Yenilenme anı (ISO). */
  donemBitis: string;
  kullanilanSatir: number;
  kullanilanDosya: number;
  kalanSatir: number;
  kalanDosya: number;
  /** Profil ucu: abonelik kısıtlıysa kota görünür ama çeviri kapalıdır. */
  ceviriAcik?: boolean;
}

export interface CeviriOnizleme {
  epostaDogrulandi: boolean;
  /** Bu istekte düşebilecek satır: ödenmiş içerikte 0. */
  gerekenSatir: number;
  metinSayisi: number;
  /** Bu içeriğin çevirisi ödenmiş — kotadan düşmez. */
  tekrar: boolean;
  /** Bu içeriğin çevirisi şu an sürüyor. */
  suruyor: boolean;
  izin: boolean;
  sebep: string | null;
  redMesaji: string | null;
  kota: CeviriKotaOzeti;
}

/**
 * Tamamlanmış çeviri (REVİZE K-T7, 15.09): harita her zaman TAMDIR — eksik
 * kalan çeviride sunucu 422 `CEVIRI_TAMAMLANAMADI` döner, harita gelmez.
 */
export interface TeklifCeviriSonucu {
  harita: Record<string, string>;
  onbellekten: number;
  cevrilen: number;
  basarisiz: number;
  satirSayisi: number;
  /** Bu istekte kotadan düşen satır. */
  dusulenSatir: number;
  tekrar: boolean;
  kotadanDustu: boolean;
  kota: CeviriKotaOzeti;
}

/** Ödenmemiş içeriğin nedeni — sunucu `odenmisIcerikKaniti` ile birebir. */
export type GoruntulemeNedeni = 'CEVIRI_SURUYOR' | 'ICERIK_DEGISTI' | 'CEVIRI_YOK';

/** `GET /ai/translate/goruntule` — ödenmiş ve tam: harita gelir. */
export interface GoruntulemeOdenmis {
  odenmis: true;
  tamam: true;
  kaynak: 'TUKETIM' | 'GECIS';
  harita: Record<string, string>;
  satirSayisi: number;
}

/** Ödenmiş ama önbellekte eksik: harita GELMEZ, çeviri isteği kotasız tamamlar. */
export interface GoruntulemeEksik {
  odenmis: true;
  tamam: false;
  kaynak: 'TUKETIM' | 'GECIS';
  satirSayisi: number;
  cevrilemeyenSatir: number;
}

/** Ödenmemiş: yalnız neden ve sayılar (harita GELMEZ). */
export interface GoruntulemeOdenmemis {
  odenmis: false;
  neden: GoruntulemeNedeni;
  satirSayisi: number;
  /** İngilizce dosyada değişecek satır. */
  degisecekSatir: number;
  /** Kayıtta Türkçe duran, karşılığı olmayan satır — İngilizce dosyayı durdurur (Emre 15.09). */
  karsiliksizSatir: number;
}

export type GoruntulemeYaniti = GoruntulemeOdenmis | GoruntulemeEksik | GoruntulemeOdenmemis;

/** ISO an → "12.10.2026" (Türkiye saati, UTC+3). `toLocaleDateString` KULLANILMAZ:
 *  sunucuyla aynı günü söylemeli, tarayıcının saat dilimine bağlı kalmamalı. */
export function trTarih(iso: string): string {
  const t = new Date(Date.parse(iso) + 3 * 60 * 60 * 1000);
  if (Number.isNaN(t.getTime())) return '';
  const iki = (n: number) => String(n).padStart(2, '0');
  return `${iki(t.getUTCDate())}.${iki(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

/** "Kalan: 2.100 satır / 28 dosya · yenilenme 12.10.2026" */
export function kalanKotaCumlesi(k: CeviriKotaOzeti): string {
  const yenilenme = trTarih(k.donemBitis);
  return (
    `Kalan: ${sayiYaz(k.kalanSatir)} satır / ${sayiYaz(k.kalanDosya)} dosya` +
    (yenilenme ? ` · yenilenme ${yenilenme}` : '')
  );
}

/** Çevirmeden ÖNCE gösterilen onay metni: bu teklif kaç satır yer, geriye ne kalır. */
export function onizlemeCumlesi(o: CeviriOnizleme): string {
  return `Bu teklif ${sayiYaz(o.gerekenSatir)} satır çeviri kotası yer. ${kalanKotaCumlesi(o.kota)}.`;
}

/** Sunucu hatasından kullanıcıya gösterilecek metin. Kota/erişim reddi `mesaj`
 *  (+ `aciklama`) taşır; ValidationPipe `message` dizisi taşır. */
export function ceviriHataMetni(e: unknown): string {
  const hata = e as { response?: { data?: Record<string, unknown> }; message?: string };
  const data = hata?.response?.data ?? {};
  if (typeof data.mesaj === 'string' && data.mesaj) {
    return typeof data.aciklama === 'string' && data.aciklama ? `${data.mesaj}. ${data.aciklama}` : data.mesaj;
  }
  if (Array.isArray(data.message)) return data.message.join(' · ');
  if (typeof data.message === 'string' && data.message) return data.message;
  return hata?.message || 'Bilinmeyen hata';
}

export interface CeviriBildirimi {
  baslik: string;
  aciklama: string;
  hata: boolean;
}

/** Çeviri sonrası bildirim: kaç hücre yazıldı, kotadan ne düştü, kalan ne. */
export function sonucBildirimi(s: TeklifCeviriSonucu, yazilan: number): CeviriBildirimi {
  const hucre = `${sayiYaz(yazilan)} hücre çevrildi`;
  if (s.tekrar) {
    return {
      baslik: 'Çeviri tamamlandı',
      aciklama: `${hucre} · Bu içeriğin çevirisi daha önce ödenmişti; kotadan yeniden düşmedi. ${kalanKotaCumlesi(s.kota)}`,
      hata: false,
    };
  }
  return {
    baslik: 'Çeviri tamamlandı',
    aciklama: `${hucre} · kotadan ${sayiYaz(s.dusulenSatir)} satır düştü. ${kalanKotaCumlesi(s.kota)}`,
    hata: false,
  };
}

/**
 * Görüntüleme (bakmak ≠ çevirmek, 15.09): ödenmiş içeriğin İngilizce görünümü
 * açıldı — kota işlemi yok. Yalnız tam (`tamam: true`) yanıtta çağrılır.
 */
export function goruntulemeBildirimi(_y: GoruntulemeOdenmis, yazilan: number): CeviriBildirimi {
  return {
    baslik: 'İngilizce görünüm açıldı',
    aciklama: `${sayiYaz(yazilan)} hücre İngilizce gösteriliyor · bu içeriğin çevirisi daha önce ödenmişti, kotadan düşmedi.`,
    hata: false,
  };
}

/** Çeviri 422 gövdesinin istemcinin okuduğu kesiti. */
export interface TamamlanamadiGovdesi {
  kod?: unknown;
  cevrilemeyenSayisi?: unknown;
  cevrilemeyenMetinSayisi?: unknown;
  cevrilemeyenSatirlar?: unknown;
}

/** Listede gösterilen ilk metin sayısı ve metin başına karakter tavanı. */
const LISTE_ILK = 5;
const METIN_TAVANI = 60;

/**
 * HEPSİ YA DA HİÇBİRİ (REVİZE K-T7): çeviri tamamlanamadı. Kotadan hiçbir şey
 * düşmedi, teklif Türkçe kaldı; çevrilemeyen ilk metinler gösterilir, tekrar
 * deneme ücretsizdir.
 */
export function tamamlanamadiBildirimi(g: TamamlanamadiGovdesi | null | undefined): CeviriBildirimi {
  const liste = Array.isArray(g?.cevrilemeyenSatirlar) ? g!.cevrilemeyenSatirlar.filter((m): m is string => typeof m === 'string') : [];
  const satir = typeof g?.cevrilemeyenSayisi === 'number' ? g!.cevrilemeyenSayisi : liste.length;
  const metinSayisi = typeof g?.cevrilemeyenMetinSayisi === 'number' ? g!.cevrilemeyenMetinSayisi : liste.length;
  const ilk = liste
    .slice(0, LISTE_ILK)
    .map((m) => `«${m.length > METIN_TAVANI ? `${m.slice(0, METIN_TAVANI)}…` : m}»`)
    .join(' · ');
  const kalan = Math.max(0, metinSayisi - Math.min(liste.length, LISTE_ILK));
  const listeMetni = ilk ? `: ${ilk}${kalan > 0 ? ` (ve ${sayiYaz(kalan)} satır daha)` : ''}` : '';
  return {
    baslik: 'Çeviri tamamlanamadı, tekrar deneyin',
    aciklama:
      `${sayiYaz(satir)} satır çevrilemedi${listeMetni}. Kotadan hiçbir şey düşmedi; teklif Türkçe kaldı. ` +
      'Tekrar denediğinizde çevrilmiş satırlar beklemeden gelir.',
    hata: true,
  };
}

/**
 * Ekranda TEK hücre bile değişmediğinde. 13.08'den beri bu durum "başarı"
 * sayılmaz; ama kotadan satır düştüyse "sunucudan çeviri gelmedi" demek
 * yalandır (14.09 incelemesi O3): çeviri geldi, satırlar zaten çevrilmiş ya
 * da metinler zaten İngilizceydi.
 */
export function bosSonucBildirimi(s: TeklifCeviriSonucu): CeviriBildirimi {
  if (s.kotadanDustu) {
    return {
      baslik: 'Hiçbir hücre değişmedi',
      aciklama:
        `Çeviri alındı ama ekrandaki metinler zaten çevrilmiş ya da İngilizce görünüyor. ` +
        `Kotadan ${sayiYaz(s.dusulenSatir)} satır düştü. ${kalanKotaCumlesi(s.kota)}`,
      hata: true,
    };
  }
  return {
    baslik: 'Çeviri uygulanamadı',
    aciklama: 'Sunucudan çeviri gelmedi — hiçbir hücre değişmedi. Kotadan düşmedi.',
    hata: true,
  };
}
