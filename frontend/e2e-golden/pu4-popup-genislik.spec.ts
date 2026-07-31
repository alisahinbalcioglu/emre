/* PU4 — ADAY POPUP GENİŞLİĞİ (canlı bulgu, 31.07.2026)
 *
 * Kullanıcı: "seçim çerçevesini genişletemiyorum."
 * Kök neden: `width` REACT KONTROLÜNDE bir inline stildi; CSS `resize` ise
 * tarayıcının AYNI inline stile yazmasıyla çalışır. Her yeniden render
 * React'in değerini geri yazıp sürüklemeyi sıfırlıyordu.
 *
 * Bu spec ürünü GERÇEK tarayıcıda sınar — kaynak-düzeyi sözleşme testi
 * (PU4h) yetmez, çünkü ilk PU4 düzeltmesi de "yeşil" görünüp canlıda
 * çalışmamıştı. Ölçüt: sürükle → genişlik ARTAR → yeniden render tetikle →
 * genişlik KORUNUR.
 *
 * Ön koşul: yerel yığın (PG + backend:3001 + frontend:3005).
 */
import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { artefaktKok } from './artefakt-dizini.cjs';
import { selectDropdown, listDropdownOptions } from './helpers';

const FIXTURES = path.resolve(__dirname, '../../test-fixtures/e2e');
// PK10: her kosum kendi damgali dizinine yazar (uzerine yazma yok)
const ARTIFACTS = artefaktKok();
const AUTH = JSON.parse(fs.readFileSync(path.join(__dirname, '.auth.json'), 'utf8'));
const DOSYA = 'ŞAHİNKUL KEŞİF ÖZETİ 251224 R1 - LİNTU MÜHENDİSLİK.xlsx';
const SAYFA = 'SIHHİ';

const gercekYol = (ad: string) => {
  const tam = path.join(FIXTURES, ad);
  if (fs.existsSync(tam)) return tam;
  const b = fs.readdirSync(FIXTURES).find((f) => f.normalize('NFC') === ad.normalize('NFC'));
  if (!b) throw new Error(`Fixture bulunamadi: ${ad}`);
  return path.join(FIXTURES, b);
};

const popupGenisligi = (page: Page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="aday-popup"]') as HTMLElement | null;
  return el ? Math.round(el.getBoundingClientRect().width) : -1;
});

