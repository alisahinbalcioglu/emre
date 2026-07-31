/**
 * PK6 — SAYI AYRISTIRMA: iki AYRI islev, iki AYRI girdi sinifi.
 *
 * Bu dosya `verify.mjs`ten AYRILDI ki test edilebilsin (31.07.2026).
 * Kok neden hatirlatmasi: ayni fonksiyonu iki girdi sinifina uygulamak,
 * 31.07'de 3 FAIL uretti ("323308.125" → 323 MILYON).
 *
 *   num()    → INSAN YAZIMI metin (Excel hucre GORUNUMU, baslik, ozet,
 *              kur notu). Orada "1.234" BIN IKI YUZ OTUZ DORT demektir.
 *   numHam() → MAKINE degeri (payload/grid alanlari: _matToplam, _labBirim…).
 *              Orada nokta HER ZAMAN ondalik ayiricidir; JS'in urettigi
 *              "134534.40000000002" gibi dizeler gelir.
 *
 * Yanlis olani secmek SESSIZ bozar — sayi yine cikar, sadece 1000 kat yanlis.
 */

/** INSAN YAZIMI metin: nokta+tam 3 rakam+son = TR binlik ayirici, atilir. */
export const num = (s) => {
  if (typeof s === 'number') return s;
  const m = String(s ?? '').replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const f = parseFloat(m);
  return isNaN(f) ? null : f;
};

/** MAKINE degeri: nokta HER ZAMAN ondalik. Virgul varsa kullanici bicimidir. */
export const numHam = (s) => {
  if (typeof s === 'number') return isFinite(s) ? s : null;
  const t = String(s ?? '').replace(/[₺$€\s]/g, '').trim();
  if (!t) return null;
  // ⚠ METIN FIYAT ALANINDA OLABILIR. 03-bursa Elektrik'te `_matBirim` urun
  // tarifi tasiyor: "35x240mm Üç bölmeli döşeme kanalı". Rakamlari suzen bir
  // parser bundan 35240 uretiyor ve "ciktida yok" diye HAYALET kayip veriyor.
  // Kural: alan SAYI GIBI DEGILSE sayi degildir.
  if (!/^-?[\d.,]+$/.test(t)) return null;
  const m = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const f = parseFloat(m);
  return isNaN(f) ? null : f;
};

/** PK6: payload/grid alan adlari — bunlar MAKINE degeridir, `num()` ile
 *  okunamaz. Kaynak tarayan test bu listeyi kullanir. */
export const PAYLOAD_ALANLARI = [
  '_matBirim', '_matToplam', '_labBirim', '_labToplam',
  '_toplam', '_matNetPrice', '_labNetPrice', '_miktar',
];
