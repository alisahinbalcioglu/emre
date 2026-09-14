import { robotsKurallari } from '@/ortak/seo/arama-paylasim';

/** `/robots.txt` — kural ve gerekçesi `ortak/seo/arama-paylasim.ts`'de (testten koşulur). */
export default function robots() {
  return robotsKurallari();
}
