'use client';

/**
 * MARKA / ISCILIK FIRMASI SECICI — soft SaaS gorunumu (14.08).
 *
 * ── E2E SOZLESMESI: BU UC SEY DEGISTIRILEMEZ ────────────────────────────────
 * Golden E2E yollari bu bilesenin DOM'una dogrudan bagli. Uceni de birden
 * fazla test okuyor; degistirilirse testler yesil kalir ama YANLIS MARKA
 * secilir ve golden kosumda yanlis fiyat yazilir (sessiz para hatasi):
 *   1. Tetikleyici `<button>` OLMALI — `helpers.ts:217` `[col-id="..."] button`
 *      ile tikliyor. `<div role="button">`e cevrilirse secim HIC acilmaz.
 *   2. Secenek satirinda ETIKET span'i ILK dogrudan cocuk olmali —
 *      `helpers.ts:243` `o.querySelector(':scope > span')` ilk span'i marka ADI
 *      sanar. ✓ isareti ya da fiyat one alinirsa test "✓"yu marka adi okur.
 *   3. "Secimi kaldir" metni CIPLAK TEXT NODE kalmali (span'a SARILMAZ) —
 *      span'a alinirsa ayni sorgu onu gecerli bir marka secenegi sanar.
 *
 * ── VARIANT AYRIMI NEDEN KORUNUYOR ──────────────────────────────────────────
 * PRD yalniz "marka secici"yi tarif ediyor ama bu bilesen IKIZ kullaniliyor:
 * malzeme markasi (brand) ve iscilik firmasi (firma). Ikisi ayni gri etikete
 * indirgenirse kullanici bir hucrenin hangi zincire ait oldugunu goremez —
 * malzeme ve iscilik bu projede ayri fiyat yollari. PRD'nin YUMUSAK dili
 * alindi, ayrimi tasiyan RENK korundu (mavi=malzeme, kehribar=iscilik).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownOption {
  value: string;
  label: string;
  price?: string;
}

interface CustomDropdownProps {
  value: string;
  options: DropdownOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  variant?: 'brand' | 'firma';
  className?: string;
}

export function CustomDropdown({
  value,
  options,
  placeholder = 'Sec...',
  onChange,
  variant = 'brand',
  className = '',
}: CustomDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const hasValue = !!value && !!selectedOption;

  const openMenu = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 200) });
    }
    setOpen(true);
    setSearch('');
    setTimeout(() => searchRef.current?.focus(), 30);
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    closeMenu();
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeMenu]);

  /**
   * ⚠ TURKCE KUCULTME LOCALE'LI: locale'siz `toLowerCase()` "İ" harfini
   * "i̇" (birlesik nokta) yapar ve "İZOLE" araması "izole" ile ESLESMEZ —
   * kullanici markasini goremez, listede yok saniyor. Ayni agacta dogrusu
   * zaten yapiliyor (ExcelGrid.tsx `toLocaleLowerCase('tr')`).
   */
  const kucult = (s: string) => s.toLocaleLowerCase('tr');
  const filtered = search
    ? options.filter((o) => kucult(o.label).includes(kucult(search)))
    : options;

  const isFirma = variant === 'firma';

  /** Pasif hucre: secili deger YUMUSAK ETIKET, bos deger transparan. */
  const tetikSinif = [
    // 19.08 v1 spec (select bloğu birebir): TEK TIP genislik (min 94 / max 140,
    // aralikta hucreyi doldurur), metin solda + ok sagda (justify-between),
    // radius 6 (rounded-md), yazi 12. Ciplerin alt alta AYNI genislikte
    // durmasi tasarimin ritmi — onceki "icerige saril" yorumu kaldirildi.
    // e2e `[col-id] button` tiklamasi ve fill-handle ::after ETKILENMEZ.
    'flex w-full min-w-[94px] max-w-[140px] mx-auto items-center justify-between gap-1 rounded-md px-2 text-[12px] transition-all',
    'border outline-none',
    // 18.08 ikinci tur ("cerceve icinde degil, daha baskin yazilar"):
    // degerler teslim edilen tasarimdan BIREBIR (mpx-teklif-tablosu.css):
    //   dolu marka  → cerceve #2563eb (blue-600 TAM renk) · zemin blue-50 · yazi blue-700 · 700
    //   dolu firma  → cerceve #16a34a (green-600)         · zemin green-50 · yazi green-700 · 700
    //   bos         → GORUNUR gri cerceve + BEYAZ zemin (onceki seffaf/silik hal
    //                 kullanici tarafindan reddedildi) · yazi slate-400 · 600
    // Hucre ARKA PLANI hala isaret.ts'in kanali — cip yalnizca kendi kutusunu boyar.
    open
      ? 'border-blue-600 bg-white ring-2 ring-blue-600/20'
      : hasValue
        ? (isFirma
            ? 'border-green-600 bg-green-50 text-green-700 font-bold hover:bg-green-100/60'
            : 'border-blue-600 bg-blue-50 text-blue-700 font-bold hover:bg-blue-100/60')
        : 'border-slate-200 bg-white text-slate-500 font-[650] hover:border-slate-300',
    className,
  ].join(' ');

  return (
    <>
      {/* ⚠ <button> ZORUNLU — E2E `[col-id] button` ile tikliyor (bkz. baslik) */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        className={tetikSinif}
        style={{ height: 29 }} /* v1 spec: 4px dikey dolgu + 12px/1.55 satir + cerceve */
      >
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
          {/* VS (25.08): deger DOLU ama listede YOKSA (bayat/erisim-disi id —
              orn. kisisellestirilen marka) placeholder'a gizlenmez: kullanici
              'hic secilmemis' sanip kaydediyordu. Acik soylenir. */}
          {selectedOption?.label ?? (value ? 'Erişilemeyen seçim' : placeholder)}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 99999,
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {/* Arama — buyutec ikonlu, kenarliksiz soft zemin */}
          {options.length > 3 && (
            <div className="relative mb-1.5">
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isFirma ? 'Firma ara...' : 'Marka ara...'}
                className="w-full rounded-lg border border-transparent bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeMenu();
                }}
              />
            </div>
          )}

          {/* Secimi kaldir — ⚠ metin CIPLAK TEXT NODE kalmali (bkz. baslik) */}
          {hasValue && (
            <div
              onClick={() => handleSelect('')}
              className="mb-1 flex cursor-pointer items-center rounded-lg px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              Secimi kaldir
            </div>
          )}

          {/* Secenekler */}
          {filtered.length === 0 ? (
            <div className="px-2.5 py-3 text-center text-xs text-slate-400">
              Sonuc bulunamadi
            </div>
          ) : (
            filtered.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className={[
                    'flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                    isSelected
                      ? (isFirma
                          ? 'bg-amber-50 font-medium text-amber-700'
                          : 'bg-blue-50 font-medium text-blue-700')
                      : 'text-slate-700 hover:bg-slate-100',
                  ].join(' ')}
                >
                  {/* ⚠ ETIKET ILK SPAN — E2E marka adini buradan okur */}
                  <span className="flex-1">{opt.label}</span>
                  {opt.price && (
                    <span
                      className={`ml-2 text-[10px] ${isSelected ? (isFirma ? 'text-amber-600/80' : 'text-blue-600/80') : 'text-slate-400'}`}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {opt.price}
                    </span>
                  )}
                  {/* ⚠ ✓ EN SON — one alinirsa E2E onu marka adi sanar */}
                  {isSelected && (
                    <span className={`ml-1.5 ${isFirma ? 'text-amber-600' : 'text-blue-600'}`}>✓</span>
                  )}
                </div>
              );
            })
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
