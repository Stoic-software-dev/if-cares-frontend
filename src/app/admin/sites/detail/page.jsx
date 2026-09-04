'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CalendarRange,
  ExternalLink,
  FileText,
  FileUp,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
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
import SiteForm, { emptySite } from '@/components/sites/SiteForm';
import RosterImportDialog from '@/components/sites/RosterImportDialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ActionSheet, SheetAction } from '@/components/ui/mobile';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { apiPut } from '@/lib/api-client';
import {
  ALL_MEALS_PATH,
  SITES_PATH,
  SITE_STATES_PATH,
  cachedGet,
  invalidate,
  useCachedGet,
} from '@/lib/data-cache';
import { todayYmd } from '@/lib/calendar';
import { shortSiteName, siteState, siteYear } from '@/lib/sites';

// Canonical "HH:MM:SS" to "h:mm PM", the way the rest of the app shows times.
function timeLabel(canonical) {
  if (!canonical) return '';
  const [h, m] = canonical.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE' });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.result === 'error') {
    throw new Error(body?.message || `Request failed (${res.status})`);
  }
  return body;
}

function StudentDialog({ open, mode, initial, site, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setAge(initial?.age === null || initial?.age === undefined ? '' : String(initial.age));
    setAttempted(false);
  }, [open, initial]);

  const nameValid = name.trim().length > 1;
  // Age is not optional in practice: the API needs an age or a birthdate, and
  // this dialog never collects a birthdate. Saying "Optional" and then refusing
  // to save was the worst of both.
  const ageValid = age !== '' && Number(age) >= 0 && Number(age) <= 120;

  const save = async () => {
    if (!nameValid || !ageValid) {
      setAttempted(true);
      return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        await apiPost('/api/students', { name: name.trim(), age: age === '' ? undefined : Number(age), site });
        toast.success(`${name.trim()} added to the roster`);
      } else {
        await apiPatch(`/api/students/${initial.id}`, {
          name: name.trim(),
          age: age === '' ? undefined : Number(age),
          site,
        });
        toast.success('Student updated');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add student' : 'Edit student'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'The roster renumbers itself alphabetically, the same way the current app does.'
              : 'Counts already submitted keep the name they were submitted with.'}
          </DialogDescription>
        </DialogHeader>

        <Field
          label="Full name"
          htmlFor="student-name"
          error={attempted && !nameValid ? 'Enter the full name.' : undefined}
        >
          <Input
            id="student-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Last, First"
            aria-invalid={attempted && !nameValid}
          />
        </Field>

        <Field
          label="Age"
          htmlFor="student-age"
          hint="Used to group the roster by age."
          error={attempted && !ageValid ? 'Use an age between 0 and 120.' : undefined}
        >
          <Input
            id="student-age"
            type="number"
            min="0"
            max="120"
            inputMode="numeric"
            value={age}
            onChange={(event) => setAge(event.target.value)}
            aria-invalid={attempted && !ageValid}
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {mode === 'create' ? 'Add to roster' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SiteDetailScreen() {
  const site = useSearchParams().get('site') ?? '';
  const today = todayYmd();
  const monthPrefix = today.slice(0, 7);

  const [info, setInfo] = useState(null);
  const [roster, setRoster] = useState(null);
  const [meals, setMeals] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState(null);

  const loadRoster = () =>
    apiGet(`/api/students/roster?site=${encodeURIComponent(site)}`).then(setRoster);

  const load = () => {
    setError('');
    Promise.all([
      apiGet(`/api/sites/data?site=${encodeURIComponent(site)}`),
      loadRoster(),
      cachedGet(ALL_MEALS_PATH),
    ])
      .then(([siteInfo, , allMeals]) => {
        setInfo(siteInfo);
        setMeals(allMeals?.[site] ?? null);
      })
      .catch((err) => setError(err.message));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [site]);

  // The site record itself, which the roster view never needed until now.
  const [record, setRecord] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emptySite);
  const [attempted, setAttempted] = useState(false);
  const [savingSite, setSavingSite] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadRecord = useCallback(() => {
    if (!site) return;
    apiGet(`/api/sites/record?site=${encodeURIComponent(site)}`)
      .then((res) => setRecord(res.data))
      .catch(() => {});
  }, [site]);

  useEffect(loadRecord, [loadRecord]);

  const openEditor = () => {
    if (!record) return;
    setDraft({
      name: record.name,
      state: record.state ?? '',
      ceName: record.ceName ?? '',
      ceId: record.ceId ?? '',
      siteName: record.siteName ?? '',
      siteNumber: record.siteNumber ?? '',
      programStart: record.programStart ?? '',
      programEnd: record.programEnd ?? '',
      reminderStart: record.reminderStart ?? '',
      reminderEnd: record.reminderEnd ?? '',
      weeklyTemplate: record.weeklyTemplate ?? {},
    });
    setAttempted(false);
    setEditing(true);
  };

  const saveSite = async () => {
    if (draft.name.trim().length < 3) {
      setAttempted(true);
      return;
    }
    setSavingSite(true);
    const renamed = draft.name.trim() !== record.name;
    try {
      await apiPatch(`/api/sites/${record.id}`, { ...draft, name: draft.name.trim() });
      invalidate(SITES_PATH);
      invalidate(ALL_MEALS_PATH);
      setEditing(false);
      toast.success('Site saved');
      // The name is in the URL of this very screen, so a rename has to move.
      if (renamed) {
        window.location.replace(`/admin/sites/detail?site=${encodeURIComponent(draft.name.trim())}`);
      } else {
        // Both, not just one: `record` feeds the edit dialog, `info` paints the
        // Program details panel. Refreshing only the first left the admin looking
        // at the old values right after a save that did work.
        loadRecord();
        load();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingSite(false);
    }
  };

  const generateDays = async () => {
    setGenerating(true);
    // Generating a cycle writes a couple of hundred rows and is reached from
    // the menu, which is gone the moment it is clicked.
    const pending = toast.loading('Generating the service days');
    try {
      const res = await apiPut(`/api/sites/${record.id}`, {});
      invalidate(ALL_MEALS_PATH);
      loadRecord();
      toast.success(
        res.added
          ? `${res.added} service ${res.added === 1 ? 'day' : 'days'} added`
          : 'The calendar already matches the cycle',
        { id: pending }
      );
    } catch (err) {
      toast.error(err.message, { id: pending });
    } finally {
      setGenerating(false);
    }
  };

  const setActive = async (active) => {
    setDeactivating(true);
    try {
      await apiPatch(`/api/sites/${record.id}`, { active });
      invalidate(SITES_PATH);
      loadRecord();
      toast.success(active ? 'Site reactivated' : 'Site deactivated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeactivating(false);
    }
  };


  const stateList = useCachedGet(SITE_STATES_PATH);
  const siteStates = useMemo(() => stateList.data?.data?.states ?? [], [stateList.data]);

  const stats = useMemo(() => {
    const submitted = (meals?.excludedDates ?? []).filter((ymd) => ymd.startsWith(monthPrefix)).length;
    let missing = 0;
    let upcoming = 0;
    for (const ymd of Object.keys(meals?.validDates ?? {})) {
      if (!ymd.startsWith(monthPrefix)) continue;
      if (ymd < today) missing += 1;
      else upcoming += 1;
    }
    return { submitted, missing, upcoming };
  }, [meals, monthPrefix, today]);

  const visibleRoster = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!roster) return [];
    if (!q) return roster;
    return roster.filter((student) => student.name.toLowerCase().includes(q) || String(student.number) === q);
  }, [roster, query]);

  if (!site) {
    return (
      <AppShell>
        <ErrorState title="No site selected" message="Open a site from the list." />
      </AppShell>
    );
  }

  // Sites with no year or state prefix have nothing to add under the title, and
  // repeating the name as a subtitle reads as a bug.
  const subtitle = [siteState(site), siteYear(site)].filter(Boolean).join(', ') || undefined;

  // The same three destinations the buttons carry, named once so the phone's
  // sheet and the desk's buttons cannot drift apart.
  const dashboardHref = `/dashboard?site=${encodeURIComponent(site)}`;
  const calendarHref = `/admin/calendar?site=${encodeURIComponent(site)}`;
  const reportsHref = `/admin/reports?site=${encodeURIComponent(site)}`;

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-5">
        <PageHeader
          title={shortSiteName(site)}
          subtitle={subtitle}
          backHref="/admin/sites"
          backLabel="All sites"
          mobileActions={
            <ActionSheet title={shortSiteName(site)}>
              <SheetAction icon={ExternalLink} href={dashboardHref}>
                Open dashboard
              </SheetAction>
              <SheetAction icon={CalendarRange} href={calendarHref} hint="Service days and meals">
                Calendar
              </SheetAction>
              <SheetAction icon={FileText} href={reportsHref} hint="Daily forms and the month summary">
                Reports
              </SheetAction>
              {record && (
                <>
                  <SheetAction icon={Pencil} onSelect={openEditor}>
                    Edit site
                  </SheetAction>
                  <SheetAction icon={CalendarRange} onSelect={generateDays} disabled={generating}>
                    Generate missing days
                  </SheetAction>
                  <SheetAction
                    icon={Power}
                    destructive={record.active}
                    disabled={deactivating}
                    onSelect={() => (record.active ? setConfirmDeactivate(true) : setActive(true))}
                  >
                    {record.active ? 'Deactivate site' : 'Reactivate site'}
                  </SheetAction>
                </>
              )}
            </ActionSheet>
          }
          actions={
            <>
              <Button variant="outline" asChild>
                <Link href={`/admin/calendar?site=${encodeURIComponent(site)}`}>
                  <CalendarRange />
                  Calendar
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/admin/reports?site=${encodeURIComponent(site)}`}>
                  <FileText />
                  Reports
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/dashboard?site=${encodeURIComponent(site)}`}>
                  <ExternalLink />
                  Open dashboard
                </Link>
              </Button>
              {record && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Site actions">
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={openEditor}>
                      <Pencil />
                      Edit site
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={generateDays} disabled={generating}>
                      <CalendarRange />
                      Generate missing days
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      destructive={record.active}
                      onClick={() => (record.active ? setConfirmDeactivate(true) : setActive(true))}
                      disabled={deactivating}
                    >
                      <Power />
                      {record.active ? 'Deactivate site' : 'Reactivate site'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          }
        />

        {error && <ErrorState title="Couldn't load this site" message={error} onRetry={load} />}

        {!error && (
          <Tabs defaultValue="overview" className="flex flex-col gap-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="roster">
                Roster
                {roster && (
                  <span className="rounded-full bg-border/70 px-1.5 py-px text-[10.5px] font-semibold tabular-nums text-muted-foreground">
                    {roster.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="flex flex-col gap-4">
              {/* Three numbers are a row, not a column: stacked full width they
                  were two hundred and forty pixels of phone to say 1, 2 and 0. */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {meals === null ? (
                  Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[76px] rounded-lg sm:h-[86px]" />)
                ) : (
                  <>
                    <Stat label="Submitted this month" short="Submitted" value={stats.submitted} tone="success" />
                    <Stat
                      label="Missing this month"
                      short="Missing"
                      value={stats.missing}
                      tone={stats.missing ? 'danger' : 'neutral'}
                    />
                    <Stat label="Remaining" short="Ahead" value={stats.upcoming} tone="neutral" />
                  </>
                )}
              </div>

              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-[14px] font-semibold text-foreground">Program details</h2>
                </div>
                {!info ? (
                  <div className="p-4">
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : (
                  <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
                    <Detail label="Full site name" value={site} wide />
                    <Detail label="Contracting entity" value={info.name} />
                    <Detail label="CE id" value={info.ceId} />
                    <Detail label="Site name on file" value={info.siteName} />
                    <Detail label="Site number" value={info.siteNumber} />
                    <Detail
                      label="Last service time"
                      value={
                        [timeLabel(info.lastTimeIn), timeLabel(info.lastTimeOut)].filter(Boolean).join(' to ') ||
                        'No count yet'
                      }
                    />
                  </dl>
                )}
              </div>
            </TabsContent>

            <TabsContent value="roster" className="flex flex-col gap-3">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <SearchInput value={query} onChange={setQuery} placeholder="Find a student" className="sm:w-80" />
                <Button variant="outline" className="sm:ml-auto" onClick={() => setImporting(true)}>
                  <FileUp strokeWidth={2.2} />
                  Import roster
                </Button>
                <Button onClick={() => setDialog({ mode: 'create' })}>
                  <Plus strokeWidth={2.4} />
                  Add student
                </Button>
              </div>

              {!roster && (
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: 8 }, (_, i) => (
                    <Skeleton key={i} className="h-12 rounded-md" />
                  ))}
                </div>
              )}

              {roster && (
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="divide-y divide-border">
                    {visibleRoster.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/30"
                      >
                        <span className="w-7 shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
                          {student.number}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">
                          {student.name}
                        </span>
                        {student.age !== '' && (
                          <Badge size="sm" variant="neutral">
                            Age {student.age}
                          </Badge>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${student.name}`}>
                              <MoreVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setDialog({ mode: 'edit', initial: student })}>
                              <Pencil />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onClick={() => setRemoving(student)}>
                              <Trash2 />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>

                  {visibleRoster.length === 0 && (
                    <EmptyState
                      icon={Users}
                      title={roster.length === 0 ? 'The roster is empty' : 'No student matches'}
                      description={
                        roster.length === 0
                          ? 'Add students one by one with the button above.'
                          : `Nothing matches “${query.trim()}”.`
                      }
                      action={
                        roster.length === 0 ? (
                          <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
                            <Plus />
                            Add the first student
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                            Clear search
                          </Button>
                        )
                      }
                    />
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <StudentDialog
        open={Boolean(dialog)}
        mode={dialog?.mode}
        initial={dialog?.initial}
        site={site}
        onClose={() => setDialog(null)}
        onSaved={loadRoster}
      />

      <RosterImportDialog
        open={importing}
        site={site}
        onClose={() => setImporting(false)}
        onImported={loadRoster}
      />

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit site</DialogTitle>
            <DialogDescription>
              Renaming is safe: counts, roster and assignments point at the site itself, not at its name.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <SiteForm
              value={draft}
              onChange={setDraft}
              attempted={attempted}
              mode="edit"
              states={siteStates}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={savingSite}>
              Cancel
            </Button>
            <Button onClick={saveSite} loading={savingSite}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title={`Deactivate ${shortSiteName(site)}?`}
        description="The site stops being part of the program: it leaves the dashboard, the calendars and every claim."
        consequences={[
          'Nothing is deleted. The roster, the calendar and every count filed stay exactly as they are.',
          'It comes back from this same screen, or from Show deactivated on the sites list.',
        ]}
        confirmLabel="Deactivate site"
        onConfirm={() => setActive(false)}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''} from the roster?`}
        description="This deletes the student. There is no undo, and no list of removed students to restore from."
        consequences={[
          'Counts already submitted keep this student exactly as they were filed.',
          'The roster renumbers itself alphabetically afterwards.',
          'Adding them back later means typing them in again, as a new student.',
        ]}
        confirmLabel="Remove student"
        onConfirm={async () => {
          await apiDelete(`/api/students/${removing.id}`);
          await loadRoster();
          toast.success(`${removing.name} removed`);
          setRemoving(null);
        }}
      />
    </AppShell>
  );
}

function Stat({ label, short, value, tone }) {
  const tones = {
    success: 'text-success-text',
    danger: 'text-destructive-text',
    neutral: 'text-foreground',
  };
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 sm:p-4">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground sm:text-[11px] sm:tracking-[0.06em]">
        {/* A column a third of a phone wide cannot hold "Submitted this month"
            without going to three lines. The site and the month are already on
            the screen, so one word carries it. */}
        <span className="sm:hidden">{short ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
      <span className={`text-[22px] font-bold leading-none tabular-nums sm:text-[26px] ${tones[tone]}`}>
        {value}
      </span>
    </div>
  );
}

function Detail({ label, value, wide }) {
  return (
    <div className={`flex flex-col gap-0.5 px-4 py-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</dt>
      <dd className="truncate text-[13.5px] text-foreground">{value || 'Not on file'}</dd>
    </div>
  );
}

export default function SiteDetailPage() {
  return (
    <Protected adminOnly>
      <Suspense fallback={null}>
        <SiteDetailScreen />
      </Suspense>
    </Protected>
  );
}
