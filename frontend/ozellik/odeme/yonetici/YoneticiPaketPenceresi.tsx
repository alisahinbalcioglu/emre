'use client';

/**
 * Yönetici → Kullanıcılar → "Paket işlemleri" penceresi (24.09.2026, A2).
 *
 * Firmanın aboneliğini ve satıştaki her paket için yapılabilecek işlemi
 * SUNUCUDAN okur (`GET /yonetim/abonelik/:firmaId`). Karar sunucuda; bu
 * pencere yalnız gösterir ve doğrudan düşürmeyi onay adımıyla gönderir.
 *
 * ⚠ Düşürme MÜŞTERİ ONAYI ALMAZ (Emre kararı) — bu yüzden onay adımında
 * yönetici neyin ne zaman olacağını, müşterinin ne kaybedeceğini ve kimin
 * erişiminin duracağını görür; iç gerekçe ZORUNLUDUR (denetim kaydı).
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '@/ortak/lib/api';
import { Button } from '@/ortak/ui/button';
import { Badge } from '@/ortak/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/ortak/ui/dialog';
import { toast } from '@/ortak/hooks/use-toast';
import { tutarYaz } from '../paket-bicim';
import { trTarih } from '../../teklif/ceviri-kota';
import {
  DURUM_ETIKETI,
  GEREKCE_EN_AZ,
  METIN_EN_COK,
  ODEME_ETIKETI,
  dusurmeOzeti,
  gerekceGecerliMi,
  hakListesi,
  islemDugmesi,
  type YoneticiPaneli,
  type YoneticiSecenegi,
} from './yonetici-paket';

/** Sunucu hatası → okunur metin (doğrulama hataları dizi dönebilir). */
function hataMetni(e: any): string | null {
  const m = e?.response?.data?.mesaj ?? e?.response?.data?.message;
  if (Array.isArray(m)) return m.join(' ');
  return typeof m === 'string' ? m : null;
}

