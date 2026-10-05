/**
 * "MARKAYI KÜTÜPHANEDEN KALDIR" ONAYI (P4b Parti 3, 05.10.2026 — P2 önerisi).
 *
 * Sunucu (`library.service.removeBrandFromLibrary`) firmanın o markadaki TÜM
 * kütüphane satırlarını siler (`userLibrary.deleteMany`): satırlarla birlikte
 * girilen iskonto, özel fiyat, ad düzeltmesi ve elle eklenen malzemeler gider.
 * Markayı havuzdan yeniden aktarmak satırları LİSTE fiyatıyla, iskontosuz
 * yeniden kurar — kullanıcının girdikleri geri gelmez. Eski onay yalnız
 * "kaldırılsın mı?" diye soruyordu; kaybı söylemiyordu.
 *
 * Sayı yalnız sekmelerin satır sayımından (`_count.items`) — kaç satırda
 * iskonto / özel fiyat olduğu bu ekranda bilinmez, UYDURULMAZ.
 */
import type { ConfirmOptions } from '../../ortak/hooks/use-confirm';

export function markaKaldirmaOnayi(marka: string, malzemeSayisi: number | null | undefined): ConfirmOptions {
  const ad = marka.trim();
  const kac = typeof malzemeSayisi === 'number' && Number.isFinite(malzemeSayisi) && malzemeSayisi > 0
    ? `${malzemeSayisi} malzeme silinir`
    : 'Bu markadaki tüm malzemeler silinir';
  return {
    title: ad ? `"${ad}" kütüphanenizden kaldırılsın mı?` : 'Marka kütüphanenizden kaldırılsın mı?',
    description: `${kac} — girdiğiniz iskontolar, özel fiyatlar, ad düzeltmeleri ve elle eklediğiniz malzemeler de. `
      + 'Markayı yeniden aktarmak bunları geri getirmez.',
    confirmText: 'Kaldır',
  };
}
