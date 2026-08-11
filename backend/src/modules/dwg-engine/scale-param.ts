/**
 * Frontend'den gelen `scale` query parametresini Python engine'e iletilecek
 * degere cevirir.
 *
 * SOZLESME DEGISTI — "AUTO" ARTIK GERCEKTEN AUTO:
 *   ESKI: scale gelmezse 0.001 (mm) DONERDI. Bu, Python'daki otomatik birim
 *         tespitini BYPASS ediyordu: analyze_dxf_metraj hicbir zaman scale=None
 *         goremedigi icin auto-detect dali OLU KODDU. Controller'daki
 *         "Auto-mode: scale gonderilmezse undefined birak" yorumu bu yuzden
 *         gercegi anlatmiyordu.
 *   YENI: scale gelmezse/gecersizse `undefined` doner -> Python cizim birimini
 *         KENDI OKUR (python/unit_detect.py: antet pafta olcusu + "ÖLÇEK 1/N"
 *         metni kesisimi, fizik elemesiyle daraltilir).
 *
 * Kullanici birimi bilerek ezdiginde deger yine aynen gecer — override kutsaldir.
 *
 * @returns pozitif scale carpani (mm=0.001, cm=0.01, dm=0.1, m=1.0) veya
 *          undefined (= otomatik tespit et)
 */
export function resolveScaleParam(raw?: string): number | undefined {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return undefined; // birim belirtilmedi -> Python otomatik tespit etsin
  }
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined; // gecersiz -> tahmin etmektense cizime sor
  }
  return n;
}
