/**
 * DWG KAPISI — ortak `ozellik-kapisi` uzerine ince sarmalayici.
 *
 * ⚠ 03.09'da Excel ve ISCILIK de ayni kapiya baglandi; mantik
 * `ozellik-kapisi.ts`e TASINDI. Bu dosya kendi ADLANDIRMASINI korur
 * (cagiranlar ve 16 testi degismesin diye) ama KARARI artik ortak
 * fonksiyonlar verir — uc yerde uc farkli "sonuk" davranisi olmasin.
 *
 * Uc durumun gerekcesi (yukleniyor/acik/sonuk) ortak dosyada yazili.
 */
import {
  ipucu,
  kapiDurumu,
  rozetMetni,
  tiklanabilir,
  type KapiDurumu,
} from './ozellik-kapisi';

export type DwgKapiDurumu = KapiDurumu;

export interface DwgKapiGirdisi {
  loading: boolean;
  dwgVar: boolean;
}

export function dwgKapisi({ loading, dwgVar }: DwgKapiGirdisi): DwgKapiDurumu {
  return kapiDurumu({ loading, izinVar: dwgVar });
}

export function dwgTiklanabilir(durum: DwgKapiDurumu): boolean {
  return tiklanabilir(durum);
}

export function dwgRozetMetni(durum: DwgKapiDurumu): string | null {
  return rozetMetni(durum, 'PRO');
}

export function dwgIpucu(durum: DwgKapiDurumu): string | undefined {
  return ipucu(
    durum,
    'DWG metraj Pro pakete dahildir. Yukseltmek icin Abonelik sayfasina gidin.',
  );
}
