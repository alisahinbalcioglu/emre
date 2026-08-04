'use client';

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
      setPos({ top: rect.bottom + 3, left: rect.left, width: Math.max(rect.width, 180) });
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

  // Filter options
  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const isFirma = variant === 'firma';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: 28,
          padding: '0 8px',
          gap: 4,
          border: `1px solid ${open ? '#3b82f6' : hasValue ? (isFirma ? '#fde68a' : '#93c5fd') : '#e2e8f0'}`,
          borderRadius: 6,
          background: open ? '#f0f9ff' : hasValue ? (isFirma ? '#fffbeb' : '#eff6ff') : 'white',
          cursor: 'pointer',
          outline: 'none',
          fontSize: 12,
          fontFamily: 'inherit',
          color: hasValue ? (isFirma ? '#92400e' : '#1e293b') : '#94a3b8',
          fontWeight: hasValue ? 500 : 400,
          transition: 'all 0.15s',
          boxShadow: open ? '0 0 0 2px rgba(59,130,246,0.15)' : 'none',
        }}
        onMouseEnter={(e) => { if (!open) { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#f8fafc'; } }}
        onMouseLeave={(e) => { if (!open) { e.currentTarget.style.borderColor = hasValue ? (isFirma ? '#fde68a' : '#93c5fd') : '#e2e8f0'; e.currentTarget.style.background = hasValue ? (isFirma ? '#fffbeb' : '#eff6ff') : 'white'; } }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
          {selectedOption?.label ?? placeholder}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ flexShrink: 0, color: '#94a3b8', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 99999,
            padding: 4,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {/* Search */}
          {options.length > 3 && (
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isFirma ? 'Firma ara...' : 'Marka ara...'}
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #e2e8f0',
                borderRadius: 5,
                fontSize: 11,
                fontFamily: 'inherit',
                outline: 'none',
                marginBottom: 4,
                color: '#1e293b',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeMenu();
              }}
            />
          )}

          {/* Clear option */}
          {hasValue && (
            <div
              onClick={() => handleSelect('')}
              style={{
                display: 'flex', alignItems: 'center', padding: '6px 8px',
                borderRadius: 5, cursor: 'pointer', fontSize: 11, color: '#94a3b8',
                marginBottom: 2, transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#94a3b8'; }}
            >
              Secimi kaldir
            </div>
          )}

          {/* Options */}
          {filtered.length === 0 ? (
            <div style={{ padding: '12px 8px', textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
              Sonuc bulunamadi
            </div>
          ) : (
            filtered.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 8px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: isSelected ? 'white' : '#475569',
                    background: isSelected ? '#2563eb' : 'transparent',
                    fontWeight: isSelected ? 500 : 400,
                    transition: 'all 0.1s',
                    marginBottom: 1,
                  }}
                  onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#1e293b'; } }}
                  onMouseLeave={(e) => { if (!isSelected) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
                >
                  <span style={{ flex: 1 }}>{opt.label}</span>
                  {opt.price && (
                    <span style={{
                      fontSize: 10,
                      color: isSelected ? 'rgba(255,255,255,0.7)' : '#94a3b8',
                      fontVariantNumeric: 'tabular-nums',
                      marginLeft: 8,
                    }}>
                      {opt.price}
                    </span>
                  )}
                  {isSelected && <span style={{ marginLeft: 4, fontSize: 14 }}>✓</span>}
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
