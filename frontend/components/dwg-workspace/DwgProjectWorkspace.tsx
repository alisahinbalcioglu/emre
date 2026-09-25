'use client';

/**
 * DWG Analiz calisma alani — 25.09 tasarimi.
 *
 *   Baslik : dosya + sayaclar · Birim · Yeni DWG · Fiyatlandırmaya geç
 *   Sol    : Canvas2D cizim + arac cubugu (Katmanlar, yakinlastir, cap
 *            silgisi, geri al / yinele) + ipucu hapi + Katmanlar paneli
 *   Sag    : 3 adimli yol haritasi — 1 Boru layer'ını seçin · 2 Çap atayın ·
 *            3 Metrajı onaylayın (sabit altbilgi)
 *
 * Cizim motoru, T'de bolme, iki bolme yontemi, cap etiketleme ve layer
 * islemleri AYNEN kalir; degisen yerlesim, yonlendirme ve metinler.
 *
 * GERI ALMA: layer secimi, parcalara ayirma, ayirmayi kaldirma, cap atama,
 * silgiyle cap kaldirma, toplu cap, onay ve onayi geri alma TEK TEK geri
 * alinir (calisma-kaydi.ts). Gorunum (gizle / soluklastir / 💧) gecmise
 * yazilmaz. Parcalara ayirma surerken gecmis KILITLIDIR: motor sonucu geri
 * alinmis bir durumun ustune dusmesin.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/ortak/hooks/use-toast';
import { confirm } from '@/ortak/hooks/use-confirm';
import { DxfCanvasViewer } from '@/components/dwg-viewer';
import type { CizimKontrolleri, GeometriBilgisi, ParcaKimligi } from '@/components/dwg-viewer';
import type { EdgeSegment, MetrajResult } from '@/components/dwg-metraj/types';
import { useLayerCalc, useOriginalColorState } from '@/components/dwg-diameter-engine';
import type { LayerCalcResult } from '@/components/dwg-diameter-engine';
import { useActiveBucket, useTaggingStore } from '@/components/dwg-tagging';
import { CAPSIZ_RENGI, canonicalizeDiameter, diameterToColor } from '@/components/dwg-metraj/diameter-colors';
import { isUnassignedDiameter } from '@/components/dwg-metraj/constants';
import { useWorkspaceState } from './useWorkspaceState';
import { capRenkliGorunur, onaySirasi } from './onay-revizyon';
import {
  adimDurumu,
  fiyatlandirmaDurumu,
  fiyatlandirmaEngeli,
  ipucu as ipucuHesapla,
  kisayolEylemi,
  onayEngeli,
  onayKutusuAcikMi,
  yaziAlaniMi,
} from './adim-durumu';
import { ayniOlcek, birimBayatMi, yerelOlceklenebilir } from './birim-bayatlik';
import { boruAdayiMi, boruAdaylari } from './boru-adaylari';
import {
  capAra,
  capGruplari,
  capIlerlemesi,
  capSatirlari,
  gezinmeKonumu,
  sonrakiParca,
  type CapSatiri,
} from './cap-gruplari';
import { capsizParcalar } from './belge-islemleri';
import { birimKisa, guvenilirMi } from './birimler';
import CalismaBasligi from './CalismaBasligi';
import BirimPenceresi, { type BirimTespiti } from './BirimPenceresi';
import CizimAracCubugu from './CizimAracCubugu';
import { CizimLejanti, DurumBildirimi, IpucuHapi, type Bildirim } from './CizimUstu';
import KatmanlarPaneli, { type KatmanHesapDurumu } from './KatmanlarPaneli';
import Adim1BoruLayer, { type CalisilanLayer } from './Adim1BoruLayer';
import Adim2CapAta from './Adim2CapAta';
import Adim3Onay from './Adim3Onay';

interface DwgProjectWorkspaceProps {
  fileId: string;
  scale: number;
  fileName: string;
  /** Dosya iceriginin sha256 kisa hash'i (DwgUploader hesaplar). Workspace
   *  state'i bununla anahtarlanir — sunucu file_id'yi unutsa bile ayni dosya
   *  yeniden yuklenince TUM etiketler localStorage'dan geri gelir. */
  fileHash?: string | null;
  onReset: () => void;
  onApproved: (metraj: MetrajResult, fileName: string) => void;
  /** Sunucunun otomatik birim tespiti (yoksa null). */
  birimTespiti?: BirimTespiti | null;
  /** Kullanici birimi elle secti ya da dogruladi mi? */
  birimElle?: boolean;
  /** Tespit zayif: birim penceresi acik baslar. */
  birimPenceresiAcikBaslasin?: boolean;
  /** Birim penceresinde "Kaydet". */
  onBirimDegistir?: (scale: number) => void;
}

const bosSet = new Set<string>();

