/* BÖLÜM D — ŞAHİNKUL ALTIN SENARYOSU (PRD Kesin Çözüm 29.07, FAZ 3)
 * Gerçek tarayıcı · gerçek yığın · gerçek dosya. 10 dosyalık altın yol
 * koşumunun 11. testi (`test:e2e-golden`).
 *
 * Adımlar (PRD §Bölüm D):
 *   1. Yükle → dosyanın İŞÇİLİK fiyatları grid'de görünür (KG10)
 *   2. ½" satırına ÇAYIROVA → 2½"'e kadar sürükle → 6 hedef satırın HER BİRİ
 *      ya KENDİ fiyatını ya EYLEMLİ İŞARET alır (SD2/SD5); kaynak fiyat
 *      kopyalanmaz (SD3)
 *   3. Kaydet → yeniden aç → seçim/fiyatlar aynen (C4)
 *   4. USD → dosyadan gelen işçilikler DAHİL tek kurla çevrilir (KG13)
 *   5. İki export + 6. adım ikinci indirme (KE12/C9); fazladan kolon yok (KE21/C11)
 *
 * Derin doğrulama (C1-C11) ayrı: verify.mjs — bu spec KANIT üretir ve
 * senaryoya özgü şartları burada `expect` ile SERTÇE sınar.
 */
import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { artefaktKok } from './artefakt-dizini.cjs';
import {
  harvestGrid, selectDropdown, fillFamilyDown, waitForPricesToSettle,
  resolvePopupIfAny, listDropdownOptions, scrollRowIntoView, PopupLogEntry, Harvest,
} from './helpers';
// KD9: beklenen gosterimi URUNUN KENDI fonksiyonu uretir — test kendi
// yuvarlama modelini kurarsa urunle ayrisir (kok neden tam buydu).
import { paraBicim, PARA_ONDALIK } from '../../ozellik/fiyat/pricing';

const FIXTURES = path.resolve(__dirname, '../../test-fixtures/e2e');
// PK10: her kosum kendi damgali dizinine yazar (uzerine yazma yok)
const ARTIFACTS = artefaktKok();
const AUTH = JSON.parse(fs.readFileSync(path.join(__dirname, '.auth.json'), 'utf8'));
const SLUG = '11-sahinkul-altin-senaryo';
const DOSYA = 'FIRMA-A KEŞİF ÖZETİ 251224 R1 - FIRMA-B MÜHENDİSLİK.xlsx';
const SAYFA = 'SIHHİ';
/** GALVANİZ ÇELİK BORU ailesi — kaynak ½", hedefler ¾"…2½" (PRD kanıtı). */
const CAPLAR = ['½"', '¾"', '1"', '1¼"', '1½"', '2"', '2½"'];
/** Kullanıcının popup'ta seçeceği varyant. Satırın grup başlığı "GALVANİZ
 *  ÇELİK BORU" — gerçek kullanıcı GALVANİZ ürünü seçer. Testin kör "ilk aday"
 *  politikası burada "Basınçlı Boru Siyah" seçiyordu; o aile ¾"–2½" arasında
 *  bulunmadığı için sürükleme her satırda "seçim bekliyor" bırakıyordu —
 *  ölçüm kaynaklı, ürün hatası DEĞİL (bkz FAZ3_RAPOR §4b). */
const VARYANT_TERCIHI = /galvaniz/i;

/** Windows NFD/NFC: Türkçe dosya adı ayrık birleştiricilerle saklanabilir. */
const gercekYol = (ad: string) => {
  const tam = path.join(FIXTURES, ad);
  if (fs.existsSync(tam)) return tam;
  const bulunan = fs.readdirSync(FIXTURES).find((f) => f.normalize('NFC') === ad.normalize('NFC'));
  if (!bulunan) throw new Error(`Fixture bulunamadi: ${ad}`);
  return path.join(FIXTURES, bulunan);
};
/** "₺52,32" / "1.234,50" → 52.32 / 1234.5 */
const tlNum = (s: string): number | null => {
  const m = String(s ?? '').replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const f = parseFloat(m);
  return isNaN(f) ? null : f;
};
const sadeCap = (s: string) => String(s ?? '').replace(/\s+/g, '').trim();

/** Bir satırın hücre metni + arka plan rengi (SD2 işareti CSS ile taşınır:
 *  pembe #fee2e2 = 'yok'/'belirsiz', gri #f1f5f9 = 'urun_degil'). */
async function satirOku(page: Page, idx: number, colIds: string[]) {
  await scrollRowIntoView(page, idx);
  return await page.evaluate(({ idx, colIds }) => {
    const out: Record<string, { text: string; bg: string }> = {};
    for (const cid of colIds) {
      const el = document.querySelector(`[row-index="${idx}"] [col-id="${cid}"]`) as HTMLElement | null;
      out[cid] = el
        ? { text: (el.textContent ?? '').trim(), bg: getComputedStyle(el).backgroundColor }
        : { text: '', bg: '' };
    }
    return out;
  }, { idx, colIds });
}
/** Hücre arka planının anlamı (ExcelGrid cellStyle sözleşmesi). */
const rozetTipi = (bg: string) =>
  /254,\s*226,\s*226/.test(bg) ? 'seçim-bekliyor/eşleşme-yok'
    : /241,\s*245,\s*249/.test(bg) ? 'ürün-değil'
      : /224,\s*242,\s*254/.test(bg) ? 'otomatik-varyant'
        : /254,\s*249,\s*195/.test(bg) ? 'öneri' : 'işaretsiz';
