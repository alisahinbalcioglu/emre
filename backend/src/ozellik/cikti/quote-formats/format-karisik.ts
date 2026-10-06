// ════════════════════════════════════════════════════════════════════
// TEKLIF FORMATI — KARISIK PARA BIRIMI (İCMAL, 05.10)
//
// KARAR (Emre'nin onerilen onayi, koordinator uzerinden 05.10): "karma metin
// yalniz musteri formatindaki tek hucre yer tutucularinda, kendi formatimizda
// para birimi basina satir". Dolar liraya EKLENMEZ, cevrim YAPILMAZ (karar 04.10).
//
// Teklif karisik duzendeyse (`dovizliTarafVarMi` — $/€ taraf var; F6a'dan beri yalniz-₺ teklif tek birimli yolu alir)
// "Teklif formatında aktar":
//  · İCMAL satirlari sayfa × birim ("Mekanik ₺", "Mekanik $"): malzeme ve
//    iscilik liste sayfasinin gizli J/K birim sutunlarina SUMIF ile bagli
//    (`export-engine.ts` `karisikSekmeBirimleri`), hucre bicimi satirin birimi.
//  · Birim ekli etiket ({{GENEL_TOPLAM_USD}}) o birimin toplamidir: yalniz o
//    birimin İCMAL satirlarini toplar.
//  · Eksiz etiket ({{GENEL_TOPLAM}}) TEKLIF GENELINDE karar verir (inceleme
//    05.10): tutari olan birden cok birim varsa DORT para etiketinin hepsi
//    KARMA METIN ("212.579,00 ₺ + $2.932,13"; o etikette tutari olmayan
//    birim yazilmaz). Etiket basina karar verilseydi malzeme $ sayisi, iscilik
//    ₺ sayisi olur, musterinin kendi `=F12+F13` formulu doları liraya SESSIZCE
//    eklerdi. Tek birimde sayi/formul (canli); o birim ₺ ise tek birimli yolun
//    aynisi (musterinin bicimi korunur, metin icinde simgesiz).
//  · Musteri formatina satir EKLENMEZ (T3 altin kurali). Musterinin KENDI
//    formulu birimli bir para hucresine basvuruyorsa indirme UYARI tasir
//    (`birimliHucreyeBakanFormuller`).
//  · Yerlesik formatta toplam blogu birim basina (`yerlesikToplamlariBirimle`,
//    cagiran `export-engine.ts`).
// Tek birimli teklif bu dosyaya HIC girmez (`fillPlaceholders` — yalniz-TL cikti
// bayt bayt ayni). Kapi: test:export-karisik.
// ════════════════════════════════════════════════════════════════════
import * as ExcelJS from 'exceljs';
import { kurusTamsayi } from '../../fiyat/matching/pricing';
import { BIRIM_SIRASI, ParaBirimi, SEMBOL, hucreToplami, paraMetni } from '../../teklif/quotes/cikti-karisik';
import {
  FillContext, IcmalBolgesi, IcmalSatiri, KOLON_HARF, ParaDolgusu, SayiDolgusu, SekmeBirimi, TOPLAM_ETIKETLERI,
  YerTutucu, birimliEtiket, etiketleriYaz, icmalSatirlariniYaz, kdvVarMi, sabitDegerler, scanWorkbook, sinirda,
} from './format-engine';

type ToplamEtiketi = (typeof TOPLAM_ETIKETLERI)[number];
type BirimliToplamlar = Map<ParaBirimi, Record<ToplamEtiketi, SayiDolgusu>>;

/** Kalemsiz (metin) sayfa: tek bos ₺ satiri — tek birimli yolun "0" satirinin ikizi. */
const BOS_BIRIM: SekmeBirimi = { pb: 'TRY', matFormul: '0', labFormul: '0', matDeger: 0, labDeger: 0 };

const sayfaRef = (ad: string) => `'${ad.replace(/'/g, "''")}'`;

export interface KarisikDolum {
  dolan: YerTutucu[];
  /** Musteri formulu birimli para hucresine basvuruyor (teklif birden cok birimde) — indirme uyarisi */
  uyari?: string;
}

