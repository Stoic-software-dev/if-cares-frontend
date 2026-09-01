'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, CornerDownLeft, Search } from 'lucide-react';
import { assignedSiteNames, isAdmin, useAuth } from '@/components/auth/AuthProvider';
import { accountItemsFor, navItemsFor } from '@/components/shell/nav';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SITES_PATH, cachedGet } from '@/lib/data-cache';
import { shortSiteName } from '@/lib/sites';
import { cn } from '@/lib/utils';

// Keyboard-first jump list. Sections plus every site the user can open, so an
// administrator with 56 sites never hunts through a dropdown.
export function CommandPalette({ open, onOpenChange }) {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [sites, setSites] = useState(null);
  const listRef = useRef(null);

  const ownSites = assignedSiteNames(user);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    if (sites) return;
    if (ownSites) {
      setSites(ownSites);
      return;
    }
    cachedGet(SITES_PATH)
      .then((list) => setSites(list.map((site) => site.name)))
      .catch(() => setSites([]));
  }, [open, sites, ownSites]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const admin = isAdmin(user);
    // The account entries left the bar but not the product, and the palette is
    // where a page you visit twice a year should still be a word away.
    const sections = [...navItemsFor(admin), ...accountItemsFor(admin, user)].map((item) => ({
      id: `nav-${item.key}`,
      group: 'Go to',
      label: item.label,
      icon: item.icon,
      href: item.href,
    }));
    const siteItems = (sites ?? []).map((name) => ({
      id: `site-${name}`,
      group: 'Sites',
      label: shortSiteName(name),
      sublabel: name,
      icon: Building2,
      href: `/dashboard?site=${encodeURIComponent(name)}`,
    }));
    const all = [...sections, ...siteItems];
    if (!q) return all.slice(0, 24);
    return all
      .filter((item) => `${item.label} ${item.sublabel ?? ''}`.toLowerCase().includes(q))
      .slice(0, 24);
  }, [query, sites, user]);

  const go = useCallback(
    (item) => {
      if (!item) return;
      onOpenChange(false);
      router.push(item.href);
    },
    [onOpenChange, router]
  );

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(items[cursor]);
    }
  };

  // Keep the highlighted row in view when arrowing through a long site list.
  useEffect(() => {
    const node = listRef.current?.querySelector('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  let lastGroup = null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="gap-0 p-0 sm:top-[14%] sm:max-w-xl sm:translate-y-0"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Search the app</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            placeholder="Search sections and sites"
            className="h-14 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          <kbd className="hidden rounded-xs border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              Nothing matches “{query.trim()}”.
            </p>
          )}
          {items.map((item, index) => {
            const Icon = item.icon;
            const active = index === cursor;
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {showGroup && (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {item.group}
                  </p>
                )}
                <button
                  type="button"
                  data-active={active}
                  onMouseMove={() => setCursor(index)}
                  onClick={() => go(item)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left outline-none transition-colors',
                    active ? 'bg-accent' : 'hover:bg-accent/60'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{item.label}</span>
                    {item.sublabel && (
                      <span className="block truncate text-[11.5px] text-muted-foreground">{item.sublabel}</span>
                    )}
                  </span>
                  {active && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ArrowRight className="h-3 w-3 rotate-90" />
            <ArrowRight className="h-3 w-3 -rotate-90" />
            to navigate
          </span>
          <span className="flex items-center gap-1.5">
            <CornerDownLeft className="h-3 w-3" />
            to open
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
