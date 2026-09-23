'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — PROFİL: ŞİRKET HESABI KARTI (§6.7)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BAĞLAMA PAROLA İSTER (R1-O3): şirket hesabını bağlamak, hesaba KALICI ve
 *  PAROLASIZ bir giriş yolu eklemektir. Çalınmış bir oturum anahtarıyla tek
 *  başına yapılabilseydi, saldırgan kendi kurumsal kimliğini kurbanın hesabına
 *  bağlayıp parola değişse bile girmeye devam ederdi.
 *
 *  ⚠ PAROLASIZ HESAPTA (şirket girişiyle açılan hesap) parola yerine "son 10
 *  dakikada şirket hesabıyla giriş" kanıtı aranır — kanıt `authAt`tır, `iat`
 *  DEĞİL: MFA uçları taze `iat` basar ama `authAt`ı KOPYALAR.
 *
 *  ⚠ KART OTURUMU DÜŞÜRMEZ: uçlar yanlış parolada 400 döner (401 değil).
 */

import { useState } from 'react';
import api from '@/ortak/lib/api';
import { cn } from '@/ortak/lib/utils';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import { kurumsalGirisiBaslat, SAGLAYICI_ADI } from '@/ozellik/kimlik/kurumsal-baslat';
import { GIRDI, IKINCIL_DUGME } from './hesabim/hesabim-ui';

export type KurumsalBilgi = {
  bagli: boolean;
  saglayiciTipi: string | null;
  saglayiciDurumu: string | null;
  parolaTanimli: boolean;
};

export function SirketHesabiKarti({
  kurumsal,
  onYenile,
}: {
  kurumsal: KurumsalBilgi;
  onYenile: () => void;
}) {
  const [parola, setParola] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);

  const saglayiciHazir =
    kurumsal.saglayiciDurumu === 'DOGRULANDI' || kurumsal.saglayiciDurumu === 'ETKIN';

  async function bagla() {
    setHata(null);
    setCalisiyor(true);
    try {
      await kurumsalGirisiBaslat({
        tip: 'niyet',
        amac: 'bagla',
        ...(kurumsal.parolaTanimli ? { parola } : {}),
      });
    } catch (e) {
      setCalisiyor(false);
      setHata(kimlikHataMetni(e, 'Şirket hesabı bağlanamadı.'));
    }
  }

  async function kaldir() {
    setHata(null);
    setCalisiyor(true);
    try {
      await api.delete('/auth/sso/baglanti', {
        data: kurumsal.parolaTanimli ? { parola } : {},
      });
      setParola('');
      setBilgi('Şirket hesabı bağlantısı kaldırıldı.');
      onYenile();
    } catch (e) {
      setHata(kimlikHataMetni(e, 'Bağlantı kaldırılamadı.'));
    } finally {
      setCalisiyor(false);
    }
  }

  // Firmada sağlayıcı yoksa ve bağlı da değilsek kart HİÇ çizilmez
  // ("kimseye görünmez" kuralı profilde de geçerli).
  if (!kurumsal.bagli && !saglayiciHazir) return null;

  // 23.09.2026 — Hesabım tasarımı: Güvenlik sekmesindeki öbür kartlarla aynı
  // kart (beyaz, 12 px köşe, gri kenarlık); metinler ve akış DEĞİŞMEDİ.
  const parolaKutusu = (
    <input
      type="password"
      value={parola}
      onChange={(e) => setParola(e.target.value)}
      placeholder="Parolanız"
      aria-label="Parolanız"
      className={cn(GIRDI, 'mt-3 max-w-sm')}
    />
  );

  return (
    <section aria-labelledby="sirket-hesabi-baslik" className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 id="sirket-hesabi-baslik" className="text-base font-semibold text-gray-900">Şirket hesabı</h2>

      {kurumsal.bagli ? (
        <>
          <p className="mt-1.5 text-[13px] text-gray-500">
            Hesabınız {SAGLAYICI_ADI[kurumsal.saglayiciTipi ?? ''] ?? 'şirket'} hesabınıza bağlı.
            Giriş ekranında &quot;Şirket hesabımla giriş yap&quot; ile girebilirsiniz.
          </p>
          {kurumsal.parolaTanimli ? (
            parolaKutusu
          ) : (
            <p className="mt-2 text-[13px] text-gray-500">
              Bağlantıyı kaldırmak için son 10 dakika içinde şirket hesabınızla giriş yapmış
              olmanız gerekir.
            </p>
          )}
          <div className="mt-4">
            <button type="button" onClick={kaldir} disabled={calisiyor} className={IKINCIL_DUGME}>
              Bağlantıyı kaldır
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-[13px] text-gray-500">
            Şirket hesabınızı bağlarsanız parolanızı yazmadan girebilirsiniz.
            Şirket hesabınızın e-posta adresi bu hesabın adresiyle aynı olmalıdır.
          </p>
          {kurumsal.parolaTanimli && parolaKutusu}
          <div className="mt-4">
            <button type="button" onClick={bagla} disabled={calisiyor} className={IKINCIL_DUGME}>
              Şirket hesabımı bağla
            </button>
          </div>
        </>
      )}

      {!kurumsal.parolaTanimli && (
        <p className="mt-4 rounded-[10px] bg-gray-100 p-3 text-[13px] text-gray-600">
          Hesabınız şirket hesabıyla açıldı; parolası yok. Parola belirlemek için giriş
          ekranındaki &quot;Parolamı unuttum&quot; adımını kullanabilirsiniz (firmanız kurumsal
          girişi zorunlu kılmadıysa).
        </p>
      )}
      {bilgi && <p role="status" className="mt-3 text-[13px] text-emerald-700">{bilgi}</p>}
      {hata && <p role="alert" className="mt-3 text-[13px] text-red-600">{hata}</p>}
    </section>
  );
}
