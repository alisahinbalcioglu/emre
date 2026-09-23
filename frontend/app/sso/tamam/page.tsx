'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — ŞİRKET GİRİŞİ DÖNÜŞ SAYFASI (§6.3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  IdP → `/api/auth/sso/donus` → 302 → BURASI. Sunucu dönüşte HİÇBİR YAN ETKİ
 *  üretmedi: elimizde 60 saniyelik tek kullanımlık bir `kod` var. Karar
 *  `degis` çağrısında, SEKME SIRRI doğrulandıktan sonra veriliyor.
 *
 *  ⚠ `useRef` bayrağı ŞART: React geliştirme modu efektleri İKİ KEZ çalıştırır
 *  ve ikinci `degis` çağrısı 401 alırdı (kod tek kullanımlık) — kullanıcı
 *  hiçbir şey yapmadan "bağlantının süresi doldu" görürdü.
 *
 *  ⚠ `kod` adres çubuğundan HEMEN silinir (`replaceState`): tarayıcı geçmişi,
 *  ekran paylaşımı ve `Referer` başlığı onu taşımasın.
 *
 *  ⚠ Sayfa `noindex` ve `HERKESE_ACIK_SAYFALAR` listesine EKLENMEZ.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/ortak/lib/api';
import { oturumuYaz, girisSonrasiYol } from '@/ortak/lib/oturum';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import { sirriOku, sirriSil } from '@/ozellik/kimlik/kurumsal-baslat';
import { MfaKodAdimi } from '@/ozellik/kimlik/MfaKodAdimi';

type KatilimOnayi = { tip: 'katilim-onayi'; bilet: string; firmaAd: string; eposta: string };

