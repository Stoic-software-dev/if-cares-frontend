'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronRight, CircleAlert, CircleCheck } from 'lucide-react';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/field';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ALL_MEALS_PATH, SITES_PATH, useCachedGet } from '@/lib/data-cache';
import { todayYmd } from '@/lib/calendar';
import { shortSiteName, siteInitials, siteState, sortSiteNames } from '@/lib/sites';
import { cn } from '@/lib/utils';

// Per-site health for the current month, read from the same source the
// dashboard uses, so the two screens can never disagree.
function monthStats(siteData, monthPrefix, today) {
  const submitted = (siteData?.excludedDates ?? []).filter((ymd) => ymd.startsWith(monthPrefix)).length;
  let missing = 0;
  let upcoming = 0;
  for (const ymd of Object.keys(siteData?.validDates ?? {})) {
    if (!ymd.startsWith(monthPrefix)) continue;
    if (ymd < today) missing += 1;
    else upcoming += 1;
  }
  return { submitted, missing, upcoming, service: submitted + missing + upcoming };
}

function AdminSitesScreen() {
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [sort, setSort] = useState('name');

  const today = todayYmd();
  const monthPrefix = today.slice(0, 7);

  const siteList = useCachedGet(SITES_PATH);
  const mealList = useCachedGet(ALL_MEALS_PATH);

  const sites = useMemo(
    () => (siteList.data ? sortSiteNames(siteList.data.map((site) => site.name)) : null),
    [siteList.data]
  );
  const allMeals = mealList.data;
  const error = siteList.error || mealList.error;

  const load = () => {
    siteList.refresh();
    mealList.refresh();
  };

  const rows = useMemo(() => {
    if (!sites) return [];
    const q = query.trim().toLowerCase();
    const mapped = sites
      .filter((name) => (stateFilter === 'ALL' ? true : siteState(name) === stateFilter))
      .filter((name) => (q ? name.toLowerCase().includes(q) : true))
      .map((name) => ({ name, stats: monthStats(allMeals?.[name], monthPrefix, today) }));

    if (sort === 'missing') mapped.sort((a, b) => b.stats.missing - a.stats.missing);
    return mapped;
  }, [sites, allMeals, query, stateFilter, sort, monthPrefix, today]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          missing: acc.missing + row.stats.missing,
          submitted: acc.submitted + row.stats.submitted,
        }),
        { missing: 0, submitted: 0 }
      ),
    [rows]
  );

  const states = useMemo(() => [...new Set((sites ?? []).map(siteState).filter(Boolean))].sort(), [sites]);

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Sites"
          subtitle={
            sites
              ? `${sites.length} active sites, ${totals.submitted} counts submitted and ${totals.missing} missing this month`
              : 'Loading sites'
          }
        />

        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search sites" className="lg:w-96" />
          {states.length > 1 && (
            <NativeSelect
              aria-label="Filter by state"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
              className="lg:w-44"
            >
              <option value="ALL">Every state</option>
              {states.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </NativeSelect>
          )}
          <NativeSelect
            aria-label="Sort sites"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="lg:ml-auto lg:w-56"
          >
            <option value="name">Sort by name</option>
            <option value="missing">Sort by missing counts</option>
          </NativeSelect>
        </div>

        {error && <ErrorState title="Couldn't load the sites" message={error} onRetry={load} />}

        {!sites && !error && (
          <div className="grid gap-2 md:grid-cols-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-[84px] rounded-lg" />
            ))}
          </div>
        )}

        {sites && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-strong bg-card">
            <EmptyState
              icon={Building2}
              title="No site matches"
              description="Try a different name, or clear the filters."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setStateFilter('ALL');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </div>
        )}

        {rows.length > 0 && (
          <div className="stagger grid grid-cols-1 gap-2 md:grid-cols-2" style={{ '--stagger-step': '20ms' }}>
            {rows.map((row, index) => (
              <Link
                key={row.name}
                href={`/admin/sites/detail?site=${encodeURIComponent(row.name)}`}
                style={{ '--stagger-i': Math.min(index, 14) }}
                className={cn(
                  'group flex items-center gap-3.5 rounded-lg border border-border bg-card p-4 outline-none',
                  'transition-[border-color,transform] duration-fast hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.995]'
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-[12px] font-bold text-primary-strong dark:text-primary">
                  {siteInitials(row.name) || <Building2 className="h-4 w-4" />}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-foreground">
                      {shortSiteName(row.name)}
                    </span>
                    {siteState(row.name) && (
                      <Badge size="sm" variant="neutral">
                        {siteState(row.name)}
                      </Badge>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CircleCheck className="h-3.5 w-3.5 text-success" />
                      {row.stats.submitted} submitted
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1',
                        row.stats.missing > 0 && 'font-semibold text-destructive-text'
                      )}
                    >
                      <CircleAlert
                        className={cn('h-3.5 w-3.5', row.stats.missing > 0 ? 'text-destructive' : 'text-muted-foreground/60')}
                      />
                      {row.stats.missing} missing
                    </span>
                    <span className="hidden sm:inline">{row.stats.service} service days this month</span>
                  </span>
                </span>

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-fast group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function AdminSitesPage() {
  return (
    <Protected adminOnly>
      <AdminSitesScreen />
    </Protected>
  );
}
