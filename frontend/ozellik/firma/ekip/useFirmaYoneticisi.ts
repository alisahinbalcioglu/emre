'use client';

import { useEffect, useState } from 'react';
import api from '@/ortak/lib/api';
import { yoneticiEpostasi } from './kisi-metinleri';

/**
 * 23.09.2026 — ÜYENİN FİRMA YÖNETİCİSİ (kapalı bölüm sayfası + kilitli kart).
 *
 * Tasarım: "sayfada firma yöneticisinin e-postası ve 'E-posta gönder'
 * (mailto) bulunur". Sunucuda bunun için ayrı bir alan YOK ve bu tur API'ye
 * dokunulmadı: `GET /firma/uyeler` üyeye de ekibi döner (yönetici satırı
 * dahil; Ekip sayfası aynı listeyi kullanıyor). Sunucu önce yöneticileri
 * dizer — birden çok yönetici varsa İLKİ.
 *
 * ⚠ YALNIZ `etkin` iken istek atılır (bilinen üye + kapalı bir bölüm):
 *   sahibe ve izni açık üyeye her pano açılışında fazladan istek gitmesin.
 * ⚠ Üç hâl: `undefined` = henüz bilinmiyor (istek yolda), `null` =
 *   alınamadı/yok, metin = adres. "Yükleniyor" ile "alınamadı" aynı
 *   çizilseydi ekran bir an "alınamadı" deyip sonra adresi basardı.
 * ⚠ Hata ekranı bozmaz ama YUTULMAZ: adres bulunamazsa `null` döner,
 *   çağıran e-posta bağlantısını çizmez; neden konsola yazılır.
 */
export function useFirmaYoneticisi(etkin: boolean): string | null | undefined {
  const [eposta, setEposta] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!etkin) return;
    let iptal = false;
    api
      .get<{ uyeler?: { eposta: string; firmaRol: string }[] }>('/firma/uyeler')
      .then(({ data }) => {
        if (iptal) return;
        setEposta(yoneticiEpostasi(data?.uyeler));
      })
      .catch((e: unknown) => {
        console.warn('[ekip] firma yöneticisinin adresi alınamadı:', e);
        if (!iptal) setEposta(null);
      });
    return () => {
      iptal = true;
    };
  }, [etkin]);

  return eposta;
}
