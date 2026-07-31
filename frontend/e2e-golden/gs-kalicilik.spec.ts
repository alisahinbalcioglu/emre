/* GS6 · GS8 · GS9 — KAPATMA TURU ADIM 5 (31.07.2026)
 *
 * Bu ucunun 31.07'ye kadar HICBIR otomatik testi yoktu; "yapildi" denmesinin
 * tek dayanagi kod okumasiydi. Ikisi (GS8 kolon genisligi kaliciligi, GS9 sola
 * sabitleme) dogrudan KULLANICININ SIKAYETIYDI.
 *
 *   GS6  "Malzeme Adı sütunu" secicisi GERCEK sutunu gosterir
 *   GS8  kolon genisligi surukleyerek degistirilir ve TEKLIFLE KAYDEDILIR
 *   GS9  No + Malzeme Adı SOLA SABIT (donmus bolme) — saga kaydirinca kalir
 *
 * On kosul: yerel yigin (PG + backend:3001 + frontend:3005).
 * Kosum: npx playwright test -c playwright.golden.config.ts e2e-golden/gs-kalicilik.spec.ts
 */
import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error — .mjs yardimci (tip bildirimi yok)
import { artefaktKok } from './artefakt-dizini.cjs';

const FIXTURES = path.resolve(__dirname, '../../test-fixtures/e2e');
// PK10: her kosum kendi damgali dizinine yazar (uzerine yazma yok)
const ARTIFACTS = artefaktKok();
const AUTH = JSON.parse(fs.readFileSync(path.join(__dirname, '.auth.json'), 'utf8'));
const DOSYA = 'YILDIZ ENTEGRE KARTEPE - Yangın Tesisatı.xlsx';

const gercekYol = (ad: string) => {
  const tam = path.join(FIXTURES, ad);
  if (fs.existsSync(tam)) return tam;
  const bulunan = fs.readdirSync(FIXTURES).find((f) => f.normalize('NFC') === ad.normalize('NFC'));
  if (!bulunan) throw new Error(`Fixture bulunamadi: ${ad}`);
  return path.join(FIXTURES, bulunan);
};

/** Bir kolonun ekrandaki genisligi (px) — AG-Grid header hucresinden. */
const kolonGenisligi = (page: Page, colId: string) => page.evaluate((id) => {
  const h = document.querySelector(`.ag-header-cell[col-id="${id}"]`) as HTMLElement | null;
  return h ? Math.round(h.getBoundingClientRect().width) : -1;
}, colId);

/** Kolon hangi AG-Grid konteynerinde? pinned-left / center / pinned-right */
const kolonKonteyneri = (page: Page, colId: string) => page.evaluate((id) => {
  const h = document.querySelector(`.ag-header-cell[col-id="${id}"]`);
  if (!h) return 'yok';
  if (h.closest('.ag-pinned-left-header')) return 'pinned-left';
  if (h.closest('.ag-pinned-right-header')) return 'pinned-right';
  return 'center';
}, colId);

