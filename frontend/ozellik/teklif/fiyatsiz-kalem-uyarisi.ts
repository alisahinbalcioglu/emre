/**
 * FİYATSIZ KALEM UYARISI — kaydetmeden önceki bilgilendirilmiş onay.
 *
 * VAKA (PANOVA, 12.08.2026): DWG'de çapı okunamayan borular "Belirtilmemis"
 * adıyla TEK satırda toplanıp teklife giriyor — 3.123,64 m, birim fiyat boş,
 * tutar 0 ₺. `handleSave` yalnız ADI BOŞ satırı eliyordu; adı olan ama fiyatı
 * olmayan satır sessizce kaydediliyordu. Kullanıcı teklifi müşteriye
 * gönderene kadar 3 km borunun bedelsiz gittiğini görmüyordu.
 *
 * KARAR (kullanıcı, 12.08): BLOKLAMA — kaydetmeden önce SÖYLE. Kullanıcı
 * bilerek fiyatsız kaydedebilir (henüz fiyat almadığı kalemler olur); ama
 * bunu bilerek yapmalı. Aynı desen çizim tarafında zaten var:
 * `DwgProjectWorkspace.handleConfirmAll` çapsız segment için onay soruyor.
 * Bu, o uyarının KAYIT ANI ikizi — çizimde uyarı görülmemiş ya da kalem
 * Excel yolundan gelmiş olabilir.
 *
 * ── ÖLÇÜT NEDEN PAYLOAD ÜZERİNDE (proxy değil) ─────────────────────────
 * Uyarı, grid satırına DEĞİL, backend'e GİDECEK kalemlere bakar. Ekranda
 * ne göründüğü değil, teklife ne yazılacağı sorulur: satır süzgeçleri
 * (grup bandı, spare satır, adsız satır) çoktan uygulanmış olur ve
 * "fiyatsız" kararı hücre metni tahmin edilerek değil, `kalemUret`in
 * ürettiği gerçek sayılardan verilir.
 *
 * ⚠ ÇAP DEĞİL FİYAT sayılır: "çapsız" bu sorunun EN SIK sebebi, tek sebebi
 * değil. Markası eşleşmemiş, kütüphanede bulunamamış ya da kullanıcının
 * henüz doldurmadığı her satır aynı sonucu doğurur (teklifte 0 ₺). Ölçüt
 * sebebe değil SONUCA bakar — örneğe özel kural yazılmaz.
 */
import type { TeklifKalemi } from './teklif-kalem';

/** Uyarı için gereken en dar kalem yüzeyi (test edilebilirlik). */
export type UyariKalemi = Pick<
  TeklifKalemi,
  'materialName' | 'unit' | 'quantity' | 'unitPrice' | 'materialUnitPrice' | 'laborUnitPrice'
> & { materialTotalPrice?: number; laborTotalPrice?: number };

export interface FiyatsizOrnek {
  ad: string;
  miktar: number;
  birim: string;
}

export interface FiyatsizOzet {
  /** Fiyatsız kalem sayısı. */
  adet: number;
  /** Kaydedilecek TOPLAM kalem sayısı (payda — "3/1474" mü "3/3" mü). */
  toplamKalem: number;
  /** Birim bazlı miktar toplamları, büyükten küçüğe. Miktarı 0 olan birim
   *  listelenmez (mesajda "0 m" görmek bilgi taşımaz). */
  birimToplamlari: Array<{ birim: string; miktar: number }>;
  /** Mesajda adıyla anılacak en büyük kalemler (en fazla 3). */
  ornekler: FiyatsizOrnek[];
}

/** Bu kalem teklife 0 ₺ ile mi girecek?
 *
 *  Dört para sinyalinin (birim + toplam, malzeme + işçilik) HEPSİ sıfırsa
 *  evet. Tek biri bile doluysa kalem fiyatlıdır — yalnız işçiliği olan
 *  kalem (montaj bedeli) fiyatsız SAYILMAZ.
 *
 *  ⚠ `!(x > 0)` bilerek: NaN de fiyatsız sayılır (`x === 0` NaN'ı kaçırır). */
