/**
 * TEKLİF ÇEVİRİSİ İSTEĞİ — önizle → onayla → çevir (Faz 6.2, 14.09.2026).
 *
 * Kayıtlı teklif ekranı ve Düzenle ekranı AYNI akışı kullanır; farkları yalnız
 * haritayı hangi satırlara uyguladıklarıdır. Bağımlılıklar parametreyle gelir
 * ki sıra (önizleme reddederse çeviri isteği HİÇ gitmez) birim testle
 * ölçülebilsin.
 *
 * ⚠ İstemcinin reddi bir kolaylıktır, kapı DEĞİLDİR: sunucu aynı kararı
 * çeviri isteğinde yeniden, AI çağrısından önce verir.
 *
 * ── BAKMAK ≠ ÇEVİRMEK (Faz 6.11, 15.09) ─────────────────────────────────────
 * "İngilizceye Çevir" önce görüntüleme ucuna sorar: bu içeriğin çevirisi
 * ödenmiş ve tamsa harita onaysız, kotasız ve yeteneksiz gelir (ödemesi durmuş
 * firma da ödediğini görür, K-T8). Yoksa çeviri akışı başlar.
 */
import {
  ceviriHataMetni,
  onizlemeCumlesi,
  tamamlanamadiBildirimi,
  type CeviriOnizleme,
  type GoruntulemeOdenmis,
  type GoruntulemeYaniti,
  type TamamlanamadiGovdesi,
  type TeklifCeviriSonucu,
} from './ceviri-kota';
import type { CeviriHaritasi } from './ceviri';

export interface CeviriAkisiBagimliliklari {
  get: (url: string, ayar: { params: Record<string, string> }) => Promise<{ data: unknown }>;
  post: (url: string, govde: Record<string, unknown>) => Promise<{ data: unknown }>;
  onay: (secenek: { title: string; description: string; confirmText: string }) => Promise<boolean>;
  bildir: (b: { title: string; description: string; variant?: 'destructive' }) => void;
  yukleniyor: (v: boolean) => void;
}

export interface CeviriAkisiSecenekleri {
  /** Onay kartına eklenecek not (Düzenle ekranı: kaydedilmemiş değişiklikler). */
  ekNot?: string;
}

/** Görüntüleme ucu. Hata ayrı döner: detay ekranı açılışta hatayı nota çevirir. */
export async function teklifGorunumuAl(
  quoteId: string,
  d: Pick<CeviriAkisiBagimliliklari, 'get'>,
): Promise<{ yanit: GoruntulemeYaniti } | { hata: unknown }> {
  try {
    const r = await d.get('/ai/translate/goruntule', { params: { quoteId } });
    return { yanit: r.data as GoruntulemeYaniti };
  } catch (e) {
    return { hata: e };
  }
}

export type IngilizceSonucu =
  | { tur: 'goruntuleme'; harita: CeviriHaritasi; yanit: GoruntulemeOdenmis }
  | { tur: 'ceviri'; harita: CeviriHaritasi; sonuc: TeklifCeviriSonucu };

/**
 * "İngilizceye Çevir": önce ödenmiş çeviriyi GÖSTER (yetenek/e-posta istemez);
 * yoksa ya da eksikse çeviri akışı. Görüntüleme hata verirse (ağ, 429) çeviri
 * akışına düşülür — sunucu aynı kanıtı yeniden sorar, ödenmiş içerik yine
 * kotasız döner; para riski yok.
 */
export async function teklifIngilizcesiniAl(
  quoteId: string,
  d: CeviriAkisiBagimliliklari,
  secenek: CeviriAkisiSecenekleri = {},
): Promise<IngilizceSonucu | null> {
  let g: { yanit: GoruntulemeYaniti } | { hata: unknown };
  d.yukleniyor(true);
  try {
    g = await teklifGorunumuAl(quoteId, d);
  } finally {
    d.yukleniyor(false);
  }
  if ('yanit' in g && g.yanit?.odenmis === true && g.yanit.tamam === true) {
    return { tur: 'goruntuleme', harita: g.yanit.harita ?? {}, yanit: g.yanit };
  }
  const sonuc = await teklifCevirisiAl(quoteId, d, secenek);
  return sonuc ? { tur: 'ceviri', harita: sonuc.harita ?? {}, sonuc } : null;
}

