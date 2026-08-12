/**
 * KÂR DEĞERİ TEK SÜZGEÇTEN — kaynak taraması kapısı.
 *
 * NEDEN KAYNAK TARAMASI: kâr hücresini okuyan yolların çoğu `ExcelGrid.tsx`
 * içinde AG-Grid olay nesnelerine bağlı; bu repoda jsdom yok, o yollar birim
 * testiyle çalıştırılamıyor. Ölçülebilen tek şey KAYNAĞIN KENDİSİ.
 * Aynı desen projede zaten var: `lib/marj-tek-kaynak.test.ts` (ham marj
 * çarpımı yasağı) ve `lib/popup-secici-sozlesmesi.test.ts`.
 *
 * ── BU KAPININ DOĞDUĞU AN (12.08.2026) ──────────────────────────────────
 * Kâr okuma noktaları `sayiAlani`ya bağlanırken SÜRÜKLE-DOLDUR yolu
 * (`ExcelGrid.tsx` fill-handle, `result.field === '_malzKar'`) gözden
 * kaçmıştı. Sonuç, düzeltmeden ÖNCEKİNDEN DE KÖTÜ olurdu:
 *
 *   Kaynak hücrede "12,5" yazıyor, kullanıcı aşağı sürüklüyor.
 *     kaynak satır  → sayiAlani("12,5") = 12,5  → fiyat ×1,125
 *     sürüklenenler → parseFloat("12,5") = 12   → fiyat ×1,12
 *   Yani AYNI SÜTUNDA iki farklı kâr. (Düzeltmeden önce ikisi de 12 idi:
 *   tutarlı ama yanlış; yarım düzeltme tutarsız YAPARDI.)
 *
 * KURAL: adında "kar" geçen bir değişken ham `parseFloat`/`Number` ile
 * doldurulamaz — `sayiAlani` (ozellik/fiyat/sayi-alani) kullanılır.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/** Kâr hücresi okuyan üretim dosyaları (yolları SABİT — dosya taşınırsa
 *  kapı "dosya bulunamadı" ile kırmızı yanar, sessizce kapsam kaybetmez). */
const KAPSAM = [
  'ozellik/tablo/excel-grid/ExcelGrid.tsx',
  'ozellik/tablo/excel-grid/fill-down.ts',
  'ozellik/teklif/teklif-kalem.ts',
  'ozellik/fiyat/pricing.ts',
  'app/(protected)/quotes/new/page.tsx',
  // 12.08 — DRAFT RESTORE yolu. Bu modul 11.08'de yazilmisti ve kari ham
  // `parseFloat(String(row[karAlani] ?? 0)) || 0` ile okuyordu; page.tsx'ten
  // ayri dosyaya tasindigi icin kapsam disinda kalsaydi kapi YESIL yanarken
  // sizinti geri gelirdi (sessiz kapsam kaybi — bu listenin varlik sebebi).
  'ozellik/teklif/restore-rematch.ts',
];

const KOK = path.resolve(__dirname, '../..');

/**
 * ÖLÇÜT ALANA BAĞLI, DEĞİŞKEN ADINA DEĞİL.
 *
 * İlk hâli `const <birseyKar> = parseFloat(...)` biçimini arıyordu ve kapı,
 * KORUMAK İÇİN YAZILDIĞI iki hata biçimini de göremiyordu (çekişmeli inceleme
 * ölçtü):
 *   `materialMargin: row.materialKar || 0,`   ← 12.08 CANLI 400'ün LİTERAL kökü
 *   `hesaplaSatisBirimFiyat(n, parseFloat(String(row._malzKar ?? 0)) || 0)`
 *                                             ← bu turda kaldırılan gerçek satır
 * Yani kapı, adını taşıdığı hatayla aynı dosyada yan yana yeşil yanabiliyordu.
 *
 * Yeni kural: bir kod satırı kâr alanını OKUYORSA (`.materialKar`, `._malzKar`,
 * `._iscKar`, `.laborKar` — nokta/köşeli erişim), o satırda `sayiAlani(` de
 * geçmek ZORUNDA. Yazma biçimleri (obje anahtarı `_malzKar: 0`, string literal
 * `'_malzKar'`, `setDataValue('_malzKar', …)`, tip bildirimi `_malzKar?:`)
 * okuma DEĞİLDİR ve kurala girmez.
 */
