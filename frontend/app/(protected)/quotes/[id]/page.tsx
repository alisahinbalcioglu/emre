'use client';

// Cloudflare Pages icin Edge Runtime (dynamic route)
export const runtime = 'edge';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, Languages, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/ortak/ui/button';
import { GeriButonu } from '@/ortak/ui/geri-butonu';
import { Card } from '@/ortak/ui/card';
import api from '@/ortak/lib/api';
import { toast } from '@/ortak/hooks/use-toast';
import { cn } from '@/ortak/lib/utils';
import { ceviriAnahtari, cevrilmisSatirVarMi, ingilizceGorunum, kayittaKaynakDuruyorMu, satirKaynagi, turkceGorunum, type CeviriHaritasi } from '@/ozellik/teklif/ceviri';
import { duzeltmeHataMetni, duzeltmeKaldir, duzeltmeKaydet, duzeltmeleriGetir, type DuzeltmeGorunumu } from '@/ozellik/teklif/ceviri-duzeltme';
import { CeviriDuzeltmeDialog, type CeviriDuzeltmeHedefi } from '@/ozellik/teklif/CeviriDuzeltmeDialog';
import { teklifCevirisiAl, teklifGorunumuAl, teklifIngilizcesiniAl, type IngilizceSonucu } from '@/ozellik/teklif/ceviri-akisi';
import { bosSonucBildirimi, goruntulemeBildirimi, sonucBildirimi } from '@/ozellik/teklif/ceviri-kota';
import { acilisKarari, goruntulemeGerekirMi, type DilNotu } from '@/ozellik/teklif/teklif-dil-karari';
import { confirm } from '@/ortak/hooks/use-confirm';
import { TASLAK_ANAHTARI, kayittanTaslak } from '@/ozellik/teklif/taslak';
import { teklifCiktisiniIndir, fiyatliExceliIndir } from '@/ozellik/cikti/export-download';
import { ExcelGrid } from '@/ozellik/tablo/excel-grid/ExcelGrid';
import { SheetTabs } from '@/ozellik/tablo/excel-grid/SheetTabs';
import type { ExcelGridData } from '@/ozellik/tablo/excel-grid/types';
import { useCurrency, paraSimgesi } from '@/ozellik/fiyat/use-currency';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { adDisiplinTahmini } from '@/ozellik/tablo/disiplin';
import type { Currency, LaborFirm } from '@/ortak/types/quotes';
import type { Brand } from '@/ortak/types';
import { TEKLIF_DURUMLARI, teklifDurumGorunumu } from '@/ozellik/teklif/durum';
import { useKirintiEtiketi } from '@/ortak/kabuk/components/layout/kirinti-etiketi';

interface QuoteDetail {
  id: string;
  title: string;
  createdAt: string;
  /** Teklif numarasi (MP-YYYY-NNN). ILK Excel aktariminda atanir, sonra sabit
   *  (backend `quotes.service.ts` exportXlsx) — hic aktarilmamis teklifte null. */
  quoteNo?: string | null;
  user: { email: string };
  sheets?: any[];
  items: any[];
  displayCurrency?: string;
  /** Teklifin KAYITLI dili — 'en' ise acilista gorunum sunucuya sorulur
   *  (odenmis ceviri varsa Ingilizce acilir; bkz. teklif-dil-karari.ts). */
  displayLanguage?: string;
}

/**
 * SALT-OKUNUR MARKA GERI CAGIRIMI — modul duzeyinde SABIT.
 *
 * ⚠ t.14 (21.09, performans): burada satir ici `async () => null` vardi ve
 * ExcelGrid'in 658 satirlik `columnDefs` memo'sunun bagimliligidir. Her
 * render'da yeni bir fonksiyon kimligi uretildigi icin memo hicbir zaman
 * tutmuyordu. Bu sayfa zaten salt-okunur (gercek duzenleme Duzenle ekraninda),
 * yani geri cagirimin KAPANISA ihtiyaci yok — modul duzeyine cikarilabilir.
 */
