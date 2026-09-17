/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F1b — FIRMA FATURA KIMLIGININ UYEYE MASKELENMESI (§3.6, R1-D1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ YALNIZ IKI ALAN GIZLENIR: `tcKimlikNo` ve `yetkiliEposta`.
 *
 *  ILK TASARIM BES ALANI (vergiNo, vergiDairesi, faturaAdresi, faturaEposta,
 *  telefon) GIZLIYORDU ve bu OLCUMLE CURUDU: uyenin kendi ekranindan
 *  cikarabildigi teklif anteti bu bes alani ZATEN BASIYOR (`antet.ts:39-40`).
 *  Ekranda gizleyip antette basmak KOZMETIK olurdu — daha kotusu, sahibe
 *  "gizlendi" izlenimi verirdi. Dogru ayrim su:
 *    · Antette basilan alanlar FIRMANIN TICARI KIMLIGIDIR → uyeden
 *      GIZLENMEZ, yalniz DUZENLENEMEZ (duzenleme sahip kapili).
 *    · Gercekten kisisel olan: sahis sirketinde SAHIBIN T.C. kimlik no'su ve
 *      yetkili KISININ e-postasi.
 *  Ticari abonelik/fatura kayitlari ayrica KVKK disa aktariminda yalniz
 *  sahibe verilir (§3.10) — orasi baska bir kapi.
 *
 *  ⚠ UC TUKETICI AYNI FONKSIYONU CAGIRIR (ikiz yok): `auth.service.me()`,
 *  `firma.servisi.getir()`, `hesap.servisi.verileriDisaAktar()`.
 *
 *  ⚠ SUNUCU TARAFI TEKLIF CIKTISI (antet) firma alanlarini DB'den KENDISI
 *  okur; maskelemeden etkilenmez (uye teklif cikarabilmeli).
 */
import type { FirmaRol } from './uyelik-kurallari';

/** Uyeden gizlenen alanlar — TEK LISTE (on yuz metnini de bu besler). */
export const UYEDEN_GIZLI_ALANLAR = ['tcKimlikNo', 'yetkiliEposta'] as const;

export type GizliAlan = (typeof UYEDEN_GIZLI_ALANLAR)[number];

/**
 * Firma nesnesini caginin rolune gore suzer.
 *
 * `gizliAlanlar` DONER cunku on yuz "burada bir alan var ama size kapali"
 * diyebilmeli — bos bir kutu gostermek kullaniciya "firma bu bilgiyi hic
 * girmemis" dedirtir (yanlis bilgi).
 *
 * `null` firma (firmasiz hesap) aynen `null` doner.
 */
export function firmaRolaGoreSuz<T extends Record<string, unknown> | null>(
  firma: T,
  firmaRol: FirmaRol | string | null | undefined,
): T extends null ? null : T & { gizliAlanlar: GizliAlan[] } {
  if (firma === null || firma === undefined) return null as never;
  if (firmaRol === 'sahip') {
    return { ...firma, gizliAlanlar: [] } as never;
  }
  const suzulmus: Record<string, unknown> = { ...firma };
  for (const alan of UYEDEN_GIZLI_ALANLAR) {
    if (alan in suzulmus) suzulmus[alan] = null;
  }
  suzulmus.gizliAlanlar = [...UYEDEN_GIZLI_ALANLAR];
  return suzulmus as never;
}