test('GS6 · GS8 · GS9 — seçici, kolon genişliği kalıcılığı, sola sabitleme', async ({ page }) => {
  const dir = path.join(ARTIFACTS, '12-gs-kalicilik');
  fs.mkdirSync(dir, { recursive: true });
  const rapor: Record<string, any> = {};
  let createdId = '';
  page.on('response', async (res) => {
    if (/\/api\/quotes$/.test(res.url()) && res.request().method() === 'POST') {
      try { createdId = (await res.json())?.id ?? ''; } catch { /* no-op */ }
    }
  });
  await page.addInitScript((auth) => {
    localStorage.setItem('token', auth.token);
    localStorage.setItem('user', JSON.stringify(auth.user));
  }, AUTH);

  await page.goto('/quotes/new');
  await page.locator('#quote-excel-upload').setInputFiles(gercekYol(DOSYA));
  await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(1200);

  // DETAY SAYFASINA GEC. Ilk sekme "İcmal" (ozet) ve o sayfada dosyanin C2/C3
  // sutunlari BIREBIR AYNI metni tasiyor ("FİRMA:" | "FİRMA:") — GS6 secici
  // sinamasi orada sutun degisse bile ayni degeri okur ve YANLIS KIRMIZI verir.
  {
    const tabBtns = page.locator('.sticky.bottom-0 button[title]');
    const n = await tabBtns.count();
    const adlar: string[] = [];
    for (let i = 0; i < n; i++) adlar.push((await tabBtns.nth(i).getAttribute('title')) ?? '');
    const idx = adlar.findIndex((a) => /trafo/i.test(a));
    rapor.sekmeler = adlar;
    expect(idx, `Trafo sekmesi bulunamadı (sekmeler: ${adlar.join('|')})`).toBeGreaterThanOrEqual(0);
    await tabBtns.nth(idx).click();
    await page.waitForTimeout(1000);
  }

  // ── GS9: No + Malzeme Adı SOLA SABİT ────────────────────────────────────
  {
    const kNo = await kolonKonteyneri(page, '_no');
    const kAd = await kolonKonteyneri(page, '_ad');
    const kToplam = await kolonKonteyneri(page, '_toplam');
    rapor.GS9 = { _no: kNo, _ad: kAd, _toplam: kToplam };
    expect(kNo, 'GS9: No sola sabitlenmeli').toBe('pinned-left');
    expect(kAd, 'GS9: Malzeme Adı sola sabitlenmeli').toBe('pinned-left');
    expect(kToplam, 'GS9: Genel Toplam sabitlenmemeli (kayan bölmede)').toBe('center');

    // Saga kaydir → sabit kolonlar EKRANDA KALMALI
    await page.evaluate(() => {
      const vp = document.querySelector('.ag-body-horizontal-scroll-viewport') as HTMLElement | null;
      if (vp) vp.scrollLeft = 99999;
    });
    await page.waitForTimeout(500);
    const adGorunur = await page.locator('.ag-pinned-left-header .ag-header-cell[col-id="_ad"]').isVisible();
    rapor.GS9.kaydirmaSonrasiAdGorunur = adGorunur;
    expect(adGorunur, 'GS9: sağa kaydırınca Malzeme Adı ekranda kalmalı').toBe(true);
    await page.screenshot({ path: path.join(dir, 'gs9-donmus-bolme.png') });
  }

  // ── GS6: "Malzeme Adı sütunu" seçicisi GERÇEK sütunu gösterir ───────────
  {
    // Secici, "Malzeme Adı sütunu:" etiketinin HEMEN YANINDAKI <select>
    // (quotes/new/page.tsx:1534-1541). Etiket metniyle baglanir; sinif adina
    // degil, cunku sinif degisirse test sessizce baska bir select'i olcerdi.
    const secici = page.getByText('Malzeme Adı sütunu:')
      .locator('xpath=following-sibling::select').first();
    const varMi = await secici.count() > 0;
    rapor.GS6 = { seciciVar: varMi };
    expect(varMi, 'GS6: "Malzeme Adı sütunu" seçicisi ekranda olmalı').toBe(true);

    // YALNIZ VERI SATIRLARI (No dolu). Afis satirlari dosyanin HER sutununda
    // ayni metni tasiyor ("YILDIZ ENTEGRE KARTEPE … TEKLİFİ" C2-C7'de tekrar) —
    // onlari olcmek secici degisse bile ayni degeri okur ve YANLIS KIRMIZI verir.
    // AG-Grid satirlari SANALLASTIRIR: yalniz gorunen satirlar DOM'da olur.
    // Olcum SABIT satir indekslerinden yapilir (afis satirlari 0-6 atlanir);
    // boylece iki okuma birebir ayni satirlari karsilastirir.
    const adlariOku = async () => {
      await page.evaluate(() => {
        const vp = document.querySelector('.ag-body-viewport') as HTMLElement | null;
        if (vp) vp.scrollTop = 0;
      });
      await page.waitForTimeout(400);
      return page.evaluate(() => {
        const out: string[] = [];
        for (let i = 7; i <= 34; i++) {
          const hucre = document.querySelector(`.ag-pinned-left-cols-container [row-index="${i}"] [col-id="_ad"]`);
          const t = (hucre?.textContent ?? '').trim();
          if (t) out.push(`${i}:${t}`);
        }
        return out;
      });
    };
    const oncekiAdlar = await adlariOku();
    const secili = await secici.inputValue();
    const degerler = await secici.locator('option').evaluateAll((els) =>
      els.map((e) => (e as HTMLOptionElement).value));
    rapor.GS6 = { ...rapor.GS6, secili, secenekSayisi: degerler.length, oncekiAdlar: oncekiAdlar.slice(0, 3) };
    expect(oncekiAdlar.length, 'GS6: Malzeme Adı sütununda değer görünmeli').toBeGreaterThan(3);
    expect(degerler.length, 'GS6: seçicide en az iki seçenek olmalı').toBeGreaterThan(1);

    // GS6'nin ikinci sarti ("secici degisince grid ANINDA yeniden dolar")
    // asagida AYRI ve `test.fail()` isaretli testte olculur — 31.07 itibariyla
    // KARSILANMIYOR. Burada gizlenmesin diye ayri test olarak durur.
  }

  // ── GS8: kolon genişliği sürükleyerek değişir ve TEKLİFLE KAYDEDİLİR ────
  {
    const oncekiGenislik = await kolonGenisligi(page, '_ad');
    // Kolon kenarındaki tutamacı sürükle
    // Tutamac COK DAR; ortasindan surukleme tutmuyordu (380→380). Baslik
    // hucresinin SAG KENARINDAN, adim adim surukle — gercek kullanici gibi.
    const baslik = page.locator('.ag-header-cell[col-id="_ad"]').first();
    const kutu = await baslik.boundingBox();
    expect(kutu, 'GS8: Malzeme Adı başlık hücresi bulunmalı').toBeTruthy();
    const x = kutu!.x + kutu!.width - 3;
    const y = kutu!.y + kutu!.height / 2;
    await page.mouse.move(x, y);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.move(x + 60, y, { steps: 10 });
    await page.mouse.move(x + 150, y, { steps: 10 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(1200);
    const yeniGenislik = await kolonGenisligi(page, '_ad');
    rapor.GS8 = { oncekiGenislik, yeniGenislik };
    expect(yeniGenislik, `GS8: sürükleyince genişlik değişmeli (${oncekiGenislik} → ${yeniGenislik})`)
      .toBeGreaterThan(oncekiGenislik + 40);

    // GS8'in ikinci sarti (KAYDET → YENIDEN AC → genislik korunur) asagida
    // AYRI ve `test.fail()` isaretli testte olculur — 31.07 itibariyla
    // KARSILANMIYOR (kayitta `columnConfig.widths` BOS geliyor).

    // Kaydet + detayda GS9 hala gecerli mi
    await page.getByPlaceholder('Müşteri (kapak için)').fill('GS8 Kalıcılık');
    await page.getByPlaceholder('Proje').fill('Kolon Genişliği');
    await page.getByRole('button', { name: 'Teklifi Kaydet' }).click();
    await page.waitForURL('**/quotes', { timeout: 180_000 });
    expect(createdId, 'kaydet: POST /quotes id dönmeli').toBeTruthy();

    await page.goto(`/quotes/${createdId}`);
    await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(1500);
    rapor.GS8.detayGenislik = await kolonGenisligi(page, '_ad');
    await page.screenshot({ path: path.join(dir, 'gs8-yeniden-acildi.png') });
    expect(await kolonKonteyneri(page, '_ad'), 'GS9: detayda da sola sabit').toBe('pinned-left');
  }

  fs.writeFileSync(path.join(dir, 'rapor.json'), JSON.stringify(rapor, null, 1));
});

/* GS6b — KAPANDI (PK8, 31.07.2026). Kök neden aşağıda.
 *
 * Kriter: "Malzeme Adı sütunu" seçicisi değişince grid ANINDA yeniden dolar.
 *
 * KÖK NEDEN (ölçüldü, tahmin değil): satırların İKİ ayrı kaynağı vardı ve
 * yalnız biri güncelleniyordu.
 *   1. `handleNameFieldChange` (quotes/new/page.tsx:664-681) `_ad`'ı doğru
 *      yeniden yazıyordu — backend fixture'ıyla ölçüldü: Trafo sayfasında
 *      col1 → col3 geçişinde 21 satırda değer GERÇEKTEN değişiyor.
 *   2. Ama grid rowData'yı oradan okumuyordu:
 *          page.tsx:1663  rowData: liveRowDataBySheet[active.index] ?? active.rowData
 *      `liveRowDataBySheet` yüklemenin hemen ardından TÜM sayfalar için
 *      dolduruluyor (page.tsx:345-347) → `active.rowData` fallback'i hiç
 *      çalışmıyor. Canlı satırlar tazelenmiş satırları GÖLGELİYORDU.
 *
 * FIX: `handleNameFieldChange` artık `setLiveRowDataBySheet` ile gölge
 * kaynağı da tazeliyor. Aynı bug sınıfı 24.07'de kalem eklemede yaşanmıştı
 * (`liveRows` race → `liveRowsRef`); kural: satır listesini değiştiren HER
 * işlem `liveRowDataBySheet`i de güncellemek zorundadır.
 * Kaynak-seviyesi kilit: `frontend/lib/gs6b-golge-kurali.test.ts`.
 */
/* GS8b — KOLON GENİŞLİĞİ KALICILIĞI (asıl kriter, kullanıcının şikâyeti)
 *
 * Sürükle → kaydet → yeniden aç → AYNI genişlik.
 *
 * ⚠ ÖLÇÜM NOTU (31.07): bu şart ÖNCE kırmızı göründü ve "kaydedilmiyor" diye
 *   yorumlandı — yanlıştı. Kırmızı, aynı testte ÖNCE "Malzeme Adı sütunu"
 *   seçicisinin değiştirilip geri alınmasından geliyordu; o dizide genişlik
 *   korunmuyor. Sürükleme TEK BAŞINA yapıldığında kalıcılık ÇALIŞIYOR
 *   (380 → 530 → yeniden açılışta 530). Bu yüzden şart burada İZOLE ölçülür.
 *   AÇIK KALAN: seçici değişikliğinden SONRA genişliğin korunmaması
 *   (muhtemelen GS6b ile aynı kök — durum değişiyor, grid senkronlanmıyor).
 */
test('GS8b — kolon genişliği kaydedilir ve yeniden açılışta korunur', async ({ page }) => {
  await page.addInitScript((auth) => {
    localStorage.setItem('token', auth.token);
    localStorage.setItem('user', JSON.stringify(auth.user));
  }, AUTH);
  let qid = '';
  page.on('response', async (res) => {
    if (/\/api\/quotes$/.test(res.url()) && res.request().method() === 'POST') {
      try { qid = (await res.json())?.id ?? ''; } catch { /* no-op */ }
    }
  });
  await page.goto('/quotes/new');
  await page.locator('#quote-excel-upload').setInputFiles(gercekYol(DOSYA));
  await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(1200);

  const baslik = page.locator('.ag-header-cell[col-id="_ad"]').first();
  const kutu = (await baslik.boundingBox())!;
  const x = kutu.x + kutu.width - 3; const y = kutu.y + kutu.height / 2;
  await page.mouse.move(x, y); await page.waitForTimeout(200);
  await page.mouse.down(); await page.waitForTimeout(200);
  await page.mouse.move(x + 60, y, { steps: 10 });
  await page.mouse.move(x + 150, y, { steps: 10 });
  await page.waitForTimeout(200); await page.mouse.up();
  await page.waitForTimeout(1200);
  const yeni = await kolonGenisligi(page, '_ad');

  await page.getByPlaceholder('Müşteri (kapak için)').fill('GS8b Açık');
  await page.getByPlaceholder('Proje').fill('Genişlik Kalıcılığı');
  await page.getByRole('button', { name: 'Teklifi Kaydet' }).click();
  await page.waitForURL('**/quotes', { timeout: 180_000 });
  await page.goto(`/quotes/${qid}`);
  await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const detay = await kolonGenisligi(page, '_ad');
  expect(Math.abs(detay - yeni),
    `GS8b: kaydedilen genişlik yeniden açılışta korunmalı (kaydedilen=${yeni}, açılan=${detay})`)
    .toBeLessThanOrEqual(6);
});

test('GS6b — seçici değişince grid YENİDEN DOLAR (PK8)', async ({ page }) => {
  await page.addInitScript((auth) => {
    localStorage.setItem('token', auth.token);
    localStorage.setItem('user', JSON.stringify(auth.user));
  }, AUTH);
  await page.goto('/quotes/new');
  await page.locator('#quote-excel-upload').setInputFiles(gercekYol(DOSYA));
  await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(1200);

  const tabBtns = page.locator('.sticky.bottom-0 button[title]');
  const n = await tabBtns.count();
  const adlar: string[] = [];
  for (let i = 0; i < n; i++) adlar.push((await tabBtns.nth(i).getAttribute('title')) ?? '');
  await tabBtns.nth(adlar.findIndex((a) => /trafo/i.test(a))).click();
  await page.waitForTimeout(1000);

  const oku = async () => {
    await page.evaluate(() => {
      const vp = document.querySelector('.ag-body-viewport') as HTMLElement | null;
      if (vp) vp.scrollTop = 0;
    });
    await page.waitForTimeout(400);
    return page.evaluate(() => {
      const out: string[] = [];
      for (let i = 7; i <= 34; i++) {
        const h = document.querySelector(`.ag-pinned-left-cols-container [row-index="${i}"] [col-id="_ad"]`);
        const t = (h?.textContent ?? '').trim();
        if (t) out.push(`${i}:${t}`);
      }
      return out;
    });
  };

  const secici = page.getByText('Malzeme Adı sütunu:').locator('xpath=following-sibling::select').first();
  const once = await oku();
  const secili = await secici.inputValue();
  const degerler = await secici.locator('option').evaluateAll((els) =>
    els.map((e) => (e as HTMLOptionElement).value));
  await secici.selectOption(degerler.find((v) => v !== secili)!);
  await page.waitForTimeout(1500);
  const sonra = await oku();
  expect(JSON.stringify(sonra), 'GS6b: seçici değişince Malzeme Adı sütunu yeniden dolmalı')
    .not.toBe(JSON.stringify(once));
});
