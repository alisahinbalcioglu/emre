/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ÇEVİRİ GÜVENLİK SÜZGECİ ÖLÇÜMÜ — T2 deploy'undan ÖNCE, SALT OKUMA (R1-B2c, 16.09)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Kullanım (sunucuda, /opt/metaprice içinden — tasarım §9B.6):
 *      nohup docker compose run --rm --no-deps -T backend npm run cevirisuzgecolcum </dev/null > /root/ceviri-suzgec-olcum.log 2>&1
 *  ⚠ NEDEN `cevirisuzgecolcum` (iki nokta YOK): Hetzner web konsolu TR klavyede `:`
 *  yazamıyor. Yerelde `npm run ceviri:suzgec-olcum` de çalışır.
 *
 *  ── NE ÖLÇER ──────────────────────────────────────────────────────────
 *  T2 ile AI yanıtı `ceviriGuvenliMi`den geçmezse teklif "tamamlanamadı" döner
 *  (hepsi ya da hiçbiri): süzgeç DOĞRU bir çeviriyi reddederse o satırı içeren
 *  teklif HİÇ çevrilemez. Canlı ortak önbellekteki makine çevirileri
 *  (`Translation.kaynak = 'ai'`) bugünkü süzgeçten geçirilir; red oranı ve ilk
 *  20 örnek basılır. Oran eşiği aşarsa T2 deploy'u DURUR, örnekler Emre'ye.
 *  Eşik %1 — VARSAYILAN (Emre kararı bekliyor).
 *
 *  Hiçbir şey YAZMAZ: yalnız `translation.findMany` (sayfalı, imleçli).
 *  Metinler 60 karakterle kesilir (müşteri metni günlüğe tam düşmesin).
 */
import { PrismaClient } from '@prisma/client';
import { ceviriGuvenliMi } from '../src/ozellik/giris/ai/ceviri-kurali';

export const SUZGEC_ESIK_YUZDE = 1;
export const ORNEK_SAYISI = 20;
const SAYFA_BOYU = 500;
const KESIT = 60;

export interface SuzgecOlcumu {
  taranan: number;
  reddedilen: number;
  /** 0-100, iki ondalık. Taranan 0 ise 0. */
  oranYuzde: number;
  esikAsildi: boolean;
  ornekler: Array<{ kaynak: string; ceviri: string }>;
}

const kes = (m: string) => (m.length > KESIT ? `${m.slice(0, KESIT)}…` : m);

export async function suzgecOlc(prisma: any, yaz: (satir: string) => void): Promise<SuzgecOlcumu> {
  let taranan = 0;
  let reddedilen = 0;
  const ornekler: SuzgecOlcumu['ornekler'] = [];
  let sonId: string | null = null;
  for (;;) {
    const where: Record<string, unknown> = sonId === null ? { kaynak: 'ai' } : { kaynak: 'ai', id: { gt: sonId } };
    const sayfa: Array<{ id: string; sourceText: string; translatedText: string }> = await prisma.translation.findMany({
      where,
      orderBy: { id: 'asc' },
      take: SAYFA_BOYU,
      select: { id: true, sourceText: true, translatedText: true },
    });
    for (const t of sayfa) {
      taranan++;
      if (ceviriGuvenliMi(t.sourceText, t.translatedText)) continue;
      reddedilen++;
      if (ornekler.length < ORNEK_SAYISI) ornekler.push({ kaynak: kes(t.sourceText), ceviri: kes(t.translatedText) });
    }
    if (sayfa.length < SAYFA_BOYU) break;
    sonId = sayfa[sayfa.length - 1].id;
  }

  const oranYuzde = taranan === 0 ? 0 : Math.round((10_000 * reddedilen) / taranan) / 100;
  const esikAsildi = oranYuzde > SUZGEC_ESIK_YUZDE;
  yaz('ÇEVİRİ GÜVENLİK SÜZGECİ ÖLÇÜMÜ — SALT OKUMA (hiçbir şey yazılmadı)');
  yaz(`Taranan makine çevirisi (kaynak=ai): ${taranan} · süzgecin reddedeceği: ${reddedilen} · oran: %${oranYuzde.toFixed(2)}`);
  yaz(esikAsildi
    ? `SONUÇ: DUR — oran eşiği (%${SUZGEC_ESIK_YUZDE}) aşıyor. T2 deploy EDİLMEZ; aşağıdaki örneklerle Emre'ye.`
    : `SONUÇ: GEÇTİ — oran eşiğin (%${SUZGEC_ESIK_YUZDE}) altında.`);
  if (ornekler.length > 0) {
    yaz('');
    yaz(`İlk ${ornekler.length} örnek (60 karakterle kesildi):`);
    ornekler.forEach((o, i) => yaz(`${i + 1}. ${o.kaynak} → ${o.ceviri}`));
  }
  return { taranan, reddedilen, oranYuzde, esikAsildi, ornekler };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const r = await suzgecOlc(prisma, (s) => console.log(s));
    process.exitCode = r.esikAsildi ? 2 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

// Test içe aktarınca veritabanına bağlanmasın: yalnız doğrudan koşulunca çalışır.
if (require.main === module) {
  main().catch((e) => {
    console.error('\n✗ HATA:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
