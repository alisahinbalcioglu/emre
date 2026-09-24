import { AbonelikDurumu, OdemeYontemi } from '@prisma/client';
import { mirasPaketiMi } from './deneme-hakki';
import { binlik, ceviriKotasiCoz, trTarih } from './ceviri-kotasi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAKET DEGISIMI — SAF KARAR (23.09.2026, yonetici paneli turu A1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre: "modeli yukseltip dusurebilmeli ... paket degisince odeme de ona
 *  gore olacak (yukseltilen ya da dusurulen paket fiyati ne ise)."
 *
 *  ── OLCULEN BOSLUK (kod oncesi, origin/master 9b7248b) ──────────────────
 *  `IyzicoClient.paketDegistir` TANIMLIYDI ama HICBIR YERDEN CAGRILMIYORDU.
 *  Aktif abonelikli firma yeniden satin alamiyordu (`yeniAbonelikEngelliMi`)
 *  ve hata mesaji onu "abonelik sayfasindaki yukseltme yoluna" yolluyordu —
 *  O YOL YOKTU. Basic'ten Pro'ya gecip DAHA FAZLA odemek isteyen musteri bile
 *  gecemiyordu (gelir acigi). Ustelik fatura formunu doldurup "Odemeye gec"e
 *  bastiktan SONRA reddediliyordu.
 *
 *  ── ZAMANLAMA KURALI (Emre karari) ──────────────────────────────────────
 *    · Yeni paket mevcut paketin HICBIR hakkini geri almiyorsa → HEMEN:
 *      ozellikler simdi acilir, yeni ucret DONEM SONUNDA baslar.
 *    · Herhangi bir hak kayboluyorsa (dusurme ya da mekanik↔elektrik gibi
 *      yatay gecis) → DONEM SONUNDA: ozellik de ucret de.
 *  iyzico'ya HER IKI YONDE `NEXT_PERIOD` gider. `NOW` kist hesap YAPMAZ:
 *  odenmis donem aninda kesilir, yeni plan tam ay cekilir (20.08 sandbox
 *  olcumu, docs/RAPOR_ADIM0_iyzico_Sandbox.md) — musteri iki kez oderdi.
 *
 *  ⚠ YON FIYATLA DEGIL HAKLA BELIRLENIR. Fiyat surumler arasi kayar: kur
 *  artinca yeni surumun Basic'i eski surumun Pro'sundan PAHALI olabilir.
 *  "Pahaliysa yukseltmedir" kurali o musteriden Pro ozelliklerini donem
 *  ortasinda ALIRDI. Soru "ne kaybediyor?"dur, "ne oduyor?" degil.
 *
 *  ── IYZICO KISITLARI (resmi dokuman, 23.09) ─────────────────────────────
 *  "Yeni planin AYNI URUNE ait olmasi ve odeme araliginin (paymentInterval
 *  ve paymentIntervalCount) ayni olmasi gerekir." Kurulum betigi bugune
 *  kadar HER PAKETE AYRI URUN aciyordu (`MetaPriceX ${p.ad}`) — o yapida
 *  paketler arasi gecis iyzico'da IMKANSIZ. `--tek-urun` kipi planlari tek
 *  urun altina toplar; eski yapidaki abonelik `URUN_FARKLI` ile acikca
 *  reddedilir (sessiz iyzico hatasi yerine).
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── SATIN ALMA KAPISI ────────────────────────────────────────────────────
// ⚠ satinalma.servisi.ts'ten TASINDI (oradan yeniden disa acilir). Satin
// alma kapisi ile degisim kapisi AYNI kurali okumak ZORUNDA: biri "satin
// al" derken oteki de "degistir" derse ayni firmaya iki yol birden acilir,
// ikisi de derse hicbiri. Pure modul satinalma.servisi'ni import edemezdi:
// abonelik.servisi → (bu dosya) → satinalma.servisi → abonelik.servisi
// dongusu Nest sinifini yukleme aninda `undefined` birakabilirdi.

