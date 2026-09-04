'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download, FileText, Layers, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { SiteSwitcher } from '@/components/shell/SiteSwitcher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActionSheet, Fab, SheetAction } from '@/components/ui/mobile';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import EmailPdfDialog from '@/components/reports/EmailPdfDialog';
import { ALL_MEALS_PATH, SITES_PATH, useCachedGet } from '@/lib/data-cache';
import { dateLabel, monthLabel, todayYmd } from '@/lib/calendar';
import { shortSiteName, sortSiteNames } from '@/lib/sites';

async function fetchPdf(site, date) {
  const res = await fetch(`/api/meal-counts/pdf?site=${encodeURIComponent(site)}&date=${date}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `PDF export failed for ${date}`);
  }
  return res.blob();
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ReportsScreen() {
  const siteFromUrl = useSearchParams().get('site');
  const today = todayYmd();

  const [site, setSite] = useState('');
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [busyDate, setBusyDate] = useState('');
  const [bulk, setBulk] = useState(null);
  const [emailing, setEmailing] = useState(false);

  const siteList = useCachedGet(SITES_PATH);
  const mealList = useCachedGet(ALL_MEALS_PATH);
  const allMeals = mealList.data;
  const error = siteList.error || mealList.error;

  const sites = useMemo(
    () => (siteList.data ? sortSiteNames(siteList.data.map((entry) => entry.name)) : null),
    [siteList.data]
  );

  useEffect(() => {
    if (!sites || sites.length === 0) return;
    setSite((current) => {
      if (current && sites.includes(current)) return current;
      return siteFromUrl && sites.includes(siteFromUrl) ? siteFromUrl : sites[0];
    });
  }, [sites, siteFromUrl]);

  const load = () => {
    siteList.refresh();
    mealList.refresh();
  };

  const prefix = `${cursor.year}-${String(cursor.month).padStart(2, '0')}`;
  const siteData = allMeals?.[site];

  const submitted = useMemo(
    () => (siteData?.excludedDates ?? []).filter((ymd) => ymd.startsWith(prefix)).sort(),
    [siteData, prefix]
  );

  const open = useMemo(
    () => Object.keys(siteData?.validDates ?? {}).filter((ymd) => ymd.startsWith(prefix)).sort(),
    [siteData, prefix]
  );

  const missing = open.filter((ymd) => ymd < today);
  const total = submitted.length + open.length;

  const step = (delta) => {
    setCursor((prev) => {
      const month = prev.month + delta;
      if (month < 1) return { year: prev.year - 1, month: 12 };
      if (month > 12) return { year: prev.year + 1, month: 1 };
      return { ...prev, month };
    });
  };

  const downloadOne = async (date) => {
    setBusyDate(date);
    try {
      const blob = await fetchPdf(site, date);
      saveBlob(blob, `MealCount_${site.replace(/[^\w-]+/g, '_')}_${date}.pdf`);
      toast.success(`Downloaded the form for ${dateLabel(date, { month: 'long', day: 'numeric' })}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyDate('');
    }
  };

  // One request at a time: 20+ parallel PDF renders would hammer the server and
  // the browser blocks the burst of downloads anyway.
  const downloadMonth = async () => {
    setBulk({ done: 0, total: submitted.length });
    let failures = 0;
    for (const date of submitted) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const blob = await fetchPdf(site, date);
        saveBlob(blob, `MealCount_${site.replace(/[^\w-]+/g, '_')}_${date}.pdf`);
      } catch {
        failures += 1;
      }
      setBulk((prev) => ({ ...prev, done: prev.done + 1 }));
    }
    setBulk(null);
    // Chrome asks for permission the first time a page saves several files in a
    // row, and silently drops the rest until it is granted. Say so, instead of
    // leaving the admin wondering where the other forms went.
    if (failures === 0) {
      toast.success(`Downloaded ${submitted.length} forms`, {
        description: 'If only the first one was saved, allow multiple downloads for this site in the browser.',
      });
    } else {
      toast.warning(`Downloaded ${submitted.length - failures} forms, ${failures} failed`);
    }
  };

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Reports"
          subtitle="Daily meal count forms, the month summary for a site, and the consolidated claims."
          mobileActions={
            <ActionSheet title="Reports" description={site ? shortSiteName(site) : undefined}>
              <SheetAction icon={Layers} href="/admin/reports/consolidated" hint="Every site in one claim">
                Consolidated claims
              </SheetAction>
              {site && (
                <SheetAction
                  icon={FileText}
                  plain
                  href={`/api/reports/monthly?site=${encodeURIComponent(site)}&year=${cursor.year}&month=${cursor.month}`}
                  hint={`${monthLabel(cursor.year, cursor.month)} ${cursor.year}`}
                >
                  Monthly summary
                </SheetAction>
              )}
              {site && submitted.length > 0 && (
                <SheetAction icon={Send} onSelect={() => setEmailing(true)}>
                  Email the summary
                </SheetAction>
              )}
            </ActionSheet>
          }
          actions={
            <>
              <Button variant="outline" asChild>
                <Link href="/admin/reports/consolidated">
                  <Layers />
                  Consolidated claims
                </Link>
              </Button>
              {site && (
                <Button variant="outline" asChild>
                  <a
                    href={`/api/reports/monthly?site=${encodeURIComponent(site)}&year=${cursor.year}&month=${cursor.month}`}
                  >
                    <FileText />
                    Monthly summary
                  </a>
                </Button>
              )}
              {site && submitted.length > 0 && (
                <Button variant="outline" onClick={() => setEmailing(true)}>
                  <Send />
                  Email the summary
                </Button>
              )}
              {submitted.length > 0 && (
                <Button onClick={downloadMonth} loading={Boolean(bulk)}>
                  {!bulk && <Download />}
                  {bulk ? `Downloading ${bulk.done} of ${bulk.total}` : `Download the month (${submitted.length})`}
                </Button>
              )}
            </>
          }
        />

        {sites && (
          <div className="flex flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center md:justify-between">
            <SiteSwitcher sites={sites} value={site} onChange={setSite} className="md:w-auto md:max-w-[26rem]" />
            {/* On a phone the month is a strip the width of the screen, so
                stepping through it is a thumb tap and not a 32px target
                floating at the left edge. */}
            <div className="flex items-center gap-2 rounded-md border border-border bg-card p-1 md:border-0 md:bg-transparent md:p-0">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous month"
                onClick={() => step(-1)}
                className="h-11 w-11 shrink-0 md:h-9 md:w-9"
              >
                <ChevronLeft />
              </Button>
              <span className="flex-1 text-center text-[15px] font-bold tabular-nums text-foreground md:min-w-[9rem] md:flex-none">
                {monthLabel(cursor.year, cursor.month)} {cursor.year}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next month"
                onClick={() => step(1)}
                className="h-11 w-11 shrink-0 md:h-9 md:w-9"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}

        {bulk && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
            <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Preparing the forms one by one. Keep this tab open.
            </span>
            <Progress value={(bulk.done / Math.max(1, bulk.total)) * 100} label="Download progress" />
          </div>
        )}

        {error && <ErrorState title="Couldn't load the reports" message={error} onRetry={load} />}

        {!allMeals && !error && <Skeleton className="h-80 w-full rounded-lg" />}

        {allMeals && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Summary label="Submitted" value={submitted.length} />
              <Summary label="Missing" value={missing.length} tone={missing.length ? 'danger' : 'neutral'} />
              <Summary label="Service days" value={total} />
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="hidden grid-cols-[minmax(0,1fr)_120px_200px] gap-4 border-b border-border bg-surface-sunken px-4 py-2 sm:grid">
                {['Day', 'Status', ''].map((heading, index) => (
                  <span
                    key={heading || index}
                    className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                  >
                    {heading}
                  </span>
                ))}
              </div>

              <div className="divide-y divide-border">
                {submitted.map((date) => (
                  <div
                    key={date}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/30 sm:grid sm:grid-cols-[minmax(0,1fr)_120px_200px] sm:items-center sm:gap-4"
                  >
                    {/* `sm:contents` dissolves this wrapper back into the grid:
                        a phone reads the day and its state as one block with the
                        actions beside it, a desk reads them as columns. */}
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:contents">
                      <span className="text-[13.5px] font-semibold text-foreground">{dateLabel(date)}</span>
                      <Badge variant="success">Submitted</Badge>
                    </span>
                    <div className="flex shrink-0 gap-2 sm:justify-end">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/counts/${date}?site=${encodeURIComponent(site)}`}>View</Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        loading={busyDate === date}
                        onClick={() => downloadOne(date)}
                      >
                        {busyDate !== date && <Download />}
                        PDF
                      </Button>
                    </div>
                  </div>
                ))}

                {missing.map((date) => (
                  <div
                    key={date}
                    className="flex items-center gap-3 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_120px_200px] sm:items-center sm:gap-4"
                  >
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:contents">
                      <span className="text-[13.5px] font-medium text-muted-foreground">{dateLabel(date)}</span>
                      <Badge variant="danger">Missing</Badge>
                    </span>
                    <div className="flex shrink-0 sm:justify-end">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/meal-count?date=${date}&site=${encodeURIComponent(site)}`}>
                          Submit the count
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {submitted.length === 0 && missing.length === 0 && (
                <EmptyState
                  icon={FileText}
                  title="Nothing filed this month"
                  description="Pick another month, or another site, to find its daily forms."
                />
              )}
            </div>

          </>
        )}
      </div>

      {submitted.length > 0 && (
        <Fab icon={Download} onClick={downloadMonth}>
          {bulk ? `${bulk.done} of ${bulk.total}` : `Download ${submitted.length}`}
        </Fab>
      )}

      <EmailPdfDialog
        open={emailing}
        onClose={() => setEmailing(false)}
        kind="monthly"
        site={site}
        year={cursor.year}
        month={cursor.month}
        label={`The ${monthLabel(cursor.year, cursor.month)} summary for ${shortSiteName(site ?? '')}`}
      />
    </AppShell>
  );
}

function Summary({ label, value, tone = 'neutral' }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 sm:p-4">
      {/* A third of a phone is 79px of usable width: at the desk's tracking
          "Service days" wrapped and left one card taller than its neighbours. */}
      <span className="text-[10.5px] font-semibold uppercase tracking-normal text-muted-foreground sm:text-[11px] sm:tracking-[0.06em]">
        {label}
      </span>
      <span
        className={`text-[22px] font-bold leading-none tabular-nums sm:text-[24px] ${
          tone === 'danger' ? 'text-destructive-text' : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <Protected adminOnly>
      <Suspense fallback={null}>
        <ReportsScreen />
      </Suspense>
    </Protected>
  );
}
