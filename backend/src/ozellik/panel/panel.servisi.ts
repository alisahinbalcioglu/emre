import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../altyapi/db/prisma.service';
import { teklifKosulu, type TeklifKimligi } from '../../altyapi/auth/kimlik';
import { etkinHesapKosulu } from '../firma/uyelik-kurallari';

/**
 * PANO OZETI — ana sayfadaki dort sayac (t.3, 21.09.2026).
 *
 * ── NEDEN YENI BIR UC ────────────────────────────────────────────────────
 * Pano bu dort sayiyi `GET /admin/stats` ucundan okuyordu. O ucun iki ayri
 * kusuru vardi ve ikisi de EKRANDA gorunuyordu:
 *   (a) Uc `@Roles('admin')` ile korunuyor; musteri oturumunda cagrilamadigi
 *       icin pano `stats`i null birakip DORT KUTUYU HIC CIZMIYORDU.
 *   (b) Admin oturumunda ise `getStats()` SISTEMIN TAMAMINI sayiyor
 *       (`material.count()`, `quote.count()` — suzgec yok). Yonetici kendi
 *       panosunda "10 Teklif / 21.723 Malzeme" gorup bunu KENDI sayisi
 *       saniyordu.
 * `/admin/stats` yerinde kalir (yonetici panosu `app/admin/stats/page.tsx`
 * onu kullanmaya devam eder); musteri panosu BURAYI okur.
 *
 * ── SAYILAR BASKA EKRANLARLA AYNI OLMAK ZORUNDA ──────────────────────────
 * Bu ucun tek isi, kullanicinin BASKA SAYFALARDA gordugu listelerin adedini
 * vermektir. Bu yuzden her sayi, o listeyi ureten sorgunun AYNI kapsamini
 * kullanir — ikiz kural yazilmaz:
 *   teklifSayisi   → `quotes.service.ts` `findAll` → `teklifKosulu(k)` (Teklifler;
 *                    23.09: "Son teklifler" izni kapali uyede YALNIZ kendi teklifleri)
 *   malzemeSayisi  → `library.service.ts:37`  `where: { firmaId }` (Kutuphanem)
 *   markaSayisi    → `library.service.ts:55`  ayni sorgu + `distinct: brandId`
 *   kullaniciSayisi→ `uyelik-kurallari.ts:31` `etkinHesapKosulu()` (Ekip)
 * Sonuncusu ICERI ALINIR, KOPYALANMAZ: o dosyanin kendi yorumu "TEK TANIM:
 * koltuk sayimi, kisi sinirinin sirasi ve ekip listesi bunu kullanir" diyor.
 * Ikinci bir "etkin kullanici" tanimi yazmak, Ekip sayfasiyla panonun bir
 * gun farkli sayi soylemesi demekti — bugun duzeltilen kusurun ta kendisi.
 *
 * ── KAPSAM TEK YERDE ─────────────────────────────────────────────────────
 * `kapsam` TEK degiskendir ve dort sorgunun dordune de girer. Dort ayri
 * yere `firmaId` yazsaydik, birini unutmak capraz-firma sizintisi olurdu ve
 * mutasyon sinamasi da tek bir noktayi hedefleyemezdi.
 *
 * ⚠ `kimlikCoz` firmasiz hesabi 403 ile durdurur (bkz. `auth/kimlik.ts`):
 * Prisma'da `firmaId: undefined` kosulu SESSIZCE DUSER ve butun firmalarin
 * satirlari sayilirdi. Kapi controller'da, cagri buraya ulasmadan once.
 */
@Injectable()
export class PanelServisi {
  constructor(private prisma: PrismaService) {}

  async ozet(k: TeklifKimligi): Promise<{
    teklifSayisi: number;
    malzemeSayisi: number;
    markaSayisi: number;
    kullaniciSayisi: number;
  }> {
    const kapsam = { firmaId: k.firmaId };

    const [teklifSayisi, malzemeSayisi, markaSatirlari, kullaniciSayisi] =
      await Promise.all([
        // 23.09: teklif sayisi LISTEYLE ayni kosuldan (`teklifKosulu`) —
        // izni kapali uye panoda firmanin teklif adedini de gormez.
        this.prisma.quote.count({ where: teklifKosulu(k) }),
        this.prisma.userLibrary.count({ where: kapsam }),
        // Marka adedi `findLibraryBrands` ile AYNI sorgudur (distinct brandId).
        // `groupBy` daha kisa olurdu ama o zaman Kutuphanem'deki marka listesi
        // ile bu sayi iki FARKLI sorgudan gelirdi.
        this.prisma.userLibrary.findMany({
          where: kapsam,
          distinct: ['brandId'],
          select: { brandId: true },
        }),
        // Ekip sayfasindaki `koltuk.aktif` ile ayni kume: firmadaki
        // silinmemis + etkin hesaplar. Banli/kapatilmis hesap SAYILMAZ.
        this.prisma.user.count({ where: { ...kapsam, ...etkinHesapKosulu() } }),
      ]);

    return {
      teklifSayisi,
      malzemeSayisi,
      markaSayisi: markaSatirlari.length,
      kullaniciSayisi,
    };
  }
}
