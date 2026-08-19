'use client';

/**
 * "NASIL CALISIR" bolumu — teslim edilen BOLUM.html'in React karsiligi (18.08).
 *
 * TESLIM NOTU "useEffect icinde bir kez calistirmak yeterli" diyordu; oyle
 * YAPILMADI. Teslimdeki vanilya JS `document.querySelectorAll` ile DOM'a
 * baglanip `img.src`'yi elle degistiriyor. Iki sorunu var:
 *   1. `document`'e eklenen `keydown` dinleyicisi HIC kaldirilmiyor — tek
 *      sayfalik uygulamada baska sayfaya gecip geri donuldugunde birikir.
 *   2. `img.src`'yi elle degistirmek React'in sanal DOM'uyla catisir.
 * Bu yuzden sekme secimi ve buyutme React state'ine tasindi; butun
 * dinleyiciler temizleniyor. Gorsel sonuc birebir ayni — CSS DEGISMEDI.
 *
 * ⚠ `.nc-buyut` KOSULLU RENDER EDILMEZ: CSS sozlesmesi `display:none` +
 * `.acik{display:flex}` uzerine kurulu (nasil-calisir.css:158-166).
 *
 * ⚠ Video `muted` OLMAK ZORUNDA — kaldirilirsa tarayici otomatik oynatmayi
 * engeller (teslim notunun uyarisi, korundu).
 *
 * Statikler `frontend/public/nasil-calisir/` altinda; yollar koke gore mutlak.
 */

import { Fragment, useEffect, useRef, useState } from 'react';
import './nasil-calisir.css';

const KOK = '/nasil-calisir';

type Ton = 'yesil' | 'mavi' | 'mor';

const TON_RENK: Record<Ton, { daire: string; cizgi: string }> = {
  yesil: { daire: '#dcfce7', cizgi: '#16a34a' },
  mavi: { daire: '#dbeafe', cizgi: '#2563eb' },
  mor: { daire: '#f3e8ff', cizgi: '#7c3aed' },
};

type Gorsel = {
  sekme: string;
  etiket: string;
  renk: '' | 'yesil' | 'amber' | 'mor';
  dosya: string;
  alt: string;
  /** Ucretsiz hesapta KAPALI olan ozellik — sekmede gorunur PRO rozeti cikar. */
  pro?: boolean;
};

/** v1 (19.08): bolum IKI YOLLU — kullanici DWG projesinden ya da hazir Excel
 *  metrajindan baslar. Secim yalniz React state; adim numaralari GORUNUR
 *  listeden turetilir (teslimin CSS sayaci karsiligi), elle numara tutulmaz. */
type Yol = 'dwg' | 'excel';

type Adim = {
  /** Sekme secim state'inin anahtari — dizin OLMAZ: yol degisince dizinler kayar. */
  key: string;
  baslik: string;
  metin: string;
  /** DWG yolunda farkli anlatilan adimlar icin varyant (teslimdeki .dwg-only). */
  baslikDwg?: string;
  metinDwg?: string;
  ton: Ton;
  tikler: { kalin: string; devam: string }[];
  url: string;
  gorseller: Gorsel[];
  /** Adimin altina dusen kucuk paket notu (Pro kapisi varsa). */
  pronot?: string;
  /** DWG adimi mor vurgu alir (step.dwg). */
  dwg?: boolean;
};

