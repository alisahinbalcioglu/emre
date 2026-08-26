// ════════════════════════════════════════════════════════════════════
// SORGU MOTORU (v2) — Ad kilitli SERT FILTRE ZINCIRI
//
// Bu motorda SKOR YOKTUR. Aday "uretilmez", havuz FILTRELENIR.
// K6 ("metin benzerligi yuksek ama Adi farkli urun aday olamaz") bir kural
// degil, bu tasarimin dogal sonucudur: benzerlik kavrami motorda YOK.
//
// UC SONUC (PRD Bolum 7 — dorduncu yol yasak):
//   kalan 1  → single      : fiyat yazilir
//   kalan ≥2 → ask         : ayrisan kolon fiyatli sorulur
//   kalan 0  → none        : "bu markada yok" + alternatif markalar
//
// SAF: DB yok, I/O yok. Test DB'siz kosar.
// ════════════════════════════════════════════════════════════════════

import { sizeEquivalents, SizeClass, capImzasi } from '../conversion';
import { extractFluid } from '../normalizer';
import { altKumeMi, tokenEsit } from './product-index';
import { EQUIPMENT_TYPE_TAGS } from '../shared-tag-matcher';
import { buildFamilyVocab, distinctSayisi } from './vocab';
import { classifyTokens, resolveLineFamily } from './line-parser';
import type { IndexedRow, LineQuery, QueryOutcome, QueryOpts, AskColumn, KanitKapisi } from './types';

/**
 * Satirin olcu sinifi. YENI ve daha iyi kaynak: aile havuzunun kendisi.
 * v1 bunu MARKADAN tahmin ediyordu ("ÇAYIROVA → çelik"). Artik urunler
 * kendi sinifini soyluyor; havuzda tek sinif varsa satirin sinifi odur.
 * Bu, I4'u ("marka yalniz dogrular") mekanik olarak saglar.
 */
export function resolveLineClass(rows: IndexedRow[], hint?: SizeClass | null): SizeClass {
  const siniflar = new Set(rows.map((r) => r.urun.sizeClass).filter((s) => s !== 'unknown'));
  if (siniflar.size === 1) return Array.from(siniflar)[0] as SizeClass;
  if (hint) return hint;
  return 'unknown'; // → union + ambiguous → asla otomatik yazma (P4 korumasi)
}

/** Ayrisan ILK kolon sorulur. "Cins tekrar sorulmaz" veriden duser (K3). */
export function ayrisanKolon(rows: IndexedRow[]): AskColumn {
  if (distinctSayisi(rows, (r) => r.urun.adBucket) > 1) return 'ad'; // K5
  // GRUP KADEMESI (kullanici karari 17.07): ad COZULMUS ama adaylar birden
  // fazla bolum basligindan geliyorsa ("6'' siyah boru" → Tesisat + Basınçlı)
  // once GRUP sorulur; kullanici gruba girince cins/baglanti kademeleri
  // aynen devam eder. AD sorusu onceligi korunur (K5 ust-aile bozulmaz).
  if (distinctSayisi(rows, (r) => (r.urun.kategori ?? r.urun.sheetName ?? '').trim()) > 1) return 'kategori';
  if (distinctSayisi(rows, (r) => r.urun.cinsNorm ?? '') > 1) return 'cins';
  if (distinctSayisi(rows, (r) => r.urun.baglantiNorm ?? '') > 1) return 'baglanti'; // K3
  if (distinctSayisi(rows, (r) => r.urun.boyTag ?? '') > 1) return 'boy';
  return 'urun'; // kolonlar ayni, kayit farkli → K7 vakasi (ayni kod, iki fiyat)
}

/**
 * Alt-kume testi: teklifin token'lari urununkinin icinde mi?
 * ONEK TOLERANSLI — Turkce eki burada gecilir ('galvaniz' ⊂ 'galvanizli'),
 * kok alma YOK (bkz. product-index.tokenEsit: -lı eki ile govde-sonu -l
 * sozluksuz ayirt edilemez).
 */
const altKume = altKumeMi;

