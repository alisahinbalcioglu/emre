/**
 * Y4 = D13 (30.09, P2) — İŞÇİLİK SÜRÜKLE-DOLDURMASI ÖZET VERMİYORDU
 *
 * Malzeme doldurması bitince kullanıcıya "N satır güncellendi · N seçim
 * bekliyor · N markada yok · N sorgu hatası" tostu gösteriliyor. İşçilik
 * ikizinde bu özet `d3402cd` (SD1-SD10 yeniden yazımı) ile KAYBOLDU: o commit
 * işçilik dalındaki `onAutoVariantApplied` çağrısını sildi, yalnız malzeme
 * dalına geri koydu (commit mesajında böyle bir karar yok — gerileme).
 *
 * Sonuç: 141 satırlık bir aileye işçilik firması sürüklenince kaç satırın
 * fiyatlandığı, kaçının firmada bulunmadığı ve en önemlisi kaç satırda SUNUCU
 * HATASI olduğu kullanıcıya HİÇ söylenmiyordu — hatalı satırlar yalnız turuncu
 * zeminle, uzun bir listede gözden kaçacak şekilde kalıyordu.
 *
 * Ölçüt sinyalin KENDİSİ: harness `onAutoVariantApplied`i loglar. Gerçek
 * sayfanın tost metni ayrıca saf modülde ölçülür (doldurma-ozeti.test.ts).
 *
 * Harness satırları (işçilik mock'u): 3=4'' 40 · 4=3'' 30 · 5=2'' YOK ·
 * 6=1'' iki aday · 7=3/4'' 7 · 8=5'' 50 · 9=8'' 80 · 10=HATALI → ağ hatası.
 */
import { test, expect, Page } from '@playwright/test';

/** Projenin kanıtlanmış sürükleme gesture'u (grid.spec.ts:12 ile birebir). */
async function surukle(page: Page, kaynakRow: number, hedefRow: number, colId: string) {
  const kaynak = await page.locator(`[row-index="${kaynakRow}"] [col-id="${colId}"]`).boundingBox();
  const hedef = await page.locator(`[row-index="${hedefRow}"] [col-id="${colId}"]`).boundingBox();
  if (!kaynak || !hedef) throw new Error('hucre koordinati alinamadi');
  const x = kaynak.x + kaynak.width / 2;
  const yBas = kaynak.y + kaynak.height - 3;
  const yBit = hedef.y + hedef.height / 2;
  await page.mouse.move(x, yBas);
  await page.mouse.down();
  const adim = Math.max(6, (hedefRow - kaynakRow) * 2);
  for (let i = 1; i <= adim; i++) await page.mouse.move(x, yBas + ((yBit - yBas) * i) / adim);
  await page.mouse.up();
}

/** Son YAYILIM satırını sayılara ayırır. */
async function sonOzet(page: Page) {
  const kayit: string[] = await page.evaluate(() => window.__olay ?? []);
  const satir = [...kayit].reverse().find((o) => o.includes('YAYILIM:'));
  if (!satir) return null;
  const m = satir.match(/YAYILIM: (\d+) yazıldı · (\d+) seçim bekliyor · (\d+) yok · (\d+) hata \(kaynak: (.+), dal: (.+)\)/);
  if (!m) return { ham: satir } as any;
  return { yazilan: +m[1], bekleyen: +m[2], yok: +m[3], hata: +m[4], kaynak: m[5], dal: m[6], ham: satir };
}

async function isccilikDoldur(page: Page) {
  await page.goto('/dev/grid-test');
  await page.locator('[row-index="2"] [col-id="_firma"] button').click();
  await page.getByText('YASİN USTA', { exact: true }).click();
  await expect(page.locator('[row-index="2"] [col-id="_labBirim"]')).toHaveText(/60/);
  await surukle(page, 2, 10, '_firma');
  // FİKSTÜR KANITI: doldurma GERÇEKTEN koştu (yoksa "özet yok" yanlış sebepten).
  await expect(page.locator('[row-index="3"] [col-id="_labBirim"]')).toHaveText(/40/);
  await expect(page.locator('[row-index="9"] [col-id="_labBirim"]')).toHaveText(/80/);
}

test.describe('Y4 — işçilik sürükle-doldurması özet verir', () => {
  test('★★ özet sinyali GELİR ve İŞÇİLİK dalı olarak işaretlidir', async ({ page }) => {
    await isccilikDoldur(page);
    await expect.poll(async () => (await sonOzet(page))?.dal ?? null, { timeout: 10_000 }).toBe('iscilik');
  });

  test('★ yazılan satır sayısı doğru (40·30·7·50·80 = 5)', async ({ page }) => {
    await isccilikDoldur(page);
    await expect.poll(async () => (await sonOzet(page))?.yazilan ?? null, { timeout: 10_000 }).toBe(5);
  });

  test('★ seçim bekleyen (1\'\' iki aday) ve firmada yok (2\'\') ayrı sayılır', async ({ page }) => {
    await isccilikDoldur(page);
    await expect.poll(async () => (await sonOzet(page))?.bekleyen ?? null, { timeout: 10_000 }).toBe(1);
    expect((await sonOzet(page))?.yok).toBe(1);
  });

  test('★★ SUNUCU HATASI sayısı kullanıcıya ulaşır (HATALI satır)', async ({ page }) => {
    // Kaybolan özetin en pahalı parçası: hatalı satır yalnız turuncu zeminle
    // kalıyor, uzun listede gözden kaçıyordu.
    await isccilikDoldur(page);
    await expect.poll(async () => (await sonOzet(page))?.hata ?? null, { timeout: 10_000 }).toBe(1);
  });
});
