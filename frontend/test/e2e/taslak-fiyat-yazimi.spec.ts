/**
 * D5 (30.09, P1) — TASLAK YALNIZ REACT STATE DEĞİŞİNCE YAZILIYOR
 *
 * Düzenle ekranının taslağını (sessionStorage) tek bir `useEffect` yazıyor ve
 * bağımlılık dizisi TAMAMEN REFERANS TABANLI:
 *   [multiSheet, liveRowDataBySheet, activeSheetIndex, ...]
 * ExcelGrid satırları YERİNDE (in-place) değiştiriyor: `node.data[alan] = x`
 * ve `setDataValue`. Dizi referansı DEĞİŞMEDİĞİ için efekt hiç koşmuyor.
 *
 * Bu bilinçli bir tasarım kısıtının yan etkisi: `onRowDataChange` BİLEREK
 * verilmiyor (page.tsx:2025) — her hücre yazımında parent render açık editörü
 * iptal ederdi. Parent'a yalnız YAPISAL olay bildiriliyor (`onStructureChange`:
 * satır ekle/sil, fitting bağı). Fiyat yazımı yapısal olay DEĞİL.
 *
 * KULLANICI-GÖRÜNÜR SONUÇ: kullanıcı fiyatları elle yazar (ya da marka seçip
 * eşleştirir), sekme değiştirmez, satır eklemez — sonra F5 atar ya da sekme
 * çöker. Taslak o yazımları HİÇ görmediği için emeğin tamamı gider.
 *
 * ── BU TEST NEYİ ÖLÇER ──────────────────────────────────────────────────────
 * GERÇEK `/quotes/new` sayfasını ölçer, harness'ı DEĞİL: taslak kodu yalnız o
 * sayfada yaşıyor, harness'a taslak eklemek proxy ölçüt olurdu.
 * Arka uç GEREKMİYOR: `(protected)` kapısı tamamen istemci tarafı (JWT BİÇİMİ
 * + ayrıştırılabilir `user`), taslak da sessionStorage'dan geri yüklenir.
 * `/api/**` istekleri yine de kesiliyor ki ölçüm ağa bağlı olmasın.
 *
 * Ölçüt ürünün GERÇEK çıktısıdır: `sessionStorage['metaprice_quote_draft']`
 * içeriği — anahtar ve sürüm ÜRÜN KODUNDAN import edilir, testte tekrar
 * yazılmaz (dairesel ölçüt yasağı).
 */
import { test, expect, Page } from '@playwright/test';
import { TASLAK_ANAHTARI, TASLAK_SURUMU } from '../../ozellik/teklif/taslak';

/** Biçimi geçerli, imzası anlamsız jeton — kapı yalnız BİÇİM sınıyor. */
const JETON = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.imzaYok_test';

const ROLLER = {
  nameField: 'col1', noField: 'col0', quantityField: 'col2', unitField: 'col3',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  grandTotalField: '_toplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
};

const KOLONLAR = [
  { field: 'col0', headerName: 'No', width: 60, editable: true },
  { field: 'col1', headerName: 'Malzeme Adı', width: 260, editable: true },
  { field: 'col2', headerName: 'Miktar', width: 80, editable: true },
  { field: 'col3', headerName: 'Birim', width: 70, editable: true },
  { field: '_malzKar', headerName: 'Malz. Kar %', width: 85, editable: true },
  { field: '_matBirim', headerName: 'Malz. Birim Fiyat', width: 120, editable: true },
  { field: '_matToplam', headerName: 'Malz. Toplam', width: 120, editable: false },
  { field: '_iscKar', headerName: 'İşç. Kar %', width: 80, editable: true },
  { field: '_labBirim', headerName: 'İşç. Birim Fiyat', width: 120, editable: true },
  { field: '_labToplam', headerName: 'İşç. Toplam', width: 120, editable: false },
  { field: '_toplam', headerName: 'Toplam', width: 120, editable: false },
];