/** SD2: satırda EYLEMLİ bir işaret var mı (renk sözleşmesindeki her rozet). */
const isaretliMi = (bg: string) => rozetTipi(bg) !== 'işaretsiz';

/** Grid kolon KİMLİKLERİNİ başlıktan çöz.
 *  ŞAHİNKUL'da fiyat kolonları artık DOSYANIN kendi kolonlarıdır (col6…col11) —
 *  Bölüm B/C düzeltmesinin görünür sonucu. `_matBirim`/`_labBirim` sistem
 *  alanlarını sabitlemek bu dosyada HİÇBİR hücre bulamaz (ilk koşumda KG10
 *  "0 satır" derken ekranda işçilik fiyatları apaçık duruyordu). */
async function kolonKimlikleri(page: Page) {
  const basliklar = await page.evaluate(() => {
    const out: { id: string; text: string }[] = [];
    document.querySelectorAll('.ag-header-cell[col-id]').forEach((h) => {
      const id = h.getAttribute('col-id') ?? '';
      const t = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (id && !out.some((x) => x.id === id)) out.push({ id, text: t });
    });
    return out;
  });
  const bul = (test: (t: string) => boolean, fallback: string) => {
    const h = basliklar.find((x) => test(x.text.toLocaleLowerCase('tr')));
    return h?.id ?? fallback;
  };
  const tutar = (t: string) => /tutar|toplam/.test(t);
  // ⚠ SABIT SEMA TUZAGI (31.07). Eski olcut "X iceren ve tutar OLMAYAN ILK
  // baslik" idi; standart 13 kolonda bu iki kez yanlis kolonu secti:
  //   /malz/  → "Malzeme Adı"  (fiyat yerine cap metni "½"" okunuyordu)
  //   /işç/   → "İşç. Kar %"   (hep 0 → KG10 "0 satir" diyordu)
  // Birim fiyat kolonu artik NEGATIF eleme ile degil, POZITIF desenle
  // aranir: hem "birim" hem "fiyat" gecmeli. Dosyanin kendi basliklari da
  // ayni desene uyar ("BİRİM FİYAT MALZEME" · "TOPLAM FİYAT İŞÇİLİK").
  const birimFiyat = (t: string) => /birim/.test(t) && /fiyat/.test(t);
  const malz = (t: string) => /malz/.test(t) && !/malzeme\s*ad/.test(t);
  const isc = (t: string) => /(i̇şç|işç|isc)/.test(t);
  return {
    basliklar,
    matUnit: bul((t) => malz(t) && birimFiyat(t), '_matBirim'),
    matTot: bul((t) => malz(t) && tutar(t), '_matToplam'),
    labUnit: bul((t) => isc(t) && birimFiyat(t), '_labBirim'),
    labTot: bul((t) => isc(t) && tutar(t), '_labToplam'),
    miktar: bul((t) => /miktar|metraj/.test(t), ''),
  };
}

