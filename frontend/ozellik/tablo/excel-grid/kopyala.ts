/**
 * PANO KOPYALAMA — SAF PLANLAYICI (28.08.2026, kullanici canli istegi)
 *
 * ── NEDEN VAR ───────────────────────────────────────────────────────────────
 * Kullanici kutuphanedeki "Net Fiyat" hucresini kopyalayip teklif gridindeki
 * "Malz./Isc. Birim Fiyat" hucresine yapistirmak istiyor. Yapistirma tarafi
 * 28.08'de acildi (`yapistir.ts`) ama KOPYALAMA yolu HIC YOKTU ve bu olculdu:
 *   · `ModuleRegistry.registerModules([AllCommunityModule])` — AG Grid'in
 *     clipboard ve hucre-araligi secimi ENTERPRISE modulleridir, kayitli degil.
 *   · `enableCellTextSelection` hicbir yerde ayarlanmamis — hucre metni
 *     tarayicinin kendi secimiyle bile alinamiyordu.
 *   · `handleLibraryKeyDown` yalniz Ctrl+Z ve Ctrl+D isliyordu.
 * Yani zincirin kopma noktasi yapistirma DEGIL kopyalamaydi: kullanici
 * ekranda gordugu ₺53,30'u panoya alamadigi icin yapistiracak bir seyi de
 * olmuyordu.
 *
 * ── SIMETRI KURALI (kopyala → yapistir birebir donmeli) ─────────────────────
 * `planYapistir` grup bandi / baslik satirlarini POZISYON TUKETMEYEN satirlar
 * sayar (S3 kurali: Excel'de kopyalanan N veri satiri, griddeki N VERI
 * satirina gider). Kopyalama AYNI kurali uygulamak ZORUNDA: aradaki bant
 * satirlari icin bos TSV satiri uretilirse, gidis-donuste veriler bir satir
 * kayar. Bu yuzden `isDataRow` olmayan satirlar burada da ATLANIR — iki
 * modulun bu noktada ayrisamamasi `kopyala.test.ts` S7 (gidis-donus) ile
 * kilitlidir.
 *
 * ── HUCRE METNI: GORUNEN DEGER ──────────────────────────────────────────────
 * Panoya hucrenin GORUNEN metni yazilir ("₺53,30" / "₺105.800,00"), ham sayi
 * degil. Iki sebep:
 *   1) Teklif gridine yapistirma `insanSayi` ile cozer — o parser TR binlik
 *      noktasini ATAR, virgulu ondalik okur; "₺105.800,00" → 105800 (dogru).
 *      Ham sayi yazsaydik "105800" da calisirdi ama bicimli metin ikisini de
 *      kapsar ve kullanici EKRANDA GORDUGUNU kopyalamis olur.
 *   2) Ayni metin TR yerelli gercek Excel'e yapistirildiginda para hucresi
 *      olarak okunur — kullanicinin "kendi excelime yapistirayim" istegi.
 * ⚠ `replace(',', '.')` sinifi bir parser bu metni BIN KAT yanlis okur (PK6
 *    dersi) — panoyu tuketen her yol `insanSayi`dan gecmelidir.
 */

/** Gorunur siradaki kolon (AG Grid `getAllDisplayedColumns` karsiligi). */
export interface KopyaKolon { field: string }

/** Gorunur siradaki satir. `isDataRow` degilse grup bandi/basliktir. */
export interface KopyaSatir { isDataRow: boolean }

/** Secim ucu: satir = gorunur satir indeksi, kolon = `kolonlar` indeksi. */
export interface Nokta { satir: number; kolon: number }

export interface Aralik {
  satirBas: number; satirSon: number;
  kolonBas: number; kolonSon: number;
}

