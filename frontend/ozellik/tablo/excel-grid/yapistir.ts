/**
 * PANO YAPISTIRMA — SAF PLANLAYICI (28.08.2026, Grand Hyatt canli istegi)
 *
 * Kullanici Excel'de bir hucre blogunu kopyalayip (₺200,00 / ₺300,00 ...)
 * teklif gridinde odakli hucreye Ctrl+V ile yapistirmak istiyor. Genel blok
 * yapistirma ExcelGrid'de VARDI ama `mode === 'library'` kilidi altindaydi
 * ve hedef suzgeci `!field.startsWith('_')` oldugu icin teklifin SABIT SEMA
 * fiyat kolonlarini (_labBirim, _matBirim...) zaten DISLIYORDU.
 *
 * Bu modul yalniz PLANLAR — grid'e dokunmaz. Boylece vitest ile DOM'suz
 * olculur (fill-down.ts deseni). Uygulayan taraf (ExcelGrid.handlePaste)
 * plani `node.setDataValue(field, deger, 'edit')` ile isler: 'edit' kaynagi
 * BILEREK — elle girisin tum zinciri (net geriye turetme → satir toplami →
 * genel toplam → pinned bottom → spare satir) handleCellValueChanged'te
 * `e.source === 'edit'` sartina bagli. Yapistirma da kullanicinin ACIK
 * eylemidir; ayni kapidan gecmelidir ki Excel'deki 200 × 1931 = 386.200
 * zinciri sistemde de birebir kurulsun.
 *
 * ── SAYI AYRISTIRMA: INSAN YAZIMI SINIFI ──
 * Excel'den kopyalanan metin hucrenin GORUNUMUdur: "₺386.200,00" gibi.
 * `sayiAlani` bu sinifi COZEMEZ: replace(',','.') binlik noktali metni
 * "386.200.00" yapar → parseFloat = 386.2 — BIN KAT YANLIS (PK6 dersi).
 * Dogru arac test/e2e-golden/sayi-ayristirma.mjs'teki `num()` (insan yazimi
 * sinifi). O dosya test klasorunde .mjs oldugu icin uretimden import
 * EDILMEZ; mantik burada `insanSayi` olarak yasar ve iki uygulamanin
 * AYRISAMAMASI yapistir.test.ts'teki esdegerlik koprusuyle kilitlidir.
 *
 * ── A2 (tur 3, 14.09 — olculdu): BELIRSIZ SAYI ──────────────────────────────
 * `num()` "1.250"yi 1250 okur; ayni metin elle yazilinca 1,25, admin ice
 * aktarmada BELIRSIZ idi — ayni girdi uc sinif. Pano da INSAN sinirindadir:
 * kural artik `sayi-alani.ts` `insanSayiOku` (tek kaynak). Tek anlamli
 * yazimlarda `num()` ile esdegerlik korunur; belirsiz yazim ("1.234") koprunun
 * ACIK istisnasidir (yapistir.test.ts) — yazilmaz, ozet toast'ta sayilir.
 */
import { insanSayiOku, type SayiAlanTuru } from '../../fiyat/sayi-alani';

/** INSAN YAZIMI para/sayi metni → number. Sayi degilse ya da BELIRSIZSE null.
 *  Alan verilmezse fiyat (₺/TL suslu Excel gorunumu). Sinifin kendisi icin
 *  `insanSayiOku` kullanin — bu sarmalayici yalniz "yazilacak sayi" sorusudur. */
export function insanSayi(s: unknown, alan: SayiAlanTuru = 'fiyat'): number | null {
  const r = insanSayiOku(s, alan);
  return r.tur === 'sayi' ? r.deger : null;
}

/** Pano metni → hucre matrisi. Excel TSV verir: satirlar \n, kolonlar \t.
 *  CRLF normalize edilir; Excel'in eklegi SONDAKI bos satir atilir (ictekiler
 *  korunur — kullanici gercekten bos satir kopyalamis olabilir). */
export function panoMatrisi(text: string): string[][] {
  const satirlar = text.replace(/\r/g, '').split('\n');
  if (satirlar.length && satirlar[satirlar.length - 1] === '') satirlar.pop();
  return satirlar.map((l) => l.split('\t'));
}

export interface PasteKolon {
  field: string;
  /** AG-Grid columnDef.editable — yazilamayan kolon hedef OLMAZ ama Excel
   *  HIZASINI korumak icin pozisyon TUKETIR (atlanip sikistirilirsa komsu
   *  kolonlarin verisi yanlis kolona kayar). */
  editable: boolean;
  /** Sayisal rol (birim fiyat / miktar / kar %): deger insanSayi'dan gecer;
   *  cozulemeyen metin hucresi YAZILMAZ (fiyat alanina "mt" copu girmesin —
   *  İB3 mutasyonunda olculen bozulma sinifinin panodan tekrari olurdu). */
  sayisal: boolean;
  /** A2: sayisal kolonun ALAN TURU — izinli sus (₺ / % / birim) ve uyari metni
   *  buna bagli. Verilmezse 'fiyat'. */
  alan?: SayiAlanTuru;
}

