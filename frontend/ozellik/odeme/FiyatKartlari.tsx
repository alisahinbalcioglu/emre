'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/ortak/lib/api';
import { KAPSAM_ETIKET, SEVIYE_ETIKET, donemEki, kotaMetni, vitrinFiyati, type Paket } from './paket-bicim';

/**
 * FİYAT KARTLARI — `/fiyatlar` sayfasının canlı bölümü (Faz 6.1, 13.09.2026).
 *
 * ⚠ HİÇBİR RAKAM BURADA YAZILI DEĞİL. Fiyat, deneme günü ve çeviri kotası
 * `GET /api/fiyatlar`'dan okunur: fiyat `PaketSurumu`'ndan, kota sunucudaki
 * tek tablodan (seviye × kapsam). Sayfaya sabit yazılan bir tutar, fiyat
 * değiştiğinde sessizce yalan söylerdi — `fiyat-sayfasi.test.ts` bunu ekrana
 * giden metinden ölçer.
 *
 * ⚠ NEDEN İSTEMCİDE OKUNUYOR: sunucu bileşeninde okunsaydı ya derleme anında
 * sayfaya gömülürdü (fiyat değişince bayat kalır) ya da ön yüz konteynerinin
 * backend'e sunucu tarafında erişmesi gerekirdi — o yol bu projede ölçülmedi.
 * Abonelik sayfası da aynı şekilde istemcide okuyor.
 *
 * Suite burada GÖRÜNMEZ: uç satılabilir paketleri döndürür ve `PackageLevel`
 * enum'unda suite yoktur. Bileşen ayrıca seviye süzmez — süzgeç ikinci bir
 * "hangi paket satılır" kararı üretirdi.
 */
type Durum = { tur: 'yukleniyor' } | { tur: 'hata' } | { tur: 'hazir'; paketler: Paket[] };

export function FiyatKartlari() {
  const [durum, setDurum] = useState<Durum>({ tur: 'yukleniyor' });

  useEffect(() => {
    let iptal = false;
    api
      .get<Paket[]>('/fiyatlar')
      .then(({ data }) => {
        if (iptal) return;
        // ⚠ Dizi olmayan 200 (ör. vekil sunucunun HTML sayfası) "satışta paket
        // yok" DEĞİLDİR — hata olarak gösterilir, yoksa sayfa yanlış bilgi verir.
        setDurum(Array.isArray(data) ? { tur: 'hazir', paketler: data } : { tur: 'hata' });
      })
      .catch(() => {
        if (!iptal) setDurum({ tur: 'hata' });
      });
    return () => {
      iptal = true;
    };
  }, []);

  return (
    // Kalıcı canlı bölge: içerik değişince ekran okuyucu yeni durumu duyurur.
    // Yalnız "yükleniyor" yazısına konsaydı, veri gelince bölge DOM'dan kalkar
    // ve sonuç hiç okunmazdı.
    <div aria-live="polite" aria-busy={durum.tur === 'yukleniyor'}>
      {durum.tur === 'yukleniyor' && (
        <p className="py-10 text-center text-sm text-slate-500">Fiyatlar yükleniyor…</p>
      )}

      {durum.tur === 'hata' && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Fiyatlar şu an yüklenemedi. Sayfayı birkaç dakika sonra yenileyin.
        </p>
      )}

      {durum.tur === 'hazir' && durum.paketler.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Şu an satışta paket bulunmuyor.
        </p>
      )}

      {/* ⚠ KART HİZASI (Faz 6.1 kapanış, 15.09): her kart dış ızgaranın 6 satırına
          yayılır ve satır yüksekliklerini ondan alır (subgrid). Aynı sıradaki kartlarda
          başlık, rozetler, fiyat, kota kutusu, liste ve düğme aynı hizada başlar; iki
          satıra inen paket adı ya da uzun tahsilat satırı komşu kartı kaydırmaz.
          Kota yoksa satır BOŞ KUTUYLA tutulur — koşulla düşen satır listeyi kota
          satırına kaydırırdı. Satır eklenirse row-span de değişmeli (fiyat-sayfasi.test.ts). */}
      {durum.tur === 'hazir' && durum.paketler.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {durum.paketler.map((p) => {
            const fiyat = vitrinFiyati(p.surum);
            const kota = p.ceviriKotasi ? kotaMetni(p.ceviriKotasi, p.surum) : null;
            return (
              <article
                key={p.paketId}
                className="row-span-6 grid grid-rows-subgrid gap-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-lg font-bold text-slate-900">{p.ad}</h2>
                {/* İki etiket ALT ALTA: yan yanayken dar kartta ikincisi alta iniyor, o kartın
                    fiyatı komşularından bir satır aşağıda başlıyordu. */}
                <div className="mt-2 flex flex-col items-start gap-1.5">
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    {KAPSAM_ETIKET[p.kapsam] ?? p.kapsam}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {SEVIYE_ETIKET[p.seviye] ?? p.seviye}
                  </span>
                </div>

                <div className="mt-5">
                  <span className="text-3xl font-black tracking-tight text-slate-900">{fiyat.ana}</span>
                  <span className="text-sm text-slate-500"> {donemEki(p.surum)}</span>
                  {fiyat.alt && <p className="mt-1 text-xs text-slate-500">{fiyat.alt}</p>}
                  {p.surum.denemeGunu > 0 && (
                    <p className="mt-1 text-xs font-semibold text-emerald-700">
                      {p.surum.denemeGunu} gün ücretsiz deneme · kart bilgisiyle başlar
                    </p>
                  )}
                </div>

                {kota ? (
                  <div className="mt-5 rounded-xl bg-slate-50 p-4">
                    <p className="text-base font-bold text-slate-900">{kota.baslik}</p>
                    <p className="text-xs text-slate-500">({kota.ikincil})</p>
                  </div>
                ) : (
                  <div aria-hidden="true" />
                )}

                <ul className="mt-5 space-y-1.5 text-sm text-slate-700">
                  <li>
                    {p.aylikTeklifHakki === null ? 'Sınırsız teklif' : `Ayda ${p.aylikTeklifHakki} teklif`}
                  </li>
                  <li>DWG ve DXF metrajı {p.dwgAktif ? 'dâhil' : 'dâhil değil'}</li>
                  {/* FAZ 7 F1b (§6.6): "N kullanıcıya kadar" belirsizdi — sahip sayılıyor
                      mu? Emre kararı E-2 ile hak FİRMA SAHİBİ DAHİL sayılıyor. */}
                  <li>Firma sahibi dahil {p.kullaniciHakki} kullanıcı</li>
                </ul>

                <Link
                  href="/register"
                  className="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-blue-700"
                >
                  Hesap oluşturun
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
