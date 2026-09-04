'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Ban, BadgeCheck, Check, Download, History, MoreVertical, Pencil, RotateCcw, Send, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { assignedSiteNames, isAdmin, useAuth } from '@/components/auth/AuthProvider';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ActionSheet, Fab, SheetAction } from '@/components/ui/mobile';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiGet, apiPost, apiPut } from '@/lib/api-client';
import { ALL_MEALS_PATH, invalidate } from '@/lib/data-cache';
import EmailPdfDialog from '@/components/reports/EmailPdfDialog';
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [voided, setVoided] = useState(false);
  const [approving, setApproving] = useState(false);

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

  // Approving is the administrator signing off on the day. It locks correction,
  // mails the site a copy of what was approved, and files that copy in Drive.
  const approve = async () => {
    setApproving(true);
    try {
      const res = await apiPost('/api/meal-counts/approve', { site, date });
      setCount((prev) => ({ ...prev, approved: res.data }));
      if (res.data.notified) {
        toast.success(
          `Approved. ${res.data.notified} ${res.data.notified === 1 ? 'person' : 'people'} at the site were emailed.`
        );
      } else if (res.data.recipients) {
        // The approval is saved either way, but saying "approved" alone would
        // let someone believe the site was told when it was not.
        toast.warning(`Approved, but the site could not be emailed. ${res.data.mailError}`);
      } else {
        toast.success('Approved. Nobody is assigned to this site, so no email was sent.');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setApproving(false);
    }
  };

  const undoApproval = async () => {
    setApproving(true);
    // This one is reached from the menu, which closes on the click: there is no
    // button left on the screen to turn into a spinner, so the notice carries
    // the wait instead.
    const pending = toast.loading('Undoing the approval');
    try {
      await apiPut('/api/meal-counts/approve', { site, date });
      setCount((prev) => ({ ...prev, approved: null }));
      toast.success('Approval undone. The count can be corrected again.', { id: pending });
    } catch (err) {
      toast.error(err.message, { id: pending });
    } finally {
      setApproving(false);
    }
  };

  // Voiding is the escape hatch for a count filed on the wrong day or site;
  // corrections cannot undo those. The count stays on record, voided, and the
  // day goes back to being open.
  const voidCount = async () => {
    await apiPost('/api/meal-counts/void', { site, date, reason: voidReason.trim() });
    invalidate(ALL_MEALS_PATH);
    setVoided(true);
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
          subtitle={
            // Everything the old status card held, as one quiet line: a count on
            // this screen is submitted by definition, so a badge saying so was
            // only taking the place of the numbers.
            //
            // That line runs to four wrapped rows of mixed colour on a phone,
            // so there it stops after the two facts you came for and the rest
            // becomes the badges underneath.
            count ? (
              <>
                <span className="md:hidden">
                  {shortSiteName(site)}, {timeLabel(count.timeIn)} to {timeLabel(count.timeOut)}
                </span>
                <span className="hidden md:inline">
                {shortSiteName(site)}, {timeLabel(count.timeIn)} to {timeLabel(count.timeOut)}
                {count.submittedBy && count.submittedBy !== 'gas-import' && (
                  <>, submitted by {count.submittedBy}</>
                )}
                {count.source === 'GAS_IMPORT' && <>, imported from the previous system</>}
                {count.approved && (
                  <>
                    ,{' '}
                    <span className="font-semibold text-success-text">
                      approved by {count.approved.by}
                    </span>
                  </>
                )}
                {count.corrected && (
                  <>
                    ,{' '}
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(true)}
                      className="rounded-xs font-semibold text-warning-text underline decoration-warning-text/30 underline-offset-2 transition-colors hover:decoration-warning-text"
                    >
                      corrected {count.corrections.length}{' '}
                      {count.corrections.length === 1 ? 'time' : 'times'}
                    </button>
                  </>
                )}
                </span>
              </>
            ) : (
              shortSiteName(site)
            )
          }
          mobileActions={
            count && (
              <ActionSheet title={title} description={shortSiteName(site)}>
                <SheetAction icon={Download} onSelect={downloadPdf} hint="Save the signed form to this device">
                  Download PDF
                </SheetAction>
                <SheetAction icon={Send} onSelect={() => setEmailing(true)} hint="Send it to somebody">
                  Email PDF
                </SheetAction>
                {admin && !count.approved && (
                  <SheetAction
                    icon={Pencil}
                    href={`/meal-count?date=${date}&site=${encodeURIComponent(site)}&correct=1`}
                    hint="The original values stay on record"
                  >
                    Correct count
                  </SheetAction>
                )}
                {count.corrected && (
                  <SheetAction icon={History} onSelect={() => setHistoryOpen(true)}>
                    Correction history
                  </SheetAction>
                )}
                {admin && count.approved && (
                  <SheetAction icon={RotateCcw} onSelect={undoApproval}>
                    Undo approval
                  </SheetAction>
                )}
                {admin && (
                  <SheetAction
                    icon={Ban}
                    destructive
                    onSelect={() => {
                      setVoidReason('');
                      setVoidOpen(true);
                    }}
                    hint="For a count filed on the wrong day or site"
                  >
                    Void count
                  </SheetAction>
                )}
              </ActionSheet>
            )
          }
          backHref={`/dashboard?site=${encodeURIComponent(site)}`}
          backLabel="Back to dashboard"
          actions={
            count && (
              <>
                <Button variant="outline" onClick={downloadPdf} loading={downloading}>
                  <Download />
                  {downloading ? 'Preparing' : 'Download PDF'}
                </Button>
                <Button variant="outline" onClick={() => setEmailing(true)}>
                  <Send />
                  Email PDF
                </Button>
                {admin && !count.approved && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push(`/meal-count?date=${date}&site=${encodeURIComponent(site)}&correct=1`)
                    }
                  >
                    <Pencil />
                    Correct count
                  </Button>
                )}
                {admin && !count.approved && (
                  <Button onClick={approve} loading={approving}>
                    <BadgeCheck />
                    {approving ? 'Approving' : 'Approve'}
                  </Button>
                )}
                {(admin || count.corrected) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="More actions">
                        <MoreVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {count.corrected && (
                        <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
                          <History />
                          Correction history
                        </DropdownMenuItem>
                      )}
                      {admin && count.approved && (
                        <DropdownMenuItem onClick={undoApproval}>
                          <RotateCcw />
                          Undo approval
                        </DropdownMenuItem>
                      )}
                      {admin && (
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
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )
          }
        />

        {/* Phone: what the sentence above says on a wide screen, as marks that
            wrap instead of a paragraph in four colours. */}
        {count && (
          <div className="flex flex-wrap items-center gap-1.5 md:hidden">
            {count.approved && (
              <Badge variant="success">
                <BadgeCheck />
                Approved by {count.approved.by}
              </Badge>
            )}
            {count.corrected && (
              <button type="button" onClick={() => setHistoryOpen(true)} className="outline-none">
                <Badge variant="warning">
                  <Pencil />
                  Corrected {count.corrections.length}{' '}
                  {count.corrections.length === 1 ? 'time' : 'times'}
                </Badge>
              </button>
            )}
            {count.source === 'GAS_IMPORT' && <Badge variant="neutral">Imported</Badge>}
            {count.submittedBy && count.submittedBy !== 'gas-import' && (
              <Badge variant="neutral" className="max-w-full">
                <span className="truncate">By {count.submittedBy}</span>
              </Badge>
            )}
          </div>
        )}

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
            <section className="flex flex-col gap-2.5">
              <SectionLabel>Totals</SectionLabel>
              <div className="grid grid-cols-5 divide-x divide-border overflow-hidden rounded-lg border border-border bg-card">
                {COLUMNS.map((column) => {
                  const value = count.totals[column.key];
                  return (
                    <div key={column.key} className="flex flex-col items-center gap-1 px-1 py-3.5 md:gap-0.5 md:px-2 md:py-4">
                      <span
                        className={cn(
                          'text-[22px] font-bold leading-none tabular-nums tracking-tight md:text-[26px]',
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
                <div className="hidden grid-cols-[minmax(0,1fr)_repeat(5,64px)] border-b border-border bg-surface-sunken px-3.5 py-2 md:grid">
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
                    <div key={`${entry.number}-${entry.name}`}>
                      {/* A phone has 330px for a name and five columns. Five
                          columns won, and every second name was "Jonathan ...".
                          Here the name gets the width and the marks say only
                          what was ticked, which is what anyone reads them for. */}
                      <div className="flex items-start gap-3 px-4 py-2.5 md:hidden">
                        <span className="w-6 shrink-0 pt-0.5 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
                          {entry.number}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="truncate text-[13.5px] font-semibold text-foreground">
                            {entry.name}
                          </span>
                          <MarkPills entry={entry} />
                        </span>
                      </div>

                      <div className="hidden grid-cols-[minmax(0,1fr)_repeat(5,64px)] items-center px-3.5 py-2.5 transition-colors hover:bg-accent/40 md:grid">
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
                Approving locks the count: what was approved is what was claimed, and the site gets a copy by
                email. Corrections keep the original values on record. Voiding removes the count from the dashboard and
                every report, and is meant for a count filed on the wrong day or site.
              </p>
            )}
          </>
        )}
      </div>

      {/* Signing the day off is what an administrator opens this screen to do,
          so on a phone it is the one control that does not hide in a sheet. */}
      {count && admin && !count.approved && (
        <Fab icon={BadgeCheck} onClick={approve}>
          {approving ? 'Approving' : 'Approve'}
        </Fab>
      )}

      {/* The history matters when someone goes looking for it, which is rarely.
          On the page it pushed the numbers below the fold on every visit. */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Correction history</DialogTitle>
            <DialogDescription>
              {title} at {shortSiteName(site)}
            </DialogDescription>
          </DialogHeader>

          {/* Newest first, the order the API returns. */}
          <ol className="flex max-h-[60vh] flex-col overflow-y-auto pr-1">
            {(count?.corrections ?? []).map((correction, index, list) => (
              <li key={`${correction.at}-${index}`} className="flex gap-3">
                {/* A rail so several corrections read as one sequence. */}
                <div className="flex flex-col items-center pt-1.5">
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      index === 0 ? 'bg-warning-text' : 'bg-border-strong'
                    )}
                  />
                  {index < list.length - 1 && <span className="w-px flex-1 bg-border" />}
                </div>
                <div className={cn('flex min-w-0 flex-col gap-0.5', index < list.length - 1 && 'pb-5')}>
                  <span className="text-[13px] font-semibold text-foreground">{correction.by}</span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {stamp(correction.at)}
                    {index === 0 && list.length > 1 && ', most recent'}
                  </span>
                  {correction.note && (
                    <p className="mt-1 text-[13px] leading-relaxed text-foreground">{correction.note}</p>
                  )}
                  <ChangeList changes={correction.changes} />
                </div>
              </li>
            ))}
          </ol>

        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={voidOpen}
        onOpenChange={(next) => {
          setVoidOpen(next);
          // Once voided there is no count on this screen any more, so closing
          // the dialog goes back instead of leaving a page that cannot load.
          if (!next && voided) router.push(`/dashboard?site=${encodeURIComponent(site)}`);
        }}
        title="Void this meal count?"
        description={`${title} at ${shortSiteName(site)} goes back to being an open service day.`}
        consequences={[
          'The day shows as missing on the dashboard again.',
          'The count leaves the daily, monthly and consolidated reports.',
          'Nothing is deleted: the submission stays on record for audit.',
        ]}
        confirmLabel="Void count"
        successTitle="Count voided"
        successDescription="The service day is open again. Opening that day shows who voided it, and an administrator can restore it."
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

      <EmailPdfDialog
        open={emailing}
        onClose={() => setEmailing(false)}
        kind="daily"
        site={site}
        date={date}
        label={`The ${dateLabel(date)} count for ${shortSiteName(site)}`}
      />
    </AppShell>
  );
}

// What a correction actually moved. A note says why; this says what, which is
// the part someone auditing the count needs.
function ChangeList({ changes }) {
  if (!changes) return null;
  if (changes.length === 0) {
    return (
      <p className="mt-1.5 text-[12.5px] italic text-muted-foreground">
        No change was recorded for this entry.
      </p>
    );
  }

  return (
    <ul className="mt-2 flex flex-col gap-1 border-l-2 border-border pl-3">
      {changes.map((change, index) => (
        <li key={index} className="text-[12.5px] leading-relaxed text-muted-foreground">
          {change.kind === 'time' ? (
            <>
              <span className="font-medium text-foreground">{change.label}</span>{' '}
              {timeLabel(change.from)} to <span className="tabular-nums">{timeLabel(change.to)}</span>
            </>
          ) : change.added ? (
            <>
              <span className="font-medium text-foreground">{change.name}</span> was added to the count
            </>
          ) : change.removed ? (
            <>
              <span className="font-medium text-foreground">{change.name}</span> was removed from the count
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">{change.name}</span>
              {change.flips.map((flip, i) => (
                <span key={flip.label}>
                  {i === 0 ? ' ' : ', '}
                  <span className={flip.to ? 'text-primary' : 'text-destructive'}>
                    {flip.to ? 'marked' : 'unmarked'} {flip.label.toLowerCase()}
                  </span>
                </span>
              ))}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function SectionLabel({ children }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </span>
  );
}

// What this student was ticked for, on a screen with no column headings to
// read a tick against.
function MarkPills({ entry }) {
  const marked = COLUMNS.filter((column) => entry[column.entry]);
  if (marked.length === 0) {
    return <span className="text-[11.5px] text-muted-foreground">Nothing marked</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {marked.map((column) => (
        <span
          key={column.key}
          className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-strong dark:text-primary"
        >
          {column.label}
        </span>
      ))}
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
