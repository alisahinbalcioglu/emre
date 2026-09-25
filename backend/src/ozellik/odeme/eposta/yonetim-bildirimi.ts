import { Logger } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { EpostaTalebi } from './eposta.servisi';

/* ═══════════════════════════════════════════════════════════════════════════
   YÖNETİM BİLDİRİMİ — TEK ADRES ÇÖZÜMÜ, TEK GÖNDERİM (24.09.2026)
   ═══════════════════════════════════════════════════════════════════════════

   Emre: "faturalar ve uyarılar vs. e posta olarak gitmeli".

   ÖLÇÜLEN KUSUR: yönetici uyarıları YALNIZ `YONETIM_EPOSTA` ortam
   değişkenine gidiyordu ve canlıda bu değişken BOŞ. Çift tahsilat, iyzico
   iptalinin düşmesi ve 5 denemede kesilemeyen fatura uyarıları kimseye
   ulaşmıyordu. Fatura uyarısı günlüğe bile düşmüyordu (sessiz `return`).
   İki servis adres yokken FARKLI davranıyordu (biri günlüğe yazıyordu).

   ADRES SIRASI:
     1. `YONETIM_EPOSTA` — doluysa YALNIZ o (virgül/noktalı virgülle birden çok).
     2. Etkin yönetici hesaplarının GİRİŞ e-postası (`role=admin`,
        `status=active`, silinmemiş, e-postası DOĞRULANMIŞ). Yönetici girişi
        her seferinde bu adrese gelen kodla yapılır (23.09 kararı): adresin
        çalıştığı her girişte kanıtlanıyor. Değişken tanımlanmadan da
        uyarılar kurucuya ulaşır. Kapatılan hesap alıcı OLAMAZ: kapatma
        `deletedAt`i hep yazar, adres de anonimleşir.

   ⚠ YER TUTUCU ALAN ADI ADRES SAYILMAZ (24.09 olayı: canlıya
   `YONETIM_EPOSTA=ADRES@ORNEK.COM` yazıldı ve ~6 dk kaldı). NES kesim talebi
   alıcının TCKN/VKN/adresini taşıdığı için yanlış adres KVKK sızıntısıdır;
   `ornek.com`, `example.*`, `.invalid/.example/.localhost` elenir.

   İKİ KİP — sözleşmeleri FARKLI, bilerek:
     · `yonetimeYaz`       : best-effort. Uyarı asıl işi (onay, tahsilat,
                              kuyruk) DÜŞÜRMEZ. Gönderilemezse içerik HATA
                              günlüğüne yazılır; sessiz kayıp yok.
     · `yonetimeYazKritik` : gönderilemezse FIRLATIR. Fatura kesim talebi
                              bununla gider: gitmediyse kuyruk yeniden denesin,
                              satır sessizce KESILDI olmasın.
   ═══════════════════════════════════════════════════════════════════════════ */

export type YonetimAdresKaynagi = 'ortam' | 'yonetici-hesaplari' | 'yok';

export interface YonetimAdresleri {
  adresler: string[];
  kaynak: YonetimAdresKaynagi;
}

/** Bildirimin gövdesi — `EpostaTalebi`nin alıcısız hâli. */
export type YonetimBildirimi = Omit<EpostaTalebi, 'kime'>;

/** Adresleri okuyacak EN DAR Prisma yüzeyi (testler bellek-içi taklit verir). */
export interface YoneticiOkuyucu {
  user: {
    findMany(arg: {
      where: { role: Role; status: UserStatus; deletedAt: null; emailVerified: true };
      select: { email: true };
      orderBy: { createdAt: 'asc' };
    }): Promise<Array<{ email: string | null }>>;
  };
}

/** Gönderim için EN DAR e-posta yüzeyi. */
export interface YonetimPostacisi {
  yapilandirildiMi(): boolean;
  gonder(t: EpostaTalebi): Promise<void>;
  gonderKritik(t: EpostaTalebi): Promise<void>;
}

export interface YonetimBildirimBaglami {
  prisma: YoneticiOkuyucu;
  /** Nest enjekte etmezse boş kalabilir — o hâl de günlüğe yazılır. */
  eposta?: YonetimPostacisi | null;
  logger: Logger;
}

const AYRAC = /[,;\s]+/;

/**
 * Yer tutucu / ayrılmış alan adları (RFC 2606 + depodaki örnek adresler).
 * `.test` BİLEREK serbest: testlerin fikstür alanıdır, canlıda yazılmaz.
 */
const YER_TUTUCU_ALAN = /(^|\.)(ornek\.com(\.tr)?|example\.(com|net|org))$|\.(invalid|example|localhost)$/;

/** `ad@alan` biçiminde ve yer tutucu alan adı DEĞİLSE adrestir. */
export function gercekAdresMi(adres: string): boolean {
  const at = adres.lastIndexOf('@');
  if (at <= 0 || at === adres.length - 1) return false;
  return !YER_TUTUCU_ALAN.test(adres.slice(at + 1).toLowerCase());
}

