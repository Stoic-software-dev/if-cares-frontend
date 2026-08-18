'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, Menu } from 'lucide-react';
import BrandMark from '@/components/shell/BrandMark';

// Top bar for the phone-first staff screens. With a title it renders the
// back-navigation variant; without one it renders the brand variant.
export default function MobileHeader({ title, subtitle }) {
  const router = useRouter();

  return (
    <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
      {title ? (
        <>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-base font-bold tracking-tight text-slate-900">{title}</span>
            {subtitle && <span className="truncate text-xs text-slate-500">{subtitle}</span>}
          </div>
        </>
      ) : (
        <>
          <div className="px-1">
            <BrandMark />
          </div>
          <button
            type="button"
            aria-label="Menu"
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-slate-700"
          >
            <Menu className="h-[22px] w-[22px]" />
          </button>
        </>
      )}
    </header>
  );
}
