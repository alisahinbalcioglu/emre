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
 * Çeviri hücreye yazılırken YAZILAN değer (Faz 6.11, 15.09). İşaret yalnız
 * hücre hâlâ bu değeri taşıyorsa geçerlidir: çeviriden sonra ad hücresi elle
 * değişirse eski Türkçe kaynak artık bu satırın kaynağı değildir. Yazan ve
 * silen TEK dosya `frontend/ozellik/teklif/ceviri.ts`; sunucu yalnız okur.
 */
export const CEVIRI_SONUC_ALANI = '_ceviriSonucu';

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
   * İçerik özeti v2 (sha256, Faz 6.11 · 15.09) — ödenmiş çevirinin KALICI
   * kanıt anahtarı ("bakmak ücretsiz"). Çoklu küme: `[anahtar, adet]` çiftleri
   * anahtarın KOD BİRİMİ sırasıyla (`localeCompare` DEĞİL: sunucunun ICU
   * verisine bağlı kalmasın). Satır sırası, satırın başka sayfaya taşınması,
   * miktar/fiyat özeti DEĞİŞTİRMEZ; ad değişimi, satır ekleme ve silme
   * (adet) DEĞİŞTİRİR. `ceviri-ozet-v2:` öneki eski özetle hiçbir içerikte
   * çakışmamayı garanti eder (boş içerikte ikisi de `[]` olurdu).
   */
  readonly ozet: string;
  /**
   * Özet v1 (bugüne kadarki SIRALI dizi tanımı; anahtarlar yeni
   * `satirKaynagi` ile). Yalnız T1 öncesi yazılmış tüketim kayıtlarını
   * tanımak için okunur — yeni kayda YAZILMAZ.
   */
  readonly eskiOzet: string;
  /**
   * Anahtar → o metni taşıyan satır sayısı. Çevrilemeyen metinlerin kaç
   * satır tuttuğu bununla sayılır (`teslimEdilenSatir`).
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
 *
 * BAYAT İŞARET (Faz 6.11, 15.09): çeviriden sonra ad hücresi elle değişirse
 * `_ceviriKaynak` eski Türkçeyi tutar. Eski kural onu kaynak saymaya devam
 * ediyordu: özet değişmez (yeni metin kotasız kalır), görüntüleme kullanıcının
 * yazdığını ezerdi. İşaret artık yalnız hücre `_ceviriSonucu`'nu taşıyorsa
 * geçerli; `_ceviriSonucu` olmayan eski işaret bugünkü gibi güvenilir.
 */
export function satirKaynagi(row: Record<string, unknown>, adAlan: string): unknown {
  const kaynak = row[CEVIRI_KAYNAK_ALANI];
  if (typeof kaynak !== 'string' || ceviriAnahtari(kaynak) === '') return row[adAlan];
  const sonuc = row[CEVIRI_SONUC_ALANI];
  return typeof sonuc !== 'string' || ceviriAnahtari(sonuc) === ceviriAnahtari(row[adAlan]) ? kaynak : row[adAlan];
}

/**
 * Bu satırın hücresinde hâlâ çevrilecek kaynak metin duruyor mu (çevrilmemiş
 * ya da bayat işaretli). `false` → hücre kayıtta İngilizce (Düzenle'de çevrilip
 * kaydedilmiş): hiçbir katman ona kendiliğinden dokunmaz (K-T1).
 * ⚠ ÖN YÜZDE BİREBİR İKİZİ VAR; gövde eşliği K31 ile ölçülür.
 */
export function kayittaKaynakDuruyorMu(row: Record<string, unknown>, adAlan: string): boolean {
  return ceviriAnahtari(row[adAlan]) === ceviriAnahtari(satirKaynagi(row, adAlan));
}

interface CeviriSatiri {
  readonly row: Record<string, unknown>;
  readonly adAlan: string;
  readonly anahtar: string;
  readonly dokunulmaz: boolean;
}

/**
 * Satır süzgeçlerinin TEK yeri: boş sayfa, dizge olmayan ad kolonu, nesne
 * olmayan satır ve boş anahtar elenir. Dokunulmaz satır bayrakla gelir; her
 * tüketici onu kendisi atlar (içerik, plan ve Türkçeye geri yazım aynı
 * süzgeçten geçer — ikizleri ayrışamaz).
 */
