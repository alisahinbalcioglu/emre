/**
 * TANITIM SAYFASI (landing) — `/` (17.08).
 *
 * Onceden `/` bos bir yonlendiriciydi: token varsa /dashboard, yoksa /login.
 * Artik anonim ziyaretci tanitim sayfasini gorur; giris yapmis kullanici
 * `GirisliyseYonlendir` ile dashboard'a gecer (davranis KORUNDU).
 *
 * ⚠ Sayfa BILEREK sunucu bileseni: metin arama motoru ciktisinda dursun ve
 * ilk boyama beklemesin diye. Token `localStorage`'da oldugu icin yalniz
 * kucuk yonlendirme parcasi istemcide kosar.
 *
 * ── METIN NEDEN TASLAKTAN FARKLI ─────────────────────────────────────────
 * Verilen taslaktaki urun iddialari koda karsi denetlendi; 12'si tutmuyordu.
 * Onemli olanlar ve dayanaklari:
 *
 * · "boru caplarini OTOMATIK analiz eder" — YANLIS. Otomatik cap atama motoru
 *   (proximity) KODDAN SILINDI; `/parse` her segmenti `diameter=""` donduruyor
 *   (python/main.py:590, 606-611). Cap atamasi %100 tikla-etiketle.
 * · "ekipman adetlerini" — YANLIS. Ekipman isaretleme 10.08'de komple
 *   kaldirildi (dwg-metraj/types.ts:49-50); teklife giden her satir birim "m".
 * · "hatasiz teklifler" — urunun kendi karariyla celisir: cok adayli eslesmede
 *   kullaniciya sorar, kaydetmeden once "N/M kalem fiyatsiz" onayi ister.
 * · "tedarikci listeleriyle eslestirir" — eslestirme YALNIZ kullanicinin kendi
 *   kutuphanesinde ve SECILI TEK MARKA icinde calisir; kodda "Global fallback
 *   YOK" yaziyor (matching.service.ts:100).
 * · "Mekanik & Elektrik" — elektrik semada/backend'de var ama ARAYUZDE YOLU
 *   KAPALI (materials/page.tsx:3, library/page.tsx:577, Sidebar'da madde yok).
 * · 10x / %99 / 50K+ / 0 — hicbirinin repoda dayanagi yok. Urun SIFIR katalogla
 *   geliyor (prisma'da seed yok, migration'da tek INSERT yok). Yerlerine
 *   OLCULMUS degerler kondu: sureler `npm run test:perf` ciktisidir.
 * · Footer'daki gizlilik/sartlar/iletisim baglantilari ve #nasil-calisir /
 *   #avantajlar capalari hicbir yere gitmiyordu. Ayni gerekce login
 *   ekraninda "Parolami unuttum"u da engellemisti (login/page.tsx:6-11):
 *   tiklaninca hicbir sey yapmayan baglanti, var olmayan bir sey vaat eder.
 *   "Nasil Calisir" bolumu GERCEKTEN yazildi, "Avantajlar" menuden dusuruldu.
 *
 * Mockup gerceklige karsi olculdu (7/8 birebir dogru). Tek duzeltme: paket
 * rozeti "PRO" degil "CORE" — veritabani varsayilani `core` (schema.prisma:43),
 * yeni kaydolan kullanici orada CORE gorur.
 */

import Link from 'next/link';
import { Home as HomeIcon, FileText, Database, BookOpen } from 'lucide-react';
import { GirisliyseYonlendir } from '@/ortak/kabuk/components/landing/GirisliyseYonlendir';

export const metadata = {
  title: 'MetaPriceX — Mekanik Tesisat Metraj ve Teklif Platformu',
  description:
    'DWG projelerinden hat boylarını otomatik ölçün, çok sayfalı Excel metrajlarını okuyun ve kendi marka fiyat listelerinizle dakikalar içinde teklif hazırlayın.',
};

const MOCKUP_NAV = [
  { etiket: 'Ana Sayfa', ikon: HomeIcon, etkin: true },
  { etiket: 'Teklifler', ikon: FileText, etkin: false },
  { etiket: 'Malzeme Havuzu', ikon: Database, etkin: false },
  { etiket: 'Kütüphanem', ikon: BookOpen, etkin: false },
];

