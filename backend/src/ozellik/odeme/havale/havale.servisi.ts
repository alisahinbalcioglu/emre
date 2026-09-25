import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { HavaleDurumu, Prisma } from '@prisma/client';
import { AbonelikServisi } from '../abonelik/abonelik.servisi';
import { FaturaServisi } from '../fatura/fatura.servisi';
import { EpostaServisi } from '../eposta/eposta.servisi';
import { havaleIptalEpostasi } from '../eposta/musteri-epostalari';
import { tarihYaz, tutarYaz } from '../dunning/dunning.metinleri';
import { etkinHesapKosulu } from '../../firma/uyelik-kurallari';
import { koltukEtkisi } from '../abonelik/yonetici/yonetici-islemi';

/** Düşürmenin koltuk etkisi — sayım `etkinHesapKosulu`, kural `koltukEtkisi`. */
export interface HavaleKoltukEtkisi {
  aktifUye: number;
  yeniHak: number;
  toplamDurdurulan: number;
  yeniDurdurulan: number;
}

/**
 * Yöneticiye, teklif ANINDA (API yanıtı — havale için yönetici ekranı yok).
 * Kimin durduğu kodla aynı: sıra önce sahipler, sonra üyeler, katılım
 * zamanına göre; `max(hak, 1)`i aşan EN SON katılanlar durur
 * (`uyelik-kurallari.ts` `koltukSirasiKarari`).
 */
export function koltukUyarisiMetni(k: HavaleKoltukEtkisi): string {
  return (
    `Firmanın ${k.aktifUye} etkin hesabı var; teklifteki paket firma sahibi dahil ${k.yeniHak} kişilik. ` +
    `Onaylanırsa ekibe en son katılan ${k.toplamDurdurulan} kişinin erişimi durur (verileri silinmez). ` +
    'Müşteriyle önceden konuşun; teklif yine de geçerlidir.'
  );
}

/**
 * Müşteriye, onay e-postasında. Dil ön yüzdeki `kucultmeUyarisi` ile aynı.
 * Düzeltme yolları KODDAKİ gibi: Ekip sayfası yalnız firma sahibine görünür
 * (menü "Ekip"); havale satırında paket değişimi self-servis değil (A1
 * `HAVALE` reddi) — büyük paket için iletişim.
 */
