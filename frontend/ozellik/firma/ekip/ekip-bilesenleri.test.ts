/**
 * 23.09.2026 — EKİP & İZİNLER (ikinci tasarım) BİLEŞENLERİ GERÇEKTEN ÇİZİLİR.
 *
 * `react-dom/server` ile statik çizim (depoda jsdom/RTL yok; desen:
 * `ozellik/odeme/deneme-satiri.test.ts`). Ölçülen şey "bir metin kaynakta var
 * mı" DEĞİL, bileşenin verilen SUNUCU VERİSİNDEN ne çizdiği: hangi satırda
 * hangi rozet, hangi anahtar açık, hangi düğme kime görünür.
 *
 * Tıklama çizilemez; tıklamanın SONUCU saf yardımcılarda (`izinDegistir`,
 * `davetEpostaHatasi`) ölçülür. "Emin misin?" kuralı (ilk tık SİLMEZ)
 * kaynakta, yorumlar atılarak ölçülür.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Davet, Uye } from './ekip-tipleri';
import type { UyeIzni } from './izin-metinleri';
import { UyeListesi } from './UyeListesi';
import { IzinSecici } from './IzinSecici';
import { DavetPenceresi } from './DavetPenceresi';
import { UyeIzinPaneli } from './UyeIzinPaneli';
import { CikarmaBolumu } from './CikarmaBolumu';
import { KilitliOzellikKarti } from './KilitliOzellikKarti';
import { Anahtar } from './ekip-parcalari';
import {
  DAVET_EPOSTA_HATA_METNI,
  davetEpostaHatasi,
  epostaBicimiGecerli,
} from './davet-kurallari';

const DORDU: UyeIzni[] = ['excel', 'dwg', 'firmaTeklifleri', 'kutuphane'];
/** Tasarımdaki örnek ekip (ekran 1). */
const EMRE: Uye = {
  id: 'u1', eposta: 'emre.basarann1@gmail.com', ad: null, soyad: null, firmaRol: 'sahip',
  durum: 'active', katildi: '2026-09-01T09:00:00Z', durduruldu: false, mfaAcik: true, izinler: DORDU,
};
const MEHMET: Uye = {
  id: 'u2', eposta: 'mehmet.muhendis@firma.com', ad: null, soyad: null, firmaRol: 'uye',
  durum: 'active', katildi: '2026-09-12T09:00:00Z', durduruldu: false, mfaAcik: false,
  izinler: ['excel', 'dwg', 'kutuphane'],
};
const SELIN: Uye = {
  id: 'u3', eposta: 'selin.satinalma@firma.com', ad: null, soyad: null, firmaRol: 'uye',
  durum: 'active', katildi: '2026-09-14T09:00:00Z', durduruldu: false, mfaAcik: true,
  izinler: ['firmaTeklifleri', 'kutuphane'],
};
const AYSE: Davet = {
  id: 'd1', eposta: 'ayse.teknik@firma.com', sonGecerlilik: '2026-09-30T09:00:00Z',
  gonderimSayisi: 1, izinler: ['excel', 'dwg'],
};

const ciz = (el: ReactElement) => renderToStaticMarkup(el);
/** Görünen metin (sr-only dahil): etiketler atılır, boşluk tekilleşir. */
const metin = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const say = (s: string, alt: string) => s.split(alt).length - 1;
/** Anahtarların `aria-checked` sırası. */
const anahtarlar = (html: string) =>
  // `Array.from`: yineleyici YAYMA (`[...]`) ES5 hedefinde derlenmiyor (TS2802).
  Array.from(html.matchAll(/role="switch" aria-checked="(true|false)"/g)).map((m) => m[1] === 'true');
const EMOJI = new RegExp('\\p{Extended_Pictographic}', 'u');

/**
 * TIKLAMA BAĞLANTISI (render altyapısı yok): kancasız bileşen FONKSİYON
 * olarak çağrılır, dönen öğe ağacında işleyiciler bulunup ÇAĞRILIR. Ölçülen
 * şey "düğme var mı" değil, düğmenin HANGİ hedefi/değeri ilettiği.
 */
