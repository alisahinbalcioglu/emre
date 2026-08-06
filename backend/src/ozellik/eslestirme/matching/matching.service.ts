// ════════════════════════════════════════════════════════════════════
// SÖZLEŞME — Z2: FİYAT EŞLEŞTİRME (ARINMA Faz 1, 27.07.2026)
// Girdi:  satır adı (+birim) + marka kütüphane havuzu.
// Çıktı DEĞİŞMEZLERİ (sıra = öncelik):
//  1. AD KİLİDİ: farklı aile ASLA aday olamaz (K1/K6); belirsiz ürün havuza
//     girmez. Sözlük alias'ları KADEMELİ seçilir — gerçek çeviri
//     (impliedType) sınıf-önsezisinden üstün; guard'a takılan atlanır (TS).
//  2. ÇAP SERT filtre: DN ↔ inç ↔ OD-mm tek çevrim modülünden (conversion);
//     çelikte OD serisi ±0,5 mm, plastikte DN=mm (KH4-7). Bilinmeyen çap
//     yayılamaz.
//  3. SONUÇLANDIRMA: tek aday → altın kural fiyat OTOMATİK; ≥2 → soru
//     (kademe: kategori→cins→bağlantı→boy→ürün); 0 → "yok" + M3 alternatif.
//     Fiyat sorulmadan ASLA yazılmaz (multi'de netPrice=0).
//  4. Bayat indeks istek anında INDEX_VERSION'a tazelenir; hafıza ön-seçim
//     çap-bilinçlidir (imza ölçü içerir), otomatik doldurmaz.
//  Mühür: test:index (K/TS/KH) + test:matching (D) + test:spec (R) +
//  test:conversion + test:contract (C1-C10).
// ════════════════════════════════════════════════════════════════════
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { generateTags } from './tag-generator';
import { hesaplaNetFiyat } from '../../fiyat/matching/pricing';
import { extractMaterialKind, extractFluid } from './normalizer';
import { extractSizeInfo } from './conversion';
import { TerminologyService } from './terminology.service';
// TEK MOTOR (Faz 2b): indeksli + Ad-kilitli cekirdek (saf — test:index K1-K7)
import { parseLine } from './index/line-parser';
import { runQuery, guclutekAday, aileUyusmazligiTeshisi } from './index/query-engine';
import { toMatchResult, gorunenAd } from '../../fiyat/matching/index/outcome-mapper';
import { INDEX_VERSION, tokenize, buildProductIndex, rebuildIndexFields, iscilikAdCekirdegi, malzemeEtiketleri } from './index/product-index';
import type { ProductColumns } from './index/product-index';
import type { IndexedRow, LineQuery, QueryOpts, QueryOutcome, KanitKapisi } from './index/types';
import type { AliasHint } from './terminology.service';
import { ExchangeRatesService } from '../../fiyat/exchange-rates/exchange-rates.service';
import type { MatchResult, BrandAlternative } from './types';
import { KIND_TAGS, SURFACE_TAGS, CONNECTION_TAGS } from './shared-tag-matcher';