// ⚠ `brandRenderer` / `firmaRenderer` KOLONLARI FİKSTÜRDE YOK — ölçüldü:
// `allBrands: []` ile o renderer'lar grid altağacını düşürüyor (sayfa yüklü
// kalıyor ama hücreler DOM'dan kayboluyor ve `dblclick` 60 sn'de zaman
// aşımına düşüyor). Bu test ELLE fiyat yazımını ölçüyor; marka seçimi için
// renderer'a ihtiyacı yok. Marka/firma yollarını `/dev/grid-test` ölçüyor.


const satir = (i: number, ad: string, mik: string) => ({
  _rowIdx: i, _isDataRow: true, _isHeaderRow: false,
  _malzKar: 0, _iscKar: 0, _marka: null, _firma: null,
  _matNetPrice: 0, _labNetPrice: 0, _merges: {},
  col0: String(i), col1: ad, col2: mik, col3: 'mt',
  _matBirim: '', _matToplam: '', _labBirim: '', _labToplam: '', _toplam: '',
});

function taslak() {
  const sheet = {
    name: 'Mekanik', index: 0, isEmpty: false, headerEndRow: 0,
    columnDefs: KOLONLAR, columnRoles: ROLLER, brands: [],
    rowData: [satir(1, 'Siyah Boru DN25', '10'), satir(2, 'Küresel Vana DN25', '4')],
  };
  return {
    v: TASLAK_SURUMU,
    multiSheet: { sheets: [sheet], brands: [] },
    activeSheetIndex: 0,
    sheetDisciplines: { 0: 'mechanical' },
    title: 'D5 ölçümü',
    allBrands: [],
    colHiddenBySheet: {},
    colWidthsBySheet: {},
    colFloorsBySheet: {},
  };
}

async function ac(page: Page) {
  // Ağ kesilir: ölçüm arka uca bağlı olmasın.
  await page.route('**/api/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{}',
  }));
  await page.addInitScript(
    ([jeton, anahtar, veri]) => {
      localStorage.setItem('token', jeton as string);
      localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'x@y.z', tier: 'pro' }));
      // ⚠ YALNIZ BIR KEZ TOHUMLA: `addInitScript` HER gezinmede — YENILEME DAHIL —
      // yeniden kosar. Ilk halinde kosulsuz yaziyordu; F5'te temiz taslagi
      // yeniden yazip urunun yazdigi 250'yi eziyor ve test URUN KUSURU gibi
      // kirmizi yaniyordu. Iz alinarak bulundu (her get/set/remove sirayla
      // kaydedildi): yeni sayfa geri yuklemesi aslinda `GET:250` okuyordu.
      if (!sessionStorage.getItem(anahtar as string)) {
        sessionStorage.setItem(anahtar as string, veri as string);
      }
    },
    [JETON, TASLAK_ANAHTARI, JSON.stringify(taslak())] as const,
  );
  await page.goto('/quotes/new');
  // Taslak geri yüklendi mi? (Kapı geçilmemişse grid hiç gelmez.)
  await expect(page.locator('[row-index="0"] [col-id="col1"]')).toHaveText(/Siyah Boru DN25/, { timeout: 30_000 });
}

/** Hucreyi YATAY sanallastirmadan cikarip gorunur yapar ve dondurur.
 *  Gercek `/quotes/new` gridi harness'tan GENIS: fiyat kolonlari ilk cizimde
 *  DOM'da OLMUYOR ve `dblclick` zaman asimina dusuyor (olculdu: 60 sn × 4). */
async function hucre(page: Page, row: number, col: string) {
  const bul = () => page.locator(`[row-index="${row}"] [col-id="${col}"]`);
  if (await bul().count() === 0) {
    await page.locator('.ag-center-cols-viewport').first().evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
  }
  const h = bul();
  await expect(h).toBeVisible({ timeout: 15_000 });
  await h.scrollIntoViewIfNeeded();
  return h;
}

/** Taslaktaki ilk sayfanın satırları. */
async function taslakSatirlari(page: Page, anahtar: string) {
  return page.evaluate((k) => {
    const ham = sessionStorage.getItem(k);
    if (!ham) return null;
    const t = JSON.parse(ham);
    return t?.multiSheet?.sheets?.[0]?.rowData ?? null;
  }, anahtar);
}

