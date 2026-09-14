import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * FAZ 6.1 + 6.3 — EKRAN METNİ KAPISI (13.09.2026, 14.09'da AST'ye taşındı)
 *
 * Bileşeni RENDER ETMEZ; kaynağı TypeScript ayrıştırıcısıyla okur. Ölçülen
 * soru "ekranda ne yazılı" ve iki kabul ölçütü tam olarak bu:
 *   · fiyat sayfası veritabanından okuyor, rakam SABİT YAZILMAMIŞ
 *   · anasayfada dört yanlış vaat YOK, doğru dokuz vaade DOKUNULMAMIŞ
 *
 * ⚠ NEDEN AST, NEDEN REGEX DEĞİL (14.09 kod incelemesi):
 *   1. Regex ile yorum silmek `accept="image/*"` gibi bir dizgeyi yorum
 *      başlangıcı sanıp gerisini yutar → negatif kontroller sessizce yeşil.
 *   2. Pozitif kontroller ham kaynağı okursa, JSX'ten silinip YORUMDA kalan
 *      metin "yerinde" sayılır. Bu diff eski metinleri yorumlarda alıntılıyor.
 *   3. Rakam kara listesi bugünkü değerleri yakalar; yarın yazılan `1.399`'u
 *      kaçırır. Kontrol biçime bakar, değere değil.
 * Ayrıştırıcıda yorum bir düğüm değildir; ekran metni = dizge + şablon + JSX
 * metni düğümleri. Yorumsuz kod = yorumları atarak yeniden basılmış dosya.
 *
 * ⚠ Göreli yol: vitest.config.ts'te '@/' alias'ı yok.
 */
const kok = join(__dirname, '..', '..');

function ayristir(yol: string): ts.SourceFile {
  const kaynak = readFileSync(join(kok, yol), 'utf-8');
  const tur = yol.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(yol, kaynak, ts.ScriptTarget.Latest, true, tur);
}

/** Ekrana gidebilecek bütün metin düğümleri (import yolları hariç), boşluğu teklenmiş. */
function ekranParcalari(sf: ts.SourceFile): string[] {
  const parcalar: string[] = [];
  const gez = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n)) {
      parcalar.push(n.text);
    } else if (ts.isTemplateExpression(n)) {
      parcalar.push(n.head.text, ...n.templateSpans.map((s) => s.literal.text));
    }
    n.forEachChild(gez);
  };
  gez(sf);
  return parcalar.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const ekranMetni = (sf: ts.SourceFile) => ekranParcalari(sf).join(' ');
const yorumsuzKod = (sf: ts.SourceFile) => ts.createPrinter({ removeComments: true }).printFile(sf);

function sayisalSabitler(sf: ts.SourceFile): number[] {
  const out: number[] = [];
  const gez = (n: ts.Node): void => {
    if (ts.isNumericLiteral(n)) out.push(Number(n.text));
    n.forEachChild(gez);
  };
  gez(sf);
  return out;
}

const SAYFA = ayristir('app/fiyatlar/page.tsx');
const KARTLAR = ayristir('ozellik/odeme/FiyatKartlari.tsx');
const ANASAYFA = ayristir('app/page.tsx');
const NASIL = ayristir('ortak/kabuk/components/landing/NasilCalisir.tsx');

