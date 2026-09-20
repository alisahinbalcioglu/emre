'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — KURULUM ANAHTARI (QR YERINE ELLE ANAHTAR + BAGLANTI)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ QR KODU YOK ve bu BILINCLI: tasarim §0.6 QR icin `qrcode-generator`
 *  paketini ONERIYOR ama YENI BAGIMLILIK Emre'nin onayina tabidir ve o onay
 *  bu turda ALINMADI. Onay gelene kadar §0.6'nin yazili yedegi uygulanir:
 *  ELLE ANAHTAR + `otpauth://` baglantisi.
 *
 *  Kullanici acisindan kayip kucuktur: telefondaki uygulamalar "kurulum
 *  anahtarini elle gir" secenegini hepsi destekler; masaustu uygulamasinda
 *  `otpauth://` baglantisi dogrudan uygulamayi acar.
 *
 *  ⚠ `dangerouslySetInnerHTML` YOK (olmasi gereken de yok — QR eklendiginde
 *  `<img src="data:…">` kullanilacak, HTML enjekte EDILMEYECEK).
 */

/** 32 karakterlik base32 anahtarini 4'lu gruplara boler (okunabilirlik). */
export function anahtariGrupla(anahtar: string): string {
  return (anahtar.match(/.{1,4}/g) ?? []).join(' ');
}

export function KurulumAnahtari({
  otpauthUri,
  elleAnahtar,
}: {
  otpauthUri: string;
  elleAnahtar: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-600">
        Doğrulama uygulamanızda (Google Authenticator, Microsoft Authenticator,
        1Password…) <strong>&quot;Kurulum anahtarını elle gir&quot;</strong> seçeneğini
        kullanın ve aşağıdaki anahtarı yazın:
      </p>
      <p className="select-all break-all rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm tracking-wider text-slate-900">
        {anahtariGrupla(elleAnahtar)}
      </p>
      <p className="text-[11px] text-slate-500">
        Bu cihazda bir doğrulama uygulaması kuruluysa{' '}
        <a href={otpauthUri} className="font-semibold text-blue-600 hover:text-blue-700">
          bu bağlantıyla doğrudan ekleyebilirsiniz
        </a>
        .
      </p>
    </div>
  );
}
