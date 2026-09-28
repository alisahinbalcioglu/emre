import { AbonelikDurumu, OdemeYontemi } from '@prisma/client';
import type { PrismaService } from '../../../altyapi/db/prisma.service';
import type { AbonelikServisi } from './abonelik.servisi';
import { iyzicoTestOrtamiMi } from '../fatura/muhasebe.adaptor';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SANDBOX → CANLI iyzico ANAHTAR GEÇİŞİ — veri temizliği (28.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Canlı iyzico hesabı AYRI ve boştur: sandbox'ta üretilmiş abonelik, müşteri
 *  ve sipariş kodları orada YOKTUR. Geçişten sonra kalırlarsa:
 *   · gece mutabakatı her gece canlı API'ye var olmayan aboneliği sorar (hata);
 *   · satın alma kapısı `iyzicoDurum`u ACTIVE gördüğü için firma kartla
 *     yeniden ALAMAZ ("açık kart aboneliği var");
 *   · BEKLEYEN satın alma niyetleri sandbox jetonuyla canlıda sonuçlanamaz;
 *   · işlenmemiş sandbox olayları canlı API'ye sorulup ölü olay olur;
 *   · sandbox ödemesinin kesilmemiş faturası geçişten sonra "test ortamı DEĞİL"
 *     damgasıyla NES'e gider — gerçek parası olmayan satışa fatura kesilir.
 *  KARAR (Emre 28.09): sandbox KART aboneliğinin erişimi geçişte BİTER — test
 *  ödemesi gerçek para değildir. HAVALE gerçek paradır: havale satırında
 *  yalnız (kapatılmış eski kart aboneliğinin) iyzico kodları temizlenir.
 *
 *  Erişimi bitirme DURUM MAKİNESİNDEN geçer (`AbonelikServisi.durumDegistir`):
 *  DENEME/AKTIF/ODEME_BEKLIYOR/KISITLI → IPTAL (erişim şimdi, sayaçlar sıfır)
 *  — saatlik iş satırı SONA_ERDI'ye taşır, miras hakkı varsa geçit mirasa
 *  döndürür; ASKIDA → SONA_ERDI (aynı geçit); IPTAL → erişim en geç şimdi;
 *  SONA_ERDI → yalnız kodlar. iyzico'ya GİDİLMEZ.
 *
 *  İDEMPOTENT: seçim "iyzico kodu taşıyan satır"dır; her satır tek işlemde,
 *  okunan durum ve kodlar yazım anında hâlâ tutuyorsa yazılır (tutmuyorsa
 *  P2025 → atlandı). İkinci koşum hiçbir şey değiştirmez. Eski kodlar ÖNCE
 *  denetim izine yazılır (`ANAHTAR_GECISI_OLAYI`).
 *  ⚠ TEKRAR KİLİDİ (28.09 güvenlik incelemesi): betik kodlu satırın sandbox mı
 *  canlı mı olduğunu AYIRT EDEMEZ. Yeniden koşum yalnız bakım penceresinde
 *  güvenlidir (backend durmuşken, runbook §2); ilk uygulamadan sonra canlı
 *  etkinlik (niyet · gelen olay · yeni satır) varsa `--uygula` REDDEDİLİR —
 *  atlanan satır tam da araya giren canlı satın alma olabilir.
 *  Betik: `backend/scripts/iyzico-canli-gecis.ts` · runbook:
 *  `docs/RUNBOOK_iyzico_canli_gecis.md` · kapı: `test:iyzico-canli-gecis`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const ANAHTAR_GECISI_OLAYI = 'iyzico.anahtar.gecisi';
export const ANAHTAR_GECISI_AKTORU = 'anahtar-gecisi';
const NEDEN = 'iyzico anahtar geçişi (sandbox → canlı)';

/** Kodlu satırın geçişte ne olacağı. SAF. */
export type SatirEylemi = 'iptal' | 'sona-erdi' | 'erisim' | 'yalniz-kod';

export function satirEylemi(ab: { odemeYontemi: string; durum: string }): SatirEylemi {
  if (ab.odemeYontemi !== OdemeYontemi.KART) return 'yalniz-kod';
  switch (ab.durum) {
    case AbonelikDurumu.DENEME:
    case AbonelikDurumu.AKTIF:
    case AbonelikDurumu.ODEME_BEKLIYOR:
    case AbonelikDurumu.KISITLI:
      return 'iptal';
    case AbonelikDurumu.ASKIDA:
      return 'sona-erdi';
    case AbonelikDurumu.IPTAL:
      return 'erisim';
    default:
      return 'yalniz-kod';
  }
}

/** Seçim: HERHANGİ bir iyzico kodu/durumu taşıyan abonelik satırı. */
const KODLU = {
  OR: [
    { iyzicoAbonelikKodu: { not: null } },
    { iyzicoKokKodu: { not: null } },
    { iyzicoMusteriKodu: { not: null } },
    { iyzicoDurum: { not: null } },
  ],
};

/** Kesilmemiş (henüz NES'e gitmemiş ya da takılmış) fatura durumları. */
const KESILMEMIS = ['BEKLIYOR', 'HATA', 'ELLE_MUDAHALE'] as const;

const havaleFaturasiMi = (tahsilatKodu: string) => tahsilatKodu.startsWith('havale:');

export interface PlanSatiri {
  id: string;
  firmaId: string;
  firmaAdi: string;
  odemeYontemi: string;
  durum: string;
  erisimSonu: Date;
  mirasli: boolean;
  eylem: SatirEylemi;
  kodlar: {
    iyzicoAbonelikKodu: string | null;
    iyzicoKokKodu: string | null;
    iyzicoMusteriKodu: string | null;
    iyzicoDurum: string | null;
  };
}

export interface GecisPlani {
  taban: string;
  canli: boolean;
  abonelikler: PlanSatiri[];
  bekleyenNiyet: number;
  islenmemisOlay: number;
  /** Uygulama YALNIZ planda görülen kimliklere dokunur (arada doğan canlı kayıt dışarıda). */
  bekleyenNiyetIdleri: string[];
  islenmemisOlayIdleri: string[];
  iptalEdilecekFatura: Array<{ id: string; abonelikId: string; durum: string }>;
  /** KESİLMİŞ kart faturası: betik dokunmaz — NES'te elle iptal (runbook). */
  kesilmisKartFatura: Array<{ id: string; abonelikId: string; faturaNo: string | null }>;
  denemeMusteriKodlu: number;
  satistakiSurum: Array<{ paketKod: string; surumNo: number; urunKodu: string | null; planKodu: string | null }>;
  /** İlk uygulamanın anı (en eski `iyzico.anahtar.gecisi` izi) — yoksa null. */
  oncekiGecis: Date | null;
  /** İlk uygulamadan SONRA canlı etkinlik (niyet · gelen olay · yeni abonelik). */
  sonrakiEtkinlik: { niyet: number; olay: number; abonelik: number };
}

/** Salt okuma: geçişte ne yapılacağı. */
export async function gecisPlaniCikar(prisma: PrismaService, taban: string): Promise<GecisPlani> {
  const satirlar = await prisma.abonelik.findMany({
    where: KODLU,
    select: {
      id: true,
      firmaId: true,
      odemeYontemi: true,
      durum: true,
      erisimSonu: true,
      mirasPaketSurumuId: true,
      iyzicoAbonelikKodu: true,
      iyzicoKokKodu: true,
      iyzicoMusteriKodu: true,
      iyzicoDurum: true,
      firma: { select: { ad: true } },
    },
    orderBy: { erisimSonu: 'asc' },
  });
  const bekleyenNiyetIdleri = (
    await prisma.abonelikBaslatma.findMany({ where: { durum: 'BEKLIYOR' }, select: { id: true } })
  ).map((n) => n.id);
  const islenmemisOlayIdleri = (
    await prisma.webhookOlayi.findMany({ where: { islendi: false }, select: { id: true } })
  ).map((o) => o.id);
  const faturalar = await prisma.fatura.findMany({
    select: { id: true, abonelikId: true, durum: true, tahsilatKodu: true, faturaNo: true },
  });
  const kartFaturasi = faturalar.filter((f) => !havaleFaturasiMi(f.tahsilatKodu));
  const surumler = await prisma.paketSurumu.findMany({
    where: { satistaMi: true },
    select: { surumNo: true, iyzicoUrunKodu: true, iyzicoPlanKodu: true, paket: { select: { kod: true } } },
  });
  // Tekrar kilidi (28.09 güvenlik incelemesi): betik "iyzico kodlu" satırın
  // sandbox mı canlı mı olduğunu AYIRT EDEMEZ. İlk uygulamadan sonra canlı
  // etkinlik varsa (yeni ya da tamamlanmış niyet, gelen olay, yeni satır)
  // kodlu satır CANLI satın alma olabilir — `uygulamaEngeli` reddeder.
  const ilkIz = await prisma.abonelikOlayi.findFirst({
    where: { tip: ANAHTAR_GECISI_OLAYI },
    orderBy: { olusturuldu: 'asc' },
    select: { olusturuldu: true },
  });
  const esik = ilkIz?.olusturuldu ?? null;
  const sonrakiEtkinlik = esik
    ? {
        niyet: await prisma.abonelikBaslatma.count({
          where: { OR: [{ olusturuldu: { gt: esik } }, { durum: 'TAMAMLANDI', sonuclandi: { gt: esik } }] },
        }),
        olay: await prisma.webhookOlayi.count({ where: { alindi: { gt: esik } } }),
        abonelik: await prisma.abonelik.count({ where: { olusturuldu: { gt: esik } } }),
      }
    : { niyet: 0, olay: 0, abonelik: 0 };
  return {
    oncekiGecis: esik,
    sonrakiEtkinlik,
    taban,
    canli: !iyzicoTestOrtamiMi(taban),
    abonelikler: satirlar.map((s) => ({
      id: s.id,
      firmaId: s.firmaId,
      firmaAdi: s.firma?.ad ?? s.firmaId,
      odemeYontemi: s.odemeYontemi,
      durum: s.durum,
      erisimSonu: s.erisimSonu,
      mirasli: !!s.mirasPaketSurumuId,
      eylem: satirEylemi(s),
      kodlar: {
        iyzicoAbonelikKodu: s.iyzicoAbonelikKodu,
        iyzicoKokKodu: s.iyzicoKokKodu,
        iyzicoMusteriKodu: s.iyzicoMusteriKodu,
        iyzicoDurum: s.iyzicoDurum,
      },
    })),
    bekleyenNiyet: bekleyenNiyetIdleri.length,
    islenmemisOlay: islenmemisOlayIdleri.length,
    bekleyenNiyetIdleri,
    islenmemisOlayIdleri,
    iptalEdilecekFatura: kartFaturasi
      .filter((f) => (KESILMEMIS as readonly string[]).includes(f.durum))
      .map((f) => ({ id: f.id, abonelikId: f.abonelikId, durum: f.durum })),
    kesilmisKartFatura: kartFaturasi
      .filter((f) => f.durum === 'KESILDI')
      .map((f) => ({ id: f.id, abonelikId: f.abonelikId, faturaNo: f.faturaNo })),
    denemeMusteriKodlu: await prisma.denemeKullanimi.count({ where: { iyzicoMusteriKodu: { not: null } } }),
    satistakiSurum: surumler.map((s) => ({
      paketKod: s.paket?.kod ?? '?',
      surumNo: s.surumNo,
      urunKodu: s.iyzicoUrunKodu,
      planKodu: s.iyzicoPlanKodu,
    })),
  };
}

/**
 * `--uygula` kapısı. SAF. Canlı adres ŞART (sandbox'ta koşmak test firmalarının
 * erişimini boşuna bitirir) ve `--beklenen` planın satır sayısına EŞİT olmalı:
 * işletmeci PROVA çıktısında gördüğü sayıyı yazar — arada değişen dünya
 * uygulanmaz.
 */
export function uygulamaEngeli(plan: GecisPlani, beklenen: number | null): string | null {
  if (!plan.canli) {
    return `iyzico adresi CANLI değil (${plan.taban}) — önce canlı anahtar + IYZICO_TABAN_URL, sonra uygulayın.`;
  }
  const e = plan.sonrakiEtkinlik;
  if (plan.oncekiGecis && e.niyet + e.olay + e.abonelik > 0) {
    return (
      `geçiş ${plan.oncekiGecis.toISOString()} tarihinde UYGULANDI ve o andan sonra canlı etkinlik var ` +
      `(niyet ${e.niyet}, olay ${e.olay}, yeni abonelik ${e.abonelik}) — kodlu satırlar CANLI satın alma ` +
      'olabilir; betik yeniden UYGULANMAZ. Kalan satırları tek tek elle inceleyin (runbook §2.3).'
    );
  }
  if (beklenen === null || !Number.isInteger(beklenen)) {
    return `--beklenen=<sayı> gerekli: PROVA çıktısındaki kodlu abonelik sayısını yazın (şu an ${plan.abonelikler.length}).`;
  }
  if (beklenen !== plan.abonelikler.length) {
    return `--beklenen=${beklenen} ama kodlu abonelik ${plan.abonelikler.length} — dünya değişti; PROVA'yı yeniden okuyun.`;
  }
  return null;
}

/** Kart satırında temizlenen alanlar (bekleyen paket değişimi sandbox ucuna aitti). */
const KART_TEMIZLIGI = {
  iyzicoAbonelikKodu: null,
  iyzicoKokKodu: null,
  iyzicoMusteriKodu: null,
  iyzicoDurum: null,
  iyzicoSonKontrol: null,
  kopruErisimSonu: null,
  planliPaketSurumuId: null,
  paketGecisTarihi: null,
  odenenPaketSurumuId: null,
};

/** Havale satırında temizlenen alanlar: yalnız eski kart aboneliğinin izleri. */
const HAVALE_TEMIZLIGI = {
  iyzicoAbonelikKodu: null,
  iyzicoKokKodu: null,
  iyzicoMusteriKodu: null,
  iyzicoDurum: null,
  iyzicoSonKontrol: null,
};

export interface GecisSonucu {
  uygulanan: string[];
  atlanan: Array<{ id: string; neden: string }>;
  vazgecilenNiyet: number;
  kapatilanOlay: number;
  iptalEdilenFatura: number;
}

/** Planı uygular. Her abonelik satırı tek işlemde; hata diğerlerini durdurmaz. */
export async function gecisiUygula(
  prisma: PrismaService,
  abonelik: Pick<AbonelikServisi, 'durumDegistir'>,
  plan: GecisPlani,
  simdi: Date = new Date(Date.now()),
): Promise<GecisSonucu> {
  const sonuc: GecisSonucu = { uygulanan: [], atlanan: [], vazgecilenNiyet: 0, kapatilanOlay: 0, iptalEdilenFatura: 0 };
  for (const s of plan.abonelikler) {
    try {
      await prisma.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        await db.abonelikOlayi.create({
          data: {
            abonelikId: s.id,
            tip: ANAHTAR_GECISI_OLAYI,
            aciklama: `${NEDEN}: sandbox iyzico kodları temizlendi (${s.eylem})`,
            veri: {
              eylem: s.eylem,
              oncekiDurum: s.durum,
              oncekiErisimSonu: s.erisimSonu.toISOString(),
              odemeYontemi: s.odemeYontemi,
              eskiKodlar: s.kodlar,
            },
            aktor: ANAHTAR_GECISI_AKTORU,
          },
        });
        const gecisNotu = { aktor: ANAHTAR_GECISI_AKTORU, aciklama: `${NEDEN} — sandbox kart aboneliğinin erişimi bitti` };
        if (s.eylem === 'iptal' || s.eylem === 'sona-erdi') {
          await abonelik.durumDegistir(s.id, s.eylem === 'iptal' ? AbonelikDurumu.IPTAL : AbonelikDurumu.SONA_ERDI, {
            ...gecisNotu,
            erisimSonu: simdi,
            sayaclariSifirla: true,
            kosul: { odemeYontemi: OdemeYontemi.KART, durum: s.durum as AbonelikDurumu },
            tx,
          });
        }
        const erisim =
          s.eylem === 'erisim' && s.erisimSonu.getTime() > simdi.getTime() ? { erisimSonu: simdi } : {};
        // Kodlar okunduğu gibi duruyorsa temizlenir (araya giren yazım → P2025).
        await db.abonelik.update({
          // Nullable kod alanları AND altında (benzersiz alan `null` olamaz —
          // `iyzicoAbonelikKodu` WhereUniqueInput'ta `string`). Durum değiştirmeyen
          // eylemde okunan durum ve ödeme yöntemi de tutmalı: arada IPTAL → AKTIF
          // olmuşsa AKTIF satırın erişimi şimdiye çekilmez.
          where: {
            id: s.id,
            AND: [
              {
                ...s.kodlar,
                ...(s.eylem === 'erisim' || s.eylem === 'yalniz-kod'
                  ? { durum: s.durum as AbonelikDurumu, odemeYontemi: s.odemeYontemi as OdemeYontemi }
                  : {}),
              },
            ],
          },
          data: { ...(s.odemeYontemi === OdemeYontemi.KART ? KART_TEMIZLIGI : HAVALE_TEMIZLIGI), ...erisim },
        });
      });
      sonuc.uygulanan.push(s.id);
    } catch (e) {
      sonuc.atlanan.push({ id: s.id, neden: e instanceof Error ? e.message : String(e) });
    }
  }
  sonuc.vazgecilenNiyet = (
    await prisma.abonelikBaslatma.updateMany({
      where: { id: { in: plan.bekleyenNiyetIdleri }, durum: 'BEKLIYOR' },
      data: { durum: 'VAZGECILDI', hata: `${NEDEN}: sandbox jetonu canlıda sonuçlanamaz`, sonuclandi: simdi },
    })
  ).count;
  sonuc.kapatilanOlay = (
    await prisma.webhookOlayi.updateMany({
      where: { id: { in: plan.islenmemisOlayIdleri }, islendi: false },
      data: { islendi: true, islenmeZamani: simdi, hata: `${NEDEN}: sandbox olayı işlenmedi` },
    })
  ).count;
  const faturaIdleri = plan.iptalEdilecekFatura.map((f) => f.id);
  if (faturaIdleri.length > 0) {
    sonuc.iptalEdilenFatura = (
      await prisma.fatura.updateMany({
        where: { id: { in: faturaIdleri }, durum: { in: [...KESILMEMIS] } },
        data: { durum: 'IPTAL', hata: `${NEDEN}: sandbox ödemesi — gerçek para yok, fatura KESİLMEZ` },
      })
    ).count;
  }
  return sonuc;
}

