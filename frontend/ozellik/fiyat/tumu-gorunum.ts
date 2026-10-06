/**
 * COKLU PARA BIRIMI F6c (karar K2, 05.10) — "TUMU X" GORUNUMU.
 *
 * Dovizli ($/€ tarafi olan) karisik teklif varsayilan olarak KARISIK gorunur:
 * her taraf kendi biriminde, toplamlar birim basina (F2/F3). Gorunum anahtari
 * [Karisik | TL | USD | EUR]; "Tumu X" her tarafi X'e CEVIREREK gosterir.
 * Yalniz GORUNUM: satir verisi, kayit ve Excel (F5: birim basina) degismez;
 * fiyat hucreleri bu gorunumde SALT OKUNUR (cevrilmis sayiyi duzenlemek para
 * yolunda risk — yazilan sayinin hangi birimde oldugu belirsizlesir).
 *
 * KUR — QuoteItem TL karsiligiyla AYNI kural (`teklif-kalem.ts kalemUret` →
 * `tlKarsiligi`): once satirin DONDURULMUS kuru, yoksa canli kur; fitting
 * parcalari canli kurla. Boylece ayni kurla "Tumu ₺" GENEL TOPLAM'i teklif
 * listesindeki / panodaki toplamla kurusu kurusuna aynidir. X ≠ ₺ ise TL
 * karsiligi canli kurla X'e cevrilir; tarafin KENDI birimi X ise cevrilmez
 * ($ fiyat Tumu USD'de aynen $). Kur yoksa tutar `null` — uydurma kur yok
 * (sayfa Tumu seceneklerini canli kur yokken kapatir).
 */
import { kurusTamsayi, etkinMiktar, satirTarafi, fittingHesapla, type SayfaToplamOzeti } from './pricing';
import { sayiOku } from './sayi-alani';
import { tarafPB, tlKarsiligi, paraHanesi, birimSuzgeci, type ParaBirimi, type TlKurlari } from './taraf-para-birimi';

/** Tumu gorunumunun girdisi: hedef birim + canli TL kurlari (1 birim = kac TL). */
export interface TumuGorunum { hedef: ParaBirimi; tlKuru: TlKurlari }

/** Gorunum anahtarinin secenegi: karisik ya da tek birim. */
export type GorunumSecenegi = 'karisik' | ParaBirimi;

type Dal = 'malzeme' | 'iscilik';
type Roller = Record<string, string | undefined>;
const SIRA: readonly ParaBirimi[] = ['TRY', 'USD', 'EUR'];
const KUR_ALANI: Record<Dal, '_matKurBilgi' | '_labKurBilgi'> = { malzeme: '_matKurBilgi', iscilik: '_labKurBilgi' };

/** Tek tutarin X karsiligi (kurus). Cevrilemezse (kur yok) null. */
export function tumuTutari(v: number, pb: ParaBirimi, satirKuru: unknown, g: TumuGorunum): number | null {
  if (!Number.isFinite(v)) return null;
  if (pb === g.hedef || v === 0) return v;
  const tl = tlKarsiligi(v, pb, satirKuru, g.tlKuru);
  if (pb !== 'TRY' && tl === 0) return null; // tlKarsiligi kur yokken 0 doner
  if (g.hedef === 'TRY') return tl;
  const kur = g.tlKuru[g.hedef];
  if (!kur || !Number.isFinite(kur) || kur <= 0) return null;
  return kurusTamsayi(tl / kur) / 100;
}

/** Null olmayanlari kurus katmaninda toplar; hepsi null ise null. */
function topla(degerler: Array<number | null>): number | null {
  const sayilar = degerler.filter((v): v is number => v !== null);
  return sayilar.length ? sayilar.reduce((s, v) => s + kurusTamsayi(v), 0) / 100 : null;
}

/** Fitting satirinin birim basina parcalari (izgara `_fittingBirimli` yazar). */
function fittingParcalari(r: Record<string, any>): { mat: Array<{ pb: ParaBirimi; toplam: number }>; lab: Array<{ pb: ParaBirimi; toplam: number }> } | null {
  const fb = r._fittingBirimli;
  if (!fb || typeof fb !== 'object') return null;
  return { mat: Array.isArray(fb.mat) ? fb.mat : [], lab: Array.isArray(fb.lab) ? fb.lab : [] };
}

