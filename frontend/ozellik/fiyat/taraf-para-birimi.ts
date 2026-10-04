/**
 * COKLU PARA BIRIMI — TARAF PARA BIRIMI saf kurallari (F2a, Emre karari 04.10).
 *
 * Para birimi SATIR degil TARAF basinadir: ayni satirda malzeme $ (dovizli
 * fiyat listesi) ve iscilik ₺ olabilir. Taraf birimi satir verisinde
 * `_matPB` / `_labPB` alaninda durur; alan YOKSA TRY (eski ve yalniz-TL
 * teklifler hic birim tasimaz — davranislari degismez).
 *
 * Kararlar:
 *  1) Karma satirin Toplam hucresi iki tutari yan yana gosterir
 *     ("$1.200,00 + ₺450,00").
 *  3) Elle yazilan fiyat tarafin MEVCUT birimini korur; "$12"/"₺12"/"€12"
 *     yazimi birimi acikca secer.
 *  4) Doviz 2 hane YUKARI; ₺ kurali (1 hane yukari) DEGISMEZ.
 *
 * Gosterim sayi dili `paraBicim` (pricing.ts) — tek kaynak.
 */
import { ONDALIK, kurusTamsayi, paraBicim } from './pricing';

export type ParaBirimi = 'TRY' | 'USD' | 'EUR';

export const PARA_SEMBOLU: Record<ParaBirimi, string> = { TRY: '₺', USD: '$', EUR: '€' };

const GECERLI = new Set<string>(['TRY', 'USD', 'EUR']);

/** Karar 4: dovizde 2 hane, ₺'de bugunku 1 hane (birim yoksa ₺). */
export function paraHanesi(pb?: ParaBirimi | null): number {
  return pb === 'USD' || pb === 'EUR' ? 2 : ONDALIK;
}

/** Satirin TARAF birimi; alan yoksa ya da taninmiyorsa TRY. */
export function tarafPB(d: unknown, dal: 'malzeme' | 'iscilik'): ParaBirimi {
  const ham = (d as Record<string, unknown> | null | undefined)?.[dal === 'iscilik' ? '_labPB' : '_matPB'];
  return typeof ham === 'string' && GECERLI.has(ham) ? (ham as ParaBirimi) : 'TRY';
}

/**
 * Karar 1: satir Toplam metni. Ayni birimde tek toplam (kurus katmaninda —
 * `kalemToplami` ile ayni kural); farkli birimde iki tutar yan yana. Sifir ya
 * da bos taraf yazilmaz; iki taraf da bossa null (cagiran hucreyi bos birakir).
 */
export function karmaToplamMetni(
  mat: number | null, matPB: ParaBirimi, lab: number | null, labPB: ParaBirimi,
): string | null {
  const m = mat != null && kurusTamsayi(mat) !== 0 ? mat : null;
  const l = lab != null && kurusTamsayi(lab) !== 0 ? lab : null;
  const yaz = (v: number, pb: ParaBirimi) => `${PARA_SEMBOLU[pb]}${paraBicim(v, 1)}`;
  if (m == null && l == null) return null;
  if (m == null) return yaz(l!, labPB);
  if (l == null) return yaz(m, matPB);
  if (matPB === labPB) return yaz((kurusTamsayi(m) + kurusTamsayi(l)) / 100, matPB);
  return `${yaz(m, matPB)} + ${yaz(l, labPB)}`;
}

const YAZIM: Array<[RegExp, ParaBirimi]> = [
  [/\$|\bUSD\b|\bDOLAR\b/i, 'USD'],
  [/€|\bEUR\b|\bEURO\b|\bAVRO\b/i, 'EUR'],
  [/₺|\bTL\b|\bTRY\b/i, 'TRY'],
];

/**
 * Karar 3: elle yazilan metin birimi ACIKCA seciyor mu? Duz sayi → null
 * (tarafin mevcut birimi korunur). Birden cok birim yazilmissa null — tahmin
 * edilmez.
 */
export function elleGirilenPB(metin: string): ParaBirimi | null {
  const s = String(metin ?? '');
  const bulunan = YAZIM.filter(([re]) => re.test(s)).map(([, pb]) => pb);
  return bulunan.length === 1 ? bulunan[0] : null;
}

/**
 * Elle yazilan fiyat metninden para ISARETINI ayiklar ("$12" → "12",
 * "12,5 TL" → "12,5") — sayi ayristiricisi (`hucreGirdisiCoz`) isaretli metni
 * "sayi degil" diye reddederdi. Birim `elleGirilenPB` ile AYRICA okunur.
 */
export function paraIsaretiniAyikla(metin: string): string {
  return String(metin ?? '').replace(/[$€₺]|\b(USD|EUR|EURO|AVRO|TRY|TL|DOLAR)\b/gi, '').trim();
}
