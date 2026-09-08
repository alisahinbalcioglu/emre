import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HEDEF E-POSTA BAZINDA HIZ SINIRI  (Faz 3.6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ NEDEN IP SINIRI TEK BAŞINA YETMEZ:
 *  `ThrottlerGuard` istekleri IP'ye göre sayar. Saldırgan bir bot ağıyla (ya da
 *  basitçe mobil veri kapatıp açarak) IP değiştirir ve TEK BİR kullanıcının
 *  gelen kutusuna yüzlerce "parola sıfırlama" maili yağdırır. Kurbanın hesabı
 *  ele geçmez ama gelen kutusu kullanılamaz hâle gelir ve bizim gönderen
 *  itibarımız yanar (Brevo ücretsiz katmanı günde 300 mail).
 *
 *  Bu guard AYNI uçta IP guard'ının YANINDA çalışır; ikisi ayrı kovalardır:
 *  `generateKey(context, tracker, name)` anahtarı tracker'ı içerir, bu yüzden
 *  IP tracker'lı kova ile e-posta tracker'lı kova ÇAKIŞMAZ.
 *
 *  ⚠ KÜÇÜK HARFE ÇEVİRME ŞART: `Ali@X.com` ile `ali@x.com` aynı gelen kutusudur.
 *  Normalleştirilmezse saldırgan yalnızca harf büyüklüğünü değiştirerek sınırı
 *  sınırsız kez sıfırlar. (DB ARAMASI ise bilerek normalleştirilmez — kayıt
 *  akışı e-postayı olduğu gibi saklıyor; oradaki eşleşme `login` ile birebir
 *  aynı kalmalı.)
 *
 *  ⚠ SINIR — TEK SÜREÇ: sayaç `ThrottlerModule`'ün varsayılan BELLEK deposunda
 *  tutulur. Bugün tek backend konteyneri var, dolayısıyla sayaç bütündür.
 *  Yatay ölçeklenirse (ikinci kopya) her kopya kendi sayacını tutar ve etkin
 *  sınır kopya sayısıyla çarpılır; o gün Redis deposu gerekir.
 */
@Injectable()
export class EpostaHizSiniriGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ham = req?.body?.email;
    const eposta = typeof ham === 'string' ? ham.trim().toLowerCase() : '';
    // E-posta yoksa (gövde bozuk/eksik) IP'ye düşülür — aksi halde gövdesiz
    // istek gönderen herkes TEK ve ortak bir kovayı paylaşır ve birbirini
    // kilitlerdi.
    return eposta ? `eposta:${eposta}` : `ip:${req?.ip ?? 'bilinmiyor'}`;
  }
}
