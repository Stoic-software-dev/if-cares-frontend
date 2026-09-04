'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CalendarOff, CircleCheck, Clock, FileCheck2, RotateCcw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { assignedSiteNames, isAdmin, useAuth } from '@/components/auth/AuthProvider';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { RosterRow } from '@/components/meal-count/RosterRow';
import { SignatureField } from '@/components/meal-count/SignatureField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { SearchInput } from '@/components/ui/search-input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { UnsavedGuard } from '@/components/common/UnsavedGuard';
import { apiGet, apiPost, apiPut } from '@/lib/api-client';
import { ALL_MEALS_PATH, cachedGet, invalidate } from '@/lib/data-cache';
import { MEAL_KEYS, dateLabel, mealsOrAll, todayYmd } from '@/lib/calendar';
import { shortSiteName } from '@/lib/sites';
import { cn } from '@/lib/utils';

const ATTENDANCE = { key: 'att', label: 'Attendance', short: 'Att' };
const EMPTY_MARKS = { att: false, brk: false, lunch: false, snk: false, sup: false };

// Drafts live only in this browser and only until the count is submitted. They
// exist because a phone can die, lose signal or be backgrounded halfway through
// a 250 student roster.
function readDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraft(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the screen still works, it just cannot recover.
  }
}

function clearDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

// Legacy submit order: number, name, age, attendance, breakfast, lunch, snack, supper.
const toRow = (student, marks) => [
  student.number,
  student.name,
  student.age,
  marks.att,
  marks.brk,
  marks.lunch,
  marks.snk,
  marks.sup,
];

const voidedStamp = (iso) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

function MealCountScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const today = todayYmd();
  const iso = searchParams.get('date') ?? today;
  const site = searchParams.get('site') ?? assignedSiteNames(user)?.[0] ?? '';
  // Admin correction of an already-submitted count (STOIC-2201): rows come from
  // the submitted entries, prefilled, and saving records a correction.
  const correcting = searchParams.get('correct') === '1' && isAdmin(user);
  const admin = isAdmin(user);

  const [roster, setRoster] = useState(null);
  const [dayMeals, setDayMeals] = useState(null);
  const [blocked, setBlocked] = useState(null); // { kind, title, message }
  const [loadError, setLoadError] = useState('');

  const [marks, setMarks] = useState(new Map());
  const [timeIn, setTimeIn] = useState('15:30');
  const [timeOut, setTimeOut] = useState('');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [rosterFilter, setRosterFilter] = useState('all');
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const getSignature = useRef(null);
  const [signed, setSigned] = useState(false);
  // A day can look empty because a count for it was thrown out. Only an
  // administrator sees this, and only they can put it back.
  const [voided, setVoided] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState(false);
  // How far the roster moved under a restored draft, when it did.
  const [draftDrift, setDraftDrift] = useState(null);

  // One draft per site and day, on this device only.
  const draftKey = `ifc.draft.${site}|${iso}`;


  const load = () => {
    setLoadError('');
    setBlocked(null);
    setRoster(null);

    if (correcting) {
      apiGet(`/api/meal-counts/detail?site=${encodeURIComponent(site)}&date=${iso}`)
        .then(({ data }) => {
          const rows = data.entries.map((entry, index) => ({
            id: `entry-${index}`,
            number: entry.number,
            name: entry.name,
            age: entry.age ?? '',
          }));
          setRoster(rows);
          setMarks(
            new Map(
              data.entries.map((entry, index) => [
                `entry-${index}`,
                {
                  att: entry.attendance,
                  brk: entry.breakfast,
                  lunch: entry.lunch,
                  snk: entry.snack,
                  sup: entry.supper,
                },
              ])
            )
          );
          // The columns a correction can touch: what the day already carries,
          // plus what its calendar says it serves. Deriving them from the
          // entries alone made the commonest correction impossible - a meal
          // nobody was ticked for had no column to tick it in.
          const served = {
            brk: data.entries.some((e) => e.breakfast),
            lunch: data.entries.some((e) => e.lunch),
            snk: data.entries.some((e) => e.snack),
            sup: data.entries.some((e) => e.supper),
          };
          const day = data.dayMeals ?? {};
          setDayMeals(
            mealsOrAll({
              brk: served.brk || Boolean(day.brk),
              lunch: served.lunch || Boolean(day.lunch),
              snk: served.snk || Boolean(day.snk),
              sup: served.sup || Boolean(day.sup),
            })
          );
          setTimeIn(data.timeIn ? data.timeIn.slice(0, 5) : '');
          setTimeOut(data.timeOut ? data.timeOut.slice(0, 5) : '');
        })
        .catch((err) => setLoadError(err.message));
      return;
    }

    // The service calendar is checked before the roster loads: a day that is
    // not open, or already submitted, is answered here instead of failing at
    // submit time after the whole roster was marked by hand.
    Promise.all([
      // Short window: this read is the guard that tells the user the day is
      // closed or already filed before they mark 250 students.
      cachedGet(ALL_MEALS_PATH, { maxAge: 15_000 }),
      apiGet(`/api/students/roster?site=${encodeURIComponent(site)}`),
    ])
      .then(([all, rows]) => {
        const siteData = all?.[site];
        const open = siteData?.validDates?.[iso];
        const alreadySubmitted = (siteData?.excludedDates ?? []).includes(iso);

        if (alreadySubmitted) {
          setBlocked({
            kind: 'submitted',
            title: 'This count was already submitted',
            message: 'Submitted counts are locked. An administrator can correct them from the count itself.',
          });
          return;
        }
        if (iso > today) {
          setBlocked({
            kind: 'future',
            title: 'This day has not happened yet',
            message: 'Counts are taken at the point of service, so a future date cannot be submitted.',
          });
          return;
        }
        if (!open) {
          setBlocked({
            kind: 'closed',
            title: 'Not a service day',
            message: 'The site calendar has no meals scheduled for this date. Ask an administrator if that is wrong.',
          });
          return;
        }

        setDayMeals(mealsOrAll(open));
        setRoster(rows);

        // A draft from this device wins over an empty roster: a reload, a
        // crash or a browser killed in the background must not cost the marks
        // already taken at the point of service.
        //
        // It used to be all or nothing, and matched on the roster being
        // IDENTICAL - so one student added or removed while the phone was in a
        // pocket threw away every mark already taken, silently. Now the marks
        // that still have a student are kept and the difference is said out
        // loud, because the alternative is somebody re-ticking two hundred
        // names without ever learning why.
        const draft = readDraft(draftKey);
        const saved = new Map(draft?.marks ?? []);
        const kept = rows.filter((student) => saved.has(student.id));
        if (draft && kept.length) {
          setMarks(new Map(rows.map((student) => [student.id, saved.get(student.id) ?? { ...EMPTY_MARKS }])));
          setTimeIn(draft.timeIn ?? '15:30');
          setTimeOut(draft.timeOut ?? '');
          setRestored(true);
          setDirty(true);
          setDraftDrift(
            kept.length === saved.size && kept.length === rows.length
              ? null
              : { added: rows.length - kept.length, gone: saved.size - kept.length }
          );
        } else {
          if (draft) clearDraft(draftKey);
          setDraftDrift(null);
          setMarks(new Map(rows.map((student) => [student.id, { ...EMPTY_MARKS }])));
        }
      })
      .catch((err) => setLoadError(err.message));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [site, iso, correcting, today, draftKey]);

  useEffect(() => {
    if (!admin || !site || !iso || correcting) return;
    let alive = true;
    apiGet(`/api/meal-counts/void?site=${encodeURIComponent(site)}&date=${iso}`)
      .then((res) => alive && setVoided(res.data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [admin, site, iso, correcting]);

  const restoreVoided = async () => {
    setRestoring(true);
    try {
      await apiPut('/api/meal-counts/void', { site, date: iso });
      invalidate(ALL_MEALS_PATH);
      toast.success('Count restored');
      router.push(`/counts/${iso}?site=${encodeURIComponent(site)}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRestoring(false);
    }
  };


  const meals = useMemo(() => {
    const served = MEAL_KEYS.filter((meal) => dayMeals?.[meal.key]);
    return [ATTENDANCE, ...served];
  }, [dayMeals]);

  // Stable across renders so the memoized rows only re-render when their own
  // marks change.
  const toggle = useCallback((studentId, key) => {
    setDirty(true);
    setMarks((prev) => {
      const next = new Map(prev);
      const current = next.get(studentId) ?? { ...EMPTY_MARKS };
      const value = !current[key];
      // Meals are only served to students who were there: unmarking attendance
      // clears the meals with it, so a row can never claim a meal for someone
      // absent.
      const updated = key === 'att' && !value ? { ...EMPTY_MARKS } : { ...current, [key]: value };
      next.set(studentId, updated);
      return next;
    });
  }, []);

  // Every change is written to the device, so recovery does not depend on
  // remembering to press anything.
  useEffect(() => {
    if (correcting || !dirty || !roster) return;
    writeDraft(draftKey, { marks: [...marks.entries()], timeIn, timeOut, savedAt: Date.now() });
  }, [marks, timeIn, timeOut, dirty, correcting, roster, draftKey]);

  const discardDraft = () => {
    clearDraft(draftKey);
    setMarks(new Map((roster ?? []).map((student) => [student.id, { ...EMPTY_MARKS }])));
    setTimeIn('15:30');
    setTimeOut('');
    setRestored(false);
    setDraftDrift(null);
    setDirty(false);
  };

  const markedCount = useMemo(
    () => (roster ?? []).filter((student) => marks.get(student.id)?.att).length,
    [roster, marks]
  );

  // Column action: give a meal to everyone already marked present, or take it
  // back from all of them. Saves 200 taps on a full roster.
  const toggleColumn = (key) => {
    setDirty(true);
    setMarks((prev) => {
      const next = new Map(prev);
      const present = (roster ?? []).filter((student) => next.get(student.id)?.att);
      const allOn = present.length > 0 && present.every((student) => next.get(student.id)?.[key]);
      for (const student of present) {
        const current = next.get(student.id);
        next.set(student.id, { ...current, [key]: !allOn });
      }
      return next;
    });
  };

  const visibleRoster = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (roster ?? []).filter((student) => {
      if (rosterFilter === 'unmarked' && marks.get(student.id)?.att) return false;
      if (!q) return true;
      return student.name.toLowerCase().includes(q) || String(student.number) === q;
    });
  }, [roster, query, rosterFilter, marks]);

  const missing = [];
  if (!timeIn) missing.push('time in');
  if (!timeOut) missing.push('time out');
  if (markedCount === 0) missing.push('attendance');
  if (!signed && !correcting) missing.push('signature');
  const canSubmit = missing.length === 0 && !submitting;

  const submit = async () => {
    if (missing.length > 0) {
      setAttempted(true);
      toast.error(`Still missing: ${missing.join(', ')}.`);
      return;
    }
    setSubmitting(true);
    const rows = roster.map((student) => toRow(student, marks.get(student.id)));

    try {
      if (correcting) {
        await apiPost('/api/meal-counts/correct', {
          site,
          date: iso,
          timeIn,
          timeOut,
          note: note.trim(),
          data: rows,
        });
        invalidate(ALL_MEALS_PATH);
        setDirty(false);
        toast.success(`Correction saved for ${dateLabel(iso)}`);
        router.push(`/counts/${iso}?site=${encodeURIComponent(site)}`);
        return;
      }
      await apiPost('/api/meal-counts', {
        actionType: 'mealCount',
        values: {
          site,
          // Noon UTC resolves to the intended calendar day in the program
          // timezone regardless of the device's own timezone.
          date: `${iso}T12:00:00.000Z`,
          timeIn,
          timeOut,
          signature: getSignature.current ? getSignature.current() : '',
          data: rows,
        },
      });
      // The day just moved from missing to submitted everywhere.
      invalidate(ALL_MEALS_PATH);
      clearDraft(draftKey);
      setDirty(false);
      toast.success(`Meal count submitted for ${dateLabel(iso)}`);
      router.push(`/counts/${iso}?site=${encodeURIComponent(site)}`);
    } catch (err) {
      // A site on a weak connection needs to know the marks are still here.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      toast.error(offline ? 'No connection' : err.message, {
        description: 'Everything you marked is saved on this device. Try again when you have signal.',
      });
      setSubmitting(false);
    }
  };

  const title = correcting ? `Correcting ${dateLabel(iso)}` : dateLabel(iso);
  const subtitle = shortSiteName(site);

  if (loadError) {
    return (
      <AppShell>
        <ErrorState title="Couldn't load this count" message={loadError} onRetry={load} />
      </AppShell>
    );
  }

  if (blocked) {
    return (
      <AppShell>
        <PageHeader title={title} subtitle={subtitle} backHref="/dashboard" backLabel="Back to dashboard" />
        <div className="mt-5 rounded-lg border border-border bg-card">
          <EmptyState
            icon={blocked.kind === 'submitted' ? FileCheck2 : CalendarOff}
            title={blocked.title}
            description={blocked.message}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {blocked.kind === 'submitted' && (
                  <Button asChild>
                    <Link href={`/counts/${iso}?site=${encodeURIComponent(site)}`}>Open the count</Link>
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link href="/dashboard">Back to dashboard</Link>
                </Button>
              </div>
            }
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Extra room on phones so the sticky submit bar never covers the last field. */}
      <div className="flex flex-col gap-5 pb-24 md:pb-0">
        {voided && (
          <div className="flex flex-col gap-2 rounded-lg border border-warning-border bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-warning-text">
                A count for this day was voided
              </span>
              <span className="text-[12.5px] leading-relaxed text-warning-text/90">
                {voided.by} voided it, {voidedStamp(voided.at)}
                {voided.reason ? `, "${voided.reason}"` : ''}. It had {voided.students}{' '}
                {voided.students === 1 ? 'student' : 'students'} on record.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              loading={restoring}
              onClick={restoreVoided}
              className="shrink-0"
            >
              {!restoring && <Undo2 />}
              Restore it
            </Button>
          </div>
        )}

        <PageHeader
          title={title}
          subtitle={subtitle}
          backHref="/dashboard"
          backLabel="Back to dashboard"
          actions={
            meals.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {meals.slice(1).map((meal) => (
                  <Badge key={meal.key} variant="brand" size="lg">
                    {meal.label}
                  </Badge>
                ))}
              </div>
            )
          }
        />

        {restored && !correcting && (
          <div className="flex flex-col gap-2 rounded-lg border border-info-border bg-info-soft px-3.5 py-3 text-[13px] leading-relaxed text-info-text sm:flex-row sm:items-center">
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              Marks from this device were restored. Nothing was submitted yet.
              {draftDrift && (
                <>
                  {' '}
                  The roster changed since then
                  {draftDrift.added > 0 && `, ${draftDrift.added} name${draftDrift.added > 1 ? 's' : ''} added`}
                  {draftDrift.gone > 0 && `, ${draftDrift.gone} removed`}
                  {' '}— check the new rows before submitting.
                </>
              )}
            </span>
            <Button variant="outline" size="sm" onClick={discardDraft} className="shrink-0">
              Start over
            </Button>
          </div>
        )}

        {correcting && (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-soft px-3.5 py-3 text-[13px] leading-relaxed text-warning-text">
            <Undo2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              You are editing a count that was already submitted. The original values stay on record as a
              correction history, with your name and the time of the change.
            </span>
          </div>
        )}

        <section className="flex flex-col gap-2.5">
          <SectionLabel icon={Clock}>Service time</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5 md:max-w-md">
            <TimeField label="In" value={timeIn} onChange={setTimeIn} invalid={attempted && !timeIn} />
            <TimeField label="Out" value={timeOut} onChange={setTimeOut} invalid={attempted && !timeOut} required />
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel icon={CircleCheck}>Roster</SectionLabel>
            {roster && (
              <span className="text-[12.5px] font-semibold tabular-nums text-foreground">
                {markedCount} of {roster.length} present
              </span>
            )}
          </div>

          <Progress value={roster?.length ? (markedCount / roster.length) * 100 : 0} label="Attendance progress" />

          {roster && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Find a student"
                className="sm:max-w-xs"
              />
              <Segmented
                ariaLabel="Roster filter"
                value={rosterFilter}
                onChange={setRosterFilter}
                options={[
                  { value: 'all', label: 'All', count: roster.length },
                  { value: 'unmarked', label: 'Not marked', count: roster.length - markedCount },
                ]}
                className="sm:w-auto"
              />
            </div>
          )}

          {!roster && (
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-[68px] md:h-[58px]" />
              ))}
            </div>
          )}

          {roster && (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {/* Column header doubles as a bulk action per meal. */}
              <div className="hidden items-center gap-4 border-b border-border bg-surface-sunken px-4 py-2 md:flex">
                <div className="flex w-[22rem] shrink-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <span>Student</span>
                  {/* Age is a column of the roster, not a suffix on every name:
                      the word belongs here once instead of two hundred and
                      fifty times down the list. */}
                  <span className="ml-auto w-8 text-right">Age</span>
                </div>
                <div className="ml-auto flex max-w-[34rem] flex-1 gap-1.5">
                  {meals.map((meal) => (
                    <button
                      key={meal.key}
                      type="button"
                      disabled={meal.key === 'att'}
                      onClick={() => toggleColumn(meal.key)}
                      title={meal.key === 'att' ? meal.label : `Toggle ${meal.label} for everyone present`}
                      className={cn(
                        'flex-1 rounded-sm py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground outline-none transition-colors',
                        meal.key !== 'att' && 'hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
                      )}
                    >
                      {meal.short}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-border">
                {visibleRoster.map((student) => (
                  <RosterRow
                    key={student.id}
                    student={student}
                    marks={marks.get(student.id) ?? EMPTY_MARKS}
                    meals={meals}
                    attention={attempted && markedCount === 0}
                    onToggle={toggle}
                  />
                ))}
              </div>

              {visibleRoster.length === 0 && (
                <EmptyState
                  title={query ? 'No student matches' : 'Everyone is marked'}
                  description={
                    query
                      ? `Nothing in this roster matches “${query.trim()}”.`
                      : 'Switch back to All to review the full roster.'
                  }
                  action={
                    <Button variant="outline" size="sm" onClick={() => { setQuery(''); setRosterFilter('all'); }}>
                      Show all students
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </section>

        {!correcting && (
          <section className="flex flex-col gap-2.5">
            <SectionLabel>Certification</SectionLabel>
            <SignatureField
              invalid={attempted && !signed}
              onChange={(getter) => {
                getSignature.current = getter;
                setSigned(Boolean(getter));
                if (getter) setDirty(true);
              }}
            />
          </section>
        )}

        {correcting && (
          <section className="flex flex-col gap-2.5 md:max-w-xl">
            <SectionLabel>Correction note</SectionLabel>
            <Input
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setDirty(true);
              }}
              placeholder="Why is this count being corrected?"
              maxLength={500}
            />
          </section>
        )}
      </div>

      {/* Submit bar: sits above the phone tab bar, inline from md up. */}
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-30 border-t px-4 py-3 glass-bar md:static md:mt-6 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {missing.length > 0 ? (
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground md:text-[13px]">
              <AlertCircle className={cn('h-4 w-4', attempted ? 'text-destructive' : 'text-muted-foreground')} />
              <span className={cn(attempted && 'text-destructive-text')}>
                Still missing: {missing.join(', ')}
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-success-text">
              <CircleCheck className="h-4 w-4" />
              Ready to submit
            </p>
          )}
          <Button
            onClick={submit}
            loading={submitting}
            size="touch"
            className={cn('md:w-72', !canSubmit && 'bg-muted text-muted-foreground hover:bg-muted')}
          >
            {correcting ? 'Save correction' : 'Submit meal count'}
          </Button>
        </div>
      </div>

      <UnsavedGuard
        enabled={dirty && !submitting}
        title="Leave without submitting this count?"
        description={
          markedCount > 0
            ? `${markedCount} ${markedCount === 1 ? 'student is' : 'students are'} marked and nothing has been sent yet.`
            : 'Nothing on this screen has been sent yet.'
        }
        consequences={[
          'The marks on this screen are lost.',
          'The day stays open, so the count can be taken again later.',
        ]}
      />
    </AppShell>
  );
}

function SectionLabel({ icon: Icon, children }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

function TimeField({ label, value, onChange, invalid, required }) {
  return (
    <label
      className={cn(
        'flex h-[60px] flex-col justify-center gap-0.5 rounded-md border bg-card px-3.5 transition-[border-color,box-shadow] duration-fast',
        'focus-within:border-primary focus-within:shadow-focus-primary',
        invalid ? 'border-destructive' : 'border-input'
      )}
    >
      <span
        className={cn(
          'text-[10px] font-semibold uppercase tracking-[0.06em]',
          invalid ? 'text-destructive-text' : 'text-muted-foreground'
        )}
      >
        {label}
        {required && ', required'}
      </span>
      <input
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent text-[16px] font-semibold tabular-nums text-foreground outline-none"
      />
    </label>
  );
}

export default function MealCountPage() {
  return (
    <Protected>
      <Suspense fallback={null}>
        <MealCountScreen />
      </Suspense>
    </Protected>
  );
}
