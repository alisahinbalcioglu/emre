'use client';

// Cloudflare Pages icin Edge Runtime (dynamic route)
export const runtime = 'edge';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Languages, Loader2 } from 'lucide-react';
import { Button } from '@/ortak/ui/button';
import { Card } from '@/ortak/ui/card';
import api from '@/ortak/lib/api';
import { toast } from '@/ortak/hooks/use-toast';
import { cn } from '@/ortak/lib/utils';
import { cevrilecekMetinler, ceviriUygula, ceviriGeriAl } from '@/ozellik/teklif/ceviri';
import { teklifCiktisiniIndir, fiyatliExceliIndir } from '@/ozellik/cikti/export-download';
import { ExcelGrid } from '@/ozellik/tablo/excel-grid/ExcelGrid';
import { SheetTabs } from '@/ozellik/tablo/excel-grid/SheetTabs';
import type { ExcelGridData } from '@/ozellik/tablo/excel-grid/types';
import { useCurrency } from '@/ozellik/fiyat/use-currency';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { adDisiplinTahmini } from '@/ozellik/tablo/disiplin';
import type { Currency, LaborFirm } from '@/ortak/types/quotes';
import type { Brand } from '@/ortak/types';

interface QuoteDetail {
  id: string;
  title: string;
  createdAt: string;
  user: { email: string };
  sheets?: any[];
  items: any[];
  displayCurrency?: string;
  /** Teklifin KAYITLI dili — 'en' ise sayfa Ingilizce acilir ve export'a
   *  dil gecer (para biriminin birebir ikizi). */
  displayLanguage?: string;
}

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
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
  const { currency, setCurrency, exchangeRates, ratesLoaded, conversionRate } = useCurrency();
  // KH10: Pro entitlement DUZENLE ekraniyla AYNI kaynaktan (/auth/me)
  const { capabilities } = useCapabilities();

  useEffect(() => {
    api.get<QuoteDetail>(`/quotes/${id}`)
      .then(({ data }) => {
        setQuote(data);
        if (data.displayCurrency === 'USD' || data.displayCurrency === 'EUR') {
          setCurrency(data.displayCurrency as Currency);
        }
        // Teklif Ingilizce kaydedildiyse sayfa Ingilizce ACILIR: satirlar
        // zaten cevrilmis durumda, dolayisiyla YENI BIR API CAGRISI YAPILMAZ.
        // Bu satir olmadan export'a dil gecmiyor ve basliklar Turkce kaliyordu.
        //
        // ⚠ IKINCI KOSUL (`_ceviriKaynak`) TAHMIN DEGIL, KENDI ISARETIMIZ:
        // `ceviriUygula` cevirdigi her satira orijinali `_ceviriKaynak`
        // olarak yazar ve `ceviriGeriAl` siler. Yani satirda bu alan varsa o
        // satir TANIM GEREGI ceviri gosteriyordur. `displayLanguage` kolonu
        // 13.08'de geldi; ONCESINDE Ingilizce kaydedilmis teklifler kayitta
        // 'tr' gorunur — bu kosul onlari yakalar ve kayit PATCH ile onarilir
        // (bir sonraki acilis artik kolondan okur).
        const ceviriliSatirVar = Array.isArray(data.sheets) && data.sheets.some(
          (s: any) => (s?.rowData ?? []).some((r: any) => r?._ceviriKaynak !== undefined),
        );
        if (data.displayLanguage === 'en' || ceviriliSatirVar) {
          setCeviriDili('en');
          if (data.displayLanguage !== 'en') dilKaydet('en'); // kaydi onar
        }
        // Ilk non-empty sheet'i aktif yap
        if (Array.isArray(data.sheets)) {
          const firstNonEmpty = data.sheets.findIndex((s: any) => !s.isEmpty);
          if (firstNonEmpty >= 0) setActiveSheetIndex(firstNonEmpty);
        }
      })
      .catch(() => setError('Teklif yuklenirken hata olustu.'))
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

  // ── CEVIRI (13.08) — KAYITLI TEKLIFTE DIL SECICI ──────────────────────────
  // Duzenle ekraniyla AYNI modul (`ozellik/teklif/ceviri.ts`): cap/olcu/sayi
  // DOKUNULMAZ, karar mantigi orada testle muhurlu. Burada cogu zaman API'ye
  // HIC gidilmez — `Translation` onbellegi kalici ve GLOBAL oldugu icin ayni
  // teknik terimler ikinci teklifte onbellekten doner.
  //
  // ⚠ BU SAYFA SALT-OKUNUR. Ceviri yalniz EKRANDA yasar; kayda YAZILMAZ
  // (kayitli bir teklifin `sheets` alanini guncelleyen uc yok — `PATCH
  // :id/info` yalniz kapak alanlarini alir). Export ise SUNUCUDAN uretilir
  // (`POST :id/export`, `GET :id/export-priced`), yani indirilen dosya
  // TURKCE iner. Bu fark kullaniciya ACIKCA gosterilir: aksi halde ekranda
  // Ingilizce goren kullanici musteriye Turkce dosya gonderir ve FARK ETMEZ.
  const [ceviriDili, setCeviriDili] = useState<'tr' | 'en'>('tr');
  const [ceviriYukleniyor, setCeviriYukleniyor] = useState(false);
  // ExcelGrid'e `rowData={data.rowData}` AYNI dizi referansiyla gider ve
  // `ceviriUygula` satirlari YERINDE degistirir → AG-Grid degisikligi goremez.
  // Surum sayaci grid'i yeniden monte eder (sheet degisiminde kullanilan
  // `key` deseninin aynisi).
  const [ceviriSurumu, setCeviriSurumu] = useState(0);

  /** Dil secimini teklifle KAYDEDER — para birimi toggle'inin birebir ikizi
   *  (`birimSec`). Kismi PATCH: kapak alanlarina dokunmaz. Sessiz denenir;
   *  basarisiz olursa ekrandaki dil yine dogru calisir. */
  const dilKaydet = (d: 'tr' | 'en') => {
    api.patch(`/quotes/${id}/info`, { displayLanguage: d }).catch(() => { /* goruntuleme etkilenmez */ });
  };

  /** Ceviriye girecek sayfalar — bos sayfalar elenir (grid'in gordugu kume). */
  const ceviriSayfalari = (): any[] => {
    const hepsi = quote?.sheets;
    return Array.isArray(hepsi) ? hepsi.filter((s: any) => !s?.isEmpty) : [];
  };

  const handleCeviri = async () => {
    const sayfalar = ceviriSayfalari();
    if (sayfalar.length === 0) return;

    // Turkce'ye donus API'ye HIC gitmez — orijinal metin satirda saklidir.
    if (ceviriDili === 'en') {
      ceviriGeriAl(sayfalar);
      setCeviriDili('tr');
      setCeviriSurumu((n) => n + 1);
      dilKaydet('tr');
      return;
    }

    const metinler = cevrilecekMetinler(sayfalar);
    if (metinler.length === 0) {
      toast({
        title: 'Çevrilecek metin yok',
        description: 'Bu teklifte çevrilebilir malzeme/iş adı bulunamadı.',
      });
      return;
    }

    setCeviriYukleniyor(true);
    try {
      const { data } = await api.post('/ai/translate', { metinler, hedefDil: 'en' });
      const yazilan = ceviriUygula(sayfalar, data?.harita ?? {});

      // ⚠ TEK HUCRE BILE DEGISMEDIYSE BU BASARI DEGILDIR. 13.08 canli olcumu:
      // API anahtari gecersizdi, sunucu bos harita dondu, ekran "Ceviri
      // tamamlandi" dedi ve dugme "Turkceye Don"e gecti — hicbir sey
      // cevrilmemisken kullanici ozelligin CALISTIGINI sandi.
      if (yazilan === 0) {
        toast({
          title: 'Çeviri uygulanamadı',
          description: 'Sunucudan çeviri gelmedi — hiçbir hücre değişmedi.',
          variant: 'destructive',
        });
        return;
      }

      setCeviriDili('en');
      setCeviriSurumu((n) => n + 1);
      dilKaydet('en');
      const eksik = Number(data?.basarisiz ?? 0) > 0;
      toast({
        title: eksik ? 'Çeviri KISMEN tamamlandı' : 'Çeviri tamamlandı',
        description: eksik
          ? `${yazilan} hücre çevrildi · ${data.basarisiz} parça başarısız, o metinler Türkçe kaldı`
          : `${yazilan} hücre çevrildi · ${data?.onbellekten ?? 0} önbellekten, ${data?.cevrilen ?? 0} yeni`,
        variant: eksik ? 'destructive' : undefined,
      });
    } catch (e: any) {
      toast({
        title: 'Çeviri başarısız',
        description: e?.response?.data?.message || e?.message || 'Bilinmeyen hata',
        variant: 'destructive',
      });
    } finally {
      setCeviriYukleniyor(false);
    }
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
        <Link href="/quotes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Teklifler
        </Link>
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? 'Teklif bulunamadi.'}
        </div>
      </div>
    );
  }

  const sheets = Array.isArray(quote.sheets) ? quote.sheets.filter((s: any) => !s.isEmpty) : [];
  const activeSheet = sheets[activeSheetIndex] ?? sheets[0];

  // Kayitta saklanan gizli-sutun tercihi (PRD v3.0 Part A) detayda da uygulanir.
  const hiddenFields = new Set<string>(activeSheet?.columnConfig?.hidden ?? []);
  // GS8: kullanicinin kaydettigi kolon genislikleri detayda da uygulanir
  const kayitliGenislikler: Record<string, number> = activeSheet?.columnConfig?.widths ?? {};

  // Aktif sheet icin ExcelGridData olustur
  const gridData: ExcelGridData | null = activeSheet
    ? {
        columnDefs: (activeSheet.columnDefs ?? []).map((c: any) => {
          const g = kayitliGenislikler[c.field];
          const temel = g ? { ...c, width: g } : c;
          return hiddenFields.has(c.field) ? { ...temel, hide: true } : temel;
        }),
        rowData: activeSheet.rowData ?? [],
        columnRoles: activeSheet.columnRoles ?? {},
        brands: allBrands,
        headerEndRow: activeSheet.headerEndRow ?? 0,
      }
    : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/quotes" className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Teklifler
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{quote.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{new Date(quote.createdAt).toLocaleDateString('tr-TR')}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {/* 13.08 istegi: CEVIRI butonu para birimi seciciNIN SOLUNDA —
              Duzenle ekranindaki yerin birebir ayni'si. */}
          {sheets.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCeviri}
              disabled={ceviriYukleniyor}
              title="Malzeme/iş adlarını İngilizceye çevirir. Çap, ölçü ve sayılara DOKUNULMAZ."
            >
              {ceviriYukleniyor ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Languages className="mr-2 h-4 w-4" />
              )}
              {ceviriDili === 'tr' ? 'İngilizceye Çevir' : 'Türkçeye Dön'}
            </Button>
          )}
          {/* KH9: TL/USD/EUR — Duzenle'dekiyle ayni bilesen deseni */}
          <div className="flex rounded-lg border bg-muted p-0.5">
            {(['TRY', 'USD', 'EUR'] as Currency[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => birimSec(c)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  currency === c
                    ? 'bg-background text-foreground shadow-sm'
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
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              // Ekran Ingilizce moddaysa dosya da Ingilizce iner (13.08):
              // backend onbellekteki ceviriyi uygular, yeni AI cagrisi YOK.
              // Dil HER ZAMAN acik gecilir — ekranin anlik durumu kayittan yenidir.
              try { await fiyatliExceliIndir(id, ceviriDili); } finally { setExporting(false); }
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Fiyatlandırılmış Excel
          </Button>
          <Button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try { await teklifCiktisiniIndir(id, ceviriDili); } finally { setExporting(false); }
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting ? 'Hazırlanıyor…' : 'Teklif Formatında Aktar'}
          </Button>
        </div>
        {/* 13.08 (kullanici istegi): ceviri artik EXPORT'A DA gecer. Backend
            onbellekteki ceviriyi uygular; onbellekte olmayan hucre Turkce
            kalir ve sayisi indirme ozetinde SOYLENIR — yarim Ingilizce bir
            teklif sessizce musteriye gitmez. */}
        {ceviriDili === 'en' && (
          <p className="text-xs text-emerald-600">
            İndirilecek dosyalar da İngilizce olur.
          </p>
        )}
        </div>
      </div>

      {/* Multi-sheet ExcelGrid render (read-only) */}
      {sheets.length > 0 && gridData ? (
        <>
          <Card className="overflow-hidden">
            <ExcelGrid
              // `ceviriSurumu`: satirlar YERINDE cevrildigi icin AG-Grid ayni
              // dizi referansini gorur ve yeniden cizmez — surum degisimi
              // grid'i yeniden monte eder.
              key={`detail-sheet-${activeSheetIndex}-${ceviriSurumu}`}
              data={gridData}
              brands={allBrands}
              laborFirms={laborFirms}
              currencySymbol={currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₺'}
              conversionRate={conversionRate}
              onBrandChange={async () => null}
              sheetDiscipline={activeSheet?.discipline ?? adDisiplinTahmini(activeSheet?.name)}
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
          Bu teklifte goruntulecek veri bulunamadi.
        </div>
      )}
    </div>
  );
}
