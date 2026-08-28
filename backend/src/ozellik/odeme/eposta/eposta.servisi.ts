import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  E-posta gönderimi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Better Auth ADIM 1'de de bir gönderici kurmuştuk; orada varsa BU DOSYAYI
 *  ATLAYIN ve dunning/havale servislerine oradaki servisi enjekte edin.
 *  İki ayrı gönderici tutmak, gönderen adresini ve şablonu ikiye böler.
 *
 *  Varsayılan sağlayıcı Resend. Değiştirmek isterseniz `gonder` gövdesini
 *  değiştirmeniz yeterli — arayüz aynı kalır.
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

@Injectable()
export class EpostaServisi {
  private readonly logger = new Logger(EpostaServisi.name);
  private readonly anahtar?: string;
  private readonly gonderen: string;

  constructor(config: ConfigService) {
    this.anahtar = config.get<string>('RESEND_API_KEY');
    this.gonderen =
      config.get<string>('EPOSTA_GONDEREN') ??
      'MetaPriceX <bildirim@metapricex.com>';
  }

  async gonder(t: EpostaTalebi): Promise<void> {
    const html = this.sablon(t);

    if (!this.anahtar) {
      this.logger.warn(
        `[E-POSTA GÖNDERİLMEDİ — RESEND_API_KEY yok] ${t.kime}: ${t.konu}`,
      );
      return;
    }

    const cevap = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.anahtar}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.gonderen,
        to: [t.kime],
        subject: t.konu,
        html,
      }),
    });

    if (!cevap.ok) {
      const metin = await cevap.text();
      throw new Error(`E-posta gönderilemedi (${cevap.status}): ${metin.slice(0, 200)}`);
    }
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
            Bu e-posta MetaPriceX aboneliğinizle ilgili olduğu için gönderildi.
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
