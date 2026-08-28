'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { SiteSwitcher } from '@/components/shell/SiteSwitcher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
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
          subtitle="Daily meal count forms, exactly as they are filed."
          actions={
            submitted.length > 0 && (
              <Button onClick={downloadMonth} loading={Boolean(bulk)}>
                {!bulk && <Download />}
                {bulk ? `Downloading ${bulk.done} of ${bulk.total}` : `Download the month (${submitted.length})`}
              </Button>
            )
          }
        />

        {sites && (
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <SiteSwitcher sites={sites} value={site} onChange={setSite} className="lg:w-[26rem]" />
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
                    className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/30 sm:grid sm:grid-cols-[minmax(0,1fr)_120px_200px] sm:items-center sm:gap-4"
                  >
                    <span className="text-[13.5px] font-semibold text-foreground">{dateLabel(date)}</span>
                    <Badge variant="success">Submitted</Badge>
                    <div className="flex gap-2 sm:justify-end">
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
                    className="flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_120px_200px] sm:items-center sm:gap-4"
                  >
                    <span className="text-[13.5px] font-medium text-muted-foreground">{dateLabel(date)}</span>
                    <Badge variant="danger">Missing</Badge>
                    <div className="flex sm:justify-end">
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

            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Monthly and consolidated reports, saving to storage, emailing and the signature step are the
              reports module (SPECS.md 11.2). Daily forms are live today and come out of the same data.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Summary({ label, value, tone = 'neutral' }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <span
        className={`text-[24px] font-bold leading-none tabular-nums ${
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
