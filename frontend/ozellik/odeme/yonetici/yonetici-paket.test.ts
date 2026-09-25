import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GEREKCE_EN_AZ,
  HAK_ADI,
  METIN_EN_COK,
  dusurmeOzeti,
  gerekceGecerliMi,
  hakListesi,
  islemDugmesi,
  oneriOzeti,
  type YoneticiSecenegi,
} from './yonetici-paket';

/**
 * Yönetici "Paket işlemleri" penceresi (24.09.2026, A2 · Blok 1 + Blok 2 öneri).
 *
 * Karar SUNUCUDA (`backend/.../yonetici/yonetici-islemi.ts`); burada ölçülen:
 * (1) ön yüz yardımcılarının metin ve düğme kuralları, (2) sunucu ↔ ön yüz
 * BİÇİM ve SÖZLÜK eşliği (iki dosya okunarak), (3) pencerenin ve sayfanın
 * doğru uçlara BAĞLI olduğu (kaynak kapısı).
 */
const kok = join(__dirname, '..', '..', '..');
const oku = (p: string) => readFileSync(join(kok, p), 'utf8').replace(/\r\n/g, '\n');
/** Yorumları atar: kapı YORUMU değil KODU ölçsün. */
const kodu = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** `{ ... }` bloğundaki üst düzey alan adları (sırasız). */
function alanlar(kaynak: string, baslangic: string): string[] {
  const bas = kaynak.indexOf(baslangic);
  if (bas < 0) return [];
  let derinlik = 0;
  let i = kaynak.indexOf('{', bas);
  const govdeBas = i + 1;
  for (; i < kaynak.length; i++) {
    if (kaynak[i] === '{') derinlik++;
    else if (kaynak[i] === '}' && --derinlik === 0) break;
  }
  const govde = kaynak.slice(govdeBas, i);
  const adlar: string[] = [];
  let d = 0;
  for (const satir of govde.split('\n')) {
    const m = d === 0 ? /^\s*(\w+)\??:/.exec(satir) : null;
    if (m) adlar.push(m[1]);
    d += (satir.match(/[{<(]/g) ?? []).length - (satir.match(/[}>)]/g) ?? []).length;
  }
  return adlar.sort();
}

const secenek = (o: Partial<YoneticiSecenegi> = {}): YoneticiSecenegi => ({
  paketSurumuId: 's-pro-mek',
  paket: { kod: 'pro-mek', ad: 'Pro — Mekanik', kullaniciHakki: 2 },
  tutar: '1649.00',
  paraBirimi: 'TRY',
  islem: 'dogrudan-dusur',
  aciklama: 'Düşürme: dönem sonunda uygulanır, müşteri onayı gerekmez.',
  kayiplar: ['kapsam', 'kullanici'],
  kazanclar: [],
  durdurulacakUye: 1,
  ...o,
});

