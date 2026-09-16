/**
 * TEKLIF METNI CEVIRISI — EKRANDA UYGULAMA VE GERI ALMA (13.08 · 14.09 · 15.09).
 *
 * ── KARAR BURADA DEGIL (Faz 6.2, 14.09.2026) ───────────────────────────────
 * 13.08–14.09 arasi "hangi hucre motora gider, hangisine ASLA dokunulmaz"
 * karari (`dokunulmazMi`, `cevrilecekMetinler`) bu modulde yasiyordu ve
 * istemci metin listesini kendisi gonderiyordu. Cevirinin kotasi olunca bu
 * liste KOTADAN DUSECEK SATIRI da belirler hale geldi — istemciye birakilamaz.
 * Kural sunucuya TASINDI: `backend/src/ozellik/giris/ai/ceviri-kurali.ts`
 * (vakalar `backend/test/ceviri-kota-uygulama-test.ts`, K bloku). Iki kopya
 * tutulmadi: ayrisan ikiz, ekranda sayilan ile faturalanan satiri ayirirdi.
 * K21 bu dosyada kuralin YENIDEN belirmesini kirmizi yakar.
 *
 * Burada kalan: sunucunun dondurdugu haritayi satirlara yazmak ve geri almak.
 *
 * ── GORUNUM KAYDI DEGISTIRMEZ (Faz 6.11, 15.09) ────────────────────────────
 * Detay ekrani kaydi yerinde degistirmez: `ingilizceGorunum` / `turkceGorunum`
 * kayittan KOPYA gorunum uretir; sunucudaki dosya kurali (`disaAktarimPlani`)
 * ile ayni satirlara yazar (ikiz fikstur S10). Duzenle ekrani (acik eylem,
 * canli satirlar) yerinde yazan `ceviriUygula`/`ceviriGeriAl`i kullanir.
 */
import type { ColumnRoles, ExcelRowData } from '../tablo/excel-grid/types';

/** Hedef dil — su an yalniz Ingilizce (kullanici karari, 13.08). */
export type HedefDil = 'en';

/** Kaynak metin → ceviri. Backend'den bu sekilde doner. */
export type CeviriHaritasi = Record<string, string>;

/** Grid hucresinden ceviri anahtarina giden TEK normalizasyon.
 *  Onbellek anahtari da bu — yoksa "PVC BORU" ile "PVC BORU " ayri satir olur. */
export function ceviriAnahtari(metin: unknown): string {
  return String(metin ?? '').trim().replace(/\s+/g, ' ');
}

/** Orijinal metnin satirda saklandigi alan (sunucuda `CEVIRI_KAYNAK_ALANI`). */
const CEVIRI_KAYNAK_ALANI = '_ceviriKaynak';

/**
 * Ceviri hucreye yazilirken YAZILAN deger (sunucuda `CEVIRI_SONUC_ALANI`).
 * Isaret yalniz hucre hala bu degeri tasiyorsa gecerlidir. Bu alani yazan ve
 * silen TEK dosya burasidir (S9 kaynak kapisi).
 */
const CEVIRI_SONUC_ALANI = '_ceviriSonucu';

/**
 * Satirin CEVIRI KAYNAGI: cevrilmis satirda Turkce asil, degilse ad hucresi.
 *
 * ⚠ SUNUCUDAKI IKIZIYLE GOVDESI BIREBIR AYNI (`ceviri-kurali.ts`, K29):
 * sunucu haritayi bu anahtarla kurar ve satiri bu anahtarla sayar; ekran
 * ayni anahtarla yazar. Iki taraf farkli anahtar kullanirsa (14.09 incelemesi
 * O3/O6) ya sayilmayan satir ekranda cevrilir ya da Ingilizce kayitli teklifte
 * kota duser ama hicbir hucre degismez.
 *
 * BAYAT ISARET (15.09): ceviriden sonra ad hucresi elle degistiyse isaret
 * gecersizdir, kaynak hucrenin kendisidir.
 */
export function satirKaynagi(row: Record<string, unknown>, adAlan: string): unknown {
  const kaynak = row[CEVIRI_KAYNAK_ALANI];
  if (typeof kaynak !== 'string' || ceviriAnahtari(kaynak) === '') return row[adAlan];
  const sonuc = row[CEVIRI_SONUC_ALANI];
  return typeof sonuc !== 'string' || ceviriAnahtari(sonuc) === ceviriAnahtari(row[adAlan]) ? kaynak : row[adAlan];
}

/**
 * Bu satirin hucresinde hala cevrilecek kaynak metin duruyor mu. `false` →
 * hucre kayitta Ingilizce (Duzenle'de cevrilip kaydedilmis): gorunum ona
 * dokunmaz. ⚠ SUNUCUDAKI IKIZIYLE GOVDESI BIREBIR AYNI (K31).
 */
export function kayittaKaynakDuruyorMu(row: Record<string, unknown>, adAlan: string): boolean {
  return ceviriAnahtari(row[adAlan]) === ceviriAnahtari(satirKaynagi(row, adAlan));
}

