/**
 * TEKLIF SATIS DURUMU — etiket ve rozet renginin TEK KAYNAGI (FAZ 4.6).
 *
 * ⚠ NEDEN AYRI DOSYA: durumu hem liste (`quotes/page.tsx`) hem detay ekrani
 * hem de ileride dashboard gosterecek. Etiketleri her ekranda yeniden yazmak
 * bu depoda tekrarlayan "ikiz" hata sinifidir — biri guncellenip oteki geride
 * kalir (malzeme↔iscilik, iki cikti yolu, giris↔kayit ekrani...).
 *
 * ⚠ DEGERLER BACKEND ENUM'UYLA BIREBIR (`TeklifDurumu`, schema.prisma).
 * Yeni bir durum eklenirse UC yer birlikte guncellenmeli:
 *   1. `schema.prisma` enum + migration
 *   2. `TekliflerSorgusuDto.durum` @IsIn listesi (suzgec)
 *   3. `quotes.service.updateInfo` beyaz listesi (yazma)
 * ...ve burasi. Birini atlamak, durumun SESSIZCE calismamasi demektir.
 *
 * ⚠ `TASLAK` DEGERI YOK ve olmamali: bu depoda `taslak` sessionStorage'daki
 * YARIM DUZENLEME demek (`ozellik/teklif/taslak.ts`). Satis durumunun ilk
 * degeri `HAZIRLANIYOR`.
 */

export const TEKLIF_DURUMLARI = [
  'HAZIRLANIYOR',
  'GONDERILDI',
  'KAZANILDI',
  'KAYBEDILDI',
] as const;

export type TeklifDurumu = (typeof TEKLIF_DURUMLARI)[number];

type Gorunum = {
  etiket: string;
  /** `ortak/ui/badge.tsx` variant adlari — yeni renk ICAT EDILMEZ. */
  rozet: 'secondary' | 'info' | 'success' | 'destructive';
};

const GORUNUM: Record<TeklifDurumu, Gorunum> = {
  HAZIRLANIYOR: { etiket: 'Hazırlanıyor', rozet: 'secondary' },
  GONDERILDI: { etiket: 'Gönderildi', rozet: 'info' },
  KAZANILDI: { etiket: 'Kazanıldı', rozet: 'success' },
  KAYBEDILDI: { etiket: 'Kaybedildi', rozet: 'destructive' },
};

/**
 * Bilinmeyen degeri de GUVENLE karsilar: sunucuya yeni bir durum eklenip on
 * yuz guncellenmediginde ekran cokmez, ham degeri gosterir. Sessizce bos
 * birakmak, durumu "yok" gibi gosterirdi.
 */
export function teklifDurumGorunumu(durum: string | null | undefined): Gorunum {
  if (!durum) return GORUNUM.HAZIRLANIYOR;
  return GORUNUM[durum as TeklifDurumu] ?? { etiket: durum, rozet: 'secondary' };
}
