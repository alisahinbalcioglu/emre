/**
 * Cizim birimi bayatligi (saf).
 *
 * Hesaplanmis layer'in uzunluklari METRE cinsinden DONDURULMUS sayilardir.
 * Birim (metre carpani) sonradan degisirse eski satirlar ile yenileri ayni
 * teklifte 10x farkla UYARISIZ toplanirdi. 25.09'a dek cozum hesaplanan
 * layer'lari TAMAMEN dusurmekti (etiketlerle birlikte). Artik her layer kendi
 * birimini tasir (`scaleUsed`); birimi uyusmayan layer BAYATTIR: onaylanamaz,
 * fiyatlandirmaya gitmez, "Yeniden ayir" ister — etiketler aktarilir.
 */

/** Iki metre carpani ayni mi — goreli tolerans (eski `_loadState` kurali). */
export function ayniOlcek(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) / b <= 1e-6;
}

/** Hesap, SIMDIKI birimle yapilmamis mi? `scaleUsed` yoksa bayat SAYILMAZ:
 *  eski kayitlara yukleme aninda kaydin kendi birimi yazilir. */
export function birimBayatMi(cl: { scaleUsed?: number }, scale: number): boolean {
  if (cl.scaleUsed === undefined) return false;
  return !ayniOlcek(cl.scaleUsed, scale);
}

/** "Bolmeden" hesapta motor her cizgiyi TEK parca alir; parcalama birimden
 *  BAGIMSIZDIR (dugum toleransi hic kullanilmaz). Birim degisince yeniden
 *  ayirmaya gerek yok — uzunluklar yerelde olceklenir. */
export function yerelOlceklenebilir(cl: { splitMode?: 't' | 'none' }): boolean {
  return cl.splitMode === 'none';
}

/** Birim degisince yarida kalan ILK ayirma (layer henuz hesaplanmamisti). */
export interface KesilenAyirma {
  layer: string;
  splitMode: 't' | 'none';
}

/** Kaydet aninda motorda suren is ILK ayirma mi (layer henuz hesaplanmamis)?
 *  Oyleyse yeni birimle yeniden baslatilmak uzere dondurulur. Suren is
 *  yeniden ayirmaysa `null`: o layer bayat listesiyle gelir. */
export function yarimKalanAyirma(
  ayrilan: string | null,
  hesaplananlar: Readonly<Record<string, unknown>>,
  yontem: 't' | 'none',
): KesilenAyirma | null {
  return ayrilan && !hesaplananlar[ayrilan] ? { layer: ayrilan, splitMode: yontem } : null;
}

/**
 * Birim degisimi sonrasi yeniden ayirma SIRASI (tekrarsiz):
 *  1. yarida kalan ilk ayirma — kullanicinin su an bekledigi is. EN BASTA
 *     olmali: ikinci bir birim degisiminde ya hala suruyordur (yine
 *     yakalanir) ya bitmistir (bayat listesiyle gelir) — KAYBOLMAZ. 25.09
 *     inceleme: sona eklenince ona sira gelmeden gelen ikinci degisim onu
 *     sessizce dusuruyordu;
 *  2. secili layer — ekrandaki "≈" sayilar once kesinlesir (canlida secili
 *     layer 2. siradaydi, 46 sn bekledi);
 *  3. digerleri gelis sirasiyla.
 */
export function yenidenAyirmaSirasi(
  bayat: readonly string[],
  secili: string | null,
  kesilen: KesilenAyirma | null,
): string[] {
  const one: string[] = [];
  if (kesilen) one.push(kesilen.layer);
  if (secili && bayat.includes(secili) && !one.includes(secili)) one.push(secili);
  return [...one, ...bayat.filter((l) => !one.includes(l))];
}
