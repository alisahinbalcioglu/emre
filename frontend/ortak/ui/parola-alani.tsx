'use client';

/**
 * PAROLA ALANI — göz düğmesiyle gizle/göster (17.08).
 *
 * Giriş ve Kayıt ekranı AYNI alanı kullanır; ikisi ayrı ayrı yazılırsa biri
 * güncellenip diğeri geride kalır (bu repoda "ikiz" hatası defalarca yaşandı).
 *
 * ⚠ Düğmede `type="button"` ŞART: HTML'de form içindeki düğmenin varsayılan
 * tipi `submit`'tir — eksik bırakılırsa göze her basışta form gönderilir,
 * yani parolayı görmek isteyen kullanıcı yarım parolayla giriş denemesi yapar.
 */

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = {
  id: string;
  value: string;
  onChange: (deger: string) => void;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
  minLength?: number;
};

export function ParolaAlani({
  id,
  value,
  onChange,
  autoComplete,
  placeholder = '••••••••••••',
  minLength,
}: Props) {
  const [gorunur, setGorunur] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={gorunur ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        minLength={minLength}
        required
        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3.5 pr-11 text-sm text-slate-800 transition-all focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20"
      />
      <button
        type="button"
        onClick={() => setGorunur((o) => !o)}
        aria-label={gorunur ? 'Parolayı gizle' : 'Parolayı göster'}
        aria-pressed={gorunur}
        title={gorunur ? 'Parolayı gizle' : 'Parolayı göster'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40"
      >
        {gorunur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
