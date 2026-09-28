'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CalendarRange,
  ExternalLink,
  FileText,
  MoreVertical,
  Pencil,
  Power,
} from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
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
import RosterManager from '@/components/sites/RosterManager';
import { ActionSheet, SheetAction } from '@/components/ui/mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/ui/states';
import { apiGet, apiPatch } from '@/lib/api-client';
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

function SiteDetailScreen() {
  const site = useSearchParams().get('site') ?? '';
  const today = todayYmd();
  const monthPrefix = today.slice(0, 7);

  const [info, setInfo] = useState(null);
  const [roster, setRoster] = useState(null);
  const [meals, setMeals] = useState(null);
  const [error, setError] = useState('');

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
      // The count added on its own is not checkable: "18 days added" on a cycle
      // that asks for 22 reads exactly like a generator that dropped four, when
      // the other four were already on the calendar. Saying both numbers when
      // they differ turns it back into something an administrator can verify.
      toast.success(
        res.added
          ? `${res.added} service ${res.added === 1 ? 'day' : 'days'} added`
          : 'The calendar already matches the cycle',
        {
          id: pending,
          description:
            res.added && res.expected && res.added !== res.expected
              ? `The cycle covers ${res.expected} service days; the other ${res.expected - res.added} were already there.`
              : undefined,
        }
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
              <SheetAction icon={FileText} href={reportsHref} hint="Daily forms, and the month as one bundle">
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
              {/* Every one of these opens another screen for THIS site, so when
                  the site could not be loaded they lead nowhere - three live
                  buttons above the words "Site not found", each one a trip to a
                  second empty screen. */}
              {!error && (
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
                </>
              )}
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
                    {/* The four fields the site form writes and this panel did
                        not read back. The state decides which claim the site
                        appears in, the cycle is what generates the calendar,
                        and the reminder window decides whether the site is
                        chased at all - each of them invisible here, which is
                        how a site ends up with an empty state column or a
                        window that closed a year ago and nobody notices. */}
                    <Detail label="Files under" value={record?.state} />
                    <Detail
                      label="Program cycle"
                      value={rangeLabel(record?.programStart, record?.programEnd)}
                    />
                    <Detail
                      label="Reminder window"
                      value={rangeLabel(record?.reminderStart, record?.reminderEnd, 'Always on')}
                    />
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

            <TabsContent value="roster">
              <RosterManager site={site} roster={roster} onChanged={loadRoster} />
            </TabsContent>
          </Tabs>
        )}
      </div>

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

// A from/to pair as one line. Half a range is still worth showing: a cycle with
// a start and no end is exactly the state that stops the calendar generating.
function rangeLabel(from, to, empty = '') {
  if (!from && !to) return empty;
  if (from && to) return `${from} to ${to}`;
  return from ? `From ${from}` : `Until ${to}`;
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
