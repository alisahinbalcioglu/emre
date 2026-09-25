'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { toast } from '@/ortak/hooks/use-toast';
import type { CalculatedLayer, WorkspaceState } from './types';
import {
  bosDurum,
  calismaKaydiIndirgeyici,
  kayitliDurumuCoz,
  tepedeMi,
  yeniKayit,
} from './calisma-kaydi';
import { tepedekiAdim, yinelenecekAdim } from './gecmis';

/**
 * Workspace state yonetimi — layer secimi, hesaplanmis metrajlar, cap
 * etiketleri, gorunum tercihleri + GERI AL / YINELE (25.09 DWG tasarimi).
 *
 * Durum makinesi saf bir indirgeyicidir (`calisma-kaydi.ts`); bu kanca yalniz
 * yukleme, kalicilik ve eylem kimliklerini yonetir.
 *
 * EMEK KAYBI SIGORTASI (UX/TTL): state oncelikle DOSYA ICERIK HASH'i ile
 * anahtarlanir (fileHash = sha256 ilk 16 hex, DwgUploader hesaplar). Sunucu
 * cache'i dusse ve ayni dosya YENIDEN yuklense bile (yeni file_id!)
 * kullanicinin tum etiketlemeleri hash key'inden geri gelir.
 * fileHash yoksa (eski oturum / hash hesaplanamadi) file_id key'ine duser.
 *
 * KALICILIK: yalniz BELGE + gorunum yazilir (gecmis bellek icindedir) ve
 * yazim GECIKMELIDIR — binlerce parcalik JSON her tiklamada yazilmasin.
 * Bekleyen yazim sayfa kapanirken / bilesen kalkarken bosaltilir.
 */
/** fileId bazli LEGACY storage key — geriye uyum icin okunur. */
const STORAGE_KEY_PREFIX = 'metaprice_dwg_ws_';
/** Icerik-hash bazli KALICI storage key — birincil. */
const HASH_KEY_PREFIX = 'metaprice_dwg_ws_h_';
/** Kalici yazimin gecikmesi (ms). */
const YAZIM_GECIKMESI = 400;

function _storageKey(fileId: string, fileHash?: string | null): string {
  return fileHash ? HASH_KEY_PREFIX + fileHash : STORAGE_KEY_PREFIX + fileId;
}

/**
 * BU DOSYANIN kayitli calismasini siler (etiketler + hesaplanmis layer'lar +
 * onaylar). "Bu dosyayi sifirla" aksiyonunun tek dogru silme yolu.
 *
 * ⚠ YALNIZ bu dosyaya ait iki anahtara dokunur (hash + legacy fileId); baska
 * projelerin kayitlari (`metaprice_dwg_ws_h_*` digerleri) KORUNUR. Bu yuzden
 * prefix'e gore toplu silme YAPILMAZ.
 */
export function clearWorkspaceState(fileId: string, fileHash?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (fileHash) window.localStorage.removeItem(HASH_KEY_PREFIX + fileHash);
    window.localStorage.removeItem(STORAGE_KEY_PREFIX + fileId);
  } catch { /* storage kapali — sifirlama sessizce atlanir */ }
}

function _loadState(fileId: string, scale: number, fileHash?: string | null): WorkspaceState {
  if (typeof window === 'undefined') return bosDurum(fileId, scale);
  try {
    // 1) Birincil: hash key (ayni dosya = ayni state, file_id degisse bile)
    let raw = fileHash ? window.localStorage.getItem(HASH_KEY_PREFIX + fileHash) : null;
    let hashAnahtarli = !!raw;
    // 2) Legacy: file_id key (hash'ten onceki kayitlar — migrasyon okumasi)
    if (!raw) {
      raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + fileId);
      hashAnahtarli = false;
    }
    if (!raw) return bosDurum(fileId, scale);
    return kayitliDurumuCoz(JSON.parse(raw), fileId, scale, hashAnahtarli);
  } catch {
    return bosDurum(fileId, scale);
  }
}

/** Geri yuklenen calismanin ozeti — "onceki calismaniz geri geldi" bandi icin. */
export interface GeriYuklenenCalisma {
  /** Diskten gelen hesaplanmis layer sayisi (0 = temiz baslangic). */
  layers: number;
  /** Bunlarin kaci onayli. */
  approved: number;
}

function _ozetle(s: WorkspaceState): GeriYuklenenCalisma {
  const list = Object.values(s.calculatedLayers);
  return { layers: list.length, approved: list.filter((l) => l.approved).length };
}