describe('yardımcılar', () => {
  it('düğme: düşürme ve öneri AÇIK (Blok 2); süreli paket görünür ama kapalı (nedenli); "yok" düğmesiz', () => {
    expect(islemDugmesi('dogrudan-dusur')).toEqual({ etiket: 'Dönem sonunda düşür', etkin: true, ipucu: null });
    expect(islemDugmesi('oneri')).toEqual({ etiket: 'Öneri gönder', etkin: true, ipucu: null });
    const sureli = islemDugmesi('sureli-paket');
    expect(sureli?.etkin).toBe(false);
    expect(sureli?.ipucu).toMatch(/sonraki adımda/);
    expect(islemDugmesi('yok')).toBeNull();
  });

  it('düğme: BEKLEYEN öneri varken "Öneri gönder" kapalı ve nedeni yazılı (sunucu zaten 409 verir); düşürme etkilenmez', () => {
    const oneri = islemDugmesi('oneri', true);
    expect(oneri?.etkin).toBe(false);
    expect(oneri?.ipucu).toMatch(/Bekleyen bir öneri var/);
    expect(islemDugmesi('dogrudan-dusur', true)?.etkin).toBe(true);
  });

  it('öneri özeti: paket DEĞİŞMEZ; kayıp yoksa (yükseltme) özellikler HEMEN, kazançlar yazılı', () => {
    const s = oneriOzeti({
      mevcutPaketAdi: 'Basic — Mekanik',
      secenek: secenek({ islem: 'oneri', kayiplar: [], kazanclar: ['seviye', 'dwg'], durdurulacakUye: 0 }),
      beklenenGecis: '2026-10-14T09:00:00.000Z',
    });
    expect(s[0]).toBe('Basic — Mekanik → Pro — Mekanik');
    expect(s.join(' | ')).toMatch(/Paket şimdi DEĞİŞMEZ/);
    expect(s.join(' | ')).toMatch(/özellikler hemen açılır/);
    expect(s.join(' | ')).toMatch(/eklenen ya da artan hakları: Pro seviyesi özellikleri, DWG metraj/);
    expect(s.join(' | ')).not.toMatch(/azalan ya da kalkan/);
  });

  it('öneri özeti: kayıp varsa (yatay / fiyatı artan) geçiş DÖNEM SONUNDA; kayıp ve duracak üye yazılı', () => {
    const s = oneriOzeti({
      mevcutPaketAdi: 'Pro — Mekanik',
      secenek: secenek({ islem: 'oneri', kayiplar: ['kapsam'], kazanclar: ['kapsam'], durdurulacakUye: 1 }),
      beklenenGecis: '2026-10-14T09:00:00.000Z',
    }).join(' | ');
    expect(s).toMatch(/geçiş dönem sonunda/);
    expect(s).not.toMatch(/hemen açılır/);
    expect(s).toMatch(/azalan ya da kalkan hakları/);
    expect(s).toMatch(/1 ekip üyesinin erişimi durur/);
  });

  it('gerekçe: boşluk sayılmaz, en az 5 ve en çok 500 karakter', () => {
    expect(gerekceGecerliMi('     ')).toBe(false);
    expect(gerekceGecerliMi('abcd')).toBe(false);
    expect(gerekceGecerliMi('  abcde  ')).toBe(true);
    expect(gerekceGecerliMi('x'.repeat(500))).toBe(true);
    expect(gerekceGecerliMi('x'.repeat(501))).toBe(false);
  });

  it('düşürme özeti: yön, dönem sonu tarihi, TL ücret, kayıplar, duracak üye ve "onay alınmaz" bilgisi', () => {
    const satirlar = dusurmeOzeti({
      mevcutPaketAdi: 'Pro — Mekanik + Elektrik',
      secenek: secenek(),
      beklenenGecis: '2026-10-14T20:59:59.000Z',
    });
    expect(satirlar[0]).toBe('Pro — Mekanik + Elektrik → Pro — Mekanik');
    expect(satirlar.join(' ')).toMatch(/14\.10\.2026/);
    expect(satirlar.join(' ')).toMatch(/₺1\.649,00/);
    expect(satirlar.join(' ')).toMatch(/disiplin kapsamı.*kullanıcı hakkı/);
    expect(satirlar.join(' ')).toMatch(/1 ekip üyesinin erişimi durur/);
    expect(satirlar[satirlar.length - 1]).toMatch(/Müşteri onayı alınmaz/);
  });

  it('düşürme özeti: kayıp ve duracak üye yoksa o satırlar YOK', () => {
    const satirlar = dusurmeOzeti({
      mevcutPaketAdi: 'A',
      secenek: secenek({ kayiplar: [], durdurulacakUye: 0 }),
      beklenenGecis: '2026-10-14T20:59:59.000Z',
    });
    expect(satirlar.some((s) => /azalan ya da kalkan/.test(s))).toBe(false);
    expect(satirlar.some((s) => /erişimi durur/.test(s))).toBe(false);
  });

  it('düşürme özeti: tarih yoksa "dönem sonunda (dönem sonu)" gibi tekrar YOK', () => {
    const satirlar = dusurmeOzeti({ mevcutPaketAdi: 'A', secenek: secenek(), beklenenGecis: '' });
    expect(satirlar[1]).toBe('Geçiş: dönem sonunda. O tarihe kadar mevcut paket açık kalır.');
  });

  it('düşürme özeti: "kaybedeceği" değil "azalan ya da kalkan" (kullanıcı hakkı azalır, tamamen kalkmaz)', () => {
    const satirlar = dusurmeOzeti({
      mevcutPaketAdi: 'A',
      secenek: secenek(),
      beklenenGecis: '2026-10-14T20:59:59.000Z',
    });
    expect(satirlar.join(' ')).toMatch(/Müşterinin azalan ya da kalkan hakları:/);
  });

  it('hak listesi: Türkçe adlar, bilinmeyen AYNEN', () => {
    expect(hakListesi(['dwg', 'kullanici'])).toBe('DWG metraj, kullanıcı hakkı');
    expect(hakListesi(['xyz' as never])).toBe('xyz');
  });
});

