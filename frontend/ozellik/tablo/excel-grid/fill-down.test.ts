/**
 * SD1-SD10 — SURUKLE-DOLDUR YENIDEN YAPIM KABUL TESTLERI
 * (PRD Kesin Cozum 29.07, Bolum A)
 *
 * FAZ 0 kok neden (FAZ0_KOK_NEDEN_RAPORU.md §A): esleme bulunamayinca satir
 * setDataValue('_matStatus','yok') ile isaretleniyor ama _matStatus bir GRID
 * KOLONU DEGIL → AG-Grid tanimsiz kolona yazmayi sessizce yok sayiyor →
 * ne fiyat ne isaret. Olcum: marka atanmis 141 satirin 131'i SESSIZ BOS.
 *
 * Bu paket, doldurmanin izole modulunu (fill-down.ts) sozlesmesiyle sinar.
 * SD2'nin cekirdegi: her hedef satir MUTLAKA bir sonuc alir — "marka atandi
 * ama fiyat sessizce bos" durumu imkansizdir.
 */
import { describe, it, expect, vi } from 'vitest';
import { fillDown, FillSonuc, MotorSonucu } from './fill-down';

/** Test cift'i: grid node taklidi (AG-Grid API yuzeyinin kullanilan kismi). */
function node(rowIdx: number, ad: string, miktar: number, extra: Record<string, any> = {}) {
  const data: Record<string, any> = { _rowIdx: rowIdx, _isDataRow: true, col1: ad, col3: miktar, ...extra };
  return {
    data,
    rowIndex: rowIdx,
    setDataValue: (k: string, v: any) => { data[k] = v; },
  };
}

const ROLLER = {
  nameField: 'col1', noField: 'col0', brandField: 'col2',
  quantityField: 'col3', unitField: 'col4',
  materialUnitPriceField: 'col5', materialTotalField: 'col6',
};

/** SAHINKUL GALVANİZ ÇELİK BORU grubu — kullanicinin senaryosu. */
function sahinkulHedefleri() {
  return [
    node(108, '¾"', 565), node(109, '1"', 140), node(110, '1¼"', 230),
    node(111, '1½"', 6), node(112, '2"', 60), node(113, '2½"', 6),
  ];
}

/** Cap → kutuphane fiyati (SD3/SD5: her cap KENDI fiyatini alir). */
const KUTUPHANE: Record<string, number> = {
  '¾"': 65.9, '1"': 92.3, '1¼"': 128.7, '1½"': 149.5, '2"': 291.2, '2½"': 372.8,
};

function motorFabrikasi(opts: { yokOlanlar?: string[]; adaylıOlanlar?: string[]; hataAtanlar?: string[] } = {}) {
  const cagrilar: string[] = [];
  const motor = async (rowIdx: number, brandId: string, ad: string): Promise<MotorSonucu | null> => {
    cagrilar.push(ad);
    const cap = Object.keys(KUTUPHANE).find((k) => ad.includes(k));
    if (opts.hataAtanlar?.some((c) => ad.includes(c))) throw new Error('ağ hatası');
    if (cap && opts.yokOlanlar?.includes(cap)) return { netPrice: 0, confidence: 'none' };
    if (cap && opts.adaylıOlanlar?.includes(cap)) {
      return { netPrice: 0, confidence: 'multi', candidates: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] as any };
    }
    if (!cap) return { netPrice: 0, confidence: 'none' };
    return { netPrice: KUTUPHANE[cap], confidence: 'high' };
  };
  return { motor, cagrilar };
}