/** Karisik teklifin `fillPlaceholders` ikizi: ayni iki adim, birim basina. */
export function karisikDoldur(wb: ExcelJS.Workbook, ctx: FillContext): KarisikDolum {
  const dolan: YerTutucu[] = [];
  // ── 1. İCMAL: sayfa × birim ──
  const satirlar: IcmalSatiri[] = ctx.sekmeler.flatMap((s) => (s.birimler?.length ? s.birimler : [BOS_BIRIM]).map((b) => ({
    ad: `${s.name} ${SEMBOL[b.pb]}`,
    mat: { formul: b.matFormul, deger: b.matDeger },
    lab: { formul: b.labFormul, deger: b.labDeger },
    pb: b.pb,
  })));
  const bolge = icmalSatirlariniYaz(wb, satirlar, dolan);

  // ── 2. Toplamlar: her birim kendi satirlarini toplar ──
  const tarama = scanWorkbook(wb);
  const kdvVar = kdvVarMi(tarama.bulunan);
  const birimli: BirimliToplamlar = new Map(
    BIRIM_SIRASI.map((pb) => [pb, birimToplamlari(pb, satirlar, bolge, ctx.kdvOran, kdvVar)]),
  );
  const sayisal: Record<string, ParaDolgusu> = {};
  for (const [pb, t] of birimli) for (const e of TOPLAM_ETIKETLERI) sayisal[birimliEtiket(e, pb)] = t[e];
  // Teklif geneli: tutari olan birimler (malzeme + iscilik)
  const dolu = BIRIM_SIRASI.filter((pb) => {
    const t = birimli.get(pb)!;
    return kurusTamsayi(t.MALZEME_TOPLAMI.deger + t.ISCILIK_TOPLAMI.deger) !== 0;
  });
  const varolan = BIRIM_SIRASI.filter((pb) => satirlar.some((s) => s.pb === pb));
  for (const e of TOPLAM_ETIKETLERI) sayisal[e] = eksizDolgu(e, birimli, dolu, varolan);

  etiketleriYaz(wb, tarama.bulunan, sabitDegerler(ctx), sayisal, dolan);
  const bakan = dolu.length > 1 ? birimliHucreyeBakanFormuller(wb, dolan) : [];
  return {
    dolan,
    ...(bakan.length ? {
      uyari: `Formatınızdaki ${bakan.length} formül para birimi başına doldurulan hücrelere başvuruyor (${bakan.slice(0, 3).join(', ')}${bakan.length > 3 ? ' …' : ''}). `
        + 'Teklif birden çok para birimi içerdiği için bu formüller $ ile ₺\'yi toplayabilir ya da metin tutarı atlayabilir — kontrol edin.',
    } : {}),
  };
}

/**
 * Eksiz etiket, TEKLIF GENELINDE: birden cok birimde tutar → bu etiketin
 * tutari olan birimleri karma METIN (hic yoksa "0,00" ilk birimde); tek birimde
 * o birimin sayi/formulu. Tek birim ₺ ise `pb` TASIMAZ: tek birimli yolun
 * aynisi (musterinin TL bicimi korunur, metin icinde simgesiz rakam).
 */
function eksizDolgu(e: ToplamEtiketi, birimli: BirimliToplamlar, dolu: ParaBirimi[], varolan: ParaBirimi[]): ParaDolgusu {
  if (dolu.length > 1) {
    const parcalar = dolu.filter((pb) => kurusTamsayi(birimli.get(pb)![e].deger) !== 0);
    return { karma: (parcalar.length ? parcalar : [dolu[0]]).map((pb) => paraMetni(birimli.get(pb)![e].deger, pb)).join(' + ') };
  }
  const pb = dolu[0] ?? varolan[0] ?? 'TRY';
  const t = birimli.get(pb)![e];
  return pb === 'TRY' ? { formula: t.formula, deger: t.deger } : t;
}

/**
 * Bir birimin dort toplami. İCMAL bolgesi varsa o birimin İCMAL hucrelerini
 * toplar (yalniz o birimin satirlari — dolar satiri lira toplamina girmez);
 * yoksa sayfalarin o birim formullerini birlestirir. Birimin satiri yoksa 0.
 * KDV ve GENEL TOPLAM tek birimli yolun kuraliyla (formatta KDV etiketi varsa dahil).
 */
