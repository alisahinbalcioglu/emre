import { tarihYaz, tutarYaz } from '../dunning/dunning.metinleri';

/* ═══════════════════════════════════════════════════════════════════════════
   MÜŞTERİ E-POSTALARI — METİNLER (SAF, 25.09.2026)
   ═══════════════════════════════════════════════════════════════════════════

   Emre: "faturalar ve uyarılar vs. e posta olarak gitmeli". Ölçülen boşluk
   (24.09 envanteri): dört olay müşteriye HİÇ e-posta üretmiyordu —
     · sorunsuz yenileme (yalnız dunning'den ÇIKIŞTA "ödemeniz alındı" vardı),
     · müşterinin kendi iptali (yalnız uygulama içi şerit),
     · havale ödeme kaydının iptali (onayda e-posta var, iptalde yok),
     · deneme bitiyor (yalnız uygulama içi şerit; ilk çekim kayıtlı karttan
       HABERSİZ yapılıyordu).
   Gönderim yerleri ve "TAM BİR KEZ" kuralları çağıranlarda (her fonksiyonun
   notunda). Bu dosya yalnız METİN üretir: Prisma/Nest bilmez.

   ⚠ VERİ DÜZ METİN: paragraflar `EpostaServisi.sablon`da kaçışlanır; HTML
   YAZILMAZ (23.09 kod bloğu dersi). Müşterinin ya da yöneticinin girdiği
   alanlar TEK satıra iner (düz metin gövdeye sahte satır gömülmesin).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface MusteriEpostasi {
  konu: string;
  baslik: string;
  paragraflar: string[];
  dugme: { etiket: string; url: string };
}

/** Girilen alan TEK satır (satır sonu / sekme boşluğa iner). */
const tek = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

const abonelikDugmesi = (uygulamaUrl: string) => ({
  etiket: 'Aboneliğim',
  url: `${uygulamaUrl.replace(/\/+$/, '')}/abonelik`,
});

/** iyzico periyodu → "aylık", "yıllık", "her 3 ayda bir"… */
export function periyotMetni(periyot: string, adet: number): string {
  const n = Math.max(1, Math.trunc(adet) || 1);
  const birim: Record<string, [string, string]> = {
    DAILY: ['günlük', 'günde'],
    WEEKLY: ['haftalık', 'haftada'],
    MONTHLY: ['aylık', 'ayda'],
    YEARLY: ['yıllık', 'yılda'],
  };
  const b = birim[periyot] ?? birim.MONTHLY;
  return n === 1 ? b[0] : `her ${n} ${b[1]} bir`;
}

/* ── 1. Sorunsuz yenileme: "ödemeniz alındı" ─────────────────────────────
   Çağıran: `WebhookIsleyici.basariliTahsilat`. TAM BİR KEZ: yalnız bu
   tahsilatın fatura satırı İLK KEZ yazıldığında (tahsilat kodu tekil) ve
   dunning'den ÇIKILMADIYSA — o hâlde dunning'in kendi "ödemeniz alındı"sı
   gider; ikisi aynı ödemeye birlikte gitmez. */
export function odemeAlindiEpostasi(b: {
  firmaAdi: string;
  paketAdi: string;
  tutar: number;
  paraBirimi: string;
  donemBasi: Date | null;
  donemSonu: Date;
  uygulamaUrl: string;
}): MusteriEpostasi {
  return {
    konu: 'MetaPriceX — ödemeniz alındı',
    baslik: 'Ödemeniz için teşekkürler',
    paragraflar: [
      `${tek(b.firmaAdi)} için ${tek(b.paketAdi)} aboneliğinizin ${tutarYaz(b.tutar, b.paraBirimi)} ` +
        'tutarındaki ödemesi kayıtlı kartınızdan alındı.',
      b.donemBasi
        ? `Ödenen dönem: ${tarihYaz(b.donemBasi)} – ${tarihYaz(b.donemSonu)}.`
        : `Aboneliğiniz ${tarihYaz(b.donemSonu)} tarihine kadar geçerli.`,
      'Faturanız e-posta ile ayrıca iletilecek.',
      'İyi çalışmalar.',
    ],
    dugme: abonelikDugmesi(b.uygulamaUrl),
  };
}

