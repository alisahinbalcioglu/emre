/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAKET DEĞİŞİMİ — ekran kararları (23.09.2026, yönetici paneli turu A1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  SAF, React'siz. Kararın KENDİSİ sunucudadır (`backend/.../paket-degisimi.ts`
 *  → `paketDegisimYolu`); bu modül yalnız onun sonucunu (`degisim` alanı) karta
 *  ve onay penceresine çevirir. Ön yüz "yükseltme mi düşürme mi" SORUSUNU
 *  CEVAPLAMAZ — cevabı sunucudan okur. Aksi hâlde ekran "hemen açılır" deyip
 *  sunucu dönem sonuna planlayabilirdi.
 *
 *  ── NEDEN (ölçülen kusur, 23.09) ───────────────────────────────────────────
 *  Aboneliği olan müşteri başka bir kartta "Bu paketi seç"e basıyor, fatura
 *  formunu baştan doldurup sözleşmeyi onaylıyor, "Ödemeye geç"e basıyor ve
 *  ANCAK O ZAMAN "zaten aboneliğiniz var, yükseltme yolunu kullanın" alıyordu.
 *  O yol YOKTU.
 */
import { trTarih } from '../teklif/ceviri-kota';
import { tutarYaz } from './paket-bicim';

/** Sunucudaki `DegisimOzeti` (backend paket-degisimi.servisi.ts) ile AYNI biçim. */
export type DegisimOzeti =
  | { yol: 'satin-al' }
  | { yol: 'degistir'; zamanlama: 'hemen' | 'donem-sonu'; beklenenTarih: string }
  | { yol: 'yok'; kod: string; mesaj: string };

/** `ErisimKarari.paketGecisi` (backend erisim.servisi.ts) — bekleyen değişim. */
export interface PaketGecisi {
  tarih: string;
  planliPaket: { kod: string; ad: string } | null;
}

export type KartEylemi =
  | { tur: 'mevcut' }
  | { tur: 'sahip-degil' }
  | { tur: 'satin-al' }
  | { tur: 'degistir'; zamanlama: 'hemen' | 'donem-sonu'; beklenenTarih: string }
  | { tur: 'kapali'; mesaj: string };

/**
 * Bu kart şu an MEVCUT paket mi?
 *
 * ⚠ SUNUCU SÖYLÜYORSA SUNUCU (`AYNI_PAKET`). Eski kural "`erisim.paketKodu`
 * ile eşit mi" idi ve SÜRESİ BİTMİŞ aboneliğin paketini de "Mevcut paketiniz"
 * diye KİLİTLİYORDU: `ErisimKarari.paketKodu` SONA_ERDI satırında da doludur
 * (ölçüldü: `erisim.servisi.ts` `temel`), yani aboneliği biten müşteri eski
 * paketini YENİDEN SATIN ALAMIYORDU. Sunucu o satıra "satin-al" der.
 * `degisim` yoksa (eski sunucu) eski kural geçerli — geriye dönük uyum.
 */
export function mevcutPaketMi(
  p: { kod: string; degisim?: DegisimOzeti },
  mevcutPaketKodu: string | null,
): boolean {
  if (p.degisim) return p.degisim.yol === 'yok' && p.degisim.kod === 'AYNI_PAKET';
  return !!mevcutPaketKodu && p.kod === mevcutPaketKodu;
}

/**
 * Kartın düğmesi ne yapar? Sıra bilinçli:
 *   1. mevcut paket → hiçbir eylem (herkes için aynı rozet)
 *   2. sahip değil → sunucu `FirmaRolGuard` ile reddeder; düğme ÇİZİLMEZ
 *   3. sunucunun yolu (satın al / geç / neden geçilemez)
 */
export function kartEylemi(
  p: { kod: string; degisim?: DegisimOzeti },
  g: { mevcutMu: boolean; sahipMi: boolean },
): KartEylemi {
  if (g.mevcutMu) return { tur: 'mevcut' };
  if (!g.sahipMi) return { tur: 'sahip-degil' };
  const d = p.degisim;
  if (!d || d.yol === 'satin-al') return { tur: 'satin-al' };
  if (d.yol === 'degistir') {
    return { tur: 'degistir', zamanlama: d.zamanlama, beklenenTarih: d.beklenenTarih };
  }
  // AYNI_PAKET buraya ancak `mevcutMu` yanlış hesaplanırsa düşer; yine de
  // "geçilemez" demek yerine eylemsiz bırakılır.
  if (d.kod === 'AYNI_PAKET') return { tur: 'mevcut' };
  return { tur: 'kapali', mesaj: d.mesaj };
}

/**
 * Onay penceresindeki açıklama — sunucunun e-postada/olay kaydında yazacağı
 * cümlenin (`degisimCumlesi`) "değişimden ÖNCE" hâli. Müşteri neyin NE ZAMAN
 * olacağını ve NE KADAR ödeyeceğini onaydan ÖNCE görür.
 */
export function degisimOnayMetni(g: {
  zamanlama: 'hemen' | 'donem-sonu';
  yeniPaketAdi: string;
  yeniTutar: string;
  paraBirimi: string;
  beklenenTarih: string;
}): string {
  const tarih = trTarih(g.beklenenTarih) || 'dönem sonunda';
  const ucret = `${tutarYaz(g.yeniTutar, g.paraBirimi)} (KDV dahil)`;
  return g.zamanlama === 'hemen'
    ? `${g.yeniPaketAdi} paketinin özellikleri hemen açılır. Yeni aylık ücret ${ucret}, ` +
        `${tarih} tarihinden itibaren kartınızdan çekilir; bu dönem için ek ücret alınmaz.`
    : `${g.yeniPaketAdi} paketine geçişiniz mevcut döneminizin sonunda (${tarih}) yapılır. ` +
        `O tarihe kadar mevcut paketinizin özellikleri açık kalır; yeni aylık ücret ${ucret} ` +
        'o tarihten itibaren çekilir.';
}

/**
 * "Şu anki paketiniz" satırının altındaki bekleyen değişim cümlesi. `null` =
 * bekleyen değişim yok (satır çizilmez).
 */
export function bekleyenDegisimCumlesi(g: PaketGecisi | null | undefined): string | null {
  if (!g) return null;
  const tarih = trTarih(g.tarih);
  if (!tarih) return null;
  return g.planliPaket
    ? `${tarih} tarihinde ${g.planliPaket.ad} paketine geçilecek. O tarihe kadar mevcut paketinizin özellikleri açık.`
    : `Yeni aylık ücretiniz ${tarih} tarihinden itibaren geçerli. Bu dönem içinde yeni bir paket değişikliği yapılamaz.`;
}
