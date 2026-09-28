/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  iyzico SANDBOX → CANLI ANAHTAR GEÇİŞİ — veri temizliği  (28.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU BETİK HENÜZ KOŞULMADI. Varsayılan kip PROVA'dır: yalnız okur ve ne
 *  olacağını yazar. `--uygula` yazar; yalnız iyzico adresi CANLIYKEN ve
 *  `--beklenen=<n>` PROVA'daki kodlu abonelik sayısına eşitken çalışır.
 *  Sıra ve ön koşullar: docs/RUNBOOK_iyzico_canli_gecis.md.
 *
 *  Ne yaptığı ve neden: `src/ozellik/odeme/abonelik/canli-gecis.ts` (kural
 *  orada). Akış (`calistir`) ve kural aynı kapıda: `test:iyzico-canli-gecis`.
 *  iyzico'ya GİTMEZ.
 *
 *  ── KULLANIM (sunucuda, /opt/metaprice içinden) ─────────────────────────
 *    docker compose exec -T backend npm run iyzicocanligecis
 *    docker compose exec -T backend npm run iyzicocanligecis -- --uygula --beklenen=1
 *  (İki nokta YOK: Hetzner konsolu TR klavyede `:` yerine `;` yazar.)
 */
import { PrismaClient } from '@prisma/client';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import {
  gecisiUygula,
  gecisPlaniCikar,
  planYaz,
  uygulamaEngeli,
} from '../src/ozellik/odeme/abonelik/canli-gecis';

/** `--beklenen=<n>` → sayı; yoksa ya da sayı değilse null. SAF. */
export function beklenenOku(argv: readonly string[]): number | null {
  const arg = argv.find((a) => a.startsWith('--beklenen='));
  if (!arg) return null;
  const metin = arg.slice('--beklenen='.length);
  if (!/^\d+$/.test(metin)) return null;
  return Number(metin);
}

/** Betik iyzico'ya GİTMEZ: çağrılırsa gürültüyle patlar. */
export const iyzicoYok = new Proxy(
  {},
  {
    get: (_h, ad) => () => {
      throw new Error(`iyzico-canli-gecis iyzico'ya gitmez (çağrılan: ${String(ad)})`);
    },
  },
);

/**
 * Betiğin TÜM akışı: PROVA → (`--uygula` ise) kapı → uygula. Çıkış kodu döner
 * (0 = tamam). Veritabanı ve çıktı dışarıdan verilir — kapı aynı akışı koşar.
 */
export async function calistir(p: {
  argv: readonly string[];
  prisma: unknown;
  taban: string;
  yaz: (s: string) => void;
  hata: (s: string) => void;
}): Promise<number> {
  const uygula = p.argv.includes('--uygula');
  const plan = await gecisPlaniCikar(p.prisma as never, p.taban);
  p.yaz(`${uygula ? 'iyzico ANAHTAR GEÇİŞİ — UYGULA' : 'iyzico ANAHTAR GEÇİŞİ — PROVA (hiçbir şey yazılmaz)'}\n`);
  p.yaz(planYaz(plan));
  if (!uygula) {
    p.yaz(
      '\nBu bir PROVAYDI. Uygulamak için (sayı yukarıdaki "kodlu abonelik"):\n' +
        `  npm run iyzicocanligecis -- --uygula --beklenen=${plan.abonelikler.length}\n`,
    );
    return 0;
  }
  const engel = uygulamaEngeli(plan, beklenenOku(p.argv));
  if (engel) {
    p.hata(`✗ UYGULANMADI: ${engel}`);
    return 1;
  }
  const abonelik = new AbonelikServisi(p.prisma as never, iyzicoYok as never);
  const sonuc = await gecisiUygula(p.prisma as never, abonelik, plan);
  p.yaz(
    `\nuygulanan abonelik : ${sonuc.uygulanan.length}\n` +
      `atlanan abonelik   : ${sonuc.atlanan.length}` +
      sonuc.atlanan.map((a) => `\n  · ${a.id}: ${a.neden}`).join('') +
      `\nvazgeçilen niyet   : ${sonuc.vazgecilenNiyet}\n` +
      `kapatılan olay     : ${sonuc.kapatilanOlay}\n` +
      `iptal edilen fatura: ${sonuc.iptalEdilenFatura}\n`,
  );
  if (sonuc.atlanan.length > 0) {
    p.hata("⚠ Atlanan satır var: PROVA'yı yeniden koşup tekrar uygulayın (idempotent).");
    return 1;
  }
  return 0;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    process.exitCode = await calistir({
      argv: process.argv,
      prisma,
      taban: process.env.IYZICO_TABAN_URL || 'https://sandbox-api.iyzipay.com',
      yaz: (s) => console.log(s),
      hata: (s) => console.error(s),
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
