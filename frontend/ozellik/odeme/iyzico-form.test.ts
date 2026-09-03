import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KAP_KIMLIGI,
  betigiElemanaCevir,
  betikleriAyikla,
  iyzicoFormunuBas,
  kabiEkle,
  kapIceriyorMu,
} from './iyzico-form';

/**
 * iyzico barindirilan formu — 02.09'da "Odeme" ekrani BOMBOS geldi.
 *
 * Sayfa formu `dangerouslySetInnerHTML` ile basiyordu; HTML spesifikasyonu
 * geregi `innerHTML` ile eklenen `<script>` ASLA YURUTULMEZ. iyzico'nun
 * icerigi ise neredeyse tamamen betiktir — formu o cizer.
 *
 * ⚠ Projede jsdom YOK (vitest ortami `node`) ama bu DOM katmaninin
 * olculemedigi ANLAMINA GELMEZ — ilk yazimda oyle sandim ve o blok
 * kaynak-metin aramasi yapiyordu; mutasyon HAYATTA KALDI, cunku aradigi
 * metin dosyanin YORUMUNDA da geciyordu. Fonksiyonlar zaten `Document`
 * ve `HTMLElement` aliyor: sahte nesne yeterli, davranis olculebiliyor.
 */

// iyzico'nun gercek `checkoutFormContent` sekli (kisaltilmis).
const IYZICO_ICERIK = `
<div id="iyzipay-checkout-form" class="responsive"></div>
<script type="text/javascript">
//<![CDATA[
var iyziInit = {token: "abc123"};
//]]>
</script>
`;

// Kap TASIMAYAN varyant — `kabiEkle`nin EKLEME dalini surmek icin.
const KAPSIZ_ICERIK = `
<script type="text/javascript">var iyziInit = {token: "abc123"};</script>
`;

describe('betikleriAyikla', () => {
  it('OLCUT: fixture GERCEKTEN betik iceriyor', () => {
    // Bu assert olmadan asagidaki bloklar bos girdiyle TESADUFEN yesil kalir.
    expect(IYZICO_ICERIK).toContain('<script');
  });

  it('⭐ betigi govdeden AYIRIR', () => {
    const { govde, betikler } = betikleriAyikla(IYZICO_ICERIK);
    expect(betikler).toHaveLength(1);
    expect(govde).not.toContain('<script');
    expect(govde).toContain('iyzipay-checkout-form');
  });

  it('⭐ betigin GOVDESI korunur (kod kaybolmaz)', () => {
    const { betikler } = betikleriAyikla(IYZICO_ICERIK);
    expect(betikler[0].icerik).toContain('iyziInit');
    expect(betikler[0].icerik).toContain('abc123');
  });

  it('type niteligi okunur', () => {
    const { betikler } = betikleriAyikla(IYZICO_ICERIK);
    expect(betikler[0].tur).toBe('text/javascript');
  });

  it('harici betikte src okunur', () => {
    const { betikler } = betikleriAyikla(
      '<script src="https://ornek.test/a.js"></script>',
    );
    expect(betikler[0].src).toBe('https://ornek.test/a.js');
  });

  it('⭐ BIRDEN COK betikte SIRA korunur (iyzico icin onemli)', () => {
    const { betikler } = betikleriAyikla(
      '<script>bir()</script><div>x</div><script>iki()</script>',
    );
    expect(betikler.map((b) => b.icerik)).toEqual(['bir()', 'iki()']);
  });

  it('betiksiz icerikte govde AYNEN kalir', () => {
    const html = '<div>merhaba</div>';
    const { govde, betikler } = betikleriAyikla(html);
    expect(govde).toBe(html);
    expect(betikler).toEqual([]);
  });

  it('bos girdide patlamaz', () => {
    expect(betikleriAyikla('')).toEqual({ govde: '', betikler: [] });
  });
});