/**
 * Satirlarda gecerli `_ceviriKaynak` isareti var mi — varsa kayitta Ingilizce
 * kaydedilmis hucre olabilir (isareti yalniz `ceviriUygula` yazar, `ceviriGeriAl`
 * siler). Bos dizge isaret sayilmaz (sunucu ve Duzenle de saymaz).
 */
export function cevrilmisSatirVarMi(sayfalar: ReadonlyArray<{ rowData?: ExcelRowData[] } | null | undefined> | null | undefined): boolean {
  if (!Array.isArray(sayfalar)) return false;
  return sayfalar.some((s) => {
    const satirlar: ExcelRowData[] = s?.rowData ?? [];
    return satirlar.some((r) => typeof r?._ceviriKaynak === 'string' && ceviriAnahtari(r._ceviriKaynak) !== '');
  });
}

/** Ceviriye girecek sayfa kesiti (SheetData uyumlu). */
export interface CeviriSayfasi {
  index: number;
  isEmpty?: boolean;
  rowData?: ExcelRowData[];
  columnRoles?: ColumnRoles;
}

/**
 * Ceviri haritasini satirlara uygular. Yazilan hucre sayisini doner.
 *
 * ⚠ ORIJINAL METIN KORUNUR (`_ceviriKaynak`): dil "Türkçe"ye alindiginda geri
 * donebilmek icin. Ceviriyi tek yon uygulayip orijinali kaybetmek, kullanicinin
 * emegini (elle duzelttigi adlari) geri alinamaz sekilde silerdi. Yazilan deger
 * de saklanir (`_ceviriSonucu`): hucre sonradan elle degisirse isaret bayatlar.
 *
 * Satirlar YERINDE guncellenir — cagiran taraf degisiklik varsa state'i
 * yeniden spread eder (ExcelGrid yazim yollari da node.data'yi dogrudan yazar).
 */
export function ceviriUygula(
  sayfalar: CeviriSayfasi[],
  harita: CeviriHaritasi,
  live?: Record<number, ExcelRowData[]>,
): number {
  let yazilan = 0;
  for (const sayfa of sayfalar) {
    if (sayfa.isEmpty) continue;
    const roles = sayfa.columnRoles ?? {};
    const adAlan = roles.nameField;
    if (!adAlan) continue;
    const rows = live?.[sayfa.index] ?? sayfa.rowData ?? [];
    for (const row of rows) {
      if (!row) continue;
      const anahtar = ceviriAnahtari(satirKaynagi(row, adAlan));
      const ceviri = Object.prototype.hasOwnProperty.call(harita, anahtar) ? harita[anahtar] : undefined;
      if (!ceviri || ceviri === row[adAlan]) continue;
      // Orijinali BIR KEZ sakla — ikinci ceviride ceviriyi orijinal sanmayalim.
      // Bos ya da bayat kaynak "orijinal yok" demektir (satirKaynagi ada duser).
      if (satirKaynagi(row, adAlan) === row[adAlan]) row[CEVIRI_KAYNAK_ALANI] = row[adAlan];
      row[adAlan] = ceviri;
      row[CEVIRI_SONUC_ALANI] = ceviri;
      yazilan++;
    }
  }
  return yazilan;
}

/**
 * Ceviriyi geri alir — gecerli isaretli satirda `_ceviriKaynak`teki orijinali
 * yerine koyar. Bayat isaretli satirda hucre KULLANICININ yazdigidir: kaynaga
 * EZILMEZ. Iki isaret de silinir. Dil seciciyi "Türkçe"ye almak bunu cagirir.
 */
export function ceviriGeriAl(
  sayfalar: CeviriSayfasi[],
  live?: Record<number, ExcelRowData[]>,
): number {
  let geri = 0;
  for (const sayfa of sayfalar) {
    if (sayfa.isEmpty) continue;
    const adAlan = sayfa.columnRoles?.nameField;
    if (!adAlan) continue;
    const rows = live?.[sayfa.index] ?? sayfa.rowData ?? [];
    for (const row of rows) {
      if (!row || row._ceviriKaynak === undefined) continue;
      if (satirKaynagi(row, adAlan) === row._ceviriKaynak) row[adAlan] = row._ceviriKaynak;
      delete row._ceviriKaynak;
      delete row[CEVIRI_SONUC_ALANI];
      geri++;
    }
  }
  return geri;
}

/**
 * Detay ekraninin INGILIZCE GORUNUMU — kaydi DEGISTIRMEZ, yalniz degisen satirlar
 * kopyalanir. Kosul sunucudaki dosya kuraliyla ayni: kayitta kaynak metin duran
 * satira, haritada karsiligi varsa ve hucreden farkliysa yazilir; kayitta
 * Ingilizce duran hucreye dokunulmaz (ekran = dosya).
 */
