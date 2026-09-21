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
 *  ⚠ METIN KURULU UYGULAMA VARSAYMAZ (21.09): "kod telefona gelmiyor"
 *  sikayeti — kullanici SMS/e-posta bekledi. Adimlar once uygulamayi kurdurur,
 *  sonra anahtari, sonra kodu ister. Anahtar 4'lu grubun ORTASINDAN
 *  bolunmez (`break-words`): `break-all` canlida "BCN" / "O QMRV" bolup
 *  satir basinda tek kalan O'yu sifir gibi gosteriyordu.
 *
 *  ⚠ "ESKI KAYDI SIL" UYARISI YALNIZ BURADA: bu bilesen ancak TAZE anahtar
 *  uretildikten sonra cizilir (iki akista da `bekleyenSirriYaz`), yani o an
 *  BU HESABIN her eski kaydi gercekten bayattir. Sihirbazin 401 metnine
 *  konmaz — orada kurulum sunucuda basarili olmus olabilir. Kayit adina
 *  e-posta da yazdirilir: iki MetaPriceX hesabi olan kisi, iki adimli girisi
 *  acik OTEKI hesabin tek kaydini silmesin.
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
      <ol className="list-decimal space-y-1.5 pl-4 text-xs text-slate-600">
        <li>
          Telefonunuzda doğrulama uygulaması yoksa <strong>Google Authenticator</strong>{' '}
          ya da <strong>Microsoft Authenticator</strong>&apos;ı kurun (ücretsiz).
        </li>
        <li>
          Uygulamada <strong>+</strong> düğmesine dokunun ve anahtarı elle girme
          seçeneğini seçin:
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>
              Google Authenticator: <strong>&quot;Kurulum anahtarı girin&quot;</strong>
            </li>
            <li>
              Microsoft Authenticator: <strong>&quot;Diğer hesap&quot;</strong>, sonra
              &quot;Kodu el ile girin&quot;
            </li>
          </ul>
          <span className="mt-1 block">
            Hesap adı alanına <strong>MetaPriceX</strong> ve e-posta adresinizi, anahtar
            alanına aşağıdaki anahtarı yazın:
          </span>
        </li>
      </ol>
      <div>
        <p className="select-all break-words rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm tracking-wider text-slate-900">
          {anahtariGrupla(elleAnahtar)}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Anahtarda 0 ve 1 rakamı yoktur: yuvarlak karakter O, düz çizgi I harfidir.
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Uygulamada bu e-postayla önceki bir denemeden kalan MetaPriceX kaydı varsa
          silin: her kurulumda yeni anahtar verilir, eski kayıt yanlış kod üretir.
        </p>
      </div>
      <ol start={3} className="list-decimal pl-4 text-xs text-slate-600">
        <li>
          Uygulamanın gösterdiği 6 haneli kodu aşağıya yazın. Kod her 30 saniyede
          yenilenir.
        </li>
      </ol>
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
