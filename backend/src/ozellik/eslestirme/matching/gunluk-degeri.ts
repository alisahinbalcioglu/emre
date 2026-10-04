/**
 * GUNLUGE GIDEN KULLANICI DEGERI (P4 notu 1, 04.10.2026).
 *
 * Eslestirme gunlukleri kullanicinin yazdigi metni tasir: Excel satir adi,
 * secilen urun adi, marka kimligi (`brandId` DTO'da yalniz "bos olmayan
 * metin" diye dogrulanir). Excel hucresi SATIR SONU icerebilir; ham
 * yazildiginda tek kayit ikiye bolunur ve ikinci satir "[Matching] …" diye
 * baslayan SAHTE bir kayit olur (gunluk sahteciligi). Nest `Logger`a cevirmek
 * bunu COZMEZ — o da metni oldugu gibi basar; cozum degerin kacislanmasidir.
 *
 * Kural: deger tirnak icinde, kontrol karakterleri (CR/LF dahil, C1 ve
 * U+2028/2029 satir ayiricilari) `\uXXXX` olarak; tirnak ve ters bolu
 * kacislanir. Asiri uzun deger kirpilir (gunluk seli olmasin) ve kirpildigi
 * SOYLENIR. Kapi: test/p4-motor-notlari-test.ts (G blogu).
 */
const KONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029"\\]/g;

export function gunlukDegeri(deger: unknown, azami = 160): string {
  const s = String(deger ?? '');
  const kisa = s.length > azami ? s.slice(0, azami) : s;
  const kacisli = kisa.replace(KONTROL, (c) => {
    if (c === '"') return '\\"';
    if (c === '\\') return '\\\\';
    return `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
  return `"${kacisli}"${s.length > azami ? `…(+${s.length - azami})` : ''}`;
}