/* ── 2. Müşterinin kendi iptali: onay ────────────────────────────────────
   Çağıran: `SatinAlmaServisi.iptalEt` — YALNIZ müşterinin "Aboneliğimi iptal
   et" isteğinde (hesap kapatmanın kendi e-postası var; yönetici silmede
   e-posta gitmez). TAM BİR KEZ: iptal yazımı koşullu, ikinci tık / eşzamanlı
   istek e-posta üretmez. */
/**
 * Aboneliğin iptal anındaki hâli:
 *  · `deneme`    — ilk çekim henüz yapılmadı (etiket DENEME ya da ilk çekim
 *                  günü gelecekte; mutabakat eskiden deneme satırını AKTIF'e
 *                  çekiyordu — `yonetici-islemi.ts` H1 ile aynı okuma);
 *  · `odenmis`   — ödenmiş dönem sürüyor;
 *  · `odenmemis` — son tahsilat alınamadı (ODEME_BEKLIYOR / KISITLI):
 *                  "ödenmiş döneminiz sürer" YAZILAMAZ (inceleme M2).
 */
export type IptalHali = 'deneme' | 'odenmis' | 'odenmemis';

export function iptalOnayiEpostasi(b: {
  firmaAdi: string;
  paketAdi: string;
  /** Denemede ilk çekim günü, değilse erişimin bittiği gün. */
  bitis: Date;
  hal: IptalHali;
  kartli: boolean;
  /** `bitis` hâlâ gelecekte mi (geçmişse "devam edebilirsiniz" yazılmaz). */
  erisimSuruyor: boolean;
  /** Yükseltmenin ücreti başlamadan iptal: dönülen (ödenmiş) paket. */
  geriDonulenPaketAdi?: string | null;
  uygulamaUrl: string;
}): MusteriEpostasi {
  const gun = tarihYaz(b.bitis);
  const sure: string[] =
    b.hal === 'deneme'
      ? [`Deneme süreniz ${gun} tarihine kadar sürer; kartınızdan ücret çekilmeyecek.`]
      : b.hal === 'odenmemis'
        ? [
            b.kartli
              ? 'Tahsil edilemeyen ödeme için kartınızdan yeniden çekim yapılmayacak; yeni ücret de çekilmeyecek.'
              : 'Ödenmemiş dönem için yeni ücret istenmeyecek.',
            b.erisimSuruyor
              ? `Erişiminiz ${gun} tarihine kadar sürer.`
              : 'Ödenmemiş dönem nedeniyle erişiminiz sona erdi.',
          ]
        : [
            b.kartli
              ? `Ödenmiş döneminiz ${gun} tarihine kadar sürer; bu tarihten sonra kartınızdan yeni ücret çekilmez.`
              : `Ödenmiş döneminiz ${gun} tarihine kadar sürer.`,
          ];
  return {
    konu: 'MetaPriceX — aboneliğiniz iptal edildi',
    baslik: 'İptal talebiniz alındı',
    paragraflar: [
      `${tek(b.firmaAdi)} için ${tek(b.paketAdi)} aboneliğinizin iptal talebi alındı.`,
      ...sure,
      ...(b.geriDonulenPaketAdi
        ? [
            'Yükseltmenin yeni ücreti başlamadan iptal ettiğiniz için paketiniz ödediğiniz ' +
              `${tek(b.geriDonulenPaketAdi)} paketine döndü.`,
          ]
        : []),
      (b.erisimSuruyor ? 'Bu tarihe kadar uygulamayı kullanmaya devam edebilirsiniz. ' : '') +
        'Fikrinizi değiştirirseniz Abonelik sayfasından yeniden abone olabilirsiniz.',
      'Bu talebi siz yapmadıysanız bu e-postayı yanıtlayarak hemen bize bildirin.',
    ],
    dugme: abonelikDugmesi(b.uygulamaUrl),
  };
}