/**
 * Bu abonelik satiri YENI bir kart aboneligini engeller mi? SAF — tek kural,
 * iki kapi: `baslat` (form acilmadan) ve `niyetiSonuclandir` (ikinci form
 * tamamlandiginda, bkz. `ikinciAbonelikMi`).
 *
 * Engellemeyenler: satir yok · miras (goc emniyeti, tahsilat degil) ·
 * SONA_ERDI · ASKIDA (geri donen musteri).
 */
export function yeniAbonelikEngelliMi(
  mevcut: {
    durum: AbonelikDurumu | string;
    paketSurumu: { paket: { kod: string } };
  } | null,
): boolean {
  return (
    !!mevcut &&
    !mirasPaketiMi(mevcut.paketSurumu.paket.kod) &&
    mevcut.durum !== AbonelikDurumu.SONA_ERDI &&
    mevcut.durum !== AbonelikDurumu.ASKIDA
  );
}

// ── HAK KARSILASTIRMASI ──────────────────────────────────────────────────

/** Paketin musteriye verdigi her sey. "Kayip var mi" bunlarin karsilastirmasidir. */
export interface PaketHaklari {
  seviye: string; // PackageLevel: core | pro
  kapsam: string; // SubscriptionScope: mechanical | electrical | mep
  kullaniciHakki: number;
  dwgAktif: boolean;
  /** null = sinirsiz. */
  aylikTeklifHakki: number | null;
}

export type HakKaybi = 'seviye' | 'kapsam' | 'kullanici' | 'dwg' | 'teklif' | 'ceviri';

// ⚠ Map, nesne DEGIL: `SIRA['constructor']` bir nesnede FONKSIYON doner ve
// "bilinmeyen seviye" dali sessizce atlanirdi (ceviri-kotasi.ts `kendiAlani`
// ile ayni gerekce).
const SEVIYE_SIRASI: ReadonlyMap<string, number> = new Map([
  ['core', 0],
  ['pro', 1],
]);
const KAPSAM_DISIPLINLERI: ReadonlyMap<string, readonly string[]> = new Map([
  ['mechanical', ['mechanical']],
  ['electrical', ['electrical']],
  ['mep', ['mechanical', 'electrical']],
]);

/**
 * Yeni paket, mevcut paketin verdigi HANGI haklari geri aliyor? Bos dizi =
 * hicbiri (yukseltme ya da denk paket).
 *
 * ⚠ BILINMEYEN DEGER KAYIP SAYILIR (fail-closed): taninmayan bir seviye ya
 * da kapsami "kayip yok" saymak, musteriden bir seyi DONEM ORTASINDA
 * alabilirdi. Kayip sayilinca en kotu ihtimalle gecis donem sonuna kalir.
 *
 * Ceviri kotasi AYRICA karsilastirilir: seviye/kapsam tablosundan turer
 * (`ceviriKotasiCoz`) ve tablo degisirse "seviye ayni ama kota dustu" hali
 * ancak boyle yakalanir.
 */
export function paketHakKayiplari(mevcut: PaketHaklari, yeni: PaketHaklari): HakKaybi[] {
  const kayip: HakKaybi[] = [];

  const sm = SEVIYE_SIRASI.get(mevcut.seviye);
  const sy = SEVIYE_SIRASI.get(yeni.seviye);
  if (sm === undefined || sy === undefined || sy < sm) kayip.push('seviye');

  const dm = KAPSAM_DISIPLINLERI.get(mevcut.kapsam);
  const dy = KAPSAM_DISIPLINLERI.get(yeni.kapsam);
  if (!dm || !dy || dm.some((d) => !dy.includes(d))) kayip.push('kapsam');

  if (yeni.kullaniciHakki < mevcut.kullaniciHakki) kayip.push('kullanici');
  if (mevcut.dwgAktif && !yeni.dwgAktif) kayip.push('dwg');

  const teklifKaybi =
    mevcut.aylikTeklifHakki === null
      ? yeni.aylikTeklifHakki !== null
      : yeni.aylikTeklifHakki !== null && yeni.aylikTeklifHakki < mevcut.aylikTeklifHakki;
  if (teklifKaybi) kayip.push('teklif');

  const km = ceviriKotasiCoz(mevcut);
  const ky = ceviriKotasiCoz(yeni);
  if (ky.satir < km.satir || ky.dosya < km.dosya) kayip.push('ceviri');

  return kayip;
}

