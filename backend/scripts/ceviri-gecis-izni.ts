/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ÇEVİRİ GEÇİŞ İZNİ — kota öncesi İngilizceye çevrilmiş teklifler (K-T6, 15.09)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Kullanım (sunucuda, /opt/metaprice içinden — tasarım §9A.6 komutları):
 *      docker compose run --rm --no-deps -T backend npm run cevirigecis                       → PROVA
 *      docker compose run --rm --no-deps -T backend npm run cevirigecis -- --uygula --k0      → K0 yazar
 *      docker compose run --rm --no-deps -T backend npm run cevirigecis -- --uygula --onayli <id…>
 *      docker compose exec -T backend npm run cevirigecis -- --uygula --geri-al <id…>
 *
 *  ⚠ NEDEN `cevirigecis` (iki nokta YOK): Hetzner web konsolu TR klavyede `:`
 *  yazamıyor (`paketleri-kur.ts` başlığı). Yerelde `npm run ceviri:gecis` de çalışır.
 *
 *  ── NE YAPAR ───────────────────────────────────────────────────────────
 *  T1 (Faz 6.10) İngilizce dosyayı ÖDENMİŞ içeriğe bağladı. Kota canlıya
 *  çıkmadan önce İngilizceye çevrilmiş tekliflerin tüketim kaydı yoktur; T1
 *  gelince onlar "çeviri yok" der. Bu betik o teklifler için kanıt gücüyle
 *  bir liste çıkarır; Emre'nin onayladıklarına `SystemSettings` anahtarı
 *  `ceviri.gecis.en.<teklif>` yazar. Kanıt fonksiyonu bu izni tanır; değer
 *  içeriğin v2 özetini taşır — teklif değişirse izin kendiliğinden düşer.
 *
 *  ── HESAPLAR KODLA AYNI FONKSİYONLARDAN (ikiz YOK) ─────────────────────
 *  `ceviriIcerigi`, `kayittaKaynakDuruyorMu`, `disaAktarimPlani`, katmanlı
 *  harita (`CeviriService.katmanliHarita`, AI'ya ve kotaya dokunmaz), ödenmişlik
 *  (`CeviriKotaServisi.odenmisIcerikKaniti`), anahtar (`gecisAnahtari`).
 *
 *  ── SINIF (Revizyon 1, R1-B3 · R1-D14 · T1 incelemesi DÜŞÜK-2) ────────
 *   1. ödenmiş (v2 kayıt ya da bu içeriğe uyan izin)          → GEREKMIYOR
 *   2. yalnız v1 (14.09 sonrası, eski özetli) BASARILI eşleşir → K0 (onaysız, --k0)
 *   3. değişecek satır yok ve karşılıksız satır yok           → GEREKMIYOR (kapı sorulmaz)
 *   4. değişecek satır yok ama karşılıksız satır var          → CEVIRI_GEREKLI (izin YAZILMAZ)
 *   5. (K1 ya da K2) ve K3 ve K5 = %100 ve karşılıksız yok     → GUCLU
 *   6. kalan                                                   → ZAYIF (K4 yalnız destek bilgisi)
 *  K0, değişecek satırdan ÖNCE sorulur: ödenmiş bir kayıt satır sırası
 *  değişince tanınmaz olmasın diye yeniden anahtarlanır (karşılıksız satırlı
 *  teklifte bu, tamamlama çevirisinin kotadan düşmemesini de korur).
 *
 *  ⚠ NEDEN KARŞILIKSIZ SATIR GÜÇLÜYÜ DÜŞÜRÜR (16.09, T1 incelemesi DÜŞÜK-2):
 *  Emre'nin 15.09 kararından sonra (tam çevrilmemiş teklif İngilizce İNMEZ)
 *  kapı karşılığı olmayan satır varsa her durumda sorulur. İzin yazılmış
 *  teklifte kullanıcı "İngilizceye Çevir"e basınca tekrar dalı (R1-A4) o
 *  satırları KOTASIZ çevirtir — kesimde hiç çevrilmemiş satıra bedava
 *  İngilizce (R1-D3'ün red gerekçesi). Bu yüzden güçlü sınıf yalnız
 *  çevrilecek her satırı kayıtta İngilizce ya da önbellekte karşılıklı olan
 *  teklife verilir; karşılıksız satırlı teklif ZAYIF'a düşer ve gerekçe bu
 *  bedeli söyler. Değişecek satırı hiç olmayan teklife izin YAZILMAZ (D3).
 *
 *  ── VARSAYILAN PROVA ───────────────────────────────────────────────────
 *  Hiçbir şey yazmaz. `--uygula` olmadan `upsert`/`delete` ÇAĞRILMAZ.
 *  Başlık 30 karakterle kesilir (müşteri adı günlüğe tam düşmesin).
 */
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { CeviriKotaServisi } from '../src/ozellik/odeme/abonelik/ceviri-kota.servisi';
import { CeviriService } from '../src/ozellik/giris/ai/ceviri.service';
import {
  ceviriAnahtari,
  ceviriIcerigi,
  disaAktarimPlani,
  kayittaKaynakDuruyorMu,
  satirKaynagi,
} from '../src/ozellik/giris/ai/ceviri-kurali';
import { gecisAnahtari } from '../src/ozellik/odeme/abonelik/ceviri-kotasi';
import { CIKTI_METINLERI_EN } from '../src/ozellik/teklif/quotes/cikti-dil';

export const GECIS_BETIGI = 'ceviri-gecis-izni';
export const KOTA_MIGRATION = '20260914100000_faz6_ceviri_tuketimi';
export const TEKLIF_ALANLARI_MIGRATION = '20260909100000_faz4_firma_teklif_alanlari';
const HEDEF_DIL = 'en';
const SAYFA_BOYU = 20;
const YARIM_PENCERE_DK = 10;
/** Çıktı işleminde `quote.update` ile `quoteExport.create` aynı transaction'da, milisaniyeler içinde. */
const CIKTI_IPUCU_MS = 5_000;

export interface GecisAdayi {
  quoteId: string;
  firmaId: string;
  firmaAdi: string | null;
  quoteNo: string | null;
  baslik: string;
  /** displayLanguage === 'en' */
  L: boolean;
  /** `kayittaKaynakDuruyorMu === false` olan satır (Düzenle'de İngilizce kaydedilmiş). */
  isaretliSatir: number;
  satirSayisi: number;
  degisecek: number;
  karsiliksiz: number;
  /** Bu içerik için v2 özetli BASARILI kayıt ya da uyan geçiş izni var. */
  odenmis: boolean;
  /** Yalnız v1 (T1 öncesi) özetli BASARILI kayıt eşleşiyor. */
  v1Odenmis: boolean;
  updatedAt: Date;
  /** null = ölçülemez (`updatedAt` sütunu kesimden sonra geldi). */
  K3: boolean | null;
  /**
   * İPUCU, kanıt DEĞİL (T1 incelemesi DÜŞÜK-4): K3 yanlışken son değişiklik
   * zamanı son çıktı kaydıyla aynı anda (≤ 5 sn). Teklif Formatı çıktısı
   * `quote.update({ quoteNo, rev })` ile `updatedAt`'i ilerletir; bu durumda
   * K3'ü bozan yalnız çıktı alımı OLABİLİR. Arada içerik kaydı yapılıp
   * yapılmadığı ölçülemez (teklif değişiklik geçmişi tutulmuyor) → sınıfı
   * DEĞİŞTİRMEZ, yalnız Emre'nin ZAYIF kararına bilgi.
   */
  K3ciktiIpucu: boolean;
  ciktiSayisi: number;
  ilkCikti: Date | null;
  K4: boolean;
  /** DEĞİŞECEK satırların metinlerinin kesimden önce Translation'da bulunma yüzdesi (0-100, aşağı yuvarlanır). */
  K5: number;
  /** Güncel v2 özet — yazılacak iznin değeri. */
  ozet: string;
}

export type GecisSinifi = 'GUCLU' | 'ZAYIF' | 'GEREKMIYOR' | 'CEVIRI_GEREKLI' | 'K0';

export function gecisSinifi(a: GecisAdayi): { sinif: GecisSinifi; kanit: string; gerekce: string } {
  const K1 = a.isaretliSatir > 0;
  const K2 = a.L && a.isaretliSatir === 0;
  const kanit = [
    K1 ? 'K1' : '',
    K2 ? 'K2' : '',
    a.K3 === true ? 'K3' : '',
    a.K4 ? 'K4' : '',
    a.degisecek > 0 && a.K5 === 100 ? 'K5' : '',
  ].filter(Boolean).join('+');
  if (a.odenmis) return { sinif: 'GEREKMIYOR', kanit, gerekce: 'bu içeriğin ödenmiş çevirisi ya da izni zaten var' };
  if (a.v1Odenmis) return { sinif: 'K0', kanit, gerekce: '14.09 sonrası ödenmiş eski özetli kayıt — yeni özetle yeniden anahtarlanır (onaysız)' };
  if (a.degisecek === 0 && a.karsiliksiz === 0) {
    return { sinif: 'GEREKMIYOR', kanit, gerekce: 'İngilizce dosyada değişecek ya da karşılığı olmayan satır yok; kapı sorulmaz' };
  }
  if (a.degisecek === 0) {
    return {
      sinif: 'CEVIRI_GEREKLI',
      kanit,
      gerekce: `izin yazılmaz — İngilizce dosya durur: karşılığı olmayan ${a.karsiliksiz} satır var ve değişecek satır yok; izin bu satırları kotasız çevirtirdi, kullanıcı İngilizceye Çevir'e basmalı`,
    };
  }
  if ((K1 || K2) && a.K3 === true && a.K5 === 100 && a.karsiliksiz === 0) {
    return { sinif: 'GUCLU', kanit, gerekce: 'çevrilmiş görünüyor, kesimden beri değişmedi, değişecek metinlerin hepsi kesimden önce önbellekteydi, karşılığı olmayan satır yok' };
  }
  const nedenler = [
    a.K3 === null ? 'kesimden sonra değişip değişmediği ölçülemiyor' : '',
    a.K3 === false ? 'kesimden sonra değişmiş olabilir' : '',
    !K1 && !K2 ? 'çevrildiğine dair işaret yok' : '',
    a.K5 < 100 ? 'değişecek metinlerin bir kısmı kesimden önce önbellekte yoktu' : '',
    a.karsiliksiz > 0 ? `karşılığı olmayan ${a.karsiliksiz} satır var — izin yazılırsa kullanıcı İngilizceye Çevir'e basınca bu satırlar kotasız çevrilir` : '',
  ].filter(Boolean);
  return { sinif: 'ZAYIF', kanit, gerekce: nedenler.join('; ') };
}

interface Ortam {
  kesim: Date;
  k3Olculebilir: boolean;
  ceviri: CeviriService;
  kota: CeviriKotaServisi;
}

type TeklifOzeti = { id: string; firmaId: string; title: string | null; quoteNo: string | null; displayLanguage: string | null; updatedAt: Date };

function isaretliSatirSayisi(sayfalar: unknown): number {
  let n = 0;
  for (const s of Array.isArray(sayfalar) ? sayfalar : []) {
    const adAlan = s?.columnRoles?.nameField;
    if (!s || s.isEmpty || typeof adAlan !== 'string' || !adAlan) continue;
    for (const row of Array.isArray(s.rowData) ? s.rowData : []) {
      if (row && typeof row === 'object' && !kayittaKaynakDuruyorMu(row, adAlan)) n++;
    }
  }
  return n;
}

async function ingilizceEtiketVarMi(bytes: unknown): Promise<boolean> {
  const etiket = CIKTI_METINLERI_EN['Genel Toplam'];
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes as Uint8Array) as any);
    let bulundu = false;
    wb.eachSheet((ws) => ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
      const v: any = c.value;
      const t = v && typeof v === 'object' ? (Array.isArray(v.richText) ? v.richText.map((x: any) => x.text).join('') : String(v.text ?? '')) : String(v ?? '');
      if (t === etiket) bulundu = true;
    })));
    return bulundu;
  } catch {
    return false;
  }
}

