/**
 * AI AYLIK BUTCE — OKUMA VE DURUM (13.08).
 *
 * ★ BU DOSYANIN ASIL ISI: "butce girilmemis" ile "butce sifir" durumlarini
 * BIRBIRINDEN AYIRMAK. `systemSettings` degerleri METINDIR ve `Number('')`
 * SIFIR doner — sarmalsiz bir okumada bos ayar "sifir butce" olur, ardindan
 * gelen bolme Infinity/NaN uretir ve admin paneli "%Infinity kullanildi"
 * yazar. Ayni ailenin hatasi bu projede daha once canli 400 uretti
 * ([[feedback-sarmalsiz-veya-sifir-deseni]]).
 *
 * Ikinci is: ASIMI GIZLEMEMEK. Butce asildiginda yuzde 100'u gecmeli; yalniz
 * ilerleme CUBUGU kirpilir. Tek degere indirmek %180 harcamayi ekranda %100
 * gosterirdi — panel yanlis bir guvence verirdi.
 *
 * ⚠ BIR ASSERT TEK KRITERE (proje kurali): her kriter kendi it() blogunda.
 */
import { describe, it, expect } from 'vitest';
import { butceOku, butceDurumu, AI_BUTCE_ANAHTARI } from './ai-butce';

describe('butceOku — ayar metninden butceye', () => {
  it('duz sayi metnini okur', () => {
    expect(butceOku('50')).toBe(50);
  });

  it('BOS metin butce DEGILDIR (Number("") === 0 tuzagi)', () => {
    expect(butceOku('')).toBeNull();
  });

  it('yalniz bosluktan olusan metin butce DEGILDIR', () => {
    expect(butceOku('   ')).toBeNull();
  });

  it('ayar hic girilmemisse (undefined) butce yoktur', () => {
    expect(butceOku(undefined)).toBeNull();
  });

  it('sayi olmayan metin butce DEGILDIR', () => {
    expect(butceOku('50 USD')).toBeNull();
  });

  // ⚠ `undefined` tip kapisini OLCMEZ: kapi kaldirilsa `String(undefined)`
  // → "undefined" → NaN → yine null olurdu. Kapiyi gercekten olcen vaka
  // DIZI: `String(['50'])` "50" doner, yani bozuk bir API cevabi butceye
  // donusurdu.
  it('metin/sayi disi bir tip (dizi) butceye DONUSMEZ', () => {
    expect(butceOku(['50'] as unknown)).toBeNull();
  });

  it('SIFIR butce reddedilir — bolme sonsuz uretirdi', () => {
    expect(butceOku('0')).toBeNull();
  });

  it('negatif butce reddedilir', () => {
    expect(butceOku('-10')).toBeNull();
  });

  it('Turkce ondalik (virgul) kabul edilir', () => {
    expect(butceOku('50,5')).toBe(50.5);
  });

  it('ayar anahtari sabittir — panel ile kayit AYNI anahtari kullanir', () => {
    expect(AI_BUTCE_ANAHTARI).toBe('AI_MONTHLY_BUDGET_USD');
  });
});

describe('butceDurumu — harcamanin butceye orani', () => {
  it('butce tanimli degilse durum HESAPLANMAZ', () => {
    expect(butceDurumu(12.5, null)).toBeNull();
  });

  it('yuzde harcamanin butceye oranidir', () => {
    expect(butceDurumu(25, 50)?.yuzde).toBe(50);
  });

  it('kalan = butce - harcanan', () => {
    expect(butceDurumu(25, 50)?.kalan).toBe(25);
  });

  it('ASIMDA yuzde 100u GECER — gercek gizlenmez', () => {
    expect(butceDurumu(90, 50)?.yuzde).toBe(180);
  });

  it('asimda cubuk 100e kirpilir (gorsel deger olcuyu ezmez)', () => {
    expect(butceDurumu(90, 50)?.cubukYuzde).toBe(100);
  });

  it('asimda kalan NEGATIF doner', () => {
    expect(butceDurumu(90, 50)?.kalan).toBe(-40);
  });

  it('asim bayragi butce asilinca kalkar', () => {
    expect(butceDurumu(90, 50)?.asildi).toBe(true);
  });

  // ⚠ SINIR VAKASI: 49.99 bu kriteri OLCMEZ — `>` `>=`e gevsetilse bile
  // 49.99 >= 50 yanlis kalir ve test yesil gecerdi. Ayrimi yalniz TAM
  // esitlik gosterir: butceyi tam doldurmak asim DEGILDIR.
  it('butce TAM dolduruldugunda asim bayragi kalkmaz', () => {
    expect(butceDurumu(50, 50)?.asildi).toBe(false);
  });

  it('harcama NaN geldiginde yuzde NaN OLMAZ (olculemedi = 0)', () => {
    expect(butceDurumu(Number.NaN, 50)?.yuzde).toBe(0);
  });

  // `NaN > 0` zaten false'tur; sonlulugu GERCEKTEN olcen deger Infinity'dir.
  it('harcama Infinity geldiginde yuzde sonlu kalir', () => {
    expect(butceDurumu(Number.POSITIVE_INFINITY, 50)?.yuzde).toBe(0);
  });

  it('harcama hic olculmemisse (undefined) yuzde sifirdir', () => {
    expect(butceDurumu(undefined, 50)?.yuzde).toBe(0);
  });
});