// ── DEGISIM YOLU ─────────────────────────────────────────────────────────

// ⚠ Kod adlari `IYZICO_` ile BASLAMAZ: `test:ortam` kaynaktaki `'IYZICO_*'`
// dizgelerini ORTAM DEGISKENI sayar (iyzico anahtarlari boyle adlanir) ve
// compose/.env.example'da arar. Ilk adlar (`IYZICO_BAGI_YOK`) o kapiyi
// kirmiziya dusurdu — kural degil, ad catismasi.
export type PaketDegisimRedKodu =
  | 'AYNI_PAKET'
  | 'SATISTA_DEGIL'
  | 'HAVALE'
  | 'KART_BAGI_YOK'
  | 'ODEME_SORUNU'
  | 'IPTAL_EDILDI'
  | 'SURESI_DOLDU'
  | 'DEGISIM_BEKLIYOR'
  | 'PERIYOT_FARKLI'
  | 'URUN_FARKLI';

export type DegisimZamanlamasi = 'hemen' | 'donem-sonu';

export type PaketDegisimYolu =
  /** Aboneligi yok / miras / sona ermis / askida → normal satin alma formu. */
  | { yol: 'satin-al' }
  | { yol: 'degistir'; zamanlama: DegisimZamanlamasi; kayiplar: HakKaybi[] }
  | { yol: 'yok'; kod: PaketDegisimRedKodu; mesaj: string };

/** Kararin okudugu surum yuzeyi (Prisma `PaketSurumu` + `paket`). */
export interface DegisimSurumu {
  id: string;
  satistaMi: boolean;
  periyot: string;
  periyotAdedi: number;
  iyzicoUrunKodu: string;
  paket: PaketHaklari & { kod: string };
}

/** Kararin okudugu abonelik yuzeyi. */
export interface DegisimAboneligi {
  durum: AbonelikDurumu | string;
  odemeYontemi: OdemeYontemi | string;
  iyzicoAbonelikKodu: string | null;
  erisimSonu: Date;
  denemeSonu: Date | null;
  paketGecisTarihi: Date | null;
  paketSurumu: DegisimSurumu;
}

/**
 * Degisimin serbest oldugu durumlar. ⚠ IZIN LISTESI: yarin eklenen bir durum
 * kendiliginden AÇILMAZ.
 *   · ODEME_BEKLIYOR / KISITLI — odemesi durmus firmaya paket buyutmek,
 *     tahsil edilemeyecek bir borcu buyutmektir. Once odeme.
 *   · IPTAL — iyzico'da iptal edilmis abonelik yukseltilemez (201402).
 *   · DENEME — ACIK. ⚠ iyzico'nun deneme icindeki `NEXT_PERIOD` davranisi
 *     SANDBOX'TA OLCULMEDI (anahtar yerelde yok). Dokumanin anlami: yeni plan
 *     bir sonraki odeme doneminde (= deneme bitiminde) baslar ve ilk cekim
 *     yeni fiyattan olur. Ilk gercek ornek gunlukte izlenmeli.
 */
const DEGISTIRILEBILIR_DURUMLAR: ReadonlySet<string> = new Set([
  AbonelikDurumu.AKTIF,
  AbonelikDurumu.DENEME,
]);

/**
 * Degisim kilidinin EMNIYET suresi (gun). Kilit normalde yeni ucun ilk
 * basarili tahsilatiyla (webhook) kalkar; o webhook hic gelmezse musteri
 * sonsuza dek kilitli kalmasin diye 10 dakikalik tarama gecis tarihinden bu
 * kadar gun sonra kilidi acar. 3 gun: iyzico webhook'u ~45 dk tekrarlar,
 * cekim basarisizsa satir zaten ODEME_BEKLIYOR'a duser ve karar DURUMDAN reddeder.
 */
