'use client';

/**
 * HESABIM › FİRMA — "Firma ve logo" + "Fatura bilgileri" (23.09.2026 tasarımı).
 *
 * Yalnız firma SAHİBİ görür (`hesabim.ts` sekme kararı); sunucu da düzenlemeyi
 * `sahipMi` ile kapıyor (`firma.servisi.ts`). Her kart YALNIZ kendi alanlarını
 * gönderir: `PATCH /firma` gövdede olmayan alana dokunmaz.
 *
 * ── ANTET ve FATURA: KODA GÖRE ÖLÇÜLDÜ (tasarım bunu istedi) ──────────────
 * Tasarım "Firma ve logo = antet, Fatura bilgileri = fatura" diye ayırıyordu.
 * Kod başka söylüyor (`backend/src/ozellik/cikti/utils/antet.ts`
 * `ANTET_FIRMA_ALANLARI`): antete unvan, adres, il/ilçe, telefon, fatura
 * e-postası, vergi dairesi, vergi no ve logo girer; GÖRÜNEN AD GİRMEZ (kayıtta
 * e-postadan türetilir, müşteriye firma adı diye gidemez). Görünen ad
 * e-postalarda ve ekip davetinde kullanılır; unvan boşsa faturaya o yazılır.
 * Kart açıklamaları bu ölçüme göre yazıldı.
 *
 * ⚠ WEBP antete BASILMAZ (`antetLogoNotu`): ipucu bunu söyler; yoksa kişi
 * logosunu yükler, çıktıda göremez ve sebebini bulamaz.
 */
import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Trash2, Upload } from 'lucide-react';
import api from '@/ortak/lib/api';
import { cn } from '@/ortak/lib/utils';
import type { HesapProfili } from './hesap-tipleri';
import {
  firmaTuruCoz, kimlikGovdesi, silinecekKimlikUyarisi, type FirmaTuru,
} from './hesabim';
import {
  ANA_DUGME, Alan, GIRDI, IKINCIL_DUGME, IZGARA, Kart, KaydetSeridi,
  TEHLIKE_DUGME, hataMetni, type IslemDurumu,
} from './hesabim-ui';

const FIRMA_TURLERI: { tur: FirmaTuru; etiket: string }[] = [
  { tur: 'sirket', etiket: 'Şirket (Ltd., A.Ş.)' },
  { tur: 'sahis', etiket: 'Şahıs şirketi' },
];