function agacOgeleri(dugum: ReactNode, uygun: (e: ReactElement) => boolean): ReactElement[] {
  const sonuc: ReactElement[] = [];
  const gez = (n: ReactNode): void => {
    if (Array.isArray(n)) return n.forEach(gez);
    if (!isValidElement(n)) return;
    if (uygun(n)) sonuc.push(n);
    for (const v of Object.values(n.props as Record<string, unknown>)) {
      if (Array.isArray(v) || isValidElement(v)) gez(v as ReactNode);
    }
  };
  gez(dugum);
  return sonuc;
}
const duzMetin = (n: ReactNode): string =>
  Array.isArray(n) ? n.map(duzMetin).join('') : typeof n === 'string' ? n
    : isValidElement(n) ? duzMetin((n.props as { children?: ReactNode }).children) : '';
const dugmeler = (agac: ReactNode, metin: string) =>
  agacOgeleri(agac, (e) => typeof (e.props as { onClick?: unknown }).onClick === 'function'
    && duzMetin((e.props as { children?: ReactNode }).children).includes(metin));

const listeCiz = (p: Partial<Parameters<typeof UyeListesi>[0]> = {}) =>
  ciz(
    createElement(UyeListesi, {
      uyeler: [EMRE, MEHMET, SELIN],
      bekleyenDavetler: [AYSE],
      sahipMi: true,
      benimId: 'u1',
      islemde: false,
      onDuzenle: () => {},
      onYenidenGonder: () => {},
      ...p,
    }),
  );