test.describe('D5 — elle yazılan fiyat taslağa girer', () => {
  test('★ FİKSTÜR KANITI: sayfa taslaktan açıldı ve iki veri satırı var', async ({ page }) => {
    // Bu olmadan aşağıdaki testler "taslak boş" diye yanlış sebepten geçebilir.
    await ac(page);
    await expect(page.locator('[row-index="1"] [col-id="col1"]')).toHaveText(/Küresel Vana DN25/);
    const satirlar = await taslakSatirlari(page, TASLAK_ANAHTARI);
    expect(satirlar).toHaveLength(2);
  });

  test('★★ ELLE yazılan malzeme birim fiyatı TASLAĞA yazılır', async ({ page }) => {
    await ac(page);
    const h = await hucre(page, 0, '_matBirim');
    await h.dblclick();
    await page.keyboard.type('250');
    await page.keyboard.press('Enter');
    // Ekranda yazıldı — karşılaştırma tabanı.
    await expect(h).toHaveText(/250/);

    // ★ Taslakta da var mı? Kusurlu hâlde '' kalıyordu (F5'te emek gidiyordu).
    await expect.poll(async () => {
      const s = await taslakSatirlari(page, TASLAK_ANAHTARI);
      return String(s?.[0]?._matBirim ?? '');
    }, { timeout: 10_000 }).toMatch(/250/);
  });

  test('★★ SAYFA GİZLENİNCE taslak HEMEN yazılır (gecikmeyi beklemeden)', async ({ page }) => {
    // 600 ms'lik gecikme tek kayıp penceresi; sekme kapatma/gizleme o pencereyi
    // kapatır. Bu test unload kancalarının GERÇEKTEN yazdığını ölçer — yoksa
    // onlar ölçülemeyen savunma olarak kalırdı.
    await ac(page);
    const h = await hucre(page, 0, '_matBirim');
    await h.dblclick();
    await page.keyboard.type('250');
    await page.keyboard.press('Enter');
    await expect(h).toHaveText(/250/);

    // ⚠ KANCALARI YALITMAK İÇİN DAR PENCERE: gecikme 600 ms. Olayları
    // tetikleyip taslağı TEK OKUMAYLA, beklemeden kontrol ediyoruz. Geniş
    // pencereyle (2 sn) ölçtüğümde gecikme zaten yazıyordu ve kancaları
    // kaldıran mutant YAŞIYORDU — yani test onları ölçmüyordu.
    const once = String((await taslakSatirlari(page, TASLAK_ANAHTARI))?.[0]?._matBirim ?? '');
    expect(once, 'gecikme daha dolmamış olmalı (ölçüm penceresi geçerli)').not.toMatch(/250/);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
      window.dispatchEvent(new Event('beforeunload'));
    });
    const sonra = String((await taslakSatirlari(page, TASLAK_ANAHTARI))?.[0]?._matBirim ?? '');
    expect(sonra, 'unload kancası taslağı HEMEN yazmalı').toMatch(/250/);
  });

  test('★★ F5 SONRASI fiyat ekranda DURUR (kullanıcının emeği gitmez)', async ({ page }) => {
    await ac(page);
    const h = await hucre(page, 0, '_matBirim');
    await h.dblclick();
    await page.keyboard.type('250');
    await page.keyboard.press('Enter');
    await expect(h).toHaveText(/250/);

    // SÖZLEŞME: yazım GECİKMELİ (600 ms) — React render üretmemek için. Önce
    // taslağa girdiğini bekle, SONRA yenile.
    await expect.poll(async () => {
      const s2 = await taslakSatirlari(page, TASLAK_ANAHTARI);
      return String(s2?.[0]?._matBirim ?? '');
    }, { timeout: 10_000 }).toMatch(/250/);

    await page.reload();
    await expect(page.locator('[row-index="0"] [col-id="col1"]')).toHaveText(/Siyah Boru DN25/, { timeout: 30_000 });
    // Kusurlu hâlde: '' — elle yazılan fiyat yenilemede kayboluyordu.
    await expect(await hucre(page, 0, '_matBirim'), 'F5 sonrası fiyat KAYBOLDU').toHaveText(/250/);
  });

  // ⚠ İŞÇİLİK İKİZİ BU DOSYADA ÖLÇÜLEMEDİ — ölçüldü ve sebebi yazıldı:
  // `laborEnabled` sayfada API'den gelen `capabilities`ten türetiliyor; bu test
  // ağı kestiği için (`/api/**` → `{}`) işçilik YETKİSİZ kalıyor ve
  // `_labBirim` hücresi `editable=false` oluyor — dblclick editör açmıyor.
  // Yetkiyi taklit etmek ürünün yetki kurallarını da taklit etmek olurdu
  // (proxy ölçüt yasağı). İKİZ GÜVENCESİ KODDAN GELİYOR: elle yazım tek yoldan
  // geçiyor (`handleCellValueChanged` sonundaki `paraYazildi()`), malzeme ve
  // işçilik için AYRI dal yok — yani aşağıdaki malzeme ölçümü ikizi de kapsar.
  // Ayrıca `yazVeri` ve `yazVeriLab` ikisi de sinyali veriyor (ExcelGrid.tsx).

  test('★ ÇOKLU PARA BİRİMİ F2 KONTROLÜ: tl kipinde elle fiyat taraf birimi YAZMAZ (kayıt verisi değişmez)', async ({ page }) => {
    // Üretim sayfası F6'ya dek karışık kipi açmaz; yalnız-TL teklifin satır
    // verisine `_matPB` sızarsa kayıt baytları değişir. Taslak, satırın tam
    // halini taşıdığı için ölçüt burada.
    await ac(page);
    const h = await hucre(page, 0, '_matBirim');
    await h.dblclick();
    await page.keyboard.type('250');
    await page.keyboard.press('Enter');
    await expect.poll(async () => String((await taslakSatirlari(page, TASLAK_ANAHTARI))?.[0]?._matBirim ?? ''), { timeout: 10_000 }).toMatch(/250/);
    const satir = (await taslakSatirlari(page, TASLAK_ANAHTARI))?.[0] ?? {};
    expect('_matPB' in satir, 'tl kipinde _matPB yazildi').toBe(false);
    expect(String(satir._matToplam)).toBe('2500.0'); // ₺ kurali: 1 hane metni
  });

  test('★ TÜRETİLEN hücre de taşınır: satır toplamı taslakta', async ({ page }) => {
    // Birim fiyat × miktar satır toplamını üretir; o da yerinde yazılır.
    await ac(page);
    const h = await hucre(page, 0, '_matBirim');
    await h.dblclick();
    await page.keyboard.type('250');
    await page.keyboard.press('Enter');
    await expect(page.locator('[row-index="0"] [col-id="_matToplam"]')).not.toHaveText(/^\s*$/);
    await expect.poll(async () => {
      const s = await taslakSatirlari(page, TASLAK_ANAHTARI);
      return String(s?.[0]?._matToplam ?? '');
    }, { timeout: 10_000 }).toMatch(/2500/); // 250 × 10 — LİTERAL
  });
});

