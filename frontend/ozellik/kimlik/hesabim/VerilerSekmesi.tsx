'use client';

/**
 * HESABIM › VERİLER — KVKK m.11 "Verilerimi indir" + "Hesabımı kapat"
 * (23.09.2026 tasarımı). Firma sahibi de alt kullanıcı da görür: ikisi de
 * KİŞİNİN hakkıdır, firmanın değil (gerekçe `hesabim.ts` → `UYE_SEKMELERI`).
 *
 * ⚠ Bu iki iş ÖDEME KAPISININ ARKASINDA DEĞİL: bir KVKK hakkı ödeme durumuna
 * bağlanamaz. Kapalı hesap da buraya gelebilir — `/profile` kapalı hesabın
 * kalabileceği yollarda (`api.ts` `KAPALI_HESABIN_KALABILECEGI_YOL`).
 *
 * ⚠ İNDİRME TEK YERDEN: `verileri-indir.ts` (koltuk durdurma ekranıyla aynı
 * yardımcı). Eskiden profil kendi kopyasını taşıyordu ve bağlantıyı belgeye
 * EKLEMEDEN tıklıyordu; yardımcı ekleyip çıkarır ve adresi serbest bırakır.
 *
 * ⚠ KAPATMA METNİ burada YAZILMAZ: `kapatma-metinleri.ts`
 * `hesapKapatmaMaddeleri`. "Firmam kapanıyor mu" kararı SUNUCUDADIR
 * (`ayrilmaKarari`); ekranda ikinci bir "son sahip mi" hesabı yapılmaz.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import api from '@/ortak/lib/api';
import { cn } from '@/ortak/lib/utils';
import { toast } from '@/ortak/hooks/use-toast';
import { verileriIndir } from '../verileri-indir';
import { hesapKapatmaMaddeleri, type KapatmaOnizlemesi } from '../kapatma-metinleri';
import { GIRDI, IKINCIL_DUGME, Kart, TEHLIKE_DUGME, hataMetni } from './hesabim-ui';

export function VerilerSekmesi({
  sahipMi,
  kapatmaOnizleme,
}: {
  sahipMi: boolean;
  /** `null` = ön izleme okunamadı; maddeler yalnız her durumda doğru olanlara düşer. */
  kapatmaOnizleme: KapatmaOnizlemesi | null;
}) {
  const router = useRouter();
  const [indiriliyor, setIndiriliyor] = useState(false);
  const [kapatmaAcik, setKapatmaAcik] = useState(false);
  const [kapatmaParola, setKapatmaParola] = useState('');
  const [kapatiliyor, setKapatiliyor] = useState(false);
  const [kapatmaHata, setKapatmaHata] = useState<string | null>(null);
  const maddeler = hesapKapatmaMaddeleri(kapatmaOnizleme);

  async function indir() {
    setIndiriliyor(true);
    const tamam = await verileriIndir();
    setIndiriliyor(false);
    if (!tamam) {
      toast({
        variant: 'destructive',
        title: 'Veriler indirilemedi',
        description: 'Bir sorun oluştu, lütfen tekrar deneyin.',
      });
    }
  }

  async function hesabimiKapat(e: React.FormEvent) {
    e.preventDefault();
    setKapatmaHata(null);
    setKapatiliyor(true);
    try {
      await api.post('/auth/hesabimi-kapat', { parola: kapatmaParola });
      // Oturum sunucuda zaten geçersizleşti (passwordChangedAt damgası);
      // yerelde de temizlenmezse kullanıcı 401 duvarına çarpar.
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      router.replace('/login');
    } catch (err) {
      setKapatmaHata(hataMetni(err, 'Hesap kapatılamadı.'));
    } finally {
      setKapatiliyor(false);
    }
  }

  return (
    <>
      <Kart
        id="verilerim"
        baslik="Verilerimi indir"
        aciklama={
          <span className="block max-w-[680px] leading-[1.6] text-gray-600">
            {/* ⚠ KAPSAM SUNUCUDAN ÖLÇÜLDÜ (`hesap.servisi.ts` `verileriDisaAktar`):
                22.09'dan beri kütüphane, listeler, işçilik firmaları ve antetler
                dosyada YOK (ürün içeriği, kişisel veri değil). Eski metin
                "kütüphaneniz dahildir" diyordu — dosyayı açan kişi kütüphanesini
                arar, bulamazdı. Üye yalnız kendi tekliflerini alır; ticari
                kayıtlar sahibin dosyasında. */}
            {sahipMi
              ? 'Hesabınızla ilişkili kişisel verilerin makine-okunur (JSON) kopyası: kişi ve firma bilgileriniz, teklifleriniz, abonelik ve fatura kayıtlarınız. Malzeme kütüphaneniz ve fiyat listeleriniz kişisel veri olmadığı için dosyaya girmez. Yüklediğiniz orijinal dosyalar ve logo gömülmez; adları ve indirme adresleri listelenir.'
              : 'Hesabınızla ilişkili kişisel verilerin makine-okunur (JSON) kopyası: kişi ve firma bilgileriniz ile hazırladığınız teklifler. Firmanın abonelik ve fatura kayıtları firma sahibinin dosyasındadır. Yüklediğiniz orijinal dosyalar gömülmez; adları ve indirme adresleri listelenir.'}
          </span>
        }
      >
        <button type="button" disabled={indiriliyor} onClick={indir} className={cn(IKINCIL_DUGME, 'mt-4')}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          {indiriliyor ? 'Hazırlanıyor…' : 'Verilerimi indir (JSON)'}
        </button>
      </Kart>

      <Kart id="hesabi-kapat" baslik="Hesabımı kapat" tehlike>
        <p className="mt-1.5 text-[13px] text-gray-600">Hesabınızı kapattığınızda:</p>
        <ul className="mt-2 max-w-[700px] list-disc space-y-0.5 pl-[18px] text-[13px] leading-[1.7] text-gray-600">
          {maddeler.map((m) => (
            <li key={m.metin} className={m.ton === 'uyari' ? 'font-medium text-red-700' : undefined}>
              {m.metin}
            </li>
          ))}
        </ul>

        {!kapatmaAcik ? (
          <button type="button" onClick={() => setKapatmaAcik(true)} className={cn(TEHLIKE_DUGME, 'mt-4')}>
            Hesabımı kapat
          </button>
        ) : (
          <form
            onSubmit={hesabimiKapat}
            className="mt-4 space-y-3 rounded-[10px] border border-red-200 bg-red-50/60 p-4"
          >
            <p className="text-[13px] text-gray-700">
              Hesabınız hemen kapatılır ve oturumunuz sonlandırılır. Onaylamak için parolanızı girin.
            </p>
            <input
              type="password"
              autoComplete="current-password"
              aria-label="Parolanız"
              value={kapatmaParola}
              onChange={(e) => setKapatmaParola(e.target.value)}
              placeholder="Parolanız"
              required
              className={cn(GIRDI, 'max-w-xs')}
            />
            {kapatmaHata && (
              <p role="alert" className="text-[13px] text-red-600">{kapatmaHata}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={kapatiliyor} className={TEHLIKE_DUGME}>
                {kapatiliyor ? 'Kapatılıyor…' : 'Hesabımı kapat'}
              </button>
              <button
                type="button"
                onClick={() => { setKapatmaAcik(false); setKapatmaHata(null); }}
                className={IKINCIL_DUGME}
              >
                Vazgeç
              </button>
            </div>
          </form>
        )}
      </Kart>
    </>
  );
}
