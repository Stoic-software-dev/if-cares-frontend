'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CloudOff, FileCheck2 } from 'lucide-react';
import { assignedSiteNames, useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { apiGet, isConnectionError } from '@/lib/api-client';
import { dateLabel, todayYmd } from '@/lib/calendar';
import { ALL_MEALS_PATH, MENUS_PATH, SITES_PATH, cachedGet, offlineGet } from '@/lib/data-cache';
import { menuFileUrl } from '@/lib/menu-files';
import {
  currentAccountId,
  offlineEligible,
  putOfflineCount,
  removeOfflineCount,
  useConnection,
  useOfflineCounts,
} from '@/lib/offline';
import { reviewOfflineCount } from '@/lib/offline-review.mjs';
import { shortSiteName } from '@/lib/sites';

// Offline mode for site users (STOIC-2771), as the frame of every screen sees
// it: the strip that says there is no connection, the warm-up that keeps a
// site user's data on the phone, and the sheet shown when the signal comes back
// with counts taken without it.

// The screens a site user opens without signal. The service worker keeps their
// pages and code; the data comes from lib/offline.
const OFFLINE_PAGES = ['/dashboard', '/meal-count', '/roster', '/menus', '/requests', '/login'];

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

// --- Warm-up -------------------------------------------------------------------

// Once per app load, and again every time the signal comes back.
let warmedFor = null;

// The calendar is the heaviest read in the app, and the screen, the warm-up and
// the sheet all want it at the same moment on opening: anything read in the
// last few seconds is shared rather than asked for again.
const FRESH_MS = 10_000;

async function warm(user) {
  const own = assignedSiteNames(user);
  const sites = own ?? ((await cachedGet(SITES_PATH, { maxAge: FRESH_MS })) ?? []).map((site) => site.name);
  await cachedGet(ALL_MEALS_PATH, { maxAge: FRESH_MS });

  for (const site of sites) {
    const name = encodeURIComponent(site);
    await Promise.all([
      offlineGet(`/api/students/roster?site=${name}`).catch(() => {}),
      offlineGet(`/api/sites/data?site=${name}`).catch(() => {}),
    ]);
  }

  // Last: the menus come from Drive and are the slowest read in the app, and a
  // phone that loses signal halfway should have the count's data first.
  const menus = await cachedGet(MENUS_PATH, { force: true }).catch(() => []);

  const worker = await navigator.serviceWorker?.ready;
  worker?.active?.postMessage({
    type: 'warm',
    pages: OFFLINE_PAGES,
    files: (Array.isArray(menus) ? menus : []).map((file) => menuFileUrl(file)),
  });
}

function useWarmUp(user) {
  const online = useOnline();
  useEffect(() => {
    if (!offlineEligible(user) || !online) return;
    if (warmedFor === user.id) return;
    warmedFor = user.id;
    warm(user).catch(() => {
      // Half warmed is fine: the next open with signal finishes it.
      warmedFor = null;
    });
  }, [user, online]);

  useEffect(() => {
    const reset = () => {
      warmedFor = null;
    };
    window.addEventListener('offline', reset);
    return () => window.removeEventListener('offline', reset);
  }, []);
}

// --- The strip -------------------------------------------------------------------

const savedStamp = (ms) => {
  const at = new Date(ms);
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (at.toDateString() === new Date().toDateString()) return `today at ${time}`;
  return `on ${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`;
};

function OfflineStrip() {
  const online = useOnline();
  const connection = useConnection();
  if (online && !connection.offline) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warning-border bg-warning-soft px-4 py-2 text-[12.5px] font-medium leading-snug text-warning-text md:justify-center"
    >
      <CloudOff className="h-4 w-4 shrink-0" />
      <span>
        No connection.
        {connection.savedAt ? ` Showing what was saved ${savedStamp(connection.savedAt)}.` : ''}
      </span>
    </div>
  );
}

// --- The sheet when the signal comes back -------------------------------------

// Cleared when the connection drops, so a count taken in the next stretch
// without signal is shown when it comes back. "Later" holds it until then, or
// until the app is opened again.
let reviewedThisLoad = false;

const MEAL_WORDS = { brk: 'breakfast', lunch: 'lunch', snk: 'snack', sup: 'supper' };
const listOf = (words) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0]);

const submittedStamp = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

async function reviewAll(records) {
  // Straight from the server: checked against what the phone kept, a count
  // would pass as fine on the very data it has to be checked against.
  const all = await apiGet(ALL_MEALS_PATH);
  const today = todayYmd();
  return Promise.all(records.map((record) => reviewOne(record, all, today)));
}

async function reviewOne(record, all, today) {
  const siteData = all?.[record.site];
  const name = encodeURIComponent(record.site);
  const [roster, filed] = siteData
    ? await Promise.all([
        apiGet(`/api/students/roster?site=${name}`),
        apiGet(`/api/meal-count-drafts?site=${name}&date=${record.date}`).catch((err) => {
          if (isConnectionError(err)) throw err;
          return { submitted: false };
        }),
      ])
    : [[], null];
  const review = reviewOfflineCount({ record, now: Date.now(), siteData, roster, filed, today });
  review.marked = record.markedIds?.length ?? 0;

  if (review.status === 'ready' && review.changed && record.signature) {
    putOfflineCount({ ...record, signature: null });
  }
  return review;
}

