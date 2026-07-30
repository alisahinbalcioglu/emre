/**
 * STANDART GRID SEMASI — GS1-GS14 (PRD_Standart_Grid_Semasi_ve_Aday_Ayirt_Edicilik)
 *
 * MIMARI KARAR (kullanici, 29-30.07.2026): yuklenen dosyanin kolon duzeni
 * ARTIK grid'e tasinmaz. Grid semasi SABITTIR — her dosyada, her sayfada ayni
 * 13 kolon. Dosyadan YALNIZ dort alan okunur: No · Malzeme Adi · Miktar · Birim.
 *
 * NEDEN: kolon-haritalama sinifindaki hatalar (KE1-KE21, KF1-KF7) aylardir
 * kapanmadi. Kok neden raporu (FAZ0_STANDART_SEMA_KOK_NEDEN.md) YILDIZ
 * dosyasinda olctu: dosya kolonlari grid'e siziyor ("BİRİM FİYAT İŞÇİLİK"),
 * sema sayfadan sayfaya degisiyor (3 sayfada Genel Toplam kolonu YOK), dosyanin
 * MIKTAR sutunu 3 sayfada "genel toplam" roluna baglanmis.
 *
 * Bu modul, mevcut parse ciktisini (dosya kolonlari + tespit edilmis roller)
 * SABIT semaya donusturur. Dinamik tespit yalnizca KAYNAK secimi icin yasar:
 * "hangi dosya kolonu ad, hangisi miktar" — grid semasini artik etkilemez.
 */

export interface StandartKolon {
  field: string;
  headerName: string;
  width: number;
  editable?: boolean;
  cellRenderer?: string;
  suppressMovable?: boolean;
  /** GS9: sola sabitlenen kolonlar (No · Malzeme Adı) */
  pinned?: 'left' | 'right';
  /** GS8: uzun malzeme adlari KESILMEZ */
  wrapText?: boolean;
  autoHeight?: boolean;
}

/** GS1/A.1 — degismez 13 kolon, bu sirada. Etiketler PRD tablosuyla birebir. */
export const STANDART_KOLONLAR: StandartKolon[] = [
  // GS9: No + Malzeme Adı SOLA SABITLENIR (donmus bolme) — saga kaydirirken
  // hangi satirda olundugu kaybolmaz. GS8: genislikler kullanici tarafindan
  // surukleyerek degistirilebilir (AG-Grid resizable) ve teklifle kaydedilir.
  { field: '_no', headerName: 'No', width: 70, suppressMovable: true, pinned: 'left' },
  { field: '_ad', headerName: 'Malzeme Adı', width: 380, editable: true, suppressMovable: true, pinned: 'left', wrapText: true, autoHeight: false },
  { field: '_miktar', headerName: 'Miktar', width: 90, editable: true, suppressMovable: true },
  { field: '_birim', headerName: 'Birim', width: 80, editable: true, suppressMovable: true },
  { field: '_malzKar', headerName: 'Malz. Kar %', width: 90, editable: true, suppressMovable: true },
  { field: '_marka', headerName: 'Malz. Marka', width: 150, cellRenderer: 'brandRenderer', suppressMovable: true },
  { field: '_matBirim', headerName: 'Malz. Birim Fiyat', width: 120, editable: true, suppressMovable: true },
  { field: '_matToplam', headerName: 'Malz. Toplam', width: 120, suppressMovable: true },
  { field: '_iscKar', headerName: 'İşç. Kar %', width: 90, editable: true, suppressMovable: true },
  { field: '_firma', headerName: 'İşç. Firma', width: 150, cellRenderer: 'firmaRenderer', suppressMovable: true },
  { field: '_labBirim', headerName: 'İşç. Birim Fiyat', width: 120, editable: true, suppressMovable: true },
  { field: '_labToplam', headerName: 'İşç. Toplam', width: 120, suppressMovable: true },
  { field: '_toplam', headerName: 'Genel Toplam', width: 130, suppressMovable: true },
];

/** GS14: roller artik SABIT alanlari gosterir — colN yok. */
export const STANDART_ROLLER = {
  noField: '_no',
  nameField: '_ad',
  quantityField: '_miktar',
  unitField: '_birim',
  materialUnitPriceField: '_matBirim',
  materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim',
  laborTotalField: '_labToplam',
  grandTotalField: '_toplam',
} as const;

/** Satirdan tasinacak sistem/isaret alanlari (colN DISINDA kalan her sey). */
const KORUNAN_ALANLAR = [
  '_rowIdx', '_isDataRow', '_isHeaderRow', '_groupLabel', '_groupCount',
  '_matKaynak', '_labKaynak', '_matStatus', '_labStatus',
];

/** GS12: "1.234,50" · "12 m" → 1234.5 · 12 ; cozulemezse null (sessiz sifir YOK) */
export function miktarNormalize(ham: unknown): number | null {
  const s = String(ham ?? '').trim();
  if (!s) return null;
  const m = s.replace(/\s/g, '').match(/-?[\d.,]+/);
  if (!m) return null;
  // "1.234,50" → 1234.50 · "1,5" → 1.5 · "1.5" → 1.5
  let t = m[0];
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  const f = parseFloat(t);
  return isNaN(f) ? null : f;
}