const ADIMLAR: Adim[] = [
  {
    key: 'kutuphane',
    baslik: 'Fiyat listelerini kütüphaneye aktarın',
    metin:
      'Malzeme Havuzundaki hazır marka listelerinden çalıştıklarınızı kütüphanenize kopyalarsınız. İskontonuzu bir kez girersiniz — kütüphanede artık net fiyatlar durur.',
    ton: 'yesil',
    tikler: [
      {
        kalin: 'Hazır marka listeleri',
        devam: 'havuzda yapılandırılmış tablo olarak durur; "Kütüphaneme Aktar" ile kopyalarsınız',
      },
      {
        kalin: 'İskonto',
        devam:
          'bir kez girilir — tüm listeye, bir gruba ya da tek satıra; her teklifte kendiliğinden uygulanır',
      },
      { kalin: 'TL, USD, EUR', devam: '— liste hangi para biriminde ise o şekilde saklanır' },
    ],
    pronot: 'İşçilik firmaları ve işçilik birim fiyatları Pro pakete dâhildir.',
    url: 'metapricex.com/havuz',
    gorseller: [
      {
        sekme: 'Havuzdan aktar',
        etiket: 'Kütüphaneme aktar',
        renk: '',
        dosya: 'a1-havuz-aktar',
        alt: 'Marka fiyat listesini kütüphaneye aktarma ekranı',
      },
      {
        sekme: 'İskonto gir',
        etiket: 'İskonto uygulandı',
        renk: 'yesil',
        dosya: 'a1-iskonto',
        alt: 'Marka bazında iskonto girme ekranı',
      },
      {
        sekme: 'İşçilik firmaları',
        etiket: 'İşçilik firmaları · PRO',
        renk: 'amber',
        dosya: 'a1-iscilik',
        alt: 'İşçilik firmaları ve birim fiyatları (Pro pakete dâhildir)',
        pro: true,
      },
    ],
  },
  {
    key: 'markala',
    baslik: 'Metrajı yükleyin, markayı seçin — fiyat hücreye gelsin',
    baslikDwg: 'Markayı seçin — fiyat hücreye gelsin',
    metin:
      'Çok sayfalı Excel metrajınız sayfa sayfa okunur. Satırda markayı seçtiğiniz anda kütüphanenizde arama yapılır.',
    metinDwg:
      'Ölçümden gelen metraj tabloya düşer. Satırda markayı seçtiğiniz anda kütüphanenizde arama yapılır.',
    ton: 'mavi',
    tikler: [
      {
        kalin: 'Marka seçimi',
        devam:
          '— tek eşleşme varsa net fiyat hemen hücreye yazılır; birden çok aday çıkarsa yazılım tahmin etmez, size sorar',
      },
      {
        kalin: 'Bulunamayan kalem',
        devam: 'işaretlenir; aynı kalemin bulunduğu diğer markalar fiyatlarıyla önünüze gelir',
      },
      { kalin: 'Malzeme ve işçilik', devam: 'ayrı kolonlarda ilerler, kâr marjı ayrı ayrı girilir' },
      { kalin: 'Genel toplam ve kâr', devam: 'tablonun altında canlı hesaplanır' },
    ],
    pronot:
      'İşçilik birim fiyatını her pakette elle girebilirsiniz; işçilik firması seçip fiyatın otomatik gelmesi Pro pakete dâhildir.',
    url: 'metapricex.com/teklif',
    gorseller: [
      {
        sekme: 'Marka seç',
        etiket: 'Marka listesi açılır',
        renk: '',
        dosya: 'a2-marka-secimi',
        alt: 'Satırda marka seçimi listesi',
      },
      {
        sekme: 'Fiyat gelir',
        etiket: 'Net fiyat hücreye geldi',
        renk: 'yesil',
        dosya: 'a2-fiyat-geldi',
        alt: 'Seçilen markanın net fiyatı hücreye yazılmış',
      },
      {
        sekme: 'Kâr marjı',
        etiket: 'Malzeme kârı %25',
        renk: 'amber',
        dosya: 'a2-kar-marji',
        alt: 'Malzeme kâr marjı girişi',
      },
      {
        sekme: 'İşçilik',
        etiket: 'İşçilik firması ve kârı · PRO',
        renk: 'amber',
        dosya: 'a2-iscilik-dolu',
        alt: 'İşçilik firması ve işçilik kârı kolonları (firma seçimi Pro pakete dâhildir)',
        pro: true,
      },
      {
        sekme: 'Döviz',
        etiket: 'USD — TCMB kuru',
        renk: 'mor',
        dosya: 'a3-dolar',
        alt: 'Teklifin USD para birimine çevrilmiş hali',
      },
    ],
  },
  {
    key: 'kaydet',
    baslik: 'Teklifi kaydedin, iki formatta indirin',
    metin:
      'Teklifi kaydedin; dilediğiniz zaman revize edin. Fiyatlandırılmış Excel ya da kapak–icmal sayfalı teklif formatı olarak indirin.',
    ton: 'mor',
    tikler: [
      {
        kalin: 'Fiyatlandırılmış Excel',
        devam:
          '— sayfa adlarınız ve satır sıranız korunarak 9 kolonluk standart fiyat tablosu üretilir',
      },
      {
        kalin: 'Teklif formatı',
        devam:
          '— hazır KAPAK ve İCMAL sayfalarıyla gelir; kendi şablonunuzu yüklerseniz yalnız yer tutucular doldurulur',
      },
      { kalin: 'TL · USD · EUR', devam: '— TCMB kuru ile para birimi değişimi' },
    ],
    url: 'metapricex.com/quotes',
    gorseller: [
      {
        sekme: 'Kaydedildi',
        etiket: 'Teklif kaydedildi',
        renk: 'mor',
        dosya: 'a3-kaydedildi',
        alt: 'Kaydedilmiş teklif tablosu',
      },
      {
        sekme: 'İndir',
        etiket: 'Excel / teklif formatı',
        renk: 'yesil',
        dosya: 'a3-indir',
        alt: 'İki ayrı indirme seçeneği',
      },
      {
        sekme: 'İngilizce',
        etiket: 'İngilizce teklif',
        renk: 'mor',
        dosya: 'a3-ingilizce',
        alt: 'Teklifin İngilizceye çevrilmiş hali',
      },
    ],
  },
];