describe('sunucu ↔ ön yüz eşliği', () => {
  it('hak adları sunucunun e-posta sözlüğüyle BİREBİR (yönetici ekranda ne görürse müşteri e-postada onu okur)', () => {
    const sunucu = kodu(oku('../backend/src/ozellik/odeme/abonelik/yonetici/yonetici-paket-epostalari.ts'));
    // ⚠ `[...matchAll()]` DEĞİL: ön yüz tsc hedefinde TS2802 verir (vitest tip
    // denetlemediği için yalnız CI'da düşer — hafıza dersi). `exec` döngüsü.
    const ciftler: string[][] = [];
    const desen = /\['(\w+)', '([^']+)'\]/g;
    for (let m = desen.exec(sunucu); m; m = desen.exec(sunucu)) ciftler.push([m[1], m[2]]);
    expect(ciftler.length).toBe(6); // FIXTURE KANITI: sözlük gerçekten okundu
    expect(Object.fromEntries(ciftler)).toEqual(HAK_ADI);
  });

  it('seçenek ve panel alanları sunucunun yanıtıyla aynı adlarda (biçim kayarsa ekran sessizce boş kalırdı)', () => {
    const sunucu = oku('../backend/src/ozellik/odeme/abonelik/yonetici/yonetici-abonelik.servisi.ts');
    const onyuz = oku('ozellik/odeme/yonetici/yonetici-paket.ts');
    const sunucuSecenek = alanlar(sunucu, 'secenekler: Array<');
    const onyuzSecenek = alanlar(onyuz, 'export interface YoneticiSecenegi');
    expect(sunucuSecenek.length).toBeGreaterThanOrEqual(9); // boş küme eşit sayılmasın
    expect(onyuzSecenek).toEqual(sunucuSecenek);
    const sunucuAbonelik = alanlar(sunucu, 'abonelik: null | ');
    const onyuzAbonelik = alanlar(onyuz, '  abonelik: null | ');
    expect(sunucuAbonelik.length).toBeGreaterThanOrEqual(13);
    expect(onyuzAbonelik).toEqual(sunucuAbonelik);
  });

  it('gerekçe sınırları sunucu DTO\'su ile aynı (5 / 500)', () => {
    const dto = kodu(oku('../backend/src/ozellik/odeme/abonelik/yonetici/dto/yonetici-dusur.dto.ts'));
    expect(dto).toContain(`@MinLength(${GEREKCE_EN_AZ}`);
    expect(dto).toContain(`@MaxLength(${METIN_EN_COK}`);
    const oneriDto = kodu(oku('../backend/src/ozellik/odeme/abonelik/yonetici/dto/yonetici-oneri.dto.ts'));
    expect(oneriDto).toContain(`@MinLength(${GEREKCE_EN_AZ}`);
    expect(oneriDto).toContain(`@MaxLength(${METIN_EN_COK}`);
  });

  it('öneri alanları sunucunun panel yanıtıyla aynı adlarda (A2 Blok 2)', () => {
    const sunucu = oku('../backend/src/ozellik/odeme/abonelik/yonetici/yonetici-abonelik.servisi.ts');
    const onyuz = oku('ozellik/odeme/yonetici/yonetici-paket.ts');
    const sunucuOneri = alanlar(sunucu, 'oneri: null | ');
    expect(sunucuOneri.length).toBeGreaterThanOrEqual(10); // boş küme eşit sayılmasın
    expect(alanlar(onyuz, 'export interface YoneticiOnerisi')).toEqual(sunucuOneri);
  });

  it('öneri durum listesi sunucunun etkin durum listesiyle BİREBİR (yeni durum eklenirse ekran bilmez)', () => {
    const tur = (kaynak: string, bas: string) => {
      const govde = kaynak.slice(kaynak.indexOf(bas), kaynak.indexOf(';', kaynak.indexOf(bas)));
      const adlar: string[] = [];
      const desen = /'([a-z-]+)'/g;
      for (let m = desen.exec(govde); m; m = desen.exec(govde)) adlar.push(m[1]);
      return adlar.sort();
    };
    const sunucu = tur(oku('../backend/src/ozellik/odeme/abonelik/yonetici/paket-onerisi.ts'), 'export type OneriEtkinDurumu =');
    expect(sunucu.length).toBe(8); // FIXTURE KANITI (25.09: + satistan-kalkti)
    expect(tur(oku('ozellik/odeme/yonetici/yonetici-paket.ts'), 'export type OneriDurumu =')).toEqual(sunucu);
  });
});

