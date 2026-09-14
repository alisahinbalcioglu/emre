/**
 * SAYI HÜCRESİ SÜZGECİ — grid hücresinden sayıya giden TEK yol.
 *
 * NEDEN AYRI (VE BAĞIMSIZ) MODÜL: bu süzgeç `ozellik/teklif/teklif-kalem.ts` içinde
 * doğmuştu ama oradan yalnız KAYIT yolu besleniyordu; EKRAN yolları
 * (ExcelGrid, fill-down, sayfaToplamlari) kendi `parseFloat(String(x)) || 0`
 * kopyalarını taşıyordu. İki okuyucu AYNI hücreden FARKLI sayı üretiyordu:
 *
 *   hücre "12,5"  → ekran 12    (parseFloat virgülü keser)
 *                 → kayıt 12,5  (bu süzgeç virgülü çözer)
 *
 * Yani Türk klavyesinde "12,5" yazan kullanıcının ekranda gördüğü kâr ile
 * veritabanına yazılan kâr farklıydı. Süzgeç tek yerde olmalı ki bu iki
 * sayı ASLA ayrışamasın; modül `teklif-kalem`den ayrıldı çünkü o modül
 * `pricing`i import ediyor ve ExcelGrid/fill-down'a taşınması gereksiz
 * bağımlılık (ve vitest'te alias'sız çözülemeyen bir zincir) yaratırdı.
 *
 * ⚠ NEGATİF KELEPÇESİ DAVRANIŞ DEĞİŞTİRMEZ — ölçüldü, varsayılmadı. Üç
 * tüketicinin ÜÇÜ de negatifi zaten sıfır gibi ele alıyordu:
 * `hesaplaSatisBirimFiyat` → `Math.max(0, karYuzde)` ·
 * `maliyetiGeriTuret` → `k <= 0 ? s` · `sayfaToplamlari` → `kar <= 0` dalı.
 * Kelepçe DTO sözleşmesini (@Min(0)) ekranda da yazılı kılar; birleştirmenin
 * TEK gerçek davranış farkı virgüllü ondalıktır.
 *
 * SÖZLEŞME: hücre NE TUTARSA TUTSUN (string, boş, virgüllü, çöp, NaN,
 * Infinity, negatif) sonuç her zaman SONLU ve NEGATİF OLMAYAN bir `number`.
 * Backend DTO'su (@IsNumber + @Min(0)) bunu zaten şart koşuyor; ekranın da
 * aynı kuralı uygulaması "ekranda gördüğün = kaydedilen" demektir.
 *
 * ⚠ `x || 0` YETMEZ: boş olmayan string truthy'dir, aynen geçer ("50" → "50").
 * ⚠ `parseFloat` tek başına yetmez: NaN ve negatif değer DTO'yu düşürür.
 */
export function sayiAlani(v: unknown): number {
  const n = sayiOku(v);
  if (n === null || n < 0) return 0;
  return n;
}

/**
 * HAM OKUMA — virgüllü ondalık çözülür, İŞARET KORUNUR, sayı değilse `null`.
 *
 * NEDEN AYRI: `sayiAlani`nın negatif kelepçesi GÖSTERİM yollarına uymaz.
 * Ekrandaki para hücresi biçimlendiricisi (`ExcelGrid` valueFormatter)
 * kendi `parseFloat(String(v))` kopyasını taşıyordu ve TR klavyede yazılan
 * "1875,5" hücrede STRING olarak durduğu için ekranda ₺1.875,00 görünüyordu —
 * oysa satır toplamı 1875,5 ile hesaplanmıştı (286 × 1875,5 = 536.393).
 * Yani kullanıcı ekranda ÇARPIMI TUTMAYAN iki sayı görüyordu: bu, süzgecin
 * doğduğu "ekran ≠ kayıt" kusurunun GÖSTERİM ikiziydi.
 *
 * Biçimlendirici `sayiAlani` kullanamaz: negatifi 0 göstermek gerçeği gizler
 * (KÂR satırı zarar da yazabilir). Bu yüzden ayrıştırma buraya çıkarıldı;
 * `sayiAlani` yalnızca KELEPÇE katmanı olarak üstünde durur. Böylece virgül
 * kuralı TEK yerde kalır ve iki okuyucu ASLA ayrışamaz.
 */
