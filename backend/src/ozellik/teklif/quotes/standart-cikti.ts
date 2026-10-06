/**
 * STANDART ÇIKTI — EX1-EX8 (PRD_Standart_Grid_Semasi_ve_Aday_Ayirt_Edicilik §C)
 *
 * KULLANICI KARARI (30.07.2026): "fiyatlı çıktı standart 9 kolon olsun,
 * müşterinin şablonuna yazmayı bırak."
 *
 * Bu modül, teklifi MUSTERININ dosyasina yazmak yerine SIFIRDAN 9 kolonluk
 * standart bir workbook uretir:
 *   No · Malzeme Adı · Miktar · Birim · Malz. Birim Fiyat · Malz. Toplam ·
 *   İşç. Birim Fiyat · İşç. Toplam · Genel Toplam
 *
 * NEDEN: kolon-haritalama sinifindaki hatalar (KE1-KE21, KF1-KF7) sablona
 * yazma yuzunden vardi — hangi kolon nereye? Standart ciktida bu soru yok.
 * Kar orani ve marka/firma IC BILGIDIR, musteriye gitmez (EX1/EX2).
 *
 * ── YENI TASARIM (23.09.2026, Emre: "indirdiğimiz excel dökümanının
 * tasarımına göre düzenle") ─────────────────────────────────────────────────
 *  · Ilk sekme GENEL TOPLAM; kalem sayfalari fiyat tablosu, kalemsiz sayfalar
 *    duz METIN (0 TL'lik SAYFA TOPLAMI yok). Satir plani `cikti-satirlari.ts`,
 *    gorunum `cikti-stil.ts`.
 *  · ⚠ EX4 KALDIRILDI: satirlara artik DEGER degil FORMUL yazilir (F = C×E,
 *    H = C×G, I = F+H, SAYFA TOPLAMI = SUM). Her formul ONBELLEGIYLE yazilir —
 *    Korumali Gorunum onbellegi, duzenleme modu formulu gosterir; ikisi AYNI
 *    rakami gostermek zorunda (hesap dogrulugu turu, 13.09).
 *  · KARAR (Emre, 23.09 "Excel yeniden hesaplasın"): dosyadan gelen toplam
 *    miktar × birim fiyatla tutmuyorsa Excel carpimi gosterir; ekran ve kayit
 *    dosyanin rakamini gostermeye devam eder. Sayisi ozette SOYLENIR.
 */
import * as ExcelJS from 'exceljs';
import {
  STANDART_KOLONLAR_EN, OZET_KOLONLAR_EN, birimCevir, ciktiMetni,
} from './cikti-dil';
import { ONDALIK, kurusTamsayi, yukariYuvarla } from '../../fiyat/matching/pricing';
// A2 (tur 3): kayitli grid hucresi MAKINE sinirindadir — on yuz `sayiOku` ikizi
import { makineSayiOku } from '../../kutuphane/utils/import-fidelity';
import { AntetBilgi, antetYaz } from '../../cikti/utils/antet';
import { AlanHaritasi, SayfaPlani, alanHaritasi, miktarVeBirim, sayfaPlaniKur } from './cikti-satirlari';
import {
  ALT_CIZGI, RENK, baskiAyarla, baslikBloguYaz, dolgu, kolonPx, miktarBicimi,
  paraBicimi, tabloBasligiYaz, tarihMetni, toplamSatiriBicimle, yazi,
} from './cikti-stil';
import {
  BIRIM_SIRASI, BIRIM_SUTUNLARI, BIRIM_SUTUN_GENISLIGI, BirimKovasi, BirimToplami, BirimliSayfa, FittingParcasi, Kovalar, ParaBirimi,
  SEMBOL, birimSutunBasliklari, birimToplamSatirlariYaz, fittingParcalari, dovizliTarafVarMi, karisikOzetSayfasiYaz,
  karisikToplamHucresi, kovaListesi, kovayaEkle, paraHanesi, tarafPB,
} from './cikti-karisik';

/** EX1 — degismez 9 kolon, bu sirada. */
export const STANDART_CIKTI_KOLONLARI = [
  'No', 'Malzeme Adı', 'Miktar', 'Birim',
  'Malz. Birim Fiyat', 'Malz. Toplam',
  'İşç. Birim Fiyat', 'İşç. Toplam', 'Genel Toplam',
];

/** Cikti dili basliklari — SIRA ayni, yalniz metin degisir. */
const kolonlar = (dil?: string) => (dil === 'en' ? STANDART_KOLONLAR_EN : STANDART_CIKTI_KOLONLARI);

/** Kalem sayfasi kolon genislikleri (tarif §3): A No … I Genel Toplam. */
const KALEM_GENISLIKLERI = [6, 54, 10, 8, 16, 17, 16, 17, 18];
/** Metin sayfasi (tarif §4): A bosluk · B metin · C tarih. */
const METIN_GENISLIKLERI = [3, 96, 16];
/** GENEL TOPLAM (tarif §5): Sayfa · Malzeme · İşçilik · Genel Toplam. */
const OZET_GENISLIKLERI = [44, 20, 20, 22];

export interface CiktiBirim {
  kod: 'TRY' | 'USD' | 'EUR';
  katsayi: number;
  not: string;
}

export interface StandartCiktiGirdi {
  sheetsArr: any[];
  birim?: CiktiBirim | null;
  /** Teklif adi — her sayfanin 1. satiri ve alt bilginin solu (musteri/proje eki dahil) */
  baslik?: string;
  /** 'en' → basliklar + birimler Ingilizce (sabit sozluk, AI yok). */
  dil?: string;
  /** Firma anteti (antet.ts antetKur) — null/yok ise antet basilmaz */
  antet?: AntetBilgi | null;
  /**
   * Dosya acilinca GORUNEN sekmeye (GENEL TOPLAM — artik ILK sekme) tablo
   * basliginin ustune yazilan not.
   *
   * ⚠ NEDEN YALNIZ `baslik` YETMEZ (Faz 6.10 inceleme ORTA-1, 16.09): KVKK
   * baglantisindan Turkceye indirgenmis dosyanin "İngilizce çevirisi yok"
   * notu, Excel'in actigi sekmede gorunmezse kullaniciya hic ulasmaz (HTTP
   * uyari basligi ham indirmede gorunmez).
   */
  acilisNotu?: string;
  /** Baslik blogundaki "Tarih:" — verilmezse bugun (testler sabitler). */
  tarih?: Date;
}

