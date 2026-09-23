'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import api from '@/ortak/lib/api';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ortak/ui/dialog';
import { vitrinMi } from './erisim-durumu';
import type { Paket } from './paket-bicim';
import {
  VITRIN_BASLIGI,
  VITRIN_GEZINTI_METNI,
  vitrinDenemeSatiri,
  vitrinIslemMetni,
  type VitrinDenemeBilgisi,
  type VitrinIslemi,
} from './vitrin-metinleri';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VİTRİN SAĞLAYICISI — paketsiz yeni hesap (23.09.2026 — Emre kararı)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Kabukta TEK yer: (1) vitrin mi (sunucu kararından), (2) deneme satırı
 *  ("30 gün ücretsiz, ilk ödeme 30. günün sonunda") ve (3) "Paketinizi
 *  seçin" penceresi. İş başlatan düğmeler (`QuickStart`, "Kütüphaneme
 *  Aktar", "Üye davet et") işlem yerine `pencereAc` çağırır — dosya
 *  seçtirip, istek atıp SONRA 403 göstermek kullanıcıyı boşuna bekletirdi.
 *
 *  ⚠ BU BİR KAPI DEĞİL. Vitrin sunucuda HİÇBİR yetenek açmaz; düğme
 *    atlansa bile uç 403 döner. Burası yalnız NEDENİ kibarca söyler.
 *
 *  ⚠ YEDEK YOL: açıkça bağlanmamış bir iş düğmesi yine de istek atarsa
 *    `api.ts` 403 `ABONELIK_KISITLI`da `abonelik-kisitli` olayını yayınlar.
 *    O olay 22.09'dan beri yayınlanıyordu ama DİNLEYENİ YOKTU; vitrinde
 *    burası dinler ve pencereyi açar. Vitrin dışında DİNLEMEZ — ödemesi
 *    geciken müşterinin akışı değişmesin.
 *
 *  ⚠ DENEME SATIRI YALNIZ VİTRİNDE İSTENİR (bir kez): ödemiş müşteri her
 *    sayfa açılışında fazladan `/abonelik/paketler` isteği atmasın.
 */
interface VitrinDegeri {
  /** Paketsiz yeni hesap mı? (`erisim-durumu.ts` `vitrinMi`) */
  vitrin: boolean;
  /** `/abonelik/paketler`den kurulan deneme satırı; yoksa `null`. */
  deneme: VitrinDenemeBilgisi | null;
  /** "Paketinizi seçin" penceresini aç. Vitrin değilse hiçbir şey yapmaz. */
  pencereAc: (islem?: VitrinIslemi) => void;
}

const BOS: VitrinDegeri = { vitrin: false, deneme: null, pencereAc: () => {} };

const VitrinBaglami = createContext<VitrinDegeri>(BOS);

export function VitrinSaglayici({ children }: { children: ReactNode }) {
  const { erisim } = useCapabilities();
  const vitrin = vitrinMi(erisim);
  const [deneme, setDeneme] = useState<VitrinDenemeBilgisi | null>(null);
  /** `null` = pencere KAPALI; değer = pencereyi açan iş. */
  const [islem, setIslem] = useState<VitrinIslemi | null>(null);

  useEffect(() => {
    if (!vitrin) {
      setDeneme(null);
      setIslem(null);
      return;
    }
    let iptal = false;
    api
      .get<Paket[]>('/abonelik/paketler')
      .then(({ data }) => {
        if (!iptal) setDeneme(vitrinDenemeSatiri(data));
      })
      .catch((e) => {
        // Satır çizilmez; şerit sunucunun metniyle, pencere işlem cümlesiyle
        // kalır. Hata YUTULMAZ — iz bırakılır (teşhis maliyeti buradan doğar).
        console.warn('[vitrin] deneme satiri alinamadi:', e?.response?.status ?? e?.message);
      });
    return () => {
      iptal = true;
    };
  }, [vitrin]);

  useEffect(() => {
    if (!vitrin) return;
    const dinle = () => setIslem((mevcut) => mevcut ?? 'genel');
    window.addEventListener('abonelik-kisitli', dinle);
    return () => window.removeEventListener('abonelik-kisitli', dinle);
  }, [vitrin]);

  const pencereAc = useCallback(
    (i?: VitrinIslemi) => {
      if (vitrin) setIslem(i ?? 'genel');
    },
    [vitrin],
  );
  const kapat = useCallback(() => setIslem(null), []);
  const deger = useMemo(() => ({ vitrin, deneme, pencereAc }), [vitrin, deneme, pencereAc]);

  return (
    <VitrinBaglami.Provider value={deger}>
      {children}
      {vitrin && <VitrinPenceresi islem={islem} deneme={deneme} onKapat={kapat} />}
    </VitrinBaglami.Provider>
  );
}

/** Sağlayıcı yoksa vitrin DEĞİLDİR (güvenli yön: düğmeler eski işini yapar). */
export function useVitrin(): VitrinDegeri {
  return useContext(VitrinBaglami);
}

const TON_SINIFI: Record<VitrinDenemeBilgisi['ton'], string> = {
  olumlu: 'text-emerald-700',
  bilgi: 'text-slate-600',
  uyari: 'text-amber-700',
};

function VitrinPenceresi({
  islem,
  deneme,
  onKapat,
}: {
  islem: VitrinIslemi | null;
  deneme: VitrinDenemeBilgisi | null;
  onKapat: () => void;
}) {
  return (
    <Dialog open={islem !== null} onOpenChange={(acik) => { if (!acik) onKapat(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{VITRIN_BASLIGI}</DialogTitle>
          <DialogDescription>{vitrinIslemMetni(islem)}</DialogDescription>
        </DialogHeader>
        {deneme && (
          <p className={`text-sm font-medium ${TON_SINIFI[deneme.ton]}`} data-deneme-tonu={deneme.ton}>
            {deneme.metin}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{VITRIN_GEZINTI_METNI}</p>
        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            onClick={onKapat}
            className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            Vazgeç
          </button>
          <Link
            href="/abonelik"
            onClick={onKapat}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Paketleri gör
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