export function runQuery(line: LineQuery, pool: IndexedRow[], opts?: QueryOpts): QueryOutcome {
  // ── 0. URUN DEGIL ────────────────────────────────────────────────
  if (line.notProduct) return { kind: 'none', reason: 'urun-degil' };

  // ── 0b. SOZLUK KELIMELERI AYIKLANIR (S3) ─────────────────────────
  // Alias'in kendi kelimeleri ('sprink','hatti','temiz','su') sozluk
  // tarafindan ZATEN tuketildi — kisit da degiller, "bulunamadı" da.
  const tokens = opts?.ignoreTokens?.length
    ? line.tokens.filter((t) => !opts.ignoreTokens!.some((ig) => tokenEsit(ig, t)))
    : line.tokens;

  // ── 1. AD — SERT KILIT ───────────────────────────────────────────
  // Seviye1: aile. Vana/hortum bir kompansator satirina HICBIR skorla
  // aday olamaz — cunku skor yok, filtre var.
  // 'belirsiz' urunler (aile cozulemedi) havuza HIC girmez (PRD 2A).
  let rows = pool.filter((r) => !r.urun.belirsiz);

  // ── 1a. SEVIYE1: AILE (cozulduyse) ───────────────────────────────
  // S3: satir kendi ailesini cozemediyse SOZLUK cozer (hidrant→boru).
  // E8 guard CAGIRANDA: satir ailesi COZULDUYSE hintFamily zaten gelmez.
  // S6: `aileKilidiKapali` YALNIZ teshis gecisinde acilir (bkz. QueryOpts ve
  // `aileUyusmazligiTeshisi`). Normal yolda aile SERT KILIT olarak kalir.
  const familySlug = opts?.aileKilidiKapali ? null : (line.familySlug ?? opts?.hintFamily ?? null);
  if (familySlug) {
    rows = rows.filter((r) => r.urun.adSlug === familySlug);
    if (rows.length === 0) return { kind: 'none', reason: 'ad-yok', detail: familySlug };
  }

  // ── 1a2. SOZLUK SINIFI — SERT (T1: sozluk cinsi YAZILI sayilir) ──
  // "TEMİZ SU" (→PPR) altinda celik urun ADAY OLAMAZ (R3). Karsit sinif
  // elenir; 'unknown' gecer (urun sinifini soylemiyorsa suclanmaz).
  if (opts?.hintClass) {
    const karsit = opts.hintClass === 'plastic' ? 'steel' : 'plastic';
    rows = rows.filter((r) => r.urun.sizeClass !== karsit);
    if (rows.length === 0) {
      return { kind: 'none', reason: 'kriter-yok', detail: opts.hintLabel ?? opts.hintClass };
    }
  }

  // ── 1b. SEVIYE2: AD TOKEN'LARI — AILE COZULMESE DE UYGULANIR ─────
  // ⚠ Bunu once yanlis yaptim: tum token filtrelemesi `if (familySlug)`
  // blogunun ICINDEYDI. Aile cozulemeyen satirda ("OTOMATİK HAVA ATMA
  // PÜRJÖRÜ DN 20" → aile=null, sozlukte yok) HICBIR ad kisiti uygulanmiyor,
  // geriye yalniz cap kaliyordu → DN20'li HER urun aday oluyordu (canli
  // vakada 359 aday: sprinkler hortumu, dogalgaz hortumu, kondenstop...).
  // Bu, tam da sokmeye calistigimiz hastaligin ta kendisiydi.
  //
  // Dagarcik: aile cozulduyse aile havuzundan, cozulmediyse TUM havuzdan.
  const vocab = buildFamilyVocab(rows);
  const yol = classifyTokens(tokens, vocab);
  /**
   * ALIAS SATIRIN AD KELIMESINI YUTTU MU? (06.08 canli AYVAZ vakasi)
   *
   * Alias suzgeci UYGULANMASAYDI satir bir ad kelimesi yazmis olur muydu?
   * Yalniz K8 kapisinin KARARI icin sorulur — daraltma/kisit zinciri
   * DEGISMEZ (alias kelimeleri filtreli kalir).
   *
   * ⚠ ILK YAZIMDA GENIS TUTMUSTUM (yol'u tamamen tam-token'la degistiriyordu)
   * ve regresyon paketi bunu YAKALADI: `test:matching T3` ("sprink hatti"
   * alias'inda 'hatti' bilinmeyen sayilip tek eslesme multi'ye dustu) ve
   * `test:spec R1` (galvaniz siralamasi) kirmizi verdi. Daraltmaya
   * dokunmamak SART; yalniz "satir hic ad yazmadi" HUKMU yanlisti.
   */
  const aliasAdYuttu = (): boolean =>
    !!opts?.ignoreTokens?.length && classifyTokens(line.tokens, vocab).ad.length > 0;
  // S-vakasi (ad-gevsetme) icin AD filtreleri oncesi aile havuzu:
  const aileHavuzu = rows;
  let adGevsetildi = false;
  // Satir adini TAM ICEREN superset adlar ("...takımı") — soru acilirsa SONA
  let adGenis: IndexedRow[] | null = null;
  // Aileyi COZEN kelimeler "taninmayan" sayilmaz — onlar ailenin adidir
  // (es anlamli olabilir: "flow switch" ↔ "Akış anahtarı"). Yalniz FILTRE
  // DISI kalirlar; kullaniciya eksikmis gibi RAPORLANMAZLAR.
  //
  // ⚠ MUAFIYET DARALTILDI (16.07, K8): 'cekvalf' de aileyi cozer (icindeki
  // /valf/ → vana) ama VANANIN ADI DEGILDIR — muaf sayilinca, markada
  // cekvalf yokken TUM vana ailesi soruya dusuyordu (kuresel vana bir
  // cekvalf satirina ADAY OLAMAZ, K6). Ayrim:
  //   • token TEK BASINA aileyi cozuyor VE cozdugu ailenin adi DEGIL
  //     ('cekvalf'→vana): bu bir ALT-TIP adidir → muaf DEGIL (kisit/rapor).
  //   • tek basina cozemeyen ('flow'/'switch' — esi lazim) veya ailenin
  //     kendisi olan ('vana', 'borulari'→boru) → muaf (es anlamli/aile adi).
  const aileMuaf = (t: string) => {
    // AILENIN KENDISI her kosulda muaf: 'borulari'~'boru'. aileKelimeleri
    // listesine girmemis olabilir — "SPRİNK HATTI BORULARI"nda 'borulari'
    // kaldirilinca kalan 'sprink hatti' de boru cozer (normalizer H1 kurali),
    // yani aile onsuz da ayakta → listeye girmez; ama kelime yine ailenin
    // adidir, 'bulunamadi/kisit' sayilamaz (tokenEsit 'borusu'↔'borulari'
    // gibi iki EKLI formu birbirine baglayamaz — ikisi de slug'a baglanir).
    if (familySlug && tokenEsit(t, familySlug)) return true;
    if (!line.aileKelimeleri.includes(t)) return false;
    const tekBasina = resolveLineFamily(t);
    if (tekBasina && !tokenEsit(t, tekBasina)) return false; // alt-tip adi (cekvalf)
    return true;
  };
  const bilinmeyen = yol.bilinmeyen.filter((t) => !aileMuaf(t));

  // CEKIRDEK AD (Faz 2b, R19 vakasi): aile-es kelime ('vana') urun adinda
  // GECMEYEBILIR ("İzleme Anahtarlı Kelebek" — adi 'Kelebek'le biter). Aile
  // ZATEN kilitli; tam-ad/alt-kume testleri aile-es kelimeler HARIC yapilir.
  const adCekirdek = yol.ad.filter((t) => !(familySlug && tokenEsit(t, familySlug)));

  // ── AÇI KURALI (fitting) — kullanici karari 18.07 (Trakya dirsek vakasi)
  // "90°" MUHENDISLIKTE VARSAYILAN acidir: yalin "Dirsek" (adinda aci
  // YAZMAZ) zaten 90°'dir. Satir "90°" derse adinda aci OLMAYAN urunler
  // (yalin Dirsek ₺37) DISLANMAMALI — eski davranista "90°" bir ad token'i
  // gibi isimde araniyor, yalniz "90° ... Rakor Dirsekli" varyantlari
  // kaliyordu. FARKLI aci (45°/135°) SERT kalir (gercekten farkli urun).
  // Uygulama: (1) aci-uyumsuz urunler elenir; (2) aci token'i isim
  // daraltmasindan CIKARILIR ki yalin adlar kalsin. YALNIZ fitting ailesi.
  const aciOku = (text: string): string | null => {
    const mm = (text ?? '').match(/(\d{2,3})\s*(?:°|derece)/i);
    return mm ? mm[1] : null;
  };
  const aciTokenMi = (t: string) => /^\d{2,3}°$/.test(t);
  let adCekirdekAci = adCekirdek;
  if (familySlug === 'fitting') {
    const satirAci = aciOku(line.raw);
    if (satirAci) {
      rows = rows.filter((r) => {
        const urunAci = aciOku(r.urun.ad);
        return urunAci === satirAci || (urunAci === null && satirAci === '90');
      });
      if (rows.length === 0) return { kind: 'none', reason: 'kriter-yok', detail: `${satirAci}°` };
      adCekirdekAci = adCekirdek.filter((t) => !aciTokenMi(t));
    }
  }
  const adTest = adCekirdekAci.length > 0 ? adCekirdekAci : adCekirdek.length > 0 ? adCekirdek : yol.ad;

  if (yol.ad.length) {
    // ── TAM AD ESLESMESI ONCELIKLIDIR (PRD §4: "bucket kilitlenir — YALNIZ bu ad")
    // Canli vaka: "Dilatasyon kompansatörü DN25" → 16 aday geldi; hepsi dogru
    // aileden ama UC ayri ad: "Dilatasyon kompansatörü" (4) + "Omega U-Flex
    // dilatasyon kompansatörü" (6) + "Omega V-Flex dilatasyon kompansatörü" (6).
    // Salt alt-kume mantigi ({dilatasyon} ⊆ {omega,vflex,dilatasyon}) Omega'lari
    // da aliyordu. Oysa kullanici ADIN TAMAMINI yazmis ve kutuphanede o ad
    // BIREBIR var → bucket odur; K1 "yalniz Dilatasyon kompansatörü kayitlari"
    // diyor. Boylece soru da doguru yere kayar: alt-ad degil, BAGLANTI (K3).
    //
    // Tam eslesme = token kumeleri ESIT (alt-kume + ayni sayida).
    const tam = rows.filter(
      (r) => {
        const urunCekirdek = r.urun.adTokens.filter((x) => !(familySlug && tokenEsit(x, familySlug)));
        return urunCekirdek.length === adTest.length && altKume(adTest, urunCekirdek);
      },
    );
    if (tam.length > 0) {
      // ── SUPERSET ADLAR SONA (kullanici karari 17.07, islak alarm vakasi) ──
      // "Islak Alarm Vanası" satiri tam bucket'i kilitleyince "...takımı" /
      // "...trim seti" gibi satir adini TAM ICEREN diger adlar ELENIYORDU.
      // Karar: soru ZATEN acilacaksa bunlar listenin SONUNA eklenir (tam ad
      // onde); tek tam kayit yine otomatik yazilir (K2 bozulmaz). Dilatasyon
      // dersi bilinclice geri alindi: Omega serileri de sonda gorunur —
      // gruplu soru (ad kolonu) karisik 16'li listeden farklidir.
      // Sonraki sert filtreler (cins/baglanti/cap/boy) bu kumeye de uygulanir.
      const tamIds = new Set(tam.map((r) => r.id));
      const genis = rows.filter((r) => !tamIds.has(r.id) && altKume(adTest, r.urun.adTokens));
      if (genis.length > 0) adGenis = genis;
      rows = tam;
    } else {
      // Tam ad yok → alt-kume: teklif UST ad yazmis olabilir ("kompansatör"),
      // ya da urun adi daha uzundur ("Omega V-Flex dilatasyon kompansatörü").
      const daralt = rows.filter((r) => altKume(adTest, r.urun.adTokens));
      if (daralt.length > 0) rows = daralt;
      else {
        // ── AD-TOKEN DUSURME (canli vaka 16.07: izleme anahtarli) ────
        // Token'lar tek tek TANINIYOR ama hicbir urun HEPSINI birden
        // tasimiyor ('izleme' baska urunden — "Vana izleme anahtarı" —
        // dagarciga girmisti; hedef urun "İzlenebilir kelebek vana").
        // Kural: havuzu BOSALTAN token kisit YAPILMAZ, "bulunamadı"
        // notuna duser; kalanlar daraltir → fiyatli soru → secim
        // ogrenilir. SONDAN uygulanir (Turkcede bas isim sondadir —
        // 'vana','kelebek' once daraltsin). HIC token uygulanamazsa
        // asagidaki K8 kapisina duser (tum aile ASLA listelenmez).
        let kalan = rows;
        let uygulanan = 0;
        const dusenler: string[] = [];
        for (const t of [...adTest].reverse()) {
          const d = kalan.filter((r) => r.urun.adTokens.some((x) => tokenEsit(t, x)));
          if (d.length > 0) { kalan = d; uygulanan++; }
          else { bilinmeyen.push(t); dusenler.push(t); }
        }
        if (uygulanan === 0) return { kind: 'none', reason: 'ad-yok', detail: adTest.join(' ') };
        // R15 UNION ("KÜRESEL VE KELEBEK VANALAR"): dusen token baska bir
        // ALT-AD olabilir — tek basina tuttugu urunler SORUYA eklenir.
        // Sistem yine secmez; iki aday ad fiyatlariyla yan yana sorulur.
        for (const t of dusenler) {
          for (const r2 of rows.filter((r) => r.urun.adTokens.some((x) => tokenEsit(t, x)))) {
            if (!kalan.includes(r2)) kalan = [...kalan, r2];
          }
        }
        rows = kalan;
      }
    }
  }

  // ── KARAR #3'UN SINIRI (16.07'de K8 ile SIKILASTIRILDI) ──────────
  // "Taninmayan token kisit degildir" kurali ancak satirin ad-icereginden
  // EN AZ BIR kelime eslesiyorsa gecerlidir (yukaridaki dusurme dahil):
  // kompansator ailesinde "dilatsyon" yazim hatasi → alt-ad sorusu ✓.
  // Satirin ad-icereginden HICBIR kelime eslesmiyorsa ("ÇEKVALF" — markada
  // cekvalf yok) tum aileyi listelemek K6/K8 ihlalidir: kuresel vana bir
  // cekvalf satirina ADAY OLAMAZ → YOK + M3 alternatif markalar.
  //   • hic ad kelimesi YOK ("DN 20")     → bir sey sorulmadi → SOR (R11)
  //   • kelime VAR ama hicbiri eslesmiyor → var olmayan sey soruldu → YOK
  //
  // NOT (Faz 2b): "eslesen yalniz aile adi + bilinmeyen var → none"
  // genellemesi DENENDI ve GERI ALINDI — Karar #3'un yazim-hatasi hakkini
  // ('dilatsyon kompansatörü' → alt-ad sorusu) yiyordu. R9/H7 guvenligi
  // asagida bilinmeyenNotu kapisiyla saglanir: dogrulanamayan kelime varken
  // fiyat ASLA otomatik yazilmaz (E9'un dogdugu vaka "sessiz yazim"di).
  // ⚠ ALIAS ISTISNASI (06.08): satirin ad kelimesini SOZLUK yuttuysa "satir
  // hicbir ad yazmamis" hukmu YANLISTIR — satir ailenin ADINI yazmisti, biz
  // onu gurultu sayip cikardik. Canli vaka: "Otomatik Sprinkler Kafasi",
  // ogrenilmis 'sprinkler' alias'i yuzunden ad'siz kalip 0 aday donuyordu
  // (yuzlerce sprinkler duruyorken). Kapi: test/alias-kelime-yutma-test.ts
  if (yol.ad.length === 0 && bilinmeyen.length > 0 && !aliasAdYuttu()) {
    return { kind: 'none', reason: 'ad-yok', detail: bilinmeyen.join(' ') };
  }

  // ── 3/4/5. YAZILI CINS + BAGLANTI — SERT (K4) ────────────────────
  // BORU YUZEY GENISLETMESI (kullanici karari 16.07): "siyah boru / celik
  // boru kelimelerinde galvaniz ve kirmizi boyali tercihlerini de sunsun."
  // YALNIZ boru ailesinde: yazili YUZEY yine sert filtredir (tek kayda inen
  // satir otomatik yazilir — K2 bozulmaz), ama POPUP acilacaksa yuzey-haric
  // ayni filtreleri gecen DIGER yuzey varyantlari listeye SONDA eklenir.
  // Yuzey-DISI cins kelimeleri (pirinc/paslanmaz/pn25...) HER ailede sert.
  const YUZEYLER = ['siyah', 'galvaniz', 'kirmizi', 'boyali'];
  const yuzeyToken = (t: string) => YUZEYLER.some((s) => tokenEsit(s, t));
  let yuzeyGenis: IndexedRow[] | null = null; // boru: yuzey filtresi HARIC gecenler
  // ── CELISKILI YAZILI YUZEY (IS 3-B) ─────────────────────────────────
  // Satirda BIRLIKTE BULUNAMAYAN yuzeyler yazili olabilir ("Galvaniz Siyah
  // boru"): AND filtresi havuzu bosaltir. Dolu ise not, ask'i zorlar (K2).
  let yuzeyCeliskiNotu: string | null = null;
  // ── V4.7 VARYANT KURTARMA HAVUZU (TUM AILELER) ────────────────────
  // Kullanicinin popup'ta sectigi varyant (variantTags) hedef satira
  // tasinirken, satir metnindeki IKINCIL nitelikler (yuzey: "siyah";
  // baglanti: "dişli"; cins kelimeleri) havuzu daraltip varyanti eleyebilir
  // → motor "bu çapta yok" der, OYSA urun kutuphanede vardir.
  // Bu havuz cins/yuzey/baglanti filtrelerinden ONCE alinir; asagida CAP ve
  // BOY filtreleri ona da uygulanir (yanlis capa fiyat yazilmasin).
  // NOT: yuzeyGenis yalniz 'boru' ailesinde doluyordu — bu yuzden ilk
  // duzeltme yalniz boruyu kurtardi, kelebek vana gibi kalemlerde sorun
  // surdu (kullanici bildirimi 30.07: "duzeltmenin genel olarak yapilmasi
  // gerekiyor"). Bu havuz aile-bagimsizdir.
  let varyantKurtarma: IndexedRow[] = rows;
  let yaziliTabanlar: string[] = []; // yazili yuzeylerin kanonik tabani (siralama)
  if (yol.cins.length) {
    const yuzeyler = yol.cins.filter(yuzeyToken);
    const diger = yol.cins.filter((t) => !yuzeyToken(t));
    if (diger.length) {
      if (adGenis) adGenis = adGenis.filter((r) => altKume(diger, r.urun.cinsTokens));
      const d = rows.filter((r) => altKume(diger, r.urun.cinsTokens));
      if (d.length > 0) rows = d;
      else {
        // ── AD-GEVSETME (canli vaka 16.07: "Swing Çek Vana") ─────────
        // Urun "Çekvalf BC-100 · çalpara (swing)" — satirdaki 'vana' AD
        // kisiti kelebek/kuresel'e daraltti (Çekvalf adinda 'vana' yok),
        // 'swing' cinsi onlari eledi → "yok" YALANI. Cins AILE havuzunda
        // TASINIYORSA ad daraltmasi yanlis bucket'a kilitlemis demektir:
        // gevset ve devam et. Bu yoldan gelen sonuc ASLA otomatik
        // yazilmaz (asagida adGevsetildi kapisi) — ad birebir eslesmedi.
        const d2 = aileHavuzu.filter((r) => !r.urun.aileZayif && altKume(diger, r.urun.cinsTokens));
        if (d2.length > 0) { rows = d2; adGevsetildi = true; }
        else return { kind: 'none', reason: 'kriter-yok', detail: diger.join(' ') };
      }
    }
    if (yuzeyler.length) {
      const hepsi = (r: IndexedRow) => altKume(yuzeyler, r.urun.cinsTokens);
      const d = rows.filter(hepsi);
      if (d.length > 0) {
        if (adGenis) adGenis = adGenis.filter(hepsi);
        if (familySlug === 'boru') yuzeyGenis = rows; // yuzey uygulanmamis kume
        yaziliTabanlar = ['siyah', 'galvaniz'].filter((b) => yuzeyler.some((t) => tokenEsit(b, t)));
        rows = d;
      } else {
        // ── CELISKILI YAZILI YUZEY — AND bos ⇒ OR (kullanici karari 04.08) ──
        // Vaka: "2\" Galvaniz Siyah boru". Hicbir urun hem galvaniz hem siyah
        // OLAMAZ → AND havuzu bosalir → eski davranis SERT 'none' idi ("bu
        // markada yok" YALANI: markada hem galvanizli hem siyah boru VARDIR).
        // Kural VERI-TUREVLIDIR, sabit celiski listesi YOK: cift BIRLIKTE
        // bulunabiliyorsa ("Kirmizi Boyali") AND dolu doner ve yukaridaki
        // davranis AYNEN korunur; yalniz havuz bosaldiginda OR'a dusulur.
        // Diger TUM filtreler (ad/cap/baglanti/boy/birim) yerinde kalir —
        // asagida bu kumeye de uygulanirlar.
        // K4 KORUNUR: yazili yuzeylerden HICBIRINI tasimayan urun GIRMEZ.
        // K2 KORUNUR: not uretilir → tek aday kalsa bile fiyat YAZILMAZ,
        // popup acilir ve kullanici secer.
        const biri = (r: IndexedRow) =>
          yuzeyler.some((t) => r.urun.cinsTokens.some((x) => tokenEsit(t, x)));
        const orHavuz = rows.filter(biri);
        if (orHavuz.length === 0) {
          return { kind: 'none', reason: 'yuzey-celiskisi', detail: yuzeyler.join(' ') };
        }
        if (adGenis) adGenis = adGenis.filter(biri);
        yuzeyCeliskiNotu = `Satırda birlikte bulunamayan yüzeyler yazılı (${yuzeyler.join(' / ')}) — hangisi?`;
        rows = orHavuz;
      }
    }
  }
  if (yol.baglanti.length) {
    // BOS BAGLANTI = BELIRTILMEMIS, ELENMEZ (18.07 canli — Trakya "Dişli Te"):
    // 'disli' mekanik te'lerin "dişli çıkış" baglantisina takilip YALIN Te'yi
    // (baglanti kolonu bos) eliyordu. Bos kolon "belirtilmemis/uyumlu" demektir
    // — CAKISAN baglanti (kaynakli vs disli) elenir, BOS olan gecer. (Cap'taki
    // "capsiz ekipman" istisnasinin baglanti karsiligi; "eksik kriter=filtre
    // degil" ilkesi.) altKume zaten bos urun-token'inda false doner → ozel gec.
    const bagUyar = (r: IndexedRow) => r.urun.baglantiTokens.length === 0 || altKume(yol.baglanti, r.urun.baglantiTokens);
    if (adGenis) adGenis = adGenis.filter(bagUyar);
    const d = rows.filter(bagUyar);
    if (d.length > 0) rows = d;
    else {
      // Ad-gevsetme baglanti icin de simetrik (ayni hastalik, ayni ilac)
      const d2 = aileHavuzu.filter((r) => !r.urun.aileZayif && bagUyar(r));
      if (d2.length > 0) { rows = d2; adGevsetildi = true; }
      else return { kind: 'none', reason: 'kriter-yok', detail: yol.baglanti.join(' ') };
    }
    if (yuzeyGenis) yuzeyGenis = yuzeyGenis.filter(bagUyar);
  }
  if (rows.length === 0) return { kind: 'none', reason: 'ad-yok' };

  // ── 2. CAP — SERT ────────────────────────────────────────────────
  // Esdegerlik INDEKSTE on-hesapli (capTags): teklifteki 2" ile kutuphanedeki
  // DN50 burada bulusur, sorgu aninda cevrim TABLOSU aranmaz.
  let donusum: string | null = null;
  let capsizDusum = false;
  /** S4: capsiz istisnasindan gecen adaylar arasinda ailesi ZAYIF olan var mi
   *  (aile yalniz kategori basligindan turedi) → ek kanit kapisi. */
  let capsizAileZayif = false;
  if (line.capInfo) {
    const cls = resolveLineClass(rows, opts?.sizeClassHint);
    const equiv = sizeEquivalents(cls, line.capInfo);
    donusum = equiv.rozet;
    if (equiv.tags.length) {
      // ── BILESIK/REDUKSIYON CAP (18.07 canli — "3"x1" Dişli Mekanik Te") ──
      // extractSizeInfo tek olcu doner → reduksiyon fitting "3" x 1"" ile line
      // "3"x1"-DN80 x DN25" HIZALANMIYORDU (biri dn80, biri dn25). Kanonik DN
      // IMZASI (kume) ile karsilastir: line VEYA urun BILESIKSE imzalar ESIT
      // olmali (3"x1" → {dn25,dn80}); "2.5"x1"/"4"x1" ELENIR. Ayrica tekil bir
      // satir ("1" Te") artik REDUKSIYON urune eslesmez (imza uzunlugu farkli).
      const lineImza = capImzasi(line.raw, cls);
      const capUyar = (r: IndexedRow) => {
        const urunBilesik = !!r.urun.capRaw && capImzasi(r.urun.capRaw, cls).bilesik;
        if (lineImza.bilesik || urunBilesik) {
          const ui = capImzasi(r.urun.capRaw ?? '', cls).imza;
          return ui.length === lineImza.imza.length && ui.every((t, i) => t === lineImza.imza[i]);
        }
        return r.urun.capTags.some((t) => equiv.tags.includes(t));
      };
      const capOncesi = rows; // PANO 20: cap-yok'ta mevcut caplari raporla
      const d = rows.filter(capUyar);
      // Capsiz ekipman (E1/H3): urunun capi yoksa cap filtresi ELEMEZ —
      // "kompansator 40cm hortum" gibi satirlarda cap satira degil urune ait
      // olmayabilir. Capi OLAN urunler arasinda ise filtre serttir.
      // ⚠ Ç-vakasi (16.07): bu istisnadan gecen TEK aday otomatik YAZILMAZ
      // (capsizDusum kapisi) — "Yiv açma makinesi" 373.825 TL sprink hattina
      // yazilmisti: cap dogrulanamadi = tahmin, tahmin fiyat yazamaz (I6).
      // ── S4 FRENI: AILESI ZAYIF ADAY ELENMEZ, ONAY ISTER (06.08 DUZELTME) ──
      // Istisna "urunun capi satirla ilgisiz olabilir" varsayimina dayanir; o
      // varsayim adayin ailesi yalnizca KATEGORI basligindan turemisse
      // (seviye salteri yedek probu → "Boru Hattı Ekipmanları" → 'boru') iki
      // tahminin ust uste binmesi demektir — "Yiv açma makinesi 373.825 TL"
      // vakasini ureten desen budur.
      // ILK SURUM ADAYI ELIYORDU (`&& !r.urun.aileZayif`) ve bu YANLISTI:
      // kalem kullanicinin EKRANINDAN KAYBOLUYORDU (none/cap-yok), yani
      // kutuphanede VAR OLAN bir urun hic gorunmuyordu. Dogru davranis
      // "gosterme" degil "goster ama ONAY iste": aday listede kalir, asagidaki
      // aile-zayif kapisi fiyatin OTOMATIK yazilmasini engeller.
      // AYRIM (S4'un diger iki freni AYNEN durur): ad-gevsetme kurtarmasi ve
      // capraz-marka onerisi TAHMIN URETIR — olmayan bir eslesmeyi var eder.
      // Capsiz istisnasi ise VAR OLAN bir kalemi gosterir. Fark budur.
      const capsiz = rows.filter((r) => r.urun.capTags.length === 0);
      if (d.length > 0 || capsiz.length === 0) {
        rows = d;
      } else {
        rows = capsiz;
        capsizDusum = true;
        capsizAileZayif = capsiz.some((r) => r.urun.aileZayif);
      }
      if (rows.length === 0) {
        // PANO 20 (I7 — sessiz bos YASAK): markadaki MEVCUT caplar, satirin
        // capina yakinlik sirasiyla raporlanir ("en yakin: 50 / 100 mm").
        const hedef = line.capInfo.value;
        const gorulen = new Map<string, number>();
        for (const r of capOncesi) {
          const ham = (r.urun.capRaw ?? '').trim() || r.urun.capTags[0] || '';
          if (!ham || gorulen.has(ham)) continue;
          const n = parseFloat(ham.replace(',', '.'));
          gorulen.set(ham, isNaN(n) ? Number.MAX_SAFE_INTEGER : Math.abs(n - hedef));
        }
        const mevcutCaplar = Array.from(gorulen.entries())
          .sort((a, b) => a[1] - b[1])
          .slice(0, 4)
          .map(([ham]) => ham);
        return { kind: 'none', reason: 'cap-yok', detail: line.capInfo.display, donusum, mevcutCaplar };
      }
      if (yuzeyGenis) yuzeyGenis = yuzeyGenis.filter(capUyar); // genis kume de AYNI capta
      varyantKurtarma = varyantKurtarma.filter(capUyar); // V4.7: kurtarma da AYNI capta
      // Superset adlar da AYNI capta (capsiz kayit gecer — takim/set capsiz olabilir)
      if (adGenis) adGenis = adGenis.filter((r) => capUyar(r) || r.urun.capTags.length === 0);
    }
  }

  // ── 5. YAZILI BOY — SERT ─────────────────────────────────────────
  if (line.boyTag) {
    const d = rows.filter((r) => r.urun.boyTag === line.boyTag);
    if (d.length > 0) rows = d;
    if (yuzeyGenis) yuzeyGenis = yuzeyGenis.filter((r) => r.urun.boyTag === line.boyTag || !r.urun.boyTag);
    varyantKurtarma = varyantKurtarma.filter((r) => r.urun.boyTag === line.boyTag || !r.urun.boyTag);
    if (adGenis) adGenis = adGenis.filter((r) => r.urun.boyTag === line.boyTag || !r.urun.boyTag);
  }

  // ── 5b. TABAN YUZEY BEKLENTISI (S3/R1) — SIRALAR, ELEMEZ ─────────
  // Kullanici karari (16.07): "galvaniz one cikmaz" = listede SONA duser;
  // sprink/yangin hattinda galvaniz/siyah/kirmizi astarli UCUY DE fiyatiyla
  // secenek olarak sunulur — sistem yine KENDISI SECMEZ. (Onceki yorum
  // "cakisan tabani ELE" idi; kullanici canli testte duzeltti.)
  // Sira: beklenen taban (siyah) → tabansiz varyant (kirmizi = kaplama)
  //       → cakisan taban (galvaniz).
  // SATIR KAZANIR (T3): satir acikca 'galvaniz' yazdiysa cins filtresi
  // yukarida zaten galvanize indirdi — buraya tek tabanla gelinir.
  const TABANLAR = ['siyah', 'galvaniz'];
  const tabanSirasi = (r: IndexedRow, beklenen: string[]): number => {
    const rowBases = TABANLAR.filter((b) =>
      r.urun.cinsTokens.some((t) => tokenEsit(b, t)) || r.urun.adTokens.some((t) => tokenEsit(b, t)));
    if (rowBases.length === 0) return 1; // taban soylemiyor (kirmizi boyali)
    return rowBases.some((b) => beklenen.includes(b)) ? 0 : 2; // beklenen : cakisan
  };
  if (opts?.hintBases?.length && rows.length > 1) {
    const hb = opts.hintBases;
    rows = [...rows].sort((a, b) => tabanSirasi(a, hb) - tabanSirasi(b, hb)); // stable — grup ici sira korunur
  }

  // ── 5b-2. MALZEME BEKLENTISI (S5) — SIRALAR, ELEMEZ ──────────────
  // Taban yuzey kuralinin (yukarisi) MALZEME eksenindeki ikizi. Sozluk
  // "pis su = PVC|HDPE" der; havuzda hem PVC hem PP boru olabilir ve ikisi
  // de `plastic` sinifindadir — sizeClass onlari AYIRT EDEMEZ, malzeme
  // etiketi eder.
  //   0 = beklenen malzemeyi tasiyor      → basa
  //   1 = malzemesi COZULEMEDI (etiketsiz) → ortada (kanit yok, suclama yok)
  //   2 = baska bir malzeme tasiyor        → sona
  // Taban sirasindan SONRA uygulanir: iki sort da kararlidir, dolayisiyla
  // MALZEME birincil, taban ikincil anahtar olur (malzeme kimlik, yuzey
  // kaplamadir — kimlik once gelir).
  const malzemeSirasi = (r: IndexedRow, beklenen: string[]): number => {
    const m = r.urun.malzemeler ?? [];
    if (m.length === 0) return 1;
    return m.some((x) => beklenen.includes(x)) ? 0 : 2;
  };
  if (opts?.hintMalzeme?.length && rows.length > 1) {
    const hm = opts.hintMalzeme;
    rows = [...rows].sort((a, b) => malzemeSirasi(a, hm) - malzemeSirasi(b, hm));
  }

  // ── 5c. ISCILIK L6: BIRIM SERT ───────────────────────────────────
  // PRD Iscilik: "malzeme metre ise metre bazli iscilik kalemi; adet ise
  // adet bazli. Uymayan kalem aday olamaz." Malzemedeki E2 (yumusak onay)
  // AYNEN kalir; bu filtre yalniz birimSert (catalog=iscilik) ile calisir.
  // Birimsiz kalem / taninmayan birim ELENMEZ; havuz bosalirsa sonuc
  // 'none' (birim-uyumsuz) — cagiran alternatif firmalari onerir (L5).
  if (opts?.birimSert && line.unit) {
    const istenen = birimKanonik(line.unit);
    if (istenen) {
      const uyumlu = rows.filter((r) => {
        const k = birimKanonik(r.urun.birim);
        return !k || k === istenen;
      });
      if (uyumlu.length === 0) {
        return { kind: 'none', reason: 'birim-uyumsuz', detail: line.unit, donusum };
      }
      rows = uyumlu;
      if (yuzeyGenis) yuzeyGenis = yuzeyGenis.filter((r) => { const k = birimKanonik(r.urun.birim); return !k || k === istenen; });
      if (adGenis) adGenis = adGenis.filter((r) => { const k = birimKanonik(r.urun.birim); return !k || k === istenen; });
    }
  }

  // ── 6. V4 GRUP VARYANTI — kullanicinin KENDI secimi ──────────────
  // R16 dersi: kullanici sinyali marka/skor sinyalinden ONCE uygulanir.
  // (v2'de zaten marka tie-break YOK — marka artik stok kapsami.)
  if (opts?.variantTags?.length) {
    const v = opts.variantTags;
    // VS (25.08, hakem+probe turu): tag karsilastirmasi TOLERANSLI — bkz.
    // varyantTagEsit. TAM-DIZGI esitligi satici yazim kaymasinda ('PN25' vs
    // 'PN 25') ve ada gomulu olcude ('... 20 mm' vs '... 32 mm') TUM grubu
    // variantMissing'e dusuruyordu; boru disinda "surukleme calismiyor"
    // algisinin olculen ana kaynagi buydu.
    const tagUyar = (r: IndexedRow) => {
      const aday = urunVariantTags(r);
      return v.every((t) => aday.some((x) => varyantTagEsit(t, x)));
    };
    // VS-PARA (probe M3): satir CAPLIYKEN capsiz urune otomatik fiyat YAZILMAZ.
    // Ada gomulu-olculu + cap kolonu bos listelerde eslesen===1 kosulu KAYNAK
    // urunu buluyor ve kaynagin fiyati HER hedef capa yayiliyordu (olculdu —
    // para hatasi sinifi). Ç-vakasi kapisinin (capsiz-dusum) variant-erken-donus
    // yoluna uygulanmis hali: aday listede kalir, kullanici onaylar.
    const capsizAutoYasak = (r: IndexedRow) => !!line.capInfo && r.urun.capTags.length === 0;
    const capsizOnay = (aday: IndexedRow): QueryOutcome => ({
      kind: 'ask', askColumn: 'urun', rows: [aday], bilinmeyen, donusum,
      uyariNot: `Satır çaplı (${line.capInfo!.display}) ama seçilen varyantın ürününde çap doğrulanamadı`,
      kapilar: ['capsiz-dusum'],
    });
    const eslesen = rows.filter(tagUyar);
    if (eslesen.length === 1) {
      return capsizAutoYasak(eslesen[0])
        ? capsizOnay(eslesen[0])
        : { kind: 'auto-variant', row: eslesen[0], donusum };
    }

    // ── V4.7 (CANLI BULGU 30.07): KULLANICI SECIMI IKINCIL NITELIKTEN ONCE ──
    // Vaka: kesif satiri "Dikişli SİYAH Çelik Boru, DN65"; kullanici KAYNAK
    // satirda (ayni ad, DN150) popup'tan "kirmizi (astar) boyali"yi SECTI ve
    // asagi surukledi. Satir adindaki "siyah" yuzey filtresi kirmizi urunleri
    // havuzdan eledigi icin varyant aramasi bos kaldi ve motor "Seçilen
    // varyant bu çapta kütüphanede yok" dedi — OYSA kutuphanede 2½" kirmizi
    // boyali ₺267,3 ile MEVCUTTU (kullanici ekran goruntusuyle kanitladi).
    // Tutarsizlik: AYNI secim elle yapilinca kabul, suruklemede ret.
    // Kural: variantTags kullanicinin ACIK secimidir (surukleme = acik niyet);
    // yuzey kelimesinden ONCE gelir. Yalniz TAM tag eslesmesi + TEK aday
    // kosuluyla, cap filtresi UYGULANMIS genis havuzda aranir → sessiz ikame
    // degil (sonuc 'auto-variant' = oneri isaretiyle doner).
    // GENEL KURTARMA (TUM AILELER — kullanici bildirimi 30.07: "duzeltmenin
    // genel olarak yapilmasi gerekiyor"). Ilk surumde yalniz yuzeyGenis
    // kullanilmisti; o havuz sadece 'boru' ailesinde doluyor ve kelebek vana
    // gibi kalemlerde sorun suruyordu. varyantKurtarma AILE-BAGIMSIZDIR:
    // cins/yuzey/baglanti filtrelerinden ONCE alinir, CAP ve BOY filtreleri
    // uygulanmistir. Kosullar (fren): TAM tag eslesmesi + TEK aday →
    // sessiz ikame degil, sonuc 'auto-variant' = oneri isaretiyle doner.
    if (eslesen.length === 0) {
      for (const havuz of [yuzeyGenis, varyantKurtarma]) {
        if (!havuz || havuz.length === 0) continue;
        const kurtarilan = havuz.filter(tagUyar);
        if (kurtarilan.length === 1) {
          return capsizAutoYasak(kurtarilan[0])
            ? capsizOnay(kurtarilan[0])
            : { kind: 'auto-variant', row: kurtarilan[0], donusum };
        }
      }
    }

    if (eslesen.length === 0) {
      // Istenen varyant bu capta hicbir adayda YOK. Iki AYRI durum var:
      //  (1) Capta TEK aday var VE o aday istenenin DISINDA kendi ayirt edici
      //      cins/baglanti tasimiyor (notr urun) → varyant ayrimi ANLAMSIZDIR
      //      (secilecek baska urun yok) → surukleme/grup yayilimi fiyat yazsin.
      //      CANLI BULGU (19.07): HAKAN "SESSIZ TIP ATIK SU BORUSU", DUYAR
      //      "PISLIK TUTUCU" — kaynak capta kardesler vardi (varyant sinyali
      //      tasindi, 26d8448), buyuk caplarda tek notr urun; eski davranis
      //      "secim bekliyor"a dusurup fiyat yazmiyordu ("otomatik atama
      //      yapmiyor"). Tek-secim testi kanitladi: filtresiz sorgu ayni capta
      //      TEK aday buluyor → fiyat geliyor.
      //  (2) Tek aday olsa bile kendi ayirt edici cins/baglantisi FARKLI ise
      //      (C5: istenen "Kirmizi Boyali", capta yalniz "Disli") → FARKLI
      //      urundur; sessiz ikame YASAK → variantMissing, kullanici secer.
      // Coklu adayda da (gercek belirsizlik) 'ask' korunur.
      if (rows.length === 1) {
        // boy: de catisma sayilir — farkli uzunluk FARKLI urundur (fiyati
        // orantili degisir); sessiz ikame yasak, kullanici secer.
        // Catisma karsilastirmasi da TOLERANSLI (varyantTagEsit): yazim
        // kaymasi gercek catisma DEGILDIR.
        const candTags = urunVariantTags(rows[0]);
        const conflict = candTags.some(
          (t) => (t.startsWith('cins:') || t.startsWith('bag:') || t.startsWith('boy:'))
            && !v.some((vt) => varyantTagEsit(vt, t)),
        );
        if (!conflict) {
          return capsizAutoYasak(rows[0])
            ? capsizOnay(rows[0])
            : { kind: 'auto-variant', row: rows[0], donusum };
        }
      }
      return { kind: 'ask', askColumn: ayrisanKolon(rows), rows, bilinmeyen, donusum, variantMissing: true };
    }
    rows = eslesen;
  }

  // ── E2 BIRIM CELISKISI (I9): metre birimli satir EKIPMAN ailesine ──
  // indiyse otomatik yazim KAPANIR — tek aday bile ONAY listesine gider.
  // ("sprinkler hattı" ≠ "sprinkler": metre birimli satir boru istiyordur.)
  const unitConflict =
    line.unitSignal === 'pipe' && familySlug && EQUIPMENT_TYPE_TAGS.has(familySlug)
      ? `Birim (${line.unit}) ekipman ailesiyle çelişiyor`
      : null;

  // ── R1b YUZEY CELISKISI: tek aday CAKISAN taban tasiyorsa yazilmaz ─
  // (v1'in surfaceConflict kurali): markada yalniz galvanizli varken sprink
  // hattina (siyah beklenir) fiyat OTOMATIK yazilmaz — 1 secenekli onay
  // listesi sunulur, secim kullanicinin.
  const surfaceConflict =
    opts?.hintBases?.length && rows.length === 1 && tabanSirasi(rows[0], opts.hintBases) === 2
      ? `Tek aday sözlük beklentisiyle (${opts.hintBases.join('/')}) çelişiyor`
      : null;

  // ── S5 MALZEME CELISKISI: tek aday BASKA malzeme tasiyorsa yazilmaz ─
  // surfaceConflict'in birebir ikizi ve AYNI esikte: kapi yalniz CAKISAN
  // malzemede (sira 2) acilir, malzemesi COZULEMEYEN (sira 1) adayda ACILMAZ.
  // Sebep taban kuralindakiyle ayni: etiketsizlik bir kanit degildir, onu
  // celiski saymak binlerce notr urunu gereksiz onaya dusururdu (I6 kapilari
  // gurultuye bogulunca kimse okumaz — kapinin degeri seyrekliginde).
  const malzemeConflict =
    opts?.hintMalzeme?.length && rows.length === 1 && malzemeSirasi(rows[0], opts.hintMalzeme) === 2
      ? `Tek adayın malzemesi (${(rows[0].urun.malzemeler ?? []).join('/')}) beklenenle (${opts.hintMalzeme.join('/')}) çelişiyor`
      : null;

  // ── BORU YUZEY GENISLETMESI — merge (yalniz POPUP acilacaksa) ─────
  // Yazili yuzey havuzu >1 kayda biraktiysa (soru zaten acilacak), yuzey-
  // haric ayni filtreleri gecen diger yuzey varyantlari TERCIH olarak SONA
  // eklenir (yazili yuzey onde, cakisan taban en sonda). rows.length===1
  // ise DOKUNULMAZ — tek eslesme otomatik yazilir (K2). V4 varyant akisi
  // kullanicinin KENDI secimidir — genisletme uygulanmaz (yukarida null'a
  // dusmez ama eslesen daralttiysa rows zaten varyant kumesidir).
  if (yuzeyGenis && rows.length > 1 && !opts?.variantTags?.length) {
    const eldekiler = new Set(rows.map((r) => r.id));
    const ekstra = yuzeyGenis
      .filter((r) => !eldekiler.has(r.id))
      .sort((a, b) => tabanSirasi(a, yaziliTabanlar) - tabanSirasi(b, yaziliTabanlar));
    if (ekstra.length > 0) rows = [...rows, ...ekstra];
  }

  // ── SUPERSET ADLAR — merge (kullanici karari 17.07, yalniz POPUP'ta) ──
  // Tam-ad kilidinin eledigi "...takımı"/"...trim seti" tarzi adlar soru
  // ZATEN acilacaksa listenin SONUNA girer. rows.length===1 ise DOKUNULMAZ
  // (K2: tek tam eslesme otomatik yazilir); V4 varyant akisi kullanicinin
  // KENDI secimidir — genisletme uygulanmaz.
  if (adGenis && rows.length > 1 && !opts?.variantTags?.length) {
    const eldekiler = new Set(rows.map((r) => r.id));
    const ekstra = adGenis.filter((r) => !eldekiler.has(r.id));
    if (ekstra.length > 0) rows = [...rows, ...ekstra];
  }

  // ── Ç/S KAPILARI: dogrulanamayan eslesme fiyat YAZAMAZ (I6) ───────
  const capsizNotu = capsizDusum && line.capInfo
    ? `Satır çaplı (${line.capInfo.display}) ama ürünün çapı doğrulanamadı`
    : null;
  // S4: capsiz istisnasindan gecen adayin ailesi de dogrulanmamissa (yalniz
  // kategori basligindan turedi) kapi AYRICA acilir — capsizNotu'ndan daha
  // AGIR bir cekincedir, bu yuzden uyariNot zincirinde ondan ONCE gelir.
  const aileZayifNotu = capsizAileZayif
    ? 'Ürünün ailesi yalnız kategori başlığından türedi ve çapı da doğrulanamadı — kontrol edin'
    : null;
  const gevsetmeNotu = adGevsetildi
    ? 'Ad birebir eşleşmedi — yazılı nitelik üzerinden bulundu'
    : null;
  // ── I6 KAPISI DARALTILDI (kullanici karari 18.07 — Trakya "Dişli" vakasi)
  // Eski kural: dogrulanamayan HERHANGI kelime varken tek aday otomatik
  // YAZILMIYORDU. Ama "Dişli" gibi BAGLANTI TANIMLAYICILARI (Trakya dovme
  // fittinglerde baglanti kolonu bos — hicbir urun deklare etmez, yani
  // AYIRT EDICI DEGIL) gereksiz onay uretiyordu.
  // Yeni kural: dogrulanamayan kelime YALNIZ guvenli BAGLANTI tanimlayicisi
  // ise (dişli/kaynaklı/yivli...) tek adayi ENGELLEMEZ → otomatik yazilir.
  // KRITIK kelimeler (akiskan dogalgaz/buhar, K-faktoru, 'sprink', 'pp',
  // tip farki...) AYIRT EDICIDIR → yazimi YINE engeller (yanlis urun riski;
  // ornek: K:22 nozul ≠ K:33 — yangin guvenligi). Akiskan icin ozel mesaj.
  // NOT: capsizNotu / aileNotu kapilari BAGIMSIZ durur → 373K korumasi yerinde.
  const GUVENLI_TANIMLAYICI = new Set([
    'disli', 'kaynakli', 'vidali', 'flansli', 'yivli', 'soketli', 'presli',
    'rakorlu', 'gecmeli', 'mansonlu', 'lehimli', 'kaplinli', 'uclu', 'duz', 'dizayn',
  ]);
  const engelleyen = bilinmeyen.filter((t) => !GUVENLI_TANIMLAYICI.has(t));
  const akiskanVar = engelleyen.some((t) => extractFluid(t) !== null);
  const bilinmeyenNotu = engelleyen.length > 0
    ? (akiskanVar
        ? `Akışkan bilgisi doğrulanamadı ("${engelleyen.join(' ')}") — kontrol edin`
        : `"${engelleyen.join(' ')}" doğrulanamadı`)
    : null;
  // H6: aile HIC cozulmemisken tek aday = yalniz olcu benzerligi = TAHMIN.
  const aileNotu = !familySlug
    ? 'Ürün ailesi belirlenemedi — eşleşme yalnız ölçüyle bulundu'
    : null;

  // ── I6 KAPILARININ YAPISAL LISTESI (S3) ──────────────────────────
  // uyariNot metni yukaridaki ?? zincirinden TEK bir cumle secer; asagidaki
  // liste ise ATESLEYEN TUM kapilari tasir. Metni regex'le ayristirmak
  // kirilgan olurdu (metin kullaniciya ait, degisir) — kapi kimligi
  // sozlesmedir, ../types.ts KanitKapisi'nde tanimlidir.
  const kapilar: KanitKapisi[] = [];
  if (yuzeyCeliskiNotu) kapilar.push('yuzey-celiskisi');
  if (unitConflict) kapilar.push('birim-celiskisi');
  if (surfaceConflict) kapilar.push('taban-celiskisi');
  if (malzemeConflict) kapilar.push('malzeme-celiskisi');
  if (aileZayifNotu) kapilar.push('aile-zayif');
  if (capsizNotu) kapilar.push('capsiz-dusum');
  if (gevsetmeNotu) kapilar.push('ad-gevsetildi');
  if (bilinmeyenNotu) kapilar.push('bilinmeyen-kelime');
  if (aileNotu) kapilar.push('aile-yok');

  // ── SONUC: UC YOL, DORDUNCU YOK ──────────────────────────────────
  if (rows.length === 1) {
    const celiski = yuzeyCeliskiNotu ?? unitConflict ?? malzemeConflict ?? surfaceConflict ?? aileZayifNotu ?? capsizNotu ?? gevsetmeNotu ?? bilinmeyenNotu ?? aileNotu;
    if (celiski) {
      return { kind: 'ask', askColumn: ayrisanKolon(rows), rows, bilinmeyen, donusum, uyariNot: celiski, kapilar };
    }
    return { kind: 'single', row: rows[0], donusum };
  }
  return { kind: 'ask', askColumn: ayrisanKolon(rows), rows, bilinmeyen, donusum, uyariNot: yuzeyCeliskiNotu ?? unitConflict ?? aileZayifNotu ?? capsizNotu ?? gevsetmeNotu ?? undefined, kapilar };
}