export interface StandartCiktiSonuc {
  buffer: Buffer;
  /** EX7: gorunur self-check ozeti */
  ozet: string;
  /** Teklif geneli toplam — Excel'in gosterecegi rakam (yeniden hesap dahil) */
  genelToplam: number;
  /** Dosyaya yazilan fiyat/tutar hucresi sayisi */
  yazilan: number;
  /** Fiyatsiz (eslesmemis) veri satiri toplami — format yoluyla AYNI olcut */
  fiyatsizSatir: number;
  /** Dosyadaki toplami miktar × birim fiyatla tutmadigi icin yeniden hesaplanan satir */
  yenidenHesaplanan: number;
  /**
   * F5 KARISIK KIP: birim basina teklif geneli (sabit sira ₺, $, €). Yalniz
   * karisik teklifte dolu; o zaman `genelToplam` YALNIZ ₺ kovasidir — dolar
   * liraya eklenmez, cevrim yapilmaz.
   */
  birimliGenelToplam?: Array<{ pb: ParaBirimi; toplam: number }>;
}

/** TR-bilinçli sayi parse (Bulgu B7/B8 siniri): "1.234,56" → 1234.56,
 *  "87,5" → 87.5, "313" → 313.
 *  ⚠ ILK SURUM HATALIYDI: duz `.replace(',', '.')` "1.234,56"yi "1.234.56"
 *  yapip parseFloat ile **1.234**'e dusuruyordu (386.417,28 → 386.417).
 *  ⚠ A2 (tur 3, olculdu): `parseFloat` metnin basindaki rakami SAYI yapiyordu —
 *  musterinin Excel'inde "35x240mm kanal" Malz. Birim 35, "3 adet" Miktar 3
 *  (ekran ve kayit 0 okurken). Okuyucu artik ekranla AYNI makine kurali
 *  (`makineSayiOku` ≡ on yuz `sayiOku`, parite H12): harf/olcu metni sayi degil. */
const sayi = (v: unknown): number => makineSayiOku(v) ?? 0;

const simge = (kod?: string) => (kod === 'USD' ? '$' : kod === 'EUR' ? '€' : '₺');

/** Bir teklif sayfasinin standart tabloya yazilmasindan donen bilgi —
 *  format yolunda ICMAL SUM formullerini kurmak icin gerekir (EX8/KF7). */
export interface StandartSayfaBilgi {
  wsName: string;
  /** Malz. Toplam kolonu (9 kolonluk semada 6) */
  matCol: number;
  /** İşç. Toplam kolonu (9 kolonluk semada 8) */
  labCol: number;
  /**
   * ICMAL'e KATKI VEREN satirlarin GERCEK satir numaralari (1-tabanli) —
   * `matDeger`/`labDeger`e giren satirlarin TAMAMI ve YALNIZI.
   *
   * ⚠ NEDEN `ilkVeri..sonVeri` ARALIGI DEGIL (hesap dogrulugu turu, 13.09):
   * bitisik aralik, sayfa ortasindaki ARA TOPLAM (`_ozet`) satirlarini ve
   * musterinin kendi İcmal sayfasini da kapsiyordu. Onbellek dogru, formul
   * YANLIS cikiyordu: FIRMA-C'de GENEL TOPLAM onbellekte 74.452.440, Excel
   * yeniden hesaplayinca 223.357.320 (3 kat). SUM bu listeden kurulur
   * (export-engine.ts `sekmeOzetiKur`); satir numarasi yazim ANINDA
   * `satir.number`dan okunur, sabit bir baslik konumu VARSAYILMAZ.
   */
  toplamSatirlari: number[];
  matDeger: number;
  labDeger: number;
  yazilan: number;
  /** Ne birim ne toplam fiyati olan (ozet olmayan) veri satiri — rol alanlariyla */
  fiyatsizSatir: number;
  ozet: boolean;
  /** 'metin': kalemsiz sayfa — fiyat sutunu ve SAYFA TOPLAMI yok (tarif §4) */
  tur: 'kalem' | 'metin';
  /** SAYFA TOPLAMI satirinin numarasi — GENEL TOPLAM buna baglanir; yoksa null */
  toplamSatiri: number | null;
  /** Dosyadaki toplami carpimla tutmayan, Excel'de yeniden hesaplanan satir */
  yenidenHesaplanan: number;
  /** F5 karisik kip: birim basina SAYFA TOPLAMI satirlari (GENEL TOPLAM buna baglanir). */
  birimToplamlari?: BirimToplami[];
  /** Karisik kip: birim basina tutarlar (₺, $, € sirasi) — format yolunun İCMAL'i
   *  bunlarla sayfa × birim satiri kurar; SAYFA TOPLAMI yazilmasa da dolu. */
  birimKovalari?: BirimKovasi[];
}

/** Ciktinin kendi ozet sayfasi — teklif sayfalari bu adi ALAMAZ (I9). */
export const GENEL_TOPLAM_SAYFA_ADI = 'GENEL TOPLAM';

/**
 * Workbook'ta ALINMAMIS sayfa adi: cakisirsa " (2)", " (3)" … eklenir, Excel'in
 * 31 karakter siniri korunur.
 *
 * ⚠ IKI KUCULTME BIRDEN (para dogrulugu turu, 14.09 — I10, olculdu): Turkce
 * yerel ayarli kucultme "ICMAL"i "ıcmal" yapar, ExcelJS'in kendi kontrolu duz
 * `toLowerCase` ile "icmal" yapar. Yalniz TR kuralina bakan kontrol "ICMAL" +
 * "icmal" ciftini FARKLI sanip gecirir, ExcelJS "Worksheet name already exists"
 * ile ciktiyi DUSURURDU (HTTP 400, dosya inmez). Iki kuraldan BIRINDE esit olan
 * ad alinmis sayilir.
 * ⚠ REZERVE AD (I9): fiyatli cikti kendi "GENEL TOPLAM" sayfasini ekler;
 * teklifte ayni adli sayfa varsa once o adi alip ozet sayfasini dusuruyordu.
 */
export function benzersizSayfaAdi(wb: ExcelJS.Workbook, istenen: string, rezerveAdlar: readonly string[] = []): string {
  const anahtarlar = (x: string) => [x.toLocaleLowerCase('tr'), x.toLowerCase()];
  const alinmis = new Set<string>();
  for (const ad of [...wb.worksheets.map((w) => w.name), ...rezerveAdlar]) anahtarlar(ad).forEach((k) => alinmis.add(k));
  const cakisir = (ad: string) => anahtarlar(ad).some((k) => alinmis.has(k));
  const temel = istenen.slice(0, 31);
  let ad = temel;
  for (let n = 2; cakisir(ad); n++) {
    const ek = ` (${n})`;
    ad = temel.slice(0, 31 - ek.length) + ek;
  }
  return ad;
}

