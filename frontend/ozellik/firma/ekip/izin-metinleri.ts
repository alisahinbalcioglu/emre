/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  23.09.2026 — ALT KULLANICI IZINLERI: EKRAN SOZLUGU (saf, IMPORT'SUZ)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  KARAR SUNUCUDADIR (`backend/src/ozellik/firma/uye-izinleri.ts`). Bu dosya
 *  yalnizca ekranin NE YAZACAGINI ve anahtarlarin SIRASINI tasir; bir uca
 *  girilip girilemeyecegini HESAPLAMAZ. Ikiz karar bu depoda olculmus bir
 *  hata sinifidir (`erisim-durumu.ts`).
 *
 *  ⚠ ANAHTARLAR SUNUCUYLA BIREBIR: `ekip-izinleri-test.ts` E4 bu dosyadaki
 *  `anahtar:` degerlerini sunucunun kanonik listesiyle SIRA DAHIL karsilastirir.
 *
 *  ⚠ IMPORT YOK: vitest bu depoda `@/…` cozmuyor; saf dosya testte dogrudan
 *  okunabilsin (`kapali-durum.ts` ile ayni gerekce). Simgeler (lucide) bu
 *  yuzden AYRI dosyada: `izin-simgeleri.ts`.
 *
 *  ⚠ EMOJI YOK (23.09 ikinci tasarim, "Görsel kurallar"): ikonlar lucide.
 */

export type UyeIzni = 'excel' | 'dwg' | 'firmaTeklifleri' | 'kutuphane';

export interface IzinTanimi {
  anahtar: UyeIzni;
  /** Anahtar satirinin basligi (davet penceresi + izin paneli). */
  baslik: string;
  /** Anahtar satirinin alt satiri. */
  aciklama: string;
  /** Uye satirindaki kisa etiket (acik = yesil tik, kapali = gri kilit). */
  etiket: string;
  /** "Fiyat bilgisi" rozeti: bu izin fiyat/tutar gosterir. */
  fiyatBilgisi: boolean;
  /** Kapali bolum sayfasinin basligi. */
  erisimYokBasligi: string;
  /** Kapali bolum sayfasinin aciklamasi. */
  erisimYokAciklamasi: string;
  /**
   * Izin KAPALIYKEN satirin alt satiri (Hesabım › Ekip erişimim); yoksa
   * `aciklama` yazilir. Kapali izinde kisinin ELINDE KALANI soyler.
   */
  kapaliAciklamasi?: string;
}

const KAPALI_TUTTU = 'Firma yöneticin bu bölümü senin için kapalı tuttu.';

/**
 * Tasarimdaki dort anahtar, TASARIMDAKI sirayla; metinler tasarimdan.
 *
 * ⚠ Tek sapma, olculmus bir karardan: "Son teklifler ve tutarları"
 * aciklamasi tasarimda "Teklif listesini ve tutarları görebilir". Emre'nin
 * 23.09 karari geregi izin kapaliyken kisi teklif listesini YINE gorur —
 * yalniz KENDI hazirladiklarini. Metin "Firmanın" diye baslamazsa sahip
 * izni kapatinca listenin tamamen kayboldugunu sanar.
 */
export const IZIN_TANIMLARI: readonly IzinTanimi[] = [
  {
    anahtar: 'excel',
    baslik: 'Excel keşif',
    aciklama: 'Excel dosyasından keşif ve metraj çıkarabilir',
    etiket: 'Excel keşif',
    fiyatBilgisi: false,
    erisimYokBasligi: 'Excel keşfe erişimin yok',
    erisimYokAciklamasi: `Bu özellik Excel dosyasından keşif ve metraj çıkarır. ${KAPALI_TUTTU}`,
  },
  {
    anahtar: 'dwg',
    baslik: 'DWG proje',
    aciklama: 'DWG/PDF çizimden metraj alabilir',
    etiket: 'DWG proje',
    fiyatBilgisi: false,
    erisimYokBasligi: 'DWG projeye erişimin yok',
    erisimYokAciklamasi: `Bu bölümde DWG/PDF çizimden metraj alınır. ${KAPALI_TUTTU}`,
  },
  {
    anahtar: 'firmaTeklifleri',
    baslik: 'Son teklifler ve tutarları',
    aciklama: 'Firmanın teklif listesini ve tutarları görebilir',
    etiket: 'Teklif tutarları',
    fiyatBilgisi: true,
    erisimYokBasligi: 'Firmanın tekliflerine erişimin yok',
    erisimYokAciklamasi: `Kendi hazırladığın teklifleri görebilirsin. ${KAPALI_TUTTU}`,
    // Emre 23.09 (Hesabım): satirlarin 3. sahis diliyle. Yalniz "Firmanın
    // teklif listesi" + "Kapalı" yazsaydi uye listenin TAMAMEN kapandigini sanirdi.
    kapaliAciklamasi: 'Yalnız kendi hazırladığı teklifleri görebilir',
  },
  {
    anahtar: 'kutuphane',
    baslik: 'Kütüphanem',
    aciklama: 'Kayıtlı marka ve birim fiyatlarını görebilir',
    etiket: 'Kütüphanem',
    fiyatBilgisi: true,
    erisimYokBasligi: 'Kütüphanem’e erişimin yok',
    erisimYokAciklamasi: `Bu bölüm firmanın kayıtlı marka ve birim fiyatlarını içerir. ${KAPALI_TUTTU}`,
  },
];

/** Kanonik sira — sunucunun `UYE_IZINLERI` ile ayni. */
export const IZIN_SIRASI: readonly UyeIzni[] = IZIN_TANIMLARI.map((t) => t.anahtar);

/** Anahtardan tanim (bilinmeyen anahtar → `undefined`). */
export function izinTanimi(izin: UyeIzni): IzinTanimi | undefined {
  return IZIN_TANIMLARI.find((t) => t.anahtar === izin);
}

/** Kisinin kendi izin satiri (Hesabım › Ekip erişimim). */
export interface IzinSatiri {
  anahtar: UyeIzni;
  baslik: string;
  /** Alt satir: izin KAPALIYSA `kapaliAciklamasi` (varsa), degilse `aciklama`. */
  aciklama: string;
  acik: boolean;
}

/**
 * 23.09.2026 — Hesabım › Ekip erişimim: kisinin ETKIN izin listesinden dort
 * satir, kanonik sirayla. Metin bu sozlukten; ekran yeniden yazmaz.
 *
 * ⚠ `null` → `null` (satir YOK): sunucu listeyi SOYLEMEDIYSE (eski sunucu,
 * dusen istek) ekran "Açık"/"Kapalı" diye bir BEYAN cizmez. `izinVar` burada
 * BILEREK tersini yapar (null → true): menu bir kolaylik, bu satirlar bir
 * beyan — bilinmeyen durumu "Açık" diye yazmak da "Kapalı" diye yazmak da yalan.
 * Bos dizi (`[]`) ise bilinen bir durumdur: dordu de kapali.
 */
export function izinSatirlari(izinler: readonly UyeIzni[] | null | undefined): IzinSatiri[] | null {
  if (!izinler) return null;
  return IZIN_TANIMLARI.map((t) => {
    const acik = izinler.includes(t.anahtar);
    return {
      anahtar: t.anahtar,
      baslik: t.baslik,
      aciklama: acik ? t.aciklama : (t.kapaliAciklamasi ?? t.aciklama),
      acik,
    };
  });
}

/**
 * Davet penceresinin ACILIS secimi — tasarimdaki gibi: Excel ve DWG acik,
 * fiyat bilgisi tasiyan ikisi (Teklif tutarlari, Kutuphanem) KAPALI. Yalniz
 * ekran varsayilanidir; sahip gondermeden once degistirir. Sunucu
 * varsayilani AYRIDIR (dordu) ve yalniz izin GONDERMEYEN eski istemci icindir.
 */
export const VARSAYILAN_DAVET_IZINLERI: readonly UyeIzni[] = ['excel', 'dwg'];

/** Kanonik sirada, tekrarsiz; bilinmeyen deger atilir. */
export function izinSirala(izinler: readonly string[] | null | undefined): UyeIzni[] {
  const set = new Set(izinler ?? []);
  return IZIN_SIRASI.filter((i) => set.has(i));
}

/** Tek anahtari ac/kapa — yeni dizi (girdi DEGISMEZ). */
export function izinDegistir(
  izinler: readonly UyeIzni[],
  izin: UyeIzni,
  acik: boolean,
): UyeIzni[] {
  const set = new Set(izinler);
  if (acik) set.add(izin);
  else set.delete(izin);
  return IZIN_SIRASI.filter((i) => set.has(i));
}

/** Iki kume ayni mi (sira onemsiz) — "Kaydet" dugmesini gereksizce acmasin. */
export function izinlerAyniMi(a: readonly string[], b: readonly string[]): boolean {
  return izinSirala(a).join(',') === izinSirala(b).join(',');
}

/** Sunucunun `UYE_IZNI_YOK` 403'u mu? (Ekranlar odeme hatasindan AYIRIR.) */
export function uyeIzniReddiMi(e: unknown): boolean {
  const govde = (e as { response?: { status?: number; data?: { kod?: string } } })?.response;
  return govde?.status === 403 && govde?.data?.kod === 'UYE_IZNI_YOK';
}

/**
 * Kapali bolum sayfasindaki "E-posta gönder" baglantisi. Konu satiri
 * tasarimdaki gibi "<Bolum> erişimi"; adres ve konu KODLANIR (bosluk, "ü").
 */
export function yoneticiyeYazBaglantisi(eposta: string, izin?: UyeIzni): string {
  const t = izin ? izinTanimi(izin) : undefined;
  const konu = t ? `?subject=${encodeURIComponent(`${t.baslik} erişimi`)}` : '';
  return `mailto:${encodeURIComponent(eposta).replace(/%40/g, '@')}${konu}`;
}