/**
 * Veri satirinin bir para hucresinin X karsiligi; hucre para hucresi degilse
 * ya da bossa null. Genel toplam / toplam birim fiyat PARCALARDAN (karar 1'in
 * ikizi); fitting satiri birim basina parcalarindan (birim fiyat hucresi bos).
 */
export function tumuHucresi(r: Record<string, any>, alan: string | undefined, roller: Roller, g: TumuGorunum): number | null {
  if (!alan) return null;
  const { materialUnitPriceField: mB, materialTotalField: mT, laborUnitPriceField: lB,
    laborTotalField: lT, grandTotalField: gT, grandUnitPriceField: gB } = roller;
  const fb = r._fitting ? fittingParcalari(r) : null;
  if (fb) {
    const cevir = (l: Array<{ pb: ParaBirimi; toplam: number }>) => topla(l.map((x) => tumuTutari(x.toplam, x.pb, null, g)));
    if (alan === mT) return cevir(fb.mat);
    if (alan === lT) return cevir(fb.lab);
    if (alan === gT) return cevir([...fb.mat, ...fb.lab]);
    return null;
  }
  const taraf = (dal: Dal, hucre: string | undefined): number | null => {
    const v = hucre ? sayiOku(r[hucre]) : null;
    return v === null ? null : tumuTutari(v, tarafPB(r, dal), r[KUR_ALANI[dal]], g);
  };
  if (alan === mB) return taraf('malzeme', mB);
  if (alan === mT) return taraf('malzeme', mT);
  if (alan === lB) return taraf('iscilik', lB);
  if (alan === lT) return taraf('iscilik', lT);
  if (alan === gT) return topla([taraf('malzeme', mT), taraf('iscilik', lT)]);
  if (alan === gB) return topla([taraf('malzeme', mB), taraf('iscilik', lB)]);
  return null;
}

/** Tumu gorunumunun sayfa ozeti + cevrilemeyen taraf sayisi (kur yok). */
export type TumuOzeti = SayfaToplamOzeti & { cevrilemeyen: number };

/**
 * Sayfanin X'teki GENEL TOPLAM / KAR ozeti. Satir satir, taraf taraf cevrilir
 * (her tarafin kendi dondurulmus kuru) — kova toplamini tek kurla cevirmek
 * farkli kurlu satirlarda liste toplamindan ayrisirdi. Satis ve maliyet
 * tarafin kendi birimindeki kuralla (`satirTarafi`, `fittingHesapla` kova
 * basina) hesaplanir, ayni kurla cevrilir: KAR = satis − maliyet (X'te).
 */
export function tumuOzeti(satirlar: Record<string, any>[], roller: Roller, g: TumuGorunum): TumuOzeti {
  const { materialUnitPriceField: mB, materialTotalField: mT, laborUnitPriceField: lB,
    laborTotalField: lT, quantityField: mikA, unitField: brmA } = roller;
  const K = { mat: { top: 0, mal: 0, fiyatli: 0, fiyatsiz: 0 }, lab: { top: 0, mal: 0, fiyatli: 0, fiyatsiz: 0 } };
  let cevrilemeyen = 0;
  const ekle = (k: 'mat' | 'lab', satis: number, maliyet: number, pb: ParaBirimi, kur: unknown) => {
    const s = tumuTutari(satis, pb, kur, g);
    const m = tumuTutari(maliyet, pb, kur, g);
    if (s === null || m === null) { cevrilemeyen++; return; }
    K[k].top += kurusTamsayi(s);
    K[k].mal += kurusTamsayi(m);
  };

  for (const r of satirlar) {
    if (!r?._isDataRow || r._ozet) continue; // Icmal ozet satiri — cift sayim yasagi
    if (r._fitting) {
      // Kova basina kapsamdan (karar 2) — parcalar canli kurla (kalemUret fitTL ikizi)
      let mat = false, lab = false;
      for (const pb of SIRA) {
        const f = fittingHesapla(r, satirlar, roller, birimSuzgeci(pb));
        if (f?.mat) { mat = true; ekle('mat', f.mat.toplam, f.mat.maliyet, pb, null); }
        if (f?.lab) { lab = true; ekle('lab', f.lab.toplam, f.lab.maliyet, pb, null); }
      }
      if (mat) K.mat.fiyatli++;
      if (lab) K.lab.fiyatli++;
      continue;
    }
    const miktar = etkinMiktar(r, mikA, brmA);
    const taraflar: Array<['mat' | 'lab', Dal, string | undefined, string | undefined, '_malzKar' | '_iscKar', '_matNetPrice' | '_labNetPrice']> = [
      ['mat', 'malzeme', mB, mT, '_malzKar', '_matNetPrice'],
      ['lab', 'iscilik', lB, lT, '_iscKar', '_labNetPrice'],
    ];
    for (const [k, dal, birim, top, kar, net] of taraflar) {
      const pb = tarafPB(r, dal);
      const s = satirTarafi(r, miktar, birim, top, kar, net, paraHanesi(pb));
      if (!s) continue;
      if (!s.fiyatli) { K[k].fiyatsiz++; continue; }
      K[k].fiyatli++;
      ekle(k, s.satis, s.maliyet, pb, r[KUR_ALANI[dal]]);
    }
  }

  const matToplam = K.mat.top / 100;
  const labToplam = K.lab.top / 100;
  const matKar = (K.mat.top - K.mat.mal) / 100;
  const labKar = (K.lab.top - K.lab.mal) / 100;
  return {
    matToplam, labToplam, genelToplam: matToplam + labToplam,
    matMaliyet: K.mat.mal / 100, labMaliyet: K.lab.mal / 100,
    matKar, labKar, toplamKar: matKar + labKar, // KE26: yayinlanan iki kalemin toplami
    matFiyatli: K.mat.fiyatli, matFiyatsiz: K.mat.fiyatsiz,
    labFiyatli: K.lab.fiyatli, labFiyatsiz: K.lab.fiyatsiz,
    cevrilemeyen,
  };
}

