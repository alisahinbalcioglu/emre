/**
 * FIYATLI CIKTI — SATIR PLANI (23.09.2026, Emre'nin "yeni tasarim kurallari")
 *
 * Grid satirlarini ciktiya yazilacak SIRALI plana cevirir. ExcelJS'e dokunmaz
 * (saf); yazim `standart-cikti.ts`de. Iki cikti yolu da (fiyatli + teklif
 * formati) bu plani `standartSayfaYaz` uzerinden kullanir (KF7 tek motor).
 *
 * ── SAYFA TURU ──
 *  kalem sayfasi  en az bir KALEM satiri var → fiyat tablosu
 *  metin sayfasi  hic kalem yok (Teklif Esaslari, İcmal, kur tablosu) → duz
 *                 metin; fiyat sutunu ve 0 TL'lik SAYFA TOPLAMI YOK
 *
 * ── SATIR TURLERI (kalem sayfasi) ──
 *  kalem      veri satiri + (miktar sayisal YA DA para tasiyor)
 *  ozet       `_ozet` veri satiri (musterinin ARA TOPLAM'i) — gorunur, toplama GIRMEZ
 *  altBaslik  metin; "Not" ile baslamaz ve son kalemden ONCE
 *  not        metin; "Not" ile baslar YA DA son kalemden SONRA
 *
 * ⚠ TARIFTEN OLCULMUS SAPMA: tarif kalemi yalniz "Miktar sayisal" diye
 * tanimliyor. Tutari olup miktari olmayan satir (goturu bedel) o tanimla
 * METIN olur ve parasi ciktidan SESSIZCE duser — fixture'larda FIRMA-C'de 18,
 * ŞAHİNKUL'da 7 para hucresi boyleydi (23.09 olcumu). Para tasiyan satir kalemdir.
 */
import { makineSayiOku } from '../../kutuphane/utils/import-fidelity';

/** Rol → grid alani. Sabit semada `_ad`/`_matBirim`; eski kayitta dosya kolonu (colN). */
export interface AlanHaritasi {
  no: string;
  ad: string;
  miktar: string;
  birim: string;
  matBirim: string;
  matToplam: string;
  labBirim: string;
  labToplam: string;
}

/**
 * ESKI KAYIT UYUMU (kullanici karari 30.07: "acilista donustur"): sabit semadan
 * ONCE kaydedilmis tekliflerde roller DOSYA kolonlarini (col3, col4 …) gosterir.
 * Alanlar rol uzerinden okunur; sabit semada rol zaten `_ad` oldugu icin AYNI
 * kod iki sekli de tasir.
 */
export function alanHaritasi(columnRoles: unknown): AlanHaritasi {
  const rol = (columnRoles ?? {}) as Record<string, unknown>;
  const A = (ad: string, sabit: string) => (typeof rol[ad] === 'string' && rol[ad] ? (rol[ad] as string) : sabit);
  return {
    no: A('noField', '_no'),
    ad: A('nameField', '_ad'),
    miktar: A('quantityField', '_miktar'),
    birim: A('unitField', '_birim'),
    matBirim: A('materialUnitPriceField', '_matBirim'),
    matToplam: A('materialTotalField', '_matToplam'),
    labBirim: A('laborUnitPriceField', '_labBirim'),
    labToplam: A('laborTotalField', '_labToplam'),
  };
}

type Satir = Record<string, any>;

export type PlanSatiri =
  | { tur: 'kalem'; satir: Satir; ad: string }
  | { tur: 'ozet'; satir: Satir; ad: string }
  | { tur: 'altBaslik'; metin: string }
  | { tur: 'not'; metin: string }
  | { tur: 'paragraf'; metin: string; baslik: boolean };

export interface SayfaPlani {
  tur: 'kalem' | 'metin';
  satirlar: PlanSatiri[];
}

