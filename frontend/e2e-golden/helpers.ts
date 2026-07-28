/* E2E ALTIN YOL yardimcilari — AG-Grid surusu, dropdown/popup/doldurma,
 * grid hasadi (sanallastirma-farkinda), fiyatlama politikasi.
 * Tum etkilesim GERCEK kullanici yolundan (tiklama/cift-tik); veri okuma DOM'dan. */
import type { Page, Locator } from '@playwright/test';

export interface HarvestRow {
  idx: number;
  cells: Record<string, string>;
  hasMarka: boolean;   // satirda marka dropdown'u var (= data satiri)
  markaLabel: string;  // dropdown'da gorunen etiket ('' = secilmemis)
  firmaLabel: string;
}
export interface Harvest {
  rowCount: number;
  rows: HarvestRow[];
  colIds: string[];
  genelToplam: string; // tfoot/pinned gorunumden
}

const ROW_H = 28;

/** Grid viewport'unu adim adim kaydirarak TUM satirlari topla (sanallastirma). */
export async function harvestGrid(page: Page): Promise<Harvest> {
  return await page.evaluate(async (ROW_H) => {
    const vp = document.querySelector('.ag-body-viewport') as HTMLElement | null;
    if (!vp) return { rowCount: 0, rows: [], colIds: [], genelToplam: '' };
    const readVisible = (acc: Map<number, any>) => {
      const rowEls = document.querySelectorAll('.ag-center-cols-container .ag-row, .ag-pinned-right-cols-container .ag-row, .ag-pinned-left-cols-container .ag-row');
      rowEls.forEach((rowEl) => {
        const idx = parseInt(rowEl.getAttribute('row-index') ?? '', 10);
        if (isNaN(idx)) return;
        const cur = acc.get(idx) ?? { idx, cells: {}, hasMarka: false, markaLabel: '', firmaLabel: '' };
        rowEl.querySelectorAll('.ag-cell').forEach((c) => {
          const id = c.getAttribute('col-id');
          if (!id) return;
          const btn = c.querySelector('button');
          if (id === '_marka') {
            if (btn) { cur.hasMarka = true; cur.markaLabel = (btn.textContent ?? '').trim(); }
          } else if (id === '_firma') {
            if (btn) cur.firmaLabel = (btn.textContent ?? '').trim();
          } else {
            cur.cells[id] = (c.textContent ?? '').trim();
          }
        });
        acc.set(idx, cur);
      });
    };
    const acc = new Map<number, any>();
    vp.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 120));
    const total = vp.scrollHeight;
    // adim = gorunur pencerenin ~%80'i (sabit 10 satir degil) — 1694 satirlik
    // dosyada 170 iterasyon yerine ~25 iterasyon
    const adim = Math.max(ROW_H * 10, Math.floor(vp.clientHeight * 0.8));
    for (let y = 0; y <= total; y += adim) {
      vp.scrollTop = y;
      await new Promise((r) => setTimeout(r, 70));
      readVisible(acc);
    }
    vp.scrollTop = total;
    await new Promise((r) => setTimeout(r, 70));
    readVisible(acc);
    // GENEL TOPLAM — sayfadaki ozet satiri (grid disi tfoot veya pinned)
    let genel = '';
    document.querySelectorAll('td, .ag-floating-bottom .ag-cell, div').forEach((el) => {
      const t = (el.textContent ?? '').trim();
      if (/^GENEL TOPLAM/.test(t) && el.parentElement) {
        const rowTxt = (el.parentElement.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (rowTxt.length < 200) genel = rowTxt;
      }
    });
    // NOT: spread yerine Array.from — frontend tsconfig'inde `target` yok,
    // iterator spread'i TS2802 veriyor ve CI'daki `tsc --noEmit` kapisi kirilir.
    const rows = Array.from(acc.values()).sort((a: any, b: any) => a.idx - b.idx);
    const colIds = Array.from(new Set(rows.flatMap((r: any) => Object.keys(r.cells))));
    return { rowCount: rows.length, rows, colIds, genelToplam: genel };
  }, ROW_H);
}

/** Satiri gorunur alana kaydir. */
export async function scrollRowIntoView(page: Page, idx: number) {
  await page.evaluate(({ idx, ROW_H }) => {
    const vp = document.querySelector('.ag-body-viewport') as HTMLElement | null;
    if (vp) vp.scrollTop = Math.max(0, idx * ROW_H - vp.clientHeight / 2);
  }, { idx, ROW_H });
  await page.waitForTimeout(120);
}

function cellLocator(page: Page, idx: number, colId: string): Locator {
  return page.locator(`[row-index="${idx}"] [col-id="${colId}"]`).first();
}

export interface PopupLogEntry { rowIdx: number; name: string; adaylar: number; secilen: string; stage2: boolean }

/** Acik portal menuyu GUVENLI kapat — koordinat tiklamasi YASAK (5,5 logo
 *  linkine denk gelip dashboard'a navigasyona sebep olmustu). h1 basligi
 *  (Teklif Duzenle / teklif adi) link degildir; mousedown menuyu kapatir. */
