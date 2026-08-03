// ============================================================
// MetaPrice — Fiyat Atama Kurallari (fiyatlandirma cekirdegi)
// Kaynak: kullanici spec'i 2026-07-08. Frontend esi: frontend/lib/pricing.ts
// Iki dosya AYNI kurallari tasimali — degistirirken ikisini de guncelle.
// ============================================================
//
// ASAMA A — KUTUPHANE: Liste --(iskonto%)--> Net (alis). Cevrim YOK.
// ASAMA B — TEKLIF:    Net (teklif birimine cevrilmis) --(kar%)--> Satis.
// ALTIN KURAL: fiyat ASLA uretilmez; eslesme yoksa hucre bos + isaretli.

/** Yuvarlama: YUKARI, virgulden sonra TEK hane. */
export const ONDALIK = 1;

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Yukari yuvarlama (1 hane). Float epsilonu: 1.1*10=11.000000000000002
 *  gibi ikili artiklarin degeri bir ust dilime tasimasini onler.
 *
 *  ⚠ EPSILON ORANTILI (canli bulgu 03.08) — sabit `1e-9`, |y| yaklasik 4,5
 *  milyonu asinca double'in kendi ulp'unun altinda kalir ve islevsizlesir;
 *  12200 × ₺152,30 satiri ₺1.858.060,10 yaziyordu, dogrusu ₺1.858.060,00.
 *  `Math.ceil` oldugu icin sapma her zaman YUKARI idi.
 *
 *  Frontend esi `frontend/lib/pricing.ts` ile BIREBIR AYNI olmak ZORUNDA —
 *  ikisi birlikte guncellenir. Gerekce ve kapi orada ayrintili yazili. */
export function yukariYuvarla(x: number, hane = ONDALIK): number {
  const k = 10 ** hane;
  const y = x * k;
  const eps = Math.max(1e-9, Math.abs(y) * Number.EPSILON * 4);
  const r = Math.ceil(y - eps) / k;
  return r === 0 ? 0 : r; // -0 normalize (epsilon sifiri eksiye itebilir)
}

/** ASAMA A: Liste fiyatina TEK iskonto → NET (alis). Listenin biriminde.
 *  hesaplaNetFiyat(3354.64, 10) === 3019.2 ; iskonto 0 → net = liste. */
export function hesaplaNetFiyat(listeFiyat: number, iskontoYuzde: number): number {
  const oran = clamp(iskontoYuzde, 0, 100) / 100;
  return yukariYuvarla(listeFiyat * (1 - oran));
}

// NOT (denetim 22.07): hesaplaSatisBirimFiyat + hesaplaSatirToplam BE
// kopyalari SILINDI — satis/satir hesabi yalniz FE'de yapilir
// (frontend/lib/pricing.ts, testli canli kopya). BE yalniz NET fiyat hesaplar.
