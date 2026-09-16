/**
 * FİRMA ÇEVİRİ DÜZELTMESİ — istemci tarafı (Faz 6.9, 16.09.2026).
 *
 * Bağımlılıklar parametreyle gelir (`ceviri-akisi.ts` deseni): ekran olmadan
 * birim testle ölçülebilsin. Gövde YALNIZ `{ quoteId, kaynak, ceviri, hedefDil }`
 * taşır — firma oturumdan gelir, istemci firma seçemez.
 *
 * ⚠ ÇEVİRİ KURALI BURADA YAZILMAZ (K21): hangi satırın çevrileceği (dokunulmaz
 * ölçü/kod ayrımı) sunucunun kuralıdır; ekran yalnız sunucunun verdiği anahtar
 * kümesini kullanır.
 */
import { ceviriHataMetni } from './ceviri-kota';

export interface DuzeltmeBagimliliklari {
  get: (url: string, ayar: { params: Record<string, string> }) => Promise<{ data: unknown }>;
  put: (url: string, govde: Record<string, unknown>) => Promise<{ data: unknown }>;
  delete: (url: string) => Promise<{ data: unknown }>;
}

export interface DuzeltmeGorunumu {
  /** Teklifin kayıtlı çevrilebilir metinleri — kalem işareti YALNIZ bunlarda (K-T2). */
  anahtarlar: Set<string>;
  /** Anahtar → firmanın karşılığı. */
  duzeltmeler: Map<string, { id: string; ceviri: string }>;
  /** Yetenek kapalıysa (ödemesi durmuş firma) ekran işaret çizmez. */
  duzeltmeAcik: boolean;
}

interface SunucuYaniti {
  anahtarlar?: unknown;
  duzeltmeler?: Array<{ id?: unknown; kaynak?: unknown; ceviri?: unknown }>;
  duzeltmeAcik?: unknown;
}

const YOL = '/ai/translate/duzeltmeler';

/** Teklifin anahtar kümesi + firmanın karşılıkları. Hata yukarı fırlar. */
export async function duzeltmeleriGetir(quoteId: string, d: Pick<DuzeltmeBagimliliklari, 'get'>): Promise<DuzeltmeGorunumu> {
  const r = await d.get(YOL, { params: { quoteId } });
  const y = (r?.data ?? {}) as SunucuYaniti;
  const anahtarlar = new Set<string>(Array.isArray(y.anahtarlar) ? y.anahtarlar.map((a) => String(a)) : []);
  const duzeltmeler = new Map<string, { id: string; ceviri: string }>();
  for (const s of Array.isArray(y.duzeltmeler) ? y.duzeltmeler : []) {
    if (typeof s?.kaynak !== 'string' || typeof s?.ceviri !== 'string' || typeof s?.id !== 'string') continue;
    duzeltmeler.set(s.kaynak, { id: s.id, ceviri: s.ceviri });
  }
  return { anahtarlar, duzeltmeler, duzeltmeAcik: y.duzeltmeAcik === true };
}

/** Ekle ya da güncelle. Dönen `degisti: false` → aynı değer, yazılmadı. */
export async function duzeltmeKaydet(
  g: { quoteId: string; kaynak: string; ceviri: string },
  d: Pick<DuzeltmeBagimliliklari, 'put'>,
): Promise<{ id: string; kaynak: string; ceviri: string; degisti: boolean }> {
  const r = await d.put(YOL, { quoteId: g.quoteId, kaynak: g.kaynak, ceviri: g.ceviri, hedefDil: 'en' });
  return r.data as { id: string; kaynak: string; ceviri: string; degisti: boolean };
}

/** Firma karşılığını kaldırır — ortak karşılık okumada yeniden görünür. */
export async function duzeltmeKaldir(id: string, d: Pick<DuzeltmeBagimliliklari, 'delete'>): Promise<{ kaldirildi: boolean; kaynak: string }> {
  const r = await d.delete(`${YOL}/${id}`);
  return r.data as { kaldirildi: boolean; kaynak: string };
}

/**
 * Hata metni: gövde tavanı ve hız sınırı İngilizce JSON döner (Ö3 H4b), onları
 * durum koduyla Türkçeye çeviririz; kalanlar sunucunun `mesaj`/`aciklama`sından.
 */
export function duzeltmeHataMetni(e: unknown): string {
  const hata = e as { response?: { status?: number; data?: { kod?: unknown } } };
  const durum = hata?.response?.status;
  const kod = hata?.response?.data?.kod;
  if (durum === 413) return 'Metin çok uzun: en fazla 2.000 karakter.';
  if (kod === 'DUZELTME_GUNLUK_TAVAN') return ceviriHataMetni(e);
  if (durum === 429) return 'Çok sık denendi; bir dakika sonra tekrar deneyin.';
  return ceviriHataMetni(e);
}
