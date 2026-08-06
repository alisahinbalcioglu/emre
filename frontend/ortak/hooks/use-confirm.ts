'use client';

// ── Şık, tıklanan-yerde onay (native window.confirm yerine) ──
// Toast ile aynı singleton desen: modul-seviye state + global renderer
// (ConfirmRoot, layout'ta). confirm() Promise<boolean> döner → drop-in:
//   if (!(await confirm('Silinsin mi?'))) return;
// Popover, SON pointer koordinatında açılır ("tıklama yaptığın yerde").
//
// S1 (06.08.2026): aynı kart DEĞER de sorabiliyor — `promptValue()` native
// `window.prompt` yerine geçer ve girilen metni döndürür. Kutu, tıklanan
// noktadaki kartın içinde açılır; ekranın tepesindeki "site says" kutusu
// tarayıcının çizdiği, konumu ve biçimi bize ait olmayan bir yüzeydi.

import * as React from 'react';

/** `ConfirmOptions.input` ile açılan değer kutusunun ayarları. */
export interface ConfirmInput {
  /** Kutu açılırken içinde yazan değer. Varsayılan boş. */
  baslangic?: string;
  /** Kutu boşken görünen ipucu metni. */
  yerTutucu?: string;
  /** HTML input `type`'ı (örn 'number'). Varsayılan 'text'. */
  tip?: string;
}

export interface ConfirmOptions {
  /** Ana soru metni (zorunlu içerik). */
  description: string;
  /** Opsiyonel başlık (kalın). */
  title?: string;
  /** Onay butonu metni. Varsayılan "Sil". */
  confirmText?: string;
  /** Vazgeç butonu metni. Varsayılan "Vazgeç". */
  cancelText?: string;
  // K3: `tone?: 'danger' | 'default'` KALDIRILDI. YEDİ çağrı yerinden
  // geçiriliyordu, ama tek renderer (`ortak/ui/confirm-dialog.tsx`)
  // `opts.tone`'u hiç okumuyordu — onay butonu her koşulda maviydi. Seçenek
  // bir davranış VAAT edip tutmuyordu.
  // ⚠ Çağrı yerlerinin sayısı grep'le 4 sanılmıştı; kaldırma sonrası
  // `tsc --noEmit` üçünü daha ortaya çıkardı (`DwgProjectWorkspace.tsx` ×2,
  // `ExcelGrid.tsx` ×1). Ölü kodun yayılımını grep değil derleyici ölçer.
  // Kırmızı butonu çizdirmek kullanıcıya görünen YENİ bir davranış eklemek
  // olurdu (bu turun kuralı: yeni özellik ekleme), o yüzden tüketilmedi,
  // kaldırıldı. İleride gerçekten istenirse renderer ile BİRLİKTE eklenir.
  // Kural `ortak/hooks/onay-secenekleri.test.ts` ile kilitlendi: burada ilan
  // edilen her seçeneği renderer okumak zorunda.
  /**
   * Verilirse kart bir DEĞER KUTUSU gösterir (onay kartı → giriş kartı).
   * Alt alanları ayrı arayüzde (`ConfirmInput`) — burada satır satır
   * yazılsaydı ölü-seçenek kapısının ayrıştırıcısı onları da üst düzey
   * seçenek sanardı. Kural yine geçerli: `ConfirmInput`'ta ilan edilen her
   * alan da renderer'da `input?.<ad>` olarak okunmak zorunda.
   */
  input?: ConfirmInput;
}

/**
 * Tek state, İKİ soru tipi taşır: onay (`boolean`) ve değer (`string | null`).
 * Hangi varyantın çözüleceği `opts.input`'un varlığına bağlı; TypeScript bu
 * bağı tek bir state şeklinde ifade edemez. Bu yüzden GİRİŞ NOKTALARI kendi
 * dar `resolve`'unu burada genişletir (aşağıdaki iki `as GenelCozucu`), ve
 * doğru varyantın gönderildiğini `settle`/`iptalDegeri` garanti eder —
 * ikisi de kararı yine `state.opts.input`'tan okur.
 */