test('PU4 — aday popup’ı sürükleyerek genişletilebilir ve geri sıçramaz', async ({ page }) => {
  const dir = path.join(ARTIFACTS, '13-pu4-popup');
  fs.mkdirSync(dir, { recursive: true });
  await page.addInitScript((auth) => {
    localStorage.setItem('token', auth.token);
    localStorage.setItem('user', JSON.stringify(auth.user));
    // Onceki kosumdan kalan tercih olcumu bozmasin
    localStorage.removeItem('metaprice.adayPopupGenislik');
  }, AUTH);

  await page.goto('/quotes/new');
  await page.locator('#quote-excel-upload').setInputFiles(gercekYol(DOSYA));
  await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(1200);

  // SIHHİ sekmesine gec
  const tabBtns = page.locator('.sticky.bottom-0 button[title]');
  const n = await tabBtns.count();
  const adlar: string[] = [];
  for (let i = 0; i < n; i++) adlar.push((await tabBtns.nth(i).getAttribute('title')) ?? '');
  const idx = adlar.findIndex((a) => a.normalize('NFC') === SAYFA.normalize('NFC'));
  expect(idx, `"${SAYFA}" sekmesi yok (${adlar.join('|')})`).toBeGreaterThanOrEqual(0);
  await tabBtns.nth(idx).click();
  await page.waitForTimeout(1000);

  // ── Aday popup'ı aç: bir satıra marka seç ───────────────────────────────
  // ⚠ `_marka` hucresi <select> DEGIL, ozel `brandRenderer` (buton + portal
  //    menu). Dogru surucu `helpers.selectDropdown` — SAHINKUL akisi da onu
  //    kullaniyor. Popup, secilen markada BIRDEN FAZLA aday oldugunda acilir.
  // ⚠ Popup YALNIZ COK ADAY varsa acilir; rastgele satirlar tek adayla
  //   otomatik eslesiyor. Kesin acilan yer: GALVANİZ ÇELİK BORU ailesinin
  //   kaynak satiri (½") — `sahinkul-golden` da popup'i orada aciyor.
  //   Sabit sema: cap `_ad` alaninda durur (bkz. o spec'teki CAP_ALANLARI notu).
  const CAPLAR = ['½"', '¾"', '1"', '1¼"', '1½"', '2"', '2½"'];
  const kaynakIdx = await page.evaluate((caplar) => {
    const sade = (s: string) => String(s ?? '').replace(/\s+/g, '').trim();
    const oku = (i: number) => {
      const c = document.querySelector(`.ag-pinned-left-cols-container [row-index="${i}"] [col-id="_ad"]`);
      return sade(c?.textContent ?? '');
    };
    for (let i = 0; i < 400; i++) {
      let hepsi = true;
      for (let k = 0; k < caplar.length; k++) if (oku(i + k) !== caplar[k]) { hepsi = false; break; }
      if (hepsi) return i;
    }
    return -1;
  }, CAPLAR);
  // Aile ekranda degilse once kaydirip tekrar bak (AG-Grid sanallastirir)
  let kaynak = kaynakIdx;
  for (let deneme = 0; kaynak < 0 && deneme < 12; deneme++) {
    await page.evaluate((d) => {
      const vp = document.querySelector('.ag-body-viewport') as HTMLElement | null;
      if (vp) vp.scrollTop = d * 600;
    }, deneme + 1);
    await page.waitForTimeout(350);
    kaynak = await page.evaluate((caplar) => {
      const sade = (s: string) => String(s ?? '').replace(/\s+/g, '').trim();
      const oku = (i: number) => {
        const c = document.querySelector(`.ag-pinned-left-cols-container [row-index="${i}"] [col-id="_ad"]`);
        return sade(c?.textContent ?? '');
      };
      const goru = Array.from(document.querySelectorAll('.ag-pinned-left-cols-container .ag-row'))
        .map((r) => parseInt(r.getAttribute('row-index') ?? '-1', 10)).filter((x) => x >= 0);
      for (const i of goru) {
        let hepsi = true;
        for (let k = 0; k < caplar.length; k++) if (oku(i + k) !== caplar[k]) { hepsi = false; break; }
        if (hepsi) return i;
      }
      return -1;
    }, CAPLAR);
  }
  expect(kaynak, 'PU4: GALVANİZ ÇELİK BORU ailesi (½"…2½") bulunmalı').toBeGreaterThanOrEqual(0);

  const markalar = await listDropdownOptions(page, kaynak, '_marka');
  const cayirova = markalar.find((m) => /çayırova|cayirova/i.test(m));
  expect(cayirova, `ÇAYIROVA markası yok (mevcut: ${markalar.slice(0, 8).join('|')})`).toBeTruthy();

  expect(await selectDropdown(page, kaynak, '_marka', cayirova!),
    'PU4: kaynak satıra marka seçilebilmeli').toBe(true);
  await page.waitForTimeout(3000);
  const acildi = (await page.locator('[data-testid="aday-popup"]').count()) > 0;
  expect(acildi, 'PU4: aday popup’ı açılmalı (ÇAYIROVA seçilen satırda çok aday)').toBe(true);
  await page.screenshot({ path: path.join(dir, 'pu4-1-popup-acildi.png') });

  const once = await popupGenisligi(page);
  const kutu = (await page.locator('[data-testid="aday-popup"]').boundingBox())!;

  // ── A) TUTAMAÇ: native CSS `resize` grip'i fare ile yakalanıyor mu? ─────
  for (const pay of [6, 10, 14]) {
    const x = kutu.x + kutu.width - pay;
    const y = kutu.y + kutu.height - pay;
    await page.mouse.move(x, y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.move(x + 100, y + 20, { steps: 8 });
    await page.mouse.move(x + 220, y + 40, { steps: 8 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(500);
    if ((await popupGenisligi(page)) > once + 60) break;
  }
  const nativeSonuc = await popupGenisligi(page);
  await page.screenshot({ path: path.join(dir, 'pu4-2-native-surukleme.png') });

  // TEŞHİS: tutamaç tutmuyorsa sebebi ÜRÜN mü, ÖLÇÜM ARACI mı?
  // - resize/overflow hesaplanan değerleri doğru mu (CSS reset ezmiş olabilir)
  // - köşedeki noktada EN ÜSTTE hangi eleman var (bir katman kapatıyor olabilir)
  const teshis = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="aday-popup"]') as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const nokta = document.elementFromPoint(r.right - 6, r.bottom - 6) as HTMLElement | null;
    return {
      resize: cs.resize,
      overflow: cs.overflow,
      position: cs.position,
      scrollbarGenisligi: el.offsetWidth - el.clientWidth,
      kosedekiEleman: nokta ? `${nokta.tagName}${nokta.getAttribute('data-testid') ? '[' + nokta.getAttribute('data-testid') + ']' : ''}` : 'YOK',
      kosePopupMu: nokta === el,
    };
  });
  console.log('[PU4] teşhis:', JSON.stringify(teshis));
  // ── ASIL ŞART (canlı şikâyet): TUTAMAÇ ERİŞİLEBİLİR OLMALI ──────────────
  // Boyutlandırma tutamacı sağ-alt köşededir. O köşe viewport DIŞINDA kalırsa
  // fare ona hiç erişemez — kullanıcı "genişletemiyorum" der. Ölçüt: köşedeki
  // noktada EN ÜSTTEKİ eleman popup'ın KENDİSİ olmalı.
  // 31.07 fix öncesi ölçüm: kosedekiEleman="YOK", kosePopupMu=false.
  expect(teshis?.resize, 'PU4: popup yeniden boyutlandırılabilir olmalı').toBe('both');
  expect(teshis?.kosePopupMu,
    `PU4 TUTAMAÇ ERİŞİLEBİLİR DEĞİL: sağ-alt köşe ekran dışında `
    + `(köşedeki eleman: ${teshis?.kosedekiEleman}) — kullanıcı popup'ı genişletemez`).toBe(true);

  // ── B) ASIL SÖZLEŞME: tarayıcı `style.width` yazınca React SİLİYOR MU? ──
  // Kullanıcının şikâyetinin mekanizması buydu. CSS `resize` tam olarak
  // elemanın inline `style.width`ini yazar; sonra herhangi bir render
  // React'in kendi değerini geri yazarsa sürükleme SIFIRLANIR.
  // Native grip'i fareyle yakalamak kırılgan olduğu için mekanizma burada
  // birebir taklit edilir: style.width yaz → render tetikle → korunuyor mu?
  const hedef = once + 220;
  await page.evaluate((w) => {
    const el = document.querySelector('[data-testid="aday-popup"]') as HTMLElement | null;
    if (el) el.style.width = `${w}px`;
  }, hedef);
  await page.waitForTimeout(600);
  const yazildi = await popupGenisligi(page);
  expect(Math.abs(yazildi - hedef), `PU4: style.width uygulanmalı (${yazildi} vs ${hedef})`).toBeLessThanOrEqual(4);

  // Render tetikle: fareyi popup içinde gezdir + aday listesinde gez
  await page.mouse.move(kutu.x + 40, kutu.y + 60);
  await page.waitForTimeout(300);
  await page.mouse.move(kutu.x + 80, kutu.y + 120);
  await page.waitForTimeout(900);
  const sonra = await popupGenisligi(page);
  await page.screenshot({ path: path.join(dir, 'pu4-3-render-sonrasi.png') });
  expect(Math.abs(sonra - hedef),
    `PU4 ASIL ŞART: yeniden render genişliği SIFIRLAMAMALI (yazılan=${hedef}, render sonrası=${sonra}` +
    ` — eski davranışta ${once}’e geri sıçrıyordu)`).toBeLessThanOrEqual(4);

  // ── ASIL ŞART: yeniden render GENİŞLİĞİ SIFIRLAMAMALI ───────────────────
  // Canlı şikâyetin sebebi buydu: React `width`i geri yazıp sürüklemeyi
  // siliyordu. Fare popup içinde gezdirilerek render tetiklenir.
  await page.mouse.move(kutu.x + 40, kutu.y + 60);
  await page.waitForTimeout(400);
  await page.mouse.move(kutu.x + 60, kutu.y + 90);
  await page.waitForTimeout(900);
  const render = await popupGenisligi(page);
  expect(Math.abs(render - sonra), `PU4: yeniden render genişliği sıfırlamamalı (${sonra} → ${render})`)
    .toBeLessThanOrEqual(4);

  // ── Tercih kaydedildi mi (oturum boyunca hatırlanır) ────────────────────
  const kayitli = await page.evaluate(() => Number(localStorage.getItem('metaprice.adayPopupGenislik')));
  expect(Math.abs(kayitli - sonra), `PU4: ölçü localStorage’a yazılmalı (kayıt=${kayitli}, ekran=${sonra})`)
    .toBeLessThanOrEqual(4);

  // ── C) TAŞIMA: başlık çubuğundan sürükleyerek popup yer değiştirir ──────
  // Kullanıcı 31.07: "seçenekler çerçevesini hareket ettiremiyorum".
  // Taşıma HİÇ yoktu — popup sabit konumda açılıyor, altındaki satırı
  // kapatıyordu. Başlık artık tutamak.
  const konum = () => page.evaluate(() => {
    const el = document.querySelector('[data-testid="aday-popup"]') as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top) };
  });
  const k0 = (await konum())!;
  const baslik = page.locator('[data-testid="aday-popup-baslik"]');
  expect(await baslik.count(), 'PU4c: başlık taşıma tutamağı olmalı').toBe(1);
  const bk = (await baslik.boundingBox())!;
  await page.mouse.move(bk.x + bk.width / 2, bk.y + bk.height / 2);
  await page.mouse.down();
  await page.mouse.move(bk.x + bk.width / 2 - 160, bk.y + bk.height / 2 + 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const k1 = (await konum())!;
  console.log(`[PU4] taşıma: (${k0.left},${k0.top}) → (${k1.left},${k1.top})`);
  expect(Math.abs(k1.left - k0.left) + Math.abs(k1.top - k0.top),
    `PU4c: başlıktan sürükleyince popup TAŞINMALI (${k0.left},${k0.top}) → (${k1.left},${k1.top})`)
    .toBeGreaterThan(60);
  await page.screenshot({ path: path.join(dir, 'pu4-4-tasindi.png') });

  // Native tutamacin sonucu AYRI raporlanir: fix "React silmiyor" sartini
  // cozer, ama tutamak fareyle yakalanamiyorsa kullanici yine genisletemez.
  // Ikisi FARKLI sorundur; tek gec/kal ile ayirt edilemez.
  const tutamakCalisti = nativeSonuc > once + 60;
  console.log(`[PU4] native tutamaç: ${once} → ${nativeSonuc} (${tutamakCalisti ? 'ÇALIŞTI' : 'DEĞİŞMEDİ'})`);
  console.log(`[PU4] style.width sözleşmesi: ${hedef} yazıldı → render sonrası ${sonra} (korundu)`);
  fs.writeFileSync(path.join(dir, 'rapor.json'),
    JSON.stringify({ once, nativeSonuc, tutamakCalisti, hedef, sonra, render, kayitli }, null, 1));
});
