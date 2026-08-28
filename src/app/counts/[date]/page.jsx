'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Ban, Check, Download, MoreVertical, Pencil, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { assignedSiteNames, isAdmin, useAuth } from '@/components/auth/AuthProvider';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiGet, apiPost } from '@/lib/api-client';
import { ALL_MEALS_PATH, invalidate } from '@/lib/data-cache';
import { dateLabel } from '@/lib/calendar';
import { shortSiteName } from '@/lib/sites';
import { cn } from '@/lib/utils';

const COLUMNS = [
  { key: 'att', entry: 'attendance', label: 'Att' },
  { key: 'brk', entry: 'breakfast', label: 'Brk' },
  { key: 'lun', entry: 'lunch', label: 'Lun' },
  { key: 'snk', entry: 'snack', label: 'Snk' },
  { key: 'sup', entry: 'supper', label: 'Sup' },
];

// Canonical "HH:MM:SS" to "h:mm PM"; imported stubs may have no time at all.
function timeLabel(canonical) {
  if (!canonical) return 'Not recorded';
  const [h, m] = canonical.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function stamp(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function CountDetailScreen() {
  const router = useRouter();
  const { date } = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const site = searchParams.get('site') ?? assignedSiteNames(user)?.[0] ?? '';
  const admin = isAdmin(user);

  const [count, setCount] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [query, setQuery] = useState('');
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const load = () => {
    setError('');
    setCount(null);
    apiGet(`/api/meal-counts/detail?site=${encodeURIComponent(site)}&date=${date}`)
      .then((res) => setCount(res.data))
      .catch((err) => setError(err.message));
  };

  useEffect(load, [site, date]);

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/meal-counts/pdf?site=${encodeURIComponent(site)}&date=${date}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'PDF export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MealCount_${site.replace(/[^\w-]+/g, '_')}_${date}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDownloading(false);
    }
  };

  // Voiding is the escape hatch for a count filed on the wrong day or site;
  // corrections cannot undo those. The endpoint is the one planned in
  // docs/V2-BACKEND.md, and the dialog surfaces its answer either way.
  const voidCount = async () => {
    try {
      await apiPost('/api/meal-counts/void', { site, date, reason: voidReason.trim() });
    } catch (err) {
      // Until the endpoint ships, say so in plain words instead of leaking a
      // status code into the dialog.
      if (err.status === 404 || err.status === 405) {
        throw new Error('Voiding is not available in this environment yet. It ships with the corrections module.');
      }
      throw err;
    }
    invalidate(ALL_MEALS_PATH);
  };

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!count) return [];
    if (!q) return count.entries;
    return count.entries.filter(
      (entry) => entry.name.toLowerCase().includes(q) || String(entry.number) === q
    );
  }, [count, query]);

  const title = dateLabel(date);

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={title}
          subtitle={shortSiteName(site)}
          backHref={`/dashboard?site=${encodeURIComponent(site)}`}
          backLabel="Back to dashboard"
          actions={
            count && (
              <>
                <Button variant="outline" onClick={downloadPdf} loading={downloading}>
                  <Download />
                  {downloading ? 'Preparing' : 'Download PDF'}
                </Button>
                {admin && (
                  <>
                    <Button
                      onClick={() =>
                        router.push(`/meal-count?date=${date}&site=${encodeURIComponent(site)}&correct=1`)
                      }
                    >
                      <Pencil />
                      Correct count
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="More actions">
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          destructive
                          onClick={() => {
                            setVoidReason('');
                            setVoidOpen(true);
                          }}
                        >
                          <Ban />
                          Void count
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </>
            )
          }
        />

        {error && <ErrorState title="Couldn't load this count" message={error} onRetry={load} />}

        {!count && !error && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-96 w-full rounded-lg" />
          </div>
        )}

        {count && (
          <>
            <section className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
              <Badge variant="success" size="lg">
                <Check strokeWidth={3} />
                Submitted
              </Badge>
              {count.source === 'GAS_IMPORT' && <Badge size="lg">Imported</Badge>}
              {count.corrected && (
                <Badge variant="warning" size="lg">
                  <Pencil />
                  Corrected
                </Badge>
              )}
              <span className="ml-auto text-[13px] font-semibold tabular-nums text-foreground">
                {timeLabel(count.timeIn)} to {timeLabel(count.timeOut)}
              </span>
              {count.submittedBy && count.submittedBy !== 'gas-import' && (
                <span className="w-full text-[12px] text-muted-foreground">
                  Submitted by {count.submittedBy}
                </span>
              )}
            </section>

            {count.corrected && (
              <section className="flex flex-col gap-2 rounded-lg border border-warning-border bg-warning-soft p-4">
                <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-warning-text">
                  Correction history
                </span>
                <ol className="flex flex-col gap-2.5">
                  {count.corrections.map((correction, index) => (
                    <li key={`${correction.at}-${index}`} className="flex flex-col gap-0.5 text-[13px] text-warning-text">
                      <span className="font-semibold">
                        {correction.by}, {stamp(correction.at)}
                      </span>
                      {correction.note && <span className="leading-relaxed opacity-90">{correction.note}</span>}
                    </li>
                  ))}
                </ol>
                <span className="text-[12px] text-warning-text/80">
                  The values submitted originally are kept on record and never overwritten.
                </span>
              </section>
            )}

            <section className="flex flex-col gap-2.5">
              <SectionLabel>Totals</SectionLabel>
              <div className="grid grid-cols-5 divide-x divide-border overflow-hidden rounded-lg border border-border bg-card">
                {COLUMNS.map((column) => {
                  const value = count.totals[column.key];
                  return (
                    <div key={column.key} className="flex flex-col items-center gap-0.5 px-2 py-4">
                      <span
                        className={cn(
                          'text-[26px] font-bold leading-none tabular-nums tracking-tight',
                          value === 0 ? 'text-muted-foreground/40' : 'text-foreground'
                        )}
                      >
                        {value}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        {column.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>{count.entries.length} students</SectionLabel>
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Find a student"
                  className="w-full sm:w-64"
                />
              </div>

              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="grid grid-cols-[minmax(0,1fr)_repeat(5,40px)] border-b border-border bg-surface-sunken px-3.5 py-2 md:grid-cols-[minmax(0,1fr)_repeat(5,64px)]">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Name
                  </span>
                  {COLUMNS.map((column) => (
                    <span
                      key={column.key}
                      className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                    >
                      {column.label}
                    </span>
                  ))}
                </div>

                <div className="divide-y divide-border">
                  {entries.map((entry) => (
                    <div
                      key={`${entry.number}-${entry.name}`}
                      className="grid grid-cols-[minmax(0,1fr)_repeat(5,40px)] items-center px-3.5 py-2.5 transition-colors hover:bg-accent/40 md:grid-cols-[minmax(0,1fr)_repeat(5,64px)]"
                    >
                      <span className="flex min-w-0 items-baseline gap-2 pr-2">
                        <span className="w-6 shrink-0 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
                          {entry.number}
                        </span>
                        <span className="truncate text-[13px] font-medium text-foreground">{entry.name}</span>
                      </span>
                      {COLUMNS.map((column) => (
                        <Mark key={column.key} value={entry[column.entry]} />
                      ))}
                    </div>
                  ))}
                </div>

                {entries.length === 0 && (
                  <EmptyState
                    title="No student matches"
                    description={`Nothing in this count matches “${query.trim()}”.`}
                    action={
                      <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                        Clear search
                      </Button>
                    }
                  />
                )}
              </div>
            </section>

            <section className="flex flex-col gap-2.5">
              <SectionLabel>Signature</SectionLabel>
              <div className="flex min-h-[7rem] items-center justify-center rounded-lg border border-border bg-card p-4">
                {count.signature ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={count.signature}
                    alt="Staff signature"
                    className="max-h-28 rounded-sm bg-white px-3 py-1"
                  />
                ) : (
                  <span className="text-[12.5px] text-muted-foreground">
                    Signed in the previous system; the image stays in its archive.
                  </span>
                )}
              </div>
            </section>

            {admin && (
              <p className="text-[12px] text-muted-foreground">
                Corrections keep the original values on record. Voiding removes the count from the dashboard and
                every report, and is meant for a count filed on the wrong day or site.
              </p>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title="Void this meal count?"
        description={`${title} at ${shortSiteName(site)} goes back to being an open service day.`}
        consequences={[
          'The day shows as missing on the dashboard again.',
          'The count leaves the daily, monthly and consolidated reports.',
          'Nothing is deleted: the submission stays on record for audit.',
        ]}
        confirmLabel="Void count"
        successTitle="Count voided"
        successDescription="The service day is open again and the count no longer counts toward reports."
        onConfirm={voidCount}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="void-reason" className="text-[13px] font-medium text-foreground">
            Reason
          </label>
          <Input
            id="void-reason"
            value={voidReason}
            onChange={(event) => setVoidReason(event.target.value)}
            placeholder="Filed on the wrong site, duplicate, ..."
            maxLength={300}
          />
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            Recorded with your name and the time of the change.
          </span>
        </div>
      </ConfirmDialog>
    </AppShell>
  );
}

function SectionLabel({ children }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </span>
  );
}

function Mark({ value }) {
  // An empty cell reads faster than a filler glyph: the checks are what the eye
  // is scanning for.
  if (!value) {
    return (
      <span className="flex justify-center">
        <span className="sr-only">No</span>
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-muted-foreground/25" />
      </span>
    );
  }
  return (
    <span className="flex justify-center" aria-label="Yes">
      <Check className="h-[15px] w-[15px] text-primary" strokeWidth={3} />
    </span>
  );
}

export default function CountDetailPage() {
  return (
    <Protected>
      <Suspense fallback={null}>
        <CountDetailScreen />
      </Suspense>
    </Protected>
  );
}
