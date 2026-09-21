/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KVKK m.11 — "VERİLERİMİ İNDİR" TEK YERDE (Plan 5.8 §4.5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠⚠ ÖLÇÜLMÜŞ KUSUR — DÜZ BAĞLANTI ÇALIŞMIYORDU (21.09.2026):
 *  `app/(protected)/koltuk-durduruldu/page.tsx:77` bu düğmeyi
 *  `<a href="/api/auth/hesabim/verilerim">` olarak yazıyordu. İki bağımsız
 *  sebeple hiçbir zaman çalışmadı:
 *
 *    1. `next.config.js`te `/api` için REWRITE YOK (yalnız
 *       `env.NEXT_PUBLIC_API_URL` var). Adres Next sunucusuna gider,
 *       backend'e HİÇ ulaşmaz.
 *    2. Düz bir `<a>` `Authorization: Bearer …` başlığı TAŞIMAZ; token
 *       `localStorage`tadır. Rewrite olsaydı bile 401 alırdı.
 *
 *  Yani kişi sınırı aşıldığı için durdurulmuş kullanıcı, uçtaki KVKK
 *  muafiyeti doğru kurulmuşken (`auth.controller.ts`: ödeme ve koltuk kapısı
 *  YOK) verisini yine de indiremiyordu. Kırık olan ön yüzdü.
 *
 *  ⚠ TEK YER: koltuk durdurma ve hesap kapalı ekranlarının İKİSİ de bunu
 *  çağırır. İkisi kendi gövdesini yazsaydı biri gün gelir yine `<a href>`e
 *  dönerdi. Kaynak kapısı: `verileri-indir.test.ts`.
 *
 *  ⚠ `api` TEPEDEN DEĞİL, İÇERİDEN import edilir (`await import`). Sebep
 *  ölçüldü: vitest `@/…` takma adını çözmüyor (alias yalnız Next/tsconfig
 *  tarafında) ve tepeden import bu dosyayı test edilemez yapardı. Depoda
 *  kullanılan desen (`app/(protected)/layout.tsx:38`). Gövde böylece
 *  MEKANİZMASIYLA (uç adresi · dosya adı · Blob türü · `revokeObjectURL`)
 *  sınanabiliyor.
 */

/** Uçtan veriyi çeken parça. Testte yerine sahte konur. */
export type VeriGetirici = () => Promise<unknown>;

/** `verileriIndir`in dokunduğu tarayıcı yüzeyi — testte sahtelenir. */
export type IndirmeOrtami = {
  getir?: VeriGetirici;
  olustur: (tur: string) => { href: string; download: string; click: () => void };
  ekle: (dugum: unknown) => void;
  cikar: (dugum: unknown) => void;
  blobAdresi: (govde: string, tur: string) => string;
  adresiBirak: (url: string) => void;
};

/** KVKK dışa aktarım ucu. TEK yerde yazılı. */
export const VERILERIM_UCU = '/auth/hesabim/verilerim';

/** İndirilen dosyanın adı: `metapricex-verilerim-YYYY-AA-GG.json`. SAF. */
export function verilerimDosyaAdi(simdi: Date = new Date()): string {
  const iki = (n: number) => String(n).padStart(2, '0');
  const g = `${simdi.getFullYear()}-${iki(simdi.getMonth() + 1)}-${iki(simdi.getDate())}`;
  return `metapricex-verilerim-${g}.json`;
}

async function varsayilanGetirici(): Promise<unknown> {
  const api = (await import('@/ortak/lib/api')).default;
  const { data } = await api.get(VERILERIM_UCU);
  return data;
}

function tarayiciOrtami(): IndirmeOrtami {
  return {
    olustur: (tur) => document.createElement(tur) as unknown as ReturnType<IndirmeOrtami['olustur']>,
    ekle: (d) => document.body.appendChild(d as Node),
    cikar: (d) => document.body.removeChild(d as Node),
    blobAdresi: (govde, tur) => URL.createObjectURL(new Blob([govde], { type: tur })),
    adresiBirak: (url) => URL.revokeObjectURL(url),
  };
}

/**
 * Kullanıcının kendi verisini JSON olarak indirir.
 *
 * @returns başarılıysa `true`; çağıran ekran hata mesajını kendi bağlamına
 *          göre gösterir (toast metni ekranın işi, indirme bu dosyanın işi).
 */
export async function verileriIndir(ortam?: Partial<IndirmeOrtami>): Promise<boolean> {
  const o: IndirmeOrtami = { ...tarayiciOrtami(), ...ortam };
  try {
    const veri = await (o.getir ?? varsayilanGetirici)();
    const url = o.blobAdresi(JSON.stringify(veri, null, 2), 'application/json');
    const bag = o.olustur('a');
    bag.href = url;
    bag.download = verilerimDosyaAdi();
    o.ekle(bag);
    bag.click();
    o.cikar(bag);
    // ⚠ Serbest bırakılmazsa Blob sekme kapanana kadar bellekte kalır.
    o.adresiBirak(url);
    return true;
  } catch {
    // ⚠ SESSİZ DEĞİL: `false` dönülür ve çağıran ekran kullanıcıya söyler.
    // Sessizce yutulsaydı düğme "bir şey yapmıyor" görünürdü — bu dosyanın
    // var oluş sebebi olan kusurun aynısı.
    return false;
  }
}
