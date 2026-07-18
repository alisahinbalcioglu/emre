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

import { sizeEquivalents, SizeClass } from '../conversion';
import { extractFluid } from '../normalizer';
import { altKumeMi, tokenEsit } from './product-index';
import { EQUIPMENT_TYPE_TAGS } from '../shared-tag-matcher';
import { buildFamilyVocab, distinctSayisi } from './vocab';
import { classifyTokens, resolveLineFamily } from './line-parser';
import type { IndexedRow, LineQuery, QueryOutcome, QueryOpts, AskColumn } from './types';

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
  const familySlug = line.familySlug ?? opts?.hintFamily ?? null;
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
  if (yol.ad.length === 0 && bilinmeyen.length > 0) {
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
        const d2 = aileHavuzu.filter((r) => altKume(diger, r.urun.cinsTokens));
        if (d2.length > 0) { rows = d2; adGevsetildi = true; }
        else return { kind: 'none', reason: 'kriter-yok', detail: diger.join(' ') };
      }
    }
    if (yuzeyler.length) {
      if (adGenis) adGenis = adGenis.filter((r) => altKume(yuzeyler, r.urun.cinsTokens));
      const d = rows.filter((r) => altKume(yuzeyler, r.urun.cinsTokens));
      if (d.length > 0) {
        if (familySlug === 'boru') yuzeyGenis = rows; // yuzey uygulanmamis kume
        yaziliTabanlar = ['siyah', 'galvaniz'].filter((b) => yuzeyler.some((t) => tokenEsit(b, t)));
        rows = d;
      } else return { kind: 'none', reason: 'kriter-yok', detail: yuzeyler.join(' ') };
    }
  }
  if (yol.baglanti.length) {
    if (adGenis) adGenis = adGenis.filter((r) => altKume(yol.baglanti, r.urun.baglantiTokens));
    const d = rows.filter((r) => altKume(yol.baglanti, r.urun.baglantiTokens));
    if (d.length > 0) rows = d;
    else {
      // Ad-gevsetme baglanti icin de simetrik (ayni hastalik, ayni ilac)
      const d2 = aileHavuzu.filter((r) => altKume(yol.baglanti, r.urun.baglantiTokens));
      if (d2.length > 0) { rows = d2; adGevsetildi = true; }
      else return { kind: 'none', reason: 'kriter-yok', detail: yol.baglanti.join(' ') };
    }
    if (yuzeyGenis) yuzeyGenis = yuzeyGenis.filter((r) => altKume(yol.baglanti, r.urun.baglantiTokens));
  }
  if (rows.length === 0) return { kind: 'none', reason: 'ad-yok' };

  // ── 2. CAP — SERT ────────────────────────────────────────────────
  // Esdegerlik INDEKSTE on-hesapli (capTags): teklifteki 2" ile kutuphanedeki
  // DN50 burada bulusur, sorgu aninda cevrim TABLOSU aranmaz.
  let donusum: string | null = null;
  let capsizDusum = false;
  if (line.capInfo) {
    const cls = resolveLineClass(rows, opts?.sizeClassHint);
    const equiv = sizeEquivalents(cls, line.capInfo);
    donusum = equiv.rozet;
    if (equiv.tags.length) {
      const capUyar = (r: IndexedRow) => r.urun.capTags.some((t) => equiv.tags.includes(t));
      const d = rows.filter(capUyar);
      // Capsiz ekipman (E1/H3): urunun capi yoksa cap filtresi ELEMEZ —
      // "kompansator 40cm hortum" gibi satirlarda cap satira degil urune ait
      // olmayabilir. Capi OLAN urunler arasinda ise filtre serttir.
      // ⚠ Ç-vakasi (16.07): bu istisnadan gecen TEK aday otomatik YAZILMAZ
      // (capsizDusum kapisi) — "Yiv açma makinesi" 373.825 TL sprink hattina
      // yazilmisti: cap dogrulanamadi = tahmin, tahmin fiyat yazamaz (I6).
      const capsiz = rows.filter((r) => r.urun.capTags.length === 0);
      if (d.length > 0 || capsiz.length === 0) {
        rows = d;
      } else {
        rows = capsiz;
        capsizDusum = true;
      }
      if (rows.length === 0) return { kind: 'none', reason: 'cap-yok', detail: line.capInfo.display, donusum };
      if (yuzeyGenis) yuzeyGenis = yuzeyGenis.filter(capUyar); // genis kume de AYNI capta
      // Superset adlar da AYNI capta (capsiz kayit gecer — takim/set capsiz olabilir)
      if (adGenis) adGenis = adGenis.filter((r) => capUyar(r) || r.urun.capTags.length === 0);
    }
  }

  // ── 5. YAZILI BOY — SERT ─────────────────────────────────────────
  if (line.boyTag) {
    const d = rows.filter((r) => r.urun.boyTag === line.boyTag);
    if (d.length > 0) rows = d;
    if (yuzeyGenis) yuzeyGenis = yuzeyGenis.filter((r) => r.urun.boyTag === line.boyTag || !r.urun.boyTag);
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

  // ── 6. V4 GRUP VARYANTI — kullanicinin KENDI secimi ──────────────
  // R16 dersi: kullanici sinyali marka/skor sinyalinden ONCE uygulanir.
  // (v2'de zaten marka tie-break YOK — marka artik stok kapsami.)
  if (opts?.variantTags?.length) {
    const v = opts.variantTags;
    const eslesen = rows.filter((r) => v.every((t) => urunVariantTags(r).includes(t)));
    if (eslesen.length === 1) return { kind: 'auto-variant', row: eslesen[0], donusum };
    if (eslesen.length === 0) {
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

  // ── SONUC: UC YOL, DORDUNCU YOK ──────────────────────────────────
  if (rows.length === 1) {
    const celiski = unitConflict ?? surfaceConflict ?? capsizNotu ?? gevsetmeNotu ?? bilinmeyenNotu ?? aileNotu;
    if (celiski) {
      return { kind: 'ask', askColumn: ayrisanKolon(rows), rows, bilinmeyen, donusum, uyariNot: celiski };
    }
    return { kind: 'single', row: rows[0], donusum };
  }
  return { kind: 'ask', askColumn: ayrisanKolon(rows), rows, bilinmeyen, donusum, uyariNot: unitConflict ?? capsizNotu ?? gevsetmeNotu ?? undefined };
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
  return out;
}
