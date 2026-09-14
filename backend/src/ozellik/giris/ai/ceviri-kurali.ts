import { createHash } from 'crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ÇEVİRİ KURALI — hangi satır çevrilir, kaç satır sayılır (Faz 6.2, 14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  TEK YER. Çeviriye giden metinler ve kotadan düşen satır sayısı AYNI
 *  fonksiyondan (`ceviriIcerigi`) AYNI geçişte çıkar. İki ayrı uygulama er geç
 *  ayrışır: kullanıcı 500 satır için ücretlendirilip 480 satırı çevrilir ya da
 *  tersi. Burada bu yapısal olarak imkânsız.
 *
 *  ── NEDEN SUNUCUDA, NEDEN ÖN YÜZDE DEĞİL ──
 *  13.08'den 14.09'a kadar bu kural `frontend/ozellik/teklif/ceviri.ts`'teydi
 *  ve sunucuya yalnız benzersizleştirilmiş metin listesi gidiyordu. Kota için
 *  bu şekil kullanılamaz: istemcinin gönderdiği sayıya ya da listeye güvenmek
 *  kotayı tarayıcı konsoluna emanet etmektir. Artık istemci yalnız HANGİ
 *  TEKLİF olduğunu söyler; sunucu kayıtlı `Quote.sheets`'i okuyup kararı kendi
 *  verir. Ön yüz ve arka yüzün Docker derleme bağlamları ayrı (./frontend,
 *  ./backend) — kural iki pakette tek dosya olarak paylaşılamazdı; ikiz
 *  tutmak yerine ön yüzden KALDIRILDI.
 *
 *  ── "SATIR" TANIMI (karar 13.09, tanım a) ──
 *  Çevrilecek metin içeren satır: ad kolonunda (nameField) ölçü ya da koddan
 *  ibaret OLMAYAN metin taşıyan her satır. Şartname ve açıklama satırları
 *  dâhildir — çünkü müşteriye giden metindir ve çeviriye gider. Ölçülen bir
 *  dosya bu tanımla 1.766, yalnız veri satırlarıyla 527 satırdı.
 *
 *  ── DOKUNULMAZLAR (13.08'den beri testle mühürlü, birebir taşındı) ──
 *  Motor "yardımcı olup" ölçüyü bozabilir: "DN 20" → "DN 20 (nominal
 *  diameter)". Bunların hepsi eşleştirme anahtarıdır; bozulursa fiyat eşleşmesi
 *  ve müşteriye giden teklif birlikte bozulur. Bu yüzden tanım "çevrilecekler"
 *  değil, DOKUNULMAZLAR üzerinden yapılır.
 */

/** Çevrilmiş satırda Türkçe asıl metnin durduğu alan (ön yüz `ceviriUygula` yazar). */
export const CEVIRI_KAYNAK_ALANI = '_ceviriKaynak';

/**
 * Hücreden çeviri anahtarına giden TEK normalizasyon. Önbellek anahtarı da
 * bu — yoksa "PVC BORU" ile "PVC BORU " ayrı satır olur. Ön yüzdeki
 * `ceviriAnahtari` ile BİREBİR aynı olmak zorunda: harita bu anahtarla döner
 * ve istemci satırlara bu anahtarla uygular (`test:ceviri-kota` eşliği ölçer).
 */
