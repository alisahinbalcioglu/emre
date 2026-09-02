import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  betigiElemanaCevir,
  betikleriAyikla,
  iyzicoFormunuBas,
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

  it('betiksiz icerikte hicbir eleman eklenmez', () => {
    const { belge } = sahteBelge();
    const { kap, eklenen } = sahteKap(belge);
    iyzicoFormunuBas(kap, '<div>x</div>');
    expect((kap as any).innerHTML).toBe('<div>x</div>');
    expect(eklenen).toHaveLength(0);
  });
});
