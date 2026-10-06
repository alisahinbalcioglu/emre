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
import { ONDALIK, kurusTamsayi, paraBicim, sayfaToplamlari, fittingHesapla, hesaplaNetFiyat, hesaplaNetFiyatDoviz, type SayfaToplamOzeti, type TarafSuzgeci } from './pricing';

export type ParaBirimi = 'TRY' | 'USD' | 'EUR';

export const PARA_SEMBOLU: Record<ParaBirimi, string> = { TRY: '₺', USD: '$', EUR: '€' };

const GECERLI = new Set<string>(['TRY', 'USD', 'EUR']);

/** Karar 4: dovizde 2 hane, ₺'de bugunku 1 hane (birim yoksa ₺). */
export function paraHanesi(pb?: ParaBirimi | null): number {
  return pb === 'USD' || pb === 'EUR' ? 2 : ONDALIK;
}

/**
 * KUTUPHANE NETI (05.10, P2 notu): liste × (1 − iskonto) satirin KENDI biriminde
 * yuvarlanir — USD/EUR 2 hane yukari, TRY (ve birimsiz / taninmayan) bugunku ₺
 * kurali. Kutuphane ekraninin "Net Fiyat" kolonu dovizli satirda ₺ kuraliyla
 * yuvarliyordu ($10,55 → $10,60); motorun kaynak neti (F1) ve TL neti (C6) 2
 * hane. Kural TEK yerde: kutuphane gosterimi (C3) de buradan okur.
 */
