/**
 * DWG REVIZYON KAPISI — "onayi bozabilmeli, segmentler geri gelmeli".
 *
 * Kullanicinin 07.08 bildirimi iki sikayetti; ikisinin de kokU ayni yerdeydi
 * (bkz. `onay-revizyon.ts` bas yorumu). Bu dosya, duzeltilen dort karari
 * KILITLER.
 *
 * ★ TEST GERCEKTEN AYIRT EDIYOR MU? — her blokta ESKI davranisin replikasi
 * (`eski*`) ayni kriterle olculur ve KRITERI IHLAL ETTIGI assert edilir.
 * Yani bu dosya "yesil yaniyor" demiyor; "yeni davranis gecti, ESKI davranis
 * bu testten GECEMEZDI" diyor. Replika, teshis turunda dosyadan birebir
 * okunan kod satirlarinin sadelestirilmis halidir; kaynak satirlar her
 * blogun basinda yazili.
 *
 * ⚠ BIR ASSERT TEK KRITERE (proje kurali): paylasilan assert, kriterlerden
 * birinin hic kanitlanmadigini gizler — her kriter kendi it() blogunda.
 */
import { describe, it, expect } from 'vitest';
import {
  kartAksiyonu,
  sidebarAksiyonlari,
  secimSonrasi,
  capRenkliGorunur,
} from './onay-revizyon';

// ── ESKI DAVRANIS REPLIKALARI (fix oncesi kod) ───────────────────────────────

/** MetrajSummaryPanel.tsx:119-137 → `disabled={cl.approved}`.
 *  Devre disi dugme tiklama olayi uretmez: aksiyon YOK. */
function eskiKartAksiyonu(onayli: boolean): 'onayla' | 'yok' {
  return onayli ? 'yok' : 'onayla';
}

/** LayerInfoSidebar.tsx:112 (`!calculatedLayer && !calculating`) ve
 *  :123 (`calculatedLayer && !calculatedLayer.approved && !calculating`). */
function eskiSidebarAksiyonlari(durum: {
  hesaplandi: boolean;
  onayli: boolean;
  hesaplaniyor: boolean;
}): string[] {
  const out: string[] = [];
  if (!durum.hesaplandi && !durum.hesaplaniyor) out.push('segmentlere-ayir');
  if (durum.hesaplandi && !durum.onayli && !durum.hesaplaniyor) out.push('hesaplamayi-tamamla');
  return out;
}

/** useWorkspaceState.ts:99-109 → `selectLayer` TEK fonksiyondu ve daima toggle
 *  yapiyordu; revizyon yolu (DwgProjectWorkspace.tsx:951) da onu cagiriyordu. */
function eskiSecimSonrasi(mevcut: string | null, hedef: string): string | null {
  return mevcut === hedef ? null : hedef;
}

// ── A) KART DUGMESI: onaylI iken onayI KALDIRIR ──────────────────────────────

describe('kartAksiyonu — metraj kartindaki tek dugme', () => {
  it('onaysiz layer icin dugme ONAYLAR', () => {
    expect(kartAksiyonu(false)).toBe('onayla');
  });

  it('onayli layer icin dugme ONAYI KALDIRIR (kullanicinin bastigi yer)', () => {
    expect(kartAksiyonu(true)).toBe('onayi-kaldir');
  });

  it('ESKI DAVRANIS bu kriteri IHLAL EDERDI — onayli iken hicbir aksiyon yoktu', () => {
    // Kanit: bu satir gecerse test ayirt edicidir. Eski kod `disabled` idi.
    expect(eskiKartAksiyonu(true)).toBe('yok');
    expect(eskiKartAksiyonu(true)).not.toBe(kartAksiyonu(true));
  });
});

// ── B) SAG PANEL: onaylI layer aksiyonsuz KALMAZ ─────────────────────────────

