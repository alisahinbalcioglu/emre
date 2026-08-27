// ════════════════════════════════════════════════════════════════════
// SONUC CEVIRICI (v2) — motorun TEK CIKIS NOKTASI
//
// QueryOutcome (ic tip) → MatchResult (DEGISMEZ dis sozlesme).
//
// ALTIN KURAL ARTIK YAPISAL: fiyat yalnizca 'single' / 'auto-variant'
// dalindan cikabilir. v1'de bu kural kod boyunca dagilmis kontrollerle
// korunuyordu (ve V4 yolu kapiyi atliyordu). Burada tek kapi var:
// digger tum dallar netPrice: 0 doner — baska turlusu YAZILAMAZ.
//
// Sozlesme kaynagi: test/contract-test.ts (74 assert). Bu dosya oradaki
// her alani doldurmak ZORUNDA.
// ════════════════════════════════════════════════════════════════════

import { hesaplaNetFiyat } from '../pricing';
import { extractAttrTags, extractFluid } from '../../../eslestirme/matching/normalizer';
import { buildAttrUyari } from '../../../eslestirme/matching/shared-tag-matcher';
import { urunVariantTags } from '../../../eslestirme/matching/index/query-engine';
import type { MatchResult, MatchCandidate, KaynakKur } from '../../../eslestirme/matching/types';
import type { IndexedRow, QueryOutcome, AskColumn, LineQuery } from '../../../eslestirme/matching/index/types';

/**
 * KUR DONMASI (06.08) — cevirici fonksiyonun USTUNDE kur metaverisi tasinir.
 *
 * Neden bu bicim: `toTry` imzasi motorun her katmanindan geciyor
 * (matchV2 → toMatchResult → adayla → netFiyat); ayri bir parametre eklemek
 * dort imzayi ve tum cagiranlari degistirirdi. Metaveri fonksiyona ILISTIRILIR
 * (buildTryConverter atar), okuyan yalniz bu dosyadir. `.kur` YOKSA kaynakKur
 * URETILMEZ — kur bilinmiyorken tarih/kur uydurmak yasak (kapi D1).
 */
export type TryCevirici = ((v: number, cur: string) => number) & {
  kur?: { usdTry: number; eurTry: number; tarih: string };
};

/** Dovizli satir icin cevrimde kullanilan kuru cikar; TRY'de undefined. */
function kurOf(r: IndexedRow, toTry: TryCevirici): KaynakKur | undefined {
  const cur = r.currency;
  if ((cur !== 'USD' && cur !== 'EUR') || !toTry.kur) return undefined;
  return {
    currency: cur,
    kur: cur === 'USD' ? toTry.kur.usdTry : toTry.kur.eurTry,
    tarih: toTry.kur.tarih,
  };
}

/**
 * Kullaniciya gorunen urun adi: indeksteki displayName + (varsa) BOY.
 * Boy, displayName'e INDEKSTE eklenmedi (INDEX_VERSION artisi + reindex
 * gerektirirdi) — sunum tek cikis noktasinda zenginlestirilir.
 * Canli vaka (17.07): 4 "Yerüstü yangın hidrantı" adayi yalniz BOYLA
 * (1300/1700/2150/2450) ayrisiyordu ama kartlarda OZDES gorunuyordu —
 * kullanici fiyat farkinin neden oldugunu goremiyordu. Boy isme girince
 * hafiza on-secimi de boy'a ozgu calisir (ozdes isimlerde hep ILK aday
 * isaretleniyordu — gizli belirsizlik kapandi).
 */
export function gorunenAd(r: IndexedRow): string {
  return r.urun.boyMm ? `${r.urun.displayName} · ${r.urun.boyMm} mm` : r.urun.displayName;
}