export interface SayfaYazOpsiyon {
  /** Teklif sayfalarinin ALAMAYACAGI adlar (ciktinin kendi sayfalari — I9). */
  rezerveAdlar?: readonly string[];
  /** EX6: hedef para birimi (null = TRY, cevrim yok) */
  birim?: CiktiBirim | null;
  /** Sayfa alti toplam satiri eklensin mi (fiyatli cikti: EVET,
   *  format yolu: ICMAL zaten topluyor → HAYIR) */
  toplamSatiri?: boolean;
  /** 'en' → kolon basliklari ve BIRIM kisaltmalari Ingilizce yazilir.
   *  Bu metinler SABIT oldugu icin AI'ya gitmez (bkz. `cikti-dil.ts`). */
  dil?: string;
  /** Firma anteti — tablodan ONCE yazilir; baslik ve veri satirlari asagi kayar,
   *  ICMAL SUM araliklari `satir.number`dan geldigi icin birlikte kayar. */
  antet?: AntetBilgi | null;
  /** Teklif adi — baslik blogunun 1. satiri ve alt bilgi (tarif §2/§6). */
  baslik?: string;
  /** Baslik blogundaki tarih (verilmezse bugun). */
  tarih?: Date;
  /**
   * F5 KARISIK KIP (`dovizliTarafVarMi`, F6a): taraflar kendi biriminde, `birim` YOK
   * SAYILIR (cevrim yapilmaz); gizli J/K birim sutunlari + birim basina SAYFA
   * TOPLAMI. Format yolu da verir (İCMAL, 05.10): orada SAYFA TOPLAMI yok,
   * İCMAL sayfa × birim satirlariyla J/K'ya SUMIF baglanir (`birimKovalari`).
   */
  karisik?: boolean;
}

/** Sayfaya yazilan TEK para kenari (malzeme ya da iscilik): E/F ya da G/H. */
interface ParaKenari {
  /** Birim fiyat hucresi — TAM hassasiyet (bkz. `kenarYaz`); 0 → bos */
  birim: number;
  /** Toplam hucresinin sayisal icerigi (kurus); bos ya da `""` sonuclu formul → null */
  toplamK: number | null;
  /** Dosyadaki toplam carpimla tutmadi, Excel yeniden hesapladi */
  yeniden: boolean;
}

/**
 * Bir kenarin birim + toplam hucresini yazar (tarif §3 formulleri).
 *
 * KURAL: toplam hucresine FORMUL yazilir — ama yalniz formul EKRANIN
 * gosterdigi rakami birebir uretiyorsa. Uretmiyorsa ekranin rakami DEGER
 * olarak yazilir. Tek istisna Emre'nin karari (23.09 "Excel yeniden
 * hesaplasın"): dosyanin kendi toplami miktar × birim fiyatla TL'de tutmuyorsa
 * formul yazilir ve Excel carpimi gosterir (`yeniden`, ozette sayilir).
 *
 * Ekranin rakami (`satirTarafi`): kayitli toplam; BOSSA birim × miktar YUKARI
 * 1 hane (`hesaplaSatirToplam` — ice aktarmada `toplamlariTamamla` da ayni).
 * Formul adaylari, ilk tutan secilir:
 *  · `IF(E="","",ROUND(C*E,2))` — dosyanin/elle girilen tutarli satir. KURUS-TAM:
 *    SAYFA TOPLAMI'nin SUM'i ekranin kurus toplamiyla ayni kalir.
 *  · `IF(E="","",ROUNDUP(C*E,1))` — uygulamanin kendi hesapladigi satir
 *    (yalniz TL ve pozitif tutar: uygulama yuvarlamayi TL'de yapar; Excel'in
 *    ROUNDUP'i negatifte sifirdan uzaga, uygulamanin `ceil`i yukari gider).
 *  · hicbiri → ekranin rakami DEGER (dovizde TL'de yuvarlanmis satir: ROUNDUP
 *    dolar uzerinde calissa cent sapardi — H4b dovizde ekran = cikti kapisi).
 * Diger durumlar:
 *  · Birim fiyat yok ama toplam var (Bursa: 939 hucrenin 939'u) → toplam DEGER.
 *    Tarifin formulu burada tutari SILERDI.
 *  · Miktar sayi degil (goturu) → toplam deger; carpilacak bir sey yok.
 *  · FITTING satiri (`_fitting`, 02.09) → kayitli DEGER: tutar kapsamin orani
 *    (`ceil1(kapsam × oran/100)`), birim hucresi yalniz gosterim
 *    (`ceil1(kapsam/100)`) — C × E tutari VERMEZ.
 *  · Kayitli toplam "0" BOS DEGILDIR: ekran onu 0 gosterir; carpimdan farkliysa
 *    dosya tutarsiz sayilir.
 *
 * ⚠ BIRIM HUCRESI TAM HASSASIYET (kurusa yuvarlanmaz): dosyada 13,4725 birim
 * × 100 = 1.347,25 toplamli satirda kurusa yuvarlanmis birimle formul
 * 1.347,00 hesaplardi — tutarli satir "yeniden hesaplanmis" gibi kayardi.
 * Gorunen rakam degismez (bicim 2 hane). Dovizde E = birim × oran.
 *
 * `hane` (F5, karar 4): ekranin yukari yuvarlama hanesi. Varsayilan ₺ kurali
 * (1 hane); karisik kipte dovizli taraf KENDI biriminde 2 hane yukari
 * yuvarlanir → formul `ROUNDUP(C*E,2)`. Tutarlilik da o haneyle olculur:
 * 1 hane kurali $31,66'yi (3 × 10,551) "tutarsiz" sayip Excel'e 31,65 yazdirirdi.
 */
function kenarYaz(
  satir: ExcelJS.Row, birimKol: number, miktar: number | null,
  birimTL: number, toplamTL: number | null, oran: number, fmt: string, sabitDeger: boolean, hane = ONDALIK,
): ParaKenari {
  const n = satir.number;
  const bk = String.fromCharCode(64 + birimKol);
  const birim = birimTL * oran;
  const bHucre = satir.getCell(birimKol);
  const tHucre = satir.getCell(birimKol + 1);
  if (birim !== 0) { bHucre.value = birim; bHucre.numFmt = fmt; }
  tHucre.numFmt = fmt;
  const formul = (ifade: string, sonucK: number | null) => {
    tHucre.value = { formula: `IF(${bk}${n}="","",${ifade})`, result: sonucK === null ? '' : sonucK / 100 } as ExcelJS.CellFormulaValue;
  };
  const yuvarla = `ROUND(C${n}*${bk}${n},2)`;

  if (!sabitDeger && birimTL !== 0 && miktar !== null) {
    const carpimTL = miktar * birimTL;
    // Dosya tutarliligi TL'de olculur (doviz cevrimi yuvarlamasi tutarsizlik DEGIL)
    const toplamTLK = toplamTL === null ? null : kurusTamsayi(toplamTL);
    const tutarsiz = toplamTLK !== null && toplamTLK !== kurusTamsayi(carpimTL) && toplamTLK !== kurusTamsayi(yukariYuvarla(carpimTL, hane));
    const yuvarlaK = kurusTamsayi(miktar * birim);
    if (tutarsiz) {
      formul(yuvarla, yuvarlaK);
      return { birim, toplamK: yuvarlaK, yeniden: true };
    }
    const ekranK = kurusTamsayi((toplamTL ?? yukariYuvarla(carpimTL, hane)) * oran);
    if (yuvarlaK === ekranK) {
      formul(yuvarla, yuvarlaK);
    } else if (oran === 1 && carpimTL > 0 && kurusTamsayi(yukariYuvarla(carpimTL, hane)) === ekranK) {
      formul(`ROUNDUP(C${n}*${bk}${n},${hane})`, ekranK);
    } else {
      tHucre.value = ekranK / 100;
    }
    return { birim, toplamK: ekranK, yeniden: false };
  }
  const toplamK = toplamTL === null ? 0 : kurusTamsayi(toplamTL * oran);
  if (toplamK) {
    tHucre.value = toplamK / 100;
    return { birim, toplamK, yeniden: false };
  }
  // Fiyatsiz kalem: formul yine yazilir — musteri birim fiyati girince toplam kendiliginden cikar.
  if (!sabitDeger && miktar !== null) formul(yuvarla, null);
  return { birim, toplamK: null, yeniden: false };
}