function birimToplamlari(
  pb: ParaBirimi, satirlar: readonly IcmalSatiri[], bolge: IcmalBolgesi | null, kdvOran: number, kdvVar: boolean,
): Record<ToplamEtiketi, SayiDolgusu> {
  const bunlar = satirlar.map((s, i) => ({ s, i })).filter((x) => x.s.pb === pb);
  const matDeger = bunlar.reduce((a, x) => a + x.s.mat.deger, 0);
  const labDeger = bunlar.reduce((a, x) => a + x.s.lab.deger, 0);
  const formul = (alan: 'mat' | 'lab'): string | null => {
    if (bunlar.length === 0) return null;
    if (bolge) {
      const kol = KOLON_HARF(alan === 'mat' ? bolge.matCol : bolge.labCol);
      return hucreToplami(bunlar.map(({ i }) => `${sayfaRef(bolge.sheet)}!${kol}${bolge.ilk + i}`));
    }
    const parcalar = bunlar.map(({ s }) => s[alan].formul);
    return parcalar.some((p) => !p) ? null : parcalar.join('+');
  };
  const matF = sinirda(formul('mat'), birimliEtiket('MALZEME_TOPLAMI', pb));
  const labF = sinirda(formul('lab'), birimliEtiket('ISCILIK_TOPLAMI', pb));
  const araF = sinirda(matF && labF ? `${matF}+${labF}` : null, `ARA_TOPLAM_${pb}`);
  const ara = matDeger + labDeger;
  const kdv = ara * kdvOran;
  return {
    MALZEME_TOPLAMI: { formula: matF, deger: matDeger, pb },
    ISCILIK_TOPLAMI: { formula: labF, deger: labDeger, pb },
    KDV: { formula: araF ? `(${araF})*${kdvOran}` : null, deger: kdv, pb },
    GENEL_TOPLAM: kdvVar
      ? { formula: araF ? `(${araF})*${1 + kdvOran}` : null, deger: ara + kdv, pb }
      : { formula: araF, deger: ara, pb },
  };
}

/** Formuldeki hucre/aralik referanslari: sayfa adi (tirnakli ya da yalin, Turkce
 *  harfli) YALNIZ `!` ile; sol sinir — ad/fonksiyon icinden eslesmez. */
const REF_RE = /(?<![A-Za-z0-9_.À-ɏ])(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_.À-ɏ]+))!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/g;
const kolonNo = (h: string) => [...h].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/**
 * Musterinin KENDI formulleri (bizim yazmadigimiz hucreler) birimli para
 * hucrelerimize — İCMAL tutarlari, birimli/karma toplamlar — basvuruyor mu?
 * Karisik teklifte o formul ₺ ile $'i toplar (SUM metni de sessizce atlar).
 * Doner: "Sayfa!A1" listesi (sabit sirada).
 */
export function birimliHucreyeBakanFormuller(wb: ExcelJS.Workbook, dolan: readonly YerTutucu[]): string[] {
  const bizim = new Set(dolan.map((d) => `${d.sheet}!${d.addr}`));
  // Para hucresi: birimli sayi/formul (İCMAL tutarlari, birim ekli toplamlar) ya da
  // eksiz toplam (karma metin dahil). İCMAL ad hucresi (metin) degil.
  const paraHucre = dolan.flatMap((d) => {
    const h = wb.getWorksheet(d.sheet)!.getCell(d.addr) as any;
    const v: any = h.value;
    const sayisal = typeof v === 'number' || (v && typeof v === 'object' && typeof v.formula === 'string');
    const eksizToplam = (TOPLAM_ETIKETLERI as readonly string[]).includes(d.etiket);
    return (d.pb && sayisal) || eksizToplam ? [{ sheet: d.sheet, r: h.row as number, c: h.col as number }] : [];
  });
  const sonuc: string[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
      const v: any = cell.value;
      const formul = v && typeof v === 'object' && typeof v.formula === 'string' ? v.formula : null;
      if (!formul || bizim.has(`${ws.name}!${cell.address}`)) return;
      const temiz = formul.replace(/"[^"]*"/g, '""');
      REF_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = REF_RE.exec(temiz)) !== null) {
        const ad = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2] ?? ws.name;
        const c1 = kolonNo(m[3]); const r1 = Number(m[4]);
        const c2 = m[5] ? kolonNo(m[5]) : c1; const r2 = m[6] ? Number(m[6]) : r1;
        const deger = paraHucre.some((p) => p.sheet === ad && p.r >= Math.min(r1, r2) && p.r <= Math.max(r1, r2) && p.c >= Math.min(c1, c2) && p.c <= Math.max(c1, c2));
        if (deger) { sonuc.push(`${ws.name}!${cell.address}`); return; }
      }
    }));
  }
  return sonuc;
}
