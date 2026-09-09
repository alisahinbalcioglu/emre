'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * TARAYICI DEPOLAMASI BİLGİLENDİRME ŞERİDİ (FAZ 5.4).
 *
 * ⚠⚠ NEDEN "KABUL ET / REDDET" DEĞİL, TEK DÜĞMELİ BİLGİLENDİRME:
 * Ölçüldü (09.09) — bu uygulamada HTTP çerezi SIFIR, üçüncü taraf izleyici
 * SIFIR, fontlar self-host (tarayıcıdan Google'a istek gitmiyor). Saklanan
 * tek şey oturumun ve ürünün çalışması için ZORUNLU olan `localStorage` /
 * `sessionStorage` verisi.
 *
 * Bu tabloda granüler onay kutuları koymak YANILTICI olurdu: kullanıcıya
 * reddedebileceği bir şey varmış gibi görünür, oysa "reddet"e basılsa
 * uygulama zaten çalışmaz. Standart çerez banner'ını kopyalamak, bu üründe
 * doğru olmayan bir şeyi iddia etmek olurdu.
 *
 * ⚠ İRONİ, BİLEREK: şeridin kapatıldığı bilgisi de `localStorage`a yazılıyor —
 * yani şerit tam da anlattığı mekanizmayı kullanıyor. Alternatifi her sayfa
 * açılışında yeniden göstermekti; bu, bilgilendirmeyi rahatsızlığa çevirirdi.
 * Metinde bu açıkça söyleniyor.
 *
 * ⚠ ÖDEME İSTİSNASI: ödeme adımında iyzico kendi <script> etiketlerini
 * sayfaya enjekte ediyor ve kendi çerezlerini koyabilir. Bu şerit onu VAAT
 * ETMEZ; ayrıntı `/cerez-politikasi` sayfasında adıyla anlatılıyor.
 */
const ANAHTAR = 'metaprice_depolama_bilgilendirmesi';

export function DepolamaSeridi() {
  // Sunucuda `localStorage` yok; ilk çizimde GÖSTERMEYİP effect'te karar
  // veriyoruz. Aksi halde hydration uyuşmazlığı oluşur ve şerit bir kare
  // yanıp söner.
  const [gorunur, setGorunur] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ANAHTAR)) setGorunur(true);
    } catch {
      // Depolama kapalıysa (gizli sekme, kısıtlı tarayıcı) şerit gösterilmez:
      // kapatılamayan bir şerit, bilgilendirmeden çok engel olur.
    }
  }, []);

  if (!gorunur) return null;

  return (
    <div
      role="region"
      aria-label="Tarayıcı depolaması bilgilendirmesi"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-white/95 px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] leading-relaxed text-slate-600">
          Bu sitede <strong>çerez kullanmıyoruz</strong> ve üçüncü taraf izleyici
          çalıştırmıyoruz. Bunun yerine oturumunuzu ve çalışmalarınızı açık
          tutmak için tarayıcınızın yerel deposunu kullanıyoruz — bu şeridi bir
          daha görmemeniz için kapattığınız bilgisi de oraya yazılır.{' '}
          <Link href="/cerez-politikasi" className="font-semibold text-blue-600 hover:text-blue-700">
            Ayrıntılar
          </Link>
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(ANAHTAR, '1');
            } catch {
              /* yazılamazsa da şeridi kapat: aksi halde düğme çalışmıyor sanılır */
            }
            setGorunur(false);
          }}
          className="shrink-0 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
        >
          Anladım
        </button>
      </div>
    </div>
  );
}
