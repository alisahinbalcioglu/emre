/**
 * SURUKLE-DOLDUR — IZOLE MODUL (PRD Kesin Cozum 29.07, Bolum A / SD1-SD10)
 *
 * NEDEN YENIDEN YAZILDI (FAZ 0 kok neden §A):
 * Eski inline mantik ExcelGrid.tsx icinde iki ayri dal olarak (~90 + ~80
 * satir) yasiyordu ve esleme bulunamayinca satiri
 * `setDataValue('_matStatus','yok')` ile isaretlemeye calisiyordu. Ancak
 * _matStatus bir GRID KOLONU DEGIL — AG-Grid tanimsiz kolona yazmayi
 * SESSIZCE yok sayar. Sonuc: marka atanmis 141 satirin 131'i "fiyat yok,
 * isaret yok" durumunda kaldi (SAHINKUL'da kullanicinin bildirdigi semptom).
 * Ayrica `} catch {}` motor hatalarini da sessizce yutuyordu.
 *
 * SOZLESME (SD2 — kod duzeyinde garanti):
 *   Her hedef VERI satiri islenir ve MUTLAKA bir sonuc alir:
 *     · durum='fiyat'      → fiyat + tutar yazildi
 *     · durum='aday'       → coklu aday, _matStatus='belirsiz'
 *     · durum='yok'        → kutuphanede yok, _matStatus='yok'
 *     · durum='urun_degil' → oran/hizmet satiri, _matStatus='urun_degil'
 *     · durum='hata'       → motor hatasi, _matStatus='hata' (SESSIZ YUTMA YOK)
 *     · durum='ad-yok'     → satirda malzeme adi yok, _matStatus='ad-yok'
 *   "Marka atandi ama fiyat sessizce bos" ucuncu bir hal DEGILDIR.
 *
 * SD3 (K17): kaynak fiyat ASLA kopyalanmaz — her hedef, KENDI capiyla taze
 * sorgu yapar. Kaynaktan tasinan tek sey varyant KIMLIGI'dir (marka + cins).
 */
// NOT: relative import — vitest.config.ts'te '@/' alias'i tanimli degil ve
// bu modul birim testle sinaniyor (fill-down.test.ts).
import { hesaplaSatisBirimFiyat, hesaplaSatirToplam, etkinMiktar } from '../../fiyat/pricing';
// NOT: goreli yol ZORUNLU — vitest.config.ts'te '@/' alias'i tanimli degil
// ve bu modul vitest ile kosuyor (fill-down.test.ts).
import { sayiAlani } from '../../fiyat/sayi-alani';

/** Eslestirme motorunun (onBrandChange/onFirmaChange) dondurdugu sonuc. */
export interface MotorSonucu {
  netPrice: number;
  confidence?: string;
  candidates?: Array<unknown>;
  notProduct?: boolean;
  variantTags?: string[];
  variantMissing?: boolean;
  /** Motorun insan-okur gerekcesi ("Seçilen varyant bu çapta kütüphanede
   *  yok — elle seçin." / "Bu markada Ø70 yok · en yakın: …"). */
  reason?: string;
}

export type FillDurum = 'fiyat' | 'aday' | 'yok' | 'urun_degil' | 'hata' | 'ad-yok';

export interface FillSatirSonucu {
  rowIdx: number;
  durum: FillDurum;
  fiyat?: number;
  adaySayisi?: number;
  hata?: string;
  /** SD6: kullaniciya gosterilecek gerekce (motorun reason'i). */
  sebep?: string;
}

export interface FillSonuc {
  satirlar: FillSatirSonucu[];
  ozet: { fiyatli: number; aday: number; yok: number; urunDegil: number; hata: number; adYok: number; atlanan: number };
  /** SD7: doldurmanin TAMAMI tek Ctrl+Z ile geri alinsin diye anlik. */
  geriAl: Array<{ rowIdx: number; oncekiDegerler: Record<string, any> }>;
}

/** AG-Grid node'unun kullanilan yuzeyi (test edilebilirlik icin daraltildi). */
export interface FillNode {
  data: Record<string, any>;
  rowIndex?: number | null;
  setDataValue?: (alan: string, deger: any) => void;
}

/**
 * KD11 — GENEL TOPLAM tazeleme (kalem 54).
 *
 * `recalcGrand` (ExcelGrid.tsx:2386-2397) ile AYNI kural: grandTotal =
 * matToplam + labToplam. Burada tekrarlanmasinin sebebi, o fonksiyonun
 * AG-Grid olay nesnesine (`e.node`) bagli olmasi ve doldurma yolunun olay
 * uretmemesi. Formul (pricing.ts:53) tek; toplama kurali da tek.
 */
