'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/ortak/ui/dialog';
import { Button } from '@/ortak/ui/button';
import { Input } from '@/ortak/ui/input';
import { Label } from '@/ortak/ui/label';

/**
 * ÇEVİRİYİ DÜZELT — firma karşılığı diyaloğu (Faz 6.9, §4.4).
 *
 * Kaydedilen karşılık YALNIZ bu firmanın tekliflerinde kullanılır; ortak
 * sözlüğe (her müşterinin gördüğü katmana) yazılmaz. Hata SESSİZ KAPANMAZ:
 * diyalog içinde kırmızı satır olarak kalır, istek sürerken düğmeler kapalıdır.
 */
export interface CeviriDuzeltmeHedefi {
  /** Türkçe asıl metin — düzeltmenin anahtarı. */
  kaynak: string;
  /** Tabloda o an görünen metin (İngilizce görünümde çeviri). */
  gorunen: string;
  /** Firmanın kayıtlı karşılığı (varsa). */
  mevcut?: { id: string; ceviri: string } | null;
}

interface Props {
  hedef: CeviriDuzeltmeHedefi | null;
  onKapat: () => void;
  onKaydet: (deger: string) => Promise<void>;
  onKaldir: (id: string) => Promise<void>;
}

export function CeviriDuzeltmeDialog({ hedef, onKapat, onKaydet, onKaldir }: Props) {
  const [deger, setDeger] = useState('');
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    if (!hedef) return;
    // Firma karşılığı varsa o; yoksa görünen metin kaynaktan farklıysa o; değilse boş.
    const baslangic = hedef.mevcut?.ceviri ?? (hedef.gorunen !== hedef.kaynak ? hedef.gorunen : '');
    setDeger(baslangic);
    setHata(null);
    setCalisiyor(false);
  }, [hedef]);

  if (!hedef) return null;

  const calistir = async (fn: () => Promise<void>) => {
    setCalisiyor(true);
    setHata(null);
    try {
      await fn();
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setCalisiyor(false);
    }
  };

  return (
    <Dialog open onOpenChange={(a) => { if (!a && !calisiyor) onKapat(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Çeviriyi düzelt</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Türkçe asıl</Label>
            <Input value={hedef.kaynak} readOnly className="bg-muted" />
          </div>
          <div>
            <Label>Tabloda görünen</Label>
            <Input value={hedef.gorunen} readOnly className="bg-muted" />
          </div>
          <div>
            <Label htmlFor="ceviri-duzeltme-karsilik">Firmanızın karşılığı</Label>
            <Input
              id="ceviri-duzeltme-karsilik"
              value={deger}
              maxLength={2000}
              disabled={calisiyor}
              onChange={(e) => setDeger(e.target.value)}
              placeholder="Örn. ball valve"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Bu karşılık yalnız firmanızın tekliflerinde kullanılır: teklif ekranındaki İngilizce görünümde ve
            İngilizce dosyada. Düzenle ekranında İngilizce kaydedilmiş hücreler kendiliğinden değişmez; orada
            kalem işaretiyle uygulayıp teklifi kaydedin.
          </p>
          {hata ? <p className="text-sm text-destructive">{hata}</p> : null}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {hedef.mevcut ? (
            <Button
              type="button"
              variant="outline"
              disabled={calisiyor}
              onClick={() => calistir(() => onKaldir(hedef.mevcut!.id))}
            >
              Firma karşılığını kaldır
            </Button>
          ) : <span />}
          <span className="flex gap-2">
            <Button type="button" variant="ghost" disabled={calisiyor} onClick={onKapat}>Vazgeç</Button>
            <Button type="button" disabled={calisiyor || deger.trim() === ''} onClick={() => calistir(() => onKaydet(deger.trim()))}>
              Kaydet
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