export default function SsoTamamPage() {
  const router = useRouter();
  const kosuldu = useRef(false);
  const [durum, setDurum] = useState<'bekliyor' | 'mfa' | 'katilim' | 'hata'>('bekliyor');
  const [mesaj, setMesaj] = useState('Şirket hesabınız doğrulanıyor…');
  const [meydanOkuma, setMeydanOkuma] = useState('');
  const [katilim, setKatilim] = useState<KatilimOnayi | null>(null);
  const [sozlesmeOnayi, setSozlesmeOnayi] = useState(false);
  const [ticariIletiOnayi, setTicariIletiOnayi] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  useEffect(() => {
    if (kosuldu.current) return;
    kosuldu.current = true;

    const adres = new URL(window.location.href);
    const kod = adres.searchParams.get('kod');
    // Adres çubuğunu HEMEN temizle (kod geçmişe/Referer'a düşmesin).
    window.history.replaceState(null, '', '/sso/tamam');

    const sir = sirriOku();
    if (!kod || !sir) {
      setDurum('hata');
      setMesaj(
        'Giriş bu sekmede başlatılmadı ya da bağlantının süresi doldu. ' +
          'Lütfen giriş ekranından yeniden deneyin.',
      );
      return;
    }

    (async () => {
      try {
        const { data } = await api.post('/auth/sso/degis', { kod, tarayiciSirri: sir });
        if (data?.tip === 'oturum') {
          sirriSil();
          const oturum = oturumuYaz(data);
          router.push(girisSonrasiYol(oturum));
          return;
        }
        if (data?.tip === 'mfa') {
          sirriSil();
          setMeydanOkuma(String(data.meydanOkuma ?? ''));
          setDurum('mfa');
          return;
        }
        if (data?.tip === 'katilim-onayi') {
          // ⚠ Sır SİLİNMEZ: `katil` çağrısı onu yeniden isteyecek.
          setKatilim(data as KatilimOnayi);
          setDurum('katilim');
          return;
        }
        sirriSil();
        if (data?.tip === 'sinandi') {
          const ek = data.hesapBaglandi === false ? '&hesap=baglanmadi' : '';
          router.push(`/firma/ekip/kurumsal-giris?sonuc=sinandi${ek}`);
          return;
        }
        if (data?.tip === 'baglandi') {
          // 23.09: Şirket hesabı kartı Hesabım'ın GÜVENLİK sekmesinde; varsayılan
          // Profil sekmesine düşen kişi bağlantının kurulduğunu göremezdi.
          router.push('/profile?sekme=guvenlik&kurumsal=baglandi');
          return;
        }
        setDurum('hata');
        setMesaj('Beklenmeyen bir yanıt alındı. Lütfen yeniden deneyin.');
      } catch (err) {
        sirriSil();
        setDurum('hata');
        setMesaj(kimlikHataMetni(err, 'Şirket girişi tamamlanamadı. Lütfen yeniden deneyin.'));
      }
    })();
  }, [router]);

  async function katil() {
    if (!katilim || !sozlesmeOnayi) return;
    const sir = sirriOku();
    if (!sir) {
      setDurum('hata');
      setMesaj('Giriş bu sekmede başlatılmadı. Lütfen yeniden deneyin.');
      return;
    }
    setGonderiliyor(true);
    try {
      const { data } = await api.post('/auth/sso/katil', {
        bilet: katilim.bilet,
        tarayiciSirri: sir,
        sozlesmeOnayi: true,
        ticariIletiOnayi,
      });
      sirriSil();
      const oturum = oturumuYaz(data);
      router.push(girisSonrasiYol(oturum));
    } catch (err) {
      setDurum('hata');
      setMesaj(kimlikHataMetni(err, 'Ekibe katılım tamamlanamadı.'));
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <meta name="robots" content="noindex" />
      <meta name="referrer" content="no-referrer" />
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        {durum === 'bekliyor' && <p className="text-sm text-slate-600">{mesaj}</p>}

        {durum === 'mfa' && (
          <MfaKodAdimi
            meydanOkuma={meydanOkuma}
            onOturum={(data) => {
              const oturum = oturumuYaz(data);
              router.push(girisSonrasiYol(oturum));
            }}
            onSuresiDoldu={(m) => {
              setDurum('hata');
              setMesaj(m);
            }}
            onGeri={() => {
              setDurum('hata');
              setMesaj('Giriş yarıda bırakıldı. Giriş ekranından yeniden deneyebilirsiniz.');
            }}
          />
        )}

        {durum === 'katilim' && katilim && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              {katilim.firmaAd} ekibine katılıyorsunuz
            </h2>
            <p className="text-xs text-slate-500">{katilim.eposta}</p>

            {/* ⚠ İKİ AYRI KUTU, kayıt ekranıyla AYNI metin (faz5 B6 deseni):
                pazarlama izni sözleşme onayına YEDİRİLEMEZ. */}
            <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={sozlesmeOnayi}
                  onChange={(e) => setSozlesmeOnayi(e.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-600/30"
                />
                <span className="text-[11px] leading-relaxed text-slate-600">
                  <Link href="/kullanim-kosullari" target="_blank" className="font-semibold text-blue-600 hover:text-blue-700">
                    Kullanım Koşulları
                  </Link>
                  {' '}ve{' '}
                  <Link href="/gizlilik" target="_blank" className="font-semibold text-blue-600 hover:text-blue-700">
                    Gizlilik ve KVKK Aydınlatma Metni
                  </Link>
                  {''}ni okudum, kabul ediyorum.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={ticariIletiOnayi}
                  onChange={(e) => setTicariIletiOnayi(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-600/30"
                />
                <span className="text-[11px] leading-relaxed text-slate-600">
                  Kampanya ve yenilik duyurularının e-posta ile gönderilmesine izin
                  veriyorum. <span className="text-slate-400">(isteğe bağlı — bu kutu
                  işaretlenmese de hesabınız açılır)</span>
                </span>
              </label>
            </div>

            <button
              type="button"
              onClick={katil}
              disabled={!sozlesmeOnayi || gonderiliyor}
              className="w-full rounded-xl bg-[#0B1528] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {gonderiliyor ? 'Katılınıyor…' : 'Ekibe katıl'}
            </button>
          </div>
        )}

        {durum === 'hata' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">{mesaj}</p>
            <Link href="/login" className="text-xs font-bold text-blue-600 hover:text-blue-700">
              Giriş ekranına dön
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
