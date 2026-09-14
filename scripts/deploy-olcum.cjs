#!/usr/bin/env node
/**
 * DEPLOY SONRASI "DOKUNULANI OLC" KAPISI (B2 · plan 1.12 · para dogrulugu turu 14.09.2026)
 *
 * NEDEN: gecmiste iki sessiz deploy hatasi, dogrulama YALNIZ surum numarasina
 * baktigi icin kacti (caddy adimi hic calismadi; frontend eski kaldi). Surum
 * numarasi "yeni kod sunucuda" der, "degistirdigim sey calisiyor" demez.
 *
 * NASIL: her tur kendi OLCUM DEFTERINI (JSON) yazar — o turda dokunulan ve
 * DISARIDAN gorulebilen her sey icin bir olcum. Bu betik defteri canli adrese
 * karsi kosar. Uc olcum tipi:
 *   json         GET yol → JSON → `alan` (nokta yolu) === `esit`
 *   baslik       GET yol → `var` basliklari birebir, `yok` basliklari hic yok
 *   paket-metni  GET yol (HTML) → sayfanin yukledigi /_next/static/*.js parcalari
 *                → her `icerir` metni en az bir parcada. Kucultucu Latin-1 harfleri
 *                `\xNN` kacisina cevirir ("örn" → "\xf6rn"): kacislar COZULEREK aranir,
 *                yoksa olcum yanlis-negatif verir (canli pakette olculdu, 14.09).
 * `"$SHA"` degeri `--sha` argumaniyla degistirilir.
 *
 * `olculemeyenler` bolumu BASARI SAYILMAZ ve gizlenmez: ayri baslikla basilir.
 *
 * deploy.sh'ye BAGLANMADI: o dosya Faz 0 turunun (dosya sahipligi). Bugun elle:
 *   node scripts/deploy-olcum.cjs scripts/deploy-olcum/<tur>.json --sha <12 hane>
 *
 * CIKIS: 0 = defterdeki her olcum gecti · 1 = en az biri kaldi · 3 = defter/arguman hatasi
 * (2 KULLANILMAZ — bu depoda 2 "on kosul yok, atla" demek; deploy olcumu atlanmaz.)
 */
'use strict';
const fs = require('fs');

const ZAMAN_ASIMI_MS = 20000;
const EN_FAZLA_PARCA = 80;

function argumanlariOku(argv) {
  const sonuc = { defter: null, sha: null, taban: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sha') sonuc.sha = argv[++i] ?? null;
    else if (argv[i] === '--taban') sonuc.taban = argv[++i] ?? null;
    else if (!sonuc.defter) sonuc.defter = argv[i];
  }
  return sonuc;
}

/** Kucultulmus JS'teki \xNN ve \uNNNN kacislarini cozer (aranan metin kaynakta yazildigi gibi bulunsun). */
function kacislariCoz(metin) {
  return metin
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function alanOku(nesne, yol) {
  return String(yol).split('.').reduce((o, k) => (o == null ? undefined : o[k]), nesne);
}

function degistir(deger, sha) {
  if (deger === '$SHA') {
    if (!sha) throw new Error('defter "$SHA" kullaniyor ama --sha verilmedi');
    return sha;
  }
  return deger;
}

async function getir(url) {
  const r = await fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': 'metaprice-deploy-olcum' },
    signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
  });
  return { durum: r.status, basliklar: r.headers, govde: await r.text() };
}

