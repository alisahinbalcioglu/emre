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
  /**
   * T47 (22.09) — KOSULLU ZORUNLU. `ZORUNLU_ALANLAR` icinde BILEREK DEGIL:
   * o liste iyzico'nun sozlesmesidir ve sunucudaki ikiziyle BIREBIR esit
   * kalmak zorundadir (`satinalma-yolu-test.ts` P7). Vergi dairesi iyzico'nun
   * degil FATURANIN alanidir; yalniz `vergiDairesiGerekli()` dogruyken sorulur.
   */
  vergiDairesi?: string;
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
export const ALAN_ETIKET: Record<
  ZorunluAlan | 'postaKodu' | 'vergiDairesi',
  string
> = {
  ad: 'Ad',
  soyad: 'Soyad',
  eposta: 'E-posta',
  telefon: 'Telefon',
  kimlikNo: 'TC Kimlik / Vergi No',
  sehir: 'İl',
  adres: 'Fatura adresi',
  postaKodu: 'Posta kodu',
  vergiDairesi: 'Vergi dairesi',
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SAHIS mi TUZEL mi — T47 (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ NEDEN GEREKLI (olculdu 22.09): tum depoda sahis/limited ayrimi YOKTU —
 *  `sahis|limited|sirketTuru|mukellef|tuzel` taramasi backend'de YALNIZ IKI
 *  YORUM buluyordu, SIFIR kod. `Firma`da `vergiNo` / `vergiDairesi` /
 *  `tcKimlikNo` uc bagimsiz nullable kolon olarak duruyor ve aralarinda
 *  HICBIR kural yok; fatura kesimi ucunu de `?? undefined` ile geciyordu.
 *  Sonuc: vergi kimligi HIC olmayan fatura sessizce kesiliyordu.
 *
 *  VUK md. 230 faturada musterinin "vergi dairesi ve hesap numarasi"ni sart
 *  kosar. Pratikte iki gecerli bicim var:
 *    · SAHIS / gercek kisi : 11 haneli T.C. kimlik no — vergi dairesi GEREKMEZ
 *    · TUZEL KISI (Ltd/A.S): 10 haneli VKN + VERGI DAIRESI
 *
 *  ⚠ BICIM DAYATMIYORUZ, YALNIZ HANE SAYISINA BAKIYORUZ. Dogrulama algoritmasi
 *  (TCKN saglama hanesi) BILEREK YOK: yanlis pozitif musteriyi odeme yapamaz
 *  hale getirir, ve numaranin gercekten gecerli oldugunu zaten iyzico ile
 *  muhasebe saglayicisi soyler. Burada sorulan tek sey "hangi BELGEYI
 *  istemeliyim".
 */
export type KimlikTuru = 'tckn' | 'vkn' | 'bilinmiyor';

export function kimlikTuru(kimlikNo: string | null | undefined): KimlikTuru {
  const haneler = (kimlikNo ?? '').replace(/\D/g, '');
  if (haneler.length === 11) return 'tckn';
  if (haneler.length === 10) return 'vkn';
  return 'bilinmiyor';
}

/**
 * Vergi dairesi SORULMALI mi?
 *
 * ⚠ `!== 'tckn'` yaziliyor, `=== 'vkn'` DEGIL — bilincli. Hane sayisi ne 10
 * ne 11 ise ("bilinmiyor") elimizde gecerli bir SAHIS kimligi YOKTUR; o halde
 * faturayi ancak vergi dairesi + numara ile kesebiliriz. `=== 'vkn'` yazmak,
 * yarim yazilmis bir numarayi kapidan GECIRIR ve eksik bilgi ancak fatura
 * kesim aninda — yani musterinin parasi cekildikten SONRA — ortaya cikardi.
 * Kapinin amaci tam olarak bunu onlemek.
 *
 * ⚠ Kimlik no HIC girilmemisken FALSE doner: o hal zaten `ZORUNLU_ALANLAR`
 * kapisina takilir ve "once kimlik no'yu girin" demek, ayni anda iki hata
 * gostermekten anlasilirdir.
 */
export function vergiDairesiGerekli(
  deger: Partial<FaturaKimligi> | null | undefined,
): boolean {
  const ham = (deger?.kimlikNo ?? '').trim();
  if (!ham) return false;
  return kimlikTuru(ham) !== 'tckn';
}

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
    vergiDairesi: '',
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
  const eksik = ZORUNLU_ALANLAR.filter((a) => {
    const v = deger[a];
    return typeof v !== 'string' || v.trim() === '';
  }).map((a) => ALAN_ETIKET[a]);

  // T47: KOSULLU alan. Sirket adina alan musteriden vergi dairesi de istenir;
  // sahis (11 haneli TCKN) icin EK ALAN SORULMAZ — surtunme eklemenin bedeli
  // gelir kaybidir ve e-Arsiv'de gercek kisiye TCKN yeter.
  if (vergiDairesiGerekli(deger) && !(deger.vergiDairesi ?? '').trim()) {
    eksik.push(ALAN_ETIKET.vergiDairesi);
  }
  return eksik;
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
  // T47: `postaKodu` ile AYNI kural — bos dize GONDERILMEZ. Sunucu tarafi
  // `??` ile yalniz BOS `Firma` alanini doldurur; bos dize gonderirsek orada
  // "verildi ama bos" gorunur ve kayitli vergi dairesini bos dizeyle ezerdi.
  const vd = (deger.vergiDairesi ?? '').trim();
  if (vd) govde.vergiDairesi = vd;
  return govde;
}