/**
 * Kullanicinin kendi fiyati — KUTUPHANE EKRANIYLA AYNI FORMUL:
 *   net = (customPrice ?? listPrice) × (1 − iskonto)
 * (frontend library/page.tsx calcNetPrice ile birebir.)
 *
 * CANLI VAKA (17.07): eski kural "customPrice doluysa AYNEN yaz" idi —
 * iskontoyu CARPMIYORDU. Kutuphanede 187 iskontolu satirin HEPSINDE
 * customPrice=listPrice dolu oldugundan (%90 girilen 6" boruda bile)
 * eslestirme liste fiyatini yaziyordu; kutuphane ekrani ise 77,9 gosteriyordu.
 * Kural: EKRAN NE GOSTERIYORSA ESLESTIRME ONU YAZAR — customPrice yalniz
 * TABANI degistirir, iskonto her zaman uygulanir. custom=liste olan mevcut
 * veriyle sonuc birebir ayni kalir (veri temizligi gerekmez).
 */
function netFiyat(r: IndexedRow, toTry: (v: number, cur: string) => number): { net: number; list: number; isk: number } {
  const list = toTry(r.listPrice ?? r.urun.price, r.currency);
  const isk = r.discountRate ?? 0;
  const taban = r.customPrice != null && r.customPrice > 0 ? toTry(r.customPrice, r.currency) : list;
  return { net: hesaplaNetFiyat(taban, isk), list, isk };
}

/**
 * `label` = SORULAN kolonun o adaydaki degeri.
 * FE (ExcelGrid.tsx:487-492) adaylari label'a gore grupluyor; ayni label'da
 * >1 kayit kalirsa stage2 (2. kademe soru) aciliyor. Yani kademeli soru
 * arayuzu HIC DEGISMEDEN yeni motorla calisir.
 */
function etiket(r: IndexedRow, kolon: AskColumn): string {
  switch (kolon) {
    case 'ad': return r.urun.ad || r.urun.adBucket;
    // Grup etiketi = fiyat listesindeki bolum basliginin KENDISI
    case 'kategori': return r.urun.kategori || r.urun.sheetName || '—';
    case 'cins': return r.urun.cins || '—';
    case 'baglanti': return r.urun.baglanti || '—';
    case 'boy': return r.urun.boyMm ? `${r.urun.boyMm} mm` : '—';
    case 'urun':
    default:
      // K7 vakasi: kolonlar ayni, kayit farkli (ayni kod iki fiyat) →
      // kullaniciyi kaynagiyla ayirt ettir.
      return r.urun.kategori || r.urun.sheetName || r.urun.urunKodu || r.urun.ad;
  }
}

function adayla(r: IndexedRow, kolon: AskColumn, toTry: (v: number, cur: string) => number, lineAttr: string[]): MatchCandidate {
  const { net, list, isk } = netFiyat(r, toTry);
  return {
    materialName: gorunenAd(r),
    netPrice: net,
    listPrice: list,
    discount: isk,
    // Kur donmasi: aday secilirse FE bu kuru satira yazar
    kaynakKur: kurOf(r, toTry as TryCevirici),
    // Geriye uyum: FE (ExcelGrid.tsx:358) tags'ten baslik→alias onerisi
    // uretiyor — ciplak cins token'lari korunur, yoksa o ozellik susar.
    tags: [
      r.urun.adSlug,
      ...r.urun.adTokens,
      ...r.urun.cinsTokens,
      ...r.urun.baglantiTokens,
      ...r.urun.capTags,
    ],
    popular: false,
    label: etiket(r, kolon),
    // v1 anlami: "asama 1 (cins/yuzey) mi, asama 2 (baglanti) mi?"
    // 'kategori' (grup kademesi) de ASAMA 1'dir — quotes sayfasi asama 1'de
    // yalniz surfaceLevel adaylari gosterir (quotes/new/page.tsx:1956),
    // false kalsaydi grup secenekleri hic gorunmezdi.
    surfaceLevel: kolon === 'ad' || kolon === 'kategori' || kolon === 'cins',
    variantTags: urunVariantTags(r),
    // E3: satirin yapilandirilmis nitelikleri (sicaklik/K/montaj/uzunluk/
    // govde) adayinkiyle karsilastirilir — FARKLI deger tasiyan aday
    // isaretlenir ("68°C istendi — bu ürün 141°C"). Karar #3 geregi bu
    // nitelikler ELEMEZ (soru zaten aciliyor); uyari secimi bilinclendirir.
    uyari: lineAttr.length
      ? buildAttrUyari(lineAttr, extractAttrTags(`${r.urun.ad} ${r.urun.cins ?? ''}`)) ?? undefined
      : undefined,
  };
}

