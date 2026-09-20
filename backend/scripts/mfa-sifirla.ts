/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SON YONETICININ IKI ADIMLI GIRISINI SIFIRLA  (Faz 7 F2b · §4.6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU BETIK F2b TURUNDA KOSULMADI. Varsayilan mod PROVA'dir: hicbir sey
 *  yazmaz, yalniz "ne olacak" bilgisini basar. `--uygula` yazar.
 *
 *  ── NE ISE YARAR ─────────────────────────────────────────────────────────
 *  Yonetici hesaplarinda iki adimli giris ZORUNLU. Tek yonetici telefonunu
 *  VE kurtarma kodlarini kaybederse panele girecek kimse kalmaz — panelden
 *  sifirlama da mumkun olmaz (kendi MFA'sini sifirlayamaz, §4.4). Bu betik
 *  o kilitlenmenin TEK cikis yoludur ve SUNUCUDA, elle kosulur.
 *
 *  ── NE YAPAR ─────────────────────────────────────────────────────────────
 *  `mfaTemizlemeVerisi` (servis ve yonetici paneliyle AYNI saf fonksiyon):
 *  sir, acik damgasi, kaynak, adim, bekleyen sir, sayac ve kilit temizlenir;
 *  kurtarma kodlari silinir; `passwordChangedAt` damgalanir (eldeki
 *  token'lar oler). Denetim satiri `YoneticiOlayi`na `sunucu-betigi`
 *  aktoruyle yazilir.
 *
 *  ⚠ PAROLAYA DOKUNMAZ. Kullanici yine kendi parolasiyla girer; yalniz
 *  ikinci adim kalkar ve bir sonraki girisinde zorunlu kurulum sihirbazina
 *  duser.
 *
 *  ── KULLANIM ─────────────────────────────────────────────────────────────
 *    docker compose exec -T backend npm run mfasifirla -- --eposta a@b.com
 *    docker compose exec -T backend npm run mfasifirla -- --eposta a@b.com --uygula
 */
import { PrismaClient } from '@prisma/client';
import { mfaTemizlemeVerisi } from '../src/altyapi/auth/mfa/mfa-karari';

export type BetikKullanicisi = {
  id: string;
  email: string;
  role: string;
  deletedAt: Date | null;
  mfaAcikAt: Date | null;
};

export type SifirlamaPlani =
  | { yapilacak: false; neden: string }
  | { yapilacak: true; id: string; email: string; role: string };

/**
 * SAF — bu kullanicinin MFA'si sifirlanacak mi?
 *
 * ⚠ ROL SUZGECI YOK (bilincli): betik "son yonetici" senaryosu icin var
 * ama normal bir kullanicinin kilitlenmesinde de calismali; panel yolu
 * varken bu betik zaten kosulmaz. Sessiz atlama YOK: her ret GEREKCELIDIR.
 */
export function sifirlamaPlaniUret(
  kullanici: BetikKullanicisi | null,
  eposta: string,
): SifirlamaPlani {
  if (!kullanici) return { yapilacak: false, neden: `Kullanici bulunamadi: ${eposta}` };
  if (kullanici.deletedAt) {
    return { yapilacak: false, neden: 'Hesap kapatilmis; sifirlama anlamsiz.' };
  }
  if (!kullanici.mfaAcikAt) {
    return { yapilacak: false, neden: 'Bu hesapta iki adimli giris zaten acik degil.' };
  }
  return {
    yapilacak: true,
    id: kullanici.id,
    email: kullanici.email,
    role: kullanici.role,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const uygula = argv.includes('--uygula');
  const i = argv.indexOf('--eposta');
  const eposta = i >= 0 ? (argv[i + 1] ?? '').trim().toLowerCase() : '';
  if (!eposta) {
    console.log('HATA: --eposta <adres> verilmeli. Hicbir sey yazilmadi.');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const kullanici = (await prisma.user.findFirst({
      where: { email: eposta },
      select: { id: true, email: true, role: true, deletedAt: true, mfaAcikAt: true },
    })) as BetikKullanicisi | null;

    const plan = sifirlamaPlaniUret(kullanici, eposta);
    if (plan.yapilacak === false) {
      console.log(`DURDU: ${plan.neden}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      uygula
        ? 'IKI ADIMLI GIRIS SIFIRLAMA — UYGULANIYOR'
        : 'IKI ADIMLI GIRIS SIFIRLAMA — PROVA (hicbir sey yazilmadi)',
    );
    console.log(`  Hedef : ${plan.email} (${plan.role})`);
    console.log('  Etki  : sir + kurtarma kodlari silinir, oturumlar kapanir.');

    if (!uygula) {
      console.log('\nPROVA MODU — uygulamak icin: -- --eposta <adres> --uygula\n');
      return;
    }

    const simdi = new Date();
    // ⚠ TEK TRANSACTION: kodlar silinip alanlar yazilmazsa hesap "MFA acik
    // ama kurtarma kodu yok" durumunda kalirdi (geri donusu kullanici
    // tarafindan IMKANSIZ).
    await prisma.$transaction(async (tx) => {
      await tx.mfaKurtarmaKodu.deleteMany({ where: { userId: plan.id } });
      await tx.user.update({
        where: { id: plan.id },
        data: mfaTemizlemeVerisi(simdi),
      });
      await tx.yoneticiOlayi.create({
        data: {
          yoneticiId: 'sunucu-betigi',
          yoneticiEpsta: 'sunucu-betigi',
          hedefKullaniciId: plan.id,
          hedefEposta: plan.email,
          tip: 'mfa.sifirlandi',
          oncekiDeger: 'acik',
          yeniDeger: 'kapali',
        },
      });
    });
    console.log(`\nUYGULANDI: ${plan.email} icin iki adimli giris sifirlandi.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

// ⚠ Testler bu dosyayi SAF fonksiyon icin import eder; `main` yalniz
// dogrudan calistirildiginda kosar.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