/** Tek olcumu kosar → { gecti, gozlem }. Ag hatasi olcumu KALDIRIR (yutulmaz). */
async function olcumKos(olcum, taban, sha) {
  const url = new URL(olcum.yol, taban).toString();
  try {
    if (olcum.tip === 'json') {
      const r = await getir(url);
      let veri;
      try { veri = JSON.parse(r.govde); } catch { return { gecti: false, gozlem: `durum=${r.durum} JSON degil` }; }
      const beklenen = degistir(olcum.esit, sha);
      const okunan = alanOku(veri, olcum.alan);
      return { gecti: okunan === beklenen, gozlem: `${olcum.alan}=${JSON.stringify(okunan)} beklenen=${JSON.stringify(beklenen)}` };
    }
    if (olcum.tip === 'baslik') {
      const r = await getir(url);
      const yanlis = Object.entries(olcum.var ?? {})
        .filter(([ad, deger]) => r.basliklar.get(ad) !== degistir(deger, sha))
        .map(([ad]) => `${ad}=${JSON.stringify(r.basliklar.get(ad))}`);
      const fazla = (olcum.yok ?? []).filter((ad) => r.basliklar.get(ad) !== null).map((ad) => `${ad}=${JSON.stringify(r.basliklar.get(ad))}`);
      return {
        gecti: yanlis.length === 0 && fazla.length === 0,
        gozlem: `durum=${r.durum}${yanlis.length ? ` · eksik/yanlis: ${yanlis.join(', ')}` : ''}${fazla.length ? ` · olmamali: ${fazla.join(', ')}` : ''}`,
      };
    }
    if (olcum.tip === 'paket-metni') {
      const sayfa = await getir(url);
      const parcalar = [...new Set(sayfa.govde.match(/\/_next\/static\/[^"'\s>]+\.js/g) ?? [])].slice(0, EN_FAZLA_PARCA);
      if (parcalar.length === 0) return { gecti: false, gozlem: `durum=${sayfa.durum} sayfada JS parcasi bulunamadi` };
      const metinler = await Promise.all(parcalar.map(async (p) => ({ p, metin: kacislariCoz((await getir(new URL(p, taban).toString())).govde) })));
      const bulgular = (olcum.icerir ?? []).map((aranan) => {
        const yer = metinler.find((m) => m.metin.includes(aranan));
        return { aranan, yer: yer ? yer.p.split('/').pop() : null };
      });
      const bulunmayan = bulgular.filter((b) => !b.yer);
      return {
        gecti: bulunmayan.length === 0,
        gozlem: `${parcalar.length} parca · ${bulgular.map((b) => `"${b.aranan}"→${b.yer ?? 'YOK'}`).join(' · ')}`,
      };
    }
    return { gecti: false, gozlem: `bilinmeyen olcum tipi "${olcum.tip}"` };
  } catch (e) {
    return { gecti: false, gozlem: `olcum hatasi: ${e && e.message ? e.message : e}` };
  }
}

async function defterKos(defter, { taban, sha, yaz = console.log } = {}) {
  const hedef = taban || defter.taban;
  if (!hedef) throw new Error('taban adres yok (defter.taban ya da --taban)');
  if (!Array.isArray(defter.olcumler) || defter.olcumler.length === 0) throw new Error('defterde olcum yok');
  // Kuralin kendisi: yalniz surum numarasi olcen defter REDDEDILIR (plan 1.12).
  if (defter.olcumler.every((o) => o.tip === 'json' && o.alan === 'build_sha')) {
    throw new Error('defter yalniz surum numarasi olcuyor — o turda DOKUNULANI olcen en az bir olcum sart (plan 1.12)');
  }
  yaz(`DEPLOY OLCUMU — ${defter.tur ?? '(adsiz tur)'} · ${hedef}${sha ? ` · beklenen sha ${sha}` : ''}`);
  const sonuclar = [];
  for (const o of defter.olcumler) {
    const s = await olcumKos(o, hedef, sha);
    sonuclar.push({ ad: o.ad, ...s });
    yaz(`  ${s.gecti ? 'GECTI' : 'KALDI'}  ${o.ad} — ${s.gozlem}${o.neden ? `\n         neden: ${o.neden}` : ''}`);
  }
  const olculemeyen = defter.olculemeyenler ?? [];
  if (olculemeyen.length) {
    yaz('\nÖLÇÜLEMEDİ (veri yok — basari SAYILMAZ):');
    for (const o of olculemeyen) yaz(`  ·  ${o.ad} — ${o.neden}`);
  }
  const kalan = sonuclar.filter((s) => !s.gecti).length;
  yaz(`\nSONUC: ${sonuclar.length - kalan}/${sonuclar.length} olcum gecti · ${olculemeyen.length} olculemedi`);
  return { sonuclar, kalan };
}

module.exports = { argumanlariOku, kacislariCoz, alanOku, olcumKos, defterKos };

if (require.main === module) {
  (async () => {
    const arg = argumanlariOku(process.argv.slice(2));
    if (!arg.defter) {
      console.error('kullanim: node scripts/deploy-olcum.cjs <defter.json> --sha <12 hane> [--taban https://...]');
      process.exit(3);
    }
    let defter;
    try { defter = JSON.parse(fs.readFileSync(arg.defter, 'utf-8')); }
    catch (e) { console.error(`defter okunamadi: ${e.message}`); process.exit(3); }
    try {
      const { kalan } = await defterKos(defter, { taban: arg.taban, sha: arg.sha });
      process.exit(kalan > 0 ? 1 : 0);
    } catch (e) {
      console.error(`defter hatasi: ${e.message}`);
      process.exit(3);
    }
  })();
}