export default function YoneticiPaketPenceresi({
  firma,
  onKapat,
  onDegisti,
}: {
  firma: { id: string; ad: string };
  onKapat: () => void;
  /** Başarılı işlemden sonra kullanıcı listesini tazelemek için. */
  onDegisti: () => void;
}) {
  const [panel, setPanel] = useState<YoneticiPaneli | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  /** Düşürme onay adımındaki paket (null = liste görünümü). */
  const [secili, setSecili] = useState<YoneticiSecenegi | null>(null);
  const [gerekce, setGerekce] = useState('');
  const [musteriNotu, setMusteriNotu] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const yukle = useCallback(async (): Promise<YoneticiPaneli | null> => {
    setYukleniyor(true);
    setHata(null);
    try {
      const { data } = await api.get<YoneticiPaneli>(`/yonetim/abonelik/${firma.id}`);
      setPanel(data);
      return data;
    } catch (e) {
      setHata(hataMetni(e) ?? 'Paket bilgisi alınamadı.');
      return null;
    } finally {
      setYukleniyor(false);
    }
  }, [firma.id]);

  function onayAdiminiKapat() {
    setSecili(null);
    setGerekce('');
    setMusteriNotu('');
  }

  useEffect(() => {
    void yukle();
  }, [yukle]);

  async function dusur() {
    const hedef = secili;
    if (!hedef || !gerekceGecerliMi(gerekce)) return;
    setGonderiliyor(true);
    try {
      const { data } = await api.post(`/yonetim/abonelik/${firma.id}/dusur`, {
        paketSurumuId: hedef.paketSurumuId,
        gerekce: gerekce.trim(),
        musteriNotu: musteriNotu.trim() || undefined,
      });
      if (data?.oncekiDegisim) {
        // ⚠ KURTARMA: iyzico'da daha önce olmuş BAŞKA bir değişiklik bulundu
        // ve o kaydedildi; bu düşürme UYGULANMADI, müşteriye bildirim GİTMEDİ.
        // "Düşürme planlandı" demek yöneticiyi müşteriye yanlış bilgi
        // vermeye götürürdü (inceleme bulgusu M1).
        toast({
          title: 'Düşürme uygulanmadı',
          description:
            `iyzico'da önceki bir değişiklik bulundu ve o kaydedildi (${data?.yeniPaket?.ad ?? 'bilinmeyen paket'}). ` +
            'Müşteriye bildirim gitmedi.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Düşürme planlandı',
          description: data?.epostaGonderildi
            ? 'Firma sahibine bilgi e-postası gönderildi.'
            : 'Değişiklik planlandı ama bilgi e-postası GÖNDERİLEMEDİ; müşteriye ayrıca haber verin.',
        });
      }
      onayAdiminiKapat();
      onDegisti();
    } catch (e) {
      toast({
        title: 'Düşürme yapılamadı',
        description: hataMetni(e) ?? 'Beklenmedik bir hata oluştu.',
        variant: 'destructive',
      });
    } finally {
      setGonderiliyor(false);
      // Her iki durumda da TAZE durumu göster (başka biri değiştirmiş olabilir).
      const taze = await yukle();
      // Taze durumda bu paket artık doğrudan düşürülemiyorsa onay adımından
      // çık; hâlâ düşürülebiliyorsa (ör. "yeniden gönderin") gerekçe kalsın.
      const hala = taze?.secenekler.find((x) => x.paketSurumuId === hedef.paketSurumuId);
      if (hala?.islem !== 'dogrudan-dusur') onayAdiminiKapat();
    }
  }

  const ab = panel?.abonelik ?? null;

  return (
    <Dialog open onOpenChange={(acik) => !acik && !gonderiliyor && onKapat()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Paket işlemleri — {firma.ad}</DialogTitle>
          <DialogDescription>
            Düşürme müşteri onayı almadan dönem sonunda uygulanır. Yükseltme ve yatay geçiş
            müşteri onayı ister.
          </DialogDescription>
        </DialogHeader>

        {yukleniyor && !panel ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : hata ? (
          <div className="space-y-2">
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{hata}</p>
            <Button variant="outline" size="sm" onClick={() => void yukle()}>
              Yeniden dene
            </Button>
          </div>
        ) : panel ? (
          <div className="space-y-4 text-sm">
            {/* ── Mevcut durum ─────────────────────────────────────────── */}
            <section className="rounded-md border border-slate-200 p-3" data-bolum="mevcut">
              {ab ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{ab.paket.ad}</span>
                    <Badge variant="secondary">{DURUM_ETIKETI[ab.durum] ?? ab.durum}</Badge>
                    <Badge variant="secondary">{ODEME_ETIKETI[ab.odemeYontemi] ?? ab.odemeYontemi}</Badge>
                  </div>
                  <p className="text-slate-600">
                    {tutarYaz(ab.tutar, ab.paraBirimi)} / ay · erişim bitişi {trTarih(ab.erisimSonu) || '—'}
                    {ab.denemeSonu ? ` · deneme bitişi ${trTarih(ab.denemeSonu)}` : ''}
                  </p>
                  {ab.planliPaket && (
                    <p className="text-amber-700">
                      Bekleyen geçiş: {ab.planliPaket.ad}
                      {ab.paketGecisTarihi ? ` (${trTarih(ab.paketGecisTarihi)})` : ''}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate-600">Firmanın aboneliği yok.</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Etkin kişi: {panel.aktifUye} · Sahip: {panel.sahipler.join(', ') || '—'}
                {panel.firma.kapali ? ' · HESAP KAPATILMIŞ' : ''}
              </p>
            </section>

            {secili && ab ? (
              /* ── Düşürme onay adımı ───────────────────────────────────── */
              <section className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3" data-bolum="dusurme-onayi">
                <ul className="list-disc space-y-1 pl-5 text-slate-800">
                  {dusurmeOzeti({
                    mevcutPaketAdi: ab.paket.ad,
                    secenek: secili,
                    beklenenGecis: ab.beklenenGecis,
                  }).map((satir) => (
                    <li key={satir}>{satir}</li>
                  ))}
                </ul>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    İç gerekçe (zorunlu, denetim kaydına yazılır; müşteriye gitmez)
                  </span>
                  <textarea
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
                    rows={2}
                    maxLength={METIN_EN_COK}
                    value={gerekce}
                    onChange={(e) => setGerekce(e.target.value)}
                    placeholder={`En az ${GEREKCE_EN_AZ} karakter`}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    Müşteriye not (isteğe bağlı, e-postada görünür)
                  </span>
                  <textarea
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
                    rows={2}
                    maxLength={METIN_EN_COK}
                    value={musteriNotu}
                    onChange={(e) => setMusteriNotu(e.target.value)}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" disabled={gonderiliyor} onClick={onayAdiminiKapat}>
                    Vazgeç
                  </Button>
                  <Button
                    size="sm"
                    disabled={gonderiliyor || !gerekceGecerliMi(gerekce)}
                    onClick={() => void dusur()}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {gonderiliyor ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    Dönem sonunda düşür
                  </Button>
                </div>
              </section>
            ) : (
              /* ── Paket seçenekleri ────────────────────────────────────── */
              <section className="space-y-2" data-bolum="secenekler">
                {panel.secenekler.map((s) => {
                  const dugme = islemDugmesi(s.islem);
                  return (
                    <div
                      key={s.paketSurumuId}
                      className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium text-slate-900">
                          {s.paket.ad}{' '}
                          <span className="font-normal text-slate-500">
                            · {tutarYaz(s.tutar, s.paraBirimi)} / ay · {s.paket.kullaniciHakki} kişi
                          </span>
                        </p>
                        <p className="text-xs text-slate-600">{s.aciklama}</p>
                        {s.kayiplar.length > 0 && s.islem !== 'yok' && (
                          <p className="text-xs text-amber-700">Kayıp: {hakListesi(s.kayiplar)}</p>
                        )}
                        {s.durdurulacakUye > 0 && s.islem !== 'yok' && (
                          <p className="text-xs text-amber-700">{s.durdurulacakUye} kişinin erişimi durur</p>
                        )}
                      </div>
                      {dugme && (
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Button
                            size="sm"
                            variant={dugme.etkin ? 'default' : 'outline'}
                            disabled={!dugme.etkin}
                            onClick={() => {
                              setGerekce('');
                              setMusteriNotu('');
                              setSecili(s);
                            }}
                          >
                            {dugme.etiket}
                          </Button>
                          {/* Kapalı düğmenin nedeni GÖRÜNÜR metin: yalnız `title`
                              klavye ve ekran okuyucu kullanıcısına ulaşmaz. */}
                          {!dugme.etkin && dugme.ipucu && (
                            <span className="max-w-[12rem] text-right text-[11px] text-slate-500">
                              {dugme.ipucu}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