/**
 * Adres olmayan parça (ör. "@"sız ya da yer tutucu alan adlı) SAYILMAZ,
 * harf farkıyla ikizler tek adrese iner.
 * ⚠ Küçültme locale'SİZ: e-posta adresi Türkçe metin değildir
 * ("I" → "ı" dönüşümü adresi bozardı).
 */
function tekillestir(adaylar: Array<string | null | undefined>): string[] {
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const aday of adaylar) {
    const adres = aday?.trim();
    if (!adres || !gercekAdresMi(adres)) continue;
    const anahtar = adres.toLowerCase();
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    sonuc.push(adres);
  }
  return sonuc;
}

/** SAF — ortam değeri doluysa YALNIZ o; değilse yönetici hesapları. */
export function yonetimAdresleriniCoz(
  ortamDegeri: string | null | undefined,
  yoneticiEpostalari: Array<string | null | undefined>,
): YonetimAdresleri {
  const ortam = tekillestir((ortamDegeri ?? '').split(AYRAC));
  if (ortam.length) return { adresler: ortam, kaynak: 'ortam' };
  const hesaplar = tekillestir(yoneticiEpostalari);
  if (hesaplar.length) return { adresler: hesaplar, kaynak: 'yonetici-hesaplari' };
  return { adresler: [], kaynak: 'yok' };
}

/**
 * Ortam doluysa kullanıcı tablosuna HİÇ gitmez. Hesap okuması hata verirse
 * FIRLATIR — best-effort kip bunu yakalayıp günlüğe yazar.
 */
export async function yonetimAdresleri(prisma: YoneticiOkuyucu): Promise<YonetimAdresleri> {
  const ortam = yonetimAdresleriniCoz(process.env.YONETIM_EPOSTA, []);
  if (ortam.kaynak === 'ortam') return ortam;
  const yoneticiler = await prisma.user.findMany({
    where: { role: Role.admin, status: UserStatus.active, deletedAt: null, emailVerified: true },
    select: { email: true },
    orderBy: { createdAt: 'asc' },
  });
  return yonetimAdresleriniCoz(undefined, yoneticiler.map((y) => y.email));
}

const ADRES_YOK = 'YONETIM_EPOSTA tanimli degil ve etkin yonetici hesabi yok';

function hataMetni(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * BEST-EFFORT: gönderildiyse `true`. Adres/servis/SMTP yoksa ya da gönderim
 * düşerse `false` döner ve içeriğin TAMAMINI HATA günlüğüne yazar — hiçbir
 * koşulda FIRLATMAZ (beklenmedik hata dahil: uyarı asıl işi düşürmemeli).
 */
export async function yonetimeYaz(b: YonetimBildirimBaglami, t: YonetimBildirimi): Promise<boolean> {
  const icerik = () => `${t.konu} — ${t.paragraflar.join(' | ')}`;
  try {
    let adres: YonetimAdresleri;
    let engel: string | null = null;
    try {
      adres = await yonetimAdresleri(b.prisma);
      if (!adres.adresler.length) engel = ADRES_YOK;
    } catch (e) {
      adres = { adresler: [], kaynak: 'yok' };
      engel = `yonetici hesaplari okunamadi (${hataMetni(e)}) ve YONETIM_EPOSTA tanimli degil`;
    }
    if (!engel && !b.eposta) engel = 'e-posta servisi yok';
    if (!engel && !b.eposta?.yapilandirildiMi()) engel = 'SMTP yapilandirilmamis';
    if (engel || !b.eposta) {
      b.logger.error(`YONETICI BILDIRIMI GONDERILEMEDI (${engel}): ${icerik()}`);
      return false;
    }
    await b.eposta.gonder({ ...t, kime: adres.adresler.join(', ') });
    return true;
  } catch (e) {
    // Gönderim düştü: konu TEK BAŞINA yetmez — satır kimliği ve tutar
    // paragraflarda; posta yolu kapalıyken tek kayıt bu günlüktür (inceleme M1).
    b.logger.error(`YONETICI BILDIRIMI GONDERILEMEDI (${hataMetni(e)}): ${icerik()}`);
    return false;
  }
}

/**
 * KRİTİK: gönderilemezse FIRLATIR (adres yok, servis yok, SMTP yok, gönderim
 * hatası, hesap okuma hatası). Çağıran yeniden denemeye bırakır.
 */
export async function yonetimeYazKritik(b: YonetimBildirimBaglami, t: YonetimBildirimi): Promise<void> {
  const adres = await yonetimAdresleri(b.prisma);
  if (!adres.adresler.length) throw new Error(`Yonetim adresi yok: ${ADRES_YOK}`);
  if (!b.eposta) throw new Error('Yonetim bildirimi gonderilemiyor: e-posta servisi yok');
  await b.eposta.gonderKritik({ ...t, kime: adres.adresler.join(', ') });
}