const KALEM_YAZISI = yazi(10, RENK.METIN);
const NO_YAZISI = yazi(9, RENK.ARDUVAZ);
const ORTALI: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };

/** Arial genislik kestirimi (px) — birlesik/kaydirmali hucrede Excel satir
 *  yuksekligini KENDISI ayarlamaz; tasan metin kesilmesin diye satir sayisi. */
function satirSayisi(metin: string, punto: number, genislikPx: number): number {
  let em = 0;
  for (const ch of metin) {
    if (ch === ' ' || /[.,:;'"!|ıilIj()\-]/.test(ch)) em += 0.3;
    else if (/\d/.test(ch)) em += 0.56;
    else if (ch !== ch.toLocaleLowerCase('tr')) em += 0.7;
    else em += 0.54;
  }
  // %10 pay: kaydirma kelime sinirinda yapilir, satir sonlari bosluk birakir
  return Math.max(1, Math.ceil((em * punto * (96 / 72) * 1.1) / genislikPx));
}

/** B (Malzeme Adı) kaydirma genisligi ve not satirinin B–I birlesik genisligi (px). */
const AD_PX = kolonPx(KALEM_GENISLIKLERI[1]) - 6;
const NOT_PX = KALEM_GENISLIKLERI.slice(1).reduce((a, g) => a + kolonPx(g), 0) - 6;
/** F5 karisik kip: Genel Toplam sutunu (karma satirin iki tutari) ve kaydirma genisligi (px). */
const KARMA_TOPLAM_GENISLIGI = 26;
const KARMA_PX = kolonPx(KARMA_TOPLAM_GENISLIGI) - 6;

/** SUM araligi: ilk..son, ARA TOPLAM (`_ozet`) satirlari ATLANARAK (13.09 "3 kat" dersi). */
function toplamFormulu(kolon: string, ilk: number, son: number, haric: ReadonlySet<number>): string {
  const parcalar: string[] = [];
  let bas: number | null = null;
  for (let r = ilk; r <= son + 1; r++) {
    const icerde = r <= son && !haric.has(r);
    if (icerde && bas === null) bas = r;
    if (!icerde && bas !== null) { parcalar.push(`${kolon}${bas}:${kolon}${r - 1}`); bas = null; }
  }
  // Excel bir fonksiyona en fazla 255 arguman kabul eder
  const gruplar: string[] = [];
  for (let i = 0; i < parcalar.length; i += 255) gruplar.push(`SUM(${parcalar.slice(i, i + 255).join(',')})`);
  return gruplar.join('+') || '0';
}

/** I (Genel Toplam) formulu: iki kenar ya da (karisik kipte birimler farkliyken) yalniz dolu kenar. */
function genelToplamFormulu(n: number, kaynak: 'ikisi' | 'malzeme' | 'iscilik'): string {
  if (kaynak === 'malzeme') return `IF(F${n}="","",F${n})`;
  if (kaynak === 'iscilik') return `IF(H${n}="","",H${n})`;
  return `IF(COUNT(F${n},H${n})=0,"",SUM(F${n},H${n}))`;
}

/** Kalem satirinin gorunumu (A–I): No soluk, Genel Toplam kalin, ad sola kaydirmali. */
function kalemSatiriBicimle(satir: ExcelJS.Row, miktar: number | null): void {
  satir.eachCell({ includeEmpty: true }, (c, k) => {
    if (k > 9) return;
    c.font = k === 1 ? NO_YAZISI : k === 9 ? yazi(10, RENK.METIN, { bold: true }) : KALEM_YAZISI;
    c.alignment = k === 2 ? { horizontal: 'left', vertical: 'middle', wrapText: true } : ORTALI;
    c.border = ALT_CIZGI;
  });
  if (miktar !== null) satir.getCell(3).numFmt = miktarBicimi(miktar);
}

/**
 * F5 karar 2: karisik kapsamli FITTING birim BASINA ayri satir ("… — ₺ kısmı",
 * "… — $ kısmı"; tek birimde ad eksiz). Tutarlar DEGER: on yuzun
 * `_fittingBirimli`si (kapsam × oran, birimin hanesiyle yukari) — C × E tutari
 * vermez (bkz. kenarYaz FITTING). Birim fiyat hucresi bos, No yalniz ilk parcada.
 */
function karisikFittingYaz(
  ws: ExcelJS.Worksheet, ad: string, no: number | string, miktar: number | null, birimMetni: string | null, fb: unknown, dil?: string,
): { satirlar: number[]; parcalar: FittingParcasi[]; yazilan: number; fiyatsiz: boolean } {
  const parcalar = fittingParcalari(fb);
  const satirlar: number[] = [];
  let yazilan = 0;
  parcalar.forEach((x, i) => {
    const etiket = parcalar.length > 1 ? `${ad} — ${SEMBOL[x.pb]} ${dil === 'en' ? 'part' : 'kısmı'}` : ad;
    const satir = ws.addRow([i === 0 && no !== '' ? no : null, etiket, miktar, birimMetni]);
    satir.height = 18 + (satirSayisi(etiket, 10, AD_PX) - 1) * 12.75;
    const n = satir.number;
    satir.getCell(6).value = x.matK === null ? null : x.matK / 100;
    satir.getCell(8).value = x.labK === null ? null : x.labK / 100;
    const genelK = x.matK === null && x.labK === null ? null : (x.matK ?? 0) + (x.labK ?? 0);
    satir.getCell(9).value = {
      formula: `IF(COUNT(F${n},H${n})=0,"",SUM(F${n},H${n}))`, result: genelK === null ? '' : genelK / 100,
    } as ExcelJS.CellFormulaValue;
    for (const k of [5, 6, 7, 8, 9]) satir.getCell(k).numFmt = paraBicimi(x.pb);
    satir.getCell(BIRIM_SUTUNLARI.malzeme).value = x.pb;
    satir.getCell(BIRIM_SUTUNLARI.iscilik).value = x.pb;
    kalemSatiriBicimle(satir, miktar);
    yazilan += [x.matK, x.labK, genelK].filter((v) => v !== null && v !== 0).length;
    satirlar.push(n);
  });
  return { satirlar, parcalar, yazilan, fiyatsiz: parcalar.every((x) => x.matK === null && x.labK === null) };
}

function kalemSayfasiYaz(
  wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, plan: SayfaPlani, alan: AlanHaritasi, ops: SayfaYazOpsiyon,
): Omit<StandartSayfaBilgi, 'wsName' | 'ozet'> {
  const karisik = !!ops.karisik;
  // F5: karisik kipte taraflar KENDI biriminde — goruntuleme birimi yok sayilir (cevrim yok)
  const birim = karisik ? null : ops.birim ?? null;
  const oran = birim && birim.kod !== 'TRY' ? birim.katsayi : 1;
  const fmt = paraBicimi(birim?.kod ?? 'TRY');

  ws.columns = KALEM_GENISLIKLERI.map((width) => ({ width }));
  if (karisik) {
    // Karma satirin iki tutari ("$2.680,00 + 10.720,00 ₺") 18'lik sutuna sigmiyordu (PDF'te
    // iki kenardan kesildi, 05.10) — prototipin genisligi
    ws.getColumn(9).width = KARMA_TOPLAM_GENISLIGI;
    // Gizli birim sutunlari (J/K): SAYFA TOPLAMI'nin SUMIF olcutu; baski alani A:I kalir
    for (const k of [BIRIM_SUTUNLARI.malzeme, BIRIM_SUTUNLARI.iscilik]) {
      ws.getColumn(k).width = BIRIM_SUTUN_GENISLIGI;
      ws.getColumn(k).hidden = true;
    }
  }
  // ANTET (plan 4.4): tablo YAZILMADAN once. Sonradan satir eklemek YASAK —
  // ExcelJS formul referanslarini guncellemez (bkz. antet.ts SUM GUVENLIGI).
  antetYaz(wb, ws, ops.antet, { metinKolonu: 2, logoKolonu: 7 });
  baslikBloguYaz(ws, {
    baslik: ops.baslik ?? '', altBaslik: ws.name,
    tarih: `${ciktiMetni('Tarih', ops.dil)}: ${tarihMetni(ops.tarih ?? new Date())}`,
    ilkKolon: 1, sonKolon: 9,
  });
  const bas = tabloBasligiYaz(ws, karisik ? [...kolonlar(ops.dil), ...birimSutunBasliklari(ops.dil)] : kolonlar(ops.dil), [2], 30);
  const ilkVeri = bas.number + 1;

  // No: tarif "yalniz kalemlere 1, 2, 3…". Dosyanin KENDI numarasi varsa
  // (No rolu "poz no"yu da yakalar: 15.140.1003) o korunur — silinirse kamu
  // tekliflerinde poz bilgisi kaybolurdu.
  const kaynakNumarali = plan.satirlar.some((p) => p.tur === 'kalem' && String(p.satir[alan.no] ?? '').trim() !== '');
  let sira = 0;

  let matToplamK = 0; let labToplamK = 0; let yazilan = 0; let fiyatsizSatir = 0; let yeniden = 0;
  const toplamSatirlari: number[] = [];
  const ozetSatirlari = new Set<number>();
  const kovalar: Kovalar = new Map(); // F5 karisik: birim basina sayfa toplami

  for (const p of plan.satirlar) {
    if (p.tur === 'kalem') {
      const r = p.satir;
      const { miktar, birim: birimMetni } = miktarVeBirim(r, alan);
      const kaynakNo = String(r[alan.no] ?? '').trim();
      const no = kaynakNumarali ? (/^[1-9]\d{0,6}$/.test(kaynakNo) ? Number(kaynakNo) : kaynakNo) : ++sira;
      if (karisik && r._fitting && r._fittingBirimli) {
        const f = karisikFittingYaz(ws, p.ad, no, miktar, birimCevir(birimMetni, ops.dil) || null, r._fittingBirimli, ops.dil);
        for (const x of f.parcalar) { kovayaEkle(kovalar, x.pb, 'mat', x.matK); kovayaEkle(kovalar, x.pb, 'lab', x.labK); }
        toplamSatirlari.push(...f.satirlar);
        yazilan += f.yazilan;
        if (f.fiyatsiz) fiyatsizSatir++;
        continue;
      }
      const satir = ws.addRow([
        no === '' ? null : no, p.ad,
        // A2: okunamayan miktar metni ("Ø100 PVC boru") BOS yazilir — 0 da uydurma sayi da degil
        miktar,
        // Birim SABIT bir kumedir ("mt", "ad", "set") — sozlukle cevrilir, AI'ya gitmez.
        birimCevir(birimMetni, ops.dil) || null,
      ]);
      satir.height = 18 + (satirSayisi(p.ad, 10, AD_PX) - 1) * 12.75;
      const toplamOku = (k: string) => (String(r[k] ?? '').trim() === '' ? null : sayi(r[k]));
      const fitting = !!r._fitting; // birim hucresi gosterim, tutar kapsamdan (bkz. kenarYaz)
      // F5: karisik kipte her taraf KENDI biriminin bicimi ve yuvarlama hanesiyle
      const matPB = karisik ? tarafPB(r, 'malzeme') : null;
      const labPB = karisik ? tarafPB(r, 'iscilik') : null;
      const mat = kenarYaz(satir, 5, miktar, sayi(r[alan.matBirim]), toplamOku(alan.matToplam), oran,
        matPB ? paraBicimi(matPB) : fmt, fitting, matPB ? paraHanesi(matPB) : undefined);
      const lab = kenarYaz(satir, 7, miktar, sayi(r[alan.labBirim]), toplamOku(alan.labToplam), oran,
        labPB ? paraBicimi(labPB) : fmt, fitting, labPB ? paraHanesi(labPB) : undefined);
      const n = satir.number;
      const genelK = mat.toplamK === null && lab.toplamK === null ? null : (mat.toplamK ?? 0) + (lab.toplamK ?? 0);
      // F5: karisik kipte I hucresinin kurali tek yerde (karma METIN / tek taraf / bos)
      const kt = matPB && labPB ? karisikToplamHucresi(matPB, mat.toplamK, labPB, lab.toplamK) : null;
      if (kt?.tur === 'metin') {
        satir.getCell(9).value = kt.metin;
      } else if (kt?.tur !== 'bos') {
        const kaynak = kt?.kaynak ?? 'ikisi';
        const sonucK = kaynak === 'malzeme' ? mat.toplamK : kaynak === 'iscilik' ? lab.toplamK : genelK;
        satir.getCell(9).value = {
          formula: genelToplamFormulu(n, kaynak), result: sonucK === null ? '' : sonucK / 100,
        } as ExcelJS.CellFormulaValue;
        satir.getCell(9).numFmt = kt ? paraBicimi(kt.pb) : fmt;
      }
      if (matPB && labPB) {
        satir.getCell(BIRIM_SUTUNLARI.malzeme).value = matPB;
        satir.getCell(BIRIM_SUTUNLARI.iscilik).value = labPB;
        kovayaEkle(kovalar, matPB, 'mat', mat.toplamK);
        kovayaEkle(kovalar, labPB, 'lab', lab.toplamK);
      }
      kalemSatiriBicimle(satir, miktar);
      if (kt?.tur === 'metin') {
        // Buyuk tutarlar genis sutuna da sigmayabilir: kelime sinirinda kaydir, yukseklik metne gore
        satir.getCell(9).alignment = { ...ORTALI, wrapText: true };
        satir.height = Math.max(Number(satir.height) || 18, 18 + (satirSayisi(String(satir.getCell(9).value), 10, KARMA_PX) - 1) * 12.75);
      }

      yazilan += [mat.birim, mat.toplamK, lab.birim, lab.toplamK, genelK].filter((v) => v !== null && v !== 0).length;
      matToplamK += mat.toplamK ?? 0;
      labToplamK += lab.toplamK ?? 0;
      if (mat.yeniden || lab.yeniden) yeniden++;
      toplamSatirlari.push(n);
      if (!(sayi(r[alan.matBirim]) > 0) && !(sayi(r[alan.labBirim]) > 0) && !sayi(r[alan.matToplam]) && !sayi(r[alan.labToplam])) fiyatsizSatir++;
      continue;
    }
    if (p.tur === 'ozet') {
      // ARA TOPLAM / musterinin İcmal satiri: GORUNUR ama toplama ve ICMAL
      // SUM'ina GIRMEZ (30.07 karari — cift sayim yasagi). Dosyanin kendi
      // rakamidir; formul degil deger, soluk italik.
      const r = p.satir;
      const K = (v: unknown) => kurusTamsayi(sayi(v) * oran);
      const d = [K(r[alan.matBirim]), K(r[alan.matToplam]), K(r[alan.labBirim]), K(r[alan.labToplam])];
      const hucre = (k: number) => (k ? k / 100 : null);
      const satir = ws.addRow([null, p.ad, makineSayiOku(r[alan.miktar]), birimCevir(r[alan.birim], ops.dil) || null,
        hucre(d[0]), hucre(d[1]), hucre(d[2]), hucre(d[3]), hucre(d[1] + d[3])]);
      satir.height = 18;
      satir.eachCell({ includeEmpty: true }, (c, k) => {
        if (k > 9) return;
        c.font = yazi(10, RENK.SOLUK, { italic: true });
        c.alignment = k === 2 ? { horizontal: 'left', vertical: 'middle', wrapText: true } : ORTALI;
        c.border = ALT_CIZGI;
        if (k >= 5 && typeof c.value === 'number') { c.numFmt = fmt; yazilan++; }
      });
      ozetSatirlari.add(satir.number);
      continue;
    }
    if (p.tur === 'altBaslik') {
      const satir = ws.addRow([null, p.metin]);
      satir.height = 20;
      for (let k = 1; k <= 9; k++) satir.getCell(k).fill = dolgu(RENK.ARA_BASLIK);
      satir.getCell(2).font = yazi(10, RENK.LACIVERT, { bold: true });
      satir.getCell(2).alignment = { vertical: 'middle' };
      continue;
    }
    if (p.tur === 'not') {
      const satir = ws.addRow([null, p.metin]);
      ws.mergeCells(satir.number, 2, satir.number, 9);
      satir.height = 18 + (satirSayisi(p.metin, 9, NOT_PX) - 1) * 11.5;
      satir.getCell(2).font = yazi(9, RENK.SOLUK, { italic: true });
      satir.getCell(2).alignment = { vertical: 'middle', wrapText: true };
    }
  }
  const sonVeri = Math.max(ilkVeri, ws.rowCount);

  let toplamSatiri: number | null = null;
  let birimToplamlari: BirimToplami[] | undefined;
  if (ops.toplamSatiri !== false && karisik) {
    // F5: birim BASINA SAYFA TOPLAMI — SUMIF(J/K, birim); ozet satirinin birim hucresi bos, girmez
    ws.addRow([]);
    birimToplamlari = birimToplamSatirlariYaz(ws, kovalar, ilkVeri, sonVeri, ops.dil);
    toplamSatiri = birimToplamlari[0].satir;
  } else if (ops.toplamSatiri !== false) {
    // Tarif §3: bir bos satir, sonra SAYFA TOPLAMI = SUM(ilk veri : son veri) — ozet satirlari haric
    ws.addRow([]);
    const t = ws.addRow([null, ciktiMetni('SAYFA TOPLAMI', ops.dil)]);
    t.height = 22;
    const sonuc: Record<number, number> = { 6: matToplamK, 8: labToplamK, 9: matToplamK + labToplamK };
    for (const k of [6, 8, 9]) {
      const harf = String.fromCharCode(64 + k);
      t.getCell(k).value = { formula: toplamFormulu(harf, ilkVeri, sonVeri, ozetSatirlari), result: sonuc[k] / 100 } as ExcelJS.CellFormulaValue;
      t.getCell(k).numFmt = fmt;
    }
    toplamSatiriBicimle(t);
    toplamSatiri = t.number;
  }

  // Tarif §3 gorunum: kilavuz cizgisi yok, bolme C5'ten (antet varsa basligin altindan)
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: bas.number, topLeftCell: `C${ilkVeri}`, showGridLines: false }];
  ws.properties.tabColor = { argb: RENK.SEKME_KALEM };
  baskiAyarla(ws, { yatay: true, sonKolon: 9, sonSatir: ws.rowCount, tekrarSatiri: bas.number, teklifAdi: ops.baslik ?? '', dil: ops.dil });

  // F5: karisik kipte tek sayili toplam YALNIZ ₺ kovasidir (dolar liraya eklenmez)
  const tl = karisik ? kovalar.get('TRY') ?? { matK: 0, labK: 0 } : { matK: matToplamK, labK: labToplamK };
  return {
    matCol: 6, labCol: 8, toplamSatirlari,
    matDeger: tl.matK / 100, labDeger: tl.labK / 100,
    yazilan, fiyatsizSatir, tur: 'kalem', toplamSatiri, yenidenHesaplanan: yeniden,
    ...(birimToplamlari ? { birimToplamlari } : {}),
    ...(karisik ? { birimKovalari: kovaListesi(kovalar) } : {}),
  };
}

