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
const ABONELIK = ayristir('app/(protected)/abonelik/page.tsx');

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

  // 17.09 (Emre kararı): 16.09'da elektrik paketleri satıştan çekilecek diye
  // giriş cümlesi mekaniğe daraltılmıştı; karar tersine döndü, üç elektrik
  // paketi satın alınabiliyor. Sayfa SATILAN paketleri anlatmalı — aksi hâlde
  // müşteri aldığı şeyi sayfada bulamaz. `ekranMetni` yorumu saymaz: cümle
  // JSX'ten silinip yoruma taşınırsa bu kapı KIRMIZI olur.
  it('★ paketlerin disipline göre satıldığı ekranda yazılı (elektrik dahil)', () => {
    expect(ekranMetni(SAYFA)).toContain('Paketler disipline (mekanik, elektrik ya da ikisi) ve kapsama');
    expect(ekranMetni(SAYFA)).not.toMatch(/elektrik[^.]*satışta değil/i);
  });

  it('"satır" tanımı tek cümleyle ekranda (karar: tanım a)', () => {
    expect(ekranMetni(SAYFA)).toContain(
      'Satır = çevrilecek metin içeren satır. Şartname ve açıklama satırları dâhildir.',
    );
  });

  // Faz 6.11 + REVİZE K-T7 (15.09): ödenmiş içeriğe bakmak/indirmek düşmez,
  // çeviri hepsi ya da hiçbiri. Sunucuda pencere ve kısmi çeviri kalktı.
  it('ödenmiş içeriğe yeniden bakmanın ve İngilizce indirmenin kotadan düşmediği yazılı (madde 4)', () => {
    expect(ekranMetni(SAYFA)).toContain(
      'Çevrilmiş ve malzeme/iş adları değişmemiş bir teklife yeniden İngilizce bakmak ya da onu İngilizce indirmek kotadan düşmez.',
    );
  });

  it('yeni çeviri sayılan değişikliklerde de yalnız YENİ satırın düştüğü yazılı (madde 5)', () => {
    const metin = ekranMetni(SAYFA);
    expect(metin).toContain('kotadan yine yalnız daha önce hiç çevrilmemiş satırlar düşer');
    expect(metin).toContain('Değişmeyen satırlar ikinci kez düşmez.');
  });

  // ★ PARA HARCANANA HAK DÜŞER (Emre 16.09) — 13.09'un "her çeviri tam düşer"
  // kuralı sunucuda kalktı; sayfa kalırsa sessizce yalan söyler.
  it('★ kotadan yalnız daha önce çevrilmemiş satırların düştüğü yazılı', () => {
    const metin = ekranMetni(SAYFA);
    expect(metin).toContain('Kotadan yalnız daha önce hiç çevrilmemiş satırlar düşer.');
    expect(metin).toContain('çeviriye başlamadan önce ekranda kaç satırın yeni olduğu yazar');
  });

  // ★ ORTAK HAVUZ İLAN EDİLİR (Emre 16.09, ikinci karar). "Sistemin karşılığını
  // zaten bildiği" ifadesi havuzun firmalar arası ORTAK olduğunu söylemiyordu:
  // kullanıcı kotasının neden düşmediğini bilmeli. Havuzun KAPSAMI ve firma
  // sözlüğünün yalnız o firmada geçerli olduğu da aynı bölümde yazar.
  it('★ ortak havuzun bütün kullanıcılar arasında ortak olduğu AÇIKÇA yazılı', () => {
    const metin = ekranMetni(SAYFA);
    expect(metin).toContain('Çeviri havuzu bütün MetaPriceX kullanıcıları arasında ortaktır');
    expect(metin).toContain('sizin ya da başka bir kullanıcının daha önce çevirdiği bir malzeme/iş adı kotanızdan düşmez');
    // Havuzun kapsamı: yalnız çevrilen metin — fiyat/müşteri verisi değil.
    expect(metin).toContain('Fiyatlarınız, tutarlarınız, müşteri ve firma bilgileriniz çeviriye hiç gitmez.');
  });

  it('★ firma sözlüğündeki düzeltmenin YALNIZ o firmada geçerli olduğu yazılı', () => {
    expect(ekranMetni(SAYFA)).toContain(
      'bu düzeltme yalnız sizin firmanızın tekliflerinde geçerlidir, ortak havuzu ve başka firmaların çevirisini değiştirmez',
    );
  });

  // Eski ifade: havuzun ortak olduğunu SAKLIYORDU. Geri gelirse sayfa yine
  // eksik anlatır — yasak listesinde tutulur.
  it('eski "sistemin karşılığını zaten bildiği" ifadesi YOK (havuz saklanmaz)', () => {
    expect(ekranMetni(SAYFA)).not.toContain('Sistemin karşılığını zaten bildiği bir malzeme/iş adı kotanızdan düşmez.');
  });

  it('İngilizce dosya için güncel hâlin çevrilmiş olması gerektiği yazılı (madde 6)', () => {
    expect(ekranMetni(SAYFA)).toContain(
      'İngilizce dosya için teklifin güncel hâli çevrilmiş olmalıdır; Türkçe dosya her zaman kotadan düşmeden iner.',
    );
  });

  it('çevirinin hepsi ya da hiçbiri olduğu yazılı (madde 7)', () => {
    expect(ekranMetni(SAYFA)).toContain(
      'Çeviri ya tamamlanır ya hiç yapılmaz: tek bir satır bile çevrilemezse size hiçbir çeviri verilmez ve teklif Türkçe kalır, çevrilemeyen satırlar gösterilir.',
    );
  });

  // ★ HARCANAN SATIR DÜŞER (Emre 16.09 ek kararı). Sunucu tamamlanamayan
  // çeviride de karşılık alınan satırı düşürüyor; sayfanın eski "kotadan
  // hiçbir şey düşmez" cümlesi kalsaydı sessizce yalan söylerdi.
  it('★ tamamlanamayan çeviride karşılık alınanın düştüğü, alınamayanın düşmediği yazılı', () => {
    const metin = ekranMetni(SAYFA);
    expect(metin).toContain('kotadan yalnız çeviri servisine gönderilip karşılık alınan satırlar düşer');
    expect(metin).toContain('karşılık alınamayan satırlar düşmez');
    expect(metin).toContain('Düşen satırlar ekranda yazar');
    // Eski cümle geri gelirse sayfa sunucuyla çelişir.
    expect(metin).not.toContain('sistem tek bir satırı bile çeviremezse kotadan hiçbir şey düşmez');
    expect(metin).not.toContain('tekrar denemek ücretsizdir');
  });

  it('kota reddinin YENİ satır üzerinden, baştan ve tavanıyla yapıldığı yazılı (madde 8)', () => {
    expect(ekranMetni(SAYFA)).toContain('Kotanız teklifin YENİ satırlarına yetmiyorsa çeviri başlamadan reddedilir ve hangi tavanın dolduğu söylenir; kısmi çeviri yapılmaz.');
  });

  it('eski pencere ve kısmi çeviri cümleleri YOK', () => {
    const metin = ekranMetni(SAYFA);
    expect(metin).not.toContain('Aynı dosyayı tekrar çevirmek kotadan yeniden düşer.');
    expect(metin).not.toContain('Aynı dosyanın yeniden çevrilmesi kotadan yeniden düşer.');
    expect(metin).not.toContain('Tek istisna');
    expect(metin).not.toContain('Kısmen tamamlanan');
    expect(metin).not.toMatch(/dakika/);
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

/**
 * KART HİZASI — yapısal kilit (Faz 6.1 kapanış, 15.09.2026).
 *
 * Kusur: iki rozet `flex-wrap` ile yan yanaydı; dar kartta ikincisi alta iniyor,
 * o kartın fiyatı, kota kutusu ve listesi komşularından aşağıda başlıyordu.
 * Çözüm iki parça, ikisi de ölçülür:
 *   1. etiketler AYRI span, ortak kap `flex-col` (her kartta alt alta)
 *   2. kart dış ızgaranın satırlarını paylaşır (`grid-rows-subgrid` +
 *      `row-span-N`); N = kartın satır sayısı ve hiçbir satır koşulla DÜŞMEZ
 *      (`{a && <x/>}` düşerse sonraki satırlar bir üst satıra kayar).
 * ⚠ SINIR: seçilen yapıyı kilitler, pikselleri ölçmez — hiza tarayıcıda
 * gözle doğrulanmalıdır.
 */
type JsxOge = ts.JsxElement | ts.JsxSelfClosingElement;

function ogeler(kok: ts.Node, kosul: (o: JsxOge) => boolean): JsxOge[] {
  const out: JsxOge[] = [];
  const gez = (n: ts.Node): void => {
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && kosul(n)) out.push(n);
    n.forEachChild(gez);
  };
  gez(kok);
  return out;
}
const acilis = (o: JsxOge) => (ts.isJsxElement(o) ? o.openingElement : o);
const etiketAdi = (o: JsxOge) => acilis(o).tagName.getText();
const oznitelik = (o: JsxOge, ad: string) =>
  acilis(o).attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === ad);
