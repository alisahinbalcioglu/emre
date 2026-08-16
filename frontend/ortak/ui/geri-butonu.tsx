'use client';

/**
 * GERI — bir onceki sayfaya doner (14.08 kullanici istegi).
 *
 * ── NEDEN SABIT `href` DEGIL ────────────────────────────────────────────────
 * Sayfalarin her biri kendi geri baglantisini SABIT bir hedefe yaziyordu ve
 * hedefler tutarsizdi: iscilik sayfasi "Dashboard"a, kutuphane sayfalari
 * "Kutuphanem"e gidiyordu. Kullanici Kutuphanem uzerinden mekanik iscilige
 * girdiginde geri tusu onu Dashboard'a atiyordu — yani GELDIGI yere degil,
 * yazarin VARSAYDIGI yere. Ayni kusurun daha sessiz bir hali
 * `library/brand/[brandId]` sayfasindaydi: hedef sabit
 * `/library/mechanical-brands` oldugu icin bir ELEKTRIK markasi acildiginda
 * geri tusu kullaniciyi mekanik listesine goturuyordu.
 *
 * Cozum: tarayici gecmisinde bir adim geri. Boylece hedef, kullanicinin
 * gercekten geldigi yer olur ve sayfa sayisi arttikca dogru kalmaya devam
 * eder (yeni bir giris yolu acildiginda kimsenin listeyi guncellemesi
 * gerekmez).
 *
 * ── GECMIS YOKSA ────────────────────────────────────────────────────────────
 * Yeni sekmede acilan ya da dogrudan URL ile gelinen sayfada gecmis YOKTUR;
 * `router.back()` orada HICBIR SEY yapmaz ve buton olu gorunur. Bu yuzden
 * `hedef` bir GERI DUSUS olarak zorunludur.
 *
 * ⚠ `window.history.length` mukemmel bir olcut degil: ayni sekmede sayfa
 * yenilenirse (F5) uzunluk korunur ve `back()` ayni sayfaya donebilir. Daha
 * kesin bir olcut tarayici API'siyle MUMKUN DEGIL (gecmis icerigi okunamaz).
 * Bilincli takas: yaygin durum (uygulama ici gezinme) dogru calisir, nadir
 * durumda kullanici bir kez daha geri basar. Alternatif — herkese sabit hedef
 * — kullanicinin ASIL sikayetiydi.
 *
 * ── ETIKET NEDEN "Geri" ─────────────────────────────────────────────────────
 * Hedef artik dinamik oldugu icin "Kutuphanem" gibi bir etiket YALAN
 * SOYLEYEBILIR (kullanici baska yerden gelmis olabilir). Etiket ne vaat
 * ediyorsa o olmali.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface GeriButonuProps {
  /** Gecmis yoksa gidilecek yer (yeni sekme / dogrudan URL durumu). */
  hedef: string;
  /** Varsayilan "Geri". Yalnizca hedefin DEGISMEDIGI ekranlarda ozellestirin. */
  etiket?: string;
  className?: string;
}

export function GeriButonu({ hedef, etiket = 'Geri', className = '' }: GeriButonuProps) {
  const router = useRouter();

  return (
    // ⚠ `<Link>` KULLANILIYOR (buton degil): sag tik → "yeni sekmede ac",
    // orta tik ve klavye ile odaklanma calismaya devam etsin. `onClick`
    // varsayilani engelleyip gecmise gider; JS calismazsa baglanti yine de
    // `hedef`e goturur (bozulmayan geri dusus).
    <Link
      href={hedef}
      onClick={(e) => {
        if (typeof window === 'undefined') return;
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className={`mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      {etiket}
    </Link>
  );
}
