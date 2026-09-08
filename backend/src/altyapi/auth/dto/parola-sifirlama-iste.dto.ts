import { IsEmail } from 'class-validator';

/**
 * POST /auth/forgot-password gövdesi (Faz 3.3).
 *
 * ⚠ Alan adı `email` OLMAK ZORUNDA: `EpostaHizSiniriGuard` hız sınırı
 * kovasını `req.body.email`'den türetiyor. Ad değişirse guard sessizce IP
 * kovasına düşer ve e-posta bazlı sınır ÇALIŞMAYI BIRAKIR (hiçbir hata
 * vermeden) — bu yüzden kapı testi ikisini birlikte ölçüyor.
 */
export class ParolaSifirlamaIsteDto {
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  email: string;
}