/**
 * TASLAK YAZILAMAZSA (Emre kararı 02.10): sessionStorage yazımı başarısız olursa
 * (kota aşımı) ESKİ taslak SİLİNMEZ, korunur; kullanıcı "Taslak kaydedilemedi"
 * uyarısı görür. Yazılamayan son değişiklik kaybolur, önceki taslak kalır.
 * Eski kod catch'te taslağı SİLİYORDU ("bayat restore olmasın") — F5'te
 * kullanıcı bütün emeğini kaybediyordu, oysa önceki taslak yalnız son
 * değişikliği eksik bir taslaktı.
 *
 * Uyarı DURUM DEĞİŞİNCE bir kez: her yazım denemesinde değil (tost seli yok).
 * ⚠ Ölçüt DOM'daki tost SAYISI olamaz: tost sınırı 1 (use-toast TOAST_LIMIT),
 * yeni tost eskisinin YERİNE geçer — sel olsa da DOM 1 gösterir. Her `toast()`
 * çağrısı YENİ kimlikli öğe ekler; gözlemci eklenen öğeleri sayar.
 */
async function yazimiBoz(page: Page, anahtar: string) {
  await page.evaluate((k) => {
    const w = window as any;
    w.__taslakBozuk = true;
    w.__taslakDeneme = 0;
    if (!w.__asilSetItem) {
      w.__asilSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, val: string) {
        if (key === k && w.__taslakBozuk) {
          w.__taslakDeneme++;
          throw new DOMException('kota (test)', 'QuotaExceededError');
        }
        return w.__asilSetItem.call(this, key, val);
      };
    }
    // Eklenen "Taslak kaydedilemedi" tost öğelerini say (her toast() çağrısı yeni öğe).
    w.__uyariSayisi = 0;
    new MutationObserver((kayitlar) => {
      for (const kayit of kayitlar) kayit.addedNodes.forEach((n) => {
        if (n instanceof HTMLElement && n.matches('li, [role="status"]') && /Taslak kaydedilemedi/.test(n.textContent ?? '')) w.__uyariSayisi++;
      });
    }).observe(document.body, { childList: true, subtree: true });
  }, anahtar);
}