/**
 * Bu GRID SATIRI uyarıya girer mi?
 *
 * ⚠ İCMAL (`_ozet`) SATIRLARI GİRMEZ. Çok sayfalı keşif dosyalarında backend
 * "İcmal" sayfasını özet sayar (`standart-sema.ts`: miktar/birim kaynak kolonu
 * yok) ve satırlarını `_isDataRow=true` + `_ozet=true` yapar; para YALNIZ genel
 * toplam hücresinde durur, birim/tutar alanları boş kalır. ExcelGrid bu
 * satırlarda marka/firma açılırını çizmez, yerine gri "özet" yazar — yani ürün
 * kullanıcıya "burası fiyatlandırılamaz" der. Uyarı onları fiyatsız sayarsa,
 * TAM DOĞRU fiyatlanmış bir teklifte, kullanıcının düzeltmesi İMKÂNSIZ olan
 * satırlar için alarm çalar (ölçüldü: YILDIZ İcmal, 9 satır).
 *
 * Aynı dışlama `pricing.ts:318`'de zaten var (30.07 çift-sayım yasağı) —
 * kural TEK, burada tekrar edilmiyor, aynı bayrağa bakılıyor.
 */
export function uyariyaGirerMi(satir: { _ozet?: boolean } | null | undefined): boolean {
  return !satir?._ozet;
}

export function kalemFiyatsizMi(k: UyariKalemi): boolean {
  const para =
    (k.unitPrice ?? 0) +
    (k.materialUnitPrice ?? 0) +
    (k.laborUnitPrice ?? 0) +
    (k.materialTotalPrice ?? 0) +
    (k.laborTotalPrice ?? 0);
  return !(para > 0);
}

const birimAdi = (k: UyariKalemi): string => String(k.unit ?? '').trim() || 'adet';
const miktarSayi = (k: UyariKalemi): number =>
  Number.isFinite(k.quantity) && k.quantity > 0 ? k.quantity : 0;

/**
 * Kaydedilecek kalemlerin fiyatsız özeti. Fiyatsız kalem yoksa `null` —
 * çağıran hiçbir şey sormaz (uyarı, olmadığında GÖRÜNMEZ olmalı).
 */
export function fiyatsizKalemOzeti(kalemler: UyariKalemi[]): FiyatsizOzet | null {
  const fiyatsiz = kalemler.filter(kalemFiyatsizMi);
  if (fiyatsiz.length === 0) return null;

  const birimler = new Map<string, number>();
  for (const k of fiyatsiz) {
    const b = birimAdi(k);
    birimler.set(b, (birimler.get(b) ?? 0) + miktarSayi(k));
  }

  return {
    adet: fiyatsiz.length,
    toplamKalem: kalemler.length,
    // NOT: `Array.from` — tsconfig hedefi ES5 tarafında; Map iterator'ının
    // spread'i `--downlevelIteration` istiyor (tsc TS2802).
    birimToplamlari: Array.from(birimler.entries())
      .map(([birim, miktar]) => ({ birim, miktar }))
      .filter((b) => b.miktar > 0)
      .sort((a, b) => b.miktar - a.miktar),
    ornekler: [...fiyatsiz]
      .sort((a, b) => miktarSayi(b) - miktarSayi(a))
      .slice(0, 3)
      .map((k) => ({ ad: k.materialName, miktar: miktarSayi(k), birim: birimAdi(k) })),
  };
}

/** TR biçimi, en fazla 2 hane (3123.6449 → "3.123,64"). */
const bicim = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

export interface FiyatsizOnayMetni {
  title: string;
  description: string;
  confirmText: string;
}

/**
 * Onay kartının metni. Ayrı fonksiyon: cümle jsdom'suz test edilebilsin ve
 * "ne fazla korkutur ne az söyler" kuralı ölçülebilsin (bkz.
 * `lib/silme-onay-metni.ts` — aynı desen).
 */
export function fiyatsizOnayMetni(o: FiyatsizOzet): FiyatsizOnayMetni {
  const miktar = o.birimToplamlari.map((b) => `${bicim(b.miktar)} ${b.birim}`).join(' + ');
  const ornek = o.ornekler
    .map((e) => (e.miktar > 0 ? `${e.ad} (${bicim(e.miktar)} ${e.birim})` : e.ad))
    .join(', ');
  const kalan = o.adet - o.ornekler.length;

  return {
    // PAYDA GÖRÜNÜR: "2 kalem" ile "2/5" farklı şeyler söyler — ikincisi
    // kullanıcıya sorunun büyüklüğünü verir. `toplamKalem` daha önce
    // hesaplanıp testleniyor ama cümlede HİÇ kullanılmıyordu (tutulmayan vaat).
    title: `${o.adet}/${o.toplamKalem} kalem fiyatsız — teklifte 0 ₺ görünecek`,
    description:
      (miktar ? `Toplam ${miktar}. ` : '')
      + (ornek ? `${ornek}${kalan > 0 ? ` ve ${kalan} kalem daha` : ''}. ` : '')
      + 'Bu kalemlerin birim fiyatı boş — çapı okunamayan borular ve markası '
      + 'eşleşmeyen satırlar buraya düşer. Yine de kaydedilsin mi?',
    confirmText: 'Yine de kaydet',
  };
}