export interface KopyaSonucu {
  /** Pano metni (TSV). Kopyalanacak veri yoksa bos string. */
  metin: string;
  /** Secimin kapsadigi hucre sayisi (satir × kolon) — DOLU olani degil. */
  hucreSayisi: number;
  /** TSV'ye giren VERI satiri sayisi (atlanan bantlar sayilmaz). */
  satirSayisi: number;
  /**
   * ICI DOLU hucre sayisi. `hucreSayisi` geometriyi sayar; bu, gercekten
   * tasinan degeri. Ayrim SESSIZ PANO EZILMESINI onler: iki bos hucre secili
   * iken metin `"\n"` olur — bos string DEGILDIR, yani "metin var mi" kapisini
   * gecer, panodaki onceki icerigi siler ve kullaniciya "2 hucre kopyalandi"
   * denir. Kullanici teklifte Ctrl+V yapinca "Yapistirilacak deger bulunamadi"
   * gorur; iki mesaj birbirini yalanlar.
   */
  doluHucreSayisi: number;
}

/** Iki uctan normalize aralik. Secim yukaridan asagi da olabilir asagidan
 *  yukari da — kullanici Shift+Yukari ile secince ters ucla gelir. */
export function aralikKur(a: Nokta, b: Nokta): Aralik {
  return {
    satirBas: Math.min(a.satir, b.satir),
    satirSon: Math.max(a.satir, b.satir),
    kolonBas: Math.min(a.kolon, b.kolon),
    kolonSon: Math.max(a.kolon, b.kolon),
  };
}

/** Hucre degeri → TSV-guvenli tek satir metin.
 *  Sekme ve satir sonu TSV'nin AYIRICILARIDIR: hucre icinde kalirlarsa
 *  yapistiran taraf o hucreyi ikiye boler (uzun malzeme adlarinda gercek
 *  bir risk — `wrapText` kolonlarinda metin cok satirli gorunuyor). */
export function hucreMetni(ham: unknown): string {
  if (ham === null || ham === undefined) return '';
  return String(ham).replace(/[\t\r\n]+/g, ' ');
}

/**
 * Kopyalama plani. `oku(satirIdx, field)` cagiran tarafin sagladigi okuyucu —
 * GORUNEN metni (valueFormatted) dondurmelidir; ExcelGrid tarafinda AG Grid'in
 * kendi bicimlendiricisi cagrilir, bicimlendirme mantigi burada TEKRARLANMAZ.
 */
export function planKopyala(
  aralik: Aralik,
  kolonlar: KopyaKolon[],
  satirlar: KopyaSatir[],
  oku: (satirIdx: number, field: string) => unknown,
): KopyaSonucu {
  const bos: KopyaSonucu = { metin: '', hucreSayisi: 0, satirSayisi: 0, doluHucreSayisi: 0 };
  const kBas = Math.max(0, aralik.kolonBas);
  const kSon = Math.min(kolonlar.length - 1, aralik.kolonSon);
  if (kSon < kBas) return bos;

  const satirMetinleri: string[] = [];
  let dolu = 0;
  for (let si = aralik.satirBas; si <= aralik.satirSon; si++) {
    // Bant/baslik satiri: TSV'de YER TUTMAZ (yapistirma simetrisi — bos satir
    // uretilseydi gidis-donusde tum veriler bir satir kayardi).
    if (!satirlar[si]?.isDataRow) continue;
    const hucreler: string[] = [];
    for (let ki = kBas; ki <= kSon; ki++) {
      const m = hucreMetni(oku(si, kolonlar[ki].field));
      if (m.trim() !== '') dolu++;
      hucreler.push(m);
    }
    satirMetinleri.push(hucreler.join('\t'));
  }
  // Hicbir hucrede deger yoksa PANO KIRLETILMEZ. `satirMetinleri.length`
  // kapisi yetmez: iki bos hucre `["", ""]` uretir ve metin `"\n"` olur —
  // bos string degildir, panoyu sessizce ezerdi.
  if (dolu === 0) return bos;

  return {
    metin: satirMetinleri.join('\n'),
    hucreSayisi: satirMetinleri.length * (kSon - kBas + 1),
    satirSayisi: satirMetinleri.length,
    doluHucreSayisi: dolu,
  };
}
