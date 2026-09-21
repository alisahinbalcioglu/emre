/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — ZORUNLU KURUMSAL GIRIS YUKLEMLERI (§5.10, V7)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  "Bu kisi artik parolayla giremez mi?" sorusunun TEK cevabi burasidir.
 *  BES ikiz yol ayni yuklemi cagirir (`login`, `register`, `sifirlamaIste`,
 *  `sifirla`, `davetKabul`); her yol kendi kosulunu yazsaydi biri gunun
 *  birinde `role === 'admin'` muafiyetini ya da `ETKIN` kontrolunu unuturdu
 *  (bu depoda olculmus hata sinifi: "ikizi unutma").
 *
 *  ⚠ IKI AYRI SORU, IKI AYRI YUKLEM:
 *   · `kurumsalZorunluMu(prisma, user)`  — KISI ekseni. Kullanicinin kendi
 *     e-posta alan adi + kendi firmasi + kendi rolu. `login`, `sifirlamaIste`,
 *     `sifirla`, `davetKabul` (davet edilen kisi) kullanir.
 *   · `alanAdiZorunluMu(prisma, eposta)` — ALAN ADI ekseni. Henuz KULLANICI
 *     YOK (`register`): yalnizca adresin alan adina bakilir. Kisi eksenli
 *     yuklem burada kullanilamazdi — kaydolmamis kisinin `firmaId`'si yok ve
 *     "firma esitligi" kosulu her zaman dogru sayilip zorunlulugu SESSIZCE
 *     atlardi (gölge parolali hesap acma yolu).
 *
 *  ⚠ `role === 'admin'` HER IKISINDE muaf: platform yoneticisi kurumsal
 *  girisi KULLANAMAZ (§5.9) — zorunluluk ona uygulanirsa hicbir yoldan
 *  giremez.
 */
import { alanAdiNormalize, epostaAlanAdi } from './saglayici-kurallari';

/** Yuklemlerin ihtiyac duydugu en dar Prisma yuzeyi (sahte Prisma ile olculur). */
export type ZorunlulukPrisma = {
  dogrulanmisAlanAdi: { findUnique(args: any): Promise<any> };
};

/** `kurumsalZorunluMu`nun okudugu en dar kullanici sekli. */
export type ZorunlulukKullanicisi = {
  email: string;
  role?: string | null;
  firmaId?: string | null;
};

/**
 * Bu ALAN ADI icin zorunlu kurumsal giris acik mi (ve hangi firmada)?
 *
 * Tek PK sorgusu (`DogrulanmisAlanAdi.alanAdi`) + ilisik saglayici. Kullanici
 * tablosuna BAKMAZ — bu yuzden numaralandirma yuzeyi yoktur (§5.12).
 */
async function alanAdiKaydi(
  prisma: ZorunlulukPrisma,
  eposta: string | null | undefined,
): Promise<{ firmaId: string; saglayiciId: string; tip: string; zorunlu: boolean; etkin: boolean } | null> {
  const alan = alanAdiNormalize(epostaAlanAdi(eposta));
  if (!alan) return null;
  const satir = await prisma.dogrulanmisAlanAdi.findUnique({
    where: { alanAdi: alan },
    select: {
      firmaId: true,
      saglayiciId: true,
      saglayici: { select: { id: true, tip: true, durum: true, zorunlu: true } },
    },
  });
  const s = satir?.saglayici;
  if (!satir || !s) return null;
  return {
    firmaId: satir.firmaId,
    saglayiciId: s.id,
    tip: s.tip,
    zorunlu: s.zorunlu === true,
    etkin: s.durum === 'ETKIN',
  };
}

/**
 * KISI EKSENI (§5.10): bu kullanici parolayla giremez mi?
 *
 * DORT kosulun HEPSI: alan adi dogrulanmis · saglayici ETKIN · `zorunlu` ·
 * kullanicinin firmasi alan adinin firmasi. Sonuncusu olmasa, baska bir
 * firmanin alan adiyla kayitli bir kisi o firmanin ayarindan kilitlenirdi.
 */
export async function kurumsalZorunluMu(
  prisma: ZorunlulukPrisma,
  user: ZorunlulukKullanicisi,
): Promise<boolean> {
  if (user.role === 'admin') return false;
  const kayit = await alanAdiKaydi(prisma, user.email);
  if (!kayit) return false;
  return kayit.etkin && kayit.zorunlu && !!user.firmaId && user.firmaId === kayit.firmaId;
}

/**
 * ALAN ADI EKSENI (`register`, §5.10): bu adreste YENI parolali hesap
 * acilabilir mi? Kullanici henuz YOK; firma esitligi sorulamaz.
 */
export async function alanAdiZorunluMu(
  prisma: ZorunlulukPrisma,
  eposta: string | null | undefined,
): Promise<boolean> {
  const kayit = await alanAdiKaydi(prisma, eposta);
  return !!kayit && kayit.etkin && kayit.zorunlu;
}

/**
 * Giris ekraninin kesif ucu (§5.12) ve davet bilgisi icin: bu alan adinda
 * kurumsal giris VAR MI? `zorunlu` degeri de doner ama ETKIN olmayan
 * saglayici HIC gorunmez (bilinmeyen alan adiyla AYNI yanit).
 */
export async function alanAdiKurumsalGiris(
  prisma: ZorunlulukPrisma,
  eposta: string | null | undefined,
): Promise<{ saglayiciId: string; tip: string; zorunlu: boolean } | null> {
  const kayit = await alanAdiKaydi(prisma, eposta);
  if (!kayit || !kayit.etkin) return null;
  return { saglayiciId: kayit.saglayiciId, tip: kayit.tip, zorunlu: kayit.zorunlu };
}

/** V7 reddinin TEK govdesi — bes ikiz yol ayni kodu ve ayni cumleyi doner. */
export const KURUMSAL_GIRIS_ZORUNLU_GOVDE = {
  kod: 'KURUMSAL_GIRIS_ZORUNLU',
  mesaj:
    'Şirketiniz kurumsal giriş kullanıyor; giriş ekranında ' +
    '"Şirket hesabımla giriş yap" düğmesini kullanın.',
} as const;