function genelToplamiTazele(
  node: FillNode,
  roller: FillRoller,
  yaz: (n: FillNode, alan: string, deger: unknown) => void,
): void {
  const genelAlan = roller.grandTotalField;
  if (!genelAlan) return;
  const oku = (alan?: string) => {
    if (!alan) return 0;
    const v = parseFloat(String((node.data as Record<string, unknown>)[alan] ?? '').replace(',', '.'));
    return Number.isFinite(v) ? v : 0;
  };
  // ⚠ İKİ TARAF DA ROLLERDEN OKUNUR — `totAlan` DAL BİLGİSİ TAŞIR, taraf değil.
  // Eski hâl `mat = oku(totAlan ?? roller.materialTotalField)` idi: işçilik
  // dalında `totAlan = laborTotalField` olduğu için mat ve lab AYNI hücreyi
  // okuyordu → Toplam = 2 × işçilik ve MALZEME TOPLAMI satırdan düşüyordu
  // (ölçüldü: Malz. 1.000 + İşç. 300 → Toplam 600, doğrusu 1.300; müşteriye
  // giden satırda −700 ₺). Malzeme dalında totAlan zaten materialTotalField
  // olduğu için kusur YALNIZ işçilikte görünüyordu — bu turda kapatılan
  // "işçilik dalı malzeme kârını okuyor" ikizinin tıpatıp aynısı.
  // Yazma zaten `totAlan`a yapılmış durumda; burada okunan hep güncel hücre.
  const mat = oku(roller.materialTotalField);
  const lab = oku(roller.laborTotalField);
  yaz(node, genelAlan, (Math.ceil((mat + lab) * 10) / 10).toFixed(1));
}

/**
 * KAR% SURUKLE-DOLDUR — satis birim + satir toplami (P2-1a).
 *
 * NEDEN BURADA: bu hesap `ExcelGrid.tsx:1857-1891` icinde satir ici
 * yasiyordu ve oradaki hali MUHURLU FORMULLERI HIC CAGIRMIYORDU —
 * `netPrice * (1 + kar/100)` ham carpimi + `(finalPrice * qty)` ham carpimi,
 * ustelik `.toFixed(2)`. Ayni hucrelere diger butun yollar
 * `hesaplaSatirToplam(...).toFixed(1)` yaziyordu.
 *
 * Olculen sapma: net 3.019,2 · kar %10 · miktar 3
 *   muhurlu yol      → birim 3.321,2 · toplam 9.963,6
 *   surukle-doldur   → birim 3.321,12 · toplam 9.963,36
 * Yani AYNI SUTUNDA iki farkli para. Bu, 03.08'de kapanan "cift kar"
 * hatasiyla ayni sinif: ikinci bir kod yolunun kendi aritmetigini yapmasi.
 *
 * Z3 sozlesmesi: carpma ICAT EDILMEZ; tek formul `pricing.ts:47/53`.
 */
export function karYayilimi(
  netPrice: number,
  karYuzde: number,
  miktar: number,
): { birim: string; toplam: string } | null {
  if (!(netPrice > 0)) return null;   // net yoksa hucreye dokunulmaz (mevcut davranis)
  const satis = hesaplaSatisBirimFiyat(netPrice, karYuzde);
  return {
    birim: satis.toFixed(1),
    toplam: hesaplaSatirToplam(satis, miktar).toFixed(1),
  };
}

export interface FillRoller {
  nameField?: string;
  noField?: string;
  brandField?: string;
  quantityField?: string;
  unitField?: string;
  diameterField?: string;
  materialUnitPriceField?: string;
  materialTotalField?: string;
  /** KD11: Genel Toplam. Doldurma bunlari YAZMIYORDU — Malz. Toplam doluyor
   *  ama Genel Toplam bos kaliyordu (kalem 54, Yol C). */
  laborTotalField?: string;
  grandTotalField?: string;
}