/**
 * Teklifi çevirir; çeviri alınamadıysa ya da kullanıcı vazgeçtiyse `null`.
 * Her ret dalı kullanıcıya NEDENİNİ söyler — sessiz `null` dönmez.
 */
export async function teklifCevirisiAl(
  quoteId: string,
  d: CeviriAkisiBagimliliklari,
  secenek: CeviriAkisiSecenekleri = {},
): Promise<TeklifCeviriSonucu | null> {
  let onizleme: CeviriOnizleme;
  d.yukleniyor(true);
  try {
    const yanit = await d.get('/ai/translate/onizleme', { params: { quoteId } });
    onizleme = yanit.data as CeviriOnizleme;
  } catch (e) {
    d.bildir({ title: 'Çeviri başlatılamadı', description: ceviriHataMetni(e), variant: 'destructive' });
    return null;
  } finally {
    d.yukleniyor(false);
  }

  if (!onizleme || onizleme.metinSayisi === 0) {
    d.bildir({
      title: 'Çevrilecek metin yok',
      description: 'Kayıtlı teklifte çevrilebilir malzeme/iş adı bulunamadı.',
    });
    return null;
  }
  if (!onizleme.epostaDogrulandi) {
    d.bildir({
      title: 'Çeviri için e-posta adresinizi doğrulayın',
      description: 'Hesabınıza gönderilen doğrulama bağlantısına tıklayın; ardından çeviriyi tekrar başlatın.',
      variant: 'destructive',
    });
    return null;
  }
  if (onizleme.suruyor) {
    d.bildir({
      title: 'Çeviri sürüyor',
      description: 'Bu teklifin çevirisi zaten sürüyor. Birkaç dakika sonra sayfayı yenileyin; aynı çeviri iki kez sayılmaz.',
    });
    return null;
  }
  if (!onizleme.izin) {
    d.bildir({
      title: 'Çeviri kotası yetmiyor',
      description: onizleme.redMesaji ?? 'Bu teklif için çeviri kotanız yetmiyor.',
      variant: 'destructive',
    });
    return null;
  }

  // Bu içeriğin çevirisi ödenmiş: kotadan düşmez, soracak bir şey yok
  // (14.09 incelemesi O1 — önizleme bunu bilmeden reddediyordu).
  if (!onizleme.tekrar) {
    const aciklama = [onizlemeCumlesi(onizleme), secenek.ekNot].filter(Boolean).join(' ');
    const onaylandi = await d.onay({ title: 'İngilizceye çevrilsin mi?', description: aciklama, confirmText: 'Çevir' });
    if (!onaylandi) return null;
  }

  d.yukleniyor(true);
  try {
    const { data } = await d.post('/ai/translate', { quoteId, hedefDil: 'en' });
    return data as TeklifCeviriSonucu;
  } catch (e) {
    // HEPSİ YA DA HİÇBİRİ (REVİZE K-T7): sunucu eksik çeviride 422 döner,
    // harita GELMEZ; iki ekran da hiçbir satırı değiştirmez.
    const govde = (e as { response?: { data?: TamamlanamadiGovdesi } })?.response?.data;
    if (govde?.kod === 'CEVIRI_TAMAMLANAMADI') {
      const b = tamamlanamadiBildirimi(govde);
      d.bildir({ title: b.baslik, description: b.aciklama, variant: 'destructive' });
    } else {
      d.bildir({ title: 'Çeviri başarısız', description: ceviriHataMetni(e), variant: 'destructive' });
    }
    return null;
  } finally {
    d.yukleniyor(false);
  }
}
