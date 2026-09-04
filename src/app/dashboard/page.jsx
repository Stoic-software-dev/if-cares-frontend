'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { assignedSiteNames, useAuth } from '@/components/auth/AuthProvider';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import { SiteSwitcher } from '@/components/shell/SiteSwitcher';
import MonthCalendar, { CalendarLegend } from '@/components/dashboard/MonthCalendar';
import { MonthPicker } from '@/components/dashboard/MonthPicker';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { availableMonths, buildMonth, monthMealPattern, todayYmd } from '@/lib/calendar';
import { ALL_MEALS_PATH, SITES_PATH, useCachedGet } from '@/lib/data-cache';
import { useStoredState } from '@/lib/hooks';
import { sortSiteNames } from '@/lib/sites';

const SITE_STORAGE_KEY = 'ifc.selectedSite';

function DashboardScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const siteFromUrl = searchParams.get('site');
  const { user } = useAuth();

  const ownSites = assignedSiteNames(user);
  // Staff already carry their sites in the session; only admins need the list.
  const siteList = useCachedGet(SITES_PATH, { enabled: !ownSites });
  const meals = useCachedGet(ALL_MEALS_PATH);

  const [selectedSite, setSelectedSite] = useState('');
  const [storedSite, setStoredSite, storedSiteReady] = useStoredState(SITE_STORAGE_KEY, '');
  const [cursor, setCursor] = useState(null);
  const [filter, setFilter] = useState('all');

  const today = todayYmd();

  const sites = useMemo(() => {
    if (ownSites) return sortSiteNames(ownSites);
    if (!siteList.data) return null;
    return sortSiteNames(siteList.data.map((site) => site.name));
  }, [ownSites, siteList.data]);

  // The site comes from the URL first (shared links, the command palette),
  // then from the last one this browser used, then from the first assigned.
  useEffect(() => {
    // Waits for localStorage to be read, otherwise the first pass would pick
    // the alphabetical default and the remembered site would never win.
    if (!sites || sites.length === 0 || !storedSiteReady) return;
    setSelectedSite((current) => {
      if (current && sites.includes(current)) return current;
      if (siteFromUrl && sites.includes(siteFromUrl)) return siteFromUrl;
      if (storedSite && sites.includes(storedSite)) return storedSite;
      return sites[0];
    });
  }, [sites, siteFromUrl, storedSite, storedSiteReady]);

  const siteData = meals.data?.[selectedSite];
  const months = useMemo(() => (siteData ? availableMonths(siteData, today) : []), [siteData, today]);

  const current = useMemo(() => {
    if (months.length === 0) return null;
    if (cursor && months.some((m) => m.year === cursor.year && m.month === cursor.month)) return cursor;
    const [y, m] = today.split('-').map(Number);
    const hasCurrent = months.some((month) => month.year === y && month.month === m);
    return hasCurrent ? { year: y, month: m } : months[months.length - 1];
  }, [months, cursor, today]);

  const index = current ? months.findIndex((m) => m.year === current.year && m.month === current.month) : -1;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < months.length - 1;

  const month = useMemo(
    () =>
      current && siteData
        ? buildMonth(current.year, current.month, siteData, today, siteData.holidays ?? {})
        : null,
    [current, siteData, today]
  );

  const pickSite = (name) => {
    setSelectedSite(name);
    setStoredSite(name);
    setCursor(null);
    setFilter('all');
  };

  const error = meals.error || siteList.error;
  const todayIsOpen = Boolean(siteData?.validDates?.[today]);
  const submitToday = () =>
    router.push(`/meal-count?date=${today}&site=${encodeURIComponent(selectedSite)}`);

  if (error) {
    return (
      <AppShell width="wide">
        <ErrorState
          title="Couldn't load the dashboard"
          message={error}
          onRetry={() => {
            meals.refresh();
            siteList.refresh();
          }}
        />
      </AppShell>
    );
  }

  // An account with no site assigned would otherwise sit on a skeleton for
  // ever: say what is wrong and who fixes it.
  if (sites && sites.length === 0) {
    return (
      <AppShell width="wide">
        <div className="rounded-lg border border-dashed border-border-strong bg-card">
          <EmptyState
            icon={Building2}
            title="No site is assigned to your account"
            description="An administrator assigns the sites you work at. Until then there is no calendar to show."
          />
        </div>
      </AppShell>
    );
  }

  if (!month || !sites) {
    return (
      <AppShell width="wide">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[68px] w-full rounded-lg" />
          <Skeleton className="h-[420px] w-full rounded-lg" />
        </div>
      </AppShell>
    );
  }

  const { stats } = month;

  // The month's usual meal shape. Nothing on the page says it out loud any more;
  // it is here so a day that breaks it can be the only one that names its meals.
  const mealPattern = monthMealPattern(month);

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-4">
        {/* One control bar: which site, which month, what to show. */}
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
          <SiteSwitcher
            sites={sites}
            value={selectedSite}
            onChange={pickSite}
            variant="bare"
            className="md:w-[21rem]"
          />

          <span className="hidden h-8 w-px shrink-0 bg-border lg:block" />

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              disabled={!hasPrev}
              onClick={() => setCursor(months[index - 1])}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <MonthPicker
              compact
              months={months}
              value={current}
              label={month.label}
              onChange={(next) => setCursor(next)}
            />
            <button
              type="button"
              aria-label="Next month"
              disabled={!hasNext}
              onClick={() => setCursor(months[index + 1])}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:ml-auto">
            <Segmented
              ariaLabel="Filter days"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All days' },
                { value: 'missing', label: 'Missing', count: stats.missing },
                { value: 'submitted', label: 'Submitted', count: stats.submitted },
              ]}
            />
            {todayIsOpen && (
              <Button onClick={submitToday} className="hidden xl:inline-flex">
                Submit today&apos;s count
                <ArrowRight />
              </Button>
            )}
          </div>
        </div>

        {todayIsOpen && (
          <Button onClick={submitToday} size="touch" className="xl:hidden">
            Submit today&apos;s count
            <ArrowRight />
          </Button>
        )}

        <CalendarLegend month={month} className="px-0.5" />

        <MonthCalendar month={month} site={selectedSite} filter={filter} mealPattern={mealPattern} />
      </div>
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <Protected>
      <Suspense fallback={null}>
        <DashboardScreen />
      </Suspense>
    </Protected>
  );
}
