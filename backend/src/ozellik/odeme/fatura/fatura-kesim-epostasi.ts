import type { FaturaKesTalebi } from './muhasebe.adaptor';
import { istanbulGunSonu, tarihYaz, tutarYaz } from '../dunning/dunning.metinleri';

/* ═══════════════════════════════════════════════════════════════════════════
   ELLE (NES) FATURA KESİM TALEBİ — yöneticiye giden e-postanın METNİ (SAF)
   ═══════════════════════════════════════════════════════════════════════════

   Emre (24.09.2026): "muhasebe için NES uygulamasını kullanacağız şimdilik"
   ve "faturalar ve uyarılar vs. e posta olarak gitmeli". Faturayı yönetici
   NES'te keser; sistem ona her tahsilatta kesilecek faturanın TÜM bilgisini
   yazar. Müşteriye iletimi NES yapar (24.09 araştırması, NES e-Arşiv
   sayfası + API `definitions/mailing/email/settings`):
     · e-Arşiv: faturaya alıcının e-postası yazılır ve NES'in otomatik
       gönderimi açıksa fatura oluşturulduğu anda bağlantıyla gider.
     · e-Fatura mükellefi alıcı: fatura GİB üzerinden posta kutusuna gider,
       NES'te otomatik e-posta kopyası YOK. Sözleşme "e-posta ile iletilir"
       dediği için kopya NES'ten elle gönderilir.

   ⚠ SÜRE — VUK md. 231/5: fatura hizmetin yapıldığı (burada: tahsilat)
   tarihten itibaren EN GEÇ 7 GÜN içinde düzenlenir; düzenlenmeyen fatura hiç
   düzenlenmemiş sayılır. E-posta son günü yazar. 28.09: ödeme anı satırın
   `tahsilatTarihi`dir (iyzico'nun başarılı denemesi / havale onayı); son gün
   talebin kurulduğu GÜNDEN (`duzenlemeTarihi`) ÖNCEYSE e-posta bunu İLK
   paragrafta ve konuda AÇIKÇA söyler — geç işlenen tahsilat (yeniden deneme,
   mutabakat oynatması, düşen posta) "hâlâ vakit var" gibi okunmasın. Süre
   GÜN sayar: son günün TAMAMI (İstanbul takvim günü, `istanbulGunSonu`)
   süre içindedir — son gün ödemenin saati geçti diye "geçti" denmez.

   ⚠ TEST ÖDEMESİ: canlı iyzico bugün SANDBOX. Sandbox kart "tahsilatı"
   gerçek para değildir; faturasını kesmek olmayan bir satışı beyan etmektir.
   Havale HER ZAMAN gerçek paradır (yönetici dekontu görüp onaylar).
   BİLİNEN SINIR (inceleme L3): ortam GÖNDERİM anında okunur. Sandbox'ta
   kuyruğa girip canlıya geçişten SONRA işlenen satır gerçek sayılır —
   satırda ortam tutulmuyor (göç ister); satırlar normalde dakikasında işlenir.

   ⚠ ÇİFT FATURA: havale akışında yönetici faturayı ödemeden ÖNCE de
   kesebiliyor (`POST yonetim/havale/:id/fatura`, "proforma ya da gerçek
   fatura") ve onayda `faturaKesme:false` vermezse kuyruğa yine fatura düşer.
   Girilmiş numara e-postada uyarıyla gösterilir.

   ⚠ VERİ DÜZ METİN: paragraflar `EpostaServisi.sablon`da kaçışlanır; buraya
   HTML YAZILMAZ (23.09 kod bloğu dersi).
   ═══════════════════════════════════════════════════════════════════════════ */

export const FATURA_DUZENLEME_SURESI_GUN = 7;

const GUN_MS = 24 * 60 * 60 * 1000;

export interface FaturaKesimBaglami {
  /** Kart tahsilatı iyzico test ortamında mı (gerçek para değil). Havalede yok sayılır. */
  iyzicoTestOrtami: boolean;
  /** `havale:<id>` anahtarlı tahsilatta havale kaydının numaraları (okunamadıysa null). */
  havale?: { teklifNo: string | null; faturaNo: string | null } | null;
}

export interface FaturaKesimEpostasi {
  konu: string;
  baslik: string;
  paragraflar: string[];
}