describe('Ölçütün kendisi — ayrıştırıcı yorumu ekran metni saymıyor', () => {
  const ornek = ts.createSourceFile(
    'o.tsx',
    `// YORUM: kredi kartı yok\n/* 1.299 TL */\nexport const A = () => <p accept="image/*">Görünen metin</p>;`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  it('yorumdaki metin ekran metnine girmez', () => {
    expect(ekranMetni(ornek)).not.toContain('kredi kartı');
    expect(ekranMetni(ornek)).not.toContain('1.299');
  });
  it('"image/*" dizgesi sonrasındaki JSX metni yutulmaz', () => {
    expect(ekranMetni(ornek)).toContain('Görünen metin');
  });
});

describe('Fiyat sayfası — rakamlar veritabanından (Faz 6.1)', () => {
  it('kartlar fiyatı GET /fiyatlar ucundan okuyor', () => {
    expect(yorumsuzKod(KARTLAR)).toMatch(/api\s*\.get<[^>]*>\(\s*['"]\/fiyatlar['"]\s*\)/);
  });

  it.each([
    ['sayfa', SAYFA],
    ['kartlar', KARTLAR],
  ])('%s: ekranda biçimli binlik sayı yok (1.299 · 3.000 gibi)', (_ad, sf) => {
    expect(ekranMetni(sf)).not.toMatch(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b/);
  });

  it.each([
    ['sayfa', SAYFA],
    ['kartlar', KARTLAR],
  ])('%s: ekranda 4+ haneli çıplak sayı yok (1299 · 4500 gibi)', (_ad, sf) => {
    expect(ekranMetni(sf)).not.toMatch(/\b\d{4,}\b/);
  });

  it.each([
    ['sayfa', SAYFA],
    ['kartlar', KARTLAR],
  ])('%s: para simgesine bitişik rakam yok ($22 · 22 USD · ₺1299 · 1299 TL)', (_ad, sf) => {
    expect(ekranMetni(sf)).not.toMatch(/(?:[$₺€]|USD|TL|TRY)\s?\d|\d\s?(?:[$₺€]|USD\b|TL\b|TRY\b)/);
  });

  it.each([
    ['sayfa', SAYFA],
    ['kartlar', KARTLAR],
  ])('%s: koda gömülü 100 ve üstü sayısal sabit yok (render edilen değişken yolu)', (_ad, sf) => {
    expect(sayisalSabitler(sf).filter((n) => n >= 100)).toEqual([]);
  });

  it('suite sayfada ilan edilmiyor', () => {
    expect(ekranMetni(SAYFA)).not.toMatch(/suite/i);
    expect(ekranMetni(KARTLAR)).not.toMatch(/suite/i);
  });

  it('"satır" tanımı tek cümleyle ekranda (karar: tanım a)', () => {
    expect(ekranMetni(SAYFA)).toContain(
      'Satır = çevrilecek metin içeren satır. Şartname ve açıklama satırları dâhildir.',
    );
  });

  it('tekrar çevirinin kotadan düştüğü ekranda açıkça yazılı', () => {
    expect(ekranMetni(SAYFA)).toContain('Aynı dosyayı tekrar çevirmek kotadan yeniden düşer.');
  });

  it('tekrar koruması SÜRESİYLE ve BİTİŞTEN ölçüldüğüyle yazılı (çelişki değil istisna)', () => {
    expect(ekranMetni(SAYFA)).toMatch(/tamamlandıktan sonraki \d+ dakika içinde aynı içerik için gelen tekrar istek/);
  });

  it('hata alan çevirinin düşmediği, kısmide yalnız çevrilen satırın düştüğü yazılı', () => {
    const metin = ekranMetni(SAYFA);
    expect(metin).toContain('Hata alan çeviri kotadan düşmez.');
    expect(metin).toContain('Kısmen tamamlanan çeviride yalnız çevrilen satırlar düşer');
  });

  it('kota başlığı kartta sunucudan gelen kotadan üretiliyor (kotaMetni)', () => {
    expect(yorumsuzKod(KARTLAR)).toContain('kotaMetni(p.ceviriKotasi, p.surum)');
  });

  it('fiyatın dönem eki sabit "/ ay" değil, sürümden (donemEki)', () => {
    expect(yorumsuzKod(KARTLAR)).toContain('donemEki(p.surum)');
    expect(ekranParcalari(KARTLAR)).not.toContain('/ ay');
  });

  it('fiyat sayfasına anasayfadan yol var (bağlantısız sayfa bulunamaz)', () => {
    expect(yorumsuzKod(ANASAYFA)).toMatch(/href=["']\/fiyatlar["']/);
  });
});

describe('Anasayfa vaatleri — yanlış dördü gitti, doğru dokuzu yerinde (Faz 6.3)', () => {
  const EKRAN = ekranMetni(ANASAYFA) + ' ' + ekranMetni(NASIL);

  it.each([
    ['kredi kartı yok', /kredi kartı yok/i],
    ['ücretsiz hesapta … çalışır', /Ücretsiz hesapta/i],
    ['ücretsiz hesabınızı oluşturun', /ücretsiz hesabınızı/i],
    ['işçilik birim fiyatını her pakette elle', /her pakette elle/i],
  ])('yanlış vaat ekranda YOK: %s', (_ad, desen) => {
    expect(EKRAN).not.toMatch(desen);
  });

  it('DWG adımı Pro olduğunu söylüyor (not + dört sekmede rozet)', () => {
    const dwgAdimi = yorumsuzKod(NASIL).split('const DWG_ADIM')[1]?.split('const YOL_METIN')[0] ?? '';
    expect(dwgAdimi).toContain('DWG ve DXF projelerinden metraj Pro pakete dâhildir.');
    expect((dwgAdimi.match(/pro: true/g) ?? []).length).toBe(4);
  });

  it('DWG yol seçicisi Pro olduğunu söylüyor', () => {
    expect(ekranMetni(NASIL)).toContain('metrajı sistem çıkarsın. Pro pakete dâhildir.');
  });

  it('hero ve DWG özellik kartında Pro rozeti var', () => {
    expect((yorumsuzKod(ANASAYFA).match(/<ProRozeti \/>/g) ?? []).length).toBe(2);
  });

  it('Pro rozeti ekran okuyucuya bitişik okunmuyor', () => {
    expect(ekranMetni(ANASAYFA)).toContain('(Pro pakette)');
    expect(yorumsuzKod(ANASAYFA)).toMatch(/aria-hidden=["']true["']/);
  });

  it('"4 format" şeridi DWG/DXF\'in Pro olduğunu söylüyor', () => {
    expect(ekranMetni(ANASAYFA)).toContain('.xlsx · .xls · .dwg · .dxf (DWG/DXF Pro pakette)');
  });

  it('maket DWG kutusunu CORE rozetli kullanıcıya göstermiyor', () => {
    const parcalar = ekranParcalari(ANASAYFA);
    expect(parcalar).toContain('DWG Proje');
    expect(parcalar).not.toContain('CORE');
    expect(parcalar).toContain('PRO');
  });

  // Ölçüm turunda DOĞRU çıkan vaatler — ekranda birebir kalmalı.
  it.each([
    'Çok sayfalı metraj cetvellerini tek seferde okur, gizli sayfaları atlar,',
    'Malzeme adlarından çap, yüzey ve cins etiketlerini',
    'birden çok aday çıkarsa yazılım tahmin etmez, size sorar',
    'İşçilik firmaları ve işçilik birim fiyatları Pro pakete dâhildir.',
    'Malzeme ve işçilik için ayrı kâr oranı.',
    'hazır KAPAK ve İCMAL sayfalarıyla gelir',
    'Malzeme adları çevrilir; çap, ölçü ve sayısal değerlere dokunulmaz.',
    'TL, USD ve EUR arasında tek tıkla geçiş. TCMB kuru teklife tarih damgasıyla işlenir.',
    'Kapak–icmal teklif formatı için keşfin Excel dosyasının teklifte kayıtlı olması gerekir.',
  ])('doğru vaat ekranda yerinde: %s', (metin) => {
    expect(EKRAN).toContain(metin);
  });
});