function siniflar(o: JsxOge): string[] {
  const i = oznitelik(o, 'className')?.initializer;
  return i && ts.isStringLiteral(i) ? i.text.split(/\s+/).filter(Boolean) : [];
}
const parantezsiz = (e: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(e) ? parantezsiz(e.expression) : e);
const jsxMi = (e: ts.Expression) => {
  const i = parantezsiz(e);
  return ts.isJsxElement(i) || ts.isJsxSelfClosingElement(i) || ts.isJsxFragment(i);
};
/** Izgara satırı olan doğrudan çocuklar: boşluk metni ve JSX yorumu satır değildir. */
function satirCocuklari(o: JsxOge): ts.JsxChild[] {
  if (!ts.isJsxElement(o)) return [];
  return o.children.filter(
    (c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces) && !(ts.isJsxExpression(c) && !c.expression),
  );
}
/** `{a && <x/>}` satırı koşulla düşürür; düz öğe ve iki kolu da JSX olan `?:` düşürmez. */
function satirDusebilir(c: ts.JsxChild): boolean {
  if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) return false;
  if (!ts.isJsxExpression(c) || !c.expression) return true;
  const e = parantezsiz(c.expression);
  return !(ts.isConditionalExpression(e) && jsxMi(e.whenTrue) && jsxMi(e.whenFalse));
}
function kartHizasi(kart: JsxOge) {
  const s = siniflar(kart);
  const span = s.map((t) => /^row-span-(\d+)$/.exec(t)).find(Boolean);
  const cocuklar = satirCocuklari(kart);
  return {
    subgrid: s.includes('grid') && s.includes('grid-rows-subgrid'),
    rowSpan: span ? Number(span[1]) : null,
    satir: cocuklar.length,
    dusebilen: cocuklar.filter(satirDusebilir).length,
  };
}
/** Etiketi basan span (`{KAPSAM_ETIKET[...]}` çocuğu olan). */
const etiketSpanlari = (sf: ts.SourceFile, sabit: string) =>
  ogeler(
    sf,
    (o) =>
      etiketAdi(o) === 'span' &&
      ts.isJsxElement(o) &&
      o.children.some((c) => ts.isJsxExpression(c) && !!c.expression && c.expression.getText().startsWith(`${sabit}[`)),
  );