export function sayiOku(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // ── MAKINE SINIRI (A2, tur 3 — 14.09, olculdu) ──────────────────────────
  // Bu okuyucu SISTEMIN YAZDIGI degeri okur: grid hucresindeki `toFixed`/
  // `String(n)` metni, kayitli sheets JSON'u, DB sayisi, Excel SAYI hucresi.
  // Orada nokta DAIMA ondaliktir ("10.075" kat toplami, "323308.125" dosya
  // sayisi) — insan kurali ("1.250" belirsiz) buraya KONAMAZ: Bursa Mekanik
  // genel toplami 4.049.180,31 TL duser (hesap-sinirlari 12,41 bekcisi).
  //
  // ⚠ HARF KAPISI: eski hali `parseFloat` idi ve metnin basindaki rakami
  // SAYI UYDURUYORDU: "35x240mm Üç bölmeli döşeme kanalı" → 35, "24 kW" → 24,
  // "2x1,5 mm²" → 2. Bursa Elektrik'te 39 hucrede ekranda ₺550,00, kayitta
  // materialUnitPrice 550, musterinin Excel'inde 550. Harf/olcu iceren metin
  // SAYI DEGILDIR — eski kayitlarda duran hayalet de burada kapanir.
  // Virgul eski kayit uyumudur (TR klavye): "1.234,5" → 1234.5 (eskiden 1,234).
  // Ic bosluk SAYI DEGILDIR ("0505 885 15 64" birlestirilip sayi olmaz).
  const s = String(v ?? '').replace(/₺/g, '').trim();
  if (!SAF_SAYI_METNI.test(s)) return null;
  let t = s;
  if (s.includes(',')) {
    // "1,234,567" sistemin yazdigi bir bicim DEGIL — tahmin yurutulmez.
    if (s.indexOf(',') !== s.lastIndexOf(',')) return null;
    t = s.replace(/\./g, '').replace(',', '.');
  } else if (s.indexOf('.') !== s.lastIndexOf('.')) {
    t = s.replace(/\./g, ''); // "1.234.567" → binlik
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Yalniz rakam, nokta, virgul ve bastaki isaret — en az bir rakam. Harf, olcu
 *  isareti ("x", "Ø", "²"), onaltilik ("0x10") ve ustel ("1e3") yazim DISARIDA. */
const SAF_SAYI_METNI = /^[-+]?(?=[\d.,]*\d)[\d.,]+$/;

/**
 * YÜZDE HÜCRESİ (MAKİNE) — SAKLI kâr % / iskonto % değeri. `%` işareti ve kenar
 * boşlukları atılır; kalan `sayiOku` kuralıyla okunur. Okunamazsa `null`.
 *
 * ⚠ NEDEN (para doğruluğu turu, 14.09 — K5, ölçüldü): kâr ve iskonto
 * hücrelerinin ELLE YAZMA ayrıştırıcısı `parseFloat("%30")` = NaN → 0
 * yapıyordu; aynı "%30" yapıştırılınca 30 okunuyordu. Aynı metin her yolda
 * aynı sayı. A2'den (tur 3) beri kullanıcının YAZDIĞI yüzde bu fonksiyona
 * GELMEZ: `hucreGirdisiCoz`/`insanSayiOku` (insan sınırı) önce süzer, hücreye
 * sayı yazar; burası o saklı değeri (sürükle-doldur kaynağı) okur.
 */
export function yuzdeOku(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/%/g, '').trim();
  return s === '' ? null : sayiOku(s);
}

// ════════════════════════════════════════════════════════════════════════════
// İNSAN SINIRI — BELİRSİZ SAYI SÜZGECİ (A2, tur 3 — 14.09.2026, Emre onaylı)
//
// İKİ SINIR, İKİ OKUYUCU — KARIŞTIRILAMAZ:
//  · MAKİNE (`sayiOku`, yukarıda): sistemin yazdığı metin, kayıtlı JSON, DB
//    sayısı, Excel SAYI hücresi. Nokta ondalıktır.
//  · İNSAN (`insanSayiOku`, burada): klavye, pano, dosyanın METİN hücresi, form
//    kutusu. Türk kullanıcı "1.250" yazınca 1250 de 1,25 de kastedebilir —
//    SESSİZ VARSAYIM YASAK: yazılmaz, uyarılır.
//
// ÖLÇÜM (tur3/a2/RAPOR.md): aynı "1.250" bugün ÜÇ sınıftaydı — elle yazma,
// kayıt ve iskonto 1,25; teklif yapıştırma 1250; admin içe aktarma BELİRSİZ.
// Hayalet "35x240mm Üç bölmeli döşeme kanalı" elle yazma, kütüphane blok
// yapıştırma ve içe aktarmada 35 oluyordu (Bursa Elektrik: 39 hücre).
//
// KURAL (backend ikizi `backend/.../utils/import-fidelity.ts` `insanSayiOku`;
// iki uygulama `hesap-dogrulugu-test.ts` H12 paritesiyle kilitli):
//  1. Boş → boş.
//  2. `$` / `€` → SAYI DEĞİL (döviz; teklif TL tabanlı, çevrim tahmin edilmez).
//  3. Alanın İZİNLİ süsü atılır: fiyat `₺` + baştaki/sondaki TL/TRY · kâr ve
//     iskonto `%` · miktar sondaki birim kelimesi (K2) ve fitting oranı `%`.
//  4. Kalan metin yalnız rakam/nokta/virgül/baştaki işaret değilse → SAYI DEĞİL
//     ("35x240mm", "Ø100", "DN50", "24 kW", "2x1,5 mm²", "1 250", "abc").
//  5. Virgül + nokta birlikte: SON ayırıcı ondalık ("1.234,5" · "1,234.5").
//  6. Yalnız virgül: tek → ondalık ("12,5"); birden çok → EN binlik ("1,234,567").
//  7. Yalnız nokta: birden çok → binlik ("1.234.567"); tek + noktadan sonra TAM
//     3 hane → BELİRSİZ ("1.250", "10.075"; K1); diğer tek nokta ondalık ("12.5").
// ════════════════════════════════════════════════════════════════════════════

/** Sayının girildiği alan — izinli süs (₺ / % / birim) ve uyarı metni buna bağlı. */
export type SayiAlanTuru = 'miktar' | 'fiyat' | 'kar' | 'iskonto';

/** İnsan girdisinin SINIFI. Yalnız `sayi` hücreye yazılır. */
export type SayiGirdisi =
  | { tur: 'sayi'; deger: number }
  | { tur: 'bos' }
  | { tur: 'belirsiz'; ham: string; binlik: number; ondalik: number }
  | { tur: 'sayi-degil'; ham: string; sebep: 'olcu-metin' | 'doviz' };

/**
 * K1 — EMRE KARARI BEKLİYOR. Virgülsüz, tek noktalı, noktadan sonra tam 3 hane
 * ve TAM KISMI 4+ HANE ("25430.000"). TR binlik gruplaması bu yazımı üretemez
 * (grup en çok 3 hane) — yani aslında tek anlamlıdır. VARSAYILAN BELİRSİZ:
 * admin içe aktarmanın `parseTrNumber`ı ve admin testi F1 böyle sayıyor; iki
 * yol ayrışmasın. `false` → ondalık okunur (backend ikizindeki sabit de değişir).
 */
export const K1_UZUN_TAM_KISIM_BELIRSIZ = true;

/**
 * K2 — EMRE KARARI BEKLİYOR. MİKTAR alanında sayıdan sonra gelebilen birim
 * kelimeleri: "12 m", "3 adet", "12,5 mt." sayı okunur. Liste DIŞI her ek
 * ("24 kW", "550 kVA", "2x1,5 mm²", "Ø100") sayı DEĞİLDİR — ölçü metni miktar
 * uydurmaz. Fiyat/kâr/iskonto alanlarında birim KABUL EDİLMEZ.
 * Listenin iş emrinden genişlemesi ÖLÇÜLDÜ (20 fixture `_birim` dağılımı,
 * tur3/a2/uygulama/birim-olc.out.txt): "grup" 20, "l" 4, "litre" 3 satır; birim
 * sonundaki nokta ("ad." 633, "mt." 95, "tk." 7, "kg." 5) de kabul edilir.
 * "ton": içe aktarmanın birim sözlüğünde zaten var (excel-grid.service `UNIT_VOCAB`).
 */
export const MIKTAR_BIRIMLERI: readonly string[] = [
  'adet', 'ad', 'm', 'mt', 'mtr', 'metre', 'm2', 'm²', 'm3', 'm³', 'kg', 'gr', 'ton', 'lt', 'l', 'litre',
  'set', 'takım', 'tk', 'paket', 'pk', 'boy', 'çift', 'kutu', 'rulo', 'top', 'grup',
];
/** Birim karşılaştırması: TR küçültme + ı/i katlama ("LITRE", "TAKIM") + sondaki nokta. */
const birimAnahtari = (b: string): string => b.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/\.$/, '');
const MIKTAR_BIRIM_KUMESI = new Set(MIKTAR_BIRIMLERI.map(birimAnahtari));

