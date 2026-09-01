'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bug, CheckCircle2, ChevronDown, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput } from '@/components/ui/search-input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiGet, apiPatch } from '@/lib/api-client';
import { canSeeMonitoring } from '@/lib/monitoring-access';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

function when(iso) {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MonitoringScreen() {
  const [errors, setErrors] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [scope, setScope] = useState('open');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState('');
  const [busyId, setBusyId] = useState('');
  const [page, setPage] = useState(1);

  const load = () => {
    setLoadError('');
    apiGet(`/api/monitoring?resolved=${scope === 'all' ? '1' : '0'}`)
      .then((res) => setErrors(res.data))
      .catch((err) => setLoadError(err.message));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [scope]);

  useEffect(() => {
    setPage(1);
  }, [query, scope]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = errors ?? [];
    if (!q) return list;
    return list.filter((row) =>
      [row.message, row.pathname, row.lastEmail].join(' ').toLowerCase().includes(q)
    );
  }, [errors, query]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const setResolved = async (row, resolved) => {
    setBusyId(row.id);
    try {
      await apiPatch('/api/monitoring', { id: row.id, resolved });
      toast.success(resolved ? 'Marked as handled' : 'Reopened');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId('');
    }
  };

  const totalHits = (errors ?? []).reduce((sum, row) => sum + row.count, 0);

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Client errors"
          subtitle={
            errors
              ? `${errors.length} ${errors.length === 1 ? 'problem' : 'problems'}, ${totalHits} ${
                  totalHits === 1 ? 'occurrence' : 'occurrences'
                }`
              : 'Loading what has been crashing'
          }
        />

        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <Segmented
            ariaLabel="Filter"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'open', label: 'Still happening' },
              { value: 'all', label: 'Everything' },
            ]}
            className="lg:w-auto"
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search message, screen or user"
            className="lg:ml-auto lg:w-80"
          />
        </div>

        {loadError && <ErrorState title="Couldn't load the reports" message={loadError} onRetry={load} />}

        {!errors && !loadError && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        )}

        {errors && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-strong bg-card">
            <EmptyState
              icon={CheckCircle2}
              title={query ? 'No report matches' : 'Nothing has crashed'}
              description={
                query
                  ? 'Try a different word, or clear the search.'
                  : 'Screens that fail in a browser show up here on their own, grouped by problem.'
              }
              action={
                query ? (
                  <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                ) : null
              }
            />
          </div>
        )}

        {pageRows.length > 0 && (
          <div className="flex flex-col gap-2">
            {pageRows.map((row) => {
              const open = expanded === row.id;
              return (
                <article
                  key={row.id}
                  className={cn(
                    'rounded-lg border bg-card transition-colors',
                    row.resolvedAt ? 'border-border opacity-70' : 'border-border'
                  )}
                >
                  <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-destructive-soft text-destructive">
                      <Bug className="h-4 w-4" />
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="break-words text-[14px] font-semibold text-foreground">
                        {row.message}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                        <span className="font-medium text-foreground">{row.pathname || 'Unknown screen'}</span>
                        <span>
                          {row.count} {row.count === 1 ? 'time' : 'times'}, last {when(row.lastSeenAt)}
                        </span>
                        {row.lastEmail && <span>{row.lastEmail}</span>}
                        {row.source && <Badge size="sm" variant="neutral">{row.source}</Badge>}
                        {row.resolvedAt && <Badge size="sm" variant="success">Handled</Badge>}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {row.stack && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpanded(open ? '' : row.id)}
                          aria-expanded={open}
                        >
                          <ChevronDown className={cn('transition-transform duration-fast', open && 'rotate-180')} />
                          Stack
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        loading={busyId === row.id}
                        onClick={() => setResolved(row, !row.resolvedAt)}
                      >
                        {busyId !== row.id && (row.resolvedAt ? <RotateCcw /> : <CheckCircle2 />)}
                        {row.resolvedAt ? 'Reopen' : 'Handled'}
                      </Button>
                    </div>
                  </div>

                  {open && (
                    <pre className="max-h-72 overflow-auto border-t border-border bg-surface-sunken px-4 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
                      {row.stack}
                      {row.userAgent ? `\n\n${row.userAgent}` : ''}
                    </pre>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <Pagination
          page={current}
          pageCount={pageCount}
          onPageChange={(next) => {
            setPage(next);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          total={rows.length}
          pageSize={PAGE_SIZE}
          label="problems"
        />
      </div>
    </AppShell>
  );
}

export default function MonitoringPage() {
  return (
    <Protected adminOnly allow={canSeeMonitoring}>
      <MonitoringScreen />
    </Protected>
  );
}