export function ingilizceGorunum<S extends CeviriSayfasi>(
  sayfalar: readonly S[],
  harita: CeviriHaritasi,
): { sayfalar: S[]; yazilan: number } {
  let yazilan = 0;
  const yeni = sayfalar.map((sayfa) => {
    const adAlan = sayfa?.columnRoles?.nameField;
    if (!sayfa || sayfa.isEmpty || !adAlan || !Array.isArray(sayfa.rowData)) return sayfa;
    let degisti = false;
    const rowData = sayfa.rowData.map((row) => {
      if (!row || !kayittaKaynakDuruyorMu(row, adAlan)) return row;
      const anahtar = ceviriAnahtari(satirKaynagi(row, adAlan));
      const ceviri = Object.prototype.hasOwnProperty.call(harita, anahtar) ? harita[anahtar] : undefined;
      if (!ceviri || ceviri === row[adAlan]) return row;
      degisti = true;
      yazilan++;
      return { ...row, [adAlan]: ceviri, [CEVIRI_KAYNAK_ALANI]: row[adAlan], [CEVIRI_SONUC_ALANI]: ceviri };
    });
    return degisti ? { ...sayfa, rowData } : sayfa;
  });
  return { sayfalar: yeni, yazilan };
}

/**
 * Detay ekraninin TURKCE GORUNUMU — kaydi DEGISTIRMEZ. Gecerli isaretli satirda
 * Turkce kaynak gosterilir; bayat isaretli satirda hucre korunur; isaretler
 * kopyadan atilir. Isaretsiz satir aynen kalir.
 */
export function turkceGorunum<S extends CeviriSayfasi>(sayfalar: readonly S[]): S[] {
  return sayfalar.map((sayfa) => {
    const adAlan = sayfa?.columnRoles?.nameField;
    if (!sayfa || sayfa.isEmpty || !adAlan || !Array.isArray(sayfa.rowData)) return sayfa;
    let degisti = false;
    const rowData = sayfa.rowData.map((row) => {
      if (!row || (row[CEVIRI_KAYNAK_ALANI] === undefined && row[CEVIRI_SONUC_ALANI] === undefined)) return row;
      degisti = true;
      const temiz: ExcelRowData = { ...row };
      delete temiz[CEVIRI_KAYNAK_ALANI];
      delete temiz[CEVIRI_SONUC_ALANI];
      return satirKaynagi(row, adAlan) === row[CEVIRI_KAYNAK_ALANI] ? { ...temiz, [adAlan]: row[CEVIRI_KAYNAK_ALANI] } : temiz;
    });
    return degisti ? { ...sayfa, rowData } : sayfa;
  });
}

/**
 * FIRMA CEVIRI DUZELTMESI SATIRLARA (Faz 6.9, 16.09.2026) — Duzenle ekrani,
 * CANLI satirlar, YERINDE yazim. Kullanicinin acik eylemi: kalem isaretiyle
 * "Kaydet" dedi; kayit "Teklifi Kaydet" ile kalici olur (K-T1).
 *
 * Eslesme sunucudaki anahtarla AYNI: `ceviriAnahtari(satirKaynagi(row, adAlan))`.
 * `deger` null → Turkce kaynaga doner ve iki isaret de silinir (ceviriGeriAl
 * kurali: bayat isaretli hucre KULLANICININ yazdigidir, kaynaga EZILMEZ).
 *
 * ⚠ `_ceviriSonucu` YAZAN TEK DOSYA BURASI (S9 kaynak kapisi): isaret yalniz
 * hucre hala yazilan degeri tasiyorsa gecerlidir.
 */
export function duzeltmeyiSatirlaraUygula(
  sayfalar: CeviriSayfasi[],
  kaynak: string,
  deger: string | null,
  live?: Record<number, ExcelRowData[]>,
): { yazilan: number } {
  const hedef = ceviriAnahtari(kaynak);
  let yazilan = 0;
  if (!hedef) return { yazilan };
  for (const sayfa of sayfalar) {
    if (sayfa.isEmpty) continue;
    const adAlan = sayfa.columnRoles?.nameField;
    if (!adAlan) continue;
    const rows = live?.[sayfa.index] ?? sayfa.rowData ?? [];
    for (const row of rows) {
      if (!row) continue;
      if (ceviriAnahtari(satirKaynagi(row, adAlan)) !== hedef) continue;
      if (deger === null) {
        if (row[CEVIRI_KAYNAK_ALANI] === undefined) continue;
        if (satirKaynagi(row, adAlan) === row[CEVIRI_KAYNAK_ALANI]) row[adAlan] = row[CEVIRI_KAYNAK_ALANI];
        delete row[CEVIRI_KAYNAK_ALANI];
        delete row[CEVIRI_SONUC_ALANI];
        yazilan++;
        continue;
      }
      if (deger === row[adAlan]) continue;
      // Orijinali BIR KEZ sakla (ceviriUygula ile ayni kural).
      if (satirKaynagi(row, adAlan) === row[adAlan]) row[CEVIRI_KAYNAK_ALANI] = row[adAlan];
      row[adAlan] = deger;
      row[CEVIRI_SONUC_ALANI] = deger;
      yazilan++;
    }
  }
  return { yazilan };
}
