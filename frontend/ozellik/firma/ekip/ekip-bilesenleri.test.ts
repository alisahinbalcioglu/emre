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
 *
 * 06.10 İKİ YETKİ (fiyat, dwg): fikstürler açık/kapalı KARIŞIK seçildi —
 * Mehmet yalnız DWG (fiyat KAPALI), Selin ikisi, Ayşe'nin daveti yalnız
 * fiyat. Hepsini açık yazmak "kapalı" dalını hiç koşturmazdı.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Davet, Uye } from './ekip-tipleri';
import { IZIN_TANIMLARI, type UyeIzni } from './izin-metinleri';
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

const IKISI: UyeIzni[] = ['fiyat', 'dwg'];
const FIYAT = 'Fiyatlandırma ve teklifler (Excel keşif)';
const DWG = 'DWG’den metraj';
/** Tasarımdaki örnek ekip (ekran 1). */
const EMRE: Uye = {
  id: 'u1', eposta: 'emre.basarann1@gmail.com', ad: null, soyad: null, firmaRol: 'sahip',
  durum: 'active', katildi: '2026-09-01T09:00:00Z', durduruldu: false, mfaAcik: true, izinler: IKISI,
};
const MEHMET: Uye = {
  id: 'u2', eposta: 'mehmet.muhendis@firma.com', ad: null, soyad: null, firmaRol: 'uye',
  durum: 'active', katildi: '2026-09-12T09:00:00Z', durduruldu: false, mfaAcik: false,
  // Yalnız DWG'den metraj: metrajı hazırlar, fiyatlandırma KAPALI.
  izinler: ['dwg'],
};
const SELIN: Uye = {
  id: 'u3', eposta: 'selin.satinalma@firma.com', ad: null, soyad: null, firmaRol: 'uye',
  durum: 'active', katildi: '2026-09-14T09:00:00Z', durduruldu: false, mfaAcik: true,
  izinler: ['fiyat', 'dwg'],
};
const AYSE: Davet = {
  id: 'd1', eposta: 'ayse.teknik@firma.com', sonGecerlilik: '2026-09-30T09:00:00Z',
  gonderimSayisi: 1, izinler: ['fiyat'],
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
    expect(m).not.toContain('Yetkileri düzenle');
    expect(m).not.toMatch(/— (açık|kapalı)/);
  });

  it('⭐ üye satırı: baş harfler, "Aktif", iki etiket SUNUCUNUN listesinden (açık tik / kapalı kilit)', () => {
    const m = metin(listeCiz({ uyeler: [MEHMET], bekleyenDavetler: [] }));
    expect(m).toContain('MM');
    expect(m).toContain('Aktif');
    expect(m).toContain('Fiyatlandırma ve teklifler — kapalı');
    expect(m).toContain('DWG’den metraj — açık');
    expect(say(m, '— açık') + say(m, '— kapalı')).toBe(2);
    // 06.10: ekranda "yetki" (kod adları `izin…` kaldı).
    expect(m).toContain('Yetkileri düzenle');
    expect(m).not.toContain('İzinleri düzenle');
  });

  it('bekleyen davet: "Davet bekliyor", davetteki yetkiler, "Yeniden gönder" + "Yetkileri düzenle"', () => {
    const m = metin(listeCiz({ uyeler: [], bekleyenDavetler: [AYSE] }));
    expect(m).toContain('AT');
    expect(m).toContain('Davet bekliyor');
    expect(m).toContain('Fiyatlandırma ve teklifler — açık');
    expect(m).toContain('DWG’den metraj — kapalı');
    expect(m).toContain('Yeniden gönder');
    expect(m).toContain('Yetkileri düzenle');
  });

  it('⭐ düğmeler YALNIZ yöneticiye: üyenin gördüğü listede düzenleme/yeniden gönderme yok', () => {
    const sahip = metin(listeCiz());
    expect(say(sahip, 'Yetkileri düzenle')).toBe(3);
    expect(say(sahip, 'Yeniden gönder')).toBe(1);
    const uye = metin(listeCiz({ sahipMi: false, benimId: 'u2', bekleyenDavetler: [] }));
    expect(uye).not.toContain('Yetkileri düzenle');
    expect(uye).not.toContain('Yeniden gönder');
    // "Yönet " düğmesi ("Yönetici" rozeti ayrı sözcük).
    expect(say(uye, 'Yönet ')).toBe(0);
  });

  it('`izinler: null` (sana gösterilmiyor) → etiket ÇİZİLMEZ; boş dizi → iki kilit', () => {
    const gizli = metin(listeCiz({ uyeler: [{ ...SELIN, izinler: null }], bekleyenDavetler: [] }));
    expect(gizli).not.toMatch(/— (açık|kapalı)/);
    const bos = metin(listeCiz({ uyeler: [{ ...SELIN, izinler: [] }], bekleyenDavetler: [] }));
    expect(say(bos, '— kapalı')).toBe(2);
    expect(bos).not.toContain('— açık');
  });

  it('sunucunun durumları kaybolmaz: durdurulan ve askıdaki üye', () => {
    expect(metin(listeCiz({ uyeler: [{ ...MEHMET, durduruldu: true }] }))).toContain('Durduruldu (paket sınırı)');
    expect(metin(listeCiz({ uyeler: [{ ...MEHMET, durum: 'banned' }] }))).toContain('Askıda');
  });

  it('çoklu yönetici: öteki yöneticiye "Yönet" (rol/çıkarma yolu); kendi satırın düzenlenemez', () => {
    const ikinci: Uye = { ...MEHMET, id: 'u9', firmaRol: 'sahip', izinler: IKISI };
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
    expect(etiketler.length).toBe(6);
    // Fikstür iki durumu da içeriyor (yoksa döngü yalnız bir dalı ölçerdi).
    expect(etiketler.filter(([, , ic]) => ic.includes('— açık')).length).toBe(4);
    expect(etiketler.filter(([, , ic]) => ic.includes('— kapalı')).length).toBe(2);
    for (const [, sinif, ic] of etiketler) {
      const acik = ic.includes('— açık');
      expect(sinif, ic).toContain(acik ? 'bg-[#f0fdf4]' : 'bg-[#f8fafc]');
      expect(ic).toContain(acik ? 'lucide-check' : 'lucide-lock');
    }
  });

  it('⭐ TIKLAMA BAĞLANTISI: her "Yetkileri düzenle" KENDİ satırının hedefini, "Yeniden gönder" kendi davetini iletir', () => {
    const hedefler: unknown[] = [];
    const yeniden: unknown[] = [];
    const agac = UyeListesi({
      uyeler: [EMRE, MEHMET, SELIN], bekleyenDavetler: [AYSE], sahipMi: true, benimId: 'u1', islemde: false,
      onDuzenle: (h) => hedefler.push(h), onYenidenGonder: (d) => yeniden.push(d),
    });
    const duzenle = dugmeler(agac, 'Yetkileri düzenle');
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
  it('iki anahtar, kanonik sırada (fiyat, DWG); açık/kapalı SEÇİMDEN — iki yön de', () => {
    const yalnizDwg = ciz(createElement(IzinSecici, { secili: ['dwg'], onDegis: () => {} }));
    expect(anahtarlar(yalnizDwg)).toEqual([false, true]);
    expect(anahtarlar(ciz(createElement(IzinSecici, { secili: ['fiyat'], onDegis: () => {} })))).toEqual([true, false]);
    const m = metin(yalnizDwg);
    expect(m.indexOf(FIYAT)).toBeGreaterThan(-1);
    expect(m.indexOf(FIYAT)).toBeLessThan(m.indexOf(DWG));
  });

  it('"Fiyat bilgisi" rozeti YALNIZ fiyat satırında; açıklamalar sözlükten', () => {
    const html = ciz(createElement(IzinSecici, { secili: [], onDegis: () => {} }));
    const m = metin(html);
    expect(say(m, 'Fiyat bilgisi')).toBe(1);
    // Rozet fiyat başlığıyla DWG başlığı ARASINDA (yani fiyat satırında).
    expect(m.indexOf('Fiyat bilgisi')).toBeGreaterThan(m.indexOf(FIYAT));
    expect(m.indexOf('Fiyat bilgisi')).toBeLessThan(m.indexOf(DWG));
    for (const t of IZIN_TANIMLARI) expect(m, t.anahtar).toContain(t.aciklama);
    expect(m).toContain('Excel keşif yükler, fiyat eşleştirir');
    expect(m).toContain('metrajı hazırlayıp kaydeder');
  });

  it('⭐ hiç yetki seçili değilse "En az bir yetki seçin" yazar; en az biri seçiliyse yazmaz', () => {
    const bos = ciz(createElement(IzinSecici, { secili: [], onDegis: () => {}, ipucuId: 'x-ipucu' }));
    expect(metin(bos)).toContain('En az bir yetki seçin');
    expect(bos).toMatch(/<p id="x-ipucu" aria-live="polite"[^>]*>.*En az bir yetki seçin<\/p>/);
    // Kırmızı "hata" değil, yönlendirme: role="alert" ile bağırmaz.
    expect(bos).not.toContain('role="alert"');
    for (const secili of [['dwg'], ['fiyat'], ['fiyat', 'dwg']] as UyeIzni[][]) {
      const html = ciz(createElement(IzinSecici, { secili, onDegis: () => {}, ipucuId: 'x-ipucu' }));
      expect(metin(html), secili.join(',')).not.toContain('En az bir yetki seçin');
      // Canlı bölge yine takılı (sonradan gelen ipucu duyurulsun).
      expect(html, secili.join(',')).toContain('<p id="x-ipucu" aria-live="polite"></p>');
    }
  });

  it('⭐ TIKLAMA BAĞLANTISI: anahtar, KENDİ iznini açıp kapatan yeni diziyi iletir (girdi değişmez)', () => {
    const cagrilar: UyeIzni[][] = [];
    const secili: UyeIzni[] = ['dwg'];
    const agac = IzinSecici({ secili, onDegis: (y) => cagrilar.push(y) });
    const anahtarOgeleri = agacOgeleri(agac, (e) => e.type === Anahtar);
    expect(anahtarOgeleri.map((a) => (a.props as { etiket: string }).etiket)).toEqual([FIYAT, DWG]);
    expect(anahtarOgeleri.map((a) => (a.props as { acik: boolean }).acik)).toEqual([false, true]);
    (anahtarOgeleri[0].props as { onDegis: (y: boolean) => void }).onDegis(true);
    (anahtarOgeleri[1].props as { onDegis: (y: boolean) => void }).onDegis(false);
    expect(cagrilar).toEqual([['fiyat', 'dwg'], []]);
    expect(secili).toEqual(['dwg']);
  });

  it('her anahtarın erişilebilir adı izin başlığı', () => {
    const html = ciz(createElement(IzinSecici, { secili: [], onDegis: () => {} }));
    for (const ad of [FIYAT, DWG]) {
      expect(html, ad).toContain(`aria-label="${ad}"`);
    }
  });
});

