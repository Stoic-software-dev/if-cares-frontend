'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CheckCircle2, Copy, Download, FileSignature, Layers, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, NativeSelect } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiDelete, apiGet, apiPost } from '@/lib/api-client';
import { SITES_PATH, useCachedGet } from '@/lib/data-cache';
import { shortSiteName, sortSiteNames } from '@/lib/sites';
import { cn } from '@/lib/utils';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const KINDS = [
  { value: 'claim-part1', label: 'By site' },
  { value: 'claim-part2', label: 'By day' },
];

function elapsed(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function ConsolidatedScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [state, setState] = useState('');
  const [kind, setKind] = useState('claim-part1');
  const [excluded, setExcluded] = useState([]);
  const [siteQuery, setSiteQuery] = useState('');

  const [job, setJob] = useState(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [sending, setSending] = useState(null); // the report being sent
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState('copy');
  const [sendBusy, setSendBusy] = useState(false);
  const pollRef = useRef(null);

  const siteList = useCachedGet(SITES_PATH);
  const siteRows = useMemo(() => siteList.data ?? [], [siteList.data]);

  // Which sites a claim covers is decided by `Site.state`, the same column the
  // backend filters by. This screen used to derive it from the site NAME, so a
  // TX claim showed 24 sites and the PDF printed 35: sites the admin ticked went
  // missing and sites the admin never saw were claimed anyway.
  const allSites = useMemo(() => sortSiteNames(siteRows.map((row) => row.name)), [siteRows]);
  const states = useMemo(
    () => [...new Set(siteRows.map((row) => (row.state ?? '').trim().toUpperCase()).filter(Boolean))].sort(),
    [siteRows]
  );

  const inScope = useMemo(
    () =>
      sortSiteNames(
        siteRows
          .filter((row) => (state ? (row.state ?? '').trim().toUpperCase() === state : true))
          .map((row) => row.name)
      ),
    [siteRows, state]
  );

  // A site with no state is in no state's claim - not here and not in the
  // backend. Saying so is the difference between a number the admin can trust
  // and one they have to reconcile by hand later.
  const stateless = useMemo(() => siteRows.filter((row) => !(row.state ?? '').trim()).length, [siteRows]);
  const included = inScope.filter((name) => !excluded.includes(name));

  const loadReports = useCallback(() => {
    setError('');
    apiGet('/api/reports/generated')
      .then((res) => setReports(res.data))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(loadReports, [loadReports]);

  // Polling stops the moment the job is done, and never outlives the screen.
  useEffect(() => {
    if (!job || job.status !== 'processing') return undefined;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiGet(`/api/reports/consolidated?job=${job.id}`);
        setJob(res.data);
        if (res.data.status !== 'processing') {
          clearInterval(pollRef.current);
          if (res.data.status === 'completed') {
            toast.success('Consolidated claim ready');
            loadReports();
          } else {
            toast.error(res.data.error || 'The report failed.');
          }
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setJob((current) => (current ? { ...current, status: 'error', error: err.message } : null));
      }
    }, 1500);
    return () => clearInterval(pollRef.current);
  }, [job, loadReports]);

  const start = async () => {
    if (included.length === 0) {
      toast.error('At least one site has to be included.');
      return;
    }
    setStarting(true);
    try {
      const res = await apiPost('/api/reports/consolidated', {
        kind,
        year: Number(year),
        month: Number(month),
        state: state || undefined,
        excludeSites: excluded,
      });
      setJob({ id: res.jobId, status: 'processing', progress: 'Starting', elapsedMs: 0 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setStarting(false);
    }
  };

  // Queued or running: both are the user waiting.
  const building = starting || job?.status === 'processing';

  const cancel = async () => {
    if (!job) return;
    setCancelling(true);
    try {
      await fetch(`/api/reports/consolidated?job=${job.id}`, { method: 'DELETE' });
      setJob(null);
    } finally {
      setCancelling(false);
    }
  };

  const makeSignLink = async (report) => {
    setBusyId(report.id);
    try {
      const res = await apiPost(`/api/reports/generated/${report.id}`, {});
      const url = `${window.location.origin}${res.data.path}`;
      await navigator.clipboard?.writeText(url).catch(() => {});
      toast.success('Signing link copied', {
        description: 'Send it to whoever signs. It opens without an account and works once.',
      });
      loadReports();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId('');
    }
  };

  const revokeSignLink = async (report) => {
    setBusyId(report.id);
    try {
      await apiDelete(`/api/reports/generated/${report.id}`);
      toast.success('Signing link revoked', {
        description: 'The link stops opening. Nothing already signed is undone.',
      });
      loadReports();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId('');
    }
  };

  const send = async () => {
    setSendBusy(true);
    try {
      const res = await apiPost(`/api/reports/generated/${sending.id}/send`, { to, note, mode });
      toast.success(
        `Sent to ${res.data.sent} ${res.data.sent === 1 ? 'recipient' : 'recipients'}`,
        { description: mode === 'signature' ? 'They get the signing link, not the file.' : undefined }
      );
      setSending(null);
      setTo('');
      setNote('');
      loadReports();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendBusy(false);
    }
  };

  const visibleSites = inScope.filter((name) =>
    name.toLowerCase().includes(siteQuery.trim().toLowerCase())
  );

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Consolidated claims"
          subtitle="The monthly documentation of meals claimed, by site and by day."
          backHref="/admin/reports"
          backLabel="Back to reports"
        />

        {/* `grid-cols-1` is the base every breakpoint-only grid needs. Without
            it the implicit column is `auto`, which stretches to the widest thing
            inside it: on a 320px phone this screen laid out at 514px and scrolled
            sideways, with the month and state selects off the edge. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Build a claim
            </span>

            <Segmented
              ariaLabel="Report"
              value={kind}
              onChange={setKind}
              options={KINDS}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Month" htmlFor="claim-month">
                <NativeSelect id="claim-month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {MONTHS.map((label, index) => (
                    <option key={label} value={index + 1}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Year" htmlFor="claim-year">
                <NativeSelect id="claim-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {years.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <Field
              label="State"
              htmlFor="claim-state"
              hint={
                stateless
                  ? `A claim is filed per state. ${stateless} ${
                      stateless === 1 ? 'site has' : 'sites have'
                    } no state on file and can only be claimed under Every state.`
                  : 'A claim is filed per state.'
              }
            >
              <NativeSelect
                id="claim-state"
                value={state}
                onChange={(event) => {
                  setState(event.target.value);
                  setExcluded([]);
                }}
              >
                <option value="">Every state</option>
                {states.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Sites in this claim
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExcluded(excluded.length === inScope.length ? [] : [...inScope])}
                >
                  {excluded.length === inScope.length ? 'Include all' : 'Exclude all'}
                </Button>
              </div>

              <SearchInput value={siteQuery} onChange={setSiteQuery} placeholder="Filter sites" className="h-10" />

              <div className="max-h-52 overflow-y-auto rounded-md border border-border">
                {visibleSites.map((name) => {
                  const isIn = !excluded.includes(name);
                  return (
                    <label
                      key={name}
                      className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2.5 text-[13px] last:border-b-0 hover:bg-accent"
                    >
                      <Checkbox
                        checked={isIn}
                        onCheckedChange={() =>
                          setExcluded(isIn ? [...excluded, name] : excluded.filter((item) => item !== name))
                        }
                      />
                      <span className={cn('truncate', isIn ? 'text-foreground' : 'text-muted-foreground line-through')}>
                        {shortSiteName(name)}
                      </span>
                    </label>
                  );
                })}
              </div>

              <span
                className={cn(
                  'text-[12px]',
                  included.length === 0 ? 'text-destructive-text' : 'text-muted-foreground'
                )}
              >
                {included.length} of {inScope.length} sites included
              </span>
            </div>

            {/* The POST only queues the job; the building happens after it
                returns. Ending the busy state there put the button back to rest
                while the claim was still being built, which is the moment the
                screen most has to say something is happening - the progress
                panel that does is in the other column, below the fold on a
                laptop. */}
            <Button
              onClick={start}
              loading={building}
              disabled={included.length === 0}
            >
              {!building && <Layers />}
              {building ? 'Building the claim' : 'Build the claim'}
            </Button>
          </div>

          <div className="flex flex-col gap-4">
            {job && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  {job.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {job.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-success" />}
                  <span className="text-[13px] font-semibold text-foreground">
                    {job.status === 'processing'
                      ? job.progress || 'Working'
                      : job.status === 'completed'
                        ? 'Claim ready'
                        : job.error}
                  </span>
                  <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
                    {elapsed(job.elapsedMs ?? 0)}
                  </span>
                  {job.status === 'processing' && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Cancel"
                      onClick={cancel}
                      loading={cancelling}
                    >
                      {!cancelling && <X />}
                    </Button>
                  )}
                </div>
                {job.status === 'completed' && job.result && (
                  <span className="text-[12.5px] text-muted-foreground">
                    {job.result.rows} rows, {job.result.totals?.att ?? 0} attendance and{' '}
                    {(job.result.totals?.brk ?? 0) +
                      (job.result.totals?.lun ?? 0) +
                      (job.result.totals?.snk ?? 0) +
                      (job.result.totals?.sup ?? 0)}{' '}
                    meals claimed.
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Saved claims
              </span>

              {error && <ErrorState title="Couldn't load the claims" message={error} onRetry={loadReports} />}

              {!reports && !error && (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }, (_, i) => (
                    <Skeleton key={i} className="h-[72px] rounded-lg" />
                  ))}
                </div>
              )}

              {reports && reports.length === 0 && (
                <div className="rounded-lg border border-dashed border-border-strong bg-card">
                  <EmptyState
                    icon={Layers}
                    title="No claim has been built yet"
                    description="Pick a month and a state on the left, then build the claim. Every one you build stays here."
                  />
                </div>
              )}

              {reports?.map((report) => (
                <article
                  key={report.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-[13.5px] font-semibold text-foreground">
                      {report.fileName}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                      <span>{MONTHS[report.month - 1]} {report.year}</span>
                      <span>{KINDS.find((k) => k.value === report.kind)?.label ?? report.kind}</span>
                      {report.signedAt ? (
                        <Badge size="sm" variant="success">
                          Signed by {report.signedBy}
                        </Badge>
                      ) : report.hasSignLink ? (
                        <Badge size="sm" variant="warning">
                          Waiting for a signature
                        </Badge>
                      ) : null}
                    </span>
                  </div>

                  {/* Four small buttons are wider than a 375px phone; on one
                      they wrap under the title instead of pushing the row
                      past the edge of the screen. */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/reports/generated/${report.id}`}>
                        <Download />
                        Download
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSending(report);
                        setMode(report.hasSignLink && !report.signedAt ? 'signature' : 'copy');
                        setTo('');
                        setNote('');
                      }}
                    >
                      <Send />
                      Send
                    </Button>
                    {!report.signedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busyId === report.id}
                        onClick={() => makeSignLink(report)}
                      >
                        {busyId !== report.id && (report.hasSignLink ? <Copy /> : <FileSignature />)}
                        {report.hasSignLink ? 'New link' : 'Signing link'}
                      </Button>
                    )}
                    {report.hasSignLink && !report.signedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busyId === report.id}
                        onClick={() => revokeSignLink(report)}
                      >
                        {busyId !== report.id && <Ban />}
                        Revoke link
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(sending)} onOpenChange={(open) => !open && setSending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send this claim</DialogTitle>
            <DialogDescription>{sending?.fileName}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <Segmented
              ariaLabel="What to send"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'copy', label: 'The document' },
                { value: 'signature', label: 'A signing link' },
              ]}
            />

            {mode === 'signature' && !sending?.hasSignLink && (
              <p className="rounded-md bg-warning-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-warning-text">
                Create the signing link first, with the button on the row.
              </p>
            )}

            <Field
              label="To"
              htmlFor="send-to"
              hint="Comma separated. Each address gets its own copy."
            >
              <Input
                id="send-to"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="name@ifcares.org, other@ifcares.org"
              />
            </Field>

            {mode === 'copy' && (
              <Field label="Note" htmlFor="send-note" hint="Optional. Goes above the attachment.">
                <Textarea
                  id="send-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Anything the recipient should know."
                />
              </Field>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSending(null)} disabled={sendBusy}>
              Cancel
            </Button>
            <Button
              onClick={send}
              loading={sendBusy}
              disabled={!to.trim() || (mode === 'signature' && !sending?.hasSignLink)}
            >
              {!sendBusy && <Send />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function ConsolidatedPage() {
  return (
    <Protected adminOnly>
      <ConsolidatedScreen />
    </Protected>
  );
}
