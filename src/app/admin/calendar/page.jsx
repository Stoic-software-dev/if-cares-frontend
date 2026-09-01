'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarOff, ChevronDown, ChevronLeft, ChevronRight, Lock, Save, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { SiteSwitcher } from '@/components/shell/SiteSwitcher';
import { CALENDAR_TABS, SectionTabs } from '@/components/shell/SectionTabs';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ErrorState } from '@/components/ui/states';
import { UnsavedGuard } from '@/components/common/UnsavedGuard';
import { apiGet, apiPost, apiPut } from '@/lib/api-client';
import { ALL_MEALS_PATH, SITES_PATH, cachedGet, invalidate } from '@/lib/data-cache';
import { MEAL_KEYS, monthLabel, todayYmd, ymdOf } from '@/lib/calendar';
import { shortSiteName, sortSiteNames } from '@/lib/sites';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const dowOf = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
};

function CalendarScreen() {
  const siteFromUrl = useSearchParams().get('site');
  const today = todayYmd();

  const [sites, setSites] = useState(null);
  const [site, setSite] = useState('');
  const [days, setDays] = useState(null); // Map<ymd, meals>
  const [locked, setLocked] = useState(new Set());
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));

  const [patternOpen, setPatternOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [pendingSite, setPendingSite] = useState(null);
  // Holidays are read, never written into the calendar, so this screen has to
  // ask for them to be able to tell a holiday apart from a closed day.
  const [holidays, setHolidays] = useState({});
  const [effective, setEffective] = useState({});


  useEffect(() => {
    cachedGet(SITES_PATH)
      .then((list) => {
        const names = sortSiteNames(list.map((entry) => entry.name));
        setSites(names);
        setSite(siteFromUrl && names.includes(siteFromUrl) ? siteFromUrl : names[0] ?? '');
      })
      .catch((err) => setError(err.message));
  }, [siteFromUrl]);

  const loadSite = useCallback(() => {
    if (!site) return;
    setError('');
    setDays(null);
    Promise.all([
      apiGet(`/api/sites/service-days?site=${encodeURIComponent(site)}`),
      cachedGet(ALL_MEALS_PATH),
    ])
      .then(([res, allMeals]) => {
        const map = new Map();
        for (const day of res.days ?? []) {
          map.set(day.date, { brk: day.brk, lunch: day.lunch, snk: day.snk, sup: day.sup });
        }
        setDays(map);
        setLocked(new Set(allMeals?.[site]?.excludedDates ?? []));
        setHolidays(allMeals?.[site]?.holidays ?? {});
        // What the day serves AFTER holidays are subtracted. This screen edits
        // the raw calendar, so it keeps showing what is configured - but a day a
        // holiday closes entirely must not read as a day that serves meals.
        setEffective(allMeals?.[site]?.validDates ?? {});
        setDirty(false);
      })
      .catch((err) => setError(err.message));
  }, [site]);

  useEffect(loadSite, [loadSite]);

  // The most common meal combination at this site: what a newly opened day
  // starts with, so the admin edits an exception instead of building each day.
  const defaultMeals = useMemo(() => {
    if (!days || days.size === 0) return { brk: false, lunch: true, snk: false, sup: false };
    const tally = new Map();
    for (const meals of days.values()) {
      const key = JSON.stringify(meals);
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    const [best] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    return JSON.parse(best[0]);
  }, [days]);

  const monthCells = useMemo(() => {
    const { year, month } = cursor;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const cells = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= daysInMonth; day++) {
      const ymd = ymdOf(year, month, day);
      cells.push({
        day,
        ymd,
        meals: days?.get(ymd) ?? null,
        locked: locked.has(ymd),
        holiday: holidays[ymd] ?? '',
        // A holiday covers the day and nothing is left open: the configured
        // meals stay visible and editable, but muted, so the cell never claims
        // the site serves that day.
        closedByHoliday: Boolean(holidays[ymd]) && !effective[ymd],
      });
    }
    return cells;
  }, [cursor, days, locked, holidays, effective]);

  const monthStats = useMemo(() => {
    const prefix = `${cursor.year}-${String(cursor.month).padStart(2, '0')}`;
    let service = 0;
    for (const ymd of days?.keys() ?? []) if (ymd.startsWith(prefix)) service += 1;
    return { service };
  }, [days, cursor]);

  const setDay = (ymd, meals) => {
    setDirty(true);
    setDays((prev) => {
      const next = new Map(prev);
      if (!meals) next.delete(ymd);
      else next.set(ymd, meals);
      return next;
    });
  };

  const toggleDay = (cell) => {
    if (cell.locked) {
      toast.info('This day already has a submitted count, so the calendar cannot change it.');
      return;
    }
    if (cell.meals) setDay(cell.ymd, null);
    else setDay(cell.ymd, { ...defaultMeals });
  };

  const applyPattern = ({ from, to, weekdays, meals, replace }) => {
    setDirty(true);
    setDays((prev) => {
      const next = new Map(prev);
      const start = new Date(`${from}T00:00:00Z`);
      const end = new Date(`${to}T00:00:00Z`);
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const ymd = d.toISOString().slice(0, 10);
        if (locked.has(ymd)) continue;
        const matches = weekdays.includes(dowOf(ymd));
        if (matches) next.set(ymd, { ...meals });
        else if (replace) next.delete(ymd);
      }
      return next;
    });
  };

  const closeRange = ({ from, to }) => {
    setDirty(true);
    setDays((prev) => {
      const next = new Map(prev);
      for (const ymd of [...next.keys()]) {
        if (ymd >= from && ymd <= to && !locked.has(ymd)) next.delete(ymd);
      }
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = [...days.entries()].map(([date, meals]) => ({ date, ...meals }));
      await apiPut(`/api/sites/service-days?site=${encodeURIComponent(site)}`, { days: payload });
      // The dashboard and the reports read the calendar through the shared
      // cache; a saved change has to reach them.
      invalidate(ALL_MEALS_PATH);
      setDirty(false);
      toast.success(`Calendar saved for ${shortSiteName(site)}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const step = (delta) => {
    setCursor((prev) => {
      const month = prev.month + delta;
      if (month < 1) return { year: prev.year - 1, month: 12 };
      if (month > 12) return { year: prev.year + 1, month: 1 };
      return { ...prev, month };
    });
  };

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Service calendar"
          subtitle="Open or close service days, and set which meals each day serves."
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={!days}>
                    Bulk edit
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onSelect={() => setPatternOpen(true)}>
                    <Wand2 />
                    Apply a weekly pattern
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCloseOpen(true)}>
                    <CalendarOff />
                    Close a range of days
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={save} loading={saving} disabled={!dirty}>
                <Save />
                {dirty ? 'Save changes' : 'Saved'}
              </Button>
            </>
          }
        />

        <SectionTabs options={CALENDAR_TABS} ariaLabel="Calendar section" />

        {sites && (
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <SiteSwitcher
              sites={sites}
              value={site}
              onChange={(name) => (dirty ? setPendingSite(name) : setSite(name))}
              className="lg:w-[26rem]"
            />

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => step(-1)}>
                <ChevronLeft />
              </Button>
              <span className="min-w-[9rem] text-center text-[15px] font-bold tabular-nums text-foreground">
                {monthLabel(cursor.year, cursor.month)} {cursor.year}
              </span>
              <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => step(1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}

        {error && <ErrorState title="Couldn't load the calendar" message={error} onRetry={loadSite} />}

        {!days && !error && <Skeleton className="h-[460px] w-full rounded-lg" />}

        {days && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
              <Badge variant="brand">{monthStats.service} service days this month</Badge>
              <span>
                A tinted day serves meals. Click any day to change it. A lock means the day already has a
                count and cannot change.
              </span>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="grid grid-cols-7 border-b border-border bg-surface-sunken">
                {WEEKDAYS.map((weekday) => (
                  <div
                    key={weekday}
                    className="py-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    <span className="md:hidden">{weekday.slice(0, 1)}</span>
                    <span className="hidden md:inline">{weekday}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 p-1.5 md:gap-1.5 md:p-2">
                {monthCells.map((cell, index) =>
                  cell === null ? (
                    <div key={`blank-${index}`} className="h-16 md:h-[96px]" />
                  ) : (
                    <DayCell
                      key={cell.ymd}
                      cell={cell}
                      isToday={cell.ymd === today}
                      onToggle={() => toggleDay(cell)}
                      onMeals={(meals) => setDay(cell.ymd, meals)}
                    />
                  )
                )}
              </div>
            </div>

            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Changes are applied to the whole calendar of this site when you save. Days that already carry a
              submitted count are never rewritten.
            </p>
          </>
        )}
      </div>

      <PatternDialog
        open={patternOpen}
        onOpenChange={setPatternOpen}
        defaultMeals={defaultMeals}
        cursor={cursor}
        onApply={(config) => {
          applyPattern(config);
          setPatternOpen(false);
          toast.success('Pattern applied. Review the month and save.');
        }}
      />

      <CloseDaysDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        sites={sites ?? []}
        currentSite={site}
        cursor={cursor}
        onCloseHere={(range) => {
          closeRange(range);
          toast.success('Days closed here. Review the month and save.');
        }}
        onSaved={loadSite}
        lockedFor={locked}
      />

      <ConfirmDialog
        open={Boolean(pendingSite)}
        onOpenChange={(open) => !open && setPendingSite(null)}
        title="Switch site without saving?"
        description={`The changes to ${shortSiteName(site)} have not been written yet.`}
        consequences={['The calendar of this site goes back to what it was.']}
        confirmLabel="Switch site"
        tone="warning"
        onConfirm={async () => {
          setDirty(false);
          setSite(pendingSite);
          setPendingSite(null);
        }}
      />

      <UnsavedGuard
        enabled={dirty && !saving}
        title="Leave the calendar without saving?"
        description="The days you opened or closed have not been written yet."
        consequences={[
          'The calendar goes back to what the site had before.',
          'Nothing that already has a submitted count was going to change anyway.',
        ]}
      />
    </AppShell>
  );
}

function DayCell({ cell, isToday, onToggle, onMeals }) {
  const open = Boolean(cell.meals);
  const served = MEAL_KEYS.filter((meal) => cell.meals?.[meal.key]);

  // One target per day. The cell used to carry two - the number toggled the day
  // and a strip at the bottom opened the meals - which is two meanings inside a
  // box the size of a thumb. Now the whole cell opens one panel that says what
  // the day is and what it serves.
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={cell.locked}
          aria-label={`${cell.ymd}, ${cell.holiday ? cell.holiday : open ? 'service day' : 'closed'}`}
          className={cn(
            'relative flex h-16 w-full flex-col rounded-md border p-1.5 text-left outline-none transition-colors md:h-[96px] md:p-2',
            open && !cell.closedByHoliday
              ? 'border-primary-border bg-primary-soft'
              : 'border-border bg-card',
            isToday && 'ring-1 ring-primary',
            cell.locked ? 'cursor-default' : 'hover:border-primary focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <span className="flex items-start justify-between">
            <span
              className={cn(
                'text-[13px] font-bold tabular-nums md:text-[14px]',
                open ? 'text-primary-strong dark:text-primary' : 'text-muted-foreground'
              )}
            >
              {cell.day}
            </span>
            {cell.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
          </span>

          {cell.holiday && (
            <span
              title={cell.holiday}
              className="mt-0.5 truncate rounded-xs bg-info-soft px-1 py-px text-[10px] font-semibold text-info-text"
            >
              {cell.holiday}
            </span>
          )}

          {open && (
            <span className={cn('mt-auto flex flex-wrap gap-1', cell.closedByHoliday && 'opacity-50')}>
              {served.length === 0 ? (
                <span className="text-[10px] font-semibold text-destructive-text">No meal</span>
              ) : (
                served.map((meal) => (
                  <span
                    key={meal.key}
                    className={cn(
                      'rounded-xs px-1 text-[10px] font-semibold',
                      cell.closedByHoliday
                        ? 'bg-muted text-muted-foreground line-through'
                        : 'bg-card/70 text-primary-strong dark:text-primary'
                    )}
                  >
                    {meal.short}
                  </span>
                ))
              )}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-60 p-3">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-foreground">Service day</span>
          <Switch checked={open} onCheckedChange={onToggle} />
        </label>

        {open && (
          <>
            <p className="mb-2 mt-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Meals served
            </p>
            <div className="flex flex-col gap-1">
              {MEAL_KEYS.map((meal) => (
                <label
                  key={meal.key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-sm px-1.5 py-1.5 transition-colors hover:bg-accent"
                >
                  <Checkbox
                    checked={Boolean(cell.meals?.[meal.key])}
                    onCheckedChange={(value) => onMeals({ ...cell.meals, [meal.key]: Boolean(value) })}
                  />
                  <span className="text-[13px] font-medium text-foreground">{meal.label}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PatternDialog({ open, onOpenChange, defaultMeals, cursor, onApply }) {
  const monthStart = ymdOf(cursor.year, cursor.month, 1);
  const monthEnd = ymdOf(cursor.year, cursor.month, new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate());

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(monthEnd);
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4]);
  const [meals, setMeals] = useState(defaultMeals);
  const [replace, setReplace] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFrom(monthStart);
    setTo(monthEnd);
    setMeals(defaultMeals);
    setReplace(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mealsChosen = MEAL_KEYS.some((meal) => meals[meal.key]);
  const valid = from && to && from <= to && weekdays.length > 0 && mealsChosen;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply a weekly pattern</DialogTitle>
          <DialogDescription>
            Opens every matching weekday in the range with the meals you pick. Days with a submitted count are
            left untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="pattern-from">
            <Input id="pattern-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field
            label="To"
            htmlFor="pattern-to"
            error={from && to && from > to ? 'It ends before it starts.' : undefined}
          >
            <Input id="pattern-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-foreground">Days of the week</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((label, index) => {
              const active = weekdays.includes(index);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    setWeekdays((prev) =>
                      prev.includes(index) ? prev.filter((day) => day !== index) : [...prev, index]
                    )
                  }
                  className={cn(
                    'h-10 w-12 rounded-md border text-[12.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-card text-muted-foreground hover:border-border-strong'
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-foreground">Meals served</span>
          <div className="grid grid-cols-2 gap-1.5">
            {MEAL_KEYS.map((meal) => (
              <label
                key={meal.key}
                className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-accent"
              >
                <Checkbox
                  checked={Boolean(meals[meal.key])}
                  onCheckedChange={(value) => setMeals((prev) => ({ ...prev, [meal.key]: Boolean(value) }))}
                />
                <span className="text-[13px] font-medium text-foreground">{meal.label}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-md bg-muted p-3">
          <Checkbox checked={replace} onCheckedChange={(value) => setReplace(Boolean(value))} />
          <span className="text-[12.5px] leading-relaxed text-muted-foreground">
            Also close the days in the range that do not match the pattern. Use this to rebuild a month from
            scratch.
          </span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={() => onApply({ from, to, weekdays, meals, replace })}>
            Apply pattern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Closing days is the holiday action of the current model: a day with no meals
// is a day the site does not serve. Applying it to several sites at once is the
// "remove a holiday across all sites" requirement (3.6), done site by site.
function CloseDaysDialog({ open, onOpenChange, sites, currentSite, cursor, onCloseHere, onSaved, lockedFor }) {
  const monthStart = ymdOf(cursor.year, cursor.month, 1);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(monthStart);
  const [scope, setScope] = useState('this');
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!open) return;
    setFrom(monthStart);
    setTo(monthStart);
    setScope('this');
    setSelected([]);
    setQuery('');
    setProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const targets = scope === 'this' ? [currentSite] : selected;
  const valid = from && to && from <= to && targets.length > 0;

  const visibleSites = sites.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));

  // Putting the days back is the whole point of handing them to the client: a
  // month closed at forty sites by mistake used to be forty manual repairs.
  const undoClose = async (days) => {
    try {
      const res = await apiPut('/api/sites/service-days/close', { days });
      invalidate(ALL_MEALS_PATH);
      onSaved();
      toast.success(`${res.restored} days reopened.`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const applyToOtherSites = async () => {
    setProgress({ sites: targets.length });
    const res = await apiPost('/api/sites/service-days/close', { sites: targets, from, to });
    invalidate(ALL_MEALS_PATH);
    onSaved();

    const removed = res.days ?? [];
    toast.success(`${res.closed} days closed at ${res.sites} ${res.sites === 1 ? 'site' : 'sites'}.`, {
      description: res.kept
        ? `${res.kept} days already had a submitted count and stayed open.`
        : undefined,
      // Long enough to notice the mistake and act on it.
      duration: 30_000,
      action: removed.length ? { label: 'Undo', onClick: () => undoClose(removed) } : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Close service days</DialogTitle>
          <DialogDescription>
            A closed day serves no meals and cannot receive a count. Days that already have one stay as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="close-from">
            <Input id="close-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To" htmlFor="close-to">
            <Input id="close-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-foreground">Apply to</span>
          <div className="flex flex-col gap-1.5">
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5">
              <input
                type="radio"
                name="close-scope"
                checked={scope === 'this'}
                onChange={() => setScope('this')}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span className="text-[13px] text-foreground">
                This site only, <span className="font-semibold">{shortSiteName(currentSite)}</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5">
              <input
                type="radio"
                name="close-scope"
                checked={scope === 'many'}
                onChange={() => setScope('many')}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span className="text-[13px] text-foreground">Several sites at once</span>
            </label>
          </div>
        </div>

        {scope === 'many' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <SearchInput value={query} onChange={setQuery} placeholder="Filter sites" className="h-10 flex-1" />
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 shrink-0"
                onClick={() => setSelected(selected.length === sites.length ? [] : sites)}
              >
                {selected.length === sites.length ? 'None' : 'All'}
              </Button>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-md border border-border">
              {visibleSites.map((name) => {
                const checked = selected.includes(name);
                return (
                  <label
                    key={name}
                    className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2.5 text-[13px] transition-colors last:border-b-0 hover:bg-accent"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() =>
                        setSelected((prev) => (checked ? prev.filter((item) => item !== name) : [...prev, name]))
                      }
                    />
                    <span className="truncate text-foreground">{shortSiteName(name)}</span>
                  </label>
                );
              })}
            </div>
            <span className="text-[12px] text-muted-foreground">{selected.length} sites selected</span>
          </div>
        )}

        {progress && (
          <p className="rounded-md bg-muted px-3 py-2 text-[12.5px] tabular-nums text-muted-foreground">
            Closing the range at {progress.sites} sites.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {scope === 'this' ? (
            <Button
              disabled={!valid}
              onClick={() => {
                onCloseHere({ from, to });
                onOpenChange(false);
              }}
            >
              Close these days
            </Button>
          ) : (
            <CloseManyButton disabled={!valid} onRun={applyToOtherSites} onDone={() => onOpenChange(false)} count={targets.length} />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseManyButton({ disabled, onRun, onDone, count }) {
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const places = `${count} ${count === 1 ? 'site' : 'sites'}`;

  return (
    <>
      <Button variant="destructive" disabled={disabled} loading={running} onClick={() => setConfirm(true)}>
        Close at {places}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Close these days at ${places}?`}
        description="All of them are written together, in a single operation."
        consequences={[
          'Those days stop accepting meal counts at every selected site.',
          'Days that already have a submitted count are left exactly as they are.',
          'The change is written immediately, not with the Save button.',
          'It can be undone right afterwards, from the message that confirms it.',
        ]}
        confirmLabel="Close the days"
        successTitle="Days closed"
        successDescription="Undo is available for half a minute in the message on screen."
        onConfirm={async () => {
          setRunning(true);
          try {
            await onRun();
          } finally {
            setRunning(false);
          }
          onDone();
        }}
      />
    </>
  );
}

export default function AdminCalendarPage() {
  return (
    <Protected adminOnly>
      <Suspense fallback={null}>
        <CalendarScreen />
      </Suspense>
    </Protected>
  );
}
