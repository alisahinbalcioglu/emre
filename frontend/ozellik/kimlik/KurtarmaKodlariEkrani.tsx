'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — KURTARMA KODLARI EKRANI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Kodlar YALNIZ BURADA, YALNIZ BIR KEZ goruntulenir: sunucu duz kodlari
 *  saklamaz (yalniz bcrypt ozeti). Kullanici bunlari kaydetmezse ve
 *  telefonunu kaybederse hesabina girmenin tek yolu yonetici sifirlamasidir.
 *
 *  ⚠ "Devam" dugmesi ONAY KUTUSU ISARETLENMEDEN KAPALI. Gerekce: bu ekran
 *  bir bilgilendirme degil, bir SORUMLULUK devridir; tek tikla gecilebilen
 *  bir ekran okunmaz.
 */
import { useState } from 'react';

export function KurtarmaKodlariEkrani({
  kodlar,
  onDevam,
  devamEtiketi = 'Devam',
}: {
  kodlar: string[];
  onDevam: () => void;
  devamEtiketi?: string;
}) {
  const [kaydettim, setKaydettim] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);

  const metin = kodlar.join('\n');

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalandi(true);
    } catch {
      // Pano izni yoksa sessiz kalmayiz: kullaniciya elle secmesini soyleriz.
      setKopyalandi(false);
    }
  }

  function indir() {
    const bag = URL.createObjectURL(new Blob([metin], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = bag;
    a.download = 'metapricex-kurtarma-kodlari.txt';
    a.click();
    URL.revokeObjectURL(bag);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Kurtarma kodlarınız</h2>
        <p className="mt-1 text-xs text-slate-500">
          Telefonunuza ulaşamadığınızda hesabınıza girmenin tek yolu bu kodlardır.
          Her kod bir kez kullanılır. Bu ekran bir daha gösterilmeyecek.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs tracking-wider text-slate-800">
        {kodlar.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={kopyala}
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
        </button>
        <button
          type="button"
          onClick={indir}
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          .txt indir
        </button>
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={kaydettim}
          onChange={(e) => setKaydettim(e.target.checked)}
          className="mt-0.5"
        />
        <span>Kodları güvenli bir yere kaydettim.</span>
      </label>

      <button
        type="button"
        disabled={!kaydettim}
        onClick={onDevam}
        className="w-full rounded-xl bg-[#0B1528] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {devamEtiketi}
      </button>
    </div>
  );
}