async function closeMenus(page: Page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('h1').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(150);
}

/** Acik "Secim gerekli" popup'i varsa ILK adayi sec (gorev politikasi) ve logla.
 *  Popup da fixed portal → DOM-click (viewport tasmasi sorunu, bkz selectDropdown). */
export async function resolvePopupIfAny(page: Page, rowIdx: number, name: string, log: PopupLogEntry[]): Promise<boolean> {
  // 800ms: popup React state ile ANINDA acilir; 2500ms bekleme buyuk
  // dosyalarda (1694 satir, yuzlerce aile) saatlerce bos bekleme demekti.
  const header = page.getByText('Seçim gerekli', { exact: false }).first();
  try { await header.waitFor({ state: 'visible', timeout: 800 }); } catch { return false; }
  const tikla = (geriAtla: boolean) => page.evaluate((skipGeri) => {
    const hdr = Array.from(document.querySelectorAll('div')).find((d) => /Seçim gerekli/.test(d.textContent ?? '') && d.children.length === 0);
    const box = hdr?.parentElement;
    if (!box) return null;
    const btns = Array.from(box.querySelectorAll('button'));
    const hedef = skipGeri ? btns.find((b) => !/← Geri/.test(b.textContent ?? '')) : btns[0];
    if (!hedef) return null;
    const label = (hedef.textContent ?? '').trim().slice(0, 80);
    hedef.scrollIntoView({ block: 'nearest' });
    hedef.click();
    return { label, adaylar: btns.length };
  }, geriAtla);

  const ilk = await tikla(false);
  if (!ilk) return false;
  await page.waitForTimeout(500);
  let stage2 = false;
  let secilen = ilk.label;
  // Stage2 acildi mi? ("← Geri" gorunuyorsa) → ilk somut urunu sec
  if (await page.getByText('← Geri', { exact: false }).first().isVisible().catch(() => false)) {
    stage2 = true;
    const ikinci = await tikla(true);
    if (ikinci) { secilen = ikinci.label; await page.waitForTimeout(500); }
  }
  log.push({ rowIdx, name, adaylar: ilk.adaylar, secilen, stage2 });
  return true;
}

/** Portal menuyu (fixed, z=99999) bul — CustomDropdown ve popup ortak. */
const MENU_JS = `[...document.querySelectorAll('body > div')].filter((d) => {
  const st = d.style; return st && st.position === 'fixed' && parseInt(st.zIndex || '0') >= 99999;
}).pop()`;

/** Hucredeki dropdown TETIKLEYICISINI ac — DOM-click.
 *  Playwright .click() grid'in en altindaki satirlarda
 *  "ag-body-horizontal-scroll-container intercepts pointer events" ile
 *  30sn bekleyip patliyordu (09-fg-yorel, row-index 203). DOM click
 *  perdeleme kontrolu yapmaz; React onClick aynen tetiklenir. */
async function triggerAc(page: Page, rowIdx: number, colId: string): Promise<boolean> {
  const ok = await page.evaluate(({ rowIdx, colId }) => {
    const rows = document.querySelectorAll(`[row-index="${rowIdx}"]`);
    for (const r of Array.from(rows)) {
      const btn = r.querySelector(`[col-id="${colId}"] button`) as HTMLElement | null;
      if (btn) { btn.scrollIntoView({ block: 'nearest' }); btn.click(); return true; }
    }
    return false;
  }, { rowIdx, colId });
  if (ok) await page.waitForTimeout(150);
  return ok;
}

/** Belirli satirda marka/firma dropdown'undan secim yap (portal menu).
 *  NOT: option tiklamasi DOM-click ile yapilir — menu satir ekranin altindayken
 *  viewport disina tasiyor ve Playwright .click() "outside of the viewport"
 *  diye 30sn bekleyip patliyordu. DOM click React onClick'i aynen tetikler. */
export async function selectDropdown(page: Page, rowIdx: number, colId: '_marka' | '_firma', optionText: string): Promise<boolean> {
  await scrollRowIntoView(page, rowIdx);
  if (!(await triggerAc(page, rowIdx, colId))) return false;
  const searchPh = colId === '_marka' ? 'Marka ara...' : 'Firma ara...';
  const search = page.locator(`input[placeholder="${searchPh}"]`);
  if (await search.isVisible().catch(() => false)) {
    await search.fill(optionText);
    await page.waitForTimeout(300);
  }
  const clicked = await page.evaluate(({ menuJs, text }) => {
    // eslint-disable-next-line no-eval
    const menu = eval(menuJs) as HTMLElement | undefined;
    if (!menu) return false;
    const opts = Array.from(menu.querySelectorAll('div')).filter((o) => {
      const sp = o.querySelector(':scope > span');
      return !!sp && (sp.textContent ?? '').trim() === text;
    });
    const el = opts[opts.length - 1];
    if (!el) return false;
    el.scrollIntoView({ block: 'nearest' });
    (el as HTMLElement).click();
    return true;
  }, { menuJs: MENU_JS, text: optionText });
  if (!clicked) { await closeMenus(page); return false; }
  await page.waitForTimeout(200);
  return true;
}

