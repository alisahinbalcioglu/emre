import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  iyzico webhook imza doğrulaması — X-IYZ-SIGNATURE-V3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ÖNCE ŞUNU YAPIN — yoksa hiç imza gelmez:
 *  ─────────────────────────────────────────────────────────────────────────
 *  X-IYZ-SIGNATURE-V3 başlığı hesabınızda VARSAYILAN OLARAK KAPALIDIR.
 *  Açtırmak için entegrasyon@iyzico.com adresine yazmanız gerekiyor.
 *  Bu yüzden aşağıda `zorunlu` bayrağı var: özellik açılana kadar imzayı
 *  doğrulayın ama reddetmeyin, sadece uyarı düşün.
 *
 *  DOKÜMAN ÇELİŞKİSİ — bilerek iki sıralama deniyoruz:
 *  ─────────────────────────────────────────────────────────────────────────
 *  iyzico dokümanının DÜZ METNİ alanları şu sırayla sayıyor:
 *      secretKey, merchantId, eventType, subscriptionRef, orderRef, customerRef
 *  Ama aynı sayfadaki DÖRT kod örneği (JS, PHP, Java, Node) şunu yazıyor:
 *      merchantId, secretKey, eventType, subscriptionRef, orderRef, customerRef
 *
 *  Kod örnekleri dört dilde tutarlı olduğu için muhtemelen doğru olan o.
 *  Ama "muhtemelen" ile imza doğrulaması yazılmaz. Bu yüzden ikisini de
 *  hesaplıyor, hangisinin tuttuğunu `eslesenSira` ile döndürüyoruz.
 *
 *  İLK GERÇEK WEBHOOK'TAN SONRA: günlükte hangi sıranın tuttuğunu görün,
 *  IYZICO_IMZA_SIRASI ortam değişkenini ona sabitleyin. O andan itibaren
 *  tek sıra denenir.
 *
 *  merchantId GÖVDEDE YOK:
 *  ─────────────────────────────────────────────────────────────────────────
 *  Abonelik webhook'unun gövdesinde merchantId alanı bulunmuyor; panelden
 *  aldığınız MID'yi yapılandırmadan vereceksiniz (IYZICO_MERCHANT_ID).
 *
 *  Bu imza, API YANIT imzasıyla AYNI DEĞİLDİR. Yanıt imzası alanları ':'
 *  ile birleştirir. SDK'daki calculateHmacSHA256Signature yardımcısı odur;
 *  burada kullanmayın, her doğrulama başarısız olur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type ImzaSirasi = 'merchantId-once' | 'secretKey-once' | 'bilinmiyor';

export interface AbonelikWebhookGovdesi {
  orderReferenceCode: string;
  customerReferenceCode: string;
  subscriptionReferenceCode: string;
  iyziReferenceCode: string;
  iyziEventType: 'subscription.order.success' | 'subscription.order.failure';
  iyziEventTime: number;
}

export interface ImzaSonucu {
  gecerli: boolean;
  /** Hangi alan sıralaması tuttu — ilk webhook'tan sonra bunu sabitleyin. */
  eslesenSira: ImzaSirasi;
  /** Başlık hiç gelmediyse true. Özellik henüz açılmamış olabilir. */
  imzaYok: boolean;
  beklenen?: { merchantIdOnce: string; secretKeyOnce: string };
}

export interface ImzaAyari {
  merchantId: string;
  secretKey: string;
  /** Sabitlendiyse yalnızca bu sıra denenir. */
  sabitSira?: ImzaSirasi;
}

/** Alanları AYIRAÇSIZ birleştirir — iyzico webhook imzasında ':' yoktur. */
function anahtarUret(
  sira: Exclude<ImzaSirasi, 'bilinmiyor'>,
  ayar: ImzaAyari,
  g: AbonelikWebhookGovdesi,
): string {
  const bas =
    sira === 'merchantId-once'
      ? ayar.merchantId + ayar.secretKey
      : ayar.secretKey + ayar.merchantId;

  return (
    bas +
    g.iyziEventType +
    g.subscriptionReferenceCode +
    g.orderReferenceCode +
    g.customerReferenceCode
  );
}

