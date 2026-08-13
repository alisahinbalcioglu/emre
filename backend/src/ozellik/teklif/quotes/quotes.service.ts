import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
// PRD Teklif Formatim (v2.1): profesyonel cikti motoru
import { buildExportWorkbook, ExportSonucu, ExportBirim } from './export-engine';
import { standartCiktiUret } from './standart-cikti';
import { buildSampleFormat, ExportOverrides, FillContext } from '../../cikti/quote-formats/format-engine';
import { ExchangeRatesService } from '../../fiyat/exchange-rates/exchange-rates.service';
import { CeviriService } from '../../giris/ai/ceviri.service';
import { yukariYuvarla } from '../../fiyat/matching/pricing';

/** KDV orani — kod sabiti (ayarlanabilirlik backlog) */
const KDV_ORAN = 0.20;

/** Satir toplami — FE `hesaplaSatirToplam` (frontend/lib/pricing.ts:53) ile
 *  AYNI kural: yukariYuvarla(birim × miktar). Yeni kural ICAT EDILMEZ;
 *  yuvarlama tek kaynaktan (`modules/matching/pricing.ts`) gelir. Backend'in
 *  satis/kar hesabi YOKTUR (22.07 karari, pricing.ts:33-35) — burada da yok:
 *  gelen birim fiyat zaten SATIS fiyatidir. */
const satirToplami = (birimFiyat: number, miktar: number) => yukariYuvarla(birimFiyat * miktar);

@Injectable()
export class QuotesService {
  constructor(
    private prisma: PrismaService,
    private exchangeRates: ExchangeRatesService,
    private ceviri: CeviriService,
  ) {}

  /**
   * EXPORT DILI — sayfa metinlerini ONBELLEKTEKI ceviriyle degistirir (13.08).
   *
   * ── NEDEN BURADA KARAR YOK ─────────────────────────────────────────────────
   * Hangi hucrenin cevrilebilecegine (dokunulmazlar: cap/olcu/kod) KARAR VEREN
   * tek yer frontend'deki saf modul. Burada yalnizca `Translation` onbelleginde
   * KAYITLI eslesenler uygulanir; onbellek zaten o kuralin ciktisidir, yani
   * "DN 20" hicbir zaman gonderilmedigi icin burada da degismez. Kurali ikinci
   * kez yazmak, zamanla birbirinden ayrilan iki gercek uretirdi.
   *
   * ── NEDEN API'YE GITMEZ ────────────────────────────────────────────────────
   * Export bir indirme yolu: 15.000 satirlik bir teklifte AI beklemek indirmeyi
   * dakikalara cikarir ve kullanicinin ISTEMEDIGI bir harcama uretir. Ekranda
   * "Ingilizceye Cevir" zaten onbellegi doldurur; export onu KULLANIR.
   * Onbellekte olmayan metin TURKCE kalir — sessizce degil, cagiran tarafa
   * sayisi bildirilerek.
   */
  /**
   * Ceviri sonucunu export ozetine ekler.
   *
   * ⚠ EKSIK SAYISI GIZLENMEZ: onbellekte bulunmayan metin dosyaya TURKCE iner.
   * Bunu soylemeyen bir ozet, kullanicinin yarim Ingilizce bir teklifi
   * musteriye gondermesine ve FARK ETMEMESINE yol acar.
   */
  private ceviriOzetiEkle(ozet: string | undefined, c: { cevrilen: number; eksik: number }): string | undefined {
    if (c.cevrilen === 0 && c.eksik === 0) return ozet;
    const parca = c.eksik > 0
      ? `İngilizce: ${c.cevrilen} hücre çevrildi, ${c.eksik} hücre Türkçe kaldı (önbellekte yok)`
      : `İngilizce: ${c.cevrilen} hücre çevrildi`;
    return ozet ? `${ozet} · ${parca}` : parca;
  }

