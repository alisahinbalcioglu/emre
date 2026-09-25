/**
 * DWG REVIZYON KAPISI — "onayi bozabilmeli, segmentler geri gelmeli".
 *
 * Kullanicinin 07.08 bildirimi iki sikayetti; ikisinin de koku ayni yerdeydi
 * (bkz. `onay-revizyon.ts` bas yorumu). Kart dugmesi, sag panel aksiyonlari ve
 * secim toggle'i 25.09 tasariminda kaldirilan bilesenlerle gitti; o sozlesmeler
 * `adim-durumu.test.ts` ve `calisma-kaydi.test.ts`e tasindi. Burada kalan iki
 * karar: cap renkli gorunurluk ve fiyatlandirma sirasi.
 *
 * ★ TEST GERCEKTEN AYIRT EDIYOR MU? — her blokta ESKI davranisin replikasi
 * (`eski*`) ayni kriterle olculur ve KRITERI IHLAL ETTIGI assert edilir.
 *
 * ⚠ BIR ASSERT TEK KRITERE (proje kurali): paylasilan assert, kriterlerden
 * birinin hic kanitlanmadigini gizler — her kriter kendi it() blogunda.
 */
import { describe, it, expect } from 'vitest';
import { capRenkliGorunur, onaySirasi } from './onay-revizyon';
import type { CalculatedLayer } from './types';

// ── D) GORSEL: onay kalkinca segmentler GERI GELIR ───────────────────────────

/** 25.09 oncesi kural: onayli layer SECILI olsa bile ham renge donerdi —
 *  tasarimdaki "Onaylandi · fiyatlandirmaya hazir" ekrani (onayli layer
 *  cap renkleriyle, duzenlenebilir) bu kuralla cizilemezdi. */
function eskiCapRenkliGorunur(durum: { hesaplandi: boolean; onayli: boolean }): boolean {
  return durum.hesaplandi && !durum.onayli;
}

describe('capRenkliGorunur — "parcalanmis segmentler geri gelmeli"', () => {
  it('hesaplanmis + onaysiz: cap renkli segmentler cizilir', () => {
    expect(capRenkliGorunur({ hesaplandi: true, onayli: false })).toBe(true);
  });

  it('onayli ve SECILI DEGIL: ham AutoCAD rengine doner (bilincli kural)', () => {
    expect(capRenkliGorunur({ hesaplandi: true, onayli: true, secili: false })).toBe(false);
  });

  it('onayli ama SECILI: cap renkleriyle kalir (onaylandi ekrani, duzenlenebilir)', () => {
    expect(capRenkliGorunur({ hesaplandi: true, onayli: true, secili: true })).toBe(true);
  });

  it('hic hesaplanmamis layer secili olsa da capsizdir', () => {
    expect(capRenkliGorunur({ hesaplandi: false, onayli: false, secili: true })).toBe(false);
  });

  it('ONAY KALKINCA gorunur hale gelir — revizyonun gorsel sozu', () => {
    const onayli = { hesaplandi: true, onayli: true };
    const onaySonrasiKalkti = { ...onayli, onayli: false };
    expect(capRenkliGorunur(onayli)).toBe(false);
    expect(capRenkliGorunur(onaySonrasiKalkti)).toBe(true);
  });

  it('ESKI KURAL onayli+secili layer\'i ham renge dondururdu', () => {
    expect(eskiCapRenkliGorunur({ hesaplandi: true, onayli: true })).toBe(false);
    expect(capRenkliGorunur({ hesaplandi: true, onayli: true, secili: true })).not.toBe(
      eskiCapRenkliGorunur({ hesaplandi: true, onayli: true }),
    );
  });
});

// ── E) FIYATLANDIRMA SIRASI: approvedAt'in tuketicisi (11.08) ────────────────
//
// `approvedAt` alaninin tek tuketicisi buildExcelSheets'in sheet siralamasiydi;
// 11.08'de otomatik Excel indirmesiyle birlikte kaldirildi ve alan yalniz-yazilir
// kaldi. Fiyatlandirma yolu Object.values ekleme sirasina (= HESAPLAMA sirasina)
// dusmustu. `onaySirasi` eski kullanici-gorunur sirayi yeni yolda geri getirir.

/** DwgProjectWorkspace.tsx:644 (fix oncesi) — `approvedLayers` ekleme sirasi
 *  oldugu gibi kullaniliyordu; approvedAt HIC okunmuyordu. */
function eskiSira(layers: CalculatedLayer[]): CalculatedLayer[] {
  return layers;
}

function katman(layer: string, computedAt: number, approvedAt?: number): CalculatedLayer {
  return {
    layer, hatIsmi: layer, materialType: '', defaultDiameter: '',
    edgeSegments: [], junctionPoints: [], totalLength: 0,
    computedAt, approved: true, approvedAt,
  };
}

describe('onaySirasi — fiyatlandirmaya giden layer sirasi = ONAY sirasi', () => {
  it('onay sirasi hesaplama sirasindan farkliysa approvedAt kazanir', () => {
    const a = katman('A', 100, 300); // once hesaplandi, SONRA onaylandi
    const b = katman('B', 200, 250); // sonra hesaplandi, ONCE onaylandi
    expect(onaySirasi([a, b]).map((l) => l.layer)).toEqual(['B', 'A']);
  });

  it('approvedAt olmayan eski kayit computedAt ile siraya girer (legacy fallback)', () => {
    const eskiKayit = katman('ESKI', 150, undefined); // alan eklenmeden onceki localStorage
    const yeni = katman('YENI', 100, 400);
    expect(onaySirasi([yeni, eskiKayit]).map((l) => l.layer)).toEqual(['ESKI', 'YENI']);
  });

  it('girdi dizisi MUTATE edilmez (immutability kurali)', () => {
    const a = katman('A', 100, 300);
    const b = katman('B', 200, 250);
    const girdi = [a, b];
    onaySirasi(girdi);
    expect(girdi.map((l) => l.layer)).toEqual(['A', 'B']);
  });

  it('ESKI DAVRANIS bu kriteri IHLAL EDERDI — hesaplama sirasi onay sirasini ezerdi', () => {
    const a = katman('A', 100, 300);
    const b = katman('B', 200, 250);
    expect(eskiSira([a, b]).map((l) => l.layer)).toEqual(['A', 'B']); // onay sirasi DEGIL
    expect(eskiSira([a, b]).map((l) => l.layer)).not.toEqual(onaySirasi([a, b]).map((l) => l.layer));
  });
});
