'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleCheck, Inbox, Play, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import RequestForm from '@/components/requests/RequestForm';
import StatusBadge from '@/components/requests/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, NativeSelect } from '@/components/ui/field';
import { ChipRow, Fab, FilterSheet } from '@/components/ui/mobile';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiGet, apiPatch } from '@/lib/api-client';
import { ymdInProgramTz } from '@/lib/calendar';
import { SITES_PATH, useCachedGet } from '@/lib/data-cache';
import { requestDate, requestDetail } from '@/lib/requests';
import { shortSiteName, sortSiteNames } from '@/lib/sites';
import { cn } from '@/lib/utils';

// Ten fit on a screen without the toolbar scrolling out of reach.
const PAGE_SIZE = 10;

function InboxScreen() {
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('NEW');
  const [query, setQuery] = useState('');
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [busyId, setBusyId] = useState('');
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [composing, setComposing] = useState(false);

  // Administrators reach requests through this inbox, so the form to file one
  // has to live here too. It used to exist only on the staff screen, which
  // their navigation never opens.
  const siteList = useCachedGet(SITES_PATH);
  const allSiteNames = useMemo(
    () => (siteList.data ? sortSiteNames(siteList.data.map((entry) => entry.name)) : []),
    [siteList.data]
  );

  const load = () => {
    setError('');
    apiGet('/api/requests')
      .then((res) => {
        setInbox(res.data);
        // Open on the queue that actually has something in it: landing on an
        // empty "New" tab reads as a broken screen.
        if (!res.data.some((request) => request.status === 'NEW')) setStatus('ALL');
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const counts = useMemo(() => {
    const list = inbox ?? [];
    return {
      ALL: list.length,
      NEW: list.filter((request) => request.status === 'NEW').length,
      IN_PROGRESS: list.filter((request) => request.status === 'IN_PROGRESS').length,
      RESOLVED: list.filter((request) => request.status === 'RESOLVED').length,
    };
  }, [inbox]);

  const siteOptions = useMemo(
    () => sortSiteNames([...new Set((inbox ?? []).map((request) => request.site))]),
    [inbox]
  );

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (inbox ?? []).filter((request) => {
      if (status !== 'ALL' && request.status !== status) return false;
      if (siteFilter !== 'ALL' && request.site !== siteFilter) return false;
      // The date filter reads the request's own day in the program timezone,
      // not the browser's: a request filed at 11 PM in Buenos Aires belongs to
      // the Dallas day the site was working, the same rule the counts follow.
      if (fromDate && ymdInProgramTz(new Date(request.createdAt)) < fromDate) return false;
      if (toDate && ymdInProgramTz(new Date(request.createdAt)) > toDate) return false;
      if (!q) return true;
      return [request.type, request.site, request.requestedBy, request.note ?? '', requestDetail(request)]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [inbox, status, siteFilter, query, fromDate, toDate]);

  // Ten requests fit on a screen; a school year of them does not. Any change to
  // what is being listed starts the listing over, so page 4 of a filter that now
  // returns two rows is never an empty screen.
  useEffect(() => {
    setPage(1);
  }, [status, siteFilter, query, fromDate, toDate]);

  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = useMemo(
    () => matching.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    [matching, current]
  );

  // Optimistic: the row moves the moment it is clicked and rolls back with the
  // reason if the server disagrees.
  const setRequestStatus = async (request, next, { silent = false, comment = '' } = {}) => {
    const previous = inbox;
    setBusyId(request.id);
    setInbox((list) => list.map((item) => (item.id === request.id ? { ...item, status: next } : item)));
    try {
      await apiPatch(`/api/requests/${request.id}`, {
        status: next,
        ...(comment.trim() ? { responseComment: comment.trim() } : {}),
      });
      if (!silent) toast.success(`${request.type} marked as ${next.replace('_', ' ').toLowerCase()}`);
    } catch (err) {
      setInbox(previous);
      toast.error(err.message);
      throw err;
    } finally {
      setBusyId('');
    }
  };

  const resolve = async () => {
    setSaving(true);
    const typed = note.trim();
    try {
      await setRequestStatus(resolving, 'RESOLVED', { silent: true, comment: note });

      // Read it back so the row shows the answer that was actually stored, and
      // say so if the note did not make it: an administrator who believes the
      // site was told when it was not is worse than no note at all.
      let kept = false;
      try {
        const fresh = await apiGet('/api/requests');
        setInbox(fresh.data);
        kept = Boolean(fresh.data.find((item) => item.id === resolving.id)?.responseComment);
      } catch {
        // The list stays as the optimistic update left it.
      }

      if (typed && !kept) {
        toast.warning(`${resolving.type} resolved`, {
          description: 'The note could not be saved. Tell the site directly.',
        });
      } else {
        toast.success(`${resolving.type} resolved`, {
          description: typed ? 'The site sees your answer on its requests screen.' : undefined,
        });
      }
      setResolving(null);
      setNote('');
    } catch {
      // The row was rolled back and the error toasted already.
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Requests"
          subtitle={
            inbox
              ? `${counts.NEW} new, ${counts.IN_PROGRESS} in progress, ${counts.RESOLVED} resolved`
              : 'Loading the inbox'
          }
          actions={
            <Button variant="outline" onClick={() => setComposing(true)} className="hidden md:inline-flex">
              <Plus />
              New request
            </Button>
          }
        />

        {/* Phone: the status is the inbox's own navigation, so it stays on the
            screen as chips that scroll - four segments sharing 358px turned
            "In progress" into "In progr..." and "All" into "A.". The site and
            the date range go behind the filter button. */}
        <div className="flex flex-col gap-2.5 md:hidden">
          <div className="flex items-center gap-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search type, site or requester"
              className="min-w-0 flex-1"
            />
            <FilterSheet
              count={(siteFilter !== 'ALL' ? 1 : 0) + (fromDate || toDate ? 1 : 0)}
              onClear={() => {
                setSiteFilter('ALL');
                setFromDate('');
                setToDate('');
              }}
            >
              {siteOptions.length > 1 && (
                <Field label="Site" htmlFor="inbox-site">
                  <NativeSelect
                    id="inbox-site"
                    value={siteFilter}
                    onChange={(event) => setSiteFilter(event.target.value)}
                  >
                    <option value="ALL">All sites</option>
                    {siteOptions.map((name) => (
                      <option key={name} value={name}>
                        {shortSiteName(name)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              <Field label="Filed from" htmlFor="inbox-from">
                <Input
                  id="inbox-from"
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </Field>
              <Field label="Filed to" htmlFor="inbox-to">
                <Input
                  id="inbox-to"
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </Field>
            </FilterSheet>
          </div>

          <ChipRow
            ariaLabel="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'NEW', label: 'New', count: counts.NEW },
              { value: 'IN_PROGRESS', label: 'In progress', count: counts.IN_PROGRESS },
              { value: 'RESOLVED', label: 'Resolved', count: counts.RESOLVED },
              { value: 'ALL', label: 'All', count: counts.ALL },
            ]}
          />
        </div>

        <div className="hidden flex-col gap-2.5 md:flex md:flex-row md:flex-wrap md:items-center">
          <Segmented
            ariaLabel="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'NEW', label: 'New', count: counts.NEW },
              { value: 'IN_PROGRESS', label: 'In progress', count: counts.IN_PROGRESS },
              { value: 'RESOLVED', label: 'Resolved', count: counts.RESOLVED },
              { value: 'ALL', label: 'All', count: counts.ALL },
            ]}
            className="md:w-auto"
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search type, site or requester"
            className="md:ml-auto md:min-w-[13rem] md:max-w-sm md:flex-1"
          />
          {siteOptions.length > 1 && (
            <NativeSelect
              aria-label="Filter by site"
              value={siteFilter}
              onChange={(event) => setSiteFilter(event.target.value)}
              className="md:w-60"
            >
              <option value="ALL">All sites</option>
              {siteOptions.map((name) => (
                <option key={name} value={name}>
                  {shortSiteName(name)}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>

        {/* Dates are their own row: on a phone they would squeeze the site
            selector into something unusable next to them, so there they live in
            the filter sheet instead. */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <span className="text-[12px] font-medium text-muted-foreground">Filed between</span>
          <Input
            type="date"
            aria-label="From date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => setFromDate(event.target.value)}
            className="w-auto"
          />
          <span className="text-[12px] text-muted-foreground">and</span>
          <Input
            type="date"
            aria-label="To date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => setToDate(event.target.value)}
            className="w-auto"
          />
          {(fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
            >
              Clear dates
            </Button>
          )}
        </div>

        {error && <ErrorState title="Couldn't load the inbox" message={error} onRetry={load} />}

        {!inbox && !error && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-lg" />
            ))}
          </div>
        )}

        {inbox && visible.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-strong bg-card">
            <EmptyState
              icon={Inbox}
              title={counts.ALL === 0 ? 'No requests yet' : 'Nothing here'}
              description={
                counts.ALL === 0
                  ? 'Requests sent by site staff land here with their status.'
                  : 'No request matches the current filters.'
              }
              action={
                counts.ALL > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setStatus('ALL');
                      setQuery('');
                      setSiteFilter('ALL');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null
              }
            />
          </div>
        )}

        {visible.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_110px_260px] gap-4 border-b border-border bg-surface-sunken px-4 py-2 lg:grid">
              {['Request', 'Site', 'Requested', 'Status', ''].map((heading, index) => (
                <span
                  key={heading || index}
                  className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                >
                  {heading}
                </span>
              ))}
            </div>

            <div className="divide-y divide-border">
              {visible.map((request) => (
                <div
                  key={request.id}
                  className={cn(
                    'flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-accent/30',
                    'lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_110px_260px] lg:items-center lg:gap-4'
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[14px] font-semibold text-foreground">{request.type}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {requestDetail(request)}, {request.requestedBy}
                    </span>
                    {request.note && (
                      <span className="mt-1 text-[12.5px] leading-relaxed text-foreground">{request.note}</span>
                    )}
                  </div>

                  <span className="truncate text-[13px] text-muted-foreground lg:block">
                    {shortSiteName(request.site)}
                  </span>

                  <span className="text-[12.5px] tabular-nums text-muted-foreground">
                    {requestDate(request.createdAt)}
                  </span>

                  <StatusBadge status={request.status} />

                  {request.responseComment && (
                    <span className="col-span-full flex flex-col gap-1 rounded-sm bg-muted px-2.5 py-1.5">
                      <span className="text-[12px] leading-relaxed text-foreground">{request.responseComment}</span>
                      {request.respondedBy && (
                        <span className="text-[11px] text-muted-foreground">
                          {request.respondedBy}
                          {request.respondedAt ? `, ${requestDate(request.respondedAt)}` : ''}
                        </span>
                      )}
                    </span>
                  )}

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {request.status === 'NEW' && (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={busyId === request.id}
                        onClick={() => setRequestStatus(request, 'IN_PROGRESS')}
                      >
                        <Play />
                        Start
                      </Button>
                    )}
                    {request.status !== 'RESOLVED' && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setResolving(request);
                          setNote('');
                        }}
                      >
                        <CircleCheck />
                        Resolve
                      </Button>
                    )}
                    {request.status === 'RESOLVED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busyId === request.id}
                        onClick={() => setRequestStatus(request, 'NEW')}
                      >
                        <RotateCcw />
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Pagination
              page={current}
              pageCount={pageCount}
              onPageChange={setPage}
              total={matching.length}
              pageSize={PAGE_SIZE}
              label="requests"
              className="border-t border-border px-4 py-3"
            />
          </div>
        )}
      </div>

      <Fab icon={Plus} onClick={() => setComposing(true)}>
        New request
      </Fab>

      <Dialog open={composing} onOpenChange={setComposing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New request</DialogTitle>
            <DialogDescription>
              It lands in this inbox like any other, filed under your name.
            </DialogDescription>
          </DialogHeader>
          <RequestForm
            sites={allSiteNames}
            onSent={() => {
              setComposing(false);
              load();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resolving)} onOpenChange={(open) => !open && setResolving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve this request</DialogTitle>
            <DialogDescription>
              {resolving && (
                <>
                  {resolving.type}, {requestDetail(resolving)}, {shortSiteName(resolving.site ?? '')}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <Field
            label="Note for the site"
            htmlFor="resolve-note"
            hint="Optional. What was done, or why the answer is no."
          >
            <Textarea
              id="resolve-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Delivered with Thursday's order."
              maxLength={500}
            />
          </Field>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolving(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={resolve} loading={saving}>
              Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function AdminRequestsPage() {
  return (
    <Protected adminOnly>
      <InboxScreen />
    </Protected>
  );
}