/** İşletmeci çıktısı — iyzico kodu YAZILMAZ (denetim izinde). SAF. */
export function planYaz(plan: GecisPlani): string {
  const t = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');
  const satirlar = [
    `iyzico adresi : ${plan.taban} (${plan.canli ? 'CANLI' : 'SANDBOX'})`,
    `kodlu abonelik: ${plan.abonelikler.length}`,
    plan.oncekiGecis
      ? `önceki uygulama: ${t(plan.oncekiGecis)} · sonra canlı etkinlik: niyet ${plan.sonrakiEtkinlik.niyet}, ` +
        `olay ${plan.sonrakiEtkinlik.olay}, yeni abonelik ${plan.sonrakiEtkinlik.abonelik}`
      : 'önceki uygulama: yok (ilk koşum)',
    ...plan.abonelikler.map(
      (s) =>
        `  · ${s.firmaAdi} (${s.firmaId}) · ${s.odemeYontemi} ${s.durum}${s.mirasli ? ' · miras hakkı var' : ''} · ` +
        `erişim ${t(s.erisimSonu)} → ${EYLEM_METNI[s.eylem]}`,
    ),
    `bekleyen satın alma niyeti: ${plan.bekleyenNiyet} → VAZGECILDI`,
    `işlenmemiş webhook olayı : ${plan.islenmemisOlay} → işlenmedi olarak kapatılır`,
    `kesilmemiş KART faturası : ${plan.iptalEdilecekFatura.length} → IPTAL (sandbox ödemesi)`,
    `KESİLMİŞ kart faturası   : ${plan.kesilmisKartFatura.length}${
      plan.kesilmisKartFatura.length ? ' ⚠ betik DOKUNMAZ — NES\'te elle iptal: ' +
        plan.kesilmisKartFatura.map((f) => f.faturaNo ?? f.id).join(', ') : ''
    }`,
    `deneme kaydı (müşteri kodlu): ${plan.denemeMusteriKodlu} → DOKUNULMAZ (deneme hakkı firmaya bağlı kalır)`,
    `satıştaki paket sürümü: ${plan.satistakiSurum.length} → plan kodları SANDBOX'ta üretildi; canlıda ` +
      '`npm run seedpaketler -- --tek-urun` (önce PROVA) ile yeniden kurulur',
  ];
  return satirlar.join('\n');
}

const EYLEM_METNI: Record<SatirEylemi, string> = {
  iptal: 'IPTAL, erişim ŞİMDİ biter (saatlik iş SONA_ERDI / miras)',
  'sona-erdi': 'SONA_ERDI (miras hakkı varsa mirasa döner)',
  erisim: 'IPTAL kalır, erişim en geç ŞİMDİ',
  'yalniz-kod': 'yalnız iyzico kodları temizlenir (durum ve erişim aynı)',
};
