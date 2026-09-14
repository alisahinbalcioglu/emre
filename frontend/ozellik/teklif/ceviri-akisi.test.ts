/**
 * ÇEVİRİ AKIŞI + KOTA GÖSTERİMİ (Faz 6.2, 14.09.2026).
 *
 * Akış: önizleme → (red dalları) → onay → çeviri isteği. Kilitlenen:
 *   · istek gövdesi YALNIZ teklif kimliği taşır (metin listesi, satır sayısı yok)
 *   · önizleme reddederse / kullanıcı vazgeçerse çeviri isteği HİÇ gitmez
 *   · her ret dalı kullanıcıya nedenini söyler (sessiz null yok)
 *   · onay kartı "kaç satır yer / kalan kota" bilgisini taşır
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { teklifCevirisiAl, type CeviriAkisiBagimliliklari } from './ceviri-akisi';
import {
  bosSonucBildirimi,
  ceviriHataMetni,
  kalanKotaCumlesi,
  onizlemeCumlesi,
  sonucBildirimi,
  trTarih,
  type CeviriKotaOzeti,
  type CeviriOnizleme,
  type TeklifCeviriSonucu,
} from './ceviri-kota';

const QUOTE = '8a2f4a4e-2b7c-4a55-9d0e-0f6f3c1b2a10';

const KOTA: CeviriKotaOzeti = {
  paketKodu: 'pro-mek',
  kota: { satir: 4500, dosya: 60 },
  donemBaslangic: '2026-09-12T09:00:00.000Z',
  donemBitis: '2026-10-12T09:00:00.000Z',
  kullanilanSatir: 2400,
  kullanilanDosya: 32,
  kalanSatir: 2100,
  kalanDosya: 28,
};

function onizleme(patch: Partial<CeviriOnizleme> = {}): CeviriOnizleme {
  return {
    epostaDogrulandi: true,
    gerekenSatir: 1240,
    metinSayisi: 310,
    tekrar: false,
    devam: false,
    suruyor: false,
    izin: true,
    sebep: null,
    redMesaji: null,
    kota: KOTA,
    ...patch,
  };
}

function sonuc(patch: Partial<TeklifCeviriSonucu> = {}): TeklifCeviriSonucu {
  return {
    harita: { 'PVC BORU': 'PVC PIPE' },
    onbellekten: 1,
    cevrilen: 0,
    basarisiz: 0,
    satirSayisi: 1240,
    dusulenSatir: 1240,
    cevrilemeyenSatir: 0,
    tekrar: false,
    devam: false,
    kotadanDustu: true,
    kota: { ...KOTA, kalanSatir: 860, kalanDosya: 27 },
    ...patch,
  };
}

interface Kayit {
  getler: Array<{ url: string; params: Record<string, string> }>;
  postlar: Array<{ url: string; govde: Record<string, unknown> }>;
  onaylar: Array<{ title: string; description: string }>;
  bildirimler: Array<{ title: string; description: string; variant?: string }>;
  yukleniyor: boolean[];
}

function sahte(o: {
  onizleme?: CeviriOnizleme | Error;
  onay?: boolean;
  post?: TeklifCeviriSonucu | Error;
}): { d: CeviriAkisiBagimliliklari; k: Kayit } {
  const k: Kayit = { getler: [], postlar: [], onaylar: [], bildirimler: [], yukleniyor: [] };
  const d: CeviriAkisiBagimliliklari = {
    get: async (url, ayar) => {
      k.getler.push({ url, params: ayar.params });
      if (o.onizleme instanceof Error) throw o.onizleme;
      return { data: o.onizleme ?? onizleme() };
    },
    post: async (url, govde) => {
      k.postlar.push({ url, govde });
      if (o.post instanceof Error) throw o.post;
      return { data: o.post ?? sonuc() };
    },
    onay: async (s) => {
      k.onaylar.push(s);
      return o.onay ?? true;
    },
    bildir: (b) => {
      k.bildirimler.push(b);
    },
    yukleniyor: (v) => {
      k.yukleniyor.push(v);
    },
  };
  return { d, k };
}

function httpHatasi(status: number, data: Record<string, unknown>): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });
}

describe('teklifCevirisiAl — istek şekli', () => {
  it('önizleme teklif kimliğiyle istenir', async () => {
    const { d, k } = sahte({});
    await teklifCevirisiAl(QUOTE, d);
    expect(k.getler).toEqual([{ url: '/ai/translate/onizleme', params: { quoteId: QUOTE } }]);
  });

  it('çeviri gövdesi YALNIZ quoteId + hedefDil taşır (metin listesi / satır sayısı yok)', async () => {
    const { d, k } = sahte({});
    await teklifCevirisiAl(QUOTE, d);
    expect(k.postlar).toEqual([{ url: '/ai/translate', govde: { quoteId: QUOTE, hedefDil: 'en' } }]);
  });

  it('başarıda sunucunun sonucu döner', async () => {
    const { d } = sahte({});
    const r = await teklifCevirisiAl(QUOTE, d);
    expect(r?.harita).toEqual({ 'PVC BORU': 'PVC PIPE' });
  });

  it('yükleniyor her istekte açılıp kapanır, onay sırasında KAPALI', async () => {
    const { d, k } = sahte({});
    await teklifCevirisiAl(QUOTE, d);
    expect(k.yukleniyor).toEqual([true, false, true, false]);
  });
});

describe('teklifCevirisiAl — onay kartı', () => {
  it('kart kaç satır yiyeceğini ve kalan kotayı söyler', async () => {
    const { d, k } = sahte({});
    await teklifCevirisiAl(QUOTE, d);
    expect(k.onaylar[0].description).toContain('1.240 satır');
    expect(k.onaylar[0].description).toContain('Kalan: 2.100 satır / 28 dosya');
  });

  it('ek not karta eklenir (Düzenle ekranı: kaydedilmemiş değişiklik)', async () => {
    const { d, k } = sahte({});
    await teklifCevirisiAl(QUOTE, d, { ekNot: 'Kaydetmediğiniz değişiklikler çeviriye girmez.' });
    expect(k.onaylar[0].description).toContain('Kaydetmediğiniz değişiklikler çeviriye girmez.');
  });

  it('vazgeçilirse çeviri isteği GİTMEZ', async () => {
    const { d, k } = sahte({ onay: false });
    const r = await teklifCevirisiAl(QUOTE, d);
    expect(r).toBeNull();
    expect(k.postlar).toHaveLength(0);
  });
});

describe('teklifCevirisiAl — ret dalları (istek gitmez, neden söylenir)', () => {
  it('kota yetmiyorsa sunucunun red mesajı gösterilir, istek gitmez, onay sorulmaz', async () => {
    const red = 'Bu dönem 200 satırlık çeviri hakkınız kaldı; bu teklif 1.240 satır gerektiriyor.';
    const { d, k } = sahte({ onizleme: onizleme({ izin: false, sebep: 'SATIR_TAVANI', redMesaji: red }) });
    const r = await teklifCevirisiAl(QUOTE, d);
    expect(r).toBeNull();
    expect(k.postlar).toHaveLength(0);
    expect(k.onaylar).toHaveLength(0);
    expect(k.bildirimler[0].description).toBe(red);
  });

  it('e-posta doğrulanmamışsa istek gitmez ve neden söylenir', async () => {
    const { d, k } = sahte({ onizleme: onizleme({ epostaDogrulandi: false }) });
    expect(await teklifCevirisiAl(QUOTE, d)).toBeNull();
    expect(k.postlar).toHaveLength(0);
    expect(k.bildirimler[0].title).toContain('e-posta');
  });

  it('çevrilecek metin yoksa istek gitmez ve neden söylenir', async () => {
    const { d, k } = sahte({ onizleme: onizleme({ metinSayisi: 0, gerekenSatir: 0 }) });
    expect(await teklifCevirisiAl(QUOTE, d)).toBeNull();
    expect(k.postlar).toHaveLength(0);
    expect(k.bildirimler[0].title).toBe('Çevrilecek metin yok');
  });

  it('önizleme hatası (abonelik 403) kullanıcıya mesajıyla gösterilir', async () => {
    const { d, k } = sahte({
      onizleme: httpHatasi(403, { mesaj: 'Aboneliğiniz bulunmuyor', aciklama: 'Çeviri için bir paket seçin.', kod: 'ABONELIK_KISITLI' }),
    });
    expect(await teklifCevirisiAl(QUOTE, d)).toBeNull();
    expect(k.postlar).toHaveLength(0);
    expect(k.bildirimler[0].description).toBe('Aboneliğiniz bulunmuyor. Çeviri için bir paket seçin.');
  });

  it('çeviri isteğindeki kota reddi (yarış) sunucu mesajıyla gösterilir', async () => {
    const { d, k } = sahte({ post: httpHatasi(403, { mesaj: 'Bu dönemki 60 dosyalık çeviri hakkınızın tamamını kullandınız.', kod: 'CEVIRI_KOTASI' }) });
    expect(await teklifCevirisiAl(QUOTE, d)).toBeNull();
    expect(k.bildirimler[0].description).toBe('Bu dönemki 60 dosyalık çeviri hakkınızın tamamını kullandınız.');
  });
});

describe('ceviri-kota gösterimi', () => {
  it('trTarih Türkiye saatiyle gün söyler (22:30 UTC → ertesi gün)', () => {
    expect(trTarih('2026-10-11T22:30:00.000Z')).toBe('12.10.2026');
  });

  it('trTarih bozuk girdide boş döner', () => {
    expect(trTarih('dun')).toBe('');
  });

  it('kalan kota cümlesi binlik ayraçlı ve yenilenme tarihli', () => {
    expect(kalanKotaCumlesi(KOTA)).toBe('Kalan: 2.100 satır / 28 dosya · yenilenme 12.10.2026');
  });

  it('önizleme cümlesi gereken satırı söyler', () => {
    expect(onizlemeCumlesi(onizleme())).toBe(
      'Bu teklif 1.240 satır çeviri kotası yer. Kalan: 2.100 satır / 28 dosya · yenilenme 12.10.2026.',
    );
  });

  it('ValidationPipe mesaj dizisi birleştirilir', () => {
    expect(ceviriHataMetni(httpHatasi(400, { message: ['quoteId must be a UUID', 'x'] }))).toBe('quoteId must be a UUID · x');
  });

  it('yanıtsız hata kendi mesajını gösterir', () => {
    expect(ceviriHataMetni(new Error('Network Error'))).toBe('Network Error');
  });

  it('tam başarı: kotadan düşen satır ve kalan söylenir', () => {
    const b = sonucBildirimi(sonuc(), 3);
    expect(b.hata).toBe(false);
    expect(b.aciklama).toContain('kotadan 1.240 satır düştü');
    expect(b.aciklama).toContain('Kalan: 860 satır / 27 dosya');
  });

  it('tekrar: kotadan yeniden düşmediği söylenir', () => {
    const b = sonucBildirimi(sonuc({ tekrar: true, kotadanDustu: false }), 3);
    expect(b.aciklama).toContain('kotadan yeniden düşmedi');
  });

  it('kısmi: uyarı olarak gösterilir, Türkçe kalan ve yalnız çevrilen satırın düştüğü söylenir', () => {
    const b = sonucBildirimi(sonuc({ basarisiz: 2, dusulenSatir: 900, cevrilemeyenSatir: 340 }), 3);
    expect(b.hata).toBe(true);
    expect(b.aciklama).toContain('340 satır Türkçe kaldı');
    expect(b.aciklama).toContain('yalnız çevrilen 900 satır düştü');
  });

  it('kısmi: parça hatası olmasa da (model metni atladı) Türkçe kalan satır varsa kısmi sayılır', () => {
    const b = sonucBildirimi(sonuc({ basarisiz: 0, dusulenSatir: 10, cevrilemeyenSatir: 5 }), 3);
    expect(b.baslik).toBe('Çeviri KISMEN tamamlandı');
  });

  it('devam önizlemesi yalnız KALAN satırı yer der', () => {
    expect(onizlemeCumlesi(onizleme({ devam: true, gerekenSatir: 340 }))).toContain(
      'yarım kalan çevirisi tamamlanacak: 340 satır daha yer',
    );
  });

  it('boş sonuç: kota düştüyse "çeviri gelmedi" DENMEZ', () => {
    const b = bosSonucBildirimi(sonuc({ kotadanDustu: true, dusulenSatir: 12 }));
    expect(b.baslik).toBe('Hiçbir hücre değişmedi');
    expect(b.aciklama).toContain('Kotadan 12 satır düştü');
    expect(b.aciklama).not.toContain('çeviri gelmedi');
  });

  it('boş sonuç: kota düşmediyse çevirinin gelmediği ve düşmediği söylenir', () => {
    const b = bosSonucBildirimi(sonuc({ kotadanDustu: false, dusulenSatir: 0 }));
    expect(b.aciklama).toContain('Sunucudan çeviri gelmedi');
    expect(b.aciklama).toContain('Kotadan düşmedi');
  });
});

describe('teklifCevirisiAl — tekrar ve süren çeviri', () => {
  it('tekrar: onay SORULMAZ, istek yine gider (kotadan düşmez)', async () => {
    const { d, k } = sahte({ onizleme: onizleme({ tekrar: true, gerekenSatir: 0 }) });
    const r = await teklifCevirisiAl(QUOTE, d);
    expect(k.onaylar).toHaveLength(0);
    expect(k.postlar).toHaveLength(1);
    expect(r).not.toBeNull();
  });

  it('süren çeviri: istek gitmez, onay sorulmaz, neden söylenir', async () => {
    const { d, k } = sahte({ onizleme: onizleme({ suruyor: true }) });
    expect(await teklifCevirisiAl(QUOTE, d)).toBeNull();
    expect(k.postlar).toHaveLength(0);
    expect(k.onaylar).toHaveLength(0);
    expect(k.bildirimler[0].title).toBe('Çeviri sürüyor');
  });
});

// ── BAĞLANTI — akış doğru ama ekran onu çağırmıyorsa hiçbir şey değişmez ──
// (mekanizma var, bağlantı yok dersi). Ekranlar büyük istemci bileşenleri;
// burada yalnız kablo ölçülür: akış çağrılıyor, eski gövde gitmiyor.
describe('ekran bağlantısı', () => {
  const kok = join(__dirname, '../..');
  const oku = (yol: string) => readFileSync(join(kok, yol), 'utf8');
  const EKRANLAR = ['app/(protected)/quotes/[id]/page.tsx', 'app/(protected)/quotes/new/page.tsx'];

  it.each(EKRANLAR)('%s çeviriyi ortak akıştan ister', (yol) => {
    expect(oku(yol)).toMatch(/teklifCevirisiAl\(/);
  });

  it.each(EKRANLAR)('%s /ai/translate ucuna kendisi istek atmaz (metin listesi gönderilemez)', (yol) => {
    expect(oku(yol)).not.toMatch(/['"`]\/ai\/translate['"`]/);
  });

  it('Düzenle ekranı kaydı olmayan teklifte Türkçe→İngilizce düğmesini kapatır', () => {
    expect(oku('app/(protected)/quotes/new/page.tsx')).toContain(
      'disabled={ceviriYukleniyor || (!revizyonId && ceviriDili === \'tr\')}',
    );
  });

  it('Düzenle ekranı kapalı düğmenin nedenini görünür yazar', () => {
    expect(oku('app/(protected)/quotes/new/page.tsx')).toContain('Çeviri için önce teklifi kaydedin');
  });

  it('profil sayfası sabit limit taşımaz, kotayı sunucudan okur', () => {
    const profil = oku('app/(protected)/profile/page.tsx');
    expect(profil).not.toMatch(/const (CORE|PRO)_LIMITS/);
    expect(profil).toContain("'/ai/translate/kota'");
  });

  it('profil sayfası kısıtlı firmada çevirinin kapalı olduğunu söyler', () => {
    const profil = oku('app/(protected)/profile/page.tsx');
    expect(profil).toMatch(/kota\.ceviriAcik === false/);
  });

  it.each(EKRANLAR)('%s hiç hücre değişmeyen sonucu ortak bildirimle söyler', (yol) => {
    expect(oku(yol)).toMatch(/bosSonucBildirimi\(sonuc\)/);
  });

  it('Düzenle ekranı çevrilmiş satırlı taslağı İngilizce açar (düğme "Türkçeye Dön")', () => {
    expect(oku('app/(protected)/quotes/new/page.tsx')).toMatch(/cevrilmisSatirVarMi\(/);
  });
});