type GenelCozucu = (v: boolean | string | null) => void;

interface ConfirmState {
  open: boolean;
  x: number;
  y: number;
  /** Her çağrıda artan sayaç — renderer kutuyu bununla sıfırlar. */
  id: number;
  opts: ConfirmOptions;
  // Değer kutusu varsa çözülen tip METİN (iptalde null); yoksa boolean.
  resolve?: GenelCozucu;
}

let state: ConfirmState = { open: false, x: 0, y: 0, id: 0, opts: { description: '' } };
const listeners = new Set<(s: ConfirmState) => void>();

// Son pointer konumu — confirm() bunu popover ankraji olarak kullanır.
let lastPointer = { x: 0, y: 0 };
if (typeof window !== 'undefined') {
  lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  window.addEventListener(
    'pointerdown',
    (e) => { lastPointer = { x: e.clientX, y: e.clientY }; },
    true, // capture: buton kendi handler'ından ÖNCE koordinatı yakala
  );
}

function emit() {
  listeners.forEach((l) => l(state));
}

/**
 * Şık onay sorusu göster; kullanıcı Onayla → true, Vazgeç/dışarı/Esc → false.
 * @example if (!(await confirm('Bu liste silinsin mi?'))) return;
 */
export function confirm(input: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof input === 'string' ? { description: input } : input;
  return new Promise<boolean>((resolve) => {
    // Önceki açık bir onay varsa iptal et (çakışma olmasın).
    state.resolve?.(iptalDegeri());
    state = { open: true, x: lastPointer.x, y: lastPointer.y, id: state.id + 1, opts, resolve: resolve as GenelCozucu };
    emit();
  });
}

/**
 * `window.prompt` yerine geçen değer sorusu: aynı kart, içinde bir kutu.
 * Onayla → girilen metin (boş olabilir) · Vazgeç/dışarı/Esc → `null`.
 * Çağıran, `window.prompt` sözleşmesini birebir korur:
 *   const ham = await promptValue({ description: 'İskonto %', input: {} });
 *   if (ham == null || ham.trim() === '') return;
 */
export function promptValue(input: ConfirmOptions | string): Promise<string | null> {
  const ham: ConfirmOptions = typeof input === 'string' ? { description: input } : input;
  // `input` alanı ZORUNLU olarak var edilir: kartın değer kutusu göstermesi
  // bu alanın varlığına bağlı, çağıranın onu yazmayı unutması sessizce
  // kutusuz (yani cevapsız) bir soru üretirdi.
  const opts: ConfirmOptions = { ...ham, input: ham.input ?? {} };
  return new Promise<string | null>((resolve) => {
    state.resolve?.(iptalDegeri());
    state = { open: true, x: lastPointer.x, y: lastPointer.y, id: state.id + 1, opts, resolve: resolve as GenelCozucu };
    emit();
  });
}

/** Vazgeçme değeri soru TİPİNE bağlıdır: değer sorusunda `null`, onayda `false`. */
function iptalDegeri(): boolean | string | null {
  return state.opts.input ? null : false;
}

function settle(result: boolean | string | null) {
  state.resolve?.(result);
  state = { ...state, open: false, resolve: undefined };
  emit();
}

/** ConfirmRoot bileşeni için — state aboneliği + kapatma. */
export function useConfirmController() {
  const [s, setS] = React.useState<ConfirmState>(state);
  React.useEffect(() => {
    listeners.add(setS);
    return () => { listeners.delete(setS); };
  }, []);
  // ⚠ `useCallback` ŞART: bu ikisi her render'da yeniden üretilseydi
  // renderer'ın klavye/odak efekti her tuş vuruşunda yeniden kurulur ve
  // kutunun metnini baştan seçerdi (imleç zıplaması). Bağımlılık listesi
  // boş olabiliyor çünkü `settle` güncel değeri modül state'inden okur.
  const onConfirm = React.useCallback((deger?: string) => {
    settle(state.opts.input ? (deger ?? '') : true);
  }, []);
  const onCancel = React.useCallback(() => { settle(iptalDegeri()); }, []);
  return { ...s, onConfirm, onCancel };
}
