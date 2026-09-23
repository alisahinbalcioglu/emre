'use client';

/**
 * HESABIM › PROFİL — kişi bilgileri (23.09.2026 tasarımı).
 *
 * ⚠ E-posta BİLEREK düzenlenemez: adres değişimi kimliğin kendisini değiştirir
 * ve doğrulama zinciri gerektirir (yeni adrese doğrulama, eskisine
 * bilgilendirme, `emailVerified` sıfırlama). Sunucu DTO'su da `email` alanını
 * kabul etmez; `whitelist: true` onu sessizce atar.
 */
import { useState } from 'react';
import api from '@/ortak/lib/api';
import type { HesapProfili } from './hesap-tipleri';
import {
  ANA_DUGME, Alan, GIRDI, IZGARA, Kart, KaydetSeridi, SALT_OKUNUR_GIRDI,
  hataMetni, type IslemDurumu,
} from './hesabim-ui';

export function ProfilSekmesi({
  profile,
  onGuncellendi,
}: {
  profile: HesapProfili;
  onGuncellendi: (p: HesapProfili) => void;
}) {
  const [kisi, setKisi] = useState({
    ad: profile.ad ?? '',
    soyad: profile.soyad ?? '',
    telefon: profile.telefon ?? '',
  });
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [durum, setDurum] = useState<IslemDurumu | null>(null);

  async function kisiKaydet(e: React.FormEvent) {
    e.preventDefault();
    setDurum(null);
    setKaydediliyor(true);
    try {
      const { data } = await api.patch<HesapProfili>('/auth/profil', kisi);
      onGuncellendi(data);
      setDurum({ tur: 'basari', metin: 'Kişi bilgileri kaydedildi.' });
    } catch (err) {
      setDurum({ tur: 'hata', metin: hataMetni(err, 'Kişi bilgileri kaydedilemedi.') });
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <form onSubmit={kisiKaydet}>
      <Kart
        id="kisi"
        baslik="Kişi bilgileri"
        aciklama="Teklif çıktısındaki “Hazırlayan” alanında ve iletişimde kullanılır."
        serit={
          <KaydetSeridi durum={durum}>
            <button type="submit" disabled={kaydediliyor} className={ANA_DUGME}>
              {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </KaydetSeridi>
        }
      >
        <div className={IZGARA}>
          <Alan id="p-ad" etiket="Ad">
            <input
              id="p-ad"
              autoComplete="given-name"
              placeholder="Adınız"
              value={kisi.ad}
              onChange={(e) => setKisi((o) => ({ ...o, ad: e.target.value }))}
              className={GIRDI}
            />
          </Alan>
          <Alan id="p-soyad" etiket="Soyad">
            <input
              id="p-soyad"
              autoComplete="family-name"
              placeholder="Soyadınız"
              value={kisi.soyad}
              onChange={(e) => setKisi((o) => ({ ...o, soyad: e.target.value }))}
              className={GIRDI}
            />
          </Alan>
          <Alan id="p-tel" etiket="Telefon">
            <input
              id="p-tel"
              type="tel"
              autoComplete="tel"
              placeholder="0533 000 00 00"
              value={kisi.telefon}
              onChange={(e) => setKisi((o) => ({ ...o, telefon: e.target.value }))}
              className={GIRDI}
            />
          </Alan>
          <Alan id="p-eposta" etiket="E-posta" ipucu="E-posta adresi buradan değiştirilemez.">
            <input id="p-eposta" type="email" readOnly value={profile.email} className={SALT_OKUNUR_GIRDI} />
          </Alan>
        </div>
      </Kart>
    </form>
  );
}
