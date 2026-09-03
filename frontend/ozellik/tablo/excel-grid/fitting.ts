/**
 * FITTING SATIRI — KAPSAM YARDIMCILARI (02.09.2026, kullanici istegi)
 *
 * Para kurali `ozellik/fiyat/pricing.ts`te (`fittingHesapla`); burasi grid'in
 * kapsam SECIM tarafi: Ctrl+tik ile ekle/cikar, silinen satiri kapsamlardan
 * dusur, rozet metni, oran hucresindeki "%" isaretini temizle.
 *
 * Kapsam `_rowIdx` listesidir — grid satir kimligi (getRowId) budur; sira
 * ekle/tasi ile degisse de kimlik degismez. Kapsama alinabilirlik kurali
 * `fittingKapsaminaAlinabilirMi` (pricing) — secilebilen her satir hesaba
 * girer, hesaba giren her satir secilebilir (tek kural).
 */
// NOT: goreli yol ZORUNLU — vitest.config.ts'te '@/' alias'i tanimli degil.
import { fittingHesapla, fittingKapsaminaAlinabilirMi, yukariYuvarla } from '../../fiyat/pricing';

export { fittingKapsaminaAlinabilirMi };

/** Fitting satirinin birim hucresi — kullanici bunu yazinca rozet belirir. */
export const FITTING_BIRIMI = '%';

export function fittingBirimiMi(v: unknown): boolean {
  return String(v ?? '').trim() === FITTING_BIRIMI;
}

/** Bag kurulmus satir mi? (birimi % olan ama bag kurulmamis satir DEGIL) */
export function fittingSatiriMi(r: Record<string, any> | null | undefined): boolean {
  return !!r?._fitting && Array.isArray(r._fitting.kapsam);
}

/** Ctrl+tik: kapsamda varsa cikar, yoksa ekle. Yeni dizi doner (mutasyon yok). */
export function kapsamDegistir(kapsam: readonly number[], rowIdx: number): number[] {
  return kapsam.includes(rowIdx)
    ? kapsam.filter((i) => i !== rowIdx)
    : [...kapsam, rowIdx];
}

/**
 * Satir silinince: onu kapsaminda tutan fitting satirlarinin YENI kapsamlari.
 * Yalniz etkilenenler doner; grid bunlari satira yazip toplami yeniler.
 */
export function silinenSatiriKapsamlardanDus(
  satirlar: readonly Record<string, any>[],
  silinenRowIdx: number,
): Array<{ rowIdx: number; kapsam: number[] }> {
  const sonuc: Array<{ rowIdx: number; kapsam: number[] }> = [];
  for (const r of satirlar) {
    if (!fittingSatiriMi(r)) continue;
    const kapsam: number[] = r._fitting.kapsam;
    if (!kapsam.includes(silinenRowIdx)) continue;
    sonuc.push({ rowIdx: r._rowIdx, kapsam: kapsam.filter((i) => i !== silinenRowIdx) });
  }
  return sonuc;
}

/**
 * Oran hucresine "35%" / "%35" / "% 35" yazilirsa sayiya indirger — miktar
 * kurali (`etkinMiktar`) YALNIZ saf sayi okur; "%" kalsaydi oran 0 olur,
 * kayit ve cikti da 0 gorurdu. Isaret yoksa `null` (dokunma).
 */
export function oranMetniniNormalize(v: unknown): string | null {
  const s = String(v ?? '');
  if (!s.includes('%')) return null;
  return s.replace(/%/g, '').replace(/\s+/g, '');
}

export function fittingRozetMetni(kapsamSayisi: number): string {
  return kapsamSayisi > 0 ? `Σ ${kapsamSayisi} satır` : 'Σ satır seç';
}

// ── HUCRE KILIDI + YAPISTIRMA KOPRUSU (inceleme H3) ─────────────────────────
// AG Grid `editable` sarmalayicisi: fitting satirinda hucre ACILMAZ, diger
// satirlarda alttaki kural gecerli. `fittingTemel` isareti yapistirma
// planlayicisina "altta DUZ editable vardi" der — planlayici fonksiyon
// editable'i hedef disi sayar; isaret olmasaydi 28.08 kutuphane→teklif
// yapistirma yolu SESSIZCE kapanirdi (inceleme basinda kapanmisti).

export type KilitliEditable = ((p: any) => boolean) & { fittingTemel: boolean };

export function kilitliEditable(onceki: unknown): KilitliEditable {
  const kilit = ((p: any) => !p?.data?._fitting
    && (typeof onceki === 'function' ? !!(onceki as any)(p) : onceki === true)) as KilitliEditable;
  kilit.fittingTemel = onceki === true;
  return kilit;
}