describe('⭐ SAYFA BAGLANTISI — dangerouslySetInnerHTML KULLANILMIYOR', () => {
  const sayfa = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'abonelik', 'page.tsx'),
    'utf8',
  );

  it('OLCUT: sayfa okunabildi ve odeme formunu ciziyor', () => {
    expect(sayfa.length).toBeGreaterThan(0);
    expect(sayfa).toContain('formHtml');
  });

  it('⭐ formHtml `dangerouslySetInnerHTML` ile BASILMIYOR', () => {
    // Regresyonun ta kendisi: bu KULLANIM geri gelirse ekran yine bos kalir.
    //
    // ⚠ Sadece kelimeyi aramak YETMEZ: ayni kelime dosyanin YORUMUNDA da
    // geciyor (neden kullanilmadigini anlatan not) ve assert tesadufen
    // kirmizi olurdu. JSX NITELIK bicimi aranir — o yalnizca gercek
    // kullanimda bulunur.
    expect(sayfa).not.toContain('dangerouslySetInnerHTML={');
  });

  it('⭐ betikleri calistiran bilesen kullaniliyor', () => {
    expect(sayfa).toContain('<IyzicoFormu html={formHtml} />');
  });
});

/**
 * ⚠ BU BLOK ONCE KAYNAK METNI ARIYORDU ve MUTASYON HAYATTA KALDI:
 * `expect(modul).toContain("createElement('script')")` asserti dosyanin
 * YORUMUNDAKI ayni metni yakaliyordu, dolayisiyla KOD `createElement('div')`
 * yapilinca bile yesil kaliyordu.
 *
 * jsdom yok diye davranis olculemez SANMISTIM — yanlis: fonksiyonlar zaten
 * `Document` ve `HTMLElement` aliyor, sahte nesne yeterli. Asagisi gercek
 * DAVRANISI olcer.
 */
describe('⭐ BILESEN gercekten script ELEMANI uretiyor (davranis)', () => {
  function sahteBelge() {
    const uretilen: any[] = [];
    const belge = {
      createElement: (etiket: string) => {
        const el: any = { etiket, async: true, text: '', type: '', src: '' };
        uretilen.push(el);
        return el;
      },
    } as unknown as Document;
    return { belge, uretilen };
  }

  function sahteKap(belge: Document) {
    const eklenen: any[] = [];
    return {
      eklenen,
      kap: {
        innerHTML: '',
        ownerDocument: belge,
        appendChild: (c: any) => eklenen.push(c),
      } as unknown as HTMLElement,
    };
  }

  it('⭐ uretilen eleman GERCEKTEN script (div/başka sey DEGIL)', () => {
    const { belge, uretilen } = sahteBelge();
    betigiElemanaCevir({ icerik: 'x()' }, belge);
    expect(uretilen).toHaveLength(1);
    expect(uretilen[0].etiket).toBe('script');
  });

  it('satir-ici betigin KODU elemana tasinir', () => {
    const { belge } = sahteBelge();
    const el: any = betigiElemanaCevir({ icerik: 'iyziInit()' }, belge);
    expect(el.text).toBe('iyziInit()');
  });

  it('harici betikte src konur, govde KONMAZ', () => {
    const { belge } = sahteBelge();
    const el: any = betigiElemanaCevir({ src: 'https://a.test/x.js', icerik: '' }, belge);
    expect(el.src).toBe('https://a.test/x.js');
    expect(el.text).toBe('');
  });

  it('⭐ betikler siraya baglidir — async KAPALI', () => {
    const { belge } = sahteBelge();
    const el: any = betigiElemanaCevir({ icerik: 'x()' }, belge);
    expect(el.async).toBe(false);
  });

  it('⭐ iyzicoFormunuBas: govde BETIKSIZ basilir, betikler AYRICA eklenir', () => {
    const { belge } = sahteBelge();
    const { kap, eklenen } = sahteKap(belge);
    iyzicoFormunuBas(kap, IYZICO_ICERIK);

    // Govde betik ICERMEMELI — icerseydi o betik zaten calismazdi.
    expect((kap as any).innerHTML).not.toContain('<script');
    expect((kap as any).innerHTML).toContain('iyzipay-checkout-form');
    // Betik AYRI eleman olarak eklenmis olmali.
    expect(eklenen).toHaveLength(1);
    expect(eklenen[0].etiket).toBe('script');
    expect(eklenen[0].text).toContain('iyziInit');
  });

  it('betiksiz icerikte hicbir SCRIPT eklenmez (govde korunur)', () => {
    const { belge } = sahteBelge();
    const { kap, eklenen } = sahteKap(belge);
    iyzicoFormunuBas(kap, '<div>x</div>');
    // ⚠ SOZLESME DEGISTI (03.09): artik cizim kabi da basiliyor, bu yuzden
    // innerHTML govdenin AYNISI degil — govdeyi ICERIR. Betik yine sifir.
    expect((kap as any).innerHTML).toContain('<div>x</div>');
    expect((kap as any).innerHTML).toContain(KAP_KIMLIGI);
    expect(eklenen).toHaveLength(0);
  });

  it('⭐ cizim kabi DOM.a gercekten basiliyor (form gomulu cizilsin)', () => {
    const { belge } = sahteBelge();
    const { kap } = sahteKap(belge);
    iyzicoFormunuBas(kap, IYZICO_ICERIK);
    expect(kapIceriyorMu((kap as any).innerHTML)).toBe(true);
  });
});

