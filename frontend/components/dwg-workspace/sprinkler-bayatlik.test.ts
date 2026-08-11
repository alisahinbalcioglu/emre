/**
 * Sprinkler işaret bayatlığı — PANOVA vakasının mührü.
 *
 * Vaka: boru layer'ı hesaplandı → kullanıcı SPRİNK'i 💧 işaretledi → mevcut
 * hesap sessizce bayat kaldı, kimse söylemedi. Motor işareti alınca 494→1474
 * segmente bölüyordu (gerçek dosyada ölçüldü). Bu dosya "sessizlik" tarafını
 * mühürler: işaret değişimi bayatlık SAYILMAK zorunda.
 */
import { describe, expect, it } from 'vitest';
import { sprinklerIsaretiBayat } from './sprinkler-bayatlik';

describe('sprinklerIsaretiBayat', () => {
  it('PANOVA vakasi: isaretsiz hesap + sonradan isaret -> BAYAT', () => {
    expect(sprinklerIsaretiBayat({ sprinklerLayersUsed: [] }, ['SPRİNK'])).toBe(true);
  });

  it('isaret kaldirilirsa da bayat (ters yon)', () => {
    expect(sprinklerIsaretiBayat({ sprinklerLayersUsed: ['SPRİNK'] }, [])).toBe(true);
  });

  it('ayni isaretle hesaplanmis -> bayat DEGIL', () => {
    expect(sprinklerIsaretiBayat({ sprinklerLayersUsed: ['SPRİNK'] }, ['SPRİNK'])).toBe(false);
  });

  it('sira ve tekrar duyarsiz', () => {
    expect(sprinklerIsaretiBayat(
      { sprinklerLayersUsed: ['A', 'B'] }, ['B', 'A', 'B'],
    )).toBe(false);
  });

  it('farkli kume -> bayat', () => {
    expect(sprinklerIsaretiBayat({ sprinklerLayersUsed: ['A'] }, ['B'])).toBe(true);
    expect(sprinklerIsaretiBayat({ sprinklerLayersUsed: ['A'] }, ['A', 'B'])).toBe(true);
  });

  it('MIRAS kayit (alan yok): simdiki isaret bos -> bayat degil', () => {
    expect(sprinklerIsaretiBayat({}, [])).toBe(false);
  });

  it('MIRAS kayit (alan yok): simdiki isaret var -> BAYAT (sessiz gecme yasak)', () => {
    // Eski hesabin o isaretle yapilmadigi kesin bilinmese de "belki bayat"i
    // sessizce gecmek PANOVA kor noktasinin kendisidir — uyari verilir.
    expect(sprinklerIsaretiBayat({}, ['SPRİNK'])).toBe(true);
  });

  it("BOLMESIZ hesap (splitMode='none') isaret degisiminden ETKILENMEZ", () => {
    // Bolmesiz hesap sprinkler'i hic kullanmaz — isaret eklense de kalksa da
    // sonuc ayni kalirdi; sahte bayatlik banti kullaniciyi bosuna korkutur.
    expect(sprinklerIsaretiBayat(
      { splitMode: 'none', sprinklerLayersUsed: [] }, ['SPRİNK'],
    )).toBe(false);
    expect(sprinklerIsaretiBayat(
      { splitMode: 'none', sprinklerLayersUsed: ['SPRİNK'] }, [],
    )).toBe(false);
    expect(sprinklerIsaretiBayat({ splitMode: 'none' }, ['SPRİNK'])).toBe(false);
  });

  it("bolmeli hesap (splitMode='t') normal kurala tabi", () => {
    expect(sprinklerIsaretiBayat(
      { splitMode: 't', sprinklerLayersUsed: [] }, ['SPRİNK'],
    )).toBe(true);
  });
});
