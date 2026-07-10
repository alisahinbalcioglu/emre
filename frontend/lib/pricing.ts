// ============================================================
// MetaPrice — Fiyat Atama Kurallari (fiyatlandirma cekirdegi)
// Kaynak: kullanici spec'i 2026-07-08. Backend esi:
// backend/src/modules/matching/pricing.ts — AYNI kurallar, ikisini birlikte guncelle.
// ============================================================
//
// ASAMA A — KUTUPHANE: Liste --(iskonto%)--> Net (alis). Cevrim YOK.
// ASAMA B — TEKLIF:    Net (teklif birimine cevrilmis) --(kar%)--> Satis.
//                      Satis × Miktar = Satir Toplami.
// ALTIN KURAL: fiyat ASLA uretilmez; eslesme yoksa hucre bos + isaretli.

/** Yuvarlama: YUKARI, virgulden sonra TEK hane. */
export const ONDALIK = 1;

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Yukari yuvarlama (1 hane). Float epsilonu: 1.1*10=11.000000000000002
 *  gibi ikili artiklarin degeri bir ust dilime tasimasini onler. */
export function yukariYuvarla(x: number, hane = ONDALIK): number {
  const k = 10 ** hane;
  const r = Math.ceil(x * k - 1e-9) / k;
  return r === 0 ? 0 : r; // -0 normalize (epsilon sifiri eksiye itebilir)
}

/** ASAMA A: Liste fiyatina TEK iskonto → NET (alis). Listenin biriminde.
 *  hesaplaNetFiyat(3354.64, 10) === 3019.2 ; iskonto 0 → net = liste. */
export function hesaplaNetFiyat(listeFiyat: number, iskontoYuzde: number): number {
  const oran = clamp(iskontoYuzde, 0, 100) / 100;
  return yukariYuvarla(listeFiyat * (1 - oran));
}

/** ASAMA B: Net (teklif biriminde) + kar% → SATIS birim.
 *  Kar 0 → satis = net (1 haneye yukari). Cevrim yapmaz. */
export function hesaplaSatisBirimFiyat(netTeklifParaBirimi: number, karYuzde: number): number {
  const oran = Math.max(0, karYuzde) / 100;
  return yukariYuvarla(netTeklifParaBirimi * (1 + oran));
}

/** Satir toplami = satis birim × miktar. */
export function hesaplaSatirToplam(satisBirimFiyat: number, miktar: number): number {
  return yukariYuvarla(satisBirimFiyat * miktar);
}
