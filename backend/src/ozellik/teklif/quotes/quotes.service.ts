import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { TekliflerSorgusuDto } from './dto/teklifler-sorgusu.dto';
import { Kimlik, TeklifKimligi, teklifKosulu } from '../../../altyapi/auth/kimlik';
import { hazirlayanGorunumu } from './hazirlayan';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
// PRD Teklif Formatim (v2.1): profesyonel cikti motoru
import { buildExportWorkbook, ExportSonucu, ExportBirim } from './export-engine';
import { standartCiktiUret } from './standart-cikti';
import { buildSampleFormat, ExportOverrides, FillContext } from '../../cikti/quote-formats/format-engine';
import { ExchangeRatesService } from '../../fiyat/exchange-rates/exchange-rates.service';
import { CeviriService, KAYIT_INDIRGEME_UYARISI } from '../../giris/ai/ceviri.service';
import { kaynakMetinleriniGeriYaz } from '../../giris/ai/ceviri-kurali';
import { yukariYuvarla, kalemToplami } from '../../fiyat/matching/pricing';
import { AntetBilgi, antetKur, antetLogoNotu, ANTET_FIRMA_ALANLARI } from '../../cikti/utils/antet';

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
   * Ceviri sonucunu export ozetine ekler ("İngilizce: N hücre çevrildi").
   *
   * Faz 6.10 (15.09): Turkce kalan hucre sayisi artik YOK — Ingilizce dosya ya
   * tam Ingilizce iner ya hic inmez (`CeviriService.disaAktarimCevirisi`).
   */
  private ceviriOzetiEkle(ozet: string | undefined, cevrilen: number): string | undefined {
    if (cevrilen === 0) return ozet;
    const parca = `İngilizce: ${cevrilen} hücre çevrildi`;
    return ozet ? `${ozet} · ${parca}` : parca;
  }

  /**
   * EXPORT DILI COZUMU — parametre > kayitli alan (13.08 · Faz 6.10 15.09).
   *
   * ⚠ NEDEN YALNIZ PARAMETREYE GUVENILMEZ: dil parametresi FRONTEND'in
   * gonderdigi bir deger ve frontend her zaman guncel degil — kullanicinin
   * ACIK SEKMESI eski JS bundle'ini calistirmaya devam eder (canli olcum,
   * 13.08: satirlari Ingilizce kaydedilmis teklif, parametre tasimayan eski
   * sayfadan Turkce basliklarla indi). Kayitli `displayLanguage` sunucuda
   * durur ve bayat istemciden ETKILENMEZ. Parametre geldiyse o kazanir
   * (ekranin ANLIK durumu kayittan yenidir — kullanici az once "Turkceye
   * Don" demis olabilir); gelmediyse kayit konusur.
   *
   * `kaynak` (R1-B6): ACIK = kullanici bu indirmede dili secti (Ingilizce tam
   * degilse indirme DURUR, gerekceli mesajla); KAYIT = parametresiz yol (KVKK
   * veri indirme baglantisi, bayat istemci) — Ingilizce tam degilse dosya
   * TAMAMEN Turkce iner, kapi ve kota yok.
   */
  private exportDili(quote: any, dil?: string): { dil: string | undefined; kaynak: 'ACIK' | 'KAYIT' } {
    if (dil) return { dil, kaynak: 'ACIK' };
    return { dil: quote?.displayLanguage === 'en' ? 'en' : undefined, kaynak: 'KAYIT' };
  }

  /**
   * Turkce dosya: acik 'tr' isteginde isaretli (Duzenle'de Ingilizce
   * kaydedilmis) hucreler Turkce kaynagina doner, bayat isaretli hucre korunur.
   * Parametresiz yolda kayit 'tr' ise bugunku gibi dokunulmaz.
   */
  private turkceCikti(sheets: unknown, secim: { dil: string | undefined; kaynak: 'ACIK' | 'KAYIT' }): { dil: string | undefined; cevrilen: number; uyari?: string; indirgendi: boolean } {
    if (secim.dil === 'tr' && secim.kaynak === 'ACIK') kaynakMetinleriniGeriYaz(sheets);
    return { dil: secim.dil, cevrilen: 0, indirgendi: false };
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

  /**
   * Teklif OLUSTUR — `guncelleId` verilirse AYNI teklifi GUNCELLER (14.08).
   *
   * ── NEDEN AYRI BIR METOD DEGIL ─────────────────────────────────────────────
   * Kayit yolu yalniz "INSERT" degil: iliskisel alan suzgeci (silinmis marka/
   * firma ID'lerini eleyen iki sorgu), kalem uretimi, satir toplami kurali ve
   * P2003 TOCTOU geri dususu bu metodun govdesinde. Guncelleme icin ikinci bir
   * metod yazmak bunlarin HEPSINI kopyalamak demekti; iki kayit yolu zamanla
   * ayrilir ve biri duzeltilirken oteki unutulur. Bu yuzden ayrim TEK NOKTADA:
   * hazirlik ortak, son adim (INSERT mi UPDATE mi) parametreye bakar.
   */
  async create(k: TeklifKimligi, dto: CreateQuoteDto, guncelleId?: string) {
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
    //   LaborFirm  : FIRMAYA AIT (ADIM 1: firmaId; userId = yaratan kisi).
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
      // ⚠ FIRMA FILTRESI SORGUDA DEGIL: "baskasinin firmasi" ile "silinmis
      // firma" ayirt edilebilsin diye sahiplik BURADA degil asagida kontrol
      // edilir. Ikisi de null'a duser ama LOG'lari FARKLIDIR — biri istismar/
      // bug sinyali, digeri sirandan bayat veri. Sorgu sayisi DEGISMEDI.
      istenenFirma.length
        ? this.prisma.laborFirm.findMany({
            where: { id: { in: istenenFirma } },
            select: { id: true, firmaId: true },
          })
        : Promise.resolve([] as { id: string; firmaId: string | null }[]),
    ]);
    const markaOk = new Set(gecerliMarka.map((b) => b.id));
    // ADIM 1: sahiplik olcusu KISI degil FIRMA — ayni firmanin baska uyesinin
    // tanimladigi iscilik firmasi da bu teklifte kullanilabilir.
    const firmaOk = new Set(bulunanFirma.filter((f) => f.firmaId === k.firmaId).map((f) => f.id));

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
    const baskasininFirmasi = bulunanFirma.filter((f) => f.firmaId !== k.firmaId).map((f) => f.id);
    if (baskasininFirmasi.length) {
      console.warn(`[Teklif] ⚠ SELF-CHECK: ${baskasininFirmasi.length} iscilik firmasi BASKA `
        + `FIRMAYA ait, iliski yazilmadi (firma=${k.firmaId}): ${baskasininFirmasi.join(', ')}`);
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
      const totalPrice = kalemToplami(materialTotalPrice, laborTotalPrice);

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
      return await this.quoteYaz(k, dto, items, originalFile, guncelleId);
    } catch (e: any) {
      if (e?.code !== 'P2003') throw e;
      console.warn('[Teklif] ⚠ SELF-CHECK: kayit sirasinda marka/firma silinmis '
        + '(P2003) — iliskiler koparilip yeniden deneniyor');
      const iliskisiz = items.map((i) => ({ ...i, brandId: null, laborFirmaId: null }));
      return await this.quoteYaz(k, dto, iliskisiz, originalFile, guncelleId);
    }
  }

  /** Teklif INSERT'i — create() iki kez cagirabilsin diye ayrildi (TOCTOU geri dususu). */
  private async quoteYaz(
    k: TeklifKimligi,
    dto: CreateQuoteDto,
    items: any[],
    originalFile?: Buffer,
    guncelleId?: string,
  ) {
    if (guncelleId) return this.quoteGuncelle(k, guncelleId, dto, items, originalFile);
    return this.prisma.quote.create({
      data: {
        // ADIM 1: userId = YAZAR (kim olusturdu), firmaId = SAHIP (kim gorur).
        // firmaId YAZILMAZSA teklif firma suzgecinde GORUNMEZ olurdu.
        userId: k.userId,
        firmaId: k.firmaId,
        title: dto.title || `Teklif ${new Date().toLocaleDateString('tr-TR')}`,
        sheets: dto.sheets ? (dto.sheets as any) : undefined,
        originalFile: originalFile ?? undefined,
        originalName: dto.originalFileName ?? undefined,
        // 13.08: ceviri yapilip kaydedilen teklif Ingilizce ACILIR ve
        // Ingilizce EXPORT edilir. Beyaz liste disi deger varsayilanda birakir.
        displayLanguage: dto.displayLanguage === 'en' ? 'en' : undefined,
        items: { create: items },
      },
      include: {
        items: { include: { brand: true, laborFirma: true } },
      },
    });
  }

  /**
   * MEVCUT TEKLIFI GUNCELLE — revizyon yolu (14.08).
   *
   * Kullanici bildirimi: kayitli teklifi acip revize etmek istiyordu ama
   * detay sayfasi SALT-OKUNURDU (`onBrandChange` no-op) ve Duzenle ekrani
   * kayitli bir teklifi ID ile ACAMIYORDU — yani revizyon yolu HIC KURULMAMISTI.
   *
   * ⚠ DOKUNULMAYAN ALANLAR ve sebepleri:
   *   quoteNo / rev  → export ARSIVININ kimligi (T10). Revizyonda artmaz;
   *                    rev yalnizca "Teklif Formatinda Aktar" uretiminde artar.
   *                    Burada ellenirse arsivdeki dosya adlariyla kayit ayrisir.
   *   originalFile   → yeni dosya YUKLENMEDIYSE korunur. `undefined` gecmek
   *                    Prisma'da "dokunma" demektir; `null` gecseydik musterinin
   *                    ORIJINAL kesif dosyasi silinir ve "Fiyatlandirilmis Excel"
   *                    ciktisi bir daha uretilemezdi (o yol dosyayi ZORUNLU ister).
   *   displayCurrency/Rate → detay sayfasinin kismi PATCH'i yonetir.
   *
   * Kalemler REPLACE edilir (sil + yeniden yaz): teklif kalemleri satir satir
   * eslestirilebilir bir kimlik tasimiyor (grid satiri silinip eklenebiliyor),
   * bu yuzden fark hesabi degil tam degisim dogru olan. Islem TEK
   * TRANSACTION icinde: silme gecip yazma patlarsa teklif KALEMSIZ kalirdi.
   */
  private async quoteGuncelle(
    k: TeklifKimligi,
    id: string,
    dto: CreateQuoteDto,
    items: any[],
    originalFile?: Buffer,
  ) {
    // Sahiplik SART — baska FIRMANIN teklifi guncellenemez (izolasyon).
    // 23.09: `teklifKosulu` — "Son teklifler" izni kapali uye YALNIZ kendi
    // teklifini revize edebilir (kapsam firma suzgecini daraltir, genisletmez).
    const mevcut = await this.prisma.quote.findFirst({ where: teklifKosulu(k, { id }) });
    if (!mevcut) throw new NotFoundException('Quote not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.quoteItem.deleteMany({ where: { quoteId: id } });
      return tx.quote.update({
        where: { id },
        data: {
          title: dto.title || mevcut.title,
          sheets: dto.sheets ? (dto.sheets as any) : undefined,
          originalFile: originalFile ?? undefined,
          originalName: dto.originalFileName ?? undefined,
          displayLanguage: dto.displayLanguage === 'en' ? 'en'
            : dto.displayLanguage === 'tr' ? 'tr' : undefined,
          items: { create: items },
        },
        include: { items: { include: { brand: true, laborFirma: true } } },
      });
    });
  }

  /**
   * TEKLIF LISTESI (FAZ 4.6 — durum suzgeci + sunucu tarafi arama/sayfalama).
   *
   * ⭐ `include` -> `select` DEGISIMI BU TURUN EN BUYUK TEK KAZANCI.
   * Olculdu (tip sistemiyle, tahminle degil): `include` Prisma'da SKALERLERI
   * KISITLAMAZ — yalniz `select` kisitlar. Yani bu uc bugune kadar HER
   * teklifle birlikte `sheets` (tum cok-sayfali grid JSON) ve `originalFile`
   * (ham .xlsx BYTEA) donduruyordu. Buffer JSON'a
   * `{"type":"Buffer","data":[137,80,...]}` seklinde, bayt basina sayi+virgul
   * olarak serilesir (~4 kat sisme). Dashboard'daki "son 3 teklif" bileseni
   * bu yuzden BUTUN tekliflerin ham dosyalarini indirip 3'unu gosteriyordu.
   *
   * ⚠ `select`e gecerken TUKETICININ OKUDUGU HER ALAN listelenmelidir; eksik
   * birakilan alan `undefined` doner ve sayfa SESSIZCE bozulur. Tuketiciler
   * tek tek okundu:
   *   quotes/page.tsx      -> id, title, createdAt, _count.items, items[].finalPrice
   *   RecentQuotes.tsx     -> id, title, createdAt, _count.items (+ olmayan totalAmount)
   *   profile/page.tsx:130 -> yalniz dizi UZUNLUGU
   *
   * ⚠ DONUS SEKLI DIZI KALIR (bkz. controller notu). Toplam sayi ayri baslikta.
   */
  async findAll(k: TeklifKimligi, sorgu: TekliflerSorgusuDto = {}) {
    // 23.09: kapsam TEK yerden (`teklifKosulu`) — liste, pano karti ve sayac
    // ayni kumeyi gorur. "Son teklifler" izni kapali uye yalniz kendininkini.
    const where: any = teklifKosulu(k);
    if (sorgu.durum) where.durum = sorgu.durum;
    const arama = sorgu.arama?.trim();
    if (arama) {
      where.OR = [
        { title: { contains: arama, mode: 'insensitive' } },
        { musteri: { contains: arama, mode: 'insensitive' } },
        { proje: { contains: arama, mode: 'insensitive' } },
        { quoteNo: { contains: arama, mode: 'insensitive' } },
      ];
    }
    const adet = sorgu.adet ?? 100;
    const sayfa = sorgu.sayfa ?? 1;

    const [kayitlar, toplam] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          durum: true,
          quoteNo: true,
          rev: true,
          musteri: true,
          proje: true,
          displayCurrency: true,
          // Toplam tutar ON YUZDE bu diziden hesaplanir (quotes/page.tsx
          // `calculateTotal`). Sunucudan ayrica bir `toplamTutar` alani
          // DONDURULMEDI: ayni sayi icin iki kaynak, bu depoda tekrarlayan
          // bir hata sinifi ("ikiz kaynak") olurdu.
          items: { select: { id: true, finalPrice: true } },
          _count: { select: { items: true } },
          // ── FAZ 7 F1b (§3.8): "HAZIRLAYAN: X (ayrildi)" ────────────────
          // ⚠ `userId` de doner: on yuz KENDI teklifinde bu satiri
          // gostermez (tek kisilik firmada hic gorunmesin).
          userId: true,
          user: {
            select: {
              ad: true, soyad: true, email: true,
              kapatilanEposta: true, deletedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (sayfa - 1) * adet,
        take: adet,
      }),
      this.prisma.quote.count({ where }),
    ]);
    // ⚠ AD CAKISMASI NOTU: `Quote.hazirlayan` semada AYRI bir metin alanidir
    // (teklif antedine elle yazilan ad) ve bu select'te YOK. Buradaki
    // `hazirlayan` FIRMA UYESIDIR. Iki alan ayni yanitta hicbir zaman
    // bulunmaz; karistirmamak icin bu not birakildi.
    return {
      kayitlar: kayitlar.map(({ user, ...q }) => ({
        ...q,
        hazirlayan: hazirlayanGorunumu(user),
      })),
      toplam,
    };
  }

  async findOne(k: TeklifKimligi, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: teklifKosulu(k, { id }),
      include: {
        items: { include: { brand: true, laborFirma: true } },
        user: { select: { email: true } },
      },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  async remove(k: TeklifKimligi, id: string) {
    const quote = await this.prisma.quote.findFirst({ where: teklifKosulu(k, { id }) });
    if (!quote) throw new NotFoundException('Quote not found');
    return this.prisma.quote.delete({ where: { id } });
  }


  // ═══════════════════════════════════════════════════════════════════
  // PRD TEKLIF FORMATIM (v2.1) — profesyonel cikti: format kapak/icmal +
  // musteri workbook kopyasi (T1) + formullu fiyatlar + rev arsivi (T10)
  // ═══════════════════════════════════════════════════════════════════

  /** Teklif bilgileri (kapak alanlari) + format secimi. */
  async updateInfo(k: TeklifKimligi, id: string, dto: {
    musteri?: string; proje?: string; hazirlayan?: string; gecerlilik?: string; formatId?: string | null;
    displayCurrency?: string; displayRate?: number | null; displayRateDate?: string | null;
    displayLanguage?: string; durum?: string;
  }) {
    const quote = await this.prisma.quote.findFirst({ where: teklifKosulu(k, { id }) });
    if (!quote) throw new NotFoundException('Quote not found');
    if (dto.formatId) {
      const f = await (this.prisma as any).quoteFormat.findFirst({ where: { id: dto.formatId, firmaId: k.firmaId } });
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
        // 13.08: dil de kalici — beyaz liste disi deger DOKUNMAZ (kismi PATCH).
        displayLanguage: ['tr', 'en'].includes(dto.displayLanguage ?? '')
          ? dto.displayLanguage : undefined,
        // FAZ 4.6 — SATIS DURUMU.
        // ⚠ BEYAZ LISTE SERVISTE, ELLE: bu ucun govdesi controller'da SATIR-ICI
        // TIP LITERALIYLE aliniyor, yani global ValidationPipe DEVREYE GIRMEZ
        // (metatype `Object` olur ve pipe susar — bu depoda olculmus bir kusur).
        // `displayCurrency`/`displayLanguage` ayni sebeple burada suzuluyor;
        // ayni deseni izliyoruz. Beyaz liste disi deger DOKUNMAZ (kismi PATCH),
        // yani gecersiz bir durum gonderilirse alan degismeden kalir — Prisma
        // enum hatasiyla 500 dondurmez.
        durum: ['HAZIRLANIYOR', 'GONDERILDI', 'KAZANILDI', 'KAYBEDILDI'].includes(dto.durum ?? '')
          ? dto.durum : undefined,
      } as any,
      // ⚠ `durum` BURAYA DA EKLENMELI: `select` dar oldugu icin, data'ya yazip
      // select'e eklemeyi unutmak "yazildi ama yanitta yok" durumu uretir ve
      // on yuz eski degeri gostermeye devam eder.
      select: { id: true, musteri: true, proje: true, hazirlayan: true, gecerlilik: true, formatId: true, displayCurrency: true, displayLanguage: true, durum: true } as any,
    });
  }

  /** Format cozumu (Bulgu B1/B2 sertlestirmesi): teklifte secili → kullanicinin
   *  varsayilani → kullanicinin EN SON formati → yerlesik sade (YALNIZ hic
   *  format yoksa, T8). Kullanicinin formati varken sample'a SESSIZ dusus
   *  YASAK; hangi formatin kullanildigi loglanir ve FE'ye tasinir.
   *  DB'deki bytes DEGISMEZ (T13) — her cagri taze kopya yukler. */
  private async resolveFormatWb(k: Kimlik, quote: any): Promise<{
    wb: ExcelJS.Workbook; formatAdi: string; formatKaynak: 'kullanici' | 'yerlesik';
    sheetRoles: Record<string, 'sabit' | 'liste'> | null;
  }> {
    let kayit = quote.formatId
      ? await (this.prisma as any).quoteFormat.findFirst({ where: { id: quote.formatId, firmaId: k.firmaId } })
      : null;
    if (!kayit) {
      kayit = await (this.prisma as any).quoteFormat.findFirst({ where: { firmaId: k.firmaId, isDefault: true } });
    }
    if (!kayit) {
      // Varsayilan isaretli yoksa EN SON yuklenen format kullanilir
      kayit = await (this.prisma as any).quoteFormat.findFirst({
        where: { firmaId: k.firmaId }, orderBy: { createdAt: 'desc' },
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

  /**
   * TEK INDIRME = TEK KUR OKUMASI (hesap dogrulugu turu, 13.09).
   *
   * ⚠ Eskiden `exportXlsx` kuru UC KEZ okuyordu (kur notu, dosya birimi, ozet
   * simgesi). Cagrilar arasinda sonuc degisirse (onbellek yokken gecici
   * kesinti, TTL siniri) dosya TL inerken ozet "$" diyordu. Kur bir kez
   * okunur, not/birim/ozet AYNI nesneden turer. Servis hatasi indirmeyi
   * DUSURMEZ: `null` → TL cikti, kur notu yok.
   */
  private async kurOku(): Promise<any | null> {
    try {
      return await this.exchangeRates.getRates();
    } catch {
      return null;
    }
  }

  /** T12: kur notu — ekrandaki (TCMB) kur + tarih. Cikti aninda soru YOK.
   *  ⚠ KUR YOKSA NOT YOK (13.09): servis TCMB'ye ve yedek kaynaga ulasamayinca
   *  1:1 doner (`source: 'fallback'`); eskiden musterinin ICMAL'ine
   *  "Kur: 1 USD = 1,00 TL (TCMB, …)" yaziliyordu. Esik `exportBirimi` ile
   *  AYNI: 1 TL'yi gecmeyen kur alinamamis sayilir. */
  private kurNotuUret(r: any | null): string {
    if (!r || !(Number(r.usdTry) > 1) || !(Number(r.eurTry) > 1)) return '';
    const tarih = r.date || new Date().toLocaleDateString('tr-TR');
    return `Kur: 1 USD = ${r.usdTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL · 1 EUR = ${r.eurTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL (TCMB, ${tarih})`;
  }

  private ctxTemelUret(quote: any, rev: number, kurNotu: string): Omit<FillContext, 'sekmeler'> {
    return {
      teklifNo: quote.quoteNo ?? `MP-${new Date().getFullYear()}-TASLAK`,
      rev,
      tarih: new Date().toLocaleDateString('tr-TR'),
      musteri: quote.musteri,
      proje: quote.proje,
      hazirlayan: quote.hazirlayan,
      gecerlilik: quote.gecerlilik,
      kurNotu,
      kdvOran: KDV_ORAN,
    };
  }

  /**
   * FIRMA ANTETI (plan 4.4) — iki cikti yolu da AYNI kaydi okur.
   *
   * Olculdu (13.09): iki yol da firma kaydini HIC okumuyordu, oysa profil
   * sayfasi logonun ve firma bilgisinin "teklif çıktısının antedinde"
   * kullanildigini soyluyordu (vaat var, baglanti yok).
   *
   * Okuma hatasi indirmeyi DUSURMEZ (KH2): antetsiz cikti uretilir ve sebep
   * loglanir — sessiz yutma degil.
   *
   * `not`: yuklu logo antete GIRMEDIYSE nedeni (WEBP / okunamayan dosya) —
   * indirme ozetine eklenir; kullanici logosunun neden gorunmedigini ogrenir.
   */
  private async antetGetir(k: Kimlik, dil?: string): Promise<{ antet: AntetBilgi | null; not: string | null }> {
    try {
      const firma = await this.prisma.firma.findUnique({ where: { id: k.firmaId }, select: ANTET_FIRMA_ALANLARI });
      return { antet: antetKur(firma, dil), not: antetLogoNotu(firma) };
    } catch (e) {
      console.warn(`[Export] ⚠ firma anteti okunamadi, antetsiz uretiliyor: ${(e as Error)?.message ?? e}`);
      return { antet: null, not: null };
    }
  }

  /** Indirme ozetine (X-Export-Summary) ek bilgi — bos not ozeti degistirmez. */
  private notEkle(ozet: string | undefined, not: string | null): string | undefined {
    return not ? (ozet ? `${ozet} · ${not}` : not) : ozet;
  }

  /** Cikti ve arsiv yollarinin TEK teklif okumasi (kapsam `teklifKosulu`). */
  private async quoteGetir(k: TeklifKimligi, id: string) {
    const quote = await this.prisma.quote.findFirst({ where: teklifKosulu(k, { id }) });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote as any;
  }

  /** PANO 18: teklifin GORUNTULEME birimi → export cevirisi (canli TCMB;
   *  kutuphane orijinal birimleri DEGISMEZ — yalniz cikti goruntusu). */
  private exportBirimi(quote: any, r: any | null): ExportBirim | null {
    const kod = quote.displayCurrency;
    if (kod !== 'USD' && kod !== 'EUR') return null;
    const tryPer = kod === 'USD' ? r?.usdTry : r?.eurTry;
    if (!tryPer || tryPer <= 1) return null; // kur alinamadi (ya da servis hatasi) → guvenli TL
    const kur = Number(tryPer).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return {
      kod,
      katsayi: 1 / Number(tryPer),
      not: `Fiyatlar ${kod} — 1 ${kod} = ₺${kur} (TCMB, ${r?.date ?? new Date().toLocaleDateString('tr-TR')})`,
    };
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

  private async ciktiKur(k: Kimlik, quote: any, rev: number, dil: string | undefined, kur: any | null): Promise<ExportSonucu & { formatAdi: string; formatKaynak: 'kullanici' | 'yerlesik'; birim: ExportBirim | null; antetNotu: string | null }> {
    // Bulgu Raporu kok neden: grid'den uretim SILINDI — orijinal dosya ZORUNLU.
    if (!quote.originalFile) {
      throw new BadRequestException(
        'Bu teklifte orijinal Excel dosyası kayıtlı değil — dışa aktarım için keşif Excel\'ini yükleyip teklifi yeniden kaydedin.',
      );
    }
    const { wb: formatWb, formatAdi, formatKaynak, sheetRoles } = await this.resolveFormatWb(k, quote);
    const sheetsArr = Array.isArray(quote.sheets) ? (quote.sheets as any[]) : [];
    const birim = this.exportBirimi(quote, kur); // PANO 18 (KF7: iki yol ayni)
    // USD/EUR teklifte rakamlarin birimi ICMAL notunda da SOYLENIR — eskiden
    // "Fiyatlar USD" notu yalniz fiyatli yolda vardi (ikiz eksigi, 13.09).
    const kurNotu = [birim?.not, this.kurNotuUret(kur)].filter(Boolean).join(' · ');
    const firmaAntet = await this.antetGetir(k, dil); // plan 4.4 (ikizi fiyatli yolda)
    const sonuc = await buildExportWorkbook({
      originalFile: Buffer.from(quote.originalFile),
      sheetsArr,
      formatWb,
      sheetRoles,
      ctxTemel: this.ctxTemelUret(quote, rev, kurNotu),
      overrides: (quote.exportOverrides ?? null) as ExportOverrides | null,
      birim,
      dil, // 13.08: baslik + birim dili (ikizi fiyatli cikti yolunda)
      antet: firmaAntet.antet,
    });
    return { ...sonuc, formatAdi, formatKaynak, birim, antetNotu: firmaAntet.not };
  }

  // ARINMA Faz 2 (A+B): exportPreview + saveOverrides SILINDI — Cikti
  // Onizleme sayfasi c947983'te kaldirilmisti, FE'de 0 cagri kalmisti.
  // quote.exportOverrides ALANI ve applyOverrides motoru KORUNUR (T13/T14):
  // eski kayitli override'lar ciktiKur uzerinden islenmeye devam eder.

  /** .xlsx uret + REV artir + arsivle (T10). */
  async exportXlsx(k: TeklifKimligi, id: string, dil?: string): Promise<{ buffer: Buffer; filename: string; rev: number; quoteNo: string; uyari?: string; ozet?: string }> {
    const quote = await this.quoteGetir(k, id);
    // 13.08: parametre yoksa teklifin KAYITLI dili konusur (bayat istemci
    // korumasi — bkz. exportDili).
    const secim = this.exportDili(quote, dil);
    // Faz 6.10 (R1-B6): Ingilizce dosya kapisi quoteNo/rev/arsivden ONCE —
    // reddedilen indirme numara yakmaz, revizyon yazmaz. Sayfalar bu
    // indirmenin kopyasidir; DB'ye YAZILMAZ.
    const ceviri = secim.dil === 'en'
      ? await this.ceviri.disaAktarimCevirisi(k, id, quote.sheets, secim.kaynak)
      : this.turkceCikti(quote.sheets, secim);
    dil = ceviri.dil;

    // Teklif no ILK aktarimda atanir, sonra SABIT (T10)
    let quoteNo: string = quote.quoteNo;
    if (!quoteNo) {
      const yil = new Date().getFullYear();
      const sayac = await this.prisma.quote.count({
        // Teklif no sayaci FIRMA basina — ayni firmanin iki uyesi ortak
        // numara dizisini paylasir (MP-2026-001, -002 ...).
        where: { firmaId: k.firmaId, quoteNo: { not: null } } as any,
      });
      quoteNo = `MP-${yil}-${String(sayac + 1).padStart(3, '0')}`;
    }
    const yeniRev = (quote.rev ?? 0) + 1;

    const sonuc = await this.ciktiKur(k, { ...quote, quoteNo }, yeniRev, dil, await this.kurOku());
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
    const kontrol = parcalar.length > 0 ? `${parcalar.join('; ')} — çıktıyı kontrol edin.` : undefined;
    if (kontrol) console.warn(`[Export] ⚠ SELF-CHECK (teklif format): ${kontrol}`);
    const uyari = [kontrol, ceviri.uyari].filter(Boolean).join('; ') || undefined;
    // PANO 21a: gorunur ozet (KF7 — iki yol ayni self-check'i tasir)
    const ozet = this.notEkle(this.ceviriOzetiEkle(this.exportOzeti({
      yazilan: sonuc.yazilanDeger ?? 0,
      beklenen: sonuc.beklenenDeger ?? 0,
      fiyatsiz: sonuc.fiyatsizSatir ?? 0,
      toplam: sonuc.sekmeler.reduce((a, b) => a + b.matDeger + b.labDeger, 0),
    }, sonuc.birim), ceviri.cevrilen), sonuc.antetNotu);
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
  async exportPricedXlsx(k: TeklifKimligi, id: string, dil?: string): Promise<{ buffer: Buffer; filename: string; uyari?: string; ozet?: string }> {
    const quote = await this.quoteGetir(k, id);
    const sheetsArr = Array.isArray(quote.sheets) ? (quote.sheets as any[]) : [];
    if (sheetsArr.length === 0) {
      throw new BadRequestException('Bu teklifte sayfa verisi yok — keşif Excel dosyasını yükleyip teklifi yeniden kaydedin.');
    }
    // IKIZ (teklif-format yolunun aynisi): iki cikti yolundan biri Ingilizce
    // inip digeri Turkce inseydi, kullanici hangisini indirdigine gore farkli
    // bir gercek yasardi.
    const secim = this.exportDili(quote, dil); // bayat istemci korumasi (bkz. exportDili)
    const ceviri = secim.dil === 'en'
      ? await this.ceviri.disaAktarimCevirisi(k, id, sheetsArr, secim.kaynak)
      : this.turkceCikti(sheetsArr, secim);
    dil = ceviri.dil;
    // PANO 18/EX6: ekrandaki birim — TL teklifte kur servisine HIC gidilmez
    const dovizli = quote.displayCurrency === 'USD' || quote.displayCurrency === 'EUR';
    const birim = this.exportBirimi(quote, dovizli ? await this.kurOku() : null);
    // ⚠ OLU KOD ONARIMI (08.09 olcumu): burasi `customerName` ve `projectName`
    // okuyordu — bu adlar Prisma semasinda, backend'de ve on yuzde BASKA
    // HICBIR YERDE gecmiyor (gercek alanlar `musteri` ve `proje`). `as any`
    // cast'i tsc'yi susturdugu icin kimse gormedi ve sonuc su oldu: bu basliga
    // musteri/proje adi HIC girmiyordu, baslik daima yalniz `title`di.
    // Cast KALDIRILDI — bir daha olmayan bir alan okunursa derleme patlar.
    const baslikParcalari = [quote.title, quote.musteri, quote.proje]
      .map((x) => String(x ?? '').trim()).filter(Boolean);
    const firmaAntet = await this.antetGetir(k, dil); // plan 4.4 (ikizi format yolunda)
    const sonuc = await standartCiktiUret({
      sheetsArr,
      birim,
      // KAYIT yolunda Turkceye indirgenen dosya bunu KENDI basliginda soyler:
      // KVKK baglantisi ham indirmedir, HTTP uyari basligi kullaniciya gorunmez.
      baslik: baslikParcalari.join(' · ') + (ceviri.indirgendi ? ' · Türkçe (İngilizce çevirisi yok)' : ''),
      // ...ve dosya ACILINCA gorunen ilk sekmede (ORTA-1): Excel son sekmeyi acmaz.
      acilisNotu: ceviri.indirgendi ? KAYIT_INDIRGEME_UYARISI : undefined,
      // Kolon basliklari + birim kisaltmalari (sabit sozluk, AI yok).
      dil,
      antet: firmaAntet.antet,
    });
    // EX7: görünür self-check — fiyatsız satır sayısı da bilgi olarak taşınır.
    // Sayim YAZIM MOTORUNDAN gelir (rol alanlariyla): format yoluyla AYNI olcut;
    // eskiden sabit `_matBirim` alanini okuyup eski (colN) kayitlarda fiyatli
    // satiri da fiyatsiz sayiyordu.
    const fiyatsiz = sonuc.fiyatsizSatir;
    const ozet = this.notEkle(this.ceviriOzetiEkle(
      fiyatsiz > 0 ? `${sonuc.ozet} · ${fiyatsiz} satır fiyatsız (eşleşmemiş)` : sonuc.ozet,
      ceviri.cevrilen,
    ), firmaAntet.not);
    const temizBaslik = String(quote.title ?? 'Teklif').replace(/[\/:*?"<>|]/g, '-').slice(0, 60);
    const filename = `${temizBaslik} - Fiyatlandırılmış Teklif.xlsx`;
    console.log(`[Export] Standart fiyatlı çıktı (${(sonuc.buffer.length / 1024).toFixed(0)} KB) — ${ozet}`);
    return { buffer: sonuc.buffer, filename, uyari: ceviri.uyari, ozet };
  }

  /** T10 arsivi: uretilmis revizyonlar. */
  async listExports(k: TeklifKimligi, id: string) {
    await this.quoteGetir(k, id);
    return (this.prisma as any).quoteExport.findMany({
      where: { quoteId: id },
      select: { id: true, rev: true, fileName: true, createdAt: true },
      orderBy: { rev: 'desc' },
    });
  }

  async downloadExport(k: TeklifKimligi, id: string, rev: number): Promise<{ buffer: Buffer; filename: string }> {
    await this.quoteGetir(k, id);
    const e = await (this.prisma as any).quoteExport.findFirst({ where: { quoteId: id, rev } });
    if (!e) throw new NotFoundException('Revizyon bulunamadi');
    return { buffer: Buffer.from(e.xlsxBytes), filename: e.fileName };
  }

  // ARINMA Faz 2C: exportPdfPro + HTML-PDF fallback (listeBloklariHtml +
  // puppeteer) SILINDI — kullanici karari 24.07 "pdf olmasin", FE'de 0
  // cagri. xlsx-to-pdf util'i KORUNDU (quote-formats preview-pdf canli).
  // Geri getirme: git show pre-arinma:backend/src/quotes/quotes.service.ts
}
