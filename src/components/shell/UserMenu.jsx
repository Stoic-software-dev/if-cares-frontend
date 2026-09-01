'use client';

import Link from 'next/link';
import { ChevronDown, LogOut, ShieldCheck } from 'lucide-react';
import { isAdmin, useAuth } from '@/components/auth/AuthProvider';
import { accountItemsFor } from '@/components/shell/nav';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { canSeeMonitoring } from '@/lib/monitoring-access';
import { cn } from '@/lib/utils';

export function initialsOf(user) {
  if (!user) return '';
  const initials = `${user.name?.[0] ?? ''}${user.lastname?.[0] ?? ''}`.trim();
  // Imported accounts can carry an email and no name; the avatar still needs
  // to say something.
  return (initials || user.email?.[0] || '?').toUpperCase();
}

export function Avatar({ user, className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold tracking-wide text-primary-foreground',
        className
      )}
    >
      {initialsOf(user)}
    </span>
  );
}

export function UserMenu() {
  const { user, logOut } = useAuth();
  if (!user) return null;

  const fullName = `${user.name} ${user.lastname}`.trim();
  const admin = isAdmin(user);
  const accountItems = accountItemsFor(admin, user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md py-1 pl-1 pr-1.5 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:pl-2"
        >
          <Avatar user={user} />
          <span className="hidden max-w-[9rem] truncate text-[13px] font-semibold text-foreground lg:block">
            {fullName}
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground lg:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <div className="flex items-center gap-2.5 px-1 pb-2 pt-1">
          <Avatar user={user} className="h-9 w-9 text-xs" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold text-foreground">{fullName}</span>
            <span className="truncate text-[12px] text-muted-foreground">{user.email}</span>
          </div>
        </div>

        {admin && (
          <div className="flex items-center gap-1.5 rounded-sm bg-primary-soft px-2 py-1.5 text-[11.5px] font-semibold text-primary-strong dark:text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Administrator
          </div>
        )}

        {accountItems.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {accountItems.map(({ key, label, href, icon: Icon }) => (
              <DropdownMenuItem key={key} asChild>
                <Link href={href}>
                  <Icon />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />

        <div className="flex items-center justify-between gap-2 px-1 py-1.5">
          <span className="text-[13px] font-medium text-foreground">Theme</span>
          <ThemeToggle />
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={logOut} destructive>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