const ALAN = '_malzKar|_iscKar|materialKar|laborKar';
/**
 * OKUMA = nokta erişimi (`row._malzKar`) VEYA köşeli erişim (`data['_iscKar']`).
 * ⚠ Köşeli parantezden ÖNCE bir tanımlayıcı/`)`/`]` şart: aksi hâlde DİZİ
 * SÖZDİZİMİ (`new Set(['_malzKar', …])`) okuma sanılıyordu — kapının ilk
 * koşumunda tam olarak bu yanlış pozitif çıktı (ölçüt önce doğrulanır).
 */
const KAR_OKUMA = new RegExp(`(?:\\.(?:${ALAN})\\b)|(?:[\\w)\\]]\\[\\s*['"](?:${ALAN})['"])`);
/**
 * İKİNCİ KURAL — kâr DEĞİŞKENİ ham ayrıştırma ile doldurulamaz.
 *
 * ⚠ Bu kural, alan kuralının YERİNE DEĞİL YANINA durur. Alan kuralına
 * geçilince ilk hâlin kapsadığı bir vaka SESSİZCE düştü ve mutasyon kapısı
 * onu yakaladı: sürükle-doldur yolu kârı `result.value`den okur — satırda
 * hiçbir kâr ALANI geçmez, dolayısıyla alan kuralı göremez:
 *     const karVal = parseFloat(String(result.value ?? 0)) || 0;
 * Ölçütü genişletmek, eskisini atmak demek değildir; birleşim alınır.
 */