/**
 * ETKIN MIKTAR (on yuz `pricing.ts etkinMiktar` ikizi — UY2, EMO AYVAZ 27.07):
 * MİKTAR/BİRİM basliklari TERS kaydedilmis tekliflerde miktar hucresinde metin
 * ('mt'), sayi birim hucresindedir. Uygulama toplami o sayiyla hesaplar;
 * ciktinin formulu (F = C × E) ayni sayiyi gormezse ekranla ayrisir. Sayi birim
 * hucresinden geldiyse birim METNI miktar hucresindedir (yer degistirilir).
 */
export function miktarVeBirim(r: Satir, alan: AlanHaritasi): { miktar: number | null; birim: unknown } {
  const m = makineSayiOku(r[alan.miktar]);
  if (m !== null) return { miktar: m, birim: r[alan.birim] };
  const b = makineSayiOku(r[alan.birim]);
  if (b !== null) return { miktar: b, birim: r[alan.miktar] };
  return { miktar: null, birim: r[alan.birim] };
}

/** Dort para hucresinden biri sifirdan farkli mi (birim ya da toplam, malzeme ya da iscilik). */
export function paraVar(r: Satir, alan: AlanHaritasi): boolean {
  return [alan.matBirim, alan.matToplam, alan.labBirim, alan.labToplam]
    .some((k) => (makineSayiOku(r[k]) ?? 0) !== 0);
}

const bosluklariTopla = (x: unknown) => String(x ?? '').replace(/\s+/g, ' ').trim();

/** Turkce buyuk/kucuk harf kurali (`İ`/`ı`) — `toUpperCase` "i"yi "I" yapar. */
const buyuk = (s: string) => s.toLocaleUpperCase('tr');
const kucuk = (s: string) => s.toLocaleLowerCase('tr');

/** Ilk karakter kucuk HARF mi (rakam/noktalama degil). */
export function kucukHarfleBaslar(s: string): boolean {
  const c = s.charAt(0);
  return c !== buyuk(c) && c === kucuk(c);
}

/** Metin sayfasi bolum basligi: 45 karakterden kisa ve tamami buyuk harf ('8"' dahil). */
export function bolumBasligiMi(s: string): boolean {
  return s.length < 45 && s === buyuk(s);
}

/** "Not", "NOT:", "Notlar" — "Noter", "Nota" DEGIL. */
export function notIleBaslar(s: string): boolean {
  return /^not(?:lar)?(?![a-zçğıöşü])/i.test(s);
}

const SON_NOKTALAMA = /[.!?:;)]$/;
/** Yeni paragraf acan liste isareti: "- …", "• …", "1. …", "2) …", "a) …". */
const LISTE_ISARETI = /^(?:[-–•*·]|\(?\d{1,3}[.)]|\(?[a-zçğıöşü][.)])\s/i;

/**
 * Bolunmus cumle: satir oncekine eklenir mi?
 * TARIF: kucuk harfle basliyorsa, ya da onceki satir ≥70 karakter ve `. ! ? : ; )`
 * ile bitmiyorsa. EK KORUMA (tarifte yok): bolum basligi, "Not" ve liste
 * isaretli satir yeni paragraftir; basligin icine de satir eklenmez — aksi
 * hâlde "TEKLİF ESASLARI kapsamında…" gibi bir satir uretilirdi.
 */
export function birlesirMi(onceki: string, satir: string): boolean {
  if (bolumBasligiMi(onceki) || bolumBasligiMi(satir) || notIleBaslar(satir) || LISTE_ISARETI.test(satir)) return false;
  if (kucukHarfleBaslar(satir)) return true;
  return onceki.length >= 70 && !SON_NOKTALAMA.test(onceki);
}

