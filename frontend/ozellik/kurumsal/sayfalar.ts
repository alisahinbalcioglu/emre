import { SATICI } from '../hukuki/metinler';

/**
 * KURUMSAL SAYFALAR — `/hakkimizda` ve `/iletisim` (21.09.2026, iyzico t.21).
 *
 * ⚠ NEDEN AYRI LİSTE, `HUKUKI_SAYFALAR`A EKLENMİYOR: o liste hukuki metinlerin
 * (`HukukiMetin`) listesidir; taslak şeridi, metin sürümü ve avukat onayı ona
 * bağlıdır. Bu iki sayfa hukuki metin DEĞİL. Aynı listeye konsaydı altbilgideki
 * "hukuki" kümesi tanımını, `satici-metin.test.ts`in "liste dört metindir"
 * ölçütünü ve `HukukiSayfa` kabuğunun şerit kuralını birden bozardı.
 *
 * ⚠ ALTBİLGİ BAĞLANTILARI BU LİSTEDEN TÜRER — elle yazılmış `<Link>` YOK.
 * Deponun kuralı (`Altbilgi.tsx`): tıklanınca hiçbir şey yapmayan bağlantı,
 * var olmayan bir şey vaat eder. Sayfa silinirse bağlantı da düşsün diye liste
 * sayfanın KENDİ kaynağıdır: rota dosyası başlığını da buradan okur.
 * ⚠ Yorumda `app/` + yıldız + `/page.tsx` YAZMAYIN: içindeki yıldız-eğik çift
 * bu blok yorumu ERKEN KAPATIR ve dosya ayrıştırılamaz (21.09'da bir kez oldu).
 */
export interface KurumsalSayfa {
  /** Rota. `app/<yol>/page.tsx` GERÇEKTEN var olmalı (kurumsal-sayfalar.test.ts ölçer). */
  yol: string;
  /** Altbilgideki bağlantı metni. */
  kisaAd: string;
  /** Sayfanın H1'i. */
  baslik: string;
  /** Tarayıcı sekmesi / arama sonucu başlığı. */
  sayfaBasligi: string;
}

export const HAKKIMIZDA: KurumsalSayfa = {
  yol: '/hakkimizda',
  kisaAd: 'Hakkımızda',
  baslik: 'Hakkımızda',
  sayfaBasligi: 'Hakkımızda — MetaPriceX',
};

export const ILETISIM: KurumsalSayfa = {
  yol: '/iletisim',
  kisaAd: 'İletişim',
  baslik: 'İletişim',
  sayfaBasligi: 'İletişim — MetaPriceX',
};

export const KURUMSAL_SAYFALAR: KurumsalSayfa[] = [HAKKIMIZDA, ILETISIM];

/**
 * Ticaret unvanının şirket türü eki atılmış hâli: metin içinde firmadan
 * "LİNTU MÜHENDİSLİK LİMİTED ŞİRKETİ, mekanik tesisat ile…" diye söz etmek
 * cümleyi resmî evrak diline çevirirdi.
 *
 * ⚠ KISALTMA TÜRETİLİR, DÜZ YAZILMAZ: kısa ad metne elle yazılsaydı unvan
 * değiştiğinde (tür değişikliği, unvan tadili) metin sessizce eski firmadan
 * söz etmeye devam ederdi — bu dosyanın bağlı olduğu `SATICI` sabiti tam bu
 * hata için var.
 * ⚠ `i` BAYRAĞI YOK: JS büyük/küçük harf eşlemesi Türkçe değildir ("İ" ↔ "i"
 * çifti yanlış eşleşir). Ek tanınmazsa tam unvan basılır — uzun ama DOĞRU
 * bir cümle kalır, yanlış bir cümle değil.
 */
const SIRKET_TURU_EKI = /\s+(LİMİTED ŞİRKETİ|ANONİM ŞİRKETİ|LTD\. ŞTİ\.|A\.Ş\.)$/;

export function kisaUnvan(unvan: string): string {
  return unvan.replace(SIRKET_TURU_EKI, '').trim();
}

/**
 * Merkez adresinin son parçası = il ("… Maltepe/İstanbul" → "İstanbul").
 * Ayrı bir `il` alanı AÇILMADI: aynı bilginin iki alanda durması, birinin
 * güncellenip ötekinin geride kalması demektir (bkz. `ticaretSicilNo` kararı).
 * Ayıraç yoksa adresin tamamı döner — uydurma bir şehir adı basılmaz.
 */
