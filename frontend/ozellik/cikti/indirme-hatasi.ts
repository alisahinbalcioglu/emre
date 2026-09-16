/**
 * İNDİRME HATASI METNİ — saf (Faz 6.10, 15.09.2026).
 *
 * `export-download.ts` `responseType: 'blob'` ile ister: hata gövdesi de Blob
 * gelir. Eski çözüm yalnız `message`'ı okuyordu; kota/erişim/çeviri kapısı
 * reddi Türkçe metni `mesaj` + `aciklama` alanlarında taşır (ErisimGuard 403'ü
 * `message` hiç taşımaz) ve kullanıcı "Çıktı üretilemedi." görüyordu. Metin
 * kuralı TEK yerde: `ceviriHataMetni` (`mesaj`+`aciklama` → `message` dizisi →
 * `message`). Bu modül göreli içe aktarır ki vitest ile ölçülebilsin.
 */
import { ceviriHataMetni } from '../teklif/ceviri-kota';

const VARSAYILAN = 'Çıktı üretilemedi.';

/** Blob ya da nesne hata gövdesini çözer; çözülemezse null. */
export async function hataGovdesi(e: unknown): Promise<Record<string, unknown> | null> {
  try {
    const d = (e as { response?: { data?: unknown } })?.response?.data;
    if (typeof Blob !== 'undefined' && d instanceof Blob) {
      const j = JSON.parse(await d.text());
      return j && typeof j === 'object' ? (j as Record<string, unknown>) : null;
    }
    return d && typeof d === 'object' ? (d as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Kullanıcıya gösterilecek hata metni. */
export async function hataMesaji(e: unknown): Promise<string> {
  const govde = await hataGovdesi(e);
  if (!govde) return VARSAYILAN;
  return ceviriHataMetni({ response: { data: govde }, message: VARSAYILAN });
}

/** İngilizce dosya kapısı reddi mi (çeviri yok/değişti, eksik, sürüyor). */
const CEVIRI_KODLARI = new Set(['CEVIRI_GEREKLI', 'CEVIRI_EKSIK', 'CEVIRI_SURUYOR']);

/** Bildirim başlığı: çeviri kapısı reddi "İngilizce dosya indirilemedi", diğerleri "Dışa aktarım hatası". */
export function hataBasligi(govde: Record<string, unknown> | null): string {
  return govde && typeof govde.kod === 'string' && CEVIRI_KODLARI.has(govde.kod) ? 'İngilizce dosya indirilemedi' : 'Dışa aktarım hatası';
}

/** Tek çağrıda başlık + metin. */
export async function indirmeHatasi(e: unknown): Promise<{ baslik: string; mesaj: string }> {
  const govde = await hataGovdesi(e);
  return { baslik: hataBasligi(govde), mesaj: await hataMesaji(e) };
}
