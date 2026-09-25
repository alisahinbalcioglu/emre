import type { EpostaTalebi } from '../../eposta/eposta.servisi';
import { trTarih } from '../ceviri-kotasi';
import { tlYaz, type DegisimZamanlamasi, type HakKaybi } from '../paket-degisimi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YONETICI PAKET ISLEMI E-POSTALARI (24.09.2026, yonetici paneli turu A2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ SOZLESME ONAYI CUMLESI YOK. A1'in musteri e-postasi "Degisiklik adiminda
 *  onayladiginiz ... sozlesme" der; yonetici islemi musteri onayi ALMAZ —
 *  o cumleyi burada yazmak YANLIS BEYAN olurdu.
 *
 *  ⚠ YONETICININ IC GEREKCESI YAZILMAZ. Gerekce denetim kaydi icindir;
 *  musteriye gidecek bir metin varsa yonetici onu AYRICA (`musteriNotu`) yazar.
 *
 *  ⚠ ISLEMI KIMIN YAPTIGI ACIK: "MetaPriceX ekibi" — musteri kendi yapmadigi
 *  bir degisikligi kendisinin yaptigini sanmasin.
 *
 *  Paragraflar DUZ METIN (`eposta.servisi.ts` kacirir; H1 kapisi kaynakta
 *  HTML arar). Tarih GUN olarak (`trTarih`, Turkiye saati).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Hak kaybi/kazanci adlari — e-posta ve yonetici ekrani AYNI sozlugu okur. */
export const HAK_ADI: ReadonlyMap<HakKaybi, string> = new Map<HakKaybi, string>([
  ['seviye', 'Pro seviyesi özellikleri'],
  ['kapsam', 'disiplin kapsamı (mekanik/elektrik)'],
  ['kullanici', 'kullanıcı hakkı'],
  ['dwg', 'DWG metraj'],
  ['teklif', 'aylık teklif hakkı'],
  ['ceviri', 'çeviri kotası'],
]);

/**
 * Gonderim hatasinin GUNLUGE giden metni — e-posta adresleri maskelenir
 * (guvenlik incelemesi D2, 25.09). SMTP ret yaniti ("550 <kisi@firma>
 * mailbox unavailable") aliciyi tasiyabilir; "adres gunluge yazilmaz"
 * kurali yalniz bizim yazdigimiz metinde degil, SAGLAYICININ metninde de tutmali.
 */
