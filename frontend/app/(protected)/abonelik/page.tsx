'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/ortak/lib/api';
import { KAPSAM_ETIKET, SEVIYE_ETIKET, donemEki, kotaCumlesi, odemeDenemeNotu, vitrinFiyati, type Paket } from '@/ozellik/odeme/paket-bicim';
import { DenemeSatiri } from '@/ozellik/odeme/DenemeSatiri';
import {
  ALAN_ETIKET,
  ZORUNLU_ALANLAR,
  bosFaturaKimligi,
  eksikAlanlar,
  govdeyeCevir,
  type FaturaKimligi,
} from '@/ozellik/odeme/fatura-kimligi';
import { IyzicoFormu } from '@/ozellik/odeme/IyzicoFormu';
import {
  ON_BILGILENDIRME_YOLU,
  SOZLESME_ONAYI_BASLANGIC,
  SOZLESME_ONAY_METNI,
  SOZLESME_YOLU,
  sozlesmeOnayiHatasi,
} from '@/ozellik/odeme/sozlesme-onayi';
import {
  bicimle as telefonBicimle,
  haneleriAl as telefonHaneleri,
  telefonHatasi,
} from '@/ozellik/odeme/telefon-bicim';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ABONELIK / PAKET SECIMI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU SAYFA ERISIM KAPISI TASIMAZ ve bu bir gozden kacma DEGILDIR.
 *  Askidaki bir firmanin odeme yapabilecegi TEK kapi burasidir; kapatilirsa
 *  musteri odeyemez ve askidan CIKAMAZ (kilitlenme). Sunucu tarafinda da
 *  ayni kural var: `Yetenek.ABONELIK_YONET` her durumda true doner.
 *
 *  Kart formu iyzico'nun BARINDIRILAN formudur: `POST /abonelik/basla`
 *  bir HTML parcasi (checkoutFormContent) doner, sayfaya gomulur. Kart
 *  bilgisi BIZIM sunucumuza HIC UGRAMAZ.
 *
 *  DIKKAT — abonelikte 3D Secure YOKTUR (iyzico TR dokumani: "ilk islem
 *  dahil tum islemler NON3D"). mdStatus / 3DS callback beklenmez.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function AbonelikSayfasi() {
  // ⚠ `erisim`/`refresh` ARTIK KULLANILMIYOR: durum karti ve iptal
  // dugmesi hesap sayfasina tasindi (03.09). Kancayi bos cagirmak yerine
  // import da kaldirildi — olu baglanti birakmayalim.
  const [paketler, setPaketler] = useState<Paket[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [secilen, setSecilen] = useState<string | null>(null);
  const [formHtml, setFormHtml] = useState<string | null>(null);
  const [faturaAcik, setFaturaAcik] = useState(false);
  const [fatura, setFatura] = useState<FaturaKimligi>(bosFaturaKimligi());
  const [gonderiliyor, setGonderiliyor] = useState(false);
  // Faz 6.12a: kart "deneme var" dediği hâlde formdaki telefon/e-posta eskisiyle
  // eşleştiyse sunucu kararı değiştirir; not kart formunun ÜSTÜNDE gösterilir.
  const [denemeNotu, setDenemeNotu] = useState<string | null>(null);
  // Faz 6.4: mesafeli satış onayı. ÖNCEDEN İŞARETSİZ başlar — işaretli
  // gelen bir kutu onay sayılmaz. Sunucudaki kapı `@Equals(true)`.
  const [sozlesmeOnayi, setSozlesmeOnayi] = useState<boolean>(SOZLESME_ONAYI_BASLANGIC);

  const paketleriGetir = useCallback(async () => {
    try {
      const { data } = await api.get<Paket[]>('/abonelik/paketler');
      setPaketler(Array.isArray(data) ? data : []);
    } catch {
      setHata('Paketler yüklenemedi. Lütfen sayfayı yenileyin.');
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    paketleriGetir();
  }, [paketleriGetir]);

  /**
   * Paket secildi — ONCE fatura kimligi toplanir, SONRA kart formu acilir.
   *
   * ⚠ 02.09'DA OLCULDU: burasi dogrudan `/abonelik/basla`ya YALNIZ
   * `paketSurumuId` gonderiyordu. Sunucu `p.musteri.ad` diye acıyor ve
   * TypeError firlatiyordu → 500 → ekranda "Odeme baslatilamadi". Yani
   * HICBIR musteri odeme yapamiyordu. Fatura alanlari iyzico tarafinda
   * zorunlu; sunucuda otomatik doldurulamiyor cunku `Firma` semasinda
   * TELEFON alani hic yok.
   */
  function paketiSec(paketSurumuId: string) {
    setHata(null);
    setSecilen(paketSurumuId);
    setFaturaAcik(true);
  }

  async function odemeyeGec() {
    if (!secilen) return;
    const eksik = eksikAlanlar(fatura);
    if (eksik.length) {
      setHata(`Şu alanlar zorunlu: ${eksik.join(', ')}`);
      return;
    }
    // Bicim hatasi AYRI mesaj alir: "eksik" ile "yarim" ayni sey degil.
    const telHata = telefonHatasi(fatura.telefon);
    if (telHata) {
      setHata(telHata);
      return;
    }
    // Düğme zaten kapalı; bu ikinci kapı "sessiz dal yok" kuralı içindir —
    // klavyeyle ya da eski bir durumla buraya düşülürse gerekçe yazılır.
    const onayHatasi = sozlesmeOnayiHatasi(sozlesmeOnayi);
    if (onayHatasi) {
      setHata(onayHatasi);
      return;
    }
    setHata(null);
    setGonderiliyor(true);
    try {
      const { data } = await api.post<{ formIcerigi: string; denemeHakki?: boolean }>('/abonelik/basla', {
        paketSurumuId: secilen,
        musteri: govdeyeCevir(fatura),
        sozlesmeOnayi,
      });
      setDenemeNotu(odemeDenemeNotu(paketler.find((p) => p.surum.paketSurumuId === secilen)?.surum, data));
      setFormHtml(data.formIcerigi);
    } catch (e: any) {
      const m = e?.response?.data?.message ?? e?.response?.data?.mesaj;
      setHata(typeof m === 'string' ? m : 'Ödeme başlatılamadı.');
    } finally {
      setGonderiliyor(false);
    }
  }

  // ── Fatura kimligi adimi (kart formundan ONCE) ──────────────────────
  // iyzico abonelik formu bu alanlari ZORUNLU tutar. `Firma` semasinda
  // telefon alani olmadigi icin sunucu tarafinda otomatik doldurulamaz.
  if (faturaAcik && !formHtml) {
    const secilenPaket = paketler.find((p) => p.surum.paketSurumuId === secilen);
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-2xl font-bold">Fatura bilgileri</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {secilenPaket ? `${secilenPaket.ad} — ` : ''}
          Faturanızın kesilebilmesi için bu bilgiler gerekli. Kart bilgisi bir
          sonraki adımda, doğrudan iyzico formunda alınır.
        </p>

        {hata && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {hata}
          </div>
        )}

        <div className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
          {ZORUNLU_ALANLAR.map((alan) => (
            <div key={alan} className={alan === 'adres' ? 'sm:col-span-2' : ''}>
              <label htmlFor={`fatura-${alan}`} className="mb-1 block text-xs font-medium">
                {ALAN_ETIKET[alan]} <span className="text-red-600">*</span>
              </label>
              <input
                id={`fatura-${alan}`}
                type={alan === 'eposta' ? 'email' : alan === 'telefon' ? 'tel' : 'text'}
                value={alan === 'telefon' ? telefonBicimle(fatura.telefon) : fatura[alan]}
                onChange={(e) =>
                  setFatura({
                    ...fatura,
                    // ⚠ Telefonda durumda MASKELI METIN DEGIL, YALNIZ HANELER
                    // tutulur. Maske daima "+90 " ile basladigi icin maskeli
                    // metni saklasaydik BOS alan DOLU gorunur ve zorunlu-alan
                    // kapisi (`eksikAlanlar`, bos-dize kontrolu) sessizce
                    // delinirdi.
                    [alan]:
                      alan === 'telefon'
                        ? telefonHaneleri(e.target.value)
                        : e.target.value,
                  })
                }
                placeholder={
                  alan === 'telefon'
                    ? '+90 (5xx) (xxx) (xx) (xx)'
                    : alan === 'kimlikNo'
                      ? '11 haneli TC veya vergi no'
                      : undefined
                }
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div>
            <label htmlFor="fatura-postaKodu" className="mb-1 block text-xs font-medium">
              {ALAN_ETIKET.postaKodu}{' '}
              <span className="text-muted-foreground">(isteğe bağlı)</span>
            </label>
            <input
              id="fatura-postaKodu"
              type="text"
              value={fatura.postaKodu ?? ''}
              onChange={(e) => setFatura({ ...fatura, postaKodu: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Faz 6.4: satın almadan ÖNCE onay. İki metne de yeni sekmede
            açılan bağlantı var; metni okumadan onaylatmak, onayı dayanaksız
            bırakırdı. */}
        <div className="mt-6 rounded-lg border bg-slate-50 p-3">
          <label htmlFor="sozlesme-onayi" className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
            <input
              id="sozlesme-onayi"
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={sozlesmeOnayi}
              onChange={(e) => {
                setSozlesmeOnayi(e.target.checked);
                setHata(null);
              }}
            />
            <span>
              <a href={ON_BILGILENDIRME_YOLU} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline">
                Ön Bilgilendirme Formu
              </a>
              {"'nu ve "}
              <a href={SOZLESME_YOLU} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline">
                Mesafeli Satış Sözleşmesi
              </a>
              {"'ni okudum, onaylıyorum."}
              <span className="sr-only">{SOZLESME_ONAY_METNI}</span>
            </span>
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              setFaturaAcik(false);
              setSecilen(null);
              setHata(null);
            }}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Geri
          </button>
          <button
            type="button"
            disabled={gonderiliyor || !sozlesmeOnayi}
            onClick={odemeyeGec}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {gonderiliyor ? 'Hazırlanıyor…' : 'Ödemeye geç'}
          </button>
        </div>
      </div>
    );
  }

  // ── Kart formu acildiysa yalniz onu goster ──────────────────────────
  if (formHtml) {
    return (
      // Odeme ekrani fatura adimindan GENIS: iyzico formu responsive kipte
      // kabin genisligini alir, dar bir modal olarak sikismaz.
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-2xl font-bold">Ödeme</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Kart bilgileriniz doğrudan iyzico'ya iletilir, sunucularımıza kaydedilmez.
        </p>
        {denemeNotu && (
          <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {denemeNotu}
          </div>
        )}
        {/*
          ⚠ `dangerouslySetInnerHTML` KULLANILAMAZ. 02.09'da olculdu: bu ekran
          bombos kaliyordu. HTML spesifikasyonu geregi `innerHTML` ile eklenen
          `<script>` ASLA YURUTULMEZ; iyzico'nun donen icerigi ise neredeyse
          tamamen bir betiktir — formu o cizer. `IyzicoFormu` betikleri
          `createElement` ile YENIDEN uretir, boylece calisirlar.
        */}
        <IyzicoFormu html={formHtml} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold">Abonelik</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Paketinizi seçin. Dolar tutarları referanstır; tahsilat TL olarak,
        KDV dahil yapılır.
      </p>

      {/* ⚠ MEVCUT DURUM KARTI VE IPTAL DUGMESI BURADAN KALDIRILDI
          (03.09 kullanici karari): "Aboneligi iptal et dugmesini buradan
          kaldir, musterinin gozune sokmayalim. Abonelik bilgisi komple
          hesap sayfasina tasinsin, iptal en az UC tiklama derinlikte olsun."
          Yeni yeri: `app/(protected)/profile/page.tsx` → Abonelik bolumu.
          Bu sayfa artik YALNIZ paket secimidir.
          ⚠ Sayfanin KENDISI erisim kapisi tasimaz ve tasimamali: askidaki
          firmanin odeme yapabilecegi TEK kapi burasi (dosya basindaki not). */}

      {hata && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {hata}
        </div>
      )}

      {yukleniyor ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Paketler yükleniyor…</div>
      ) : paketler.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 py-12 text-center text-sm text-muted-foreground">
          Şu anda satışta paket bulunmuyor. Lütfen bizimle iletişime geçin.
        </div>
      ) : (
        // ⚠ KART HİZASI (Faz 6.1 kapanış, 15.09): fiyat sayfasındaki kartlarla aynı
        // kural (FiyatKartlari.tsx). Her kart 5 satıra yayılır, satırları dış ızgaradan
        // alır: açıklaması uzun ya da hiç olmayan paket, komşusunun fiyatını ve
        // düğmesini kaydırmaz. Açıklama yoksa satır boş kutuyla tutulur.
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paketler.map((p) => (
            <div key={p.paketId} className="row-span-5 grid grid-rows-subgrid gap-0 rounded-xl border bg-card p-5">
              <div className="mb-3">
                <h2 className="text-lg font-bold">{p.ad}</h2>
                <div className="mt-1 flex flex-col items-start gap-1.5">
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {KAPSAM_ETIKET[p.kapsam] ?? p.kapsam}
                  </span>
                  <span className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                    {SEVIYE_ETIKET[p.seviye] ?? p.seviye}
                  </span>
                </div>
              </div>

              {p.aciklama ? (
                <p className="mb-3 text-sm text-muted-foreground">{p.aciklama}</p>
              ) : (
                <div aria-hidden="true" />
              )}

              <div className="mb-4">
                {/* VITRIN: dolar buyuk, TL altinda. Sozlesme tutari TL'dir;
                    ekran hangisinin baglayici oldugunu saklamaz. */}
                <span className="text-2xl font-bold">
                  {vitrinFiyati(p.surum).ana}
                </span>
                <span className="text-sm text-muted-foreground"> {donemEki(p.surum)}</span>
                {vitrinFiyati(p.surum).alt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {vitrinFiyati(p.surum).alt}
                  </p>
                )}
                {/* Faz 6.12a: deneme BİR KEZ — hakkı olmayana "daha önce kullanıldı". */}
                <DenemeSatiri surum={p.surum} />

              </div>

              <ul className="mb-5 space-y-1.5 text-sm">
                <li>· {p.kullaniciHakki} kullanıcıya kadar</li>
                <li>
                  ·{' '}
                  {p.aylikTeklifHakki === null
                    ? 'Sınırsız teklif'
                    : `Ayda ${p.aylikTeklifHakki} teklif`}
                </li>
                <li>· DWG ve DXF metrajı {p.dwgAktif ? 'dâhil' : 'dâhil değil'}</li>
                {/* Faz 6 (13.09): kota fiyat sayfasıyla AYNI kaynaktan (sunucu tablosu). */}
                {p.ceviriKotasi && <li>· {kotaCumlesi(p.ceviriKotasi, p.surum)}</li>}
              </ul>

              <button
                type="button"
                onClick={() => paketiSec(p.surum.paketSurumuId)}
                className="mt-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Bu paketi seç
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
