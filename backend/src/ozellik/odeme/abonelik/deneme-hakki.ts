import type { Prisma } from '@prisma/client';
import { epostaKucult } from '../../../altyapi/auth/eposta';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DENEME HAKKI — SAF KURALLAR (FAZ 6.12a, 15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  KURAL (karar K-P1): ucretsiz deneme BIR KEZ verilir. Asagidaki
 *  anahtarlardan HERHANGI BIRI daha once deneme almis bir kayitla
 *  (`DenemeKullanimi`) eslesirse hak YOKTUR:
 *    · firma
 *    · hesap e-postasi (kapatilmis hesapta kapatilanEposta — tablo kalici
 *      oldugu icin calisma aninda ayrica bakilmaz)
 *    · iyzico formuna yazilan e-posta
 *    · telefon
 *  E-posta anahtarlari CAPRAZ eslesir: bugunku hesap e-postasi gecmisteki
 *  form e-postasina da bakar (ve tersi).
 *
 *  Hakki olmayan satin alma ENGELLENMEZ, denemesiz ikiz plana gider
 *  (satinalma.servisi.ts). TC kimlik ve kart parmak izi bu turda YOK.
 *
 *  Bu dosya DB'ye DOKUNMAZ; DB sorusu `deneme-hakki.servisi.ts`de. Geriye
 *  donuk doldurmanin SQL'i (migration 20260915100000) ayni normalizeyi
 *  yeniden kurar — ikisinin ayni sonucu verdigi test:migration D blogunda
 *  olculur; birini degistiren digerini de degistirmeli.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ADIM 2 gocunun actigi miras paketlerinin kod oneki.
 *
 * Bu paketler bir TAHSILATI temsil ETMEZ: migration 20260828100000 her
 * mevcut firmaya `tutar=0`, `satistaMi=false` bir satir yazdi ki goc
 * sirasinda kimsenin erisimi kesilmesin. Dolayisiyla "zaten aboneligi var"
 * kapisi bu satirlari SAGLIKLI ABONELIK saymamalidir.
 *
 * ⚠ Burada tanimli (satinalma.servisi.ts yeniden disa acar): deneme hakki
 * servisi de miras firmayi tanimak zorunda (K-P3) ve satin alma servisini
 * import etseydi iki servis dosyasi birbirini import ederdi — Nest'in
 * kurucu parametre tipleri yukleme sirasina gore `undefined` kalabilir.
 */
export const MIRAS_ONEKI = 'miras-';

/** Paket kodu bir goc (miras) paketi mi? SAF fonksiyon. */
export function mirasPaketiMi(paketKodu: string | null | undefined): boolean {
  return !!paketKodu && paketKodu.startsWith(MIRAS_ONEKI);
}

const GMAIL_ALANLARI = new Set(['gmail.com', 'googlemail.com']);

/**
 * Deneme kaydi icin e-posta anahtari. SAF.
 *
 *   trim + ASCII kucuk harf (eposta.ts `epostaKucult`)
 *   yerel kisimda ilk '+' sonrasi atilir      ali+deneme@x.com → ali@x.com
 *   gmail.com / googlemail.com: noktalar atilir, alan gmail.com
 *                                             Ali.Veli@GoogleMail.com → aliveli@gmail.com
 *   '@' yok, yerel kisim ya da alan bos      → null (anahtar YOK, eslesme de yok)
 *
 * ⚠ Bu bir KOTUYE KULLANIM anahtaridir, adres degil: "ali+1@firma.com" ile
 * "ali@firma.com" farkli teslim adresleridir ama ayni kisinin deneme hakkini
 * iki kez kullanma yoludur. Giris/kayit eslesmesi icin KULLANILMAZ.
 */
export function denemeEpostaAnahtari(ham: string | null | undefined): string | null {
  const e = epostaKucult(ham);
  const at = e.indexOf('@');
  if (at <= 0 || at === e.length - 1) return null;
  let yerel = e.slice(0, at);
  let alan = e.slice(at + 1);
  const arti = yerel.indexOf('+');
  if (arti >= 0) yerel = yerel.slice(0, arti);
  if (GMAIL_ALANLARI.has(alan)) {
    yerel = yerel.replace(/\./g, '');
    alan = 'gmail.com';
  }
  if (!yerel) return null;
  return `${yerel}@${alan}`;
}

/**
 * Telefon anahtari: rakam disi atilir, SON 10 hane. SAF.
 *   "0533 098 36 63" / "+90 533 098 3663" / "5330983663" → "5330983663"
 * 10 haneden kisa → null (anlamli bir numara degil; eslesme URETMEZ).
 *
 * `telefonuNormalize` (satinalma.servisi.ts) ile ayni ailedir ama AMACI
 * farkli: o iyzico'nun tel bicimini uretir ve tanimadigini bozmaz; bu ise
 * farkli yazimlari TEK anahtara indirger.
 */
export function telefonAnahtari(ham: string | null | undefined): string | null {
  const rakam = String(ham ?? '').replace(/\D/g, '');
  return rakam.length >= 10 ? rakam.slice(-10) : null;
}

export interface DenemeAnahtarlari {
  epostaNormal: string | null;
  formEpostaNormal: string | null;
  telefonNormal: string | null;
}

/** Niyete ve kayda yazilan anahtarlar. SAF. */
export function denemeAnahtarlari(p: {
  hesapEposta?: string | null;
  formEposta?: string | null;
  telefon?: string | null;
}): DenemeAnahtarlari {
  return {
    epostaNormal: denemeEpostaAnahtari(p.hesapEposta),
    formEpostaNormal: denemeEpostaAnahtari(p.formEposta),
    telefonNormal: telefonAnahtari(p.telefon),
  };
}

/**
 * `DenemeKullanimi` aramasinin kosulu — TEK kaynak. SAF.
 * Anahtari null olan alan kosula GIRMEZ (null = eslesme yok; `IS NULL`
 * eslesmesi her anahtarsiz kaydi yakalardi).
 */
export function denemeKaydiKosulu(
  firmaId: string,
  a: DenemeAnahtarlari,
): Prisma.DenemeKullanimiWhereInput {
  const epostalar = [a.epostaNormal, a.formEpostaNormal].filter(
    (e): e is string => !!e,
  );
  const tekil = Array.from(new Set(epostalar));
  const kosullar: Prisma.DenemeKullanimiWhereInput[] = [{ firmaId }];
  if (tekil.length) {
    kosullar.push({ epostaNormal: { in: tekil } });
    kosullar.push({ formEpostaNormal: { in: tekil } });
  }
  if (a.telefonNormal) kosullar.push({ telefonNormal: a.telefonNormal });
  return { OR: kosullar };
}

/**
 * Deneme karari gerekcesi — on yuz metni buna gore secer.
 *   var                  → deneme verilir
 *   kullanildi           → daha once deneme alinmis (ya da miras firma):
 *                          denemesiz plan, ilk ay aninda cekilir
 *   eposta-dogrulanmadi  → deneme hakki VAR ama e-posta dogrulanmamis (K-P4):
 *                          satin alma deneme yerine gerekceli mesaj alir
 */
export type DenemeGerekcesi = 'var' | 'kullanildi' | 'eposta-dogrulanmadi';

export interface DenemeKarari {
  hak: boolean;
  gerekce: DenemeGerekcesi;
  anahtarlar: DenemeAnahtarlari;
}
