'use client';

import Link from 'next/link';
import { Database, BookOpen } from 'lucide-react';

const ITEMS = [
  {
    href: '/materials',
    icon: Database,
    title: 'Malzeme Havuzu',
    desc: 'Marka fiyat listeleri',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  {
    href: '/library',
    icon: BookOpen,
    title: 'Kutuphanem',
    desc: 'Markalar, iskontolar, iscilik',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
];

export default function QuickAccess() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3.5 rounded-xl border bg-card px-5 py-4 transition-all hover:border-blue-300 hover:-translate-y-0.5 hover:shadow-sm"
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.iconBg}`}>
              <Icon className={`h-[18px] w-[18px] ${item.iconColor}`} />
            </div>
            <div>
              <p className="text-[13px] font-semibold">{item.title}</p>
              <p className="text-[11px] text-muted-foreground">{item.desc}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
