'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

const LABEL_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  quotes: 'Teklifler',
  new: 'Yeni Teklif',
  materials: 'Malzeme Havuzu',
  mechanical: 'Mekanik',
  electrical: 'Elektrik',
  library: 'Kutuphanem',
  'mechanical-brands': 'Mekanik Markalar',
  'electrical-brands': 'Elektrik Markalar',
  brand: 'Marka',
  labor: 'Iscilik',
  'labor-firms': 'Iscilik Firmalari',
  admin: 'Yonetim',
  users: 'Kullanicilar',
  packages: 'Paketler',
  settings: 'AI Ayarlari',
  profile: 'Hesabim',
};

export default function Breadcrumb() {
  const pathname = usePathname();

  const segments = pathname
    .replace(/^\/(protected\/)?/, '/')
    .split('/')
    .filter(Boolean);

  // Dashboard'da sadece baslik
  if (segments.length === 1 && segments[0] === 'dashboard') {
    return (
      <div className="text-[13px] font-medium text-foreground">Dashboard</div>
    );
  }

  return (
    <nav className="flex items-center gap-1.5 text-[13px]">
      {/* Her zaman Dashboard root link */}
      <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
        Dashboard
      </Link>
      {segments.map((seg, i) => {
        // dashboard zaten root'ta gosterildi
        if (seg === 'dashboard') return null;
        const isLast = i === segments.length - 1;
        const href = '/' + segments.slice(0, i + 1).join('/');
        // admin/materials icin ozel label
        let label = LABEL_MAP[seg] ?? decodeURIComponent(seg);
        if (seg === 'materials' && i > 0 && segments[i - 1] === 'admin') label = 'Malzeme Yonetimi';

        return (
          <span key={href} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
            {isLast ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : (
              <Link href={href} className="text-muted-foreground hover:text-foreground transition-colors">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