/**
 * TEMIZLIK (tarifin "mevcut ciktidaki kusurlari"): art arda ayni metin teke
 * iner (kaynaktaki birlesik hucreler cogaliyordu: "FİYAT TEKLİFİ" yedi kez),
 * bolunmus cumleler birlesir. Birlesme yeni bir tekrar dogurabilir (tekrarlanan
 * bolunmus paragraf) — bu yuzden tekillestirme birlesmeden sonra BIR KEZ DAHA.
 *
 * ⚠ "ONCEKI SATIR" KAYNAKTAKI SATIRDIR, birlesmis paragraf DEGIL (referans
 * dosyayla olculdu, 23.09): "…tarafımızdan" + "verilecektir" birlesince 70
 * karakteri asan ve noktasiz biten paragrafa bir sonraki madde ("Sistemin
 * kurulumu…") de eklenirdi; referansta ayri maddedir.
 */
export function metinleriTemizle(metinler: readonly string[]): string[] {
  const tekil = (l: readonly string[]) => l.filter((m, i) => i === 0 || m !== l[i - 1]);
  const birlesik: string[] = [];
  let oncekiHam = '';
  for (const m of tekil(metinler)) {
    const son = birlesik.length - 1;
    if (son >= 0 && birlesirMi(oncekiHam, m)) birlesik[son] = `${birlesik[son]} ${m}`;
    else birlesik.push(m);
    oncekiHam = m;
  }
  return tekil(birlesik);
}

type HamSatir = { tur: 'kalem' | 'ozet'; satir: Satir; ad: string; metin: string } | { tur: 'metin'; metin: string };

function satirlariAyikla(rowData: readonly any[], alan: AlanHaritasi): HamSatir[] {
  const ham: HamSatir[] = [];
  for (const r of rowData ?? []) {
    // Dosyanin KENDI baslik satiri yazilmaz: ustte standart baslik var (FAZ0 §A.2 cift baslik)
    if (!r || r._isHeaderRow) continue;
    const metin = bosluklariTopla(r[alan.ad]);
    if (r._isDataRow) {
      const ad = String(r[alan.ad] ?? '').trim();
      if (r._ozet) {
        if (ad || paraVar(r, alan)) ham.push({ tur: 'ozet', satir: r, ad, metin });
        continue;
      }
      if (miktarVeBirim(r, alan).miktar !== null || paraVar(r, alan)) {
        ham.push({ tur: 'kalem', satir: r, ad, metin });
        continue;
      }
    }
    if (metin) ham.push({ tur: 'metin', metin });
  }
  return ham;
}

/** Grid sayfasi → yazim plani (sayfa turu + temizlenmis, turlenmis satirlar). */
export function sayfaPlaniKur(rowData: readonly any[], alan: AlanHaritasi): SayfaPlani {
  const ham = satirlariAyikla(rowData, alan);

  if (!ham.some((h) => h.tur === 'kalem')) {
    // Metin sayfasinda her sey metindir: musterinin İcmal satirlari (ozet) da
    // adlariyla paragraf olur, tutarlari yazilmaz (tarif §4 — fiyat sutunu yok).
    const paragraflar = metinleriTemizle(ham.map((h) => h.metin).filter(Boolean));
    return { tur: 'metin', satirlar: paragraflar.map((metin) => ({ tur: 'paragraf', metin, baslik: bolumBasligiMi(metin) })) };
  }

  const sira: PlanSatiri[] = [];
  let kosu: string[] = [];
  const kosuyuBosalt = () => {
    for (const metin of metinleriTemizle(kosu)) sira.push({ tur: 'altBaslik', metin });
    kosu = [];
  };
  for (const h of ham) {
    if (h.tur === 'metin') { kosu.push(h.metin); continue; }
    kosuyuBosalt(); // temizlik yalniz ARDISIK metin satirlarinda — kalem araya girince kosu biter
    sira.push({ tur: h.tur, satir: h.satir, ad: h.ad });
  }
  kosuyuBosalt();

  let sonKalem = -1;
  sira.forEach((p, i) => { if (p.tur === 'kalem') sonKalem = i; });
  return {
    tur: 'kalem',
    satirlar: sira.map((p, i) => (p.tur === 'altBaslik' && (i > sonKalem || notIleBaslar(p.metin)) ? { tur: 'not', metin: p.metin } : p)),
  };
}