/** Alanın izinli süsünü atar (kural 3). Dönen metin kırpılmıştır. */
function alanSusunuAt(s: string, alan: SayiAlanTuru): string {
  if (alan === 'kar' || alan === 'iskonto') return s.replace(/%/g, '').trim();
  if (alan === 'fiyat') {
    return s.replace(/₺/g, ' ').trim()
      .replace(/^(?:tl|try)(?=[\s\d+.,-])/i, '')
      .replace(/^(.*[\d\s.,])(?:tl|try)$/i, '$1')
      .trim();
  }
  // miktar: fitting oranı "%35" ve sondaki birim ("12 m", "3 adet", "12,5 mt.")
  const t = s.replace(/%/g, '').trim();
  const m = /^(.*\d)\s*([^\d\s.,+-]\S*)$/.exec(t);
  if (m && MIKTAR_BIRIM_KUMESI.has(birimAnahtari(m[2]))) return m[1].trim();
  return t;
}

/** Kural 7 — tek nokta + tam 3 hane belirsiz mi? Tam kısım boşsa (".250") değil
 *  (`parseTrNumber` ile aynı); 4+ haneyse K1 karar verir. */
function ucHaneBelirsizMi(tamKisim: string): boolean {
  if (tamKisim.length === 0) return false;
  return tamKisim.replace(/^[-+]/, '').length >= 4 ? K1_UZUN_TAM_KISIM_BELIRSIZ : true;
}

