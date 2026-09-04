'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, MoreHorizontal, Search } from 'lucide-react';
import { isAdmin, useAuth } from '@/components/auth/AuthProvider';
import BrandMark from '@/components/shell/BrandMark';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { Avatar, UserMenu } from '@/components/shell/UserMenu';
import { accountItemsFor, activeKeyForPath, navItemsFor } from '@/components/shell/nav';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ALL_MEALS_PATH, SITES_PATH, cachedGet } from '@/lib/data-cache';
import { useHotkey } from '@/lib/hooks';
import { useShortcutLabel } from '@/lib/platform';
import { cn } from '@/lib/utils';

const WIDTHS = {
  default: 'max-w-screen-xl',
  wide: 'max-w-screen-2xl',
  narrow: 'max-w-3xl',
};

// The frame every signed-in screen renders inside: one desktop bar, one phone
// bar, and a bottom tab strip within thumb reach on phones.
//
// `focus` is for a screen that is a task rather than a place - taking a meal
// count is the one. On a phone it drops the tab strip, because the screen
// already carries its own bar at the bottom and two stacked bars took a fifth
// of the display to say nothing. The way out is the back link at the top, the
// same as any other form you are in the middle of.
export default function AppShell({ children, width = 'default', className, focus = false }) {
  const pathname = usePathname();
  const { user, logOut } = useAuth();
  const admin = isAdmin(user);
  const items = navItemsFor(admin);
  const activeKey = activeKeyForPath(pathname);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), []);
  useHotkey('k', togglePalette);
  const shortcut = useShortcutLabel('K');

  // Warm the two reads every section needs while the user is still looking at
  // the first screen, so moving between tabs paints from cache.
  useEffect(() => {
    if (!user) return;
    cachedGet(SITES_PATH).catch(() => {});
    cachedGet(ALL_MEALS_PATH).catch(() => {});
  }, [user]);

  // Reminder emails and Client errors live under the profile on a desk. The
  // phone sheet is the same menu, so they belong in it too: without them the
  // only way to either one from a phone was to know its name and type it into
  // the command palette.
  const accountItems = accountItemsFor(admin, user);

  const inlineItems = items.filter((item) => item.primary);
  const overflowItems = items.filter((item) => !item.primary);
  const bottomItems = items.filter((item) => item.primary).slice(0, 4);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Desktop bar */}
      <header className="sticky top-0 z-40 hidden border-b glass-bar md:block">
        <div className={cn('mx-auto flex h-[60px] items-center gap-6 px-6 lg:px-8', WIDTHS.wide)}>
          <Link
            href="/dashboard"
            aria-label="IF Cares, go to dashboard"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark />
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main">
            {inlineItems.map((item) => (
              <NavLink key={item.key} item={item} active={item.key === activeKey} />
            ))}
            {overflowItems.length > 0 && (
              <>
                <span className="hidden xl:contents">
                  {overflowItems.map((item) => (
                    <NavLink key={item.key} item={item} active={item.key === activeKey} />
                  ))}
                </span>
                <div className="xl:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          'flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold outline-none transition-colors',
                          overflowItems.some((item) => item.key === activeKey)
                            ? 'bg-primary-soft text-primary-strong dark:text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        More
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      {overflowItems.map((item) => (
                        <DropdownMenuItem key={item.key} asChild>
                          <Link href={item.href} className={cn(item.key === activeKey && 'text-primary')}>
                            <item.icon />
                            {item.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={togglePalette}
              className="flex h-9 items-center gap-2 rounded-md border border-border bg-card pl-2.5 pr-1.5 text-[13px] text-muted-foreground outline-none transition-colors hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search className="h-4 w-4" />
              <span className="hidden lg:inline">Search</span>
              <kbd className="hidden rounded-xs border border-border px-1.5 py-0.5 font-sans text-[10px] font-semibold lg:inline">
                {shortcut}
              </kbd>
            </button>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Phone bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-3 glass-bar md:hidden">
        <Link href="/dashboard" aria-label="IF Cares, go to dashboard" className="rounded-md px-1">
          <BrandMark />
        </Link>
        <button
          type="button"
          onClick={togglePalette}
          aria-label="Search"
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors active:bg-accent"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="Account and settings"
          className="flex h-10 w-10 items-center justify-center rounded-md"
        >
          <Avatar user={user} />
        </button>
      </header>

      {/* `pb-32` on a phone is the tab bar plus the floating action that sits
          above it: without the second allowance the last row of every list is
          under a button. A focus screen has neither, and supplies its own. */}
      <main
        className={cn(
          'mx-auto w-full flex-1 px-4 pt-4 md:px-6 md:pb-12 md:pt-7 lg:px-8',
          focus ? 'pb-6' : 'pb-32',
          WIDTHS[width],
          className
        )}
      >
        {children}
      </main>

      {/* Phone tab bar */}
      <nav
        aria-label="Sections"
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t px-1 pb-safe glass-bar md:hidden',
          focus && 'hidden'
        )}
      >
        <div className="flex items-stretch">
          {bottomItems.map((item) => {
            const active = item.key === activeKey;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex flex-1 flex-col items-center gap-1 px-1 py-2.5 outline-none"
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-fast',
                    active ? 'bg-primary-soft text-primary-strong dark:text-primary' : 'text-muted-foreground'
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className={cn(
                    'text-[10.5px] font-semibold',
                    active ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
          {overflowItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex flex-1 flex-col items-center gap-1 px-1 py-2.5 outline-none"
            >
              <span
                className={cn(
                  'flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-fast',
                  overflowItems.some((item) => item.key === activeKey)
                    ? 'bg-primary-soft text-primary-strong dark:text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[10.5px] font-semibold text-muted-foreground">More</span>
            </button>
          )}
        </div>
      </nav>

      {/* Phone: account, remaining sections, theme */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="gap-4">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2.5">
              <Avatar user={user} className="h-9 w-9" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{user ? `${user.name} ${user.lastname}` : ''}</span>
                <span className="truncate text-[12px] font-normal text-muted-foreground">{user?.email}</span>
              </span>
            </SheetTitle>
          </SheetHeader>

          {overflowItems.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {overflowItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md border border-border px-3 py-3 text-[13px] font-semibold transition-colors active:bg-accent',
                    item.key === activeKey ? 'bg-primary-soft text-primary-strong dark:text-primary' : 'text-foreground'
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] text-muted-foreground" />
                  {item.label}
                </Link>
              ))}
            </div>
          )}

          {accountItems.length > 0 && (
            <div className="flex flex-col">
              {accountItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex min-h-[52px] items-center gap-3 rounded-md px-3 text-[13.5px] font-semibold transition-colors active:bg-accent',
                    item.key === activeKey ? 'text-primary-strong dark:text-primary' : 'text-foreground'
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] text-muted-foreground" />
                  {item.label}
                </Link>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <span className="text-[13px] font-medium text-foreground">Theme</span>
            <ThemeToggle />
          </div>

          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              logOut();
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-md bg-destructive-soft text-[13px] font-semibold text-destructive-text transition-colors active:brightness-95"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </SheetContent>
      </Sheet>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function NavLink({ item, active }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-2 rounded-md px-3 text-[13px] font-semibold outline-none transition-colors duration-fast',
        'focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary-soft text-primary-strong dark:text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {item.label}
    </Link>
  );
}
