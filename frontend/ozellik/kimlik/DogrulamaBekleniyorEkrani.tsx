'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KAYIT SONRASI DOĞRULAMA EKRANI (22.09.2026, Emre kararı — "seçenek A")
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  NEDEN VAR — GERÇEK BİR OLAYDAN DOĞDU. 22.09'da Emre yeni bir hesap açtı;
 *  doğrulama e-postası GİTTİ ve Brevo tarafından KABUL EDİLDİ (sunucu
 *  günlüğünde hata yok, jeton üretilmişti) ama Google Workspace kutusunda
 *  SPAM klasörüne düştü. Kullanıcı tarafından görünen tek şey şuydu: kayıt
 *  bitti, uygulamaya düşüldü, üstte "doğrulanmadı" şeridi var, ücretsiz
 *  deneme kilitli ve e-posta ortada yok.
 *
 *  Eski akış kullanıcıyı kayıttan sonra DOĞRUDAN uygulamaya bırakıyordu:
 *  ne gönderildiğini, NEREYE gönderildiğini ve bulunamazsa NE YAPILACAĞINI
 *  söyleyen bir an yoktu. Bu ekran o anı geri veriyor.
 *
 *  ── ÜÇ TASARIM KARARI, GEREKÇELERİYLE ──────────────────────────────────
 *
 *  1) ATLANABİLİR. "Doğrulamadan giriş yok" daha sıkı görünür ama 22.09
 *     olayı tam olarak neden yanlış olduğunu gösterdi: tek bir teslimat
 *     kazası müşteriyi kapıda bırakır ve satıcı bunu HİÇ öğrenmez.
 *     `EpostaDogrulamaSeridi`nin kendi başlığında aynı karar zaten yazılı:
 *     "Girişi bloke etmek yeni kaydı kırar… ürünü hiç göremeden terk eder."
 *     Doğrulama e-postasının METNİ de "doğrulamadan da kullanabilirsiniz"
 *     diyor — bloke etmek o cümleyi ve hukuki metinleri de yalanlardı.
 *
 *  2) SPAM UYARISI EN GÖRÜNÜR YERDE, dipnot değil. Bugünkü tek gerçek
 *     vakada sorun buydu. "Gelen kutunuza bakın" demek yetmiyor; kullanıcı
 *     zaten oraya bakıyor.
 *
 *  3) ADRES EKRANDA YAZILI. Yanlış yazılmış bir e-posta adresi, gelmeyen
 *     postanın en sık ikinci sebebidir ve kullanıcı onu ancak GÖRÜRSE
 *     fark eder.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { MailCheck, ShieldAlert } from 'lucide-react';
import api from '@/ortak/lib/api';

type Durum = 'hazir' | 'gonderiliyor' | 'gonderildi' | 'hata';

export function DogrulamaBekleniyorEkrani({
  eposta,
  onDevam,
}: {
  /** Kayıt sırasında girilen adres — EKRANDA gösterilir, yazım hatası görünsün. */
  eposta: string;
  /** "Şimdilik atla" — oturum zaten açık, uygulamaya geçilir. */
  onDevam: () => void;
}) {
  const [durum, setDurum] = useState<Durum>('hazir');
  const [mesaj, setMesaj] = useState('');

  async function yenidenGonder() {
    setDurum('gonderiliyor');
    try {
      // ⚠ Uç `EpostaDogrulamaSeridi` ile AYNI: ikinci bir gönderme yolu
      //   açmak, birinde düzeltilen bir kusurun ötekinde yaşamasına yol açar.
      const { data } = await api.post('/auth/resend-verification', {});
      setMesaj(data?.mesaj ?? 'Doğrulama bağlantısı yeniden gönderildi.');
      setDurum('gonderildi');
    } catch (err: any) {
      setMesaj(
        err?.response?.status === 429
          ? 'Çok sık denediniz. Bir dakika bekleyip tekrar deneyin.'
          : err?.response?.data?.message || 'Bağlantı gönderilemedi.',
      );
      setDurum('hata');
    }
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <MailCheck className="h-6 w-6" />
      </div>

      <h2 className="text-lg font-bold text-slate-900">Hesabınız açıldı</h2>

      <p className="mt-2 text-sm text-slate-600">
        Doğrulama bağlantısını şu adrese gönderdik:
      </p>
      <p className="mt-1 break-all text-sm font-semibold text-slate-900">{eposta}</p>

      {/* ⭐ 22.09 olayının doğrudan karşılığı — dipnot DEĞİL, kutu. */}
      <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs leading-relaxed text-amber-900">
          <span className="font-semibold">Gelen kutunuzda göremiyorsanız Spam / Gereksiz
          klasörüne bakın.</span>{' '}
          Kurumsal e-posta hesaplarında ilk mesaj sık sık oraya düşüyor. Bulduğunuzda
          &quot;Spam değil&quot; olarak işaretlerseniz sonraki bildirimler gelen kutunuza gelir.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={yenidenGonder}
          disabled={durum === 'gonderiliyor'}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          {durum === 'gonderiliyor' ? 'Gönderiliyor…' : 'Bağlantıyı yeniden gönder'}
        </button>

        {/* ⚠ ATLAMA YOLU KAPATILMAZ (karar 1). */}
        <button
          type="button"
          onClick={onDevam}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Şimdilik atla, uygulamaya geç
        </button>
      </div>

      {(durum === 'gonderildi' || durum === 'hata') && (
        <p
          role="status"
          className={`mt-3 text-xs font-medium ${
            durum === 'hata' ? 'text-red-600' : 'text-emerald-700'
          }`}
        >
          {mesaj}
        </p>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Doğrulamadan da uygulamayı kullanabilirsiniz. Doğrulama, önemli bildirimlerin
        size ulaşabildiğinden emin olmamızı sağlar; ücretsiz deneme için gereklidir.
      </p>
    </div>
  );
}