describe('Üyeler listesi (ekran 1)', () => {
  it('başlık ve kişi sayısı: üyeler + bekleyen davetler', () => {
    const m = metin(listeCiz());
    expect(m).toContain('Üyeler');
    expect(m).toContain('4 kişi');
  });

  it('⭐ yönetici satırı: tek harf avatar, "Sen", açıklama, "Yönetici" rozeti; izin etiketi YOK', () => {
    const html = listeCiz({ uyeler: [EMRE], bekleyenDavetler: [] });
    const m = metin(html);
    expect(html).toMatch(/>E<\/div>/);
    expect(m).toContain('Sen');
    expect(m).toContain('Tüm bölümlere erişir, ekibi ve aboneliği yönetir');
    expect(m).toContain('Yönetici');
    expect(m).not.toContain('Aktif');
    expect(m).not.toContain('İzinleri düzenle');
    expect(m).not.toMatch(/— (açık|kapalı)/);
  });

  it('⭐ üye satırı: baş harfler, "Aktif", dört etiket SUNUCUNUN listesinden (açık tik / kapalı kilit)', () => {
    const m = metin(listeCiz({ uyeler: [MEHMET], bekleyenDavetler: [] }));
    expect(m).toContain('MM');
    expect(m).toContain('Aktif');
    expect(m).toContain('Excel keşif — açık');
    expect(m).toContain('DWG proje — açık');
    expect(m).toContain('Teklif tutarları — kapalı');
    expect(m).toContain('Kütüphanem — açık');
    expect(m).toContain('İzinleri düzenle');
  });

  it('bekleyen davet: "Davet bekliyor", davetteki izinler, "Yeniden gönder" + "İzinleri düzenle"', () => {
    const m = metin(listeCiz({ uyeler: [], bekleyenDavetler: [AYSE] }));
    expect(m).toContain('AT');
    expect(m).toContain('Davet bekliyor');
    expect(m).toContain('Excel keşif — açık');
    expect(m).toContain('Kütüphanem — kapalı');
    expect(m).toContain('Yeniden gönder');
    expect(m).toContain('İzinleri düzenle');
  });

  it('⭐ düğmeler YALNIZ yöneticiye: üyenin gördüğü listede düzenleme/yeniden gönderme yok', () => {
    const sahip = metin(listeCiz());
    expect(say(sahip, 'İzinleri düzenle')).toBe(3);
    expect(say(sahip, 'Yeniden gönder')).toBe(1);
    const uye = metin(listeCiz({ sahipMi: false, benimId: 'u2', bekleyenDavetler: [] }));
    expect(uye).not.toContain('İzinleri düzenle');
    expect(uye).not.toContain('Yeniden gönder');
    // "Yönet " düğmesi ("Yönetici" rozeti ayrı sözcük).
    expect(say(uye, 'Yönet ')).toBe(0);
  });

  it('`izinler: null` (sana gösterilmiyor) → etiket ÇİZİLMEZ; boş dizi → dört kilit', () => {
    const gizli = metin(listeCiz({ uyeler: [{ ...SELIN, izinler: null }], bekleyenDavetler: [] }));
    expect(gizli).not.toMatch(/— (açık|kapalı)/);
    const bos = metin(listeCiz({ uyeler: [{ ...SELIN, izinler: [] }], bekleyenDavetler: [] }));
    expect(say(bos, '— kapalı')).toBe(4);
  });

  it('sunucunun durumları kaybolmaz: durdurulan ve askıdaki üye', () => {
    expect(metin(listeCiz({ uyeler: [{ ...MEHMET, durduruldu: true }] }))).toContain('Durduruldu (paket sınırı)');
    expect(metin(listeCiz({ uyeler: [{ ...MEHMET, durum: 'banned' }] }))).toContain('Askıda');
  });

  it('çoklu yönetici: öteki yöneticiye "Yönet" (rol/çıkarma yolu); kendi satırın düzenlenemez', () => {
    const ikinci: Uye = { ...MEHMET, id: 'u9', firmaRol: 'sahip', izinler: DORDU };
    expect(say(metin(listeCiz({ uyeler: [EMRE, ikinci], bekleyenDavetler: [] })), 'Yönet ')).toBe(1);
  });

  it('ad varsa üstte ad, yanında e-posta BİR kez', () => {
    const m = metin(listeCiz({ uyeler: [{ ...MEHMET, ad: 'Mehmet', soyad: 'Yılmaz' }], bekleyenDavetler: [] }));
    expect(m).toContain('Mehmet Yılmaz');
    expect(say(m, 'mehmet.muhendis@firma.com')).toBe(1);
    expect(m).toContain('MY');
  });

  it('emoji yok', () => {
    expect(EMOJI.test(listeCiz())).toBe(false);
  });

  it('⭐ etiketin GÖRÜNÜMÜ durumuyla uyumlu: açık = yeşil + tik, kapalı = gri + kilit', () => {
    const html = listeCiz({ uyeler: [MEHMET, SELIN], bekleyenDavetler: [AYSE] });
    const etiketler = Array.from(html.matchAll(/<span class="(relative inline-flex h-6[^"]*)">(.*?)<\/span><\/span>/g));
    expect(etiketler.length).toBe(12);
    for (const [, sinif, ic] of etiketler) {
      const acik = ic.includes('— açık');
      expect(sinif, ic).toContain(acik ? 'bg-[#f0fdf4]' : 'bg-[#f8fafc]');
      expect(ic).toContain(acik ? 'lucide-check' : 'lucide-lock');
    }
  });

  it('⭐ TIKLAMA BAĞLANTISI: her "İzinleri düzenle" KENDİ satırının hedefini, "Yeniden gönder" kendi davetini iletir', () => {
    const hedefler: unknown[] = [];
    const yeniden: unknown[] = [];
    const agac = UyeListesi({
      uyeler: [EMRE, MEHMET, SELIN], bekleyenDavetler: [AYSE], sahipMi: true, benimId: 'u1', islemde: false,
      onDuzenle: (h) => hedefler.push(h), onYenidenGonder: (d) => yeniden.push(d),
    });
    const duzenle = dugmeler(agac, 'İzinleri düzenle');
    expect(duzenle.length).toBe(3);
    duzenle.forEach((b) => (b.props as { onClick: () => void }).onClick());
    expect(hedefler).toEqual([{ tur: 'uye', uye: MEHMET }, { tur: 'uye', uye: SELIN }, { tur: 'davet', davet: AYSE }]);
    const gonder = dugmeler(agac, 'Yeniden gönder');
    expect(gonder.length).toBe(1);
    (gonder[0].props as { onClick: () => void }).onClick();
    expect(yeniden).toEqual([AYSE]);
  });
});

