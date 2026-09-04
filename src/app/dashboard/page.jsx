'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Building2, ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react';
import { assignedSiteNames, useAuth } from '@/components/auth/AuthProvider';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import { SiteSwitcher } from '@/components/shell/SiteSwitcher';
import MonthCalendar, { CalendarLegend } from '@/components/dashboard/MonthCalendar';
import { MonthPicker } from '@/components/dashboard/MonthPicker';
import { Button } from '@/components/ui/button';
import { ChipRow } from '@/components/ui/mobile';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { availableMonths, buildMonth, dateLabel, mealsFor, monthMealPattern, todayYmd } from '@/lib/calendar';
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

  const todayCell = month.days?.[Number(today.slice(8, 10))];
  const todayMeals = todayCell ? mealsFor(todayCell.meals).join(', ') : '';

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-4">
        {/* Phone: the three controls are three controls, not one crowded card.
            A site to file for, a month to look at, and what to show - each with
            a target a thumb can hit, in the order they are asked. */}
        <div className="flex flex-col gap-2.5 md:hidden">
          <SiteSwitcher sites={sites} value={selectedSite} onChange={pickSite} />

          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
            <button
              type="button"
              aria-label="Previous month"
              disabled={!hasPrev}
              onClick={() => setCursor(months[index - 1])}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors active:bg-accent disabled:opacity-25"
            >
              <ChevronLeft className="h-[18px] w-[18px]" />
            </button>
            <MonthPicker
              months={months}
              value={current}
              label={month.label}
              onChange={(next) => setCursor(next)}
              className="h-11 flex-1 justify-center"
            />
            <button
              type="button"
              aria-label="Next month"
              disabled={!hasNext}
              onClick={() => setCursor(months[index + 1])}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors active:bg-accent disabled:opacity-25"
            >
              <ChevronRight className="h-[18px] w-[18px]" />
            </button>
          </div>

          <ChipRow
            ariaLabel="Filter days"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All days' },
              { value: 'missing', label: 'Missing', count: stats.missing },
              { value: 'submitted', label: 'Submitted', count: stats.submitted },
            ]}
          />
        </div>

        {/* The reason a phone opens this app at all. It leads with the day
            rather than waiting at the bottom of a scroll, and it names the
            meals, so nobody files a supper count on a snack-only day. */}
        {todayIsOpen && (
          <button
            type="button"
            onClick={submitToday}
            className="flex items-center gap-3 rounded-lg border border-primary-border bg-primary-soft p-3.5 text-left outline-none transition-transform duration-fast active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[14.5px] font-bold text-primary-strong dark:text-primary">
                Submit today&apos;s count
              </span>
              <span className="truncate text-[12.5px] text-primary-strong/75 dark:text-primary/75">
                {dateLabel(today, { weekday: 'long', month: 'long', day: 'numeric' })}
                {todayMeals && ` · ${todayMeals}`}
              </span>
            </span>
            <ArrowRight className="h-[18px] w-[18px] shrink-0 text-primary-strong dark:text-primary" />
          </button>
        )}

        {/* Desktop keeps its one control bar. */}
        <div className="hidden rounded-lg border border-border bg-card p-2 md:flex md:flex-row md:flex-wrap md:items-center md:gap-3">
          <SiteSwitcher
            sites={sites}
            value={selectedSite}
            onChange={pickSite}
            variant="bare"
            className="md:w-auto md:max-w-[22rem]"
          />

          <span className="hidden h-8 w-px shrink-0 bg-border lg:block" />

          <div className="flex items-center gap-1 md:ml-auto lg:ml-0">
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

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:w-full lg:ml-auto lg:w-auto">
            <Segmented
              ariaLabel="Filter days"
              // En tablet los filtros tienen su propia fila: que la ocupen entera,
              // en vez de quedar chicos a la izquierda con media fila vacia.
              className="md:w-full lg:w-auto"
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
          <Button onClick={submitToday} size="touch" className="hidden md:inline-flex xl:hidden">
            Submit today&apos;s count
            <ArrowRight />
          </Button>
        )}

        {/* A key is read after the colours, not before them: on a phone it goes
            under the month it explains, which also puts the calendar itself
            within the first screen. */}
        <CalendarLegend month={month} className="order-last px-0.5 md:order-none" />

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
