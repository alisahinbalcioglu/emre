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
import { kurusTamsayi, yukariYuvarla } from '../../fiyat/matching/pricing';
// A2 (tur 3): kayitli grid hucresi MAKINE sinirindadir — on yuz `sayiOku` ikizi
import { makineSayiOku } from '../../kutuphane/utils/import-fidelity';
import { AntetBilgi, antetYaz } from '../../cikti/utils/antet';
import { AlanHaritasi, SayfaPlani, alanHaritasi, miktarVeBirim, sayfaPlaniKur } from './cikti-satirlari';
import {
  ALT_CIZGI, RENK, UST_KALIN_CIZGI, baskiAyarla, baslikBloguYaz, dolgu, miktarBicimi,
  paraBicimi, tabloBasligiYaz, tarihMetni, yazi,
} from './cikti-stil';

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
 */
function kenarYaz(
  satir: ExcelJS.Row, birimKol: number, miktar: number | null,
  birimTL: number, toplamTL: number | null, oran: number, fmt: string, sabitDeger: boolean,
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
    const tutarsiz = toplamTLK !== null && toplamTLK !== kurusTamsayi(carpimTL) && toplamTLK !== kurusTamsayi(yukariYuvarla(carpimTL));
    const yuvarlaK = kurusTamsayi(miktar * birim);
    if (tutarsiz) {
      formul(yuvarla, yuvarlaK);
      return { birim, toplamK: yuvarlaK, yeniden: true };
    }
    const ekranK = kurusTamsayi((toplamTL ?? yukariYuvarla(carpimTL)) * oran);
    if (yuvarlaK === ekranK) {
      formul(yuvarla, yuvarlaK);
    } else if (oran === 1 && carpimTL > 0 && kurusTamsayi(yukariYuvarla(carpimTL)) === ekranK) {
      formul(`ROUNDUP(C${n}*${bk}${n},1)`, ekranK);
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

const kolonPx = (genislik: number) => Math.floor(genislik * 7 + 5);
/** B (Malzeme Adı) kaydirma genisligi ve not satirinin B–I birlesik genisligi (px). */
const AD_PX = kolonPx(KALEM_GENISLIKLERI[1]) - 6;
const NOT_PX = KALEM_GENISLIKLERI.slice(1).reduce((a, g) => a + kolonPx(g), 0) - 6;

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

function kalemSayfasiYaz(
  wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, plan: SayfaPlani, alan: AlanHaritasi, ops: SayfaYazOpsiyon,
): Omit<StandartSayfaBilgi, 'wsName' | 'ozet'> {
  const birim = ops.birim ?? null;
  const oran = birim && birim.kod !== 'TRY' ? birim.katsayi : 1;
  const fmt = paraBicimi(birim?.kod ?? 'TRY');

  ws.columns = KALEM_GENISLIKLERI.map((width) => ({ width }));
  // ANTET (plan 4.4): tablo YAZILMADAN once. Sonradan satir eklemek YASAK —
  // ExcelJS formul referanslarini guncellemez (bkz. antet.ts SUM GUVENLIGI).
  antetYaz(wb, ws, ops.antet, { metinKolonu: 2, logoKolonu: 7 });
  baslikBloguYaz(ws, {
    baslik: ops.baslik ?? '', altBaslik: ws.name,
    tarih: `${ciktiMetni('Tarih', ops.dil)}: ${tarihMetni(ops.tarih ?? new Date())}`,
    ilkKolon: 1, sonKolon: 9,
  });
  const bas = tabloBasligiYaz(ws, kolonlar(ops.dil), [2], 30);
  const ilkVeri = bas.number + 1;

  // No: tarif "yalniz kalemlere 1, 2, 3…". Dosyanin KENDI numarasi varsa
  // (No rolu "poz no"yu da yakalar: 15.140.1003) o korunur — silinirse kamu
  // tekliflerinde poz bilgisi kaybolurdu.
  const kaynakNumarali = plan.satirlar.some((p) => p.tur === 'kalem' && String(p.satir[alan.no] ?? '').trim() !== '');
  let sira = 0;

  let matToplamK = 0; let labToplamK = 0; let yazilan = 0; let fiyatsizSatir = 0; let yeniden = 0;
  const toplamSatirlari: number[] = [];
  const ozetSatirlari = new Set<number>();

  for (const p of plan.satirlar) {
    if (p.tur === 'kalem') {
      const r = p.satir;
      const { miktar, birim: birimMetni } = miktarVeBirim(r, alan);
      const kaynakNo = String(r[alan.no] ?? '').trim();
      const no = kaynakNumarali ? (/^[1-9]\d{0,6}$/.test(kaynakNo) ? Number(kaynakNo) : kaynakNo) : ++sira;
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
      const mat = kenarYaz(satir, 5, miktar, sayi(r[alan.matBirim]), toplamOku(alan.matToplam), oran, fmt, fitting);
      const lab = kenarYaz(satir, 7, miktar, sayi(r[alan.labBirim]), toplamOku(alan.labToplam), oran, fmt, fitting);
      const n = satir.number;
      const genelK = mat.toplamK === null && lab.toplamK === null ? null : (mat.toplamK ?? 0) + (lab.toplamK ?? 0);
      satir.getCell(9).value = {
        formula: `IF(COUNT(F${n},H${n})=0,"",SUM(F${n},H${n}))`, result: genelK === null ? '' : genelK / 100,
      } as ExcelJS.CellFormulaValue;
      satir.getCell(9).numFmt = fmt;

      satir.eachCell({ includeEmpty: true }, (c, k) => {
        if (k > 9) return;
        c.font = k === 1 ? NO_YAZISI : k === 9 ? yazi(10, RENK.METIN, { bold: true }) : KALEM_YAZISI;
        c.alignment = k === 2 ? { horizontal: 'left', vertical: 'middle', wrapText: true } : ORTALI;
        c.border = ALT_CIZGI;
      });
      if (miktar !== null) satir.getCell(3).numFmt = miktarBicimi(miktar);

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
  if (ops.toplamSatiri !== false) {
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
    for (let k = 1; k <= 9; k++) {
      const c = t.getCell(k);
      c.fill = dolgu(RENK.TOPLAM_ZEMIN);
      c.border = UST_KALIN_CIZGI;
      c.font = yazi(10, RENK.LACIVERT, { bold: true });
      c.alignment = k === 2 ? { vertical: 'middle' } : ORTALI;
    }
    toplamSatiri = t.number;
  }

  // Tarif §3 gorunum: kilavuz cizgisi yok, bolme C5'ten (antet varsa basligin altindan)
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: bas.number, topLeftCell: `C${ilkVeri}`, showGridLines: false }];
  ws.properties.tabColor = { argb: RENK.SEKME_KALEM };
  baskiAyarla(ws, { yatay: true, sonKolon: 9, sonSatir: ws.rowCount, tekrarSatiri: bas.number, teklifAdi: ops.baslik ?? '', dil: ops.dil });

  return {
    matCol: 6, labCol: 8, toplamSatirlari,
    matDeger: matToplamK / 100, labDeger: labToplamK / 100,
    yazilan, fiyatsizSatir, tur: 'kalem', toplamSatiri, yenidenHesaplanan: yeniden,
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

  const birim = g.birim ?? null;
  const kod = birim?.kod ?? 'TRY';
  const tarih = g.tarih ?? new Date();

  // Tarif §1: GENEL TOPLAM ILK sekme (Excel dosyayi onda acar). Once BOS acilir
  // — sira icin — ve sayfalar yazildiktan SONRA doldurulur: formulleri her
  // sayfanin SAYFA TOPLAMI satirina baglanir, o satir yazimda belli olur.
  const ozetWs = wb.addWorksheet(GENEL_TOPLAM_SAYFA_ADI); // rezerve — teklif sayfalari bu adi alamaz (I9)

  let yazilan = 0; let fiyatsizSatir = 0; let yenidenHesaplanan = 0;
  const kalemSayfalari: OzetSatiri[] = [];

  // KF7: sayfalar TEK motorla yazilir — format yolu da ayni fonksiyonu cagirir
  for (const sh of g.sheetsArr ?? []) {
    if (!sh || sh.isEmpty) continue;
    const b = standartSayfaYaz(wb, sh, {
      birim, toplamSatiri: true, dil: g.dil, antet: g.antet,
      rezerveAdlar: [GENEL_TOPLAM_SAYFA_ADI], baslik: g.baslik, tarih,
    });
    yazilan += b.yazilan;
    fiyatsizSatir += b.fiyatsizSatir;
    yenidenHesaplanan += b.yenidenHesaplanan;
    // Tarif §5: 0 TL'lik metin sayfalari ozete GIRMEZ. Ara toplam (`_ozet`)
    // satirlari sayfa toplamina zaten girmedi (30.07 cift sayim yasagi).
    if (b.tur === 'kalem' && b.toplamSatiri !== null) {
      kalemSayfalari.push({ ad: b.wsName, satir: b.toplamSatiri, matK: kurusTamsayi(b.matDeger), labK: kurusTamsayi(b.labDeger) });
    }
  }
  ozetSayfasiYaz(wb, ozetWs, kalemSayfalari, { ...g, tarih }, paraBicimi(kod));

  // Kurus tamsayi — sayfa toplamlari ile teklif geneli AYNI kuralla toplanir
  const genelToplamK = kalemSayfalari.reduce((a, s) => a + s.matK + s.labK, 0);
  const genelToplam = genelToplamK / 100;
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  // EX7: gorunur self-check
  const ozet = [
    `${yazilan} değer aktarıldı ✓`,
    // P2-1b: 2 hane — ekran (PARA_ONDALIK) ve bu dosyanin numFmt'i ile ayni.
    `genel toplam ${simge(kod)}${genelToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    // KARAR 23.09: Excel carpimi gosterir, ekran dosyanin rakamini — fark SOYLENIR
    yenidenHesaplanan ? `${yenidenHesaplanan} satırda dosyadaki toplam miktar × birim fiyatla tutmuyordu, Excel yeniden hesapladı` : '',
  ].filter(Boolean).join(' · ');

  return { buffer, ozet, genelToplam, yazilan, fiyatsizSatir, yenidenHesaplanan };
}
