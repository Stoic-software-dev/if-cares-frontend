'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Menu } from 'lucide-react';
import BrandMark from '@/components/shell/BrandMark';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Responsive top navigation. Phones get the brand and a menu button; from md
// up it becomes the full navbar with section links and the signed-in user.
export default function AppNavbar({ items = [], active, user }) {
  const router = useRouter();
  const initials = user ? `${user.name[0]}${user.lastname[0]}` : '';

  const logOut = () => router.push('/login');

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-[54px] max-w-screen-2xl items-center justify-between px-3 md:h-[58px] md:px-8">
        <div className="flex items-center gap-8">
          <BrandMark className="px-1 md:px-0" />
          <nav className="hidden h-[58px] items-center gap-0.5 md:flex">
            {items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'flex h-[58px] items-center px-3.5 text-[13px]',
                  item.label === active
                    ? 'border-b-2 border-primary font-semibold text-primary'
                    : 'font-medium text-slate-500'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hidden items-center gap-2.5 rounded-lg px-2 py-1.5 md:flex"
            >
              <span className="text-[13px] font-medium text-slate-700">
                {user ? `${user.name} ${user.lastname}` : ''}
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {initials}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={logOut} className="gap-2 text-[13px] font-medium text-slate-700">
              <LogOut className="h-4 w-4 text-slate-500" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Menu"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 md:hidden"
            >
              <Menu className="h-[22px] w-[22px]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {items.map((item) => (
              <DropdownMenuItem key={item.label} asChild>
                <Link
                  href={item.href}
                  className={cn(
                    'w-full text-[13px]',
                    item.label === active ? 'font-semibold text-primary' : 'font-medium text-slate-700'
                  )}
                >
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logOut} className="gap-2 text-[13px] font-medium text-slate-700">
              <LogOut className="h-4 w-4 text-slate-500" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
