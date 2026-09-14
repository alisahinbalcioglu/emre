import { siteHaritasi } from '@/ortak/seo/arama-paylasim';

/**
 * `/sitemap.xml`. `force-static`: rota `next build` sırasında BİR KEZ üretilir,
 * yani `new Date()` derleme anıdır — `lastmod` elle sabitlenmez, her deploy'da
 * ilerler. Statik olmasaydı her istekte "şimdi" dönerdi ve anlamını yitirirdi.
 */
export const dynamic = 'force-static';

export default function sitemap() {
  return siteHaritasi(new Date());
}