describe('bağlantı (kaynak kapısı)', () => {
  const pencere = kodu(oku('ozellik/odeme/yonetici/YoneticiPaketPenceresi.tsx'));
  const sayfa = kodu(oku('app/admin/users/page.tsx'));

  it('pencere doğru uçları çağırıyor: panel GET, düşürme POST (paket + gerekçe + not)', () => {
    expect(pencere).toMatch(/api\.get<YoneticiPaneli>\(`\/yonetim\/abonelik\/\$\{firma\.id\}`\)/);
    expect(pencere).toMatch(/api\.post\(`\/yonetim\/abonelik\/\$\{firma\.id\}\/dusur`/);
    // `hedef` = gönderim anındaki seçim (dönüşte state değişmiş olabilir).
    expect(pencere).toMatch(/const hedef = secili;/);
    expect(pencere).toMatch(/paketSurumuId: hedef\.paketSurumuId/);
    expect(pencere).toMatch(/gerekce: gerekce\.trim\(\)/);
  });

  it('düşür düğmesi gerekçe geçersizken KAPALI; işlem sonrası panel TAZE okunur; e-posta gitmediyse söylenir', () => {
    expect(pencere).toMatch(/disabled=\{gonderiliyor \|\| !gerekceGecerliMi\(gerekce\)\}/);
    expect(pencere).toMatch(/finally \{[\s\S]*?await yukle\(\);/);
    expect(pencere).toMatch(/epostaGonderildi/);
    expect(pencere).toMatch(/GÖNDERİLEMEDİ/);
  });

  it('KURTARMADA "Düşürme planlandı" DENMEZ: `oncekiDegisim` ayrı ve kırmızı bildirim (inceleme M1)', () => {
    const dal = pencere.indexOf('if (data?.oncekiDegisim)');
    const planlandi = pencere.indexOf("title: 'Düşürme planlandı'");
    expect(dal).toBeGreaterThan(-1);
    expect(planlandi).toBeGreaterThan(dal); // planlandı bildirimi kurtarma dalından SONRA (else içinde)
    expect(pencere.slice(dal, planlandi)).toMatch(/title: 'Düşürme uygulanmadı'[\s\S]*variant: 'destructive'/);
  });

  it('taze durum düşürmeye izin vermiyorsa onay adımından çıkılır; Vazgeç metinleri temizler', () => {
    expect(pencere).toMatch(/if \(hala\?\.islem !== 'dogrudan-dusur'\) onayAdiminiKapat\(\);/);
    expect(pencere).toMatch(/onClick=\{onayAdiminiKapat\}/);
    expect(pencere).toMatch(/function onayAdiminiKapat\(\) \{\s*setSecili\(null\);\s*setGerekce\(''\);\s*setMusteriNotu\(''\);/);
  });

  it('yükleme hatasında "Yeniden dene"; kapalı düğmenin nedeni GÖRÜNÜR metin (yalnız title değil)', () => {
    expect(pencere).toMatch(/onClick=\{\(\) => void yukle\(\)\}>\s*Yeniden dene/);
    expect(pencere).toMatch(/!dugme\.etkin && dugme\.ipucu && \(/);
    expect(pencere).not.toMatch(/title=\{dugme\.ipucu/);
  });

  it('kullanıcılar sayfası pencereyi açıyor; eski "Abonelikler" sütunu ve eski alan YOK', () => {
    expect(sayfa).toMatch(/import YoneticiPaketPenceresi from '@\/ozellik\/odeme\/yonetici\/YoneticiPaketPenceresi'/);
    expect(sayfa).toMatch(/setPaketFirmasi\(\{ id: u\.firma!\.id, ad: u\.firma!\.ad \}\)/);
    expect(sayfa).toMatch(/<YoneticiPaketPenceresi/);
    expect(sayfa).toContain('Paket işlemleri');
    expect(sayfa).not.toMatch(/subscriptions/);
    expect(sayfa).not.toMatch(/<TableHead>Abonelikler<\/TableHead>/);
  });

  it('denetim sayfası yeni olay adlarını okunur gösteriyor', () => {
    const denetim = kodu(oku('app/admin/denetim/page.tsx'));
    for (const tip of [
      'paket.dusurme.istendi',
      'paket.dusuruldu',
      'paket.dusurme.uygulanmadi',
      'paket.dusurme.basarisiz',
      'paket.dusurme.belirsiz',
      'paket.dusurme.yarim',
      'paket.oneri.gonderildi',
      'paket.oneri.geri-cekildi',
    ]) {
      expect(denetim).toContain(`'${tip}':`);
    }
  });

  it('öneri: pencere öneri ucuna (paket + kırpılmış gerekçe) ve geri çekme ucuna bağlı', () => {
    expect(pencere).toMatch(/api\.post\(`\/yonetim\/abonelik\/\$\{firma\.id\}\/oneri`, \{\s*paketSurumuId: hedef\.paketSurumuId,\s*gerekce: gerekce\.trim\(\)/);
    expect(pencere).toMatch(/api\.post\(`\/yonetim\/abonelik\/\$\{firma\.id\}\/oneri\/\$\{oneriId\}\/geri-cek`\)/);
  });

  it('öneri: onay adımı seçeneğin `islem`ine göre öneri özetini ve "Öneriyi gönder"i çizer; bekleyen öneri düğmeyi kapatır', () => {
    expect(pencere).toMatch(/\(secili\.islem === 'oneri' \? oneriOzeti : dusurmeOzeti\)\(/);
    expect(pencere).toMatch(/secili\.islem === 'oneri' \? \([\s\S]*?onClick=\{\(\) => void oneriGonder\(\)\}/);
    expect(pencere).toMatch(/islemDugmesi\(s\.islem, bekleyenOneri !== null\)/);
    expect(pencere).toMatch(/const bekleyenOneri = panel\?\.oneri\?\.durum === 'bekliyor' \? panel\.oneri : null;/);
  });

  it('öneri: e-posta gitmediyse söylenir; işlem sonrası panel TAZE okunur', () => {
    const gonder = pencere.slice(pencere.indexOf('async function oneriGonder'), pencere.indexOf('async function oneriGeriCek'));
    expect(gonder).toMatch(/epostaGonderildi/);
    expect(gonder).toMatch(/GÖNDERİLEMEDİ/);
    expect(gonder).toMatch(/finally \{[\s\S]*?await yukle\(\);/);
  });
});
