/**
 * S2 — ONERI KUTUSUNUN CEKINCE METNI (saf karar mantigi)
 *
 * ── NEDEN AYRI DOSYA ───────────────────────────────────────────────────────
 * Bu bir KARAR: "kutu kesinlik iddia edebilir mi?". Karar JSX icinde
 * kalirsa olculemez (bu depoda vitest ortami `node`, jsdom KURULU DEGIL —
 * bilesen render edilemez). Karar saf fonksiyona alininca hem olculur hem de
 * IKI cizim yerinde (malzeme kutusu + iscilik kutusu) AYNI kaynaktan okunur;
 * ikisi ayri ayri elle yazilsaydi biri guncellenip digeri unutulurdu.
 *
 * ── KUSUR (olculdu, 06.08.2026) ────────────────────────────────────────────
 * Backend capraz-marka onerisi uretirken ana motoru cagirir; motor tek adayi
 * "onaylat" diye isaretleyebilir. Kutu ise bunu "Bu markada ürün yok — şu
 * markalarda var:" KESINLIK basligiyla ciziyordu. Ana ekranda ASLA otomatik
 * yazilmayacak bir aday, oneri kutusunda tek secenek ve kesin gorunuyordu.
 */

/** Backend BrandAlternative'in bu modulu ilgilendiren KISMI (yapisal tip). */
export interface CekinceliOneri {
  /** Doluysa: aday I6 kapisindan gecemedi, gerekcesi bu cumledir. */
  uyariNot?: string;
  /** Satirda yazili ama o markanin dagarciginda bulunmayan kelimeler. */
  bilinmeyen?: string[];
}

/** Oneri kutusunun kapsami — metin marka/firma icin farkli okunur. */
export type OneriKapsami = 'marka' | 'firma';

/** Tek aday KESIN mi? Cekince tasiyorsa hayir. */
export function adayKesinMi(a: CekinceliOneri | null | undefined): boolean {
  return !cekinceSatiri(a);
}

/**
 * Kutu bir butun olarak onay gerektiriyor mu?
 * TEK bir cekinceli aday bile kutunun kesinlik iddiasini dusurur — kullanici
 * basliga bakip listenin tamamina guvenir; karisik listede "bazilari kesin"
 * demek, kesin olmayani kesin gostermekten daha az yanlis degildir.
 */
export function kutuOnayGerektirir(adaylar: readonly CekinceliOneri[]): boolean {
  return adaylar.some((a) => !adayKesinMi(a));
}

/**
 * Kutu basligi. Kesinlik iddiasi YALNIZ tum adaylar kapidan gecmisse kurulur;
 * aksi halde baslik ONAY tonuna doner ve "var" demez.
 */
export function oneriBasligi(adaylar: readonly CekinceliOneri[], kapsam: OneriKapsami): string {
  const yer = kapsam === 'firma' ? 'firmalarda' : 'markalarda';
  const yok = kapsam === 'firma' ? 'Bu firmada yok' : 'Bu markada ürün yok';
  return kutuOnayGerektirir(adaylar)
    ? `${yok} — şu ${yer} BENZERİ bulundu, onaylayın:`
    : `${yok} — şu ${yer} var:`;
}

/**
 * Adayin cekince satiri (yoksa null).
 * uyariNot varsa o kullanilir (motorun kendi gerekcesidir, en bilgilendirici).
 * Yalniz `bilinmeyen` geldiyse kelimelerden cumle kurulur — sessiz kalmak
 * "kesin" demekle ayni sonucu verirdi.
 */
export function cekinceSatiri(a: CekinceliOneri | null | undefined): string | null {
  if (!a) return null;
  const not = a.uyariNot?.trim();
  if (not) return `⚠ ${not} — onay gerekiyor`;
  const bilinmeyen = (a.bilinmeyen ?? []).filter((t) => !!t?.trim());
  if (bilinmeyen.length > 0) return `⚠ "${bilinmeyen.join(' ')}" doğrulanamadı — onay gerekiyor`;
  return null;
}
