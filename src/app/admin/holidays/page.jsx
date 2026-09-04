'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { SITES_TABS, SectionTabs } from '@/components/shell/SectionTabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Fab } from '@/components/ui/mobile';
import { Pagination } from '@/components/ui/pagination';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchInput } from '@/components/ui/search-input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { ALL_MEALS_PATH, SITES_PATH, invalidate, useCachedGet } from '@/lib/data-cache';
import { todayYmd } from '@/lib/calendar';
import { shortSiteName, sortSiteNames } from '@/lib/sites';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 15;

const MEALS = [
  { key: 'brk', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snk', label: 'Snack' },
  { key: 'sup', label: 'Supper' },
];

const blank = () => ({
  name: '',
  startDate: '',
  endDate: '',
  allSites: true,
  allMeals: true,
  brk: false,
  lunch: false,
  snk: false,
  sup: false,
  sites: [],
});

function dateRange(holiday) {
  const format = (ymd) =>
    new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  if (holiday.startDate === holiday.endDate) return format(holiday.startDate);
  return `${format(holiday.startDate)} to ${format(holiday.endDate)}`;
}

function HolidaysScreen() {
  const [holidays, setHolidays] = useState(null);
  const [error, setError] = useState('');
  const [scope, setScope] = useState('upcoming');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState(null); // holiday id, or 'new'
  const [draft, setDraft] = useState(blank());
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [siteQuery, setSiteQuery] = useState('');

  const siteList = useCachedGet(SITES_PATH);
  const allSiteNames = useMemo(
    () => (siteList.data ? sortSiteNames(siteList.data.map((entry) => entry.name)) : []),
    [siteList.data]
  );

  const load = () => {
    setError('');
    apiGet('/api/holidays')
      .then((res) => setHolidays(res.data))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);
  useEffect(() => {
    setPage(1);
  }, [query, scope]);

  const today = todayYmd();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (holidays ?? [])
      .filter((holiday) => (scope === 'upcoming' ? holiday.endDate >= today : holiday.endDate < today))
      .filter((holiday) =>
        q ? [holiday.name, ...holiday.sites].join(' ').toLowerCase().includes(q) : true
      );
  }, [holidays, scope, query, today]);

  const counts = useMemo(() => {
    const list = holidays ?? [];
    return {
      upcoming: list.filter((holiday) => holiday.endDate >= today).length,
      past: list.filter((holiday) => holiday.endDate < today).length,
    };
  }, [holidays, today]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const openNew = () => {
    setDraft(blank());
    setAttempted(false);
    setSiteQuery('');
    setEditing('new');
  };

  const openEdit = (holiday) => {
    setDraft({ ...holiday, sites: holiday.sites ?? [] });
    setAttempted(false);
    setSiteQuery('');
    setEditing(holiday.id);
  };

  const valid =
    draft.name.trim().length >= 2 &&
    draft.startDate &&
    draft.endDate &&
    draft.startDate <= draft.endDate &&
    (draft.allSites || draft.sites.length > 0) &&
    (draft.allMeals || draft.brk || draft.lunch || draft.snk || draft.sup);

  const save = async () => {
    if (!valid) {
      setAttempted(true);
      return;
    }
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate,
      allSites: draft.allSites,
      allMeals: draft.allMeals,
      brk: draft.brk,
      lunch: draft.lunch,
      snk: draft.snk,
      sup: draft.sup,
      sites: draft.allSites ? [] : draft.sites,
    };
    try {
      if (editing === 'new') await apiPost('/api/holidays', payload);
      else await apiPatch(`/api/holidays/${editing}`, payload);
      // The calendar every screen reads has to reflect it right away.
      invalidate(ALL_MEALS_PATH);
      setEditing(null);
      toast.success(editing === 'new' ? 'Holiday added' : 'Holiday saved');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const res = await fetch(`/api/holidays/${removing.id}`, { method: 'DELETE' });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.result === 'error') {
      throw new Error(body?.message || 'Could not remove the holiday.');
    }
    invalidate(ALL_MEALS_PATH);
    load();
  };

  const visibleSites = allSiteNames.filter((name) =>
    name.toLowerCase().includes(siteQuery.trim().toLowerCase())
  );

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Holidays"
          subtitle={
            holidays
              ? `${counts.upcoming} upcoming, ${counts.past} past`
              : 'Loading the holiday calendar'
          }
          actions={
            <Button onClick={openNew} className="hidden md:inline-flex">
              <Plus />
              Add holiday
            </Button>
          }
        />

        <SectionTabs options={SITES_TABS} ariaLabel="Sites section" />

        <div className="flex flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center">
          <Segmented
            ariaLabel="Filter holidays"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
              { value: 'past', label: 'Past', count: counts.past },
            ]}
            className="md:w-auto"
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name or site"
            className="md:ml-auto md:min-w-[13rem] md:max-w-sm md:flex-1"
          />
        </div>

        {error && <ErrorState title="Couldn't load the holidays" message={error} onRetry={load} />}

        {!holidays && !error && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-lg" />
            ))}
          </div>
        )}

        {holidays && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-strong bg-card">
            <EmptyState
              icon={CalendarOff}
              title={query ? 'No holiday matches' : scope === 'upcoming' ? 'No holidays ahead' : 'No past holidays'}
              description={
                query
                  ? 'Try a different name, or clear the search.'
                  : 'A holiday closes the days it covers at the sites you choose, and the calendar shows its name.'
              }
              action={
                query ? (
                  <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                ) : (
                  <Button size="sm" onClick={openNew}>
                    <Plus />
                    Add holiday
                  </Button>
                )
              }
            />
          </div>
        )}

        {pageRows.length > 0 && (
          <div className="flex flex-col gap-2">
            {pageRows.map((holiday) => (
              <article
                key={holiday.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning-text">
                  <CalendarOff className="h-4 w-4" />
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[14px] font-semibold text-foreground">{holiday.name}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    <span className="tabular-nums">{dateRange(holiday)}</span>
                    <span>
                      {holiday.allSites
                        ? 'Every site'
                        : `${holiday.sites.length} ${holiday.sites.length === 1 ? 'site' : 'sites'}`}
                    </span>
                    {!holiday.allMeals && (
                      <span className="flex flex-wrap gap-1">
                        {MEALS.filter((meal) => holiday[meal.key]).map((meal) => (
                          <Badge key={meal.key} size="sm" variant="neutral">
                            {meal.label}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </span>
                  {!holiday.allSites && holiday.sites.length > 0 && (
                    <span className="truncate text-[12px] text-muted-foreground">
                      {holiday.sites.map(shortSiteName).join(', ')}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(holiday)}>
                    <Pencil />
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Remove holiday" onClick={() => setRemoving(holiday)}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        <Pagination
          page={current}
          pageCount={pageCount}
          onPageChange={setPage}
          total={rows.length}
          pageSize={PAGE_SIZE}
          label="holidays"
        />
      </div>

      <Fab icon={Plus} onClick={openNew}>
        Add holiday
      </Fab>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add a holiday' : 'Edit holiday'}</DialogTitle>
            <DialogDescription>
              The days stay on the calendar and the holiday is subtracted from them, so removing it later
              puts them straight back. Days that already have a count are never affected.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto pr-1">
            <Field
              label="Name"
              htmlFor="holiday-name"
              error={attempted && draft.name.trim().length < 2 ? 'Give the holiday a name.' : undefined}
            >
              <Input
                id="holiday-name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Thanksgiving break"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" htmlFor="holiday-from">
                <Input
                  id="holiday-from"
                  type="date"
                  value={draft.startDate}
                  onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
                />
              </Field>
              <Field
                label="To"
                htmlFor="holiday-to"
                error={
                  attempted && draft.startDate && draft.endDate && draft.startDate > draft.endDate
                    ? 'It ends before it starts.'
                    : undefined
                }
              >
                <Input
                  id="holiday-to"
                  type="date"
                  value={draft.endDate}
                  onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Applies to
              </span>
              <RadioGroup
                value={draft.allSites ? 'all' : 'some'}
                onValueChange={(value) => setDraft({ ...draft, allSites: value === 'all' })}
                className="flex flex-col gap-2"
              >
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-[13px]">
                  <RadioGroupItem value="all" id="holiday-all-sites" />
                  <span className="text-foreground">Every site</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-[13px]">
                  <RadioGroupItem value="some" id="holiday-some-sites" />
                  <span className="text-foreground">Only the sites I pick</span>
                </label>
              </RadioGroup>
            </div>

            {!draft.allSites && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <SearchInput value={siteQuery} onChange={setSiteQuery} placeholder="Filter sites" className="h-10 flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        sites: draft.sites.length === allSiteNames.length ? [] : allSiteNames,
                      })
                    }
                  >
                    {draft.sites.length === allSiteNames.length ? 'None' : 'All'}
                  </Button>
                </div>
                <div className="max-h-44 overflow-y-auto rounded-md border border-border">
                  {visibleSites.map((name) => {
                    const checked = draft.sites.includes(name);
                    return (
                      <label
                        key={name}
                        className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2.5 text-[13px] last:border-b-0 hover:bg-accent"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            setDraft({
                              ...draft,
                              sites: checked
                                ? draft.sites.filter((item) => item !== name)
                                : [...draft.sites, name],
                            })
                          }
                        />
                        <span className="truncate text-foreground">{shortSiteName(name)}</span>
                      </label>
                    );
                  })}
                </div>
                <span
                  className={cn(
                    'text-[12px]',
                    attempted && draft.sites.length === 0 ? 'text-destructive-text' : 'text-muted-foreground'
                  )}
                >
                  {draft.sites.length} selected
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Closes
              </span>
              <RadioGroup
                value={draft.allMeals ? 'all' : 'some'}
                onValueChange={(value) => setDraft({ ...draft, allMeals: value === 'all' })}
                className="flex flex-col gap-2"
              >
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-[13px]">
                  <RadioGroupItem value="all" id="holiday-all-meals" />
                  <span className="text-foreground">The whole day</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-[13px]">
                  <RadioGroupItem value="some" id="holiday-some-meals" />
                  <span className="text-foreground">Only some meals</span>
                </label>
              </RadioGroup>

              {!draft.allMeals && (
                <div className="flex flex-wrap gap-3 rounded-md border border-border px-3 py-2.5">
                  {MEALS.map((meal) => (
                    <label key={meal.key} className="flex cursor-pointer items-center gap-2 text-[13px]">
                      <Checkbox
                        checked={Boolean(draft[meal.key])}
                        onCheckedChange={() => setDraft({ ...draft, [meal.key]: !draft[meal.key] })}
                      />
                      <span className="text-foreground">{meal.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing === 'new' ? 'Add holiday' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Remove ${removing.name}?` : 'Remove holiday?'}
        description="The days it covered go back to being service days."
        consequences={[
          'Those days start accepting meal counts again at every site the holiday covered.',
          'Days that already have a count are unaffected, as they always were.',
        ]}
        confirmLabel="Remove holiday"
        successTitle="Holiday removed"
        successDescription="The calendar is back to what it was before it was added."
        onConfirm={remove}
      />
    </AppShell>
  );
}

export default function HolidaysPage() {
  return (
    <Protected adminOnly>
      <HolidaysScreen />
    </Protected>
  );
}
