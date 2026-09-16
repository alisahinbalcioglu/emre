import { createHash } from 'crypto';
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