export function netFiyatBiriminde(listeFiyat: number, iskontoYuzde: number, pb: unknown): number {
  return pb === 'USD' || pb === 'EUR' ? hesaplaNetFiyatDoviz(listeFiyat, iskontoYuzde) : hesaplaNetFiyat(listeFiyat, iskontoYuzde);
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

// ══ F3 — SAYFA TOPLAMI / KAR / FITTING PARA BIRIMI BASINA ═════════════════

/** Kova sirasi — sabit (ekranda ₺, $, € sirasiyla). */
const SIRA: readonly ParaBirimi[] = ['TRY', 'USD', 'EUR'];

/** Bu birimin kovasina giren taraflar: tarafin birimi = kovanin birimi. */
export function birimSuzgeci(pb: ParaBirimi): TarafSuzgeci {
  return { dahil: (r, dal) => tarafPB(r, dal) === pb, hane: paraHanesi(pb) };
}

/**
 * Karisik kip sayfa toplami: birim BASINA bir ozet (dolar liraya eklenmez).
 * Yalniz fiyatli tarafi olan birimler doner; hic yoksa tek ₺ kovasi (bugunku
 * bos toplam satiri). Fiyatsiz satir sayilari HER kovaya yazilir: fiyatsiz
 * tarafin birimi yoktur, hangi toplamin eksik oldugu bilinemez — uyari (KE29)
 * hicbir kovada kaybolmasin. Yalniz-TL sayfada sonuc `sayfaToplamlari` ile
 * birebir aynidir.
 */
export function birimliToplamlar(
  satirlar: Record<string, any>[],
  roller: Record<string, string | undefined>,
): Array<{ pb: ParaBirimi; ozet: SayfaToplamOzeti }> {
  const genel = sayfaToplamlari(satirlar, roller);
  const kovalar = SIRA
    .map((pb) => ({ pb, ozet: sayfaToplamlari(satirlar, roller, 1, birimSuzgeci(pb)) }))
    .filter((k) => k.ozet.matFiyatli + k.ozet.labFiyatli > 0);
  if (kovalar.length === 0) return [{ pb: 'TRY', ozet: genel }];
  return kovalar.map((k) => ({
    pb: k.pb,
    ozet: { ...k.ozet, matFiyatsiz: genel.matFiyatsiz, labFiyatsiz: genel.labFiyatsiz },
  }));
}

/** Fitting satirinin tutarlari birim BASINA (karar 2) — sifir tutar yazilmaz. */
export function fittingBirimli(
  fit: Record<string, any>,
  satirlar: Record<string, any>[],
  roller: Record<string, string | undefined>,
): { mat: Array<{ pb: ParaBirimi; toplam: number }>; lab: Array<{ pb: ParaBirimi; toplam: number }> } {
  const mat: Array<{ pb: ParaBirimi; toplam: number }> = [];
  const lab: Array<{ pb: ParaBirimi; toplam: number }> = [];
  for (const pb of SIRA) {
    const f = fittingHesapla(fit, satirlar, roller, birimSuzgeci(pb));
    if (f?.mat && f.mat.toplam !== 0) mat.push({ pb, toplam: f.mat.toplam });
    if (f?.lab && f.lab.toplam !== 0) lab.push({ pb, toplam: f.lab.toplam });
  }
  return { mat, lab };
}

/**
 * Birden cok birimli tutar metni ("₺20,00 + $2,10"): birimler sabit sirada,
 * ayni birim kurus katmaninda birlesir, sifir yazilmaz; hic yoksa null.
 */
export function cokluTutarMetni(parcalar: Array<{ pb: ParaBirimi; tutar: number }>): string | null {
  const K = new Map<ParaBirimi, number>();
  for (const p of parcalar) K.set(p.pb, (K.get(p.pb) ?? 0) + kurusTamsayi(p.tutar));
  const yazi = SIRA.filter((pb) => (K.get(pb) ?? 0) !== 0)
    .map((pb) => `${PARA_SEMBOLU[pb]}${paraBicim(K.get(pb)! / 100, 1)}`);
  return yazi.length ? yazi.join(' + ') : null;
}

// ══ F4 — KAYIT: kip kayittan turetilir, iliskisel kalem TL karsiligi tasir ═══

/**
 * Teklif karisik (YAZIM) kipte mi? Karisik kip her fiyat yaziminda tarafin
 * birimini (`_matPB`/`_labPB`, ₺ dahil) yazar; tl kipi hic yazmaz. Yani birim
 * alani tasiyan satir = karisik teklif; eski / yalniz-TL kayitlar tl kalir.
 * F6b (06.10): yeni teklif karisik ACILIR — henuz fiyatlanmamis (birim alani
 * olmayan) bir yeni teklif kaydedilince kipi sayfa ISARETI (`paraKipi:
 * 'karisik'`, kayit yuku yazar) tasir; revizyonda karisik acilir.
 */
export const KARISIK_PARA_KIPI = 'karisik' as const;

export function karisikKipMi(sayfalar: Array<{ paraKipi?: unknown; rowData?: Record<string, any>[] | null }> | null | undefined): boolean {
  for (const s of sayfalar ?? []) {
    if (s?.paraKipi === KARISIK_PARA_KIPI) return true;
    for (const r of s?.rowData ?? []) {
      if (typeof r?._matPB === 'string' || typeof r?._labPB === 'string') return true;
    }
  }
  return false;
}

// ══ F6a — GORUNUM KURALI: birim basina gorunum YALNIZ dovizli taraf varken ═══

const DOVIZ: ReadonlySet<unknown> = new Set(['USD', 'EUR']);

/**
 * Satirlarda $/€ taraf (ya da fitting birim parcasi) var mi?
 *
 * Karar K1 (05.10, Emre'nin onerilen onayi): karisik kip YAZIM yetenegidir
 * ($ liste fiyati $ kalir); birim basina GORUNUM — alt satirlar "GENEL TOPLAM
 * ₺/$", fitting "₺x + $y", fiyatli Excel ve İCMAL duzeni — YALNIZ dovizli taraf
 * varken. Yalniz-₺ karisik teklif TL teklifle bayt bayt ayni gorunur: "yeni
 * teklif karisik" ile "yalniz-TL teklifin ekrani ve Excel'i ayni" ancak boyle
 * birlikte tutar. Yazim kipi ayri kural (`karisikKipMi`).
 * IKIZ: arka uc `cikti-karisik.ts` `dovizliTarafVarMi` (test:ex-karisik KR0).
 */
export function dovizliSatirVarMi(satirlar: ReadonlyArray<Record<string, any> | null | undefined>): boolean {
  for (const r of satirlar) {
    if (!r) continue;
    if (DOVIZ.has(r._matPB) || DOVIZ.has(r._labPB)) return true;
    // Bozuk kayit (dizi olmayan mat/lab) cokertmez (inceleme L4; `fittingParcalari` ikizi)
    const fb = r._fittingBirimli;
    const parcalar = fb ? [...(Array.isArray(fb.mat) ? fb.mat : []), ...(Array.isArray(fb.lab) ? fb.lab : [])] : [];
    if (parcalar.some((x: any) => DOVIZ.has(x?.pb))) return true;
  }
  return false;
}

/** Teklif genelinde (tum sayfalar) dovizli taraf var mi — `dovizliSatirVarMi` sayfa sayfa. */
export function dovizliTarafVarMi(sayfalar: ReadonlyArray<{ rowData?: Record<string, any>[] | null } | null | undefined> | null | undefined): boolean {
  return (sayfalar ?? []).some((s) => dovizliSatirVarMi(s?.rowData ?? []));
}

/**
 * Aktif sayfa DISINDAKI sayfalarda doviz var mi? Gorunum teklif genelinde tek
 * duzendir: baska sayfada $ varsa yalniz-₺ aktif sayfa da birim basina gorunur.
 * Aktif sayfa SAYILMAZ — izgara onu kendi satirlarindan CANLI olcer (ilk $ fiyati
 * yazildigi anda); sayfa onu bir ust render'la gecirseydi acik duzenleyici
 * kapanirdi. `canli` (sayfa index'i → duzenlenmis satirlar) kayittakinin yerine gecer.
 */
export function digerSayfalardaDovizVar(
  sayfalar: ReadonlyArray<{ index: number; rowData?: Record<string, any>[] | null }>,
  aktif: number,
  canli: Readonly<Record<number, Record<string, any>[] | undefined>> = {},
): boolean {
  return sayfalar.some((s) => s.index !== aktif && dovizliSatirVarMi(canli[s.index] ?? s.rowData ?? []));
}

/**
 * F6b: eslesme balonundaki tutar. Karisik (yazim) kipte dovizli kaynak fiyat
 * KENDI biriminde gosterilir — hucre $ yazarken balon ₺ net demesin. Aksi halde
 * (tl kipi, ₺ kaynak, kaynak fiyat yok) bugunku TL gosterimi.
 */
export function balonTutari(
  netPrice: number,
  kaynakFiyat: { currency?: unknown; net?: unknown } | null | undefined,
  karisik: boolean,
  tlGosterim: (tl: number) => string,
): string {
  const pb = kaynakFiyat?.currency;
  const net = kaynakFiyat?.net;
  // Izgarayla AYNI gecerlilik (inceleme S1): `Number.isFinite(net)`, cevirme yok —
  // null/metin net'te izgara ₺ yazar, balon da TL gosterir.
  if (karisik && (pb === 'USD' || pb === 'EUR') && typeof net === 'number' && Number.isFinite(net)) {
    return `${PARA_SEMBOLU[pb]}${paraBicim(net, 1)}`;
  }
  return tlGosterim(netPrice);
}

/**
 * F6b kardes: aday / alternatif menusu fiyat etiketi. Karisik kipte secimin
 * YAZACAGI birimde (`balonTutari` kurali) — menu "420.0 TL" deyip hucreye
 * $10,50 yazmasin. Aksi halde eski "N.N TL" etiketi (tl kipi bayt bayt ayni).
 */
export function adayFiyatEtiketi(netPrice: number, kaynakFiyat: unknown, karisik: boolean, hane = 1): string {
  const kf = kaynakFiyat as { currency?: unknown; net?: unknown } | null | undefined;
  return balonTutari(netPrice, kf, karisik, (tl) => `${tl.toFixed(hane)} TL`);
}

/** Kayit anindaki TL kurlari (1 birim = kac TL). */
export type TlKurlari = Partial<Record<'USD' | 'EUR', number>>;

/**
 * Dovizli tutarin TL karsiligi (kurus): once satirin DONDURULMUS kuru (kur
 * donmasi — tutarin dogdugu kur), yoksa kayit anindaki kur. Kur hic yoksa 0:
 * iliskisel kalem (liste/pano toplami) bilgi amaclidir, teklifin kendi rakami
 * sheets JSON'unda birimiyle durur — uydurma kur YAZILMAZ.
 */
export function tlKarsiligi(v: number, pb: ParaBirimi, satirKuru: unknown, tlKuru: TlKurlari): number {
  if (pb === 'TRY') return v;
  const sk = satirKuru as { currency?: unknown; kur?: unknown } | null | undefined;
  const donuk = sk && sk.currency === pb && typeof sk.kur === 'number' && sk.kur > 0 ? sk.kur : null;
  const kur = donuk ?? tlKuru[pb];
  if (!kur || !Number.isFinite(kur) || kur <= 0) return 0;
  return kurusTamsayi(v * kur) / 100;
}