/* ── 3. Havale ödeme kaydının iptali ─────────────────────────────────────
   Çağıran: `HavaleServisi.iptalEt` — koşullu iptalin KAZANAN yolunda. İkinci
   istek (zaten iptal) ya da onaylanmış kayıttaki ret e-posta üretmez.
   ⚠ Yöneticinin iptal NEDENİ YAZILMAZ: o alan iç nottur (`aciklama` + olay
   kaydı, ham API gövdesinden gelir); müşteriye ayrı bir not alanı yok
   (inceleme M5). */
export function havaleIptalEpostasi(b: {
  firmaAdi: string;
  teklifNo: string | null;
  tutar: number;
  paraBirimi: string;
  uygulamaUrl: string;
}): MusteriEpostasi {
  const no = tek(b.teklifNo);
  return {
    konu: 'MetaPriceX — havale ödeme kaydınız iptal edildi',
    baslik: 'Havale ödeme kaydınız iptal edildi',
    paragraflar: [
      `${tek(b.firmaAdi)} için ${no ? `${no} numaralı ` : ''}${tutarYaz(b.tutar, b.paraBirimi)} ` +
        'tutarındaki havale/EFT ödeme kaydınız iptal edildi.',
      'Bu tutarı ödediyseniz ya da iptalin hatalı olduğunu düşünüyorsanız bu e-postayı yanıtlayarak ' +
        'bize bildirin; kaydınızı birlikte düzeltelim.',
      'Kartla ödemek isterseniz Abonelik sayfasından devam edebilirsiniz.',
    ],
    dugme: abonelikDugmesi(b.uygulamaUrl),
  };
}

/* ── 4. Deneme bitiyor (Emre: ilk çekimden 3 gün önce, bir kez) ───────────
   Çağıran: `DenemeHatirlatmasiServisi` günlük taraması. TAM BİR KEZ:
   `Abonelik.denemeHatirlatmasi` koşullu yazılır. Tutar bilinmiyorsa (planlı
   paket değişimi ilk çekimi değiştirebilir) rakam YAZILMAZ — yanlış tutar
   söz vermekten iyidir. */
export function denemeBitiyorEpostasi(b: {
  firmaAdi: string;
  paketAdi: string;
  cekimTarihi: Date;
  /** Gönderim anı — çekime 24 saatten az kaldıysa "tarihinden önce" yazılmaz. */
  simdi: Date;
  /** KDV dahil ilk çekim; bilinmiyorsa null. */
  tutar: number | null;
  paraBirimi: string;
  periyot: string;
  periyotAdedi: number;
  uygulamaUrl: string;
}): MusteriEpostasi {
  const gun = tarihYaz(b.cekimTarihi);
  // Kısa deneme, deploy günü ya da son gün yeniden denemesi: "bugünden önce
  // iptal edin" yapılamaz bir talimat olurdu (inceleme L10).
  const sonGun = b.cekimTarihi.getTime() - b.simdi.getTime() < 24 * 60 * 60 * 1000;
  return {
    konu: `MetaPriceX — deneme süreniz ${gun} tarihinde bitiyor`,
    baslik: 'Deneme süreniz bitmek üzere',
    paragraflar: [
      `${tek(b.firmaAdi)} için ${tek(b.paketAdi)} deneme süreniz ${gun} tarihinde bitiyor.`,
      b.tutar !== null
        ? `Bu tarihte kayıtlı kartınızdan ${tutarYaz(b.tutar, b.paraBirimi)} (KDV dahil) çekilecek ve ` +
          `aboneliğiniz ${periyotMetni(b.periyot, b.periyotAdedi)} yenilenecek.`
        : 'Bu tarihte kayıtlı kartınızdan ilk ödeme çekilecek ve aboneliğiniz devam edecek.',
      sonGun
        ? 'Devam etmek istemiyorsanız hemen Abonelik sayfasından iptal edin; çekimden önce iptal ederseniz ' +
          'kartınızdan ücret çekilmez.'
        : `Devam etmek istemiyorsanız ${gun} tarihinden önce Abonelik sayfasından iptal edin; iptal ` +
          'ederseniz kartınızdan ücret çekilmez.',
      'Devam ediyorsanız bir şey yapmanıza gerek yok.',
    ],
    dugme: abonelikDugmesi(b.uygulamaUrl),
  };
}