/**
 * Yasal son düzenleme günü (VUK md. 231/5): ödemeden itibaren
 * `FATURA_DUZENLEME_SURESI_GUN` gün — gün `tarihYaz` ile İstanbul'a göre
 * yazılır, süre o günün SONUNDA biter (`istanbulGunSonu`). TEK kural: NES
 * talebi ve tutarı okunamayan tahsilatın yönetici uyarısı (webhook) okur.
 */
export function sonDuzenlemeGunu(odeme: Date): Date {
  return new Date(odeme.getTime() + FATURA_DUZENLEME_SURESI_GUN * GUN_MS);
}

/** `havale:<id>` → `<id>`; kart tahsilatında (iyzico sipariş kodu) null. */
export function havaleKimligi(harciAnahtar: string): string | null {
  return harciAnahtar.startsWith('havale:') ? harciAnahtar.slice('havale:'.length) : null;
}

const kurus = (x: number) => Math.round(x * 100) / 100;

/**
 * Talep satırın tutarlarını taşımıyorsa (başka çağıran) kalemlerden hesaplanır.
 * FaturaServisi SATIRIN tutarlarını verir: KDV dahil tutardan ayrıştırılan
 * matrah + KDV yeniden hesaplanırsa 1 kuruş sapabilir (999,99 → 833,33 + 166,66).
 */
function tutarlar(t: FaturaKesTalebi): { matrah: number; kdv: number; toplam: number; tarih: Date } {
  if (t.tahsilat) return t.tahsilat;
  const matrah = kurus(t.kalemler.reduce((a, k) => a + k.miktar * k.birimFiyat, 0));
  const kdv = kurus(t.kalemler.reduce((a, k) => a + (k.miktar * k.birimFiyat * k.kdvOrani) / 100, 0));
  return { matrah, kdv, toplam: kurus(matrah + kdv), tarih: t.duzenlemeTarihi };
}

/**
 * Müşterinin girdiği alan TEK SATIR: satır sonu/sekme boşluğa iner. Aksi
 * hâlde unvana ya da adrese gömülen "\nFaturanın gönderileceği e-posta: x@…"
 * düz metin gövdede SAHTE bir satır olurdu (inceleme L1; HTML gövde kaçışlı,
 * konu satırını nodemailer zaten tek satıra indiriyor).
 */
const tek = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

