/**
 * ASILI SÖZ KORUMASI — kapının akışı BİTMEZSE çıkış 1 (test yardımcısı, kendi
 * başına koşmaz).
 *
 * NEDEN:
 *   Bir kapı (`ts-node test/x.ts`) hiç çözülmeyen bir sözü bekliyorsa ve
 *   bekleyen başka iş yoksa Node olay döngüsünü boş sayar ve ÇIKIŞ 0 ile
 *   kapanır. Bekleyen iş yok demek: kilitlenen servis, bırakılmayan bariyer ya
 *   da `unref`li tek zamanlayıcı. O zaman özet basılmaz, sonraki denetimler
 *   koşmaz. `regression-all.ts` yalnız çıkış koduna baktığı için kapıyı PASS
 *   sayar.
 *   Ölçüldü (25.09): `WebhookIsleyici` çağrıları sıraya alınınca
 *   `test:dunning-toparlandi` E bloğunda özetsiz 0 ile çıktı. Akışı hiç
 *   başlatmayan mutant 90 async kapının 88'inde aynı sonucu verdi. Yalnız
 *   satır içi koruması olan iki kapı (`yonetim-epostalari`,
 *   `iyzico-zaman-asimi`) 1 ile çıktı.
 *   Özet satırıyla koşucuda yakalamak güvenilir değil, çünkü kapıların özet
 *   biçimleri farklı: `N PASS, M FAIL`, `N geçti · M kaldı`,
 *   `N/M kriter gecti`, sayısız `T2.14 DAVRANIŞ PASS.`, hiç PASS/FAIL
 *   satırı olmayan `test:perf`.
 *
 * KULLANIM — kapının SON deyimi olan akış zincirinin TAMAMI sarılır
 * (`then`/`catch`/`finally` dahil; yalnız `main()` sarılırsa ondan sonraki
 * zincir halkası asılı kalabilir):
 *   bitmezseKirmizi(main().catch((e) => { ... }));
 *
 * DAVRANIŞ:
 *   Zincir yerleşmeden olay döngüsü boşalırsa `beforeExit` çıkışı 1'e çeker ve
 *   nedenini yazar. İleti "FAIL" içerir. Koşucu kırmızı paketin ilk 10 FAIL
 *   satırını basar; öncesinde 10 FAIL satırı basan kapıda ileti görünmez.
 *   Akış kendi `process.exit`iyle biterse `beforeExit` hiç yayılmaz, koruma
 *   karışmaz.
 *
 * ⚠ Red YUTULMAZ: zincir reddedilirse (catch'siz `main()`) türetilen söz de
 *   reddedilir. İşlenmemiş red süreci eskisi gibi 1 ile düşürür.
 * ⚠ Açık sunucu/soket ya da ref'li zamanlayıcı döngüyü boşaltmaz, o zaman
 *   `beforeExit` yayılmaz. Bu durum sessiz değildir: kapı bitmez, CI zaman
 *   aşımına düşer.
 */
import { basename } from 'path';

export function bitmezseKirmizi(akis: Promise<unknown>): void {
  let bitti = false;
  akis.then(
    () => {
      bitti = true;
    },
    (e: unknown) => {
      bitti = true;
      throw e;
    },
  );
  process.on('beforeExit', () => {
    if (bitti) return;
    bitti = true;
    const kapi = basename(process.argv[1] ?? 'kapi');
    console.log(
      `\n✗ KAPI TAMAMLANMADI (${kapi}): akış bitmeden olay döngüsü boşaldı, çözülmeyen bir söz var. ` +
        'Özet basılmadı, sonraki denetimler koşmadı → FAIL (çıkış 1).',
    );
    process.exitCode = 1;
  });
}
