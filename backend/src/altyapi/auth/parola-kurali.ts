/**
 * PAROLA UZUNLUK KURALI — tek kaynak (Faz 3.3 · 3.5).
 *
 * ⚠ BİLİNÇLİ ASİMETRİ, gizlenmiyor: `RegisterDto` bugün `MinLength(6)` diyor ve
 * bu turda DEĞİŞTİRİLMEDİ (kayıt akışı Faz 3'ün kapsamında değil). Yani yeni
 * BELİRLENEN parolalar 8, 2026 öncesi KAYITLI parolalar 6 karakter olabilir.
 * Bu bir çelişki değil, politikanın sıkılaşmasıdır: eski parola çalışmaya
 * devam eder, ama kullanıcı parolasını her değiştirdiğinde yeni kurala uyar.
 * Kayıt akışını da 8'e çekmek ayrı ve bilinçli bir karardır — o gün burası
 * TEK yerdir, iki satır değişir.
 */
export const PAROLA_MIN = 8;

export const PAROLA_MESAJI = `Parola en az ${PAROLA_MIN} karakter olmalıdır.`;