export function faturaKesimTalebiEpostasi(t: FaturaKesTalebi, b: FaturaKesimBaglami): FaturaKesimEpostasi {
  const havaleId = havaleKimligi(t.harciAnahtar);
  const testOdemesi = !havaleId && b.iyzicoTestOrtami;
  const kayitliNo = tek(b.havale?.faturaNo) || null;
  const m = t.musteri;
  const unvan = tek(m.unvan);
  const pb = t.paraBirimi;
  const tutar = tutarlar(t);
  // Konudaki başvuru: aylık yenilemelerde unvan ve tutar AYNI — kod olmadan
  // iki e-posta aynı görünür, çifti ayırt etmek imkânsızlaşırdı (inceleme H1).
  const referans = havaleId ? tek(b.havale?.teklifNo) || t.harciAnahtar : t.harciAnahtar;
  const p: string[] = [];
  const sonGun = sonDuzenlemeGunu(tutar.tarih);
  const sureGecti = !testOdemesi && t.duzenlemeTarihi.getTime() > istanbulGunSonu(sonGun).getTime();
  const gecikmeOnEki = sureGecti ? 'SÜRESİ GEÇTİ — ' : '';

  if (sureGecti) {
    // Kayıtlı numara varsa talimat koşullu (inceleme M3 — "kesin" ile
    // "İKİNCİ KEZ KESMEYİN" aynı postada çelişmesin; 28.09 kod incelemesi).
    p.push(
      `⚠ SÜRE GEÇTİ: yasal son düzenleme günü ${tarihYaz(sonGun)} idi (VUK md. 231/5, ödemeden itibaren ` +
        `${FATURA_DUZENLEME_SURESI_GUN} gün). ` +
        (kayitliNo
          ? 'Kayıtlı numara proformaysa faturayı HEMEN kesin ve gecikmeyi muhasebecinize bildirin.'
          : 'Faturayı yine de HEMEN kesin ve gecikmeyi muhasebecinize bildirin.'),
    );
  }
  if (testOdemesi) {
    p.push(
      '⚠ TEST ÖDEMESİ: bu kart tahsilatı iyzico test ortamında (sandbox) yapıldı, gerçek para alınmadı. ' +
        'Bu kayıt için fatura KESMEYİN.',
    );
  }
  p.push(
    havaleId
      ? `Ödeme: Havale/EFT — ${tek(b.havale?.teklifNo) ? `teklif ${tek(b.havale?.teklifNo)}` : `kayıt ${havaleId}`}`
      : `Ödeme: Kart (iyzico) — sipariş ${t.harciAnahtar}`,
  );
  p.push(`Ödeme tarihi: ${tarihYaz(tutar.tarih)}`);
  if (!testOdemesi) {
    p.push(
      `Son düzenleme günü: ${tarihYaz(sonGun)} (VUK md. 231/5: ödemeden itibaren en geç ` +
        `${FATURA_DUZENLEME_SURESI_GUN} gün; geç kalan fatura düzenlenmemiş sayılır)`,
    );
  }
  if (kayitliNo) {
    // Talimat ÇELİŞMESİN (inceleme M3): "kesin" ile "kesmeyin" aynı postada
    // durmaz — karar numaranın ne olduğunu bilen yöneticinin.
    p.push(
      `⚠ Bu havale kaydına daha önce fatura/proforma no girilmiş: ${kayitliNo}. Gerçek faturaysa ` +
        "İKİNCİ KEZ KESMEYİN; proformaysa faturayı aşağıdaki bilgilerle NES'te kesin.",
    );
  }

  p.push(`Alıcı: ${unvan}`);
  if (tek(m.tcKimlikNo)) p.push(`T.C. kimlik no: ${tek(m.tcKimlikNo)}`);
  if (tek(m.vergiNo)) {
    p.push(`VKN: ${tek(m.vergiNo)}${tek(m.vergiDairesi) ? ` · Vergi dairesi: ${tek(m.vergiDairesi)}` : ''}`);
  }
  const yer = [tek(m.ilce), tek(m.il)].filter(Boolean).join(' / ');
  const adres = [tek(m.adres), yer].filter(Boolean).join(', ');
  if (adres) p.push(`Adres: ${adres}`);
  p.push(`Faturanın gönderileceği e-posta: ${tek(m.eposta)}`);

  for (const k of t.kalemler) {
    p.push(
      `Kalem: ${tek(k.ad)}${tek(k.aciklama) ? ` (${tek(k.aciklama)})` : ''} — ${k.miktar} ${tek(k.birim)} × ` +
        `${tutarYaz(k.birimFiyat, pb)} (KDV hariç), KDV %${k.kdvOrani}`,
    );
  }
  p.push(
    `Matrah: ${tutarYaz(tutar.matrah, pb)} · KDV: ${tutarYaz(tutar.kdv, pb)} · ` +
      `Toplam (tahsil edilen, KDV dahil): ${tutarYaz(tutar.toplam, pb)}`,
  );

  if (!testOdemesi && !kayitliNo) {
    p.push(
      "NES'te e-Arşiv faturayı yukarıdaki alıcı e-postasıyla kesin; NES'in otomatik e-posta gönderimi " +
        'açıksa fatura müşteriye kendiliğinden gider. Alıcı e-Fatura mükellefiyse fatura GİB üzerinden ' +
        "posta kutusuna gider; e-posta kopyasını NES'ten elle gönderin.",
    );
  }
  p.push(
    `Aynı tahsilat kodu (${t.harciAnahtar}) ikinci kez gelirse fatura BİR kez kesilir. ` +
      'Bu e-posta faturanın kendisi değildir, müşteriye iletmeyin.',
  );

  if (testOdemesi) {
    return {
      konu: `[MetaPriceX] TEST ödemesi — fatura KESMEYİN — ${unvan} — ${referans}`,
      baslik: 'Test ödemesi — fatura kesilmez',
      paragraflar: p,
    };
  }
  if (kayitliNo) {
    return {
      konu: `[MetaPriceX] ${gecikmeOnEki}Havale faturası kayıtlı — kontrol edin — ${unvan} — ${kayitliNo}`,
      baslik: 'Fatura numarası kayıtlı — kontrol edin',
      paragraflar: p,
    };
  }
  return {
    konu: `[MetaPriceX] ${gecikmeOnEki}Fatura kesilecek — ${unvan} — ${tutarYaz(tutar.toplam, pb)} — ${referans}`,
    baslik: sureGecti ? "NES'te kesilecek fatura — SÜRESİ GEÇTİ" : "NES'te kesilecek fatura",
    paragraflar: p,
  };
}