describe('SD1-SD10 sürükle-doldur modülü', () => {
  it('SD1 tek motor: her hedef satır için eşleştirme motoru çağrılır (drag özel yol YOK)', async () => {
    const { motor, cagrilar } = motorFabrikasi();
    const hedefler = sahinkulHedefleri();
    await fillDown({ hedefler: hedefler as any, markaId: 'brand-1', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(cagrilar.length).toBe(6);
    // sorgular hedefin KENDI capini tasir (kaynagin capini DEGIL)
    expect(cagrilar.some((c) => c.includes('¾"'))).toBe(true);
    expect(cagrilar.some((c) => c.includes('2½"'))).toBe(true);
  });

  it('TOHUM-1 kaynakta etiket yoksa ilk COZULEN hedefin kimligi sonrakilere tasinir (VS 25.08)', async () => {
    // Canli PILSA vakasinin FE ayagi: kaynak fiyati elle girilmis/eski kayit →
    // _matVariantTags bos → etiketsiz surukleme her hedefi filtresiz sorgular
    // ve coklu adayli ailelerde hepsi 'belirsiz' kalirdi. Kural: ilk basarili
    // hedefin dondurdugu variantTags sonraki cagrilar icin TOHUM olur.
    const gordugumTags: Array<string[] | undefined> = [];
    const motor = async (_r: number, _b: string, ad: string, opts?: { variantTags?: string[] }): Promise<MotorSonucu | null> => {
      gordugumTags.push(opts?.variantTags);
      const cap = Object.keys(KUTUPHANE).find((k) => ad.includes(k));
      if (!cap) return { netPrice: 0, confidence: 'none' };
      return { netPrice: KUTUPHANE[cap], confidence: 'high', variantTags: ['ad:pp kuresel vana', 'cins:yapistirma'] };
    };
    const hedefler = sahinkulHedefleri();
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b1', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(sonuc.ozet.fiyatli).toBe(6);
    // ilk cagri TOHUMSUZ (kaynakta etiket yok), sonraki 5 cagri tohumu tasir
    expect(gordugumTags[0]).toBeUndefined();
    for (const t of gordugumTags.slice(1)) expect(t).toEqual(['ad:pp kuresel vana', 'cins:yapistirma']);
    // satirlara da tohum yazilir (bayat degil, cozulen kimlik)
    for (const h of hedefler) expect(h.data._matVariantTags).toEqual(['ad:pp kuresel vana', 'cins:yapistirma']);
  });

  it('TOHUM-2 kaynakta etiket VARSA tohum devreye girmez — kaynak kimligi kazanir', async () => {
    const gordugumTags: Array<string[] | undefined> = [];
    const motor = async (_r: number, _b: string, ad: string, opts?: { variantTags?: string[] }): Promise<MotorSonucu | null> => {
      gordugumTags.push(opts?.variantTags);
      const cap = Object.keys(KUTUPHANE).find((k) => ad.includes(k));
      return cap ? { netPrice: KUTUPHANE[cap], confidence: 'high', variantTags: ['cins:BASKA'] } : { netPrice: 0, confidence: 'none' };
    };
    const hedefler = sahinkulHedefleri();
    await fillDown({ hedefler: hedefler as any, markaId: 'b1', roller: ROLLER, motor, kaynakVaryantTags: ['cins:galvaniz'], kaynakLabel: 'Galvaniz' });
    for (const t of gordugumTags) expect(t).toEqual(['cins:galvaniz']);
    for (const h of hedefler) expect(h.data._matVariantTags).toEqual(['cins:galvaniz']);
  });

  it('SD2 atomik sonuç: HER hedef satır fiyat VEYA eylemli işaret alır — sessiz boş imkânsız', async () => {
    // 2 satır fiyatlı, 2 satır kütüphanede yok, 2 satır çok adaylı
    const { motor } = motorFabrikasi({ yokOlanlar: ['1¼"', '1½"'], adaylıOlanlar: ['2"', '2½"'] });
    const hedefler = sahinkulHedefleri();
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'brand-1', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });

    expect(sonuc.satirlar.length).toBe(6);
    for (const s of sonuc.satirlar) {
      const fiyatli = s.durum === 'fiyat';
      const isaretli = s.durum === 'aday' || s.durum === 'yok' || s.durum === 'urun_degil' || s.durum === 'hata';
      expect(fiyatli || isaretli).toBe(true); // üçüncü hâl YOK
    }
    // grid'e yazılan: fiyatlı satırda değer, işaretli satırda _matStatus
    for (const h of hedefler) {
      const fiyat = String(h.data[ROLLER.materialUnitPriceField] ?? '').trim();
      const status = String(h.data._matStatus ?? '').trim();
      expect(fiyat !== '' || status !== '').toBe(true); // SESSİZ BOŞ YASAK
    }
    expect(sonuc.ozet.fiyatli).toBe(2);
    expect(sonuc.ozet.aday).toBe(2);
    expect(sonuc.ozet.yok).toBe(2);
  });

  it('SD2b motor exception atsa bile satır işaretlenir (catch{} sessizliği yasak)', async () => {
    const { motor } = motorFabrikasi({ hataAtanlar: ['1¼"'] });
    const hedefler = sahinkulHedefleri();
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    const hatali = sonuc.satirlar.find((s) => s.rowIdx === 110);
    expect(hatali?.durum).toBe('hata');
    const gridNode = hedefler.find((h) => h.data._rowIdx === 110)!;
    expect(String(gridNode.data._matStatus ?? '')).not.toBe(''); // işaret ZORUNLU
  });

  it('SD3 kaynak fiyat ASLA kopyalanmaz: her satır kendi çapının fiyatını alır', async () => {
    const { motor } = motorFabrikasi();
    const hedefler = sahinkulHedefleri();
    await fillDown({
      hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor,
      kaynakVaryantTags: ['ad:galvaniz celik boru'], kaynakLabel: 'Galvaniz',
      kaynakFiyat: 52.4, // ½" kaynağının fiyatı — hiçbir hedefe yazılmamalı
    });
    const fiyatlar = hedefler.map((h) => parseFloat(String(h.data[ROLLER.materialUnitPriceField])));
    expect(fiyatlar).toEqual([65.9, 92.3, 128.7, 149.5, 291.2, 372.8]);
    expect(fiyatlar.includes(52.4)).toBe(false);
  });

  it('SD5 ŞAHİNKUL kabulü: tutar = miktar × birim fiyat (565 mt, 140 mt…)', async () => {
    const { motor } = motorFabrikasi();
    const hedefler = sahinkulHedefleri();
    await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    const h0 = hedefler[0]; // ¾" · 565 mt · 65,9
    expect(parseFloat(String(h0.data[ROLLER.materialTotalField]))).toBeCloseTo(565 * 65.9, 1);
    const h1 = hedefler[1]; // 1" · 140 mt · 92,3
    expect(parseFloat(String(h1.data[ROLLER.materialTotalField]))).toBeCloseTo(140 * 92.3, 1);
  });

  it('SD6 kütüphanede yok → eylemli işaret; çok aday → aday sayısı taşınır', async () => {
    const { motor } = motorFabrikasi({ yokOlanlar: ['¾"'], adaylıOlanlar: ['1"'] });
    const hedefler = sahinkulHedefleri();
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    const yok = sonuc.satirlar.find((s) => s.rowIdx === 108)!;
    expect(yok.durum).toBe('yok');
    expect(hedefler[0].data._matStatus).toBe('yok');
    const aday = sonuc.satirlar.find((s) => s.rowIdx === 109)!;
    expect(aday.durum).toBe('aday');
    expect(aday.adaySayisi).toBe(3);
    expect(hedefler[1].data._matStatus).toBe('belirsiz');
  });

  it('SD7 geri-alma anlığı: doldurmadan ÖNCEKİ değerler tek pakette döner', async () => {
    const { motor } = motorFabrikasi();
    const hedefler = sahinkulHedefleri();
    hedefler[0].data[ROLLER.materialUnitPriceField] = '11.1'; // önceden dolu
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(sonuc.geriAl.length).toBe(6);
    const ilk = sonuc.geriAl.find((g) => g.rowIdx === 108)!;
    expect(ilk.oncekiDegerler[ROLLER.materialUnitPriceField]).toBe('11.1');
  });

  it('SD10 duyarlılık: hedefin çapı değişirse dönen fiyat DEĞİŞMEK zorunda', async () => {
    const { motor } = motorFabrikasi();
    const a = [node(200, '¾"', 10)];
    const b = [node(200, '2"', 10)];
    await fillDown({ hedefler: a as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    await fillDown({ hedefler: b as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    const fa = parseFloat(String(a[0].data[ROLLER.materialUnitPriceField]));
    const fb = parseFloat(String(b[0].data[ROLLER.materialUnitPriceField]));
    expect(fa).not.toBe(fb);
  });

  it('SD8 veri satırı olmayan hedefler atlanır ama sayımda görünür', async () => {
    const { motor } = motorFabrikasi();
    const bandi = node(120, 'GRUP BANDI', 0);
    bandi.data._isDataRow = false;
    const hedefler = [...sahinkulHedefleri(), bandi];
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(sonuc.satirlar.length).toBe(6); // bandı işlenmedi
    expect(sonuc.ozet.atlanan).toBe(1);
  });

  it('SD6b CANLI VAKA: kaynağın varyantı hedef çapta yoksa SEBEP + aday sayısı satıra yazılır', async () => {
    // 30.07 canlı bulgu: DN150'ye "kırmızı (astar) boyalı" seçildi; DN65/DN25
    // çaplarında o cins yok. Motor doğru davranıp sessiz ikame yapmadı ama
    // ekranda yalnız pembe hücre vardı → "otomatik varyant çalışmıyor".
    const motor = async (): Promise<MotorSonucu> => ({
      netPrice: 0,
      confidence: 'multi',
      candidates: [{ label: 'siyah' }, { label: 'galvanizli' }] as any,
      reason: 'Seçilen varyant bu çapta kütüphanede yok — elle seçin.',
    });
    const hedefler = [node(109, 'Dikişli Siyah Çelik Boru, DN65', 34000)];
    const sonuc = await fillDown({
      hedefler: hedefler as any, markaId: 'cayirova', roller: ROLLER, motor,
      kaynakVaryantTags: ['ad:celik boru', 'cins:kirmizi (astar) boyali'], kaynakLabel: 'kırmızı boyalı',
    });
    expect(sonuc.satirlar[0].durum).toBe('aday');
    expect(sonuc.satirlar[0].sebep).toContain('bu çapta kütüphanede yok');
    // satırda GÖRÜNÜR: sebep + aday sayısı (tooltip bunları okur)
    expect(hedefler[0].data._matSebep).toContain('elle seçin');
    expect(hedefler[0].data._matAdaySayisi).toBe(2);
    expect(hedefler[0].data._matStatus).toBe('belirsiz');
  });

  it('SD2c adı boş satır SESSİZ atlanmaz — işaretlenir', async () => {
    const { motor } = motorFabrikasi();
    const bos = node(130, '', 5);
    const sonuc = await fillDown({ hedefler: [bos] as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(sonuc.satirlar.length).toBe(1);
    expect(sonuc.satirlar[0].durum).toBe('ad-yok');
    expect(String(bos.data._matStatus ?? '')).not.toBe('');
  });

  // ── KÂR HÜCRESİNİN OKUNMASI (12.08) ────────────────────────────────────
  // Beklenen değerler ELDE hesaplandı; ürünün formülünden TÜRETİLMEDİ
  // (dairesel ölçüt yasak). satış = net × (1+kar), 1 haneye yukarı.

  const ISCILIK_ALANLARI = {
    birimFiyat: '_labBirim', toplam: '_labToplam',
    status: '_labStatus', kaynakRozeti: '_labKaynak', dal: 'iscilik' as const,
  };
  const netVeren = (net: number) => async (): Promise<MotorSonucu> =>
    ({ netPrice: net, confidence: 'high' });

  it('KÂR-1 İKİZ: işçilik dalı _iscKar okur — MALZEME kârı işçilik fiyatına BULAŞMAZ', async () => {
    // Satırda malzeme %50, işçilik %0. Doldurma öncesi hata: dal ne olursa
    // olsun `_malzKar` okunuyordu → işçilik net 200 iken 300 yazılıyordu ve
    // `sayfaToplamlari` maliyeti _iscKar=0 ile hesapladığı için o %50 kâr
    // olarak HİÇ görünmüyordu (KE15 sözleşmesinin ihlali).
    const h = node(200, 'Montaj bedeli', 2, { _malzKar: 50, _iscKar: 0 });
    await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER, motor: netVeren(200),
      kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });
    expect(h.data._labBirim).toBe('200.0');   // kusurlu hâl: '300.0'
    expect(h.data._labToplam).toBe('400.0');  // kusurlu hâl: '600.0'
  });

  it('KÂR-2 İKİZ: malzeme dalı _iscKar\'dan ETKİLENMEZ', async () => {
    const h = node(201, 'Çelik boru', 2, { _malzKar: 0, _iscKar: 50 });
    await fillDown({
      hedefler: [h] as any, markaId: 'marka-1', roller: ROLLER, motor: netVeren(200),
      kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data[ROLLER.materialUnitPriceField]).toBe('200.0');
  });

  it('KÂR-3 TR KLAVYE: "12,5" ekranda da 12,5 — 12 DEĞİL (kayıtla aynı süzgeç)', async () => {
    // Kusurlu hâl: `parseFloat("12,5")` = 12 → birim 112.0 / toplam 224.0.
    // Kayıt yolu (`sayiAlani`) aynı hücreden 12,5 okuyordu: ekranda gördüğün
    // fiyat ile veritabanına yazılan kâr AYRIŞIYORDU.
    const h = node(202, 'Çelik boru', 2, { _malzKar: '12,5' });
    await fillDown({
      hedefler: [h] as any, markaId: 'marka-1', roller: ROLLER, motor: netVeren(100),
      kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data[ROLLER.materialUnitPriceField]).toBe('112.5'); // 100 × 1,125
    expect(h.data[ROLLER.materialTotalField]).toBe('225.0');     // 112,5 × 2
  });

  // ── GENEL TOPLAM: DOLDURMA YOLU (12.08 çekişmeli inceleme bulgusu) ─────
  // ⚠ AYRI ROLLER: yukarıdaki ROLLER'da `grandTotalField` YOK — bu yüzden
  // `genelToplamiTazele` ilk satırındaki `if (!genelAlan) return;` ile hemen
  // çıkıyor ve SD1-SD10'un hiçbiri o fonksiyonu ÇALIŞTIRMIYORDU. Kusur tam
  // olarak orada saklandı. ROLLER'ı genişletmek yerine yenisi: mevcut
  // testlerin beklentileri değişmesin.
  const ROLLER_GENEL = {
    ...ROLLER,
    laborTotalField: '_labToplam',
    grandTotalField: '_toplam',
  };

  it('GT-1 İŞÇİLİK doldurmasında Toplam = malzeme + işçilik (işçilik İKİ KEZ sayılmaz)', async () => {
    // Kusurlu hâl: mat = oku(totAlan ?? materialTotalField) — işçilik dalında
    // totAlan = '_labToplam' olduğu için mat de lab de AYNI hücreyi okuyordu.
    // Sonuç: Toplam = 2 × işçilik ve MALZEME TOPLAMI satırdan düşüyordu.
    const h = node(300, 'Montaj bedeli', 2, { [ROLLER.materialTotalField]: '1000.0', _toplam: '1000.0' });
    await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER_GENEL, motor: netVeren(150),
      kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });
    expect(h.data._labToplam).toBe('300.0');            // 150 × 2
    expect(h.data._toplam).toBe('1300.0');              // kusurlu hâl: '600.0'
  });

  it('GT-2 MALZEME doldurmasında da Toplam = malzeme + işçilik (ikiz simetrisi)', async () => {
    const h = node(301, 'Çelik boru', 2, { _labToplam: '1000.0', _toplam: '1000.0' });
    await fillDown({
      hedefler: [h] as any, markaId: 'marka-1', roller: ROLLER_GENEL, motor: netVeren(150),
      kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data[ROLLER.materialTotalField]).toBe('300.0');
    expect(h.data._toplam).toBe('1300.0');
  });

  it('GT-3 malzeme toplamı BOŞken işçilik doldurması Toplam\'ı şişirmez', async () => {
    const h = node(302, 'Montaj bedeli', 2, {});
    await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER_GENEL, motor: netVeren(150),
      kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });
    expect(h.data._toplam).toBe('300.0');               // kusurlu hâl: '600.0'
  });

  it('GT-4 SD7 SÖZLEŞMESİ: YAZILAN her alan geri-alma anlığında da var', async () => {
    // Kural, alan listesi ezberlemeden: doldurmanın DEĞİŞTİRDİĞİ her alan
    // snapshot'ta olmalı. Yoksa Ctrl+Z satırı kendi içinde çelişkili bırakır
    // (Malz. Toplam eskiye döner, Toplam yeni değerde kalır) ve o hâliyle
    // kaydedilir. KD11 genel toplamı YAZMAYI ekledi, anlığa eklemeyi unuttu.
    const oncesi = { [ROLLER.materialTotalField]: '1000.0', _toplam: '1000.0', _labToplam: '' };
    const h = node(303, 'Çelik boru', 2, { ...oncesi });
    const sonuc = await fillDown({
      hedefler: [h] as any, markaId: 'marka-1', roller: ROLLER_GENEL, motor: netVeren(150),
      kaynakVaryantTags: null, kaynakLabel: '',
    });

    const anlik = sonuc.geriAl[0].oncekiDegerler;
    const degisenler = Object.keys(h.data).filter((k) => h.data[k] !== (oncesi as any)[k] && k in oncesi);
    expect(degisenler.length, 'doldurma hiçbir şeyi değiştirmediyse test bir şey ölçmüyor').toBeGreaterThan(0);
    for (const alan of degisenler) {
      expect(Object.prototype.hasOwnProperty.call(anlik, alan), `${alan} YAZILDI ama geri-alma anlığında YOK`).toBe(true);
    }
    // Geri alma satiri gercekten eski hale dondurur mu (SD7'nin sozu)
    for (const [k, v] of Object.entries(anlik)) h.data[k] = v;
    expect(h.data._toplam).toBe('1000.0');
    expect(h.data[ROLLER.materialTotalField]).toBe('1000.0');
  });

  // ── GT-5..GT-7: SD7 ANLIĞININ İŞÇİLİK İKİZİ (12.08) ───────────────────────
  //
  // GT-4 iki yerden birden zayıftı ve ikizi göremiyordu: (a) `hedefAlanlar`
  // vermediği için MALZEME dalını koşuyor, (b) `k in oncesi` süzgeci ölçümü
  // tohumlanmış 3 anahtara indiriyor. Snapshot listesi (`SNAP`) yalnız `_mat*`
  // adlarını sayıyordu; işçilik dalının yazdığı `_labStatus` ve
  // `_labVariantTags` anlığa HİÇ girmiyordu → Ctrl+Z sonrası satırın firması ve
  // fiyatı geri dönerken satır 'yok' olarak BOYALI kalıyor, bayat varyant
  // etiketi de bir sonraki sürükleme sorgusuna FİLTRE olarak gidiyordu.

  /** ExcelGrid.tsx:1553 geri-alma döngüsünün birebir taklidi. */
  function geriAl(h: any, anlik: Record<string, any>) {
    for (const [k, v] of Object.entries(anlik)) h.data[k] = v;
  }

  it('GT-5 İŞÇİLİK: eşleşme yok işareti geri-alma anlığında var — Ctrl+Z sonrası satır boyalı kalmaz', async () => {
    const h = node(304, 'Montaj bedeli', 2, { _labStatus: '', _labSebep: null });
    const sonuc = await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER_GENEL,
      motor: async () => ({ netPrice: 0, confidence: 'none', reason: 'Firmada bu kalem yok' } as any),
      kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });
    // MEKANİZMA: doldurma işareti GERÇEKTEN yazdı (yoksa test bir şey ölçmüyor)
    expect(h.data._labStatus).toBe('yok');

    geriAl(h, sonuc.geriAl[0].oncekiDegerler);
    expect(h.data._labStatus).toBe(''); // kusurlu hâlde 'yok' KALIYORDU
  });

  it('GT-6 İŞÇİLİK: varyant etiketi geri-alma anlığında var — bayat etiket sonraki sorguya filtre olmaz', async () => {
    const h = node(305, 'Montaj bedeli', 2, { _labVariantTags: null });
    const sonuc = await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER_GENEL, motor: netVeren(150),
      kaynakVaryantTags: ['kaynakli'], kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });
    expect(h.data._labVariantTags).toEqual(['kaynakli']); // yazıldığı ölçüldü

    geriAl(h, sonuc.geriAl[0].oncekiDegerler);
    expect(h.data._labVariantTags).toBeNull(); // kusurlu hâlde ['kaynakli'] KALIYORDU
  });

  it('GT-7 SD7 SÖZLEŞMESİ İŞÇİLİK DALINDA: doldurmanın DEĞİŞTİRDİĞİ her alan anlıkta', async () => {
    // ⚠ GT-4'ün aksine süzgeç YOK: tohumlanmamış alanlar da ölçülür.
    const h = node(306, 'Montaj bedeli', 2, {});
    const oncesi = { ...h.data };
    const sonuc = await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER_GENEL,
      motor: async () => ({ netPrice: 0, confidence: 'multi', candidates: [{ label: 'A' }, { label: 'B' }], reason: 'Birim uyuşmuyor' } as any),
      kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });

    const anlik = sonuc.geriAl[0].oncekiDegerler;
    const degisenler = Object.keys(h.data).filter((k) => h.data[k] !== (oncesi as any)[k]);
    expect(degisenler.length, 'doldurma hiçbir şeyi değiştirmediyse test bir şey ölçmüyor').toBeGreaterThan(0);
    for (const alan of degisenler) {
      expect(Object.prototype.hasOwnProperty.call(anlik, alan), `${alan} YAZILDI ama geri-alma anlığında YOK`).toBe(true);
    }
    // Aday sayısı ve sebep de gerçekten yazıldı mı (payda kilidi)
    expect(h.data._labAdaySayisi).toBe(2);
    expect(h.data._labSebep).toBe('Birim uyuşmuyor');

    geriAl(h, anlik);
    expect(h.data._labAdaySayisi).toBeUndefined();
    expect(h.data._labSebep).toBeUndefined();
  });

  it('KÂR-4 ELLE YAZILAN STRING "50" sayı gibi çalışır', async () => {
    const h = node(203, 'Çelik boru', 2, { _malzKar: '50' });
    await fillDown({
      hedefler: [h] as any, markaId: 'marka-1', roller: ROLLER, motor: netVeren(100),
      kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data[ROLLER.materialUnitPriceField]).toBe('150.0');
  });
});
