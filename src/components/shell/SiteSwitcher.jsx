'use client';

import { useMemo, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchInput } from '@/components/ui/search-input';
import { shortSiteName, siteInitials, siteState } from '@/lib/sites';
import { cn } from '@/lib/utils';

// Sites are the axis of the whole product and an administrator has dozens of
// them, so the switcher is searchable rather than a native dropdown. With a
// single assigned site it renders as a static label: nothing to switch.
export function SiteSwitcher({ sites, value, onChange, className, align = 'start', variant = 'outline' }) {
  const bare = variant === 'bare';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((name) => name.toLowerCase().includes(q));
  }, [sites, query]);

  const state = siteState(value);

  if (sites.length <= 1) {
    return (
      <div
        className={cn(
          'flex h-12 items-center gap-2.5 rounded-md px-3 md:h-11',
          bare ? 'bg-transparent' : 'border border-border bg-card',
          className
        )}
      >
        <SiteTile name={value} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">
          {shortSiteName(value) || 'No site assigned'}
        </span>
        {state && <Badge variant="neutral" size="sm">{state}</Badge>}
      </div>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-12 w-full items-center gap-2.5 rounded-md px-3 text-left outline-none md:h-11',
            'transition-[background-color,border-color,box-shadow] duration-fast focus-visible:ring-2 focus-visible:ring-ring',
            bare
              ? 'hover:bg-accent'
              : 'border border-input bg-card hover:border-border-strong focus-visible:border-primary focus-visible:shadow-focus-primary',
            className
          )}
        >
          <SiteTile name={value} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-foreground">
              {shortSiteName(value) || 'Select a site'}
            </span>
            <span className="block text-[11.5px] text-muted-foreground">
              {sites.length} sites available
            </span>
          </span>
          {state && (
            <Badge variant="neutral" size="sm" className="hidden sm:inline-flex">
              {state}
            </Badge>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align={align} className="w-[min(24rem,calc(100vw-2rem))] p-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Filter sites" className="mb-1.5 h-10" autoFocus />
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">No site matches.</p>
          )}
          {filtered.map((name) => {
            const active = name === value;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                  setQuery('');
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-left transition-colors',
                  active ? 'bg-accent' : 'hover:bg-accent/60'
                )}
              >
                <SiteTile name={name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-foreground">
                    {shortSiteName(name)}
                  </span>
                  {siteState(name) && (
                    <span className="block text-[11px] text-muted-foreground">{siteState(name)}</span>
                  )}
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SiteTile({ name }) {
  const initials = siteInitials(name);
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-[11px] font-bold text-primary-strong dark:text-primary"
    >
      {initials || <Building2 className="h-4 w-4" />}
    </span>
  );
}
