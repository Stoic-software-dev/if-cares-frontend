'use client';

import { Menu } from 'lucide-react';
import BrandMark from '@/components/shell/BrandMark';
import { cn } from '@/lib/utils';

// Responsive top navigation. Phones get the brand and a menu button; from md
// up it becomes the full navbar with section links and the signed-in user.
export default function AppNavbar({ items = [], active, user }) {
  const initials = user ? `${user.name[0]}${user.lastname[0]}` : '';

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-[54px] max-w-screen-xl items-center justify-between px-3 md:h-[58px] md:px-8">
        <div className="flex items-center gap-8">
          <BrandMark className="px-1 md:px-0" />
          <nav className="hidden h-[58px] items-center gap-0.5 md:flex">
            {items.map((item) => (
              <a
                key={item}
                href={item === 'Dashboard' ? '/dashboard' : '#'}
                className={cn(
                  'flex h-[58px] items-center px-3.5 text-[13px]',
                  item === active
                    ? 'border-b-2 border-primary font-semibold text-primary'
                    : 'font-medium text-slate-500'
                )}
              >
                {item}
              </a>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2.5 md:flex">
          <span className="text-[13px] font-medium text-slate-700">
            {user ? `${user.name} ${user.lastname}` : ''}
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {initials}
          </span>
        </div>

        <button
          type="button"
          aria-label="Menu"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 md:hidden"
        >
          <Menu className="h-[22px] w-[22px]" />
        </button>
      </div>
    </header>
  );
}
