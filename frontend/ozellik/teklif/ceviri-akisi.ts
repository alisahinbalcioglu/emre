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
 */
import {
  ceviriHataMetni,
  onizlemeCumlesi,
  type CeviriOnizleme,
  type TeklifCeviriSonucu,
} from './ceviri-kota';

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

  // Aynı içerik az önce çevrildi: kotadan düşmez, soracak bir şey yok
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
    d.bildir({ title: 'Çeviri başarısız', description: ceviriHataMetni(e), variant: 'destructive' });
    return null;
  } finally {
    d.yukleniyor(false);
  }
}