export interface FillDownArgs {
  hedefler: FillNode[];
  /** Malzeme dalinda marka id'si, isçilik dalinda firma id'si. */
  markaId: string;
  roller: FillRoller;
  /** Eslestirme motoru — satira ELLE ayni secim yapilmis gibi cagrilir (SD1). */
  motor: (rowIdx: number, id: string, ad: string, opts?: { variantTags?: string[]; silent?: boolean }) => Promise<MotorSonucu | null>;
  kaynakVaryantTags: string[] | null;
  kaynakLabel: string;
  /** YALNIZ kayit/dogrulama icin — hedeflere ASLA yazilmaz (SD3). */
  kaynakFiyat?: number;
  /** Isçilik dali icin alan adlari (verilmezse malzeme alanlari kullanilir).
   *  Tek modul iki dali da surer: malzeme (_marka/_matBirim/_matStatus) ve
   *  isçilik (_firma/_labBirim/_labStatus). */
  hedefAlanlar?: {
    birimFiyat?: string; toplam?: string; kaynakRozeti?: string; status?: string;
    /** 'iscilik' → _firma + _labNetPrice; varsayilan 'malzeme'. */
    dal?: 'malzeme' | 'iscilik';
  };
  /** Baglam kurucu: hedef satirin sorgu metni (grup basligi mirasi dahil). */
  sorguMetni?: (node: FillNode) => string;
}

/** Grid alanina yaz — hem veriye hem (kolon varsa) grid'e.
 *  KRITIK: _matStatus gibi KOLONU OLMAYAN alanlarda setDataValue sessizce
 *  hicbir sey yapmaz; bu yuzden data'ya DOGRUDAN yazmak zorunludur. */
function yaz(node: FillNode, alan: string, deger: any): void {
  node.data[alan] = deger;
  try { node.setDataValue?.(alan, deger); } catch { /* kolon yok — data yazimi yeterli */ }
}

