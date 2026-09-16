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
import { teklifCevirisiAl, teklifGorunumuAl, teklifIngilizcesiniAl, type CeviriAkisiBagimliliklari } from './ceviri-akisi';
import {
  bosSonucBildirimi,
  ceviriHataMetni,
  kalanKotaCumlesi,
  onizlemeCumlesi,
  goruntulemeBildirimi,
  sonucBildirimi,
  tamamlanamadiBildirimi,
  trTarih,
  type CeviriKotaOzeti,
  type CeviriOnizleme,
  type GoruntulemeYaniti,
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
    toplamSatir: 1240,
    onbellektenSatir: 0,
    metinSayisi: 310,
    tekrar: false,
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
    onbellektenSatir: 0,
    tekrar: false,
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
  goruntule?: GoruntulemeYaniti | Error;
  onay?: boolean;
  post?: TeklifCeviriSonucu | Error;
}): { d: CeviriAkisiBagimliliklari; k: Kayit } {
  const k: Kayit = { getler: [], postlar: [], onaylar: [], bildirimler: [], yukleniyor: [] };
  const d: CeviriAkisiBagimliliklari = {
    get: async (url, ayar) => {
      k.getler.push({ url, params: ayar.params });
      if (url === '/ai/translate/goruntule') {
        if (o.goruntule instanceof Error) throw o.goruntule;
        return { data: o.goruntule ?? { odenmis: false, neden: 'CEVIRI_YOK', satirSayisi: 1240, degisecekSatir: 3, karsiliksizSatir: 0 } };
      }
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

  it('önizleme cümlesi YENİ satırı söyler (hepsi yeniyse hazır cümlesi yok)', () => {
    expect(onizlemeCumlesi(onizleme())).toBe(
      'Bu teklifin 1.240 satırı yeni; kotadan 1.240 satır düşer. Kalan: 2.100 satır / 28 dosya · yenilenme 12.10.2026.',
    );
  });

  // PARA HARCANANA HAK DÜŞER (Emre 16.09): önbellekten karşılanan satır ayrıca
  // söylenir — tek sayı yazmak teklifin tamamının ücretlendiğini düşündürürdü.
  it('★ önizleme cümlesi önbellekten gelen satırı ayrıca söyler', () => {
    expect(onizlemeCumlesi(onizleme({ gerekenSatir: 240, toplamSatir: 1240, onbellektenSatir: 1000 }))).toBe(
      'Bu teklifin 240 satırı yeni; kotadan 240 satır düşer. 1.000 satır daha önce çevrildiği için kotadan düşmez. Kalan: 2.100 satır / 28 dosya · yenilenme 12.10.2026.',
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

  it('★ yeni satır yoksa kotadan hiçbir şey düşmediği söylenir', () => {
    const b = sonucBildirimi(sonuc({ tekrar: true, kotadanDustu: false, dusulenSatir: 0, onbellektenSatir: 1240 }), 3);
    expect(b.aciklama).toContain('Yeni çevrilen satır olmadığı için kotadan hiçbir şey düşmedi.');
  });

  it('★ karışık teklifte düşen ve düşmeyen satır AYRI söylenir', () => {
    const b = sonucBildirimi(sonuc({ dusulenSatir: 240, onbellektenSatir: 1000 }), 3);
    expect(b.aciklama).toContain('kotadan 240 satır düştü.');
    expect(b.aciklama).toContain('1.000 satır daha önce çevrildiği için düşmedi.');
  });

  // REVİZE K-T7 (15.09): kısmi ve devam dalları KALDI — sunucu eksik çeviride
  // 422 döner, ekran tamamlanamadı bildirimini gösterir.
  it('tekrar metni "az önce" ya da pencere demez', () => {
    const b = sonucBildirimi(sonuc({ tekrar: true, kotadanDustu: false, dusulenSatir: 0, onbellektenSatir: 1240 }), 3);
    expect(b.aciklama).not.toContain('az önce');
    expect(b.aciklama).not.toMatch(/dakika/);
  });

  it('tamamlanmış sonuçta kısmi dal YOK (başarısız satır alanı taşınmaz)', () => {
    const b = sonucBildirimi(sonuc({ basarisiz: 2 }), 3);
    expect(b.hata).toBe(false);
    expect(b.baslik).not.toContain('KISMEN');
    expect(b.aciklama).not.toMatch(/dakika|Türkçe kaldı/);
  });

  it('önizleme cümlesinde devam dalı yok', () => {
    expect(onizlemeCumlesi(onizleme({ gerekenSatir: 340, toplamSatir: 340 }))).toBe(
      'Bu teklifin 340 satırı yeni; kotadan 340 satır düşer. Kalan: 2.100 satır / 28 dosya · yenilenme 12.10.2026.',
    );
  });

  it('görüntüleme bildirimi hücre sayısını ve kotadan düşmediğini söyler', () => {
    const b = goruntulemeBildirimi({ odenmis: true, tamam: true, kaynak: 'TUKETIM', harita: {}, satirSayisi: 3 }, 12);
    expect(b.baslik).toBe('İngilizce görünüm açıldı');
    expect(b.aciklama).toBe('12 hücre İngilizce gösteriliyor · bu teklif daha önce çevrilmişti, kotadan düşmedi.');
  });

  it('tamamlanamadı bildirimi: ilk 5 metin, 60 karakter kesimi, "ve M satır daha", kotadan düşmedi', () => {
    const uzun = 'Ş'.repeat(70);
    const b = tamamlanamadiBildirimi({
      kod: 'CEVIRI_TAMAMLANAMADI',
      cevrilemeyenSayisi: 9,
      cevrilemeyenMetinSayisi: 8,
      cevrilemeyenSatirlar: ['A', 'B', 'C', 'D', uzun, 'ALTINCI', 'G', 'H'],
    });
    expect(b.baslik).toBe('Çeviri tamamlanamadı, tekrar deneyin');
    expect(b.hata).toBe(true);
    expect(b.aciklama).toContain(`9 satır çevrilemedi: «A» · «B» · «C» · «D» · «${'Ş'.repeat(60)}…» (ve 3 satır daha).`);
    expect(b.aciklama).not.toContain('ALTINCI');
    expect(b.aciklama).toContain('Kotadan hiçbir şey düşmedi; teklif Türkçe kaldı.');
    expect(b.aciklama).toContain('Tekrar denediğinizde çevrilmiş satırlar beklemeden gelir.');
  });

  it('tamamlanamadı bildirimi: 5 ya da daha az metinde "ve … satır daha" yazılmaz', () => {
    const b = tamamlanamadiBildirimi({ cevrilemeyenSayisi: 2, cevrilemeyenMetinSayisi: 1, cevrilemeyenSatirlar: ['ÇELİK BORU'] });
    expect(b.aciklama).toContain('2 satır çevrilemedi: «ÇELİK BORU». Kotadan hiçbir şey düşmedi');
    expect(b.aciklama).not.toContain('satır daha');
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

describe('teklifCevirisiAl — 422 çeviri tamamlanamadı (hepsi ya da hiçbiri)', () => {
  it('422 CEVIRI_TAMAMLANAMADI: tamamlanamadı bildirimi (liste + kotadan düşmedi), dönüş null', async () => {
    const { d, k } = sahte({
      post: httpHatasi(422, {
        mesaj: 'Çeviri tamamlanamadı, tekrar deneyin',
        kod: 'CEVIRI_TAMAMLANAMADI',
        cevrilemeyenSayisi: 7,
        cevrilemeyenMetinSayisi: 6,
        cevrilemeyenSatirlar: ['A', 'B', 'C', 'D', 'E', 'F'],
      }),
    });
    const r = await teklifCevirisiAl(QUOTE, d);
    expect(r).toBeNull();
    expect(k.bildirimler).toHaveLength(1);
    expect(k.bildirimler[0].title).toBe('Çeviri tamamlanamadı, tekrar deneyin');
    expect(k.bildirimler[0].variant).toBe('destructive');
    expect(k.bildirimler[0].description).toContain('7 satır çevrilemedi: «A» · «B» · «C» · «D» · «E» (ve 1 satır daha)');
    expect(k.bildirimler[0].description).toContain('Kotadan hiçbir şey düşmedi');
  });

  it('başka hata kodu eski metin kuralıyla gösterilir', async () => {
    const { d, k } = sahte({ post: httpHatasi(400, { message: 'Ceviri icin Claude API anahtari tanimli degil' }) });
    expect(await teklifCevirisiAl(QUOTE, d)).toBeNull();
    expect(k.bildirimler[0].title).toBe('Çeviri başarısız');
  });
});

describe('teklifIngilizcesiniAl — önce görüntüleme (bakmak ≠ çevirmek)', () => {
  const tam: GoruntulemeYaniti = { odenmis: true, tamam: true, kaynak: 'TUKETIM', harita: { 'PVC BORU': 'PVC PIPE' }, satirSayisi: 1 };

  it('ödenmiş + tam: harita görüntülemeden gelir; önizleme ve POST GİTMEZ, onay sorulmaz', async () => {
    const { d, k } = sahte({ goruntule: tam });
    const r = await teklifIngilizcesiniAl(QUOTE, d);
    expect(r?.tur).toBe('goruntuleme');
    expect(r?.harita).toEqual({ 'PVC BORU': 'PVC PIPE' });
    expect(k.getler.map((g) => g.url)).toEqual(['/ai/translate/goruntule']);
    expect(k.postlar).toHaveLength(0);
    expect(k.onaylar).toHaveLength(0);
    expect(k.yukleniyor).toEqual([true, false]);
  });

  it('ödenmiş ama eksik: önizleme → (tekrar, onaysız) → POST; harita POST\'tan gelir', async () => {
    const { d, k } = sahte({ goruntule: { odenmis: true, tamam: false, kaynak: 'TUKETIM', satirSayisi: 3, cevrilemeyenSatir: 1 }, onizleme: onizleme({ tekrar: true, gerekenSatir: 0 }) });
    const r = await teklifIngilizcesiniAl(QUOTE, d);
    expect(r?.tur).toBe('ceviri');
    expect(k.getler.map((g) => g.url)).toEqual(['/ai/translate/goruntule', '/ai/translate/onizleme']);
    expect(k.postlar).toHaveLength(1);
  });

  it('ödenmemiş: önizleme → onay → POST', async () => {
    const { d, k } = sahte({});
    const r = await teklifIngilizcesiniAl(QUOTE, d);
    expect(r?.tur).toBe('ceviri');
    expect(k.onaylar).toHaveLength(1);
    expect(k.postlar).toEqual([{ url: '/ai/translate', govde: { quoteId: QUOTE, hedefDil: 'en' } }]);
  });

  it('görüntüleme hatası (429) akışa düşer, ayrıca bildirilmez', async () => {
    const { d, k } = sahte({ goruntule: httpHatasi(429, { message: 'Too Many Requests' }) });
    const r = await teklifIngilizcesiniAl(QUOTE, d);
    expect(r?.tur).toBe('ceviri');
    expect(k.postlar).toHaveLength(1);
    expect(k.bildirimler).toHaveLength(0);
  });

  it('422 → null (hiçbir satır değişmez)', async () => {
    const { d } = sahte({ post: httpHatasi(422, { kod: 'CEVIRI_TAMAMLANAMADI', cevrilemeyenSayisi: 1, cevrilemeyenSatirlar: ['X'] }) });
    expect(await teklifIngilizcesiniAl(QUOTE, d)).toBeNull();
  });

  it('teklifGorunumuAl hatayı ayrı döner', async () => {
    const { d } = sahte({ goruntule: new Error('ağ') });
    const g = await teklifGorunumuAl(QUOTE, d);
    expect('hata' in g).toBe(true);
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
  /** Yorumlar atılır: kapı yorumda geçen metinle yeşil yanmasın. */
  const kodu = (m: string) => m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const EKRANLAR = ['app/(protected)/quotes/[id]/page.tsx', 'app/(protected)/quotes/new/page.tsx'];

  it.each(EKRANLAR)('%s "İngilizceye Çevir" önce görüntülemeden geçen ortak akışı ister', (yol) => {
    expect(kodu(oku(yol))).toMatch(/teklifIngilizcesiniAl\(/);
  });

  const detay = () => kodu(oku('app/(protected)/quotes/[id]/page.tsx'));

  it('detay açılış etkisi kaydı Türkçeye ONARMAZ (dilKaydet(\'tr\') yalnız "Türkçeye Dön"de)', () => {
    const kod = detay();
    const acilis = kod.slice(kod.indexOf('api.get<QuoteDetail>(`/quotes/${id}`)'), kod.indexOf('}, [id]);'));
    expect(acilis.length).toBeGreaterThan(0);
    expect(acilis).not.toContain("dilKaydet('tr')");
    expect(kod.split("dilKaydet('tr')").length - 1).toBe(1);
  });

  it('detay kaydı yerinde değiştirmez: ingilizceGorunum kullanır, ceviriUygula/ceviriGeriAl kullanmaz', () => {
    const kod = detay();
    expect(kod).toMatch(/ingilizceGorunum\(/);
    expect(kod).toMatch(/turkceGorunum\(/);
    expect(kod).not.toMatch(/ceviriUygula\(|ceviriGeriAl\(/);
  });

  it('detay: çeviri ve iki çıktı düğmesi görünüm yüklenirken kapalı', () => {
    const kapalilar = detay().match(/disabled=\{[^}]*gorunumYukleniyor[^}]*\}/g) ?? [];
    expect(kapalilar.length).toBe(3);
  });

  it('detay: ad kolonu düzenlenemez — kilit AD kolonunun kimliğine bağlı, gizli ve görünür dalın ikisi de kilitli tanımı döndürür', () => {
    // T1 incelemesi DÜŞÜK-3 (16.09): yalnız `editable: false` metnini arayan eski
    // kapı, kilidi yanlış kolona (`noField`) uygulayan mutantta yeşil kalıyordu.
    const kod = detay();
    expect(kod).toMatch(
      /const kilitli = c\.field === activeSheet\.columnRoles\?\.nameField \? \{ \.\.\.temel, editable: false \} : temel;\s*return hiddenFields\.has\(c\.field\) \? \{ \.\.\.kilitli, hide: true \} : kilitli;/,
    );
    expect(kod.split('editable: false').length - 1).toBe(1);
  });

  it('detay: Revize Et ekrandaki görünümü taşır', () => {
    expect(detay()).toMatch(/kayittanTaslak\(\{ \.\.\.quote, sheets: gorunenSayfalar \}/);
  });

  it('detay: açılış kararı saf modülden (teklif-dil-karari)', () => {
    expect(detay()).toMatch(/acilisKarari\(/);
    expect(detay()).toMatch(/goruntulemeGerekirMi\(/);
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
