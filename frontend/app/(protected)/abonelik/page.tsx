'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/ortak/lib/api';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { KAPSAM_ETIKET, SEVIYE_ETIKET, donemEki, kotaCumlesi, odemeDenemeNotu, paketRozeti, vitrinFiyati, type Paket } from '@/ozellik/odeme/paket-bicim';
// 23.09 — paket değişimi: kartın yolu (satın al / geç / geçilemez) SUNUCUDAN
// (`degisim` alanı); bu modül yalnız ekrana çevirir.
import {
  bekleyenDegisimCumlesi,
  degisimOnayMetni,
  kartEylemi,
  mevcutPaketMi,
  type PaketGecisi,
} from '@/ozellik/odeme/paket-degisimi';
import { DenemeSatiri } from '@/ozellik/odeme/DenemeSatiri';
import { kucultmeUyarisi } from '@/ozellik/firma/ekip/koltuk-metinleri';
// ⚠ Paket adı/durum rozeti hesap sayfasıyla AYNI saf modülden: "miras-pro"
// müşteriye teknik kodla gösterilmez, durum kodu ekran adına çevrilir. İkinci
// bir çeviri yazmak iki ekranda iki farklı isim üretirdi.
import { abonelikOzeti, paketGorunenAdi } from '@/ozellik/odeme/abonelik-ozeti';
import {
  ALAN_ETIKET,
  ZORUNLU_ALANLAR,
  bosFaturaKimligi,
  eksikAlanlar,
  govdeyeCevir,
  vergiDairesiGerekli,
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
  // ⚠ 23.09: `refresh` YENIDEN kullaniliyor — yukseltme ozellikleri HEMEN
  // acar; kenar cubugu ve kapilar yeni paketi sayfa yenilenmeden gormeli.
  // (03.09'da durum karti ve iptal hesap sayfasina tasinmisti; o karar AYNEN.)
  const { refresh: yetenekleriYenile } = useCapabilities();
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

  // ── FAZ 7 F1b (§6.6): SAHIP KAPISI + KUCULTME UYARISI ─────────────────
  // ⚠ FAIL-CLOSED: `firmaRol` bilinmeden dugme CIZILMEZ. Sunucu zaten
  // reddeder (`FirmaRolGuard`), bu yalnizca uyeyi dolduramayacagi bir
  // odeme formuyla ugrastirmamak icin.
  const [firmaRol, setFirmaRol] = useState<string | null>(null);
  const [aktifKullanici, setAktifKullanici] = useState<number | null>(null);
  const [kucultmeSorusu, setKucultmeSorusu] = useState<{ id: string; metin: string } | null>(null);
  /**
   * ── MEVCUT PAKET (21.09.2026) ─────────────────────────────────────────
   * Ölçüldü: beş kartın beşinde de "Bu paketi seç" vardı; kullanıcı ZATEN
   * kullandığı pakete basabiliyordu ve ekranda hangisinde olduğunu söyleyen
   * hiçbir işaret yoktu. Bilgi ZATEN elde: aşağıdaki `/auth/me` çağrısı
   * `erisim`i de taşıyor (`ErisimKarari.paketKodu`) — YENİ İSTEK YOK.
   */
  const [erisim, setErisim] = useState<{
    paketKodu?: string | null;
    durum?: string | null;
    kalanGun?: number | null;
    /** 23.09 — bu dönem yapılmış paket değişimi (sunucu `ErisimKarari`). */
    paketGecisi?: PaketGecisi | null;
  } | null>(null);

  // ── 23.09: PAKET DEĞİŞİMİ ONAY PENCERESİ ──────────────────────────────
  // Sözleşme onayı BURADA DA zorunlu ve ÖNCEDEN İŞARETSİZ başlar: değişim
  // sözleşme bedelini (yeni paketin fiyatını) değiştirir; satın almadaki
  // onay yeni tutarı kapsamaz. Sunucu `@Equals(true)` ile ikinci kez bakar.
  const [degisimHedefi, setDegisimHedefi] = useState<Paket | null>(null);
  const [degisimOnayi, setDegisimOnayi] = useState<boolean>(SOZLESME_ONAYI_BASLANGIC);
  const [degisimGonderiliyor, setDegisimGonderiliyor] = useState(false);
  const [degisimHatasi, setDegisimHatasi] = useState<string | null>(null);
  const [degisimSonucu, setDegisimSonucu] = useState<string | null>(null);
  // Paket SEVİYESİ (`/auth/me` → `tier`, aynı yanıt): paket katalogda yoksa
  // (satıştan kalktıysa) "Şu anki paketiniz" satırı ham kod yerine seviye
  // adını basar — Hesabım rozetiyle aynı kural (`paketGorunenAdi`).
  const [seviye, setSeviye] = useState<string | null>(null);

  /**
   * Firmasi KAPATILMIS uye mi? (kendi hesabini kapatan DEGIL.)
   * ⚠ `false` baslangici bilincli: bilgi gelmeden kartlari gizlemek,
   *   normal kullaniciya bir an bos sayfa gosterirdi.
   */
  const [firmaKapandi, setFirmaKapandi] = useState(false);

  const kimligiGetir = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setFirmaRol(data?.firmaRol ?? null);
      setErisim(data?.erisim ?? null);
      setSeviye(typeof data?.tier === 'string' ? data.tier : null);
      // ── 22.09.2026: FIRMASI KAPATILAN UYE PAKET SECEMEZ ──────────────
      // Silinen `/hesap-kapali` ekraninda ayni kural vardi ve orada
      // gerekcesiyle yaziliydi: "Paket sec YALNIZ kendi hesabini kapatana
      // gosterilir. Firmasi kapanan UYE paket secemez (K2: firmayi SAHIBI
      // geri acar) — dugme calismayan bir soz olurdu."
      // Ekran kaldirilinca kural da kaybolacakti; buraya TASINDI.
      // ⚠ YENI ISTEK YOK: bilgi ayni `/auth/me` yanitinda.
      setFirmaKapandi(data?.kapali?.kapali === true && data?.kapali?.tip === 'firma');
    } catch {
      setFirmaRol(null);
      setFirmaKapandi(false);
      // Bilinmiyor = "paketiniz yok" DEĞİL: hiçbir kart işaretlenmez.
      setErisim(null);
      setSeviye(null);
    }
    try {
      const { data } = await api.get('/firma/uyeler');
      setAktifKullanici(typeof data?.koltuk?.aktif === 'number' ? data.koltuk.aktif : null);
    } catch {
      // Ekip bilgisi alinamazsa uyari gosterilmez; satin alma ENGELLENMEZ.
      setAktifKullanici(null);
    }
  }, []);

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
    void kimligiGetir();
  }, [paketleriGetir, kimligiGetir]);

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

  /**
   * 23.09 — PAKET DEĞİŞİMİ. Kart bilgisi ve fatura formu İSTENMEZ: abonelik
   * zaten kayıtlı karttan yürüyor, iyzico yalnız planı değiştirir. Zamanlama
   * (hemen / dönem sonu) sunucunun kararıdır; ekran onu ÖNCEDEN gösterir.
   */
  async function paketeGec() {
    if (!degisimHedefi) return;
    const onayHatasi = sozlesmeOnayiHatasi(degisimOnayi);
    if (onayHatasi) {
      setDegisimHatasi(onayHatasi);
      return;
    }
    setDegisimHatasi(null);
    setDegisimGonderiliyor(true);
    try {
      const { data } = await api.post<{ mesaj?: string }>('/abonelik/degistir', {
        paketSurumuId: degisimHedefi.surum.paketSurumuId,
        sozlesmeOnayi: degisimOnayi,
      });
      setDegisimSonucu(typeof data?.mesaj === 'string' ? data.mesaj : 'Paket değişikliğiniz alındı.');
      setDegisimHedefi(null);
      setDegisimOnayi(SOZLESME_ONAYI_BASLANGIC);
      // Yükseltme özellikleri HEMEN açar: kartlar, "şu anki paketiniz" satırı
      // ve kenar çubuğu yeni hâli sayfa yenilenmeden göstermeli.
      await Promise.all([paketleriGetir(), kimligiGetir(), yetenekleriYenile()]);
    } catch (e: any) {
      const m = e?.response?.data?.message ?? e?.response?.data?.mesaj;
      // ⚠ Sunucudan metin gelmediyse (bağlantı koptu, zaman aşımı) sonucu
      // BİLMİYORUZ: değişiklik sunucuda gerçekleşmiş olabilir. "Paketiniz
      // değişmedi" demek o durumda yalan olurdu (inceleme bulgusu 1). Kesin
      // red metnini SUNUCU verir; burada yalnız "doğrulanamadı" denir.
      setDegisimHatasi(
        typeof m === 'string'
          ? m
          : 'İşlemin sonucu doğrulanamadı. Sayfayı yenileyip paketinizi kontrol edin; değişmemişse yeniden deneyebilirsiniz.',
      );
      // Sonuç sunucuda gerçekleşmiş olabilir: kartlar ve "şu anki paketiniz"
      // satırı gerçek hâli göstersin.
      void Promise.all([paketleriGetir(), kimligiGetir(), yetenekleriYenile()]).catch(() => undefined);
    } finally {
      setDegisimGonderiliyor(false);
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
          {/* ── T47 (22.09): KOŞULLU ALAN — ŞAHIS mi TÜZEL mi ─────────────
              Ölçüldü: vergi dairesi hiçbir ödeme yolunda sorulmuyordu ve
              `Firma.vergiDairesi`yi yazan tek yol profil formuydu. Sonuç,
              şirket adına alan müşterinin faturası vergi dairesiz kesiliyordu
              (VUK md. 230 şart koşar). Alan yalnız kimlik no 11 haneli TCKN
              DEĞİLSE çizilir: şahıs müşteriye fazladan bir kutu göstermek
              satın almaya sürtünme ekler, karşılığında hiçbir şey kazandırmaz.
              Kapı `eksikAlanlar` içinde; buradaki `disabled` yalnız kolaylık. */}
          {vergiDairesiGerekli(fatura) && (
            <div>
              <label htmlFor="fatura-vergiDairesi" className="mb-1 block text-xs font-medium">
                {ALAN_ETIKET.vergiDairesi} <span className="text-red-600">*</span>
              </label>
              <input
                id="fatura-vergiDairesi"
                type="text"
                value={fatura.vergiDairesi ?? ''}
                onChange={(e) => setFatura({ ...fatura, vergiDairesi: e.target.value })}
                placeholder="örn. Küçükyalı"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                10 haneli vergi numarası girdiniz: fatura şirket adına kesilecek.
                Şahıs olarak almak istiyorsanız 11 haneli T.C. kimlik numaranızı yazın.
              </p>
            </div>
          )}

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

  // Paket adı ve durum rozeti hesap sayfasıyla AYNI saf modülden gelir.
  // 23.09: ad KATALOGDAN — "Şu anki paketiniz: pro-mek" yazıyordu.
  const ozet = abonelikOzeti(
    erisim,
    null,
    paketGorunenAdi(erisim?.paketKodu, paketler, seviye ? paketRozeti(seviye) : null),
  );
  // `erisim` gelmeden HİÇBİR kart işaretlenmez (yanlış kartı "mevcut" demek,
  // müşteriyi yanlış pakete yükseltmeye iterdi).
  const mevcutPaketKodu = ozet.paketKodu;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold">Abonelik</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Paketinizi seçin. Dolar tutarları referanstır; tahsilat TL olarak,
        KDV dahil yapılır.
      </p>

      {/* ── ŞU ANKİ ABONELİK: bilgi satırı ──────────────────────────────
          ⚠ 03.09 kullanıcı kararı KORUNUYOR: iptal DÜĞMESİ buraya GERİ
          KONMADI ("müşterinin gözüne sokmayalım, iptal en az üç tıklama
          derinlikte olsun"). Burada yalnız iptalin NEREDE olduğu söyleniyor
          ve bu, Ön Bilgilendirme Formu §9'un adım adım tarif ettiği yolun
          BİREBİR aynısıdır (23.09 Hesabım tasarımı: Hesabım → Abonelik
          sekmesi → "Aboneliği iptal et"). Bağı izleyen kullanıcı için derinlik
          azalmaz: sayfayı aç → sekmeyi aç → düğmeye bas → onayla.
          ⚠ Bağ BİLEREK `/profile` (Profil sekmesi), `?sekme=abonelik` DEĞİL:
          doğrudan sekmeyi açan bağ iptali bir tık öne çekerdi (kod incelemesi
          ölçtü) — 03.09 derinlik kararına aykırı. */}
      {mevcutPaketKodu && (
        <div className="mb-6 rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium">
            Şu anki paketiniz: {ozet.baslik}
            {ozet.durumEtiketi && (
              <span className="ml-2 rounded-md bg-background px-2 py-0.5 text-xs font-medium">
                {ozet.durumEtiketi}
              </span>
            )}
          </p>
          {/* 23.09 — BEKLEYEN DEĞİŞİM: düşürme planlandıysa hangi tarihte
              hangi pakete geçileceği; yükseltmeden sonra yeni ücretin
              başladığı gün. Kaynak `ErisimKarari.paketGecisi` (sunucu). */}
          {bekleyenDegisimCumlesi(erisim?.paketGecisi) && (
            <p className="mt-1 text-xs font-medium text-blue-700">
              {bekleyenDegisimCumlesi(erisim?.paketGecisi)}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Dönem kullanımınız ve yenilenme gününüz{' '}
            <a href="/profile" className="font-medium text-blue-600 hover:underline">
              Hesabım
            </a>{' '}
            sayfasının Abonelik sekmesindedir. Aboneliğinizi sonlandırmak isterseniz: Hesabım →
            Abonelik sekmesi → &quot;Aboneliği iptal et&quot;.
          </p>
        </div>
      )}

      {degisimSonucu && (
        <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          {degisimSonucu}
        </div>
      )}

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
        firmaKapandi ? (
          /* ⚠ ALAMAYACAGI SEY GOSTERILMEZ. Firmayi yalnizca SAHIBI geri
             acabilir; uyeye kart gostermek, basildiginda 403 alacak bir
             dugme sunmak olurdu. Ust seritteki cumle de ayni seyi soyluyor
             (`KapaliHesapSeridi`), ikisi celismez. */
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Paket seçimi size kapalı.</p>
            <p className="mt-1.5 leading-relaxed">
              Hesabınız, firmanız kapatıldığı için kapandı. Firmayı yalnızca sahibi
              geri açabilir; o paket seçtiğinde ekip ve verileriniz olduğu gibi geri gelir.
              Bu süre içinde verilerinizi yukarıdaki bağlantıdan indirebilirsiniz.
            </p>
          </div>
        ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paketler.map((p) => {
            // ⚠ Kod eşitliği, ad değil: aynı adı taşıyan iki sürüm olabilir.
            // `mevcutPaketKodu` null iken (bilgi gelmedi / abonelik yok)
            // HİÇBİR kart işaretlenmez. 23.09: sunucu `degisim` gönderiyorsa
            // "mevcut" kararı ONUN (`AYNI_PAKET`) — süresi biten aboneliğin
            // eski paketi artık kilitli değil, yeniden satın alınabilir.
            const mevcutMu = mevcutPaketMi(p, mevcutPaketKodu);
            const eylem = kartEylemi(p, { mevcutMu, sahipMi: firmaRol === 'sahip' });
            // ⚠ `className` DÜZ DİZGE KALMALI: Faz 6.1 kart hizası kapısı
            // (`fiyat-sayfasi.test.ts` → `siniflar`) sınıfları AST'den okur ve
            // şablon dizgesini okuyamaz — ilk yazımda şablon dizge kullanıldı,
            // kapı KIRMIZI verdi (ızgara "yok" sanıldı). Vurgu bu yüzden
            // `data-mevcut` değişkeniyle yapılıyor.
            return (
            <div
              key={p.paketId}
              data-mevcut={mevcutMu ? 'true' : undefined}
              aria-current={mevcutMu ? 'true' : undefined}
              className="row-span-5 grid grid-rows-subgrid gap-0 rounded-xl border bg-card p-5 data-[mevcut=true]:border-primary data-[mevcut=true]:ring-1 data-[mevcut=true]:ring-primary"
            >
              <div className="mb-3">
                <h2 className="text-lg font-bold">{p.ad}</h2>
                <div className="mt-1 flex flex-col items-start gap-1.5">
                  {mevcutMu && (
                    <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                      Mevcut paketiniz
                    </span>
                  )}
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
                <li>· Firma sahibi dahil {p.kullaniciHakki} kullanıcı</li>
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

              {/* ⚠ MEVCUT PAKET KAPISI ÜÇLÜ İFADENİN İÇİNE KONDU, DIŞINA DEĞİL:
                  Faz 6.1 kart hizası kapısı (`fiyat-sayfasi.test.ts`) kartın
                  doğrudan çocuklarında "koşulla düşebilen satır" aramıyor
                  olsa da, iki kolu da JSX OLMAYAN bir üçlü ifadeyi satır
                  düşürüyor sayıyor. İlk yazımda dışarı sarılmıştı, kapı
                  kırmızı verdi. Karar aynı, yeri farklı. */}
              {firmaRol === 'sahip' ? (
                // ⚠ `mt-auto` YOK (24.09 önizlemede görüldü): kapalı kartta
                // düğmenin altına gerekçe metni geliyor ve satır uzuyor; kap
                // `mt-auto` taşısaydı gerekçesiz kartın düğmesi satırın DİBİNE
                // itilir, komşu düğmelerle aynı hizada durmazdı.
                <div>
                  <button
                    type="button"
                    // Zaten kullanılan pakete ve sunucunun "geçilemez" dediği
                    // pakete basılamaz: düğme EYLEM ÜRETMEZ.
                    disabled={eylem.tur === 'mevcut' || eylem.tur === 'kapali'}
                    onClick={() => {
                      // İkinci kapı ("sessiz dal yok"): klavye ya da eski bir
                      // durumla buraya düşülürse de hiçbir işlem başlamaz.
                      if (eylem.tur === 'mevcut' || eylem.tur === 'kapali') return;
                      // 23.09 — ABONELİĞİ OLAN FİRMA: fatura formu ve kart
                      // İSTENMEZ, onay penceresi açılır (küçültme uyarısı da
                      // pencerenin İÇİNDE, aynı sözleşme onayıyla birlikte).
                      if (eylem.tur === 'degistir') {
                        setDegisimSonucu(null);
                        setDegisimHatasi(null);
                        setDegisimOnayi(SOZLESME_ONAYI_BASLANGIC);
                        setDegisimHedefi(p);
                        return;
                      }
                      // ⚠ Kucultme UYARIDIR, ret DEGIL (R1-Y4): Emre kucultmeyi
                      // serbest birakip fazla uyeyi durdurmayi secti. Sunucu
                      // satin almayi REDDETMEZ.
                      const uyari =
                        aktifKullanici === null
                          ? null
                          : kucultmeUyarisi(aktifKullanici, p.kullaniciHakki);
                      if (uyari) {
                        setKucultmeSorusu({ id: p.surum.paketSurumuId, metin: uyari });
                        return;
                      }
                      paketiSec(p.surum.paketSurumuId);
                    }}
                    className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {eylem.tur === 'mevcut'
                      ? 'Mevcut paketiniz'
                      : eylem.tur === 'satin-al'
                        ? 'Bu paketi seç'
                        : 'Bu pakete geç'}
                  </button>
                  {/* Sunucu neden geçilemeyeceğini söylüyorsa SÖYLENİR —
                      kapalı düğme tek başına "neden?" sorusunu cevapsız bırakır. */}
                  {eylem.tur === 'kapali' && (
                    <p className="mt-2 text-xs leading-snug text-muted-foreground">{eylem.mesaj}</p>
                  )}
                </div>
              ) : (
                <p className="mt-auto rounded-lg border border-border px-4 py-2 text-center text-sm text-muted-foreground">
                  {mevcutMu ? 'Mevcut paketiniz' : 'Aboneliği firma sahibi yönetir.'}
                </p>
              )}
            </div>
            );
          })}
        </div>
        )
      )}

      {/* ── 23.09: PAKET DEĞİŞİMİ ONAYI ────────────────────────────────────
          Müşteri NE ZAMAN, NE KADAR ödeyeceğini ve (düşürmede) ekibinden
          kimin durdurulacağını onaydan ÖNCE görür. Zamanlama cümlesi
          sunucunun kararından (`degisim.zamanlama`) üretilir. */}
      {degisimHedefi?.degisim?.yol === 'degistir' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="degisim-baslik" className="w-full max-w-lg rounded-lg border border-border bg-background p-5">
            <h3 id="degisim-baslik" className="text-base font-semibold">
              {degisimHedefi.ad} paketine geçiş
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">Şu anki paketiniz: {ozet.baslik}</p>
            <p className="mt-3 text-sm leading-relaxed">
              {degisimOnayMetni({
                zamanlama: degisimHedefi.degisim.zamanlama,
                yeniPaketAdi: degisimHedefi.ad,
                yeniTutar: degisimHedefi.surum.tutar,
                paraBirimi: degisimHedefi.surum.paraBirimi,
                beklenenTarih: degisimHedefi.degisim.beklenenTarih,
              })}
            </p>
            {aktifKullanici !== null && kucultmeUyarisi(aktifKullanici, degisimHedefi.kullaniciHakki) && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                {kucultmeUyarisi(aktifKullanici, degisimHedefi.kullaniciHakki)}
              </p>
            )}
            <div className="mt-4 rounded-lg border bg-slate-50 p-3">
              <label htmlFor="degisim-sozlesme-onayi" className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
                <input
                  id="degisim-sozlesme-onayi"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={degisimOnayi}
                  onChange={(e) => {
                    setDegisimOnayi(e.target.checked);
                    setDegisimHatasi(null);
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
                  {"'ni yeni paket ve ücretiyle okudum, onaylıyorum."}
                </span>
              </label>
            </div>
            {degisimHatasi && (
              <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {degisimHatasi}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDegisimHedefi(null);
                  setDegisimHatasi(null);
                }}
                className="rounded border border-border px-3 py-1.5 text-sm"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={degisimGonderiliyor || !degisimOnayi}
                onClick={paketeGec}
                className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {degisimGonderiliyor ? 'Değiştiriliyor…' : 'Onayla ve geç'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── KÜÇÜLTME ONAYI (§6.6 · Emre kararı E-3) ─────────────────────── */}
      {kucultmeSorusu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-5">
            <h3 className="text-sm font-semibold">Ekibiniz bu pakete sığmıyor</h3>
            <p className="mt-2 text-sm text-muted-foreground">{kucultmeSorusu.metin}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setKucultmeSorusu(null)}
                className="rounded border border-border px-3 py-1.5 text-sm"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = kucultmeSorusu.id;
                  setKucultmeSorusu(null);
                  paketiSec(id);
                }}
                className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
              >
                Anladım, devam et
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