describe('İzin anahtarları (davet penceresi + panel)', () => {
  it('dört anahtar, kanonik sırada; açık/kapalı SEÇİMDEN', () => {
    const html = ciz(createElement(IzinSecici, { secili: ['excel', 'kutuphane'], onDegis: () => {} }));
    expect(anahtarlar(html)).toEqual([true, false, false, true]);
    const m = metin(html);
    expect(m.indexOf('Excel keşif')).toBeLessThan(m.indexOf('DWG proje'));
    expect(m.indexOf('DWG proje')).toBeLessThan(m.indexOf('Son teklifler ve tutarları'));
    expect(m.indexOf('Son teklifler ve tutarları')).toBeLessThan(m.indexOf('Kütüphanem'));
  });

  it('"Fiyat bilgisi" rozeti iki kez; açıklamalar tasarımdan', () => {
    const m = metin(ciz(createElement(IzinSecici, { secili: [], onDegis: () => {} })));
    expect(say(m, 'Fiyat bilgisi')).toBe(2);
    expect(m).toContain('Excel dosyasından keşif ve metraj çıkarabilir');
    expect(m).toContain('DWG/PDF çizimden metraj alabilir');
    expect(m).toContain('Kayıtlı marka ve birim fiyatlarını görebilir');
  });

  it('⭐ TIKLAMA BAĞLANTISI: anahtar, KENDİ iznini açıp kapatan yeni diziyi iletir (girdi değişmez)', () => {
    const cagrilar: UyeIzni[][] = [];
    const secili: UyeIzni[] = ['excel'];
    const agac = IzinSecici({ secili, onDegis: (y) => cagrilar.push(y) });
    const anahtarOgeleri = agacOgeleri(agac, (e) => e.type === Anahtar);
    expect(anahtarOgeleri.map((a) => (a.props as { etiket: string }).etiket)).toEqual([
      'Excel keşif', 'DWG proje', 'Son teklifler ve tutarları', 'Kütüphanem',
    ]);
    expect(anahtarOgeleri.map((a) => (a.props as { acik: boolean }).acik)).toEqual([true, false, false, false]);
    (anahtarOgeleri[3].props as { onDegis: (y: boolean) => void }).onDegis(true);
    (anahtarOgeleri[0].props as { onDegis: (y: boolean) => void }).onDegis(false);
    expect(cagrilar).toEqual([['excel', 'kutuphane'], []]);
    expect(secili).toEqual(['excel']);
  });

  it('her anahtarın erişilebilir adı izin başlığı', () => {
    const html = ciz(createElement(IzinSecici, { secili: [], onDegis: () => {} }));
    for (const ad of ['Excel keşif', 'DWG proje', 'Son teklifler ve tutarları', 'Kütüphanem']) {
      expect(html, ad).toContain(`aria-label="${ad}"`);
    }
  });
});

