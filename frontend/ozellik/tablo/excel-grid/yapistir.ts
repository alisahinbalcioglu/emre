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
 */

/** INSAN YAZIMI para/sayi metni → number. Sayi gibi degilse null.
 *  Kural (num() ile birebir): para sembolleri/harfler suzulur; nokta + tam
 *  3 rakam + (rakam-disi|son) = TR binlik ayirici, ATILIR; virgul ondaliktir. */
export function insanSayi(s: unknown): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const ham = String(s ?? '').trim();
  if (!ham) return null;
  // Rakam icermeyen ya da harf agirlikli metin sayi DEGILDIR — "mt", "ad",
  // "35x240mm kanal" gibi tariflerden sayi UYDURULMAZ (numHam'in 03-bursa
  // dersi: rakam suzen parser "35x240mm"den 35240 uretmisti).
  if (!/\d/.test(ham) || /[a-zA-ZğüşöçıİĞÜŞÖÇ]/.test(ham.replace(/(tl|try)\b/gi, ''))) return null;
  const m = ham
    .replace(/[^\d,.\-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const f = parseFloat(m);
  return Number.isFinite(f) ? f : null;
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
    /** hedef kolon editable degil / kolon araligi disi */
    atlananKolon: number;
    /** griddeki veri satirlari bitti — tasan kopya satirlari */
    sigmayanSatir: number;
  };
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
    ozet: { yazilacak: 0, atlananBos: 0, atlananSayiDegil: 0, atlananKolon: 0, sigmayanSatir: 0 },
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
        const n = insanSayi(ham);
        if (n === null) { plan.ozet.atlananSayiDegil++; continue; }
        plan.hucreler.push({ satir: si, field: kolon.field, deger: n });
      } else {
        plan.hucreler.push({ satir: si, field: kolon.field, deger: ham });
      }
      plan.ozet.yazilacak++;
    }
  }
  plan.ozet.sigmayanSatir = matris.length - mi;
  return plan;
}