/**
 * Birim kanonik sinifi (ISCILIK L6): mt/m/metre → 'metre', ad/adet → 'adet',
 * tk/takim/set → 'takim'. Taninmayan/bos birim null doner — ELENMEZ
 * (kanit yok, suclama yok; PRD yalniz ACIK celiskiyi yasaklar).
 */
export function birimKanonik(u: string | null | undefined): string | null {
  const s = (u ?? '').trim().toLocaleLowerCase('tr');
  if (!s) return null;
  if (/^(mt|m|mtul|mtül|metre|meter)\.?$/.test(s)) return 'metre';
  if (/^(ad|adet|pcs|pc|piece)\.?$/.test(s)) return 'adet';
  if (/^(tk|takim|takım|set)\.?$/.test(s)) return 'takim';
  return null;
}

/**
 * Urunun varyant kimligi (FE icin OPAK — round-trip eder).
 * CAP DAHIL DEGIL: varyant grup ici farkli caplara YAYILIR; capi dahil
 * edersek yayilim kirilir (v1'de de isVariantTag len-'i disliyordu, ayni ders).
 */
export function urunVariantTags(r: IndexedRow): string[] {
  const out: string[] = [`ad:${r.urun.adBucket}`];
  if (r.urun.cinsNorm) out.push(`cins:${r.urun.cinsNorm}`);
  if (r.urun.baglantiNorm) out.push(`bag:${r.urun.baglantiNorm}`);
  // BOY DAHIL (canli bulgu 19.07, HAKAN "SESSIZ TIP ATIK SU BORUSU"): boru
  // aileleri her capta BIRDEN COK BOYDA satilir (150/250/500/1000/3000 mm).
  // Kullanici kaynakta "500 mm" secip surukleyince boy tasinmiyordu → hedef
  // capta boylar ayrisamiyor, hep soru aciliyordu ("otomatik atama yapmiyor",
  // loglar: her hedef "0/1 yazildi, 1 soru"). Boy varyant kimligine girince
  // ayni boy hedef capta tek adaya iner → otomatik yazilir. Boysuz urunlerde
  // tag hic uretilmez — davranis degismez. (CAP hala DAHIL DEGIL — yayilim.)
  if (r.urun.boyMm) out.push(`boy:${r.urun.boyMm}`);
  return out;
}