describe('Davet penceresi (ekran 2)', () => {
  const pencere = () =>
    ciz(
      createElement(DavetPenceresi, {
        ekip: { uyeler: [EMRE, MEHMET, SELIN], bekleyenDavetler: [] },
        hakMetni: '4 / 5',
        islemde: false,
        onGonder: async () => true,
        onKapat: () => {},
      }),
    );

  it('⭐ açılış seçimi tasarımdaki gibi: Excel ve DWG AÇIK, fiyat bilgisi taşıyan ikisi KAPALI', () => {
    expect(anahtarlar(pencere())).toEqual([true, true, false, false]);
  });

  it('metinler, alan ve alt şerit tasarımdan', () => {
    const html = pencere();
    const m = metin(html);
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-labelledby="davet-baslik"/);
    for (const t of [
      'Ekibe üye davet et',
      'Davet bağlantısı bu adrese e-postayla gider. Üye parolasını kendisi belirler.',
      'E-posta adresi',
      'Neleri görebilsin?',
      'Sonradan değiştirebilirsin',
      'Kullanıcı hakkı: 4 / 5',
      'Vazgeç',
      'Davet gönder',
    ]) {
      expect(m, t).toContain(t);
    }
    expect(html).toContain('placeholder="ornek@firmaniz.com"');
    // Denetim ilk çizimde bağırmaz (kullanıcı henüz yazmadı).
    expect(html).not.toContain('role="alert"');
  });
});

describe('E-posta denetimi (saf) — biçim + "Bu adres zaten ekipte"', () => {
  const ekip = { uyeler: [EMRE, MEHMET], bekleyenDavetler: [AYSE] };

  it('biçim', () => {
    expect(epostaBicimiGecerli('a@b.co')).toBe(true);
    expect(epostaBicimiGecerli('  a@b.co  ')).toBe(true);
    for (const kotu of ['a@b', 'a b@c.com', 'a@@b.com', '@b.com', 'a@b.c', 'ornek']) {
      expect(epostaBicimiGecerli(kotu), kotu).toBe(false);
    }
  });

  it('boş · biçim · ekipte · davetli · uygun', () => {
    expect(davetEpostaHatasi('   ', ekip)).toBe('bos');
    expect(davetEpostaHatasi('ornek', ekip)).toBe('bicim');
    expect(davetEpostaHatasi('Mehmet.Muhendis@FIRMA.com', ekip)).toBe('ekipte');
    expect(davetEpostaHatasi(' AYSE.teknik@firma.com', ekip)).toBe('davetli');
    expect(davetEpostaHatasi('yeni@firma.com', ekip)).toBeNull();
  });

  it('⭐ karşılaştırma sunucunun kuralıyla: YALNIZ ASCII küçültme ("İ" katlanmaz)', () => {
    const tr = { uyeler: [{ ...MEHMET, eposta: 'ilker@x.com' }], bekleyenDavetler: [] };
    expect(davetEpostaHatasi('ILKER@x.com', tr)).toBe('ekipte');
    // Sunucu `epostaKucult` "İ"yi dokunmadan bırakır → FARKLI adres.
    expect(davetEpostaHatasi('İlker@x.com', tr)).toBeNull();
  });

  it('metin tasarımdan: "Bu adres zaten ekipte."', () => {
    expect(DAVET_EPOSTA_HATA_METNI.ekipte).toBe('Bu adres zaten ekipte.');
  });
});

