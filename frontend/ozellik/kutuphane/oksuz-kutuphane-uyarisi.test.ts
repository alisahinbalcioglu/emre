/**
 * K2 — OKSUZ KUTUPHANE SATIRI UYARISI EKRANA DUSMELI
 *   npx vitest run ozellik/kutuphane/oksuz-kutuphane-uyarisi.test.ts
 *
 * ── KUSUR (olculdu) ────────────────────────────────────────────────────────
 * Backend KALEM 59'da gorevini yapmis: `admin.service.ts:1023-1036` yeniden
 * yuklemenin OKSUZ birakacagi kutuphane satirlarini sayiyor, :1232'de
 * `oksuzKutuphaneSatiri` alaniyla donuyor ve yorumu acikca soyluyor:
 * "Cagiran uc bunu KULLANICIYA gostermeli — sessiz kalmasi tam olarak
 * kusurun kendisiydi." Ama frontend'de bu alani okuyan TEK BIR YER YOK
 * (`grep -rn "oksuzKutuphaneSatiri" frontend/` → 0). Uyari backend'de dogup
 * FE'de olüyordu.
 *
 * ★ HANGI EKRAN: alan yalniz `replaceExisting: true` yolunda dolar; bu yolu
 * uretimde SADECE `commitImportCore` (`admin.service.ts:872`) kullanir, onu da
 * `/admin/{brands|price-lists}/.../import-excel/commit` uclari cagirir. O
 * uclarin TEK istemcisi `app/admin/brands/page.tsx:328 commitImport()`. Yani
 * uyarinin anlamli oldugu ekran tektir ve olculdu — tahmin edilmedi.
 *
 * Sayilar CAYIROVA vakasindan: 116 satir oksuz kaldi, 59'unda kullanicinin
 * elle girdigi iskonto vardi.
 *
 * BU TEST KIRMIZI OLMAK ICIN YAZILDI (`ozellik/kutuphane/oksuz-kutuphane-uyarisi.ts` yok).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { oksuzKutuphaneUyarisi } from './oksuz-kutuphane-uyarisi';

/** CAYIROVA vakasi — hem satir hem iskonto var (en agir aile). */
const iskontolu = { satir: 116, iskontolu: 59 };
/** Satir oksuz kaliyor ama hicbirinde girilmis iskonto yok (ikinci aile). */
const iskontosuz = { satir: 7, iskontolu: 0 };

describe('★ BOS-KUME KAPISI — fixture gercekten DOLU mu', () => {
  it('agir fixture oksuz satir sayisi > 0', () => {
    expect(iskontolu.satir).toBe(116);
  });
  it('agir fixture ISKONTOLU satir sayisi > 0', () => {
    expect(iskontolu.iskontolu).toBe(59);
  });
  it('ikinci aile fixture\'inda satir VAR', () => {
    expect(iskontosuz.satir).toBeGreaterThan(0);
  });
  it('ikinci aile fixture\'inda iskonto YOK (aileyi ayiran tek fark)', () => {
    expect(iskontosuz.iskontolu).toBe(0);
  });
});

describe('K2-a — kayip YOKSA korku uretilmez', () => {
  // `lib/indeks-sagligi.ts` ile ayni kural: sifir sayidan rozet dogmaz.
  it('backend null dondugunde uyari yok', () => {
    expect(oksuzKutuphaneUyarisi(null)).toBeNull();
  });
  it('alan hic gelmediginde (eski surum backend) uyari yok', () => {
    expect(oksuzKutuphaneUyarisi(undefined)).toBeNull();
  });
  it('satir 0 iken uyari yok', () => {
    expect(oksuzKutuphaneUyarisi({ satir: 0, iskontolu: 0 })).toBeNull();
  });
  it('bicimsiz yanitta (satir sayi degil) uyari yok', () => {
    expect(oksuzKutuphaneUyarisi({ satir: 'cok' as any, iskontolu: 0 })).toBeNull();
  });
});

describe('K2-b — ISKONTOLU aile: kaybin buyuklugu ve geri donusu olmadigi yazilir', () => {
  const u = oksuzKutuphaneUyarisi(iskontolu)!;
  it('uyari uretildi', () => {
    expect(u).not.toBeNull();
  });
  it('basikta oksuz kalan satir sayisi gecer', () => {
    expect(u.baslik).toContain('116');
  });
  it('aciklamada ISKONTOLU satir sayisi gecer', () => {
    expect(u.aciklama).toContain('59');
  });
  it('aciklama otomatik onarim VAADI ETMEZ (backend bilerek baglamiyor)', () => {
    expect(u.aciklama).not.toContain('otomatik');
  });
  it('aciklama kullanicinin girdigi iskontodan acikca bahseder', () => {
    expect(u.aciklama.toLocaleLowerCase('tr')).toContain('iskonto');
  });
});

describe('K2-c — ISKONTOSUZ aile: ayni uyari, UYDURMA iskonto cumlesi yok', () => {
  const u = oksuzKutuphaneUyarisi(iskontosuz)!;
  it('uyari yine uretilir (satir kaybi tek basina bildirime deger)', () => {
    expect(u).not.toBeNull();
  });
  it('basikta satir sayisi gecer', () => {
    expect(u.baslik).toContain('7');
  });
  it('aciklamada iskonto kelimesi GECMEZ (olmayan kaybi anlatma yasagi)', () => {
    expect(u.aciklama.toLocaleLowerCase('tr')).not.toContain('iskonto');
  });
});

// ── KAYNAK-SEVIYESI KILIT ────────────────────────────────────────────────
// Saf fonksiyon dogru olsa da ekran onu cagirmazsa uyari yine FE'de olur —
// kusur tam olarak buydu. `lib/gs6b-golge-kurali.test.ts` deseni.

function govde(kaynak: string, imza: string): string {
  const bas = kaynak.indexOf(imza);
  if (bas < 0) return '';
  let derinlik = 0, i = kaynak.indexOf('{', bas);
  const basla = i;
  for (; i < kaynak.length; i++) {
    if (kaynak[i] === '{') derinlik++;
    else if (kaynak[i] === '}') { derinlik--; if (derinlik === 0) return kaynak.slice(basla, i + 1); }
  }
  return '';
}

describe('K2-d — import commit ekrani alani GERCEKTEN okuyor', () => {
  const kaynak = fs.readFileSync(
    path.resolve(__dirname, '../../app/admin/brands/page.tsx'), 'utf-8',
  );
  const commit = govde(kaynak, 'async function commitImport');

  it('commitImport govdesi bulunabildi (bos-kume kapisi)', () => {
    expect(commit.length).toBeGreaterThan(0);
  });
  it('govde import-excel/commit ucunu cagiriyor (dogru fonksiyonu yakaladik)', () => {
    expect(commit).toContain('import-excel/commit');
  });
  it('backend alani yanittan (`data.oksuzKutuphaneSatiri`) GERCEKTEN okunuyor', () => {
    // ⚠ Yalnizca 'oksuzKutuphaneSatiri' aramak YETMEZ: ayni ad govdedeki
    // aciklama yorumunda da geciyor ve testi yalanci-yesile dusuruyordu
    // (genellik olcumunde yakalandi). `data.` oneki yorumda YOK, cagrida VAR.
    expect(commit).toContain('data.oksuzKutuphaneSatiri');
  });
  it('karar ortak saf fonksiyondan geliyor (metin ikizlenmesin)', () => {
    expect(commit).toContain('oksuzKutuphaneUyarisi(');
  });
});