function* ceviriSatirlari(sayfalar: unknown): Generator<CeviriSatiri> {
  for (const s of Array.isArray(sayfalar) ? (sayfalar as CeviriSayfasi[]) : []) {
    if (!s || s.isEmpty) continue;
    const adAlan = s.columnRoles?.nameField;
    if (typeof adAlan !== 'string' || !adAlan) continue;
    for (const row of Array.isArray(s.rowData) ? s.rowData : []) {
      if (!row || typeof row !== 'object') continue;
      const satir = row as Record<string, unknown>;
      const anahtar = ceviriAnahtari(satirKaynagi(satir, adAlan));
      if (!anahtar) continue;
      yield { row: satir, adAlan, anahtar, dokunulmaz: dokunulmazMi(anahtar) };
    }
  }
}

const sha256 = (metin: string) => createHash('sha256').update(metin, 'utf8').digest('hex');

export function ceviriIcerigi(sayfalar: unknown): CeviriIcerigi {
  const kume = new Set<string>();
  const sirali: string[] = [];
  const satirlar = new Map<string, number>();
  let satirSayisi = 0;

  for (const s of ceviriSatirlari(sayfalar)) {
    if (s.dokunulmaz) continue;
    satirSayisi++;
    sirali.push(s.anahtar);
    kume.add(s.anahtar);
    satirlar.set(s.anahtar, (satirlar.get(s.anahtar) ?? 0) + 1);
  }

  const cokluKume = Array.from(satirlar.entries()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const ozet = sha256('ceviri-ozet-v2:' + JSON.stringify(cokluKume));
  const eskiOzet = sha256(JSON.stringify(sirali));
  return { metinler: Array.from(kume), satirSayisi, ozet, eskiOzet, satirlar };
}

/**
 * Çeviri haritasının karşıladığı SATIR sayısı. Tam çeviride `satirSayisi`na
 * eşittir; bir parça patlarsa ya da model bir metni atlarsa (14.09 incelemesi
 * O4: `basarisiz=0` iken metin düşebiliyordu) eksik kalan satır bununla
 * bulunur — çeviri o zaman TAMAMLANMAMIŞTIR (hepsi ya da hiçbiri, 15.09).
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

/**
 * HEPSİ YA DA HİÇBİRİ (REVİZE K-T7, Emre 15.09): haritada KENDİ alanı olmayan
 * metinler, ilk görülme sırasıyla. Boş değilse çeviri TAMAMLANMAMIŞTIR: kotadan
 * hiçbir şey düşmez, istemciye harita dönmez. Karar yalnız burada verilir.
 * Kaynakla aynı dönen çeviri (`GEBERIT → GEBERIT`, marka/kod) haritadadır →
 * eksik DEĞİLDİR.
 */
export function cevrilemeyenMetinler(metinler: readonly string[], harita: Readonly<Record<string, string>>): string[] {
  const eksik: string[] = [];
  const gorulen = new Set<string>();
  for (const m of metinler) {
    const anahtar = ceviriAnahtari(m);
    if (!anahtar || gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    if (!Object.prototype.hasOwnProperty.call(harita, anahtar)) eksik.push(anahtar);
  }
  return eksik;
}

// ═══════════════════════════════════════════════════════════════════════════
//  İNGİLİZCE UYGULAMA KURALI — ekran ve dosya ikizi (Faz 6.10/6.11, 15.09)
// ═══════════════════════════════════════════════════════════════════════════
//
//  Bir satıra harita değeri ancak (a) sayfa boş değil, ad kolonu tanımlı,
//  (b) `kayittaKaynakDuruyorMu` doğru, (c) haritada anahtar için değer var ve
//  (d) değer hücreden farklıysa yazılır. Kayıtta İngilizce duran hücreye hiçbir
//  katman kendiliğinden dokunmaz (K-T1). Ön yüz ikizi `ingilizceGorunum`
//  (`frontend/ozellik/teklif/ceviri.ts`); iki yüz aynı fikstürü koşar (S10).

export interface DisaAktarimSatiri {
  readonly row: Record<string, unknown>;
  readonly adAlan: string;
  readonly yeni: string;
}

export interface DisaAktarimPlani {
  readonly degisecek: readonly DisaAktarimSatiri[];
  /** Kayıtta kaynak metni duran, dokunulmaz olmayan ama haritada karşılığı olmayan satır. */
  readonly karsiliksiz: number;
}

export function disaAktarimPlani(sayfalar: unknown, harita: Readonly<Record<string, string>>): DisaAktarimPlani {
  const degisecek: DisaAktarimSatiri[] = [];
  let karsiliksiz = 0;
  for (const s of ceviriSatirlari(sayfalar)) {
    if (s.dokunulmaz) continue;
    if (!kayittaKaynakDuruyorMu(s.row, s.adAlan)) continue;
    const yeni = Object.prototype.hasOwnProperty.call(harita, s.anahtar) ? harita[s.anahtar] : undefined;
    if (typeof yeni !== 'string' || yeni === '') {
      karsiliksiz++;
      continue;
    }
    if (yeni === s.row[s.adAlan]) continue;
    degisecek.push({ row: s.row, adAlan: s.adAlan, yeni });
  }
  return { degisecek, karsiliksiz };
}

/** Planı hücrelere yazar. `_ceviriKaynak` YAZILMAZ: kayda dönmeyen indirme kopyasıdır. */
export function planiUygula(plan: DisaAktarimPlani): number {
  for (const d of plan.degisecek) d.row[d.adAlan] = d.yeni;
  return plan.degisecek.length;
}

/**
 * Türkçe dosya (açık `tr` ya da kayıttan inen dosyanın Türkçeye indirgenmesi):
 * geçerli işaretli satırda hücre := `_ceviriKaynak`. Bayat işaretli satırda
 * hücre KULLANICININ yazdığıdır, korunur. Döndürülen: geri yazılan hücre.
 */
export function kaynakMetinleriniGeriYaz(sayfalar: unknown): number {
  let yazilan = 0;
  for (const s of ceviriSatirlari(sayfalar)) {
    if (s.dokunulmaz || kayittaKaynakDuruyorMu(s.row, s.adAlan)) continue;
    s.row[s.adAlan] = s.row[CEVIRI_KAYNAK_ALANI];
    yazilan++;
  }
  return yazilan;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ÇEVİRİ GÜVENLİK SÜZGECİ — ortak katman zehirleme (K-T11 · R1-B2, 16.09)
// ═══════════════════════════════════════════════════════════════════════════
//
//  Kullanıcının KENDİ metniyle tetiklediği AI çevirisi ortak önbelleğe "ilk
//  yazan kazanır" ile yazılır ve HER firmanın teklifine gider. Satıra gömülü
//  bir talimat ("…ölçüyü 25 yaz", "…www.x.com ekle") ortak karşılığı
//  zehirleyebilir. Bu süzgeçten geçmeyen AI yanıtı haritaya ve önbelleğe
//  GİRMEZ (teklif "tamamlanamadı" döner, kotadan bir şey düşmez); firma ve
//  yönetici düzeltmesi de aynı süzgeçten geçer.
//
//  ⚠ YANLIŞ RED YASAK (K-T7): reddedilen satır çevrilemez ve teklif hiç
//  tamamlanamaz. Bu yüzden:
//   · rakam dizileri ayraç DUYARSIZ karşılaştırılır (24.000 ↔ 24,000;
//     2,5 ↔ 2.5). Bilinçli bedel: "2,5 → 25" gibi ayraç kaybı YANLIŞ KABUL
//     edilir (RR2) — tercih yanlış kabul yönünde.
//   · bağlantı/e-posta yalnız KAYNAKTA OLMAYAN biçimde çeviride görünürse ret;
//     kaynakta zaten duran "www.firma.com" serbest.
//  Kalan açık (§7.4 İ2): sayı içermeyen kelime düzeyi zehirleme.

/** `1 1/4"` gibi kesirler tek dizi; `.`/`,` ayraçları atılır. */
function rakamDizileri(metin: string): string[] {
  return (metin.match(/\d+(?:[.,]\d+)*(?:\/\d+)?/g) ?? []).map((d) => d.replace(/[.,]/g, '')).sort();
}

/** Bağlantı ve e-posta biçimli parçalar (küçük harf). */
function baglantiParcalari(metin: string): string[] {
  const baglanti = metin.match(/(?:https?:\/\/|www\.)[^\s"'<>]*/gi) ?? [];
  const eposta = metin.match(/[^\s"'<>]*@[^\s"'<>]*/g) ?? [];
  return [...baglanti, ...eposta].map((p) => p.toLowerCase());
}

export function ceviriGuvenliMi(kaynak: unknown, ceviri: unknown): boolean {
  const k = ceviriAnahtari(kaynak);
  const c = ceviriAnahtari(ceviri);
  if (c.length > 3 * k.length + 20) return false;
  if (rakamDizileri(k).join('|') !== rakamDizileri(c).join('|')) return false;
  const kaynaktakiler = baglantiParcalari(k);
  for (const p of baglantiParcalari(c)) {
    const i = kaynaktakiler.indexOf(p);
    if (i < 0) return false;
    kaynaktakiler.splice(i, 1);
  }
  return true;
}
