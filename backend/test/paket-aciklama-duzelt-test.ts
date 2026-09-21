/**
 * PAKET ACIKLAMASI DUZELTME KAPISI — `npm run test:paket-aciklama`
 * (Kurumsal sayfalar turu, t.21, 21.09.2026)
 *
 * DB GEREKTIRMEZ · AG GEREKTIRMEZ. Betigin SAF parcalarini (`ACIKLAMA_DUZELTMELERI`,
 * `planUret`) ve tohum dosyasini (`scripts/paketleri-kur.ts`) kaynaktan olcer.
 *
 * ── BU DOSYA NEDEN VAR ───────────────────────────────────────────────────
 * `paket-aciklama-duzelt.ts` icindeki yorum aylardir "test/paket-aciklama-
 * duzelt-test.ts DI blogu olcer" diyordu; O DOSYA HIC YAZILMAMISTI. Yani
 * musteriye `/abonelik` sayfasinda gosterilen bes paket aciklamasini canli
 * veritabaninda DEGISTIREN bir betik, hicbir kapiyla korunmuyordu. Yorumun
 * kendisi kanit degildir — bu dosya o cumleyi DOGRU yapar.
 *
 * ── UC BLOK, UC AYRI IDDIA ───────────────────────────────────────────────
 *   P · Liste BES paketi kapsiyor (elektrik dahil — 6f2cd1f, 21.09) ve her
 *       `yeni` metin gercekten duzgun Turkce, `eski` metin gercekten ASCII'ye
 *       dusmus hali
 *   T · IKIZ: betigin yazacagi `yeni`, TOHUM dosyasindaki `aciklama` ile
 *       BIREBIR ayni. Ayrismalari, taze kurulumla canli satirin farkli metin
 *       tasimasi demektir — bu deponun tekrarlayan ikiz hatasi
 *   D · `planUret` TAM ESLESME ister: elle degistirilmis satira DOKUNMAZ,
 *       zaten dogru olani tekrar yazmaz, olmayan kodu uydurmaz
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ACIKLAMA_DUZELTMELERI,
  planUret,
  type PaketSatiri,
} from '../scripts/paket-aciklama-duzelt';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

/** Turkce'ye ozgu harfler. `eski` metinde HIC olmamali, `yeni`de olmali. */
const TURKCE_HARF = /[çğıöşüÇĞİÖŞÜâ]/;