export interface StandartlastirGirdi {
  columnDefs: any[];
  rowData: Record<string, any>[];
  columnRoles: Record<string, any>;
  headerEndRow: number;
  isEmpty: boolean;
  [k: string]: any;
}

export interface StandartlastirCikti {
  columnDefs: StandartKolon[];
  rowData: Record<string, any>[];
  columnRoles: Record<string, string>;
  headerEndRow: number;
  isEmpty: boolean;
  /** GS2c/kullanici karari: ozet sayfa (İcmal) — GORUNUR ama teklif geneli
   *  toplamina ve fiyat eslestirmesine GIRMEZ (aksi halde YILDIZ'da
   *  62.043.700 → 124.087.400 olurdu: detay + ozet iki kez sayilir). */
  isOzet: boolean;
  /** GS12: miktari sayiya cevrilemeyen satir sayisi (gorunur uyari icin) */
  miktarCozulemeyen: number;
  /** GS6: "Malzeme Adı sütunu" secicisinin secenekleri — dosyanin METIN
   *  tasiyan kolonlari. Sema DEGISMEZ; secici yalnizca `_ad` alanini hangi
   *  dosya kolonunun besleyecegini belirler. */
  kaynakKolonlar: { field: string; headerName: string; ornek: string }[];
  /** Su an `_ad`i besleyen kaynak kolon (colN) */
  kaynakAdKolonu: string | null;
}

/**
 * Parse ciktisini SABIT semaya donusturur.
 *
 * Kullanici karari (30.07.2026): dosyanin kendi MARKA sutunu **tamamen atilir**
 * — ne kolon olarak gorunur ne sorguya katilir (GS1 harfiyen).
 */