export default function DwgProjectWorkspace({
  fileId, scale, fileName, fileHash = null, onReset, onApproved,
  birimTespiti = null, birimElle = false, birimPenceresiAcikBaslasin = false, onBirimDegistir,
}: DwgProjectWorkspaceProps) {
  const ws = useWorkspaceState(fileId, scale, fileHash);
  const {
    state, restoredWork, resetFileState, sonIslem, islemTepedeMi,
    geriEtiketi, ileriEtiketi, geriAl, yinele,
    secLayer, hesapSonucu, hesabiKaldir, capAta, onayla, onayiKaldir, olcekle,
    toggleSprinklerLayer, toggleLayerVisibility, toggleLayerDimmed, tumunuGoster, yalnizGoster,
  } = ws;
  const secili = state.selectedLayer;
  const seciliHesap = secili ? state.calculatedLayers[secili] ?? null : null;

  const viewerRef = useRef<CizimKontrolleri>(null);
  const [bilgi, setBilgi] = useState<GeometriBilgisi | null>(null);
  const [yontem, setYontem] = useState<'t' | 'none'>('t');
  const [katmanlarAcik, setKatmanlarAcik] = useState(false);
  const [birimAcik, setBirimAcik] = useState(birimPenceresiAcikBaslasin);
  const [silgi, setSilgi] = useState(false);
  const [capsizOdak, setCapsizOdak] = useState(false);
  const [capSorgu, setCapSorgu] = useState('');
  const [tagFlash, setTagFlash] = useState<(ParcaKimligi & { color: string; at: number }) | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim | null>(null);
  /** Cap satirindan gezinme: odak PARCA NUMARASIYLA (indeksle degil — bkz.
   *  `sonrakiParca`); `surum` her istekte artar, kamerayi yalniz o oynatir. */
  const [gezinme, setGezinme] = useState<{ cap: string; parca: number; surum: number } | null>(null);
  const [yenidenAyirma, setYenidenAyirma] = useState<{ sira: number; toplam: number } | null>(null);
  const [geriYuklemeBandiKapali, setGeriYuklemeBandiKapali] = useState(false);

  const { useDiameterColors, enableDiameterColors, restoreOriginalColors } = useOriginalColorState();
  const aktifKalem = useActiveBucket();
  const kalemler = useTaggingStore((s) => s.buckets);
  const kalemEkle = useTaggingStore((s) => s.addBucket);
  const kalemSil = useTaggingStore((s) => s.removeBucket);
  const kalemSec = useTaggingStore((s) => s.toggleActiveBucket);
  const kalemiBirak = useTaggingStore((s) => s.clearActiveBucket);

  // Zaman uyumsuz yollar (motor sonucu, sirali yeniden ayirma) GUNCEL degeri okur.
  const stateRef = useRef(state);
  stateRef.current = state;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const iptalRef = useRef(false);
  useEffect(() => {
    iptalRef.current = false;
    return () => { iptalRef.current = true; };
  }, []);

  // ── Motor ────────────────────────────────────────────────────────────────
  /** Sirali yeniden ayirma oturumu (birden cok layer) — sonuclar tek
   *  bildirimde toplanir. Oturum disinda `undefined`. */
  const oturumRef = useRef<number | undefined>(undefined);
  const oturumSayaciRef = useRef(0);
  const hesapGeldi = useCallback(({ calculated }: LayerCalcResult) => {
    // Aktarim payi indirgeyicide layer'in kendi verisinden hesaplanir
    // (`belge-islemleri.hesapSonucuUygula`) — cizimin tamami KULLANILMAZ.
    hesapSonucu(calculated, oturumRef.current);
    enableDiameterColors();
  }, [hesapSonucu, enableDiameterColors]);

  const dosyaGecersiz = useCallback(() => {
    iptalRef.current = true;
    onReset();
  }, [onReset]);

  const { calculatingLayer, calculateLayer } = useLayerCalc({ fileId, onResult: hesapGeldi, onFileIdInvalid: dosyaGecersiz });
  /** Motor calisirken gecmis ve birim kilitli. */
  const kilit = !!calculatingLayer || !!yenidenAyirma;

  const adim = adimDurumu({ seciliLayer: secili, hesap: seciliHesap, scale, sprinklerLayers: state.sprinklerLayers });

  // ── Katman bilgisi ───────────────────────────────────────────────────────
  const katmanRenk = useMemo(() => {
    const m = new Map<string, { renk: string; cizgi: number }>();
    for (const k of bilgi?.katmanlar ?? []) m.set(k.ad, { renk: k.renk, cizgi: k.cizgi });
    return m;
  }, [bilgi]);
  const layerRengi = useCallback((ad: string | null) => (ad && katmanRenk.get(ad)?.renk) || '#94a3b8', [katmanRenk]);
  const adaylar = useMemo(() => boruAdaylari(bilgi?.katmanlar ?? []), [bilgi]);
  const adayAdlari = useMemo(
    () => (bilgi?.katmanlar ?? []).filter((k) => k.cizgi > 0 && boruAdayiMi(k.ad)).map((k) => k.ad),
    [bilgi],
  );

  // ── Secim degisince kalem / silgi / gezinme sifirlanir ───────────────────
  // UX #4: onceki layer'in kalemi sonrakine bulasmasin. Secim, Degistir,
  // geri al ve yinele HEPSI bu yoldan gecer.
  const oncekiSecimRef = useRef(secili);
  useEffect(() => {
    if (oncekiSecimRef.current === secili) return;
    oncekiSecimRef.current = secili;
    kalemiBirak();
    setSilgi(false);
    setCapsizOdak(false);
    setGezinme(null);
    setCapSorgu('');
  }, [secili, kalemiBirak]);

  // ── Bildirim: gecmise yazilan son islem ──────────────────────────────────
  useEffect(() => {
    if (sonIslem?.bildirim) setBildirim({ id: sonIslem.id, metin: sonIslem.bildirim });
  }, [sonIslem]);
  const bildirimKapat = useCallback(() => setBildirim(null), []);

  // ── Viewer girdileri (kimlikleri kararli: sahne onbellegi bunlara bakar) ─
  const tumParcalar = useMemo(() => {
    const m: Record<string, EdgeSegment[]> = {};
    Object.keys(state.calculatedLayers).forEach((ad) => { m[ad] = state.calculatedLayers[ad].edgeSegments; });
    return m;
  }, [state.calculatedLayers]);
  const hamSet = useMemo(() => {
    const s = new Set<string>();
    Object.keys(state.calculatedLayers).forEach((ad) => {
      const cl = state.calculatedLayers[ad];
      if (!capRenkliGorunur({ hesaplandi: true, onayli: cl.approved, secili: ad === secili })) s.add(ad);
    });
    return s;
  }, [state.calculatedLayers, secili]);
  const hesapAdlari = Object.keys(state.calculatedLayers).sort().join('\u0000');
  const solukSet = useMemo(() => {
    if (!secili) return bosSet;
    const s = new Set<string>();
    for (const ad of adayAdlari) if (ad !== secili) s.add(ad);
    for (const ad of hesapAdlari ? hesapAdlari.split('\u0000') : []) if (ad !== secili) s.add(ad);
    return s;
  }, [secili, adayAdlari, hesapAdlari]);
  const seciliJunctions = useMemo(
    () => (seciliHesap && seciliHesap.junctionPoints.length > 0 ? { [seciliHesap.layer]: seciliHesap.junctionPoints } : undefined),
    [seciliHesap],
  );
  const hiddenSet = useMemo(() => new Set(state.hiddenLayers), [state.hiddenLayers]);
  const dimmedSet = useMemo(() => new Set(state.dimmedLayers), [state.dimmedLayers]);
  const sprinklerSet = useMemo(() => new Set(state.sprinklerLayers), [state.sprinklerLayers]);

  // ── Cap listesi + gezinme ────────────────────────────────────────────────
  const seciliParcalar = seciliHesap?.edgeSegments;
  const tumSatirlar = useMemo(() => capSatirlari(kalemler, seciliParcalar ?? []), [kalemler, seciliParcalar]);
  const gruplar = useMemo(() => capGruplari(capAra(tumSatirlar, capSorgu)), [tumSatirlar, capSorgu]);
  const ilerleme = useMemo(() => capIlerlemesi(seciliParcalar ?? []), [seciliParcalar]);
  const aktifCap = aktifKalem ? canonicalizeDiameter(aktifKalem.diameter) : null;

  const capaAit = useCallback((s: EdgeSegment, cap: string) => (
    cap === '' ? isUnassignedDiameter(s.diameter) : !isUnassignedDiameter(s.diameter) && canonicalizeDiameter(s.diameter) === cap
  ), []);
  /** O capin parcalarinin numaralari, artan sirada. */
  const capKimlikleri = useCallback(
    (cap: string) => (seciliParcalar ?? []).filter((s) => capaAit(s, cap)).map((s) => s.segment_id).sort((a, b) => a - b),
    [seciliParcalar, capaAit],
  );
  // Odak KIMLIKLE bulunur: etiketleme listeyi kisaltsa da odak ayni parcada kalir.
  const odakParca = gezinme && seciliParcalar
    ? seciliParcalar.find((s) => s.segment_id === gezinme.parca) ?? null
    : null;
  const gezinmeYeri = useMemo(
    () => (gezinme ? gezinmeKonumu(capKimlikleri(gezinme.cap), gezinme.parca) : null),
    [gezinme, capKimlikleri],
  );
  // Surum TEKDUZE artar (gezinme sifirlansa da): viewer kamerayi yalniz yeni
  // surumde oynatir; 1'den yeniden baslasaydi eski surumle cakisip atlanirdi.
  const gezinmeSurumuRef = useRef(0);
  const capGoster = useCallback((cap: string) => {
    const sonraki = sonrakiParca(capKimlikleri(cap), gezinme && gezinme.cap === cap ? gezinme.parca : null);
    if (sonraki === null) return;
    gezinmeSurumuRef.current += 1;
    setGezinme({ cap, parca: sonraki, surum: gezinmeSurumuRef.current });
  }, [capKimlikleri, gezinme]);
  // Parcalama degisti (yeniden ayirma, ayirmanin geri alinmasi): numaralar
  // yeni parcalamada baska parcalari gosterir — gezinme sifirlanir.
  const parcalamaSurumu = seciliHesap?.computedAt ?? null;
  useEffect(() => {
    setGezinme(null);
  }, [parcalamaSurumu]);

  // ── Tiklamalar ───────────────────────────────────────────────────────────
  /** Boru layer'i secimi. Secilen layer gizli ya da soluksa GORUNUR yapilir:
   *  yoksa Adim 2'de parcalari cizilmez ve tiklanamaz (25.09 inceleme —
   *  "Yalnız boruyu göster" sonrasi "Değiştir" ile baska layer secmek). */
  const layerSec = useCallback((ad: string | null) => {
    if (ad && hiddenSet.has(ad)) toggleLayerVisibility(ad);
    if (ad && dimmedSet.has(ad)) toggleLayerDimmed(ad);
    secLayer(ad);
  }, [secLayer, hiddenSet, dimmedSet, toggleLayerVisibility, toggleLayerDimmed]);
  /** Secili boru layer'i gizlenemez / soluklastirilamaz (Adim 2 kilitlenirdi);
   *  gorunur yapmak (geri acmak) her zaman serbest. */
  const gizleDegistir = useCallback((ad: string) => {
    if (ad === secili && !hiddenSet.has(ad)) return;
    toggleLayerVisibility(ad);
  }, [secili, hiddenSet, toggleLayerVisibility]);
  const soluklastirDegistir = useCallback((ad: string) => {
    if (ad === secili && !dimmedSet.has(ad)) return;
    toggleLayerDimmed(ad);
  }, [secili, dimmedSet, toggleLayerDimmed]);

  const sembolTiklandi = (ad: string) => {
    if (adim.adim2Acik) return;
    layerSec(ad);
  };

  const parcaTiklandi = (seg: EdgeSegment) => {
    // Baska bir hesaplanmis layer'in parcasi (yalniz Adim 1'de tiklanabilir): o layer'a gec.
    if (seg.layer !== secili || !seciliHesap) {
      layerSec(seg.layer);
      return;
    }
    // `seciliHesap.computedAt`: kullanicinin GORDUGU parcalamanin surumu — tik
    // yeni bir parcalamaya yeniden oynatilirsa indirgeyici reddeder.
    if (silgi) {
      if (isUnassignedDiameter(seg.diameter)) return;
      capAta(seg.layer, [seg.segment_id], '', seciliHesap.computedAt);
      setTagFlash({ layer: seg.layer, segmentId: seg.segment_id, color: CAPSIZ_RENGI, at: Date.now() });
      return;
    }
    // Kalem yokken tiklama capi DEGISTIRMEZ: viewer bilgi kutusunu sabitler.
    if (!aktifKalem) return;
    // TOGGLE (UX #2): ayni capa tekrar tik capi kaldirir; farkli/bos ise yazar.
    const ayni = !isUnassignedDiameter(seg.diameter) && canonicalizeDiameter(seg.diameter) === aktifCap;
    capAta(seg.layer, [seg.segment_id], ayni ? '' : aktifKalem.diameter, seciliHesap.computedAt);
    setTagFlash({
      layer: seg.layer,
      segmentId: seg.segment_id,
      color: ayni ? CAPSIZ_RENGI : diameterToColor(aktifKalem.diameter),
      at: Date.now(),
    });
  };

  // ── Parcalara ayirma / yeniden ayirma ───────────────────────────────────
  /** Motorun su an uyguladigi yontem — ipucu ve Adim 1 "Hatlar çıkarılıyor…" /
   *  "Parçalara ayrılıyor…" metnini buna gore yazar. */
  const [ayrilanYontem, setAyrilanYontem] = useState<'t' | 'none'>('t');
  const ayir = () => {
    if (!secili || calculatingLayer) return;
    kalemiBirak();
    setSilgi(false);
    setAyrilanYontem(yontem);
    void calculateLayer(secili, { splitMode: yontem, scale, sprinklerLayers: state.sprinklerLayers });
  };

  /** Bayat layer'lari SIRAYLA yeniden ayirir; etiketler aktarilir. "Bölmeden"
   *  layer'da birim degisimi motora gitmez — yerelde olceklenir. Birden cok
   *  layer bir OTURUMDUR: bildirimleri tek ozette toplanir (kayiplar adiyla). */
  const yenidenAyir = useCallback(async (layerlar: string[]) => {
    if (layerlar.length === 0) return;
    kalemiBirak();
    setSilgi(false);
    oturumSayaciRef.current += 1;
    const oturum = layerlar.length > 1 ? oturumSayaciRef.current : undefined;
    oturumRef.current = oturum;
    setYenidenAyirma({ sira: 0, toplam: layerlar.length });
    try {
      for (let i = 0; i < layerlar.length; i++) {
        if (iptalRef.current) break;
        const cl = stateRef.current.calculatedLayers[layerlar[i]];
        if (!cl) continue;
        setYenidenAyirma({ sira: i + 1, toplam: layerlar.length });
        if (birimBayatMi(cl, scaleRef.current) && yerelOlceklenebilir(cl)) {
          olcekle(cl.layer, scaleRef.current, oturum);
          continue;
        }
        setAyrilanYontem(cl.splitMode ?? 't');
        // eslint-disable-next-line no-await-in-loop
        const tamam = await calculateLayer(cl.layer, {
          splitMode: cl.splitMode ?? 't',
          scale: scaleRef.current,
          sprinklerLayers: stateRef.current.sprinklerLayers,
          hatIsmi: cl.hatIsmi,
          materialType: cl.materialType,
        });
        if (!tamam) break;
      }
    } finally {
      oturumRef.current = undefined;
      if (!iptalRef.current) setYenidenAyirma(null);
    }
  }, [calculateLayer, kalemiBirak, olcekle]);

  // Birim penceresinde Kaydet → ust bilesen birimi degistirir → yeni birim
  // gelince bayat layer'lar sirayla yeniden ayrilir (pencere metni boyle vaat
  // ediyor: "hesaplanan layer'lar yeniden parçalara ayrılır").
  const birimSonrasiAyirRef = useRef(false);
  const birimKaydet = (yeni: number) => {
    setBirimAcik(false);
    if (!ayniOlcek(yeni, scale)) birimSonrasiAyirRef.current = true;
    onBirimDegistir?.(yeni);
  };
  useEffect(() => {
    if (!birimSonrasiAyirRef.current) return;
    birimSonrasiAyirRef.current = false;
    const bayat = Object.values(stateRef.current.calculatedLayers)
      .filter((cl) => birimBayatMi(cl, scale))
      .map((cl) => cl.layer);
    void yenidenAyir(bayat);
    // Yalniz birim degisimine tepki verilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // ── Onay / kaldirma / toplu atama ────────────────────────────────────────
  const onayEngel = onayEngeli({ hesap: seciliHesap, scale, ayriliyor: kilit });
  const metrajiOnayla = () => {
    if (!seciliHesap || onayEngel) return;
    onayla(seciliHesap.layer);
    kalemiBirak();
    setSilgi(false);
  };
  const onayiGeriAl = () => {
    if (!seciliHesap) return;
    onayiKaldir(seciliHesap.layer);
    enableDiameterColors();
  };
  const ayirmayiKaldir = async () => {
    if (!seciliHesap || kilit) return;
    const etiketli = seciliHesap.edgeSegments.filter((es) => !isUnassignedDiameter(es.diameter)).length;
    if (etiketli > 0) {
      const ok = await confirm({
        title: `“${seciliHesap.layer}” ayırması kaldırılsın mı?`,
        description:
          `${seciliHesap.edgeSegments.length} parça ve ${etiketli} çap etiketi kaldırılır. ` +
          'Araç çubuğundaki “Geri al” ile geri getirebilirsiniz; sayfayı kapatırsanız geri gelmez.',
        confirmText: 'Kaldır',
      });
      if (!ok) return;
    }
    hesabiKaldir(seciliHesap.layer);
    kalemiBirak();
    setSilgi(false);
  };
  const topluAta = () => {
    if (!seciliHesap || !aktifKalem) return;
    const idler = capsizParcalar(seciliHesap);
    if (idler.length > 0) capAta(seciliHesap.layer, idler, aktifKalem.diameter, seciliHesap.computedAt, true);
  };

  // ── Cap listesi eylemleri ────────────────────────────────────────────────
  const capSec = (s: CapSatiri) => {
    setSilgi(false);
    if (s.kalemId) {
      kalemSec(s.kalemId);
      return;
    }
    // Kalemi silinmis ama parcada duran cap: yeniden kalem olur (ve secilir).
    const r = kalemEkle(s.cap);
    if (!r.ok) toast({ title: 'Çap eklenemedi', description: r.reason, variant: 'destructive' });
  };
  const capEkle = () => {
    const metin = capSorgu.trim();
    if (!metin) return;
    const var_ = tumSatirlar.find((s) => s.cap === canonicalizeDiameter(metin));
    if (var_) {
      // Zaten listede: sec (secili ise kapatma).
      if (var_.cap !== aktifCap) capSec(var_);
      setCapSorgu('');
      return;
    }
    const r = kalemEkle(metin);
    if (!r.ok) {
      toast({ title: 'Çap eklenemedi', description: r.reason, variant: 'destructive' });
      return;
    }
    setSilgi(false);
    setCapSorgu('');
  };
  const silgiDegistir = () => {
    const acik = !silgi;
    setSilgi(acik);
    if (acik) kalemiBirak();
  };

  // ── Klavye: geri al / yinele + Esc zinciri ──────────────────────────────
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      // Onay kutusu acikken klavye ONA aittir (Esc/Enter onu kapatir).
      if (onayKutusuAcikMi(typeof document === 'undefined' ? null : document)) return;
      const k = kisayolEylemi(e);
      if (k) {
        // Yazi alaninda Ctrl+Z metnin kendi geri almasidir.
        if (yaziAlaniMi(e.target as HTMLElement | null)) return;
        e.preventDefault();
        if (kilit) return;
        if (k === 'geri') geriAl();
        else yinele();
        return;
      }
      // Esc yazi alaninda da calisir: "Katman ara"dan paneli kapatir, "Çap ara"dan
      // kalemi birakir (25.09 inceleme: kutuda odak varken Esc hicbir sey yapmiyordu).
      if (e.key !== 'Escape') return;
      // Her Esc bir kat geri gider; layer secimi Esc ile DUSMEZ ("Değiştir" var).
      if (birimAcik) setBirimAcik(false);
      else if (katmanlarAcik) setKatmanlarAcik(false);
      else if (silgi) setSilgi(false);
      else if (aktifKalem) kalemiBirak();
      else if (gezinme) setGezinme(null);
      else if (capsizOdak) setCapsizOdak(false);
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [kilit, birimAcik, katmanlarAcik, silgi, aktifKalem, gezinme, capsizOdak, geriAl, yinele, kalemiBirak]);

  // ── Fiyatlandirma (baslik dugmesi ile AYNI yuklem) ───────────────────────
  const fiyat = useMemo(
    () => fiyatlandirmaDurumu(Object.values(state.calculatedLayers), scale),
    [state.calculatedLayers, scale],
  );
  const fiyatlandirmayaGec = async () => {
    if (fiyat.hazir.length === 0) {
      toast({
        title: 'Onaylı layer yok',
        description: 'Önce en az bir layer’ın metrajını onaylayın.',
        variant: 'destructive',
      });
      return;
    }
    if (fiyat.bayatOnayli.length > 0) {
      const ok = await confirm({
        title: `${fiyat.bayatOnayli.length} layer'ın çizim birimi değişti — teklife GİRMEYECEK`,
        description:
          `${fiyat.bayatOnayli.map((l) => l.layer).join(', ')}. Bu layer'lar yeni birimle yeniden ayrılmadan ` +
          'fiyatlandırmaya alınmaz (uzunlukları eski birimle hesaplandı).',
        confirmText: 'Yine de devam et',
      });
      if (!ok) return;
    }
    const capsizOnayli = fiyat.hazir.reduce(
      (n, cl) => n + cl.edgeSegments.filter((es) => isUnassignedDiameter(es.diameter)).length,
      0,
    );
    if (capsizOnayli > 0) {
      const ok = await confirm({
        title: `${capsizOnayli} boru parçasının çapı atanmamış`,
        description: 'Çizimde turuncu görünüyor. Teklifte “Belirtilmemiş” olarak görünecek. Yine de devam edilsin mi?',
        confirmText: 'Devam et',
      });
      if (!ok) return;
    }
    // ONAYSIZ LAYER = TEKLIFE GIRMEYEN LAYER: kullanici revize edip yeniden
    // onaylamayi unutabilir; adiyla durdurulur.
    if (fiyat.onaysiz.length > 0) {
      const ok = await confirm({
        title: `${fiyat.onaysiz.length} layer onaylanmadı — teklife GİRMEYECEK`,
        description:
          `Onaysız: ${fiyat.onaysiz.map((l) => l.hatIsmi || l.layer).join(', ')}. Bu layer'lar fiyatlandırmaya ` +
          'dahil edilmez. Revize ettiyseniz önce metrajı yeniden onaylayın.',
        confirmText: 'Yine de devam et',
      });
      if (!ok) return;
    }

    // Onay kutulari beklerken durum degismis olabilir (motor sonucu geldi,
    // onay kalkti): teklif GUNCEL durumdan kurulur; kullanicinin onayladigi
    // kume degistiyse durulur (25.09 inceleme: bayat `fiyat` ile devam ediyordu).
    const guncel = fiyatlandirmaDurumu(Object.values(stateRef.current.calculatedLayers), scaleRef.current);
    const ayniKume = guncel.hazir.length === fiyat.hazir.length && guncel.hazir.every((cl, i) => cl === fiyat.hazir[i]);
    if (!ayniKume) {
      toast({
        title: 'Metraj değişti',
        description: 'Onay beklerken onaylı layer’lar değişti. Güncel durumu kontrol edip yeniden deneyin.',
        variant: 'destructive',
      });
      return;
    }

    // Grup bantlari kullanicinin ONAYLADIGI sirada (onay-revizyon.ts).
    const layers = onaySirasi(guncel.hazir);
    const finalMetraj: MetrajResult = {
      layers: layers.map((cl) => ({
        layer: cl.hatIsmi || cl.layer,
        length: cl.totalLength,
        line_count: cl.edgeSegments.length,
        hat_tipi: cl.hatIsmi || cl.layer,
        segments: cl.edgeSegments.map((es) => ({
          segment_id: es.segment_id,
          layer: cl.hatIsmi || cl.layer,
          length: es.length,
          line_count: 1,
          material_type: cl.materialType,
          diameter: es.diameter,
        })),
      })),
      total_length: layers.reduce((sum, cl) => sum + cl.totalLength, 0),
      total_layers: layers.length,
      warnings: [],
    };
    onApproved(finalMetraj, fileName);
    kalemiBirak();
    // PRD §5: kaydet sonrasi cap renkleri kalkar, layer'lar ACI rengine doner.
    restoreOriginalColors();
    setGezinme(null);
  };

  // ── Onceki calisma bandi ─────────────────────────────────────────────────
  const geriYuklemeBandi = restoredWork.layers > 0 && !geriYuklemeBandiKapali;
  const dosyayiSifirla = async () => {
    const silinecek = Object.keys(state.calculatedLayers).length;
    const ok = await confirm({
      title: 'Bu dosyanın kayıtlı çalışması silinsin mi?',
      description:
        `${silinecek} hesaplanmış layer (çap etiketleriyle birlikte) silinecek, çizim sıfırdan başlayacak. ` +
        'Bu işlemin geri dönüşü yoktur (kayıt yalnız bu tarayıcıda tutulur). Diğer projeleriniz etkilenmez.',
      confirmText: 'Sıfırla',
    });
    if (!ok) return;
    resetFileState();
    kalemiBirak();
    setGeriYuklemeBandiKapali(true);
    toast({ title: 'Sıfırlandı', description: `${fileName} — temiz başlangıç.` });
  };

  // ── Turetilmis gorunum verisi ────────────────────────────────────────────
  const calisilanlar: CalisilanLayer[] = useMemo(
    () => Object.values(state.calculatedLayers)
      .sort((a, b) => a.computedAt - b.computedAt)
      .map((cl) => ({
        ad: cl.layer,
        renk: layerRengi(cl.layer),
        parca: cl.edgeSegments.length,
        bolmeden: cl.splitMode === 'none',
        metre: cl.totalLength,
        capsiz: cl.edgeSegments.filter((es) => isUnassignedDiameter(es.diameter)).length,
        durum: birimBayatMi(cl, scale) ? 'bayat' : cl.approved ? 'onayli' : 'bekliyor',
      })),
    [state.calculatedLayers, scale, layerRengi],
  );
  const hesapDurumu = useMemo(() => {
    const m: Record<string, KatmanHesapDurumu> = {};
    for (const c of calisilanlar) m[c.ad] = c.durum === 'bayat' ? 'bayat' : c.durum === 'onayli' ? 'onayli' : 'hesaplandi';
    return m;
  }, [calisilanlar]);

  const ipucu = ipucuHesapla({
    adim,
    seciliLayer: secili,
    layerRengi: secili ? layerRengi(secili) : null,
    yontem,
    kalem: aktifKalem ? { cap: aktifCap ?? aktifKalem.diameter, renk: diameterToColor(aktifKalem.diameter) } : null,
    silgi,
    ayriliyor: calculatingLayer,
    ayrilanYontem,
  });
  const fiyatEngeli = fiyatlandirmaEngeli(fiyat, kilit);

  const sprinklerIpucu =
    seciliHesap && seciliHesap.splitMode !== 'none' && state.sprinklerLayers.length === 0
      ? seciliHesap.sprinklerAdaylari?.[0] ?? null
      : null;

  const birimTuruncu = !birimElle && !guvenilirMi(birimTespiti?.confidence);

  return (
    <div className="-m-4 flex flex-col gap-3 lg:h-[calc(100vh-84px)] lg:min-h-[620px]">
      <CalismaBasligi
        dosyaAdi={fileName}
        sayaclar={bilgi ? { layer: bilgi.katmanlar.length, cizgi: bilgi.cizgi, blok: bilgi.blok } : null}
        onayOzeti={calisilanlar.length > 0 ? { onayli: fiyat.hazir.length, toplam: calisilanlar.length } : null}
        birimKisa={birimKisa(scale)}
        birimDogrulanmali={birimTuruncu}
        birimAcik={birimAcik}
        onBirimTikla={() => setBirimAcik((v) => !v)}
        birimPenceresi={birimAcik ? (
          <BirimPenceresi
            scale={scale}
            tespit={birimTespiti}
            elle={birimElle}
            kilitli={kilit}
            dogrulanmali={birimTuruncu}
            onKapat={() => setBirimAcik(false)}
            onKaydet={birimKaydet}
          />
        ) : null}
        onYeniDwg={onReset}
        fiyatlandirmaEngeli={fiyatEngeli}
        onFiyatlandirmayaGec={fiyatlandirmayaGec}
      />

      {geriYuklemeBandi && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs text-[#92400e]">
          <span>
            <strong>Bu dosya daha önce yüklenmişti</strong> — önceki çalışmanız geri yüklendi:{' '}
            {restoredWork.layers} layer
            {restoredWork.approved > 0 && <> · {restoredWork.approved} onaylı</>}.
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={dosyayiSifirla}
              title="Bu dosyanın kayıtlı çalışmasını sil, sıfırdan başla (geri dönüşü yok)"
              className="rounded-md border border-[#fcd34d] bg-white px-2 py-1 text-[11px] font-semibold text-[#92400e] hover:bg-[#fef3c7]"
            >
              Bu dosyayı sıfırla
            </button>
            <button type="button" onClick={() => setGeriYuklemeBandiKapali(true)} className="text-[11px] font-semibold text-[#92400e] hover:underline">
              Tamam
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <section
          aria-label="Çizim"
          className="relative h-[62vh] min-h-[420px] min-w-0 flex-1 overflow-hidden rounded-xl bg-[#0b1220] lg:h-auto"
        >
          {/* Tuval kabi: viewer kendi kokunde `relative h-full w-full` —
              konum sinifi bu sarmalayicida (ayni ogede `relative` ile
              `absolute` carpisiyor, tuval 150 px'lik varsayilan boyda kaliyordu). */}
          <div className="absolute inset-0">
          <DxfCanvasViewer
            ref={viewerRef}
            fileId={fileId}
            calculatedEdgesByLayer={tumParcalar}
            calculatedJunctionsByLayer={seciliJunctions}
            selectedLayer={secili}
            sprinklerLayers={sprinklerSet}
            hiddenLayers={hiddenSet}
            dimmedLayers={dimmedSet}
            hamCizilenLayerlar={hamSet}
            soluklasanLayerlar={solukSet}
            capsizOdak={capsizOdak && adim.adim2Acik}
            kilitliLayer={adim.adim2Acik ? secili : null}
            etkilesimModu={adim.adim2Acik ? 'cap-ata' : 'layer-sec'}
            scale={scale}
            useDiameterColors={useDiameterColors}
            activeTagColor={silgi ? CAPSIZ_RENGI : aktifKalem ? diameterToColor(aktifKalem.diameter) : null}
            flashSegment={tagFlash}
            focusedSegment={odakParca ? { layer: odakParca.layer, segmentId: odakParca.segment_id } : null}
            focusedHaloColor={gezinme ? (gezinme.cap === '' ? CAPSIZ_RENGI : diameterToColor(gezinme.cap)) : null}
            focusVersion={gezinme?.surum ?? 0}
            onLineClick={(l) => {
              // Shift+tik: layer'i gizle (Adim 1). Adim 2'de baska layer'a gecilmez.
              if (l.shiftKey) {
                gizleDegistir(l.layer);
                return;
              }
              sembolTiklandi(l.layer);
            }}
            onInsertClick={(i) => sembolTiklandi(i.layer)}
            onCircleClick={(c) => sembolTiklandi(c.layer)}
            onSegmentClick={parcaTiklandi}
            onGeometriBilgisi={setBilgi}
          />
          </div>
          {/* Ust katman: arac cubugu + ipucu hapi TEK satir (sigmazsa hap alta
              iner — ust uste binmez), altinda Katmanlar paneli. 25.09 inceleme:
              hap sabit 372 px payla arac cubugunun ustune biniyordu. */}
          <div className="pointer-events-none absolute inset-x-3.5 bottom-11 top-3.5 z-20 flex flex-col items-start gap-2">
            <div className="flex w-full flex-wrap items-start justify-between gap-2">
              <CizimAracCubugu
                katmanlarAcik={katmanlarAcik}
                gizliSayisi={state.hiddenLayers.length}
                onKatmanlar={() => setKatmanlarAcik((v) => !v)}
                onYakinlas={() => viewerRef.current?.zoomIn()}
                onUzaklas={() => viewerRef.current?.zoomOut()}
                onSigdir={() => viewerRef.current?.fitView()}
                silgiGoster={adim.adim2Acik}
                silgiAcik={silgi}
                onSilgi={silgiDegistir}
                geriEtiketi={geriEtiketi}
                ileriEtiketi={ileriEtiketi}
                gecmisKilitli={kilit}
                onGeriAl={geriAl}
                onYinele={yinele}
              />
              <IpucuHapi ipucu={ipucu} />
            </div>
            {katmanlarAcik && (
              <KatmanlarPaneli
                katmanlar={bilgi?.katmanlar ?? []}
                gizliler={hiddenSet}
                solukler={dimmedSet}
                sprinklerlar={sprinklerSet}
                seciliLayer={secili}
                hesapDurumu={hesapDurumu}
                onKapat={() => setKatmanlarAcik(false)}
                onGizle={gizleDegistir}
                onSoluklastir={soluklastirDegistir}
                onSprinkler={toggleSprinklerLayer}
                onSec={(ad) => {
                  layerSec(ad);
                  setKatmanlarAcik(false);
                }}
                onTumunuGoster={tumunuGoster}
                onYalnizBoru={() => {
                  if (secili) yalnizGoster(secili, (bilgi?.katmanlar ?? []).map((k) => k.ad));
                }}
              />
            )}
          </div>
          {adim.adim2Acik && <CizimLejanti />}
          <DurumBildirimi
            bildirim={bildirim}
            panelAcik={katmanlarAcik}
            geriAlinabilir={!!bildirim && !kilit && islemTepedeMi(bildirim.id)}
            onGeriAl={() => {
              geriAl();
              setBildirim(null);
            }}
            onKapan={bildirimKapat}
          />
        </section>

        <aside
          aria-label="Metraj adımları"
          className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-[#e5e7eb] bg-white lg:w-[392px]"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Adim1BoruLayer
              durum={adim.adim1}
              seciliLayer={secili}
              layerRengi={layerRengi(secili)}
              layerCizgi={secili ? katmanRenk.get(secili)?.cizgi ?? null : null}
              hesap={seciliHesap}
              adaylar={adaylar}
              katmanSayisi={bilgi?.katmanlar.length ?? 0}
              calisilanlar={calisilanlar}
              yontem={yontem}
              onYontem={setYontem}
              ayrilanLayer={calculatingLayer}
              ayrilanYontem={ayrilanYontem}
              birimBayat={adim.birimBayat}
              sprinklerBayat={adim.sprinklerBayat}
              yenidenAyirma={yenidenAyirma}
              onSec={(ad) => layerSec(ad)}
              onDegistir={() => layerSec(null)}
              onKatmanlariAc={() => setKatmanlarAcik(true)}
              onAyir={ayir}
              onAyirmayiKaldir={ayirmayiKaldir}
              onYenidenAyir={() => { if (secili) void yenidenAyir([secili]); }}
            />
            <Adim2CapAta
              acik={adim.adim2Acik}
              ilerleme={ilerleme}
              gruplar={gruplar}
              sorgu={capSorgu}
              onSorgu={setCapSorgu}
              aktifCap={aktifCap}
              capsizOdak={capsizOdak}
              onCapsizOdak={() => setCapsizOdak((v) => !v)}
              onCapSec={capSec}
              onEkle={capEkle}
              onKalemSil={kalemSil}
              onGoster={capGoster}
              gosterilen={gezinme && gezinmeYeri ? { cap: gezinme.cap, sira: gezinmeYeri.sira, toplam: gezinmeYeri.toplam } : null}
              onTopluAta={topluAta}
              sprinklerIpucu={sprinklerIpucu}
              onKatmanlariAc={() => setKatmanlarAcik(true)}
              onayli={adim.adim3 === 'onayli' || adim.adim3 === 'onayli-bayat'}
            />
          </div>
          <Adim3Onay
            durum={adim.adim3}
            layer={secili}
            toplamMetre={seciliHesap?.totalLength ?? 0}
            capsiz={ilerleme.capsiz}
            engel={adim.adim3 === 'onayla' ? onayEngel : null}
            ayriliyor={kilit}
            onOnayla={metrajiOnayla}
            onOnayiKaldir={onayiGeriAl}
            onYenidenAyir={() => { if (secili) void yenidenAyir([secili]); }}
          />
        </aside>
      </div>
    </div>
  );
}
