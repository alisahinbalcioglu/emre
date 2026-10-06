import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { verify } from 'jsonwebtoken';
import { bearerToken } from '../auth/bearer-token';
import { jwtSecret } from '../auth/jwt-secret';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BÜYÜK GÖVDE YALNIZ ÖLÇÜLMÜŞ TOPLU UÇLARA, KİMLİK İMZASINDAN SONRA
 *  (06.10.2026, güvenlik incelemesi MEDIUM-B/C)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Gövde ayrıştırma Express ara katmanında, Nest'in kapılarından (JWT) ÖNCE
 *  koşar. Global tavan 50 MB'tı: KİMLİKSİZ bir istek her yolda (404 ve kapılı
 *  uç dahil) 50 MB'a kadar JSON.parse ettirebiliyordu — ölçüldü (güvenlik
 *  incelemesi): 49,8 MB gövde komşu isteği 5,2-5,6 sn bekletti (MEDIUM-C).
 *  Kimlikli istekte doğrulama borusu da koşar: kayıt herkese açık, kayıtlı
 *  herhangi biri tavansız bir DTO ucuna (ör. PATCH /api/firma) 49,8 MB ile
 *  döngüyü 31 sn tutabiliyordu (MEDIUM-B).
 *
 *  ŞİMDİ: global tavan 1 MB (`main.ts`). Büyük gövde YALNIZ aşağıdaki
 *  ölçülmüş toplu uçlarda ve YALNIZ imzası/süresi geçerli bir oturum
 *  token'ıyla (`Authorization: Bearer`, JwtStrategy'nin kabul ettiği TAM
 *  koşul: aynı `jsonwebtoken.verify`, aynı `amac`/`aud` reddi) ayrıştırılır.
 *  Token yok/geçersizse gövde HİÇ OKUNMAZ (`req._body`: body-parser "zaten
 *  ayrıştırıldı" sayar) ve istek kapıya gider — kapı eskisi gibi 401
 *  verir (aynı gövde, CORS başlıklarıyla; ön yüzün oturum düşmesi davranışı
 *  değişmez). İptal/ban/koltuk denetimi kapıda kalır (DB): imzası geçerli ama
 *  iptal edilmiş token büyük gövdeyi ayrıştırtır, sonra kapı 401 verir.
 *  Yönetici uçlarında token'daki rol de `admin` olmalı; tutmazsa gövde
 *  atlanmaz, global 1 MB ayrıştırıcıya düşer (karar RolesGuard'ın, DB
 *  rolüyle; rolü sonradan yükseltilmiş yönetici küçük gövdede gerçek gövdeyi
 *  görür — 06.10 inceleme LOW-1).
 *  Başlık, JwtStrategy'nin AYNI doğrusal ayrıştırıcısıyla okunur
 *  (`auth/bearer-token.ts`; passport-jwt'nin çapasız ifadesi karesel geri
 *  izliyordu — inceleme HIGH-1). 2 KB'ı aşan başlığı `yetki-basligi.ts`
 *  ikisinden de ÖNCE düşürür (derin savunma).
 *  KALAN RİSK (inceleme MEDIUM-1, AYRI İŞ): imzası geçerli her token —
 *  kayıt herkese açık — kapılardan ÖNCE uç tavanına kadar ayrıştırtır; erişim
 *  kapısını geçen hesapta doğrulama borusu da koşar. Ölçüldü (06.10, yerel;
 *  kapı H16): teklif ucuna 24 MB çok anahtarlı gövde komşuyu 16,6-17,3 sn
 *  bekletti (yüklü ve boş makine) — JSON.parse ~2,9 sn, boru ~13,8 sn
 *  (class-transformer kopyası ~6,4 + whitelist ~4,1); anahtarlar iç içe
 *  olsa da boru ~8,6 sn. (Önce: kimliksiz istek her yolda, kayıtlı kullanıcı
 *  her DTO ucunda 50 MB ile ~31 sn.) Bellek de büyür (boş nesne dizisi
 *  ~21 MB yığın/MB); ban token ömrü (7 gün) dolmadan saldırıyı durdurmaz.
 *  Sıkıştırılmış gövde AÇILMAZ (415): yoksa ~25 KB gzip 25 MB'a açılırdı.
 *  Çözüm önerisi: ayrıştırmadan ÖNCE ham gövdede yapı (düğüm) tavanı + süreç
 *  ve hesap başına eş zamanlılık; teklif xlsx base64'ünü JSON'dan ayırmak.
 *
 *  TAVANLAR (canlı ölçüm, koordinatör 06.10, salt okuma):
 *    · teklif kaydı: en büyük ilk kayıt ≈1,07 MB (sheets 731 KB + xlsx 118 KB
 *      + 527 kalem) → 25 MB.
 *    · kütüphane: liste başı en çok 3.729 satır (dizi tavanı 20.000 kirli
 *      satır ≈ 3,2 MB) → 10 MB.
 *    · işçilik: bugün en büyük sheet 2 KB, dizi tavanı 20.000 → 8 MB.
 *    · eşleştirme: bugün en çok 682 ad (~70 KB); dizi tavanı 20.000 ad +
 *      20.000 birim ≈ 3 MB → 4 MB.
 *    · yönetici içe aktarma: havuz liste başı 3.729 kalem (~2 MB); 50 bin
 *      kalemlik liste ≈ 22-27 MB → 32 MB (yalnız `admin` rollü token).
 *  KURALSIZ (bilinçli, 06.10 inceleme LOW-2): ön yüzde ÇAĞIRANI OLMAYAN üç
 *  toplu uç — `library/bulk-update-items`, `labor-firms/price-items/
 *  bulk-update`, `labor-firms/:id/save-from-sheets` — global 1 MB'a tabidir;
 *  kimlikli saldırı yüzeyini büyütmesinler. İstemci eklenirse önce gövde
 *  ölçülür, sonra kural yazılır. Kapı her `@DiziTavani` ucunun burada ya da
 *  gerekçeli istisna listesinde olduğunu denetler (iki yönlü).
 *  ⚠ SIRA: `main.ts`'te yol başı küçük tavanlardan (govde-siniri.ts) SONRA,
 *  global 1 MB ayrıştırıcılardan ÖNCE. Kapı: `test:buyuk-govde`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface BuyukGovdeUcu {
  ad: string;
  yontem: 'POST' | 'PUT' | 'PATCH';
  /** `/api` önekli tam yol, `:param` bölümleri tek kesim. */
  rota: string;
  sinir: string;
  yonetici?: true;
}

export const BUYUK_GOVDE_UCLARI: ReadonlyArray<BuyukGovdeUcu> = [
  { ad: 'teklif oluştur', yontem: 'POST', rota: '/api/quotes', sinir: '25mb' },
  { ad: 'teklif kaydet', yontem: 'PUT', rota: '/api/quotes/:id', sinir: '25mb' },
  { ad: 'kütüphane ızgara kaydı', yontem: 'POST', rota: '/api/library/brand/:brandId/save-sheets', sinir: '10mb' },
  { ad: 'kütüphane satır ekleme', yontem: 'POST', rota: '/api/library/brand/:brandId/rows', sinir: '10mb' },
  { ad: 'manuel marka', yontem: 'POST', rota: '/api/library/manual-brand', sinir: '10mb' },
  { ad: 'işçilik toplu kayıt', yontem: 'POST', rota: '/api/labor-firms/:id/save-bulk', sinir: '8mb' },
  { ad: 'işçilik ızgara kaydı', yontem: 'POST', rota: '/api/labor-firms/price-lists/:listId/save-sheets', sinir: '8mb' },
  { ad: 'malzeme eşleştirme', yontem: 'POST', rota: '/api/matching/bulk-match', sinir: '4mb' },
  { ad: 'işçilik eşleştirme', yontem: 'POST', rota: '/api/labor-matching/bulk-match', sinir: '4mb' },
  { ad: 'yönetici içe aktarma (marka)', yontem: 'POST', rota: '/api/admin/brands/:brandId/import-excel/commit', sinir: '32mb', yonetici: true },
  { ad: 'yönetici içe aktarma (liste)', yontem: 'POST', rota: '/api/admin/price-lists/:id/import-excel/commit', sinir: '32mb', yonetici: true },
  { ad: 'yönetici sayfadan kayıt', yontem: 'POST', rota: '/api/admin/brands/:brandId/save-from-sheets', sinir: '32mb', yonetici: true },
  { ad: 'yönetici toplu malzeme', yontem: 'POST', rota: '/api/admin/materials/save-bulk', sinir: '32mb', yonetici: true },
];

/** Yol kalıbını Express'in eşlemesiyle aynı düzenli ifadeye çevirir:
 *  büyük/küçük harf duyarsız, `:param` tek kesim, sonda isteğe bağlı `/`. */
export function yolDeseni(yol: string): RegExp {
  const govde = yol.split('/').map((k) => (k.startsWith(':') ? '[^/]+' : k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'))).join('/');
  return new RegExp(`^${govde}/?$`, 'i');
}

export type TokenDurumu = 'gecerli' | 'gecersiz' | 'yetkisiz';

/** JwtStrategy'nin kabul koşulu (DB öncesi kısmı): AYNI başlık ayrıştırıcısı
 *  (`bearerToken`, JwtStrategy'nin jwtFromRequest'i) + passport-jwt'nin aynı
 *  `verify` çağrısı + `amac`/`aud` reddi. */
export function tokenDurumu(baslik: unknown, yonetici: boolean, gizli = jwtSecret()): TokenDurumu {
  const token = bearerToken(baslik);
  if (!token) return 'gecersiz';
  let yuk: unknown;
  try {
    yuk = verify(token, gizli);
  } catch {
    return 'gecersiz';
  }
  if (!yuk || typeof yuk !== 'object') return 'gecersiz';
  const p = yuk as Record<string, unknown>;
  if (p.amac !== undefined || p.aud !== undefined) return 'gecersiz';
  if (yonetici && p.role !== 'admin') return 'yetkisiz';
  return 'gecerli';
}

export function buyukGovdeUclariniKur(app: Pick<NestExpressApplication, 'use'>): void {
  const kurallar = BUYUK_GOVDE_UCLARI.map((u) => ({
    ...u,
    desen: yolDeseni(u.rota),
    // Sıkıştırılmış gövde AÇILMAZ (415, main.ts notu): tavan açılmış bayta uygulanır.
    json: json({ limit: u.sinir, inflate: false }) as RequestHandler,
    url: urlencoded({ extended: true, limit: u.sinir, inflate: false }) as RequestHandler,
  }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const kural = kurallar.find((k) => k.yontem === req.method && k.desen.test(req.path));
    if (!kural) return next();
    const durum = tokenDurumu(req.headers.authorization, !!kural.yonetici);
    if (durum === 'gecersiz') {
      // Gövde OKUNMAZ: sonraki ayrıştırıcılar `_body`yi görüp atlar; JWT kapısı
      // isteği eskisi gibi reddeder (oturum geçersizken işleyiciye varılmaz).
      (req as Request & { _body?: boolean }).body = {};
      (req as Request & { _body?: boolean })._body = true;
      return next();
    }
    // Rol tutmuyor (`yetkisiz`): oturum GEÇERLİ, karar RolesGuard'ın (DB rolü).
    // Gövde atlanmaz — global 1 MB ayrıştırıcıya düşer: token'ı eski (rolü
    // sonradan yükseltilmiş) yönetici küçük gövdede boş `{}` değil gerçek
    // gövdeyi görür; büyük gövde için yeniden giriş gerekir (06.10 inceleme LOW-1).
    if (durum === 'yetkisiz') return next();
    kural.json(req, res, (hata?: unknown) => (hata ? next(hata) : kural.url(req, res, next)));
  });
}
