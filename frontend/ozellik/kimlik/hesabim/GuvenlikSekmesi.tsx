'use client';

/**
 * HESABIM › GÜVENLİK — parola, iki adımlı giriş, şirket hesabı, oturum
 * (23.09.2026 tasarımı). "Çıkış yap" sayfanın en altından buraya taşındı.
 *
 * ⚠ TOKEN YAZIMI BU DOSYADA YOK: parola değiştirme ve iki adımlı giriş TAZE
 * token döner (sunucu `passwordChangedAt` damgalar, eski token `iat`
 * kapısına takılır). Yazımı sayfa yapar (`onTokenTazele`) — kaynak kapısı
 * `localStorage.setItem('token'`u iki gerekçeli dosyada tutar
 * (`ortak/lib/oturum.test.ts`).
 */
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import api from '@/ortak/lib/api';
import { ParolaAlani } from '@/ortak/ui/parola-alani';
// ⚠ ÇIPLAK SAYI YAZMAYIN: parola uzunluğu TEK sabitten okunur. 21.09'dan önce
// bu sayı ön yüzde dört ayrı yerde elle yazılıydı ve biri (kayıt ekranı)
// YANLIŞTI. Sunucu kopyası: `backend/src/altyapi/auth/parola-kurali.ts`
// (kapı: test:parola-kapisi).
import { PAROLA_MIN } from '@/ortak/lib/parola-kurali';
import { IkiAdimliGirisKarti } from '../IkiAdimliGirisKarti';
import { SirketHesabiKarti } from '../SirketHesabiKarti';
import type { HesapProfili } from './hesap-tipleri';
import {
  ANA_DUGME, Alan, GIRDI, IKINCIL_DUGME, IZGARA, Kart, KaydetSeridi, SatirKarti,
  hataMetni, type IslemDurumu,
} from './hesabim-ui';

/** Göz düğmesine yer bırakan parola girdisi (ParolaAlani'nın düğmesi sağda). */
const PAROLA_GIRDISI = `${GIRDI} pr-11`;

export function GuvenlikSekmesi({
  profile,
  onTokenTazele,
  onYenile,
  onCikis,
}: {
  profile: HesapProfili;
  onTokenTazele: (token: unknown) => void;
  onYenile: () => void;
  onCikis: () => void;
}) {
  return (
    <>
      <ParolaKarti onTokenTazele={onTokenTazele} />

      {/* ── FAZ 7 F2b · İKİ ADIMLI GİRİŞ ──────────────────────────────── */}
      {profile.mfa && (
        <IkiAdimliGirisKarti
          mfa={profile.mfa}
          onTokenTazele={onTokenTazele}
          onYenile={onYenile}
        />
      )}

      {/* ── FAZ 7 F3b · ŞİRKET HESABI ─────────────────────────────────── */}
      {profile.kurumsal && <SirketHesabiKarti kurumsal={profile.kurumsal} onYenile={onYenile} />}

      <SatirKarti baslik="Oturum" aciklama="Bu cihazdaki oturumunuzu kapatır.">
        <button type="button" onClick={onCikis} className={IKINCIL_DUGME}>
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Çıkış Yap
        </button>
      </SatirKarti>
    </>
  );
}

/** FAZ 3.5 · parola değiştirme. */
function ParolaKarti({ onTokenTazele }: { onTokenTazele: (token: unknown) => void }) {
  const [mevcutParola, setMevcutParola] = useState('');
  const [yeniParola, setYeniParola] = useState('');
  const [yeniTekrar, setYeniTekrar] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [durum, setDurum] = useState<IslemDurumu | null>(null);

  async function parolaDegistir(e: React.FormEvent) {
    e.preventDefault();
    setDurum(null);
    if (yeniParola !== yeniTekrar) {
      setDurum({ tur: 'hata', metin: 'Yeni parolalar eşleşmiyor.' });
      return;
    }
    setYukleniyor(true);
    try {
      const { data } = await api.post('/auth/change-password', { mevcutParola, yeniParola });
      // ⚠ TAZE TOKEN SAKLANMAZSA kullanıcı değiştirmeden sonraki İLK istekte
      // 401 alır ve /login'e atılır — başarılı bir işlem, çıkış yaptırılmış
      // gibi görünür. Yanıt `user` taşımadığı için yalnız TOKEN tazelenir.
      onTokenTazele(data?.token);
      setDurum({ tur: 'basari', metin: data?.mesaj ?? 'Parolanız güncellendi.' });
      setMevcutParola('');
      setYeniParola('');
      setYeniTekrar('');
    } catch (err) {
      setDurum({ tur: 'hata', metin: hataMetni(err, 'Parola güncellenemedi, tekrar deneyin.') });
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <form onSubmit={parolaDegistir}>
      <Kart
        id="parola"
        baslik="Parola"
        aciklama="Parolanızı değiştirdiğinizde diğer cihazlardaki oturumlar kapatılır."
        serit={
          <KaydetSeridi durum={durum}>
            <button type="submit" disabled={yukleniyor} className={ANA_DUGME}>
              {yukleniyor ? 'Kaydediliyor…' : 'Parolayı değiştir'}
            </button>
          </KaydetSeridi>
        }
      >
        <div className={IZGARA}>
          <Alan id="mevcutParola" etiket="Mevcut parola">
            <ParolaAlani
              id="mevcutParola"
              value={mevcutParola}
              onChange={setMevcutParola}
              autoComplete="current-password"
              placeholder=""
              girdiSinifi={PAROLA_GIRDISI}
            />
          </Alan>
          {/* Tasarım: mevcut parola tek başına ilk satırda, yenileri altta yan yana. */}
          <div aria-hidden className="hidden sm:block" />
          <Alan id="yeniParola" etiket="Yeni parola">
            <ParolaAlani
              id="yeniParola"
              value={yeniParola}
              onChange={setYeniParola}
              autoComplete="new-password"
              minLength={PAROLA_MIN}
              placeholder=""
              girdiSinifi={PAROLA_GIRDISI}
            />
          </Alan>
          <Alan id="yeniTekrar" etiket="Yeni parola (tekrar)">
            <ParolaAlani
              id="yeniTekrar"
              value={yeniTekrar}
              onChange={setYeniTekrar}
              autoComplete="new-password"
              minLength={PAROLA_MIN}
              placeholder=""
              girdiSinifi={PAROLA_GIRDISI}
            />
          </Alan>
        </div>
      </Kart>
    </form>
  );
}
