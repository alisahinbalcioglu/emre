/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  OZELLIK KAPISI — "yukleniyor / acik / sonuk" UC DURUMLU ortak kapi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  02.09'da DWG icin yazildi, 03.09'da Excel ve ISCILIK de ayni kapiya
 *  baglandi. Uc yerde uc farkli "sonuk" gorunumu olmasin diye TEK yerden
 *  uretiliyor.
 *
 *  ── NEDEN UC DURUM, IKI DEGIL ──────────────────────────────────────────
 *  Yetenekler `/auth/me`'den gelir ve ILK RENDER'DA YOKTUR. Iki durumlu bir
 *  kapi o anda "yetenek yok" okur ve PARASINI ODEMIS musteriye bir an
 *  "Pro paket gerekli" YAZAR — sonra duzelir. Titreme kadar zararsiz degil:
 *  kullaniciya YANLIS bilgi verir. `yukleniyor` durumu tiklamayi kapatir
 *  ama suclayici etiketi GOSTERMEZ.
 *
 *  ── SAVUNMACI VARSAYILAN ───────────────────────────────────────────────
 *  `izinVar` yanlissa kapi SONUKTUR. Yani bir yetenek okunamadiginda ozellik
 *  ACIK KALMAZ; yanlis yon "kapali" tarafidir.
 */

export type KapiDurumu = 'yukleniyor' | 'acik' | 'sonuk';

export interface KapiGirdisi {
  /** Yetenekler hala cekiliyor mu? */
  loading: boolean;
  /** Bu ozellik icin yetenek var mi? */
  izinVar: boolean;
}

/** Kapi durumunu hesaplar. SAF fonksiyon. */
export function kapiDurumu({ loading, izinVar }: KapiGirdisi): KapiDurumu {
  if (loading) return 'yukleniyor';
  return izinVar ? 'acik' : 'sonuk';
}

/**
 * Etkilesim acik mi?
 *
 * ⚠ `yukleniyor` da FALSE doner: yetenek bilinmeden islem baslatilirsa
 * kullanici sunucudan 403 yer ve sebebini goremez.
 */
export function tiklanabilir(durum: KapiDurumu): boolean {
  return durum === 'acik';
}

/** Sonuk durumda gosterilecek ortak rozet metni. */
export const SONUK_ROZET = 'Pro paket gerekli';

/**
 * Rozet metni. `yukleniyor` durumunda rozet GOSTERILMEZ (null) — henuz
 * bilmedigimiz bir sey hakkinda etiket basmayiz.
 */
export function rozetMetni(durum: KapiDurumu, acikEtiket?: string): string | null {
  if (durum === 'acik') return acikEtiket ?? null;
  if (durum === 'sonuk') return SONUK_ROZET;
  return null;
}

/** Sonuk durumda gosterilecek ipucu; diger durumlarda ipucu yok. */
export function ipucu(durum: KapiDurumu, metin: string): string | undefined {
  return durum === 'sonuk' ? metin : undefined;
}
