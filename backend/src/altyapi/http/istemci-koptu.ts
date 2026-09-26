import type { Response } from 'express';

/**
 * ISTEMCI KOPTU SINYALI (26.09.2026)
 *
 * Tarayici istegini iptal edince (DWG Analiz: ayirma surerken birim degisti,
 * on yuz `iptalEt`) Caddy arka baglantiyi kapatir. Bu sinyal o an iptal olur;
 * sunucunun disariya actigi istek (DWG motoru) de kesilebilir. Eskiden
 * kesilmiyordu: Nest motor cagrisini sonuna kadar bekliyor, motor yetim isi
 * bitiriyor ve yeniden baslayan istekle CPU paylasiyordu.
 *
 * NEDEN `res` 'close' + `writableFinished`:
 *  - `req.on('close')` KULLANILMAZ: Node 16+'da IncomingMessage 'close'u GOVDE
 *    OKUNUNCA yayar (olculdu, Node 24: `req end` ile ayni an). Denetleyiciye
 *    gelindiginde multer govdeyi coktan okumustur: dinleyici HIC tetiklenmez,
 *    iptal sessizce calismaz (mutant `test:dwg-istemci-koptu` K1'de oldu).
 *  - Yanit tamamlaninca da 'close' gelir; o an `writableFinished` true → iptal YOK.
 *  - Dinleyici kurulmadan once kopmus baglanti (`res.destroyed`) aninda iptal.
 */
export class IstemciKoptuHatasi extends Error {
  constructor() {
    super('Istemci baglantiyi yanit yazilmadan kapatti');
    this.name = 'IstemciKoptu';
  }
}

export function istemciKopmaSinyali(res: Response): AbortSignal {
  const denetleyici = new AbortController();
  const kapandi = () => {
    if (!res.writableFinished) denetleyici.abort(new IstemciKoptuHatasi());
  };
  if (res.destroyed) kapandi();
  else res.once('close', kapandi);
  return denetleyici.signal;
}
