import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../altyapi/db/prisma.service';
import { ceviriAnahtari } from './ceviri-kurali';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ÇEVİRİ KATMANLARI — firma düzeltmesi ortak önbelleğin ÜSTÜNE (Faz 6.9, 16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  İki katman, karıştırılmaz (iş emri 6.9 §3):
 *    ORTAK  — `Translation`: makine çevirisi + yönetici düzeltmesi. Kimsenin
 *             malı değil; paylaşmak AI faturasını firma sayısıyla çarpmaz.
 *    FIRMA  — `CeviriDuzeltmesi`: firmanın elle yazdığı karşılık. Terminoloji
 *             firmaya özel ("ball valve" / "spherical valve").
 *
 *  Okuma sırası firma → ortak → API. Firma düzeltmesi ortağı EZER, SİLMEZ:
 *  düzeltme kaldırılınca ortak karşılık yeniden görünür. Birleştirme saf ve
 *  tek yerde (`katmanlariBirlestir`); sorgular `CeviriService.katmanliHarita`da.
 */

/** Ortak ya da firma katmanından okunan çeviri haritası. */
export interface KatmanliHarita {
  /** Prototipsiz (Object.create(null)). */
  readonly harita: Record<string, string>;
  /** Anahtar → hangi katmandan geldi. */
  readonly katman: ReadonlyMap<string, 'FIRMA' | 'ORTAK'>;
}

/** Ortak katman (`Translation`) okuma satırı (select: sourceText, translatedText). */
export interface OrtakCeviriSatiri {
  readonly sourceText: string;
  readonly translatedText: string;
}

/** Firma katmanı (`CeviriDuzeltmesi`) okuma satırı (select: kaynakMetin, kaynakOzeti, ceviriMetni). */
export interface FirmaDuzeltmeSatiri {
  readonly kaynakMetin: string;
  readonly kaynakOzeti: string;
  readonly ceviriMetni: string;
}

/**
 * Düzeltmenin tekil anahtarı: normalize kaynağın sha256'sı (hex).
 * ⚠ Ham metin değil özet: Postgres btree satır tavanı ~2,7 KB; uzun şartname
 * satırı ham metin indeksini patlatırdı. "PVC  BORU" ile "PVC BORU" aynı özet.
 */
export function kaynakOzeti(metin: unknown): string {
  return createHash('sha256').update(ceviriAnahtari(metin), 'utf8').digest('hex');
}

/**
 * İki katmanı birleştirir: önce ortak, sonra firma (firma EZER). Harita yalnız
 * istenen anahtarlar için kurulur — hiçbir yol rastgele metnin karşılığını
 * döndürmez (bakmak ≠ çevirmek ilkesi).
 *
 * Firma satırı ancak özeti istenen bir anahtarın özetiyse VE `kaynakMetin`i o
 * anahtarın kendisiyse sayılır. Özet eşleşip metin eşleşmiyorsa (bozuk ya da
 * elle yazılmış satır) YOK SAYILIR: yanlış metnin karşılığı başka bir satıra
 * yazılmasın.
 */
export function katmanlariBirlestir(
  anahtarlar: readonly string[],
  ortak: readonly OrtakCeviriSatiri[],
  firma: readonly FirmaDuzeltmeSatiri[],
): KatmanliHarita {
  const harita: Record<string, string> = Object.create(null);
  const katman = new Map<string, 'FIRMA' | 'ORTAK'>();
  const istenen = new Set(anahtarlar);
  const ozettenAnahtar = new Map<string, string>();
  for (const a of istenen) ozettenAnahtar.set(kaynakOzeti(a), a);

  for (const s of ortak) {
    if (!istenen.has(s.sourceText) || typeof s.translatedText !== 'string' || s.translatedText === '') continue;
    harita[s.sourceText] = s.translatedText;
    katman.set(s.sourceText, 'ORTAK');
  }
  for (const s of firma) {
    const anahtar = ozettenAnahtar.get(s.kaynakOzeti);
    if (anahtar === undefined || s.kaynakMetin !== anahtar) continue;
    if (typeof s.ceviriMetni !== 'string' || s.ceviriMetni === '') continue;
    harita[anahtar] = s.ceviriMetni;
    katman.set(anahtar, 'FIRMA');
  }
  return { harita, katman };
}

/** Katman sorgularının koştuğu istemci: servis ya da açık transaction. */
export type KatmanDb = PrismaService | Prisma.TransactionClient;

/**
 * İKİ KATMANIN TEK OKUMA YOLU (Emre 16.09). 16.09'a kadar sorgular yalnız
 * `CeviriService.katmanliHarita`daydı; kota artık "API'ye kaç satır gidecek"
 * sorusunu ÇAĞRIDAN ÖNCE sorduğu için aynı okumaya `CeviriKotaServisi` de
 * ihtiyaç duyar. Sorguyu iki yere kopyalamak, kotanın saydığı önbellekle
 * çevirinin kullandığı önbelleğin sessizce ayrışması demekti (kullanıcı
 * ücretlendirilir, metin zaten önbellektedir ya da tersi) — bu yüzden tek yer.
 *
 * ⚠ `firmaId` ZORUNLU: Prisma `undefined` süzgeci sessizce düşürür (kimlik.ts
 * dersi) — firma süzgeci düşerse A firmasının düzeltmesi B'nin teklifine girerdi.
 * Harita yalnız VERİLEN anahtarlar için kurulur (bakmak ≠ çevirmek).
 */
export async function katmanliHaritaOku(
  db: KatmanDb,
  metinler: readonly string[],
  hedefDil: string,
  firmaId: string,
): Promise<KatmanliHarita> {
  if (typeof firmaId !== 'string' || firmaId === '') throw new Error('katmanliHaritaOku: firmaId zorunlu');
  const benzersiz = Array.from(new Set(metinler.map((m) => ceviriAnahtari(m)).filter(Boolean)));
  if (benzersiz.length === 0) return { harita: Object.create(null), katman: new Map() };
  const [ortak, firma] = await Promise.all([
    db.translation.findMany({
      where: { targetLang: hedefDil, sourceText: { in: benzersiz } },
      select: { sourceText: true, translatedText: true },
    }),
    db.ceviriDuzeltmesi.findMany({
      where: { firmaId, hedefDil, kaynakOzeti: { in: benzersiz.map((m) => kaynakOzeti(m)) } },
      select: { kaynakMetin: true, kaynakOzeti: true, ceviriMetni: true },
    }),
  ]);
  return katmanlariBirlestir(benzersiz, ortak, firma);
}
