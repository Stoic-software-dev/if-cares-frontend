'use client';

import { useRouter } from 'next/navigation';
import { Check, Download, Pencil } from 'lucide-react';
import AppNavbar from '@/components/shell/AppNavbar';
import { STAFF_NAV } from '@/components/shell/nav';
import MobileHeader from '@/components/shell/MobileHeader';
import PageHeader from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MOCK_COUNT_DETAIL, MOCK_SITE, MOCK_USER } from '@/lib/mock-data';

const TOTAL_COLUMNS = [
  { key: 'att', label: 'Att' },
  { key: 'brk', label: 'Brk' },
  { key: 'lun', label: 'Lun' },
  { key: 'snk', label: 'Snk' },
  { key: 'sup', label: 'Sup' },
];

function Mark({ value }) {
  if (!value) return <span className="text-center text-[13px] text-slate-200">·</span>;
  return (
    <span className="flex justify-center">
      <Check className="h-[15px] w-[15px] text-primary" strokeWidth={2.8} />
    </span>
  );
}

export default function CountDetailPage() {
  const router = useRouter();
  // Mock build: every date renders the same submitted-count fixture.
  const count = MOCK_COUNT_DETAIL;

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden md:block">
        <AppNavbar items={STAFF_NAV} active="Dashboard" user={MOCK_USER} />
      </div>
      <div className="md:hidden">
        <MobileHeader title={count.dateLabel} subtitle={MOCK_SITE.name} />
      </div>

      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-8 pt-4 md:max-w-5xl md:px-8 md:pt-7">
        <PageHeader title={count.dateLabel} subtitle={MOCK_SITE.name} />
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <Check className="h-[11px] w-[11px]" strokeWidth={3} />
              Submitted
            </span>
            {count.corrected && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-700">
                <Pencil className="h-[11px] w-[11px]" strokeWidth={2.5} />
                Corrected
              </span>
            )}
            <span className="ml-auto text-[13px] font-semibold tabular-nums text-slate-700">
              {count.timeIn} – {count.timeOut}
            </span>
          </div>
          {count.corrected && (
            <div className="rounded-[10px] bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              <strong className="font-semibold">Corrected by {count.corrected.by}</strong> · {count.corrected.at}
              <br />
              {count.corrected.note}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Totals</span>
          <div className="grid grid-cols-5 rounded-[14px] border border-slate-200 bg-white px-3.5 py-4 tabular-nums">
            {TOTAL_COLUMNS.map((column, index) => {
              const value = count.totals[column.key];
              return (
                <div
                  key={column.key}
                  className={cn('flex flex-col items-center gap-0.5', index > 0 && 'border-l border-slate-100')}
                >
                  <span className={cn('text-2xl font-bold tracking-tight', value === 0 ? 'text-slate-300' : 'text-slate-900')}>
                    {value}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                    {column.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Students · {count.entries.length}
          </span>
          <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white tabular-nums">
            <div className="grid grid-cols-[minmax(0,1fr)_42px_42px_42px_42px] md:grid-cols-[minmax(0,1fr)_64px_64px_64px_64px] border-b border-slate-200 px-3.5 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Name</span>
              <span className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Att</span>
              <span className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Lun</span>
              <span className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Snk</span>
              <span className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Sup</span>
            </div>
            {count.entries.map((entry, index) => (
              <div
                key={entry.id}
                className={cn(
                  'grid grid-cols-[minmax(0,1fr)_42px_42px_42px_42px] md:grid-cols-[minmax(0,1fr)_64px_64px_64px_64px] items-center px-3.5 py-3',
                  index < count.entries.length - 1 && 'border-b border-slate-100',
                  entry.corrected && 'bg-amber-50'
                )}
              >
                <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-slate-900">
                  {entry.name}
                  {entry.corrected && <Pencil className="h-[11px] w-[11px] shrink-0 text-amber-700" strokeWidth={2.5} />}
                </span>
                <Mark value={entry.att} />
                <Mark value={entry.lun} />
                <Mark value={entry.snk} />
                <Mark value={entry.sup} />
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Signature</span>
          <div className="flex flex-col gap-2 rounded-[14px] border border-slate-200 bg-white p-3.5">
            <div className="flex h-20 items-center justify-center">
              <svg width="150" height="48" viewBox="0 0 150 48" fill="none" stroke="#1e293b" strokeWidth="1.6" strokeLinecap="round">
                <path d="M8 34 C 20 10, 30 14, 34 26 C 37 34, 44 36, 50 28 C 58 18, 62 30, 72 30 C 84 30, 88 16, 98 22 C 108 28, 118 34, 142 24" />
              </svg>
            </div>
            <div className="border-t border-slate-100 pt-2 text-[11px] text-slate-400">
              {count.signedBy} · {count.signedAt}
            </div>
          </div>
        </section>

        <div className="flex gap-2.5 md:justify-end">
          <Button variant="outline" className="h-12 flex-1 rounded-[10px] border-slate-300 font-semibold text-slate-700 md:flex-none md:px-6">
            <Download className="h-4 w-4" />
            PDF
          </Button>
          <Button onClick={() => router.push('/meal-count?date=2026-09-08')} className="h-12 flex-[1.6] rounded-[10px] font-semibold md:flex-none md:px-8">
            <Pencil className="h-4 w-4" />
            Edit count
          </Button>
        </div>
        <span className="-mt-2 text-center text-[11px] text-slate-400 md:text-right">
          Editing a submitted count is available to administrators only
        </span>
      </main>
    </div>
  );
}