/**
 * İNSAN SINIRI OKUYUCUSU — klavye, pano, dosyanın METİN hücresi, form kutusu.
 * `number` tipi (Excel SAYI hücresi, kayıtlı sayı) doğrudan sayıdır.
 */
export function insanSayiOku(v: unknown, alan: SayiAlanTuru): SayiGirdisi {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? { tur: 'sayi', deger: v } : { tur: 'sayi-degil', ham: String(v), sebep: 'olcu-metin' };
  }
  if (v === null || v === undefined) return { tur: 'bos' };
  const ham = String(v);
  if (ham.trim() === '') return { tur: 'bos' };
  if (/[$€]/.test(ham)) return { tur: 'sayi-degil', ham, sebep: 'doviz' };
  const t = alanSusunuAt(ham.trim(), alan);
  // Kural 4 — HARF KAPISI. İç boşluk da sayı değildir: "1 250" ve boşluklu
  // telefon numarası ("0505 885 15 64") sessizce birleştirilip sayı olmaz.
  if (!SAF_SAYI_METNI.test(t)) return { tur: 'sayi-degil', ham, sebep: 'olcu-metin' };
  const nokta = t.includes('.');
  const virgul = t.includes(',');
  let n: number;
  if (nokta && virgul) {
    // Kural 5 — son ayırıcı ondalık, diğeri binlik.
    const ondalik = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    n = parseFloat(t.split(ondalik === ',' ? '.' : ',').join('').replace(ondalik, '.'));
  } else if (virgul) {
    // Kural 6 — tek virgül ondalık; birden çok virgül EN binlik.
    const parca = t.split(',');
    n = parseFloat(parca.length > 2 ? parca.join('') : t.replace(',', '.'));
  } else if (nokta) {
    // Kural 7 — birden çok nokta binlik; tek nokta + tam 3 hane BELİRSİZ.
    const parca = t.split('.');
    if (parca.length > 2) {
      n = parseFloat(parca.join(''));
    } else if (parca[1].length === 3 && ucHaneBelirsizMi(parca[0])) {
      return { tur: 'belirsiz', ham, binlik: parseFloat(parca.join('')), ondalik: parseFloat(t) };
    } else {
      n = parseFloat(t);
    }
  } else {
    n = parseFloat(t);
  }
  return Number.isFinite(n) ? { tur: 'sayi', deger: n } : { tur: 'sayi-degil', ham, sebep: 'olcu-metin' };
}

