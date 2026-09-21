'use client';

/**
 * GIRIS EKRANI — MetaPriceX marka kimligi (16.08).
 *
 * "Parolamı unuttum" baglantisi 08.09'da EKLENDI (Faz 3.3). 16.08'de bilerek
 * konmamisti: o gun ne `/forgot-password` sayfasi ne de bir backend ucu vardi
 * ve tiklanip hicbir sey yapmayan bir baglanti, ekranin var olmayan bir sey
 * vaat etmesi olurdu. Artik ikisi de var — soz tutuluyor.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { oturumuYaz, girisSonrasiYol, girisDaliCoz, type GirisDali } from '@/ortak/lib/oturum';
import { GirisDaliEkrani } from '@/ozellik/kimlik/GirisDaliEkrani';
import api from '@/ortak/lib/api';
import { ParolaAlani } from '@/ortak/ui/parola-alani';
import { toast } from '@/ortak/hooks/use-toast';
import {
  kurumsalGirisiBaslat,
  kurumsalKesfet,
  SAGLAYICI_ADI,
  type KurumsalKesif,
} from '@/ozellik/kimlik/kurumsal-baslat';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // FAZ 7 F2b: giris IKI ADIMLI olabilir. `dal` doluysa ekran ikinci adimi
  // cizer; `null` ise bugunku parola formu.
  const [dal, setDal] = useState<GirisDali | null>(null);
  // ── FAZ 7 F3b (§6.2 adim 4): SIRKET GIRISI KESFI ─────────────────────
  // ⚠ Hicbir firma ayar yapmadiysa kesif HER ZAMAN `null` doner ve ekran
  // bugunkuyle BIREBIR kalir ("kimseye gorunmez").
  const [kesif, setKesif] = useState<KurumsalKesif>(null);
  const [kurumsalYukleniyor, setKurumsalYukleniyor] = useState(false);
  // Alan adi basina bellek onbellegi: her tusa basista istek atilmasin.
  const kesifOnbellegi = useRef<Map<string, KurumsalKesif>>(new Map());

  // URL'deki `kurumsal_hata=<KOD>` → Turkce bildirim, sonra parametre silinir.
  useEffect(() => {
    const adres = new URL(window.location.href);
    const kod = adres.searchParams.get('kurumsal_hata');
    if (!kod) return;
    window.history.replaceState(null, '', '/login');
    toast({
      variant: 'destructive',
      title: 'Şirket girişi',
      description: kimlikHataMetni({ response: { data: { kod } } }, 'Şirket girişi tamamlanamadı.'),
    });
  }, []);

  // E-posta gecerli bicime gelince 400 ms bekleyip kesfet.
  useEffect(() => {
    const alan = email.split('@')[1]?.trim().toLowerCase();
    if (!alan || !alan.includes('.')) {
      setKesif(null);
      return;
    }
    const onbellek = kesifOnbellegi.current.get(alan);
    if (onbellek !== undefined) {
      setKesif(onbellek);
      return;
    }
    const zaman = setTimeout(async () => {
      try {
        const sonuc = await kurumsalKesfet(email);
        kesifOnbellegi.current.set(alan, sonuc);
        setKesif(sonuc);
      } catch {
        // Kesif BASARISIZ olursa ekran bugunku haliyle calismaya DEVAM eder:
        // parola yolu asla kesif yuzunden kapanmaz.
        setKesif(null);
      }
    }, 400);
    return () => clearTimeout(zaman);
  }, [email]);

  async function sirketHesabiylaGir() {
    if (!kesif?.saglayiciId) return;
    setKurumsalYukleniyor(true);
    try {
      await kurumsalGirisiBaslat({ tip: 'giris', saglayiciId: kesif.saglayiciId });
    } catch (err) {
      setKurumsalYukleniyor(false);
      toast({
        variant: 'destructive',
        title: 'Şirket girişi',
        description: kimlikHataMetni(err, 'Şirket girişi başlatılamadı.'),
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      // ⚠ FAZ 7 F2b: DAL KARARI `oturumuYaz`DAN ONCE. MFA yanitinda `token`
      // ANAHTARI YOKTUR; dogrudan `oturumuYaz`a vermek kullaniciya
      // "Sunucudan gecerli bir oturum anahtari gelmedi" gibi YANILTICI bir
      // hata gosterirdi (dogru davranis: kod ekranini cizmek).
      const karar = girisDaliCoz(data);
      if (karar.tip !== 'oturum') {
        setDal(karar);
        return;
      }
      // FAZ 7 F1b (§6.1): oturum yazimi TEK yardimcidan. Gecersiz yanitta
      // FIRLATIR — "undefined" dizgesi token olarak yazilmaz.
      const oturum = oturumuYaz(data);
      router.push(girisSonrasiYol(oturum));
    } catch (err: any) {
      // FAZ 7 F3b (V7): parola DOGRU ama firma kurumsal girisi zorunlu kildi.
      // ⚠ Sunucu bu karari PAROLA DOGRULANDIKTAN SONRA veriyor (§5.10):
      // yanlis parolayla gelen biri bu dali GORMEZ.
      if (err.response?.data?.kod === 'KURUMSAL_GIRIS_ZORUNLU') {
        setPassword('');
        toast({
          variant: 'destructive',
          title: 'Şirket girişi gerekli',
          description: kimlikHataMetni(err),
        });
        return;
      }
      toast({
        variant: 'destructive',
        title: 'Giriş başarısız',
        description: err.response?.data?.message || 'E-posta veya parola hatalı.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      {/* Marka bloğu — kartın DIŞINDA */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-2xl font-black text-white shadow-lg shadow-blue-500/30">
          M
        </div>
        <h1 className="flex items-center gap-0.5 text-2xl font-extrabold tracking-tight text-slate-900">
          MetaPrice<span className="text-blue-600">X</span>
        </h1>
        <p className="mt-1 text-xs text-slate-500">Teklif ve metraj yönetim merkeziniz</p>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        {dal ? (
          <GirisDaliEkrani
            dal={dal}
            onOturum={(data) => {
              const oturum = oturumuYaz(data);
              router.push(girisSonrasiYol(oturum));
            }}
            onSuresiDoldu={(mesaj) => {
              setDal(null);
              toast({ variant: 'destructive', title: 'Doğrulama', description: mesaj });
            }}
            onGeri={() => setDal(null)}
          />
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-700">
              E-posta Adresi
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="ornek@sirket.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 transition-all focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>

          {/* ⚠ FAZ 7 F3b: firma kurumsal girisi ZORUNLU kildiysa parola
              alani ve "Parolami unuttum" CIZILMEZ — o yollar sunucuda da
              kapalidir (V7); ekranda birakmak calismayan bir soz olurdu. */}
          {!kesif?.zorunlu && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
                Parola
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
              >
                Parolamı unuttum
              </Link>
            </div>
            <ParolaAlani
              id="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </div>
          )}

          {kesif?.zorunlu && (
            <p className="rounded-xl bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-900">
              Şirketiniz kurumsal giriş kullanıyor. Aşağıdaki düğmeyle şirket
              hesabınızla giriş yapın.
            </p>
          )}

          {!kesif?.zorunlu && (
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-[#0B1528] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
          )}
        </form>
        )}

        {!dal && kesif?.saglayiciId && (
          <button
            type="button"
            onClick={sirketHesabiylaGir}
            disabled={kurumsalYukleniyor}
            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {kurumsalYukleniyor
              ? 'Yönlendiriliyor…'
              : 'Şirket hesabımla giriş yap (' + (SAGLAYICI_ADI[kesif.tip] ?? 'Şirket') + ')'}
          </button>
        )}

        <div className="mt-6 text-center text-xs text-slate-500">
          Hesabınız yok mu?{' '}
          <Link href="/register" className="font-bold text-blue-600 hover:text-blue-700">
            Kayıt Olun
          </Link>
        </div>
      </div>
    </div>
  );
}