export const KILIT_EMNIYET_GUN = 3;

/**
 * Gecisin BEKLENEN ani (iyzico'ya sormadan once gosterilecek tarih) = bir
 * sonraki cekim.
 *
 * ⚠ DENEME TARIHE GORE okunur, DURUMA gore degil: deneme bitisi gelecekteyse
 * ilk cekim ODUR — satir etiketi AKTIF olsa bile (gece mutabakati deneme
 * satirini AKTIF'e cekebiliyor, 23.09 suphesi). `erisimSonu` denemede 2 gunluk
 * TAMPON tasir (`donemTarihleriHesapla`) ve iyzico'nun gercek anini soylemez.
 */
export function beklenenGecisTarihi(
  ab: { erisimSonu: Date; denemeSonu: Date | null },
  simdi: Date,
): Date {
  return ab.denemeSonu && ab.denemeSonu.getTime() > simdi.getTime() ? ab.denemeSonu : ab.erisimSonu;
}

function yok(kod: PaketDegisimRedKodu, mesaj: string): PaketDegisimYolu {
  return { yol: 'yok', kod, mesaj };
}

/**
 * Bu firma bu surume NASIL gecer? SAF — hem `/abonelik/paketler` (kart
 * dugmesi) hem `POST /abonelik/degistir` (uygulama) bunu okur; ekranla
 * sunucu ayri kural yazamaz.
 */
export function paketDegisimYolu(
  ab: DegisimAboneligi | null,
  yeni: DegisimSurumu,
  simdi: Date,
): PaketDegisimYolu {
  if (!yeniAbonelikEngelliMi(ab)) return { yol: 'satin-al' };
  // `yeniAbonelikEngelliMi` true ise satir VAR.
  const a = ab as DegisimAboneligi;

  if (a.paketSurumu.paket.kod === yeni.paket.kod) {
    return yok('AYNI_PAKET', 'Zaten bu paketi kullanıyorsunuz.');
  }
  if (!yeni.satistaMi) return yok('SATISTA_DEGIL', 'Bu paket şu an satışta değil.');
  if (a.odemeYontemi !== OdemeYontemi.KART) {
    return yok(
      'HAVALE',
      'Havale ile ödenen aboneliklerde paket değişikliği için bizimle iletişime geçin.',
    );
  }
  if (!a.iyzicoAbonelikKodu) {
    return yok(
      'KART_BAGI_YOK',
      'Aboneliğiniz kartla ödenen bir aboneliğe bağlı görünmüyor. Paket değişikliği için bizimle iletişime geçin.',
    );
  }
  if (!DEGISTIRILEBILIR_DURUMLAR.has(a.durum)) {
    return a.durum === AbonelikDurumu.IPTAL
      ? yok(
          'IPTAL_EDILDI',
          `Aboneliğiniz iptal edildi ve ${trTarih(a.erisimSonu)} tarihinde sona erecek. ` +
            'O tarihten sonra yeni bir paket seçebilirsiniz.',
        )
      : yok('ODEME_SORUNU', 'Paket değiştirmeden önce bekleyen ödemenizi tamamlayın.');
  }
  if (a.erisimSonu.getTime() <= simdi.getTime()) {
    return yok(
      'SURESI_DOLDU',
      'Abonelik döneminiz yenileniyor. Birkaç dakika sonra yeniden deneyin.',
    );
  }
  // ⚠ KILIT TARIH GECSE DE SURER: yeni ucun ilk tahsilati gorulmeden (webhook)
  // ikinci degisim iyzico'da BASLAMAMIS uca gidebilirdi — olculmemis yol, cift
  // cekim riski. Tarih gecmisse mesaj "odeme bekleniyor" der.
  if (a.paketGecisTarihi) {
    return yok(
      'DEGISIM_BEKLIYOR',
      a.paketGecisTarihi.getTime() > simdi.getTime()
        ? `Bu dönem için bir paket değişikliği zaten yapıldı. ${trTarih(a.paketGecisTarihi)} ` +
            'tarihinden sonra, yeni döneminizin ilk ödemesi alınınca yeniden değiştirebilirsiniz.'
        : 'Paket değişikliğiniz işleniyor: yeni döneminizin ilk ödemesi alındıktan sonra ' +
            'yeniden değiştirebilirsiniz.',
    );
  }
  if (
    yeni.periyot !== a.paketSurumu.periyot ||
    yeni.periyotAdedi !== a.paketSurumu.periyotAdedi
  ) {
    return yok(
      'PERIYOT_FARKLI',
      'Bu pakete geçiş ödeme sıklığınızla uyumlu değil. Bizimle iletişime geçin.',
    );
  }
  if (yeni.iyzicoUrunKodu !== a.paketSurumu.iyzicoUrunKodu) {
    return yok(
      'URUN_FARKLI',
      'Aboneliğiniz eski paket yapısında; bu pakete geçiş için bizimle iletişime geçin.',
    );
  }

  const kayiplar = paketHakKayiplari(a.paketSurumu.paket, yeni.paket);
  return { yol: 'degistir', zamanlama: kayiplar.length === 0 ? 'hemen' : 'donem-sonu', kayiplar };
}

