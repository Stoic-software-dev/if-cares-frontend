'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import { assignedSiteNames, useAuth } from '@/components/auth/AuthProvider';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import RequestForm from '@/components/requests/RequestForm';
import StatusBadge from '@/components/requests/StatusBadge';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiGet } from '@/lib/api-client';
import { SITES_PATH, cachedGet } from '@/lib/data-cache';
import { requestDate, requestDetail } from '@/lib/requests';
import { shortSiteName } from '@/lib/sites';

function RequestsScreen() {
  const { user } = useAuth();
  const ownSites = assignedSiteNames(user);

  const [sites, setSites] = useState(ownSites ?? []);
  const [site, setSite] = useState(ownSites?.[0] ?? '');

  const [requests, setRequests] = useState(null);
  const [listError, setListError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (ownSites) return;
    cachedGet(SITES_PATH)
      .then((list) => {
        const names = list.map((entry) => entry.name);
        setSites(names);
        setSite((current) => current || names[0] || '');
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRequests = () => {
    setListError('');
    apiGet('/api/requests')
      .then((res) => setRequests(res.data))
      .catch((err) => setListError(err.message));
  };

  useEffect(loadRequests, []);

  const counts = useMemo(() => {
    const list = requests ?? [];
    return {
      all: list.length,
      open: list.filter((request) => request.status !== 'RESOLVED').length,
      resolved: list.filter((request) => request.status === 'RESOLVED').length,
    };
  }, [requests]);

  const visible = useMemo(() => {
    const list = requests ?? [];
    if (filter === 'open') return list.filter((request) => request.status !== 'RESOLVED');
    if (filter === 'resolved') return list.filter((request) => request.status === 'RESOLVED');
    return list;
  }, [requests, filter]);

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Requests"
          subtitle="Ask the IF Cares team for supplies or changes at your site."
        />

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-8">
          <RequestForm
            sites={sites}
            defaultSite={site}
            onSent={loadRequests}
            label="New request"
            className="rounded-lg border border-border bg-card p-4 md:p-5 lg:sticky lg:top-[76px]"
          />

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                My requests
              </span>
              {requests && requests.length > 0 && (
                <Segmented
                  ariaLabel="Filter requests"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All', count: counts.all },
                    { value: 'open', label: 'Open', count: counts.open },
                    { value: 'resolved', label: 'Resolved', count: counts.resolved },
                  ]}
                  className="sm:w-auto"
                />
              )}
            </div>

            {listError && <ErrorState title="Couldn't load your requests" message={listError} onRetry={loadRequests} />}

            {!requests && !listError && (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-[72px] rounded-lg" />
                ))}
              </div>
            )}

            {requests && visible.length === 0 && (
              <div className="rounded-lg border border-dashed border-border-strong bg-card">
                <EmptyState
                  icon={Inbox}
                  title={requests.length === 0 ? 'No requests yet' : 'Nothing in this filter'}
                  description={
                    requests.length === 0
                      ? 'Requests you send show up here with their status and the answer from the team.'
                      : 'Switch back to All to see the rest of your requests.'
                  }
                />
              </div>
            )}

            {visible.length > 0 && (
              <div
                className="stagger flex flex-col gap-2"
                style={{ '--stagger-step': '30ms' }}
                key={filter}
              >
                {visible.map((request, index) => (
                  <article
                    key={request.id}
                    style={{ '--stagger-i': Math.min(index, 10) }}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3.5 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[14px] font-semibold text-foreground">{request.type}</span>
                      <span className="text-[12px] text-muted-foreground">
                        {requestDetail(request)}, {requestDate(request.createdAt)}
                        {sites.length > 1 && `, ${shortSiteName(request.site)}`}
                      </span>
                      {/* The answer from the office, once responses are stored. */}
                      {request.responseComment && (
                        <span className="mt-1 rounded-sm bg-muted px-2.5 py-1.5 text-[12px] leading-relaxed text-foreground">
                          {request.responseComment}
                        </span>
                      )}
                    </div>
                    <StatusBadge status={request.status} size="lg" />
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

export default function RequestsPage() {
  return (
    <Protected>
      <RequestsScreen />
    </Protected>
  );
}