/** v1 DWG adimi. Metin KODA KARSI DENETLENDI (19.08):
 *  · "hat boylari kendiliginden olculsun" — DOGRU (koordinat+katman bazli,
 *    olcek ve birim normalize edilerek; onceki DWG denetiminin bulgusu).
 *  · "Katmanlari ... bir kez eslestirin" — ISLEVSEL OLARAK DOGRU:
 *    applyBucketToUnassigned (DwgProjectWorkspace.tsx:315) kalemi secili
 *    katmandaki TUM capsiz segmentlere tek hamlede uygular; kod yorumu bunu
 *    "eski layer-default fallback'inin kullanici-tetikli karsiligi" diye
 *    tanimlar. Otomatik cap TAHMINI iddiasi YOK (o motor silindi, dogru).
 *  · "Kalem bazinda toplam" — cap bazinda gruplu uzunluklar (lejant/ozet).
 *  · "Dogrudan metraja aktarim" — metraj teklife aktariliyor (birim m). */
const DWG_ADIM: Adim = {
  key: 'dwg',
  dwg: true,
  baslik: 'DWG projenizi yükleyin — hat boyları kendiliğinden ölçülsün',
  metin:
    'Çizimi olduğu gibi yükleyin. Katmanları hangi kaleme karşılık geldiğiyle bir kez eşleştirin; sistem o katmanlardaki hat boylarını ölçüp metraja dönüştürür.',
  ton: 'mor',
  tikler: [
    { kalin: 'Katman eşleştirme', devam: '— hangi katman hangi boru/çap, bir kez tanımlanır' },
    { kalin: 'Otomatik hat boyu ölçümü', devam: '— ölçek ve birim dikkate alınarak hesaplanır' },
    { kalin: 'Kalem bazında toplam', devam: '— çap ve hat türüne göre gruplanmış uzunluklar' },
    { kalin: 'Doğrudan metraja aktarım', devam: '— çıkan sonuç tek tıkla metraj tablosuna geçer' },
  ],
  url: 'metapricex.com/dwg',
  gorseller: [
    { sekme: 'DWG yükle', etiket: 'Çizim yüklendi', renk: 'mor', dosya: 'd1-yukle', alt: 'DWG çizimi yüklendi, katmanlar listelendi' },
    { sekme: 'Katman eşle', etiket: 'Katman → kalem eşleşti', renk: '', dosya: 'd2-katman-esle', alt: 'Katmanın hangi kaleme karşılık geldiği seçiliyor' },
    { sekme: 'Ölçüm', etiket: 'Hatlar ölçülüyor', renk: 'amber', dosya: 'd3-olcum', alt: 'Hat boyları ölçülüyor' },
    { sekme: 'Metraj çıktı', etiket: '588,9 m ölçüldü', renk: 'yesil', dosya: 'd4-metraj', alt: 'Kalem bazında gruplanmış metraj sonucu' },
  ],
};

