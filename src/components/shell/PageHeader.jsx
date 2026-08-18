'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Desktop page header for sub-pages: back link plus title, mirroring the
// Summer app's PageHeader. Phones use MobileHeader instead.
export default function PageHeader({ title, subtitle, backHref = '/dashboard', backLabel = 'Back to Dashboard' }) {
  return (
    <div className="hidden flex-col gap-3 md:flex">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-500 hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-[13px] text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}