const SORU_METNI: Record<AskColumn, string> = {
  ad: 'Hangi ürün?',
  kategori: 'Hangi grup?',
  cins: 'Hangi cins?',
  baglanti: 'Hangi bağlantı şekli?',
  boy: 'Hangi boy?',
  urun: 'Hangi kayıt?',
};

export function toMatchResult(
  outcome: QueryOutcome,
  line: LineQuery,
  toTry: (v: number, cur: string) => number,
): MatchResult {
  const bos = { netPrice: 0, listPrice: 0, discount: 0 };

  switch (outcome.kind) {
    // ── TEK ESLESME: fiyatin yazilabildigi TEK yol ──────────────────
    case 'single': {
      const { net, list, isk } = netFiyat(outcome.row, toTry);
      return {
        netPrice: net, listPrice: list, discount: isk,
        kaynakKur: kurOf(outcome.row, toTry as TryCevirici),
        confidence: 'high',
        matchedName: gorunenAd(outcome.row),
        // R18 asserti bu substring'i ariyor — contract-test.ts C2 de.
        reason: 'Tek eşleşme — AD + ÇAP (+ yazılı nitelikler) sonrası markada tek ürün kaldı.',
        donusum: outcome.donusum ?? undefined,
        matchedTags: outcome.row.urun.adTokens,
        // PRD v3.0 B (canli bulgu 19.07): tek-eslesme kaynagi da varyant
        // kimligini FE'ye tasir — surukleme/cift-tik yayilimi popup'siz dolan
        // satirdan da baslayabilsin (FE 26d8448 result.variantTags bekliyor,
        // 'single' dali hic gondermiyordu → kaynak kimliksiz kaliyordu).
        variantTags: urunVariantTags(outcome.row),
      };
    }

    // ── V4: kullanicinin KENDI grup secimi bu capa yayildi ──────────
    case 'auto-variant': {
      const { net, list, isk } = netFiyat(outcome.row, toTry);
      return {
        netPrice: net, listPrice: list, discount: isk,
        kaynakKur: kurOf(outcome.row, toTry as TryCevirici),
        confidence: 'suggestion',
        autoVariant: true,
        matchedName: gorunenAd(outcome.row),
        reason: 'Grup varyantı uygulandı (önceki seçiminiz bu çapa taşındı).',
        donusum: outcome.donusum ?? undefined,
        // Hedef satir da ileride surukleme kaynagi olabilir — kimlik tasinir.
        variantTags: urunVariantTags(outcome.row),
      };
    }

    // ── COK KAYIT: fiyatli secim listesi — SISTEM SECMEZ ────────────
    case 'ask': {
      // E3: satirin nitelik tag'leri ham metinden bir kez cikarilir
      // (parantez notlari DAHIL — "(68°C)" bir kisit degil ama uyari kaynagidir).
      const lineAttr = extractAttrTags(line.raw);
      const cands = outcome.rows.map((r) => adayla(r, outcome.askColumn, toTry, lineAttr));

      // ── 'urun' KOLONU: ETIKET = URUN KIMLIGI (canli bulgu 18.07) ──────
      // Ayrisan kolon 'urun' oldugunda (K7 fallback + tek-aday artigi) etiket
      // BOLUM BASLIGINI gosteriyordu ("Dövme Demir Bağlantı Parçaları...") —
      // kullanici urunun NE oldugunu goremiyordu ("Dirsek · Galvaniz · 1"").
      // Kural: etiket urun kimligi (materialName) olsun; AYNI kimlikten >1
      // kayit varsa (K7: ayni urun iki fiyat/kaynak) kaynak eklenip AYIRT
      // edilir. Diger kolonlar (cins/baglanti/boy/kategori-grup) DEGISMEZ.
      if (outcome.askColumn === 'urun') {
        const say = new Map<string, number>();
        for (const c of cands) say.set(c.materialName, (say.get(c.materialName) ?? 0) + 1);
        cands.forEach((c, idx) => {
          if (say.get(c.materialName)! > 1) {
            const u = outcome.rows[idx].urun;
            const kaynak = (u.sheetName || u.urunKodu || u.kategori || '').slice(0, 30);
            c.label = kaynak ? `${c.materialName} · ${kaynak}` : c.materialName;
          } else {
            c.label = c.materialName;
          }
        });
      }

      // En sik cins/ad "populer" isaretli (★) — SIRALAMA ipucu, secim DEGIL.
      const sayim = new Map<string, number>();
      for (const c of cands) sayim.set(c.label, (sayim.get(c.label) ?? 0) + 1);
      const enSik = Array.from(sayim.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
      for (const c of cands) if (c.label === enSik && sayim.get(enSik)! > 1) c.popular = true;

      let reason = `${outcome.rows.length} seçenek — ${SORU_METNI[outcome.askColumn]} (fiyat yalnız tek ürün kalınca otomatik yazılır).`;
      if (outcome.uyariNot) {
        // E2: birim celiskisi — tek aday olsa bile onay istenir, neden soylenir
        reason = `${outcome.uyariNot} — onaylayın. ${reason}`;
      } else if (outcome.variantMissing) {
        reason = 'Seçilen varyant bu çapta kütüphanede yok — elle seçin.';
      } else if (outcome.bilinmeyen?.length) {
        // KARAR #3: taninmayan kelimeyi SOYLE — kullanici neden tum ailenin
        // listelendigini anlasin, yazim hatasini gorebilsin.
        reason = `"${outcome.bilinmeyen.join(' ')}" bu markada bulunamadı — ${SORU_METNI[outcome.askColumn].toLowerCase()}`;
      }

      // I3 ISTISNA ISARETI (kullanici sarti 18.07): satirin AKISKAN kelimesi
      // (dogalgaz/buhar/sivi) bu markada dogrulanamadiysa liste ACIK UYARIYLA
      // gelir; hafiza otoyazi da matching.service'te ayni kosulla BLOKE —
      // akiskan riski varken fiyat HICBIR KOSULDA otomatik yazilmaz.
      if (outcome.bilinmeyen?.some((t) => extractFluid(t) !== null) && !reason.includes('Akışkan')) {
        reason = `Akışkan bilgisi doğrulanamadı — kontrol edin. ${reason}`;
      }

      return {
        ...bos, // ALTIN KURAL: netPrice 0 — fiyat sorulmadan YAZILMAZ
        confidence: 'multi',
        candidates: cands,
        reason,
        donusum: outcome.donusum ?? undefined,
        variantMissing: outcome.variantMissing ?? undefined,
        // K4 (27.08): ic `kapilar` listesi bu sozlesmeye tasinmiyor; hafiza
        // otoyazi kapisinin okuyabilmesi icin YALNIZ bu kapi bayraga cevrilir.
        // Diger kapilarda otoyazi ZATEN kabul edilmis (aday satirin YAZILI sert
        // kisitlarini saglar); burada aday YAZILI bir kisiti IHLAL ediyor.
        yuzeyGenisletildi: outcome.kapilar?.includes('yuzey-genisletildi') || undefined,
        // K2/CC (27.08): ayni gerekce ikinci kapi icin de gecerli. SATIRIN
        // capi cevrilemediyse eslesme OLCUYLE DOGRULANMAMISTIR; hafiza
        // otoyazisi bunu goremedigi icin kapinin cumlesini silip fiyati
        // 'high' yaziyordu (olculdu: 3/8" satirina 1/2" fiyati, onaysiz).
        capCevrilemedi: outcome.kapilar?.includes('cap-cevrilemedi') || undefined,
        // DN koprusu (27.08): ayni gerekce — istenen olcu bu urunde YOK,
        // eslesme nominal kopruyle kuruldu. Hafiza otoyazisi bunu goremezse
        // kapinin cumlesini silip komsu DN'in fiyatini 'high' yazar (olculdu).
        dnKoprusu: outcome.kapilar?.includes('dn-koprusu') || undefined,
        // Faz 2b: dogrulanamayan yazili kelimeler — M3 multi'de de kosulsun
        dogrulanamadi: outcome.bilinmeyen?.length ? outcome.bilinmeyen : undefined,
      };
    }

    // ── SIFIR: "bu markada yok" (+ alternatifler cagirici tarafindan) ─
    case 'none':
    default: {
      if (outcome.reason === 'urun-degil') {
        return { ...bos, confidence: 'none', notProduct: true, reason: 'Ürün değil (oran/hizmet satırı) — fiyat beklenmez.' };
      }
      const nedenMetni: Record<string, string> = {
        'ad-yok': outcome.detail
          ? `Bu markada "${outcome.detail}" bulunamadı.`
          : 'Bu markada bu ürün ailesi yok.',
        // ── E4 + E6 (26.08): CAP-YOK MESAJI UC YALANI BIRAKTI ──────────
        // (1) KAPSAM: "Bu markada" deniyordu ama olculen kume markanin
        //     tamami DEGIL, satirin AILE/AD suzgecinden gecmis alt kumesi.
        //     Ayni yalan 'Bu markada 2" yok' olarak canliya ciktI (ÇAYIROVA)
        //     ve o tur nokta-atisi baska bir kokle kapatilmisti; METIN
        //     duzeltilmemisti. Artik "bu üründe" denir.
        // (2) ELEYEN KRITER: satirda YAZILI yuzey ('galvaniz') havuzu
        //     daraltip capta bosalttiysa sebep CAP degil YUZEYdir — markada
        //     2" siyah boru DURUYOR olabilir (olculdu). Yuzey anilir ve
        //     "başka yüzeyde olabilir" denir; `mevcutCaplar` zaten o
        //     yuzeye ait oldugu icin liste de dogru etiketlenir.
        // (3) KOPRU: satir inc, kutuphane mm yaziyorsa kullanici '2"' ile
        //     '22 mm'yi kafasinda baglayamiyordu; cevrim rozeti outcome'da
        //     URETILIYOR ama bu metne girmiyordu (FE de 'none' dalinda
        //     tasimiyor). Artik metnin sonunda yer alir.
        'cap-yok': (() => {
          const cap = outcome.detail ?? 'bu çap';
          const yuzey = outcome.yaziliYuzey?.length ? outcome.yaziliYuzey.join(' / ') : null;
          const yakin = outcome.mevcutCaplar?.length
            ? ` · en yakın: ${outcome.mevcutCaplar.join(' / ')}`
            : '';
          const kopru = outcome.donusum ? ` · çevrim: ${outcome.donusum}` : '';
          return yuzey
            ? `Bu üründe ${cap} "${yuzey}" olarak yok${yakin} · başka yüzeyde olabilir${kopru}.`
            : `Bu üründe ${cap} yok${yakin}${kopru}.`;
        })(),
        'kriter-yok': `Bu markada "${outcome.detail ?? 'istenen nitelik'}" taşıyan ürün yok.`,
        // IS 3-B: satirda birlikte bulunamayan yuzeyler yazili (galvaniz+siyah);
        // motor OR'a dustu ama o yuzeylerin HICBIRI bu markada yok.
        'yuzey-celiskisi': `Satırda birlikte bulunamayan yüzeyler yazılı (${
          (outcome.detail ?? 'yüzey').split(' ').join(' / ')}) — bu markada hiçbirini taşıyan ürün yok.`,
        'etiket-yok': 'Satırdan ürün bilgisi çıkarılamadı.',
        // ISCILIK L6: birim uyumu sert — mt satirina adet kalemi aday olamaz
        'birim-uyumsuz': `Satır birimi (${outcome.detail ?? '?'}) ile uyumlu kalem yok.`,
      };
      return {
        ...bos,
        confidence: 'none',
        reason: nedenMetni[outcome.reason] ?? 'Kütüphanede eşleşme yok.',
        donusum: outcome.donusum ?? undefined,
      };
    }
  }
}