/** Anahtarin secenekleri: dovizli teklifte Karisik + uc birim, degilse bugunku uc birim. */
export function gorunumSecenekleri(dovizli: boolean): GorunumSecenegi[] {
  return dovizli ? ['karisik', 'TRY', 'USD', 'EUR'] : ['TRY', 'USD', 'EUR'];
}

/**
 * Izgaraya gidecek Tumu girdisi — iki sayfanin (yeni teklif + detay) TEK karari.
 * Yalniz karisik YAZIM kipinde, dovizli teklifte, kullanici tek birim sectiyse
 * ve canli kur varsa; aksi halde null (Karisik ya da bugunku TL/USD/EUR cevrimi).
 */
export function tumuGorunumu(
  karisikKip: boolean,
  dovizli: boolean,
  karisikSecili: boolean,
  birim: ParaBirimi,
  kurVar: boolean,
  tlKuru: TlKurlari,
): TumuGorunum | null {
  if (!karisikKip || !dovizli || karisikSecili || !kurVar) return null;
  return { hedef: birim, tlKuru };
}

/**
 * Anahtar tiklamasinin yeni durumu (iki sayfanin ORTAK gecisi). Yalniz-₺
 * teklifte birim tiklamasi Karisik tercihini DEGISTIRMEZ: sonradan gelen $
 * eslesmesi teklifi kullanici istemeden salt okunur "Tumu X"e dusurmesin —
 * dovizli teklif ilk acilista Karisik gorunur (K2 varsayilani).
 */
export function gorunumSecimi(
  secim: GorunumSecenegi,
  dovizli: boolean,
  karisikSecili: boolean,
): { karisikSecili: boolean; birim: ParaBirimi | null } {
  if (secim === 'karisik') return { karisikSecili: true, birim: null };
  return { karisikSecili: dovizli ? false : karisikSecili, birim: secim };
}

/**
 * Anahtar dugmesinin durumu. Dovizli teklifte tek birim CEVIRIR: canli kur
 * yokken (TL dahil — $ tarafin TL'si de kur ister) kapali; yalniz-₺ teklifte
 * bugunku kural (yalniz USD/EUR kur ister).
 */
export function anahtarDurumu(
  secim: GorunumSecenegi,
  dovizli: boolean,
  karisikSecili: boolean,
  birim: ParaBirimi,
  kurVar: boolean,
): { secili: boolean; kapali: boolean } {
  const karisikGorunur = dovizli && karisikSecili;
  if (secim === 'karisik') return { secili: karisikGorunur, kapali: false };
  return { secili: !karisikGorunur && birim === secim, kapali: !kurVar && (secim !== 'TRY' || dovizli) };
}