// NOT (Faz 2b sokum — 17.07): v1 skor motoru (matchSingle zinciri,
// HEADER_HINTS kod-ici sozlugu, marka→sinif cikarimi) kod tabanindan
// SILINDI. Islevsel baslik sozlugu artik TEK yerde yasar: TerminologyAlias
// (DB seed + S4 kullanici ogrenmesi) → matchV2 QueryOpts ipuclari.

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly terminology: TerminologyService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  // ── Z4: teklif-ani kur cevrimi ─────────────────────────────────────
  // Kutuphane fiyatlari ORIJINAL para biriminde saklanir (ice aktarimda
  // cevrim yok). Eslestirme aninda — yani teklif hazirlanirken — USD/EUR
  // fiyatlar o anki TCMB kuruyla TRY tabanina cevrilir; teklif ekraninin
  // gorunum birimi (TL/USD/EUR) bu tabani kendi secimine cevirir.
  // Kur, istek basina EN FAZLA 1 kez cekilir (yalniz doviz satiri varsa).
  private async buildTryConverter(
    rows: { currency?: string | null }[],
  ): Promise<(value: number, currency?: string | null) => number> {
    const needsFx = rows.some((r) => r.currency && r.currency !== 'TRY');
    if (!needsFx) return (v) => v;
    const rates = await this.exchangeRates.getRates();
    const cevirici = ((v: number, currency?: string | null) => {
      if (currency === 'USD') return Math.round(v * rates.usdTry * 100) / 100;
      if (currency === 'EUR') return Math.round(v * rates.eurTry * 100) / 100;
      return v;
    }) as ((value: number, currency?: string | null) => number) & {
      kur?: { usdTry: number; eurTry: number; tarih: string };
    };
    // ── KUR DONMASI (kullanici karari 06.08) ────────────────────────────
    // Cevrimde kullanilan kur metaveri olarak ceviricinin USTUNDE tasinir;
    // outcome-mapper dovizli satirin sonucuna `kaynakKur` yazar, FE satira
    // (`_matKurBilgi`) kaydeder. Boylece TRY tutar zaten donarken (statik
    // JSON) o tutarin HANGI KURLA dogdugu da teklifle birlikte donar.
    cevirici.kur = { usdTry: rates.usdTry, eurTry: rates.eurTry, tarih: rates.date };
    return cevirici;
  }

  // ═══════════════════════════════════════════
  // BULK MATCH — Teklif sirasinda (AI YOK)
  // ═══════════════════════════════════════════

  async bulkMatch(
    userId: string,
    brandId: string,
    materialNames: string[],
    // V4 (PRD v1.3): grup ici otomatik atama — secilen varyantin tag'leri.
    // Doluysa adaylar bu tag'lerin TAMAMINI tasimali; tek kalirsa otomatik
    // atanir (autoVariant), hic kalmazsa variantMissing + fiyatli liste (V4.5).
    variantTags?: string[],
    // E2 (Boru Disi Kalemler PRD): satirin BIRIM'i (metre→boru, adet→ekipman)
    // aile cozumunde sinyal olarak kullanilir; sinyaller celisirse otomatik
    // yazim yerine onay listesi. Opsiyonel — eski istemciler etkilenmez.
    units?: Record<string, string>,
  ): Promise<Record<string, MatchResult>> {
    // ── KUTUPHANEM IZOLASYONU (PRD) ──────────────────────────────────
    // Aday havuzu artik GLOBAL MaterialPrice DEGIL, kullanicinin KENDI
    // kutuphanesi (UserLibrary). Kullanici havuzdan "Kutuphaneme Aktar" ile
    // kopyalar, fiyat/iskontoyu ozgurce degistirir, manuel malzeme ekler —
    // teklif eslestirmesi YALNIZ bu kisisel veriyi okur. Global fallback YOK.
    const libRows = await this.prisma.userLibrary.findMany({
      where: { userId, brandId },
      include: {
        material: {
          select: { id: true, name: true, tags: true, normalizedName: true, materialType: true },
        },
        // FAZ 4: urun indeksi — doluysa v2 (Ad-kilitli) motor devreye girer
        product: true,
      },
    });

    if (libRows.length === 0) {
      console.log(`[Matching] Kutuphane bos: user=${userId}, brand=${brandId}`);
      const empty: Record<string, MatchResult> = {};
      const reason =
        'Kütüphanenizde bu markaya ait malzeme yok. Malzeme Havuzu\'ndan "Kütüphaneme Aktar" ile ekleyin.';
      for (const n of materialNames) {
        if (!n.trim()) continue;
        empty[n] = { netPrice: 0, listPrice: 0, discount: 0, confidence: 'none', reason };
      }
      return empty;
    }

    // Z4: dovizli satirlar teklif aninda TRY tabanina cevrilir.
    const toTry = await this.buildTryConverter(libRows as { currency?: string | null }[]);

    // ══ TEK MOTOR (Faz 2b SOKUM — 17.07): v1 skor motoru SILINDI ══════
    // PRD Bolum 7: fallback YASAK — uc sonuc vardir (yaz / fiyatli sec / yok).
    // Eski "TAMAMI indeksli olmali" sarti kalkti: motor degistirilmez, VERI
    // MOTORA GETIRILIR — indekssiz (manuel/legacy) satir istek aninda
    // indekslenir, bayat indeks istek aninda yeniden uretilir (hazirlaPool).
    const pool = this.hazirlaPool(libRows as any[]);
    console.log(`[Matching] v2 INDEKSLI MOTOR (Ad kilitli): ${pool.length} satir, brand=${brandId}`);
    return this.matchV2(userId, brandId, materialNames, pool, toTry, variantTags, units);
  }

  /**
   * UserLibrary satiri → IndexedRow (v2 havuzu). UC DURUM:
   *  1. Guncel indeks → oldugu gibi kullanilir.
   *  2. BAYAT indeks → istek aninda CANLI tokenizer'la yeniden uretilir
   *     (rebuildIndexFields) — 15.07 vakasindaki "sessiz yanlis cevap"
   *     yapisal olarak imkansizlasir; kalici cozum icin reindex onerilir.
   *  3. Indeks YOK (manuel/legacy satir) → istek aninda indekslenir.
   *     Manuel satir SERBEST METINDIR: cap kolonu yoksa metinden cikarilir
   *     (extractSizeInfo) — Karar #1'in "kolondan oku" kurali urun tablosu
   *     icindir; kaynagi zaten kolonsuz olan satirda satir-tarzi cikarim
   *     mesrudur (aksi halde capsiz kalir, Ç-kapisi hep onay isterdi).
   */
  private hazirlaPool(libRows: any[]): IndexedRow[] {
    let bayatSayisi = 0;
    let indekssizSayisi = 0;
    const pool: IndexedRow[] = libRows.map((li) => {
      let urun: IndexedRow['urun'];
      if (li.productIndexId && li.product) {
        if ((li.product.indexVersion ?? 1) !== INDEX_VERSION) {
          bayatSayisi++;
          const cols: ProductColumns = {
            kategori: li.product.kategori, ad: li.product.ad, cins: li.product.cins,
            baglanti: li.product.baglanti, cap: li.product.capRaw, boy: li.product.boyMm,
            birim: li.product.birim, price: li.product.price, paraBirimi: li.product.currency,
            urunKodu: li.product.urunKodu, not: li.product.not, sheetName: li.product.sheetName,
          };
          urun = { ...li.product, ...rebuildIndexFields(cols, { adSlug: li.product.adSlug, belirsiz: li.product.belirsiz }) };
        } else {
          urun = li.product;
        }
      } else {
        indekssizSayisi++;
        const name: string = li.material?.name ?? li.materialName ?? '';
        urun = this.manuelUrunIndeksle({
          name,
          price: li.listPrice ?? 0,
          capKolonu: li.cap ?? null,
          kategori: li.kategori ?? null,
          cins: li.cins ?? null,
          birim: li.unit ?? null,
        });
      }
      return {
        id: li.id,
        listPrice: li.listPrice ?? urun.price,
        customPrice: li.customPrice ?? null,
        discountRate: li.discountRate ?? 0,
        currency: li.currency ?? 'TRY',
        urun,
      };
    });
    if (bayatSayisi > 0) {
      console.warn(`[Matching] ⚠ BAYAT INDEKS: ${bayatSayisi} satir istek aninda yeniden uretildi (v${INDEX_VERSION}). ` +
        `KALICI COZUM: POST /admin/reindex-products (her istekte yeniden hesap = gereksiz yuk).`);
    }
    // ── PK9 (31.07.2026): SESSIZ GERI-DUSUS YASAK ───────────────────────────
    // Acik soru: "istek aninda indeksle geri-dusus yolu TEK BASINA yetmeli mi?"
    // Cevap HAYIR. Geri-dusus KALIR ama SESSIZ KALAMAZ: eksik indeksi sessizce
    // telafi eden bir yol, yanlis/eksik cevabi DOGRUYMUS gibi verir (fallback
    // yasagi + I7 sessiz-bos yasagi). Kanal `log` degil `warn` — duz log
    // uretimde gurultuye karisip goze carpmiyordu.
    if (indekssizSayisi > 0) {
      console.warn(`[Matching] ⚠ INDEKSSIZ SATIR: ${indekssizSayisi}/${libRows.length} satir istek aninda indekslendi `
        + `(manuel/legacy). KALICI COZUM: POST /admin/reindex-products.`);
    }
    // MARKANIN TAMAMI indekssizse bu artik "birkac manuel satir" degil, marka
    // HIC indekslenmemis demektir — CAYIROVA vakasi (116 fiyat satiri, 0
    // ProductIndex) tam buydu ve `test:regression:db` bu yuzden SKIP'te.
    // Motor yine cevap uretir, ama bunu YUKSEK SESLE soyler.
    if (libRows.length > 0 && indekssizSayisi === libRows.length) {
      console.error(`[Matching] ⛔ MARKA INDEKSLENMEMIS: ${libRows.length} kutuphane satirinin TAMAMI indekssiz. `
        + `Sonuclar istek-anindaki manuel cikarima dayanir — urun tablosu kalitesinde DEGILDIR. `
        + `Fiyat listesini yeniden yukleyin veya POST /admin/reindex-products calistirin.`);
    }
    return pool;
  }

  /**
   * MANUEL/LEGACY SATIR → istek aninda indeks (hazirlaPool yol-3).
   * PRD Iscilik L9 (tek indeksleyici): malzeme (UserLibrary manuel satiri)
   * ve iscilik (legacy LaborItem — yalniz ad+birim) AYNI yoldan gecer.
   * Govde hazirlaPool'un eski else-dalindan AYNEN tasindi — davranis
   * DEGISMEDI (test:matching/contract/spec bu yolu zaten kilitliyor).
   */
  private manuelUrunIndeksle(params: {
    name: string;
    price: number;
    /** Kaynakta cap KOLONU varsa metinden olcu soyulmaz (kolon otorite). */
    capKolonu?: string | null;
    kategori?: string | null;
    cins?: string | null;
    birim?: string | null;
    /** ISCILIK: sondaki is kelimesi ('montajı'/'işçiliği'...) AD'den soyulur —
     *  aile MALZEME kismindan cozulur (bkz. iscilikAdCekirdegi). */
    iscilikEki?: boolean;
  }): IndexedRow['urun'] {
    const { name, price } = params;
    const cap = params.capKolonu ?? extractSizeInfo(name)?.display ?? null;
    // AD'den olcu ifadesi SOYULUR: adBucket/adTokens capa kilitlenmesin.
    // Yoksa "...Boru 1\"" ile "...Boru 1 1/4\"" farkli AD sayilir → V4
    // varyant kimligi (ad:bucket) caplar arasi YAYILAMAZ, tam-ad
    // eslesmesi de kacar. Cap zaten cap kolonuna tasindi (yukarida).
    const adTemiz = (params.capKolonu ? name : name
      .replace(/\b(dn|pn|od)\s*-?\d+(?:[.,]\d+)?\b/gi, ' ')
      .replace(/\d+\s+\d+\/\d+\s*(?:"|''|inch|inc\b)?/gi, ' ')
      .replace(/\d+\/\d+\s*(?:"|''|inch|inc\b)?/gi, ' ')
      .replace(/\d+(?:[.,]\d+)?\s*(?:"|''|inch\b|inc\b|mm\b)/gi, ' ')
      .replace(/[øØ]\s*\d+/g, ' ')
      .replace(/\s[-·—]\s/g, ' ') // olcu soyulunca sarkan ayrac artigi
      .replace(/\s{2,}/g, ' ').trim()) || name;
    // ISCILIK: "boru montajı" → aile 'montaj' cozulur, satir 'boru' der →
    // K6 asla eslesmez. Is-eki AD'den dusurulur (gorunen ad cagiranla korunur).
    const adKaynak = params.iscilikEki ? iscilikAdCekirdegi(adTemiz) : adTemiz;
    // MANUEL SATIRI KOLONLARA AYRISTIR: yuzey/cins kelimeleri CINS'e,
    // baglanti sifatlari BAGLANTI'ya tasinir. Yoksa "... Siyah Dişli
    // Manşonlu" gibi adlarda sondaki 'manşonlu' sondan-aile-cozumunu
    // fitting'e kaciriyordu (bas isim ortada kaliyor: 'Borusu').
    const CINS_K = new Set(['siyah', 'galvaniz', 'galvanizli', 'kirmizi', 'boyali', 'celik',
      'paslanmaz', 'pirinc', 'dokum', 'bronz', 'bakir', 'ppr', 'pprc', 'pvc', 'pe', 'pex',
      'hdpe', 'polietilen', 'plastik', 'wafer', 'lug']);
    const BAGLANTI_K = new Set(['disli', 'mansonlu', 'kaynakli', 'flansli', 'yivli',
      'vidali', 'gecmeli', 'rakorlu', 'presli', 'sokedli', 'kaplinli', 'duz', 'uclu']);
    // YALNIZ SONDAN ardisik cins/baglanti kelimeleri soyulur — Turkcede
    // bas isim SONDADIR; ortadan kelime cekmek adi bozar ("Su ve Yangın
    // Tesisat Borusu"nun ortasindan 'yangin' cekilemez). Sondaki sifat
    // kuyrugu ("... - Siyah Dişli Manşonlu") ise aile cozumunu kacirtan
    // gercek gurultudur → kolonlarina tasinir. HAM kelime korunur
    // (displayName Turkce karakteriyle cizilir).
    const parcalar = adKaynak.split(/\s+/).filter(Boolean);
    const cinsK: string[] = []; const bagK: string[] = []; const kuyruk: string[] = [];
    while (parcalar.length > 1) {
      const ham = parcalar[parcalar.length - 1];
      const w = tokenize(ham)[0] ?? '';
      if (!w) { kuyruk.unshift(parcalar.pop()!); continue; } // stopword ('Tip') soymayi KESMEZ
      if (CINS_K.has(w)) cinsK.unshift(parcalar.pop()!);
      else if (BAGLANTI_K.has(w)) bagK.unshift(parcalar.pop()!);
      else break;
    }
    // stopword kuyrugu en yakin kovaya iade ("Lug Tip" → cins 'Lug Tip')
    if (kuyruk.length && cinsK.length) cinsK.push(...kuyruk);
    else if (kuyruk.length && bagK.length) bagK.push(...kuyruk);
    else parcalar.push(...kuyruk);
    const adK = parcalar;
    const idx = buildProductIndex({
      kategori: params.kategori ?? null,
      ad: adK.join(' ') || adKaynak,
      cins: params.cins ?? (cinsK.length ? cinsK.join(' ') : null),
      baglanti: bagK.length ? bagK.join(' ') : null,
      cap,
      birim: params.birim ?? null,
      price,
    });
    return {
      ...idx,
      ad: name, cins: params.cins ?? null, baglanti: null,
      capRaw: cap, boyMm: null, kategori: params.kategori ?? null,
      urunKodu: null, sheetName: null, price,
      // ISCILIK L6: birim sert filtresi okur (malzemede birimSert kapali —
      // tasimak zararsiz, E2 davranisi degismez).
      birim: params.birim ?? null,
    };
  }

  // ═══════════════════════════════════════════
  // TEK MOTOR: INDEKSLI + AD-KILITLI (v2) — baska motor YOKTUR (Faz 2b)
  // ═══════════════════════════════════════════

  /**
   * Skor YOK, aday URETILMEZ — havuz FILTRELENIR (Ad → Cap → yazili nitelik).
   * Cekirdek saf modullerde (index/*), DB'siz test edilir: test:index (K1-K7).
   * Bu metot yalniz sozluk/hafiza baglar ve M3 alternatiflerini ekler.
   */
  private async matchV2(
    userId: string,
    // Hafiza kapsam anahtari: malzemede brandId, iscilikte `iscilik|<firmaId>`
    // (PRD Iscilik D3: malzeme hafizasi iscilik secimini KIRLETMEZ — onek
    // ayristirir, mevcut malzeme imzalari DEGISMEZ).
    brandId: string,
    materialNames: string[],
    pool: IndexedRow[],
    toTry: (v: number, cur?: string | null) => number,
    variantTags?: string[],
    units?: Record<string, string>,
    // PRD Iscilik L9: TEK MOTOR — katalog turu parametredir, kopya YASAK.
    // 'iscilik': L6 birim SERT + alternatifler firma havuzundan taranir.
    catalogOpts?: { tur: 'iscilik'; firmaId: string },
  ): Promise<Record<string, MatchResult>> {
    // ── S3: SOZLUK v2'DE DE OKUNUR (Faz 1 denetim bulgusu) ───────────
    // Satir etiketleme (PRD 1.1-B) sozluksuz eksikti: "temiz su→PPR" gibi
    // seed'ler ve S4 kullanici alias'lari YAZILIYOR ama v2 OKUMUYORDU.
    // Istek basina 1 kez yuklenir; hint'ler QueryOpts ile motora gecer.
    const aliases = await this.terminology.loadAliases(userId);

    const out: Record<string, MatchResult> = {};
    for (const name of materialNames) {
      if (!name?.trim()) continue;
      const line = parseLine(name, units?.[name]);

      // TS vakasi (24.07/27.07): alias secimi KADEMELI — guard'a takilan
      // (veya motorun kullanamadigi) alias atlanir, SIRADAKI denenir. Eski
      // tek-kazanan davranista metne degen bir S4/ogrenilmis alias, seed
      // ceviriyi ("temiz su"→PPR) golgeleyip hint'i etkisizlestiriyordu.
      //
      // GERCEK CEVIRI ONCE (27.07 canli kaniti): S4 baslik-alias'i
      // ("TEMİZ SU BORULARI" → kinds=['pvc'], sizeClass, impliedType=NULL —
      // ExcelGrid sozluge-kaydet onerisi) uzunluk sirasinda seed'in onune
      // geciyordu; impliedType'siz hint ignoreTokens uygulatmadigindan
      // 'temiz su' kelimeleri urun-adi filtresi olup PPR'lari eliyordu
      // (yalniz adinda "Temiz Su Borusu" geçen PVC-U kaliyordu; HAKAN'da ise
      // hic aday kalmiyordu). impliedType'li alias TAM ceviridir (aile +
      // kelime yutma) — sinif-onsezili alias'tan her kosulda ustundur.
      const adayTum = this.terminology.resolveAliasAdaylari(name, aliases);
      const adaylar = [...adayTum.filter((a) => a.impliedType), ...adayTum.filter((a) => !a.impliedType)];
      let hint: AliasHint | null = null;
      let atlanan = 0;
      for (const aday of adaylar) {
        // E8: satirin KENDI ailesi cozulduyse sozluk BASKA aile dayatamaz
        // ("DOĞALGAZ VANASI KÜRESEL" — dogalgaz alias'i boru der, satir vana).
        if (aday.impliedType && line.familySlug && aday.impliedType !== line.familySlug) { atlanan++; continue; }
        // E2: adet birimli satira boru sozlugu dayatilamaz (birim sinyali)
        if (aday.impliedType === 'boru' && line.unitSignal === 'equipment' && line.familySlug !== 'boru') { atlanan++; continue; }
        // Motorun KULLANABILDIGI deger tasimayan alias hint OLAMAZ:
        // impliedType (aile+ignoreTokens) / sizeClass (sinif filtresi) /
        // siyah-galvaniz (taban sirasi) / MALZEME (S5 — malzeme sirasi).
        // ⚠ 'kinds=[pvc]' bu listede YOKTU: motorda bakilacak bir malzeme
        // alani olmadigi icin boyle alias'lar "degersiz" sayilip atlaniyordu.
        // S5 o alani (ProductIndex.malzemeler) actigi icin kinds ARTIK deger
        // tasir — suzgec de onu tanimak zorunda, yoksa sozluk yine sessizce
        // duserdi.
        if (!aday.impliedType && !aday.sizeClass
            && !aday.kinds.some((k) => k === 'siyah' || k === 'galvaniz')
            && malzemeEtiketleri(...aday.kinds).length === 0) { atlanan++; continue; }
        hint = aday;
        break;
      }
      if (atlanan > 0) console.log(`[Matching] v2 sozluk: "${name}" — ${atlanan} alias adayi guard'la atlandi${hint ? '' : ', hint YOK'}`);
      // T3/T5: SATIR KAZANIR — satirda ACIK sinif/cins kelimesi yaziliysa
      // sozluk sinif/taban DAYATAMAZ ("TEMİZ SU başlığı altında DN50 GALVANİZ
      // ÇELİK BORU" satiri CELIKTIR; alias plastic filtresi onu ELIYORDU ve
      // PPR yaziliyordu — R4 ihlali). Sozluk yalniz SINIFSIZ satira
      // varsayilan verir; yazili kelime cins filtresi olarak zaten serttir.
      const YAZILI_SINIF = /(^|\s)(celik|paslanmaz|pirinc|dokum|bronz|bakir|galvaniz\w*|siyah|ppr\w*|pex|pvc|hdpe|polietilen|plastik)(\s|$)/;
      const yaziliSinif = YAZILI_SINIF.test(line.tokens.join(' '));

      const opts: QueryOpts = {
        variantTags,
        // ISCILIK L6: birim uyumu SERT — mt satirina adet kalemi aday olamaz
        birimSert: catalogOpts?.tur === 'iscilik' || undefined,
        hintFamily: hint?.impliedType ?? null,
        sizeClassHint: yaziliSinif ? null : hint?.sizeClass ?? null,
        hintClass: !yaziliSinif && (hint?.sizeClass === 'plastic' || hint?.sizeClass === 'steel') ? hint.sizeClass : null,
        hintBases: yaziliSinif ? [] : (hint?.kinds ?? []).filter((k) => k === 'siyah' || k === 'galvaniz'),
        // S5: sozlugun MALZEME bilgisi ('pis su' → pvc|hdpe) motora BURADAN
        // girer — bugune kadar kinds yalniz siyah/galvaniz suzgecinden
        // geciyordu, malzeme kismi hicbir yere ulasmiyordu.
        // T3/T5 SATIR KAZANIR: satirda acik sinif/malzeme kelimesi yaziliysa
        // (yaziliSinif) sozluk varsayimi DAYATILMAZ — o kelime zaten K4 sert
        // filtresi olarak calisir, ustune bir de siralama baskisi koymak
        // "PVC yazdim, PVC elendi" celiskisini dogururdu.
        hintMalzeme: yaziliSinif ? [] : malzemeEtiketleri(...(hint?.kinds ?? [])),
        hintLabel: hint ? (hint.kinds.join('/') || hint.canonical) : undefined,
        // Alias'in kendi kelimeleri + stripTags kisit/bilinmeyen sayilmaz —
        // YALNIZ GERCEK CEVIRIDE (impliedType). S4 ZEHRI (canli 17.07,
        // 218-secenek vakasi): ogrenilmis AD-alias'lari ('test drenaj
        // vanasi' — impliedType YOK, urun adinin kendisi) satirin ad
        // kelimelerini yutuyor ama karsiliginda aile kisiti vermiyordu →
        // satir adsiz kaliyor, R11 yoluyla captaki TUM aile listeleniyordu.
        // Sinif/taban varsayimi (sizeClass/kinds) kelime yemeyi HAKLAMAZ;
        // o hint'ler kelimeler dururken de uygulanir.
        ignoreTokens: hint?.impliedType ? Array.from(new Set([...tokenize(hint.alias), ...hint.stripTags])) : undefined,
      };
      if (hint) {
        console.log(`[Matching] v2 sozluk: "${name}" → ${hint.alias} (${opts.hintClass ?? '-'}${opts.hintBases?.length ? `, taban=${opts.hintBases.join('/')}` : ''})`);
      }

      // S6 (06.08) — "bu markada yok" mu, yoksa AILELER ANLASAMADI mi?
      // Yalniz sonuc ZATEN none/ad-yok ise ikinci bir gecis kosar; kaybedecek
      // bir sey yoktur ve mutlu yolda hicbir maliyeti olmaz. Aile kilidi
      // GEVSEMEZ — bulunan aday onaya duser (bkz. aileUyusmazligiTeshisi).
      // ⚠ YALNIZ BURADA: capraz-marka yollarinda (515/707) UYGULANMAZ —
      // kullanicinin HIC bakmadigi bir markadan, ustelik BASKA aileden aday
      // one surmek iki tahmini ust uste bindirmektir (S3 kanit kurali).
      const outcome = aileUyusmazligiTeshisi(line, pool, opts, runQuery(line, pool, opts));
      let r = toMatchResult(outcome, line, toTry);

      // OGRENME HAFIZASI + CINS TERCIHI — v1 ile AYNI kural (on-secili
      // getirir, OTOMATIK DOLDURMAZ). Motor-bagimsiz ortak yol.
      r = await this.hafizaOnSecim(userId, brandId, name, r, aliases);

      // M3: "bu markada yok" cevabi ALTERNATIFSIZ birakilmaz (PRD Bolum 3).
      // Faz 2b genislemesi: satirin yazili kelimesi bu markada DOGRULANAMADIYSA
      // ('PP KÜRESEL' → Cayirova'da kuresel yok) istenen sey baska markada
      // olabilir — multi cevapta da alternatif taranir (R5/R9).
      if (!r.notProduct && (line.familySlug || opts.hintFamily)
          && (r.confidence === 'none' || (r.dogrulanamadi?.length ?? 0) > 0)) {
        // L5 (iscilik): "bu firmada yok" → kullanicinin DIGER firmalari taranir
        const alts = catalogOpts
          ? await this.findLaborAlternativesV2(userId, catalogOpts.firmaId, line, opts)
          : await this.findAlternativesV2(userId, brandId, line, opts);
        if (alts.length > 0) r = { ...r, alternatives: alts };
      }
      out[name] = r;
    }
    console.log(`[Matching] v2 Sonuc: ${Object.values(out).filter((r) => r.netPrice > 0).length}/${Object.keys(out).length} yazildi, ${Object.values(out).filter((r) => r.confidence === 'multi').length} soru`);
    return out;
  }

  /**
   * S3 (06.08.2026) — CAPRAZ-KATALOG ONERI ADAYI SECIMI (TEK KAPI).
   *
   * findAlternativesV2 ve findLaborAlternativesV2 IKIZDIR; bu kural ikisinde
   * de birebir ayni olmak zorunda (birinde daraltip digerinde unutmak kurali
   * GENEL yapmaz). O yuzden secim buraya tek yere alindi.
   *
   * ── KABUL ─────────────────────────────────────────────────────────────
   *  • 'single'                → KESIN aday (cekince yok).
   *  • 'ask' + TEK aday        → oneri, AMA yalniz kanit gucu yetiyorsa.
   *
   * ── RET (kanit gucu yetmeyen iki kapi) ────────────────────────────────
   *  • 'capsiz-dusum'  : satir capli, adayin capi YOK → cap DOGRULANMADI.
   *  • 'ad-gevsetildi' : ad daraltmasi gevsetildi     → ad DOGRULANMADI.
   * Bu ikisi adayin KIMLIGINE dokunur ("bu urun O urun mu?" sorusu
   * cevapsiz). Ana ekranda I6 bu adaya fiyat YAZDIRMAZ; oneri kutusunda
   * tek secenek olarak sunmak ayni tahmini baska bir kapidan geri sokardi.
   *
   * ── NEDEN 'bilinmeyen-kelime' RET DEGIL ───────────────────────────────
   * O kapi satirin EK niteligini ("paslanmaz", "pp") belirsiz birakir,
   * adayin kimligini degil: ad ve cap TAM tutmustur. Capraz-marka onerisinin
   * varlik sebebi zaten "bu marka o kelimeyi bilmiyor, baskasi biliyor"
   * demektir — o kapiyi da elesek mekanizma kendini yerdi (kodun 'PP KURESEL'
   * → KALDE gerekcesi). Cekince ELEME yerine TASINIR (S2: uyariNot).
   * Kalan kapilar (yuzey/birim/taban celiskisi, aile-yok) da ayni mantikla
   * tasinir: hicbiri "aday baska bir urun olabilir" demiyor.
   */
  private caprazAdaySec(outcome: QueryOutcome): { row: IndexedRow; uyariNot?: string; bilinmeyen?: string[] } | null {
    // ── S4 (c): AILESI ZAYIF ADAY CAPRAZ-MARKA ONERISI OLAMAZ ───────────
    // Kapi 'single' dalinda da gecerlidir: capraz-marka onerisi kullanicinin
    // HIC bakmadigi bir markadan gelir ve ekranda tek satirlik bir iddia
    // olarak gorunur ("X MARKA'da var — ₺4.321"). Ailesi yalnizca kategori
    // basligindan turemis bir kalem icin bu iddia dogrulanabilir degildir;
    // kendi markasindaki bir onay listesinde kullanici en azindan urunu
    // gorup reddedebiliyordu, burada goremez.
    // ── S6 (06.08): KURAL SAF KATMANA TASINDI ───────────────────────────
    // Ayni baraji ucuncu bir cagiran daha kullaniyor (aile uyusmazligi
    // teshisi). Yukaridaki "tek yerde olacak" gerekcesi degismedi, yalniz
    // "tek yer" artik query-engine'deki `guclutekAday` — orasi saf ve
    // DB'siz test edilebilir. Bu metot ince bir sarmalayici olarak duruyor
    // ki cagiranlar ve S3 gerekce metni yerinde kalsin.
    const guclu = guclutekAday(outcome);
    if (!guclu) return null;
    return { row: guclu.row, uyariNot: guclu.uyariNot, bilinmeyen: guclu.bilinmeyen };
  }

  /**
   * M3 (v2): satirin ailesi+capi DIGER markalarin indeksli kutuphanesinde var mi?
   * Ayni sert kurallar — yalniz GERCEKTEN o urunu sunan markalar onerilir.
   */
  private async findAlternativesV2(userId: string, brandId: string, line: LineQuery, opts?: QueryOpts): Promise<BrandAlternative[]> {
    const others = await this.prisma.userLibrary.findMany({
      where: { userId, brandId: { not: brandId } },
      include: {
        brand: { select: { id: true, name: true } },
        product: true,
        material: { select: { name: true } },
      } as any,
    });
    // Faz 2b: diger markalarin manuel/bayat satirlari da ayni yoldan gecer
    const pool = this.hazirlaPool(others as any[]);
    if (pool.length === 0) return [];

    const toTry = await this.buildTryConverter(others as { currency?: string | null }[]);
    const byBrand = new Map<string, BrandAlternative>();
    const kesinlik = new Map<string, 'single' | 'ask1'>();
    const markaOf = new Map<string, { id: string; name: string }>(
      (others as any[]).map((r) => [r.id, r.brand]),
    );

    // Marka basina AYRI sorgu: her markanin havuzu kendi icinde degerlendirilir
    // (dagarcik marka+aile kapsaminda uretilir — vocab.ts).
    const markaGruplari = new Map<string, IndexedRow[]>();
    for (const row of pool) {
      const m = markaOf.get(row.id);
      if (!m) continue;
      if (!markaGruplari.has(m.id)) markaGruplari.set(m.id, []);
      markaGruplari.get(m.id)!.push(row);
    }

    // S3: sozluk ipuclari alternatif taramaya da islenir (R3: temiz su icin
    // CELIK marka onerilemez) — yalniz varyant filtresi tasinmaz.
    const altOpts: QueryOpts | undefined = opts ? { ...opts, variantTags: undefined } : undefined;
    for (const [mid, rows] of markaGruplari) {
      const outcome = runQuery(line, rows, altOpts);
      // KESIN sonuc (single) VEYA kanit gucu yeten tek-adayli onay listesi
      // alternatif olur. Kabul/ret kurali TEK KAPIDA: caprazAdaySec (S3) —
      // capi/adi dogrulanamamis aday oneri kutusuna GIRMEZ, cekinceli ama
      // mesru aday cekincesiyle birlikte GIRER (S2).
      const secim = this.caprazAdaySec(outcome);
      if (!secim) continue;
      const tekAday = secim.row;
      const m = markaOf.get(tekAday.id)!;
      const list = toTry(tekAday.listPrice, tekAday.currency);
      const isk = tekAday.discountRate ?? 0;
      // Kutuphane ekrani formulu (outcome-mapper.netFiyat ile AYNI):
      // custom TABANI degistirir, iskonto HER ZAMAN uygulanir.
      const taban = tekAday.customPrice != null && tekAday.customPrice > 0
        ? toTry(tekAday.customPrice, tekAday.currency)
        : list;
      const net = hesaplaNetFiyat(taban, isk);
      byBrand.set(mid, {
        brandId: m.id, brandName: m.name,
        materialName: gorunenAd(tekAday), // boy'lu urunde boy gorunur (hidrant vakasi)
        netPrice: net, listPrice: list, discount: isk,
        // S2: cekince ADAYLA BIRLIKTE tasinir — FE kesinlik basligi yerine
        // "onay gerekiyor" tonunu bu alanlara BAKARAK secer.
        uyariNot: secim.uyariNot, bilinmeyen: secim.bilinmeyen,
      });
      kesinlik.set(mid, outcome.kind === 'single' ? 'single' : 'ask1');
    }
    // KESINLIK ONCELIGI: satiri TAM dogrulayan marka (single) varken,
    // "dogrulanamadi" notlu tek-adaylar onerilmez — 'PP KÜRESEL' icin
    // KALDE (PPR) dururken DUYAR (pirinc) listelenmez; gazda ayni (E9 ruhu).
    const singleVar = Array.from(kesinlik.values()).includes('single');
    return Array.from(byBrand.entries())
      .filter(([mid]) => !singleVar || kesinlik.get(mid) === 'single')
      .map(([, v]) => v);
  }

  /** I7 (kullanici sarti 18.07): bayat/indekssiz satir sayisi — FE rozeti.
   *  hazirlaPool istek aninda tamir ediyor ama KALICI cozum reindex;
   *  kullanici durumu GORMELI (yalniz log yetmez). */
  async indexHealth(userId: string) {
    const [bayat, indekssiz] = await Promise.all([
      this.prisma.userLibrary.count({
        where: { userId, productIndexId: { not: null }, product: { indexVersion: { not: INDEX_VERSION } } },
      }),
      this.prisma.userLibrary.count({ where: { userId, productIndexId: null } }),
    ]);
    return { bayat, indekssiz, surum: INDEX_VERSION };
  }

  // ═══════════════════════════════════════════
  // ISCILIK KATALOGU (PRD Iscilik L9) — AYNI MOTOR, catalogType parametresi.
  // Kopya motor YOKTUR: asagidaki metotlar yalniz HAVUZ YUKLER (LaborPrice→
  // IndexedRow) ve matchV2'yi 'iscilik' katalog opsiyonuyla cagirir.
  // ═══════════════════════════════════════════

  /** Teklif: satir(lar) icin secili FIRMANIN iscilik fiyatini esle.
   *  Sahiplik dogrulamasi CAGIRANDA (LaborMatchingService.assertOwnership). */
  async bulkMatchLabor(
    userId: string,
    firmaId: string,
    laborNames: string[],
    variantTags?: string[],
    units?: Record<string, string>,
  ): Promise<Record<string, MatchResult>> {
    const prices = await (this.prisma as any).laborPrice.findMany({
      where: { firmaId },
      include: { laborItem: true },
    });

    if (prices.length === 0) {
      const empty: Record<string, MatchResult> = {};
      const reason = 'Bu firmanın işçilik fiyat listesi boş. Firma detayından liste yükleyin.';
      for (const n of laborNames) {
        if (!n?.trim()) continue;
        empty[n] = { netPrice: 0, listPrice: 0, discount: 0, confidence: 'none', reason };
      }
      return empty;
    }

    const toTry = await this.buildTryConverter(prices as { currency?: string | null }[]);
    const pool = this.hazirlaLaborPool(prices as any[]);
    console.log(`[Matching] v2 ISCILIK MOTORU (tek motor, catalog=iscilik): ${pool.length} kalem, firma=${firmaId}`);
    return this.matchV2(
      userId,
      `iscilik|${firmaId}`, // hafiza kapsami — malzeme imzalariyla CAKISMAZ
      laborNames, pool, toTry, variantTags, units,
      { tur: 'iscilik', firmaId },
    );
  }

  /**
   * LaborPrice(+LaborItem) → IndexedRow — malzemedeki hazirlaPool'un ikizi,
   * AYNI UC DURUM: guncel indeks → oldugu gibi; bayat (kolonlu) →
   * rebuildIndexFields; indekssiz/legacy (yalniz ad+birim) →
   * manuelUrunIndeksle (yol-3 ORTAK yardimcisi — tek indeksleyici, L2/L9).
   */
  private hazirlaLaborPool(prices: any[]): IndexedRow[] {
    let bayat = 0; let indekssiz = 0;
    const pool: IndexedRow[] = prices.map((p) => {
      const it = p.laborItem;
      let urun: IndexedRow['urun'];
      const kolonlu = !!(it.adSlug && it.adBucket);
      if (kolonlu && it.indexVersion === INDEX_VERSION) {
        urun = {
          adSlug: it.adSlug, adBucket: it.adBucket, adTokens: it.adTokens ?? [],
          cinsNorm: it.cinsNorm ?? null, cinsTokens: it.cinsTokens ?? [],
          baglantiNorm: it.baglantiNorm ?? null, baglantiTokens: it.baglantiTokens ?? [],
          sizeClass: it.sizeClass ?? 'unknown', capTags: it.capTags ?? [],
          // S4/S5: kolon henuz yoksa (db push oncesi eski kayit) GUVENLI
          // varsayilan — malzeme "cozulemedi", aile "zayif degil": eski veri
          // FRENSIZ kalir, yeni fren yanlislikla eski satirlari kesmez.
          malzemeler: it.malzemeler ?? [], aileZayif: it.aileZayif ?? false,
          capNorm: it.capNorm ?? null, boyTag: it.boyTag ?? null,
          displayName: it.displayName ?? it.name, rowKey: it.id,
          indexVersion: it.indexVersion, belirsiz: it.belirsiz ?? false,
          ad: it.name, cins: it.cins ?? null, baglanti: it.baglanti ?? null,
          capRaw: it.capRaw ?? null, boyMm: it.boyMm ?? null,
          kategori: it.category ?? null, urunKodu: null, sheetName: null,
          price: p.unitPrice, birim: p.unit ?? it.unit ?? null,
        } as IndexedRow['urun'];
      } else if (kolonlu) {
        bayat++;
        const cols: ProductColumns = {
          // Is-eki AD'den dusurulur (aile malzeme kismindan cozulsun) —
          // gorunen ad asagida TAM item adiyla korunur.
          kategori: it.category ?? null, ad: iscilikAdCekirdegi(it.name), cins: it.cins ?? null,
          baglanti: it.baglanti ?? null, cap: it.capRaw ?? null, boy: it.boyMm ?? null,
          birim: p.unit ?? it.unit ?? null, price: p.unitPrice,
          paraBirimi: p.currency ?? null, urunKodu: null, not: it.not ?? null, sheetName: null,
        };
        const f = rebuildIndexFields(cols, { adSlug: it.adSlug ?? '', belirsiz: it.belirsiz ?? true });
        urun = {
          ...f, rowKey: it.id, displayName: it.name,
          ad: it.name, cins: it.cins ?? null, baglanti: it.baglanti ?? null,
          capRaw: it.capRaw ?? null, boyMm: it.boyMm ?? null,
          kategori: it.category ?? null, urunKodu: null, sheetName: null,
          price: p.unitPrice, birim: p.unit ?? it.unit ?? null,
        } as IndexedRow['urun'];
      } else {
        indekssiz++;
        urun = {
          ...this.manuelUrunIndeksle({
            name: it.name, price: p.unitPrice,
            kategori: it.category ?? null,
            birim: p.unit ?? it.unit ?? null,
            iscilikEki: true,
          }),
          // Secim kartinda kalemin TAM adi gorunur ("... montajı" dahil)
          displayName: it.name,
        };
      }
      return {
        id: p.id,
        listPrice: p.unitPrice,
        customPrice: null,
        discountRate: p.discountRate ?? 0,
        currency: p.currency ?? 'TRY',
        urun,
      };
    });
    if (bayat > 0) console.warn(`[Matching] ⚠ ISCILIK BAYAT INDEKS: ${bayat} kalem istek aninda yenilendi (v${INDEX_VERSION}) — POST /labor-matching/reindex onerilir.`);
    if (indekssiz > 0) console.log(`[Matching] ${indekssiz} indekssiz iscilik kalemi istek aninda indekslendi (legacy)`);
    return pool;
  }

  /** L5: "bu firmada yok" → kalemi GERCEKTEN sunan diger firmalar.
   *  findAlternativesV2'nin ikizi — ayni sert kurallar, firma havuzu. */
  private async findLaborAlternativesV2(
    userId: string, firmaId: string, line: LineQuery, opts?: QueryOpts,
  ): Promise<BrandAlternative[]> {
    const others = await (this.prisma as any).laborPrice.findMany({
      where: { firma: { userId, id: { not: firmaId } } },
      include: { laborItem: true, firma: { select: { id: true, name: true } } },
    });
    if (others.length === 0) return [];
    const pool = this.hazirlaLaborPool(others);
    const toTry = await this.buildTryConverter(others as { currency?: string | null }[]);

    const firmaOf = new Map<string, { id: string; name: string }>(
      (others as any[]).map((r) => [r.id, r.firma]),
    );
    const gruplar = new Map<string, IndexedRow[]>();
    for (const row of pool) {
      const f = firmaOf.get(row.id);
      if (!f) continue;
      if (!gruplar.has(f.id)) gruplar.set(f.id, []);
      gruplar.get(f.id)!.push(row);
    }

    const altOpts: QueryOpts | undefined = opts ? { ...opts, variantTags: undefined } : undefined;
    const out: BrandAlternative[] = [];
    for (const [, rows] of gruplar) {
      const outcome = runQuery(line, rows, altOpts);
      // IKIZ KURAL (S3): malzeme yolundaki AYNI kapi — kanit gucu yetmeyen
      // aday (capi/adi dogrulanamamis) firma onerisi de OLAMAZ.
      const secim = this.caprazAdaySec(outcome);
      if (!secim) continue;
      const tek = secim.row;
      const f = firmaOf.get(tek.id)!;
      const list = toTry(tek.listPrice, tek.currency);
      const isk = tek.discountRate ?? 0;
      out.push({
        // Mevcut BrandAlternative sozlesmesi yeniden kullanilir (FE ayni
        // popup bileseni) — brandId/brandName alanlari FIRMA tasir.
        brandId: f.id, brandName: f.name,
        materialName: gorunenAd(tek),
        netPrice: hesaplaNetFiyat(list, isk), listPrice: list, discount: isk,
        // S2: cekince burada da tasinir (ikiz sozlesme ayrismaz).
        uyariNot: secim.uyariNot, bilinmeyen: secim.bilinmeyen,
      });
    }
    return out;
  }

  /**
   * L2 (index-at-creation): iscilik kalemi olusturulur/adi degisirken cagrilir —
   * LaborItem'a yazilacak v2 indeks alanlarini uretir (AYNI indeksleyici;
   * is-eki soyulur, gorunen ad TAM kalir). belirsiz=true → BEKLEYEN
   * (eslesmeye kapali; kullanici duzeltince ad guncellemesi yeniden indeksler).
   */
  laborItemIndexData(name: string, birim?: string | null): {
    adSlug: string; adBucket: string; adTokens: string[];
    cinsNorm: string | null; cinsTokens: string[];
    baglantiNorm: string | null; baglantiTokens: string[];
    sizeClass: string; capTags: string[]; capNorm: string | null;
    malzemeler: string[]; aileZayif: boolean;
    boyTag: string | null; displayName: string;
    indexVersion: number; belirsiz: boolean;
  } {
    const u = this.manuelUrunIndeksle({ name, price: 0, birim: birim ?? null, iscilikEki: true });
    return {
      adSlug: u.adSlug, adBucket: u.adBucket, adTokens: u.adTokens,
      cinsNorm: u.cinsNorm ?? null, cinsTokens: u.cinsTokens,
      baglantiNorm: u.baglantiNorm ?? null, baglantiTokens: u.baglantiTokens,
      sizeClass: u.sizeClass, capTags: u.capTags, capNorm: u.capNorm ?? null,
      malzemeler: u.malzemeler, aileZayif: u.aileZayif,
      boyTag: u.boyTag ?? null, displayName: name,
      indexVersion: INDEX_VERSION, belirsiz: u.belirsiz,
    };
  }

  /** Iscilik reindex (L2 kalicilik): kullanicinin firmalarindaki kalemlerin
   *  indeks alanlarini yeniden uretip YAZAR. Kolonlu kalem kolonlardan,
   *  legacy kalem adindan (yol-3) turetilir — AYNI indeksleyici. */
  async reindexLabor(userId: string): Promise<{ updated: number; total: number; belirsiz: number }> {
    const items = await (this.prisma as any).laborItem.findMany({
      where: { laborPrices: { some: { firma: { userId } } } },
    });
    let updated = 0; let belirsizSayisi = 0;
    for (const it of items) {
      const kolonlu = !!(it.cins || it.baglanti || it.capRaw || it.boyMm);
      let f: ReturnType<typeof rebuildIndexFields>;
      if (kolonlu) {
        const cols: ProductColumns = {
          kategori: it.category ?? null, ad: iscilikAdCekirdegi(it.name), cins: it.cins ?? null,
          baglanti: it.baglanti ?? null, cap: it.capRaw ?? null, boy: it.boyMm ?? null,
          birim: it.unit ?? null, price: it.unitPrice ?? 0,
          paraBirimi: null, urunKodu: null, not: it.not ?? null, sheetName: null,
        };
        f = rebuildIndexFields(cols, { adSlug: it.adSlug ?? '', belirsiz: it.belirsiz ?? true });
      } else {
        const urun = this.manuelUrunIndeksle({
          name: it.name, price: it.unitPrice ?? 0,
          kategori: it.category ?? null, birim: it.unit ?? null,
          iscilikEki: true,
        });
        const { rowKey: _r, ad: _a, cins: _c, baglanti: _b, capRaw: _cr, boyMm: _bm,
          kategori: _k, urunKodu: _u, sheetName: _s, price: _p, birim: _bi, ...fields } = urun as any;
        f = fields;
      }
      if (f.belirsiz) belirsizSayisi++;
      await (this.prisma as any).laborItem.update({
        where: { id: it.id },
        data: {
          adSlug: f.adSlug, adBucket: f.adBucket, adTokens: f.adTokens,
          cinsNorm: f.cinsNorm, cinsTokens: f.cinsTokens,
          baglantiNorm: f.baglantiNorm, baglantiTokens: f.baglantiTokens,
          sizeClass: f.sizeClass, capTags: f.capTags, capNorm: f.capNorm,
          malzemeler: f.malzemeler, aileZayif: f.aileZayif,
          // Secim kartinda TAM kalem adi gorunur ("... montajı" dahil) —
          // indeks alanlari is-eki soyulmus AD'den, gorunum tam addan.
          boyTag: f.boyTag, displayName: it.name,
          indexVersion: INDEX_VERSION, belirsiz: f.belirsiz,
        },
      });
      updated++;
    }
    console.log(`[Matching] ISCILIK REINDEX: ${updated}/${items.length} kalem (belirsiz/bekleyen: ${belirsizSayisi})`);
    return { updated, total: items.length, belirsiz: belirsizSayisi };
  }

  // ═══════════════════════════════════════════
  // OGRENME HAFIZASI (PRD Adim 8) — imza + kaydet
  // ═══════════════════════════════════════════

  /**
   * OGRENME HAFIZASI + CINS TERCIHI — ON-SECILI getirir, OTOMATIK DOLDURMAZ.
   * (Faz 1 denetim bulgusu S3: matchV2 erken donusu bu bloklari atliyordu —
   * "önceki tercihiniz ✓" ozelligi indeksli markalarda OLUYDU.)
   */
  private async hafizaOnSecim(
    userId: string,
    brandId: string,
    excelName: string,
    result: MatchResult,
    aliases: AliasHint[],
  ): Promise<MatchResult> {
    // ── TAM IMZA (PRD Adim 8): ayni belirsizlik daha once cozulduyse ────
    // DUZELTME (A2/A5): hafiza OTOMATIK DOLDURMAZ — "ilk secim her zaman
    // kullanicinin". Gecmis secim listenin BASINA preferred olarak alinir.
    // DUZELTME E: olcusu cozulemeyen satirin ANAHTARI YOK (buildImza null
    // doner) — hafiza sorgusu da YAPILMAZ; yoksa `null` imzayla arama tum
    // olcusuz satirlari tek kayitta esitlerdi. Kosulun on yuzu DEGISMEDI:
    // imza yalniz 'multi' satirda hesaplanir (gereksiz generateTags yok).
    const imza = result.confidence === 'multi' && result.candidates?.length
      ? this.buildImza(excelName, brandId)
      : null;
    if (imza) {
      // Savunmaci: tablo/client henuz yoksa (migration oncesi) akisi BOZMA.
      let mem: any = null;
      try {
        mem = await (this.prisma as any).eslesmeHafizasi?.findUnique({
          where: { userId_imza: { userId, imza } },
        });
      } catch { mem = null; }
      if (mem) {
        const idx = result.candidates.findIndex((c) => c.materialName === mem.secilenAd);
        if (idx >= 0) {
          // KULLANICI KARARI (17.07, canli test): TEK aday kaldiysa VE o aday
          // gecmis secimin KENDISIYSE onay TEKRARI istenmez — fiyat yazilir.
          // I6/373K korumasi BOZULMAZ: hafizasiz tek adayda onay surer; burada
          // onay gecmiste zaten verilmisti (ayni satir imzasi, ayni urun).
          // variantMissing haric — o "istenen varyant bu capta yok" der,
          // hafiza onu ortemez.
          // I3 SINIRI (kullanici sarti 18.07): satirin AKISKAN kelimesi
          // (dogalgaz/buhar/sivi) bu markada DOGRULANAMADIYSA hafiza bile
          // otomatik YAZAMAZ — akiskan uyusmazligi riski onay ister.
          const akiskanSupheli = (result.dogrulanamadi ?? []).some((t) => extractFluid(t) !== null);
          if (result.candidates.length === 1 && !result.variantMissing && !akiskanSupheli) {
            const c = result.candidates[idx];
            console.log(`[Matching] HAFIZA TEK-ADAY OTOYAZ: "${excelName}" → "${mem.secilenAd}" (${mem.secimSayisi}×)`);
            return {
              ...result,
              netPrice: c.netPrice, listPrice: c.listPrice, discount: c.discount,
              confidence: 'high',
              matchedName: c.materialName,
              candidates: undefined,
              dogrulanamadi: undefined,
              // I6 kanit rozeti: FE hucrede "Geçmiş seçiminizden atandı"
              // gosterir; marka menusu yeniden acilinca tek tikla cozulur.
              hafizaOtoyaz: true,
              // Canli bulgu 18.07: otoyaz "son secim" zincirini beslemeli —
              // varyant kimligi FE'ye tasinir, gruptaki sonraki satirlar
              // (anahtar ACIKSA) ayni varyantla otomatik dolar.
              variantTags: c.variantTags,
              // DUZELTME C: sayac SATIRA degil ANAHTARA ait (ayni olcu/tipteki
              // tum satirlarin toplami) ve artisin buyuk kismi kullanicinin
              // BAGIMSIZ yargisi degil, sistemin kendi onerisinin teyididir.
              // Metin kanittan guclu konusmaz.
              reason: `Aynı soruda kayıtlı seçim (${mem.secimSayisi}×) — tek aday, otomatik uygulandı.`,
            };
          }
          console.log(`[Matching] HAFIZA ON-SECILI: "${excelName}" → "${mem.secilenAd}" (${mem.secimSayisi}×) basa alindi`);
          const cand = { ...result.candidates[idx], preferred: true };
          const rest = result.candidates.filter((_, i) => i !== idx);
          result = {
            ...result,
            candidates: [cand, ...rest],
            // DUZELTME C: "onaylayın" ONAYLATICI dildi — sistem kendi onerisini
            // kullanici karariymis gibi mesrulastiriyordu. Sayi da satira degil
            // ANAHTARA (ayni soruya) ait; metin bunu soyler ve KONTROL ister.
            reason: `Aynı soruda kayıtlı seçim (${mem.secimSayisi}×) önde — kontrol edin. ${result.reason ?? ''}`.trim(),
          };
        }
      }
    }

    // ── CINS TERCIHI (V5, PRD v1.3): olcu-bagimsiz cins on-secimi ──────
    if (result.confidence === 'multi' && result.candidates?.length) {
      let kmem: any = null;
      try {
        kmem = await (this.prisma as any).eslesmeHafizasi?.findUnique({
          where: { userId_imza: { userId, imza: this.buildKindImza(excelName, brandId, aliases) } },
        });
      } catch { kmem = null; }
      if (kmem) {
        const preferred = result.candidates.filter((c) => c.tags?.includes(kmem.secilenAd));
        if (preferred.length > 0 && preferred.length < result.candidates.length) {
          const rest = result.candidates.filter((c) => !c.tags?.includes(kmem.secilenAd));
          console.log(`[Matching] CINS TERCIHI ON-SECILI: "${excelName}" → ${kmem.secilenAd} (${preferred.length} aday one alindi)`);
          result = {
            ...result,
            candidates: [...preferred.map((c) => ({ ...c, preferred: true })), ...rest],
            reason: `${result.reason ?? ''} Geçmiş tercihiniz (${kmem.secilenAd}) önde.`.trim(),
          };
        }
      }
    }

    return result;
  }

  /** Belirsizligin parmak izi: marka + kanonik olcu + tip + cins + YUZEY + BAGLANTI.
   *  Ayni imza = ayni secim sorusu → hafizadan cevaplanabilir.
   *
   *  DUZELTME A (04.08.2026 — `imza-ekseni-test.ts` A-R1/A-R2/A-R3): imza
   *  yalniz KIND_TAGS suzuyordu; `shared-tag-matcher.ts`'te TANIMLI olan
   *  SURFACE_TAGS (siyah/galvaniz/kirmizi/boyali) ve CONNECTION_TAGS
   *  (disli/kaynakli/flans/pres/duz-uclu/yivli) imzaya HIC girmiyordu.
   *  Sonuc: "2\" Siyah boru" · "2\" Galvanizli boru" · "2\" Dogalgaz borusu"
   *  TEK anahtara dusuyor, birinde verilen karar otekine "gecmis seciminiz"
   *  diye gosteriliyordu. Gercek veride olculen bedel: galvanizli boru
   *  siyahtan %20,5-%46,9, disli mansonlu duz uclidan %17,1 pahali.
   *  Etiketler SIRALANIR — ayni sorgu her zaman ayni imzayi uretir (L2a).
   *
   *  DUZELTME E (ayni tur — E-R1): OLCU BOS ise imza URETILMEZ (null).
   *  Capi cozulemeyen HER satir tek kayda dusup hafizayi kirletiyordu
   *  (04.08 olcumu: `…||boru|celik` 55×, `…||diger|` 118×). Mevcut kayitlar
   *  SILINMEZ — yalniz yeni kirlenme durur.
   *
   *  Faz 2b: HEADER_HINTS katkisi kalkti — imza yalniz satirin KENDI
   *  etiketlerinden uretilir. (Baslik-ipuclu eski imzalar dogal olarak
   *  devre disi kalir; secimler yeniden ogrenilir — on-secim kaybi gecici.)
   *  ⚠ Ayni gerekce bu turda da gecerli: format degistigi icin eski tam-imza
   *  kayitlari eslesmez olur. BILINCLI ve kabul edilmis yan etkidir. */
  private buildImza(excelName: string, brandId: string): string | null {
    const tags = generateTags(excelName);
    const olcu = tags.tags.filter((t) => t.startsWith('dn') || t.startsWith('od-')).sort().join(',');
    if (!olcu) return null;
    const kinds = tags.tags.filter((t) => KIND_TAGS.has(t)).sort().join(',');
    const surface = tags.tags.filter((t) => SURFACE_TAGS.has(t)).sort().join(',');
    const connection = tags.tags.filter((t) => CONNECTION_TAGS.has(t)).sort().join(',');
    return `${brandId}|${olcu}|${tags.materialType}|${kinds}|${surface}|${connection}`;
  }

  /** Cins tercihinin imzasi (V5): olcu YOK — marka + malzeme tipi + AILE.
   *  "DN20 vana → pirinc" secimi DN32 vanada da gecerli olsun diye.
   *  N4 (Duzeltme): AILE bileseni eklendi — celik hattaki "galvanizli disli"
   *  tercihi PPR hattinda "onceki tercihiniz" olarak GORUNMEZ. Aile = satir
   *  ham cinsleri, yoksa sozluk cinsleri, yoksa 'genel'. (Eski imza formati
   *  farkli — eski kind-tercihleri dogal olarak devre disi kalir.) */
  private buildKindImza(excelName: string, brandId: string, aliases: AliasHint[]): string {
    const tags = generateTags(excelName);
    const raw = extractMaterialKind(excelName).filter((k) => KIND_TAGS.has(k));
    const hint = this.terminology.resolveAlias(excelName, aliases);
    const fam = raw.length > 0
      ? raw.sort().join(',')
      : ((hint?.kinds ?? []).filter((k) => KIND_TAGS.has(k)).sort().join(',') || 'genel');
    return `kind|${brandId}|${tags.materialType}|${fam}`;
  }

  /** Kullanici secici popup'tan urun secince cagrilir — senkron, secim aninda. */
  async remember(userId: string, brandId: string, materialName: string, secilenAd: string) {
    if (!userId || !brandId || !materialName?.trim() || !secilenAd?.trim()) {
      return { ok: false, reason: 'eksik parametre' };
    }
    const imza = this.buildImza(materialName, brandId);
    // DUZELTME E (04.08.2026): olcusu cozulemeyen satirin ANAHTARI YOKTUR —
    // YAZILMAZ. Once bos olculu satirlar da yaziliyordu ve tipi/capi
    // cozulemeyen HER satir tek kayda birikiyordu (55× ve 118× ornekleri).
    // Cins tercihi (olcu-bagimsiz) yazma yolu KORUNUR — asagida surer.
    if (imza) {
      await (this.prisma as any).eslesmeHafizasi.upsert({
        where: { userId_imza: { userId, imza } },
        update: { secilenAd, secimSayisi: { increment: 1 } },
        create: { userId, imza, secilenAd },
      });
      console.log(`[Matching] HAFIZA YAZ: user=${userId} imza="${imza}" → "${secilenAd}"`);
    } else {
      console.log(`[Matching] HAFIZA YAZILMADI (ölçü çözülemedi): "${materialName}"`);
    }

    // ── CINS TERCIHI YAZ (V5): secilen urun TEK cins tasiyorsa kaydet ──
    // (orn "Kuresel Vana DN25 Pirinç" → pirinc). Olcu-bagimsiz: sonraki
    // farkli-capli ayni-tip belirsizliklerde bu cins one gecer.
    try {
      const chosenKinds = generateTags(secilenAd).tags.filter((t) => KIND_TAGS.has(t));
      if (chosenKinds.length === 1) {
        const aliases = await this.terminology.loadAliases(userId);
        const kindImza = this.buildKindImza(materialName, brandId, aliases);
        await (this.prisma as any).eslesmeHafizasi.upsert({
          where: { userId_imza: { userId, imza: kindImza } },
          update: { secilenAd: chosenKinds[0], secimSayisi: { increment: 1 } },
          create: { userId, imza: kindImza, secilenAd: chosenKinds[0] },
        });
        console.log(`[Matching] CINS TERCIHI YAZ: imza="${kindImza}" → ${chosenKinds[0]}`);
      }
    } catch { /* cins tercihi opsiyonel — ana hafiza yazildi */ }

    return { ok: true, imza };
  }

  // ═══════════════════════════════════════════
  // BACKFILL — Mevcut malzemelere tag at
  // ═══════════════════════════════════════════

  async backfillTags(): Promise<{ updated: number; total: number }> {
    const materials = await this.prisma.material.findMany();
    let updated = 0;

    for (const mat of materials) {
      const tagged = generateTags(mat.name);
      await this.prisma.material.update({
        where: { id: mat.id },
        data: {
          tags: tagged.tags,
          normalizedName: tagged.normalizedName,
          materialType: tagged.materialType,
        },
      });
      updated++;
    }

    console.log(`[Matching] Backfill tamamlandi: ${updated}/${materials.length} malzeme guncellendi`);
    return { updated, total: materials.length };
  }

  // ═══════════════════════════════════════════
  // TEST — Tek malzeme icin tag gor
  // ═══════════════════════════════════════════

  generateTagsForTest(materialName: string) {
    return generateTags(materialName);
  }
}
