'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { AlertCircle, Check, Download } from 'lucide-react';
import { assignedSiteNames, useAuth } from '@/components/auth/AuthProvider';
import Protected from '@/components/auth/Protected';
import AppNavbar from '@/components/shell/AppNavbar';
import MobileHeader from '@/components/shell/MobileHeader';
import PageHeader from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const TOTAL_COLUMNS = [
  { key: 'att', label: 'Att' },
  { key: 'brk', label: 'Brk' },
  { key: 'lun', label: 'Lun' },
  { key: 'snk', label: 'Snk' },
  { key: 'sup', label: 'Sup' },
];

function dateLabel(ymd) {
  const parsed = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? ymd
    : parsed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Canonical "HH:MM:SS" → "h:mm PM"; imported stubs may have no time at all.
function timeLabel(canonical) {
  if (!canonical) return '—';
  const [h, m] = canonical.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function Mark({ value }) {
  if (!value) return <span className="text-center text-[13px] text-slate-200">·</span>;
  return (
    <span className="flex justify-center">
      <Check className="h-[15px] w-[15px] text-primary" strokeWidth={2.8} />
    </span>
  );
}

function CountDetailScreen() {
  const { date } = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const site = searchParams.get('site') ?? assignedSiteNames(user)?.[0] ?? '';

  const [count, setCount] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    setCount(null);
    apiGet(`/api/meal-counts/detail?site=${encodeURIComponent(site)}&date=${date}`)
      .then((res) => setCount(res.data))
      .catch((err) => setError(err.message));
  };

  useEffect(load, [site, date]);

  const title = dateLabel(date);

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden md:block">
        <AppNavbar active="Dashboard" />
      </div>
      <div className="md:hidden">
        <MobileHeader title={title} subtitle={site} />
      </div>

      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-8 pt-4 md:max-w-5xl md:px-8 md:pt-7">
        <PageHeader title={title} subtitle={site} />

        {error && (
          <div className="flex flex-col items-center gap-2 rounded-[14px] border border-red-200 bg-white px-4 py-12">
            <AlertCircle className="h-6 w-6 text-red-600" />
            <span className="text-[13px] font-semibold text-red-700">{error}</span>
            <Button variant="outline" onClick={load} className="mt-1 h-9 rounded-lg border-slate-300 px-4 text-xs font-semibold text-slate-700">
              Try again
            </Button>
          </div>
        )}

        {!count && !error && (
          <div className="flex flex-col gap-4">
            <div className="h-16 rounded-[14px] bg-slate-200/50" />
            <div className="h-24 rounded-[14px] bg-slate-200/50" />
            <div className="h-72 rounded-[14px] bg-slate-200/40" />
          </div>
        )}

        {count && (
          <>
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <Check className="h-[11px] w-[11px]" strokeWidth={3} />
                  Submitted
                </span>
                {count.source === 'GAS_IMPORT' && (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                    Imported
                  </span>
                )}
                <span className="ml-auto text-[13px] font-semibold tabular-nums text-slate-700">
                  {timeLabel(count.timeIn)} – {timeLabel(count.timeOut)}
                </span>
              </div>
              {count.submittedBy && count.submittedBy !== 'gas-import' && (
                <span className="text-xs text-slate-400">Submitted by {count.submittedBy}</span>
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
                <div className="grid grid-cols-[minmax(0,1fr)_38px_38px_38px_38px_38px] border-b border-slate-200 px-3.5 py-2.5 md:grid-cols-[minmax(0,1fr)_64px_64px_64px_64px_64px]">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Name</span>
                  {TOTAL_COLUMNS.map((c) => (
                    <span key={c.key} className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                      {c.label}
                    </span>
                  ))}
                </div>
                {count.entries.map((entry, index) => (
                  <div
                    key={`${entry.number}-${entry.name}`}
                    className={cn(
                      'grid grid-cols-[minmax(0,1fr)_38px_38px_38px_38px_38px] items-center px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_64px_64px_64px_64px_64px]',
                      index < count.entries.length - 1 && 'border-b border-slate-100'
                    )}
                  >
                    <span className="truncate pr-2 text-[13px] font-medium text-slate-900">
                      {entry.number} · {entry.name}
                    </span>
                    <Mark value={entry.attendance} />
                    <Mark value={entry.breakfast} />
                    <Mark value={entry.lunch} />
                    <Mark value={entry.snack} />
                    <Mark value={entry.supper} />
                  </div>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Signature</span>
              <div className="flex flex-col gap-2 rounded-[14px] border border-slate-200 bg-white p-3.5">
                {count.signature ? (
                  <div className="flex h-24 items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={count.signature} alt="Staff signature" className="max-h-24" />
                  </div>
                ) : (
                  <div className="flex h-16 items-center justify-center text-xs text-slate-400">
                    Signature stored in the previous system
                  </div>
                )}
              </div>
            </section>

            <div className="flex gap-2.5 md:justify-end">
              <Button variant="outline" className="h-12 flex-1 rounded-[10px] border-slate-300 font-semibold text-slate-700 md:flex-none md:px-6">
                <Download className="h-4 w-4" />
                PDF
              </Button>
            </div>
            <span className="-mt-2 text-center text-[11px] text-slate-400 md:text-right">
              PDF export and admin corrections arrive with the next build phase
            </span>
          </>
        )}
      </main>
    </div>
  );
}

export default function CountDetailPage() {
  return (
    <Protected>
      <Suspense>
        <CountDetailScreen />
      </Suspense>
    </Protected>
  );
}
