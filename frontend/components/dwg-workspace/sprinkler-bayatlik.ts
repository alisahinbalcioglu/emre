/**
 * Sprinkler işaretleme bayatlığı tespiti.
 *
 * NEDEN VAR (PANOVA vakası, 11.08): kullanıcı SPRİNK layer'ını 💧 ile
 * işaretledi, ama boru layer'ı İŞARETTEN ÖNCE hesaplanmıştı. İşaret yalnız
 * hesap ANINDA motora gider; mevcut hesap SESSİZCE bayat kaldı ve kullanıcı
 * "sprinkler'da bölmüyor" diye yaşadı — oysa motor işareti alınca 494 yerine
 * 1474 segmente bölüyordu (ölçüldü). Sessiz bayatlık yasak: hesap anındaki
 * işaret anlığı kayda geçer, şimdiki işaretle uyuşmuyorsa bant uyarır.
 */

/** Hesaplanmış layer'ın kaydı bu karşılaştırma için yeterli alt kümesi. */
export interface SprinklerAnligiTasiyan {
  /** Hesap ANINDA motora gönderilen sprinkler işaretli layer'lar.
   *  undefined = bu alan eklenmeden ÖNCE hesaplanmış (miras kayıt). */
  sprinklerLayersUsed?: string[];
}

/** İki işaret kümesi aynı mı? (sıra ve tekrar duyarsız)
 *  NOT: Set üzerinde for-of yok — tsconfig target'ı downlevelIteration
 *  gerektiriyor; Array.from ile geziliyor. */
function ayniKume(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  return Array.from(sa).every((x) => sb.has(x));
}

/**
 * Bu hesap, şimdiki sprinkler işaretlemesiyle bayat mı?
 *
 * Miras kayıt (alan yok) kuralı: şimdiki işaret BOŞSA bayat sayılmaz
 * (işaretsiz hesap × işaretsiz şimdi = uyumlu); işaret VARSA bayat sayılır —
 * eski hesabın o işaretle yapılmadığı kesin olmasa da, "belki bayat"ı
 * sessizce geçmek PANOVA'daki kör noktanın kendisidir.
 */
export function sprinklerIsaretiBayat(
  cl: SprinklerAnligiTasiyan,
  simdikiIsaretler: string[],
): boolean {
  if (cl.sprinklerLayersUsed === undefined) {
    return simdikiIsaretler.length > 0;
  }
  return !ayniKume(cl.sprinklerLayersUsed, simdikiIsaretler);
}
