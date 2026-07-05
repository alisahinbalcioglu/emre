import { describe, it, expect } from 'vitest';
import { parseMaterialText, joinMaterialText } from './parse-material-text';

describe('parseMaterialText — DWG bucket metnini cap + cins ayirma', () => {
  it('Ø-prefix: "Ø110 PVC BORU"', () => {
    expect(parseMaterialText('Ø110 PVC BORU')).toEqual({ cap: 'Ø110', cins: 'PVC BORU' });
  });

  it('Ø ortada: "PPRC BORU Ø32"', () => {
    expect(parseMaterialText('PPRC BORU Ø32')).toEqual({ cap: 'Ø32', cins: 'PPRC BORU' });
  });

  it('DN: "DN50 KELEBEK VANA"', () => {
    expect(parseMaterialText('DN50 KELEBEK VANA')).toEqual({ cap: 'DN50', cins: 'KELEBEK VANA' });
  });

  it('DN bosluklu: "dn 150 CELIK BORU"', () => {
    expect(parseMaterialText('dn 150 CELIK BORU')).toEqual({ cap: 'dn 150', cins: 'CELIK BORU' });
  });

  it('bilesik kesir inc: "1 1/4\\" GALVANIZ BORU"', () => {
    expect(parseMaterialText('1 1/4" GALVANIZ BORU')).toEqual({ cap: '1 1/4"', cins: 'GALVANIZ BORU' });
  });

  it('unicode kesir: "2½\\" DIKISLI BORU"', () => {
    expect(parseMaterialText('2½" DIKISLI BORU')).toEqual({ cap: '2½"', cins: 'DIKISLI BORU' });
  });

  it('tek kesir sonda: "SPRINKLER 1/2\\""', () => {
    expect(parseMaterialText('SPRINKLER 1/2"')).toEqual({ cap: '1/2"', cins: 'SPRINKLER' });
  });

  it('tam sayi inc: "2\\" VANA"', () => {
    expect(parseMaterialText('2" VANA')).toEqual({ cap: '2"', cins: 'VANA' });
  });

  it('mm: "110mm HDPE"', () => {
    expect(parseMaterialText('110mm HDPE')).toEqual({ cap: '110mm', cins: 'HDPE' });
  });

  it('kanal: "200x100 HAVA KANALI"', () => {
    expect(parseMaterialText('200x100 HAVA KANALI')).toEqual({ cap: '200x100', cins: 'HAVA KANALI' });
  });

  it('cap yok: "Belirtilmemis" oldugu gibi cins olur', () => {
    expect(parseMaterialText('Belirtilmemis')).toEqual({ cap: '', cins: 'Belirtilmemis' });
  });

  it('cap yok: ekipman etiketi "Yangın Dolabı"', () => {
    expect(parseMaterialText('Yangın Dolabı')).toEqual({ cap: '', cins: 'Yangın Dolabı' });
  });

  it('bos/whitespace giris', () => {
    expect(parseMaterialText('')).toEqual({ cap: '', cins: '' });
    expect(parseMaterialText('   ')).toEqual({ cap: '', cins: '' });
  });

  it('coklu bosluk normalize edilir', () => {
    expect(parseMaterialText('  Ø160   HDPE  BORU ')).toEqual({ cap: 'Ø160', cins: 'HDPE BORU' });
  });
});

describe('joinMaterialText — eslestirme/kayit icin geri birlestirme', () => {
  it('cap + cins → "Ø110 PVC BORU"', () => {
    expect(joinMaterialText('Ø110', 'PVC BORU')).toBe('Ø110 PVC BORU');
  });

  it('cap bos → sadece cins', () => {
    expect(joinMaterialText('', 'Yangın Dolabı')).toBe('Yangın Dolabı');
  });

  it('cins bos → sadece cap', () => {
    expect(joinMaterialText('Ø50', '')).toBe('Ø50');
  });

  it('ikisi bos → bos string', () => {
    expect(joinMaterialText('', '')).toBe('');
    expect(joinMaterialText(undefined, undefined)).toBe('');
  });

  it('round-trip: parse sonrasi join orijinali verir', () => {
    const { cap, cins } = parseMaterialText('Ø160 HDPE BORU');
    expect(joinMaterialText(cap, cins)).toBe('Ø160 HDPE BORU');
  });
});