/** Yola gore baslik/ozet (teslimdeki METIN sozlugu). */
const YOL_METIN: Record<Yol, { vurgu: string; oncesi: string; ozet: string }> = {
  dwg: {
    oncesi: 'Projeden fiyatlı teklife ',
    vurgu: 'dört adım',
    ozet:
      'DWG projenizdeki hat boyları otomatik ölçülür, metraja dönüşür. Sonrasında markayı seçmeniz yeterli — fiyat, kâr ve toplam otomatik hesaplanır.',
  },
  excel: {
    oncesi: 'Metrajdan fiyatlı teklife ',
    vurgu: 'üç adım',
    ozet:
      'Fiyat listelerinizi bir kez kütüphaneye aktarın; sonrasında her metraj için marka seçmeniz yeterli. Fiyat, kâr ve toplam otomatik hesaplanır.',
  },
};

const OZELLIKLER = [
  {
    sinif: 'b1',
    yol: 'M3 7h13l-3-3M21 17H8l3 3',
    baslik: 'Döviz çevirisi',
    metin: 'TL, USD ve EUR arasında tek tıkla geçiş. TCMB kuru teklife tarih damgasıyla işlenir.',
  },
  {
    sinif: 'b2',
    yol: 'M4 5h10M9 3v2M11 5c0 5-4 9-7 9M7 10c1.5 3 4 5 7 6M13 20l4-9 4 9M14.5 17h5',
    baslik: 'İngilizce teklif',
    metin:
      'Malzeme adları çevrilir; çap, ölçü ve sayısal değerlere dokunulmaz. Çevrilen terimler saklanır, ikinci teklifinizde yeniden çevrilmez.',
  },
  {
    sinif: 'b3',
    yol: 'M19 5L5 19M6.5 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM17.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    baslik: 'Kâr marjı kontrolü',
    metin:
      'Malzeme ve işçilik için ayrı kâr oranı. Toplam ve kâr tutarı tablonun altında canlı görünür.',
  },
  {
    sinif: 'b4',
    yol: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 15l2 2 4-4',
    baslik: 'İki ayrı çıktı',
    metin:
      'Fiyatlandırılmış Excel her teklifte tek tıkla üretilir. Kapak–icmal teklif formatı için keşfin Excel dosyasının teklifte kayıtlı olması gerekir.',
  },
];

