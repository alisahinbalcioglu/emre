/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MİRAS HAKKI — SAF KURALLAR, TEK YER (26.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre kararı (24.09): "miras hakkı AYRI taşınsın (paket + bitiş), kart
 *  erişimi bitince miras paketine düşsün" — iyzico canlıya geçmeden.
 *
 *  01.09 göçü her mevcut firmaya `miras-core`/`miras-pro` satırı yazdı
 *  (HAVALE, AKTIF, erişim göç + 365 gün). Miras tarihi `erisimSonu` içinde
 *  "ödenmiş erişim" gibi taşınıyordu (kod okundu, 24-26.09):
 *   · GELİR — kart satın alma `max(mevcut, köprü)` miras tarihini korudu ve
 *     iptal `erisimSonu`na dokunmaz: miras-core firma 1 ay Pro öder, iptal
 *     eder, Pro'yu miras bitişine kadar kullanır. Havale onayı tabanı
 *     `max(erisimSonu, şimdi)`: 1 aylık Pro havalesi Pro'yu 340 + 30 gün verdi
 *     (fatura dönemi de).
 *   · MÜŞTERİ — mutabakat İPTAL dalı `erisimSonu = endDate` yazıyordu (değer
 *     varsa); dunning kısıt/askı basamakları miras hakkını görmüyordu: kart
 *     düşen miras firma miras dönemini de kaybediyordu.
 *
 *  MODEL:
 *   · Satır MİRAS PAKETİNDEYKEN (`mirastaMi`) tek otorite `erisimSonu`dur;
 *     `mirasPaketSurumuId`/`mirasErisimSonu` o sırada yalnız kayıttır (göç
 *     doldurması). İki tarihi eşitlemek gerekmez — senkron YOK.
 *   · Satır mirastan başka pakete geçerken ödenen dönem BUGÜN başlar
 *     (`mirastanCikisMi`) ve hak YAKALANIR (`mirasiAyir`): o anki miras paketi
 *     + iki bitişin büyüğü (yönetici "miras yenilemesi" — havale teklifi satış
 *     dışı miras sürümüyle, 25.09'dan beri serbest — kaybolmasın).
 *   · Ücretli dönem bitince satır miras paketine DÖNER (`donemSonuKarari` →
 *     `mirasaDonusVerisi`). Geçit: `AbonelikServisi.durumDegistir(SONA_ERDI)`
 *     + `AbonelikServisi.mirasaDon` (dunning ve 10 dakikalık dönüş işi).
 *
 *  ⚠ Prisma/Nest BİLMEZ (tip bile import edilmez): servis, satın alma,
 *  havale, dunning, erişim ve dönüş işi import eder — döngü doğmaz.
 *  Kapı: `test:miras-hakki`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { mirasPaketiMi } from './deneme-hakki';

/**
 * Tarihin ms değeri; tarih yoksa/bozuksa `NaN` (`NaN > x` her zaman yanlış →
 * "geçerli değil"). ⚠ `instanceof Date` KULLANILMAZ: başka bir `Date`
 * yapıcısıyla (saat sabitleyen test sarmalı, farklı realm) üretilmiş tarih
 * `instanceof` sınavını geçemez ve hak sessizce "yok" sayılırdı — ölçüldü
 * (26.09, `test:miras-hakki` ilk yeşil koşusu). Kalıp `denemeSuruyorMu` ile aynı.
 */
function zaman(d: Date | null | undefined): number {
  const t = d?.getTime?.();
  return typeof t === 'number' ? t : NaN;
}

/** Kuralların okuduğu satır alanları (Prisma `Abonelik` satırının alt kümesi). */
export interface MirasSatiri {
  paketSurumuId: string;
  erisimSonu: Date;
  mirasPaketSurumuId?: string | null;
  mirasErisimSonu?: Date | null;
  /**
   * Etkin paketin kodu: göç paketi `miras-` önekinden tanınır (doldurma
   * almamış satırda da). Verilmezse yalnız sürüm eşitliğine bakılır.
   */
  paketSurumu?: { paket?: { kod?: string | null } | null } | null;
}

/**
 * Satır şu an miras (göç) paketinde mi? Önek (`miras-`) YA DA yakalanmış
 * miras sürümüyle eşitlik — dönüşten sonra satır yine mirastadır.
 */
export function mirastaMi(ab: MirasSatiri): boolean {
  if (mirasPaketiMi(ab.paketSurumu?.paket?.kod)) return true;
  return !!ab.mirasPaketSurumuId && ab.paketSurumuId === ab.mirasPaketSurumuId;
}

/**
 * Ücretli pakette AYRI taşınan ve hâlâ geçerli bir miras hakkı var mı — yani
 * ücretli dönem bitince dönülecek bir paket var mı? Satır zaten mirastaysa
 * `false` (erişimi zaten miras). Sınır: bitiş = şimdi GEÇERSİZ (`>`).
 */
export function mirasGecerliMi(ab: MirasSatiri, simdi: Date): boolean {
  if (mirastaMi(ab)) return false;
  return !!ab.mirasPaketSurumuId && zaman(ab.mirasErisimSonu) > zaman(simdi);
}

/** Geçilecek paket. `mirasPaketi` = hedef de bir göç (`miras-`) sürümü mü. */
export interface HedefPaket {
  paketSurumuId: string;
  mirasPaketi: boolean;
}

/**
 * Hedef pakete geçiş mirastan ÇIKIŞ mı? Öyleyse ödenen dönem BUGÜN başlar ve
 * hak `mirasiAyir` ile yakalanır. Miras sürümüne geçiş ("miras yenilemesi")
 * ve aynı paketin uzatılması çıkış DEĞİLDİR.
 */
export function mirastanCikisMi(ab: MirasSatiri, hedef: HedefPaket): boolean {
  return mirastaMi(ab) && !hedef.mirasPaketi && hedef.paketSurumuId !== ab.paketSurumuId;
}

/**
 * Satır mirastan çıkarken hakkı YAKALAR: o anki miras paketi + kayıtlı
 * bitişle `erisimSonu`nun büyüğü. Satır mirasta değilse alanlar AYNEN döner
 * (zaten yakalanmış hak ezilmez).
 */
export function mirasiAyir(ab: MirasSatiri): {
  mirasPaketSurumuId: string | null;
  mirasErisimSonu: Date | null;
} {
  if (!mirastaMi(ab)) {
    return {
      mirasPaketSurumuId: ab.mirasPaketSurumuId ?? null,
      mirasErisimSonu: ab.mirasErisimSonu ?? null,
    };
  }
  const kayitli = Number.isFinite(zaman(ab.mirasErisimSonu)) ? ab.mirasErisimSonu! : null;
  const bitis = kayitli && zaman(kayitli) > zaman(ab.erisimSonu) ? kayitli : ab.erisimSonu;
  return { mirasPaketSurumuId: ab.paketSurumuId, mirasErisimSonu: bitis };
}

/**
 * Havale uzatmasının TABANI (ödenen dönemin başladığı an). Mirastan çıkışta
 * BUGÜN — miras tarihi ödenmiş erişim DEĞİLDİR; aksi hâlde bugünkü kural:
 * erişim sürüyorsa bitişinden, bitmişse bugünden.
 * Ücretli satırdan miras sürümüne ("miras yenilemesi", yönetici teklifi):
 * yakalanmış hak KAYBOLMAZ — taban iki bitişin büyüğü. Aksi hâlde satır miras
 * paketine geçer (`mirastaMi` önekten evet), `mirasErisimSonu` bir daha
 * okunmaz ve ödeyen müşteri hakkını kaybederdi (26.09 kod incelemesi O2).
 */
export function odenenDonemTabani(ab: MirasSatiri, hedef: HedefPaket | null, simdi: Date): Date {
  if (hedef && mirastanCikisMi(ab, hedef)) return simdi;
  const hakBitisi = hedef?.mirasPaketi && mirasGecerliMi(ab, simdi) ? zaman(ab.mirasErisimSonu) : NaN;
  const bitis = hakBitisi > zaman(ab.erisimSonu) ? ab.mirasErisimSonu! : ab.erisimSonu;
  return zaman(bitis) > zaman(simdi) ? bitis : simdi;
}

/** Ödeme sorunlu durumlar: ücretli dönem fiilen bitmiştir (tahsilat alınamadı). */
const ODEME_SORUNLU: readonly string[] = ['ODEME_BEKLIYOR', 'KISITLI', 'ASKIDA'];

export type DonemSonuKarari = 'SONA_ERDI' | 'MIRAS' | 'BEKLE';

/**
 * Satır SONA_ERDI'ye gitmek istediğinde (ya da dunning/dönüş işi sorduğunda)
 * TAZE okunmuş satırla karar. Önce dönem: GERÇEKTEN bitti mi (`erisimSonu ≤
 * şimdi`, ödeme sorunlu durum ya da iyzico EXPIRED dedi)?
 *   · bitmedi → `BEKLE` — hak olsun olmasın: istek BAYAT (aday okumasından
 *     sonra ödeme, satın alma ya da MİRASA DÖNÜŞ geldi). Mirasa dönmüş satır
 *     mirastadır ve hak "geçerli" sayılmaz; önce hak sorulsaydı saatlik işin
 *     bayat adayı onu SONA_ERDI yapardı (26.09 kod incelemesi Y1);
 *   · bitti + hak geçerli → `MIRAS`;
 *   · bitti + hak yok / dolmuş / satır zaten mirasta → `SONA_ERDI` (bugünkü
 *     davranış AYNEN).
 */
export function donemSonuKarari(
  ab: MirasSatiri & { durum: string },
  simdi: Date,
  p: { iyzicoBitti?: boolean } = {},
): DonemSonuKarari {
  const bitti = zaman(ab.erisimSonu) <= zaman(simdi) || ODEME_SORUNLU.includes(ab.durum) || p.iyzicoBitti === true;
  if (!bitti) return 'BEKLE';
  return mirasGecerliMi(ab, simdi) ? 'MIRAS' : 'SONA_ERDI';
}

/**
 * Mirasa dönüşte yazılan alanların TAMAMI. Yazılmayanlar BİLEREK korunur:
 * iyzico kodları ve `iyzicoDurum` (geç gelen çekim HAVALE satırının "çift
 * tahsilat — iade" dalına düşsün), `iptalTalebi`/`iptalNedeni` (kart
 * kapalılık kuralı `kartAboneligiKapaliMi` ona bakar — silinirse kapalı karta
 * ikinci iptal gider, 201403 ile düşer), miras alanları (satır artık
 * mirasta: tek otorite `erisimSonu`). Alan envanteri: `test:miras-hakki` S.
 */
export function mirasaDonusVerisi(ab: MirasSatiri) {
  if (!ab.mirasPaketSurumuId || !ab.mirasErisimSonu || !Number.isFinite(zaman(ab.mirasErisimSonu))) {
    throw new Error('Miras hakkı yok — mirasa dönüş verisi üretilemez');
  }
  return {
    paketSurumuId: ab.mirasPaketSurumuId,
    durum: 'AKTIF' as const,
    odemeYontemi: 'HAVALE' as const,
    erisimSonu: ab.mirasErisimSonu,
    kopruErisimSonu: null,
    denemeSonu: null,
    ilkBasarisizlik: null,
    denemeSayisi: 0,
    sonDeneme: null,
    kisitlandi: null,
    tahsilatKirasi: null,
    planliPaketSurumuId: null,
    paketGecisTarihi: null,
    odenenPaketSurumuId: null,
  };
}

/**
 * Hesap kapatma / yönetici silme: miras hakkı BİTER (Emre, 26.09). Ücretli
 * pakette taşınan hak bugüne çekilir; satır mirastaysa miras erişimi de
 * bugün biter (kapatılmış firmada AKTIF miras satırı doğmasın, 30 günde
 * satın almayla dönen firma mirası geri almasın). Ücretli dönem KORUNUR.
 */
export function mirasiBitirVerisi(ab: MirasSatiri, simdi: Date): { mirasErisimSonu?: Date; erisimSonu?: Date } {
  const veri: { mirasErisimSonu?: Date; erisimSonu?: Date } = {};
  if (zaman(ab.mirasErisimSonu) > zaman(simdi)) veri.mirasErisimSonu = simdi;
  if (mirastaMi(ab) && zaman(ab.erisimSonu) > zaman(simdi)) veri.erisimSonu = simdi;
  return veri;
}