/** Yapistirma planlayicisi icin kolon hedef mi? Duz `true` ya da kilit altinda duz `true`. */
export function yapistirmaHedefiMi(editable: unknown): boolean {
  if (editable === true) return true;
  return typeof editable === 'function' && (editable as any).fittingTemel === true;
}

// ── GECIS CIKTISI (inceleme M7): para YAZAN kisim saf ve testli ─────────────
export interface FittingHucre { rowIdx: number; alan: string; deger: string }

/**
 * Fitting satirlarinin yazilacak hucreleri: dort para alani, `null` → ''.
 * Yazim karari ("degisti mi") cagirana ait — grid yalniz farkli olani yazar.
 */
export function fittingHucreleri(
  satirlar: readonly Record<string, any>[],
  roller: Record<string, string | undefined>,
): FittingHucre[] {
  const out: FittingHucre[] = [];
  for (const r of satirlar) {
    if (!fittingSatiriMi(r)) continue;
    const f = fittingHesapla(r, satirlar as Record<string, any>[], roller);
    if (!f) continue;
    const ekle = (alan: string | undefined, v: number | null) => {
      if (alan) out.push({ rowIdx: r._rowIdx, alan, deger: v === null ? '' : v.toFixed(1) });
    };
    // ⚠ BIRIM FIYAT HUCRELERI BOS BIRAKILIR (04.09 kullanici karari):
    // "malzeme birim fiyati icin hesap yapmasin, sadece malzeme toplam fiyat
    // uzerinden hesap yapacak." Fitting bir KALEM degil, kapsamin oranidir —
    // birim fiyati (kapsamin %1'i) anlamli bir birim fiyat DEGILDI ve
    // musteriye giden ciktida yanlis okunuyordu. Hucreler acik acik
    // BOSALTILIR (null): eski bir deger kalirsa satir "birim × miktar ≠ toplam"
    // gorunurdu ve gecis idempotent oldugu icin kendiliginden temizlenmezdi.
    ekle(roller.materialUnitPriceField, null);
    ekle(roller.materialTotalField, f.mat?.toplam ?? null);
    ekle(roller.laborUnitPriceField, null);
    ekle(roller.laborTotalField, f.lab?.toplam ?? null);
    // GENEL TOPLAM/BIRIM de kapsamdan (recalcGrand ile AYNI kural: mat+lab,
    // yukari-1-hane). ⚠ Yalniz recalcGrand'in yan etkisine birakilirsa reload
    // sonrasi BAYAT kalir: dort para alani taslaktan ayni geldiginde
    // `setDataValue` atlanir → cellValueChanged → recalcGrand HIC kosmaz →
    // fitting satirinin Genel Toplam hucresi eski/yanlis degerinde donar
    // (tarayici turunda olculdu: 491.759,7 kaldi, dogrusu 641.088,2).
    const varMi = !!(f.mat || f.lab);
    ekle(roller.grandUnitPriceField, null); // birim fiyat yok (yukaridaki gerekce)
    ekle(roller.grandTotalField, varMi ? yukariYuvarla((f.mat?.toplam ?? 0) + (f.lab?.toplam ?? 0)) : null);
  }
  return out;
}

// ── ESKI DEGERLERIN SAKLANMASI (inceleme C1) ────────────────────────────────
// Fiyatli bir satir fitting'e donusturulunce para hucreleri kapsamdan
// yeniden yazilir. Eski degerler `_fittingOnceki`de durur; "Bagi kaldir"
// geri yazar — sessiz para silme yok.
export const FITTING_ONCEKI_SISTEM_ALANLARI = ['_matNetPrice', '_labNetPrice', '_malzKar', '_iscKar'] as const;

export function fittingParaAlanlari(roller: Record<string, string | undefined>): string[] {
  return [roller.materialUnitPriceField, roller.materialTotalField,
    roller.laborUnitPriceField, roller.laborTotalField].filter(Boolean) as string[];
}

export function fittingOncekiAl(
  r: Record<string, any>,
  roller: Record<string, string | undefined>,
): Record<string, any> {
  const onceki: Record<string, any> = {};
  for (const a of fittingParaAlanlari(roller)) onceki[a] = r[a] ?? '';
  for (const a of FITTING_ONCEKI_SISTEM_ALANLARI) if (r[a] !== undefined) onceki[a] = r[a];
  return onceki;
}

/** Saklanan degerlerde DOLU para hucresi var mi? (kullaniciya soylenir) */
export function fittingOncekiFiyatVarMi(
  onceki: Record<string, any> | null | undefined,
  roller: Record<string, string | undefined>,
): boolean {
  if (!onceki) return false;
  return fittingParaAlanlari(roller).some((a) => String(onceki[a] ?? '').trim() !== '');
}
