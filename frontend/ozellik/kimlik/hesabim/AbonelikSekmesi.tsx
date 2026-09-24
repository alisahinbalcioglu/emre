'use client';

/**
 * HESABIM › ABONELİK — paket kartı, bu dönemki kullanım, iptal (23.09.2026).
 *
 * Yalnız firma SAHİBİ görür. Eski sayfadaki "Erişim Yetenekleri" bölümü paket
 * kartına, "Abonelik yönetimi ▾" içinde gizli duran iptal bağı kendi satırına
 * taşındı.
 *
 * ⚠ ABONELİK BİLGİSİ `ozet`TEN OKUNUR (`abonelik-ozeti.ts`), eski
 * `UserSubscription` tablosundan DEĞİL — o tablo 03.09'da `/abonelik`teki
 * gerçek kayıtla çelişiyordu ("MEP — Süresiz" vs "miras-pro AKTİF").
 *
 * ⚠ SABİT LİMİT YOK (Faz 6, 14.09): paketin tek gerçek kotası çeviri kotasıdır
 * ve sunucudan (`GET /ai/translate/kota`) okunur. Tarihi bu dosya BİÇİMLEMEZ:
 * yenilenme günü `ozet.yenilenmeGunu`dur (tek biçimleyici `trTarih`).
 */
import Link from 'next/link';
import { CalendarDays, CheckCircle2, Crown, Lock, Wrench, Zap } from 'lucide-react';
import api from '@/ortak/lib/api';
import { cn } from '@/ortak/lib/utils';
import { toast } from '@/ortak/hooks/use-toast';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import type { AbonelikOzeti } from '@/ozellik/odeme/abonelik-ozeti';
import { sayiYaz } from '@/ozellik/odeme/paket-bicim';
import { bekleyenDegisimCumlesi } from '@/ozellik/odeme/paket-degisimi';
import type { HesapProfili, KotaDurumu } from './hesap-tipleri';
import { IKINCIL_DUGME, SatirKarti, TEHLIKE_DUGME } from './hesabim-ui';

/** Durum rozetinin rengi — metin `ozet.durumEtiketi`nden gelir, burada yalnız ton. */
const DURUM_TONU: Record<string, { kutu: string; nokta: string }> = {
  AKTIF: { kutu: 'bg-green-50 text-green-800', nokta: 'bg-green-600' },
  DENEME: { kutu: 'bg-blue-50 text-blue-800', nokta: 'bg-blue-600' },
  ODEME_BEKLIYOR: { kutu: 'bg-amber-50 text-amber-800', nokta: 'bg-amber-500' },
  KISITLI: { kutu: 'bg-amber-50 text-amber-800', nokta: 'bg-amber-500' },
  ASKIDA: { kutu: 'bg-red-50 text-red-700', nokta: 'bg-red-600' },
};
const NOTR_TON = { kutu: 'bg-gray-100 text-gray-700', nokta: 'bg-gray-400' };