const ALAN_ADI: Record<SayiAlanTuru, string> = { miktar: 'Miktar', fiyat: 'Fiyat', kar: 'Kâr %', iskonto: 'İskonto %' };
const kisalt = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 40 ? `${t.slice(0, 39)}…` : t;
};
const trOndalik = (n: number): string => String(n).replace('.', ',');

/** TEK UYARI METNİ — toast, hücre ipucu ve form kutusu aynı cümleyi gösterir.
 *  `sayi`/`bos` için `null` (uyarılacak bir şey yok). */
export function sayiUyarisi(r: SayiGirdisi, alan: SayiAlanTuru): string | null {
  if (r.tur === 'belirsiz') {
    const bin = r.binlik.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `“${kisalt(r.ham)}” belirsiz — ${String(r.binlik)} mi, ${trOndalik(r.ondalik)} mi? `
      + `Binlik için ${String(r.binlik)} ya da ${bin}, ondalık için ${trOndalik(r.ondalik)} yazın.`;
  }
  if (r.tur === 'sayi-degil') {
    if (r.sebep === 'doviz') return `“${kisalt(r.ham)}” dövizli — ${ALAN_ADI[alan]} TL tabanlıdır, TL karşılığını yazın.`;
    return `“${kisalt(r.ham)}” sayı değil — ${ALAN_ADI[alan]} hücresine yalnız sayı yazılır${alan === 'miktar' ? ' (birim ayrı sütunda)' : ''}.`;
  }
  return null;
}

/**
 * MAKİNE METNİ — sistemin hücreye YAZDIĞI sayı metni. `String(n)`; YALNIZ
 * noktadan sonra tam 3 hane kalan değer virgülle yazılır ("10,075").
 *
 * NEDEN: bu metin sonra İNSAN kuralıyla da okunabilir (admin içe aktarma satırı
 * geri gönderir, kopya panoya gider, dosya hücresi metne döner). "10.075" insan
 * kuralında BELİRSİZ'dir; "10,075" iki kuralda da 10,075'tir. `String(n)`in
 * başka hiçbir biçimi insan kuralında farklı okunmaz (tam sayı, 1-2 ya da 4+
 * ondalık) — kapsam bilerek bu tek desen. Backend ikizi: import-fidelity.ts.
 */
export function makineMetni(n: number): string {
  const s = String(n);
  return /^-?\d+\.\d{3}$/.test(s) ? s.replace('.', ',') : s;
}

/**
 * GÖRÜNEN/KOPYALANAN METİN — miktar ve kâr hücresinin `valueFormatter`ı.
 * Saklı makine değeri TR ondalığıyla, BİNLİK GRUPLAMASIZ gösterilir:
 * "12.375" → "12,375", 1250 → "1250". Sayı değilse (fitting "%35", eski metin)
 * olduğu gibi.
 *
 * NEDEN (E, tur3/a2 — ölçüldü): kopya AG Grid'in biçimlendiricisinden okunur ve
 * miktar hücresinin biçimlendiricisi YOKTU — pano ham "12.375" alıyor, yapıştırma
 * onu 12375 okuyordu (1000 kat). İnsan kuralı gelince aynı metin BELİRSİZ olurdu.
 * Gruplama da yasak: "1.250" kopyası yine belirsiz olurdu.
 */
