'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import AppNavbar from '@/components/shell/AppNavbar';
import { STAFF_NAV } from '@/components/shell/nav';
import MonthCalendar from '@/components/dashboard/MonthCalendar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MOCK_MONTH, MOCK_MONTHS, MOCK_SITE, MOCK_USER } from '@/lib/mock-data';

const LEGEND = [
  { label: 'Submitted', swatch: 'bg-emerald-50 border border-emerald-200' },
  { label: 'Missing', swatch: 'bg-red-50 border border-red-200' },
  { label: 'Today', swatch: 'border-2 border-primary' },
  { label: 'No service', swatch: 'bg-white border border-slate-200' },
];

export default function DashboardPage() {
  const router = useRouter();
  const [monthIndex, setMonthIndex] = useState(MOCK_MONTHS.length - 1);
  const month = MOCK_MONTHS[monthIndex];
  const hasPrev = monthIndex > 0;
  const hasNext = monthIndex < MOCK_MONTHS.length - 1;

  const statuses = Object.values(month.days);
  const submitted = statuses.filter((s) => s === 'submitted').length;
  const missing = statuses.filter((s) => s === 'missing').length;
  const upcoming = statuses.filter((s) => s === 'upcoming' || s === 'today').length;

  const submitToday = () => router.push(`/meal-count?date=${MOCK_MONTH.todayDate}`);

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar items={STAFF_NAV} active="Dashboard" user={MOCK_USER} />

      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-6 pt-5 md:max-w-screen-2xl md:gap-5 md:px-8 md:pt-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-4 md:gap-2">
            <button
              type="button"
              className="flex h-[46px] items-center justify-between rounded-[10px] border border-slate-300 bg-white px-3.5 md:w-96"
            >
              <span className="text-sm font-medium text-slate-900">{MOCK_SITE.name}</span>
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </button>

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
                  onClick={() => setMonthIndex((i) => i - 1)}
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
                  onClick={() => setMonthIndex((i) => i + 1)}
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

          <Button onClick={submitToday} className="hidden h-11 rounded-[10px] px-5 text-sm font-semibold md:inline-flex">
            Submit today&apos;s meal count
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
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

        <MonthCalendar month={month} />

        <div className="flex items-center gap-4 px-0.5">
          {LEGEND.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-3.5 w-3.5 rounded ${item.swatch}`} />
              {item.label}
            </span>
          ))}
        </div>

        <Button onClick={submitToday} className="mt-1 h-[52px] rounded-xl text-[15px] font-semibold md:hidden">
          Submit today&apos;s meal count
          <ArrowRight className="ml-1 h-[18px] w-[18px]" />
        </Button>
      </main>
    </div>
  );
}