test('BÖLÜM D — ŞAHİNKUL altın senaryosu (sürükle-doldur · KG10 · KG13 · KE21)', async ({ page }) => {
  const dir = path.join(ARTIFACTS, SLUG);
  fs.mkdirSync(dir, { recursive: true });
  const timing: Record<string, number> = {};
  const t0 = () => Date.now();
  const consoleErrors: string[] = [];
  const popupLog: PopupLogEntry[] = [];
  const senaryo: Record<string, any> = { dosya: DOSYA, sayfa: SAYFA };
  let savePayload: any = null; let savedQuote: any = null; let createdId = '';
  // KD9 — kutu icinde tutulur: TS, closure icinde atanan bir "let"i okuma
  // noktasinda hala "null" sanip tipi "never"e daraltiyor.
  const kurKutu: { yanit: { usdTry?: number; eurTry?: number } | null } = { yanit: null };
  const exportHeaders: Record<string, Record<string, string>> = {};

  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/api\/quotes$/.test(req.url())) {
      try { savePayload = req.postDataJSON(); } catch { /* buyuk payload */ }
    }
  });
  page.on('response', async (res) => {
    const u = res.url();
    // KD9: kur, DOGRULANACAK EKRAN VERISINDEN degil AGDAN alinir. Sayfanin
    // kendi `/exchange-rates` cevabini yakalariz — yani cevrimde GERCEKTEN
    // kullanilan sayi. Test kendi HTTP istegini atsaydi backend bu arada
    // cache'i tazeleyip BASKA bir kur donebilirdi.
    if (/\/exchange-rates/.test(u)) {
      try { kurKutu.yanit = await res.json(); } catch { /* no-op */ }
    }
    if (/\/api\/quotes$/.test(u) && res.request().method() === 'POST') {
      try { createdId = (await res.json())?.id ?? ''; } catch { /* no-op */ }
    }
    if (/export-priced|\/export$/.test(u)) {
      const h = res.headers();
      const key = /export-priced/.test(u) ? 'priced' : 'format';
      exportHeaders[exportHeaders[key] ? key + '-2' : key] = {
        'x-export-summary': h['x-export-summary'] ?? '',
        'x-export-warning': h['x-export-warning'] ?? '',
        'content-disposition': h['content-disposition'] ?? '',
      };
    }
  });
  await page.addInitScript((auth) => {
    localStorage.setItem('token', auth.token);
    localStorage.setItem('user', JSON.stringify(auth.user));
  }, AUTH);

  // ── ADIM 1: YÜKLE — dosyanın İŞÇİLİK fiyatları grid'de görünmeli (KG10) ──
  let t = t0();
  await page.goto('/quotes/new');
  await page.locator('#quote-excel-upload').setInputFiles(gercekYol(DOSYA));
  await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 180_000 });
  timing.yukleme_ms = t0() - t;

  const tabBtns = page.locator('.sticky.bottom-0 button[title]');
  const sheetNames: string[] = [];
  const tabCount = await tabBtns.count();
  for (let i = 0; i < tabCount; i++) sheetNames.push((await tabBtns.nth(i).getAttribute('title')) ?? '');
  const sIdx = sheetNames.findIndex((n) => n.normalize('NFC') === SAYFA.normalize('NFC'));
  expect(sIdx, `"${SAYFA}" sekmesi bulunamadı (sekmeler: ${sheetNames.join('|')})`).toBeGreaterThanOrEqual(0);
  await tabBtns.nth(sIdx).click();
  await page.waitForTimeout(900);

  const KOL = await kolonKimlikleri(page);
  senaryo.kolonlar = KOL;
  // ÖLÇÜM KAPISI (31.07): kolon cozumu sessizce kayarsa asagidaki her sart
  // anlamsiz bir yerden okur ve hata BASKA kriterin ustune yikilir (KG10 "0
  // satir" derken ekranda fiyatlar duruyordu). Cozum ARTIK once dogrulanir.
  for (const [alan, id] of [['matUnit', KOL.matUnit], ['matTot', KOL.matTot],
    ['labUnit', KOL.labUnit], ['labTot', KOL.labTot]] as const) {
    expect(id, `kolon çözümü kaydı: ${alan}="${id}" — başlıklar: ${KOL.basliklar.map((b) => b.text).join(' | ')}`)
      .toMatch(/^(_matBirim|_matToplam|_labBirim|_labToplam|col\d+)$/);
  }
  const yuklemeHasat = await harvestGrid(page);
  // KG10: dosyada 85 satırda İŞÇİLİK BİRİM FİYAT dolu (I kolonu) — hiçbir
  // fiyatlama yapılmadan grid'de görünmeli. "İçe al / yok say" sorusu YOK.
  const iscilikliSatir = yuklemeHasat.rows.filter((r) => (tlNum(r.cells[KOL.labUnit] ?? '') ?? 0) > 0);
  senaryo.KG10 = {
    iscilikKolonu: KOL.labUnit,
    iscilikDoluSatir: iscilikliSatir.length,
    ornekler: iscilikliSatir.slice(0, 5).map((r) => `satır${r.idx}: ${r.cells[KOL.labUnit]}`),
    yuklemeGenelToplam: yuklemeHasat.genelToplam,
  };
  expect(iscilikliSatir.length, 'KG10: dosyadaki işçilik birim fiyatları yüklemede grid\'de görünmeli').toBeGreaterThanOrEqual(20);
  expect(yuklemeHasat.genelToplam, 'KG10: GENEL TOPLAM dosyadan gelen değerlerle hesaplanmalı').toMatch(/[1-9]/);
  await page.screenshot({ path: path.join(dir, 'ss-1-yuklendi-iscilik-gorunur.png') });

  // ── ADIM 2: ½" → 2½" SÜRÜKLE-DOLDUR (SD2/SD3/SD5) ───────────────────────
  // Aile satırlarını METINDEN bul (indeks sabitlemek kırılgan): ardışık
  // 7 satırın hücrelerinde ½" ¾" 1" 1¼" 1½" 2" 2½" dizisi.
  // ⚠ SABIT SEMA (31.07): eski olcut "_ ile baslayan TUM alanlari atla" idi —
  // cunku cap dosyanin KENDI kolonundaydi (colN). Sabit semada dosyadan yalniz
  // No·Ad·Miktar·Birim okunuyor ve bu dosyada cap `_ad` alanina dusuyor:
  // R107-R113 = ½" ¾" 1" 1¼" 1½" 2" 2½" (backend parse olcumu, 31.07).
  // Eski olcut hicbir hucre goremedigi icin aile bulunamiyordu (kaynakIdx=-1).
  const CAP_ALANLARI = ['_ad', '_birim'];
  const satirCapi = (r: Harvest['rows'][number]) => {
    for (const [k, v] of Object.entries(r.cells)) {
      if (k.startsWith('_') && !CAP_ALANLARI.includes(k)) continue;
      const s = sadeCap(v);
      if (CAPLAR.includes(s)) return s;
    }
    return '';
  };
  const tumSatirlar = yuklemeHasat.rows;
  let kaynakIdx = -1;
  for (let i = 0; i < tumSatirlar.length; i++) {
    const dizi = CAPLAR.map((_, k) => tumSatirlar[i + k] ? satirCapi(tumSatirlar[i + k]) : '');
    if (dizi.every((d, k) => d === CAPLAR[k])) { kaynakIdx = tumSatirlar[i].idx; break; }
  }
  expect(kaynakIdx, 'GALVANİZ ÇELİK BORU ailesi (½"…2½") bulunamadı').toBeGreaterThanOrEqual(0);
  const hedefIdx = CAPLAR.slice(1).map((_, k) => kaynakIdx + 1 + k); // 6 hedef satır
  senaryo.aile = { kaynakIdx, hedefIdx, caplar: CAPLAR };

  t = t0();
  const markalar = await listDropdownOptions(page, kaynakIdx, '_marka');
  const cayirova = markalar.find((m) => /çayırova|cayirova/i.test(m));
  expect(cayirova, `ÇAYIROVA markası dropdown'da yok (mevcut: ${markalar.slice(0, 8).join('|')})`).toBeTruthy();
  expect(await selectDropdown(page, kaynakIdx, '_marka', cayirova!), 'kaynak satıra marka seçilemedi').toBe(true);
  await resolvePopupIfAny(page, kaynakIdx, `${CAPLAR[0]} (kaynak)`, popupLog, VARYANT_TERCIHI);
  await waitForPricesToSettle(page, 60_000, [KOL.matUnit, KOL.labUnit]);

  const kaynak = await satirOku(page, kaynakIdx, ['_marka', KOL.matUnit, KOL.matTot]);
  const kaynakFiyat = tlNum(kaynak[KOL.matUnit].text);
  senaryo.kaynak = { marka: kaynak._marka.text, birim: kaynak[KOL.matUnit].text, toplam: kaynak[KOL.matTot].text };
  expect(kaynakFiyat, `kaynak ½" satırı fiyat almalı (SD3 tabanı) — okunan: "${kaynak[KOL.matUnit].text}"`).toBeTruthy();

  // SÜRÜKLE: alt kenar çift-tıkla → aile sonuna kadar doldur
  await fillFamilyDown(page, kaynakIdx, '_marka');
  await waitForPricesToSettle(page, 120_000, [KOL.matUnit, KOL.labUnit]);
  await resolvePopupIfAny(page, kaynakIdx, 'doldurma sonrası', popupLog, VARYANT_TERCIHI);
  await waitForPricesToSettle(page, 60_000, [KOL.matUnit, KOL.labUnit]);
  timing.doldurma_ms = t0() - t;

  const hedefSonuc: any[] = [];
  for (let k = 0; k < hedefIdx.length; k++) {
    const h = await satirOku(page, hedefIdx[k], ['_marka', KOL.matUnit, KOL.matTot]);
    const fiyat = tlNum(h[KOL.matUnit].text);
    hedefSonuc.push({
      cap: CAPLAR[k + 1], idx: hedefIdx[k], marka: h._marka.text,
      birim: h[KOL.matUnit].text, toplam: h[KOL.matTot].text,
      bg: h[KOL.matUnit].bg, rozet: rozetTipi(h[KOL.matUnit].bg),
      isaret: isaretliMi(h[KOL.matUnit].bg), fiyat,
    });
  }
  // NOT: faz A anlık görüntüsü KOPYALANIR — hedefSonuc dizisi FAZ B'de yerinde
  // güncelleniyor; referans yazılırsa rapor iki fazı da B durumuyla gösterir.
  senaryo.SD = { kaynakFiyat, faz_A_surukleme: hedefSonuc.map((h) => ({ ...h })) };
  await page.screenshot({ path: path.join(dir, 'ss-2-surukle-doldur.png') });

  // ── FAZ A ölçütü (SD2): "marka atandı ama fiyat sessizce boş" ÜÇÜNCÜ HAL
  //    DEĞİLDİR. Satır ya fiyat alır ya EYLEMLİ işaret taşır.
  const sessizBos = hedefSonuc.filter((h) => !h.fiyat && !h.isaret);
  expect(sessizBos.map((h) => `${h.cap}(satır${h.idx}, bg=${h.bg})`).join(', '),
    'SD2: hedef satır ya fiyat ya EYLEMLİ İŞARET almalı — sessiz boş yasak').toBe('');

  // ── SD5 ASIL KABUL: sürükleme TEK ADIMDA fiyatlamalı ────────────────────
  // Kaynakta seçilen varyant (galvaniz) kütüphanede ¾"–2½" arasında tek adaya
  // indiği için her hedef KENDİ çapının fiyatını doğrudan almalıdır. Kalan
  // satırlar SD6 rozetinden çözülür (aşağıdaki Faz B), ama bu bir İSTİSNADIR:
  // ölçüt, sürüklemenin kendisinin çalıştığını görmektir.
  const fazAFiyatli = hedefSonuc.filter((h) => h.fiyat);
  senaryo.SD.faz_A_fiyatli = fazAFiyatli.length;
  expect(fazAFiyatli.length,
    `SD5: sürükleme 6 hedefin en az 5'ini TEK ADIMDA fiyatlamalı (alan: ${fazAFiyatli.length} — ${hedefSonuc.map((h) => `${h.cap}:${h.birim || 'BOŞ'}`).join(' ')})`)
    .toBeGreaterThanOrEqual(5);

  // SD6 kanıtı: işaretin SEBEBİ ve aday sayısı tooltip'te taşınmalı
  const isaretli = hedefSonuc.find((h) => !h.fiyat && h.isaret);
  if (isaretli) {
    await scrollRowIntoView(page, isaretli.idx);
    await page.locator(`[row-index="${isaretli.idx}"] [col-id="${KOL.matUnit}"]`).first().hover().catch(() => {});
    await page.waitForTimeout(1500);
    senaryo.SD6_tooltip = (await page.locator('.ag-tooltip, [class*="tooltip"]').first().textContent().catch(() => '')) ?? '';
    senaryo.SD6_satir = `${isaretli.cap} (satır ${isaretli.idx})`;
  }

  // ── FAZ B (SD6): işaret EYLEMLİ mi — rozetten çözülüyor mu? ─────────────
  // Faz A'da fiyat alamayan satır varsa (kütüphanede o varyant o çapta yoksa)
  // kullanıcının yolu izlenir: marka menüsü → popup → varyant seç → fiyat.
  // Sağlıklı kütüphanede bu döngü BOŞ geçer.
  for (const h of hedefSonuc) {
    if (h.fiyat) continue;
    const ok = await selectDropdown(page, h.idx, '_marka', cayirova!);
    if (!ok) continue;
    await resolvePopupIfAny(page, h.idx, `${h.cap} (rozet çözümü)`, popupLog, VARYANT_TERCIHI);
    await waitForPricesToSettle(page, 30_000, [KOL.matUnit, KOL.labUnit]);
    const y = await satirOku(page, h.idx, [KOL.matUnit, KOL.matTot]);
    h.fiyat = tlNum(y[KOL.matUnit].text);
    h.birim = y[KOL.matUnit].text;
    h.toplam = y[KOL.matTot].text;
    h.rozettenCozuldu = true;
  }
  senaryo.SD.faz_B_rozet_cozumu = hedefSonuc.map((h) => ({ cap: h.cap, birim: h.birim, toplam: h.toplam, rozettenCozuldu: !!h.rozettenCozuldu }));
  senaryo.SD.popupAdaylari = popupLog.map((p) => `${p.name}: ${p.adaylar} aday → ${p.secilen.slice(0, 40)}`);
  await page.screenshot({ path: path.join(dir, 'ss-2b-rozet-cozuldu.png') });

  // SD5 — 6 hedefin her biri KENDİ fiyatını almalı
  const fiyatli = hedefSonuc.filter((h) => h.fiyat);
  expect(fiyatli.length, `SD5: 6 hedefin her biri kendi fiyatını almalı (alan: ${fiyatli.length})`).toBeGreaterThanOrEqual(5);
  // SD3 — kaynak fiyat KOPYALANMAZ: farklı çaplar farklı fiyat verir
  // NOT: Set spread YASAK — frontend tsconfig'inde `target` yok, TS2802
  // verir ve CI'daki `tsc --noEmit` kapisi kirilir (helpers.ts'te ayni not).
  const farkli = Array.from(new Set(fiyatli.map((h) => h.fiyat)));
  expect(farkli.length, `SD3: hedef fiyatları kopya değil, taze sorgu olmalı (bulunan tekil fiyat: ${farkli.join(',')})`).toBeGreaterThanOrEqual(2);
  const kaynakKopyasi = fiyatli.filter((h) => Math.abs((h.fiyat as number) - (kaynakFiyat as number)) < 0.01);
  expect(kaynakKopyasi.length, `SD3: kaynak ₺${kaynakFiyat} hiçbir hedefe kopyalanmamalı`).toBeLessThanOrEqual(1);
  // SD5 — tutar = miktar × birim fiyat
  const hasat2 = await harvestGrid(page);
  const mikOku = (idx: number) => {
    const r = hasat2.rows.find((x) => x.idx === idx);
    return KOL.miktar ? tlNum(r?.cells[KOL.miktar] ?? '') : null;
  };
  const tutarHatasi = hedefSonuc.filter((h) => {
    if (!h.fiyat) return false;
    const mik = mikOku(h.idx); const tut = tlNum(h.toplam);
    if (!mik || !tut) return false;
    return Math.abs(mik * h.fiyat - tut) > 0.02 * tut;
  });
  expect(tutarHatasi.map((h) => `${h.cap}: ${h.birim}×mik≠${h.toplam}`).join(', '),
    'SD5: tutar = miktar × birim fiyat').toBe('');
  // GENEL TOPLAM güncellendi
  senaryo.SD.genelToplamOnce = yuklemeHasat.genelToplam;
  senaryo.SD.genelToplamSonra = hasat2.genelToplam;
  expect(hasat2.genelToplam, 'SD5: doldurma sonrası GENEL TOPLAM güncellenmeli').not.toBe(yuklemeHasat.genelToplam);
  // TÜM sekmelerin TL hasadı — C3/C6 (İCMAL toplamı tüm sayfaları taşır) bu
  // veriye dayanır; USD'ye geçmeden ÖNCE toplanır (ekran TL, payload TRY).
  const sheetsScreen: { name: string; harvest: Harvest }[] = [];
  for (let i = 0; i < tabCount; i++) {
    await tabBtns.nth(i).click();
    await page.waitForTimeout(800);
    sheetsScreen.push({ name: sheetNames[i], harvest: i === sIdx ? hasat2 : await harvestGrid(page) });
  }
  await tabBtns.nth(sIdx).click();
  await page.waitForTimeout(800);

  // ── ADIM 4 (KG13): USD — dosyadan gelen İŞÇİLİKLER DAHİL tek kur ────────
  const tlKare = await harvestGrid(page);
  const orneklem = tlKare.rows
    .filter((r) => (tlNum(r.cells[KOL.labUnit] ?? '') ?? 0) > 0 || (tlNum(r.cells[KOL.matUnit] ?? '') ?? 0) > 0)
    .slice(0, 40)
    .map((r) => ({ idx: r.idx, mat: tlNum(r.cells[KOL.matUnit] ?? ''), lab: tlNum(r.cells[KOL.labUnit] ?? '') }));
  await page.getByRole('button', { name: 'USD', exact: true }).click();
  await page.waitForTimeout(1800);
  const usdKare = await harvestGrid(page);
  const ciftler: { idx: number; tip: string; tl: number; usd: number }[] = [];
  for (const o of orneklem) {
    const r = usdKare.rows.find((x) => x.idx === o.idx);
    if (!r) continue;
    const mu = tlNum(r.cells[KOL.matUnit] ?? ''), lu = tlNum(r.cells[KOL.labUnit] ?? '');
    if (o.mat && mu) ciftler.push({ idx: o.idx, tip: 'malzeme', tl: o.mat, usd: mu });
    if (o.lab && lu) ciftler.push({ idx: o.idx, tip: 'işçilik', tl: o.lab, usd: lu });
  }
  // ══ KD9 (02.08.2026) — ÖLÇÜT DAİRESELLİKTEN ÇIKARILDI ═══════════════════
  //
  // ESKİ MODEL: kur, doğrulanacak EKRAN DEĞERLERİNDEN geri çıkarılıyordu
  // (`kurAmpirik` = usd≥100 çiftlerinin tl/usd medyanı) ve her çift o kura
  // karşı SABİT bir toleransla (0,05·kur+0,06 ≈ 2,43 TL) sınanıyordu.
  // İki kusur birleşiyordu:
  //   1) Tahminci gürültülü: ekran 1 ondalığa yuvarlı olduğundan usd≈100
  //      çiftlerinde oran hatası ±0,024 mertebesinde.
  //   2) Tolerans SABİT ama kur hatasının satır başına katkısı `tl·δ/kur` —
  //      TL ile ORANTILI büyüyor ve hiç bütçelenmemiş.
  // Sonuç: ₺50.000'lik bir satırda δ=0,003 (yani %0,006) tüm bütçeyi yiyordu.
  // 31.07 koşumunda tam bu oldu; sapan çıkan 3 değerin üçünün de "işçilik"
  // olması bir kolon farkı DEĞİL, sadece dosyadan gelen işçiliklerin
  // (₺3.000-50.000) kütüphane malzemelerinden (~₺600) BÜYÜK olmasıydı.
  // Kanıt ve matematik: `backend/test/kd9-kur-olcutu-test.ts` (npm run test:kd9).
  //
  // YENİ MODEL: kur AĞDAN alınır (sayfanın kendi /exchange-rates yanıtı),
  // beklenen gösterim ÜRÜNÜN KENDİ fonksiyonuyla (`paraBicim`) üretilir ve
  // TAM EŞİTLİK aranır. Tahmin yok → tolerans da yok.
  // Tek pay: TL değeri de ekrandan 1 ondalıkla okunduğu için gerçek taban
  // [tl−0,05, tl+0,05] aralığındadır; beklenen USD bu aralığın İKİ UCUNDAN
  // üretilir ve gözlenen değer bu kümede olmalıdır. Bu pay ÖLÇÜLMÜŞ ve
  // SINIRLIDIR — tahmin edilmiş değil.
  const usdTry = Number(kurKutu.yanit?.usdTry);
  expect(usdTry, 'KG13/KD9: /exchange-rates yanıtı yakalanmalı (kur bağımsız kaynaktan gelir)')
    .toBeGreaterThan(1);
  const carpan = 1 / usdTry;                       // use-currency.ts:74 ile AYNI işlem sırası

  // Ekranda görünen kur ETİKETİ — AYRI bir kriter (etiket doğruluğu).
  const kurMetni = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  const kurEsle = /1\s*USD\s*=\s*₺?\s*([\d.,]+)/.exec(kurMetni) ?? /USD\s*₺\s*([\d.,]+)/.exec(kurMetni);
  const kurEtiketi = kurEsle ? tlNum(kurEsle[1]) : null;

  const beklenenKume = (tl: number): string[] => Array.from(new Set([
    paraBicim(tl - 0.05, carpan), paraBicim(tl, carpan), paraBicim(tl + 0.05, carpan),
  ]));
  const sapanlar = ciftler.filter((c) => {
    // Hane sayisi urunun sabitinden (P2-1b: 1→2); sabit yazilirsa test
    // urunle ayrisir — KD9'un kok nedeni tam olarak buydu.
    const gozlenen = (c.usd as number).toLocaleString('tr-TR',
      { minimumFractionDigits: PARA_ONDALIK, maximumFractionDigits: PARA_ONDALIK });
    return !beklenenKume(c.tl).includes(gozlenen);
  });
  senaryo.KG13 = {
    usdTry, kurEtiketi, kurKaynagi: kurEsle?.[0] ?? '', orneklem: ciftler.length,
    olcut: 'KD9: bağımsız kur + ürünün paraBicim fonksiyonu + tam eşitlik (tolerans YOK)',
    malzeme: ciftler.filter((c) => c.tip === 'malzeme').slice(0, 3),
    iscilik: ciftler.filter((c) => c.tip === 'işçilik').slice(0, 3),
    sapanlar: sapanlar.slice(0, 5).map((c) => ({ ...c, beklenen: beklenenKume(c.tl) })),
  };
  expect(ciftler.filter((c) => c.tip === 'işçilik').length,
    'KG13: dosyadan gelen işçilik değerleri de USD görünümde olmalı').toBeGreaterThan(0);
  expect(ciftler.filter((c) => c.tip === 'malzeme').length,
    'KG13: kütüphaneden gelen malzeme değerleri de USD görünümde olmalı (ikinci aile)').toBeGreaterThan(0);
  // Etiket doğruluğu — AYRI kriter: gösterilen kur, çevrimde kullanılanın
  // 2 ondalığa yuvarlanmış hâli olmalı (ekranda yalan kur yazamaz).
  expect(kurEtiketi, 'KG13: USD görünümünde kur etiketi görünmeli (pano 18)').toBeTruthy();
  expect(Math.abs((kurEtiketi as number) - usdTry),
    `KG13/KD9: etiketteki kur (${kurEtiketi}) çevrimde kullanılanla (${usdTry}) aynı olmalı`).toBeLessThan(0.005);
  expect(sapanlar.map((c) => `satır${c.idx} ${c.tip}: ₺${c.tl}→$${c.usd} (beklenen ${beklenenKume(c.tl).join('|')})`).join(' · '),
    `KG13/KD9: TEK kur (₺${usdTry}) — dosyadan gelen işçilikler DAHİL her değer ürünün kendi formülüyle birebir çevrilmeli`).toBe('');
  await page.screenshot({ path: path.join(dir, 'ss-3-usd.png') });

  // ── ADIM 3: KAYDET → YENİDEN AÇ ─────────────────────────────────────────
  await page.getByPlaceholder('Müşteri (kapak için)').fill('E2E Test Müşterisi');
  await page.getByPlaceholder('Proje').fill('Bölüm D Altın Senaryo');
  t = t0();
  await page.getByRole('button', { name: 'Teklifi Kaydet' }).click();
  await page.waitForURL('**/quotes', { timeout: 120_000 });
  timing.kaydet_ms = t0() - t;
  expect(createdId, 'POST /quotes id dönmeli').toBeTruthy();

  t = t0();
  const respPromise = page.waitForResponse((r) => r.url().includes(`/api/quotes/${createdId}`) && r.request().method() === 'GET', { timeout: 60_000 });
  await page.goto(`/quotes/${createdId}`);
  try { savedQuote = await (await respPromise).json(); } catch { savedQuote = null; }
  await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(1200);
  // yeniden açılışta AYNI sayfaya geç ve aile satırlarını tekrar oku (C4)
  const tabBtns2 = page.locator('.sticky.bottom-0 button[title]');
  const n2 = await tabBtns2.count();
  for (let i = 0; i < n2; i++) {
    if (((await tabBtns2.nth(i).getAttribute('title')) ?? '').normalize('NFC') === SAYFA.normalize('NFC')) {
      await tabBtns2.nth(i).click(); await page.waitForTimeout(900); break;
    }
  }
  // Marka ETİKETİ, markalar listesi (ayrı istek) gelmeden çözülemez ve hücre
  // "Marka sec..." placeholder'ı gösterir. 1,2 sn sonra okuyan ilk ölçüm bunu
  // "seçim kayboldu" sanıyordu — oysa `_marka` kimliği kayıtta duruyor.
  // Etiketin çözülmesini BEKLE, süresini kanıta yaz.
  const etiketBaslangic = t0();
  let markaEtiketi = '';
  for (let i = 0; i < 40; i++) {
    await scrollRowIntoView(page, kaynakIdx);
    markaEtiketi = await page.evaluate((idx) => {
      const el = document.querySelector(`[row-index="${idx}"] [col-id="_marka"] button`);
      return el ? (el.textContent ?? '').trim() : '';
    }, kaynakIdx);
    if (markaEtiketi && !/Marka sec/i.test(markaEtiketi)) break;
    await page.waitForTimeout(500);
  }
  senaryo.markaEtiketi = { deger: markaEtiketi, sure_ms: t0() - etiketBaslangic };
  const reopenHarvest = await harvestGrid(page);
  const activeCurrency = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter((b) => ['TL', 'USD', 'EUR'].includes((b.textContent ?? '').trim()));
    const act = btns.find((b) => (b.className ?? '').includes('bg-background'));
    return act ? (act.textContent ?? '').trim() : '';
  });
  timing.yeniden_acma_ms = t0() - t;
  const yenidenAile = hedefIdx.map((idx, k) => {
    const r = reopenHarvest.rows.find((x) => x.idx === idx);
    return { cap: CAPLAR[k + 1], idx, marka: r?.markaLabel ?? '', birim: r?.cells[KOL.matUnit] ?? '' };
  });
  senaryo.C4_kalicilik = { activeCurrency, yenidenAile };
  const kaybolan = yenidenAile.filter((y, k) => hedefSonuc[k].fiyat && !tlNum(y.birim));
  expect(kaybolan.map((y) => `${y.cap}(satır${y.idx})`).join(', '),
    'C4: yeniden açılışta doldurulmuş fiyatlar kaybolmamalı').toBe('');
  expect(markaEtiketi, 'C4: yeniden açılışta marka SEÇİMİ de görünmeli (kimlik + etiket)').toMatch(/çayırova|cayirova/i);
  const markasiz = yenidenAile.filter((y) => /Marka sec/i.test(y.marka) || !y.marka);
  expect(markasiz.map((y) => `${y.cap}(satır${y.idx})`).join(', '),
    'C4: doldurulan 6 hedefin markası da yeniden açılışta görünmeli').toBe('');
  expect(activeCurrency, 'KG13/C4: USD görünümü teklifle persist etmeli').toBe('USD');
  await page.screenshot({ path: path.join(dir, 'ss-4-yeniden-acildi.png') });

  // ── ADIM 5-6: İKİ EXPORT + ART ARDA İKİNCİ İNDİRME ──────────────────────
  const indir = async (btnAd: string, hedef: string) => {
    const ti = t0();
    const dl = page.waitForEvent('download', { timeout: 180_000 });
    await page.getByRole('button', { name: btnAd }).click();
    const d = await dl;
    await d.saveAs(path.join(dir, hedef));
    return t0() - ti;
  };
  timing.export_fiyatli_ms = await indir('Fiyatlandırılmış Excel', 'fiyatli.xlsx');
  await page.waitForTimeout(800);
  timing.export_teklif_ms = await indir('Teklif Formatında Aktar', 'teklif.xlsx');
  await page.waitForTimeout(800);
  timing.export_fiyatli_2_ms = await indir('Fiyatlandırılmış Excel', 'fiyatli-2.xlsx');

  // ── ARTIFACTS ───────────────────────────────────────────────────────────
  fs.writeFileSync(path.join(dir, 'screen.json'), JSON.stringify({
    file: DOSYA, usd: true, sheetNames,
    sheets: sheetsScreen,
    reopen: { harvest: reopenHarvest, currency: activeCurrency },
    createdId,
  }, null, 1));
  fs.writeFileSync(path.join(dir, 'senaryo.json'), JSON.stringify(senaryo, null, 1));
  fs.writeFileSync(path.join(dir, 'save-payload.json'), JSON.stringify(savePayload, null, 1));
  fs.writeFileSync(path.join(dir, 'saved-quote.json'), JSON.stringify(savedQuote, null, 1));
  fs.writeFileSync(path.join(dir, 'popups.json'), JSON.stringify(popupLog, null, 1));
  fs.writeFileSync(path.join(dir, 'console.json'), JSON.stringify(consoleErrors, null, 1));
  fs.writeFileSync(path.join(dir, 'timing.json'), JSON.stringify(timing, null, 1));
  fs.writeFileSync(path.join(dir, 'export-headers.json'), JSON.stringify(exportHeaders, null, 1));

  expect(fs.statSync(path.join(dir, 'fiyatli.xlsx')).size).toBeGreaterThan(1000);
  expect(fs.statSync(path.join(dir, 'teklif.xlsx')).size).toBeGreaterThan(1000);
  expect(fs.statSync(path.join(dir, 'fiyatli-2.xlsx')).size).toBeGreaterThan(1000);
});
