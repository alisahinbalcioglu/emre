/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ABONELIK OZETI — hesap sayfasindaki TEK dogru kaynak
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU DOSYA NEDEN VAR (03.09'da olculdu)
 *
 *  Abonelik bilgisi IKI ekranda, IKI FARKLI KAYNAKTAN gosteriliyordu ve
 *  ikisi CELISIYORDU:
 *    · `/abonelik`  → gercek `Abonelik` satiri  → "miras-pro · AKTIF"
 *    · `/profile`   → ESKI `UserSubscription`   → "MEP (Her Ikisi) · Suresiz"
 *  (`auth.service.ts:89` hala `prisma.userSubscription.findMany` okuyor.)
 *
 *  ADIM 2'den beri yetenekler `Abonelik`ten TURETILIYOR; eski tablo bir
 *  KALINTI. Yani profildeki kutu, sistemin karar vermek icin kullanmadigi
 *  bir veriyi "aktif aboneliginiz" diye gosteriyordu. Kullanici istegi
 *  "abonelik bilgisini komple hesap sayfasina tasi" oldugu icin, tasirken
 *  DOGRU kaynaga baglanmasi sart — yoksa yanlis veri TEK kaynak olurdu.
 *
 *  Bu modul `ErisimKarari`ni (yani `/auth/me` → `erisim`) ekrana cevirir.
 */

import type { AbonelikDurumu } from './erisim-durumu';
// ⚠ AYNI BİÇİMLEYİCİ, BİLEREK: kullanım kutusundaki "yenilenme 01.10.2026"
// cümlesi de `trTarih`ten çıkar (`kalanKotaCumlesi`). İkinci bir tarih
// biçimleyicisi yazmak, aynı ISO değerinden iki FARKLI gün yazabilirdi —
// `trTarih` UTC+3'e sabitlenmiştir, `toLocaleDateString` tarayıcıya bağlıdır.
import { trTarih } from '../teklif/ceviri-kota';

export interface AbonelikOzeti {
  /** Paket kodu (orn. "pro-mek"); abonelik yoksa null. */
  paketKodu: string | null;
  /** Ekranda gosterilecek paket adi. */
  baslik: string;
  /** Durum KODU (AKTIF · DENEME · ASKIDA · ...) — karar icin; ekrana BASILMAZ. */
  durum: string;
  /** Durum rozetinin ekran metni ("Aktif", "Askıda" ...); kod yoksa bos. */
  durumEtiketi: string;
  /** Kalan gun; bilinmiyorsa null. */
  kalanGun: number | null;
  /** Ikincil satir: "23 gun kaldi" / "Yenilenme: 01.10.2026" / "Abonelik yok". */
  altMetin: string;
  /**
   * Dönemin yenilenme günü ("01.10.2026"); bilinmiyorsa null.
   *
   * ⚠ KAYNAK `GET /ai/translate/kota` → `donemBitis` (21.09'da ölçüldü):
   * o dönem TAKVİM AYI DEĞİL, aynı `Abonelik` satırının dönemidir — çapa
   * `Abonelik.olusturuldu`, adım `PaketSurumu.periyot × periyotAdedi`
   * (`backend/.../ceviri-kotasi.ts` `kotaDonemi`). Yani kota dönemi ile
   * abonelik dönemi AYNI dönemdir; ekran ikisini TEK kaynaktan okur.
   */
  yenilenmeGunu: string | null;
  /** Iptal edilebilir mi? Yalniz YASAYAN abonelikte anlamli. */
  iptalEdilebilir: boolean;
}

/** Iptalin anlamli oldugu durumlar. */
const YASAYAN_DURUMLAR = new Set(['AKTIF', 'DENEME']);

/**
 * ADIM 2 gocunun actigi paketler. Musteriye "miras-pro" yazmak anlamsiz —
 * o bir goc etiketi, satin alinmis bir paket degil.
 */
const MIRAS_ONEKI = 'miras-';

export function mirasMi(paketKodu: string | null | undefined): boolean {
  return !!paketKodu && paketKodu.startsWith(MIRAS_ONEKI);
}

/**
 * Paket kodunun KATALOGDAKİ adı (`GET /abonelik/paketler` → `ad`); kod
 * katalogda yoksa `null` (göç paketi, satıştan kalkmış paket).
 *
 * ⚠ 23.09.2026 — NEDEN VAR: başlık kod katalogda değilse KODUN KENDİSİYDİ.
 * Göç paketi "Geçiş paketi" yazıyordu ama satın alınmış bir paket müşteriye
 * "pro-mek" diye görünüyordu — hem Hesabım'da hem `/abonelik`teki "Şu anki
 * paketiniz" satırında. Hesabım tasarımı paket adını kimlik satırına da
 * taşıyınca kod her sayfada en görünür yere çıkacaktı. Ad sunucunun
 * kataloğundan okunur; burada ikinci bir ad sözlüğü AÇILMAZ.
 */
export function katalogPaketAdi(
  paketKodu: string | null | undefined,
  katalog: readonly { kod: string; ad: string }[] | null | undefined,
): string | null {
  if (!paketKodu || !katalog) return null;
  const ad = katalog.find((p) => p.kod === paketKodu)?.ad?.trim();
  return ad || null;
}

/**
 * Ekrana giden paket ADI (Hesabım kimlik rozeti + paket kartı başlığı):
 * katalog adı → (göç paketi değilse) seviye adı → `null`.
 *
 * ⚠ HAM KOD ASLA (23.09 kod incelemesi): yalnız katalog adına bakılsaydı,
 * katalog okunamayınca ya da paket satıştan kalkınca başlık yine "pro-mek"
 * olurdu — eski rozet o durumda en azından "Pro Plan" diyordu. Seviye adı
 * ("Pro", çağıran `paketRozeti`nden verir) o hâlde doğru ve yeterlidir.
 * Göç paketinde `null` döner: `abonelikOzeti` onu "Geçiş paketi" diye adlandırır.
 */
export function paketGorunenAdi(
  paketKodu: string | null | undefined,
  katalog: readonly { kod: string; ad: string }[] | null | undefined,
  seviyeAdi: string | null,
): string | null {
  return katalogPaketAdi(paketKodu, katalog) ?? (mirasMi(paketKodu) ? null : seviyeAdi);
}

/**
 * Durum kodunun ekran adi (Faz 6.1 kapanis, 15.09). Hesap sayfasi rozeti
 * kodu OLDUGU GIBI basiyordu: musteri "AKTIF", "SONA_ERDI" goruyordu.
 * `Record<AbonelikDurumu, …>`: sunucuya yeni durum eklenip buraya eklenmezse
 * tip denetimi kirilir. Tanimsiz bir kod gelirse kod aynen gosterilir —
 * bos rozet "durum yok" gibi okunurdu.
 */
export const DURUM_ETIKET: Record<AbonelikDurumu, string> = {
  DENEME: 'Deneme',
  AKTIF: 'Aktif',
  ODEME_BEKLIYOR: 'Ödeme bekliyor',
  KISITLI: 'Kısıtlı',
  ASKIDA: 'Askıda',
  IPTAL: 'İptal edildi',
  SONA_ERDI: 'Sona erdi',
};

export function durumEtiketi(durum: string): string {
  if (!durum) return '';
  return (DURUM_ETIKET as Record<string, string>)[durum] ?? durum;
}

/**
 * `ErisimKarari`ni hesap sayfasi ozetine cevirir. SAF fonksiyon.
 *
 * ⚠ `karar` null olabilir (yetenekler henuz gelmedi ya da saglayici yok).
 * O durumda "abonelik yok" DEMEYIZ — bilmiyoruz demektir; yanlis bilgi
 * vermektense bos birakiriz.
 *
 * ── İKİ PANELİN ÇELİŞKİSİ (21.09.2026'da ölçüldü) ──────────────────────
 * Hesap sayfasında kullanım kutusu "yenilenme 01.10.2026" derken abonelik
 * kutusu "Yenileme tarihi belirtilmemiş" diyordu. Sebep metin değil KAYNAK:
 * `kalanGun`, `ErisimKarari`da DENEME / tolerans / iptal sonrası için tutulan
 * bir GERİ SAYIMDIR ve AKTIF abonelikte sunucu onu BİLEREK `null` döndürür
 * (`backend/.../erisim.servisi.ts`, `case AKTIF`). Yani ödeyen müşteri o
 * cümleyi HER ZAMAN görüyordu; "belirtilmemiş" doğru değildi — yenilenme
 * günü biliniyordu, yalnız bu alanda değildi.
 *
 * Çözüm: yenilenme günü kullanım kutusuyla AYNI kaynaktan okunur
 * (`donemBitisISO`). `kalanGun` yalnız kendi anlamıyla kullanılır.
 */
export function abonelikOzeti(
  karar: {
    paketKodu?: string | null;
    durum?: string | null;
    kalanGun?: number | null;
  } | null | undefined,
  /**
   * Dönem bitişi (ISO) — `GET /ai/translate/kota` → `donemBitis`. Verilmezse
   * davranış eskisiyle BİREBİR aynıdır (geriye dönük uyumlu).
   */
  donemBitisISO?: string | null,
  /**
   * Paketin katalogdaki adı (`katalogPaketAdi`). Verilmezse başlık eskisi
   * gibi göç paketinde "Geçiş paketi", öbürlerinde paket kodudur.
   */
  paketAdi?: string | null,
): AbonelikOzeti {
  // Geçersiz/boş ISO uydurulmuş tarih üretmesin: `trTarih` boş dize döner.
  const yenilenmeGunu = (donemBitisISO ? trTarih(donemBitisISO) : '') || null;

  if (!karar) {
    return {
      paketKodu: null,
      baslik: '—',
      durum: '',
      durumEtiketi: '',
      kalanGun: null,
      altMetin: 'Abonelik bilgisi yükleniyor',
      iptalEdilebilir: false,
      yenilenmeGunu: null,
    };
  }

  const paketKodu = karar.paketKodu ?? null;
  const durum = karar.durum ?? '';

  if (!paketKodu) {
    return {
      paketKodu: null,
      baslik: 'Abonelik yok',
      durum,
      durumEtiketi: durumEtiketi(durum),
      kalanGun: null,
      altMetin: 'Devam etmek için bir paket seçin',
      iptalEdilebilir: false,
      // Paket yokken "yenilenme" diye bir gün yoktur.
      yenilenmeGunu: null,
    };
  }

  const kalanGun = karar.kalanGun ?? null;

  return {
    paketKodu,
    // Katalog adı varsa o; goc paketi musteriye teknik kodla gosterilmez.
    baslik: paketAdi?.trim() || (mirasMi(paketKodu) ? 'Geçiş paketi' : paketKodu),
    durum,
    durumEtiketi: durumEtiketi(durum),
    kalanGun,
    yenilenmeGunu,
    /**
     * ⚠ SIRA ÖNEMLİ: `kalanGun` doluysa o SUNUCUNUN söylediği geri sayımdır
     * (deneme bitişi / tolerans / iptalden sonra kalan erişim) ve dönem
     * bitişinden FARKLI bir gün olabilir — ikisini birlikte yazmak ekranda
     * yeni bir çelişki üretirdi. Yenilenme günü yalnız geri sayım YOKKEN
     * (yani normal yürüyen abonelikte) yazılır.
     */
    altMetin:
      kalanGun !== null
        ? `${kalanGun} gün kaldı`
        : yenilenmeGunu
          ? `Yenilenme: ${yenilenmeGunu}`
          : 'Yenileme tarihi belirtilmemiş',
    // ⚠ Goc paketi de iptal EDILEBILIR sayilir: musteri isterse cikabilmeli.
    iptalEdilebilir: YASAYAN_DURUMLAR.has(durum),
  };
}

/**
 * ── IPTAL YOLU: EN AZ UC TIKLAMA (03.09 kullanici karari) ───────────────
 *
 * "Aboneligi iptal et secenegi minimum 3 tiklama ile gorulebilsin."
 * Gerekce ticari: iptal, musterinin gozune sokulacak bir eylem degil.
 *
 * Adimlar SAYILABILIR olsun diye burada ILAN EDILIYOR; test bu sayiyi
 * ekrandaki gercek adimlarla karsilastirir. Sadece "gizledim" demek
 * olcum degildir.
 *
 *   1. Hesabim sayfasini ac
 *   2. "Abonelik" sekmesini ac
 *   3. "Aboneligi iptal et" dugmesine bas
 *   4. Onay kutusunda dogrula   ← dorduncu emniyet
 *
 * ⚠ 23.09.2026 (Hesabim tasarimi): ikinci adim eskiden "Abonelik yonetimi ▾"
 * acilir bolumuydu; sayfa sekmelere bolununce yerini ABONELIK SEKMESI aldi.
 * Derinlik DEGISMEDI: dugme yine ancak ikinci tiklamadan sonra gorunur.
 */
export const IPTAL_ADIMLARI = [
  'hesap-sayfasi',
  'abonelik-sekmesi',
  'iptal-dugmesine-bas',
  'onayla',
] as const;

export const ASGARI_IPTAL_TIKLAMASI = 3;

/** Ilan edilen adim sayisi kurali sagliyor mu? SAF fonksiyon. */
export function iptalYoluYeterinceDerinMi(
  adimlar: readonly string[] = IPTAL_ADIMLARI,
): boolean {
  return adimlar.length >= ASGARI_IPTAL_TIKLAMASI;
}
