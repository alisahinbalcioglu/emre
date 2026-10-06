/**
 * BULANIK BAŞLIK — `Authorization` ayrıştırıcısı eşdeğerlik ve süre ölçümü için
 * başlık üreticileri (06.10.2026, `test:buyuk-govde` T4/T5/K). Yapısal küme
 * belirlenimci; rastgele küme tohumludur (tohum çıktıya yazılır).
 */
/** JS `\s` sınıfının TAMAMI (25 karakter; elle yazılmaz — sınıfın kendisinden üretilir). */
export const BOSLUKLAR = Array.from({ length: 0x10000 }, (_, i) => String.fromCharCode(i)).filter((c) => /\s/.test(c));
export function yapisalBasliklar(): unknown[] {
  const bas = ['', ' ', '\t', '\u00a0', '  ', '\n', '\ufeff', 'x '];
  const sema = ['Bearer', 'bearer', 'BEARER', 'BeArEr', 'Bearerx', 'Bear', 'Basic', 'xBearer', ''];
  const ara = ['', ' ', '  ', '\t', '\u00a0', '\u3000', ' \t ', '\n'];
  const tok = ['', 'abc', 'a.b.c', 'a b', '\u00a0abc', 'abc\u00a0', 'a\tb'];
  const son = ['', ' ', ' ek', '\u00a0', ' x y'];
  const sonuc: unknown[] = [undefined, null, '', 0, 1, true, ['Bearer abc'], { a: 1 }];
  for (const a of bas) for (const s of sema) for (const r of ara) for (const t of tok) for (const z of son) sonuc.push(a + s + r + t + z);
  return sonuc;
}
/** xorshift32 — tohum çıktıya yazılır, düşen koşu aynı tohumla yeniden üretilir. */
export function rastgeleUretec(tohum: number): () => number {
  let s = tohum >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 2 ** 32;
  };
}
export function rastgeleBasliklar(tohum: number, adet: number): string[] {
  const r = rastgeleUretec(tohum);
  const abece = ['B', 'e', 'a', 'r', 'b', 'E', 'A', 'R', 'x', '.', '-', '1', ...BOSLUKLAR];
  return Array.from({ length: adet }, () => {
    let s = r() < 0.5 ? (r() < 0.5 ? 'Bearer' : 'bEaReR') : '';
    for (let n = Math.floor(r() * 16); n > 0; n--) s += abece[Math.floor(r() * abece.length)];
    return s;
  });
}
/** `kez` ölçümün ORTANCASI (ms): yük altında tek kesinti eşiği bozmasın. */
export function ortancaMs(f: () => unknown, kez: number): number {
  const s: number[] = [];
  for (let i = 0; i < kez; i++) {
    const t = performance.now();
    f();
    s.push(performance.now() - t);
  }
  return s.sort((a, b) => a - b)[Math.floor(kez / 2)];
}
/** Node'un başlık tavanı (16 KiB) altında geri izlemeyi zorlayan biçimler. */
export const UZUN = 16_000;
export const ZOR_BASLIKLAR: Readonly<Record<string, string>> = {
  'boşluksuz': 'A'.repeat(UZUN),
  'yalnız boşluk': ' '.repeat(UZUN),
  'şema + boşluk': `Bearer${' '.repeat(UZUN - 6)}`,
  'yalnız NBSP': '\u00a0'.repeat(UZUN),
  'boşluksuz + sonda boşluk': `${'A'.repeat(UZUN - 1)} `,
  'şema + boşluksuz token': `Bearer ${'A'.repeat(UZUN - 7)}`,
};