/** Tarif §4: kalemsiz sayfa DUZ METIN — her paragraf B–C birlesik tek satir. */
function metinSayfasiYaz(
  wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, plan: SayfaPlani, ops: SayfaYazOpsiyon,
): Omit<StandartSayfaBilgi, 'wsName' | 'ozet'> {
  ws.columns = METIN_GENISLIKLERI.map((width) => ({ width }));
  // Logo B+C'nin SAG kenarina yaslanir (C tek basina logoya dar: 16 karakter)
  antetYaz(wb, ws, ops.antet, { metinKolonu: 2, logoKolonu: 2, logoSagKenarPx: kolonPx(96) + kolonPx(16) - 16 });
  baslikBloguYaz(ws, {
    baslik: ops.baslik ?? '', altBaslik: ws.name,
    tarih: `${ciktiMetni('Tarih', ops.dil)}: ${tarihMetni(ops.tarih ?? new Date())}`,
    ilkKolon: 2, sonKolon: 3,
  });
  ws.addRow([]); // tablo basligi satiri bos — paragraflar da kalem sayfasindaki gibi 5. satirdan (antetsiz)
  for (const p of plan.satirlar) {
    if (p.tur !== 'paragraf') continue;
    const satir = ws.addRow([null, p.metin]);
    ws.mergeCells(satir.number, 2, satir.number, 3);
    // Tarif: ~13 × satir sayisi + 9 (bir satira ~125 karakter)
    satir.height = 13 * Math.max(1, Math.ceil(p.metin.length / 125)) + 9;
    const h = satir.getCell(2);
    h.font = p.baslik ? yazi(10, RENK.LACIVERT, { bold: true }) : yazi(10, RENK.METIN);
    h.alignment = { vertical: 'middle', wrapText: true }; // yatay "genel" = metin sola (referansla ayni)
    h.border = ALT_CIZGI;
    satir.getCell(3).border = ALT_CIZGI;
  }
  ws.views = [{ showGridLines: false }];
  ws.properties.tabColor = { argb: RENK.SEKME_METIN };
  baskiAyarla(ws, { yatay: false, sonKolon: 3, sonSatir: ws.rowCount, teklifAdi: ops.baslik ?? '', dil: ops.dil });
  return {
    matCol: 6, labCol: 8, toplamSatirlari: [], matDeger: 0, labDeger: 0,
    yazilan: 0, fiyatsizSatir: 0, tur: 'metin', toplamSatiri: null, yenidenHesaplanan: 0,
  };
}