export function FirmaSekmesi({
  profile,
  onGuncellendi,
}: {
  profile: HesapProfili;
  onGuncellendi: (p: HesapProfili) => void;
}) {
  const f = profile.firma;

  // ── Kart 1 · Firma ve logo ────────────────────────────────────────────
  const [firmaAd, setFirmaAd] = useState({ ad: f?.ad ?? '', telefon: f?.telefon ?? '' });
  const [adKaydediliyor, setAdKaydediliyor] = useState(false);
  const [adDurum, setAdDurum] = useState<IslemDurumu | null>(null);
  const [logoIsleniyor, setLogoIsleniyor] = useState(false);
  const [logoSurum, setLogoSurum] = useState(0); // önizlemeyi tazelemek için
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Kart 2 · Fatura bilgileri ─────────────────────────────────────────
  const [tur, setTur] = useState<FirmaTuru>(() => firmaTuruCoz(f ?? {}));
  const [fatura, setFatura] = useState({
    unvan: f?.unvan ?? '',
    faturaEposta: f?.faturaEposta ?? '',
    vergiNo: f?.vergiNo ?? '',
    tcKimlikNo: f?.tcKimlikNo ?? '',
    vergiDairesi: f?.vergiDairesi ?? '',
    il: f?.il ?? '',
    ilce: f?.ilce ?? '',
    faturaAdresi: f?.faturaAdresi ?? '',
  });
  const [faturaKaydediliyor, setFaturaKaydediliyor] = useState(false);
  const [faturaDurum, setFaturaDurum] = useState<IslemDurumu | null>(null);

  const silinecek = silinecekKimlikUyarisi(tur, f ?? {});

  async function tazele() {
    const { data } = await api.get<HesapProfili>('/auth/me');
    onGuncellendi(data);
  }

  async function firmaKaydet(e: React.FormEvent) {
    e.preventDefault();
    setAdDurum(null);
    setAdKaydediliyor(true);
    try {
      await api.patch('/firma', { ad: firmaAd.ad, telefon: firmaAd.telefon });
      await tazele();
      setAdDurum({ tur: 'basari', metin: 'Firma bilgileri kaydedildi.' });
    } catch (err) {
      setAdDurum({ tur: 'hata', metin: hataMetni(err, 'Firma bilgileri kaydedilemedi.') });
    } finally {
      setAdKaydediliyor(false);
    }
  }

  async function faturaKaydet(e: React.FormEvent) {
    e.preventDefault();
    setFaturaDurum(null);
    setFaturaKaydediliyor(true);
    try {
      const { vergiNo, tcKimlikNo, faturaEposta, ...digerleri } = fatura;
      await api.patch('/firma', {
        ...digerleri,
        // ⚠ BOŞ E-POSTA `null` GİDER, '' DEĞİL (23.09 ÖLÇÜLDÜ): DTO
        // `@IsOptional() @IsEmail()` boş dizeyi "Fatura e-posta adresi gecerli
        // degil." diye REDDEDİYOR — fatura e-postası girilmemiş firma kartı
        // HİÇ kaydedemiyordu (eski formda da). `@IsOptional` `null`ı atlar,
        // servis `null` yazar: alan temizlenir.
        faturaEposta: faturaEposta.trim() || null,
        ...kimlikGovdesi(tur, { vergiNo, tcKimlikNo }),
      });
      await tazele();
      setFaturaDurum({ tur: 'basari', metin: 'Fatura bilgileri kaydedildi.' });
    } catch (err) {
      setFaturaDurum({ tur: 'hata', metin: hataMetni(err, 'Fatura bilgileri kaydedilemedi.') });
    } finally {
      setFaturaKaydediliyor(false);
    }
  }

  async function logoYukle(dosya: File) {
    setAdDurum(null);
    setLogoIsleniyor(true);
    try {
      const fd = new FormData();
      fd.append('file', dosya);
      await api.post('/firma/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await tazele();
      setLogoSurum((v) => v + 1);
      setAdDurum({ tur: 'basari', metin: 'Logo yüklendi.' });
    } catch (err) {
      setAdDurum({ tur: 'hata', metin: hataMetni(err, 'Logo yüklenemedi.') });
    } finally {
      setLogoIsleniyor(false);
    }
  }

  async function logoSil() {
    setAdDurum(null);
    setLogoIsleniyor(true);
    try {
      await api.delete('/firma/logo');
      await tazele();
      setLogoSurum((v) => v + 1);
      setAdDurum({ tur: 'basari', metin: 'Logo kaldırıldı.' });
    } catch (err) {
      setAdDurum({ tur: 'hata', metin: hataMetni(err, 'Logo kaldırılamadı.') });
    } finally {
      setLogoIsleniyor(false);
    }
  }

  const alan = (anahtar: keyof typeof fatura) => ({
    value: fatura[anahtar],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setFatura((o) => ({ ...o, [anahtar]: e.target.value })),
    className: GIRDI,
  });

  return (
    <>
      <form onSubmit={firmaKaydet}>
        <Kart
          id="firma"
          baslik="Firma ve logo"
          aciklama="Görünen ad e-postalarda ve ekip davetlerinde; telefon ve logo teklif çıktısının antedinde kullanılır."
          serit={
            <KaydetSeridi durum={adDurum}>
              <button type="submit" disabled={adKaydediliyor} className={ANA_DUGME}>
                {adKaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </KaydetSeridi>
          }
        >
          <div className={IZGARA}>
            <Alan id="f-ad" etiket="Görünen ad">
              <input
                id="f-ad"
                placeholder="Kısa ad"
                value={firmaAd.ad}
                onChange={(e) => setFirmaAd((o) => ({ ...o, ad: e.target.value }))}
                className={GIRDI}
              />
            </Alan>
            <Alan id="f-tel" etiket="Firma telefonu">
              <input
                id="f-tel"
                type="tel"
                placeholder="0212 000 00 00"
                value={firmaAd.telefon}
                onChange={(e) => setFirmaAd((o) => ({ ...o, telefon: e.target.value }))}
                className={GIRDI}
              />
            </Alan>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-[10px] border border-[#eef0f3] bg-neutral-50 p-4">
            <LogoOnizleme logoVar={!!f?.logoVar} surum={logoSurum} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">Firma logosu</p>
              <p className="mt-0.5 text-xs text-gray-500">
                PNG veya JPEG · en fazla 2 MB (WEBP teklif çıktısına basılmaz)
              </p>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const dosya = e.target.files?.[0];
                if (dosya) void logoYukle(dosya);
                // Aynı dosyayı ikinci kez seçebilmek için değeri sıfırla.
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={logoIsleniyor}
                onClick={() => logoInputRef.current?.click()}
                className={IKINCIL_DUGME}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden />
                {f?.logoVar ? 'Logoyu değiştir' : 'Logo yükle'}
              </button>
              {f?.logoVar && (
                <button type="button" disabled={logoIsleniyor} onClick={logoSil} className={TEHLIKE_DUGME}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Kaldır
                </button>
              )}
            </div>
          </div>
        </Kart>
      </form>

      <form onSubmit={faturaKaydet}>
        <Kart
          id="fatura"
          baslik="Fatura bilgileri"
          aciklama="Faturada kullanılır; T.C. kimlik no dışındakiler teklif çıktısının antedinde de yer alır. Boş bırakılan alan faturayı engellemez ama fatura elle işleme düşer."
          serit={
            <KaydetSeridi durum={faturaDurum}>
              <button type="submit" disabled={faturaKaydediliyor} className={ANA_DUGME}>
                {faturaKaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </KaydetSeridi>
          }
        >
          <div
            role="radiogroup"
            aria-label="Firma türü"
            className="mt-5 inline-flex gap-0.5 rounded-lg bg-slate-100 p-[3px]"
            onKeyDown={(e) => {
              // İki seçenekli radyo grubu: ok tuşları seçimi değiştirir.
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
              e.preventDefault();
              const yeni: FirmaTuru = tur === 'sirket' ? 'sahis' : 'sirket';
              setTur(yeni);
              e.currentTarget.querySelector<HTMLButtonElement>(`[data-tur="${yeni}"]`)?.focus();
            }}
          >
            {FIRMA_TURLERI.map((t) => (
              <button
                key={t.tur}
                type="button"
                role="radio"
                data-tur={t.tur}
                aria-checked={tur === t.tur}
                tabIndex={tur === t.tur ? 0 : -1}
                onClick={() => setTur(t.tur)}
                className={cn(
                  'h-8 rounded-md px-3.5 text-[13px] transition-colors',
                  tur === t.tur
                    ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.12)]'
                    : 'font-medium text-gray-600 hover:text-gray-900',
                )}
              >
                {t.etiket}
              </button>
            ))}
          </div>
          {/* Canlı bölge: tür değişince ekran okuyucu da duysun. */}
          {silinecek && <p role="status" className="mt-2 text-[13px] text-amber-700">{silinecek}</p>}

          <div className={IZGARA}>
            <Alan id="fa-unvan" etiket="Resmi unvan">
              <input id="fa-unvan" placeholder="Örn. Acme Mühendislik Ltd. Şti." {...alan('unvan')} />
            </Alan>
            <Alan id="fa-eposta" etiket="Fatura e-postası">
              <input id="fa-eposta" type="email" {...alan('faturaEposta')} />
            </Alan>
            {tur === 'sirket' ? (
              <Alan id="fa-vkn" etiket="Vergi no">
                <input id="fa-vkn" inputMode="numeric" {...alan('vergiNo')} />
              </Alan>
            ) : (
              <Alan id="fa-tckn" etiket="TC kimlik no">
                <input id="fa-tckn" inputMode="numeric" {...alan('tcKimlikNo')} />
              </Alan>
            )}
            <Alan id="fa-vd" etiket="Vergi dairesi">
              <input id="fa-vd" {...alan('vergiDairesi')} />
            </Alan>
            <Alan id="fa-il" etiket="İl">
              <input id="fa-il" {...alan('il')} />
            </Alan>
            <Alan id="fa-ilce" etiket="İlçe">
              <input id="fa-ilce" {...alan('ilce')} />
            </Alan>
            <Alan id="fa-adres" etiket="Fatura adresi" genis>
              <input id="fa-adres" {...alan('faturaAdresi')} />
            </Alan>
          </div>
        </Kart>
      </form>
    </>
  );
}

/**
 * Logo önizlemesi.
 *
 * ⚠ ESKİ HÂL `<img src="/api/firma/logo">` İDİ VE HİÇ GÖRÜNMÜYORDU: sunucu
 * kimliği YALNIZ `Authorization` başlığından okur (`jwt.strategy.ts`
 * `fromAuthHeaderAsBearerToken`), `<img>` isteği o başlığı taşımaz → 401 ve
 * kırık görsel. Logo artık oturumlu istekle çekilir, nesne adresiyle çizilir.
 * `surum` her yükleme/silmede değişir; eski görsel ekranda kalmaz.
 */
function LogoOnizleme({ logoVar, surum }: { logoVar: boolean; surum: number }) {
  const [adres, setAdres] = useState<string | null>(null);

  useEffect(() => {
    if (!logoVar) {
      setAdres(null);
      return;
    }
    let iptal = false;
    let olusturulan: string | null = null;
    api
      .get<Blob>('/firma/logo', { responseType: 'blob' })
      .then(({ data }) => {
        if (iptal) return;
        olusturulan = URL.createObjectURL(data);
        setAdres(olusturulan);
      })
      .catch(() => {
        // Önizleme okunamazsa boş kutu kalır; yükleme/silme düğmeleri çalışır.
        if (!iptal) setAdres(null);
      });
    return () => {
      iptal = true;
      if (olusturulan) URL.revokeObjectURL(olusturulan);
    };
  }, [logoVar, surum]);

  return (
    <div className="flex h-16 w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white text-slate-400">
      {adres ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={adres} alt="Firma logosu" className="max-h-14 max-w-[108px] object-contain" />
      ) : (
        <ImageIcon className="h-[22px] w-[22px]" aria-hidden />
      )}
    </div>
  );
}