/** Şeritteki her değer ölçülmüş ya da koddan doğrulanmıştır — pazarlama yuvarlaması yok. */
const OLCULEN = [
  { deger: '135 ms', etiket: '1.115 satırlık keşif dosyası ayrıştırma', vurgu: false },
  { deger: '0,12 sn', etiket: '100 satır eşleştirme (1.500 kalemlik kütüphane)', vurgu: true },
  { deger: '4 format', etiket: '.xlsx · .xls · .dwg · .dxf', vurgu: false },
  { deger: 'TCMB', etiket: 'Günlük USD/EUR kuru, teklife işlenir', vurgu: true },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 antialiased selection:bg-blue-500 selection:text-white">
      <GirisliyseYonlendir />

      {/* NAVBAR */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="group flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-2xl font-black text-white shadow-lg shadow-blue-500/30 transition-transform group-hover:scale-105">
              M
            </div>
            <span className="text-2xl font-extrabold tracking-tight text-slate-900">
              MetaPrice<span className="text-blue-600">X</span>
            </span>
          </Link>

          {/* Yalniz GERCEKTEN var olan bolumlere baglanti — "Avantajlar" dusuruldu. */}
          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex">
            <a href="#ozellikler" className="transition-colors hover:text-blue-600">
              Özellikler
            </a>
            <a href="#nasil-calisir" className="transition-colors hover:text-blue-600">
              Nasıl Çalışır?
            </a>
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="px-5 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:text-blue-600"
            >
              Giriş Yap
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-[#0B1528] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 active:scale-[0.98]"
            >
              Hemen Başla
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden pb-12 pt-16 md:pb-16 md:pt-24">
        <div className="relative z-10 mx-auto max-w-7xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
            Mekanik Tesisat Taahhüt Sektörü İçin Geliştirildi
          </div>

          <h1 className="mx-auto max-w-4xl text-4xl font-black leading-tight tracking-tight text-slate-900 md:text-6xl">
            Metraj ve Teklif Süreçlerinizi{' '}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Hızlandırın
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
            DWG projelerinizdeki hat boylarını otomatik ölçün, çok sayfalı Excel metrajlarınızı
            eksiksiz okuyun ve kendi marka fiyat listelerinizle dakikalar içinde teklif hazırlayın.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="w-full rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-700 active:scale-[0.98] sm:w-auto"
            >
              Ücretsiz Deneyin
            </Link>
            <a
              href="#ozellikler"
              className="w-full rounded-xl border border-slate-200 bg-white px-8 py-3.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-100 sm:w-auto"
            >
              Özellikleri İncele
            </a>
          </div>

          {/* EKRAN MOCKUP — gercek uygulamaya karsi olculdu */}
          <div className="mx-auto mt-14 max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 p-2.5 shadow-2xl ring-1 ring-white/10">
            <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-[#0B1528] text-left">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-rose-500/80" />
                  <span className="inline-block h-3 w-3 rounded-full bg-amber-500/80" />
                  <span className="inline-block h-3 w-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-3 font-mono text-[11px] text-slate-400">
                    metapricex.com/dashboard
                  </span>
                </div>
                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-blue-400">
                  Canlı Önizleme
                </span>
              </div>

              <div className="grid grid-cols-12 gap-0 text-slate-800">
                {/* Sol menu — Sidebar.tsx ile birebir: 4 oge, bu sira, #0B1528 */}
                <div className="col-span-3 hidden min-h-[420px] flex-col justify-between border-r border-slate-800 bg-[#0B1528] p-4 text-slate-300 md:flex">
                  <div>
                    <div className="mb-6 flex items-center gap-2.5 px-1 py-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-sm font-black text-white shadow">
                        M
                      </div>
                      <span className="text-sm font-bold text-white">
                        MetaPrice<span className="text-blue-500">X</span>
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      {MOCKUP_NAV.map(({ etiket, ikon: Ikon, etkin }) => (
                        <div
                          key={etiket}
                          className={
                            etkin
                              ? 'flex items-center gap-2 rounded-lg bg-blue-600/20 px-3 py-2 font-bold text-blue-400'
                              : 'flex items-center gap-2 rounded-lg px-3 py-2 font-medium text-slate-400'
                          }
                        >
                          <Ikon className="h-3.5 w-3.5" />
                          {etiket}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Paket etiketi: varsayilan CORE (schema.prisma:43) — "PRO" degil */}
                  <div className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/80 p-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                      A
                    </div>
                    <div className="overflow-hidden">
                      <p className="truncate text-[11px] font-semibold text-white">ahmet.yilmaz</p>
                      <span className="inline-block text-[9px] font-bold text-slate-400">CORE</span>
                    </div>
                  </div>
                </div>

                <div className="col-span-12 space-y-4 bg-slate-50 p-5 md:col-span-9">
                  {/* Ust serit: yalniz sayfa adi + kur — kullanici menusu YOK (layout.tsx:183-185) */}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Ana Sayfa
                    </span>
                    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] shadow-sm">
                      <span>
                        USD <strong className="text-emerald-600">₺47,90</strong>
                      </span>
                      <span className="text-slate-300">|</span>
                      <span>
                        EUR <strong className="text-emerald-600">₺55,55</strong>
                      </span>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-black text-slate-900">Hoşgeldiniz, ahmet.yilmaz!</h2>
                    <p className="text-[11px] text-slate-500">MetaPriceX kontrol merkeziniz</p>
                  </div>

                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-8 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                      <span className="mb-2 block text-[11px] font-bold text-slate-800">
                        Hızlı Başlat
                      </span>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/20 p-3 text-center">
                          <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-xs text-emerald-600">
                            📊
                          </div>
                          <p className="text-[11px] font-bold text-slate-900">Excel Keşif</p>
                          <p className="text-[9px] text-slate-500">Metraj dosyanızı sürükleyin</p>
                          <div className="mt-1.5 flex gap-1">
                            <span className="rounded bg-emerald-100 px-1 font-mono text-[8px] text-emerald-800">
                              .xlsx
                            </span>
                            <span className="rounded bg-emerald-100 px-1 font-mono text-[8px] text-emerald-800">
                              .xls
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/20 p-3 text-center">
                          <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-md bg-blue-100 text-xs text-blue-600">
                            📐
                          </div>
                          <p className="text-[11px] font-bold text-slate-900">DWG Proje</p>
                          <p className="text-[9px] text-slate-500">Tesisat projesini sürükleyin</p>
                          <div className="mt-1.5 flex gap-1">
                            <span className="rounded bg-blue-100 px-1 font-mono text-[8px] text-blue-800">
                              .dwg
                            </span>
                            <span className="rounded bg-blue-100 px-1 font-mono text-[8px] text-blue-800">
                              .dxf
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Son Teklifler — tutar BILEREK yok: urun de gostermiyor (RecentQuotes hep "—" basar) */}
                    <div className="col-span-4 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-800">Son Teklifler</span>
                          <span className="text-[9px] text-slate-400">son 3</span>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                          <p className="truncate text-[10px] font-bold text-slate-800">
                            A Blok Mekanik Tesisat Metrajı
                          </p>
                          <div className="mt-1 flex justify-between text-[9px] text-slate-400">
                            <span>103 kalem</span>
                            <span>16 Ağustos 2026</span>
                          </div>
                        </div>
                      </div>
                      <span className="mt-2 block text-center text-[10px] font-bold text-blue-600">
                        Tüm teklifleri gör →
                      </span>
                    </div>

                    <div className="col-span-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-600">
                        🗄️
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-900">Malzeme Havuzu</p>
                        <p className="text-[9px] text-slate-500">Marka fiyat listeleri</p>
                      </div>
                    </div>

                    <div className="col-span-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-sm font-bold text-emerald-600">
                        📖
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-900">Kütüphanem</p>
                        <p className="text-[9px] text-slate-500">Markalar, iskontolar, işçilik</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OLCULMUS DEGERLER — pazarlama yuvarlamasi degil, test ciktisi */}
      <section className="border-y border-slate-200/80 bg-white py-10">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 text-center md:grid-cols-4">
          {OLCULEN.map(({ deger, etiket, vurgu }) => (
            <div key={deger}>
              <p
                className={
                  vurgu
                    ? 'text-3xl font-black text-blue-600'
                    : 'text-3xl font-black text-slate-900'
                }
              >
                {deger}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{etiket}</p>
            </div>
          ))}
        </div>
      </section>

      {/* OZELLIKLER */}
      <section id="ozellikler" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600">
              Modern İhale ve Metraj Yönetimi
            </h2>
            <p className="text-3xl font-extrabold text-slate-900">
              Karmaşık Hesaplamaları Otomatize Edin
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm transition-shadow hover:shadow-md md:col-span-2">
              <div>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-lg font-bold text-blue-600">
                  📐
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-900">
                  DWG ve DXF Projelerinden Metraj
                </h3>
                <p className="max-w-xl text-xs leading-relaxed text-slate-600">
                  Çizimdeki hat boylarını koordinat ve katman bazlı otomatik ölçer. Çapları
                  renkli kalemlerle siz atarsınız — her boruya tek tık. Yazılım çap tahmin
                  etmez; böylece yanlış çap teklife sessizce giremez. Uzunluklar çap bazında
                  anında gruplanır ve teklif tablosuna aktarılır.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-4 border-t border-slate-100 pt-4 text-xs font-semibold text-blue-600">
                <span>Katman filtreleme</span> • <span>Tıkla-etiketle çap atama</span>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
              <div>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-lg font-bold text-emerald-600">
                  📊
                </div>
                <h3 className="mb-2 text-lg font-bold text-slate-900">Excel Akıllı Eşleştirme</h3>
                <p className="text-xs leading-relaxed text-slate-600">
                  Çok sayfalı metraj cetvellerini tek seferde okur, gizli sayfaları atlar,
                  hiçbir sekmeyi düşürmez. Malzeme adlarından çap, yüzey ve cins etiketlerini
                  çıkarıp DN ile inç eşdeğerliğini kurar.
                </p>
              </div>
              <div className="mt-6 border-t border-slate-100 pt-4 text-xs font-semibold text-emerald-600">
                Sürükle-bırak · .xlsx ve .xls
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NASIL CALISIR — menudeki baglantinin gercek hedefi */}
      <section id="nasil-calisir" className="border-t border-slate-200/80 bg-white py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600">
              Nasıl Çalışır?
            </h2>
            <p className="text-3xl font-extrabold text-slate-900">Üç Adımda Teklif</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                no: '1',
                baslik: 'Fiyat listenizi kütüphaneye aktarın',
                metin:
                  'Malzeme Havuzundan çalıştığınız markayı seçin, "Kütüphaneme Aktar" ile kendi kütüphanenize kopyalayın. İskontonuzu girin; net fiyat kendiliğinden hesaplanır.',
              },
              {
                no: '2',
                baslik: 'Keşfi yükleyin',
                metin:
                  'Excel metrajınızı sürükleyin ya da DWG projenizden hat boylarını ölçtürüp çapları etiketleyin. Aynı teklife ikinci dosyayı yüklerseniz girdiğiniz marj ve fiyatlar korunarak birleşir.',
              },
              {
                no: '3',
                baslik: 'Teklifi üretin',
                metin:
                  'Malzeme adları kütüphanenizle eşleşir; birden çok aday varsa yazılım tahmin etmez, size sorar. Kaydetmeden önce fiyatsız kalan kalemleri sayıp önünüze koyar.',
              },
            ].map(({ no, baslik, metin }) => (
              <div
                key={no}
                className="rounded-2xl border border-slate-200/80 bg-slate-50 p-8 shadow-sm"
              >
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B1528] text-sm font-black text-white">
                  {no}
                </div>
                <h3 className="mb-2 text-base font-bold text-slate-900">{baslik}</h3>
                <p className="text-xs leading-relaxed text-slate-600">{metin}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KAPANIS */}
      <section className="bg-[#0B1528] py-16 text-white">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-2xl font-extrabold md:text-3xl">
            MetaPriceX ile Teklif Süreçlerinizi Dönüştürün
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-xs text-slate-400">
            Hemen ücretsiz hesabınızı oluşturun ve ilk keşif dosyanızı analiz etmeye başlayın.
          </p>
          <div className="mt-8">
            <Link
              href="/register"
              className="inline-block rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-blue-500"
            >
              Hesap Oluştur
            </Link>
          </div>
        </div>
      </section>

      {/*
        FOOTER — gizlilik/sartlar/iletisim baglantilari BILEREK YOK.
        Uc sayfanin ucu de repoda mevcut degil (arandi, 0 sonuc); `href="#"`
        tiklaninca hicbir sey yapmaz. Ayni gerekce login ekraninda "Parolami
        unuttum"u da engelledi. Sayfalar yazildiginda baglantilar da eklenir —
        hukuki metinlerde bos vaat, ozellik vaadinden daha agirdir.
      */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <p>© 2026 MetaPriceX. Tüm hakları saklıdır.</p>
        </div>
      </footer>
    </div>
  );
}
