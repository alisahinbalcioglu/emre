/**
 * K3 — ONAY SECENEGI ILAN EDILDIYSE OKUNMALI (olu parametre yasagi)
 *   npx vitest run ortak/hooks/onay-secenekleri.test.ts
 *
 * ── KUSUR (olculdu) ────────────────────────────────────────────────────────
 * `ortak/hooks/use-confirm.ts` `ConfirmOptions` icinde `tone?: 'danger' |
 * 'default'` ilan ediyor ve yorumu "danger → kirmizi onay butonu" diyor.
 * Dort cagri yeri bunu geciriyor (`admin/brands/page.tsx:213` ve `:254`,
 * `materials/[brandId]/page.tsx:241` ve `:270`). Ama TEK renderer olan
 * `ortak/ui/confirm-dialog.tsx` `opts.tone`'u HIC okumuyor — onay butonu her
 * kosulda mavi. Yani secenek VAAT ediyor, sistem TUTMUYOR.
 *
 * ★ KARAR — NEDEN TUKETMEK DEGIL KALDIRMAK:
 * Kirmizi buton bugune kadar hic cizilmedi; cizdirmek kullaniciya GORUNEN
 * yeni bir davranis eklemektir, yani yeni ozelliktir. Bu turun muhurlu kurali
 * "YENI OZELLIK EKLEME" oldugu icin secenek TUKETILMEZ, KALDIRILIR. Ileride
 * kirmizi buton istenirse ayri bir is olarak, o zaman yasayan tek gercek
 * (renderer) ile birlikte eklenir.
 *
 * KURAL GENEL YAZILDI: "ConfirmOptions'ta ilan edilen HER secenegi renderer
 * okumali". Boylece yalniz `tone` degil, gelecekte eklenip unutulan her olu
 * secenek de kirmizi yanar.
 *
 * BU TEST BUGUN KIRMIZI (`tone` icin) — fix sonrasi yesile doner.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const kancaKaynak = fs.readFileSync(
  path.resolve(__dirname, './use-confirm.ts'), 'utf-8',
);
const rendererKaynak = fs.readFileSync(
  path.resolve(__dirname, '../ui/confirm-dialog.tsx'), 'utf-8',
);

/**
 * `export interface ConfirmOptions { ... }` blogundaki alan adlari.
 * `matchAll` KULLANILMIYOR: tsconfig target'i eski, `--downlevelIteration`
 * olmadan iterator spread'i `tsc --noEmit` kapisini kirmiziya cevirir.
 */
function secenekAdlari(kaynak: string, arayuz = 'ConfirmOptions'): string[] {
  const blok = kaynak.match(new RegExp(`export interface ${arayuz}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!blok) return [];
  const adlar: string[] = [];
  const desen = /^\s*([A-Za-z][A-Za-z0-9]*)\??\s*:/gm;
  let eslesme: RegExpExecArray | null;
  while ((eslesme = desen.exec(blok[1])) !== null) adlar.push(eslesme[1]);
  return adlar;
}

const secenekler = secenekAdlari(kancaKaynak);

/**
 * S1 (06.08.2026) — KURAL IC ICE GECEN SECENEGE DE UYGULANIR.
 * `ConfirmOptions.input` alt alanlarini AYRI bir arayuze (`ConfirmInput`)
 * tasidi. Alt alanlar `ConfirmOptions` blogunun ICINE satir satir yazilsaydi
 * yukaridaki ayristirici onlari ust duzey secenek sanardi; ayri arayuze
 * tasinca da denetimsiz kalacaklardi — yani kural bir DELIK kazanacakti.
 * Bu blok o deligi kapatir: `ConfirmInput`ta ilan edilen her alan
 * renderer'da `input?.<ad>` ya da `input.<ad>` olarak okunmak zorunda.
 */
const girisAlanlari = secenekAdlari(kancaKaynak, 'ConfirmInput');

describe('★ BOS-KUME KAPISI — arayuz gercekten ayristirildi mi', () => {
  // Regex tutmasaydi `secenekler` bos kalir ve asagidaki dongu HIC assert
  // uretmeden "yesil" gorunurdu. Yalanci yesilin tam da bu turu.
  it('ConfirmOptions blogundan en az 4 secenek ayristirildi', () => {
    expect(secenekler.length).toBeGreaterThanOrEqual(4);
  });
  it('zorunlu alan `description` ayristirilanlar arasinda', () => {
    expect(secenekler).toContain('description');
  });
  it('renderer kaynagi bos degil', () => {
    expect(rendererKaynak.length).toBeGreaterThan(0);
  });
  it('ConfirmInput blogundan en az 1 alan ayristirildi', () => {
    expect(girisAlanlari.length).toBeGreaterThanOrEqual(1);
  });
});

describe('K3 — ilan edilen her onay secenegini renderer OKUYOR', () => {
  for (const ad of secenekler) {
    it(`\`${ad}\` renderer'da \`opts.${ad}\` olarak tuketiliyor`, () => {
      expect(rendererKaynak).toContain(`opts.${ad}`);
    });
  }
});

describe('K3/S1 — ilan edilen her GIRIS alanini da renderer OKUYOR', () => {
  for (const ad of girisAlanlari) {
    it(`\`${ad}\` renderer'da \`input.${ad}\` olarak tuketiliyor`, () => {
      expect(rendererKaynak).toMatch(new RegExp(`input\\??\\.${ad}\\b`));
    });
  }
});
