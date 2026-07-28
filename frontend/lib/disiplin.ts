// PANO 17a: sayfa disiplini OTOMATIK tespiti (FE fallback) — kayitli eski
// tekliflerde sheets[].discipline alani yok; sekme ADI cogu zaman aciktir
// ("mekanik G BLOK", "elektrik F BLOK"). Backend detectSheetDiscipline'in
// ad-tabanli hafif ikizi; tespit edilemezse null → SheetTabs'taki sayfa
// duzeyi TEK secim akisi devrede (17b).
export function adDisiplinTahmini(ad?: string | null): 'mechanical' | 'electrical' | null {
  const n = (ad ?? '').toLowerCase();
  if (!n) return null;
  if (/elektrik|aydinlatma|aydınlatma|zayif|zayıf|kuvvetli|pano|topraklama/.test(n)) return 'electrical';
  if (/mekanik|sihhi|sıhhi|tesisat|yangin|yangın|havalandirma|havalandırma|isitma|ısıtma|sogutma|soğutma|dogalgaz|doğalgaz|sprinkler|klima/.test(n)) return 'mechanical';
  return null;
}