/**
 * EX1/EX8 — TEK DOLDURMA MOTORU (KF7).
 * Bir teklif sayfasini verilen workbook'a yazar: kalem sayfasi 9 kolonluk
 * STANDART tablo, kalemsiz sayfa duz metin. Hem "Fiyatlandırılmış Excel" hem
 * "Teklif Formatında Aktar" bunu kullanir; ikisi arasinda ikinci bir yazim
 * yolu YOKTUR.
 */
export function standartSayfaYaz(
  wb: ExcelJS.Workbook,
  sh: any,
  ops: SayfaYazOpsiyon = {},
): StandartSayfaBilgi {
  // Ad cakismasi: format dosyasinda AYNI adda bir sayfa olabilir (YILDIZ'da
  // format sablonunun "İcmal"i ile teklifin "İcmal" sayfasi cakisti →
  // ExcelJS "Worksheet name already exists" ile export'u DUSURDU).
  const ws = wb.addWorksheet(benzersizSayfaAdi(wb, String(sh.name ?? 'Sayfa'), ops.rezerveAdlar));
  const alan = alanHaritasi(sh.columnRoles);
  const plan = sayfaPlaniKur(sh.rowData ?? [], alan);
  const bilgi = plan.tur === 'kalem' ? kalemSayfasiYaz(wb, ws, plan, alan, ops) : metinSayfasiYaz(wb, ws, plan, ops);
  return { ...bilgi, wsName: ws.name, ozet: !!sh.isOzet };
}