describe('⭐ CIZIM KABI — dar modal yerine sayfaya gomulme', () => {
  // ⚠ DURUSTLUK NOTU: iyzico'nun GERCEKTE kabi dondurup dondurmedigini
  // OLCMEDIK. Yukaridaki `IYZICO_ICERIK` fixture'i bir VARSAYIMDIR ve kabi
  // ICERIR. Canlida form yine de dar bir POPUP olarak cizildi — yani ya
  // gercek icerik kabi tasimiyor, ya da kip baska bir seyle belirleniyor.
  // `kabiEkle` IKI IHTIMALDE DE guvenli oldugu icin eklendi; hangisinin
  // dogru oldugu sunucu gunlugundeki teshis satiriyla belirlenecek
  // (`satinalma.servisi.ts` — 'iyzico form kipi').
  it('OLCUT: iki fixture da AYRI dali surer (kosul anlamli)', () => {
    // Kapli fixture: EKLEME dali kosMAZ. Kapsiz fixture: kosAR.
    expect(kapIceriyorMu(betikleriAyikla(IYZICO_ICERIK).govde)).toBe(true);
    expect(kapIceriyorMu(betikleriAyikla(KAPSIZ_ICERIK).govde)).toBe(false);
  });

  it('⭐ kapsiz icerikte kap EKLENIR (popup yerine gomulu cizim)', () => {
    const g = betikleriAyikla(KAPSIZ_ICERIK).govde;
    expect(kapIceriyorMu(kabiEkle(g))).toBe(true);
  });

  it('⭐ kap YOKSA eklenir ve responsive kip secilir', () => {
    const sonuc = kabiEkle('<p>form</p>');
    expect(kapIceriyorMu(sonuc)).toBe(true);
    expect(sonuc).toContain('class="responsive"');
  });

  it('kap eklenirken govde KAYBOLMAZ', () => {
    expect(kabiEkle('<p>form</p>')).toContain('<p>form</p>');
  });

  it('⭐ kap ZATEN VARSA IKINCISI eklenmez (mukerrer id olmaz)', () => {
    const mevcut = `<div id="${KAP_KIMLIGI}" class="popup"></div>`;
    expect(kabiEkle(mevcut)).toBe(mevcut);
    expect(kabiEkle(mevcut).split(KAP_KIMLIGI)).toHaveLength(2);
  });

  it('tek tirnakli yazim da taninir', () => {
    expect(kapIceriyorMu(`<div id='${KAP_KIMLIGI}'></div>`)).toBe(true);
  });

  it('benzer ama FARKLI kimlik kap sayilmaz', () => {
    expect(kapIceriyorMu('<div id="iyzipay-checkout-form-eski"></div>')).toBe(false);
  });

  it('⭐ kap betiklerden ONCE basiliyor (betik calisirken DOM.da olmali)', () => {
    const modul = readFileSync(join(__dirname, 'iyzico-form.ts'), 'utf8');
    const i = modul.indexOf('kap.innerHTML = kabiEkle(govde)');
    const j = modul.indexOf('kap.appendChild(betigiElemanaCevir');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
});