// ── IYZICO YANITI ────────────────────────────────────────────────────────

/**
 * iyzico tarih alani → Date. Yanit bicimi OLCULDU: `startDate: 1789893431301`
 * (ms SAYISI, 20.08 sandbox). Dokuman ISO dize de gosterebildigi icin ikisi
 * de kabul edilir; cozulemeyen deger `null` (UYDURULMAZ).
 */
export function iyzicoTarihi(ham: unknown): Date | null {
  if (typeof ham === 'number' && Number.isFinite(ham) && ham > 0) return new Date(ham);
  if (typeof ham === 'string' && ham.trim()) {
    const sayi = Number(ham);
    const t = Number.isFinite(sayi) && /^\d+$/.test(ham.trim()) ? new Date(sayi) : new Date(ham);
    return Number.isNaN(t.getTime()) ? null : t;
  }
  return null;
}

/**
 * Kaydedilecek gecis ani: iyzico'nun bildirdigi yeni plan baslangici; yoksa
 * beklenen tarih. ⚠ iyzico'nun tarihi ONCELIKLIDIR — yeni ucretin ne zaman
 * cekilecegini o bilir; bizim `erisimSonu`muz denemede tampon tasir.
 */
export function gecisTarihiSec(
  iyzicoBaslangic: unknown,
  ab: { erisimSonu: Date; denemeSonu: Date | null },
  simdi: Date,
): Date {
  return iyzicoTarihi(iyzicoBaslangic) ?? beklenenGecisTarihi(ab, simdi);
}

// ── METIN ────────────────────────────────────────────────────────────────

/** "1649.00" → "1.649,00 TL". Para Decimal'den DIZE olarak gelir (P2 dersi). */
export function tlYaz(tutar: string): string {
  const [tam, kurus = '00'] = tutar.split('.');
  return `${binlik(Number(tam))},${kurus.padEnd(2, '0').slice(0, 2)} TL`;
}

/** Musteriye giden onay cumlesi — e-posta ve olay kaydi AYNI metni tasir. */
export function degisimCumlesi(p: {
  zamanlama: DegisimZamanlamasi;
  yeniPaketAdi: string;
  yeniTutar: string;
  gecisTarihi: Date;
}): string {
  const tarih = trTarih(p.gecisTarihi);
  const ucret = tlYaz(p.yeniTutar);
  return p.zamanlama === 'hemen'
    ? `${p.yeniPaketAdi} paketinin özellikleri hemen açıldı. Yeni aylık ücret (${ucret}, KDV dahil) ` +
        `${tarih} tarihinden itibaren kartınızdan çekilecek; bu dönem için ek ücret alınmaz.`
    : `${p.yeniPaketAdi} paketine geçişiniz ${tarih} tarihinde yapılacak. O tarihe kadar mevcut ` +
        `paketinizin özellikleri açık kalır; yeni aylık ücret (${ucret}, KDV dahil) o tarihten itibaren çekilir.`;
}
