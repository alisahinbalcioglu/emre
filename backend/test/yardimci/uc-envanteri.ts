/**
 * UÇ ENVANTERİ — controller kaynaklarından HTTP uçlarını AST ile çıkarır.
 *
 * NEDEN AST, NEDEN GREP DEĞİL:
 *   Bu depoda daha önce grep ile uç sayıldı ve YANLIŞ ÇIKTI: `@Get(` deseni
 *   yorum bloklarındaki örnekleri de sayıyor, sınıf düzeyi dekoratörleri
 *   metot düzeyindekilerden ayıramıyor, `@UseGuards(...)` çok satırlıysa
 *   bloğu kaçırıyordu. Kapının kendisi ölçüme güveniyorsa ölçüm dilin
 *   gramerinden gelmeli — `ts.createSourceFile` tam olarak onu verir.
 *
 * ⚠ BİLİNEN SINIR: dekoratör ARGÜMANLARI metin olarak taşınır (`RequireTier('pro')`).
 *   Değişkenle verilen argüman (`@RequireTier(SABIT)`) metinsel çözülmez —
 *   bugün depoda öyle bir kullanım YOK (ölçüldü), olursa kapı onu "kapı var"
 *   sayar ama seviyesini bilmez; bu güvenli taraftır (fail-closed değil ama
 *   eksik bilgi yanlış bilgi üretmez).
 */
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

/** Nest'in yönlendirme (routing) dekoratörleri. */
const HTTP_DEKORATORLERI = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'Options',
  'Head',
  'All',
]);

export interface Uc {
  /** Depo köküne göre dosya yolu (ileri bölü). */
  dosya: string;
  sinif: string;
  metot: string;
  /** GET/POST/... */
  fiil: string;
  /** @Controller('x') yolu */
  sinifYolu: string;
  /** @Get('y') yolu */
  metotYolu: string;
  /** `/x/y` — Nest global prefix'i (`api`) DAHİL DEĞİL. */
  yol: string;
  /** İnsan ve kapı için kararlı anahtar: `GET /x/y` */
  anahtar: string;
  /** Sınıf düzeyi dekoratörler, metin hâlinde (`UseGuards(JwtAuthGuard)`). */
  sinifDekoratorleri: string[];
  /** Metot düzeyi dekoratörler, metin hâlinde. */
  metotDekoratorleri: string[];
}

interface DekoratorMetni {
  ad: string;
  arglar: string;
  metin: string;
}

function dekoratorMetni(d: ts.Decorator): DekoratorMetni {
  const e = d.expression;
  if (ts.isCallExpression(e)) {
    const ad = e.expression.getText();
    const arglar = e.arguments.map((a) => a.getText()).join(', ');
    return { ad, arglar, metin: `${ad}(${arglar})` };
  }
  const ad = e.getText();
  return { ad, arglar: '', metin: ad };
}

/** `'abc'` biçimli ilk dizgi argümanını çıkarır; yoksa boş dizgi. */
function ilkDizgi(arglar: string): string {
  const m = arglar.match(/^\s*['"`]([^'"`]*)['"`]/);
  return m ? m[1] : '';
}

function yollariBirlestir(sinifYolu: string, metotYolu: string): string {
  const parcalar = [sinifYolu, metotYolu].filter((p) => p !== '' && p !== '/');
  const birlesik = '/' + parcalar.join('/');
  return birlesik.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
}

/** `src` altındaki tüm `*.controller.ts` dosyaları (alfabetik). */
export function controllerDosyalari(srcKoku: string): string[] {
  const bulunan: string[] = [];
  const gez = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) gez(p);
      else if (e.name.endsWith('.controller.ts')) bulunan.push(p);
    }
  };
  gez(srcKoku);
  return bulunan.sort();
}

/**
 * `backendKoku` = `backend/` dizini. Dönen `dosya` alanı ona GÖRE görelidir.
 */
export function ucEnvanteri(backendKoku: string): Uc[] {
  const srcKoku = path.join(backendKoku, 'src');
  const uclar: Uc[] = [];

  for (const dosyaYolu of controllerDosyalari(srcKoku)) {
    const kaynak = ts.createSourceFile(
      dosyaYolu,
      fs.readFileSync(dosyaYolu, 'utf-8'),
      ts.ScriptTarget.ES2021,
      true,
    );
    const goreli = path
      .relative(backendKoku, dosyaYolu)
      .split(path.sep)
      .join('/');

    kaynak.forEachChild((node) => {
      if (!ts.isClassDeclaration(node)) return;
      const sinifDekler = (ts.getDecorators(node) ?? []).map(dekoratorMetni);
      const ctrl = sinifDekler.find((d) => d.ad === 'Controller');
      if (!ctrl) return; // @Controller taşımayan sınıf uç yayınlamaz.
      const sinifYolu = ilkDizgi(ctrl.arglar);

      for (const uye of node.members) {
        if (!ts.isMethodDeclaration(uye)) continue;
        const metotDekler = (ts.getDecorators(uye) ?? []).map(dekoratorMetni);
        const http = metotDekler.find((d) => HTTP_DEKORATORLERI.has(d.ad));
        if (!http) continue;
        const metotYolu = ilkDizgi(http.arglar);
        const yol = yollariBirlestir(sinifYolu, metotYolu);
        uclar.push({
          dosya: goreli,
          sinif: node.name?.getText() ?? '(isimsiz)',
          metot: uye.name.getText(),
          fiil: http.ad.toUpperCase(),
          sinifYolu,
          metotYolu,
          yol,
          anahtar: `${http.ad.toUpperCase()} ${yol}`,
          sinifDekoratorleri: sinifDekler.map((d) => d.metin),
          metotDekoratorleri: metotDekler.map((d) => d.metin),
        });
      }
    });
  }

  return uclar;
}

/** Metot VEYA sınıf düzeyinde verilmiş dekoratör var mı? (Nest'te metot ezer, varlık için ikisi de sayılır.) */
export function dekoratorVar(uc: Uc, ad: string): boolean {
  const desen = new RegExp(`^${ad}\\b`);
  return (
    uc.metotDekoratorleri.some((d) => desen.test(d)) ||
    uc.sinifDekoratorleri.some((d) => desen.test(d))
  );
}

/** Ücretli kapı = `@RequireTier` (paket satın alındı mı) VEYA `@GerekliYetenek` (ödeme güncel mi). */
export function ucretliKapiVar(uc: Uc): boolean {
  return dekoratorVar(uc, 'RequireTier') || dekoratorVar(uc, 'GerekliYetenek');
}
