'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — GIRIS DALI EKRANI (uc sayfanin ORTAK ikinci adimi)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  `login`, `register` ve `davet-kabul` yanitlari ayni uc bicimden birini
 *  doner (R1-O1). Ikinci adimi her sayfa kendi yazsaydi biri gunun birinde
 *  401 dalini ya da kurtarma kodu ekranini unuturdu — bu depoda olculmus
 *  hata sinifi ("ikizi unutma").
 *
 *  Sozlesme: `dal` bos degilse ekran GORUNUR; oturum hazir oldugunda
 *  `onOturum(data)` cagrilir ve TOKEN YAZIMINI sayfa yapar.
 */
import type { GirisDali } from '@/ortak/lib/oturum';
import { MfaKodAdimi } from './MfaKodAdimi';
import { ZorunluKurulumSihirbazi } from './ZorunluKurulumSihirbazi';

export function GirisDaliEkrani({
  dal,
  onOturum,
  onSuresiDoldu,
  onGeri,
}: {
  dal: GirisDali;
  onOturum: (data: unknown) => void;
  onSuresiDoldu: (mesaj: string) => void;
  onGeri: () => void;
}) {
  if (dal.tip === 'kod') {
    return (
      <MfaKodAdimi
        meydanOkuma={dal.meydanOkuma}
        onOturum={onOturum}
        onSuresiDoldu={onSuresiDoldu}
        onGeri={onGeri}
      />
    );
  }
  if (dal.tip === 'kurulum') {
    return (
      <ZorunluKurulumSihirbazi
        meydanOkuma={dal.meydanOkuma}
        neden={dal.neden}
        onOturum={onOturum}
        onSuresiDoldu={onSuresiDoldu}
      />
    );
  }
  return null;
}
