/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CANLI PAKET KULLANICI HAKKI GUNCELLEME  (Faz 7 F1b · Emre karari E-2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU BETIK F1b TURUNDA KOSULMADI. Varsayilan mod PROVA'dir: hicbir sey
 *  yazmaz, yalniz "ne olacak" listesini basar. `--uygula` Emre onayindan
 *  SONRA, canli veriye bakilarak kosulur.
 *
 *  ── NEDEN AYRI BIR BETIK (paketleri-kur.ts YETMEZ) ───────────────────────
 *  `paketleri-kur.ts` surumu OLAN paketi ATLAR (iyzico plani baglidir);
 *  yani oradaki 1/2/3 degerleri yalniz YENI kurulumlara uygular, canli
 *  `Paket` satirlarina DOKUNMAZ. Bu olculdu (curutucu O7).
 *
 *  ── GERIYE DONUK ETKI (AVUKAT NOTU) ──────────────────────────────────────
 *  Basic paketin hakki bugun 2, yeni deger 1. Halen odeyen bir Basic
 *  abonesine "2 kullanici" satildiysa, hakki tek tarafli dusurmek sozlesme
 *  degisikligi sayilabilir. PROVA listesi ETKILENEN firmalari gosterir;
 *  karar Emre + avukatta.
 *
 *  ── KULLANIM ────────────────────────────────────────────────────────────
 *    npx ts-node scripts/kullanici-hakki-guncelle.ts            # PROVA
 *    npx ts-node scripts/kullanici-hakki-guncelle.ts --uygula   # YAZAR
 */
import { PrismaClient } from '@prisma/client';

/** Emre karari E-2 — satistaki bes paketin YENI kullanici hakki. */
export const YENI_HAKLAR: Record<string, number> = {
  'basic-mek': 1,
  'basic-elk': 1,
  'pro-mek': 2,
  'pro-elk': 2,
  'pro-mep': 3,
};

export type PaketSatiri = {
  id: string;
  kod: string;
  aktif: boolean;
  kullaniciHakki: number;
};

export type HakPlani = {
  degisecekler: { id: string; kod: string; eski: number; yeni: number }[];
  dokunulmayanlar: { kod: string; hak: number; neden: string }[];
};

/**
 * SAF — hangi paket satiri degisecek?
 *
 * ⚠ BILINMEYEN **AKTIF** KODDA FIRLATIR. Sessizce atlamak, ilerde eklenen
 * bir paketin hakkinin eski degerde kalmasina ve kimsenin fark etmemesine
 * yol acardi (bu depoda "sessiz atlama" olculmus bir hata sinifidir).
 * Pasif (miras) paketler DOKUNULMAZ ve sessizce atlanir — onlar bilerek
 * eski haklariyla birakiliyor.
 */
export function hakPlaniUret(paketler: PaketSatiri[]): HakPlani {
  const degisecekler: HakPlani['degisecekler'] = [];
  const dokunulmayanlar: HakPlani['dokunulmayanlar'] = [];
  const bilinmeyenAktif: string[] = [];

  for (const p of paketler) {
    const yeni = YENI_HAKLAR[p.kod];
    if (yeni === undefined) {
      if (p.aktif) bilinmeyenAktif.push(p.kod);
      else dokunulmayanlar.push({ kod: p.kod, hak: p.kullaniciHakki, neden: 'miras (pasif) paket' });
      continue;
    }
    if (p.kullaniciHakki === yeni) {
      dokunulmayanlar.push({ kod: p.kod, hak: yeni, neden: 'zaten dogru deger' });
      continue;
    }
    degisecekler.push({ id: p.id, kod: p.kod, eski: p.kullaniciHakki, yeni });
  }

  if (bilinmeyenAktif.length > 0) {
    throw new Error(
      `BILINMEYEN AKTIF PAKET KODU: ${bilinmeyenAktif.join(', ')}. ` +
        'YENI_HAKLAR listesine ekleyin ya da paketi pasiflestirin — sessizce atlanmaz.',
    );
  }
  return { degisecekler, dokunulmayanlar };
}

export type FirmaSatiri = {
  firmaId: string;
  firmaAd: string;
  paketKodu: string;
  etkinHesap: number;
};

/**
 * SAF — yeni haklarla KAC HESAP DURDURULACAK (§10.3 SQL 4 ile ayni mantik).
 * `GREATEST(hak, 1)`: en eski sahip her zaman calisir (`koltukSirasiKarari`).
 */
export function durdurulacaklar(
  firmalar: FirmaSatiri[],
): { firmaId: string; firmaAd: string; paketKodu: string; etkinHesap: number; yeniHak: number; durdurulacak: number }[] {
  const sonuc = [];
  for (const f of firmalar) {
    const yeniHak = YENI_HAKLAR[f.paketKodu];
    if (yeniHak === undefined) continue; // miras paket — hak degismiyor
    const tavan = Math.max(yeniHak, 1);
    if (f.etkinHesap > tavan) {
      sonuc.push({ ...f, yeniHak, durdurulacak: f.etkinHesap - tavan });
    }
  }
  return sonuc.sort((a, b) => b.durdurulacak - a.durdurulacak || a.firmaAd.localeCompare(b.firmaAd));
}

async function main() {
  const uygula = process.argv.includes('--uygula');
  const prisma = new PrismaClient();
  try {
    const paketler = await prisma.paket.findMany({
      select: { id: true, kod: true, aktif: true, kullaniciHakki: true },
      orderBy: { sira: 'asc' },
    });
    const plan = hakPlaniUret(paketler);

    console.log('\n═══ PAKET HAK PLANI ═══');
    for (const d of plan.degisecekler) {
      console.log(`  ${d.kod}: ${d.eski} → ${d.yeni}`);
    }
    for (const d of plan.dokunulmayanlar) {
      console.log(`  (dokunulmaz) ${d.kod}: ${d.hak} — ${d.neden}`);
    }

    // Etkilenen firmalar (SQL 4 karsiligi).
    const abonelikler = await prisma.abonelik.findMany({
      select: {
        firmaId: true,
        firma: { select: { ad: true } },
        paketSurumu: { select: { paket: { select: { kod: true } } } },
      },
    });
    const sayimlar = await prisma.user.groupBy({
      by: ['firmaId'],
      where: { deletedAt: null, status: 'active', firmaId: { not: null } },
      _count: { _all: true },
    });
    const sayim = new Map(sayimlar.map((s) => [s.firmaId as string, s._count._all]));
    const etkilenen = durdurulacaklar(
      abonelikler.map((a) => ({
        firmaId: a.firmaId,
        firmaAd: a.firma?.ad ?? '',
        paketKodu: a.paketSurumu?.paket?.kod ?? '',
        etkinHesap: sayim.get(a.firmaId) ?? 0,
      })),
    );

    console.log('\n═══ DURDURULACAK HESAPLAR (PROVA) ═══');
    if (etkilenen.length === 0) console.log('  (yok)');
    for (const e of etkilenen) {
      console.log(
        `  ${e.firmaAd} [${e.paketKodu}]: ${e.etkinHesap} etkin hesap, yeni hak ${e.yeniHak} → ${e.durdurulacak} kisi durdurulacak`,
      );
    }

    if (!uygula) {
      console.log('\nPROVA MODU — hicbir sey yazilmadi. Uygulamak icin: --uygula\n');
      return;
    }

    // ⚠ TEK TRANSACTION: yarim guncelleme, paketler arasi tutarsiz hak birakir.
    await prisma.$transaction(async (tx) => {
      for (const d of plan.degisecekler) {
        await tx.paket.update({ where: { id: d.id }, data: { kullaniciHakki: d.yeni } });
        await tx.yoneticiOlayi.create({
          data: {
            yoneticiId: 'sunucu-betigi',
            yoneticiEpsta: 'sunucu-betigi',
            tip: 'paket.kullanici-hakki',
            oncekiDeger: String(d.eski),
            yeniDeger: String(d.yeni),
            veri: { kod: d.kod } as never,
          },
        });
      }
    });
    console.log(`\nUYGULANDI: ${plan.degisecekler.length} paket guncellendi.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

// ⚠ Testler bu dosyayi SAF fonksiyonlar icin import eder; `main` yalniz
// dogrudan calistirildiginda kosar.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