const ebeveynOge = (n: ts.Node): ts.JsxElement | undefined => {
  let p = n.parent;
  while (p && !ts.isJsxElement(p)) p = p.parent;
  return p;
};

const KART_BUL: [string, ts.SourceFile, (o: JsxOge) => boolean][] = [
  ['fiyat sayfası kartı', KARTLAR, (o) => etiketAdi(o) === 'article'],
  ['abonelik kartı', ABONELIK, (o) => oznitelik(o, 'key')?.initializer?.getText() === '{p.paketId}'],
];

describe('Kart hizası — ölçütün kendisi', () => {
  const kart = (kod: string) =>
    ogeler(ts.createSourceFile('o.tsx', kod, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), (o) => etiketAdi(o) === 'article')[0];

  it('koşulla düşen satırı sayar, JSX yorumunu satır saymaz', () => {
    const k = kart('const A = () => <article className="row-span-3 grid grid-rows-subgrid"><h2 />{/* not */}{a && <p />}<a /></article>;');
    expect(kartHizasi(k)).toEqual({ subgrid: true, rowSpan: 3, satir: 3, dusebilen: 1 });
  });

  it('iki kolu da JSX olan üçlü ifade satır düşürmez; subgrid yoksa söyler', () => {
    const k = kart('const A = () => <article className="row-span-2 grid"><h2 />{a ? (<p />) : <div />}</article>;');
    expect(kartHizasi(k)).toEqual({ subgrid: false, rowSpan: 2, satir: 2, dusebilen: 0 });
  });
});

describe('Kart hizası — fiyat sayfası ve abonelik kartları (Faz 6.1 kapanış)', () => {
  it.each(KART_BUL)('%s: satırlar dış ızgarayla ortak, row-span = satır sayısı, koşulla düşen satır yok', (_ad, sf, bul) => {
    const kartlar = ogeler(sf, bul);
    expect(kartlar).toHaveLength(1); // FIXTURE KANITI: doğru öğe bulundu
    const h = kartHizasi(kartlar[0]);
    expect(h.subgrid).toBe(true);
    expect(h.satir).toBeGreaterThanOrEqual(5);
    expect(h.rowSpan).toBe(h.satir);
    expect(h.dusebilen).toBe(0);
    const dis = ebeveynOge(kartlar[0]);
    expect(dis && siniflar(dis)).toContain('grid'); // subgrid yalnız ızgaranın içinde çalışır
  });

  it.each([
    ['fiyat sayfası', KARTLAR],
    ['abonelik', ABONELIK],
  ])('%s: iki etiket AYRI span, ortak kap flex-col (flex-wrap yok)', (_ad, sf) => {
    const [kapsam] = etiketSpanlari(sf, 'KAPSAM_ETIKET');
    const [seviye] = etiketSpanlari(sf, 'SEVIYE_ETIKET');
    expect(kapsam).toBeDefined();
    expect(seviye).toBeDefined();
    expect(kapsam).not.toBe(seviye);
    const kap = ebeveynOge(kapsam);
    expect(kap).toBeDefined();
    expect(ebeveynOge(seviye)).toBe(kap);
    const s = siniflar(kap!);
    expect(s).toContain('flex-col');
    expect(s).not.toContain('flex-wrap');
    expect(s).not.toContain('flex-row');
  });

  it('abonelik kartında dönem eki sabit "/ ay" değil, sürümden (fiyat kartıyla aynı)', () => {
    expect(yorumsuzKod(ABONELIK)).toContain('donemEki(p.surum)');
    expect(ekranParcalari(ABONELIK)).not.toContain('/ ay');
  });
});