export function koltukEpostaCumlesi(k: Pick<HavaleKoltukEtkisi, 'yeniHak' | 'toplamDurdurulan'>): string {
  return (
    `Yeni paketiniz firma sahibi dahil ${k.yeniHak} kişilik. Ekibinizden ${k.toplamDurdurulan} kişinin ` +
    'erişimi durduruldu (ekibe en son katılanlar); verileri silinmedi. Firma sahibi hesabıyla uygulamadaki ' +
    'Ekip sayfasından bir üyeyi ekipten çıkararak yer açabilir ya da daha büyük bir paket için bizimle ' +
    'iletişime geçebilirsiniz.'
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Havale / EFT ile yıllık abonelik
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  NEDEN BİRİNCİ SINIF BİR YOL:
 *  Mekanik taahhüt firmalarında satın alma kartla değil, muhasebeden geçerek
 *  olur. Kurumsal kart limitleri düşüktür, internetten ödemeye kapalı olabilir,
 *  ve yıllık peşin havale çoğu zaman firmanın TERCİH ETTİĞİ biçimdir —
 *  katlanmak zorunda kaldığı değil. Kartla ödemeyi tek yol yapan bir SaaS
 *  bu segmentte satış kaybeder.
 *
 *  AKIŞ:
 *      TEKLIF ──► FATURA_KESILDI ──► ODEME_BEKLENIYOR ──► ONAYLANDI
 *                                                            │
 *                                          abonelik N ay uzatılır
 *
 *  Abonelik kaydının `odemeYontemi` alanı HAVALE olur; dunning zamanlayıcısı
 *  ve gece mutabakatı bu kayıtları atlar (sorgularında odemeYontemi:'KART'
 *  filtresi var). Havale yolunun KENDİ açtığı satırda `iyzicoAbonelikKodu`
 *  null'dır ve iyzico akışa hiç karışmaz.
 *
 *  ⚠ KARTTAN HAVALEYE GEÇEN MÜŞTERİ (24.09.2026 — Emre kararı): satırda
 *  kart aboneliğinin kodu VARDIR ve iyzico'da abonelik açıktı. Eskiden onay
 *  yalnız ödeme yöntemini değiştiriyordu: iyzico dönem sonunda karttan da
 *  çekiyor (çift tahsilat, havale dönemi `endPeriod`a kısalıyordu) ya da
 *  reddi "Ödemeniz alınamadı" diye müşteriye yansıtıyordu. Artık onaydan
 *  sonra kart aboneliği iyzico'da KAPATILIR; kapatılamazsa onay YİNE geçer,
 *  yöneticiye yazılır. Geç gelen webhook'lar satırı değiştirmez. Kural:
 *  `AbonelikServisi` → "HAVALE ↔ KART ABONELİĞİ"; kapısı
 *  `backend/test/havale-iyzico-cakismasi-test.ts`.
 *
 *  ⚠ DURUM GEÇİŞLERİ (25.09.2026): onay, "fatura kesildi" ve iptal durumu
 *  işlem dışında okunan satıra göre DEĞİL, tek koşullu UPDATE'le yazar
 *  (`ONAYLANABILIR`); ONAYLANDI ve IPTAL geri dönülmez. Eskiden aynı havaleye
 *  iki onay iki kez uzatıyor, onaydan sonra girilen fatura numarası satırı
 *  bekleyenlere geri çekip ikinci onaya kapı açıyor, onayla yarışan iptal
 *  ONAYLANDI'yı eziyordu (ölçüldü). Kapısı
 *  `backend/test/havale-onay-yarisi-test.ts`.
 *
 *  ⚠ TEKLİFİN PAKETİ (25.09.2026 — Emre kararı: "onayda hemen uygula"):
 *  teklif paketini `HavaleOdemesi.paketSurumuId`de taşır; onay o paketi
 *  aboneliğin ETKİN paketi yapar ve karttan kalan paket değişimi izlerini
 *  siler (`odenenPaketiYaz`). Eskiden paket hiç saklanmıyordu: satırı olan
 *  firmada teklifin paketi yok sayılıyor, Basic müşteri Pro teklifini
 *  ödeyince Basic kalıyordu — erişim, koltuk, DWG, fatura kalemi ve müşteri
 *  e-postası hep "Basic" (ölçüldü). Kapısı
 *  `backend/test/havale-teklif-paketi-test.ts`.
 *
 *  ⚠ KOLTUK (25.09.2026 — Emre kararı): paket onayda HEMEN değiştiği için
 *  düşürme, kullanıcı hakkını aşan en son katılan hesapları o an durdurur
 *  (kural `uyelik-kurallari.ts` `koltukSirasiKarari`, her istekte türetilir).
 *  Teklif yanıtı yöneticiyi ÖNCEDEN uyarır (`uyari`, teklif reddedilmez);
 *  onay e-postası müşteriye kaç kişinin durduğunu ve nasıl açılacağını
 *  söyler. Yalnız BU değişimin durdurduğu biri varsa — yükseltme ve aynı
 *  paket uyarı üretmez (`koltukEtkisi`). Kapısı aynı dosya, S bloğu.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ONAYLANABİLİR HAVALE: onay bekleyen durumda VE hiç onaylanmamış. Durum
 * yazan üç yol (onayın sahiplenmesi, "fatura kesildi", iptal) ve yönetim
 * listesi (`bekleyenler`) AYNI koşulu okur: listede görünen satır
 * onaylanabilir olandır. `onaylandi`yı yalnız onay yazar ve hiçbir yol
 * silmez: durumu 25.09 öncesi "fatura kesildi" kusuruyla geri çekilmiş
 * onaylı satır da onaylı sayılır. KAPALI liste — şemaya eklenen yeni bir
 * durum kendiliğinden onaylanabilir OLMAZ.
 */
/**
 * İptalde müşteriye e-posta giden durumlar (25.09): müşteri ödeme sürecine
 * GİRMİŞ — fatura/proforma kesilmiş ya da ödeme bekleniyor. TEKLIF aşaması
 * sistemden müşteriye iletilmez; iptali de duyurulmaz.
 */
const MUSTERIYE_BILDIRILEN_IPTAL_DURUMLARI: HavaleDurumu[] = [
  HavaleDurumu.FATURA_KESILDI,
  HavaleDurumu.ODEME_BEKLENIYOR,
];

const ONAYLANABILIR: Prisma.HavaleOdemesiWhereInput = {
  durum: {
    in: [
      HavaleDurumu.TEKLIF,
      HavaleDurumu.FATURA_KESILDI,
      HavaleDurumu.ODEME_BEKLENIYOR,
    ],
  },
  onaylandi: null,
};

@Injectable()
export class HavaleServisi {
  private readonly logger = new Logger(HavaleServisi.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly abonelik: AbonelikServisi,
    private readonly fatura: FaturaServisi,
    private readonly eposta: EpostaServisi,
  ) {}

  /** 1. Teklif oluştur — müşteriye gönderilecek. */
  async teklifOlustur(p: {
    firmaId: string;
    paketSurumuId: string;
    ayAdedi: number;
    tutar: number;
    paraBirimi?: string;
    aciklama?: string;
    olusturanId: string;
  }) {
    if (p.ayAdedi < 1 || p.ayAdedi > 36) {
      throw new BadRequestException('Ay adedi 1 ile 36 arasında olmalı');
    }

    // ⚠ 25.09 — TEKLİFİN PAKETİ ZORUNLU ve VAR OLMALI: onayda hesabın paketi
    // olur. Gövde satır içi tip literaliyle gelir (ValidationPipe DENETLEMEZ);
    // eskiden mevcut satırda paket hiç okunmadığı için eksik ya da yanlış
    // kimlik sessizce geçiyordu. Satış dışı sürüm (miras yenilemesi) serbest:
    // paketi yönetici seçer.
    const surum = p.paketSurumuId
      ? await this.prisma.paketSurumu.findUnique({
          where: { id: p.paketSurumuId },
          select: { id: true, paket: { select: { kod: true, ad: true, kullaniciHakki: true } } },
        })
      : null;
    if (!surum) {
      throw new BadRequestException('Teklifin paketi (paketSurumuId) bulunamadı');
    }

    // ⚠ 25.09 — KOLTUK ÖN BİLGİSİ (Emre kararı): onay paketi HEMEN değiştirir;
    // düşürme ekibin en son katılanlarını durdurur. Havale için yönetici
    // ekranı yok, teklif API'den verilir → yanıt bunu ÖNCEDEN söyler ki
    // yönetici müşteriyle konuşsun. Teklif REDDEDİLMEZ. Bugünkü paket satır
    // açılmadan ÖNCE okunur: satırı olmayan firmada koltuk kuralı işlemiyordu.
    const bugunku = await this.prisma.abonelik.findUnique({
      where: { firmaId: p.firmaId },
      select: { paketSurumu: { select: { paket: { select: { kullaniciHakki: true } } } } },
    });
    const koltuk = await this.koltukEtkisiOku(
      p.firmaId,
      bugunku?.paketSurumu?.paket?.kullaniciHakki ?? null,
      surum.paket.kullaniciHakki,
    );
    const uyari =
      koltuk.yeniDurdurulan > 0
        ? {
            durdurulacakUyeSayisi: koltuk.toplamDurdurulan,
            yeniSinir: koltuk.yeniHak,
            mevcutAktif: koltuk.aktifUye,
            mesaj: koltukUyarisiMetni(koltuk),
          }
        : null;

    const abonelik = await this.abonelikBulYaDaOlustur(
      p.firmaId,
      p.paketSurumuId,
    );

    const teklifNo = await this.teklifNoUret();

    const kayit = await this.prisma.havaleOdemesi.create({
      data: {
        abonelikId: abonelik.id,
        paketSurumuId: surum.id,
        durum: HavaleDurumu.TEKLIF,
        tutar: new Prisma.Decimal(p.tutar),
        paraBirimi: p.paraBirimi ?? 'TRY',
        ayAdedi: p.ayAdedi,
        teklifNo,
        aciklama: p.aciklama,
      },
    });

    await this.abonelik.olayYaz(abonelik.id, 'havale.teklif.olusturuldu', {
      aciklama: `${teklifNo} — ${surum.paket.ad}, ${p.ayAdedi} ay, ${tutarYaz(p.tutar)}`,
      aktor: p.olusturanId,
      veri: {
        havaleId: kayit.id,
        teklifNo,
        paketSurumuId: surum.id,
        // Yöneticiye yapılan koltuk uyarısının izi (içerik değil sayı).
        ...(uyari ? { durdurulacakUye: uyari.durdurulacakUyeSayisi } : {}),
      },
    });

    // Yanıt teklifin paketini taşır: yönetici NEYİ teklif ettiğini görür
    // (eskiden yanıtta paket yoktu). `uyari` null = kimse durmaz.
    return { ...kayit, paketSurumu: surum, uyari };
  }

  /**
   * 2. Fatura kesildi işaretle (proforma ya da gerçek fatura).
   *
   * ⚠ 25.09 — DURUMU GERİ ÇEKMEZ. Eskiden koşulsuz ODEME_BEKLENIYOR
   * yazıyordu: onaydan SONRA girilen numara (`elle` muhasebe her tahsilatta
   * NES'te kesim ister, yönetici kestiği faturanın numarasını sonradan
   * girer) onaylı havaleyi bekleyenler listesine döndürüyor, ikinci onay
   * erişimi bir yıl DAHA uzatıyordu; iptal edilmiş teklif de bu yoldan
   * diriliyordu (ölçüldü). Artık onaylanabilir satırda numara +
   * ODEME_BEKLENIYOR (eskisi gibi); iptal edilmiş satırda 400; başka her
   * satırda (onaylı) YALNIZ numara — durum ve onay izi değişmez. İki yazma da
   * tek koşullu UPDATE: eşzamanlı bir onay commit edilince ilki 0 satır
   * görür, onaylı satıra yalnız numara yazılır.
   */
  async faturaKesildi(havaleId: string, faturaNo: string, aktorId: string) {
    // Gövde satır içi tip literaliyle gelir (ValidationPipe DENETLEMEZ):
    // numarasız istek eskiden durumu yine ilerletiyordu; boş veriyle ikinci
    // yazma da hiç koşmaz ve onaylı satır yanlış 400'e düşerdi.
    const no = typeof faturaNo === 'string' ? faturaNo.trim() : '';
    if (!no) throw new BadRequestException('Fatura numarası gerekli');

    const bekleyen = await this.prisma.havaleOdemesi.updateMany({
      where: { id: havaleId, ...ONAYLANABILIR },
      data: { durum: HavaleDurumu.ODEME_BEKLENIYOR, faturaNo: no },
    });
    if (bekleyen.count === 0) {
      const onayli = await this.prisma.havaleOdemesi.updateMany({
        where: { id: havaleId, durum: { not: HavaleDurumu.IPTAL } },
        data: { faturaNo: no },
      });
      if (onayli.count === 0) {
        // Satır yoksa P2025 (eskisi gibi); varsa iptal edilmiştir.
        await this.prisma.havaleOdemesi.findUniqueOrThrow({
          where: { id: havaleId },
          select: { id: true },
        });
        throw new BadRequestException('İptal edilmiş havaleye fatura kaydedilemez');
      }
    }

    const kayit = await this.prisma.havaleOdemesi.findUniqueOrThrow({
      where: { id: havaleId },
      include: { abonelik: true },
    });

    await this.abonelik.olayYaz(kayit.abonelikId, 'havale.fatura.kesildi', {
      aciklama:
        bekleyen.count > 0
          ? `Fatura ${no}`
          : `Fatura ${no} (durum değişmedi: ${kayit.durum})`,
      aktor: aktorId,
      veri: { havaleId, faturaNo: no },
    });

    return kayit;
  }

  /**
   * 3. Ödemeyi onayla ve aboneliği uzat.
   *
   * Bütünlük açısından tek işlemde: hem havale kaydı ONAYLANDI olsun hem
   * abonelik uzasın. Biri olup diğeri olmazsa müşteri ya ödediği hâlde
   * giremez ya ödemeden girer. Aynı havaleye gelen iki istekten YALNIZ
   * biri uzatır: karar işlemin ilk yazmasındaki koşullu sahiplenmedir.
   */
  async odemeyiOnayla(p: {
    havaleId: string;
    onaylayanId: string;
    dekontUrl?: string;
    /** Fatura zaten elle kesildiyse otomatik kesim atlanır. */
    faturaKesme?: boolean;
  }) {
    // Hızlı ret + işlemin kullandığı alanlar (abonelik, ay adedi, tutar —
    // teklifte yazılır, sonra değişmez). ⚠ Bu okuma KARAR DEĞİLDİR: aynı
    // anda gelen iki istek ikisi de buradan geçebilir.
    const mevcut = await this.prisma.havaleOdemesi.findUniqueOrThrow({
      where: { id: p.havaleId },
      include: { abonelik: { include: { paketSurumu: true } } },
    });

    if (mevcut.durum === HavaleDurumu.ONAYLANDI) {
      throw new BadRequestException('Bu ödeme zaten onaylanmış');
    }
    if (mevcut.durum === HavaleDurumu.IPTAL) {
      throw new BadRequestException('İptal edilmiş ödeme onaylanamaz');
    }

    const sonuc = await this.prisma.$transaction(async (tx) => {
      // ⚠ 25.09 — KOŞULLU SAHİPLENME, işlemin İLK yazması. Eskiden durum
      // yalnız yukarıda, işlem DIŞINDA okunuyor ve en sonda KOŞULSUZ
      // `update` ONAYLANDI yazıyordu: aynı havaleye iki istek (çift tıklama,
      // yavaş yanıttan sonra yeniden deneme, iki yönetici) ikisi de geçip
      // iki kez uzatıyor, iki "ödemeniz alındı" gönderiyor, denetim izini
      // ikincinin adıyla eziyordu (ölçüldü: 12 ay ödeme → +731 gün).
      // Postgres READ COMMITTED'da güvenli, çünkü karar TEK bir koşullu
      // UPDATE'in etkilediği satır sayısıdır: UPDATE satırı kilitler, ikinci
      // istek kilidi bekler; birinci commit edince WHERE satırın YENİ
      // sürümünde yeniden değerlendirilir (ONAYLANDI → 0 satır), birinci
      // geri alınırsa özgün satırla devam edilir. Prisma 5.22 `updateMany`yi
      // `relationMode` "foreignKeys" (varsayılan) iken tek `UPDATE … WHERE
      // <koşul>` olarak koşar ve sayıyı o deyimden verir (motor kaynağı
      // okundu); "prisma" modu önce id okuyup koşulsuz günceller — bu koruma
      // o zaman ÇÖKER. `ONAYLANABILIR`daki `onaylandi: null`: 25.09 öncesi
      // "fatura kesildi" kusuruyla durumu geri çekilmiş onaylı satır ikinci
      // bir uzatma açamasın. ⚠ Sahiplenme satırı işlem boyunca kilitli tutar:
      // bu sürede gelen iptal ve "fatura kesildi" de kilidi bekler — onlar da
      // koşullu yazdığı için commit'ten sonra ONAYLANDI'yı EZEMEZ.
      const sahiplenme = await tx.havaleOdemesi.updateMany({
        where: { id: p.havaleId, ...ONAYLANABILIR },
        data: {
          durum: HavaleDurumu.ONAYLANDI,
          onaylayanId: p.onaylayanId,
          onaylandi: new Date(),
          dekontUrl: p.dekontUrl,
        },
      });
      if (sahiplenme.count === 0) {
        // Kaybeden istek: satır bu arada onaylandı ya da iptal edildi. İşlem
        // hiçbir şey yazmadı; hata onu geri alır, yan etkiler hiç koşmaz.
        const simdiki = await tx.havaleOdemesi.findUniqueOrThrow({
          where: { id: p.havaleId },
          select: { durum: true },
        });
        throw new BadRequestException(
          simdiki.durum === HavaleDurumu.IPTAL
            ? 'İptal edilmiş ödeme onaylanamaz'
            : 'Bu ödeme zaten onaylanmış',
        );
      }

      const abonelik = await this.abonelik.erisimiUzat(
        mevcut.abonelikId,
        mevcut.ayAdedi,
        {
          aktor: p.onaylayanId,
          aciklama: `Havale onayı — ${mevcut.teklifNo ?? p.havaleId} (${mevcut.ayAdedi} ay)`,
          tx,
        },
      );

      // Ödeme yöntemi + ETKİN PAKET (teklifin paketi) + kart izleri — tek yazım.
      const guncel = await this.odenenPaketiYaz(tx, {
        havaleId: p.havaleId,
        abonelikId: mevcut.abonelikId,
        teklifPaketi: mevcut.paketSurumuId ?? null,
        teklifNo: mevcut.teklifNo,
        aktor: p.onaylayanId,
      });

      const havale = await tx.havaleOdemesi.update({
        where: { id: p.havaleId },
        data: { uzatilanTarih: abonelik.erisimSonu },
      });

      // Yanıt yazılan paketi taşısın (uzatmanın dönüşü eski paketi taşır).
      return { abonelik: guncel, havale };
    });

    // Fatura kuyruğa — işlem dışında, çünkü muhasebe servisi yavaşsa
    // aboneliğin uzaması gecikmemeli.
    if (p.faturaKesme !== false) {
      const donemBasi = new Date();
      await this.fatura
        .kuyrugaAl({
          abonelikId: mevcut.abonelikId,
          tahsilatKodu: `havale:${p.havaleId}`,
          tutar: Number(mevcut.tutar),
          paraBirimi: mevcut.paraBirimi,
          donemBasi,
          donemSonu: sonuc.abonelik.erisimSonu,
        })
        .catch((e) => this.logger.error(`Havale faturası kuyruğa alınamadı: ${e}`));
    }

    // ⚠ 25.09 — KOLTUK (Emre kararı): onay paketi HEMEN değiştirdi; düşürme
    // ekibin en son katılanlarını durdurduysa e-posta bunu AÇIKÇA söyler.
    // Önceki paket işlemden önce okunan satırdan, yazılan paket işlemin
    // dönüşünden (işlem gövdesine dokunulmaz).
    const koltuk = await this.onayKoltukEtkisi(
      mevcut.abonelik.firmaId,
      mevcut.abonelik.paketSurumuId,
      sonuc.abonelik.paketSurumuId,
    );
    await this.musteriyeHaberVer(mevcut.abonelikId, sonuc.abonelik.erisimSonu, koltuk);

    // ⚠ 24.09 — KARTTAN HAVALEYE GEÇİŞ (Emre kararı: "ikisi birden, onay
    // beklemez"): eski kart aboneliği iyzico'da KAPATILIR; kapatılmasaydı
    // iyzico dönem sonunda karttan da çekerdi. Onay iyzico'yu BEKLEMEZ:
    // iptal düşerse olay + yönetici e-postası, onay geri alınmaz (UNPAID
    // aboneliğin iptali iyzico dokümanında tarif edilmiyor; kartı reddedilip
    // havaleye geçen müşteri tam da bu yoldan gelir).
    // SIRA: EN SONDA — işlem, fatura kuyruğu ve müşteri e-postası iyzico'nun
    // yavaşlığından etkilenmesin; süreç burada ölürse onay ve fatura
    // tamamdır, iptal ise sonraki onayda ya da geç gelen kart webhook'unda
    // (havale dalı) yeniden denenir. Buraya yalnız sahiplenmeyi kazanan
    // istek ulaşır: fatura, e-posta ve iptal havale başına EN FAZLA bir kez
    // koşar. ⚠ Süreç commit ile kuyruğa alma arasında ölürse ya da kuyruğa
    // alma düşerse fatura talebi OLUŞMAZ ve yeniden onay 400 aldığı için
    // kendiliğinden yeniden denenmez (25.09 öncesinde de böyleydi) — hata
    // günlüğünü izleyin.
    // Kodu olmayan (havalenin kendi açtığı) ya da zaten kapalı abonelikte
    // iyzico'ya gidilmez.
    await this.abonelik
      .havaleIcinKartAboneliginiKapat(mevcut.abonelikId, {
        aktor: p.onaylayanId,
        neden: `Havale onayı — ${mevcut.teklifNo ?? p.havaleId}`,
      })
      .catch((e) =>
        this.logger.error(
          `Kart aboneliği kapatılamadı (abonelik=${mevcut.abonelikId}): ` +
            `${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    return sonuc;
  }

  async iptalEt(havaleId: string, aktorId: string, neden?: string) {
    const onayliIptalEdilemez =
      'Onaylanmış ödeme iptal edilemez — abonelik uzatıldı. ' +
      'Düzeltme gerekiyorsa aboneliği elle kısaltın.';
    const kayit = await this.prisma.havaleOdemesi.findUniqueOrThrow({
      where: { id: havaleId },
    });
    if (kayit.durum === HavaleDurumu.ONAYLANDI) {
      throw new BadRequestException(onayliIptalEdilemez);
    }
    // ⚠ 25.09 — KOŞULLU: yukarıdaki okuma karar değildir. Eskiden KOŞULSUZ
    // `update` IPTAL yazıyordu: okumadan sonra commit edilen bir onayı ezip
    // uzatılmış, faturası kuyruğa alınmış havaleyi IPTAL gösteriyordu
    // (ölçüldü; onayın sahiplenmesi kilidi işlem boyunca tuttuğu için bu
    // istek o kilidi bekler, commit'ten sonra 0 satır görür).
    const iptal = await this.prisma.havaleOdemesi.updateMany({
      where: { id: havaleId, ...ONAYLANABILIR },
      data: { durum: HavaleDurumu.IPTAL, aciklama: neden },
    });
    if (iptal.count === 0) {
      const simdiki = await this.prisma.havaleOdemesi.findUniqueOrThrow({
        where: { id: havaleId },
      });
      // Zaten iptal: ikinci istek (yeniden deneme) aynı satırı görür, olay
      // ikinci kez yazılmaz. Değilse satır onaylıdır.
      if (simdiki.durum === HavaleDurumu.IPTAL) return simdiki;
      throw new BadRequestException(onayliIptalEdilemez);
    }
    const guncel = await this.prisma.havaleOdemesi.findUniqueOrThrow({
      where: { id: havaleId },
    });
    await this.abonelik.olayYaz(kayit.abonelikId, 'havale.iptal', {
      aciklama: neden,
      aktor: aktorId,
      veri: { havaleId },
    });
    // 25.09 — müşteriye haber: YALNIZ koşullu iptalin KAZANAN yolunda (bu
    // satır 0 dönen ikinci istekte ve onaylı kayıtta koşmaz → TAM BİR KEZ).
    // YALNIZ müşterinin ödeme sürecine GİRDİĞİ kayıtta (fatura/proforma
    // kesildi ya da ödeme bekleniyor): teklif oluşturma sistemden e-posta
    // GÖNDERMEZ, TEKLIF aşamasındaki (ör. yanlış açılmış) bir kaydın iptali
    // müşteriye hiç duymadığı bir şeyi haber verirdi (inceleme M5).
    // Posta hatası iptali düşürmez; günlüğe yazılır.
    if (MUSTERIYE_BILDIRILEN_IPTAL_DURUMLARI.includes(kayit.durum)) {
      await this.musteriyeIptalBildir(guncel).catch((e) =>
        this.logger.error(
          `Havale iptal bildirimi gönderilemedi (havale=${havaleId}): ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }
    return guncel;
  }

  /**
   * Bekleyen (onaylanabilir) havaleler — yönetim ekranı için. `paketSurumu`
   * TEKLİFİN paketi (onayda hesabın paketi olur), `abonelik.paketSurumu`
   * hesabın BUGÜNKÜ paketi; 25.09'a dek yalnız ikincisi dönüyordu ve Pro
   * teklifi listede "Basic" görünüyordu.
   */
  async bekleyenler() {
    return this.prisma.havaleOdemesi.findMany({
      where: ONAYLANABILIR,
      include: {
        paketSurumu: { include: { paket: true } },
        abonelik: { include: { paketSurumu: { include: { paket: true } } } },
      },
      orderBy: { olusturuldu: 'asc' },
    });
  }

  // ── Yardımcılar ─────────────────────────────────────────────────────────

  /**
   * ÖDENEN PAKET = HESABIN PAKETİ (25.09.2026 — Emre kararı: "onayda hemen
   * uygula"). Onayın TEK abonelik yazımı: ödeme yöntemi HAVALE, etkin paket
   * teklifin paketi, karttan kalan paket değişimi izleri silinir.
   *
   * NEDEN KART İZLERİ SİLİNİR: onay kart aboneliğini iyzico'da kapatır
   * (`odemeyiOnayla` sonu) — iyzico'daki bekleyen plan değişimi artık
   * başlamayacak ve havale dönemin paketini belirler. Kalsalardı (ölçüldü):
   *  · `planliPaketSurumuId` + `paketGecisTarihi` → 10 dk taraması ödeme
   *    yöntemine BAKMAZ: havaleyle bir yıl ödenmiş paketi kart döneminin
   *    sonunda planlı pakete indirirdi (müşteri ekranı da "geçilecek" derdi);
   *  · `odenenPaketSurumuId` → müşteri iptali (`iptalEt`) bunu "yeni ücret
   *    başlamadan iptal" sanıp havaleyle ödenmiş paketi ESKİ pakete döndürürdü;
   *  · `paketGecisTarihi` (kilit) → 3 gün sonra "tahsilat bildirimi gelmedi"
   *    emniyet olayı yazılırdı; havalede iyzico tahsilatı hiç gelmez.
   * İkizleri: `SatinAlmaServisi.iptalEt` ve satın almanın satır yazımı aynı
   * üç alanı aynı gerekçeyle temizler.
   *
   * Teklifin paketi NULL (alan eklenmeden önce verilmiş teklif) → etkin paket
   * DEĞİŞMEZ: hangi paket için verildiği bilinmiyor, tahmin yok.
   * ⚠ Bedel (Emre kabul etti): ERKEN ödenen DÜŞÜRME yenilemesinde kalan üst
   * paket günleri onay anında biter — uzatma eski bitişten başlar ama paket
   * hemen değişir.
   */
  private async odenenPaketiYaz(
    tx: Prisma.TransactionClient,
    h: {
      havaleId: string;
      abonelikId: string;
      teklifPaketi: string | null;
      teklifNo: string | null;
      aktor: string;
    },
  ) {
    const once = await tx.abonelik.findUniqueOrThrow({
      where: { id: h.abonelikId },
      select: {
        paketSurumuId: true,
        planliPaketSurumuId: true,
        paketGecisTarihi: true,
        odenenPaketSurumuId: true,
      },
    });
    const yeniPaket = h.teklifPaketi ?? once.paketSurumuId;
    const guncel = await tx.abonelik.update({
      where: { id: h.abonelikId },
      data: {
        odemeYontemi: 'HAVALE',
        paketSurumuId: yeniPaket,
        planliPaketSurumuId: null,
        paketGecisTarihi: null,
        odenenPaketSurumuId: null,
      },
    });

    const kartIzi = {
      planliPaketSurumuId: once.planliPaketSurumuId,
      paketGecisTarihi: once.paketGecisTarihi?.toISOString() ?? null,
      odenenPaketSurumuId: once.odenenPaketSurumuId,
    };
    const kartIziVardi = Object.values(kartIzi).some((v) => v !== null);
    const paketDegisti = yeniPaket !== once.paketSurumuId;
    if (!h.teklifPaketi) {
      this.logger.warn(
        `Havale ${h.teklifNo ?? h.havaleId}: teklifin paketi kayıtlı değil (alan eklenmeden önceki teklif) — ` +
          'etkin paket DEĞİŞTİRİLMEDİ',
      );
    }
    if (paketDegisti || kartIziVardi) {
      const belge = h.teklifNo ?? h.havaleId;
      await tx.abonelikOlayi.create({
        data: {
          abonelikId: h.abonelikId,
          tip: paketDegisti ? 'paket.degisti' : 'paket.degisimi.birakildi',
          oncekiDurum: guncel.durum,
          yeniDurum: guncel.durum,
          aciklama: paketDegisti
            ? `Havale onayı — teklifin paketi uygulandı (${belge})`
            : `Havale onayı — karttaki bekleyen paket değişimi bırakıldı (${belge})`,
          veri: {
            kaynak: 'havale',
            havaleId: h.havaleId,
            teklifNo: h.teklifNo,
            oncekiPaketSurumuId: once.paketSurumuId,
            yeniPaketSurumuId: yeniPaket,
            birakilanKartDegisimi: kartIziVardi ? kartIzi : null,
          },
          aktor: h.aktor,
        },
      });
    }
    return guncel;
  }
  private async abonelikBulYaDaOlustur(firmaId: string, paketSurumuId: string) {
    const mevcut = await this.prisma.abonelik.findUnique({ where: { firmaId } });
    if (mevcut) return mevcut;

    return this.prisma.abonelik.create({
      data: {
        firmaId,
        paketSurumuId,
        durum: 'ASKIDA', // ödeme onaylanınca AKTIF'e geçecek
        erisimSonu: new Date(), // uzatma buradan başlar
        odemeYontemi: 'HAVALE',
      },
    });
  }

  private async teklifNoUret(): Promise<string> {
    const yil = new Date().getFullYear();
    const sayi = await this.prisma.havaleOdemesi.count({
      where: { olusturuldu: { gte: new Date(`${yil}-01-01`) } },
    });
    return `TKF-${yil}-${String(sayi + 1).padStart(4, '0')}`;
  }

  /**
   * Etkin hesap sayısı + koltuk etkisi. Sayım `etkinHesapKosulu` (ekip ekranı
   * ve koltuk kuralıyla AYNI tanım: silinmemiş ve banlı olmayan), kural
   * `koltukEtkisi`.
   */
  private async koltukEtkisiOku(
    firmaId: string,
    eskiHak: number | null,
    yeniHak: number,
  ): Promise<HavaleKoltukEtkisi> {
    const aktifUye = await this.prisma.user.count({ where: { firmaId, ...etkinHesapKosulu() } });
    return { aktifUye, yeniHak, ...koltukEtkisi({ aktifUye, eskiHak, yeniHak }) };
  }

  /**
   * Onayın koltuk etkisi — müşteri e-postası için. ⚠ ASLA FIRLATMAZ: onay ve
   * fatura zaten tamam; okuma düşerse koltuk cümlesi yazılmaz, HATA günlüğü.
   */
  private async onayKoltukEtkisi(
    firmaId: string,
    oncekiPaket: string,
    yeniPaket: string,
  ): Promise<HavaleKoltukEtkisi | null> {
    try {
      const surumler = await this.prisma.paketSurumu.findMany({
        where: { id: { in: [oncekiPaket, yeniPaket] } },
        select: { id: true, paket: { select: { kullaniciHakki: true } } },
      });
      const hak = (id: string) => surumler.find((s) => s.id === id)?.paket?.kullaniciHakki;
      const yeniHak = hak(yeniPaket);
      if (typeof yeniHak !== 'number') return null;
      const eskiHak = hak(oncekiPaket);
      return await this.koltukEtkisiOku(firmaId, typeof eskiHak === 'number' ? eskiHak : null, yeniHak);
    } catch (e) {
      this.logger.error(
        `Havale onayının koltuk etkisi okunamadı (firma=${firmaId}): ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * Havale ödeme kaydı iptal edildi — metin `musteri-epostalari.ts`.
   * Yöneticinin iptal nedeni BİLEREK geçmez (iç not; inceleme M5).
   */
  private async musteriyeIptalBildir(
    kayit: { abonelikId: string; teklifNo: string | null; tutar: Prisma.Decimal; paraBirimi: string },
  ) {
    const ab = await this.prisma.abonelik.findUnique({
      where: { id: kayit.abonelikId },
      select: { firmaId: true },
    });
    if (!ab) return;
    const firma = await this.prisma.firma.findUnique({
      where: { id: ab.firmaId },
      select: { ad: true, faturaEposta: true, yetkiliEposta: true },
    });
    const kime = firma?.faturaEposta ?? firma?.yetkiliEposta;
    if (!firma || !kime) {
      this.logger.warn(`Havale iptal bildirimi ATLANDI: firma ${ab.firmaId} için adres yok`);
      return;
    }
    await this.eposta.gonder({
      kime,
      ...havaleIptalEpostasi({
        firmaAdi: firma.ad,
        teklifNo: kayit.teklifNo,
        tutar: Number(kayit.tutar),
        paraBirimi: kayit.paraBirimi,
        uygulamaUrl: process.env.UYGULAMA_URL ?? '',
      }),
    });
  }

  private async musteriyeHaberVer(abonelikId: string, yeniTarih: Date, koltuk: HavaleKoltukEtkisi | null = null) {
    const ab = await this.prisma.abonelik.findUnique({
      where: { id: abonelikId },
      include: { paketSurumu: { include: { paket: true } } },
    });
    if (!ab) return;
    const firma = await this.prisma.firma.findUnique({
      where: { id: ab.firmaId },
      select: { ad: true, faturaEposta: true, yetkiliEposta: true },
    });
    if (!firma) return;

    await this.eposta
      .gonder({
        kime: firma.faturaEposta ?? firma.yetkiliEposta,
        konu: 'MetaPriceX — ödemeniz alındı, aboneliğiniz uzatıldı',
        baslik: 'Ödemeniz için teşekkürler',
        paragraflar: [
          `${firma.ad} için ${ab.paketSurumu.paket.ad} aboneliğiniz ` +
            `${tarihYaz(yeniTarih)} tarihine kadar uzatıldı.`,
          // YALNIZ bu onayın durdurduğu biri varsa (yükseltme ve aynı paket: yok).
          ...(koltuk && koltuk.yeniDurdurulan > 0 ? [koltukEpostaCumlesi(koltuk)] : []),
          'Faturanız ayrıca iletilecektir.',
          'İyi çalışmalar.',
        ],
        dugme: {
          etiket: 'Uygulamaya git',
          url: `${process.env.UYGULAMA_URL}`,
        },
      })
      .catch((e) => this.logger.error(`Havale bildirimi gönderilemedi: ${e}`));
  }
}
