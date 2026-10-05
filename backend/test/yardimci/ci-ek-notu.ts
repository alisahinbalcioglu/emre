/**
 * CI EK NOTU (04.10.2026, koordinator) — regresyon kosucusunun kirmizi
 * nedenlerini GitHub Actions `::error` ek notu olarak yazar.
 *
 * NEDEN: Actions gunlugu girissiz OKUNMAZ (403); kirmizi isin tek ek notu
 * runner'in "Process completed with exit code 1." satiriydi — dusen paketi
 * bulmak icin kosuyu Linux kopyasinda yeniden uretmek gerekiyordu (04.10
 * klasor kirmizisi). Ek notlar girissiz okunur:
 * `GET /repos/<sahip>/<depo>/check-runs/<id>/annotations`.
 *
 * SINIR: GitHub adim basina en cok 10 hata notu gosterir. Dusen paket basina
 * BIR not, en cok PAKET_TAVANI paket; sonda TEK ozet (dusenlerin HEPSINI
 * sayar); onuncu yer runner'in "exit code" notuna kalir. Saat +30 isinde
 * paket askida kalirsa ozet yazilamaz (surec oldurulur), yerine isin
 * "askida" notu gelir — ikisi ayni kosuda cikmaz.
 * Yalniz GITHUB_ACTIONS=true iken yazar: yerel cikti degismez.
 * Kapi: `test:ci-ek-notu` (saf kurallar + kirpilmis kosucu kopyasiyla baglanti).
 */

export const PAKET_TAVANI = 8;
const NEDEN_UZUNLUGU = 300;

/** Is komutu verisi: `%` `\r` `\n` kacisi (@actions/core escapeData kurali). */
export const ghVeri = (s: string): string =>
  s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/** Is komutu ozelligi (title=...): veriye ek `:` `,` kacisi (escapeProperty kurali). */
export const ghOzellik = (s: string): string => ghVeri(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export const hataNotu = (baslik: string, mesaj: string): string =>
  `::error title=${ghOzellik(baslik)}::${ghVeri(mesaj)}`;

/** Dusen assert satiri: "✗ ad" / "× ad" / "FAIL: ad" / "❌ FAIL ...". Gecen bir
 *  kontrolun ADINDAKI "FAILED" eslesmez ("✓ S6 orderStatus FAILED" gibi). */
const DUSEN_SATIR = /^(?:✗|×)\s|^(?:❌\s*)?FAIL\b/;
/** Sifirdan buyuk FAIL sayaci: "X: 30 PASS, 4 FAIL" (", 0 FAIL" eslesmez). */
const SAYAC_SATIRI = /\b[1-9]\d*\s+FAIL\b/;
/** Cokme: "XError: ..." / "XException: ..." satiri — kaynak satiri ("throw new
 *  Error(") ya da yigin satiri ("at ...") degil. */
const ISTISNA_SATIRI = /^\w*(?:Error|Exception)\b/;

/** Paketin ciktisindan dusus nedeninin TEK satiri; kod noktasinda kirpilir
 *  (emoji gibi iki parcali karakter bolunmez). */
export function dususNedeni(stdout: string, stderr: string): string | undefined {
  const o = stdout.split('\n').map((l) => l.trim());
  const e = stderr.split('\n').map((l) => l.trim());
  const satir = o.find((l) => DUSEN_SATIR.test(l))
    ?? o.find((l) => SAYAC_SATIRI.test(l))
    ?? e.find((l) => ISTISNA_SATIRI.test(l))
    ?? o.find((l) => ISTISNA_SATIRI.test(l));
  return satir === undefined ? undefined : Array.from(satir).slice(0, NEDEN_UZUNLUGU).join('');
}

/** Surec cikis kodu vermeden bittiyse nedeni: sinyal (SIGKILL, OOM) ya da
 *  spawnSync hatasi (ENOBUFS: cikti tavani asildi, ETIMEDOUT). */
export function kesintiNotu(status: number | null, signal: string | null, error?: Error): string {
  if (status !== null) return '';
  const kod = (error as NodeJS.ErrnoException | undefined)?.code ?? error?.message;
  return [signal ? `sinyal=${signal}` : '', kod ? `hata=${kod}` : ''].filter(Boolean).map((p) => ` ${p}`).join('');
}

export class CiEkNotu {
  private paketNotu = 0;

  constructor(
    private readonly etkin: boolean,
    private readonly yaz: (satir: string) => void = (satir) => console.log(satir),
  ) {}

  /** Dusen paket basina bir not — ilk PAKET_TAVANI paket. */
  paketDustu(script: string, ad: string, ayrinti: string, neden?: string): void {
    if (!this.etkin || this.paketNotu >= PAKET_TAVANI) return;
    this.paketNotu++;
    this.yaz(hataNotu(`Regresyon: ${script} dustu`, `${ad} ${ayrinti}${neden ? ` — ${neden}` : ''}`));
  }

  /** Kosu sonunda TEK ozet: dusen paketlerin hepsi + SKIP defteri sapmasi. */
  ozet(sayac: string, dusenler: string[], beklenmeyenSkip: string[], defterBayat: string[]): void {
    if (!this.etkin || dusenler.length + beklenmeyenSkip.length + defterBayat.length === 0) return;
    const parcalar = [
      ...(dusenler.length ? [`${dusenler.length} paket dustu: ${dusenler.join(' · ')}`] : []),
      ...beklenmeyenSkip.map((s) => `BEKLENMEYEN SKIP: ${s}`),
      ...defterBayat.map((s) => `DEFTER BAYAT: ${s}`),
    ];
    this.yaz(hataNotu(`Regresyon kirmizi (${sayac})`, parcalar.join(' | ')));
  }
}
