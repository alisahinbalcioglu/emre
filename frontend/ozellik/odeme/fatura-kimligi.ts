/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FATURA KIMLIGI — abonelik baslatmadan once toplanan alanlar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU DOSYA NEDEN VAR (02.09'da olculdu)
 *
 *  Abonelik sayfasi `/abonelik/basla` ucuna YALNIZ `paketSurumuId` gonderiyordu.
 *  Sunucu ise govdeyi kosulsuz aciyordu (`p.musteri.ad`) — yani HICBIR musteri
 *  odeme yapamiyordu; uc `500 Internal server error` doneriyordu ve ekranda
 *  "Odeme baslatilamadi" yaziyordu. Sayfadaki yorum "firmanin kayitli
 *  bilgileri kullanilir, eksikse sunucu aciklayici hata doner" diyordu; ikisi
 *  de dogru DEGILDI. (Yorum kanit degildir.)
 *
 *  Alanlar iyzico'nun abonelik formunun ZORUNLU tuttuklaridir. Sunucu tarafinda
 *  ikizi var: `satinalma.servisi.ts` → `ZORUNLU_MUSTERI_ALANLARI`. Iki liste
 *  AYNI olmak zorunda; `erisim-durumu.test.ts` bunu esitlik olarak olcer.
 *
 *  `postaKodu` bilerek DISARIDA: iyzico'da opsiyonel, zorunlu tutmak
 *  surtunme yaratir.
 */

import { e164 as telefonE164 } from './telefon-bicim';

export interface FaturaKimligi {
  ad: string;
  soyad: string;
  eposta: string;
  telefon: string;
  kimlikNo: string;
  sehir: string;
  adres: string;
  postaKodu?: string;
}

/** Sunucudaki `ZORUNLU_MUSTERI_ALANLARI` ile BIREBIR ayni olmak zorunda. */
export const ZORUNLU_ALANLAR = [
  'ad',
  'soyad',
  'eposta',
  'telefon',
  'kimlikNo',
  'sehir',
  'adres',
] as const;

export type ZorunluAlan = (typeof ZORUNLU_ALANLAR)[number];

/** Ekranda gorunen basliklar — hata mesaji da bunlari kullanir. */
export const ALAN_ETIKET: Record<ZorunluAlan | 'postaKodu', string> = {
  ad: 'Ad',
  soyad: 'Soyad',
  eposta: 'E-posta',
  telefon: 'Telefon',
  kimlikNo: 'TC Kimlik / Vergi No',
  sehir: 'Il',
  adres: 'Fatura adresi',
  postaKodu: 'Posta kodu',
};

export function bosFaturaKimligi(): FaturaKimligi {
  return {
    ad: '',
    soyad: '',
    eposta: '',
    telefon: '',
    kimlikNo: '',
    sehir: '',
    adres: '',
    postaKodu: '',
  };
}

/**
 * Eksik alanlarin ETIKETLERINI doner (bos dizi = form gonderilebilir).
 *
 * Bosluk-only deger EKSIK sayilir: `"  "` sunucuya gecerse iyzico reddeder
 * ve hata musteriye anlamsiz sekilde doner. Kapiyi burada tutmak, hatayi
 * kullanicinin duzeltebilecegi yerde tutar.
 */
export function eksikAlanlar(deger: Partial<FaturaKimligi> | null | undefined): string[] {
  if (!deger) return ZORUNLU_ALANLAR.map((a) => ALAN_ETIKET[a]);
  return ZORUNLU_ALANLAR.filter((a) => {
    const v = deger[a];
    return typeof v !== 'string' || v.trim() === '';
  }).map((a) => ALAN_ETIKET[a]);
}

/** Form gonderilebilir mi? */
export function gonderilebilir(deger: Partial<FaturaKimligi> | null | undefined): boolean {
  return eksikAlanlar(deger).length === 0;
}

/**
 * Sunucuya gidecek govdeyi uretir: bastaki/sondaki bosluklar kirpilir,
 * `postaKodu` bossa HIC GONDERILMEZ (bos dize gondermek, alani "verildi ama
 * bos" gostererek iyzico tarafinda dogrulama hatasi uretebilir).
 */
export function govdeyeCevir(deger: FaturaKimligi): FaturaKimligi {
  const kirp = (s: string) => s.trim();
  const govde: FaturaKimligi = {
    ad: kirp(deger.ad),
    soyad: kirp(deger.soyad),
    eposta: kirp(deger.eposta),
    // ⚠ Durumda YALNIZ HANELER tutulur (`telefon-bicim.ts`); tele gidecek
    // bicim E.164'tur. Sunucuda ikinci bir kalkan var (`telefonuNormalize`),
    // ama dogru bicimi ISTEMCIDEN gondermek hatayi hic olusturmaz.
    telefon: telefonE164(deger.telefon) || kirp(deger.telefon),
    kimlikNo: kirp(deger.kimlikNo),
    sehir: kirp(deger.sehir),
    adres: kirp(deger.adres),
  };
  const pk = (deger.postaKodu ?? '').trim();
  if (pk) govde.postaKodu = pk;
  return govde;
}