export function ceviriAnahtari(metin: unknown): string {
  return String(metin ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Metinden ÖLÇÜ SÖZ DAĞARINI soyar. Geriye anlamlı harf kalmıyorsa metin bir
 * ölçü/koddur, cümle değildir.
 *
 * ⚠ SINIR (`\b`) TEK BAŞINA YETMEZ: "DN20" ve "9MM" gibi boşluksuz hâllerde
 * harf ile rakam arasında kelime sınırı OLUŞMAZ; desenler bu yüzden
 * rakam-farkındalı (`(?=\s*\d)` / `(?<=\d)`).
 * ⚠ Ø ve φ açıkça listeli: Ø Unicode'da HARFTİR; soyulmazsa "Ø110 x Ø90" iki
 * harf sayılır ve çeviriye sızar.
 */
function olcuyuSoy(ham: string): string {
  return ham
    .replace(/\bdn\b|dn(?=\s*\d)/gi, ' ')
    .replace(/\bpn\b|pn(?=\s*\d)/gi, ' ')
    .replace(/\bnb\b|nb(?=\s*\d)/gi, ' ')
    .replace(/(?<=\d)\s*(?:mm|cm|mt)\b/gi, ' ')
    .replace(/\b(?:mm|cm|mt|m)\b/gi, ' ')
    .replace(/(?<=\d)\s*[x×]\s*(?=\d)/gi, ' ')
    .replace(/[øφ"'/½¼¾⅜⅝⅞]/gi, ' ')
    .replace(/[\d.,\-–—]/g, ' ');
}

/**
 * Metin çevrilmemeli mi? KURAL: ölçü söz dağarı ve sayılar çıkarıldığında
 * geriye EN AZ İKİ harf kalmıyorsa metin bir ölçü/koddur.
 *   "DN 20", "Ø110", "6\"", "25", "9MM"      → dokunulmaz
 *   "PVC BORU", "9MM ALUMİNYUM FOLYO"         → çevrilir
 */
export function dokunulmazMi(metin: unknown): boolean {
  const ham = String(metin ?? '').trim();
  if (!ham) return true;
  const harfler = olcuyuSoy(ham).replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
  return harfler.length < 2;
}

/** Kural için gereken sayfa kesiti — `Quote.sheets` elemanının alt kümesi. */
export interface CeviriSayfasi {
  isEmpty?: boolean;
  rowData?: unknown[];
  columnRoles?: { nameField?: unknown } | null;
}

export interface CeviriIcerigi {
  /** API'ye gidecek benzersiz metinler — ilk görülme sırasıyla. */
  readonly metinler: string[];
  /** Kotadan düşecek satır sayısı: çevrilecek metin içeren satır. */
  readonly satirSayisi: number;
  /**
   * İçerik özeti (sha256). Aynı teklifin DEĞİŞMEMİŞ içeriği için aynı değer —
   * tekrar koruması bununla "aynı çeviri mi" diye bakar. Yalnız çeviriyi
   * belirleyen şeyi kapsar: satır sırasıyla kaynak metinler. Miktar ya da
   * fiyat değişikliği özeti DEĞİŞTİRMEZ (çıktı birebir aynı olurdu).
   */
  readonly ozet: string;
  /**
   * Anahtar → o metni taşıyan satır sayısı. Kısmen tamamlanan çeviride
   * "kaç satır TESLİM edildi" bununla sayılır (`teslimEdilenSatir`).
   * ⚠ `Map`: düz nesnede "constructor" gibi bir metin prototipten değer okurdu.
   */
  readonly satirlar: ReadonlyMap<string, number>;
}

/**
 * Satırın ÇEVİRİ KAYNAĞI: çevrilmiş satırda Türkçe asıl (`_ceviriKaynak`),
 * değilse ad hücresi. Kaydedilmiş İngilizce bir teklif yeniden çevrilirken
 * İngilizce metin değil Türkçe asıl sayılır ve çevrilir.
 *
 * ⚠ ÖN YÜZDE BİREBİR İKİZİ VAR (`frontend/ozellik/teklif/ceviri.ts`) ve gövde
 * eşliği testle ölçülür: harita burada bu anahtarla kurulur, ekranda bu
 * anahtarla uygulanır. 14.09 incelemesi: `_ceviriKaynak` teklif kaydında
 * istemcinin yazabildiği bir alan. Boş dizge "kaynak" sayılsaydı o satır
 * sayılmaz, ekran ise adına bakıp çevirirdi — kotasız teslim. Boş kaynak ada
 * düşer; iki taraf aynı anahtarı kullandığı için ekranın yazdığı her satır
 * sunucunun saydığı bir satırdır.
 */
export function satirKaynagi(row: Record<string, unknown>, adAlan: string): unknown {
  const kaynak = row[CEVIRI_KAYNAK_ALANI];
  return typeof kaynak === 'string' && ceviriAnahtari(kaynak) !== '' ? kaynak : row[adAlan];
}

export function ceviriIcerigi(sayfalar: unknown): CeviriIcerigi {
  const kume = new Set<string>();
  const sirali: string[] = [];
  const satirlar = new Map<string, number>();
  let satirSayisi = 0;

  for (const s of Array.isArray(sayfalar) ? (sayfalar as CeviriSayfasi[]) : []) {
    if (!s || s.isEmpty) continue;
    const adAlan = s.columnRoles?.nameField;
    if (typeof adAlan !== 'string' || !adAlan) continue;
    for (const row of Array.isArray(s.rowData) ? s.rowData : []) {
      if (!row || typeof row !== 'object') continue;
      const anahtar = ceviriAnahtari(satirKaynagi(row as Record<string, unknown>, adAlan));
      if (!anahtar || dokunulmazMi(anahtar)) continue;
      satirSayisi++;
      sirali.push(anahtar);
      kume.add(anahtar);
      satirlar.set(anahtar, (satirlar.get(anahtar) ?? 0) + 1);
    }
  }

  const ozet = createHash('sha256').update(JSON.stringify(sirali), 'utf8').digest('hex');
  return { metinler: Array.from(kume), satirSayisi, ozet, satirlar };
}

/**
 * Çeviri haritasının karşıladığı SATIR sayısı — kotadan düşen satırın temeli.
 * Tam çeviride `satirSayisi`na eşittir; bir parça patlarsa ya da model bir
 * metni atlarsa (14.09 incelemesi O4: `basarisiz=0` iken metin düşebiliyordu)
 * yalnız gerçekten teslim edilen satırlar sayılır.
 */
export function teslimEdilenSatir(
  icerik: Pick<CeviriIcerigi, 'satirlar'>,
  harita: Readonly<Record<string, string>>,
): number {
  let toplam = 0;
  for (const [anahtar, adet] of icerik.satirlar) {
    if (Object.prototype.hasOwnProperty.call(harita, anahtar)) toplam += adet;
  }
  return toplam;
}