export function standartlastir(girdi: StandartlastirGirdi): StandartlastirCikti {
  const r = girdi.columnRoles ?? {};
  const kaynak = {
    no: typeof r.noField === 'string' ? r.noField : undefined,
    ad: typeof r.nameField === 'string' ? r.nameField : undefined,
    miktar: typeof r.quantityField === 'string' ? r.quantityField : undefined,
    birim: typeof r.unitField === 'string' ? r.unitField : undefined,
  };
  /** Dosyadan fiyat okuma (MF1/MF2): rol DOSYA kolonuna (colN) baglandiysa
   *  degeri SABIT hucreye tasi. Rol sistem alaniysa zaten yerinde. */
  const fiyatKaynagi = (alan: string): string | undefined => {
    const v = r[alan];
    return typeof v === 'string' && /^col\d+$/.test(v) ? v : undefined;
  };
  const kaynakMatBirim = fiyatKaynagi('materialUnitPriceField');
  const kaynakMatToplam = fiyatKaynagi('materialTotalField');
  const kaynakLabBirim = fiyatKaynagi('laborUnitPriceField');
  const kaynakLabToplam = fiyatKaynagi('laborTotalField');

  // GS2c: miktar VE birim kaynak kolonu YOKSA bu bir ozet/icmal sayfasidir.
  const isOzet = !kaynak.miktar && !kaynak.birim;

  // Ozet sayfada tutar sutunu HICBIR role bagli degildir (İcmal'de rol
  // taramasi yalniz "name" buluyor). Bilgi kaybolmasin diye: colN kolonlari
  // icinde EN COK SAYISAL deger tasiyan kolon "Genel Toplam" kaynagi sayilir.
  // (İcmal'de bu, İŞÇİLİK TOPLAM sutunudur: 270.850 · 8.303.150 · …)
  let ozetToplamKaynagi: string | undefined;
  if (isOzet) {
    const sayac = new Map<string, number>();
    for (const row of girdi.rowData ?? []) {
      for (const k of Object.keys(row)) {
        if (!/^col\d+$/.test(k) || k === kaynak.ad || k === kaynak.no) continue;
        if (miktarNormalize(row[k]) !== null) sayac.set(k, (sayac.get(k) ?? 0) + 1);
      }
    }
    let enCok = 0;
    for (const [k, n] of sayac) if (n > enCok) { enCok = n; ozetToplamKaynagi = k; }
  }

  let miktarCozulemeyen = 0;
  const rowData = (girdi.rowData ?? []).map((eski) => {
    const yeni: Record<string, any> = {};
    for (const k of KORUNAN_ALANLAR) if (eski[k] !== undefined) yeni[k] = eski[k];

    yeni._no = kaynak.no ? String(eski[kaynak.no] ?? '').trim() : '';
    yeni._ad = kaynak.ad ? String(eski[kaynak.ad] ?? '').trim() : '';
    yeni._birim = kaynak.birim ? String(eski[kaynak.birim] ?? '').trim() : '';

    const hamMiktar = kaynak.miktar ? eski[kaynak.miktar] : '';
    const mik = miktarNormalize(hamMiktar);
    if (String(hamMiktar ?? '').trim() !== '' && mik === null) {
      miktarCozulemeyen++;
      yeni._miktarCozulemedi = String(hamMiktar).slice(0, 20); // GS12: sessiz sifir YOK
    }
    yeni._miktar = mik ?? '';

    // Kar alanlari: eskiden geliyorsa korunur, yoksa varsayilan 0 (GS §A.1)
    yeni._malzKar = eski._malzKar ?? 0;
    yeni._iscKar = eski._iscKar ?? 0;
    yeni._marka = eski._marka ?? null;
    yeni._firma = eski._firma ?? null;

    // MF1/MF2: dosyadaki fiyatlar SABIT hucrelere
    yeni._matBirim = kaynakMatBirim ? (eski[kaynakMatBirim] ?? '') : (eski._matBirim ?? '');
    yeni._matToplam = kaynakMatToplam ? (eski[kaynakMatToplam] ?? '') : (eski._matToplam ?? '');
    yeni._labBirim = kaynakLabBirim ? (eski[kaynakLabBirim] ?? '') : (eski._labBirim ?? '');
    yeni._labToplam = kaynakLabToplam ? (eski[kaynakLabToplam] ?? '') : (eski._labToplam ?? '');
    yeni._toplam = eski._toplam ?? '';

    // GS2c: ozet sayfada satir tipi yeniden belirlenir — dosyada miktar/birim
    // olmadigi icin eski kural (ad + (birim|miktar)) hicbir satiri data
    // saymiyordu ve sayfa tamamen KAYBOLUYORDU (İcmal: dosyada 9 dolu satir).
    // Olcut: ad VAR + (sira no VAR veya tutar VAR). Kapak satirlari ("FİRMA:",
    // "İLGİLİ:", "ADRES:") ikisini de tasimadigi icin disarida kalir.
    if (isOzet) {
      const tutar = ozetToplamKaynagi ? miktarNormalize(eski[ozetToplamKaynagi]) : null;
      if (tutar !== null) yeni._toplam = tutar;
      yeni._isDataRow = !!yeni._ad && (yeni._no !== '' || tutar !== null);
      // Kullanici karari (30.07): ozet satirlari GORUNUR ama fiyat
      // eslestirmesine ve TEKLIF GENELI toplamina GIRMEZ — aksi halde YILDIZ'da
      // 62.043.700 iki kez sayilip 124.087.400 olurdu.
      if (yeni._isDataRow) yeni._ozet = true;
    }

    return yeni;
  });

  // ── GS6: secici secenekleri + satirda kaynak metinleri ────────────────
  // Sema degismez; kullanici yalnizca `_ad`i hangi dosya kolonunun besledigini
  // degistirebilir. Bunun ANINDA calisabilmesi icin (grid bos kalmasin) her
  // satir aday kaynak kolonlarin METNINI tasir. Sinir: en cok metin tasiyan
  // 6 kolon — 1694 satirlik dosyalarda payload sismesin.
  const metinSayaci = new Map<string, number>();
  // NOT: sayim `rowData` (donusmus) uzerinden yapilir — ozet sayfalarda satir
  // tipi BURADA yeniden belirlendigi icin, ham girdinin `_isDataRow`i hala
  // false'tur ve seciciyi bos birakirdi (İcmal'de secici hic cikmiyordu).
  for (let i = 0; i < (girdi.rowData ?? []).length; i++) {
    const row = girdi.rowData[i];
    if (!rowData[i]?._isDataRow) continue;
    for (const k of Object.keys(row)) {
      if (!/^col\d+$/.test(k)) continue;
      const v = String(row[k] ?? '').trim();
      if (v.length >= 3 && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(v)) metinSayaci.set(k, (metinSayaci.get(k) ?? 0) + 1);
    }
  }
  const adaylar = Array.from(metinSayaci.entries())
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([f]) => f)
    .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  const basligi = (f: string) =>
    String((girdi.columnDefs ?? []).find((d: any) => d.field === f)?.headerName ?? f).trim();
  const ornegi = (f: string) => {
    const r = (girdi.rowData ?? []).find((x) => x._isDataRow && String(x[f] ?? '').trim());
    return String(r?.[f] ?? '').trim().slice(0, 40);
  };
  const kaynakKolonlar = adaylar.map((f) => ({ field: f, headerName: basligi(f), ornek: ornegi(f) }));
  if (kaynak.ad) {
    for (let i = 0; i < rowData.length; i++) {
      const ham = girdi.rowData[i];
      const kayit: Record<string, string> = {};
      for (const f of adaylar) {
        const v = String(ham?.[f] ?? '').trim();
        if (v) kayit[f] = v;
      }
      if (Object.keys(kayit).length) rowData[i]._kaynak = kayit;
    }
  }

  const veriVar = rowData.some((x) => x._isDataRow);
  return {
    columnDefs: STANDART_KOLONLAR,
    rowData,
    columnRoles: { ...STANDART_ROLLER },
    kaynakKolonlar,
    kaynakAdKolonu: kaynak.ad ?? null,
    headerEndRow: girdi.headerEndRow ?? 0,
    // GS2: sayfa artik "kolon bulamadim" diye dusmez; gercekten satirsizsa bos.
    isEmpty: !veriVar,
    isOzet,
    miktarCozulemeyen,
  };
}
