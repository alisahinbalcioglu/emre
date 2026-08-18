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

import { useEffect, useRef, useState } from 'react';
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

type Adim = {
  no: string;
  baslik: string;
  metin: string;
  ton: Ton;
  tikler: { kalin: string; devam: string }[];
  url: string;
  gorseller: Gorsel[];
  /** Adimin altina dusen kucuk paket notu (Pro kapisi varsa). */
  pronot?: string;
};

const ADIMLAR: Adim[] = [
  {
    no: '1',
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
    no: '2',
    baslik: 'Metrajı yükleyin, markayı seçin — fiyat hücreye gelsin',
    metin:
      'Çok sayfalı Excel metrajınız sayfa sayfa okunur. Satırda markayı seçtiğiniz anda kütüphanenizde arama yapılır.',
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
    no: '3',
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
  const [aktif, setAktif] = useState<number[]>(() => ADIMLAR.map(() => 0));
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
              Metrajdan fiyatlı teklife <em>üç adım</em>
            </h2>
            <p>
              Fiyat listelerinizi bir kez kütüphaneye aktarın; sonrasında her metraj için marka
              seçmeniz yeterli. Fiyat, kâr ve toplam otomatik hesaplanır.
            </p>
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

          <ol className="nc-steps">
            {ADIMLAR.map((adim, ai) => {
              const secili = adim.gorseller[aktif[ai]];
              return (
                <li className="step" key={adim.no}>
                  <div className="step-text">
                    <span className="step-num">{adim.no}</span>
                    <h3>{adim.baslik}</h3>
                    <p>{adim.metin}</p>
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
                      aria-label={`Adım ${adim.no} ekran görüntüleri`}
                    >
                      {adim.gorseller.map((g, gi) => (
                        <button
                          key={g.dosya}
                          type="button"
                          role="tab"
                          aria-selected={aktif[ai] === gi}
                          onClick={() =>
                            setAktif((o) => o.map((deger, i) => (i === ai ? gi : deger)))
                          }
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
