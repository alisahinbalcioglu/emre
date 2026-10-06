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
 *
 *  06.10.2026 — DORT IZIN IKI YETKIYE INDI (ekip/yetki plani B):
 *   fiyat → eski `excel` + `kutuphane` + `firmaTeklifleri` birlesimi
 *           (Excel kesif, fiyat eslestirme, Firma kutuphanesi, iscilik
 *           firmalari, teklif formatlari, firmanin TUM teklifleri).
 *   dwg   → DWG'den metraj.
 *  ⚠ Bu surumde fiyat yetkisi KAPALI uye KENDI tekliflerinde tutari hala
 *    gorur (sunucu tarafli fiyat gizleme sonraki surumde). Metinler bu yuzden
 *    "fiyat goremez" DEMEZ — yalan beyan olurdu.
 */

export type UyeIzni = 'fiyat' | 'dwg';

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
 * Iki yetki, sunucunun kanonik sirasiyla (`UYE_IZINLERI`: fiyat, dwg).
 *
 * ⚠ Kesme isareti TIPOGRAFIK (’): duz `'` React'te `&#x27;` olarak kacislanir
 *   (aria-label, mailto konusu); depodaki on yuz metinleri de ’ kullanir
 *   ("Malzeme Havuzu’ndan", eski "Kütüphanem’e").
 * ⚠ Fiyat KAPALIYKEN Hesabım satiri (`kapaliAciklamasi`) kisinin ELINDE
 *   KALANI soyler: Emre 23.09 karari geregi teklif listesi KAYBOLMAZ — yalniz
 *   KENDI hazirladiklari. "Fiyat göremez" YAZILMAZ (bu surumde dogru degil).
 */
export const IZIN_TANIMLARI: readonly IzinTanimi[] = [
  {
    anahtar: 'fiyat',
    baslik: 'Fiyatlandırma ve teklifler (Excel keşif)',
    aciklama:
      'Excel keşif yükler, fiyat eşleştirir; firma kütüphanesini, işçilik firmalarını ve teklif formatlarını yönetir. Firmanın tüm tekliflerini görür.',
    etiket: 'Fiyatlandırma ve teklifler',
    fiyatBilgisi: true,
    erisimYokBasligi: 'Fiyat yetkin kapalı',
    erisimYokAciklamasi: `Firma kütüphanesi, işçilik firmaları ve teklif formatları fiyat yetkisiyle açılır. ${KAPALI_TUTTU}`,
    // ⚠ "fiyatlandırma kapalı" DEĞİL: elle birim fiyat yazmak yetkiye bağlı
    //   değil (kapı yalnız eşleştirmede). Kapalı olanı adıyla söyler.
    kapaliAciklamasi:
      'Excel keşif, fiyat eşleştirme ve firma kütüphanesi kapalı; yalnız kendi hazırladığı teklifleri görür.',
  },
  {
    anahtar: 'dwg',
    baslik: 'DWG’den metraj',
    aciklama:
      'DWG/PDF çizimden metraj alır. Fiyat yetkisi olmasa da metrajı hazırlayıp kaydeder; fiyatlandırmayı fiyat yetkisi olan biri yapar.',
    etiket: 'DWG’den metraj',
    fiyatBilgisi: false,
    erisimYokBasligi: 'DWG’den metraja erişimin yok',
    erisimYokAciklamasi: `Bu bölümde DWG/PDF çizimden metraj alınır. ${KAPALI_TUTTU}`,
  },
];

/** Kanonik sira — sunucunun `UYE_IZINLERI` ile ayni. */
export const IZIN_SIRASI: readonly UyeIzni[] = IZIN_TANIMLARI.map((t) => t.anahtar);

/**
 * Saglayicinin `izinVar` sorusunun SAF karari (KOLAYLIK — kapi sunucuda).
 *  · `firmaRol === 'sahip'` → HER ZAMAN `true`: sahip her seye sahiptir;
 *    saklanan liste OKUNMAZ (sunucudaki `izinVarMi` ile ayni kural). Gecis
 *    penceresinde yeni on yuz eski sunucudan ya da bayat listeden eski
 *    anahtarlar alirsa `izinSirala` onlari atar — sahibin menusu ve yukleme
 *    kutulari bu yuzden KILITLENMEMELI.
 *  · liste `null` (sunucu soylemedi) → `true`: ekran bosaltilmaz.
 *  · aksi hâlde listede olan.
 * Rol `null`/`'uye'` ise liste karar verir (rol bilinmiyorsa sahip SAYILMAZ).
 */
export function izinVarMi(
  izinler: readonly UyeIzni[] | null,
  firmaRol: 'sahip' | 'uye' | null,
  izin: UyeIzni,
): boolean {
  if (firmaRol === 'sahip') return true;
  return izinler === null ? true : izinler.includes(izin);
}

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
 * 23.09.2026 — Hesabım › Ekip erişimim: kisinin ETKIN izin listesinden her
 * yetki icin bir satir, kanonik sirayla. Metin bu sozlukten; ekran yeniden yazmaz.
 *
 * ⚠ `null` → `null` (satir YOK): sunucu listeyi SOYLEMEDIYSE (eski sunucu,
 * dusen istek) ekran "Açık"/"Kapalı" diye bir BEYAN cizmez. `izinVar` burada
 * BILEREK tersini yapar (null → true): menu bir kolaylik, bu satirlar bir
 * beyan — bilinmeyen durumu "Açık" diye yazmak da "Kapalı" diye yazmak da yalan.
 * Bos dizi (`[]`) ise bilinen bir durumdur: hepsi kapali.
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
 * Davet penceresinin ACILIS secimi — BOS (06.10 karari: en az yetki). Sahip
 * en az bir yetkiyi BILEREK acar; "Davet gönder" o zamana dek pasif
 * (`izinSecimiGecerli`). Sunucu varsayilani AYRIDIR (ikisi) ve yalniz izin
 * GONDERMEYEN eski istemci icindir.
 */
export const VARSAYILAN_DAVET_IZINLERI: readonly UyeIzni[] = [];

/** Kanonik sirada, tekrarsiz; bilinmeyen deger atilir. */
export function izinSirala(izinler: readonly string[] | null | undefined): UyeIzni[] {
  const set = new Set(izinler ?? []);
  return IZIN_SIRASI.filter((i) => set.has(i));
}

/**
 * Davet ve yetki kaydi EN AZ BIR yetki ister (sunucu da ayni kurali uygular).
 * Yalniz BILINEN anahtarlar sayilir: eski bir deger (`excel`) tek basina
 * secimi gecerli kilmaz.
 */
export function izinSecimiGecerli(izinler: readonly string[] | null | undefined): boolean {
  return izinSirala(izinler).length > 0;
}

/** Hic yetki secilmemisken gonder/kaydet dugmesinin yanindaki ipucu. */
export const EN_AZ_BIR_YETKI_METNI = 'En az bir yetki seçin';

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
 * 06.10: bolum adi KISA etiketten — basliktaki "(Excel keşif)" aciklamasi
 * anahtar satiri icindir, e-posta konusuna tasinmaz.
 */
export function yoneticiyeYazBaglantisi(eposta: string, izin?: UyeIzni): string {
  const t = izin ? izinTanimi(izin) : undefined;
  const konu = t ? `?subject=${encodeURIComponent(`${t.etiket} erişimi`)}` : '';
  return `mailto:${encodeURIComponent(eposta).replace(/%40/g, '@')}${konu}`;
}