  private async sheetleriCevir(
    sheets: any[],
    dil: string | undefined,
  ): Promise<{ cevrilen: number; eksik: number }> {
    if (dil !== 'en' || !Array.isArray(sheets)) return { cevrilen: 0, eksik: 0 };

    const anahtar = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');

    // 1) Aday metinleri topla — yalniz AD alani (insanin okudugu metin).
    const adaylar: string[] = [];
    for (const sh of sheets) {
      const adAlan = sh?.columnRoles?.nameField;
      if (!adAlan) continue;
      for (const row of sh?.rowData ?? []) {
        const a = anahtar(row?.[adAlan]);
        if (a) adaylar.push(a);
      }
    }
    if (adaylar.length === 0) return { cevrilen: 0, eksik: 0 };

    // 2) Onbellekte KAYITLI olanlari al (karar yok, eslesme var).
    const harita = await this.ceviri.onbellekHaritasi(adaylar, 'en');

    // 3) Uygula. `_ceviriKaynak` YAZILMAZ: bu, DB'ye donmeyen gecici bir export
    //    kopyasidir; kaydi kirletmemek icin yalnizca gorunen deger degisir.
    let cevrilen = 0;
    let eksik = 0;
    for (const sh of sheets) {
      const adAlan = sh?.columnRoles?.nameField;
      if (!adAlan) continue;
      for (const row of sh?.rowData ?? []) {
        const a = anahtar(row?.[adAlan]);
        if (!a) continue;
        const ceviri = harita[a];
        if (ceviri && ceviri !== row[adAlan]) {
          row[adAlan] = ceviri;
          cevrilen++;
        } else if (!ceviri) {
          eksik++;
        }
      }
    }
    return { cevrilen, eksik };
  }

  async parseExcel(userId: string, fileBuffer: Buffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) return { headers: [], rows: [], brands: [] };

    const headers = Object.keys(rows[0]);
    console.log(`[Excel] ${rows.length} satır, ${headers.length} sütun: [${headers.join(', ')}]`);

    const brands = await this.prisma.brand.findMany({ select: { id: true, name: true } });

