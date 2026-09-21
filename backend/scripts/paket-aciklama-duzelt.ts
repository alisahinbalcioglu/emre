/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CANLI PAKET ACIKLAMASI — DUSMUS TURKCE DUZELTME  (Gorunur kusurlar turu, G3, 21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU BETIK KOSULMADI. Varsayilan mod PROVA'dir: hicbir sey yazmaz, yalniz
 *  "ne olacak" listesini basar. `--uygula` Emre onayindan SONRA kosulur.
 *
 *  ── NEDEN AYRI BIR BETIK (paketleri-kur.ts YETMEZ) ───────────────────────
 *  `paketleri-kur.ts` surumu OLAN `kod`u ATLAR (bkz. o dosyadaki
 *  `mevcutPaket && mevcutPaket.surumler.length > 0` kontrolu) — yani PAKETLER
 *  dizisindeki duzeltme yalniz YENI kurulumlara uygulanir, canli `Paket`
 *  satirinin `aciklama` alanina DOKUNMAZ (ayni desen: `kullanici-hakki-guncelle.ts`).
 *  Bu ekran metni degil, VERITABANI satiridir — musteriye `/abonelik` ve
 *  `/fiyatlar` sayfalarinda gosterilir (`abonelik.servisi.ts` → `p.aciklama`).
 *
 *  ── KAPSAM ────────────────────────────────────────────────────────────
 *  BES paket aciklamasi: mekanik (`basic-mek`, `pro-mek`), MEP (`pro-mep`) ve
 *  21.09 eki olarak ELEKTRIK (`basic-elk`, `pro-elk`).
 *  ⚠ Elektrik baslangicta KAPSAM DISIYDI (turun KURALLAR.md'si elektrige
 *  dokunmayi yasakliyordu). Karar deploy sonrasi OLCUMLE degisti: elektrik
 *  paketleri 17.09 karariyla SATISTA ve `aciklama` alanini basan tek yer
 *  girisli `/abonelik` sayfasi — yani elektrik paketi secmeye giden musteri
 *  bozuk Turkce goruyordu. Kapsam disi olan ELEKTRIK VERISI ve ekranlaridir,
 *  satistaki bir paketin musteriye gorunen metni degil.
 *  ⚠ `/fiyatlar` sayfasi bu alani BASMAZ (olculdu): oradaki "Basic — malzeme"
 *  satirlari on yuzun kendi SEVIYE_ETIKET/KAPSAM_ETIKET eslemelerinden gelir.
 *  Tek tuketici: `frontend/app/(protected)/abonelik/page.tsx`.
 *
 *  ── GUVENLIK: TAM ESLESME SART, KOR USTUNE YAZMA YOK ─────────────────────
 *  Bir kod yalniz mevcut `aciklama` BUGUNKU (ASCII) metinle BIREBIR
 *  eslesirse guncellenir. Biri elle degistirmisse (ne eski ne yeni metin)
 *  DOKUNULMAZ ve "beklenmeyen icerik" olarak raporlanir.
 *
 *  ── KULLANIM ────────────────────────────────────────────────────────────
 *    npm run duzelt:paket-aciklama            # PROVA (varsayilan)
 *    npm run duzelt:paket-aciklama -- --uygula
 */
import { PrismaClient } from '@prisma/client';

export type Duzeltme = { kod: string; eski: string; yeni: string };

/** SAF — yalniz mekanik + MEP; elektrik paketleri KAPSAM DISI (bkz. dosya basi). */
export const ACIKLAMA_DUZELTMELERI: Duzeltme[] = [
  {
    kod: 'basic-mek',
    eski: 'Mekanik disiplinde malzeme kutuphanesi ve teklif hazirlama.',
    yeni: 'Mekanik disiplinde malzeme kütüphanesi ve teklif hazırlama.',
  },
  {
    kod: 'pro-mek',
    eski: 'Mekanik: malzeme + iscilik + DWG metraj.',
    yeni: 'Mekanik: malzeme + işçilik + DWG metraj.',
  },
  // 21.09 EK (Emre karari, deploy sonrasi olcum): elektrik paketleri SATISTA
  // (17.09 karari) ve `aciklama` alanini basan TEK yer girisli `/abonelik`
  // sayfasi. Yani elektrik paketi secmeye giden musteri bozuk Turkce goruyordu.
  // Turun ilk kapsami elektrigi disarida birakmisti; karar bu iki satiri ekledi.
  {
    kod: 'basic-elk',
    eski: 'Elektrik disiplininde malzeme kutuphanesi ve teklif hazirlama.',
    yeni: 'Elektrik disiplininde malzeme kütüphanesi ve teklif hazırlama.',
  },
  {
    kod: 'pro-elk',
    eski: 'Elektrik: malzeme + iscilik + DWG metraj.',
    yeni: 'Elektrik: malzeme + işçilik + DWG metraj.',
  },
  {
    kod: 'pro-mep',
    eski: 'Iki disiplin: malzeme + iscilik + DWG metraj. Ayri ayri almaya gore %25 avantajli.',
    yeni: 'İki disiplin: malzeme + işçilik + DWG metraj. Ayrı ayrı almaya göre %25 avantajlı.',
  },
];

export type PaketSatiri = { id: string; kod: string; aciklama: string | null };
export type Plan = {
  degisecekler: { id: string; kod: string; eski: string; yeni: string }[];
  bulunamayan: string[];
  zatenDuzeltilmis: string[];
  beklenmeyenIcerik: { kod: string; mevcut: string }[];
};

/**
 * SAF — hangi satir degisecek? Tam string eslesmesi yoksa DOKUNULMAZ.
 * test/paket-aciklama-duzelt-test.ts DI blogu olcer.
 */
export function planUret(paketler: PaketSatiri[]): Plan {
  const paketMap = new Map(paketler.map((p) => [p.kod, p]));
  const plan: Plan = { degisecekler: [], bulunamayan: [], zatenDuzeltilmis: [], beklenmeyenIcerik: [] };

  for (const d of ACIKLAMA_DUZELTMELERI) {
    const p = paketMap.get(d.kod);
    if (!p) {
      plan.bulunamayan.push(d.kod);
      continue;
    }
    if (p.aciklama === d.yeni) {
      plan.zatenDuzeltilmis.push(d.kod);
      continue;
    }
    if (p.aciklama === d.eski) {
      plan.degisecekler.push({ id: p.id, kod: d.kod, eski: d.eski, yeni: d.yeni });
      continue;
    }
    plan.beklenmeyenIcerik.push({ kod: d.kod, mevcut: p.aciklama ?? '(bos)' });
  }
  return plan;
}

async function main() {
  const uygula = process.argv.includes('--uygula');
  const prisma = new PrismaClient();
  try {
    const paketler = await prisma.paket.findMany({
      where: { kod: { in: ACIKLAMA_DUZELTMELERI.map((d) => d.kod) } },
      select: { id: true, kod: true, aciklama: true },
    });
    const plan = planUret(paketler);

    console.log(`\n${'─'.repeat(66)}\nPAKET ACIKLAMASI DUZELTME PLANI ${uygula ? '(UYGULAMA)' : '(PROVA)'}\n${'─'.repeat(66)}`);
    for (const d of plan.degisecekler) {
      console.log(`  [DEGISECEK] ${d.kod}`);
      console.log(`    eski: ${d.eski}`);
      console.log(`    yeni: ${d.yeni}`);
    }
    for (const kod of plan.zatenDuzeltilmis) console.log(`  [ZATEN DOGRU] ${kod} — dokunulmadi`);
    for (const kod of plan.bulunamayan) console.log(`  [BULUNAMADI] ${kod} — veritabaninda bu kod yok, dokunulmadi`);
    for (const b of plan.beklenmeyenIcerik) {
      console.log(`  [BEKLENMEYEN ICERIK — DOKUNULMADI] ${b.kod}`);
      console.log(`    mevcut: ${b.mevcut}`);
    }

    if (!uygula) {
      console.log(
        `\nPROVA MODU — hicbir sey yazilmadi. ${plan.degisecekler.length} satir degisecekti.\n` +
          '  Gercekten uygulamak icin:  npm run duzelt:paket-aciklama -- --uygula\n',
      );
      return;
    }

    for (const d of plan.degisecekler) {
      await prisma.paket.update({ where: { id: d.id }, data: { aciklama: d.yeni } });
    }
    console.log(`\nUYGULANDI: ${plan.degisecekler.length} paket aciklamasi guncellendi.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

// ⚠ Testler bu dosyayi SAF fonksiyonlar (ACIKLAMA_DUZELTMELERI, planUret) icin
// import eder; `main` yalniz dogrudan calistirildiginda kosar (paketleri-kur.ts
// ile ayni koruma deseni).
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