function main(): void {
  // ── P · LISTE BES PAKETI KAPSIYOR, METINLER DOGRU YONDE ────────────────
  console.log('\n── P · duzeltme listesi ──');

  const kodlar = ACIKLAMA_DUZELTMELERI.map((d) => d.kod).sort();
  // Bos liste her `every()` assert'ini tesadufen yesil yapardi.
  check(
    'P0-OLCUT liste bos degil ve bes paketi tasiyor',
    ACIKLAMA_DUZELTMELERI.length === 5,
    `uzunluk=${ACIKLAMA_DUZELTMELERI.length}`,
  );
  check(
    'P1 ⭐ ELEKTRIK paketleri listede (6f2cd1f, 21.09 — "kapsam disi" notu dustu)',
    kodlar.includes('basic-elk') && kodlar.includes('pro-elk'),
    JSON.stringify(kodlar),
  );
  check(
    'P2 mekanik ve MEP paketleri de listede',
    ['basic-mek', 'pro-mek', 'pro-mep'].every((k) => kodlar.includes(k)),
    JSON.stringify(kodlar),
  );
  check(
    'P3 hicbir kod iki kez yazilmamis',
    new Set(kodlar).size === kodlar.length,
    JSON.stringify(kodlar),
  );
  check(
    'P4 her `yeni` metin Turkce harf TASIYOR (duzeltme gercekten duzeltiyor)',
    ACIKLAMA_DUZELTMELERI.every((d) => TURKCE_HARF.test(d.yeni)),
    JSON.stringify(ACIKLAMA_DUZELTMELERI.filter((d) => !TURKCE_HARF.test(d.yeni)).map((d) => d.kod)),
  );
  check(
    'P5 her `eski` metin Turkce harf TASIMIYOR (ASCIYE dusmus hali)',
    ACIKLAMA_DUZELTMELERI.every((d) => !TURKCE_HARF.test(d.eski)),
    JSON.stringify(ACIKLAMA_DUZELTMELERI.filter((d) => TURKCE_HARF.test(d.eski)).map((d) => d.kod)),
  );
  check(
    'P6 eski ile yeni AYNI DEGIL (anlamsiz guncelleme yok)',
    ACIKLAMA_DUZELTMELERI.every((d) => d.eski !== d.yeni),
  );

  // ── T · IKIZ: betigin yazacagi metin = tohum dosyasindaki metin ─────────
  //
  // ⚠ NEDEN KAYNAKTAN OKUNUYOR: `paketleri-kur.ts` ice aktarilinca PAKETLER
  // dizisi disa acilmiyor (betik ic sabit). Kaynak metninden okumak, tohumun
  // GERCEKTEN tasidigi dizgeyi olcer — proxy degil.
  console.log('\n── T · tohum ikizi (paketleri-kur.ts) ──');
  const tohum = readFileSync(join(__dirname, '..', 'scripts', 'paketleri-kur.ts'), 'utf8');

  /** `kod: 'x',` bloğunun icindeki `aciklama: '…'` degeri. */
  function tohumAciklamasi(kod: string): string | null {
    const i = tohum.indexOf(`kod: '${kod}',`);
    if (i < 0) return null;
    const m = /aciklama:\s*'((?:[^'\\]|\\.)*)'/.exec(tohum.slice(i, i + 900));
    return m ? m[1] : null;
  }

  check(
    'T0-OLCUT bes kodun besi de tohum dosyasinda bulundu',
    ACIKLAMA_DUZELTMELERI.every((d) => tohumAciklamasi(d.kod) !== null),
    JSON.stringify(ACIKLAMA_DUZELTMELERI.map((d) => `${d.kod}=${tohumAciklamasi(d.kod)}`)),
  );

  const ayrisanlar = ACIKLAMA_DUZELTMELERI.filter((d) => tohumAciklamasi(d.kod) !== d.yeni);
  check(
    'T1 ⭐ betigin yazacagi `yeni` = tohumdaki `aciklama` (IKIZ AYRISMADI)',
    ayrisanlar.length === 0,
    JSON.stringify(ayrisanlar.map((d) => ({ kod: d.kod, tohum: tohumAciklamasi(d.kod), betik: d.yeni }))),
  );

  check(
    'T2 tohumda ASCIYE dusmus eski metin KALMADI',
    ACIKLAMA_DUZELTMELERI.every((d) => !tohum.includes(d.eski)),
    JSON.stringify(ACIKLAMA_DUZELTMELERI.filter((d) => tohum.includes(d.eski)).map((d) => d.kod)),
  );

  // ── D · planUret: TAM ESLESME, KOR USTUNE YAZMA YOK ────────────────────
  console.log('\n── D · plan uretimi (tam eslesme sarti) ──');
  const ornek = ACIKLAMA_DUZELTMELERI[0];

  const bozuk: PaketSatiri[] = [{ id: 'id1', kod: ornek.kod, aciklama: ornek.eski }];
  check(
    'D1 eski metni TASIYAN satir degisecekler listesine girer',
    planUret(bozuk).degisecekler.length === 1 &&
      planUret(bozuk).degisecekler[0].yeni === ornek.yeni,
  );

  const dogru: PaketSatiri[] = [{ id: 'id1', kod: ornek.kod, aciklama: ornek.yeni }];
  check(
    'D2 ZATEN dogru satir tekrar yazilmaz',
    planUret(dogru).degisecekler.length === 0 &&
      planUret(dogru).zatenDuzeltilmis.includes(ornek.kod),
  );

  const elle: PaketSatiri[] = [{ id: 'id1', kod: ornek.kod, aciklama: 'Elle yazilmis bambaska metin' }];
  const ellePlan = planUret(elle);
  check(
    'D3 ⭐ ELLE DEGISTIRILMIS satira DOKUNULMAZ (kor ustune yazma yok)',
    ellePlan.degisecekler.length === 0 && ellePlan.beklenmeyenIcerik.length === 1,
    JSON.stringify(ellePlan),
  );

  check(
    'D4 veritabaninda olmayan kod "bulunamayan" olur, uydurulmaz',
    planUret([]).bulunamayan.length === ACIKLAMA_DUZELTMELERI.length &&
      planUret([]).degisecekler.length === 0,
  );

  const bosAciklama: PaketSatiri[] = [{ id: 'id1', kod: ornek.kod, aciklama: null }];
  check(
    'D5 `aciklama` NULL ise de yazilmaz (beklenmeyen icerik sayilir)',
    planUret(bosAciklama).degisecekler.length === 0 &&
      planUret(bosAciklama).beklenmeyenIcerik.length === 1,
  );

  son();
}

function son(): void {
  console.log(
    `\n${'='.repeat(64)}\nPAKET ACIKLAMASI DUZELTME: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
  );
  if (failed) {
    for (const f of failures) console.log(`  · ${f}`);
    process.exit(1);
  }
}

main();
