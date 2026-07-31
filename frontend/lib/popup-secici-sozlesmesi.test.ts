/**
 * KD5c — ADAY POPUP SEÇİCİ SÖZLEŞMESİ (pano C-D)
 *
 * KÖK NEDEN (ölçüldü): `resolvePopupIfAny` popup'ın başlık div'ini
 *     /Seçim gerekli/.test(d.textContent) && d.children.length === 0
 * ile arıyordu — yani "Seçim gerekli" yazan ve HİÇ ÇOCUK ELEMANI OLMAYAN
 * yaprak div. Commit `44babd1` başlığa sürükleme tutamağı ekledi:
 *     <div data-testid="aday-popup-baslik"> <span>⠿</span> 🟡 Seçim gerekli … </div>
 * Artık `children.length === 1` → seçici HİÇBİR ŞEY BULMUYOR → popup hiç
 * çözülmüyor → satır fiyatsız kalıyor → `sahinkul-golden.spec.ts:239` kırmızı.
 *
 * Ürün doğru çalışıyordu: motor `multi` dönüp SORUYOR (I7 / fallback yasağı).
 * Kırılan şey TEST HARNESS'ıydı ve bir UI değişikliğinin yan etkisiydi.
 *
 * DERS: harness, UI'ın **iç yapısına** (yaprak mı, kaç çocuğu var) yaslanmamalı.
 * Sözleşme `data-testid` olmalı — o bilerek konur, kazara değişmez.
 *
 * Bu dosya sözleşmeyi kilitler. İki AYRI kriter, iki AYRI assert:
 *   KD5c-a  harness kırılgan yaprak-div taramasını KULLANMAZ
 *   KD5c-b  harness ile UI AYNI testid üzerinde anlaşır
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const oku = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf-8');

/** Yorumlari at — kural KODU baglar, aciklamayi degil. (PK6'da ayni tuzak:
 *  tarayici yorum satirindaki ornegi ihlal sanip yanlis alarm veriyordu.) */
const kodu = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.split('//')[0]).join('\n');

const helpers = kodu(oku('../e2e-golden/helpers.ts'));
const grid = kodu(oku('../components/excel-grid/ExcelGrid.tsx'));

describe('KD5c — aday popup seçici sözleşmesi', () => {
  it('KD5c-a: harness kırılgan "yaprak div" taramasına yaslanmaz', () => {
    // `children.length === 0` popup başlığının İÇ YAPISINA bağımlıdır.
    // 44babd1 başlığa bir <span> ekleyince sessizce kırıldı — hiçbir test
    // uyarmadı, yalnız uçtaki assert "fiyat boş" diye patladı.
    const kirilgan = /children\.length\s*===\s*0/.test(helpers);
    expect(
      kirilgan,
      'helpers.ts hâlâ `children.length === 0` ile başlık arıyor — bir UI '
      + 'değişikliği (ör. başlığa ikon eklemek) popup çözümünü SESSİZCE kırar.',
    ).toBe(false);
  });

  it('KD5c-b: harness ile UI aynı data-testid üzerinde anlaşır', () => {
    const uiTestid = /data-testid="aday-popup"/.test(grid);
    expect(uiTestid, 'ExcelGrid.tsx popup kabına `data-testid="aday-popup"` koymalı').toBe(true);

    const harnessTestid = /\[data-testid="aday-popup"\]/.test(helpers);
    expect(
      harnessTestid,
      'helpers.ts popup\'ı `[data-testid="aday-popup"]` ile bulmalı — testid '
      + 'bilerek konan bir sözleşmedir, DOM ağacının şekli değildir.',
    ).toBe(true);
  });
});
