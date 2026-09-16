import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import type { Kimlik } from '../../../altyapi/auth/kimlik';
import { epostaDogrulandiMi } from '../../../altyapi/auth/eposta-dogrulama';
import { CeviriKotaServisi } from '../../odeme/abonelik/ceviri-kota.servisi';
import { ErisimServisi, Yetenek } from '../../odeme/abonelik/erisim.servisi';
import { ceviriAnahtari, ceviriGuvenliMi, dokunulmazMi } from './ceviri-kurali';
import { kaynakOzeti } from './ceviri-katmani';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FİRMA ÇEVİRİ DÜZELTMESİ — iş kuralları (Faz 6.9, 16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ── NEDEN FİRMA KATMANI (iş emri 6.9, Emre 13.09) ─────────────────────────
 *  Eskiden `POST /ai/translate/correct` ortak önbelleği HERKES için kalıcı
 *  değiştiriyordu: saldırganın metni bir taahhüt firmasının müşterisine giden
 *  İngilizce teklife girerdi ve kimin yaptığı bulunamazdı. Artık kullanıcı
 *  yalnız KENDİ FİRMASININ katmanına yazar (anahtar `Firma`, ekip modeline
 *  geçişte göç gerekmez); ortak katmana yalnız yönetici yazar.
 *
 *  ── SIRA (her ret gerekçeli; hiçbiri kayıt ya da olay bırakmaz) ───────────
 *   1. e-posta doğrulanmamış → 403 (kota ayırmasıyla AYNI yardımcı)
 *   2. boş · 3. ölçü/kod · 4. güvenlik süzgeci (K-T11) → 400
 *   4b. teklif firmanın değil → 404; metin teklifin kayıtlı metinlerinde yok → 400 (R1-B1)
 *   5. TRANSACTION: firma kilidi → günlük tavan (429) → önceki kayıt →
 *      firma tavanı (409) → aynı değer ise yazmadan dön → yaz → OLAY
 *  Düzeltme ile olay AYNI transaction'da: ya ikisi ya hiçbiri (K-T12).
 *
 *  ── KİLİT NEDEN FİRMA BAŞI (R1-D7) ────────────────────────────────────────
 *  `oncekiDeger` READ COMMITTED altında eşzamanlı iki PUT'ta yanlış yazılırdı;
 *  günlük sayım ve firma tavanı da aynı yarışa açık. Hepsi tek kilitte
 *  (`ceviri-duzeltme:<firmaId>`); kilit okumadan, sayımdan ve yazmadan ÖNCE.
 *
 *  ⚠ ORTAK DEĞER HİÇBİR YOLDAN İSTEMCİYE ÇIKMAZ (§1.4, R1-B1): olaydaki
 *  `ortakDeger` yalnız denetim izidir. Yanıtlar, hata metinleri ve KVKK veri
 *  indirmesi onu taşımaz — aksi hâlde "ücretsiz sözlük sorgusu" ile ortak
 *  karşılık okunup teklif elle İngilizceye çevrilir, kota aşılırdı.
 */

/** Firma başına en fazla düzeltme satırı (disk ve okuma maliyeti sınırı). */
export const FIRMA_DUZELTME_TAVANI = 5000;
/** Firma başına günlük yazım (PUT + DELETE) tavanı — VARSAYILAN (R1-B5), Emre kararı. */
export const GUNLUK_DUZELTME_TAVANI = 500;

export type DuzeltmeRedKodu =
  | 'EPOSTA_DOGRULANMADI'
  | 'CEVIRI_BOS'
  | 'OLCU_KODU_CEVRILMEZ'
  | 'CEVIRI_GUVENSIZ'
  | 'KAYNAK_TEKLIFTE_YOK'
  | 'DUZELTME_TAVANI'
  | 'DUZELTME_GUNLUK_TAVAN'
  | 'DUZELTME_YOK';

/** Ret metinleri TEK yerde; testler buradan okur. Hiçbiri ortak katman değeri taşımaz. */
export const DUZELTME_METNI: Readonly<Record<DuzeltmeRedKodu, { durum: number; mesaj: string; aciklama: string }>> = {
  EPOSTA_DOGRULANMADI: {
    durum: 403,
    mesaj: 'Çeviri düzeltmesi için e-posta adresinizi doğrulayın',
    aciklama: 'Hesabınıza gönderilen doğrulama bağlantısına tıklayın; ardından düzeltmeyi tekrar kaydedin.',
  },
  CEVIRI_BOS: {
    durum: 400,
    mesaj: 'Kaynak ve çeviri boş olamaz',
    aciklama: 'Türkçe asıl metin ve firmanızın karşılığı dolu olmalı.',
  },
  OLCU_KODU_CEVRILMEZ: {
    durum: 400,
    mesaj: 'Ölçü ya da koddan oluşan satırlar çevrilmez',
    aciklama: 'Bu satır için düzeltme kaydedilmez.',
  },
  CEVIRI_GUVENSIZ: {
    durum: 400,
    mesaj: 'Çeviride kaynaktaki sayılar ve ölçüler aynen bulunmalı',
    aciklama: 'DN 20, Ø110 gibi ölçüler karşılıkta da aynı olmalı; kaynakta olmayan bağlantı ya da e-posta adresi olamaz.',
  },
  KAYNAK_TEKLIFTE_YOK: {
    durum: 400,
    mesaj: 'Bu metin seçili teklifte bulunmuyor',
    aciklama: 'Düzeltme yalnız teklifin kayıtlı malzeme/iş adları için yazılır; yeni eklenen satır için önce teklifi kaydedin.',
  },
  DUZELTME_TAVANI: {
    durum: 409,
    mesaj: 'Firma sözlüğü dolu',
    aciklama: 'Firmanız en fazla 5.000 çeviri düzeltmesi kaydedebilir. Kullanmadığınız düzeltmeleri kaldırın.',
  },
  DUZELTME_GUNLUK_TAVAN: {
    durum: 429,
    mesaj: 'Bugünkü çeviri düzeltme sınırına ulaşıldı',
    aciklama: 'Firmanız günde en fazla 500 düzeltme kaydedebilir; yarın tekrar deneyin.',
  },
  DUZELTME_YOK: {
    durum: 404,
    mesaj: 'Düzeltme bulunamadı',
    aciklama: 'Düzeltme kaldırılmış ya da firmanıza ait değil.',
  },
};

/** Gövde `{ message, mesaj, aciklama, kod }` — `message` eski istemciler için ZORUNLU (§3). */
export function duzeltmeReddi(kod: DuzeltmeRedKodu): HttpException {
  const m = DUZELTME_METNI[kod];
  return new HttpException({ message: `${m.mesaj}. ${m.aciklama}`, mesaj: m.mesaj, aciklama: m.aciklama, kod }, m.durum);
}

/** Türkiye saatiyle (UTC+3, yaz saati yok) bugünün başlangıcı. */
export function turkiyeGunBaslangici(simdi: Date): Date {
  const UC_SAAT = 3 * 60 * 60 * 1000;
  const yerel = new Date(simdi.getTime() + UC_SAAT);
  yerel.setUTCHours(0, 0, 0, 0);
  return new Date(yerel.getTime() - UC_SAAT);
}

export interface DuzeltmeListesi {
  /** Teklifin kayıtlı içeriğindeki çevrilebilir metinler (kalem işareti yalnız bunlarda). */
  anahtarlar: string[];
  /** Yalnız BU firmanın bu anahtarlar için yazdığı karşılıklar. */
  duzeltmeler: Array<{ id: string; kaynak: string; ceviri: string; guncellendi: Date }>;
  /** Kapalıysa ekran işaret çizmez (yazma uçları zaten 403 döner). */
  duzeltmeAcik: boolean;
}

export interface DuzeltmeKaydi {
  id: string;
  kaynak: string;
  ceviri: string;
  degisti: boolean;
}

type Islem = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class CeviriDuzeltmeServisi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kota: CeviriKotaServisi,
    private readonly erisim: ErisimServisi,
  ) {}

  /** Saat dikişi — testler günlük tavanın gün sınırını sabit saatle ölçer. */
  protected saat(): Date {
    return new Date();
  }

  async listele(k: Kimlik, quoteId: string, hedefDil = 'en'): Promise<DuzeltmeListesi> {
    const { icerik } = await this.kota.kayitliIcerik(k, quoteId);
    const anahtarlar = icerik.metinler;
    let duzeltmeler: DuzeltmeListesi['duzeltmeler'] = [];
    if (anahtarlar.length > 0) {
      const istenen = new Set(anahtarlar);
      const satirlar = await this.prisma.ceviriDuzeltmesi.findMany({
        where: { firmaId: k.firmaId, hedefDil, kaynakOzeti: { in: anahtarlar.map((a) => kaynakOzeti(a)) } },
        select: { id: true, kaynakMetin: true, ceviriMetni: true, guncellendi: true },
      });
      duzeltmeler = satirlar
        .filter((s) => istenen.has(s.kaynakMetin))
        .map((s) => ({ id: s.id, kaynak: s.kaynakMetin, ceviri: s.ceviriMetni, guncellendi: s.guncellendi }));
    }
    return { anahtarlar, duzeltmeler, duzeltmeAcik: await this.erisim.yetenekAcikMi(k.firmaId, Yetenek.CEVIRI) };
  }

  async kaydet(
    k: Kimlik,
    eposta: string,
    g: { quoteId: string; kaynak: string; ceviri: string; hedefDil?: string },
  ): Promise<DuzeltmeKaydi> {
    if (!(await epostaDogrulandiMi(this.prisma, k.userId))) throw duzeltmeReddi('EPOSTA_DOGRULANMADI');
    const hedefDil = g.hedefDil ?? 'en';
    const kaynak = ceviriAnahtari(g.kaynak);
    const ceviri = String(g.ceviri ?? '').trim();
    if (!kaynak || !ceviri) throw duzeltmeReddi('CEVIRI_BOS');
    if (dokunulmazMi(kaynak)) throw duzeltmeReddi('OLCU_KODU_CEVRILMEZ');
    if (!ceviriGuvenliMi(kaynak, ceviri)) throw duzeltmeReddi('CEVIRI_GUVENSIZ');
    // R1-B1: başka firmanın teklifi 404 (kayitliIcerik firmaya kapsamlı).
    const { icerik } = await this.kota.kayitliIcerik(k, g.quoteId);
    if (!icerik.metinler.includes(kaynak)) throw duzeltmeReddi('KAYNAK_TEKLIFTE_YOK');
    const ozet = kaynakOzeti(kaynak);
    const anahtar = { firmaId_hedefDil_kaynakOzeti: { firmaId: k.firmaId, hedefDil, kaynakOzeti: ozet } };

    return this.prisma.$transaction(async (tx) => {
      await this.firmaKilidi(tx, k.firmaId);
      await this.gunlukTavan(tx, k.firmaId);
      const onceki = await tx.ceviriDuzeltmesi.findUnique({ where: anahtar, select: { id: true, ceviriMetni: true } });
      if (!onceki && (await tx.ceviriDuzeltmesi.count({ where: { firmaId: k.firmaId } })) >= FIRMA_DUZELTME_TAVANI) {
        throw duzeltmeReddi('DUZELTME_TAVANI');
      }
      if (onceki && onceki.ceviriMetni === ceviri) return { id: onceki.id, kaynak, ceviri, degisti: false };

      const kayit = await tx.ceviriDuzeltmesi.upsert({
        where: anahtar,
        create: {
          firmaId: k.firmaId, hedefDil, kaynakMetin: kaynak, kaynakOzeti: ozet, ceviriMetni: ceviri,
          olusturanId: k.userId, guncelleyenId: k.userId,
        },
        update: { ceviriMetni: ceviri, guncelleyenId: k.userId },
        select: { id: true },
      });
      await tx.ceviriDuzeltmeOlayi.create({
        data: {
          firmaId: k.firmaId,
          userId: k.userId,
          kullaniciEposta: eposta,
          tip: onceki ? 'guncellendi' : 'eklendi',
          duzeltmeId: kayit.id,
          hedefDil,
          kaynakMetin: kaynak,
          oncekiDeger: onceki?.ceviriMetni ?? null,
          yeniDeger: ceviri,
          ortakDeger: await this.ortakDeger(tx, kaynak, hedefDil),
        },
      });
      return { id: kayit.id, kaynak, ceviri, degisti: true };
    });
  }

  /**
   * Firma karşılığını kaldırır; ortak karşılık okumada yeniden görünür.
   * Kayıt kilit ALTINDA okunur: eşzamanlı ikinci DELETE boş okuma görür ve
   * olay bırakmadan 404 döner (R1-D8). Başka firmanın kimliği de 404.
   */
  async kaldir(k: Kimlik, eposta: string, id: string): Promise<{ kaldirildi: true; kaynak: string }> {
    if (!(await epostaDogrulandiMi(this.prisma, k.userId))) throw duzeltmeReddi('EPOSTA_DOGRULANMADI');
    return this.prisma.$transaction(async (tx) => {
      await this.firmaKilidi(tx, k.firmaId);
      await this.gunlukTavan(tx, k.firmaId);
      const kayit = await tx.ceviriDuzeltmesi.findFirst({
        where: { id, firmaId: k.firmaId },
        select: { id: true, hedefDil: true, kaynakMetin: true, ceviriMetni: true },
      });
      if (!kayit) throw duzeltmeReddi('DUZELTME_YOK');
      await tx.ceviriDuzeltmesi.deleteMany({ where: { id, firmaId: k.firmaId } });
      await tx.ceviriDuzeltmeOlayi.create({
        data: {
          firmaId: k.firmaId,
          userId: k.userId,
          kullaniciEposta: eposta,
          tip: 'kaldirildi',
          duzeltmeId: kayit.id,
          hedefDil: kayit.hedefDil,
          kaynakMetin: kayit.kaynakMetin,
          oncekiDeger: kayit.ceviriMetni,
          yeniDeger: null,
          ortakDeger: await this.ortakDeger(tx, kayit.kaynakMetin, kayit.hedefDil),
        },
      });
      return { kaldirildi: true as const, kaynak: kayit.kaynakMetin };
    });
  }

  /** Mevcut desen (ceviri-kota.servisi.ts): `void` dönen kilit `::text` ile okunur. */
  private async firmaKilidi(tx: Islem, firmaId: string): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ceviri-duzeltme:${firmaId}`}))::text AS kilit`;
  }

  private async gunlukTavan(tx: Islem, firmaId: string): Promise<void> {
    const yazim = await tx.ceviriDuzeltmeOlayi.count({
      where: { firmaId, olusturuldu: { gte: turkiyeGunBaslangici(this.saat()) } },
    });
    if (yazim >= GUNLUK_DUZELTME_TAVANI) throw duzeltmeReddi('DUZELTME_GUNLUK_TAVAN');
  }

  /** Denetim izi için ortak katmanın o anki karşılığı — İSTEMCİYE DÖNMEZ. */
  private async ortakDeger(tx: Islem, kaynak: string, hedefDil: string): Promise<string | null> {
    const t = await tx.translation.findUnique({
      where: { sourceText_targetLang: { sourceText: kaynak, targetLang: hedefDil } },
      select: { translatedText: true },
    });
    return t?.translatedText ?? null;
  }
}
