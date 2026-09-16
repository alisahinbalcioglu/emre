/**
 * E-POSTA DOĞRULANDI MI — TEK OKUMA YERİ (Faz 6.9, 16.09.2026).
 *
 * Çeviri kotası ayırması (`CeviriKotaServisi`) ve firma çeviri düzeltmesi
 * (`CeviriDuzeltmeServisi`) aynı kapıyı sorar. 14.09-15.09 arası bu okuma
 * kota servisinin private metoduydu; ikinci tüketici aynı sorguyu kopyalasaydı
 * kapılardan biri bir gün başka alana (ör. `emailVerifiedAt`) bakıp ayrışırdı.
 * `backend/src/ozellik` altında `emailVerified` okuması YOKTUR (K7 kaynak kapısı).
 *
 * Kayıt yoksa ya da alan `true` değilse doğrulanmamış sayılır (sessiz geçiş yok).
 */
export async function epostaDogrulandiMi(
  prisma: { user: { findUnique: (a: { where: { id: string }; select: { emailVerified: true } }) => Promise<{ emailVerified: boolean } | null> } },
  userId: string,
): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  return u?.emailVerified === true;
}