    return { headers, rows, brands };
  }

  async create(userId: string, dto: CreateQuoteDto) {
    // ── ILISKISEL ALAN SUZGECI ──────────────────────────────────────────────
    // brandId/laborFirmaId istemciden SERBEST STRING olarak geliyor; dogrudan
    // Prisma'ya vermek silinmis/olmayan ID'de P2003 (foreign key) -> 500 uretir.
    // Kayitli sheets.rowData eski bir marka ID'sini AYLARCA tasiyabildigi icin
    // bu gercek bir senaryo.
    //
    // ⚠ IKI MODELIN SAHIPLIK SEMASI FARKLI — filtreler bilerek asimetrik:
    //   Brand      : GLOBAL havuz (schema.prisma:150 — userId YOK, name @unique).
    //                Kullanici sahipligi UserBrandLibrary ile ifade edilir.
    //                Bu yuzden yalniz VARLIK kontrolu yapilir; kutuphane
    //                uyeligi ARANMAZ — kullanici bir markayi kutuphanesinden
    //                cikarmis olsa bile o teklifte BILEREK secmisti, iliskiyi
    //                koparmak veri kaybi olurdu.
    //   LaborFirm  : KULLANICIYA AIT (schema.prisma:595 — userId var).
    //                Sahiplik SART: baska hesabin firmasina bagli kalem
    //                olusmasi izolasyonu deler.
    //
    // Maliyet: teklif basina IKI sorgu (kalem basina DEGIL). Gecersiz ID
    // sessizce null olur, kayit BLOKLANMAZ — fiyat zaten kalemde yazili,
    // yalniz iliski kopar; teklifin tamami kaybolmaz.
    const istenenMarka = [...new Set(dto.items.map((i) => i.brandId).filter(Boolean) as string[])];
    const istenenFirma = [...new Set(dto.items.map((i) => i.laborFirmaId).filter(Boolean) as string[])];
    const [gecerliMarka, bulunanFirma] = await Promise.all([
      istenenMarka.length
        ? this.prisma.brand.findMany({ where: { id: { in: istenenMarka } }, select: { id: true } })
        : Promise.resolve([] as { id: string }[]),
      // ⚠ userId FILTRESI SORGUDA DEGIL: "baskasinin firmasi" ile "silinmis
      // firma" ayirt edilebilsin diye sahiplik BURADA degil asagida kontrol
      // edilir. Ikisi de null'a duser ama LOG'lari FARKLIDIR — biri istismar/
      // bug sinyali, digeri sirandan bayat veri. Sorgu sayisi DEGISMEDI.
      istenenFirma.length
        ? this.prisma.laborFirm.findMany({
            where: { id: { in: istenenFirma } },
            select: { id: true, userId: true },
          })
        : Promise.resolve([] as { id: string; userId: string }[]),
    ]);
    const markaOk = new Set(gecerliMarka.map((b) => b.id));
    const firmaOk = new Set(bulunanFirma.filter((f) => f.userId === userId).map((f) => f.id));

    // ── SESSIZ KAYIP YASAK: dusen her iliski LOG'a yazilir ─────────────────
    // Bu projede "sessiz bos/bayat" defalarca pahaliya mal oldu (fill-down
    // vakasi: marka atanmis 141 satirin 131'i sessizce bos kalmisti). Iliski
    // dusmesi de sessiz kalmamali — ustelik ekran markayi sheets.rowData'dan
    // cizdigi icin kullanici HICBIR ZAMAN fark etmez, yalniz iliskisel alan
    // ayrisir. Kayit BILEREK BLOKLANMAZ (BadRequestException ATILMAZ):
    // logout sessionStorage'i temizlemedigi icin hesap degistiren kullanicinin
    // taslagi eski firma ID'si tasiyabilir; sert 400 teklifin TAMAMINI
    // kaydedilemez yapardi — kopan bir iliskiden kotu.
    const dusenMarka = istenenMarka.filter((id) => !markaOk.has(id));
    if (dusenMarka.length) {
      console.warn(`[Teklif] ⚠ SELF-CHECK: ${dusenMarka.length} marka iliskisi dusuruldu `
        + `(bulunamadi): ${dusenMarka.join(', ')}`);
    }
    const baskasininFirmasi = bulunanFirma.filter((f) => f.userId !== userId).map((f) => f.id);
    if (baskasininFirmasi.length) {
      console.warn(`[Teklif] ⚠ SELF-CHECK: ${baskasininFirmasi.length} iscilik firmasi BASKA `
        + `HESABA ait, iliski yazilmadi (user=${userId}): ${baskasininFirmasi.join(', ')}`);
    }
    const yokFirma = istenenFirma.filter((id) => !bulunanFirma.some((f) => f.id === id));
    if (yokFirma.length) {
      console.warn(`[Teklif] ⚠ SELF-CHECK: ${yokFirma.length} silinmis firma iliskisi `
        + `dusuruldu: ${yokFirma.join(', ')}`);
    }

    const items = dto.items.map((item) => {
      const qty = item.quantity ?? 1;
      const matUp = item.materialUnitPrice ?? item.unitPrice ?? 0;
      const labUp = item.laborUnitPrice ?? 0;
      const matMargin = item.materialMargin ?? 0;
      const labMargin = item.laborMargin ?? 0;

      // ── KL P1-b (pano kalem 64): KAYIT EKRANI TEKRARLAMAZ ────────────────
      // Gelen `materialUnitPrice`, ekranin hucresinde YAZAN degerdir: SATIS
      // fiyati — kar ZATEN uygulanmis ve yukari yuvarlanmistir
      // (ExcelGrid.tsx:278 `hesaplaSatisBirimFiyat` → hucre; payload
      // quotes/new/page.tsx:1265-1270 o hucreyi yollar).
      // ESKI KOD kari BIR KEZ DAHA uyguluyordu (`matUp * (1 + margin/100)`);
      // olculdu: kar %10'da DB'ye ekrandan ₺34,95 FAZLA toplam yaziliyordu
      // (test/kl-kayit-toplami-test.ts K1). Ekran hatasi gecici, kaydedilen
      // yanlis toplam KALICI — bu yuzden P1.
      //
      // KURAL BURADA BELIRLENMEZ: satir toplami = yukariYuvarla(birim × miktar)
      // — FE `hesaplaSatirToplam` (frontend/lib/pricing.ts:53) ile AYNI kural,
      // yuvarlama tek kaynaktan (`matching/pricing.ts` yukariYuvarla) gelir.
      // Marj alanlari yalnizca KAYIT icin tasinir; hesaba GIRMEZ.
      const materialTotalPrice = item.materialTotalPrice ?? satirToplami(matUp, qty);
      const laborTotalPrice = item.laborTotalPrice ?? satirToplami(labUp, qty);

      // Toplamlar — birim fiyatlar geldigi gibi (sisirilmez)
      const totalUnitPrice = yukariYuvarla(matUp + labUp);
      const totalPrice = yukariYuvarla(materialTotalPrice + laborTotalPrice);

      // Eski alan geriye uyum
      const discount = item.discount ?? 0;
      const profitMargin = item.profitMargin ?? matMargin;
      const netPrice = matUp * (1 - discount / 100);
      const finalPrice = totalPrice;

      return {
        materialName: item.materialName,
        unit: item.unit ?? 'Adet',
        brandId: item.brandId && markaOk.has(item.brandId) ? item.brandId : null,
        // ISCILIGIN IKIZI: sema'da alan vardi ama buraya HIC yazilmiyordu.
        laborFirmaId: item.laborFirmaId && firmaOk.has(item.laborFirmaId) ? item.laborFirmaId : null,
        quantity: qty,
        materialUnitPrice: matUp,
        materialTotalPrice,
        materialMargin: matMargin,
        laborUnitPrice: labUp,
        laborTotalPrice,
        laborMargin: labMargin,
        totalUnitPrice,
        totalPrice,
        // Geriye uyumluluk
        unitPrice: matUp,
        discount,
        netPrice,
        profitMargin,
        finalPrice,
      };
    });

    // Orijinal dosya binary'si (base64 → Buffer)
    let originalFile: Buffer | undefined;
    if (dto.originalFileBase64) {
      try {
        originalFile = Buffer.from(dto.originalFileBase64, 'base64');
      } catch {}
    }

    // ── YARIS PENCERESI (TOCTOU) ────────────────────────────────────────────
    // Yukaridaki dogrulama SELECT'i ile asagidaki INSERT ayri round-trip'ler.
    // Arada baska bir istek markayi (admin) ya da firmayi (kullanicinin kendi
    // "Firma Sil" dugmesi) silerse INSERT yine P2003 ile 500 dondurur — yani
    // suzgecin ONLEMEK ICIN VAR OLDUGU hata. Pencere dar ama sifir degil.
    // Cozum transaction DEGIL, TEK SEFERLIK GERI DUSUS: iliskiler koparilip
    // yeniden denenir. Gerekce ayni: teklifin TAMAMINI kaybetmektense
    // iliskiyi kaybetmek yeglenir (fiyatlar zaten kalemde yazili).
    try {
      return await this.quoteYaz(userId, dto, items, originalFile);
    } catch (e: any) {
      if (e?.code !== 'P2003') throw e;
      console.warn('[Teklif] ⚠ SELF-CHECK: kayit sirasinda marka/firma silinmis '
        + '(P2003) — iliskiler koparilip yeniden deneniyor');
      const iliskisiz = items.map((i) => ({ ...i, brandId: null, laborFirmaId: null }));
      return await this.quoteYaz(userId, dto, iliskisiz, originalFile);
    }
  }

  /** Teklif INSERT'i — create() iki kez cagirabilsin diye ayrildi (TOCTOU geri dususu). */
  private quoteYaz(
    userId: string,
    dto: CreateQuoteDto,
    items: any[],
    originalFile?: Buffer,
  ) {
    return this.prisma.quote.create({
      data: {
        userId,
        title: dto.title || `Teklif ${new Date().toLocaleDateString('tr-TR')}`,
        sheets: dto.sheets ? (dto.sheets as any) : undefined,
        originalFile: originalFile ?? undefined,
        originalName: dto.originalFileName ?? undefined,
        items: { create: items },
      },
      include: {
        items: { include: { brand: true, laborFirma: true } },
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.quote.findMany({
      where: { userId },
      include: {
        // ⚠ LISTE UCU: yalniz toplam hesabi icin kalem gerekir.
        // Tuketiciler OLCULDU — hicbiri marka/firma OKUMUYOR:
        //   quotes/page.tsx:32-33  -> items.reduce(finalPrice)  (tip: {id, finalPrice})
        //   profile/page.tsx:71-75 -> yalniz dizi UZUNLUGU
        // brand+laborFirma include etmek DWG tekliflerinde teklif basina
        // 1474 kaleme kadar gereksiz JOIN + nesne tasiyordu. Detay ve kayit
        // yanitlarinda (findOne/create) iliskiler DURUYOR.
        items: { select: { id: true, finalPrice: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, userId },
      include: {
        items: { include: { brand: true, laborFirma: true } },
        user: { select: { email: true } },
      },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  async remove(userId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({ where: { id, userId } });
    if (!quote) throw new NotFoundException('Quote not found');
    return this.prisma.quote.delete({ where: { id } });
  }


  // ═══════════════════════════════════════════════════════════════════
  // PRD TEKLIF FORMATIM (v2.1) — profesyonel cikti: format kapak/icmal +
  // musteri workbook kopyasi (T1) + formullu fiyatlar + rev arsivi (T10)
  // ═══════════════════════════════════════════════════════════════════

  /** Teklif bilgileri (kapak alanlari) + format secimi. */
  async updateInfo(userId: string, id: string, dto: {
    musteri?: string; proje?: string; hazirlayan?: string; gecerlilik?: string; formatId?: string | null;
    displayCurrency?: string; displayRate?: number | null; displayRateDate?: string | null;
  }) {
    const quote = await this.prisma.quote.findFirst({ where: { id, userId } });
    if (!quote) throw new NotFoundException('Quote not found');
    if (dto.formatId) {
      const f = await (this.prisma as any).quoteFormat.findFirst({ where: { id: dto.formatId, userId } });
      if (!f) throw new NotFoundException('Format bulunamadi');
    }
    // KISMI GUNCELLEME (KH8): gonderilMEyen alan DOKUNULMAZ — detay
    // sayfasinin para-birimi toggle'i yalniz displayCurrency yollar; eski
    // "hep null'a ez" davranisi kapak alanlarini SILERDI.
    const alan = (v?: string) => (v === undefined ? undefined : v.trim() || null);
    return this.prisma.quote.update({
      where: { id },
      data: {
        musteri: alan(dto.musteri),
        proje: alan(dto.proje),
        hazirlayan: alan(dto.hazirlayan),
        gecerlilik: alan(dto.gecerlilik),
        formatId: dto.formatId === null ? null : dto.formatId ?? undefined,
        // SORUN 16: goruntuleme birimi + kayit-ani kuru (arsiv)
        displayCurrency: ['TRY', 'USD', 'EUR'].includes(dto.displayCurrency ?? '')
          ? dto.displayCurrency : undefined,
        displayRate: dto.displayRate === undefined ? undefined : dto.displayRate,
        displayRateDate: dto.displayRateDate === undefined ? undefined : dto.displayRateDate,
      } as any,
      select: { id: true, musteri: true, proje: true, hazirlayan: true, gecerlilik: true, formatId: true, displayCurrency: true } as any,
    });
  }

  /** Format cozumu (Bulgu B1/B2 sertlestirmesi): teklifte secili → kullanicinin
   *  varsayilani → kullanicinin EN SON formati → yerlesik sade (YALNIZ hic
   *  format yoksa, T8). Kullanicinin formati varken sample'a SESSIZ dusus
   *  YASAK; hangi formatin kullanildigi loglanir ve FE'ye tasinir.
   *  DB'deki bytes DEGISMEZ (T13) — her cagri taze kopya yukler. */
  private async resolveFormatWb(userId: string, quote: any): Promise<{
    wb: ExcelJS.Workbook; formatAdi: string; formatKaynak: 'kullanici' | 'yerlesik';
    sheetRoles: Record<string, 'sabit' | 'liste'> | null;
  }> {
    let kayit = quote.formatId
      ? await (this.prisma as any).quoteFormat.findFirst({ where: { id: quote.formatId, userId } })
      : null;
    if (!kayit) {
      kayit = await (this.prisma as any).quoteFormat.findFirst({ where: { userId, isDefault: true } });
    }
    if (!kayit) {
      // Varsayilan isaretli yoksa EN SON yuklenen format kullanilir
      kayit = await (this.prisma as any).quoteFormat.findFirst({
        where: { userId }, orderBy: { createdAt: 'desc' },
      });
    }
    if (kayit) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(kayit.fileBytes) as any);
      console.log(`[Export] Format: "${kayit.name}" (kullanici formati${kayit.isDefault ? ', varsayilan' : ''})`);
      return { wb, formatAdi: kayit.name, formatKaynak: 'kullanici', sheetRoles: (kayit.mapping as any)?.sheetRoles ?? null };
    }
    console.warn('[Export] Kullanicinin formati YOK — yerlesik sade kapak+icmal (T8)');
    return { wb: buildSampleFormat(), formatAdi: 'MetaPrice Varsayılan', formatKaynak: 'yerlesik', sheetRoles: null };
  }

  /** T12: kur notu — ekrandaki (TCMB) kur + tarih. Cikti aninda soru YOK. */
  private async kurNotuUret(): Promise<string> {
    try {
      const r = await this.exchangeRates.getRates();
      const tarih = r.date || new Date().toLocaleDateString('tr-TR');
      return `Kur: 1 USD = ${r.usdTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL · 1 EUR = ${r.eurTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL (TCMB, ${tarih})`;
    } catch {
      return '';
    }
  }

  private async ctxTemelUret(quote: any, rev: number): Promise<Omit<FillContext, 'sekmeler'>> {
    return {
      teklifNo: quote.quoteNo ?? `MP-${new Date().getFullYear()}-TASLAK`,
      rev,
      tarih: new Date().toLocaleDateString('tr-TR'),
      musteri: quote.musteri,
      proje: quote.proje,
      hazirlayan: quote.hazirlayan,
      gecerlilik: quote.gecerlilik,
      kurNotu: await this.kurNotuUret(),
      kdvOran: KDV_ORAN,
    };
  }

  private async quoteGetir(userId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({ where: { id, userId } });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote as any;
  }

  /** PANO 18: teklifin GORUNTULEME birimi → export cevirisi (canli TCMB;
   *  kutuphane orijinal birimleri DEGISMEZ — yalniz cikti goruntusu). */
  private async exportBirimi(quote: any): Promise<ExportBirim | null> {
    const kod = quote.displayCurrency;
    if (kod !== 'USD' && kod !== 'EUR') return null;
    try {
      const r: any = await this.exchangeRates.getRates();
      const tryPer = kod === 'USD' ? r?.usdTry : r?.eurTry;
      if (!tryPer || tryPer <= 1) return null; // kur alinamadi → guvenli TL
      const kur = Number(tryPer).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return {
        kod,
        katsayi: 1 / Number(tryPer),
        not: `Fiyatlar ${kod} — 1 ${kod} = ₺${kur} (TCMB, ${r?.date ?? new Date().toLocaleDateString('tr-TR')})`,
      };
    } catch {
      return null; // kur servisi hatasi exportu DUSUREMEZ — TL yazilir
    }
  }

  /** PANO 21a/c: gorunur self-check ozeti ("N değer aktarıldı ✓ …"). */
  private exportOzeti(
    t: { yazilan: number; beklenen: number; fiyatsiz: number; toplam: number },
    birim: ExportBirim | null,
  ): string {
    const simge = birim?.kod === 'USD' ? '$' : birim?.kod === 'EUR' ? '€' : '₺';
    const parca = [`${Math.max(t.yazilan, t.beklenen)} değer aktarıldı ✓`,
      // P2-1b: 2 hane — ekran (PARA_ONDALIK) ve Excel numFmt ile ayni.
      `toplam ${simge}${t.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`];
    if (t.fiyatsiz > 0) parca.push(`${t.fiyatsiz} satır fiyatsız (eşleşmemiş)`);
    return parca.join(' · ');
  }

  private async ciktiKur(userId: string, quote: any, rev: number, dil?: string): Promise<ExportSonucu & { formatAdi: string; formatKaynak: 'kullanici' | 'yerlesik' }> {
    // Bulgu Raporu kok neden: grid'den uretim SILINDI — orijinal dosya ZORUNLU.
    if (!quote.originalFile) {
      throw new BadRequestException(
        'Bu teklifte orijinal Excel dosyası kayıtlı değil — dışa aktarım için keşif Excel\'ini yükleyip teklifi yeniden kaydedin.',
      );
    }
    const { wb: formatWb, formatAdi, formatKaynak, sheetRoles } = await this.resolveFormatWb(userId, quote);
    const sheetsArr = Array.isArray(quote.sheets) ? (quote.sheets as any[]) : [];
    const sonuc = await buildExportWorkbook({
      originalFile: Buffer.from(quote.originalFile),
      sheetsArr,
      formatWb,
      sheetRoles,
      ctxTemel: await this.ctxTemelUret(quote, rev),
      overrides: (quote.exportOverrides ?? null) as ExportOverrides | null,
      birim: await this.exportBirimi(quote), // PANO 18 (KF7: iki yol ayni)
      dil, // 13.08: baslik + birim dili (ikizi fiyatli cikti yolunda)
    });
    return { ...sonuc, formatAdi, formatKaynak };
  }

  // ARINMA Faz 2 (A+B): exportPreview + saveOverrides SILINDI — Cikti
  // Onizleme sayfasi c947983'te kaldirilmisti, FE'de 0 cagri kalmisti.
  // quote.exportOverrides ALANI ve applyOverrides motoru KORUNUR (T13/T14):
  // eski kayitli override'lar ciktiKur uzerinden islenmeye devam eder.

  /** .xlsx uret + REV artir + arsivle (T10). */
  async exportXlsx(userId: string, id: string, dil?: string): Promise<{ buffer: Buffer; filename: string; rev: number; quoteNo: string; uyari?: string; ozet?: string }> {
    const quote = await this.quoteGetir(userId, id);
    // 13.08: `dil=en` ise sayfa metinleri onbellekteki ceviriyle degistirilir.
    // DB'ye YAZILMAZ — yalnizca bu indirmenin kopyasi degisir.
    const ceviriOzeti = await this.sheetleriCevir(quote.sheets as any[], dil);

    // Teklif no ILK aktarimda atanir, sonra SABIT (T10)
    let quoteNo: string = quote.quoteNo;
    if (!quoteNo) {
      const yil = new Date().getFullYear();
      const sayac = await this.prisma.quote.count({
        where: { userId, quoteNo: { not: null } } as any,
      });
      quoteNo = `MP-${yil}-${String(sayac + 1).padStart(3, '0')}`;
    }
    const yeniRev = (quote.rev ?? 0) + 1;

    const sonuc = await this.ciktiKur(userId, { ...quote, quoteNo }, yeniRev, dil);
    const out = await sonuc.wb.xlsx.writeBuffer();
    const buffer = Buffer.from(out);

    const temizBaslik = String(quote.title ?? 'Teklif').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
    const filename = `${quoteNo} Rev.${String(yeniRev).padStart(2, '0')} - ${temizBaslik}.xlsx`;

    await this.prisma.$transaction([
      this.prisma.quote.update({ where: { id }, data: { quoteNo, rev: yeniRev } as any }),
      (this.prisma as any).quoteExport.create({
        data: {
          quoteId: id,
          rev: yeniRev,
          fileName: filename,
          xlsxBytes: buffer,
          overridesSnapshot: (quote.exportOverrides ?? undefined) as any,
        },
      }),
    ]);

    console.log(`[Export] ${quoteNo} Rev.${yeniRev} uretildi (${(buffer.length / 1024).toFixed(0)} KB)`);
    // KF6/KF7 + K-D: teklif-format yolu da AYNI self-check'i tasir (tek motor)
    const parcalar: string[] = [];
    if ((sonuc.eksikDeger ?? 0) > 0) parcalar.push(`${sonuc.eksikDeger} fiyat değeri dosyaya yazılamadı`);
    if ((sonuc.hataArtisi ?? 0) > 0) parcalar.push(`${sonuc.hataArtisi} hücrede formül hatası oluştu`);
    const uyari = parcalar.length > 0 ? `${parcalar.join('; ')} — çıktıyı kontrol edin.` : undefined;
    if (uyari) console.warn(`[Export] ⚠ SELF-CHECK (teklif format): ${uyari}`);
    // PANO 21a: gorunur ozet (KF7 — iki yol ayni self-check'i tasir)
    const ozet = this.ceviriOzetiEkle(this.exportOzeti({
      yazilan: sonuc.yazilanDeger ?? 0,
      beklenen: sonuc.beklenenDeger ?? 0,
      fiyatsiz: sonuc.fiyatsizSatir ?? 0,
      toplam: sonuc.sekmeler.reduce((a, b) => a + b.matDeger + b.labDeger, 0),
    }, await this.exportBirimi(quote)), ceviriOzeti);
    return { buffer, filename, rev: yeniRev, quoteNo, uyari, ozet };
  }

  /** Fiyatlandirilmis kesif Excel'i: MUSTERININ ORIJINAL dosyasi, fiyatlar
   *  yazilmis — teklif formati (kapak/icmal) YOK, REV ARTMAZ, arsivlenmez.
   *  Kullanici karari 24.07: "sadece fiyatlandirdigi exceli indirmek
   *  isteyebilir (teklif formatinda gondermek istemeyebilir)". */
  /**
   * "Fiyatlandırılmış Excel" — EX1-EX7 (PRD_Standart_Grid_Semasi §C).
   *
   * KULLANICI KARARI (30.07.2026): çıktı artık MÜŞTERİNİN ŞABLONUNA yazılmıyor;
   * 9 kolonluk STANDART dosya üretiliyor. Kâr oranı ve marka/firma iç bilgidir,
   * dosyaya hiçbir yerde girmez (EX1/EX2). Böylece kolon-haritalama hatası
   * sınıfı (KE1-KE21 · KF1-KF7) yapısal olarak ortadan kalkar.
   *
   * ESKI YOL: `writePricesToWorkbook` orijinal workbook'a yazıyordu — T1/T3
   * kapsamında SİLİNDİ (369 satır); iki export yolu da `standartSayfaYaz`
   * motorunu kullanıyor (KF7).
   */
  async exportPricedXlsx(userId: string, id: string, dil?: string): Promise<{ buffer: Buffer; filename: string; uyari?: string; ozet?: string }> {
    const quote = await this.quoteGetir(userId, id);
    const sheetsArr = Array.isArray(quote.sheets) ? (quote.sheets as any[]) : [];
    if (sheetsArr.length === 0) {
      throw new BadRequestException('Bu teklifte sayfa verisi yok — keşif Excel dosyasını yükleyip teklifi yeniden kaydedin.');
    }
    // IKIZ (teklif-format yolunun aynisi): iki cikti yolundan biri Ingilizce
    // inip digeri Turkce inseydi, kullanici hangisini indirdigine gore farkli
    // bir gercek yasardi.
    const ceviriOzeti = await this.sheetleriCevir(sheetsArr, dil);
    const birim = await this.exportBirimi(quote); // PANO 18/EX6: ekrandaki birim
    const baslikParcalari = [quote.title, (quote as any).customerName, (quote as any).projectName]
      .map((x: any) => String(x ?? '').trim()).filter(Boolean);
    const sonuc = await standartCiktiUret({
      sheetsArr,
      birim,
      baslik: baslikParcalari.join(' · '),
      // Kolon basliklari + birim kisaltmalari (sabit sozluk, AI yok).
      dil,
    });
    // EX7: görünür self-check — fiyatsız satır sayısı da bilgi olarak taşınır
    const fiyatsiz = sheetsArr.reduce((a: number, sh: any) => a + (sh?.rowData ?? [])
      .filter((r: any) => r?._isDataRow && !r?._ozet
        && !(parseFloat(String(r?._matBirim ?? '')) > 0) && !(parseFloat(String(r?._labBirim ?? '')) > 0)).length, 0);
    const ozet = this.ceviriOzetiEkle(
      fiyatsiz > 0 ? `${sonuc.ozet} · ${fiyatsiz} satır fiyatsız (eşleşmemiş)` : sonuc.ozet,
      ceviriOzeti,
    );
    const temizBaslik = String(quote.title ?? 'Teklif').replace(/[\/:*?"<>|]/g, '-').slice(0, 60);
    const filename = `${temizBaslik} - Fiyatlandırılmış Teklif.xlsx`;
    console.log(`[Export] Standart fiyatlı çıktı (${(sonuc.buffer.length / 1024).toFixed(0)} KB) — ${ozet}`);
    return { buffer: sonuc.buffer, filename, ozet };
  }

  /** T10 arsivi: uretilmis revizyonlar. */
  async listExports(userId: string, id: string) {
    await this.quoteGetir(userId, id);
    return (this.prisma as any).quoteExport.findMany({
      where: { quoteId: id },
      select: { id: true, rev: true, fileName: true, createdAt: true },
      orderBy: { rev: 'desc' },
    });
  }

  async downloadExport(userId: string, id: string, rev: number): Promise<{ buffer: Buffer; filename: string }> {
    await this.quoteGetir(userId, id);
    const e = await (this.prisma as any).quoteExport.findFirst({ where: { quoteId: id, rev } });
    if (!e) throw new NotFoundException('Revizyon bulunamadi');
    return { buffer: Buffer.from(e.xlsxBytes), filename: e.fileName };
  }

  // ARINMA Faz 2C: exportPdfPro + HTML-PDF fallback (listeBloklariHtml +
  // puppeteer) SILINDI — kullanici karari 24.07 "pdf olmasin", FE'de 0
  // cagri. xlsx-to-pdf util'i KORUNDU (quote-formats preview-pdf canli).
  // Geri getirme: git show pre-arinma:backend/src/quotes/quotes.service.ts
}
