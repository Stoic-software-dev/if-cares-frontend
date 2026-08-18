'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { assignedSiteNames, useAuth } from '@/components/auth/AuthProvider';
import Protected from '@/components/auth/Protected';
import AppNavbar from '@/components/shell/AppNavbar';
import MonthCalendar from '@/components/dashboard/MonthCalendar';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';
import { availableMonths, buildMonth, todayYmd } from '@/lib/calendar';
import { cn } from '@/lib/utils';

const LEGEND = [
  { label: 'Submitted', swatch: 'bg-emerald-50 border border-emerald-200' },
  { label: 'Missing', swatch: 'bg-red-50 border border-red-200' },
  { label: 'Today', swatch: 'border-2 border-primary' },
  { label: 'No service', swatch: 'bg-white border border-slate-200' },
];

const SITE_STORAGE_KEY = 'ifc.selectedSite';

function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [sites, setSites] = useState(null);
  const [selectedSite, setSelectedSite] = useState('');
  const [allMeals, setAllMeals] = useState(null);
  const [error, setError] = useState('');
  const [monthCursor, setMonthCursor] = useState(null);

  const load = () => {
    setError('');
    const ownSites = assignedSiteNames(user);
    const sitesPromise = ownSites
      ? Promise.resolve(ownSites)
      : apiGet('/api/sites').then((list) => list.map((s) => s.name));

    Promise.all([sitesPromise, apiGet('/api/meal-counts/all')])
      .then(([names, meals]) => {
        setSites(names);
        setAllMeals(meals);
        const stored = localStorage.getItem(SITE_STORAGE_KEY);
        setSelectedSite(stored && names.includes(stored) ? stored : names[0] ?? '');
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, [user]);

  const siteData = allMeals?.[selectedSite];
  const today = todayYmd();

  const months = useMemo(
    () => (siteData ? availableMonths(siteData, today) : []),
    [siteData, today]
  );

  const currentMonthIndex = useMemo(() => {
    const [y, m] = today.split('-').map(Number);
    const index = months.findIndex((mo) => mo.year === y && mo.month === m);
    return index === -1 ? months.length - 1 : index;
  }, [months, today]);

  const monthIndex = monthCursor ?? currentMonthIndex;
  const hasPrev = monthIndex > 0;
  const hasNext = monthIndex < months.length - 1;

  const month = useMemo(() => {
    const cursor = months[monthIndex];
    return cursor ? buildMonth(cursor.year, cursor.month, siteData, today) : null;
  }, [months, monthIndex, siteData, today]);

  const pickSite = (name) => {
    setSelectedSite(name);
    setMonthCursor(null);
    localStorage.setItem(SITE_STORAGE_KEY, name);
  };

  const todayIsOpen = Boolean(siteData?.validDates?.[today]);
  const submitToday = () =>
    router.push(`/meal-count?date=${today}&site=${encodeURIComponent(selectedSite)}`);

  const statuses = month ? Object.values(month.days) : [];
  const submitted = statuses.filter((s) => s === 'submitted').length;
  const missing = statuses.filter((s) => s === 'missing').length;
  const upcoming = statuses.filter((s) => s === 'upcoming' || s === 'today').length;

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 pt-24 text-center">
        <AlertCircle className="h-7 w-7 text-red-600" />
        <span className="text-sm font-semibold text-red-700">Couldn&apos;t load the dashboard</span>
        <span className="text-[13px] text-slate-500">{error}</span>
        <Button variant="outline" onClick={load} className="mt-1 h-10 rounded-[9px] border-slate-300 px-5 text-[13px] font-semibold text-slate-700">
          Try again
        </Button>
      </div>
    );
  }

  if (!month) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6 md:max-w-screen-2xl md:px-8">
        <div className="h-[46px] rounded-[10px] bg-slate-200/60 md:w-96" />
        <div className="h-9 w-52 rounded-lg bg-slate-200/60" />
        <div className="h-[420px] rounded-[14px] bg-slate-200/40" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-6 pt-5 md:max-w-screen-2xl md:gap-5 md:px-8 md:pt-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-4 md:gap-2">
          <div className="relative md:w-96">
            <select
              aria-label="Site"
              value={selectedSite}
              onChange={(e) => pickSite(e.target.value)}
              className="h-[46px] w-full appearance-none rounded-[10px] border border-slate-300 bg-white px-3.5 pr-10 text-sm font-medium text-slate-900 outline-none transition-shadow focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            >
              {(sites ?? []).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>

          <div className="flex items-center justify-between md:justify-start md:gap-5">
            <div className="flex flex-col md:flex-row md:items-baseline md:gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight md:text-3xl">
                {month.label}
              </h1>
              <span className="text-[13px] font-medium text-slate-500 md:text-base">{month.year}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Previous month"
                disabled={!hasPrev}
                onClick={() => setMonthCursor(monthIndex - 1)}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-700 transition-colors md:h-9 md:w-9',
                  hasPrev ? 'hover:border-slate-300 hover:bg-slate-50' : 'cursor-default text-slate-300'
                )}
              >
                <ChevronLeft className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                aria-label="Next month"
                disabled={!hasNext}
                onClick={() => setMonthCursor(monthIndex + 1)}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-700 transition-colors md:h-9 md:w-9',
                  hasNext ? 'hover:border-slate-300 hover:bg-slate-50' : 'cursor-default text-slate-300'
                )}
              >
                <ChevronRight className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </div>

        {todayIsOpen && (
          <Button onClick={submitToday} className="hidden h-11 rounded-[10px] px-5 text-sm font-semibold md:inline-flex">
            Submit today&apos;s meal count
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3.5 tabular-nums">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" />
          {submitted} submitted
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-red-700">
          <span className="h-2 w-2 rounded-sm bg-red-500" />
          {missing} missing
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500">
          <span className="h-2 w-2 rounded-sm bg-slate-300" />
          {upcoming} left
        </span>
      </div>

      <MonthCalendar month={month} site={selectedSite} />

      <div className="flex items-center gap-4 px-0.5">
        {LEGEND.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`h-3.5 w-3.5 rounded ${item.swatch}`} />
            {item.label}
          </span>
        ))}
      </div>

      {todayIsOpen && (
        <Button onClick={submitToday} className="mt-1 h-[52px] rounded-xl text-[15px] font-semibold md:hidden">
          Submit today&apos;s meal count
          <ArrowRight className="ml-1 h-[18px] w-[18px]" />
        </Button>
      )}
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Protected>
      <div className="min-h-screen bg-background">
        <AppNavbar active="Dashboard" />
        <DashboardScreen />
      </div>
    </Protected>
  );
}