export function gunlukIcinMaskele(metin: string): string {
  return metin.replace(/[^\s<>()"',;:[\]]+@[^\s<>()"',;:[\]]+/g, '<adres>');
}

/** ['dwg','kullanici'] → "DWG metraj, kullanıcı hakkı". Bilinmeyen ad AYNEN yazilir. */
export function hakListesi(haklar: readonly HakKaybi[]): string {
  return haklar.map((h) => HAK_ADI.get(h) ?? h).join(', ');
}

/** Yonetici dusurmesinden sonra firma sahibine giden BILGI e-postasi. */
export function yoneticiDusurmeEpostasi(p: {
  kime: string;
  firmaAdi: string;
  mevcutPaketAdi: string;
  yeniPaketAdi: string;
  yeniTutar: string;
  gecisTarihi: Date;
  kayiplar: readonly HakKaybi[];
  yeniKullaniciHakki: number;
  durdurulacakUye: number;
  musteriNotu: string | null;
  uygulamaUrl: string;
}): EpostaTalebi {
  const gun = trTarih(p.gecisTarihi);
  const paragraflar = [
    `${p.firmaAdi} firmasının MetaPriceX paketi ${gun} tarihinde ${p.yeniPaketAdi} olarak değişecek. ` +
      'Bu değişikliği MetaPriceX ekibi yaptı.',
    `O tarihe kadar ${p.mevcutPaketAdi} paketinizin tüm özellikleri açık kalır. Yeni aylık ücret ` +
      `(${tlYaz(p.yeniTutar)}, KDV dahil) o tarihten itibaren kartınızdan çekilir.`,
  ];
  if (p.kayiplar.length > 0) {
    // "olmayanlar" DEGIL: kullanici hakki, kota, kapsam AZALIR — hepsi kalkmaz.
    paragraflar.push(`Yeni pakette azalan ya da kalkan haklar: ${hakListesi(p.kayiplar)}.`);
  }
  if (p.durdurulacakUye > 0) {
    paragraflar.push(
      `Yeni paket en fazla ${p.yeniKullaniciHakki} kullanıcıya izin verir; geçişten sonra ` +
        `${p.durdurulacakUye} ekip üyesinin erişimi durur. Geçişten önce Ekip sayfasından ` +
        'ekibinizi düzenleyebilirsiniz.',
    );
  }
  if (p.musteriNotu) paragraflar.push(`MetaPriceX ekibinin notu: ${p.musteriNotu}`);
  paragraflar.push('Bu değişiklikle ilgili bir sorunuz varsa bizimle iletişime geçebilirsiniz.');

  return {
    kime: p.kime,
    konu: 'MetaPriceX — paketiniz dönem sonunda değişecek',
    baslik: 'Paketiniz dönem sonunda değişecek',
    paragraflar,
    dugme: { etiket: 'Aboneliğimi gör', url: `${p.uygulamaUrl}/abonelik` },
  };
}

/**
 * Yonetici ONERISI (A2 Blok 2) — firma SAHIPLERINE giden onay daveti.
 * ⚠ Paket DEGISMEDI: metin bunu ilk cumlede soyler. Kabul abonelik
 * sayfasinda sozlesme onayiyla verilir; baglanti gizli anahtar TASIMAZ
 * (yalniz oneri kimligi) — oturumu olmayan onu acsa da bir sey yapamaz.
 */
export function yoneticiOneriEpostasi(p: {
  kime: string;
  firmaAdi: string;
  mevcutPaketAdi: string;
  hedefPaketAdi: string;
  hedefTutar: string;
  zamanlama: DegisimZamanlamasi;
  /** Ucretin (dusurme/yatayda paketin de) degisecegi an: bir sonraki cekim. */
  beklenenGecis: Date;
  kazanclar: readonly HakKaybi[];
  kayiplar: readonly HakKaybi[];
  hedefKullaniciHakki: number;
  durdurulacakUye: number;
  musteriNotu: string | null;
  sonGecerlilik: Date;
  oneriId: string;
  uygulamaUrl: string;
}): EpostaTalebi {
  const gun = trTarih(p.beklenenGecis);
  const ucret = `Yeni aylık ücret (${tlYaz(p.hedefTutar)}, KDV dahil)`;
  const paragraflar = [
    `MetaPriceX ekibi, ${p.firmaAdi} firması için ${p.hedefPaketAdi} paketini önerdi. ` +
      'Paketiniz siz onaylamadan değişmez.',
    // ⚠ GORELI TARIH (inceleme D8): donem yenilenince oneri kapanmaz; musteri
    // yenilemeden SONRA onaylarsa gecis bir ay ileri kayar. "26.09'da degisir"
    // yazmak o durumda yanlis olurdu — tarih "bugunku bilgiyle" verilir, dogrusu
    // onay penceresinde (sunucunun o anki karari) gorulur.
    p.zamanlama === 'hemen'
      ? `Onaylarsanız ${p.hedefPaketAdi} paketinin özellikleri hemen açılır. ${ucret} onayınızdan ` +
        `sonraki ilk ödeme gününüzden itibaren kartınızdan çekilir (bugünkü bilgiyle ${gun}).`
      : `Onaylarsanız paketiniz, onayınızdan sonraki ilk dönem sonunda (bugünkü bilgiyle ${gun}) ` +
        `${p.hedefPaketAdi} olarak değişir; o güne kadar ${p.mevcutPaketAdi} paketinizin tüm özellikleri ` +
        `açık kalır. ${ucret} o günden itibaren kartınızdan çekilir.`,
  ];
  if (p.kazanclar.length > 0) {
    paragraflar.push(`Yeni pakette eklenen ya da artan haklar: ${hakListesi(p.kazanclar)}.`);
  }
  if (p.kayiplar.length > 0) {
    paragraflar.push(`Yeni pakette azalan ya da kalkan haklar: ${hakListesi(p.kayiplar)}.`);
  }
  if (p.durdurulacakUye > 0) {
    paragraflar.push(
      `Yeni paket en fazla ${p.hedefKullaniciHakki} kullanıcıya izin verir; geçişten sonra ` +
        `${p.durdurulacakUye} ekip üyesinin erişimi durur.`,
    );
  }
  if (p.musteriNotu) paragraflar.push(`MetaPriceX ekibinin notu: ${p.musteriNotu}`);
  paragraflar.push(
    'Öneriyi incelemek için firma sahibi hesabınızla giriş yapın. Kabul, abonelik sayfasında ' +
      'sözleşme onayıyla verilir; dilerseniz öneriyi aynı sayfadan reddedebilirsiniz. ' +
      `Öneri ${trTarih(p.sonGecerlilik)} günü sonuna kadar geçerlidir.`,
  );

  return {
    kime: p.kime,
    konu: 'MetaPriceX — size bir paket önerimiz var',
    baslik: 'Size bir paket önerimiz var',
    paragraflar,
    dugme: { etiket: 'Öneriyi incele', url: `${p.uygulamaUrl}/abonelik?oneri=${p.oneriId}` },
  };
}