export async function fillDown(args: FillDownArgs): Promise<FillSonuc> {
  const { hedefler, markaId, roller, motor, kaynakVaryantTags, kaynakLabel } = args;
  // ── VS TOHUM (25.08 kesif turu) ─────────────────────────────────────
  // Kaynak satirda varyant etiketi OLMAYABILIR: fiyat elle girilmis ya da
  // satir, etiketlerin FE'ye tasinmadigi eski bir kayittan geliyor olabilir.
  // Etiketsiz surukleme her hedefi FILTRESIZ sorgular; coklu adayli (boru
  // disi) ailelerde tum hedefler 'belirsiz' (pembe) kalir — canli PILSA
  // vakasinin FE ayagai. Kural: ilk BASARILI hedefin dondurdugu varyant
  // kimligi sonraki hedeflere TOHUM olur (SD3 bozulmaz — fiyat degil KIMLIK
  // tasinir; kaynak etiketi varsa tohum hic devreye girmez).
  let etkinTags: string[] | null = kaynakVaryantTags;
  const bfAlan = args.hedefAlanlar?.birimFiyat ?? roller.materialUnitPriceField;
  const totAlan = args.hedefAlanlar?.toplam ?? roller.materialTotalField;
  const statusAlan = args.hedefAlanlar?.status ?? '_matStatus';
  const rozetAlan = args.hedefAlanlar?.kaynakRozeti ?? '_matKaynak';
  const iscilikMi = args.hedefAlanlar?.dal === 'iscilik';
  const secimAlan = iscilikMi ? '_firma' : '_marka';
  const netAlan = iscilikMi ? '_labNetPrice' : '_matNetPrice';
  const tagAlan = iscilikMi ? '_labVariantTags' : '_matVariantTags';
  // ⚠ DALDAN TURETILEN ALANLAR TEK YERDE: sebep/aday adlari eskiden dongunun
  // ICINDE (yalniz yazim dalinda) hesaplaniyordu, bu yuzden geri-alma anligina
  // GIREMIYORLARDI. Buraya cikarildilar ki anlik onlari da gorsun.
  const sebepAlan = iscilikMi ? '_labSebep' : '_matSebep';
  const adayAlan = iscilikMi ? '_labAdaySayisi' : '_matAdaySayisi';

  const sonuc: FillSonuc = {
    satirlar: [],
    ozet: { fiyatli: 0, aday: 0, yok: 0, urunDegil: 0, hata: 0, adYok: 0, atlanan: 0 },
    geriAl: [],
  };

  const SNAP = ['_marka', '_firma', '_matNetPrice', '_labNetPrice', '_matSuggestion',
    '_matStatus', '_matVariantMode', '_matAutoVariant', '_matVariantTags', '_matVariantLabel',
    '_matKaynak', '_labKaynak'];

  for (const node of hedefler) {
    if (!node.data?._isDataRow) { sonuc.ozet.atlanan++; continue; }
    const rowIdx: number = node.data._rowIdx;

    // SD7: geri-alma anligi (fiyat alanlari dahil)
    // KURAL: doldurmanin YAZDIGI her alan burada olmali. `genelToplamiTazele`
    // asagida genel toplami YAZIYOR ama anliga EKLENMEMISTI — Ctrl+Z'den sonra
    // Malz. Toplam eskiye donuyor, Toplam yeni degerde KALIYORDU: satir kendi
    // icinde celisikli ve o haliyle kaydediliyordu (KD11 yazmayi ekledi,
    // anligi unuttu). Kapi: fill-down.test.ts "GT-4 SD7 SOZLESMESI" —
    // alan listesi ezberlemez, DEGISEN her alani anlikta arar.
    //
    // ⚠ SABIT LISTE IKIZI KACIRIYORDU (12.08 olculdu): `SNAP` yalniz MALZEME
    // alan adlarini sayiyor. Iscilik dalinda doldurma `_labStatus`,
    // `_labVariantTags`, `_labSebep`, `_labAdaySayisi` YAZIYOR ama bunlarin
    // hicbiri anliga girmiyordu → Ctrl+Z sonrasi satirin firmasi ve fiyati
    // geri donuyor, satir 'yok'/'belirsiz' olarak BOYALI kaliyor ve bayat
    // varyant etiketi bir sonraki surukleme sorgusuna FILTRE olarak gidiyordu.
    // (Malzeme tarafinda `_matSebep`/`_matAdaySayisi` de ayni sekilde disaridaydi.)
    // Cozum: dal bilgisinden turetilen HER alan adi anliga dinamik eklenir —
    // "alan listesi ezberlemez" sozlesmesi artik kodda da gecerli.
    const oncekiDegerler: Record<string, any> = {};
    for (const f of SNAP) oncekiDegerler[f] = node.data[f];
    for (const f of [bfAlan, totAlan, roller.grandTotalField,
      statusAlan, rozetAlan, tagAlan, sebepAlan, adayAlan]) {
      if (f) oncekiDegerler[f] = node.data[f];
    }
    sonuc.geriAl.push({ rowIdx, oncekiDegerler });

    // marka/firma her kosulda atanir (kullanicinin acik niyeti)
    yaz(node, secimAlan, markaId);

    // Sorgu metni: baglam kurucu verildiyse o, yoksa ad (+ ayri cap sutunu)
    const ad = args.sorguMetni
      ? args.sorguMetni(node)
      : [roller.diameterField ? String(node.data[roller.diameterField] ?? '').trim() : '',
        roller.nameField ? String(node.data[roller.nameField] ?? '').trim() : '']
        .filter(Boolean).join(' ');

    if (!ad) {
      // SD2c: sessiz atlama YASAK — isaretlenir
      yaz(node, statusAlan, 'ad-yok');
      sonuc.satirlar.push({ rowIdx, durum: 'ad-yok' });
      sonuc.ozet.adYok++;
      continue;
    }

    let r: MotorSonucu | null = null;
    let hataMesaji = '';
    try {
      const opts = etkinTags && etkinTags.length > 0
        ? { variantTags: etkinTags, silent: true }
        : { silent: true };
      r = await motor(rowIdx, markaId, ad, opts);
    } catch (e: any) {
      hataMesaji = String(e?.message ?? e ?? 'bilinmeyen hata');
    }

    if (hataMesaji) {
      // SD2b: motor hatasi SESSIZCE yutulmaz
      yaz(node, statusAlan, 'hata');
      sonuc.satirlar.push({ rowIdx, durum: 'hata', hata: hataMesaji });
      sonuc.ozet.hata++;
      continue;
    }

    if (r && r.netPrice > 0) {
      // ⚠ İKİZ HATASI (12.08 ölçüldü): burası dal ne olursa olsun `_malzKar`
      // okuyordu. `secimAlan`/`netAlan`/`tagAlan` daldan türetiliyordu ama KÂR
      // türetilmemişti — işçilik firmasını sürükleyip doldurunca işçilik birim
      // fiyatı MALZEME kârıyla çarpılıyordu. Satırda malz %20 / işç %0 ise
      // işçilik fiyatı %20 şişiyor, `sayfaToplamlari` ise maliyeti `_iscKar=0`
      // ile hesaplayıp o %20'yi KÂR OLARAK GÖRMÜYORDU. Bu, testle ilan edilmiş
      // KE15 sözleşmesinin ("malzeme %20 / işçilik %10 KARIŞMAZ",
      // lib/sayfa-toplamlari.test.ts) doldurma yolundaki ihlaliydi.
      const kar = sayiAlani(node.data[iscilikMi ? '_iscKar' : '_malzKar']);
      const satisFiyat = hesaplaSatisBirimFiyat(r.netPrice, kar);
      const miktar = etkinMiktar(node.data, roller.quantityField, roller.unitField);
      yaz(node, netAlan, r.netPrice);
      yaz(node, statusAlan, '');
      yaz(node, rozetAlan, 'kutuphane'); // KG11: kaynak rozeti guncellenir
      if ((!etkinTags || etkinTags.length === 0) && r.variantTags?.length) {
        etkinTags = r.variantTags; // tohum: ilk cozulen kimlik gruba yayilir
      }
      node.data[tagAlan] = etkinTags ?? r.variantTags ?? null;
      if (!iscilikMi) {
        yaz(node, '_matSuggestion', r.confidence === 'suggestion');
        yaz(node, '_matVariantMode', 'auto');
        yaz(node, '_matAutoVariant', kaynakLabel || null);
        node.data._matVariantLabel = kaynakLabel || null;
      }
      if (bfAlan) yaz(node, bfAlan, satisFiyat.toFixed(1));
      if (totAlan) yaz(node, totAlan, hesaplaSatirToplam(satisFiyat, miktar).toFixed(1));
      // ── KD11 (kalem 54, Yol C): GENEL TOPLAM ────────────────────────────
      // Buras: eskiden YALNIZ `totAlan`i yaziyordu. Sonuc: toplu doldurmada
      // Malz. Toplam doluyor, Genel Toplam BOS kaliyordu — kullanicinin
      // SAHINKUL YANGIN'da gordugu "dokuz satirdan yalniz birinde var" tam
      // olarak buydu (o bir satir ELLE marka secilendi, Yol B).
      //
      // Elle secim yolunda (Yol B) Genel Toplam DOLAYLI doluyor:
      // setDataValue -> handleCellValueChanged -> recalcGrand (ExcelGrid.tsx
      // :2500-2507). Doldurma yolu `yaz()` ile node.data'yi dogrudan
      // guncelledigi icin o olay HIC atesmiyor.
      //
      // Yeni carpma ICAT EDILMEDI: ayni tek formul (pricing.ts:53) ve
      // recalcGrand ile ayni toplama kurali (matToplam + labToplam).
      genelToplamiTazele(node, roller, yaz);
      sonuc.satirlar.push({ rowIdx, durum: 'fiyat', fiyat: satisFiyat });
      sonuc.ozet.fiyatli++;
      continue;
    }

    // SD6: EYLEMLI isaret — yalniz renk degil, SEBEP + kac aday oldugu da
    // satirda tasinir. Canli bulgu (30.07): kullanici DN150'ye "kirmizi
    // (astar) boyali" secti, DN65/DN25 caplarinda o cins YOK; motor dogru
    // davranip sessiz ikame yapmadi ama ekranda yalniz pembe hucre gorundu →
    // kullanici "otomatik varyant calismiyor" olarak yasadi. Sebep ve aday
    // sayisi gorunur olmadan isaret EYLEMLI degildir.
    if (r?.reason) yaz(node, sebepAlan, r.reason);

    if (r?.candidates?.length) {
      yaz(node, statusAlan, 'belirsiz');
      yaz(node, adayAlan, r.candidates.length);
      sonuc.satirlar.push({ rowIdx, durum: 'aday', adaySayisi: r.candidates.length, sebep: r.reason });
      sonuc.ozet.aday++;
      continue;
    }

    const durum: FillDurum = r?.notProduct ? 'urun_degil' : 'yok';
    yaz(node, statusAlan, durum === 'urun_degil' ? 'urun_degil' : 'yok');
    sonuc.satirlar.push({ rowIdx, durum, sebep: r?.reason });
    if (durum === 'urun_degil') sonuc.ozet.urunDegil++; else sonuc.ozet.yok++;
  }

  // SD2 GARANTISI (calisma zamani assert): islenen her VERI satiri sonuc almis
  const veriSatiri = hedefler.filter((h) => h.data?._isDataRow).length;
  if (sonuc.satirlar.length !== veriSatiri) {
    throw new Error(`[fillDown] SD2 ihlali: ${veriSatiri} veri satırı, ${sonuc.satirlar.length} sonuç`);
  }
  return sonuc;
}
