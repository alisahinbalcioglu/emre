import Link from 'next/link';

/**
 * TELEFON MENÜSÜ — anasayfa başlığının ikinci satırı (Faz 6.1 kapanış, 15.09.2026).
 *
 * ⚠ NEDEN VAR: masaüstü menüsü `hidden md:flex`; 768 pikselin altında hiç
 * görünmüyordu ve /fiyatlar'a giden TEK bağlantı onun içindeydi. Telefondaki
 * ziyaretçi fiyat sayfasına siteyi gezerek ulaşamıyordu.
 *
 * ⚠ AÇILIR MENÜ DEĞİL, HEP GÖRÜNÜR SATIR (karar a): tek dokunuş, istemci
 * JS'i yok — anasayfa sunucu bileşeni kalır. md ve üstünde gizlenir; orada
 * aynı üç bağlantı üst satırdaki menüdedir.
 *
 * Ayrı dosya, çünkü `telefon-menusu.test.ts` bileşeni GERÇEKTEN çizer
 * (react-dom/server) ve bağlantının telefonda görünür olduğunu çizilen
 * DOM'dan ölçer. Sayfanın kendisi vitest'te içe aktarılamıyor (`@/` yok).
 */
export function TelefonMenusu() {
  return (
    <nav
      aria-label="Ana menü"
      className="flex flex-wrap items-center justify-center gap-x-6 border-t border-slate-200/80 px-4 text-sm font-semibold text-slate-600 md:hidden"
    >
      <a href="#ozellikler" className="py-2.5 transition-colors hover:text-blue-600">
        Özellikler
      </a>
      <a href="#nasil-calisir" className="py-2.5 transition-colors hover:text-blue-600">
        Nasıl Çalışır?
      </a>
      <Link href="/fiyatlar" className="py-2.5 transition-colors hover:text-blue-600">
        Fiyatlar
      </Link>
    </nav>
  );
}