interface OzetSatiri { ad: string; satir: number; matK: number; labK: number }

/** Tarif §5: GENEL TOPLAM — yalniz kalem sayfalari, her rakam SAYFA TOPLAMI'na formulle bagli. */
function ozetSayfasiYaz(
  wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, sayfalar: readonly OzetSatiri[], g: StandartCiktiGirdi, fmt: string,
): void {
  const dil = g.dil;
  ws.columns = OZET_GENISLIKLERI.map((width) => ({ width }));
  // Logo C+D'nin SAG kenarina yaslanir: C'nin solunda A+B'den tasan uzun antet
  // satirina (Tel · E-posta) yer kalir, D'yi asip baski alaninin disina da cikmaz.
  antetYaz(wb, ws, g.antet, { metinKolonu: 1, logoKolonu: 3, logoSagKenarPx: kolonPx(OZET_GENISLIKLERI[2]) + kolonPx(OZET_GENISLIKLERI[3]) - 8 });
  baslikBloguYaz(ws, {
    baslik: g.baslik ?? '', altBaslik: ciktiMetni('Fiyatlandırılmış teklif · Özet', dil),
    tarih: `${ciktiMetni('Tarih', dil)}: ${tarihMetni(g.tarih ?? new Date())}`,
    ilkKolon: 1, sonKolon: 4,
  });
  if (g.acilisNotu) {
    const n = ws.addRow([g.acilisNotu]);
    ws.mergeCells(n.number, 1, n.number, 4);
    n.height = 30;
    n.getCell(1).font = yazi(10, RENK.UYARI, { bold: true });
    n.getCell(1).alignment = { vertical: 'middle', wrapText: true };
  }
  const bas = tabloBasligiYaz(ws, dil === 'en' ? OZET_KOLONLAR_EN : ['Sayfa', 'Malzeme', 'İşçilik', 'Genel Toplam'], [1], 26, false);
  for (const s of sayfalar) {
    // Sayfa adi TIRNAKLI: adlarda bosluk ve Turkce harf var; icteki tirnak ikilenir
    const ref = `'${s.ad.replace(/'/g, "''")}'`;
    const row = ws.addRow([s.ad]);
    row.height = 20;
    const baglar: Array<[number, string, number]> = [[2, 'F', s.matK], [3, 'H', s.labK], [4, 'I', s.matK + s.labK]];
    for (const [k, kol, deger] of baglar) {
      row.getCell(k).value = { formula: `${ref}!${kol}${s.satir}`, result: deger / 100 } as ExcelJS.CellFormulaValue;
      row.getCell(k).numFmt = fmt;
    }
    row.eachCell({ includeEmpty: true }, (c, k) => {
      if (k > 4) return;
      c.font = yazi(10, RENK.METIN, { bold: k === 4 });
      c.alignment = k === 1 ? { horizontal: 'left', vertical: 'middle' } : ORTALI;
      c.border = ALT_CIZGI;
    });
  }
  const ilk = bas.number + 1;
  const son = ws.rowCount;
  ws.addRow([]);
  const gt = ws.addRow([ciktiMetni('TEKLİF GENEL TOPLAMI', dil)]);
  gt.height = 28;
  const toplamlar: Array<[number, number]> = [
    [2, sayfalar.reduce((a, s) => a + s.matK, 0)],
    [3, sayfalar.reduce((a, s) => a + s.labK, 0)],
    [4, sayfalar.reduce((a, s) => a + s.matK + s.labK, 0)],
  ];
  for (const [k, toplamK] of toplamlar) {
    const harf = String.fromCharCode(64 + k);
    // Kalem sayfasi yoksa (bos teklif) SUM'in bos araligi olmaz — 0 deger
    gt.getCell(k).value = sayfalar.length
      ? ({ formula: `SUM(${harf}${ilk}:${harf}${son})`, result: toplamK / 100 } as ExcelJS.CellFormulaValue)
      : 0;
    gt.getCell(k).numFmt = fmt;
  }
  for (let k = 1; k <= 4; k++) {
    const c = gt.getCell(k);
    c.fill = dolgu(RENK.LACIVERT);
    c.font = yazi(k === 1 || k === 4 ? 11 : 10, RENK.BEYAZ, { bold: true });
    c.alignment = k === 1 ? { horizontal: 'left', vertical: 'middle' } : ORTALI;
  }
  if (g.birim && g.birim.not) {
    ws.addRow([]);
    const n = ws.addRow([g.birim.not]);
    ws.mergeCells(n.number, 1, n.number, 4);
    n.getCell(1).font = yazi(9, RENK.SOLUK, { italic: true });
    n.getCell(1).alignment = { vertical: 'middle', wrapText: true };
  }
  ws.views = [{ showGridLines: false }];
  ws.properties.tabColor = { argb: RENK.SEKME_OZET };
  baskiAyarla(ws, { yatay: false, sonKolon: 4, sonSatir: ws.rowCount, tekrarSatiri: bas.number, teklifAdi: g.baslik ?? '', dil });
}