function hmacHex(anahtar: string, secretKey: string): string {
  return createHmac('sha256', secretKey).update(anahtar).digest('hex');
}

/** Uzunluk farkında da sabit zamanlı davranır. */
function sabitZamanliEsit(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Uzunluklar farklıysa yine de bir karşılaştırma yapıp erken dönmeyelim.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Abonelik webhook'unun imzasını doğrular.
 *
 * @param baslik  req.headers['x-iyz-signature-v3'] — Node başlıkları küçültür
 */
export function abonelikImzasiniDogrula(
  baslik: string | string[] | undefined,
  govde: AbonelikWebhookGovdesi,
  ayar: ImzaAyari,
): ImzaSonucu {
  const gelen = Array.isArray(baslik) ? baslik[0] : baslik;

  if (!gelen) {
    return { gecerli: false, eslesenSira: 'bilinmiyor', imzaYok: true };
  }

  const merchantIdOnce = hmacHex(
    anahtarUret('merchantId-once', ayar, govde),
    ayar.secretKey,
  );
  const secretKeyOnce = hmacHex(
    anahtarUret('secretKey-once', ayar, govde),
    ayar.secretKey,
  );

  const beklenen = { merchantIdOnce, secretKeyOnce };

  // Sıra sabitlendiyse yalnızca onu dene.
  if (ayar.sabitSira && ayar.sabitSira !== 'bilinmiyor') {
    const hedef =
      ayar.sabitSira === 'merchantId-once' ? merchantIdOnce : secretKeyOnce;
    return {
      gecerli: sabitZamanliEsit(gelen, hedef),
      eslesenSira: sabitZamanliEsit(gelen, hedef) ? ayar.sabitSira : 'bilinmiyor',
      imzaYok: false,
      beklenen,
    };
  }

  if (sabitZamanliEsit(gelen, merchantIdOnce)) {
    return {
      gecerli: true,
      eslesenSira: 'merchantId-once',
      imzaYok: false,
      beklenen,
    };
  }
  if (sabitZamanliEsit(gelen, secretKeyOnce)) {
    return {
      gecerli: true,
      eslesenSira: 'secretKey-once',
      imzaYok: false,
      beklenen,
    };
  }

  return { gecerli: false, eslesenSira: 'bilinmiyor', imzaYok: false, beklenen };
}

/**
 * Ödeme (abonelik dışı) webhook'ları FARKLI formüller kullanır.
 * Aynı uca yönlendirmeyin; ayrı controller kullanın.
 */
export function odemeImzasiniDogrula(
  baslik: string | undefined,
  govde: {
    iyziEventType: string;
    paymentId?: string | number;
    iyziPaymentId?: string | number;
    token?: string;
    paymentConversationId?: string;
    status?: string;
  },
  secretKey: string,
  bicim: 'direct' | 'hpp',
): boolean {
  if (!baslik) return false;
  const anahtar =
    bicim === 'direct'
      ? secretKey +
        govde.iyziEventType +
        String(govde.paymentId ?? '') +
        String(govde.paymentConversationId ?? '') +
        String(govde.status ?? '')
      : secretKey +
        govde.iyziEventType +
        String(govde.iyziPaymentId ?? '') +
        String(govde.token ?? '') +
        String(govde.paymentConversationId ?? '') +
        String(govde.status ?? '');

  return sabitZamanliEsit(baslik, hmacHex(anahtar, secretKey));
}

/** Aynı olayın tekrar gelişini yakalayan anahtar. */
export function tekilAnahtarUret(g: AbonelikWebhookGovdesi): string {
  // iyziReferenceCode olay başına benzersiz; ama tekrar gönderimlerde
  // aynı kaldığı için tekilleştirme anahtarı olarak doğru seçim.
  // Yine de olay tipini ekliyoruz ki aynı siparişin başarı ve başarısızlık
  // kayıtları çakışmasın.
  return `iyzico:${g.iyziEventType}:${g.iyziReferenceCode}`;
}