export function useWorkspaceState(fileId: string, scale: number, fileHash?: string | null) {
  const [kayit, dispatch] = useReducer(
    calismaKaydiIndirgeyici,
    undefined,
    () => yeniKayit(_loadState(fileId, scale, fileHash)),
  );
  const state = kayit.state;

  /** DISKTEN gelen calismanin ozeti (o anki state degil — yuklendigi andaki).
   *  Kullanici "yeni yukledim ama eski hali geldi" sasirmasini yasamasin diye
   *  ekranda acikca gosterilir. */
  const [restoredWork, setRestoredWork] = useState<GeriYuklenenCalisma>(() => _ozetle(kayit.state));

  /** Eylem kimligi — indirgeyici saf kalsin diye kimlik DISARIDA uretilir. */
  const idRef = useRef(0);
  const yeniId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  // ── KALICILIK (gecikmeli; sayfa kapanirken bosaltilir) ──────────────────
  // Yazim anahtari, state'in YUKLENDIGI dosyanin anahtaridir — prop'tan degil.
  // 25.09 inceleme: dosya kimligi bilesen sokulmeden degisirse ayni commit'te
  // ESKI state YENI anahtara kuyruga giriyordu (bugun DwgUploader bileseni
  // soktugu icin erisilemez; sigorta).
  const kayitAnahtariRef = useRef(_storageKey(fileId, fileHash));
  const bekleyenRef = useRef<{ anahtar: string; veri: WorkspaceState } | null>(null);
  const zamanlayiciRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hataBildirildiRef = useRef(false);

  const bosalt = useCallback(() => {
    if (zamanlayiciRef.current) {
      clearTimeout(zamanlayiciRef.current);
      zamanlayiciRef.current = null;
    }
    const b = bekleyenRef.current;
    bekleyenRef.current = null;
    if (!b || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(b.anahtar, JSON.stringify(b.veri));
    } catch (e) {
      // Kota dolu / depolama kapali: calisma KAYDEDILEMIYOR. Eskiden
      // `catch {}` bunu yutuyordu ve kayit sessizce duruyordu.
      console.warn('[dwg] calisma kaydedilemedi:', e);
      if (!hataBildirildiRef.current) {
        hataBildirildiRef.current = true;
        toast({
          title: 'Çalışma bu tarayıcıya kaydedilemedi',
          description: 'Tarayıcı depolaması dolu ya da kapalı. Sayfayı kapatırsanız son değişiklikler kaybolabilir.',
          variant: 'destructive',
        });
      }
    }
  }, []);

  // ── Dosya degisince ilgili kayittan yukle (birim degisimi YUKLEME DEGIL) ──
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const yukluRef = useRef({ fileId, fileHash: fileHash ?? null });
  useEffect(() => {
    const y = yukluRef.current;
    if (y.fileId === fileId && y.fileHash === (fileHash ?? null)) return;
    // Onceki dosyanin bekleyen yazimi ONCE kendi anahtarina gider.
    bosalt();
    yukluRef.current = { fileId, fileHash: fileHash ?? null };
    kayitAnahtariRef.current = _storageKey(fileId, fileHash);
    const yuklenen = _loadState(fileId, scaleRef.current, fileHash);
    dispatch({ tur: 'yukle', state: yuklenen });
    setRestoredWork(_ozetle(yuklenen));
  }, [fileId, fileHash, bosalt]);

  // Birim degisti: hesaplar KORUNUR, her layer kendi `scaleUsed`iyla bayat
  // gorunur (25.09'a dek burada layer'lar dusuruluyor, etiketler siliniyordu).
  useEffect(() => {
    dispatch({ tur: 'birim', scale });
  }, [scale]);

  // Yalniz STATE degisince yazilir; anahtar yuklenen dosyanindir.
  useEffect(() => {
    if (!state.fileId) return;
    bekleyenRef.current = { anahtar: kayitAnahtariRef.current, veri: state };
    if (zamanlayiciRef.current) clearTimeout(zamanlayiciRef.current);
    zamanlayiciRef.current = setTimeout(bosalt, YAZIM_GECIKMESI);
  }, [state, bosalt]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('pagehide', bosalt);
    window.addEventListener('beforeunload', bosalt);
    return () => {
      window.removeEventListener('pagehide', bosalt);
      window.removeEventListener('beforeunload', bosalt);
      bosalt();
    };
  }, [bosalt]);

  /** "Bu dosyayi sifirla" — SADECE bu dosyanin kayitli calismasini siler ve
   *  ekrani temiz baslangica alir. Diger projelerin kayitlarina DOKUNMAZ.
   *  ⚠ Geri donusu yoktur (tek kopya, sunucuda yedegi yok) — cagiran taraf
   *  MUTLAKA onay sormali. */
  const resetFileState = useCallback(() => {
    // Bekleyen yazim eski calismayi geri yazmasin.
    if (zamanlayiciRef.current) clearTimeout(zamanlayiciRef.current);
    zamanlayiciRef.current = null;
    bekleyenRef.current = null;
    clearWorkspaceState(fileId, fileHash);
    dispatch({ tur: 'yukle', state: bosDurum(fileId, scaleRef.current) });
    setRestoredWork({ layers: 0, approved: 0 });
  }, [fileId, fileHash]);

  // ── BELGE ISLEMLERI (gecmise yazilir) ────────────────────────────────────
  const secLayer = useCallback((layer: string | null) => {
    dispatch({ tur: 'sec', id: yeniId(), layer });
  }, []);

  /** Motor sonucu: yeni ayirma ya da (layer zaten varsa) yeniden ayirma —
   *  aktarim payi indirgeyicide VERIDEN hesaplanir. `oturum`: birim
   *  degisimi sonrasi sirali yeniden ayirma (bildirimler toplanir). */
  const hesapSonucu = useCallback((hesap: CalculatedLayer, oturum?: number) => {
    dispatch({ tur: 'hesap', id: yeniId(), hesap, oturum });
  }, []);

  const hesabiKaldir = useCallback((layer: string) => {
    dispatch({ tur: 'kaldir', id: yeniId(), layer });
  }, []);

  /** `surum`: tiklanan parcalamanin `computedAt`'i — tutmazsa eylem reddedilir. */
  const capAta = useCallback((layer: string, idler: number[], cap: string, surum: number, toplu = false) => {
    dispatch({ tur: 'cap', id: yeniId(), layer, idler, cap, surum, toplu });
  }, []);

  const onayla = useCallback((layer: string) => {
    dispatch({ tur: 'onayla', id: yeniId(), layer, zaman: Date.now() });
  }, []);

  const onayiKaldir = useCallback((layer: string) => {
    dispatch({ tur: 'onayiKaldir', id: yeniId(), layer });
  }, []);

  const olcekle = useCallback((layer: string, yeniScale: number, oturum?: number) => {
    dispatch({ tur: 'olcekle', id: yeniId(), layer, scale: yeniScale, oturum });
  }, []);

  const geriAl = useCallback(() => dispatch({ tur: 'geri' }), []);
  const yinele = useCallback(() => dispatch({ tur: 'ileri' }), []);

  // ── GORUNUM (gecmise yazilmaz) ───────────────────────────────────────────
  const toggleSprinklerLayer = useCallback((layer: string) => dispatch({ tur: 'sprinkler', layer }), []);
  const toggleLayerVisibility = useCallback((layer: string) => dispatch({ tur: 'gizle', layer }), []);
  const toggleLayerDimmed = useCallback((layer: string) => dispatch({ tur: 'soluklastir', layer }), []);
  const tumunuGoster = useCallback(() => dispatch({ tur: 'tumunuGoster' }), []);
  const yalnizGoster = useCallback(
    (layer: string, katmanlar: string[]) => dispatch({ tur: 'yalnizGoster', layer, katmanlar }),
    [],
  );

  const geriAdim = tepedekiAdim(kayit.gecmis);
  const ileriAdim = yinelenecekAdim(kayit.gecmis);

  return {
    state,
    restoredWork,
    resetFileState,
    /** Gecmise yazilan son islem (bildirim bunu gosterir). */
    sonIslem: kayit.son,
    /** Bildirimdeki "Geri al" bu islemi mi geri alir? */
    islemTepedeMi: (id: number) => tepedeMi(kayit, id),
    geriEtiketi: geriAdim?.etiket ?? null,
    ileriEtiketi: ileriAdim?.etiket ?? null,
    geriAl,
    yinele,
    secLayer,
    hesapSonucu,
    hesabiKaldir,
    capAta,
    onayla,
    onayiKaldir,
    olcekle,
    toggleSprinklerLayer,
    toggleLayerVisibility,
    toggleLayerDimmed,
    tumunuGoster,
    yalnizGoster,
  };
}
