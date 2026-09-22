/**
 * KAPALI HESAP DURUMU — SAF ÇÖZÜCÜ (22.09.2026)
 *
 * ⚠ AYRI DOSYA VE HİÇBİR ŞEY İMPORT ETMİYOR, bilerek. `KapaliHesapSeridi.tsx`
 * `@/ortak/lib/api`, `@/ozellik/kimlik/verileri-indir` ve `@/ortak/hooks/...`
 * aktarıyor; vitest bu depoda `@/…` takma adını ÇÖZMÜYOR (ölçüldü — aynı
 * tuzak `verileri-indir.ts` başlığında da yazılı). Çözücü bileşenin içinde
 * kalsaydı test dosyası bileşeni import edemez, yani mantık TEST EDİLEMEZ
 * olurdu.
 *
 * Kural bu dosyada TEK yerde: hem şerit hem kapı buradan okur.
 */

export type KapaliDurum = {
  kapali: boolean;
  /** `hesap` = kendi kapattı · `firma` = firması kapatıldı (paket SEÇEMEZ). */
  tip: 'hesap' | 'firma' | null;
  imhaTarihi: string | null;
  baslik: string;
  metin: string;
  /**
   * Sunucunun önerdiği eylem (genelde "Paket seç" → `/abonelik`).
   * 22.09: şerit `AbonelikSeridi`nin yerini de aldığı için onun düğmesini
   * de taşımak zorunda — yoksa iki şeridi teke indirirken müşterinin geri
   * dönüş düğmesi sessizce kaybolurdu.
   */
  eylem: { etiket: string; yol: string } | null;
};

/**
 * `/auth/me` yanıtından kapalı-hesap durumunu çıkarır.
 *
 * ⚠ `kapali !== true` ise `null` döner ve şerit HİÇBİR ŞEY çizmez. Bu,
 * `EpostaDogrulamaSeridi` ile aynı desen: "henüz yüklenmedi" ile "kapalı
 * değil" ayrımı yapılmazsa şerit her sayfa açılışında bir an yanıp söner.
 *
 * ⚠ BAŞLIK VE METİN SUNUCUDAN GELİR (`kapali-hesap.ts` `kapaliHesapMetni`),
 * burada ikinci kez YAZILMAZ: aynı cümle 403 gövdesinde de dönüyor. Silinen
 * `/hesap-kapali` ekranında da aynı kural vardı; iki yerde ayrı yazılsaydı
 * biri günün birinde ötekinden sapardı. Buradaki değerler yalnız sunucu
 * susarsa devreye giren YEDEKLERDİR.
 */
export function kapaliDurumCoz(data: unknown): KapaliDurum | null {
  const y = (data ?? {}) as Record<string, any>;
  const k = y.kapali as { kapali?: boolean; tip?: unknown; imhaTarihi?: unknown } | undefined;
  if (!k || k.kapali !== true) return null;
  return {
    kapali: true,
    tip: k.tip === 'firma' ? 'firma' : k.tip === 'hesap' ? 'hesap' : null,
    imhaTarihi: typeof k.imhaTarihi === 'string' ? k.imhaTarihi : null,
    baslik: y?.erisim?.uyari?.baslik ?? 'Hesabınız kapatıldı.',
    metin: y?.erisim?.uyari?.metin ?? '',
    eylem:
      y?.erisim?.uyari?.eylem?.yol && y?.erisim?.uyari?.eylem?.etiket
        ? { etiket: String(y.erisim.uyari.eylem.etiket), yol: String(y.erisim.uyari.eylem.yol) }
        : null,
  };
}

/**
 * İMHA TARİHİ ŞERİTTE İKİNCİ KEZ YAZILMALI MI?
 *
 * ⚠ CANLIDA GÖRÜLDÜ (22.09, Emre'nin ekran görüntüsü): şerit
 * "**Hesabınız kapatıldı. Verileriniz 22.10.2026 tarihinde silinecek.**
 * Verileriniz **22.10.2026** tarihinde silinecek. …" yazıyordu — aynı cümle
 * arka arkaya iki kez. Sebep: sunucunun `baslik`ı tarihi ZATEN içeriyor,
 * şerit ise kendi tarih cümlesini KOŞULSUZ ekliyordu.
 *
 * Tarihi tamamen kaldırmak da yanlış olurdu: imha tarihini göstermek bir
 * SÖZ (K2) ve sunucu metni günün birinde değişebilir. Ölçüt bu yüzden
 * "tarih zaten yazılı mı" sorusudur, "yaz/yazma" değil.
 */
export function imhaTarihiAyricaYazilsinMi(
  d: Pick<KapaliDurum, 'baslik' | 'metin'>,
  tarihMetni: string | null,
): boolean {
  if (!tarihMetni) return false;
  return !d.baslik.includes(tarihMetni) && !d.metin.includes(tarihMetni);
}