export async function standartCiktiUret(g: StandartCiktiGirdi): Promise<StandartCiktiSonuc> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MetaPrice';
  wb.created = new Date();

  // F5: karisik teklifte taraflar kendi biriminde — goruntuleme birimi sayfa
  // yaziminda YOK SAYILIR (cevrim yok), ozet sekmesi "Fiyatlar USD" notunu yazmaz
  const karisik = dovizliTarafVarMi(g.sheetsArr); // F6a: yalniz $/€ varken
  const birim = g.birim ?? null;
  const kod = birim?.kod ?? 'TRY';
  const tarih = g.tarih ?? new Date();

  // Tarif §1: GENEL TOPLAM ILK sekme (Excel dosyayi onda acar). Once BOS acilir
  // — sira icin — ve sayfalar yazildiktan SONRA doldurulur: formulleri her
  // sayfanin SAYFA TOPLAMI satirina baglanir, o satir yazimda belli olur.
  const ozetWs = wb.addWorksheet(GENEL_TOPLAM_SAYFA_ADI); // rezerve — teklif sayfalari bu adi alamaz (I9)

  let yazilan = 0; let fiyatsizSatir = 0; let yenidenHesaplanan = 0;
  const kalemSayfalari: OzetSatiri[] = [];
  const birimliSayfalar: BirimliSayfa[] = [];

  // KF7: sayfalar TEK motorla yazilir — format yolu da ayni fonksiyonu cagirir
  for (const sh of g.sheetsArr ?? []) {
    if (!sh || sh.isEmpty) continue;
    const b = standartSayfaYaz(wb, sh, {
      birim, toplamSatiri: true, dil: g.dil, antet: g.antet,
      rezerveAdlar: [GENEL_TOPLAM_SAYFA_ADI], baslik: g.baslik, tarih, karisik,
    });
    yazilan += b.yazilan;
    fiyatsizSatir += b.fiyatsizSatir;
    yenidenHesaplanan += b.yenidenHesaplanan;
    // Tarif §5: 0 TL'lik metin sayfalari ozete GIRMEZ. Ara toplam (`_ozet`)
    // satirlari sayfa toplamina zaten girmedi (30.07 cift sayim yasagi).
    if (b.tur === 'kalem' && b.toplamSatiri !== null) {
      kalemSayfalari.push({ ad: b.wsName, satir: b.toplamSatiri, matK: kurusTamsayi(b.matDeger), labK: kurusTamsayi(b.labDeger) });
      if (b.birimToplamlari) birimliSayfalar.push({ ad: b.wsName, toplamlar: b.birimToplamlari });
    }
  }
  if (karisik) karisikOzetSayfasiYaz(wb, ozetWs, birimliSayfalar, { ...g, tarih });
  else ozetSayfasiYaz(wb, ozetWs, kalemSayfalari, { ...g, tarih }, paraBicimi(kod));

  // Kurus tamsayi — sayfa toplamlari ile teklif geneli AYNI kuralla toplanir
  const genelToplamK = kalemSayfalari.reduce((a, s) => a + s.matK + s.labK, 0);
  const genelToplam = genelToplamK / 100;
  // F5: birim basina teklif geneli (karisikta `genelToplam` yalniz ₺ kovasidir)
  const birimTutarlari = birimliSayfalar.flatMap((s) => s.toplamlar);
  const birimliGenelToplam = karisik
    ? BIRIM_SIRASI
      .filter((pb) => birimTutarlari.some((t) => t.pb === pb))
      .map((pb) => ({ pb, toplam: birimTutarlari.filter((t) => t.pb === pb).reduce((a, t) => a + t.matK + t.labK, 0) / 100 }))
    : undefined;
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const tutar = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // EX7: gorunur self-check
  const ozet = [
    `${yazilan} değer aktarıldı ✓`,
    // P2-1b: 2 hane — ekran (PARA_ONDALIK) ve bu dosyanin numFmt'i ile ayni.
    birimliGenelToplam?.length
      ? `genel toplam ${birimliGenelToplam.map((x) => `${SEMBOL[x.pb]}${tutar(x.toplam)}`).join(' + ')}`
      : `genel toplam ${simge(kod)}${tutar(genelToplam)}`,
    // KARAR 23.09: Excel carpimi gosterir, ekran dosyanin rakamini — fark SOYLENIR
    yenidenHesaplanan ? `${yenidenHesaplanan} satırda dosyadaki toplam miktar × birim fiyatla tutmuyordu, Excel yeniden hesapladı` : '',
  ].filter(Boolean).join(' · ');

  return { buffer, ozet, genelToplam, yazilan, fiyatsizSatir, yenidenHesaplanan, ...(birimliGenelToplam ? { birimliGenelToplam } : {}) };
}
