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
  /** Bu istekte düşebilecek satır: devamda kalan satır, tekrarda 0. */
  gerekenSatir: number;
  metinSayisi: number;
  /** Aynı içerik az önce çevrildi — kotadan düşmez. */
  tekrar: boolean;
  /** Yarım kalan çevirinin devamı — yalnız kalan satır düşer. */
  devam: boolean;
  /** Bu içeriğin çevirisi şu an sürüyor. */
  suruyor: boolean;
  izin: boolean;
  sebep: string | null;
  redMesaji: string | null;
  kota: CeviriKotaOzeti;
}

export interface TeklifCeviriSonucu {
  harita: Record<string, string>;
  onbellekten: number;
  cevrilen: number;
  basarisiz: number;
  satirSayisi: number;
  /** Bu istekte kotadan düşen satır. */
  dusulenSatir: number;
  /** Haritanın karşılamadığı, Türkçe kalan satır. */
  cevrilemeyenSatir: number;
  tekrar: boolean;
  devam: boolean;
  kotadanDustu: boolean;
  kota: CeviriKotaOzeti;
}

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
  const bas = o.devam
    ? `Bu teklifin yarım kalan çevirisi tamamlanacak: ${sayiYaz(o.gerekenSatir)} satır daha yer (çevrilmiş satırlar yeniden düşmez).`
    : `Bu teklif ${sayiYaz(o.gerekenSatir)} satır çeviri kotası yer.`;
  return `${bas} ${kalanKotaCumlesi(o.kota)}.`;
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
  if (s.cevrilemeyenSatir > 0) {
    return {
      baslik: 'Çeviri KISMEN tamamlandı',
      aciklama:
        `${hucre} · ${sayiYaz(s.cevrilemeyenSatir)} satır Türkçe kaldı. Kotadan yalnız çevrilen ` +
        `${sayiYaz(s.dusulenSatir)} satır düştü; 10 dakika içinde yeniden denerseniz kalan satırlar çevrilir. ` +
        kalanKotaCumlesi(s.kota),
      hata: true,
    };
  }
  if (s.tekrar) {
    return {
      baslik: 'Çeviri tamamlandı',
      aciklama: `${hucre} · Bu içerik az önce çevrilmişti; kotadan yeniden düşmedi. ${kalanKotaCumlesi(s.kota)}`,
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
