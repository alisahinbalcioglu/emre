import { HavaleDurumu, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../altyapi/db/prisma.service';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HAVALE DURUM KÜMELERİ — tek tanım (28.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Havale yolunun (`havale.servisi.ts`) DIŞINDA da sorulan iki soru:
 *   · "bu abonelikte ödenmeyi bekleyen havale teklifi var mı?" — erişim
 *     kararının vitrin şeridi (`ErisimServisi.karar`) ve kart satın alma
 *     kapısı (`yeniAbonelikEngeli`: `baslat` + paket kartları);
 *   · "bu abonelik hiç havaleyle ödendi mi?" — erişim kararı.
 *  Koşullar burada DURUR: havale servisi, erişim ve satın alma aynı kümeyi
 *  okur; kopyalanan koşul bir gün ayrışırdı (ikizi unutma).
 *  SAF: Prisma koşulu + tek sayım; servis bağımlılığı yok (erişim servisi
 *  havale servisini içe aktaramaz — döngü).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ONAYLANABİLİR HAVALE: onay bekleyen durumda VE hiç onaylanmamış. Durum
 * yazan üç yol (onayın sahiplenmesi, "fatura kesildi", iptal) ve yönetim
 * listesi (`bekleyenler`) AYNI koşulu okur: listede görünen satır
 * onaylanabilir olandır. `onaylandi`yı yalnız onay yazar ve hiçbir yol
 * silmez: durumu 25.09 öncesi "fatura kesildi" kusuruyla geri çekilmiş
 * onaylı satır da onaylı sayılır. KAPALI liste — şemaya eklenen yeni bir
 * durum kendiliğinden onaylanabilir OLMAZ.
 *
 * 28.09: "BEKLEYEN HAVALE TEKLİFİ" de budur — müşteri ödemesi beklenen,
 * yöneticinin onaylayabileceği satır.
 */
export const ONAYLANABILIR: Prisma.HavaleOdemesiWhereInput = {
  durum: {
    in: [
      HavaleDurumu.TEKLIF,
      HavaleDurumu.FATURA_KESILDI,
      HavaleDurumu.ODEME_BEKLENIYOR,
    ],
  },
  onaylandi: null,
};

/**
 * HİÇ ONAYLANMIŞ havale: ONAYLANDI ya da onay anı yazılmış (durumu 25.09
 * öncesi kusurla geri çekilmiş onaylı satır da ödenmiştir). IPTAL ne bu
 * kümede ne `ONAYLANABILIR`da.
 */
export const ONAYLANMIS: Prisma.HavaleOdemesiWhereInput = {
  OR: [{ durum: HavaleDurumu.ONAYLANDI }, { onaylandi: { not: null } }],
};

/** Kök istemci ya da işlemin `tx`i — yalnız havale tablosu okunur. */
type HavaleOkuyucu = Pick<PrismaService, 'havaleOdemesi'>;

/** Abonelikte ödenmeyi bekleyen (onaylanabilir) havale teklifi var mı? */
export async function bekleyenHavaleVarMi(db: HavaleOkuyucu, abonelikId: string): Promise<boolean> {
  return (await db.havaleOdemesi.count({ where: { abonelikId, ...ONAYLANABILIR } })) > 0;
}

/** Abonelik hiç havaleyle ödendi mi (en az bir onaylanmış havale)? */
export async function onaylanmisHavaleVarMi(db: HavaleOkuyucu, abonelikId: string): Promise<boolean> {
  return (await db.havaleOdemesi.count({ where: { abonelikId, ...ONAYLANMIS } })) > 0;
}