export interface PasteSatir {
  /** Grup bandi / baslik satirlari hedef degildir; pozisyon TUKETMEZ
   *  (Excel'de kopyalanan N veri satiri, griddeki N VERI satirina gider —
   *  aradaki bolum basliklari sayilmaz; iskonto yapistirmanin S3 kurali). */
  isDataRow: boolean;
}

export interface PasteHucre { satir: number; field: string; deger: string | number }

export interface PastePlan {
  hucreler: PasteHucre[];
  ozet: {
    yazilacak: number;
    /** kopyada bos hucre: hedefe DOKUNULMAZ (0 yazmak toplami sifirlardi) */
    atlananBos: number;
    /** sayisal kolona cozulemeyen metin geldi */
    atlananSayiDegil: number;
    /** A2: sayisal kolona BELIRSIZ sayi geldi ("1.250") — yazilmadi */
    atlananBelirsiz: number;
    /** A2: atlanan sayisal hucrelerin ILK IKI ham metni (toast'ta gosterilir) */
    ornekHamlar: string[];
    /** hedef kolon editable degil / kolon araligi disi */
    atlananKolon: number;
    /** griddeki veri satirlari bitti — tasan kopya satirlari */
    sigmayanSatir: number;
  };
}

/** A2: yapistirma ozet toast'inin sayi uyarisi parcalari (bos dizi = uyari yok).
 *  Saf: ExcelGrid bu parcalari mevcut ozet cumlesine ekler. */
export function yapistirmaSayiUyarilari(ozet: PastePlan['ozet']): string[] {
  const parca: string[] = [];
  if (ozet.atlananBelirsiz > 0) parca.push(`${ozet.atlananBelirsiz} hücre belirsiz sayıydı (1.250 → 1250 mi 1,25 mi?)`);
  if (ozet.atlananSayiDegil > 0) parca.push(`${ozet.atlananSayiDegil} hücre sayı değildi`);
  if (parca.length > 0 && ozet.ornekHamlar.length > 0) {
    parca.push(`yazılmadı: ${ozet.ornekHamlar.map((h) => `“${h.length > 30 ? `${h.slice(0, 29)}…` : h}”`).join(', ')}`);
  }
  return parca;
}

/**
 * Yapistirma plani. `kolonlar` GORUNUR sirada TUM kolonlar; `satirlar`
 * odakli satirdan itibaren GORUNUR sirada. Donen `satir` degeri `satirlar`
 * dizisindeki indekstir (cagiran, odak satir indeksine ekleyerek cozer).
 */
export function planYapistir(
  metin: string,
  kolonlar: PasteKolon[],
  odakKolonField: string,
  satirlar: PasteSatir[],
): PastePlan {
  const bos: PastePlan = {
    hucreler: [],
    ozet: { yazilacak: 0, atlananBos: 0, atlananSayiDegil: 0, atlananBelirsiz: 0, ornekHamlar: [], atlananKolon: 0, sigmayanSatir: 0 },
  };
  const matris = panoMatrisi(metin);
  if (matris.length === 0) return bos;
  const odak = kolonlar.findIndex((k) => k.field === odakKolonField);
  if (odak < 0) return bos;

  const plan = bos;
  let mi = 0; // matris satiri
  for (let si = 0; si < satirlar.length && mi < matris.length; si++) {
    if (!satirlar[si].isDataRow) continue; // bant/baslik: pozisyon tuketmez
    const kopya = matris[mi++];
    for (let j = 0; j < kopya.length; j++) {
      const kolon = kolonlar[odak + j]; // hiza: editable olmayan da pozisyon tuketir
      const ham = kopya[j];
      if (ham.trim() === '') { plan.ozet.atlananBos++; continue; }
      if (!kolon || !kolon.editable) { plan.ozet.atlananKolon++; continue; }
      if (kolon.sayisal) {
        const r = insanSayiOku(ham, kolon.alan ?? 'fiyat');
        if (r.tur !== 'sayi') {
          if (r.tur === 'belirsiz') plan.ozet.atlananBelirsiz++; else plan.ozet.atlananSayiDegil++;
          if (plan.ozet.ornekHamlar.length < 2) plan.ozet.ornekHamlar.push(ham.trim());
          continue;
        }
        plan.hucreler.push({ satir: si, field: kolon.field, deger: r.deger });
      } else {
        plan.hucreler.push({ satir: si, field: kolon.field, deger: ham });
      }
      plan.ozet.yazilacak++;
    }
  }
  plan.ozet.sigmayanSatir = matris.length - mi;
  return plan;
}