export function hucreGosterimMetni(v: unknown): string {
  const n = sayiOku(v);
  return n === null ? String(v ?? '') : String(n).replace('.', ',');
}

/** AG Grid `valueParser` çekirdeğinin sonucu. */
export interface HucreGirdiSonucu {
  /** Hücreye yazılacak değer; reddedilen girdide ESKİ değer (AG Grid değişiklik saymaz). */
  deger: unknown;
  /** Reddedilen girdinin uyarısı (düzenleme bitince bir kez gösterilir). */
  uyari: string | null;
}

/**
 * HÜCRE GİRDİSİ (İNSAN SINIRI) — ExcelGrid miktar / fiyat / kâr / iskonto
 * kolonlarının `valueParser`ı buradan geçer (DOM'suz, vitest ile ölçülür).
 *
 *  · K4 — EMRE KARARI BEKLİYOR: F2 editörü HAM makine metniyle açılır ("12.375").
 *    Metin DEĞİŞMEDİYSE insan girdisi yoktur → değer aynen kalır, uyarı YOK.
 *    Kullanıcı "12.376" yazarsa BELİRSİZ uyarısı çıkar (editör TR biçimiyle
 *    açılsın mı kararı Emre'de).
 *  · K3 — EMRE KARARI BEKLİYOR: kâr/iskonto boş → 0 (bugünkü gibi); "abc"
 *    REDDEDİLİR (eskiden 0 yazılıp var olan iskontoyu eziyordu).
 *  · Miktar/fiyat boş → '' (Delete tuşu ayrıştırıcıyı '' ile çağırır).
 *  · Belirsiz / sayı değil → ESKİ değer + uyarı.
 */
export function hucreGirdisiCoz(yeni: unknown, eski: unknown, alan: SayiAlanTuru): HucreGirdiSonucu {
  if (String(yeni ?? '') === String(eski ?? '')) return { deger: eski, uyari: null };
  const r = insanSayiOku(yeni, alan);
  if (r.tur === 'bos') return { deger: alan === 'kar' || alan === 'iskonto' ? 0 : '', uyari: null };
  if (r.tur !== 'sayi') return { deger: eski, uyari: sayiUyarisi(r, alan) };
  if (alan === 'kar') return { deger: Math.max(0, r.deger), uyari: null };
  if (alan === 'iskonto') return { deger: Math.min(100, Math.max(0, r.deger)), uyari: null };
  // FITTING ORANI (02.09): miktar hücresine "%35" — "%" NİYET taşır, ExcelGrid
  // fitting dalı ham metne bağlı; sayı geçerliyse metin OLDUĞU GİBİ kalır.
  if (alan === 'miktar' && String(yeni).includes('%')) return { deger: yeni, uyari: null };
  return { deger: makineMetni(r.deger), uyari: null };
}

/** FORM KUTUSU (insan sınırı): boş → `deger: null` (çağıran karar verir),
 *  sayı → değer, belirsiz / sayı değil → `uyari` (işlem yapılmaz). */
export function formSayisiOku(metin: unknown, alan: SayiAlanTuru): { deger: number | null; uyari: string | null } {
  const r = insanSayiOku(metin, alan);
  if (r.tur === 'sayi') return { deger: r.deger, uyari: null };
  return { deger: null, uyari: sayiUyarisi(r, alan) };
}

/** İÇE AKTARMA İŞARETİ — backend `_sayiUyari: {alan: {ham, tur}}` satır alanının
 *  hücre ipucu metni. Sınıf aynı kuralla YENİDEN hesaplanır (tek cümle kaynağı). */
export function kayitliSayiUyarisi(u: unknown, alan: SayiAlanTuru): string | null {
  if (!u || typeof u !== 'object') return null;
  const ham = String((u as { ham?: unknown }).ham ?? '');
  return sayiUyarisi(insanSayiOku(ham, alan), alan) ?? `“${kisalt(ham)}” dosyada sayı olarak okunamadı`;
}
