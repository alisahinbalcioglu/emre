/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  IYZICO BARINDIRILAN FORMU — betikleri CALISTIRILABILIR hale getirir
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU DOSYA NEDEN VAR (02.09'da canli tarayici turunda olculdu)
 *
 *  Fatura formu dolduruldu, uc `checkoutFormContent` dondu, sayfa
 *  "Odeme" basligini cizdi — ve ALTI BOMBOS KALDI. Kart formu HIC gorunmedi.
 *
 *  Sebep: sayfa iceriği soyle basiyordu
 *      <div dangerouslySetInnerHTML={{ __html: formHtml }} />
 *  ve yanindaki yorum "iyzico'nun formu KENDI SCRIPT'INI CALISTIRIR" diyordu.
 *  **Bu yorum yanlisti.** HTML spesifikasyonu geregi `innerHTML` ile eklenen
 *  `<script>` etiketleri ASLA YURUTULMEZ (parser-inserted olmadiklari icin).
 *  iyzico'nun donen icerigi ise neredeyse tamamen bir `<script>` blogudur —
 *  formu o betik cizer. Yani DOM'a metin girdi, hicbir sey calismadi.
 *
 *  Bu, gun icinde ucuncu kez ayni desen: mekanizma KODDA var, YOLU yok.
 *
 *  ── COZUM ──────────────────────────────────────────────────────────────
 *  Betikler ayiklanir, govde `innerHTML` ile basilir, sonra HER betik icin
 *  `document.createElement('script')` ile GERCEK bir eleman uretilip
 *  eklenir — boyle eklenen betik yurutulur.
 *
 *  ── NEDEN SAF FONKSIYON ────────────────────────────────────────────────
 *  Projede jsdom yok (vitest ortami `node`). Isin ZOR kismi (ayiklama)
 *  saf tutuldu ki DOM'suz OLCULEBILSIN; DOM'a dokunan kisim ince ve
 *  bariz bir katman olarak kaldi.
 */

export interface AyiklananBetik {
  /** Haricî betik adresi; satir-ici betiklerde yoktur. */
  src?: string;
  /** `type` niteligi (orn. "text/javascript"); yoksa tanimsiz. */
  tur?: string;
  /** Satir-ici betigin govdesi. Haricî betiklerde bos olur. */
  icerik: string;
}

export interface AyiklamaSonucu {
  /** Betikleri CIKARILMIS govde — `innerHTML` ile guvenle basilabilir. */
  govde: string;
  /** Sirasi KORUNMUS betikler. iyzico'da sira onemlidir. */
  betikler: AyiklananBetik[];
}

/** `<script ...>...</script>` bloklarini yakalar (govde cok satirli olabilir). */
const BETIK_DESENI = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

function nitelikOku(nitelikler: string, ad: string): string | undefined {
  const m = new RegExp(`${ad}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(
    nitelikler,
  );
  return m ? (m[2] ?? m[3]) : undefined;
}

/**
 * HTML icindeki betikleri govdeden AYIRIR. SAF fonksiyon.
 *
 * ⚠ Bu bir guvenlik suzgeci DEGILDIR ve oyle kullanilmamalidir. Girdi
 * yalnizca kendi sunucumuzun iyzico'dan alip aktardigi icerik olabilir.
 */
export function betikleriAyikla(html: string): AyiklamaSonucu {
  if (!html) return { govde: '', betikler: [] };

  const betikler: AyiklananBetik[] = [];
  const govde = html.replace(BETIK_DESENI, (_tam, nitelikler: string, icerik: string) => {
    betikler.push({
      src: nitelikOku(nitelikler, 'src'),
      tur: nitelikOku(nitelikler, 'type'),
      icerik,
    });
    return '';
  });

  return { govde, betikler };
}

/**
 * Ayiklanan betigi CALISTIRILABILIR bir DOM elemanina cevirir.
 *
 * `innerHTML` ile gelen `<script>` yurutulmez; `createElement` ile
 * uretilip DOM'a eklenen yurutulur. Fark tam olarak budur.
 */
export function betigiElemanaCevir(
  betik: AyiklananBetik,
  belge: Document,
): HTMLScriptElement {
  const eleman = belge.createElement('script');
  if (betik.src) eleman.src = betik.src;
  if (betik.tur) eleman.type = betik.tur;
  // Harici betiklerde govde bos; satir-ici olanlarda kodun kendisi.
  if (!betik.src) eleman.text = betik.icerik;
  // iyzico betikleri SIRAYLA calismali — async KAPALI.
  eleman.async = false;
  return eleman;
}

/**
 * Kabi temizler, govdeyi basar, betikleri CALISTIRILABILIR sekilde ekler.
 * DOM'a dokunan TEK yer burasi.
 */
export function iyzicoFormunuBas(kap: HTMLElement, html: string): void {
  const { govde, betikler } = betikleriAyikla(html);
  kap.innerHTML = govde;
  const belge = kap.ownerDocument ?? document;
  for (const b of betikler) kap.appendChild(betigiElemanaCevir(b, belge));
}