describe('Üye izinleri paneli (ekran 3)', () => {
  const panel = (hedef: Parameters<typeof UyeIzinPaneli>[0]['hedef']) =>
    ciz(
      createElement(UyeIzinPaneli, {
        hedef,
        islemde: false,
        onKaydet: async () => true,
        onCikar: () => {},
        onRolDegistir: () => {},
        onKapat: () => {},
      }),
    );

  it('⭐ aktif üye: başlık bilgisi, anahtarlar KAYITLI izinden, "Kaydettiğin anda geçerli olur.", çıkarma', () => {
    const html = panel({ tur: 'uye', uye: MEHMET });
    const m = metin(html);
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-labelledby="izin-baslik"/);
    for (const t of [
      'Üye izinleri', 'mehmet.muhendis@firma.com', 'Aktif', 'Katılım: 12.09.2026',
      'İki adımlı giriş kapalı', 'Erişim', 'Kaydettiğin anda geçerli olur.',
      'Ekipten çıkar', 'Erişimi hemen kapanır. E-posta adresi ve kullanıcı hakkı boşa çıkar.',
      'Yönetici yap', 'Vazgeç', 'Kaydet',
    ]) {
      expect(m, t).toContain(t);
    }
    expect(anahtarlar(html)).toEqual([true, true, false, true]);
    // Değişiklik yokken "Kaydet" PASİF (boşuna istek gitmesin).
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Kaydet<\/button>/);
    // İlk çizimde soru YOK: "Ekipten çıkar" önce sorar.
    expect(m).not.toContain('Emin misin?');
  });

  it('⭐ bekleyen davet: "Daveti iptal et" ve yeniden gönderim UYARISI (eski bağlantı geçersiz olur)', () => {
    const m = metin(panel({ tur: 'davet', davet: AYSE }));
    expect(m).toContain('Davet bekliyor');
    expect(m).toContain('Son geçerlilik: 30.09.2026');
    expect(m).toContain('önceki davet bağlantısı geçersiz olur');
    expect(m).toContain('Daveti iptal et');
    expect(m).not.toContain('Ekipten çıkar');
    expect(m).not.toContain('Yönetici yap');
    expect(anahtarlar(panel({ tur: 'davet', davet: AYSE }))).toEqual([true, true, false, false]);
  });

  it('yönetici: izin anahtarı YOK (sunucu SAHIP_TAM_YETKILI), "Üye yap", "Kapat"', () => {
    const html = panel({ tur: 'uye', uye: { ...EMRE, id: 'u9' } });
    const m = metin(html);
    expect(html).not.toContain('role="switch"');
    expect(m).toContain('Yönetici tüm bölümlere erişir; izinleri kapatılamaz.');
    expect(m).toContain('Üye yap');
    expect(m).toContain('Kapat');
    expect(m).not.toContain('Kaydet');
  });
});

describe('"Emin misin?" — ilk tıklama SİLMEZ (kaynak, yorumsuz)', () => {
  const kaynak = fs
    .readFileSync(path.join(__dirname, 'CikarmaBolumu.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('onay işleyicisi YALNIZ soru dalında; ilk düğme yalnız soruyu açar', () => {
    expect(say(kaynak, 'onOnayla')).toBe(3); // imza + tip + TEK çağrı yeri
    expect(kaynak).toMatch(/\{soruluyor \? \([\s\S]*Emin misin\?[\s\S]*onClick=\{onOnayla\}[\s\S]*\) : \(/);
    expect(kaynak).toContain('onClick={() => setSoruluyor(true)}');
  });

  it('ilk çizim: soru yok, iki tür doğru metinle', () => {
    const uye = metin(ciz(createElement(CikarmaBolumu, { tur: 'uye', islemde: false, onOnayla: () => {} })));
    expect(uye).toContain('Ekipten çıkar');
    expect(uye).not.toContain('Emin misin?');
    const davet = metin(ciz(createElement(CikarmaBolumu, { tur: 'davet', islemde: false, onOnayla: () => {} })));
    expect(davet).toContain('Daveti iptal et');
  });
});

describe('Kilitli özellik kartı (ekran 6)', () => {
  it('metin tasarımdan; yönetici adresi varsa "Yöneticine yaz" mailto', () => {
    const html = ciz(createElement(KilitliOzellikKarti, { baslik: 'DWG Proje', izin: 'dwg', yonetici: 'emre.basarann1@gmail.com' }));
    expect(metin(html)).toContain('Yöneticin bu özelliği senin için kapattı.');
    expect(html).toContain('href="mailto:emre.basarann1@gmail.com?subject=DWG%20proje%20eri%C5%9Fimi"');
    expect(metin(html)).toContain('Yöneticine yaz');
  });

  it('adres bilinmiyorsa bağlantı ÇİZİLMEZ (boş mailto yok)', () => {
    for (const y of [null, undefined]) {
      const html = ciz(createElement(KilitliOzellikKarti, { baslik: 'Excel Keşif', izin: 'excel', yonetici: y }));
      expect(html).not.toContain('mailto:');
    }
  });
});
