'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  E-POSTA DOĞRULAMA ŞERİDİ (Faz 3.4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Doğrulanmamış hesap GİRİŞ YAPABİLİR — yalnızca bu şeridi görür. Girişi
 *  bloke etmek yeni kaydı kırar: kullanıcı kaydolur, mail gecikir ya da spam'e
 *  düşer ve ürünü hiç göremeden terk eder.
 *
 *  ── NEDEN KABUKTA, SAYFALARDA DEĞİL ─────────────────────────────────────
 *  `AbonelikSeridi` ile aynı gerekçe: uyarı, kullanıcı HANGİ sayfada olursa
 *  olsun görünmeli. Sayfa sayfa eklemek, eklenmeyi unutulan sayfada
 *  kullanıcıyı habersiz bırakır.
 *
 *  ⚠ `emailVerified === null` iken HİÇBİR ŞEY ÇİZİLMEZ. null "henüz
 *  yüklenmedi" demektir; `!emailVerified` yazsaydık şerit her sayfa açılışında
 *  bir an yanıp sönerdi (ve /auth/me başarısız olan her durumda yalan
 *  söylerdi).
 */

import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import api from '@/ortak/lib/api';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';

export function EpostaDogrulamaSeridi() {
  const { emailVerified, refresh } = useCapabilities();
  const [durum, setDurum] = useState<'hazir' | 'gonderiliyor' | 'gonderildi' | 'hata'>('hazir');
  const [mesaj, setMesaj] = useState('');

  if (emailVerified !== false) return null;

  async function yenidenGonder() {
    setDurum('gonderiliyor');
    try {
      const { data } = await api.post('/auth/resend-verification', {});
      setMesaj(data?.mesaj ?? 'Doğrulama bağlantısı gönderildi.');
      setDurum('gonderildi');
      // Sunucu "zaten doğrulanmış" dediyse şeridin kaybolması için tazele.
      if (data?.emailVerified) await refresh();
    } catch (err: any) {
      setMesaj(
        err?.response?.status === 429
          ? 'Çok fazla istek gönderdiniz, biraz sonra tekrar deneyin.'
          : err?.response?.data?.message || 'Bağlantı gönderilemedi.',
      );
      setDurum('hata');
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-8 py-2.5 text-sm text-amber-900"
    >
      <div className="flex min-w-0 items-center gap-2">
        <MailWarning className="h-4 w-4 shrink-0" />
        <span className="font-semibold">E-posta adresiniz doğrulanmadı.</span>
        <span className="opacity-90">
          Önemli bildirimlerin size ulaşabilmesi için doğrulayın.
        </span>
      </div>

      {durum === 'gonderildi' || durum === 'hata' ? (
        <span className={durum === 'hata' ? 'text-xs font-medium text-red-700' : 'text-xs font-medium'}>
          {mesaj}
        </span>
      ) : (
        <button
          type="button"
          onClick={yenidenGonder}
          disabled={durum === 'gonderiliyor'}
          className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-60"
        >
          {durum === 'gonderiliyor' ? 'Gönderiliyor…' : 'Doğrulama bağlantısını yeniden gönder'}
        </button>
      )}
    </div>
  );
}