const SALT_OKUNUR_MARKA = async (): Promise<null> => null;

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  // C4 (Bölüm D adım 3): marka SEÇİMİ de yeniden açılışta görünmeli. Kayıtta
  // `_marka` yalnız marka KİMLİĞİ'dir; etiketi çözecek liste bu sayfada hiç
  // yüklenmiyordu (`brands={[]}`) → fiyatı yazılmış her satır "Marka sec..."
  // gösteriyordu, kullanıcı "seçimlerim gitmiş" olarak yaşıyordu. Kaynak
  // Düzenle ekranıyla AYNI: /library/brands (Kütüphanem izolasyonu).
  const [allBrands, setAllBrands] = useState<Brand[]>([]);
  // C4'UN FIRMA IKIZI (ikizi unutma dersi): `_firma` da yalniz firma KIMLIGI'dir.
  // laborFirms gecilmeyince kayitli iscilik firmasi "Firma sec..." gorunuyordu —
  // marka tarafinda yasanan "secimlerim gitmis" algisinin birebir tekrari.
  const [laborFirms, setLaborFirms] = useState<LaborFirm[]>([]);

  // SORUN 16 (KH8/KH9): goruntuleme para birimi — teklifte KAYITLI birimle
  // acilir; toggle degisince kalici yazilir. Cevrim yalniz GORUNTULEME
  // (kutuphane fiyatlari orijinal biriminde kalir), canli TCMB kuru.
  const { currency, gosterimCurrency, setCurrency, exchangeRates, ratesLoaded, conversionRate } = useCurrency();
  // KH10: Pro entitlement DUZENLE ekraniyla AYNI kaynaktan (/auth/me)
  const { capabilities } = useCapabilities();

  useEffect(() => {
    api.get<QuoteDetail>(`/quotes/${id}`)
      .then(({ data }) => {
        setQuote(data);
        if (data.displayCurrency === 'USD' || data.displayCurrency === 'EUR') {
          setCurrency(data.displayCurrency as Currency);
        }
        // FAZ 6.11 (15.09) — BAKMAK ≠ CEVIRMEK. Kayit Ingilizce ya da kayitta
        // cevrilmis satir varsa gorunum SUNUCUYA sorulur: bu icerigin cevirisi
        // odenmisse harita kotasiz ve yeteneksiz gelir (odemesi durmus firma da
        // gorur). Karar saf modulde (`teklif-dil-karari.ts`, vitest'li).
        // ⚠ KAYIT YERINDE DEGISMEZ ve acilista otomatik Turkceye ONARIM YOKTUR:
        // eskiden odenmemis Ingilizce teklif sessizce Turkceye cevrilip kaydin
        // dili 'tr' diye yaziliyordu (6.11 curutucusu). Isaret denetimi bos
        // dizgeyi isaret saymaz (`cevrilmisSatirVarMi` — sunucuyla ayni).
        const isaretliSatirVar = cevrilmisSatirVarMi(data.sheets);
        if (goruntulemeGerekirMi(data.displayLanguage, isaretliSatirVar)) {
          setGorunumYukleniyor(true);
          teklifGorunumuAl(id, { get: (url, ayar) => api.get(url, ayar) })
            .then((g) => {
              const karar = acilisKarari({
                displayLanguage: data.displayLanguage,
                isaretliSatirVar,
                yanit: 'yanit' in g ? g.yanit : null,
                hata: 'hata' in g,
              });
              setCeviriDili(karar.dil);
              setGorunumHaritasi(karar.harita);
              setDilNotu(karar.not);
              setCeviriSurumu((n) => n + 1);
              if (karar.dilOnar) dilKaydet('en');
            })
            .finally(() => setGorunumYukleniyor(false));
        }
        // Ilk non-empty sheet'i aktif yap
        if (Array.isArray(data.sheets)) {
          const firstNonEmpty = data.sheets.findIndex((s: any) => !s.isEmpty);
          if (firstNonEmpty >= 0) setActiveSheetIndex(firstNonEmpty);
        }
      })
      .catch(() => setError('Teklif yüklenirken hata oluştu.'))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Marka etiketleri icin kutuphane markalari (yukaridaki C4 notu)
  useEffect(() => {
    api.get<Brand[]>('/library/brands')
      .then(({ data }) => setAllBrands(data ?? []))
      .catch(() => { /* etiket cozulemezse gorunum yine calisir */ });
  }, []);

  // Iscilik firma etiketleri — C4'un firma ikizi (yukaridaki not)
  useEffect(() => {
    api.get<LaborFirm[]>('/labor-firms')
      .then(({ data }) => setLaborFirms(data ?? []))
      .catch(() => { /* etiket cozulemezse fiyatlar yine dogru gorunur */ });
  }, []);

  // ── CEVIRI (13.08 · Faz 6.10/6.11 15.09) — KAYITLI TEKLIFTE DIL SECICI ─────
  // ⚠ BU SAYFA SALT-OKUNUR ve KAYDI DEGISTIRMEZ: ekran kayittan turetilen
  // GORUNUMU cizer (`ingilizceGorunum` / `turkceGorunum`). Harita yalniz
  // odenmis icerik icin sunucudan gelir (`GET /ai/translate/goruntule` ya da
  // ceviri istegi). Indirilen dosya da SUNUCUDA ayni satir kuraliyla uretilir
  // (`disaAktarimPlani`): ekran = dosya. Ingilizce dosya ancak teklifin guncel
  // hali tam cevrilmisse iner; degilse indirme gerekceli mesajla durur.
  const [ceviriDili, setCeviriDili] = useState<'tr' | 'en'>('tr');
  const [ceviriYukleniyor, setCeviriYukleniyor] = useState(false);
  /** Odenmis icerigin haritasi — yalniz sunucu verdiyse (odenmis + tam). */
  const [gorunumHaritasi, setGorunumHaritasi] = useState<CeviriHaritasi | null>(null);
  /** Acilis karari notu (neden / eksik / yuklenemedi). */
  const [dilNotu, setDilNotu] = useState<DilNotu | null>(null);
  /** Acilis goruntuleme istegi suruyor: ceviri ve iki cikti dugmesi KAPALI
   *  (yanit gelmeden basilan indirme yanlis dille giderdi). */
  const [gorunumYukleniyor, setGorunumYukleniyor] = useState(false);

  // ── FIRMA CEVIRI DUZELTMESI (Faz 6.9) ────────────────────────────────
  // Kalem isareti YALNIZ Ingilizce gorunumde ve SUNUCUNUN verdigi anahtar
  // kumesindeki satirlarda cizilir (K-T2): Turkce kalmis ve aynen donmus
  // satirlar dahil, dokunulmaz (olcu/kod) satirlar haric — kural istemciye
  // TASINMAZ, kume sunucudan gelir.
  const [duzeltmeGorunumu, setDuzeltmeGorunumu] = useState<DuzeltmeGorunumu | null>(null);
  const [duzeltmeHedefi, setDuzeltmeHedefi] = useState<CeviriDuzeltmeHedefi | null>(null);

  const duzeltmeleriTazele = async () => {
    try {
      setDuzeltmeGorunumu(await duzeltmeleriGetir(id, { get: (url, ayar) => api.get(url, ayar) }));
    } catch {
      setDuzeltmeGorunumu(null); // isaret cizilmez; teklif gorunumu etkilenmez
    }
  };

  useEffect(() => {
    if (ceviriDili !== 'en' || duzeltmeGorunumu) return;
    void duzeltmeleriTazele();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceviriDili, id]);

  // ── FAZ 4.5 · TEKLİF BİLGİLERİ (kapak alanları) ──────────────────────
  // ⚠ NEDEN BURADA: bu dört alan şemada, `PATCH :id/info` ucunda ve export
  // motorunun yer tutucularında ({{MUSTERI}} {{PROJE}} {{HAZIRLAYAN}}
  // {{GECERLILIK}}) ZATEN vardı — ama 06.08'de (`d0dc27d`) oluşturma
  // ekranından kaldırılıp "detay sayfasından girilir" denmiş, o ekran ise
  // hiç yazılmamıştı. Sonuç ölçüldü: canlıdaki 10 teklifin 10'unda `musteri`
  // NULL. Yani kapak sayfası ürünün içinde vardı ama doldurulamıyordu.
  //
  // Kaydetme ODAK ÇIKIŞINDA (blur): her tuşta PATCH atmak gereksiz; kısmi
  // PATCH olduğu için gönderilmeyen alanlara DOKUNULMAZ (para birimi
  // seçicisiyle aynı sözleşme).
  const [kapak, setKapak] = useState({
    musteri: '', proje: '', hazirlayan: '', gecerlilik: '',
  });
  const [durum, setDurum] = useState<string>('HAZIRLANIYOR');
  const [kapakDurumu, setKapakDurumu] = useState<null | 'kaydediliyor' | 'kaydedildi'>(null);

  // Kayıttan gelen değerleri forma taşı. `quote` değişince çalışır.
  useEffect(() => {
    if (!quote) return;
    setKapak({
      musteri: (quote as any).musteri ?? '',
      proje: (quote as any).proje ?? '',
      hazirlayan: (quote as any).hazirlayan ?? '',
      gecerlilik: (quote as any).gecerlilik ?? '',
    });
    setDurum((quote as any).durum ?? 'HAZIRLANIYOR');
  }, [quote]);

  async function kapakKaydet(yama: Record<string, string>) {
    setKapakDurumu('kaydediliyor');
    try {
      await api.patch(`/quotes/${id}/info`, yama);
      setKapakDurumu('kaydedildi');
      setTimeout(() => setKapakDurumu(null), 1800);
    } catch (e: any) {
      setKapakDurumu(null);
      toast({
        title: 'Kaydedilemedi',
        description: e?.response?.data?.message || 'Teklif bilgisi kaydedilemedi.',
        variant: 'destructive',
      });
    }
  }
  // Gorunum degisince grid yeniden monte edilir (sheet degisiminde kullanilan
  // `key` deseninin aynisi) — AG-Grid ayni satir nesnelerini gorup cizmeyebilir.
  const [ceviriSurumu, setCeviriSurumu] = useState(0);

  /** Ekranda gorunen sayfalar — kayittan TURETILIR, kayit degismez (Faz 6.11). */
  const gorunenSayfalar = useMemo(() => {
    const kayit: any[] = Array.isArray(quote?.sheets) ? quote!.sheets! : [];
    return ceviriDili === 'en' ? ingilizceGorunum(kayit, gorunumHaritasi ?? {}).sayfalar : turkceGorunum(kayit);
  }, [quote, ceviriDili, gorunumHaritasi]);

  // ── t.8 (21.09): KIRINTI YOLUNDA HAM UUID YOK ─────────────────────────────
  // "Teklifler › 84597204-70f0-…" yerine teklif numarasi; numara YOKSA teklif
  // basligi. Numara ancak ILK Excel aktariminda atandigi icin (backend
  // exportXlsx) hic aktarilmamis tekliflerde bos olur — geriye donuk numara
  // VERILMEZ, gosterim basliga duser. Adres cubugundaki kimlik DEGISMEZ.
  useKirintiEtiketi(id, quote ? (quote.quoteNo?.trim() || quote.title) : null);

  // ── t.14 (21.09, performans) — IZGARA GIRDISI RENDER GOVDESINDE KURULMAZ ──
  // Olculdu: `sheets`, `hiddenFields` ve `gridData` render govdesinde (eski
  // :416-439) kuruluyordu, yani HER render yeni nesne. `gridData` ExcelGrid'in
  // 658 satirlik `columnDefs` memo'sunun bagimliligi oldugu icin o memo her
  // render'da bastan kosuyor ve AG Grid tum kolonlari yeniden uyguluyordu
  // (kolon genisligi, hucre stilleri, cizerler). Nesneler artik girdileri
  // degismedikce AYNI kimlikte kalir.
  const sheets = useMemo(
    () => gorunenSayfalar.filter((s: any) => !s.isEmpty),
    [gorunenSayfalar],
  );
  const activeSheet = sheets[activeSheetIndex] ?? sheets[0];

  const gridData: ExcelGridData | null = useMemo(() => {
    if (!activeSheet) return null;
    // Kayitta saklanan gizli-sutun tercihi (PRD v3.0 Part A) detayda da uygulanir.
    const hiddenFields = new Set<string>(activeSheet.columnConfig?.hidden ?? []);
    // GS8: kullanicinin kaydettigi kolon genislikleri detayda da uygulanir
    const kayitliGenislikler: Record<string, number> = activeSheet.columnConfig?.widths ?? {};
    return {
      columnDefs: (activeSheet.columnDefs ?? []).map((c: any) => {
        const g = kayitliGenislikler[c.field];
        const temel = g ? { ...c, width: g } : c;
        // Faz 6.11 (K-T3): detayda ad hucresi DUZENLENEMEZ — kaydedilmeyen
        // hucre-ici duzenleme gorunumle ve kalici sozlukle karismasin.
        const kilitli = c.field === activeSheet.columnRoles?.nameField ? { ...temel, editable: false } : temel;
        return hiddenFields.has(c.field) ? { ...kilitli, hide: true } : kilitli;
      }),
      rowData: activeSheet.rowData ?? [],
      columnRoles: activeSheet.columnRoles ?? {},
      brands: allBrands,
      headerEndRow: activeSheet.headerEndRow ?? 0,
    };
  }, [activeSheet, allBrands]);

  /**
   * REVIZE ET (14.08) — kayitli teklifi Duzenle ekraninda acar.
   *
   * ── NEDEN BU YOL ────────────────────────────────────────────────────────────
   * Kullanici bildirimi: "teklifi revize etmek istiyorum ancak bu kisimda
   * herhangi bir islem yapilamiyor (fiyat eslestirme vs)". Olculdu ve dogruydu:
   * bu sayfa SALT-OKUNUR (marka geri cagirimi hicbir sey yapmaz) ama marka
   * secicileri GORUNUR ve tiklanabilir duruyordu — ustelik ust bantta "N satir
   * secim bekliyor" yaziyordu. Yani ekran kullaniciyi islem yapmaya CAGIRIYOR,
   * arkasinda hicbir sey yoktu. Duzenle ekrani da kayitli bir teklifi ID ile
   * acamiyordu (URL parametresi HIC okumuyor) — revizyon yolu KURULMAMISTI.
   *
   * Cozum ikinci bir duzenleme ekrani ACMAZ: kayit, Duzenle ekraninin ZATEN
   * kullandigi taslak sozlesmesine cevrilir (`kayittanTaslak`) ve oraya
   * yonlendirilir. Boylece eslestirme, surukle-doldur, kar girisi ve kayit
   * akisinin TAMAMI tek yerde kalir; ikinci bir ikiz bakim yuku dogmaz.
   * Taslaktaki `quoteId` sayesinde "Teklifi Kaydet" YENI kopya acmaz, BU
   * teklifi gunceller.
   *
   * ⚠ Marka listesi taslaga KONUR (`allBrands`): Duzenle ekrani marka
   * ETIKETLERINI bu listeden cozer. Bos gecilse kullanici kendi sectigi
   * markalari "Marka sec..." olarak gorur ve secimlerinin gittigini sanir —
   * C4 kusurunun (11.08) birebir tekrari olurdu.
   */
  const revizeEt = () => {
    if (!quote) return;
    try {
      // Ekrandaki gorunum (Ingilizce ise isaretleriyle) Duzenle'ye tasinir — acik ve kasitli.
      sessionStorage.setItem(TASLAK_ANAHTARI, JSON.stringify(kayittanTaslak({ ...quote, sheets: gorunenSayfalar }, allBrands)));
    } catch (e) {
      // Kota asimi: SESSIZ GECMEK YASAK — kullanici Duzenle'ye gidip bos ya da
      // BAYAT bir ekran gorurdu (eski taslak ayakta kalirsa daha kotusu: baska
      // bir teklifi revize ettigini sanir).
      sessionStorage.removeItem(TASLAK_ANAHTARI);
      toast({
        title: 'Düzenlemeye geçilemedi',
        description: 'Teklif tarayıcı belleğine sığmadı. Sekmeleri kapatıp tekrar deneyin.',
        variant: 'destructive',
      });
      return;
    }
    router.push('/quotes/new');
  };

  /** Dil secimini teklifle KAYDEDER — para birimi toggle'inin birebir ikizi
   *  (`birimSec`). Kismi PATCH: kapak alanlarina dokunmaz. Sessiz denenir;
   *  basarisiz olursa ekrandaki dil yine dogru calisir. */
  const dilKaydet = (d: 'tr' | 'en') => {
    api.patch(`/quotes/${id}/info`, { displayLanguage: d }).catch(() => { /* goruntuleme etkilenmez */ });
  };

  // Faz 6.2: istemci METIN LISTESI gondermez. Sunucu kayitli teklifi okur,
  // cevrilecekleri ve kotadan dusecek satiri kendisi hesaplar; once
  // onizleme gosterilir, onaydan sonra cevrilir.
  const cevirmeBagimliliklari = {
    get: (url: string, ayar: { params: Record<string, string> }) => api.get(url, ayar),
    post: (url: string, govde: Record<string, unknown>) => api.post(url, govde),
    onay: confirm,
    bildir: toast,
    yukleniyor: setCeviriYukleniyor,
  };

  /** Ingilizce gorunumu kayittan turetip acar — KAYIT DEGISMEZ. */
  const ingilizceyiAc = (r: IngilizceSonucu) => {
    const kayit: any[] = Array.isArray(quote?.sheets) ? quote!.sheets! : [];
    const { yazilan } = ingilizceGorunum(kayit, r.harita);

    // ⚠ TEK HUCRE BILE DEGISMEDIYSE BU BASARI DEGILDIR. 13.08 canli olcumu:
    // API anahtari gecersizdi, sunucu bos harita dondu, ekran "Ceviri
    // tamamlandi" dedi ve dugme "Turkceye Don"e gecti — hicbir sey
    // cevrilmemisken kullanici ozelligin CALISTIGINI sandi. Kotadan satir
    // dustuyse mesaj bunu da soyler (14.09 incelemesi O3). Kayitta Ingilizce
    // kaydedilmis satir varsa (E) gorunum yine Ingilizcedir.
    if (r.tur === 'ceviri' && yazilan === 0 && !cevrilmisSatirVarMi(kayit)) {
      const sonuc = r.sonuc;
      const bos = bosSonucBildirimi(sonuc);
      toast({ title: bos.baslik, description: bos.aciklama, variant: 'destructive' });
      return;
    }

    setGorunumHaritasi(r.harita);
    setCeviriDili('en');
    setDilNotu(null);
    setCeviriSurumu((n) => n + 1);
    dilKaydet('en');
    const b = r.tur === 'ceviri' ? sonucBildirimi(r.sonuc, yazilan) : goruntulemeBildirimi(r.yanit, yazilan);
    toast({ title: b.baslik, description: b.aciklama, variant: b.hata ? 'destructive' : undefined });
  };

  /** Kayittan gelen (gorunum kopyasi DEGIL) satirlarda anahtar → kalem kurallari.
   *
   *  ⚠ t.14 (21.09, performans): bu nesne render govdesinde kuruluyordu, yani
   *  HER render yeni kimlik. ExcelGrid onu bir etkinin bagimliligi olarak
   *  okuyor ve `refreshCells({ force: true })` ile AD KOLONUNU zorla yeniden
   *  ciziyordu — kalem gorunurlugu hic degismemis olsa bile. Girdileri
   *  degismedikce kimlik artik sabit. */
  const ceviriKalemi = useMemo(() => (
    ceviriDili === 'en' && duzeltmeGorunumu?.duzeltmeAcik
      ? {
          goster: (row: any) => {
            const adAlan = activeSheet?.columnRoles?.nameField;
            if (!adAlan || !row?._isDataRow) return false;
            return duzeltmeGorunumu.anahtarlar.has(ceviriAnahtari(satirKaynagi(row, adAlan)));
          },
          ac: (row: any) => {
            const adAlan = activeSheet?.columnRoles?.nameField;
            if (!adAlan) return;
            const kaynak = ceviriAnahtari(satirKaynagi(row, adAlan));
            setDuzeltmeHedefi({
              kaynak,
              gorunen: String(row[adAlan] ?? ''),
              mevcut: duzeltmeGorunumu.duzeltmeler.get(kaynak) ?? null,
            });
          },
        }
      : undefined
  ), [ceviriDili, duzeltmeGorunumu, activeSheet]);

  /** Kayit/kaldirma sonrasi: gorunum haritasi ve firma sozlugu yeniden okunur. */
  const duzeltmeSonrasi = async (kaynak: string) => {
    const g = await teklifGorunumuAl(id, { get: (url, ayar) => api.get(url, ayar) });
    if ('yanit' in g && g.yanit?.odenmis === true && g.yanit.tamam === true) {
      setGorunumHaritasi(g.yanit.harita ?? {});
      setCeviriSurumu((n) => n + 1);
    }
    await duzeltmeleriTazele();
    setDuzeltmeHedefi(null);
    // Kayitta Ingilizce duran satirlar (Duzenle'de cevrilip kaydedilmis) ekranda
    // DEGISMEZ: hicbir katman onlara kendiliginden dokunmaz (K-T1).
    const kayit: any[] = Array.isArray(quote?.sheets) ? quote!.sheets! : [];
    const adAlan = activeSheet?.columnRoles?.nameField;
    const sabit = !adAlan ? 0 : kayit.reduce((n, sh: any) => n + (sh?.rowData ?? []).filter((r: any) =>
      r && ceviriAnahtari(satirKaynagi(r, adAlan)) === kaynak && !kayittaKaynakDuruyorMu(r, adAlan)).length, 0);
    toast({
      title: 'Çeviri düzeltildi',
      description: sabit > 0
        ? `Bu teklifte ${sabit} satır İngilizce kaydedilmiş olduğu için değişmedi; Düzenle ekranında kalem işaretiyle uygulayıp kaydedin.`
        : 'Firmanızın karşılığı bu teklifte ve İngilizce dosyada kullanılır.',
    });
  };

  const handleCeviri = async () => {
    if (!quote || gorunenSayfalar.every((s: any) => s?.isEmpty)) return;

    // Turkce'ye donus API'ye HIC gitmez ve kaydi degistirmez — yalniz gorunum.
    if (ceviriDili === 'en') {
      setCeviriDili('tr');
      setDilNotu(null);
      setCeviriSurumu((n) => n + 1);
      dilKaydet('tr');
      return;
    }

    // Once odenmis ceviriyi GOSTER (yetenek/e-posta istemez); yoksa ceviri akisi.
    const r = await teklifIngilizcesiniAl(id, cevirmeBagimliliklari);
    if (r) ingilizceyiAc(r);
  };

  /** Not dugmesi ("Guncel hali cevir" vb.): odenmemis ya da eksik oldugu bilindigi
   *  icin goruntuleme yeniden sorulmaz, dogrudan ceviri akisi. */
  const notEylemi = async () => {
    const sonuc = await teklifCevirisiAl(id, cevirmeBagimliliklari);
    if (sonuc) ingilizceyiAc({ tur: 'ceviri', harita: sonuc.harita ?? {}, sonuc });
  };

  const birimSec = (c: Currency) => {
    setCurrency(c);
    // KH8: secim TEKLIFLE kaydedilir (kismi PATCH — kapak alanlarina dokunmaz)
    api.patch(`/quotes/${id}/info`, {
      displayCurrency: c,
      displayRate: c === 'TRY' ? null : exchangeRates.TRY,
      displayRateDate: new Date().toLocaleDateString('tr-TR'),
    }).catch(() => { /* goruntuleme yine calisir; kayit sessiz denenir */ });
  };

  /* ── Render ── */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div>
        <GeriButonu hedef="/quotes" />
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? 'Teklif bulunamadı.'}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <GeriButonu hedef="/quotes" />
          <h1 className="text-2xl font-bold tracking-tight">{quote.title}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {/* t.8: numara VARSA gorunur. Yoksa yer tutucu basilmaz — "numara
                bekliyor" gibi bir soz vermeyiz; numara ilk Excel aktariminda
                dogar (backend exportXlsx) ve bu ekran onu uretmez. */}
            {quote.quoteNo ? (
              <span
                className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold tracking-tight text-foreground"
                title="Teklif numarası — ilk Excel aktarımında verilir, sonra değişmez."
              >
                {quote.quoteNo}
              </span>
            ) : null}
            <span>{new Date(quote.createdAt).toLocaleDateString('tr-TR')}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {/* REVIZE ET (14.08) — kayitli teklifi Duzenle ekraninda acar.
              Bu sayfanin secicileri SALT-OKUNUR; gercek duzenleme orada. */}
          {sheets.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={revizeEt}
              title="Teklifi Düzenle ekranında açar: fiyat eşleştirme, marka seçimi ve kâr girişi orada çalışır. Kaydettiğinde BU teklif güncellenir, kopya oluşmaz."
            >
              <Pencil className="mr-2 h-4 w-4" />
              Revize Et
            </Button>
          )}
          {/* 13.08 istegi: CEVIRI butonu para birimi seciciNIN SOLUNDA —
              Duzenle ekranindaki yerin birebir ayni'si. */}
          {sheets.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCeviri}
              disabled={ceviriYukleniyor || gorunumYukleniyor}
              title={gorunumYukleniyor ? 'İngilizce görünüm yükleniyor' : 'Malzeme/iş adlarını İngilizceye çevirir. Çap, ölçü ve sayılara DOKUNULMAZ.'}
            >
              {ceviriYukleniyor || gorunumYukleniyor ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Languages className="mr-2 h-4 w-4" />
              )}
              {ceviriDili === 'tr' ? 'İngilizceye Çevir' : 'Türkçeye Dön'}
            </Button>
          )}
          {/* KH9: TL/USD/EUR — Duzenle'dekiyle ayni bilesen deseni */}
          <div className="flex rounded-lg border bg-white p-0.5">
            {(['TRY', 'USD', 'EUR'] as Currency[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => birimSec(c)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  currency === c
                    ? 'bg-blue-600 text-white shadow-sm' /* v1 spec .mpx-para .sec: secili para birimi MAVI dolgulu */
                    : 'text-muted-foreground hover:text-foreground',
                )}
                disabled={!ratesLoaded && c !== 'TRY'}
              >
                {c === 'TRY' ? 'TL' : c}
              </button>
            ))}
          </div>
          {currency !== 'TRY' && ratesLoaded && (
            <span className="text-xs text-muted-foreground">
              1 {currency} = ₺{(currency === 'USD' ? exchangeRates.TRY : exchangeRates.TRY / exchangeRates.EUR).toFixed(2)} · TCMB {new Date().toLocaleDateString('tr-TR')}
            </span>
          )}
          {/* KULLANICI KARARI (24.07): PDF kaldirildi, cikti IKIYE ayrildi —
              her tik TEK dosya indirir (Chrome coklu-indirme blogu tetiklenmez).
              1. Fiyatli Excel: musterinin kesif dosyasi, fiyatlar yazilmis.
              2. Teklif Formati: kapak/icmal'li tam cikti (rev artar). */}
          <Button
            variant="outline"
            disabled={exporting || gorunumYukleniyor}
            title={gorunumYukleniyor ? 'İngilizce görünüm yükleniyor' : undefined}
            onClick={async () => {
              setExporting(true);
              // Ekran Ingilizce moddaysa dosya da Ingilizce istenir: sunucu
              // odenmis ceviriyi AYNI satir kuraliyla uygular, yeni AI cagrisi YOK;
              // tam degilse gerekceli mesajla durur (karisik dosya inmez).
              // Dil HER ZAMAN acik gecilir — ekranin anlik durumu kayittan yenidir.
              try { await fiyatliExceliIndir(id, ceviriDili); } finally { setExporting(false); }
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Fiyatlandırılmış Excel
          </Button>
          {/* 18.08 kullanici karari (hedef tasarim): Teklif Formatinda MAVI —
              iki cikti dugmesi ayni gorunmesin: Fiyatli Excel outline, bu solid. */}
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            disabled={exporting || gorunumYukleniyor}
            title={gorunumYukleniyor ? 'İngilizce görünüm yükleniyor' : undefined}
            onClick={async () => {
              setExporting(true);
              try { await teklifCiktisiniIndir(id, ceviriDili); } finally { setExporting(false); }
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting ? 'Hazırlanıyor…' : 'Teklif Formatında Aktar'}
          </Button>
        </div>
        {/* Faz 6.10/6.11: Ingilizce dosya yalniz teklifin guncel hali tam
            cevrilmisse iner. Not varken (eksik, degisti, yok, yuklenemedi) bu
            cumle YALAN olurdu — gosterilmez; notun kendisi ne yapilacagini soyler. */}
        {ceviriDili === 'en' && dilNotu === null && !gorunumYukleniyor && (
          <p className="text-xs text-emerald-600">
            İndirilecek dosyalar da İngilizce olur.
          </p>
        )}
        {dilNotu && (
          <div
            role="status"
            className={cn(
              'max-w-md rounded-md border px-3 py-2 text-xs',
              dilNotu.tur === 'uyari' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900',
            )}
          >
            <p className="font-semibold">{dilNotu.baslik}</p>
            <p className="mt-0.5">{dilNotu.metin}</p>
            {dilNotu.eylem === 'CEVIR' && dilNotu.dugme && (
              <Button type="button" variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={notEylemi} disabled={ceviriYukleniyor}>
                {dilNotu.dugme}
              </Button>
            )}
          </div>
        )}
        </div>
      </div>

      {/* ── FAZ 4.5 · TEKLİF BİLGİLERİ ────────────────────────────────
          Yer tutucu metinleri E2E golden spec'leriyle AYNI tutuldu
          (`Müşteri (kapak için)`, `Proje`) — o spec'ler bu kutuları
          06.08 öncesi ekranda dolduruyordu ve bugün kırıklar; metni
          değiştirmek onları ikinci kez kırardı. */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[150px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Müşteri</label>
            <input
              value={kapak.musteri}
              onChange={(e) => setKapak((o) => ({ ...o, musteri: e.target.value }))}
              onBlur={() => kapakKaydet({ musteri: kapak.musteri })}
              placeholder="Müşteri (kapak için)"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="min-w-[150px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Proje</label>
            <input
              value={kapak.proje}
              onChange={(e) => setKapak((o) => ({ ...o, proje: e.target.value }))}
              onBlur={() => kapakKaydet({ proje: kapak.proje })}
              placeholder="Proje"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="min-w-[150px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Hazırlayan</label>
            <input
              value={kapak.hazirlayan}
              onChange={(e) => setKapak((o) => ({ ...o, hazirlayan: e.target.value }))}
              onBlur={() => kapakKaydet({ hazirlayan: kapak.hazirlayan })}
              placeholder="Hazırlayan"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="min-w-[150px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Geçerlilik</label>
            <input
              value={kapak.gecerlilik}
              onChange={(e) => setKapak((o) => ({ ...o, gecerlilik: e.target.value }))}
              onBlur={() => kapakKaydet({ gecerlilik: kapak.gecerlilik })}
              placeholder="Örn. 30 gün"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="min-w-[150px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Durum</label>
            <select
              value={durum}
              onChange={(e) => {
                setDurum(e.target.value);
                kapakKaydet({ durum: e.target.value });
              }}
              aria-label="Teklif durumu"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {TEKLIF_DURUMLARI.map((d) => (
                <option key={d} value={d}>{teklifDurumGorunumu(d).etiket}</option>
              ))}
            </select>
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {kapakDurumu === 'kaydediliyor' && 'Kaydediliyor…'}
            {kapakDurumu === 'kaydedildi' && '✓ Kaydedildi'}
          </div>
        </div>
      </Card>

      {/* Multi-sheet ExcelGrid render (read-only) */}
      {sheets.length > 0 && gridData ? (
        <>
          <Card className="overflow-hidden">
            <ExcelGrid
              // `ceviriSurumu`: gorunum (dil/harita) degisince grid yeniden
              // monte edilir — AG-Grid ayni satir nesnelerini gorup cizmeyebilir.
              key={`detail-sheet-${activeSheetIndex}-${ceviriSurumu}`}
              data={gridData}
              brands={allBrands}
              laborFirms={laborFirms}
              // KUR-01 ikizi: simge GOSTERIM biriminden — kur yuklenmeden TL rakam "$" ile basilmaz
              currencySymbol={paraSimgesi(gosterimCurrency)}
              conversionRate={conversionRate}
              onBrandChange={SALT_OKUNUR_MARKA}
              sheetDiscipline={activeSheet?.discipline ?? adDisiplinTahmini(activeSheet?.name)}
              ceviriKalemi={ceviriKalemi}
              laborEnabled={(() => {
                // KH10: PRO kullanicida "Pro Gerekli" HICBIR ekranda gorunmez —
                // entitlement Duzenle ile ayni kaynaktan (capabilities).
                // PANO 17a: disiplin yoksa AD'dan tespit; yine yoksa mekanik.
                const disc = activeSheet?.discipline ?? adDisiplinTahmini(activeSheet?.name);
                if (disc === 'electrical') return capabilities.electrical.labor;
                return capabilities.mechanical.labor;
              })()}
            />
          </Card>
          <CeviriDuzeltmeDialog
            hedef={duzeltmeHedefi}
            onKapat={() => setDuzeltmeHedefi(null)}
            onKaydet={async (deger) => {
              try {
                await duzeltmeKaydet({ quoteId: id, kaynak: duzeltmeHedefi!.kaynak, ceviri: deger }, { put: (url, govde) => api.put(url, govde) });
              } catch (e) {
                throw new Error(duzeltmeHataMetni(e));
              }
              await duzeltmeSonrasi(duzeltmeHedefi!.kaynak);
            }}
            onKaldir={async (duzeltmeId) => {
              try {
                await duzeltmeKaldir(duzeltmeId, { delete: (url) => api.delete(url) });
              } catch (e) {
                throw new Error(duzeltmeHataMetni(e));
              }
              await duzeltmeSonrasi(duzeltmeHedefi!.kaynak);
            }}
          />
          {sheets.length > 1 && (
            <SheetTabs
              sheets={sheets.map((s: any, i: number) => ({
                name: s.name ?? `Sayfa ${i + 1}`,
                index: i,
                isEmpty: false,
              }))}
              activeIndex={activeSheetIndex}
              onChange={setActiveSheetIndex}
            />
          )}
        </>
      ) : (
        <div className="rounded-md border border-muted p-8 text-center text-sm text-muted-foreground">
          Bu teklifte görüntülenecek veri bulunamadı.
        </div>
      )}
    </div>
  );
}
