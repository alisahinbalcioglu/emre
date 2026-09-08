import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  E-posta gönderimi — TEK gönderici (Faz 3.2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU DOSYA UYGULAMANIN TEK E-POSTA ÇIKIŞIDIR. Dunning, fatura, havale ve
 *  parola akışları AYNI servisi kullanır. İkinci bir gönderici açmayın:
 *  gönderen adresi, şablon ve teslim edilebilirlik ikiye bölünür — bu dosyanın
 *  ilk sürümü de aynı uyarıyı taşıyordu.
 *
 *  ── TAŞIYICI: SMTP (nodemailer), sağlayıcıya özel SDK YOK ────────────────
 *  Önceki sürüm Resend'in HTTP API'sine `fetch` atıyordu. Artık düz SMTP:
 *  sağlayıcı değişirse üç satır `.env` değişir, KOD DEĞİŞMEZ. Bugün Brevo
 *  seçildi (AB şirketi, günde 300 ücretsiz); karar kilitli değil.
 *
 *  Kendi sunucudan gönderim ELENDİ: Hetzner yeni hesaplarda 25. portu kapalı
 *  tutuyor, IP itibarı sıfırdan başlar ve hedef kitle Microsoft 365 kullanıyor
 *  — spam'e düşen bir şifre sıfırlama maili "kilitli kalmış müşteri" demektir.
 *
 *  ── İKİ GÖNDERİM KİPİ — SÖZLEŞMELERİ FARKLI, BİLEREK ─────────────────────
 *  `gonder`        : yapılandırma YOKSA uyarı yazar ve SESSİZCE GEÇER.
 *                    Sözleşme ÖNCEKİ SÜRÜMLE AYNI bırakıldı — dunning/fatura/
 *                    havale bu davranışa göre yazılmış (biri `.catch` bile
 *                    zincirliyor). Taşıyıcıyı değiştirirken onların davranışını
 *                    da değiştirmek, ilgisiz bir modülü sessizce kırmak olurdu.
 *  `gonderKritik`  : yapılandırma yoksa DA gönderim hatasında da FIRLATIR.
 *                    Parola sıfırlama/e-posta doğrulama bunu kullanır: orada
 *                    "gönderdim" deyip göndermemek, kullanıcıyı hesabından
 *                    kilitler. Çağıran yakalar, LOGLAR ve kullanıcıya yine
 *                    tekdüze cevabı döner (numaralandırma kuralı).
 *
 *  ── AÇILIŞTA ÖLDÜRMEZ, YÜKSEK SESLE SÖYLER ───────────────────────────────
 *  SMTP tanımsızsa uygulama AÇILIR (bugün üretimde SMTP_* henüz yok ve ürünün
 *  geri kalanı çalışmak zorunda) ama açılışta tek satırlık net bir uyarı
 *  düşer. Sessiz olan tek şey yoktur: ya uyarı ya istisna.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface EpostaTalebi {
  kime: string;
  konu: string;
  baslik: string;
  paragraflar: string[];
  dugme?: { etiket: string; url: string };
  altNot?: string;
}

/** Şablonun iki gövdesi. Testler bunu taşıyıcı olmadan ölçebilir. */
export interface EpostaIcerigi {
  html: string;
  metin: string;
}

@Injectable()
export class EpostaServisi {
  private readonly logger = new Logger(EpostaServisi.name);
  private readonly gonderen: string;
  private readonly smtp?: {
    host: string;
    port: number;
    user?: string;
    pass?: string;
  };
  private tasiyici?: Transporter;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST')?.trim();
    const port = Number(config.get<string>('SMTP_PORT') ?? 587);

    // MAIL_FROM/MAIL_FROM_NAME yeni adlar (Faz 3). EPOSTA_GONDEREN eski ad ve
    // BUGÜN ÜRETİMDE compose'dan geçiyor — okumayı bırakmak, mevcut dunning
    // gönderenini sessizce varsayılana düşürürdü.
    const ad = config.get<string>('MAIL_FROM_NAME')?.trim() || 'MetaPriceX';
    const adres = config.get<string>('MAIL_FROM')?.trim();
    this.gonderen = adres
      ? `${ad} <${adres}>`
      : config.get<string>('EPOSTA_GONDEREN')?.trim() ||
        'MetaPriceX <bilgi@metapricex.com>';

    if (host) {
      this.smtp = {
        host,
        port,
        user: config.get<string>('SMTP_USER')?.trim(),
        pass: config.get<string>('SMTP_PASS'),
      };
    } else {
      this.logger.warn(
        'SMTP_HOST tanimli degil — e-posta GONDERILMEYECEK. ' +
          'Parola sifirlama ve dogrulama baglantilari kullaniciya ULASMAZ. ' +
          'Cozum: .env icine SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS ve MAIL_FROM.',
      );
    }
  }

  /** Yapılandırma eksikse `false` — çağıran buna göre karar verebilir. */
  yapilandirildiMi(): boolean {
    return !!this.smtp;
  }

  /**
   * Taşıyıcı İLK GÖNDERİMDE kurulur (açılışta değil): SMTP'ye bağlanmak
   * açılışı sağlayıcının erişilebilirliğine bağlardı.
   */
  private tasiyiciAl(): Transporter {
    if (!this.smtp) {
      throw new Error(
        'E-posta gonderilemiyor: SMTP_HOST tanimli degil. ' +
          'Bu bir yapilandirma eksigidir, gecici bir ag hatasi degil.',
      );
    }
    if (!this.tasiyici) {
      this.tasiyici = nodemailer.createTransport({
        host: this.smtp.host,
        port: this.smtp.port,
        // 465 = baştan TLS; 587 = düz başlar, STARTTLS ile yükselir.
        // `requireTLS` 587'de şart: olmazsa sunucu STARTTLS sunmadığında
        // nodemailer sessizce ŞİFRESİZ gönderir (SMTP_PASS düz metin geçer).
        secure: this.smtp.port === 465,
        requireTLS: this.smtp.port !== 465,
        auth: this.smtp.user
          ? { user: this.smtp.user, pass: this.smtp.pass ?? '' }
          : undefined,
        // Asılı kalan bir SMTP oturumu istek zincirini kilitlemesin.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
    }
    return this.tasiyici;
  }

  /**
   * BEST-EFFORT gönderim (sözleşme önceki sürümle aynı).
   * Yapılandırma yoksa: uyarı + sessiz dönüş. Gönderim hatası: FIRLATIR.
   */
  async gonder(t: EpostaTalebi): Promise<void> {
    if (!this.smtp) {
      this.logger.warn(
        `[E-POSTA GONDERILMEDI — SMTP yapilandirilmamis] ${t.kime}: ${t.konu}`,
      );
      return;
    }
    await this.postala(t);
  }

  /**
   * KRİTİK gönderim: yapılandırma eksikse de FIRLATIR.
   * Parola sıfırlama / e-posta doğrulama buradan geçer — o akışlarda "sessizce
   * geçmek", kullanıcıya gönderilmemiş bir bağlantıyı beklettirmek demektir.
   */
  async gonderKritik(t: EpostaTalebi): Promise<void> {
    await this.postala(t);
  }

  private async postala(t: EpostaTalebi): Promise<void> {
    const { html, metin } = this.icerikUret(t);
    await this.tasiyiciAl().sendMail({
      from: this.gonderen,
      to: t.kime,
      subject: t.konu,
      // İKİSİ BİRDEN: yalnız HTML gönderen iletilerin spam skoru belirgin
      // biçimde kötüdür ve bazı kurumsal istemciler HTML'i hiç açmaz.
      text: metin,
      html,
    });
  }

  /**
   * Şablonun iki gövdesini üretir. SAF fonksiyon — taşıyıcı gerektirmez,
   * bu yüzden testler SMTP olmadan "düz metin gövde gerçekten var mı" ve
   * "bağlantı düz metinde görünüyor mu" sorularını ÖLÇEBİLİR.
   */
  icerikUret(t: EpostaTalebi): EpostaIcerigi {
    return { html: this.sablon(t), metin: this.duzMetin(t) };
  }

  /**
   * DÜZ METİN gövde. Düğme burada METİN OLARAK URL'e döner: düz metin okuyan
   * kullanıcının tıklayacak bir şeyi olmalı, yoksa parola sıfırlama iletisi
   * onun için işlevsizdir.
   */
  private duzMetin(t: EpostaTalebi): string {
    const parcalar = [t.baslik, '', ...t.paragraflar];
    if (t.dugme) parcalar.push('', `${t.dugme.etiket}: ${t.dugme.url}`);
    if (t.altNot) parcalar.push('', t.altNot);
    parcalar.push(
      '',
      '—',
      'MetaPriceX · Bu ileti hesabinizla ilgili oldugu icin gonderildi.',
    );
    return parcalar.join('\n');
  }

  private sablon(t: EpostaTalebi): string {
    const p = t.paragraflar
      .map(
        (x) =>
          `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#334155">${this.kacir(x)}</p>`,
      )
      .join('');

    const dugme = t.dugme
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0">
           <tr><td style="border-radius:10px;background:#2563eb">
             <a href="${this.kacir(t.dugme.url)}"
                style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;
                       color:#ffffff;text-decoration:none">${this.kacir(t.dugme.etiket)}</a>
           </td></tr>
         </table>`
      : '';

    const alt = t.altNot
      ? `<div style="margin-top:26px;padding:14px 16px;border-radius:10px;background:#f8fafc;
                     border:1px solid #e2e8f0">
           <p style="margin:0;font-size:13.5px;line-height:1.6;color:#64748b">${this.kacir(t.altNot)}</p>
         </div>`
      : '';

    return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;
             font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
             style="max-width:560px;background:#ffffff;border-radius:14px;
                    border:1px solid #e2e8f0;overflow:hidden">
        <tr><td style="padding:22px 30px;border-bottom:1px solid #e2e8f0">
          <span style="font-size:17px;font-weight:800;color:#0f172a">MetaPrice<span style="color:#2563eb">X</span></span>
        </td></tr>
        <tr><td style="padding:30px">
          <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:800;color:#0f172a">
            ${this.kacir(t.baslik)}</h1>
          ${p}${dugme}${alt}
        </td></tr>
        <tr><td style="padding:18px 30px;background:#f8fafc;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:12.5px;line-height:1.6;color:#94a3b8">
            Bu e-posta MetaPriceX hesabınızla ilgili olduğu için gönderildi.
            Sorunuz varsa bu iletiyi yanıtlayabilirsiniz.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  private kacir(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