describe('Davet penceresi (ekran 2)', () => {
  const pencere = (islemde = false) =>
    ciz(
      createElement(DavetPenceresi, {
        ekip: { uyeler: [EMRE, MEHMET, SELIN], bekleyenDavetler: [] },
        hakMetni: '4 / 5',
        islemde,
        onGonder: async () => true,
        onKapat: () => {},
      }),
    );

  it('⭐ açılış seçimi BOŞ (en az yetki): iki anahtar da KAPALI, "Davet gönder" aria-disabled ve nedeni yazılı', () => {
    const html = pencere();
    expect(anahtarlar(html)).toEqual([false, false]);
    expect(metin(html)).toContain('En az bir yetki seçin');
    // Düğme `aria-disabled` + ipucunu adıyla anıyor; `disabled` YOK → odaklanabilir,
    // ekran okuyucu ipucunu okur (kod incelemesi 06.10).
    const dugme = html.match(/<button type="submit"[^>]*>/)?.[0] ?? '';
    expect(dugme).toMatch(/^<button type="submit"/);
    expect(dugme).not.toMatch(/\sdisabled=""/);
    expect(dugme).toContain('aria-disabled="true"');
    expect(dugme).toContain('aria-describedby="davet-izin-ipucu"');
    // Görünüm de pasif (aria-disabled varyantları).
    expect(dugme).toContain('aria-disabled:opacity-50');
    expect(dugme).toContain('aria-disabled:cursor-not-allowed');
    expect(html).toMatch(/<button type="submit"[^>]*>.*Davet gönder<\/button>/);
    expect(html).toContain('<p id="davet-izin-ipucu" aria-live="polite"');
  });

  it('istek sürerken "Davet gönder" GERÇEKTEN pasif (disabled); yetki nedeni ayrıca aria-disabled', () => {
    const dugme = pencere(true).match(/<button type="submit"[^>]*>/)?.[0] ?? '';
    expect(dugme).toContain('disabled=""');
    expect(dugme).toContain('aria-disabled="true"');
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

describe('Üye yetkileri paneli (ekran 3)', () => {
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
      'Üye yetkileri', 'mehmet.muhendis@firma.com', 'Aktif', 'Katılım: 12.09.2026',
      'İki adımlı giriş kapalı', 'Erişim', 'Kaydettiğin anda geçerli olur.',
      'Ekipten çıkar', 'Erişimi hemen kapanır. E-posta adresi ve kullanıcı hakkı boşa çıkar.',
      'Yönetici yap', 'Vazgeç', 'Kaydet',
    ]) {
      expect(m, t).toContain(t);
    }
    // Mehmet yalnız DWG: fiyat KAPALI, DWG AÇIK.
    expect(anahtarlar(html)).toEqual([false, true]);
    // Değişiklik yokken "Kaydet" PASİF (boşuna istek gitmesin).
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Kaydet<\/button>/);
    // En az bir yetki seçili: ipucu YOK, Kaydet ipucunu anmaz, aria-disabled YOK.
    expect(m).not.toContain('En az bir yetki seçin');
    expect(html).not.toContain('aria-describedby="panel-izin-ipucu"');
    expect(html).not.toContain('aria-disabled="true"');
    expect(m).not.toContain('Üye izinleri');
    // İlk çizimde soru YOK: "Ekipten çıkar" önce sorar.
    expect(m).not.toContain('Emin misin?');
  });

  it('⭐ yetkisi kalmamış üye (göçte boşalan liste): "En az bir yetki seçin", Kaydet pasif ve ipucunu anar', () => {
    const html = panel({ tur: 'uye', uye: { ...MEHMET, izinler: [] } });
    expect(anahtarlar(html)).toEqual([false, false]);
    expect(metin(html)).toContain('En az bir yetki seçin');
    // Değişiklik yok → disabled; yetki yok → AYRICA aria-disabled + ipucu.
    expect(html).toMatch(/<button type="button" disabled="" aria-disabled="true" aria-describedby="panel-izin-ipucu"[^>]*>Kaydet<\/button>/);
  });

  it('06.10 öncesi anahtar (eski sunucu yanıtı) seçim SAYILMAZ: anahtarlar kapalı, ipucu görünür', () => {
    const eski = ['excel', 'kutuphane'] as unknown as UyeIzni[];
    const html = panel({ tur: 'uye', uye: { ...MEHMET, izinler: eski } });
    expect(anahtarlar(html)).toEqual([false, false]);
    expect(metin(html)).toContain('En az bir yetki seçin');
  });

  it('⭐ bekleyen davet: "Daveti iptal et" ve yeniden gönderim UYARISI (eski bağlantı geçersiz olur)', () => {
    const m = metin(panel({ tur: 'davet', davet: AYSE }));
    expect(m).toContain('Davet bekliyor');
    expect(m).toContain('Son geçerlilik: 30.09.2026');
    expect(m).toContain('önceki davet bağlantısı geçersiz olur');
    expect(m).toContain('Daveti iptal et');
    expect(m).not.toContain('Ekipten çıkar');
    expect(m).not.toContain('Yönetici yap');
    // Ayşe'nin daveti yalnız fiyat.
    expect(anahtarlar(panel({ tur: 'davet', davet: AYSE }))).toEqual([true, false]);
  });

  it('yönetici: izin anahtarı YOK (sunucu SAHIP_TAM_YETKILI), "Üye yap", "Kapat"', () => {
    const html = panel({ tur: 'uye', uye: { ...EMRE, id: 'u9' } });
    const m = metin(html);
    expect(html).not.toContain('role="switch"');
    expect(m).toContain('Yönetici tüm bölümlere erişir; yetkileri kapatılamaz.');
    expect(m).toContain('Erişimi kayıtlı yetkilerine göre daralır; ekibi ve aboneliği yönetemez.');
    expect(m).toContain('Üye yap');
    expect(m).toContain('Kapat');
    expect(m).not.toContain('Kaydet');
    // Yöneticide yetki seçilmez: "en az bir yetki" ipucu da yok.
    expect(m).not.toContain('En az bir yetki seçin');
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
    expect(html).toContain('href="mailto:emre.basarann1@gmail.com?subject=DWG%E2%80%99den%20metraj%20eri%C5%9Fimi"');
    expect(metin(html)).toContain('Yöneticine yaz');
    // Excel kutusunun kartı FİYAT yetkisini ister (06.10: Excel keşif fiyat yetkisinde).
    const excel = ciz(createElement(KilitliOzellikKarti, { baslik: 'Excel Keşif', izin: 'fiyat', yonetici: 'a@b.co' }));
    expect(excel).toContain('href="mailto:a@b.co?subject=Fiyatland%C4%B1rma%20ve%20teklifler%20eri%C5%9Fimi"');
  });

  it('adres bilinmiyorsa bağlantı ÇİZİLMEZ (boş mailto yok)', () => {
    for (const y of [null, undefined]) {
      const html = ciz(createElement(KilitliOzellikKarti, { baslik: 'Excel Keşif', izin: 'fiyat', yonetici: y }));
      expect(html).not.toContain('mailto:');
    }
  });
});
