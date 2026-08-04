// ────────────────────────────────────────────────────────────────────
// XLSX → PDF (GERCEK gorunum) — LibreOffice headless.
// Kullanici is akisi (20.07): teklif Excel'i son haliyle PDF'e cevrilip
// musteriye gider — cikti PDF'i Excel'in BIREBIR baski gorunumu olmali
// (logolu kapak dahil). HTML taklidi yalniz GERI DUSUS olarak kalir.
//
// null donerse cagiran fallback'ini kullanir:
//  - soffice kurulu degil (Windows dev ortami) → spawn 'error'
//  - donusum hatasi / 60sn timeout
// Paralel cagrilar icin her calisma KENDI LibreOffice profilini kullanir
// (UserInstallation) — profil kilidi cakismasi olmaz.
// ────────────────────────────────────────────────────────────────────
import { spawn } from 'child_process';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export async function xlsxToPdf(xlsx: Buffer): Promise<Buffer | null> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'mp-lo-'));
    const inPath = join(dir, 'belge.xlsx');
    await writeFile(inPath, xlsx);

    const profilUri = `file://${dir.replace(/\\/g, '/')}/profil`;
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn('soffice', [
        '--headless', '--norestore', '--nolockcheck',
        `-env:UserInstallation=${profilUri}`,
        '--convert-to', 'pdf:calc_pdf_Export',
        '--outdir', dir!, inPath,
      ], { stdio: 'ignore' });
      const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch {} resolve(false); }, 60_000);
      p.on('error', () => { clearTimeout(t); resolve(false); }); // soffice yok
      p.on('exit', (code) => { clearTimeout(t); resolve(code === 0); });
    });
    if (!ok) return null;

    return await readFile(join(dir, 'belge.pdf'));
  } catch {
    return null;
  } finally {
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