const HAM_KAR_DEGISKENI = /\b(?:const|let|var)\s+\w*[Kk]ar\w*\s*=\s*(?:parseFloat|Number)\s*\(/;
const SUZGEC = /\bsayiAlani\s*\(/;
/**
 * Okuma sayılmayan biçimler — AÇIK beyaz liste (sessiz genişleme olmasın):
 *  · `setDataValue('_malzKar', …)`  → yazma
 *  · `_malzKar: 0` / `_malzKar?: number` → obje anahtarı / tip bildirimi
 *  · `value={row.materialKar}`      → JSX GÖSTERİM bağlaması, hesap değil
 *    (burada `sayiAlani` YANLIŞ olurdu: boş alanı 0'a çevirip kullanıcının
 *     sildiği hücreye "0" yazardı).
 */
const YAZMA_BICIMI = new RegExp(`setDataValue\\s*\\(|\\b(?:${ALAN})\\s*[?]?\\s*:|value=\\{\\s*\\w+\\.(?:${ALAN})\\s*\\}`);

function kodSatirlari(icerik: string): Array<{ no: number; metin: string }> {
  return icerik.split(/\r?\n/)
    .map((metin, i) => ({ no: i + 1, metin: metin.trim() }))
    // Yorum satırı KOD DEĞİLDİR: bu dosyaların yorumları eski ham okumayı
    // ANLATIYOR (ders notu), uygulamıyor. Kapı zayıflamaz — kod satırındaki
    // her eşleşme yine yakalanır.
    .filter(({ metin }) => !(metin.startsWith('//') || metin.startsWith('*') || metin.startsWith('/*')));
}

describe('KÂR TEK SÜZGEÇ — kaynak taraması', () => {
  it('A) kapsam dosyaları GERÇEKTEN okunabiliyor (boş-küme kapısı)', () => {
    for (const d of KAPSAM) {
      const y = path.join(KOK, d);
      expect(fs.existsSync(y), `${d} bulunamadı — kapı kapsamını kaybetmiş olabilir`).toBe(true);
      expect(fs.readFileSync(y, 'utf8').length).toBeGreaterThan(500);
    }
    expect(KAPSAM.length).toBeGreaterThanOrEqual(6);
  });

  /** Bir kod satırı kuralı ihlal ediyor mu? (tek yer — test ile ölçüt aynı) */
  const ihlalMi = (metin: string): boolean =>
    (KAR_OKUMA.test(metin) || HAM_KAR_DEGISKENI.test(metin))
    && !SUZGEC.test(metin) && !YAZMA_BICIMI.test(metin);

  it('B) kâr alanını okuyan her satır `sayiAlani`dan geçiyor', () => {
    const ihlaller: string[] = [];
    for (const d of KAPSAM) {
      for (const { no, metin } of kodSatirlari(fs.readFileSync(path.join(KOK, d), 'utf8'))) {
        if (ihlalMi(metin)) ihlaller.push(`${d}:${no}  ${metin.slice(0, 100)}`);
      }
    }
    expect(
      ihlaller,
      'Kâr alanı süzgeçsiz okunuyor — `sayiAlani()` kullanın (ozellik/fiyat/sayi-alani):\n'
      + ihlaller.join('\n'),
    ).toEqual([]);
  });

  it('C) ÖLÇÜTÜN KENDİSİ ölçülüyor: desen GERÇEK ihlal biçimlerini yakalar', () => {
    // Dairesel ölçüt yasağı: kural "hiç ihlal yok" diye yeşil yanıyorsa,
    // desenin çalıştığını AYRI kanıtla. Aşağıdakilerin HEPSİ bu depoda
    // GERÇEKTEN görülmüş satırlar.
    const YAKALANMALI = [
      // 12.08 CANLI 400'ün literal kökü — obje alanı, `|| 0`, parseFloat YOK.
      // İlk desen bunu göremiyordu; kapı adını taşıdığı hatayla yan yana
      // yeşil yanıyordu.
      'materialMargin: row.materialKar || 0,',
      'laborMargin: row.laborKar || 0,',
      // Bu turda quotes/new/page.tsx:578'den kaldırılan satır — parseFloat
      // satır içi argüman, değişken adı 'satisRestore' (ilk desen kaçırırdı).
      'const satisRestore = hesaplaSatisBirimFiyat(m.netPrice, parseFloat(String(row._malzKar ?? 0)) || 0);',
      // Klasik biçimler
      'const kar = parseFloat(String(row._malzKar ?? 0)) || 0;',
      'const matKar = parseFloat(String(row._malzKar ?? 0)) || 0;',
      'const kar = r._malzKar || 0;',
      'const kar = +row._malzKar;',
      "const k = node.data['_iscKar'];",
      // ★ İKİNCİ KURALIN VARLIK SEBEBİ: satırda hiçbir kâr ALANI geçmiyor
      // (kaynak `result.value`), yalnız değişken adı kâr diyor. Alan kuralına
      // geçerken bu vaka sessizce düşmüştü — mutasyon kapısı yakaladı.
      'const karVal = parseFloat(String(result.value ?? 0)) || 0;',
      'const iscKarVal = parseFloat(String(result.value ?? 0)) || 0;',
      'const oncekiKar = parseFloat(String(e.oldValue ?? 0)) || 0;',
      // ★ restore-rematch.ts'in DOLAYLI erisimi (`row[taraf.karAlani]`): alan
      // adi satirda LITERAL gecmez, dolayisiyla ALAN kurali goremez — bu dosyayi
      // koruyan yalniz DEGISKEN kuralidir. Kapsam listesine eklerken bunun
      // gercekten yakalandigi ayrica olculur, varsayilmaz.
      'const kar = parseFloat(String(row[taraf.karAlani] ?? 0)) || 0;',
    ];
    for (const s of YAKALANMALI) expect(ihlalMi(s), `YAKALANMALIYDI: ${s}`).toBe(true);

    const YAKALANMAMALI = [
      // Doğru hâl
      'const kar = sayiAlani(row._malzKar);',
      "const kar = sayiAlani(node.data[iscilikMi ? '_iscKar' : '_malzKar']);",
      'materialMargin: sayiAlani(r._malzKar),',
      // Yazma / bildirim / string literal — okuma DEĞİL
      "node.setDataValue('_malzKar', karVal);",
      '_malzKar: 0,',
      '_malzKar?: number | string;',
      // DİZİ SÖZDİZİMİ — köşeli erişim DEĞİL (ilk desende yanlış pozitifti)
      "const QUOTE_SYSTEM_FIELDS = new Set(['_malzKar', '_marka', '_iscKar', '_firma']);",
      "const SISTEM = ['_malzKar', '_iscKar'];",
      "if (result.field === '_malzKar') {",
      // JSX GÖSTERİM bağlaması — hesap değil; sayiAlani burada YANLIŞ olurdu
      '<Input type="number" min={0} step={1} value={row.materialKar}',
      '<Input type="number" min={0} step={1} value={row.laborKar}',
      // Kârla ilgisi olmayan ham okuma serbest (kapı fazla geniş değil)
      'const netPrice = parseFloat(String(node.data._matNetPrice ?? 0)) || 0;',
      // restore-rematch.ts'in DOGRU hali — dolayli erisim + suzgec
      'const kar = sayiAlani(row[taraf.karAlani]);',
    ];
    for (const s of YAKALANMAMALI) expect(ihlalMi(s), `YAKALANMAMALIYDI: ${s}`).toBe(false);

    expect(YAKALANMALI.length + YAKALANMAMALI.length).toBeGreaterThanOrEqual(18);
  });
});
