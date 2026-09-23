'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { icerikDurdurulsunMu, vitrinKartiGosterilsinMi, type ErisimUyarisi } from './erisim-durumu';
import { VitrinBolumKarti } from './VitrinBolumKarti';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ERISIM KAPISI — kabukta TEK durdurma noktasi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ── HANGI KUSURU KAPATIYOR (22.09.2026, olculdu) ────────────────────────
 *  Paketi olmayan (`erisimVar: false`) bir hesapta sunucu DOGRU davraniyor:
 *  `ErisimGuard` kutuphane/malzeme/teklif uclarina 403 `ABONELIK_KISITLI`
 *  donuyor. Kusur on yuzdeydi: 19 korumali sayfanin 18'i bu yaniti GENEL
 *  hata sanip kirmizi "Veriler yuklenirken bir hata olustu" bildirimi
 *  basiyordu. Kullanici sayfalar arasi gezerken, ZATEN "Aboneliginiz
 *  bulunmuyor" seridini goruyorken, ustune bir de bozukluk sanacagi bir
 *  hata goruyordu.
 *
 *  ── NEDEN BEKLIYORUZ (`loading`) ────────────────────────────────────────
 *  ⚠ BU SATIR SUSLEME DEGIL, KUSURUN KENDISI. `CapabilitiesProvider`
 *  `/auth/me`yi kendi `useEffect`inde cagirir; alt sayfalar AYNI commit'te
 *  mount olup kendi isteklerini ATAR. Karar gelmeden cocuklar cizilirse,
 *  403'ler kararin donusundan ONCE yola cikar ve kirmizi bildirim YINE
 *  gorunur — yani kapi kurulmus ama hicbir sey degismemis olurdu
 *  ("mekanizma var, baglanti yok" deseni). Bekleme TEK SEFERLIKTIR:
 *  saglayici kabukta bir kez mount olur, sonraki istemci-tarafi
 *  gezinmelerde `loading` zaten `false`tur.
 *
 *  ── METIN BURADA URETILMEZ ──────────────────────────────────────────────
 *  `AbonelikSeridi` ile AYNI kural: kullaniciya ne yazilacagina sunucu
 *  karar verir (`ErisimServisi.karar()` → `uyari`). Iki yer ayrisirsa ekran
 *  gercegi soylemez. Asagidaki sabit metin yalnizca sunucu `uyari`
 *  gondermediginde devreye girer ve CIKMAZ SOKAK BIRAKMAMAK icindir.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function ErisimKapisi({ children }: { children: ReactNode }) {
  const { erisim, kapali, loading } = useCapabilities();
  const yol = usePathname() ?? '';

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // 23.09.2026 — VİTRİN (paketsiz YENİ hesap): duvar YOK. Gezilebilir yolda
  // sayfa açılır (aşağıdaki `icerikDurdurulsunMu` vitrinde `false` döner);
  // gezilemeyen yolda "bu bölüm paket seçince açılır" kartı. Kart `children`
  // YERİNE çizilir → sayfa mount olmaz, yetenekli uca istek yola çıkmaz.
  // ⚠ SIRA: bu dal `icerikDurdurulsunMu`dan ÖNCE — yoksa gezilemeyen yol
  //   da "durdurma yok" deyip sayfayı açar ve 403'ler geri gelirdi.
  if (vitrinKartiGosterilsinMi(erisim, yol)) return <VitrinBolumKarti yol={yol} />;

  // ⚠ UCUNCU ARGUMAN SART: kapatilmis hesabin `erisimVar`i FALSE'tur
  //   (kapatma aboneligi iptal eder). Gecilmezse `/quotes` ve `/library`
  //   icerigi "paket secin" ekraniyla degistirilir ve Emre'nin
  //   "gorebilecek, girebilecek" karari on yuzde sessizce olur.
  if (!icerikDurdurulsunMu(erisim, yol, kapali?.kapali === true))
    return <>{children}</>;

  return <ErisimDurduruldu uyari={erisim?.uyari ?? null} />;
}

/**
 * Durdurma ekrani.
 *
 * ⚠ CIKMAZ SOKAK YASAK: `uyari` ya da `uyari.eylem` bos gelse bile ekran
 * HER ZAMAN `/abonelik`e giden bir dugme cizer. Aksi halde odeme yapmasi
 * gereken kullanici odeme sayfasina gidemez ve kapali durumdan cikamaz.
 * (Cikis dugmesi ve kenar cubugu kabukta durur; bu bilesen yalniz sayfa
 * icerigini degistirir.)
 */
function ErisimDurduruldu({ uyari }: { uyari: ErisimUyarisi | null }) {
  const baslik = uyari?.baslik ?? 'Aboneliğiniz bulunmuyor';
  const metin = uyari?.metin ?? 'Devam etmek için bir paket seçin.';
  const eylem = uyari?.eylem ?? { etiket: 'Paketleri gör', yol: '/abonelik' };

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl border-2 border-muted px-8 py-14 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{baslik}</h1>
      <p className="text-sm text-muted-foreground">{metin}</p>
      <p className="text-sm text-muted-foreground">
        Verileriniz duruyor, silinmedi.
      </p>
      <Link
        href={eylem.yol}
        className="mt-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {eylem.etiket}
      </Link>
      {/* ⚠ KVKK haklari odeme durumuna BAGLANAMAZ: bu iki yol
          `DURDURULMAYAN_YOL` listesindedir, yani buradan gidilebilir.
          23.09.2026: Hesabım sekmelere bölündü; bağlantı doğrudan "Veriler"
          sekmesini (indir + hesabımı kapat) açar — Profil sekmesine düşen
          kişi indirme düğmesini aramak zorunda kalmasın. */}
      <Link href="/profile?sekme=veriler" className="text-xs text-muted-foreground underline">
        Hesap ayarları ve verilerim
      </Link>
    </div>
  );
}