describe('sidebarAksiyonlari — sag panelde her durumun bir cikisi var', () => {
  it('hesaplanmamis layer: segmentlere ayir', () => {
    expect(sidebarAksiyonlari({ hesaplandi: false, onayli: false, hesaplaniyor: false }))
      .toEqual(['segmentlere-ayir']);
  });

  it('hesaplandi ama onaysiz: hesaplamayi tamamla', () => {
    expect(sidebarAksiyonlari({ hesaplandi: true, onayli: false, hesaplaniyor: false }))
      .toEqual(['hesaplamayi-tamamla']);
  });

  it('ONAYLI layer: onayi kaldir & revize et', () => {
    expect(sidebarAksiyonlari({ hesaplandi: true, onayli: true, hesaplaniyor: false }))
      .toEqual(['onayi-kaldir-revize']);
  });

  it('hesaplama surerken aksiyon gosterilmez (spinner dali)', () => {
    expect(sidebarAksiyonlari({ hesaplandi: false, onayli: false, hesaplaniyor: true })).toEqual([]);
    expect(sidebarAksiyonlari({ hesaplandi: true, onayli: false, hesaplaniyor: true })).toEqual([]);
  });

  it('SOZLESME: hesaplama yokken panel ASLA bos kalmaz (uc durumun ucu de)', () => {
    const durumlar = [
      { hesaplandi: false, onayli: false },
      { hesaplandi: true, onayli: false },
      { hesaplandi: true, onayli: true },
    ];
    // ⚠ BOS DIZIDE .every() YALANCI YESIL verir — payda acikca kilitlenir.
    expect(durumlar.length).toBe(3);
    for (const d of durumlar) {
      expect(sidebarAksiyonlari({ ...d, hesaplaniyor: false }).length).toBeGreaterThan(0);
    }
  });

  it('ESKI DAVRANIS bu kriteri IHLAL EDERDI — onayli layer panelde aksiyonsuz kalirdi', () => {
    expect(eskiSidebarAksiyonlari({ hesaplandi: true, onayli: true, hesaplaniyor: false }))
      .toEqual([]);
  });
});

// ── C) SECIM: revizyonda secim KAPANMAZ ──────────────────────────────────────

describe('secimSonrasi — toggle ile odaklama ayri niyetlerdir', () => {
  it('toggle: ayni layer\'a tekrar tiklamak secimi kapatir (mevcut davranis korunur)', () => {
    expect(secimSonrasi('A', 'A', 'toggle')).toBeNull();
  });

  it('toggle: baska layer\'a tiklamak secimi tasir', () => {
    expect(secimSonrasi('A', 'B', 'toggle')).toBe('B');
  });

  it('odakla: layer ZATEN seciliyken bile secim ACIK kalir (revizyon yolu)', () => {
    // ★ Kullanicinin yasadigi hata tam buydu: onay kalkiyor, panel bosaliyordu.
    expect(secimSonrasi('A', 'A', 'odakla')).toBe('A');
  });

  it('odakla: baska layer\'dan gelindiginde de hedefe gider', () => {
    expect(secimSonrasi('B', 'A', 'odakla')).toBe('A');
  });

  it('odakla: hic secim yokken de hedefe gider', () => {
    expect(secimSonrasi(null, 'A', 'odakla')).toBe('A');
  });

  it('ESKI DAVRANIS bu kriteri IHLAL EDERDI — revizyonda secim NULL\'a duserdi', () => {
    expect(eskiSecimSonrasi('A', 'A')).toBeNull();
    expect(eskiSecimSonrasi('A', 'A')).not.toBe(secimSonrasi('A', 'A', 'odakla'));
  });
});

// ── D) GORSEL: onay kalkinca segmentler GERI GELIR ───────────────────────────

describe('capRenkliGorunur — "parcalanmis segmentler geri gelmeli"', () => {
  it('hesaplanmis + onaysiz: cap renkli segmentler cizilir', () => {
    expect(capRenkliGorunur({ hesaplandi: true, onayli: false })).toBe(true);
  });

  it('onayli: ham AutoCAD rengine doner (bilincli kural)', () => {
    expect(capRenkliGorunur({ hesaplandi: true, onayli: true })).toBe(false);
  });

  it('hic hesaplanmamis layer capsizdir', () => {
    expect(capRenkliGorunur({ hesaplandi: false, onayli: false })).toBe(false);
  });

  it('ONAY KALKINCA gorunur hale gelir — revizyonun gorsel sozu', () => {
    const onayli = { hesaplandi: true, onayli: true };
    const onaySonrasiKalkti = { ...onayli, onayli: false };
    expect(capRenkliGorunur(onayli)).toBe(false);
    expect(capRenkliGorunur(onaySonrasiKalkti)).toBe(true);
  });
});
