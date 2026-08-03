/**
 * EKIPMAN POPUP'I — ACILIS SEKMESI (saf, test edilebilir kural).
 *
 * NEDEN AYRI DOSYA: kural `EquipmentDetailPopup.tsx` icinde satir ici
 * yasarken hicbir test onu goremiyordu — bu repoda vitest `.tsx`
 * ayristirmiyor (JSX eklentisi yok; mevcut testlerin hepsi saf `.ts`
 * modul). Kural disari alininca kirmizi-once kapiyla muhurlenebiliyor.
 * Ayni gerekce `fill-down.ts` icin de gecerliydi.
 */
import type { MarkedEquipment } from './types';

/**
 * Popup acilirken hangi sekme aktif gelir.
 *
 * Ayirt edici `libraryItemId`: kutuphaneden secilince dolu, manuel
 * girilince null yazilir (`types.ts:42-44` — "Manuel girilen ekipmanlarda
 * hepsi null").
 *
 * ⚠ `existing`in VARLIGI ayrica kontrol edilir. `existing?.libraryItemId ?
 * 'library' : 'manual'` seklinde kisaltilirsa YENI isaretleme (existing
 * undefined) de manuel moda duser ve `EquipmentDetailPopup.tsx` bas
 * yorumundaki "Kutuphane modu (default)" sozlesmesi bozulur.
 */
export function ilkMod(existing?: Pick<MarkedEquipment, 'libraryItemId'>): 'library' | 'manual' {
  if (!existing) return 'library';               // yeni isaretleme → varsayilan
  return existing.libraryItemId ? 'library' : 'manual';
}
