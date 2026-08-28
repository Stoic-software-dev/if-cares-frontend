'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleCheck, Inbox, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import StatusBadge from '@/components/requests/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, NativeSelect } from '@/components/ui/field';
import { SearchInput } from '@/components/ui/search-input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiGet, apiPatch } from '@/lib/api-client';
import { requestDate, requestDetail } from '@/lib/requests';
import { shortSiteName, sortSiteNames } from '@/lib/sites';
import { cn } from '@/lib/utils';

function InboxScreen() {
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('NEW');
  const [query, setQuery] = useState('');
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [busyId, setBusyId] = useState('');
  const [resolving, setResolving] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (inbox ?? []).filter((request) => {
      if (status !== 'ALL' && request.status !== status) return false;
      if (siteFilter !== 'ALL' && request.site !== siteFilter) return false;
      if (!q) return true;
      return [request.type, request.site, request.requestedBy, requestDetail(request)]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [inbox, status, siteFilter, query]);

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

      // The note is sent, but the response field is not deployed everywhere
      // yet. Read the request back and say plainly whether it was kept, rather
      // than letting an administrator believe the site will see it.
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
          description: 'The note was not stored: request responses are not deployed yet. Tell the site directly.',
        });
      } else {
        toast.success(`${resolving.type} resolved`);
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
        />

        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
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
            className="lg:w-auto"
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search type, site or requester"
            className="lg:ml-auto lg:w-72"
          />
          {siteOptions.length > 1 && (
            <NativeSelect
              aria-label="Filter by site"
              value={siteFilter}
              onChange={(event) => setSiteFilter(event.target.value)}
              className="lg:w-60"
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
                  </div>

                  <span className="truncate text-[13px] text-muted-foreground lg:block">
                    {shortSiteName(request.site)}
                  </span>

                  <span className="text-[12.5px] tabular-nums text-muted-foreground">
                    {requestDate(request.createdAt)}
                  </span>

                  <StatusBadge status={request.status} />

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
          </div>
        )}
      </div>

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