function Tik({ ton }: { ton: Ton }) {
  const { daire, cizgi } = TON_RENK[ton];
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill={daire} />
      <path
        d="M6 10.4l2.6 2.6L14 7.6"
        stroke={cizgi}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NasilCalisir() {
  const [yol, setYol] = useState<Yol>('dwg'); // teslimin varsayilani DWG
  const [aktif, setAktif] = useState<Record<string, number>>({});
  const [buyutulen, setBuyutulen] = useState<Gorsel | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Esc ile kapat + arka plan kaydirmasini kilitle. Ikisi de TEMIZLENIYOR —
  // teslimdeki JS `document`'e dinleyici ekleyip hic kaldirmiyordu.
  useEffect(() => {
    if (!buyutulen) return;
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBuyutulen(null);
    };
    const oncekiTasma = document.body.style.overflow;
    document.addEventListener('keydown', tus);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tus);
      document.body.style.overflow = oncekiTasma;
    };
  }, [buyutulen]);

  // Gorunur degilken videoyu duraklat (pil/CPU dostu).
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || typeof IntersectionObserver === 'undefined') return;
    const gozcu = new IntersectionObserver(
      (girisler) => {
        girisler.forEach((g) => {
          if (g.isIntersecting) {
            vid.play().catch(() => {});
          } else {
            vid.pause();
          }
        });
      },
      { threshold: 0.15 },
    );
    gozcu.observe(vid);
    return () => gozcu.disconnect();
  }, []);

  return (
    <>
      <section className="nc" id="nasil-calisir">
        <div className="nc-wrap">
          <div className="nc-head">
            <span className="pill">
              <i />
              Nasıl Çalışır?
            </span>
            <h2>
              {YOL_METIN[yol].oncesi}
              <em>{YOL_METIN[yol].vurgu}</em>
            </h2>
            <p>{YOL_METIN[yol].ozet}</p>
          </div>

          <figure className="nc-video">
            <div className="nc-chrome">
              <b />
              <b />
              <b />
              <span>metapricex.com</span>
            </div>
            <video
              ref={videoRef}
              poster={`${KOK}/video-poster.jpg`}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="MetaPriceX kullanım akışı tanıtım videosu"
            >
              <source src={`${KOK}/nasil-calisir.mp4`} type="video/mp4" />
              <source src={`${KOK}/nasil-calisir.webm`} type="video/webm" />
            </video>
            <figcaption>
              {yol === 'dwg' && (
                <span>
                  <b>DWG</b> Hat boyu ölçümü
                </span>
              )}
              <span>
                <b>1.</b> Fiyat kütüphanesi
              </span>
              <span>
                <b>2.</b> Metraj yükle &amp; markala
              </span>
              <span>
                <b>3.</b> Teklifi indir
              </span>
              <span>
                <b>+</b> Döviz &amp; İngilizce
              </span>
            </figcaption>
          </figure>

          {/* ── Baslangic yolu secici (v1) ── */}
          <div className="nc-yol">
            <h3>Nereden başlıyorsunuz?</h3>
            <div className="yollar">
              <button
                type="button"
                className="yol"
                aria-pressed={yol === 'dwg'}
                onClick={() => setYol('dwg')}
              >
                <span className="rozet">Bize özel</span>
                <span className="yikon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 17V7l9-4 9 4v10l-9 4-9-4Z" />
                    <path d="M3 7l9 4 9-4" />
                    <path d="M12 11v10" />
                  </svg>
                </span>
                <span>
                  <strong>Elimde proje var (DWG)</strong>
                  <span>Çizimi yükleyin, hat boyları otomatik ölçülsün — metrajı sistem çıkarsın.</span>
                </span>
              </button>

              <span className="yol-veya">veya</span>

              <button
                type="button"
                className="yol"
                aria-pressed={yol === 'excel'}
                onClick={() => setYol('excel')}
              >
                <span className="yikon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
                    <path d="M14 3v5h5" />
                    <path d="M9 13l6 5M15 13l-6 5" />
                  </svg>
                </span>
                <span>
                  <strong>Metrajım hazır (Excel)</strong>
                  <span>Çok sayfalı metraj dosyanızı yükleyin, doğrudan fiyatlandırmaya geçin.</span>
                </span>
              </button>
            </div>
          </div>

          <ol className="nc-steps">
            {(yol === 'dwg'
              ? [ADIMLAR[0], DWG_ADIM, ADIMLAR[1], ADIMLAR[2]]
              : ADIMLAR
            ).map((adim, ai) => {
              const secili = adim.gorseller[aktif[adim.key] ?? 0];
              const ters = (ai + 1) % 2 === 0; // zigzag — gorunur siraya gore
              return (
                <Fragment key={adim.key}>
                <li className={`step${adim.dwg ? ' dwg' : ''}${ters ? ' ters' : ''}`}>
                  <div className="step-text">
                    <span className="step-num">{ai + 1}</span>
                    <h3>{yol === 'dwg' && adim.baslikDwg ? adim.baslikDwg : adim.baslik}</h3>
                    <p>{yol === 'dwg' && adim.metinDwg ? adim.metinDwg : adim.metin}</p>
                    <ul className="ticks">
                      {adim.tikler.map((t) => (
                        <li key={t.kalin}>
                          <Tik ton={adim.ton} />
                          <span>
                            <b>{t.kalin}</b> {t.devam}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {adim.pronot && <p className="pro-not">{adim.pronot}</p>}
                  </div>

                  <div className="step-media">
                    <div className="shot">
                      <div className="shot-bar">
                        <b />
                        <b />
                        <b />
                        <span>{adim.url}</span>
                      </div>
                      <div
                        className="shot-img"
                        role="button"
                        tabIndex={0}
                        aria-label={`${secili.alt} — büyüt`}
                        onClick={() => setBuyutulen(secili)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setBuyutulen(secili);
                          }
                        }}
                      >
                        <span className={`shot-etiket ${secili.renk}`}>{secili.etiket}</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${KOK}/gorseller/web/${secili.dosya}.png`} alt={secili.alt} />
                      </div>
                    </div>

                    <div
                      className="kucukler"
                      role="tablist"
                      aria-label={`Adım ${ai + 1} ekran görüntüleri`}
                    >
                      {adim.gorseller.map((g, gi) => (
                        <button
                          key={g.dosya}
                          type="button"
                          role="tab"
                          aria-selected={aktif[ai] === gi}
                          onClick={() => setAktif((o) => ({ ...o, [adim.key]: gi }))}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`${KOK}/gorseller/kucuk/${g.dosya}.jpg`} alt="" />
                          {g.pro && <span className="pro-rozet">PRO</span>}
                          <em>{g.sekme}</em>
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
                {adim.dwg && (
                  /* teslimdeki #birlesme — yalniz DWG yolunda, DWG adiminin altinda */
                  <li className="birlesme" aria-hidden="true">
                    <span>Buradan sonrası iki yolda da aynı</span>
                  </li>
                )}
                </Fragment>
              );
            })}
          </ol>

          <div className="nc-feats">
            {OZELLIKLER.map((o) => (
              <div className={`feat ${o.sinif}`} key={o.baslik}>
                <div className="ikon">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={o.yol} />
                  </svg>
                </div>
                <h4>{o.baslik}</h4>
                <p>{o.metin}</p>
              </div>
            ))}
          </div>

          <div className="nc-cta">
            <h3>Bir sonraki teklifinizi dakikalar içinde hazırlayın</h3>
            <p>
              Kurulum yok, kredi kartı yok. Ücretsiz hesapta malzeme akışının tamamı çalışır:
              havuzdan aktarma, iskonto, eşleştirme, kâr marjı, döviz, İngilizce çıktı ve Excel
              indirme. İşçilik fiyatlandırması Pro pakete dâhildir.
            </p>
            <a href="/register">Ücretsiz Deneyin</a>
          </div>
        </div>
      </section>

      {/* CSS sozlesmesi geregi HER ZAMAN render edilir; gorunurlugu `.acik` belirler. */}
      <div
        className={`nc-buyut${buyutulen ? ' acik' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Büyütülmüş görsel"
        onClick={() => setBuyutulen(null)}
      >
        <button type="button" className="kapat" aria-label="Kapat">
          ×
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={buyutulen ? `${KOK}/gorseller/web/${buyutulen.dosya}.png` : ''}
          alt={buyutulen ? buyutulen.alt : ''}
        />
      </div>
    </>
  );
}