export function merkezIl(adres: string): string {
  const son = adres.split('/').pop()?.trim();
  return son ? son : adres.trim();
}

/**
 * HAKKIMIZDA METNİ — gövde BİREBİR iş emrinden (21.09.2026).
 *
 * ⚠ SAYI, YIL, MÜŞTERİ ya da PROJE ADEDİ YOK ve EKLENMEZ. Hiçbiri
 * doğrulanmış değil; doğrulanmamış bir rakam, ödeme sağlayıcısının
 * inceleyicisine karşı bir tanıtım sayfasının yapabileceği en kötü şeydir.
 *
 * ⚠ "Yazılım tahmin etmez" bölümündeki ÜÇ DAVRANIŞ ÖLÇÜLDÜ (21.09), anasayfa
 * vaatleriyle birebir tutarlı olduğu için yazıldı — tersi çıksaydı metin değil
 * ANASAYFA yanlış olurdu:
 *   1. "çap tahmin etmez" → `dwg-engine/python/main.py:610` diameter=""
 *      (motorda çapa değer yazan TEK yer); `proximity_diameter.py` SİLİNDİ;
 *      `use_proximity_diameter` / `layer_default_diameter` parametreleri
 *      denetleyiciden ve servisten kaldırıldı.
 *   2. "birden fazla aday → seçmez, sorar" → `fiyat/matching/index/
 *      outcome-mapper.ts:290` çoklu dal `netPrice: 0` + `confidence: 'multi'`
 *      + `candidates`; BAĞLANTI: `quotes/new/page.tsx:2185` alanı taşıyor,
 *      `excel-grid/ExcelGrid.tsx:820` "🟡 Seçim gerekli (N aday)" kutusunu açıyor.
 *   3. "bulamadığını işaretler" → `excel-grid/isaret.ts` (kırmızı hücre +
 *      "N satır seçim bekliyor") ve `teklif/fiyatsiz-kalem-uyarisi.ts`
 *      (fiyatsız kalemle kayıt BLOKLANIR, bilgilendirilmiş onay istenir).
 */
export const HAKKIMIZDA_METNI = {
  girisParagraflari: [
    'MetaPriceX, teklif hazırlayan bir mühendislik firmasının kendi ihtiyacından doğdu.',
    `${kisaUnvan(SATICI.unvan)}, mekanik tesisat ile yangın algılama ve söndürme sistemleri alanında çalışır. Bu işte her teklif aynı yoldan geçer: projeden metraj çıkarılır, keşif cetveli satır satır okunur, her kalem bir marka fiyat listesinde aranır, iskonto uygulanır, kâr eklenir. İşin özü mühendisliktir; ama zamanın büyük kısmı hesap tablolarında geçer. Üstelik bir teklifteki tek bir yanlış çap, bütün işin kârını götürebilir.`,
    'MetaPriceX bu yolu kısaltmak için yazıldı. DWG projelerindeki hat boylarını katman ve koordinat üzerinden ölçer. Çok sayfalı Excel keşiflerini tek seferde, hiçbir sekmeyi atlamadan okur. Kalemleri firmanızın kendi fiyat listeleri ve iskontolarıyla eşleştirir. TCMB kurunu ve İngilizce çıktıyı teklife işler.',
  ],
  ilkeBasligi: 'Yazılım tahmin etmez',
  ilkeParagraflari: [
    'Tasarımın merkezinde tek bir ilke var. Çapı siz atarsınız, sistem çap tahmin etmez. Bir kalem için birden fazla fiyat adayı çıkarsa sistem seçmez, size sorar. Bulamadığı kalemi işaretler, sessizce geçmez. Hız, doğruluktan ödün verilerek kazanılmaz: teklifin altına imzanızı atıyorsanız, içindeki her rakamın nereden geldiğini bilmeniz gerekir.',
    'Sahadan gelen bir yazılım olarak, onu da sahadaki titizlikle kuruyoruz. Hesap kuralları testlerle kilitlenir; her sürüm yayına çıkmadan doğrulanır.',
  ],
  /** İmza satırı: TAM unvan + merkez ili. İkisi de `SATICI`dan. */
  imza: `${SATICI.unvan} · ${merkezIl(SATICI.adres)}`,
};
