import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Logger,
  PayloadTooLargeException,
  UseGuards,
} from '@nestjs/common';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DİZİ TAVANI — tek istekte gelen dizinin üst sınırı (06.10.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  `govde-siniri.ts` BAYTI sınırlar; bu dosya ÖĞE SAYISINI. Bu uçların işi
 *  dizinin boyuyla büyür: eşleştirme motoru ad başına çalışır, ızgara kayıtları
 *  satır başına sorgu atar, ValidationPipe iç içe DTO'yu öğe öğe kurup doğrular.
 *  Genel JSON sınırı (50 MB, `main.ts`) yüz binlerce öğeye izin verir; tek istek
 *  bütün kiracıların paylaştığı olay döngüsünü saniyelerce tutabilirdi.
 *
 *  KURAL: tavanı aşan istek 413 + Türkçe mesaj alır, işin HİÇBİRİ yapılmaz.
 *  KIRPMA YOK: bulk-match'te ilk N adı işlemek kalanları sessizce "eşleşmedi"
 *  gösterirdi. Denetim GUARD'dadır: guard'lar pipe'lardan ÖNCE koşar, yani
 *  KURALDAKİ alanın 1M öğeli dizisi öğe öğe dönüştürülmeden/doğrulanmadan
 *  reddedilir (`@ArrayMaxSize` bunu yapamaz — önce bütün diziyi kurar). Adı
 *  kuralda olmayan alanın / üst düzey dizinin pipe maliyeti DURUR — o genel
 *  gövde tavanının (50 MB) işi. Yöntem düzeyinde olduğu için sınıf düzeyindeki
 *  kimlik/abonelik kapılarından SONRA koşar. ⚠ Aynı yönteme başka `@UseGuards`
 *  eklenirse `@DiziTavani`nın ALTINA yazılsın: yöntem guard'ları alttan yukarı
 *  eklenir, üstteki sonra koşar (rol kapısı tavandan önce koşsun).
 *  DEĞİŞMEZ: kapıdan geçen istekte alan ya YOKTUR ya da tavanı aşmayan bir
 *  DİZİDİR. Varsayılan sayaçlı kuralda alan var ama dizi değilse 400: satır içi
 *  tipli uçlarda ValidationPipe doğrulamaz ve servis metni karakter karakter
 *  dolaşırdı (06.10 inceleme HIGH-1: 4 MB metin 4,6 sn duruş, 144 MB yanıt).
 *
 *  TAVANLAR ÖLÇÜLDÜ (canlı salt okuma 06.10; 12 teklif, örneklem küçük →
 *  tavanlar cömert): teklif ızgarası en çok 1.829 satır / 682 benzersiz ad ·
 *  QuoteItem en çok 527 · en büyük teklif `sheets` 730.885 bayt · kütüphane
 *  firma+marka en çok 3.729 satır, firma en çok 23.056 · işçilik liste en çok
 *  3 satır (4 liste). Günlük satırı kimlik taşımaz: yalnız uç, alan, sayı.
 *  Kapı: `test:dizi-tavani`.
 */

/** bulk-match ad dizisi (malzeme + işçilik) · ölçülen 682 benzersiz ad. */
export const ESLESTIRME_AD_TAVANI = 20_000;
/** bulk-match `variantTags`: seçilen adayın varyant etiketleri (motor birkaç
 *  öğe üretir). İstek alanıdır, veritabanında ölçülemez — tavan saldırı sınırı. */
export const VARYANT_ETIKET_TAVANI = 1_000;
/** POST /matching/aliases `kinds` — sözlük kaydı DEPOYA yazılır ve SONRAKİ her
 *  bulk-match onu işler (güvenlik incelemesi HIGH-2, 06.10: sınırsızdı; ~125 bin
 *  öğede yayma yığını taşırıyordu → kalıcı 500). Meşru kayıt birkaç tür taşır
 *  (ön yüz bir adayın türlerini gönderir). DTO'nun `@ArrayMaxSize`'ı da bunu okur. */
export const ALIAS_TUR_TAVANI = 64;
/** POST/PUT /quotes `items` · ölçülen 527 kalem. */
export const TEKLIF_KALEM_TAVANI = 20_000;
/** POST/PUT /quotes `sheets` (ızgara, JSON olarak yazılır) · ölçülen en çok 11 sayfa
 *  (06.10, p99 11). `items` tavanlıyken aynı gövdede tavansızdı (güvenlik MEDIUM-1). */
export const TEKLIF_SAYFA_TAVANI = 200;
/** Teklif sayfalarının TOPLAM satırı · ölçülen en çok 1.829 (başlık/bant dahil). */
export const TEKLIF_SATIR_TAVANI = 20_000;
/** Kütüphane ızgara kaydı `dirtyRows` · ölçülen firma+marka 3.729 satır. */
export const KUTUPHANE_SATIR_TAVANI = 20_000;
/** Kütüphaneye satır EKLEME (`manual-brand`, `brand/:id/rows`) `rows` — DTO'ların
 *  `@ArrayMaxSize`'ı da BUNU okur (tek kaynak; 5.000 değişmedi). DTO tavanı
 *  pipe'ta bütün diziyi kurduktan SONRA reddediyordu (inceleme HIGH-2: 500 bin
 *  satır 11,4 sn); kapı pipe'tan önce keser. */
export const KUTUPHANE_EKLEME_SATIR_TAVANI = 5_000;
/** İşçilik satır dizileri (kayıt, toplu güncelleme, sayfalardan kayıt — sayfaların
 *  TOPLAM satırı) · ölçülen liste 3 satır; Excel yüklemesi binlerce satır olabilir. */
export const ISCILIK_SATIR_TAVANI = 20_000;
/** İşçilik "sayfalardan kaydet": her sayfa ayrı fiyat listesi olur, sayfa başına en
 *  çok 100 ad yoklaması atılır. Sayfa sayısı ölçülmedi ve ucun ön yüzde çağıranı
 *  yok (06.10 git grep) — tavan saldırı sınırı (en kötü ~20 bin sorgu). */
export const ISCILIK_SAYFA_TAVANI = 200;
/** Kütüphane toplu iskonto `ids` · ölçülen firma 23.056 satır (tavana yakın değil
 *  ama tek `in` süzgeci için büyük): servis `TOPLU_ISKONTO_PARCA`'lık parçalarla yazar. */
export const TOPLU_ISKONTO_KIMLIK_TAVANI = 100_000;
/** Toplu iskontoda tek `updateMany` süzgecindeki kimlik sayısı. */
export const TOPLU_ISKONTO_PARCA = 1_000;

export interface DiziKurali {
  /** Gövdedeki alan; günlükte adıyla geçer. */
  readonly alan: string;
  readonly tavan: number;
  /** Kullanıcı mesajındaki öğe adı ("ad", "satır", "kalem"). */
  readonly ogeAdi: string;
  /** Öğe sayısı. Verilmezse `govde[alan]` DİZİSİNİN boyu — alan varsa dizi
   *  olmak zorundadır (değilse 400). Verilirse biçim sayaca bırakılır. */
  readonly say?: (govde: any) => number;
}

/** Nesnenin anahtar sayısı (`units` sözlüğü); nesne değilse 0. */
export const anahtarSayisi = (deger: unknown): number =>
  deger && typeof deger === 'object' && !Array.isArray(deger) ? Object.keys(deger).length : 0;

/** Sayfa dizisindeki TOPLAM satır (`sheets[].rowData`); biçimsiz sayfa 0 sayılır. */
export const sayfaSatirToplami = (sayfalar: unknown): number =>
  Array.isArray(sayfalar)
    ? sayfalar.reduce((t: number, s: any) => t + (Array.isArray(s?.rowData) ? s.rowData.length : 0), 0)
    : 0;

/** bulk-match kuralları — malzeme ve işçilik İKİZİ tek tanımdan (biri unutulmasın). */
export const eslestirmeKurallari = (adAlani: 'materialNames' | 'laborNames', ogeAdi: string): DiziKurali[] => [
  { alan: adAlani, tavan: ESLESTIRME_AD_TAVANI, ogeAdi },
  { alan: 'variantTags', tavan: VARYANT_ETIKET_TAVANI, ogeAdi: 'varyant etiketi' },
  { alan: 'units', tavan: ESLESTIRME_AD_TAVANI, ogeAdi: 'birim bilgisi', say: (g) => anahtarSayisi(g?.units) },
];

const sayiYaz = (n: number) => n.toLocaleString('tr-TR');

export function diziTavaniMesaji(kural: DiziKurali, gelen: number): string {
  return `Tek istekte en çok ${sayiYaz(kural.tavan)} ${kural.ogeAdi} gönderilebilir; bu istekte ${sayiYaz(gelen)} var.`;
}

export class DiziTavaniKapisi implements CanActivate {
  private static readonly gunluk = new Logger('DiziTavani');

  constructor(readonly kurallar: readonly DiziKurali[]) {}

  canActivate(ctx: ExecutionContext): boolean {
    const govde = ctx.switchToHttp().getRequest()?.body;
    for (const kural of this.kurallar) {
      const deger = govde?.[kural.alan];
      if (!kural.say && deger != null && !Array.isArray(deger)) {
        throw new BadRequestException(`Geçersiz istek: "${kural.alan}" bir liste olmalı.`);
      }
      const gelen = kural.say ? kural.say(govde) : Array.isArray(deger) ? deger.length : 0;
      if (gelen > kural.tavan) {
        DiziTavaniKapisi.gunluk.warn(
          `Dizi tavani asildi: ${ctx.getClass().name}.${ctx.getHandler().name} ${kural.alan}=${gelen} > ${kural.tavan}`,
        );
        throw new PayloadTooLargeException(diziTavaniMesaji(kural, gelen));
      }
    }
    return true;
  }
}

/** Uç yöntemine dizi tavanı koyar (yöntem düzeyi guard). */
export function DiziTavani(...kurallar: DiziKurali[]): MethodDecorator {
  return UseGuards(new DiziTavaniKapisi(kurallar));
}
