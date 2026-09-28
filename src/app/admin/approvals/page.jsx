'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, ChevronRight, Pencil } from 'lucide-react';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { apiGet } from '@/lib/api-client';
import { dateLabel } from '@/lib/calendar';
import { shortSiteName } from '@/lib/sites';

const MEALS = [
  { key: 'brk', label: 'Brk' },
  { key: 'lun', label: 'Lun' },
  { key: 'snk', label: 'Snk' },
  { key: 'sup', label: 'Sup' },
];

function stamp(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Counts sites filed that are waiting for an administrator. A site cannot take
// the PDF of a day until it is approved, so this is also the list of sites
// waiting on somebody. Oldest day first: the longest wait is read first.
function ApprovalsScreen() {
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = () => {
    setError('');
    apiGet('/api/meal-counts/pending')
      .then((res) => setCounts(res.data))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!counts) return [];
    if (!q) return counts;
    return counts.filter((count) => count.site.toLowerCase().includes(q));
  }, [counts, query]);

  const subtitle = !counts
    ? 'Meal counts waiting for your review'
    : counts.length === 0
      ? 'Nothing is waiting for your review'
      : `${counts.length} ${counts.length === 1 ? 'count is' : 'counts are'} waiting for your review`;

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <PageHeader title="Approvals" subtitle={subtitle} />

        {error && <ErrorState title="Couldn't load the approvals" message={error} onRetry={load} />}

        {!error && !counts && <ListSkeleton rows={6} rowClassName="h-16" />}

        {counts && counts.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-strong bg-card">
            <EmptyState
              icon={BadgeCheck}
              title="All caught up"
              description="Every meal count the sites submitted has been approved. New submissions show up here."
            />
          </div>
        )}

        {counts && counts.length > 0 && (
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Filter by site" className="sm:w-80" />

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="divide-y divide-border">
                {visible.map((count) => (
                  <Link
                    key={`${count.site}|${count.date}`}
                    href={`/counts/${count.date}?site=${encodeURIComponent(count.site)}&from=approvals`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="truncate text-[14px] font-semibold text-foreground">
                          {shortSiteName(count.site)}
                        </span>
                        <span className="text-[13px] text-muted-foreground">
                          {dateLabel(count.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                        <span className="tabular-nums">
                          {count.totals.att} {count.totals.att === 1 ? 'student' : 'students'}
                        </span>
                        {MEALS.filter((meal) => count.totals[meal.key] > 0).map((meal) => (
                          <span
                            key={meal.key}
                            className="rounded-full bg-primary-soft px-2 py-px text-[11px] font-semibold tabular-nums text-primary-strong dark:text-primary"
                          >
                            {meal.label} {count.totals[meal.key]}
                          </span>
                        ))}
                        {count.corrected && (
                          <Badge variant="warning">
                            <Pencil />
                            Corrected
                          </Badge>
                        )}
                      </span>
                      <span className="truncate text-[11.5px] text-muted-foreground">
                        Submitted {stamp(count.submittedAt)}
                        {count.submittedBy && <> by {count.submittedBy}</>}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>

              {visible.length === 0 && (
                <EmptyState
                  title="No site matches"
                  description={`Nothing waiting matches “${query.trim()}”.`}
                  action={
                    <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                      Clear filter
                    </Button>
                  }
                />
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function ApprovalsPage() {
  return (
    <Protected adminOnly>
      <ApprovalsScreen />
    </Protected>
  );
}