/**
 * VS (25.08) — VARYANT TAG KARSILASTIRMASI, TOLERANSLI.
 *
 * Eski kural TAM-DIZGI esitligiydi (Array.includes) ve iki olculen sinifta
 * suruklemeyi TOPTAN kiriyordu (probe matrisi M2b/M3, canli PILSA vakasi):
 *  1. YAZIM KAYMASI: ayni listede cins bir satirda 'PN25', digerinde 'PN 25'
 *     yazilmis — anlam ayni, tag farkli → tum grup variantMissing (pembe).
 *  2. ADA GOMULU OLCU: satici adi "PP Küresel Vana 20 mm" gibi boyut icerir;
 *     'ad:' tag'i kaynak captan hedefe ASLA tasinamaz. Boru listeleri adlari
 *     capsiz yazdigi icin bu yalniz boru-DISI ailelerde gorunuyordu —
 *     kullanicinin "boru harici calismiyor" bildirimiyle birebir.
 *
 * Tolerans DAR ve eksene gore ayrik:
 *  - 'ad' ekseni: olcu ifadeleri ('20 mm', '1/2"', 'dn25', 'ø63') kimlikten
 *    DUSER — cap zaten ayri SERT filtredir, adin icindeki kopyasi kimlik
 *    sayilmaz. Ciplak sayi DUSMEZ ('Omega 3' gibi model adlari kimliktir).
 *  - 'cins'/'bag' ekseni: yalniz bosluk-duyarsiz karsilastirma. Olcu
 *    SOYULMAZ — '19 mm kalinlik' ile '9 mm kalinlik' FARKLI urunlerdir
 *    (izolasyon kalinligi cins kimligidir); bosluksuz halleri de farklidir,
 *    yanlis esleme dogmaz.
 *  - 'boy' ekseni: sayisal — yalniz tam esitlik (yukaridaki hizli yol).
 */