async function elleYaz(page: Page, deger: string) {
  const h = await hucre(page, 0, '_matBirim');
  await h.dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(deger);
  await page.keyboard.press('Enter');
  await expect(h).toHaveText(new RegExp(deger));
}

test.describe('TASLAK YAZILAMAZSA — eski taslak korunur + uyarı bir kez', () => {
  test('★★ yazım başarısız olunca ÖNCEKİ taslak silinmez', async ({ page }) => {
    await ac(page);
    await elleYaz(page, '250');
    await expect.poll(async () => String((await taslakSatirlari(page, TASLAK_ANAHTARI))?.[0]?._matBirim ?? ''), { timeout: 10_000 }).toMatch(/250/);

    await yazimiBoz(page, TASLAK_ANAHTARI);
    await elleYaz(page, '300');
    // FİKSTÜR KANITI: yazım GERÇEKTEN denendi ve başarısız oldu.
    await expect.poll(() => page.evaluate(() => (window as any).__taslakDeneme), { timeout: 10_000 }).toBeGreaterThan(0);
    const satirlar = await taslakSatirlari(page, TASLAK_ANAHTARI);
    expect(satirlar, 'önceki taslak SİLİNDİ').not.toBeNull();
    expect(String(satirlar?.[0]?._matBirim ?? '')).toMatch(/250/);
  });

  test('★★ kullanıcı "Taslak kaydedilemedi" uyarısını görür', async ({ page }) => {
    await ac(page);
    await yazimiBoz(page, TASLAK_ANAHTARI);
    await elleYaz(page, '300');
    await expect(page.getByText('Taslak kaydedilemedi').first()).toBeVisible({ timeout: 10_000 });
  });

  test('★★ uyarı her denemede değil, durum değişince BİR KEZ (tost seli yok)', async ({ page }) => {
    await ac(page);
    await yazimiBoz(page, TASLAK_ANAHTARI);
    await elleYaz(page, '300');
    await expect.poll(() => page.evaluate(() => (window as any).__uyariSayisi), { timeout: 10_000 }).toBe(1);
    await elleYaz(page, '400');
    // İkinci başarısız denemenin GERÇEKTEN olduğunu bekle (yoksa "1" yanlış sebepten geçer).
    await expect.poll(() => page.evaluate(() => (window as any).__taslakDeneme), { timeout: 10_000 }).toBeGreaterThan(1);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).__uyariSayisi)).toBe(1);
  });

  test('★ yazım düzelince yeni hal yazılır; SONRAKİ arıza yine bir kez uyarır', async ({ page }) => {
    await ac(page);
    await yazimiBoz(page, TASLAK_ANAHTARI);
    await elleYaz(page, '300');
    await expect.poll(() => page.evaluate(() => (window as any).__uyariSayisi), { timeout: 10_000 }).toBe(1);
    await page.evaluate(() => { (window as any).__taslakBozuk = false; });
    await elleYaz(page, '500');
    await expect.poll(async () => String((await taslakSatirlari(page, TASLAK_ANAHTARI))?.[0]?._matBirim ?? ''), { timeout: 10_000 }).toMatch(/500/);
    await page.evaluate(() => { (window as any).__taslakBozuk = true; });
    await elleYaz(page, '600');
    await expect.poll(() => page.evaluate(() => (window as any).__uyariSayisi), { timeout: 10_000 }).toBe(2);
  });
});