/** Tek teklifin kanıtları — kodla aynı fonksiyonlardan. */
export async function adayOlc(prisma: any, q: TeklifOzeti, sayfalar: unknown, ortam: Ortam, firmaAdi: string | null = null): Promise<GecisAdayi> {
  const icerik = ceviriIcerigi(sayfalar);
  const { harita } = await ortam.ceviri.katmanliHarita(icerik.metinler, HEDEF_DIL, q.firmaId);
  const plan = disaAktarimPlani(sayfalar, harita);
  const kanit = await ortam.kota.odenmisIcerikKaniti({ userId: GECIS_BETIGI, firmaId: q.firmaId }, q.id, HEDEF_DIL, icerik);
  let v2 = false;
  if (kanit.odenmis === true) {
    v2 = kanit.kaynak === 'GECIS' || (await prisma.ceviriTuketimi.findFirst({
      where: { firmaId: q.firmaId, quoteId: q.id, hedefDil: HEDEF_DIL, durum: 'BASARILI', icerikOzeti: icerik.ozet },
      select: { id: true },
    })) !== null;
  }

  const ciktilar: Array<{ id: string; createdAt: Date }> = await prisma.quoteExport.findMany({
    where: { quoteId: q.id, createdAt: { lt: ortam.kesim } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true },
  });
  let K4 = false;
  for (const c of ciktilar) {
    const tam = await prisma.quoteExport.findUnique({ where: { id: c.id }, select: { xlsxBytes: true } });
    if (tam && (await ingilizceEtiketVarMi(tam.xlsxBytes))) {
      K4 = true;
      break;
    }
  }

  const degisecekMetinleri = Array.from(new Set(plan.degisecek.map((d) => ceviriAnahtari(satirKaynagi(d.row, d.adAlan)))));
  let K5 = 0;
  if (degisecekMetinleri.length > 0) {
    const onceden: Array<{ sourceText: string }> = await prisma.translation.findMany({
      where: { targetLang: HEDEF_DIL, sourceText: { in: degisecekMetinleri }, createdAt: { lt: ortam.kesim } },
      select: { sourceText: true },
    });
    K5 = Math.floor((100 * new Set(onceden.map((t) => t.sourceText)).size) / degisecekMetinleri.length);
  }

  const K3 = ortam.k3Olculebilir ? new Date(q.updatedAt).getTime() < ortam.kesim.getTime() : null;
  let K3ciktiIpucu = false;
  if (K3 === false) {
    const sonCikti: { createdAt: Date } | null = await prisma.quoteExport.findFirst({
      where: { quoteId: q.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    K3ciktiIpucu = !!sonCikti && Math.abs(new Date(q.updatedAt).getTime() - new Date(sonCikti.createdAt).getTime()) <= CIKTI_IPUCU_MS;
  }

  return {
    quoteId: q.id,
    firmaId: q.firmaId,
    firmaAdi,
    quoteNo: q.quoteNo,
    baslik: String(q.title ?? '').slice(0, 30),
    L: q.displayLanguage === 'en',
    isaretliSatir: isaretliSatirSayisi(sayfalar),
    satirSayisi: icerik.satirSayisi,
    degisecek: plan.degisecek.length,
    karsiliksiz: plan.karsiliksiz,
    odenmis: v2,
    v1Odenmis: kanit.odenmis === true && !v2,
    updatedAt: q.updatedAt,
    K3,
    K3ciktiIpucu,
    ciktiSayisi: ciktilar.length,
    ilkCikti: ciktilar[0]?.createdAt ?? null,
    K4,
    K5,
    ozet: icerik.ozet,
  };
}

const TEKLIF_ALANLARI = { id: true, firmaId: true, title: true, quoteNo: true, displayLanguage: true, updatedAt: true } as const;

/** Bayrağın ardından gelen kimlikler (sonraki bayrağa kadar). */
function kimlikler(argv: string[], bayrak: string): string[] {
  const i = argv.indexOf(bayrak);
  if (i < 0) return [];
  const sonraki = argv.slice(i + 1);
  const bitis = sonraki.findIndex((a) => a.startsWith('--'));
  return bitis < 0 ? sonraki : sonraki.slice(0, bitis);
}

const gun = (t: Date | null) => (t ? new Date(t).toISOString().slice(0, 10) : '-');
const evet = (b: boolean | null) => (b === null ? '?' : b ? '✓' : '✗');

export async function gecisKos(prisma: any, argv: string[], yaz: (satir: string) => void, simdi = new Date()): Promise<number> {
  const uygula = argv.includes('--uygula');
  const gocler: Array<{ migration_name: string; finished_at: Date | null }> =
    await prisma.$queryRaw`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name IN (${KOTA_MIGRATION}, ${TEKLIF_ALANLARI_MIGRATION})`;
  const kotaGocu = gocler.find((g) => g.migration_name === KOTA_MIGRATION && g.finished_at);
  if (!kotaGocu) {
    yaz(`DURDU: kota migration'ı (${KOTA_MIGRATION}) uygulanmamış — geçiş anlamsız, hiçbir şey yapılmadı.`);
    return 1;
  }
  const kesim = new Date(kotaGocu.finished_at as Date);
  const alanGocu = gocler.find((g) => g.migration_name === TEKLIF_ALANLARI_MIGRATION && g.finished_at);
  const k3Olculebilir = !!alanGocu && new Date(alanGocu.finished_at as Date).getTime() < kesim.getTime();
  const kota = new CeviriKotaServisi(prisma);
  const ortam: Ortam = { kesim, k3Olculebilir, kota, ceviri: new CeviriService(prisma, {} as any, kota) };

  // ── GERİ AL ─────────────────────────────────────────────────────────────
  if (argv.includes('--geri-al')) {
    yaz(uygula ? 'ÇEVİRİ GEÇİŞ İZNİ — GERİ ALMA' : 'ÇEVİRİ GEÇİŞ İZNİ — GERİ ALMA PROVASI (hiçbir şey silinmedi)');
    let kod = 0;
    for (const id of kimlikler(argv, '--geri-al')) {
      const key = gecisAnahtari(id, HEDEF_DIL);
      const kayit = await prisma.systemSettings.findUnique({ where: { key } });
      if (!kayit) {
        yaz(`${id} | BULUNAMADI`);
        kod = 1;
        continue;
      }
      let betik: unknown;
      try {
        betik = JSON.parse(kayit.value)?.betik;
      } catch {
        betik = undefined;
      }
      if (betik !== GECIS_BETIGI) {
        yaz(`${id} | ATLANDI (bu betiğin yazdığı izin değil — elle incelenmeli)`);
        continue;
      }
      if (!uygula) {
        yaz(`${id} | SİLİNECEK: ${kayit.value}`);
        continue;
      }
      await prisma.systemSettings.delete({ where: { key } });
      yaz(`${id} | SİLİNDİ: ${kayit.value}`);
    }
    return kod;
  }

  const teklifOku = async (id: string): Promise<{ q: TeklifOzeti; sayfalar: unknown } | null> => {
    const q = await prisma.quote.findFirst({ where: { id, firmaId: { not: null } }, select: TEKLIF_ALANLARI });
    if (!q) return null;
    const tam = await prisma.quote.findUnique({ where: { id }, select: { sheets: true } });
    return { q, sayfalar: tam?.sheets };
  };

  const firmaAdlari = new Map<string, string | null>();
  const firmaAdi = async (firmaId: string) => {
    if (!firmaAdlari.has(firmaId)) {
      const f = await prisma.firma.findUnique({ where: { id: firmaId }, select: { ad: true } });
      firmaAdlari.set(firmaId, f?.ad ?? null);
    }
    return firmaAdlari.get(firmaId) ?? null;
  };

  /** Yazma kararı — aynı özetli izin varsa ZATEN VAR, farklıysa ezilmez (`--yenile` yoksa). */
  const izinYaz = async (a: GecisAdayi, sinif: GecisSinifi, kanit: string, yenile: boolean): Promise<string> => {
    const key = gecisAnahtari(a.quoteId, HEDEF_DIL);
    const mevcut = await prisma.systemSettings.findUnique({ where: { key } });
    if (mevcut) {
      let ozet: unknown;
      try {
        ozet = JSON.parse(mevcut.value)?.icerikOzeti;
      } catch {
        ozet = undefined;
      }
      if (ozet === a.ozet) return 'ZATEN VAR';
      if (!yenile) return 'İÇERİK DEĞİŞMİŞ — yeniden onay gerekir (üzerine yazmak için --yenile)';
    }
    const value = JSON.stringify({
      surum: 1, firmaId: a.firmaId, quoteId: a.quoteId, hedefDil: HEDEF_DIL, icerikOzeti: a.ozet,
      sinif, kanit, yazildi: simdi.toISOString(), betik: GECIS_BETIGI,
    });
    await prisma.systemSettings.upsert({ where: { key }, create: { key, value }, update: { value } });
    return `YAZILDI (${sinif}, ${kanit || '-'})`;
  };

  // ── UYGULA ──────────────────────────────────────────────────────────────
  if (uygula) {
    const onayli = kimlikler(argv, '--onayli');
    const k0 = argv.includes('--k0');
    if (onayli.length === 0 && !k0) {
      yaz('HATA: --uygula ile ya --onayli <teklifId…> ya da --k0 verilmeli. Hiçbir şey yazılmadı.');
      return 1;
    }
    let kod = 0;
    if (onayli.length > 0) {
      yaz('ÇEVİRİ GEÇİŞ İZNİ — ONAYLILARI YAZ (hesaplar yeniden yapıldı)');
      const yenile = argv.includes('--yenile');
      for (const id of onayli) {
        const t = await teklifOku(id);
        if (!t) {
          yaz(`${id} | BULUNAMADI`);
          kod = 1;
          continue;
        }
        const a = await adayOlc(prisma, t.q, t.sayfalar, ortam, await firmaAdi(t.q.firmaId));
        const s = gecisSinifi(a);
        if (s.sinif !== 'GUCLU' && s.sinif !== 'ZAYIF') {
          const mevcut = await prisma.systemSettings.findUnique({ where: { key: gecisAnahtari(id, HEDEF_DIL) } });
          yaz(`${id} | ${mevcut && a.odenmis ? 'ZATEN VAR' : `ATLANDI (${s.sinif}: ${s.gerekce})`}`);
          continue;
        }
        yaz(`${id} | ${await izinYaz(a, s.sinif, s.kanit, yenile)}`);
      }
    }
    if (k0) {
      yaz('ÇEVİRİ GEÇİŞ İZNİ — K0 (eski özetli ödenmiş kayıtlar, onaysız)');
      for await (const t of tumTeklifler(prisma)) {
        const tam = await prisma.quote.findUnique({ where: { id: t.id }, select: { sheets: true } });
        const a = await adayOlc(prisma, t, tam?.sheets, ortam, await firmaAdi(t.firmaId));
        const s = gecisSinifi(a);
        if (s.sinif !== 'K0') continue;
        yaz(`${t.id} | ${await izinYaz(a, 'K0', s.kanit, false)}`);
      }
    }
    return kod;
  }

  // ── PROVA ───────────────────────────────────────────────────────────────
  yaz('ÇEVİRİ GEÇİŞ İZNİ — PROVA (hiçbir şey yazılmadı)');
  yaz(`Kota başlangıcı (${KOTA_MIGRATION} uygulandı): ${kesim.toISOString()}`);
  yaz(`K3 kullanılabilir mi: ${k3Olculebilir ? 'EVET' : 'HAYIR'} (${TEKLIF_ALANLARI_MIGRATION}: ${alanGocu?.finished_at ? new Date(alanGocu.finished_at).toISOString() : 'kayıt yok'}${k3Olculebilir ? ', kesimden önce' : ''})`);
  const yarim = await prisma.ceviriTuketimi.count({
    where: { durum: 'KISMI', sonuclandi: { gt: new Date(simdi.getTime() - YARIM_PENCERE_DK * 60_000) } },
  });
  yaz(`Son ${YARIM_PENCERE_DK} dakikada yarım kalan çeviri: ${yarim}${yarim > 0 ? ` — deploy'u ${YARIM_PENCERE_DK} dakika erteleyip PROVA'yı yeniden koşun` : ''}`);

  let taranan = 0;
  const liste: Array<{ a: GecisAdayi; s: ReturnType<typeof gecisSinifi> }> = [];
  for await (const t of tumTeklifler(prisma)) {
    taranan++;
    const tam = await prisma.quote.findUnique({ where: { id: t.id }, select: { sheets: true } });
    const a = await adayOlc(prisma, t, tam?.sheets, ortam, await firmaAdi(t.firmaId));
    if (!(a.L || a.isaretliSatir > 0 || a.v1Odenmis)) continue;
    liste.push({ a, s: gecisSinifi(a) });
  }
  yaz(`Taranan teklif: ${taranan} · aday: ${liste.length}`);
  yaz('');
  yaz('teklif | firma | teklif no | başlık(30) | dil | İng. kayıtlı satır | satır | değişecek | karşılıksız | updatedAt | K3 | çıktı (ilk) | K4 | K5 | sınıf | öneri');
  const satirYaz = ({ a, s }: { a: GecisAdayi; s: ReturnType<typeof gecisSinifi> }) => yaz([
    a.quoteId, a.firmaAdi ?? '-', a.quoteNo ?? '-', a.baslik, a.L ? 'en' : 'tr', a.isaretliSatir, a.satirSayisi, a.degisecek, a.karsiliksiz,
    new Date(a.updatedAt).toISOString(), evet(a.K3), `${a.ciktiSayisi} (${gun(a.ilkCikti)})`, evet(a.K4), `%${a.K5}`, s.sinif,
    s.sinif === 'GUCLU'
      ? 'yaz'
      : s.sinif === 'ZAYIF'
        ? `Emre karar verir — ${s.gerekce}${a.K3ciktiIpucu ? ' (ipucu: son değişiklik bir çıktı alımıyla aynı anda — yalnız çıktı alınmış olabilir; kanıt değil)' : ''}`
        : s.sinif === 'K0' ? '--k0 ile yazılır' : s.gerekce,
  ].join(' | '));
  liste.filter((x) => x.s.sinif !== 'K0').forEach(satirYaz);
  const k0Listesi = liste.filter((x) => x.s.sinif === 'K0');
  if (k0Listesi.length > 0) {
    yaz('');
    yaz('K0 — 14.09 sonrası ödenmiş, eski özetli kayıtlar (onaysız yeniden anahtarlanır):');
    k0Listesi.forEach(satirYaz);
  }
  const say = (sinif: GecisSinifi) => liste.filter((x) => x.s.sinif === sinif).length;
  yaz(`ÖZET: GUCLU ${say('GUCLU')} · ZAYIF ${say('ZAYIF')} · GEREKMIYOR ${say('GEREKMIYOR')} · CEVIRI_GEREKLI ${say('CEVIRI_GEREKLI')} · K0 ${say('K0')}`);
  yaz('K0 kayıtlarını yazmak için: npm run cevirigecis -- --uygula --k0');
  yaz('Onayladıklarınızı yazmak için: npm run cevirigecis -- --uygula --onayli <teklifId> <teklifId> …');
  yaz('ZAYIF satırlar için kararı Emre verir; betik listede olmayan kimliği yazmaz.');
  return 0;
}

/** `firmaId` dolu teklifler, 20'şerli, imleçle (sheets OKUNMAZ — tek VPS belleği, R1-D4). */
async function* tumTeklifler(prisma: any): AsyncGenerator<TeklifOzeti> {
  let sonId: string | null = null;
  for (;;) {
    const where: Record<string, unknown> = sonId === null ? { firmaId: { not: null } } : { firmaId: { not: null }, id: { gt: sonId } };
    const sayfa: TeklifOzeti[] = await prisma.quote.findMany({ where, orderBy: { id: 'asc' }, take: SAYFA_BOYU, select: TEKLIF_ALANLARI });
    for (const q of sayfa) yield q;
    if (sayfa.length < SAYFA_BOYU) return;
    sonId = sayfa[sayfa.length - 1].id;
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    process.exitCode = await gecisKos(prisma, process.argv.slice(2), (s) => console.log(s));
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
