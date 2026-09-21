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
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import { kurumsalGirisiBaslat, SAGLAYICI_ADI } from '@/ozellik/kimlik/kurumsal-baslat';

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

  return (
    <div className="mb-6 rounded-xl border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">Şirket hesabı</h3>

      {kurumsal.bagli ? (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Hesabınız {SAGLAYICI_ADI[kurumsal.saglayiciTipi ?? ''] ?? 'şirket'} hesabınıza bağlı.
            Giriş ekranında &quot;Şirket hesabımla giriş yap&quot; ile girebilirsiniz.
          </p>
          {kurumsal.parolaTanimli ? (
            <input
              type="password"
              value={parola}
              onChange={(e) => setParola(e.target.value)}
              placeholder="Parolanız"
              className="mb-2 block w-full rounded border px-2 py-1 text-sm"
            />
          ) : (
            <p className="mb-2 text-xs text-muted-foreground">
              Bağlantıyı kaldırmak için son 10 dakika içinde şirket hesabınızla giriş yapmış
              olmanız gerekir.
            </p>
          )}
          <button
            type="button"
            onClick={kaldir}
            disabled={calisiyor}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-60"
          >
            Bağlantıyı kaldır
          </button>
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Şirket hesabınızı bağlarsanız parolanızı yazmadan girebilirsiniz.
            Şirket hesabınızın e-posta adresi bu hesabın adresiyle aynı olmalıdır.
          </p>
          {kurumsal.parolaTanimli && (
            <input
              type="password"
              value={parola}
              onChange={(e) => setParola(e.target.value)}
              placeholder="Parolanız"
              className="mb-2 block w-full rounded border px-2 py-1 text-sm"
            />
          )}
          <button
            type="button"
            onClick={bagla}
            disabled={calisiyor}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-60"
          >
            Şirket hesabımı bağla
          </button>
        </>
      )}

      {!kurumsal.parolaTanimli && (
        <p className="mt-3 rounded bg-muted p-2 text-xs text-muted-foreground">
          Hesabınız şirket hesabıyla açıldı; parolası yok. Parola belirlemek için giriş
          ekranındaki &quot;Parolamı unuttum&quot; adımını kullanabilirsiniz (firmanız kurumsal
          girişi zorunlu kılmadıysa).
        </p>
      )}
      {bilgi && <p className="mt-2 text-xs text-emerald-600">{bilgi}</p>}
      {hata && <p className="mt-2 text-xs text-red-600">{hata}</p>}
    </div>
  );
}