const AD_OLCU_IFADESI =
  /\b\d+\s+\d+\/\d+\s*(?:"|inc\b|inch\b)?|\b\d+\/\d+\s*(?:"|inc\b|inch\b)?|\b\d+(?:[.,]\d+)?\s*(?:mm|cm|"|inc\b|inch\b)|\bdn\s*\d+\b|\bø\s*\d+\b|\bq\s*\d+\b/g;

export function varyantTagEsit(a: string, b: string): boolean {
  if (a === b) return true;
  const ia = a.indexOf(':');
  const ib = b.indexOf(':');
  if (ia < 0 || ib < 0) return false;
  const eksen = a.slice(0, ia);
  if (eksen !== b.slice(0, ib)) return false;
  if (eksen === 'boy') return false; // sayisal — tam esitlik yukarida denendi
  let da = a.slice(ia + 1);
  let db = b.slice(ib + 1);
  if (eksen === 'ad') {
    da = da.replace(AD_OLCU_IFADESI, ' ');
    db = db.replace(AD_OLCU_IFADESI, ' ');
  }
  const kanon = (s: string) => s.replace(/\s+/g, '');
  const ka = kanon(da);
  if (ka.length === 0) return false; // olcu soyulunca ad bos kaldi — kimlik yok
  return ka === kanon(db);
}

/**
 * KANIT BARAJI — "bu sonuc, ekranda TEK SATIRLIK BIR IDDIA olarak sunulacak
 * kadar guclu mu?"
 *
 * S3'te (06.08) capraz-marka oneri kutusu icin yazildi ve o zaman da tek yere
 * alinmisti: "findAlternativesV2 ve findLaborAlternativesV2 IKIZDIR; bu kural
 * ikisinde de birebir ayni olmak zorunda". S6 (aile uyusmazligi teshisi)
 * UCUNCU cagirandir — ayni soruyu soruyor, o yuzden ayni baraji kullanir.
 * Kural buraya (saf katmana) tasindi; `caprazAdaySec` artik bunun uzerine
 * kurulu ince bir sarmalayici.
 *
 * KABUL: 'single' · 'ask' + TEK aday.
 * RET  : birden cok aday · ailesi ZAYIF aday (yalniz kategori basligindan
 *        turemis) · kimligi dogrulanmamis aday ('capsiz-dusum' = capi
 *        dogrulanmadi, 'ad-gevsetildi' = adi dogrulanmadi).
 * Bu ikisi adayin KIMLIGINE dokunur ("bu urun O urun mu?" cevapsiz);
 * digerleri ('bilinmeyen-kelime', 'malzeme-celiskisi'...) adayin EK
 * niteligini belirsiz birakir, kimligini degil — cekince TASINIR, elenmez.
 */
export function guclutekAday(
  outcome: QueryOutcome,
): { row: IndexedRow; uyariNot?: string; bilinmeyen?: string[]; kapilar?: KanitKapisi[] } | null {
  const aday = outcome.kind === 'single' ? outcome.row
    : outcome.kind === 'ask' && outcome.rows.length === 1 ? outcome.rows[0] : null;
  if (!aday) return null;
  if (aday.urun.aileZayif) return null;
  if (outcome.kind === 'single') return { row: outcome.row };
  if (outcome.kind !== 'ask') return null;
  const ZAYIF: KanitKapisi[] = ['capsiz-dusum', 'ad-gevsetildi'];
  if ((outcome.kapilar ?? []).some((k) => ZAYIF.includes(k))) return null;
  return {
    row: outcome.rows[0],
    uyariNot: outcome.uyariNot,
    bilinmeyen: outcome.bilinmeyen?.length ? outcome.bilinmeyen : undefined,
    kapilar: outcome.kapilar,
  };
}

/**
 * S6 (06.08) — AILE UYUSMAZLIGI TESHISI. "Bu markada yok" mu, yoksa
 * "aileler anlasamadi" mi?
 *
 * ── NEDEN VAR ────────────────────────────────────────────────────────────
 * NORM KELEPÇE vakasi: satir "Sprinkler Boru Askisi, DN150" icindeki "Boru"
 * yuzunden 'boru' ailesine cozuluyor, urunler 'kelepce' ailesinde kaliyordu.
 * Aile SERT KILIT oldugu icin sonuc `none/ad-yok` — ve bu, markanin o urunu
 * GERCEKTEN tasimadigi durumla BIT BIT AYNI gorunuyordu. Ekrandaki cumle
 * `Bu markada "boru" bulunamadi.` idi: motorun kendi urettigi slug, kullanici
 * icin anlamsiz. Tespit bir oturum surdu.
 *
 * Kok mesele su: aile, IKI BAGIMSIZ METNIN (kutuphanedeki urun adi + teklif
 * satiri) bulusmak zorunda oldugu ortak kelime dagarcigidir. Kullanicilar
 * kendi kutuphanelerine kendi adlarini yazdikca bu iki metin AYRI kelimelerle
 * ayni seyi anlatir ve kilit sessizce yanlis kapanir. Sozluge kayit eklemek
 * bilinen vakalari kapatir, SINIFI kapatmaz — kullanicinin yarin uyduracagi
 * adi tahmin edemeyiz. Kapatilan sey su: BOS SONUC ARTIK SESSIZ DEGIL.
 *
 * ── NE YAPAR ─────────────────────────────────────────────────────────────
 * Sonuc ZATEN `none/ad-yok` ise (yani normal yol bitti, kaybedecek bir sey
 * yok) ayni sorguyu YALNIZ aile kilidi kapali olarak bir kez daha kosar.
 * Diger TUM kilitler (cap, sinif, yuzey, baglanti, birim, malzeme) aynen
 * calisir — yani hayatta kalan aday "aile disinda HER SEYI tutan" adaydir.
 *
 * ── NE YAPMAZ ────────────────────────────────────────────────────────────
 * ⛔ Aile kilidini GEVSETMEZ. Bir kompansator satirina vana yine aday olamaz;
 *    teshisin bulduğu aday KESIN degildir, `ask`e duser, fiyat OTOMATIK
 *    YAZILMAZ. Kullanici onaylamadan hicbir sey degismez.
 * ⛔ Aile ZATEN cozulememisse (familySlug yok) calismaz — ortada uyusmazlik
 *    kavrami yoktur, ikinci gecis birinciyle ayni sorgudur.
 *
 * ── S7 (24.08, URUN KARARI — coklu aday artik SUSMAZ) ────────────────────
 * Ilk surum COKLU adayda bilerek susuyordu ("belki bunlardan biridir demek
 * tahmin uretme hastaligi olurdu"). SAHA bunun tersini gosterdi: her YENI
 * yuklenen listede satici kendi yazimini kullaniyor (canli 24.08: teklif
 * "Kauçuk İzolasyon", listede "Elastomerik kauçuk köpüğü boru") ve sozluk
 * o yazimi tanıyana kadar kullanici SIFIR sonuc goruyor — sozluge desen
 * eklemek vakayi kapatir, SINIFI kapatmaz. Urun sahibi karari: bos ekran
 * yerine "yazilan kelimelerle eslesen EN YAKIN adaylar" SIRALI SORU olarak
 * gelsin (arama motoru hunisi) — secim yine kullanicinin, secim hafizaya
 * yazilir, ikinci karsilasmada otomatiklesir.
 * FIYAT YAZMA YASAGI DEGISMEDI: coklu liste `ask`tir, netPrice 0 kalir.
 * GURULTU FRENLERI: satirin aile-disi AD kelimesini PAYLASMAYAN aday girmez
 * (K8 — Kalorimetre→Yangin Hortumu gurultusu), ailesi zayif aday girmez,
 * kimligi dogrulanmamis kume ('capsiz-dusum'/'ad-gevsetildi') hic acilmaz,
 * liste kanit sayisina gore sirali ve en fazla 12 kayittir.
 *
 * SAF: runQuery gibi DB'siz. Cagiran: matching.service (malzeme + iscilik).
 */
export function aileUyusmazligiTeshisi(
  line: LineQuery,
  pool: IndexedRow[],
  opts: QueryOpts | undefined,
  sonuc: QueryOutcome,
): QueryOutcome {
  if (sonuc.kind !== 'none' || sonuc.reason !== 'ad-yok') return sonuc;
  if (opts?.aileKilidiKapali) return sonuc; // teshis gecisinin kendisi
  const aile = line.familySlug ?? opts?.hintFamily ?? null;
  if (!aile) return sonuc;

  const kor = runQuery(line, pool, { ...opts, aileKilidiKapali: true });

  // ── K8'IN TESHISE UYGULANMASI (olculerek eklendi) ────────────────────────
  // Ilk surumde bu kapi YOKTU ve gurultu uretti: "Kalorimetre, DN65" satiri,
  // yalniz yangin hortumu satan bir markada "Yangın Hortumu DN65"i aday
  // gosteriyordu. Sebep: satirin TEK ad kelimesi ('kalorimetre') ailenin
  // kendi adi oldugu icin muaf sayiliyor, geriye HIC ad kisiti kalmiyor ve
  // eslesme SALT CAPA dayaniyordu. Motorun K8 kurali bunu zaten yasaklar:
  // "satirin ad-icereginden HICBIR kelime eslesmiyorsa tum aileyi listelemek
  // K6/K8 ihlalidir" (bkz. yukarisi, satir ~238). Ayni kural burada da gecerli.
  //
  // ⚠ 'aile-yok' KAPISINA BAKMAK ISE ISE YARAMAZ — olculdu: kor gecişte
  // familySlug daima null oldugu icin o kapi UC vakada da yaniyordu
  // (A1/A2 dogru vakalar dahil). Ayirt edici olan kapi degil, PAYLASILAN
  // AD KELIMESIDIR.
  const aileKelimesi = (t: string) => line.aileKelimeleri.some((a) => tokenEsit(a, t));
  // ⚠ ignoreTokens da DUSER (hakem bulgusu 24.08, olculdu): sozlugun yuttugu
  // alias kelimeleri ('temiz su' → 'su') runQuery'de bilerek kisit-disi
  // birakilir (:66-68); burada kanit sayilsalardi "Temiz Su Borusu" satiri
  // borusuz markada 'su' kelimesi uzerinden "Su Sayacı"yi aday gosterirdi —
  // listenin tek dayanagi sozluk-gurultusu bir kelime olurdu.
  const satirAdi = line.tokens.filter(
    (t) => !aileKelimesi(t) && !(opts?.ignoreTokens ?? []).some((ig) => tokenEsit(ig, t)),
  );
  // NOT: "satirAdi bos → sus" diye AYRI bir kapi YOK (bilerek): tekli yolda
  // `paylasilan`, coklu yolda adaylar suzgecinin some(satirAdi) kosulu bos
  // kumede zaten false doner — ayri kapi olu kod olurdu (mutasyonla olculdu).
  // 'aile-yok' kapisi kor'dan AYIKLANIR: kor gecisinde familySlug yapay
  // olarak null'du, oysa satirin ailesi ASLINDA cozuldu (aile degiskeni) —
  // ayni ciktida hem "aile cozulemedi" hem "aileler uyusmuyor" demek
  // sozlesme celiskisi olurdu (kapi kimligi sozlesmedir, types.ts).
  const korKapilari = (kor.kind === 'ask' ? kor.kapilar ?? [] : []).filter((k) => k !== 'aile-yok');

  const guclu = guclutekAday(kor);
  if (guclu) {
    const paylasilan = satirAdi.some((t) => guclu.row.urun.adTokens.some((x) => tokenEsit(t, x)));
    if (!paylasilan) return sonuc;

    // Aday AYNI ailedeyse bu bir uyusmazlik degildir (ikinci gecis baska bir
    // sebeple kurtarmis olabilir) — teshis yalniz AILE eksenini iddia eder.
    const adayAile = guclu.row.urun.adSlug;
    if (adayAile === aile) return sonuc;

    return {
      kind: 'ask',
      askColumn: 'urun',
      rows: [guclu.row],
      donusum: kor.kind === 'ask' || kor.kind === 'single' ? kor.donusum : undefined,
      bilinmeyen: guclu.bilinmeyen,
      // Metin "onaylayın" ile BITMEZ: outcome-mapper zaten
      // `${uyariNot} — onaylayın. ...` diye sariyor (ask dali).
      uyariNot: `Satırın ürün ailesi "${aile}", adayın ailesi "${adayAile}"; aynı ürün olabilir`,
      kapilar: [...(guclu.kapilar ?? []).filter((k) => k !== 'aile-yok'), 'aile-uyusmazligi'],
    };
  }

  // ── S7 (24.08, URUN KARARI) — COKLU ADAYDA SIRALI SORU ──────────────────
  // Ikinci gecis birden cok aday buldugunda eski surum bilerek susuyordu;
  // urun sahibi bunu tersine cevirdi (gerekce: dosya basi docstring §S7).
  // Frenler:
  //   • kimligi dogrulanmamis KUME hic acilmaz ('capsiz-dusum' = cap
  //     dogrulanamadi, 'ad-gevsetildi' = ad dogrulanamadi — guclutekAday'in
  //     ZAYIF baraji birebir): iki tahmin ust uste binmez;
  //   • ailesi ZAYIF aday (yalniz kategori basligindan turemis) girmez;
  //   • ayni-aile adayi girmez (uyusmazlik iddiasi ancak BASKA aile icin
  //     kurulabilir; ayni ailenin elenme sebebi zaten baska bir kilittir);
  //   • satirin aile-disi AD kelimesini PAYLASMAYAN aday girmez (K8);
  //   • liste KANIT SAYISINA gore sirali (cok kelime paylasan one; esitlikte
  //     kor sirasi — deterministik, D3) ve en fazla KESIT kayittir.
  if (kor.kind !== 'ask' || kor.rows.length < 2) return sonuc;
  const ZAYIF_KUME: KanitKapisi[] = ['capsiz-dusum', 'ad-gevsetildi'];
  if (korKapilari.some((k) => ZAYIF_KUME.includes(k))) return sonuc;

  // GIRIS kaniti = kimlik kelimesi AD ya da CINS kolonunda (hakem bulgusu:
  // S7'nin motive vakasi tam da kimligi CINS'e yazan satici yazimidir —
  // ad='Yalıtım', cins='elastomerik kauçuk levha' gibi. Yalniz-ad giris o
  // adayi disarida birakip listeyi dogru cevapSIZ gurultuya cevirirdi).
  // Gurultu freni girisin daralmasi degil, satirAdi'nin temizligidir
  // (aile kelimeleri + sozluk alias kelimeleri dusuruldu, yukarisi).
  const kanit = (r: IndexedRow) =>
    satirAdi.filter((t) =>
      r.urun.adTokens.some((x) => tokenEsit(t, x)) || r.urun.cinsTokens.some((x) => tokenEsit(t, x)),
    ).length;
  const adaylar = kor.rows.filter((r) =>
    !r.urun.aileZayif &&
    r.urun.adSlug !== aile &&
    kanit(r) > 0,
  );
  if (adaylar.length === 0) return sonuc;

  const KESIT = 12;
  const rows = adaylar
    .map((r, i) => ({ r, i, k: kanit(r) }))
    .sort((a, b) => (b.k - a.k) || (a.i - b.i))
    .slice(0, KESIT)
    .map((x) => x.r);
  const aileler = Array.from(new Set(rows.map((r) => r.urun.adSlug)));
  // Kesit tasarsa SOYLENIR (sessiz eksiltme yasagi, I7'nin kucuk kardesi);
  // kor'un kendi pool-notu (orn. yuzey-celiskisi sorusu) da EZILMEZ, eklenir.
  const kesitNotu = adaylar.length > rows.length ? ` (ilk ${rows.length}/${adaylar.length})` : '';
  const korNotu = kor.uyariNot ? ` · ${kor.uyariNot}` : '';

  return {
    kind: 'ask',
    askColumn: ayrisanKolon(rows),
    rows,
    donusum: kor.donusum,
    bilinmeyen: kor.bilinmeyen,
    uyariNot: `Satırın ürün ailesi "${aile}" bu markada bulunamadı — yazılan kelimelerle eşleşen en yakın adaylar sıralandı${kesitNotu} (${aileler.slice(0, 3).join(', ')})${korNotu}`,
    kapilar: [...korKapilari, 'aile-uyusmazligi'],
  };
}