/** Alt-kenar cift-tik → aile sonuna kadar doldur (K13-K19 fill handle). */
export async function fillFamilyDown(page: Page, rowIdx: number, colId: string) {
  await scrollRowIntoView(page, rowIdx);
  const cell = cellLocator(page, rowIdx, colId);
  const box = await cell.boundingBox();
  if (!box) return;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height - 4);
}

/** Fiyatli hucre sayisi sabitlenene kadar bekle (doldurma/eslesme bitti). */
export async function waitForPricesToSettle(page: Page, maxMs = 180_000) {
  const readCount = () => page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('[col-id="_matBirim"], [col-id="_labBirim"]').forEach((c) => {
      if (/[0-9]/.test(c.textContent ?? '')) n++;
    });
    // devam eden istek gostergesi: donen spinner'lar
    const busy = document.querySelectorAll('.animate-spin').length;
    return n * 1000 + busy;
  });
  let last = -1; let stableSince = Date.now(); const start = Date.now();
  while (Date.now() - start < maxMs) {
    const cur = await readCount();
    if (cur !== last) { last = cur; stableSince = Date.now(); }
    else if (Date.now() - stableSince > 1200) return; // 3000→1200: sayac + spinner birlikte izleniyor
    await page.waitForTimeout(250);
  }
}

// ── Fiyatlama politikasi (gorev §1 — deterministik) ────────────────────
export type Family = 'vana' | 'plastik' | 'boru' | 'diger';
export function familyOf(name: string): Family {
  const n = name.toLocaleLowerCase('tr');
  if (/(vana|çekvalf|cekvalf|çek valf|klape|flatör|flator|kelebek|küresel|kuresel|pislik tutucu|yangın dolab|rekor|kompansat)/.test(n)) return 'vana';
  if (/(ppr|pprc|pp-r|pvc|plastik|polietilen|pe100|koruge|atık su|atik su|pis su)/.test(n)) return 'plastik';
  if (/(boru|dirsek|te\b|redüksiyon|reduksiyon|manşon|manson|nipel|kaynak|flanş|flans)/.test(n)) return 'boru';
  return 'diger';
}
/** Politika: dosyada marka yaziyorsa o; yoksa aile → tercih listesi.
 *  mevcut: dropdown'daki gercek marka etiketleri. */
export function policyBrand(fileBrandText: string, name: string, mevcut: string[]): string {
  const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  // test kalintisi markalar politika disidir (dosya-marka eslesmesi dahil)
  const gercek = mevcut.filter((m) => !/^__|^race/i.test(m.trim()));
  const mv = gercek.map((m) => ({ raw: m, n: norm(m) }));
  const fb = norm(fileBrandText);
  if (fb && fb.length >= 4) {
    const hit = mv.find((m) => m.n === fb || (m.n.includes(fb) && fb.length >= 4) || (fb.includes(m.n) && m.n.length >= 4));
    if (hit) return hit.raw;
  }
  const fam = familyOf(name);
  const tercih: Record<Family, string[]> = {
    vana: ['duyar', 'çayırova', 'cayirova'],
    plastik: ['kalde', 'çayırova', 'cayirova', 'hakan'],
    boru: ['çayırova', 'cayirova', 'borusan', 'trakya'],
    diger: ['çayırova', 'cayirova', 'duyar'],
  };
  for (const t of tercih[fam]) {
    const hit = mv.find((m) => m.n.includes(t));
    if (hit) return hit.raw;
  }
  // "yoksa ilk uyumlu marka" — test kalintisi/çöp markalar haric ilk gercek marka
  const real = mv.find((m) => !/^__|^race/.test(m.n));
  return real?.raw ?? mevcut[0] ?? '';
}

/** Dropdown'daki mevcut marka etiketlerini ogren (ilk data satirindan bir kez). */
export async function listDropdownOptions(page: Page, rowIdx: number, colId: '_marka' | '_firma'): Promise<string[]> {
  await scrollRowIntoView(page, rowIdx);
  if (!(await triggerAc(page, rowIdx, colId))) return [];
  await page.waitForTimeout(200);
  const searchPh = colId === '_marka' ? 'Marka ara...' : 'Firma ara...';
  const search = page.locator(`input[placeholder="${searchPh}"]`);
  const hasSearch = await search.isVisible().catch(() => false);
  const labels = await page.evaluate((menuJs) => {
    // eslint-disable-next-line no-eval
    const menu = eval(menuJs) as HTMLElement | undefined;
    if (!menu) return [];
    const out: string[] = [];
    menu.querySelectorAll('div').forEach((o) => {
      const sp = o.querySelector(':scope > span');
      const t = (sp?.textContent ?? '').trim();
      if (t && t !== 'Secimi kaldir' && !out.includes(t)) out.push(t);
    });
    return out;
  }, MENU_JS);
  await closeMenus(page);
  return labels;
}