export function AbonelikSekmesi({
  profile,
  ozet,
  paketliMi,
  ustPaketteMi,
  sahipMi,
  ceviriKota,
  teklifSayisi,
}: {
  profile: HesapProfili;
  ozet: AbonelikOzeti;
  paketliMi: boolean;
  ustPaketteMi: boolean;
  sahipMi: boolean;
  ceviriKota: KotaDurumu;
  teklifSayisi: number | null;
}) {
  const { refresh, erisim } = useCapabilities();
  const kota = ceviriKota.durum === 'hazir' ? ceviriKota.kota : null;
  const ton = DURUM_TONU[ozet.durum] ?? NOTR_TON;

  async function iptalEt() {
    if (!confirm('Aboneliğinizi iptal etmek istediğinize emin misiniz? Dönem sonuna kadar erişiminiz sürer.')) return;
    try {
      await api.post('/abonelik/iptal', {});
      await refresh();
      toast({ title: 'Aboneliğiniz iptal edildi', description: 'Dönem sonuna kadar erişiminiz sürer.' });
    } catch {
      toast({ variant: 'destructive', title: 'İptal işlemi tamamlanamadı', description: 'Lütfen tekrar deneyin.' });
    }
  }

  return (
    <>
      {/* ── PAKET ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="paket-baslik" className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-blue-700">
            <Crown className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="paket-baslik" className="text-lg font-semibold text-gray-900">{ozet.baslik}</h2>
              {ozet.durumEtiketi && (
                <span className={cn('inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-xs font-semibold', ton.kutu)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', ton.nokta)} aria-hidden />
                  {ozet.durumEtiketi}
                </span>
              )}
            </div>
            {/* ⚠ 2.15: paket yokken paket tarifi YAZILMAZ; neden aynı yanıtın
                `erisim` alanından (`ozet.durumEtiketi`) rozette okunur. */}
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-gray-500">
              {paketliMi && <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              {paketliMi ? ozet.altMetin : 'Etkin aboneliğiniz yok'}
            </p>
            {/* 23.09 — BEKLEYEN PAKET DEĞİŞİMİ. Müşteri aboneliğini bu sekmede
                yönetiyor; düşürme planladıysa "hangi tarihte hangi pakete"
                burada da görünmeli, yalnız /abonelik'te değil. Kaynak aynı:
                `ErisimKarari.paketGecisi` (`/auth/me`), cümle aynı modülden. */}
            {paketliMi && bekleyenDegisimCumlesi(erisim?.paketGecisi) && (
              <p className="mt-1 text-[13px] font-medium text-blue-700">
                {bekleyenDegisimCumlesi(erisim?.paketGecisi)}
              </p>
            )}
          </div>
          <Link href="/abonelik" className={IKINCIL_DUGME}>
            Paketleri gör
          </Link>
        </div>

        {/* ⚠ 2.15: HAK LİSTESİ PAKETE BAĞLI. Paket yokken "Sınırsız teklif"
            yazmak, adı basmayıp HAKLARI basmak olurdu. */}
        {paketliMi && (
          <>
            <div className="my-5 h-px bg-[#eef0f3]" />
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-gray-600">Paket kapsamı</h3>
                <ul className="mt-3 flex flex-col gap-2.5">
                  <li className="flex items-start gap-2 text-sm text-gray-900">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
                    Sınırsız teklif
                  </li>
                  {kota && (
                    <li className="flex items-start gap-2 text-sm text-gray-900">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
                      Dönem başına {sayiYaz(kota.kota.satir)} satır çeviri (en fazla {sayiYaz(kota.kota.dosya)} dosya)
                    </li>
                  )}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-gray-600">Yetenekler</h3>
                <div className="mt-3 flex flex-col gap-2.5">
                  <YetenekSatiri
                    ad="Mekanik"
                    simge={<Wrench className="h-[15px] w-[15px] text-blue-700" aria-hidden />}
                    yetenek={profile.capabilities.mechanical}
                  />
                  <YetenekSatiri
                    ad="Elektrik"
                    simge={<Zap className="h-[15px] w-[15px] text-amber-700" aria-hidden />}
                    yetenek={profile.capabilities.electrical}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ⚠ 2.15: KOŞUL `tier === 'core'` İDİ ve paket YOKKEN çağrı
            KAYBOLUYORDU — tam da en çok gereken müşteride. Üst pakettekiler
            (pro/suite) görmez. */}
        {!ustPaketteMi && (
          <div className="mt-5 rounded-[10px] border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-[13px] font-semibold text-blue-900">
              {paketliMi ? 'Pro pakete geçin' : 'Devam etmek için bir paket seçin'}
            </p>
            <p className="mt-0.5 text-[13px] text-blue-800">
              {paketliMi
                ? 'İşçilik fiyatlandırması ve DWG/DXF metrajı Pro pakete dâhildir.'
                : 'Etkin bir paketiniz yok. Ürünü kullanmaya devam etmek için bir paket seçin.'}
            </p>
          </div>
        )}
      </section>

      {/* ── BU DÖNEMKİ KULLANIM ───────────────────────────────────────── */}
      <section aria-labelledby="kullanim-baslik" className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 id="kullanim-baslik" className="text-base font-semibold text-gray-900">Bu dönemki kullanım</h2>
        {/* "bu dönem" = ABONELİK dönemi, takvim ayı değil; yenilenme günü
            paket kartındakiyle AYNI kaynaktan (`ozet.yenilenmeGunu`). */}
        {kota && ozet.yenilenmeGunu && (
          <p className="mt-1 text-[13px] text-gray-500">Kotalar {ozet.yenilenmeGunu} tarihinde yenilenir.</p>
        )}
        {/* Kısıtlı/askıdaki firmada kota görünür ama çeviri 403 alır —
            "kalan 3.000 satır" yazıp kapalı olduğunu söylememek yanıltır. */}
        {kota && kota.ceviriAcik === false && (
          <p className="mt-2 text-[13px] font-medium text-amber-700">
            Aboneliğiniz kısıtlı olduğu için çeviri şu an kapalı.
          </p>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {kota ? (
            <>
              <KullanimKutusu baslik="Çeviri" kullanilan={kota.kullanilanSatir} tavan={kota.kota.satir} birim="satır" />
              <KullanimKutusu baslik="Çevrilen dosya" kullanilan={kota.kullanilanDosya} tavan={kota.kota.dosya} birim="dosya" />
            </>
          ) : (
            <div className="rounded-[10px] border border-[#eef0f3] p-4 sm:col-span-2">
              <p className="text-[13px] text-gray-600">Çeviri</p>
              <p className="mt-1.5 text-[13px] text-gray-500">
                {ceviriKota.durum === 'hata'
                  ? 'Çeviri kotası şu an okunamadı.'
                  : ceviriKota.durum === 'yukleniyor'
                    ? 'Yükleniyor…'
                    : 'Aktif aboneliğiniz olmadığı için çeviri kotası yok.'}
              </p>
            </div>
          )}
          <div className="rounded-[10px] border border-[#eef0f3] p-4">
            <p className="text-[13px] text-gray-600">Toplam teklif</p>
            <p className="mt-1.5 text-xl font-semibold tracking-[-0.01em] text-gray-900">
              {teklifSayisi === null ? '—' : sayiYaz(teklifSayisi)}
            </p>
            <p className="mt-2.5 text-xs text-gray-500">Tüm zamanlar</p>
          </div>
        </div>
      </section>

      {/* ── İPTAL ─────────────────────────────────────────────────────────
          03.09 kullanıcı kararı: "Aboneliği iptal et seçeneği minimum 3
          tıklama ile görülebilsin — müşterinin gözüne sokmayalım." Eskiden
          "Abonelik yönetimi ▾" açılır bölümündeydi; sekmeler gelince yerini
          ABONELİK SEKMESİ aldı. Yol yine dört adım: Hesabım → Abonelik
          sekmesi → düğme → onay (`IPTAL_ADIMLARI`).

          ⚠ SAHİP KAPISI: `POST /abonelik/iptal` sunucuda `@FirmaRolu('sahip')`.
          Sekme üyeye zaten çizilmiyor; koşul yine de burada durur ki bileşen
          başka yerde kullanılırsa üyeye çalışmayan bir düğme açılmasın. */}
      {ozet.iptalEdilebilir && sahipMi && (
        <SatirKarti baslik="Aboneliği iptal et" aciklama="İptal ettiğinizde dönem sonuna kadar erişiminiz sürer.">
          <button type="button" onClick={iptalEt} className={TEHLIKE_DUGME}>
            Aboneliği iptal et
          </button>
        </SatirKarti>
      )}
    </>
  );
}

function YetenekSatiri({
  ad,
  simge,
  yetenek,
}: {
  ad: string;
  simge: React.ReactNode;
  yetenek: { material: boolean; labor: boolean; dwg: boolean };
}) {
  const kalemler = [
    { etiket: 'Malzeme', acik: yetenek.material },
    { etiket: 'İşçilik', acik: yetenek.labor },
    { etiket: 'DWG/PDF', acik: yetenek.dwg },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="inline-flex w-24 items-center gap-1.5 text-sm font-semibold text-gray-900">
        {simge}
        {ad}
      </span>
      {kalemler.map((k) =>
        k.acik ? (
          <span key={k.etiket} className="inline-flex h-6 items-center rounded-full bg-slate-100 px-2.5 text-xs font-medium text-slate-700">
            {k.etiket}
          </span>
        ) : (
          <span
            key={k.etiket}
            className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 text-xs font-medium text-gray-400"
          >
            <Lock className="h-3 w-3" aria-hidden />
            {k.etiket}
            <span className="sr-only"> (pakette yok)</span>
          </span>
        ),
      )}
    </div>
  );
}

function KullanimKutusu({
  baslik,
  kullanilan,
  tavan,
  birim,
}: {
  baslik: string;
  kullanilan: number;
  tavan: number;
  birim: string;
}) {
  const yuzde = tavan > 0 ? Math.min(100, Math.round((kullanilan / tavan) * 100)) : 0;
  return (
    <div className="rounded-[10px] border border-[#eef0f3] p-4">
      <p className="text-[13px] text-gray-600">{baslik}</p>
      <p className="mt-1.5 text-xl font-semibold tracking-[-0.01em] text-gray-900">
        {sayiYaz(kullanilan)}{' '}
        <span className="text-[13px] font-medium text-gray-500">
          / {sayiYaz(tavan)} {birim}
        </span>
      </p>
      <div
        role="progressbar"
        aria-label={`${baslik} kullanımı`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={yuzde}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className={cn('h-full rounded-full', yuzde > 95 ? 'bg-red-500' : yuzde > 80 ? 'bg-amber-500' : 'bg-blue-600')}
          style={{ width: `${yuzde}%` }}
        />
      </div>
    </div>
  );
}