function ReviewItem({ review, onOpen }) {
  const where = `${dateLabel(review.date)}, ${shortSiteName(review.site)}`;
  const gone = {
    expired: 'It was not submitted within 7 days and was removed from this phone.',
    'site-gone': 'You no longer work this site, so it was removed from this phone.',
    submitted: `${review.submittedBy || 'Someone'} already submitted this day${review.submittedAt ? `, ${submittedStamp(review.submittedAt)}` : ''}. Yours was removed from this phone.`,
    future: 'This day has not happened yet. Check the date on this phone. It was removed.',
    closed: 'This day no longer has meal service, so it cannot be submitted. It was removed from this phone.',
  }[review.status];

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-start gap-2.5">
        {review.status === 'ready' ? (
          <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        ) : (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[14px] font-semibold text-foreground">{where}</span>
          {gone ? (
            <span className="text-[13px] leading-relaxed text-muted-foreground">{gone}</span>
          ) : (
            <span className="text-[13px] leading-relaxed text-muted-foreground">
              {review.marked} {review.marked === 1 ? 'student' : 'students'} marked. Not submitted yet.
            </span>
          )}
        </div>
      </div>

      {review.status === 'ready' && (review.newStudents.length > 0 || review.goneStudents.length > 0 || review.strippedMeals.length > 0) && (
        <ul className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground">
          {review.newStudents.length > 0 && (
            <li>
              New on the roster, not marked: <span className="break-words font-semibold">{listOf(review.newStudents)}</span>.
            </li>
          )}
          {review.goneStudents.length > 0 && (
            <li>
              No longer on the roster, their marks were taken off:{' '}
              <span className="break-words font-semibold">{listOf(review.goneStudents)}</span>.
            </li>
          )}
          {review.strippedMeals.length > 0 && (
            <li>
              This day no longer serves {listOf(review.strippedMeals.map((meal) => MEAL_WORDS[meal]))}, so those
              marks were taken off.
            </li>
          )}
          {review.changed && <li className="font-semibold">Sign the count again before submitting.</li>}
        </ul>
      )}

      {review.status === 'ready' && (
        <Button asChild size="sm" className="self-start">
          <Link
            href={`/meal-count?site=${encodeURIComponent(review.site)}&date=${review.date}`}
            onClick={onOpen}
          >
            Review and submit
          </Link>
        </Button>
      )}
    </li>
  );
}

// A count with nothing left to send goes once the person has read why: when
// the sheet closes. Closed by the app instead, the next open says it again.
function forgetFinished(reviews) {
  for (const review of reviews) {
    if (review.status === 'ready') continue;
    removeOfflineCount(review.site, review.date);
    try {
      localStorage.removeItem(`ifc.draft.${currentAccountId()}.${review.site}|${review.date}`);
    } catch {
      // Already unreachable.
    }
  }
}

function ReturnSheet() {
  const counts = useOfflineCounts();
  const online = useOnline();
  const connection = useConnection();
  const [reviews, setReviews] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const reset = () => {
      reviewedThisLoad = false;
    };
    window.addEventListener('offline', reset);
    return () => window.removeEventListener('offline', reset);
  }, []);

  useEffect(() => {
    if (reviewedThisLoad || !online || connection.offline || counts.length === 0) return;
    reviewedThisLoad = true;
    reviewAll(counts)
      .then((list) => {
        setReviews(list);
        setOpen(list.length > 0);
      })
      .catch(() => {
        // The signal dropped again on the way: next time it is back.
        reviewedThisLoad = false;
      });
  }, [counts, online, connection.offline]);

  const close = () => {
    setOpen(false);
    forgetFinished(reviews ?? []);
  };

  if (!reviews) return null;
  const ready = reviews.filter((review) => review.status === 'ready').length;

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <SheetContent side="right" className="w-full max-w-none gap-0 p-0 sm:w-[86%] sm:max-w-md">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle>{ready > 0 ? 'Counts taken without a connection' : 'Counts taken without a connection were removed'}</SheetTitle>
          <SheetDescription>
            {ready > 0
              ? 'Nothing was submitted. Check each one with the data as it is now, and submit it.'
              : 'Here is what happened to them.'}
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-5">
          {reviews.map((review) => (
            <ReviewItem key={`${review.site}|${review.date}`} review={review} onOpen={close} />
          ))}
        </ul>
        <div className="border-t border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <Button variant="outline" size="touch" className="w-full" onClick={close}>
            {ready > 0 ? 'Later' : 'Close'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Mounted once, beside the app rather than inside each screen's frame: a
// screen swaps its frame between loading and loaded, and the sheet would go
// with it.
export function OfflineLayer() {
  const { user } = useAuth();
  useWarmUp(user);
  if (!offlineEligible(user)) return null;
  return <ReturnSheet />;
}

export { OfflineStrip };
