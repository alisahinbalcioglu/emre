// ════════════════════════════════════════════════════════════════════
// AILE SOZCUK DAGARCIGI (v2)
//
// Bir teklif token'inin hangi KOLONU kisitladigini bilmek sart. Yoksa:
//   "DİLATASYON KOMPANSATÖRÜ DN25 ÖRGÜLÜ"
// satirinda 'orgulu' (bir CINS kelimesi) Ad kisiti sanilir → sifir sonuc.
//
// Dagarcik SABIT LISTE DEGILDIR — o marka + o ailenin INDEKSINDEN uretilir.
// Yani sistem kelimeleri kullanicinin kendi kataloğundan ogrenir; biz
// elle sozluk bakimi yapmayiz.
// ════════════════════════════════════════════════════════════════════

import type { IndexedRow, FamilyVocab } from './types';

/**
 * Havuzdaki urunlerin kolon token'larindan dagarcik kurar.
 * @param rows  YALNIZ ilgili aile + marka havuzu (Seviye1 kilidi sonrasi)
 */
export function buildFamilyVocab(rows: IndexedRow[]): FamilyVocab {
  const ad = new Set<string>();
  const cins = new Set<string>();
  const baglanti = new Set<string>();
  for (const r of rows) {
    for (const t of r.urun.adTokens) ad.add(t);
    for (const t of r.urun.cinsTokens) cins.add(t);
    for (const t of r.urun.baglantiTokens) baglanti.add(t);
  }
  return { ad, cins, baglanti };
}

/** Bir kolonun havuzdaki farkli deger sayisi — soru gerekli mi? (K3) */
export function distinctSayisi<T>(rows: IndexedRow[], sec: (r: IndexedRow) => T): number {
  const s = new Set<T>();
  for (const r of rows) s.add(sec(r));
  return s.size;
}
